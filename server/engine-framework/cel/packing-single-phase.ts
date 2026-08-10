// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Single-Phase Frictional Pressure Drop Through Structured Packing
//
// Source paper (controlled copy: attached_assets/packing_pressure_drop_
// prediction_at_low_operating_pressure_1786082640830.pdf):
//   M. Duss, "Packing pressure drop prediction at low operating pressure:
//   Is there anything new?", Distillation Topical Conference, AIChE Spring
//   Meeting, San Antonio, Texas, April 2013 (Sulzer Chemtech Ltd.).
// Underlying experimental basis for the critical Reynolds numbers:
//   M. Zogg, "Strömungs- und Stoffaustauschuntersuchungen an der
//   Sulzer-Gewebepackung", Diss. Nr. 4886, ETH Zürich, 1972.
//
// GOVERNANCE (binding):
//  • ONLY equations explicitly published in the paper are implemented:
//      EQ2/EQ6  Δp/Δz = c_f · ρ · u_s² / (2·d_h)  =  c_f · F_v² / (2·d_h)
//      EQ3      d_h = 4 / a
//      EQ4      Re  = u_s · ρ · d_h / η
//      EQ5      F_v = u_s · √ρ
//      EQ1      Fanning laminar PIPE relation f = 16/Re (Re < 2300) — kept as a
//               REFERENCE RELATION ONLY. It is NEVER used as a packing friction
//               factor: the paper's own data (Zogg) show packing c_f in the
//               laminar regime is an order of magnitude HIGHER than 16/Re, so
//               using the pipe relation would drastically under-predict Δp —
//               exactly the failure mode the paper warns against.
//  • The paper publishes NO packing c_f(Re) correlation equation. Software
//    outputs tabulated in the paper (Sulcol/DRP/"Vendor X" values) are vendor
//    software results and are EXCLUDED by project directive. Therefore a
//    packing friction factor must come from a source-tagged PerformanceBasis
//    (vendor / measured / controlled-literature data) — it is never invented.
//  • Published critical Reynolds numbers (experimental, Zogg via Duss):
//      corrugation angle φ = 45° (Y-type): Re_crit ≈ 250
//      corrugation angle φ = 30° (X-type): Re_crit ≈ 450
//    These are the ONLY published anchors; no interpolation over angle is
//    performed and no fully-turbulent (constant-c_f) upper bound is published.
//  • The paper's validation basis is GAS-phase flow in gas/liquid distillation
//    packing. Application to any liquid phase (LLX continuous phase) is an
//    ANALOG outside the paper's validated envelope and must be classified
//    accordingly by the calling engine.
// ═══════════════════════════════════════════════════════════════════════════════

import { assertPositive, assertNonNegative } from './utilities';

export const DUSS_2013_CITATION =
  'M. Duss, "Packing pressure drop prediction at low operating pressure: Is there anything new?", Distillation Topical Conference, AIChE Spring Meeting, San Antonio, Texas, April 2013 (Sulzer Chemtech Ltd.)';
export const ZOGG_1972_CITATION =
  'M. Zogg, "Strömungs- und Stoffaustauschuntersuchungen an der Sulzer-Gewebepackung", Diss. Nr. 4886, ETH Zürich, 1972 (cited via Duss 2013)';

/** Published experimental critical Reynolds numbers by corrugation angle (° from vertical). */
export const PUBLISHED_CRITICAL_REYNOLDS: Record<number, { reCrit: number; label: string }> = {
  45: { reCrit: 250, label: 'Y-type structured packing, corrugation angle 45° (Re_crit ≈ 250)' },
  30: { reCrit: 450, label: 'X-type structured packing, corrugation angle 30° (Re_crit ≈ 450)' },
};
/** Lowest published critical Reynolds number — a phase Reynolds number below this
 *  is laminar under EVERY published anchor (bounding argument, not interpolation). */
export const MIN_PUBLISHED_CRITICAL_REYNOLDS = 250;

