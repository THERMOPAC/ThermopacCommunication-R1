// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Interfacial Area Computation
//
// Implements: a = 6 · φ_d / d₃₂  (m²/m³)
//
// Source: standard drop-population formula.
//   Also: K&H (1999) / Laitinen (2019) Eq. (9): a = 6·φ/d32
//
// Physical admissibility guards (section 9 of simulator specification):
//   0 < φ_d < 1   (holdup must be physically valid and usable)
//   d₃₂ > 0       (droplet diameter must be positive)
//
// If either input is unusable, a = null with explicit dependency reason.
// Do NOT clamp. Do NOT substitute an assumed value.
//
// Dimensional check:
//   a [m²/m³] = 6 · [—] / [m] = [m⁻¹] ✓
// ═══════════════════════════════════════════════════════════════════════════

import { isHoldupUsable, type KH1995HoldupResult } from './llx-ecr2-holdup';
import { isD32Usable, type D32Result } from './llx-ecr2-d32-interface';

// ── Result types ───────────────────────────────────────────────────────────

/** Status of the interfacial area computation. */
export type InterfacialAreaStatus =
  | 'calculated'              // a computed from both usable φ_d and usable d₃₂
  | 'calculated_engineer_d32' // a computed but d₃₂ was engineer-supplied
  | 'blocked_holdup'          // φ_d is not usable
  | 'blocked_d32'             // d₃₂ is null or not usable
  | 'blocked_both'            // neither φ_d nor d₃₂ is usable
  | 'physically_invalid';     // guards on φ_d or d₃₂ values were violated

/**
 * Result of computeInterfacialArea().
 *
 * a_m2_m3 is non-null only when status is 'calculated' or 'calculated_engineer_d32'.
 */
export interface InterfacialAreaResult {
  /** Specific interfacial area a = 6·φ_d/d₃₂ (m²/m³). Null when either input is unusable. */
  a_m2_m3: number | null;
  /** Computation status. */
  status: InterfacialAreaStatus;
  /** φ_d value used in the computation (null when holdup was not usable). */
  phi_d_used: number | null;
  /** d₃₂ value used (m) (null when d₃₂ was not usable). */
  d32_m_used: number | null;
  /** True if d₃₂ was engineer-supplied (not from a published correlation). */
  d32EngineerSupplied: boolean;
  /** Label to carry forward to all outputs using this a. */
  label: string | null;
  /** Dependency reasons causing any block. */
  blockingReasons: string[];
  /** Diagnostic messages (range advisories, provenance). */
  diagnostics: string[];
  /** Provenance string for audit trail. */
  provenance: string;
}

// ── Main function ──────────────────────────────────────────────────────────

/**
 * Compute specific interfacial area a = 6·φ_d / d₃₂ (m²/m³).
 *
 * Guards applied before computation (both must pass):
 *   1. isHoldupUsable(holdupResult) — holdup status must be 'calculated' or
 *      'calculated_extrapolated'. 'physically_invalid', 'input_missing', and
 *      'calculation_invalid' all block the computation.
 *   2. isD32Usable(d32Result) — d₃₂ must be a finite positive number with
 *      status 'calculated', 'calculated_extrapolated', or 'engineer_supplied'.
 *   3. 0 < φ_d < 1 (physical admissibility — belt-and-suspenders after guard 1).
 *   4. d₃₂ > 0     (physical admissibility — belt-and-suspenders after guard 2).
 *
 * Do NOT clamp. If any guard fails, return null with explicit reason.
 *
 * @param holdupResult   Full K&H 1995 holdup result from computeKH1995Holdup().
 *                       Pass null if holdup was not computed.
 * @param d32Result      Full d₃₂ result from computeDropletDiameter().
 *                       Pass null if d₃₂ was not computed.
 * @returns              InterfacialAreaResult with a_m2_m3, status, and diagnostics.
 */
