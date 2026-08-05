// ═══════════════════════════════════════════════════════════════════════════════
// EPD — Engineering Property Database: type definitions
//
// Level 1 scope: liquid-phase properties needed by LLX (density, dynamic
// viscosity, specific heat, thermal conductivity, surface/interfacial tension).
// Extensible: new fluids register a FluidDefinition; new property kinds extend
// PropertyId; new correlation forms extend PropertyCorrelation.
// ═══════════════════════════════════════════════════════════════════════════════

import type { EngineeringWarning } from '../cel/utilities';

export type PropertyId =
  | 'density'              // kg/m³
  | 'dynamicViscosity'     // Pa·s
  | 'specificHeat'         // J/(kg·K)
  | 'thermalConductivity'  // W/(m·K)
  | 'surfaceTension';      // N/m (vs air unless noted)

export const PROPERTY_UNITS: Record<PropertyId, string> = {
  density: 'kg/m3',
  dynamicViscosity: 'Pa.s',
  specificHeat: 'J/(kg.K)',
  thermalConductivity: 'W/(m.K)',
  surfaceTension: 'N/m',
};

/** Polynomial in temperature (°C): value = Σ coeffs[i] · T^i, then × scale. */
export interface PolynomialCorrelation {
  type: 'polynomial-C';
  coeffs: number[];   // ascending powers of T [°C]
  scale?: number;     // optional output multiplier (default 1)
}

/**
 * Andrade/Vogel viscosity form in ABSOLUTE temperature:
 *   ln μ[mPa·s] = A + B / (T[K] − C)
 * (C = 0 gives plain Andrade). Output converted to Pa·s.
 */
export interface AndradeViscosityCorrelation {
  type: 'andrade-viscosity';
  A: number;
  B: number;
  C?: number; // Vogel offset, K (default 0)
}

/**
 * IAPWS-style surface tension: σ = s0 · τ^n · (1 − m·τ),  τ = (Tc − T[K])/Tc.
 */
export interface CriticalScalingSurfaceTension {
  type: 'critical-scaling-sigma';
  criticalTemperatureK: number;
  s0: number; // N/m
  n: number;
  m: number;
}

export type PropertyCorrelation =
  | PolynomialCorrelation
  | AndradeViscosityCorrelation
  | CriticalScalingSurfaceTension;

export interface PropertyEntry {
  correlation: PropertyCorrelation;
  /** Validated temperature range, °C. Outside → warning (extrapolation), not error. */
  validRangeC: { min: number; max: number };
  /** Data provenance — literature reference or fit description. */
  source: string;
  notes?: string;
}

export interface FluidDefinition {
  id: string;                 // e.g. 'water', 'nmp', 'rrbo'
  name: string;               // display name
  casNumber?: string;
  properties: Partial<Record<PropertyId, PropertyEntry>>;
  /** Interfacial tension against other fluids, N/m at ~25 °C (LLX systems). */
  interfacialTension?: Record<string, { value: number; source: string; notes?: string }>;
  notes?: string;
}

export interface PropertyResult {
  value: number;
  unit: string;
  fluidId: string;
  property: PropertyId;
  temperatureC: number;
  source: string;
  warnings: EngineeringWarning[];
}
