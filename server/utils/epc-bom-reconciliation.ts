import { pool } from '../db';
import { createEpcTask, resolveAssignee, resolveManagerId, resolveProjectCode } from '../epc-task-helpers';

interface ReconciliationResult {
  removedLines: { componentItemId: number; componentItemCode: string; oldQty: string; hasDownstream: boolean; autoAction: string }[];
  quantityChanges: { componentItemId: number; componentItemCode: string; oldQty: string; newQty: string; hasDownstream: boolean; flagged: boolean }[];
  reviewTaskIds: number[];
  autoActions: { type: string; recordId: number; action: string }[];
}

export async function reconcileBomSupersession(
  oldBomHeaderId: number,
  newBomHeaderId: number,
  userId: number,
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    removedLines: [],
    quantityChanges: [],
    reviewTaskIds: [],
    autoActions: [],
  };

  const bomInfo = await pool.query(
    `SELECT bh.project_id, bh.project_item_id, bh.bom_number, bh.revision_code, bh.bom_type
     FROM epc_bom_headers bh WHERE bh.id = $1`,
    [newBomHeaderId]
  );
  if (bomInfo.rows.length === 0) return result;
  const bom = bomInfo.rows[0];
  const projectId = bom.project_id;

  const oldLines = await pool.query(
    `SELECT component_item_id, component_item_code, component_description, quantity_per_unit
     FROM epc_bom_lines WHERE bom_header_id = $1`,
    [oldBomHeaderId]
  );

  const newLines = await pool.query(
    `SELECT component_item_id, component_item_code, component_description, quantity_per_unit
     FROM epc_bom_lines WHERE bom_header_id = $1`,
    [newBomHeaderId]
  );

  const newLineMap = new Map<number, { qty: string; code: string }>();
  for (const nl of newLines.rows) {
    newLineMap.set(nl.component_item_id, { qty: nl.quantity_per_unit, code: nl.component_item_code });
  }

  const removedComponents: { itemId: number; code: string; oldQty: string }[] = [];
  const changedComponents: { itemId: number; code: string; oldQty: string; newQty: string }[] = [];

  for (const ol of oldLines.rows) {
    const newEntry = newLineMap.get(ol.component_item_id);
    if (!newEntry) {
      removedComponents.push({ itemId: ol.component_item_id, code: ol.component_item_code, oldQty: ol.quantity_per_unit });
    } else if (newEntry.qty !== ol.quantity_per_unit) {
      changedComponents.push({ itemId: ol.component_item_id, code: ol.component_item_code, oldQty: ol.quantity_per_unit, newQty: newEntry.qty });
    }
  }

  if (removedComponents.length === 0 && changedComponents.length === 0) {
    console.log(`[BOM-Reconcile] BOM ${bom.bom_number} Rev ${bom.revision_code}: no line changes detected vs old BOM ${oldBomHeaderId}`);
    return result;
  }

  const projectCode = await resolveProjectCode(projectId);
  const pmId = await resolveManagerId(projectId);
  const engLead = await resolveAssignee(projectId, 'Engineering', userId);

  for (const removed of removedComponents) {
    const downstream = await checkDownstream(removed.itemId, projectId);
    const entry = { componentItemId: removed.itemId, componentItemCode: removed.code, oldQty: removed.oldQty, hasDownstream: downstream.hasAny, autoAction: '' };

    if (!downstream.hasAny) {
      const piResult = await pool.query(
        `SELECT id FROM project_items WHERE project_id = $1 AND item_id = $2 AND status != 'cancelled'`,
        [projectId, removed.itemId]
      );
      for (const pi of piResult.rows) {
        await pool.query(
          `UPDATE item_planning_records SET status = 'cancelled', cancel_reason = $1,
           cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
           WHERE project_item_id = $3 AND source = 'bom_explosion' AND source_bom_header_id = $4
             AND status IN ('draft', 'released')`,
          [`Component removed from BOM ${bom.bom_number} Rev ${bom.revision_code}`, userId, pi.id, oldBomHeaderId]
        );
        result.autoActions.push({ type: 'planning_cancelled', recordId: pi.id, action: `Component ${removed.code} planning cancelled` });
      }
      entry.autoAction = 'planning_cancelled';
    } else {
      const task = await createEpcTask({
        projectId, entityType: 'bom_header', recordId: newBomHeaderId, actionCode: 'removed_component_review',
        title: `Review removed component ${removed.code} from BOM ${bom.bom_number}`,
        description: `Component ${removed.code} was removed in BOM ${bom.bom_number} Rev ${bom.revision_code} but has active downstream records: ${downstream.summary}. Manual review required.`,
        assignedTo: engLead || pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
      });
      if (task?.id) result.reviewTaskIds.push(task.id);
      entry.autoAction = 'review_task_created';
    }
    result.removedLines.push(entry);
  }

  for (const changed of changedComponents) {
    const downstream = await checkDownstream(changed.itemId, projectId);
    const entry = {
      componentItemId: changed.itemId, componentItemCode: changed.code,
      oldQty: changed.oldQty, newQty: changed.newQty,
      hasDownstream: downstream.hasAny, flagged: false,
    };

    const piResult = await pool.query(
      `SELECT id FROM project_items WHERE project_id = $1 AND item_id = $2 AND status != 'cancelled'`,
      [projectId, changed.itemId]
    );

    for (const pi of piResult.rows) {
      await pool.query(
        `UPDATE project_items SET quantity = $1, updated_at = NOW()
         WHERE id = $2`,
        [changed.newQty, pi.id]
      );
      result.autoActions.push({ type: 'quantity_updated', recordId: pi.id, action: `Qty ${changed.oldQty} → ${changed.newQty}` });
    }

    if (downstream.hasAny) {
      entry.flagged = true;
      const task = await createEpcTask({
        projectId, entityType: 'bom_header', recordId: newBomHeaderId, actionCode: 'qty_change_review',
        title: `Review quantity change for ${changed.code} (${changed.oldQty} → ${changed.newQty})`,
        description: `BOM ${bom.bom_number} Rev ${bom.revision_code}: quantity for ${changed.code} changed from ${changed.oldQty} to ${changed.newQty}. Active downstream: ${downstream.summary}. PO/WO quantities may need amendment.`,
        assignedTo: engLead || pmId || userId, createdBy: userId, priority: 'Medium', dueDays: 5,
      });
      if (task?.id) result.reviewTaskIds.push(task.id);
    }
    result.quantityChanges.push(entry);
  }

  await pool.query(
    `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
     VALUES ($1, 'bom_supersession_reconciliation', $2, $3, NOW(), true)`,
    [projectId, JSON.stringify({
      oldBomHeaderId, newBomHeaderId,
      bomNumber: bom.bom_number, revisionCode: bom.revision_code,
      removedLines: result.removedLines.length,
      quantityChanges: result.quantityChanges.length,
      reviewTasks: result.reviewTaskIds.length,
      autoActions: result.autoActions.length,
    }), String(userId)]
  );

  console.log(`[BOM-Reconcile] BOM ${bom.bom_number} Rev ${bom.revision_code}: ` +
    `${result.removedLines.length} removed, ${result.quantityChanges.length} qty changes, ` +
    `${result.reviewTaskIds.length} review tasks, ${result.autoActions.length} auto actions`);

  return result;
}

