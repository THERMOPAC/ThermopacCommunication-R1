#!/usr/bin/env python3
"""Offline qualification of bound-aware Job-C corrections.

This program is intentionally a saved-evidence experiment.  It reads the
immutable request/checkpoint and the hash-bound diagnostic capture, loads only
the pinned scientific engine and candidate interface, and evaluates the
unchanged 189-equation residual closure.  It never imports the Job-C worker,
starts a case, runs continuation, or changes production code.

The two compared directions are:

* CAPTURED_FD: the captured finite-difference matrix at S0/S1/S2, followed by
  a fresh sparse-coloured finite-difference matrix after every accepted move.
* ANALYTIC_CELLS_5_6: the same matrix, with only cell 5 and cell 6 total-flux
  columns replaced by the stable analytic derivative.

Every correction is a bounded linear subproblem followed by a fixed-budget
true-residual line search.  The linear prediction is recorded for diagnosis,
but never decides acceptance or a gate.  A moved state is re-evaluated through
the unchanged residual and its finite-difference matrix is refreshed before
the next sequential correction.
"""

from __future__ import annotations

import argparse
import ast
import copy
import hashlib
import importlib.util
import json
import math
import platform
import sys
from pathlib import Path
from typing import Any


DIMENSION = 189
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
TARGET_CELLS = (4, 5)  # zero-based numerical cells 5 and 6
MAX_CORRECTIONS = 12
MAX_BACKTRACKS = 6
BACKTRACK_FACTOR = 0.5
LINE_SEARCH_DECREASE_RELATIVE_TOLERANCE = 1e-12
LINEAR_SUBPROBLEM_TOLERANCE = 1e-14
LINEAR_SUBPROBLEM_MAX_ITERATIONS = 300
GATE_THRESHOLD = 1e-7


class QualificationRefused(ValueError):
    """A fail-closed refusal caused by missing or changed evidence."""


def sha256_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except (OSError, UnicodeError) as exc:
        raise QualificationRefused(f"FILE_HASH_READ_FAILED:{path}:{exc}") from exc


def read_json(path: Path, label: str) -> Any:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise QualificationRefused(f"{label}_READ_OR_JSON_FAILED:{exc}") from exc
    if not isinstance(value, dict):
        raise QualificationRefused(f"{label}_OBJECT_REQUIRED")
    return value


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise QualificationRefused(f"MODULE_LOAD_SPEC_FAILED:{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pure_sparsity_helper(path: Path):
    """Extract only the conservative sparsity declaration from worker.py.

    Compiling this one function from an AST is deliberate: importing
    worker.py, even for a helper, is prohibited for this qualification.
    """

    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, SyntaxError) as exc:
        raise QualificationRefused(f"SPARSITY_AST_READ_FAILED:{exc}") from exc
    nodes = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "coupled_jacobian_sparsity"
    ]
    if len(nodes) != 1:
        raise QualificationRefused("COUPLED_SPARSITY_HELPER_MISSING_OR_AMBIGUOUS")
    scope: dict[str, Any] = {}
    exec(
        compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"),
        scope,
    )
    return scope["coupled_jacobian_sparsity"]


def validate_report_digest(validator: Any, report: dict[str, Any], label: str) -> None:
    stored = report.get("reportSha256")
    if not isinstance(stored, str):
        raise QualificationRefused(f"{label}_REPORT_HASH_MISSING")
    payload = copy.deepcopy(report)
    payload.pop("reportSha256", None)
    if validator.digest(payload) != stored:
        raise QualificationRefused(f"{label}_REPORT_HASH_MISMATCH")


def validate_runtime_manifest(
    artifact: Path, expected_manifest_hash: str
) -> dict[str, Any]:
    manifest_path = artifact / "predictive-nt-runtime-manifest.json"
    if sha256_file(manifest_path) != expected_manifest_hash:
        raise QualificationRefused("PINNED_RUNTIME_MANIFEST_HASH_MISMATCH")
    manifest = read_json(manifest_path, "RUNTIME_MANIFEST")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise QualificationRefused("PINNED_RUNTIME_MANIFEST_FILES_MISSING")
    for index, record in enumerate(files):
        if not isinstance(record, dict):
            raise QualificationRefused(f"RUNTIME_MANIFEST_RECORD_INVALID:{index}")
        relative = record.get("path")
        expected = record.get("sha256")
        if (
            not isinstance(relative, str)
            or Path(relative).is_absolute()
            or ".." in Path(relative).parts
            or not isinstance(expected, str)
        ):
            raise QualificationRefused(f"RUNTIME_MANIFEST_PATH_OR_HASH_INVALID:{index}")
        path = artifact / relative
        if path.is_symlink() or not path.is_file():
            raise QualificationRefused(f"PINNED_RUNTIME_FILE_UNAVAILABLE:{relative}")
        if sha256_file(path) != expected:
            raise QualificationRefused(f"PINNED_RUNTIME_FILE_HASH_MISMATCH:{relative}")
    return manifest


