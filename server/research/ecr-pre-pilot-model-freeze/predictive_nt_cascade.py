#!/usr/bin/env python3
"""Background SAT/MONO/DI/POLY/NMP counter-current cascade using the frozen flash."""
from __future__ import annotations

import importlib.util
import base64
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OLD = ROOT / "server/research/ecr-pre-pilot-descriptor-transfer"
UQ = ROOT / "server/research/ecr-pre-pilot-uniquac"
NEW = ROOT / "server/research/ecr-pre-pilot-new-analogue"
CHECKPOINT = ROOT / ".agents/outputs/ecr-pre-pilot-new-analogue/fit-checkpoint.json"
MODEL_HASH = "2f22d47cb35c59bc0e6a28ac2aa02a431a79adcd6c454a51d62989928a907dc3"
ENGINE_ID = "ECR2_PREDICTIVE_NT_BACKGROUND"
ENGINE_VERSION = "2.0.0"
RUNTIME_SUPPORT_PATHS = [
    "server/research/ecr-pre-pilot-uniquac/model.py",
    "server/research/ecr-pre-pilot-uniquac/structural-provenance.json",
]
COMPONENTS = ["SAT", "MONO", "DI", "POLY", "NMP"]
MOLECULAR_WEIGHTS = np.asarray([226.44, np.nan, 142.1971, 202.2506, 99.1311])
EPS = 1e-14
BALANCE_TOL = 1e-8
CONVERGENCE_TOL = 1e-8
MAX_SWEEPS = 300
DAMPING = 0.75

sys.path[:0] = [str(UQ), str(OLD)]
spec = importlib.util.spec_from_file_location("predictive_nt_descriptor_transfer", OLD / "run.py")
dt = importlib.util.module_from_spec(spec)
assert spec.loader
sys.modules[spec.name] = dt
spec.loader.exec_module(dt)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime_engine_hash():
    relative_script = Path(__file__).resolve().relative_to(ROOT).as_posix()
    paths = [relative_script, *RUNTIME_SUPPORT_PATHS]
    payload = "\n".join(f"{path}:{sha256(ROOT / path)}" for path in sorted(paths))
    return hashlib.sha256(payload.encode()).hexdigest()


def verify_declared_model_hash(manifest):
    if manifest.get("modelHash") != MODEL_HASH:
        raise ValueError("DECLARED_MODEL_HASH_MISMATCH")


def verify_frozen_model():
    manifest_path = ROOT / "server/research/ecr-pre-pilot-model-freeze/model-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    verify_declared_model_hash(manifest)
    artifacts = manifest["artifacts"]
    for name, artifact in artifacts.items():
        path = ROOT / artifact["path"]
        if not path.is_file() or sha256(path) != artifact["sha256"]:
            raise ValueError(f"FROZEN_ARTIFACT_MISMATCH: {name}")
    payload = "\n".join(
        f"{name}:{artifact['sha256']}" for name, artifact in sorted(artifacts.items())
    )
    if hashlib.sha256(payload.encode()).hexdigest() != manifest["modelHash"]:
        raise ValueError("MODEL_MANIFEST_HASH_MISMATCH")
    qualification = manifest["qualificationEvidence"]
    if sha256(ROOT / qualification["path"]) != qualification["sha256"]:
        raise ValueError("QUALIFICATION_EVIDENCE_MISMATCH")
    return manifest


def verify_runtime():
    manifest = verify_frozen_model()
    row, previous = setup_model("n-hexadecane", "n-pentylbenzene", 323.15)
    restore_model(previous)
    assert row is not None
    return {
        "status": "PASS",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "modelHash": manifest["modelHash"],
        "verifiedArtifactCount": len(manifest["artifacts"]) + 1,
    }


def runtime_local_parameters(theta, row, registry):
    descriptor_row = row
    if len(row["identities"]) == len(COMPONENTS):
        descriptor_row = {**row, "active": list(range(len(COMPONENTS)))}
    return dt.local_parameters(theta, descriptor_row, registry)


