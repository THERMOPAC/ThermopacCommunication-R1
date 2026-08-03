/**
 * offer-comm-routes.ts
 *
 * Offer Communication Register — V1 API routes.
 * Registered under /api/sales-marketing by setupSalesMarketingRoutes().
 *
 * Routes:
 *   GET    /offers/:id/comm-categories
 *   GET    /offers/:id/communications
 *   POST   /offers/:id/communications
 *   GET    /offers/:id/communications/:commId
 *   PATCH  /offers/:id/communications/:commId
 *   POST   /offers/:id/communications/:commId/documents/upload
 *   POST   /offers/:id/communications/:commId/documents/:docId/revise
 *   GET    /offers/:id/communications/:commId/documents/:docId/download
 *   GET    /offer-comm-categories
 */

import { Router, Request, Response } from 'express';
import { db, pool } from './db';
import { eq, and, desc, asc } from 'drizzle-orm';
import multer from 'multer';
import crypto from 'crypto';
import {
  offerCommCategories,
  offerCommunications,
  offerCommDocuments,
  offers,
  users,
} from '@shared/schema';
import gcsClient, { bucketName as gcsBucketName } from './utils/storage-config';
import { enqueueMirrorJob } from './utils/mirror-job-service';
import { resolveGcsPathWithMeta, GcsGovernanceError } from './utils/gcs-path-resolver';
import { logUploadEvent } from './services/gcs-governance-service';
import { buildCustToken } from './utils/cust-token';

// ── Auth helper ───────────────────────────────────────────────────────────────
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ── Multer — memory storage, 50 MB max, all file types ───────────────────────
const commDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ── SHA-256 helper ────────────────────────────────────────────────────────────
function sha256hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── Resolve customer GCS params from offer ───────────────────────────────────
async function resolveOfferGcsParams(offerId: number) {
  const result = await pool.query(
    `SELECT o.offer_number, o.customer_id,
            c.bp_code, c.bp_name, c.short_code,
            c.continent_code, c.country_code
       FROM offers o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1`,
    [offerId]
  );
  // Return null only if the offer itself doesn't exist
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const fyMatch = /OFR-(\d{4})-/.exec(row.offer_number);
  const fyCode = fyMatch ? fyMatch[1] : 'XXXX';
  // Use fallback tokens when no customer is linked yet
  const customerToken = buildCustToken(row.bp_code || row.short_code || 'NOCUST', row.bp_name || 'Unknown Customer');
  return {
    offerNumber: row.offer_number as string,
    continentCode: (row.continent_code || 'XX') as string,
    countryCode: (row.country_code || 'XX') as string,
    customerToken,
    fyCode,
  };
}

// ── Next document sequence number for a communication + category ──────────────
async function nextDocSeq(communicationId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(file_name FROM '^(\\d+)') AS INTEGER)), 0) + 1 AS next_seq
       FROM offer_comm_documents
      WHERE communication_id = $1`,
    [communicationId]
  );
  return result.rows[0]?.next_seq ?? 1;
}

// ── Log to user_activity_logs ─────────────────────────────────────────────────
async function logActivity(
  userId: number,
  action: string,
  module: string,
  resourceType: string,
  resourceId: number,
  meta?: Record<string, unknown>
) {
  try {
    await pool.query(
      `INSERT INTO user_activity_logs
         (user_id, action, module, resource_type, resource_id, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, action, module, resourceType, resourceId, meta ? JSON.stringify(meta) : null]
    );
  } catch (e) {
    // Non-blocking — never throw
    console.warn('[offer-comm] logActivity failed:', (e as Error).message);
  }
}

