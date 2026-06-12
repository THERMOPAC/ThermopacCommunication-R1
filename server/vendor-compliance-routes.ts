import { Router } from 'express';
import multer from 'multer';
import { db, pool } from './db';
import { ensureAuthenticated } from './auth-middleware';
import { uploadFileToGCS, initializeGCS } from './utils/gcs-operations';
import {
  VENDOR_COMPLIANCE_DOC_TYPES,
  VENDOR_COMPLIANCE_MANDATORY,
} from '@shared/schema';
import { resolveGcsPath, GcsGovernanceError } from './utils/gcs-path-resolver';

const router = Router();
router.use(ensureAuthenticated);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const BUCKET = process.env.GCS_BUCKET_NAME || 'thermopac_storage';

function slugify(docType: string): string {
  return docType.toLowerCase().replace(/_/g, '-');
}

function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

// ── GET /api/vendor-compliance/:vendorId ─────────────────────────────────────
// Returns latest active revision for each of the 7 doc types.
router.get('/:vendorId', ensureAuthenticated, async (req: any, res: any) => {
  const vendorId = parseInt(req.params.vendorId, 10);
  if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendorId' });

  try {
    const result = await pool.query(
      `SELECT * FROM vendor_compliance_docs
       WHERE vendor_id = $1 AND is_active = true
       ORDER BY doc_type, revision_number DESC`,
      [vendorId],
    );
    // One active row per docType (the latest)
    const byType: Record<string, any> = {};
    for (const row of result.rows) {
      if (!byType[row.doc_type]) byType[row.doc_type] = row;
    }
    res.json({ docs: Object.values(byType) });
  } catch (e: any) {
    console.error('[vendor-compliance] GET list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/vendor-compliance/:vendorId/history/:docType ────────────────────
// Returns full revision history for one doc type (newest first).
router.get('/:vendorId/history/:docType', ensureAuthenticated, async (req: any, res: any) => {
  const vendorId = parseInt(req.params.vendorId, 10);
  const { docType } = req.params;
  if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendorId' });
  if (!(VENDOR_COMPLIANCE_DOC_TYPES as readonly string[]).includes(docType)) {
    return res.status(400).json({ error: 'Invalid docType' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM vendor_compliance_docs
       WHERE vendor_id = $1 AND doc_type = $2
       ORDER BY revision_number DESC`,
      [vendorId, docType],
    );
    res.json({ history: result.rows });
  } catch (e: any) {
    console.error('[vendor-compliance] GET history error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/vendor-compliance/:vendorId/:docType ───────────────────────────
// Upload a new revision for a doc type. Previous active revision is deactivated.
router.post(
  '/:vendorId/:docType',
  ensureAuthenticated,
  upload.single('file'),
  async (req: any, res: any) => {
    const vendorId = parseInt(req.params.vendorId, 10);
    const { docType } = req.params;

    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendorId' });
    if (!(VENDOR_COMPLIANCE_DOC_TYPES as readonly string[]).includes(docType)) {
      return res.status(400).json({ error: 'Invalid docType' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const expiryDate: string | null = req.body.expiryDate || null;
    const notes: string | null = req.body.notes || null;
    const uploadedBy: number = req.user?.id ?? null;

    try {
      // Fetch vendor bpCode
      const vRes = await pool.query(
        `SELECT sap_card_code, bp_name FROM customers WHERE id = $1`,
        [vendorId],
      );
      if (vRes.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
      const bpCode = vRes.rows[0].sap_card_code || `VND${vendorId}`;

      // Determine next revision number
      const revRes = await pool.query(
        `SELECT COALESCE(MAX(revision_number), -1) AS max_rev
         FROM vendor_compliance_docs
         WHERE vendor_id = $1 AND doc_type = $2`,
        [vendorId, docType],
      );
      const nextRev = (revRes.rows[0].max_rev as number) + 1;
      const revLabel = `rev-${zeroPad(nextRev, 2)}`;

      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'pdf';
      let gcsPath: string;
      try {
        gcsPath = await resolveGcsPath(docType, { BPCode: bpCode, RevNo: zeroPad(nextRev, 2), Seq: '001', Ext: ext });
      } catch (err: any) {
        if (err instanceof GcsGovernanceError) return res.status(503).json({ error: 'GCS_GOVERNANCE_ERROR', message: err.message });
        throw err;
      }

      // Upload to GCS
      const uploadResult = await uploadFileToGCS(gcsPath, req.file.buffer, req.file.mimetype);
      if (!uploadResult.success) {
        return res.status(500).json({ error: `GCS upload failed: ${uploadResult.message}` });
      }

      // Deactivate previous active revision
      await pool.query(
        `UPDATE vendor_compliance_docs
         SET is_active = false, updated_at = NOW()
         WHERE vendor_id = $1 AND doc_type = $2 AND is_active = true`,
        [vendorId, docType],
      );

      // Determine initial status
      let status = 'uploaded';
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        if (expiry < new Date()) status = 'expired';
      }

      // Insert new revision
      const insertRes = await pool.query(
        `INSERT INTO vendor_compliance_docs
           (vendor_id, bp_code, doc_type, revision_number, file_name, gcs_path,
            content_type, size_bytes, status, expiry_date, is_active, uploaded_by, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12)
         RETURNING *`,
        [
          vendorId,
          bpCode,
          docType,
          nextRev,
          req.file.originalname,
          gcsPath,
          req.file.mimetype,
          req.file.size,
          status,
          expiryDate,
          uploadedBy,
          notes,
        ],
      );

      console.log(`[vendor-compliance] Uploaded ${docType} rev-${nextRev} for vendor ${vendorId} (${bpCode}): ${gcsPath}`);
      res.json({ success: true, doc: insertRes.rows[0] });
    } catch (e: any) {
      console.error('[vendor-compliance] POST upload error:', e.message);
      res.status(500).json({ error: e.message });
    }
  },
);

// ── GET /api/vendor-compliance/doc/:docId/download ───────────────────────────
// Returns a signed download URL (attachment) for a specific doc revision.
router.get('/doc/:docId/download', ensureAuthenticated, async (req: any, res: any) => {
  const docId = parseInt(req.params.docId, 10);
  if (isNaN(docId)) return res.status(400).json({ error: 'Invalid docId' });

  try {
    const result = await pool.query(
      `SELECT * FROM vendor_compliance_docs WHERE id = $1`,
      [docId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];

    const { storage } = await initializeGCS();
    if (!storage) return res.status(500).json({ error: 'GCS unavailable' });

    const file = storage.bucket(BUCKET).file(doc.gcs_path);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      responseDisposition: `attachment; filename="${doc.file_name}"`,
    });

    res.json({ url: signedUrl, fileName: doc.file_name });
  } catch (e: any) {
    console.error('[vendor-compliance] download error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/vendor-compliance/doc/:docId/view ───────────────────────────────
// Returns a signed inline-view URL for a specific doc revision.
router.get('/doc/:docId/view', ensureAuthenticated, async (req: any, res: any) => {
  const docId = parseInt(req.params.docId, 10);
  if (isNaN(docId)) return res.status(400).json({ error: 'Invalid docId' });

  try {
    const result = await pool.query(
      `SELECT * FROM vendor_compliance_docs WHERE id = $1`,
      [docId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];

    const { storage } = await initializeGCS();
    if (!storage) return res.status(500).json({ error: 'GCS unavailable' });

    const file = storage.bucket(BUCKET).file(doc.gcs_path);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
      responseDisposition: `inline; filename="${doc.file_name}"`,
    });

    res.json({ url: signedUrl, fileName: doc.file_name });
  } catch (e: any) {
    console.error('[vendor-compliance] view error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/vendor-compliance/doc/:docId/status ───────────────────────────
// Update status or expiry date of a doc.
router.patch('/doc/:docId/status', ensureAuthenticated, async (req: any, res: any) => {
  const docId = parseInt(req.params.docId, 10);
  if (isNaN(docId)) return res.status(400).json({ error: 'Invalid docId' });

  const { status, expiryDate } = req.body;
  const allowed = ['uploaded', 'expired', 'pending_approval'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (expiryDate !== undefined) { updates.push(`expiry_date = $${idx++}`); params.push(expiryDate || null); }
    updates.push(`updated_at = NOW()`);
    params.push(docId);

    const result = await pool.query(
      `UPDATE vendor_compliance_docs SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    res.json({ success: true, doc: result.rows[0] });
  } catch (e: any) {
    console.error('[vendor-compliance] PATCH status error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
