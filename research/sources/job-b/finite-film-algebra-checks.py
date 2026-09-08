"""Formula checks only: no project engine, interfaces, jobs, or BVP are run."""
import math
import unittest

import numpy as np


def mobility(x, g):
    p = np.eye(len(x)) - np.outer(x, np.ones(len(x)))
    return p, p @ np.diag(g * x) @ p.T


def ideal_flux(x, xp, g, n):
    return -g * xp + x * np.sum(g * xp) + x * n


def equal_g_solution(left, right, g, n, s):
    pe = n / g
    if n == 0:
        return g * (left - right), (1 - s) * left + s * right, right - left
    denominator = math.expm1(pe)
    alpha = math.expm1(pe * s) / denominator
    alpha_prime = pe * math.exp(pe * s) / denominator
    flux = n * (left + (left - right) / denominator)
    return flux, (1 - alpha) * left + alpha * right, alpha_prime * (right - left)


class FiniteFilmAlgebraChecks(unittest.TestCase):
    def setUp(self):
        self.rng = np.random.default_rng(7241)

    def states(self):
        for _ in range(64):
            x = self.rng.uniform(0.01, 1, 7)
            x /= x.sum()
            g = np.exp(self.rng.uniform(-7, -1, 7))
            xp = self.rng.normal(size=7)
            xp -= xp.mean()
            yield x, g, xp

    def test_mobility_frame_symmetry_and_dissipation(self):
        for x, g, force in self.states():
            _, lmat = mobility(x, g)
            self.assertLess(np.max(np.abs(lmat - lmat.T)), 1e-15)
            self.assertLess(np.max(np.abs(lmat @ np.ones(7))), 1e-15)
            self.assertGreaterEqual(np.linalg.eigvalsh(lmat).min(), -1e-15)
            j = -lmat @ force
            self.assertGreaterEqual(float(-j @ force), -1e-15)

    def test_exact_ideal_reduction_and_frame_identities(self):
        for x, g, xp in self.states():
            _, lmat = mobility(x, g)
            n = -0.003
            flux = ideal_flux(x, xp, g, n)
            via_mu = -lmat @ (xp / x) + x * n
            np.testing.assert_allclose(flux, via_mu, rtol=1e-12, atol=1e-14)
            self.assertLess(abs(flux.sum() - n), 1e-14)
            self.assertLess(abs((flux - x * n).sum()), 1e-14)

    def test_simplex_ode_recovers_flux(self):
        for x, g, _ in self.states():
            flux = self.rng.normal(size=7) * 0.001
            q = np.sum(flux / g) / np.sum(x / g)
            xp = (x * q - flux) / g
            self.assertLess(abs(xp.sum()), 1e-13)
            np.testing.assert_allclose(
                ideal_flux(x, xp, g, flux.sum()), flux, rtol=1e-12, atol=1e-14
            )

    def test_equal_conductance_exact_finite_flux_profiles(self):
        left = np.array([0.42, 0.10, 0.08, 0.04, 0.03, 0.23, 0.10])
        right = np.array([0.72, 0.12, 0.08, 0.05, 0.03, 0.0, 0.0])
        g = 0.002
        for pe in (-8, -1, -1e-8, 0, 1e-8, 1, 8):
            n = pe * g
            for s in np.linspace(0, 1, 33):
                flux, x, xp = equal_g_solution(left, right, g, n, float(s))
                self.assertGreaterEqual(x.min(), 0)
                self.assertLess(abs(x.sum() - 1), 1e-14)
                self.assertLess(abs(flux.sum() - n), 1e-14)
                self.assertGreater(flux[5], 0)
                self.assertGreater(flux[6], 0)
                np.testing.assert_allclose(
                    ideal_flux(x, xp, np.full(7, g), n),
                    flux, rtol=1e-10, atol=1e-14
                )

    def test_binary_unequal_conductance_exact_equimolar_case(self):
        left, right = 0.8, 0.1
        for g1, g2 in ((0.002, 0.006), (0.006, 0.002)):
            def primitive(x):
                return g1 * x + 0.5 * (g2 - g1) * x * x
            fl, fr = primitive(left), primitive(right)
            n1 = fl - fr
            expected = (left - right) * (g1 + 0.5 * (g2 - g1) * (left + right))
            self.assertAlmostEqual(n1, expected, places=15)
            for s in np.linspace(0, 1, 33):
                f = (1 - s) * fl + s * fr
                x1 = 2 * f / (g1 + math.sqrt(g1 * g1 + 2 * (g2 - g1) * f))
                xprime = -n1 / (g1 + (g2 - g1) * x1)
                np.testing.assert_allclose(
                    ideal_flux(np.array([x1, 1 - x1]),
                               np.array([xprime, -xprime]),
                               np.array([g1, g2]), 0),
                    [n1, -n1], rtol=1e-12, atol=1e-14
                )

    def test_permutation_and_coordinate_reversal(self):
        permutation = np.array([5, 0, 6, 2, 4, 1, 3])
        for x, g, xp in self.states():
            n = 0.002
            flux = ideal_flux(x, xp, g, n)
            np.testing.assert_allclose(
                ideal_flux(x[permutation], xp[permutation], g[permutation], n),
                flux[permutation], atol=1e-14
            )
            np.testing.assert_allclose(ideal_flux(x, -xp, g, -n), -flux, atol=1e-14)

    def test_regular_nonideal_form_at_exact_zero(self):
        x = np.array([0.0, 0.16, 0.18, 0.21, 0.12, 0.17, 0.16])
        g = np.linspace(0.001, 0.004, 7)
        xp = np.array([0.02, -0.01, -0.01, 0, 0, 0, 0])
        gamma_prime = np.linspace(-2, 3, 7)  # synthetic finite excess-force test
        _, lmat = mobility(x, g)
        n = -0.003
        flux = ideal_flux(x, xp, g, n) - lmat @ gamma_prime
        self.assertAlmostEqual(flux[0], -g[0] * xp[0], places=15)
        self.assertLess(abs(flux.sum() - n), 1e-14)
        self.assertEqual(x[0], 0.0)  # no floor or normalization was applied

    def test_regular_nonideal_form_matches_interior_mu_form(self):
        for x, g, xp in self.states():
            _, lmat = mobility(x, g)
            excess_gradient = self.rng.normal(size=7)
            n = 0.002
            direct = -lmat @ (xp / x + excess_gradient) + x * n
            regular = ideal_flux(x, xp, g, n) - lmat @ excess_gradient
            np.testing.assert_allclose(direct, regular, rtol=1e-12, atol=1e-14)

    def test_constant_composition_throughflow_is_not_unique_zero_flux(self):
        x = np.array([0.7, 0.1, 0.05, 0.03, 0.02, 0.08, 0.02])
        g = np.linspace(0.001, 0.007, 7)
        for n in (-0.01, 0.0, 0.01):
            flux = ideal_flux(x, np.zeros(7), g, n)
            np.testing.assert_allclose(flux, x * n, atol=1e-15)


if __name__ == "__main__":
    unittest.main(verbosity=2)