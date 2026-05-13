/**
 * PLC Line Service — Phase 1
 * Single source of truth for all mutations on procurement_list_lines.
 * All writes go through this service. No route handler may write directly.
 *
 * Governance: see docs/procurement-list-control-baseline-v1.md §38 and §39.
 */

import { pool } from './db';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreatePlcLineParams {
  projectId: number;
  projectCode: string;
  planningRecordId: number;
  planningNumber: string;
  sourceBuyListHeaderId: number;
  sourceBuyListLineId: number;
  masterItemId: number;
  tagNo: string | null;
  serviceDescription: string | null;
  equipmentReference: string | null;
  subgroupCode: string | null;
  subgroupLabel: string | null;
  qtyRequired: number;
  createdBy: number;
}

export interface PlcLineRow {
  id: number;
  plcNumber: string;
  status: string;
  qtyRequired: string;
  qtyOrdered: string;
  qtyReceived: string;
  qtyBalance: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtPlcNumber(projectCode: string, seq: number): string {
  return `${projectCode}-PLC-${String(seq).padStart(4, '0')}`;
}

async function getNextPlcSeq(projectId: number, client: any): Promise<number> {
  // Uses doc_sequences table to get the next PLC sequence for the project.
  // Atomic via INSERT ... ON CONFLICT ... DO UPDATE.
  const r = await client.query<{ next_val: number }>(
    `INSERT INTO doc_sequences (doc_type, project_id, last_value, updated_at)
     VALUES ('PLC', $1, 1, NOW())
     ON CONFLICT (doc_type, project_id)
     DO UPDATE SET last_value = doc_sequences.last_value + 1, updated_at = NOW()
     RETURNING last_value AS next_val`,
    [projectId],
  );
  return r.rows[0].next_val;
}

// ─── Core service functions ─────────────────────────────────────────────────

/**
 * Create a PLC line inside an existing transaction.
 * Called by pppc-routes raise-pr and bulk-raise-pr immediately after PLN insert.
 * MUST be called within a BEGIN/COMMIT block.
 */
export async function createPlcLineInTx(
  client: any,
  params: CreatePlcLineParams,
): Promise<PlcLineRow> {
  // Advisory lock: prevent concurrent creation for same buy_list_line
  await client.query(
    `SELECT pg_advisory_xact_lock($1)`,
    [params.sourceBuyListLineId * 1000000 + 99001], // deterministic lock key
  );

  // Idempotency check: return existing non-cancelled PLC line if present
  const existing = await client.query<PlcLineRow>(
    `SELECT id, plc_number AS "plcNumber", status,
            qty_required AS "qtyRequired", qty_ordered AS "qtyOrdered",
            qty_received AS "qtyReceived", qty_balance AS "qtyBalance"
     FROM procurement_list_lines
     WHERE source_buy_list_line_id = $1
       AND status NOT IN ('cancelled', 'superseded')
     LIMIT 1`,
    [params.sourceBuyListLineId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const seq = await getNextPlcSeq(params.projectId, client);
  const plcNumber = fmtPlcNumber(params.projectCode, seq);
  const qty = params.qtyRequired;

  const ins = await client.query<PlcLineRow>(
    `INSERT INTO procurement_list_lines
       (plc_number, project_id, planning_record_id, planning_number,
        source_buy_list_header_id, source_buy_list_line_id,
        master_item_id, tag_no, service_description, equipment_reference,
        subgroup_code, subgroup_label,
        qty_required, qty_ordered, qty_received, qty_balance, qty_over_procured,
        status, avl_status, revision_action_required, priority,
        created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
             $13, 0, 0, $13, 0,
             'pr_raised','not_checked','none','standard',
             $14, NOW(), NOW())
     RETURNING id, plc_number AS "plcNumber", status,
               qty_required AS "qtyRequired", qty_ordered AS "qtyOrdered",
               qty_received AS "qtyReceived", qty_balance AS "qtyBalance"`,
    [
      plcNumber, params.projectId, params.planningRecordId, params.planningNumber,
      params.sourceBuyListHeaderId, params.sourceBuyListLineId,
      params.masterItemId, params.tagNo, params.serviceDescription, params.equipmentReference,
      params.subgroupCode, params.subgroupLabel,
      qty,
      params.createdBy,
    ],
  );
  const row = ins.rows[0];

  // Audit
  await logPlcAudit(client, {
    projectId: params.projectId,
    entityType: 'plc_line',
    entityId: row.id,
    eventType: 'plc_line_created',
    oldStatus: null,
    newStatus: 'pr_raised',
    changedBy: params.createdBy,
    notes: `Created from BUY List line ${params.sourceBuyListLineId} via raise-pr`,
  });

  return row;
}

/**
 * Recompute qty_ordered, qty_received, qty_balance, qty_over_procured for a PLC line.
 * Called after any POG approval, GRN acceptance, or amendment that changes qty.
 */
export async function recomputePlcQty(plcLineId: number, client?: any): Promise<void> {
  const c = client ?? pool;
  await c.query(
    `UPDATE procurement_list_lines SET
       qty_ordered = COALESCE((
         SELECT SUM(gl.line_qty)
         FROM epc_po_group_lines gl
         JOIN epc_po_groups g ON g.id = gl.po_group_id
         WHERE gl.plc_line_id = $1
           AND gl.is_active = true
           AND g.status NOT IN ('cancelled','rejected')
       ), 0),
       qty_received = COALESCE((
         SELECT SUM(gr.accepted_qty)
         FROM plc_grn_records gr
         WHERE gr.plc_line_id = $1
           AND gr.status = 'accepted'
       ), 0),
       updated_at = NOW()
     WHERE id = $1`,
    [plcLineId],
  );

  // Recalculate balance + over-procured as derived fields
  await c.query(
    `UPDATE procurement_list_lines SET
       qty_balance = GREATEST(qty_required - qty_received, 0),
       qty_over_procured = GREATEST(qty_ordered - qty_required, 0),
       updated_at = NOW()
     WHERE id = $1`,
    [plcLineId],
  );
}

/**
 * Update PLC line status with audit.
 */
export async function updatePlcLineStatus(
  client: any,
  plcLineId: number,
  newStatus: string,
  userId: number,
  notes?: string,
): Promise<void> {
  const curr = await client.query<{ status: string; project_id: number }>(
    `SELECT status, project_id FROM procurement_list_lines WHERE id = $1`,
    [plcLineId],
  );
  if (!curr.rows[0]) throw new Error(`PLC line ${plcLineId} not found`);
  const oldStatus = curr.rows[0].status;

  await client.query(
    `UPDATE procurement_list_lines SET status = $1, updated_at = NOW() WHERE id = $2`,
    [newStatus, plcLineId],
  );

  await logPlcAudit(client, {
    projectId: curr.rows[0].project_id,
    entityType: 'plc_line',
    entityId: plcLineId,
    eventType: `status_changed_to_${newStatus}`,
    oldStatus,
    newStatus,
    changedBy: userId,
    notes: notes ?? null,
  });
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export interface PlcAuditParams {
  projectId: number;
  entityType: string;
  entityId: number;
  eventType: string;
  oldStatus: string | null;
  newStatus: string | null;
  changedBy: number;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only audit log. Never UPDATE or DELETE from procurement_list_audit_log.
 */
export async function logPlcAudit(client: any, p: PlcAuditParams): Promise<void> {
  await client.query(
    `INSERT INTO procurement_list_audit_log
       (project_id, entity_type, entity_id, event_type, old_status, new_status, changed_by, notes, metadata, changed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
    [
      p.projectId, p.entityType, p.entityId,
      p.eventType, p.oldStatus, p.newStatus,
      p.changedBy, p.notes ?? null,
      p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
}

// ─── Bulk status recompute (called after POG approve/reject/cancel) ─────────

/**
 * After a POG changes status, recompute all PLC lines in that group.
 */
export async function recomputePoGroupPlcLines(
  pogId: number,
  client?: any,
): Promise<void> {
  const c = client ?? pool;
  const lines = await c.query<{ plc_line_id: number }>(
    `SELECT plc_line_id FROM epc_po_group_lines WHERE po_group_id = $1 AND is_active = true`,
    [pogId],
  );
  for (const row of lines.rows) {
    await recomputePlcQty(row.plc_line_id, c);
  }
}

/**
 * Derive and persist PLC line status from qty fields.
 * Rule:
 *   qty_received >= qty_required  → fully_received
 *   qty_received > 0             → partial_received
 *   po_issued (any active PO)    → po_issued
 *   in active group (non-cancelled) → in_po_group
 *   else                         → pr_raised
 */
export async function derivePlcLineStatus(
  client: any,
  plcLineId: number,
  userId: number,
): Promise<void> {
  const r = await client.query<{
    qty_required: string; qty_received: string; qty_ordered: string;
    active_po_group_id: number | null; active_epc_po_id: number | null;
    status: string; project_id: number;
  }>(
    `SELECT p.qty_required, p.qty_received, p.qty_ordered,
            p.active_po_group_id, p.active_epc_po_id, p.status, p.project_id
     FROM procurement_list_lines p WHERE p.id = $1`,
    [plcLineId],
  );
  if (!r.rows[0]) return;
  const l = r.rows[0];
  const qtyReqd = parseFloat(l.qty_required) || 0;
  const qtyRcvd = parseFloat(l.qty_received) || 0;
  const qtyOrd = parseFloat(l.qty_ordered) || 0;

  let newStatus = l.status;
  if (qtyRcvd >= qtyReqd && qtyReqd > 0) {
    newStatus = 'fully_received';
  } else if (qtyRcvd > 0) {
    newStatus = 'partial_received';
  } else if (l.active_epc_po_id) {
    newStatus = 'po_issued';
  } else if (l.active_po_group_id) {
    newStatus = 'in_po_group';
  } else if (qtyOrd > 0) {
    newStatus = 'in_po_group';
  } else {
    newStatus = 'pr_raised';
  }

  if (newStatus !== l.status) {
    await updatePlcLineStatus(client, plcLineId, newStatus, userId, 'auto-derived from qty fields');
  }
}
