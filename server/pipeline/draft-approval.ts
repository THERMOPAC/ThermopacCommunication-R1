import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createEpcTask, resolveAssignee } from '../epc-task-helpers';
import { APPROVAL_ROLES, ACTION_ROLES, PHASE_MAP, SLA_DAYS, PRIORITY_MAP } from './pipeline-types';

export async function approveDraft(draftId: number, userId: number, userRole: string): Promise<{ success: boolean; error?: string }> {
  if (!APPROVAL_ROLES.includes(userRole)) {
    return { success: false, error: 'Insufficient role. Senior Manager or above required for approval.' };
  }

  const draftResult = await db.execute(
    sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`
  );
  if (draftResult.rows.length === 0) {
    return { success: false, error: 'Draft not found.' };
  }
  const draft = draftResult.rows[0] as any;

  if (draft.generated_by_user_id === userId) {
    return { success: false, error: 'Separation of duties: the user who generated this draft cannot approve it.' };
  }

  if (!draft.applicable) {
    return { success: false, error: 'This draft is not applicable and cannot be approved.' };
  }

  if (draft.approval_status !== 'pending_approval') {
    return { success: false, error: `Draft is in status "${draft.approval_status}" and cannot be approved. Must be "pending_approval".` };
  }

  if (draft.dependency_status === 'blocked') {
    return { success: false, error: `Dependency not met. ${draft.dependency_doc_type} must be approved first.` };
  }

  await db.execute(
    sql`UPDATE execution_drafts
        SET approval_status = 'approved',
            approved_by = ${userId},
            updated_at = NOW()
        WHERE id = ${draftId}`
  );

  await db.execute(
    sql`UPDATE tasks SET status = 'completed', completed_at = NOW()
        WHERE id = ${draft.linked_task_id} AND status NOT IN ('completed', 'obsolete')`
  );

  await logWorkflowEvent(draft.project_id, 'execution_draft.approved', {
    doc_type: draft.doc_type,
    doc_number: draft.doc_number,
    approved_by: userId,
  });

  if (draft.doc_type === 'DO') {
    await cascadeDOApproval(draft.project_id, draft.project_item_id, draft.doc_number, userId);
  }

  return { success: true };
}

export async function rejectDraft(draftId: number, userId: number, userRole: string, remarks: string): Promise<{ success: boolean; error?: string }> {
  if (!ACTION_ROLES.includes(userRole)) {
    return { success: false, error: 'Insufficient role. Manager or above required.' };
  }
  if (!remarks || remarks.trim().length === 0) {
    return { success: false, error: 'Rejection remarks are required.' };
  }

  const draftResult = await db.execute(
    sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`
  );
  if (draftResult.rows.length === 0) {
    return { success: false, error: 'Draft not found.' };
  }
  const draft = draftResult.rows[0] as any;

  if (!draft.applicable || draft.approval_status === 'not_applicable') {
    return { success: false, error: 'This draft is not applicable.' };
  }
  if (!['pending_approval', 'draft', 'on_hold'].includes(draft.approval_status)) {
    return { success: false, error: `Draft in status "${draft.approval_status}" cannot be rejected.` };
  }

  await db.execute(
    sql`UPDATE execution_drafts
        SET approval_status = 'rejected',
            rejected_by = ${userId},
            rejection_remarks = ${remarks.trim()},
            updated_at = NOW()
        WHERE id = ${draftId}`
  );

  await db.execute(
    sql`UPDATE tasks SET status = 'completed', completed_at = NOW()
        WHERE id = ${draft.linked_task_id} AND status NOT IN ('completed', 'obsolete')`
  );

  await logWorkflowEvent(draft.project_id, 'execution_draft.rejected', {
    doc_type: draft.doc_type,
    doc_number: draft.doc_number,
    rejected_by: userId,
    rejection_remarks: remarks.trim(),
  });

  return { success: true };
}

