#!/usr/bin/env python3
"""Reproducible Job-B root and H=2 m frozen-FV boundary qualification."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / ".agents/outputs/job-b-boundary-branch"
INPUT = OUTPUT / "frozen-input.json"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
GATE = 1e-7


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def load_worker():
    runtime = ROOT / "dist/job-b-interface-runtime"
    os.environ.update({
        "JOB_B_INTERFACE_PROTOCOL": "ECR_JOB_B_INTERFACE_V1",
        "JOB_B_INTERFACE_RUNTIME_ROOT": str(runtime),
        "STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL":
            "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1",
        "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT":
            str(ROOT / "dist/stage4-seven-component-adapter-runtime"),
        "STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT":
            str(ROOT / "dist/predictive-nt-runtime-7c-1-5"),
    })
    path = runtime / "server/ecr-pre-pilot/job-b-interface/worker.py"
    spec = importlib.util.spec_from_file_location("qualified_job_b", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    source = json.loads(INPUT.read_text())
    canonical_job_b = json.loads((OUTPUT / "canonical-job-b.json").read_text())
    continuation = json.loads(
        (OUTPUT / "h2-continuation-diagnostic.json").read_text())
    request = source["workerRequest"]
    job_b = load_worker()
    temporary, engine, integrity, runtime = engine_tuple = (
        job_b.scientific.build_engine(request["temperatureK"], 0.0)
    )
    np, scipy, gates = engine.np, engine.scipy, engine.gates
    try:
        feed_c = np.asarray(request["continuousFeedMolS"], dtype=float)
        feed_d = np.asarray(request["dispersedFeedMolS"], dtype=float)
        xb_c, xb_d = feed_c / feed_c.sum(), feed_d / feed_d.sum()
        kcct = np.asarray(request["kc"]) * request["continuousTotalConcentrationMolM3"]
        kdct = np.asarray(request["kd"]) * request["dispersedTotalConcentrationMolM3"]
        flux_scale = np.maximum(np.maximum(kcct, kdct), 1e-12)
        total_bound = float(2 * np.sum(kcct + kdct))

        def softmax(z):
            y = np.r_[z, 0.0]
            y -= np.max(y)
            e = np.exp(y)
            return e / e.sum()

        def logits(x):
            safe = np.maximum(np.asarray(x), 1e-14)
            safe /= safe.sum()
            return np.log(safe[:-1] / safe[-1])

        def evaluate(u):
            xi_c, xi_d, n = softmax(u[:6]), softmax(u[6:12]), float(u[12])
            mu = engine.mu(xi_c, request["temperatureK"]) - engine.mu(
                xi_d, request["temperatureK"])
            raw_c, raw_d = kcct * (xb_c - xi_c), kdct * (xi_d - xb_d)
            jc, jd = raw_c - xi_c * raw_c.sum(), raw_d - xi_d * raw_d.sum()
            nc, nd = jc + xi_c * n, jd + xi_d * n
            return np.r_[mu, (nc - nd)[:6] / flux_scale[:6]], (
                xi_c, xi_d, n, jc, jd, nc, nd)

        nmp = np.asarray((.01, .01, .01, .005, .005, .88, .08))
        rrbo = np.asarray((.72, .12, .06, .025, .015, .05, .01))
        uniform = np.full(7, 1 / 7)
        seeds = [
            ("oriented", nmp, rrbo), ("swapped", rrbo, nmp),
            ("bulks", xb_c, xb_d), ("bulk-swapped", xb_d, xb_c),
            ("uniform", uniform, uniform),
        ]
        rng = np.random.default_rng(2610709)
        for index in range(8):
            alpha_c = 10 ** rng.uniform(-1.5, 1.5, 7)
            alpha_d = 10 ** rng.uniform(-1.5, 1.5, 7)
            seeds.append((
                f"dirichlet-{index:03d}",
                rng.dirichlet(alpha_c), rng.dirichlet(alpha_d),
            ))

        lower, upper = np.r_[np.full(12, -35.), -total_bound], np.r_[
            np.full(12, 35.), total_bound]
        roots, candidate_roots, attempts = [], [], []
        for label, seed_c, seed_d in seeds:
            fit = scipy.optimize.least_squares(
                lambda u: evaluate(u)[0],
                np.r_[logits(seed_c), logits(seed_d), 0.0],
                bounds=(lower, upper), method="trf", jac="2-point",
                max_nfev=800, xtol=1e-11, ftol=1e-11, gtol=1e-11,
                x_scale="jac",
            )
            residual, values = evaluate(fit.x)
            xi_c, xi_d, n, jc, jd, nc, nd = values
            mu_max = float(np.max(np.abs(residual[:7])))
            flux_max = float(np.max(np.abs(residual[7:])))
            singular = np.linalg.svd(fit.jac, compute_uv=False)
            rank_tolerance = (
                max(fit.jac.shape) * np.finfo(float).eps * singular[0]
                if len(singular) and singular[0] > 0 else math.inf)
            rank = int(np.sum(singular > rank_tolerance))
            candidate_accepted = bool(
                fit.success and mu_max <= GATE
                and flux_max <= GATE)
            accepted = bool(
                candidate_accepted
                and flux_max <= job_b.MAX_SCALED_FLUX_RESIDUAL)
            attempts.append({
                "seed": label, "optimizerSuccess": bool(fit.success),
                "functionEvaluations": int(fit.nfev),
                "numericalJacobianRank": rank,
                "maximumIsoactivityLogResidual": mu_max,
                "maximumScaledFluxEqualityResidual": flux_max,
                "exploratoryCandidateAccepted": candidate_accepted,
                "numericallyAccepted": accepted,
            })
            state = np.r_[xi_c, xi_d, n]
            if candidate_accepted:
                candidate_match = next((
                    root for root in candidate_roots if np.max(
                        np.abs(state - root["state"]) /
                        np.maximum(np.maximum(
                            np.abs(state), np.abs(root["state"])), 1.0)
                    ) <= gates["multistartProductRelativeTolerance"]
                ), None)
                if candidate_match is None:
                    candidate_match = {
                        "state": state, "reproductions": [],
                        "values": values,
                        "numericalJacobianRank": rank,
                        "maximumIsoactivityLogResidual": mu_max,
                        "maximumScaledFluxEqualityResidual": flux_max,
                    }
                    candidate_roots.append(candidate_match)
                candidate_match["reproductions"].append(label)
            if not accepted:
                continue
            match = next((root for root in roots if np.max(
                np.abs(state - root["state"]) /
                np.maximum(np.maximum(np.abs(state), np.abs(root["state"])), 1.0)
            ) <= gates["multistartProductRelativeTolerance"]), None)
            if match is None:
                match = {
                    "state": state, "reproductions": [], "values": values,
                    "numericalJacobianRank": rank,
                    "maximumIsoactivityLogResidual": mu_max,
                    "maximumScaledFluxEqualityResidual": flux_max,
                }
                roots.append(match)
            match["reproductions"].append(label)

        catalog = {
            "schemaVersion": "ECR_JOB_B_BOUNDARY_CANDIDATE_SEED_CATALOG_V1",
            "qualification":
                "DETERMINISTIC_INLET_BASIN_SEEDS_ONLY_NOT_ACCEPTED_ROOTS",
            "description": (
                "Conservative basin seed catalog generated directly from the "
                "deterministic inlet multistart. Every local replay must "
                "independently re-solve and pass the unchanged strict gates."),
            "source": {
                "kind": "DETERMINISTIC_INLET_MULTISTART",
                "frozenInputHash": source["inputHash"],
                "startCount": len(seeds),
                "exploratoryCandidateIsoactivityGate": GATE,
                "exploratoryCandidateScaledTwoFilmGate": GATE,
                "strictScaledTwoFilmGate":
                    job_b.MAX_SCALED_FLUX_RESIDUAL,
                "requiredNumericalJacobianRank": 13,
            },
            "candidates": [{
                "candidateId": f"R{index}",
                "continuousInterfaceMoleFractions":
                    root["values"][0].tolist(),
                "dispersedInterfaceMoleFractions":
                    root["values"][1].tolist(),
                "totalMolarFluxMolM2S": float(root["values"][2]),
                "seedSource": "DETERMINISTIC_INLET_MULTISTART",
                "sourceStarts": root["reproductions"],
                "numericalJacobianRank": root["numericalJacobianRank"],
                "maximumIsoactivityLogResidual":
                    root["maximumIsoactivityLogResidual"],
                "maximumScaledFluxEqualityResidual":
                    root["maximumScaledFluxEqualityResidual"],
                "strictNumericalAccepted": bool(
                    root["numericalJacobianRank"] == 13
                    and root["maximumIsoactivityLogResidual"] <= GATE
                    and
                    root["maximumScaledFluxEqualityResidual"]
                    <= job_b.MAX_SCALED_FLUX_RESIDUAL),
            } for index, root in enumerate(candidate_roots, 1)],
        }
        catalog["catalogSha256"] = hashlib.sha256(
            canonical(catalog).encode()).hexdigest()
        (OUTPUT / "candidate-root-seeds.json").write_text(
            json.dumps(catalog, indent=2, allow_nan=False) + "\n")
        if "--catalog-only" in sys.argv:
            print(json.dumps({
                "candidateSeedCount": len(candidate_roots),
                "strictNumericalSeedCount": sum(
                    candidate["strictNumericalAccepted"]
                    for candidate in catalog["candidates"]),
                "catalogSha256": catalog["catalogSha256"],
            }, indent=2))
            return

        height, cells = 2.0, 7
        area = math.pi * request["columnDiameterM"] ** 2 / 4
        transfer_area = (
            6 * request["operatingHoldup"] / request["d32M"] * area * height
        )
        canonical_flux = np.asarray(
            canonical_job_b["interface"]["continuousComponentFluxMolM2S"])
        rows = []
        for index, root in enumerate(roots, 1):
            xi_c, xi_d, n, jc, jd, nc, nd = root["values"]
            local = {
                "continuous": engine.local_stability(xi_c, request["temperatureK"]),
                "dispersed": engine.local_stability(xi_d, request["temperatureK"]),
            }
            post = {
                phase: engine.routine_tpd(x, request["temperatureK"],
                    refine_best_global_and_local=True)
                for phase, x in (("continuous", xi_c), ("dispersed", xi_d))
            }
            stable = all(
                local[p]["minimumEigenvalue"] >= gates["minimumLocalStabilityCurvature"]
                and local[p]["stepSizeConverged"]
                and post[p]["minimum"] >= gates["postSplitTpdThreshold"]
                and post[p]["allRefinementsAccepted"]
                and job_b.mono_audit(post[p])
                for p in ("continuous", "dispersed")
            )
            separated = float(np.max(np.abs(xi_c - xi_d))) >= (
                gates["minimumPhaseCompositionSeparation"])
            oriented = bool(xi_c[5] > xi_d[5])
            continuous_out = feed_c - nc * transfer_area
            dispersed_out = feed_d + nc * transfer_area
            canonical_match = bool(np.max(np.abs(nc - canonical_flux)) <= 1e-10)
            if canonical_match:
                stable = bool(canonical_job_b[
                    "selectedGateEvidence"]["endpointStabilityAccepted"])
                reproduction_labels = [
                    canonical_job_b["selectedStartClass"],
                    canonical_job_b["independentReproductionStartClass"],
                ]
                reproduction_difference = canonical_job_b[
                    "independentReproductionMaximumRelativeDifference"]
            else:
                reproduction_labels = root["reproductions"]
                reproduction_difference = None
            credible = bool(
                len(reproduction_labels) >= 2 and separated and oriented and stable)
            rows.append({
                "rootId": f"R{index}",
                "numericalJacobianRank": root["numericalJacobianRank"],
                "maximumIsoactivityLogResidual":
                    root["maximumIsoactivityLogResidual"],
                "maximumScaledFluxEqualityResidual":
                    root["maximumScaledFluxEqualityResidual"],
                "reproductionCount": len(reproduction_labels),
                "independentReproductions": reproduction_labels,
                "independentReproductionMaximumRelativeDifference":
                    reproduction_difference,
                "canonicalPackagedJobBMatch": canonical_match,
                "continuousInterfaceMoleFractions": xi_c.tolist(),
                "dispersedInterfaceMoleFractions": xi_d.tolist(),
                "totalMolarFluxMolM2S": float(n),
                "componentFluxMolM2S": nc.tolist(),
                "phaseSeparated": separated, "phaseOrientationAccepted": oriented,
                "endpointStabilityAccepted": stable,
                "localStability": local,
                "postInterfaceTpd": {p: job_b.compact_tpd(post[p]) for p in post},
                "globalOutletNecessaryCondition": {
                    "heightM": height,
                    "continuousOutletMolS": continuous_out.tolist(),
                    "dispersedOutletMolS": dispersed_out.tolist(),
                    "strictlyPositive": bool(
                        np.min(continuous_out) > 0 and np.min(dispersed_out) > 0),
                    "nonpositiveOutlets": [
                        {"phase": phase, "component": COMPONENTS[i],
                         "flowMolS": float(value)}
                        for phase, values in (
                            ("continuous", continuous_out),
                            ("dispersed", dispersed_out))
                        for i, value in enumerate(values) if value <= 0
                    ],
                },
                "crediblePhysicalRoot": credible,
            })

        credible = [row for row in rows if row["crediblePhysicalRoot"]]
        compatible = [row for row in credible if row[
            "globalOutletNecessaryCondition"]["strictlyPositive"]]
        result = {
            "schemaVersion": "ECR_JOB_B_BOUNDARY_BRANCH_QUALIFICATION_V1",
            "componentOrder": list(COMPONENTS),
            "temperatureK": request["temperatureK"], "heightM": height,
            "stage2EngineVersion": "7C-1.5.0",
            "stage2EngineHash": source["responseBasis"]["dependencies"]["stage2EngineHash"],
            "jobBInterfaceWorkerSha256":
                source["responseBasis"]["dependencies"]["jobBInterfaceWorkerSha256"],
            "frozenInputSha256": digest(source["workerRequest"]),
            "search": {
                "seedGenerator": "PCG64_SEED_2610709",
                "attemptCount": len(attempts),
                "numericallyAcceptedAttemptCount":
                    sum(row["numericallyAccepted"] for row in attempts),
                "distinctRootCount": len(rows),
                "attempts": attempts,
            },
            "unchangedAcceptance": {
                "isoactivityLogResidual": GATE,
                "scaledTwoFilmResidual": job_b.MAX_SCALED_FLUX_RESIDUAL,
                "rawFvResidualMolS": GATE, "scaledFvResidual": GATE,
                "clippingUsed": False, "sourceSignReversalUsed": False,
                "negativeFlowsAccepted": False, "toleranceRelaxed": False,
            },
            "roots": rows,
            "crediblePhysicalRootCount": len(credible),
            "boundaryCompatibleRootCount": len(compatible),
            "h2LocalContinuation98FlowEvidence": continuation,
            "jobCDisposition": (
                "MAY_RESUME_FROM_INDEPENDENTLY_REPRODUCED_BOUNDARY_COMPATIBLE_BRANCH"
                if compatible else
                "REMAINS_BLOCKED_NO_BOUNDARY_COMPATIBLE_JOB_B_ROOT"
            ),
            "requiredGovernedChangeIfBlocked": None if compatible else {
                "change":
                    "Represent both physical inlet phases with strictly positive "
                    "trace solvent-component inventories before applying a "
                    "two-phase interfacial constitutive law at the boundary.",
                "evidenceRequired":
                    "Measured or independently governed phase-resolved inlet "
                    "composition/detection-limit evidence for NMP and H2O in the "
                    "RRBO dispersed inlet; update the Stage-2 boundary stream and "
                    "its immutable engine/result hashes before rerunning Job B.",
                "notPermitted":
                    ["numerical clipping", "source-sign reversal",
                     "unconstrained negative flows", "tolerance relaxation"],
            },
            "scientificIntegrity": integrity,
            "scientificRuntime": runtime,
        }
        result["resultSha256"] = digest(result)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        (OUTPUT / "results.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({
            "distinctRoots": len(rows), "credibleRoots": len(credible),
            "boundaryCompatibleRoots": len(compatible),
            "disposition": result["jobCDisposition"],
            "resultSha256": result["resultSha256"],
        }, indent=2))
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()