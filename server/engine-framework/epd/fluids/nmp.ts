// ═══════════════════════════════════════════════════════════════════════════════
// EPD — NMP (N-Methyl-2-pyrrolidone), liquid phase, atmospheric pressure
// ═══════════════════════════════════════════════════════════════════════════════

import type { FluidDefinition } from '../types';

export const nmp: FluidDefinition = {
  id: 'nmp',
  name: 'NMP (N-Methyl-2-pyrrolidone)',
  casNumber: '872-50-4',
  properties: {
    density: {
      // ρ = 1051.4 − 0.936·T[°C]  → 1028.0 kg/m³ at 25 °C (lit. ~1028)
      correlation: { type: 'polynomial-C', coeffs: [1051.4, -0.936] },
      validRangeC: { min: 0, max: 150 },
      source: 'Linear fit to literature density (BASF/Ashland technical data)',
    },
    dynamicViscosity: {
      // Andrade fit: ln μ[mPa·s] = −4.565 + 1510.5/T[K]
      // μ(25 °C) ≈ 1.65 mPa·s; μ(80 °C) ≈ 0.75 mPa·s
      correlation: { type: 'andrade-viscosity', A: -4.565, B: 1510.5 },
      validRangeC: { min: 0, max: 150 },
      source: 'Andrade fit to 1.65 mPa·s @25 °C and 0.75 mPa·s @80 °C (lit. data)',
    },
    specificHeat: {
      correlation: { type: 'polynomial-C', coeffs: [1720, 2.0] },
      validRangeC: { min: 0, max: 150 },
      source: 'Literature cp ≈ 1.72 kJ/(kg·K) at 25 °C with mild T slope',
    },
    thermalConductivity: {
      correlation: { type: 'polynomial-C', coeffs: [0.167, -1.0e-4] },
      validRangeC: { min: 0, max: 150 },
      source: 'Literature k ≈ 0.167 W/(m·K) at 25 °C',
    },
    surfaceTension: {
      correlation: { type: 'polynomial-C', coeffs: [0.0433, -1.0e-4] },
      validRangeC: { min: 0, max: 150 },
      source: 'σ ≈ 40.8 mN/m at 25 °C, slope −0.1 mN/(m·K)',
    },
  },
  interfacialTension: {
    rrbo: { value: 0.002, source: 'Representative oil/NMP IFT — very low (partially miscible solvent-extraction pair). REQUIRES THERMOPAC VALIDATION.' },
    water: { value: 0.004, source: 'NMP is water-miscible — see water entry. REQUIRES THERMOPAC VALIDATION.' },
  },
  notes: 'NMP is fully water-miscible; treat NMP/water only as a pseudo-system with validated plant data.',
};
