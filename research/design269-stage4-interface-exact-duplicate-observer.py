#!/usr/bin/env python3.12
"""Measure exact repeated `wet_lngamma` inputs in one governed interface solve.

This is an observation-only replay of the request captured by the read-only
design-269 harness. It changes no production source, does not cache a result,
does not touch the database, and retains the exact request/counter state if
SIGTERM arrives at the external 180-second cap.

Run only in one managed background shell:
  timeout --preserve-status 180s python3.12 research/design269-stage4-interface-exact-duplicate-observer.py
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "research/design269-stage4-interface-profile.json"
OUT = ROOT / "research/design269-stage4-interface-exact-duplicate-observer.json"
CAP_MS = 180_000


class ProfileCutoff(Exception):
    """Raised from SIGTERM so Python reaches the durable partial-output path."""


def terminate(_signum, _frame):
    raise ProfileCutoff("MANAGED_PROFILE_SIGTERM_CUTOFF")


def write_output(value: dict) -> None:
    OUT.write_text(json.dumps(value, indent=2) + "\n")


def configure_runtime() -> Path:
    dogbox_root = ROOT / "dist/stage4-job-b-dogbox-runtime"
    os.environ.update({
        "STAGE4_JOB_B_DOGBOX_RUNTIME_ROOT": str(dogbox_root),
        "STAGE4_JOB_B_LEGACY_RUNTIME_ROOT": str(ROOT / "dist/job-b-interface-runtime"),
        "STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL": "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1",
        "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT": str(ROOT / "dist/stage4-seven-component-adapter-runtime"),
        "STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT": str(ROOT / "dist/predictive-nt-runtime-7c-1-5"),
        "JOB_B_INTERFACE_PROTOCOL": "ECR_JOB_B_INTERFACE_V1",
        "PYTHONDONTWRITEBYTECODE": "1",
    })
    return dogbox_root / "server/ecr-pre-pilot/job-b-interface-stage4-dogbox/worker.py"


def main() -> None:
    signal.signal(signal.SIGTERM, terminate)
    started = time.monotonic()
    baseline = json.loads(BASELINE.read_text())
    request = baseline.get("requestAssembly", {}).get("exactFirstRequest")
    request_hash = baseline.get("requestAssembly", {}).get("firstRequestHash")
    expected_result_hash = baseline.get("worker", {}).get("responseResultHash")
    if (baseline.get("status") != "WORKER_COMPLETED" or not isinstance(request, dict)
            or not isinstance(request_hash, str) or not isinstance(expected_result_hash, str)):
        raise RuntimeError("DUPLICATE_OBSERVER_REQUIRES_COMPLETED_EXACT_BASELINE")
    initial = {
        "schema": "DESIGN269_STAGE4_EXACT_WET_LNGAMMA_DUPLICATE_OBSERVER_V1",
        "scope": {
            "capMs": CAP_MS,
            "databaseAccess": "NONE_REPLAY_OF_OWNER_SCOPED_CAPTURE",
            "noProductionCalculationPersistence": True,
            "noFullColumnExecution": True,
            "workerRequestsPlanned": 1,
            "observationOnlyNoCachedReturnValues": True,
        },
        "exactRequest": request,
        "requestHash": request_hash,
        "baselineResponseResultHash": expected_result_hash,
        "status": "OBSERVER_INITIALIZED_WORKER_NOT_STARTED",
        "timing": {"checkpointTimestamp": time.time(), "elapsedMs": 0},
    }
    write_output(initial)
    worker_path = configure_runtime()
    spec = importlib.util.spec_from_file_location("design269_duplicate_observer", worker_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("DUPLICATE_OBSERVER_DOGBOX_IMPORT_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    counters: dict[str, dict[str, object]] = {}
    original_build = module.legacy.scientific.build_engine

    def observed_build(*args, **kwargs):
        temporary, engine, integrity, runtime = original_build(*args, **kwargs)
        original_wet_lngamma = engine.model.wet_lngamma
        original_least_squares = engine.scipy.optimize.least_squares
        scope = {"name": "GATE_OR_OTHER", "leastSquaresCall": 0}

        def observe(np_module, temperature_k, composition):
            array = np_module.ascontiguousarray(np_module.asarray(composition, dtype=float))
            # The identity includes the exact IEEE representation, shape and
            # temperature. No decimal conversion, tolerance, or rounded key is
            # used; values are still computed by the original function.
            key = (float(temperature_k).hex(), array.dtype.str, array.shape, array.tobytes())
            bucket = counters.setdefault(scope["name"], {"calls": 0, "keys": set()})
            bucket["calls"] = int(bucket["calls"]) + 1
            bucket["keys"].add(key)
            return original_wet_lngamma(np_module, temperature_k, composition)

        def observed_least_squares(*solve_args, **solve_kwargs):
            scope["leastSquaresCall"] += 1
            prior = scope["name"]
            scope["name"] = f"LEAST_SQUARES_{scope['leastSquaresCall']}"
            try:
                return original_least_squares(*solve_args, **solve_kwargs)
            finally:
                scope["name"] = prior

        engine.model.wet_lngamma = observe
        engine.scipy.optimize.least_squares = observed_least_squares
        return temporary, engine, integrity, runtime

    module.legacy.scientific.build_engine = observed_build
    envelope = {"protocol": "ECR_JOB_B_INTERFACE_V1", "operation": "SOLVE_INTERFACE", **request}

    def summary():
        return {
            scope: {
                "calls": int(bucket["calls"]),
                "distinctExactInputs": len(bucket["keys"]),
                "repeatCalls": int(bucket["calls"]) - len(bucket["keys"]),
            }
            for scope, bucket in counters.items()
        }

    try:
        operation_started = time.monotonic()
        response = {**module.identity(), **module.legacy.execute(envelope)}
        response["resultHash"] = module.legacy.digest(response)
        observed = summary()
        result_hash = response.get("resultHash")
        write_output({
            **initial,
            "status": "OBSERVER_COMPLETED_EXACT_QUALIFICATION"
            if result_hash == expected_result_hash else "OBSERVER_RESULT_HASH_MISMATCH",
            "timing": {
                "checkpointTimestamp": time.time(),
                "elapsedMs": round((time.monotonic() - started) * 1000),
                "operationElapsedMs": round((time.monotonic() - operation_started) * 1000),
            },
            "qualification": {
                "requestHashMatchesCapturedBaseline": request_hash
                == "b595ab74f3c6c14e288fa22258fe2d9a55714735c5d8114010536f702a3b83cc",
                "responseStatus": response.get("status"),
                "responseResultHash": result_hash,
                "responseResultHashMatchesUnprofiledBaseline": result_hash == expected_result_hash,
            },
            "exactInputDuplicateCountsByScope": observed,
        })
        if result_hash != expected_result_hash:
            raise RuntimeError("DUPLICATE_OBSERVER_EXACT_QUALIFICATION_RESULT_HASH_MISMATCH")
    except BaseException as error:
        write_output({
            **initial,
            "status": "OBSERVER_PARTIAL_SIGTERM_RETAINED"
            if isinstance(error, ProfileCutoff) else "OBSERVER_ERROR_RETAINED",
            "timing": {
                "checkpointTimestamp": time.time(),
                "elapsedMs": round((time.monotonic() - started) * 1000),
            },
            "exactInputDuplicateCountsByScope": summary(),
            "error": str(error),
        })
        raise


if __name__ == "__main__":
    main()