#!/usr/bin/env python3
"""Production ACK_V3 worker for the 7C-1.2.0 simultaneous cascade."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
LEGACY_PATH = ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component/worker.py"
ENGINE_PATH = ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
CONTRACT_PATH = ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine-contract.json"
FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
MW = (170.3348, 120.194, 142.1971, 202.2506, 405.58, 99.1311, 18.01528)
ENGINE_ID = "ECR2_PREDICTIVE_NT_SEVEN_COMPONENT_SIMULTANEOUS_COUPLED_CASCADE"
ENGINE_VERSION = "7C-1.2.0"
CHECKPOINT_PROTOCOL = "ACK_V3_ENGINE_CONTRACT"
STATUS = "IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


legacy = load(LEGACY_PATH, "frozen_production_7c_1_1")
scientific = load(ENGINE_PATH, "seven_component_simultaneous_cascade_1_2")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def engine_evidence():
    inherited = legacy.engine_evidence()
    additions = [Path(__file__), ENGINE_PATH, CONTRACT_PATH]
    records = [
        {"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size,
         "sha256": sha_file(path)}
        for path in additions
    ]
    identity = {
        "legacyScientificRuntimeAggregateSha256":
            inherited["scientificRuntimeAggregateSha256"],
        "newScientificFiles": records,
    }
    engine_hash = hashlib.sha256(canonical(identity).encode()).hexdigest()
    return {
        **inherited,
        "engineId": ENGINE_ID,
        "engineVersion": ENGINE_VERSION,
        "engineContractVersion": ENGINE_VERSION,
        "engineHash": engine_hash,
        "modelIdentity":
            "COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL + H2O_EXTENSION",
        "componentOrder": list(FAMILIES),
        "cascadeEquationCountPerStage": 14,
        "routineTpdLatticeDenominator": 4,
        "routineTpdLatticePointCount": 210,
        "exhaustiveEscalationContract": "7C-1.1.0",
        "verifiedScientificInputCount":
            inherited["verifiedScientificInputCount"] + len(records),
        "verifiedScientificInputAggregateSha256": engine_hash,
    }


def stream(np, flow):
    flow = np.asarray(flow, dtype=float)
    mass = flow * np.asarray(MW)
    return {
        "componentMoles": flow.tolist(),
        "componentMass": mass.tolist(),
        "flowMol": float(flow.sum()),
        "mass": float(mass.sum()),
        "moleFractions": (flow / flow.sum()).tolist(),
        "massFractions": (mass / mass.sum()).tolist(),
    }


def continuation(np, value, count):
    try:
        r = np.asarray(value["raffinateComponentMoles"], dtype=float)
        e = np.asarray(value["extractComponentMoles"], dtype=float)
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("PREDICTIVE_NT_7C_RESUME_STATE_INVALID") from exc
    if (
        r.shape != (count, 7) or e.shape != (count, 7)
        or not np.all(np.isfinite(r)) or not np.all(np.isfinite(e))
        or np.any(r <= 0) or np.any(e <= 0)
    ):
        raise ValueError("PREDICTIVE_NT_7C_RESUME_STATE_INVALID")
    return r, e


def continuation_eligible(raw):
    """Only a reproduced pair of closed coupled solves may seed N+1."""
    return bool(raw.get("bothEndpointsClosed") and raw.get("branchReproduced"))


def advance_continuation(raw, prior_state, prior_count):
    """Retain the last closed/reproduced lineage across diagnostic trials."""
    if continuation_eligible(raw):
        return {
            "raffinateComponentMoles": raw["raffinateComponentMoles"],
            "extractComponentMoles": raw["extractComponentMoles"],
        }, raw["stageCount"]
    return prior_state, prior_count


def complete_trial(np, raw, feed, solvent, temperature_k):
    r = np.asarray(raw["raffinateComponentMoles"], dtype=float)
    e = np.asarray(raw["extractComponentMoles"], dtype=float)
    count = raw["stageCount"]
    gates = scientific.protocol()["numericalAcceptance"]
    stages = []
    for index, evidence in enumerate(raw["stages"]):
        r_in = np.asarray(feed) if index == 0 else r[index - 1]
        e_in = np.asarray(solvent) if index == count - 1 else e[index + 1]
        stage_accepted = bool(
            evidence["maximumComponentBalanceResidualMol"]
            <= gates["maximumOverallComponentBalanceResidualMol"]
            and evidence["isoactivityLogResidual"]
            <= gates["maximumIsoactivityLogResidual"]
            and evidence["maximumCompositionSeparation"]
            >= gates["minimumPhaseCompositionSeparation"]
            and evidence["stageGibbsReduction"]
            >= gates["minimumStageGibbsReduction"]
            and all(
                evidence["localPostSplitStability"][phase]["minimumEigenvalue"]
                >= gates["minimumLocalStabilityCurvature"]
                and evidence["localPostSplitStability"][phase]["stepSizeConverged"]
                for phase in ("raffinate", "extract")
            )
            and all(
                evidence["postSplitTpdSearch"][phase]["minimum"]
                >= gates["postSplitTpdThreshold"]
                for phase in ("raffinate", "extract")
            )
            and all(
                evidence["postSplitTpdSearch"][phase]["allRefinementsAccepted"]
                for phase in ("raffinate", "extract")
            )
        )
        stages.append({
            **evidence,
            "componentOrder": list(FAMILIES),
            "raffinateIncoming": stream(np, r_in),
            "extractIncoming": stream(np, e_in),
            "raffinateLeaving": stream(np, r[index]),
            "extractLeaving": stream(np, e[index]),
            "accepted": stage_accepted,
            "governanceClassification": (
                "GOVERNED_EQUILIBRIUM" if stage_accepted
                else "NON_GOVERNED_METASTABLE_OR_UNRESOLVED_NOT_RELEASE_ELIGIBLE"
            ),
        })
    overall = np.asarray(feed) + np.asarray(solvent) - r[-1] - e[0]
    feed_mass = np.asarray(feed) * np.asarray(MW)
    product_mass = r[-1] * np.asarray(MW)
    hydrocarbon_feed = float(feed_mass[:5].sum())
    hydrocarbon_product = float(product_mass[:5].sum())
    hydrocarbon_fraction = product_mass[:5] / hydrocarbon_product
    numerical = bool(raw["accepted"] and all(stage["accepted"] for stage in stages))
    return {
        "stageCount": count,
        "equationVariableCount": raw["equationVariableCount"],
        "equationResidualCount": raw["equationResidualCount"],
        "solverTerminationStatus": "CONVERGED" if raw["bothEndpointsClosed"] else "UNCLOSED",
        "residualClosureStatus": "CLOSED" if raw["bothEndpointsClosed"] else "UNCLOSED",
        "maximumScaledEquationResidual": raw["primaryMaximumScaledEquationResidual"],
        "secondaryMaximumScaledEquationResidual": raw["secondaryMaximumScaledEquationResidual"],
        "branchProductRelativeDifference": raw["branchProductRelativeDifference"],
        "branchReproduced": raw["branchReproduced"],
        "overallComponentBalanceResidualMol": overall.tolist(),
        "overallComponentBalanceResidualMass": (overall * np.asarray(MW)).tolist(),
        "maximumOverallComponentBalanceResidualMol":
            float(np.max(np.abs(overall))),
        "stages": stages,
        "boundaryStreams": {
            "oilFeed": stream(np, feed),
            "freshWetSolvent": stream(np, solvent),
            "finalRaffinate": stream(np, r[-1]),
            "finalExtract": stream(np, e[0]),
        },
        "productMetrics": {
            "nmpFreeHydrocarbonRecoveryPct":
                100 * hydrocarbon_product / hydrocarbon_feed,
            "raffinateSaturatesWtNmpFree": 100 * hydrocarbon_fraction[0],
            "raffinateTotalAromaticsWtNmpFree":
                100 * hydrocarbon_fraction[1:4].sum(),
            "raffinatePolarAromaticsWtNmpFree": 100 * hydrocarbon_fraction[4],
            "nmpInTotalRaffinateWt": 100 * product_mass[5] / product_mass.sum(),
            "h2oInTotalRaffinateWt": 100 * product_mass[6] / product_mass.sum(),
        },
        "targetCompliance": {
            "targetRaffinateSulfurPpm": {
                "status": "NOT_CALCULABLE", "calculated": None, "target": None,
            },
        },
        "allCalculableTargetsPass": False,
        "numericalAcceptancePassed": numerical,
        "diagnosticContinuationUsed": not numerical,
        "governanceClassification": (
            "GOVERNED_RESULT" if numerical
            else "NON_GOVERNED_METASTABLE_OR_UNRESOLVED_NOT_RELEASE_ELIGIBLE"
        ),
        "accepted": False,
        "releaseEligible": False,
        "qualificationStatus": STATUS,
    }


def emit_checkpoint(trial, state, continuation_stage_count):
    trial_text = canonical(trial)
    payload = {
        "protocol": CHECKPOINT_PROTOCOL,
        "engineContractVersion": ENGINE_VERSION,
        "componentOrder": list(FAMILIES),
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
        file=sys.stderr, flush=True,
    )
    if sys.stdin.readline().strip() != (
        f"PREDICTIVE_NT_ACK {trial['stageCount']} {payload_hash}"
    ):
        raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")


def main():
    request = json.loads(sys.stdin.readline())
    if request.get("engineContractVersion") != ENGINE_VERSION:
        raise ValueError("PREDICTIVE_NT_7C_ENGINE_CONTRACT_REQUIRED")
    evidence = engine_evidence()
    if request.get("engineHash") != evidence["engineHash"]:
        raise ValueError("PREDICTIVE_NT_REQUEST_ENGINE_HASH_MISMATCH")
    stage1 = request.get("stage1Authority", {}).get("source", {}).get("stage1")
    if not isinstance(stage1, dict):
        raise ValueError("STAGE1_AUTHORITY_INVALID")
    maximum = int(stage1["maximumStages"])
    if maximum < 1 or maximum > 10:
        raise ValueError("STAGE1_INVALID_NT_RANGE")
    temperature_c = float(stage1["operatingTemperatureC"])
    if not math.isfinite(temperature_c):
        raise ValueError("STAGE1_OPERATING_TEMPERATURE_INVALID")
    temperature_k = temperature_c + 273.15
    feed, solvent, wet = legacy.wet_charge(stage1)
    temporary, engine, integrity, runtime = scientific.build_engine(
        temperature_k, wet["waterWeightPercentOfWetSolvent"]
    )
    np = engine.np
    try:
        trials = []
        previous = None
        continuation_state = {
            "raffinateComponentMoles": [],
            "extractComponentMoles": [],
        }
        continuation_stage_count = 0
        start = 1
        resume = request.get("_resume")
        if resume:
            if resume.get("engineContractVersion") != ENGINE_VERSION:
                raise ValueError("PREDICTIVE_NT_CROSS_ENGINE_RESUME_FORBIDDEN")
            acknowledged = resume.get("acknowledgedStageCount")
            trials = resume.get("trials")
            if (
                not isinstance(acknowledged, int) or not isinstance(trials, list)
                or len(trials) != acknowledged
            ):
                raise ValueError("PREDICTIVE_NT_7C_RESUME_PREFIX_INVALID")
            continuation_stage_count = resume.get("continuationStageCount")
            if (
                not isinstance(continuation_stage_count, int)
                or continuation_stage_count < 0
                or continuation_stage_count > acknowledged
            ):
                raise ValueError("PREDICTIVE_NT_7C_RESUME_LINEAGE_INVALID")
            continuation_state = resume.get("continuationState")
            if continuation_stage_count:
                previous = continuation(
                    np, continuation_state, continuation_stage_count
                )
            elif continuation_state != {
                "raffinateComponentMoles": [],
                "extractComponentMoles": [],
            }:
                raise ValueError("PREDICTIVE_NT_7C_RESUME_LINEAGE_INVALID")
            start = acknowledged + 1
        for count in range(start, maximum + 1):
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
            # Performance is emitted separately and is absent from checkpoint
            # and result canonical hashes.
            print(
                "PREDICTIVE_NT_PERFORMANCE "
                f"{count} {base64.b64encode(canonical(engine.metrics).encode()).decode()}",
                file=sys.stderr, flush=True,
            )
            print(
                f"PREDICTIVE_NT_PROGRESS {count} {maximum}",
                file=sys.stderr, flush=True,
            )
        final = {
            "schemaVersion": "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1",
            "engineContractVersion": ENGINE_VERSION,
            "componentOrder": list(FAMILIES),
            "status": STATUS,
            "implementationStatus": "IMPLEMENTED",
            "predictiveQualification":
                "PENDING_GOVERNED_WATER_BEARING_LLE_AND_BLIND_QUALIFICATION",
            "releaseEligible": False,
            "predictiveNt": None,
            "establishedTheoreticalStages": None,
            "pilotValidated": False,
            "calibrationRequired": True,
            "sulfurPrediction": {"status": "NOT_CALCULABLE"},
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
                "directWaterBearingLleValidated": False,
                "independentBlindQualificationPassed": False,
            },
            "executionStatus": (
                "COMPLETED_GOVERNED_SEQUENCE"
                if all(trial["numericalAcceptancePassed"] for trial in trials)
                else "COMPLETED_DIAGNOSTIC_SEQUENCE"
            ),
            "trialsAttempted": len(trials),
            "governedTrialsAccepted": sum(
                trial["numericalAcceptancePassed"] for trial in trials
            ),
            "diagnosticTrialsCalculated": sum(
                trial["diagnosticContinuationUsed"] for trial in trials
            ),
            "trials": trials,
        }
        print(canonical(final), end="")
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        try:
            print(canonical({
                "status": "PASS",
                "python": f"{sys.version_info.major}.{sys.version_info.minor}",
                **engine_evidence(),
                "checkpointProtocol": CHECKPOINT_PROTOCOL,
                "governanceStatus": STATUS,
            }))
        except Exception as exc:
            print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
            raise
    else:
        try:
            main()
        except Exception as exc:
            print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
            raise