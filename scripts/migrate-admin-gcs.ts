#!/usr/bin/env tsx
/**
 * scripts/migrate-admin-gcs.ts
 *
 * Phase 3 GCS Migration — Business_Trips/ and Business_Visa/ → ADMIN/
 * Rev 2 §5: Staged, idempotent, checksum-verified.
 *
 * Stages per file:
 *   pending → s1_copied → s2_verified → s3_db_updated → s4_source_deleted → done
 *   Any stage may fail → 'failed' with error_message — re-run resumes from last stage.
 *
 * Run: tsx scripts/migrate-admin-gcs.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Storage } from '@google-cloud/storage';
import { sql as drizzleSql } from 'drizzle-orm';
import * as pathMod from 'path';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// ── DB setup ──────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool });

// ── GCS setup ─────────────────────────────────────────────────────────────────

function buildGcsClient(): { storage: Storage; bucket: ReturnType<Storage['bucket']> } {
  const rawCreds = process.env.GOOGLE_CLOUD_CREDENTIALS;
  const bucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
  if (!rawCreds) throw new Error('GOOGLE_CLOUD_CREDENTIALS env var not set');
  const credentials = JSON.parse(rawCreds);
  const storage = new Storage({ credentials });
  return { storage, bucket: storage.bucket(bucketName) };
}

const { bucket } = buildGcsClient();

// ── Label mapping (document_type → TRIP_LABEL_VOCAB) ─────────────────────────

const DOC_TYPE_TO_LABEL: Record<string, string> = {
  travel_booking:    'travel-booking',
  hotel_confirmation:'hotel-confirmation',
  visa_documents:    'visa-copy',
  meeting_invitation:'invitation-letter',
  other_documents:   'other',
};

function inferTripLabel(documentType: string): string {
  return DOC_TYPE_TO_LABEL[documentType] ?? 'other';
}

// ── Migration log helpers ─────────────────────────────────────────────────────

async function upsertLog(module: string, dbRowId: number, legacyPath: string, newPath: string, stage: string, extra: Record<string, any> = {}) {
  await db.execute(drizzleSql`
    INSERT INTO gcs_migration_log (module, db_row_id, legacy_path, new_path, stage,
      checksum_source, checksum_dest, checksum_match,
      db_updated_at, source_deleted_at, error_message, updated_at)
    VALUES (${module}, ${dbRowId}, ${legacyPath}, ${newPath}, ${stage},
      ${extra.checksum_source ?? null}, ${extra.checksum_dest ?? null}, ${extra.checksum_match ?? null},
      ${extra.db_updated_at ?? null}, ${extra.source_deleted_at ?? null}, ${extra.error_message ?? null},
      NOW())
    ON CONFLICT (module, db_row_id) DO UPDATE
      SET new_path = EXCLUDED.new_path,
          stage = EXCLUDED.stage,
          checksum_source = COALESCE(EXCLUDED.checksum_source, gcs_migration_log.checksum_source),
          checksum_dest = COALESCE(EXCLUDED.checksum_dest, gcs_migration_log.checksum_dest),
          checksum_match = COALESCE(EXCLUDED.checksum_match, gcs_migration_log.checksum_match),
          db_updated_at = COALESCE(EXCLUDED.db_updated_at, gcs_migration_log.db_updated_at),
          source_deleted_at = COALESCE(EXCLUDED.source_deleted_at, gcs_migration_log.source_deleted_at),
          error_message = EXCLUDED.error_message,
          retries = gcs_migration_log.retries + CASE WHEN EXCLUDED.stage = 'failed' THEN 1 ELSE 0 END,
          updated_at = NOW()
  `);
}

async function getLogEntry(module: string, dbRowId: number): Promise<any | null> {
  const result = await db.execute(drizzleSql`
    SELECT * FROM gcs_migration_log WHERE module = ${module} AND db_row_id = ${dbRowId}
  `);
  return result.rows[0] ?? null;
}

// ── GCS helpers ───────────────────────────────────────────────────────────────

async function objectExists(gcsPath: string): Promise<boolean> {
  try {
    const [exists] = await bucket.file(gcsPath).exists();
    return exists;
  } catch {
    return false;
  }
}

async function getMd5Hash(gcsPath: string): Promise<string> {
  const [meta] = await bucket.file(gcsPath).getMetadata();
  return meta.md5Hash as string;
}

async function copyObject(srcPath: string, destPath: string): Promise<void> {
  await bucket.file(srcPath).copy(bucket.file(destPath));
}

async function deleteObject(gcsPath: string): Promise<void> {
  await bucket.file(gcsPath).delete();
}

async function generateSignedUrl(gcsPath: string): Promise<string> {
  const [url] = await bucket.file(gcsPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
  });
  return url;
}

// ── Counters ──────────────────────────────────────────────────────────────────

interface Counters {
  migrated: number;
  failed: number;
  skipped: number;
  sourceNotFound: number;
  checksumMismatches: number;
}

// ── Stage runner ──────────────────────────────────────────────────────────────

async function runFileStages(
  module: 'trip' | 'visa',
  dbRowId: number,
  legacyPath: string,
  newPath: string,
  s3UpdateFn: (newSignedUrl: string) => Promise<void>,
  counters: Counters
): Promise<void> {
  const log = await getLogEntry(module, dbRowId);

  // Skip already-done files
  if (log?.stage === 'done') {
    counters.skipped++;
    console.log(`  SKIP [${module}:${dbRowId}] already done`);
    return;
  }

  // If previously failed, allow retry (fall through to correct stage)
  const resumeStage = log?.stage ?? 'pending';
  console.log(`  START [${module}:${dbRowId}] legacyPath=${legacyPath}  stage=${resumeStage}`);

  // S0: Verify source exists
  if (resumeStage === 'pending' || resumeStage === 'failed') {
    const srcExists = await objectExists(legacyPath);
    if (!srcExists) {
      console.log(`  WARN  [${module}:${dbRowId}] source not found in GCS: ${legacyPath}`);
      await upsertLog(module, dbRowId, legacyPath, newPath, 'source_not_found',
        { error_message: `Source object does not exist: ${legacyPath}` });
      counters.sourceNotFound++;
      return;
    }
  }

  // S1: Copy
  if (resumeStage === 'pending' || resumeStage === 'failed') {
    try {
      const destAlreadyExists = await objectExists(newPath);
      if (!destAlreadyExists) {
        await copyObject(legacyPath, newPath);
        console.log(`  S1    [${module}:${dbRowId}] copied → ${newPath}`);
      } else {
        console.log(`  S1    [${module}:${dbRowId}] dest already exists, skipping copy`);
      }
      await upsertLog(module, dbRowId, legacyPath, newPath, 's1_copied');
    } catch (err: any) {
      console.error(`  FAIL  [${module}:${dbRowId}] S1 copy failed: ${err.message}`);
      await upsertLog(module, dbRowId, legacyPath, newPath, 'failed', { error_message: `S1 copy: ${err.message}` });
      counters.failed++;
      return;
    }
  }

  // S2: Verify checksum (md5Hash comparison)
  if (resumeStage === 'pending' || resumeStage === 'failed' || resumeStage === 's1_copied') {
    try {
      const srcMd5 = await getMd5Hash(legacyPath);
      const destMd5 = await getMd5Hash(newPath);
      const match = srcMd5 === destMd5;
      console.log(`  S2    [${module}:${dbRowId}] md5 src=${srcMd5} dest=${destMd5} match=${match}`);
      if (!match) {
        // Delete bad destination, mark for retry
        try { await deleteObject(newPath); } catch { /* ignore */ }
        await upsertLog(module, dbRowId, legacyPath, newPath, 'failed', {
          checksum_source: srcMd5, checksum_dest: destMd5, checksum_match: false,
          error_message: `S2 checksum mismatch — destination deleted, retry copy`
        });
        counters.checksumMismatches++;
        counters.failed++;
        return;
      }
      await upsertLog(module, dbRowId, legacyPath, newPath, 's2_verified', {
        checksum_source: srcMd5, checksum_dest: destMd5, checksum_match: true
      });
    } catch (err: any) {
      console.error(`  FAIL  [${module}:${dbRowId}] S2 verify failed: ${err.message}`);
      await upsertLog(module, dbRowId, legacyPath, newPath, 'failed', { error_message: `S2 verify: ${err.message}` });
      counters.failed++;
      return;
    }
  }

  // S3: Update DB
  if (resumeStage === 'pending' || resumeStage === 'failed' || resumeStage === 's1_copied' || resumeStage === 's2_verified') {
    try {
      const newSignedUrl = await generateSignedUrl(newPath);
      await s3UpdateFn(newSignedUrl);
      console.log(`  S3    [${module}:${dbRowId}] DB updated`);
      await upsertLog(module, dbRowId, legacyPath, newPath, 's3_db_updated', { db_updated_at: new Date() });
    } catch (err: any) {
      console.error(`  FAIL  [${module}:${dbRowId}] S3 DB update failed: ${err.message}`);
      await upsertLog(module, dbRowId, legacyPath, newPath, 'failed', { error_message: `S3 DB update: ${err.message}` });
      counters.failed++;
      return;
    }
  }

  // S4: Delete source
  try {
    const srcStillExists = await objectExists(legacyPath);
    if (srcStillExists) {
      await deleteObject(legacyPath);
      console.log(`  S4    [${module}:${dbRowId}] source deleted: ${legacyPath}`);
    } else {
      console.log(`  S4    [${module}:${dbRowId}] source already gone`);
    }
    await upsertLog(module, dbRowId, legacyPath, newPath, 'done', { source_deleted_at: new Date() });
    counters.migrated++;
  } catch (err: any) {
    // Source deletion failure is non-critical — log and mark done anyway
    console.warn(`  WARN  [${module}:${dbRowId}] S4 source deletion failed (manual cleanup needed): ${err.message}`);
    await upsertLog(module, dbRowId, legacyPath, newPath, 'done', {
      source_deleted_at: null,
      error_message: `S4 source not deleted: ${err.message}`
    });
    counters.migrated++;
  }
}

