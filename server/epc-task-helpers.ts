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
  entityType?: string;
  recordId?: number;
  actionCode?: string;
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
    if (params.entityType && params.recordId && params.actionCode) {
      const alertKey = buildAutomationKey(params.entityType, params.recordId, params.actionCode);
      const existing = await db.execute(
        sql`SELECT id FROM notifications
            WHERE user_id = ${params.userId}
              AND source_type = 'epc_automation'
              AND message LIKE ${'%' + alertKey + '%'}
              AND status IN ('new', 'unread')
            LIMIT 1`
      );
      if (existing.rows.length > 0) {
        console.log(`[EPC-Alert] Idempotent skip: alert already exists for user ${params.userId}, ${alertKey}`);
        return;
      }
      params.message = `${params.message}\n${alertKey}`;
    }

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
  departmentName: string,
  fallbackCreatedBy?: number,
  tx?: any,
  preferredRole?: string
): Promise<number | null> {
  const executor = tx || db;
  const AUTHORIZED_ROLES = ['Senior Executive', 'Manager', 'Senior Manager', 'General Manager', 'Superuser'];

  try {
    if (preferredRole && AUTHORIZED_ROLES.includes(preferredRole)) {
      const exact = await executor.execute(
        sql`SELECT id, username, role FROM users
            WHERE department = ${departmentName}
              AND role = ${preferredRole}
              AND is_active = true
            LIMIT 1`
      );
      if (exact.rows.length > 0) {
        const u = exact.rows[0] as any;
        console.log(`[EPC-Task] Assignee resolved: ${u.username} (${u.role}) from dept ${departmentName} [preferred match]`);
        return u.id;
      }
    }

    if (preferredRole && !AUTHORIZED_ROLES.includes(preferredRole)) {
      console.log(`[EPC-Task] Preferred role ${preferredRole} in ${departmentName} cannot approve — auto-escalating`);
    }

    const deptMgr = await executor.execute(
      sql`SELECT id, username, role FROM users
          WHERE department = ${departmentName}
            AND role IN ('Manager', 'Senior Manager', 'General Manager', 'Superuser')
            AND is_active = true
          ORDER BY CASE role
            WHEN 'Manager' THEN 1
            WHEN 'Senior Manager' THEN 2
            WHEN 'General Manager' THEN 3
            WHEN 'Superuser' THEN 4
          END
          LIMIT 1`
    );
    if (deptMgr.rows.length > 0) {
      const mgr = deptMgr.rows[0] as any;
      console.log(`[EPC-Task] Assignee resolved: ${mgr.username} (${mgr.role}) from dept ${departmentName} [escalated from ${preferredRole || 'none'}]`);
      return mgr.id;
    }

    const pmResult = await executor.execute(
      sql`SELECT manager_id FROM projects WHERE id = ${projectId}`
    );
    if (pmResult.rows.length > 0) {
      const managerId = (pmResult.rows[0] as any).manager_id;
      if (managerId) {
        console.log(`[EPC-Task] Dept ${departmentName} has no authorized approver — falling back to Project Manager (user ${managerId})`);
        return managerId;
      }
    }

    const gmResult = await executor.execute(
      sql`SELECT id FROM users
          WHERE role IN ('General Manager', 'Superuser')
            AND is_active = true
          ORDER BY CASE role WHEN 'General Manager' THEN 1 WHEN 'Superuser' THEN 2 END
          LIMIT 1`
    );
    if (gmResult.rows.length > 0) {
      const gmId = (gmResult.rows[0] as any).id;
      console.log(`[EPC-Task] No PM for project ${projectId} — falling back to higher authority (user ${gmId})`);
      return gmId;
    }

    if (fallbackCreatedBy) return fallbackCreatedBy;

    return null;
  } catch (error) {
    console.error(`[EPC-Task] Error resolving assignee for project ${projectId}, dept ${departmentName}:`, error);
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
