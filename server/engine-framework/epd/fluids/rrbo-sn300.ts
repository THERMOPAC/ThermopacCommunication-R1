// ═══════════════════════════════════════════════════════════════════════════════
// EPD — RRBO SN300 (Re-Refined Base Oil, Solvent Neutral 300) — LIBRARY fluid
//
// Density-temperature dataset: 6 tabular points, 25–70 °C, linear interpolation.
// All points carry sourceType 'Assumed' — the submitted source reference is
// "Virgin Base oil – SN300".  This dataset is PROVISIONAL and must be replaced
// with controlled vendor datasheet or in-house measured data before any
// LLX design result can be classified screening_complete without assumed-data
// qualification.
//
// Only the density property is registered here.  All other RRBO properties
// (dynamic viscosity, kinematic viscosity, interfacial tension, etc.) remain
// engineer-entered project-fluid inputs — no library defaults exist for them.
//
// Governance rule for other RRBO grades (SN150, SN500, …):
//   Each grade that participates in LLX design must have its own EPD library
//   fluid file (rrbo-sn150.ts, rrbo-sn500.ts, …) containing a governed
//   tabular density-temperature dataset.  Grades without a library entry cause
//   getProperty() to throw an EngineeringInputError; the run blocks with
//   "Not Calculable" rather than silently falling back to SN300 data.
// ═══════════════════════════════════════════════════════════════════════════════

import type { FluidDefinition } from '../types';

const SOURCE = 'Virgin Base oil \u2013 SN300 (Assumed \u2014 provisional; replace with controlled vendor datasheet or in-house measured data before release-grade use)';

export const rrboSn300: FluidDefinition = {
  id: 'rrbo-sn300',
  name: 'RRBO SN300 (Re-Refined Base Oil, Solvent Neutral 300)',
  properties: {
    density: {
      correlation: {
        type: 'tabular-C',
        points: [
          { tC: 25, value: 878, sourceType: 'Assumed', sourceReference: SOURCE },
          { tC: 30, value: 875, sourceType: 'Assumed', sourceReference: SOURCE },
          { tC: 40, value: 869, sourceType: 'Assumed', sourceReference: SOURCE },
          { tC: 50, value: 862, sourceType: 'Assumed', sourceReference: SOURCE },
          { tC: 60, value: 856, sourceType: 'Assumed', sourceReference: SOURCE },
          { tC: 70, value: 849, sourceType: 'Assumed', sourceReference: SOURCE },
        ],
      },
      validRangeC: { min: 25, max: 70 },
      equationUnits: 'tabular, T in \u00b0C \u2192 \u03c1 in kg/m\u00b3 (linear interpolation between governing points)',
      citation: {
        title: 'RRBO SN300 density \u2014 source-tagged tabular data (Assumed, provisional)',
        organization: 'Thermopac (provisional)',
        year: 2026,
        notes:
          'Six tabular points (25\u201370 \u00b0C) submitted as "Virgin Base oil \u2013 SN300". ' +
          'All carry sourceType Assumed. ' +
          'Replace with controlled vendor datasheet or Thermopac in-house measurement data before release-grade use. ' +
          'For LLX design temperatures outside 25\u201370 \u00b0C, EPD_TEMPERATURE_EXTRAPOLATION is emitted automatically.',
      },
    },
  },
  notes:
    'RRBO SN300 library fluid — density only. ' +
    'Dynamic viscosity, kinematic viscosity, interfacial tension, and all other RRBO properties ' +
    'remain engineer-entered, source-tagged project-fluid inputs in the Fluid Properties workspace.',
};
