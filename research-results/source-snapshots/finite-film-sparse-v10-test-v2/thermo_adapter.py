"""Isolated thermodynamic-force adapter for finite-film research.

The 7C engine reports dimensionless ``muhat = ln(x) + ln(gamma)``.  This
module deliberately obtains only its excess part: the ideal logarithm belongs
to the finite-film equation and is never floored here.
"""
from __future__ import annotations

import numpy as _np

NCOMP = 7


class ThermoAdapterError(RuntimeError):
    """Raised when a physical composition is outside this adapter's contract."""


def _simplex(x):
    x = _np.asarray(x, dtype=float)
    if x.shape != (NCOMP,) or not _np.all(_np.isfinite(x)):
        raise ThermoAdapterError("THERMO_ADAPTER_COMPOSITION_SHAPE_OR_FINITE")
    if _np.any(x < 0.0) or abs(float(x.sum()) - 1.0) > 2e-12:
        raise ThermoAdapterError("THERMO_ADAPTER_PHYSICAL_SIMPLEX_REQUIRED")
    return x


class FiniteFilmThermoAdapter:
    """Stateful 7C excess-force adapter.

    ``excess_jacobian_full(x)`` is a *directional extension*, not an
    unconstrained 7x7 Hessian.  With ``d=dependent_index`` it has column d
    zero and column j equal to the derivative along ``e_j-e_d``.  Therefore
    ``GammaFull @ xp`` is the derivative of ln(gamma) for every ``xp`` with
    ``sum(xp)=0``.  The dependent component defaults to the largest current
    fraction, which makes all two-sided perturbations as well-conditioned as
    possible.  Symmetry must be assessed after tangent projection, never on
    this gauge-dependent extension.
    """
    kind = "finite_difference_excess"

    def __init__(self, excess, *, step=2e-5, one_sided_step=2e-6):
        self._excess = excess
        self.step = float(step)
        self.one_sided_step = float(one_sided_step)
        self.last_derivative = None

    def excess(self, x):
        x = _simplex(x)
        value = _np.asarray(self._excess(x), dtype=float)
        if value.shape != (NCOMP,) or not _np.all(_np.isfinite(value)):
            raise ThermoAdapterError("THERMO_ADAPTER_EXCESS_NONFINITE")
        return value

    def excess_jacobian_full(self, x, dependent_index=None, *, step=None):
        x = _simplex(x)
        d = int(_np.argmax(x) if dependent_index is None else dependent_index)
        if not 0 <= d < NCOMP:
            raise ThermoAdapterError("THERMO_ADAPTER_DEPENDENT_INDEX")
        h0 = self.step if step is None else float(step)
        if not (h0 > 0 and _np.isfinite(h0)):
            raise ThermoAdapterError("THERMO_ADAPTER_STEP")
        gamma = _np.zeros((NCOMP, NCOMP), dtype=float)
        schemes = {}
        for j in range(NCOMP):
            if j == d:
                continue
            direction = _np.zeros(NCOMP)
            direction[j], direction[d] = 1.0, -1.0
            # Do not push a physical endpoint through a hidden replacement.
            if x[j] >= h0 and x[d] > 0.0:
                h = min(h0, 0.5 * x[d])
                gamma[:, j] = (self.excess(x + h * direction) -
                               self.excess(x - h * direction)) / (2.0 * h)
                schemes[str(j)] = {"method": "equal_step_central", "step": h}
            elif x[j] >= 0.0 and x[d] > 0.0:
                h = min(h0, self.one_sided_step, 0.25 * x[d])
                f0 = self.excess(x)
                f1 = self.excess(x + h * direction)
                f2 = self.excess(x + 2.0 * h * direction)
                gamma[:, j] = (-3.0 * f0 + 4.0 * f1 - f2) / (2.0 * h)
                schemes[str(j)] = {
                    "method": "second_order_forward_when_central_step_infeasible",
                    "step": h,
                }
            else:
                raise ThermoAdapterError(
                    "THERMO_ADAPTER_BOUNDARY_DIRECTION_UNDEFINED")
        self.last_derivative = {
            "dependentIndex": d, "stepRequested": h0, "schemes": schemes,
            "extension": "columns_j_are_d/d(e_j-e_d); column_d_is_zero",
        }
        return gamma


class IdealExcessAdapter(FiniteFilmThermoAdapter):
    kind = "analytic_ideal_excess"
    def __init__(self):
        super().__init__(lambda x: _np.zeros(NCOMP))
    def excess_jacobian_full(self, x, dependent_index=None, *, step=None):
        x = _simplex(x); d = int(_np.argmax(x) if dependent_index is None else dependent_index)
        if not 0 <= d < NCOMP or x[d] <= 0.0:
            raise ThermoAdapterError("THERMO_ADAPTER_DEPENDENT_INDEX")
        self.last_derivative = {"dependentIndex": d, "analytic": True,
                                "extension": "zero excess directional extension"}
        return _np.zeros((NCOMP, NCOMP))


class ConstantExcessAdapter(FiniteFilmThermoAdapter):
    kind = "analytic_constant_excess"
    def __init__(self, values):
        values = _np.asarray(values, dtype=float)
        if values.shape != (NCOMP,) or not _np.all(_np.isfinite(values)):
            raise ThermoAdapterError("THERMO_ADAPTER_CONSTANT_EXCESS")
        self.values = values.copy()
        super().__init__(lambda x: self.values)
    def excess_jacobian_full(self, x, dependent_index=None, *, step=None):
        return IdealExcessAdapter.excess_jacobian_full(self, x, dependent_index, step=step)