/** DUSS2013-EQ3 (Zogg definition): hydraulic diameter of packing d_h = 4/a.
 *  @param specificSurfaceArea m²/m³ → m */
export function packingHydraulicDiameter(specificSurfaceArea: number): number {
  assertPositive(specificSurfaceArea, 'specificSurfaceArea');
  return 4 / specificSurfaceArea;
}

/** DUSS2013-EQ5: gas/phase load factor F_v = u_s·√ρ.
 *  @param superficialVelocity m/s @param density kg/m³ → Pa^0.5 */
export function phaseLoadFactor(superficialVelocity: number, density: number): number {
  assertNonNegative(superficialVelocity, 'superficialVelocity');
  assertPositive(density, 'density');
  return superficialVelocity * Math.sqrt(density);
}

/** DUSS2013-EQ4: phase Reynolds number Re = u_s·ρ·d_h/η (superficial-velocity basis, per Zogg).
 *  @param superficialVelocity m/s @param density kg/m³ @param hydraulicDiameter m @param dynamicViscosity Pa·s → – */
export function packingPhaseReynolds(superficialVelocity: number, density: number, hydraulicDiameter: number, dynamicViscosity: number): number {
  assertNonNegative(superficialVelocity, 'superficialVelocity');
  assertPositive(density, 'density');
  assertPositive(hydraulicDiameter, 'hydraulicDiameter');
  assertPositive(dynamicViscosity, 'dynamicViscosity');
  return (superficialVelocity * density * hydraulicDiameter) / dynamicViscosity;
}

/** DUSS2013-EQ1 — REFERENCE RELATION ONLY (hydraulically smooth PIPE, laminar):
 *  Fanning f = 16/Re, valid Re < 2300. NEVER a packing friction factor — packing
 *  laminar c_f is experimentally an order of magnitude higher (Zogg via Duss). */
export function fanningLaminarPipeReference(re: number): { value: number; applicabilityNote: string } {
  assertPositive(re, 'Reynolds number');
  return {
    value: 16 / re,
    applicabilityNote: 'Fanning laminar PIPE relation f = 16/Re (Re < 2300) — reference/comparison only; NOT applicable as a packing friction factor (packing laminar c_f is experimentally far higher — Zogg via Duss 2013).',
  };
}

/** DUSS2013-EQ2/EQ6: dry (single-phase frictional) pressure drop per unit height
 *  Δp/Δz = c_f · ρ · u_s² / (2·d_h)  [Pa/m]. Identical to c_f·F_v²/(2·d_h). */
export function dryPackingPressureDropPerLength(frictionFactor: number, hydraulicDiameter: number, density: number, superficialVelocity: number): number {
  assertPositive(frictionFactor, 'frictionFactor');
  assertPositive(hydraulicDiameter, 'hydraulicDiameter');
  assertPositive(density, 'density');
  assertNonNegative(superficialVelocity, 'superficialVelocity');
  return (frictionFactor * density * superficialVelocity * superficialVelocity) / (2 * hydraulicDiameter);
}

/** DUSS2013-EQ2 rearranged (the paper's quantitative verification procedure, step d):
 *  back-calculated friction factor c_f = 2·(Δp/Δz)·d_h / (ρ·u_s²). */
export function backCalculatedFrictionFactor(pressureDropPerLength: number, hydraulicDiameter: number, density: number, superficialVelocity: number): number {
  assertPositive(pressureDropPerLength, 'pressureDropPerLength');
  assertPositive(hydraulicDiameter, 'hydraulicDiameter');
  assertPositive(density, 'density');
  assertPositive(superficialVelocity, 'superficialVelocity');
  return (2 * pressureDropPerLength * hydraulicDiameter) / (density * superficialVelocity * superficialVelocity);
}

export interface PackingFlowRegimeResult {
  regime: 'Laminar' | 'Transition/Turbulent' | 'Not Determinable';
  criticalReynolds: number | null;
  basis: string;
}

