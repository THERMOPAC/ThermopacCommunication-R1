import { pool } from '../db';
import { createEpcTask, resolveManagerId, resolveProjectCode } from '../epc-task-helpers';

interface CascadeResult {
  tasksCancelled: number;
  tasksReviewNeeded: number;
  bomsCancelled: number;
  dwgCancelled: number;
  planningCancelled: number;
  planningSuperseded: number;
  poCancelled: number;
  poReviewNeeded: number;
  woCancelled: number;
  woReviewNeeded: number;
  inspectionsCancelled: number;
  inspectionsReviewNeeded: number;
  dispatchCancelled: number;
  dispatchReviewNeeded: number;
  qualityPlansCancelled: number;
  qualityPlansReviewNeeded: number;
  commissioningCancelled: number;
  commissioningReviewNeeded: number;
  billingCancelled: number;
  billingReviewNeeded: number;
  invoicesCancelled: number;
  invoicesReviewNeeded: number;
  reviewTaskIds: number[];
  canceledIds?: {
    tasks: number[];
    boms: number[];
    drawings: number[];
    planningDrafts: number[];
    planningSuperseded: number[];
    pos: number[];
    wos: number[];
    inspections: number[];
    dispatchReadiness: number[];
    dispatchRecords: number[];
    qualityPlans: number[];
    commissioning: number[];
    billing: number[];
    invoices: number[];
  };
}

