#!/usr/bin/env python3
"""Focused, dependency-light contract checks for the 7C-1.2.0 engine."""
from __future__ import annotations

import ast
import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("seven_component_1_2", HERE / "engine.py")
engine = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(engine)


def test_lattice_is_exact_denominator_four_210_point_simplex():
    import numpy as np

    points = list(engine.lattice(np))
    assert len(points) == 210
    assert len({tuple(point.tolist()) for point in points}) == 210
    assert all(abs(float(point.sum()) - 1.0) <= 1e-15 for point in points)
    assert all(
        all(value in (0.0, 0.25, 0.5, 0.75, 1.0) for value in point)
        for point in points
    )


def test_source_has_direct_14n_equations_and_two_post_split_searches():
    tree = ast.parse((HERE / "engine.py").read_text())
    source = (HERE / "engine.py").read_text()
    assert '"equationVariableCount": 14 * stage_count' in source
    assert '"equationResidualCount": 14 * stage_count' in source
    solve = next(
        node for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "solve_cascade"
    )
    post_calls = [
        node for node in ast.walk(solve)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "routine_tpd"
    ]
    assert len(post_calls) == 2
    flash = next(
        node for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "flash"
    )
    flash_calls = [
        node for node in ast.walk(flash)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "routine_tpd"
    ]
    # The one flash call supplies its initial split seed; no provisional
    # post-split checks are permitted before the coupled cascade solve.
    assert len(flash_calls) == 1


def test_solve_instruments_exactly_two_post_split_searches_per_stage():
    import numpy as np
    import scipy

    class IdealModel:
        @staticmethod
        def wet_lngamma(np_module, temperature_k, composition):
            del temperature_k, composition
            return np_module.zeros(7)

    subject = engine.SevenComponentEngine(np, scipy, IdealModel())
    searches = []
    subject.flash = lambda total, temperature_k: {
        "raffinate": np.asarray([.20, .15, .14, .13, .12, .20, .06]),
        "extract": np.asarray([.15, .14, .13, .12, .11, .27, .08]),
        "beta": .5,
    }
    subject.routine_tpd = lambda reference, temperature_k, **kwargs: (
        searches.append((reference.copy(), temperature_k, kwargs))
        or {"minimum": 0.0, "allRefinementsAccepted": True}
    )
    result = subject.solve_cascade(
        3, 323.15, np.ones(7), np.ones(7),
    )
    assert len(searches) == 6
    assert result["postSplitTpdSearchCount"] == 6
    assert subject.metrics["postSplitTpdCalls"] == 6


def test_continuation_retains_last_closed_reproduced_lineage_for_resume():
    import numpy as np

    worker_path = HERE.parents[1] / (
        "ecr-pre-pilot/predictive-nt-seven-component-v1-2/worker.py"
    )
    spec = importlib.util.spec_from_file_location("seven_component_1_2_worker", worker_path)
    worker = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(worker)
    closed = {
        "stageCount": 1,
        "bothEndpointsClosed": True,
        "branchReproduced": True,
        "raffinateComponentMoles": [[1.0] * 7],
        "extractComponentMoles": [[2.0] * 7],
    }
    state, lineage_count = worker.advance_continuation(
        closed,
        {"raffinateComponentMoles": [], "extractComponentMoles": []},
        0,
    )
    diagnostic = {
        "stageCount": 2,
        "bothEndpointsClosed": False,
        "branchReproduced": False,
        "raffinateComponentMoles": [[3.0] * 7, [3.0] * 7],
        "extractComponentMoles": [[4.0] * 7, [4.0] * 7],
    }
    resumed_state, resumed_lineage_count = worker.advance_continuation(
        diagnostic, state, lineage_count,
    )
    # Acknowledged trial 2 resumes from valid trial 1 rather than allowing its
    # unclosed solution to seed trial 3.
    assert resumed_lineage_count == 1
    assert resumed_state == state
    resumed_r, resumed_e = worker.continuation(
        np, resumed_state, resumed_lineage_count,
    )
    assert resumed_r.shape == (1, 7)
    assert resumed_e.shape == (1, 7)


def test_routine_tpd_does_not_escalate_unambiguous_stable_reference():
    import numpy as np
    import scipy

    class IdealModel:
        @staticmethod
        def wet_lngamma(np_module, temperature_k, composition):
            del temperature_k
            return np_module.zeros(len(composition))

    exhaustive_calls = []

    def exhaustive(reference):
        exhaustive_calls.append(reference)
        return {"minimum": 0.0, "minimizingComposition": reference.tolist()}

    subject = engine.SevenComponentEngine(
        np, scipy, IdealModel(), exhaustive_tpd=exhaustive
    )
    result = subject.routine_tpd(
        np.asarray([0.31, 0.17, 0.13, 0.11, 0.09, 0.12, 0.07]),
        323.15,
        include_local_seeds=False,
        refine_best_global_and_local=False,
    )
    assert result["gridPointCount"] == 210
    assert result["gridDenominator"] == 4
    assert result["escalationUsed"] is False
    assert result["classification"] == "ROUTINE_STABLE"
    assert math.isclose(result["minimum"], 0.0, abs_tol=1e-10)
    assert exhaustive_calls == []