// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Local NRTL Equilibrium Wrapper
//
// Computes local thermodynamic equilibrium quantities at a compartment's
// actual composition (x_j, y_j) using ONLY the governed NRTL functions:
//
//   nrtlFlash()     — isothermal two-phase LLE flash (Rachford–Rice)
//   nrtlLnGamma()   — NRTL ln activity coefficients
//   temperatureModelStatus() — temperature interpolation/extrapolation label
//
// All three functions are imported from the governed CEL module
// llx-temperature-lle-model.ts. No other equilibrium model is created here.
//
// Component system (frozen):
//   Index 0 = Saturates
//   Index 1 = Mono-aromatics
//   Index 2 = Di-aromatics
//   Index 3 = Poly-aromatics
//   Index 4 = NMP (solvent)
//
// Phase convention:
//   x_j = RRBO-rich (dispersed) phase composition at compartment j
//   y_j = NMP-rich  (continuous) phase composition at compartment j
//
// These are off-equilibrium compositions supplied as test/BVP state.
// The flash equilibrium (x_eq, y_eq) is what the system WOULD reach if
// the compartment were a single equilibrium stage at temperature T.
// ═══════════════════════════════════════════════════════════════════════════

import {
  nrtlFlash,
  nrtlLnGamma,
  temperatureModelStatus,
  type TemperatureModelStatus,
} from '../../engine-framework/cel/llx-temperature-lle-model';

import { validateComposition, COMPOSITION_TOLERANCE } from './llx-ecr2-composition';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Full NRTL thermodynamic state at a local compartment composition.
 *
 * gamma_x and gamma_y are always computed (only require x_j and y_j).
 * x_eq and y_eq require z_feed (overall compartment feed composition).
 */
export interface ECR2LocalNRTLResult {

  // ── Inputs echoed back ────────────────────────────────────────────────
  /** Local RRBO-rich (dispersed) phase mole fractions used. */
  x_j: number[];
  /** Local NMP-rich (continuous) phase mole fractions used. */
  y_j: number[];
  /** Temperature (K). */
  T_K: number;
  /** Feed composition used for flash (null if not supplied). */
  z_feed: number[] | null;

  // ── Activity coefficients at local compositions ───────────────────────
  /**
   * Activity coefficients at local RRBO-rich composition.
   * gamma_x[i] = exp(nrtlLnGamma(x_j, T_K)[i])
   * Always computed when x_j is a valid 5-component vector.
   */
  gamma_x: number[];

  /**
   * Activity coefficients at local NMP-rich composition.
   * gamma_y[i] = exp(nrtlLnGamma(y_j, T_K)[i])
   * Always computed when y_j is a valid 5-component vector.
   */
  gamma_y: number[];

  // ── Flash equilibrium (requires z_feed) ───────────────────────────────
  /**
   * Equilibrium RRBO-rich mole fractions from nrtlFlash(z_feed, T_K, x_j, y_j).
   * Null when z_feed was not supplied.
   */
  x_eq: number[] | null;

  /**
   * Equilibrium NMP-rich mole fractions from nrtlFlash(z_feed, T_K, x_j, y_j).
   * Null when z_feed was not supplied.
   */
  y_eq: number[] | null;

  /** Phase fraction β from Rachford-Rice solver. Null when z_feed not supplied. */
  flashBeta: number | null;

  /** True when the flash iteration converged to within the tolerance criterion. */
  flashConverged: boolean | null;

  /**
   * True when the flash produced a trivial result (|x_i − y_i| < 1e-4 for all i).
   * Trivial means the system is effectively single-phase at this T.
   */
  flashTrivial: boolean | null;

  // ── Temperature model ─────────────────────────────────────────────────
  /** Temperature interpolation / extrapolation classification. */
  temperatureStatus: TemperatureModelStatus;

  // ── K-values (equilibrium ratios) ─────────────────────────────────────
  /**
   * Equilibrium distribution ratios K_i = x_eq[i] / y_eq[i] at local T.
   * Computed from gamma_x / gamma_y when both are available (approximation for
   * local driving-force estimation before full flash).
   * K_approx[i] = gamma_x[i] / gamma_y[i]
   */
  K_approx: number[];