def setup_model(sat_identity: str, mono_identity: str, temperature_k: float):
    registry = json.loads((NEW / "descriptor-registry.json").read_text())
    theta = np.asarray(json.loads(CHECKPOINT.read_text())["parameters"], dtype=np.float64)
    _, table = dt.uq.structural()
    table = dict(table)
    if mono_identity == "sec-butylbenzene":
        table[mono_identity] = {
            "identity": mono_identity,
            "r": 5.9452,
            "q": 4.584,
        }
    identities = (
        sat_identity, mono_identity, "1-methylnaphthalene", "pyrene",
        "N-methyl-2-pyrrolidone",
    )
    for identity in identities:
        if identity not in registry["molecules"] or identity not in table:
            raise ValueError(f"MOLECULAR_IDENTITY_UNAVAILABLE: {identity}")
    row = dt.uq.row(
        "predictive-nt-runtime",
        "PRE_PILOT_MODEL",
        temperature_k,
        [0.7, 0.2, 0.05, 0.05, 0.0],
        [0.05, 0.08, 0.03, 0.04, 0.8],
        [0, 1, 2, 3, 4],
        False,
        list(identities),
        table,
        None,
    )
    old_pm, old_gamma, old_stand = dt.uq.PM, dt.uq.gamma, dt.uq.stand_gamma
    dt.uq.PM = dt.BASE_PM
    dt.uq.gamma = lambda value, active_row, ignored: old_gamma(
        value, active_row, runtime_local_parameters(theta, active_row, registry)
    )
    dt.uq.stand_gamma = lambda value, active_row, ignored, log_name="standaloneFinalGate": old_stand(
        value, active_row, runtime_local_parameters(theta, active_row, registry), log_name
    )
    return row, (old_pm, old_gamma, old_stand)


def restore_model(previous):
    dt.uq.PM, dt.uq.gamma, dt.uq.stand_gamma = previous


def normalize(value):
    vector = np.asarray(value, dtype=float)
    total = float(vector.sum())
    if vector.shape != (5,) or not np.all(np.isfinite(vector)) or np.any(vector < 0) or total <= 0:
        raise ValueError("INVALID_FEED_COMPOSITION")
    return vector / total


def flash(mixture, row):
    result = dt.uq.flash(mixture, row, np.zeros(1))
    if result["phaseBehavior"] != "PREDICTED_TWO_PHASE" or not result.get("converged"):
        raise RuntimeError(f"FLASH_{result['phaseBehavior']}")
    rrbo = np.asarray(result["RRBO_rich"], dtype=float)
    nmp = np.asarray(result["NMP_rich"], dtype=float)
    return rrbo, nmp, float(result["beta_NMP_rich"]), {
        "phaseBehavior": result["phaseBehavior"],
        "stabilityTPDMinimum": result["stabilityTPDMinimum"],
        "massBalanceMaxResidual": result.get("massBalanceMaxResidual"),
        "isoactivityLogResidual": result.get("isoactivityLogResidual"),
        "gibbsDecrease": result.get("gibbsDecrease"),
        "independentFinalPhaseChecksPass": bool(
            result.get("independentFinalPhaseChecks", {}).get("pass")
        ),
    }


def product_metrics(flow, composition, feed, molecular_weights):
    hydrocarbons = float(composition[:4].sum())
    hydrocarbon_fraction_mono = float(composition[1] / hydrocarbons) if hydrocarbons > EPS else None
    hydrocarbon_fraction_sat = float(composition[0] / hydrocarbons) if hydrocarbons > EPS else None
    feed_hydrocarbons = float(feed[:4].sum())
    recovery = float(flow * hydrocarbons / feed_hydrocarbons) if feed_hydrocarbons > EPS else None
    outlet_mass_flows = flow * composition * molecular_weights
    outlet_mass = float(outlet_mass_flows.sum())
    hydrocarbon_mass = float(outlet_mass_flows[:4].sum())
    feed_mass = float(np.dot(feed[:4], molecular_weights[:4]))
    mass_profile = outlet_mass_flows / outlet_mass
    hc_mass_profile = outlet_mass_flows[:4] / hydrocarbon_mass
    rrbo_recovery = hydrocarbon_mass / feed_mass if feed_mass > EPS else None
    mole_profile = {
        **dict(zip(COMPONENTS, map(float, composition))),
        "PA": None,
        "totalAromatics": float(composition[1:4].sum()),
    }
    mass_profile_record = {
        **dict(zip(COMPONENTS, map(float, mass_profile))),
        "PA": None,
        "totalAromatics": float(mass_profile[1:4].sum()),
    }
    hc_mass_profile_record = {
        "SAT": float(hc_mass_profile[0]),
        "MONO": float(hc_mass_profile[1]),
        "DI": float(hc_mass_profile[2]),
        "POLY": float(hc_mass_profile[3]),
        "PA": None,
        "totalAromatics": float(hc_mass_profile[1:4].sum()),
        "NMP": None,
    }
    return (
        hydrocarbon_fraction_mono, hydrocarbon_fraction_sat, recovery,
        rrbo_recovery, mole_profile, mass_profile_record, hc_mass_profile_record,
    )


