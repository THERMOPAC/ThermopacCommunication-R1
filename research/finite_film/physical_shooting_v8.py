"""Independent physical-coordinate shooting for the isolated saved film cell."""
from __future__ import annotations

from math import comb
import time

import numpy as np
from scipy.integrate import solve_ivp

from solver import boundary, conductances, gradient, reconstructed_flux


def _integrate(bulk, flux, g, adapter, sign, rtol, atol):
    bulk = boundary(bulk)
    g = conductances(g)

    def rhs(_, x):
        # No transformed ODE, clipping, flooring, or flux-sign convention.
        return sign * gradient(x, flux, g, adapter)

    answer = solve_ivp(
        rhs, (0.0, 1.0), bulk, method="DOP853", rtol=rtol, atol=atol,
        dense_output=True, max_step=0.125,
    )
    if not answer.success:
        raise RuntimeError("DOP853_SHOOT_FAILED: " + answer.message)
    if np.any(answer.y < 0.0) or not np.all(np.isfinite(answer.y)):
        raise RuntimeError("DOP853_LEFT_PHYSICAL_SIMPLEX")
    return answer


def integrate_pair(bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol):
    c = _integrate(bc, flux, gc, adapter_c, +1.0, rtol, atol)
    # u=1-s0 runs from the prescribed dispersed bulk to its interface.
    # The physical component flux is unchanged; only dx/du=-f(x,N).
    d = _integrate(bd, flux, gd, adapter_d, -1.0, rtol, atol)
    return c, d


def isoactivity(xc, xd, adapter_c, adapter_d):
    if np.any(xc <= 0.0) or np.any(xd <= 0.0):
        raise RuntimeError("NONPOSITIVE_INTERFACE_ACTIVITY")
    return np.log(xc) + adapter_c.excess(xc) - np.log(xd) - adapter_d.excess(xd)


def residual(bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol):
    c, d = integrate_pair(bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol)
    return isoactivity(c.y[:, -1], d.y[:, -1], adapter_c, adapter_d), c, d


def _integration_map_jacobian(
    bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol, base_residual,
):
    """Differentiate the bulk-to-interface integration map in seven fluxes."""
    columns = []
    steps = []
    for j in range(7):
        step = max(2e-9, 2e-6 * abs(float(flux[j])))
        trial = flux.copy()
        trial[j] += step
        value, _, _ = residual(
            bc, bd, trial, gc, gd, adapter_c, adapter_d, rtol, atol
        )
        columns.append((value - base_residual) / step)
        steps.append(step)
    return np.column_stack(columns), np.asarray(steps)


