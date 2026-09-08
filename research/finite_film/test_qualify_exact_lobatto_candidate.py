#!/usr/bin/env python3
"""Non-thermodynamic regressions for the exact-candidate stability runner."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


runner = load(
    "exact_lobatto_runner_test_subject",
    HERE / "qualify_exact_lobatto_candidate.py",
)
core = load(
    "exact_lobatto_core_test_subject",
    HERE / "check_candidate_stability.py",
)
np = __import__("numpy")


class ExactCandidateSyntheticTests(unittest.TestCase):
    def sparse_v10_document(self):
        def row(nodes):
            composition = np.asarray([0.1] * 6 + [0.4])
            controls = np.tile(composition, (nodes - 1, 4, 1))
            audit = {
                "status": "NUMERICAL_PROFILE_CHECKS_PASSED",
                "allBernsteinControlsNonnegative": True,
                "wholeCurveNonnegativeByConvexHull": True,
                "literalEndpointsEvaluatedAuthoritatively": True,
                "maximumNormalizationDefect": 0.0,
            }
            return {
                "status": "CONVERGED",
                "numericalAccepted": True,
                "reducedJacobian": {
                    "rank": 3, "dimension": 3, "fullRank": True,
                },
                "nodes": nodes,
                "flux": [0.1] * 7,
                "interfaceContinuous": composition.tolist(),
                "interfaceDispersed": composition.tolist(),
                "continuousProfile": {
                    "mesh": np.linspace(0, 1, nodes).tolist(),
                    "bernsteinControls": controls.tolist(),
                },
                "dispersedProfile": {
                    "mesh": np.linspace(0, 1, nodes).tolist(),
                    "bernsteinControls": controls.tolist(),
                },
                "continuousAudit": dict(audit),
                "dispersedAudit": dict(audit),
                "maximumScaledFluxDriftFromPrevious": 1e-9,
                "maximumInterfaceDriftFromPrevious": 1e-9,
                "maximumCommonCoordinateProfileDriftFromPrevious": 1e-9,
            }
        names = (
            "attempt_cell1_sparse_v10.py", "sparse_collocation_v10.py",
            "solver.py", "thermo_adapter.py", "exact_cache.py",
            "bernstein_profile_v5.py", "boundary_adapter.py",
            "verify_thermo.py",
        )
        archived = [row(nodes) for nodes in (33, 65, 129)]
        independent = [row(nodes) for nodes in (33, 65, 129)]
        target_hash = runner.root_fingerprint(archived[-1])
        document = {
            "schemaVersion": runner.SPARSE_V10_SCHEMA,
            "outcome": "NUMERICAL_CANDIDATE_FOR_MATCHED_STABILITY",
            "branches": [
                {"start": "ARCHIVED_17_WARM", "levels": archived},
                {"start": "INDEPENDENT_ORIENTED", "levels": independent},
            ],
            "input": {
                "continuousConductances": [1.0] * 7,
                "dispersedConductances": [1.0] * 7,
            },
            "qualificationDecision": {
                "qualified": True,
                "successiveQualifyingPair": [65, 129],
                "comparisonTargetRootHash": target_hash,
                "independentFinalQualified": True,
            },
            "candidateHash": target_hash,
            "gateSha256": runner.sha(
                runner.ROOT
                / "research-results/finite-film-boundary-qualification.json"
            ),
            "testSha256": runner.sha(
                runner.ROOT
                / "research-results/finite-film-sparse-collocation-v10-test-v6.json"
            ),
            "executedSourceSnapshots": {
                str((runner.HERE / name).relative_to(runner.ROOT)):
                    runner.sha(runner.HERE / name)
                for name in names
            },
        }
        return document

    def test_pure_nmp_logit_seed_has_inactive_finite_difference_trap(self):
        pure_nmp = np.zeros(7)
        pure_nmp[5] = 1.0
        logits = core.seed_logits(np, pure_nmp)
        step = np.sqrt(np.finfo(float).eps)
        gradients = []
        for i in range(6):
            direction = np.zeros(6)
            direction[i] = step
            gradients.append(
                (
                    -core.softmax(np, logits + direction)[0]
                    + core.softmax(np, logits - direction)[0]
                ) / (2.0 * step)
            )
        self.assertLess(max(abs(x) for x in gradients), 1e-10)
        q = pure_nmp[[0, 1, 2, 3, 4, 6]]
        moved = core.reduced_simplex(np, q + [1e-5, 0, 0, 0, 0, 0], 5)
        self.assertAlmostEqual(moved[0], 1e-5)
        self.assertAlmostEqual(moved[5], 1.0 - 1e-5)

    def test_mono_constraint_uses_exact_component_identity(self):
        self.assertEqual(runner.FAMILIES[runner.MONO_INDEX], "MONO")
        x = np.asarray((0.2, 0.5, 0.05, 0.03, 0.02, 0.15, 0.05))
        dependent = 0
        independent = [i for i in range(7) if i != dependent]
        rebuilt = core.reduced_simplex(np, x[independent], dependent)
        self.assertTrue(np.allclose(rebuilt, x, rtol=0.0, atol=2e-16))
        self.assertEqual(float(rebuilt[runner.MONO_INDEX]), 0.5)
        toward_mono = rebuilt.copy()
        toward_mono[runner.MONO_INDEX] += 1e-6
        toward_mono[0] -= 1e-6
        away_from_mono = rebuilt.copy()
        away_from_mono[runner.MONO_INDEX] -= 1e-6
        away_from_mono[0] += 1e-6
        self.assertGreaterEqual(toward_mono[runner.MONO_INDEX], 0.5)
        self.assertLess(away_from_mono[runner.MONO_INDEX], 0.5)

    def test_sparse_v10_requires_explicit_terminal_full_rank_candidate(self):
        document = self.sparse_v10_document()
        row, evidence = runner.admit_exact_candidate(
            document, "branches[0].levels[2]"
        )
        self.assertIs(row, document["branches"][0]["levels"][2])
        self.assertTrue(
            evidence[
                "allFinalPairRootsNumericalFullRankNormalizedAndProfileAccepted"
            ]
        )
        document["branches"][0]["levels"][1][
            "reducedJacobian"
        ]["fullRank"] = False
        with self.assertRaisesRegex(ValueError, "FINAL_PAIR"):
            runner.admit_exact_candidate(
                document, "branches[0].levels[2]"
            )

    def test_sparse_v10_rejects_inferred_or_nonterminal_row(self):
        document = self.sparse_v10_document()
        with self.assertRaisesRegex(ValueError, "FINAL_SELECTOR"):
            runner.admit_exact_candidate(
                document, "branches[0].levels[1]"
            )

    def test_sparse_v10_rejects_candidate_hash_or_drift_mismatch(self):
        document = self.sparse_v10_document()
        document["candidateHash"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "FINGERPRINT"):
            runner.admit_exact_candidate(
                document, "branches[0].levels[2]"
            )
        document = self.sparse_v10_document()
        document["branches"][0]["levels"][1][
            "maximumCommonCoordinateProfileDriftFromPrevious"
        ] = 1.1e-8
        with self.assertRaisesRegex(ValueError, "FINAL_PAIR"):
            runner.admit_exact_candidate(
                document, "branches[0].levels[2]"
            )

    def test_sparse_v10_root_hash_includes_bernstein_controls(self):
        document = self.sparse_v10_document()
        row = document["branches"][0]["levels"][2]
        original = runner.root_fingerprint(row)
        row["continuousProfile"]["bernsteinControls"][0][0][0] += 1e-15
        self.assertNotEqual(runner.root_fingerprint(row), original)

    def test_old_schemas_have_no_fallback(self):
        document = self.sparse_v10_document()
        document["schemaVersion"] = "ISOLATED_SAVED_CELL_1_SPARSE_V9_TERMINAL"
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED"):
            runner.admit_exact_candidate(
                document, "branches[0].levels[2]"
            )


if __name__ == "__main__":
    unittest.main()