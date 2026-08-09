// ═══════════════════════════════════════════════════════════════════════════════
// V&V — ECP-009/ECP-010 (Duss 2013 single-phase frictional framework) equation
// register seed for engine llx-ecp (v1.1.0).
//
// Source discipline: every statement/citation transcribed from the governing
// Engineering Correlation Register (server/engine-framework/CORRELATION-REGISTER.md,
// §9 Stage C4, ECP-009/ECP-010) and the controlled source paper:
//   M. Duss, "Packing pressure drop prediction at low operating pressure:
//   Is there anything new?", Distillation Topical Conference, AIChE Spring
//   Meeting, San Antonio, Texas, April 2013 (Sulzer Chemtech Ltd.)
//   [controlled copy in attached_assets/].
//   Critical Reynolds numbers: M. Zogg, Diss. Nr. 4886, ETH Zürich, 1972 (via Duss).
//
// Idempotent: ON CONFLICT (engine_id, equation_ref) DO NOTHING.
// Run: npx tsx server/vv/seed-duss2013-equation-register.ts
// ═══════════════════════════════════════════════════════════════════════════════
import pg from 'pg';

const DUSS = 'M. Duss, "Packing pressure drop prediction at low operating pressure: Is there anything new?", Distillation Topical Conference, AIChE Spring Meeting, San Antonio, Texas, April 2013 (Sulzer Chemtech Ltd.)';
const ZOGG = 'M. Zogg, "Strömungs- und Stoffaustauschuntersuchungen an der Sulzer-Gewebepackung", Diss. Nr. 4886, ETH Zürich, 1972 (cited via Duss 2013)';
const REG = 'Engineering Correlation Register (server/engine-framework/CORRELATION-REGISTER.md), §9 Stage C4';

interface Entry { ref: string; statement: string; citation: string; unitsNote: string; rangeNote: string }

