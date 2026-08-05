// ═══════════════════════════════════════════════════════════════════════════════
// EPD — property database registry and evaluator
//
// Library fluids: water, NMP (documented correlations / source-tagged tables).
// Project fluids: registered at runtime with engineer-entered, source-tagged
// values (e.g. RRBO = Re-Refined Base Oil). No default correlations are ever
// invented for project fluids.
//
// Rules:
//  - Unknown fluid/property → EngineeringInputError (no silent failure)
//  - Temperature outside validated range → warning (extrapolation), not error
//  - Physically impossible results (T < −273.15 °C, property ≤ 0) → error
//  - sourceType = 'Assumed' anywhere → EPD_ASSUMED_VALUE warning
// ═══════════════════════════════════════════════════════════════════════════════

import { EngineeringInputError, EngineeringWarning, assertFinite } from '../cel/utilities';
import { linearInterpolate } from '../cel/numerical';
import type {
  FluidDefinition, ProjectFluidDefinition, ProjectFluidProperty,
  PropertyCorrelation, PropertyId, PropertyResult, SourceType,
} from './types';
import { PROPERTY_UNITS, SOURCE_TYPES } from './types';
import { water } from './fluids/water';
import { nmp } from './fluids/nmp';

const ABSOLUTE_ZERO_C = -273.15;

/** Properties that must be strictly positive to be physically meaningful. */
const MUST_BE_POSITIVE: ReadonlySet<PropertyId> = new Set<PropertyId>([
  'density', 'dynamicViscosity', 'kinematicViscosity',
  'specificHeat', 'thermalConductivity', 'surfaceTension',
]);

const libraryRegistry = new Map<string, FluidDefinition>();
const projectRegistry = new Map<string, ProjectFluidDefinition>();

/** Register a library fluid (extension point for future documented fluids). */
export function registerFluid(fluid: FluidDefinition): void {
  if (libraryRegistry.has(fluid.id) || projectRegistry.has(fluid.id)) {
    throw new EngineeringInputError(`Fluid '${fluid.id}' is already registered.`);
  }
  libraryRegistry.set(fluid.id, fluid);
}

/**
 * Register (or replace) a project fluid — engineer-entered, source-tagged.
 * Replacement is allowed because project-fluid data is revision-controlled
 * upstream in the design workspace.
 */
export function registerProjectFluid(fluid: ProjectFluidDefinition): void {
  if (libraryRegistry.has(fluid.id)) {
    throw new EngineeringInputError(`'${fluid.id}' is a library fluid and cannot be redefined as a project fluid.`);
  }
  // Validate every entered property up front — fail loudly at registration.
  for (const [prop, entry] of Object.entries(fluid.properties) as Array<[PropertyId, ProjectFluidProperty]>) {
    validateProjectProperty(fluid.id, prop, entry);
  }
  projectRegistry.set(fluid.id, fluid);
}

export function unregisterProjectFluid(fluidId: string): void {
  projectRegistry.delete(fluidId);
}

function validateProjectProperty(fluidId: string, prop: PropertyId, e: ProjectFluidProperty): void {
  assertFinite(e.value, `${fluidId}.${prop}.value`);
  assertFinite(e.referenceTemperatureC, `${fluidId}.${prop}.referenceTemperatureC`);
  if (e.referenceTemperatureC < ABSOLUTE_ZERO_C) {
    throw new EngineeringInputError(`${fluidId}.${prop}: reference temperature below absolute zero.`);
  }
  const expectedUnit = PROPERTY_UNITS[prop];
  if (e.unit !== expectedUnit) {
    throw new EngineeringInputError(
      `${fluidId}.${prop}: unit must be '${expectedUnit}' (got '${e.unit}'). Convert before registering (CEL convertUnits).`,
    );
  }
  if (!SOURCE_TYPES.includes(e.sourceType)) {
    throw new EngineeringInputError(
      `${fluidId}.${prop}: sourceType must be one of ${SOURCE_TYPES.join(', ')} (got '${e.sourceType}').`,
    );
  }
  if (!e.sourceReference || !e.sourceReference.trim()) {
    throw new EngineeringInputError(`${fluidId}.${prop}: sourceReference is mandatory.`);
  }
  if (MUST_BE_POSITIVE.has(prop) && e.value <= 0) {
    throw new EngineeringInputError(`${fluidId}.${prop}: value must be > 0 (got ${e.value}).`);
  }
  if (e.temperatureCoefficient) {
    assertFinite(e.temperatureCoefficient.slopePerC, `${fluidId}.${prop}.temperatureCoefficient.slopePerC`);
    if (!SOURCE_TYPES.includes(e.temperatureCoefficient.sourceType)) {
      throw new EngineeringInputError(`${fluidId}.${prop}: temperatureCoefficient.sourceType invalid.`);
    }
    if (!e.temperatureCoefficient.sourceReference?.trim()) {
      throw new EngineeringInputError(`${fluidId}.${prop}: temperatureCoefficient.sourceReference is mandatory.`);
    }
  }
}