def unique_audits(audits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for audit in audits:
        state_hash = audit.get("stateSha256")
        if not isinstance(state_hash, str):
            raise QualificationRefused("CAPTURED_AUDIT_STATE_HASH_MISSING")
        if state_hash not in seen:
            result.append(audit)
            seen.add(state_hash)
    return result


def validate_integrity(args: argparse.Namespace, validator: Any) -> dict[str, Any]:
    diagnostics_path = Path(args.diagnostics).resolve()
    diagnostics = read_json(diagnostics_path, "FLUX_DIAGNOSTICS")
    validate_report_digest(validator, diagnostics, "FLUX_DIAGNOSTICS")
    if diagnostics.get("schemaVersion") != "JOB_C_OFFLINE_FLUX_COLUMNS_V1":
        raise QualificationRefused("FLUX_DIAGNOSTICS_SCHEMA_INVALID")
    if diagnostics.get("diagnosticOnly") is not True:
        raise QualificationRefused("FLUX_DIAGNOSTICS_NOT_DIAGNOSTIC_ONLY")
    if diagnostics.get("noWorkerOrContinuationInvoked") is not True:
        raise QualificationRefused("FLUX_DIAGNOSTICS_WORKER_OR_CONTINUATION_FLAG_INVALID")

    markdown_path = Path(args.diagnostic_markdown).resolve()
    try:
        markdown = markdown_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise QualificationRefused(
            f"FLUX_DIAGNOSTICS_MARKDOWN_READ_FAILED:{exc}"
        ) from exc
    if "Do not apply an analytic-column-only production change." not in markdown:
        raise QualificationRefused("FLUX_DIAGNOSTICS_MARKDOWN_CONTENT_UNEXPECTED")

    reference_path = Path(diagnostics["sourceReference"]).resolve()
    if sha256_file(reference_path) != diagnostics.get("referenceFileSha256"):
        raise QualificationRefused("SOURCE_REFERENCE_HASH_MISMATCH")

    request_path = Path(args.request).resolve()
    checkpoint_path = Path(args.checkpoint).resolve()
    if sha256_file(request_path) != diagnostics.get("inputFileSha256"):
        raise QualificationRefused("IMMUTABLE_REQUEST_FILE_HASH_MISMATCH")
    if sha256_file(checkpoint_path) != diagnostics.get("checkpointFileSha256"):
        raise QualificationRefused("IMMUTABLE_CHECKPOINT_FILE_HASH_MISMATCH")

    request_wrapper = read_json(request_path, "REQUEST")
    request = request_wrapper.get("prepared", {}).get("workerRequest")
    if not isinstance(request, dict):
        raise QualificationRefused("PRISTINE_WORKER_REQUEST_MISSING")
    checkpoint = read_json(checkpoint_path, "CHECKPOINT")
    selection_id = args.selection_id
    value = validator._find_selected_trial(checkpoint, selection_id)
    expected_request_hash = validator.digest(
        validator.checkpoint_request_payload(request)
    )
    if checkpoint.get("requestSha256") != expected_request_hash:
        raise QualificationRefused("CHECKPOINT_REQUEST_HASH_MISMATCH")
    if value.get("diagnosticCapture", {}).get("requestSha256") != expected_request_hash:
        raise QualificationRefused("CAPTURE_REQUEST_HASH_MISMATCH")

    capture, audits = validator._validate_capture(
        value, expected_request_hash, Path(args.runtime_root).resolve()
    )
    if capture.get("captureSha256") != diagnostics.get("captureSha256"):
        raise QualificationRefused("CAPTURE_HASH_MISMATCH")
    if diagnostics.get("selectionId") != selection_id:
        raise QualificationRefused("DIAGNOSTICS_SELECTION_ID_MISMATCH")
    if capture.get("captureSha256") != diagnostics.get("captureSha256"):
        raise QualificationRefused("DIAGNOSTIC_CAPTURE_LINEAGE_MISMATCH")

    worker_hashes = diagnostics.get("workerFilesSha256")
    if not isinstance(worker_hashes, dict):
        raise QualificationRefused("WORKER_FILE_LINEAGE_MISSING")
    runtime_root = Path(args.runtime_root).resolve()
    for relative, expected in worker_hashes.items():
        path = runtime_root / relative
        if path.is_symlink() or not path.is_file() or sha256_file(path) != expected:
            raise QualificationRefused(f"WORKER_FILE_HASH_MISMATCH:{relative}")

    artifact = Path(args.runtime_artifact_root).resolve()
    validate_runtime_manifest(artifact, diagnostics.get("runtimeManifestSha256"))
    engine_path = artifact / (
        "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
    )
    if sha256_file(engine_path) != diagnostics.get("scientificEngineSha256"):
        raise QualificationRefused("SCIENTIFIC_ENGINE_HASH_MISMATCH")

    source_hashes = diagnostics.get("diagnosticSourceSha256")
    if not isinstance(source_hashes, dict):
        raise QualificationRefused("DIAGNOSTIC_SOURCE_LINEAGE_MISSING")
    for recorded_path, expected in source_hashes.items():
        name = Path(recorded_path).name
        actual_path = Path(__file__).with_name(name)
        if not actual_path.is_file() or sha256_file(actual_path) != expected:
            raise QualificationRefused(f"DIAGNOSTIC_SOURCE_HASH_MISMATCH:{name}")

    if int(request.get("compartments", -1)) != 7:
        raise QualificationRefused("UNSUPPORTED_COMPARTMENT_COUNT")
    if value.get("heightM") != 2 or float(value.get("rejectedLambda")) != 1e-8:
        raise QualificationRefused("UNSUPPORTED_CAPTURED_GEOMETRY_OR_LAMBDA")
    if len(diagnostics.get("states", [])) != 3:
        raise QualificationRefused("EXPECTED_S0_S1_S2_ONLY")

    captured = unique_audits(audits)
    if len(captured) != 3:
        raise QualificationRefused("EXPECTED_THREE_UNIQUE_CAPTURED_STATES")
    diagnostic_states = diagnostics["states"]
    captured_by_hash = {row["stateSha256"]: row for row in captured}
    for state_index, state_row in enumerate(diagnostic_states):
        state_hash = state_row.get("stateSha256")
        if state_hash not in captured_by_hash:
            raise QualificationRefused(f"DIAGNOSTIC_STATE_NOT_IN_CAPTURE:S{state_index}")
        audit = captured_by_hash[state_hash]
        if state_row.get("residualReplayMaxError") != 0.0:
            raise QualificationRefused(f"DIAGNOSTIC_RESIDUAL_REPLAY_NOT_EXACT:S{state_index}")
        if len(audit["state"]) != DIMENSION or len(audit["residual"]) != DIMENSION:
            raise QualificationRefused(f"CAPTURED_DIMENSION_INVALID:S{state_index}")
        if len(audit["jacobian"]) != DIMENSION or any(
            len(row) != DIMENSION for row in audit["jacobian"]
        ):
            raise QualificationRefused(f"CAPTURED_JACOBIAN_DIMENSION_INVALID:S{state_index}")
        if validator.digest(audit["state"]) != state_hash:
            raise QualificationRefused(f"CAPTURED_STATE_HASH_INVALID:S{state_index}")
        if validator.digest(audit["residual"]) != audit["residualSha256"]:
            raise QualificationRefused(f"CAPTURED_RESIDUAL_HASH_INVALID:S{state_index}")
        if validator.digest(audit["jacobian"]) != audit["jacobianSha256"]:
            raise QualificationRefused(f"CAPTURED_JACOBIAN_HASH_INVALID:S{state_index}")
        if len(state_row.get("columns", [])) != 2:
            raise QualificationRefused(f"TARGET_COLUMN_CAPTURE_MISSING:S{state_index}")
        if {
            int(column["cell"]) for column in state_row["columns"]
        } != {5, 6}:
            raise QualificationRefused(f"TARGET_COLUMN_CELL_SET_INVALID:S{state_index}")

    return {
        "diagnostics": diagnostics,
        "diagnosticMarkdownSha256": sha256_file(markdown_path),
        "referenceSha256": sha256_file(reference_path),
        "request": request,
        "checkpoint": checkpoint,
        "selectedValue": value,
        "capture": capture,
        "audits": captured,
        "workerHashes": worker_hashes,
        "runtimeArtifact": artifact,
        "enginePath": engine_path,
        "runtimeManifestSha256": diagnostics["runtimeManifestSha256"],
    }


def analytic_column(
    np: Any,
    request: dict[str, Any],
    solver: Any,
    evaluation: dict[str, Any],
    cell: int,
    lam: float,
    coordinate_value: float,
) -> Any:
    # Stable real derivative, unlike 1-tanh(u)**2 near saturation.
    e = math.exp(-2 * abs(float(coordinate_value)))
    derivative = solver.bound * 4 * e / (1 + e) ** 2
    _, xc, xd, *_ = evaluation["details"][cell]
    total = sum(request["continuousFeedMolS"]) + sum(request["dispersedFeedMolS"])
    scale = np.minimum(
        [
            max(c + d, total * 1e-7)
            for c, d in zip(
                request["continuousFeedMolS"], request["dispersedFeedMolS"]
            )
        ],
        1.0,
    )
    factor = lam * 6 * request["operatingHoldup"] / request["d32M"]
    factor *= math.pi * request["columnDiameterM"] ** 2 / 4 * 2 / 7
    result = np.zeros(DIMENSION)
    result[cell * 14 : cell * 14 + 7] = -factor * xc * derivative / scale
    result[cell * 14 + 7 : cell * 14 + 14] = (
        factor * xc * derivative / scale
    )
    result[98 + cell * 13 + 7 : 98 + cell * 13 + 13] = (
        (xc[:6] - xd[:6]) * derivative / solver.scale[:6]
    )
    return result


def finite_vector_hash(validator: Any, values: Any) -> str:
    return validator.digest([float(value) for value in values])


def matrix_hash(validator: Any, matrix: Any) -> str:
    return validator.digest(matrix.tolist())


def gate_metrics(
    np: Any,
    analysis: Any,
    residual_evaluation: dict[str, Any],
    request: dict[str, Any],
    solvers: list[Any],
    state: Any,
) -> tuple[dict[str, Any], dict[str, bool], bool]:
    metric_request = dict(request)
    metric_request["_diagnosticSolvers"] = solvers
    metric_request["_diagnosticState"] = state
    raw = analysis.gate_metrics(np, residual_evaluation, metric_request)
    checks = {
        "rawFvResidualMolS<=1e-7": raw["rawFvResidualMolS"] <= GATE_THRESHOLD,
        "scaledFvResidual<=1e-7": raw["scaledFvResidual"] <= GATE_THRESHOLD,
        # This is the original Job-B gate metric, not a replacement or
        # softened threshold.
        "originalJobBGateResidual<=1e-7": (
            raw["maximumOriginalJobBGateResidual"] <= GATE_THRESHOLD
        ),
        "strictPositiveFlow": raw["minimumFlowMolS"] > 0.0,
    }
    return (
        {
            **raw,
            "originalJobBGateMetric": raw["maximumOriginalJobBGateResidual"],
            "thresholds": {
                "rawFvResidualMolS": GATE_THRESHOLD,
                "scaledFvResidual": GATE_THRESHOLD,
                "maximumOriginalJobBGateResidual": GATE_THRESHOLD,
                "minimumFlowMolS": 0.0,
            },
        },
        checks,
        all(checks.values()),
    )


def residual_record(
    validator: Any,
    np: Any,
    analysis: Any,
    residual: Any,
    request: dict[str, Any],
    solvers: list[Any],
    state: Any,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, bool], bool]:
    if state.size != DIMENSION or not np.all(np.isfinite(state)):
        raise QualificationRefused("TRIAL_STATE_SHAPE_OR_FINITE_INVALID")
    evaluation = residual(state)
    vector = np.asarray(evaluation["residual"], dtype=float)
    if vector.size != DIMENSION or not np.all(np.isfinite(vector)):
        raise QualificationRefused("TRIAL_RESIDUAL_SHAPE_OR_FINITE_INVALID")
    metrics, checks, all_gates = gate_metrics(
        np, analysis, evaluation, request, solvers, state
    )
    record = {
        "stateSha256": finite_vector_hash(validator, state),
        "residualSha256": finite_vector_hash(validator, vector),
        "state": state.tolist(),
        # Full unchanged 189 residual vector for independent checks.
        "residual": vector.tolist(),
        "residualL2": float(np.linalg.norm(vector)),
        "residualInf": float(np.max(np.abs(vector))),
        "metrics": metrics,
        "unchangedGateChecks": checks,
        "allFourResidualThresholdsPassed": all_gates,
    }
    return record, evaluation, checks, all_gates


