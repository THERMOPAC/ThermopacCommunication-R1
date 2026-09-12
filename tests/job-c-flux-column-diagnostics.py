"""Offline regression checks; no worker, engine build, or Job-C run."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/"dist/predictive-nt-runtime-7c-1-5/server/research/ecr-pre-pilot-cosmosac/vendor/python"))
import numpy as np
import scipy

spec = importlib.util.spec_from_file_location("flux_diagnostic",
    ROOT/"scripts/diagnose-job-c-flux-columns.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class OfflineFluxChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.request = json.loads((ROOT/"research-results/job-c-flux-column-evidence/request.json").read_text())["prepared"]["workerRequest"]
        cls.checkpoint = json.loads((ROOT/"research-results/job-c-flux-column-evidence/checkpoint.json").read_text())
        cls.value = cls.checkpoint["completedResults"][0]["value"]
        cls.cm = d.a.load_module("test_candidate_only", ROOT/d.a.WORKER_RELATIVE_PATHS[1])

    def test_capture_hashes_and_corruption_refusal(self):
        v = d.a.load_module("test_capture_validator", ROOT/"scripts/replay-job-c-rejection.py")
        v._find_selected_trial(self.checkpoint, self.checkpoint["completedResults"][0]["id"])
        with self.assertRaises(v.ReplayRefused):
            v._find_selected_trial({**self.checkpoint, "complete":True},
                self.checkpoint["completedResults"][0]["id"])
        request_hash = v.digest(v.checkpoint_request_payload(self.request))
        v._validate_capture(self.value, request_hash, ROOT)
        broken = json.loads(json.dumps(self.value))
        broken["coupledAttempts"][0]["jacobianAudit"]["diagnosticLinearization"]["jacobian"][0][0] += 1
        with self.assertRaises(v.ReplayRefused):
            v._validate_capture(broken, request_hash, ROOT)

    def test_analytic_column_unsaturated_and_saturated(self):
        class Engine:
            def mu(self, x, temperature):
                return np.zeros(7)
        engine = Engine()
        engine.np, engine.scipy = np, scipy
        r = self.request
        solver = self.cm.CandidateInterfaceSolver(engine, r["temperatureK"],
            r["kc"], r["kd"], r["continuousTotalConcentrationMolM3"],
            r["dispersedTotalConcentrationMolM3"], r["phaseConfiguration"])
        residual = d.a.exact_residual_factory(np, engine, self.cm, r, 1e-8)
        x = np.array(self.value["state"])
        for cell in (4, 5):
            k = 98+13*cell+12
            x[k] = .5
            analytic = d.column(np, r, solver, residual(x), cell, 1e-8, x[k])
            xp, xm = x.copy(), x.copy()
            xp[k] += 1e-3
            xm[k] -= 1e-3
            fd = (residual(xp)["residual"]-residual(xm)["residual"])/(xp[k]-xm[k])
            np.testing.assert_allclose(fd, analytic, atol=2e-12, rtol=2e-6)
            # Stable sech-squared does not collapse at a binary64 tanh plateau.
            x[k] = 25.
            saturated = d.column(np, r, solver, residual(x), cell, 1e-8, x[k])
            self.assertGreater(np.linalg.norm(saturated), 0.)
            self.assertEqual(np.tanh(25.), 1.)

    def test_saved_probe_results_and_bound_checks(self):
        report = json.loads((ROOT/"research-results/job-c-flux-column-diagnostics.json").read_text())
        v = d.a.load_module("test_report_digest", ROOT/"scripts/replay-job-c-rejection.py")
        self.assertEqual(report["reportSha256"],
            v.digest({k:value for k,value in report.items() if k != "reportSha256"}))
        for path, expected in report["diagnosticSourceSha256"].items():
            self.assertEqual(d.a.sha256_file(Path(path)), expected)
        for path, expected in report["workerFilesSha256"].items():
            self.assertEqual(d.a.sha256_file(ROOT/path), expected)
        self.assertTrue(report["diagnosticOnly"])
        self.assertEqual(len(report["states"]), 3)
        for state in report["states"]:
            self.assertEqual(state["residualReplayMaxError"], 0.)
            for col in state["columns"]:
                for key in ("defaultCapturedMaxError", "coloredIndividualMaxError",
                            "cachedUncachedMaxError", "cacheRepeatMaxError", "outsideMaskIndividualMax"):
                    self.assertEqual(col[key], 0., key)
                self.assertEqual(col["filmCancellation"]["frozenFilmResidualReplayMaxError"], 0.)
            for correction in state["corrections"]:
                self.assertEqual(len(correction["correction"]), 189)
                for sample in correction["samples"]:
                    self.assertGreater(sample["metrics"]["minimumFlowMolS"], 0.)
                    self.assertEqual(len(sample["stateSha256"]), 64)


if __name__ == "__main__":
    unittest.main()