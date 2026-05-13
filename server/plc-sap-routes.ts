/**
 * PLC SAP Routes — Phase 4
 * Baseline §9h + §19 SAP Integration Governance
 *
 * Routes:
 *   POST   /api/plc-sap/push-po/:epcPoId         Push approved EPC PO to SAP B1 (Manager)
 *   POST   /api/plc-sap/push-grn/:grnId           Push accepted GRN to SAP B1
 *   POST   /api/plc-sap/pull-grn/:epcPoId         Pull SAP GRN records for this PO
 *   POST   /api/plc-sap/reconcile/:epcPoId        Reconcile THERMOPAC vs SAP qty (Manager)
 *   GET    /api/plc-sap/sync-status/:epcPoId      SAP sync status for PO
 *   POST   /api/plc-sap/refresh-summary           Refresh procurement_cockpit_summary (Manager)
 *   GET    /api/projects/:projectId/procurement-list/export-csv   CSV export
 *   POST   /api/procurement-list-lines/:id/close  Line closure (Manager)
 *   GET    /api/plc-rate-contracts                Rate contract refs (project filter)
 *   POST   /api/plc-rate-contracts                Create rate contract ref
 *   PATCH  /api/plc-rate-contracts/:id/lock       Lock rate (Manager)
 *
 * Auth: ALL routes require ensureAuthenticated + PAGE guard
 * Manager-only routes additionally check role.
 */

import { Request, Response, Express } from 'express';
import { pool } from './db';
import { requirePageAccess } from './utils/permission-utils';
import { logPlcAudit } from './plc-line-service';
import { sapSessionManager } from './sap-session-manager';
import { sapHttpsClient } from './sap-b1-integration/sap-https-client';
import {
  notifyPlcSapSyncError,
  notifyPlcSapMismatch,
  notifyPlcLineClosed,
} from './plc-notification-service';
import { refreshCockpitSummary } from './plc-escalation-job';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ error: 'Unauthenticated' });
  next();
}
const PAGE = requirePageAccess('procurement-list-control');

function badReq(res: Response, msg: string) { return res.status(400).json({ error: msg }); }
function notFound(res: Response, entity: string) { return res.status(404).json({ error: `${entity} not found` }); }
function forbidden(res: Response, msg = 'Manager access required') { return res.status(403).json({ error: msg }); }

function isManagerOrAbove(user: any): boolean {
  const mgr = ['Superuser', 'GM', 'SM'];
  return mgr.includes(user?.role);
}

function requireManager(req: Request, res: Response): boolean {
  if (!isManagerOrAbove((req as any).user)) {
    forbidden(res);
    return false;
  }
  return true;
}

// ─── SAP session helper ──────────────────────────────────────────────────────

function getSapSession(req: Request): { sessionId: string; routeId?: string } | null {
  const userId = (req as any).user?.id;
  if (!userId) return null;
  const session = sapSessionManager.getSession(userId);
  if (!session) return null;
  return { sessionId: session.sessionId, routeId: (session as any).routeId };
}

function buildSapCookieHeader(session: { sessionId: string; routeId?: string }): string {
  return `B1SESSION=${session.sessionId}${session.routeId ? `; ROUTEID=${session.routeId}` : ''}`;
}

async function sapGet(session: { sessionId: string; routeId?: string }, path: string): Promise<any> {
  const resp = await sapHttpsClient.authenticatedRequest(session.sessionId, {
    method: 'GET',
    path,
    headers: { Cookie: buildSapCookieHeader(session) },
  });
  if (!resp.ok) throw new Error(`SAP GET ${path} failed (${resp.statusCode}): ${resp.body.slice(0, 300)}`);
  return JSON.parse(resp.body);
}

async function sapPost(session: { sessionId: string; routeId?: string }, path: string, body: any): Promise<any> {
  const resp = await sapHttpsClient.authenticatedRequest(session.sessionId, {
    method: 'POST',
    path,
    body,
    headers: { Cookie: buildSapCookieHeader(session) },
  });
  if (!resp.ok) throw new Error(`SAP POST ${path} failed (${resp.statusCode}): ${resp.body.slice(0, 300)}`);
  return JSON.parse(resp.body);
}

// ─── PO → SAP payload builder ────────────────────────────────────────────────

