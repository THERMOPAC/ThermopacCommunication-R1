import { pool } from '../db';
import { createEpcTask, resolveManagerId, resolveProjectCode } from '../epc-task-helpers';

const ON_HOLD_STATUS = 'on_hold_pending_cancellation_review';

interface CascadeResult {
  tasksCancelled: number;
  tasksOnHold: number;
  bomsCancelled: number;
  bomsOnHold: number;
  dwgCancelled: number;
  dwgOnHold: number;
  planningCancelled: number;
  planningOnHold: number;
  poCancelled: number;
  poOnHold: number;
  woCancelled: number;
  woOnHold: number;
  inspectionsCancelled: number;
  inspectionsOnHold: number;
  dispatchCancelled: number;
  dispatchOnHold: number;
  qualityPlansCancelled: number;
  qualityPlansOnHold: number;
  commissioningCancelled: number;
  commissioningOnHold: number;
  billingCancelled: number;
  billingOnHold: number;
  invoicesCancelled: number;
  invoicesOnHold: number;
  totalSnapshots: number;
  reviewTaskIds: number[];
  cancellationType: string;
  cancellationReason: string;
}

interface RestorationResult {
  alreadyRestored: boolean;
  recordsRestored: number;
  recordsLeftOnHold: number;
  reviewTaskId: number | null;
  restoredModules: Record<string, number>;
  onHoldModules: Record<string, number>;
}

interface SnapshotRecord {
  module: string;
  table_name: string;
  record_id: number;
  status_before: string;
  status_after: string;
  key_data: Record<string, any>;
  restoration_eligible: boolean;
}

