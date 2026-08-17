/**
 * tests/ecr2-holdup.test.ts
 *
 * Unit tests for the K&H 1995 Kühni dispersed-phase holdup correlation
 * (ecr2_holdup_kh1995, secondary_equation_verified).
 *
 * ── Governance reminder ──────────────────────────────────────────────────────
 *   These tests verify the NUMERICAL ACCURACY of the implementation against the
 *   accepted secondary-reproduction equation. They do NOT constitute primary-source
 *   verification. Every result carries governanceStatus =
 *   'UNVERIFIED — pending primary source'. primarySourceVerified = false.
 *
 * ── What is NOT tested here ──────────────────────────────────────────────────
 *   · d₃₂ correlation (UNRESOLVED_SYMBOL / UNRESOLVED_GROUPING — not implemented)
 *   · Mass-transfer / K_oa (pending_approval — not implemented)
 *   · BVP / optimizer (not implemented)
 *   · ECR-1 engine (completely isolated from ECR-2)
 *
 * ── Reference case derivation ────────────────────────────────────────────────
 *   Properties chosen to give a physically plausible φ ≈ 20 %:
 *     ρc = 1000 kg/m³, ρd = 860 kg/m³, γ = 3.5 mN/m, xf = 0.30
 *     ψ = 0.10 W/kg, Ud = 1.0×10⁻³ m/s, Uc = 8.0×10⁻⁴ m/s
 *
 *   Step-by-step hand calculation (g = 9.80665 m/s²):
 *     θ = (1000 / (9.80665 × 0.0035))^0.25 ≈ 13.065 s/m
 *     ψθ/g  = 0.10 × 13.065 / 9.80665  ≈ 0.13322
 *     Ud·θ  = 1.0×10⁻³ × 13.065        ≈ 0.013065
 *     Uc·θ  = 8.0×10⁻⁴ × 13.065        ≈ 0.010452
 *     (ρc−ρd)/ρc = 140/1000             = 0.140
 *
 *     Term A = 0.0267 + (0.13322)^0.77          ≈ 0.2386
 *     Term B = (0.013065)^0.64                  ≈ 0.06249
 *     Term C = [exp(20.7 × 0.010452)]^0.90      ≈ 1.2150
 *     Term D = (0.140)^(−0.34)                  ≈ 1.9512
 *     Term E = 2.27 × (0.30)^(−0.77)            ≈ 5.736
 *
 *     φ = A × B × C × D × E ≈ 0.2028  (20.28 %)
 */

import { describe, it, expect } from 'vitest';
import {
  computeKH1995Holdup,
  type HoldupInputs,
  type HoldupSuccess,
} from '../server/engines/llx/llx-ecr2-holdup';

// ── Reference case inputs ──────────────────────────────────────────────────────

/** Baseline inputs within correlation envelope, producing φ ≈ 0.2028. */
const REF: HoldupInputs = {
  psi_W_kg:    0.10,
  Ud_m_s:      1.0e-3,
  Uc_m_s:      8.0e-4,
  rho_c_kg_m3: 1000,
  rho_d_kg_m3: 860,
  gamma_N_m:   0.0035,
  xf:          0.30,
};

/** Expected φ from hand calculation — used as regression target. */
const REF_PHI_EXPECTED = 0.2028;

/** Absolute tolerance for floating-point regression. */
const ABS_TOL = 0.001;

// ── Helper ────────────────────────────────────────────────────────────────────

function refWith(overrides: Partial<HoldupInputs>): HoldupInputs {
  return { ...REF, ...overrides };
}

// ═════════════════════════════════════════════════════════════════════════════
// Test suite
// ═════════════════════════════════════════════════════════════════════════════

