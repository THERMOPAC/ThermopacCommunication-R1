#!/usr/bin/env python3
"""Versioned production implementation of the water-bearing 7C N_T engine.

Implementation and scientific qualification are deliberately separate.  This
worker executes the implemented native cCOSMO calculation, while its terminal
governance remains fail-closed until governed water-bearing LLE/blind evidence
is approved.
"""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
QUALIFICATION = ROOT / "server/research/ecr-pre-pilot-seven-component-h2o-profile/run_qualification.py"
CONTRACT_PATH = HERE / "engine-contract.json"
DRY_LIMIT_RUNNER = ROOT / "server/research/ecr-pre-pilot-seven-component-dry-limit/run.py"
DRY_LIMIT_EVIDENCE = ROOT / ".agents/outputs/ecr-pre-pilot-seven-component-dry-limit/evidence.json"
FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
MW = (170.3348, 120.194, 142.1971, 202.2506, 405.58, 99.1311, 18.01528)
ENGINE_ID = "ECR2_PREDICTIVE_NT_SEVEN_COMPONENT_ASSEMBLED_RESIDUAL_EXTENSION"
ENGINE_VERSION = "7C-1.1.0"
CHECKPOINT_PROTOCOL = "ACK_V3_ENGINE_CONTRACT"
STATUS = "IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING"


class NoLiquidSplit(Exception):
    def __init__(self, stage, evidence):
        super().__init__(f"SEVEN_COMPONENT_NO_LIQUID_SPLIT:{stage}")
        self.stage = stage
        self.evidence = evidence


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha_file(path):
    return sha_bytes(Path(path).read_bytes())


def scientific_files():
    paths = [
        Path(__file__), CONTRACT_PATH, QUALIFICATION, DRY_LIMIT_RUNNER,
        DRY_LIMIT_EVIDENCE,
        ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py",
        ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
    ]
    for directory in (
        ROOT / "server/research/ecr-pre-pilot-seven-component-h2o-profile/generated",
        ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles",
        ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python",
    ):
        paths.extend(p for p in directory.rglob("*") if p.is_file() and "__pycache__" not in p.parts
                     and p.suffix not in (".pyc", ".pyo"))
    return sorted(set(p.resolve() for p in paths))