/**
 * Flow-regime classification against the PUBLISHED critical Reynolds numbers.
 *  • Tagged corrugation angle equal to a published anchor (45° or 30°) → direct
 *    comparison against that anchor's Re_crit.
 *  • Angle unknown/unpublished BUT Re < 250 (the lowest published anchor) →
 *    'Laminar' by bounding argument (laminar under every published anchor).
 *  • Otherwise → 'Not Determinable' (no interpolation over angle; the paper
 *    publishes no other anchors and no fully-turbulent upper bound).
 */
// ── Governed Re–cf datasets — Duss 2013 Table 2 / Zogg 1972 ──────────────────
//
// GOVERNANCE UPDATE (approved):
//   A two-level distinction applies to Sulcol-generated values:
//   (1) Sulcol used as a live hydraulic DESIGN TOOL → PROHIBITED by project directive.
//       Vendor-software outputs generated at design time may not be cited or used.
//   (2) Sulcol-computed values REPRODUCED in a published, peer-reviewed conference paper
//       (Duss 2013, AIChE Spring Meeting) → PERMITTED as controlled-literature data
//       when cited with full provenance and explicit agreement-with-Zogg annotation.
//   The datasets below fall under category (2). For the 30°/X-type case, Duss 2013
//   explicitly states full agreement with Zogg 1972 experimental data. For the 45°/Y-type
//   case, Duss 2013 states agreement in the laminar regime (Re < 250); in the turbulent
//   regime Sulcol underpredicts for metal sheet (lower roughness vs wire gauze).
//
// INTERPOLATION: piecewise linear, WITHIN published range only.
// OUT-OF-RANGE POLICY:
//   Re < tableMin → "Outside Tabulated Range — cf not directly supported by Table 2."
//     A boundary minimum ΔP estimate (cf at tableMin) is provided as an indicative
//     LOWER BOUND only — NOT design ΔP. Do not use for column sizing.
//   Re > tableMax → "Outside Tabulated Range." No extrapolation rule is approved.
// ─────────────────────────────────────────────────────────────────────────────

export interface Duss2013ReCfPoint { re: number; cf: number; }

export interface Duss2013DatasetRecord {
  id: string;
  corrugationAngle_deg: number;
  corrugationType: 'Y' | 'X';
  nominalSpecificSurface_m2_m3: number;
  nominalHydraulicDiameter_m: number;
  reCrit: number;
  reCritBasis: string;
  tableMin: number;
  tableMax: number;
  points: Duss2013ReCfPoint[];
  sourceDocuments: string[];
  governanceNote: string;
}

/**
 * Duss 2013 Table 2 — 45° Y-type, a ≈ 250 m²/m³, d_h = 0.016 m, Re_crit = 250.
 * Sulcol V3.0.8 values for MellapakPlus 252.Y. Duss 2013: "agreement is good in the
 * laminar regime"; turbulent cf is underpredicted for metal sheet (lower roughness).
 */
export const DUSS2013_TABLE2_45Y: Duss2013DatasetRecord = {
  id: 'duss2013-table2-45y',
  corrugationAngle_deg: 45,
  corrugationType: 'Y',
  nominalSpecificSurface_m2_m3: 250,
  nominalHydraulicDiameter_m: 4 / 250,
  reCrit: 250,
  reCritBasis: 'Zogg 1972 experimental, cited in Duss 2013 §"Interpretation of Results"',
  tableMin: 143,
  tableMax: 7144,
  points: [
    { re: 143,  cf: 1.34 },
    { re: 226,  cf: 1.06 },
    { re: 320,  cf: 0.90 },
    { re: 453,  cf: 0.83 },
    { re: 714,  cf: 0.75 },
    { re: 1011, cf: 0.71 },
    { re: 1429, cf: 0.67 },
    { re: 2264, cf: 0.65 },
    { re: 3197, cf: 0.64 },
    { re: 4527, cf: 0.63 },
    { re: 7144, cf: 0.63 },
  ],
  sourceDocuments: [DUSS_2013_CITATION, ZOGG_1972_CITATION],
  governanceNote:
    'Values from Sulcol V3.0.8 for MellapakPlus 252.Y, reproduced in Table 2 of Duss 2013 (AIChE Spring Meeting, San Antonio, April 2013). ' +
    'Duss states agreement with Zogg 1972 experimental data in the laminar regime (Re < Re_crit = 250). ' +
    'In the turbulent regime Sulcol underpredicts for metal sheet packing (lower roughness vs wire gauze). ' +
    'Used as controlled-literature tabulated data within [143, 7144]. No extrapolation rule is approved outside this range.',
};

