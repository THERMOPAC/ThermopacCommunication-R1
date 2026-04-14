#!/usr/bin/env tsx
/**
 * scripts/fix-trip11-seq.ts
 *
 * One-time repair for trip 11 seq collision introduced by run-2 migration bug.
 *
 * Root cause: Run 2 computed ROW_NUMBER() only over remaining rows, ignoring row 23
 * (already migrated). Rows 25 and 26 got seq 2 and 3 — should be 3 and 4.
 * Row 24 (hotel-confirmation) can't get seq 2 because row 25 holds it.
 *
 * Fix:
 *   1. GCS: copy row25 GCS (002-visa-copy) → 003-visa-copy
 *   2. GCS: copy row26 GCS (003-invitation-letter) → 004-invitation-letter
 *   3. DB: update rows 25 and 26 to correct seq / gcs_path / file_path / file_url
 *   4. GCS: delete old wrong-numbered objects
 *   5. GCS: delete orphaned hotel-confirmation objects left by failed runs
 *   6. Migration log: reset rows 24, 25, 26 so main script reprocesses them
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Storage } from '@google-cloud/storage';
import { sql as drizzleSql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool });

function buildBucket() {
  const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS!);
  const storage = new Storage({ credentials });
  return storage.bucket(process.env.GCS_BUCKET_NAME || 'thermopac_storage');
}

const bucket = buildBucket();

async function exists(p: string) { try { const [e] = await bucket.file(p).exists(); return e; } catch { return false; } }
async function copyObj(src: string, dest: string) { await bucket.file(src).copy(bucket.file(dest)); }
async function deleteObj(p: string) { try { await bucket.file(p).delete(); console.log(`  deleted: ${p}`); } catch (e: any) { console.warn(`  delete skipped (${p}): ${e.message}`); } }
async function signedUrl(p: string) {
  const [url] = await bucket.file(p).getSignedUrl({ action: 'read', expires: Date.now() + 365*24*60*60*1000 });
  return url;
}

const BASE = 'ADMIN/Travel/Employees/31/Trips/11/Documents';

async function main() {
  console.log('=== Trip 11 seq repair ===');

  // ── Step 1: Copy row25 GCS: 002-visa-copy → 003-visa-copy ─────────────────
  const src25 = `${BASE}/002-visa-copy.pdf`;
  const dest25 = `${BASE}/003-visa-copy.pdf`;
  if (await exists(src25)) {
    if (!(await exists(dest25))) {
      await copyObj(src25, dest25);
      console.log(`  copied: ${src25} → ${dest25}`);
    } else {
      console.log(`  dest already exists: ${dest25}`);
    }
  } else {
    console.warn(`  source not found: ${src25}`);
  }

  // ── Step 2: Copy row26 GCS: 003-invitation-letter → 004-invitation-letter ─
  const src26 = `${BASE}/003-invitation-letter.pdf`;
  const dest26 = `${BASE}/004-invitation-letter.pdf`;
  if (await exists(src26)) {
    if (!(await exists(dest26))) {
      await copyObj(src26, dest26);
      console.log(`  copied: ${src26} → ${dest26}`);
    } else {
      console.log(`  dest already exists: ${dest26}`);
    }
  } else {
    console.warn(`  source not found: ${src26}`);
  }

  // ── Step 3: Update DB rows — row 26 first (frees seq=3), then row 25 ───────
  // Order matters: row 26 has seq=3; updating to seq=4 first frees seq=3 for row 25.
  const url26 = await signedUrl(dest26);
  await db.execute(drizzleSql`
    UPDATE trip_documents
    SET seq = 4, gcs_path = ${dest26}, file_path = ${dest26}, file_url = ${url26}, label = 'invitation-letter'
    WHERE id = 26
  `);
  console.log(`  DB updated: row 26 → seq=4, path=${dest26}`);

  const url25 = await signedUrl(dest25);
  await db.execute(drizzleSql`
    UPDATE trip_documents
    SET seq = 3, gcs_path = ${dest25}, file_path = ${dest25}, file_url = ${url25}, label = 'visa-copy'
    WHERE id = 25
  `);
  console.log(`  DB updated: row 25 → seq=3, path=${dest25}`);

  // ── Step 4: Delete old wrong-numbered GCS objects ──────────────────────────
  await deleteObj(src25);  // 002-visa-copy.pdf (now at 003)
  await deleteObj(src26);  // 003-invitation-letter.pdf (now at 004)

  // ── Step 5: Delete orphaned hotel-confirmation objects from failed runs ────
  await deleteObj(`${BASE}/001-hotel-confirmation.pdf`);  // orphan from run 2
  await deleteObj(`${BASE}/002-hotel-confirmation.pdf`);  // orphan from run 3

  // ── Step 6: Reset migration log for rows 24, 25, 26 ──────────────────────
  await db.execute(drizzleSql`
    DELETE FROM gcs_migration_log WHERE module = 'trip' AND db_row_id IN (24, 25, 26)
  `);
  console.log('  migration log reset for rows 24, 25, 26');

  // ── Verify ─────────────────────────────────────────────────────────────────
  const state = await db.execute(drizzleSql`
    SELECT id, file_path, seq, label FROM trip_documents WHERE trip_id = 11 ORDER BY seq NULLS LAST, id
  `);
  console.log('\n=== Trip 11 after repair ===');
  for (const r of state.rows as any[]) {
    console.log(`  id=${r.id} seq=${r.seq} label=${r.label} path=${r.file_path}`);
  }

  await pool.end();
  console.log('\nRepair complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
