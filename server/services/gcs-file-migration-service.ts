/**
 * GCS File Migration Service v2
 *
 * Migrates existing GCS objects to canonical DB-driven paths.
 * Triggered when:
 *   (a) governance mode switches hardcoded → db_driven   (triggerReason='auto_db_driven')
 *   (b) path_template changes on a db_driven rule         (triggerReason='auto_template_change')
 *   (c) admin presses "Migrate Now"                       (triggerReason='manual')
 *
 * Candidate detection:
 *   Converts path_template to a regex.  Any existing record whose file_path
 *   does NOT match the regex is a migration candidate — regardless of whether
 *   the root prefix changed or only the internal folder structure changed.
 *
 * Copy-verify-delete (GCS):
 *   1. Copy source → destination
 *   2. Verify destination exists AND size matches source
 *   3. Update DB record to new path
 *   4. Delete source (best-effort; orphaned source is harmless)
 *
 * Per-file audit trail stored in gcs_file_migration_items (before_path, after_path, status).
 *
 * Idempotent: regex re-check at run-time means already-migrated files are skipped
 * on every subsequent run without touching gcs_file_migration_items history.
 */

import path from 'path';
import { Storage } from '@google-cloud/storage';
import { db } from '../db';
import { gcsFileMigrationJobs, gcsFileMigrationItems } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { resolvePathTemplate } from './gcs-governance-service';

const TAG = '[GCS-FileMigration]';

// ── GCS bucket (lazily initialised) ──────────────────────────────────────────

let _bucket: any = null;

function getBucket(): any | null {
  if (_bucket) return _bucket;
  try {
    const credStr = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (!credStr) return null;
    const credentials = JSON.parse(credStr);
    const storage = new Storage({ credentials, projectId: credentials.project_id });
    _bucket = storage.bucket('thermopac_storage');
    return _bucket;
  } catch {
    return null;
  }
}

// ── Template → Regex ──────────────────────────────────────────────────────────
// Converts  "TPEL/ADMIN/HR/{CompanyFY}/TRIPS/{EmployeeName}/{Destination}/{DocType}/{filename}"
// to        /^TPEL\/ADMIN\/HR\/[^/]+\/TRIPS\/[^/]+\/[^/]+\/[^/]+\/[^/]+$/
//
// Rules:
//   • {Token}  → [^/]+  (one non-slash path segment)
//   • All other characters are regex-escaped
//
// Exported so governance routes and tests can use it directly.

export function templateToRegex(template: string): RegExp {
  const parts = template.split(/(\{[^}]+\})/);
  const regexStr = parts.map(part =>
    /^\{[^}]+\}$/.test(part)
      ? '[^/]+'
      : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('');
  return new RegExp(`^${regexStr}$`);
}

// ── CompanyFY helper (April–March, format YYZZ) ───────────────────────────────

function getCompanyFY(date: Date): string {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  return `${String(fyStart).slice(-2)}${String(fyStart + 1).slice(-2)}`;
}

// ── Slug helpers ──────────────────────────────────────────────────────────────

