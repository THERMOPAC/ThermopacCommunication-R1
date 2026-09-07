#!/usr/bin/env python3
"""Assemble the seven-cell H=2 boundary qualification decision."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / ".agents/outputs/job-b-boundary-branch"


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def main():
    frozen = json.loads((OUTPUT / "frozen-input.json").read_text())
    inlet_discovery = json.loads((OUTPUT / "results.json").read_text())
    seed_catalog = json.loads(
        (OUTPUT / "candidate-root-seeds.json").read_text())
    boundary = json.loads((OUTPUT / "h2-local-boundary-state.json").read_text())
    continuation = json.loads(
        (OUTPUT / "h2-continuation-diagnostic.json").read_text())
    cells = [
        json.loads((OUTPUT / f"h2-local-cell-{cell}-roots.json").read_text())
        for cell in range(1, 8)
    ]
    credible = [
        root for cell in cells for root in cell["roots"]
        if root["crediblePhysicalRoot"]
    ]
    alternate = [
        root for root in credible
        if root["sourceCandidateTemplates"] != ["R1"]
    ]
    body = {
        "schemaVersion": "ECR_JOB_B_H2_LOCAL_BOUNDARY_QUALIFICATION_V1",
        "componentOrder": frozen["workerRequest"]["componentOrder"],
        "heightM": boundary["heightM"],
        "acceptedLambda": boundary["acceptedLambda"],
        "failedLambda": boundary["failedLambda"],
        "stage2EngineVersion":
            inlet_discovery["stage2EngineVersion"],
        "stage2EngineHash":
            frozen["responseBasis"]["dependencies"]["stage2EngineHash"],
        "jobBInterfaceWorkerSha256": frozen[
            "responseBasis"]["dependencies"]["jobBInterfaceWorkerSha256"],
        "unchangedGates": {
            "maximumIsoactivityLogResidual": 1e-7,
            "maximumScaledTwoFilmResidual": 1e-8,
            "maximumRawFvResidualMolS": 1e-7,
            "maximumScaledFvResidual": 1e-7,
            "numericalJacobianRank": 13,
        },
        "search": {
            "localCellCount": len(cells),
            "seededCandidateBasinCount": 7,
            "candidateSeedCatalogSha256": seed_catalog["catalogSha256"],
            "startsPerFamilyPerCell": 2,
            "totalLocalRootAttempts": sum(
                cell["attemptCount"] for cell in cells),
            "totalDistinctNumericalRoots": sum(
                cell["distinctNumericalRootCount"] for cell in cells),
            "credibleLocalRoots": len(credible),
            "credibleLocalRootsByCell": {
                str(cell["numericalCell"]):
                    cell["crediblePhysicalRootCount"] for cell in cells
            },
            "credibleRootFamilies":
                sorted({family for root in credible
                        for family in root["sourceCandidateTemplates"]}),
            "distinctCredibleAlternateRootFamilies": sorted({
                family for root in alternate
                for family in root["sourceCandidateTemplates"]
            }),
        },
        "cellResults": cells,
        "full98FlowContinuationEvidence": continuation,
        "boundaryCompatibleDistinctJobBBranchCount": 0,
        "jobCDisposition":
            "REMAINS_BLOCKED_NO_BOUNDARY_COMPATIBLE_JOB_B_ROOT",
        "scopeOfConclusion": (
            "No distinct credible branch was found when a conservative "
            "seven-basin exploratory seed catalog was independently re-solved "
            "at all seven local H=2 boundary states under the strict unchanged "
            "gates. Seeds are not accepted roots. This is a governed finite "
            "multistart qualification, not a formal global root-exclusion proof."),
        "requiredGovernedChange": {
            "physicalRepresentation": (
                "Represent both inlet phases with evidence-backed, strictly "
                "positive solvent-component inventories before applying the "
                "two-phase interfacial law at the boundary."),
            "evidence": (
                "Measured or independently governed phase-resolved NMP and H2O "
                "composition or detection-limit evidence for the RRBO dispersed "
                "inlet."),
            "admission": (
                "Create a new immutable Stage-2 boundary result and provenance "
                "hash, then rerun the unchanged Job-B and Job-C gates."),
            "prohibited": [
                "numerical clipping", "source-sign reversal",
                "unconstrained negative-flow acceptance",
                "tolerance relaxation", "arbitrary numerical trace inventory",
            ],
        },
    }
    body["resultSha256"] = hashlib.sha256(
        canonical(body).encode()).hexdigest()
    (OUTPUT / "local-boundary-results.json").write_text(
        json.dumps(body, indent=2) + "\n")
    print(json.dumps({
        "totalLocalRootAttempts": body["search"]["totalLocalRootAttempts"],
        "totalDistinctNumericalRoots":
            body["search"]["totalDistinctNumericalRoots"],
        "credibleLocalRoots": len(credible),
        "distinctCredibleAlternateRootFamilies":
            body["search"]["distinctCredibleAlternateRootFamilies"],
        "boundaryCompatibleDistinctJobBBranchCount":
            body["boundaryCompatibleDistinctJobBBranchCount"],
        "resultSha256": body["resultSha256"],
    }, indent=2))


if __name__ == "__main__":
    main()