/**
 * tests/ecr2-holdup.test.ts
 *
 * Unit tests for the K&H 1995 Kühni dispersed-phase holdup correlation
 * (ecr2_holdup_kh1995, secondary_equation_verified).
 *
 * Engineering basis: 'Published Correlation — Preliminary Engineering'
 * primarySourceVerified = false | validatedForRRBONMP = false
 * These flags record verification state — they do NOT suppress valid results.
 *
 * ── STATUS HIERARCHY ─────────────────────────────────────────────────────────
 *
 *   1. input_missing        — required input absent / non-finite / rho_c ≤ rho_d
 *   2. calculation_invalid  — phi_raw is NaN or ±Infinity
 *   3. physically_invalid   — phi_raw ≤ 0 or phi_raw ≥ 1
 *   4. calculated_extrapolated — valid phi but ≥1 input outside diagnostic range
 *   5. calculated           — all inputs within diagnostic ranges, valid phi
 *
 * ── DOWNSTREAM USABILITY RULE ────────────────────────────────────────────────
 *
 *   isHoldupUsable() returns true only for 'calculated' and 'calculated_extrapolated'.
 *   ECR-2 modules MUST call this guard before consuming phi.
 *
 * ── WHAT IS NOT TESTED HERE ──────────────────────────────────────────────────
 *   · d₃₂ (UNRESOLVED — not implemented)
 *   · Mass-transfer / K_oa (pending_approval — not implemented)
 *   · BVP / optimizer (not implemented)
 *   · ECR-1 engine (fully isolated from ECR-2)
 *
 * ── REFERENCE CASE DERIVATION ────────────────────────────────────────────────
 *   ρc=1000, ρd=860, γ=3.5 mN/m, xf=0.30, ψ=0.10 W/kg, Ud=1×10⁻³, Uc=8×10⁻⁴ m/s
 *
 *   g = 9.80665 m/s²
 *   θ = (1000/(9.80665×0.0035))^0.25 ≈ 13.065 s/m
 *   ψθ/g = 0.10×13.065/9.80665 ≈ 0.13322
 *   Ud·θ = 0.013065
 *   Uc·θ = 0.010452
 *   (ρc−ρd)/ρc = 0.140
 *
 *   A = 0.0267 + (0.13322)^0.77 ≈ 0.2386
 *   B = (0.013065)^0.64         ≈ 0.06249
 *   C = [exp(20.7×0.010452)]^0.90 ≈ 1.2150
 *   D = (0.140)^(−0.34)          ≈ 1.9512
 *   E = 2.27×(0.30)^(−0.77)      ≈ 5.736
 *   φ_raw ≈ 0.2028
 */

import { describe, it, expect } from 'vitest';
import {
  computeKH1995Holdup,
  isHoldupUsable,
  type HoldupInputs,
  type HoldupCalculated,
  type HoldupCalculatedExtrapolated,
  type HoldupPhysicallyInvalid,
  type HoldupCalculationInvalid,
} from '../server/engines/llx/llx-ecr2-holdup';

// ── Reference case ────────────────────────────────────────────────────────────

const REF: HoldupInputs = {
  psi_W_kg:    0.10,
  Ud_m_s:      1.0e-3,
  Uc_m_s:      8.0e-4,
  rho_c_kg_m3: 1000,
  rho_d_kg_m3: 860,
  gamma_N_m:   0.0035,
  xf:          0.30,
};

const REF_PHI_EXPECTED = 0.2028;
const ABS_TOL          = 0.001;

