#!/usr/bin/env python3
"""Isolated AST checks for strict Job-C continuation semantics.

This never imports or executes the solver.  It asserts that the source state
is part of the immutable worker contract, is used as the 8e-9 warm start, and
is exact-re-evaluated before higher continuation targets are reachable.
"""
from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "server/ecr-pre-pilot/job-c/worker.py"
TREE = ast.parse(WORKER.read_text(encoding="utf-8"), filename=str(WORKER))


def function(name: str, tree: ast.AST = TREE) -> ast.FunctionDef:
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise AssertionError(f"missing function {name}")


def text(node: ast.AST) -> str:
    return ast.unparse(node)


class StrictContinuationAnchorAstTests(unittest.TestCase):
    def test_contract_requires_a_hash_bound_189_variable_source_state(self):
        validation = text(function("validate_strict_continuation_anchor"))
        self.assertIn('anchor.get(\'profileState\')', validation)
        self.assertIn('len(state) != 189', validation)
        self.assertIn('digest(state) != anchor.get(\'profileStateSha256\')', validation)

    def test_case_passes_only_source_state_at_anchor_lambda(self):
        case = text(function("case"))
        self.assertIn("'lambda': STRICT_CONTINUATION_ANCHOR_LAMBDA", case)
        self.assertIn("'state': continuation_anchor['profileState']", case)
        self.assertIn('low = solve_height(2.0, continuation_warm)', case)
        self.assertNotIn('reboundContinuationCheckpoint', case)

    def test_targets_start_at_anchor_and_gate_is_exactly_reevaluated_twice(self):
        solve_height = next(
            node for node in ast.walk(function("case"))
            if isinstance(node, ast.FunctionDef) and node.name == "solve_height"
        )
        source = text(solve_height)
        self.assertIn(
            'lambda_targets = [STRICT_CONTINUATION_ANCHOR_LAMBDA] + [target for target in lambda_targets if target > STRICT_CONTINUATION_ANCHOR_LAMBDA]',
            source,
        )
        self.assertIn(
            'source_anchor_state = np.asarray(warm_state, dtype=float) if strict_anchor_replay else None',
            source,
        )
        self.assertIn('x = source_anchor_state.copy()', source)
        self.assertGreaterEqual(source.count('exact_raw_evaluate(accepted_x, lam)'), 2)
        self.assertIn('JOB_C_STRICT_CONTINUATION_ANCHOR_REEVALUATION_FAILED', source)

    def test_workflow_or_diagnostic_modes_cannot_use_continuation_contract(self):
        main_guard = text(TREE)
        self.assertIn('JOB_C_STRICT_CONTINUATION_ANCHOR_OPERATION_INVALID', main_guard)
        self.assertIn("r.get('diagnosticMode') is not None", main_guard)

    def test_successful_continuation_emits_consumption_attestation(self):
        source = text(function("case"))
        self.assertIn(
            'ANCHOR_CONSUMED_AND_REEVALUATED_BEFORE_HIGHER_LAMBDA', source
        )
        self.assertIn("'independentExactReevaluationCount': revalidation['independentExactReevaluationCount']", source)
        self.assertIn("'higherLambdaTargetReached': True", source)


if __name__ == "__main__":
    unittest.main()