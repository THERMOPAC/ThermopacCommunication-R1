#!/usr/bin/env python3.12
"""Measure the scoped exact-input Stage-4 dogbox cache against its baseline.

This runs one captured design-269 interface request through the newly packaged
Stage-4 wrapper. The wrapper cache is active only while each dogbox
least-squares call is evaluating; all post-solve residual, rank/reproduction,
endpoint-stability and TPD gates are uncached. Result-hash equality with the
unprofiled baseline is mandatory. A SIGTERM from the managed 180-second cap is
converted to a retained partial artifact rather than a completed claim.

Run only in one managed background shell:
  timeout --preserve-status 180s python3.12 research/design269-stage4-interface-exact-cache-candidate.py
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
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "research/design269-stage4-interface-profile.json"
CPROFILE_BASELINE = ROOT / "research/design269-stage4-interface-cprofile.json"
OUT = ROOT / "research/design269-stage4-interface-exact-cache-candidate.json"
PSTATS = ROOT / "research/design269-stage4-interface-exact-cache-candidate.pstats"
REPORT = ROOT / "research/design269-stage4-interface-exact-cache-candidate.txt"
CAP_MS = 180_000


class CandidateCutoff(Exception):
    pass


def on_term(_signum, _frame):
    raise CandidateCutoff("MANAGED_CANDIDATE_SIGTERM_CUTOFF")


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


def aggregate_cache_runs(runs):
    totals = {"calls": 0, "hits": 0, "misses": 0, "evictions": 0}
    for row in runs:
        for key in totals:
            totals[key] += int(row.get(key, 0))
    totals["hitRatio"] = totals["hits"] / totals["calls"] if totals["calls"] else 0.0
    totals["runCount"] = len(runs)
    return totals


def main() -> None:
    signal.signal(signal.SIGTERM, on_term)
    started = time.monotonic()
    baseline = json.loads(BASELINE.read_text())
    request = baseline.get("requestAssembly", {}).get("exactFirstRequest")
    request_hash = baseline.get("requestAssembly", {}).get("firstRequestHash")
    baseline_hash = baseline.get("worker", {}).get("responseResultHash")
    baseline_elapsed_ms = baseline.get("timing", {}).get("operationElapsedMs")
    cprofile_baseline = json.loads(CPROFILE_BASELINE.read_text())
    cprofile_baseline_elapsed_ms = cprofile_baseline.get("timing", {}).get("operationElapsedMs")
    if (baseline.get("status") != "WORKER_COMPLETED" or not isinstance(request, dict)
            or not isinstance(request_hash, str) or not isinstance(baseline_hash, str)
            or not isinstance(baseline_elapsed_ms, int)
            or cprofile_baseline.get("status") != "PROFILE_COMPLETED_EXACT_QUALIFICATION"
            or cprofile_baseline.get("qualification", {}).get(
                "responseResultHashMatchesUnprofiledBaseline") is not True
            or not isinstance(cprofile_baseline_elapsed_ms, int)):
        raise RuntimeError("CACHE_CANDIDATE_REQUIRES_COMPLETED_EXACT_BASELINE")
    initial = {
        "schema": "DESIGN269_STAGE4_EXACT_CACHE_CANDIDATE_V1",
        "scope": {
            "capMs": CAP_MS,
            "databaseAccess": "NONE_REPLAY_OF_OWNER_SCOPED_CAPTURE",
            "noProductionCalculationPersistence": True,
            "noFullColumnExecution": True,
            "workerRequestsPlanned": 1,
            "cacheScope": "ONE_DOGBOX_LEAST_SQUARES_CALL_ONLY",
            "cacheKey": "temperature IEEE hex + composition dtype + shape + exact bytes",
            "cacheBoundEntries": 4096,
            "postSolveAdmissionGatesUncached": True,
        },
        "exactRequest": request,
        "requestHash": request_hash,
        "baseline": {
            "unprofiledOperationElapsedMs": baseline_elapsed_ms,
            "cprofileOperationElapsedMs": cprofile_baseline_elapsed_ms,
            "responseResultHash": baseline_hash,
        },
        "status": "CANDIDATE_INITIALIZED_WORKER_NOT_STARTED",
        "timing": {"checkpointTimestamp": time.time(), "elapsedMs": 0},
    }
    write_output(initial)
    worker_path = configure_runtime()
    spec = importlib.util.spec_from_file_location("design269_exact_cache_candidate", worker_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("CACHE_CANDIDATE_DOGBOX_IMPORT_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._exact_wet_lngamma_cache_runs.clear()
    envelope = {"protocol": "ECR_JOB_B_INTERFACE_V1", "operation": "SOLVE_INTERFACE", **request}

    def execute_once():
        response = {**module.identity(), **module.legacy.execute(envelope)}
        response["resultHash"] = module.legacy.digest(response)
        return response

    profiler = cProfile.Profile()
    operation_started = time.monotonic()
    try:
        response = profiler.runcall(execute_once)
    except BaseException as error:
        profiler.dump_stats(str(PSTATS))
        write_output({
            **initial,
            "status": "CANDIDATE_PARTIAL_SIGTERM_RETAINED"
            if isinstance(error, CandidateCutoff) else "CANDIDATE_ERROR_RETAINED",
            "timing": {
                "checkpointTimestamp": time.time(),
                "elapsedMs": round((time.monotonic() - started) * 1000),
                "operationElapsedMs": round((time.monotonic() - operation_started) * 1000),
            },
            "cache": aggregate_cache_runs(module._exact_wet_lngamma_cache_runs),
            "artifacts": {"pstats": str(PSTATS.relative_to(ROOT))},
            "error": str(error),
        })
        raise
    finally:
        profiler.dump_stats(str(PSTATS))
        stream = io.StringIO()
        pstats.Stats(profiler, stream=stream).strip_dirs().sort_stats("cumulative").print_stats(100)
        REPORT.write_text(stream.getvalue())

    operation_elapsed_ms = round((time.monotonic() - operation_started) * 1000)
    response_hash = response.get("resultHash")
    cache = aggregate_cache_runs(module._exact_wet_lngamma_cache_runs)
    qualification = {
        "requestHashMatchesCapturedBaseline": request_hash
        == "b595ab74f3c6c14e288fa22258fe2d9a55714735c5d8114010536f702a3b83cc",
        "responseStatus": response.get("status"),
        "responseResultHash": response_hash,
        "responseResultHashMatchesUnprofiledBaseline": response_hash == baseline_hash,
        "workerSourceSha256": hashlib.sha256(worker_path.read_bytes()).hexdigest(),
        "pstatsSha256": hashlib.sha256(PSTATS.read_bytes()).hexdigest(),
        "reportSha256": hashlib.sha256(REPORT.read_bytes()).hexdigest(),
    }
    write_output({
        **initial,
        "status": "CANDIDATE_COMPLETED_EXACT_QUALIFICATION"
        if qualification["responseResultHashMatchesUnprofiledBaseline"]
        else "CANDIDATE_COMPLETED_RESULT_HASH_MISMATCH",
        "timing": {
            "checkpointTimestamp": time.time(),
            "elapsedMs": round((time.monotonic() - started) * 1000),
            "operationElapsedMs": operation_elapsed_ms,
            "comparableCprofileBaselineOperationElapsedMs": cprofile_baseline_elapsed_ms,
            "comparableCprofileSpeedup": cprofile_baseline_elapsed_ms / operation_elapsed_ms,
            "comparableCprofileReductionPct": 100 * (
                cprofile_baseline_elapsed_ms - operation_elapsed_ms
            ) / cprofile_baseline_elapsed_ms,
            "unprofiledBaselineOperationElapsedMsForContextOnly": baseline_elapsed_ms,
        },
        "cache": cache,
        "qualification": qualification,
        "artifacts": {
            "pstats": str(PSTATS.relative_to(ROOT)),
            "cumulativeReport": str(REPORT.relative_to(ROOT)),
        },
    })
    if operation_elapsed_ms > CAP_MS:
        raise RuntimeError("CACHE_CANDIDATE_CAP_EXCEEDED_RESULT_RETAINED")
    if not qualification["responseResultHashMatchesUnprofiledBaseline"]:
        raise RuntimeError("CACHE_CANDIDATE_EXACT_QUALIFICATION_RESULT_HASH_MISMATCH")


if __name__ == "__main__":
    main()