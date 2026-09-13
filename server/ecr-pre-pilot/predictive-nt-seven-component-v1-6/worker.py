#!/usr/bin/env python3
"""Immutable 7C-1.6.0 worker for the authorized N_T=1..10 sweep.

The thermodynamic model and all acceptance gates are inherited from the frozen
7C-1.5 worker.  This contract changes orchestration only: every configured
trial is solved in order, its complete payload is ACKed before the next trial
starts, and the last acknowledged continuation state is the only resume
lineage accepted.
"""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FROZEN_PATH = ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-5/worker.py"
ENGINE_ID = "ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O_SWEEP"
ENGINE_VERSION = "7C-1.6.0"
CHECKPOINT_PROTOCOL = "ACK_V3_ENGINE_CONTRACT"
SWEEP_MAXIMUM = 10


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


frozen = load(FROZEN_PATH, "frozen_production_7c_1_5_for_1_6_sweep")
historical_evidence = frozen.engine_evidence()
original_canonical = frozen.original_canonical
parent = frozen.parent
legacy = parent.parent
complete_trial = frozen.complete_trial
wet_charge = frozen.wet_charge


def canonical(value):
    return frozen.canonical(value)


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def engine_evidence():
    identity = {
        "historicalSevenComponent15EngineHash": historical_evidence["engineHash"],
        "worker": {
            "path": Path(__file__).relative_to(ROOT).as_posix(),
            "bytes": Path(__file__).stat().st_size,
            "sha256": sha_file(__file__),
        },
        "orchestration": {
            "contract": ENGINE_VERSION,
            "orderedTrialCounts": list(range(1, SWEEP_MAXIMUM + 1)),
            "ackRequiredBeforeAdvance": True,
            "alwaysAttemptsFullSweep": True,
        },
    }
    engine_hash = hashlib.sha256(
        original_canonical(identity).encode()
    ).hexdigest()
    return {
        **historical_evidence,
        "engineId": ENGINE_ID,
        "engineVersion": ENGINE_VERSION,
        "engineContractVersion": ENGINE_VERSION,
        "engineHash": engine_hash,
        "historicalEngineHashes": {
            **historical_evidence.get("historicalEngineHashes", {}),
            "7C-1.5.0": historical_evidence["engineHash"],
        },
        "orderedTrialCounts": list(range(1, SWEEP_MAXIMUM + 1)),
        "sweepMaximumStages": SWEEP_MAXIMUM,
        "ackRequiredBeforeAdvance": True,
        "alwaysAttemptsFullSweep": True,
        "scientificModelContract": "7C-1.5.0_UNCHANGED",
        "verifiedScientificInputAggregateSha256": engine_hash,
    }


def continuation(np, value, count):
    if count == 0:
        if value != {
            "raffinateComponentMoles": [],
            "extractComponentMoles": [],
        }:
            raise ValueError("PREDICTIVE_NT_7C_RESUME_LINEAGE_INVALID")
        return None
    return legacy.continuation(np, value, count)


def advance_continuation(raw, state, count):
    return legacy.advance_continuation(raw, state, count)


def emit_checkpoint(trial, state, continuation_stage_count):
    trial_text = canonical(trial)
    payload = {
        "protocol": CHECKPOINT_PROTOCOL,
        "engineContractVersion": ENGINE_VERSION,
        "componentOrder": list(legacy.FAMILIES),
        "continuationState": state,
        "continuationStageCount": continuation_stage_count,
        "trialCanonical": trial_text,
        "trialHash": hashlib.sha256(trial_text.encode()).hexdigest(),
    }
    payload_text = canonical(payload)
    payload_hash = hashlib.sha256(payload_text.encode()).hexdigest()
    print(
        f"PREDICTIVE_NT_CHECKPOINT {trial['stageCount']} {payload_hash} "
        f"{base64.b64encode(payload_text.encode()).decode()}",
        file=sys.stderr,
        flush=True,
    )
    if sys.stdin.readline().strip() != (
        f"PREDICTIVE_NT_ACK {trial['stageCount']} {payload_hash}"
    ):
        raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")


