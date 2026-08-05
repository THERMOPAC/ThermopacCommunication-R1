// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Common Hydraulic Utilities (Level 1: LLX scope)
//
// Superficial velocity, drag coefficient, droplet terminal velocity,
// interfacial area, slip-velocity flooding analysis (Thornton framework).
//
// The characteristic (slip) velocity u₀ itself is COLUMN-SPECIFIC and must be
// supplied by the calling engine — CEL provides the geometry- and
// flooding-point mathematics that are common to all extraction columns.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  assertPositive, assertNonNegative, assertInRange,
  EngineeringInputError, EngineeringWarning, CalcResult,
  GRAVITY, warnIfOutsideRange,
} from './utilities';
import { reynolds } from './dimensionless';
import { goldenSectionMaximize, bisectionSolve } from './numerical';

// ── Geometry ──────────────────────────────────────────────────────────────────

/** Cross-sectional area of a circular column: A = π·D²/4, m². */
export function columnCrossSectionArea(diameter: number): number {
  assertPositive(diameter, 'diameter');
  return (Math.PI * diameter * diameter) / 4;
}

/**
 * Superficial velocity: u = Q / A
 * @param volumetricFlow m³/s
 * @param crossSectionArea m²
 * @returns m/s
 */
export function superficialVelocity(volumetricFlow: number, crossSectionArea: number): number {
  assertNonNegative(volumetricFlow, 'volumetricFlow');
  assertPositive(crossSectionArea, 'crossSectionArea');
  return volumetricFlow / crossSectionArea;
}

// ── Drag & terminal velocity ──────────────────────────────────────────────────

/**
 * Drag coefficient for a rigid sphere as a function of particle Reynolds number.
 * Piecewise:
 *   Re < 0.1        Stokes:            Cd = 24/Re
 *   0.1 ≤ Re < 1000 Schiller-Naumann:  Cd = (24/Re)(1 + 0.15·Re^0.687)
 *   1000 ≤ Re ≤ 2e5 Newton:            Cd = 0.44
 * Warns above Re = 2×10⁵ (drag crisis — correlation invalid).
 */
export function dragCoefficientSphere(re: number): CalcResult {
  assertPositive(re, 'Reynolds number');
  const warnings: EngineeringWarning[] = [];
  let cd: number;
  if (re < 0.1) {
    cd = 24 / re;
  } else if (re < 1000) {
    cd = (24 / re) * (1 + 0.15 * Math.pow(re, 0.687));
  } else {
    cd = 0.44;
    if (re > 2e5) {
      warnings.push({
        code: 'DRAG_CRISIS',
        message: `Particle Re = ${re.toExponential(2)} exceeds 2×10⁵ — Newton's-law Cd = 0.44 is not valid in the drag-crisis regime.`,
      });
    }
  }
  return { value: cd, warnings };
}

export interface TerminalVelocityResult {
  velocity: number;          // m/s
  reynolds: number;          // particle Reynolds number at terminal conditions
  dragCoefficient: number;
  regime: 'stokes' | 'intermediate' | 'newton';
  iterations: number;
  converged: boolean;
  warnings: EngineeringWarning[];
}

/**
 * RIGID-SPHERE TERMINAL-VELOCITY SCREENING.
 *
 * Terminal (free-rise/free-fall) velocity of a single RIGID spherical particle
 * in a quiescent continuous phase — force balance solved iteratively:
 *
 *   u_t = √( 4·g·d·|Δρ| / (3·Cd·ρc) ),   Cd = f(Re(u_t))
 *
 * ⚠ SCREENING ONLY — this is NOT a validated liquid-drop terminal velocity.
 * Real liquid drops (e.g. NMP/oil systems) may deform, internally circulate,
 * oscillate, or have interfaces immobilized by surfactants — all of which
 * change the drag. Every result carries a RIGID_SPHERE_SCREENING warning.
 *
 * @param dropDiameter m
 * @param dispersedDensity kg/m³
 * @param continuousDensity kg/m³
 * @param continuousViscosity Pa·s
 */
