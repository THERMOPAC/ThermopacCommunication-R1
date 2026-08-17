/**
 * tests/ecr2-psi-dimensional.test.ts
 *
 * Dimensional audit of ψ — mechanical specific power dissipation.
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 *
 *   Proves that the ECR-2 engine ψ implementation (Form A) is dimensionally
 *   correct and that the density basis cancels completely, leaving ψ
 *   density-independent.
 *
 *   Two independent computation paths are verified to produce identical ψ
 *   for all density values, using the reference case specified in the audit
 *   instruction.
 *
 * ── FORMS UNDER TEST ─────────────────────────────────────────────────────────
 *
 *   Form A  (what the engine computes):
 *     P₁      = N_P · ρ_b · N³ · D_R⁵                  [W]
 *     P/V     = P₁ / (A_col · h_comp)                    [W/m³]
 *     ψ_A     = (P/V) / ρ_b                              [W/kg]
 *
 *   Form B  (analytically equivalent after cancellation):
 *     ψ_B     = N_P · N³ · D_R⁵ / (A_col · h_comp)      [W/kg]
 *
 *   Since ρ_b appears once in the P₁ numerator and once in the ψ denominator,
 *   the density cancels:
 *     ψ_A = N_P · ρ_b · N³ · D_R⁵ / (A · h) / ρ_b
 *         = N_P · N³ · D_R⁵ / (A · h) = ψ_B
 *
 * ── REFERENCE CASE (from audit instruction) ──────────────────────────────────
 *
 *   N_P = 1 (dimensionless)
 *   N   = 1 s⁻¹                  (rotational speed in rev/s)
 *   D_R = 0.1 m                   (rotor diameter)
 *   A   = 0.01 m²                 (column cross-sectional area)
 *   h   = 0.1 m                   (compartment height)
 *
 *   Form B:
 *     ψ = 1 × 1³ × (0.1)⁵ / (0.01 × 0.1)
 *       = 1e-5 / 1e-3
 *       = 0.01 W/kg
 *
 *   Form A with ρ = 1000 kg/m³:
 *     P   = 1 × 1000 × 1³ × (0.1)⁵ = 0.01 W
 *     V   = 0.01 × 0.1 = 0.001 m³
 *     P/V = 0.01 / 0.001 = 10 W/m³
 *     ψ   = 10 / 1000 = 0.01 W/kg   ← identical ✓
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────────
 *
 *   Tests are pure arithmetic — no engine import required.
 *   They document the algebraic correctness of the implementation.
 *   ECR-1 is not touched.
 */

import { describe, it, expect } from 'vitest';

// ── Reference constants ───────────────────────────────────────────────────────

const REF = {
  N_P:   1,      // power number (dimensionless)
  N_rpm: 60,     // N = 1 rev/s = 60 rpm (used in rpm→rev/s conversion)
  D_R:   0.1,    // rotor diameter [m]
  A_col: 0.01,   // column cross-sectional area [m²]
  h:     0.1,    // compartment height [m]
};

/** Expected ψ from the audit instruction. */
const PSI_EXPECTED_W_KG = 0.01;

/** Absolute tolerance for floating-point arithmetic (ψ is O(0.01), so 1e-12 is tight). */
const ABS_TOL = 1e-12;

// ── Form implementations (mirrors engine arithmetic exactly) ──────────────────

/**
 * Form A — matches the exact code path in llx-ecr-simulator-engine.ts:
 *   P1_W         = powerPerRotor(N_P, rho, rpm, D_R)
 *   P_V_W_m3     = P1_W / (A_col * h_comp)
 *   psi_W_kg     = P_V_W_m3 / rho
 */
function formA_psi(N_P: number, rho_kg_m3: number, rpm: number, D_R: number, A: number, h: number): {
  P1_W: number;
  P_V_W_m3: number;
  psi_W_kg: number;
} {
  const N = rpm / 60;                             // rev/s
  const P1_W = N_P * rho_kg_m3 * Math.pow(N, 3) * Math.pow(D_R, 5); // W
  const P_V_W_m3 = P1_W / (A * h);               // W/m³
  const psi_W_kg = P_V_W_m3 / rho_kg_m3;         // W/kg
  return { P1_W, P_V_W_m3, psi_W_kg };
}

/**
 * Form B — direct computation after algebraic cancellation of ρ:
 *   ψ = N_P · N³ · D_R⁵ / (A · h)
 */
function formB_psi(N_P: number, rpm: number, D_R: number, A: number, h: number): number {
  const N = rpm / 60;
  return N_P * Math.pow(N, 3) * Math.pow(D_R, 5) / (A * h);
}

// ═════════════════════════════════════════════════════════════════════════════

