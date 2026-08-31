#!/usr/bin/env python3
"""Independent fail-closed verification of the Task-218 development candidate."""
from __future__ import annotations

import importlib.util
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/task-218-root-cause-candidate"

spec = importlib.util.spec_from_file_location("task218_candidate_runner_verify", HERE / "run.py")
runner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = runner
spec.loader.exec_module(runner)


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def close(left, right, tolerance=2e-8):
    return abs(float(left) - float(right)) <= tolerance


def main():
    protocol = json.loads((HERE / "protocol.json").read_text())
    result = json.loads((OUT / "results.json").read_text())
    manifest = json.loads((OUT / "provenance-manifest.json").read_text())
    for key, path in {
        "protocolSha256": HERE / "protocol.json",
        "runnerSha256": HERE / "run.py",
        "verifierSha256": HERE / "verify.py",
        "resultsSha256": OUT / "results.json",
        "reportSha256": OUT / "report.md",
    }.items():
        require(manifest[key] == runner.sha(path), f"OUTPUT_HASH_MISMATCH:{key}")
    require(manifest["pinnedInputs"] == protocol["pinnedInputs"] == result["pinnedInputs"], "PIN_SET_MISMATCH")
    for key, path in runner.pinned_paths().items():
        require(path.is_file() and runner.sha(path) == protocol["pinnedInputs"][key], f"PIN_MISMATCH:{key}")
    source = json.loads(runner.JOB.read_text())
    task216_protocol = json.loads(runner.pinned_paths()["task216ProtocolSha256"].read_text())
    require(task216_protocol["referenceJob"]["priorResultSnapshotSha256"] == protocol["pinnedInputs"]["task216PriorResultSnapshotSha256"], "TASK216_REFERENCE_RESULT_HASH_BINDING_MISMATCH")
    require(runner.snapshot_sha(source["input_snapshot"]) == protocol["pinnedInputs"]["referenceInputSnapshotSha256"], "REFERENCE_INPUT_HASH_MISMATCH")
    require(runner.snapshot_sha(source["result_snapshot"]) == protocol["pinnedInputs"]["referenceResultSnapshotSha256"], "REFERENCE_RESULT_HASH_MISMATCH")
    model = runner.load_model()
    require(tuple(result["parameterOrder"]) == tuple(model.PARAMETER_NAMES), "PARAMETER_ORDER_MISMATCH")
    require(tuple(result["componentOrder"]) == tuple(model.FAMILIES), "COMPONENT_ORDER_MISMATCH")
    p = model.np.asarray(result["orderedParameterVector"], float)
    require(len(p) == 9 and model.np.all(model.np.isfinite(p)), "PARAMETER_VECTOR_INVALID")
    require(model.np.all(model.np.abs(p) <= protocol["fit"]["absoluteParameterBound"]), "PARAMETER_BOUND_FAILED")
    require(
        [result["parameters"][name] for name in result["parameterOrder"]] == result["orderedParameterVector"],
        "ORDERED_PARAMETER_BINDING_FAILED",
    )
    payload = {
        "modelSourceSha256": protocol["pinnedInputs"]["amendmentModelSha256"],
        "protocolSha256": runner.sha(HERE / "protocol.json"),
        "orderedParameterVector": result["orderedParameterVector"],
        "evidenceSha256": protocol["pinnedInputs"]["evidenceSha256"],
        "rootCauseSha256": protocol["pinnedInputs"]["rootCauseResultsSha256"],
        "componentOrder": protocol["componentOrder"],
        "mathematicalForm": protocol["mathematicalForm"],
    }
    require(payload == result["candidateModelIdentityPayload"], "CANDIDATE_IDENTITY_PAYLOAD_MISMATCH")
    require(runner.canonical_sha(payload) == result["candidateModelSha256"] == manifest["candidateModelSha256"], "CANDIDATE_MODEL_HASH_MISMATCH")

    rootcause = json.loads(runner.ROOT_CAUSE.read_text())
    require(len(rootcause["cases"]) == 57 == len(result["developmentConstraintAudits"]), "DEVELOPMENT_CONSTRAINT_COVERAGE_FAILED")
    recomputed = []
    for source_row, saved in zip(rootcause["cases"], result["developmentConstraintAudits"]):
        c, a = runner.tpd_form(model, source_row["temperatureK"] if "temperatureK" in source_row else rootcause["temperatureK"], source_row["z"], source_row["wStar"])
        value = float(c + a @ p)
        require(source_row["id"] == saved["id"] and source_row["z"] == saved["z"] and source_row["wStar"] == saved["wStar"], "DEVELOPMENT_PAIR_IDENTITY_FAILED")
        require(close(value, saved["completeTpd"], 2e-10) and value >= 0, "DEVELOPMENT_TPD_CONSTRAINT_FAILED")
        recomputed.append(value)
    require(close(min(recomputed), result["fitDiagnostics"]["minimumConstraintTpd"], 2e-10), "MINIMUM_CONSTRAINT_MISMATCH")

    evidence = json.loads(runner.EVIDENCE.read_text())
    base_protocol = json.loads(runner.AMEND_PROTOCOL.read_text())
    _, partitions = model.fit_parameters(evidence["tieLines"], base_protocol)
    train = partitions["training"]
    residual = model.np.concatenate([model._row_equilibrium(p, row) for row in train])
    objective = 0.5 * float(residual @ residual + protocol["fit"]["ridgePenalty"] * (p @ p))
    require(close(objective, result["fitDiagnostics"]["objective"], 2e-8), "FROZEN_OBJECTIVE_MISMATCH")
    validation, carried = runner.validation_and_topology(model, p, partitions, protocol["frozenGates"])
    for key in validation:
        require(close(validation[key]["compositionRmsd"], result["frozenValidation"][key]["compositionRmsd"]), f"VALIDATION_MISMATCH:{key}")
        require(validation[key]["status"] == result["frozenValidation"][key]["status"], f"VALIDATION_STATUS_MISMATCH:{key}")
    require(close(carried["topologyRecall"], result["carriedTopologyAndTieLineGates"]["topologyRecall"]), "TOPOLOGY_RECOMPUTE_MISMATCH")
    require(close(carried["tieLineCompositionRmsd"], result["carriedTopologyAndTieLineGates"]["tieLineCompositionRmsd"]), "TIELINE_RECOMPUTE_MISMATCH")

    temperature, z, _ = runner.stage1_charge(model, source["input_snapshot"])
    flash = model.flash(model.FAMILIES, temperature, z, p, base_protocol)
    saved_flash = result["stage1Flash"]
    require(flash["accepted"] == saved_flash["accepted"] == saved_flash["validAcceptedTwoLiquidSeedExists"], "FLASH_ACCEPTANCE_MISMATCH")
    require(close(flash["materialBalanceMaxResidual"], saved_flash["materialBalanceMaxResidual"], 2e-8), "FLASH_CLOSURE_MISMATCH")
    require(close(flash["isoactivityLogResidual"], saved_flash["isoactivityLogResidual"], 2e-8), "FLASH_IDENTITY_MISMATCH")
    require(close(flash["betaExtract"], saved_flash["betaExtract"], 2e-8), "FLASH_FRACTION_MISMATCH")
    reconstructed = (1 - flash["betaExtract"]) * model.np.asarray(flash["raffinate"]) + flash["betaExtract"] * model.np.asarray(flash["extract"])
    require(float(model.np.max(model.np.abs(reconstructed - model.np.asarray(z)))) <= base_protocol["numericalAcceptance"]["maximumMaterialBalanceResidual"], "FLASH_MATERIAL_BALANCE_FAILED")

    governance = result["governance"]
    require(
        governance == protocol["governance"]
        and governance["researchOnly"] is True
        and governance["qualified"] is False
        and governance["qualificationPerformed"] is False
        and governance["productionCodeModified"] is False
        and governance["releaseEligible"] is False
        and governance["predictiveNt"] is None
        and governance["candidateCascadeRun"] is False
        and result["qualified"] is False
        and result["developmentConstraintDisposition"] == "DIAGNOSTIC_DEVELOPMENT_CONSTRAINTS"
        and result["candidateGeneratedEndpoints"] is False,
        "GOVERNANCE_FAILED",
    )
    forbidden = set(protocol["prohibitedFitInputs"])
    require(not forbidden.intersection(result["objectiveInputs"] + result["constraintInputs"]), "PROHIBITED_FIT_INPUT_PRESENT")
    expected_blockers = []
    if any(value["status"] != "PASS" for value in validation.values()):
        expected_blockers.append("FROZEN_COMPOSITION_VALIDATION_FAILED")
    if carried["topologyStatus"] != "PASS":
        expected_blockers.append("CARRIED_TOPOLOGY_GATE_FAILED")
    if carried["tieLineStatus"] != "PASS":
        expected_blockers.append("CARRIED_TIE_LINE_GATE_FAILED")
    task213 = json.loads(runner.pinned_paths()["task213ResultsSha256"].read_text())
    direct = bool(task213["molecularAndPhaseEquilibriumEvidence"]["directMatchingSixComponentEvidenceAvailable"])
    if not direct:
        expected_blockers.append("DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING")
    if not flash["accepted"]:
        expected_blockers.append("CANDIDATE_STAGE1_TWO_LIQUID_SEED_NOT_ACCEPTED")
    require(result["blockers"] == expected_blockers, "BLOCKER_SET_MISMATCH")
    require(result["status"] == ("BLOCKED_FAIL_CLOSED" if expected_blockers else "DEVELOPMENT_GATES_PASS_NOT_QUALIFIED"), "FAIL_CLOSED_STATUS_MISMATCH")
    print(json.dumps({
        "status": "PASS", "candidateModelSha256": result["candidateModelSha256"],
        "minimumDevelopmentConstraintTpd": min(recomputed),
        "validation": {key: value["status"] for key, value in validation.items()},
        "flashAccepted": flash["accepted"], "blockers": expected_blockers,
    }, sort_keys=True))


if __name__ == "__main__":
    main()