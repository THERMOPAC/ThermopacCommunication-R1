"""Finalize the bounded refined attempt after the 33-node outer timeout."""
import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V6 = ROOT/"research-results/finite-film-cell1-lobatto-v6-focused-refinement.json"
VALID = ROOT/"research-results/finite-film-physical-collocation-v4-validation.json"
OUT = ROOT/"research-results/finite-film-cell1-lobatto-v7-final-hold.json"


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    v6 = json.loads(V6.read_text())
    level = v6["attempts"][0]
    report = {
        "schemaVersion": "ISOLATED_SAVED_CELL_1_LOBATTO_V7_FINAL_HOLD",
        "scope": "ISOLATED_SAVED_CELL_1_ONLY",
        "sourceSha256": sha(Path(__file__)),
        "preservedFocusedV6EvidenceSha256": sha(V6),
        "syntheticValidationEvidenceSha256": sha(VALID),
        "completedLevel": {
            "nodes": level["nodes"], "status": level["status"],
            "maximumLobattoResidual": level["maximumLobattoResidual"],
            "maximumIsoactivityResidual": level["maximumIsoactivityResidual"],
            "continuousMaximumScaledConstitutiveDefect":
                level["continuousAudit"]["maximumScaledConstitutiveDefect"],
            "dispersedMaximumScaledConstitutiveDefect":
                level["dispersedAudit"]["maximumScaledConstitutiveDefect"],
            "wholeContinuousCurveNonnegativeByBernsteinConvexHull":
                level["continuousAudit"]["wholeCurveNonnegativeByConvexHull"],
            "wholeDispersedCurveNonnegativeByBernsteinConvexHull":
                level["dispersedAudit"]["wholeCurveNonnegativeByConvexHull"],
            "minimumDispersedBernsteinControlFraction":
                level["dispersedAudit"]["minimumBernsteinControlFraction"],
            "reducedJacobian": level["reducedJacobian"],
            "maximumScaledFluxDriftFrom13Nodes":
                level["maximumScaledFluxDriftFromPrevious"],
            "maximumInterfaceDriftFrom13Nodes":
                level["maximumInterfaceDriftFromPrevious"],
            "maximumCommonCoordinateProfileDriftFrom13Nodes":
                level["maximumCommonCoordinateProfileDriftFromPrevious"],
            "elapsedSeconds": level["elapsedSeconds"],
            "numericalAccepted": False,
        },
        "next33NodeLevel": {
            "attempted": True,
            "completed": False,
            "stopReason": "300_SECOND_OUTER_EXECUTION_BUDGET_EXHAUSTED",
            "accepted": False,
        },
        "twoSuccessiveRefinementsAtOrBelow1e-8": False,
        "outcome": "NO_REFINED_ADMISSIBLE_NUMERICAL_CANDIDATE_FOUND",
        "interpretation": "Numerical hold only; not process infeasibility.",
        "productionJobsRun": [], "columnContinuationRun": False,
        "tasksCreatedOrChanged": [], "physicalFeedModified": False,
        "boundaryAdapterModified": False, "acceptanceGatesModified": False,
        "physicalAcceptance": False,
    }
    OUT.write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps({"outcome": report["outcome"], "lastCompletedNodes": 17}))
    return report


if __name__ == "__main__": run()