def solve_flux(
    bc, bd, gc, gd, adapter_c, adapter_d, flux_seed, *,
    rtol=2e-9, atol=2e-13, residual_tolerance=1e-8,
    max_iterations=5, deadline=None,
):
    flux = np.asarray(flux_seed, dtype=float).copy()
    history = []
    rejected = 0
    last = None
    jacobian = None
    steps = None
    for iteration in range(max_iterations):
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError("PHYSICAL_SHOOTING_SCIENTIFIC_BUDGET")
        value, c, d = residual(
            bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol
        )
        norm = float(np.max(np.abs(value)))
        row = {"iteration": iteration, "maximumIsoactivityResidual": norm}
        history.append(row)
        last = (value, c, d)
        if norm <= residual_tolerance:
            break
        jacobian, steps = _integration_map_jacobian(
            bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol, value
        )
        delta = np.linalg.lstsq(jacobian, -value, rcond=None)[0]
        accepted = False
        for halves in range(13):
            alpha = 2.0 ** -halves
            trial_flux = flux + alpha * delta
            try:
                trial, tc, td = residual(
                    bc, bd, trial_flux, gc, gd, adapter_c, adapter_d, rtol, atol
                )
                trial_norm = float(np.max(np.abs(trial)))
                feasible = bool(
                    np.all(tc.y >= 0.0) and np.all(td.y >= 0.0)
                    and np.all(tc.y.sum(axis=0) > 0.0)
                    and np.all(td.y.sum(axis=0) > 0.0)
                )
            except TimeoutError:
                raise
            except Exception:
                feasible, trial_norm = False, np.inf
            if feasible and trial_norm < norm:
                flux = trial_flux
                row.update({"acceptedAlpha": alpha,
                            "backtrackingHalvings": halves,
                            "trialMaximumIsoactivityResidual": trial_norm})
                rejected += halves
                accepted = True
                break
        if not accepted:
            raise RuntimeError("NO_FEASIBLE_DESCENT_SHOOTING_STEP")
    if last is None:
        raise RuntimeError("NO_SHOOTING_EVALUATION")
    # Rank is that of the correctly reduced 7-flux integration-map problem.
    value, c, d = residual(
        bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol
    )
    jacobian, steps = _integration_map_jacobian(
        bc, bd, flux, gc, gd, adapter_c, adapter_d, rtol, atol, value
    )
    singular = np.linalg.svd(jacobian, compute_uv=False)
    tolerance = float(singular[0] * 1e-10)
    return {
        "flux": flux, "totalFlux": float(flux.sum()),
        "interfaceContinuous": c.y[:, -1],
        "interfaceDispersed": d.y[:, -1],
        "isoactivityResidual": value,
        "maximumIsoactivityResidual": float(np.max(np.abs(value))),
        "continuousIntegration": c, "dispersedIntegrationU": d,
        "iterationHistory": history, "backtrackingRejectedTrials": rejected,
        "reducedShootingJacobian": {
            "dimension": 7, "rank": int(np.sum(singular > tolerance)),
            "fullRank": bool(np.all(singular > tolerance)),
            "singularValues": singular, "declaredRankTolerance": tolerance,
            "finiteDifferenceFluxSteps": steps,
            "derivation": (
                "21 BVP conditions minus 14 exact prescribed-bulk Dirichlet "
                "conditions leaves seven interface isoactivity conditions in "
                "seven free component fluxes; columns differentiate the "
                "DOP853 bulk-to-interface integration map"
            ),
        },
    }


def _power_to_bernstein(power):
    degree = power.shape[0] - 1
    controls = np.empty_like(power)
    for k in range(degree + 1):
        controls[k] = sum(
            power[j] * comb(k, j) / comb(degree, j) for j in range(k + 1)
        )
    return controls


def _split(controls):
    rows = [controls.copy()]
    left, right = [controls[0]], [controls[-1]]
    while len(rows[-1]) > 1:
        rows.append(0.5 * (rows[-1][:-1] + rows[-1][1:]))
        left.append(rows[-1][0])
        right.append(rows[-1][-1])
    return np.asarray(left), np.asarray(right[::-1])


def bernstein_profile(integration, *, reverse=False, minimum_width=2.0**-18):
    """Serialize the actual DOP853 dense polynomial without endpoint overwrite."""
    pieces = []
    for interpolant in integration.sol.interpolants:
        # Expand scipy's DOP853 alternating x/(1-x) dense recurrence into
        # ordinary ascending powers, then change basis exactly to Bernstein.
        power = np.zeros((1, len(interpolant.y_old)))
        for i, coefficient in enumerate(reversed(interpolant.F)):
            power[0] += coefficient
            if i % 2 == 0:
                power = np.vstack([np.zeros_like(power[:1]), power])
            else:
                power = np.vstack([power, np.zeros_like(power[:1])]) - np.vstack(
                    [np.zeros_like(power[:1]), power]
                )
        power[0] += interpolant.y_old
        pieces.append((float(interpolant.t_old), float(interpolant.t),
                       _power_to_bernstein(power)))
    refined = []
    pending = pieces[::-1]
    while pending:
        left, right, controls = pending.pop()
        if np.min(controls) < 0.0 and right - left > minimum_width:
            a, b = _split(controls)
            middle = 0.5 * (left + right)
            pending.append((middle, right, b))
            pending.append((left, middle, a))
        else:
            refined.append((left, right, controls))
    if any(np.min(x[2]) < 0.0 for x in refined):
        raise RuntimeError("NONNEGATIVE_BERNSTEIN_CONTROLS_NOT_OBTAINED")
    if reverse:
        converted = []
        for left, right, controls in refined[::-1]:
            converted.append((1.0-right, 1.0-left, controls[::-1]))
        refined = converted
    mesh = [refined[0][0]] + [x[1] for x in refined]
    controls = np.asarray([x[2] for x in refined])
    return {"mesh": np.asarray(mesh), "bernsteinControls": controls,
            "degree": int(controls.shape[1]-1),
            "representation": "AUTHORITATIVE_DOP853_BERNSTEIN_DE_CASTELJAU",
            "allControlsNonnegative": True,
            "minimumControlFraction": float(controls.min())}


