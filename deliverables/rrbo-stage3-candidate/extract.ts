import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { writeFileSync, existsSync } from 'node:fs';
import { validateStage1Snapshot, makeStage1HydrodynamicProcessBasis } from '../../server/ecr-pre-pilot/stage1';
neonConfig.webSocketConstructor = ws;
const out = 'deliverables/rrbo-stage3-candidate/source.json';
if (existsSync(out)) throw new Error('Frozen source already exists; refusing overwrite');
const pool = new Pool({connectionString:process.env.DATABASE_URL});
const c = await pool.connect();
try {
  await c.query('BEGIN READ ONLY');
  const design = (await c.query('SELECT id,project_number,input_data,updated_at FROM ecr_pre_pilot_designs WHERE id=$1',[269])).rows[0];
  if (Number(design?.project_number)!==236) throw new Error('Project provenance mismatch');
  const snapshot = validateStage1Snapshot(design.input_data);
  const basis = makeStage1HydrodynamicProcessBasis(snapshot);
  const authorities = (await c.query('SELECT id,design_id,stage1_snapshot_hash,implementation_hash,immutable_hash,created_at FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE design_id=$1 ORDER BY id DESC LIMIT 5',[269])).rows;
  writeFileSync(out, JSON.stringify({extractedAt:new Date().toISOString(),database:'development READ ONLY transaction',designId:269,projectNumber:236,updatedAt:design.updated_at,snapshot,basis,authorities},null,2));
  await c.query('ROLLBACK');
  console.log(JSON.stringify({source:out,hash:snapshot.immutableHash,basis,authorities},null,2));
} finally { c.release(); await pool.end(); }