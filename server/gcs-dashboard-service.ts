import storage, { bucketName } from './utils/storage-config';
import { db } from './db';
import { gcsFileIndex, projects, customers } from '@shared/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { CONTINENT_CODES, COUNTRY_CODES } from './epc-coding';

let syncInProgress = false;
let lastSyncTime: Date | null = null;
let syncTimer: NodeJS.Timeout | null = null;

const SYNC_INTERVAL_MS = 10 * 60 * 1000;

export interface ParsedGcsPath {
  root: string | null;
  continentCode: string | null;
  countryCode: string | null;
  customerCode: string | null;
  fyCode: string | null;
  projectCode: string | null;
  docType: string | null;
  revision: string | null;
  fileName: string;
  folderPath: string;
}

export function parseGcsPath(filePath: string): ParsedGcsPath {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1] || '';
  const folderPath = parts.slice(0, -1).join('/');

  const result: ParsedGcsPath = {
    root: null,
    continentCode: null,
    countryCode: null,
    customerCode: null,
    fyCode: null,
    projectCode: null,
    docType: null,
    revision: null,
    fileName,
    folderPath,
  };

  if (parts.length < 2) return result;

  result.root = parts[0] || null;

  if (parts[0] !== 'TPEL') return result;

  // ── STAGING paths: TPEL/STAGING/{DocType}/{projectCode}/{drawingNumber}/rev-{rev}/.../{file}
  // These paths have NO CC/CO/Cust/FY segments. Applying the standard positional mapping
  // would assign the drawing number to fyCode, crashing the varchar(10) DB column.
  if (parts[1] === 'STAGING') {
    result.docType    = parts[2] || null;   // e.g. DRAWINGS
    result.projectCode = parts[3] || null;  // e.g. 2627-012
    // parts[4] = drawing number — intentionally NOT mapped to any structured field
    for (let i = 4; i < parts.length - 1; i++) {
      if (parts[i] && parts[i].startsWith('rev-')) {
        result.revision = parts[i].replace('rev-', '');
        break;
      }
    }
    return result;
  }

  // ── Standard TPEL paths: TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/...
  if (parts.length >= 2) result.continentCode = parts[1];
  if (parts.length >= 3) result.countryCode = parts[2];
  if (parts.length >= 4) result.customerCode = parts[3];
  if (parts.length >= 5) result.fyCode = parts[4];

  if (parts.length >= 6) {
    result.projectCode = parts[5];
  }

  if (parts.length >= 7) {
    result.docType = parts[6];
  }

  for (let i = 6; i < parts.length - 1; i++) {
    if (parts[i] && parts[i].startsWith('rev-')) {
      result.revision = parts[i].replace('rev-', '');
      break;
    }
  }

  return result;
}

export function fyCodeToLabel(fyCode: string | null): string | null {
  if (!fyCode) return null;
  if (/^\d{4}$/.test(fyCode)) {
    return `FY ${fyCode}`;
  }
  return fyCode;
}

interface ProjectRecord {
  id: number;
  code: string;
  customerId: number | null;
  continentCode: string;
  countryCode: string;
}

interface CustomerRecord {
  id: number;
  shortCode: string;
  bpName: string;
  continentCode: string | null;
  countryCode: string | null;
}

async function buildResolutionMaps() {
  const allProjects = await db.select({
    id: projects.id,
    code: projects.code,
    customerId: projects.customerId,
    continentCode: projects.continentCode,
    countryCode: projects.countryCode,
  }).from(projects);

  const allCustomers = await db.select({
    id: customers.id,
    shortCode: customers.shortCode,
    bpName: customers.bpName,
    continentCode: customers.continentCode,
    countryCode: customers.countryCode,
  }).from(customers);

  const projectByCode = new Map<string, ProjectRecord>();
  for (const p of allProjects) {
    projectByCode.set(p.code, p);
  }

  const customerById = new Map<number, CustomerRecord>();
  const customerByShortCode = new Map<string, CustomerRecord[]>();
  for (const c of allCustomers) {
    customerById.set(c.id, c);
    const existing = customerByShortCode.get(c.shortCode) || [];
    existing.push(c);
    customerByShortCode.set(c.shortCode, existing);
  }

  return { projectByCode, customerById, customerByShortCode };
}

