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
    names = {"native_json_scalar", "canonical", "hashed", "digest", "progress",
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
                           "elapsedSeconds": 0.0, "heightCandidateM": None,
                           "continuationLambda": None,
                           "continuationTrial": None,
                           "acceptedLowerLambda": None,
                           "rejectedUpperLambda": None,
                           "rawFvResidualMolS": None,
                           "scaledFvResidual": None,
                           "maximumOriginalJobBGateResidual": None,
                           "minimumFlowMolS": None,
                           "rawFvGatePassed": None,
                           "scaledFvGatePassed": None,
                           "originalJobBGatePassed": None,
                           "strictPositivityPassed": None,
                           "accepted": None},
        "_last_progress_emit": 0.0,
        "_completed_results": [],
        "_request_sha256": "request-digest",
    })
    return namespace


def physical_trial_validator():
    tree = ast.parse(WORKER.read_text())
    selected = [node for node in tree.body
                if isinstance(node, ast.FunctionDef)
                and node.name == "validate_physical_sizing_trial"]
    code = compile(ast.Module(body=selected, type_ignores=[]),
                   str(WORKER), "exec")
    namespace = {"math": math, "re": __import__("re")}
    exec(code, namespace)
    return namespace["validate_physical_sizing_trial"]


class JobCWorkerProtocolTest(unittest.TestCase):
    def test_progress_has_all_extended_fields_and_null_unknowns(self):
        worker = protocol_namespace()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            worker["progress"]("qualifying", 2, None, None, 0.25,
                               "RESIDUAL_L2", 4.0,
                               lambda_value=3e-8,
                               continuation_trial=2,
                               accepted_lower_lambda=1e-8,
                               rejected_upper_lambda=1e-7,
                               gate_metrics={
                                   "rawFvResidualMolS": 8e-8,
                                   "scaledFvResidual": 9e-8,
                                   "maximumOriginalJobBGateResidual": 2e-8,
                                   "minimumFlowMolS": 3e-9,
                                   "rawFvGatePassed": True,
                                   "scaledFvGatePassed": True,
                                   "originalJobBGatePassed": True,
                                   "strictPositivityPassed": True,
                                   "accepted": True,
                               })
        message = json.loads(output.getvalue().split(" ", 1)[1])
        self.assertEqual(message["phase"], "qualifying")
        self.assertEqual(message["completed"], 2)
        self.assertIsNone(message["total"])
        self.assertIsNone(message["iteration"])
        self.assertEqual(message["residual"], 0.25)
        self.assertEqual(message["residualKind"], "RESIDUAL_L2")
        self.assertEqual(message["heightCandidateM"], 4.0)
        self.assertEqual(message["continuationLambda"], 3e-8)
        self.assertEqual(message["continuationTrial"], 2)
        self.assertEqual(message["acceptedLowerLambda"], 1e-8)
        self.assertEqual(message["rejectedUpperLambda"], 1e-7)
        self.assertEqual(message["rawFvResidualMolS"], 8e-8)
        self.assertEqual(message["scaledFvResidual"], 9e-8)
        self.assertEqual(message["maximumOriginalJobBGateResidual"], 2e-8)
        self.assertEqual(message["minimumFlowMolS"], 3e-9)
        self.assertTrue(message["accepted"])
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

    def test_terminal_progress_retains_gates_and_branch_bracket(self):
        worker = protocol_namespace()
        output = io.StringIO()
        gates = {
            "rawFvResidualMolS": 8e-8,
            "scaledFvResidual": 9e-8,
            "maximumOriginalJobBGateResidual": 2e-8,
            "minimumFlowMolS": 3e-9,
            "rawFvGatePassed": True,
            "scaledFvGatePassed": True,
            "originalJobBGatePassed": True,
            "strictPositivityPassed": True,
            "accepted": True,
        }
        with contextlib.redirect_stdout(output):
            worker["progress"]("coupled", accepted_lower_lambda=1e-8,
                               rejected_upper_lambda=1.25e-8,
                               gate_metrics=gates)
            worker["progress"]("terminal", 1, 1)
        terminal = json.loads(output.getvalue().splitlines()[-1].split(" ", 1)[1])
        self.assertEqual(terminal["acceptedLowerLambda"], 1e-8)
        self.assertEqual(terminal["rejectedUpperLambda"], 1.25e-8)
        self.assertEqual(terminal["rawFvResidualMolS"], 8e-8)
        self.assertTrue(terminal["accepted"])

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

    def test_physical_trial_requires_hash_bound_integer_geometry(self):
        validate = physical_trial_validator()
        valid = {
            "physicalSizingTrial": {
                "sourceJobCResultSha256": "a" * 64,
                "sourceWorkerResultSha256": "b" * 64,
                "mechanicalBasisHash": "c" * 64,
                "stage3ImmutableHash": "d" * 64,
                "installedHeightM": 2.4,
                "physicalCompartments": 4,
                "candidateOrdinal": 0,
            },
        }
        validate(valid)
        valid["physicalSizingTrial"]["physicalCompartments"] = 4.1
        with self.assertRaisesRegex(ValueError, "JOB_C_PHYSICAL_SIZING_TRIAL_INVALID"):
            validate(valid)


if __name__ == "__main__":
    unittest.main()