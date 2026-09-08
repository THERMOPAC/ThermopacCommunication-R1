"""Focused numerical tests for the Job-C dense branch continuation helper."""
import importlib.util
from types import SimpleNamespace
import unittest
from pathlib import Path

import numpy as np
import scipy
import scipy.sparse


MODULE_PATH = Path("server/ecr-pre-pilot/job-c/branch_continuation.py")
SPEC = importlib.util.spec_from_file_location("job_c_branch_continuation", MODULE_PATH)
branch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(branch)

M = 7
N = 27 * M
ACTIVE = 7 * M + 5


class LinearProblem:
    """A square 189-equation manufactured problem with an affine branch."""

    def __init__(self, active_intercept, active_slope=-1.0):
        self.active_intercept = active_intercept
        self.active_slope = active_slope
        self.scales = np.ones(N)
        self.lower = np.r_[np.zeros(14 * M), -10 * np.ones(13 * M)]
        self.upper = 10 * np.ones(N)
        self.budget_checks = 0
        self.messages = []

    def target(self, lam):
        state = np.r_[np.ones(14 * M), 0.2 * np.ones(13 * M)]
        state[ACTIVE] = self.active_intercept + self.active_slope * lam
        return state

    def residual(self, state, lam):
        # Deliberately linear and unscaled, so every expected root is known.
        return np.asarray(state) - self.target(lam)

    def metrics(self, state, lam):
        residual = self.residual(state, lam)
        d = np.asarray(state)[7 * M:14 * M].reshape(M, 7)
        ev = {
            "d": d,
            "tr": np.zeros((M, 7)),
            "rd": residual[7 * M:14 * M].reshape(M, 7),
        }
        accepted = bool(
            np.max(np.abs(residual)) <= 1e-7
            and np.all(np.asarray(state)[:14 * M] > 0)
        )
        return ev, {"accepted": accepted}

    def check_budget(self):
        self.budget_checks += 1

    def progress(self, message):
        self.messages.append(message)

    def balance(self, ev, uncertainty=None):
        return branch.dispersed_cell1_balance(
            np, ev, dispersed_ct=7.0, dax=0.0, area=1.0, dz=1.0,
            uncertainty=uncertainty,
        )

    def driver(self, sparsity=None):
        return branch.BranchContinuation(
            np, scipy, self.residual, self.metrics, self.scales,
            self.lower, self.upper, M, self.balance, self.progress,
            self.check_budget, sparsity=sparsity,
        )


class OriginProblem(LinearProblem):
    """All dispersed NMP coordinates meet the algebraic branch at lambda zero."""

    nmp = np.arange(7 * M + 5, 14 * M, 7)

    def __init__(self):
        super().__init__(0.0)

    def target(self, lam):
        state = super().target(lam)
        state[self.nmp] = -lam
        return state


