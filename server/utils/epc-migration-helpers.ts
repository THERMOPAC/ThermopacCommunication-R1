import { db } from '../db';
import { sql } from 'drizzle-orm';
import { epcDocumentAttachments, legacyFileAccessLog } from '@shared/schema';

export async function resolveFilePathWithFallback(
  projectId: number,
  docType: string,
  documentNumber: string,
  parentEntityType: string,
  parentEntityId: number,
  legacyPath: string,
  userId: number
): Promise<{ path: string; source: 'epc' | 'legacy'; attachmentId?: number }> {
  const epcResult = await db.execute(
    sql`SELECT id, gcs_object_path, status FROM epc_document_attachments
        WHERE project_id = ${projectId}
        AND doc_type = ${docType}
        AND document_number = ${documentNumber}
        AND parent_entity_type = ${parentEntityType}
        AND parent_entity_id = ${parentEntityId}
        AND status = 'active'
        AND is_current = true
        ORDER BY uploaded_at DESC
        LIMIT 1`
  );

  if (epcResult.rows.length > 0) {
    const row = epcResult.rows[0] as any;
    return { path: row.gcs_object_path, source: 'epc', attachmentId: row.id };
  }

  await db.insert(legacyFileAccessLog).values({
    legacyPath: legacyPath,
    pathFamily: `PATH-17+18`,
    projectId,
    accessedBy: userId,
    action: 'download_fallback',
    migratedToEpc: false,
  });

  return { path: legacyPath, source: 'legacy' };
}

export async function resolveDrawingVersionWithFallback(
  versionId: number,
  legacyPath: string,
  userId: number
): Promise<{ path: string; source: 'epc' | 'legacy'; attachmentId?: number }> {
  const epcResult = await db.execute(
    sql`SELECT eda.id, eda.gcs_object_path
        FROM epc_document_attachments eda
        JOIN epc_drawing_controls edc ON edc.id = eda.parent_entity_id
        WHERE eda.parent_entity_type = 'epc_drawing_controls'
        AND eda.doc_type = 'DWG'
        AND eda.status = 'active'
        AND (edc.legacy_metadata->>'sourceTable') = 'drawing_versions'
        AND (edc.legacy_metadata->>'sourceRecordId')::int = ${versionId}
        ORDER BY eda.uploaded_at DESC
        LIMIT 1`
  );

  if (epcResult.rows.length > 0) {
    const row = epcResult.rows[0] as any;
    return { path: row.gcs_object_path, source: 'epc', attachmentId: row.id };
  }

  await db.insert(legacyFileAccessLog).values({
    legacyPath,
    pathFamily: 'PATH-05',
    projectId: null,
    accessedBy: userId,
    action: 'download_fallback',
    migratedToEpc: false,
  });

  return { path: legacyPath, source: 'legacy' };
}

export async function resolveBasicDrawingWithFallback(
  basicDrawingId: number,
  legacyPath: string,
  userId: number
): Promise<{ path: string; source: 'epc' | 'legacy'; attachmentId?: number }> {
  const epcResult = await db.execute(
    sql`SELECT eda.id, eda.gcs_object_path
        FROM epc_document_attachments eda
        JOIN epc_drawing_controls edc ON edc.id = eda.parent_entity_id
        WHERE eda.parent_entity_type = 'epc_drawing_controls'
        AND eda.doc_type = 'DWG'
        AND eda.status = 'active'
        AND (edc.legacy_metadata->>'sourceTable') = 'design_basic_drawings'
        AND (edc.legacy_metadata->>'sourceRecordId')::int = ${basicDrawingId}
        ORDER BY eda.uploaded_at DESC
        LIMIT 1`
  );

  if (epcResult.rows.length > 0) {
    const row = epcResult.rows[0] as any;
    return { path: row.gcs_object_path, source: 'epc', attachmentId: row.id };
  }

  await db.insert(legacyFileAccessLog).values({
    legacyPath,
    pathFamily: 'PATH-07',
    projectId: null,
    accessedBy: userId,
    action: 'download_fallback',
    migratedToEpc: false,
  });

  return { path: legacyPath, source: 'legacy' };
}

export async function isFeatureFlagEnabled(flagName: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT enabled FROM epc_migration_feature_flags WHERE flag_name = ${flagName} LIMIT 1`
  );
  if (result.rows.length === 0) return false;
  return (result.rows[0] as any).enabled === true;
}