export function terminalVelocitySphere(
  dropDiameter: number,
  dispersedDensity: number,
  continuousDensity: number,
  continuousViscosity: number,
  g = GRAVITY,
): TerminalVelocityResult {
  assertPositive(dropDiameter, 'dropDiameter');
  assertPositive(dispersedDensity, 'dispersedDensity');
  assertPositive(continuousDensity, 'continuousDensity');
  assertPositive(continuousViscosity, 'continuousViscosity');

  const dRho = Math.abs(dispersedDensity - continuousDensity);
  if (dRho < 1e-9) {
    throw new EngineeringInputError(
      'Density difference between phases is ~zero — no gravitational settling/rise is possible. Check phase densities.',
    );
  }

  const warnings: EngineeringWarning[] = [
    {
      code: 'RIGID_SPHERE_SCREENING',
      message:
        'Rigid-sphere screening estimate only — real liquid drops may deform, internally circulate, oscillate, or have immobilized interfaces, changing the drag. Do not treat as a validated liquid-drop terminal velocity.',
    },
  ];

  // Initial guess from Stokes law
  let u = (dRho * g * dropDiameter * dropDiameter) / (18 * continuousViscosity);
  let re = 0;
  let cd = 0;
  let converged = false;
  let i = 0;
  const maxIter = 200;
  for (; i < maxIter; i++) {
    re = reynolds(continuousDensity, u, dropDiameter, continuousViscosity);
    const cdRes = dragCoefficientSphere(Math.max(re, 1e-12));
    cd = cdRes.value;
    const uNew = Math.sqrt((4 * g * dropDiameter * dRho) / (3 * cd * continuousDensity));
    if (Math.abs(uNew - u) <= 1e-12 + 1e-8 * uNew) {
      u = uNew;
      converged = true;
      break;
    }
    // Damped update for stability across regime boundaries
    u = 0.5 * (u + uNew);
  }
  re = reynolds(continuousDensity, u, dropDiameter, continuousViscosity);
  const finalCd = dragCoefficientSphere(Math.max(re, 1e-12));
  warnings.push(...finalCd.warnings);

  const regime: TerminalVelocityResult['regime'] =
    re < 0.1 ? 'stokes' : re < 1000 ? 'intermediate' : 'newton';

  if (!converged) {
    warnings.push({
      code: 'TERMINAL_VELOCITY_NOT_CONVERGED',
      message: `Terminal velocity iteration did not converge in ${maxIter} iterations — result is approximate.`,
    });
  }

  return { velocity: u, reynolds: re, dragCoefficient: finalCd.value, regime, iterations: i + 1, converged, warnings };
}

// ── Interfacial area ──────────────────────────────────────────────────────────

/**
 * Specific interfacial area from dispersed-phase holdup and Sauter mean drop
 * diameter:  a = 6·φ / d₃₂
 * @param holdup dispersed-phase volume fraction φ (0–1)
 * @param sauterMeanDiameter d₃₂, m
 * @returns m²/m³
 */
export function interfacialArea(holdup: number, sauterMeanDiameter: number): number {
  assertInRange(holdup, 0, 1, 'holdup');
  assertPositive(sauterMeanDiameter, 'sauterMeanDiameter');
  return (6 * holdup) / sauterMeanDiameter;
}

// ── Slip velocity & flooding (Thornton framework) ─────────────────────────────

/**
 * Slip velocity between phases at dispersed holdup φ:
 *   u_slip = u_d/φ + u_c/(1−φ)
 * @param dispersedSuperficialVelocity u_d, m/s
 * @param continuousSuperficialVelocity u_c, m/s
 * @param holdup φ (0–1 exclusive)
 */
export function slipVelocity(
  dispersedSuperficialVelocity: number,
  continuousSuperficialVelocity: number,
  holdup: number,
): number {
  assertNonNegative(dispersedSuperficialVelocity, 'dispersedSuperficialVelocity');
  assertNonNegative(continuousSuperficialVelocity, 'continuousSuperficialVelocity');
  if (holdup <= 0 || holdup >= 1) {
    throw new EngineeringInputError(`holdup must be in (0, 1) exclusive (got ${holdup}).`);
  }
  return dispersedSuperficialVelocity / holdup + continuousSuperficialVelocity / (1 - holdup);
}

/**
 * Generic counter-current holdup root solver.
 *
 * Finds dispersed-phase holdup φ satisfying the counter-current slip balance:
 *   u_d/φ + u_c/(1−φ) = slipFn(φ)
 * where slipFn is the TECHNOLOGY-SPECIFIC slip-velocity model supplied by the
 * calling engine (ECP packing model, ECR rotor/compartment model, etc.).
 * CEL makes NO claim about which slip model applies to which equipment.
 *
 * Scans the bounded interval for sign changes and returns ALL roots found
 * (the slip balance can have multiple solutions; the lowest is normally the
 * stable operating holdup).
 *
 * @param slipFn engine-supplied slip velocity model, m/s as a function of φ
 * @param dispersedSuperficialVelocity u_d, m/s
 * @param continuousSuperficialVelocity u_c, m/s
 * @param bounds holdup search bounds within (0, 1); default [0.001, 0.999]
 */