// ── M1: Business_Trips/ migration ────────────────────────────────────────────

async function migrateTripDocuments(counters: Counters): Promise<void> {
  console.log('\n=== M1: Business_Trips/ migration ===');

  // Compute seq over ALL trip rows (including already-migrated) so seq numbers are stable
  // across partial runs. Then filter to only rows still needing migration.
  const rows = await db.execute(drizzleSql`
    WITH all_docs AS (
      SELECT td.id, td.trip_id, td.file_path, td.document_type,
             bt.employee_id, td.uploaded_at,
             ROW_NUMBER() OVER (PARTITION BY td.trip_id ORDER BY td.uploaded_at, td.id) AS seq_num
      FROM trip_documents td
      JOIN business_trips bt ON bt.id = td.trip_id
      WHERE td.file_path IS NOT NULL
    )
    SELECT * FROM all_docs
    WHERE file_path NOT LIKE 'ADMIN/%'
    ORDER BY trip_id, uploaded_at, id
  `);

  console.log(`  Found ${rows.rows.length} legacy trip_documents to process`);

  for (const row of rows.rows as any[]) {
    const legacyPath: string = row.file_path;
    const ext = pathMod.extname(legacyPath);
    const label = inferTripLabel(row.document_type);
    const seqNum = parseInt(row.seq_num, 10);
    const seqStr = String(seqNum).padStart(3, '0');
    const newPath = `ADMIN/Travel/Employees/${row.employee_id}/Trips/${row.trip_id}/Documents/${seqStr}-${label}${ext}`;

    await runFileStages(
      'trip',
      row.id,
      legacyPath,
      newPath,
      async (newSignedUrl: string) => {
        // S3: Update trip_documents row
        await db.execute(drizzleSql`
          UPDATE trip_documents
          SET file_path = ${newPath},
              file_url  = ${newSignedUrl},
              gcs_path  = ${newPath},
              seq       = ${seqNum},
              label     = ${label}
          WHERE id = ${row.id}
        `);
      },
      counters
    );
  }
}