class BranchContinuationTests(unittest.TestCase):
    def test_cell1_nmp_face_signs_reproduce_original_rd_residual(self):
        d = np.ones((M, 7))
        d[0, 5] = 2.0
        d[1, 5] = 6.0
        # Equal row totals make cd[0,NMP]=2 and cd[1,NMP]=6.
        d[0, 0] = 5.0
        d[1, 0] = 1.0
        tr = np.zeros((M, 7))
        tr[0, 5] = -4.0
        rd = np.zeros((M, 7))
        ev = {"d": d, "tr": tr, "rd": rd}

        result = branch.dispersed_cell1_balance(
            np, ev, dispersed_ct=12.0, dax=0.5, area=1.0, dz=1.0
        )

        self.assertEqual(result["signedFaces"]["leftConvectionMolS"], -2.0)
        self.assertEqual(result["signedFaces"]["rightConvectionMolS"], -4.0)
        self.assertEqual(result["convectionMolS"], 2.0)
        self.assertEqual(result["signedFaces"]["leftBackmixingMolS"], 0.0)
        self.assertEqual(result["signedFaces"]["rightBackmixingMolS"], -2.0)
        self.assertEqual(result["axialBackmixingMolS"], 2.0)
        self.assertEqual(result["interphaseTransferMolS"], -4.0)
        self.assertEqual(result["residualMolS"], 0.0)
        self.assertEqual(result["originalFvResidualMolS"], rd[0, 5])
        self.assertEqual(result["decompositionDifferenceMolS"], 0.0)

    def test_active_coordinate_is_cell1_dispersed_nmp_not_legacy_103(self):
        driver = LinearProblem(0.5).driver()
        self.assertEqual(driver.active, ACTIVE)
        self.assertEqual(driver.active, 54)
        self.assertNotEqual(driver.active, 103)

        state = np.ones(N)
        state[ACTIVE] = -1e-5
        self.assertFalse(driver.domain(state))
        self.assertTrue(driver.domain(state, allow_active_negative=True))
        state[103] = -1e-5
        self.assertTrue(driver.domain(state, allow_active_negative=True))
        state[53] = -2e-2
        self.assertFalse(driver.domain(state, allow_active_negative=True))

    def test_signed_negative_root_is_diagnostic_and_never_accepted(self):
        problem = LinearProblem(0.5)
        driver = problem.driver()
        seed = problem.target(0.4999)
        state, report = driver.two_start_fixed(
            seed, 0.5001, diagnostic_signed=True
        )

        self.assertLess(state[ACTIVE], 0.0)
        self.assertTrue(report["independentlyConfirmed"])
        self.assertTrue(report["signedDiagnosticOnly"])
        self.assertFalse(report["accepted"])
        self.assertTrue(all(not row["accepted"] for row in report["attempts"]))
        self.assertTrue(all(
            not row["operatingStateEligible"] for row in report["attempts"]
        ))

    def test_true_zero_active_boundary_has_tight_two_start_bracket(self):
        problem = LinearProblem(0.5)
        driver = problem.driver()
        start_lam = 0.49
        state, report = driver.run(problem.target(start_lam), start_lam)

        self.assertIsNone(state)
        self.assertEqual(
            report["status"],
            "LOCAL_ACTIVE_NMP_BOUNDARY_RESOLVED_BEFORE_FULL_COUPLING",
        )
        boundary = report["physicalBoundary"]
        self.assertAlmostEqual(boundary["lambda"], 0.5, places=10)
        self.assertEqual(boundary["activeFlowMolS"], 0.0)
        self.assertTrue(boundary["activeConstraintResolved"])
        self.assertFalse(boundary["acceptedAsOperatingState"])
        self.assertEqual(len(boundary["attempts"]), 2)
        self.assertTrue(all(
            row["tightDiagnosticClosure"] for row in boundary["attempts"]
        ))
        bracket = report["terminalBracket"]
        self.assertTrue(bracket["resolved"])
        self.assertLess(bracket["lower"], 0.5)
        self.assertGreater(bracket["upper"], 0.5)
        self.assertGreater(report["lastAcceptedCell1NmpBalance"]["flowMolS"], 0)
        self.assertLess(report["firstRejectedCell1NmpBalance"]["flowMolS"], 0)
        terminal_signed = [
            attempt for attempt in report["attempts"]
            if attempt["lambda"] == bracket["upper"]
        ]
        self.assertEqual(len(terminal_signed), 1)
        self.assertTrue(terminal_signed[0]["signedDiagnosticOnly"])
        self.assertTrue(terminal_signed[0]["independentlyConfirmed"])
        self.assertFalse(terminal_signed[0]["accepted"])
        self.assertTrue(all(
            not row["accepted"]
            and not row["operatingStateEligible"]
            for row in terminal_signed[0]["attempts"]
        ))

    def test_full_coupling_returns_lambda_one_state_with_two_start_evidence(self):
        problem = LinearProblem(2.0)
        driver = problem.driver()
        start_lam = 0.1
        state, report = driver.run(problem.target(start_lam), start_lam)

        self.assertIsNotNone(state)
        np.testing.assert_allclose(state, problem.target(1.0), atol=2e-11, rtol=0)
        self.assertEqual(report["status"], "INDEPENDENTLY_CONFIRMED_FULL_COUPLING")
        self.assertTrue(report["fullCouplingAccepted"])
        self.assertEqual(report["lastAcceptedLambda"], 1.0)
        self.assertIsNone(report["firstRejectedLambda"])
        lambda_one = [
            row for row in report["attempts"] if row["lambda"] == 1.0
        ]
        self.assertTrue(lambda_one)
        self.assertTrue(lambda_one[-1]["independentlyConfirmed"])
        self.assertTrue(lambda_one[-1]["accepted"])
        self.assertEqual(len(lambda_one[-1]["attempts"]), 2)

    def test_tiny_current_flow_sign_is_unresolved_and_fd_spread_is_reported(self):
        problem = LinearProblem(0.0, active_slope=0.0)
        driver = problem.driver()
        state = problem.target(0.25)
        state[ACTIVE] = 1e-16

        uncertainty, derivative = driver.uncertainty(state, 0.25)
        checks = uncertainty["finiteDifferenceChecks"]
        expected_spread = abs(
            checks[0]["flowCorrectionMolS"]
            - checks[1]["flowCorrectionMolS"]
        )

        self.assertFalse(uncertainty["certifiedInterval"])
        self.assertFalse(uncertainty["signResolved"])
        self.assertFalse(uncertainty["positiveMarginResolved"])
        self.assertGreater(uncertainty["flowAbsoluteEstimateMolS"], state[ACTIVE])
        self.assertEqual(len(checks), 2)
        self.assertEqual(
            uncertainty["finiteDifferenceCorrectionSpreadMolS"],
            expected_spread,
        )
        self.assertGreaterEqual(expected_spread, 0.0)
        self.assertTrue(np.isfinite(expected_spread))
        self.assertAlmostEqual(derivative[ACTIVE], 0.0, places=12)

    def test_initial_uncertainty_timeout_leaves_truthful_latest_report(self):
        problem = LinearProblem(0.5)
        driver = problem.driver()
        start_lam = 0.49

        def timeout_on_initial_uncertainty():
            raise TimeoutError("forced during initial uncertainty")

        driver.check_budget = timeout_on_initial_uncertainty
        with self.assertRaisesRegex(
            TimeoutError, "forced during initial uncertainty"
        ):
            driver.run(problem.target(start_lam), start_lam)

        report = driver.latest_report
        self.assertEqual(report["lastAcceptedLambda"], start_lam)
        self.assertEqual(
            report["lastAcceptedQualification"],
            "EXISTING_GATES_ONLY_POSITIVE_MARGIN_UNRESOLVED",
        )
        self.assertTrue(report["startingGateMetrics"]["accepted"])
        self.assertIs(report["startingCell1NmpBalance"],
                      report["cell1NmpBalance"])
        balance = report["cell1NmpBalance"]
        self.assertEqual(balance["flowMolS"], problem.target(start_lam)[ACTIVE])
        self.assertEqual(balance["numericalCell"], 1)
        self.assertEqual(balance["component"], "NMP")
        pending = balance["numericalUncertainty"]
        self.assertEqual(
            pending["method"], "RESIDUAL_CORRECTION_NOT_YET_COMPUTED"
        )
        self.assertIsNone(pending["flowAbsoluteEstimateMolS"])
        self.assertFalse(pending["signResolved"])
        self.assertFalse(pending["positiveMarginResolved"])
        self.assertFalse(pending["certifiedInterval"])
        self.assertEqual(
            report["terminalBracket"],
            {"lower": start_lam, "upper": None, "width": None,
             "resolved": False},
        )
        self.assertFalse(report["physicalInfeasibilityClaimed"])
        self.assertFalse(report["fullCouplingAccepted"])
        self.assertNotIn("physicalBoundary", report)
        self.assertNotIn("status", report)

    def test_multiple_nmp_origin_is_separate_from_original_gate_bracket(self):
        problem = OriginProblem()
        start_lam = 9.9e-8
        start = problem.target(0.0)
        # The pre-existing gate point has strictly positive inventories but is
        # only tolerance-closed against the positive-lambda equations.
        start[problem.nmp] = 1e-14

        signed_driver = problem.driver()
        signed, signed_report = signed_driver.two_start_fixed(
            start, start_lam, diagnostic_signed=True
        )
        np.testing.assert_allclose(
            signed[problem.nmp], -start_lam, atol=2e-14, rtol=0
        )
        self.assertTrue(signed_report["independentlyConfirmed"])
        self.assertFalse(signed_report["accepted"])
        self.assertTrue(all(
            row["tightDiagnosticClosure"]
            and not row["accepted"]
            and not row["operatingStateEligible"]
            for row in signed_report["attempts"]
        ))

        driver = problem.driver()
        state, report = driver.run(start, start_lam)

        self.assertIsNone(state)
        self.assertEqual(
            report["status"], "LOCAL_SIGNED_MULTI_INVENTORY_ROOT_NEAR_ZERO_COUPLING"
        )
        self.assertNotIn("noResolvedPositiveLambdaInterval", report)
        self.assertFalse(report["positiveIntervalExistenceClaimed"])
        self.assertFalse(report["fullCouplingAccepted"])
        self.assertFalse(report["physicalInfeasibilityClaimed"])
        physical = report["physicalBoundary"]
        self.assertFalse(physical["activeConstraintResolved"])
        self.assertTrue(physical["signedNearOriginRootReproduced"])
        self.assertFalse(physical["uniquePhysicalLimiterResolved"])
        self.assertTrue(
            physical["includesLambdaZeroWithinEstimatedUncertainty"]
        )
        self.assertLessEqual(
            abs(physical["lambda"]),
            physical["numericalUncertainty"]["lambdaAbsoluteEstimate"],
        )
        self.assertFalse(physical["acceptedAsOperatingState"])
        self.assertEqual(
            physical["qualification"],
            "LOCAL_ZERO_ACTIVE_BOUNDARY_NOT_GLOBAL_INFEASIBILITY",
        )

        gate = report["terminalBracket"]
        self.assertTrue(gate["resolved"])
        self.assertEqual(
            gate["qualification"],
            "TWO_START_CONFIRMATION_INTERVAL_NOT_PHYSICAL_BOUNDARY",
        )
        self.assertGreater(gate["lower"], 1e-8)
        self.assertGreater(gate["upper"], gate["lower"])
        self.assertLessEqual(gate["width"], 1e-9)
        self.assertGreater(
            gate["lower"],
            physical["numericalUncertainty"]["lambdaAbsoluteEstimate"],
        )
        self.assertEqual(report["lastAcceptedLambda"], gate["lower"])
        self.assertEqual(report["firstRejectedLambda"], gate["upper"])
        self.assertEqual(
            report["lastAcceptedQualification"],
            "EXISTING_GATES_ONLY_POSITIVE_MARGIN_UNRESOLVED",
        )
        self.assertLess(
            report["signedStartingRootDiagnostic"]["attempts"][0]
            ["cell1NmpBalance"]["flowMolS"],
            0.0,
        )
        self.assertFalse(report["signedStartingRootDiagnostic"]["accepted"])

    def test_colored_sparse_fd_reconstructs_dense_linear_jacobian(self):
        problem = LinearProblem(0.5)
        dense_driver = problem.driver()
        sparse_driver = problem.driver(
            sparsity=scipy.sparse.eye(N, format="csr")
        )
        state = problem.target(0.25)
        fun = lambda value: problem.residual(value, 0.25)

        dense = dense_driver.jacobian(fun, state)
        colored = sparse_driver.jacobian(fun, state)

        self.assertIsInstance(colored, np.ndarray)
        self.assertEqual(colored.shape, (N, N))
        np.testing.assert_allclose(colored, dense, atol=2e-10, rtol=0)
        np.testing.assert_allclose(colored, np.eye(N), atol=2e-10, rtol=0)

    def test_gate_bracket_rejects_one_pass_one_capped_start(self):
        problem = LinearProblem(2.0)
        calls = {"count": 0}

        def fake_least_squares(fun, initial, **kwargs):
            calls["count"] += 1
            state = np.asarray(initial).copy()
            first_start = calls["count"] % 2 == 1
            state[0] = 1.0 if first_start else 2.0
            return SimpleNamespace(
                x=state,
                nfev=1 if first_start else kwargs["max_nfev"],
                status=1 if first_start else 0,
            )

        fake_scipy = SimpleNamespace(optimize=SimpleNamespace(
            _numdiff=scipy.optimize._numdiff,
            least_squares=fake_least_squares,
        ))
        original_metrics = problem.metrics

        def marker_metrics(state, lam):
            ev, gates = original_metrics(state, lam)
            gates["accepted"] = bool(state[0] < 1.5)
            return ev, gates

        problem.metrics = marker_metrics
        driver = branch.BranchContinuation(
            np, fake_scipy, problem.residual, problem.metrics, problem.scales,
            problem.lower, problem.upper, M, problem.balance, problem.progress,
            problem.check_budget,
        )
        lower = 0.1
        result = driver.gate_bracket(
            problem.target(lower), lower, lower + 2e-9
        )

        self.assertLessEqual(result["width"], 1e-9)
        self.assertFalse(result["resolved"])
        self.assertEqual(result["upperOriginalGateAcceptedStartCount"], 1)
        self.assertTrue(result["upperEvaluationLimitReached"])
        self.assertFalse(result["lowerEndpointConfirmedByBracketSolver"])
        self.assertEqual(
            result["qualification"],
            "TWO_START_CONFIRMATION_INTERVAL_NOT_PHYSICAL_BOUNDARY",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)