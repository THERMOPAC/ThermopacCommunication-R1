import { agentEventBus } from './agents/framework/event-bus';
import { db } from './db';
import { projectWorkflowEvents, tasks as tasksTable } from '@shared/schema';
import { sql } from 'drizzle-orm';
import type { AgentEvent } from './agents/framework/types';

const SOURCE_AGENT = 'project_item_planning';
const SOURCE_TYPE = 'automation';
const LOG_PREFIX = '[ItemPlanning]';

async function getProjectContext(projectId: number): Promise<{
  managerId: number | null;
  procurementLeadId: number | null;
  productionLeadId: number | null;
  procurementPhaseId: number | null;
  productionPhaseId: number | null;
  projectCode: string | null;
}> {
  const project = await db.execute(
    sql`SELECT manager_id, project_code FROM projects WHERE id = ${projectId}`
  );
  const managerId = (project.rows[0] as any)?.manager_id || null;
  const projectCode = (project.rows[0] as any)?.project_code || null;

  const phases = await db.execute(
    sql`SELECT id, name, phase_lead_id FROM project_phases WHERE project_id = ${projectId} ORDER BY "order"`
  );

  let procurementLeadId: number | null = null;
  let productionLeadId: number | null = null;
  let procurementPhaseId: number | null = null;
  let productionPhaseId: number | null = null;

  for (const p of phases.rows as any[]) {
    if (p.name === 'Procurement') {
      procurementLeadId = p.phase_lead_id;
      procurementPhaseId = p.id;
    }
    if (p.name === 'Production / Manufacturing') {
      productionLeadId = p.phase_lead_id;
      productionPhaseId = p.id;
    }
  }

  return { managerId, procurementLeadId, productionLeadId, procurementPhaseId, productionPhaseId, projectCode };
}

async function getMasterItemClassification(masterItemId: number): Promise<string | null> {
  const result = await db.execute(
    sql`SELECT make_or_buy FROM master_items WHERE id = ${masterItemId}`
  );
  return (result.rows[0] as any)?.make_or_buy || null;
}

async function getItemDescription(projectItemId: number): Promise<string> {
  const result = await db.execute(
    sql`SELECT mi.item_code, mi.description FROM project_items pi JOIN master_items mi ON pi.item_id = mi.id WHERE pi.id = ${projectItemId}`
  );
  const row = result.rows[0] as any;
  if (row) return `${row.item_code} - ${row.description || ''}`.trim();
  return `Item #${projectItemId}`;
}

async function duplicateTaskExists(
  projectId: number,
  projectItemId: number,
  taskContext: string
): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT id FROM tasks 
        WHERE source_type = ${SOURCE_TYPE} 
          AND source_agent = ${SOURCE_AGENT} 
          AND source_id = ${projectId}
          AND description LIKE ${'%[item:' + projectItemId + ']%'}
          AND description LIKE ${'%[ctx:' + taskContext + ']%'}
          AND status != 'Completed'
          AND status != 'Cancelled'
          AND is_archived = false
        LIMIT 1`
  );
  return result.rows.length > 0;
}

async function createPlanningTask(params: {
  projectId: number;
  projectItemId: number;
  title: string;
  taskContext: string;
  assignTo: number | null;
  changedBy: number | null;
  phaseId: number | null;
  itemDesc: string;
}): Promise<number | null> {
  const { projectId, projectItemId, title, taskContext, assignTo, changedBy, phaseId, itemDesc } = params;

  const exists = await duplicateTaskExists(projectId, projectItemId, taskContext);
  if (exists) {
    console.log(`${LOG_PREFIX} Duplicate task skipped: [ctx:${taskContext}] for item ${projectItemId} in project ${projectId}`);
    return null;
  }

  const now = new Date().toISOString();
  const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const description = `Auto-created planning task for ${itemDesc}. [item:${projectItemId}] [ctx:${taskContext}]`;

  const [newTask] = await db.insert(tasksTable).values({
    title,
    description,
    status: 'pending',
    priority: 'High',
    assignedTo: assignTo,
    createdBy: changedBy || assignTo,
    createdAt: now,
    startDate: now.split('T')[0],
    finishDate: twoWeeksLater,
    dueDate: twoWeeksLater,
    sourceType: SOURCE_TYPE,
    sourceId: projectId,
    sourceAgent: SOURCE_AGENT,
  }).returning();

  if (phaseId) {
    await db.execute(
      sql`INSERT INTO project_tasks (task_id, project_id, phase_id) VALUES (${newTask.id}, ${projectId}, ${phaseId})`
    );
  } else {
    await db.execute(
      sql`INSERT INTO project_tasks (task_id, project_id) VALUES (${newTask.id}, ${projectId})`
    );
  }

  console.log(`${LOG_PREFIX} Created task "${title}" (id=${newTask.id}) for item ${projectItemId} in project ${projectId}`);
  return newTask.id;
}

async function logSubscriberEvent(
  projectId: number,
  eventName: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    await db.insert(projectWorkflowEvents).values({
      projectId,
      eventName,
      eventPayload: payload,
      emittedBy: SOURCE_AGENT,
      emittedAt: new Date(),
      processed: true,
      processedAt: new Date(),
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to log event ${eventName}:`, err);
  }
}