/**
 * Duss 2013 Table 2 — 30° X-type, a ≈ 500 m²/m³, d_h = 0.008 m, Re_crit = 450.
 * Sulcol V3.0.8 values for Sulzer BXPlus. Duss 2013 states FULL agreement with
 * Zogg 1972 experimental data for wire gauze X-type packing.
 */
export const DUSS2013_TABLE2_30X: Duss2013DatasetRecord = {
  id: 'duss2013-table2-30x',
  corrugationAngle_deg: 30,
  corrugationType: 'X',
  nominalSpecificSurface_m2_m3: 500,
  nominalHydraulicDiameter_m: 4 / 500,
  reCrit: 450,
  reCritBasis: 'Zogg 1972 experimental, cited in Duss 2013 §"Interpretation of Results" — full agreement confirmed for wire gauze',
  tableMin: 71,
  tableMax: 3572,
  points: [
    { re: 71,   cf: 1.54 },
    { re: 113,  cf: 1.06 },
    { re: 160,  cf: 0.82 },
    { re: 226,  cf: 0.65 },
    { re: 357,  cf: 0.50 },
    { re: 505,  cf: 0.43 },
    { re: 714,  cf: 0.37 },
    { re: 1132, cf: 0.33 },
    { re: 1599, cf: 0.30 },
    { re: 2264, cf: 0.29 },
    { re: 3572, cf: 0.27 },
  ],
  sourceDocuments: [DUSS_2013_CITATION, ZOGG_1972_CITATION],
  governanceNote:
    'Values from Sulcol V3.0.8 for Sulzer BXPlus, reproduced in Table 2 of Duss 2013. ' +
    'Duss explicitly states full agreement with Zogg 1972 experimental data for wire gauze X-type packing. ' +
    'Used as controlled-literature tabulated data within [71, 3572]. No extrapolation rule is approved outside this range.',
};

/** Registry of governed Duss 2013 datasets keyed by corrugation angle (°). */
export const DUSS2013_DATASETS: Record<number, Duss2013DatasetRecord> = {
  45: DUSS2013_TABLE2_45Y,
  30: DUSS2013_TABLE2_30X,
};

export interface Duss2013ReCfEvalResult {
  status: 'interpolated' | 'below_range' | 'above_range';
  /** Interpolated cf — populated only when status === 'interpolated'. */
  cf: number | null;
  /** Boundary minimum data — populated only when status === 'below_range'. NOT a design value. */
  boundaryMinimum?: { cfAtBoundary: number; boundaryRe: number };
  note: string;
}

/**
 * Evaluate c_f at a given Re from a Duss 2013 governed dataset.
 *
 * Within [tableMin, tableMax]: piecewise linear interpolation.
 * Re < tableMin: status = 'below_range', cf = null, boundaryMinimum provided.
 *   The boundary minimum ΔP estimate MUST be labelled "NOT design ΔP" — it is a
 *   conservative lower bound only. Do NOT use for column sizing acceptance/rejection.
 * Re > tableMax: status = 'above_range', cf = null.
 *   No governed extrapolation rule is approved above the published range.
 */
