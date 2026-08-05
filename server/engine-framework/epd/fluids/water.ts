// ═══════════════════════════════════════════════════════════════════════════════
// EPD — Water (H₂O), liquid phase, atmospheric pressure — LIBRARY fluid
//
// Level 1 scope: only the properties immediately required by LLX hydraulic
// screening — density, dynamic viscosity, surface tension. No steam/water
// package expansion (specific heat and thermal conductivity deferred until a
// utility-context need arises with exact citable correlations).
// ═══════════════════════════════════════════════════════════════════════════════

import type { FluidDefinition } from '../types';

export const water: FluidDefinition = {
  id: 'water',
  name: 'Water',
  casNumber: '7732-18-5',
  properties: {
    density: {
      // Kell (1975) exact rational form, 1 atm:
      // ρ [kg/m³] = (999.83952 + 16.945176·T − 7.9870401e-3·T² − 46.170461e-6·T³
      //              + 105.56302e-9·T⁴ − 280.54253e-12·T⁵) / (1 + 16.879850e-3·T)
      correlation: {
        type: 'rational-C',
        num: [999.83952, 16.945176, -7.9870401e-3, -46.170461e-6, 105.56302e-9, -280.54253e-12],
        den: [1, 16.879850e-3],
      },
      validRangeC: { min: 0, max: 150 },
      equationUnits: 'T in °C → ρ in kg/m³',
      citation: {
        title: 'Density, Thermal Expansivity, and Compressibility of Liquid Water from 0° to 150 °C',
        organization: 'G. S. Kell, J. Chem. Eng. Data, Vol. 20, No. 1',
        year: 1975,
        notes: 'Exact Kell rational form at 1 atm. Regression checks: 997.047 kg/m³ at 25 °C; 971.79 kg/m³ at 80 °C.',
      },
    },
    dynamicViscosity: {
      // Vogel: ln μ[mPa·s] = −3.7188 + 578.919 / (T[K] − 137.546)
      correlation: { type: 'andrade-viscosity', A: -3.7188, B: 578.919, C: 137.546 },
      validRangeC: { min: 0, max: 100 },
      equationUnits: 'T in K → μ in mPa·s (converted to Pa·s)',
      citation: {
        title: 'Data Book on the Viscosity of Liquids (Vogel-equation parameters for water)',
        organization: 'D. S. Viswanath & G. Natarajan, Hemisphere Publishing',
        year: 1989,
        notes: 'Regression check: 0.892 mPa·s at 25 °C; 0.355 mPa·s at 80 °C.',
      },
    },
    surfaceTension: {
      // IAPWS R1-76(2014): σ[N/m] = 235.8e-3 · τ^1.256 · (1 − 0.625·τ),
      // τ = 1 − T[K]/647.096
      correlation: {
        type: 'critical-scaling-sigma',
        criticalTemperatureK: 647.096,
        B: 235.8e-3,
        mu: 1.256,
        b: -0.625,
      },
      validRangeC: { min: 0.01, max: 100 },
      equationUnits: 'T in K → σ in N/m',
      citation: {
        title: 'IAPWS R1-76(2014): Revised Release on Surface Tension of Ordinary Water Substance',
        organization: 'International Association for the Properties of Water and Steam (IAPWS)',
        year: 2014,
        notes: 'Official IAPWS formulation (valid triple point to critical point; Level 1 range restricted to 0.01–100 °C). Regression check: 71.97 mN/m at 25 °C.',
      },
    },
  },
};