async function createDeduplicatedReviewTask(params: {
  projectId: number;
  entityType: string;
  recordId: number;
  actionCode: string;
  title: string;
  description: string;
  assignedTo: number;
  createdBy: number;
  priority: string;
  dueDays: number;
}): Promise<number | null> {
  const existing = await pool.query(`
    SELECT t.id FROM tasks t
    JOIN project_tasks pt ON pt.task_id = t.id
    WHERE pt.project_id = $1
      AND t.status NOT IN ('canceled', 'completed', 'closed')
      AND t.title LIKE $2
  `, [params.projectId, `%canceled project%`]);

  const matchKey = params.actionCode;
  for (const row of existing.rows) {
    const tagCheck = await pool.query(
      `SELECT 1 FROM task_tags WHERE task_id = $1 AND tag = $2 LIMIT 1`,
      [row.id, `cascade:${matchKey}`]
    );
    if (tagCheck.rows.length > 0) {
      console.log(`[EPC-Cascade] Dedup: skipping review task for actionCode=${matchKey}, existing task #${row.id}`);
      return row.id;
    }
  }

  const task = await createEpcTask(params);
  if (task?.id) {
    try {
      await pool.query(
        `INSERT INTO task_tags (task_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [task.id, `cascade:${matchKey}`]
      );
    } catch (_e) {
    }
  }
  return task?.id || null;
}

async function insertSnapshots(
  projectId: number,
  cancellationType: string,
  snapshots: SnapshotRecord[]
): Promise<number> {
  if (snapshots.length === 0) return 0;
  const values: string[] = [];
  const params: any[] = [projectId, cancellationType];
  let idx = 3;
  for (const s of snapshots) {
    values.push(`($1, $${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}::jsonb, $${idx+6}, $2, NOW())`);
    params.push(s.module, s.table_name, s.record_id, s.status_before, s.status_after, JSON.stringify(s.key_data), s.restoration_eligible);
    idx += 7;
  }
  await pool.query(`
    INSERT INTO project_cancellation_snapshots
      (project_id, module, table_name, record_id, status_before, status_after, key_data, restoration_eligible, cancellation_type, cancelled_at)
    VALUES ${values.join(', ')}
  `, params);
  return snapshots.length;
}

export async function executeProjectCancellationCascade(
  projectId: number,
  userId: number,
  cancellationType: string,
  cancellationReason: string
): Promise<CascadeResult> {
  const result: CascadeResult = {
    tasksCancelled: 0, tasksOnHold: 0,
    bomsCancelled: 0, bomsOnHold: 0,
    dwgCancelled: 0, dwgOnHold: 0,
    planningCancelled: 0, planningOnHold: 0,
    poCancelled: 0, poOnHold: 0,
    woCancelled: 0, woOnHold: 0,
    inspectionsCancelled: 0, inspectionsOnHold: 0,
    dispatchCancelled: 0, dispatchOnHold: 0,
    qualityPlansCancelled: 0, qualityPlansOnHold: 0,
    commissioningCancelled: 0, commissioningOnHold: 0,
    billingCancelled: 0, billingOnHold: 0,
    invoicesCancelled: 0, invoicesOnHold: 0,
    totalSnapshots: 0,
    reviewTaskIds: [],
    cancellationType,
    cancellationReason,
  };

  const projectCode = await resolveProjectCode(projectId);
  const pmId = await resolveManagerId(projectId);
  const allSnapshots: SnapshotRecord[] = [];

  const lastCancelEvt = await pool.query(`
    SELECT emitted_at FROM project_workflow_events
    WHERE project_id = $1 AND event_name = 'project_cancellation_cascade'
    ORDER BY emitted_at DESC LIMIT 1
  `, [projectId]);
  const lastRestoreEvt = await pool.query(`
    SELECT emitted_at FROM project_workflow_events
    WHERE project_id = $1 AND event_name = 'project_restoration_cascade'
    ORDER BY emitted_at DESC LIMIT 1
  `, [projectId]);

  const lastCancelTs = lastCancelEvt.rows.length > 0
    ? new Date(lastCancelEvt.rows[0].emitted_at).getTime() : 0;
  const lastRestoreTs = lastRestoreEvt.rows.length > 0
    ? new Date(lastRestoreEvt.rows[0].emitted_at).getTime() : 0;

  if (lastCancelTs > 0 && lastCancelTs > lastRestoreTs) {
    const staleSnaps = await pool.query(
      `SELECT COUNT(*) FROM project_cancellation_snapshots WHERE project_id = $1 AND cancelled_at >= $2::timestamptz AND restored = false`,
      [projectId, new Date(lastCancelTs).toISOString()]
    );
    const staleCount = parseInt(staleSnaps.rows[0].count, 10);
    if (staleCount > 0) {
      console.log(`[EPC-Cascade] Project ${projectId}: clearing ${staleCount} stale snapshots from last cancel (no reopen in between)`);
      await pool.query(
        `DELETE FROM project_cancellation_snapshots WHERE project_id = $1 AND cancelled_at >= $2::timestamptz AND restored = false`,
        [projectId, new Date(lastCancelTs).toISOString()]
      );
    }
  }

  // ─── 1. Tasks ────────────────────────────────────────
  // Safe: pending → canceled (restoration eligible)
  const t1a = await pool.query(`
    SELECT id, status FROM tasks
    WHERE id IN (SELECT task_id FROM project_tasks WHERE project_id = $1)
      AND status = 'pending'
  `, [projectId]);
  for (const r of t1a.rows) {
    allSnapshots.push({ module: 'Tasks', table_name: 'tasks', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (t1a.rows.length > 0) {
    await pool.query(`UPDATE tasks SET status = 'canceled' WHERE id = ANY($1)`, [t1a.rows.map((r: any) => r.id)]);
  }
  result.tasksCancelled = t1a.rows.length;

  // Active: in_progress/on_hold → on_hold_pending_cancellation_review (not restoration eligible)
  const t1b = await pool.query(`
    SELECT id, status FROM tasks
    WHERE id IN (SELECT task_id FROM project_tasks WHERE project_id = $1)
      AND status IN ('in_progress', 'on_hold')
  `, [projectId]);
  for (const r of t1b.rows) {
    allSnapshots.push({ module: 'Tasks', table_name: 'tasks', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (t1b.rows.length > 0) {
    await pool.query(`UPDATE tasks SET status = $2 WHERE id = ANY($1)`, [t1b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.tasksOnHold = t1b.rows.length;

  // ─── 2. BOMs ─────────────────────────────────────────
  // Safe: draft/under_review → canceled
  const b2a = await pool.query(`
    SELECT id, status FROM epc_bom_headers
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('draft', 'under_review')
  `, [projectId]);
  for (const r of b2a.rows) {
    allSnapshots.push({ module: 'BOM', table_name: 'epc_bom_headers', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (b2a.rows.length > 0) {
    await pool.query(`UPDATE epc_bom_headers SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [b2a.rows.map((r: any) => r.id)]);
  }
  result.bomsCancelled = b2a.rows.length;

  // Active: approved/released → on_hold
  const b2b = await pool.query(`
    SELECT id, status FROM epc_bom_headers
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('approved', 'released')
  `, [projectId]);
  for (const r of b2b.rows) {
    allSnapshots.push({ module: 'BOM', table_name: 'epc_bom_headers', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (b2b.rows.length > 0) {
    await pool.query(`UPDATE epc_bom_headers SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [b2b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.bomsOnHold = b2b.rows.length;

  // ─── 3. Drawing Controls ─────────────────────────────
  // Safe: draft/pending_upload/file_not_available → canceled
  const d3a = await pool.query(`
    SELECT id, status, dwg_control_number FROM epc_drawing_controls
    WHERE project_id = $1
      AND status IN ('draft', 'pending_upload', 'file_not_available')
  `, [projectId]);
  for (const r of d3a.rows) {
    allSnapshots.push({ module: 'Drawing Controls', table_name: 'epc_drawing_controls', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: { dwg_control_number: r.dwg_control_number }, restoration_eligible: true });
  }
  if (d3a.rows.length > 0) {
    await pool.query(`UPDATE epc_drawing_controls SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [d3a.rows.map((r: any) => r.id)]);
  }
  result.dwgCancelled = d3a.rows.length;

  // Active: under_review/approved/released → on_hold (released must NOT auto-cancel)
  const d3b = await pool.query(`
    SELECT id, status, dwg_control_number FROM epc_drawing_controls
    WHERE project_id = $1
      AND status IN ('under_review', 'approved', 'released')
  `, [projectId]);
  for (const r of d3b.rows) {
    allSnapshots.push({ module: 'Drawing Controls', table_name: 'epc_drawing_controls', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: { dwg_control_number: r.dwg_control_number }, restoration_eligible: false });
  }
  if (d3b.rows.length > 0) {
    await pool.query(`UPDATE epc_drawing_controls SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [d3b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.dwgOnHold = d3b.rows.length;

  // ─── 4. Planning Records ─────────────────────────────
  // Safe: draft → canceled
  const p4a = await pool.query(`
    SELECT id, status FROM item_planning_records
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
  `, [projectId]);
  for (const r of p4a.rows) {
    allSnapshots.push({ module: 'Planning', table_name: 'item_planning_records', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (p4a.rows.length > 0) {
    await pool.query(`
      UPDATE item_planning_records SET status = 'canceled', cancel_reason = 'Project canceled',
        cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
      WHERE id = ANY($1)
    `, [p4a.rows.map((r: any) => r.id), userId]);
  }
  result.planningCancelled = p4a.rows.length;

  // Active: released/approved → on_hold
  const p4b = await pool.query(`
    SELECT id, status FROM item_planning_records
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('released', 'approved')
  `, [projectId]);
  for (const r of p4b.rows) {
    allSnapshots.push({ module: 'Planning', table_name: 'item_planning_records', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (p4b.rows.length > 0) {
    await pool.query(`
      UPDATE item_planning_records SET status = $2, cancel_reason = 'Project canceled - on hold for review', updated_at = NOW()
      WHERE id = ANY($1)
    `, [p4b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.planningOnHold = p4b.rows.length;

  // ─── 5. Purchase Orders ──────────────────────────────
  // Safe: draft → canceled
  const po5a = await pool.query(`
    SELECT id, status, po_number FROM epc_purchase_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
  `, [projectId]);
  for (const r of po5a.rows) {
    allSnapshots.push({ module: 'Purchase Orders', table_name: 'epc_purchase_orders', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: { po_number: r.po_number }, restoration_eligible: true });
  }
  if (po5a.rows.length > 0) {
    await pool.query(`UPDATE epc_purchase_orders SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [po5a.rows.map((r: any) => r.id)]);
  }
  result.poCancelled = po5a.rows.length;

  // Active/financial: approved/issued → on_hold (never auto-cancel)
  const po5b = await pool.query(`
    SELECT id, status, po_number FROM epc_purchase_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('approved', 'issued')
  `, [projectId]);
  for (const r of po5b.rows) {
    allSnapshots.push({ module: 'Purchase Orders', table_name: 'epc_purchase_orders', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: { po_number: r.po_number }, restoration_eligible: false });
  }
  if (po5b.rows.length > 0) {
    await pool.query(`UPDATE epc_purchase_orders SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [po5b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.poOnHold = po5b.rows.length;

  // ─── 6. Work Orders ──────────────────────────────────
  // Safe: draft → canceled
  const wo6a = await pool.query(`
    SELECT id, status, wo_number FROM epc_work_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
  `, [projectId]);
  for (const r of wo6a.rows) {
    allSnapshots.push({ module: 'Work Orders', table_name: 'epc_work_orders', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: { wo_number: r.wo_number }, restoration_eligible: true });
  }
  if (wo6a.rows.length > 0) {
    await pool.query(`UPDATE epc_work_orders SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [wo6a.rows.map((r: any) => r.id)]);
  }
  result.woCancelled = wo6a.rows.length;

  // Active: approved/released → on_hold
  const wo6b = await pool.query(`
    SELECT id, status, wo_number FROM epc_work_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('approved', 'released')
  `, [projectId]);
  for (const r of wo6b.rows) {
    allSnapshots.push({ module: 'Work Orders', table_name: 'epc_work_orders', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: { wo_number: r.wo_number }, restoration_eligible: false });
  }
  if (wo6b.rows.length > 0) {
    await pool.query(`UPDATE epc_work_orders SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [wo6b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.woOnHold = wo6b.rows.length;

  // Create review task for on-hold POs/WOs
  if (result.poOnHold > 0 || result.woOnHold > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_powo_review',
      title: `Review ${result.poOnHold} POs and ${result.woOnHold} WOs on hold for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled (${cancellationType}). ${result.poOnHold} POs and ${result.woOnHold} WOs have been placed on hold pending cancellation review — they may have SAP linkage or financial commitments.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // ─── 7. Inspections ──────────────────────────────────
  // Safe: pending → canceled
  const i7a = await pool.query(`
    SELECT id, status FROM inspection_orders
    WHERE project_id = $1 AND status = 'pending'
  `, [projectId]);
  for (const r of i7a.rows) {
    allSnapshots.push({ module: 'Inspections', table_name: 'inspection_orders', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (i7a.rows.length > 0) {
    await pool.query(`UPDATE inspection_orders SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [i7a.rows.map((r: any) => r.id)]);
  }
  result.inspectionsCancelled = i7a.rows.length;

  // Active: in_progress → on_hold
  const i7b = await pool.query(`
    SELECT id, status FROM inspection_orders
    WHERE project_id = $1 AND status = 'in_progress'
  `, [projectId]);
  for (const r of i7b.rows) {
    allSnapshots.push({ module: 'Inspections', table_name: 'inspection_orders', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (i7b.rows.length > 0) {
    await pool.query(`UPDATE inspection_orders SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [i7b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.inspectionsOnHold = i7b.rows.length;

  if (result.inspectionsOnHold > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_inspection_review',
      title: `Review ${result.inspectionsOnHold} inspections on hold for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. ${result.inspectionsOnHold} inspections are on hold pending cancellation review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // ─── 8. Dispatch ─────────────────────────────────────
  // Safe: draft → canceled
  const dp8a = await pool.query(`
    SELECT id, status FROM epc_dispatch_readiness
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
  `, [projectId]);
  for (const r of dp8a.rows) {
    allSnapshots.push({ module: 'Dispatch Readiness', table_name: 'epc_dispatch_readiness', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (dp8a.rows.length > 0) {
    await pool.query(`UPDATE epc_dispatch_readiness SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [dp8a.rows.map((r: any) => r.id)]);
  }

  const dr8a = await pool.query(`
    SELECT id, status FROM epc_dispatch_records
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
  `, [projectId]);
  for (const r of dr8a.rows) {
    allSnapshots.push({ module: 'Dispatch Records', table_name: 'epc_dispatch_records', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (dr8a.rows.length > 0) {
    await pool.query(`UPDATE epc_dispatch_records SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [dr8a.rows.map((r: any) => r.id)]);
  }
  result.dispatchCancelled = dp8a.rows.length + dr8a.rows.length;

  // Active dispatch records: confirmed/shipped/delivered → on_hold
  const dr8b = await pool.query(`
    SELECT id, status FROM epc_dispatch_records
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('confirmed', 'shipped', 'delivered')
  `, [projectId]);
  for (const r of dr8b.rows) {
    allSnapshots.push({ module: 'Dispatch Records', table_name: 'epc_dispatch_records', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (dr8b.rows.length > 0) {
    await pool.query(`UPDATE epc_dispatch_records SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [dr8b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.dispatchOnHold = dr8b.rows.length;

  if (result.dispatchOnHold > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_dispatch_review',
      title: `Review ${result.dispatchOnHold} dispatch records on hold for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. Active dispatch records have been placed on hold — they may involve physical shipments.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // ─── 9. Quality Plans ────────────────────────────────
  const qp9a = await pool.query(`
    SELECT id, status FROM quality_planning_records
    WHERE planning_record_id IN (
      SELECT ipr.id FROM item_planning_records ipr
      JOIN project_items pi ON pi.id = ipr.project_item_id
      WHERE pi.project_id = $1
    ) AND status IN ('draft', 'preparation')
  `, [projectId]);
  for (const r of qp9a.rows) {
    allSnapshots.push({ module: 'Quality Plans', table_name: 'quality_planning_records', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (qp9a.rows.length > 0) {
    await pool.query(`UPDATE quality_planning_records SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [qp9a.rows.map((r: any) => r.id)]);
  }
  result.qualityPlansCancelled = qp9a.rows.length;

  const qp9b = await pool.query(`
    SELECT id, status FROM quality_planning_records
    WHERE planning_record_id IN (
      SELECT ipr.id FROM item_planning_records ipr
      JOIN project_items pi ON pi.id = ipr.project_item_id
      WHERE pi.project_id = $1
    ) AND status IN ('ready', 'in_progress')
  `, [projectId]);
  for (const r of qp9b.rows) {
    allSnapshots.push({ module: 'Quality Plans', table_name: 'quality_planning_records', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (qp9b.rows.length > 0) {
    await pool.query(`UPDATE quality_planning_records SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [qp9b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.qualityPlansOnHold = qp9b.rows.length;

  if (result.qualityPlansOnHold > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_quality_review',
      title: `Review ${result.qualityPlansOnHold} quality plans on hold for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. ${result.qualityPlansOnHold} quality plans are on hold and need manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // ─── 10. Commissioning ───────────────────────────────
  const cm10a = await pool.query(`
    SELECT id, status FROM epc_commissioning_readiness
    WHERE project_id = $1 AND status = 'draft'
  `, [projectId]);
  for (const r of cm10a.rows) {
    allSnapshots.push({ module: 'Commissioning', table_name: 'epc_commissioning_readiness', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (cm10a.rows.length > 0) {
    await pool.query(`UPDATE epc_commissioning_readiness SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [cm10a.rows.map((r: any) => r.id)]);
  }
  result.commissioningCancelled = cm10a.rows.length;

  const cm10b = await pool.query(`
    SELECT id, status FROM epc_commissioning_readiness
    WHERE project_id = $1 AND status IN ('preparation', 'ready', 'commissioned')
  `, [projectId]);
  for (const r of cm10b.rows) {
    allSnapshots.push({ module: 'Commissioning', table_name: 'epc_commissioning_readiness', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (cm10b.rows.length > 0) {
    await pool.query(`UPDATE epc_commissioning_readiness SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [cm10b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.commissioningOnHold = cm10b.rows.length;

  if (result.commissioningOnHold > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_commissioning_review',
      title: `Review ${result.commissioningOnHold} commissioning records on hold for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. Active commissioning records are on hold — they may involve site work.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // ─── 11. Billing Readiness ───────────────────────────
  const bl11a = await pool.query(`
    SELECT id, status FROM epc_billing_readiness
    WHERE project_id = $1 AND status = 'draft'
  `, [projectId]);
  for (const r of bl11a.rows) {
    allSnapshots.push({ module: 'Billing', table_name: 'epc_billing_readiness', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: {}, restoration_eligible: true });
  }
  if (bl11a.rows.length > 0) {
    await pool.query(`UPDATE epc_billing_readiness SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [bl11a.rows.map((r: any) => r.id)]);
  }
  result.billingCancelled = bl11a.rows.length;

  const bl11b = await pool.query(`
    SELECT id, status FROM epc_billing_readiness
    WHERE project_id = $1 AND status IN ('under_review', 'approved')
  `, [projectId]);
  for (const r of bl11b.rows) {
    allSnapshots.push({ module: 'Billing', table_name: 'epc_billing_readiness', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: {}, restoration_eligible: false });
  }
  if (bl11b.rows.length > 0) {
    await pool.query(`UPDATE epc_billing_readiness SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [bl11b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.billingOnHold = bl11b.rows.length;

  if (result.billingOnHold > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_billing_review',
      title: `Review ${result.billingOnHold} billing records on hold for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. Active billing records are on hold and need review before closure.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // ─── 12. Invoices ────────────────────────────────────
  const inv12a = await pool.query(`
    SELECT id, status, invoice_number FROM epc_invoices
    WHERE project_id = $1 AND status = 'draft'
  `, [projectId]);
  for (const r of inv12a.rows) {
    allSnapshots.push({ module: 'Invoices', table_name: 'epc_invoices', record_id: r.id, status_before: r.status, status_after: 'canceled', key_data: { invoice_number: r.invoice_number }, restoration_eligible: true });
  }
  if (inv12a.rows.length > 0) {
    await pool.query(`UPDATE epc_invoices SET status = 'canceled', updated_at = NOW() WHERE id = ANY($1)`, [inv12a.rows.map((r: any) => r.id)]);
  }
  result.invoicesCancelled = inv12a.rows.length;

  const inv12b = await pool.query(`
    SELECT id, status, invoice_number FROM epc_invoices
    WHERE project_id = $1 AND status IN ('approved', 'issued')
  `, [projectId]);
  for (const r of inv12b.rows) {
    allSnapshots.push({ module: 'Invoices', table_name: 'epc_invoices', record_id: r.id, status_before: r.status, status_after: ON_HOLD_STATUS, key_data: { invoice_number: r.invoice_number }, restoration_eligible: false });
  }
  if (inv12b.rows.length > 0) {
    await pool.query(`UPDATE epc_invoices SET status = $2, updated_at = NOW() WHERE id = ANY($1)`, [inv12b.rows.map((r: any) => r.id), ON_HOLD_STATUS]);
  }
  result.invoicesOnHold = inv12b.rows.length;

  if (result.invoicesOnHold > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_invoice_review',
      title: `Review ${result.invoicesOnHold} invoices on hold for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. ${result.invoicesOnHold} invoices are on hold — they may have payment linkage.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // ─── Insert all snapshots ────────────────────────────
  result.totalSnapshots = await insertSnapshots(projectId, cancellationType, allSnapshots);

  // ─── Audit log ───────────────────────────────────────
  await pool.query(`
    INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
    VALUES ($1, 'project_cancellation_cascade', $2, $3, NOW(), true)
  `, [projectId, JSON.stringify({ ...result, snapshotCount: allSnapshots.length }), String(userId)]);

  console.log(`[EPC-Cascade] Project ${projectCode} (ID ${projectId}) cancellation cascade [${cancellationType}]: ` +
    `tasks=${result.tasksCancelled}C/${result.tasksOnHold}H, ` +
    `BOMs=${result.bomsCancelled}C/${result.bomsOnHold}H, DWG=${result.dwgCancelled}C/${result.dwgOnHold}H, ` +
    `planning=${result.planningCancelled}C/${result.planningOnHold}H, ` +
    `PO=${result.poCancelled}C/${result.poOnHold}H, WO=${result.woCancelled}C/${result.woOnHold}H, ` +
    `INS=${result.inspectionsCancelled}C/${result.inspectionsOnHold}H, ` +
    `DSP=${result.dispatchCancelled}C/${result.dispatchOnHold}H, ` +
    `QP=${result.qualityPlansCancelled}C/${result.qualityPlansOnHold}H, ` +
    `COM=${result.commissioningCancelled}C/${result.commissioningOnHold}H, ` +
    `BIL=${result.billingCancelled}C/${result.billingOnHold}H, ` +
    `INV=${result.invoicesCancelled}C/${result.invoicesOnHold}H | ` +
    `snapshots=${result.totalSnapshots}`);

  return result;
}

export async function executeProjectRestorationCascade(projectId: number, userId: number): Promise<RestorationResult> {
  const result: RestorationResult = {
    alreadyRestored: false,
    recordsRestored: 0,
    recordsLeftOnHold: 0,
    reviewTaskId: null,
    restoredModules: {},
    onHoldModules: {},
  };

  const projectCode = await resolveProjectCode(projectId);
  const pmId = await resolveManagerId(projectId);

  const lastCancel = await pool.query(`
    SELECT id, emitted_at FROM project_workflow_events
    WHERE project_id = $1 AND event_name = 'project_cancellation_cascade'
    ORDER BY emitted_at DESC LIMIT 1
  `, [projectId]);

  const lastRestore = await pool.query(`
    SELECT id, emitted_at FROM project_workflow_events
    WHERE project_id = $1 AND event_name = 'project_restoration_cascade'
    ORDER BY emitted_at DESC LIMIT 1
  `, [projectId]);

  if (lastRestore.rows.length > 0) {
    if (lastCancel.rows.length === 0) {
      result.alreadyRestored = true;
      return result;
    }
    const restoreTs = new Date(lastRestore.rows[0].emitted_at).getTime();
    const cancelTs = new Date(lastCancel.rows[0].emitted_at).getTime();
    if (restoreTs > cancelTs) {
      result.alreadyRestored = true;
      return result;
    }
  }

  // Restore only snapshot-eligible records to their pre-cancellation state
  const eligibleSnapshots = await pool.query(`
    SELECT id, module, table_name, record_id, status_before, status_after, restoration_eligible
    FROM project_cancellation_snapshots
    WHERE project_id = $1 AND restored = false
    ORDER BY id
  `, [projectId]);

  for (const snap of eligibleSnapshots.rows) {
    if (snap.restoration_eligible) {
      try {
        if (snap.table_name === 'item_planning_records') {
          await pool.query(`
            UPDATE ${snap.table_name} SET status = $1, cancel_reason = NULL, cancelled_by = NULL, cancelled_at = NULL, updated_at = NOW()
            WHERE id = $2 AND status IN ('canceled', $3)
          `, [snap.status_before, snap.record_id, ON_HOLD_STATUS]);
        } else if (snap.table_name === 'tasks') {
          await pool.query(`UPDATE tasks SET status = $1 WHERE id = $2 AND status IN ('canceled', $3)`, [snap.status_before, snap.record_id, ON_HOLD_STATUS]);
        } else {
          await pool.query(`UPDATE ${snap.table_name} SET status = $1, updated_at = NOW() WHERE id = $2 AND status IN ('canceled', $3)`, [snap.status_before, snap.record_id, ON_HOLD_STATUS]);
        }

        await pool.query(`UPDATE project_cancellation_snapshots SET restored = true, restored_at = NOW() WHERE id = $1`, [snap.id]);
        result.recordsRestored++;
        result.restoredModules[snap.module] = (result.restoredModules[snap.module] || 0) + 1;
      } catch (err: any) {
        console.error(`[EPC-Restore] Failed to restore ${snap.table_name}#${snap.record_id}:`, err.message);
      }
    } else {
      // On-hold active records stay as-is — manual review only
      result.recordsLeftOnHold++;
      result.onHoldModules[snap.module] = (result.onHoldModules[snap.module] || 0) + 1;
    }
  }

  // Create review task for on-hold records that need manual attention
  if (result.recordsLeftOnHold > 0) {
    const parts = Object.entries(result.onHoldModules).map(([m, c]) => `${c} ${m}`);
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId,
      actionCode: 'restoration_manual_review',
      title: `Review ${result.recordsLeftOnHold} on-hold records for reopened project ${projectCode}`,
      description: `Project ${projectCode} has been reopened. ${result.recordsLeftOnHold} records remain on hold (${parts.join(', ')}). These were active/financial at cancellation time and require manual review before they can proceed.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    result.reviewTaskId = taskId;
  }

  await pool.query(`
    INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
    VALUES ($1, 'project_restoration_cascade', $2, $3, NOW(), true)
  `, [projectId, JSON.stringify(result), String(userId)]);

  console.log(`[EPC-Restore] Project ${projectCode} (ID ${projectId}) restoration: ` +
    `restored=${result.recordsRestored}, leftOnHold=${result.recordsLeftOnHold}`);

  return result;
}

export function isProjectFrozen(status: string): boolean {
  return ['on_hold', 'inactive', 'canceled'].includes(status);
}

export function isProjectTerminal(status: string): boolean {
  return status === 'canceled';
}

export function isRecordOnHoldDueToCancellation(status: string): boolean {
  return status === ON_HOLD_STATUS;
}

export { ON_HOLD_STATUS };
