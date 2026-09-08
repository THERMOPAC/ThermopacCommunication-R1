"""Isolated numerical film solver. Never imported by the production application.

The spatial coordinate is an effective resistance coordinate, not a measured
film thickness. Numerical convergence is NOT thermodynamic qualification.
"""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np
from scipy.integrate import solve_bvp
from scipy.interpolate import PPoly

NCOMP = 7


class FilmDomainError(RuntimeError):
    pass


def boundary(value):
    x = np.array(value, dtype=float, copy=True)
    if x.shape != (7,) or not np.all(np.isfinite(x)) or np.any(x < 0):
        raise FilmDomainError("INVALID_PHYSICAL_BOUNDARY")
    if abs(x.sum() - 1) > 2e-12:
        raise FilmDomainError("BOUNDARY_NOT_NORMALIZED")
    return x


def composition(coordinate, *, allow_signed_trial=False):
    """Normalize coordinate gauge only; no flooring or sign clipping."""
    y = np.asarray(coordinate)
    if not np.all(np.isfinite(y)) or y.sum() <= 0:
        raise FilmDomainError("INVALID_PROFILE_COORDINATE")
    if not allow_signed_trial and np.any(y < 0):
        raise FilmDomainError("NEGATIVE_NUMERICAL_TRIAL_PROFILE")
    return y / y.sum()


def matrices(x, g, adapter):
    p = np.eye(7) - np.outer(x, np.ones(7))
    lmat = p @ np.diag(g * x) @ p.T
    gamma = adapter.excess_jacobian_full(x)
    return p @ np.diag(g) + lmat @ gamma, lmat


def gradient(coordinate, flux, g, adapter):
    ideal = adapter.kind in ("analytic_ideal_excess", "analytic_constant_excess")
    # Signed trial evaluation is permitted ONLY for the analytic ideal law.
    # It does not admit signed output profiles or change a physical boundary.
    x = composition(coordinate, allow_signed_trial=ideal)
    gauge = float(np.sum(coordinate))
    if ideal:
        q = np.sum(flux / g) / np.sum(x / g)
        return gauge * (x * q - flux) / g
    a, _ = matrices(x, g, adapter)
    scaled = a / np.max(g)
    augmented = np.block([[scaled, np.ones((7, 1))],
                          [np.ones((1, 7)), np.zeros((1, 1))]])
    if not np.isfinite(augmented).all() or np.linalg.cond(augmented) > 1e12:
        raise FilmDomainError("SINGULAR_OR_ILL_CONDITIONED_FILM_DERIVATIVE")
    return gauge * np.linalg.solve(
        augmented, np.r_[(x * np.sum(flux) - flux) / np.max(g), 0]
    )[:7]


def reconstructed_flux(x, xp, flux_total, g, adapter):
    # Differentiate the normalized coordinate, not the raw gauge coordinate.
    total = np.sum(x)
    xp = (xp * total - x * np.sum(xp)) / total**2
    x = composition(x)
    a, _ = matrices(x, g, adapter)
    return -a @ xp + x * flux_total


def conductances(values):
    g = np.asarray(values, dtype=float)
    if g.shape != (7,) or np.any(g <= 0) or not np.all(np.isfinite(g)):
        raise FilmDomainError("POSITIVE_FINITE_CONDUCTANCES_REQUIRED")
    return g


@dataclass
class FilmProfile:
    polynomial: PPoly
    left_boundary: np.ndarray | None
    right_boundary: np.ndarray | None
    lift_maximum: float

    def values(self, points):
        points = np.atleast_1d(points)
        values = self.polynomial(points).copy()
        # Exact prescribed Dirichlet values, not sign-based clipping.
        if self.left_boundary is not None:
            values[points == 0] = self.left_boundary
        if self.right_boundary is not None:
            values[points == 1] = self.right_boundary
        return values

    def derivatives(self, points):
        return self.polynomial(np.atleast_1d(points), 1)

    def extrema(self):
        """All stationary points of every cubic segment, plus its endpoints."""
        mesh = self.polynomial.x
        points = list(mesh)
        c = self.polynomial.c
        for k, width in enumerate(np.diff(mesh)):
            # Include extrema of sum(x), so normalization is also checked
            # between nodes independently of the tangent ODE.
            coefficient_vectors = [c[:, k, component] for component in range(7)]
            coefficient_vectors.append(np.sum(c[:, k, :], axis=1))
            for coefficients in coefficient_vectors:
                derivative = np.polyder(coefficients)
                for root in np.roots(np.trim_zeros(derivative, "f")):
                    if abs(root.imag) < 1e-12 and 0 < root.real < width:
                        points.append(float(mesh[k] + root.real))
        points = np.unique(points)
        return points, self.values(points)