// ── M2: Business_Visa/ migration ─────────────────────────────────────────────

async function migrateVisaRecords(counters: Counters): Promise<void> {
  console.log('\n=== M2: Business_Visa/ migration ===');

  const rows = await db.execute(drizzleSql`
    SELECT id, employee_id, file_path
    FROM visa_records
    WHERE file_path IS NOT NULL
      AND file_path NOT LIKE 'ADMIN/%'
    ORDER BY id
  `);

  console.log(`  Found ${rows.rows.length} legacy visa_records to process`);

  for (const row of rows.rows as any[]) {
    const legacyPath: string = row.file_path;
    const ext = pathMod.extname(legacyPath);
    const newPath = `ADMIN/Visa/Employees/${row.employee_id}/Records/${row.id}/001-visa-copy${ext}`;

    await runFileStages(
      'visa',
      row.id,
      legacyPath,
      newPath,
      async (newSignedUrl: string) => {
        // S3: Insert visa_documents row (skip if already exists for this record+seq combo)
        await db.execute(drizzleSql`
          INSERT INTO visa_documents (visa_record_id, gcs_path, seq, label, is_active, uploaded_at)
          VALUES (${row.id}, ${newPath}, 1, 'visa-copy', true, NOW())
          ON CONFLICT (visa_record_id, seq) DO UPDATE
            SET gcs_path = EXCLUDED.gcs_path, is_active = true
        `);
        // Update visa_records: file_path → new ADMIN path, file_url → fresh signed URL
        await db.execute(drizzleSql`
          UPDATE visa_records
          SET file_path = ${newPath},
              file_url  = ${newSignedUrl}
          WHERE id = ${row.id}
        `);
      },
      counters
    );
  }
}