interface DownstreamCheck {
  hasAny: boolean;
  hasPO: boolean;
  hasWO: boolean;
  hasInspection: boolean;
  hasDispatch: boolean;
  summary: string;
}

async function checkDownstream(masterItemId: number, projectId: number): Promise<DownstreamCheck> {
  const piResult = await pool.query(
    `SELECT id FROM project_items WHERE project_id = $1 AND item_id = $2 AND status != 'cancelled'`,
    [projectId, masterItemId]
  );
  if (piResult.rows.length === 0) return { hasAny: false, hasPO: false, hasWO: false, hasInspection: false, hasDispatch: false, summary: 'none' };

  const piIds = piResult.rows.map(r => r.id);
  const placeholders = piIds.map((_, i) => `$${i + 1}`).join(',');

  const [poR, woR, insR, dspR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int as cnt FROM epc_purchase_orders WHERE project_item_id IN (${placeholders}) AND status NOT IN ('cancelled', 'draft')`, piIds),
    pool.query(`SELECT COUNT(*)::int as cnt FROM epc_work_orders WHERE project_item_id IN (${placeholders}) AND status NOT IN ('cancelled', 'draft')`, piIds),
    pool.query(`SELECT COUNT(*)::int as cnt FROM inspection_orders WHERE project_id = $1 AND status NOT IN ('cancelled')`, [projectId]),
    pool.query(`SELECT COUNT(*)::int as cnt FROM epc_dispatch_records WHERE project_item_id IN (${placeholders}) AND status NOT IN ('cancelled', 'draft')`, piIds),
  ]);

  const hasPO = (poR.rows[0]?.cnt || 0) > 0;
  const hasWO = (woR.rows[0]?.cnt || 0) > 0;
  const hasInspection = (insR.rows[0]?.cnt || 0) > 0;
  const hasDispatch = (dspR.rows[0]?.cnt || 0) > 0;
  const hasAny = hasPO || hasWO || hasInspection || hasDispatch;

  const parts: string[] = [];
  if (hasPO) parts.push(`${poR.rows[0].cnt} POs`);
  if (hasWO) parts.push(`${woR.rows[0].cnt} WOs`);
  if (hasInspection) parts.push(`${insR.rows[0].cnt} inspections`);
  if (hasDispatch) parts.push(`${dspR.rows[0].cnt} dispatches`);

  return { hasAny, hasPO, hasWO, hasInspection, hasDispatch, summary: parts.join(', ') || 'none' };
}