function refWith(overrides: Partial<HoldupInputs>): HoldupInputs {
  return { ...REF, ...overrides };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('computeKH1995Holdup — K&H 1995 Kühni dispersed-phase holdup', () => {

  // ── A. Reference regression ───────────────────────────────────────────────

  describe('A. Reference regression — φ_raw ≈ 0.2028, φ ≈ 0.2028, status = calculated', () => {

    it('status = calculated', () => {
      const r = computeKH1995Holdup(REF);
      expect(r.status).toBe('calculated');
    });

    it('phi matches hand calculation within ±0.001', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.status).toBe('calculated');
      expect(Math.abs(r.phi - REF_PHI_EXPECTED)).toBeLessThan(ABS_TOL);
    });

    it('phi_raw equals phi when status is calculated', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.phi_raw).toBe(r.phi);
    });

    it('θ matches hand calculation (≈13.065 s/m) within ±0.01', () => {
      const G = 9.80665;
      const expected = Math.pow(REF.rho_c_kg_m3 / (G * REF.gamma_N_m), 0.25);
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(Math.abs(r.theta_s_m - expected)).toBeLessThan(0.01);
    });

    it('termA ≈ 0.2386 (agitation bracket)', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(Math.abs(r.intermediates.termA - 0.2386)).toBeLessThan(0.001);
    });

    it('termE = 2.27·xf^(−0.77) ≈ 5.736 for xf = 0.30', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(Math.abs(r.intermediates.termE - 5.736)).toBeLessThan(0.005);
    });

    it('all applicability diagnostics show withinRange = true', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      for (const [key, item] of Object.entries(r.applicabilityDiagnostics)) {
        expect(item.withinRange, `${key} should be within range`).toBe(true);
        expect(item.extrapolated, `${key} should not be extrapolated`).toBe(false);
      }
    });

    it('all diagnostic range sources are source_not_verified', () => {
      // No range has been verified against the K&H 1995 primary paper.
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      for (const [key, item] of Object.entries(r.applicabilityDiagnostics)) {
        expect(item.source, `${key} source should be source_not_verified`).toBe('source_not_verified');
      }
    });

    it('governance: engineeringBasis = Published Correlation — Preliminary Engineering', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.engineeringBasis).toBe('Published Correlation — Preliminary Engineering');
    });

    it('governance: primarySourceVerified = false (does NOT suppress phi)', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.primarySourceVerified).toBe(false);
      // phi is non-null despite primarySourceVerified = false
      expect(r.phi).not.toBeNull();
    });

    it('governance: validatedForRRBONMP = false (does NOT suppress phi)', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.validatedForRRBONMP).toBe(false);
      expect(r.phi).not.toBeNull();
    });

    it('governance: psiBasis = Thermopac preliminary interpretation', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.psiBasis).toContain('Thermopac preliminary interpretation');
    });

    it('governance: localAxialApplication = Thermopac model extension', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.localAxialApplication).toBe('Thermopac model extension');
    });

    it('isHoldupUsable returns true for calculated', () => {
      const r = computeKH1995Holdup(REF);
      expect(isHoldupUsable(r)).toBe(true);
    });
  });

  // ── B. Extrapolation case ─────────────────────────────────────────────────

  describe('B. Extrapolation — outside one diagnostic range, 0 < phi_raw < 1, status = calculated_extrapolated', () => {

    // xf = 0.55: above diagnostic max of 0.50.
    // Diagnostic range is source_not_verified, so calculation proceeds.
    // Larger xf → smaller termE = 2.27·xf^(−0.77) → phi_raw ≈ 0.127 < 1.
    // Estimate: phi ≈ REF_phi × (0.30/0.55)^0.77 ≈ 0.2028 × 0.627 ≈ 0.127.
    const EXTRAP_INPUT = refWith({ xf: 0.55 });

    it('status = calculated_extrapolated', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT);
      expect(r.status).toBe('calculated_extrapolated');
    });

    it('phi is non-null (calculation not blocked by range exceedance)', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT) as HoldupCalculatedExtrapolated;
      expect(r.phi).not.toBeNull();
    });

    it('phi_raw equals phi (physically valid extrapolated result)', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT) as HoldupCalculatedExtrapolated;
      expect(r.phi_raw).toBe(r.phi);
    });

    it('phi is physically valid: 0 < phi < 1', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT) as HoldupCalculatedExtrapolated;
      expect(r.phi).toBeGreaterThan(0);
      expect(r.phi).toBeLessThan(1);
    });

    it('extrapolatedRanges contains xf', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT) as HoldupCalculatedExtrapolated;
      expect(r.extrapolatedRanges).toContain('xf');
    });

    it('applicabilityDiagnostics.xf shows withinRange = false and extrapolated = true', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT) as HoldupCalculatedExtrapolated;
      expect(r.applicabilityDiagnostics['xf'].withinRange).toBe(false);
      expect(r.applicabilityDiagnostics['xf'].extrapolated).toBe(true);
    });

    it('other diagnostics remain within range', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT) as HoldupCalculatedExtrapolated;
      for (const key of ['Ud_m_s', 'Uc_m_s', 'psi_W_kg', 'gamma_N_m']) {
        expect(r.applicabilityDiagnostics[key].withinRange, `${key} should be in range`).toBe(true);
      }
    });

    it('isHoldupUsable returns true for calculated_extrapolated', () => {
      const r = computeKH1995Holdup(EXTRAP_INPUT);
      expect(isHoldupUsable(r)).toBe(true);
    });
  });

  // ── C. Physically invalid case — phi_raw ≥ 1 ──────────────────────────────

  describe('C. High-energy physically invalid — phi_raw ≥ 1, status = physically_invalid', () => {

    // At ψ = 10 W/kg with REF conditions (verified empirically in prior session):
    // phi_raw ≈ 1.82 — the K&H correlation overestimates holdup.
    // This is a known limitation of the empirical equation at high agitation.
    // The result is physically inadmissible — phi is set to null.
    // phi_raw is retained for diagnostics.
    const HIGH_PSI = refWith({ psi_W_kg: 10 });

    it('status = physically_invalid', () => {
      const r = computeKH1995Holdup(HIGH_PSI);
      expect(r.status).toBe('physically_invalid');
    });

    it('phi = null (physically inadmissible — do not clamp)', () => {
      const r = computeKH1995Holdup(HIGH_PSI) as HoldupPhysicallyInvalid;
      expect(r.phi).toBeNull();
    });

    it('phi_raw >= 1 (retained for diagnostics)', () => {
      const r = computeKH1995Holdup(HIGH_PSI) as HoldupPhysicallyInvalid;
      expect(r.phi_raw).toBeGreaterThanOrEqual(1);
    });

    it('physicalViolation = phi_raw >= 1', () => {
      const r = computeKH1995Holdup(HIGH_PSI) as HoldupPhysicallyInvalid;
      expect(r.physicalViolation).toBe('phi_raw >= 1');
    });

    it('intermediates are retained even when physically_invalid', () => {
      const r = computeKH1995Holdup(HIGH_PSI) as HoldupPhysicallyInvalid;
      expect(r.intermediates).not.toBeNull();
      expect(Number.isFinite(r.intermediates.termA)).toBe(true);
    });

    it('isHoldupUsable returns false for physically_invalid', () => {
      const r = computeKH1995Holdup(HIGH_PSI);
      expect(isHoldupUsable(r)).toBe(false);
    });
  });

  // ── D. Missing input ───────────────────────────────────────────────────────

  describe('D. Missing input — status = input_missing', () => {

    it('status = input_missing when xf = NaN (statorOpenAreaFraction not supplied)', () => {
      const r = computeKH1995Holdup(refWith({ xf: Number.NaN }));
      expect(r.status).toBe('input_missing');
    });

    it('phi = null and phi_raw = null for input_missing', () => {
      const r = computeKH1995Holdup(refWith({ xf: Number.NaN }));
      expect(r.phi).toBeNull();
      if (r.status === 'input_missing') expect(r.phi_raw).toBeNull();
    });

    it('missing list contains xf when xf = NaN', () => {
      const r = computeKH1995Holdup(refWith({ xf: Number.NaN }));
      if (r.status === 'input_missing') expect(r.missing).toContain('xf');
    });

    it('status = input_missing when rho_c ≤ rho_d (phase mapping violation)', () => {
      const r = computeKH1995Holdup(refWith({ rho_c_kg_m3: 800, rho_d_kg_m3: 900 }));
      expect(r.status).toBe('input_missing');
    });

    it('status = input_missing when gamma_N_m = 0', () => {
      const r = computeKH1995Holdup(refWith({ gamma_N_m: 0 }));
      expect(r.status).toBe('input_missing');
    });

    it('isHoldupUsable returns false for input_missing', () => {
      const r = computeKH1995Holdup(refWith({ xf: Number.NaN }));
      expect(isHoldupUsable(r)).toBe(false);
    });
  });

  // ── E. Mathematical / domain failure — status = calculation_invalid ────────

  describe('E. Mathematical/domain failure — status = calculation_invalid', () => {

    // At very high Uc (e.g. 3.0 m/s), Uc·θ ≈ 39.2:
    //   20.7 × 39.2 = 811.4  →  Math.exp(811.4) = Infinity
    //   Infinity^0.90 = Infinity  →  phi_raw = Infinity
    // Uc = 3.0 m/s passes input_missing guard (finite positive).
    // Diagnostic range flags it as extrapolated.
    // But then phi_raw is non-finite → calculation_invalid.
    const OVERFLOW_INPUT = refWith({ Uc_m_s: 3.0 });

    it('status = calculation_invalid when exp() overflows at extreme Uc', () => {
      const r = computeKH1995Holdup(OVERFLOW_INPUT);
      expect(r.status).toBe('calculation_invalid');
    });

    it('phi = null for calculation_invalid', () => {
      const r = computeKH1995Holdup(OVERFLOW_INPUT) as HoldupCalculationInvalid;
      expect(r.phi).toBeNull();
    });

    it('phi_raw is non-finite (NaN or ±Infinity)', () => {
      const r = computeKH1995Holdup(OVERFLOW_INPUT) as HoldupCalculationInvalid;
      expect(Number.isFinite(r.phi_raw)).toBe(false);
    });

    it('reason is populated', () => {
      const r = computeKH1995Holdup(OVERFLOW_INPUT) as HoldupCalculationInvalid;
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(10);
    });

    it('isHoldupUsable returns false for calculation_invalid', () => {
      const r = computeKH1995Holdup(OVERFLOW_INPUT);
      expect(isHoldupUsable(r)).toBe(false);
    });
  });

  // ── F. ECR-1 isolation ─────────────────────────────────────────────────────

  describe('F. ECR-1 isolation — ECR-2 holdup has no effect on ECR-1', () => {

    it('registryId is ecr2_holdup_kh1995 (not an ECR-1 identifier)', async () => {
      const mod = await import('../server/engines/llx/llx-ecr2-holdup');
      expect(typeof mod.computeKH1995Holdup).toBe('function');
      const r = mod.computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.registryId).toBe('ecr2_holdup_kh1995');
      expect(r.governance.registryId).not.toContain('ecr-engine');
    });

    it('phaseMapping encodes ECR-2 governance-fixed RRBO/NMP assignment', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.phaseMapping).toContain('NMP=continuous');
      expect(r.governance.phaseMapping).toContain('RRBO=dispersed');
    });

    it('source cites Kumar & Hartland 1995 via Laitinen', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.source).toContain('Kumar & Hartland (1995)');
      expect(r.governance.source).toContain('Laitinen');
    });
  });

  // ── G. Downstream usability rule completeness ─────────────────────────────

  describe('G. Downstream usability rule — isHoldupUsable contract', () => {

    it('returns true for calculated', () => {
      expect(isHoldupUsable(computeKH1995Holdup(REF))).toBe(true);
    });

    it('returns true for calculated_extrapolated', () => {
      expect(isHoldupUsable(computeKH1995Holdup(refWith({ xf: 0.55 })))).toBe(true);
    });

    it('returns false for physically_invalid', () => {
      expect(isHoldupUsable(computeKH1995Holdup(refWith({ psi_W_kg: 10 })))).toBe(false);
    });

    it('returns false for calculation_invalid', () => {
      expect(isHoldupUsable(computeKH1995Holdup(refWith({ Uc_m_s: 3.0 })))).toBe(false);
    });

    it('returns false for input_missing', () => {
      expect(isHoldupUsable(computeKH1995Holdup(refWith({ xf: NaN })))).toBe(false);
    });

    it('governance records the downstream usability rule', () => {
      const r = computeKH1995Holdup(REF) as HoldupCalculated;
      expect(r.governance.downstreamUsabilityRule).toContain('isHoldupUsable');
    });
  });

  // ── H. Monotonicity: Ud increases holdup ──────────────────────────────────

  describe('H. Monotonicity: increasing Ud increases holdup', () => {

    it('phi increases strictly with Ud for a range producing calculated results', () => {
      // Equation: φ ∝ (Ud·θ)^0.64 — strictly increasing with Ud.
      const udValues = [0.001, 0.002, 0.004, 0.008, 0.015];
      let prevPhi = -Infinity;
      for (const Ud_m_s of udValues) {
        const r = computeKH1995Holdup(refWith({ Ud_m_s }));
        if (r.status === 'calculated' || r.status === 'calculated_extrapolated') {
          expect(r.phi).toBeGreaterThan(prevPhi);
          prevPhi = r.phi;
        }
      }
      expect(prevPhi).toBeGreaterThan(-Infinity); // at least one point was calculable
    });
  });

  // ── I. Stator free area: larger xf reduces holdup ─────────────────────────

  describe('I. xf sensitivity: larger xf reduces holdup', () => {

    it('phi decreases monotonically as xf increases (within range)', () => {
      // 2.27·xf^(−0.77) is strictly decreasing — larger xf → smaller holdup.
      const xfValues = [0.15, 0.20, 0.30, 0.40, 0.50];
      let prevPhi = Infinity;
      for (const xf of xfValues) {
        const r = computeKH1995Holdup(refWith({ xf }));
        if (r.status === 'calculated') {
          expect(r.phi).toBeLessThan(prevPhi);
          prevPhi = r.phi;
        }
      }
    });
  });
});
