#!/usr/bin/env python3
"""Governed Stage-4 adapter over the active, unmodified 7C-1.5 closure."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import sys
from pathlib import Path

# The historical base closure is mounted and consumed as a read-only artifact.
sys.dont_write_bytecode = True

ADAPTER_ROOT = Path(
    os.environ.get(
        "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT",
        Path(__file__).resolve().parents[3],
    )
).resolve()
ADAPTER_MANIFEST = (
    ADAPTER_ROOT / "stage4-seven-component-adapter-manifest.json"
)
PROTOCOL = "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1"
ADAPTER_VERSION = "1.0.0"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
TRUSTED_BASE_MANIFEST_SHA256 = (
    "f4e6e0156e6dc82dfaa3bf012a67ff143eb8cb45dd7c8208d9f924cec0d023fc"
)
TRUSTED_BASE_AGGREGATE_SHA256 = (
    "4ebbf36fde2c44be3920839ad189f349b93aae6bb905fbed2fa71bf257c3dbed"
)
TRUSTED_BASE_FILE_COUNT = 2346
TRUSTED_ACTIVE_WORKER_SHA256 = (
    "aff19f8c42e846245aefa3ab86ba931a09b7cdbdff76d729c9cd7a18447f5156"
)
TRUSTED_SCIENTIFIC_ENGINE_SHA256 = (
    "0ce9e61f7bdb87a2ccaa1a70edc547343e6cf03585b557855eaeaced1ad0f2d6"
)
if os.environ.get("STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL") != PROTOCOL:
    raise RuntimeError("STAGE4_ADAPTER_LAUNCH_PROTOCOL_MISMATCH")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def contained(root, relative):
    candidate = (root / relative).resolve()
    if root not in candidate.parents:
        raise RuntimeError("STAGE4_RUNTIME_MANIFEST_PATH_INVALID")
    return candidate


def verify_records(root, manifest, mismatch):
    records = []
    for record in manifest["files"]:
        target = contained(root, record["path"])
        content = target.read_bytes()
        if len(content) != record["bytes"] or hashlib.sha256(content).hexdigest() != record["sha256"]:
            raise RuntimeError(mismatch)
        records.append(f'{record["path"]}:{record["bytes"]}:{record["sha256"]}')
    aggregate = hashlib.sha256("\n".join(records).encode()).hexdigest()
    if aggregate != manifest["aggregateSha256"]:
        raise RuntimeError(mismatch)


adapter_manifest = json.loads(ADAPTER_MANIFEST.read_text())
unsigned_adapter = dict(adapter_manifest)
unsigned_adapter.pop("artifactSha256", None)
if (
    adapter_manifest.get("schemaVersion") != "ECR_STAGE4_ADAPTER_RUNTIME_MANIFEST_V1"
    or adapter_manifest.get("protocol") != PROTOCOL
    or adapter_manifest.get("adapterVersion") != ADAPTER_VERSION
    or adapter_manifest.get("componentOrder") != list(COMPONENTS)
    or sha_file(ADAPTER_MANIFEST) == ""
    or hashlib.sha256(canonical(unsigned_adapter).encode()).hexdigest()
    != adapter_manifest.get("artifactSha256")
):
    raise RuntimeError("STAGE4_ADAPTER_MANIFEST_IDENTITY_INVALID")
verify_records(ADAPTER_ROOT, adapter_manifest, "STAGE4_ADAPTER_RUNTIME_FILE_HASH_MISMATCH")

pin = adapter_manifest["baseRuntime"]
if (
    pin.get("manifestSha256") != TRUSTED_BASE_MANIFEST_SHA256
    or pin.get("aggregateSha256") != TRUSTED_BASE_AGGREGATE_SHA256
    or pin.get("fileCount") != TRUSTED_BASE_FILE_COUNT
    or pin.get("activeWorkerSha256") != TRUSTED_ACTIVE_WORKER_SHA256
    or pin.get("scientificEngineSha256") != TRUSTED_SCIENTIFIC_ENGINE_SHA256
):
    raise RuntimeError("STAGE4_BASE_RUNTIME_TRUST_ANCHOR_MISMATCH")
BASE_ROOT = Path(
    os.environ.get(
        "STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT",
        ADAPTER_ROOT / pin["defaultRelativePath"],
    )
).resolve()
base_manifest_path = contained(BASE_ROOT, pin["manifestPath"])
if sha_file(base_manifest_path) != pin["manifestSha256"]:
    raise RuntimeError("STAGE4_BASE_RUNTIME_MANIFEST_HASH_MISMATCH")
base_manifest = json.loads(base_manifest_path.read_text())
if (
    base_manifest.get("schemaVersion") != "PREDICTIVE_NT_RUNTIME_MANIFEST_V1"
    or base_manifest.get("hashAlgorithm") != "sha256"
    or base_manifest.get("fileCount") != pin["fileCount"]
    or len(base_manifest.get("files", [])) != pin["fileCount"]
    or base_manifest.get("aggregateSha256") != pin["aggregateSha256"]
):
    raise RuntimeError("STAGE4_BASE_RUNTIME_MANIFEST_IDENTITY_INVALID")
verify_records(BASE_ROOT, base_manifest, "STAGE4_BASE_RUNTIME_FILE_HASH_MISMATCH")
base_hashes = {record["path"]: record["sha256"] for record in base_manifest["files"]}
if (
    base_hashes.get(pin["activeWorkerPath"]) != pin["activeWorkerSha256"]
    or base_hashes.get(pin["scientificEnginePath"]) != pin["scientificEngineSha256"]
):
    raise RuntimeError("STAGE4_BASE_RUNTIME_ENGINE_BINDING_MISMATCH")

ACTIVE_WORKER = contained(BASE_ROOT, pin["activeWorkerPath"])


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    if spec is None or spec.loader is None:
        raise RuntimeError("ACTIVE_ENGINE_IMPORT_FAILED")
    spec.loader.exec_module(module)
    return module


active = load(ACTIVE_WORKER, "active_seven_component_1_5_for_stage4_adapter")
scientific = active.parent.scientific
if (
    active.engine_evidence()["engineId"] != adapter_manifest["engineId"]
    or active.engine_evidence()["engineVersion"] != adapter_manifest["engineVersion"]
    or active.engine_evidence()["engineHash"] != adapter_manifest["engineHash"]
    or Path(scientific.__file__).resolve()
    != contained(BASE_ROOT, pin["scientificEnginePath"])
):
    raise RuntimeError("STAGE4_BASE_RUNTIME_ENGINE_IDENTITY_MISMATCH")


def hash_number(value):
    mantissa, exponent = format(float(value), ".16e").lower().split("e")
    return f"{mantissa}e{int(exponent)}"


def hash_value(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError("NON_FINITE_VALUE_CANNOT_BE_HASHED")
        return {"$number": hash_number(value)}
    if isinstance(value, list):
        return [hash_value(item) for item in value]
    if isinstance(value, dict):
        return {key: hash_value(item) for key, item in value.items()}
    raise ValueError("UNHASHABLE_ADAPTER_VALUE")


def digest(value):
    return hashlib.sha256(canonical(hash_value(value)).encode()).hexdigest()


def identity():
    evidence = active.engine_evidence()
    return {
        "protocol": PROTOCOL,
        "adapterVersion": ADAPTER_VERSION,
        "engineId": evidence["engineId"],
        "engineVersion": evidence["engineVersion"],
        "engineHash": evidence["engineHash"],
        "componentOrder": list(COMPONENTS),
        "activeWorkerSha256": sha_file(ACTIVE_WORKER),
        "scientificEnginePath":
            Path(scientific.__file__).resolve().relative_to(BASE_ROOT).as_posix(),
        "scientificEngineSha256": sha_file(scientific.__file__),
        "workerSha256": sha_file(__file__),
    }


def vector(value, code):
    if not isinstance(value, list) or len(value) != 7:
        raise ValueError(code)
    result = []
    for item in value:
        if isinstance(item, bool):
            raise ValueError(code)
        number = float(item)
        if not math.isfinite(number) or number < 0:
            raise ValueError(code)
        result.append(number)
    if not sum(result) > 0:
        raise ValueError(code)
    return result


def component_order(request):
    if request.get("componentOrder") != list(COMPONENTS):
        raise ValueError("COMPONENT_ORDER_MISMATCH")


def mono_audit(search):
    return (
        isinstance(search, dict)
        and search.get("explicitMonoRichBasinSearch", {})
        .get("allRequiredSearchesAccepted") is True
    )


def local_equilibrium(request):
    component_order(request)
    is_composition = "componentMolarInventory" not in request
    total = vector(
        request.get("componentMolarInventory", request.get("composition")),
        "INVALID_SEVEN_COMPONENT_MOLAR_INVENTORY",
    )
    if is_composition and abs(sum(total) - 1.0) > 1e-10:
        raise ValueError("SEVEN_COMPONENT_COMPOSITION_NOT_NORMALIZED")
    temperature = float(request.get("temperatureK", math.nan))
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("INVALID_TEMPERATURE_K")
    temporary, engine, integrity, runtime = scientific.build_engine(temperature, 0.0)
    np, gates = engine.np, engine.gates
    try:
        flash = engine.flash(total, temperature)
        r, e, beta = flash["raffinate"], flash["extract"], flash["beta"]
        z = np.asarray(total) / sum(total)
        separation = float(np.max(np.abs(r - e)))
        gibbs = engine.phase_g(z, temperature) - (
            (1 - beta) * engine.phase_g(r, temperature)
            + beta * engine.phase_g(e, temperature)
        )
        local = {
            "raffinate": engine.local_stability(r, temperature),
            "extract": engine.local_stability(e, temperature),
        }
        post = {
            phase: engine.routine_tpd(
                composition, temperature, refine_best_global_and_local=True
            )
            for phase, composition in (("raffinate", r), ("extract", e))
        }
        numerical = (
            flash["optimizerSuccess"]
            and math.isfinite(beta) and 0 < beta < 1
            and flash["isoactivityLogResidual"]
            <= gates["maximumIsoactivityLogResidual"]
            and flash["materialBalanceResidual"]
            <= gates["maximumOverallComponentBalanceResidualMol"]
        )
        physical = (
            separation >= gates["minimumPhaseCompositionSeparation"]
            and gibbs >= gates["minimumStageGibbsReduction"]
            and e[5] > r[5]
            and flash["tpd"]["minimum"] < gates["negativeTpdThreshold"]
            and flash["tpd"]["allRefinementsAccepted"]
            and mono_audit(flash["tpd"])
        )
        stable = all(
            local[phase]["minimumEigenvalue"]
            >= gates["minimumLocalStabilityCurvature"]
            and local[phase]["stepSizeConverged"]
            and post[phase]["minimum"] >= gates["postSplitTpdThreshold"]
            and post[phase]["allRefinementsAccepted"]
            and mono_audit(post[phase])
            for phase in ("raffinate", "extract")
        )
        status = (
            "CALCULATED" if numerical and physical and stable
            else "FAILURE_NUMERICAL_GATES" if not numerical
            else "BLOCKED_NO_PHYSICAL_LLE" if not physical
            else "BLOCKED_STABILITY_GATES"
        )
        body = {
            "status": status,
            "operation": "LOCAL_EQUILIBRIUM",
            "temperatureK": temperature,
            "componentOrder": list(COMPONENTS),
            "normalizedOverallComposition": z.tolist(),
            "raffinateComposition": r.tolist(),
            "extractComposition": e.tolist(),
            "raffinateComponentMoles": ((1 - beta) * sum(total) * r).tolist(),
            "extractComponentMoles": (beta * sum(total) * e).tolist(),
            "betaExtract": beta,
            "phaseOrientation": "NMP_RICH_EXTRACT" if e[5] > r[5] else "INVALID",
            "gates": {
                "optimizerConverged": flash["optimizerSuccess"],
                "isoactivityLogResidual": flash["isoactivityLogResidual"],
                "materialBalanceResidual": flash["materialBalanceResidual"],
                "maximumCompositionSeparation": separation,
                "gibbsReduction": gibbs,
                "feedTpd": flash["tpd"],
                "localStability": local,
                "postSplitTpd": post,
            },
            "scientificIntegrity": integrity,
            "scientificRuntime": runtime,
        }
        return body
    finally:
        temporary.cleanup()


def reference_duty(request):
    component_order(request)
    allowed = {
        "protocol", "operation", "temperatureK", "componentOrder",
        "continuousFeedComponentMoles", "dispersedFeedComponentMoles",
    }
    if any(key not in allowed for key in request):
        raise ValueError("UNSUPPORTED_REFERENCE_DUTY_FIELD")
    feed = vector(request.get("continuousFeedComponentMoles"),
                  "INVALID_CONTINUOUS_FEED")
    solvent = vector(request.get("dispersedFeedComponentMoles"),
                     "INVALID_DISPERSED_FEED")
    temperature = float(request.get("temperatureK", math.nan))
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("INVALID_TEMPERATURE_K")
    temporary, engine, integrity, runtime = scientific.build_engine(temperature, 0.0)
    try:
        raw = engine.solve_cascade(7, temperature, feed, solvent, None)
        if not raw.get("accepted"):
            return {
                "status": "BLOCKED_REFERENCE_DUTY_GATES",
                "operation": "REFERENCE_DUTY",
                "provenance": "PRE_PILOT_DESIGN_DEFAULT",
                "theoreticalStages": 7,
                "gateEvidence": raw,
            }
        duty_body = {
            "schemaVersion": "ECR_STAGE4_REFERENCE_DUTY_V1",
            "componentOrder": list(COMPONENTS),
            "theoreticalStages": 7,
            "temperatureK": temperature,
            "continuousFeedComponentMoles": feed,
            "dispersedFeedComponentMoles": solvent,
            "continuousProductComponentMoles": raw["raffinateComponentMoles"][-1],
            "dispersedProductComponentMoles": raw["extractComponentMoles"][0],
            "cascade": raw,
            "scientificIntegrity": integrity,
            "scientificRuntime": runtime,
        }
        duty = {"id": digest(duty_body), **duty_body}
        return {
            "status": "CALCULATED",
            "operation": "REFERENCE_DUTY",
            "provenance": "PRE_PILOT_DESIGN_DEFAULT",
            "theoreticalStages": 7,
            "stage2ResultHash": None,
            "duty": duty,
        }
    finally:
        temporary.cleanup()


def execute(request):
    if request.get("protocol") != PROTOCOL:
        raise ValueError("ADAPTER_PROTOCOL_MISMATCH")
    if request.get("operation") == "PREFLIGHT":
        return {
            "status": "PASS",
            "operation": "PREFLIGHT",
            "launchEnvironmentKeys": sorted(os.environ),
            **identity(),
        }
    if request.get("operation") == "LOCAL_EQUILIBRIUM":
        return local_equilibrium(request)
    if request.get("operation") == "REFERENCE_DUTY":
        return reference_duty(request)
    raise ValueError("UNSUPPORTED_ADAPTER_OPERATION")


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            body = execute(json.loads(line))
            response = {**identity(), **body}
        except (ValueError, RuntimeError, KeyError, TypeError) as error:
            response = {
                **identity(), "status": "FAILURE_INVALID_REQUEST",
                "error": str(error),
            }
        response["resultHash"] = digest(response)
        print(canonical(response), flush=True)


if __name__ == "__main__":
    main()