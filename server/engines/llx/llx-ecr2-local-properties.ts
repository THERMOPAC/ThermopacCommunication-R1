// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Local Physical Properties
//
// Computes or accepts the five per-compartment physical properties required
// by the ECR-2 local hydrodynamic calculations:
//
//   rho_c  (kg/m³)  — NMP-rich continuous-phase density
//   rho_d  (kg/m³)  — RRBO-rich dispersed-phase density
//   mu_c   (Pa·s)   — NMP-rich continuous-phase dynamic viscosity
//   mu_d   (Pa·s)   — RRBO-rich dispersed-phase dynamic viscosity
//   sigma  (N/m)    — NMP/RRBO interfacial tension
//
// ── SOURCE AVAILABILITY ────────────────────────────────────────────────────
//
//   rho_c : EPD library  — NMP, tabular interpolation, 25–70 °C  ✅
//   rho_d : EPD library  — RRBO (grade-specific), tabular, 25–70 °C  ✅
//   mu_c  : EPD library  — NMP, tabular interpolation, 20–80 °C  ✅
//   mu_d  : NO LIBRARY   — must be engineer-supplied  ⚠️
//   sigma : NO LIBRARY   — must be engineer-supplied  ⚠️
//
// ── APPROXIMATION BASIS ───────────────────────────────────────────────────
//
//   PURE-COMPONENT AT TEMPERATURE.
//
//   Properties are evaluated for each PURE phase fluid at temperature T_C.
//   They do NOT account for dissolved cross-solutes in either phase
//   (e.g. dissolved aromatics in the NMP-rich continuous phase, or dissolved
//   NMP in the RRBO-rich dispersed phase).
//
//   This is a STANDARD ENGINEERING APPROXIMATION for preliminary design of
//   liquid-liquid extraction systems where mixture-property correlations are
//   not yet available or governed.
//
//   BEFORE implementing any composition-dependent mixture-property mixing
//   rule, the proposed rule and technical basis must be approved.
//   The pure-component approximation is recorded in every result field.
//
// ── GOVERNANCE ───────────────────────────────────────────────────────────
//
//   No new mixing rules are created here.
//   EPD library functions are reused as-is.
//   mu_d and sigma interfaces require engineer-supplied source tags.
// ═══════════════════════════════════════════════════════════════════════════

import {
  getProperty,
} from '../../engine-framework/common-engineering-library';

import {
  nullField,
  type ECR2NullField,
} from './llx-ecr2-compartment-state';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A single physical-property result with full provenance metadata.
 * Required fields match the spec (Section 5):
 *   value | unit | sourceType | sourceReference | calculationMethod | status
 */
export interface ECR2LocalPropertyResult {
  value: number;
  unit: string;
  /** 'Library' | 'EngineerSupplied' | 'Derived' */
  sourceType: string;
  sourceReference: string;
  calculationMethod: string;
  /**
   * 'library'          — from EPD library data
   * 'engineer_supplied' — explicitly provided by engineer
   * 'derived'           — computed from other results (e.g. delta_rho)
   */
  status: 'library' | 'engineer_supplied' | 'derived';
  /** Non-empty when the library flagged the data as assumed/provisional. */
  warnings: string[];
}

/**
 * Engineer-supplied input for a property that has no library default.
 * mu_d and sigma MUST use this interface.
 */
export interface ECR2EngineerPropertyInput {
  /** Property value in SI units (Pa·s for viscosity, N/m for interfacial tension). */
  value: number;
  unit: string;
  /** Controlled vocabulary: Assumed | Vendor | Literature_Analogy | Pilot | Thermopac */
  sourceType: string;
  sourceReference: string;
}

/**
 * Full set of local physical properties for one compartment.
 * Fields that cannot be populated carry ECR2NullField with an explicit reason.
 */
export interface ECR2LocalPropertySet {
  /** Temperature at which all properties are evaluated (°C). */
  T_C: number;
  /** Temperature (K). */
  T_K: number;
  /** RRBO grade fluid ID used for EPD lookup (e.g. 'rrbo-sn300'). */
  rrboGradeId: string;

  // ── Phase properties ──────────────────────────────────────────────
  /** NMP-rich continuous-phase density ρ_c (kg/m³). From EPD library. */
  rho_c: ECR2LocalPropertyResult | ECR2NullField;
  /** RRBO-rich dispersed-phase density ρ_d (kg/m³). From EPD library. */
  rho_d: ECR2LocalPropertyResult | ECR2NullField;
  /** Density difference |ρ_c − ρ_d| (kg/m³). Derived. */
  delta_rho: ECR2LocalPropertyResult | ECR2NullField;
  /** NMP continuous-phase dynamic viscosity μ_c (Pa·s). From EPD library. */
  mu_c: ECR2LocalPropertyResult | ECR2NullField;
  /**
   * RRBO dispersed-phase dynamic viscosity μ_d (Pa·s).
   * NO EPD library default — must be engineer-supplied.
   * Null with reason if not supplied.
   */
  mu_d: ECR2LocalPropertyResult | ECR2NullField;
  /**
   * NMP/RRBO interfacial tension σ (N/m).
   * NO EPD library default for this pair — must be engineer-supplied.
   * Null with reason if not supplied.
   */
  sigma: ECR2LocalPropertyResult | ECR2NullField;

