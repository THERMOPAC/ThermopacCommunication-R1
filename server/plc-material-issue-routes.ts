/**
 * PLC Material Issue Routes — Phase 3
 * Governance: docs/procurement-list-control-baseline-v1.md §9g, §27 Phase 3
 *
 * Routes (3):
 *   POST  /api/plc-mir                             — Record material issue to production
 *   GET   /api/projects/:projectId/plc-mir          — All MIRs for project
 *   GET   /api/plc-mir/:id                          — Single MIR detail
 */

import { Express, Request, Response } from 'express';
import { pool } from './db';
import { requirePageAccess } from './utils/permission-utils';
import { getNextDocSeq } from './doc-sequence-service';
import { logPlcAudit } from './plc-line-service';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}
const PAGE = requirePageAccess('procurement-list-control');

function sendErr(res: Response, err: unknown) {
  console.error('[plc-mir]', err);
  res.status(500).json({ error: 'Internal server error', detail: String(err) });
}
function badReq(res: Response, msg: string) { return res.status(400).json({ error: msg }); }
function notFound(res: Response, entity: string) { return res.status(404).json({ error: `${entity} not found` }); }

export function setupPlcMaterialIssueRoutes(app: Express): void {

  // POST /api/plc-mir — Record material issue to production / site
  app.post('/api/plc-mir', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const {
        plcLineId, projectId, grnRecordId,
        issuedQty, issuedTo, purposeNotes,
      } = req.body || {};

      if (!plcLineId) return badReq(res, 'plcLineId required');
      if (!projectId) return badReq(res, 'projectId required');
      if (!issuedQty || parseFloat(issuedQty) <= 0) return badReq(res, 'issuedQty must be > 0');
      if (!issuedTo) return badReq(res, 'issuedTo required');

      // Validate PLC line exists
      const lineRes = await pool.query(
        `SELECT id, status, qty_received, plc_number FROM procurement_list_lines
         WHERE id = $1 AND project_id = $2`,
        [plcLineId, projectId]
      );
      if (lineRes.rowCount === 0) return notFound(res, 'PLC line');
      const line = lineRes.rows[0];

      const issueableStatuses = ['partially_received', 'fully_received', 'closed'];
      if (!issueableStatuses.includes(line.status)) {
        return badReq(res, `Cannot issue material for line in status '${line.status}' — material must be received first`);
      }

      // Validate grnRecordId if provided
      if (grnRecordId) {
        const grnCheck = await pool.query(
          `SELECT id FROM plc_grn_records WHERE id = $1 AND plc_line_id = $2 AND status = 'accepted'`,
          [grnRecordId, plcLineId]
        );
        if (grnCheck.rowCount === 0) return badReq(res, 'GRN record not found or not accepted for this PLC line');
      }

      // Validate issued qty does not exceed total received qty
      const totalIssued = await pool.query(
        `SELECT COALESCE(SUM(issued_qty),0) AS total FROM plc_material_issues WHERE plc_line_id = $1`,
        [plcLineId]
      );
      const alreadyIssued = parseFloat(totalIssued.rows[0].total) || 0;
      const qtyReceived = parseFloat(line.qty_received) || 0;
      const newIssued = parseFloat(issuedQty);

      if (alreadyIssued + newIssued > qtyReceived) {
        return badReq(res, `Cannot issue ${newIssued} — only ${qtyReceived - alreadyIssued} available (received=${qtyReceived}, already issued=${alreadyIssued})`);
      }

      // Fetch project code for MIR number
      const projRes = await pool.query(`SELECT code FROM projects WHERE id = $1`, [projectId]);
      if (projRes.rowCount === 0) return notFound(res, 'Project');
      const projectCode = projRes.rows[0].code;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const mirSeq = await getNextDocSeq('MIR', projectId, client);
        const mirNumber = `${projectCode}-MIR-${mirSeq.padStart(4, '0')}`;

        const insertRes = await client.query(
          `INSERT INTO plc_material_issues (
             mir_number, project_id, plc_line_id, grn_record_id,
             issued_qty, issued_to, purpose_notes, issued_by, issued_at, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
           RETURNING *`,
          [
            mirNumber, projectId, plcLineId,
            grnRecordId || null, newIssued, issuedTo,
            purposeNotes || null, userId,
          ]
        );
        const mir = insertRes.rows[0];

        await logPlcAudit(client, {
          projectId, entityType: 'plc_line', entityId: plcLineId,
          eventType: 'material_issued', oldStatus: null, newStatus: null,
          changedBy: userId,
          notes: `MIR ${mirNumber}: ${newIssued} unit(s) issued to ${issuedTo}`,
          metadata: { mirNumber, issuedQty: newIssued, issuedTo, grnRecordId: grnRecordId || null },
        });

        await client.query('COMMIT');
        res.status(201).json({ success: true, mir });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) { sendErr(res, e); }
  });

  // GET /api/projects/:projectId/plc-mir — All MIRs for project
  app.get('/api/projects/:projectId/plc-mir', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return badReq(res, 'Invalid projectId');
      const { plcLineId } = req.query as Record<string, string>;

      let where = 'WHERE m.project_id = $1';
      const params: any[] = [projectId];
      if (plcLineId) { params.push(parseInt(plcLineId)); where += ` AND m.plc_line_id = $${params.length}`; }

      const result = await pool.query(
        `SELECT m.*,
                p.plc_number, p.tag_no, p.service_description,
                u.username AS issued_by_name
         FROM plc_material_issues m
         LEFT JOIN procurement_list_lines p ON p.id = m.plc_line_id
         LEFT JOIN users u ON u.id = m.issued_by
         ${where}
         ORDER BY m.issued_at DESC, m.id DESC`,
        params
      );
      res.json(result.rows);
    } catch (e) { sendErr(res, e); }
  });

  // GET /api/plc-mir/:id — Single MIR detail
  app.get('/api/plc-mir/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return badReq(res, 'Invalid mir id');

      const result = await pool.query(
        `SELECT m.*,
                p.plc_number, p.tag_no, p.service_description,
                u.username AS issued_by_name,
                g.grn_number
         FROM plc_material_issues m
         LEFT JOIN procurement_list_lines p ON p.id = m.plc_line_id
         LEFT JOIN users u ON u.id = m.issued_by
         LEFT JOIN plc_grn_records g ON g.id = m.grn_record_id
         WHERE m.id = $1`, [id]
      );
      if (result.rowCount === 0) return notFound(res, 'MIR');
      res.json(result.rows[0]);
    } catch (e) { sendErr(res, e); }
  });
}
