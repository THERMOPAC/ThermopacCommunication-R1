"""Focused protocol tests; intentionally do not import or run the solver."""
import ast
import contextlib
import io
import json
import math
import time
import unittest
from pathlib import Path


WORKER = Path(__file__).with_name("worker.py")


def protocol_namespace():
    tree = ast.parse(WORKER.read_text())
    names = {"canonical", "hashed", "digest", "progress",
             "record_completed_result", "checkpoint"}
    selected = [node for node in tree.body
                if isinstance(node, ast.FunctionDef) and node.name in names]
    code = compile(ast.Module(body=selected, type_ignores=[]),
                   str(WORKER), "exec")
    namespace = {"json": json, "math": math, "time": time,
                 "hashlib": __import__("hashlib")}
    exec(code, namespace)
    namespace.update({
        "_job_started": time.monotonic() - 2,
        "_last_progress": {"phase": "initializing", "completed": 0,
                           "total": None, "iteration": None,
                           "residual": None, "residualKind": None,
                           "elapsedSeconds": 0.0, "heightCandidateM": None},
        "_last_progress_emit": 0.0,
        "_completed_results": [],
        "_request_sha256": "request-digest",
    })
    return namespace


class JobCWorkerProtocolTest(unittest.TestCase):
    def test_progress_has_all_extended_fields_and_null_unknowns(self):
        worker = protocol_namespace()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            worker["progress"]("qualifying", 2, None, None, 0.25,
                               "RESIDUAL_L2", 4.0)
        message = json.loads(output.getvalue().split(" ", 1)[1])
        self.assertEqual(message["phase"], "qualifying")
        self.assertEqual(message["completed"], 2)
        self.assertIsNone(message["total"])
        self.assertIsNone(message["iteration"])
        self.assertEqual(message["residual"], 0.25)
        self.assertEqual(message["residualKind"], "RESIDUAL_L2")
        self.assertEqual(message["heightCandidateM"], 4.0)
        self.assertGreaterEqual(message["elapsedSeconds"], 0)

    def test_solver_height_is_stored_on_the_live_budget(self):
        tree = ast.parse(WORKER.read_text())
        solves = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)
                  and node.name == "solve_height"]
        self.assertEqual(len(solves), 1)
        assignments = [node for node in ast.walk(solves[0])
                       if isinstance(node, ast.Assign)]
        self.assertTrue(any(
            isinstance(node.targets[0], ast.Subscript)
            and isinstance(node.targets[0].value, ast.Name)
            and node.targets[0].value.id == "budget"
            and isinstance(node.targets[0].slice, ast.Constant)
            and node.targets[0].slice.value == "heightCandidateM"
            for node in assignments))

    def test_checkpoint_is_full_partial_envelope(self):
        worker = protocol_namespace()
        worker["record_completed_result"]("contact:1", "QUALIFIED_AXIAL_CONTACT",
                                          {"index": 0})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            worker["checkpoint"]()
        message = json.loads(output.getvalue().split(" ", 1)[1])
        self.assertEqual(message["schemaVersion"], "ECR_JOB_C_PARTIAL_V1")
        self.assertFalse(message["complete"])
        self.assertEqual(message["requestSha256"], "request-digest")
        self.assertEqual(message["completedResults"][0]["id"], "contact:1")
        self.assertIn("progress", message)

    def test_wall_clock_solver_limit_is_disabled(self):
        tree = ast.parse(WORKER.read_text())
        assignments = [node for node in tree.body if isinstance(node, ast.Assign)
                       and any(isinstance(target, ast.Name) and
                               target.id == "NONLINEAR_SOLVER_BUDGET_SECONDS"
                               for target in node.targets)]
        self.assertEqual(len(assignments), 1)
        self.assertIsInstance(assignments[0].value, ast.Constant)
        self.assertIsNone(assignments[0].value.value)


if __name__ == "__main__":
    unittest.main()