interface RestorationResult {
  alreadyRestored: boolean;
  tasksRestored: number;
  bomsRestored: number;
  drawingsRestored: number;
  planningRestored: number;
  inspectionsRestored: number;
  dispatchReadinessRestored: number;
  qualityPlansRestored: number;
  commissioningRestored: number;
  billingRestored: number;
  posNotRestored: number;
  wosNotRestored: number;
  dispatchRecordsNotRestored: number;
  invoicesNotRestored: number;
  reviewTaskId: number | null;
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

export async function executeProjectCancellationCascade(projectId: number, userId: number): Promise<CascadeResult> {
  const result: CascadeResult = {
    tasksCancelled: 0, tasksReviewNeeded: 0,
    bomsCancelled: 0, dwgCancelled: 0,
    planningCancelled: 0, planningSuperseded: 0,
    poCancelled: 0, poReviewNeeded: 0,
    woCancelled: 0, woReviewNeeded: 0,
    inspectionsCancelled: 0, inspectionsReviewNeeded: 0,
    dispatchCancelled: 0, dispatchReviewNeeded: 0,
    qualityPlansCancelled: 0, qualityPlansReviewNeeded: 0,
    commissioningCancelled: 0, commissioningReviewNeeded: 0,
    billingCancelled: 0, billingReviewNeeded: 0,
    invoicesCancelled: 0, invoicesReviewNeeded: 0,
    reviewTaskIds: [],
  };

  const projectCode = await resolveProjectCode(projectId);
  const pmId = await resolveManagerId(projectId);

  const cIds: CascadeResult['canceledIds'] = {
    tasks: [], boms: [], drawings: [], planningDrafts: [], planningSuperseded: [],
    pos: [], wos: [], inspections: [], dispatchReadiness: [], dispatchRecords: [],
    qualityPlans: [], commissioning: [], billing: [], invoices: [],
  };

  // 1. Tasks: cancel ALL non-terminal tasks (pending, in_progress, etc.)
  const r1 = await pool.query(`
    UPDATE tasks SET status = 'canceled'
    WHERE id IN (SELECT task_id FROM project_tasks WHERE project_id = $1)
      AND status NOT IN ('canceled', 'completed', 'closed')
    RETURNING id
  `, [projectId]);
  result.tasksCancelled = r1.rowCount || 0;
  cIds.tasks = r1.rows.map((r: any) => r.id);

  // 2. BOMs: draft/under_review → canceled
  const r2 = await pool.query(`
    UPDATE epc_bom_headers SET status = 'canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('draft', 'under_review')
    RETURNING id
  `, [projectId]);
  result.bomsCancelled = r2.rowCount || 0;
  cIds.boms = r2.rows.map((r: any) => r.id);

  // 3. Drawings: draft/pending_upload/file_not_available → canceled
  const r3 = await pool.query(`
    UPDATE epc_drawing_controls SET status = 'canceled', updated_at = NOW()
    WHERE project_id = $1
      AND status IN ('draft', 'pending_upload', 'file_not_available')
    RETURNING id
  `, [projectId]);
  result.dwgCancelled = r3.rowCount || 0;
  cIds.drawings = r3.rows.map((r: any) => r.id);

  // 4. Planning: draft → canceled, released → superseded
  const r4a = await pool.query(`
    UPDATE item_planning_records SET status = 'canceled', cancel_reason = 'Project canceled',
      cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId, userId]);
  result.planningCancelled = r4a.rowCount || 0;
  cIds.planningDrafts = r4a.rows.map((r: any) => r.id);

  const r4b = await pool.query(`
    UPDATE item_planning_records SET status = 'superseded',
      supersession_reason = 'Project canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'released'
    RETURNING id
  `, [projectId]);
  result.planningSuperseded = r4b.rowCount || 0;
  cIds.planningSuperseded = r4b.rows.map((r: any) => r.id);

  // 5. POs: draft → canceled, approved/issued → review
  const r5a = await pool.query(`
    UPDATE epc_purchase_orders SET status = 'canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  result.poCancelled = r5a.rowCount || 0;
  cIds.pos = r5a.rows.map((r: any) => r.id);

  const r5b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_purchase_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('approved', 'issued')
  `, [projectId]);
  result.poReviewNeeded = r5b.rows[0]?.cnt || 0;

  // 6. WOs: draft → canceled, approved/released → review
  const r6a = await pool.query(`
    UPDATE epc_work_orders SET status = 'canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  result.woCancelled = r6a.rowCount || 0;
  cIds.wos = r6a.rows.map((r: any) => r.id);

  const r6b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_work_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('approved', 'released')
  `, [projectId]);
  result.woReviewNeeded = r6b.rows[0]?.cnt || 0;

  if (result.poReviewNeeded > 0 || result.woReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_powo_review',
      title: `Review ${result.poReviewNeeded} active POs and ${result.woReviewNeeded} active WOs for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. Active POs/WOs require manual review — they may have SAP linkage.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // 7. Inspections: pending → canceled, in_progress → review
  const r7a = await pool.query(`
    UPDATE inspection_orders SET status = 'canceled', updated_at = NOW()
    WHERE project_id = $1 AND status = 'pending'
    RETURNING id
  `, [projectId]);
  result.inspectionsCancelled = r7a.rowCount || 0;
  cIds.inspections = r7a.rows.map((r: any) => r.id);

  const r7b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM inspection_orders
    WHERE project_id = $1 AND status = 'in_progress'
  `, [projectId]);
  result.inspectionsReviewNeeded = r7b.rows[0]?.cnt || 0;

  if (result.inspectionsReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_inspection_review',
      title: `Review ${result.inspectionsReviewNeeded} in-progress inspections for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. ${result.inspectionsReviewNeeded} inspections are in-progress and need manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // 8. Dispatch: draft → canceled, active → review
  const r8a = await pool.query(`
    UPDATE epc_dispatch_readiness SET status = 'canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  const r8b = await pool.query(`
    UPDATE epc_dispatch_records SET status = 'canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  result.dispatchCancelled = (r8a.rowCount || 0) + (r8b.rowCount || 0);
  cIds.dispatchReadiness = r8a.rows.map((r: any) => r.id);
  cIds.dispatchRecords = r8b.rows.map((r: any) => r.id);

  const r8c = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_dispatch_records
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('confirmed', 'shipped', 'delivered')
  `, [projectId]);
  result.dispatchReviewNeeded = r8c.rows[0]?.cnt || 0;

  if (result.dispatchReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_dispatch_review',
      title: `Review ${result.dispatchReviewNeeded} active dispatch records for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. Active dispatch records need manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // 9. Quality Plans: draft/preparation → canceled, ready/in_progress → review
  const r9a = await pool.query(`
    UPDATE quality_planning_records SET status = 'canceled', updated_at = NOW()
    WHERE planning_record_id IN (
      SELECT ipr.id FROM item_planning_records ipr
      JOIN project_items pi ON pi.id = ipr.project_item_id
      WHERE pi.project_id = $1
    ) AND status IN ('draft', 'preparation')
    RETURNING id
  `, [projectId]);
  result.qualityPlansCancelled = r9a.rowCount || 0;
  cIds.qualityPlans = r9a.rows.map((r: any) => r.id);

  const r9b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM quality_planning_records
    WHERE planning_record_id IN (
      SELECT ipr.id FROM item_planning_records ipr
      JOIN project_items pi ON pi.id = ipr.project_item_id
      WHERE pi.project_id = $1
    ) AND status IN ('ready', 'in_progress')
  `, [projectId]);
  result.qualityPlansReviewNeeded = r9b.rows[0]?.cnt || 0;

  if (result.qualityPlansReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_quality_review',
      title: `Review ${result.qualityPlansReviewNeeded} active quality plans for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. ${result.qualityPlansReviewNeeded} quality plans are active and need manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // 10. Commissioning Readiness: draft → canceled, preparation/ready/commissioned → review
  const r10a = await pool.query(`
    UPDATE epc_commissioning_readiness SET status = 'canceled', updated_at = NOW()
    WHERE project_id = $1
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  result.commissioningCancelled = r10a.rowCount || 0;
  cIds.commissioning = r10a.rows.map((r: any) => r.id);

  const r10b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_commissioning_readiness
    WHERE project_id = $1
      AND status IN ('preparation', 'ready', 'commissioned')
  `, [projectId]);
  result.commissioningReviewNeeded = r10b.rows[0]?.cnt || 0;

  if (result.commissioningReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_commissioning_review',
      title: `Review ${result.commissioningReviewNeeded} active commissioning records for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. Active commissioning records need manual review — they may involve site work.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // 11. Billing Readiness: draft → canceled, under_review/approved → review
  const r11a = await pool.query(`
    UPDATE epc_billing_readiness SET status = 'canceled', updated_at = NOW()
    WHERE project_id = $1
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  result.billingCancelled = r11a.rowCount || 0;
  cIds.billing = r11a.rows.map((r: any) => r.id);

  const r11b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_billing_readiness
    WHERE project_id = $1
      AND status IN ('under_review', 'approved')
  `, [projectId]);
  result.billingReviewNeeded = r11b.rows[0]?.cnt || 0;

  if (result.billingReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_billing_review',
      title: `Review ${result.billingReviewNeeded} active billing readiness records for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. Active billing readiness records need review before closure.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // 12. EPC Invoices: draft → canceled, approved/issued → review (paid invoices untouched)
  const r12a = await pool.query(`
    UPDATE epc_invoices SET status = 'canceled', updated_at = NOW()
    WHERE project_id = $1
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  result.invoicesCancelled = r12a.rowCount || 0;
  cIds.invoices = r12a.rows.map((r: any) => r.id);

  const r12b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_invoices
    WHERE project_id = $1
      AND status IN ('approved', 'issued')
  `, [projectId]);
  result.invoicesReviewNeeded = r12b.rows[0]?.cnt || 0;

  if (result.invoicesReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_invoice_review',
      title: `Review ${result.invoicesReviewNeeded} active invoices for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. ${result.invoicesReviewNeeded} invoices are approved/issued and need manual review — they may have payment linkage.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  result.canceledIds = cIds;

  // Audit log
  await pool.query(`
    INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
    VALUES ($1, 'project_cancellation_cascade', $2, $3, NOW(), true)
  `, [projectId, JSON.stringify(result), String(userId)]);

  console.log(`[EPC-Cascade] Project ${projectCode} (ID ${projectId}) cancellation cascade: ` +
    `tasks=${result.tasksCancelled}C/${result.tasksReviewNeeded}R, ` +
    `BOMs=${result.bomsCancelled}C, DWG=${result.dwgCancelled}C, ` +
    `planning=${result.planningCancelled}C/${result.planningSuperseded}S, ` +
    `PO=${result.poCancelled}C/${result.poReviewNeeded}R, WO=${result.woCancelled}C/${result.woReviewNeeded}R, ` +
    `INS=${result.inspectionsCancelled}C/${result.inspectionsReviewNeeded}R, ` +
    `DSP=${result.dispatchCancelled}C/${result.dispatchReviewNeeded}R, ` +
    `QP=${result.qualityPlansCancelled}C/${result.qualityPlansReviewNeeded}R, ` +
    `COM=${result.commissioningCancelled}C/${result.commissioningReviewNeeded}R, ` +
    `BIL=${result.billingCancelled}C/${result.billingReviewNeeded}R, ` +
    `INV=${result.invoicesCancelled}C/${result.invoicesReviewNeeded}R`);

  return result;
}

export async function executeProjectRestorationCascade(projectId: number, userId: number): Promise<RestorationResult> {
  const result: RestorationResult = {
    alreadyRestored: false,
    tasksRestored: 0, bomsRestored: 0, drawingsRestored: 0, planningRestored: 0,
    inspectionsRestored: 0, dispatchReadinessRestored: 0, qualityPlansRestored: 0,
    commissioningRestored: 0, billingRestored: 0,
    posNotRestored: 0, wosNotRestored: 0, dispatchRecordsNotRestored: 0, invoicesNotRestored: 0,
    reviewTaskId: null,
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
      console.log(`[EPC-Restore] Project ${projectCode} (ID ${projectId}) restoration already ran (no cancel event found) — skipping.`);
      return result;
    }
    const restoreTs = new Date(lastRestore.rows[0].emitted_at).getTime();
    const cancelTs = new Date(lastCancel.rows[0].emitted_at).getTime();
    if (restoreTs > cancelTs) {
      result.alreadyRestored = true;
      console.log(`[EPC-Restore] Project ${projectCode} (ID ${projectId}) restoration already ran — skipping.`);
      return result;
    }
  }

  const r1 = await pool.query(`
    UPDATE tasks SET status = 'pending'
    WHERE id IN (SELECT task_id FROM project_tasks WHERE project_id = $1)
      AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.tasksRestored = r1.rowCount || 0;

  const r2 = await pool.query(`
    UPDATE epc_bom_headers SET status = 'draft', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.bomsRestored = r2.rowCount || 0;

  const r3 = await pool.query(`
    UPDATE epc_drawing_controls SET status = 'draft', updated_at = NOW()
    WHERE project_id = $1 AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.drawingsRestored = r3.rowCount || 0;

  const r4 = await pool.query(`
    UPDATE item_planning_records SET status = 'draft', cancel_reason = NULL,
      cancelled_by = NULL, cancelled_at = NULL, updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'canceled' AND cancel_reason = 'Project canceled'
    RETURNING id
  `, [projectId]);
  result.planningRestored = r4.rowCount || 0;

  const r5 = await pool.query(`
    UPDATE inspection_orders SET status = 'pending', updated_at = NOW()
    WHERE project_id = $1 AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.inspectionsRestored = r5.rowCount || 0;

  const r6 = await pool.query(`
    UPDATE epc_dispatch_readiness SET status = 'draft', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.dispatchReadinessRestored = r6.rowCount || 0;

  const r7 = await pool.query(`
    UPDATE quality_planning_records SET status = 'draft', updated_at = NOW()
    WHERE planning_record_id IN (
      SELECT ipr.id FROM item_planning_records ipr
      JOIN project_items pi ON pi.id = ipr.project_item_id
      WHERE pi.project_id = $1
    ) AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.qualityPlansRestored = r7.rowCount || 0;

  const r8 = await pool.query(`
    UPDATE epc_commissioning_readiness SET status = 'draft', updated_at = NOW()
    WHERE project_id = $1 AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.commissioningRestored = r8.rowCount || 0;

  const r9 = await pool.query(`
    UPDATE epc_billing_readiness SET status = 'draft', updated_at = NOW()
    WHERE project_id = $1 AND status = 'canceled'
    RETURNING id
  `, [projectId]);
  result.billingRestored = r9.rowCount || 0;

  const poCount = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_purchase_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'canceled'
  `, [projectId]);
  result.posNotRestored = poCount.rows[0]?.cnt || 0;

  const woCount = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_work_orders
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'canceled'
  `, [projectId]);
  result.wosNotRestored = woCount.rows[0]?.cnt || 0;

  const dspCount = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_dispatch_records
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'canceled'
  `, [projectId]);
  result.dispatchRecordsNotRestored = dspCount.rows[0]?.cnt || 0;

  const invCount = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM epc_invoices
    WHERE project_id = $1 AND status = 'canceled'
  `, [projectId]);
  result.invoicesNotRestored = invCount.rows[0]?.cnt || 0;

  const totalNotRestored = result.posNotRestored + result.wosNotRestored +
    result.dispatchRecordsNotRestored + result.invoicesNotRestored;

  if (totalNotRestored > 0) {
    const parts: string[] = [];
    if (result.posNotRestored > 0) parts.push(`${result.posNotRestored} POs`);
    if (result.wosNotRestored > 0) parts.push(`${result.wosNotRestored} WOs`);
    if (result.dispatchRecordsNotRestored > 0) parts.push(`${result.dispatchRecordsNotRestored} dispatch records`);
    if (result.invoicesNotRestored > 0) parts.push(`${result.invoicesNotRestored} invoices`);

    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId,
      actionCode: 'restoration_manual_review',
      title: `Review non-restored records for reopened project ${projectCode}`,
      description: `Project ${projectCode} has been reopened. The following canceled records were NOT auto-restored and require manual review: ${parts.join(', ')}. These may have SAP linkage, payment records, or physical shipment history.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    result.reviewTaskId = taskId;
  }

  await pool.query(`
    INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
    VALUES ($1, 'project_restoration_cascade', $2, $3, NOW(), true)
  `, [projectId, JSON.stringify(result), String(userId)]);

  console.log(`[EPC-Restore] Project ${projectCode} (ID ${projectId}) restoration cascade: ` +
    `tasks=${result.tasksRestored}, BOMs=${result.bomsRestored}, DWG=${result.drawingsRestored}, ` +
    `planning=${result.planningRestored}, INS=${result.inspectionsRestored}, ` +
    `DSP-ready=${result.dispatchReadinessRestored}, QP=${result.qualityPlansRestored}, ` +
    `COM=${result.commissioningRestored}, BIL=${result.billingRestored} | ` +
    `NOT restored: PO=${result.posNotRestored}, WO=${result.wosNotRestored}, ` +
    `DSP-rec=${result.dispatchRecordsNotRestored}, INV=${result.invoicesNotRestored}`);

  return result;
}

export function isProjectFrozen(status: string): boolean {
  return ['on_hold', 'inactive', 'canceled'].includes(status);
}

export function isProjectTerminal(status: string): boolean {
  return status === 'canceled';
}