registerFluid(water);
registerFluid(nmp);

export function listFluids(): Array<{ id: string; name: string; kind: 'library' | 'project'; properties: PropertyId[] }> {
  return [
    ...Array.from(libraryRegistry.values()).map((f) => ({
      id: f.id, name: f.name, kind: 'library' as const, properties: Object.keys(f.properties) as PropertyId[],
    })),
    ...Array.from(projectRegistry.values()).map((f) => ({
      id: f.id, name: f.name, kind: 'project' as const, properties: Object.keys(f.properties) as PropertyId[],
    })),
  ];
}

export function getFluid(fluidId: string): FluidDefinition | ProjectFluidDefinition {
  const f = libraryRegistry.get(fluidId) ?? projectRegistry.get(fluidId);
  if (!f) {
    const available = Array.from(libraryRegistry.keys()).concat(Array.from(projectRegistry.keys())).join(', ');
    throw new EngineeringInputError(`Unknown fluid '${fluidId}'. Available: ${available}.`);
  }
  return f;
}

function evaluateCorrelation(
  corr: PropertyCorrelation,
  tC: number,
  warnings: EngineeringWarning[],
): number {
  switch (corr.type) {
    case 'polynomial-C': {
      let v = 0;
      for (let i = corr.coeffs.length - 1; i >= 0; i--) v = v * tC + corr.coeffs[i];
      return v * (corr.scale ?? 1);
    }
    case 'rational-C': {
      let num = 0, den = 0;
      for (let i = corr.num.length - 1; i >= 0; i--) num = num * tC + corr.num[i];
      for (let i = corr.den.length - 1; i >= 0; i--) den = den * tC + corr.den[i];
      if (den === 0) throw new EngineeringInputError(`Rational correlation denominator is zero at ${tC} °C.`);
      return num / den;
    }
    case 'andrade-viscosity': {
      const tK = tC + 273.15;
      const denom = tK - (corr.C ?? 0);
      if (denom <= 0) {
        throw new EngineeringInputError(`Viscosity correlation undefined at ${tC} °C (T_K − C = ${denom} ≤ 0).`);
      }
      const muMPaS = Math.exp(corr.A + corr.B / denom);
      return muMPaS * 1e-3; // mPa·s → Pa·s
    }
    case 'critical-scaling-sigma': {
      const tK = tC + 273.15;
      const tau = 1 - tK / corr.criticalTemperatureK;
      if (tau <= 0) {
        throw new EngineeringInputError(`Surface tension undefined at ${tC} °C — at/above critical temperature.`);
      }
      return corr.B * Math.pow(tau, corr.mu) * (1 + corr.b * tau);
    }
    case 'tabular-C': {
      const pts = [...corr.points].sort((a, b) => a.tC - b.tC);
      for (const p of pts) {
        if (p.sourceType === 'Assumed') {
          warnings.push({
            code: 'EPD_ASSUMED_VALUE',
            message: `Tabular point at ${p.tC} °C is ASSUMED (${p.sourceReference}) — replace with measured/vendor data before release-grade use.`,
          });
        }
      }
      return linearInterpolate(pts.map((p) => p.tC), pts.map((p) => p.value), tC, true);
    }
  }
}

/**
 * Evaluate a fluid property at temperature (°C).
 * Extrapolation outside the validated range warns; physically impossible
 * inputs/outputs throw. Assumed data always warns.
 */