export function computeInterfacialArea(
  holdupResult: KH1995HoldupResult | null,
  d32Result: D32Result | null,
): InterfacialAreaResult {

  const blockingReasons: string[] = [];
  const diagnostics: string[] = [];

  // ── Guard 1: holdup usability ────────────────────────────────────────────
  const holdupUsable = holdupResult !== null && isHoldupUsable(holdupResult);
  if (!holdupUsable) {
    const reason = holdupResult === null
      ? 'Holdup result is null — holdup was not computed (σ and x_f inputs required).'
      : `Holdup status '${holdupResult.status}' is not usable for interfacial area. ` +
        "Only 'calculated' and 'calculated_extrapolated' are downstream-consumable.";
    blockingReasons.push(reason);
  }

  // ── Guard 2: d₃₂ usability ──────────────────────────────────────────────
  const d32Usable = d32Result !== null && isD32Usable(d32Result);
  if (!d32Usable) {
    const reason = d32Result === null
      ? 'D₃₂ result is null — d₃₂ was not computed.'
      : `D₃₂ status '${d32Result.status}' is not usable for interfacial area. ` +
        "Only 'calculated', 'calculated_extrapolated', and 'engineer_supplied' are downstream-consumable. " +
        "(K&H 1996 has UNRESOLVED flags — supply an engineer d₃₂ to proceed.)";
    blockingReasons.push(reason);
  }

  // ── Both blocked ─────────────────────────────────────────────────────────
  if (!holdupUsable && !d32Usable) {
    return {
      a_m2_m3: null,
      status: 'blocked_both',
      phi_d_used: null,
      d32_m_used: null,
      d32EngineerSupplied: false,
      label: null,
      blockingReasons,
      diagnostics,
      provenance:
        'a = 6·φ_d/d₃₂ not computed — both φ_d (holdup) and d₃₂ are unavailable. ' +
        'Blocked_by: ecr2_holdup_kh1995 and ecr2_d32_kh1996.',
    };
  }

  // ── Holdup blocked only ───────────────────────────────────────────────────
  if (!holdupUsable) {
    return {
      a_m2_m3: null,
      status: 'blocked_holdup',
      phi_d_used: null,
      d32_m_used: d32Usable && d32Result ? d32Result.d32_m : null,
      d32EngineerSupplied: d32Result?.mode === 'engineer_supplied' ?? false,
      label: null,
      blockingReasons,
      diagnostics,
      provenance:
        'a = 6·φ_d/d₃₂ not computed — φ_d (holdup) is not usable. ' +
        'Blocked_by: ecr2_holdup_kh1995.',
    };
  }

  // ── d₃₂ blocked only ─────────────────────────────────────────────────────
  if (!d32Usable) {
    // Extract φ_d scalar for reporting
    const phi_d = (holdupResult as KH1995HoldupResult & { phi: number }).phi;
    return {
      a_m2_m3: null,
      status: 'blocked_d32',
      phi_d_used: typeof phi_d === 'number' ? phi_d : null,
      d32_m_used: null,
      d32EngineerSupplied: false,
      label: null,
      blockingReasons,
      diagnostics: [
        `φ_d = ${typeof phi_d === 'number' ? phi_d.toFixed(4) : 'unavailable'} (usable, from K&H 1995). ` +
        'd₃₂ is unavailable — K&H 1996 UNRESOLVED. Supply engineer d₃₂ to compute a.',
      ],
      provenance:
        'a = 6·φ_d/d₃₂ not computed — d₃₂ is null. ' +
        'K&H 1996 correlation has UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING. ' +
        'Blocked_by: ecr2_d32_kh1996.',
    };
  }

  // ── Both inputs available ─────────────────────────────────────────────────
  // Extract φ_d scalar (type-safe: isHoldupUsable guarantees phi is non-null)
  const phiResult = holdupResult as KH1995HoldupResult & { phi: number };
  const phi_d = phiResult.phi;
  const d32_m = (d32Result as D32Result & { d32_m: number }).d32_m;

  // ── Guard 3: physical admissibility of φ_d ───────────────────────────────
  if (phi_d <= 0 || phi_d >= 1) {
    return {
      a_m2_m3: null,
      status: 'physically_invalid',
      phi_d_used: phi_d,
      d32_m_used: d32_m,
      d32EngineerSupplied: d32Result.mode === 'engineer_supplied',
      label: null,
      blockingReasons: [`φ_d = ${phi_d} is outside (0, 1) — physically inadmissible. Not clamped.`],
      diagnostics,
      provenance: 'a = 6·φ_d/d₃₂ not computed — φ_d physical admissibility guard failed.',
    };
  }

  // ── Guard 4: physical admissibility of d₃₂ ──────────────────────────────
  if (d32_m <= 0) {
    return {
      a_m2_m3: null,
      status: 'physically_invalid',
      phi_d_used: phi_d,
      d32_m_used: d32_m,
      d32EngineerSupplied: d32Result.mode === 'engineer_supplied',
      label: null,
      blockingReasons: [`d₃₂ = ${d32_m} m is not > 0 — physically inadmissible. Not clamped.`],
      diagnostics,
      provenance: 'a = 6·φ_d/d₃₂ not computed — d₃₂ physical admissibility guard failed.',
    };
  }

  // ── Compute a ─────────────────────────────────────────────────────────────
  const a = (6 * phi_d) / d32_m;

  // Diagnostics and status
  const isEngineerD32 = d32Result.mode === 'engineer_supplied';
  const isExtrapolatedHoldup = holdupResult.status === 'calculated_extrapolated';

  if (isExtrapolatedHoldup) {
    diagnostics.push(
      `φ_d was computed in extrapolated range (holdup status: 'calculated_extrapolated'). ` +
      'The interfacial area result carries the same extrapolation caveat.'
    );
  }
  if (isEngineerD32) {
    diagnostics.push(
      `d₃₂ = ${(d32_m * 1000).toFixed(3)} mm was engineer-supplied (not from published correlation). ` +
      'All downstream outputs computed from this a carry the engineer-supplied basis label.'
    );
  }

  // Plausibility advisory for a
  if (a < 10) {
    diagnostics.push(
      `ADVISORY: a = ${a.toFixed(1)} m²/m³ is very low. Typical Kühni extraction columns: 50–500 m²/m³. ` +
      'Check φ_d and d₃₂ values.'
    );
  }
  if (a > 2000) {
    diagnostics.push(
      `ADVISORY: a = ${a.toFixed(0)} m²/m³ is very high. Typical Kühni extraction columns: 50–500 m²/m³. ` +
      'Check φ_d and d₃₂ values.'
    );
  }

  const status: InterfacialAreaStatus = isEngineerD32
    ? 'calculated_engineer_d32'
    : 'calculated';

  const label = isEngineerD32
    ? 'Interfacial Area — Engineer-Supplied d₃₂ Basis (Simulator Development / Sensitivity)'
    : 'Interfacial Area — Published Correlation Basis (K&H 1995 holdup)';

  return {
    a_m2_m3: a,
    status,
    phi_d_used: phi_d,
    d32_m_used: d32_m,
    d32EngineerSupplied: isEngineerD32,
    label,
    blockingReasons: [],
    diagnostics,
    provenance:
      `a = 6·φ_d/d₃₂ = 6 × ${phi_d.toFixed(4)} / ${(d32_m * 1000).toFixed(3)}mm ` +
      `= ${a.toFixed(1)} m²/m³. ` +
      `φ_d source: K&H 1995 (ecr2_holdup_kh1995, ${holdupResult.status}). ` +
      `d₃₂ source: ${isEngineerD32
        ? `engineer-supplied (${d32Result.engineerSource?.sourceType ?? 'unspecified'})`
        : 'published correlation'}. ` +
      'Formula: Laitinen (2019) Eq. (9) / standard drop-population model. ' +
      'Dimensional check: a [m²/m³] = 6·[—]/[m] ✓.',
  };
}

