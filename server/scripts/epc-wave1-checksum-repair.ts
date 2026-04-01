import { Storage } from '@google-cloud/storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as crypto from 'crypto';

const BUCKET_NAME = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';
const BATCH_SIZE = 20;

function getStorage(): Storage {
  const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
  if (credentials) {
    const parsed = JSON.parse(credentials);
    return new Storage({ projectId: parsed.project_id, credentials: parsed });
  }
  return new Storage();
}

async function computeSha256(bucket: any, objectPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = bucket.file(objectPath).createReadStream();
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main() {
  const badRows = await db.execute(
    sql`SELECT id, gcs_object_path, checksum_sha256 
        FROM epc_document_attachments 
        WHERE doc_type = 'INS' AND LENGTH(checksum_sha256) != 64
        ORDER BY id
        LIMIT ${BATCH_SIZE}`
  );

  if (badRows.rows.length === 0) {
    const totalBad = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM epc_document_attachments WHERE doc_type = 'INS' AND LENGTH(checksum_sha256) != 64`
    );
    console.log(`All checksums are valid SHA-256 (64 hex chars). Bad count: ${(totalBad.rows[0] as any).cnt}`);
    return;
  }

  console.log(`Repairing ${badRows.rows.length} checksums (batch of ${BATCH_SIZE})...`);
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);

  let fixed = 0, errors = 0;
  for (const row of badRows.rows as any[]) {
    try {
      const sha256 = await computeSha256(bucket, row.gcs_object_path);
      await db.execute(
        sql`UPDATE epc_document_attachments SET checksum_sha256 = ${sha256} WHERE id = ${row.id}`
      );
      fixed++;
      console.log(`  FIXED id=${row.id}: ${row.checksum_sha256} → ${sha256}`);
    } catch (err: any) {
      errors++;
      console.error(`  ERROR id=${row.id} path=${row.gcs_object_path}: ${err.message}`);
    }
  }

  const remaining = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM epc_document_attachments WHERE doc_type = 'INS' AND LENGTH(checksum_sha256) != 64`
  );
  console.log(`\nBatch done: ${fixed} fixed, ${errors} errors. Remaining: ${(remaining.rows[0] as any).cnt}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