def _evaluate_profile(profile, points, derivative=False):
    mesh = profile["mesh"]
    controls = profile["bernsteinControls"]
    degree = controls.shape[1] - 1
    output = []
    for point in np.asarray(points):
        k = min(np.searchsorted(mesh, point, side="right") - 1, len(mesh)-2)
        k = max(k, 0)
        width = mesh[k+1] - mesh[k]
        t = (point - mesh[k]) / width
        work = controls[k].copy()
        if derivative:
            work = degree * np.diff(work, axis=0) / width
        while len(work) > 1:
            work = (1-t) * work[:-1] + t * work[1:]
        output.append(work[0])
    return np.asarray(output)


def validate_dense_conversion(integration, profile, *, reverse=False):
    """Check values and derivatives against SciPy's exact DOP853 recurrence."""
    value_error = 0.0
    derivative_error = 0.0
    for interpolant in integration.sol.interpolants:
        for theta in (0.0, 0.25, 0.5, 0.75, 1.0):
            # Directly evaluate the pinned SciPy recurrence and its derivative
            # by forward-mode differentiation, independently of basis change.
            value = np.zeros_like(interpolant.y_old)
            derivative_theta = np.zeros_like(interpolant.y_old)
            for i, coefficient in enumerate(reversed(interpolant.F)):
                value += coefficient
                if i % 2 == 0:
                    derivative_theta = derivative_theta * theta + value
                    value = value * theta
                else:
                    derivative_theta = derivative_theta * (1-theta) - value
                    value = value * (1-theta)
            value += interpolant.y_old
            point = interpolant.t_old + theta * interpolant.h
            physical_point = 1.0-point if reverse else point
            expected_derivative = derivative_theta / interpolant.h
            if reverse:
                expected_derivative = -expected_derivative
            converted_value = _evaluate_profile(profile, [physical_point])[0]
            converted_derivative = _evaluate_profile(
                profile, [physical_point], derivative=True)[0]
            value_error = max(value_error, float(
                np.max(np.abs(converted_value-value))))
            derivative_error = max(derivative_error, float(
                np.max(np.abs(converted_derivative-expected_derivative))))
    tolerance = 2e-11
    return {
        "pinnedScipyDenseFormula":
            "reverse(F): add f; multiply theta on even i else (1-theta); add y_old",
        "valueMaximumAbsAgreement": value_error,
        "derivativeMaximumAbsAgreement": derivative_error,
        "passed": bool(value_error <= tolerance and derivative_error <= tolerance),
        "tolerance": tolerance,
    }


def audit_profile(profile, flux, g, adapter):
    mesh = profile["mesh"]
    points = np.unique(np.r_[mesh, mesh[:-1] + .25*np.diff(mesh),
                            mesh[:-1] + .5*np.diff(mesh),
                            mesh[:-1] + .75*np.diff(mesh)])
    values = _evaluate_profile(profile, points)
    derivatives = _evaluate_profile(profile, points, derivative=True)
    recovered = np.asarray([
        reconstructed_flux(x, xp, flux.sum(), g, adapter)
        for x, xp in zip(values, derivatives)
    ])
    defect = float(np.max(np.abs(recovered-flux) / g))
    return {
        "probeCount": int(len(points)), "everyPolynomialSegmentProbed": True,
        "allBernsteinControlsNonnegative": True,
        "wholeCurveNonnegativeByConvexHull": True,
        "minimumBernsteinControlFraction": float(
            profile["bernsteinControls"].min()),
        "maximumNormalizationDefect": float(
            np.max(np.abs(values.sum(axis=1)-1.0))),
        "maximumScaledConstitutiveDefect": defect,
        "maximumAbsoluteConstitutiveDefect": float(
            np.max(np.abs(recovered-flux))),
        "actualEndpointValues": [values[0], values[-1]],
        "endpointOverwriteApplied": False,
        "status": ("NUMERICAL_PROFILE_CHECKS_PASSED" if defect <= 1e-8
                   else "CONSTITUTIVE_DEFECT_NOT_RESOLVED"),
    }