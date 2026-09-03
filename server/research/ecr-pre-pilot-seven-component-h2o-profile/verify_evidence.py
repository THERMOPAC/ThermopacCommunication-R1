#!/usr/bin/env python3
"""Fail-closed verifier for the Task 224 water-equilibrium evidence partition."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def require(value, code):
    if not value:
        raise RuntimeError(code)


def main():
    registry = json.loads((HERE / "evidence-registry.json").read_text())
    require(registry["task"] == 224, "TASK_ID_INVALID")
    scope = registry["scope"]
    require(scope["requiredWaterGridWeightPercent"] == [0.5, 1.0, 2.0, 3.0],
            "REQUIRED_WATER_GRID_INVALID")
    require(scope["minimumAdmissibleTemperatureCount"] >= 2,
            "TEMPERATURE_COVERAGE_REQUIREMENT_INVALID")
    require(scope["requiredHydrocarbonFamilies"] == ["SAT", "MONO", "DI", "POLY", "PA"],
            "HYDROCARBON_FAMILY_REQUIREMENT_INVALID")
    policy = registry["partitionPolicy"]
    training = policy["training"]
    blind = policy["blind"]
    require(len(training) == len(set(training)), "DUPLICATE_TRAINING_SOURCE")
    require(len(blind) == len(set(blind)), "DUPLICATE_BLIND_SOURCE")
    require(set(training).isdisjoint(blind), "TRAINING_BLIND_LEAKAGE")
    source_by_id = {row["sourceId"]: row for row in registry["sources"]}
    require(len(source_by_id) == len(registry["sources"]), "DUPLICATE_SOURCE_ID")
    require(set(training) | set(blind) <= set(source_by_id), "PARTITION_SOURCE_MISSING")
    for source_id in training:
        require(source_by_id[source_id]["admission"]["trainingDiagnostic"] is True,
                "TRAINING_SOURCE_NOT_ADMITTED:" + source_id)
    for source_id in blind:
        admission = source_by_id[source_id]["admission"]
        require(admission["liquidLiquidTieLineValidation"] is True,
                "BLIND_SOURCE_NOT_DIRECT_LLE:" + source_id)
    qualification = registry["qualification"]
    admitted_lle = [
        row for row in registry["sources"]
        if row["admission"]["liquidLiquidTieLineValidation"]
    ]
    require(qualification["admissibleDirectWaterBearingLleRecordCount"] == len(admitted_lle),
            "ADMISSIBLE_LLE_COUNT_INVALID")
    require(qualification["trainingBibliographySourceCount"] == len(training), "TRAINING_SOURCE_COUNT_INVALID")
    numeric_training = [
        source_by_id[source_id] for source_id in training
        if source_by_id[source_id]["numericRecordAvailability"] !=
        "PRIMARY_NUMERIC_TABLES_NOT_PRESENT_IN_GOVERNED_REPOSITORY"
    ]
    require(qualification["trainingNumericRecordCount"] == len(numeric_training),
            "TRAINING_NUMERIC_RECORD_COUNT_INVALID")
    require(qualification["blindNumericRecordCount"] == len(blind), "BLIND_NUMERIC_RECORD_COUNT_INVALID")
    require(qualification["waterGridWeightPercent"] == [0.5, 1.0, 2.0, 3.0],
            "WATER_GRID_INVALID")
    if not admitted_lle:
        require(not blind, "BLIND_PARTITION_MUST_BE_EMPTY")
        require(qualification["beneficialEffectClaim"] is False, "UNSUPPORTED_BENEFIT_CLAIM")
        require(qualification["optimumClaim"] is False, "UNSUPPORTED_OPTIMUM_CLAIM")
        require(qualification["waterPartition"].startswith("NOT_TESTABLE"), "WATER_PARTITION_MUST_FAIL_CLOSED")
        require(qualification["selectivity"].startswith("NOT_TESTABLE"), "SELECTIVITY_MUST_FAIL_CLOSED")
        require(qualification["phaseTopology"].startswith("NOT_QUALIFIED"), "TOPOLOGY_MUST_FAIL_CLOSED")
        require(qualification["temperatureTransfer"].startswith("NOT_QUALIFIED"), "TEMPERATURE_MUST_FAIL_CLOSED")
        require(qualification["globalStability"].startswith("RESEARCH_NUMERICAL_SEARCH_ONLY"),
                "GLOBAL_STABILITY_MUST_REMAIN_RESEARCH_ONLY")
        require(qualification["admissibleTemperatureCount"] == 0, "UNSUPPORTED_TEMPERATURE_COVERAGE")
        require(qualification["coveredHydrocarbonFamilies"] == [], "UNSUPPORTED_FAMILY_COVERAGE")
        require(qualification["trainingPartitionFrozen"] is False, "EMPTY_TRAINING_PARTITION_CANNOT_BE_FROZEN")
        require(qualification["blindPartitionFrozen"] is False, "EMPTY_BLIND_PARTITION_CANNOT_BE_FROZEN")
        require(qualification["compositionClosure"].startswith("NOT_TESTABLE"),
                "COMPOSITION_CLOSURE_MUST_FAIL_CLOSED")
        require(qualification["independentBlindPartitionPassed"] is False,
                "EMPTY_BLIND_PARTITION_CANNOT_PASS")
        require(qualification["decision"] ==
                "FAIL_CLOSED_DIRECT_WATER_BEARING_LLE_EVIDENCE_INSUFFICIENT",
                "EVIDENCE_DECISION_INVALID")
    print(json.dumps({
        "status": "PASS",
        "trainingBibliographySources": len(training),
        "trainingNumericRecords": len(numeric_training),
        "blindNumericRecords": len(blind),
        "admissibleDirectWaterBearingLleRecords": len(admitted_lle),
        "decision": qualification["decision"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()