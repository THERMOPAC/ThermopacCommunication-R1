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
  reviewTaskIds: number[];
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
    reviewTaskIds: [],
  };

  const projectCode = await resolveProjectCode(projectId);
  const pmId = await resolveManagerId(projectId);

  const r1 = await pool.query(`
    UPDATE tasks SET status = 'cancelled', updated_at = NOW()
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
    const task = await createEpcTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_task_review',
      title: `Review ${result.tasksReviewNeeded} in-progress tasks for cancelled project ${projectCode}`,
      description: `Project ${projectCode} has been cancelled. ${result.tasksReviewNeeded} tasks are still in-progress and require manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    if (task?.id) result.reviewTaskIds.push(task.id);
  }

  const r2 = await pool.query(`
    UPDATE epc_bom_headers SET status = 'cancelled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status IN ('draft', 'under_review')
    RETURNING id
  `, [projectId]);
  result.bomsCancelled = r2.rowCount || 0;

  const r3 = await pool.query(`
    UPDATE epc_drawing_controls SET status = 'cancelled', updated_at = NOW()
    WHERE project_id = $1
      AND status IN ('draft', 'pending_upload', 'file_not_available')
    RETURNING id
  `, [projectId]);
  result.dwgCancelled = r3.rowCount || 0;

  const r4a = await pool.query(`
    UPDATE item_planning_records SET status = 'cancelled', cancel_reason = 'Project cancelled',
      cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId, userId]);
  result.planningCancelled = r4a.rowCount || 0;

  const r4b = await pool.query(`
    UPDATE item_planning_records SET status = 'superseded',
      supersession_reason = 'Project cancelled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'released'
    RETURNING id
  `, [projectId]);
  result.planningSuperseded = r4b.rowCount || 0;

  const r5a = await pool.query(`
    UPDATE epc_purchase_orders SET status = 'cancelled', updated_at = NOW()
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

  const r6a = await pool.query(`
    UPDATE epc_work_orders SET status = 'cancelled', updated_at = NOW()
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
    const task = await createEpcTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_powo_review',
      title: `Review ${result.poReviewNeeded} active POs and ${result.woReviewNeeded} active WOs for cancelled project ${projectCode}`,
      description: `Project ${projectCode} has been cancelled. Active POs/WOs require manual review — they may have SAP linkage.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (task?.id) result.reviewTaskIds.push(task.id);
  }

  const r7a = await pool.query(`
    UPDATE inspection_orders SET status = 'cancelled', updated_at = NOW()
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
    const task = await createEpcTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_inspection_review',
      title: `Review ${result.inspectionsReviewNeeded} in-progress inspections for cancelled project ${projectCode}`,
      description: `Project ${projectCode} has been cancelled. ${result.inspectionsReviewNeeded} inspections are in-progress and need manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 3,
    });
    if (task?.id) result.reviewTaskIds.push(task.id);
  }

  const r8a = await pool.query(`
    UPDATE epc_dispatch_readiness SET status = 'cancelled', updated_at = NOW()
    WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = $1)
      AND status = 'draft'
    RETURNING id
  `, [projectId]);
  const r8b = await pool.query(`
    UPDATE epc_dispatch_records SET status = 'cancelled', updated_at = NOW()
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
    const task = await createEpcTask({
      projectId, entityType: 'project', recordId: projectId, actionCode: 'cancellation_dispatch_review',
      title: `Review ${result.dispatchReviewNeeded} active dispatch records for cancelled project ${projectCode}`,
      description: `Project ${projectCode} has been cancelled. Active dispatch records need manual review.`,
      assignedTo: pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
    });
    if (task?.id) result.reviewTaskIds.push(task.id);
  }

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
    `DSP=${result.dispatchCancelled}C/${result.dispatchReviewNeeded}R`);

  return result;
}

export function isProjectFrozen(status: string): boolean {
  return ['on_hold', 'inactive', 'cancelled'].includes(status);
}

export function isProjectTerminal(status: string): boolean {
  return status === 'cancelled';
}
