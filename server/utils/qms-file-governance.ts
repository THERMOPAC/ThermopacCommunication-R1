import { db } from '../db';
import { qmsDocumentRevisions, qmsDocumentAuditLog } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import { Storage } from '@google-cloud/storage';
import { issueUploadToken, validateUploadToken } from '../services/gcs-governance-service';

const MANAGER_PLUS_ROLES = ['Manager', 'Senior Manager', 'General Manager', 'Superuser'];
const ADMIN_ROLES = ['Superuser'];

export type QmsModule = 'Calibration' | 'WPQR' | 'PMA' | 'TestProcedures' | 'WelderCertificates' | 'WelderPhotos' | 'WelderManagement';

export type QmsAuditAction = 'upload' | 'download' | 'revision' | 'soft_delete' | 'restore' | 'view_list';

export interface QmsUploadResult {
  revisionId: number;
  gcsPath: string;
  revisionNumber: number;
  checksumSha256: string;
}

function getGcsStorage(): { bucket: ReturnType<Storage['bucket']> } {
  const credsJson = process.env.GOOGLE_CLOUD_CREDENTIALS;
  if (!credsJson) throw new Error('GOOGLE_CLOUD_CREDENTIALS not set');
  const credentials = JSON.parse(credsJson);
  const storage = new Storage({ projectId: credentials.project_id, credentials });
  return { bucket: storage.bucket(process.env.GCS_BUCKET_NAME || 'thermopac_storage') };
}

export function generateQmsPath(
  module: QmsModule,
  documentNumber: string,
  revisionNumber: number,
  sequence: number,
  label: string,
  fileExtension: string
): string {
  const ext = fileExtension.startsWith('.') ? fileExtension.slice(1) : fileExtension;
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return `QMS/${module}/${documentNumber}/rev-${revisionNumber}/${sequence}-${safeLabel}.${ext}`;
}