def select_minimum_accepted_trial(trials):
    accepted = [trial for trial in trials if trial["accepted"]]
    return min(accepted, key=lambda trial: trial["stageCount"]) if accepted else None


def initialize_component_flows(stage_count, feed, solvent_ratio, continuation_state=None):
    solvent = np.asarray([0.0, 0.0, 0.0, 0.0, 1.0])
    liquid = np.zeros((stage_count + 2, 5), dtype=float)
    extract = np.zeros((stage_count + 2, 5), dtype=float)
    liquid[stage_count + 1] = feed
    extract[0] = solvent_ratio * solvent
    if continuation_state is None:
        midpoint_flow = (1.0 + solvent_ratio) / 2.0
        for stage in range(1, stage_count + 1):
            liquid[stage] = midpoint_flow * feed
            extract[stage] = midpoint_flow * solvent
        return liquid, extract, "COLD_COMPONENT_FLOW"

    prior_liquid, prior_extract = continuation_state
    prior_stages = prior_liquid.shape[0] - 2
    prior_liquid_grid = np.arange(1, prior_stages + 2, dtype=float) / (prior_stages + 1)
    prior_extract_grid = np.arange(0, prior_stages + 1, dtype=float) / (prior_stages + 1)
    liquid_grid = np.arange(1, stage_count + 1, dtype=float) / (stage_count + 1)
    extract_grid = np.arange(1, stage_count + 1, dtype=float) / (stage_count + 1)
    for component in range(5):
        liquid[1:stage_count + 1, component] = np.interp(
            liquid_grid,
            prior_liquid_grid,
            prior_liquid[1:prior_stages + 2, component],
        )
        extract[1:stage_count + 1, component] = np.interp(
            extract_grid,
            prior_extract_grid,
            prior_extract[0:prior_stages + 1, component],
        )
    return liquid, extract, "N_MINUS_1_COMPONENT_FLOW_CONTINUATION"


def component_state(liquid, extract, stage_count):
    return np.r_[
        liquid[1:stage_count + 1].ravel(),
        extract[1:stage_count + 1].ravel(),
    ]


def balance_residuals(liquid, extract, stage_count, feed, solvent_ratio):
    solvent = np.asarray([0.0, 0.0, 0.0, 0.0, 1.0])
    local = []
    for stage in range(1, stage_count + 1):
        local.append(
            liquid[stage + 1] + extract[stage - 1]
            - liquid[stage] - extract[stage]
        )
    overall = feed + solvent_ratio * solvent - liquid[1] - extract[stage_count]
    local_maximum = max(float(np.max(np.abs(value))) for value in local)
    return local, overall, local_maximum, float(np.max(np.abs(overall)))


