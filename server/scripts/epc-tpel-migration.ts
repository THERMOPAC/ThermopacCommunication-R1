import pg from 'pg';
import { Storage } from '@google-cloud/storage';
import * as crypto from 'crypto';

const BATCH_SIZE = 20;
const DRY_RUN = process.argv.includes('--dry-run');

interface MigrationResult {
  attachmentId: number;
  oldPath: string;
  newPath: string;
  checksum: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  let storage: Storage;
  const creds = process.env.GOOGLE_CLOUD_CREDENTIALS;
  if (creds) {
    const parsed = JSON.parse(creds);
    storage = new Storage({ credentials: parsed, projectId: parsed.project_id });
  } else {
    storage = new Storage();
  }
  const bucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
  const bucket = storage.bucket(bucketName);

  console.log(`=== EPC → TPEL GCS Path Migration ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  // Fetch all active attachments that still have EPC/ prefix
  const allRecords = await pool.query(`
    SELECT e.id, e.gcs_object_path, e.checksum_sha256, e.doc_type, e.document_number,
           p.operational_code, p.fy_code,
           c.continent_code, c.country_code, c.short_code
    FROM epc_document_attachments e
    JOIN projects p ON p.id = e.project_id
    JOIN customers c ON c.id = p.customer_id
    WHERE e.status = 'active' AND e.gcs_object_path LIKE 'EPC/%'
    ORDER BY e.id
  `);

  console.log(`Records to migrate: ${allRecords.rows.length}`);
  
  if (allRecords.rows.length === 0) {
    console.log('Nothing to migrate. All records already on TPEL/ or no active records.');
    await pool.end();
    return;
  }

  // Validate all have geo codes
  const invalid = allRecords.rows.filter(r => !r.continent_code || !r.country_code || !r.short_code || !r.fy_code);
  if (invalid.length > 0) {
    console.error(`ABORT: ${invalid.length} records missing geo codes:`);
    for (const r of invalid) console.error(`  ID ${r.id}: cc=${r.continent_code} co=${r.country_code} sc=${r.short_code} fy=${r.fy_code}`);
    await pool.end();
    process.exit(1);
  }

  const results: MigrationResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  // Process in batches
  for (let i = 0; i < allRecords.rows.length; i += BATCH_SIZE) {
    const batch = allRecords.rows.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}: records ${i + 1}–${Math.min(i + BATCH_SIZE, allRecords.rows.length)}`);

    for (const record of batch) {
      const oldPath = record.gcs_object_path;
      const afterEpc = oldPath.replace(/^EPC\//, '');
      const newPath = `TPEL/${record.continent_code}/${record.country_code}/${record.short_code}/${record.fy_code}/${afterEpc}`;

      try {
        if (DRY_RUN) {
          console.log(`  [DRY] ID ${record.id}: ${oldPath} → ${newPath}`);
          results.push({ attachmentId: record.id, oldPath, newPath, checksum: record.checksum_sha256 || 'n/a', status: 'skipped' });
          skipCount++;
          continue;
        }

        // 1. Download source
        const sourceFile = bucket.file(oldPath);
        const [exists] = await sourceFile.exists();
        if (!exists) {
          const msg = `Source file does not exist in GCS: ${oldPath}`;
          console.warn(`  [SKIP] ID ${record.id}: ${msg}`);
          results.push({ attachmentId: record.id, oldPath, newPath, checksum: 'n/a', status: 'skipped', error: msg });
          skipCount++;
          continue;
        }

        const [sourceBuffer] = await sourceFile.download();
        const sourceChecksum = crypto.createHash('sha256').update(sourceBuffer).digest('hex');

        if (record.checksum_sha256 && record.checksum_sha256.length === 64 && sourceChecksum !== record.checksum_sha256) {
          const msg = `Pre-copy checksum mismatch: DB=${record.checksum_sha256}, GCS=${sourceChecksum}`;
          console.error(`  [FAIL] ID ${record.id}: ${msg}`);
          results.push({ attachmentId: record.id, oldPath, newPath, checksum: sourceChecksum, status: 'failed', error: msg });
          failCount++;
          continue;
        }
        if (record.checksum_sha256 && record.checksum_sha256.length !== 64) {
          console.log(`  [INFO] ID ${record.id}: DB has MD5 hash (${record.checksum_sha256.length} chars), will update to SHA-256 after copy`);
        }

        // 2. Copy to new path
        const [sourceMeta] = await sourceFile.getMetadata();
        const destFile = bucket.file(newPath);
        await destFile.save(sourceBuffer, {
          contentType: sourceMeta.contentType || 'application/octet-stream',
          metadata: {
            metadata: {
              ...(sourceMeta.metadata || {}),
              migratedFrom: oldPath,
              migratedAt: new Date().toISOString(),
            },
          },
        });

        // 3. Verify post-copy checksum
        const [verifyBuffer] = await destFile.download();
        const verifyChecksum = crypto.createHash('sha256').update(verifyBuffer).digest('hex');
        if (verifyChecksum !== sourceChecksum) {
          const msg = `Post-copy checksum mismatch: source=${sourceChecksum}, copy=${verifyChecksum}`;
          console.error(`  [FAIL] ID ${record.id}: ${msg}`);
          results.push({ attachmentId: record.id, oldPath, newPath, checksum: sourceChecksum, status: 'failed', error: msg });
          failCount++;
          continue;
        }

        await pool.query(
          `UPDATE epc_document_attachments SET gcs_object_path = $1, checksum_sha256 = $2 WHERE id = $3`,
          [newPath, verifyChecksum, record.id]
        );

        console.log(`  [OK]   ID ${record.id}: ${oldPath} → ${newPath} (sha256=${sourceChecksum.substring(0, 12)}…)`);
        results.push({ attachmentId: record.id, oldPath, newPath, checksum: sourceChecksum, status: 'success' });
        successCount++;
      } catch (err: any) {
        const msg = err.message || String(err);
        console.error(`  [FAIL] ID ${record.id}: ${msg}`);
        results.push({ attachmentId: record.id, oldPath, newPath, checksum: 'n/a', status: 'failed', error: msg });
        failCount++;
      }
    }
  }

  // Summary
  console.log(`\n=== Migration Summary ===`);
  console.log(`Total:   ${results.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed:  ${failCount}`);
  console.log(`Skipped: ${skipCount}`);

  if (failCount > 0) {
    console.log(`\n=== Failed Records ===`);
    for (const r of results.filter(r => r.status === 'failed')) {
      console.log(`  ID ${r.attachmentId}: ${r.error}`);
    }
  }

  // Verify final state
  const remaining = await pool.query(
    `SELECT COUNT(*) as cnt FROM epc_document_attachments WHERE status = 'active' AND gcs_object_path LIKE 'EPC/%'`
  );
  const migrated = await pool.query(
    `SELECT COUNT(*) as cnt FROM epc_document_attachments WHERE status = 'active' AND gcs_object_path LIKE 'TPEL/%'`
  );
  console.log(`\n=== Final DB State ===`);
  console.log(`Records still on EPC/: ${remaining.rows[0].cnt}`);
  console.log(`Records on TPEL/:     ${migrated.rows[0].cnt}`);

  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
