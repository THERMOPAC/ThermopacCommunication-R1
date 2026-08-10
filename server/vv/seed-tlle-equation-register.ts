// ─────────────────────────────────────────────────────────────────────────────
// V&V equation-register seed — Governed Temperature-Dependent LLE Model
// (NRTL τ(T) = b/T) for engine llx-process-design (C2).
// Idempotent (ON CONFLICT DO NOTHING via upsertEquation) — never overwrites
// recorded evidence.
// Run: npx tsx server/vv/seed-tlle-equation-register.ts
// ─────────────────────────────────────────────────────────────────────────────
import { upsertEquation } from './equation-register-service';

const ENGINE = 'llx-process-design';
const NRTL_CIT = 'H. Renon, J.M. Prausnitz, AIChE J. 14 (1968) 135–144';
const COTO_CIT = 'B. Coto et al., Fluid Phase Equilibria 554 (2022) 113293, Table 3';

const ROWS = [
  {
    equationRef: 'PD-012-NRTL-GAMMA',
    statement: 'NRTL activity coefficients: ln γi = Σj τji Gji xj / Σk Gki xk + Σj [xj Gij / Σk Gkj xk](τij − Σm xm τmj Gmj / Σk Gkj xk), Gij = exp(−α τij), α = 0.2 (liquid–liquid convention).',
    sourceCitation: NRTL_CIT,
    unitsNote: 'dimensionless (mole-fraction basis)',
    validRangeNote: 'Five-pseudo-component NMP/RRBO surrogate system (n-dodecane, 1,4-xylene, 1-methylnaphtalene, pyrene, NMP).',
  },
  {
    equationRef: 'PD-012-NRTL-TAU-T',
    statement: 'Temperature dependence of binary parameters: τij(T) = bij / T (bij = Δgij/R, K) — the canonical NRTL form. bij regressed against the 13 governed xylene-family Coto 2022 tie-lines at 298.15 K (isoactivity fit + flash-based composition refinement). No multi-temperature data admitted yet; the T-dependence beyond 298.15 K is the model form itself, uncalibrated.',
    sourceCitation: `${NRTL_CIT}; parameters regressed against ${COTO_CIT}`,
    unitsNote: 'bij in K; τij dimensionless',
    validRangeNote: 'Calibrated temperature range computed from the calibration registry (currently 298.15 K only). Outside → Temperature Extrapolation — Preliminary / Pending Validation. No hard temperature limits imposed.',
  },
  {
    equationRef: 'PD-012-LLE-FLASH',
    statement: 'Isothermal two-phase LLE flash: successive substitution on Ki = γi(x,T)/γi(y,T) with Rachford–Rice phase-split solution; trivial (single-phase) solutions rejected; non-converged flashes dropped with the exact reason.',
    sourceCitation: 'Standard isoactivity LLE flash formulation; implementation server/engine-framework/cel/llx-temperature-lle-model.ts',
    unitsNote: 'mole fractions',
    validRangeNote: 'Anchor overall compositions are the governed Coto 2022 tie-line midpoints — nothing else is invented. Minimum 4 usable tie-lines required for a governed interpolation family, else fail closed (Temperature-Dependent LLE Model — DEVELOPMENT GAP).',
  },
  {
    equationRef: 'PD-012-REPRODUCTION-GATE',
    statement: 'Model reproduction gate: two-phase flash reproduction of all governed 298.15 K tie-lines vs gate 3·u(x) = 0.009. RECORD (regression 2026-08-10): max |Δx| = 0.092; 2/13 tie-lines within gate — gate NOT met. Consequence: inside the calibrated range the governed EXPERIMENTAL tie-lines are used directly; the NRTL model serves only for temperature extrapolation, always classified Temperature Extrapolation — Preliminary / Pending Validation. Never labelled "temperature-corrected".',
    sourceCitation: `${COTO_CIT}; regression record .agents/outputs/tlle-nrtl-regression.md`,
    unitsNote: 'mole fraction',
    validRangeNote: 'Gate re-evaluated on every re-regression when new datasets are admitted to the calibration registry.',
  },
  {
    equationRef: 'PD-012-CALIBRATION-REGISTRY',
    statement: 'Calibrated temperature range is COMPUTED from the admitted calibration datasets (currently Coto 2022, 298.15 K), never hard-coded. Admitting controlled literature, vendor, pilot, or Thermopac experimental data (with re-regressed parameters) extends the range automatically. Interpolation/extrapolation status, distance outside range, model identity, and validation status are reported on every result — no silent extrapolation.',
    sourceCitation: 'Engineering direction 2026-08-10 (user-selected Extraction Temperature is the governing calculation input)',
    unitsNote: 'K',
    validRangeNote: 'Registry: server/engine-framework/cel/llx-temperature-lle-model.ts TLLE_CALIBRATION_REGISTRY.',
  },
];

async function main() {
  for (const r of ROWS) {
    await upsertEquation({ engineId: ENGINE, ...r });
    console.log(`seeded ${r.equationRef}`);
  }
  console.log('TLLE equation-register seed complete.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
