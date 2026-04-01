import { Storage } from '@google-cloud/storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { epcDocumentAttachments } from '@shared/schema';
import * as crypto from 'crypto';

const BUCKET_NAME = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';

interface ManifestEntry {
  legacyPath: string;
  projectCode: string;
  inspectionOrderNumber: string;
  tabName: string;
  fileName: string;
  size: number;
  md5Hash?: string;
  epcPath: string;
  docType: string;
  documentNumber: string;
  parentEntityType: string;
  parentEntityId: number;
  projectId: number;
  operationalCode: string;
  status: 'pending' | 'copied' | 'skipped_duplicate' | 'error';
  error?: string;
}

function getStorage(): Storage {
  const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
  if (credentials) {
    const parsed = JSON.parse(credentials);
    return new Storage({ projectId: parsed.project_id, credentials: parsed });
  }
  return new Storage();
}

function buildEpcPath(operationalCode: string, docType: string, documentNumber: string, revSlot: string, seq: number, label: string, ext: string): string {
  return `EPC/${operationalCode}/${docType}/${documentNumber}/${revSlot}/${seq}-${label}.${ext}`;
}

async function scanLegacyInspectionFiles(): Promise<ManifestEntry[]> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const [files] = await bucket.getFiles({ prefix: 'QMS/Inspections_Records/' });
  
  console.log(`Found ${files.length} files under QMS/Inspections_Records/`);
  
  const ioRows = await db.execute(
    sql`SELECT id, project_id, inspection_order_number, project_code FROM inspection_orders`
  );
  const ioMap = new Map<string, { id: number; projectId: number; projectCode: string }>();
  for (const row of ioRows.rows as any[]) {
    ioMap.set(row.inspection_order_number, { id: row.id, projectId: row.project_id, projectCode: row.project_code });
  }
  
  const projRows = await db.execute(
    sql`SELECT id, code, operational_code FROM projects WHERE operational_code IS NOT NULL`
  );
  const projMap = new Map<number, string>();
  for (const row of projRows.rows as any[]) {
    projMap.set(row.id, row.operational_code);
  }

  const manifest: ManifestEntry[] = [];
  
  for (const file of files) {
    const path = file.name;
    if (path.endsWith('/')) continue;
    
    const parts = path.replace('QMS/Inspections_Records/', '').split('/');
    if (parts.length < 3) {
      console.warn(`Skipping unrecognized path structure: ${path}`);
      continue;
    }
    
    let projectCode: string;
    let ioNumber: string;
    let tabName: string;
    let fileName: string;
    
    if (parts[0].match(/^IO-/)) {
      ioNumber = parts[0];
      tabName = parts[1];
      fileName = parts.slice(2).join('/');
      const ioData = ioMap.get(ioNumber);
      projectCode = ioData?.projectCode || 'UNKNOWN';
    } else {
      projectCode = parts[0];
      ioNumber = parts[1];
      tabName = parts[2];
      fileName = parts.slice(3).join('/');
    }
    
    const ioData = ioMap.get(ioNumber);
    if (!ioData) {
      console.warn(`No inspection order found for ${ioNumber} in path ${path}`);
      continue;
    }
    
    const operationalCode = projMap.get(ioData.projectId) || 'UNKNOWN';
    const ext = fileName.split('.').pop() || 'pdf';
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const docNumber = ioNumber;
    const seq = 1;
    const label = `${tabName}_${baseName}`.substring(0, 80);
    
    const epcPath = buildEpcPath(operationalCode, 'INS', docNumber, 'A', seq, label, ext);
    
    const fileSize = parseInt(file.metadata?.size as string) || 0;
    
    manifest.push({
      legacyPath: path,
      projectCode,
      inspectionOrderNumber: ioNumber,
      tabName,
      fileName,
      size: fileSize,
      md5Hash: file.metadata?.md5Hash || undefined,
      epcPath,
      docType: 'INS',
      documentNumber: docNumber,
      parentEntityType: 'inspection_order',
      parentEntityId: ioData.id,
      projectId: ioData.projectId,
      operationalCode,
      status: 'pending',
    });
  }
  
  return manifest;
}

async function deduplicateManifest(manifest: ManifestEntry[]): Promise<ManifestEntry[]> {
  const seenPaths = new Map<string, ManifestEntry>();
  const deduplicated: ManifestEntry[] = [];
  
  for (const entry of manifest) {
    const existing = seenPaths.get(entry.epcPath);
    if (existing) {
      if (entry.size > existing.size) {
        existing.status = 'skipped_duplicate';
        seenPaths.set(entry.epcPath, entry);
        deduplicated.push(entry);
      } else {
        entry.status = 'skipped_duplicate';
        deduplicated.push(entry);
      }
    } else {
      seenPaths.set(entry.epcPath, entry);
      deduplicated.push(entry);
    }
  }
  
  return deduplicated;
}

function assignUniqueSeqs(manifest: ManifestEntry[]): void {
  const seqCounters = new Map<string, number>();
  
  for (const entry of manifest) {
    if (entry.status === 'skipped_duplicate') continue;
    
    const groupKey = `${entry.operationalCode}|INS|${entry.documentNumber}|A`;
    const nextSeq = (seqCounters.get(groupKey) || 0) + 1;
    seqCounters.set(groupKey, nextSeq);
    
    const ext = entry.fileName.split('.').pop() || 'pdf';
    const baseName = entry.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const label = `${entry.tabName}_${baseName}`.substring(0, 80);
    entry.epcPath = buildEpcPath(entry.operationalCode, 'INS', entry.documentNumber, 'A', nextSeq, label, ext);
  }
}