def correction_limiter(
    np: Any, state: Any, correction: Any, lower: Any, upper: Any
) -> dict[str, Any]:
    ratios: list[tuple[float, int, str]] = []
    for index, change in enumerate(correction):
        if change > 0:
            ratios.append(((upper[index] - state[index]) / change, index, "UPPER"))
        elif change < 0:
            ratios.append(((state[index] - lower[index]) / (-change), index, "LOWER"))
    ratio, index, bound = min(ratios, default=(math.inf, -1, "NONE"))
    return {
        "fullStepAdmissible": bool(
            np.all(state + correction > lower)
            and np.all(state + correction < upper)
        ),
        "maximumInteriorScale": float(ratio),
        "limitingCoordinate": int(index) if index >= 0 else None,
        "limitingBound": bound,
        "limitingDistance": (
            float(upper[index] - state[index])
            if index >= 0 and bound == "UPPER"
            else float(state[index] - lower[index])
            if index >= 0
            else None
        ),
        "limitingCorrection": float(correction[index]) if index >= 0 else None,
    }


def finite_difference_jacobian(
    validator: Any,
    np: Any,
    scipy: Any,
    residual: Any,
    state: Any,
    residual_vector: Any,
    lower: Any,
    upper: Any,
    sparsity_mask: Any,
    color_groups: Any,
    numdiff: tuple[Any, Any],
) -> tuple[Any, dict[str, Any]]:
    compute_absolute_step, adjust_scheme_to_bounds = numdiff
    step = compute_absolute_step(None, state, residual_vector, "3-point")
    step, one_sided = adjust_scheme_to_bounds(
        state, step, 1, "2-sided", lower, upper
    )
    matrix = np.zeros((DIMENSION, DIMENSION))
    probes: list[dict[str, Any]] = []
    group_count = int(np.max(color_groups)) + 1
    for color in range(group_count):
        columns = np.flatnonzero(color_groups == color)
        if columns.size == 0:
            continue
        if any(
            np.any(sparsity_mask[:, column] & sparsity_mask[:, other])
            for offset, column in enumerate(columns)
            for other in columns[offset + 1 :]
        ):
            raise QualificationRefused("SPARSITY_COLOR_SUPPORT_COLLISION")
        central_columns = columns[~one_sided[columns]]
        one_sided_columns = columns[one_sided[columns]]
        probe: dict[str, Any] = {
            "color": color,
            "coordinates": columns.tolist(),
            "centralCoordinates": central_columns.tolist(),
            "oneSidedCoordinates": one_sided_columns.tolist(),
            "absoluteSteps": step[columns].tolist(),
        }
        # A colored pair is shared by central and forward coordinates.  The
        # conservative sparsity coloring above proves that their row supports
        # do not overlap, so the same two evaluations can serve both stencils:
        # central columns use f(x+h), f(x-h); forward columns use f(x+h),
        # f(x+2h) on their disjoint support.
        plus = state.copy()
        minus = state.copy()
        plus[central_columns] += step[central_columns]
        minus[central_columns] -= step[central_columns]
        minus[one_sided_columns] = (
            state[one_sided_columns] + step[one_sided_columns]
        )
        plus[one_sided_columns] = (
            state[one_sided_columns] + 2 * step[one_sided_columns]
        )
        if not (
            np.all(plus >= lower)
            and np.all(plus <= upper)
            and np.all(minus >= lower)
            and np.all(minus <= upper)
        ):
            raise QualificationRefused("FINITE_DIFFERENCE_PROBE_OUTSIDE_BOUNDS")
        plus_vector = np.asarray(residual(plus)["residual"], dtype=float)
        minus_vector = np.asarray(residual(minus)["residual"], dtype=float)
        if central_columns.size:
            for column in central_columns:
                denominator = plus[column] - minus[column]
                if denominator == 0.0:
                    raise QualificationRefused(
                        "FINITE_DIFFERENCE_ZERO_CENTRAL_DENOMINATOR"
                    )
                derivative = (plus_vector - minus_vector) / denominator
                matrix[:, column] = np.where(
                    sparsity_mask[:, column], derivative, 0.0
                )
            probe.update(
                {
                    "centralPlusStateSha256": finite_vector_hash(
                        validator, plus
                    ),
                    "centralMinusStateSha256": finite_vector_hash(
                        validator, minus
                    ),
                    "centralPlusResidualSha256": finite_vector_hash(
                        validator, plus_vector
                    ),
                    "centralMinusResidualSha256": finite_vector_hash(
                        validator, minus_vector
                    ),
                }
            )
        if one_sided_columns.size:
            # SciPy's bound-adjusted 3-point one-sided stencil is
            # (-3*f(x) + 4*f(x+h) - f(x+2h)) / (2*h).  Do not replace it
            # with the two-point secant between x+h and x+2h.
            for column in one_sided_columns:
                # Use the realized floating-point displacement, exactly as
                # SciPy's sparse implementation does (x2 - x0), rather than
                # reconstructing it as 2*h.
                denominator = plus[column] - state[column]
                if denominator == 0.0:
                    raise QualificationRefused(
                        "FINITE_DIFFERENCE_ZERO_ONE_SIDED_DENOMINATOR"
                    )
                derivative = (
                    -3.0 * residual_vector
                    + 4.0 * minus_vector
                    - plus_vector
                ) / denominator
                matrix[:, column] = np.where(
                    sparsity_mask[:, column], derivative, 0.0
                )
            probe.update(
                {
                    "oneSidedFirstStateSha256": finite_vector_hash(
                        validator, minus
                    ),
                    "oneSidedSecondStateSha256": finite_vector_hash(
                        validator, plus
                    ),
                    "oneSidedFirstResidualSha256": finite_vector_hash(
                        validator, minus_vector
                    ),
                    "oneSidedSecondResidualSha256": finite_vector_hash(
                        validator, plus_vector
                    ),
                    "oneSidedStencil": "(-3*f0+4*f1-f2)/(2*h)",
                }
            )
        probes.append(probe)
    if not np.all(np.isfinite(matrix)):
        raise QualificationRefused("FINITE_DIFFERENCE_MATRIX_NONFINITE")
    return matrix, {
        "method": "PINNED_SCIPY_3_POINT_COLOURED_CENTRAL_OR_BOUND_ADJUSTED",
        "colorCount": group_count,
        "probeCount": len(probes) * 2,
        "probes": probes,
        "jacobianSha256": matrix_hash(validator, matrix),
        "stepSha256": finite_vector_hash(validator, step),
        "oneSidedCoordinates": np.flatnonzero(one_sided).tolist(),
    }


