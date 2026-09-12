#!/usr/bin/env python3
"""Offline regression tests for the bound-aware Job-C qualification evidence.

These tests deliberately load the qualification helper and saved evidence only.
They do not invoke the Job-C worker, start a case, run continuation, or write
any research artifact.
"""
from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "dist/predictive-nt-runtime-7c-1-5"
VENDOR = RUNTIME / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
if VENDOR.is_dir():
    sys.path.insert(0, str(VENDOR))

import numpy as np
import scipy
from scipy.optimize._numdiff import (
    _adjust_scheme_to_bounds,
    approx_derivative,
    _compute_absolute_step,
    group_columns,
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


qualify = load_module(
    "job_c_bound_aware_qualification_test_subject",
    ROOT / "scripts/qualify-job-c-bound-aware.py",
)
replay = load_module(
    "job_c_bound_aware_replay_test_subject",
    ROOT / "scripts/replay-job-c-rejection.py",
)


REPORT_PATH = ROOT / "research-results/job-c-bound-aware-qualification.json"
DIAGNOSTICS_PATH = ROOT / "research-results/job-c-flux-column-diagnostics.json"
DIAGNOSTICS_MARKDOWN_PATH = (
    ROOT / "research-results/job-c-flux-column-diagnostics.md"
)
REQUEST_PATH = ROOT / "research-results/job-c-flux-column-evidence/request.json"
CHECKPOINT_PATH = ROOT / "research-results/job-c-flux-column-evidence/checkpoint.json"
ARTIFACT_PATH = RUNTIME
SELECTION_ID = "coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08"


class BoundAwareQualificationEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
        cls.diagnostics = json.loads(DIAGNOSTICS_PATH.read_text(encoding="utf-8"))
        cls.request_wrapper = json.loads(REQUEST_PATH.read_text(encoding="utf-8"))
        cls.request = cls.request_wrapper["prepared"]["workerRequest"]
        cls.checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
        cls.selected = replay._find_selected_trial(
            cls.checkpoint, SELECTION_ID
        )
        request_hash = replay.digest(
            replay.checkpoint_request_payload(cls.request)
        )
        cls.capture, cls.audits = replay._validate_capture(
            cls.selected, request_hash, ROOT
        )
        cls.audit_by_state = {
            audit["stateSha256"]: audit for audit in cls.audits
        }

    def test_report_digest_and_complete_source_lineage_are_exact(self):
        report_payload = copy.deepcopy(self.report)
        report_payload.pop("reportSha256", None)
        self.assertEqual(
            self.report["reportSha256"], replay.digest(report_payload)
        )
        diagnostics_payload = copy.deepcopy(self.diagnostics)
        diagnostics_payload.pop("reportSha256", None)
        self.assertEqual(
            self.diagnostics["reportSha256"],
            replay.digest(diagnostics_payload),
        )

        lineage = self.report["lineage"]
        self.assertEqual(
            self.report["schemaVersion"],
            "JOB_C_BOUND_AWARE_QUALIFICATION_V1",
        )
        self.assertEqual(self.report["selectionId"], SELECTION_ID)
        self.assertEqual(
            lineage["selectedStateSha256"], self.selected["stateSha256"]
        )
        self.assertEqual(lineage["captureSha256"], self.capture["captureSha256"])
        self.assertEqual(
            lineage["requestSha256"], self.capture["requestSha256"]
        )
        self.assertEqual(
            lineage["pinnedRuntime"], self.diagnostics["runtime"]
        )
        self.assertEqual(
            lineage["qualificationScriptSha256"],
            qualify.sha256_file(
                ROOT / "scripts/qualify-job-c-bound-aware.py"
            ),
        )
        self.assertEqual(
            lineage["requestFileSha256"], qualify.sha256_file(REQUEST_PATH)
        )
        self.assertEqual(
            lineage["checkpointFileSha256"],
            qualify.sha256_file(CHECKPOINT_PATH),
        )
        self.assertEqual(
            lineage["diagnosticsFileSha256"],
            qualify.sha256_file(DIAGNOSTICS_PATH),
        )
        self.assertEqual(
            lineage["diagnosticsMarkdownSha256"],
            qualify.sha256_file(DIAGNOSTICS_MARKDOWN_PATH),
        )
        reference = ROOT / self.diagnostics["sourceReference"]
        self.assertEqual(
            lineage["referenceSha256"], qualify.sha256_file(reference)
        )

        for relative, expected in lineage["workerFilesSha256"].items():
            self.assertEqual(
                qualify.sha256_file(ROOT / relative),
                expected,
                relative,
            )
        engine = ARTIFACT_PATH / (
            "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
        )
        manifest = ARTIFACT_PATH / "predictive-nt-runtime-manifest.json"
        self.assertEqual(
            lineage["scientificEngineSha256"], qualify.sha256_file(engine)
        )
        self.assertEqual(
            lineage["runtimeManifestSha256"], qualify.sha256_file(manifest)
        )
        self.assertEqual(
            lineage["sparsityHelperSourceSha256"],
            lineage["workerFilesSha256"][
                "server/ecr-pre-pilot/job-c/worker.py"
            ],
        )

        for recorded, expected in self.diagnostics[
            "diagnosticSourceSha256"
        ].items():
            self.assertEqual(
                qualify.sha256_file(ROOT / "scripts" / Path(recorded).name),
                expected,
                recorded,
            )
        self.assertEqual(
            self.diagnostics["referenceFileSha256"],
            qualify.sha256_file(reference),
        )
        self.assertEqual(
            self.diagnostics["inputFileSha256"],
            qualify.sha256_file(REQUEST_PATH),
        )
        self.assertEqual(
            self.diagnostics["checkpointFileSha256"],
            qualify.sha256_file(CHECKPOINT_PATH),
        )
        self.assertEqual(
            self.diagnostics["captureSha256"], self.capture["captureSha256"]
        )

    def test_captured_and_attempted_state_residual_hashes_are_exact(self):
        self.assertEqual(len(self.report["states"]), 3)
        for state_row in self.report["states"]:
            state_hash = state_row["stateSha256"]
            audit = self.audit_by_state[state_hash]
            self.assertEqual(
                state_row["capturedResidualSha256"],
                audit["residualSha256"],
            )
            self.assertEqual(
                state_row["capturedJacobianSha256"],
                audit["jacobianSha256"],
            )
            self.assertEqual(
                qualify.finite_vector_hash(replay, audit["state"]),
                state_hash,
            )
            self.assertEqual(
                qualify.finite_vector_hash(replay, audit["residual"]),
                audit["residualSha256"],
            )

            for method in state_row["methods"]:
                self.assertEqual(
                    method["initialStateSha256"], state_hash
                )
                for iteration in method["iterations"]:
                    self.assertEqual(
                        len(iteration["correction"]),
                        qualify.DIMENSION,
                    )
                    self.assertEqual(
                        iteration["correctionSha256"],
                        qualify.finite_vector_hash(
                            replay, iteration["correction"]
                        ),
                    )
                    for trial in iteration["trials"]:
                        self.assertEqual(
                            len(trial["state"]), qualify.DIMENSION
                        )
                        self.assertEqual(
                            len(trial["residual"]), qualify.DIMENSION
                        )
                        self.assertEqual(
                            trial["stateSha256"],
                            qualify.finite_vector_hash(
                                replay, trial["state"]
                            ),
                        )
                        self.assertEqual(
                            trial["residualSha256"],
                            qualify.finite_vector_hash(
                                replay, trial["residual"]
                            ),
                        )
                final = method["final"]
                self.assertEqual(
                    final["stateSha256"],
                    qualify.finite_vector_hash(replay, final["state"]),
                )
                self.assertEqual(
                    final["residualSha256"],
                    qualify.finite_vector_hash(replay, final["residual"]),
                )

    def test_all_saved_states_stay_inside_captured_bounds(self):
        for state_row in self.report["states"]:
            audit = self.audit_by_state[state_row["stateSha256"]]
            lower = np.asarray(audit["lowerBounds"], dtype=float)
            upper = np.asarray(audit["upperBounds"], dtype=float)
            initial = np.asarray(audit["state"], dtype=float)
            self.assertTrue(np.all(initial >= lower))
            self.assertTrue(np.all(initial <= upper))

            for method in state_row["methods"]:
                for iteration in method["iterations"]:
                    for trial in iteration["trials"]:
                        state = np.asarray(trial["state"], dtype=float)
                        self.assertTrue(
                            np.all(np.isfinite(state))
                        )
                        self.assertTrue(np.all(state > lower))
                        self.assertTrue(np.all(state < upper))

    def test_all_three_captured_full_fd_replays_are_exact(self):
        self.assertEqual(len(self.report["states"]), 3)
        for state_row in self.report["states"]:
            replay_fields = state_row["capturedStateRefreshVerification"]
            self.assertEqual(
                replay_fields["source"],
                "REFRESHED_FINITE_DIFFERENCE_AT_CAPTURED_STATE",
            )
            self.assertTrue(replay_fields["matchesCapturedJacobian"])
            self.assertEqual(
                replay_fields["maxAbsoluteDifferenceFromCaptured"], 0.0
            )
            self.assertEqual(
                replay_fields["capturedJacobianSha256"],
                state_row["capturedJacobianSha256"],
            )
            self.assertEqual(
                replay_fields["jacobianSha256"],
                state_row["capturedJacobianSha256"],
            )
            self.assertEqual(
                replay_fields["method"],
                "PINNED_SCIPY_3_POINT_COLOURED_CENTRAL_OR_BOUND_ADJUSTED",
            )
            self.assertEqual(
                replay_fields["probeCount"],
                2 * replay_fields["colorCount"],
            )
            self.assertEqual(
                replay_fields["probeCount"],
                len(replay_fields["probes"]) * 2,
            )
            self.assertEqual(
                replay_fields["oneSidedCoordinates"],
                sorted(replay_fields["oneSidedCoordinates"]),
            )

    def test_true_unchanged_metrics_and_gate_booleans_are_not_replaced(self):
        threshold = qualify.GATE_THRESHOLD
        self.assertFalse(self.report["boundsScalesAndGates"]["gatesSoftened"])
        self.assertEqual(
            self.report["boundsScalesAndGates"]["originalJobBGateMetric"],
            "maximumOriginalJobBGateResidual",
        )
        for state_row in self.report["states"]:
            for method in state_row["methods"]:
                records = [
                    trial
                    for iteration in method["iterations"]
                    for trial in iteration["trials"]
                ]
                records.append(method["final"])
                for record in records:
                    metrics = record["metrics"]
                    checks = record["unchangedGateChecks"]
                    expected_checks = {
                        "rawFvResidualMolS<=1e-7": (
                            metrics["rawFvResidualMolS"] <= threshold
                        ),
                        "scaledFvResidual<=1e-7": (
                            metrics["scaledFvResidual"] <= threshold
                        ),
                        "originalJobBGateResidual<=1e-7": (
                            metrics["maximumOriginalJobBGateResidual"]
                            <= threshold
                        ),
                        "strictPositiveFlow": (
                            metrics["minimumFlowMolS"] > 0.0
                        ),
                    }
                    self.assertEqual(checks, expected_checks)
                    self.assertEqual(
                        record["allFourResidualThresholdsPassed"],
                        all(expected_checks.values()),
                    )
                    self.assertEqual(
                        metrics["originalJobBGateMetric"],
                        metrics["maximumOriginalJobBGateResidual"],
                    )
                    self.assertEqual(
                        metrics["thresholds"]["rawFvResidualMolS"],
                        threshold,
                    )
                    self.assertEqual(
                        metrics["thresholds"]["scaledFvResidual"],
                        threshold,
                    )
                    self.assertEqual(
                        metrics["thresholds"][
                            "maximumOriginalJobBGateResidual"
                        ],
                        threshold,
                    )
                    self.assertEqual(
                        metrics["thresholds"]["minimumFlowMolS"], 0.0
                    )

    def test_attempted_step_acceptance_is_true_residual_monotone(self):
        for state_row in self.report["states"]:
            for method in state_row["methods"]:
                self.assertLessEqual(
                    len(method["iterations"]), qualify.MAX_CORRECTIONS
                )
                accepted_count = 0
                previous_accepted_state = None
                for iteration in method["iterations"]:
                    if previous_accepted_state is not None:
                        self.assertEqual(
                            iteration["startingStateSha256"],
                            previous_accepted_state["stateSha256"],
                        )
                    self.assertLessEqual(
                        len(iteration["trials"]), qualify.MAX_BACKTRACKS
                    )
                    self.assertEqual(
                        iteration["correctionIndex"],
                        len(
                            [
                                prior
                                for prior in method["iterations"]
                                if prior["correctionIndex"]
                                <= iteration["correctionIndex"]
                            ]
                        ),
                    )
                    for index, trial in enumerate(iteration["trials"]):
                        self.assertEqual(trial["backtrackIndex"], index)
                        expected_scale = iteration["trustRegionScale"] * (
                            qualify.BACKTRACK_FACTOR ** index
                        )
                        self.assertAlmostEqual(
                            trial["trialScale"], expected_scale, places=14
                        )
                        base_l2 = iteration["startingResidualL2"]
                        actual_decrease = base_l2 - trial["residualL2"]
                        self.assertAlmostEqual(
                            trial["trueResidualDecrease"],
                            actual_decrease,
                            delta=max(1e-18, abs(base_l2) * 1e-12),
                        )
                        expected_true_decrease = trial["residualL2"] < (
                            base_l2
                            * (
                                1.0
                                - qualify.LINE_SEARCH_DECREASE_RELATIVE_TOLERANCE
                            )
                        )
                        self.assertEqual(
                            trial["trueResidualDecreaseDecision"],
                            expected_true_decrease,
                        )
                        expected_acceptance = (
                            expected_true_decrease
                            and trial["unchangedGateChecks"][
                                "strictPositiveFlow"
                            ]
                        )
                        self.assertEqual(
                            trial["accepted"], expected_acceptance
                        )
                        if trial["accepted"]:
                            accepted_count += 1
                            self.assertLess(trial["residualL2"], base_l2)
                            self.assertEqual(
                                index, len(iteration["trials"]) - 1
                            )
                            previous_accepted_state = trial
                    self.assertEqual(
                        iteration["accepted"],
                        any(trial["accepted"] for trial in iteration["trials"]),
                    )
                self.assertEqual(method["acceptedStateCount"], accepted_count)
                self.assertLessEqual(
                    accepted_count, qualify.MAX_CORRECTIONS
                )

    def test_no_local_threshold_candidate_is_scientific_acceptance(self):
        self.assertTrue(self.report["diagnosticOnly"])
        self.assertTrue(self.report["noWorkerOrContinuationInvoked"])
        self.assertTrue(self.report["noDatabaseAccess"])
        self.assertTrue(self.report["noProductionModification"])
        self.assertTrue(
            self.report["recommendation"].startswith("DO_NOT_PROMOTE_OR_PATCH")
        )
        summary = self.report["summary"]
        budgets = self.report["budgets"]
        self.assertEqual(
            budgets["maximumSequentialCorrections"],
            qualify.MAX_CORRECTIONS,
        )
        self.assertEqual(
            budgets["maximumTrueResidualTrialsPerCorrection"],
            qualify.MAX_BACKTRACKS,
        )
        self.assertEqual(budgets["backtrackFactor"], qualify.BACKTRACK_FACTOR)
        self.assertEqual(
            budgets["linearSubproblemTolerance"],
            qualify.LINEAR_SUBPROBLEM_TOLERANCE,
        )
        self.assertEqual(
            budgets["linearSubproblemMaximumIterations"],
            qualify.LINEAR_SUBPROBLEM_MAX_ITERATIONS,
        )
        for key in (
            "independentStartReproduction",
            "localStability",
            "continuationRange",
            "designAcceptance",
        ):
            self.assertEqual(summary[key], "NOT_ASSESSED")

        calculated_candidates = 0
        for state_row in self.report["states"]:
            for method in state_row["methods"]:
                candidate = any(
                    trial["allFourResidualThresholdsPassed"]
                    for iteration in method["iterations"]
                    for trial in iteration["trials"]
                )
                self.assertEqual(bool(method["localThresholdCandidate"]), candidate)
                self.assertEqual(
                    method["candidateClassification"],
                    (
                        "LOCAL_THRESHOLD_CANDIDATE_ONLY"
                        if candidate
                        else "NO_LOCAL_THRESHOLD_CANDIDATE"
                    ),
                )
                if candidate:
                    calculated_candidates += 1
                self.assertEqual(
                    method["reproductionStatus"], "NOT_ASSESSED"
                )
                self.assertEqual(method["stabilityStatus"], "NOT_ASSESSED")
                self.assertEqual(method["designStatus"], "NOT_ASSESSED")
                self.assertEqual(
                    method["productionPromotion"], "NOT_RECOMMENDED"
                )
        self.assertEqual(
            summary["localThresholdCandidateCount"], calculated_candidates
        )

    def test_tampered_saved_evidence_is_rejected_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            temporary_path = Path(temporary)

            tampered_diagnostics = copy.deepcopy(self.diagnostics)
            tampered_diagnostics["states"][0]["residualReplayMaxError"] = 1.0
            diagnostics_path = temporary_path / "diagnostics.json"
            diagnostics_path.write_text(
                json.dumps(tampered_diagnostics), encoding="utf-8"
            )
            args = qualify.parser().parse_args([])
            args.diagnostics = str(diagnostics_path)
            args.diagnostic_markdown = str(DIAGNOSTICS_MARKDOWN_PATH)
            args.checkpoint = str(CHECKPOINT_PATH)
            args.request = str(REQUEST_PATH)
            args.runtime_root = str(ROOT)
            args.runtime_artifact_root = str(ARTIFACT_PATH)
            args.selection_id = SELECTION_ID
            with self.assertRaisesRegex(
                qualify.QualificationRefused,
                "FLUX_DIAGNOSTICS_REPORT_HASH_MISMATCH",
            ):
                qualify.validate_integrity(args, replay)

            tampered_checkpoint = copy.deepcopy(self.checkpoint)
            tampered_checkpoint["completedResults"][0]["value"][
                "stateSha256"
            ] = "0" * 64
            checkpoint_path = temporary_path / "checkpoint.json"
            checkpoint_path.write_text(
                json.dumps(tampered_checkpoint), encoding="utf-8"
            )
            args = qualify.parser().parse_args([])
            args.diagnostics = str(DIAGNOSTICS_PATH)
            args.diagnostic_markdown = str(DIAGNOSTICS_MARKDOWN_PATH)
            args.checkpoint = str(checkpoint_path)
            args.request = str(REQUEST_PATH)
            args.runtime_root = str(ROOT)
            args.runtime_artifact_root = str(ARTIFACT_PATH)
            args.selection_id = SELECTION_ID
            with self.assertRaisesRegex(
                qualify.QualificationRefused,
                "IMMUTABLE_CHECKPOINT_FILE_HASH_MISMATCH",
            ):
                qualify.validate_integrity(args, replay)

    def test_coloured_three_point_fd_matches_scipy_on_sided_bounds(self):
        dimension = qualify.DIMENSION
        state = np.full(dimension, 0.2, dtype=float)
        lower = np.full(dimension, -1.0, dtype=float)
        upper = np.full(dimension, 1.0, dtype=float)
        state[0] = lower[0]
        state[1] = upper[1]

        sparsity = np.zeros((dimension, dimension), dtype=bool)
        for row in range(dimension):
            for offset in (0, 1, 2):
                sparsity[row, (row + offset) % dimension] = True
        colors = group_columns(scipy.sparse.csr_matrix(sparsity))
        calls = []

        def residual(state_value):
            value = np.asarray(state_value, dtype=float)
            calls.append(value.copy())
            shifted_one = np.roll(value, -1)
            shifted_two = np.roll(value, -2)
            vector = (
                np.sin(value)
                + 0.03 * value**3
                + 0.2 * np.cos(value) * shifted_one
                + 0.04 * shifted_two**2
            )
            return {"residual": vector}

        residual_vector = residual(state)["residual"]
        step = _compute_absolute_step(
            None, state, residual_vector, "3-point"
        )
        _, expected_one_sided = _adjust_scheme_to_bounds(
            state, step, 1, "2-sided", lower, upper
        )
        self.assertTrue(expected_one_sided[0])
        self.assertTrue(expected_one_sided[1])

        matrix, metadata = qualify.finite_difference_jacobian(
            replay,
            np,
            scipy,
            residual,
            state,
            residual_vector,
            lower,
            upper,
            sparsity,
            colors,
            (_compute_absolute_step, _adjust_scheme_to_bounds),
        )
        qualification_probe_count = len(calls) - 1
        expected_sparse = approx_derivative(
            lambda value: residual(value)["residual"],
            state,
            method="3-point",
            bounds=(lower, upper),
            sparsity=scipy.sparse.csr_matrix(sparsity),
        )
        expected = expected_sparse.toarray()
        self.assertTrue(np.array_equal(matrix, expected))
        self.assertEqual(
            metadata["method"],
            "PINNED_SCIPY_3_POINT_COLOURED_CENTRAL_OR_BOUND_ADJUSTED",
        )
        self.assertEqual(
            metadata["oneSidedCoordinates"],
            np.flatnonzero(expected_one_sided).tolist(),
        )
        self.assertGreaterEqual(len(metadata["oneSidedCoordinates"]), 2)
        self.assertEqual(
            metadata["probeCount"], 2 * metadata["colorCount"]
        )
        self.assertEqual(metadata["probeCount"], qualification_probe_count)
        self.assertTrue(
            all(
                np.all(probe_state >= lower)
                and np.all(probe_state <= upper)
                for probe_state in calls
            )
        )
        self.assertEqual(matrix.shape, (dimension, dimension))
        self.assertTrue(np.all(np.isfinite(matrix)))


if __name__ == "__main__":
    unittest.main(verbosity=2)