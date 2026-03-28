import { agentEventBus } from './agents/framework/event-bus';
import { db } from './db';
import { 
  projectKeyStages, 
  projectWorkflowEvents,
  tasks as tasksTable,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { AgentEvent } from './agents/framework/types';

const EPC_MILESTONES = [
  { stageNumber: 1, name: 'Order Acknowledgement', phase: 'Engineering & Design' },
  { stageNumber: 2, name: 'GA Drawing Approval', phase: 'Engineering & Design' },
  { stageNumber: 3, name: 'BOM Finalization', phase: 'Engineering & Design' },
  { stageNumber: 4, name: 'Material Procurement Complete', phase: 'Procurement' },
  { stageNumber: 5, name: 'Production Start', phase: 'Production / Manufacturing' },
  { stageNumber: 6, name: 'Fabrication Complete', phase: 'Production / Manufacturing' },
  { stageNumber: 7, name: 'Final Inspection & Testing', phase: 'Quality Assurance' },
  { stageNumber: 8, name: 'Dispatch Readiness', phase: 'Dispatch & Shipping' },
  { stageNumber: 9, name: 'Dispatch Complete', phase: 'Dispatch & Shipping' },
  { stageNumber: 10, name: 'Commissioning Complete', phase: 'Project Commissioning' },
  { stageNumber: 11, name: 'Customer Handover', phase: 'Project Commissioning' },
  { stageNumber: 12, name: 'Warranty Start', phase: 'After-Sales & Warranty' },
];

const KICKOFF_TASKS = [
  { title: 'Prepare Project Execution Plan', phase: 'Engineering & Design' },
  { title: 'Define Project Schedule & Milestones', phase: 'Engineering & Design' },
  { title: 'Initiate GA Drawing', phase: 'Engineering & Design' },
  { title: 'Prepare Preliminary BOM', phase: 'Engineering & Design' },
  { title: 'Identify Critical Procurement Items', phase: 'Procurement' },
  { title: 'Prepare Quality Assurance Plan (QAP)', phase: 'Quality Assurance' },
];

const STARTER_DELIVERABLES = [
  { name: 'General Arrangement Drawing', phase: 'Engineering & Design' },
  { name: 'Bill of Materials', phase: 'Engineering & Design' },
  { name: 'Project Execution Plan', phase: 'Engineering & Design' },
  { name: 'Quality Assurance Plan', phase: 'Quality Assurance' },
];

async function handleProjectKickoff(event: AgentEvent): Promise<void> {
  const { projectId, newStatus, oldStatus, changedBy, projectCode, projectName } = event.payload;

  if (newStatus !== 'active') return;

  if (oldStatus === 'active') {
    console.log(`[EPC-Kickoff] Project ${projectId} already active, skipping`);
    return;
  }

  console.log(`[EPC-Kickoff] Starting kickoff for project ${projectId} (${projectCode})`);

  try {
    await db.transaction(async (tx) => {

      const existingMilestones = await tx
        .select({ id: projectKeyStages.id })
        .from(projectKeyStages)
        .where(eq(projectKeyStages.project_id, projectId))
        .limit(1);

      if (existingMilestones.length > 0) {
        console.log(`[EPC-Kickoff] Milestones already exist for project ${projectId}, skipping`);
        return;
      }

      const existingTasks = await tx.execute(
        sql`SELECT id FROM tasks WHERE source_type = 'automation' AND source_agent = 'epc_kickoff' AND source_id = ${projectId} LIMIT 1`
      );

      if (existingTasks.rows.length > 0) {
        console.log(`[EPC-Kickoff] Kickoff tasks already exist for project ${projectId}, skipping`);
        return;
      }

      const existingDeliverables = await tx.execute(
        sql`SELECT id FROM deliverables WHERE project_id = ${projectId} LIMIT 1`
      );

      if (existingDeliverables.rows.length > 0) {
        console.log(`[EPC-Kickoff] Deliverables already exist for project ${projectId}, skipping`);
        return;
      }

      const phases = await tx.execute(
        sql`SELECT id, name, start_date, target_end_date, phase_lead_id FROM project_phases WHERE project_id = ${projectId} ORDER BY "order"`
      );
      const phaseMap = new Map<string, { id: number; startDate: string; endDate: string; leadId: number | null }>();
      for (const p of phases.rows as any[]) {
        phaseMap.set(p.name, { id: p.id, startDate: p.start_date, endDate: p.target_end_date, leadId: p.phase_lead_id });
      }

      const project = await tx.execute(
        sql`SELECT manager_id, start_date FROM projects WHERE id = ${projectId}`
      );
      const managerId = (project.rows[0] as any)?.manager_id;
      const projectStartDate = (project.rows[0] as any)?.start_date;

      console.log(`[EPC-Kickoff] Creating 12 milestones for project ${projectId}`);
      for (const milestone of EPC_MILESTONES) {
        await tx.insert(projectKeyStages).values({
          project_id: projectId,
          stage_number: milestone.stageNumber,
          stage_name: milestone.name,
          phase: milestone.phase,
          description: `EPC milestone: ${milestone.name}`,
          is_completed: false,
        });
      }

      console.log(`[EPC-Kickoff] Creating ${KICKOFF_TASKS.length} kickoff tasks for project ${projectId}`);
      const now = new Date().toISOString();
      const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      for (const taskDef of KICKOFF_TASKS) {
        const phaseInfo = phaseMap.get(taskDef.phase);
        const assignTo = phaseInfo?.leadId || managerId;
        const dueDate = phaseInfo?.endDate?.split('T')[0] || twoWeeksLater;

        const [newTask] = await tx.insert(tasksTable).values({
          title: taskDef.title,
          description: `Auto-created kickoff task for ${projectName || projectCode}`,
          status: 'pending',
          priority: 'High',
          assignedTo: assignTo,
          createdBy: changedBy || managerId,
          createdAt: now,
          startDate: projectStartDate || now.split('T')[0],
          finishDate: dueDate,
          dueDate: dueDate,
          sourceType: 'automation',
          sourceId: projectId,
          sourceAgent: 'epc_kickoff',
        }).returning();

        if (phaseInfo) {
          await tx.execute(
            sql`INSERT INTO project_tasks (task_id, project_id, phase_id) VALUES (${newTask.id}, ${projectId}, ${phaseInfo.id})`
          );
        } else {
          await tx.execute(
            sql`INSERT INTO project_tasks (task_id, project_id) VALUES (${newTask.id}, ${projectId})`
          );
        }
      }

      console.log(`[EPC-Kickoff] Creating ${STARTER_DELIVERABLES.length} starter deliverables for project ${projectId}`);
      for (const delivDef of STARTER_DELIVERABLES) {
        const phaseInfo = phaseMap.get(delivDef.phase);
        if (!phaseInfo) {
          console.warn(`[EPC-Kickoff] Phase "${delivDef.phase}" not found for deliverable "${delivDef.name}", skipping`);
          continue;
        }
        const dueDate = phaseInfo.endDate?.split('T')[0] || twoWeeksLater;

        await tx.execute(
          sql`INSERT INTO deliverables (project_id, phase_id, name, description, due_date, status, assigned_to)
              VALUES (${projectId}, ${phaseInfo.id}, ${delivDef.name}, ${'Auto-created kickoff deliverable for ' + (projectName || projectCode)}, ${dueDate}, 'pending', ${phaseInfo.leadId || managerId})`
        );
      }

      await tx.insert(projectWorkflowEvents).values({
        projectId,
        eventName: 'project.kickoff.initialized',
        eventPayload: {
          projectId,
          projectCode,
          projectName,
          milestonesCreated: EPC_MILESTONES.length,
          tasksCreated: KICKOFF_TASKS.length,
          deliverablesCreated: STARTER_DELIVERABLES.length,
          triggeredBy: changedBy,
        },
        emittedBy: 'epc-kickoff-subscriber',
        emittedAt: new Date(),
        processed: true,
        processedAt: new Date(),
      });

      console.log(`[EPC-Kickoff] Kickoff complete for project ${projectId}: 12 milestones, ${KICKOFF_TASKS.length} tasks, ${STARTER_DELIVERABLES.length} deliverables`);
    });
  } catch (err) {
    console.error(`[EPC-Kickoff] Failed to initialize kickoff for project ${projectId}:`, err);
  }
}

export function registerEpcKickoffSubscriber(): void {
  agentEventBus.subscribe('project.status_changed', handleProjectKickoff);
  console.log('[EPC-Kickoff] Registered kickoff subscriber for project.status_changed');
}
