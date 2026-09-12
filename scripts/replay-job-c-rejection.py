#!/usr/bin/env python3
"""Replay diagnostic algebra for one preserved, rejected Job-C trial.

This is deliberately an offline evidence reader.  It never imports the Job-C
worker, starts a process, evaluates a constitutive equation, runs a solver, or
writes a design/research result.  The only algebra performed after every
integrity and lineage check has passed is arithmetic on the captured
Jacobian/residual arrays.

The required inputs are:

    python3 scripts/replay-job-c-rejection.py \
      --checkpoint checkpoint.json \
      --request pristine-worker-request.json \
      --runtime-root /path/to/workspace \
      --id 'coupled-rejection:...'

``--id`` is intentionally mandatory.  A checkpoint can contain several
historical rejected trials and selecting a row by position would make an
offline report ambiguous.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Iterable


DIMENSION = 189
CHECKPOINT_SCHEMA = "ECR_JOB_C_PARTIAL_V1"
CAPTURE_SCHEMA = "ECR_JOB_C_REJECTED_DIAGNOSTIC_V1"
HEX_SHA256 = re.compile(r"^[a-f0-9]{64}$")
WORKER_FILES = frozenset(
    {
        "server/ecr-pre-pilot/job-c/worker.py",
        "server/ecr-pre-pilot/job-c/candidate_interface.py",
        "server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py",
        "server/ecr-pre-pilot/job-c/branch_continuation.py",
    }
)


class ReplayRefused(ValueError):
    """An evidence refusal that should be shown without a traceback."""


def _hash_numbers(value: Any) -> Any:
    """Match worker.py's JS-compatible numeric hash normalization exactly."""

    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, (int, float)):
        number = float(value)
        if not math.isfinite(number):
            raise ReplayRefused("NON_FINITE_HASH_INPUT")
        mantissa, exponent = format(
            0.0 if number == 0.0 else number, ".16e"
        ).split("e")
        return {"$number": f"{mantissa}e{int(exponent)}"}
    if isinstance(value, list):
        return [_hash_numbers(child) for child in value]
    if isinstance(value, dict):
        return {key: _hash_numbers(child) for key, child in value.items()}
    raise ReplayRefused(f"UNSUPPORTED_HASH_VALUE:{type(value).__name__}")


def canonical(value: Any) -> str:
    """Return the byte representation used by the scientific worker digest."""

    return json.dumps(
        _hash_numbers(value),
        sort_keys=True,
        separators=(",", ":"),
        # worker.py uses json.dumps' default ensure_ascii=True.  Keeping this
        # explicit prevents a locale/JSON implementation change from
        # changing the cross-runtime digest.
        ensure_ascii=True,
        allow_nan=False,
    )


def digest(value: Any) -> str:
    """Hash a JSON value with Job-C's numeric canonicalization."""

    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def _read_json(path: Path, label: str) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ReplayRefused(f"{label}_READ_FAILED:{exc}") from exc
    # A persisted checkpoint is JSON, but accepting the worker's diagnostic
    # line makes the utility useful with a raw captured stdout fragment while
    # still requiring exactly one JSON object.
    stripped = text.strip()
    prefix = "JOB_C_CHECKPOINT "
    if stripped.startswith(prefix):
        stripped = stripped[len(prefix) :].strip()
    try:
        value = json.loads(stripped)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ReplayRefused(f"{label}_JSON_INVALID:{exc}") from exc
    if not isinstance(value, dict):
        raise ReplayRefused(f"{label}_OBJECT_REQUIRED")
    return value


def _pristine_request(value: dict[str, Any]) -> dict[str, Any]:
    """Extract a queue snapshot's immutable worker request when wrapped."""

    # The canonical persisted queue shape is
    # {prepared: {workerRequest: ...}, responseBasis: ...}.  Direct worker
    # request JSON is also accepted for archival/offline use.
    prepared = value.get("prepared")
    if isinstance(prepared, dict) and isinstance(prepared.get("workerRequest"), dict):
        return prepared["workerRequest"]
    if isinstance(value.get("workerRequest"), dict):
        return value["workerRequest"]
    nested_input = value.get("input")
    if isinstance(nested_input, dict):
        nested_prepared = nested_input.get("prepared")
        if (
            isinstance(nested_prepared, dict)
            and isinstance(nested_prepared.get("workerRequest"), dict)
        ):
            return nested_prepared["workerRequest"]
    return value


