import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from './db';
import { customerOrderDocuments, commercialChangeOrders, projects } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { resolveProjectGeoCodes } from './epc-coding';
import { pool } from './db';
import { validateLabel } from '../shared/gcs-label-vocabulary';
import gcsClient, { bucketName } from './utils/storage-config';
import { resolveGcsPath, GcsGovernanceError } from './utils/gcs-path-resolver';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

async function getSignedUrl(gcsPath: string): Promise<string> {
  const bucket = gcsClient.bucket(bucketName);
  const file = bucket.file(gcsPath);
  const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
  return url;
}

/**
 * Upload a document for a Customer Order (CO).
 * POST /api/customer-order-documents
 * Body: { projectId, customerOrderNumber, documentLabel, revisionCode?, ccoId? }
 * File: multipart/form-data
 */
router.post('/', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { projectId, customerOrderNumber, documentLabel, revisionCode, ccoId } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!projectId || !customerOrderNumber || !documentLabel) {
      return res.status(400).json({ error: 'projectId, customerOrderNumber, and documentLabel are required' });
    }

    // G8: Validate CO label from controlled vocabulary
    const coLabel = (documentLabel || '').trim().toLowerCase();
    if (!coLabel || !validateLabel('CO', coLabel)) {
      return res.status(422).json({
        error: 'G8 violation: documentLabel must be selected from the CO controlled vocabulary. Free-text labels are not permitted.',
        allowedValues: ['letter-of-intent','purchase-order','advance-payment-proof','scope-of-supply','technical-specification','payment-terms','amendment'],
      });
    }

    const pid = parseInt(projectId);
    const geo = await resolveProjectGeoCodes(pid);

    const seqResult = await db.execute(
      sql`SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
          FROM customer_order_documents
          WHERE project_id = ${pid} AND customer_order_number = ${customerOrderNumber}`
    );
    const attachmentSeq = (seqResult.rows[0] as any).next_seq;

    // Build GCS path from CO_DOCUMENT governance rule (DB-driven — never hardcoded)
    const seq = String(attachmentSeq).padStart(3, '0');
    const labelSlug = documentLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';
    const revSuffix = `rev-${revisionCode?.trim() || '00'}`;
    const filename = `${seq}-${labelSlug}-${revSuffix}.pdf`;

    let gcsObjectPath: string;
    try {
      gcsObjectPath = await resolveGcsPath('CO_DOCUMENT', {
        CC:    geo.continentCode,
        CO:    geo.countryCode,
        Cust:  geo.customerCustToken,
        FY:    geo.fyCode,
        NNN:   geo.projectSeq,
        Seq:   seq,
        Label: labelSlug,
        rev:   revisionCode?.trim() || '00',
      });
    } catch (err: any) {
      if (err instanceof GcsGovernanceError) return res.status(503).json({ error: 'GCS_GOVERNANCE_ERROR', message: err.message });
      throw err;
    }

    const bucket = gcsClient.bucket(bucketName);
    const gcsFile = bucket.file(gcsObjectPath);
    await gcsFile.save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: {
        metadata: {
          projectId: String(pid), customerOrderNumber, documentLabel,
          uploadedBy: String(user.id),
        },
      },
    });

    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    const [doc] = await db.insert(customerOrderDocuments).values({
      ccoId: ccoId ? parseInt(ccoId) : null,
      projectId: pid,
      customerOrderNumber,
      documentLabel,
      revisionCode: revisionCode || null,
      attachmentSeq,
      gcsBucket: bucketName,
      gcsObjectPath,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      checksumSha256: checksum,
      status: 'active',
      isCurrent: true,
      uploadedBy: user.id,
    }).returning();

    // G2 + G3: Dual-Storage Policy — enqueue SAVE_FILE mirror job
    try {
      const mirrorJobRows = await db.execute(sql`
        INSERT INTO document_agent_jobs
          (job_type, status, relative_path, file_url, file_name, expected_sha256,
           source_module, source_record_id, created_by)
        VALUES ('SAVE_FILE', 'pending', ${gcsObjectPath}, NULL, ${req.file.originalname}, ${checksum},
                'customer_order_documents', ${doc.id}, ${user.id})
        RETURNING id
      `);
      const mirrorJobId = (mirrorJobRows.rows[0] as any).id as number;
      // G3: mark mirror_status on source record
      await db.execute(sql`
        UPDATE customer_order_documents SET mirror_status = 'pending', mirror_job_id = ${mirrorJobId}
        WHERE id = ${doc.id}
      `);
    } catch (mirrorErr) {
      // Mirror failure NEVER invalidates the GCS copy or DB record (Dual-Storage Policy)
      console.error(`[CO-docs] Mirror job enqueue failed for doc ${doc.id} — GCS copy remains valid:`, mirrorErr);
    }

    res.status(201).json(doc);
  } catch (err: any) {
    console.error('[CO-docs] Upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

/**
 * List documents for a customer order.
 * GET /api/customer-order-documents?projectId=X&customerOrderNumber=Y
 */
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, customerOrderNumber } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const conditions: any[] = [eq(customerOrderDocuments.projectId, parseInt(projectId as string))];
    if (customerOrderNumber) {
      conditions.push(eq(customerOrderDocuments.customerOrderNumber, customerOrderNumber as string));
    }

    const docs = await db.select()
      .from(customerOrderDocuments)
      .where(and(...conditions))
      .orderBy(desc(customerOrderDocuments.createdAt));

    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Download a customer order document (signed URL).
 * GET /api/customer-order-documents/:id/download
 */
router.get('/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(customerOrderDocuments).where(eq(customerOrderDocuments.id, id));
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const url = await getSignedUrl(doc.gcsObjectPath);
    res.json({ downloadUrl: url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a customer order document (soft delete + GCS delete).
 * DELETE /api/customer-order-documents/:id
 */
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(customerOrderDocuments).where(eq(customerOrderDocuments.id, id));
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    try {
      const bucket = gcsClient.bucket(bucketName);
      await bucket.file(doc.gcsObjectPath).delete();
    } catch (gcsErr) {
      console.warn('[CO-docs] GCS delete failed:', gcsErr);
    }

    await db.update(customerOrderDocuments)
      .set({ status: 'deleted', isCurrent: false, updatedAt: new Date() })
      .where(eq(customerOrderDocuments.id, id));

    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
