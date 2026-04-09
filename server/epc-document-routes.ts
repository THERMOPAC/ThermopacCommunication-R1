import express, { Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { epcDocumentAttachments, epcDocumentAccessLog } from '@shared/schema';
import { ensureAuthenticated } from './auth-middleware';
import { requireProjectMembership } from './utils/permission-utils';
import * as epcCoding from './epc-coding';
import { initializeGCS } from './utils/gcs-operations';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const UPLOAD_ROLES = ['Manager', 'Senior Manager', 'General Manager', 'Superuser'];
const WITHDRAW_RELEASED_ROLES = ['Senior Manager', 'General Manager', 'Superuser'];
const ACCESS_LOG_ROLES = ['General Manager', 'Superuser'];

const ENTITY_TABLE_MAP: Record<string, { table: string; numberColumn: string }> = {
  PLN: { table: 'item_planning_records', numberColumn: 'planning_number' },
  BUY: { table: 'procurement_execution_records', numberColumn: 'procurement_number' },
  MFG: { table: 'production_execution_records', numberColumn: 'production_number' },
  QPL: { table: 'quality_planning_records', numberColumn: 'quality_plan_number' },
  POP: { table: 'po_preparation_records', numberColumn: 'po_prep_number' },
  WOP: { table: 'wo_preparation_records', numberColumn: 'wo_prep_number' },
  DWG: { table: 'epc_drawing_controls', numberColumn: 'dwg_control_number' },
  BOM: { table: 'epc_bom_headers', numberColumn: 'bom_number' },
  PO:  { table: 'epc_purchase_orders', numberColumn: 'po_number' },
  WO:  { table: 'epc_work_orders', numberColumn: 'wo_number' },
  INS: { table: 'inspection_execution_records', numberColumn: 'inspection_number' },
  DR:  { table: 'epc_dispatch_readiness', numberColumn: 'dr_number' },
  DSP: { table: 'epc_dispatch_records', numberColumn: 'dispatch_number' },
  CR:  { table: 'epc_commissioning_readiness', numberColumn: 'cr_number' },
  BR:  { table: 'epc_billing_readiness', numberColumn: 'br_number' },
  INV: { table: 'epc_invoices', numberColumn: 'invoice_number' },
  QTN: { table: 'offers', numberColumn: 'offer_number' },
};

async function lookupParentEntity(docType: string, parentEntityId: number, projectId: number) {
  const mapping = ENTITY_TABLE_MAP[docType];
  if (!mapping) return null;
  if (docType === 'QTN') {
    const result = await db.execute(
      sql`SELECT id, ${sql.raw(mapping.numberColumn)} AS document_number, status FROM ${sql.raw(mapping.table)} WHERE id = ${parentEntityId}`
    );
    if (result.rows.length > 0) {
      return { ...(result.rows[0] as any), project_id: projectId };
    }
    return null;
  }
  const extraCols = (docType === 'DWG' || docType === 'BOM') ? ', revision_code, is_current' : '';
  const piJoin = (docType === 'DWG') ? ', project_item_id' : '';
  const result = await db.execute(
    sql`SELECT id, ${sql.raw(mapping.numberColumn)} AS document_number, project_id, status${sql.raw(extraCols)}${sql.raw(piJoin)} FROM ${sql.raw(mapping.table)} WHERE id = ${parentEntityId} AND project_id = ${projectId}`
  );
  return result.rows.length > 0 ? result.rows[0] as any : null;
}

async function getProjectCode(projectId: number): Promise<string | null> {
  const r = await db.execute(sql`SELECT code FROM projects WHERE id = ${projectId}`);
  return r.rows.length > 0 ? (r.rows[0] as any).code : null;
}

export function setupEpcDocumentRoutes(app: express.Express) {

  app.post('/api/projects/:projectId/epc-documents/:docType/:parentEntityId/upload',
    ensureAuthenticated, requireProjectMembership(), upload.single('file'), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const docType = req.params.docType.toUpperCase();
      const parentEntityId = parseInt(req.params.parentEntityId);
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (!UPLOAD_ROLES.includes(userRole)) {
        return res.status(403).json({ error: 'Not authorized to upload EPC document attachments' });
      }
      if (!ENTITY_TABLE_MAP[docType]) {
        return res.status(400).json({ error: `Invalid doc type: ${docType}. Valid: ${Object.keys(ENTITY_TABLE_MAP).join(', ')}` });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const attachmentLabel = (req.body.attachmentLabel || req.body.attachment_label || '').trim();
      if (!attachmentLabel) {
        return res.status(400).json({ error: 'attachment_label is required' });
      }

      const parent = await lookupParentEntity(docType, parentEntityId, projectId);
      if (!parent) {
        return res.status(404).json({ error: `Parent entity not found: ${docType} #${parentEntityId} in project ${projectId}` });
      }

      const geo = await epcCoding.resolveProjectGeoCodes(projectId);
      if (!geo.projectCode) {
        return res.status(400).json({ error: 'Project does not have a project code' });
      }

      const isRevisionControlled = epcCoding.REVISION_CONTROLLED_TYPES.has(docType);
      const revisionCode = isRevisionControlled ? (parent.revision_code || '00') : null;
      const documentNumber = parent.document_number;

      const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

      const dupCheck = await db.execute(
        sql`SELECT id, attachment_label, uploaded_at FROM epc_document_attachments
            WHERE document_number = ${documentNumber}
            AND revision_code IS NOT DISTINCT FROM ${revisionCode}
            AND checksum_sha256 = ${checksum}
            AND status IN ('active', 'withdrawn')`
      );

      if (dupCheck.rows.length > 0) {
        const dup = dupCheck.rows[0] as any;
        if (dup.attachment_label === attachmentLabel) {
          return res.status(409).json({
            error: 'This exact file is already attached to this document (active or previously withdrawn).',
            existingAttachmentId: dup.id,
            existingLabel: dup.attachment_label,
          });
        }
      }

      const { storage, bucket } = await initializeGCS();
      if (!storage || !bucket) {
        return res.status(500).json({ error: 'Failed to initialize Google Cloud Storage' });
      }

      const txResult = await db.transaction(async (tx) => {
        const seqResult = await tx.execute(
          sql`SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
              FROM epc_document_attachments
              WHERE document_number = ${documentNumber}
              AND revision_code IS NOT DISTINCT FROM ${revisionCode}`
        );
        const attachmentSeq = (seqResult.rows[0] as any).next_seq;

        let gcsObjectPath: string;
        if (docType === 'DWG' && parent.project_item_id) {
          const piRow = await tx.execute(
            sql`SELECT item_code, code_bars FROM project_items WHERE id = ${parent.project_item_id}`
          );
          const piData = piRow.rows[0] as any;
          if (piData?.code_bars) {
            const ext = req.file!.originalname.split('.').pop()?.toLowerCase() || 'pdf';
            const rev = revisionCode || '00';
            gcsObjectPath = `TPEL/${geo.continentCode}/${geo.countryCode}/${geo.customerShortCode}/${geo.fyCode}/${geo.projectSeq}/${piData.item_code}/DWG/${piData.code_bars}_rev-${rev}.${ext}`;
          } else {
            gcsObjectPath = epcCoding.buildEpcGcsPath(
              geo.continentCode, geo.countryCode, geo.customerShortCode, geo.fyCode,
              geo.projectSeq, docType, documentNumber,
              revisionCode, attachmentSeq, attachmentLabel, req.file!.originalname
            );
          }
        } else {
          gcsObjectPath = epcCoding.buildEpcGcsPath(
            geo.continentCode, geo.countryCode, geo.customerShortCode, geo.fyCode,
            geo.projectSeq, docType, documentNumber,
            revisionCode, attachmentSeq, attachmentLabel, req.file!.originalname
          );
        }

        const [inserted] = await tx.insert(epcDocumentAttachments).values({
          parentEntityType: ENTITY_TABLE_MAP[docType].table,
          parentEntityId,
          projectId,
          docType,
          documentNumber,
          isRevisionControlled,
          revisionCode,
          attachmentLabel,
          attachmentSeq,
          gcsBucket: 'thermopac_storage',
          gcsObjectPath,
          originalFileName: req.file!.originalname,
          mimeType: req.file!.mimetype,
          fileSizeBytes: req.file!.size,
          checksumSha256: checksum,
          status: 'active',
          isCurrent: true,
          uploadedBy: userId,
        }).returning();

        await tx.execute(sql`
          INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${projectId}, 'epc_document.uploaded', ${JSON.stringify({
            attachmentId: inserted.id, documentNumber, docType, revisionCode,
            originalFileName: req.file!.originalname, mimeType: req.file!.mimetype,
            fileSizeBytes: req.file!.size, checksumSha256: checksum,
            gcsObjectPath, uploadedBy: userId,
          })}::jsonb, 'epc_document_upload', NOW())
        `);

        return { inserted, attachmentSeq, gcsObjectPath };
      });

      const gcsFile = bucket.file(txResult.gcsObjectPath);
      await gcsFile.save(req.file.buffer, {
        contentType: req.file.mimetype,
        metadata: {
          metadata: {
            documentNumber,
            docType,
            revisionCode: revisionCode || 'na',
            projectId: String(projectId),
            uploadedBy: String(userId),
            checksumSha256: checksum,
          },
        },
      });

      const [signedUrl] = await gcsFile.getSignedUrl({
        action: 'read' as const,
        expires: Date.now() + 15 * 60 * 1000,
      });

      const warning = dupCheck.rows.length > 0
        ? `This file content is identical to existing attachment '${(dupCheck.rows[0] as any).attachment_label}' (id ${(dupCheck.rows[0] as any).id}). Duplicate allowed under different label.`
        : undefined;

      await db.insert(epcDocumentAccessLog).values({
        attachmentId: txResult.inserted.id,
        documentNumber,
        revisionCode: revisionCode || null,
        docType,
        projectId,
        action: 'upload',
        accessedBy: userId,
        ipAddress: (req.ip || req.socket.remoteAddress || '').substring(0, 45),
        userAgent: (req.headers['user-agent'] || '').substring(0, 500),
      });

      console.log(`[EPC-DOC] Uploaded ${documentNumber} ${docType} seq ${txResult.attachmentSeq} by user ${userId}`);
      res.status(201).json({
        success: true,
        attachment: txResult.inserted,
        previewUrl: signedUrl,
        warning,
      });
    } catch (error: any) {
      console.error('[EPC-DOC] Upload error:', error);
      res.status(500).json({ error: 'Failed to upload EPC document attachment' });
    }
  });

  app.get('/api/projects/:projectId/epc-documents/:documentNumber/download',
    ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documentNumber = req.params.documentNumber;
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'url';
      const seq = req.query.seq ? parseInt(req.query.seq as string) : 1;
      const requestedRevision = req.query.revision as string | undefined;
      const consumerContext = (req.query.context as string) || 'general';
      const snapshotRevision = req.query.snapshot_revision as string | undefined;

      const projCheck = await db.execute(sql`SELECT id FROM projects WHERE id = ${projectId}`);
      if (projCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const docTypeResult = await db.execute(
        sql`SELECT DISTINCT doc_type FROM epc_document_attachments
            WHERE document_number = ${documentNumber} AND project_id = ${projectId} LIMIT 1`
      );
      if (docTypeResult.rows.length === 0) {
        return res.status(404).json({ error: 'No attachments found for this document number' });
      }
      const docType = (docTypeResult.rows[0] as any).doc_type;
      const isRevControlled = epcCoding.REVISION_CONTROLLED_TYPES.has(docType);

      let targetRevision: string | null = null;
      let parentIsCurrent = true;

      if (isRevControlled) {
        if (requestedRevision) {
          targetRevision = requestedRevision;
          let revCheck;
          if (docType === 'DWG') {
            revCheck = await db.execute(
              sql`SELECT is_current FROM epc_drawing_controls
                  WHERE dwg_control_number = ${documentNumber} AND revision_code = ${requestedRevision} LIMIT 1`
            );
          } else {
            revCheck = await db.execute(
              sql`SELECT is_current FROM epc_bom_headers
                  WHERE bom_number = ${documentNumber} AND revision_code = ${requestedRevision} LIMIT 1`
            );
          }
          parentIsCurrent = revCheck.rows.length > 0 ? (revCheck.rows[0] as any).is_current : false;
        } else {
          const resolved = await epcCoding.resolveContextualRevision(
            documentNumber, docType as 'DWG' | 'BOM',
            consumerContext as any, db, snapshotRevision
          );
          if (!resolved) {
            return res.status(404).json({
              error: `No ${consumerContext === 'general' ? 'current' : consumerContext + '-released'} revision found for ${documentNumber}`,
            });
          }
          targetRevision = resolved.revisionCode;
          parentIsCurrent = resolved.isCurrent;
        }
      }

      let attachmentQuery;
      if (isRevControlled && targetRevision) {
        attachmentQuery = await db.execute(
          sql`SELECT * FROM epc_document_attachments
              WHERE document_number = ${documentNumber}
              AND project_id = ${projectId}
              AND revision_code = ${targetRevision}
              AND status = 'active' AND is_current = TRUE
              AND attachment_seq = ${seq}`
        );
      } else {
        attachmentQuery = await db.execute(
          sql`SELECT * FROM epc_document_attachments
              WHERE document_number = ${documentNumber}
              AND project_id = ${projectId}
              AND status = 'active'
              AND attachment_seq = ${seq}`
        );
      }

      if (attachmentQuery.rows.length === 0) {
        return res.status(404).json({ error: `No active attachment found (seq=${seq}${targetRevision ? ', rev=' + targetRevision : ''})` });
      }

      const attachment = attachmentQuery.rows[0] as any;

      let currentRevisionCode: string | null = null;
      if (isRevControlled && !parentIsCurrent) {
        const currentRev = await db.execute(
          sql`SELECT revision_code FROM epc_document_attachments
              WHERE document_number = ${documentNumber} AND project_id = ${projectId}
              AND is_current = TRUE AND status = 'active' LIMIT 1`
        );
        currentRevisionCode = currentRev.rows.length > 0 ? (currentRev.rows[0] as any).revision_code : null;
      }

      await db.insert(epcDocumentAccessLog).values({
        attachmentId: attachment.id,
        documentNumber,
        revisionCode: attachment.revision_code,
        docType: attachment.doc_type,
        projectId,
        action: mode === 'stream' ? 'stream' : 'download',
        accessedBy: userId,
        ipAddress: (req.ip || req.socket.remoteAddress || '').substring(0, 45),
        userAgent: (req.headers['user-agent'] || '').substring(0, 500),
      });

      if (mode === 'stream') {
        const { storage, bucket } = await initializeGCS();
        if (!storage || !bucket) {
          return res.status(500).json({ error: 'Failed to initialize GCS' });
        }
        const gcsFile = bucket.file(attachment.gcs_object_path);
        res.setHeader('Content-Type', attachment.mime_type);
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_file_name}"`);
        res.setHeader('Content-Length', String(attachment.file_size_bytes));
        res.setHeader('X-EPC-Document-Number', documentNumber);
        res.setHeader('X-EPC-Revision-Code', attachment.revision_code || 'na');
        res.setHeader('X-EPC-Is-Current-Revision', String(parentIsCurrent));
        const stream = gcsFile.createReadStream();
        stream.on('error', (err: any) => {
          console.error('[EPC-DOC] Stream error:', err);
          if (!res.headersSent) res.status(500).json({ error: 'Failed to stream file' });
        });
        stream.pipe(res);
        return;
      }

      const { storage, bucket } = await initializeGCS();
      if (!storage || !bucket) {
        return res.status(500).json({ error: 'Failed to initialize GCS' });
      }
      const gcsFile = bucket.file(attachment.gcs_object_path);
      const [signedUrl] = await gcsFile.getSignedUrl({
        action: 'read' as const,
        expires: Date.now() + 15 * 60 * 1000,
        responseDisposition: `attachment; filename="${attachment.original_file_name}"`,
        responseType: attachment.mime_type,
      });

      res.json({
        success: true,
        deliveryMode: 'signed_url',
        attachment: {
          id: attachment.id,
          documentNumber,
          revisionCode: attachment.revision_code,
          isCurrentRevision: parentIsCurrent,
          currentRevisionCode: !parentIsCurrent ? currentRevisionCode : undefined,
          isContextAppropriate: true,
          label: attachment.attachment_label,
          fileName: attachment.original_file_name,
          mimeType: attachment.mime_type,
          fileSizeBytes: attachment.file_size_bytes,
          checksumSha256: attachment.checksum_sha256,
          downloadUrl: signedUrl,
          urlExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });
    } catch (error: any) {
      console.error('[EPC-DOC] Download error:', error);
      res.status(500).json({ error: 'Failed to download EPC document' });
    }
  });

  app.get('/api/projects/:projectId/epc-documents/attachments/:attachmentId/download',
    ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const attachmentId = parseInt(req.params.attachmentId);
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'url';
      const allowNonActive = req.query.include_non_active === 'true';

      const attachResult = await db.execute(
        sql`SELECT * FROM epc_document_attachments WHERE id = ${attachmentId} AND project_id = ${projectId}`
      );
      if (attachResult.rows.length === 0) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      const attachment = attachResult.rows[0] as any;

      if (attachment.status !== 'active' && !allowNonActive) {
        return res.status(410).json({
          error: `Attachment is '${attachment.status}' and cannot be served by default. Use ?include_non_active=true to retrieve non-active attachments.`,
          attachmentId: attachment.id,
          status: attachment.status,
          documentNumber: attachment.document_number,
        });
      }

      let currentRevisionCode: string | null = null;
      if (attachment.is_revision_controlled && !attachment.is_current) {
        const currentRev = await db.execute(
          sql`SELECT revision_code FROM epc_document_attachments
              WHERE document_number = ${attachment.document_number} AND project_id = ${projectId}
              AND is_current = TRUE AND status = 'active' LIMIT 1`
        );
        currentRevisionCode = currentRev.rows.length > 0 ? (currentRev.rows[0] as any).revision_code : null;
      }

      await db.insert(epcDocumentAccessLog).values({
        attachmentId: attachment.id,
        documentNumber: attachment.document_number,
        revisionCode: attachment.revision_code,
        docType: attachment.doc_type,
        projectId,
        action: mode === 'stream' ? 'stream' : 'download',
        accessedBy: userId,
        ipAddress: (req.ip || req.socket.remoteAddress || '').substring(0, 45),
        userAgent: (req.headers['user-agent'] || '').substring(0, 500),
      });

      const { storage, bucket } = await initializeGCS();
      if (!storage || !bucket) {
        return res.status(500).json({ error: 'Failed to initialize GCS' });
      }
      const gcsFile = bucket.file(attachment.gcs_object_path);

      if (mode === 'stream') {
        res.setHeader('Content-Type', attachment.mime_type);
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_file_name}"`);
        res.setHeader('Content-Length', String(attachment.file_size_bytes));
        res.setHeader('X-EPC-Document-Number', attachment.document_number);
        res.setHeader('X-EPC-Revision-Code', attachment.revision_code || 'na');
        res.setHeader('X-EPC-Is-Current-Revision', String(attachment.is_current));
        res.setHeader('X-EPC-Document-Status', attachment.status);
        if (attachment.status !== 'active') {
          res.setHeader('X-EPC-Warning', `Document status is '${attachment.status}' — not the active version`);
        }
        const stream = gcsFile.createReadStream();
        stream.on('error', (err: any) => {
          console.error('[EPC-DOC] Stream error:', err);
          if (!res.headersSent) res.status(500).json({ error: 'Failed to stream file' });
        });
        stream.pipe(res);
        return;
      }

      const [signedUrl] = await gcsFile.getSignedUrl({
        action: 'read' as const,
        expires: Date.now() + 15 * 60 * 1000,
        responseDisposition: `attachment; filename="${attachment.original_file_name}"`,
        responseType: attachment.mime_type,
      });

      res.json({
        success: true,
        deliveryMode: 'signed_url',
        attachment: {
          id: attachment.id,
          documentNumber: attachment.document_number,
          revisionCode: attachment.revision_code,
          isCurrentRevision: attachment.is_current,
          currentRevisionCode,
          label: attachment.attachment_label,
          fileName: attachment.original_file_name,
          mimeType: attachment.mime_type,
          fileSizeBytes: attachment.file_size_bytes,
          checksumSha256: attachment.checksum_sha256,
          status: attachment.status,
          downloadUrl: signedUrl,
          urlExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });
    } catch (error: any) {
      console.error('[EPC-DOC] Attachment download error:', error);
      res.status(500).json({ error: 'Failed to download attachment' });
    }
  });

  app.get('/api/projects/:projectId/epc-documents/:docType/:parentEntityId/attachments',
    ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const docType = req.params.docType.toUpperCase();
      const parentEntityId = parseInt(req.params.parentEntityId);

      if (!ENTITY_TABLE_MAP[docType]) {
        return res.status(400).json({ error: `Invalid doc type: ${docType}` });
      }

      const parent = await lookupParentEntity(docType, parentEntityId, projectId);
      if (!parent) {
        return res.status(404).json({ error: 'Parent entity not found' });
      }

      const attachments = await db.execute(
        sql`SELECT eda.*, u.username AS uploaded_by_name
            FROM epc_document_attachments eda
            LEFT JOIN users u ON u.id = eda.uploaded_by
            WHERE eda.parent_entity_type = ${ENTITY_TABLE_MAP[docType].table}
            AND eda.parent_entity_id = ${parentEntityId}
            AND eda.project_id = ${projectId}
            ORDER BY eda.revision_code ASC NULLS FIRST, eda.attachment_seq ASC`
      );

      const isRevControlled = epcCoding.REVISION_CONTROLLED_TYPES.has(docType);

      if (isRevControlled) {
        const grouped: Record<string, any> = {};
        for (const row of attachments.rows as any[]) {
          const rev = row.revision_code || '00';
          if (!grouped[rev]) {
            grouped[rev] = {
              revisionCode: rev,
              isCurrent: row.is_current,
              status: row.is_current ? 'current' : 'superseded',
              attachments: [],
            };
          }
          grouped[rev].attachments.push({
            id: row.id,
            label: row.attachment_label,
            seq: row.attachment_seq,
            fileName: row.original_file_name,
            mimeType: row.mime_type,
            fileSizeBytes: row.file_size_bytes,
            checksumSha256: row.checksum_sha256,
            gcsPath: row.gcs_object_path,
            status: row.status,
            uploadedAt: row.uploaded_at,
            uploadedBy: row.uploaded_by_name,
          });
        }

        const revisions = Object.values(grouped).sort((a: any, b: any) => {
          if (a.isCurrent) return -1;
          if (b.isCurrent) return 1;
          return b.revisionCode.localeCompare(a.revisionCode);
        });

        const currentRev = revisions.find((r: any) => r.isCurrent);

        res.json({
          success: true,
          documentNumber: parent.document_number,
          isRevisionControlled: true,
          currentRevision: currentRev?.revisionCode || null,
          revisions,
        });
      } else {
        const items = (attachments.rows as any[]).map(row => ({
          id: row.id,
          label: row.attachment_label,
          seq: row.attachment_seq,
          fileName: row.original_file_name,
          mimeType: row.mime_type,
          fileSizeBytes: row.file_size_bytes,
          checksumSha256: row.checksum_sha256,
          gcsPath: row.gcs_object_path,
          status: row.status,
          uploadedAt: row.uploaded_at,
          uploadedBy: row.uploaded_by_name,
        }));

        res.json({
          success: true,
          documentNumber: parent.document_number,
          isRevisionControlled: false,
          attachments: items,
        });
      }
    } catch (error: any) {
      console.error('[EPC-DOC] List error:', error);
      res.status(500).json({ error: 'Failed to list attachments' });
    }
  });

  app.get('/api/projects/:projectId/epc-documents/:documentNumber/history',
    ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documentNumber = req.params.documentNumber;

      const attachments = await db.execute(
        sql`SELECT eda.*, u.username AS uploaded_by_name,
                   su.username AS superseded_by_name,
                   wu.username AS withdrawn_by_name
            FROM epc_document_attachments eda
            LEFT JOIN users u ON u.id = eda.uploaded_by
            LEFT JOIN users su ON su.id = eda.superseded_by
            LEFT JOIN users wu ON wu.id = eda.withdrawn_by
            WHERE eda.document_number = ${documentNumber}
            AND eda.project_id = ${projectId}
            ORDER BY eda.revision_code DESC NULLS LAST, eda.attachment_seq ASC`
      );

      if (attachments.rows.length === 0) {
        return res.status(404).json({ error: 'No attachments found for this document number' });
      }

      const firstRow = attachments.rows[0] as any;
      const isRevControlled = firstRow.is_revision_controlled;

      const history = (attachments.rows as any[]).map(row => ({
        id: row.id,
        revisionCode: row.revision_code,
        isCurrent: row.is_current,
        label: row.attachment_label,
        seq: row.attachment_seq,
        fileName: row.original_file_name,
        mimeType: row.mime_type,
        fileSizeBytes: row.file_size_bytes,
        checksumSha256: row.checksum_sha256,
        status: row.status,
        uploadedAt: row.uploaded_at,
        uploadedBy: row.uploaded_by_name,
        supersededAt: row.superseded_at,
        supersededBy: row.superseded_by_name,
        withdrawnAt: row.withdrawn_at,
        withdrawnBy: row.withdrawn_by_name,
        withdrawReason: row.withdraw_reason,
      }));

      res.json({
        success: true,
        documentNumber,
        isRevisionControlled: isRevControlled,
        docType: firstRow.doc_type,
        totalAttachments: history.length,
        history,
      });
    } catch (error: any) {
      console.error('[EPC-DOC] History error:', error);
      res.status(500).json({ error: 'Failed to get document history' });
    }
  });

  app.post('/api/projects/:projectId/epc-documents/attachments/:attachmentId/withdraw',
    ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const attachmentId = parseInt(req.params.attachmentId);
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const { reason } = req.body;

      const attachResult = await db.execute(
        sql`SELECT * FROM epc_document_attachments WHERE id = ${attachmentId} AND project_id = ${projectId}`
      );
      if (attachResult.rows.length === 0) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      const attachment = attachResult.rows[0] as any;

      if (attachment.status === 'superseded') {
        return res.status(400).json({ error: 'Cannot withdraw a superseded attachment. Superseded attachments are frozen by the revision system.' });
      }
      if (attachment.status !== 'active') {
        return res.status(400).json({ error: `Cannot withdraw: attachment status is '${attachment.status}', must be 'active'` });
      }

      const parentMapping = ENTITY_TABLE_MAP[attachment.doc_type];
      let parentStatus = 'draft';
      if (parentMapping) {
        const parentResult = await db.execute(
          sql`SELECT status FROM ${sql.raw(parentMapping.table)} WHERE id = ${attachment.parent_entity_id}`
        );
        if (parentResult.rows.length > 0) {
          parentStatus = (parentResult.rows[0] as any).status;
        }
      }

      const isReleased = ['released', 'approved', 'completed'].includes(parentStatus);

      if (isReleased) {
        if (!WITHDRAW_RELEASED_ROLES.includes(userRole)) {
          return res.status(403).json({ error: 'Only Senior Manager or above can withdraw attachments from released documents' });
        }
        if (!reason || reason.trim().length < 5) {
          return res.status(400).json({ error: 'Withdrawal reason is mandatory for released documents (minimum 5 characters)' });
        }
      } else {
        if (!UPLOAD_ROLES.includes(userRole)) {
          return res.status(403).json({ error: 'Not authorized to withdraw attachments' });
        }
      }

      await db.execute(
        sql`UPDATE epc_document_attachments
            SET status = 'withdrawn', is_current = FALSE,
                withdrawn_at = NOW(), withdrawn_by = ${userId},
                withdraw_reason = ${reason || null}
            WHERE id = ${attachmentId}`
      );

      await db.execute(sql`
        INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
        VALUES (${projectId}, 'epc_document.withdrawn', ${JSON.stringify({
          attachmentId, documentNumber: attachment.document_number,
          docType: attachment.doc_type, revisionCode: attachment.revision_code,
          withdrawnBy: userId, reason: reason || null,
          parentEntityStatus: parentStatus, wasReleased: isReleased,
        })}::jsonb, 'epc_document_control', NOW())
      `);

      await db.insert(epcDocumentAccessLog).values({
        attachmentId,
        documentNumber: attachment.document_number,
        revisionCode: attachment.revision_code,
        docType: attachment.doc_type,
        projectId,
        action: 'withdraw',
        accessedBy: userId,
        ipAddress: (req.ip || req.socket.remoteAddress || '').substring(0, 45),
        userAgent: (req.headers['user-agent'] || '').substring(0, 500),
      });

      console.log(`[EPC-DOC] Attachment ${attachmentId} withdrawn (${attachment.document_number}) by user ${userId}`);
      res.json({ success: true, message: 'Attachment withdrawn successfully' });
    } catch (error: any) {
      console.error('[EPC-DOC] Withdraw error:', error);
      res.status(500).json({ error: 'Failed to withdraw attachment' });
    }
  });

  app.post('/api/projects/:projectId/epc-documents/attachments/:attachmentId/reinstate',
    ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const attachmentId = parseInt(req.params.attachmentId);
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (!WITHDRAW_RELEASED_ROLES.includes(userRole)) {
        return res.status(403).json({ error: 'Only Senior Manager or above can reinstate withdrawn attachments' });
      }

      const attachResult = await db.execute(
        sql`SELECT * FROM epc_document_attachments WHERE id = ${attachmentId} AND project_id = ${projectId}`
      );
      if (attachResult.rows.length === 0) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      const attachment = attachResult.rows[0] as any;

      if (attachment.status !== 'withdrawn') {
        return res.status(400).json({ error: `Cannot reinstate: attachment status is '${attachment.status}', must be 'withdrawn'` });
      }

      let parentIsCurrent = true;
      if (attachment.is_revision_controlled && attachment.revision_code) {
        const parentMapping = ENTITY_TABLE_MAP[attachment.doc_type];
        if (parentMapping) {
          let parentCheck;
          if (attachment.doc_type === 'DWG') {
            parentCheck = await db.execute(
              sql`SELECT is_current FROM epc_drawing_controls
                  WHERE dwg_control_number = ${attachment.document_number}
                  AND revision_code = ${attachment.revision_code} LIMIT 1`
            );
          } else if (attachment.doc_type === 'BOM') {
            parentCheck = await db.execute(
              sql`SELECT is_current FROM epc_bom_headers
                  WHERE bom_number = ${attachment.document_number}
                  AND revision_code = ${attachment.revision_code} LIMIT 1`
            );
          }
          if (parentCheck && parentCheck.rows.length > 0) {
            parentIsCurrent = (parentCheck.rows[0] as any).is_current;
          } else {
            parentIsCurrent = false;
          }
        }
      }

      await db.execute(
        sql`UPDATE epc_document_attachments
            SET status = 'active', is_current = ${parentIsCurrent},
                withdrawn_at = NULL, withdrawn_by = NULL, withdraw_reason = NULL
            WHERE id = ${attachmentId}`
      );

      await db.execute(sql`
        INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
        VALUES (${projectId}, 'epc_document.reinstated', ${JSON.stringify({
          attachmentId, documentNumber: attachment.document_number,
          docType: attachment.doc_type, revisionCode: attachment.revision_code,
          reinstatedBy: userId,
        })}::jsonb, 'epc_document_control', NOW())
      `);

      await db.insert(epcDocumentAccessLog).values({
        attachmentId,
        documentNumber: attachment.document_number,
        revisionCode: attachment.revision_code,
        docType: attachment.doc_type,
        projectId,
        action: 'reinstate',
        accessedBy: userId,
        ipAddress: (req.ip || req.socket.remoteAddress || '').substring(0, 45),
        userAgent: (req.headers['user-agent'] || '').substring(0, 500),
      });

      console.log(`[EPC-DOC] Attachment ${attachmentId} reinstated (${attachment.document_number}) by user ${userId}`);
      res.json({ success: true, message: 'Attachment reinstated successfully' });
    } catch (error: any) {
      console.error('[EPC-DOC] Reinstate error:', error);
      res.status(500).json({ error: 'Failed to reinstate attachment' });
    }
  });

  app.get('/api/projects/:projectId/epc-documents/:documentNumber/access-log',
    ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documentNumber = req.params.documentNumber;
      const userRole = req.user!.role;

      if (!ACCESS_LOG_ROLES.includes(userRole)) {
        return res.status(403).json({ error: 'Only General Manager or Superuser can view access logs' });
      }

      const from = req.query.from ? new Date(req.query.from as string) : null;
      const to = req.query.to ? new Date(req.query.to as string) : null;
      const actionFilter = req.query.action as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const conditions = [
        sql`eal.document_number = ${documentNumber}`,
        sql`eal.project_id = ${projectId}`,
      ];
      if (from) conditions.push(sql`eal.accessed_at >= ${from}`);
      if (to) conditions.push(sql`eal.accessed_at <= ${to}`);
      if (actionFilter && actionFilter !== 'all') conditions.push(sql`eal.action = ${actionFilter}`);

      const whereClause = sql.join(conditions, sql` AND `);

      const countQuery = await db.execute(
        sql`SELECT COUNT(*) AS total FROM epc_document_access_log eal WHERE ${whereClause}`
      );
      const totalEntries = parseInt((countQuery.rows[0] as any).total) || 0;

      const query = await db.execute(
        sql`SELECT eal.*, u.username AS accessed_by_name, u.role AS accessed_by_role
            FROM epc_document_access_log eal
            LEFT JOIN users u ON u.id = eal.accessed_by
            WHERE ${whereClause}
            ORDER BY eal.accessed_at DESC
            LIMIT ${limit} OFFSET ${offset}`
      );

      res.json({
        success: true,
        documentNumber,
        totalEntries,
        page,
        pageSize: limit,
        totalPages: Math.ceil(totalEntries / limit),
        accessLog: (query.rows as any[]).map(row => ({
          id: row.id,
          attachmentId: row.attachment_id,
          revisionCode: row.revision_code,
          action: row.action,
          accessedBy: row.accessed_by_name,
          accessedByRole: row.accessed_by_role,
          accessedAt: row.accessed_at,
          ipAddress: row.ip_address,
        })),
      });
    } catch (error: any) {
      console.error('[EPC-DOC] Access log error:', error);
      res.status(500).json({ error: 'Failed to get access log' });
    }
  });

  console.log('EPC Document Attachment routes registered');
}

export async function markAttachmentsSuperseded(
  documentNumber: string,
  oldRevisionCode: string,
  userId: number,
  projectId: number,
  txOrDb: any
) {
  await txOrDb.execute(
    sql`UPDATE epc_document_attachments
        SET status = 'superseded', is_current = FALSE,
            superseded_at = NOW(), superseded_by = ${userId}
        WHERE document_number = ${documentNumber}
        AND revision_code = ${oldRevisionCode}
        AND status = 'active'`
  );

  await txOrDb.execute(sql`
    INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
    VALUES (${projectId}, 'epc_document.attachments_superseded', ${JSON.stringify({
      documentNumber, oldRevisionCode, supersededBy: userId,
    })}::jsonb, 'epc_document_control', NOW())
  `);
}
