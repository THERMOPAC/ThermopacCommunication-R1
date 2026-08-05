// ═══════════════════════════════════════════════════════════════════════════════
// EPD — Engineering Property Database: type definitions
//
// Level 1 scope: liquid-phase properties needed by LLX.
// Two kinds of fluids:
//   1. LIBRARY fluids (water, NMP) — documented correlations/tables with exact
//      source citations and valid ranges.
//   2. PROJECT fluids (e.g. RRBO = Re-Refined Base Oil) — source-tagged,
//      user/engineer-entered properties. No default correlations are ever
//      invented for project fluids; composition varies by feedstock and
//      upstream processing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { EngineeringWarning } from '../cel/utilities';

export type PropertyId =
  | 'density'              // kg/m³
  | 'dynamicViscosity'     // Pa·s
  | 'kinematicViscosity'   // m²/s
  | 'specificHeat'         // J/(kg·K)
  | 'thermalConductivity'  // W/(m·K)
  | 'surfaceTension';      // N/m (vs air unless noted)

export const PROPERTY_UNITS: Record<PropertyId, string> = {
  density: 'kg/m3',
  dynamicViscosity: 'Pa.s',
  kinematicViscosity: 'm2/s',
  specificHeat: 'J/(kg.K)',
  thermalConductivity: 'W/(m.K)',
  surfaceTension: 'N/m',
};

/** Controlled source-type vocabulary — matches the existing workspace database. */
export type SourceType = 'Measured' | 'Vendor' | 'Literature' | 'Assumed';
export const SOURCE_TYPES: SourceType[] = ['Measured', 'Vendor', 'Literature', 'Assumed'];

/** Exact provenance record required for every library correlation. */
export interface SourceCitation {
  title: string;          // exact source title
  organization: string;   // organization / author
  year: number;           // publication or revision year
  notes?: string;
}

// ── Library-fluid correlation forms ──────────────────────────────────────────

/** Polynomial in temperature (°C): value = Σ coeffs[i] · T^i, then × scale. */
export interface PolynomialCorrelation {
  type: 'polynomial-C';
  coeffs: number[];   // ascending powers of T [°C]
  scale?: number;     // optional output multiplier (default 1)
}

/**
 * Vogel/Andrade viscosity form in ABSOLUTE temperature:
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
 * IAPWS surface-tension form: σ = B · τ^μ · (1 + b·τ),  τ = 1 − T[K]/Tc.
 */
export interface CriticalScalingSurfaceTension {
  type: 'critical-scaling-sigma';
  criticalTemperatureK: number;
  B: number;  // N/m
  mu: number; // exponent
  b: number;  // linear coefficient (signed)
}

/**
 * Source-tagged tabular data with linear interpolation in T [°C].
 * Used when no defensible fitted correlation is available (e.g. NMP until
 * exact vendor data are approved). Each point carries its own provenance.
 */
export interface TabularCorrelation {
  type: 'tabular-C';
  points: Array<{
    tC: number;
    value: number;              // in the property's SI unit (PROPERTY_UNITS)
    sourceType: SourceType;
    sourceReference: string;
  }>;
}

/**
 * Rational function in temperature (°C):
 *   value = (Σ num[i]·T^i) / (Σ den[i]·T^i)
 * (e.g. Kell 1975 water density).
 */
export interface RationalCorrelation {
  type: 'rational-C';
  num: number[]; // ascending powers of T [°C]
  den: number[]; // ascending powers of T [°C]
}

export type PropertyCorrelation =
  | PolynomialCorrelation
  | RationalCorrelation
  | AndradeViscosityCorrelation
  | CriticalScalingSurfaceTension
  | TabularCorrelation;

export interface PropertyEntry {
  correlation: PropertyCorrelation;
  /** Validated temperature range, °C. Outside → warning (extrapolation), not error. */
  validRangeC: { min: number; max: number };
  citation: SourceCitation;
  /** Units the underlying equation works in (documentation of the raw form). */
  equationUnits?: string;
  notes?: string;
}

export interface FluidDefinition {
  id: string;                 // e.g. 'water', 'nmp'
  name: string;
  casNumber?: string;
  properties: Partial<Record<PropertyId, PropertyEntry>>;
  notes?: string;
}

// ── Project-fluid framework (RRBO and similar) ────────────────────────────────

/**
 * One engineer-entered property value for a project fluid.
 * No default temperature correlations — a linear temperature coefficient may
 * be applied ONLY when explicitly provided (with its own provenance).
 */
export interface ProjectFluidProperty {
  value: number;                 // at referenceTemperatureC, in PROPERTY_UNITS unit
  unit: string;                  // must equal PROPERTY_UNITS[property] (validated)
  referenceTemperatureC: number;
  sourceType: SourceType;        // assumption status derives from this (Assumed)
  sourceReference: string;       // lab report no., vendor CoA, literature ref…
  /** Optional validated applicability range, °C. */
  validRangeC?: { min: number; max: number };
  /**
   * Optional explicit linear temperature correction:
   *   value(T) = value + slopePerC · (T − referenceTemperatureC)
   * Only used when supplied; must carry its own provenance.
   */
  temperatureCoefficient?: {
    slopePerC: number;           // property-unit per °C
    sourceType: SourceType;
    sourceReference: string;
  };
}

export interface ProjectFluidDefinition {
  id: string;                    // e.g. 'rrbo'
  name: string;                  // e.g. 'RRBO (Re-Refined Base Oil) — Project XYZ'
  isProjectFluid: true;
  properties: Partial<Record<PropertyId, ProjectFluidProperty>>;
  /** Interfacial tension vs another fluid id, N/m — engineer-entered, source-tagged. */
  interfacialTension?: Record<string, {
    value: number;
    referenceTemperatureC: number;
    sourceType: SourceType;
    sourceReference: string;
  }>;
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
