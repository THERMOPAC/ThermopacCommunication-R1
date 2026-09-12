#!/usr/bin/env python3
"""Offline, diagnostic-only analysis of one preserved Job-C rejection.

This utility deliberately does not import or execute the Job-C worker.  It
reads the immutable request/checkpoint, replays only arithmetic on captured
linearizations, and (when the pinned scientific runtime is available) loads
the candidate interface class plus the thermodynamic engine directly to
evaluate the unchanged residual closure.  No case, continuation, optimizer,
or gate is invoked.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
from typing import Any


COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
FLOW_COUNT = 98
INTERFACE_UNKNOWN_COUNT = 13
DIMENSION = 189
WORKER_RELATIVE_PATHS = (
    "server/ecr-pre-pilot/job-c/worker.py",
    "server/ecr-pre-pilot/job-c/candidate_interface.py",
    "server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py",
    "server/ecr-pre-pilot/job-c/branch_continuation.py",
)


class DiagnosticRefused(ValueError):
    """A fail-closed diagnostic refusal."""


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path, label: str) -> Any:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DiagnosticRefused(f"{label}_READ_OR_JSON_FAILED:{exc}") from exc
    if not isinstance(value, dict):
        raise DiagnosticRefused(f"{label}_OBJECT_REQUIRED")
    return value


def selected_value(checkpoint: dict[str, Any], selection_id: str) -> dict[str, Any]:
    rows = checkpoint.get("completedResults")
    if not isinstance(rows, list):
        raise DiagnosticRefused("CHECKPOINT_COMPLETED_RESULTS_MISSING")
    matches = [
        row for row in rows
        if isinstance(row, dict) and row.get("id") == selection_id
    ]
    if len(matches) != 1:
        raise DiagnosticRefused("SELECTED_TRIAL_ID_NOT_UNIQUE")
    value = matches[0].get("value")
    if matches[0].get("kind") != "REJECTED_COUPLED_CONTINUATION_TRIAL":
        raise DiagnosticRefused("SELECTED_RESULT_NOT_REJECTED_COUPLED_TRIAL")
    if not isinstance(value, dict):
        raise DiagnosticRefused("SELECTED_RESULT_VALUE_MISSING")
    return value


def label(index: int) -> dict[str, Any]:
    if index < FLOW_COUNT:
        phase = "continuous" if index < 49 else "dispersed"
        local = index if index < 49 else index - 49
        return {
            "phase": phase,
            "numericalCell": local // 7 + 1,
            "component": COMPONENTS[local % 7],
        }
    local = index - FLOW_COUNT
    unknown = local % INTERFACE_UNKNOWN_COUNT
    names = (
        "xc_logit_1", "xc_logit_2", "xc_logit_3", "xc_logit_4",
        "xc_logit_5", "xc_logit_6", "xd_logit_1", "xd_logit_2",
        "xd_logit_3", "xd_logit_4", "xd_logit_5", "xd_logit_6",
        "total_flux_tanh",
    )
    return {
        "phase": "interface",
        "numericalCell": local // INTERFACE_UNKNOWN_COUNT + 1,
        "interfaceUnknownIndex": unknown,
        "interfaceUnknown": names[unknown],
    }


def finite_norm(np: Any, values: Any) -> float:
    vector = np.asarray(values, dtype=float).reshape(-1)
    if not np.all(np.isfinite(vector)):
        raise DiagnosticRefused("NONFINITE_DIAGNOSTIC_VECTOR")
    return float(np.linalg.norm(vector))


def ruiz_correction(np: Any, matrix: Any, residual: Any, variable_scale: Any):
    """Exact copy of the worker's diagnostic Ruiz/SVD arithmetic."""

    jac = np.asarray(matrix, dtype=float)
    fun = np.asarray(residual, dtype=float).reshape(-1)
    initial = np.asarray(variable_scale, dtype=float).reshape(-1)
    row_scale = np.ones(jac.shape[0], dtype=float)
    column_scale = initial.copy()
    equilibrated = jac * column_scale[None, :]
    rhs = -fun.copy()
    for _ in range(4):
        row_norm = np.linalg.norm(equilibrated, axis=1)
        row_adjust = np.ones_like(row_norm)
        nonzero = np.isfinite(row_norm) & (row_norm > 0)
        row_adjust[nonzero] = np.clip(
            1.0 / np.sqrt(row_norm[nonzero]), 1e-8, 1e8
        )
        equilibrated = row_adjust[:, None] * equilibrated
        rhs = row_adjust * rhs
        row_scale *= row_adjust
        column_norm = np.linalg.norm(equilibrated, axis=0)
        column_adjust = np.ones_like(column_norm)
        nonzero = np.isfinite(column_norm) & (column_norm > 0)
        column_adjust[nonzero] = np.clip(
            1.0 / np.sqrt(column_norm[nonzero]), 1e-8, 1e8
        )
        equilibrated = equilibrated * column_adjust[None, :]
        column_scale *= column_adjust
    original_singular = np.linalg.svd(jac, compute_uv=False)
    left, singular, right_t = np.linalg.svd(equilibrated, full_matrices=False)
    cutoff = max(equilibrated.shape) * np.finfo(float).eps * singular[0]
    retained = singular > cutoff
    inverse = np.zeros_like(singular)
    inverse[retained] = 1.0 / singular[retained]
    transformed = right_t.T @ (inverse * (left.T @ rhs))
    correction = column_scale * transformed
    predicted = fun + jac @ correction
    original_cutoff = (
        max(jac.shape) * np.finfo(float).eps * original_singular[0]
    )
    original_retained = original_singular > original_cutoff
    return {
        "correction": correction,
        "originalSingular": original_singular,
        "equilibratedSingular": singular,
        "originalRightVectors": np.asarray(
            np.linalg.svd(jac, full_matrices=False)[2]
        ),
        "equilibratedLeftVectors": left,
        "equilibratedRightVectors": right_t,
        "rowScale": row_scale,
        "columnScale": column_scale,
        "equilibratedMatrix": equilibrated,
        "originalRank": int(np.count_nonzero(original_retained)),
        "equilibratedRank": int(np.count_nonzero(retained)),
        "originalRankCutoff": float(original_cutoff),
        "equilibratedRankCutoff": float(cutoff),
        "correctionNorm": finite_norm(np, correction),
        "predictedResidualL2": finite_norm(np, predicted),
    }


