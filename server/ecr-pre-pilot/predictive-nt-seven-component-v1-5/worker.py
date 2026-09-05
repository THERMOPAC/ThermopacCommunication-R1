#!/usr/bin/env python3
"""Immutable 7C-1.5.0 extension of 7C-1.4.0 for 0.5--5.0 wt% H2O."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PARENT_WORKER = (
    ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-4/worker.py"
)
ENGINE_ID = "ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O"
ENGINE_VERSION = "7C-1.5.0"
STATUS = "PRE-PILOT MULTISTAGE PREDICTIVE MODEL"
WATER_QUALIFICATION_GRID = (0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


parent = load(PARENT_WORKER, "frozen_production_7c_1_4_for_1_5")
historical_evidence = parent.engine_evidence()
original_canonical = parent.original_canonical
original_complete_trial = parent.complete_trial
stage1_authority = None


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def engine_evidence():
    identity = {
        "historicalSevenComponent14EngineHash": historical_evidence["engineHash"],
        "worker": {
            "path": Path(__file__).relative_to(ROOT).as_posix(),
            "bytes": Path(__file__).stat().st_size,
            "sha256": sha_file(__file__),
        },
        "waterWeightPercentRange": {"minimum": 0.5, "maximum": 5.0},
        "computationalQualificationWaterWeightPercent":
            list(WATER_QUALIFICATION_GRID),
        "directWaterBearingLleValidated": False,
        "releaseEligible": False,
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
            "7C-1.4.0": historical_evidence["engineHash"],
        },
        "supportedWaterWeightPercentRange": {"minimum": 0.5, "maximum": 5.0},
        "computationalQualificationWaterWeightPercent":
            list(WATER_QUALIFICATION_GRID),
        "verifiedScientificInputCount":
            historical_evidence["verifiedScientificInputCount"] + 1,
        "verifiedScientificInputAggregateSha256": engine_hash,
    }


def wet_charge(stage1):
    global stage1_authority
    stage1_authority = stage1
    feed_mass = [float(stage1[key]) for key in (
        "saturatesWt", "monoAromaticsWt", "diAromaticsWt",
        "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt",
    )]
    if abs(sum(feed_mass) - 100.0) > 1e-9:
        raise ValueError("STAGE1_INVALID_FEED_COMPOSITION")
    ratio = float(stage1["solventOilRatio"])
    nmp_pct = float(stage1["nmpPurityWt"])
    water_pct = float(stage1["nmpWaterWt"])
    if (
        ratio <= 0.0
        or water_pct < 0.5
        or water_pct > 5.0
        or abs(nmp_pct + water_pct - 100.0) > 1e-9
    ):
        raise ValueError("STAGE1_INVALID_WET_SOLVENT_COMPOSITION")
    wet_mass = sum(feed_mass) * ratio
    nmp_mass = wet_mass * nmp_pct / 100.0
    water_mass = wet_mass * water_pct / 100.0
    feed = [
        feed_mass[index] / parent.parent.MW[index] for index in range(6)
    ] + [0.0]
    solvent = [0.0] * 5 + [
        nmp_mass / parent.parent.MW[5],
        water_mass / parent.parent.MW[6],
    ]
    return feed, solvent, {
        "basis": "fixed total wet-solvent mass divided by RRBO feed mass",
        "rrboFeedMass": sum(feed_mass),
        "solventOilMassRatio": ratio,
        "totalWetSolventMass": wet_mass,
        "dryNmpMass": nmp_mass,
        "waterMass": water_mass,
        "nmpWeightPercentOfWetSolvent": nmp_pct,
        "waterWeightPercentOfWetSolvent": water_pct,
        "massClosureResidual": abs(wet_mass - nmp_mass - water_mass),
        "componentOrder": list(parent.parent.FAMILIES),
        "componentMass": {
            "SAT": feed_mass[0], "MONO": feed_mass[1], "DI": feed_mass[2],
            "POLY": feed_mass[3], "PA": feed_mass[4],
            "NMP": feed_mass[5] + nmp_mass, "H2O": water_mass,
        },
    }


def complete_trial(np, raw, feed, solvent, temperature_k):
    trial = original_complete_trial(np, raw, feed, solvent, temperature_k)
    trial["qualificationStatus"] = STATUS
    return trial


def canonical(value):
    if (
        isinstance(value, dict)
        and value.get("schemaVersion") == "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1"
    ):
        accepted = [
            trial for trial in value.get("trials", []) if trial.get("accepted")
        ]
        predictive_nt = min(
            (trial["stageCount"] for trial in accepted), default=None
        )
        value = {
            **value,
            "status": STATUS,
            "predictiveQualification": "PRE_PILOT_MULTISTAGE_PREDICTIVE",
            "predictiveNt": predictive_nt,
            "establishedTheoreticalStages": predictive_nt,
            "calibrationRequired": False,
            "pilotValidated": False,
            "releaseEligible": False,
            "executionStatus": "COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX",
            "governedTrialsAccepted": len(accepted),
            "diagnosticTrialsCalculated": sum(
                trial.get("diagnosticContinuationUsed", False)
                for trial in value.get("trials", [])
            ),
            "qualificationEvidence": {
                "experimentalWetLleRequiredForExecution": False,
                "modelBasis":
                    "TASK_219_236_ANALYSIS_AND_TASK_238_CANDIDATE_HISTORY",
            },
        }
    return original_canonical(value)


parent.ENGINE_ID = ENGINE_ID
parent.ENGINE_VERSION = ENGINE_VERSION
parent.STATUS = STATUS
parent.engine_evidence = engine_evidence
parent.wet_charge = wet_charge
parent.complete_trial = complete_trial
parent.canonical = canonical
parent.parent.ENGINE_VERSION = ENGINE_VERSION
parent.parent.engine_evidence = engine_evidence
parent.parent.complete_trial = complete_trial
parent.parent.canonical = canonical
parent.parent.legacy.wet_charge = wet_charge


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        print(original_canonical({
            "status": "PASS",
            "python": f"{sys.version_info.major}.{sys.version_info.minor}",
            **engine_evidence(),
            "checkpointProtocol": parent.parent.CHECKPOINT_PROTOCOL,
            "governanceStatus": STATUS,
        }))
    else:
        parent.single_test_main()