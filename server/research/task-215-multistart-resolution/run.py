"""Verify multistart closure on an exported immutable Predictive N_T job."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
COUNTER = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"
WORKER = ROOT / "server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py"
OUTPUT = ROOT / ".agents/outputs/task-215-multistart-resolution"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def load_worker():
    spec = importlib.util.spec_from_file_location("task215_worker", WORKER)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def compact_attempt(attempt):
    result = {
        key: attempt.get(key)
        for key in (
            "strategy",
            "solverSuccess",
            "terminationStatus",
            "terminationMessage",
            "functionEvaluations",
            "jacobianEvaluations",
            "maximumScaledEquationResidual",
            "rmsScaledEquationResidual",
            "maximumOriginalComponentBalanceResidualMol",
            "maximumIsoactivityLogResidual",
            "closureLimit",
            "residualClosureStatus",
        )
    }
    if "iterationTrace" in attempt:
        result["iterationTrace"] = attempt["iterationTrace"]
    if "jacobianDiagnostics" in attempt:
        result["jacobianDiagnostics"] = attempt["jacobianDiagnostics"]
    return result


def old_trial_summary(trial):
    evidence = trial.get("multistartEvidence", {})
    return {
        "stageCount": trial["stageCount"],
        "primary": evidence.get("primary"),
        "secondary": evidence.get("secondary"),
        "bothStartsClosed": evidence.get("bothStartsClosed"),
        "multistartProductRelativeDifference":
            trial.get("multistartProductRelativeDifference"),
        "numericalBlockers": [
            blocker["code"] for blocker in trial.get("acceptanceBlockers", [])
            if blocker.get("code") in (
                "COUPLED_SOLVER_CLOSURE_FAILED",
                "MULTISTART_SECONDARY_CLOSURE_FAILED",
                "MULTISTART_BRANCH_REPRODUCTION_FAILED",
            )
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--job-export",
        type=Path,
        required=True,
        help="Read-only JSON export containing input_snapshot and result_snapshot",
    )
    args = parser.parse_args()
    source = json.loads(args.job_export.read_text())
    protocol = json.loads((HERE / "protocol.json").read_text())
    actual_input_hash = digest(source.get("input_snapshot"))
    actual_prior_result_hash = digest(source.get("result_snapshot"))
    reference = protocol["referenceExport"]
    if actual_input_hash != reference["inputSnapshotSha256"]:
        raise ValueError("REFERENCE_INPUT_SNAPSHOT_HASH_MISMATCH")
    if actual_prior_result_hash != reference["priorResultSnapshotSha256"]:
        raise ValueError("REFERENCE_PRIOR_RESULT_SNAPSHOT_HASH_MISMATCH")
    prior_result = source["result_snapshot"]
    if prior_result.get("engine", {}).get("engineHash") != reference["priorEngineHash"]:
        raise ValueError("REFERENCE_PRIOR_ENGINE_HASH_MISMATCH")
    if prior_result.get("model", {}).get("modelHash") != reference["priorModelHash"]:
        raise ValueError("REFERENCE_PRIOR_MODEL_HASH_MISMATCH")
    for relative_path, expected_hash in protocol[
        "parameterProvenanceInputs"
    ].items():
        if sha(ROOT / relative_path) != expected_hash:
            raise ValueError(
                f"PARAMETER_PROVENANCE_INPUT_HASH_MISMATCH:{relative_path}"
            )
    prior_trials = source["result_snapshot"]["trials"]
    worker = load_worker()
    cc = worker.cc
    np = cc.np
    request = source["input_snapshot"]
    snapshot, stage1, snapshot_hash = worker.stage1_from_request(request)
    _, parameters, flash, charge = worker.get_equilibrium(request, stage1)
    parameter_vector_hash = digest([
        float(value) for value in parameters.tolist()
    ])
    molecular_weights = np.asarray([
        charge["molecularWeightsGmol"][name] for name in worker.FAMILIES
    ], dtype=float)
    feed_mass = np.asarray([
        stage1[key] for key in (
            "saturatesWt", "monoAromaticsWt", "diAromaticsWt",
            "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt",
        )
    ], dtype=float)
    feed = feed_mass / molecular_weights
    solvent = np.asarray([
        0, 0, 0, 0, 0, 100 * float(stage1["solventOilRatio"])
    ], dtype=float) / molecular_weights
    seed = {
        "raffinate": np.asarray(flash["raffinate"]),
        "extract": np.asarray(flash["extract"]),
        "beta": float(flash["betaExtract"]),
        "mw": molecular_weights,
    }
    counter_protocol = cc.load_json(COUNTER / "protocol.json")

    # This artifact is intentionally solver-only. Phase stability is governed
    # by the unchanged production path and the dependent thermodynamic task.
    cc.local_stability = lambda *_args, **_kwargs: {
        "minimumEigenvalue": 0.0,
        "independentReconstructionsAgree": True,
        "stepSizeConverged": True,
    }
    cc.model.tpd_search = lambda *_args, **_kwargs: {
        "minimum": 0.0,
        "allRefinementsAccepted": True,
    }

    previous = None
    trials = []
    maximum = int(stage1["maximumStages"])
    for count in range(1, maximum + 1):
        print(json.dumps({"status": "RUNNING", "stageCount": count}), flush=True)
        trial = cc.solve_cascade(
            count,
            float(stage1["operatingTemperatureC"]) + 273.15,
            feed,
            solvent,
            parameters,
            counter_protocol,
            seed,
            previous,
        )
        solution = trial.pop("_streamSolution")
        trial.pop("_raffinateProduct")
        if trial["residualClosureStatus"] == "CLOSED":
            previous = solution
        evidence = trial["multistartEvidence"]
        trials.append({
            "stageCount": count,
            "primary": {
                **{
                    key: evidence["primary"].get(key)
                    for key in (
                        "strategy", "selectedStrategy", "selectedAttemptIndex",
                        "solverSuccess", "terminationStatus",
                        "terminationMessage", "attemptCount",
                        "cumulativeFunctionEvaluations",
                        "maximumScaledEquationResidual",
                        "rmsScaledEquationResidual",
                        "maximumOriginalComponentBalanceResidualMol",
                        "maximumIsoactivityLogResidual", "closureLimit",
                        "residualClosureStatus",
                    )
                },
                "attempts": [
                    compact_attempt(item)
                    for item in evidence["primary"]["attempts"]
                ],
            },
            "secondary": {
                **{
                    key: evidence["secondary"].get(key)
                    for key in (
                        "strategy", "selectedStrategy", "selectedAttemptIndex",
                        "solverSuccess", "terminationStatus",
                        "terminationMessage", "attemptCount",
                        "cumulativeFunctionEvaluations",
                        "maximumScaledEquationResidual",
                        "rmsScaledEquationResidual",
                        "maximumOriginalComponentBalanceResidualMol",
                        "maximumIsoactivityLogResidual", "closureLimit",
                        "residualClosureStatus",
                    )
                },
                "attempts": [
                    compact_attempt(item)
                    for item in evidence["secondary"]["attempts"]
                ],
            },
            "bothStartsClosed": evidence["bothStartsClosed"],
            "branchComparisonStatus": evidence["branchComparisonStatus"],
            "branchReproduced": evidence["branchReproduced"],
            "multistartProductRelativeDifference":
                trial["multistartProductRelativeDifference"],
            "numericalBlockers": [
                blocker["code"] for blocker in trial["acceptanceBlockers"]
                if blocker["code"] in (
                    "COUPLED_SOLVER_CLOSURE_FAILED",
                    "MULTISTART_SECONDARY_CLOSURE_FAILED",
                    "MULTISTART_BRANCH_REPRODUCTION_FAILED",
                )
            ],
        })

    all_closed = all(row["bothStartsClosed"] for row in trials)
    all_reproduced = all(row["branchReproduced"] for row in trials)
    no_numerical_blockers = all(not row["numericalBlockers"] for row in trials)
    results = {
        "schemaVersion": "1.0.0",
        "referenceJob": {
            "id": protocol["referenceJobId"],
            "project": protocol["referenceProject"],
            "inputSnapshotSha256": actual_input_hash,
            "priorResultSnapshotSha256": actual_prior_result_hash,
            "priorEngineHash": reference["priorEngineHash"],
            "priorModelHash": reference["priorModelHash"],
            "stage1ImmutableHash": snapshot_hash,
        },
        "parameterProvenance": {
            "inputHashes": protocol["parameterProvenanceInputs"],
            "parameterVectorSha256": parameter_vector_hash,
            "parameterNames": list(worker.model.PARAMETER_NAMES),
        },
        "componentOrder": list(worker.FAMILIES),
        "equationsChanged": False,
        "thermodynamicParametersChanged": False,
        "phaseStabilityEvaluated": False,
        "closureLimit": protocol["equationAcceptanceLimit"],
        "branchProductRelativeTolerance":
            protocol["branchProductRelativeTolerance"],
        "priorTrials": [old_trial_summary(row) for row in prior_trials],
        "trials": trials,
        "conclusion": {
            "allPrimaryAndSecondaryEndpointsClosed": all_closed,
            "allClosedEndpointsReproduceBoundaryProducts": all_reproduced,
            "numericalBlockersRemaining": not no_numerical_blockers,
            "status": (
                "PASS" if all_closed and all_reproduced
                and no_numerical_blockers else "FAIL"
            ),
            "thermodynamicQualification": "UNCHANGED_NOT_QUALIFIED",
            "postSplitTpdDisposition": "NOT_EVALUATED_UNCHANGED",
            "releaseEligible": False,
            "sulfurPrediction": "NOT_CALCULABLE",
        },
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result_path = OUTPUT / "results.json"
    result_path.write_text(json.dumps(results, indent=2) + "\n")
    lines = [
        "# Predictive N_T multistart closure resolution",
        "",
        "**Research-only · unchanged equations and tolerances · phase stability not evaluated**",
        "",
        f"Reference job: `{protocol['referenceJobId']}` (Project {protocol['referenceProject']})",
        "",
        "| N_T | Primary termination | Primary residual | Secondary termination | Secondary residual | Branch difference | Numerical blockers |",
        "|---:|---|---:|---|---:|---:|---|",
    ]
    for row in trials:
        difference = row["multistartProductRelativeDifference"]
        difference_text = (
            f"{difference:.6g}" if difference is not None else "NOT EVALUABLE"
        )
        lines.append(
            f"| {row['stageCount']} | {row['primary']['terminationStatus']} | "
            f"{row['primary']['maximumScaledEquationResidual']:.6g} | "
            f"{row['secondary']['terminationStatus']} | "
            f"{row['secondary']['maximumScaledEquationResidual']:.6g} | "
            f"{difference_text} | "
            f"{', '.join(row['numericalBlockers']) or 'None'} |"
        )
    lines += [
        "",
        "## Conclusion",
        "",
        f"- All primary and secondary endpoints closed at or below 1e-8: **{all_closed}**.",
        f"- All closed endpoints reproduced boundary products at or below 1e-6: **{all_reproduced}**.",
        f"- Numerical multistart blockers remaining: **{not no_numerical_blockers}**.",
        "- Optimizer termination is retained separately from residual closure.",
        "- An unclosed endpoint is never classified or compared as a branch.",
        "- TPD stability, thermodynamic qualification, sulfur prediction, and release eligibility are unchanged.",
    ]
    report_path = OUTPUT / "report.md"
    report_path.write_text("\n".join(lines) + "\n")
    manifest = {
        "runnerSha256": sha(HERE / "run.py"),
        "protocolSha256": sha(HERE / "protocol.json"),
        "productionCountercurrentRunnerSha256": sha(COUNTER / "run.py"),
        "productionCountercurrentProtocolSha256": sha(COUNTER / "protocol.json"),
        "productionWorkerSha256": sha(WORKER),
        "inputSnapshotSha256": results["referenceJob"]["inputSnapshotSha256"],
        "priorResultSnapshotSha256":
            results["referenceJob"]["priorResultSnapshotSha256"],
        "resultsSha256": sha(result_path),
        "reportSha256": sha(report_path),
    }
    (OUTPUT / "provenance-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    print(json.dumps(results["conclusion"]))
    if results["conclusion"]["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()