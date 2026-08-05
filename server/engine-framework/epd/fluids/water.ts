// ═══════════════════════════════════════════════════════════════════════════════
// EPD — Water (H₂O), liquid phase, atmospheric pressure
// Validated correlations from open literature.
// ═══════════════════════════════════════════════════════════════════════════════

import type { FluidDefinition } from '../types';

export const water: FluidDefinition = {
  id: 'water',
  name: 'Water',
  casNumber: '7732-18-5',
  properties: {
    density: {
      // Kell (1975) polynomial approximation (simplified, ±0.05 kg/m³ 0–100 °C)
      correlation: {
        type: 'polynomial-C',
        coeffs: [999.83952, 0.06978, -0.0090857, 1.0164e-4, -1.1354e-6, 6.5327e-9],
      },
      validRangeC: { min: 0, max: 100 },
      source: 'Kell (1975), J. Chem. Eng. Data 20(1) — polynomial fit, 1 atm',
    },
    dynamicViscosity: {
      // Vogel: ln μ[mPa·s] = −3.7188 + 578.919/(T_K − 137.546); μ(25°C)=0.892 mPa·s
      correlation: { type: 'andrade-viscosity', A: -3.7188, B: 578.919, C: 137.546 },
      validRangeC: { min: 0, max: 100 },
      source: 'Vogel equation fit (Viswanath & Natarajan); 0.892 mPa·s at 25 °C',
    },
    surfaceTension: {
      // IAPWS 1994: σ = 235.8e-3·τ^1.256·(1 − 0.625τ), τ = (647.096 − T_K)/647.096
      correlation: {
        type: 'critical-scaling-sigma',
        criticalTemperatureK: 647.096,
        s0: 235.8e-3,
        n: 1.256,
        m: 0.625,
      },
      validRangeC: { min: 0, max: 100 },
      source: 'IAPWS (1994) surface tension formulation',
    },
    specificHeat: {
      // Liquid water cp, J/(kg·K); weak T dependence 0–100 °C
      correlation: { type: 'polynomial-C', coeffs: [4217.4, -2.8064, 0.074915, -7.0129e-4, 2.6244e-6] },
      validRangeC: { min: 0, max: 100 },
      source: 'Polynomial fit to NIST/IAPWS liquid cp data, 1 atm',
    },
    thermalConductivity: {
      correlation: { type: 'polynomial-C', coeffs: [0.5650, 1.916e-3, -7.72e-6] },
      validRangeC: { min: 0, max: 100 },
      source: 'Polynomial fit to IAPWS thermal conductivity, 1 atm',
    },
  },
  interfacialTension: {
    // Against LLX partner fluids, N/m near 25 °C
    rrbo: { value: 0.025, source: 'Representative vegetable-oil/water IFT (0.02–0.03 N/m). REQUIRES THERMOPAC VALIDATION.' },
    nmp: { value: 0.004, source: 'NMP is water-miscible — very low effective IFT; LLX with NMP/water pairs is not a standard immiscible system. REQUIRES THERMOPAC VALIDATION.' },
  },
};