def model_inheritance_evidence():
    if not DRY_LIMIT_EVIDENCE.is_file():
        raise RuntimeError("SEVEN_COMPONENT_MODEL_INHERITANCE_EVIDENCE_MISSING")
    evidence = json.loads(DRY_LIMIT_EVIDENCE.read_text())
    supplied = evidence.get("canonicalPayloadSha256")
    payload = dict(evidence)
    payload.pop("canonicalPayloadSha256", None)
    expected_pins = {
        "runnerSha256": sha_file(DRY_LIMIT_RUNNER),
        "qualificationRunnerSha256": sha_file(QUALIFICATION),
        "amendmentModelSha256": sha_file(
            ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
        ),
        "amendmentResultsSha256": sha_file(
            ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
        ),
    }
    pins = evidence.get("pinnedInputs", {})
    checks = evidence.get("modelComponentChecks", [])
    profiles = evidence.get("profileIdentityChecks", [])
    if (
        evidence.get("status") != "PASS"
        or evidence.get("schemaVersion")
        != "ECR_7C_SIX_COMPONENT_MODEL_INHERITANCE_V1"
        or evidence.get("verificationType")
        != "CODE_AND_MODEL_COMPONENT_INHERITANCE"
        or evidence.get("notASevenComponentCalculation") is not True
        or evidence.get("h2oZeroProductionStatePermitted") is not False
        or evidence.get("actualSevenComponentWaterWtPctRange")
        != {"minimum": 0.5, "maximum": 3.0}
        or evidence.get("inheritedComponentOrder")
        != ["SAT", "MONO", "DI", "POLY", "PA", "NMP"]
        or evidence.get("nativeSixComponentModelInstantiatedIndependently") is not True
        or evidence.get("residualEquationImplementedIndependently") is not True
        or evidence.get("residualModel") != "PROJECT_NMP_LLE_RESIDUAL"
        or evidence.get("activityCoefficientTolerance") != 2e-13
        or len(checks) != 4
        or any(
            row.get("scope") != "SIX_COMPONENT_MODEL_INHERITANCE_UNIT_CHECK"
            or row.get("componentOrder") != ["SAT", "MONO", "DI", "POLY", "PA", "NMP"]
            or row.get("status") != "PASS"
            or not math.isfinite(float(
                row.get("maximumActivityCoefficientAbsoluteDifference", math.inf)
            ))
            or float(row.get(
                "maximumActivityCoefficientAbsoluteDifference", math.inf
            )) > 2e-13
            for row in checks
        )
        or len(profiles) != 6
        or [row.get("family") for row in profiles]
        != ["SAT", "MONO", "DI", "POLY", "PA", "NMP"]
        or any(
            row.get("identical") is not True
            or row.get("sixComponentSha256")
            != row.get("sevenComponentInheritedSha256")
            for row in profiles
        )
        or evidence.get("directWaterBearingLleValidated") is not False
        or evidence.get("releaseEligible") is not False
        or evidence.get("predictiveNt") is not None
        or pins.get("parameterVectorSha256")
        != sha_bytes(canonical([
            4.567445606087435, -0.5824286889853156, -0.8242546229992771,
            2.912280182396665, -0.22841674286074476, -0.5735178632858521,
            3.198951081736172, -0.6467578770733512, -0.6495884884278694,
        ]).encode())
        or any(pins.get(key) != value for key, value in expected_pins.items())
        or supplied != sha_bytes(canonical(payload).encode())
    ):
        raise RuntimeError("SEVEN_COMPONENT_MODEL_INHERITANCE_EVIDENCE_INVALID")
    return {
        "status": "PASS",
        "sha256": sha_file(DRY_LIMIT_EVIDENCE),
        "canonicalPayloadSha256": supplied,
        "modelComponentCheckCount": len(checks),
        "profileIdentityCheckCount": len(profiles),
        "h2oZeroProductionStatePermitted": False,
        "actualSevenComponentWaterWtPctRange": {"minimum": 0.5, "maximum": 3.0},
    }


def engine_evidence():
    inheritance = model_inheritance_evidence()
    records = [{"path": p.relative_to(ROOT).as_posix(), "bytes": p.stat().st_size,
                "sha256": sha_file(p)} for p in scientific_files()]
    aggregate = sha_bytes("\n".join(
        f"{r['path']}:{r['bytes']}:{r['sha256']}" for r in records).encode())
    native = [r for r in records if r["path"].endswith(".so")]
    native_aggregate = sha_bytes(canonical(native).encode())
    manifest = ROOT / "predictive-nt-runtime-manifest.json"
    manifest_status = "SOURCE_TREE_NO_PACKAGE_MANIFEST"
    if manifest.is_file():
        packaged = json.loads(manifest.read_text())
        packaged_by_path = {row["path"]: row for row in packaged.get("files", [])}
        if packaged.get("schemaVersion") != "PREDICTIVE_NT_RUNTIME_MANIFEST_V1" or any(
                packaged_by_path.get(row["path"]) != row for row in records):
            raise RuntimeError("SEVEN_COMPONENT_RUNTIME_MANIFEST_MISMATCH")
        manifest_status = "PACKAGED_MANIFEST_VERIFIED"
    return {"engineId": ENGINE_ID, "engineVersion": ENGINE_VERSION,
            "engineContractVersion": ENGINE_VERSION, "engineHash": aggregate,
            "modelIdentity": "COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL + H2O_EXTENSION",
            "modelInheritanceEvidence": inheritance,
            "scientificRuntimeFileCount": len(records),
            "scientificRuntimeAggregateSha256": aggregate,
            "verifiedScientificInputCount": len(records),
            "verifiedScientificInputAggregateSha256": aggregate,
            "verifiedNativeDependencyCount": len(native),
            "verifiedNativeDependencyAggregateSha256": native_aggregate,
            "runtimeManifestStatus": manifest_status,
            "componentOrder": list(FAMILIES)}