const ENTRIES: Entry[] = [
  {
    ref: 'ECP-009-DH',
    statement: 'Hydraulic diameter of packing: d_h = 4/a (Zogg definition). Specific area a from the source-tagged packing record only.',
    citation: `eq. (3), ${DUSS}; original definition ${ZOGG}; ${REG} ECP-009`,
    unitsNote: 'a in m²/m³; d_h in m',
    rangeNote: 'Geometric definition; carries the classification of the specific-surface-area datum (Assumed ⇒ Pending Validation).',
  },
  {
    ref: 'ECP-009-US',
    statement: 'Continuous-phase superficial velocity: u_s = L_c/3600 with L_c the per-diameter continuous-phase load (ECP-001) in m³/(m²·h).',
    citation: `Superficial-velocity definition consistent with the Re evaluation basis of ${DUSS}; ${REG} ECP-009`,
    unitsNote: 'm/s',
    rangeNote: 'Definition; valid whenever ECP-001 loads are calculable.',
  },
  {
    ref: 'ECP-009-RE',
    statement: 'Phase Reynolds number on the SUPERFICIAL-velocity basis: Re = u_s·ρ·d_h/η (as evaluated by Zogg and adopted by Duss).',
    citation: `eq. (4), ${DUSS}; evaluation basis ${ZOGG}; ${REG} ECP-009`,
    unitsNote: 'u_s m/s; ρ kg/m³; d_h m; η Pa·s; Re dimensionless',
    rangeNote: 'Definition. Continuous-phase properties: RRBO entered source-tagged data or NMP EPD data — never invented.',
  },
  {
    ref: 'ECP-009-FV',
    statement: 'Load factor (F-factor analog): F_v = u_s·√ρ, applied to the continuous liquid phase.',
    citation: `eq. (5), ${DUSS}; ${REG} ECP-009`,
    unitsNote: 'Pa^0.5',
    rangeNote: 'Published gas-load-factor definition applied as a liquid-phase analog (outside the paper\'s gas-phase basis — preliminary only).',
  },
  {
    ref: 'ECP-009-FREF',
    statement: 'Fanning laminar PIPE friction factor f = 16/Re (Re < 2300) — REFERENCE RELATION ONLY, never used as a packing friction factor: packing laminar c_f is experimentally about an order of magnitude higher (Zogg).',
    citation: `eq. (1), ${DUSS} (L. F. Moody, Trans. ASME 66 (1944) 671); ${REG} ECP-009`,
    unitsNote: 'dimensionless',
    rangeNote: 'Hydraulically smooth pipes, laminar (Re < 2300). Explicitly NOT applicable to packing — comparison anchor only.',
  },
  {
    ref: 'ECP-009-REGIME',
    statement: 'Flow-regime classification against PUBLISHED experimental critical Reynolds numbers only: corrugation angle 45° (Y-type) ⇒ Re_crit ≈ 250; 30° (X-type) ⇒ Re_crit ≈ 450. Angle absent and Re < 250 ⇒ Laminar by bounding argument (below the lowest published anchor); otherwise Not Determinable — no interpolation over angle, no invented anchors.',
    citation: `${ZOGG}; reported in ${DUSS}; ${REG} ECP-009`,
    unitsNote: 'dimensionless',
    rangeNote: 'Anchors measured on Sulzer gauze packing (a = 500 m²/m³), gas phase. Applicability to LLX liquid-liquid duty Pending Validation.',
  },
  {
    ref: 'ECP-009-CF',
    statement: 'Packing friction factor c_f: exclusively from a source-tagged packing frictionFactorData basis (constant with applicability note, or curve vs phaseReynoldsNumber — interpolation only). The source paper publishes NO packing c_f(Re) correlation equation; its tabulated c_f values are vendor-software outputs (excluded by project directive). Missing basis ⇒ Not Calculable + NO_PACKING_FRICTION_FACTOR_DATA.',
    citation: `${DUSS} (framework); ${REG} ECP-009 (data-gating rule)`,
    unitsNote: 'dimensionless',
    rangeNote: 'Data-gated; extrapolation outside the tagged basis range refused.',
  },
  {
    ref: 'ECP-009-DP',
    statement: 'Dry (single-phase frictional) pressure drop: Δp/Δz = c_f·ρ·u_s²/(2·d_h) = c_f·F_v²/(2·d_h); Δp_total = (Δp/Δz)·H_pack (ECP-005). Continuous phase only, below the loading point (dry-bed analog). Never substitutes the vendor WET basis (ECP-007).',
    citation: `eqs. (2)/(6), ${DUSS}; ${REG} ECP-009`,
    unitsNote: 'Pa/m; Pa',
    rangeNote: 'ALWAYS classified "Preliminary Pressure Drop Prediction — Pending RRBO/NMP Validation": the paper\'s validated envelope is gas-phase gas/liquid distillation packing — LLX liquid-liquid duty is outside it.',
  },
  {
    ref: 'ECP-010-CFVERIF',
    statement: 'Verification (paper procedure steps a–f): back-calculated friction factor c_f = 2·(Δp/Δz)·d_h/(ρ·u_s²) from a calculable specific pressure drop (vendor WET basis when present) at the computed Re, compared against published friction-factor relationships for the tagged corrugation angle; f = 16/Re reported as comparison anchor only. No calculable Δp/Δz ⇒ Not Calculable with explicit reason.',
    citation: `eq. (2) rearranged, verification procedure of ${DUSS}; ${REG} ECP-010`,
    unitsNote: 'dimensionless',
    rangeNote: 'Data-gated; Pending Validation when computed.',
  },
  {
    ref: 'ECP-010-RANGE',
    statement: 'Mandatory validated-range statement: the source\'s friction-factor relationships and critical Reynolds numbers were established for GAS-phase flow in counter-current gas/liquid structured packing. The LLX liquid-liquid column operates OUTSIDE this validated range; the framework applies as a preliminary physics-based analog only.',
    citation: `${DUSS} (validation basis); ${REG} ECP-010 (governance rule)`,
    unitsNote: 'n/a (governance statement)',
    rangeNote: 'Governance rule — emitted verbatim on every run; never removed by data entry.',
  },
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let inserted = 0, skipped = 0;
    for (const e of ENTRIES) {
      const res = await pool.query(
        `INSERT INTO vv_equation_register (engine_id, equation_ref, statement, source_citation, units_note, valid_range_note, evidence)
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)
         ON CONFLICT (engine_id, equation_ref) DO NOTHING`,
        ['llx-ecp', e.ref, e.statement, e.citation, e.unitsNote, e.rangeNote],
      );
      if (res.rowCount === 1) { inserted++; console.log(`  + llx-ecp:${e.ref}`); }
      else { skipped++; console.log(`  = llx-ecp:${e.ref} (exists, untouched)`); }
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped}.`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
