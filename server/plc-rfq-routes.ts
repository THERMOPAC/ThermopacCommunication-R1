/**
 * PLC RFQ Routes — Phase 2 + Email Dispatch (Baseline v1.0)
 * Governance: docs/procurement-list-control-baseline-v1.md §9, §27 Phase 2
 *             docs/rfq-email-dispatch-baseline-v1.0.md
 *
 * Routes (18):
 *   RFQ         (7): list, get, create, issue, close, cancel, preflight
 *   Vendors     (3): add-vendor, remove-vendor, resend-email
 *   Vendor ACK  (1): acknowledge
 *   Lines       (2): add-line, remove-line
 *   Quotes      (2): upsert-quote, list-quotes
 *   Dispatch    (2): dispatch-log, attachments-list
 */

import { Express, Request, Response } from 'express';
import { pool } from './db';
import { requirePageAccess } from './utils/permission-utils';
import { getNextDocSeq } from './doc-sequence-service';
import { logPlcAudit } from './plc-line-service';
import { preflightRfq, freezeAttachments, dispatchRfqToVendors, resendToVendor } from './rfq-email-service';

// ─── Idempotent DDL: create new RFQ email dispatch tables ────────────────────
async function ensureRfqEmailTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plc_rfq_attachments (
      id                 SERIAL PRIMARY KEY,
      rfq_id             INTEGER NOT NULL,
      plc_line_id        INTEGER,
      attachment_type    VARCHAR(30) NOT NULL DEFAULT 'datasheet',
      gcs_bucket         VARCHAR(100) NOT NULL DEFAULT '',
      gcs_path           TEXT NOT NULL DEFAULT '',
      original_filename  VARCHAR(255),
      file_size_bytes    BIGINT,
      mime_type          VARCHAR(100),
      checksum_sha256    VARCHAR(64),
      source_revision_seq INTEGER,
      frozen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      frozen_by          INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plc_rfq_dispatch_log (
      id                    SERIAL PRIMARY KEY,
      rfq_id                INTEGER NOT NULL,
      vendor_id             INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
      email_to              TEXT NOT NULL DEFAULT '',
      email_cc              TEXT[],
      dispatch_status       VARCHAR(20) NOT NULL DEFAULT 'sent',
      nodemailer_message_id TEXT,
      failure_reason        TEXT,
      attachment_count      INTEGER DEFAULT 0,
      dispatched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dispatched_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_resend             BOOLEAN NOT NULL DEFAULT FALSE,
      resend_number         INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Idempotent ALTER TABLE additions to plc_rfq_vendors
  const vendorAlters = [
    `ALTER TABLE plc_rfq_vendors ADD COLUMN IF NOT EXISTS email_override TEXT`,
    `ALTER TABLE plc_rfq_vendors ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(20) DEFAULT 'pending'`,
    `ALTER TABLE plc_rfq_vendors ADD COLUMN IF NOT EXISTS last_dispatched_at TIMESTAMPTZ`,
    `ALTER TABLE plc_rfq_vendors ADD COLUMN IF NOT EXISTS resend_count INTEGER DEFAULT 0`,
    `ALTER TABLE plc_rfq_vendors ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`,
    `ALTER TABLE plc_rfq_vendors ADD COLUMN IF NOT EXISTS acknowledgment_note TEXT`,
  ];
  for (const s of vendorAlters) { try { await pool.query(s); } catch {} }
  // Idempotent ALTER TABLE additions to plc_rfq_records
  const rfqAlters = [
    `ALTER TABLE plc_rfq_records ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ`,
    `ALTER TABLE plc_rfq_records ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(20) DEFAULT 'not_dispatched'`,
    `ALTER TABLE plc_rfq_records ADD COLUMN IF NOT EXISTS attachments_frozen_at TIMESTAMPTZ`,
  ];
  for (const s of rfqAlters) { try { await pool.query(s); } catch {} }
  console.log('[PLC-RFQ] Email dispatch tables ensured');
}

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}
const PAGE = requirePageAccess('procurement-list-control');