def load_qualification():
    spec = importlib.util.spec_from_file_location("seven_component_qualification", QUALIFICATION)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def finite_vector(value, length=7, nonnegative=False):
    if not isinstance(value, list) or len(value) != length:
        return False
    return all(isinstance(x, (int, float)) and math.isfinite(x)
               and (x >= 0 if nonnegative else True) for x in value)


def wet_charge(stage1):
    feed_mass = [float(stage1[k]) for k in (
        "saturatesWt", "monoAromaticsWt", "diAromaticsWt",
        "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt")]
    if abs(sum(feed_mass) - 100.0) > 1e-9:
        raise ValueError("STAGE1_INVALID_FEED_COMPOSITION")
    ratio = float(stage1["solventOilRatio"])
    nmp_pct = float(stage1["nmpPurityWt"])
    water_pct = float(stage1["nmpWaterWt"])
    if (
        ratio <= 0
        or water_pct < 0.5
        or water_pct > 3.0
        or abs(nmp_pct + water_pct - 100.0) > 1e-9
    ):
        raise ValueError("STAGE1_INVALID_WET_SOLVENT_COMPOSITION")
    wet = sum(feed_mass) * ratio
    nmp_mass, water_mass = wet * nmp_pct / 100.0, wet * water_pct / 100.0
    feed = [feed_mass[i] / MW[i] for i in range(6)] + [0.0]
    solvent = [0.0] * 5 + [nmp_mass / MW[5], water_mass / MW[6]]
    closure = wet - nmp_mass - water_mass
    return feed, solvent, {
        "basis": "fixed total wet-solvent mass divided by RRBO feed mass",
        "rrboFeedMass": sum(feed_mass), "solventOilMassRatio": ratio,
        "totalWetSolventMass": wet, "dryNmpMass": nmp_mass, "waterMass": water_mass,
        "nmpWeightPercentOfWetSolvent": nmp_pct,
        "waterWeightPercentOfWetSolvent": water_pct,
        "massClosureResidual": abs(closure),
        "componentOrder": list(FAMILIES),
        "componentMass": {
            "SAT": feed_mass[0], "MONO": feed_mass[1], "DI": feed_mass[2],
            "POLY": feed_mass[3], "PA": feed_mass[4],
            "NMP": feed_mass[5] + nmp_mass, "H2O": water_mass},
    }


def stream(np, flow):
    flow = np.asarray(flow, dtype=float)
    mass = flow * np.asarray(MW)
    return {"componentMoles": flow.tolist(), "componentMass": mass.tolist(),
            "flowMol": float(flow.sum()), "mass": float(mass.sum()),
            "moleFractions": (flow / flow.sum()).tolist(),
            "massFractions": (mass / mass.sum()).tolist()}


def decode_continuation(np, value, count):
    try:
        r = np.asarray(value["raffinateComponentMoles"], dtype=float)
        e = np.asarray(value["extractComponentMoles"], dtype=float)
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("PREDICTIVE_NT_7C_RESUME_STATE_INVALID") from exc
    if r.shape != (count, 7) or e.shape != (count, 7) or not np.all(np.isfinite(r)):
        raise ValueError("PREDICTIVE_NT_7C_RESUME_STATE_INVALID")
    return r, e