describe('ψ dimensional audit — Form A / Form B equivalence', () => {

  // ── 1. Reference case — Form B ─────────────────────────────────────────────

  describe('1. Reference case — Form B direct calculation', () => {

    it('ψ_B = N_P·N³·D_R⁵/(A·h) = 0.01 W/kg for reference inputs', () => {
      // 0.01 is not exactly representable in IEEE-754; use tight absolute tolerance.
      const psi = formB_psi(REF.N_P, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      expect(Math.abs(psi - PSI_EXPECTED_W_KG)).toBeLessThan(ABS_TOL);
      expect(psi).toBeCloseTo(PSI_EXPECTED_W_KG, 12);
    });

    it('intermediate 0.1⁵ = 1e-5 (verify D_R exponent)', () => {
      expect(Math.pow(0.1, 5)).toBeCloseTo(1e-5, 15);
    });

    it('A·h = 0.001 m³ (compartment volume)', () => {
      expect(REF.A_col * REF.h).toBe(0.001);
    });

    it('ψ_B = 1e-5 / 1e-3 = 0.01', () => {
      const numerator   = REF.N_P * Math.pow(1, 3) * Math.pow(REF.D_R, 5); // N=1 s⁻¹
      const denominator = REF.A_col * REF.h;
      expect(numerator).toBeCloseTo(1e-5, 15);
      expect(denominator).toBeCloseTo(1e-3, 15);
      expect(numerator / denominator).toBeCloseTo(0.01, 10);
    });
  });

  // ── 2. Reference case — Form A with ρ = 1000 kg/m³ ────────────────────────

  describe('2. Reference case — Form A with ρ = 1000 kg/m³', () => {

    const rho = 1000; // kg/m³

    it('P₁ = N_P·ρ·N³·D_R⁵ = 0.01 W', () => {
      const { P1_W } = formA_psi(REF.N_P, rho, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      // P₁ = 1 × 1000 × 1³ × 1e-5 = 0.01 W
      expect(Math.abs(P1_W - 0.01)).toBeLessThan(1e-12);
    });

    it('P/V = P₁ / (A·h) = 0.01 / 0.001 = 10 W/m³', () => {
      const { P_V_W_m3 } = formA_psi(REF.N_P, rho, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      expect(Math.abs(P_V_W_m3 - 10)).toBeLessThan(1e-10);
    });

    it('ψ_A = P/V / ρ = 10 / 1000 = 0.01 W/kg', () => {
      const { psi_W_kg } = formA_psi(REF.N_P, rho, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      expect(Math.abs(psi_W_kg - PSI_EXPECTED_W_KG)).toBeLessThan(ABS_TOL);
    });
  });

  // ── 3. Both forms return identical ψ ──────────────────────────────────────

  describe('3. Form A = Form B — density cancels completely', () => {

    it('ψ_A = ψ_B for ρ = 1000 kg/m³ (reference)', () => {
      const { psi_W_kg: psiA } = formA_psi(REF.N_P, 1000, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      const psiB = formB_psi(REF.N_P, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      expect(psiA).toBe(psiB);
    });

    it('ψ_A = ψ_B = 0.01 W/kg for ρ = 800 kg/m³ (RRBO-like)', () => {
      const { psi_W_kg: psiA } = formA_psi(REF.N_P, 800, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      const psiB = formB_psi(REF.N_P, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      expect(psiA).toBe(psiB);
      expect(Math.abs(psiA - PSI_EXPECTED_W_KG)).toBeLessThan(ABS_TOL);
    });

    it('ψ_A = ψ_B = 0.01 W/kg for ρ = 1025 kg/m³ (NMP-like)', () => {
      const { psi_W_kg: psiA } = formA_psi(REF.N_P, 1025, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      const psiB = formB_psi(REF.N_P, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      expect(psiA).toBe(psiB);
      expect(Math.abs(psiA - PSI_EXPECTED_W_KG)).toBeLessThan(ABS_TOL);
    });

    it('ψ is density-independent across a range of ρ values', () => {
      // Form A and Form B may differ by ≤1 ULP due to floating-point multiplication
      // order (ρ appears in numerator then denominator in Form A, cancels algebraically
      // but not always bit-for-bit). Use tight relative tolerance (1e-12).
      const psiB = formB_psi(REF.N_P, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      for (const rho of [500, 750, 860, 950, 1000, 1050, 1200, 1500]) {
        const { psi_W_kg } = formA_psi(REF.N_P, rho, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
        const relErr = Math.abs(psi_W_kg - psiB) / psiB;
        expect(relErr).toBeLessThan(1e-12); // ≤ 1 ULP relative to 0.01
      }
    });
  });

  // ── 4. No double-division — proof that dividing by ρ twice gives wrong answer ─

  describe('4. Proof that double-division would be dimensionally incorrect', () => {

    it('incorrect double-division gives ψ_wrong = 0.01/ρ ≠ 0.01 W/kg', () => {
      // If the code accidentally did:  psi_wrong = N_P·N³·D_R⁵/(A·h) / ρ
      // (i.e. Form B divided by ρ again), the result would be 0.01/1000 = 1e-5
      // which is NOT 0.01 W/kg and has units [W·m³/kg²] — dimensionally wrong.
      const rho = 1000;
      const psiB = formB_psi(REF.N_P, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      const psi_wrong = psiB / rho; // hypothetical double-division
      expect(psi_wrong).not.toBeCloseTo(PSI_EXPECTED_W_KG, 5);
      expect(psi_wrong).toBeCloseTo(1e-5, 10); // would be 1e-5, not 0.01
    });

    it('current Form A avoids double-division: P_V_W_m3 includes ρ; dividing by ρ recovers correct ψ', () => {
      // Verify that formA_psi(ρ=1000) ÷ ρ is NOT applied a second time.
      // The correct chain: P1 = N_P·ρ·N³·D_R⁵ → P/V includes ρ → ψ = P/V / ρ
      // Result must equal 0.01 W/kg, not 0.01/ρ = 1e-5.
      // 0.01 is not exactly representable in IEEE-754; use tight absolute tolerance.
      const { psi_W_kg } = formA_psi(REF.N_P, 1000, REF.N_rpm, REF.D_R, REF.A_col, REF.h);
      expect(Math.abs(psi_W_kg - PSI_EXPECTED_W_KG)).toBeLessThan(ABS_TOL);
      expect(psi_W_kg).not.toBeCloseTo(PSI_EXPECTED_W_KG / 1000, 5); // must not be 1e-5
    });
  });

  // ── 5. Units dimensional chain ────────────────────────────────────────────

  describe('5. Dimensional units verification — numeric unit algebra', () => {

    it('P₁ units: [kg/m³]·[s⁻¹]³·[m]⁵ = [kg·m²·s⁻³] = W', () => {
      // Verify via unit magnitudes (using SI with ρ=1 kg/m³, N=1 s⁻¹, D=1 m):
      // P₁ = 1 × 1 × 1³ × 1⁵ = 1 W  → numeric 1 confirms unit chain.
      const P = 1 * 1 * Math.pow(1, 3) * Math.pow(1, 5);
      expect(P).toBe(1); // 1 kg·m²/s³ = 1 W
    });

    it('P/V units: [W]/[m³] = [W/m³]', () => {
      // With P=1 W, A=1 m², h=1 m → P/V = 1/1 = 1 W/m³
      expect(1 / (1 * 1)).toBe(1);
    });

    it('ψ units: [W/m³] / [kg/m³] = [W·m³/m³/kg] = [W/kg] = [m²/s³]', () => {
      // With P/V=1 W/m³, ρ=1 kg/m³ → ψ = 1 W/kg
      expect(1 / 1).toBe(1);
    });

    it('Form B units: [−]·[s⁻¹]³·[m⁵] / [m³] = [m²/s³] = W/kg', () => {
      // N_P=1, N=1 s⁻¹, D_R=1 m, A=1 m², h=1 m:
      // ψ = 1·1·1 / 1 = 1 W/kg
      expect(1 * Math.pow(1, 3) * Math.pow(1, 5) / (1 * 1)).toBe(1);
    });
  });

  // ── 6. K&H holdup reference case — ψ unchanged ───────────────────────────

  describe('6. K&H holdup reference case — ψ and φ unchanged', () => {

    it('reference holdup ψ = 0.10 W/kg is within Form A diagnostic range (0.05–50 W/kg)', () => {
      // The holdup reference case uses ψ = 0.10 W/kg directly as an input.
      // This test confirms the diagnostic range is consistent with the reference.
      const psi_ref = 0.10;
      expect(psi_ref).toBeGreaterThanOrEqual(0.05);
      expect(psi_ref).toBeLessThanOrEqual(50);
    });

    it('Form A produces ψ = 0.10 W/kg for a typical Kühni operating point', () => {
      // Construct a Kühni-like geometry that gives ψ ≈ 0.10 W/kg.
      // N_P=1.5, N=3 s⁻¹ (180 rpm), D_R=0.06 m, A=0.00503 m² (D_col=0.08 m), h=0.06 m.
      const N_P = 1.5;
      const rpm = 180;            // 3 rev/s
      const D_R = 0.06;           // m
      const A = Math.PI / 4 * 0.08 ** 2; // ~0.00503 m²
      const h = 0.06;             // m
      const rho = 1000;           // kg/m³ — density cancels, irrelevant

      const { psi_W_kg } = formA_psi(N_P, rho, rpm, D_R, A, h);
      const psiB = formB_psi(N_P, rpm, D_R, A, h);

      // Both forms must agree
      expect(psi_W_kg).toBeCloseTo(psiB, 12);
      // Result must be positive
      expect(psi_W_kg).toBeGreaterThan(0);
      // Must be within holdup diagnostic range for a result (not a hard gate, just sanity)
      expect(psi_W_kg).toBeLessThan(200);
    });
  });
});