  /**
   * Engineering approximation basis statement.
   *
   * All EPD library properties are evaluated for the PURE phase fluid at
   * temperature T_C. Composition effects (dissolved cross-solutes) are NOT
   * accounted for. This is an engineering approximation for preliminary design.
   */
  approximationBasis: string;

  diagnostics: string[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const APPROX_BASIS =
  'Pure-component at temperature (preliminary engineering approximation). ' +
  'rho_c and mu_c evaluated for pure NMP at T. rho_d evaluated for pure RRBO grade at T. ' +
  'Composition-dependent mixture properties are NOT modelled. ' +
  'Before implementing any mixture mixing rule, proposed rule and basis must be approved.';

const MU_D_NO_LIBRARY =
  'RRBO dynamic viscosity (μ_d) has no EPD library default. ' +
  'Must be engineer-supplied with sourceType and sourceReference. ' +
  'Typical range 5–50 mPa·s for RRBO grades at 60–80 °C.';

const SIGMA_NO_LIBRARY =
  'NMP/RRBO interfacial tension (σ) has no EPD library default for this binary pair. ' +
  'Must be engineer-supplied with sourceType and sourceReference. ' +
  'Typical range 2–20 mN/m for NMP/hydrocarbon systems.';

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Compute local physical properties for a compartment.
 *
 * @param T_C           Temperature (°C).
 * @param rrboGradeId   RRBO grade for density lookup (default 'rrbo-sn300').
 * @param mu_d_engineer Engineer-supplied μ_d (Pa·s). Required; null if absent.
 * @param sigma_engineer Engineer-supplied σ (N/m). Required; null if absent.
 */
export function computeLocalProperties(params: {
  T_C: number;
  rrboGradeId?: string;
  mu_d_engineer?: ECR2EngineerPropertyInput | null;
  sigma_engineer?: ECR2EngineerPropertyInput | null;
}): ECR2LocalPropertySet {
  const {
    T_C,
    rrboGradeId = 'rrbo-sn300',
    mu_d_engineer,
    sigma_engineer,
  } = params;
  const T_K = T_C + 273.15;
  const diagnostics: string[] = [];

  // ── rho_c — NMP density from EPD library ────────────────────────────
  let rho_c: ECR2LocalPropertyResult | ECR2NullField;
  try {
    const r = getProperty('nmp', 'density', T_C);
    rho_c = {
      value: r.value,
      unit: r.unit,           // kg/m³
      sourceType: 'Library',
      sourceReference: `EPD NMP density library — tabular interpolation at ${T_C} °C. Source: ${r.source}`,
      calculationMethod: 'EPD tabular linear interpolation — pure NMP at temperature T',
      status: 'library',
      warnings: r.warnings.map((w) => w.message),
    };
    if (r.warnings.length > 0) {
      diagnostics.push(`rho_c WARNING: ${r.warnings.map((w) => w.message).join('; ')}`);
    }
  } catch (e) {
    rho_c = nullField(
      'blocked_by_local_properties',
      null,
      `NMP density (ρ_c) unavailable from EPD library at T = ${T_C} °C: ${String(e)}`,
    );
    diagnostics.push(`rho_c ERROR: ${String(e)}`);
  }

  // ── rho_d — RRBO density from EPD library ───────────────────────────
  let rho_d: ECR2LocalPropertyResult | ECR2NullField;
  try {
    const r = getProperty(rrboGradeId, 'density', T_C);
    rho_d = {
      value: r.value,
      unit: r.unit,           // kg/m³
      sourceType: 'Library',
      sourceReference: `EPD ${rrboGradeId} density library — tabular interpolation at ${T_C} °C. Source: ${r.source}`,
      calculationMethod: `EPD tabular linear interpolation — pure ${rrboGradeId} at temperature T`,
      status: 'library',
      warnings: r.warnings.map((w) => w.message),
    };
    if (r.warnings.length > 0) {
      diagnostics.push(`rho_d WARNING: ${r.warnings.map((w) => w.message).join('; ')}`);
    }
  } catch (e) {
    rho_d = nullField(
      'blocked_by_local_properties',
      null,
      `RRBO density (ρ_d) unavailable from EPD library for '${rrboGradeId}' at T = ${T_C} °C: ${String(e)}`,
    );
    diagnostics.push(`rho_d ERROR: ${String(e)}`);
  }

  // ── delta_rho — derived ──────────────────────────────────────────────
  let delta_rho: ECR2LocalPropertyResult | ECR2NullField;
  if ('value' in rho_c && 'value' in rho_d) {
    const dRho = Math.abs(rho_c.value - rho_d.value);
    delta_rho = {
      value: dRho,
      unit: 'kg/m³',
      sourceType: 'Derived',
      sourceReference: `|ρ_c − ρ_d| at T = ${T_C} °C (pure-component approximation)`,
      calculationMethod: 'delta_rho = |rho_c − rho_d| — derived from EPD library values',
      status: 'derived',
      warnings: [],
    };
  } else {
    delta_rho = nullField(
      'blocked_by_local_properties',
      null,
      'Density difference (Δρ) unavailable — requires both rho_c and rho_d.',
    );
  }

  // ── mu_c — NMP viscosity from EPD library ───────────────────────────
  let mu_c: ECR2LocalPropertyResult | ECR2NullField;
  try {
    const r = getProperty('nmp', 'dynamicViscosity', T_C);
    mu_c = {
      value: r.value,
      unit: r.unit,           // Pa·s
      sourceType: 'Library',
      sourceReference: `EPD NMP dynamic viscosity library — tabular interpolation at ${T_C} °C. Source: ${r.source}`,
      calculationMethod: 'EPD tabular linear interpolation — pure NMP dynamic viscosity at temperature T',
      status: 'library',
      warnings: r.warnings.map((w) => w.message),
    };
    if (r.warnings.length > 0) {
      diagnostics.push(`mu_c WARNING: ${r.warnings.map((w) => w.message).join('; ')}`);
    }
  } catch (e) {
    mu_c = nullField(
      'blocked_by_local_properties',
      null,
      `NMP viscosity (μ_c) unavailable from EPD library at T = ${T_C} °C: ${String(e)}`,
    );
    diagnostics.push(`mu_c ERROR: ${String(e)}`);
  }

  // ── mu_d — RRBO viscosity (engineer-supplied only) ───────────────────
  let mu_d: ECR2LocalPropertyResult | ECR2NullField;
  if (mu_d_engineer && Number.isFinite(mu_d_engineer.value) && mu_d_engineer.value > 0) {
    mu_d = {
      value: mu_d_engineer.value,
      unit: mu_d_engineer.unit || 'Pa.s',
      sourceType: mu_d_engineer.sourceType,
      sourceReference: mu_d_engineer.sourceReference,
      calculationMethod: 'Engineer-supplied RRBO dynamic viscosity — no EPD library default for RRBO viscosity',
      status: 'engineer_supplied',
      warnings: [
        'RRBO viscosity (μ_d) is engineer-supplied — no EPD library default. ' +
        'Pure-component approximation applies. Validate against vendor data or laboratory measurement.',
      ],
    };
    diagnostics.push(
      `mu_d: engineer-supplied = ${mu_d_engineer.value * 1000} mPa·s at T = ${T_C} °C ` +
      `(${mu_d_engineer.sourceType}: ${mu_d_engineer.sourceReference})`,
    );
  } else {
    mu_d = nullField(
      'blocked_by_local_properties',
      null,
      MU_D_NO_LIBRARY,
    );
    diagnostics.push('mu_d: NOT supplied — required for Re_d, We_drop, kappa, and k_d computation.');
  }

  // ── sigma — NMP/RRBO interfacial tension (engineer-supplied only) ────
  let sigma: ECR2LocalPropertyResult | ECR2NullField;
  if (sigma_engineer && Number.isFinite(sigma_engineer.value) && sigma_engineer.value > 0) {
    sigma = {
      value: sigma_engineer.value,
      unit: sigma_engineer.unit || 'N/m',
      sourceType: sigma_engineer.sourceType,
      sourceReference: sigma_engineer.sourceReference,
      calculationMethod: 'Engineer-supplied NMP/RRBO interfacial tension — no EPD library correlation for this pair',
      status: 'engineer_supplied',
      warnings: [
        'NMP/RRBO interfacial tension (σ) is engineer-supplied — no EPD library default for this binary pair. ' +
        'Validate against spinning-drop tensiometry or literature values at extraction temperature.',
      ],
    };
    diagnostics.push(
      `sigma: engineer-supplied = ${sigma_engineer.value * 1000} mN/m at T = ${T_C} °C ` +
      `(${sigma_engineer.sourceType}: ${sigma_engineer.sourceReference})`,
    );
  } else {
    sigma = nullField(
      'blocked_by_local_properties',
      null,
      SIGMA_NO_LIBRARY,
    );
    diagnostics.push('sigma: NOT supplied — required for We_drop and K&H 1995 holdup computation.');
  }

  return {
    T_C,
    T_K,
    rrboGradeId,
    rho_c,
    rho_d,
    delta_rho,
    mu_c,
    mu_d,
    sigma,
    approximationBasis: APPROX_BASIS,
    diagnostics,
  };
}

// ── Helper: check if a property result is available ────────────────────────

/** Returns true when the result has a usable scalar value (not ECR2NullField). */
export function isPropertyAvailable(
  r: ECR2LocalPropertyResult | ECR2NullField | null | undefined,
): r is ECR2LocalPropertyResult {
  return r !== null && r !== undefined && 'value' in r && typeof r.value === 'number' && Number.isFinite(r.value);
}
