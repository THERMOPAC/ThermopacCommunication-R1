import { pool } from '../db';
import { createEpcTask, createEpcAlertMulti, resolveAssignee, resolveManagerId, resolveProjectCode } from '../epc-task-helpers';
import { linkIODraftToTriggeredIO } from '../pipeline/draft-activation';

interface InspectionTriggerResult {
  created: boolean;
  inspectionOrderId?: number;
  inspectionOrderNumber?: string;
  skipped?: string;
  agingAlertCreated?: boolean;
}

export async function triggerInspectionOnPoIssuance(
  poId: number,
  poNumber: string,
  projectId: number,
  projectItemId: number,
  userId: number,
): Promise<InspectionTriggerResult> {
  return createInspectionIfNeeded({
    sourceType: 'purchase_order',
    sourceId: poId,
    sourceNumber: poNumber,
    projectId,
    projectItemId,
    inspectionType: 'incoming',
    userId,
  });
}

export async function triggerInspectionOnWoRelease(
  woId: number,
  woNumber: string,
  projectId: number,
  projectItemId: number,
  userId: number,
): Promise<InspectionTriggerResult> {
  return createInspectionIfNeeded({
    sourceType: 'work_order',
    sourceId: woId,
    sourceNumber: woNumber,
    projectId,
    projectItemId,
    inspectionType: 'in-process',
    userId,
  });
}

interface CreateInspectionParams {
  sourceType: 'purchase_order' | 'work_order';
  sourceId: number;
  sourceNumber: string;
  projectId: number;
  projectItemId: number;
  inspectionType: string;
  userId: number;
}

async function createInspectionIfNeeded(params: CreateInspectionParams): Promise<InspectionTriggerResult> {
  const { sourceType, sourceId, sourceNumber, projectId, projectItemId, inspectionType, userId } = params;

  const dupCheck = await pool.query(
    `SELECT id, inspection_order_number FROM inspection_orders
     WHERE project_id = $1 AND item_id = $2
       AND status NOT IN ('canceled')
       AND ($3::text IS NULL OR inspection_type = $3)
     LIMIT 1`,
    [projectId, projectItemId, inspectionType]
  );

  if (dupCheck.rows.length > 0) {
    const existing = dupCheck.rows[0];
    console.log(`[INS-Trigger] Skipped: inspection ${existing.inspection_order_number} already exists for project_item ${projectItemId} (${sourceType} ${sourceNumber})`);
    return {
      created: false,
      inspectionOrderId: existing.id,
      inspectionOrderNumber: existing.inspection_order_number,
      skipped: `Inspection order ${existing.inspection_order_number} already exists for this item`,
    };
  }

  const piResult = await pool.query(
    `SELECT pi.id, pi.item_id, pi.quantity, pi.drawing_no,
            mi.item_code, mi.description, mi.make_or_buy
     FROM project_items pi
     JOIN master_items mi ON mi.id = pi.item_id
     WHERE pi.id = $1`,
    [projectItemId]
  );
  if (piResult.rows.length === 0) {
    return { created: false, skipped: `Project item ${projectItemId} not found` };
  }
  const pi = piResult.rows[0];

  const projectCode = await resolveProjectCode(projectId);

  const seqResult = await pool.query(
    `SELECT COUNT(*)::int + 1 as next_seq FROM inspection_orders WHERE project_id = $1`,
    [projectId]
  );
  const seq = seqResult.rows[0].next_seq;
  const typeCode = pi.make_or_buy === 'Buy' ? 'B' : pi.make_or_buy === 'Make' ? 'M' : 'C';
  const year = new Date().getFullYear();
  const projectNum = projectCode || projectId.toString();
  const ioNumber = `IO-${year}-${projectNum}-${typeCode}-${seq}`;

  const sourceLabel = sourceType === 'purchase_order' ? 'PO' : 'WO';

  const insertResult = await pool.query(
    `INSERT INTO inspection_orders (
       project_id, item_id, inspection_order_number, project_code,
       title, description, inspection_type, make_or_buy,
       item_code, drawing_no, status, created_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, NOW(), NOW())
     RETURNING id, inspection_order_number`,
    [
      projectId, projectItemId, ioNumber, projectCode,
      `${inspectionType} inspection for ${pi.item_code} (${sourceLabel} ${sourceNumber})`,
      `Auto-created inspection order triggered by ${sourceLabel} ${sourceNumber} issuance/release for item ${pi.item_code} (${pi.description}).`,
      inspectionType, pi.make_or_buy,
      pi.item_code, pi.drawing_no || null,
      userId,
    ]
  );

  const newIO = insertResult.rows[0];

  await pool.query(
    `INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
     VALUES ($1, 'inspection_auto_triggered', $2, $3, NOW())`,
    [projectId, JSON.stringify({
      inspectionOrderId: newIO.id,
      inspectionOrderNumber: newIO.inspection_order_number,
      sourceType, sourceId, sourceNumber,
      projectItemId, itemCode: pi.item_code,
      inspectionType,
    }), userId]
  );

  const qcLead = await resolveAssignee(projectId, 'Quality', userId);
  const pmId = await resolveManagerId(projectId);

  await createEpcTask({
    projectId, entityType: 'inspection_order', recordId: newIO.id, actionCode: 'inspection_assigned',
    title: `Complete ${inspectionType} inspection ${newIO.inspection_order_number} for ${pi.item_code}`,
    description: `Inspection auto-created from ${sourceLabel} ${sourceNumber}. Item: ${pi.item_code} (${pi.description}). Type: ${inspectionType}.`,
    assignedTo: qcLead || pmId || userId, createdBy: userId, priority: 'Medium', dueDays: 7,
  });

  const alertRecipients = [qcLead, pmId].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
  await createEpcAlertMulti(alertRecipients, {
    type: 'epc_inspection_triggered', title: `Inspection ${newIO.inspection_order_number} created`,
    message: `${inspectionType} inspection auto-created for ${pi.item_code} on project ${projectCode}. Source: ${sourceLabel} ${sourceNumber}.`,
    link: `/quality/inspection-orders`, priority: 'medium', sourceType: 'epc_automation', sourceId: newIO.id, createdBy: userId,
    entityType: 'inspection_order', recordId: newIO.id, actionCode: 'auto_created',
  });

  console.log(`[INS-Trigger] Created ${newIO.inspection_order_number} for ${pi.item_code} (${sourceLabel} ${sourceNumber})`);

  try {
    await linkIODraftToTriggeredIO(
      projectId, projectItemId,
      newIO.inspection_order_number, newIO.id,
      `${sourceLabel}_${sourceType}`
    );
  } catch (linkErr) {
    console.error(`[INS-Trigger] Failed to link IO draft:`, linkErr);
  }

  return {
    created: true,
    inspectionOrderId: newIO.id,
    inspectionOrderNumber: newIO.inspection_order_number,
  };
}

