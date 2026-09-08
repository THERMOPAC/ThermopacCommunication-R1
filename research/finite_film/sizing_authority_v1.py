"""Isolated research-only sizing authority and selection bridge.

This module does not solve the finite-volume column.  It admits results from a
separately qualified solver only after source, candidate, state, grid, duty,
and closure evidence agree with the frozen design-269 basis.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
from functools import cmp_to_key
from pathlib import Path

VERSION = "RESEARCH_FINITE_FILM_SIZING_AUTHORITY_V1"
PRE_PILOT_DESIGN_DEFAULT = 7
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
MW_G_MOL = (170.3348, 120.194, 142.1971, 202.2506, 405.58, 99.1311, 18.01528)
HYDROCARBONS = frozenset(("SAT", "MONO", "DI", "POLY", "PA"))
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASIS = ROOT / "research-results/prepilot-sizing-authority-v1.basis.json"


class AuthorityError(ValueError):
    """Fail-closed authority or evidence mismatch."""


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_value(value):
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def _content_hash(payload):
    _require(isinstance(payload, dict), "CONTENT_ADDRESSED_PAYLOAD_REQUIRED")
    supplied = payload.get("contentHash")
    body = {key: value for key, value in payload.items() if key != "contentHash"}
    _require(supplied == sha256_value(body), "CONTENT_HASH_MISMATCH")
    return supplied


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _require(condition, code):
    if not condition:
        raise AuthorityError(code)


def _load_single_csv_json_payload(wrapper_path):
    wrapper = json.loads(Path(wrapper_path).read_text())
    _require(
        wrapper.get("environment") == "development"
        and wrapper.get("readOnly") is True
        and wrapper.get("success") is True
        and wrapper.get("exitCode") == 0,
        "DB_SNAPSHOT_NOT_SUCCESSFUL_DEVELOPMENT_READ_ONLY",
    )
    rows = list(csv.DictReader(io.StringIO(wrapper.get("output", ""))))
    _require(len(rows) == 1 and set(rows[0]) == {"payload"}, "DB_CSV_MUST_HOLD_ONE_JSON_PAYLOAD")
    return json.loads(rows[0]["payload"])


def _close_vector(actual, expected, code, tolerance=2e-12):
    _require(len(actual) == len(expected), code)
    _require(
        all(math.isfinite(a) and abs(a - b) <= tolerance * max(1.0, abs(b))
            for a, b in zip(actual, expected)),
        code,
    )


def _load_single_csv_object(wrapper_path, field):
    wrapper = json.loads(Path(wrapper_path).read_text())
    _require(
        wrapper.get("environment") == "development"
        and wrapper.get("readOnly") is True
        and wrapper.get("success") is True
        and wrapper.get("exitCode") == 0,
        "DB_SNAPSHOT_NOT_SUCCESSFUL_DEVELOPMENT_READ_ONLY",
    )
    rows = list(csv.DictReader(io.StringIO(wrapper.get("output", ""))))
    _require(len(rows) == 1 and set(rows[0]) == {field},
             "DB_CSV_MUST_HOLD_ONE_JSON_OBJECT")
    return json.loads(rows[0][field])


def build_frozen_basis(db_wrapper_path, continuation_path, geometry_source_path,
                       mw_contract_path, equilibrium_duty_wrapper_path):
    """Parse and validate the two current sources into a canonical basis."""
    payload = _load_single_csv_json_payload(db_wrapper_path)
    continuation = json.loads(Path(continuation_path).read_text())["input"]
    stage1 = payload["stage1"]
    hydraulic = payload["hydraulicResult"]
    process = payload["hydraulicProcessBasis"]
    recorded_trial = _load_single_csv_object(
        equilibrium_duty_wrapper_path, "trial"
    )

    _require(payload.get("designId") == 269 and payload.get("projectNumber") == 236,
             "WRONG_DESIGN_OR_PROJECT")
    hashes = (
        payload.get("stage1SnapshotHash"),
        payload.get("hydraulicStage1Hash"),
        process.get("stage1SnapshotHash"),
        hydraulic.get("processBasis", {}).get("stage1SnapshotHash"),
    )
    _require(len(set(hashes)) == 1 and isinstance(hashes[0], str) and len(hashes[0]) == 64,
             "STAGE1_HASH_MISMATCH")
    _require(continuation.get("componentOrder") == list(COMPONENTS),
             "CONTINUATION_COMPONENT_IDENTITY_MISMATCH")
    _require(continuation.get("phaseConfiguration") == stage1["phaseConfiguration"],
             "CONTINUATION_PHASE_CONFIGURATION_MISMATCH")
    _require(abs(continuation.get("temperatureK", -1) - stage1["temperatureK"]) < 1e-12,
             "CONTINUATION_TEMPERATURE_MISMATCH")
    _require(continuation.get("minimumRecoveryPct") == stage1["minimumRecoveryPct"],
             "CONTINUATION_RECOVERY_MISMATCH")
    authority = payload.get("theoreticalStageAuthority", {})
    _require(
        authority.get("value") == PRE_PILOT_DESIGN_DEFAULT
        and authority.get("provenance") == "PRE_PILOT_DESIGN_DEFAULT",
        "NT_AUTHORITY_IS_NOT_PRE_PILOT_DESIGN_DEFAULT_7",
    )
    profile_authority = continuation.get("axialLocalContactProfileAuthority", {})
    _require(
        profile_authority.get("sourceStageCount") == 10
        and profile_authority.get("targetNumericalCells") == 7
        and len(continuation.get("axialLocalContactProfile", [])) == 7,
        "LOCAL_PROFILE_AUTHORITY_MISMATCH",
    )

    rrbo_kg_s = process["rrboFeed"]["flowM3S"] * process["rrboFeed"]["densityKgM3"]
    rrbo_wt = process["composition"]["rrboFeedWt"]
    dispersed = [
        rrbo_kg_s * rrbo_wt[key] / 100 * 1000 / MW_G_MOL[index]
        for index, key in enumerate(
            ("saturates", "monoAromatics", "diAromatics", "polyAromatics",
             "polarAromatics")
        )
    ] + [0.0, 0.0]
    solvent_kg_s = rrbo_kg_s * process["wetSolventPhase"]["solventOilMassRatio"]
    wet = process["composition"]["wetSolventWt"]
    continuous = [0.0] * 5 + [
        solvent_kg_s * wet["nmp"] / 100 * 1000 / MW_G_MOL[5],
        solvent_kg_s * wet["water"] / 100 * 1000 / MW_G_MOL[6],
    ]
    _close_vector(continuation["dispersedFeedMolS"], dispersed,
                  "CONTINUATION_DISPERSED_FLOW_COMPOSITION_MISMATCH")
    _close_vector(continuation["continuousFeedMolS"], continuous,
                  "CONTINUATION_CONTINUOUS_FLOW_COMPOSITION_MISMATCH")

    geometry_text = Path(geometry_source_path).read_text()
    _require(
        "const COMPARTMENT_TO_COLUMN = 0.5;" in geometry_text
        and "compartmentHeightM = COMPARTMENT_TO_COLUMN * columnDiameterM" in geometry_text,
        "V110_PITCH_AUTHORITY_NOT_FOUND",
    )
    candidates, audit = [], []
    for ordinal, trial in enumerate(hydraulic.get("hydraulicRpmEnvelope", []), 1):
        _require(
            abs(trial["compartmentHeightM"] / trial["columnDiameterM"] - 0.5) < 1e-12,
            "TRIAL_PITCH_MISMATCH",
        )
        item = {
            "ordinal": ordinal,
            "rpm": trial["rpm"],
            "columnDiameterM": trial["columnDiameterM"],
            "compartmentPitchM": trial["compartmentHeightM"],
            "pitchToDiameter": 0.5,
            "powerVolumeWM3": trial["powerVolumeWM3"],
            "hydraulicallyFeasible": trial["hydraulicPass"],
            "rangeStatus": trial["status"],
            "operatingHydraulicsStatus": trial["operatingHydraulics"]["status"],
            "hydraulicImmutableHash": payload["hydraulicImmutableHash"],
            "hydraulicCalculationHash": hydraulic["calculationHash"],
        }
        item["candidateSourceHash"] = sha256_value(item)
        if trial["status"] == "CALCULATED_IN_RANGE":
            candidates.append(item)
        else:
            audit.append(item)
    for trial in hydraulic.get("excludedExtrapolatedTrials", []):
        audit.append({
            "rpm": trial["rpm"],
            "columnDiameterM": trial["columnDiameterM"],
            "compartmentPitchM": trial["compartmentHeightM"],
            "rangeStatus": trial["status"],
            "selectable": False,
            "reason": "INAPPLICABLE_AUDIT_ONLY_NOT_CALCULATED_IN_RANGE",
        })

    targets = {
        "totalAromaticsMaxWtPctHydrocarbonBasis":
            stage1["targetRaffinateTotalAromaticsWt"],
        "totalAromaticsGoverningDefinition":
            "MONO_PLUS_DI_PLUS_POLY_PLUS_PA_ON_NMP_FREE_HYDROCARBON_MASS",
        "polarAromaticsRelationshipToTotal":
            "PA_IS_INCLUDED_IN_TOTAL_AROMATICS_AND_ALSO_REPORTED_AS_A_SUBSET",
        "polarAromaticsMaxWtPctHydrocarbonBasis":
            stage1["targetRaffinatePolarAromaticsWt"],
        "hydrocarbonRecoveryMinPct": stage1["minimumRecoveryPct"],
        "nmpMaxWtPctFullRaffinatePhaseBasis": stage1["maximumNmpRaffinateWt"],
        "saturatesMinWtPctHydrocarbonBasis":
            stage1["minimumRaffinateSaturatesWt"],
        "sulfurMaxPpm": stage1["targetRaffinateSulfurPpm"],
    }
    compliance = recorded_trial["targetCompliance"]
    expected_trial_targets = {
        "maximumRaffinateTotalAromaticsWt":
            targets["totalAromaticsMaxWtPctHydrocarbonBasis"],
        "maximumRaffinatePolarAromaticsWt":
            targets["polarAromaticsMaxWtPctHydrocarbonBasis"],
        "minimumRecoveryPct": targets["hydrocarbonRecoveryMinPct"],
        "maximumNmpRaffinateWt": targets["nmpMaxWtPctFullRaffinatePhaseBasis"],
        "minimumRaffinateSaturatesWt":
            targets["saturatesMinWtPctHydrocarbonBasis"],
        "targetRaffinateSulfurPpm": targets["sulfurMaxPpm"],
    }
    _require(all(compliance[key]["target"] == target
                 for key, target in expected_trial_targets.items()),
             "RECORDED_TRIAL_TARGETS_DO_NOT_MATCH_STAGE1")
    _require(
        recorded_trial.get("stageCount") == 10
        and recorded_trial.get("physicalLleClassification") == "PHYSICAL_LLE"
        and recorded_trial.get("branchReproduced") is True
        and recorded_trial.get("accepted") is False,
        "RECORDED_STAGE2_TRIAL_STATUS_MISMATCH",
    )
    sulfur = recorded_trial["sulfurPrediction"]
    _require(
        sulfur.get("basis") == "GOVERNED_STAGE1_SULFUR_ALLOCATION_POST_PROCESSING",
        "RECORDED_SULFUR_PROVENANCE_MISMATCH",
    )
    inclusive_aromatics = (
        recorded_trial["productMetrics"]["raffinateTotalAromaticsWtNmpFree"]
        + recorded_trial["productMetrics"]["raffinatePolarAromaticsWtNmpFree"]
    )
    compliance_audit = {
        key: value for key, value in compliance.items()
        if key != "maximumRaffinateTotalAromaticsWt"
    }
    compliance_audit["recordedAromaticsExcludingPaAudit"] = {
        "status": "HISTORICAL_REPORTED_INTERMEDIATE",
        "target": None,
        "direction": None,
        "calculated":
            recorded_trial["productMetrics"]["raffinateTotalAromaticsWtNmpFree"],
    }
    compliance_audit["sourceComputedMaximumRaffinateTotalAromaticsIncludingPaWt"] = {
        "status": (
            "PASS" if inclusive_aromatics
            <= targets["totalAromaticsMaxWtPctHydrocarbonBasis"] else "FAIL"
        ),
        "target": targets["totalAromaticsMaxWtPctHydrocarbonBasis"],
        "direction": "MAXIMUM",
        "calculated": inclusive_aromatics,
        "method": "RECORDED_AROMATICS_EXCLUDING_PA_PLUS_RECORDED_PA",
    }
    basis = {
        "schemaVersion": VERSION,
        "classification": "RESEARCH_ONLY_PRE_PILOT_NOT_RELEASE_OR_VENDOR_GUARANTEE",
        "admissionPolicy": {
            "status": "BASIS_PREPARED_COLUMN_IMPLEMENTATION_AND_QUALIFICATION_PENDING",
            "allowPhysicalDesignAdmission": False,
        },
        "designId": 269,
        "projectNumber": 236,
        "stage1SnapshotHash": hashes[0],
        "hydraulicImmutableHash": payload["hydraulicImmutableHash"],
        "hydraulicCalculationHash": hydraulic["calculationHash"],
        "sourceSha256": {
            "developmentReadOnlyCsvWrapper": sha256_file(db_wrapper_path),
            "jobCContinuationInput": sha256_file(continuation_path),
            "recordedEquilibriumDutyCsvWrapper":
                sha256_file(equilibrium_duty_wrapper_path),
            "geometryV110Source": sha256_file(geometry_source_path),
            "molecularWeightContractSource": sha256_file(mw_contract_path),
        },
        "componentContract": {
            "componentOrder": list(COMPONENTS),
            "molecularWeightGMol": list(MW_G_MOL),
            "phaseConfiguration": stage1["phaseConfiguration"],
        },
        "currentFeed": {
            "temperatureK": stage1["temperatureK"],
            "continuousMolS": continuous,
            "dispersedMolS": dispersed,
        },
        "theoreticalStageAuthority": {
            "value": PRE_PILOT_DESIGN_DEFAULT,
            "provenance": "PRE_PILOT_DESIGN_DEFAULT",
            "reason": "VALID_CALCULATED_STAGE_2_NT_UNAVAILABLE",
        },
        "profileMetadataOnly": {
            "sourceStageCount": 10,
            "numericalCells": 7,
            "notPhysicalOrCalculatedStages": True,
            "profileSha256": continuation["axialLocalContactProfileSha256"],
        },
        "geometryAuthority": {
            "pitchToDiameter": 0.5,
            "source": "KUHNI_GEOMETRY_RESOLVER_V1.1.0",
            "sourceSha256": sha256_file(geometry_source_path),
        },
        "outletTargets": targets,
        "recordedStage2DutyAuditOnly": {
            "configuredEquilibriumStageCount": recorded_trial["stageCount"],
            "configuredStagesAreNotPhysicalCompartments": True,
            "branchReproduced": True,
            "accepted": False,
            "physicalLleClassification": recorded_trial["physicalLleClassification"],
            "productMetricsAsRecorded": {
                **recorded_trial["productMetrics"],
                "raffinateTotalAromaticsWtNmpFree": None,
                "raffinateAromaticsExcludingPaWtNmpFree":
                    recorded_trial["productMetrics"][
                        "raffinateTotalAromaticsWtNmpFree"
                    ],
            },
            "sourceComputedGoverningTotalAromaticsIncludingPaWtNmpFree":
                inclusive_aromatics,
            "governingTotalAromaticsComputation":
                "RECORDED_AROMATICS_EXCLUDING_PA_PLUS_RECORDED_PA",
            "targetCompliance": compliance_audit,
            "sulfur": {
                "status": "HISTORICAL_CONDITIONAL_PROXY_NOT_INDEPENDENT_TRANSPORT",
                "sourceStatus": sulfur["status"],
                "basis": sulfur["basis"],
                "predictedRaffinateSulfurPpm":
                    sulfur["predictedRaffinateSulfurPpm"],
                "targetStatus": sulfur["targetStatus"],
                "notIndependentSpeciesResolvedQualification": True,
            },
            "scope": (
                "ONE_CONFIGURED_10_STAGE_RECORDED_TRIAL;"
                "DOES_NOT_PROVE_A_GLOBAL_PROCESS_BOUND"
            ),
        },
        "selectableHydraulicCandidates": candidates,
        "inapplicableAuditOnly": audit,
    }
    basis["basisHash"] = sha256_value(basis)
    return basis


def load_frozen_basis(path=DEFAULT_BASIS):
    manifest = json.loads(Path(path).read_text())
    _require(manifest.get("schemaVersion") == "SIZING_AUTHORITY_SOURCE_CACHE_V1",
             "INVALID_FROZEN_BASIS_MANIFEST")
    files = manifest["sourceFiles"]
    resolved = {key: ROOT / value for key, value in files.items()}
    for key, source in resolved.items():
        _require(sha256_file(source) == manifest["sourceSha256"][key],
                 "FROZEN_SOURCE_HASH_MISMATCH:" + key)
    basis = build_frozen_basis(
        resolved["developmentReadOnlyCsvWrapper"],
        resolved["jobCContinuationInput"],
        resolved["geometryV110Source"],
        resolved["molecularWeightContractSource"],
        resolved["recordedEquilibriumDutyCsvWrapper"],
    )
    _require(basis["basisHash"] == manifest.get("expectedBasisHash"),
             "FROZEN_BASIS_HASH_MISMATCH")
    return basis


def evaluate_whole_column_outlet(basis, outlet_mol_s, sulfur_prediction=None):
    """Evaluate raffinate duties on their explicit mass bases."""
    order = basis["componentContract"]["componentOrder"]
    mw = basis["componentContract"]["molecularWeightGMol"]
    _require(order == list(COMPONENTS) and mw == list(MW_G_MOL),
             "COMPONENT_OR_MW_CONTRACT_MISMATCH")
    _require(len(outlet_mol_s) == len(order)
             and all(math.isfinite(x) and x >= 0 for x in outlet_mol_s),
             "INVALID_RAFFINATE_OUTLET_VECTOR")
    mass = {name: outlet_mol_s[i] * mw[i] for i, name in enumerate(order)}
    hydrocarbon_mass = sum(mass[name] for name in HYDROCARBONS)
    full_phase_mass = sum(mass.values())
    feed = basis["currentFeed"]["dispersedMolS"]
    feed_hydrocarbon_mass = sum(feed[i] * mw[i] for i, name in enumerate(order)
                                if name in HYDROCARBONS)
    _require(hydrocarbon_mass > 0 and full_phase_mass > 0 and feed_hydrocarbon_mass > 0,
             "NONPOSITIVE_DUTY_MASS_BASIS")
    values = {
        "totalAromaticsWtPctHydrocarbonBasis":
            100 * sum(mass[x] for x in ("MONO", "DI", "POLY", "PA")) / hydrocarbon_mass,
        "polarAromaticsWtPctHydrocarbonBasis": 100 * mass["PA"] / hydrocarbon_mass,
        "hydrocarbonRecoveryPct": 100 * hydrocarbon_mass / feed_hydrocarbon_mass,
        "nmpWtPctFullRaffinatePhaseBasis": 100 * mass["NMP"] / full_phase_mass,
        "saturatesWtPctHydrocarbonBasis": 100 * mass["SAT"] / hydrocarbon_mass,
    }
    targets = basis["outletTargets"]
    checks = {
        "totalAromatics": values["totalAromaticsWtPctHydrocarbonBasis"]
        <= targets["totalAromaticsMaxWtPctHydrocarbonBasis"],
        "polarAromatics": values["polarAromaticsWtPctHydrocarbonBasis"]
        <= targets["polarAromaticsMaxWtPctHydrocarbonBasis"],
        "recovery": values["hydrocarbonRecoveryPct"] >= targets["hydrocarbonRecoveryMinPct"],
        "nmp": values["nmpWtPctFullRaffinatePhaseBasis"]
        <= targets["nmpMaxWtPctFullRaffinatePhaseBasis"],
        "saturates": values["saturatesWtPctHydrocarbonBasis"]
        >= targets["saturatesMinWtPctHydrocarbonBasis"],
    }
    if not sulfur_prediction or sulfur_prediction.get("status") != "CALCULATED_SPECIES_RESOLVED":
        sulfur = {"status": "NOT_CALCULABLE", "reason":
                   "SULFUR_SPECIES_RESOLVED_PREDICTION_REQUIRED_NO_AROMATIC_PROXY"}
    else:
        _require(sulfur_prediction.get("sourceHash") and
                 math.isfinite(sulfur_prediction.get("raffinatePpm", math.nan)),
                 "INCOMPLETE_SULFUR_PREDICTION")
        sulfur = {
            "status": "CALCULATED_SPECIES_RESOLVED",
            "raffinatePpm": sulfur_prediction["raffinatePpm"],
            "accepted": sulfur_prediction["raffinatePpm"] <= targets["sulfurMaxPpm"],
            "sourceHash": sulfur_prediction["sourceHash"],
        }
    return {
        "values": values,
        "checks": checks,
        "sulfur": sulfur,
        "allCalculableDutiesAccepted": all(checks.values()),
        "allDutiesAccepted": all(checks.values()) and sulfur.get("accepted") is True,
    }


def physical_compartments_from_quantized_evidence(candidate, evidence):
    """Admit an integer hardware solve; never ceil an unconstrained height."""
    _require(evidence.get("candidateSourceHash") == candidate["candidateSourceHash"],
             "CANDIDATE_SOURCE_HASH_MISMATCH")
    _require(evidence.get("sourceBasisHash"), "MISSING_SOURCE_BASIS_HASH")
    height = evidence.get("quantizedHardwareHeightM")
    pitch = candidate["compartmentPitchM"]
    _require(isinstance(height, (int, float)) and math.isfinite(height) and height > 0,
             "INVALID_QUANTIZED_HARDWARE_HEIGHT")
    count = round(height / pitch)
    _require(count > 0 and abs(height - count * pitch) <= 1e-10 * max(1.0, height),
             "HEIGHT_NOT_QUANTIZED_TO_GOVERNED_PITCH")
    _require(evidence.get("rerunAtQuantizedHardwareHeight") is True,
             "QUANTIZED_HARDWARE_RERUN_REQUIRED")
    _require(evidence.get("acceptedPhysicalHeightSolution") is True,
             "PHYSICAL_HEIGHT_SOLUTION_NOT_ACCEPTED")
    _require(evidence.get("physicalCompartments") == count,
             "PHYSICAL_COMPARTMENT_EVIDENCE_MISMATCH")
    hardware = evidence.get("quantizedHardwareState")
    expected_hardware = {
        "rpm": candidate["rpm"],
        "columnDiameterM": candidate["columnDiameterM"],
        "compartmentPitchM": pitch,
        "powerVolumeWM3": candidate["powerVolumeWM3"],
        "physicalCompartments": count,
        "quantizedHardwareHeightM": height,
    }
    _require(
        hardware == expected_hardware
        and evidence.get("quantizedHardwareStateHash") == sha256_value(hardware),
        "QUANTIZED_HARDWARE_STATE_HASH_MISMATCH",
    )
    _require(
        evidence.get("exactHeightRunHash")
        and evidence.get("localQualificationHash")
        and evidence.get("fullQualificationHash"),
        "QUANTIZED_HEIGHT_RUN_AND_QUALIFICATION_HASHES_REQUIRED",
    )
    return count


def validate_qualified_design(basis, candidate, evidence):
    """Reject stale local qualification and incomplete whole-column evidence."""
    basis_body = {key: value for key, value in basis.items() if key != "basisHash"}
    _require(basis.get("basisHash") == sha256_value(basis_body),
             "IN_MEMORY_BASIS_MUTATION_OR_HASH_MISMATCH")
    frozen = [
        item for item in basis["selectableHydraulicCandidates"]
        if item.get("candidateSourceHash") == candidate.get("candidateSourceHash")
    ]
    candidate_body = {
        key: value for key, value in candidate.items() if key != "candidateSourceHash"
    }
    _require(
        len(frozen) == 1
        and candidate.get("candidateSourceHash") == sha256_value(candidate_body)
        and candidate == frozen[0],
        "CANDIDATE_NOT_EXACT_FROZEN_MEMBER",
    )
    _require(evidence.get("sourceBasisHash") == basis["basisHash"],
             "SOURCE_BASIS_HASH_MISMATCH")
    _require(
        candidate.get("rangeStatus") == "CALCULATED_IN_RANGE"
        and candidate.get("hydraulicallyFeasible") is True
        and candidate.get("operatingHydraulicsStatus")
        == "OPERATING_HOLDUP_CALCULATED",
        "CANDIDATE_NOT_SELECTABLE_HYDRAULICALLY",
    )
    state = evidence.get("candidateState")
    _require(isinstance(state, dict)
             and evidence.get("candidateStateHash") == sha256_value(state),
             "CANDIDATE_STATE_HASH_MISMATCH")
    expected_state = {
        "rpm": candidate["rpm"],
        "columnDiameterM": candidate["columnDiameterM"],
        "compartmentPitchM": candidate["compartmentPitchM"],
    }
    _require(state == expected_state, "CANDIDATE_STATE_DOES_NOT_MATCH_HYDRAULIC_TRIAL")
    local = evidence.get("localQualification")
    _require(isinstance(local, dict)
             and local.get("status") == "QUALIFIED"
             and local.get("runId") == evidence.get("runId")
             and local.get("transportBasis")
             == "CALCULATED_EFFECTIVE_RESISTANCE_ASSUMED_TRANSPORT"
             and local.get("candidateStateHash") == evidence["candidateStateHash"]
             and local.get("candidateSourceHash") == candidate["candidateSourceHash"]
             and local.get("sourceBasisHash") == basis["basisHash"]
             and local.get("qualificationHash") == sha256_value(
                 {k: v for k, v in local.items() if k != "qualificationHash"}),
             "LOCAL_QUALIFICATION_INCOMPLETE_OR_MISMATCHED")
    count = physical_compartments_from_quantized_evidence(candidate, evidence)
    hardware_hash = evidence["quantizedHardwareStateHash"]
    run_id = evidence.get("runId")
    _require(isinstance(run_id, str) and run_id, "OWNED_COLUMN_RUN_ID_REQUIRED")
    common = {
        "runId": run_id,
        "sourceBasisHash": basis["basisHash"],
        "candidateSourceHash": candidate["candidateSourceHash"],
        "candidateStateHash": evidence["candidateStateHash"],
        "quantizedHardwareStateHash": hardware_hash,
        "localQualificationHash": local["qualificationHash"],
    }
    exact_run = evidence.get("exactHeightRun")
    exact_run_hash = _content_hash(exact_run)
    _require(
        all(exact_run.get(key) == value for key, value in common.items())
        and exact_run.get("demonstratedRunAtExactQuantizedHardwareHeight") is True
        and exact_run.get("physicalCompartments") == count
        and exact_run.get("quantizedHardwareHeightM")
        == evidence["quantizedHardwareHeightM"]
        and evidence.get("exactHeightRunHash") == exact_run_hash,
        "EXACT_QUANTIZED_HEIGHT_RUN_CONTENT_OR_BINDING_MISMATCH",
    )
    grid = evidence.get("numericalGrid")
    duty = evidence.get("dutyEvidence")
    closure = evidence.get("closureEvidence")
    sulfur = evidence.get("sulfurPrediction")
    grid_hash, duty_hash = _content_hash(grid), _content_hash(duty)
    closure_hash, sulfur_hash = _content_hash(closure), _content_hash(sulfur)
    for payload in (grid, duty, closure, sulfur):
        _require(all(payload.get(key) == value for key, value in common.items()),
                 "OWNED_RUN_OR_AUTHORITY_BINDING_MISMATCH")
    cells = grid.get("cells")
    _require(
        isinstance(cells, list) and cells
        and [cell.get("numericalCell") for cell in cells]
        == list(range(1, len(cells) + 1)),
        "WHOLE_COLUMN_NUMERICAL_GRID_CONTENT_MISSING",
    )
    tolerance = closure.get("toleranceMolS")
    _require(isinstance(tolerance, (int, float)) and 0 < tolerance <= 1e-6,
             "INVALID_CLOSURE_TOLERANCE")
    residual_names = (
        "maximumRawEquationResidualMolS",
        "maximumLocalMaterialBalanceResidualMolS",
        "maximumGlobalMaterialBalanceResidualMolS",
        "maximumFinalConstitutiveResidualMolS",
        "maximumBothPhaseMixingConservationResidualMolS",
        "maximumDiffusiveMolarFluxFrameResidualMolS",
    )
    _require(
        all(isinstance(closure.get(key), (int, float))
            and math.isfinite(closure[key]) and 0 <= closure[key] <= tolerance
            for key in residual_names),
        "NUMERICAL_OR_PHYSICAL_CLOSURE_THRESHOLD_FAILED",
    )
    _require(
        all(
            all(isinstance(cell.get(key), (int, float))
                and math.isfinite(cell[key]) and 0 <= cell[key] <= tolerance
                for key in ("rawEquationResidualMolS",
                            "localMaterialBalanceResidualMolS",
                            "finalConstitutiveResidualMolS"))
            for cell in cells
        ),
        "GRID_CELL_RESIDUAL_THRESHOLD_FAILED",
    )
    _close_vector(grid.get("finalDispersedOutletMolS", []),
                  duty.get("finalDispersedOutletMolS", []),
                  "GRID_DUTY_FINAL_OUTLET_MISMATCH")
    _close_vector(grid.get("finalContinuousOutletMolS", []),
                  duty.get("finalContinuousOutletMolS", []),
                  "GRID_DUTY_FINAL_OUTLET_MISMATCH")
    sulfur_for_evaluation = {
        "status": sulfur.get("status"),
        "raffinatePpm": sulfur.get("raffinatePpm"),
        "sourceHash": sulfur_hash,
    }
    calculated_duty = evaluate_whole_column_outlet(
        basis, duty["finalDispersedOutletMolS"], sulfur_for_evaluation
    )
    _require(
        duty.get("calculatedEvaluation") == calculated_duty
        and calculated_duty["allDutiesAccepted"] is True,
        "ACTUAL_WHOLE_COLUMN_DUTIES_NOT_ACCEPTED_OR_REPRODUCIBLE",
    )
    full = evidence.get("fullQualification")
    full_hash = _content_hash(full)
    _require(
        all(full.get(key) == value for key, value in common.items())
        and full.get("numericalGridHash") == grid_hash
        and full.get("dutyEvidenceHash") == duty_hash
        and full.get("closureEvidenceHash") == closure_hash
        and full.get("sulfurPredictionHash") == sulfur_hash
        and full.get("exactHeightRunHash") == exact_run_hash
        and evidence.get("fullQualificationHash") == full_hash
        and evidence.get("localQualificationHash") == local["qualificationHash"],
        "FULL_QUALIFICATION_CONTENT_OR_BINDING_MISMATCH",
    )
    _require(
        basis["admissionPolicy"].get("allowPhysicalDesignAdmission") is True,
        "COLUMN_IMPLEMENTATION_AND_QUALIFICATION_ADMISSION_NOT_ENABLED",
    )
    _require(abs(evidence.get("columnDiameterM", -1) - candidate["columnDiameterM"]) < 1e-12,
             "DESIGN_DIAMETER_DOES_NOT_MATCH_CANDIDATE")
    area = math.pi * candidate["columnDiameterM"] ** 2 / 4
    active_height = count * candidate["compartmentPitchM"]
    active_volume = area * active_height
    return {
        "accepted": True,
        "ordinal": candidate["ordinal"],
        "rpm": candidate["rpm"],
        "columnDiameterM": candidate["columnDiameterM"],
        "physicalCompartments": count,
        "activeHeightM": active_height,
        "activeVolumeM3": active_volume,
        "shaftPowerW": active_volume * candidate["powerVolumeWM3"],
        "candidateSourceHash": candidate["candidateSourceHash"],
    }


def select_physical_design(basis, evidence_by_candidate_hash):
    """Select by frozen volume, power, RPM, ordinal ordering."""
    accepted = []
    for candidate in basis["selectableHydraulicCandidates"]:
        evidence = evidence_by_candidate_hash.get(candidate["candidateSourceHash"])
        if evidence is not None:
            accepted.append(validate_qualified_design(basis, candidate, evidence))
    _require(accepted, "NO_COMPLETE_ACCEPTED_PHYSICAL_DESIGN")
    def governed_order(a, b):
        def equal(x, y):
            return abs(x - y) <= 1e-12 * max(1.0, abs(x), abs(y))
        if not equal(a["activeVolumeM3"], b["activeVolumeM3"]):
            return -1 if a["activeVolumeM3"] < b["activeVolumeM3"] else 1
        if not equal(a["shaftPowerW"], b["shaftPowerW"]):
            return -1 if a["shaftPowerW"] < b["shaftPowerW"] else 1
        if a["rpm"] != b["rpm"]:
            return -1 if a["rpm"] < b["rpm"] else 1
        return a["ordinal"] - b["ordinal"]

    selected = sorted(accepted, key=cmp_to_key(governed_order))[0]
    authority = basis["theoreticalStageAuthority"]
    selected["overallEfficiencyNtPerPhysical"] = (
        authority["value"] / selected["physicalCompartments"]
    )
    selected["theoreticalStageAuthority"] = dict(authority)
    selected["selectionRule"] = (
        "MINIMUM_ACTIVE_VOLUME_THEN_SHAFT_POWER_THEN_LOWER_RPM_THEN_ORDINAL"
    )
    return selected


if __name__ == "__main__":
    print(canonical_json(load_frozen_basis()))