def checkpoint_request_payload(request: dict[str, Any]) -> dict[str, Any]:
    """Remove transport/resume fields exactly as worker.py does."""

    return {
        key: child
        for key, child in request.items()
        if key not in ("protocol", "operation", "resumeCheckpoint")
    }


def _require_sha(value: Any, label: str) -> str:
    if not isinstance(value, str) or HEX_SHA256.fullmatch(value) is None:
        raise ReplayRefused(f"{label}_SHA256_INVALID")
    return value


def _require_finite_scalar(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ReplayRefused(f"{label}_NUMBER_REQUIRED")
    result = float(value)
    if not math.isfinite(result):
        raise ReplayRefused(f"{label}_NON_FINITE")
    return result


def _vector(value: Any, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != DIMENSION:
        raise ReplayRefused(f"{label}_MUST_HAVE_{DIMENSION}_VALUES")
    return [
        _require_finite_scalar(child, f"{label}[{index}]")
        for index, child in enumerate(value)
    ]


def _matrix(value: Any, label: str) -> list[list[float]]:
    if not isinstance(value, list) or len(value) != DIMENSION:
        raise ReplayRefused(f"{label}_MUST_HAVE_{DIMENSION}_ROWS")
    rows: list[list[float]] = []
    for index, row in enumerate(value):
        rows.append(_vector(row, f"{label}[{index}]"))
    return rows


def _payload_without(value: dict[str, Any], key: str) -> dict[str, Any]:
    return {name: child for name, child in value.items() if name != key}


def _validate_diagnostic_linearization(
    value: Any, location: str
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ReplayRefused(f"{location}_DIAGNOSTIC_LINEARIZATION_MISSING")

    required = (
        "state",
        "stateSha256",
        "residual",
        "residualSha256",
        "jacobian",
        "jacobianSha256",
        "lowerBounds",
        "upperBounds",
        "variableScale",
        "activeMask",
        "payloadSha256",
    )
    missing = [key for key in required if key not in value]
    if missing:
        raise ReplayRefused(
            f"{location}_DIAGNOSTIC_LINEARIZATION_FIELDS_MISSING:{','.join(missing)}"
        )

    state = _vector(value["state"], f"{location}.state")
    residual = _vector(value["residual"], f"{location}.residual")
    jacobian = _matrix(value["jacobian"], f"{location}.jacobian")
    lower = _vector(value["lowerBounds"], f"{location}.lowerBounds")
    upper = _vector(value["upperBounds"], f"{location}.upperBounds")
    variable_scale = _vector(value["variableScale"], f"{location}.variableScale")
    active_mask = _vector(value["activeMask"], f"{location}.activeMask")
    _require_sha(value["stateSha256"], f"{location}.state")
    _require_sha(value["residualSha256"], f"{location}.residual")
    _require_sha(value["jacobianSha256"], f"{location}.jacobian")
    _require_sha(value["payloadSha256"], f"{location}.payload")

    if value["stateSha256"] != digest(value["state"]):
        raise ReplayRefused(f"{location}_STATE_HASH_MISMATCH")
    if value["residualSha256"] != digest(value["residual"]):
        raise ReplayRefused(f"{location}_RESIDUAL_HASH_MISMATCH")
    if value["jacobianSha256"] != digest(value["jacobian"]):
        raise ReplayRefused(f"{location}_JACOBIAN_HASH_MISMATCH")
    if value["payloadSha256"] != digest(_payload_without(value, "payloadSha256")):
        raise ReplayRefused(f"{location}_PAYLOAD_HASH_MISMATCH")

    for index, (low, high, scale) in enumerate(zip(lower, upper, variable_scale)):
        if low > high:
            raise ReplayRefused(f"{location}.bounds[{index}]_ORDER_INVALID")
        if scale <= 0.0:
            raise ReplayRefused(f"{location}.variableScale[{index}]_NOT_POSITIVE")
    for index, (state_value, low, high) in enumerate(zip(state, lower, upper)):
        if state_value < low or state_value > high:
            raise ReplayRefused(
                f"{location}.state[{index}]_OUTSIDE_RECORDED_BOUNDS"
            )

    return {
        "location": location,
        "state": state,
        "residual": residual,
        "jacobian": jacobian,
        "lowerBounds": lower,
        "upperBounds": upper,
        "variableScale": variable_scale,
        "activeMask": active_mask,
        "stateSha256": value["stateSha256"],
        "residualSha256": value["residualSha256"],
        "jacobianSha256": value["jacobianSha256"],
        "payloadSha256": value["payloadSha256"],
    }


def _validate_jacobian_audit(
    value: Any, location: str, *, require_sequence: bool = True
) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        raise ReplayRefused(f"{location}_JACOBIAN_AUDIT_MISSING")
    diagnostic = _validate_diagnostic_linearization(
        value.get("diagnosticLinearization"), f"{location}.diagnosticLinearization"
    )
    root_state_hash = value.get("stateSha256")
    if root_state_hash is not None:
        _require_sha(root_state_hash, f"{location}.state")
        if root_state_hash != diagnostic["stateSha256"]:
            raise ReplayRefused(f"{location}_STATE_LINEAGE_MISMATCH")

    if not require_sequence:
        return [diagnostic]

    sequence = value.get("rankAwareCorrectionSequence")
    if not isinstance(sequence, dict):
        raise ReplayRefused(f"{location}_RANK_AWARE_SEQUENCE_MISSING")
    linearizations = sequence.get("linearizations")
    if not isinstance(linearizations, list) or not linearizations:
        raise ReplayRefused(f"{location}_RANK_AWARE_LINEARIZATIONS_MISSING")

    audits = [diagnostic]
    for index, record in enumerate(linearizations):
        record_location = f"{location}.rankAwareCorrectionSequence.linearizations[{index}]"
        if not isinstance(record, dict):
            raise ReplayRefused(f"{record_location}_OBJECT_REQUIRED")
        starting_hash = record.get("startingStateSha256")
        _require_sha(starting_hash, f"{record_location}.startingState")
        audit = (
            _validate_jacobian_audit(
                record.get("jacobianAudit"),
                f"{record_location}.jacobianAudit",
                require_sequence=False,
            )
            if isinstance(record.get("jacobianAudit"), dict)
            else None
        )
        if audit is None:
            raise ReplayRefused(f"{record_location}.JACOBIAN_AUDIT_MISSING")
        # A sequence record's starting hash is the exact state on which its
        # Jacobian was captured.  This catches a vector copied from another
        # correction even when each individual payload hash is valid.
        if starting_hash != audit[0]["stateSha256"]:
            raise ReplayRefused(f"{record_location}_STARTING_STATE_MISMATCH")
        audits.extend(audit)
    return audits


def _validate_worker_lineage(capture: dict[str, Any], runtime_root: Path) -> None:
    files = capture.get("workerFilesSha256")
    if not isinstance(files, dict):
        raise ReplayRefused("WORKER_FILES_SHA256_MISSING")
    if set(files) != WORKER_FILES:
        raise ReplayRefused("WORKER_FILES_LINEAGE_PATHS_MISMATCH")

    root = runtime_root.resolve()
    if not root.is_dir():
        raise ReplayRefused("RUNTIME_ROOT_DIRECTORY_REQUIRED")
    for relative, expected in files.items():
        _require_sha(expected, f"workerFilesSha256[{relative}]")
        relative_path = Path(relative)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ReplayRefused(f"WORKER_FILE_PATH_NOT_RELATIVE:{relative}")
        path = root / relative_path
        if path.is_symlink() or not path.is_file():
            raise ReplayRefused(f"WORKER_FILE_MISSING:{relative}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ReplayRefused(f"WORKER_FILE_HASH_MISMATCH:{relative}")


def _validate_capture(
    evidence: dict[str, Any], expected_request_hash: str, runtime_root: Path
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    capture = evidence.get("diagnosticCapture")
    if not isinstance(capture, dict):
        raise ReplayRefused("DIAGNOSTIC_CAPTURE_MISSING")
    if capture.get("schemaVersion") != CAPTURE_SCHEMA:
        raise ReplayRefused("DIAGNOSTIC_CAPTURE_SCHEMA_INVALID")
    if capture.get("diagnosticOnly") is not True:
        raise ReplayRefused("DIAGNOSTIC_ONLY_FLAG_INVALID")
    if capture.get("requestSha256") != expected_request_hash:
        raise ReplayRefused("CAPTURE_REQUEST_LINEAGE_MISMATCH")
    _require_sha(capture.get("requestSha256"), "diagnosticCapture.request")
    _require_sha(capture.get("selectedStateSha256"), "diagnosticCapture.selectedState")
    _require_sha(capture.get("coupledAttemptsSha256"), "diagnosticCapture.coupledAttempts")
    _require_sha(capture.get("captureSha256"), "diagnosticCapture.capture")
    if capture["captureSha256"] != digest(_payload_without(capture, "captureSha256")):
        raise ReplayRefused("DIAGNOSTIC_CAPTURE_HASH_MISMATCH")
    _validate_worker_lineage(capture, runtime_root)

    attempts = evidence.get("coupledAttempts")
    if not isinstance(attempts, list) or not attempts:
        raise ReplayRefused("COUPLED_ATTEMPTS_MISSING")
    if capture["coupledAttemptsSha256"] != digest(attempts):
        raise ReplayRefused("COUPLED_ATTEMPTS_HASH_MISMATCH")

    selected_state = _vector(evidence.get("state"), "selectedState")
    _require_sha(evidence.get("stateSha256"), "rejectedTrial.state")
    if evidence["stateSha256"] != digest(selected_state):
        raise ReplayRefused("REJECTED_STATE_HASH_MISMATCH")
    if capture["selectedStateSha256"] != digest(selected_state):
        raise ReplayRefused("SELECTED_STATE_HASH_MISMATCH")
    audits: list[dict[str, Any]] = []
    for index, attempt in enumerate(attempts):
        location = f"coupledAttempts[{index}].jacobianAudit"
        if not isinstance(attempt, dict):
            raise ReplayRefused(f"coupledAttempts[{index}]_OBJECT_REQUIRED")
        audits.extend(_validate_jacobian_audit(attempt.get("jacobianAudit"), location))
    return capture, audits


def _find_selected_trial(checkpoint: dict[str, Any], selection_id: str) -> dict[str, Any]:
    if checkpoint.get("schemaVersion") != CHECKPOINT_SCHEMA:
        raise ReplayRefused("CHECKPOINT_SCHEMA_INVALID")
    if checkpoint.get("complete") is not False:
        raise ReplayRefused("CHECKPOINT_MUST_BE_INCOMPLETE")
    rows = checkpoint.get("completedResults")
    if not isinstance(rows, list):
        raise ReplayRefused("CHECKPOINT_COMPLETED_RESULTS_MISSING")
    matches = [
        row
        for row in rows
        if isinstance(row, dict) and row.get("id") == selection_id
    ]
    if len(matches) != 1:
        raise ReplayRefused("REJECTED_TRIAL_ID_NOT_UNIQUE")
    row = matches[0]
    if row.get("kind") != "REJECTED_COUPLED_CONTINUATION_TRIAL":
        raise ReplayRefused("SELECTED_RESULT_NOT_REJECTED_COUPLED_TRIAL")
    evidence = row.get("value")
    if not isinstance(evidence, dict):
        raise ReplayRefused("SELECTED_RESULT_VALUE_MISSING")
    return evidence


def _norm(vector: Iterable[float]) -> float:
    result = math.sqrt(math.fsum(value * value for value in vector))
    if not math.isfinite(result):
        raise ReplayRefused("DIAGNOSTIC_ALGEBRA_NON_FINITE")
    return result


def _diagnostic_algebra(
    audits: list[dict[str, Any]], selection_id: str, capture: dict[str, Any]
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for audit in audits:
        residual = audit["residual"]
        matrix = audit["jacobian"]
        gradient = [
            math.fsum(matrix[row][column] * residual[row] for row in range(DIMENSION))
            for column in range(DIMENSION)
        ]
        lower_distance = [
            state - lower
            for state, lower in zip(audit["state"], audit["lowerBounds"])
        ]
        upper_distance = [
            upper - state
            for state, upper in zip(audit["state"], audit["upperBounds"])
        ]
        if not all(
            math.isfinite(value)
            for value in [*gradient, *lower_distance, *upper_distance]
        ):
            raise ReplayRefused("DIAGNOSTIC_ALGEBRA_NON_FINITE")
        rows.append(
            {
                "location": audit["location"],
                "stateSha256": audit["stateSha256"],
                "residualL2Norm": _norm(residual),
                "residualInfNorm": max(abs(value) for value in residual),
                "jtResidualL2Norm": _norm(gradient),
                "jtResidualInfNorm": max(abs(value) for value in gradient),
                "minimumLowerBoundDistance": min(lower_distance),
                "minimumUpperBoundDistance": min(upper_distance),
                "lowerBoundDistances": lower_distance,
                "upperBoundDistances": upper_distance,
                "activeMask": audit["activeMask"],
            }
        )
    return {
        "schemaVersion": "ECR_JOB_C_REJECTION_REPLAY_DIAGNOSTIC_V1",
        "diagnosticOnly": True,
        "selectionId": selection_id,
        "requestSha256": capture["requestSha256"],
        "captureSha256": capture["captureSha256"],
        "linearizationCount": len(rows),
        "linearizations": rows,
    }


def replay(
    checkpoint_path: Path,
    request_path: Path,
    runtime_root: Path,
    selection_id: str,
) -> dict[str, Any]:
    if not selection_id:
        raise ReplayRefused("REJECTED_TRIAL_ID_REQUIRED")
    checkpoint = _read_json(checkpoint_path, "CHECKPOINT")
    request_wrapper = _read_json(request_path, "REQUEST")
    request = _pristine_request(request_wrapper)
    expected_request_hash = digest(checkpoint_request_payload(request))
    checkpoint_hash = checkpoint.get("requestSha256")
    if checkpoint_hash != expected_request_hash:
        raise ReplayRefused("CHECKPOINT_REQUEST_HASH_MISMATCH")
    _require_sha(checkpoint_hash, "checkpoint.request")
    evidence = _find_selected_trial(checkpoint, selection_id)
    capture, audits = _validate_capture(evidence, expected_request_hash, runtime_root)
    return _diagnostic_algebra(audits, selection_id, capture)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read-only diagnostic replay of one rejected Job-C trial."
    )
    parser.add_argument(
        "--checkpoint",
        "--checkpoint-json",
        dest="checkpoint",
        required=True,
        help="JSON checkpoint containing completedResults",
    )
    parser.add_argument(
        "--request",
        "--request-json",
        "--pristine-request",
        "--pristine-request-json",
        "--expected-request",
        "--expected-request-json",
        dest="request",
        required=True,
        help="JSON containing the immutable pristine worker request",
    )
    parser.add_argument(
        "--runtime-root",
        required=True,
        help="Workspace root containing the four captured Job-C source files",
    )
    parser.add_argument(
        "--id",
        "--rejected-id",
        "--rejected-trial-id",
        "--selection-id",
        dest="selection_id",
        required=True,
        help="Exact completedResults row id to replay",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = replay(
            Path(args.checkpoint),
            Path(args.request),
            Path(args.runtime_root),
            args.selection_id,
        )
    except ReplayRefused as exc:
        print(f"REPLAY_REFUSED:{exc}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError) as exc:
        print(f"REPLAY_REFUSED:IO_ERROR:{exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, separators=(",", ":"), allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())