// ── Slip velocity (usable as soon as φ_d is available, does NOT need d₃₂) ─

/**
 * Compute interphase slip velocity U_slip (m/s).
 *
 * U_slip = u_d / φ_d  +  u_c / (1 − φ_d)
 *
 * This quantity depends only on φ_d and the superficial velocities — it does
 * NOT require d₃₂. It is needed for the drop Reynolds number Re_d once d₃₂
 * is available.
 *
 * @param u_d_m_s   Dispersed-phase (RRBO) superficial velocity (m/s).
 * @param u_c_m_s   Continuous-phase (NMP) superficial velocity (m/s).
 * @param phi_d     Dispersed-phase holdup (—). Must be in (0, 1).
 * @returns         Slip velocity (m/s), or null if guards fail.
 */
export function computeSlipVelocity(
  u_d_m_s: number,
  u_c_m_s: number,
  phi_d: number,
): { U_slip_m_s: number; provenance: string } | { U_slip_m_s: null; reason: string } {
  if (phi_d <= 0 || phi_d >= 1) {
    return { U_slip_m_s: null, reason: `φ_d = ${phi_d} is outside (0, 1) — slip velocity not computed.` };
  }
  if (!Number.isFinite(u_d_m_s) || u_d_m_s < 0) {
    return { U_slip_m_s: null, reason: 'u_d must be a non-negative finite number (m/s).' };
  }
  if (!Number.isFinite(u_c_m_s) || u_c_m_s < 0) {
    return { U_slip_m_s: null, reason: 'u_c must be a non-negative finite number (m/s).' };
  }
  const U_slip = u_d_m_s / phi_d + u_c_m_s / (1 - phi_d);
  return {
    U_slip_m_s: U_slip,
    provenance: `U_slip = u_d/φ_d + u_c/(1−φ_d) = ${u_d_m_s.toExponential(3)}/${phi_d.toFixed(4)} + ${u_c_m_s.toExponential(3)}/${(1-phi_d).toFixed(4)} = ${U_slip.toExponential(4)} m/s.`,
  };
}
