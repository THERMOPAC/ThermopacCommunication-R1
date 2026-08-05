// ═══════════════════════════════════════════════════════════════════════════════
// EPD — NMP (N-Methyl-2-pyrrolidone), liquid phase, 1 atm — LIBRARY fluid
//
// Per correlation-governance rules: NO fitted general correlation is
// implemented for NMP until exact vendor/literature data points and fitted
// coefficients are presented for review. Until then NMP uses SOURCE-TAGGED
// TABULAR INTERPOLATION. Points tagged 'Assumed' are provisional and emit
// EPD_ASSUMED_VALUE warnings — they require replacement with Thermopac-
// approved vendor or measured data.
// ═══════════════════════════════════════════════════════════════════════════════

import type { FluidDefinition } from '../types';

const CRC = 'CRC Handbook of Chemistry and Physics, 97th ed., CRC Press (2016) — 1-methyl-2-pyrrolidinone entry';
const JASPER = 'J. J. Jasper, "The Surface Tension of Pure Liquid Compounds", J. Phys. Chem. Ref. Data, Vol. 1 (1972)';
const PROVISIONAL = 'Provisional estimate pending Thermopac-approved vendor data — replace before release-grade use';

export const nmp: FluidDefinition = {
  id: 'nmp',
  name: 'NMP (N-Methyl-2-pyrrolidone)',
  casNumber: '872-50-4',
  properties: {
    density: {
      correlation: {
        type: 'tabular-C',
        points: [
          { tC: 25, value: 1028, sourceType: 'Literature', sourceReference: `${CRC}: d = 1.028 g/cm³ at 25 °C` },
          { tC: 80, value: 977, sourceType: 'Assumed', sourceReference: PROVISIONAL },
        ],
      },
      validRangeC: { min: 20, max: 80 },
      equationUnits: 'tabular, T in °C → ρ in kg/m³ (linear interpolation)',
      citation: {
        title: 'Source-tagged tabular data (no fitted correlation approved yet)',
        organization: 'CRC Press / provisional',
        year: 2016,
      },
    },
    dynamicViscosity: {
      correlation: {
        type: 'tabular-C',
        points: [
          { tC: 25, value: 1.666e-3, sourceType: 'Literature', sourceReference: `${CRC}: η = 1.666 mPa·s at 25 °C` },
          { tC: 80, value: 0.75e-3, sourceType: 'Assumed', sourceReference: PROVISIONAL },
        ],
      },
      validRangeC: { min: 20, max: 80 },
      equationUnits: 'tabular, T in °C → μ in Pa·s (linear interpolation)',
      citation: {
        title: 'Source-tagged tabular data (no fitted correlation approved yet)',
        organization: 'CRC Press / provisional',
        year: 2016,
        notes: 'Linear interpolation over-estimates μ between points versus the true exponential trend — acceptable for screening only.',
      },
    },
    surfaceTension: {
      correlation: {
        type: 'tabular-C',
        points: [
          { tC: 25, value: 0.0407, sourceType: 'Literature', sourceReference: `${JASPER}: σ ≈ 40.7 mN/m at 25 °C` },
          { tC: 80, value: 0.0352, sourceType: 'Assumed', sourceReference: PROVISIONAL },
        ],
      },
      validRangeC: { min: 20, max: 80 },
      equationUnits: 'tabular, T in °C → σ in N/m (linear interpolation)',
      citation: {
        title: 'Source-tagged tabular data (no fitted correlation approved yet)',
        organization: 'Jasper (1972) / provisional',
        year: 1972,
      },
    },
  },
  notes:
    'NMP is fully water-miscible. Interfacial tension against project fluids must be engineer-entered on the project fluid (source-tagged) — no library defaults.',
};