def lifted_profile(result, offset, left=None, right=None):
    """Affine Dirichlet lifting; every constitutive defect is re-audited."""
    source = result.sol
    coefficients = source.c[:, :, offset:offset + 7].copy()
    left_error = np.zeros(7) if left is None else left - source(0)[offset:offset + 7]
    right_error = np.zeros(7) if right is None else right - source(1)[offset:offset + 7]
    slope = right_error - left_error
    coefficients[-2] += slope
    coefficients[-1] += left_error + source.x[:-1, None] * slope
    return FilmProfile(
        PPoly(coefficients, source.x), left, right,
        float(max(np.max(np.abs(left_error)), np.max(np.abs(right_error))))
    )


def audit_profile(profile, flux, g, adapter):
    extrema_points, extrema_values = profile.extrema()
    mesh = profile.polynomial.x
    probes = np.unique(np.r_[extrema_points, mesh,
                            mesh[:-1] + .25 * np.diff(mesh),
                            mesh[:-1] + .5 * np.diff(mesh),
                            mesh[:-1] + .75 * np.diff(mesh)])
    values, derivatives = profile.values(probes), profile.derivatives(probes)
    minimum = float(np.min(extrema_values))
    summary = {
        "minimumPolynomialFraction": minimum,
        "maximumPolynomialFraction": float(np.max(extrema_values)),
        "minimumIncludesAllCubicStationaryPoints": True,
        "maximumNormalizationDefect": float(np.max(np.abs(values.sum(axis=1) - 1))),
        "maximumAffineBoundaryLift": profile.lift_maximum,
        "probeCount": len(probes),
        "profileRoundoffDomainCertified": False,
    }
    if minimum < 0 or summary["maximumNormalizationDefect"] > 1e-12:
        summary.update({"status": "NON_ADMISSIBLE_NUMERICAL_PROFILE",
                        "maximumScaledConstitutiveDefect": None})
        return summary
    recovered = np.array([
        reconstructed_flux(x, xp, flux.sum(), g, adapter)
        for x, xp in zip(values, derivatives)
    ])
    physical_values = values / values.sum(axis=1)[:, None]
    summary.update({
        "maximumScaledConstitutiveDefect": float(np.max(np.abs(recovered - flux) / g)),
        "maximumAbsoluteConstitutiveDefect": float(np.max(np.abs(recovered - flux))),
        "maximumDiffusiveSumDefect": float(np.max(np.abs(
            (recovered - physical_values * flux.sum()).sum(axis=1)))),
        "maximumTotalFluxIdentityDefect": float(np.max(np.abs(
            recovered.sum(axis=1) - flux.sum()))),
        "status": "NUMERICAL_PROFILE_CHECKS_PASSED"
            if np.max(np.abs(recovered - flux) / g) <= 1e-8
            else "CONSTITUTIVE_DEFECT_NOT_RESOLVED",
    })
    # Cubic extrema are checked, but are not interval arithmetic certification.
    # In particular, exact boundary zeros have no positive roundoff margin.
    return summary


