// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Local Hydrodynamic Dimensionless Numbers
//
// Computes drop-level dimensionless groups from the available compartment
// hydrodynamic state. All computations follow SI units.
//
// Implemented quantities (Section 6 of Phase 2 specification):
//
//   U_slip = u_d/φ_d + u_c/(1−φ_d)                        [m/s]
//   Re_d   = ρ_c · U_slip · d₃₂ / μ_c                     [—]
//   We_drop = ρ_c · U_slip² · d₃₂ / σ                     [—]
//   κ      = μ_d / μ_c                                     [—]
//
// Governing principles:
//   · No clamping of any computed value
//   · Typed ECR2NullField when any upstream dependency is unavailable
//   · Exact blocking reason in every null field
//   · Dimensional audit embedded in function docstrings
// ═══════════════════════════════════════════════════════════════════════════

import {
  nullField,
  type ECR2NullField,
} from './llx-ecr2-compartment-state';

import {
  isPropertyAvailable,
  type ECR2LocalPropertyResult,
} from './llx-ecr2-local-properties';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ECR2DimensionlessResult {
  /**
   * Drop Reynolds number.
   *
   * Re_d = ρ_c · U_slip · d₃₂ / μ_c
   *
   * Dimensional audit (SI):
   *   [kg/m³] · [m/s] · [m] / [Pa·s]
   *   = [kg/m³] · [m²/s] / [kg/(m·s)]
   *   = [kg·m·s] / [m³·kg] = [—]  ✓
   *
   * Null when U_slip, d₃₂, ρ_c, or μ_c is unavailable.
   */
  Re_d: number | ECR2NullField;

  /**
   * Drop Weber number.
   *
   * We_drop = ρ_c · U_slip² · d₃₂ / σ
   *
   * Dimensional audit (SI):
   *   [kg/m³] · [m²/s²] · [m] / [N/m]
   *   = [kg/m³] · [m³/s²] / [kg·m/s²·(1/m)]
   *   = [kg/m³] · [m³/s²] · [s²/(kg)]
   *   = [—]  ✓
   *
   * Null when U_slip, d₃₂, ρ_c, or σ is unavailable.
   */
  We_drop: number | ECR2NullField;

  /**
   * Dispersed-to-continuous viscosity ratio (viscosity ratio).
   *
   * κ = μ_d / μ_c  [—]
   *
   * Null when μ_d or μ_c is unavailable.
   */
  kappa: number | ECR2NullField;

  diagnostics: string[];
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Compute drop-level dimensionless hydrodynamic groups.
 *
 * All inputs must be in SI units:
 *   rho_c   [kg/m³]
 *   mu_c    [Pa·s = kg/(m·s)]
 *   mu_d    [Pa·s]
 *   sigma   [N/m = kg/s²]
 *   U_slip  [m/s]
 *   d32_m   [m]
 *
 * Returns ECR2NullField for any quantity whose dependencies are missing.
 * Does NOT clamp or substitute default values.
 */
export function computeDimensionlessNumbers(params: {
  U_slip_m_s:  number | null;
  d32_m:       number | null;
  rho_c:       ECR2LocalPropertyResult | ECR2NullField | null;
  mu_c:        ECR2LocalPropertyResult | ECR2NullField | null;
  mu_d:        ECR2LocalPropertyResult | ECR2NullField | null;
  sigma:       ECR2LocalPropertyResult | ECR2NullField | null;
}): ECR2DimensionlessResult {
  const { U_slip_m_s, d32_m } = params;
  const diagnostics: string[] = [];

  // ── Extract scalar values from property results ──────────────────────
  const rhoCProp = isPropertyAvailable(params.rho_c as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.rho_c as ECR2LocalPropertyResult)
    : null;
  const muCProp = isPropertyAvailable(params.mu_c as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.mu_c as ECR2LocalPropertyResult)
    : null;
  const muDProp = isPropertyAvailable(params.mu_d as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.mu_d as ECR2LocalPropertyResult)
    : null;
  const sigmaProp = isPropertyAvailable(params.sigma as ECR2LocalPropertyResult | ECR2NullField | null)
    ? (params.sigma as ECR2LocalPropertyResult)
    : null;

  const rho_c_val = rhoCProp?.value ?? null;
  const mu_c_val  = muCProp?.value  ?? null;
  const mu_d_val  = muDProp?.value  ?? null;
  const sigma_val = sigmaProp?.value ?? null;

  // ── Re_d ────────────────────────────────────────────────────────────
  let Re_d: number | ECR2NullField;

  const missingForRe: string[] = [];
  if (U_slip_m_s === null) missingForRe.push('U_slip (requires usable φ_d)');
  if (d32_m === null)      missingForRe.push('d₃₂ (K&H 1996 unresolved or not supplied)');
  if (rho_c_val === null)  missingForRe.push('ρ_c (NMP density — should be available from EPD library)');
  if (mu_c_val === null)   missingForRe.push('μ_c (NMP viscosity — should be available from EPD library)');

  if (missingForRe.length === 0) {
    const Re = (rho_c_val! * U_slip_m_s! * d32_m!) / mu_c_val!;
    if (!Number.isFinite(Re) || Re <= 0) {
      Re_d = nullField(
        'blocked_by_local_properties',
        null,
        `Re_d computed as ${Re} — not a positive finite number. ` +
        `Inputs: ρ_c=${rho_c_val} kg/m³, U_slip=${U_slip_m_s} m/s, d₃₂=${d32_m} m, μ_c=${mu_c_val} Pa·s.`,
      );
      diagnostics.push(`Re_d: computed value ${Re} is not physical — returned null.`);
    } else {
      Re_d = Re;
      diagnostics.push(
        `Re_d = ρ_c · U_slip · d₃₂ / μ_c = ` +
        `${rho_c_val!.toFixed(2)} × ${U_slip_m_s!.toExponential(4)} × ${(d32_m! * 1000).toFixed(3)}mm / ${mu_c_val!.toExponential(4)} ` +
        `= ${Re.toFixed(4)} [—]`,
      );
    }
  } else {
    Re_d = nullField(
      'blocked_by_d32',
      d32_m === null ? 'ecr2_d32_kh1996' : null,
      `Re_d unavailable — missing: ${missingForRe.join(', ')}.`,
    );
    diagnostics.push(`Re_d: blocked — ${missingForRe.join(', ')}.`);
  }

  // ── We_drop ─────────────────────────────────────────────────────────
  let We_drop: number | ECR2NullField;

  const missingForWe: string[] = [];
  if (U_slip_m_s === null) missingForWe.push('U_slip');
  if (d32_m === null)      missingForWe.push('d₃₂');
  if (rho_c_val === null)  missingForWe.push('ρ_c');
  if (sigma_val === null)  missingForWe.push('σ (engineer-supplied NMP/RRBO interfacial tension — no EPD default)');

  if (missingForWe.length === 0) {
    const We = (rho_c_val! * U_slip_m_s! * U_slip_m_s! * d32_m!) / sigma_val!;
    if (!Number.isFinite(We) || We <= 0) {
      We_drop = nullField(
        'blocked_by_local_properties',
        null,
        `We_drop computed as ${We} — not a positive finite number. ` +
        `Inputs: ρ_c=${rho_c_val} kg/m³, U_slip=${U_slip_m_s} m/s, d₃₂=${d32_m} m, σ=${sigma_val} N/m.`,
      );
      diagnostics.push(`We_drop: computed value ${We} is not physical — returned null.`);
    } else {
      We_drop = We;
      diagnostics.push(
        `We_drop = ρ_c · U_slip² · d₃₂ / σ = ` +
        `${rho_c_val!.toFixed(2)} × (${U_slip_m_s!.toExponential(4)})² × ${(d32_m! * 1000).toFixed(3)}mm / ${sigma_val!.toExponential(4)} ` +
        `= ${We.toExponential(4)} [—]`,
      );
    }
  } else {
    We_drop = nullField(
      d32_m === null || sigma_val === null ? 'blocked_by_d32' : 'blocked_by_local_properties',
      d32_m === null ? 'ecr2_d32_kh1996' : null,
      `We_drop unavailable — missing: ${missingForWe.join(', ')}.`,
    );
    diagnostics.push(`We_drop: blocked — ${missingForWe.join(', ')}.`);
  }

  // ── kappa ────────────────────────────────────────────────────────────
  let kappa: number | ECR2NullField;

  if (mu_d_val === null || mu_c_val === null) {
    const missingForKappa: string[] = [];
    if (mu_d_val === null) missingForKappa.push('μ_d (engineer-supplied — no EPD library default)');
    if (mu_c_val === null) missingForKappa.push('μ_c');
    kappa = nullField(
      'blocked_by_local_properties',
      null,
      `κ unavailable — missing: ${missingForKappa.join(', ')}.`,
    );
    diagnostics.push(`kappa: blocked — ${missingForKappa.join(', ')}.`);
  } else if (mu_c_val === 0) {
    kappa = nullField(
      'blocked_by_local_properties',
      null,
      'κ = μ_d/μ_c — μ_c = 0, division undefined.',
    );
  } else {
    kappa = mu_d_val / mu_c_val;
    diagnostics.push(
      `κ = μ_d / μ_c = ${mu_d_val.toExponential(4)} / ${mu_c_val.toExponential(4)} = ${(kappa as number).toFixed(6)} [—]`,
    );
  }

  return { Re_d, We_drop, kappa, diagnostics };
}

// ── Convenience guard ───────────────────────────────────────────────────────

/** True when Re_d is a usable finite positive number. */
export function isReUsable(Re_d: number | ECR2NullField): Re_d is number {
  return typeof Re_d === 'number' && Number.isFinite(Re_d) && Re_d > 0;
}
