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


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def task216_evidence():
    root = Path.cwd()
    output = root / ".agents/outputs/task-216-mono-rich-global-stability"
    research = root / "server/research/task-216-mono-rich-global-stability"
    result = json.loads((output / "results.json").read_text())
    phases = result["phases"]
    classifications = {}
    for phase in phases:
        classification = phase["classification"]
        classifications[classification] = classifications.get(classification, 0) + 1
    fully_reproduced = [
        phase["minimum"] for phase in phases
        if phase["fullyReproducedNegative"]
    ]
    candidate = result["task206CandidateComparison"]
    candidate_phases = candidate["sameEndpointFullGlobalSearches"]
    candidate_classifications = {}
    for phase in candidate_phases:
        classification = phase["classification"]
        candidate_classifications[classification] = (
            candidate_classifications.get(classification, 0) + 1
        )
    frozen_validation_passed = all(
        row["status"] == "PASS"
        for row in candidate["frozenValidation"].values()
    )
    return {
        "evidenceId": "TASK_216_MONO_RICH_GLOBAL_STABILITY_V1",
        "status": result["status"],
        "qualified": result["qualified"],
        "researchOnly": True,
        "calibrationRequired": True,
        "releaseEligible": False,
        "predictiveNt": None,
        "postSplitTpdThreshold": result["postSplitTpdThreshold"],
        "exactReferenceJobId": result["referenceJob"]["id"],
        "evidenceArtifacts": {
            "protocolSha256": file_hash(research / "protocol.json"),
            "runnerSha256": file_hash(research / "run.py"),
            "resultsSha256": file_hash(output / "results.json"),
            "reportSha256": file_hash(output / "report.md"),
            "provenanceSha256": file_hash(output / "provenance-manifest.json"),
        },
        "coverage": {
            "expectedPhaseEndpoints": result["coverage"]["expectedPhaseEndpoints"],
            "returnedPhaseEndpoints": result["coverage"]["returnedPhaseEndpoints"],
            "failingPhaseCount": result["coverage"]["failingPhaseCount"],
            "negativeOrUnresolvedPhaseCount":
                result["coverage"]["negativeOrUnresolvedPhaseCount"],
            "optimizerRefinementFailureCount":
                classifications.get("OPTIMIZER_REFINEMENT_FAILURE", 0),
        },
        "worstMinimum": min(phase["minimum"] for phase in phases),
        "worstFullyReproducedMinimum": min(fully_reproduced),
        "classificationCounts": classifications,
        "comparisonCandidate": {
            "disposition":
                "REJECTED_FROZEN_VALIDATION_AND_GLOBAL_INSTABILITY",
            "qualified": candidate["qualifiedForThisHarness"],
            "frozenValidationPassed": frozen_validation_passed,
            "classificationCounts": candidate_classifications,
            "worstMinimum": min(phase["minimum"] for phase in candidate_phases),
        },
        "blockers": result["blockers"],
    }


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
        "solverTerminationStatus": "GTOL",
        "residualClosureStatus": "CLOSED",
        "maximumScaledEquationResidual": 0.0,
        "multistartProductRelativeDifference": 0.0,
        "multistartDiagnosticProductRelativeDifference": 0.0,
        "branchComparisonStatus": "EVALUATED",
        "multistartEvidence": {
            "startCount": 2,
            "bothStartsClosed": True,
            "branchComparisonStatus": "EVALUATED",
            "branchReproduced": True,
            "primary": {
                "solverSuccess": True,
                "terminationStatus": "GTOL",
                "terminationMessage": "TEST_PROTOCOL_FIXTURE",
                "functionEvaluations": 2,
                "maximumScaledEquationResidual": 0.0,
                "closureLimit": 1e-8,
                "residualClosureStatus": "CLOSED",
            },
            "secondary": {
                "solverSuccess": True,
                "terminationStatus": "GTOL",
                "terminationMessage": "TEST_PROTOCOL_FIXTURE",
                "functionEvaluations": 2,
                "maximumScaledEquationResidual": 0.0,
                "closureLimit": 1e-8,
                "residualClosureStatus": "CLOSED",
            },
        },
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
        "globalStabilityQualification": task216_evidence(),
        "trials": trials,
    }), end="")


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        preflight()
    else:
        main()