function resolveCustomerName(
  parsed: ParsedGcsPath,
  projectByCode: Map<string, ProjectRecord>,
  customerById: Map<number, CustomerRecord>,
  customerByShortCode: Map<string, CustomerRecord[]>,
): { name: string | null; resolved: boolean } {
  if (!parsed.customerCode) return { name: null, resolved: true };

  if (parsed.projectCode) {
    const project = projectByCode.get(parsed.projectCode);
    if (project && project.customerId) {
      const customer = customerById.get(project.customerId);
      if (customer) {
        return { name: customer.bpName, resolved: true };
      }
    }
  }

  const candidates = customerByShortCode.get(parsed.customerCode);
  if (candidates && candidates.length === 1) {
    return { name: candidates[0].bpName, resolved: true };
  }

  if (candidates && candidates.length > 1 && parsed.countryCode) {
    const scoped = candidates.filter(c => c.countryCode === parsed.countryCode);
    if (scoped.length === 1) {
      return { name: scoped[0].bpName, resolved: true };
    }
    if (scoped.length > 1 && parsed.continentCode) {
      const furtherScoped = scoped.filter(c => c.continentCode === parsed.continentCode);
      if (furtherScoped.length === 1) {
        return { name: furtherScoped[0].bpName, resolved: true };
      }
    }
  }

  return { name: parsed.customerCode, resolved: false };
}

async function processGcsFile(
  file: any,
  projectByCode: Map<string, any>,
  customerById: Map<number, any>,
  customerByShortCode: Map<string, any>
): Promise<boolean> {
  if (file.name.endsWith('/')) return false;

  const parsed = parseGcsPath(file.name);
  const unresolvedFields: string[] = [];

  const continentName = parsed.continentCode ? (CONTINENT_CODES[parsed.continentCode] || null) : null;
  if (parsed.continentCode && !continentName) unresolvedFields.push('continent');

  const countryName = parsed.countryCode ? (COUNTRY_CODES[parsed.countryCode] || null) : null;
  if (parsed.countryCode && !countryName) unresolvedFields.push('country');

  const customerResolution = resolveCustomerName(parsed, projectByCode, customerById, customerByShortCode);
  if (parsed.customerCode && !customerResolution.resolved) unresolvedFields.push('customer');

  const project = parsed.projectCode ? projectByCode.get(parsed.projectCode) : null;
  if (parsed.projectCode && !project) unresolvedFields.push('project');

  const fyLabel = fyCodeToLabel(parsed.fyCode);

  const assuranceFlags: string[] = [];
  const pathDepth = file.name.split('/').length;
  if (parsed.root !== 'TPEL') {
    assuranceFlags.push('non_tpel_path');
  }
  if (parsed.root === 'TPEL' && parsed.projectCode && !project) {
    assuranceFlags.push('orphan_no_project_match');
  }
  if (parsed.root === 'TPEL' && !parsed.projectCode && pathDepth > 2) {
    assuranceFlags.push('misplaced_no_project_folder');
  }
  if (unresolvedFields.length > 0) {
    assuranceFlags.push('unresolved_mapping');
  }

  const metadata = file.metadata || {};
  const sizeBytes = metadata.size ? parseInt(metadata.size as string, 10) : null;
  const contentType = (metadata.contentType as string) || null;
  const updatedAt = metadata.updated ? new Date(metadata.updated as string) : null;

  await db.execute(sql`
    INSERT INTO gcs_file_index (
      bucket_name, file_path, file_name, folder_path,
      continent_code, continent_name, country_code, country_name,
      customer_code, customer_name, fy_code, fy_label,
      project_code, project_id, doc_type, revision,
      size_bytes, content_type, is_resolved, unresolved_fields,
      assurance_flags, gcs_updated_at, last_synced_at
    ) VALUES (
      ${bucketName}, ${file.name}, ${parsed.fileName}, ${parsed.folderPath},
      ${parsed.continentCode && parsed.continentCode.length <= 5 ? parsed.continentCode : null}, ${continentName || null}, ${parsed.countryCode && parsed.countryCode.length <= 5 ? parsed.countryCode : null}, ${countryName || null},
      ${parsed.customerCode}, ${customerResolution.name}, ${parsed.fyCode && parsed.fyCode.length <= 10 ? parsed.fyCode : null}, ${fyLabel},
      ${parsed.projectCode}, ${project?.id || null}, ${parsed.docType ? parsed.docType.substring(0, 100) : null}, ${parsed.revision ? parsed.revision.substring(0, 50) : null},
      ${sizeBytes}, ${contentType}, ${unresolvedFields.length === 0}, ${unresolvedFields.length > 0 ? sql`${'{' + unresolvedFields.join(',') + '}'}::text[]` : null},
      ${assuranceFlags.length > 0 ? sql`${'{' + assuranceFlags.join(',') + '}'}::text[]` : null},
      ${updatedAt}, NOW()
    )
    ON CONFLICT (file_path) DO UPDATE SET
      file_name = EXCLUDED.file_name,
      folder_path = EXCLUDED.folder_path,
      continent_code = EXCLUDED.continent_code,
      continent_name = EXCLUDED.continent_name,
      country_code = EXCLUDED.country_code,
      country_name = EXCLUDED.country_name,
      customer_code = EXCLUDED.customer_code,
      customer_name = EXCLUDED.customer_name,
      fy_code = EXCLUDED.fy_code,
      fy_label = EXCLUDED.fy_label,
      project_code = EXCLUDED.project_code,
      project_id = EXCLUDED.project_id,
      doc_type = EXCLUDED.doc_type,
      revision = EXCLUDED.revision,
      size_bytes = EXCLUDED.size_bytes,
      content_type = EXCLUDED.content_type,
      is_resolved = EXCLUDED.is_resolved,
      unresolved_fields = EXCLUDED.unresolved_fields,
      assurance_flags = EXCLUDED.assurance_flags,
      gcs_updated_at = EXCLUDED.gcs_updated_at,
      last_synced_at = NOW()
  `);

  return true;
}

