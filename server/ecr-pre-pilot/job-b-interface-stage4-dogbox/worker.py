#!/usr/bin/env python3
"""Stage-4-only numerical strategy wrapper around the immutable Job-B worker.

The sole intentional numerical change is least_squares(method="dogbox",
x_scale="jac") for SOLVE_INTERFACE.  The legacy worker retains ownership of
request validation, residual construction, bounds, starts, rank/reproduction,
orientation, flux, curvature and TPD gates.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

PROTOCOL = "ECR_JOB_B_INTERFACE_V1"
STRATEGY_ID = "STAGE4_DOGBOX_JAC_SCALED_V1"
LEGACY_WORKER_SHA256 = "70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d"
LEGACY_MANIFEST_SHA256 = "daa9e16e366b57bbd0c8ad71581cfde705127d9cd3594939c7a7f67d296662da"
ROOT = Path(os.environ["STAGE4_JOB_B_DOGBOX_RUNTIME_ROOT"]).resolve()
LEGACY_ROOT = Path(os.environ["STAGE4_JOB_B_LEGACY_RUNTIME_ROOT"]).resolve()


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_legacy():
    source = LEGACY_ROOT / "server/ecr-pre-pilot/job-b-interface/worker.py"
    if sha_file(source) != LEGACY_WORKER_SHA256:
        raise RuntimeError("STAGE4_DOGBOX_LEGACY_WORKER_HASH_MISMATCH")
    os.environ["JOB_B_INTERFACE_RUNTIME_ROOT"] = str(LEGACY_ROOT)
    spec = importlib.util.spec_from_file_location("immutable_job_b_interface", source)
    if spec is None or spec.loader is None:
        raise RuntimeError("STAGE4_DOGBOX_LEGACY_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


legacy = load_legacy()
_build_engine = legacy.scientific.build_engine
_original_least_squares = None
_exact_wet_lngamma_cache_runs = []
_MAX_EXACT_WET_LNGAMMA_CACHE_ENTRIES = 4096


def _install_exact_wet_lngamma_cache(engine):
    """Reuse only byte-identical thermodynamic calls inside one LS invocation.

    The cache is deliberately scoped to an individual numerical least-squares
    call. Final residual evaluation, rank/reproduction, endpoint stability and
    TPD admission calls execute after that scope has closed and therefore
    always call the pinned model afresh. Keys retain the complete IEEE input
    bytes, dtype, shape and hexadecimal temperature; no tolerance or rounded
    composition is accepted. Cached arrays are copied both on storage and
    return so a caller cannot mutate a later thermodynamic result.
    """
    original_wet_lngamma = engine.model.wet_lngamma
    original_least_squares = engine.scipy.optimize.least_squares
    cache = {}
    active = False
    diagnostics = {
        "calls": 0,
        "hits": 0,
        "misses": 0,
        "evictions": 0,
        "maximumEntries": _MAX_EXACT_WET_LNGAMMA_CACHE_ENTRIES,
    }

    def exact_key(np_module, temperature_k, composition):
        array = np_module.ascontiguousarray(np_module.asarray(composition))
        return (float(temperature_k).hex(), array.dtype.str, array.shape,
                array.tobytes())

    def cached_wet_lngamma(np_module, temperature_k, composition):
        if not active:
            return original_wet_lngamma(np_module, temperature_k, composition)
        diagnostics["calls"] += 1
        key = exact_key(np_module, temperature_k, composition)
        cached = cache.get(key)
        if cached is not None:
            diagnostics["hits"] += 1
            return cached.copy()
        diagnostics["misses"] += 1
        result = original_wet_lngamma(np_module, temperature_k, composition)
        # Clear, rather than retaining an approximate/LRU subset, at the
        # explicit fixed bound. This makes all served entries exact and keeps
        # memory bounded without a replacement policy affecting numerics.
        if len(cache) >= _MAX_EXACT_WET_LNGAMMA_CACHE_ENTRIES:
            cache.clear()
            diagnostics["evictions"] += 1
        cache[key] = result.copy()
        return result

    def scoped_least_squares(*solve_args, **solve_kwargs):
        nonlocal active
        cache.clear()
        active = True
        try:
            return original_least_squares(*solve_args, **solve_kwargs)
        finally:
            active = False
            cache.clear()

    engine.model.wet_lngamma = cached_wet_lngamma
    engine.scipy.optimize.least_squares = scoped_least_squares
    return diagnostics


def patched_build_engine(*args, **kwargs):
    global _original_least_squares
    temporary, engine, integrity, runtime = _build_engine(*args, **kwargs)
    # scipy.optimize is process-global. Capture the original exactly once:
    # wrapping the presently installed callable would otherwise form a chain
    # on every persistent-session request.
    if _original_least_squares is None:
        _original_least_squares = engine.scipy.optimize.least_squares

    def dogbox_least_squares(*solve_args, **solve_kwargs):
        # The strategy is fixed in source; no request or environment field can
        # select an arbitrary method or alter residuals/bounds/gates.
        solve_kwargs["method"] = "dogbox"
        solve_kwargs["x_scale"] = "jac"
        return _original_least_squares(*solve_args, **solve_kwargs)

    engine.scipy.optimize.least_squares = dogbox_least_squares
    diagnostics = _install_exact_wet_lngamma_cache(engine)
    # This diagnostic stays process-local and is intentionally excluded from
    # protocol responses/result hashes. It is for the isolated timing harness,
    # never a scientific result or gate input.
    _exact_wet_lngamma_cache_runs.append(diagnostics)
    if len(_exact_wet_lngamma_cache_runs) > 64:
        del _exact_wet_lngamma_cache_runs[:-64]
    return temporary, engine, integrity, runtime


legacy.scientific.build_engine = patched_build_engine


def identity():
    value = legacy.identity()
    value.update({
        "jobBInterfaceArtifactSha256": manifest["artifactSha256"],
        "workerSha256": sha_file(__file__),
        "numericalStrategy": {
            "id": STRATEGY_ID,
            "leastSquaresMethod": "dogbox",
            "xScale": "jac",
            "legacyWorkerSha256": LEGACY_WORKER_SHA256,
            "wrapperWorkerSha256": sha_file(__file__),
        },
    })
    return value


manifest = json.loads((ROOT / "stage4-job-b-dogbox-manifest.json").read_text())
def canonical(value):
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key) + ":" + canonical(value[key]) for key in sorted(value)
        ) + "}"
    return json.dumps(value, separators=(",", ":"))

record = manifest.get("files", [{}])[0]
unsigned_manifest = dict(manifest)
unsigned_manifest.pop("artifactSha256", None)
legacy_manifest_path = LEGACY_ROOT / "job-b-interface-manifest.json"
if (
    manifest.get("schemaVersion") != "ECR_STAGE4_JOB_B_DOGBOX_RUNTIME_MANIFEST_V1"
    or manifest.get("protocol") != PROTOCOL
    or manifest.get("numericalStrategy", {}).get("id") != STRATEGY_ID
    or manifest.get("legacyWorkerSha256") != LEGACY_WORKER_SHA256
    or manifest.get("legacyRuntime", {}).get("manifestSha256") != LEGACY_MANIFEST_SHA256
    or manifest.get("legacyRuntime", {}).get("artifactSha256") != legacy.manifest["artifactSha256"]
    or sha_file(legacy_manifest_path) != LEGACY_MANIFEST_SHA256
    or manifest.get("fileCount") != 1 or len(manifest.get("files", [])) != 1
    or record.get("path") != "server/ecr-pre-pilot/job-b-interface-stage4-dogbox/worker.py"
    or record.get("bytes") != Path(__file__).stat().st_size
    or record.get("sha256") != sha_file(__file__)
    or manifest.get("aggregateSha256") != hashlib.sha256(
        f'{record["path"]}:{record["bytes"]}:{record["sha256"]}'.encode()).hexdigest()
    or manifest.get("artifactSha256") != hashlib.sha256(canonical(unsigned_manifest).encode()).hexdigest()
):
    raise RuntimeError("STAGE4_DOGBOX_MANIFEST_IDENTITY_INVALID")


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            if request.get("protocol") != PROTOCOL:
                raise ValueError("JOB_B_INTERFACE_PROTOCOL_MISMATCH")
            response = {**identity(), **legacy.execute(request)}
        except (ValueError, RuntimeError, KeyError, TypeError) as error:
            response = {**identity(), "status": "FAILURE_INVALID_REQUEST", "error": str(error)}
        response["resultHash"] = legacy.digest(response)
        print(legacy.canonical(response), flush=True)


if __name__ == "__main__":
    main()