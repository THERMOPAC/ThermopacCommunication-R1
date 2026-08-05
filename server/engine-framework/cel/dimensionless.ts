// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Dimensionless Numbers (Level 1: LLX scope)
//
// Reynolds, Weber, Froude — the groups required by LLX hydraulic design.
// All inputs in SI units. Invalid physics throws EngineeringInputError.
// ═══════════════════════════════════════════════════════════════════════════════

import { assertPositive, assertNonNegative, GRAVITY } from './utilities';

/**
 * Reynolds number: Re = ρ·u·L / μ
 * @param density fluid density, kg/m³
 * @param velocity characteristic velocity magnitude, m/s
 * @param characteristicLength diameter / hydraulic diameter / drop diameter, m
 * @param dynamicViscosity Pa·s
 */
export function reynolds(
  density: number,
  velocity: number,
  characteristicLength: number,
  dynamicViscosity: number,
): number {
  assertPositive(density, 'density');
  assertNonNegative(velocity, 'velocity');
  assertPositive(characteristicLength, 'characteristicLength');
  assertPositive(dynamicViscosity, 'dynamicViscosity');
  return (density * velocity * characteristicLength) / dynamicViscosity;
}

/**
 * Weber number: We = ρ·u²·L / σ
 * Ratio of inertial to interfacial-tension forces — governs drop break-up.
 * @param density continuous-phase density, kg/m³
 * @param velocity characteristic velocity, m/s
 * @param characteristicLength drop diameter or nozzle diameter, m
 * @param surfaceTension interfacial tension, N/m
 */
export function weber(
  density: number,
  velocity: number,
  characteristicLength: number,
  surfaceTension: number,
): number {
  assertPositive(density, 'density');
  assertNonNegative(velocity, 'velocity');
  assertPositive(characteristicLength, 'characteristicLength');
  assertPositive(surfaceTension, 'surfaceTension');
  return (density * velocity * velocity * characteristicLength) / surfaceTension;
}

/**
 * Froude number: Fr = u / √(g·L)
 * Ratio of inertial to gravitational forces — governs pulsed-column agitation.
 * @param velocity characteristic velocity, m/s
 * @param characteristicLength m
 * @param g gravitational acceleration, m/s² (default standard gravity)
 */
export function froude(velocity: number, characteristicLength: number, g = GRAVITY): number {
  assertNonNegative(velocity, 'velocity');
  assertPositive(characteristicLength, 'characteristicLength');
  assertPositive(g, 'g');
  return velocity / Math.sqrt(g * characteristicLength);
}

/**
 * Eötvös (Bond) number: Eo = Δρ·g·d² / σ
 * Governs drop shape regime (spherical / oblate / cap) in liquid-liquid systems.
 * @param densityDifference |ρc − ρd|, kg/m³
 * @param dropDiameter m
 * @param interfacialTension N/m
 */
export function eotvos(
  densityDifference: number,
  dropDiameter: number,
  interfacialTension: number,
  g = GRAVITY,
): number {
  assertNonNegative(densityDifference, 'densityDifference');
  assertPositive(dropDiameter, 'dropDiameter');
  assertPositive(interfacialTension, 'interfacialTension');
  return (densityDifference * g * dropDiameter * dropDiameter) / interfacialTension;
}

/**
 * Morton number: Mo = g·μc⁴·Δρ / (ρc²·σ³)
 * Fluid-pair property group used with Eo to classify drop behaviour (Grace diagram).
 * @param continuousViscosity Pa·s
 * @param densityDifference kg/m³
 * @param continuousDensity kg/m³
 * @param interfacialTension N/m
 */
export function morton(
  continuousViscosity: number,
  densityDifference: number,
  continuousDensity: number,
  interfacialTension: number,
  g = GRAVITY,
): number {
  assertPositive(continuousViscosity, 'continuousViscosity');
  assertNonNegative(densityDifference, 'densityDifference');
  assertPositive(continuousDensity, 'continuousDensity');
  assertPositive(interfacialTension, 'interfacialTension');
  return (
    (g * Math.pow(continuousViscosity, 4) * densityDifference) /
    (continuousDensity * continuousDensity * Math.pow(interfacialTension, 3))
  );
}
