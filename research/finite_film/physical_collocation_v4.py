"""Dominant-gauge Lobatto collocation with domain-aware backtracking."""
from __future__ import annotations
import numpy as np
from solver import boundary, conductances, gradient, FilmDomainError
from bernstein_profile_v5 import BernsteinHermiteProfile, audit_bernstein


def solve_lobatto(bulk_c, bulk_d, gc, gd, adapter_c, adapter_d, *,
                   interface_seed_c, interface_seed_d, flux_seed=None, nodes=5,
                   residual_tolerance=1e-8, max_iterations=20,
                   jacobian_refresh=6, profile_seed_c=None, profile_seed_d=None):
    bc, bd = boundary(bulk_c), boundary(bulk_d)
    gc, gd = conductances(gc), conductances(gd)
    dc, dd = int(np.argmax(bc)), int(np.argmax(bd))
    jc, jd = [i for i in range(7) if i != dc], [i for i in range(7) if i != dd]
    m, h, scale = int(nodes), 1 / (nodes - 1), float(max(gc.max(), gd.max()))
    mesh = np.linspace(0, 1, m)
    ic, id_ = boundary(interface_seed_c), boundary(interface_seed_d)
    c0 = (bc[:, None] * (1-mesh) + ic[:, None] * mesh
          if profile_seed_c is None else np.asarray(profile_seed_c(mesh)).T)
    d0 = (id_[:, None] * (1-mesh) + bd[:, None] * mesh
          if profile_seed_d is None else np.asarray(profile_seed_d(mesh)).T)
    c0[:, 0], d0[:, -1] = bc, bd

    def reduced(x, independent):
        return x[independent]

    def full(q, dependent, independent):
        x = np.empty(7)
        x[independent] = q
        x[dependent] = 1 - np.sum(q)
        if not np.all(np.isfinite(x)) or np.any(x <= 0):
            raise FilmDomainError("LOBATTO_TRIAL_OUTSIDE_OPEN_SIMPLEX")
        return x

    p = np.zeros(7) if flux_seed is None else np.asarray(flux_seed) / scale
    u = np.concatenate([
        np.asarray([reduced(c0[:, k], jc) for k in range(1, m)]).ravel(),
        np.asarray([reduced(d0[:, k], jd) for k in range(m-1)]).ravel(), p,
    ])

    def unpack(v):
        c, d, cursor = [bc.copy()], [], 0
        for _ in range(m-1):
            c.append(full(v[cursor:cursor+6], dc, jc)); cursor += 6
        for _ in range(m-1):
            d.append(full(v[cursor:cursor+6], dd, jd)); cursor += 6
        d.append(bd.copy())
        return np.asarray(c), np.asarray(d), v[cursor:cursor+7] * scale

    def evaluate(v, details=False):
        c, d, flux = unpack(v)
        defects, midpoint_min = [], np.inf
        node_derivatives = []
        for profile, g, adapter, independent in (
            (c, gc, adapter_c, jc), (d, gd, adapter_d, jd)
        ):
            f = np.asarray([gradient(x, flux, g, adapter) for x in profile])
            node_derivatives.append(f)
            for k in range(m-1):
                xm = .5*(profile[k]+profile[k+1]) - h*(f[k+1]-f[k])/8
                if not np.all(np.isfinite(xm)) or np.any(xm <= 0):
                    raise FilmDomainError("LOBATTO_MIDPOINT_OUTSIDE_OPEN_SIMPLEX")
                midpoint_min = min(midpoint_min, float(xm.min()))
                fm = gradient(xm, flux, g, adapter)
                defect = profile[k+1]-profile[k]-h*(f[k]+4*fm+f[k+1])/6
                defects.extend(defect[independent])
        chem = (np.log(c[-1])+adapter_c.excess(c[-1]) -
                np.log(d[0])-adapter_d.excess(d[0]))
        raw = np.r_[defects, chem]
        return (raw, c, d, flux, node_derivatives, midpoint_min) if details else raw

    def scaled(v):
        r = evaluate(v).copy()
        r[-7:] /= 10
        return r

    def jacobian(v, r):
        j = np.empty((len(r), len(v)))
        for col in range(len(v)):
            step = 2e-7 * max(1, abs(v[col]))
            for _ in range(40):
                plus, minus = v.copy(), v.copy()
                plus[col] += step
                minus[col] -= step
                try:
                    rp = scaled(plus)
                except FilmDomainError:
                    rp = None
                try:
                    rm = scaled(minus)
                except FilmDomainError:
                    rm = None
                if rp is not None and rm is not None:
                    j[:, col] = (rp-rm)/(2*step); break
                if rp is not None:
                    j[:, col] = (rp-r)/step; break
                if rm is not None:
                    j[:, col] = (r-rm)/step; break
                step *= .5
            else:
                raise FilmDomainError("NO_SIMPLEX_MARGIN_FOR_JACOBIAN_COLUMN")
        return j

    r, jac, rejected, history = scaled(u), None, 0, []
    status = "ITERATION_BUDGET_EXHAUSTED"
    for iteration in range(max_iterations):
        raw = evaluate(u)
        norm = float(np.max(np.abs(raw)))
        history.append({"iteration": iteration, "maximumPhysicalResidual": norm})
        if norm <= residual_tolerance:
            status = "CONVERGED"; break
        if jac is None or iteration % jacobian_refresh == 0:
            jac = jacobian(u, r)
        step = np.linalg.lstsq(jac, -r, rcond=1e-11)[0]
        old_merit, alpha, accepted = float(r@r), 1.0, False
        for halving in range(60):
            trial = u + alpha*step
            try:
                rt = scaled(trial); merit = float(rt@rt)
            except (FilmDomainError, FloatingPointError):
                merit = np.inf
            if np.isfinite(merit) and merit < old_merit*(1-1e-4*alpha):
                accepted = True; break
            rejected += 1; alpha *= .5
        history[-1].update({"acceptedAlpha": alpha if accepted else None,
                            "backtrackingHalvings": halving})
        if not accepted:
            status = "DOMAIN_AWARE_LINE_SEARCH_STALLED"; break
        du, dr = trial-u, rt-r
        if du@du > 0:
            jac += np.outer(dr-jac@du, du)/(du@du)
        u, r = trial, rt

    raw, c, d, flux, derivatives, midpoint_min = evaluate(u, details=True)

    def profile_audit(values, slopes, adapter, g, left=None, right=None):
        profile = BernsteinHermiteProfile(mesh, values, slopes, left, right)
        audit = audit_bernstein(profile, flux, g, adapter)
        return audit, profile

    ac, pc = profile_audit(c, derivatives[0], adapter_c, gc, left=bc)
    ad, pd = profile_audit(d, derivatives[1], adapter_d, gd, right=bd)
    final_scaled = scaled(u)
    final_jacobian = jacobian(u, final_scaled)
    singular = np.linalg.svd(final_jacobian, compute_uv=False)
    rank_tolerance = float(singular[0] * 1e-10)
    rank = int(np.sum(singular > rank_tolerance))
    iso = float(np.max(np.abs(raw[-7:])))
    accepted = status == "CONVERGED" and iso <= 1e-7 and \
        ac["status"] == ad["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED"
    return {
        "status": status, "iterations": len(history), "nodes": m,
        "dependentComponents": {"continuous": dc, "dispersed": dd},
        "flux": flux, "totalFlux": float(flux.sum()),
        "interfaceContinuous": c[-1], "interfaceDispersed": d[0],
        "maximumLobattoResidual": float(np.max(np.abs(raw[:-7]))),
        "maximumIsoactivityResidual": iso,
        "minimumLobattoMidpointFraction": midpoint_min,
        "continuousAudit": ac, "dispersedAudit": ad,
        "reducedJacobian": {
            "dimension": int(final_jacobian.shape[0]),
            "rank": rank, "fullRank": bool(rank == final_jacobian.shape[0]),
            "singularValues": singular,
            "declaredRankTolerance": rank_tolerance,
            "criterion": "singular_value > maximum_singular_value * 1e-10",
        },
        "continuousProfile": pc, "dispersedProfile": pd,
        "backtrackingRejectedTrials": rejected, "iterationHistory": history,
        "numericalAccepted": bool(accepted),
    }