  // ── Diagnostics ───────────────────────────────────────────────────────
  diagnostics: string[];

  // ── Source model identification ───────────────────────────────────────
  modelId:      string;
  modelVersion: string;
}

// ── Module constants ────────────────────────────────────────────────────────

const NRTL_MODULE_REF =
  'Governed NRTL τ(T)=b/T (α=0.2) — Coto et al. (2022) LLE dataset. ' +
  'CEL: llx-temperature-lle-model.ts. Within calibrated range: direct tie-line. ' +
  'Outside: Temperature Extrapolation — Preliminary / Pending Validation.';

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Compute local NRTL equilibrium quantities at compartment j.
 *
 * @param x_j     Local RRBO-rich phase mole fractions (5 components).
 * @param y_j     Local NMP-rich phase mole fractions (5 components).
 * @param T_K     Temperature (K).
 * @param z_feed  Optional overall feed mole fractions for the flash.
 *                When omitted: gamma_x, gamma_y, and K_approx are computed;
 *                x_eq, y_eq, flashConverged, flashTrivial are null.
 * @param x0      Optional RRBO-rich initial guess for the flash (defaults to x_j).
 * @param y0      Optional NMP-rich  initial guess for the flash (defaults to y_j).
 */
export function computeLocalNRTL(params: {
  x_j: readonly number[];
  y_j: readonly number[];
  T_K: number;
  z_feed?: readonly number[];
  x0?: readonly number[];
  y0?: readonly number[];
}): ECR2LocalNRTLResult {
  const { x_j, y_j, T_K, z_feed, x0, y0 } = params;
  const diagnostics: string[] = [];

  // ── Validate input compositions ──────────────────────────────────────
  const xv = validateComposition(x_j, 'x_j (RRBO-rich)');
  const yv = validateComposition(y_j, 'y_j (NMP-rich)');

  if (!xv.valid) {
    diagnostics.push(`INPUT WARNING — x_j: ${xv.message}`);
  }
  if (!yv.valid) {
    diagnostics.push(`INPUT WARNING — y_j: ${yv.message}`);
  }

  if (z_feed !== undefined) {
    const zv = validateComposition(z_feed, 'z_feed (overall)');
    if (!zv.valid) {
      diagnostics.push(`INPUT WARNING — z_feed: ${zv.message}`);
    }
  }

  // ── Activity coefficients at local compositions ──────────────────────
  const lnGammaX = nrtlLnGamma(x_j, T_K);
  const lnGammaY = nrtlLnGamma(y_j, T_K);

  const gamma_x = lnGammaX.map((lg) => Math.exp(lg));
  const gamma_y = lnGammaY.map((lg) => Math.exp(lg));

  // K_approx[i] = gamma_x[i] / gamma_y[i]
  // This is the approximate equilibrium ratio at local compositions.
  // NOTE: This is NOT the same as K from a full flash (which uses normalised
  // equilibrium compositions). Use x_eq/y_eq for the full flash result.
  const K_approx = gamma_x.map((gx, i) => gx / gamma_y[i]);

  diagnostics.push(
    `gamma_x computed at x_j = [${x_j.map((v) => v.toFixed(4)).join(', ')}] at T = ${T_K.toFixed(2)} K.`,
  );
  diagnostics.push(
    `gamma_y computed at y_j = [${y_j.map((v) => v.toFixed(4)).join(', ')}] at T = ${T_K.toFixed(2)} K.`,
  );
  diagnostics.push(`NRTL: ${NRTL_MODULE_REF}`);

  // ── Temperature model status ─────────────────────────────────────────
  const tempStatus = temperatureModelStatus(T_K);
  if (tempStatus.mode === 'extrapolation') {
    diagnostics.push(
      `TEMPERATURE EXTRAPOLATION — T = ${T_K.toFixed(2)} K is ` +
      `${tempStatus.distanceOutsideRangeK.toFixed(2)} K outside calibrated range ` +
      `[${tempStatus.calibratedRangeK.minK.toFixed(2)}, ${tempStatus.calibratedRangeK.maxK.toFixed(2)}] K. ` +
      `Classification: ${tempStatus.classification}. ` +
      'All equilibrium values are Temperature Extrapolation — Preliminary / Pending Validation.',
    );
  }

  // ── Flash equilibrium (only when z_feed supplied) ────────────────────
  let x_eq: number[] | null = null;
  let y_eq: number[] | null = null;
  let flashBeta: number | null = null;
  let flashConverged: boolean | null = null;
  let flashTrivial: boolean | null = null;

  if (z_feed !== undefined) {
    // Use x_j and y_j as initial guesses (or caller-supplied x0/y0)
    const x0_flash = x0 ?? x_j;
    const y0_flash = y0 ?? y_j;

    try {
      const flash = nrtlFlash(z_feed, T_K, x0_flash, y0_flash);
      x_eq = flash.x;
      y_eq = flash.y;
      flashBeta = flash.beta;
      flashConverged = flash.converged;
      flashTrivial = flash.trivial;

      if (!flash.converged) {
        diagnostics.push(
          'NRTL flash did NOT converge within 1500 iterations. ' +
          'x_eq and y_eq are best available iterates, not guaranteed equilibrium values.',
        );
      }
      if (flash.trivial) {
        diagnostics.push(
          `NRTL flash result is TRIVIAL — |x_eq[i] − y_eq[i]| < 1e-4 for all i. ` +
          `System may be single-phase at T = ${T_K.toFixed(2)} K for z_feed = ` +
          `[${Array.from(z_feed).map((v) => v.toFixed(4)).join(', ')}].`,
        );
      } else {
        const xSumEq = x_eq.reduce((a, b) => a + b, 0);
        const ySumEq = y_eq.reduce((a, b) => a + b, 0);
        if (Math.abs(xSumEq - 1) > COMPOSITION_TOLERANCE * 10) {
          diagnostics.push(`ADVISORY — flash x_eq sum = ${xSumEq.toFixed(8)} ≠ 1 (post-normalization check).`);
        }
        if (Math.abs(ySumEq - 1) > COMPOSITION_TOLERANCE * 10) {
          diagnostics.push(`ADVISORY — flash y_eq sum = ${ySumEq.toFixed(8)} ≠ 1 (post-normalization check).`);
        }
      }
    } catch (err) {
      diagnostics.push(`NRTL flash ERROR: ${String(err)}. x_eq and y_eq remain null.`);
    }
  } else {
    diagnostics.push(
      'z_feed not supplied — x_eq, y_eq, and flash results are null. ' +
      'Supply z_feed (overall compartment mole fractions) to compute flash equilibrium.',
    );
  }

  return {
    x_j: Array.from(x_j),
    y_j: Array.from(y_j),
    T_K,
    z_feed: z_feed ? Array.from(z_feed) : null,

    gamma_x,
    gamma_y,

    x_eq,
    y_eq,
    flashBeta,
    flashConverged,
    flashTrivial,

    temperatureStatus: tempStatus,
    K_approx,

    diagnostics,
    modelId:      tempStatus.modelId,
    modelVersion: tempStatus.modelVersion,
  };
}

// ── Convenience: K-values from flash result ───────────────────────────────

/**
 * Compute true K-values from a converged flash result.
 * K_i = x_eq[i] / y_eq[i] — ratio of RRBO-rich to NMP-rich equilibrium mole fractions.
 *
 * Returns null when x_eq or y_eq is null, flash did not converge, or result is trivial.
 * Returns null for component i when y_eq[i] = 0 (avoid division by zero).
 */
export function flashKValues(result: ECR2LocalNRTLResult): (number | null)[] | null {
  if (
    result.x_eq === null ||
    result.y_eq === null ||
    result.flashConverged !== true ||
    result.flashTrivial === true
  ) {
    return null;
  }
  return result.x_eq.map((xi, i) => {
    const yi = result.y_eq![i];
    return yi === 0 ? null : xi / yi;
  });
}