// ── Notification helper ───────────────────────────────────────────────────────
async function maybeNotify(comm: {
  id: number;
  offerId: number;
  actionRequired: boolean;
  responsibleUserId: number | null;
  title: string;
  createdBy: number;
}) {
  if (!comm.actionRequired || !comm.responsibleUserId) return;
  try {
    const { createNotification } = await import('./notification-routes');
    await createNotification({
      userId: comm.responsibleUserId,
      type: 'task_assigned',
      title: 'Communication Action Required',
      message: `Action required on offer communication: ${comm.title}`,
      sourceType: 'offer_communication',
      sourceId: comm.id,
      createdBy: comm.createdBy,
    });
  } catch (e) {
    console.warn('[offer-comm] notification failed:', (e as Error).message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Router
// ═════════════════════════════════════════════════════════════════════════════
export function registerOfferCommRoutes(router: Router) {

  // ── GET /offer-comm-categories ────────────────────────────────────────────
  // Returns all 20 approved categories ordered by sort_order.
  router.get('/offer-comm-categories', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const cats = await db
        .select()
        .from(offerCommCategories)
        .where(eq(offerCommCategories.isActive, true))
        .orderBy(asc(offerCommCategories.sortOrder));
      res.json(cats);
    } catch (err: any) {
      console.error('[offer-comm] GET categories error:', err);
      res.status(500).json({ error: 'Failed to fetch communication categories' });
    }
  });

  // ── GET /offers/:id/comm-categories ──────────────────────────────────────
  // Same as above — scoped to offer for convenience.
  router.get('/offers/:id/comm-categories', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const cats = await db
        .select()
        .from(offerCommCategories)
        .where(eq(offerCommCategories.isActive, true))
        .orderBy(asc(offerCommCategories.sortOrder));
      res.json(cats);
    } catch (err: any) {
      console.error('[offer-comm] GET offer comm-categories error:', err);
      res.status(500).json({ error: 'Failed to fetch communication categories' });
    }
  });

  // ── GET /offers/:id/communications ───────────────────────────────────────
  router.get('/offers/:id/communications', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      if (isNaN(offerId)) return res.status(400).json({ error: 'Invalid offer ID' });

      const rows = await pool.query(
        `SELECT oc.id,
                oc.offer_id                  AS "offerId",
                oc.communication_category_id AS "communicationCategoryId",
                oc.comm_date                 AS "commDate",
                oc.title,
                oc.direction,
                oc.channel,
                oc.customer_contact          AS "customerContact",
                oc.customer_question         AS "customerQuestion",
                oc.summary,
                oc.action_required           AS "actionRequired",
                oc.responsible_user_id       AS "responsibleUserId",
                oc.due_date                  AS "dueDate",
                oc.status,
                oc.response_type             AS "responseType",
                oc.created_by                AS "createdBy",
                occ.display_label            AS "categoryLabel",
                occ.category_path            AS "categoryPath",
                occ.section                  AS "categorySection",
                u.first_name || ' ' || u.last_name   AS "createdByName",
                ru.first_name || ' ' || ru.last_name AS "responsibleName",
                (SELECT COUNT(*) FROM offer_comm_documents ocd
                  WHERE ocd.communication_id = oc.id AND ocd.is_current = true)::int AS "docCount"
           FROM offer_communications oc
           JOIN offer_comm_categories occ ON occ.id = oc.communication_category_id
           JOIN users u ON u.id = oc.created_by
           LEFT JOIN users ru ON ru.id = oc.responsible_user_id
          WHERE oc.offer_id = $1
          ORDER BY oc.comm_date DESC, oc.id DESC`,
        [offerId]
      );
      res.json(rows.rows);
    } catch (err: any) {
      console.error('[offer-comm] GET communications error:', err);
      res.status(500).json({ error: 'Failed to fetch communications' });
    }
  });

  // ── POST /offers/:id/communications ──────────────────────────────────────
  router.post('/offers/:id/communications', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      if (isNaN(offerId)) return res.status(400).json({ error: 'Invalid offer ID' });

      const userId = (req.user as any)?.id;
      const {
        communicationCategoryId, commDate, title, direction, channel,
        customerContact, fromParty, toParty, ccParty,
        customerQuestion, summary, actionRequired, responsibleUserId, dueDate, status,
        responseType,
      } = req.body;

      if (!communicationCategoryId) return res.status(400).json({ error: 'communicationCategoryId is required' });
      if (!commDate) return res.status(400).json({ error: 'commDate is required' });
      if (!title) return res.status(400).json({ error: 'title is required' });
      if (!direction) return res.status(400).json({ error: 'direction is required' });
      if (!channel) return res.status(400).json({ error: 'channel is required' });
      if (responseType === 'note_text' && !summary?.trim()) {
        return res.status(400).json({ error: 'summary is required when responseType is note_text' });
      }

      // Verify offer exists
      const offerCheck = await db.select({ id: offers.id }).from(offers).where(eq(offers.id, offerId)).limit(1);
      if (!offerCheck.length) return res.status(404).json({ error: 'Offer not found' });

      const [comm] = await db.insert(offerCommunications).values({
        offerId,
        communicationCategoryId: parseInt(communicationCategoryId),
        commDate,
        title,
        direction,
        channel,
        customerContact: customerContact || null,
        fromParty: fromParty || null,
        toParty: toParty || null,
        ccParty: ccParty || null,
        customerQuestion: customerQuestion || null,
        summary: summary || null,
        actionRequired: !!actionRequired,
        responsibleUserId: responsibleUserId ? parseInt(responsibleUserId) : null,
        dueDate: dueDate || null,
        status: status || 'Open',
        responseType: responseType || null,
        createdBy: userId,
      }).returning();

      await logActivity(userId, 'CREATE', 'offer_communications', 'offer_communication', comm.id, { offerId, title });
      await maybeNotify({ ...comm, createdBy: userId });

      res.status(201).json(comm);
    } catch (err: any) {
      console.error('[offer-comm] POST communication error:', err);
      res.status(500).json({ error: 'Failed to create communication' });
    }
  });

  // ── GET /offers/:id/communications/:commId ────────────────────────────────
  router.get('/offers/:id/communications/:commId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const commId = parseInt(req.params.commId);
      if (isNaN(offerId) || isNaN(commId)) return res.status(400).json({ error: 'Invalid IDs' });

      const commRows = await pool.query(
        `SELECT oc.*,
                occ.display_label AS category_label,
                occ.category_path,
                occ.section       AS category_section,
                u.first_name || ' ' || u.last_name AS created_by_name,
                ru.first_name || ' ' || ru.last_name AS responsible_name
           FROM offer_communications oc
           JOIN offer_comm_categories occ ON occ.id = oc.communication_category_id
           JOIN users u ON u.id = oc.created_by
           LEFT JOIN users ru ON ru.id = oc.responsible_user_id
          WHERE oc.id = $1 AND oc.offer_id = $2`,
        [commId, offerId]
      );
      if (!commRows.rows.length) return res.status(404).json({ error: 'Communication not found' });

      const docRows = await pool.query(
        `SELECT ocd.*,
                u.first_name || ' ' || u.last_name AS uploaded_by_name
           FROM offer_comm_documents ocd
           JOIN users u ON u.id = ocd.uploaded_by
          WHERE ocd.communication_id = $1
          ORDER BY ocd.revision DESC, ocd.uploaded_at DESC`,
        [commId]
      );

      res.json({ ...commRows.rows[0], documents: docRows.rows });
    } catch (err: any) {
      console.error('[offer-comm] GET single communication error:', err);
      res.status(500).json({ error: 'Failed to fetch communication' });
    }
  });

  // ── PATCH /offers/:id/communications/:commId ──────────────────────────────
  router.patch('/offers/:id/communications/:commId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const commId = parseInt(req.params.commId);
      if (isNaN(offerId) || isNaN(commId)) return res.status(400).json({ error: 'Invalid IDs' });

      const userId = (req.user as any)?.id;

      const existing = await db
        .select()
        .from(offerCommunications)
        .where(and(eq(offerCommunications.id, commId), eq(offerCommunications.offerId, offerId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ error: 'Communication not found' });

      const {
        communicationCategoryId, commDate, title, direction, channel,
        customerContact, fromParty, toParty, ccParty,
        customerQuestion, summary, actionRequired, responsibleUserId, dueDate, status,
        responseType,
      } = req.body;

      // note_text requires summary
      const effectiveResponseType = responseType !== undefined ? responseType : existing[0].responseType;
      const effectiveSummary = summary !== undefined ? summary : existing[0].summary;
      if (effectiveResponseType === 'note_text' && !effectiveSummary?.trim()) {
        return res.status(400).json({ error: 'summary is required when responseType is note_text' });
      }

      const updateData: Partial<typeof offerCommunications.$inferInsert> = { updatedAt: new Date() };
      if (communicationCategoryId !== undefined) updateData.communicationCategoryId = parseInt(communicationCategoryId);
      if (commDate !== undefined) updateData.commDate = commDate;
      if (title !== undefined) updateData.title = title;
      if (direction !== undefined) updateData.direction = direction;
      if (channel !== undefined) updateData.channel = channel;
      if (customerContact !== undefined) updateData.customerContact = customerContact || null;
      if (fromParty !== undefined) updateData.fromParty = fromParty || null;
      if (toParty !== undefined) updateData.toParty = toParty || null;
      if (ccParty !== undefined) updateData.ccParty = ccParty || null;
      if (customerQuestion !== undefined) updateData.customerQuestion = customerQuestion || null;
      if (summary !== undefined) updateData.summary = summary || null;
      if (actionRequired !== undefined) updateData.actionRequired = !!actionRequired;
      if (responsibleUserId !== undefined) updateData.responsibleUserId = responsibleUserId ? parseInt(responsibleUserId) : null;
      if (dueDate !== undefined) updateData.dueDate = dueDate || null;
      if (status !== undefined) updateData.status = status;
      if (responseType !== undefined) updateData.responseType = responseType || null;

      const [updated] = await db
        .update(offerCommunications)
        .set(updateData)
        .where(eq(offerCommunications.id, commId))
        .returning();

      const action = status !== undefined && status !== existing[0].status ? 'STATUS_CHANGE' : 'UPDATE';
      await logActivity(userId, action, 'offer_communications', 'offer_communication', commId, { offerId });

      if (updated.actionRequired && updated.responsibleUserId) {
        await maybeNotify({ ...updated, createdBy: userId });
      }

      res.json(updated);
    } catch (err: any) {
      console.error('[offer-comm] PATCH communication error:', err);
      res.status(500).json({ error: 'Failed to update communication' });
    }
  });

  // ── POST /offers/:id/communications/:commId/delete ───────────────────────
  // Uses POST because DELETE method falls through Vite middleware in dev; POST is reliable.
  router.post('/offers/:id/communications/:commId/delete', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const commId  = parseInt(req.params.commId);
      if (isNaN(offerId) || isNaN(commId)) return res.status(400).json({ error: 'Invalid IDs' });

      // Verify record belongs to this offer
      const existing = await db
        .select({ id: offerCommunications.id })
        .from(offerCommunications)
        .where(and(eq(offerCommunications.id, commId), eq(offerCommunications.offerId, offerId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ error: 'Communication record not found' });

      // Hard delete (documents cascade via FK)
      await db.delete(offerCommunications).where(eq(offerCommunications.id, commId));

      const userId = (req.user as any)?.id;
      await logActivity(userId, 'DELETE', 'offer_communications', 'offer_communication', commId, { offerId });

      res.json({ ok: true });
    } catch (err: any) {
      console.error('[offer-comm] DELETE communication error:', err);
      res.status(500).json({ error: 'Failed to delete communication' });
    }
  });

  // ── POST /offers/:id/communications/:commId/documents/upload ─────────────
  router.post(
    '/offers/:id/communications/:commId/documents/upload',
    ensureAuthenticated,
    commDocUpload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const offerId = parseInt(req.params.id);
        const commId = parseInt(req.params.commId);
        if (isNaN(offerId) || isNaN(commId)) return res.status(400).json({ error: 'Invalid IDs' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const userId = (req.user as any)?.id;
        const { label, documentType } = req.body;
        if (!label) return res.status(400).json({ error: 'label is required' });

        // Resolve comm record + category path
        const commCheck = await pool.query(
          `SELECT oc.id, occ.category_path
             FROM offer_communications oc
             JOIN offer_comm_categories occ ON occ.id = oc.communication_category_id
            WHERE oc.id = $1 AND oc.offer_id = $2`,
          [commId, offerId]
        );
        if (!commCheck.rows.length) return res.status(404).json({ error: 'Communication not found' });
        const { category_path: categoryPath } = commCheck.rows[0];

        // Resolve GCS params
        const gcsParams = await resolveOfferGcsParams(offerId);
        if (!gcsParams) return res.status(404).json({ error: 'Offer or customer not found' });

        // Compute SHA-256
        const fileBuffer = req.file.buffer;
        const sha256 = sha256hex(fileBuffer);

        // Derive extension and document type
        const originalName = req.file.originalname;
        const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
        const docType = documentType || deriveDocType(req.file.mimetype, ext);

        // Sanitize tokens to match buildOfferCommDocPath behaviour
        const seq = await nextDocSeq(commId);
        const safeOffer = gcsParams.offerNumber.replace(/\//g, '-');
        const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'doc';
        const seqPad = String(seq).padStart(3, '0');

        // Resolve GCS path via governance (throws GcsGovernanceError on missing rule, bad MIME, size exceeded)
        let govResolved: Awaited<ReturnType<typeof resolveGcsPathWithMeta>>;
        try {
          govResolved = await resolveGcsPathWithMeta('COMM_DOCUMENT', {
            CC: gcsParams.continentCode, CO: gcsParams.countryCode,
            Cust: gcsParams.customerToken, FY: gcsParams.fyCode,
            OfferNo: safeOffer, CategoryPath: categoryPath,
            Seq: seqPad, Label: safeLabel, rev: '00', ext,
          }, { mimeType: req.file.mimetype, fileSizeBytes: req.file.size });
        } catch (govErr: any) {
          if (govErr.name === 'GcsGovernanceError') return res.status(422).json({ error: govErr.message });
          throw govErr;
        }
        const gcsPath = govResolved.path;

        // Check GCS path uniqueness (additional safety — UNIQUE constraint on DB handles DB level)
        const bucket = gcsClient.bucket(gcsBucketName);
        const gcsFile = bucket.file(gcsPath);
        const [exists] = await gcsFile.exists();
        if (exists) return res.status(409).json({ error: 'A file already exists at this path. Use Add Revision instead.' });

        // Upload to GCS
        await gcsFile.save(fileBuffer, {
          metadata: { contentType: req.file.mimetype },
          resumable: false,
        });

        // Non-blocking governance monitor log
        void logUploadEvent({
          gcsPath, moduleKey: 'sales', documentType: 'COMM_DOCUMENT',
          fileSizeBytes: req.file.size, mimeType: req.file.mimetype,
          uploadedBy: userId, routeFile: 'offer-comm-routes.ts',
        });

        // Insert DB row
        const [doc] = await db.insert(offerCommDocuments).values({
          communicationId: commId,
          documentType: docType,
          fileName: `${seqPad}-${safeLabel}-rev-00.${ext}`,
          gcsPath,
          sha256,
          revision: '00',
          isCurrent: true,
          fileSizeBytes: req.file.size,
          mimeType: req.file.mimetype,
          mirrorStatus: 'pending',
          gcsRuleId: govResolved.ruleId,
          uploadedBy: userId,
        }).returning();

        // Enqueue mirror job
        try {
          const jobId = await enqueueMirrorJob({
            gcsPath,
            sourceModule: 'offer_comm_documents',
            sourceRecordId: doc.id,
            sha256,
            fileName: doc.fileName,
            createdBy: userId,
          });
          await db.update(offerCommDocuments).set({ mirrorJobId: jobId }).where(eq(offerCommDocuments.id, doc.id));
          await logActivity(userId, 'UPLOAD', 'offer_communications', 'offer_comm_document', doc.id, { offerId, commId, gcsPath });
          await logActivity(userId, 'COMM_DOC_MIRROR_ENQUEUED', 'offer_communications', 'offer_comm_document', doc.id, { jobId });
        } catch (mirrorErr: any) {
          console.warn('[offer-comm] Mirror enqueue failed (non-blocking):', mirrorErr.message);
        }

        res.status(201).json(doc);
      } catch (err: any) {
        console.error('[offer-comm] Upload error:', err);
        res.status(500).json({ error: 'Failed to upload document' });
      }
    }
  );

  // ── POST /offers/:id/communications/:commId/documents/:docId/revise ───────
  // Upload a new revision. Marks prior row is_current = false. New row gets next revision number.
  router.post(
    '/offers/:id/communications/:commId/documents/:docId/revise',
    ensureAuthenticated,
    commDocUpload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const offerId = parseInt(req.params.id);
        const commId = parseInt(req.params.commId);
        const docId = parseInt(req.params.docId);
        if (isNaN(offerId) || isNaN(commId) || isNaN(docId)) return res.status(400).json({ error: 'Invalid IDs' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const userId = (req.user as any)?.id;
        const { label, documentType } = req.body;

        // Load existing doc to get current revision and seq
        const existing = await db
          .select()
          .from(offerCommDocuments)
          .where(and(eq(offerCommDocuments.id, docId), eq(offerCommDocuments.communicationId, commId)))
          .limit(1);
        if (!existing.length) return res.status(404).json({ error: 'Document not found' });

        const prevDoc = existing[0];
        const prevRevNum = parseInt(prevDoc.revision || '0', 10);
        const newRevNum = prevRevNum + 1;
        const newRevStr = String(newRevNum).padStart(2, '0');

        // Resolve category path
        const commCheck = await pool.query(
          `SELECT occ.category_path
             FROM offer_communications oc
             JOIN offer_comm_categories occ ON occ.id = oc.communication_category_id
            WHERE oc.id = $1 AND oc.offer_id = $2`,
          [commId, offerId]
        );
        if (!commCheck.rows.length) return res.status(404).json({ error: 'Communication not found' });
        const categoryPath = commCheck.rows[0].category_path;

        const gcsParams = await resolveOfferGcsParams(offerId);
        if (!gcsParams) return res.status(404).json({ error: 'Offer or customer not found' });

        const fileBuffer = req.file.buffer;
        const sha256 = sha256hex(fileBuffer);
        const originalName = req.file.originalname;
        const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
        const docType = documentType || deriveDocType(req.file.mimetype, ext);

        // Extract seq from old filename or generate new
        const seqMatch = prevDoc.fileName.match(/^(\d+)-/);
        const seq = seqMatch ? parseInt(seqMatch[1]) : await nextDocSeq(commId);
        const rawLabel = label || prevDoc.fileName.replace(/^\d+-/, '').replace(/-rev-\d+\.\w+$/, '') || 'doc';
        const safeOffer = gcsParams.offerNumber.replace(/\//g, '-');
        const safeLabel = rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'doc';
        const seqPad = String(seq).padStart(3, '0');

        // Resolve GCS path via governance (throws GcsGovernanceError on missing rule, bad MIME, size exceeded)
        let govResolved: Awaited<ReturnType<typeof resolveGcsPathWithMeta>>;
        try {
          govResolved = await resolveGcsPathWithMeta('COMM_DOCUMENT', {
            CC: gcsParams.continentCode, CO: gcsParams.countryCode,
            Cust: gcsParams.customerToken, FY: gcsParams.fyCode,
            OfferNo: safeOffer, CategoryPath: categoryPath,
            Seq: seqPad, Label: safeLabel, rev: newRevStr, ext,
          }, { mimeType: req.file.mimetype, fileSizeBytes: req.file.size });
        } catch (govErr: any) {
          if (govErr.name === 'GcsGovernanceError') return res.status(422).json({ error: govErr.message });
          throw govErr;
        }
        const gcsPath = govResolved.path;

        // Upload new revision to GCS
        const bucket = gcsClient.bucket(gcsBucketName);
        const gcsFile = bucket.file(gcsPath);
        await gcsFile.save(fileBuffer, {
          metadata: { contentType: req.file.mimetype },
          resumable: false,
        });

        // Non-blocking governance monitor log
        void logUploadEvent({
          gcsPath, moduleKey: 'sales', documentType: 'COMM_DOCUMENT',
          fileSizeBytes: req.file.size, mimeType: req.file.mimetype,
          uploadedBy: userId, routeFile: 'offer-comm-routes.ts',
        });

        // Mark previous revision as superseded
        await db.update(offerCommDocuments)
          .set({ isCurrent: false })
          .where(eq(offerCommDocuments.id, docId));

        // Insert new revision row
        const [newDoc] = await db.insert(offerCommDocuments).values({
          communicationId: commId,
          documentType: docType,
          fileName: `${seqPad}-${safeLabel}-rev-${newRevStr}.${ext}`,
          gcsPath,
          sha256,
          revision: newRevStr,
          isCurrent: true,
          fileSizeBytes: req.file.size,
          mimeType: req.file.mimetype,
          mirrorStatus: 'pending',
          gcsRuleId: govResolved.ruleId,
          uploadedBy: userId,
        }).returning();

        // Enqueue mirror
        try {
          const jobId = await enqueueMirrorJob({
            gcsPath,
            sourceModule: 'offer_comm_documents',
            sourceRecordId: newDoc.id,
            sha256,
            fileName: newDoc.fileName,
            createdBy: userId,
          });
          await db.update(offerCommDocuments).set({ mirrorJobId: jobId }).where(eq(offerCommDocuments.id, newDoc.id));
          await logActivity(userId, 'REVISION', 'offer_communications', 'offer_comm_document', newDoc.id, { offerId, commId, previousDocId: docId, revision: newRevStr });
          await logActivity(userId, 'COMM_DOC_MIRROR_ENQUEUED', 'offer_communications', 'offer_comm_document', newDoc.id, { jobId });
        } catch (mirrorErr: any) {
          console.warn('[offer-comm] Mirror enqueue on revision failed (non-blocking):', mirrorErr.message);
        }

        res.status(201).json(newDoc);
      } catch (err: any) {
        console.error('[offer-comm] Revise error:', err);
        res.status(500).json({ error: 'Failed to add revision' });
      }
    }
  );

  // ── GET /offers/:id/communications/:commId/documents/:docId/download ──────
  router.get(
    '/offers/:id/communications/:commId/documents/:docId/download',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const docId = parseInt(req.params.docId);
        const commId = parseInt(req.params.commId);
        if (isNaN(docId) || isNaN(commId)) return res.status(400).json({ error: 'Invalid IDs' });

        const [doc] = await db
          .select()
          .from(offerCommDocuments)
          .where(and(eq(offerCommDocuments.id, docId), eq(offerCommDocuments.communicationId, commId)))
          .limit(1);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const bucket = gcsClient.bucket(gcsBucketName);
        const file = bucket.file(doc.gcsPath);
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hour
        });

        res.json({ url, fileName: doc.fileName, mimeType: doc.mimeType });
      } catch (err: any) {
        console.error('[offer-comm] Download signed URL error:', err);
        res.status(500).json({ error: 'Failed to generate download URL' });
      }
    }
  );
}

// ── Utility: derive document type from MIME / extension ──────────────────────
function deriveDocType(mimeType: string, ext: string): string {
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') return 'Word';
  if (mimeType === 'application/msword' || ext === 'doc') return 'Word';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xlsx') return 'Excel';
  if (mimeType === 'application/vnd.ms-excel' || ext === 'xls') return 'Excel';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || ext === 'pptx') return 'PPT';
  if (mimeType === 'application/vnd.ms-powerpoint' || ext === 'ppt') return 'PPT';
  if (mimeType?.startsWith('image/')) return 'Image';
  return 'Other';
}
