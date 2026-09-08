"""Cheap independent checks of coordinate and profile-admissibility handling."""
import unittest
import numpy as np
from scipy.interpolate import PPoly

from solver import (FilmDomainError, FilmProfile, audit_profile, boundary,
                    gradient, reconstructed_flux)
from thermo_adapter import IdealExcessAdapter


class Guardrails(unittest.TestCase):
    def test_physical_boundaries_are_not_repaired(self):
        for invalid in ([-.01, .21, .2, .2, .2, .1, .1],
                        [.2] * 7, [float("nan")] * 7):
            with self.assertRaises(FilmDomainError):
                boundary(invalid)

    def test_exact_zero_boundary_is_preserved(self):
        supplied = np.array([.7, .1, .1, .05, .05, 0., 0.])
        saved = supplied.copy()
        result = boundary(supplied)
        np.testing.assert_array_equal(supplied, saved)
        np.testing.assert_array_equal(result, saved)

    def test_gauge_chain_rule(self):
        x = np.array([.2, .15, .1, .1, .05, .25, .15])
        g = np.linspace(.002, .005, 7)
        flux = np.linspace(-.0003, .0002, 7)
        adapter = IdealExcessAdapter()
        xp = gradient(x, flux, g, adapter)
        scale, scale_prime = 2.3, .37
        np.testing.assert_allclose(
            gradient(scale * x, flux, g, adapter), scale * xp, atol=1e-14)
        np.testing.assert_allclose(
            reconstructed_flux(scale * x, scale * xp + scale_prime * x,
                               flux.sum(), g, adapter), flux, atol=1e-14)

    def test_between_node_negative_profile_is_rejected(self):
        # Endpoints are physical; interior has x0=.2-2s+2s^2, minimum -.3.
        coefficients = np.zeros((4, 1, 7))
        coefficients[-1, 0, :2] = [.2, .8]
        coefficients[-2, 0, :2] = [-2., 2.]
        coefficients[-3, 0, :2] = [2., -2.]
        profile = FilmProfile(PPoly(coefficients, [0., 1.]), None, None, 0.)
        result = audit_profile(profile, np.zeros(7), np.full(7, .002),
                               IdealExcessAdapter())
        self.assertAlmostEqual(result["minimumPolynomialFraction"], -.3)
        self.assertEqual(result["status"], "NON_ADMISSIBLE_NUMERICAL_PROFILE")


if __name__ == "__main__":
    unittest.main(verbosity=2)