export function solveCounterCurrentHoldup(
  slipFn: (holdup: number) => number,
  dispersedSuperficialVelocity: number,
  continuousSuperficialVelocity: number,
  bounds: { min: number; max: number } = { min: 0.001, max: 0.999 },
): { roots: number[]; converged: boolean; warnings: EngineeringWarning[] } {
  assertNonNegative(dispersedSuperficialVelocity, 'dispersedSuperficialVelocity');
  assertNonNegative(continuousSuperficialVelocity, 'continuousSuperficialVelocity');
  if (!(bounds.min > 0 && bounds.max < 1 && bounds.min < bounds.max)) {
    throw new EngineeringInputError(`Holdup bounds must satisfy 0 < min < max < 1 (got [${bounds.min}, ${bounds.max}]).`);
  }
  const residual = (phi: number) =>
    slipVelocity(dispersedSuperficialVelocity, continuousSuperficialVelocity, phi) - slipFn(phi);

  const warnings: EngineeringWarning[] = [];
  const roots: number[] = [];
  const nScan = 200;
  let allConverged = true;
  let prevPhi = bounds.min;
  let prevR = residual(prevPhi);
  if (!Number.isFinite(prevR)) throw new EngineeringInputError(`Slip balance residual not finite at φ = ${prevPhi}.`);
  for (let i = 1; i <= nScan; i++) {
    const phi = bounds.min + ((bounds.max - bounds.min) * i) / nScan;
    const r = residual(phi);
    if (!Number.isFinite(r)) throw new EngineeringInputError(`Slip balance residual not finite at φ = ${phi}.`);
    if (prevR === 0) roots.push(prevPhi);
    else if (prevR * r < 0) {
      const sol = bisectionSolve(residual, prevPhi, phi, 1e-12);
      roots.push(sol.root);
      if (!sol.converged) allConverged = false;
    }
    prevPhi = phi; prevR = r;
  }
  if (roots.length === 0) {
    warnings.push({
      code: 'NO_HOLDUP_SOLUTION',
      message: 'No holdup satisfies the slip balance within the search bounds — the column is likely flooded at these velocities (or the slip model/inputs are inconsistent).',
    });
  }
  if (roots.length > 1) {
    warnings.push({
      code: 'MULTIPLE_HOLDUP_ROOTS',
      message: `Slip balance has ${roots.length} holdup solutions — the lowest is normally the stable operating point; the upper root indicates approach to flooding.`,
    });
  }
  return { roots, converged: allConverged, warnings };
}

export interface ThroughputMaximumResult {
  /** How the flow ratio is defined — always continuous/dispersed here. */
  flowRatioDefinition: 'R = u_c / u_d';
  flowRatioValue: number;
  holdupBounds: { min: number; max: number };
  optimumHoldup: number;                 // φ at maximum throughput
  dispersedVelocityAtMaximum: number;    // u_d, m/s
  continuousVelocityAtMaximum: number;   // u_c = R·u_d, m/s
  converged: boolean;
  warnings: EngineeringWarning[];
}

/**
 * Generic bounded throughput maximizer at FIXED flow ratio.
 *
 * Numerically maximizes an ENGINE-SUPPLIED dispersed-phase throughput
 * function u_d(φ) over a bounded holdup interval (golden-section search).
 * The physical meaning of the maximum (e.g. a flooding point) is defined by
 * the calling engine's hydraulic model — CEL provides only the mathematics.
 * This is NOT an ECP or ECR flooding correlation; those require
 * technology-specific engines.
 *
 * The result is bound to the flow ratio it was computed at — comparisons at
 * a different operating ratio are invalid (see percentOfThroughputMaximum).
 *
 * @param dispersedThroughputOfHoldup engine-supplied u_d(φ), m/s
 * @param flowRatio R = u_c/u_d at which the function was constructed
 * @param bounds holdup search bounds within (0, 1); default [1e-6, 1−1e-6]
 */
