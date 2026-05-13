/**
 * PLC Evaluation Routes — Phase 2 (TBE / CBE)
 * Governance: docs/procurement-list-control-baseline-v1.md §27 Phase 2
 *
 * Routes (8):
 *   TBE (4): list, get, create/update, recommend-vendor
 *   CBE (4): list, get, create/update, finalize (select vendor → update PLC line)
 */

import { Express, Request, Response } from 'express';
import { pool } from './db';
import { requirePageAccess } from './utils/permission-utils';
import { logPlcAudit } from './plc-line-service';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}
const PAGE = requirePageAccess('procurement-list-control');

function sendErr(res: Response, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[PLC-EVAL]', msg);
  res.status(500).json({ error: msg });
}
function notFound(res: Response, entity: string) {
  return res.status(404).json({ error: `${entity} not found` });
}
function badReq(res: Response, msg: string) {
  return res.status(400).json({ error: msg });
}

export function setupPlcEvaluationRoutes(app: Express): void {

  // ════════════════════════════════════════════════════════
  // TBE (Technical Bid Evaluation)
  // ════════════════════════════════════════════════════════

  // GET /api/plc-rfq/:rfqId/tbe — list TBE records for an RFQ
  app.get('/api/plc-rfq/:rfqId/tbe', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rfqId = parseInt(req.params.rfqId);
      if (isNaN(rfqId)) return badReq(res, 'Invalid rfqId');

      const result = await pool.query(
        `SELECT t.*,
                v.name AS recommended_vendor_name, v.display_name AS recommended_vendor_display_name,
                p.plc_number, p.tag_no, p.service_description,
                u.username AS conducted_by_name
         FROM plc_tbe_records t
         LEFT JOIN vendors v ON v.id = t.recommended_vendor_id
         LEFT JOIN procurement_list_lines p ON p.id = t.plc_line_id
         LEFT JOIN users u ON u.id = t.conducted_by
         WHERE t.rfq_id = $1
         ORDER BY p.plc_number`, [rfqId]
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // GET /api/plc-tbe/:id — single TBE record
  app.get('/api/plc-tbe/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid tbe id');

      const result = await pool.query(
        `SELECT t.*, v.name AS recommended_vendor_name, p.plc_number, p.tag_no
         FROM plc_tbe_records t
         LEFT JOIN vendors v ON v.id = t.recommended_vendor_id
         LEFT JOIN procurement_list_lines p ON p.id = t.plc_line_id
         WHERE t.id = $1`, [id]
      );
      if (result.rowCount === 0) return notFound(res, 'TBE record');
      res.json(result.rows[0]);
    } catch (e) { sendErr(res, e); }
  });

  // PUT /api/plc-rfq/:rfqId/tbe — upsert TBE record (create or update per rfq+line)
  app.put('/api/plc-rfq/:rfqId/tbe', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const rfqId = parseInt(req.params.rfqId);
      if (isNaN(rfqId)) return badReq(res, 'Invalid rfqId');
      const userId = (req.user as any)?.id;
      const {
        plcLineId, recommendedVendorId, tbeReportGcsPath, tbeReportGcsBucket,
        status = 'in_progress', notes,
      } = req.body || {};

      if (!plcLineId) return badReq(res, 'plcLineId required');

      // Validate RFQ exists
      const rfqRes = await pool.query(`SELECT id FROM plc_rfq_records WHERE id = $1`, [rfqId]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');

      const result = await pool.query(
        `INSERT INTO plc_tbe_records (rfq_id, plc_line_id, recommended_vendor_id,
           tbe_report_gcs_path, tbe_report_gcs_bucket, status, notes, conducted_by, conducted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $6='complete' THEN NOW() ELSE NULL END)
         ON CONFLICT (rfq_id, plc_line_id) DO UPDATE SET
           recommended_vendor_id=$3, tbe_report_gcs_path=$4, tbe_report_gcs_bucket=$5,
           status=$6, notes=$7, conducted_by=$8,
           conducted_at=CASE WHEN $6='complete' THEN NOW() ELSE plc_tbe_records.conducted_at END
         RETURNING *`,
        [rfqId, plcLineId, recommendedVendorId || null, tbeReportGcsPath || null,
         tbeReportGcsBucket || null, status, notes || null, userId]
      );

      // Update PLC line status when TBE complete
      const tbeNewLineStatus = status === 'complete' ? 'tbe_complete'
        : status === 'in_progress' ? 'tbe_in_progress' : null;
      if (status === 'complete') {
        await pool.query(
          `UPDATE procurement_list_lines SET status = 'tbe_complete', updated_at = NOW()
           WHERE id = $1 AND status IN ('rfq_closed','tbe_in_progress')`,
          [plcLineId]
        );
      } else if (status === 'in_progress') {
        await pool.query(
          `UPDATE procurement_list_lines SET status = 'tbe_in_progress', updated_at = NOW()
           WHERE id = $1 AND status IN ('rfq_closed')`,
          [plcLineId]
        );
      }

      // Audit
      const tbeLineRow = await pool.query(
        `SELECT project_id FROM procurement_list_lines WHERE id = $1`, [plcLineId]
      );
      if (tbeLineRow.rowCount && tbeLineRow.rowCount > 0) {
        await logPlcAudit(pool, {
          projectId: tbeLineRow.rows[0].project_id,
          entityType: 'plc_line', entityId: plcLineId,
          eventType: status === 'complete' ? 'tbe_complete' : 'tbe_updated',
          oldStatus: null, newStatus: tbeNewLineStatus,
          changedBy: userId,
          notes: `TBE ${status === 'complete' ? 'completed' : 'updated'} for RFQ ${rfqId}`,
          metadata: { rfqId, plcLineId, recommendedVendorId: recommendedVendorId || null },
        });
      }

      res.json({ success: true, tbe: result.rows[0] });
    } catch (e) { sendErr(res, e); }
  });

  // POST /api/plc-tbe/:id/recommend — set recommended vendor on TBE
  app.post('/api/plc-tbe/:id/recommend', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid tbe id');
      const { recommendedVendorId } = req.body || {};
      if (!recommendedVendorId) return badReq(res, 'recommendedVendorId required');

      const result = await pool.query(
        `UPDATE plc_tbe_records SET recommended_vendor_id = $2, status = 'complete', conducted_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, recommendedVendorId]
      );
      if (result.rowCount === 0) return notFound(res, 'TBE record');

      const tbe = result.rows[0];
      await pool.query(
        `UPDATE procurement_list_lines SET status = 'tbe_complete', updated_at = NOW()
         WHERE id = $1 AND status IN ('rfq_closed','tbe_in_progress')`,
        [tbe.plc_line_id]
      );

      // Audit
      const tbeRecLineRow = await pool.query(
        `SELECT project_id FROM procurement_list_lines WHERE id = $1`, [tbe.plc_line_id]
      );
      if (tbeRecLineRow.rowCount && tbeRecLineRow.rowCount > 0) {
        await logPlcAudit(pool, {
          projectId: tbeRecLineRow.rows[0].project_id,
          entityType: 'plc_line', entityId: tbe.plc_line_id,
          eventType: 'tbe_vendor_recommended',
          oldStatus: null, newStatus: 'tbe_complete',
          changedBy: (req.user as any)?.id,
          notes: `TBE vendor ${recommendedVendorId} recommended for RFQ ${tbe.rfq_id}`,
          metadata: { rfqId: tbe.rfq_id, recommendedVendorId },
        });
      }

      res.json({ success: true, tbe });
    } catch (e) { sendErr(res, e); }
  });

  // ════════════════════════════════════════════════════════
  // CBE (Commercial Bid Evaluation)
  // ════════════════════════════════════════════════════════

  // GET /api/plc-rfq/:rfqId/cbe — list CBE records for an RFQ
  app.get('/api/plc-rfq/:rfqId/cbe', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rfqId = parseInt(req.params.rfqId);
      if (isNaN(rfqId)) return badReq(res, 'Invalid rfqId');

      const result = await pool.query(
        `SELECT c.*,
                vr.name AS recommended_vendor_name, vr.display_name AS recommended_vendor_display_name,
                vf.name AS final_vendor_name, vf.display_name AS final_vendor_display_name,
                p.plc_number, p.tag_no, p.service_description,
                u.username AS approved_by_name
         FROM plc_cbe_records c
         LEFT JOIN vendors vr ON vr.id = c.recommended_vendor_id
         LEFT JOIN vendors vf ON vf.id = c.final_vendor_id
         LEFT JOIN procurement_list_lines p ON p.id = c.plc_line_id
         LEFT JOIN users u ON u.id = c.approved_by
         WHERE c.rfq_id = $1
         ORDER BY p.plc_number`, [rfqId]
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // GET /api/plc-cbe/:id — single CBE record
  app.get('/api/plc-cbe/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid cbe id');

      const result = await pool.query(
        `SELECT c.*, p.plc_number, p.tag_no,
                vr.name AS recommended_vendor_name, vf.name AS final_vendor_name
         FROM plc_cbe_records c
         LEFT JOIN procurement_list_lines p ON p.id = c.plc_line_id
         LEFT JOIN vendors vr ON vr.id = c.recommended_vendor_id
         LEFT JOIN vendors vf ON vf.id = c.final_vendor_id
         WHERE c.id = $1`, [id]
      );
      if (result.rowCount === 0) return notFound(res, 'CBE record');
      res.json(result.rows[0]);
    } catch (e) { sendErr(res, e); }
  });

  // PUT /api/plc-rfq/:rfqId/cbe — upsert CBE record
  app.put('/api/plc-rfq/:rfqId/cbe', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const rfqId = parseInt(req.params.rfqId);
      if (isNaN(rfqId)) return badReq(res, 'Invalid rfqId');
      const userId = (req.user as any)?.id;
      const {
        plcLineId, recommendedVendorId, finalVendorId, finalUnitPrice,
        status = 'in_progress', notes,
      } = req.body || {};

      if (!plcLineId) return badReq(res, 'plcLineId required');

      const rfqRes = await pool.query(`SELECT id FROM plc_rfq_records WHERE id = $1`, [rfqId]);
      if (rfqRes.rowCount === 0) return notFound(res, 'RFQ');

      const result = await pool.query(
        `INSERT INTO plc_cbe_records (rfq_id, plc_line_id, recommended_vendor_id,
           final_vendor_id, final_unit_price, status, notes, approved_by, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,
           CASE WHEN $6='complete' THEN $8 ELSE NULL END,
           CASE WHEN $6='complete' THEN NOW() ELSE NULL END)
         ON CONFLICT (rfq_id, plc_line_id) DO UPDATE SET
           recommended_vendor_id=$3, final_vendor_id=$4, final_unit_price=$5,
           status=$6, notes=$7,
           approved_by=CASE WHEN $6='complete' THEN $8 ELSE plc_cbe_records.approved_by END,
           approved_at=CASE WHEN $6='complete' THEN NOW() ELSE plc_cbe_records.approved_at END
         RETURNING *`,
        [rfqId, plcLineId, recommendedVendorId || null, finalVendorId || null,
         finalUnitPrice || null, status, notes || null, userId]
      );

      // When CBE complete with final vendor, update PLC line: set vendor + status
      const cbeNewLineStatus = (status === 'complete' && finalVendorId) ? 'vendor_selected'
        : status === 'in_progress' ? 'cbe_in_progress' : null;
      if (status === 'complete' && finalVendorId) {
        await pool.query(
          `UPDATE procurement_list_lines
           SET status = 'vendor_selected', vendor_id = $2, updated_at = NOW()
           WHERE id = $1 AND status IN ('rfq_closed','tbe_complete','cbe_in_progress')`,
          [plcLineId, finalVendorId]
        );
      } else if (status === 'in_progress') {
        await pool.query(
          `UPDATE procurement_list_lines SET status = 'cbe_in_progress', updated_at = NOW()
           WHERE id = $1 AND status IN ('tbe_complete')`,
          [plcLineId]
        );
      }

      // Audit
      const cbeLineRow = await pool.query(
        `SELECT project_id FROM procurement_list_lines WHERE id = $1`, [plcLineId]
      );
      if (cbeLineRow.rowCount && cbeLineRow.rowCount > 0) {
        const cbeEventType = (status === 'complete' && finalVendorId)
          ? 'vendor_selected' : 'cbe_updated';
        await logPlcAudit(pool, {
          projectId: cbeLineRow.rows[0].project_id,
          entityType: 'plc_line', entityId: plcLineId,
          eventType: cbeEventType,
          oldStatus: null, newStatus: cbeNewLineStatus,
          changedBy: userId,
          notes: cbeEventType === 'vendor_selected'
            ? `CBE complete — vendor ${finalVendorId} selected at ${finalUnitPrice ?? '—'}`
            : `CBE in progress for RFQ ${rfqId}`,
          metadata: { rfqId, plcLineId, finalVendorId: finalVendorId || null, finalUnitPrice: finalUnitPrice || null },
        });
      }

      res.json({ success: true, cbe: result.rows[0] });
    } catch (e) { sendErr(res, e); }
  });

  // POST /api/plc-cbe/:id/finalize — finalize vendor selection
  app.post('/api/plc-cbe/:id/finalize', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid cbe id');
      const userId = (req.user as any)?.id;
      const { finalVendorId, finalUnitPrice } = req.body || {};
      if (!finalVendorId) return badReq(res, 'finalVendorId required');

      const result = await pool.query(
        `UPDATE plc_cbe_records SET final_vendor_id=$2, final_unit_price=$3,
           status='complete', approved_by=$4, approved_at=NOW()
         WHERE id=$1 RETURNING *`,
        [id, finalVendorId, finalUnitPrice || null, userId]
      );
      if (result.rowCount === 0) return notFound(res, 'CBE record');

      const cbe = result.rows[0];
      await pool.query(
        `UPDATE procurement_list_lines
         SET status = 'vendor_selected', vendor_id = $2, updated_at = NOW()
         WHERE id = $1 AND status IN ('rfq_closed','tbe_complete','cbe_in_progress')`,
        [cbe.plc_line_id, finalVendorId]
      );

      // Audit
      const cbeFinLineRow = await pool.query(
        `SELECT project_id FROM procurement_list_lines WHERE id = $1`, [cbe.plc_line_id]
      );
      if (cbeFinLineRow.rowCount && cbeFinLineRow.rowCount > 0) {
        await logPlcAudit(pool, {
          projectId: cbeFinLineRow.rows[0].project_id,
          entityType: 'plc_line', entityId: cbe.plc_line_id,
          eventType: 'vendor_selected',
          oldStatus: null, newStatus: 'vendor_selected',
          changedBy: userId,
          notes: `CBE finalized — vendor ${finalVendorId} selected at ${finalUnitPrice ?? '—'}`,
          metadata: { cbeId: id, rfqId: cbe.rfq_id, finalVendorId, finalUnitPrice: finalUnitPrice || null },
        });
      }

      res.json({ success: true, cbe });
    } catch (e) { sendErr(res, e); }
  });
}
