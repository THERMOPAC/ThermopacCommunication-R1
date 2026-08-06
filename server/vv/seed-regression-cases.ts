/**
 * V&V seed script (run once with npx tsx).
 *
 * Phase A — creates one regression case per engine from the accepted
 * LLX-RND-2026-0001 Rev 0 calculation runs: the frozen input_snapshot becomes
 * the case input, the frozen result_snapshot becomes the expected snapshot.
 * Provenance is the run record itself — this freezes CURRENT accepted engine
 * behaviour (reproducibility baseline), it does not assert engineering truth.
 *
 * Phase B — seeds the Equation Register from the formula references and
 * source strings the engines ALREADY emit in their result snapshots
 * (verbatim). Nothing is invented; entries start with zero evidence pillars.
 */
import { pool } from '../db';

const SEED_RUNS: Array<{ runId: number; engineId: string; moduleType: string; calculationType: string; caseName: string }> = [
  { runId: 22, engineId: 'llx-process-design', moduleType: 'llx', calculationType: 'process_design', caseName: 'LLX-RND-2026-0001-Rev0-baseline' },
  { runId: 58, engineId: 'llx-hydraulics', moduleType: 'llx', calculationType: 'hydraulics_common', caseName: 'LLX-RND-2026-0001-Rev0-baseline' },
  { runId: 63, engineId: 'llx-ecp', moduleType: 'llx', calculationType: 'ecp', caseName: 'LLX-RND-2026-0001-Rev0-baseline' },
  { runId: 64, engineId: 'llx-ecr', moduleType: 'llx', calculationType: 'ecr', caseName: 'LLX-RND-2026-0001-Rev0-baseline' },
  { runId: 72, engineId: 'mech-vessel', moduleType: 'common', calculationType: 'mechanical_vessel', caseName: 'LLX-RND-2026-0001-Rev0-baseline' },
];

/** Recursively collect { formulaReference, source } pairs from a result snapshot. */
function collectFormulaRefs(node: unknown, out: Map<string, string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) collectFormulaRefs(x, out); return; }
  const o = node as Record<string, unknown>;
  if (typeof o.formulaReference === 'string' && o.formulaReference.trim()) {
    const ref = o.formulaReference.trim();
    const src = typeof o.source === 'string' ? o.source : '';
    // Keep the longest source string seen for a ref (most descriptive verbatim statement)
    if (!out.has(ref) || (src.length > (out.get(ref)?.length ?? 0))) out.set(ref, src);
  }
  for (const v of Object.values(o)) collectFormulaRefs(v, out);
}

async function main(): Promise<void> {
  for (const s of SEED_RUNS) {
    const rq = await pool.query(
      `SELECT input_snapshot, result_snapshot, engine_version, calculation_status, calculated_at
         FROM design_software_calculation_runs WHERE id = $1`, [s.runId]);
    if (!rq.rows.length) { console.log(`run ${s.runId} not found — skipped`); continue; }
    const run = rq.rows[0];

    const expected = {
      mode: 'full_snapshot',
      status: run.calculation_status,
      data: run.result_snapshot,
      relTol: 1e-9,
      absTol: 1e-12,
      // Volatile metadata paths (timestamps etc.) — excluded from comparison.
      // mech-vessel stamps generation time inside its datasheet block.
      ignorePaths: (s.engineId === 'mech-vessel' ? ['mechanicalDatasheet.generatedBy.computedAt'] : []) as string[],
    };
    const source = `Accepted run #${s.runId} of design LLX-RND-2026-0001 Rev 0 (${s.engineId} v${run.engine_version}, calculated ${new Date(run.calculated_at).toISOString()}) — reproducibility baseline, not engineering validation`;

    const ins = await pool.query(
      `INSERT INTO vv_regression_cases
         (engine_id, module_type, calculation_type, case_name, description, input_snapshot, expected, expected_source, established_engine_version, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (engine_id, case_name) DO NOTHING RETURNING id`,
      [s.engineId, s.moduleType, s.calculationType, s.caseName,
       'Full-snapshot regression baseline frozen from the first engineering-reviewed LLX design revision.',
       JSON.stringify(run.input_snapshot), JSON.stringify(expected), source, run.engine_version, 'V&V Phase A seed']);
    console.log(`case ${s.engineId}/${s.caseName}: ${ins.rows.length ? 'created id ' + ins.rows[0].id : 'already exists'}`);

    // Phase B seed: equation register from formula references present in the snapshot
    const refs = new Map<string, string>();
    collectFormulaRefs(run.result_snapshot, refs);
    for (const [ref, src] of Array.from(refs.entries())) {
      await pool.query(
        `INSERT INTO vv_equation_register (engine_id, equation_ref, statement, source_citation)
         VALUES ($1,$2,$3,$4) ON CONFLICT (engine_id, equation_ref) DO NOTHING`,
        [s.engineId, ref, src || '(source string not emitted for this reference — statement to be completed from engine documentation)', null]);
    }
    console.log(`  equation refs found in snapshot: ${refs.size ? Array.from(refs.keys()).sort().join(', ') : 'none — register stays empty for this engine (no invention)'}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
