"""Native-free regressions for the real driver's completed-level recording."""
import json
import unittest
from unittest.mock import patch

import numpy as np
import attempt_cell1_sparse_v10 as driver


class Profile:
    def __init__(self):
        self.mesh = np.array([0., 1.])
        self.controls = np.full((1, 4, 7), 1 / 7)

    def values(self, points):
        return np.tile(self.controls[0, 0], (len(points), 1))


def result():
    return {
        "flux": np.ones(7) * 1e-4,
        "interfaceContinuous": np.ones(7) / 7,
        "interfaceDispersed": np.ones(7) / 7,
        "continuousProfile": Profile(),
        "dispersedProfile": Profile(),
        "numericalAccepted": False,
    }


class PostprocessingTests(unittest.TestCase):
    def setUp(self):
        self.levels = []
        self.writes = []

    def write(self):
        self.writes.append(json.dumps(
            self.levels, allow_nan=False,
            default=lambda value: value.tolist(),
        ))

    def record(self, previous):
        return driver.record_completed_level(
            self.levels, result(), 65, 0.01, previous,
            np.ones(7), np.ones(7), np.linspace(0, 1, 9), np, self.write,
        )

    def test_nonzero_flux_second_level_comparison_and_strict_json(self):
        row = self.record(result())
        self.assertEqual(row["maximumScaledFluxDriftFromPrevious"], 0.)
        self.assertEqual(row["maximumInterfaceDriftFromPrevious"], 0.)
        self.assertEqual(row["maximumCommonCoordinateProfileDriftFromPrevious"], 0.)
        self.assertEqual(len(self.writes), 2)

    def test_completed_solution_survives_comparison_exception(self):
        with patch.object(driver, "compare", side_effect=RuntimeError("injected")):
            with self.assertRaisesRegex(RuntimeError, "injected"):
                self.record(result())
        stored = json.loads(self.writes[0])[0]
        self.assertEqual(stored["nodes"], 65)
        self.assertEqual(len(stored["continuousProfile"]["bernsteinControls"]), 1)
        self.assertIsNone(stored["maximumScaledFluxDriftFromPrevious"])

    def test_first_level_has_no_fictitious_comparison(self):
        row = self.record(None)
        self.assertIsNone(row["maximumScaledFluxDriftFromPrevious"])
        self.assertEqual(len(self.writes), 1)


if __name__ == "__main__":
    unittest.main()