function sendErr(res: Response, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[PLC-RFQ]', msg);
  res.status(500).json({ error: msg });
}
function notFound(res: Response, entity: string) {
  return res.status(404).json({ error: `${entity} not found` });
}
function badReq(res: Response, msg: string) {
  return res.status(400).json({ error: msg });
}

export function setupPlcRfqRoutes(app: Express): void {
  // Run DDL on startup
  ensureRfqEmailTables().catch(err => console.error('[PLC-RFQ] ensureRfqEmailTables failed:', err.message));


  // ── GET /api/projects/:projectId/plc-rfq — list RFQs for project ────────────
  app.get('/api/projects/:projectId/plc-rfq', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badReq(res, 'Invalid projectId');
      const { status } = req.query;

      let q = `
        SELECT r.*,
               u.username AS created_by_name,
               COUNT(DISTINCT rl.id) AS line_count,
               COUNT(DISTINCT rv.id) AS vendor_count
        FROM plc_rfq_records r
        LEFT JOIN users u ON u.id = r.created_by
        LEFT JOIN plc_rfq_lines rl ON rl.rfq_id = r.id
        LEFT JOIN plc_rfq_vendors rv ON rv.rfq_id = r.id
        WHERE r.project_id = $1`;
      const params: any[] = [projectId];

      if (status && status !== 'all') {
        params.push(status);
        q += ` AND r.status = $${params.length}`;
      }
      q += ` GROUP BY r.id, u.username ORDER BY r.created_at DESC`;

      const result = await pool.query(q, params);
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // ── GET /api/plc-rfq/:id — single RFQ with lines + vendors + quotes ─────────
  app.get('/api/plc-rfq/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');

      const rfqRes = await pool.query(
        `SELECT r.*, u.username AS created_by_name
         FROM plc_rfq_records r LEFT JOIN users u ON u.id = r.created_by
         WHERE r.id = $1`, [id]
      );
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      const rfq = rfqRes.rows[0];

      const linesRes = await pool.query(
        `SELECT rl.id, rl.plc_line_id, p.plc_number, p.tag_no, p.service_description,
                p.subgroup_code, p.qty_required, p.status AS plc_status
         FROM plc_rfq_lines rl
         JOIN procurement_list_lines p ON p.id = rl.plc_line_id
         WHERE rl.rfq_id = $1 ORDER BY p.plc_number`, [id]
      );

      const vendorsRes = await pool.query(
        `SELECT rv.id, rv.vendor_id, v.name AS vendor_name, v.display_name AS vendor_display_name
         FROM plc_rfq_vendors rv JOIN vendors v ON v.id = rv.vendor_id
         WHERE rv.rfq_id = $1 ORDER BY v.name`, [id]
      );

      const quotesRes = await pool.query(
        `SELECT q.*, v.name AS vendor_name, v.display_name AS vendor_display_name,
                p.plc_number, p.tag_no
         FROM plc_vendor_quotes q
         JOIN vendors v ON v.id = q.vendor_id
         JOIN procurement_list_lines p ON p.id = q.plc_line_id
         WHERE q.rfq_id = $1 ORDER BY p.plc_number, v.name`, [id]
      );

      res.json({ ...rfq, lines: linesRes.rows, vendors: vendorsRes.rows, quotes: quotesRes.rows });
    } catch (e) { sendErr(res, e); }
  });

  // ── POST /api/projects/:projectId/plc-rfq — create RFQ ──────────────────────
  app.post('/api/projects/:projectId/plc-rfq', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badReq(res, 'Invalid projectId');
      const userId = (req.user as any)?.id;
      const { rfqDate, submissionDeadline, subject, notes, lineIds, vendorIds } = req.body || {};

      if (!lineIds || !Array.isArray(lineIds) || lineIds.length === 0) {
        return badReq(res, 'At least one PLC line is required');
      }
      if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
        return badReq(res, 'At least one vendor is required');
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Generate RFQ number
        const projRes = await client.query(`SELECT code FROM projects WHERE id = $1`, [projectId]);
        if (projRes.rowCount === 0) { await client.query('ROLLBACK'); return badReq(res, 'Project not found'); }
        const projCode = projRes.rows[0].code;

        // Get next RFQ seq
        const seqRes = await client.query(
          `SELECT next_seq FROM doc_sequences WHERE doc_type = 'RFQ' AND project_id = $1 FOR UPDATE`, [projectId]
        );
        let seq = 1;
        if (seqRes.rowCount === 0) {
          await client.query(
            `INSERT INTO doc_sequences (doc_type, next_seq, project_id) VALUES ('RFQ', 2, $1)`, [projectId]
          );
        } else {
          seq = seqRes.rows[0].next_seq;
          await client.query(
            `UPDATE doc_sequences SET next_seq = $1 WHERE doc_type = 'RFQ' AND project_id = $2`, [seq + 1, projectId]
          );
        }
        const rfqNumber = `${projCode}-RFQ-${String(seq).padStart(4, '0')}`;

        const rfqRes = await client.query(
          `INSERT INTO plc_rfq_records (rfq_number, project_id, rfq_date, submission_deadline, subject, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [rfqNumber, projectId, rfqDate || null, submissionDeadline || null, subject || null, notes || null, userId]
        );
        const rfq = rfqRes.rows[0];

        // Add lines
        for (const lineId of lineIds) {
          await client.query(
            `INSERT INTO plc_rfq_lines (rfq_id, plc_line_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [rfq.id, lineId]
          );
          // Update PLC line status to pending_rfq
          await client.query(
            `UPDATE procurement_list_lines SET status = 'pending_rfq', updated_at = NOW()
             WHERE id = $1 AND status = 'pr_raised'`,
            [lineId]
          );
        }

        // Add vendors
        for (const vendorId of vendorIds) {
          await client.query(
            `INSERT INTO plc_rfq_vendors (rfq_id, vendor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [rfq.id, vendorId]
          );
        }

        // Audit: RFQ created
        await logPlcAudit(client, {
          projectId, entityType: 'rfq', entityId: rfq.id,
          eventType: 'rfq_created', oldStatus: null, newStatus: 'draft',
          changedBy: userId,
          notes: `RFQ ${rfq.rfq_number} created`,
          metadata: { rfqNumber: rfq.rfq_number, lineIds, vendorIds },
        });

        await client.query('COMMIT');
        res.status(201).json({ success: true, rfq });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // ── GET /api/plc-rfq/:id/preflight — pre-flight warnings before issue ────────
  app.get('/api/plc-rfq/:id/preflight', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');
      const result = await preflightRfq(id);
      res.json(result);
    } catch (e) { sendErr(res, e); }
  });

  // ── POST /api/plc-rfq/:id/issue — issue RFQ + freeze attachments + dispatch ──
  // Governance: DB transaction committed BEFORE email dispatch.
  //             Email failures do NOT roll back the RFQ issue. (Baseline §5)
  app.post('/api/plc-rfq/:id/issue', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return badReq(res, 'Invalid RFQ id');
    const userId = (req.user as any)?.id;

    try {
      const rfqRes = await pool.query(`SELECT * FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      const rfq = rfqRes.rows[0];
      if (rfq.status !== 'draft') return res.status(400).json({ error: `Cannot issue: RFQ is '${rfq.status}'` });

      // Check that at least one vendor and one line exist
      const vCheck = await pool.query(`SELECT COUNT(*) FROM plc_rfq_vendors WHERE rfq_id = $1`, [id]);
      const lCheck = await pool.query(`SELECT COUNT(*) FROM plc_rfq_lines WHERE rfq_id = $1`, [id]);
      if (parseInt(vCheck.rows[0].count) === 0) return badReq(res, 'Add at least one vendor before issuing');
      if (parseInt(lCheck.rows[0].count) === 0) return badReq(res, 'Add at least one line before issuing');

      // ── TRANSACTION: status change + attachment freeze ──────────────────────
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE plc_rfq_records
           SET status='issued', issued_at=NOW(), dispatch_status='not_dispatched', updated_at=NOW()
           WHERE id=$1`,
          [id],
        );

        // Update linked PLC lines to rfq_issued
        await client.query(
          `UPDATE procurement_list_lines SET status='rfq_issued', updated_at=NOW()
           WHERE id IN (SELECT plc_line_id FROM plc_rfq_lines WHERE rfq_id=$1)
             AND status IN ('pr_raised','pending_rfq')`,
          [id],
        );

        // Freeze attachment snapshot (immutable from this point)
        await freezeAttachments(id, userId, client);

        // Audit
        await logPlcAudit(client, {
          projectId: rfq.project_id, entityType: 'rfq', entityId: id,
          eventType: 'rfq_issued', oldStatus: 'draft', newStatus: 'issued',
          changedBy: userId,
          notes: `RFQ ${rfq.rfq_number} issued to vendors`,
          metadata: { rfqId: id },
        });

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      // ── END TRANSACTION ─────────────────────────────────────────────────────

      // Respond immediately — email dispatch is post-commit fire-and-forget
      // Failures are logged per-vendor in plc_rfq_dispatch_log but do NOT revert status
      res.json({ success: true, message: 'RFQ issued', rfqId: id });

      // Async dispatch (outside try/catch so failure does not affect HTTP response)
      dispatchRfqToVendors(id, userId)
        .then(({ dispatched, failed, noEmail }) => {
          console.log(`[PLC-RFQ] RFQ ${id} dispatch complete: ${dispatched} sent, ${failed} failed, ${noEmail} no-email`);
        })
        .catch(err => {
          console.error(`[PLC-RFQ] dispatchRfqToVendors error for RFQ ${id}:`, err.message);
        });

    } catch (e) { sendErr(res, e); }
  });

  // ── POST /api/plc-rfq/:id/close — close RFQ (all quotes received) ───────────
  app.post('/api/plc-rfq/:id/close', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');

      const rfqRes = await pool.query(`SELECT * FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      const rfq = rfqRes.rows[0];
      if (rfq.status !== 'issued') return res.status(400).json({ error: `Cannot close: RFQ is '${rfq.status}'` });

      await pool.query(`UPDATE plc_rfq_records SET status = 'closed', updated_at = NOW() WHERE id = $1`, [id]);
      // Move lines to rfq_closed only if no other issued RFQ still holds the same line.
      // A line can be in parallel RFQs; closing one RFQ must not prematurely close the line.
      await pool.query(
        `UPDATE procurement_list_lines SET status = 'rfq_closed', updated_at = NOW()
         WHERE id IN (SELECT plc_line_id FROM plc_rfq_lines WHERE rfq_id = $1)
           AND status IN ('rfq_issued')
           AND NOT EXISTS (
             SELECT 1 FROM plc_rfq_lines rl2
             JOIN plc_rfq_records r2 ON r2.id = rl2.rfq_id
             WHERE rl2.plc_line_id = procurement_list_lines.id
               AND r2.id != $1
               AND r2.status = 'issued'
           )`,
        [id]
      );

      // Audit
      await logPlcAudit(pool, {
        projectId: rfq.project_id, entityType: 'rfq', entityId: id,
        eventType: 'rfq_closed', oldStatus: 'issued', newStatus: 'closed',
        changedBy: (req.user as any)?.id,
        notes: `RFQ ${rfq.rfq_number} closed`,
        metadata: { rfqId: id },
      });

      res.json({ success: true, message: 'RFQ closed', rfqId: id });
    } catch (e) { sendErr(res, e); }
  });

  // ── POST /api/plc-rfq/:id/cancel ────────────────────────────────────────────
  app.post('/api/plc-rfq/:id/cancel', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');
      const { reason } = req.body || {};

      const rfqRes = await pool.query(`SELECT * FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      const rfq = rfqRes.rows[0];
      if (rfq.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE plc_rfq_records SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || $2, updated_at = NOW() WHERE id = $1`,
          [id, `[CANCELLED] ${reason || ''}`]
        );
        // Revert PLC lines back to pr_raised — but ONLY if no other active (non-cancelled) RFQ
        // still references the same line. One line can appear in multiple parallel RFQs.
        await client.query(
          `UPDATE procurement_list_lines SET status = 'pr_raised', updated_at = NOW()
           WHERE id IN (SELECT plc_line_id FROM plc_rfq_lines WHERE rfq_id = $1)
             AND status IN ('pending_rfq','rfq_issued','rfq_closed')
             AND NOT EXISTS (
               SELECT 1 FROM plc_rfq_lines rl2
               JOIN plc_rfq_records r2 ON r2.id = rl2.rfq_id
               WHERE rl2.plc_line_id = procurement_list_lines.id
                 AND r2.id != $1
                 AND r2.status NOT IN ('cancelled')
             )`,
          [id]
        );

        // Audit
        await logPlcAudit(client, {
          projectId: rfq.project_id, entityType: 'rfq', entityId: id,
          eventType: 'rfq_cancelled', oldStatus: rfq.status, newStatus: 'cancelled',
          changedBy: (req.user as any)?.id,
          notes: reason ? `Cancelled: ${reason}` : 'Cancelled',
          metadata: { rfqId: id, previousStatus: rfq.status },
        });

        await client.query('COMMIT');
        res.json({ success: true, message: 'RFQ cancelled' });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // ── POST /api/plc-rfq/:id/vendors — add vendor to RFQ ──────────────────────
  app.post('/api/plc-rfq/:id/vendors', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { vendorId } = req.body || {};
      if (isNaN(id) || !vendorId) return badReq(res, 'Missing rfq id or vendorId');

      const rfqRes = await pool.query(`SELECT status FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      if (!['draft', 'issued'].includes(rfqRes.rows[0].status)) {
        return badReq(res, 'Can only add vendors to draft/issued RFQ');
      }

      await pool.query(
        `INSERT INTO plc_rfq_vendors (rfq_id, vendor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, vendorId]
      );
      res.json({ success: true });
    } catch (e) { sendErr(res, e); }
  });

  // ── DELETE /api/plc-rfq/:id/vendors/:vendorId ───────────────────────────────
  app.delete('/api/plc-rfq/:id/vendors/:vendorId', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const vendorId = parseInt(req.params.vendorId);
      if (isNaN(id) || isNaN(vendorId)) return badReq(res, 'Invalid ids');

      const rfqRes = await pool.query(`SELECT status FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      if (rfqRes.rows[0].status !== 'draft') return badReq(res, 'Can only remove vendors from draft RFQ');

      await pool.query(`DELETE FROM plc_rfq_vendors WHERE rfq_id = $1 AND vendor_id = $2`, [id, vendorId]);
      res.json({ success: true });
    } catch (e) { sendErr(res, e); }
  });

  // ── POST /api/plc-rfq/:id/lines — add PLC line to RFQ ──────────────────────
  app.post('/api/plc-rfq/:id/lines', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { plcLineId } = req.body || {};
      if (isNaN(id) || !plcLineId) return badReq(res, 'Missing rfq id or plcLineId');

      const rfqRes = await pool.query(`SELECT status FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      if (rfqRes.rows[0].status !== 'draft') return badReq(res, 'Can only add lines to draft RFQ');

      await pool.query(
        `INSERT INTO plc_rfq_lines (rfq_id, plc_line_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, plcLineId]
      );
      res.json({ success: true });
    } catch (e) { sendErr(res, e); }
  });

  // ── DELETE /api/plc-rfq/:id/lines/:plcLineId ────────────────────────────────
  app.delete('/api/plc-rfq/:id/lines/:plcLineId', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const plcLineId = parseInt(req.params.plcLineId);
      if (isNaN(id) || isNaN(plcLineId)) return badReq(res, 'Invalid ids');

      const rfqRes = await pool.query(`SELECT status FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      if (rfqRes.rows[0].status !== 'draft') return badReq(res, 'Can only remove lines from draft RFQ');

      await pool.query(`DELETE FROM plc_rfq_lines WHERE rfq_id = $1 AND plc_line_id = $2`, [id, plcLineId]);
      res.json({ success: true });
    } catch (e) { sendErr(res, e); }
  });

  // ── PUT /api/plc-rfq/:id/quotes — upsert vendor quote ──────────────────────
  app.put('/api/plc-rfq/:id/quotes', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');
      const userId = (req.user as any)?.id;
      const {
        plcLineId, vendorId, unitPrice, totalPrice, currency = 'INR',
        deliveryWeeks, validityDate, technicalScore, commercialScore, isRecommended = false, notes,
      } = req.body || {};

      if (!plcLineId || !vendorId) return badReq(res, 'plcLineId and vendorId required');

      const rfqRes = await pool.query(`SELECT status FROM plc_rfq_records WHERE id = $1`, [id]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');
      if (!['issued', 'closed'].includes(rfqRes.rows[0].status)) {
        return badReq(res, 'Can only record quotes for issued/closed RFQs');
      }

      const rfqForQuote = await pool.query(`SELECT project_id FROM plc_rfq_records WHERE id = $1`, [id]);
      const result = await pool.query(
        `INSERT INTO plc_vendor_quotes (rfq_id, plc_line_id, vendor_id, unit_price, total_price, currency,
           delivery_weeks, validity_date, technical_score, commercial_score, is_recommended, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (rfq_id, plc_line_id, vendor_id) DO UPDATE SET
           unit_price=$4, total_price=$5, currency=$6, delivery_weeks=$7, validity_date=$8,
           technical_score=$9, commercial_score=$10, is_recommended=$11, notes=$12, updated_at=NOW()
         RETURNING *`,
        [id, plcLineId, vendorId, unitPrice || null, totalPrice || null, currency,
         deliveryWeeks || null, validityDate || null, technicalScore || null,
         commercialScore || null, isRecommended, notes || null, userId]
      );

      // Audit
      if (rfqForQuote.rowCount && rfqForQuote.rowCount > 0) {
        await logPlcAudit(pool, {
          projectId: rfqForQuote.rows[0].project_id,
          entityType: 'rfq', entityId: id,
          eventType: 'quote_upserted', oldStatus: null, newStatus: null,
          changedBy: userId,
          notes: `Quote from vendor ${vendorId} for line ${plcLineId}: ${currency} ${unitPrice ?? '—'}`,
          metadata: { rfqId: id, plcLineId, vendorId, unitPrice, isRecommended },
        });
      }

      res.json({ success: true, quote: result.rows[0] });
    } catch (e) { sendErr(res, e); }
  });

  // ── GET /api/plc-rfq/:id/quotes — list all quotes for RFQ ──────────────────
  app.get('/api/plc-rfq/:id/quotes', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');

      const result = await pool.query(
        `SELECT q.*, v.name AS vendor_name, v.display_name AS vendor_display_name,
                p.plc_number, p.tag_no, p.service_description, p.uom
         FROM plc_vendor_quotes q
         JOIN vendors v ON v.id = q.vendor_id
         JOIN procurement_list_lines p ON p.id = q.plc_line_id
         WHERE q.rfq_id = $1
         ORDER BY p.plc_number, v.name`, [id]
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // ── GET /api/plc-rfq/:id/dispatch-log — all dispatch log rows for RFQ ────────
  app.get('/api/plc-rfq/:id/dispatch-log', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');
      const result = await pool.query(
        `SELECT dl.*, v.name AS vendor_name, v.display_name AS vendor_display_name,
                u.username AS dispatched_by_name
         FROM plc_rfq_dispatch_log dl
         JOIN vendors v ON v.id = dl.vendor_id
         LEFT JOIN users u ON u.id = dl.dispatched_by
         WHERE dl.rfq_id = $1
         ORDER BY dl.dispatched_at DESC`,
        [id],
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // ── GET /api/plc-rfq/:id/attachments — frozen attachment list ────────────────
  app.get('/api/plc-rfq/:id/attachments', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');
      const result = await pool.query(
        `SELECT a.*, u.username AS frozen_by_name
         FROM plc_rfq_attachments a
         LEFT JOIN users u ON u.id = a.frozen_by
         WHERE a.rfq_id = $1
         ORDER BY a.attachment_type, a.id`,
        [id],
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // ── POST /api/plc-rfq/:id/vendors/:vendorId/resend — resend email to vendor ──
  app.post('/api/plc-rfq/:id/vendors/:vendorId/resend', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const vendorId = parseInt(req.params.vendorId);
      if (isNaN(id) || isNaN(vendorId)) return badReq(res, 'Invalid ids');
      const { emailOverride } = req.body || {};
      const userId = (req.user as any)?.id;

      const rfqRes = await pool.query(`SELECT status FROM plc_rfq_records WHERE id=$1`, [id]);
      if (!rfqRes.rowCount) return notFound(res, 'RFQ');
      if (!['issued', 'closed'].includes(rfqRes.rows[0].status)) {
        return badReq(res, 'Can only resend for issued/closed RFQ');
      }

      await resendToVendor(id, vendorId, emailOverride || null, userId);
      res.json({ success: true, message: 'Resent successfully' });
    } catch (e) { sendErr(res, e); }
  });

  // ── PATCH /api/plc-rfq/:id/vendors/:vendorId/acknowledge — mark acknowledged ─
  app.patch('/api/plc-rfq/:id/vendors/:vendorId/acknowledge', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const vendorId = parseInt(req.params.vendorId);
      if (isNaN(id) || isNaN(vendorId)) return badReq(res, 'Invalid ids');
      const { note } = req.body || {};
      const userId = (req.user as any)?.id;

      const rfqRes = await pool.query(`SELECT project_id, rfq_number FROM plc_rfq_records WHERE id=$1`, [id]);
      if (!rfqRes.rowCount) return notFound(res, 'RFQ');

      await pool.query(
        `UPDATE plc_rfq_vendors
         SET acknowledged_at=NOW(), acknowledgment_note=$1, dispatch_status='acknowledged'
         WHERE rfq_id=$2 AND vendor_id=$3`,
        [note || null, id, vendorId],
      );

      // Recalculate aggregate dispatch_status
      const allStatuses = await pool.query(
        `SELECT dispatch_status FROM plc_rfq_vendors WHERE rfq_id=$1`, [id]
      );
      const statuses = allStatuses.rows.map((r: any) => r.dispatch_status);
      const aggStatus =
        statuses.every((s: string) => s === 'acknowledged') ? 'all_acknowledged' :
        statuses.some((s: string) => s === 'acknowledged') ? 'partial_acknowledged' : 'dispatched';
      await pool.query(`UPDATE plc_rfq_records SET dispatch_status=$1 WHERE id=$2`, [aggStatus, id]);

      await logPlcAudit(pool, {
        projectId: rfqRes.rows[0].project_id, entityType: 'rfq', entityId: id,
        eventType: 'rfq_acknowledged', oldStatus: null, newStatus: null,
        changedBy: userId,
        notes: `Vendor ${vendorId} acknowledged RFQ ${rfqRes.rows[0].rfq_number}${note ? `: ${note}` : ''}`,
        metadata: { vendorId, note },
      });

      res.json({ success: true });
    } catch (e) { sendErr(res, e); }
  });

  // ── GET /api/plc-rfq/:id/vendor-dispatch — vendor-level dispatch summary ─────
  app.get('/api/plc-rfq/:id/vendor-dispatch', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid RFQ id');
      const result = await pool.query(
        `SELECT rv.*, v.name AS vendor_name, v.display_name AS vendor_display_name,
                v.email AS vendor_email
         FROM plc_rfq_vendors rv
         JOIN vendors v ON v.id = rv.vendor_id
         WHERE rv.rfq_id = $1
         ORDER BY v.name`,
        [id],
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });
}
