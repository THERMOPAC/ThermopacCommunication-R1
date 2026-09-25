#!/usr/bin/env python3
"""Fast current ACK_V3 fixture; never a scientific calculation."""
import base64
import hashlib
import json
import sys
from pathlib import Path

ORDER = ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"]
SULFUR_COMPONENTS = ORDER[:5]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def preflight():
    print(canonical({
        "status": "PASS",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "engineHash": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "testProtocolFixture": True,
    }))


def stream(component_moles):
    total = sum(component_moles)
    fractions = [value / total for value in component_moles]
    return {
        "componentMoles": component_moles,
        "componentMass": component_moles,
        "flowMol": total,
        "mass": total,
        "moleFractions": fractions,
        "massFractions": fractions,
    }


def mono_rich_audit():
    search = {
        "optimizerSuccess": True,
        "replayOptimizerSuccess": True,
        "minimum": 0.0,
        "replayMinimum": 0.0,
        "replayMaximumCompositionDifference": 0.0,
        "composition": [0.05, 0.8, 0.03, 0.03, 0.03, 0.03, 0.03],
    }
    return {
        "allRequiredSearchesAccepted": True,
        "historicalFalseBasinSeedIncluded": True,
        "region": "x_MONO >= 0.5",
        "searches": [search, search, search],
    }


def make_trial(stage_count):
    feed = [65.0, 20.0, 5.0, 3.0, 5.0, 2.0, 0.0]
    solvent = [0.0, 0.0, 0.0, 0.0, 0.0, 149.25, 0.75]
    raffinate = [60.0, 12.0, 3.0, 2.0, 3.0, 4.0, 0.5]
    extract = [
        feed[index] + solvent[index] - raffinate[index]
        for index in range(len(ORDER))
    ]
    audit = mono_rich_audit()
    stage = {
        "governanceClassification":
            "NON_GOVERNED_METASTABLE_OR_UNRESOLVED_NOT_RELEASE_ELIGIBLE",
        "raffinateIncoming": stream(feed),
        "extractIncoming": stream(solvent),
        "raffinateLeaving": stream(raffinate),
        "extractLeaving": stream(extract),
        "explicitMonoRichBasinAuditAccepted": True,
        "postSplitTpdSearch": {
            "raffinate": {"explicitMonoRichBasinSearch": audit},
            "extract": {"explicitMonoRichBasinSearch": audit},
        },
    }
    null_components = {component: None for component in SULFUR_COMPONENTS}
    return {
        "stageCount": stage_count,
        "accepted": False,
        "numericalAcceptancePassed": False,
        "allCalculableTargetsPass": False,
        "physicalLleClassification": "NO_PHYSICAL_LLE",
        "explicitMonoRichBasinAuditAccepted": False,
        "diagnosticContinuationUsed": False,
        "governanceClassification": "NO_PHYSICAL_LLE",
        "overallComponentBalanceResidualMol": [0.0] * len(ORDER),
        "overallComponentBalanceResidualMass": [0.0] * len(ORDER),
        "boundaryStreams": {
            "oilFeed": stream(feed),
            "freshWetSolvent": stream(solvent),
            "finalRaffinate": stream(raffinate),
            "finalExtract": stream(extract),
        },
        "stages": [stage for _ in range(stage_count)],
        "sulfurPrediction": {
            "status": "NOT_CALCULABLE",
            "reason": "TRIAL_NOT_PHYSICALLY_NUMERICALLY_VALID",
            "basis": "GOVERNED_STAGE1_SULFUR_ALLOCATION_POST_PROCESSING",
            "predictedRaffinateSulfurPpm": None,
            "sulfurRemovalPct": None,
            "targetStatus": "NOT_CALCULABLE",
            "retainedFractions": null_components,
            "remainingContributionsPpm": null_components,
        },
        "targetCompliance": {
            "targetRaffinateSulfurPpm": {"status": "NOT_CALCULABLE"},
        },
    }


