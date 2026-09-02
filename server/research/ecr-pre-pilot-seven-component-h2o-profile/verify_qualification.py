#!/usr/bin/env python3
"""Fail-closed verifier for the Task 222 research qualification artifact."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-seven-component-h2o-profile"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require(value, code):
    if not value:
        raise RuntimeError(code)


def main():
    result_path = OUT / "qualification-results.json"
    report_path = OUT / "qualification-report.md"
    provenance_path = OUT / "qualification-provenance.json"
    result = json.loads(result_path.read_text())
    provenance = json.loads(provenance_path.read_text())
    require(provenance["runnerSha256"] == sha(HERE / "run_qualification.py"), "RUNNER_HASH_MISMATCH")
    require(provenance["resultsSha256"] == sha(result_path), "RESULT_HASH_MISMATCH")
    require(provenance["reportSha256"] == sha(report_path), "REPORT_HASH_MISMATCH")
    require(result["researchOnly"] is True and result["designUseBlocked"] is True, "RESEARCH_BOUNDARY_INVALID")
    require(result["releaseEligible"] is False and result["pilotValidated"] is False, "RELEASE_BOUNDARY_INVALID")
    require(result["directWaterBearingLleValidated"] is False, "UNSUPPORTED_LLE_VALIDATION_CLAIM")
    require(result["qualifiedForDesignOrRelease"] is False and result["predictiveNt"] is None, "DESIGN_ADMISSION_INVALID")
    require(result["sulfurPrediction"] == "NOT_CALCULABLE", "SULFUR_ADMISSION_INVALID")
    require(result["model"]["componentCount"] == 7 and result["model"]["residualAmendmentUsed"] is False, "MODEL_IDENTITY_INVALID")
    require(result["model"]["lnGamma"] == "get_lngamma_comb(T,x)+get_lngamma_resid(T,x)", "MODEL_DEFINITION_INVALID")
    require(result["runtime"]["numpy"] == "2.1.3" and result["runtime"]["scipy"] == "1.14.1", "RUNTIME_VERSION_INVALID")
    pinned = provenance["pinnedInputs"]
    paths = {
        "sixGenerationManifestSha256": ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/generation-manifest.json",
        "h2oGenerationManifestSha256": HERE / "generated/generation-manifest.json",
        "h2oProfileVerificationSha256": HERE / "generated/profile-verification.json",
        "sevenComponentRuntimeCompatibilitySha256": HERE / "generated/seven-component-runtime-compatibility.json",
        "frozenSixComponentRunnerSha256": ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py",
        "frozenSixComponentProvenanceSha256": ROOT / "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json",
    }
    for key, path in paths.items():
        require(pinned[key] == sha(path), key + ":PINNED_HASH_MISMATCH")
    cases = result["cases"]
    require(len(cases) == 4, "CASE_COVERAGE_INVALID")
    require([row["wetSolventConversion"]["waterWeightPercentOfWetSolvent"] for row in cases] == [0.5, 1.0, 2.0, 3.0], "WATER_GRID_INVALID")
    for row in cases:
        require(row["components"] == ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"], "COMPONENT_ORDER_INVALID")
        require(abs(sum(row["overallComposition"]) - 1.0) < 1e-10, "MOLE_FRACTION_CLOSURE_FAILED")
        conversion = row["wetSolventConversion"]
        require(conversion["totalWetSolventMass"] == 90.0, "WET_SOLVENT_BASIS_CHANGED")
        require(abs(conversion["dryNmpMass"] + conversion["waterMass"] - 90.0) < 1e-12, "WET_SOLVENT_SPLIT_FAILED")
        require(conversion["massClosureResidual"] < 1e-12, "MASS_CLOSURE_FAILED")
        require(provenance["caseInputSha256"][row["caseId"]] == row["pinnedInputSha256"], "CASE_HASH_MISMATCH")
        tpd = row["nativeOverallTpd"]
        require(math.isfinite(tpd["minimum"]) and tpd["fullSimplexPointCount"] == 924, "TPD_SEARCH_INVALID")
        coverage = tpd["searchCoverage"]
        require(coverage["fullSimplexLatticeDenominator"] == 6, "TPD_LATTICE_DENSITY_INVALID")
        require(coverage["diverseGlobalStarts"] >= 4 and coverage["adaptiveInteriorStarts"] >= 24, "TPD_DIVERSITY_INVALID")
        require(coverage["familyRichStarts"] == 7, "TPD_FAMILY_STARTS_INVALID")
        require(coverage["explicitFaceRefinements"] == 14 and coverage["explicitEdgeRefinements"] == 21, "ACTIVE_SET_COVERAGE_INVALID")
        routes = tpd["routes"]
        require(sum(route["method"] == "SLSQP-active-face" for route in routes) == 14, "FACE_ROUTE_RECORDS_INVALID")
        require(sum(route["method"] == "bounded-active-edge" for route in routes) == 21, "EDGE_ROUTE_RECORDS_INVALID")
        require(all(route["success"] for route in routes if route["method"] in {"SLSQP-active-face", "bounded-active-edge"}), "ACTIVE_SET_REFINEMENT_NOT_CONVERGED")
        require(sum(route["seed"].startswith("DIVERSE_GRID_") for route in routes) == 6, "DIVERSE_START_RECORDS_INVALID")
        require(sum(route["seed"].startswith("FAMILY_RICH_") for route in routes) == 7, "FAMILY_START_RECORDS_INVALID")
        require(sum(route["seed"].startswith("ADAPTIVE_") for route in routes) == 36, "ADAPTIVE_START_RECORDS_INVALID")
        require(tpd["globalExclusionClaimed"] is False, "UNSUPPORTED_GLOBAL_EXCLUSION_CLAIM")
        require(tpd["activeSetKkt"]["passed"] is True, "ACTIVE_SET_KKT_FAILED")
        require(tpd["classification"] in {"NEGATIVE_BOUNDARY_BASIN_FOUND", "NEGATIVE_INTERIOR_BASIN_FOUND", "NO_NEGATIVE_TPD_FOUND_DENSE_FAIL_CLOSED_SEARCH"}, "TPD_CLASSIFICATION_INVALID")
        require("NO_NEGATIVE_TPD_MINIMUM" not in tpd["classification"], "UNSUPPORTED_MINIMUM_WORDING")
        if tpd["minimumOnBoundary"]:
            require(bool(tpd["activeSetKkt"]["activeSet"]), "BOUNDARY_ACTIVE_SET_MISSING")
        hessian = row["tangentSpaceHessian"]
        require(hessian["surface"].startswith("local TPD"), "HESSIAN_SURFACE_INVALID")
        require(len(hessian["reconstructions"]) == 2, "HESSIAN_STEP_COVERAGE_INVALID")
        require(all(len(item["tpdFiniteDifferenceEigenvalues"]) == 6 for item in hessian["reconstructions"]), "HESSIAN_DIMENSION_INVALID")
        flash = row["standaloneFlash"]
        require(flash["phaseBehavior"] in {"TWO_PHASE_RESEARCH_DIAGNOSTIC", "NO_SPLIT_FOUND_DENSE_RESEARCH_SEARCH", "UNRESOLVED"}, "FLASH_CLASSIFICATION_INVALID")
        require(flash["phaseBehavior"] != "SINGLE_PHASE", "UNSUPPORTED_SINGLE_PHASE_WORDING")
        require(len(flash["optimizerRoutes"]) == 3, "FLASH_ROUTE_COVERAGE_INVALID")
        if not flash["independentRouteConvergence"] or not flash["optimizerSuccess"]:
            require(flash["phaseBehavior"] == "UNRESOLVED", "FAILED_FLASH_MUST_BE_UNRESOLVED")
        require(math.isfinite(flash["moleBalanceMaximumResidual"]), "FLASH_BALANCE_NONFINITE")
        if flash["phaseBehavior"] == "TWO_PHASE_RESEARCH_DIAGNOSTIC":
            require(flash["postSplitTpd"] is not None, "POST_SPLIT_TPD_MISSING")
            require(set(flash["postSplitTpd"]) == {"raffinate", "extract"}, "POST_SPLIT_PHASE_COVERAGE_INVALID")
    require("DIRECT_WATER_BEARING_LLE_VALIDATION_MISSING" in result["blockers"], "WATER_LLE_BLOCKER_MISSING")
    expected_numerical = all(
        row["tangentSpaceHessian"]["stepSizeConverged"]
        and row["tangentSpaceHessian"]["independentDerivativeAgreement"]
        and row["nativeOverallTpd"]["activeSetKkt"]["passed"]
        and row["nativeOverallTpd"]["independentRouteAgreement"]
        and row["standaloneFlash"]["phaseBehavior"] != "UNRESOLVED"
        and row["standaloneFlash"]["independentRouteConvergence"]
        for row in cases)
    require(result["numericalResearchChecksPassed"] is expected_numerical, "NUMERICAL_GATE_DERIVATION_INVALID")
    require(result["finalDecision"] == "RESEARCH_ONLY_BLOCKED_PENDING_DIRECT_WATER_BEARING_LLE_VALIDATION", "FINAL_DECISION_INVALID")
    require("Blocked from design and release" in report_path.read_text(), "REPORT_WARNING_MISSING")
    print(json.dumps({"status": "PASS", "cases": len(cases),
                      "flashOutcomes": {row["caseId"]: row["standaloneFlash"]["phaseBehavior"] for row in cases},
                      "decision": result["finalDecision"]}, sort_keys=True))


if __name__ == "__main__":
    main()