def solve_cascade(np, flash, hessian, count, feed, solvent, previous=None):
    # Countercurrent fixed-point construction.  Stage 1 is the RRBO-feed end;
    # stage N is the fresh-wet-solvent end.
    if previous is not None and previous[0].shape[0] == count - 1:
        r = np.vstack([previous[0], previous[0][-1]])
        e = np.vstack([previous[1][0], previous[1]])
    else:
        r = np.tile(np.asarray(feed) / count, (count, 1))
        e = np.tile(np.asarray(solvent) / count, (count, 1))
    converged = False
    stage_flash = [None] * count
    for iteration in range(1, 81):
        new_r, new_e = np.empty_like(r), np.empty_like(e)
        for i in range(count):
            incoming_r = np.asarray(feed) if i == 0 else new_r[i - 1]
            incoming_e = np.asarray(solvent) if i == count - 1 else e[i + 1]
            total = incoming_r + incoming_e
            result = flash(total / total.sum())
            governed = result["phaseFractionExtract"] is not None
            beta = (
                result["phaseFractionExtract"] if governed
                else result.get("diagnosticPhaseFractionExtract")
            )
            raffinate_composition = (
                result["raffinateComposition"] if governed
                else result.get("diagnosticRaffinateComposition")
            )
            extract_composition = (
                result["extractComposition"] if governed
                else result.get("diagnosticExtractComposition")
            )
            if (
                beta is None
                or raffinate_composition is None
                or extract_composition is None
            ):
                raise NoLiquidSplit(i + 1, result)
            new_r[i] = total.sum() * (1.0 - beta) * np.asarray(raffinate_composition)
            new_e[i] = total.sum() * beta * np.asarray(extract_composition)
            result["cascadePropagationClassification"] = (
                "GOVERNED_EQUILIBRIUM"
                if governed
                else "NON_GOVERNED_METASTABLE_OR_UNRESOLVED_NOT_RELEASE_ELIGIBLE"
            )
            stage_flash[i] = result
        residual = max(float(np.max(np.abs(new_r - r))), float(np.max(np.abs(new_e - e))))
        r, e = 0.55 * new_r + 0.45 * r, 0.55 * new_e + 0.45 * e
        if residual <= 1e-8:
            converged = True
            break
    overall = np.asarray(feed) + np.asarray(solvent) - r[-1] - e[0]
    raffinate_mass = r[-1] * np.asarray(MW)
    feed_mass = np.asarray(feed) * np.asarray(MW)
    hydrocarbon_feed = float(feed_mass[:5].sum())
    hydrocarbon_product = float(raffinate_mass[:5].sum())
    product_hydrocarbon_fraction = raffinate_mass[:5] / hydrocarbon_product
    extraction = {
        FAMILIES[i]: (100.0 * (feed[i] - r[-1][i]) / feed[i] if feed[i] > 0 else None)
        for i in range(5)}
    stages = []
    for i, result in enumerate(stage_flash):
        incoming_r = np.asarray(feed) if i == 0 else r[i - 1]
        incoming_e = np.asarray(solvent) if i == count - 1 else e[i + 1]
        local = incoming_r + incoming_e - r[i] - e[i]
        stages.append({
            "stageFromFeedEnd": i + 1, "componentOrder": list(FAMILIES),
            "raffinateIncoming": stream(np, incoming_r), "extractIncoming": stream(np, incoming_e),
            "raffinateLeaving": stream(np, r[i]), "extractLeaving": stream(np, e[i]),
            "maximumComponentBalanceResidualMol": float(np.max(np.abs(local))),
            "isoactivityLogResidual": result["isoactivityTangentResidual"],
            "postSplitTpdSearch": result["postSplitTpd"],
            "localPostSplitStability": {
                "raffinate": hessian(r[i] / r[i].sum()),
                "extract": hessian(e[i] / e[i].sum())},
            "accepted": bool(result["postSplitGloballyStable"]),
            "governanceClassification": result["cascadePropagationClassification"],
        })
    governed = bool(converged and all(s["accepted"] for s in stages))
    return {
        "stageCount": count, "solverTerminationStatus": "CONVERGED" if converged else "MAX_ITERATIONS",
        "residualClosureStatus": "CLOSED" if converged else "UNCLOSED",
        "maximumScaledEquationResidual": residual,
        "overallComponentBalanceResidualMol": overall.tolist(),
        "overallComponentBalanceResidualMass": (overall * np.asarray(MW)).tolist(),
        "maximumOverallComponentBalanceResidualMol": float(np.max(np.abs(overall))),
        "stages": stages,
        "boundaryStreams": {"oilFeed": stream(np, feed), "freshWetSolvent": stream(np, solvent),
                            "finalRaffinate": stream(np, r[-1]), "finalExtract": stream(np, e[0])},
        "productMetrics": {
            "nmpFreeHydrocarbonRecoveryPct": 100.0 * hydrocarbon_product / hydrocarbon_feed,
            "raffinateSaturatesWtNmpFree": 100.0 * product_hydrocarbon_fraction[0],
            "raffinateTotalAromaticsWtNmpFree": 100.0 * product_hydrocarbon_fraction[1:].sum(),
            "raffinatePolarAromaticsWtNmpFree": 100.0 * product_hydrocarbon_fraction[4],
            "nmpInTotalRaffinateWt": 100.0 * raffinate_mass[5] / raffinate_mass.sum(),
            "h2oInTotalRaffinateWt": 100.0 * raffinate_mass[6] / raffinate_mass.sum(),
            "satLossPct": extraction["SAT"], "componentExtractionPct": extraction},
        "targetCompliance": {
            "targetRaffinateSulfurPpm": {"status": "NOT_CALCULABLE",
                                         "calculated": None, "target": None}},
        "allCalculableTargetsPass": False,
        "numericalAcceptancePassed": governed,
        "governanceClassification": (
            "GOVERNED_RESULT" if governed
            else "NON_GOVERNED_METASTABLE_OR_UNRESOLVED_NOT_RELEASE_ELIGIBLE"
        ),
        "diagnosticContinuationUsed": any(
            s["governanceClassification"] != "GOVERNED_EQUILIBRIUM"
            for s in stages
        ),
        "accepted": False, "releaseEligible": False,
        "qualificationStatus": STATUS,
        "_continuation": {"raffinateComponentMoles": r.tolist(), "extractComponentMoles": e.tolist()},
    }