def bounded_linear_direction(
    np: Any,
    scipy: Any,
    matrix: Any,
    residual_vector: Any,
    state: Any,
    lower: Any,
    upper: Any,
    variable_scale: Any,
) -> tuple[Any, dict[str, Any]]:
    from scipy.optimize import lsq_linear

    scaled_matrix = matrix * variable_scale[None, :]
    lower_scaled = 0.99 * (lower - state) / variable_scale
    upper_scaled = 0.99 * (upper - state) / variable_scale
    fit = lsq_linear(
        scaled_matrix,
        -residual_vector,
        bounds=(lower_scaled, upper_scaled),
        method="bvls",
        tol=LINEAR_SUBPROBLEM_TOLERANCE,
        max_iter=LINEAR_SUBPROBLEM_MAX_ITERATIONS,
    )
    correction = variable_scale * fit.x
    if not bool(np.all(np.isfinite(correction))):
        raise QualificationRefused("BOUNDED_LINEAR_CORRECTION_NONFINITE")
    return correction, {
        "success": bool(fit.success),
        "status": int(fit.status),
        "iterations": int(fit.nit),
        "optimality": float(fit.optimality),
        "cost": float(fit.cost),
        "activeMask": np_to_list(fit.active_mask),
        "linearSubproblemBounds": {
            "lowerScale": lower_scaled.tolist(),
            "upperScale": upper_scaled.tolist(),
        },
    }


def np_to_list(values: Any) -> list[Any]:
    return [int(value) for value in values]


def target_column_comparison(
    validator: Any,
    np: Any,
    request: dict[str, Any],
    candidate_module: Any,
    engine: Any,
    residual_evaluation: dict[str, Any],
    state_row: dict[str, Any],
    captured_matrix: Any,
    lam: float,
) -> dict[str, Any]:
    solvers = [
        candidate_module.CandidateInterfaceSolver(
            engine,
            request["temperatureK"],
            request["kc"],
            request["kd"],
            request["continuousTotalConcentrationMolM3"],
            request["dispersedTotalConcentrationMolM3"],
            request["phaseConfiguration"],
        )
        for _ in range(int(request["compartments"]))
    ]
    rows: list[dict[str, Any]] = []
    for target_cell in TARGET_CELLS:
        coordinate = 98 + target_cell * 13 + 12
        coordinate_value = float(state_row["_state"][coordinate])
        analytic = analytic_column(
            np,
            request,
            solvers[target_cell],
            residual_evaluation,
            target_cell,
            lam,
            coordinate_value,
        )
        captured_column = np.asarray(captured_matrix[:, coordinate], dtype=float)
        recorded = next(
            column
            for column in state_row["columns"]
            if int(column["cell"]) == target_cell + 1
        )
        if not np.array_equal(
            analytic, np.asarray(recorded["analyticColumn"], dtype=float)
        ):
            raise QualificationRefused(
                f"ANALYTIC_TARGET_COLUMN_REPLAY_MISMATCH:CELL_{target_cell + 1}"
            )
        if not np.array_equal(
            captured_column, np.asarray(recorded["capturedColumn"], dtype=float)
        ):
            raise QualificationRefused(
                f"CAPTURED_TARGET_COLUMN_REPLAY_MISMATCH:CELL_{target_cell + 1}"
            )
        rows.append(
            {
                "cell": target_cell + 1,
                "coordinate": coordinate,
                "coordinateValue": coordinate_value,
                "capturedColumnSha256": matrix_hash(
                    validator, captured_column.reshape(DIMENSION, 1)
                ),
                "analyticColumnSha256": matrix_hash(
                    validator, analytic.reshape(DIMENSION, 1)
                ),
                "capturedL2": float(np.linalg.norm(captured_column)),
                "analyticL2": float(np.linalg.norm(analytic)),
                "capturedVsAnalyticL2": float(
                    np.linalg.norm(captured_column - analytic)
                ),
            }
        )
    state_row.pop("_state", None)
    return {"columns": rows, "solvers": solvers}