export async function syncGcsIndex(): Promise<{ synced: number; errors: number }> {
  if (syncInProgress) {
    throw new Error('Sync already in progress');
  }

  syncInProgress = true;
  let synced = 0;
  let errors = 0;
  let totalProcessed = 0;

  try {
    console.log('[GCS-SYNC] Starting full bucket scan...');
    const bucket = storage.bucket(bucketName);

    const { projectByCode, customerById, customerByShortCode } = await buildResolutionMaps();

    const PAGE_SIZE = 100;
    let pageToken: string | undefined = undefined;
    let firstPage = true;

    do {
      const [pageFiles, , response] = await bucket.getFiles({
        autoPaginate: false,
        maxResults: PAGE_SIZE,
        pageToken,
      });

      if (firstPage) {
        console.log('[GCS-SYNC] Scanning bucket (paginated)...');
        firstPage = false;
      }

      for (const file of pageFiles) {
        try {
          const processed = await processGcsFile(file, projectByCode, customerById, customerByShortCode);
          if (processed) synced++;
        } catch (err) {
          errors++;
          console.error(`[GCS-SYNC] Error processing ${file.name}:`, err);
        }
        totalProcessed++;
      }

      if (totalProcessed % 200 === 0 || (pageToken === undefined && totalProcessed > 0)) {
        console.log(`[GCS-SYNC] Processed ${totalProcessed} files so far...`);
      }

      pageToken = response?.nextPageToken as string | undefined;

      await new Promise(resolve => setTimeout(resolve, 10));
    } while (pageToken);

    lastSyncTime = new Date();
    console.log(`[GCS-SYNC] Complete. Synced: ${synced}, Errors: ${errors}`);

    return { synced, errors };
  } finally {
    syncInProgress = false;
  }
}

export function getLastSyncTime(): Date | null {
  return lastSyncTime;
}

export function isSyncRunning(): boolean {
  return syncInProgress;
}

export function startAutoSync() {
  if (syncTimer) return;

  console.log(`[GCS-SYNC] Auto-sync scheduled every ${SYNC_INTERVAL_MS / 60000} minutes`);

  setTimeout(async () => {
    try {
      await syncGcsIndex();
    } catch (e) {
      console.error('[GCS-SYNC] Initial auto-sync failed:', e);
    }
  }, 30000);

  syncTimer = setInterval(async () => {
    try {
      await syncGcsIndex();
    } catch (e) {
      console.error('[GCS-SYNC] Auto-sync failed:', e);
    }
  }, SYNC_INTERVAL_MS);
}

export function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
