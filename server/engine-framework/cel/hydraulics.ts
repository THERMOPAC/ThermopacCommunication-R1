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
import { goldenSectionMaximize } from './numerical';

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
 * Terminal (free-rise/free-fall) velocity of a single rigid spherical drop in
 * a quiescent continuous phase — force balance solved iteratively:
 *
 *   u_t = √( 4·g·d·|Δρ| / (3·Cd·ρc) ),   Cd = f(Re(u_t))
 *
 * NOTE: assumes rigid-sphere behaviour. Circulating/oscillating drops in
 * liquid-liquid systems can deviate; the LLX engine applies column-specific
 * corrections on top of this baseline.
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

  const warnings: EngineeringWarning[] = [];

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

export interface FloodingPointResult {
  holdupAtFlooding: number;             // φ_f
  dispersedVelocityAtFlooding: number;  // u_df, m/s
  continuousVelocityAtFlooding: number; // u_cf, m/s
  totalThroughputAtFlooding: number;    // u_df + u_cf, m/s
  warnings: EngineeringWarning[];
}

/**
 * Flooding point from the Thornton slip-velocity framework.
 *
 * Model: u_d/φ + u_c/(1−φ) = u₀·(1−φ), with fixed flow ratio R = u_c/u_d.
 * Substituting u_c = R·u_d:
 *   u_d(φ) = u₀ · φ·(1−φ)² / ( (1−φ) + R·φ )
 * Flooding occurs at the φ that maximises u_d — found numerically
 * (golden-section), which is robust for all R including R → 1.
 *
 * @param characteristicVelocity u₀ — column-specific characteristic slip
 *        velocity, m/s. MUST be supplied by the calling engine (ECP/ECR
 *        correlations produce different u₀).
 * @param flowRatio R = u_c/u_d (continuous-to-dispersed superficial velocity ratio)
 */
export function thorntonFloodingPoint(
  characteristicVelocity: number,
  flowRatio: number,
): FloodingPointResult {
  assertPositive(characteristicVelocity, 'characteristicVelocity');
  assertNonNegative(flowRatio, 'flowRatio');

  const warnings: EngineeringWarning[] = [];
  const u0 = characteristicVelocity;
  const R = flowRatio;

  const uD = (phi: number) => (u0 * phi * (1 - phi) * (1 - phi)) / ((1 - phi) + R * phi);

  const { x: phiF, fx: uDf, converged } = goldenSectionMaximize(uD, 1e-6, 1 - 1e-6, 1e-10);
  if (!converged) {
    warnings.push({
      code: 'FLOODING_SEARCH_NOT_CONVERGED',
      message: 'Golden-section search for flooding holdup did not fully converge — result is approximate.',
    });
  }

  const uCf = R * uDf;
  warnIfOutsideRange(phiF, 0.05, 0.6, 'Flooding holdup φ_f', warnings, 'FLOODING_HOLDUP_UNUSUAL');

  return {
    holdupAtFlooding: phiF,
    dispersedVelocityAtFlooding: uDf,
    continuousVelocityAtFlooding: uCf,
    totalThroughputAtFlooding: uDf + uCf,
    warnings,
  };
}

/**
 * Percent-of-flooding for actual operating velocities against the flooding point.
 * Standard design practice: operate extraction columns at 40–80 % of flooding.
 */
export function percentOfFlooding(
  actualDispersedVelocity: number,
  actualContinuousVelocity: number,
  flooding: FloodingPointResult,
): CalcResult {
  assertNonNegative(actualDispersedVelocity, 'actualDispersedVelocity');
  assertNonNegative(actualContinuousVelocity, 'actualContinuousVelocity');
  const warnings: EngineeringWarning[] = [];
  const actualTotal = actualDispersedVelocity + actualContinuousVelocity;
  const floodTotal = flooding.totalThroughputAtFlooding;
  if (floodTotal <= 0) {
    throw new EngineeringInputError('Flooding total throughput must be > 0.');
  }
  const pct = (actualTotal / floodTotal) * 100;
  if (pct >= 100) {
    warnings.push({
      code: 'ABOVE_FLOODING',
      message: `Operating point is at ${pct.toFixed(1)} % of flooding — column will flood. Increase diameter or reduce throughput.`,
    });
  } else if (pct > 80) {
    warnings.push({
      code: 'NEAR_FLOODING',
      message: `Operating point is at ${pct.toFixed(1)} % of flooding — above the recommended 80 % design ceiling.`,
    });
  } else if (pct < 40) {
    warnings.push({
      code: 'FAR_BELOW_FLOODING',
      message: `Operating point is at ${pct.toFixed(1)} % of flooding — column may be oversized (design practice: 40–80 %).`,
    });
  }
  return { value: pct, warnings };
}