export function computeChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function verifyUploadedChecksum(gcsPath: string, expectedChecksum: string): Promise<boolean> {
  try {
    const { bucket } = getGcsStorage();
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) return false;

    return new Promise((resolve) => {
      const hash = crypto.createHash('sha256');
      const stream = file.createReadStream();
      stream.on('data', (chunk: Buffer) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex') === expectedChecksum));
      stream.on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
}

export function checkUploadPermission(userRole: string): { allowed: boolean; reason?: string } {
  if (MANAGER_PLUS_ROLES.includes(userRole)) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Upload requires Manager or above role. Current role: ${userRole}` };
}

export function checkDeletePermission(userRole: string): { allowed: boolean; reason?: string } {
  if (ADMIN_ROLES.includes(userRole)) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Delete requires Superuser role. Current role: ${userRole}` };
}

/**
 * Resolves the governance rule ID for a QMS document type.
 * Throws if the rule is missing or inactive — caller should surface as 500.
 */
export async function resolveQmsRuleId(documentType: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT id FROM gcs_governance_rules WHERE module_key = 'qms' AND document_type = ${documentType} AND active = true LIMIT 1`
  );
  const rows = (result as any).rows ?? result;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) throw new Error(`QMS governance rule '${documentType}' not found or inactive — check governance seed`);
  return Number(row.id);
}

export async function logAuditEvent(params: {
  module: QmsModule | string;
  documentNumber: string;
  revisionId?: number;
  action: QmsAuditAction;
  gcsPath?: string;
  userId: number;
  userRole?: string;
  ipAddress?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(qmsDocumentAuditLog).values({
      module: params.module,
      documentNumber: params.documentNumber,
      revisionId: params.revisionId || null,
      action: params.action,
      gcsPath: params.gcsPath || null,
      userId: params.userId,
      userRole: params.userRole || null,
      ipAddress: params.ipAddress || null,
      details: params.details || null,
    });
  } catch (err) {
    console.warn('QMS audit log write failed:', err);
  }
}

export async function getLatestRevision(
  moduleOrEntityType: string,
  documentNumberOrEntityId: string | number
): Promise<{ revisionNumber: number; revisionId: number; gcsPath: string; documentNumber: string; module: string; originalFileName: string } | null> {
  let row: typeof qmsDocumentRevisions.$inferSelect | undefined;

  if (typeof documentNumberOrEntityId === 'number') {
    [row] = await db
      .select()
      .from(qmsDocumentRevisions)
      .where(
        and(
          eq(qmsDocumentRevisions.parentEntityType, moduleOrEntityType),
          eq(qmsDocumentRevisions.parentEntityId, documentNumberOrEntityId),
          eq(qmsDocumentRevisions.isLatest, true),
          eq(qmsDocumentRevisions.isActive, true)
        )
      )
      .orderBy(desc(qmsDocumentRevisions.revisionNumber))
      .limit(1);
  } else {
    [row] = await db
      .select()
      .from(qmsDocumentRevisions)
      .where(
        and(
          eq(qmsDocumentRevisions.module, moduleOrEntityType),
          eq(qmsDocumentRevisions.documentNumber, documentNumberOrEntityId),
          eq(qmsDocumentRevisions.isLatest, true),
          eq(qmsDocumentRevisions.isActive, true)
        )
      )
      .orderBy(desc(qmsDocumentRevisions.revisionNumber))
      .limit(1);
  }

  if (!row) return null;
  return {
    revisionNumber: row.revisionNumber,
    revisionId: row.id,
    gcsPath: row.gcsPath,
    documentNumber: row.documentNumber,
    module: row.module,
    originalFileName: row.originalFileName,
  };
}

export async function getNextRevisionNumber(
  module: QmsModule,
  documentNumber: string
): Promise<number> {
  const [row] = await db
    .select({ maxRev: sql<number>`COALESCE(MAX(${qmsDocumentRevisions.revisionNumber}), 0)` })
    .from(qmsDocumentRevisions)
    .where(
      and(
        eq(qmsDocumentRevisions.module, module),
        eq(qmsDocumentRevisions.documentNumber, documentNumber)
      )
    );
  return (row?.maxRev || 0) + 1;
}

export async function createRevision(params: {
  module: QmsModule;
  documentNumber: string;
  label: string;
  fileBuffer: Buffer;
  originalFileName: string;
  contentType: string;
  parentEntityType: string;
  parentEntityId: number;
  userId: number;
  userRole: string;
  ipAddress?: string;
  ruleId?: number;
}): Promise<QmsUploadResult> {
  const uploadCheck = checkUploadPermission(params.userRole);
  if (!uploadCheck.allowed) {
    throw new Error(uploadCheck.reason);
  }

  const checksumSha256 = computeChecksum(params.fileBuffer);
  const nextRev = await getNextRevisionNumber(params.module, params.documentNumber);
  const ext = extractExtension(params.originalFileName, params.contentType);

  // Resolve GCS path — via governance token if ruleId provided; otherwise legacy path builder
  let gcsPath: string;
  let _tokenRaw: string | undefined;

  if (params.ruleId != null) {
    const tokenResult = await issueUploadToken({
      ruleId: params.ruleId,
      tokenValues: { DocNumber: params.documentNumber, rev: String(nextRev), Seq: '1', Label: params.label, ext },
      issuedTo: params.userId,
      ttlSeconds: 60,
      notes: `QMS internal upload: ${params.module}/${params.documentNumber} rev ${nextRev}`,
    });
    const expectedPath = generateQmsPath(params.module, params.documentNumber, nextRev, 1, params.label, ext);
    if (tokenResult.resolvedPath !== expectedPath) {
      throw new Error(
        `[QMS Gov] Path parity failure: token resolved "${tokenResult.resolvedPath}", expected "${expectedPath}". ` +
        `Governance seed template is out of sync for module=${params.module}.`
      );
    }
    gcsPath = tokenResult.resolvedPath;
    _tokenRaw = tokenResult.rawToken;
  } else {
    gcsPath = generateQmsPath(params.module, params.documentNumber, nextRev, 1, params.label, ext);
  }

  const { bucket } = getGcsStorage();
  const file = bucket.file(gcsPath);
  const [exists] = await file.exists();
  if (exists) {
    throw new Error(`GCS path already exists (non-destructive write enforced): ${gcsPath}`);
  }

  await file.save(params.fileBuffer, { contentType: params.contentType, resumable: false });

  // Validate and consume governance token — records used_at in gcs_upload_tokens ledger
  if (_tokenRaw != null) {
    const validation = await validateUploadToken({ rawToken: _tokenRaw, actualPath: gcsPath });
    if (!validation.valid) {
      console.error(`[QMS Gov] Token post-validation failed (${validation.reason}) for ${gcsPath} — upload succeeded, token ledger may be inconsistent`);
    }
  }

  const verified = await verifyUploadedChecksum(gcsPath, checksumSha256);
  if (!verified) {
    console.error(`Checksum verification failed for ${gcsPath}`);
  }

  const previousLatest = await getLatestRevision(params.module, params.documentNumber);

  await db.transaction(async (tx) => {
    if (previousLatest) {
      await tx
        .update(qmsDocumentRevisions)
        .set({ isLatest: false })
        .where(eq(qmsDocumentRevisions.id, previousLatest.revisionId));
    }

    await tx.insert(qmsDocumentRevisions).values({
      module: params.module,
      documentNumber: params.documentNumber,
      revisionNumber: nextRev,
      sequence: 1,
      label: params.label,
      fileExtension: ext,
      gcsPath,
      checksumSha256,
      fileSizeBytes: params.fileBuffer.length,
      originalFileName: params.originalFileName,
      contentType: params.contentType,
      isLatest: true,
      isActive: true,
      parentEntityType: params.parentEntityType,
      parentEntityId: params.parentEntityId,
      revisionOf: previousLatest?.revisionId || null,
      createdBy: params.userId,
    });
  });

  const [inserted] = await db
    .select()
    .from(qmsDocumentRevisions)
    .where(eq(qmsDocumentRevisions.gcsPath, gcsPath))
    .limit(1);

  await logAuditEvent({
    module: params.module,
    documentNumber: params.documentNumber,
    revisionId: inserted.id,
    action: previousLatest ? 'revision' : 'upload',
    gcsPath,
    userId: params.userId,
    userRole: params.userRole,
    ipAddress: params.ipAddress,
    details: {
      revisionNumber: nextRev,
      checksumSha256,
      fileSizeBytes: params.fileBuffer.length,
      originalFileName: params.originalFileName,
      previousRevisionId: previousLatest?.revisionId || null,
    },
  });

  return { revisionId: inserted.id, gcsPath, revisionNumber: nextRev, checksumSha256 };
}

export async function softDeleteRevision(params: {
  module?: QmsModule | string;
  documentNumber?: string;
  revisionId: number;
  userId: number;
  userRole: string;
  reason: string;
  ipAddress?: string;
}): Promise<void> {
  const deleteCheck = checkDeletePermission(params.userRole);
  if (!deleteCheck.allowed) {
    throw new Error(deleteCheck.reason);
  }

  const [rev] = await db
    .select()
    .from(qmsDocumentRevisions)
    .where(eq(qmsDocumentRevisions.id, params.revisionId))
    .limit(1);
  if (!rev) throw new Error(`Revision ${params.revisionId} not found`);
  if (!rev.isActive) throw new Error(`Revision ${params.revisionId} already deleted`);

  const module = (params.module || rev.module) as QmsModule;
  const documentNumber = params.documentNumber || rev.documentNumber;

  await db.transaction(async (tx) => {
    await tx
      .update(qmsDocumentRevisions)
      .set({
        isActive: false,
        isLatest: false,
        deletedBy: params.userId,
        deletedAt: new Date(),
        deleteReason: params.reason,
      })
      .where(eq(qmsDocumentRevisions.id, params.revisionId));

    if (rev.isLatest) {
      const [previousRev] = await tx
        .select()
        .from(qmsDocumentRevisions)
        .where(
          and(
            eq(qmsDocumentRevisions.module, module),
            eq(qmsDocumentRevisions.documentNumber, documentNumber),
            eq(qmsDocumentRevisions.isActive, true)
          )
        )
        .orderBy(desc(qmsDocumentRevisions.revisionNumber))
        .limit(1);

      if (previousRev) {
        await tx
          .update(qmsDocumentRevisions)
          .set({ isLatest: true })
          .where(eq(qmsDocumentRevisions.id, previousRev.id));
      }
    }
  });

  await logAuditEvent({
    module,
    documentNumber,
    revisionId: params.revisionId,
    action: 'soft_delete',
    gcsPath: rev.gcsPath,
    userId: params.userId,
    userRole: params.userRole,
    ipAddress: params.ipAddress,
    details: { reason: params.reason, revisionNumber: rev.revisionNumber },
  });
}

export async function getRevisionHistory(
  module: QmsModule,
  documentNumber: string
): Promise<Array<typeof qmsDocumentRevisions.$inferSelect>> {
  return db
    .select()
    .from(qmsDocumentRevisions)
    .where(
      and(
        eq(qmsDocumentRevisions.module, module),
        eq(qmsDocumentRevisions.documentNumber, documentNumber)
      )
    )
    .orderBy(desc(qmsDocumentRevisions.revisionNumber));
}

export async function logDownload(params: {
  module: QmsModule | string;
  documentNumber: string;
  revisionId?: number;
  gcsPath: string;
  userId: number;
  userRole?: string;
  ipAddress?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEvent({
    module: params.module,
    documentNumber: params.documentNumber,
    revisionId: params.revisionId,
    action: 'download',
    gcsPath: params.gcsPath,
    userId: params.userId,
    userRole: params.userRole,
    ipAddress: params.ipAddress,
    details: params.details,
  });
}

function extractExtension(filename: string, contentType: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx >= 0) return filename.slice(dotIdx + 1).toLowerCase();
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('msword') || contentType.includes('doc')) return 'doc';
  return 'bin';
}