def qualify_method(
    validator: Any,
    analysis: Any,
    np: Any,
    scipy: Any,
    request: dict[str, Any],
    residual: Any,
    candidate_module: Any,
    engine: Any,
    initial_state: Any,
    captured_matrix: Any,
    lower: Any,
    upper: Any,
    variable_scale: Any,
    sparsity_mask: Any,
    color_groups: Any,
    numdiff: tuple[Any, Any],
    method: str,
    lam: float,
    initial_state_row: dict[str, Any],
) -> dict[str, Any]:
    current_state = initial_state.copy()
    current_record, current_evaluation, _, _ = residual_record(
        validator, np, analysis, residual, request, [
            candidate_module.CandidateInterfaceSolver(
                engine,
                request["temperatureK"],
                request["kc"],
                request["kd"],
                request["continuousTotalConcentrationMolM3"],
                request["dispersedTotalConcentrationMolM3"],
                request["phaseConfiguration"],
            )
            for _ in range(int(request["compartments"]))
        ], current_state
    )
    initial_l2 = current_record["residualL2"]
    iterations: list[dict[str, Any]] = []
    accepted_states: list[dict[str, Any]] = []
    for correction_index in range(1, MAX_CORRECTIONS + 1):
        current_vector = np.asarray(current_record["residual"], dtype=float)
        if correction_index == 1:
            raw_matrix = captured_matrix.copy()
            refresh = {
                "source": "CAPTURED_DIAGNOSTIC_JACOBIAN",
                "jacobianSha256": matrix_hash(validator, raw_matrix),
                "probeCount": 0,
            }
        else:
            raw_matrix, refresh = finite_difference_jacobian(
                validator,
                np,
                scipy,
                residual,
                current_state,
                current_vector,
                lower,
                upper,
                sparsity_mask,
                color_groups,
                numdiff,
            )
            refresh["source"] = "REFRESHED_FINITE_DIFFERENCE_AT_MOVED_STATE"

        matrix = raw_matrix.copy()
        replacement_rows: list[dict[str, Any]] = []
        solvers = [
            candidate_module.CandidateInterfaceSolver(
                engine,
                request["temperatureK"],
                request["kc"],
                request["kd"],
                request["continuousTotalConcentrationMolM3"],
                request["dispersedTotalConcentrationMolM3"],
                request["phaseConfiguration"],
            )
            for _ in range(int(request["compartments"]))
        ]
        if method == "ANALYTIC_CELLS_5_6":
            for target_cell in TARGET_CELLS:
                coordinate = 98 + target_cell * 13 + 12
                analytic = analytic_column(
                    np,
                    request,
                    solvers[target_cell],
                    current_evaluation,
                    target_cell,
                    lam,
                    float(current_state[coordinate]),
                )
                matrix[:, coordinate] = analytic
                replacement_rows.append(
                    {
                        "cell": target_cell + 1,
                        "coordinate": coordinate,
                        "analyticColumnSha256": matrix_hash(
                            validator, analytic.reshape(DIMENSION, 1)
                        ),
                        "analyticColumnL2": float(np.linalg.norm(analytic)),
                    }
                )
            refresh["source"] += "_WITH_ANALYTIC_CELLS_5_6_REPLACEMENT"
        refresh["matrixSha256"] = matrix_hash(validator, matrix)
        correction, fit = bounded_linear_direction(
            np,
            scipy,
            matrix,
            current_vector,
            current_state,
            lower,
            upper,
            variable_scale,
        )
        limiter = correction_limiter(
            np, current_state, correction, lower, upper
        )
        maximum_scale = limiter["maximumInteriorScale"]
        trust_scale = (
            min(1.0, 0.99 * maximum_scale)
            if math.isfinite(maximum_scale)
            else 1.0
        )
        if trust_scale <= 0.0:
            raise QualificationRefused("NONPOSITIVE_TRUST_REGION_SCALE")
        trials: list[dict[str, Any]] = []
        accepted = False
        accepted_state = None
        accepted_evaluation = None
        accepted_record = None
        base_l2 = float(current_record["residualL2"])
        for backtrack_index in range(MAX_BACKTRACKS):
            trial_scale = trust_scale * BACKTRACK_FACTOR**backtrack_index
            trial_state = current_state + trial_scale * correction
            if not np.all((trial_state > lower) & (trial_state < upper)):
                raise QualificationRefused("TRIAL_OUTSIDE_STRICT_CAPTURED_BOUNDS")
            trial_record, trial_evaluation, checks, all_gates = residual_record(
                validator, np, analysis, residual, request, solvers, trial_state
            )
            predicted = current_vector + trial_scale * (matrix @ correction)
            predicted_l2 = float(np.linalg.norm(predicted))
            actual_decrease = base_l2 - trial_record["residualL2"]
            predicted_decrease = base_l2 - predicted_l2
            ratio = (
                actual_decrease / predicted_decrease
                if predicted_decrease != 0.0
                else None
            )
            true_decrease = (
                trial_record["residualL2"]
                < base_l2 * (1.0 - LINE_SEARCH_DECREASE_RELATIVE_TOLERANCE)
            )
            # Acceptance is based on the unchanged nonlinear residual only.
            # Gate values are always evaluated and reported; they are not
            # replaced by the linear prediction or a relaxed criterion.
            trial_accepted = bool(true_decrease and checks["strictPositiveFlow"])
            trial_record.update(
                {
                    "correctionIndex": correction_index,
                    "backtrackIndex": backtrack_index,
                    "trialScale": float(trial_scale),
                    "correctionSha256": finite_vector_hash(validator, correction),
                    "predictedResidualL2": predicted_l2,
                    "trueResidualDecrease": float(actual_decrease),
                    "predictedResidualDecrease": float(predicted_decrease),
                    "actualToPredictedDecreaseRatio": ratio,
                    "trueResidualDecreaseDecision": true_decrease,
                    "accepted": trial_accepted,
                    "allFourResidualThresholdsPassed": all_gates,
                }
            )
            trials.append(trial_record)
            if trial_accepted:
                accepted = True
                accepted_state = trial_state
                accepted_evaluation = trial_evaluation
                accepted_record = trial_record
                break
        iteration = {
            "correctionIndex": correction_index,
            "startingStateSha256": current_record["stateSha256"],
            "startingResidualL2": base_l2,
            "startingMetrics": current_record["metrics"],
            "jacobian": refresh,
            "replacementColumns": replacement_rows,
            "boundedLinearSubproblem": fit,
            "correctionSha256": finite_vector_hash(validator, correction),
            "correction": correction.tolist(),
            "correctionL2": float(np.linalg.norm(correction)),
            "limiter": limiter,
            "trustRegionScale": float(trust_scale),
            "trials": trials,
            "accepted": accepted,
            "terminationReason": (
                "TRUE_RESIDUAL_DECREASE_ACCEPTED"
                if accepted
                else "NO_TRUE_RESIDUAL_DECREASE_WITHIN_FIXED_BACKTRACK_BUDGET"
            ),
        }
        iterations.append(iteration)
        if not accepted:
            break
        current_state = accepted_state
        current_evaluation = accepted_evaluation
        current_record = accepted_record
        accepted_states.append(accepted_record)

    final_record = current_record
    return {
        "method": method,
        "initialStateSha256": finite_vector_hash(validator, initial_state),
        "initialResidualL2": float(initial_l2),
        "iterations": iterations,
        "acceptedStateCount": len(accepted_states),
        "final": final_record,
        "localThresholdCandidate": bool(
            any(
                trial["allFourResidualThresholdsPassed"]
                for iteration in iterations
                for trial in iteration["trials"]
            )
        ),
        "candidateClassification": (
            "LOCAL_THRESHOLD_CANDIDATE_ONLY"
            if any(
                trial["allFourResidualThresholdsPassed"]
                for iteration in iterations
                for trial in iteration["trials"]
            )
            else "NO_LOCAL_THRESHOLD_CANDIDATE"
        ),
        "reproductionStatus": "NOT_ASSESSED",
        "stabilityStatus": "NOT_ASSESSED",
        "designStatus": "NOT_ASSESSED",
        "productionPromotion": "NOT_RECOMMENDED",
    }


