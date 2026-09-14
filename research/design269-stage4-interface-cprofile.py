#!/usr/bin/env python3.12
"""Profile one exact, production-assembled design-269 Stage-4 interface root.

The input is the request checkpoint written by
design269-stage4-interface-profile.ts after owner-scoped read-only authority
loading and production TypeScript request assembly. This script does not open
the database, run a column, or modify any production result. It executes the
same pinned dogbox wrapper's one-request protocol path under cProfile and
requires the returned result hash to equal the prior non-profiled baseline.

Run only via a managed, bounded background shell:
  timeout --preserve-status 180s python3.12 research/design269-stage4-interface-cprofile.py
"""
from __future__ import annotations

import cProfile
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import pstats
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "research/design269-stage4-interface-profile.json"
OUT = ROOT / "research/design269-stage4-interface-cprofile.json"
PSTATS = ROOT / "research/design269-stage4-interface-cprofile.pstats"
REPORT = ROOT / "research/design269-stage4-interface-cprofile.txt"
CAP_MS = 180_000


def write_output(value: dict) -> None:
    OUT.write_text(json.dumps(value, indent=2) + "\n")


def main() -> None:
    started = time.monotonic()
    baseline = json.loads(BASELINE.read_text())
    request_assembly = baseline.get("requestAssembly", {})
    worker = baseline.get("worker", {})
    request = request_assembly.get("exactFirstRequest")
    request_hash = request_assembly.get("firstRequestHash")
    baseline_hash = worker.get("responseResultHash")
    if (baseline.get("status") != "WORKER_COMPLETED" or not isinstance(request, dict)
            or not isinstance(request_hash, str) or not isinstance(baseline_hash, str)):
        raise RuntimeError("CPROFILE_REQUIRES_COMPLETED_EXACT_BASELINE_REQUEST_AND_RESULT_HASH")

    dogbox_root = ROOT / "dist/stage4-job-b-dogbox-runtime"
    legacy_root = ROOT / "dist/job-b-interface-runtime"
    adapter_root = ROOT / "dist/stage4-seven-component-adapter-runtime"
    base_root = ROOT / "dist/predictive-nt-runtime-7c-1-5"
    os.environ.update({
        "STAGE4_JOB_B_DOGBOX_RUNTIME_ROOT": str(dogbox_root),
        "STAGE4_JOB_B_LEGACY_RUNTIME_ROOT": str(legacy_root),
        "STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL": "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1",
        "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT": str(adapter_root),
        "STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT": str(base_root),
        "JOB_B_INTERFACE_PROTOCOL": "ECR_JOB_B_INTERFACE_V1",
        "PYTHONDONTWRITEBYTECODE": "1",
    })
    initial = {
        "schema": "DESIGN269_STAGE4_FIRST_INTERFACE_CPROFILE_V1",
        "scope": {
            "capMs": CAP_MS,
            "databaseAccess": "NONE_REPLAY_OF_OWNER_SCOPED_CAPTURE",
            "noProductionCalculationPersistence": True,
            "noFullColumnExecution": True,
            "workerRequestsPlanned": 1,
        },
        "exactRequest": request,
        "requestHash": request_hash,
        "baselineResponseResultHash": baseline_hash,
        "status": "PROFILE_INITIALIZED_WORKER_NOT_STARTED",
        "timing": {
            "checkpointTimestamp": time.time(),
            "elapsedMs": round((time.monotonic() - started) * 1000),
        },
    }
    write_output(initial)

    worker_path = dogbox_root / "server/ecr-pre-pilot/job-b-interface-stage4-dogbox/worker.py"
    spec = importlib.util.spec_from_file_location("design269_stage4_dogbox_profile", worker_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("CPROFILE_DOGBOX_IMPORT_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    envelope = {
        "protocol": "ECR_JOB_B_INTERFACE_V1",
        "operation": "SOLVE_INTERFACE",
        **request,
    }

    def execute_once():
        response = {**module.identity(), **module.legacy.execute(envelope)}
        response["resultHash"] = module.legacy.digest(response)
        return response

    profile_started = time.monotonic()
    profiler = cProfile.Profile()
    try:
        response = profiler.runcall(execute_once)
    finally:
        profiler.dump_stats(str(PSTATS))
        stream = io.StringIO()
        pstats.Stats(profiler, stream=stream).strip_dirs().sort_stats("cumulative").print_stats(100)
        REPORT.write_text(stream.getvalue())
    elapsed_ms = round((time.monotonic() - started) * 1000)
    operation_elapsed_ms = round((time.monotonic() - profile_started) * 1000)
    exact_result_hash = response.get("resultHash")
    qualification = {
        "requestHashMatchesCapturedBaseline": request_hash
            == "b595ab74f3c6c14e288fa22258fe2d9a55714735c5d8114010536f702a3b83cc",
        "responseStatus": response.get("status"),
        "responseResultHash": exact_result_hash,
        "responseResultHashMatchesUnprofiledBaseline": exact_result_hash == baseline_hash,
        "pstatsSha256": hashlib.sha256(PSTATS.read_bytes()).hexdigest(),
        "reportSha256": hashlib.sha256(REPORT.read_bytes()).hexdigest(),
    }
    write_output({
        **initial,
        "status": "PROFILE_COMPLETED_EXACT_QUALIFICATION"
        if qualification["responseResultHashMatchesUnprofiledBaseline"]
        else "PROFILE_COMPLETED_RESULT_HASH_MISMATCH",
        "timing": {
            "checkpointTimestamp": time.time(),
            "elapsedMs": elapsed_ms,
            "operation": "SOLVE_INTERFACE_CPROFILE",
            "operationElapsedMs": operation_elapsed_ms,
        },
        "qualification": qualification,
        "artifacts": {
            "pstats": str(PSTATS.relative_to(ROOT)),
            "cumulativeReport": str(REPORT.relative_to(ROOT)),
        },
    })
    if elapsed_ms > CAP_MS:
        raise RuntimeError("CPROFILE_CAP_EXCEEDED_RESULT_RETAINED")
    if not qualification["responseResultHashMatchesUnprofiledBaseline"]:
        raise RuntimeError("CPROFILE_EXACT_QUALIFICATION_RESULT_HASH_MISMATCH")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # The initial file has already retained the exact request before any
        # expensive import/solve. Do not overwrite it with a synthetic result.
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        raise