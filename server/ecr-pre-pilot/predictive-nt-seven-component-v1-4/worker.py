#!/usr/bin/env python3
"""Immutable 7C-1.4.0 pre-pilot multistage predictive worker."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PARENT_WORKER = ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-2/worker.py"
ENGINE_PATH = ROOT / "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
CONTRACT_PATH = ROOT / "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine-contract.json"
MODEL_PATH = ROOT / "server/research/ecr-pre-pilot-seven-component-rk-cascade/model.py"
TASK238_MODEL = ROOT / "server/research/task-238-nmp-oil-interaction-model/model.py"
TASK238_PROTOCOL = ROOT / "server/research/task-238-nmp-oil-interaction-model/protocol.json"
ENGINE_ID = "ECR2_PRE_PILOT_MULTISTAGE_SEVEN_COMPONENT_NATIVE_RK_CASCADE"
ENGINE_VERSION = "7C-1.4.0"
STATUS = "PRE-PILOT MULTISTAGE PREDICTIVE MODEL"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


parent = load(PARENT_WORKER, "frozen_production_7c_1_2_for_1_4")
scientific = load(ENGINE_PATH, "seven_component_rk_cascade_1_4")
historical_evidence = parent.engine_evidence()
original_complete_trial = parent.complete_trial
original_canonical = parent.canonical
original_wet_charge = parent.legacy.wet_charge
stage1_authority = None


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def engine_evidence():
    files = (
        Path(__file__), ENGINE_PATH, CONTRACT_PATH, MODEL_PATH,
        TASK238_MODEL, TASK238_PROTOCOL,
    )
    records = [{
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha_file(path),
    } for path in files]
    identity = {
        "historicalSevenComponent12EngineHash": historical_evidence["engineHash"],
        "newScientificFiles": records,
        "task238ParameterVectorSha256":
            scientific.replacement.PARAMETER_SHA256,
        "task238ResultsSha256":
            scientific.replacement.TASK238_RESULTS_SHA256,
    }
    engine_hash = hashlib.sha256(original_canonical(identity).encode()).hexdigest()
    return {
        **historical_evidence,
        "engineId": ENGINE_ID,
        "engineVersion": ENGINE_VERSION,
        "engineContractVersion": ENGINE_VERSION,
        "engineHash": engine_hash,
        "modelIdentity":
            "NATIVE_SEVEN_COMPONENT_CCOSMO_2010_PLUS_ADDITIVE_REDLICH_KISTER",
        "nativeGibbsContributionRetained": True,
        "task238ArtifactVersion": "TASK-238-NMP-OIL-RK-0.2.0",
        "task238ParameterVectorSha256": scientific.replacement.PARAMETER_SHA256,
        "cascadeParentContract": "7C-1.2.0",
        "cascadeEquationCountPerStage": 14,
        "routineTpdLatticeDenominator": 4,
        "routineTpdLatticePointCount": 210,
        "exhaustiveEscalationContract": "SAME_MODEL_EXPLICIT_MONO_RICH_SEARCH",
        "historicalEngineHashes": {
            "7C-1.1.0": parent.legacy.engine_evidence()["engineHash"],
            "7C-1.2.0": historical_evidence["engineHash"],
        },
        "verifiedScientificInputCount":
            historical_evidence["verifiedScientificInputCount"] + len(records),
        "verifiedScientificInputAggregateSha256": engine_hash,
    }


def wet_charge(stage1):
    global stage1_authority
    stage1_authority = stage1
    return original_wet_charge(stage1)


def complete_trial(np, raw, feed, solvent, temperature_k):
    trial = original_complete_trial(np, raw, feed, solvent, temperature_k)
    assert stage1_authority is not None
    metrics = trial["productMetrics"]
    checks = {
        "minimumRaffinateSaturatesWt": (
            metrics["raffinateSaturatesWtNmpFree"],
            float(stage1_authority["minimumRaffinateSaturatesWt"]), "MINIMUM"
        ),
        "maximumRaffinateTotalAromaticsWt": (
            metrics["raffinateTotalAromaticsWtNmpFree"],
            float(stage1_authority["targetRaffinateTotalAromaticsWt"]), "MAXIMUM"
        ),
        "maximumRaffinatePolarAromaticsWt": (
            metrics["raffinatePolarAromaticsWtNmpFree"],
            float(stage1_authority["targetRaffinatePolarAromaticsWt"]), "MAXIMUM"
        ),
        "maximumNmpRaffinateWt": (
            metrics["nmpInTotalRaffinateWt"],
            float(stage1_authority["maximumNmpRaffinateWt"]), "MAXIMUM"
        ),
        "minimumRecoveryPct": (
            metrics["nmpFreeHydrocarbonRecoveryPct"],
            float(stage1_authority["minimumRecoveryPct"]), "MINIMUM"
        ),
    }
    compliance = {}
    for name, (calculated, target, direction) in checks.items():
        passed = calculated >= target if direction == "MINIMUM" else calculated <= target
        compliance[name] = {
            "status": "PASS" if passed else "FAIL",
            "calculated": calculated, "target": target, "direction": direction,
        }
    compliance["targetRaffinateSulfurPpm"] = {
        "status": "NOT_CALCULABLE", "calculated": None,
        "target": float(stage1_authority["targetRaffinateSulfurPpm"]),
    }
    targets_pass = all(row["status"] == "PASS" for row in compliance.values()
                       if row["status"] != "NOT_CALCULABLE")
    physical = all(
        stage["maximumCompositionSeparation"] >=
        scientific.protocol()["numericalAcceptance"]["minimumPhaseCompositionSeparation"]
        for stage in raw["stages"]
    )
    mono_audit_accepted = all(
        stage["postSplitTpdSearch"][phase]["explicitMonoRichBasinSearch"]
        .get("allRequiredSearchesAccepted") is True
        for stage in raw["stages"] for phase in ("raffinate", "extract")
    )
    for stage in trial["stages"]:
        stage_mono_audit = all(
            stage["postSplitTpdSearch"][phase]["explicitMonoRichBasinSearch"]
            .get("allRequiredSearchesAccepted") is True
            for phase in ("raffinate", "extract")
        )
        stage["explicitMonoRichBasinAuditAccepted"] = stage_mono_audit
        if not stage_mono_audit:
            stage["accepted"] = False
            stage["governanceClassification"] = "NO_PHYSICAL_LLE"
    accepted = bool(
        trial["numericalAcceptancePassed"] and targets_pass and physical
        and mono_audit_accepted
    )
    trial.update({
        "targetCompliance": compliance,
        "allCalculableTargetsPass": targets_pass,
        "physicalLleClassification":
            "PHYSICAL_LLE" if physical and mono_audit_accepted else "NO_PHYSICAL_LLE",
        "explicitMonoRichBasinAuditAccepted": mono_audit_accepted,
        "governanceClassification":
            "GOVERNED_RESULT" if accepted else
            ("NO_PHYSICAL_LLE" if not physical else "NUMERICALLY_OR_TARGET_REJECTED"),
        "accepted": accepted,
        "releaseEligible": False,
        "qualificationStatus": STATUS,
        "diagnosticContinuationUsed": not trial["numericalAcceptancePassed"],
    })
    return trial


def canonical(value):
    if isinstance(value, dict) and value.get("schemaVersion") == \
            "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1":
        accepted = [trial for trial in value.get("trials", []) if trial.get("accepted")]
        predictive_nt = min((trial["stageCount"] for trial in accepted), default=None)
        value = {
            **value,
            "status": STATUS,
            "predictiveQualification": "PRE_PILOT_MULTISTAGE_PREDICTIVE",
            "predictiveNt": predictive_nt,
            "establishedTheoreticalStages": predictive_nt,
            "calibrationRequired": False,
            "executionStatus": "COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX",
            "governedTrialsAccepted": len(accepted),
            "diagnosticTrialsCalculated": sum(
                trial.get("diagnosticContinuationUsed", False)
                for trial in value.get("trials", [])
            ),
            "qualificationEvidence": {
                "experimentalWetLleRequiredForExecution": False,
                "modelBasis": "TASK_219_236_ANALYSIS_AND_TASK_238_CANDIDATE_HISTORY",
            },
        }
    return original_canonical(value)


parent.scientific = scientific
parent.ENGINE_ID = ENGINE_ID
parent.ENGINE_VERSION = ENGINE_VERSION
parent.STATUS = STATUS
parent.engine_evidence = engine_evidence
parent.complete_trial = complete_trial
parent.canonical = canonical
parent.legacy.wet_charge = wet_charge


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        print(original_canonical({
            "status": "PASS",
            "python": f"{sys.version_info.major}.{sys.version_info.minor}",
            **engine_evidence(),
            "checkpointProtocol": parent.CHECKPOINT_PROTOCOL,
            "governanceStatus": STATUS,
        }))
    else:
        parent.main()