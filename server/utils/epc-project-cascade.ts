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

  // 1. Tasks: pending → canceled, in_progress → review
  const r1 = await pool.query(`
    UPDATE tasks SET status = 'canceled', updated_at = NOW()
    WHERE id IN (SELECT task_id FROM project_tasks WHERE project_id = $1)
      AND status = 'pending'
    RETURNING id
  `, [projectId]);
  result.tasksCancelled = r1.rowCount || 0;

  const r1b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM tasks
    WHERE id IN (SELECT task_id FROM project_tasks WHERE project_id = $1)
      AND status = 'in_progress'
  `, [projectId]);
  result.tasksReviewNeeded = r1b.rows[0]?.cnt || 0;

  if (result.tasksReviewNeeded > 0) {
    const taskId = await createDeduplicatedReviewTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_task_review',
      title: `Review ${result.tasksReviewNeeded} in-progress tasks for canceled project ${projectCode}`,
      description: `Project ${projectCode} has been canceled. ${result.tasksReviewNeeded} tasks are still in-progress and require manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    if (taskId) result.reviewTaskIds.push(taskId);
  }

  // 2. BOMs: draft/under_review → canceled
  const r2 = await pool.query(`
    UPDATE epc_bom_headers SET status = 'canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('draft', 'under_review')
    RETURNING id
  `, [projectId]);
  result.bomsCancelled = r2.rowCount || 0;

  // 3. Drawings: draft/pending_upload/file_not_available → canceled
  const r3 = await pool.query(`
    UPDATE epc_drawing_controls SET status = 'canceled', updated_at = NOW()
    WHERE project_id = $1
      AND status IN ('draft', 'pending_upload', 'file_not_available')
    RETURNING id
  `, [projectId]);
  result.dwgCancelled = r3.rowCount || 0;

  // 4. Planning: draft → canceled, released → superseded
  const r4a = await pool.query(`
    UPDATE item_planning_records SET status = 'canceled', cancel_reason = 'Project canceled',
      cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId, userId]);
  result.planningCancelled = r4a.rowCount || 0;

  const r4b = await pool.query(`
    UPDATE item_planning_records SET status = 'superseded',
      supersession_reason = 'Project canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'released'
    RETURNING id
  `, [projectId]);
  result.planningSuperseded = r4b.rowCount || 0;

  // 5. POs: draft → canceled, approved/issued → review
  const r5a = await pool.query(`
    UPDATE epc_purchase_orders SET status = 'canceled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  result.poCancelled = r5a.rowCount || 0;

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
    UPDATE quality_plans SET status = 'canceled', updated_at = NOW()
    WHERE planning_record_id IN (
      SELECT ipr.id FROM item_planning_records ipr
      JOIN project_items pi ON pi.id = ipr.project_item_id
      WHERE pi.project_id = $1
    ) AND status IN ('draft', 'preparation')
    RETURNING id
  `, [projectId]);
  result.qualityPlansCancelled = r9a.rowCount || 0;

  const r9b = await pool.query(`
    SELECT COUNT(*)::int as cnt FROM quality_plans
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

export function isProjectFrozen(status: string): boolean {
  return ['on_hold', 'inactive', 'canceled'].includes(status);
}

export function isProjectTerminal(status: string): boolean {
  return status === 'canceled';
}