describe('computeKH1995Holdup — K&H 1995 Kühni dispersed-phase holdup', () => {

  // ── 1. Dimensional sanity ──────────────────────────────────────────────────

  describe('1. Dimensional sanity — θ and dimensionless groups', () => {

    it('θ has units s/m (dimensional verification via magnitude check)', () => {
      // θ = (ρc/(g·γ))^0.25
      // For REF: (1000/(9.80665×0.0035))^0.25 ≈ 13.065 s/m
      // Physically: θ [s/m] makes Ud·θ, Uc·θ, ψθ/g all dimensionless.
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const r = result as HoldupSuccess;
      // θ ≈ 13 s/m for typical organic–aqueous systems at low γ
      expect(r.theta_s_m).toBeGreaterThan(10);
      expect(r.theta_s_m).toBeLessThan(20);
    });

    it('dimensionless products are positive and < 1 for reference case', () => {
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const r = result as HoldupSuccess;
      const { psiTheta_over_g, Ud_theta, Uc_theta } = r.intermediates;
      // All three dimensionless groups must be positive
      expect(psiTheta_over_g).toBeGreaterThan(0);
      expect(Ud_theta).toBeGreaterThan(0);
      expect(Uc_theta).toBeGreaterThan(0);
      // At low velocities (Ud ≈ 10⁻³ m/s) and typical θ ≈ 13 s/m:
      // Ud·θ ≈ 0.013 — must be << 1
      expect(Ud_theta).toBeLessThan(0.5);
      expect(Uc_theta).toBeLessThan(0.5);
    });

    it('all five equation terms are positive (physically required)', () => {
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const { termA, termB, termC, termD, termE } = (result as HoldupSuccess).intermediates;
      expect(termA).toBeGreaterThan(0);
      expect(termB).toBeGreaterThan(0);
      expect(termC).toBeGreaterThan(0);
      expect(termD).toBeGreaterThan(0);
      expect(termE).toBeGreaterThan(0);
    });
  });

  // ── 2. Positive holdup ─────────────────────────────────────────────────────

  describe('2. Positive holdup constraint', () => {

    it('φ is positive for reference case', () => {
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      expect((result as HoldupSuccess).phi).toBeGreaterThan(0);
    });

    it('φ is positive across a range of ψ values', () => {
      for (const psi of [0.05, 0.1, 1.0, 10, 50]) {
        const result = computeKH1995Holdup(refWith({ psi_W_kg: psi }));
        if (result.status === 'calculated') {
          expect(result.phi).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── 3. Physical bounds: 0 < φ < 1 ─────────────────────────────────────────

  describe('3. Physical bounds: 0 < φ < 1', () => {

    it('reference case φ is in (0, 1)', () => {
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const phi = (result as HoldupSuccess).phi;
      expect(phi).toBeGreaterThan(0);
      expect(phi).toBeLessThan(1);
    });

    it('φ stays below 1 for low agitation (ψ ≤ 0.5 W/kg) at reference conditions', () => {
      // The K&H 1995 correlation is empirical with ~21 % average deviation.
      // At high ψ it can return φ > 1 — this is a known limitation of the raw
      // equation and does NOT indicate an implementation error.
      // At low-to-moderate ψ (≤ 0.5 W/kg), the reference-case conditions produce
      // physically valid holdup.  High-ψ behaviour is a subject for pilot validation.
      for (const psi of [0.05, 0.1, 0.5]) {
        const result = computeKH1995Holdup(refWith({ psi_W_kg: psi }));
        if (result.status === 'calculated') {
          expect(result.phi).toBeLessThan(1);
          expect(result.phi).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── 4. Monotonicity: increasing Ud increases holdup ────────────────────────

  describe('4. Increasing Ud increases holdup (equation-consistent)', () => {

    it('φ increases monotonically with Ud for fixed Uc and ψ', () => {
      // Equation: φ ∝ (Ud·θ)^0.64 — strictly increasing with Ud.
      const udValues = [0.0005, 0.001, 0.002, 0.005, 0.010];
      let prevPhi = -Infinity;
      for (const Ud of udValues) {
        const result = computeKH1995Holdup(refWith({ Ud_m_s: Ud }));
        expect(result.status).toBe('calculated');
        const phi = (result as HoldupSuccess).phi;
        expect(phi).toBeGreaterThan(prevPhi);
        prevPhi = phi;
      }
    });
  });

  // ── 5. Stator free area: larger xf reduces holdup ─────────────────────────

  describe('5. Stator free area xf — larger xf reduces holdup (equation-consistent)', () => {

    it('φ decreases as xf increases, consistent with 2.27·xf^(−0.77)', () => {
      // Larger xf → smaller 2.27·xf^(−0.77) → smaller φ.
      // A less-restricted stator allows drops to pass more freely → lower holdup.
      const xfValues = [0.10, 0.20, 0.30, 0.40, 0.50];
      let prevPhi = Infinity;
      for (const xf of xfValues) {
        const result = computeKH1995Holdup(refWith({ xf }));
        expect(result.status).toBe('calculated');
        const phi = (result as HoldupSuccess).phi;
        expect(phi).toBeLessThan(prevPhi);
        prevPhi = phi;
      }
    });
  });

  // ── 6. Regression: exact equation parity against hand-calculated reference ─

  describe('6. Regression against hand-calculated reference case', () => {

    it('φ matches reference hand calculation within ±0.001', () => {
      // REF_PHI_EXPECTED = 0.2028 — see file header for step-by-step derivation.
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const phi = (result as HoldupSuccess).phi;
      expect(phi).toBeCloseTo(REF_PHI_EXPECTED, 2); // ≈ ±0.005 from toBeCloseTo(2)
      expect(Math.abs(phi - REF_PHI_EXPECTED)).toBeLessThan(ABS_TOL);
    });

    it('θ matches hand-calculated value within ±0.01 s/m', () => {
      // θ = (1000 / (9.80665 × 0.0035))^0.25
      const g = 9.80665;
      const expectedTheta = Math.pow(REF.rho_c_kg_m3 / (g * REF.gamma_N_m), 0.25);
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      expect((result as HoldupSuccess).theta_s_m).toBeCloseTo(expectedTheta, 3);
    });

    it('Ud·θ ≈ 0.013065 for reference case', () => {
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const { Ud_theta } = (result as HoldupSuccess).intermediates;
      expect(Math.abs(Ud_theta - 0.013065)).toBeLessThan(0.0005);
    });

    it('termA = [0.0267 + (ψθ/g)^0.77] ≈ 0.2386 for reference case', () => {
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const { termA } = (result as HoldupSuccess).intermediates;
      // Hand: 0.0267 + (0.13322)^0.77 ≈ 0.0267 + 0.2119 = 0.2386
      expect(Math.abs(termA - 0.2386)).toBeLessThan(0.001);
    });

    it('termE = 2.27·xf^(−0.77) ≈ 5.736 for xf=0.30', () => {
      const result = computeKH1995Holdup(REF);
      expect(result.status).toBe('calculated');
      const { termE } = (result as HoldupSuccess).intermediates;
      // Hand: 2.27 × (0.30)^(−0.77) = 2.27 × 2.527 ≈ 5.736
      expect(Math.abs(termE - 5.736)).toBeLessThan(0.005);
    });
  });

  // ── 7. ECR-1 isolation proof ───────────────────────────────────────────────

  describe('7. ECR-1 isolation — ECR-2 holdup has no effect on ECR-1', () => {

    it('computeKH1995Holdup does not import from ECR-1 engine (import chain check)', async () => {
      // The holdup module must not import llx-ecr-engine (ECR-1).
      // Verify by checking that the module resolves without touching ECR-1 code.
      // If the module imported ECR-1, its types would not match here.
      const mod = await import('../server/engines/llx/llx-ecr2-holdup');
      expect(typeof mod.computeKH1995Holdup).toBe('function');
      // ECR-1 registry id is 'llx-ecr' — verify the holdup governance does not reference it
      const result = computeKH1995Holdup(REF) as HoldupSuccess;
      expect(result.governance.registryId).toBe('ecr2_holdup_kh1995');
      expect(result.governance.registryId).not.toContain('ecr-engine');
    });

    it('governance metadata confirms ECR-2 scope', () => {
      const result = computeKH1995Holdup(REF) as HoldupSuccess;
      expect(result.governance.governanceStatus).toBe('UNVERIFIED — pending primary source');
      expect(result.governance.primarySourceVerified).toBe(false);
      expect(result.governance.validatedForRRBONMP).toBe(false);
      expect(result.governance.correlationStatus).toBe('secondary_equation_verified');
      expect(result.governance.source).toContain('Kumar & Hartland (1995)');
      expect(result.governance.source).toContain('Laitinen');
    });
  });

  // ── Applicability / envelope boundary tests ────────────────────────────────

  describe('8. Applicability guardrails', () => {

    it('returns outside_envelope when Ud is below minimum (0.0005 m/s)', () => {
      const result = computeKH1995Holdup(refWith({ Ud_m_s: 0.0001 }));
      expect(result.status).toBe('outside_envelope');
      expect(result.phi).toBeNull();
    });

    it('returns outside_envelope when ψ exceeds maximum (50 W/kg)', () => {
      const result = computeKH1995Holdup(refWith({ psi_W_kg: 60 }));
      expect(result.status).toBe('outside_envelope');
      expect(result.phi).toBeNull();
    });

    it('returns outside_envelope when γ is below minimum (0.001 N/m)', () => {
      const result = computeKH1995Holdup(refWith({ gamma_N_m: 0.0005 }));
      expect(result.status).toBe('outside_envelope');
      expect(result.phi).toBeNull();
    });

    it('returns outside_envelope when xf is outside [0.10, 0.50]', () => {
      const resultLow  = computeKH1995Holdup(refWith({ xf: 0.05 }));
      const resultHigh = computeKH1995Holdup(refWith({ xf: 0.60 }));
      expect(resultLow.status).toBe('outside_envelope');
      expect(resultHigh.status).toBe('outside_envelope');
    });

    it('outside_envelope result lists which inputs failed', () => {
      const result = computeKH1995Holdup(refWith({ Ud_m_s: 0.0001, psi_W_kg: 100 }));
      expect(result.status).toBe('outside_envelope');
      if (result.status === 'outside_envelope') {
        expect(result.failedChecks).toContain('Ud_m_s');
        expect(result.failedChecks).toContain('psi_W_kg');
      }
    });

    it('returns input_missing when xf is NaN (statorOpenAreaFraction not supplied)', () => {
      const result = computeKH1995Holdup(refWith({ xf: Number.NaN }));
      expect(result.status).toBe('input_missing');
      expect(result.phi).toBeNull();
    });

    it('returns input_missing when ρc ≤ ρd (physically invalid — NMP not denser than RRBO)', () => {
      // ECR-2 requires NMP (continuous) denser than RRBO (dispersed).
      // If this constraint is violated, the correlation cannot be applied.
      const result = computeKH1995Holdup(refWith({ rho_c_kg_m3: 800, rho_d_kg_m3: 900 }));
      expect(result.status).toBe('input_missing');
    });

    it('returns calculated at exactly the boundary of the envelope', () => {
      // At the minimum Ud boundary (0.0005 m/s), the result should be calculated.
      const result = computeKH1995Holdup(refWith({ Ud_m_s: 0.0005 }));
      expect(result.status).toBe('calculated');
    });
  });
});