def markdown_report(report: dict[str, Any]) -> str:
    summary_rows = report["summary"]["stateMethodResults"]
    lines = [
        "# Job C bound-aware correction qualification — offline only",
        "",
        "## Recommendation",
        "",
        "**Do not promote a production patch or restart Job C.** The bounded "
        "nonlinear experiment is diagnostic-only. A local threshold candidate "
        "does not establish independent-start reproduction, local stability, "
        "continuation-range acceptance, or design acceptance.",
        "",
        "True unchanged 189-residual L2 decrease plus strict positivity decide "
        "intermediate line-search acceptance. The four unchanged gate checks "
        "classify a local threshold candidate; they never soften an "
        "intermediate step. Linear predictions are recorded only for "
        "comparison.",
        "",
        "## Measured results",
        "",
        "| state | matrix | accepted corrections | final residual L2 | final raw FV | "
        "final scaled FV | final original Job-B metric | all four gates | "
        "classification |",
        "|---|---|---:|---:|---:|---:|---:|---|---|",
    ]
    for row in summary_rows:
        lines.append(
            "| {state} | {method} | {accepted} | {l2:.6g} | {raw:.6g} | "
            "{scaled:.6g} | {jobb:.6g} | {gates} | {classification} |".format(
                state=row["state"],
                method=row["method"],
                accepted=row["acceptedCorrections"],
                l2=row["finalResidualL2"],
                raw=row["finalMetrics"]["rawFvResidualMolS"],
                scaled=row["finalMetrics"]["scaledFvResidual"],
                jobb=row["finalMetrics"]["maximumOriginalJobBGateResidual"],
                gates="PASS" if row["finalAllFourGates"] else "FAIL",
                classification=row["classification"],
            )
        )
    lines.extend(
        [
            "",
            "## Controls and limits",
            "",
            f"- States are the three captured sequential linearizations S0/S1/S2, "
            f"not independent starts. λ={report['physics']['lambda']!r}, H=2 m, "
            "seven compartments, all 189 equations, captured bounds/scales, "
            "unchanged physics, and unchanged gate thresholds were retained.",
            f"- Fixed diagnostic budget: at most {MAX_CORRECTIONS} sequential "
            f"corrections and {MAX_BACKTRACKS} true-residual trials per "
            "correction; fresh sparse-coloured FD is computed after accepted "
            "moves.",
            "- Intermediate line-search acceptance uses true residual L2 "
            "decrease plus strict positivity. Local-candidate classification "
            "requires all four unchanged checks, including the original "
            "Job-B metric `maximumOriginalJobBGateResidual <= 1e-7`; no gate "
            "is softened.",
            "- Full attempted states and 189-entry residual vectors are in the "
            "JSON. Hashes bind request/checkpoint, worker sources, pinned "
            "runtime, matrices, states, residuals, and trials.",
            "- Independent-start reproduction, stability, production solver "
            "behavior, continuation range, and design qualification were not "
            "tested by design.",
            "",
            "## Exact reproducer",
            "",
            "From the workspace root, with the pinned numerical stack and "
            "single-threaded BLAS:",
            "",
            "```sh",
            "OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 "
            "NUMEXPR_NUM_THREADS=1 PYTHONDONTWRITEBYTECODE=1 \\",
            "python3 scripts/qualify-job-c-bound-aware.py \\",
            "  --diagnostics research-results/job-c-flux-column-diagnostics.json \\",
            "  --diagnostic-markdown research-results/job-c-flux-column-diagnostics.md \\",
            "  --checkpoint research-results/job-c-flux-column-evidence/checkpoint.json \\",
            "  --request research-results/job-c-flux-column-evidence/request.json \\",
            "  --runtime-root . \\",
            "  --runtime-artifact-root dist/predictive-nt-runtime-7c-1-5 \\",
            "  --id coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08 \\",
            "  --output research-results/job-c-bound-aware-qualification.json",
            "```",
            "",
            "## Integrity and reproducibility",
            "",
            f"- Report hash: `{report['reportSha256']}`",
            f"- Capture hash: `{report['lineage']['captureSha256']}`",
            f"- Request file hash: `{report['lineage']['requestFileSha256']}`",
            f"- Checkpoint file hash: `{report['lineage']['checkpointFileSha256']}`",
            f"- Pinned runtime manifest hash: "
            f"`{report['lineage']['runtimeManifestSha256']}`",
            f"- Qualification script hash: "
            f"`{report['lineage']['qualificationScriptSha256']}`",
            "",
            "No worker execution, Job C start/restart, workflow restart, "
            "database access, or production edit was performed.",
            "",
        ]
    )
    return "\n".join(lines)


