// ─────────────────────────────────────────────────────────────────────────────
// Drawing Unit Normalizer
// Converts extracted field values to base units before comparison.
// Base units: pressure→barg, temperature→°C, weight→kg, length→mm, volume→L
// ─────────────────────────────────────────────────────────────────────────────

export type NormalizedValue = {
  raw: string;
  numeric: number | null;
  unit: string | null;
  normalizedNumeric: number | null;
  normalizedUnit: string | null;
  parseOk: boolean;
};

// ── Pressure conversion to barg ───────────────────────────────────────────────
// Note: we treat bar ≈ barg for field comparison (gauge vs absolute negligible
// for the tolerances used in pressure vessel design comparisons).
const PRESSURE_TO_BARG: Record<string, number> = {
  barg: 1,
  bar:  1,
  bara: 1,
  psi:  1 / 14.5038,
  psig: 1 / 14.5038,
  psia: 1 / 14.5038,
  kpa:  1 / 100,
  mpa:  10.1972,
  'n/mm2': 10.1972,
  'n/mm²': 10.1972,
  atm:  1.01325,
  kgcm2: 0.980665,
  'kg/cm2': 0.980665,
  'kg/cm²': 0.980665,
};

// ── Temperature conversion to °C ─────────────────────────────────────────────
function toCelsius(value: number, unit: string): number {
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u === 'f' || u === '°f' || u === 'degf') return (value - 32) * 5 / 9;
  if (u === 'k' || u === 'kelvin') return value - 273.15;
  return value; // already °C
}

// ── Weight conversion to kg ───────────────────────────────────────────────────
const WEIGHT_TO_KG: Record<string, number> = {
  kg:  1,
  g:   0.001,
  lb:  0.453592,
  lbs: 0.453592,
  ton: 1000,
  mt:  1000,
  t:   1000,
  'metric ton': 1000,
};

// ── Length/thickness conversion to mm ─────────────────────────────────────────
const LENGTH_TO_MM: Record<string, number> = {
  mm:   1,
  cm:   10,
  m:    1000,
  inch: 25.4,
  in:   25.4,
  '"':  25.4,
  ft:   304.8,
};

// ── Volume conversion to litres ───────────────────────────────────────────────
const VOLUME_TO_L: Record<string, number> = {
  l:   1,
  lt:  1,
  ltr: 1,
  m3:  1000,
  'm³': 1000,
  litre:  1,
  litres: 1,
  liter:  1,
  liters: 1,
};

// ── Parse "15.5 barg" or "15.5" or "15.5barg" ────────────────────────────────
const VALUE_PATTERN = /^([+-]?\d+(?:[.,]\d+)?)\s*([a-z°²³"'/]*)?$/i;

function parseRaw(raw: string): { numeric: number | null; unit: string | null } {
  const s = raw.trim().replace(',', '.').replace(/\s+/g, ' ');
  const m = s.match(VALUE_PATTERN);
  if (!m) return { numeric: null, unit: null };
  return {
    numeric: parseFloat(m[1]),
    unit: (m[2] || '').toLowerCase().trim() || null,
  };
}

type Domain = 'pressure' | 'temperature' | 'weight' | 'length' | 'volume' | 'unknown';

function detectDomain(unit: string | null): Domain {
  if (!unit) return 'unknown';
  const u = unit.toLowerCase();
  if (Object.keys(PRESSURE_TO_BARG).includes(u)) return 'pressure';
  if (['°c', 'c', 'degc', '°f', 'f', 'degf', 'k', 'kelvin'].includes(u)) return 'temperature';
  if (Object.keys(WEIGHT_TO_KG).includes(u)) return 'weight';
  if (Object.keys(LENGTH_TO_MM).includes(u)) return 'length';
  if (Object.keys(VOLUME_TO_L).includes(u)) return 'volume';
  return 'unknown';
}

export function normalizeValue(raw: string | number | null | undefined): NormalizedValue {
  // GPT-4o Vision may return numeric values as numbers rather than strings
  const rawStr = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!rawStr) {
    return { raw: '', numeric: null, unit: null, normalizedNumeric: null, normalizedUnit: null, parseOk: false };
  }

  const { numeric, unit } = parseRaw(rawStr);

  if (numeric === null) {
    return { raw: rawStr, numeric: null, unit, normalizedNumeric: null, normalizedUnit: null, parseOk: false };
  }

  const domain = detectDomain(unit);
  let normalizedNumeric: number | null = null;
  let normalizedUnit: string | null = null;

  switch (domain) {
    case 'pressure': {
      const factor = PRESSURE_TO_BARG[unit?.toLowerCase() ?? ''] ?? null;
      if (factor !== null) { normalizedNumeric = numeric * factor; normalizedUnit = 'barg'; }
      break;
    }
    case 'temperature': {
      normalizedNumeric = toCelsius(numeric, unit ?? '°C');
      normalizedUnit = '°C';
      break;
    }
    case 'weight': {
      const factor = WEIGHT_TO_KG[unit?.toLowerCase() ?? ''] ?? null;
      if (factor !== null) { normalizedNumeric = numeric * factor; normalizedUnit = 'kg'; }
      break;
    }
    case 'length': {
      const factor = LENGTH_TO_MM[unit?.toLowerCase() ?? ''] ?? null;
      if (factor !== null) { normalizedNumeric = numeric * factor; normalizedUnit = 'mm'; }
      break;
    }
    case 'volume': {
      const factor = VOLUME_TO_L[unit?.toLowerCase() ?? ''] ?? null;
      if (factor !== null) { normalizedNumeric = numeric * factor; normalizedUnit = 'L'; }
      break;
    }
    default:
      normalizedNumeric = numeric;
      normalizedUnit = unit;
  }

  return { raw, numeric, unit, normalizedNumeric, normalizedUnit, parseOk: true };
}

// ── Numeric comparison with tolerance ─────────────────────────────────────────
// tolerancePct: e.g. 2 = ±2%

/** Full detail — includes normalized values and percent diff. */
export function compareNumericDetail(
  a: string | null | undefined,
  b: string | null | undefined,
  tolerancePct = 2,
): { match: boolean | null; percentDiff: number | null; normalizedA: NormalizedValue; normalizedB: NormalizedValue } {
  const na = normalizeValue(a ?? null);
  const nb = normalizeValue(b ?? null);

  if (!na.parseOk || !nb.parseOk) {
    return { match: null, percentDiff: null, normalizedA: na, normalizedB: nb };
  }

  const va = na.normalizedNumeric ?? na.numeric!;
  const vb = nb.normalizedNumeric ?? nb.numeric!;

  if (vb === 0) {
    const match = va === 0;
    return { match, percentDiff: match ? 0 : null, normalizedA: na, normalizedB: nb };
  }

  const percentDiff = Math.abs((va - vb) / vb) * 100;
  return { match: percentDiff <= tolerancePct, percentDiff, normalizedA: na, normalizedB: nb };
}

/**
 * Simple comparison expected by dds-comparison-engine.ts.
 * Returns: true (match) | false (mismatch) | null (low confidence / unparseable)
 */
export function compareNumeric(
  a: string | null | undefined,
  b: string | null | undefined,
  tolerancePct = 2,
): boolean | null {
  return compareNumericDetail(a, b, tolerancePct).match;
}

// ── String comparison (normalised) ────────────────────────────────────────────
export function compareString(a: string | number | null | undefined, b: string | number | null | undefined): boolean | null {
  if (a == null || b == null) return null;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}