def sweep_main():
    request = json.loads(sys.stdin.readline())
    if request.get("engineContractVersion") != ENGINE_VERSION:
        raise ValueError("PREDICTIVE_NT_7C_ENGINE_CONTRACT_REQUIRED")
    evidence = engine_evidence()
    if request.get("engineHash") != evidence["engineHash"]:
        raise ValueError("PREDICTIVE_NT_REQUEST_ENGINE_HASH_MISMATCH")
    if request.get("maximumStages") != SWEEP_MAXIMUM:
        raise ValueError("PREDICTIVE_NT_SWEEP_MAXIMUM_REQUIRED")
    if request.get("ntTest") is not None:
        raise ValueError("PREDICTIVE_NT_SINGLE_TEST_FORBIDDEN")
    stage1 = request.get("stage1Authority", {}).get("source", {}).get("stage1")
    if not isinstance(stage1, dict):
        raise ValueError("STAGE1_AUTHORITY_INVALID")
    temperature_c = float(stage1["operatingTemperatureC"])
    if not math.isfinite(temperature_c):
        raise ValueError("STAGE1_OPERATING_TEMPERATURE_INVALID")
    temperature_k = float(stage1["temperatureK"])
    if (
        not math.isfinite(temperature_k)
        or abs(temperature_k - (temperature_c + 273.15)) > 1e-12
    ):
        raise ValueError("STAGE1_TEMPERATURE_AUTHORITY_MISMATCH")
    feed, solvent, wet = wet_charge(stage1)
    temporary, engine, integrity, runtime = parent.scientific.build_engine(
        temperature_k, wet["waterWeightPercentOfWetSolvent"]
    )
    np = engine.np
    continuation_state = {
        "raffinateComponentMoles": [],
        "extractComponentMoles": [],
    }
    continuation_stage_count = 0
    trials = []
    try:
        resume = request.get("_resume")
        if resume:
            acknowledged = resume.get("acknowledgedStageCount")
            trials = resume.get("trials")
            continuation_state = resume.get("continuationState")
            continuation_stage_count = resume.get("continuationStageCount")
            if (
                resume.get("engineContractVersion") != ENGINE_VERSION
                or not isinstance(acknowledged, int)
                or acknowledged < 1
                or acknowledged > SWEEP_MAXIMUM
                or not isinstance(trials, list)
                or len(trials) != acknowledged
                or [trial.get("stageCount") for trial in trials]
                != list(range(1, acknowledged + 1))
                or not isinstance(continuation_stage_count, int)
                or continuation_stage_count < 0
                or continuation_stage_count > acknowledged
            ):
                raise ValueError("PREDICTIVE_NT_7C_RESUME_PREFIX_INVALID")
            previous = continuation(np, continuation_state, continuation_stage_count)
            start = acknowledged + 1
        else:
            previous = None
            start = 1
        for count in range(start, SWEEP_MAXIMUM + 1):
            raw = engine.solve_cascade(
                count, temperature_k, feed, solvent, previous
            )
            trial = complete_trial(
                np, raw, feed, solvent, temperature_k
            )
            continuation_state, continuation_stage_count = advance_continuation(
                raw, continuation_state, continuation_stage_count
            )
            emit_checkpoint(trial, continuation_state, continuation_stage_count)
            trials.append(trial)
            if continuation_stage_count:
                previous = continuation(
                    np, continuation_state, continuation_stage_count
                )
            print(
                "PREDICTIVE_NT_PERFORMANCE "
                f"{count} "
                f"{base64.b64encode(canonical(engine.metrics).encode()).decode()}",
                file=sys.stderr, flush=True,
            )
            print(
                f"PREDICTIVE_NT_PROGRESS {count} {SWEEP_MAXIMUM}",
                file=sys.stderr, flush=True,
            )
        accepted_trials = [
            trial for trial in trials if trial.get("accepted") is True
        ]
        selected_trial = (
            min(accepted_trials, key=lambda trial: trial["stageCount"])
            if accepted_trials else None
        )
        sulfur_prediction = (
            selected_trial.get("sulfurPrediction")
            if selected_trial is not None
            else {
                "status": "NOT_CALCULABLE",
                "reason": "NO_ACCEPTED_PREDICTIVE_TRIAL",
                "basis": "GOVERNED_STAGE1_SULFUR_ALLOCATION_POST_PROCESSING",
                "predictedRaffinateSulfurPpm": None,
                "sulfurRemovalPct": None,
                "targetStatus": "NOT_CALCULABLE",
            }
        )
        final = {
            "schemaVersion": "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1",
            "engineContractVersion": ENGINE_VERSION,
            "componentOrder": list(legacy.FAMILIES),
            "status": frozen.STATUS,
            "implementationStatus": "IMPLEMENTED",
            "predictiveQualification": "PRE_PILOT_MULTISTAGE_PREDICTIVE",
            "releaseEligible": False,
            "predictiveNt": (
                selected_trial["stageCount"] if selected_trial is not None else None
            ),
            "establishedTheoreticalStages": (
                selected_trial["stageCount"] if selected_trial is not None else None
            ),
            "pilotValidated": False,
            "calibrationRequired": False,
            "sulfurPrediction": sulfur_prediction,
            "thermodynamicCondition": {
                "temperatureC": temperature_c,
                "temperatureK": temperature_k,
                "authority": "IMMUTABLE_STAGE1_OPERATING_TEMPERATURE",
            },
            "wetSolventConstruction": wet,
            "engine": evidence,
            "scientificRuntime": runtime,
            "scientificIntegrity": integrity,
            "qualificationEvidence": {
                "experimentalWetLleRequiredForExecution": False,
                "modelBasis": "TASK_219_236_ANALYSIS_AND_TASK_238_CANDIDATE_HISTORY",
            },
            "executionStatus": "COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX",
            "trialsAttempted": len(trials),
            "governedTrialsAccepted": sum(
                bool(trial.get("accepted")) for trial in trials
            ),
            "diagnosticTrialsCalculated": sum(
                bool(trial.get("diagnosticContinuationUsed")) for trial in trials
            ),
            "trials": trials,
        }
        print(canonical(final), end="")
    finally:
        temporary.cleanup()


# Make the inherited current-model helpers emit this immutable contract in
# checkpoint lineage. No historical source is edited by this worker.
parent.ENGINE_ID = ENGINE_ID
parent.ENGINE_VERSION = ENGINE_VERSION
parent.STATUS = frozen.STATUS
legacy.ENGINE_VERSION = ENGINE_VERSION
legacy.CHECKPOINT_PROTOCOL = CHECKPOINT_PROTOCOL


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        print(original_canonical({
            "status": "PASS",
            "python": f"{sys.version_info.major}.{sys.version_info.minor}",
            **engine_evidence(),
            "checkpointProtocol": CHECKPOINT_PROTOCOL,
            "governanceStatus": frozen.STATUS,
        }))
    else:
        sweep_main()