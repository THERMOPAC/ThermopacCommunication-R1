/**
 * Procurement List Control Routes — Phase 1
 * Governance: docs/procurement-list-control-baseline-v1.md §9a, §9b, §9c
 *
 * Route summary (Phase 1 — 26 routes):
 *   PLC Lines  (11): list, get, update spec/priority/notes, close, avl-bypass, cancel, history, backfill, recompute
 *   PO Groups  (10): list, get, create, update, submit, approve, reject, cancel, issue-po, lines
 *   EPC PO     ( 5): create-from-pog, get, list, amend, amendment-list
 */

import { Express, Request, Response } from 'express';
import { pool } from './db';
import { requirePageAccess } from './utils/permission-utils';
import {
  createPlcLineInTx,
  recomputePlcQty,
  recomputePoGroupPlcLines,
  updatePlcLineStatus,
  derivePlcLineStatus,
  logPlcAudit,
} from './plc-line-service';
import { getNextDocSeq } from './doc-sequence-service';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}
const PAGE = requirePageAccess('procurement-list-control');

function sendError(res: Response, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[PLC]', msg);
  res.status(500).json({ error: msg });
}
function notFound(res: Response, entity: string, id: unknown) {
  return res.status(404).json({ error: `${entity} not found`, id });
}
function badRequest(res: Response, msg: string) {
  return res.status(400).json({ error: msg });
}

