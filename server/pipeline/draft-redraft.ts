import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getNextDocSeq } from '../doc-sequence-service';
import { createEpcTask, resolveAssignee } from '../epc-task-helpers';
import { ROUTING_MAP, SLA_DAYS, PRIORITY_MAP } from './pipeline-types';
import type { DraftDocType } from './pipeline-types';

export async function redraftFromRejected(
  draftId: number,
  userId: number,
  sourceDataOverrides?: Record<string, any>
): Promise<{ success: boolean; newDraftId?: number; error?: string }> {
  const draftResult = await db.execute(
    sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`
  );
  if (draftResult.rows.length === 0) {
    return { success: false, error: 'Draft not found.' };
  }
  const draft = draftResult.rows[0] as any;

  if (draft.approval_status !== 'rejected') {
    return { success: false, error: `Only rejected drafts can be re-drafted. Current status: "${draft.approval_status}".` };
  }

  const projResult = await db.execute(
    sql`SELECT code, fy_code, project_seq FROM projects WHERE id = ${draft.project_id}`
  );
  if (projResult.rows.length === 0) {
    return { success: false, error: 'Project not found.' };
  }
  const project = projResult.rows[0] as any;
  const docType = draft.doc_type as DraftDocType;

  let newDocNumber: string;
  if (docType === 'IO') {
    const isMake = (draft.source_data?.make_or_buy || '').toLowerCase() === 'make';
    const seq = await getNextDocSeq('IO', draft.project_id, db);
    const category = isMake ? 'M' : 'B';
    newDocNumber = `IO-${project.fy_code}-${project.project_seq}-${category}-${seq}`;
  } else {
    const seq = await getNextDocSeq(docType, draft.project_id, db);
    newDocNumber = `${project.code}-${docType}-${seq}`;
  }

  const mergedSourceData = sourceDataOverrides
    ? { ...draft.source_data, ...sourceDataOverrides }
    : draft.source_data;

  const result = await db.execute(
    sql`INSERT INTO execution_drafts
        (project_id, project_item_id, doc_type, applicable, doc_number,
         approval_status, activation_status, generated_by, generated_by_user_id,
         dependency_doc_type, dependency_status, source_data, parent_draft_id)
        VALUES (${draft.project_id}, ${draft.project_item_id}, ${draft.doc_type},
                true, ${newDocNumber},
                'pending_approval', 'not_activated',
                'user', ${userId},
                ${draft.dependency_doc_type}, ${draft.dependency_status === 'blocked' ? 'blocked' : draft.dependency_status},
                ${JSON.stringify(mergedSourceData)}::jsonb, ${draftId})
        RETURNING id`
  );
  const newDraftId = (result.rows[0] as any).id;

  const routing = ROUTING_MAP[docType as keyof typeof ROUTING_MAP] || { department: 'Projects', preferredRole: 'Senior Executive' };
  const assignee = await resolveAssignee(draft.project_id, routing.department, userId, undefined, routing.preferredRole);
  const taskId = await createEpcTask({
    projectId: draft.project_id,
    entityType: 'execution_draft',
    recordId: newDraftId,
    actionCode: 'approve',
    title: `Approve re-drafted ${docType} ${newDocNumber}`,
    description: `Re-drafted from rejected ${draft.doc_number}. Requires approval.`,
    assignedTo: assignee,
    createdBy: userId,
    priority: PRIORITY_MAP[docType] || 'High',
    dueDays: SLA_DAYS[docType] || 3,
  });

  if (taskId) {
    await db.execute(
      sql`UPDATE execution_drafts SET linked_task_id = ${taskId} WHERE id = ${newDraftId}`
    );
  }

  console.log(`[ExecutionDrafts] Re-drafted ${draft.doc_number} → ${newDocNumber} (draft #${newDraftId})`);
  return { success: true, newDraftId };
}