export function maximizeThroughputAtFixedFlowRatio(
  dispersedThroughputOfHoldup: (holdup: number) => number,
  flowRatio: number,
  bounds: { min: number; max: number } = { min: 1e-6, max: 1 - 1e-6 },
): ThroughputMaximumResult {
  assertNonNegative(flowRatio, 'flowRatio');
  if (!(bounds.min > 0 && bounds.max < 1 && bounds.min < bounds.max)) {
    throw new EngineeringInputError(`Holdup bounds must satisfy 0 < min < max < 1 (got [${bounds.min}, ${bounds.max}]).`);
  }
  const warnings: EngineeringWarning[] = [];
  const { x: phiOpt, fx: uDMax, converged } = goldenSectionMaximize(
    dispersedThroughputOfHoldup, bounds.min, bounds.max, 1e-10,
  );
  if (!converged) {
    warnings.push({
      code: 'THROUGHPUT_SEARCH_NOT_CONVERGED',
      message: 'Golden-section search for the throughput maximum did not fully converge — result is approximate.',
    });
  }
  if (!(uDMax > 0)) {
    warnings.push({
      code: 'NONPOSITIVE_THROUGHPUT_MAXIMUM',
      message: `Throughput maximum is ${uDMax} m/s (≤ 0) — the supplied throughput function or its bounds are physically inconsistent.`,
    });
  }
  warnIfOutsideRange(phiOpt, 0.05, 0.6, 'Optimum holdup φ*', warnings, 'OPTIMUM_HOLDUP_UNUSUAL');

  return {
    flowRatioDefinition: 'R = u_c / u_d',
    flowRatioValue: flowRatio,
    holdupBounds: { ...bounds },
    optimumHoldup: phiOpt,
    dispersedVelocityAtMaximum: uDMax,
    continuousVelocityAtMaximum: flowRatio * uDMax,
    converged,
    warnings,
  };
}

/**
 * Percent-of-maximum-throughput for actual operating velocities against a
 * throughput maximum computed by maximizeThroughputAtFixedFlowRatio.
 *
 * The comparison is only physically valid at the SAME flow ratio the maximum
 * was computed at — an off-ratio comparison throws unless the caller passes
 * allowRatioMismatch, in which case a warning is attached instead.
 * Standard design practice: operate extraction columns at 40–80 % of the
 * hydraulic capacity limit.
 */
export function percentOfThroughputMaximum(
  actualDispersedVelocity: number,
  actualContinuousVelocity: number,
  maximum: ThroughputMaximumResult,
  allowRatioMismatch = false,
): CalcResult {
  assertNonNegative(actualDispersedVelocity, 'actualDispersedVelocity');
  assertNonNegative(actualContinuousVelocity, 'actualContinuousVelocity');
  const warnings: EngineeringWarning[] = [];

  const maxTotal = maximum.dispersedVelocityAtMaximum + maximum.continuousVelocityAtMaximum;
  if (!(maxTotal > 0)) {
    throw new EngineeringInputError('Throughput maximum must be > 0 for a percent-of-maximum comparison.');
  }

  // Ratio binding: the maximum is only valid at its own flow ratio.
  if (actualDispersedVelocity > 0) {
    const actualRatio = actualContinuousVelocity / actualDispersedVelocity;
    const refRatio = maximum.flowRatioValue;
    const mismatch = Math.abs(actualRatio - refRatio) > 1e-6 + 0.01 * Math.max(actualRatio, refRatio);
    if (mismatch) {
      const msg = `Operating flow ratio R = ${actualRatio.toFixed(4)} differs from the ratio the throughput maximum was computed at (R = ${refRatio.toFixed(4)}). The comparison is not physically valid — recompute the maximum at the operating ratio.`;
      if (!allowRatioMismatch) throw new EngineeringInputError(msg);
      warnings.push({ code: 'FLOW_RATIO_MISMATCH', message: msg });
    }
  }

  const pct = ((actualDispersedVelocity + actualContinuousVelocity) / maxTotal) * 100;
  if (pct >= 100) {
    warnings.push({
      code: 'ABOVE_CAPACITY_LIMIT',
      message: `Operating point is at ${pct.toFixed(1)} % of the hydraulic capacity limit — the column cannot sustain this throughput. Increase diameter or reduce flows.`,
    });
  } else if (pct > 80) {
    warnings.push({
      code: 'NEAR_CAPACITY_LIMIT',
      message: `Operating point is at ${pct.toFixed(1)} % of the hydraulic capacity limit — above the recommended 80 % design ceiling.`,
    });
  } else if (pct < 40) {
    warnings.push({
      code: 'FAR_BELOW_CAPACITY_LIMIT',
      message: `Operating point is at ${pct.toFixed(1)} % of the hydraulic capacity limit — column may be oversized (design practice: 40–80 %).`,
    });
  }
  return { value: pct, warnings };
}