async function executeCopyMigration(manifest: ManifestEntry[], dryRun: boolean = true): Promise<{ copied: number; skipped: number; errors: number }> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  
  let copied = 0, skipped = 0, errors = 0;
  
  const activePending = manifest.filter(e => e.status === 'pending');
  console.log(`${dryRun ? '[DRY-RUN]' : '[LIVE]'} Processing ${activePending.length} files for copy...`);
  
  for (const entry of activePending) {
    try {
      if (entry.operationalCode === 'UNKNOWN') {
        entry.status = 'error';
        entry.error = 'No operational code for project';
        errors++;
        continue;
      }
      
      const sourceFile = bucket.file(entry.legacyPath);
      const [exists] = await sourceFile.exists();
      if (!exists) {
        entry.status = 'error';
        entry.error = 'Source file not found in GCS';
        errors++;
        continue;
      }
      
      const destFile = bucket.file(entry.epcPath);
      const [destExists] = await destFile.exists();
      if (destExists) {
        entry.status = 'skipped_duplicate';
        skipped++;
        console.log(`  SKIP (exists): ${entry.epcPath}`);
        continue;
      }
      
      if (!dryRun) {
        await sourceFile.copy(destFile);
        
        const [destMetadata] = await destFile.getMetadata();
        const destSize = parseInt(destMetadata.size as string) || 0;
        if (Math.abs(destSize - entry.size) > 0 && entry.size > 0) {
          entry.status = 'error';
          entry.error = `Size mismatch: source=${entry.size} dest=${destSize}`;
          errors++;
          continue;
        }
        
        const sha256 = destMetadata.md5Hash
          ? Buffer.from(destMetadata.md5Hash, 'base64').toString('hex')
          : 'md5-' + (destMetadata.md5Hash || 'unknown');
        
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
          fileSizeBytes: entry.size,
          checksumSha256: sha256,
          status: 'active',
          isCurrent: true,
          uploadedBy: 3,
        });
        
        entry.status = 'copied';
        copied++;
        console.log(`  COPIED: ${entry.legacyPath} -> ${entry.epcPath}`);
      } else {
        entry.status = 'copied';
        copied++;
        console.log(`  [DRY-RUN] Would copy: ${entry.legacyPath} -> ${entry.epcPath}`);
      }
    } catch (err: any) {
      entry.status = 'error';
      entry.error = err.message;
      errors++;
      console.error(`  ERROR: ${entry.legacyPath}: ${err.message}`);
    }
  }
  
  return { copied, skipped, errors };
}

async function computeSha256FromGCS(bucket: any, objectPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = bucket.file(objectPath).createReadStream();
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

async function main() {
  const mode = process.argv[2] || 'scan';
  
  console.log(`=== EPC Wave 1 Migration - Mode: ${mode} ===`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  
  console.log('\n--- Step 1: Scanning legacy inspection files ---');
  const manifest = await scanLegacyInspectionFiles();
  console.log(`Scanned ${manifest.length} files`);
  
  console.log('\n--- Step 2: Deduplication + unique seq assignment ---');
  const deduped = await deduplicateManifest(manifest);
  assignUniqueSeqs(deduped);
  
  const pendingCount = deduped.filter(e => e.status === 'pending').length;
  const skipCount = deduped.filter(e => e.status === 'skipped_duplicate').length;
  console.log(`${pendingCount} files to copy, ${skipCount} duplicates to skip`);
  
  const manifestJson = JSON.stringify(deduped, null, 2);
  const fs = await import('fs');
  fs.writeFileSync('.local/wave1-migration-manifest.json', manifestJson);
  console.log(`Manifest saved to .local/wave1-migration-manifest.json`);
  
  if (mode === 'scan') {
    console.log('\n--- Scan-only mode. Run with "execute" to perform copies. ---');
    const byProject = new Map<string, number>();
    const byTab = new Map<string, number>();
    for (const e of deduped.filter(e => e.status === 'pending')) {
      byProject.set(e.projectCode, (byProject.get(e.projectCode) || 0) + 1);
      byTab.set(e.tabName, (byTab.get(e.tabName) || 0) + 1);
    }
    console.log('\nFiles by project:', Object.fromEntries(byProject));
    console.log('Files by tab:', Object.fromEntries(byTab));
    return;
  }
  
  if (mode === 'dry-run') {
    console.log('\n--- Step 3: Dry-run copy migration ---');
    const results = await executeCopyMigration(deduped, true);
    console.log(`\nDry-run results: ${results.copied} would copy, ${results.skipped} skip, ${results.errors} errors`);
    return;
  }
  
  if (mode === 'execute') {
    console.log('\n--- Step 3: Executing LIVE copy migration ---');
    const results = await executeCopyMigration(deduped, false);
    console.log(`\nMigration results: ${results.copied} copied, ${results.skipped} skipped, ${results.errors} errors`);
    
    fs.writeFileSync('.local/wave1-migration-results.json', JSON.stringify(deduped, null, 2));
    console.log('Results saved to .local/wave1-migration-results.json');
    return;
  }
  
  console.log(`Unknown mode: ${mode}. Use "scan", "dry-run", or "execute".`);
}

main().then(() => {
  console.log('\nDone.');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
