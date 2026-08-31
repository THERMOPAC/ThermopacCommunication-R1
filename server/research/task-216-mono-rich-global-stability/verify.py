#!/usr/bin/env python3
"""Verify frozen Task 216 evidence without rerunning the scientific search."""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/task-216-mono-rich-global-stability"
TASK206 = ROOT / "server/research/task-206-stability-constrained-amendment"
TASK213 = ROOT / "server/research/task-213-mono-rich-qualification"
TASK215 = ROOT / "server/research/task-215-multistart-resolution"
AMENDMENT = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
COUNTER = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(code)


def main() -> None:
    protocol = json.loads((HERE / "protocol.json").read_text())
    result = json.loads((OUT / "results.json").read_text())
    provenance = json.loads((OUT / "provenance-manifest.json").read_text())
    artifact_paths = {
        "protocolSha256": HERE / "protocol.json",
        "runnerSha256": HERE / "run.py",
        "resultsSha256": OUT / "results.json",
        "reportSha256": OUT / "report.md",
    }
    for key, path in artifact_paths.items():
        require(provenance.get(key) == sha256(path), f"{key}:HASH_MISMATCH")
    pinned_paths = {
        "task215ProtocolSha256": TASK215 / "protocol.json",
        "task215ResultsSha256": ROOT / ".agents/outputs/task-215-multistart-resolution/results.json",
        "task215ProvenanceSha256": ROOT / ".agents/outputs/task-215-multistart-resolution/provenance-manifest.json",
        "task206ProtocolSha256": TASK206 / "protocol.json",
        "task206ResultsSha256": ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json",
        "task213ProtocolSha256": TASK213 / "protocol.json",
        "task213ResultsSha256": ROOT / ".agents/outputs/task-213-mono-rich-qualification/results.json",
        "amendmentModelSha256": AMENDMENT / "model.py",
        "amendmentProtocolSha256": AMENDMENT / "protocol.json",
        "amendmentResultsSha256": ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
        "countercurrentProtocolSha256": COUNTER / "protocol.json",
        "countercurrentRunnerSha256": COUNTER / "run.py",
        "productionWorkerSha256": ROOT / "server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py",
        "cosmoSacRunnerSha256": ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py",
        "cosmoSacProvenanceSha256": ROOT / "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json",
        "sixComponentProvenanceSha256": ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json",
        "profileVerificationSha256": ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profile-verification.json",
        "multiTemperatureLleDataSha256": ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json",
    }
    require(
        provenance.get("pinnedInputs") == protocol.get("pinnedInputs"),
        "PROVENANCE_PINNED_INPUTS_MISMATCH",
    )
    for key, path in pinned_paths.items():
        require(path.is_file(), f"{key}:PINNED_INPUT_MISSING")
        require(protocol["pinnedInputs"].get(key) == sha256(path), f"{key}:PINNED_HASH_MISMATCH")

    threshold = protocol["postSplitTpdThreshold"]
    phases = result.get("phases")
    expected = protocol["expectedReturnedPhaseEndpoints"]
    require(isinstance(phases, list), "PHASE_MATRIX_MISSING")
    require(len(phases) == expected, "PHASE_MATRIX_COUNT_MISMATCH")
    require(result["coverage"]["expectedPhaseEndpoints"] == expected, "EXPECTED_COVERAGE_MISMATCH")
    require(result["coverage"]["returnedPhaseEndpoints"] == expected, "RETURNED_COVERAGE_MISMATCH")
    expected_keys = {
        (trial, stage, phase)
        for trial in range(
            protocol["stageRange"]["minimum"],
            protocol["stageRange"]["maximum"] + 1,
        )
        for stage in range(1, trial + 1)
        for phase in ("raffinate", "extract")
    }
    actual_keys = {
        (row["trialStageCount"], row["stageFromFeedEnd"], row["phase"])
        for row in phases
    }
    require(actual_keys == expected_keys, "PHASE_MATRIX_IDENTITY_MISMATCH")

    fully_reproduced = []
    negative_or_unresolved = []
    for row in phases:
        minimum = row.get("minimum")
        require(isinstance(minimum, (int, float)) and math.isfinite(minimum), "NONFINITE_TPD")
        criteria = row.get("reproductionCriteria")
        require(isinstance(criteria, dict) and criteria, "REPRODUCTION_CRITERIA_MISSING")
        require(
            row.get("fullyReproducedNegative") is all(criteria.values()),
            "FULL_REPRODUCTION_CLASSIFICATION_MISMATCH",
        )
        if row["fullyReproducedNegative"]:
            require(
                row["classification"].startswith("GENUINE_LOWER_GIBBS"),
                "GENUINE_BASIN_CLASSIFICATION_MISMATCH",
            )
            fully_reproduced.append(row)
        if (
            minimum < threshold
            or row.get("productionHelper", {}).get("minimum", 0) < threshold
        ):
            negative_or_unresolved.append(row)

    require(
        result["coverage"]["failingPhaseCount"] == len(fully_reproduced),
        "FULLY_REPRODUCED_COUNT_MISMATCH",
    )
    require(
        result["coverage"]["negativeOrUnresolvedPhaseCount"] == len(negative_or_unresolved),
        "NEGATIVE_OR_UNRESOLVED_COUNT_MISMATCH",
    )
    blockers = result.get("blockers")
    require(isinstance(blockers, list), "BLOCKERS_MISSING")
    require(
        not negative_or_unresolved or "POST_SPLIT_TPD_STABILITY_FAILED" in blockers,
        "FALSE_BLOCKER_FREE_CLAIM",
    )
    require(result.get("status") == "BLOCKED_FAIL_CLOSED", "STATUS_CLAIM_INVALID")
    require(result.get("qualified") is False, "QUALIFIED_CLAIM_INVALID")
    require(result.get("researchOnly") is True, "RESEARCH_ONLY_GOVERNANCE_INVALID")
    require(result.get("calibrationRequired") is True, "CALIBRATION_GATE_INVALID")
    require(result.get("releaseEligible") is False, "RELEASE_ELIGIBILITY_INVALID")
    require(result.get("predictiveNt") is None, "PREDICTIVE_NT_MUST_REMAIN_NULL")
    require(result.get("sulfurPrediction") == "NOT_CALCULABLE", "SULFUR_GATE_INVALID")

    solver = result.get("solverEvidence")
    require(isinstance(solver, list) and len(solver) == 10, "SOLVER_EVIDENCE_INCOMPLETE")
    require(
        all(
            row["rerunPrimaryClosed"]
            and row["rerunSecondaryClosed"]
            and row["rerunBranchReproduced"]
            and row["pinnedPrimaryClosed"]
            and row["pinnedBranchReproduced"]
            for row in solver
        ),
        "TASK215_ENDPOINT_REPRODUCTION_FAILED",
    )

    # Regression for the defect that originally treated a nonstationary BFGS
    # simplex vertex as comparable with two agreeing constrained interior routes.
    regression = next(
        row for row in phases
        if (
            row["trialStageCount"],
            row["stageFromFeedEnd"],
            row["phase"],
        ) == (2, 1, "raffinate")
    )
    routes = {row["method"]: row for row in regression["optimizers"]}
    tolerance = protocol["methods"]["acceptanceTolerances"]
    bfgs = routes["BFGS-log-ratio"]
    slsqp = routes["SLSQP-simplex"]
    trust = routes["trust-constr-simplex"]
    require(
        bfgs["simplexKktInfinityNorm"]
        > tolerance["simplexProjectedKktInfinityNorm"],
        "BOUNDARY_BFGS_REGRESSION_ROUTE_UNEXPECTEDLY_ACCEPTED",
    )
    require(
        slsqp["simplexKktInfinityNorm"]
        <= tolerance["simplexProjectedKktInfinityNorm"]
        and trust["simplexKktInfinityNorm"]
        <= tolerance["simplexProjectedKktInfinityNorm"],
        "CONSTRAINED_INTERIOR_REGRESSION_ROUTE_REJECTED",
    )
    require(
        abs(slsqp["objective"] - trust["objective"])
        <= tolerance["optimizerAgreement"],
        "CONSTRAINED_INTERIOR_REGRESSION_ROUTES_DISAGREE",
    )
    require(
        regression["classification"] == "GENUINE_LOWER_GIBBS_BASIN"
        and regression["fullyReproducedNegative"] is True,
        "MIXED_BOUNDARY_INTERIOR_CLASSIFICATION_REGRESSION",
    )
    candidate = result["task206CandidateComparison"]
    candidate_phases = candidate.get("sameEndpointFullGlobalSearches")
    require(
        isinstance(candidate_phases, list) and len(candidate_phases) == expected,
        "CANDIDATE_PHASE_MATRIX_INCOMPLETE",
    )
    candidate_keys = {
        (row["trialStageCount"], row["stageFromFeedEnd"], row["phase"])
        for row in candidate_phases
    }
    require(candidate_keys == expected_keys, "CANDIDATE_PHASE_MATRIX_IDENTITY_MISMATCH")
    require(candidate.get("qualifiedForThisHarness") is False, "CANDIDATE_QUALIFICATION_INVALID")
    require(
        any(row.get("status") != "PASS" for row in candidate["frozenValidation"].values()),
        "CANDIDATE_FROZEN_VALIDATION_DISPOSITION_INVALID",
    )

    print(json.dumps({
        "status": "PASS",
        "phaseEndpoints": len(phases),
        "fullyReproducedNegativePhases": len(fully_reproduced),
        "negativeOrUnresolvedPhases": len(negative_or_unresolved),
        "classifications": Counter(row["classification"] for row in phases),
        "candidateClassifications": Counter(
            row["classification"] for row in candidate_phases
        ),
        "blockers": blockers,
    }, default=dict, sort_keys=True))


if __name__ == "__main__":
    main()