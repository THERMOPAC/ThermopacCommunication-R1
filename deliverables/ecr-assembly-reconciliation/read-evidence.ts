import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const hash=(v:any):string=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
function canonical(v:any):any{return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const c=await pool.connect();
try{
 await c.query('BEGIN READ ONLY');
 const revisions=(await c.query('SELECT id,design_id,revision,source_hash,immutable_hash,snapshot,created_at FROM ecr_pre_pilot_stage5_geometry_revisions WHERE design_id=$1 ORDER BY revision DESC',[269])).rows;
 const stage4=(await c.query('SELECT id,design_id,stage3_run_id,stage3_immutable_hash,lineage_hash,result_snapshot,status FROM ecr_pre_pilot_stage4_physical_sizing_calculations WHERE id=$1',[13])).rows[0];
 const stage3=(await c.query('SELECT id,design_id,immutable_hash FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE id=$1',[64])).rows[0];
 const checks=revisions.map(r=>({id:r.id,revision:r.revision,snapshot:hash(r.snapshot)===r.immutable_hash,source:hash({sourceStage3:r.snapshot.sourceStage3,sourceStage4:r.snapshot.sourceStage4})===r.source_hash,geometry:hash(r.snapshot.geometry)===r.snapshot.geometryHash,manifest:hash(r.snapshot.rulesManifest)===r.snapshot.rulesManifestHash}));
 const evidence={revisions,stage3,stage4,checks};
 const file=process.argv.includes('--after')?'saved-evidence-after.json':'saved-evidence.json';
 writeFileSync(`deliverables/ecr-assembly-reconciliation/${file}`,JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({revisions:revisions.map(r=>({id:r.id,revision:r.revision,source:r.source_hash,immutable:r.immutable_hash})),checks,stage3,stage4id:stage4.id,evidenceHash:hash(evidence)}));
 await c.query('ROLLBACK');
}finally{c.release();await pool.end();}