def run_trial(stage_count, feed, solvent_ratio, row, molecular_weights, targets, continuation_state=None):
    liquid, extract, initialization = initialize_component_flows(
        stage_count,
        feed,
        solvent_ratio,
        continuation_state,
    )
    final_checks = [None] * (stage_count + 2)
    flash_cache = {}
    convergence_trace = []

    for sweep in range(1, MAX_SWEEPS + 1):
        previous = component_state(liquid, extract, stage_count)
        for stage in range(stage_count, 0, -1):
            incoming = liquid[stage + 1] + extract[stage - 1]
            mixed_flow = float(incoming.sum())
            if mixed_flow <= EPS or np.any(incoming < -EPS) or not np.all(np.isfinite(incoming)):
                raise RuntimeError("CASCADE_INVALID_COMPONENT_FLOW_STATE")
            mixed = incoming / mixed_flow
            cache_key = tuple(np.round(mixed, 12))
            if cache_key not in flash_cache:
                flash_cache[cache_key] = flash(mixed, row)
            xr, ye, beta, checks = flash_cache[cache_key]
            target_liquid = mixed_flow * (1.0 - beta) * xr
            target_extract = mixed_flow * beta * ye
            if (
                np.any(target_liquid < -EPS)
                or np.any(target_extract < -EPS)
                or not np.all(np.isfinite(target_liquid))
                or not np.all(np.isfinite(target_extract))
            ):
                raise RuntimeError("CASCADE_INVALID_FLASH_COMPONENT_FLOW")
            liquid[stage] = DAMPING * target_liquid + (1.0 - DAMPING) * liquid[stage]
            extract[stage] = DAMPING * target_extract + (1.0 - DAMPING) * extract[stage]
            final_checks[stage] = checks
        current = component_state(liquid, extract, stage_count)
        maximum_delta = float(np.max(np.abs(current - previous)))
        _, overall, local_maximum, overall_maximum = balance_residuals(
            liquid,
            extract,
            stage_count,
            feed,
            solvent_ratio,
        )
        convergence_trace.append({
            "sweep": sweep,
            "maximumStateDelta": maximum_delta,
            "maximumLocalComponentBalanceResidual": local_maximum,
            "overallComponentBalanceMaximum": overall_maximum,
        })
        if (
            maximum_delta <= CONVERGENCE_TOL
            and local_maximum <= BALANCE_TOL
            and overall_maximum <= BALANCE_TOL
        ):
            break
    else:
        raise RuntimeError("CASCADE_DID_NOT_CONVERGE")

    local_residuals, residuals, _, max_balance = balance_residuals(
        liquid,
        extract,
        stage_count,
        feed,
        solvent_ratio,
    )
    l_flow = liquid.sum(axis=1)
    e_flow = extract.sum(axis=1)
    x = [normalize(liquid[stage]) if l_flow[stage] > EPS else None for stage in range(stage_count + 2)]
    y = [normalize(extract[stage]) if e_flow[stage] > EPS else None for stage in range(stage_count + 2)]
    mono, sat, recovery, rrbo_recovery, mole_profile, mass_profile, hc_mass_profile = product_metrics(
        l_flow[1], x[1], feed, molecular_weights
    )
    stage_records = []
    local_balance_accepted = True
    for stage in range(1, stage_count + 1):
        local_maximum = float(np.max(np.abs(local_residuals[stage - 1])))
        local_accepted = local_maximum <= BALANCE_TOL
        local_balance_accepted &= local_accepted
        stage_records.append({
            "stageNumber": stage,
            "raffinateFlowMolarBasis": float(l_flow[stage]),
            "raffinateComposition": dict(zip(COMPONENTS, map(float, x[stage]))),
            "extractFlowMolarBasis": float(e_flow[stage]),
            "extractComposition": dict(zip(COMPONENTS, map(float, y[stage]))),
            "localComponentBalanceResiduals": dict(zip(COMPONENTS, map(float, local_residuals[stage - 1]))),
            "localComponentBalanceMaximum": local_maximum,
            "localComponentBalanceAccepted": local_accepted,
            "thermodynamicChecks": final_checks[stage],
        })
    return {
        "stageCount": stage_count,
        "sweeps": sweep,
        "maximumConvergenceDelta": maximum_delta,
        "raffinateFlowMolarBasis": float(l_flow[1]),
        "extractFlowMolarBasis": float(e_flow[stage_count]),
        "raffinateComposition": dict(zip(COMPONENTS, map(float, x[1]))),
        "extractComposition": dict(zip(COMPONENTS, map(float, y[stage_count]))),
        "raffinateMonoHydrocarbonMoleFraction": mono,
        "raffinateSaturatesHydrocarbonMoleFraction": sat,
        "nmpFreeHydrocarbonRecovery": recovery,
        "rrboMassRecovery": rrbo_recovery,
        "rrboMassRecoveryGovernance": {
            "status": "CALCULABLE",
            "basis": "COMPLETE_ZERO_PA_FEED_SAT_MONO_DI_POLY_MASS",
            "deprecatedNmpFreeHydrocarbonRecoveryUsedForAcceptance": False,
        },
        "raffinateMoleProfile": mole_profile,
        "raffinateMassProfile": mass_profile,
        "raffinateHydrocarbonMassProfile": hc_mass_profile,
        "polarAromaticsProfile": {
            "moleFraction": None,
            "massFraction": None,
            "status": "NOT_CALCULABLE",
            "blocker": "POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE",
        },
        "overallComponentBalanceResiduals": dict(zip(COMPONENTS, map(float, residuals))),
        "overallComponentBalanceMaximum": max_balance,
        "balanceAccepted": max_balance <= BALANCE_TOL and local_balance_accepted,
        "solverDiagnostics": {
            "method": "DAMPED_DIRECTIONAL_COMPONENT_FLOW",
            "initialization": initialization,
            "damping": DAMPING,
            "maximumSweeps": MAX_SWEEPS,
            "convergenceTolerance": CONVERGENCE_TOL,
            "balanceTolerance": BALANCE_TOL,
            "flashEvaluations": len(flash_cache),
            "convergenceTrace": convergence_trace,
        },
        "stages": stage_records,
    }, (liquid.copy(), extract.copy())


