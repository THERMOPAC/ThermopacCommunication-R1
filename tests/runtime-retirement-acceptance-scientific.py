#!/usr/bin/env python3
"""Bounded, read-only parity check of the deployed 7C-1.6 scientific engine."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "dist/predictive-nt-runtime-7c-1-6"
WORKER = (
    RUNTIME
    / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-6/worker.py"
)

STAGE1 = {
    "operatingTemperatureC": 50,
    "temperatureK": 323.15,
    "saturatesWt": 65,
    "monoAromaticsWt": 20,
    "diAromaticsWt": 5,
    "polyAromaticsWt": 3,
    "polarAromaticsWt": 5,
    "nmpInFeedWt": 2,
    "solventOilRatio": 1.5,
    "nmpPurityWt": 99.5,
    "nmpWaterWt": 0.5,
    "targetRaffinateSulfurPpm": 1000,
    "feedSulfurPpm": 3500,
    "sulfurAllocationSatPct": 0,
    "sulfurAllocationMonoPct": 20,
    "sulfurAllocationDiPct": 30,
    "sulfurAllocationPolyPct": 40,
    "sulfurAllocationPaPct": 10,
    "minimumRaffinateSaturatesWt": 90,
    "targetRaffinateTotalAromaticsWt": 10,
    "targetRaffinatePolarAromaticsWt": 0.5,
    "maximumNmpRaffinateWt": 1,
    "minimumRecoveryPct": 90,
}


def load_worker():
    spec = importlib.util.spec_from_file_location("retained_runtime_v16", WORKER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


class CurrentScientificParityAcceptance(unittest.TestCase):
    def test_frozen_one_stage_calculation_parity(self):
        """One actual stage only; never launch the expensive ten-stage sweep."""
        self.assertEqual(os.environ.get("PYTHONDONTWRITEBYTECODE"), "1")
        worker = load_worker()
        self.assertEqual(worker.ENGINE_VERSION, "7C-1.6.0")
        self.assertEqual(
            worker.engine_evidence()["engineHash"],
            "ff35a410554e3f30bb43715691752fdc2f6a016a4689c885bf91272a17c7b486",
        )

        feed, solvent, wet = worker.wet_charge(STAGE1)
        temporary, engine, _integrity, _runtime = (
            worker.parent.scientific.build_engine(
                STAGE1["temperatureK"],
                wet["waterWeightPercentOfWetSolvent"],
            )
        )
        try:
            raw = engine.solve_cascade(
                1, STAGE1["temperatureK"], feed, solvent, None
            )
            trial = worker.complete_trial(
                engine.np, raw, feed, solvent, STAGE1["temperatureK"]
            )
        finally:
            temporary.cleanup()

        canonical = worker.canonical(trial)
        self.assertEqual(
            hashlib.sha256(canonical.encode()).hexdigest(),
            "05f0d2d7a0d3e39c11f9f9aaf62e76b5b4a782523dc9f43c21634b80dc219b9c",
        )
        self.assertEqual(trial["stageCount"], 1)
        self.assertFalse(trial["accepted"])
        self.assertAlmostEqual(
            trial["maximumScaledEquationResidual"],
            4.3520742565306136e-14,
            places=26,
        )
        self.assertAlmostEqual(
            trial["productMetrics"]["nmpFreeHydrocarbonRecoveryPct"],
            62.807634536531765,
            places=12,
        )


if __name__ == "__main__":
    unittest.main()