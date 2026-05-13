/**
 * PLC GRN Routes — Phase 3
 * Governance: docs/procurement-list-control-baseline-v1.md §9d, §14d-f, §27 Phase 3
 *
 * Routes (6):
 *   POST   /api/plc-grn                          — Record goods receipt
 *   GET    /api/plc-grn/:id                       — GRN detail
 *   GET    /api/projects/:projectId/plc-grn        — All GRNs for project
 *   PATCH  /api/plc-grn/:id/inspection-result      — Record inspection outcome + qty recompute
 *   POST   /api/plc-grn/:id/waive-inspection        — Waive inspection (accepted_qty = grn_qty)
 *   POST   /api/plc-grn/:id/accept-stores          — Stores acceptance sign-off
 *
 * NCR:
 *   POST   /api/plc-grn/:id/ncr                   — Raise NCR against this GRN
 *   GET    /api/plc-grn/:id/ncr                   — List NCRs for this GRN
 *
 * Qty recompute:
 *   POST   /api/projects/:projectId/procurement-list/qty-recompute  — Full project recompute (Manager)
 */

import { Express, Request, Response } from 'express';
import { pool } from './db';
import { requirePageAccess } from './utils/permission-utils';
import { getNextDocSeq } from './doc-sequence-service';
import { recomputePlcQty, derivePlcLineStatus, logPlcAudit } from './plc-line-service';
import { notifyPlcInspectionFailed, notifyPlcNcrRaised, notifyPlcGrnPendingInspection } from './plc-notification-service';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}
const PAGE = requirePageAccess('procurement-list-control');

function sendErr(res: Response, err: unknown) {
  console.error('[plc-grn]', err);
  res.status(500).json({ error: 'Internal server error', detail: String(err) });
}
function badReq(res: Response, msg: string) { return res.status(400).json({ error: msg }); }
function notFound(res: Response, entity: string) { return res.status(404).json({ error: `${entity} not found` }); }

