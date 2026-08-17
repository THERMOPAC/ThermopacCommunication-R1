// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Component Diffusivity Contract and Schmidt Numbers
//
// Implements the engineer-supplied diffusivity input contract for each
// transferable pseudo-component: Sat, Mono, Di, Poly.
//
// NMP (index 4) is the solvent — its diffusivity is NOT part of this contract
// because NMP is not transferred on a component driving-force basis.
//
// ── GOVERNANCE ───────────────────────────────────────────────────────────
//
//   · NO diffusivity correlation is implemented or approved.
//   · Diffusivities MUST be engineer-supplied with full source tags.
//   · Do NOT assume or seed default diffusivity values.
//   · A separate diffusivity correlation (e.g. Wilke-Chang) may be proposed
//     in a future phase and must be approved before implementation.
//
// ── IMPLEMENTED QUANTITIES ───────────────────────────────────────────────
//
//   De_c,i   [m²/s] — molecular diffusivity of component i in continuous (NMP) phase
//   De_d,i   [m²/s] — molecular diffusivity of component i in dispersed (RRBO) phase
//
//   Sc_c,i = μ_c / (ρ_c · De_c,i)   [—]   Schmidt number, continuous phase
//   Sc_d,i = μ_d / (ρ_d · De_d,i)   [—]   Schmidt number, dispersed phase
//
// Dimensional audit for Sc_c:
//   [Pa·s] / ([kg/m³] · [m²/s])
//   = [kg/(m·s)] / [kg/(m·s)]   (since Pa·s = kg/(m·s) and kg/m³ · m²/s = kg/(m·s))
//   = [—]  ✓
//
// ── BLOCKED FIELDS ───────────────────────────────────────────────────────
//
//   Sh_c,i, Sh_d,i, k_c,i, k_d,i, K_overall,i, K_oa,i are
//   NOT implemented here — see llx-ecr2-compartment-state.ts ECR2ComponentMassTransfer.
// ═══════════════════════════════════════════════════════════════════════════

import {
  nullField,
  NULL_DE_MISSING,
  type ECR2NullField,
} from './llx-ecr2-compartment-state';

import {
  isPropertyAvailable,
  type ECR2LocalPropertyResult,
} from './llx-ecr2-local-properties';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Engineer-supplied diffusivity for one component in one phase.
 *
 * All five metadata fields are required. There are no defaults.
 * Values in m²/s (SI).
 */
export interface DiffusivityInput {
  /** Molecular diffusivity De (m²/s). Must be > 0. */
  value_m2_s: number;
  /** Must be 'Assumed' | 'Vendor' | 'Literature_Analogy' | 'Pilot' | 'Thermopac'. */
  sourceType: string;
  /** Lab report number, vendor CoA, literature reference, or note. */
  sourceReference: string;
  /**
   * Reference temperature (°C) at which De was measured/estimated.
   * De is temperature-dependent; report the exact temperature.
   */
  referenceTemperature_C: number;
  /**
   * Estimation method or measurement technique.
   * Example: 'Wilke-Chang (1955) — estimate', 'Stokes-Einstein', 'Taylor dispersion', 'Assumed analogy'.
   */
  method: string;
  /** Always 'engineer_supplied' — no library defaults. */
  status: 'engineer_supplied';
}

/**
 * Diffusivity pair for one pseudo-component (one in each phase).
 * Either or both may be absent.
 */
export interface ComponentDiffusivities {
  /** Diffusivity in continuous (NMP) phase. Null if not supplied. */
  De_c: DiffusivityInput | null;
  /** Diffusivity in dispersed (RRBO) phase. Null if not supplied. */
  De_d: DiffusivityInput | null;
}

/**
 * Full diffusivity contract: one entry per transferable pseudo-component.
 * NMP (index 4) is excluded — NMP is the solvent, not transferred on driving-force basis.
 */
export interface ECR2DiffusivityContract {
  Sat:  ComponentDiffusivities;  // index 0
  Mono: ComponentDiffusivities;  // index 1
  Di:   ComponentDiffusivities;  // index 2
  Poly: ComponentDiffusivities;  // index 3
}

/**
 * Schmidt number pair for one pseudo-component.
 */
export interface ECR2ComponentSchmidt {
  /** Sc_c,i = μ_c / (ρ_c · De_c,i) [—]. Null when De_c or properties missing. */
  Sc_c: number | ECR2NullField;
  /** Sc_d,i = μ_d / (ρ_d · De_d,i) [—]. Null when De_d or properties missing. */
  Sc_d: number | ECR2NullField;
  diagnostics: string[];
}