def serialize_continuation_state(continuation_state):
    liquid, extract = continuation_state
    return {
        "liquidComponentFlows": liquid.tolist(),
        "extractComponentFlows": extract.tolist(),
    }


def restore_continuation_state(value, stage_count):
    if not isinstance(value, dict):
        raise ValueError("PREDICTIVE_NT_RESUME_STATE_INVALID")
    liquid = np.asarray(value.get("liquidComponentFlows"), dtype=float)
    extract = np.asarray(value.get("extractComponentFlows"), dtype=float)
    expected_shape = (stage_count + 2, 5)
    if (
        liquid.shape != expected_shape
        or extract.shape != expected_shape
        or not np.all(np.isfinite(liquid))
        or not np.all(np.isfinite(extract))
        or np.any(liquid < -EPS)
        or np.any(extract < -EPS)
    ):
        raise ValueError("PREDICTIVE_NT_RESUME_STATE_INVALID")
    return liquid, extract


def emit_trial_checkpoint(trial, continuation_state, checkpoint_protocol):
    if checkpoint_protocol != "ACK_V2":
        return
    canonical_trial = json.dumps(trial, sort_keys=True, separators=(",", ":"))
    trial_digest = hashlib.sha256(canonical_trial.encode()).hexdigest()
    payload = {
        "continuationState": serialize_continuation_state(continuation_state),
        "trialCanonical": canonical_trial,
        "trialHash": trial_digest,
    }
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    payload_digest = hashlib.sha256(canonical_payload.encode()).hexdigest()
    encoded = base64.b64encode(canonical_payload.encode()).decode()
    print(
        f"PREDICTIVE_NT_CHECKPOINT {trial['stageCount']} {payload_digest} {encoded}",
        file=sys.stderr,
        flush=True,
    )
    acknowledgement = sys.stdin.readline().strip()
    if acknowledgement != f"PREDICTIVE_NT_ACK {trial['stageCount']} {payload_digest}":
        raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")


