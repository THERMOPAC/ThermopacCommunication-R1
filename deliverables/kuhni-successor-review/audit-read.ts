import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query('BEGIN READ ONLY');
  const s3 = (await c.query('SELECT id,design_id,stage1_snapshot_hash,stage2_job_id,stage2_result_hash,parent_hydrodynamic_run_id,parent_hydrodynamic_run_hash,process_basis,theoretical_stage_authority,result_snapshot,implementation_hash,immutable_hash,created_at FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE id=$1',[64])).rows[0];
  const s4 = (await c.query('SELECT id,design_id,stage3_run_id,stage3_immutable_hash,lineage_hash,result_snapshot,status FROM ecr_pre_pilot_stage4_physical_sizing_calculations WHERE id=$1',[13])).rows[0];
  const linked = (await c.query('SELECT (a.created_by=b.created_by) AS same_owner,(a.design_id=b.design_id) AS same_design FROM ecr_pre_pilot_kuhni_geometry_resolver_runs a JOIN ecr_pre_pilot_stage4_physical_sizing_calculations b ON b.stage3_run_id=a.id::text WHERE a.id=$1 AND b.id=$2',[64,13])).rows;
  const latest = (await c.query('SELECT id,immutable_hash,result_snapshot->\'selectedGeometry\' AS geometry FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE design_id=$1 ORDER BY id DESC LIMIT 5',[s3.design_id])).rows;
  const text=JSON.stringify({s3,s4,linked,latest},null,2);
  writeFileSync('deliverables/kuhni-successor-review/saved-evidence.json',text);
  console.log(JSON.stringify({s3Keys:Object.keys(s3.result_snapshot),basis:s3.process_basis,s4Keys:Object.keys(s4?.result_snapshot??{}),linked,latest,exportSha256:createHash('sha256').update(text).digest('hex')},null,2));
  await c.query('ROLLBACK');
} finally { c.release(); await pool.end(); }