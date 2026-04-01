import { Storage } from '@google-cloud/storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { epcDocumentAttachments } from '@shared/schema';
import * as fs from 'fs';

const BUCKET_NAME = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';
const MANIFEST_PATH = '.local/wave1-migration-manifest.json';
const BATCH_SIZE = 30;

function getStorage(): Storage {
  const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
  if (credentials) {
    const parsed = JSON.parse(credentials);
    return new Storage({ projectId: parsed.project_id, credentials: parsed });
  }
  return new Storage();
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'png': 'image/png', 'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'keep': 'application/octet-stream',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('Manifest not found. Run epc-wave1-migration.ts scan first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  
  const alreadyCopied = await db.execute(
    sql`SELECT gcs_object_path FROM epc_document_attachments WHERE doc_type = 'INS'`
  );
  const existingPaths = new Set((alreadyCopied.rows as any[]).map(r => r.gcs_object_path));
  console.log(`Already in DB: ${existingPaths.size} EPC attachment records`);

  const pending = manifest.filter((e: any) => 
    e.status !== 'skipped_duplicate' && 
    e.operationalCode !== 'UNKNOWN' &&
    !existingPaths.has(e.epcPath)
  );
  
  console.log(`Total pending: ${pending.length} files (of ${manifest.length} total)`);
  
  if (pending.length === 0) {
    console.log('All files already migrated!');
    process.exit(0);
  }

  const batch = pending.slice(0, BATCH_SIZE);
  console.log(`Processing batch of ${batch.length} files...`);

  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  let copied = 0, skipped = 0, errors = 0;

  for (const entry of batch) {
    try {
      const sourceFile = bucket.file(entry.legacyPath);
      const destFile = bucket.file(entry.epcPath);
      
      const [destExists] = await destFile.exists();
      if (destExists) {
        const [destMeta] = await destFile.getMetadata();
        const checksum = destMeta.md5Hash
          ? Buffer.from(destMeta.md5Hash, 'base64').toString('hex')
          : 'unknown';
        
        await db.insert(epcDocumentAttachments).values({
          parentEntityType: entry.parentEntityType,
          parentEntityId: entry.parentEntityId,
          projectId: entry.projectId,
          docType: entry.docType,
          documentNumber: entry.documentNumber,
          isRevisionControlled: false,
          revisionCode: 'A',
          attachmentLabel: entry.tabName + '/' + entry.fileName,
          attachmentSeq: parseInt(entry.epcPath.split('/').pop()?.split('-')[0] || '1'),
          gcsBucket: BUCKET_NAME,
          gcsObjectPath: entry.epcPath,
          originalFileName: entry.fileName,
          mimeType: guessMimeType(entry.fileName),
          fileSizeBytes: parseInt(destMeta.size as string) || entry.size,
          checksumSha256: checksum,
          status: 'active',
          isCurrent: true,
          uploadedBy: 3,
        });
        skipped++;
        console.log(`  DB-ONLY (file exists): ${entry.epcPath}`);
        continue;
      }

      await sourceFile.copy(destFile);
      
      const [destMeta] = await destFile.getMetadata();
      const checksum = destMeta.md5Hash
        ? Buffer.from(destMeta.md5Hash, 'base64').toString('hex')
        : 'unknown';

      await db.insert(epcDocumentAttachments).values({
        parentEntityType: entry.parentEntityType,
        parentEntityId: entry.parentEntityId,
        projectId: entry.projectId,
        docType: entry.docType,
        documentNumber: entry.documentNumber,
        isRevisionControlled: false,
        revisionCode: 'A',
        attachmentLabel: entry.tabName + '/' + entry.fileName,
        attachmentSeq: parseInt(entry.epcPath.split('/').pop()?.split('-')[0] || '1'),
        gcsBucket: BUCKET_NAME,
        gcsObjectPath: entry.epcPath,
        originalFileName: entry.fileName,
        mimeType: guessMimeType(entry.fileName),
        fileSizeBytes: parseInt(destMeta.size as string) || entry.size,
        checksumSha256: checksum,
        status: 'active',
        isCurrent: true,
        uploadedBy: 3,
      });

      copied++;
      console.log(`  COPIED: ${entry.legacyPath} -> ${entry.epcPath}`);
    } catch (err: any) {
      errors++;
      console.error(`  ERROR: ${entry.legacyPath}: ${err.message}`);
    }
  }

  console.log(`\nBatch complete: ${copied} copied, ${skipped} db-only, ${errors} errors`);
  console.log(`Remaining: ${pending.length - batch.length} files`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
