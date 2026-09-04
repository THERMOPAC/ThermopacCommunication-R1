#!/usr/bin/env python3
"""Assemble the fail-closed qualification record for the 7C-1.3 replacement."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = Path(
    os.environ.get(
        "TASK236_OUTPUT_DIR",
        ROOT / ".agents/outputs/task-236-residual-replacement",
    )
)
PATHS = {
    "residualModel": ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py",
    "residualProtocol": ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json",
    "residualResults": ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
    "termAblationResults": ROOT / ".agents/outputs/task-218-task216-root-cause/results.json",
    "frozenSixComponentResults": ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json",
    "wetDaughterStates": ROOT / ".agents/outputs/three-percent-water-7c-tpd-ab/source-daughter-states.json",
    "wetReplay": ROOT / ".agents/outputs/three-percent-water-7c-tpd-ab/evidence.json",
    "wetReplayRunner": ROOT / "server/research/three-percent-water-7c-tpd-ab/run.py",
    "cascadeNumericalProtocol": ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json",
    "sevenComponent11Worker": ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component/worker.py",
    "sevenComponent12Worker": ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-2/worker.py",
    "sevenComponent13Worker": ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-3/worker.py",
    "sevenComponent12Cascade": ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py",
    "sevenComponent12Contract": ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine-contract.json",
    "sevenComponent13Cascade": ROOT / "server/research/ecr-pre-pilot-seven-component-native-cascade/engine.py",
    "sevenComponent13Contract": ROOT / "server/research/ecr-pre-pilot-seven-component-native-cascade/engine-contract.json",
    "lleEvidence": ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def preflight(path: Path) -> dict:
    return json.loads(
        subprocess.check_output(
            ["python3.12", str(path), "--preflight"], cwd=ROOT, text=True
        )
    )


def partition_metrics(model, protocol: dict, evidence: dict, parameters) -> dict:
    _, partitions = model.fit_parameters(evidence["tieLines"], protocol)
    return {
        name: model.validation_metrics(parameters, partitions[name])
        for name in ("training", "heldOutTemperature", "heldOutMolecularSystem")
    }


def main() -> None:
    protocol = json.loads((HERE / "protocol.json").read_text())
    pins = protocol["pinnedInputs"]
    pin_map = {
        "residualModelSha256": "residualModel",
        "residualProtocolSha256": "residualProtocol",
        "residualResultsSha256": "residualResults",
        "termAblationResultsSha256": "termAblationResults",
        "frozenSixComponentResultsSha256": "frozenSixComponentResults",
        "wetDaughterStatesSha256": "wetDaughterStates",
        "wetReplayRunnerSha256": "wetReplayRunner",
        "wetReplayEvidenceSha256": "wetReplay",
        "cascadeNumericalProtocolSha256": "cascadeNumericalProtocol",
        "historicalSevenComponent11WorkerSha256": "sevenComponent11Worker",
        "historicalSevenComponent12WorkerSha256": "sevenComponent12Worker",
        "historicalSevenComponent12CascadeSha256": "sevenComponent12Cascade",
        "historicalSevenComponent12ContractSha256": "sevenComponent12Contract",
    }
    for pin, source in pin_map.items():
        actual = sha(PATHS[source])
        if actual != pins[pin]:
            raise RuntimeError(f"PIN_MISMATCH:{pin}:{actual}")

    residual_protocol = json.loads(PATHS["residualProtocol"].read_text())
    residual_results = json.loads(PATHS["residualResults"].read_text())
    ablation = json.loads(PATHS["termAblationResults"].read_text())
    six_component = json.loads(PATHS["frozenSixComponentResults"].read_text())
    wet = json.loads(PATHS["wetReplay"].read_text())
    cascade_protocol = json.loads(PATHS["cascadeNumericalProtocol"].read_text())
    evidence = json.loads(PATHS["lleEvidence"].read_text())
    residual_model = load_module("task236_residual_model", PATHS["residualModel"])
    active = residual_model.np.asarray([
        residual_results["model"]["parameters"][name]
        for name in residual_model.PARAMETER_NAMES
    ])
    native = residual_model.np.zeros(len(residual_model.PARAMETER_NAMES))
    active_metrics = partition_metrics(
        residual_model, residual_protocol, evidence, active
    )
    native_metrics = partition_metrics(
        residual_model, residual_protocol, evidence, native
    )
    ceiling = protocol["frozenAcceptance"]["quantitativeCompositionRmsdCeiling"]
    for matrix in (active_metrics, native_metrics):
        for value in matrix.values():
            value["ceiling"] = ceiling
            value["status"] = (
                "PASS" if value["compositionRmsd"] <= ceiling else "FAIL"
            )
    active_lle_pass = all(row["status"] == "PASS" for row in active_metrics.values())
    native_lle_pass = all(row["status"] == "PASS" for row in native_metrics.values())

    top = {row["ablation"]: row for row in ablation["rankedAblationSummary"]}
    wet_summary = wet["summary"]
    wet_rows = wet["daughterStateComparisons"]
    wet_row_keys = {
        (row["stageCount"], row["stageFromFeedEnd"], row["phase"])
        for row in wet_rows
    }
    numerical_acceptance = cascade_protocol["numericalAcceptance"]
    threshold = float(numerical_acceptance["negativeTpdThreshold"])
    if (
        threshold != float(numerical_acceptance["postSplitTpdThreshold"])
        or threshold != float(wet["method"]["negativeTpdThreshold"])
        or protocol["frozenAcceptance"]["tpdThresholdAuthority"]
        != str(PATHS["cascadeNumericalProtocol"].relative_to(ROOT))
    ):
        raise RuntimeError("TPD_THRESHOLD_AUTHORITY_MISMATCH")
    wet_stability_pass = (
        wet["source"]["daughterStateCount"] == 110
        and len(wet_rows) == 110
        and len(wet_row_keys) == 110
        and wet_summary["nativeNegativeCount"] == 0
        and wet_summary["nativeStableOrNearZeroCount"] == 110
        and all(row["native7c"]["minimum"] >= threshold for row in wet_rows)
    )
    residual_reproduction_pass = (
        wet_summary["residualAddedNegativeCount"] == 110
        and wet["diagnosticConclusion"]
        == "SAME_INHERITED_6C_RESIDUAL_NEGATIVE_BASIN_PROPAGATED_INTO_WET_7C"
    )
    direct_wet_lle_pass = protocol["governance"]["directWaterBearingLleValidated"]
    lle_gate_pass = native_lle_pass and direct_wet_lle_pass
    release_eligible = lle_gate_pass and wet_stability_pass

    engine_11 = preflight(PATHS["sevenComponent11Worker"])
    engine_12 = preflight(PATHS["sevenComponent12Worker"])
    engine_13 = preflight(PATHS["sevenComponent13Worker"])
    if engine_13["residualAmendmentApplied"] is not False:
        raise RuntimeError("SEVEN_COMPONENT_13_RESIDUAL_MUST_BE_DISABLED")
    wet_models = wet["modelDefinitions"]
    if (
        wet_models["activeEngineContractVersion"] != "7C-1.3.0"
        or wet_models["activeEngineSourceSha256"] != sha(PATHS["sevenComponent13Cascade"])
        or wet_models["activeEngineContractSha256"] != sha(PATHS["sevenComponent13Contract"])
        or wet_models["activeWorkerSha256"] != sha(PATHS["sevenComponent13Worker"])
        or wet_models["residualAmendmentAppliedByActiveEngine"] is not False
        or wet["source"]["sourceDaughterStatesFileSha256"]
        != sha(PATHS["wetDaughterStates"])
    ):
        raise RuntimeError("WET_REPLAY_NOT_BOUND_TO_SEVEN_COMPONENT_1_3")

    result = {
        "schemaVersion": "TASK_236_RESIDUAL_REPLACEMENT_QUALIFICATION_V1",
        "decision": {
            "selectedRoute": "7C-1.3.0",
            "thermodynamicModel": "NATIVE_SEVEN_COMPONENT_CCOSMO_2010",
            "residualDisposition": "SCOPED_OUT_NOT_REFIT",
            "whyNotRefit": (
                "The declared dry training and blind partitions do not qualify "
                "the nine-parameter residual, and no admissible direct "
                "water-bearing LLE training or blind partition exists."
            ),
            "cascadeSolverChanged": False,
            "tpdThresholdsChanged": False,
        },
        "termDiagnosis": {
            "dominantBlock": "MONO_NMP",
            "allFrozenStatesStabilizedWhenBlockRemoved": (
                top["MONO_NMP_block"]["positiveDeltaCount"]
                == ablation["fixedStateAggregate"]["activeTPD"]["count"]
            ),
            "fixedStateCount": ablation["fixedStateAggregate"]["activeTPD"]["count"],
            "monoNmpBlock": top["MONO_NMP_block"],
            "largestSingleTerm": {
                "name": "A_MONO_NMP_ref",
                **top["A_MONO_NMP_ref"],
            },
            "satNmpDisposition": (
                "STABILIZING_REMOVAL_MAKES_TPD_MORE_NEGATIVE"
            ),
            "sourceSha256": sha(PATHS["termAblationResults"]),
        },
        "sixComponentQualificationMatrix": {
            "frozenConstrainedCandidate": {
                "status": six_component["status"],
                "qualified": six_component["qualified"],
                "releaseEligible": six_component["releaseEligible"],
                "frozenValidation": six_component["frozenValidation"],
                "sourceSha256": sha(PATHS["frozenSixComponentResults"]),
            },
            "historicalNineParameterResidual": {
                "metrics": active_metrics,
                "declaredLleGatePassed": active_lle_pass,
            },
            "nativeReplacementOnSameDeclaredEvidence": {
                "parameters": [0.0] * len(residual_model.PARAMETER_NAMES),
                "metrics": native_metrics,
                "declaredLleGatePassed": native_lle_pass,
            },
        },
        "wetSevenComponentQualificationMatrix": {
            "temperatureK": wet["source"]["temperatureK"],
            "waterWtPct": 3.0,
            "trialCount": wet["source"]["trialCount"],
            "stageCount": wet["source"]["stageCount"],
            "daughterStateCount": wet["source"]["daughterStateCount"],
            "nativeSevenComponent": {
                "negativeCount": wet_summary["nativeNegativeCount"],
                "stableOrNearZeroCount": wet_summary[
                    "nativeStableOrNearZeroCount"
                ],
                "minimumStats": wet_summary["nativeMinimumStats"],
                "postSplitDaughterStateStabilityPassed": wet_stability_pass,
            },
            "inheritedResidualBaseline": {
                "negativeCount": wet_summary["residualAddedNegativeCount"],
                "minimumStats": wet_summary["residualAddedMinimumStats"],
                "falseInstabilityReproduced": residual_reproduction_pass,
            },
            "negativeTpdThreshold": threshold,
            "tpdThresholdAuthoritySha256": sha(PATHS["cascadeNumericalProtocol"]),
            "cascadeSolverChanged": False,
            "tpdThresholdChanged": False,
            "sourceReplaySha256": sha(PATHS["wetReplay"]),
            "sourceDaughterStatesSha256": sha(PATHS["wetDaughterStates"]),
        },
        "engineLineage": {
            "7C-1.1.0": {
                "engineHash": engine_11["engineHash"],
                "workerSha256": sha(PATHS["sevenComponent11Worker"]),
                "preservedHistoricalResidualRoute": True,
            },
            "7C-1.2.0": {
                "engineHash": engine_12["engineHash"],
                "workerSha256": sha(PATHS["sevenComponent12Worker"]),
                "cascadeSha256": sha(PATHS["sevenComponent12Cascade"]),
                "contractSha256": sha(PATHS["sevenComponent12Contract"]),
                "preservedHistoricalResidualRoute": True,
            },
            "7C-1.3.0": {
                "engineHash": engine_13["engineHash"],
                "workerSha256": sha(PATHS["sevenComponent13Worker"]),
                "cascadeSha256": sha(PATHS["sevenComponent13Cascade"]),
                "contractSha256": sha(PATHS["sevenComponent13Contract"]),
                "newJobDefault": True,
                "residualAmendmentApplied": False,
            },
        },
        "releaseGate": {
            "declaredDryLleReproductionPassed": native_lle_pass,
            "directWaterBearingLleQualificationPassed": direct_wet_lle_pass,
            "lleReproductionGatePassed": lle_gate_pass,
            "postSplitStabilityPassed": wet_stability_pass,
            "bothRequired": True,
            "releaseEligible": release_eligible,
            "status": (
                "QUALIFIED" if release_eligible else "FAIL_CLOSED_NOT_QUALIFIED"
            ),
            "blockers": [
                blocker
                for blocked, blocker in (
                    (
                        not native_lle_pass,
                        "DECLARED_TRAINING_AND_BLIND_LLE_REPRODUCTION_FAILED",
                    ),
                    (
                        not direct_wet_lle_pass,
                        "DIRECT_WATER_BEARING_LLE_QUALIFICATION_MISSING",
                    ),
                    (
                        not wet_stability_pass,
                        "POST_SPLIT_STABILITY_FAILED",
                    ),
                )
                if blocked
            ],
        },
        "pinnedInputHashes": {
            key: sha(value) for key, value in PATHS.items() if value.exists()
        },
    }
    if release_eligible:
        raise RuntimeError("TASK_236_RELEASE_MUST_REMAIN_FAIL_CLOSED")

    OUT.mkdir(parents=True, exist_ok=True)
    results_path = OUT / "results.json"
    report_path = OUT / "report.md"
    results_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report_path.write_text(
        "# Task 236 Residual Replacement Qualification\n\n"
        "## Decision\n\n"
        "The nine-parameter residual is not refit. Its MONO–NMP block is the "
        "demonstrated source of the false basin, but neither the historical "
        "residual nor native cCOSMO reproduces the declared dry LLE evidence "
        "within the frozen 0.03 RMSD gate. No admissible direct water-bearing "
        "LLE partition exists.\n\n"
        "New jobs therefore use separately versioned **7C-1.3.0 native "
        "seven-component cCOSMO**. Historical 7C-1.1.0 and 7C-1.2.0 hashes "
        "remain preserved for exact replay. The 14×N cascade, lattice sizes, "
        "and TPD thresholds are unchanged.\n\n"
        "## Replayed qualification\n\n"
        f"- Frozen wet daughter states: {wet['source']['daughterStateCount']}\n"
        f"- Native negative TPD states: {wet_summary['nativeNegativeCount']}\n"
        f"- Residual-added negative TPD states: "
        f"{wet_summary['residualAddedNegativeCount']}\n"
        f"- Native training composition RMSD: "
        f"{native_metrics['training']['compositionRmsd']:.9f}\n"
        f"- Native held-temperature composition RMSD: "
        f"{native_metrics['heldOutTemperature']['compositionRmsd']:.9f}\n"
        f"- Native held-system composition RMSD: "
        f"{native_metrics['heldOutMolecularSystem']['compositionRmsd']:.9f}\n\n"
        "## Governance\n\n"
        "**FAIL CLOSED — NOT QUALIFIED — NOT RELEASE ELIGIBLE.** Native wet "
        "stability passes this frozen daughter-state replay, but LLE "
        "reproduction and direct wet-LLE qualification do not pass.\n"
    )
    manifest = {
        "schemaVersion": "TASK_236_OUTPUT_MANIFEST_V1",
        "protocolSha256": sha(HERE / "protocol.json"),
        "runnerSha256": sha(Path(__file__)),
        "outputs": {
            "results": sha(results_path),
            "report": sha(report_path),
        },
    }
    (OUT / "provenance-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    try:
        displayed_output = str(results_path.relative_to(ROOT))
    except ValueError:
        displayed_output = str(results_path)
    print(
        json.dumps(
            {
                "status": result["releaseGate"]["status"],
                "releaseEligible": result["releaseGate"]["releaseEligible"],
                "nativeWetNegativeCount": wet_summary["nativeNegativeCount"],
                "residualWetNegativeCount": wet_summary[
                    "residualAddedNegativeCount"
                ],
                "output": displayed_output,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()