def run(args: argparse.Namespace) -> dict[str, Any]:
    analysis = load_module(
        "job_c_rejection_analysis_for_qualification",
        Path(__file__).with_name("analyze-job-c-rejection.py"),
    )
    validator = load_module(
        "job_c_replay_validator_for_qualification",
        Path(__file__).with_name("replay-job-c-rejection.py"),
    )
    evidence = validate_integrity(args, validator)
    artifact = evidence["runtimeArtifact"]
    vendor = artifact / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
    if not vendor.is_dir():
        raise QualificationRefused("PINNED_VENDOR_RUNTIME_UNAVAILABLE")
    sys.path.insert(0, str(vendor))
    import numpy as np
    import scipy
    from scipy.optimize._numdiff import (
        _adjust_scheme_to_bounds,
        _compute_absolute_step,
        group_columns,
    )

    engine_module = load_module("job_c_pinned_engine_for_qualification", evidence["enginePath"])
    candidate_path = (
        Path(args.runtime_root).resolve()
        / "server/ecr-pre-pilot/job-c/candidate_interface.py"
    )
    candidate_module = load_module(
        "job_c_candidate_interface_for_qualification", candidate_path
    )
    helper = pure_sparsity_helper(
        Path(args.runtime_root).resolve()
        / "server/ecr-pre-pilot/job-c/worker.py"
    )
    sparsity_mask = helper(scipy, 7).toarray().astype(bool)
    if sparsity_mask.shape != (DIMENSION, DIMENSION):
        raise QualificationRefused("CAPTURED_SPARSITY_DIMENSION_INVALID")
    color_groups = group_columns(scipy.sparse.csr_matrix(sparsity_mask))
    if np.any(color_groups < 0):
        raise QualificationRefused("CAPTURED_SPARSITY_COLORING_INVALID")

    request = evidence["request"]
    selected_value = evidence["selectedValue"]
    lam = float(selected_value["rejectedLambda"])
    temporary, engine, _integrity, runtime_info = engine_module.build_engine(
        request["temperatureK"], 0.0
    )
    try:
        expected_runtime = evidence["diagnostics"].get("runtime")
        for key in ("vendorDirectory", "numpy", "scipy"):
            if expected_runtime.get(key) != runtime_info.get(key):
                raise QualificationRefused(f"PINNED_RUNTIME_VERSION_MISMATCH:{key}")
        residual = analysis.exact_residual_factory(
            np, engine, candidate_module, request, lam
        )
        unique_audits = evidence["audits"]
        state_rows = evidence["diagnostics"]["states"]
        audit_by_hash = {audit["stateSha256"]: audit for audit in unique_audits}

        state_results: list[dict[str, Any]] = []
        summary_rows: list[dict[str, Any]] = []
        for state_index, state_row in enumerate(state_rows):
            state_label = f"S{state_index}"
            audit = audit_by_hash[state_row["stateSha256"]]
            state = np.asarray(audit["state"], dtype=float)
            captured_residual = np.asarray(audit["residual"], dtype=float)
            lower = np.asarray(audit["lowerBounds"], dtype=float)
            upper = np.asarray(audit["upperBounds"], dtype=float)
            variable_scale = np.asarray(audit["variableScale"], dtype=float)
            evaluation = residual(state)
            exact_residual = np.asarray(evaluation["residual"], dtype=float)
            if not np.array_equal(exact_residual, captured_residual):
                raise QualificationRefused(f"RESIDUAL_REPLAY_NOT_EXACT:{state_label}")
            if not np.all((state >= lower) & (state <= upper)):
                raise QualificationRefused(f"CAPTURED_STATE_OUTSIDE_BOUNDS:{state_label}")

            refreshed_at_capture, refresh_verification = finite_difference_jacobian(
                validator,
                np,
                scipy,
                residual,
                state,
                exact_residual,
                lower,
                upper,
                sparsity_mask,
                color_groups,
                (_compute_absolute_step, _adjust_scheme_to_bounds),
            )
            captured_matrix_for_refresh = np.asarray(
                audit["jacobian"], dtype=float
            )
            refresh_matches = np.array_equal(
                refreshed_at_capture, captured_matrix_for_refresh
            )
            refresh_max_error = float(
                np.max(np.abs(refreshed_at_capture - captured_matrix_for_refresh))
            )
            if not refresh_matches:
                raise QualificationRefused(
                    f"CAPTURED_STATE_FINITE_DIFFERENCE_REPLAY_MISMATCH:{state_label}"
                )
            refresh_verification.update(
                {
                    "source": "REFRESHED_FINITE_DIFFERENCE_AT_CAPTURED_STATE",
                    "matchesCapturedJacobian": refresh_matches,
                    "maxAbsoluteDifferenceFromCaptured": refresh_max_error,
                    "capturedJacobianSha256": audit["jacobianSha256"],
                }
            )

            # Verify the two target columns using the same unchanged local
            # candidate equations before any correction is attempted.
            comparison_seed = dict(state_row)
            comparison_seed["_state"] = state
            comparison = target_column_comparison(
                validator,
                np,
                request,
                candidate_module,
                engine,
                evaluation,
                comparison_seed,
                captured_matrix=np.asarray(audit["jacobian"], dtype=float),
                lam=lam,
            )
            methods: list[dict[str, Any]] = []
            for method in ("CAPTURED_FD", "ANALYTIC_CELLS_5_6"):
                result = qualify_method(
                    validator,
                    analysis,
                    np,
                    scipy,
                    request,
                    residual,
                    candidate_module,
                    engine,
                    state,
                    np.asarray(audit["jacobian"], dtype=float),
                    lower,
                    upper,
                    variable_scale,
                    sparsity_mask,
                    color_groups,
                    (_compute_absolute_step, _adjust_scheme_to_bounds),
                    method,
                    lam,
                    state_row,
                )
                methods.append(result)
                final = result["final"]
                summary_rows.append(
                    {
                        "state": state_label,
                        "method": method,
                        "acceptedCorrections": result["acceptedStateCount"],
                        "finalResidualL2": final["residualL2"],
                        "finalMetrics": final["metrics"],
                        "finalAllFourGates": final[
                            "allFourResidualThresholdsPassed"
                        ],
                        "classification": result["candidateClassification"],
                    }
                )
            state_results.append(
                {
                    "state": state_label,
                    "stateSha256": state_row["stateSha256"],
                    "capturedResidualSha256": audit["residualSha256"],
                    "capturedJacobianSha256": audit["jacobianSha256"],
                    "baseResidualL2": float(np.linalg.norm(captured_residual)),
                    "baseResidualInf": float(np.max(np.abs(captured_residual))),
                    "capturedStateRefreshVerification": refresh_verification,
                    "targetColumnComparison": comparison["columns"],
                    "methods": methods,
                }
            )
    finally:
        temporary.cleanup()

    candidate_count = sum(
        int(method["localThresholdCandidate"])
        for state in state_results
        for method in state["methods"]
    )
    report = {
        "schemaVersion": "JOB_C_BOUND_AWARE_QUALIFICATION_V1",
        "diagnosticOnly": True,
        "selectionId": args.selection_id,
        "noWorkerOrContinuationInvoked": True,
        "noDatabaseAccess": True,
        "noProductionModification": True,
        "lineage": {
            "captureSha256": evidence["capture"]["captureSha256"],
            "selectedStateSha256": selected_value["stateSha256"],
            "requestSha256": evidence["capture"]["requestSha256"],
            "requestFileSha256": sha256_file(Path(args.request).resolve()),
            "checkpointFileSha256": sha256_file(Path(args.checkpoint).resolve()),
            "diagnosticsFileSha256": sha256_file(Path(args.diagnostics).resolve()),
            "diagnosticsMarkdownSha256": evidence["diagnosticMarkdownSha256"],
            "referenceSha256": evidence["referenceSha256"],
            "workerFilesSha256": evidence["workerHashes"],
            "scientificEngineSha256": sha256_file(evidence["enginePath"]),
            "runtimeManifestSha256": evidence["runtimeManifestSha256"],
            "qualificationScriptSha256": sha256_file(Path(__file__).resolve()),
            "pinnedRuntime": runtime_info,
            "sparsityHelperSourceSha256": sha256_file(
                Path(args.runtime_root).resolve()
                / "server/ecr-pre-pilot/job-c/worker.py"
            ),
        },
        "physics": {
            "lambda": lam,
            "heightM": selected_value["heightM"],
            "compartments": request["compartments"],
            "columnDiameterM": request["columnDiameterM"],
            "operatingHoldup": request["operatingHoldup"],
            "d32M": request["d32M"],
            "phaseConfiguration": request["phaseConfiguration"],
            "equationDimension": DIMENSION,
            "equationsAndPhysics": "UNCHANGED_EXACT_RESIDUAL_FACTORY",
        },
        "boundsScalesAndGates": {
            "source": "CAPTURED_DIAGNOSTIC_LINEARIZATIONS",
            "unchangedBoundsAndVariableScales": True,
            "gateThresholds": {
                "rawFvResidualMolS": "<=1e-7",
                "scaledFvResidual": "<=1e-7",
                "maximumOriginalJobBGateResidual": "<=1e-7",
                "minimumFlowMolS": ">0",
            },
            "originalJobBGateMetric": "maximumOriginalJobBGateResidual",
            "gatesSoftened": False,
        },
        "budgets": {
            "maximumSequentialCorrections": MAX_CORRECTIONS,
            "maximumTrueResidualTrialsPerCorrection": MAX_BACKTRACKS,
            "backtrackFactor": BACKTRACK_FACTOR,
            "linearSubproblemTolerance": LINEAR_SUBPROBLEM_TOLERANCE,
            "linearSubproblemMaximumIterations": LINEAR_SUBPROBLEM_MAX_ITERATIONS,
            "budgetInterpretation": "DIAGNOSTIC_ITERATIONS_NOT_PRODUCTION_DEADLINE",
            "finiteDifferenceRefresh": "AFTER_EVERY_ACCEPTED_MOVED_STATE",
        },
        "algorithm": {
            "methods": [
                "CAPTURED_FD",
                "ANALYTIC_CELLS_5_6",
            ],
            "boundedDirection": (
                "BVLS_ON_UNCHANGED_189_BY_189_MATRIX_WITH_CAPTURED_SCALES;"
                "BOX_SHRUNK_TO_99_PERCENT_ONLY_FOR_STRICT_INTERIOR_DIAGNOSTIC_TRIALS"
            ),
            "stepControl": (
                "TRUE_UNCHANGED_RESIDUAL_L2_LINE_SEARCH;"
                "LINEAR_PREDICTIONS_NEVER_DECIDE_ACCEPTANCE"
            ),
            "finiteDifferenceRefresh": (
                "PINNED_SCIPY_3_POINT_WITH_CAPTURED_SPARSE_COLORING_AND_"
                "BOUND_ADJUSTMENT"
            ),
            "intermediateAcceptance": (
                "TRUE_189_RESIDUAL_L2_DECREASE_AND_STRICT_POSITIVITY"
            ),
            "localCandidateClassification": (
                "ALL_FOUR_UNCHANGED_GATE_CHECKS;ORIGINAL_JOB_B_METRIC_EXPLICIT"
            ),
        },
        "states": state_results,
        "summary": {
            "stateMethodResults": summary_rows,
            "localThresholdCandidateCount": candidate_count,
            "independentStartReproduction": "NOT_ASSESSED",
            "localStability": "NOT_ASSESSED",
            "continuationRange": "NOT_ASSESSED",
            "designAcceptance": "NOT_ASSESSED",
        },
        "recommendation": (
            "DO_NOT_PROMOTE_OR_PATCH; "
            "S0_LOCAL_THRESHOLD_CANDIDATE_REMAINS_DIAGNOSTIC_ONLY; "
            "S1_S2_AND_ALL_REPRODUCTION_STABILITY_DESIGN_CLAIMS_REQUIRE_"
            "SEPARATE_QUALIFICATION"
        ),
    }
    report["reportSha256"] = validator.digest(report)
    return report


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Offline bound-aware Job-C qualification; no worker execution."
    )
    result.add_argument(
        "--diagnostics",
        default="research-results/job-c-flux-column-diagnostics.json",
    )
    result.add_argument(
        "--diagnostic-markdown",
        default="research-results/job-c-flux-column-diagnostics.md",
    )
    result.add_argument(
        "--checkpoint",
        default="research-results/job-c-flux-column-evidence/checkpoint.json",
    )
    result.add_argument(
        "--request",
        default="research-results/job-c-flux-column-evidence/request.json",
    )
    result.add_argument("--runtime-root", default=".")
    result.add_argument(
        "--runtime-artifact-root", default="dist/predictive-nt-runtime-7c-1-5"
    )
    result.add_argument(
        "--id",
        dest="selection_id",
        default="coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08",
    )
    result.add_argument(
        "--output",
        default="research-results/job-c-bound-aware-qualification.json",
    )
    result.add_argument("--markdown-output", default=None)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        report = run(args)
        output = Path(args.output)
        output.write_text(
            json.dumps(report, sort_keys=True, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        markdown_output = (
            Path(args.markdown_output)
            if args.markdown_output
            else output.with_suffix(".md")
        )
        markdown_output.write_text(markdown_report(report), encoding="utf-8")
        print(
            json.dumps(
                {
                    "output": str(output.resolve()),
                    "markdownOutput": str(markdown_output.resolve()),
                    "reportSha256": report["reportSha256"],
                    "localThresholdCandidateCount": report["summary"][
                        "localThresholdCandidateCount"
                    ],
                },
                sort_keys=True,
            )
        )
        return 0
    except (
        QualificationRefused,
        OSError,
        UnicodeError,
        ImportError,
        RuntimeError,
        ValueError,
    ) as exc:
        print(f"QUALIFICATION_REFUSED:{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())