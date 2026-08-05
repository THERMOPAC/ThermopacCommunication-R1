// ═══════════════════════════════════════════════════════════════════════════════
// EPD — RRBO (Refined Rice Bran Oil) — REPRESENTATIVE vegetable-oil data
//
// ⚠ All correlations below are representative fits from published vegetable-oil
// data (rice bran / rapeseed class). They MUST be validated against Thermopac
// laboratory or plant measurements before release-grade design calculations.
// ═══════════════════════════════════════════════════════════════════════════════

import type { FluidDefinition } from '../types';

export const rrbo: FluidDefinition = {
  id: 'rrbo',
  name: 'RRBO (Refined Rice Bran Oil)',
  properties: {
    density: {
      // ρ = 928 − 0.65·T[°C] → 911.8 kg/m³ at 25 °C
      correlation: { type: 'polynomial-C', coeffs: [928, -0.65] },
      validRangeC: { min: 15, max: 120 },
      source: 'Representative vegetable-oil density fit. REQUIRES THERMOPAC VALIDATION.',
    },
    dynamicViscosity: {
      // Andrade fit: ln μ[mPa·s] = −7.476 + 3487/T[K]
      // μ(25 °C) ≈ 68 mPa·s; μ(80 °C) ≈ 11 mPa·s
      correlation: { type: 'andrade-viscosity', A: -7.476, B: 3487 },
      validRangeC: { min: 15, max: 120 },
      source: 'Andrade fit to 68 mPa·s @25 °C and 11 mPa·s @80 °C (published rice-bran-oil data). REQUIRES THERMOPAC VALIDATION.',
    },
    specificHeat: {
      correlation: { type: 'polynomial-C', coeffs: [1970, 3.0] },
      validRangeC: { min: 15, max: 120 },
      source: 'Representative vegetable-oil cp ≈ 1.97 kJ/(kg·K) at 25 °C. REQUIRES THERMOPAC VALIDATION.',
    },
    thermalConductivity: {
      correlation: { type: 'polynomial-C', coeffs: [0.17, -1.0e-4] },
      validRangeC: { min: 15, max: 120 },
      source: 'Representative vegetable-oil k ≈ 0.17 W/(m·K). REQUIRES THERMOPAC VALIDATION.',
    },
    surfaceTension: {
      correlation: { type: 'polynomial-C', coeffs: [0.0335, -7.0e-5] },
      validRangeC: { min: 15, max: 120 },
      source: 'Representative vegetable-oil σ ≈ 33.5 mN/m vs air. REQUIRES THERMOPAC VALIDATION.',
    },
  },
  interfacialTension: {
    water: { value: 0.025, source: 'Representative vegetable-oil/water IFT. REQUIRES THERMOPAC VALIDATION.' },
    nmp: { value: 0.002, source: 'Representative oil/NMP IFT — very low. REQUIRES THERMOPAC VALIDATION.' },
  },
  notes: 'REPRESENTATIVE DATA — validate all RRBO properties with Thermopac lab measurements before release.',
};
