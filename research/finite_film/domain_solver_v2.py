"""Positive-coordinate finite-film solver used only by isolated research.

Six additive log-ratios represent each seven-component composition.  Newton
steps therefore cannot leave the open simplex; no component is clipped,
floored, or replaced.  The prescribed bulk vectors remain separate literal
boundary data.
"""
from __future__ import annotations

import numpy as np
from scipy.integrate import solve_bvp

from solver import boundary, conductances, gradient, reconstructed_flux

NCOMP = 7
REFERENCE = 6


def log_ratios(x):
    x = boundary(x)
    if np.any(x <= 0):
        raise ValueError("LOG_RATIO_SOLVER_REQUIRES_STRICTLY_POSITIVE_SAVED_BULK")
    return np.log(x[:REFERENCE]) - np.log(x[REFERENCE])


def simplex_from_log_ratios(z):
    z = np.asarray(z, dtype=float)
    if z.shape != (6,) or not np.all(np.isfinite(z)):
        raise ValueError("INVALID_LOG_RATIO_COORDINATE")
    shifted = np.r_[z, 0.0]
    shifted -= np.max(shifted)
    weights = np.exp(shifted)
    x = weights / weights.sum()
    if not np.all(np.isfinite(x)) or np.any(x <= 0):
        raise ValueError("LOG_RATIO_COORDINATE_OUTSIDE_FLOATING_POINT_INTERIOR")
    return x


def ratio_gradient(z, flux, g, adapter):
    x = simplex_from_log_ratios(z)
    xp = gradient(x, flux, g, adapter)
    return xp[:REFERENCE] / x[:REFERENCE] - xp[REFERENCE] / x[REFERENCE]


def _audit(side, result, offset, bulk, flux, g, adapter, points=801):
    s = np.linspace(0.0, 1.0, points)
    z, zp = result.sol(s)[offset:offset + 6], result.sol(s, 1)[offset:offset + 6]
    values, derivatives, recovered = [], [], []
    for column in range(points):
        x = simplex_from_log_ratios(z[:, column])
        centered = np.r_[zp[:, column], 0.0]
        xp = x * (centered - x @ centered)
        values.append(x)
        derivatives.append(xp)
        recovered.append(reconstructed_flux(x, xp, flux.sum(), g, adapter))
    values = np.asarray(values)
    recovered = np.asarray(recovered)
    # Report the prescribed endpoint literally.  This is not a numerical
    # replacement in any constitutive evaluation.
    endpoint = 0 if side == "continuous" else -1
    literal_error = float(np.max(np.abs(values[endpoint] - bulk)))
    values[endpoint] = bulk
    scaled = float(np.max(np.abs(recovered - flux) / g))
    return {
        "minimumSampledFraction": float(values.min()),
        "maximumSampledFraction": float(values.max()),
        "sampleCount": points,
        "allSampledFractionsNonnegative": bool(np.all(values >= 0)),
        "maximumNormalizationDefect": float(np.max(np.abs(values.sum(axis=1) - 1))),
        "maximumTransformedEndpointRoundoffBeforeLiteralOverride": literal_error,
        "literalPrescribedBoundaryRetained": True,
        "maximumScaledConstitutiveDefect": scaled,
        "maximumAbsoluteConstitutiveDefect": float(np.max(np.abs(recovered - flux))),
        "status": "NUMERICAL_PROFILE_CHECKS_PASSED" if scaled <= 1e-8 else
                  "CONSTITUTIVE_DEFECT_NOT_RESOLVED",
        "values": values,
    }


def solve_two_films_logratio(
    bulk_c, bulk_d, g_c, g_d, adapter_c, adapter_d, *,
    interface_seed_c, interface_seed_d, flux_seed=None,
    tolerance=1e-8, nodes=17, max_nodes=1025,
):
    bc, bd = boundary(bulk_c), boundary(bulk_d)
    gc, gd = conductances(g_c), conductances(g_d)
    zbc, zbd = log_ratios(bc), log_ratios(bd)
    zic, zid = log_ratios(interface_seed_c), log_ratios(interface_seed_d)
    scale = float(max(np.max(gc), np.max(gd)))

    def ode(s, y, parameters):
        flux = parameters * scale
        columns = []
        for j in range(y.shape[1]):
            columns.append(np.r_[
                ratio_gradient(y[:6, j], flux, gc, adapter_c),
                ratio_gradient(y[6:, j], flux, gd, adapter_d),
            ])
        return np.column_stack(columns)

    def chemistry(zc, zd):
        xc, xd = simplex_from_log_ratios(zc), simplex_from_log_ratios(zd)
        return np.log(xc) + adapter_c.excess(xc) - np.log(xd) - adapter_d.excess(xd)

    def conditions(yl, yr, parameters):
        return np.r_[yl[:6] - zbc, yr[6:] - zbd, chemistry(yr[:6], yl[6:])]

    mesh = np.linspace(0.0, 1.0, nodes)
    initial = np.vstack([
        zbc[:, None] * (1 - mesh) + zic[:, None] * mesh,
        zid[:, None] * (1 - mesh) + zbd[:, None] * mesh,
    ])
    seed = np.zeros(7) if flux_seed is None else np.asarray(flux_seed, dtype=float)
    result = solve_bvp(
        ode, conditions, mesh, initial, p=seed / scale, tol=tolerance,
        bc_tol=min(tolerance, 1e-12), max_nodes=max_nodes, verbose=0,
    )
    flux = result.p * scale
    ac = _audit("continuous", result, 0, bc, flux, gc, adapter_c)
    ad = _audit("dispersed", result, 6, bd, flux, gd, adapter_d)
    zc, zd = result.sol(1)[:6], result.sol(0)[6:]
    ic, id_ = simplex_from_log_ratios(zc), simplex_from_log_ratios(zd)
    iso = float(np.max(np.abs(chemistry(zc, zd))))
    def physical_derivative(z, zp):
        x = simplex_from_log_ratios(z)
        q = np.r_[zp, 0.0]
        return x * (q - x @ q)
    nc = reconstructed_flux(ic, physical_derivative(zc, result.sol(1, 1)[:6]),
                            flux.sum(), gc, adapter_c)
    nd = reconstructed_flux(id_, physical_derivative(zd, result.sol(0, 1)[6:]),
                            flux.sum(), gd, adapter_d)
    disagreement = float(np.max(np.abs(nc - nd) / np.maximum(gc, gd)))
    accepted = bool(result.success) and ac["status"] == ad["status"] == \
        "NUMERICAL_PROFILE_CHECKS_PASSED" and iso <= 1e-7 and disagreement <= 1e-8
    return {
        "scipySuccess": bool(result.success), "scipyStatus": int(result.status),
        "message": result.message, "iterations": int(result.niter),
        "nodes": len(result.x), "flux": flux, "totalFlux": float(flux.sum()),
        "interfaceContinuous": ic, "interfaceDispersed": id_,
        "maximumIsoactivityResidual": iso,
        "maximumScaledFilmFluxDisagreement": disagreement,
        "continuousAudit": ac, "dispersedAudit": ad,
        "numericalAccepted": accepted,
        "result": result,
    }