export async function checkPendingInspectionAging(projectId: number, userId: number, agingDays: number = 7): Promise<number> {
  const aging = await pool.query(
    `SELECT io.id, io.inspection_order_number, io.item_code, io.inspection_type,
            io.created_at,
            EXTRACT(DAY FROM NOW() - io.created_at)::int as days_pending
     FROM inspection_orders io
     WHERE io.project_id = $1
       AND io.status = 'pending'
       AND io.created_at < NOW() - INTERVAL '1 day' * $2`,
    [projectId, agingDays]
  );

  if (aging.rows.length === 0) return 0;

  const projectCode = await resolveProjectCode(projectId);
  const qcLead = await resolveAssignee(projectId, 'Quality', userId);
  const pmId = await resolveManagerId(projectId);

  const existingAlerts = await pool.query(
    `SELECT 1 FROM tasks
     WHERE id IN (SELECT task_id FROM project_tasks WHERE project_id = $1)
       AND title LIKE '%pending inspection aging%'
       AND status IN ('pending', 'in_progress')
       AND created_at > NOW() - INTERVAL '3 days'
     LIMIT 1`,
    [projectId]
  );

  if (existingAlerts.rows.length > 0) {
    console.log(`[INS-Aging] Skipped: recent aging alert already exists for project ${projectCode}`);
    return 0;
  }

  const ioList = aging.rows.map((r: any) => `${r.inspection_order_number} (${r.item_code}, ${r.days_pending}d)`).join(', ');

  await createEpcTask({
    projectId, entityType: 'project', recordId: projectId, actionCode: 'pending_inspection_aging',
    title: `Review ${aging.rows.length} pending inspection aging alerts for ${projectCode}`,
    description: `${aging.rows.length} inspection orders have been pending for ${agingDays}+ days: ${ioList}`,
    assignedTo: qcLead || pmId || userId, createdBy: userId, priority: 'High', dueDays: 2,
  });

  const alertRecipients = [qcLead, pmId].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
  await createEpcAlertMulti(alertRecipients, {
    type: 'epc_inspection_aging', title: `${aging.rows.length} inspections aging on ${projectCode}`,
    message: `${aging.rows.length} inspections pending for ${agingDays}+ days on project ${projectCode}. Immediate attention required.`,
    link: `/quality/inspection-orders`, priority: 'high', sourceType: 'epc_automation', sourceId: projectId, createdBy: userId,
    entityType: 'project', recordId: projectId, actionCode: 'inspection_aging',
  });

  console.log(`[INS-Aging] Created aging alert for ${aging.rows.length} inspections on project ${projectCode}`);
  return aging.rows.length;
}
