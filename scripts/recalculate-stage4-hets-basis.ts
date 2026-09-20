// Explicit, bounded recalculation: no upstream writes or optimizer execution.
import { createHash } from 'node:crypto';
import { pool } from '../server/db';
import { calculateStage4PrePilotSizing, loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';

async function main() {
  const designId = Number(process.argv[2]);
  if (!Number.isSafeInteger(designId) || designId <= 0) throw new Error('Supply a design ID');
  const originalQuery = pool.query.bind(pool);
  (pool as any).query = (query: any, ...args: any[]) => {
    const text = typeof query === 'string' ? query : query.text;
    if (!/^\s*SELECT\b/i.test(text)
      && !/^\s*INSERT INTO ecr_pre_pilot_stage4_physical_sizing_calculations\b/i.test(text)) {
      throw new Error('Recalculation may only read evidence and persist Stage 4');
    }
    return (originalQuery as any)(query, ...args);
  };
  const owner = await pool.query('SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1', [designId]);
  if (!owner.rows[0]) throw new Error('Design not found');
  const userId = owner.rows[0].created_by;
  const snapshot = async () => {
    const rows = await pool.query(
      'SELECT * FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE design_id=$1 ORDER BY id', [designId]);
    return createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex');
  };
  const before = await snapshot();
  // Read-only preflight must succeed, ensuring no new Stage-3 optimizer is needed.
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const sizing = authority.projection.hetsSizing;
  if (!sizing) throw new Error('Missing HETS sizing');
  await calculateStage4PrePilotSizing(userId, designId);
  const after = await snapshot();
  if (before !== after) throw new Error('Stage-3 evidence changed during recalculation');
  console.log(JSON.stringify({ designId, stage3Unchanged: true, stage3EvidenceHash: after, sizing }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => pool.end());