export async function holdDraft(draftId: number, userId: number, userRole: string, remarks?: string): Promise<{ success: boolean; error?: string }> {
  if (!ACTION_ROLES.includes(userRole)) {
    return { success: false, error: 'Insufficient role. Manager or above required.' };
  }

  const draftResult = await db.execute(
    sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`
  );
  if (draftResult.rows.length === 0) {
    return { success: false, error: 'Draft not found.' };
  }
  const draft = draftResult.rows[0] as any;

  if (draft.approval_status !== 'pending_approval') {
    return { success: false, error: `Draft in status "${draft.approval_status}" cannot be put on hold.` };
  }

  await db.execute(
    sql`UPDATE execution_drafts
        SET approval_status = 'on_hold',
            hold_remarks = ${remarks?.trim() || null},
            updated_at = NOW()
        WHERE id = ${draftId}`
  );

  await db.execute(
    sql`UPDATE tasks SET status = 'on_hold'
        WHERE id = ${draft.linked_task_id} AND status NOT IN ('completed', 'obsolete')`
  );

  await logWorkflowEvent(draft.project_id, 'execution_draft.held', {
    doc_type: draft.doc_type,
    doc_number: draft.doc_number,
    held_by: userId,
    hold_remarks: remarks?.trim() || null,
  });

  return { success: true };
}

export async function resumeDraft(draftId: number, userId: number, userRole: string): Promise<{ success: boolean; error?: string }> {
  if (!ACTION_ROLES.includes(userRole)) {
    return { success: false, error: 'Insufficient role. Manager or above required.' };
  }

  const draftResult = await db.execute(
    sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`
  );
  if (draftResult.rows.length === 0) {
    return { success: false, error: 'Draft not found.' };
  }
  const draft = draftResult.rows[0] as any;

  if (draft.approval_status !== 'on_hold') {
    return { success: false, error: `Draft in status "${draft.approval_status}" cannot be resumed. Must be "on_hold".` };
  }

  await db.execute(
    sql`UPDATE execution_drafts
        SET approval_status = 'pending_approval',
            hold_remarks = NULL,
            updated_at = NOW()
        WHERE id = ${draftId}`
  );

  await db.execute(
    sql`UPDATE tasks SET status = 'pending'
        WHERE id = ${draft.linked_task_id} AND status = 'on_hold'`
  );

  await logWorkflowEvent(draft.project_id, 'execution_draft.resumed', {
    doc_type: draft.doc_type,
    doc_number: draft.doc_number,
    resumed_by: userId,
  });

  return { success: true };
}

async function cascadeDOApproval(projectId: number, projectItemId: number, doDocNumber: string, userId: number) {
  const blocked = await db.execute(
    sql`SELECT id, doc_type, doc_number, project_item_id
        FROM execution_drafts
        WHERE project_id = ${projectId}
          AND project_item_id = ${projectItemId}
          AND dependency_doc_type = 'DO'
          AND dependency_status = 'blocked'
          AND applicable = true`
  );

  for (const row of blocked.rows) {
    const draft = row as any;
    await db.execute(
      sql`UPDATE execution_drafts
          SET dependency_status = 'met',
              approval_status = 'pending_approval',
              updated_at = NOW()
          WHERE id = ${draft.id}`
    );

    const docType = draft.doc_type as 'WO' | 'PO' | 'IO';
    const assignee = await resolveAssignee(projectId, PHASE_MAP[docType] || 'Engineering', userId);
    const taskId = await createEpcTask({
      projectId,
      entityType: 'execution_draft',
      recordId: draft.id,
      actionCode: 'approve',
      title: `Approve ${draft.doc_type} ${draft.doc_number}`,
      description: `Drawing Order ${doDocNumber} approved. ${draft.doc_type} ${draft.doc_number} is now ready for approval.`,
      assignedTo: assignee,
      createdBy: userId,
      priority: PRIORITY_MAP[docType] || 'High',
      dueDays: SLA_DAYS[docType] || 3,
    });

    if (taskId) {
      await db.execute(
        sql`UPDATE execution_drafts SET linked_task_id = ${taskId} WHERE id = ${draft.id}`
      );
    }

    await logWorkflowEvent(projectId, 'execution_draft.dependency_met', {
      doc_type: draft.doc_type,
      doc_number: draft.doc_number,
      dependency_doc_type: 'DO',
      dependency_doc_number: doDocNumber,
    });
  }
}

async function logWorkflowEvent(projectId: number, eventType: string, data: Record<string, any>) {
  try {
    await db.execute(
      sql`INSERT INTO project_workflow_events (project_id, event_type, event_data, created_at)
          VALUES (${projectId}, ${eventType}, ${JSON.stringify(data)}::jsonb, NOW())`
    );
  } catch (error) {
    console.error(`[ExecutionDrafts] Failed to log workflow event ${eventType}:`, error);
  }
}