def emit_checkpoint(trial, protocol):
    continuation = trial.pop("_continuation")
    normalized = json.loads(canonical(trial))
    if protocol != CHECKPOINT_PROTOCOL:
        return normalized, continuation
    trial_text = canonical(normalized)
    payload = {"protocol": CHECKPOINT_PROTOCOL,
               "engineContractVersion": ENGINE_VERSION, "componentOrder": list(FAMILIES),
               "continuationState": continuation, "trialCanonical": trial_text,
               "trialHash": sha_bytes(trial_text.encode())}
    payload_text = canonical(payload)
    payload_hash = sha_bytes(payload_text.encode())
    print(f"PREDICTIVE_NT_CHECKPOINT {trial['stageCount']} {payload_hash} "
          f"{base64.b64encode(payload_text.encode()).decode()}", file=sys.stderr, flush=True)
    expected = f"PREDICTIVE_NT_ACK {trial['stageCount']} {payload_hash}"
    if sys.stdin.readline().strip() != expected:
        raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")
    return normalized, continuation


def validate_final(result, maximum):
    if result.get("engineContractVersion") != ENGINE_VERSION:
        raise ValueError("PREDICTIVE_NT_7C_RESULT_CONTRACT_INVALID")
    execution_status = result.get("executionStatus")
    blocked = execution_status in {
        "BLOCKED_NO_LIQUID_SPLIT",
        "BLOCKED_PHASE_TOPOLOGY_UNRESOLVED",
    }
    expected_trials = result.get("blockedCascadeTrialCount", 0) - 1 if blocked else maximum
    if result.get("componentOrder") != list(FAMILIES) or len(result.get("trials", [])) != expected_trials:
        raise ValueError("PREDICTIVE_NT_7C_RESULT_VECTOR_INTEGRITY_INVALID")
    expected_block = {
        "BLOCKED_NO_LIQUID_SPLIT": (
            "SEVEN_COMPONENT_NO_LIQUID_SPLIT",
            "NO_SPLIT_FOUND_DENSE_RESEARCH_SEARCH",
        ),
        "BLOCKED_PHASE_TOPOLOGY_UNRESOLVED": (
            "SEVEN_COMPONENT_PHASE_TOPOLOGY_UNRESOLVED",
            "UNRESOLVED",
        ),
    }.get(execution_status)
    if blocked and (
            expected_block is None
            or result.get("blockingCode") != expected_block[0]
            or not isinstance(result.get("blockedStageFromFeedEnd"), int)
            or result.get("flashEvidence", {}).get("phaseBehavior") != expected_block[1]
            or result.get("flashEvidence", {}).get("phaseFractionExtract") is not None):
        raise ValueError("PREDICTIVE_NT_7C_BLOCKED_RESULT_INVALID")
    for trial in result["trials"]:
        residual = trial.get("overallComponentBalanceResidualMol")
        if not finite_vector(residual):
            raise ValueError("PREDICTIVE_NT_7C_RESULT_VECTOR_INTEGRITY_INVALID")
        for stage in trial.get("stages", []):
            for name in ("raffinateIncoming", "extractIncoming", "raffinateLeaving", "extractLeaving"):
                if not finite_vector(
                        stage.get(name, {}).get("componentMoles"),
                        nonnegative=True):
                    raise ValueError("PREDICTIVE_NT_7C_RESULT_VECTOR_INTEGRITY_INVALID")
    governed_count = sum(
        1 for trial in result["trials"]
        if trial.get("numericalAcceptancePassed") is True
    )
    diagnostic_count = sum(
        1 for trial in result["trials"]
        if trial.get("diagnosticContinuationUsed") is True
    )
    if (
        result.get("trialsAttempted") != len(result["trials"])
        or result.get("governedTrialsAccepted") != governed_count
        or result.get("diagnosticTrialsCalculated") != diagnostic_count
        or (
            not blocked and len(result["trials"]) == maximum
            and result.get("executionStatus") not in {
                "COMPLETED_GOVERNED_SEQUENCE",
                "COMPLETED_DIAGNOSTIC_SEQUENCE",
            }
        )
    ):
        raise ValueError("PREDICTIVE_NT_7C_TRIAL_CLASSIFICATION_INVALID")
    if (result.get("status") != STATUS or result.get("releaseEligible") is not False
            or result.get("predictiveNt") is not None
            or result.get("establishedTheoreticalStages") is not None
            or result.get("sulfurPrediction", {}).get("status") != "NOT_CALCULABLE"):
        raise ValueError("PREDICTIVE_NT_7C_RESULT_GOVERNANCE_INVALID")