async function buildSapPoPayload(epcPoId: number): Promise<any> {
  const poRes = await pool.query(
    `SELECT p.*, pr.project_code, pr.project_name,
            v.sap_vendor_code, v.name AS vendor_name_master
     FROM epc_purchase_orders p
     JOIN projects pr ON pr.id = p.project_id
     LEFT JOIN vendors v ON v.id = p.vendor_id
     WHERE p.id = $1`,
    [epcPoId],
  );
  if (!poRes.rows[0]) throw new Error(`EPC PO id=${epcPoId} not found`);
  const po = poRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT i.*, mi.item_code AS master_item_code, mi.description AS master_item_desc
     FROM epc_purchase_order_items i
     LEFT JOIN master_items mi ON mi.id = i.master_item_id
     WHERE i.epc_purchase_order_id = $1
     ORDER BY i.line_number`,
    [epcPoId],
  );

  const docLines = itemsRes.rows.map((item: any) => ({
    ItemCode: item.master_item_code || item.item_code || `MISC-${item.id}`,
    ItemDescription: item.item_description || item.master_item_desc,
    Quantity: parseFloat(item.quantity) || 0,
    UnitPrice: parseFloat(item.unit_cost) || 0,
    WarehouseCode: process.env.SAP_DEFAULT_WAREHOUSE || '01',
    U_TPEL_PLCLineId: item.plc_line_id,
  }));

  return {
    CardCode: po.sap_vendor_code || `V${po.vendor_id}`,
    DocDate: new Date().toISOString().slice(0, 10),
    DocDueDate: po.payment_terms ? undefined : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    Comments: `THERMOPAC EPC PO ${po.po_number} — Project ${po.project_code}`,
    U_TPEL_EPCPOId: epcPoId,
    U_TPEL_ProjectCode: po.project_code,
    DocumentLines: docLines,
  };
}

// ─── GRN → SAP payload builder ───────────────────────────────────────────────

async function buildSapGrnPayload(grnId: number): Promise<any> {
  const grnRes = await pool.query(
    `SELECT g.*, pr.project_code, v.sap_vendor_code,
            po.sap_po_doc_entry, po.po_number
     FROM plc_grn_records g
     JOIN projects pr ON pr.id = g.project_id
     LEFT JOIN vendors v ON v.id = g.vendor_id
     LEFT JOIN epc_po_groups pog ON pog.id = g.po_group_id
     LEFT JOIN epc_purchase_orders po ON po.id = g.epc_po_id
     WHERE g.id = $1`,
    [grnId],
  );
  if (!grnRes.rows[0]) throw new Error(`GRN id=${grnId} not found`);
  const grn = grnRes.rows[0];

  const lineRes = await pool.query(
    `SELECT pl.*, mi.item_code AS master_item_code
     FROM procurement_list_lines pl
     LEFT JOIN master_items mi ON mi.id = pl.master_item_id
     WHERE pl.id = $1`,
    [grn.plc_line_id],
  );
  const line = lineRes.rows[0];

  return {
    CardCode: grn.sap_vendor_code || `V${grn.vendor_id}`,
    DocDate: grn.received_date || new Date().toISOString().slice(0, 10),
    Comments: `THERMOPAC GRN ${grn.grn_number} — Challan ${grn.challan_number || 'N/A'}`,
    U_TPEL_GRNId: grnId,
    U_TPEL_ProjectCode: grn.project_code,
    ...(grn.sap_po_doc_entry ? { BaseEntry: grn.sap_po_doc_entry } : {}),
    DocumentLines: [{
      ItemCode: line?.master_item_code || `MISC-${grn.plc_line_id}`,
      Quantity: parseFloat(grn.accepted_qty) || 0,
      WarehouseCode: process.env.SAP_DEFAULT_WAREHOUSE || '01',
      U_TPEL_GRNId: grnId,
      U_TPEL_PLCLineId: grn.plc_line_id,
    }],
  };
}

// ─── Route setup ─────────────────────────────────────────────────────────────

export function setupPlcSapRoutes(app: Express): void {

  // ── POST /api/plc-sap/push-po/:epcPoId ─────────────────────────────────────
  app.post('/api/plc-sap/push-po/:epcPoId', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    if (!requireManager(req, res)) return;
    const epcPoId = parseInt(req.params.epcPoId);
    if (isNaN(epcPoId)) return badReq(res, 'Invalid epcPoId');
    const userId = (req as any).user.id;

    const sapSession = getSapSession(req);
    if (!sapSession) return res.status(409).json({ error: 'No active SAP B1 session. Please login to SAP B1 first.', code: 'SAP_SESSION_REQUIRED' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const poRes = await client.query(
        `SELECT p.*, pr.project_code, pr.id AS pid FROM epc_purchase_orders p
         JOIN projects pr ON pr.id = p.project_id WHERE p.id = $1 FOR UPDATE`,
        [epcPoId],
      );
      if (!poRes.rows[0]) { await client.query('ROLLBACK'); return notFound(res, 'EPC PO'); }
      const po = poRes.rows[0];

      if (!['issued', 'approved'].includes(po.status)) {
        await client.query('ROLLBACK');
        return badReq(res, `EPC PO must be in issued or approved status before SAP push (current: ${po.status})`);
      }
      if (po.sap_po_doc_entry) {
        await client.query('ROLLBACK');
        return badReq(res, `EPC PO already pushed to SAP (DocEntry=${po.sap_po_doc_entry})`);
      }

      // Build and push to SAP B1
      let sapDocEntry: number | null = null;
      let sapDocNum: string | null = null;
      let syncError: string | null = null;

      try {
        const payload = await buildSapPoPayload(epcPoId);
        const sapResp = await sapPost(sapSession, '/b1s/v1/PurchaseOrders', payload);
        sapDocEntry = sapResp.DocEntry;
        sapDocNum = String(sapResp.DocNum || '');
      } catch (err: any) {
        syncError = err.message || 'SAP B1 push failed';
      }

      if (syncError) {
        await client.query(
          `UPDATE epc_purchase_orders SET
             sap_sync_status = 'error', sap_sync_note = $2, updated_at = NOW()
           WHERE id = $1`,
          [epcPoId, syncError.slice(0, 500)],
        );
        await client.query('COMMIT');

        // Fire sync error notification
        try {
          await notifyPlcSapSyncError(epcPoId, po.project_id, po.po_number, syncError, userId);
        } catch { /* non-fatal */ }

        return res.status(502).json({ success: false, error: syncError, sap_sync_status: 'error' });
      }

      await client.query(
        `UPDATE epc_purchase_orders SET
           sap_po_doc_entry = $2, sap_po_doc_num = $3,
           sap_sync_status = 'synced', sap_sync_note = NULL, sap_synced_at = NOW(),
           updated_at = NOW()
         WHERE id = $1`,
        [epcPoId, sapDocEntry, sapDocNum],
      );

      await logPlcAudit(client, {
        projectId: po.project_id,
        entityType: 'epc_po',
        entityId: epcPoId,
        eventType: 'sap_po_pushed',
        oldStatus: 'pending',
        newStatus: 'synced',
        changedBy: userId,
        notes: `PO ${po.po_number} pushed to SAP B1 — DocEntry=${sapDocEntry}, DocNum=${sapDocNum}`,
        metadata: { sapDocEntry, sapDocNum },
      });

      await client.query('COMMIT');
      res.json({ success: true, sap_po_doc_entry: sapDocEntry, sap_po_doc_num: sapDocNum, sap_sync_status: 'synced' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[PLC-SAP] push-po error:', err);
      res.status(500).json({ error: 'Internal server error', detail: err.message });
    } finally {
      client.release();
    }
  });

  // ── POST /api/plc-sap/push-grn/:grnId ──────────────────────────────────────
  app.post('/api/plc-sap/push-grn/:grnId', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const grnId = parseInt(req.params.grnId);
    if (isNaN(grnId)) return badReq(res, 'Invalid grnId');
    const userId = (req as any).user.id;

    const sapSession = getSapSession(req);
    if (!sapSession) return res.status(409).json({ error: 'No active SAP B1 session', code: 'SAP_SESSION_REQUIRED' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const grnRes = await client.query(
        `SELECT * FROM plc_grn_records WHERE id = $1 FOR UPDATE`,
        [grnId],
      );
      if (!grnRes.rows[0]) { await client.query('ROLLBACK'); return notFound(res, 'GRN'); }
      const grn = grnRes.rows[0];

      if (grn.status !== 'accepted') {
        await client.query('ROLLBACK');
        return badReq(res, `GRN must be accepted before SAP push (current: ${grn.status})`);
      }
      if (grn.sap_grn_doc_entry) {
        await client.query('ROLLBACK');
        return badReq(res, `GRN already pushed to SAP (DocEntry=${grn.sap_grn_doc_entry})`);
      }

      let sapDocEntry: number | null = null;
      let sapGrnNumber: string | null = null;
      let syncError: string | null = null;

      try {
        const payload = await buildSapGrnPayload(grnId);
        const sapResp = await sapPost(sapSession, '/b1s/v1/GoodsReceiptPO', payload);
        sapDocEntry = sapResp.DocEntry;
        sapGrnNumber = String(sapResp.DocNum || '');
      } catch (err: any) {
        syncError = err.message || 'SAP B1 GRN push failed';
      }

      if (syncError) {
        await client.query(
          `UPDATE plc_grn_records SET sap_sync_status='error', sap_sync_note=$2, updated_at=NOW() WHERE id=$1`,
          [grnId, syncError.slice(0, 500)],
        );
        await client.query('COMMIT');
        return res.status(502).json({ success: false, error: syncError, sap_sync_status: 'error' });
      }

      await client.query(
        `UPDATE plc_grn_records SET
           sap_grn_doc_entry=$2, sap_grn_number=$3,
           sap_sync_status='synced', sap_sync_note=NULL, sap_synced_at=NOW(), updated_at=NOW()
         WHERE id=$1`,
        [grnId, sapDocEntry, sapGrnNumber],
      );

      await logPlcAudit(client, {
        projectId: grn.project_id,
        entityType: 'grn',
        entityId: grnId,
        eventType: 'sap_grn_pushed',
        oldStatus: 'pending',
        newStatus: 'synced',
        changedBy: userId,
        notes: `GRN ${grn.grn_number} pushed to SAP B1 — DocEntry=${sapDocEntry}`,
        metadata: { sapDocEntry, sapGrnNumber },
      });

      await client.query('COMMIT');
      res.json({ success: true, sap_grn_doc_entry: sapDocEntry, sap_grn_number: sapGrnNumber, sap_sync_status: 'synced' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[PLC-SAP] push-grn error:', err);
      res.status(500).json({ error: 'Internal server error', detail: err.message });
    } finally {
      client.release();
    }
  });

  // ── POST /api/plc-sap/pull-grn/:epcPoId ────────────────────────────────────
  app.post('/api/plc-sap/pull-grn/:epcPoId', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const epcPoId = parseInt(req.params.epcPoId);
    if (isNaN(epcPoId)) return badReq(res, 'Invalid epcPoId');

    const sapSession = getSapSession(req);
    if (!sapSession) return res.status(409).json({ error: 'No active SAP B1 session', code: 'SAP_SESSION_REQUIRED' });

    try {
      const poRes = await pool.query(
        `SELECT p.*, pr.project_code FROM epc_purchase_orders p
         JOIN projects pr ON pr.id = p.project_id WHERE p.id = $1`,
        [epcPoId],
      );
      if (!poRes.rows[0]) return notFound(res, 'EPC PO');
      const po = poRes.rows[0];

      if (!po.sap_po_doc_entry) {
        return badReq(res, 'EPC PO has not been pushed to SAP yet — no SAP DocEntry to pull GRNs for');
      }

      // Pull GRNs referencing this PO from SAP B1
      const filter = encodeURIComponent(`BaseEntry eq ${po.sap_po_doc_entry} and BaseType eq 22`);
      const sapData = await sapGet(
        sapSession,
        `/b1s/v1/GoodsReceiptPO?$filter=${filter}&$select=DocEntry,DocNum,DocDate,CardCode,DocumentLines`,
      );

      const sapGrns = sapData?.value || [];
      const imported: any[] = [];

      for (const sapGrn of sapGrns) {
        // Check if this SAP GRN is already linked
        const existCheck = await pool.query(
          `SELECT id FROM plc_grn_records WHERE sap_grn_doc_entry = $1`,
          [sapGrn.DocEntry],
        );
        if (existCheck.rows[0]) {
          imported.push({ sapDocEntry: sapGrn.DocEntry, status: 'already_linked', grnId: existCheck.rows[0].id });
          continue;
        }

        // Create a GRN shell from SAP data (inspection still required in THERMOPAC)
        const lines: any[] = sapGrn.DocumentLines || [];
        const totalQty = lines.reduce((s: number, l: any) => s + (parseFloat(l.Quantity) || 0), 0);

        // Try to find the PLC line from the PO's first line
        const plcLineRes = await pool.query(
          `SELECT plc_line_id FROM epc_purchase_order_items WHERE epc_purchase_order_id=$1 LIMIT 1`,
          [epcPoId],
        );
        const plcLineId = plcLineRes.rows[0]?.plc_line_id || null;
        if (!plcLineId) { imported.push({ sapDocEntry: sapGrn.DocEntry, status: 'skipped_no_plc_line' }); continue; }

        const insertRes = await pool.query(
          `INSERT INTO plc_grn_records (
             grn_number, project_id, plc_line_id, epc_po_id,
             vendor_name, received_date, grn_qty,
             accepted_qty, rejected_qty, inspection_status, status,
             sap_grn_doc_entry, sap_grn_number, sap_sync_status, sap_synced_at, created_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 0, 0, 'pending', 'received',
             $8, $9, 'synced', NOW(), 0
           ) RETURNING id, grn_number`,
          [
            `${po.project_code}-GRN-SAP${sapGrn.DocNum}`,
            po.project_id, plcLineId, epcPoId,
            sapGrn.CardCode, sapGrn.DocDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            totalQty, sapGrn.DocEntry, String(sapGrn.DocNum),
          ],
        );
        imported.push({ sapDocEntry: sapGrn.DocEntry, status: 'created', grnId: insertRes.rows[0].id, grnNumber: insertRes.rows[0].grn_number });
      }

      res.json({ success: true, sapGrnsFound: sapGrns.length, imported });
    } catch (err: any) {
      console.error('[PLC-SAP] pull-grn error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ── POST /api/plc-sap/reconcile/:epcPoId ───────────────────────────────────
  app.post('/api/plc-sap/reconcile/:epcPoId', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    if (!requireManager(req, res)) return;
    const epcPoId = parseInt(req.params.epcPoId);
    if (isNaN(epcPoId)) return badReq(res, 'Invalid epcPoId');
    const userId = (req as any).user.id;

    const sapSession = getSapSession(req);
    if (!sapSession) return res.status(409).json({ error: 'No active SAP B1 session', code: 'SAP_SESSION_REQUIRED' });

    try {
      const poRes = await pool.query(
        `SELECT p.*, pr.project_code FROM epc_purchase_orders p
         JOIN projects pr ON pr.id = p.project_id WHERE p.id = $1`,
        [epcPoId],
      );
      if (!poRes.rows[0]) return notFound(res, 'EPC PO');
      const po = poRes.rows[0];

      if (!po.sap_po_doc_entry) {
        return res.json({
          sap_sync_status: 'not_applicable',
          message: 'PO has not been pushed to SAP B1 — reconciliation not applicable',
          diffs: [],
          hasDiscrepancy: false,
        });
      }

      // Fetch SAP PO lines
      const sapPo = await sapGet(sapSession, `/b1s/v1/PurchaseOrders(${po.sap_po_doc_entry})?$select=DocEntry,DocNum,DocumentLines`);
      const sapLines: any[] = sapPo?.DocumentLines || [];

      // Fetch THERMOPAC PO items
      const tpItems = await pool.query(
        `SELECT i.*, pl.qty_received, pl.qty_ordered, pl.plc_number, pl.tag_no
         FROM epc_purchase_order_items i
         LEFT JOIN procurement_list_lines pl ON pl.id = i.plc_line_id
         WHERE i.epc_purchase_order_id = $1
         ORDER BY i.line_number`,
        [epcPoId],
      );

      // THERMOPAC GRN totals
      const grnTotals = await pool.query(
        `SELECT plc_line_id, SUM(accepted_qty) AS total_accepted
         FROM plc_grn_records WHERE epc_po_id = $1 AND status = 'accepted'
         GROUP BY plc_line_id`,
        [epcPoId],
      );
      const grnMap = new Map(grnTotals.rows.map((r: any) => [r.plc_line_id, parseFloat(r.total_accepted)]));

      const diffs: any[] = [];
      let hasDiscrepancy = false;

      for (const tpItem of tpItems.rows) {
        const sapLine = sapLines.find((sl: any) => sl.LineNum === tpItem.line_number - 1 || sl.ItemCode === tpItem.item_code);
        const tpQtyOrdered = parseFloat(tpItem.quantity) || 0;
        const tpQtyReceived = grnMap.get(tpItem.plc_line_id) || 0;
        const sapQtyOrdered = sapLine ? parseFloat(sapLine.Quantity) || 0 : null;
        const sapQtyReceived = sapLine ? parseFloat(sapLine.InvoicedQuantity || sapLine.OpenQuantity ? (sapLine.Quantity - sapLine.OpenQuantity) : 0) || 0 : null;

        const orderedMatch = sapQtyOrdered === null || Math.abs(tpQtyOrdered - sapQtyOrdered) < 0.001;
        const receivedMatch = sapQtyReceived === null || Math.abs(tpQtyReceived - (sapQtyReceived as number)) < 0.001;

        if (!orderedMatch || !receivedMatch) hasDiscrepancy = true;

        diffs.push({
          lineNumber: tpItem.line_number,
          itemCode: tpItem.item_code,
          plcNumber: tpItem.plc_number,
          tagNo: tpItem.tag_no,
          thermopac: { qtyOrdered: tpQtyOrdered, qtyReceived: tpQtyReceived },
          sap: { qtyOrdered: sapQtyOrdered, qtyReceived: sapQtyReceived, lineFound: !!sapLine },
          orderedMatch,
          receivedMatch,
          status: (!orderedMatch || !receivedMatch) ? 'mismatch' : 'ok',
        });
      }

      // Update SAP sync status
      const newSyncStatus = hasDiscrepancy ? 'mismatch' : 'synced';
      await pool.query(
        `UPDATE epc_purchase_orders SET sap_sync_status=$2, updated_at=NOW() WHERE id=$1`,
        [epcPoId, newSyncStatus],
      );

      await logPlcAudit(pool, {
        projectId: po.project_id,
        entityType: 'epc_po',
        entityId: epcPoId,
        eventType: 'sap_reconciliation',
        oldStatus: po.sap_sync_status,
        newStatus: newSyncStatus,
        changedBy: userId,
        notes: `Reconciliation: ${diffs.length} lines checked, hasDiscrepancy=${hasDiscrepancy}`,
        metadata: { sapDocEntry: po.sap_po_doc_entry, diffs },
      });

      if (hasDiscrepancy) {
        const mismatchCount = diffs.filter(d => d.status === 'mismatch').length;
        try { await notifyPlcSapMismatch(epcPoId, po.project_id, po.po_number, mismatchCount, userId); } catch { /* non-fatal */ }
      }

      res.json({ success: true, sap_sync_status: newSyncStatus, hasDiscrepancy, diffs, poNumber: po.po_number, sapDocEntry: po.sap_po_doc_entry });
    } catch (err: any) {
      console.error('[PLC-SAP] reconcile error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ── GET /api/plc-sap/sync-status/:epcPoId ──────────────────────────────────
  app.get('/api/plc-sap/sync-status/:epcPoId', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const epcPoId = parseInt(req.params.epcPoId);
    if (isNaN(epcPoId)) return badReq(res, 'Invalid epcPoId');

    try {
      const res2 = await pool.query(
        `SELECT id, po_number, status, sap_po_doc_entry, sap_po_doc_num,
                sap_sync_status, sap_sync_note, sap_synced_at
         FROM epc_purchase_orders WHERE id = $1`,
        [epcPoId],
      );
      if (!res2.rows[0]) return notFound(res, 'EPC PO');
      res.json(res2.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/plc-sap/refresh-summary ──────────────────────────────────────
  app.post('/api/plc-sap/refresh-summary', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    if (!requireManager(req, res)) return;
    try {
      await refreshCockpitSummary();
      res.json({ success: true, refreshed_at: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/projects/:projectId/cockpit-summary ────────────────────────────
  app.get('/api/projects/:projectId/cockpit-summary', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return badReq(res, 'Invalid projectId');
    try {
      const r = await pool.query(
        `SELECT * FROM procurement_cockpit_summary WHERE project_id = $1`,
        [projectId],
      );
      if (!r.rows[0]) return res.json(null);
      res.json(r.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/projects/:projectId/procurement-list/export-csv ───────────────
  app.get('/api/projects/:projectId/procurement-list/export-csv', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return badReq(res, 'Invalid projectId');

    const { status, subgroup } = req.query;

    try {
      const params: any[] = [projectId];
      let whereClause = 'WHERE pl.project_id = $1';

      if (status && status !== 'all') {
        params.push(status);
        whereClause += ` AND pl.status = $${params.length}`;
      }
      if (subgroup && subgroup !== 'all') {
        params.push(subgroup);
        whereClause += ` AND pl.subgroup_code = $${params.length}`;
      }

      const result = await pool.query(
        `SELECT
           pl.plc_number, pl.tag_no, pl.subgroup_code, pl.subgroup_label,
           pl.service_description, pl.equipment_reference,
           pl.qty_required, pl.qty_ordered, pl.qty_received, pl.qty_balance, pl.qty_over_procured,
           pl.status, pl.vendor_name, pl.priority, pl.required_by_date, pl.avl_status,
           g.grn_number, g.received_date, g.grn_qty, g.accepted_qty, g.rejected_qty,
           g.inspection_status, g.status AS grn_status,
           po.po_number, po.status AS po_status, po.sap_po_doc_entry, po.sap_sync_status,
           pl.internal_notes
         FROM procurement_list_lines pl
         LEFT JOIN epc_purchase_orders po ON po.id = pl.active_epc_po_id
         LEFT JOIN plc_grn_records g ON g.plc_line_id = pl.id AND g.id = (
           SELECT id FROM plc_grn_records WHERE plc_line_id = pl.id ORDER BY created_at DESC LIMIT 1
         )
         ${whereClause}
         ORDER BY pl.plc_number`,
        params,
      );

      const headers = [
        'PLC No', 'Tag No', 'Subgroup', 'Subgroup Label', 'Description', 'Equipment Ref',
        'Qty Required', 'Qty Ordered', 'Qty Received', 'Qty Balance', 'Qty Over-Procured',
        'Status', 'Vendor', 'Priority', 'Required By', 'AVL Status',
        'GRN Number', 'Received Date', 'GRN Qty', 'Accepted Qty', 'Rejected Qty',
        'Inspection Status', 'GRN Status', 'PO Number', 'PO Status', 'SAP PO DocEntry', 'SAP Sync',
        'Internal Notes',
      ];

      const csvRows = [headers.join(',')];
      for (const row of result.rows) {
        const cells = [
          row.plc_number, row.tag_no, row.subgroup_code, row.subgroup_label,
          `"${(row.service_description || '').replace(/"/g, '""')}"`,
          row.equipment_reference || '',
          row.qty_required, row.qty_ordered, row.qty_received, row.qty_balance, row.qty_over_procured,
          row.status, `"${(row.vendor_name || '').replace(/"/g, '""')}"`,
          row.priority || '', row.required_by_date || '', row.avl_status || '',
          row.grn_number || '', row.received_date || '',
          row.grn_qty || '', row.accepted_qty || '', row.rejected_qty || '',
          row.inspection_status || '', row.grn_status || '',
          row.po_number || '', row.po_status || '',
          row.sap_po_doc_entry || '', row.sap_sync_status || '',
          `"${(row.internal_notes || '').replace(/"/g, '""')}"`,
        ];
        csvRows.push(cells.join(','));
      }

      const csvContent = csvRows.join('\n');
      const filename = `PLC-Export-Project${projectId}-${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (err: any) {
      console.error('[PLC-SAP] export-csv error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/procurement-list-lines/:id/close ──────────────────────────────
  app.post('/api/procurement-list-lines/:id/close', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    if (!requireManager(req, res)) return;
    const lineId = parseInt(req.params.id);
    if (isNaN(lineId)) return badReq(res, 'Invalid line id');
    const userId = (req as any).user.id;
    const { forceClose, cancelReason } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lineRes = await client.query(
        `SELECT pl.*, pr.project_code FROM procurement_list_lines pl
         JOIN projects pr ON pr.id = pl.project_id
         WHERE pl.id = $1 FOR UPDATE`,
        [lineId],
      );
      if (!lineRes.rows[0]) { await client.query('ROLLBACK'); return notFound(res, 'PLC line'); }
      const line = lineRes.rows[0];

      if (['closed', 'cancelled', 'superseded'].includes(line.status)) {
        await client.query('ROLLBACK');
        return badReq(res, `Line is already in terminal status '${line.status}'`);
      }

      // Standard close: must be fully_received + inspection passed
      if (!forceClose) {
        if (line.status !== 'fully_received') {
          await client.query('ROLLBACK');
          return badReq(res, `Line must be fully_received before closure (current: ${line.status}). Use forceClose=true for Manager override.`);
        }
        // Check all GRNs inspected
        const pendingInsp = await client.query(
          `SELECT COUNT(*) AS n FROM plc_grn_records
           WHERE plc_line_id = $1 AND inspection_status = 'pending'`,
          [lineId],
        );
        if (parseInt(pendingInsp.rows[0].n) > 0) {
          await client.query('ROLLBACK');
          return badReq(res, 'Cannot close: GRN(s) still pending inspection');
        }
      }

      await client.query(
        `UPDATE procurement_list_lines SET
           status = 'closed', updated_at = NOW()
           ${cancelReason ? `, internal_notes = COALESCE(internal_notes || E'\\n', '') || $2` : ''}
         WHERE id = $1`,
        cancelReason ? [lineId, `[FORCE-CLOSE by Manager ${userId} on ${new Date().toISOString().slice(0,10)}]: ${cancelReason}`]
                     : [lineId],
      );

      await logPlcAudit(client, {
        projectId: line.project_id,
        entityType: 'plc_line',
        entityId: lineId,
        eventType: 'plc_line_closed',
        oldStatus: line.status,
        newStatus: 'closed',
        changedBy: userId,
        notes: forceClose
          ? `Force-closed by Manager: ${cancelReason || 'No reason given'}`
          : 'Line closed — all receipt and inspection conditions met',
        metadata: { forceClose: !!forceClose, cancelReason },
      });

      await client.query('COMMIT');

      try {
        await notifyPlcLineClosed(lineId, line.project_id, line.plc_number, line.tag_no, userId, !!forceClose);
      } catch { /* non-fatal */ }

      // Async mat view refresh
      refreshCockpitSummary().catch(() => {});

      res.json({ success: true, status: 'closed', lineId, forceClose: !!forceClose });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[PLC-SAP] line-close error:', err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // ── GET /api/plc-rate-contracts ─────────────────────────────────────────────
  app.get('/api/plc-rate-contracts', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
    const plcLineId = req.query.plcLineId ? parseInt(req.query.plcLineId as string) : null;

    try {
      const params: any[] = [];
      const conditions: string[] = [];

      if (projectId) { params.push(projectId); conditions.push(`r.project_id = $${params.length}`); }
      if (plcLineId) { params.push(plcLineId); conditions.push(`r.plc_line_id = $${params.length}`); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await pool.query(
        `SELECT r.*, pl.plc_number, pl.tag_no, pl.service_description
         FROM plc_rate_contract_refs r
         JOIN procurement_list_lines pl ON pl.id = r.plc_line_id
         ${where}
         ORDER BY r.created_at DESC`,
        params,
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/plc-rate-contracts ────────────────────────────────────────────
  app.post('/api/plc-rate-contracts', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    const {
      plcLineId, projectId, vendorId, vendorName,
      ratePerUnit, currency, validFrom, validTo, contractRef, contractNotes,
    } = req.body;

    if (!plcLineId) return badReq(res, 'plcLineId required');
    if (!projectId) return badReq(res, 'projectId required');
    if (!ratePerUnit || parseFloat(ratePerUnit) <= 0) return badReq(res, 'ratePerUnit must be > 0');
    if (!validFrom) return badReq(res, 'validFrom required');

    const userId = (req as any).user.id;

    try {
      const result = await pool.query(
        `INSERT INTO plc_rate_contract_refs (
           plc_line_id, project_id, vendor_id, vendor_name,
           rate_per_unit, currency, valid_from, valid_to, contract_ref, contract_notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [plcLineId, projectId, vendorId || null, vendorName || null,
         ratePerUnit, currency || 'INR', validFrom, validTo || null, contractRef || null, contractNotes || null, userId],
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/plc-rate-contracts/:id/lock ──────────────────────────────────
  app.patch('/api/plc-rate-contracts/:id/lock', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    if (!requireManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return badReq(res, 'Invalid id');
    const userId = (req as any).user.id;
    const { lock } = req.body;

    try {
      const result = await pool.query(
        `UPDATE plc_rate_contract_refs SET
           is_locked = $2, locked_by = $3, locked_at = $4, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, !!lock, lock ? userId : null, lock ? new Date() : null],
      );
      if (!result.rows[0]) return notFound(res, 'Rate contract ref');
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[PLC] Phase 4 SAP / governance routes registered');
}
