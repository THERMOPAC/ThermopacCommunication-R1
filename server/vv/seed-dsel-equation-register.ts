// ═══════════════════════════════════════════════════════════════════════════════
// V&V Phase B — DS-SEL (llx-design-selection) rule register seed
//
// The DS-SEL layer is a deterministic design-SELECTION module: it consumes
// frozen C4/C5 calculation run snapshots and applies governed selection rules
// only — no engine equation is re-implemented. Rules are registered in the
// same V&V equation register so the selection logic is independently
// verifiable. Statements transcribed from the DS-SEL section of the
// Engineering Correlation Register.
//
// Idempotent: ON CONFLICT (engine_id, equation_ref) DO NOTHING.
// Run: npx tsx server/vv/seed-dsel-equation-register.ts
// ═══════════════════════════════════════════════════════════════════════════════
import pg from 'pg';

const REG = 'Engineering Correlation Register (server/engine-framework/CORRELATION-REGISTER.md), DS-SEL section v1.0.0';

interface Entry { ref: string; statement: string; citation: string; unitsNote: string; rangeNote: string }

const DSEL: Entry[] = [
  {
    ref: 'DS-SEL-001',
    statement: 'Calculated minimum diameter: D_min = sqrt(4·Q_max / (π·u_allow·C_basis)), where Q_max is the total both-phase maximum-continuous volumetric flow read from the frozen equipment run snapshot, u_allow is the governed maximum design utilization (fraction), and C_basis is the active flooding capacity basis (DS-SEL-004).',
    citation: `${REG}, DS-SEL-001 — geometric identity (A = π·D²/4 rearranged for the required area Q_max/(u_allow·C_basis))`,
    unitsNote: 'Q_max m³/h; C_basis m³/(m²·h); D_min m', rangeNote: 'Valid for u_allow ∈ (0,1] and C_basis > 0; both are source-tagged inputs, never invented.',
  },
  {
    ref: 'DS-SEL-002',
    statement: 'Practical rounding rule: the calculated minimum diameter is rounded UP to the next 50 mm increment; rounding down is never permitted. If D_min falls exactly on an increment, that increment is used.',
    citation: `${REG}, DS-SEL-002 — approved practical diameter increment series (50 mm), user directive 2026-08-06`,
    unitsNote: 'mm', rangeNote: 'Applies to all technologies; increment series is a governed constant.',
  },
  {
    ref: 'DS-SEL-003',
    statement: 'Hydraulic feasibility and diameter selection: flooding utilization U = L_total/C_basis with L_total read verbatim from the frozen maximum-continuous-case sweep row at the candidate diameter (never recomputed); a candidate is feasible when U ≤ u_allow; the selected diameter is the SMALLEST practical 50 mm increment at or above the rounded minimum that is feasible. Checks without governed data (minimum wetting, distributor range, vendor recommended loading) are skipped-with-notation, never silently passed.',
    citation: `${REG}, DS-SEL-003 — deterministic selection rule`,
    unitsNote: 'L_total, C_basis m³/(m²·h); U dimensionless', rangeNote: 'Candidate diameters restricted to the frozen sweep range; sweep exhaustion ⇒ Not Recommendable, never extrapolated.',
  },
  {
    ref: 'DS-SEL-004',
    statement: 'Capacity-basis hierarchy: engineer-entered validated flooding capacity (Vendor Validated or Pilot Validated, source-referenced) governs when present; otherwise the ECP preliminary screening threshold (upper bound of the Sulzer SMV/SMVP published screening throughput range 35–60 m³/(m²·h)) applies, tagged Assumed — Pending Hydraulic Validation. The packing screening threshold is NOT transferable to ECR: without validated ECR capacity data, ECR has no capacity basis and is Not Recommendable — no value is invented and the C3 generic percentage is not a substitute.',
    citation: `${REG}, DS-SEL-004 — data governance rule; threshold source: Johannes Rauber, Sulzer Chemtech Ltd., AIChE 2006`,
    unitsNote: 'm³/(m²·h)', rangeNote: 'Strict first-match hierarchy; active tier always named on the Engineering Decision Record.',
  },
  {
    ref: 'DS-SEL-005',
    statement: 'Technology selection cascade (deterministic, first differentiator wins): (1) hydraulic feasibility — technologies with a failed run or no feasible diameter are eliminated with the stated reason; (2) direct comparison of the actual calculated flooding margins (1 − U) at each technology\'s selected diameter — greater margin preferred, no tie band; (3) pressure drop, applied ONLY when validated ΔP data exist for all remaining technologies — lower ΔP preferred. If technologies remain technically equivalent after all criteria: "Multiple technically acceptable solutions identified. Engineering review required." — no preference is invented.',
    citation: `${REG}, DS-SEL-005 — deterministic priority cascade, user directive 2026-08-06`,
    unitsNote: 'margins dimensionless; ΔP Pa', rangeNote: 'Confidence level is data-maturity information only and is NEVER used as a tie-breaker.',
  },
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const e of DSEL) {
      await pool.query(
        `INSERT INTO vv_equation_register (engine_id, equation_ref, statement, source_citation, units_note, valid_range_note, evidence)
         VALUES ($1,$2,$3,$4,$5,$6,'{}')
         ON CONFLICT (engine_id, equation_ref) DO NOTHING`,
        ['llx-design-selection', e.ref, e.statement, e.citation, e.unitsNote, e.rangeNote]);
      console.log('seeded', e.ref);
    }
  } finally {
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