def main():
    request = json.loads(sys.stdin.readline())
    if request.get("engineContractVersion") != ENGINE_VERSION:
        raise ValueError("PREDICTIVE_NT_7C_ENGINE_CONTRACT_REQUIRED")
    if request.get("engineHash") != engine_evidence()["engineHash"]:
        raise ValueError("PREDICTIVE_NT_REQUEST_ENGINE_HASH_MISMATCH")
    authority = request.get("stage1Authority", {}).get("source", {})
    stage1 = authority.get("stage1")
    if not isinstance(stage1, dict):
        raise ValueError("STAGE1_AUTHORITY_INVALID")
    maximum = int(stage1["maximumStages"])
    if maximum < 1 or maximum > 10:
        raise ValueError("STAGE1_INVALID_NT_RANGE")
    operating_temperature_c = float(stage1["operatingTemperatureC"])
    if not math.isfinite(operating_temperature_c):
        raise ValueError("STAGE1_OPERATING_TEMPERATURE_INVALID")
    operating_temperature_k = operating_temperature_c + 273.15
    feed, solvent, wet = wet_charge(stage1)
    qualification = load_qualification()
    temporary, np, scipy, model, integrity, runtime = qualification.build_model()
    try:
        flash, tpd, hessian = qualification.engine(
            np, scipy, model, operating_temperature_k,
            wet["waterWeightPercentOfWetSolvent"])
        trials, previous, start = [], None, 1
        blocked = None
        resume = request.get("_resume")
        if resume:
            if resume.get("engineContractVersion") != ENGINE_VERSION:
                raise ValueError("PREDICTIVE_NT_CROSS_ENGINE_RESUME_FORBIDDEN")
            acknowledged = resume.get("acknowledgedStageCount")
            trials = resume.get("trials")
            if not isinstance(acknowledged, int) or not isinstance(trials, list) or len(trials) != acknowledged:
                raise ValueError("PREDICTIVE_NT_7C_RESUME_PREFIX_INVALID")
            previous = decode_continuation(np, resume.get("continuationState"), acknowledged)
            start = acknowledged + 1
        for count in range(start, maximum + 1):
            try:
                trial = solve_cascade(np, flash, hessian, count, feed, solvent, previous)
            except NoLiquidSplit as no_split:
                phase_behavior = no_split.evidence.get("phaseBehavior")
                if phase_behavior == "NO_SPLIT_FOUND_DENSE_RESEARCH_SEARCH":
                    execution_status = "BLOCKED_NO_LIQUID_SPLIT"
                    blocking_code = "SEVEN_COMPONENT_NO_LIQUID_SPLIT"
                    blocking_summary = "No admissible raffinate/extract liquid split was predicted"
                elif phase_behavior == "UNRESOLVED":
                    execution_status = "BLOCKED_PHASE_TOPOLOGY_UNRESOLVED"
                    blocking_code = "SEVEN_COMPONENT_PHASE_TOPOLOGY_UNRESOLVED"
                    blocking_summary = "Raffinate/extract phase topology could not be resolved"
                else:
                    raise ValueError("PREDICTIVE_NT_7C_FLASH_EVIDENCE_INVALID")
                blocked = {
                    "executionStatus": execution_status,
                    "blockingCode": blocking_code,
                    "blockingMessage": (
                        f"{blocking_summary} at "
                        f"cascade trial {count}, physical stage {no_split.stage}. "
                        "Predictive N_T is unavailable; no phases were fabricated."
                    ),
                    "blockedCascadeTrialCount": count,
                    "blockedStageFromFeedEnd": no_split.stage,
                    "flashEvidence": no_split.evidence,
                }
                break
            trial, continuation = emit_checkpoint(trial, request.get("_checkpointProtocol"))
            previous = decode_continuation(np, continuation, count)
            trials.append(trial)
            print(f"PREDICTIVE_NT_PROGRESS {count} {maximum}", file=sys.stderr, flush=True)
        final = {
            "schemaVersion": "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1",
            "engineContractVersion": ENGINE_VERSION, "componentOrder": list(FAMILIES),
            "status": STATUS, "implementationStatus": "IMPLEMENTED",
            "predictiveQualification": "PENDING_GOVERNED_WATER_BEARING_LLE_AND_BLIND_QUALIFICATION",
            "releaseEligible": False, "predictiveNt": None, "establishedTheoreticalStages": None,
            "pilotValidated": False, "calibrationRequired": True,
            "sulfurPrediction": {"status": "NOT_CALCULABLE"},
            "thermodynamicCondition": {
                "temperatureC": operating_temperature_c,
                "temperatureK": operating_temperature_k,
                "authority": "IMMUTABLE_STAGE1_OPERATING_TEMPERATURE",
            },
            "wetSolventConstruction": wet, "engine": engine_evidence(),
            "qualificationEvidence": {"directWaterBearingLleValidated": False,
                                      "independentBlindQualificationPassed": False},
            "executionStatus": (
                "COMPLETED_GOVERNED_SEQUENCE"
                if len(trials) == maximum
                and all(t.get("numericalAcceptancePassed") for t in trials)
                else "COMPLETED_DIAGNOSTIC_SEQUENCE"
                if len(trials) == maximum
                else (blocked or {}).get("executionStatus")
            ),
            "trialsAttempted": len(trials),
            "governedTrialsAccepted": sum(
                1 for trial in trials
                if trial.get("numericalAcceptancePassed") is True
            ),
            "diagnosticTrialsCalculated": sum(
                1 for trial in trials
                if trial.get("diagnosticContinuationUsed") is True
            ),
            "trials": trials,
            **(blocked or {}),
        }
        validate_final(final, maximum)
        print(canonical(final), end="")
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        evidence = engine_evidence()
        print(canonical({"status": "PASS", "python": f"{sys.version_info.major}.{sys.version_info.minor}",
                         **evidence, "checkpointProtocol": CHECKPOINT_PROTOCOL,
                         "governanceStatus": STATUS}))
    else:
        try:
            main()
        except Exception as exc:
            print(canonical({"status": "ENGINE_ERROR", "error": f"{type(exc).__name__}: {exc}",
                             "engineContractVersion": ENGINE_VERSION,
                             "componentOrder": list(FAMILIES), "releaseEligible": False,
                             "predictiveNt": None, "establishedTheoreticalStages": None,
                             "sulfurPrediction": {"status": "NOT_CALCULABLE"}}), end="")
            raise