// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Engineering Utilities (Level 1: LLX scope)
//
// Validation helpers, significant figures, engineering notation.
// Every CEL function uses these guards — no calculation silently fails.
// ═══════════════════════════════════════════════════════════════════════════════

/** Thrown when an input is physically or numerically invalid. */
export class EngineeringInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineeringInputError';
  }
}

/** Structured warning attached to calculation results (never thrown). */
export interface EngineeringWarning {
  code: string;
  message: string;
}

/** Result wrapper for functions that can produce engineering warnings. */
export interface CalcResult<T = number> {
  value: T;
  warnings: EngineeringWarning[];
}

// ── Validation guards ─────────────────────────────────────────────────────────

/** Assert a value is a finite number. */
export function assertFinite(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineeringInputError(`${name} must be a finite number (got ${value}).`);
  }
}

/** Assert a value is finite and strictly positive. */
export function assertPositive(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) {
    throw new EngineeringInputError(`${name} must be > 0 (got ${value}).`);
  }
}

/** Assert a value is finite and non-negative. */
export function assertNonNegative(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0) {
    throw new EngineeringInputError(`${name} must be >= 0 (got ${value}).`);
  }
}

/** Assert a value lies within [min, max]. */
export function assertInRange(value: number, min: number, max: number, name: string): void {
  assertFinite(value, name);
  if (value < min || value > max) {
    throw new EngineeringInputError(`${name} must be within [${min}, ${max}] (got ${value}).`);
  }
}

/**
 * Range check that WARNS instead of throwing — used for correlation validity
 * ranges where extrapolation is engineering judgement, not a hard error.
 */
export function warnIfOutsideRange(
  value: number,
  min: number,
  max: number,
  name: string,
  warnings: EngineeringWarning[],
  code = 'RANGE_EXTRAPOLATION',
): void {
  if (value < min || value > max) {
    warnings.push({
      code,
      message: `${name} = ${formatEngineering(value)} is outside the validated range [${min}, ${max}]. Result is an extrapolation — verify against plant data.`,
    });
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Round to N significant figures (default 4 — engineering convention). */
export function roundSig(value: number, sigFigs = 4): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, sigFigs - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

/**
 * Format a number in engineering notation (exponent multiple of 3) or plain
 * fixed notation when within a readable magnitude window.
 */
export function formatEngineering(value: number, sigFigs = 4): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 0.01 && abs < 100000) {
    return String(roundSig(value, sigFigs));
  }
  const exp3 = Math.floor(Math.log10(abs) / 3) * 3;
  const mantissa = value / Math.pow(10, exp3);
  return `${roundSig(mantissa, sigFigs)}e${exp3 >= 0 ? '+' : ''}${exp3}`;
}

/** Format a value with its unit, e.g. "1.234 m/s". */
export function formatWithUnit(value: number, unit: string, sigFigs = 4): string {
  return `${formatEngineering(value, sigFigs)} ${unit}`;
}

// ── Physical constants ────────────────────────────────────────────────────────

/** Standard gravitational acceleration, m/s². */
export const GRAVITY = 9.80665;

/** Universal gas constant, J/(mol·K). */
export const GAS_CONSTANT = 8.314462618;