async function handleItemAdded(event: AgentEvent): Promise<void> {
  const { projectId, projectItemId, masterItemId, changedBy } = event.payload;
  if (!projectId || !projectItemId || !masterItemId) return;

  try {
    const classification = await getMasterItemClassification(masterItemId);
    const ctx = await getProjectContext(projectId);
    const itemDesc = await getItemDescription(projectItemId);

    let taskId: number | null = null;
    let taskContext: string;

    if (classification === 'Buy') {
      taskContext = 'procurement_plan';
      taskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Plan procurement for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext,
        assignTo: ctx.procurementLeadId || ctx.managerId,
        changedBy,
        phaseId: ctx.procurementPhaseId,
        itemDesc,
      });
    } else if (classification === 'Make') {
      taskContext = 'production_plan';
      taskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Plan manufacturing for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext,
        assignTo: ctx.productionLeadId || ctx.managerId,
        changedBy,
        phaseId: ctx.productionPhaseId,
        itemDesc,
      });
    } else {
      taskContext = 'classification_review';
      taskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Review Make/Buy classification for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext,
        assignTo: ctx.managerId,
        changedBy,
        phaseId: null,
        itemDesc,
      });
    }

    if (taskId) {
      await logSubscriberEvent(projectId, 'project_item_planning.task_created', {
        trigger: 'project.item.added',
        projectItemId,
        classification: classification || 'unclassified',
        taskId,
        taskContext,
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error handling item.added for item ${projectItemId}:`, err);
  }
}

async function handleItemUpdated(event: AgentEvent): Promise<void> {
  const { projectId, projectItemId, masterItemId, changedBy } = event.payload;
  if (!projectId || !projectItemId || !masterItemId) return;

  try {
    const classification = await getMasterItemClassification(masterItemId);
    const ctx = await getProjectContext(projectId);
    const itemDesc = await getItemDescription(projectItemId);

    let taskId: number | null = null;
    let taskContext: string;

    if (classification === 'Buy') {
      taskContext = 'procurement_plan';
      taskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Plan procurement for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext,
        assignTo: ctx.procurementLeadId || ctx.managerId,
        changedBy,
        phaseId: ctx.procurementPhaseId,
        itemDesc,
      });
    } else if (classification === 'Make') {
      taskContext = 'production_plan';
      taskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Plan manufacturing for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext,
        assignTo: ctx.productionLeadId || ctx.managerId,
        changedBy,
        phaseId: ctx.productionPhaseId,
        itemDesc,
      });
    } else {
      taskContext = 'classification_review';
      taskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Review Make/Buy classification for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext,
        assignTo: ctx.managerId,
        changedBy,
        phaseId: null,
        itemDesc,
      });
    }

    if (taskId) {
      await logSubscriberEvent(projectId, 'project_item_planning.task_created', {
        trigger: 'project.item.updated',
        projectItemId,
        classification: classification || 'unclassified',
        taskId,
        taskContext,
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error handling item.updated for item ${projectItemId}:`, err);
  }
}

