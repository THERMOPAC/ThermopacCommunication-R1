import { db } from '../db';
import { sql } from 'drizzle-orm';

async function check() {
  const sample = await db.execute(sql`SELECT id, item_id, project_id FROM project_items WHERE project_id = 4 LIMIT 5`);
  console.log('project_items for project 4:', JSON.stringify(sample.rows, null, 2));

  const mi = await db.execute(sql`SELECT id, name FROM master_items LIMIT 3`);
  console.log('\nmaster_items sample:', JSON.stringify(mi.rows, null, 2));

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
