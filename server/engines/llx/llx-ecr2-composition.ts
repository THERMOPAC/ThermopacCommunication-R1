// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Compartment Composition Validation
//
// Validates per-compartment mole-fraction vectors for the five-component
// pseudo-system: [Sat, Mono, Di, Poly, NMP] (indices 0–4).
//
// Governance rules:
//   · Sum must equal 1 within COMPOSITION_TOLERANCE (1e-6)
//   · Each component must lie in [0, 1]
//   · SILENT NORMALIZATION IS PROHIBITED — materially invalid compositions
//     are rejected with an explicit error, not silently corrected.
//   · NMP (index 4) is included in the balance; it transfers as the solvent.
// ═══════════════════════════════════════════════════════════════════════════

export const COMPONENT_NAMES = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;
export type ComponentName = typeof COMPONENT_NAMES[number];

/** Mole-fraction tolerance for Σx_i = 1 check. */
export const COMPOSITION_TOLERANCE = 1e-6;

/** N components in the ECR-2 pseudo-system. */
export const N_COMPONENTS = 5;

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompositionViolation {
  /** Component index (0–4) or -1 for sum violation. */
  index: number;
  /** Component name or 'sum'. */
  name: string;
  /** Description of the violation. */
  message: string;
}

export interface CompositionValidationResult {
  valid: boolean;
  /** Actual mole-fraction sum. */
  sum: number;
  /** Individual component values that were checked. */
  values: number[];
  violations: CompositionViolation[];
  /** Human-readable status. */
  message: string;
  /** Label supplied by caller (e.g. 'x_local at compartment 5'). */
  label: string;
}

// ── Validation function ────────────────────────────────────────────────────

/**
 * Validate a 5-component mole-fraction vector.
 *
 * Returns a result object; does NOT throw. Does NOT normalize.
 *
 * @param x     Five-element mole-fraction array [Sat, Mono, Di, Poly, NMP].
 * @param label Caller-supplied context label for error messages.
 */
export function validateComposition(
  x: readonly number[],
  label: string,
): CompositionValidationResult {
  const violations: CompositionViolation[] = [];
  const values = Array.from(x);

  // 1. Length check
  if (values.length !== N_COMPONENTS) {
    return {
      valid: false,
      sum: values.reduce((a, b) => a + b, 0),
      values,
      violations: [
        {
          index: -1,
          name: 'length',
          message:
            `Expected ${N_COMPONENTS} components [Sat, Mono, Di, Poly, NMP], ` +
            `got ${values.length}.`,
        },
      ],
      message: `${label}: invalid composition — wrong length (${values.length} ≠ ${N_COMPONENTS}).`,
      label,
    };
  }

  // 2. Individual bounds: 0 ≤ x_i ≤ 1
  for (let i = 0; i < N_COMPONENTS; i++) {
    const xi = values[i];
    if (!Number.isFinite(xi)) {
      violations.push({
        index: i,
        name: COMPONENT_NAMES[i],
        message: `x[${i}] (${COMPONENT_NAMES[i]}) = ${xi} — non-finite value.`,
      });
    } else if (xi < 0) {
      violations.push({
        index: i,
        name: COMPONENT_NAMES[i],
        message: `x[${i}] (${COMPONENT_NAMES[i]}) = ${xi.toExponential(4)} < 0 — physically impossible.`,
      });
    } else if (xi > 1) {
      violations.push({
        index: i,
        name: COMPONENT_NAMES[i],
        message: `x[${i}] (${COMPONENT_NAMES[i]}) = ${xi.toFixed(6)} > 1 — physically impossible.`,
      });
    }
  }

  // 3. Sum check (computed even when individual values fail — informative)
  const sum = values.reduce((a, b) => a + b, 0);
  const sumErr = Math.abs(sum - 1.0);
  if (sumErr > COMPOSITION_TOLERANCE) {
    violations.push({
      index: -1,
      name: 'sum',
      message:
        `Σx_i = ${sum.toFixed(12)} — deviates from 1 by ${sumErr.toExponential(4)} ` +
        `(tolerance = ${COMPOSITION_TOLERANCE.toExponential(0)}). ` +
        `Silent normalization is PROHIBITED — correct the input.`,
    });
  }

  const valid = violations.length === 0;
  const message = valid
    ? `${label}: valid — Σx = ${sum.toFixed(10)}, all components in [0, 1].`
    : `${label}: invalid — ${violations.length} violation(s): ${violations.map((v) => v.message).join('; ')}`;

  return { valid, sum, values, violations, message, label };
}

/**
 * Convenience: validate and throw if invalid (for engine-internal use only).
 * Prefer validateComposition() at API boundaries to return structured errors.
 */
export function assertValidComposition(x: readonly number[], label: string): void {
  const r = validateComposition(x, label);
  if (!r.valid) {
    throw new Error(`ECR-2 composition error — ${r.message}`);
  }
}

/**
 * Build an initial guess x0 for the NRTL flash from the pure-component
 * reference state: RRBO-rich = mostly Sat/Mono/Di/Poly, NMP-poor.
 * NMP-rich = mostly NMP.
 *
 * These are used ONLY as initial guesses, not as governed compositions.
 */
export const NRTL_FLASH_INITIAL_GUESS = {
  /** RRBO-rich phase initial guess: [0.30, 0.25, 0.20, 0.15, 0.10] */
  x0_rrbo_rich: [0.30, 0.25, 0.20, 0.15, 0.10] as number[],
  /** NMP-rich phase initial guess: [0.05, 0.04, 0.03, 0.02, 0.86] */
  y0_nmp_rich:  [0.05, 0.04, 0.03, 0.02, 0.86] as number[],
};
