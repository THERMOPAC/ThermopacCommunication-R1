"""Unqualified direct-boundary probe for the pinned seven-component model.

This module intentionally bypasses both historical composition wrappers.  It
is research instrumentation, not a qualified thermodynamic or film adapter.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

from thermo_adapter import FiniteFilmThermoAdapter

NCOMP = 7
RESEARCH_UNQUALIFIED = (
    "RESEARCH_UNQUALIFIED_SOURCE_GROUNDED_"
    "PENDING_INDEPENDENT_QUALIFICATION"
)
ROOT = Path(__file__).resolve().parents[2]
TASK238_MODEL = (
    ROOT
    / "dist/predictive-nt-runtime-7c-1-5/server/research"
    / "task-238-nmp-oil-interaction-model/model.py"
)
SIX_PROFILES = (
    ROOT
    / "dist/predictive-nt-runtime-7c-1-5/server/research"
    / "ecr-pre-pilot-six-component-thermodynamics/generated/profiles/sigma3"
)
WATER_PROFILES = (
    ROOT
    / "dist/predictive-nt-runtime-7c-1-5/server/research"
    / "ecr-pre-pilot-seven-component-h2o-profile/generated/profiles/sigma3"
)
PROFILE_KEYS = (
    "SNRUBQQJIBEYMU-UHFFFAOYSA-N",
    "ODLMAHJVESYWTB-UHFFFAOYSA-N",
    "QPUYECUOLPXSFR-UHFFFAOYSA-N",
    "BBEAQIROQSPTKN-UHFFFAOYSA-N",
    "UJAWGGOCYUPCPS-UHFFFAOYSA-N",
    "SECXISVLQFMRJM-UHFFFAOYSA-N",
    "XLYOFNOQVPJJNP-UHFFFAOYSA-N",
)


class BoundaryAdapterError(RuntimeError):
    """The direct native value is undefined or the request is invalid."""


def _load_task238():
    spec = importlib.util.spec_from_file_location(
        "finite_film_boundary_task238_equations", TASK238_MODEL
    )
    if spec is None or spec.loader is None:
        raise BoundaryAdapterError("BOUNDARY_ADAPTER_TASK238_LOAD_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _profile_path(index):
    directory = WATER_PROFILES if index == 6 else SIX_PROFILES
    return directory / f"{PROFILE_KEYS[index]}.sigma"


class BoundaryExcessAdapter:
    """Expose direct native plus RK ``ln(gamma)`` without altering ``x``.

    Literal zeros are passed to the native extension.  If that extension does
    not define a finite value, this adapter raises and does not extrapolate.
    """

    qualification_status = RESEARCH_UNQUALIFIED
    kind = "direct_native_plus_exact_task238_polynomial_excess"

    def __init__(self, engine, temperature_k=298.15):
        self.engine = engine
        self.np = engine.np
        self.native = engine.model.native_model.native_seven
        self.parameters = engine.model.parameters
        self.task238 = _load_task238()
        self.temperature_k = self._temperature(temperature_k)
        self.profile_sources = tuple(_profile_path(i) for i in range(NCOMP))
        ccosmo = sys.modules.get("cCOSMO")
        if ccosmo is None:
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_PINNED_CCOSMO_MODULE_NOT_LOADED"
            )
        self._profile_database = ccosmo.DirectImport()
        areas, volumes, psigma_a = [], [], []
        for key, path in zip(PROFILE_KEYS, self.profile_sources):
            try:
                self._profile_database.add_profile(key, str(path.parent))
                profile = self._profile_database.get_profile(key)
                rows = self.np.r_[
                    profile.profiles.nhb.psigmaA,
                    profile.profiles.oh.psigmaA,
                    profile.profiles.ot.psigmaA,
                ]
            except Exception as error:
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_PINNED_PROFILE_READ_FAILED"
                ) from error
            if rows.shape != (153,) or not self.np.all(self.np.isfinite(rows)):
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_PINNED_PROFILE_DIMENSION"
                )
            areas.append(float(profile.A_COSMO_A2))
            volumes.append(float(profile.V_COSMO_A3))
            psigma_a.append(rows)
        self.profile_areas = self.np.asarray(areas, dtype=float)
        self.profile_volumes = self.np.asarray(volumes, dtype=float)
        self.profile_psigma_a = self.np.asarray(psigma_a, dtype=float)
        self._pure_segment_cache = None
        self._kernel_cache = None
        self.last_evaluation = None
        self.last_derivative = None
        self._derivative_adapter = FiniteFilmThermoAdapter(
            self.excess
        )

    def _temperature(self, value):
        try:
            value = float(value)
        except (TypeError, ValueError) as error:
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_TEMPERATURE_FINITE_POSITIVE"
            ) from error
        if not self.np.isfinite(value) or value <= 0.0:
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_TEMPERATURE_FINITE_POSITIVE"
            )
        return value

    def _simplex(self, value):
        try:
            x = self.np.asarray(value, dtype=float)
        except (TypeError, ValueError) as error:
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_COMPOSITION_SHAPE_OR_FINITE"
            ) from error
        if x.shape != (NCOMP,) or not self.np.all(self.np.isfinite(x)):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_COMPOSITION_SHAPE_OR_FINITE"
            )
        if self.np.any(x < 0.0) or abs(float(x.sum()) - 1.0) > 2e-12:
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_FULL_PHYSICAL_SIMPLEX_REQUIRED"
            )
        return x

    def component_parts(self, composition, temperature_k=None):
        """Return separate direct-native and exact-polynomial contributions."""
        x = self._simplex(composition)
        temperature = (
            self.temperature_k
            if temperature_k is None
            else self._temperature(temperature_k)
        )
        try:
            native = (
                self.np.asarray(
                    self.native.get_lngamma_comb(temperature, x), dtype=float
                )
                + self.np.asarray(
                    self.native.get_lngamma_resid(temperature, x), dtype=float
                )
            )
        except Exception as error:
            self.last_evaluation = {
                "status": "NATIVE_RAW_LIMIT_UNDEFINED",
                "error": f"{type(error).__name__}: {error}",
            }
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_NATIVE_RAW_LIMIT_UNDEFINED"
            ) from error
        if native.shape != (NCOMP,) or not self.np.all(self.np.isfinite(native)):
            self.last_evaluation = {"status": "NATIVE_RAW_LIMIT_UNDEFINED"}
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_NATIVE_RAW_LIMIT_UNDEFINED"
            )
        try:
            g, delta_mu = self.task238.correction(
                self.np, x, temperature, self.parameters
            )
            rk = self.np.asarray(delta_mu, dtype=float)
            value = native + rk
        except Exception as error:
            self.last_evaluation = {
                "status": "RK_CORRECTION_FAILED",
                "error": f"{type(error).__name__}: {error}",
            }
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_EXACT_RK_CORRECTION_FAILED"
            ) from error
        if (
            value.shape != (NCOMP,)
            or not self.np.all(self.np.isfinite(value))
            or not self.np.isfinite(g)
        ):
            self.last_evaluation = {"status": "DIRECT_EXCESS_NONFINITE"}
            raise BoundaryAdapterError("BOUNDARY_ADAPTER_DIRECT_EXCESS_NONFINITE")
        self.last_evaluation = {
            "status": RESEARCH_UNQUALIFIED,
            "literalZeroPreserved": bool(self.np.any(x == 0.0)),
            "normalizationOrClippingApplied": False,
            "rkScalarG": float(g),
        }
        return {"native": native, "rk": rk}

    def excess(self, composition, temperature_k=None):
        """Return direct native plus exact RK excess at the literal state."""
        parts = self.component_parts(composition, temperature_k)
        return parts["native"] + parts["rk"]

    def excess_jacobian_full(
        self, composition, dependent_index=None, step=None
    ):
        """Finite-difference the provisional source through the existing wrapper."""
        value = self._derivative_adapter.excess_jacobian_full(
            composition, dependent_index, step=step
        )
        self.last_derivative = self._derivative_adapter.last_derivative
        return value

    def analytic_combinatorial(self, composition):
        """Evaluate exactly COSMO.hpp:76-87 without any ``log(x_i)``."""
        x = self._simplex(composition)
        constants = self.native.get_mutable_combinatorial_constants()
        q = self.profile_areas / float(constants.q0)
        r = self.profile_volumes / float(constants.r0)
        z = float(constants.z_coordination)
        qbar = float(x @ q)
        rbar = float(x @ r)
        if not (
            qbar > 0.0
            and rbar > 0.0
            and self.np.isfinite(qbar)
            and self.np.isfinite(rbar)
        ):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_COMBINATORIAL_REDUCED_DENOMINATOR"
            )
        l_value = z / 2.0 * (r - q) - (r - 1.0)
        phi_over_x = r / rbar
        theta_over_phi = (q / qbar) / (r / rbar)
        value = (
            self.np.log(phi_over_x)
            + z / 2.0 * q * self.np.log(theta_over_phi)
            + l_value
            - phi_over_x * float(x @ l_value)
        )
        if value.shape != (NCOMP,) or not self.np.all(self.np.isfinite(value)):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_ANALYTIC_COMBINATORIAL_NONFINITE"
            )
        return value

    def source_grounded_probe(self, composition):
        """Probe source identities exposed by the pinned ABI; do not qualify."""
        x = self._simplex(composition)
        np = self.np
        analytic = self.analytic_combinatorial(x)
        native = np.asarray(
            self.native.get_lngamma_comb(self.temperature_k, x), dtype=float
        )
        area_bar = float(x @ self.profile_areas)
        psigma = (x @ self.profile_psigma_a) / area_bar
        if psigma.shape != (153,) or not np.all(np.isfinite(psigma)):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_MIXTURE_PROFILE_NONFINITE"
            )
        normalization_tolerance = float(64.0 * np.finfo(float).eps * 153.0)
        mixture_normalization_error = abs(float(psigma.sum()) - 1.0)
        if np.any(psigma < 0.0) or mixture_normalization_error > normalization_tolerance:
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_MIXTURE_PROFILE_NOT_PROBABILITY"
            )
        gamma = np.asarray(
            self.native.get_Gamma(self.temperature_k, psigma), dtype=float
        )
        if (
            gamma.shape != (153,)
            or not np.all(np.isfinite(gamma))
            or not np.all(gamma > 0.0)
        ):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_SEGMENT_GAMMA_NOT_FINITE_POSITIVE"
            )

        model_constants = self.native.get_mutable_COSMO_constants()
        fast_gamma = bool(model_constants.fast_Gamma)
        gamma_tolerance = float(model_constants.Gamma_rel_tol)
        if not (gamma_tolerance > 0.0 and np.isfinite(gamma_tolerance)):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_DECLARED_GAMMA_TOLERANCE_INVALID"
            )
        if fast_gamma:
            nhb_nonzero = np.any(
                np.abs(self.profile_psigma_a[:, :51]) > 1e-16, axis=0
            )
            nonzero_indices = np.flatnonzero(nhb_nonzero)
            if nonzero_indices.size == 0:
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_FAST_GAMMA_ACTIVE_SUPPORT_EMPTY"
                )
            left, right = int(nonzero_indices[0]), int(nonzero_indices[-1])
            active = np.r_[
                np.arange(left, right + 1),
                np.arange(51 + left, 51 + right + 1),
                np.arange(102 + left, 102 + right + 1),
            ]
        else:
            left, right = 0, 50
            active = np.arange(153)

        def gamma_fixed_point(profile, value):
            aa_value = np.asarray(
                self.native.get_AA(self.temperature_k, profile), dtype=float
            )
            if aa_value.shape != (153, 153) or not np.all(np.isfinite(aa_value)):
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_SEGMENT_AA_NONFINITE"
                )
            aa_active = aa_value[np.ix_(active, active)]
            denominator = aa_active @ value[active]
            if not np.all(np.isfinite(denominator)) or not np.all(denominator > 0.0):
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_SEGMENT_FIXED_POINT_DENOMINATOR"
                )
            fixed = 1.0 / denominator
            residual = float(
                np.max(np.abs(value[active] - fixed) / value[active])
            )
            # Source stops after Gamma=(old+new)/2 when
            # |Gamma-new|/Gamma <= t.  Both old/Gamma and new/Gamma then
            # lie in [1-t,1+t], so F(Gamma)/Gamma lies in
            # [(1-t)^2,(1+t)^2].
            derived_bound = 2.0 * gamma_tolerance + gamma_tolerance**2
            roundoff = float(64.0 * np.finfo(float).eps)
            if residual > derived_bound + roundoff:
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_SEGMENT_FIXED_POINT_RESIDUAL_EXCEEDS_"
                    "DAMPED_STOP_BOUND"
                )
            inactive = np.setdiff1d(np.arange(153), active)
            return {
                "actualMaximumRelativeFixedPointResidual": residual,
                "declaredDampedIterationTolerance": gamma_tolerance,
                "derivedMaximumFixedPointResidualBound": derived_bound,
                "derivedBoundFormula": "2*t+t^2",
                "activeEquationCount": int(active.size),
                "inactiveEquationCount": int(inactive.size),
                "inactiveReturnedGammaMaximumAbsFromOne": (
                    float(np.max(np.abs(value[inactive] - 1.0)))
                    if inactive.size
                    else 0.0
                ),
                "equationMode": (
                    "FAST_TRUNCATED_ACTIVE_ROWS_AND_COLUMNS"
                    if fast_gamma
                    else "FULL_153_BY_153"
                ),
            }

        mixture_fixed_point = gamma_fixed_point(psigma, gamma)

        if self._kernel_cache is None:
            uniform = np.ones(153, dtype=float) / 153.0
            kernel = np.asarray(
                self.native.get_AA(self.temperature_k, uniform), dtype=float
            ) / uniform[None, :]
            if (
                kernel.shape != (153, 153)
                or not np.all(np.isfinite(kernel))
                or not np.all(kernel > 0.0)
            ):
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_FULL_SEGMENT_KERNEL_NOT_FINITE_POSITIVE"
                )
            symmetry_error = float(np.max(np.abs(kernel - kernel.T)))
            symmetry_tolerance = float(
                64.0 * np.finfo(float).eps * max(1.0, float(np.max(kernel)))
            )
            if symmetry_error > symmetry_tolerance:
                raise BoundaryAdapterError(
                    "BOUNDARY_ADAPTER_FULL_SEGMENT_KERNEL_NOT_SYMMETRIC"
                )
            self._kernel_cache = {
                "fullKernelFiniteStrictlyPositive": True,
                "fullKernelMinimum": float(kernel.min()),
                "fullKernelMaximum": float(kernel.max()),
                "fullKernelMaximumAbsSymmetryError": symmetry_error,
                "symmetryRoundoffTolerance": symmetry_tolerance,
            }

        if self._pure_segment_cache is None:
            pure_gammas = []
            pure_reports = []
            for i in range(NCOMP):
                pure_profile = self.profile_psigma_a[i] / self.profile_areas[i]
                normalization_error = abs(float(pure_profile.sum()) - 1.0)
                if (
                    np.any(pure_profile < 0.0)
                    or not np.all(np.isfinite(pure_profile))
                    or normalization_error > normalization_tolerance
                ):
                    raise BoundaryAdapterError(
                        "BOUNDARY_ADAPTER_PURE_PROFILE_NOT_PROBABILITY"
                    )
                pure_gamma = np.asarray(
                    self.native.get_Gamma(self.temperature_k, pure_profile),
                    dtype=float,
                )
                if (
                    pure_gamma.shape != (153,)
                    or not np.all(np.isfinite(pure_gamma))
                    or not np.all(pure_gamma > 0.0)
                ):
                    raise BoundaryAdapterError(
                        "BOUNDARY_ADAPTER_PURE_SEGMENT_GAMMA_NOT_FINITE_POSITIVE"
                    )
                pure_gammas.append(pure_gamma)
                pure_reports.append(
                    {
                        "componentIndex": i,
                        "minimum": float(pure_profile.min()),
                        "nonnegative": True,
                        "normalizationAbsError": normalization_error,
                        "normalizationRoundoffTolerance": normalization_tolerance,
                        "segmentGamma": gamma_fixed_point(
                            pure_profile, pure_gamma
                        ),
                    }
                )
            self._pure_segment_cache = (pure_gammas, pure_reports)
        pure_gammas, pure_reports = self._pure_segment_cache

        aeff = float(model_constants.AEFFPRIME)
        if not (aeff > 0.0 and np.isfinite(aeff)):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_AEFF_NOT_FINITE_POSITIVE"
            )
        reconstructed_residual = np.asarray(
            [
                self.profile_areas[i]
                / aeff
                * np.sum(
                    (self.profile_psigma_a[i] / self.profile_areas[i])
                    * (np.log(gamma) - np.log(pure_gammas[i]))
                )
                for i in range(NCOMP)
            ],
            dtype=float,
        )
        native_residual = np.asarray(
            self.native.get_lngamma_resid(self.temperature_k, x), dtype=float
        )
        if (
            reconstructed_residual.shape != (NCOMP,)
            or native_residual.shape != (NCOMP,)
            or not np.all(np.isfinite(reconstructed_residual))
            or not np.all(np.isfinite(native_residual))
        ):
            raise BoundaryAdapterError(
                "BOUNDARY_ADAPTER_RESIDUAL_RECONSTRUCTION_NONFINITE"
            )
        support = psigma > 0.0
        return {
            "qualificationStatus": RESEARCH_UNQUALIFIED,
            "analyticCombinatorial": analytic,
            "nativeCombinatorial": native,
            "maximumAbsCombinatorialAgreement": float(
                self.np.max(self.np.abs(analytic - native))
            ),
            "combinatorialConstantsFromPinnedAbi": {
                "q0": float(
                    self.native.get_mutable_combinatorial_constants().q0
                ),
                "r0": float(
                    self.native.get_mutable_combinatorial_constants().r0
                ),
                "zCoordination": float(
                    self.native.get_mutable_combinatorial_constants().z_coordination
                ),
            },
            "profileGeometryFromPinnedAbi": {
                "areasA2": self.profile_areas.tolist(),
                "volumesA3": self.profile_volumes.tolist(),
            },
            "mixtureProfileMinimum": float(psigma.min()),
            "mixtureProfileNonnegative": True,
            "mixtureProfileNormalizationAbsError": mixture_normalization_error,
            "profileNormalizationRoundoffTolerance": normalization_tolerance,
            "mixtureProfileSupportCount": int(support.sum()),
            "segmentGammaReturnedWithoutConvergenceException": True,
            "segmentGammaMinimum": float(gamma.min()),
            "segmentGammaMaximum": float(gamma.max()),
            "segmentIterationSettingsFromPinnedAbi": {
                "fastGamma": fast_gamma,
                "gammaRelativeTolerance": gamma_tolerance,
                "AEFFPRIME": aeff,
                "fastNHBLeftIndex": left,
                "fastNHBRightIndex": right,
            },
            "mixtureSegmentGammaFixedPoint": mixture_fixed_point,
            "pureProfiles": pure_reports,
            "fullKernel": self._kernel_cache,
            "residualReconstruction": {
                "independent": reconstructed_residual.tolist(),
                "declaredNative": native_residual.tolist(),
                "maximumAbsAgreement": float(
                    np.max(np.abs(reconstructed_residual - native_residual))
                ),
                "declaredNativeGammaRelativeTolerance": gamma_tolerance,
                "agreementWithinDeclaredGammaRelativeTolerance": bool(
                    np.max(np.abs(reconstructed_residual - native_residual))
                    <= gamma_tolerance
                ),
                "formula": (
                    "Ai/AEFF*sum[pure_i*(log(Gamma_mix)-"
                    "log(Gamma_pure_i))]"
                ),
            },
            "absentSpeciesHaveZeroMixtureNumeratorContribution": bool(
                all(
                    x[i] != 0.0
                    or np.all(x[i] * self.profile_psigma_a[i] == 0.0)
                    for i in range(NCOMP)
                )
            ),
        }


# Compatibility for the first diagnosis artifact; new callers should use the
# explicit public name above.
DirectNativeRkBoundaryAdapter = BoundaryExcessAdapter