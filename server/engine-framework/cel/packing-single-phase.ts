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