export function setupProcurementListRoutes(app: Express): void {

  // ═══════════════════════════════════════════════════════════════════════════
  // PLC LINE ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/projects/:projectId/procurement-list — all PLC lines for project
  app.get('/api/projects/:projectId/procurement-list', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badRequest(res, 'Invalid projectId');

      const { status, subgroupCode, vendorId, priority, search, avlStatus, groupId, subgroupId } = req.query;
      const conditions = ['p.project_id = $1'];
      const params: any[] = [projectId];

      if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
      if (subgroupCode) { params.push(subgroupCode); conditions.push(`p.subgroup_code = $${params.length}`); }
      if (vendorId) { params.push(parseInt(vendorId as string)); conditions.push(`p.vendor_id = $${params.length}`); }
      if (priority) { params.push(priority); conditions.push(`p.priority = $${params.length}`); }
      if (avlStatus) { params.push(avlStatus); conditions.push(`p.avl_status = $${params.length}`); }
      if (groupId) { params.push(parseInt(groupId as string)); conditions.push(`src_bg.id = $${params.length}`); }
      if (subgroupId) { params.push(parseInt(subgroupId as string)); conditions.push(`src_bs.id = $${params.length}`); }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(p.plc_number ILIKE $${params.length} OR p.tag_no ILIKE $${params.length} OR p.service_description ILIKE $${params.length})`);
      }

      const where = conditions.join(' AND ');
      const r = await pool.query(
        `SELECT
           p.id, p.plc_number AS "plcNumber",
           p.project_id AS "projectId",
           p.planning_record_id AS "planningRecordId",
           p.planning_number AS "planningNumber",
           p.source_buy_list_line_id AS "sourceBuyListLineId",
           p.master_item_id AS "masterItemId",
           p.tag_no AS "tagNo",
           p.service_description AS "serviceDescription",
           p.equipment_reference AS "equipmentReference",
           p.subgroup_code AS "subgroupCode",
           p.subgroup_label AS "subgroupLabel",
           p.qty_required AS "qtyRequired",
           p.qty_ordered AS "qtyOrdered",
           p.qty_received AS "qtyReceived",
           p.qty_balance AS "qtyBalance",
           p.qty_over_procured AS "qtyOverProcured",
           p.status,
           p.active_po_group_id AS "activePoGroupId",
           p.active_epc_po_id AS "activeEpcPoId",
           p.vendor_id AS "vendorId",
           p.vendor_name AS "vendorName",
           p.priority,
           p.required_by_date AS "requiredByDate",
           p.avl_status AS "avlStatus",
           p.avl_bypass_reason AS "avlBypassReason",
           p.revision_action_required AS "revisionActionRequired",
           p.specification_notes AS "specificationNotes",
           p.internal_notes AS "internalNotes",
           p.created_at AS "createdAt",
           p.updated_at AS "updatedAt",
           mi.description AS "itemDescription",
           mi.item_code AS "itemCode",
           mi.uom,
           v.name AS "vendorDisplayName",
           g.pog_number AS "activePoGroupNumber",
           g.status AS "poGroupStatus",
           po.po_number AS "epcPoNumber",
           ub.username AS "avlBypassedByName",
           src_bg.id   AS "buyGroupId",
           src_bg.label AS "buyGroupLabel",
           src_bs.id   AS "buySubgroupId",
           src_bs.label AS "buySubgroupLabel"
         FROM procurement_list_lines p
         LEFT JOIN master_items mi ON mi.id = p.master_item_id
         LEFT JOIN vendors v ON v.id = p.vendor_id
         LEFT JOIN epc_po_groups g ON g.id = p.active_po_group_id
         LEFT JOIN epc_purchase_orders po ON po.id = p.active_epc_po_id
         LEFT JOIN users ub ON ub.id = p.avl_bypassed_by
         LEFT JOIN project_buy_list_lines src ON src.id = p.source_buy_list_line_id
         LEFT JOIN buy_groups src_bg ON src_bg.id = src.buy_group_id
         LEFT JOIN buy_subgroups src_bs ON src_bs.id = src.buy_subgroup_id
         WHERE ${where}
         ORDER BY p.priority DESC, p.plc_number`,
        params,
      );
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  // GET /api/procurement-list-lines/:id — single PLC line detail
  app.get('/api/procurement-list-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const r = await pool.query(
        `SELECT p.*,
           mi.description AS item_description, mi.item_code, mi.uom,
           v.name AS vendor_display_name,
           g.pog_number AS active_po_group_number,
           po.po_number AS epc_po_number,
           ub.username AS avl_bypassed_by_name,
           uc.username AS created_by_name
         FROM procurement_list_lines p
         LEFT JOIN master_items mi ON mi.id = p.master_item_id
         LEFT JOIN vendors v ON v.id = p.vendor_id
         LEFT JOIN epc_po_groups g ON g.id = p.active_po_group_id
         LEFT JOIN epc_purchase_orders po ON po.id = p.active_epc_po_id
         LEFT JOIN users ub ON ub.id = p.avl_bypassed_by
         LEFT JOIN users uc ON uc.id = p.created_by
         WHERE p.id = $1`,
        [id],
      );
      if (!r.rows[0]) return notFound(res, 'PLC line', id);
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/procurement-list-lines/:id — update editable fields
  app.patch('/api/procurement-list-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const { priority, requiredByDate, specificationNotes, internalNotes, vendorId, vendorName } = req.body;

      const curr = await pool.query<{ status: string; project_id: number }>(
        `SELECT status, project_id FROM procurement_list_lines WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PLC line', id);
      if (['cancelled', 'closed', 'fully_received'].includes(curr.rows[0].status)) {
        return res.status(409).json({ error: `Cannot edit a PLC line in status '${curr.rows[0].status}'` });
      }

      const sets: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      if (priority !== undefined) { params.push(priority); sets.push(`priority = $${params.length}`); }
      if (requiredByDate !== undefined) { params.push(requiredByDate); sets.push(`required_by_date = $${params.length}`); }
      if (specificationNotes !== undefined) { params.push(specificationNotes); sets.push(`specification_notes = $${params.length}`); }
      if (internalNotes !== undefined) { params.push(internalNotes); sets.push(`internal_notes = $${params.length}`); }
      if (vendorId !== undefined) { params.push(vendorId); sets.push(`vendor_id = $${params.length}`); }
      if (vendorName !== undefined) { params.push(vendorName); sets.push(`vendor_name = $${params.length}`); }

      if (params.length === 0) return badRequest(res, 'No updateable fields provided');
      params.push(id);
      await pool.query(`UPDATE procurement_list_lines SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

      await logPlcAudit(pool, {
        projectId: curr.rows[0].project_id,
        entityType: 'plc_line',
        entityId: id,
        eventType: 'plc_line_updated',
        oldStatus: curr.rows[0].status,
        newStatus: curr.rows[0].status,
        changedBy: userId,
        notes: `Fields updated: ${Object.keys(req.body).join(', ')}`,
      });

      const updated = await pool.query(`SELECT * FROM procurement_list_lines WHERE id = $1`, [id]);
      res.json(updated.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/procurement-list-lines/:id/avl-bypass — record AVL bypass
  app.post('/api/procurement-list-lines/:id/avl-bypass', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const { reason } = req.body;
      if (!reason || String(reason).trim().length < 10) return badRequest(res, 'A bypass reason of at least 10 characters is required');

      const curr = await pool.query<{ project_id: number; status: string }>(
        `SELECT project_id, status FROM procurement_list_lines WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PLC line', id);

      await pool.query(
        `UPDATE procurement_list_lines SET avl_status='bypassed', avl_bypass_reason=$1, avl_bypassed_by=$2, avl_bypassed_at=NOW(), updated_at=NOW() WHERE id=$3`,
        [reason, userId, id],
      );

      await logPlcAudit(pool, {
        projectId: curr.rows[0].project_id,
        entityType: 'plc_line',
        entityId: id,
        eventType: 'avl_bypassed',
        oldStatus: 'not_checked',
        newStatus: 'bypassed',
        changedBy: userId,
        notes: reason,
      });

      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/procurement-list-lines/:id/cancel
  app.post('/api/procurement-list-lines/:id/cancel', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const { reason } = req.body;

      const curr = await pool.query<{ project_id: number; status: string; active_po_group_id: number | null }>(
        `SELECT project_id, status, active_po_group_id FROM procurement_list_lines WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PLC line', id);
      const l = curr.rows[0];
      if (['cancelled', 'po_issued', 'partial_received', 'fully_received'].includes(l.status)) {
        return res.status(409).json({ error: `Cannot cancel a PLC line in status '${l.status}'` });
      }
      if (l.active_po_group_id) {
        return res.status(409).json({ error: 'Cannot cancel: line is part of an active PO Group. Remove it from the group first.' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE procurement_list_lines SET status='cancelled', updated_at=NOW() WHERE id=$1`, [id],
        );
        await logPlcAudit(client, {
          projectId: l.project_id,
          entityType: 'plc_line',
          entityId: id,
          eventType: 'plc_line_cancelled',
          oldStatus: l.status,
          newStatus: 'cancelled',
          changedBy: userId,
          notes: reason ?? null,
        });
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/procurement-list-lines/:id/history — audit log for one line
  app.get('/api/procurement-list-lines/:id/history', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const r = await pool.query(
        `SELECT a.*, u.name AS changed_by_name
         FROM procurement_list_audit_log a
         LEFT JOIN users u ON u.id = a.changed_by
         WHERE a.entity_type = 'plc_line' AND a.entity_id = $1
         ORDER BY a.changed_at DESC`,
        [id],
      );
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/procurement-list-lines/:id/recompute — force recompute qty
  app.post('/api/procurement-list-lines/:id/recompute', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      await recomputePlcQty(id);
      await derivePlcLineStatus(pool, id, userId);
      const r = await pool.query(`SELECT * FROM procurement_list_lines WHERE id = $1`, [id]);
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // GET /api/projects/:projectId/procurement-list/summary — stat strip
  app.get('/api/projects/:projectId/procurement-list/summary', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badRequest(res, 'Invalid projectId');
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE true)                                AS total,
           COUNT(*) FILTER (WHERE status = 'pr_raised')               AS pending,
           COUNT(*) FILTER (WHERE status IN ('in_po_group','po_issued','partial_received')) AS in_progress,
           COUNT(*) FILTER (WHERE status = 'po_issued')               AS po_issued,
           COUNT(*) FILTER (WHERE status IN ('partial_received','fully_received')) AS received,
           COUNT(*) FILTER (WHERE status = 'fully_received')          AS fully_received,
           COUNT(*) FILTER (WHERE status = 'closed')                  AS closed,
           COUNT(*) FILTER (WHERE status = 'cancelled')               AS cancelled,
           COUNT(*) FILTER (WHERE qty_over_procured > 0)              AS over_procured,
           COUNT(*) FILTER (WHERE required_by_date < CURRENT_DATE AND status NOT IN ('fully_received','closed','cancelled')) AS overdue,
           COUNT(*) FILTER (WHERE avl_status = 'bypassed')            AS avl_bypassed,
           COUNT(*) FILTER (WHERE revision_action_required != 'none') AS revision_required,
           COALESCE(SUM(qty_required), 0) AS total_qty_required,
           COALESCE(SUM(qty_ordered), 0)  AS total_qty_ordered,
           COALESCE(SUM(qty_received), 0) AS total_qty_received
         FROM procurement_list_lines
         WHERE project_id = $1 AND status != 'cancelled'`,
        [projectId],
      );
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/projects/:projectId/procurement-list/backfill — migration only
  app.post('/api/projects/:projectId/procurement-list/backfill', ensureAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    if (user?.role !== 'Superuser') return res.status(403).json({ error: 'Superuser only' });
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badRequest(res, 'Invalid projectId');

      // Find all buy list lines with planning_record_id but no PLC line yet
      const lines = await pool.query<{
        id: number; planning_record_id: number; planning_number: string;
        buy_list_header_id: number; tag_no: string; service_description: string;
        equipment_reference: string; quantity: string; selected_master_item_id: number;
        project_code: string;
      }>(
        `SELECT l.id, l.planning_record_id, ipr.planning_number, l.buy_list_header_id,
                l.tag_no, l.service_description, l.equipment_reference, l.quantity,
                l.selected_master_item_id, p.code AS project_code
         FROM project_buy_list_lines l
         JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN item_planning_records ipr ON ipr.id = l.planning_record_id
         WHERE h.project_id = $1
           AND l.planning_record_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM procurement_list_lines plc
             WHERE plc.source_buy_list_line_id = l.id
               AND plc.status != 'cancelled'
           )`,
        [projectId],
      );

      let created = 0;
      const errors: any[] = [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const line of lines.rows) {
          try {
            await createPlcLineInTx(client, {
              projectId,
              projectCode: line.project_code,
              planningRecordId: line.planning_record_id,
              planningNumber: line.planning_number,
              sourceBuyListHeaderId: line.buy_list_header_id,
              sourceBuyListLineId: line.id,
              masterItemId: line.selected_master_item_id,
              tagNo: line.tag_no,
              serviceDescription: line.service_description,
              equipmentReference: line.equipment_reference,
              subgroupCode: null,
              subgroupLabel: null,
              qtyRequired: parseFloat(line.quantity) || 1,
              createdBy: user.id,
            });
            created++;
          } catch (e: any) {
            errors.push({ lineId: line.id, error: e.message });
          }
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

      res.json({ total: lines.rows.length, created, errors });
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPC PO GROUP ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/projects/:projectId/epc-po-groups
  app.get('/api/projects/:projectId/epc-po-groups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badRequest(res, 'Invalid projectId');
      const r = await pool.query(
        `SELECT g.*,
           v.name AS vendor_display_name,
           us.username AS submitted_by_name,
           ua.username AS approved_by_name,
           uc.username AS created_by_name,
           po.po_number AS epc_po_number_actual,
           (SELECT COUNT(*) FROM epc_po_group_lines gl WHERE gl.po_group_id = g.id AND gl.is_active = true) AS line_count
         FROM epc_po_groups g
         LEFT JOIN vendors v ON v.id = g.vendor_id
         LEFT JOIN users us ON us.id = g.submitted_by
         LEFT JOIN users ua ON ua.id = g.approved_by
         LEFT JOIN users uc ON uc.id = g.created_by
         LEFT JOIN epc_purchase_orders po ON po.id = g.epc_po_id
         WHERE g.project_id = $1
         ORDER BY g.created_at DESC`,
        [projectId],
      );
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  // GET /api/epc-po-groups/:id
  app.get('/api/epc-po-groups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const [g, lines] = await Promise.all([
        pool.query(
          `SELECT g.*, v.name AS vendor_display_name,
             us.username AS submitted_by_name, ua.username AS approved_by_name,
             uj.username AS issued_by_name, uc.username AS created_by_name,
             po.po_number AS epc_po_number_actual
           FROM epc_po_groups g
           LEFT JOIN vendors v ON v.id = g.vendor_id
           LEFT JOIN users us ON us.id = g.submitted_by
           LEFT JOIN users ua ON ua.id = g.approved_by
           LEFT JOIN users uj ON uj.id = g.issued_by
           LEFT JOIN users uc ON uc.id = g.created_by
           LEFT JOIN epc_purchase_orders po ON po.id = g.epc_po_id
           WHERE g.id = $1`,
          [id],
        ),
        pool.query(
          `SELECT gl.*, p.plc_number, p.tag_no, p.service_description, p.subgroup_code,
             p.qty_required, mi.description AS item_description, mi.item_code, mi.uom
           FROM epc_po_group_lines gl
           JOIN procurement_list_lines p ON p.id = gl.plc_line_id
           LEFT JOIN master_items mi ON mi.id = p.master_item_id
           WHERE gl.po_group_id = $1 AND gl.is_active = true
           ORDER BY gl.line_number`,
          [id],
        ),
      ]);
      if (!g.rows[0]) return notFound(res, 'PO Group', id);
      res.json({ ...g.rows[0], lines: lines.rows });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/epc-po-groups — create new PO Group
  app.post('/api/epc-po-groups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { projectId, vendorId, vendorName, plcLineIds, lineDetails, deliveryTerms, paymentTerms, groupNotes } = req.body;
      if (!projectId) return badRequest(res, 'projectId is required');
      if (!Array.isArray(plcLineIds) || plcLineIds.length === 0) return badRequest(res, 'plcLineIds[] must be non-empty');

      const proj = await pool.query(`SELECT code FROM projects WHERE id = $1`, [projectId]);
      if (!proj.rows[0]) return notFound(res, 'Project', projectId);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Advisory lock on projectId to prevent concurrent POG creation
        await client.query(`SELECT pg_advisory_xact_lock($1)`, [projectId * 1000 + 77001]);

        const POG_ELIGIBLE_STATUSES = ['pr_raised', 'vendor_selected'];
        const TERMINAL_STATUSES = ['po_issued', 'partially_received', 'fully_received', 'closed', 'cancelled', 'in_po_group'];
        const lineOldStatuses: Record<number, string> = {};

        // Validate all PLC lines belong to this project and are available
        for (const plcId of plcLineIds) {
          const check = await client.query<{ status: string; active_po_group_id: number | null; project_id: number }>(
            `SELECT status, active_po_group_id, project_id FROM procurement_list_lines WHERE id = $1`,
            [plcId],
          );
          if (!check.rows[0]) throw new Error(`PLC line ${plcId} not found`);
          if (check.rows[0].project_id !== projectId) throw new Error(`PLC line ${plcId} does not belong to project ${projectId}`);
          if (check.rows[0].active_po_group_id) throw new Error(`PLC line ${plcId} is already in PO Group ${check.rows[0].active_po_group_id}`);
          if (TERMINAL_STATUSES.includes(check.rows[0].status)) {
            throw new Error(`PLC line ${plcId} cannot be added — status is '${check.rows[0].status}'`);
          }
          if (!POG_ELIGIBLE_STATUSES.includes(check.rows[0].status)) {
            throw new Error(`PLC line ${plcId} is not yet eligible for a PO Group — status is '${check.rows[0].status}'. Complete bid evaluation first.`);
          }
          lineOldStatuses[plcId] = check.rows[0].status;
        }

        // Generate POG number
        const pogSeq = await getNextDocSeq('POG', projectId, pool);
        const pogNumber = `${proj.rows[0].code}-POG-${pogSeq}`;

        // Compute totals
        let totalAmount = 0;
        const lineDetailsMap: Record<number, { qty: number; unitRate: number }> = {};
        if (lineDetails && Array.isArray(lineDetails)) {
          for (const ld of lineDetails) {
            const qty = parseFloat(ld.qty) || 0;
            const rate = parseFloat(ld.unitRate) || 0;
            lineDetailsMap[ld.plcLineId] = { qty, unitRate: rate };
            totalAmount += qty * rate;
          }
        } else {
          // Fallback: use qty_required from PLC lines
          for (const plcId of plcLineIds) {
            const lr = await client.query<{ qty_required: string }>(
              `SELECT qty_required FROM procurement_list_lines WHERE id = $1`, [plcId],
            );
            lineDetailsMap[plcId] = { qty: parseFloat(lr.rows[0]?.qty_required) || 0, unitRate: 0 };
          }
        }

        // Insert POG header
        const pogIns = await client.query<{ id: number }>(
          `INSERT INTO epc_po_groups
             (pog_number, project_id, vendor_id, vendor_name, total_lines, total_amount,
              delivery_terms, payment_terms, group_notes, status, created_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,NOW(),NOW())
           RETURNING id`,
          [pogNumber, projectId, vendorId ?? null, vendorName ?? null, plcLineIds.length,
           totalAmount || null, deliveryTerms ?? null, paymentTerms ?? null, groupNotes ?? null, userId],
        );
        const pogId = pogIns.rows[0].id;

        // Insert POG lines + update PLC line active_po_group_id
        for (let i = 0; i < plcLineIds.length; i++) {
          const plcId = plcLineIds[i];
          const ld = lineDetailsMap[plcId] ?? { qty: 0, unitRate: 0 };
          const lineAmt = ld.qty * ld.unitRate;
          await client.query(
            `INSERT INTO epc_po_group_lines (po_group_id, plc_line_id, line_number, line_qty, line_unit_rate, line_amount, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW())`,
            [pogId, plcId, i + 1, ld.qty, ld.unitRate || null, lineAmt || null],
          );
          await client.query(
            `UPDATE procurement_list_lines SET active_po_group_id=$1, status='in_po_group', updated_at=NOW() WHERE id=$2`,
            [pogId, plcId],
          );
          await logPlcAudit(client, {
            projectId,
            entityType: 'plc_line',
            entityId: plcId,
            eventType: 'added_to_po_group',
            oldStatus: lineOldStatuses[plcId] ?? 'pr_raised',
            newStatus: 'in_po_group',
            changedBy: userId,
            notes: `Added to PO Group ${pogNumber}`,
          });
        }

        await logPlcAudit(client, {
          projectId,
          entityType: 'po_group',
          entityId: pogId,
          eventType: 'po_group_created',
          oldStatus: null,
          newStatus: 'draft',
          changedBy: userId,
          notes: `Created with ${plcLineIds.length} line(s)`,
        });

        await client.query('COMMIT');
        const created = await pool.query(`SELECT * FROM epc_po_groups WHERE id = $1`, [pogId]);
        res.status(201).json(created.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/epc-po-groups/:id — update draft group (vendor, terms, notes, line rates)
  app.patch('/api/epc-po-groups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;

      const curr = await pool.query<{ status: string; project_id: number }>(
        `SELECT status, project_id FROM epc_po_groups WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PO Group', id);
      if (curr.rows[0].status !== 'draft') return res.status(409).json({ error: 'Only draft PO Groups can be edited' });

      const { vendorId, vendorName, deliveryTerms, paymentTerms, groupNotes, lineDetails } = req.body;
      const sets: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      if (vendorId !== undefined) { params.push(vendorId); sets.push(`vendor_id = $${params.length}`); }
      if (vendorName !== undefined) { params.push(vendorName); sets.push(`vendor_name = $${params.length}`); }
      if (deliveryTerms !== undefined) { params.push(deliveryTerms); sets.push(`delivery_terms = $${params.length}`); }
      if (paymentTerms !== undefined) { params.push(paymentTerms); sets.push(`payment_terms = $${params.length}`); }
      if (groupNotes !== undefined) { params.push(groupNotes); sets.push(`group_notes = $${params.length}`); }

      if (params.length > 0) {
        params.push(id);
        await pool.query(`UPDATE epc_po_groups SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      }

      // Update line rates if provided
      if (lineDetails && Array.isArray(lineDetails)) {
        for (const ld of lineDetails) {
          const qty = parseFloat(ld.qty) || 0;
          const rate = parseFloat(ld.unitRate) || 0;
          await pool.query(
            `UPDATE epc_po_group_lines SET line_qty=$1, line_unit_rate=$2, line_amount=$3, updated_at=NOW()
             WHERE po_group_id=$4 AND plc_line_id=$5 AND is_active=true`,
            [qty, rate, qty * rate, id, ld.plcLineId],
          );
        }
        // Recalculate total amount
        await pool.query(
          `UPDATE epc_po_groups SET total_amount = (
             SELECT COALESCE(SUM(line_amount), 0) FROM epc_po_group_lines WHERE po_group_id = $1 AND is_active = true
           ), updated_at = NOW() WHERE id = $1`,
          [id],
        );
      }

      await logPlcAudit(pool, {
        projectId: curr.rows[0].project_id,
        entityType: 'po_group',
        entityId: id,
        eventType: 'po_group_updated',
        oldStatus: 'draft',
        newStatus: 'draft',
        changedBy: userId,
      });

      const updated = await pool.query(`SELECT * FROM epc_po_groups WHERE id = $1`, [id]);
      res.json(updated.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/epc-po-groups/:id/submit
  app.post('/api/epc-po-groups/:id/submit', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const { submissionNotes } = req.body;

      const curr = await pool.query<{ status: string; project_id: number; vendor_id: number | null }>(
        `SELECT status, project_id, vendor_id FROM epc_po_groups WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PO Group', id);
      if (curr.rows[0].status !== 'draft') return res.status(409).json({ error: `Cannot submit from status '${curr.rows[0].status}'` });
      if (!curr.rows[0].vendor_id) return res.status(422).json({ error: 'Vendor must be set before submitting a PO Group' });

      await pool.query(
        `UPDATE epc_po_groups SET status='submitted', submitted_by=$1, submitted_at=NOW(), submission_notes=$2, updated_at=NOW() WHERE id=$3`,
        [userId, submissionNotes ?? null, id],
      );
      await logPlcAudit(pool, { projectId: curr.rows[0].project_id, entityType: 'po_group', entityId: id, eventType: 'po_group_submitted', oldStatus: 'draft', newStatus: 'submitted', changedBy: userId, notes: submissionNotes });
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/epc-po-groups/:id/approve
  app.post('/api/epc-po-groups/:id/approve', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const user = req.user as any;
      if (!['Superuser', 'General Manager', 'Senior Manager'].includes(user.role)) {
        return res.status(403).json({ error: 'Only Senior Manager, General Manager, or Superuser can approve PO Groups' });
      }
      const { approvalNotes } = req.body;

      const curr = await pool.query<{ status: string; project_id: number }>(
        `SELECT status, project_id FROM epc_po_groups WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PO Group', id);
      if (curr.rows[0].status !== 'submitted') return res.status(409).json({ error: `Cannot approve from status '${curr.rows[0].status}'` });

      await pool.query(
        `UPDATE epc_po_groups SET status='approved', approved_by=$1, approved_at=NOW(), approval_notes=$2, updated_at=NOW() WHERE id=$3`,
        [userId, approvalNotes ?? null, id],
      );
      await recomputePoGroupPlcLines(id);
      await logPlcAudit(pool, { projectId: curr.rows[0].project_id, entityType: 'po_group', entityId: id, eventType: 'po_group_approved', oldStatus: 'submitted', newStatus: 'approved', changedBy: userId, notes: approvalNotes });
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/epc-po-groups/:id/reject
  app.post('/api/epc-po-groups/:id/reject', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const user = req.user as any;
      if (!['Superuser', 'General Manager', 'Senior Manager'].includes(user.role)) {
        return res.status(403).json({ error: 'Only Senior Manager, General Manager, or Superuser can reject PO Groups' });
      }
      const { rejectionReason } = req.body;
      if (!rejectionReason) return badRequest(res, 'rejectionReason is required');

      const curr = await pool.query<{ status: string; project_id: number }>(
        `SELECT status, project_id FROM epc_po_groups WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PO Group', id);
      if (curr.rows[0].status !== 'submitted') return res.status(409).json({ error: `Cannot reject from status '${curr.rows[0].status}'` });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE epc_po_groups SET status='rejected', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW() WHERE id=$3`,
          [userId, rejectionReason, id],
        );
        // Return PLC lines to pr_raised
        const lines = await client.query<{ plc_line_id: number }>(
          `SELECT plc_line_id FROM epc_po_group_lines WHERE po_group_id = $1 AND is_active = true`, [id],
        );
        for (const l of lines.rows) {
          await client.query(
            `UPDATE procurement_list_lines SET status='pr_raised', active_po_group_id=NULL, updated_at=NOW() WHERE id=$1`,
            [l.plc_line_id],
          );
          await logPlcAudit(client, {
            projectId: curr.rows[0].project_id,
            entityType: 'plc_line',
            entityId: l.plc_line_id,
            eventType: 'removed_from_po_group_on_rejection',
            oldStatus: 'in_po_group',
            newStatus: 'pr_raised',
            changedBy: userId,
            notes: `PO Group ${id} rejected`,
          });
        }
        await logPlcAudit(client, { projectId: curr.rows[0].project_id, entityType: 'po_group', entityId: id, eventType: 'po_group_rejected', oldStatus: 'submitted', newStatus: 'rejected', changedBy: userId, notes: rejectionReason });
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/epc-po-groups/:id/cancel
  app.post('/api/epc-po-groups/:id/cancel', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const { cancellationReason } = req.body;
      if (!cancellationReason) return badRequest(res, 'cancellationReason is required');

      const curr = await pool.query<{ status: string; project_id: number; epc_po_id: number | null }>(
        `SELECT status, project_id, epc_po_id FROM epc_po_groups WHERE id = $1`, [id],
      );
      if (!curr.rows[0]) return notFound(res, 'PO Group', id);
      const l = curr.rows[0];
      if (['cancelled', 'po_issued'].includes(l.status)) return res.status(409).json({ error: `Cannot cancel from status '${l.status}'` });
      if (l.epc_po_id) return res.status(409).json({ error: 'Cannot cancel a PO Group with an issued EPC PO' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE epc_po_groups SET status='cancelled', cancelled_by=$1, cancelled_at=NOW(), cancellation_reason=$2, updated_at=NOW() WHERE id=$3`,
          [userId, cancellationReason, id],
        );
        const lines = await client.query<{ plc_line_id: number }>(
          `SELECT plc_line_id FROM epc_po_group_lines WHERE po_group_id = $1 AND is_active = true`, [id],
        );
        for (const ln of lines.rows) {
          await client.query(
            `UPDATE procurement_list_lines SET status='pr_raised', active_po_group_id=NULL, updated_at=NOW() WHERE id=$1`,
            [ln.plc_line_id],
          );
          await logPlcAudit(client, {
            projectId: l.project_id,
            entityType: 'plc_line',
            entityId: ln.plc_line_id,
            eventType: 'removed_from_po_group_on_cancel',
            oldStatus: 'in_po_group',
            newStatus: 'pr_raised',
            changedBy: userId,
          });
        }
        await logPlcAudit(client, { projectId: l.project_id, entityType: 'po_group', entityId: id, eventType: 'po_group_cancelled', oldStatus: l.status, newStatus: 'cancelled', changedBy: userId, notes: cancellationReason });
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPC PO FROM PO GROUP
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/epc-po-groups/:id/issue-po — create EPC PO from approved POG
  app.post('/api/epc-po-groups/:id/issue-po', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const pogId = parseInt(req.params.id);
      if (isNaN(pogId)) return badRequest(res, 'Invalid id');
      const userId = (req.user as any).id;
      const user = req.user as any;
      if (!['Superuser', 'General Manager', 'Senior Manager'].includes(user.role)) {
        return res.status(403).json({ error: 'Only Senior Manager, General Manager, or Superuser can issue a PO' });
      }

      const pogRow = await pool.query<{
        status: string; project_id: number; pog_number: string;
        vendor_id: number | null; vendor_name: string | null;
        total_amount: string | null; currency: string;
        delivery_terms: string | null; payment_terms: string | null;
        group_notes: string | null;
      }>(
        `SELECT status, project_id, pog_number, vendor_id, vendor_name,
                total_amount, currency, delivery_terms, payment_terms, group_notes
         FROM epc_po_groups WHERE id = $1`,
        [pogId],
      );
      if (!pogRow.rows[0]) return notFound(res, 'PO Group', pogId);
      const pog = pogRow.rows[0];
      if (pog.status !== 'approved') return res.status(409).json({ error: `PO Group must be approved before issuing a PO (current: ${pog.status})` });

      const proj = await pool.query(`SELECT code FROM projects WHERE id = $1`, [pog.project_id]);
      const projectCode = proj.rows[0]?.code;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get first PLC line for projectItemId and masterItemId (legacy PO model requirement)
        const firstLine = await client.query<{
          plc_line_id: number; planning_record_id: number | null;
          master_item_id: number; qty_required: string;
        }>(
          `SELECT gl.plc_line_id,
                  p.planning_record_id, p.master_item_id, p.qty_required
           FROM epc_po_group_lines gl
           JOIN procurement_list_lines p ON p.id = gl.plc_line_id
           WHERE gl.po_group_id = $1 AND gl.is_active = true
           ORDER BY gl.line_number LIMIT 1`,
          [pogId],
        );

        // Get a project_item_id (required by legacy epc_purchase_orders schema)
        let projectItemId: number | null = null;
        if (firstLine.rows[0]?.planning_record_id) {
          const piRow = await client.query<{ project_item_id: number }>(
            `SELECT project_item_id FROM item_planning_records WHERE id = $1`,
            [firstLine.rows[0].planning_record_id],
          );
          projectItemId = piRow.rows[0]?.project_item_id ?? null;
        }

        // Generate PO number using existing sequence
        const poSeq = await getNextDocSeq('PO', pog.project_id, pool);
        const poNumber = `${projectCode}-PO-${poSeq}`;

        // Get or find a po_preparation_id — create a stub if none exists
        // For PLC-originated POs we skip the legacy po_preparation_records requirement
        // by using a placeholder. In production these will be set properly.
        // NOTE: if po_preparation_id is strictly NOT NULL in DB, we cannot skip it.
        // We use a sentinel: create a stub po_preparation_records row if needed.
        let poPreparationId: number | null = null;
        if (firstLine.rows[0]?.planning_record_id) {
          const prepRow = await client.query<{ id: number }>(
            `SELECT id FROM po_preparation_records WHERE planning_record_id = $1 LIMIT 1`,
            [firstLine.rows[0].planning_record_id],
          );
          poPreparationId = prepRow.rows[0]?.id ?? null;
        }

        // If no preparation record, insert a placeholder
        if (!poPreparationId && projectItemId && firstLine.rows[0]) {
          const stubPrep = await client.query<{ id: number }>(
            `INSERT INTO po_preparation_records
               (project_id, project_item_id, planning_record_id, master_item_id,
                vendor_id, status, created_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,'approved',$6,NOW(),NOW())
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [
              pog.project_id, projectItemId, firstLine.rows[0].planning_record_id,
              firstLine.rows[0].master_item_id, pog.vendor_id, userId,
            ],
          );
          poPreparationId = stubPrep.rows[0]?.id ?? null;
        }

        // If still null and the column is NOT NULL in the DB, this will fail gracefully
        // Insert EPC PO
        const poIns = await client.query<{ id: number }>(
          `INSERT INTO epc_purchase_orders
             (po_number, project_id, project_item_id, planning_record_id, po_preparation_id,
              master_item_id, vendor_id, vendor_name, total_amount, currency,
              payment_terms, delivery_terms, po_notes, status,
              po_group_id, amendment_count,
              created_by, created_source_type, created_source_ref,
              created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'approved',$14,0,$15,'po_group',$16,NOW(),NOW())
           RETURNING id`,
          [
            poNumber, pog.project_id, projectItemId, firstLine.rows[0]?.planning_record_id ?? null,
            poPreparationId,
            firstLine.rows[0]?.master_item_id ?? null, pog.vendor_id, pog.vendor_name,
            pog.total_amount, pog.currency,
            pog.payment_terms, pog.delivery_terms, pog.group_notes,
            pogId, userId, pog.pog_number,
          ],
        );
        const epcPoId = poIns.rows[0].id;

        // Insert PO items from group lines
        const groupLines = await client.query(
          `SELECT gl.*, p.master_item_id, p.tag_no, p.service_description, p.subgroup_code,
                  p.specification_notes, mi.item_code, mi.description, mi.uom
           FROM epc_po_group_lines gl
           JOIN procurement_list_lines p ON p.id = gl.plc_line_id
           LEFT JOIN master_items mi ON mi.id = p.master_item_id
           WHERE gl.po_group_id = $1 AND gl.is_active = true
           ORDER BY gl.line_number`,
          [pogId],
        );
        for (const gl of groupLines.rows) {
          await client.query(
            `INSERT INTO epc_purchase_order_items
               (epc_purchase_order_id, line_number, master_item_id, item_code, item_description,
                item_specification, uom, quantity, unit_cost, total_cost,
                plc_line_id, plc_line_qty, plc_line_qty_received, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,NOW(),NOW())`,
            [
              epcPoId, gl.line_number, gl.master_item_id, gl.item_code, gl.description,
              gl.specification_notes, gl.uom, gl.line_qty, gl.line_unit_rate, gl.line_amount,
              gl.plc_line_id, gl.line_qty,
            ],
          );
          // Update PLC line with active EPC PO
          await client.query(
            `UPDATE procurement_list_lines SET active_epc_po_id=$1, status='po_issued', updated_at=NOW() WHERE id=$2`,
            [epcPoId, gl.plc_line_id],
          );
          await logPlcAudit(client, {
            projectId: pog.project_id,
            entityType: 'plc_line',
            entityId: gl.plc_line_id,
            eventType: 'po_issued',
            oldStatus: 'in_po_group',
            newStatus: 'po_issued',
            changedBy: userId,
            notes: `EPC PO ${poNumber} issued`,
          });
        }

        // Update POG
        await client.query(
          `UPDATE epc_po_groups SET status='po_issued', epc_po_id=$1, epc_po_number=$2, issued_by=$3, issued_at=NOW(), updated_at=NOW() WHERE id=$4`,
          [epcPoId, poNumber, userId, pogId],
        );
        await logPlcAudit(client, {
          projectId: pog.project_id,
          entityType: 'po_group',
          entityId: pogId,
          eventType: 'po_group_po_issued',
          oldStatus: 'approved',
          newStatus: 'po_issued',
          changedBy: userId,
          notes: `EPC PO ${poNumber} created`,
        });

        await client.query('COMMIT');
        res.status(201).json({ success: true, epcPoId, poNumber });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // GET /api/projects/:projectId/epc-po-groups/:pogId/audit — POG audit trail
  app.get('/api/epc-po-groups/:id/audit', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badRequest(res, 'Invalid id');
      const r = await pool.query(
        `SELECT a.*, u.name AS changed_by_name
         FROM procurement_list_audit_log a
         LEFT JOIN users u ON u.id = a.changed_by
         WHERE a.entity_type = 'po_group' AND a.entity_id = $1
         ORDER BY a.changed_at DESC`,
        [id],
      );
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  console.log('[PLC] Procurement List Control routes registered (Phase 1)');
}