// ── Final verification ────────────────────────────────────────────────────────

async function runVerification(): Promise<void> {
  console.log('\n=== S5: Final verification ===');

  const tripRemaining = await db.execute(drizzleSql`
    SELECT COUNT(*) AS cnt FROM trip_documents
    WHERE file_path IS NOT NULL AND file_path NOT LIKE 'ADMIN/%'
  `);
  const visaRemaining = await db.execute(drizzleSql`
    SELECT COUNT(*) AS cnt FROM visa_records
    WHERE file_path IS NOT NULL AND file_path NOT LIKE 'ADMIN/%'
  `);
  const logSummary = await db.execute(drizzleSql`
    SELECT module, stage, COUNT(*) AS cnt FROM gcs_migration_log GROUP BY module, stage ORDER BY module, stage
  `);
  const checksumMismatches = await db.execute(drizzleSql`
    SELECT COUNT(*) AS cnt FROM gcs_migration_log WHERE checksum_match = false
  `);
  const manualCleanup = await db.execute(drizzleSql`
    SELECT module, db_row_id, legacy_path, stage, error_message
    FROM gcs_migration_log
    WHERE stage NOT IN ('done', 'skipped')
    ORDER BY module, db_row_id
  `);

  console.log('\n--- Legacy DB rows still pointing to old roots:');
  console.log('  trip_documents remaining:', (tripRemaining.rows[0] as any).cnt);
  console.log('  visa_records remaining:  ', (visaRemaining.rows[0] as any).cnt);

  console.log('\n--- Migration log summary:');
  for (const r of logSummary.rows as any[]) {
    console.log(`  [${r.module}] ${r.stage}: ${r.cnt}`);
  }

  console.log('\n--- Checksum mismatches:', (checksumMismatches.rows[0] as any).cnt);

  if ((manualCleanup.rows as any[]).length > 0) {
    console.log('\n--- Items needing attention (non-done):');
    for (const r of manualCleanup.rows as any[]) {
      console.log(`  [${r.module}:${r.db_row_id}] stage=${r.stage}  legacy=${r.legacy_path}`);
      if (r.error_message) console.log(`    error: ${r.error_message}`);
    }
  } else {
    console.log('\n--- All items are done. No manual cleanup needed.');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Phase 3 GCS Migration — Rev 2 §5 ===');
  console.log(`Bucket: ${process.env.GCS_BUCKET_NAME || 'thermopac_storage'}`);
  console.log(`DB: ${process.env.DATABASE_URL ? '(set)' : '(NOT SET — abort)'}`);
  console.log(`GCS credentials: ${process.env.GOOGLE_CLOUD_CREDENTIALS ? '(set)' : '(NOT SET — abort)'}`);

  if (!process.env.DATABASE_URL || !process.env.GOOGLE_CLOUD_CREDENTIALS) {
    console.error('FATAL: Required env vars missing. Aborting.');
    process.exit(1);
  }

  const counters: Counters = { migrated: 0, failed: 0, skipped: 0, sourceNotFound: 0, checksumMismatches: 0 };

  await migrateTripDocuments(counters);
  await migrateVisaRecords(counters);
  await runVerification();

  console.log('\n=== SUMMARY ===');
  console.log(`  migrated:        ${counters.migrated}`);
  console.log(`  failed:          ${counters.failed}`);
  console.log(`  skipped (done):  ${counters.skipped}`);
  console.log(`  source_not_found:${counters.sourceNotFound}`);
  console.log(`  checksum_mismatch:${counters.checksumMismatches}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
