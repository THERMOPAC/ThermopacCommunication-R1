#!/usr/bin/env python3
"""Verify the frozen Job-B boundary-branch qualification artifacts."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / ".agents/outputs/job-b-boundary-branch"
COMPONENTS = ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"]
GATE = 1e-7


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def main():
    source = json.loads((OUTPUT / "frozen-input.json").read_text())
    seed_catalog = json.loads(
        (OUTPUT / "candidate-root-seeds.json").read_text())
    canonical_job_b = json.loads((OUTPUT / "canonical-job-b.json").read_text())
    continuation = json.loads(
        (OUTPUT / "h2-continuation-diagnostic.json").read_text())
    result = json.loads((OUTPUT / "results.json").read_text())
    local = json.loads((OUTPUT / "local-boundary-results.json").read_text())

    expected_hash = result.pop("resultSha256")
    require(hashlib.sha256(canonical(result).encode()).hexdigest() == expected_hash,
            "RESULT_HASH_MISMATCH")
    result["resultSha256"] = expected_hash
    catalog_hash = seed_catalog.pop("catalogSha256")
    require(hashlib.sha256(canonical(seed_catalog).encode()).hexdigest()
            == catalog_hash, "CANDIDATE_SEED_CATALOG_HASH_MISMATCH")
    seed_catalog["catalogSha256"] = catalog_hash
    require(len(seed_catalog["candidates"]) == 7,
            "CANDIDATE_SEED_COUNT_CHANGED")
    require([row["candidateId"] for row in seed_catalog["candidates"]]
            == [f"R{i}" for i in range(1, 8)],
            "CANDIDATE_SEED_ORDER_CHANGED")
    require(seed_catalog["source"]["kind"]
            == "DETERMINISTIC_INLET_MULTISTART",
            "CANDIDATE_SEED_SOURCE_CHANGED")
    require(seed_catalog["source"]["frozenInputHash"] == source["inputHash"],
            "CANDIDATE_SEED_INPUT_HASH_CHANGED")
    inlet_attempts = {
        row["seed"]: row for row in result["search"]["attempts"]
    }
    require(all(row["seedSource"] == "DETERMINISTIC_INLET_MULTISTART"
                and row["sourceStarts"]
                for row in seed_catalog["candidates"]),
            "CANDIDATE_SEED_PROVENANCE_MISSING")
    for candidate in seed_catalog["candidates"]:
        require(all(label in inlet_attempts
                    for label in candidate["sourceStarts"]),
                "CANDIDATE_SEED_SOURCE_START_MISSING")
        require(any(
            inlet_attempts[label]["numericalJacobianRank"]
            == candidate["numericalJacobianRank"]
            and inlet_attempts[label]["maximumIsoactivityLogResidual"]
            == candidate["maximumIsoactivityLogResidual"]
            and inlet_attempts[label]["maximumScaledFluxEqualityResidual"]
            == candidate["maximumScaledFluxEqualityResidual"]
            for label in candidate["sourceStarts"]
        ), "CANDIDATE_SEED_SOURCE_EVIDENCE_MISMATCH")
    require(sum(row["strictNumericalAccepted"]
                for row in seed_catalog["candidates"]) == 3,
            "STRICT_INLET_CANDIDATE_COUNT_CHANGED")

    request = source["workerRequest"]
    dependencies = source["responseBasis"]["dependencies"]
    require(request["componentOrder"] == COMPONENTS == result["componentOrder"],
            "COMPONENT_ORDER_CHANGED")
    require(result["stage2EngineVersion"] == "7C-1.5.0",
            "STAGE2_ENGINE_VERSION_CHANGED")
    require(result["stage2EngineHash"] == dependencies["stage2EngineHash"],
            "STAGE2_ENGINE_HASH_CHANGED")
    require(result["jobBInterfaceWorkerSha256"] ==
            dependencies["jobBInterfaceWorkerSha256"],
            "JOB_B_WORKER_HASH_CHANGED")

    acceptance = result["unchangedAcceptance"]
    require(acceptance["isoactivityLogResidual"] == GATE
            and acceptance["scaledTwoFilmResidual"] == 1e-8
            and acceptance["rawFvResidualMolS"] == GATE
            and acceptance["scaledFvResidual"] == GATE,
        "ONE_E_MINUS_7_GATE_CHANGED")
    require(not any(acceptance[key] for key in (
        "clippingUsed", "sourceSignReversalUsed",
        "negativeFlowsAccepted", "toleranceRelaxed")),
        "PROHIBITED_NUMERICAL_REPAIR_RECORDED")

    require(canonical_job_b["status"] == "CALCULATED_PRELIMINARY_INTERFACE",
            "CANONICAL_JOB_B_NOT_CALCULATED")
    require(canonical_job_b["selectedGateEvidence"]["endpointStabilityAccepted"],
            "CANONICAL_JOB_B_STABILITY_FAILED")
    require(canonical_job_b["independentReproductionMaximumRelativeDifference"]
            <= GATE, "CANONICAL_JOB_B_REPRODUCTION_FAILED")

    roots = result["roots"]
    require(result["search"]["distinctRootCount"] == len(roots) == 3,
            "ROOT_CLASSIFICATION_COUNT_CHANGED")
    require(all(root["numericalJacobianRank"] == 13
                and root["maximumIsoactivityLogResidual"] <= GATE
                and root["maximumScaledFluxEqualityResidual"] <= 1e-8
                for root in roots), "INLET_ROOT_NUMERICAL_GATE_FAILED")
    credible = [root for root in roots if root["crediblePhysicalRoot"]]
    compatible = [
        root for root in credible
        if root["globalOutletNecessaryCondition"]["strictlyPositive"]
    ]
    require(len(credible) == result["crediblePhysicalRootCount"] == 1,
            "CREDIBLE_ROOT_COUNT_CHANGED")
    require(credible[0]["canonicalPackagedJobBMatch"],
            "CREDIBLE_ROOT_NOT_CANONICAL_JOB_B")
    require(credible[0]["reproductionCount"] >= 2,
            "CREDIBLE_ROOT_NOT_INDEPENDENTLY_REPRODUCED")
    require(len(compatible) == result["boundaryCompatibleRootCount"] == 0,
            "BOUNDARY_COMPATIBLE_ROOT_FOUND")
    require(all(not root["globalOutletNecessaryCondition"]["strictlyPositive"]
                for root in roots), "UNCLASSIFIED_POSITIVE_OUTLET_ROOT")

    terminal = continuation["unconstrainedTerminalDiagnostic"]
    require(continuation["heightM"] == 2.0,
            "CONTINUATION_HEIGHT_CHANGED")
    require(continuation["unknownFlowCount"] == 98,
            "FV_FLOW_COUNT_CHANGED")
    require(continuation["solver"] ==
            "LOCAL_FLUX_PICARD_BOUNDED_DENSE_98_FV",
            "FV_SOLVER_CHANGED")
    require(terminal["optimizerSuccess"]
            and terminal["rawFvResidualMolS"] <= GATE
            and terminal["scaledFvResidual"] <= GATE,
            "UNCONSTRAINED_DIAGNOSTIC_DID_NOT_CLOSE")
    require(terminal["nonpositiveFlowCount"] == 14,
            "TERMINAL_NONPOSITIVE_COUNT_CHANGED")
    require({row["component"] for row in terminal["nonpositiveFlows"]}
            == {"NMP", "H2O"}, "TERMINAL_NEGATIVE_COMPONENTS_CHANGED")
    require(all(row["phase"] == "dispersed"
                for row in terminal["nonpositiveFlows"]),
            "TERMINAL_NEGATIVE_PHASE_CHANGED")
    require(result["jobCDisposition"] ==
            "REMAINS_BLOCKED_NO_BOUNDARY_COMPATIBLE_JOB_B_ROOT",
            "JOB_C_DISPOSITION_CHANGED")
    require(result["requiredGovernedChangeIfBlocked"] is not None,
            "MISSING_GOVERNED_INLET_CHANGE")
    local_hash = local.pop("resultSha256")
    require(hashlib.sha256(canonical(local).encode()).hexdigest() == local_hash,
            "LOCAL_BOUNDARY_RESULT_HASH_MISMATCH")
    local["resultSha256"] = local_hash
    require(local["acceptedLambda"] < local["failedLambda"],
            "LOCAL_BOUNDARY_LAMBDA_ORDER_INVALID")
    require(local["componentOrder"] == COMPONENTS,
            "LOCAL_BOUNDARY_COMPONENT_ORDER_CHANGED")
    require(local["stage2EngineVersion"] == result["stage2EngineVersion"]
            and local["stage2EngineHash"] == result["stage2EngineHash"]
            and local["jobBInterfaceWorkerSha256"]
            == result["jobBInterfaceWorkerSha256"],
            "LOCAL_BOUNDARY_FROZEN_AUTHORITY_CHANGED")
    local_cells = local["cellResults"]
    require(len(local_cells) == 7, "LOCAL_BOUNDARY_CELL_COUNT_CHANGED")
    local_credible = []
    for expected_cell, cell in enumerate(local_cells, 1):
        require(cell["numericalCell"] == expected_cell,
                "LOCAL_BOUNDARY_CELL_ORDER_CHANGED")
        require(cell["componentOrder"] == COMPONENTS,
                "LOCAL_BOUNDARY_CELL_COMPONENT_ORDER_CHANGED")
        credible_cell = [
            root for root in cell["roots"] if root["crediblePhysicalRoot"]
        ]
        require(len(credible_cell) == 1,
                "LOCAL_BOUNDARY_CREDIBLE_ROOT_COUNT_CHANGED")
        credible_root = credible_cell[0]
        local_credible.append(credible_root)
        require(credible_root["sourceCandidateTemplates"] == ["R1"],
                "DISTINCT_CREDIBLE_LOCAL_ROOT_FAMILY_FOUND")
        require(credible_root["numericalJacobianRank"] == 13,
                "LOCAL_BOUNDARY_JACOBIAN_RANK_FAILED")
        require(credible_root["maximumIsoactivityLogResidual"] <= GATE,
                "LOCAL_BOUNDARY_ISOACTIVITY_FAILED")
        require(credible_root["maximumScaledFluxEqualityResidual"] <= 1e-8,
                "LOCAL_BOUNDARY_TWO_FILM_EQUALITY_FAILED")
        require(credible_root["phaseSeparated"]
                and credible_root["phaseOrientationAccepted"]
                and credible_root["independentlyReproduced"]
                and credible_root["endpointStabilityAccepted"],
                "LOCAL_BOUNDARY_PHYSICAL_GATE_FAILED")
        require(credible_root["stabilityEvidence"]["source"] in (
            "PACKAGED_JOB_B_INHERITED_UNCHANGED_STABILITY_AND_TPD",
            "BOUNDARY_ROOT_UNCHANGED_STABILITY_AND_TPD"),
            "LOCAL_BOUNDARY_STABILITY_PROVENANCE_MISSING")
        difference = credible_root[
            "reproductionEvidence"]["maximumRelativeDifference"]
        require(difference <= 1e-6,
                "LOCAL_BOUNDARY_REPRODUCTION_FAILED")
        for rejected in (
            root for root in cell["roots"]
            if not root["crediblePhysicalRoot"]
        ):
            require(
                not rejected["phaseSeparated"]
                or not rejected["phaseOrientationAccepted"]
                or not rejected["independentlyReproduced"]
                or not rejected["endpointStabilityAccepted"],
                "LOCAL_BOUNDARY_ROOT_REJECTED_WITHOUT_FAILED_GATE")
    require(local["search"]["credibleRootFamilies"] == ["R1"],
            "LOCAL_BOUNDARY_ROOT_FAMILY_CHANGED")
    require(local["search"]["candidateSeedCatalogSha256"] == catalog_hash,
            "LOCAL_BOUNDARY_SEED_CATALOG_CHANGED")
    require(local["search"]["distinctCredibleAlternateRootFamilies"] == [],
            "DISTINCT_CREDIBLE_ALTERNATE_ROOT_FOUND")
    require(local["boundaryCompatibleDistinctJobBBranchCount"] == 0,
            "BOUNDARY_COMPATIBLE_DISTINCT_JOB_B_BRANCH_FOUND")
    require(local["jobCDisposition"] ==
            "REMAINS_BLOCKED_NO_BOUNDARY_COMPATIBLE_JOB_B_ROOT",
            "LOCAL_BOUNDARY_JOB_C_DISPOSITION_CHANGED")
    require(local["requiredGovernedChange"] is not None,
            "LOCAL_BOUNDARY_GOVERNED_CHANGE_MISSING")
    print(json.dumps({
        "status": "PASS",
        "distinctNumericalRoots": len(roots),
        "crediblePhysicalRoots": len(credible),
        "boundaryCompatibleRoots": len(compatible),
        "terminalNonpositiveFlows": terminal["nonpositiveFlowCount"],
        "localBoundaryCredibleRoots": len(local_credible),
        "distinctCredibleAlternateRootFamilies": 0,
        "resultSha256": expected_hash,
        "localBoundaryResultSha256": local_hash,
    }, indent=2))


if __name__ == "__main__":
    main()