def solve_single_film(left, right, g, total_flux, adapter, *,
                      tolerance=1e-9, nodes=17, max_nodes=4097):
    """Numerical benchmark API: specified n, unknown component fluxes."""
    left, right, g = boundary(left), boundary(right), conductances(g)
    dependent = int(np.argmax(left + right))
    independent = [j for j in range(7) if j != dependent]
    scale = float(np.max(g))
    n = float(total_flux)

    def unpack(parameters):
        flux = np.zeros(7)
        flux[independent] = parameters * scale
        flux[dependent] = n - flux.sum()
        return flux

    def ode(s, y, parameters):
        flux = unpack(parameters)
        return np.column_stack([gradient(y[:, j], flux, g, adapter)
                                for j in range(y.shape[1])])

    def bc(yl, yr, parameters):
        return np.r_[yl - left, (yr - right)[independent]]

    mesh = np.linspace(0, 1, nodes)
    guess = left[:, None] * (1 - mesh) + right[:, None] * mesh
    initial_flux = reconstructed_flux((left + right) / 2, right - left, n, g, adapter)
    result = solve_bvp(ode, bc, mesh, guess, p=initial_flux[independent] / scale,
                       tol=tolerance, bc_tol=min(tolerance, 1e-12), max_nodes=max_nodes)
    flux = unpack(result.p)
    profile = lifted_profile(result, 0, left, right)
    audit = audit_profile(profile, flux, g, adapter)
    return {
        "scipySuccess": bool(result.success), "scipyStatus": int(result.status),
        "message": result.message, "iterations": result.niter, "nodes": len(result.x),
        "flux": flux, "totalFlux": n, "profile": profile, "audit": audit,
        "maximumBoundaryResidual": float(np.max(np.abs(bc(result.y[:, 0], result.y[:, -1], result.p)))),
        "maximumCollocationResidual": float(np.max(result.rms_residuals)),
        "numericalAccepted": bool(result.success)
            and audit["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED"
            and profile.lift_maximum <= 1e-12
            and np.max(np.abs(bc(result.y[:, 0], result.y[:, -1], result.p))) <= 1e-12,
        "qualification": "NUMERICAL_BENCHMARK_ONLY_NO_PROJECT_THERMODYNAMIC_QUALIFICATION",
    }


def solve_two_films(bulk_c, bulk_d, g_c, g_d, adapter_c, adapter_d, *,
                    interface_seed_c, interface_seed_d, flux_seed=None,
                    tolerance=1e-9, nodes=17, max_nodes=4097):
    """Coupled research BVP, not a production Job-B replacement.

    14 full composition-coordinate states + 7 flux parameters; 21 conditions:
    two prescribed bulk vectors and seven interfacial log-activity equalities.
    """
    bc_c, bc_d = boundary(bulk_c), boundary(bulk_d)
    seed_c, seed_d = boundary(interface_seed_c), boundary(interface_seed_d)
    gc, gd = conductances(g_c), conductances(g_d)
    scale = float(max(np.max(gc), np.max(gd)))

    def ode(s, y, parameters):
        flux = parameters * scale
        return np.column_stack([
            np.r_[gradient(y[:7, j], flux, gc, adapter_c),
                  gradient(y[7:, j], flux, gd, adapter_d)]
            for j in range(y.shape[1])
        ])

    def chemistry(xc, xd):
        xc, xd = composition(xc), composition(xd)
        if np.any(xc <= 0) or np.any(xd <= 0):
            raise FilmDomainError("INTERFACE_LOG_ACTIVITY_REQUIRES_POSITIVE_FRACTIONS")
        return np.log(xc) + adapter_c.excess(xc) - np.log(xd) - adapter_d.excess(xd)

    def conditions(yl, yr, parameters):
        return np.r_[yl[:7] - bc_c, yr[7:] - bc_d, chemistry(yr[:7], yl[7:])]

    mesh = np.linspace(0, 1, nodes)
    initial = np.vstack([bc_c[:, None] * (1 - mesh) + seed_c[:, None] * mesh,
                         seed_d[:, None] * (1 - mesh) + bc_d[:, None] * mesh])
    initial_n = np.zeros(7) if flux_seed is None else np.asarray(flux_seed)
    result = solve_bvp(ode, conditions, mesh, initial, p=initial_n / scale,
                       tol=tolerance, bc_tol=min(tolerance, 1e-12), max_nodes=max_nodes)
    flux = result.p * scale
    pc, pd = lifted_profile(result, 0, left=bc_c), lifted_profile(result, 7, right=bc_d)
    ac, ad = audit_profile(pc, flux, gc, adapter_c), audit_profile(pd, flux, gd, adapter_d)
    ic, id_ = pc.values([1])[0], pd.values([0])[0]
    nc = reconstructed_flux(ic, pc.derivatives([1])[0], flux.sum(), gc, adapter_c)
    nd = reconstructed_flux(id_, pd.derivatives([0])[0], flux.sum(), gd, adapter_d)
    isoactivity = float(np.max(np.abs(chemistry(ic, id_))))
    disagreement = float(np.max(np.abs(nc - nd) / np.maximum(np.maximum(gc, gd), 1e-12)))
    return {
        "scipySuccess": bool(result.success), "scipyStatus": int(result.status),
        "message": result.message, "iterations": result.niter, "nodes": len(result.x),
        "flux": flux, "totalFlux": float(flux.sum()), "continuousProfile": pc,
        "dispersedProfile": pd, "continuousAudit": ac, "dispersedAudit": ad,
        "maximumIsoactivityResidual": isoactivity,
        "maximumScaledFilmFluxDisagreement": disagreement,
        "interfaceContinuous": ic, "interfaceDispersed": id_,
        "qualification": "CANDIDATE_NUMERICS_ONLY_NOT_THERMODYNAMICALLY_QUALIFIED",
        "numericalAccepted": bool(result.success)
            and ac["status"] == ad["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED"
            and max(pc.lift_maximum, pd.lift_maximum) <= 1e-12
            and isoactivity <= 1e-7 and disagreement <= 1e-8,
    }