export function setupPlcGrnRoutes(app: Express): void {

  // ════════════════════════════════════════════════════════
  // GRN — Goods Receipt
  // ════════════════════════════════════════════════════════

  // POST /api/plc-grn — Record goods receipt
  app.post('/api/plc-grn', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const {
        plcLineId, projectId, grnQty, receivedDate,
        vendorId, challanNumber, challanDate,
        epcPoId, poGroupId, notes,
      } = req.body || {};

      if (!plcLineId) return badReq(res, 'plcLineId required');
      if (!projectId) return badReq(res, 'projectId required');
      if (!grnQty || parseFloat(grnQty) <= 0) return badReq(res, 'grnQty must be > 0');
      if (!receivedDate) return badReq(res, 'receivedDate required');

      // Validate PLC line exists and is in a receivable status
      const lineRes = await pool.query(
        `SELECT id, status, project_id, plc_number, qty_required, qty_received
         FROM procurement_list_lines WHERE id = $1 AND project_id = $2`,
        [plcLineId, projectId]
      );
      if (lineRes.rowCount === 0) return notFound(res, 'PLC line');
      const line = lineRes.rows[0];

      const receivableStatuses = [
        'po_issued', 'partially_received', 'vendor_selected',
        'in_po_group', 'po_submitted', 'po_approved',
      ];
      if (!receivableStatuses.includes(line.status)) {
        return badReq(res, `Cannot record GRN for line in status '${line.status}'`);
      }

      // Fetch project code for GRN number
      const projRes = await pool.query(`SELECT code FROM projects WHERE id = $1`, [projectId]);
      if (projRes.rowCount === 0) return notFound(res, 'Project');
      const projectCode = projRes.rows[0].code;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const grnSeq = await getNextDocSeq('GRN', projectId, client);
        const grnNumber = `${projectCode}-GRN-${grnSeq.padStart(4, '0')}`;

        const insertRes = await client.query(
          `INSERT INTO plc_grn_records (
             grn_number, project_id, plc_line_id, epc_po_id, po_group_id,
             vendor_id, challan_number, challan_date, received_date,
             grn_qty, accepted_qty, rejected_qty,
             inspection_status, inspection_notes, status, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,'pending',$11,'received',$12)
           RETURNING *`,
          [
            grnNumber, projectId, plcLineId,
            epcPoId || null, poGroupId || null,
            vendorId || null, challanNumber || null, challanDate || null, receivedDate,
            parseFloat(grnQty), notes || null, userId,
          ]
        );
        const grn = insertRes.rows[0];

        // Transition line to partially_received if it was po_issued
        await client.query(
          `UPDATE procurement_list_lines
           SET status = CASE
             WHEN status = 'po_issued' THEN 'partially_received'
             ELSE status
           END, updated_at = NOW()
           WHERE id = $1 AND status IN ('po_issued')`,
          [plcLineId]
        );

        // Audit
        await logPlcAudit(client, {
          projectId, entityType: 'grn', entityId: grn.id,
          eventType: 'grn_created', oldStatus: null, newStatus: 'received',
          changedBy: userId,
          notes: `GRN ${grnNumber}: ${grnQty} units received`,
          metadata: { grnNumber, grnQty: parseFloat(grnQty), plcLineId, challanNumber: challanNumber || null },
        });

        await client.query('COMMIT');
        res.status(201).json({ success: true, grn });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // GET /api/plc-grn/:id — GRN detail with joins
  app.get('/api/plc-grn/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid grn id');

      const result = await pool.query(
        `SELECT g.*,
                p.plc_number, p.tag_no, p.service_description, p.qty_required,
                v.name AS vendor_name_resolved,
                ub.username AS created_by_name,
                ui.username AS inspection_by_name,
                us.username AS stores_accepted_by_name
         FROM plc_grn_records g
         LEFT JOIN procurement_list_lines p ON p.id = g.plc_line_id
         LEFT JOIN vendors v ON v.id = g.vendor_id
         LEFT JOIN users ub ON ub.id = g.created_by
         LEFT JOIN users ui ON ui.id = g.inspection_by
         LEFT JOIN users us ON us.id = g.stores_accepted_by
         WHERE g.id = $1`, [id]
      );
      if (result.rowCount === 0) return notFound(res, 'GRN');
      res.json(result.rows[0]);
    } catch (e) { sendErr(res, e); }
  });

  // GET /api/projects/:projectId/plc-grn — All GRNs for project
  app.get('/api/projects/:projectId/plc-grn', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badReq(res, 'Invalid projectId');
      const { plcLineId, status, inspectionStatus } = req.query as Record<string, string>;

      let where = `WHERE g.project_id = $1`;
      const params: any[] = [projectId];
      if (plcLineId) { params.push(parseInt(plcLineId)); where += ` AND g.plc_line_id = $${params.length}`; }
      if (status) { params.push(status); where += ` AND g.status = $${params.length}`; }
      if (inspectionStatus) { params.push(inspectionStatus); where += ` AND g.inspection_status = $${params.length}`; }

      const result = await pool.query(
        `SELECT g.*,
                p.plc_number, p.tag_no, p.service_description,
                v.name AS vendor_name_resolved,
                u.username AS created_by_name
         FROM plc_grn_records g
         LEFT JOIN procurement_list_lines p ON p.id = g.plc_line_id
         LEFT JOIN vendors v ON v.id = g.vendor_id
         LEFT JOIN users u ON u.id = g.created_by
         ${where}
         ORDER BY g.received_date DESC, g.id DESC`,
        params
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // PATCH /api/plc-grn/:id/inspection-result — Record inspection outcome
  app.patch('/api/plc-grn/:id/inspection-result', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid grn id');
      const userId = (req.user as any)?.id;
      const { acceptedQty, rejectedQty, notes } = req.body || {};

      if (acceptedQty === undefined || acceptedQty === null) return badReq(res, 'acceptedQty required');

      const grnRes = await pool.query(
        `SELECT * FROM plc_grn_records WHERE id = $1`, [id]
      );
      if (grnRes.rowCount === 0) return notFound(res, 'GRN');
      const grn = grnRes.rows[0];

      if (grn.status === 'accepted') return badReq(res, 'GRN already accepted');

      const accepted = parseFloat(acceptedQty) || 0;
      const rejected = parseFloat(rejectedQty) || 0;

      if (accepted + rejected > parseFloat(grn.grn_qty)) {
        return badReq(res, 'accepted_qty + rejected_qty cannot exceed grn_qty');
      }

      const inspStatus = rejected > 0 && accepted === 0 ? 'failed'
        : rejected > 0 ? 'partial' : 'passed';
      const newGrnStatus = accepted > 0 ? 'accepted' : 'rejected';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updRes = await client.query(
          `UPDATE plc_grn_records SET
             accepted_qty = $2, rejected_qty = $3,
             inspection_status = $4, inspection_notes = $5,
             inspection_by = $6, inspection_at = NOW(),
             status = $7, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id, accepted, rejected, inspStatus, notes || null, userId, newGrnStatus]
        );

        // Recompute PLC line qty and derive status
        await recomputePlcQty(grn.plc_line_id, client);
        await derivePlcLineStatus(client, grn.plc_line_id, userId);

        // Audit GRN inspection
        await logPlcAudit(client, {
          projectId: grn.project_id, entityType: 'grn', entityId: id,
          eventType: 'grn_inspection_result', oldStatus: 'received', newStatus: newGrnStatus,
          changedBy: userId,
          notes: `Inspection: accepted=${accepted}, rejected=${rejected}, status=${inspStatus}`,
          metadata: { acceptedQty: accepted, rejectedQty: rejected, inspStatus },
        });

        // Auto-raise NCR if rejected_qty > 0
        let ncr = null;
        if (rejected > 0) {
          const projRes = await client.query(`SELECT code FROM projects WHERE id = $1`, [grn.project_id]);
          const projectCode = projRes.rows[0]?.code || 'PROJ';
          const ncrSeq = await getNextDocSeq('NCR', grn.project_id, client);
          const ncrNumber = `${projectCode}-NCR-${ncrSeq.padStart(4, '0')}`;

          const ncrRes = await client.query(
            `INSERT INTO non_conformance_reports (
               project_id, project_code, ncr_number, title, description,
               severity, category, identified_date, identified_by,
               quantity_affected, status, plc_line_id, grn_record_id,
               created_by
             ) VALUES ($1,$2,$3,$4,$5,'major','procurement_receipt',NOW(),$6,$7,'open',$8,$9,$6)
             RETURNING id, ncr_number`,
            [
              grn.project_id, projectCode, ncrNumber,
              `Inspection rejection: GRN ${grn.grn_number}`,
              `${rejected} unit(s) rejected during incoming inspection. ${notes || ''}`.trim(),
              userId, Math.round(rejected), grn.plc_line_id, id,
            ]
          );
          ncr = ncrRes.rows[0];

          await logPlcAudit(client, {
            projectId: grn.project_id, entityType: 'ncr', entityId: ncr.id,
            eventType: 'ncr_auto_raised', oldStatus: null, newStatus: 'open',
            changedBy: userId,
            notes: `NCR ${ncrNumber} auto-raised: ${rejected} unit(s) rejected in GRN ${grn.grn_number}`,
            metadata: { grnId: id, rejectedQty: rejected, ncrNumber },
          });
        }

        await client.query('COMMIT');

        // Phase 4 notifications (non-fatal, post-commit)
        try {
          if (inspStatus === 'failed' || (rejected > 0 && accepted === 0)) {
            await notifyPlcInspectionFailed(id, grn.project_id, grn.grn_number, grn.plc_number || String(grn.plc_line_id), rejected, userId);
          }
          if (ncr) {
            await notifyPlcNcrRaised(ncr.id, grn.project_id, ncr.ncr_number, grn.plc_number || String(grn.plc_line_id), 'major', userId);
          }
        } catch { /* non-fatal */ }

        res.json({ success: true, grn: updRes.rows[0], ncr });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // POST /api/plc-grn/:id/waive-inspection — Waive inspection; accepted_qty = grn_qty
  app.post('/api/plc-grn/:id/waive-inspection', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid grn id');
      const userId = (req.user as any)?.id;
      const { reason } = req.body || {};
      if (!reason) return badReq(res, 'reason required for inspection waiver');

      const grnRes = await pool.query(`SELECT * FROM plc_grn_records WHERE id = $1`, [id]);
      if (grnRes.rowCount === 0) return notFound(res, 'GRN');
      const grn = grnRes.rows[0];
      if (grn.status === 'accepted') return badReq(res, 'GRN already accepted');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updRes = await client.query(
          `UPDATE plc_grn_records SET
             accepted_qty = grn_qty, rejected_qty = 0,
             inspection_status = 'waived', inspection_notes = $2,
             inspection_by = $3, inspection_at = NOW(),
             status = 'accepted', updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id, `WAIVED: ${reason}`, userId]
        );

        await recomputePlcQty(grn.plc_line_id, client);
        await derivePlcLineStatus(client, grn.plc_line_id, userId);

        await logPlcAudit(client, {
          projectId: grn.project_id, entityType: 'grn', entityId: id,
          eventType: 'grn_inspection_waived', oldStatus: 'received', newStatus: 'accepted',
          changedBy: userId, notes: `Inspection waived: ${reason}`,
          metadata: { grnId: id, grnQty: parseFloat(grn.grn_qty), reason },
        });

        await client.query('COMMIT');
        res.json({ success: true, grn: updRes.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // POST /api/plc-grn/:id/accept-stores — Stores acceptance sign-off
  app.post('/api/plc-grn/:id/accept-stores', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid grn id');
      const userId = (req.user as any)?.id;
      const { storesNotes } = req.body || {};

      const grnRes = await pool.query(`SELECT * FROM plc_grn_records WHERE id = $1`, [id]);
      if (grnRes.rowCount === 0) return notFound(res, 'GRN');
      const grn = grnRes.rows[0];

      if (grn.status !== 'accepted') {
        return badReq(res, `GRN must be inspection-accepted before stores acceptance (current: ${grn.status})`);
      }
      if (grn.stores_accepted_at) return badReq(res, 'Stores acceptance already recorded');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updRes = await client.query(
          `UPDATE plc_grn_records SET
             stores_accepted_by = $2, stores_accepted_at = NOW(),
             stores_notes = $3, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id, userId, storesNotes || null]
        );

        // Check if all qty received → fully_received logic already handled by derivePlcLineStatus
        // Re-run to be safe after stores acceptance
        await derivePlcLineStatus(client, grn.plc_line_id, userId);

        await logPlcAudit(client, {
          projectId: grn.project_id, entityType: 'grn', entityId: id,
          eventType: 'grn_stores_accepted', oldStatus: 'accepted', newStatus: 'stores_accepted',
          changedBy: userId, notes: storesNotes ? `Stores note: ${storesNotes}` : 'Stores acceptance recorded',
          metadata: { grnId: id, grnNumber: grn.grn_number },
        });

        await client.query('COMMIT');
        res.json({ success: true, grn: updRes.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // POST /api/plc-grn/:id/ncr — Manually raise NCR against a GRN
  app.post('/api/plc-grn/:id/ncr', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const grnId = parseInt(req.params.id);
      if (isNaN(grnId)) return badReq(res, 'Invalid grn id');
      const userId = (req.user as any)?.id;
      const { title, description, severity = 'major', category = 'procurement_receipt', quantityAffected } = req.body || {};

      if (!title) return badReq(res, 'title required');
      if (!description) return badReq(res, 'description required');
      if (!quantityAffected || parseFloat(quantityAffected) <= 0) return badReq(res, 'quantityAffected must be > 0');

      const grnRes = await pool.query(
        `SELECT g.*, p.plc_line_id FROM plc_grn_records g
         LEFT JOIN procurement_list_lines p ON p.id = g.plc_line_id
         WHERE g.id = $1`, [grnId]
      );
      if (grnRes.rowCount === 0) return notFound(res, 'GRN');
      const grn = grnRes.rows[0];

      const projRes = await pool.query(`SELECT code FROM projects WHERE id = $1`, [grn.project_id]);
      const projectCode = projRes.rows[0]?.code || 'PROJ';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ncrSeq = await getNextDocSeq('NCR', grn.project_id, client);
        const ncrNumber = `${projectCode}-NCR-${ncrSeq.padStart(4, '0')}`;

        const ncrRes = await client.query(
          `INSERT INTO non_conformance_reports (
             project_id, project_code, ncr_number, title, description,
             severity, category, identified_date, identified_by,
             quantity_affected, status, plc_line_id, grn_record_id, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,'open',$10,$11,$8)
           RETURNING *`,
          [
            grn.project_id, projectCode, ncrNumber, title, description,
            severity, category, userId, Math.round(parseFloat(quantityAffected)),
            grn.plc_line_id, grnId,
          ]
        );

        await logPlcAudit(client, {
          projectId: grn.project_id, entityType: 'ncr', entityId: ncrRes.rows[0].id,
          eventType: 'ncr_raised', oldStatus: null, newStatus: 'open',
          changedBy: userId, notes: `NCR ${ncrNumber} raised against GRN ${grn.grn_number}: ${title}`,
          metadata: { grnId, ncrNumber, severity, quantityAffected: parseFloat(quantityAffected) },
        });

        await client.query('COMMIT');
        res.status(201).json({ success: true, ncr: ncrRes.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // GET /api/plc-grn/:id/ncr — List NCRs for a GRN
  app.get('/api/plc-grn/:id/ncr', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const grnId = parseInt(req.params.id);
      if (isNaN(grnId)) return badReq(res, 'Invalid grn id');
      const result = await pool.query(
        `SELECT n.*, u.username AS identified_by_name, ua.username AS assigned_to_name
         FROM non_conformance_reports n
         LEFT JOIN users u ON u.id = n.identified_by
         LEFT JOIN users ua ON ua.id = n.assigned_to
         WHERE n.grn_record_id = $1 ORDER BY n.created_at DESC`,
        [grnId]
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // ════════════════════════════════════════════════════════
  // Project-wide qty recompute (Manager trigger)
  // ════════════════════════════════════════════════════════

  // POST /api/projects/:projectId/procurement-list/qty-recompute
  app.post('/api/projects/:projectId/procurement-list/qty-recompute', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badReq(res, 'Invalid projectId');
      const userId = (req.user as any)?.id;

      const linesRes = await pool.query(
        `SELECT id FROM procurement_list_lines
         WHERE project_id = $1 AND status NOT IN ('cancelled','superseded')`,
        [projectId]
      );

      let recomputed = 0;
      const errors: number[] = [];

      for (const row of linesRes.rows) {
        try {
          await recomputePlcQty(row.id);
          recomputed++;
        } catch {
          errors.push(row.id);
        }
      }

      await logPlcAudit(pool, {
        projectId, entityType: 'project', entityId: projectId,
        eventType: 'qty_recompute_triggered', oldStatus: null, newStatus: null,
        changedBy: userId,
        notes: `Manual qty recompute: ${recomputed} lines processed, ${errors.length} failed`,
        metadata: { total: linesRes.rowCount, recomputed, errors },
      });

      res.json({ success: true, recomputed, errors, total: linesRes.rowCount });
    } catch (e) { sendErr(res, e); }
  });
}
