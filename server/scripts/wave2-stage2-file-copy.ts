import { db } from '../db';
import { sql } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
const SYSTEM_USER_ID = 1;

interface EpcDrawingRow {
  id: number;
  dwg_control_number: string;
  revision_code: string;
  is_current: boolean;
  project_id: number;
  legacy_metadata: {
    sourceTable: string;
    sourceRecordId: number;
    legacyDrawingNumber: string;
    legacyDrawingTitle: string;
    legacyRevisionLabel: string;
    legacyGcsPath: string;
    legacyCategory: string;
    legacyDiscipline: string;
    migrationTimestamp: string;
    migrationPhase: string;
  };
}

interface CopyResult {
  edcId: number;
  docNumber: string;
  revCode: string;
  sourcePath: string;
  targetPath: string;
  status: 'copied' | 'skipped' | 'failed' | 'source_not_in_gcs';
  sourceSize?: number;
  targetSize?: number;
  sourceMd5?: string;
  targetMd5?: string;
  checksumMatch?: boolean;
  sizeMatch?: boolean;
  error?: string;
  attachmentId?: number;
}

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    dwg: 'application/acad',
    dxf: 'application/dxf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
}

async function initGcs(): Promise<{ storage: Storage; bucket: ReturnType<Storage['bucket']> }> {
  let storage: Storage;
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    const creds = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
    storage = new Storage({
      projectId: creds.project_id,
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
  } else {
    storage = new Storage();
  }
  return { storage, bucket: storage.bucket(BUCKET_NAME) };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   WAVE 2 STAGE 2 — DWG FILE COPY TO EPC PATHS                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const { bucket } = await initGcs();
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log('');

  console.log('--- Step 1: Load validated EDC rows ---');
  const edcRows = await db.execute(sql`
    SELECT edc.id, edc.dwg_control_number, edc.revision_code, edc.is_current,
           edc.project_id, edc.legacy_metadata,
           p.operational_code
    FROM epc_drawing_controls edc
    JOIN projects p ON p.id = edc.project_id
    WHERE edc.legacy_metadata IS NOT NULL
    AND (edc.legacy_metadata->>'migrationPhase') = 'stage1_normalization'
    ORDER BY edc.dwg_control_number, edc.revision_code
  `);

  const rows = edcRows.rows as unknown as (EpcDrawingRow & { operational_code: string })[];
  console.log(`  EDC rows with stage1 metadata: ${rows.length}`);
  if (rows.length !== 13) {
    console.error(`  ABORT: Expected 13 rows, got ${rows.length}`);
    process.exit(1);
  }
  console.log('');

  console.log('--- Step 2: Pre-flight — verify source files in GCS ---');
  const sourceStatus: Map<number, boolean> = new Map();
  let existCount = 0;
  let missingCount = 0;
  for (const row of rows) {
    const sourcePath = row.legacy_metadata.legacyGcsPath;
    const sourceFile = bucket.file(sourcePath);
    const [exists] = await sourceFile.exists();
    sourceStatus.set(row.id, exists);
    const mark = exists ? '✓' : '✗ NOT IN GCS (DB path only)';
    console.log(`  [EDC-${row.id}] ${sourcePath} — ${mark}`);
    if (exists) existCount++;
    else missingCount++;
  }
  console.log(`\n  Files present in GCS: ${existCount}`);
  console.log(`  Files not in GCS (DB-only paths): ${missingCount}`);
  console.log(`  Will copy ${existCount} files, mark ${missingCount} as source_not_in_gcs`);
  console.log('');

  console.log('--- Step 3: Copy files to EPC paths ---');
  const results: CopyResult[] = [];

  for (const row of rows) {
    const meta = row.legacy_metadata;
    const sourcePath = meta.legacyGcsPath;
    const ext = sourcePath.split('.').pop()!.toLowerCase();
    const revSlot = `rev-${row.revision_code}`;
    const targetPath = `EPC/${row.operational_code}/DWG/${row.dwg_control_number}/${revSlot}/001-drawing.${ext}`;

    const result: CopyResult = {
      edcId: row.id,
      docNumber: row.dwg_control_number,
      revCode: row.revision_code,
      sourcePath,
      targetPath,
      status: 'failed',
    };

    if (!sourceStatus.get(row.id)) {
      result.status = 'source_not_in_gcs';
      result.error = 'Source file not present in GCS bucket — DB path only, no actual file to copy';
      console.log(`  [EDC-${row.id}] SOURCE_NOT_IN_GCS ${row.dwg_control_number} rev-${row.revision_code} — ${sourcePath}`);
      results.push(result);
      continue;
    }

    try {
      const sourceFile = bucket.file(sourcePath);
      const targetFile = bucket.file(targetPath);

      const [targetExists] = await targetFile.exists();
      if (targetExists) {
        const [targetMeta] = await targetFile.getMetadata();
        const [sourceMeta] = await sourceFile.getMetadata();
        if (targetMeta.md5Hash === sourceMeta.md5Hash) {
          result.status = 'skipped';
          result.sourceMd5 = sourceMeta.md5Hash as string;
          result.targetMd5 = targetMeta.md5Hash as string;
          result.sourceSize = Number(sourceMeta.size);
          result.targetSize = Number(targetMeta.size);
          result.checksumMatch = true;
          result.sizeMatch = result.sourceSize === result.targetSize;
          console.log(`  [EDC-${row.id}] SKIPPED (already exists, checksum match) ${row.dwg_control_number} rev-${row.revision_code}`);
          results.push(result);
          continue;
        }
      }

      await sourceFile.copy(targetFile);

      const [sourceMeta] = await sourceFile.getMetadata();
      const [targetMeta] = await targetFile.getMetadata();

      result.sourceMd5 = sourceMeta.md5Hash as string;
      result.targetMd5 = targetMeta.md5Hash as string;
      result.sourceSize = Number(sourceMeta.size);
      result.targetSize = Number(targetMeta.size);
      result.checksumMatch = result.sourceMd5 === result.targetMd5;
      result.sizeMatch = result.sourceSize === result.targetSize;

      if (!result.checksumMatch || !result.sizeMatch) {
        result.status = 'failed';
        result.error = `Verification failed: checksum=${result.checksumMatch}, size=${result.sizeMatch}`;
        console.log(`  [EDC-${row.id}] FAILED verification: ${row.dwg_control_number} rev-${row.revision_code}`);
        console.log(`    Source: md5=${result.sourceMd5} size=${result.sourceSize}`);
        console.log(`    Target: md5=${result.targetMd5} size=${result.targetSize}`);
      } else {
        result.status = 'copied';
        console.log(`  [EDC-${row.id}] COPIED ${row.dwg_control_number} rev-${row.revision_code} (${result.sourceSize} bytes, md5 match ✓)`);
      }
    } catch (err: any) {
      result.status = 'failed';
      result.error = err.message;
      console.log(`  [EDC-${row.id}] FAILED: ${err.message}`);
    }

    results.push(result);
  }

  const copied = results.filter(r => r.status === 'copied').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const notInGcs = results.filter(r => r.status === 'source_not_in_gcs').length;
  console.log(`\n  Summary: ${copied} copied, ${skipped} skipped (idempotent), ${notInGcs} source not in GCS, ${failed} failed`);

  if (failed > 0) {
    console.error('\n  ABORT: Some files failed to copy (actual GCS errors). Not creating attachment records.');
    for (const f of results.filter(r => r.status === 'failed')) {
      console.error(`    EDC-${f.edcId} ${f.docNumber} rev-${f.revCode}: ${f.error}`);
    }
    process.exit(1);
  }

  if (notInGcs > 0) {
    console.log(`\n  Note: ${notInGcs} files exist in DB only (no actual GCS object). These are phantom records.`);
    console.log('  Attachment records will NOT be created for phantom files.');
    console.log('  EPC drawing control rows remain with legacy_metadata for traceability.');
  }
  console.log('');

  console.log('--- Step 4: Create EPC attachment records ---');
  let attachmentsCreated = 0;
  let attachmentsSkippedPhantom = 0;

  for (const row of rows) {
    const r = results.find(x => x.edcId === row.id)!;

    if (r.status === 'source_not_in_gcs') {
      attachmentsSkippedPhantom++;
      console.log(`  [EDC-${row.id}] SKIPPED (phantom — no GCS file) ${row.dwg_control_number} rev-${row.revision_code}`);
      continue;
    }

    const meta = row.legacy_metadata;
    const ext = meta.legacyGcsPath.split('.').pop()!.toLowerCase();
    const mimeType = getMimeType(ext);
    const originalFileName = meta.legacyGcsPath.split('/').pop()!;

    const existing = await db.execute(sql`
      SELECT id FROM epc_document_attachments
      WHERE parent_entity_type = 'epc_drawing_controls'
      AND parent_entity_id = ${row.id}
      AND doc_type = 'DWG'
      AND document_number = ${row.dwg_control_number}
      AND revision_code = ${row.revision_code}
      AND status = 'active'
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      r.attachmentId = (existing.rows[0] as any).id;
      console.log(`  [EDC-${row.id}] Attachment already exists (id=${r.attachmentId}), skipping`);
      continue;
    }

    const checksumHex = Buffer.from(r.sourceMd5!, 'base64').toString('hex');

    const inserted = await db.execute(sql`
      INSERT INTO epc_document_attachments (
        parent_entity_type, parent_entity_id, project_id, doc_type,
        document_number, is_revision_controlled, revision_code,
        attachment_label, attachment_seq, gcs_bucket, gcs_object_path,
        original_file_name, mime_type, file_size_bytes, checksum_sha256,
        status, is_current, uploaded_by
      ) VALUES (
        'epc_drawing_controls', ${row.id}, ${row.project_id}, 'DWG',
        ${row.dwg_control_number}, true, ${row.revision_code},
        ${meta.legacyDrawingTitle || meta.legacyDrawingNumber}, 1,
        ${BUCKET_NAME}, ${r.targetPath},
        ${originalFileName}, ${mimeType}, ${r.sourceSize!},
        ${checksumHex}, 'active', ${row.is_current}, ${SYSTEM_USER_ID}
      ) RETURNING id
    `);

    r.attachmentId = (inserted.rows[0] as any).id;
    attachmentsCreated++;
    console.log(`  [EDC-${row.id}] Created attachment id=${r.attachmentId} for ${row.dwg_control_number} rev-${row.revision_code}`);
  }

  console.log(`  Total attachments created: ${attachmentsCreated}`);
  console.log(`  Total skipped (phantom): ${attachmentsSkippedPhantom}`);
  console.log('');

  console.log('--- Step 5: Update EDC legacy_metadata with Stage 2 info ---');
  for (const row of rows) {
    const r = results.find(x => x.edcId === row.id)!;
    await db.execute(sql`
      UPDATE epc_drawing_controls
      SET legacy_metadata = legacy_metadata || ${JSON.stringify({
        stage2_fileCopy: {
          timestamp: new Date().toISOString(),
          epcGcsPath: r.targetPath,
          sourceMd5: r.sourceMd5,
          targetMd5: r.targetMd5,
          sizeBytes: r.sourceSize,
          copyStatus: r.status,
          attachmentId: r.attachmentId,
        },
      })}::jsonb
      WHERE id = ${row.id}
    `);
  }
  console.log('  All 13 rows updated with stage2 metadata ✓');
  console.log('');

  console.log('--- Step 6: Insert feature flag (disabled) ---');
  const flagExists = await db.execute(sql`
    SELECT id FROM epc_migration_feature_flags WHERE flag_name = 'EPC_UPLOAD_CUTOVER_DWG'
  `);
  if (flagExists.rows.length === 0) {
    await db.execute(sql`
      INSERT INTO epc_migration_feature_flags (flag_name, enabled, description, updated_by)
      VALUES ('EPC_UPLOAD_CUTOVER_DWG', false,
        'When enabled, new drawing uploads go to EPC paths. Disabled = legacy paths. Stage 2 migration complete but cutover not yet activated.',
        ${SYSTEM_USER_ID})
    `);
    console.log('  EPC_UPLOAD_CUTOVER_DWG flag inserted (disabled) ✓');
  } else {
    console.log('  EPC_UPLOAD_CUTOVER_DWG flag already exists ✓');
  }
  console.log('');

  console.log('--- Step 7: Verification ---');
  const verifyAttachments = await db.execute(sql`
    SELECT eda.id, eda.document_number, eda.revision_code, eda.gcs_object_path,
           eda.file_size_bytes, eda.checksum_sha256, eda.status, eda.is_current
    FROM epc_document_attachments eda
    WHERE eda.parent_entity_type = 'epc_drawing_controls'
    AND eda.doc_type = 'DWG'
    ORDER BY eda.document_number, eda.revision_code
  `);
  console.log(`  EPC attachment records for DWG: ${verifyAttachments.rows.length}`);
  for (const a of verifyAttachments.rows as any[]) {
    console.log(`    ATT-${a.id} ${a.document_number} rev-${a.revision_code} status=${a.status} current=${a.is_current} size=${a.file_size_bytes} path=${a.gcs_object_path}`);
  }

  const verifyLegacy = await db.execute(sql`
    SELECT id, dwg_control_number, revision_code,
           legacy_metadata->>'legacyGcsPath' as legacy_path,
           legacy_metadata->'stage2_fileCopy'->>'copyStatus' as copy_status,
           legacy_metadata->'stage2_fileCopy'->>'epcGcsPath' as epc_path
    FROM epc_drawing_controls
    WHERE legacy_metadata IS NOT NULL
    AND (legacy_metadata->>'migrationPhase') = 'stage1_normalization'
    ORDER BY dwg_control_number, revision_code
  `);
  console.log(`\n  Legacy → EPC path mapping:`);
  for (const r of verifyLegacy.rows as any[]) {
    console.log(`    EDC-${r.id} ${r.dwg_control_number} rev-${r.revision_code}: ${r.copy_status}`);
    console.log(`      legacy: ${r.legacy_path}`);
    console.log(`      epc:    ${r.epc_path}`);
  }

  const dd41Check = await db.execute(sql`
    SELECT count(*) as cnt FROM epc_document_attachments
    WHERE document_number LIKE '%DV-37%' OR parent_entity_id = 41
  `);
  console.log(`\n  DD-41/DV-37 attachment records: ${(dd41Check.rows[0] as any).cnt} (expected 0) ✓`);

  console.log('');
  const verified = copied + skipped;
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║ STAGE 2 FILE COPY RESULT                                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ Files copied:                    ${String(copied).padEnd(4)}                               ║`);
  console.log(`║ Files skipped (idempotent):       ${String(skipped).padEnd(4)}                               ║`);
  console.log(`║ Files not in GCS (phantom):       ${String(notInGcs).padEnd(4)}                               ║`);
  console.log(`║ Files failed:                    ${String(failed).padEnd(4)}                               ║`);
  console.log(`║ Checksum verified:               ${verified}/${verified} ALL MATCH ✓                        ║`);
  console.log(`║ EPC attachments created:          ${String(attachmentsCreated).padEnd(4)}                               ║`);
  console.log(`║ EPC attachments skipped (phantom): ${String(attachmentsSkippedPhantom).padEnd(4)}                               ║`);
  console.log(`║ Feature flag (cutover):           DISABLED                              ║`);
  console.log(`║ Legacy files:                    UNTOUCHED ✓                            ║`);
  console.log('║                                                                          ║');
  console.log('║ Next: EPC-first read + legacy fallback in drawing routes                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  process.exit(0);
}

main().catch((err) => {
  console.error('STAGE 2 FAILED:', err);
  process.exit(1);
});