def correction_limiter(
    np: Any, state: Any, correction: Any, lower: Any, upper: Any
) -> dict[str, Any]:
    values = np.asarray(state, dtype=float)
    delta = np.asarray(correction, dtype=float)
    low = np.asarray(lower, dtype=float)
    high = np.asarray(upper, dtype=float)
    full = values + delta
    ratios: list[tuple[float, int, str]] = []
    for index, change in enumerate(delta):
        if change > 0:
            ratios.append(((high[index] - values[index]) / change, index, "UPPER"))
        elif change < 0:
            ratios.append(((values[index] - low[index]) / (-change), index, "LOWER"))
    ratio, index, bound = min(ratios, default=(math.inf, -1, "NONE"))
    return {
        "fullStepAdmissible": bool(np.all(full > low) and np.all(full < high)),
        "maximumInteriorScale": float(ratio),
        "limitingCoordinate": (
            {**label(index), "bound": bound} if index >= 0 else None
        ),
        "limitingDistance": (
            float(high[index] - values[index])
            if index >= 0 and bound == "UPPER"
            else float(values[index] - low[index])
            if index >= 0
            else None
        ),
        "limitingCorrection": float(delta[index]) if index >= 0 else None,
    }


def ast_inventory(worker_path: Path, candidate_path: Path) -> dict[str, Any]:
    try:
        worker_tree = ast.parse(worker_path.read_text(encoding="utf-8"))
        candidate_tree = ast.parse(candidate_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, SyntaxError) as exc:
        raise DiagnosticRefused(f"AST_EXTRACTION_FAILED:{exc}") from exc

    raw = next(
        (
            node for node in ast.walk(worker_tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == "raw_evaluate"
        ),
        None,
    )
    equations = next(
        (
            node for node in ast.walk(candidate_tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == "equations"
        ),
        None,
    )
    if raw is None or equations is None:
        raise DiagnosticRefused("REQUIRED_RESIDUAL_CLOSURES_NOT_FOUND")

    def calls(node: ast.AST) -> list[str]:
        names = set()
        for call in ast.walk(node):
            if not isinstance(call, ast.Call):
                continue
            if isinstance(call.func, ast.Name):
                names.add(call.func.id)
            elif isinstance(call.func, ast.Attribute):
                names.add(call.func.attr)
        return sorted(names)

    return {
        "rawEvaluate": {
            "lineStart": raw.lineno,
            "lineEnd": raw.end_lineno,
            "calls": calls(raw),
            "closureInputs": [
                "feedc", "feedd", "dc", "dd", "A", "dz", "m",
                "evaluation_attribution", "solvers",
            ],
        },
        "candidateInterfaceEquations": {
            "lineStart": equations.lineno,
            "lineEnd": equations.end_lineno,
            "calls": calls(equations),
            "requiredExternalClosure": "engine.mu",
        },
        "qualification": (
            "AST_FOUND_RAW_EVALUATE_AND_CANDIDATE_EQUATIONS;"
            "CAPTURED_REQUEST_SUPPLIES_BULK_AND_INTERFACE_INPUTS;"
            "PINNED_RUNTIME_SUPPLIES_ENGINE_MU"
        ),
    }


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise DiagnosticRefused(f"MODULE_LOAD_SPEC_FAILED:{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def exact_residual_factory(
    np: Any,
    engine: Any,
    candidate_module: Any,
    request: dict[str, Any],
    lam: float,
    local_equations: Any = None,
):
    """Build only the raw_evaluate + residual_vector algebra, never solve."""

    cells = int(request["compartments"])
    area = math.pi * float(request["columnDiameterM"]) ** 2 / 4.0
    dz = 2.0 / cells
    av = 6.0 * float(request["operatingHoldup"]) / float(request["d32M"])
    total_flow = sum(request["continuousFeedMolS"]) + sum(
        request["dispersedFeedMolS"]
    )
    inventory_scale = np.asarray(
        [
            max(
                request["continuousFeedMolS"][i]
                + request["dispersedFeedMolS"][i],
                total_flow * 1e-7,
            )
            for i in range(7)
        ],
        dtype=float,
    )
    solver_scale = np.minimum(inventory_scale, 1.0)
    # These are the unchanged nominal case values passed to case(...).
    continuous_dispersion = 0.010
    dispersed_dispersion = 0.0010
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
        for _ in range(cells)
    ]

    def residual(state: Any) -> dict[str, Any]:
        values = np.asarray(state, dtype=float)
        if values.size != DIMENSION or not np.all(np.isfinite(values)):
            raise DiagnosticRefused("RESIDUAL_STATE_SHAPE_OR_FINITE_INVALID")
        flows = values[: 14 * cells].reshape(2, cells, 7)
        continuous, dispersed = flows
        interface_unknowns = values[14 * cells:].reshape(cells, 13)
        x_continuous = continuous / continuous.sum(axis=1)[:, None]
        x_dispersed = dispersed / dispersed.sum(axis=1)[:, None]
        c_continuous = (
            x_continuous * request["continuousTotalConcentrationMolM3"]
        )
        c_dispersed = (
            x_dispersed * request["dispersedTotalConcentrationMolM3"]
        )
        fc = np.zeros((cells + 1, 7))
        fd = np.zeros((cells + 1, 7))
        fc[0] = request["continuousFeedMolS"]
        fd[cells] = -np.asarray(request["dispersedFeedMolS"])
        for j in range(1, cells):
            fc[j] = (
                (continuous[j - 1] + continuous[j]) / 2.0
                - continuous_dispersion * area
                * (c_continuous[j] - c_continuous[j - 1]) / dz
            )
            fd[j] = (
                -(dispersed[j - 1] + dispersed[j]) / 2.0
                - dispersed_dispersion * area
                * (c_dispersed[j] - c_dispersed[j - 1]) / dz
            )
        fc[cells] = continuous[cells - 1]
        fd[0] = -dispersed[0]
        interface = []
        component_flux = []
        details = []
        for j in range(cells):
            values_at_interface = (
                solvers[j].equations(
                    interface_unknowns[j], x_continuous[j], x_dispersed[j]
                ) if local_equations is None else local_equations(
                    j, solvers[j], interface_unknowns[j],
                    x_continuous[j], x_dispersed[j]
                )
            )
            interface.extend(values_at_interface[0])
            component_flux.append(values_at_interface[4])
            details.append(values_at_interface)
        transfer = lam * np.asarray(component_flux) * av * area * dz
        rc = fc[:-1] - fc[1:] - transfer
        rd = fd[:-1] - fd[1:] + transfer
        fv = np.asarray(
            [value for j in range(cells) for value in np.r_[rc[j], rd[j]]]
        )
        scaled_fv = np.asarray(
            [value / solver_scale[i % 7] for i, value in enumerate(fv)]
        )
        interface_array = np.asarray(interface)
        return {
            "residual": np.r_[scaled_fv, interface_array],
            "fv": fv,
            "interface": interface_array,
            "rc": rc,
            "rd": rd,
            "componentFlux": np.asarray(component_flux),
            "details": details,
        }

    return residual


def gate_metrics(np: Any, evaluation: dict[str, Any], request: dict[str, Any]):
    fv = evaluation["fv"]
    # The acceptance diagnostic uses the uncapped inventory scale.  The
    # capped solver scale is used only for optimizer conditioning.
    scaled_fv = np.asarray(
        [
            value / max(
                request["continuousFeedMolS"][i % 7]
                + request["dispersedFeedMolS"][i % 7],
                (
                    sum(request["continuousFeedMolS"])
                    + sum(request["dispersedFeedMolS"])
                ) * 1e-7,
            )
            for i, value in enumerate(fv)
        ]
    )
    interface = max(
        max(
            float(np.max(np.abs(values[0][:7]))),
            float(np.max(np.abs(values[6]) / solver.scale)),
        )
        for solver, values in zip(
            request["_diagnosticSolvers"], evaluation["details"]
        )
    )
    state = request["_diagnosticState"]
    return {
        "rawFvResidualMolS": float(np.max(np.abs(fv))),
        "scaledFvResidual": float(np.max(np.abs(scaled_fv))),
        "maximumOriginalJobBGateResidual": interface,
        "minimumFlowMolS": float(np.min(state[:98])),
    }


def directional_checks(np: Any, residual: Any, state: Any, jacobian: Any,
                       lower: Any, upper: Any, variable_scale: Any):
    rng = np.random.default_rng(20260909)
    values = np.asarray(state, dtype=float)
    matrix = np.asarray(jacobian, dtype=float)
    width = np.minimum(values - lower, upper - values)
    width = np.minimum(width, np.maximum(variable_scale, 1e-12))
    rows = []
    for direction_index in range(3):
        direction = rng.normal(size=DIMENSION)
        direction /= np.linalg.norm(direction)
        direction *= width
        h = 1e-4
        plus = residual(values + h * direction)["residual"]
        minus = residual(values - h * direction)["residual"]
        finite_difference = (plus - minus) / (2.0 * h)
        predicted = matrix @ direction
        error = finite_difference - predicted
        predicted_norm = finite_norm(np, predicted)
        rows.append({
            "direction": direction_index,
            "step": h,
            "directionL2": finite_norm(np, direction),
            "finiteDifferenceL2": finite_norm(np, finite_difference),
            "capturedJacobianDirectionL2": predicted_norm,
            "errorL2": finite_norm(np, error),
            "errorInf": float(np.max(np.abs(error))),
            "relativeErrorL2": float(
                finite_norm(np, error) / max(predicted_norm, 1e-300)
            ),
        })
    return {
        "method": "ISOLATED_EXACT_RESIDUAL_CENTRAL_FINITE_DIFFERENCE",
        "directions": rows,
        "status": "CHECKED",
        "noWorkerOrContinuationInvoked": True,
    }


def safe_direction(
    np: Any,
    state: Any,
    lower: Any,
    upper: Any,
    variable_scale: Any,
    vector: Any,
):
    values = np.asarray(state, dtype=float)
    low = np.asarray(lower, dtype=float)
    high = np.asarray(upper, dtype=float)
    scale = np.asarray(variable_scale, dtype=float)
    raw = np.asarray(vector, dtype=float).reshape(-1)
    maximum = float(np.max(np.abs(raw)))
    if maximum <= 0.0 or not np.isfinite(maximum):
        raise DiagnosticRefused("ZERO_OR_NONFINITE_SINGULAR_DIRECTION")
    normalized = raw / maximum
    width = np.minimum(values - low, high - values)
    width = np.minimum(width, np.maximum(scale, 1e-12))
    return width * normalized, width


def coordinate_summary(np: Any, vector: Any, maximum: int = 6):
    values = np.asarray(vector, dtype=float)
    indices = np.argsort(np.abs(values))[::-1][:maximum]
    return [
        {**label(int(index)), "value": float(values[index])}
        for index in indices
    ]


def central_directional_response(
    np: Any,
    residual: Any,
    state: Any,
    jacobian: Any,
    direction: Any,
    eta_values: tuple[float, ...] = (1e-3, 1e-4, 1e-5),
):
    values = np.asarray(state, dtype=float)
    matrix = np.asarray(jacobian, dtype=float)
    direction = np.asarray(direction, dtype=float)
    predicted = matrix @ direction
    predicted_norm = finite_norm(np, predicted)
    rows = []
    for eta in eta_values:
        plus = residual(values + eta * direction)["residual"]
        minus = residual(values - eta * direction)["residual"]
        finite_difference = (plus - minus) / (2.0 * eta)
        error = finite_difference - predicted
        error_norm = finite_norm(np, error)
        rows.append({
            "relativeSafeWidth": eta,
            "finiteDifferenceL2": finite_norm(np, finite_difference),
            "capturedJacobianDirectionL2": predicted_norm,
            "errorL2": error_norm,
            "errorInf": float(np.max(np.abs(error))),
            "relativeErrorL2": (
                float(error_norm / predicted_norm)
                if predicted_norm > 1e-8 else None
            ),
            "responseInterpretation": (
                "NEAR_ZERO_RESPONSE_ABSOLUTE_ERROR_ONLY;"
                "RELATIVE_ERROR_NOT_INTERPRETED"
                if predicted_norm <= 1e-8
                else "RESOLVED_RESPONSE_ABSOLUTE_AND_RELATIVE_REPORTED"
            ),
        })
    return {
        "directionL2": finite_norm(np, direction),
        "capturedJacobianDirectionL2": predicted_norm,
        "samples": rows,
    }


def weak_singular_direction_checks(
    np: Any,
    residual: Any,
    state: Any,
    jacobian: Any,
    lower: Any,
    upper: Any,
    variable_scale: Any,
    replayed: dict[str, Any],
):
    matrix = np.asarray(jacobian, dtype=float)
    raw_left, raw_singular, raw_right_t = np.linalg.svd(
        matrix, full_matrices=False
    )
    del raw_left
    raw_cutoff = max(matrix.shape) * np.finfo(float).eps * raw_singular[0]
    raw_retained = np.flatnonzero(raw_singular > raw_cutoff)
    eq_singular = np.asarray(replayed["equilibratedSingular"], dtype=float)
    eq_right_t = np.asarray(replayed["equilibratedRightVectors"], dtype=float)
    eq_left = np.asarray(replayed["equilibratedLeftVectors"], dtype=float)
    eq_cutoff = float(replayed["equilibratedRankCutoff"])
    eq_retained = np.flatnonzero(eq_singular > eq_cutoff)
    directions = []
    for family, indices, singular, vectors in (
        ("ORIGINAL_RAW", raw_retained[-2:], raw_singular, raw_right_t),
        (
            "EQUILIBRATED_MAPPED_TO_ORIGINAL",
            eq_retained[-2:],
            eq_singular,
            eq_right_t,
        ),
    ):
        for singular_index in indices:
            conditioned = vectors[singular_index]
            if family == "ORIGINAL_RAW":
                mapped = conditioned.copy()
                mapping_residual = None
            else:
                # E = R J C.  An E-space right direction v maps to
                # original coordinates by dx = C v, not C^{-1} v.
                mapped = np.asarray(replayed["columnScale"]) * conditioned
                mapped_image = (
                    np.asarray(replayed["rowScale"])
                    * (matrix @ mapped)
                )
                target = (
                    eq_singular[singular_index]
                    * eq_left[:, singular_index]
                )
                mapping_residual = finite_norm(np, mapped_image - target)
            direction, width = safe_direction(
                np, state, lower, upper, variable_scale, mapped
            )
            response = central_directional_response(
                np, residual, state, matrix, direction
            )
            directions.append({
                "family": family,
                "singularIndex": int(singular_index),
                "singularValue": float(singular[singular_index]),
                "retainedRank": (
                    int(len(raw_retained))
                    if family == "ORIGINAL_RAW"
                    else int(len(eq_retained))
                ),
                "rankCutoff": (
                    float(raw_cutoff)
                    if family == "ORIGINAL_RAW"
                    else eq_cutoff
                ),
                "conditioningMap": (
                    "IDENTITY_ORIGINAL_COORDINATES"
                    if family == "ORIGINAL_RAW"
                    else "dx=columnScale*v_equilibrated"
                ),
                "equilibratedToOriginalMappingResidualL2": mapping_residual,
                "mappedDirectionTopCoordinates": coordinate_summary(np, mapped),
                "boundSafeDirectionTopCoordinates": coordinate_summary(
                    np, direction
                ),
                "boundSafeWidthMinimum": float(np.min(width)),
                "boundSafeWidthMaximum": float(np.max(width)),
                "response": response,
            })
    return {
        "method": (
            "CAPTURED_JACOBIAN_WEAK_RETAINED_RIGHT_SINGULAR_DIRECTIONS;"
            "CENTRAL_FINITE_DIFFERENCE_AT_1E-3_1E-4_1E-5_SAFE_WIDTH"
        ),
        "directions": directions,
        "interpretation": (
            "Weak-direction relative errors are not treated as validation "
            "when the predicted response is near zero; absolute error and "
            "finite-difference response are reported instead."
        ),
    }


def limiter_coordinate_check(
    np: Any,
    residual: Any,
    state: Any,
    jacobian: Any,
    lower: Any,
    upper: Any,
    variable_scale: Any,
    evaluation: dict[str, Any],
    solver: Any,
    cell: int,
    lambda_value: float,
    request: dict[str, Any],
):
    coordinate = 98 + 13 * cell + 12
    values = np.asarray(state, dtype=float)
    u12 = float(values[coordinate])
    bound = float(solver.bound)
    tanh_value = float(np.tanh(u12))
    normalized_flux = tanh_value
    flux = bound * tanh_value
    derivative = bound * (1.0 - tanh_value * tanh_value)
    details = evaluation["details"][cell]
    _local_residual, xi_c, xi_d, _n, _nc, _nd, _delta = details
    geometry_area = math.pi * float(request["columnDiameterM"]) ** 2 / 4.0
    dz = 2.0 / int(request["compartments"])
    av = 6.0 * float(request["operatingHoldup"]) / float(request["d32M"])
    inventory_scale = np.asarray(
        [
            max(
                request["continuousFeedMolS"][i]
                + request["dispersedFeedMolS"][i],
                (
                    sum(request["continuousFeedMolS"])
                    + sum(request["dispersedFeedMolS"])
                ) * 1e-7,
            )
            for i in range(7)
        ],
        dtype=float,
    )
    solver_scale = np.minimum(inventory_scale, 1.0)
    transfer_derivative = (
        lambda_value * np.asarray(xi_c) * derivative
        * av * geometry_area * dz
    )
    analytic = np.zeros(DIMENSION, dtype=float)
    analytic[14 * cell:14 * cell + 7] = -transfer_derivative / solver_scale
    analytic[14 * cell + 7:14 * cell + 14] = (
        transfer_derivative / solver_scale
    )
    local_interface_derivative = np.zeros(13, dtype=float)
    local_interface_derivative[7:13] = (
        (np.asarray(xi_c[:6]) - np.asarray(xi_d[:6]))
        * derivative / np.asarray(solver.scale[:6])
    )
    analytic[98 + 13 * cell:98 + 13 * cell + 13] = (
        local_interface_derivative
    )
    captured_column = np.asarray(jacobian[:, coordinate], dtype=float)
    column_error = captured_column - analytic
    direction, width = safe_direction(
        np,
        values,
        np.asarray(lower),
        np.asarray(upper),
        np.asarray(variable_scale),
        np.eye(DIMENSION)[coordinate],
    )
    response = central_directional_response(
        np, residual, values, jacobian, direction
    )
    derivative_norm = finite_norm(np, analytic)
    captured_norm = finite_norm(np, captured_column)
    return {
        "cell": cell + 1,
        "coordinate": label(coordinate),
        "stateCoordinateValue": u12,
        "transform": {
            "bound": bound,
            "tanhValue": tanh_value,
            "normalizedFlux": normalized_flux,
            "flux": flux,
            "oneMinusAbsTanh": 1.0 - abs(tanh_value),
            "dFlux_dCoordinate": derivative,
            "relativeDerivative_dFlux_dCoordinate": (
                derivative / bound if bound else None
            ),
            "interpretation": (
                "SATURATED_TANH_DERIVATIVE"
                if abs(tanh_value) >= 0.99
                else "NOT_TANH_SATURATED"
            ),
        },
        "analyticResidualColumn": {
            "l2": derivative_norm,
            "inf": float(np.max(np.abs(analytic))),
            "fvScaledL2": finite_norm(np, analytic[:98]),
            "interfaceL2": finite_norm(np, analytic[98:]),
            "interfaceContributionFraction": (
                finite_norm(np, analytic[98:]) / derivative_norm
                if derivative_norm else None
            ),
            "fvContributionFraction": (
                finite_norm(np, analytic[:98]) / derivative_norm
                if derivative_norm else None
            ),
        },
        "capturedJacobianColumn": {
            "l2": captured_norm,
            "inf": float(np.max(np.abs(captured_column))),
            "columnErrorL2": finite_norm(np, column_error),
            "columnErrorInf": float(np.max(np.abs(column_error))),
            "relativeColumnError": (
                finite_norm(np, column_error) / derivative_norm
                if derivative_norm > 1e-8 else None
            ),
            "interpretation": (
                "ABSOLUTE_ERROR_ONLY_NEAR_ZERO_DERIVATIVE"
                if derivative_norm <= 1e-8
                else "ANALYTIC_RESPONSE_RESOLVED"
            ),
        },
        "boundSafeDirection": {
            "minimumWidth": float(np.min(width)),
            "maximumWidth": float(np.max(width)),
            "response": response,
        },
    }


def analyze(args: argparse.Namespace) -> dict[str, Any]:
    checkpoint = read_json(Path(args.checkpoint), "CHECKPOINT")
    request_wrapper = read_json(Path(args.request), "REQUEST")
    request = request_wrapper.get("prepared", {}).get("workerRequest")
    if not isinstance(request, dict):
        raise DiagnosticRefused("PRISTINE_WORKER_REQUEST_MISSING")
    value = selected_value(checkpoint, args.selection_id)
    capture = value.get("diagnosticCapture")
    if not isinstance(capture, dict) or capture.get("diagnosticOnly") is not True:
        raise DiagnosticRefused("DIAGNOSTIC_CAPTURE_NOT_DECLARED_ONLY")
    attempts = value.get("coupledAttempts")
    if not isinstance(attempts, list) or len(attempts) != 1:
        raise DiagnosticRefused("EXPECTED_ONE_COUPLED_ATTEMPT")
    attempt = attempts[0]
    jacobian_audit = attempt.get("jacobianAudit")
    if not isinstance(jacobian_audit, dict):
        raise DiagnosticRefused("JACOBIAN_AUDIT_MISSING")

    runtime_root = Path(args.runtime_root).resolve()
    worker_hashes = {}
    for relative in WORKER_RELATIVE_PATHS:
        path = runtime_root / relative
        if not path.is_file() or path.is_symlink():
            raise DiagnosticRefused(f"WORKER_SOURCE_UNAVAILABLE:{relative}")
        worker_hashes[relative] = sha256_file(path)
        if worker_hashes[relative] != capture["workerFilesSha256"].get(relative):
            raise DiagnosticRefused(f"WORKER_SOURCE_HASH_MISMATCH:{relative}")

    # The pinned scientific runtime is read-only and loaded directly.  Put its
    # vendored numerical stack first, before importing numpy or scipy.
    runtime_artifact = Path(args.runtime_artifact_root).resolve()
    vendor = runtime_artifact / (
        "server/research/ecr-pre-pilot-cosmosac/vendor/python"
    )
    if not vendor.is_dir():
        raise DiagnosticRefused("PINNED_VENDOR_RUNTIME_UNAVAILABLE")
    sys.path.insert(0, str(vendor))
    import numpy  # noqa: PLC0415

    candidate_path = runtime_root / "server/ecr-pre-pilot/job-c/candidate_interface.py"
    engine_path = runtime_artifact / (
        "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
    )
    if sha256_file(candidate_path) != capture["workerFilesSha256"][
        "server/ecr-pre-pilot/job-c/candidate_interface.py"
    ]:
        raise DiagnosticRefused("CANDIDATE_SOURCE_HASH_MISMATCH")
    manifest_path = runtime_artifact / "stage4-seven-component-adapter-manifest.json"
    base_manifest_path = runtime_artifact / (
        "../predictive-nt-runtime-7c-1-5/predictive-nt-runtime-manifest.json"
    )
    base_manifest_path = base_manifest_path.resolve()
    base_manifest = read_json(base_manifest_path, "BASE_RUNTIME_MANIFEST")
    engine_record = next(
        (
            row for row in base_manifest.get("files", [])
            if row.get("path")
            == "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
        ),
        None,
    )
    if not isinstance(engine_record, dict):
        raise DiagnosticRefused("SCIENTIFIC_ENGINE_MANIFEST_RECORD_MISSING")
    if sha256_file(engine_path) != engine_record.get("sha256"):
        raise DiagnosticRefused("SCIENTIFIC_ENGINE_HASH_MISMATCH")

    ast_report = ast_inventory(
        runtime_root / WORKER_RELATIVE_PATHS[0], candidate_path
    )
    engine_module = load_module("job_c_diagnostic_engine", engine_path)
    candidate_module = load_module("job_c_diagnostic_candidate", candidate_path)
    temporary, engine, _integrity, runtime_info = engine_module.build_engine(
        request["temperatureK"], 0.0
    )
    try:
        request_for_metrics = dict(request)
        # exact_residual_factory creates the unchanged local equations directly;
        # no worker, case(), continuation, optimizer, or gate is called.
        lam = float(value["rejectedLambda"])
        residual = exact_residual_factory(
            numpy, engine, candidate_module, request_for_metrics, lam
        )

        sequence = jacobian_audit.get("rankAwareCorrectionSequence", {})
        linearizations = sequence.get("linearizations")
        if not isinstance(linearizations, list) or not linearizations:
            raise DiagnosticRefused("RANK_AWARE_LINEARIZATIONS_MISSING")
        diagnostic_audits = [jacobian_audit]
        for record in linearizations:
            diagnostic_audits.append(record["jacobianAudit"])
        unique = []
        unique_audits = []
        seen_hashes: set[str] = set()
        for audit in diagnostic_audits:
            diagnostic = audit["diagnosticLinearization"]
            state_hash = str(diagnostic["stateSha256"])
            if state_hash not in seen_hashes:
                unique.append(diagnostic)
                unique_audits.append(audit)
                seen_hashes.add(state_hash)
        # The selected rejected state is the final retained candidate and has
        # no separate linearization in the capture.
        states = [numpy.asarray(item["state"], dtype=float) for item in unique]
        states.append(numpy.asarray(value["state"], dtype=float))

        residual_replay = []
        state_evaluations = []
        for index, diagnostic in enumerate(unique):
            evaluated = residual(states[index])
            state_evaluations.append(evaluated)
            exact = evaluated["residual"]
            captured = numpy.asarray(diagnostic["residual"], dtype=float)
            difference = exact - captured
            residual_replay.append({
                "stateSha256": diagnostic["stateSha256"],
                "capturedResidualMaxAbsDifference": float(
                    numpy.max(numpy.abs(difference))
                ),
                "capturedResidualL2Difference": finite_norm(numpy, difference),
                "exactResidualInfNorm": float(numpy.max(numpy.abs(exact))),
            })
        final_eval = residual(states[-1])
        request_for_metrics["_diagnosticSolvers"] = [
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
        request_for_metrics["_diagnosticState"] = states[-1]
        final_metrics = gate_metrics(numpy, final_eval, request_for_metrics)

        correction_rows = []
        weak_direction_rows = []
        limiter_direction_rows = []
        for index, audit in enumerate(unique_audits):
            diagnostic = audit["diagnosticLinearization"]
            matrix = numpy.asarray(diagnostic["jacobian"], dtype=float)
            state = numpy.asarray(diagnostic["state"], dtype=float)
            lower = numpy.asarray(diagnostic["lowerBounds"], dtype=float)
            upper = numpy.asarray(diagnostic["upperBounds"], dtype=float)
            variable_scale = numpy.asarray(
                diagnostic["variableScale"], dtype=float
            )
            captured_solver = audit["correctionSolver"]
            replayed = ruiz_correction(
                numpy,
                matrix,
                numpy.asarray(diagnostic["residual"], dtype=float),
                variable_scale,
            )
            limiter = correction_limiter(
                numpy, state, replayed["correction"], lower, upper
            )
            raw_singular = replayed["originalSingular"]
            raw_cutoff = replayed["originalRankCutoff"]
            retained = raw_singular > raw_cutoff
            weak = []
            _u, _s, vt = numpy.linalg.svd(matrix, full_matrices=False)
            for weak_index in range(min(5, len(_s))):
                singular_index = len(_s) - 1 - weak_index
                direction = vt[singular_index]
                top_indices = numpy.argsort(numpy.abs(direction))[::-1][:5]
                weak.append({
                    "singularValue": float(_s[singular_index]),
                    "coordinates": [
                        {**label(int(coordinate)), "value": float(direction[coordinate])}
                        for coordinate in top_indices
                    ],
                })
            lower_distance = state - lower
            upper_distance = upper - state
            nearest_lower = int(numpy.argmin(lower_distance))
            nearest_upper = int(numpy.argmin(upper_distance))
            correction_record = {
                "linearizationIndex": index,
                "stateSha256": diagnostic["stateSha256"],
                "rawNumericalRank": int(numpy.count_nonzero(retained)),
                "rawRankCutoff": float(raw_cutoff),
                "capturedRawNumericalRank": audit.get("numericalRank"),
                "capturedLargestSingularValue": audit.get("largestSingularValue"),
                "capturedSmallestSingularValue": audit.get("smallestSingularValue"),
                "capturedConditionNumber": audit.get("conditionNumber"),
                "replayedEquilibratedRank": replayed["equilibratedRank"],
                "replayedCorrectionNorm": replayed["correctionNorm"],
                "capturedCorrectionNorm": captured_solver.get("correctionNorm"),
                "replayedPredictedResidualL2": replayed["predictedResidualL2"],
                "capturedPredictedResidualL2": captured_solver.get(
                    "predictedResidualL2"
                ),
                "correctionLimiter": limiter,
                "nearestLowerBound": {
                    **label(nearest_lower),
                    "distance": float(lower_distance[nearest_lower]),
                },
                "nearestUpperBound": {
                    **label(nearest_upper),
                    "distance": float(upper_distance[nearest_upper]),
                },
                "activeLowerBoundCount": audit.get("activeLowerBoundCount"),
                "activeUpperBoundCount": audit.get("activeUpperBoundCount"),
                "nearLowerBoundCount": audit.get("nearLowerBoundCount"),
                "nearUpperBoundCount": audit.get("nearUpperBoundCount"),
                "weakDirections": weak,
            }
            weak_direction_rows.append({
                "linearizationIndex": index,
                "stateSha256": diagnostic["stateSha256"],
                "checks": weak_singular_direction_checks(
                    numpy,
                    residual,
                    state,
                    matrix,
                    lower,
                    upper,
                    variable_scale,
                    replayed,
                ),
            })
            limiting = limiter.get("limitingCoordinate")
            if (
                isinstance(limiting, dict)
                and limiting.get("interfaceUnknown") == "total_flux_tanh"
            ):
                limiter_direction_rows.append(
                    limiter_coordinate_check(
                        numpy,
                        residual,
                        state,
                        matrix,
                        lower,
                        upper,
                        variable_scale,
                        state_evaluations[index],
                        request_for_metrics["_diagnosticSolvers"][
                            int(limiting["numericalCell"]) - 1
                        ],
                        int(limiting["numericalCell"]) - 1,
                        lam,
                        request,
                    )
                )
            if index < len(linearizations):
                record = linearizations[index]
                improving = [
                    candidate for candidate in record.get("candidates", [])
                    if candidate.get("strictGateScoreImprovement") is True
                ]
                if improving:
                    selected_candidate = improving[0]
                    effective_scale = float(
                        selected_candidate["effectiveStepScale"]
                    )
                    candidate_hash = str(selected_candidate["stateSha256"])
                    next_hash = (
                        unique[index + 1]["stateSha256"]
                        if index + 1 < len(unique)
                        else None
                    )
                    transition = {
                        "effectiveStepScale": effective_scale,
                        "candidateStateSha256": candidate_hash,
                        "capturedGateScore": selected_candidate.get("gateScore"),
                    }
                    if next_hash == candidate_hash:
                        expected = state + effective_scale * replayed["correction"]
                        observed = states[index + 1]
                        transition.update({
                            "observedStateCaptured": True,
                            "expectedObservedMaxAbsDifference": float(
                                numpy.max(numpy.abs(expected - observed))
                            ),
                            "expectedObservedL2Difference": finite_norm(
                                numpy, expected - observed
                            ),
                        })
                    else:
                        transition.update({
                            "observedStateCaptured": False,
                            "observationNote": (
                                "Candidate hash is not among captured "
                                "linearization states; no state vector was "
                                "fabricated for comparison."
                            ),
                        })
                    correction_record["retainedTransition"] = transition
            correction_rows.append(correction_record)

        first_state = states[0]
        first_jacobian = numpy.asarray(
            unique[0]["jacobian"], dtype=float
        )
        directional = directional_checks(
            numpy,
            residual,
            first_state,
            first_jacobian,
            numpy.asarray(unique[0]["lowerBounds"], dtype=float),
            numpy.asarray(unique[0]["upperBounds"], dtype=float),
            numpy.asarray(unique[0]["variableScale"], dtype=float),
        )
    finally:
        temporary.cleanup()

    report = {
        "schemaVersion": "ECR_JOB_C_OFFLINE_REJECTION_ANALYSIS_V2",
        "diagnosticOnly": True,
        "selectionId": args.selection_id,
        "jobId": args.job_id,
        "evidencePaths": {
            "inputSnapshot": str(Path(args.request).resolve()),
            "partialResultSnapshot": str(Path(args.checkpoint).resolve()),
            "replayAlgebra": str(Path(args.replay_json).resolve())
            if args.replay_json else None,
        },
        "lineage": {
            "captureSha256": capture.get("captureSha256"),
            "selectedStateSha256": value.get("stateSha256"),
            "requestSha256": capture.get("requestSha256"),
            "workerFilesSha256": worker_hashes,
            "scientificEngineSha256": engine_record.get("sha256"),
            "scientificRuntime": runtime_info,
            "noWorkerOrContinuationInvoked": True,
        },
        "astClosureExtraction": ast_report,
        "rejectedState": {
            "rejectedLambda": value.get("rejectedLambda"),
            "heightM": value.get("heightM"),
            "selectedStateSource": value.get("selectedStateSource"),
            "physicalInfeasibilityClaimedField": value.get(
                "physicalInfeasibilityClaimed"
            ),
            "physicalInfeasibilityEvidence": bool(
                value.get("physicalInfeasibilityClaimed") is True
            ),
            "physicalInfeasibilityEvidenceNote": (
                "Captured field is null; no physical infeasibility evidence "
                "is present in this rejected trial."
                if value.get("physicalInfeasibilityClaimed") is None
                else "Boolean evidence derived from captured field."
            ),
            "capturedGateMetrics": value.get("gateMetrics"),
            "isolatedExactResidualGateMetrics": final_metrics,
            "isolatedExactResidualStatus": "REPLAYED",
            "capturedLinearizationResidualReplay": residual_replay,
        },
        "rankAwareCorrectionReplay": {
            "method": sequence.get("method"),
            "terminationReason": sequence.get("terminationReason"),
            "capturedRetainedCorrectionCount": sequence.get(
                "retainedCorrectionCount"
            ),
            "linearizations": correction_rows,
        },
        "independentDirectionalDerivativeChecks": directional,
        "weakRetainedSingularDirectionChecks": weak_direction_rows,
        "limiterCoordinateChecks": limiter_direction_rows,
        "conclusion": {
            "exactResidualOnlyReplayFeasible": True,
            "independentDirectionalDerivativeChecksStatus": "CHECKED",
            "weakDirectionValidation": (
                "BOUNDED_DIAGNOSTIC_ONLY;"
                "NEAR_ZERO_RESPONSES_USE_ABSOLUTE_ERROR_NOT_RELATIVE_CLAIMS"
            ),
            "limiterTransformInspection": (
                "SUPPORTED_BY_EXACT_CANDIDATE_TRANSFORM_AND_ANALYTIC_COLUMN"
            ),
            "solverOrContinuationValidation": "UNTESTED_BY_DESIGN",
            "physicalInfeasibilityClaim": "NOT_EVIDENCED",
        },
    }
    return report


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Offline diagnostic-only Job-C rejection analysis."
    )
    result.add_argument("--checkpoint", required=True)
    result.add_argument("--request", required=True)
    result.add_argument("--runtime-root", required=True)
    result.add_argument("--runtime-artifact-root", required=True)
    result.add_argument("--id", dest="selection_id", required=True)
    result.add_argument("--job-id", default=None)
    result.add_argument("--replay-json", default=None)
    result.add_argument("--output", required=True)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        report = analyze(args)
        Path(args.output).write_text(
            json.dumps(report, sort_keys=True, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({
            "output": str(Path(args.output).resolve()),
            "exactResidualOnlyReplayFeasible": report["conclusion"][
                "exactResidualOnlyReplayFeasible"
            ],
            "directionalDerivativeStatus": report["conclusion"][
                "independentDirectionalDerivativeChecksStatus"
            ],
        }, sort_keys=True))
        return 0
    except (DiagnosticRefused, OSError, UnicodeError, ImportError, RuntimeError) as exc:
        print(f"ANALYSIS_REFUSED:{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())