export function evaluateDuss2013ReCf(re: number, dataset: Duss2013DatasetRecord): Duss2013ReCfEvalResult {
  assertPositive(re, 'Reynolds number for Duss 2013 cf lookup');
  const { points, tableMin, tableMax } = dataset;

  if (re < tableMin) {
    return {
      status: 'below_range',
      cf: null,
      boundaryMinimum: { cfAtBoundary: points[0].cf, boundaryRe: points[0].re },
      note:
        `Outside Tabulated Range — cf not directly supported by Table 2. ` +
        `Re = ${re.toExponential(4)} is below the published dataset minimum Re = ${tableMin}. ` +
        `No governed extrapolation rule is approved for Re below ${tableMin}. ` +
        `A published-boundary minimum ΔP estimate is provided using cf = ${points[0].cf} at Re_min = ${tableMin} — ` +
        `this is NOT design ΔP; actual cf is expected to be higher at Re = ${re.toExponential(4)} (Zogg 1972 Figure 2 shows cf increasing with decreasing Re in the laminar regime).`,
    };
  }

  if (re > tableMax) {
    return {
      status: 'above_range',
      cf: null,
      note:
        `Outside Tabulated Range — cf not directly supported by Table 2. ` +
        `Re = ${re.toExponential(4)} exceeds the published dataset maximum Re = ${tableMax}. ` +
        `No governed extrapolation rule is approved above the published range.`,
    };
  }

  // Within range — piecewise linear interpolation
  for (let i = 1; i < points.length; i++) {
    if (re <= points[i].re) {
      const frac = (re - points[i - 1].re) / (points[i].re - points[i - 1].re);
      const cf = points[i - 1].cf + frac * (points[i].cf - points[i - 1].cf);
      return {
        status: 'interpolated',
        cf,
        note:
          `Piecewise linear interpolation between ` +
          `(Re = ${points[i - 1].re}, cf = ${points[i - 1].cf}) and (Re = ${points[i].re}, cf = ${points[i].cf}). ` +
          `Source: ${dataset.sourceDocuments.join('; ')}.`,
      };
    }
  }
  // Edge: exactly at tableMax
  return {
    status: 'interpolated',
    cf: points[points.length - 1].cf,
    note: `At published dataset maximum Re = ${tableMax}, cf = ${points[points.length - 1].cf}. Source: ${dataset.sourceDocuments.join('; ')}.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export function classifyPackingFlowRegime(re: number, corrugationAngleDeg?: number): PackingFlowRegimeResult {
  assertPositive(re, 'Reynolds number');
  const anchor = corrugationAngleDeg !== undefined ? PUBLISHED_CRITICAL_REYNOLDS[corrugationAngleDeg] : undefined;
  if (anchor) {
    return re < anchor.reCrit
      ? { regime: 'Laminar', criticalReynolds: anchor.reCrit, basis: `Re = ${re.toPrecision(4)} < Re_crit ≈ ${anchor.reCrit} (${anchor.label}; experimental, Zogg via Duss 2013)` }
      : { regime: 'Transition/Turbulent', criticalReynolds: anchor.reCrit, basis: `Re = ${re.toPrecision(4)} ≥ Re_crit ≈ ${anchor.reCrit} (${anchor.label}). The fully-turbulent constant-friction-factor bound is NOT published in the source — laminar behaviour is excluded, but transition vs fully turbulent cannot be distinguished from published data.` };
  }
  if (re < MIN_PUBLISHED_CRITICAL_REYNOLDS) {
    return { regime: 'Laminar', criticalReynolds: null, basis: `Re = ${re.toPrecision(4)} is below the LOWEST published critical Reynolds number (Re_crit ≈ 250 at φ = 45°; Re_crit ≈ 450 at φ = 30° — Zogg via Duss 2013): laminar under every published anchor (bounding argument — no corrugation-angle datum in the packing record, none interpolated).` };
  }
  return { regime: 'Not Determinable', criticalReynolds: null, basis: `Re = ${re.toPrecision(4)} is at or above the lowest published critical Reynolds number (≈ 250) and the packing record carries no source-tagged corrugation angle matching a published anchor (45° or 30°) — regime cannot be determined without inventing an anchor.` };
}
