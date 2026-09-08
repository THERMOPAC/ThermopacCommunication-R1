"""Offline-only solvent/oil sensitivity post-processing and print report.

This module reads frozen files.  It does not import or execute a scientific
worker, access a database, or modify any input/runtime artifact.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "research-results"
RUN_ROOT = RESULTS / "solvent-sensitivity-managed-v2"
PARENT = RESULTS / "solvent-sensitivity-parent-input-db.json"
BASELINE = RESULTS / "prepilot-sizing-equilibrium-duty-db.json"
ENGINE_HASH = "4f0b57dd41a2d768e1964e49ecee23e87de358ad7de697a2b315ab94a79091ac"
MODEL_HASH = "f165f0d23eeae810e40341f1cc86a2b97514bc21b74838d4a08eab1760e6e1af"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
MW = (170.3348, 120.194, 142.1971, 202.2506, 405.58, 99.1311, 18.01528)
HC = COMPONENTS[:5]
AROMATICS = ("MONO", "DI", "POLY", "PA")
ALLOCATIONS = {"SAT": 0.0, "MONO": 0.05, "DI": 0.25, "POLY": 0.35, "PA": 0.35}
TERMINAL = {"COMPLETED", "FAILED", "FAILED_CONTAINMENT",
            "TERMINAL_PARTIAL_TIMEOUT", "TERMINAL_EXTERNAL_STOP"}
PROTOCOL = (ROOT / "dist/predictive-nt-runtime-7c-1-5/server/research/"
            "ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json")
PROTOCOL_SHA256 = "a2e203e3dfd352ff8a10574be2a56d231e38b7a7fb2402ff8545ac347c4ebdcc"
PARENT_SHA256 = "c0d7c4d863e69adc9f68084b15c63f560369f916c14c6b2d8e403ec9ffef8a25"
BASELINE_SHA256 = "cd4309f8a182a32ac3d540cac9fb262d956fde58e20e48711ac99551dd8a61a3"
MANIFEST_SHA256 = "10df39d1e4370e6e7d4b70a4b2d1d5b5149e0e7c3ac900a99b43e98317c1c0df"
WORKER = (ROOT / "dist/predictive-nt-runtime-7c-1-5/server/ecr-pre-pilot/"
          "predictive-nt-seven-component-v1-5/worker.py")
WORKER_SHA256 = "aff19f8c42e846245aefa3ab86ba931a09b7cdbdff76d729c9cd7a18447f5156"
TARGETS = {
    "totalAromaticsWtPctHydrocarbonBasis": ("maximum", 5.0),
    "polarAromaticsWtPctHydrocarbonBasis": ("maximum", 0.5),
    "hydrocarbonRecoveryPct": ("minimum", 83.0),
    "saturatesWtPctHydrocarbonBasis": ("minimum", 90.0),
    "nmpWtPctFullWetRaffinateBasis": ("maximum", 7.0),
}


class EvidenceError(ValueError):
    """Frozen evidence is absent, malformed, or inconsistent."""


def require(condition, code):
    if not condition:
        raise EvidenceError(code)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require_sha(path, expected, code):
    require(isinstance(expected, str) and len(expected) == 64 and sha(path) == expected, code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def protocol_limits():
    require_sha(PROTOCOL, PROTOCOL_SHA256, "FROZEN_PROTOCOL_HASH_MISMATCH")
    protocol = json.loads(PROTOCOL.read_text())
    gates = protocol.get("numericalAcceptance")
    expected = {
        "maximumScaledEquationResidual": 1e-8,
        "maximumOverallComponentBalanceResidualMol": 1e-8,
        "maximumIsoactivityLogResidual": 2e-5,
        "minimumStreamComponentMoles": 1e-12,
        "minimumPhaseCompositionSeparation": 1e-4,
        "minimumStageGibbsReduction": 1e-9,
        "minimumLocalStabilityCurvature": -1e-6,
        "postSplitTpdThreshold": -1e-8,
        "negativeTpdThreshold": -1e-8,
        "multistartProductRelativeTolerance": 1e-6,
    }
    require(isinstance(gates, dict)
            and all(gates.get(key) == value for key, value in expected.items()),
            "FROZEN_PROTOCOL_LIMITS_CHANGED")
    return gates


def finite(value, code):
    require(isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value), code)
    return float(value)


def csv_object(path, field):
    wrapper = json.loads(Path(path).read_text())
    require(
        wrapper.get("environment") == "development"
        and wrapper.get("readOnly") is True
        and wrapper.get("success") is True
        and wrapper.get("exitCode") == 0,
        "INVALID_EXACT_PARENT_CSV_WRAPPER:" + Path(path).name,
    )
    rows = list(csv.DictReader(io.StringIO(wrapper.get("output", ""))))
    require(len(rows) == 1 and set(rows[0]) == {field},
            "EXPECTED_ONE_EXACT_CSV_JSON_FIELD:" + field)
    return json.loads(rows[0][field])


def parent_basis():
    require_sha(PARENT, PARENT_SHA256, "PARENT_CSV_WRAPPER_HASH_MISMATCH")
    require_sha(BASELINE, BASELINE_SHA256, "BASELINE_CSV_WRAPPER_HASH_MISMATCH")
    parent = csv_object(PARENT, "input_snapshot")
    baseline = csv_object(BASELINE, "trial")
    stage1 = parent["stage1Authority"]["source"]["stage1"]
    require(
        parent["stage1Authority"].get("snapshotHash")
        == parent["stage1Authority"].get("source", {}).get("immutableHash")
        == "a717f993f983648c72bbbe82c1edcf7a3b3d0f8ec334301aaff24a20a426d3f3",
        "PARENT_STAGE1_HASH_BINDING_INVALID",
    )
    require(parent.get("sourceSolventOilMassRatio") == 0.5, "PARENT_RATIO_NOT_0P5")
    require(stage1["designFeedRateLph"] == 4000, "PARENT_FEED_NOT_4000_LPH")
    require(stage1["operatingTemperatureC"] == 25
            and stage1["temperatureK"] == 298.15, "PARENT_TEMPERATURE_MISMATCH")
    require(stage1["nmpWaterWt"] == 1.5 and stage1["nmpPurityWt"] == 98.5,
            "PARENT_WET_NMP_MISMATCH")
    require(stage1["nmpInFeedWt"] == 0 and parent["sourceFeedCompositionMassFraction"]["nmp"] == 0,
            "FRESH_FEED_NMP_MUST_BE_EXACT_ZERO")
    require(parent["feedMoleFractions"][5:] == [0, 0],
            "FRESH_FEED_NMP_H2O_MOLE_FRACTIONS_MUST_BE_EXACT_ZERO")
    require(parent["ntTest"] == 10 and stage1["maximumStages"] == 10,
            "PARENT_EXACT_10_STAGE_MISMATCH")
    require(parent.get("engineContractVersion") == "7C-1.5.0",
            "PARENT_ENGINE_CONTRACT_NOT_EXACT")
    require(parent.get("modelHash") == MODEL_HASH, "PARENT_MODEL_HASH_NOT_EXACT")
    return parent, baseline


def masses_from_stream(stream, code):
    values = stream.get("componentMass")
    moles = stream.get("componentMoles")
    require(isinstance(values, list) and len(values) == len(COMPONENTS), code)
    require(isinstance(moles, list) and len(moles) == len(COMPONENTS), code)
    result = {name: finite(values[i], code) for i, name in enumerate(COMPONENTS)}
    mole_values = [finite(value, code) for value in moles]
    require(all(value >= 0 for value in result.values())
            and all(value >= 0 for value in mole_values), code)
    require(all(abs(values[i] - mole_values[i] * MW[i])
                <= 2e-12 * max(1.0, abs(values[i]))
                for i in range(len(COMPONENTS))),
            code + ":FROZEN_MW_FLOW_MISMATCH")
    return result


def calculate_metrics(feed, raffinate):
    feed_hc = sum(feed[name] for name in HC)
    raff_hc = sum(raffinate[name] for name in HC)
    wet = sum(raffinate.values())
    require(feed_hc > 0 and raff_hc > 0 and wet > 0, "NONPOSITIVE_MASS_BASIS")
    result = {
        "totalAromaticsWtPctHydrocarbonBasis":
            100.0 * sum(raffinate[name] for name in AROMATICS) / raff_hc,
        "polarAromaticsWtPctHydrocarbonBasis": 100.0 * raffinate["PA"] / raff_hc,
        "hydrocarbonRecoveryPct": 100.0 * raff_hc / feed_hc,
        "saturatesWtPctHydrocarbonBasis": 100.0 * raffinate["SAT"] / raff_hc,
        "nmpWtPctFullWetRaffinateBasis": 100.0 * raffinate["NMP"] / wet,
        "waterWtPctFullWetRaffinateBasis": 100.0 * raffinate["H2O"] / wet,
    }
    require(all(math.isfinite(value) and 0 <= value <= 100 for value in result.values()),
            "METRIC_OUTSIDE_FINITE_PHYSICAL_DOMAIN")
    require(result["hydrocarbonRecoveryPct"] <= 100 + 1e-9,
            "HYDROCARBON_RECOVERY_ABOVE_PHYSICAL_DOMAIN")
    require(abs(result["saturatesWtPctHydrocarbonBasis"]
                + result["totalAromaticsWtPctHydrocarbonBasis"] - 100) <= 1e-8,
            "HYDROCARBON_COMPOSITION_DOES_NOT_CLOSE")
    return result


def sulfur_metrics(feed, raffinate):
    feed_hc = sum(feed[name] for name in HC)
    raff_hc = sum(raffinate[name] for name in HC)
    wet = sum(raffinate.values())
    require(feed_hc > 0 and raff_hc > 0 and wet > 0, "NONPOSITIVE_SULFUR_BASIS")
    retained = {}
    for name in HC:
        require(feed[name] > 0, "NONPOSITIVE_SULFUR_FAMILY_FEED:" + name)
        retained[name] = raffinate[name] / feed[name]
    # 3500 ppm is 3500/1e6 mass fraction. Convert back with 1e6 exactly once.
    retained_sulfur_mass_per_feed_hc_mass = (
        3500.0 / 1_000_000.0
        * sum(ALLOCATIONS[name] * retained[name] for name in HC)
    )
    feed_basis_ppm = retained_sulfur_mass_per_feed_hc_mass * 1_000_000.0
    return {
        "status": "CONDITIONAL_GOVERNED_FAMILY_ALLOCATION_NOT_SPECIES_RESOLVED",
        "feedBasisProxyPpmPerOriginalHydrocarbonFeedMass": feed_basis_ppm,
        "hydrocarbonProductConditionalPpm":
            feed_basis_ppm / (raff_hc / feed_hc),
        "fullWetRaffinateConditionalPpm":
            feed_basis_ppm / (wet / feed_hc),
        "targetPpm": 1000.0,
        "targetProductMassBasis": "UNSPECIFIED",
        "targetDecision": "NOT_EVALUATED_BOTH_CONDITIONAL_BASES_REPORTED",
        "speciesResolvedSulfurQualification": False,
    }


def baseline_case(trial):
    sulfur = trial["sulfurPrediction"]
    feed5 = sulfur["componentMassBasis"]["oilFeed"]
    raff5 = sulfur["componentMassBasis"]["finalRaffinate"]
    metrics0 = trial["productMetrics"]
    raff_hc = sum(finite(raff5[name], "INVALID_BASELINE_RAFF_MASS") for name in HC)
    wet_fraction_hc = 1.0 - (
        finite(metrics0["nmpInTotalRaffinateWt"], "INVALID_BASELINE_NMP")
        + finite(metrics0["h2oInTotalRaffinateWt"], "INVALID_BASELINE_H2O")
    ) / 100.0
    wet = raff_hc / wet_fraction_hc
    feed = {name: float(feed5[name]) for name in HC} | {"NMP": 0.0, "H2O": 0.0}
    raff = {name: float(raff5[name]) for name in HC}
    raff["NMP"] = wet * metrics0["nmpInTotalRaffinateWt"] / 100.0
    raff["H2O"] = wet * metrics0["h2oInTotalRaffinateWt"] / 100.0
    metrics = calculate_metrics(feed, raff)
    require(abs(metrics["totalAromaticsWtPctHydrocarbonBasis"] - 7.503622077459239) < 2e-12,
            "ARCHIVED_BASELINE_INCLUSIVE_AROMATICS_REPRODUCTION_FAILED")
    require(abs(metrics["hydrocarbonRecoveryPct"] - 88.70607405041983) < 2e-12,
            "ARCHIVED_BASELINE_RECOVERY_REPRODUCTION_FAILED")
    sulfur_metrics0 = sulfur_metrics(feed, raff)
    require(abs(sulfur_metrics0["feedBasisProxyPpmPerOriginalHydrocarbonFeedMass"]
                - 1163.2028153208428) < 2e-10,
            "ARCHIVED_BASELINE_SULFUR_FEED_PROXY_REPRODUCTION_FAILED")
    require(abs(sulfur_metrics0["hydrocarbonProductConditionalPpm"]
                - 1311.3001) < 5e-5,
            "ARCHIVED_BASELINE_SULFUR_HC_CONDITIONAL_REPRODUCTION_FAILED")
    return {
        "caseId": "archived-so-0.5", "solventOilMassRatio": 0.5,
        "recordClassification": "ARCHIVED_RECORDED_TRIAL",
        "accepted": False, "metricsAreDiagnostic": True,
        "numericalPhaseQualification": "UNRESOLVED_IN_ARCHIVED_DB_RECORD",
        "correctedProductChecks": checks(metrics),
        "overallSulfurAcceptance": "UNRESOLVED_UNSPECIFIED_PRODUCT_MASS_BASIS",
        "physicalDesignAcceptance": "UNRESOLVED_OUT_OF_SCOPE",
        "thermalGates": {
            "branchReproduction": bool(trial.get("branchReproduced")),
            "rawResidualClosure": "NOT_PRESENT_IN_ARCHIVED_DB_RECORD",
            "postSplitTpd": "NOT_PRESENT_IN_ARCHIVED_DB_RECORD",
            "localCurvature": "NOT_PRESENT_IN_ARCHIVED_DB_RECORD",
            "phaseClassification": trial.get("physicalLleClassification"),
            "frozenWorkerAcceptance": bool(trial.get("accepted")),
        },
        "metrics": metrics, "targetChecks": checks(metrics),
        "sulfur": sulfur_metrics0,
        "warnings": [
            "Archived total-aromatics field excluded PA; governing value is recomputed as MONO+DI+POLY+PA.",
            "Archived trial was not accepted and lacks the complete independent thermal-gate record.",
        ],
    }


def checks(metrics):
    result = {}
    for key, (direction, target) in TARGETS.items():
        value = metrics[key]
        passed = value <= target if direction == "maximum" else value >= target
        result[key] = {"value": value, "target": target, "direction": direction,
                       "status": "PASS" if passed else "FAIL"}
    return result


def nonpromoting_qualification(gates, product_checks):
    """Keep worker flags and corrected checks separate from unresolved duties."""
    return {
        "accepted": False,
        "frozenWorkerAcceptanceRaw": gates["frozenWorkerAcceptance"],
        "numericalPhaseQualification": gates["numericalPhaseQualification"],
        "correctedProductChecks": product_checks,
        "overallSulfurAcceptance": "UNRESOLVED_UNSPECIFIED_PRODUCT_MASS_BASIS",
        "physicalDesignAcceptance": "UNRESOLVED_OUT_OF_SCOPE",
    }


def validate_request(case_id, ratio, parent):
    request_path = RUN_ROOT / f"{case_id}-request.json"
    input_path = RUN_ROOT / f"{case_id}-input.json"
    request = json.loads(request_path.read_text())
    saved_input = json.loads(input_path.read_text())
    manifest_path = RUN_ROOT / "managed-v2-manifest.json"
    require_sha(manifest_path, MANIFEST_SHA256, "MANAGED_MANIFEST_HASH_MISMATCH")
    require_sha(WORKER, WORKER_SHA256, "FROZEN_WORKER_SOURCE_HASH_MISMATCH")
    manifest = json.loads(manifest_path.read_text())
    require(manifest.get("schemaVersion") == "OFFLINE_SOLVENT_SENSITIVITY_MANAGED_LAUNCH_V2"
            and manifest.get("engineHash") == ENGINE_HASH
            and manifest.get("modelHash") == MODEL_HASH
            and manifest.get("noResume") is True,
            "INVALID_MANAGED_LAUNCH_MANIFEST")
    for path in (request_path, input_path):
        record = manifest.get("files", {}).get(path.name)
        require(isinstance(record, dict)
                and record.get("bytes") == path.stat().st_size,
                "MANIFEST_FILE_SIZE_MISMATCH:" + path.name)
        require_sha(path, record.get("sha256"),
                    "MANIFEST_FILE_HASH_MISMATCH:" + path.name)
    runner_path = RUN_ROOT / "run-case.mjs"
    runner_record = manifest.get("files", {}).get(runner_path.name)
    require(isinstance(runner_record, dict)
            and runner_record.get("bytes") == runner_path.stat().st_size,
            "MANIFEST_RUNNER_SIZE_MISMATCH")
    require_sha(runner_path, runner_record.get("sha256"),
                "MANIFEST_RUNNER_HASH_MISMATCH")
    require(request.get("engineHash") == ENGINE_HASH, "REQUEST_ENGINE_HASH_MISMATCH")
    require(request.get("modelHash") == MODEL_HASH, "REQUEST_MODEL_HASH_MISMATCH")
    require(request.get("engineContractVersion") == "7C-1.5.0",
            "REQUEST_ENGINE_CONTRACT_MISMATCH")
    require(request.get("ntTest") == 10 and request.get("maximumStages") == 10,
            "REQUEST_NOT_EXACT_10_STAGE")
    stage1 = request["stage1Authority"]["source"]["stage1"]
    require(stage1["solventOilRatio"] == ratio
            and request["sourceSolventOilMassRatio"] == ratio,
            "REQUEST_RATIO_MISMATCH")
    require(stage1["temperatureK"] == 298.15
            and stage1["operatingTemperatureC"] == 25
            and stage1["designFeedRateLph"] == 4000,
            "REQUEST_FIXED_BASIS_MISMATCH")
    require(stage1["nmpWaterWt"] == 1.5 and stage1["nmpPurityWt"] == 98.5,
            "REQUEST_WET_SOLVENT_MISMATCH")
    require(stage1["nmpInFeedWt"] == 0 and request["feedMoleFractions"][5:] == [0, 0],
            "REQUEST_FRESH_FEED_NOT_EXACT_ZERO")
    require(request["wetSolventConstruction"]["basis"] == "FIXED_TOTAL_WET_SOLVENT_MASS",
            "REQUEST_RATIO_IS_NOT_TOTAL_WET_SOLVENT_TO_OIL_MASS")
    require(request.get("_resume") is None
            and request.get("_checkpointProtocol") == "ACK_V3_ENGINE_CONTRACT",
            "REQUEST_RESUME_OR_ACK_BINDING_MISMATCH")
    require(saved_input == {k: v for k, v in request.items()
                            if k not in {"engineHash", "_checkpointProtocol", "_resume"}},
            "INPUT_IS_NOT_EXACT_REQUEST_SCIENTIFIC_PAYLOAD")
    # Ensure non-ratio feed composition remained exactly the parent's composition.
    require(request["sourceFeedCompositionMassFraction"]
            == parent["sourceFeedCompositionMassFraction"],
            "DERIVATIVE_FEED_COMPOSITION_CHANGED")
    governed = (
        "minimumRecoveryPct", "maximumNmpRaffinateWt",
        "minimumRaffinateSaturatesWt", "targetRaffinatePolarAromaticsWt",
        "targetRaffinateTotalAromaticsWt", "targetRaffinateSulfurPpm",
        "sulfurAllocationSatPct", "sulfurAllocationMonoPct",
        "sulfurAllocationDiPct", "sulfurAllocationPolyPct",
        "sulfurAllocationPaPct", "feedSulfurPpm",
    )
    parent_stage1 = parent["stage1Authority"]["source"]["stage1"]
    require(all(stage1.get(key) == parent_stage1.get(key) for key in governed),
            "DERIVATIVE_TARGET_OR_SULFUR_ALLOCATION_CHANGED")
    require([stage1[key] for key in governed[-6:]]
            == [0, 5, 25, 35, 35, 3500],
            "GOVERNED_SULFUR_ALLOCATION_NOT_EXACT")
    authority = request["stage1Authority"]
    require(
        authority.get("snapshotHash") == authority.get("source", {}).get("immutableHash")
        and isinstance(authority.get("snapshotHash"), str)
        and len(authority["snapshotHash"]) == 64,
        "DERIVED_STAGE1_HASH_BINDING_INVALID",
    )
    return {
        "parentCsvWrapperSha256": sha(PARENT),
        "equilibriumDutyCsvWrapperSha256": sha(BASELINE),
        "requestSha256": sha(request_path), "inputSha256": sha(input_path),
        "engineSha256": ENGINE_HASH, "modelSha256": MODEL_HASH,
        "managedManifestSha256": sha(manifest_path),
        "managedRunnerSha256": sha(runner_path),
        "frozenWorkerSourceSha256": sha(WORKER),
        "derivedStage1SnapshotHash": authority["snapshotHash"],
        "parentStage1SnapshotHash": parent["stage1Authority"]["snapshotHash"],
    }


def stage_gates(trial):
    limits = protocol_limits()
    stages = trial.get("stages")
    require(isinstance(stages, list) and len(stages) == 10, "MISSING_EXACT_10_STAGE_EVIDENCE")
    tpd = True
    curvature = True
    phase_separation = True
    raw_stage_closure = True
    isoactivity = True
    gibbs = True
    phase_orientation = True
    for ordinal, stage in enumerate(stages, 1):
        require(stage.get("stageFromFeedEnd") == ordinal,
                "STAGE_ORDINAL_MISMATCH")
        raw_stage_closure &= (
            finite(stage.get("maximumComponentBalanceResidualMol"),
                   "MISSING_RAW_STAGE_RESIDUAL")
            <= limits["maximumOverallComponentBalanceResidualMol"]
        )
        isoactivity &= (
            finite(stage.get("isoactivityLogResidual"), "MISSING_ISOACTIVITY")
            <= limits["maximumIsoactivityLogResidual"]
        )
        phase_separation &= (
            finite(stage.get("maximumCompositionSeparation"),
                   "MISSING_PHASE_SEPARATION")
            >= limits["minimumPhaseCompositionSeparation"]
        )
        gibbs &= (
            finite(stage.get("stageGibbsReduction"), "MISSING_GIBBS_REDUCTION")
            >= limits["minimumStageGibbsReduction"]
        )
        r_moles = stage.get("raffinateLeaving", {}).get("componentMoles")
        e_moles = stage.get("extractLeaving", {}).get("componentMoles")
        require(isinstance(r_moles, list) and isinstance(e_moles, list)
                and len(r_moles) == 7 and len(e_moles) == 7,
                "MISSING_STAGE_LEAVING_MOLES")
        r_moles = [finite(x, "INVALID_STAGE_LEAVING_MOLES") for x in r_moles]
        e_moles = [finite(x, "INVALID_STAGE_LEAVING_MOLES") for x in e_moles]
        require(all(x >= limits["minimumStreamComponentMoles"]
                    for x in r_moles + e_moles),
                "NONPOSITIVE_STAGE_LEAVING_MOLES")
        phase_orientation &= e_moles[5] / sum(e_moles) > r_moles[5] / sum(r_moles)
        for phase in ("raffinate", "extract"):
            local = stage["localPostSplitStability"][phase]
            curvature &= (
                finite(local.get("minimumEigenvalue"), "MISSING_CURVATURE")
                >= limits["minimumLocalStabilityCurvature"]
                and local.get("stepSizeConverged") is True
            )
            search = stage["postSplitTpdSearch"][phase]
            refinements = search.get("refinements")
            require(isinstance(refinements, list)
                    and search.get("gridDenominator") == 4
                    and search.get("gridPointCount") == 210
                    and search.get("refinementSeedCount") == 2
                    and len(refinements) == 2,
                    "TPD_REFINEMENT_CONTRACT_MISMATCH")
            refinement_flags = all(
                row.get("success") is True
                and math.isfinite(finite(row.get("value"), "INVALID_REFINED_TPD"))
                and math.isfinite(finite(row.get("gradientInfinityNorm"),
                                         "INVALID_REFINED_TPD_GRADIENT"))
                for row in refinements
            )
            mono = search.get("explicitMonoRichBasinSearch", {})
            searches = mono.get("searches")
            require(isinstance(searches, list) and len(searches) == 3,
                    "MISSING_EXPLICIT_MONO_SEARCHES")
            mono_rows = True
            for row in searches:
                composition = row.get("composition")
                require(isinstance(composition, list) and len(composition) == 7,
                        "INVALID_MONO_SEARCH_COMPOSITION")
                composition = [finite(x, "INVALID_MONO_SEARCH_COMPOSITION")
                               for x in composition]
                mono_rows &= (
                    row.get("optimizerSuccess") is True
                    and row.get("replayOptimizerSuccess") is True
                    and min(composition) >= 0
                    and abs(sum(composition) - 1) <= 1e-10
                    and composition[1] >= 0.5 - 1e-10
                    and finite(row.get("minimum"), "MISSING_MONO_TPD")
                    >= limits["postSplitTpdThreshold"]
                    and finite(row.get("replayMinimum"), "MISSING_MONO_REPLAY_TPD")
                    >= limits["postSplitTpdThreshold"]
                    and abs(row["minimum"] - row["replayMinimum"]) <= 1e-10
                    and finite(row.get("replayMaximumCompositionDifference"),
                               "MISSING_MONO_REPLAY_DIFFERENCE") <= 1e-8
                )
            tpd &= (
                finite(search.get("minimum"), "MISSING_TPD")
                >= limits["postSplitTpdThreshold"]
                and search.get("allRefinementsAccepted") is True
                and refinement_flags
                and mono.get("allRequiredSearchesAccepted") is True
                and mono.get("historicalFalseBasinSeedIncluded") is True
                and mono.get("seedCount") == 3
                and mono_rows
            )
    endpoint_closure = (
        finite(trial.get("maximumScaledEquationResidual"),
               "MISSING_PRIMARY_ENDPOINT_RESIDUAL")
        <= limits["maximumScaledEquationResidual"]
        and finite(trial.get("secondaryMaximumScaledEquationResidual"),
                   "MISSING_SECONDARY_ENDPOINT_RESIDUAL")
        <= limits["maximumScaledEquationResidual"]
    )
    overall_vector = trial.get("overallComponentBalanceResidualMol")
    require(isinstance(overall_vector, list) and len(overall_vector) == 7,
            "MISSING_OVERALL_COMPONENT_BALANCE_VECTOR")
    overall_vector = [finite(value, "INVALID_OVERALL_COMPONENT_BALANCE_VECTOR")
                      for value in overall_vector]
    reported_overall = finite(trial.get("maximumOverallComponentBalanceResidualMol"),
                              "MISSING_OVERALL_RAW_RESIDUAL")
    require(abs(reported_overall - max(abs(value) for value in overall_vector))
            <= 2e-12 * max(1.0, reported_overall),
            "OVERALL_COMPONENT_BALANCE_MAX_MISMATCH")
    overall_balance = reported_overall <= limits["maximumOverallComponentBalanceResidualMol"]
    branch_value = trial.get("branchProductRelativeDifference")
    if endpoint_closure:
        branch_difference = (
            finite(branch_value, "MISSING_BRANCH_PRODUCT_DIFFERENCE")
            <= limits["multistartProductRelativeTolerance"]
        )
        branch_difference_record = branch_difference
    else:
        require(branch_value is None,
                "BRANCH_DIFFERENCE_MUST_BE_NULL_WHEN_ENDPOINTS_UNCLOSED")
        branch_difference = False
        branch_difference_record = "NOT_EVALUATED_ENDPOINT_CLOSURE_FAILED"
    raw = endpoint_closure and overall_balance and raw_stage_closure
    branch = trial.get("branchReproduced") is True and endpoint_closure and branch_difference
    numerical_phase = (raw and branch and isoactivity and gibbs and tpd and curvature
                       and phase_separation and phase_orientation)
    return {
        "endpointRawResidualNorms": endpoint_closure,
        "branchProductDifference": branch_difference_record,
        "branchReproduction": branch,
        "rawResidualClosure": raw,
        "stageAndOverallComponentBalance": raw_stage_closure and overall_balance,
        "isoactivity": isoactivity,
        "gibbsDecrease": gibbs,
        "postSplitTpd": tpd,
        "localCurvature": curvature,
        "phaseSeparation": phase_separation,
        "nmpRichExtractOrientation": phase_orientation,
        "phaseClassification": trial.get("physicalLleClassification"),
        "numericalPhaseQualification": (
            numerical_phase and trial.get("physicalLleClassification") == "PHYSICAL_LLE"
        ),
        "frozenWorkerNumericalAcceptanceRaw": trial.get("numericalAcceptancePassed") is True,
        "frozenWorkerAcceptance": trial.get("accepted") is True,
    }


def checkpoint_provenance(run, result=None):
    directory = run / "checkpoints"
    paths = sorted(directory.glob("stage-*.json")) if directory.exists() else []
    records = []
    for path in paths:
        parts = path.stem.split("-")
        require(len(parts) == 3 and parts[0] == "stage"
                and parts[1].isdigit() and len(parts[2]) == 64,
                "INVALID_CHECKPOINT_FILENAME")
        payload_bytes = path.read_bytes()
        payload_hash = hashlib.sha256(payload_bytes).hexdigest()
        require(payload_hash == parts[2], "CHECKPOINT_PAYLOAD_HASH_MISMATCH")
        payload = json.loads(payload_bytes)
        require(payload.get("protocol") == "ACK_V3_ENGINE_CONTRACT"
                and payload.get("engineContractVersion") == "7C-1.5.0"
                and payload.get("componentOrder") == list(COMPONENTS),
                "CHECKPOINT_ACK_IDENTITY_MISMATCH")
        trial_text = payload.get("trialCanonical")
        require(isinstance(trial_text, str)
                and hashlib.sha256(trial_text.encode()).hexdigest()
                == payload.get("trialHash"),
                "CHECKPOINT_TRIAL_HASH_MISMATCH")
        checkpoint_trial = json.loads(trial_text)
        require(checkpoint_trial.get("stageCount") == int(parts[1]),
                "CHECKPOINT_STAGE_IDENTITY_MISMATCH")
        if result is not None:
            require(len(result.get("trials", [])) == 1
                    and canonical(result["trials"][0]) == trial_text,
                    "CHECKPOINT_FINAL_TRIAL_BINDING_MISMATCH")
        records.append({
            "stageCount": int(parts[1]), "payloadSha256": payload_hash,
            "trialSha256": payload["trialHash"],
            "ackIdentity": "PREDICTIVE_NT_ACK "
                           f"{parts[1]} {payload_hash}",
        })
    return records


def verify_runner_hash(path, status, field, code):
    require(Path(path).exists() and status.get(field) == sha(path), code)
    return status[field]


def execution_disposition(case_id):
    """Classify runner finality without depending on scientific evidence."""
    status_path = RUN_ROOT / f"{case_id}-run/status.json"
    if not status_path.exists():
        return {
            "verifiedTerminal": False, "state": "STATUS_MISSING",
            "reason": "RUNNER_STATUS_FILE_MISSING",
        }
    try:
        status = json.loads(status_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        return {
            "verifiedTerminal": False, "state": "STATUS_UNVERIFIED",
            "reason": f"RUNNER_STATUS_UNREADABLE:{error}",
        }
    if not (
        status.get("schemaVersion") == "OFFLINE_SOLVENT_SENSITIVITY_MANAGED_STATUS_V1"
        and status.get("caseId") == case_id
        and status.get("deadlineSeconds") == 2400
    ):
        return {
            "verifiedTerminal": False, "state": "STATUS_UNVERIFIED",
            "reason": "RUNNER_STATUS_IDENTITY_MISMATCH",
        }
    state = status.get("state")
    return {
        "verifiedTerminal": state in TERMINAL,
        "state": state,
        "reason": status.get("terminationReason"),
    }


def managed_case(case_id, ratio, parent):
    run = RUN_ROOT / f"{case_id}-run"
    status_path = run / "status.json"
    raw_path = run / "raw-output.json"
    require(status_path.exists(), "MISSING_STATUS:" + case_id)
    status = json.loads(status_path.read_text())
    require(status.get("schemaVersion") == "OFFLINE_SOLVENT_SENSITIVITY_MANAGED_STATUS_V1"
            and status.get("caseId") == case_id
            and status.get("deadlineSeconds") == 2400,
            "STATUS_IDENTITY_MISMATCH")
    state = status.get("state")
    disposition = execution_disposition(case_id)
    sources = validate_request(case_id, ratio, parent)
    if state not in TERMINAL:
        return {
            "caseId": case_id, "solventOilMassRatio": ratio, "state": "PENDING",
            "sourceHashes": sources, "executionDisposition": disposition,
        }
    checkpoints = checkpoint_provenance(run)
    require(status.get("checkpointCount") == len(checkpoints),
            "STATUS_CHECKPOINT_COUNT_MISMATCH")
    blocked = {
        "caseId": case_id, "solventOilMassRatio": ratio, "state": state,
        "accepted": False, "blockedReason": status.get("terminationReason") or state,
        "sourceHashes": sources, "verifiedCheckpointProvenance": checkpoints,
        "executionDisposition": disposition,
        "numericalPhaseQualification": "UNRESOLVED",
        "correctedProductChecks": "UNRESOLVED",
        "overallSulfurAcceptance": "UNRESOLVED",
        "physicalDesignAcceptance": "UNRESOLVED",
    }
    if state != "COMPLETED":
        if raw_path.exists():
            sources["runnerStdoutSha256"] = verify_runner_hash(
                raw_path, status, "stdoutSha256", "RUNNER_STDOUT_HASH_MISMATCH")
        stderr_path = run / "stderr.log"
        if stderr_path.exists():
            sources["runnerStderrSha256"] = verify_runner_hash(
                stderr_path, status, "stderrSha256", "RUNNER_STDERR_HASH_MISMATCH")
        return blocked
    require(raw_path.exists() and raw_path.stat().st_size > 0, "EMPTY_COMPLETED_OUTPUT")
    verify_runner_hash(raw_path, status, "stdoutSha256", "RUNNER_STDOUT_HASH_MISMATCH")
    stderr_path = run / "stderr.log"
    verify_runner_hash(stderr_path, status, "stderrSha256", "RUNNER_STDERR_HASH_MISMATCH")
    result = json.loads(raw_path.read_text())
    strict = status.get("strictOutputReport")
    strict_fields = {
        "jsonParsed", "engineContractMatches", "engineHashMatches",
        "ntTestedMatches", "wetSolventRatioMatches", "componentOrderMatches",
        "exactlyOneCheckpoint",
    }
    require(isinstance(strict, dict) and set(strict) == strict_fields
            and all(strict[key] is True for key in strict_fields),
            "COMPLETED_STRICT_OUTPUT_REPORT_FAILED")
    require(result.get("schemaVersion") == "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1",
            "WRONG_FROZEN_OUTPUT_SCHEMA")
    require(result.get("engine", {}).get("engineHash") == ENGINE_HASH,
            "FROZEN_OUTPUT_ENGINE_HASH_MISMATCH")
    require(result.get("engineContractVersion") == "7C-1.5.0"
            and result.get("engine", {}).get("engineContractVersion") == "7C-1.5.0",
            "FROZEN_OUTPUT_ENGINE_CONTRACT_MISMATCH")
    require(result.get("ntTested") == 10 and result.get("componentOrder") == list(COMPONENTS),
            "FROZEN_OUTPUT_STAGE_OR_COMPONENT_MISMATCH")
    require(result.get("wetSolventConstruction", {}).get("solventOilMassRatio") == ratio,
            "FROZEN_OUTPUT_RATIO_MISMATCH")
    condition = result.get("thermodynamicCondition", {})
    require(condition.get("temperatureC") == 25
            and condition.get("temperatureK") == 298.15,
            "FROZEN_OUTPUT_TEMPERATURE_MISMATCH")
    trials = result.get("trials")
    require(isinstance(trials, list) and len(trials) == 1, "EXPECTED_ONE_FROZEN_TRIAL")
    trial = trials[0]
    require(trial.get("stageCount") == 10
            and trial.get("equationVariableCount") == 140
            and trial.get("equationResidualCount") == 140,
            "FROZEN_TRIAL_EQUATION_CONTRACT_MISMATCH")
    checkpoints = checkpoint_provenance(run, result)
    require(status.get("checkpointCount") == 1 and len(checkpoints) == 1,
            "COMPLETED_CHECKPOINT_COUNT_MISMATCH")
    gates = stage_gates(trial)
    streams = trial.get("boundaryStreams", {})
    feed = masses_from_stream(streams.get("oilFeed", {}), "INVALID_FROZEN_FEED_MASS")
    raff = masses_from_stream(streams.get("finalRaffinate", {}), "INVALID_FROZEN_RAFF_MASS")
    metrics = calculate_metrics(feed, raff)
    numerical_phase = gates["numericalPhaseQualification"]
    recorded_metrics = trial.get("productMetrics", {})
    recorded_metric_keys = (
        "nmpFreeHydrocarbonRecoveryPct", "raffinateSaturatesWtNmpFree",
        "raffinateTotalAromaticsWtNmpFree",
        "raffinatePolarAromaticsWtNmpFree", "nmpInTotalRaffinateWt",
        "h2oInTotalRaffinateWt",
    )
    require(
        all(0 <= finite(recorded_metrics.get(key), "INVALID_RECORDED_METRIC") <= 100
            for key in recorded_metric_keys),
        "INVALID_RECORDED_METRICS",
    )
    require(
        abs(metrics["totalAromaticsWtPctHydrocarbonBasis"]
            - (recorded_metrics["raffinateTotalAromaticsWtNmpFree"]
               + recorded_metrics["raffinatePolarAromaticsWtNmpFree"])) <= 1e-9
        and abs(metrics["polarAromaticsWtPctHydrocarbonBasis"]
                - recorded_metrics["raffinatePolarAromaticsWtNmpFree"]) <= 1e-9
        and abs(metrics["hydrocarbonRecoveryPct"]
                - recorded_metrics["nmpFreeHydrocarbonRecoveryPct"]) <= 1e-9
        and abs(metrics["saturatesWtPctHydrocarbonBasis"]
                - recorded_metrics["raffinateSaturatesWtNmpFree"]) <= 1e-9
        and abs(metrics["nmpWtPctFullWetRaffinateBasis"]
                - recorded_metrics["nmpInTotalRaffinateWt"]) <= 1e-9
        and abs(metrics["waterWtPctFullWetRaffinateBasis"]
                - recorded_metrics["h2oInTotalRaffinateWt"]) <= 1e-9,
        "FROZEN_RECORDED_METRICS_DO_NOT_REPRODUCE_FROM_MW_FLOWS",
    )
    sulfur = (
        sulfur_metrics(feed, raff) if numerical_phase else {
            "status": "NOT_CALCULABLE_NUMERICAL_PHASE_QUALIFICATION_FAILED",
            "targetProductMassBasis": "UNSPECIFIED",
            "targetDecision": "NOT_EVALUATED",
            "speciesResolvedSulfurQualification": False,
        }
    )
    frozen_sulfur = trial.get("sulfurPrediction", {})
    if numerical_phase:
        require(
            frozen_sulfur.get("allocationFractions") == ALLOCATIONS
            and frozen_sulfur.get("feedSulfurPpm") == 3500
            and frozen_sulfur.get("targetRaffinateSulfurPpm") == 1000,
            "FROZEN_SULFUR_AUTHORITY_MISMATCH",
        )
        component_basis = frozen_sulfur.get("componentMassBasis", {})
        require(
            component_basis.get("oilFeed") == {name: feed[name] for name in HC}
            and component_basis.get("finalRaffinate") == {name: raff[name] for name in HC},
            "FROZEN_SULFUR_COMPONENT_MASS_BASIS_MISMATCH",
        )
        require(abs(frozen_sulfur.get("predictedRaffinateSulfurPpm", math.inf)
                    - sulfur["feedBasisProxyPpmPerOriginalHydrocarbonFeedMass"]) <= 1e-9,
                "FROZEN_SULFUR_FEED_PROXY_MISMATCH")
    product_checks = checks(metrics)
    qualification = nonpromoting_qualification(gates, product_checks)
    warnings = []
    if not gates["frozenWorkerAcceptance"]:
        warnings.append("Failed/unaccepted trial metrics are diagnostic only.")
    if result.get("releaseEligible") is not False or trial.get("releaseEligible") is not False:
        raise EvidenceError("FROZEN_OUTPUT_RELEASE_BOUNDARY_MISMATCH")
    sources |= {
        "statusSha256": sha(status_path), "frozenOutputSha256": sha(raw_path),
        "runnerStdoutSha256": status["stdoutSha256"],
        "runnerStderrSha256": status["stderrSha256"],
        "frozenProtocolSha256": PROTOCOL_SHA256,
    }
    return {
        "caseId": case_id, "solventOilMassRatio": ratio, "state": state,
        "recordClassification": "FROZEN_NATIVE_WORKER_OUTPUT",
        "executionDisposition": disposition,
        **qualification,
        "metricsAreDiagnostic": True,
        "thermalGates": gates, "metrics": metrics, "targetChecks": product_checks,
        "sulfur": sulfur, "warnings": warnings, "sourceHashes": sources,
        "verifiedCheckpointProvenance": checkpoints,
    }


def build_comparison(allow_pending=False):
    parent, archived = parent_basis()
    cases = [baseline_case(archived)]
    for case_id, ratio in (("so-0.75", 0.75), ("so-1.0", 1.0)):
        disposition = execution_disposition(case_id)
        try:
            case = managed_case(case_id, ratio, parent)
            case.setdefault("executionDisposition", disposition)
            cases.append(case)
        except (EvidenceError, json.JSONDecodeError, OSError, KeyError) as error:
            cases.append({
                "caseId": case_id, "solventOilMassRatio": ratio,
                "state": "INVALID_EVIDENCE", "accepted": False,
                "blockedReason": str(error),
                "executionDisposition": disposition,
                "numericalPhaseQualification": "UNRESOLVED",
                "correctedProductChecks": "UNRESOLVED",
                "overallSulfurAcceptance": "UNRESOLVED",
                "physicalDesignAcceptance": "UNRESOLVED",
            })
    pending = [
        case["caseId"] for case in cases[1:]
        if case.get("executionDisposition", {}).get("verifiedTerminal") is not True
    ]
    if pending and not allow_pending:
        raise EvidenceError("BOTH_MANAGED_CASES_MUST_BE_TERMINAL:" + ",".join(pending))
    source_hashes = {
        PARENT.name: sha(PARENT), BASELINE.name: sha(BASELINE),
    }
    for case in cases[1:]:
        for name, digest in case.get("sourceHashes", {}).items():
            source_hashes[f"{case['caseId']}:{name}"] = digest
    return {
        "schemaVersion": "OFFLINE_SOLVENT_SENSITIVITY_COMPARISON_V1",
        "reportStatus": "PREPARED_PENDING_FROZEN_OUTPUTS" if pending else "FINALIZED_FROM_TERMINAL_FILES",
        "classification": "RESEARCH_SENSITIVITY_NOT_DESIGN_OR_RELEASE",
        "fixedBasis": {
            "temperatureC": 25, "feedLph": 4000, "wetSolventWaterWtPct": 1.5,
            "freshFeedNmpWtPct": 0, "freshFeedWaterWtPct": 0,
            "configuredEquilibriumStages": 10,
            "ratioDefinition": "TOTAL_WET_SOLVENT_MASS_DIVIDED_BY_OIL_MASS",
        },
        "cases": cases,
        "decisionBoundaries": {
            "completedDoesNotMeanAccepted": True,
            "sulfurTargetProductMassBasisUnspecified": True,
            "speciesResolvedSulfurPassAvailable": False,
            "overallValidatedDutyOrDesignClaim": False,
            "historical35And40RpmDiameterCandidates":
                "APPLY_ONLY_TO_ARCHIVED_SO_0P5_AND_ARE_NOT_CARRIED_TO_NEW_TESTS",
            "acceptedHeight": None, "physicalCompartmentCount": None,
            "overallEfficiency": None, "finalRpm": None, "finalDiameter": None,
        },
        "sourceSha256": source_hashes,
    }


def esc(value):
    return html.escape(str(value))


def outcome_text(case):
    if case.get("state") == "TERMINAL_PARTIAL_TIMEOUT":
        return "Timed out; no completed trial or outlet prediction."
    if case.get("state") == "PENDING":
        return "Still running or not yet verified; no values reported."
    return f"{case.get('state', 'UNRESOLVED')}: {case.get('blockedReason', 'no values reported')}"


def report_html(data):
    pending = data["reportStatus"].startswith("PREPARED")
    rows = []
    metric_labels = {
        "totalAromaticsWtPctHydrocarbonBasis": "Total aromatics incl. PA (wt% HC)",
        "polarAromaticsWtPctHydrocarbonBasis": "PA subset (wt% HC)",
        "hydrocarbonRecoveryPct": "Hydrocarbon recovery (%)",
        "saturatesWtPctHydrocarbonBasis": "Saturates (wt% HC)",
        "nmpWtPctFullWetRaffinateBasis": "NMP (wt% full wet raffinate)",
    }
    for case in data["cases"]:
        if "metrics" not in case:
            rows.append(f"<tr><th>{esc(case['caseId'].removeprefix('so-'))}</th><td colspan='4'>"
                        f"{esc(outcome_text(case))}</td></tr>")
            continue
        for key, label in metric_labels.items():
            check = case["targetChecks"][key]
            rows.append("<tr>" + "".join([
                f"<th>{esc(case['solventOilMassRatio'])}</th>", f"<td>{esc(label)}</td>",
                f"<td>{check['value']:.5f}</td>",
                f"<td>{esc(check['direction'])} {check['target']:g}</td>",
                f"<td>{check['status']}</td>"]) + "</tr>")
    sulfur_rows = []
    for case in data["cases"]:
        sulfur = case.get("sulfur")
        if sulfur is None or "feedBasisProxyPpmPerOriginalHydrocarbonFeedMass" not in sulfur:
            sulfur_rows.append(f"<tr><th>{esc(case['caseId'].removeprefix('so-'))}</th>"
                               f"<td colspan='3'>{esc(outcome_text(case))} "
                               f"{esc((sulfur or {}).get('status', ''))}</td></tr>")
        else:
            sulfur_rows.append(
                f"<tr><th>{case['solventOilMassRatio']}</th>"
                f"<td>{sulfur['feedBasisProxyPpmPerOriginalHydrocarbonFeedMass']:.4f}</td>"
                f"<td>{sulfur['hydrocarbonProductConditionalPpm']:.4f}</td>"
                f"<td>{sulfur['fullWetRaffinateConditionalPpm']:.4f}</td></tr>")
    gate_rows = []
    for case in data["cases"][1:]:
        gates = case.get("thermalGates")
        if gates is None:
            gate_rows.append(f"<tr><th>{esc(case['caseId'].removeprefix('so-'))}</th><td colspan='8'>"
                              f"{esc(outcome_text(case))}</td></tr>")
        else:
            gate_rows.append("<tr>" + f"<th>{case['solventOilMassRatio']}</th>" + "".join(
                f"<td>{esc(gates[key])}</td>" for key in (
                    "branchReproduction", "rawResidualClosure", "postSplitTpd",
                    "localCurvature", "phaseClassification", "frozenWorkerAcceptance"
                )) + f"<td>{esc(case['numericalPhaseQualification'])}</td>"
                     f"<td>{esc(case['overallSulfurAcceptance'])}</td></tr>")
    hold = ("Prepared template: both managed cases are not terminal; no pending-case "
            "numbers are displayed." if pending else
             "Both attempts have finished. Computational completion is separate from scientific acceptance.")
    if not pending and all(case.get("state") == "TERMINAL_PARTIAL_TIMEOUT"
                           for case in data["cases"][1:]):
        hold = ("Both sensitivity runs reached the time limit without a completed trial. "
                "No new product-quality values were obtained. This is not a finding of process infeasibility.")
    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>Offline solvent/oil sensitivity</title><style>
@page{{size:A4;margin:14mm}}body{{font:11px/1.42 Arial;color:#243748;margin:0}}
h1{{font-size:24px;color:#173e50}}h2{{font-size:16px;margin-top:18px;break-after:avoid}}
.hold{{background:#fff1d5;border-left:4px solid #a56d10;padding:10px}}
.muted{{color:#667782}}table{{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5px}}
th,td{{border:1px solid #ccd7dd;padding:5px;text-align:left}}th{{background:#edf2f5}}
tr{{break-inside:avoid}}.page{{break-before:page}}code{{font-size:8px;overflow-wrap:anywhere}}
</style></head><body>
<div class="muted">PROJECT 236 · OFFLINE RESEARCH SENSITIVITY · NOT FOR DESIGN OR RELEASE</div>
<h1>Wet-solvent/oil ratio sensitivity<br>archived 0.5 vs approved 0.75 and 1.0</h1>
<div class="hold"><b>{esc(hold)}</b> The saved S/O = 0.5 design remains unchanged.</div>
<p>Fixed basis: 25 °C; 4000 L/h feed; 1.5 wt% water in wet NMP; fresh-feed
NMP and H₂O exactly zero; exactly 10 configured equilibrium stages. Ratio means
total wet-solvent mass/oil mass.</p>
<h2>Product metrics on explicit mass bases</h2>
<table><tr><th>S/O</th><th>Property and basis</th><th>Value</th><th>Target</th><th>Check</th></tr>
{''.join(rows)}</table>
<p class="muted">Total aromatics is MONO+DI+POLY+PA on hydrocarbon mass.
PA is also shown as its 0.5 wt% subset target. NMP uses the full wet raffinate.</p>
<div class="page"></div><h2>Thermal/numerical gates are independent</h2>
<table><tr><th>S/O</th><th>Branch</th><th>Raw closure</th><th>TPD</th>
<th>Curvature</th><th>Phase class</th><th>Frozen accepted (raw)</th>
<th>Independent numerical/phase qualification</th><th>Overall sulfur</th></tr>{''.join(gate_rows)}</table>
<p>COMPLETED is a file/protocol terminal state, not acceptance. Failed-trial
metrics, when present, are retained only as diagnostics. Branch reproduction,
raw residual closure, post-split TPD, local curvature, phase distinction, and
the frozen worker's raw acceptance are not collapsed into one claim. Product
checks use the corrected PA-inclusive aromatic definition; sulfur and physical
design acceptance remain unresolved.</p>
<h2>Sulfur: three differently based quantities</h2>
<table><tr><th>S/O</th><th>Feed-basis proxy (ppm/original HC feed)</th>
<th>Conditional HC-product ppm</th><th>Conditional full-wet-product ppm</th></tr>
{''.join(sulfur_rows)}</table>
<p>The governed allocation is SAT 0, MONO 0.05, DI 0.25, POLY 0.35, PA 0.35
with 3500 ppm feed. The first column is 3500×Σ(fᵢmᵢ,R/mᵢ,F), per feed—not
product ppm. The two product concentrations each divide that proxy once by
their stated product/feed mass ratio. The conversion uses 10⁶, not 10³.</p>
<div class="page"></div><h2>Decision boundary and provenance</h2>
<p>The 1000 ppm target has no specified product-mass denominator, so neither
conditional concentration is silently selected as PASS. This family-allocation
post-processing is not species-resolved sulfur transport. No overall validated
duty, design, or release claim is made.</p>
<p>The archived 35/40 RPM diameter candidates belong only to S/O 0.5 and are
not carried into the 0.75 or 1.0 tests. There is no accepted height, physical
compartment count, overall efficiency, final RPM, or final diameter.</p>
<h2>Evidence SHA-256</h2>{''.join(f"<p><code>{esc(k)}<br>{esc(v)}</code></p>" for k,v in data['sourceSha256'].items())}
</body></html>"""


def write_outputs(data, make_pdf):
    json_path = RESULTS / "solvent-sensitivity-comparison.json"
    html_path = RESULTS / "solvent-sensitivity-report.html"
    json_path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    html_path.write_text(report_html(data))
    paths = [json_path, html_path]
    if make_pdf:
        require(not data["reportStatus"].startswith("PREPARED"),
                "PDF_FINALIZATION_REQUIRES_BOTH_TERMINAL_CASES")
        pdf_path = RESULTS / "solvent-sensitivity-report.pdf"
        subprocess.run([
            "chromium", "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}", html_path.resolve().as_uri(),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        paths.append(pdf_path)
    return paths


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true",
                        help="write pending-safe JSON/HTML template; never PDF")
    parser.add_argument("--no-pdf", action="store_true")
    args = parser.parse_args()
    data = build_comparison(allow_pending=args.prepare)
    for path in write_outputs(data, make_pdf=not args.prepare and not args.no_pdf):
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()