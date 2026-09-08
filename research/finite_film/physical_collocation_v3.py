"""Physical-coordinate collocation with explicit domain-aware backtracking."""
from __future__ import annotations

import numpy as np

from solver import boundary, conductances, gradient, matrices


def _full(q):
    x = np.r_[q, 1.0 - np.sum(q)]
    if not np.all(np.isfinite(x)) or np.any(x <= 0):
        raise ValueError("PHYSICAL_COLLOCATION_TRIAL_OUTSIDE_OPEN_SIMPLEX")
    return x


def solve_physical_collocation(
    bulk_c, bulk_d, gc, gd, adapter_c, adapter_d, *,
    interface_seed_c, interface_seed_d, flux_seed=None, nodes=5,
    residual_tolerance=1e-8, max_iterations=24, jacobian_refresh=6,
):
    """Solve midpoint defects; fixed bulk endpoints are absent from unknowns."""
    bc, bd = boundary(bulk_c), boundary(bulk_d)
    gc, gd = conductances(gc), conductances(gd)
    if np.any(bc <= 0) or np.any(bd <= 0):
        raise ValueError("PHYSICAL_COLLOCATION_REQUIRES_POSITIVE_STORED_BULKS")
    ic, id_ = boundary(interface_seed_c), boundary(interface_seed_d)
    if np.any(ic <= 0) or np.any(id_ <= 0):
        raise ValueError("PHYSICAL_COLLOCATION_REQUIRES_POSITIVE_SEEDS")
    m, h = int(nodes), 1.0 / (nodes - 1)
    scale = float(max(np.max(gc), np.max(gd)))
    mesh = np.linspace(0, 1, m)
    c0 = bc[:, None] * (1 - mesh) + ic[:, None] * mesh
    d0 = id_[:, None] * (1 - mesh) + bd[:, None] * mesh
    p0 = np.zeros(7) if flux_seed is None else np.asarray(flux_seed) / scale
    u = np.r_[c0[:6, 1:].T.ravel(), d0[:6, :-1].T.ravel(), p0]
    history, rejected = [], 0

    def unpack(v):
        c, d = [bc.copy()], []
        cursor = 0
        for _ in range(m - 1):
            c.append(_full(v[cursor:cursor + 6])); cursor += 6
        for _ in range(m - 1):
            d.append(_full(v[cursor:cursor + 6])); cursor += 6
        d.append(bd.copy())
        return np.asarray(c), np.asarray(d), v[cursor:cursor + 7] * scale

    def raw_residual(v):
        c, d, flux = unpack(v)
        defects = []
        for profile, g, adapter in ((c, gc, adapter_c), (d, gd, adapter_d)):
            for k in range(m - 1):
                midpoint = .5 * (profile[k] + profile[k + 1])
                defects.extend((profile[k + 1] - profile[k] -
                                h * gradient(midpoint, flux, g, adapter))[:6])
        chem = (np.log(c[-1]) + adapter_c.excess(c[-1]) -
                np.log(d[0]) - adapter_d.excess(d[0]))
        return np.r_[defects, chem]

    # Scaling changes Newton conditioning only, never reported physical defects.
    def residual(v):
        r = raw_residual(v)
        r[-7:] /= 10.0
        return r

    def numerical_jacobian(v, r):
        j = np.empty((len(r), len(v)))
        for column in range(len(v)):
            step = 2e-7 * max(1.0, abs(v[column]))
            trial = v.copy()
            trial[column] += step
            try:
                j[:, column] = (residual(trial) - r) / step
            except ValueError:
                trial[column] = v[column] - step
                j[:, column] = (r - residual(trial)) / step
        return j

    r = residual(u)
    jac = None
    status = "ITERATION_BUDGET_EXHAUSTED"
    for iteration in range(max_iterations):
        physical = raw_residual(u)
        norm = float(np.max(np.abs(physical)))
        history.append({"iteration": iteration, "maximumPhysicalResidual": norm})
        if norm <= residual_tolerance:
            status = "CONVERGED"
            break
        if jac is None or iteration % jacobian_refresh == 0:
            jac = numerical_jacobian(u, r)
        step = np.linalg.lstsq(jac, -r, rcond=1e-11)[0]
        accepted = False
        alpha = 1.0
        old_merit = float(r @ r)
        for halving in range(60):
            trial = u + alpha * step
            try:
                rt = residual(trial)
                merit = float(rt @ rt)
            except (ValueError, FloatingPointError):
                merit = np.inf
            if np.isfinite(merit) and merit < old_merit * (1 - 1e-4 * alpha):
                accepted = True
                break
            rejected += 1
            alpha *= .5
        history[-1].update({"acceptedAlpha": alpha if accepted else None,
                            "backtrackingHalvings": halving})
        if not accepted:
            status = "DOMAIN_AWARE_LINE_SEARCH_STALLED"
            break
        du, dr = trial - u, rt - r
        denominator = float(du @ du)
        if denominator > 0:
            jac += np.outer(dr - jac @ du, du) / denominator
        u, r = trial, rt

    c, d, flux = unpack(u)
    raw = raw_residual(u)

    def audit(profile, g, adapter):
        recovered = []
        for k in range(m - 1):
            midpoint = .5 * (profile[k] + profile[k + 1])
            xp = (profile[k + 1] - profile[k]) / h
            a, _ = matrices(midpoint, g, adapter)
            recovered.append(-a @ xp + midpoint * flux.sum())
        recovered = np.asarray(recovered)
        return {
            "minimumNodeFraction": float(profile.min()),
            "allNodeFractionsPositive": bool(np.all(profile > 0)),
            "maximumNormalizationDefect": float(np.max(np.abs(profile.sum(axis=1) - 1))),
            "maximumScaledIndependentFluxDefect": float(
                np.max(np.abs(recovered - flux) / g)),
        }

    iso = float(np.max(np.abs(raw[-7:])))
    ac, ad = audit(c, gc, adapter_c), audit(d, gd, adapter_d)
    accepted = status == "CONVERGED" and iso <= 1e-7 and \
        max(ac["maximumScaledIndependentFluxDefect"],
            ad["maximumScaledIndependentFluxDefect"]) <= 1e-8
    return {
        "status": status, "iterations": len(history), "nodes": m,
        "flux": flux, "totalFlux": float(flux.sum()),
        "interfaceContinuous": c[-1], "interfaceDispersed": d[0],
        "maximumPhysicalCollocationResidual": float(np.max(np.abs(raw[:-7]))),
        "maximumIsoactivityResidual": iso,
        "continuousAudit": ac, "dispersedAudit": ad,
        "backtrackingRejectedTrials": rejected, "iterationHistory": history,
        "numericalAccepted": bool(accepted),
    }