export function getProperty(fluidId: string, property: PropertyId, temperatureC: number): PropertyResult {
  assertFinite(temperatureC, 'temperatureC');
  if (temperatureC < ABSOLUTE_ZERO_C) {
    throw new EngineeringInputError(`Temperature ${temperatureC} °C is below absolute zero.`);
  }
  const fluid = getFluid(fluidId);
  const warnings: EngineeringWarning[] = [];
  let value: number;
  let source: string;

  if ('isProjectFluid' in fluid) {
    const entry = fluid.properties[property];
    if (!entry) {
      throw new EngineeringInputError(
        `Project fluid '${fluidId}' has no engineer-entered '${property}'. Entered: ${Object.keys(fluid.properties).join(', ') || 'none'}.`,
      );
    }
    source = `${entry.sourceType}: ${entry.sourceReference}`;
    if (entry.sourceType === 'Assumed') {
      warnings.push({
        code: 'EPD_ASSUMED_VALUE',
        message: `${fluid.name} ${property} is ASSUMED (${entry.sourceReference}) — acknowledge before design release.`,
      });
    }
    if (entry.temperatureCoefficient) {
      value = entry.value + entry.temperatureCoefficient.slopePerC * (temperatureC - entry.referenceTemperatureC);
      if (entry.temperatureCoefficient.sourceType === 'Assumed') {
        warnings.push({
          code: 'EPD_ASSUMED_VALUE',
          message: `${fluid.name} ${property} temperature coefficient is ASSUMED (${entry.temperatureCoefficient.sourceReference}).`,
        });
      }
    } else {
      value = entry.value;
      if (Math.abs(temperatureC - entry.referenceTemperatureC) > 1) {
        warnings.push({
          code: 'EPD_NO_TEMPERATURE_CORRECTION',
          message: `${fluid.name} ${property} entered at ${entry.referenceTemperatureC} °C is used unchanged at ${temperatureC} °C — no validated temperature coefficient was provided.`,
        });
      }
    }
    if (entry.validRangeC && (temperatureC < entry.validRangeC.min || temperatureC > entry.validRangeC.max)) {
      warnings.push({
        code: 'EPD_TEMPERATURE_EXTRAPOLATION',
        message: `${fluid.name} ${property} requested at ${temperatureC} °C — outside stated valid range [${entry.validRangeC.min}, ${entry.validRangeC.max}] °C.`,
      });
    }
  } else {
    const entry = fluid.properties[property];
    if (!entry) {
      throw new EngineeringInputError(
        `Fluid '${fluidId}' has no '${property}' data. Available: ${Object.keys(fluid.properties).join(', ')}.`,
      );
    }
    source = `${entry.citation.title} — ${entry.citation.organization} (${entry.citation.year})`;
    const { min, max } = entry.validRangeC;
    if (temperatureC < min || temperatureC > max) {
      warnings.push({
        code: 'EPD_TEMPERATURE_EXTRAPOLATION',
        message: `${fluid.name} ${property} requested at ${temperatureC} °C — outside validated range [${min}, ${max}] °C. Result is an extrapolation.`,
      });
    }
    value = evaluateCorrelation(entry.correlation, temperatureC, warnings);
  }

  if (!Number.isFinite(value)) {
    throw new EngineeringInputError(`${fluid.name} ${property} evaluation returned a non-finite value at ${temperatureC} °C.`);
  }
  if (MUST_BE_POSITIVE.has(property) && value <= 0) {
    throw new EngineeringInputError(
      `${fluid.name} ${property} evaluated to ${value} at ${temperatureC} °C — physically impossible (must be > 0). The requested temperature is outside any defensible use of the stored data.`,
    );
  }

  return { value, unit: PROPERTY_UNITS[property], fluidId, property, temperatureC, source, warnings };
}

/**
 * True if any warning indicates Assumed/provisional data.
 * Design-validation checks (workspace Step 12) MUST treat results carrying
 * assumed data as NOT satisfying mandatory validation — a design using them
 * cannot be marked fully validated until the data is replaced/acknowledged.
 */
export function containsAssumedData(warnings: EngineeringWarning[]): boolean {
  return warnings.some((w) => w.code === 'EPD_ASSUMED_VALUE');
}

/**
 * Interfacial tension between a PROJECT fluid and another fluid, N/m —
 * engineer-entered and source-tagged only. No library defaults exist.
 */
export function getInterfacialTension(fluidA: string, fluidB: string): {
  value: number; unit: string; source: string; warnings: EngineeringWarning[];
} {
  const a = getFluid(fluidA);
  const b = getFluid(fluidB);
  const entryA = 'isProjectFluid' in a ? a.interfacialTension?.[fluidB] : undefined;
  const entryB = 'isProjectFluid' in b ? b.interfacialTension?.[fluidA] : undefined;
  const entry = entryA ?? entryB;
  if (!entry) {
    throw new EngineeringInputError(
      `No engineer-entered interfacial tension for the pair '${fluidA}' / '${fluidB}'. Enter a source-tagged value on the project fluid.`,
    );
  }
  if (entry.value <= 0) {
    throw new EngineeringInputError(`Interfacial tension for '${fluidA}'/'${fluidB}' must be > 0 (got ${entry.value}).`);
  }
  const warnings: EngineeringWarning[] = [];
  if (entry.sourceType === 'Assumed') {
    warnings.push({
      code: 'EPD_ASSUMED_VALUE',
      message: `Interfacial tension ${fluidA}/${fluidB} is ASSUMED (${entry.sourceReference}) — acknowledge before design release.`,
    });
  }
  return {
    value: entry.value,
    unit: 'N/m',
    source: `${entry.sourceType}: ${entry.sourceReference} (at ${entry.referenceTemperatureC} °C)`,
    warnings,
  };
}
