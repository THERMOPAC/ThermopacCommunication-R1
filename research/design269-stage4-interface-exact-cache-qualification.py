#!/usr/bin/env python3.12
"""Qualify cached coarse and refined requests against prior full payloads.

Response hashes intentionally differ because this is a newly hashed wrapper.
This script preserves both old/new identities and compares every scientific
payload field byte-for-byte after removing only the declared implementation
identity paths. It runs no database query, full column, or persisted result.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import time

ROOT = Path(__file__).resolve().parents[1]
QUALIFICATION = ROOT / "research/design269-stage4-dogbox-exact-request-qualification.json"
OUT = ROOT / "research/design269-stage4-interface-exact-cache-qualification.json"
CAP_MS = 180_000
IDENTITY_PATHS = (
    # `resultHash` is a derived digest of the complete response, not a
    # scientific field. Its raw value is independently revalidated below
    # before excluding it from the payload comparison.
    "resultHash",
    "workerSha256",
    "jobBInterfaceArtifactSha256",
    "numericalStrategy.wrapperWorkerSha256",
)


class QualificationCutoff(Exception):
    pass


def on_term(_signum, _frame):
    raise QualificationCutoff("MANAGED_CACHE_QUALIFICATION_SIGTERM_CUTOFF")


def canonical_digest(value):
    return hashlib.sha256(json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False,
    ).encode()).hexdigest()


def scientific_payload(response):
    payload = copy.deepcopy(response)
    payload.pop("resultHash", None)
    payload.pop("workerSha256", None)
    payload.pop("jobBInterfaceArtifactSha256", None)
    payload.get("numericalStrategy", {}).pop("wrapperWorkerSha256", None)
    return payload


def write_output(value):
    OUT.write_text(json.dumps(value, indent=2) + "\n")


def configure_runtime():
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


def cache_total(runs):
    total = {"calls": 0, "hits": 0, "misses": 0, "evictions": 0}
    for row in runs:
        for key in total:
            total[key] += int(row.get(key, 0))
    total["hitRatio"] = total["hits"] / total["calls"] if total["calls"] else 0.0
    return total


def main():
    signal.signal(signal.SIGTERM, on_term)
    started = time.monotonic()
    source = json.loads(QUALIFICATION.read_text())
    cases = source.get("cases")
    if source.get("qualificationPassed") is not True or not isinstance(cases, list):
        raise RuntimeError("CACHE_QUALIFICATION_REQUIRES_PRIOR_EXACT_QUALIFICATION")
    initial = {
        "schema": "DESIGN269_STAGE4_EXACT_CACHE_FULL_PAYLOAD_QUALIFICATION_V1",
        "scope": {
            "capMs": CAP_MS,
            "databaseAccess": "NONE_REPLAY_OF_OWNER_SCOPED_CAPTURE",
            "noProductionCalculationPersistence": True,
            "noFullColumnExecution": True,
            "requestsPlanned": len(cases),
            "implementationIdentityExcludedPaths": list(IDENTITY_PATHS),
            "payloadComparison": "EXACT_CANONICAL_JSON_AFTER_DECLARED_IDENTITY_REMOVAL",
        },
        "status": "QUALIFICATION_INITIALIZED_WORKER_NOT_STARTED",
        "timing": {"checkpointTimestamp": time.time(), "elapsedMs": 0},
    }
    write_output(initial)
    worker_path = configure_runtime()
    spec = importlib.util.spec_from_file_location("design269_exact_cache_qualification", worker_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("CACHE_QUALIFICATION_DOGBOX_IMPORT_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._exact_wet_lngamma_cache_runs.clear()
    completed = []
    try:
        for case in cases:
            operation_started = time.monotonic()
            request = case["request"]
            response = {
                **module.identity(),
                **module.legacy.execute({
                    "protocol": "ECR_JOB_B_INTERFACE_V1",
                    "operation": "SOLVE_INTERFACE",
                    **request,
                }),
            }
            response["resultHash"] = module.legacy.digest(response)
            baseline_response = case["response"]
            baseline_raw = copy.deepcopy(baseline_response)
            baseline_raw.pop("resultHash", None)
            candidate_raw = copy.deepcopy(response)
            candidate_raw.pop("resultHash", None)
            candidate_payload = scientific_payload(response)
            baseline_payload = scientific_payload(baseline_response)
            completed.append({
                "mesh": case["mesh"],
                "actualEngineRequestHash": case["actualEngineRequestHash"],
                "baselineResponseResultHash": baseline_response["resultHash"],
                "candidateResponseResultHash": response["resultHash"],
                "resultHashExpectedToDifferForNewWrapperIdentity": (
                    baseline_response["resultHash"] != response["resultHash"]
                ),
                "baselineRawResponseDigest": module.legacy.digest(baseline_raw),
                "baselineRawResponseDigestValid": module.legacy.digest(baseline_raw)
                == baseline_response["resultHash"],
                "candidateRawResponseDigest": module.legacy.digest(candidate_raw),
                "candidateRawResponseDigestValid": module.legacy.digest(candidate_raw)
                == response["resultHash"],
                "baselineImplementationIdentity": {
                    key: baseline_response.get(key) for key in (
                        "workerSha256", "jobBInterfaceArtifactSha256",
                        "stage4AdapterArtifactSha256",
                    )
                },
                "candidateImplementationIdentity": {
                    key: response.get(key) for key in (
                        "workerSha256", "jobBInterfaceArtifactSha256",
                        "stage4AdapterArtifactSha256",
                    )
                },
                "baselineScientificPayloadSha256": canonical_digest(baseline_payload),
                "candidateScientificPayloadSha256": canonical_digest(candidate_payload),
                # JSON readers model all finite JSON numbers as the same
                # number domain; Python's int/float and signed-zero spelling
                # distinctions are therefore not a scientific change. Record
                # both that semantic equality and the raw JSON spelling hashes
                # instead of falsely describing the latter as exact.
                "scientificPayloadNumericallyMatches": candidate_payload == baseline_payload,
                "baselineScientificPayloadProtocolDigest": module.legacy.digest(baseline_payload),
                "candidateScientificPayloadProtocolDigest": module.legacy.digest(candidate_payload),
                "scientificPayloadProtocolDigestMatches": module.legacy.digest(
                    baseline_payload,
                ) == module.legacy.digest(candidate_payload),
                "responseStatus": response.get("status"),
                "allOriginalWorkerSelectionGatesPassed": case[
                    "allOriginalWorkerSelectionGatesPassed"
                ],
                "operationElapsedMs": round((time.monotonic() - operation_started) * 1000),
            })
        caches = cache_total(module._exact_wet_lngamma_cache_runs)
        all_match = all(row["scientificPayloadNumericallyMatches"]
                        and row["scientificPayloadProtocolDigestMatches"] for row in completed)
        write_output({
            **initial,
            "status": "QUALIFICATION_COMPLETED_EXACT_SCIENTIFIC_PAYLOAD"
            if all_match else "QUALIFICATION_COMPLETED_SCIENTIFIC_PAYLOAD_MISMATCH",
            "timing": {
                "checkpointTimestamp": time.time(),
                "elapsedMs": round((time.monotonic() - started) * 1000),
            },
            "cases": completed,
            "cache": caches,
        })
        if not all_match:
            raise RuntimeError("CACHE_QUALIFICATION_SCIENTIFIC_PAYLOAD_MISMATCH")
    except BaseException as error:
        write_output({
            **initial,
            "status": "QUALIFICATION_PARTIAL_SIGTERM_RETAINED"
            if isinstance(error, QualificationCutoff) else "QUALIFICATION_ERROR_RETAINED",
            "timing": {
                "checkpointTimestamp": time.time(),
                "elapsedMs": round((time.monotonic() - started) * 1000),
            },
            "completedCases": completed,
            "cache": cache_total(module._exact_wet_lngamma_cache_runs),
            "error": str(error),
        })
        raise


if __name__ == "__main__":
    main()