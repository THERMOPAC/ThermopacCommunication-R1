import { sql } from 'drizzle-orm';
import { db } from './db';
import { createNotification } from './notification-routes';

export interface EpcTaskParams {
  projectId: number;
  entityType: string;
  recordId: number;
  actionCode: string;
  title: string;
  description: string;
  assignedTo: number | null;
  createdBy: number;
  priority?: string;
  dueDays?: number;
  tx?: any;
}

export interface EpcAlertParams {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  priority?: string;
  category?: string;
  sourceType?: string;
  sourceId?: number;
  createdBy?: number;
}

function computeBusinessDayDue(days: number): string {
  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return date.toISOString().split('T')[0];
}

function buildAutomationKey(entityType: string, recordId: number, actionCode: string): string {
  return `[automation_key:epc:${entityType}:${recordId}:${actionCode}]`;
}

export async function createEpcTask(params: EpcTaskParams): Promise<number | null> {
  const {
    projectId, entityType, recordId, actionCode,
    title, description, assignedTo, createdBy,
    priority = 'High', dueDays = 3, tx,
  } = params;

  const automationKey = buildAutomationKey(entityType, recordId, actionCode);
  const executor = tx || db;

  try {
    const existing = await executor.execute(
      sql`SELECT id FROM tasks
          WHERE source_type = 'epc_automation'
            AND description LIKE ${'%' + automationKey + '%'}
            AND status NOT IN ('completed', 'obsolete')
          LIMIT 1`
    );

    if (existing.rows.length > 0) {
      console.log(`[EPC-Task] Idempotent skip: task already exists for ${automationKey}`);
      return (existing.rows[0] as any).id;
    }

    const dueDate = computeBusinessDayDue(dueDays);
    const fullDescription = `${description}\n\n${automationKey}`;
    const now = new Date().toISOString();
    const startDate = now.split('T')[0];

    const result = await executor.execute(
      sql`INSERT INTO tasks (title, description, status, priority, start_date, finish_date, due_date,
            assigned_to, created_by, created_at, source_type, source_id, source_agent, category)
          VALUES (${title}, ${fullDescription}, 'pending', ${priority}, ${startDate}, ${dueDate}, ${dueDate},
            ${assignedTo}, ${createdBy}, ${now}, 'epc_automation', ${recordId}, 'epc_lifecycle', 'EPC')
          RETURNING id`
    );

    const taskId = (result.rows[0] as any).id;
    console.log(`[EPC-Task] Created task #${taskId}: ${title} ${automationKey}`);
    return taskId;
  } catch (error) {
    console.error(`[EPC-Task] Error creating task for ${automationKey}:`, error);
    return null;
  }
}

export async function createEpcAlert(params: EpcAlertParams): Promise<void> {
  try {
    await createNotification({
      userId: params.userId,
      type: params.type || 'epc_lifecycle',
      title: params.title,
      message: params.message,
      link: params.link,
      priority: params.priority,
      category: params.category || 'epc',
      sourceType: params.sourceType || 'epc_automation',
      sourceId: params.sourceId,
      createdBy: params.createdBy,
    });
  } catch (error) {
    console.error(`[EPC-Alert] Error creating alert: ${params.title}`, error);
  }
}

export async function createEpcAlertMulti(recipients: number[], params: Omit<EpcAlertParams, 'userId'>): Promise<void> {
  for (const userId of recipients) {
    if (userId) {
      await createEpcAlert({ ...params, userId });
    }
  }
}

export async function markTasksObsolete(entityType: string, recordId: number, reason: string, tx?: any): Promise<number> {
  const automationKeyPattern = `%[automation_key:epc:${entityType}:${recordId}:%]%`;
  const executor = tx || db;

  try {
    const result = await executor.execute(
      sql`UPDATE tasks
          SET status = 'obsolete',
              description = description || ${'\n[obsolete_reason:' + reason + ']'},
              completed_at = ${new Date().toISOString()}
          WHERE source_type = 'epc_automation'
            AND description LIKE ${automationKeyPattern}
            AND status NOT IN ('completed', 'obsolete')
          RETURNING id`
    );
    const count = result.rows.length;
    if (count > 0) {
      console.log(`[EPC-Task] Marked ${count} task(s) obsolete for epc:${entityType}:${recordId} — reason: ${reason}`);
    }
    return count;
  } catch (error) {
    console.error(`[EPC-Task] Error marking tasks obsolete for epc:${entityType}:${recordId}:`, error);
    return 0;
  }
}

export async function resolveAssignee(
  projectId: number,
  phaseName: string,
  fallbackCreatedBy?: number,
  tx?: any
): Promise<number | null> {
  const executor = tx || db;

  try {
    const phaseResult = await executor.execute(
      sql`SELECT phase_lead_id FROM project_phases
          WHERE project_id = ${projectId} AND name ILIKE ${'%' + phaseName + '%'}
          LIMIT 1`
    );
    if (phaseResult.rows.length > 0) {
      const leadId = (phaseResult.rows[0] as any).phase_lead_id;
      if (leadId) return leadId;
    }

    const pmResult = await executor.execute(
      sql`SELECT manager_id FROM projects WHERE id = ${projectId}`
    );
    if (pmResult.rows.length > 0) {
      const managerId = (pmResult.rows[0] as any).manager_id;
      if (managerId) return managerId;
    }

    if (fallbackCreatedBy) return fallbackCreatedBy;

    return null;
  } catch (error) {
    console.error(`[EPC-Task] Error resolving assignee for project ${projectId}, phase ${phaseName}:`, error);
    return fallbackCreatedBy || null;
  }
}

export async function resolveProjectCode(projectId: number, tx?: any): Promise<string> {
  const executor = tx || db;
  try {
    const result = await executor.execute(
      sql`SELECT project_code FROM projects WHERE id = ${projectId}`
    );
    return (result.rows[0] as any)?.project_code || `Project #${projectId}`;
  } catch {
    return `Project #${projectId}`;
  }
}

export async function resolveManagerId(projectId: number, tx?: any): Promise<number | null> {
  const executor = tx || db;
  try {
    const result = await executor.execute(
      sql`SELECT manager_id FROM projects WHERE id = ${projectId}`
    );
    return (result.rows[0] as any)?.manager_id || null;
  } catch {
    return null;
  }
}
