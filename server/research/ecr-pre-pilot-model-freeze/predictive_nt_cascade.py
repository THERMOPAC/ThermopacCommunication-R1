#!/usr/bin/env python3
"""Background SAT/MONO/NMP counter-current cascade using the frozen flash."""
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
MODEL_HASH = "cb8b2945499ea65cd071f99695ea14c5a3396fba475aa6bb8ed8bdfe6f3198c7"
ENGINE_ID = "ECR2_PREDICTIVE_NT_BACKGROUND"
ENGINE_VERSION = "1.1.0"
COMPONENTS = ["SAT", "MONO", "NMP"]
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
    for identity in (sat_identity, mono_identity, "N-methyl-2-pyrrolidone"):
        if identity not in registry["molecules"] or identity not in table:
            raise ValueError(f"MOLECULAR_IDENTITY_UNAVAILABLE: {identity}")
    row = dt.uq.row(
        "predictive-nt-runtime",
        "PRE_PILOT_MODEL",
        temperature_k,
        [0.7, 0.3, 0.0, 0.0, 0.0],
        [0.05, 0.15, 0.0, 0.0, 0.8],
        [0, 1, 4],
        False,
        [sat_identity, mono_identity, "N-methyl-2-pyrrolidone"],
        table,
        None,
    )
    old_pm, old_gamma, old_stand = dt.uq.PM, dt.uq.gamma, dt.uq.stand_gamma
    dt.uq.PM = dt.BASE_PM
    dt.uq.gamma = lambda value, active_row, ignored: old_gamma(
        value, active_row, dt.local_parameters(theta, active_row, registry)
    )
    dt.uq.stand_gamma = lambda value, active_row, ignored, log_name="standaloneFinalGate": old_stand(
        value, active_row, dt.local_parameters(theta, active_row, registry), log_name
    )
    return row, (old_pm, old_gamma, old_stand)


def restore_model(previous):
    dt.uq.PM, dt.uq.gamma, dt.uq.stand_gamma = previous


def normalize(value):
    vector = np.asarray(value, dtype=float)
    total = float(vector.sum())
    if vector.shape != (3,) or not np.all(np.isfinite(vector)) or np.any(vector < 0) or total <= 0:
        raise ValueError("INVALID_FEED_COMPOSITION")
    return vector / total


def to_five(value):
    return np.asarray([value[0], value[1], 0.0, 0.0, value[2]], dtype=float)


def from_five(value):
    return np.asarray([value[0], value[1], value[4]], dtype=float)


def flash(mixture, row):
    result = dt.uq.flash(to_five(mixture), row, np.zeros(1))
    if result["phaseBehavior"] != "PREDICTED_TWO_PHASE" or not result.get("converged"):
        raise RuntimeError(f"FLASH_{result['phaseBehavior']}")
    rrbo = from_five(result["RRBO_rich"])
    nmp = from_five(result["NMP_rich"])
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


def product_metrics(flow, composition, feed):
    hydrocarbons = float(composition[0] + composition[1])
    hydrocarbon_fraction_mono = float(composition[1] / hydrocarbons) if hydrocarbons > EPS else None
    hydrocarbon_fraction_sat = float(composition[0] / hydrocarbons) if hydrocarbons > EPS else None
    feed_hydrocarbons = float(feed[0] + feed[1])
    recovery = float(flow * hydrocarbons / feed_hydrocarbons) if feed_hydrocarbons > EPS else None
    return hydrocarbon_fraction_mono, hydrocarbon_fraction_sat, recovery


def select_minimum_accepted_trial(trials):
    accepted = [trial for trial in trials if trial["accepted"]]
    return min(accepted, key=lambda trial: trial["stageCount"]) if accepted else None


def initialize_component_flows(stage_count, feed, solvent_ratio, continuation_state=None):
    solvent = np.asarray([0.0, 0.0, 1.0])
    liquid = np.zeros((stage_count + 2, 3), dtype=float)
    extract = np.zeros((stage_count + 2, 3), dtype=float)
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
    for component in range(3):
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
    solvent = np.asarray([0.0, 0.0, 1.0])
    local = []
    for stage in range(1, stage_count + 1):
        local.append(
            liquid[stage + 1] + extract[stage - 1]
            - liquid[stage] - extract[stage]
        )
    overall = feed + solvent_ratio * solvent - liquid[1] - extract[stage_count]
    local_maximum = max(float(np.max(np.abs(value))) for value in local)
    return local, overall, local_maximum, float(np.max(np.abs(overall)))


def run_trial(stage_count, feed, solvent_ratio, row, continuation_state=None):
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
    mono, sat, recovery = product_metrics(l_flow[1], x[1], feed)
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


def emit_trial_checkpoint(trial, checkpoint_protocol):
    if checkpoint_protocol != "ACK_V1":
        return
    canonical = json.dumps(trial, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    encoded = base64.b64encode(canonical.encode()).decode()
    print(
        f"PREDICTIVE_NT_CHECKPOINT {trial['stageCount']} {digest} {encoded}",
        file=sys.stderr,
        flush=True,
    )
    acknowledgement = sys.stdin.readline().strip()
    if acknowledgement != f"PREDICTIVE_NT_ACK {trial['stageCount']} {digest}":
        raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")


def main():
    request_line = sys.stdin.readline()
    request = json.loads(request_line)
    checkpoint_protocol = request.pop("_checkpointProtocol", None)
    manifest = verify_frozen_model()
    if request.get("modelHash") != MODEL_HASH:
        raise ValueError("MODEL_HASH_MISMATCH")
    engine_hash = sha256(Path(__file__))
    if request.get("engineHash") != engine_hash:
        raise ValueError("PREDICTIVE_NT_ENGINE_HASH_MISMATCH")
    temperature_k = float(request["temperatureK"])
    solvent_ratio = float(request["solventMolarRatio"])
    target = float(request["targetRaffinateMonoHydrocarbonMoleFraction"])
    minimum_sat = float(request.get("minimumRaffinateSaturatesHydrocarbonMoleFraction", 0.0))
    max_stages = int(request.get("maximumStages", 10))
    if not (temperature_k > 0 and solvent_ratio > 0 and 0 < target < 1 and
            0 <= minimum_sat <= 1 and 1 <= max_stages <= 20):
        raise ValueError("INVALID_CASCADE_INPUT")
    feed = normalize(request["feedMoleFractions"])
    if feed[2] > 1e-12:
        raise ValueError("FEED_NMP_NOT_SUPPORTED")

    row, previous = setup_model(request["satIdentity"], request["monoIdentity"], temperature_k)
    trials = []
    try:
        last_mono = float(feed[1] / (feed[0] + feed[1]))
        continuation_state = None
        for stage_count in range(1, max_stages + 1):
            trial, continuation_state = run_trial(
                stage_count,
                feed,
                solvent_ratio,
                row,
                continuation_state,
            )
            current_mono = trial["raffinateMonoHydrocarbonMoleFraction"]
            trial["monotonicFromPrevious"] = current_mono <= last_mono + 1e-9
            trial["targetChecks"] = {
                "monoTarget": current_mono <= target + 1e-9,
                "minimumSaturates": trial["raffinateSaturatesHydrocarbonMoleFraction"] >= minimum_sat - 1e-9,
            }
            trial["accepted"] = bool(
                trial["balanceAccepted"]
                and all(trial["targetChecks"].values())
                and all(stage["thermodynamicChecks"]["independentFinalPhaseChecksPass"]
                        for stage in trial["stages"])
            )
            trials.append(trial)
            emit_trial_checkpoint(trial, checkpoint_protocol)
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