/**
 * All Schmidt numbers for the 4 transferable components.
 */
export interface ECR2AllSchmidtNumbers {
  Sat:  ECR2ComponentSchmidt;
  Mono: ECR2ComponentSchmidt;
  Di:   ECR2ComponentSchmidt;
  Poly: ECR2ComponentSchmidt;
}

// ── Empty contract builder ─────────────────────────────────────────────────

/**
 * Build an empty (all-null) diffusivity contract.
 * Use when no diffusivities have been supplied.
 */
export function emptyDiffusivityContract(): ECR2DiffusivityContract {
  const empty: ComponentDiffusivities = { De_c: null, De_d: null };
  return {
    Sat:  { ...empty },
    Mono: { ...empty },
    Di:   { ...empty },
    Poly: { ...empty },
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface DiffusivityValidationIssue {
  component: string;
  phase: 'c' | 'd';
  field: string;
  message: string;
}

/**
 * Validate a DiffusivityInput object.
 * Returns an array of issues (empty = valid).
 * Does NOT throw.
 */
export function validateDiffusivityInput(
  de: DiffusivityInput,
  label: string,
): DiffusivityValidationIssue[] {
  const issues: DiffusivityValidationIssue[] = [];
  const [component, phase] = label.split('.') as [string, 'c' | 'd'];

  if (!Number.isFinite(de.value_m2_s) || de.value_m2_s <= 0) {
    issues.push({ component, phase, field: 'value_m2_s', message: `${label}.value_m2_s = ${de.value_m2_s} is not a positive finite number.` });
  }
  if (!de.sourceType || !de.sourceType.trim()) {
    issues.push({ component, phase, field: 'sourceType', message: `${label}.sourceType is empty — required.` });
  }
  if (!de.sourceReference || !de.sourceReference.trim()) {
    issues.push({ component, phase, field: 'sourceReference', message: `${label}.sourceReference is empty — required.` });
  }
  if (!Number.isFinite(de.referenceTemperature_C)) {
    issues.push({ component, phase, field: 'referenceTemperature_C', message: `${label}.referenceTemperature_C = ${de.referenceTemperature_C} — not a finite number.` });
  }
  if (!de.method || !de.method.trim()) {
    issues.push({ component, phase, field: 'method', message: `${label}.method is empty — required (e.g. Wilke-Chang estimate, Taylor dispersion).` });
  }
  return issues;
}

// ── Schmidt number computation ─────────────────────────────────────────────

/**
 * Compute Schmidt numbers for a single component.
 *
 * Sc_c = μ_c / (ρ_c · De_c)    [—]
 * Sc_d = μ_d / (ρ_d · De_d)    [—]
 *
 * Returns ECR2NullField when any required upstream input is missing.
 * Does NOT clamp.
 */
export function computeSchmidtNumbers(params: {
  label: string;          // e.g. 'Sat', 'Mono', 'Di', 'Poly'
  De_c: DiffusivityInput | null;
  De_d: DiffusivityInput | null;
  rho_c: ECR2LocalPropertyResult | ECR2NullField | null;
  rho_d: ECR2LocalPropertyResult | ECR2NullField | null;
  mu_c:  ECR2LocalPropertyResult | ECR2NullField | null;
  mu_d:  ECR2LocalPropertyResult | ECR2NullField | null;
}): ECR2ComponentSchmidt {
  const { label, De_c, De_d } = params;
  const diagnostics: string[] = [];

  const rho_c_val = isPropertyAvailable(params.rho_c as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.rho_c as ECR2LocalPropertyResult).value : null;
  const rho_d_val = isPropertyAvailable(params.rho_d as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.rho_d as ECR2LocalPropertyResult).value : null;
  const mu_c_val  = isPropertyAvailable(params.mu_c  as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.mu_c  as ECR2LocalPropertyResult).value : null;
  const mu_d_val  = isPropertyAvailable(params.mu_d  as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.mu_d  as ECR2LocalPropertyResult).value : null;

  // ── Sc_c ────────────────────────────────────────────────────────────
  let Sc_c: number | ECR2NullField;
  if (De_c === null) {
    Sc_c = { ...NULL_DE_MISSING, message: `Sc_c (${label}): De_c not supplied. ${NULL_DE_MISSING.message}` };
    diagnostics.push(`Sc_c (${label}): blocked — De_c not supplied.`);
  } else if (mu_c_val === null) {
    Sc_c = nullField('blocked_by_local_properties', null, `Sc_c (${label}): μ_c unavailable.`);
    diagnostics.push(`Sc_c (${label}): blocked — μ_c unavailable.`);
  } else if (rho_c_val === null) {
    Sc_c = nullField('blocked_by_local_properties', null, `Sc_c (${label}): ρ_c unavailable.`);
    diagnostics.push(`Sc_c (${label}): blocked — ρ_c unavailable.`);
  } else {
    const denom_c = rho_c_val * De_c.value_m2_s;
    if (denom_c <= 0) {
      Sc_c = nullField('blocked_by_local_properties', null, `Sc_c (${label}): ρ_c·De_c ≤ 0 — non-physical.`);
    } else {
      Sc_c = mu_c_val / denom_c;
      diagnostics.push(
        `Sc_c (${label}) = μ_c / (ρ_c · De_c) = ` +
        `${mu_c_val.toExponential(4)} / (${rho_c_val.toFixed(2)} × ${De_c.value_m2_s.toExponential(4)}) ` +
        `= ${(Sc_c as number).toFixed(1)} [—]`,
      );
    }
  }

  // ── Sc_d ────────────────────────────────────────────────────────────
  let Sc_d: number | ECR2NullField;
  if (De_d === null) {
    Sc_d = { ...NULL_DE_MISSING, message: `Sc_d (${label}): De_d not supplied. ${NULL_DE_MISSING.message}` };
    diagnostics.push(`Sc_d (${label}): blocked — De_d not supplied.`);
  } else if (mu_d_val === null) {
    Sc_d = nullField('blocked_by_local_properties', null, `Sc_d (${label}): μ_d unavailable — must be engineer-supplied.`);
    diagnostics.push(`Sc_d (${label}): blocked — μ_d unavailable.`);
  } else if (rho_d_val === null) {
    Sc_d = nullField('blocked_by_local_properties', null, `Sc_d (${label}): ρ_d unavailable.`);
    diagnostics.push(`Sc_d (${label}): blocked — ρ_d unavailable.`);
  } else {
    const denom_d = rho_d_val * De_d.value_m2_s;
    if (denom_d <= 0) {
      Sc_d = nullField('blocked_by_local_properties', null, `Sc_d (${label}): ρ_d·De_d ≤ 0 — non-physical.`);
    } else {
      Sc_d = mu_d_val / denom_d;
      diagnostics.push(
        `Sc_d (${label}) = μ_d / (ρ_d · De_d) = ` +
        `${mu_d_val.toExponential(4)} / (${rho_d_val.toFixed(2)} × ${De_d.value_m2_s.toExponential(4)}) ` +
        `= ${(Sc_d as number).toFixed(1)} [—]`,
      );
    }
  }

  return { Sc_c, Sc_d, diagnostics };
}

/**
 * Compute Schmidt numbers for all 4 transferable components.
 */
export function computeAllSchmidtNumbers(params: {
  diffusivity: ECR2DiffusivityContract;
  rho_c: ECR2LocalPropertyResult | ECR2NullField | null;
  rho_d: ECR2LocalPropertyResult | ECR2NullField | null;
  mu_c:  ECR2LocalPropertyResult | ECR2NullField | null;
  mu_d:  ECR2LocalPropertyResult | ECR2NullField | null;
}): ECR2AllSchmidtNumbers {
  const { diffusivity, rho_c, rho_d, mu_c, mu_d } = params;
  const base = { rho_c, rho_d, mu_c, mu_d };
  return {
    Sat:  computeSchmidtNumbers({ label: 'Sat',  De_c: diffusivity.Sat.De_c,  De_d: diffusivity.Sat.De_d,  ...base }),
    Mono: computeSchmidtNumbers({ label: 'Mono', De_c: diffusivity.Mono.De_c, De_d: diffusivity.Mono.De_d, ...base }),
    Di:   computeSchmidtNumbers({ label: 'Di',   De_c: diffusivity.Di.De_c,   De_d: diffusivity.Di.De_d,   ...base }),
    Poly: computeSchmidtNumbers({ label: 'Poly', De_c: diffusivity.Poly.De_c, De_d: diffusivity.Poly.De_d, ...base }),
  };
}