def final_result(request, trials):
    stage1 = request["stage1Authority"]["source"]["stage1"]
    feed_mass = sum(
        float(stage1[name]) for name in [
            "saturatesWt", "monoAromaticsWt", "diAromaticsWt",
            "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt",
        ]
    )
    wet_ratio = float(request["sourceSolventOilMassRatio"])
    nmp_percent = float(stage1["nmpPurityWt"])
    water_percent = float(stage1["nmpWaterWt"])
    return {
        "schemaVersion": "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1",
        "engineContractVersion": "7C-1.6.0",
        "componentOrder": ORDER,
        "status": "PRE-PILOT MULTISTAGE PREDICTIVE MODEL",
        "implementationStatus": "IMPLEMENTED",
        "releaseEligible": False,
        "predictiveNt": None,
        "establishedTheoreticalStages": None,
        "pilotValidated": False,
        "calibrationRequired": False,
        "sulfurPrediction": {
            "status": "NOT_CALCULABLE",
            "reason": "NO_ACCEPTED_PREDICTIVE_TRIAL",
            "basis": "GOVERNED_STAGE1_SULFUR_ALLOCATION_POST_PROCESSING",
            "predictedRaffinateSulfurPpm": None,
            "sulfurRemovalPct": None,
            "targetStatus": "NOT_CALCULABLE",
        },
        "thermodynamicCondition": {
            "temperatureC": float(stage1["operatingTemperatureC"]),
            "temperatureK": float(stage1["temperatureK"]),
            "authority": "IMMUTABLE_STAGE1_OPERATING_TEMPERATURE",
        },
        "wetSolventConstruction": {
            "rrboFeedMass": feed_mass,
            "totalWetSolventMass": feed_mass * wet_ratio,
            "dryNmpMass": feed_mass * wet_ratio * nmp_percent / 100,
            "waterMass": feed_mass * wet_ratio * water_percent / 100,
            "nmpWeightPercentOfWetSolvent": nmp_percent,
            "waterWeightPercentOfWetSolvent": water_percent,
            "massClosureResidual": 0.0,
            "componentOrder": ORDER,
        },
        "qualificationEvidence": {
            "experimentalWetLleRequiredForExecution": False,
        },
        "executionStatus": "COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX",
        "trialsAttempted": len(trials),
        "governedTrialsAccepted": 0,
        "diagnosticTrialsCalculated": 0,
        "trials": trials,
    }


def main():
    request = json.loads(sys.stdin.readline())
    resume = request.get("_resume")
    trials = list(resume["trials"]) if resume else []
    start = int(resume["acknowledgedStageCount"]) + 1 if resume else 1
    for stage_count in range(start, 11):
        trial = make_trial(stage_count)
        trial_text = canonical(trial)
        continuation = {
            "raffinateComponentMoles": [float(stage_count)] * len(ORDER),
            "extractComponentMoles": [float(stage_count)] * len(ORDER),
        }
        payload = {
            "protocol": "ACK_V3_ENGINE_CONTRACT",
            "engineContractVersion": "7C-1.6.0",
            "componentOrder": ORDER,
            "continuationState": continuation,
            "continuationStageCount": stage_count,
            "trialCanonical": trial_text,
            "trialHash": digest(trial_text),
        }
        payload_text = canonical(payload)
        payload_hash = digest(payload_text)
        encoded = base64.b64encode(payload_text.encode()).decode()
        print(
            f"PREDICTIVE_NT_CHECKPOINT {stage_count} {payload_hash} {encoded}",
            file=sys.stderr,
            flush=True,
        )
        if sys.stdin.readline().strip() != (
            f"PREDICTIVE_NT_ACK {stage_count} {payload_hash}"
        ):
            raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")
        print(f"PREDICTIVE_NT_PROGRESS {stage_count} 10", file=sys.stderr, flush=True)
        trials.append(trial)
    print(canonical(final_result(request, trials)), end="")


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        preflight()
    else:
        main()