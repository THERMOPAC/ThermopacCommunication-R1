#!/usr/bin/env python3
"""Two bounded numerical experiments for the saved design-269 Job-B request.

This file does not invoke the column solver or alter any pinned runtime.  It
loads the exact request captured by the baseline diagnosis, asserts the
immutable worker hash, and reproduces the worker's residual algebra verbatim
with alternate numerical coordinates/methods only.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path

ROOT = Path.cwd()
BASELINE_PATH = ROOT / "research/design269-stage4-interface-root-diagnosis.json"
OUT_JSON = ROOT / "research/design269-stage4-interface-root-experiments.json"
OUT_MD = ROOT / "research/design269-stage4-interface-root-experiments.md"
RUNTIME_ROOT = ROOT / "dist/job-b-interface-runtime"
WORKER_PATH = RUNTIME_ROOT / "server/ecr-pre-pilot/job-b-interface/worker.py"
EXPECTED_WORKER_SHA256 = "70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d"
LOG_FLOOR = 1e-14
MAX_SCALED_FLUX_RESIDUAL = 1e-8
ABSOLUTE_FLUX_TOLERANCE = 1e-12
MAXIMUM_EVALUATIONS_PER_START = 800


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("EXPERIMENT_MODULE_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def json_write(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def main() -> None:
    baseline = json.loads(BASELINE_PATH.read_text())
    request = baseline["exactJobBRequest"]
    baseline_response = baseline["immutableJobBResponse"]
    if sha256_file(WORKER_PATH) != EXPECTED_WORKER_SHA256:
        raise RuntimeError("EXPERIMENT_IMMUTABLE_WORKER_HASH_MISMATCH")
    if baseline_response["workerSha256"] != EXPECTED_WORKER_SHA256:
        raise RuntimeError("EXPERIMENT_BASELINE_WORKER_BINDING_MISMATCH")

    # These are the environment bindings used by the immutable interface
    # worker. Importing it validates the packaged manifests before exposing the
    # exact same pinned scientific.build_engine implementation.
    os.environ["JOB_B_INTERFACE_PROTOCOL"] = "ECR_JOB_B_INTERFACE_V1"
    os.environ["JOB_B_INTERFACE_RUNTIME_ROOT"] = str(RUNTIME_ROOT)
    os.environ["STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL"] = (
        "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1"
    )
    os.environ["STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT"] = str(
        ROOT / "dist/stage4-seven-component-adapter-runtime"
    )
    os.environ["STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT"] = str(
        ROOT / "dist/predictive-nt-runtime-7c-1-5"
    )
    worker = load_module(WORKER_PATH, "immutable_job_b_worker_for_experiment")
    scientific = worker.scientific
    temporary, engine, integrity, runtime = scientific.build_engine(float(request["T"]), 0.0)
    np, scipy, gates = engine.np, engine.scipy, engine.gates
    try:
        xb_c = np.asarray(request["x_bulk_continuous"], dtype=float)
        xb_d = np.asarray(request["x_bulk_dispersed"], dtype=float)
        kcct = np.asarray(request["kc"], dtype=float) * float(request["CtC"])
        kdct = np.asarray(request["kd"], dtype=float) * float(request["CtD"])
        flux_scale = np.maximum(np.maximum(kcct, kdct), ABSOLUTE_FLUX_TOLERANCE)
        total_bound = float(2.0 * np.sum(kcct + kdct))
        lower_raw = np.r_[np.full(12, -35.0), -total_bound]
        upper_raw = np.r_[np.full(12, 35.0), total_bound]

        def softmax(log_ratios):
            y = np.r_[log_ratios, 0.0]
            y -= np.max(y)
            exp = np.exp(y)
            return exp / np.sum(exp)

        def logits(composition):
            safe = np.maximum(np.asarray(composition), LOG_FLOOR)
            safe /= np.sum(safe)
            return np.log(safe[:-1] / safe[-1])

        # Verbatim residual construction from immutable worker.py lines 221--234.
        def evaluate_raw(unknown):
            xi_c, xi_d, n_total = (
                softmax(unknown[:6]), softmax(unknown[6:12]), float(unknown[12])
            )
            mu_delta = engine.mu(xi_c, float(request["T"])) - engine.mu(
                xi_d, float(request["T"])
            )
            raw_c = kcct * (xb_c - xi_c)
            raw_d = kdct * (xi_d - xb_d)
            j_c = raw_c - xi_c * np.sum(raw_c)
            j_d = raw_d - xi_d * np.sum(raw_d)
            n_c = j_c + xi_c * n_total
            n_d = j_d + xi_d * n_total
            flux_delta = n_c - n_d
            independent = np.r_[mu_delta, flux_delta[:6] / flux_scale[:6]]
            return independent, xi_c, xi_d, n_total, j_c, j_d, n_c, n_d, flux_delta

        nmp_rich = np.asarray((.01, .01, .01, .005, .005, .88, .08))
        rrbo_rich = np.asarray((.72, .12, .06, .025, .015, .05, .01))
        oriented = ((nmp_rich, rrbo_rich)
                    if request["phase_config"] == "nmp-continuous-rrbo-dispersed"
                    else (rrbo_rich, nmp_rich))
        starts = [
            ("ORIENTED_PHASE_TEMPLATE", *oriented),
            ("FROZEN_BULK_BOUNDARIES", xb_c, xb_d),
            ("ORIENTED_TEMPLATE_BULK_C", oriented[0], xb_d),
            ("ORIENTED_BULK_D_TEMPLATE", xb_c, oriented[1]),
        ]
        perturbation = np.linspace(-0.02, 0.02, 6)
        starts += [
            ("ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS",
             softmax(logits(oriented[0]) + perturbation),
             softmax(logits(oriented[1]) - perturbation)),
            ("ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS",
             softmax(logits(oriented[0]) - perturbation),
             softmax(logits(oriented[1]) + perturbation)),
        ]

        def metrics(label, result, decode=lambda x: x):
            physical_x = decode(result.x)
            _, xi_c, xi_d, n_total, j_c, j_d, n_c, n_d, delta = evaluate_raw(physical_x)
            mu_delta = engine.mu(xi_c, float(request["T"])) - engine.mu(
                xi_d, float(request["T"])
            )
            singular_values = np.linalg.svd(result.jac, compute_uv=False)
            rank_tolerance = (max(result.jac.shape) * np.finfo(float).eps * singular_values[0]
                              if len(singular_values) and singular_values[0] > 0 else math.inf)
            row = {
                "startClass": label,
                "optimizerSuccess": bool(result.success),
                "optimizerStatus": int(result.status),
                "optimizerMessage": str(result.message),
                "functionEvaluations": int(result.nfev),
                "numericalJacobianRank": int(np.sum(singular_values > rank_tolerance)),
                "requiredNumericalJacobianRank": 13,
                "cost": float(result.cost),
                "maximumIsoactivityLogResidual": float(np.max(np.abs(mu_delta))),
                "maximumFluxEqualityResidualMolM2S": float(np.max(np.abs(delta))),
                "maximumScaledFluxEqualityResidual": float(np.max(np.abs(delta) / flux_scale)),
                "maximumInterfaceCompositionSeparation": float(np.max(np.abs(xi_c - xi_d))),
                "continuousDiffusiveSumResidualMolM2S": float(abs(np.sum(j_c))),
                "dispersedDiffusiveSumResidualMolM2S": float(abs(np.sum(j_d))),
                "continuousTotalFluxIdentityResidualMolM2S": float(abs(np.sum(n_c) - n_total)),
                "dispersedTotalFluxIdentityResidualMolM2S": float(abs(np.sum(n_d) - n_total)),
                "totalMolarFluxMolM2S": float(n_total),
                "totalFluxWithinImmutableBound": bool(abs(n_total) <= total_bound),
                "continuousMoleFractions": xi_c.tolist(),
                "dispersedMoleFractions": xi_d.tolist(),
                # Retained only in the research result to permit the prescribed
                # second warm-start experiment; never sent to a production path.
                "rawUnknown": physical_x.tolist(),
            }
            orientation = (xi_c[5] > xi_d[5]
                           if request["phase_config"] == "nmp-continuous-rrbo-dispersed"
                           else xi_d[5] > xi_c[5])
            row["gateComparison"] = {
                "optimizer": "PASS" if row["optimizerSuccess"] else "FAIL",
                "rank": "PASS" if row["numericalJacobianRank"] == 13 else "FAIL",
                "isoactivity": "PASS" if row["maximumIsoactivityLogResidual"]
                <= gates["maximumIsoactivityLogResidual"] else "FAIL",
                "scaledFluxEquality": "PASS" if row["maximumScaledFluxEqualityResidual"]
                <= MAX_SCALED_FLUX_RESIDUAL else "FAIL",
                "separation": "PASS" if row["maximumInterfaceCompositionSeparation"]
                >= gates["minimumPhaseCompositionSeparation"] else "FAIL",
                "orientation": "PASS" if orientation else "FAIL",
                "finiteAndBoundedState": "PASS" if row["totalFluxWithinImmutableBound"] else "FAIL",
            }
            row["numericalAcceptedBeforeReproductionAndStability"] = all(
                row["gateComparison"][key] == "PASS" for key in (
                    "optimizer", "rank", "isoactivity", "scaledFluxEquality",
                    "finiteAndBoundedState",
                )
            )
            return row

        # Experiment 1: alternate bounded trust-region method, exact worker
        # coordinates/residuals/canonical six starts; 800 nfev per start.
        experiment_one = []
        for label, seed_c, seed_d in starts:
            x0 = np.r_[logits(seed_c), logits(seed_d), 0.0]
            result = scipy.optimize.least_squares(
                lambda value: evaluate_raw(value)[0], x0, bounds=(lower_raw, upper_raw),
                method="dogbox", jac="2-point", max_nfev=MAXIMUM_EVALUATIONS_PER_START,
                xtol=1e-11, ftol=1e-11, gtol=1e-11, x_scale="jac",
            )
            experiment_one.append(metrics(label, result))

        # Experiment 2: preserve physical residuals but explicitly scale N by
        # its immutable bound. Warm start the lowest max(normalized iso, flux)
        # endpoint from experiment 1 and add one independent fixed perturbation.
        best = min(experiment_one, key=lambda row: max(
            row["maximumIsoactivityLogResidual"] / gates["maximumIsoactivityLogResidual"],
            row["maximumScaledFluxEqualityResidual"] / MAX_SCALED_FLUX_RESIDUAL,
        ))
        best_raw = np.asarray(best["rawUnknown"], dtype=float)
        best_scaled = np.r_[best_raw[:12], best_raw[12] / total_bound]
        scaled_lower, scaled_upper = np.r_[np.full(12, -35.0), -1.0], np.r_[np.full(12, 35.0), 1.0]
        independent_delta = np.linspace(-1e-3, 1e-3, 12)
        warm_starts = [
            ("EXPERIMENT1_LOWEST_NORMALIZED_RESIDUAL_ENDPOINT", best_scaled),
            ("EXPERIMENT1_ENDPOINT_INDEPENDENT_LOGIT_PERTURBATION",
             np.r_[np.clip(best_scaled[:12] + independent_delta, -35.0, 35.0), best_scaled[12]]),
        ]
        decode_scaled = lambda value: np.r_[value[:12], value[12] * total_bound]
        experiment_two = []
        for label, start in warm_starts:
            result = scipy.optimize.least_squares(
                lambda value: evaluate_raw(decode_scaled(value))[0], start,
                bounds=(scaled_lower, scaled_upper), method="trf", jac="2-point",
                max_nfev=MAXIMUM_EVALUATIONS_PER_START,
                xtol=1e-11, ftol=1e-11, gtol=1e-11, x_scale="jac",
            )
            experiment_two.append(metrics(label, result, decode_scaled))

        for row in experiment_one + experiment_two:
            # Raw optimizer coordinates are not an acceptance artifact.
            row.pop("rawUnknown")
        all_rows = experiment_one + experiment_two
        any_numerically_eligible = any(
            row["numericalAcceptedBeforeReproductionAndStability"] for row in all_rows
        )
        evidence = {
            "schema": "DESIGN269_STAGE4_INTERFACE_ROOT_NUMERICAL_EXPERIMENTS_V1",
            "scope": {
                "exactBaselineRequestFingerprint": baseline["requestFingerprint"]["value"],
                "exactBaselineEvidenceSha256": sha256_file(BASELINE_PATH),
                "baselineExecutedScriptSha256": sha256_file(
                    ROOT / "research/design269-stage4-interface-root-diagnosis.ts"
                ),
                "experimentScriptSha256": sha256_file(Path(__file__)),
                "immutableWorkerSha256": sha256_file(WORKER_PATH),
                "prohibitedActionsNotPerformed": [
                    "No Stage-4 full-column execution", "No Stage-2 or Stage-3 execution",
                    "No production or pinned-runtime edit", "No threshold relaxation",
                ],
            },
            "sameResidualContract": {
                "source": "immutable worker.py evaluate() algebra, copied verbatim",
                "variables": "12 interface logits plus total Stefan molar flux",
                "residual": "seven chemical-potential differences plus first six flux differences divided by max(kc*CtC,kd*CtD,1e-12)",
                "unchangedAcceptanceThresholds": baseline_response["acceptanceThresholds"],
                "immutableTotalFluxBoundMolM2S": total_bound,
            },
            "pinnedScientificRuntime": {
                "integrity": integrity, "runtime": runtime,
                "engineGates": gates,
            },
            "experimentOne": {
                "name": "BOUNDED_DOGBOX_SAME_COORDINATES_SIX_CANONICAL_STARTS",
                "method": "scipy.optimize.least_squares(method='dogbox', jac='2-point', x_scale='jac')",
                "perStartMaximumFunctionEvaluations": MAXIMUM_EVALUATIONS_PER_START,
                "results": experiment_one,
            },
            "experimentTwo": {
                "name": "BOUNDED_TRF_STEFAN_BOUND_SCALED_WARM_START_AND_INDEPENDENT_PERTURBATION",
                "method": "same physical residual with z=N/total_bound and N=z*total_bound; scipy least_squares(method='trf', jac='2-point', x_scale='jac')",
                "perStartMaximumFunctionEvaluations": MAXIMUM_EVALUATIONS_PER_START,
                "warmStartSelectedFromExperimentOne": best["startClass"],
                "independentPerturbation": "linspace(-1e-3,1e-3,12) added to warm-start interface logits; Stefan coordinate unchanged",
                "results": experiment_two,
            },
            "acceptanceConclusion": {
                "numericallyEligibleCandidateFound": any_numerically_eligible,
                "reproductionAndEndpointStability": (
                    "NOT_EXECUTED_NO_CANDIDATE_PASSED_UNCHANGED_NUMERICAL_GATES"
                    if not any_numerically_eligible else
                    "REQUIRES_SEPARATE_UNCHANGED_MULTISTART_REPRODUCTION_AND_STABILITY_ASSESSMENT"
                ),
                "acceptanceClaim": "NONE",
            },
        }
        json_write(OUT_JSON, evidence)
        lines = [
            "# Design 269 first-root bounded numerical experiments", "",
            "Two isolated experiments used the exact request and copied immutable",
            "Job-B residual equations without running a column or changing any gate.",
            f"Baseline request fingerprint: `{baseline['requestFingerprint']['value']}`.",
            f"Immutable worker SHA-256: `{sha256_file(WORKER_PATH)}`.", "",
            "## Results", "",
            "| experiment/start | rank | max isoactivity | max scaled flux | numerical eligibility |",
            "|---|---:|---:|---:|---|",
        ]
        for group, rows in (("dogbox", experiment_one), ("scaled warm TRF", experiment_two)):
            for row in rows:
                lines.append(
                    f"| {group}: {row['startClass']} | {row['numericalJacobianRank']}/13 | "
                    f"{row['maximumIsoactivityLogResidual']:.9g} | "
                    f"{row['maximumScaledFluxEqualityResidual']:.9g} | "
                    f"{row['numericalAcceptedBeforeReproductionAndStability']} |"
                )
        lines += [
            "", "Acceptance claim: **none**. The detailed JSON records exact",
            "per-start optimizer, rank, residual, separation, orientation, bounded-state,",
            "diffusive-frame, and total-flux-identity measurements. Reproduction and",
            "endpoint-stability gates are not run unless an unchanged numerical candidate",
            "first qualifies; absence of this branch is not an inference of infeasibility.",
        ]
        OUT_MD.write_text("\n".join(lines) + "\n")
        print(json.dumps({
            "written": [str(OUT_JSON.relative_to(ROOT)), str(OUT_MD.relative_to(ROOT))],
            "numericallyEligibleCandidateFound": any_numerically_eligible,
        }))
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()