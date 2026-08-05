// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Unit Conversion (Level 1: LLX scope)
//
// Factor-table conversion through SI base units. Temperature handled as a
// special case (offset + scale). Dimensionally incompatible conversions throw.
// ═══════════════════════════════════════════════════════════════════════════════

import { EngineeringInputError, assertFinite } from './utilities';

type FactorMap = Record<string, number>; // multiply by factor → SI base unit

// SI base per category noted in comment
const CATEGORIES: Record<string, FactorMap> = {
  // base: metre
  length: { m: 1, mm: 1e-3, cm: 1e-2, km: 1e3, in: 0.0254, ft: 0.3048, yd: 0.9144 },
  // base: m²
  area: { 'm2': 1, 'mm2': 1e-6, 'cm2': 1e-4, 'ft2': 0.09290304, 'in2': 6.4516e-4 },
  // base: m³
  volume: { 'm3': 1, L: 1e-3, l: 1e-3, mL: 1e-6, 'cm3': 1e-6, 'ft3': 0.028316846592, gal: 3.785411784e-3, 'in3': 1.6387064e-5 },
  // base: kg
  mass: { kg: 1, g: 1e-3, mg: 1e-6, t: 1e3, tonne: 1e3, lb: 0.45359237, oz: 0.028349523125 },
  // base: kg/m³
  density: { 'kg/m3': 1, 'g/cm3': 1e3, 'g/mL': 1e3, 'g/L': 1, 'lb/ft3': 16.018463373960142 },
  // base: Pa
  pressure: { Pa: 1, kPa: 1e3, MPa: 1e6, bar: 1e5, bara: 1e5, mbar: 1e2, atm: 101325, mmHg: 133.322387415, torr: 133.322368421, psi: 6894.757293168, 'kg/cm2': 98066.5 },
  // base: m³/s
  volumetricFlow: { 'm3/s': 1, 'm3/h': 1 / 3600, 'm3/hr': 1 / 3600, 'L/s': 1e-3, 'L/min': 1e-3 / 60, 'L/h': 1e-3 / 3600, LPH: 1e-3 / 3600, lph: 1e-3 / 3600, LPM: 1e-3 / 60, GPM: 6.30901964e-5, 'ft3/h': 0.028316846592 / 3600 },
  // base: kg/s
  massFlow: { 'kg/s': 1, 'kg/h': 1 / 3600, 'kg/hr': 1 / 3600, 't/h': 1000 / 3600, TPH: 1000 / 3600, 'lb/h': 0.45359237 / 3600 },
  // base: Pa·s
  dynamicViscosity: { 'Pa.s': 1, 'Pa·s': 1, 'mPa.s': 1e-3, 'mPa·s': 1e-3, cP: 1e-3, P: 0.1, poise: 0.1 },
  // base: m²/s
  kinematicViscosity: { 'm2/s': 1, cSt: 1e-6, St: 1e-4 },
  // base: N/m
  surfaceTension: { 'N/m': 1, 'mN/m': 1e-3, 'dyn/cm': 1e-3 },
  // base: m/s
  velocity: { 'm/s': 1, 'm/h': 1 / 3600, 'mm/s': 1e-3, 'cm/s': 1e-2, 'ft/s': 0.3048, 'ft/min': 0.3048 / 60 },
  // base: J
  energy: { J: 1, kJ: 1e3, MJ: 1e6, Wh: 3600, kWh: 3.6e6, cal: 4.184, kcal: 4184, BTU: 1055.05585262 },
  // base: W
  power: { W: 1, kW: 1e3, MW: 1e6, hp: 745.699871582, 'kcal/h': 4184 / 3600, 'BTU/h': 1055.05585262 / 3600 },
};

/** Find which category a unit belongs to. Returns null if unknown. */
function findCategory(unit: string): string | null {
  for (const [cat, map] of Object.entries(CATEGORIES)) {
    if (unit in map) return cat;
  }
  return null;
}

/**
 * Convert a value between compatible engineering units.
 * Temperature units (C, K, F) are handled with offset arithmetic.
 * @throws EngineeringInputError for unknown units or incompatible categories.
 */
export function convertUnits(value: number, fromUnit: string, toUnit: string): number {
  assertFinite(value, 'value');
  if (fromUnit === toUnit) return value;

  // ── Temperature special case ──
  const tempUnits = ['C', 'K', 'F', '°C', '°F', 'degC', 'degF'];
  const normTemp = (u: string) => u.replace('°', '').replace('deg', '');
  if (tempUnits.includes(fromUnit) || tempUnits.includes(toUnit)) {
    const f = normTemp(fromUnit); const t = normTemp(toUnit);
    if (!['C', 'K', 'F'].includes(f) || !['C', 'K', 'F'].includes(t)) {
      throw new EngineeringInputError(`Cannot convert between '${fromUnit}' and '${toUnit}' — one is a temperature unit, the other is not.`);
    }
    // to Kelvin
    let kelvin: number;
    if (f === 'C') kelvin = value + 273.15;
    else if (f === 'F') kelvin = (value - 32) / 1.8 + 273.15;
    else kelvin = value;
    if (kelvin < 0) throw new EngineeringInputError(`Temperature ${value} ${fromUnit} is below absolute zero.`);
    // from Kelvin
    if (t === 'C') return kelvin - 273.15;
    if (t === 'F') return (kelvin - 273.15) * 1.8 + 32;
    return kelvin;
  }

  const fromCat = findCategory(fromUnit);
  const toCat = findCategory(toUnit);
  if (!fromCat) throw new EngineeringInputError(`Unknown unit '${fromUnit}'.`);
  if (!toCat) throw new EngineeringInputError(`Unknown unit '${toUnit}'.`);
  if (fromCat !== toCat) {
    throw new EngineeringInputError(
      `Incompatible units: '${fromUnit}' is ${fromCat}, '${toUnit}' is ${toCat}.`,
    );
  }
  const factors = CATEGORIES[fromCat];
  return (value * factors[fromUnit]) / factors[toUnit];
}

/** List all supported units grouped by category (for UI dropdowns). */
export function listSupportedUnits(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [cat, map] of Object.entries(CATEGORIES)) out[cat] = Object.keys(map);
  out.temperature = ['C', 'K', 'F'];
  return out;
}
