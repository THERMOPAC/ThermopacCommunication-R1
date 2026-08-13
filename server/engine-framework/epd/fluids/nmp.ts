// ═══════════════════════════════════════════════════════════════════════════════
// EPD — NMP (N-Methyl-2-pyrrolidone), liquid phase, 1 atm — LIBRARY fluid
//
// Per correlation-governance rules: NO fitted general correlation is
// implemented for NMP until exact vendor/literature data points and fitted
// coefficients are presented for review. Until then NMP uses SOURCE-TAGGED
// TABULAR INTERPOLATION. Points tagged 'Assumed' are provisional and emit
// EPD_ASSUMED_VALUE warnings — they require replacement with Thermopac-
// approved vendor or measured data.
//
// DENSITY GOVERNANCE NOTE (current status — Assumed, provisional):
//   Six tabular points (25–70 °C) submitted as "Virgin Base oil – SN300".
//   All points carry sourceType 'Assumed'. This dataset is PROVISIONAL and
//   must be replaced with controlled vendor datasheet or in-house measured
//   data before any LLX design result can be classified screening_complete
//   without assumed-data qualification.
//
//   Action required: submit controlled NMP density data with exact source
//   citation to Thermopac for review. Accepted sources:
//     • NIST WebBook saturated-liquid density table (CAS 872-50-4)
//     • DIPPR Project 801 polynomial correlation parameters
//     • BASF / Ashland / INEOS NMP manufacturer datasheet with ≥ 2 points
//       in the 25–100 °C range
// ═══════════════════════════════════════════════════════════════════════════════

import type { FluidDefinition } from '../types';

const JASPER = 'J. J. Jasper, "The Surface Tension of Pure Liquid Compounds", J. Phys. Chem. Ref. Data, Vol. 1 (1972)';
const CRC = 'CRC Handbook of Chemistry and Physics, 97th ed., CRC Press (2016) — 1-methyl-2-pyrrolidinone entry';
const PROVISIONAL = 'Provisional estimate pending Thermopac-approved vendor data — replace before release-grade use';
const DENSITY_SOURCE = 'Virgin Base oil \u2013 SN300 (Assumed \u2014 provisional; replace with controlled vendor or measured data before release-grade use)';

export const nmp: FluidDefinition = {
  id: 'nmp',
  name: 'NMP (N-Methyl-2-pyrrolidone)',
  casNumber: '872-50-4',
  properties: {
    density: {
      // Six-point tabular model, 25–70 °C. All points carry sourceType Assumed
      // (source: "Virgin Base oil – SN300"). This is PROVISIONAL: replace with
      // a controlled Literature/Vendor correlation before release-grade use.
      // EPD_ASSUMED_VALUE is emitted on every evaluation until replaced.
      // EPD_TEMPERATURE_EXTRAPOLATION is emitted outside [25, 70] °C.
      correlation: {
        type: 'tabular-C',
        points: [
          { tC: 25, value: 1028, sourceType: 'Assumed', sourceReference: DENSITY_SOURCE },
          { tC: 30, value: 1023, sourceType: 'Assumed', sourceReference: DENSITY_SOURCE },
          { tC: 40, value: 1015, sourceType: 'Assumed', sourceReference: DENSITY_SOURCE },
          { tC: 50, value: 1006, sourceType: 'Assumed', sourceReference: DENSITY_SOURCE },
          { tC: 60, value:  997, sourceType: 'Assumed', sourceReference: DENSITY_SOURCE },
          { tC: 70, value:  988, sourceType: 'Assumed', sourceReference: DENSITY_SOURCE },
        ],
      },
      validRangeC: { min: 25, max: 70 },
      equationUnits: 'tabular, T in \u00b0C \u2192 \u03c1 in kg/m\u00b3 (linear interpolation between governing points)',
      citation: {
        title: 'NMP density \u2014 source-tagged tabular data (Assumed, provisional)',
        organization: 'Thermopac (provisional)',
        year: 2026,
        notes:
          'Six tabular points (25\u201370 \u00b0C) submitted as "Virgin Base oil \u2013 SN300". ' +
          'All carry sourceType Assumed. ' +
          'Replace with controlled NIST WebBook, DIPPR Project 801, or manufacturer datasheet data ' +
          'before release-grade use.',
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
