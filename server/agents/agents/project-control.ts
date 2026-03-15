import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const SOURCE_AGENT = 'project_controller';
const AGENT_KEY = 'project_control';

const DEFAULT_SETTINGS = {
  wo_overdue_threshold_days: 7,
  wo_critical_overdue_days: 90,
  wo_high_overdue_days: 30,
  project_deadline_warning_days: 14,
  project_at_risk_completion_pct: 80,
  design_review_overdue_days: 3,
  design_assignment_overdue_days: 7,
  drawing_no_assignee_alert: true,
  transmittal_no_response_days: 7,
};

type ProjectSettings = typeof DEFAULT_SETTINGS;

async function getSettings(): Promise<ProjectSettings> {
  try {
    const result = await db.execute(sql`
      SELECT config FROM agent_registry WHERE agent_key = ${AGENT_KEY} LIMIT 1
    `);
    const config = (result.rows as any[])[0]?.config || {};
    return { ...DEFAULT_SETTINGS, ...config };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function makeFingerprint(findingType: string, entityKey: string): string {
  return `[fp:pc_${findingType}:${entityKey}]`;
}

async function hasOpenAgentTask(fingerprint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status NOT IN ('completed', 'cancelled')
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closedCount = 0;

  const openWOTasks = await db.execute(sql`
    SELECT id, category FROM tasks
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'cancelled')
      AND category LIKE '%[fp:pc_wo_overdue:%'
  `);
  for (const row of (openWOTasks.rows as any[])) {
    const match = row.category?.match(/\[fp:pc_wo_overdue:wo:(\d+)\]/);
    if (!match) continue;
    const woId = parseInt(match[1]);
    const woCheck = await db.execute(sql`
      SELECT status FROM work_orders WHERE id = ${woId}
    `);
    const woStatus = (woCheck.rows as any[])[0]?.status;
    if (woStatus === 'completed' || woStatus === 'cancelled') {
      await db.execute(sql`
        UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${row.id}
      `);
      closedCount++;
    }
  }

  const openReviewTasks = await db.execute(sql`
    SELECT id, category FROM tasks
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'cancelled')
      AND category LIKE '%[fp:pc_review_overdue:%'
  `);
  for (const row of (openReviewTasks.rows as any[])) {
    const match = row.category?.match(/\[fp:pc_review_overdue:review:(\d+)\]/);
    if (!match) continue;
    const reviewId = parseInt(match[1]);
    const revCheck = await db.execute(sql`
      SELECT status FROM design_reviews WHERE id = ${reviewId}
    `);
    const revStatus = (revCheck.rows as any[])[0]?.status;
    if (revStatus === 'Approved' || revStatus === 'Approved with Comments' || revStatus === 'Rejected') {
      await db.execute(sql`
        UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${row.id}
      `);
      closedCount++;
    }
  }

  return closedCount;
}


export class ProjectControlAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Project Control Agent';
  category = 'operations';

  getSubscribedEvents(): string[] {
    return [
      'project.project.status_changed',
      'project.work_order.status_changed',
      'project.milestone.overdue',
      'design.review.status_changed',
      'design.drawing.status_changed',
    ];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let recommendationsCount = 0;
    let queriesRun = 0;
    let autoExecutedCount = 0;
    let autoClosedCount = 0;
    const autoExecuteQueue: number[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    const settings = await getSettings();

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) console.log(`[ProjectControl] Auto-closed ${autoClosedCount} resolved tasks`);
    } catch (err: any) {
      console.error(`[ProjectControl] Auto-close error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // P1: PROJECT HEALTH — Overdue Work Orders
    // ══════════════════════════════════════════════════════════════════
    try {
      const projectRows = await db.execute(sql`SELECT * FROM vw_agent_project_health`);
      queriesRun++;
      const woRows = await db.execute(sql`
        SELECT * FROM vw_agent_overdue_work_orders WHERE days_overdue >= ${settings.wo_overdue_threshold_days} ORDER BY days_overdue DESC
      `);
      queriesRun++;

      const projects = (projectRows.rows || []) as any[];
      const overdueWOs = (woRows.rows || []) as any[];

      const wosByProject: Record<string, any[]> = {};
      for (const wo of overdueWOs) {
        const key = wo.project_name || 'Unknown';
        if (!wosByProject[key]) wosByProject[key] = [];
        wosByProject[key].push(wo);
      }

      for (const project of projects) {
        const projectWOs = wosByProject[project.project_name] || [];
        if (projectWOs.length === 0 && Number(project.overdue_work_orders) === 0) continue;

        const overdueCount = projectWOs.length || Number(project.overdue_work_orders);
        const maxDaysOverdue = projectWOs.length > 0
          ? Math.max(...projectWOs.map((w: any) => Number(w.days_overdue)))
          : 0;
        const totalWOs = Number(project.total_work_orders || 0);
        const completionPct = Number(project.wo_completion_pct || 0);
        const managerId = project.manager_id ? Number(project.manager_id) : null;

        const severity = maxDaysOverdue >= settings.wo_critical_overdue_days ? 'critical' as const :
                         maxDaysOverdue >= settings.wo_high_overdue_days ? 'high' as const :
                         overdueCount >= 5 ? 'high' as const :
                         overdueCount >= 2 ? 'medium' as const : 'low' as const;

        const topWOs = projectWOs.sort((a: any, b: any) => Number(b.days_overdue) - Number(a.days_overdue)).slice(0, 5);
        const topWOsList = topWOs.map((w: any) =>
          `  • ${w.work_order_number}: "${w.title}" (${w.days_overdue} days overdue)`
        ).join('\n');

        const overduePct = totalWOs > 0 ? Math.round((overdueCount / totalWOs) * 100) : 0;

        const description = [
          `Project "${project.project_name}" has ${overdueCount} overdue work orders out of ${totalWOs} total.`,
          `Completion: ${completionPct}%. Worst overdue: ${maxDaysOverdue} days.`,
          topWOs.length > 0 ? `\nTop overdue work orders:\n${topWOsList}` : '',
        ].filter(Boolean).join('\n');

        const fp = makeFingerprint('wo_overdue', `project:${project.id}`);
        const findingResult = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `Project ${project.project_number || project.project_name}: ${overdueCount} overdue WOs (worst: ${maxDaysOverdue}d)`,
          description,
          logicType: 'rule_based',
          dataSnapshot: { projectId: project.id, projectName: project.project_name, overdueCount, maxDaysOverdue, totalWOs, completionPct },
          relatedEntityType: 'project',
          relatedEntityId: String(project.id),
          companyName: project.company_name || '',
        });
        if (!findingResult.isDuplicate) findingsCount++;

        for (const wo of projectWOs) {
          const woFp = makeFingerprint('wo_overdue', `wo:${wo.id}`);
          if (await hasOpenAgentTask(woFp)) continue;

          const assignTo = wo.supervisor_id ? Number(wo.supervisor_id) : (managerId || 3);
          const rec = await recommendationManager.createRecommendation({
            findingId: findingResult.findingId,
            title: `[Project] WO overdue ${wo.days_overdue}d: ${wo.work_order_number} — ${wo.title}`,
            actionType: 'create_task',
            rationale: `Work order ${wo.work_order_number} in project "${project.project_name}" is ${wo.days_overdue} days overdue. Needs immediate attention.`,
            actionPayload: {
              title: `[Project] Review overdue WO: ${wo.work_order_number} — "${wo.title}" (${wo.days_overdue}d overdue)`,
              description: `Work order ${wo.work_order_number} in project "${project.project_name}" is overdue by ${wo.days_overdue} days.\nStatus: ${wo.status}\nPlanned end: ${wo.planned_end_date || 'N/A'}\n\nPlease review and update status or escalate blockers.`,
              assignedTo: assignTo,
              priority: Number(wo.days_overdue) >= settings.wo_high_overdue_days ? 'High' : 'Medium',
              category: `Project ${woFp}`,
            },
            actionCategory: 'task_creation',
            priority: severity,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // P2: Projects at risk — near deadline with low completion
      for (const project of projects) {
        if (!project.target_end_date) continue;
        const targetDate = new Date(project.target_end_date);
        const daysUntil = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const completionPct = Number(project.wo_completion_pct || 0);

        if (daysUntil <= settings.project_deadline_warning_days && daysUntil > -30 && completionPct < settings.project_at_risk_completion_pct) {
          const fp = makeFingerprint('project_at_risk', `project:${project.id}`);
          const severity = daysUntil <= 0 ? 'critical' as const : daysUntil <= 7 ? 'high' as const : 'medium' as const;

          const findingResult = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity,
            title: `Project ${project.project_number || project.project_name} at risk — ${daysUntil <= 0 ? Math.abs(daysUntil) + 'd PAST deadline' : daysUntil + 'd to deadline'}, ${completionPct}% complete`,
            description: `Project "${project.project_name}" ${daysUntil <= 0 ? 'is ' + Math.abs(daysUntil) + ' days PAST its deadline' : 'is due in ' + daysUntil + ' days'} but only ${completionPct}% of work orders are completed.`,
            logicType: 'rule_based',
            dataSnapshot: { ...project, daysUntil },
            relatedEntityType: 'project',
            relatedEntityId: String(project.id),
            companyName: project.company_name || '',
          });
          if (!findingResult.isDuplicate) findingsCount++;

          if (!await hasOpenAgentTask(fp)) {
            const managerId = project.manager_id ? Number(project.manager_id) : 3;
            const rec = await recommendationManager.createRecommendation({
              findingId: findingResult.findingId,
              title: `[Project] DEADLINE RISK: ${project.project_name} — ${daysUntil <= 0 ? 'OVERDUE' : daysUntil + 'd left'}, ${completionPct}% done`,
              actionType: 'create_task',
              rationale: `Project is ${daysUntil <= 0 ? 'past its deadline' : 'approaching its deadline in ' + daysUntil + ' days'} with only ${completionPct}% completion. Project manager needs to review resource allocation and priorities.`,
              actionPayload: {
                title: `[Project] DEADLINE ALERT: ${project.project_name} — ${daysUntil <= 0 ? Math.abs(daysUntil) + 'd OVERDUE' : daysUntil + 'd remaining'}, ${completionPct}% complete`,
                description: `Project "${project.project_name}" (${project.project_number})\nTarget end date: ${project.target_end_date}\n${daysUntil <= 0 ? 'OVERDUE by ' + Math.abs(daysUntil) + ' days' : daysUntil + ' days remaining'}\nCompletion: ${completionPct}%\nOverdue WOs: ${project.overdue_work_orders}\n\nReview resource allocation, reprioritize work orders, and update timeline if needed.`,
                assignedTo: managerId,
                priority: 'High',
                category: `Project ${fp}`,
              },
              actionCategory: 'task_creation',
              priority: severity,
              confidence: 0.95,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // P3: Work orders with cost overrun
      const costOverrunRows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.estimated_cost, wo.actual_cost,
          wo.project_id, p.name as project_name, wo.supervisor_id, p.manager_id,
          ROUND(((wo.actual_cost - wo.estimated_cost) / NULLIF(wo.estimated_cost, 0) * 100)::numeric, 1) as overrun_pct
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.estimated_cost > 0 AND wo.actual_cost > wo.estimated_cost
          AND ((wo.actual_cost - wo.estimated_cost) / NULLIF(wo.estimated_cost, 0) * 100) >= 20
        ORDER BY overrun_pct DESC
      `);
      queriesRun++;

      for (const wo of (costOverrunRows.rows || []) as any[]) {
        const fp = makeFingerprint('wo_cost_overrun', `wo:${wo.id}`);
        const overrunPct = Number(wo.overrun_pct);
        const severity = overrunPct >= 100 ? 'critical' as const : overrunPct >= 50 ? 'high' as const : 'medium' as const;

        const findingResult = await findingManager.createFinding({
          findingType: 'threshold_breach',
          severity,
          title: `WO ${wo.work_order_number} cost overrun ${overrunPct}% — ${wo.title}`,
          description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" has a cost overrun of ${overrunPct}%.\nEstimated: ${wo.estimated_cost}, Actual: ${wo.actual_cost}.`,
          logicType: 'rule_based',
          dataSnapshot: { woId: wo.id, woNumber: wo.work_order_number, estimatedCost: wo.estimated_cost, actualCost: wo.actual_cost, overrunPct },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!findingResult.isDuplicate) findingsCount++;

        if (!await hasOpenAgentTask(fp)) {
          const assignTo = wo.supervisor_id ? Number(wo.supervisor_id) : (wo.manager_id ? Number(wo.manager_id) : 3);
          const rec = await recommendationManager.createRecommendation({
            findingId: findingResult.findingId,
            title: `[Project] Cost overrun ${overrunPct}%: ${wo.work_order_number}`,
            actionType: 'create_task',
            rationale: `Work order ${wo.work_order_number} has exceeded its budget by ${overrunPct}%. Review expenditure and take corrective action.`,
            actionPayload: {
              title: `[Project] Cost review: ${wo.work_order_number} — ${overrunPct}% over budget`,
              description: `Work order "${wo.title}" in project "${wo.project_name}"\nEstimated cost: ${wo.estimated_cost}\nActual cost: ${wo.actual_cost}\nOverrun: ${overrunPct}%\n\nReview expenditure breakdown and identify cost-saving measures.`,
              assignedTo: assignTo,
              priority: overrunPct >= 50 ? 'High' : 'Medium',
              category: `Project ${fp}`,
            },
            actionCategory: 'task_creation',
            priority: severity,
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // P4: Work orders with hours overrun
      const hoursOverrunRows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.estimated_hours, wo.actual_hours,
          wo.project_id, p.name as project_name, wo.supervisor_id, p.manager_id,
          ROUND(((wo.actual_hours - wo.estimated_hours)::numeric / NULLIF(wo.estimated_hours, 0) * 100)::numeric, 1) as overrun_pct
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.estimated_hours > 0 AND wo.actual_hours > wo.estimated_hours
          AND ((wo.actual_hours - wo.estimated_hours)::numeric / NULLIF(wo.estimated_hours, 0) * 100) >= 25
        ORDER BY overrun_pct DESC
      `);
      queriesRun++;

      for (const wo of (hoursOverrunRows.rows || []) as any[]) {
        const fp = makeFingerprint('wo_hours_overrun', `wo:${wo.id}`);
        const overrunPct = Number(wo.overrun_pct);
        const severity = overrunPct >= 100 ? 'high' as const : 'medium' as const;

        const findingResult = await findingManager.createFinding({
          findingType: 'threshold_breach',
          severity,
          title: `WO ${wo.work_order_number} hours overrun ${overrunPct}% — ${wo.title}`,
          description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" has a labour hours overrun of ${overrunPct}%.\nEstimated: ${wo.estimated_hours}h, Actual: ${wo.actual_hours}h.`,
          logicType: 'rule_based',
          dataSnapshot: { woId: wo.id, woNumber: wo.work_order_number, estimatedHours: wo.estimated_hours, actualHours: wo.actual_hours, overrunPct },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!findingResult.isDuplicate) findingsCount++;
      }

    } catch (err: any) {
      console.error(`[ProjectControl] Project Management error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // D1: DESIGN MANAGEMENT — Overdue Design Reviews
    // ══════════════════════════════════════════════════════════════════
    try {
      const reviewRows = await db.execute(sql`
        SELECT dr.id, dr.review_title, dr.status, dr.priority, dr.due_date,
          dr.reviewer_id, u.username as reviewer_name,
          dd.drawing_number, dd.drawing_title,
          dp.design_project_name, dp.project_id, dp.design_manager_id,
          CASE WHEN dr.due_date IS NOT NULL THEN (CURRENT_DATE - dr.due_date) ELSE 0 END as days_overdue
        FROM design_reviews dr
        LEFT JOIN users u ON dr.reviewer_id = u.id
        LEFT JOIN design_drawings dd ON dr.drawing_id = dd.id
        LEFT JOIN design_projects dp ON dd.design_project_id = dp.id
        WHERE dr.status IN ('Pending', 'In Progress')
          AND dr.due_date IS NOT NULL
          AND dr.due_date < CURRENT_DATE
        ORDER BY days_overdue DESC
      `);
      queriesRun++;

      for (const review of (reviewRows.rows || []) as any[]) {
        const daysOverdue = Number(review.days_overdue);
        if (daysOverdue < settings.design_review_overdue_days) continue;

        const fp = makeFingerprint('review_overdue', `review:${review.id}`);
        const severity = daysOverdue >= 14 ? 'high' as const : daysOverdue >= 7 ? 'medium' as const : 'low' as const;

        const findingResult = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `Design review overdue ${daysOverdue}d: ${review.review_title}`,
          description: `Design review "${review.review_title}" for drawing ${review.drawing_number || ''} ("${review.drawing_title || ''}") in project "${review.design_project_name || ''}" is ${daysOverdue} days past its due date (${review.due_date}).\nReviewer: ${review.reviewer_name || 'Unassigned'}\nStatus: ${review.status}`,
          logicType: 'rule_based',
          dataSnapshot: { reviewId: review.id, daysOverdue, reviewerName: review.reviewer_name, drawingNumber: review.drawing_number },
          relatedEntityType: 'design_review',
          relatedEntityId: String(review.id),
        });
        if (!findingResult.isDuplicate) findingsCount++;

        if (!await hasOpenAgentTask(fp)) {
          const assignTo = review.reviewer_id ? Number(review.reviewer_id) : (review.design_manager_id ? Number(review.design_manager_id) : 3);
          const rec = await recommendationManager.createRecommendation({
            findingId: findingResult.findingId,
            title: `[Design] Review overdue ${daysOverdue}d: ${review.review_title}`,
            actionType: 'create_task',
            rationale: `Design review is ${daysOverdue} days overdue. The reviewer needs to complete this review to unblock the drawing approval process.`,
            actionPayload: {
              title: `[Design] Complete overdue review: ${review.review_title} (${daysOverdue}d overdue)`,
              description: `Design review "${review.review_title}" is overdue by ${daysOverdue} days.\nDrawing: ${review.drawing_number || ''} — ${review.drawing_title || ''}\nProject: ${review.design_project_name || ''}\nDue date: ${review.due_date}\nStatus: ${review.status}\n\nPlease complete the review or request reassignment.`,
              assignedTo: assignTo,
              priority: daysOverdue >= 14 ? 'High' : 'Medium',
              category: `Design ${fp}`,
            },
            actionCategory: 'task_creation',
            priority: severity,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    } catch (err: any) {
      console.error(`[ProjectControl] Design Reviews error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // D2: DESIGN MANAGEMENT — Drawings without assignees or past due
    // ══════════════════════════════════════════════════════════════════
    try {
      const drawingRows = await db.execute(sql`
        SELECT dd.id, dd.drawing_number, dd.drawing_title, dd.status, dd.due_date,
          dd.assigned_to_id, u.username as assignee_name,
          dp.design_project_name, dp.design_manager_id,
          CASE WHEN dd.due_date IS NOT NULL THEN (CURRENT_DATE - dd.due_date) ELSE 0 END as days_overdue
        FROM design_drawings dd
        LEFT JOIN users u ON dd.assigned_to_id = u.id
        LEFT JOIN design_projects dp ON dd.design_project_id = dp.id
        WHERE dd.status NOT IN ('Approved', 'Issued', 'Superseded')
        ORDER BY dd.id
      `);
      queriesRun++;

      for (const drawing of (drawingRows.rows || []) as any[]) {
        const designManagerId = drawing.design_manager_id ? Number(drawing.design_manager_id) : 3;

        if (!drawing.assigned_to_id && settings.drawing_no_assignee_alert) {
          const fp = makeFingerprint('drawing_unassigned', `drawing:${drawing.id}`);
          const findingResult = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: 'medium',
            title: `Drawing unassigned: ${drawing.drawing_number || drawing.drawing_title}`,
            description: `Drawing "${drawing.drawing_title}" (${drawing.drawing_number || 'no number'}) in project "${drawing.design_project_name || ''}" has no assigned engineer.\nStatus: ${drawing.status}`,
            logicType: 'rule_based',
            dataSnapshot: { drawingId: drawing.id, drawingNumber: drawing.drawing_number, status: drawing.status },
            relatedEntityType: 'design_drawing',
            relatedEntityId: String(drawing.id),
          });
          if (!findingResult.isDuplicate) findingsCount++;

          if (!await hasOpenAgentTask(fp)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: findingResult.findingId,
              title: `[Design] Assign engineer: ${drawing.drawing_number || drawing.drawing_title}`,
              actionType: 'create_task',
              rationale: `Drawing has no assigned engineer. The design manager should assign someone to ensure progress.`,
              actionPayload: {
                title: `[Design] Assign engineer to: ${drawing.drawing_number || ''} — ${drawing.drawing_title}`,
                description: `Drawing "${drawing.drawing_title}" (${drawing.drawing_number || 'no number'}) in project "${drawing.design_project_name || ''}" has no assigned engineer.\nCurrent status: ${drawing.status}\n\nPlease assign an engineer to this drawing.`,
                assignedTo: designManagerId,
                priority: 'Medium',
                category: `Design ${fp}`,
              },
              actionCategory: 'task_creation',
              priority: 'medium',
              confidence: 0.85,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }

        if (drawing.due_date) {
          const daysOverdue = Number(drawing.days_overdue);
          if (daysOverdue >= settings.design_assignment_overdue_days) {
            const fp = makeFingerprint('drawing_overdue', `drawing:${drawing.id}`);
            const severity = daysOverdue >= 30 ? 'high' as const : 'medium' as const;

            const findingResult = await findingManager.createFinding({
              findingType: 'overdue',
              severity,
              title: `Drawing overdue ${daysOverdue}d: ${drawing.drawing_number || drawing.drawing_title}`,
              description: `Drawing "${drawing.drawing_title}" (${drawing.drawing_number || 'no number'}) is ${daysOverdue} days past its due date.\nAssigned to: ${drawing.assignee_name || 'Unassigned'}\nProject: ${drawing.design_project_name || ''}`,
              logicType: 'rule_based',
              dataSnapshot: { drawingId: drawing.id, daysOverdue, assigneeId: drawing.assigned_to_id },
              relatedEntityType: 'design_drawing',
              relatedEntityId: String(drawing.id),
            });
            if (!findingResult.isDuplicate) findingsCount++;

            if (!await hasOpenAgentTask(fp)) {
              const assignTo = drawing.assigned_to_id ? Number(drawing.assigned_to_id) : designManagerId;
              const rec = await recommendationManager.createRecommendation({
                findingId: findingResult.findingId,
                title: `[Design] Drawing overdue ${daysOverdue}d: ${drawing.drawing_number || drawing.drawing_title}`,
                actionType: 'create_task',
                rationale: `Drawing is ${daysOverdue} days overdue. The assigned engineer or design manager needs to review and update status.`,
                actionPayload: {
                  title: `[Design] Overdue drawing: ${drawing.drawing_number || ''} — "${drawing.drawing_title}" (${daysOverdue}d overdue)`,
                  description: `Drawing "${drawing.drawing_title}" (${drawing.drawing_number || 'no number'}) in project "${drawing.design_project_name || ''}" is ${daysOverdue} days overdue.\nDue date: ${drawing.due_date}\nAssigned to: ${drawing.assignee_name || 'Unassigned'}\nStatus: ${drawing.status}\n\nPlease update progress or request a deadline extension.`,
                  assignedTo: assignTo,
                  priority: daysOverdue >= 30 ? 'High' : 'Medium',
                  category: `Design ${fp}`,
                },
                actionCategory: 'task_creation',
                priority: severity,
                confidence: 0.9,
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[ProjectControl] Design Drawings error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // D3: DESIGN MANAGEMENT — Transmittals awaiting response
    // ══════════════════════════════════════════════════════════════════
    try {
      const transmittalRows = await db.execute(sql`
        SELECT dt.id, dt.transmittal_number, dt.transmittal_title, dt.status,
          dt.sent_date, dt.due_date, dt.recipient_organization,
          dp.design_project_name, dp.design_manager_id,
          CASE WHEN dt.due_date IS NOT NULL THEN (CURRENT_DATE - dt.due_date) ELSE 0 END as days_overdue
        FROM drawing_transmittals dt
        LEFT JOIN design_projects dp ON dt.design_project_id = dp.id
        WHERE dt.status IN ('Sent', 'sent', 'Pending', 'pending')
          AND dt.due_date IS NOT NULL
          AND dt.due_date < CURRENT_DATE
        ORDER BY days_overdue DESC
      `);
      queriesRun++;

      for (const tx of (transmittalRows.rows || []) as any[]) {
        const daysOverdue = Number(tx.days_overdue);
        if (daysOverdue < settings.transmittal_no_response_days) continue;

        const fp = makeFingerprint('transmittal_overdue', `tx:${tx.id}`);
        const severity = daysOverdue >= 21 ? 'high' as const : 'medium' as const;

        const findingResult = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `Transmittal no response ${daysOverdue}d: ${tx.transmittal_number || tx.transmittal_title}`,
          description: `Transmittal "${tx.transmittal_title}" (${tx.transmittal_number || ''}) sent to ${tx.recipient_organization || 'Unknown'} has received no response for ${daysOverdue} days past its due date.\nProject: ${tx.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { transmittalId: tx.id, daysOverdue, recipient: tx.recipient_organization },
          relatedEntityType: 'transmittal',
          relatedEntityId: String(tx.id),
        });
        if (!findingResult.isDuplicate) findingsCount++;

        if (!await hasOpenAgentTask(fp)) {
          const assignTo = tx.design_manager_id ? Number(tx.design_manager_id) : 3;
          const rec = await recommendationManager.createRecommendation({
            findingId: findingResult.findingId,
            title: `[Design] Follow up transmittal: ${tx.transmittal_number || tx.transmittal_title}`,
            actionType: 'create_task',
            rationale: `Transmittal has had no response for ${daysOverdue} days. Follow up with recipient to unblock the design process.`,
            actionPayload: {
              title: `[Design] Follow up: ${tx.transmittal_number || ''} — no response from ${tx.recipient_organization || 'client'} (${daysOverdue}d)`,
              description: `Transmittal "${tx.transmittal_title}" sent to ${tx.recipient_organization || 'Unknown'} has had no response for ${daysOverdue} days.\nProject: ${tx.design_project_name || ''}\nDue date: ${tx.due_date}\n\nPlease follow up with the recipient.`,
              assignedTo: assignTo,
              priority: daysOverdue >= 21 ? 'High' : 'Medium',
              category: `Design ${fp}`,
            },
            actionCategory: 'task_creation',
            priority: severity,
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    } catch (err: any) {
      console.error(`[ProjectControl] Transmittals error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // D4: DESIGN MANAGEMENT — Design project progress
    // ══════════════════════════════════════════════════════════════════
    try {
      const dpRows = await db.execute(sql`
        SELECT dp.id, dp.design_project_name, dp.status, dp.overall_progress, 
          dp.target_end_date, dp.design_manager_id, dp.project_id,
          u.username as manager_name,
          CASE WHEN dp.target_end_date IS NOT NULL THEN (CURRENT_DATE - dp.target_end_date) ELSE 0 END as days_past_target,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id) as total_drawings,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id AND dd.status IN ('Approved', 'Issued')) as approved_drawings,
          (SELECT COUNT(*) FROM design_reviews dr JOIN design_drawings dd ON dr.drawing_id = dd.id WHERE dd.design_project_id = dp.id AND dr.status IN ('Pending', 'In Progress')) as pending_reviews
        FROM design_projects dp
        LEFT JOIN users u ON dp.design_manager_id = u.id
        WHERE dp.status IN ('In Progress', 'Active', 'active', 'in_progress')
      `);
      queriesRun++;

      for (const dp of (dpRows.rows || []) as any[]) {
        const totalDrawings = Number(dp.total_drawings || 0);
        const approvedDrawings = Number(dp.approved_drawings || 0);
        const pendingReviews = Number(dp.pending_reviews || 0);
        const progress = Number(dp.overall_progress || 0);
        const daysPastTarget = Number(dp.days_past_target || 0);

        if (dp.target_end_date && daysPastTarget > 0 && progress < 100) {
          const fp = makeFingerprint('design_project_overdue', `dp:${dp.id}`);
          const severity = daysPastTarget >= 30 ? 'high' as const : 'medium' as const;

          const findingResult = await findingManager.createFinding({
            findingType: 'overdue',
            severity,
            title: `Design project overdue ${daysPastTarget}d: ${dp.design_project_name}`,
            description: `Design project "${dp.design_project_name}" is ${daysPastTarget} days past its target end date.\nProgress: ${progress}%\nDrawings: ${approvedDrawings}/${totalDrawings} approved\nPending reviews: ${pendingReviews}\nManager: ${dp.manager_name || 'Unassigned'}`,
            logicType: 'rule_based',
            dataSnapshot: { dpId: dp.id, daysPastTarget, progress, totalDrawings, approvedDrawings, pendingReviews },
            relatedEntityType: 'design_project',
            relatedEntityId: String(dp.id),
          });
          if (!findingResult.isDuplicate) findingsCount++;

          if (!await hasOpenAgentTask(fp)) {
            const assignTo = dp.design_manager_id ? Number(dp.design_manager_id) : 3;
            const rec = await recommendationManager.createRecommendation({
              findingId: findingResult.findingId,
              title: `[Design] Project overdue: ${dp.design_project_name}`,
              actionType: 'create_task',
              rationale: `Design project is ${daysPastTarget} days past target with ${progress}% progress. Design manager should review and expedite.`,
              actionPayload: {
                title: `[Design] Overdue project review: ${dp.design_project_name} (${daysPastTarget}d past target)`,
                description: `Design project "${dp.design_project_name}" is ${daysPastTarget} days past its target end date.\nProgress: ${progress}%\nDrawings approved: ${approvedDrawings}/${totalDrawings}\nPending reviews: ${pendingReviews}\n\nPlease review and update the project timeline.`,
                assignedTo: assignTo,
                priority: daysPastTarget >= 30 ? 'High' : 'Medium',
                category: `Design ${fp}`,
              },
              actionCategory: 'task_creation',
              priority: severity,
              confidence: 0.9,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }
    } catch (err: any) {
      console.error(`[ProjectControl] Design Projects error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // INSIGHTS — Summary reports
    // ══════════════════════════════════════════════════════════════════
    try {
      const projectSummaryRows = await db.execute(sql`SELECT * FROM vw_agent_project_health`);
      const projects = (projectSummaryRows.rows || []) as any[];
      const overdueWOCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM vw_agent_overdue_work_orders WHERE days_overdue >= ${settings.wo_overdue_threshold_days}`);
      const totalOverdueWOs = Number((overdueWOCount.rows as any[])[0]?.cnt || 0);

      const designSummaryRows = await db.execute(sql`
        SELECT 
          (SELECT COUNT(*) FROM design_projects WHERE status IN ('In Progress', 'Active', 'active')) as active_design_projects,
          (SELECT COUNT(*) FROM design_drawings WHERE status NOT IN ('Approved', 'Issued', 'Superseded')) as open_drawings,
          (SELECT COUNT(*) FROM design_reviews WHERE status IN ('Pending', 'In Progress')) as pending_reviews,
          (SELECT COUNT(*) FROM design_reviews WHERE status IN ('Pending', 'In Progress') AND due_date < CURRENT_DATE) as overdue_reviews
      `);
      const ds = (designSummaryRows.rows as any[])[0] || {};

      const projectDetails = projects.map((p: any) =>
        `  ${p.project_number || p.project_name}: ${p.wo_completion_pct}% complete, ${p.overdue_work_orders} overdue WOs`
      ).join('\n');

      const summaryContent = [
        `PROJECT MANAGEMENT:`,
        `  Active projects: ${projects.length}`,
        `  Overdue work orders (${settings.wo_overdue_threshold_days}d+): ${totalOverdueWOs}`,
        projects.length > 0 ? `\n  Project details:\n${projectDetails}` : '',
        ``,
        `DESIGN MANAGEMENT:`,
        `  Active design projects: ${ds.active_design_projects || 0}`,
        `  Open drawings: ${ds.open_drawings || 0}`,
        `  Pending reviews: ${ds.pending_reviews || 0}`,
        `  Overdue reviews: ${ds.overdue_reviews || 0}`,
      ].filter(Boolean).join('\n');

      await insightManager.createInsight({
        findingIds: [],
        insightType: 'summary',
        title: `Project & Design Health Summary — ${new Date().toLocaleDateString()}`,
        content: summaryContent,
        logicType: 'rule_based',
        dataSources: ['vw_agent_project_health', 'vw_agent_overdue_work_orders', 'design_projects', 'design_drawings', 'design_reviews'],
        scopePeriod: 'daily',
      });
      insightsCount++;
    } catch (err: any) {
      console.error(`[ProjectControl] Summary insight error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // AUTO-EXECUTE QUEUE
    // ══════════════════════════════════════════════════════════════════
    if (autoExecuteQueue.length > 0) {
      try {
        for (const autoRecId of autoExecuteQueue) {
          const rec = await db.execute(sql`
            SELECT id, action_type, action_payload FROM agent_recommendations WHERE id = ${autoRecId}
          `);
          const recRow = (rec.rows as any[])[0];
          if (!recRow) continue;

          const payload = typeof recRow.action_payload === 'string' ? JSON.parse(recRow.action_payload) : recRow.action_payload;

          if ((recRow.action_type === 'create_task' || recRow.action_type === 'task_creation') && payload) {
            const taskResult = await db.execute(sql`
              INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, category, source_type, source_agent, start_date, finish_date, created_at)
              VALUES (
                ${payload.title}, ${payload.description}, ${payload.assignedTo}, 1,
                ${payload.priority || 'Medium'}, 'pending', ${payload.category || 'Project'},
                'agent_task', ${SOURCE_AGENT}, ${todayStr}, ${todayStr}, NOW()
              )
              RETURNING id
            `);
            const taskId = (taskResult.rows as any[])[0]?.id;

            await db.execute(sql`
              UPDATE agent_recommendations SET status = 'approved', approved_by = 1 WHERE id = ${autoRecId}
            `);
            await db.execute(sql`
              INSERT INTO agent_actions (recommendation_id, agent_key, action_category, action_type, action_payload, idempotency_key, execution_status, result_data, executed_at)
              VALUES (${autoRecId}, ${this.key}, 'task_creation', 'create_task', ${JSON.stringify(payload)}::jsonb, ${'auto_' + autoRecId + '_' + Date.now()}, 'completed', ${JSON.stringify({ taskId })}::jsonb, NOW())
            `);
            autoExecutedCount++;
          }
        }
      } catch (err: any) {
        console.error(`[ProjectControl] Auto-execute error:`, err.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ProjectControl] Run complete — findings: ${findingsCount}, insights: ${insightsCount}, recommendations: ${recommendationsCount}, tasks created: ${autoExecutedCount}, auto-closed: ${autoClosedCount}`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      queriesRun,
      executionTimeMs: duration,
      summary: `Project Control Agent: ${findingsCount} findings, ${insightsCount} insights, ${autoExecutedCount} tasks created, ${autoClosedCount} auto-closed.`,
    };
  }
}