async function handleClassificationChanged(event: AgentEvent): Promise<void> {
  const { projectId, projectItemId, masterItemId, oldClassification, newClassification, changedBy } = event.payload;
  if (!projectId || !projectItemId) return;

  try {
    const ctx = await getProjectContext(projectId);
    const itemDesc = await getItemDescription(projectItemId);

    const reviewTaskId = await createPlanningTask({
      projectId,
      projectItemId,
      title: `Revalidate downstream planning after classification change: ${itemDesc} (${oldClassification} → ${newClassification})`,
      taskContext: `revalidate_${oldClassification}_to_${newClassification}`,
      assignTo: ctx.managerId,
      changedBy,
      phaseId: null,
      itemDesc,
    });

    let newPlanTaskId: number | null = null;

    if (newClassification === 'Buy') {
      newPlanTaskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Plan procurement for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext: 'procurement_plan',
        assignTo: ctx.procurementLeadId || ctx.managerId,
        changedBy,
        phaseId: ctx.procurementPhaseId,
        itemDesc,
      });
    } else if (newClassification === 'Make') {
      newPlanTaskId = await createPlanningTask({
        projectId,
        projectItemId,
        title: `Plan manufacturing for ${itemDesc} (${ctx.projectCode || 'Project'})`,
        taskContext: 'production_plan',
        assignTo: ctx.productionLeadId || ctx.managerId,
        changedBy,
        phaseId: ctx.productionPhaseId,
        itemDesc,
      });
    }

    await logSubscriberEvent(projectId, 'project_item_planning.classification_change_handled', {
      trigger: 'project.item.classification_changed',
      projectItemId,
      oldClassification,
      newClassification,
      reviewTaskId,
      newPlanTaskId,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Error handling classification_changed for item ${projectItemId}:`, err);
  }
}

async function handleItemRemoved(event: AgentEvent): Promise<void> {
  const { projectId, projectItemId, masterItemId, changedBy, deletionBlocked, downstreamDependencies } = event.payload;
  if (!projectId || !projectItemId) return;

  try {
    if (!deletionBlocked) {
      await logSubscriberEvent(projectId, 'project_item_planning.item_removed', {
        trigger: 'project.item.removed',
        projectItemId,
        masterItemId,
        deletionBlocked: false,
        removedBy: changedBy,
      });
      console.log(`${LOG_PREFIX} Item ${projectItemId} removed cleanly from project ${projectId}`);
      return;
    }

    const ctx = await getProjectContext(projectId);
    const itemDesc = await getItemDescription(projectItemId);

    const taskId = await createPlanningTask({
      projectId,
      projectItemId,
      title: `Review impact of project item deletion: ${itemDesc} (${ctx.projectCode || 'Project'})`,
      taskContext: 'deletion_impact_review',
      assignTo: ctx.managerId,
      changedBy,
      phaseId: null,
      itemDesc,
    });

    if (taskId) {
      await logSubscriberEvent(projectId, 'project_item_planning.deletion_blocked', {
        trigger: 'project.item.removed',
        projectItemId,
        masterItemId,
        deletionBlocked: true,
        downstreamDependencies,
        impactReviewTaskId: taskId,
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error handling item.removed for item ${projectItemId}:`, err);
  }
}

export function registerProjectItemPlanningSubscriber(): void {
  agentEventBus.subscribe('project.item.added', handleItemAdded);
  agentEventBus.subscribe('project.item.updated', handleItemUpdated);
  agentEventBus.subscribe('project.item.classification_changed', handleClassificationChanged);
  agentEventBus.subscribe('project.item.removed', handleItemRemoved);
  console.log(`${LOG_PREFIX} Registered planning subscriber for project.item.added, project.item.updated, project.item.classification_changed, project.item.removed`);
}
