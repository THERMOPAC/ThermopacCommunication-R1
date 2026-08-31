#!/usr/bin/env python3
"""Fast ACK_V2 protocol fixture; never a scientific calculation."""
import base64
import hashlib
import json
import sys
from pathlib import Path

ORDER = ["SAT", "MONO", "DI", "POLY", "PA", "NMP"]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest_text(value):
    return hashlib.sha256(value.encode()).hexdigest()


def preflight():
    engine_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    print(canonical({
        "status": "PASS",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "engineHash": engine_hash,
        "testProtocolFixture": True,
    }))


def make_stream(component_moles):
    return {
        "componentMoles": component_moles,
        "componentMass": component_moles,
        "flowMol": sum(component_moles),
        "mass": sum(component_moles),
        "moleFractions": component_moles,
        "massFractions": component_moles,
    }


def make_trial(stage_count):
    feed = [0.6, 0.1, 0.08, 0.06, 0.04, 0.01]
    solvent = [0, 0, 0, 0, 0, 1.0]
    raffinate = [0.58, 0.05, 0.03, 0.02, 0.01, 0.02]
    extract = [
        feed[index] + solvent[index] - raffinate[index]
        for index in range(len(ORDER))
    ]
    zeroes = [0.0] * len(ORDER)
    stage = {
        "stageFromFeedEnd": stage_count,
        "raffinateIncoming": make_stream(feed),
        "extractIncoming": make_stream(solvent),
        "raffinateLeaving": make_stream(raffinate),
        "extractLeaving": make_stream(extract),
        "KExtractOverRaffinate": [1.0] * len(ORDER),
        "maximumComponentBalanceResidualMol": 0.0,
        "isoactivityLogResidual": 0.0,
        "phaseCompositionSeparation": 0.1,
        "localPostSplitStability": {
            "raffinate": {"minimumEigenvalue": 1.0},
            "extract": {"minimumEigenvalue": 1.0},
        },
        "postSplitTpdSearch": {
            "raffinate": {"minimum": 0.0, "allRefinementsAccepted": True},
            "extract": {"minimum": 0.0, "allRefinementsAccepted": True},
        },
        "stageGibbsReduction": 0.1,
        "accepted": True,
    }
    return {
        "stageCount": stage_count,
        "solverSuccess": True,
        "solverMessage": "TEST_PROTOCOL_FIXTURE",
        "maximumScaledEquationResidual": 0.0,
        "multistartProductRelativeDifference": 0.0,
        "multistartEvidence": {"startCount": 2, "bothStartsClosed": True},
        "accepted": False,
        "acceptanceBlockers": [],
        "boundaryStreams": {
            "oilFeed": make_stream(feed),
            "freshNmp": make_stream(solvent),
            "finalRaffinate": make_stream(raffinate),
            "finalExtract": make_stream(extract),
        },
        "overallComponentBalanceResidualMol": zeroes,
        "overallComponentBalanceResidualMass": zeroes,
        "maximumOverallComponentBalanceResidualMol": 0.0,
        "stages": [stage],
        "productMetrics": {
            "raffinateTotalAromaticsWtNmpFree": 10.0,
            "raffinatePolarAromaticsWtNmpFree": 1.0,
            "nmpFreeHydrocarbonRecoveryPct": 95.0,
            "componentExtractionPct": {"MONO": 50.0, "DI": 62.5, "POLY": 66.67, "PA": 75.0},
        },
        "targetCompliance": {},
        "numericalAcceptancePassed": True,
        "allCalculableTargetsPass": True,
        "researchStatus": "RESEARCH_DIAGNOSTIC_NOT_ACCEPTED",
        "releaseEligible": False,
    }


def main():
    request = json.loads(sys.stdin.readline())
    maximum = int(request["maximumStages"])
    resume = request.get("_resume")
    trials = list(resume["trials"]) if resume else []
    start = int(resume["acknowledgedStageCount"]) + 1 if resume else 1
    for stage_count in range(start, maximum + 1):
        trial = make_trial(stage_count)
        trial_canonical = canonical(trial)
        payload = {
            "continuationState": {"stageCount": stage_count},
            "trialCanonical": trial_canonical,
            "trialHash": digest_text(trial_canonical),
        }
        payload_canonical = canonical(payload)
        payload_hash = digest_text(payload_canonical)
        encoded = base64.b64encode(payload_canonical.encode()).decode()
        print(
            f"PREDICTIVE_NT_CHECKPOINT {stage_count} {payload_hash} {encoded}",
            file=sys.stderr,
            flush=True,
        )
        expected_ack = f"PREDICTIVE_NT_ACK {stage_count} {payload_hash}"
        if sys.stdin.readline().strip() != expected_ack:
            raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")
        print(f"PREDICTIVE_NT_PROGRESS {stage_count} {maximum}", file=sys.stderr, flush=True)
        trials.append(trial)
    print(canonical({
        "status": "RESEARCH_DIAGNOSTIC_NOT_ACCEPTED",
        "predictiveNt": 1,
        "releaseEligible": False,
        "calibrationRequired": True,
        "pilotValidated": False,
        "componentOrder": ORDER,
        "modelIdentity": "TEST_ACK_PROTOCOL_FIXTURE_NOT_SCIENTIFIC",
        "trials": trials,
    }), end="")


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        preflight()
    else:
        main()