def main():
    request_line = sys.stdin.readline()
    request = json.loads(request_line)
    checkpoint_protocol = request.pop("_checkpointProtocol", None)
    resume = request.pop("_resume", None)
    manifest = verify_frozen_model()
    if request.get("modelHash") != MODEL_HASH:
        raise ValueError("MODEL_HASH_MISMATCH")
    engine_hash = runtime_engine_hash()
    if request.get("engineHash") != engine_hash:
        raise ValueError("PREDICTIVE_NT_ENGINE_HASH_MISMATCH")
    temperature_k = float(request["temperatureK"])
    solvent_ratio = float(request["solventMolarRatio"])
    target = float(request["targetRaffinateMonoHydrocarbonMoleFraction"])
    minimum_sat = float(request.get("minimumRaffinateSaturatesHydrocarbonMoleFraction", 0.0))
    source_targets = request["sourceProductTargetsMassFraction"]
    targets = {
        "maximumTotalAromatics": float(source_targets["maximumTotalAromatics"]),
        "maximumPolarAromatics": float(source_targets["maximumPolarAromatics"]),
        "minimumSaturates": float(source_targets["minimumSaturates"]),
        "maximumNmp": float(source_targets["maximumNmp"]),
        "minimumRrboRecovery": float(source_targets["minimumRrboRecovery"]),
    }
    max_stages = int(request.get("maximumStages", 10))
    if not (temperature_k > 0 and solvent_ratio > 0 and 0 < target < 1 and
            0 <= minimum_sat <= 1 and 1 <= max_stages <= 20):
        raise ValueError("INVALID_CASCADE_INPUT")
    feed = normalize(request["feedMoleFractions"])
    if feed[4] > 1e-12:
        raise ValueError("FEED_NMP_NOT_SUPPORTED")
    if float(request["sourceFeedCompositionMassFraction"]["polar"]) > 1e-12:
        raise ValueError("POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE")

    row, previous = setup_model(request["satIdentity"], request["monoIdentity"], temperature_k)
    row["active"] = [
        *[index for index in range(4) if float(feed[index]) > EPS],
        4,
    ]
    mono_mw = next(
        item["molecularWeightGmol"]
        for item in request.get("molecularBasis", {}).get("components", [])
        if item.get("family") == "MONO"
    ) if request.get("molecularBasis") else None
    if mono_mw is None:
        registry = json.loads((NEW / "descriptor-registry.json").read_text())
        mono_weights = {
            "n-propylbenzene": 120.19, "n-pentylbenzene": 148.25,
            "sec-butylbenzene": 134.22, "1,3,5-trimethylbenzene": 120.19,
            "p-xylene": 106.17, "toluene": 92.14,
        }
        mono_mw = mono_weights[request["monoIdentity"]]
    molecular_weights = MOLECULAR_WEIGHTS.copy()
    molecular_weights[1] = mono_mw
    trials = []
    try:
        last_mono = float(feed[1] / feed[:4].sum())
        continuation_state = None
        start_stage = 1
        if resume is not None:
            trials = resume.get("trials")
            acknowledged = resume.get("acknowledgedStageCount")
            if (
                not isinstance(trials, list)
                or not isinstance(acknowledged, int)
                or acknowledged < 1
                or acknowledged > max_stages
                or len(trials) != acknowledged
                or any(trial.get("stageCount") != index + 1 for index, trial in enumerate(trials))
            ):
                raise ValueError("PREDICTIVE_NT_RESUME_PREFIX_INVALID")
            continuation_state = restore_continuation_state(
                resume.get("continuationState"),
                acknowledged,
            )
            last_mono = float(trials[-1]["raffinateMonoHydrocarbonMoleFraction"])
            start_stage = acknowledged + 1
            print(
                f"PREDICTIVE_NT_RESUME {acknowledged} {start_stage}",
                file=sys.stderr,
                flush=True,
            )
        for stage_count in range(start_stage, max_stages + 1):
            trial, continuation_state = run_trial(
                stage_count,
                feed,
                solvent_ratio,
                row,
                molecular_weights,
                targets,
                continuation_state,
            )
            current_mono = trial["raffinateMonoHydrocarbonMoleFraction"]
            trial["monotonicFromPrevious"] = current_mono <= last_mono + 1e-9
            hc_mass = trial["raffinateHydrocarbonMassProfile"]
            mass = trial["raffinateMassProfile"]
            residuals = {
                "totalAromatics": targets["maximumTotalAromatics"] - hc_mass["totalAromatics"],
                "polarAromatics": None,
                "minimumSaturates": hc_mass["SAT"] - targets["minimumSaturates"],
                "maximumNmp": targets["maximumNmp"] - mass["NMP"],
                "minimumRrboRecovery": trial["rrboMassRecovery"] - targets["minimumRrboRecovery"],
            }
            trial["targetResidualsMassFraction"] = residuals
            trial["targetChecks"] = {
                "totalAromatics": residuals["totalAromatics"] >= -1e-9,
                "polarAromatics": None,
                "minimumSaturates": residuals["minimumSaturates"] >= -1e-9,
                "maximumNmp": residuals["maximumNmp"] >= -1e-9,
                "minimumRrboRecovery": residuals["minimumRrboRecovery"] >= -1e-9,
            }
            if feed[2] <= EPS and feed[3] <= EPS:
                trial["targetChecks"]["monoTarget"] = current_mono <= target + 1e-9
            trial["accepted"] = bool(
                trial["balanceAccepted"]
                and all(value for value in trial["targetChecks"].values() if value is not None)
                and all(stage["thermodynamicChecks"]["independentFinalPhaseChecksPass"]
                        for stage in trial["stages"])
            )
            trials.append(trial)
            emit_trial_checkpoint(trial, continuation_state, checkpoint_protocol)
            print(f"PREDICTIVE_NT_PROGRESS {stage_count} {max_stages}", file=sys.stderr, flush=True)
            last_mono = current_mono
        selected = select_minimum_accepted_trial(trials)
        status = "ACCEPTED_PREDICTIVE_NT" if selected else (
            "MASS_BALANCE_FAILED" if any(not trial["balanceAccepted"] for trial in trials)
            else "NON_MONOTONIC_STAGE_SEQUENCE" if trials and not trials[-1]["monotonicFromPrevious"]
            else "TARGET_NOT_REACHED"
        )
        json.dump({
            "status": status,
            "model": {
                "packageId": "PRE_PILOT_MODEL",
                "modelHash": MODEL_HASH,
                "verifiedArtifactCount": len(manifest["artifacts"]),
                "runtimeVerification": "PASS",
            },
            "engine": {
                "engineId": ENGINE_ID,
                "engineVersion": ENGINE_VERSION,
                "engineHash": engine_hash,
            },
            "calibrationRequired": True,
            "pilotValidated": False,
            "releaseEligible": False,
            "predictiveNt": selected["stageCount"] if selected else None,
            "integerDesignStages": selected["stageCount"] if selected else None,
            "establishedTheoreticalStages": None,
            "monotonicSequence": all(trial["monotonicFromPrevious"] for trial in trials),
            "input": request,
            "trials": trials,
        }, sys.stdout, separators=(",", ":"))
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        status = (
            "THERMODYNAMIC_FLASH_FAILED" if "FLASH_" in message
            else "CASCADE_DID_NOT_CONVERGE" if "CASCADE_DID_NOT_CONVERGE" in message
            else "ENGINE_ERROR"
        )
        json.dump({
            "status": status,
            "error": message,
            "predictiveNt": None,
            "establishedTheoreticalStages": None,
            "releaseEligible": False,
            "input": request,
            "trials": trials,
        }, sys.stdout, separators=(",", ":"))
        return 1
    finally:
        restore_model(previous)
    return 0


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        print(json.dumps(verify_runtime(), sort_keys=True))
        sys.exit(0)
    if "--self-test-manifest-binding" in sys.argv:
        rejected = False
        try:
            verify_declared_model_hash({"modelHash": "coherently-rehashed-but-not-declared"})
        except ValueError as exc:
            rejected = str(exc) == "DECLARED_MODEL_HASH_MISMATCH"
        json.dump({
            "status": "PASS" if rejected else "FAIL",
            "changedManifestRejected": rejected,
        }, sys.stdout, separators=(",", ":"))
        sys.exit(0 if rejected else 1)
    if "--self-test-selection" in sys.argv:
        selected = select_minimum_accepted_trial([
            {"stageCount": 1, "accepted": False, "monotonicFromPrevious": True},
            {"stageCount": 2, "accepted": False, "monotonicFromPrevious": False},
            {"stageCount": 3, "accepted": True, "monotonicFromPrevious": True},
        ])
        json.dump({
            "status": "PASS" if selected and selected["stageCount"] == 3 else "FAIL",
            "selectedStageCount": selected["stageCount"] if selected else None,
            "allTrialsEvaluated": True,
        }, sys.stdout, separators=(",", ":"))
        sys.exit(0 if selected and selected["stageCount"] == 3 else 1)
    if "--self-test-active-mapping" in sys.argv:
        row, previous = setup_model("n-hexadecane", "n-pentylbenzene", 323.15)
        registry = json.loads((NEW / "descriptor-registry.json").read_text())
        theta = np.asarray(json.loads(CHECKPOINT.read_text())["parameters"], dtype=np.float64)
        full = runtime_local_parameters(theta, row, registry)
        row["active"] = [0, 1, 4]
        reduced = runtime_local_parameters(theta, row, registry)
        restore_model(previous)
        preserved = bool(np.array_equal(full, reduced))
        json.dump({
            "status": "PASS" if preserved else "FAIL",
            "activeFamilies": [COMPONENTS[index] for index in row["active"]],
            "identityMappingPreserved": preserved,
        }, sys.stdout, separators=(",", ":"))
        sys.exit(0 if preserved else 1)
    try:
        sys.exit(main())
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        status = (
            "THERMODYNAMIC_FLASH_FAILED" if "FLASH_" in message
            else "CASCADE_DID_NOT_CONVERGE" if "CASCADE_DID_NOT_CONVERGE" in message
            else "ENGINE_ERROR"
        )
        json.dump({
            "status": status,
            "error": message,
            "predictiveNt": None,
            "establishedTheoreticalStages": None,
            "releaseEligible": False,
        }, sys.stdout, separators=(",", ":"))
        sys.exit(1)