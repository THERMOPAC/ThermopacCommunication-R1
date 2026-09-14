"""Fast isolation tests for the Stage-4 dogbox exact thermodynamic cache."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
DOGBOX = ROOT / "dist/stage4-job-b-dogbox-runtime"
os.environ.update({
    "STAGE4_JOB_B_DOGBOX_RUNTIME_ROOT": str(DOGBOX),
    "STAGE4_JOB_B_LEGACY_RUNTIME_ROOT": str(ROOT / "dist/job-b-interface-runtime"),
    "STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL": "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1",
    "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT": str(ROOT / "dist/stage4-seven-component-adapter-runtime"),
    "STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT": str(ROOT / "dist/predictive-nt-runtime-7c-1-5"),
    "JOB_B_INTERFACE_PROTOCOL": "ECR_JOB_B_INTERFACE_V1",
    "PYTHONDONTWRITEBYTECODE": "1",
})
SPEC = importlib.util.spec_from_file_location(
    "stage4_dogbox_exact_cache_test",
    DOGBOX / "server/ecr-pre-pilot/job-b-interface-stage4-dogbox/worker.py",
)
assert SPEC and SPEC.loader
SUBJECT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUBJECT)


class FakeOptimize:
    def least_squares(self, residual, *_args, **_kwargs):
        return [residual(), residual()]


class FakeScipy:
    def __init__(self):
        self.optimize = FakeOptimize()


class FakeModel:
    def __init__(self, np):
        self.np = np
        self.calls = 0

    def wet_lngamma(self, _np, _temperature, composition):
        self.calls += 1
        return self.np.asarray(composition, dtype=float) + self.calls


class FakeEngine:
    def __init__(self, np):
        self.np = np
        self.scipy = FakeScipy()
        self.model = FakeModel(np)


class ExactCacheIsolationTest(unittest.TestCase):
    def setUp(self):
        import numpy as np
        self.np = np
        self.engine = FakeEngine(np)
        self.diagnostics = SUBJECT._install_exact_wet_lngamma_cache(self.engine)

    def test_scopes_exact_keys_and_returns_copies(self):
        np = self.np

        def residual():
            first = self.engine.model.wet_lngamma(np, 333.15, np.asarray([.1, .9]))
            first[0] = -999  # Must not corrupt the cached immutable result.
            second = self.engine.model.wet_lngamma(np, 333.15, np.asarray([.1, .9]))
            # One ULP is not an approximate-cache hit.
            third = self.engine.model.wet_lngamma(
                np, 333.15, np.asarray([np.nextafter(.1, 1.0), .9]),
            )
            return second, third

        first, second = self.engine.scipy.optimize.least_squares(residual)
        self.assertEqual(self.diagnostics["calls"], 6)
        self.assertEqual(self.diagnostics["hits"], 4)
        self.assertEqual(self.diagnostics["misses"], 2)
        self.assertEqual(self.diagnostics["evictions"], 0)
        self.assertEqual(first[0][0], 1.1)
        self.assertEqual(second[0][0], 1.1)

    def test_cache_is_off_after_each_solver_and_isolated_per_engine(self):
        np = self.np
        self.engine.scipy.optimize.least_squares(
            lambda: self.engine.model.wet_lngamma(np, 333.15, np.asarray([.2, .8])),
        )
        calls_after_solver = self.engine.model.calls
        self.engine.model.wet_lngamma(np, 333.15, np.asarray([.2, .8]))
        self.engine.model.wet_lngamma(np, 333.15, np.asarray([.2, .8]))
        self.assertEqual(self.engine.model.calls, calls_after_solver + 2)

        other = FakeEngine(np)
        other_diagnostics = SUBJECT._install_exact_wet_lngamma_cache(other)
        other.scipy.optimize.least_squares(
            lambda: other.model.wet_lngamma(np, 333.15, np.asarray([.2, .8])),
        )
        self.assertEqual(other_diagnostics["hits"], 1)
        self.assertEqual(self.diagnostics["maximumEntries"], 4096)


if __name__ == "__main__":
    unittest.main()