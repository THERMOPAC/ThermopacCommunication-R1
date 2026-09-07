#!/usr/bin/env python3
"""Enumerate Job-B roots at one captured H=2 local continuation cell."""
from __future__ import annotations

import importlib.util
import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / ".agents/outputs/job-b-boundary-branch"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")


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
    spec = importlib.util.spec_from_file_location("local_boundary_job_b", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        raise SystemExit("usage: qualify_local_cell.py CELL_1_TO_7")
    cell = int(sys.argv[1])
    if cell < 1 or cell > 7:
        raise SystemExit("cell must be 1..7")
    frozen = json.loads((OUTPUT / "frozen-input.json").read_text())
    boundary = json.loads((OUTPUT / "h2-local-boundary-state.json").read_text())
    seed_catalog = json.loads(
        (OUTPUT / "candidate-root-seeds.json").read_text())
    r = frozen["workerRequest"]
    flow_c = boundary["continuousLocalComponentMolarFlowMolS"][cell - 1]
    flow_d = boundary["dispersedLocalComponentMolarFlowMolS"][cell - 1]
    xb_c = [value / sum(flow_c) for value in flow_c]
    xb_d = [value / sum(flow_d) for value in flow_d]
    request = {
        "protocol": "ECR_JOB_B_INTERFACE_V1",
        "operation": "SOLVE_INTERFACE",
        "componentOrder": list(COMPONENTS),
        "T": r["temperatureK"],
        "x_bulk_continuous": xb_c,
        "x_bulk_dispersed": xb_d,
        "kc": r["kc"], "kd": r["kd"],
        "CtC": r["continuousTotalConcentrationMolM3"],
        "CtD": r["dispersedTotalConcentrationMolM3"],
        "phase_config": r["phaseConfiguration"],
    }
    job_b = load_worker()
    canonical = job_b.solve(request)
    temporary, engine, integrity, runtime = job_b.scientific.build_engine(
        r["temperatureK"], 0.0)
    np, scipy, gates = engine.np, engine.scipy, engine.gates
    try:
        kcct = np.asarray(r["kc"]) * r["continuousTotalConcentrationMolM3"]
        kdct = np.asarray(r["kd"]) * r["dispersedTotalConcentrationMolM3"]
        scale = np.maximum(np.maximum(kcct, kdct), 1e-12)
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
            mu = engine.mu(xi_c, r["temperatureK"]) - engine.mu(
                xi_d, r["temperatureK"])
            raw_c = kcct * (np.asarray(xb_c) - xi_c)
            raw_d = kdct * (xi_d - np.asarray(xb_d))
            jc = raw_c - xi_c * raw_c.sum()
            jd = raw_d - xi_d * raw_d.sum()
            nc, nd = jc + xi_c * n, jd + xi_d * n
            delta = nc - nd
            return np.r_[mu, delta[:6] / scale[:6]], (
                xi_c, xi_d, n, nc, nd, delta)

        lower = np.r_[np.full(12, -35.0), -total_bound]
        upper = np.r_[np.full(12, 35.0), total_bound]
        perturb = np.linspace(-0.01, 0.01, 6)
        attempts, roots = [], []
        for template in seed_catalog["candidates"]:
            base_c = template["continuousInterfaceMoleFractions"]
            base_d = template["dispersedInterfaceMoleFractions"]
            base_n = template["totalMolarFluxMolM2S"]
            for sign in (-1, 1):
                x0 = np.r_[
                    logits(base_c) + sign * perturb,
                    logits(base_d) - sign * perturb,
                    base_n,
                ]
                fit = scipy.optimize.least_squares(
                    lambda u: evaluate(u)[0], x0, bounds=(lower, upper),
                    method="trf", jac="2-point", max_nfev=2500,
                    xtol=1e-11, ftol=1e-11, gtol=1e-11, x_scale="jac")
                residual, values = evaluate(fit.x)
                xi_c, xi_d, n, nc, nd, delta = values
                singular = np.linalg.svd(fit.jac, compute_uv=False)
                tolerance = (
                    max(fit.jac.shape) * np.finfo(float).eps * singular[0]
                    if len(singular) and singular[0] > 0 else math.inf)
                rank = int(np.sum(singular > tolerance))
                iso = float(np.max(np.abs(residual[:7])))
                flux = float(np.max(np.abs(delta) / scale))
                numerical = bool(
                    fit.success and rank == 13
                    and iso <= gates["maximumIsoactivityLogResidual"]
                    and flux <= job_b.MAX_SCALED_FLUX_RESIDUAL)
                label = (
                    f'{template["candidateId"]}-perturb-'
                    f'{"plus" if sign > 0 else "minus"}')
                attempts.append({
                    "startClass": label,
                    "optimizerSuccess": bool(fit.success),
                    "numericalJacobianRank": rank,
                    "maximumIsoactivityLogResidual": iso,
                    "maximumScaledFluxEqualityResidual": flux,
                    "numericalAccepted": numerical,
                })
                if not numerical:
                    continue
                state = np.r_[xi_c, xi_d, n]
                match = next((root for root in roots if np.max(
                    np.abs(state - root["state"]) /
                    np.maximum(np.maximum(
                        np.abs(state), np.abs(root["state"])), 1.0)
                ) <= gates["multistartProductRelativeTolerance"]), None)
                if match is None:
                    match = {
                        "state": state, "values": values,
                        "states": [],
                        "reproductions": [], "sourceTemplates": set(),
                        "rank": rank, "iso": iso, "flux": flux,
                    }
                    roots.append(match)
                match["reproductions"].append(label)
                match["states"].append(state)
                match["sourceTemplates"].add(template["candidateId"])

        canonical_state = None
        if canonical.get("status") == "CALCULATED_PRELIMINARY_INTERFACE":
            canonical_state = np.r_[
                canonical["interface"]["continuousMoleFractions"],
                canonical["interface"]["dispersedMoleFractions"],
                canonical["interface"]["totalMolarFluxMolM2S"],
            ]
        classified = []
        for index, root in enumerate(roots, 1):
            xi_c, xi_d, n, nc, nd, delta = root["values"]
            separated = float(np.max(np.abs(xi_c - xi_d))) >= (
                gates["minimumPhaseCompositionSeparation"])
            oriented = bool(xi_c[5] > xi_d[5])
            reproduced = len(root["reproductions"]) >= 2
            reproduction_difference = None
            if reproduced:
                reference = root["states"][0]
                reproduction_difference = max(float(np.max(
                    np.abs(state - reference) /
                    np.maximum(np.maximum(
                        np.abs(state), np.abs(reference)), 1.0)
                )) for state in root["states"][1:])
            canonical_match = (
                canonical_state is not None and float(np.max(
                    np.abs(root["state"] - canonical_state) /
                    np.maximum(np.maximum(
                        np.abs(root["state"]), np.abs(canonical_state)), 1.0)
                )) <= gates["multistartProductRelativeTolerance"]
            )
            if canonical_match:
                stability = dict(canonical["selectedGateEvidence"])
                stability["source"] = (
                    "PACKAGED_JOB_B_INHERITED_UNCHANGED_STABILITY_AND_TPD")
                stable = bool(stability["endpointStabilityAccepted"])
                canonical_start = next(
                    row for row in canonical["startDiagnostics"]
                    if row["startClass"] == canonical["selectedStartClass"])
                reproduction = {
                    "selectedStartClass": canonical["selectedStartClass"],
                    "independentReproductionStartClass":
                        canonical["independentReproductionStartClass"],
                    "maximumRelativeDifference":
                        canonical["independentReproductionMaximumRelativeDifference"],
                    "source": "PACKAGED_JOB_B_UNCHANGED_MULTISTART",
                }
                rank = canonical_start["numericalJacobianRank"]
                iso = canonical_start["maximumIsoactivityLogResidual"]
                flux = canonical_start["maximumScaledFluxEqualityResidual"]
            elif separated and oriented and reproduced:
                local = {
                    "continuous": engine.local_stability(
                        xi_c, r["temperatureK"]),
                    "dispersed": engine.local_stability(
                        xi_d, r["temperatureK"]),
                }
                post = {
                    "continuous": engine.routine_tpd(
                        xi_c, r["temperatureK"],
                        refine_best_global_and_local=True),
                    "dispersed": engine.routine_tpd(
                        xi_d, r["temperatureK"],
                        refine_best_global_and_local=True),
                }
                stable = all(
                    local[phase]["minimumEigenvalue"]
                    >= gates["minimumLocalStabilityCurvature"]
                    and local[phase]["stepSizeConverged"]
                    and post[phase]["minimum"] >= gates["postSplitTpdThreshold"]
                    and post[phase]["allRefinementsAccepted"]
                    and job_b.mono_audit(post[phase])
                    for phase in ("continuous", "dispersed"))
                stability = {
                    "endpointStabilityAccepted": stable,
                    "localStability": local,
                    "postInterfaceTpd": {
                        phase: job_b.compact_tpd(post[phase])
                        for phase in ("continuous", "dispersed")
                    },
                    "source": "BOUNDARY_ROOT_UNCHANGED_STABILITY_AND_TPD",
                }
                reproduction = {
                    "startClasses": root["reproductions"],
                    "maximumRelativeDifference": reproduction_difference,
                    "source": "BOUNDARY_TEMPLATE_PERTURBATIONS",
                }
                rank, iso, flux = root["rank"], root["iso"], root["flux"]
            else:
                stable, stability = False, None
                reproduction = {
                    "startClasses": root["reproductions"],
                    "source": "BOUNDARY_TEMPLATE_PERTURBATIONS",
                }
                rank, iso, flux = root["rank"], root["iso"], root["flux"]
            classified.append({
                "localRootId": f"C{cell}-R{index}",
                "sourceCandidateTemplates": sorted(root["sourceTemplates"]),
                "numericalJacobianRank": rank,
                "maximumIsoactivityLogResidual": iso,
                "maximumScaledFluxEqualityResidual": flux,
                "phaseSeparated": separated,
                "phaseOrientationAccepted": oriented,
                "independentlyReproduced": reproduced or canonical_match,
                "canonicalPackagedJobBMatch": canonical_match,
                "endpointStabilityAccepted": stable,
                "stabilityEvidence": stability,
                "reproductionEvidence": reproduction,
                "continuousInterfaceMoleFractions": xi_c.tolist(),
                "dispersedInterfaceMoleFractions": xi_d.tolist(),
                "totalMolarFluxMolM2S": float(n),
                "continuousComponentFluxMolM2S": nc.tolist(),
                "crediblePhysicalRoot": bool(
                    separated and oriented and stable
                    and (reproduced or canonical_match)),
            })

        body = {
            "schemaVersion": "ECR_JOB_B_H2_LOCAL_CELL_ROOTS_V1",
            "numericalCell": cell,
            "componentOrder": list(COMPONENTS),
            "acceptedLambda": boundary["acceptedLambda"],
            "bulkContinuousMoleFractions": xb_c,
            "bulkDispersedMoleFractions": xb_d,
            "packagedJobBStatus": canonical.get("status"),
            "packagedJobBSelectedStartClass":
                canonical.get("selectedStartClass"),
            "packagedJobBIndependentReproductionStartClass":
                canonical.get("independentReproductionStartClass"),
            "attemptCount": len(attempts),
            "attempts": attempts,
            "distinctNumericalRootCount": len(classified),
            "crediblePhysicalRootCount":
                sum(root["crediblePhysicalRoot"] for root in classified),
            "roots": classified,
            "scientificIntegrity": integrity,
            "scientificRuntime": runtime,
        }
        target = OUTPUT / f"h2-local-cell-{cell}-roots.json"
        target.write_text(json.dumps(body, indent=2) + "\n")
        print(json.dumps({
            "cell": cell,
            "distinctRoots": body["distinctNumericalRootCount"],
            "credibleRoots": body["crediblePhysicalRootCount"],
            "packagedJobBStatus": body["packagedJobBStatus"],
        }))
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()