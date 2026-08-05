// ═══════════════════════════════════════════════════════════════════════════════
// EPD — property database registry and evaluator
//
// getProperty(fluidId, property, temperatureC) → PropertyResult
//  - Unknown fluid/property → EngineeringInputError (no silent failure)
//  - Temperature outside validated range → warning (extrapolation), not error
// ═══════════════════════════════════════════════════════════════════════════════

import { EngineeringInputError, EngineeringWarning, assertFinite } from '../cel/utilities';
import type {
  FluidDefinition, PropertyCorrelation, PropertyId, PropertyResult,
} from './types';
import { PROPERTY_UNITS } from './types';
import { water } from './fluids/water';
import { nmp } from './fluids/nmp';
import { rrbo } from './fluids/rrbo';

const registry = new Map<string, FluidDefinition>();

/** Register a fluid (extension point for future fluids). */
export function registerFluid(fluid: FluidDefinition): void {
  if (registry.has(fluid.id)) {
    throw new EngineeringInputError(`Fluid '${fluid.id}' is already registered.`);
  }
  registry.set(fluid.id, fluid);
}

registerFluid(water);
registerFluid(nmp);
registerFluid(rrbo);

export function listFluids(): Array<{ id: string; name: string; properties: PropertyId[] }> {
  return Array.from(registry.values()).map((f) => ({
    id: f.id,
    name: f.name,
    properties: Object.keys(f.properties) as PropertyId[],
  }));
}

export function getFluid(fluidId: string): FluidDefinition {
  const f = registry.get(fluidId);
  if (!f) {
    throw new EngineeringInputError(
      `Unknown fluid '${fluidId}'. Available: ${Array.from(registry.keys()).join(', ')}.`,
    );
  }
  return f;
}

function evaluateCorrelation(corr: PropertyCorrelation, tC: number): number {
  switch (corr.type) {
    case 'polynomial-C': {
      let v = 0;
      for (let i = corr.coeffs.length - 1; i >= 0; i--) v = v * tC + corr.coeffs[i];
      return v * (corr.scale ?? 1);
    }
    case 'andrade-viscosity': {
      const tK = tC + 273.15;
      const denom = tK - (corr.C ?? 0);
      if (denom <= 0) {
        throw new EngineeringInputError(
          `Viscosity correlation undefined at ${tC} °C (T_K − C = ${denom} ≤ 0).`,
        );
      }
      const muMPaS = Math.exp(corr.A + corr.B / denom);
      return muMPaS * 1e-3; // mPa·s → Pa·s
    }
    case 'critical-scaling-sigma': {
      const tK = tC + 273.15;
      const tau = (corr.criticalTemperatureK - tK) / corr.criticalTemperatureK;
      if (tau <= 0) {
        throw new EngineeringInputError(
          `Surface tension undefined at ${tC} °C — at/above critical temperature.`,
        );
      }
      return corr.s0 * Math.pow(tau, corr.n) * (1 - corr.m * tau);
    }
  }
}

/**
 * Evaluate a fluid property at temperature (°C).
 * Extrapolation outside the validated range produces a warning, never a
 * silent wrong answer or a hard stop.
 */
export function getProperty(fluidId: string, property: PropertyId, temperatureC: number): PropertyResult {
  assertFinite(temperatureC, 'temperatureC');
  const fluid = getFluid(fluidId);
  const entry = fluid.properties[property];
  if (!entry) {
    throw new EngineeringInputError(
      `Fluid '${fluidId}' has no '${property}' data. Available: ${Object.keys(fluid.properties).join(', ')}.`,
    );
  }
  const warnings: EngineeringWarning[] = [];
  const { min, max } = entry.validRangeC;
  if (temperatureC < min || temperatureC > max) {
    warnings.push({
      code: 'EPD_TEMPERATURE_EXTRAPOLATION',
      message: `${fluid.name} ${property} requested at ${temperatureC} °C — outside validated range [${min}, ${max}] °C. Result is an extrapolation.`,
    });
  }
  if (entry.source.includes('REQUIRES THERMOPAC VALIDATION')) {
    warnings.push({
      code: 'EPD_UNVALIDATED_DATA',
      message: `${fluid.name} ${property}: representative literature data — requires Thermopac validation before release-grade use.`,
    });
  }
  const value = evaluateCorrelation(entry.correlation, temperatureC);
  if (!Number.isFinite(value)) {
    throw new EngineeringInputError(
      `${fluid.name} ${property} correlation returned a non-finite value at ${temperatureC} °C.`,
    );
  }
  return {
    value,
    unit: PROPERTY_UNITS[property],
    fluidId,
    property,
    temperatureC,
    source: entry.source,
    warnings,
  };
}

/**
 * Interfacial tension between two registered fluids, N/m (≈25 °C values).
 * Order-independent lookup; throws if the pair is not defined.
 */
export function getInterfacialTension(fluidA: string, fluidB: string): { value: number; unit: string; source: string; warnings: EngineeringWarning[] } {
  const a = getFluid(fluidA);
  const b = getFluid(fluidB);
  const entry = a.interfacialTension?.[fluidB] ?? b.interfacialTension?.[fluidA];
  if (!entry) {
    throw new EngineeringInputError(
      `No interfacial tension data for the pair '${fluidA}' / '${fluidB}'.`,
    );
  }
  const warnings: EngineeringWarning[] = [];
  if (entry.source.includes('REQUIRES THERMOPAC VALIDATION')) {
    warnings.push({
      code: 'EPD_UNVALIDATED_DATA',
      message: `Interfacial tension ${fluidA}/${fluidB}: representative data — requires Thermopac validation.`,
    });
  }
  return { value: entry.value, unit: 'N/m', source: entry.source, warnings };
}
