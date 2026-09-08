#!/usr/bin/env python3
"""Native-free focused tests for Predictive N_T operational progress."""
from __future__ import annotations

import ast
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-5-progress/worker.py"
BASE_ENGINE = ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
OVERRIDE_ENGINE = ROOT / "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"


def worker_functions():
    tree = ast.parse(WORKER.read_text(), filename=str(WORKER))
    selected = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name in {"stage_assembly_code", "observe_stage_assembly"}
    ]
    module = ast.Module(body=selected, type_ignores=[])
    namespace = {"sys": sys}
    exec(compile(ast.fix_missing_locations(module), str(WORKER), "exec"), namespace)
    return namespace


def cascade_shape(path):
    tree = ast.parse(path.read_text(), filename=str(path))
    engine = next(
        node for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef) and node.name == "SevenComponentEngine"
    )
    return next(
        node for node in engine.body
        if isinstance(node, ast.FunctionDef) and node.name == "solve_cascade"
    )


class ProgressObservationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = worker_functions()
        cls.base_shape = cascade_shape(BASE_ENGINE)
        cls.override_shape = cascade_shape(OVERRIDE_ENGINE)

    def shaped_engine(self, fail_after=None):
        # AST checks pin this test double to the real inherited method shape:
        # the override has no local ``stages`` while its parent does.
        self.assertNotIn(
            "stages", {node.id for node in ast.walk(self.override_shape)
                       if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store)}
        )
        self.assertIn(
            "stages", {node.id for node in ast.walk(self.base_shape)
                       if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store)}
        )

        class Parent:
            def solve_cascade(self, count):
                solutions = ("coupled-start-one", "coupled-start-two")
                stages = []
                for stage in range(count):
                    audit = (solutions, stage)  # assembly follows both solves/audit.
                    stages.append({"stage": audit[1] + 1})
                    if fail_after == stage + 1:
                        raise RuntimeError("audit interrupted")
                return {"stages": stages}

        class Override(Parent):
            def solve_cascade(self, *args, **kwargs):
                result = super().solve_cascade(*args, **kwargs)
                result["accepted"] = True
                return result

        return Override()

    def test_inherited_assembly_only_and_return_is_unchanged(self):
        engine = self.shaped_engine()
        events = []
        prior = sys.gettrace()
        result = self.api["observe_stage_assembly"](
            engine.solve_cascade, 3, lambda done, maximum: events.append(
                (done, maximum)
            ), 3
        )
        self.assertEqual(result, {"stages": [{"stage": 1}, {"stage": 2}, {"stage": 3}],
                                  "accepted": True})
        self.assertEqual(events, [(0, 3), (1, 3), (2, 3), (3, 3)])
        self.assertIs(sys.gettrace(), prior)

    def test_partial_exception_never_completes_and_trace_is_restored(self):
        engine = self.shaped_engine(fail_after=2)
        events = []
        prior = sys.gettrace()
        with self.assertRaisesRegex(RuntimeError, "audit interrupted"):
            self.api["observe_stage_assembly"](
                engine.solve_cascade, 3,
                lambda done, maximum: events.append((done, maximum)), 3
            )
        self.assertEqual(events, [(0, 3), (1, 3), (2, 3)])
        self.assertIs(sys.gettrace(), prior)

    def test_existing_tracer_is_restored(self):
        engine = self.shaped_engine()
        calls = []

        def prior_trace(frame, event, arg):
            calls.append(event)
            return prior_trace

        old = sys.gettrace()
        sys.settrace(prior_trace)
        try:
            self.api["observe_stage_assembly"](
                engine.solve_cascade, 1, lambda *_: None, 1
            )
            self.assertIs(sys.gettrace(), prior_trace)
            self.assertIn("call", calls)
        finally:
            sys.settrace(old)


if __name__ == "__main__":
    unittest.main()