function slugName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function slugType(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

/**
 * Sanitise a raw document_name for use as a GCS object-name segment.
 * - Preserves the original file extension (e.g. .pdf)
 * - Spaces → underscores
 * - Retains: a-z A-Z 0-9  .  -  _  (  )
 * - Everything else → _
 * - Collapses consecutive underscores; trims leading/trailing underscores
 * - Falls back to "document" if the base becomes empty after sanitisation
 */
function sanitizeFilenameForGCS(raw: string): string {
  const ext      = path.extname(raw);
  const base     = path.basename(raw, ext);
  const cleanBase = base
    .replace(/\s+/g, '_')
    .replace(/[^\w\-().]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (cleanBase || 'document') + ext;
}

// ── Per-item status values ────────────────────────────────────────────────────
// pending → copying → verified → completed
//                              → failed
//          → skipped

type ItemStatus = 'pending' | 'copying' | 'verified' | 'completed' | 'skipped' | 'failed' | 'missing_source';

// ── Dry-run preview item ──────────────────────────────────────────────────────

export interface MigrationPreviewItem {
  fileId:       number;
  tableName:    string;
  oldPath:      string;
  newPath:      string | null;
  sourceExists: boolean | null;   // null = GCS not available (dev env)
  filenameUsed: string | null;
  error?:       string;
}

// ── Handler registry interface ────────────────────────────────────────────────

interface MigrationHandler {
  tableName:        string;
  fetchAllRecords:  () => Promise<Array<{ id: number; filePath: string; [k: string]: any }>>;
  buildNewPath:     (record: any, template: string) => string;
  updateFilePath:   (id: number, newPath: string) => Promise<void>;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const HANDLERS: Record<string, MigrationHandler> = {

  TRIP_DOCUMENT: {
    tableName: 'trip_documents',

    async fetchAllRecords() {
      const rows = await db.execute(sql`
        SELECT
          td.id,
          td.file_path      AS "filePath",
          td.document_type  AS "documentType",
          td.document_name  AS "documentName",
          bt.destination,
          bt.from_date      AS "fromDate",
          u.first_name      AS "firstName",
          u.last_name       AS "lastName",
          u.username
        FROM trip_documents  td
        JOIN business_trips  bt ON bt.id = td.trip_id
        JOIN users           u  ON u.id  = bt.employee_id
        WHERE td.is_active = true
          AND td.file_path IS NOT NULL
          AND td.file_path <> ''
        ORDER BY td.id
      `);
      return rows.rows as any[];
    },

    buildNewPath(record, template) {
      const tripDate     = new Date(record.fromDate);
      const companyFY    = getCompanyFY(tripDate);
      const employeeName = slugName(
        record.firstName && record.lastName
          ? `${record.firstName}-${record.lastName}`
          : record.username
      );
      const destination = slugName(record.destination);
      const docType     = slugType(record.documentType);
      // Use document_name (original filename) sanitised for GCS; fall back to basename if null
      const rawFilename = record.documentName || path.basename(record.filePath);
      const filename    = sanitizeFilenameForGCS(rawFilename);
      return resolvePathTemplate(template, {
        CompanyFY: companyFY,
        EmployeeName: employeeName,
        Destination: destination,
        DocType: docType,
        filename,
      });
    },

    async updateFilePath(id, newPath) {
      await db.execute(sql`UPDATE trip_documents SET file_path = ${newPath} WHERE id = ${id}`);
    },
  },

  VISA_DOCUMENT: {
    tableName: 'visa_records',

    async fetchAllRecords() {
      const rows = await db.execute(sql`
        SELECT
          vr.id,
          vr.file_path   AS "filePath",
          vr.visa_type   AS "visaType",
          vr.issue_date  AS "issueDate",
          u.first_name   AS "firstName",
          u.last_name    AS "lastName",
          u.username
        FROM visa_records vr
        JOIN users        u ON u.id = vr.employee_id
        WHERE vr.file_path IS NOT NULL
          AND vr.file_path <> ''
        ORDER BY vr.id
      `);
      return rows.rows as any[];
    },

    buildNewPath(record, template) {
      const issueDate    = new Date(record.issueDate);
      const companyFY    = getCompanyFY(issueDate);
      const employeeName = slugName(
        record.firstName && record.lastName
          ? `${record.firstName}-${record.lastName}`
          : record.username
      );
      const category = slugName(record.visaType);
      const filename  = path.basename(record.filePath);
      return resolvePathTemplate(template, {
        CompanyFY: companyFY,
        EmployeeName: employeeName,
        Category: category,
        filename,
      });
    },

    async updateFilePath(id, newPath) {
      await db.execute(sql`UPDATE visa_records SET file_path = ${newPath} WHERE id = ${id}`);
    },
  },

  COMPANY_GST_CERTIFICATE: {
    tableName: 'company_documents',

    async fetchAllRecords() {
      const rows = await db.execute(sql`
        SELECT
          cd.id,
          cd.gcs_path         AS "filePath",
          cd.revision_number  AS "revisionNumber",
          cd.file_name        AS "fileName",
          cm.company_code     AS "companyCode"
        FROM company_documents cd
        JOIN company_master    cm ON cm.id = cd.company_id
        WHERE cd.doc_type = 'GST_CERTIFICATE'
          AND cd.gcs_path IS NOT NULL
          AND cd.gcs_path <> ''
        ORDER BY cd.id
      `);
      return rows.rows as any[];
    },

    buildNewPath(record, template) {
      const revNo = String(record.revisionNumber).padStart(2, '0');
      const ext   = path.extname(record.fileName).replace('.', '') || 'pdf';
      return resolvePathTemplate(template, {
        CompanyCode: record.companyCode,
        RevNo:       revNo,
        Seq:         '001',
        Ext:         ext,
      });
    },

    async updateFilePath(id, newPath) {
      await db.execute(sql`UPDATE company_documents SET gcs_path = ${newPath} WHERE id = ${id}`);
    },
  },
};

// ── GCS copy → verify (source intentionally preserved) ───────────────────────
//
// Policy: the original GCS object is NEVER deleted during migration.
// After migration the file exists at both the old path (historical reference)
// and the new governed path.  The DB record is updated to point to the new
// path so all application access goes through the canonical location.
// Old objects can be cleaned up manually by an administrator after confirming
// the migration is correct and all parties have reviewed the dry-run.

async function gcsCopyVerify(
  bucket: any,
  sourcePath: string,
  destPath:   string
): Promise<void> {
  const sourceFile = bucket.file(sourcePath);
  const destFile   = bucket.file(destPath);

  // 1. Copy (GCS preserves metadata automatically)
  await sourceFile.copy(destFile);

  // 2. Verify destination exists
  const [destExists] = await destFile.exists();
  if (!destExists) {
    throw new Error('Copy reported success but destination object not found in GCS');
  }

  // 3. Verify size matches
  const [sourceMeta] = await sourceFile.getMetadata();
  const [destMeta]   = await destFile.getMetadata();
  if (String(sourceMeta.size) !== String(destMeta.size)) {
    throw new Error(
      `Size mismatch after copy — source: ${sourceMeta.size} bytes, dest: ${destMeta.size} bytes`
    );
  }

  // Source is intentionally NOT deleted — old object kept for audit/safety.
}

// ── Job progress helpers ───────────────────────────────────────────────────────

async function updateJob(
  jobId: number,
  patch: Partial<{
    status: string;
    totalFiles: number;
    processedFiles: number;
    migratedFiles: number;
    skippedFiles: number;
    failedFiles: number;
    errorLog: any;
    completedAt: Date;
  }>
) {
  await db.update(gcsFileMigrationJobs)
    .set(patch as any)
    .where(eq(gcsFileMigrationJobs.id, jobId));
}

async function upsertItem(
  jobId: number,
  fileId: number,
  tableName: string,
  beforePath: string,
  status: ItemStatus,
  afterPath?: string,
  error?: string
) {
  await db.insert(gcsFileMigrationItems).values({
    jobId,
    fileId,
    tableName,
    beforePath,
    afterPath:   afterPath   ?? null,
    status,
    error:       error       ?? null,
    processedAt: new Date(),
  });
}

// ── Core migration runner ──────────────────────────────────────────────────────

async function runMigrationBackground(
  jobId:        number,
  documentType: string,
  pathTemplate: string,
) {
  const handler = HANDLERS[documentType];
  if (!handler) {
    await updateJob(jobId, {
      status:      'failed',
      completedAt: new Date(),
      errorLog:    [{ fileId: 0, oldPath: '', error: `No handler for documentType=${documentType}` }],
    });
    return;
  }

  await updateJob(jobId, { status: 'running' });

  const bucket   = getBucket();
  const regex    = templateToRegex(pathTemplate);
  const errors:  Array<{ fileId: number; oldPath: string; error: string }> = [];

  // ── 1. Fetch all records ───────────────────────────────────────────────────
  let allRecords: Array<{ id: number; filePath: string; [k: string]: any }> = [];
  try {
    allRecords = await handler.fetchAllRecords();
  } catch (err: any) {
    console.error(`${TAG} fetchAllRecords failed for ${documentType}:`, err.message);
    await updateJob(jobId, {
      status:      'failed',
      completedAt: new Date(),
      errorLog:    [{ fileId: 0, oldPath: '', error: `DB query failed: ${err.message}` }],
    });
    return;
  }

  // ── 2. Filter candidates via regex (not prefix) ───────────────────────────
  const candidates = allRecords.filter(r => r.filePath && !regex.test(r.filePath));
  const skippedByRegex = allRecords.length - candidates.length;

  await updateJob(jobId, {
    totalFiles:   candidates.length,
    skippedFiles: skippedByRegex,
  });

  console.log(
    `${TAG} [job=${jobId}] ${documentType}: ${allRecords.length} total, ` +
    `${candidates.length} candidates, ${skippedByRegex} already compliant`
  );

  let migrated  = 0;
  let skipped   = skippedByRegex;
  let failed    = 0;
  let missingSrc = 0;

  // ── 3. Migrate each candidate ─────────────────────────────────────────────
  for (let i = 0; i < candidates.length; i++) {
    const record   = candidates[i];
    const oldPath  = record.filePath;

    // Build canonical new path
    let newPath: string;
    try {
      newPath = handler.buildNewPath(record, pathTemplate);
    } catch (err: any) {
      console.warn(`${TAG} [job=${jobId}] Path build failed id=${record.id}: ${err.message}`);
      errors.push({ fileId: record.id, oldPath, error: `Path build: ${err.message}` });
      failed++;
      await upsertItem(jobId, record.id, handler.tableName, oldPath, 'failed', undefined, `Path build: ${err.message}`);
      await updateJob(jobId, { processedFiles: i + 1, failedFiles: failed, errorLog: errors });
      continue;
    }

    // Skip if old path === new path (already correct, regex didn't catch it due to template mismatch)
    if (newPath === oldPath) {
      skipped++;
      await upsertItem(jobId, record.id, handler.tableName, oldPath, 'skipped', oldPath);
      await updateJob(jobId, { processedFiles: i + 1, skippedFiles: skipped });
      continue;
    }

    // ── GCS: copy → verify → delete ──────────────────────────────────────
    if (bucket) {
      // 1. Check source exists before attempting copy — do not retry on missing source
      let srcExists: boolean;
      try {
        [srcExists] = await bucket.file(oldPath).exists();
      } catch (existErr: any) {
        // exists() itself failed — treat as a real error, not missing_source
        console.warn(`${TAG} [job=${jobId}] exists() check failed id=${record.id}: ${existErr.message}`);
        errors.push({ fileId: record.id, oldPath, error: `GCS exists check: ${existErr.message}` });
        failed++;
        await upsertItem(jobId, record.id, handler.tableName, oldPath, 'failed', newPath, `GCS exists check: ${existErr.message}`);
        await updateJob(jobId, { processedFiles: i + 1, failedFiles: failed, errorLog: errors });
        continue;
      }

      if (!srcExists) {
        // Source was deleted externally — record it, leave DB path untouched, do not retry
        console.warn(`${TAG} [job=${jobId}] Source not in GCS id=${record.id}: ${oldPath}`);
        missingSrc++;
        errors.push({ fileId: record.id, oldPath, error: 'Source object not found in GCS', type: 'missing_source' });
        await upsertItem(jobId, record.id, handler.tableName, oldPath, 'missing_source', undefined, 'Source object not found in GCS');
        await updateJob(jobId, { processedFiles: i + 1, missingSrcFiles: missingSrc, errorLog: errors });
        continue;
      }

      // 2. Source exists — copy → verify (source preserved at old path)
      await upsertItem(jobId, record.id, handler.tableName, oldPath, 'copying', newPath);
      try {
        await gcsCopyVerify(bucket, oldPath, newPath);
        console.log(`${TAG} [job=${jobId}] GCS: ${oldPath} → ${newPath}`);
      } catch (err: any) {
        console.warn(`${TAG} [job=${jobId}] GCS error id=${record.id}: ${err.message}`);
        errors.push({ fileId: record.id, oldPath, error: `GCS: ${err.message}` });
        failed++;
        await upsertItem(jobId, record.id, handler.tableName, oldPath, 'failed', newPath, `GCS: ${err.message}`);
        await updateJob(jobId, { processedFiles: i + 1, failedFiles: failed, errorLog: errors });
        continue;
      }
    } else {
      // Dev environment — no GCS credentials; update DB path only
      console.warn(
        `${TAG} [job=${jobId}] GCS unavailable (dev) — updating DB only for id=${record.id}`
      );
    }

    // ── DB update ────────────────────────────────────────────────────────
    try {
      await handler.updateFilePath(record.id, newPath);
      migrated++;
      await upsertItem(jobId, record.id, handler.tableName, oldPath, 'completed', newPath);
      await updateJob(jobId, { processedFiles: i + 1, migratedFiles: migrated });
    } catch (err: any) {
      console.error(`${TAG} [job=${jobId}] DB update failed id=${record.id}: ${err.message}`);
      errors.push({ fileId: record.id, oldPath, error: `DB update: ${err.message}` });
      failed++;
      await upsertItem(jobId, record.id, handler.tableName, oldPath, 'failed', newPath, `DB update: ${err.message}`);
      await updateJob(jobId, { processedFiles: i + 1, failedFiles: failed, errorLog: errors });
    }
  }

  const finalStatus =
    failed > 0 && migrated === 0 && missingSrc === 0 ? 'failed' :
    failed > 0 || missingSrc > 0                      ? 'partial' :
    'completed';

  await updateJob(jobId, {
    status:          finalStatus,
    processedFiles:  candidates.length,
    migratedFiles:   migrated,
    skippedFiles:    skipped,
    failedFiles:     failed,
    missingSrcFiles: missingSrc,
    errorLog:        errors.length ? errors : undefined,
    completedAt:     new Date(),
  });

  console.log(
    `${TAG} [job=${jobId}] Done. migrated=${migrated} skipped=${skipped} failed=${failed} status=${finalStatus}`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function triggerFileMigration(params: {
  ruleId:        number;
  documentType:  string;
  pathTemplate:  string;
  rootPrefix:    string;
  triggerReason: 'auto_db_driven' | 'auto_template_change' | 'manual' | 'dry_run';
  triggeredBy?:  number;
}): Promise<{ jobId: number }> {
  const [job] = await db.insert(gcsFileMigrationJobs).values({
    ruleId:         params.ruleId,
    documentType:   params.documentType,
    triggerReason:  params.triggerReason,
    triggeredBy:    params.triggeredBy ?? null,
    status:         'pending',
    totalFiles:     0,
    processedFiles: 0,
    migratedFiles:  0,
    skippedFiles:   0,
    failedFiles:    0,
  }).returning();

  console.log(`${TAG} Queued job ${job.id} for ${params.documentType} (${params.triggerReason})`);

  setImmediate(() => {
    runMigrationBackground(job.id, params.documentType, params.pathTemplate).catch(err => {
      console.error(`${TAG} Unhandled error in job ${job.id}:`, err);
      updateJob(job.id, {
        status:      'failed',
        completedAt: new Date(),
        errorLog:    [{ fileId: 0, oldPath: '', error: String(err) }],
      }).catch(() => {});
    });
  });

  return { jobId: job.id };
}

export function hasMigrationHandler(documentType: string): boolean {
  return documentType in HANDLERS;
}

// ── Dry-run preview (read-only — no GCS writes, no DB changes) ────────────────
//
// Creates a job record with trigger_reason='dry_run' and status='preview'
// so it can be used as an approval token for the actual migration.
// Returns an array of MigrationPreviewItem so the caller can render the table.

export async function previewMigration(params: {
  ruleId:        number;
  documentType:  string;
  pathTemplate:  string;
  rootPrefix:    string;
  triggeredBy?:  number;
}): Promise<{ jobId: number; alreadyCompliant: number; items: MigrationPreviewItem[] }> {
  const handler = HANDLERS[params.documentType];
  if (!handler) {
    throw new Error(`No migration handler for documentType=${params.documentType}`);
  }

  // Create the dry-run job record — used as approval token by the real migration route
  const [job] = await db.insert(gcsFileMigrationJobs).values({
    ruleId:         params.ruleId,
    documentType:   params.documentType,
    triggerReason:  'dry_run',
    triggeredBy:    params.triggeredBy ?? null,
    status:         'preview',
    totalFiles:     0,
    processedFiles: 0,
    migratedFiles:  0,
    skippedFiles:   0,
    failedFiles:    0,
  }).returning();

  console.log(`${TAG} Dry-run job ${job.id} started for ${params.documentType}`);

  const bucket = getBucket();
  const regex  = templateToRegex(params.pathTemplate);

  let allRecords: Array<{ id: number; filePath: string; [k: string]: any }> = [];
  try {
    allRecords = await handler.fetchAllRecords();
  } catch (err: any) {
    await db.update(gcsFileMigrationJobs)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(gcsFileMigrationJobs.id, job.id));
    throw err;
  }

  const candidates     = allRecords.filter(r => r.filePath && !regex.test(r.filePath));
  const alreadyCompliant = allRecords.length - candidates.length;
  const items: MigrationPreviewItem[] = [];

  for (const record of candidates) {
    // Build the new governed path
    let newPath: string | null = null;
    let buildError: string | undefined;
    try {
      newPath = handler.buildNewPath(record, params.pathTemplate);
    } catch (err: any) {
      buildError = `Path build failed: ${err.message}`;
    }

    // Check whether the source GCS object actually exists (no changes made)
    let sourceExists: boolean | null = null;
    if (bucket && !buildError) {
      try {
        [sourceExists] = await bucket.file(record.filePath).exists();
      } catch {
        sourceExists = null;   // GCS check itself failed — surface as null
      }
    }

    items.push({
      fileId:       record.id,
      tableName:    handler.tableName,
      oldPath:      record.filePath,
      newPath,
      sourceExists,
      filenameUsed: newPath ? path.basename(newPath) : null,
      ...(buildError ? { error: buildError } : {}),
    });
  }

  // Persist summary counts to the job record
  const failedCount = items.filter(i => i.error).length;
  const missingCount = items.filter(i => !i.error && i.sourceExists === false).length;
  await db.update(gcsFileMigrationJobs)
    .set({
      totalFiles:     candidates.length,
      skippedFiles:   alreadyCompliant,
      failedFiles:    failedCount,
      missingSrcFiles: missingCount,
      completedAt:    new Date(),
    })
    .where(eq(gcsFileMigrationJobs.id, job.id));

  console.log(
    `${TAG} Dry-run job ${job.id} done. candidates=${candidates.length} ` +
    `alreadyCompliant=${alreadyCompliant} pathErrors=${failedCount} missingSrc=${missingCount}`
  );

  return { jobId: job.id, alreadyCompliant, items };
}
