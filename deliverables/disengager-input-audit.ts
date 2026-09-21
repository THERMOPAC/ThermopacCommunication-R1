import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { writeFileSync } from 'node:fs';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query('BEGIN READ ONLY');
  const design = (await c.query('SELECT id,project_number,created_by,input_data,updated_at FROM ecr_pre_pilot_designs WHERE id=$1',[269])).rows[0];
  if (Number(design.project_number) !== 236) throw Error('Wrong project');
  const tables = ['ecr_pre_pilot_kuhni_geometry_resolver_runs','ecr_pre_pilot_predictive_nt_jobs','ecr_pre_pilot_stage4_physical_sizing_calculations'];
  const data: Record<string,unknown> = {design};
  for (const table of tables) {
    const cols = (await c.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1",[table])).rows.map(r=>r.column_name);
    data[table] = (await c.query(`SELECT * FROM ${table} WHERE design_id=$1 AND created_by=$2 ORDER BY ${cols.includes('created_at')?'created_at':'id'} DESC LIMIT 3`,[269,design.created_by])).rows;
  }
  const stage5tables = (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ecr_pre_pilot%stage5%'")).rows;
  for (const {table_name} of stage5tables) {
    const cols = (await c.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1",[table_name])).rows.map(r=>r.column_name);
    if (cols.includes('design_id')) data[table_name] = (await c.query(`SELECT * FROM ${table_name} WHERE design_id=$1 ${cols.includes('created_by')?'AND created_by=$2':''} ORDER BY ${cols.includes('created_at')?'created_at':'id'} DESC LIMIT 1`,cols.includes('created_by')?[269,design.created_by]:[269])).rows;
  }
  writeFileSync('/tmp/disengager-input-audit.json',JSON.stringify(data,null,2));
  console.log(JSON.stringify({file:'/tmp/disengager-input-audit.json',tables:Object.keys(data),owner:design.created_by}));
  await c.query('ROLLBACK');
} finally { c.release(); await pool.end(); }