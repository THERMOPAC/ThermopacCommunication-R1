import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const SOURCE_AGENT = 'project_controller';
const AGENT_KEY = 'project_control';

const THRESHOLDS = {
  p1_overdue_days: 1,
  p3_stuck_days: 14,
  p5_inactive_days: 7,
  p8_slippage_warning_days: 14,
  p11_inactive_days: 14,
  p2_milestone_overdue_days: 0,
  p4_phase_overdue_days: 0,
  p6_commitment_warning_days: 3,
  p10_overload_open_items: 10,
  p12_health_threshold: 50,
  d2_review_stuck_days: 10,
  d3_comments_pending_days: 7,
  d4_client_approval_days: 14,
  d5_revision_stale_days: 14,
  d9_backlog_threshold: 5,
  r1_pr_conversion_days: 7,
  r3_eval_pending_days: 7,
  r5_po_draft_stuck_days: 14,
  r8_delivery_missed_days: 7,
  r9_inspection_pending_days: 14,
  r10_dispatch_delay_days: 7,
  r2_rfq_pending_days: 7,
  r6_vendor_submission_days: 30,
  r7_manufacturing_delay_days: 60,
  r11_logistics_delay_days: 30,
};

function fp(type: string, entity: string, id: string | number): string {
  return `[fp:pc_${type}:${entity}:${id}]`;
}

async function hasOpenTask(fingerprint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task' AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status NOT IN ('completed', 'cancelled')
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function resolveProjectManager(projectId: number): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT pm.user_id FROM project_members pm
    WHERE pm.project_id = ${projectId} AND pm.role = 'project_manager'
    LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.user_id) : null;
}

async function resolveReportingManager(userId: number): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT reporting_manager_id FROM users WHERE id = ${userId} AND is_active = true LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row?.reporting_manager_id ? Number(row.reporting_manager_id) : null;
}

async function resolveDepartmentHead(department: string): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT id FROM users
    WHERE department = ${department} AND is_active = true
      AND role IN ('Senior Manager', 'Manager')
    ORDER BY CASE role WHEN 'Senior Manager' THEN 1 WHEN 'Manager' THEN 2 ELSE 3 END
    LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.id) : null;
}

async function resolveGM(): Promise<number> {
  const result = await db.execute(sql`
    SELECT id FROM users WHERE role = 'General Manager' AND is_active = true LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.id) : 2;
}

async function resolveOwner(): Promise<number> {
  const result = await db.execute(sql`
    SELECT id FROM users WHERE role = 'Superuser' AND is_active = true AND reporting_manager_id = id LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.id) : 3;
}

async function resolveAssignment(
  entityOwnerId: number | null,
  projectId: number | null,
  department: string
): Promise<number> {
  if (entityOwnerId) return entityOwnerId;
  if (projectId) {
    const pm = await resolveProjectManager(projectId);
    if (pm) return pm;
  }
  const deptHead = await resolveDepartmentHead(department);
  if (deptHead) return deptHead;
  return await resolveGM();
}

async function resolveEscalation(assigneeId: number, level: 'L2' | 'L3'): Promise<number> {
  if (level === 'L2') {
    const mgr = await resolveReportingManager(assigneeId);
    return mgr || await resolveGM();
  }
  return await resolveGM();
}

function severityFromLevel(level: 'L1' | 'L2' | 'L3'): string {
  if (level === 'L3') return 'critical';
  if (level === 'L2') return 'high';
  return 'medium';
}

function priorityFromLevel(level: 'L1' | 'L2' | 'L3'): string {
  if (level === 'L3') return 'Critical';
  if (level === 'L2') return 'High';
  return 'Medium';
}

function agentSeverityFromLevel(level: 'L1' | 'L2' | 'L3'): string {
  if (level === 'L3') return 'critical';
  if (level === 'L2') return 'risk';
  return 'warning';
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closed = 0;

  const fpPatterns = [
    { pattern: '%[fp:pc_%', table: null },
  ];

  const openTasks = await db.execute(sql`
    SELECT id, category FROM tasks
    WHERE source_type = 'agent_task' AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'cancelled')
      AND category LIKE '%[fp:pc_%'
  `);

  for (const row of (openTasks.rows as any[])) {
    const cat = row.category || '';
    let shouldClose = false;

    const woMatch = cat.match(/\[fp:pc_(?:p1_overdue_task|p3_stuck|wo_overdue):wo:(\d+)\]/);
    if (woMatch) {
      const check = await db.execute(sql`SELECT status FROM work_orders WHERE id = ${parseInt(woMatch[1])}`);
      const s = (check.rows as any[])[0]?.status;
      if (s === 'completed' || s === 'cancelled') shouldClose = true;
    }

    const reviewMatch = cat.match(/\[fp:pc_(?:d2_stuck_review|review_overdue):review:(\d+)\]/);
    if (reviewMatch) {
      const check = await db.execute(sql`SELECT status FROM design_reviews WHERE id = ${parseInt(reviewMatch[1])}`);
      const s = (check.rows as any[])[0]?.status;
      if (s === 'Approved' || s === 'Approved with Comments' || s === 'Rejected') shouldClose = true;
    }

    const poMatch = cat.match(/\[fp:pc_(?:r8_delivery_missed|po_overdue|po_vendor_overdue):(?:sap_po|vendor):(\S+)\]/);
    if (poMatch && /^\d+$/.test(poMatch[1])) {
      const check = await db.execute(sql`SELECT doc_status, cancelled FROM sap_purchase_orders WHERE id = ${parseInt(poMatch[1])}`);
      const po = (check.rows as any[])[0];
      if (po && (po.doc_status === 'bost_Close' || po.cancelled === 'tYES')) shouldClose = true;
    }

    const drawingMatch = cat.match(/\[fp:pc_d1_drawing_overdue:drawing:(\d+)\]/);
    if (drawingMatch) {
      const check = await db.execute(sql`SELECT status FROM design_drawings WHERE id = ${parseInt(drawingMatch[1])}`);
      const s = (check.rows as any[])[0]?.status;
      if (s === 'Approved' || s === 'Issued') shouldClose = true;
    }

    if (shouldClose) {
      await db.execute(sql`UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${row.id}`);
      closed++;
    }
  }
  return closed;
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

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    const gmId = await resolveGM();
    const ownerId = await resolveOwner();

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) console.log(`[ProjectControl] Auto-closed ${autoClosedCount} resolved tasks`);
    } catch (err: any) {
      console.error(`[ProjectControl] Auto-close error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 1: PROJECT MANAGEMENT (P1–P12)
    // ════════════════════════════════════════════════════════════════════════
    try {
      // ── Grouped project query ──
      const projectHealthRows = await db.execute(sql`SELECT * FROM vw_agent_project_health`);
      queriesRun++;
      const projects = (projectHealthRows.rows || []) as any[];

      const overdueWORows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.status, wo.supervisor_id,
          wo.project_id, p.name as project_name, p.manager_id,
          wo.planned_end_date, wo.updated_at,
          EXTRACT(DAY FROM NOW() - wo.planned_end_date)::int as days_overdue,
          EXTRACT(DAY FROM NOW() - wo.updated_at)::int as days_since_update
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.status NOT IN ('completed', 'cancelled')
        ORDER BY wo.project_id
      `);
      queriesRun++;
      const allWOs = (overdueWORows.rows || []) as any[];

      const phaseRows = await db.execute(sql`
        SELECT pp.id, pp.project_id, pp.name as phase_name, pp.status, pp.start_date,
          pp.target_end_date, pp.progress, pp.phase_lead_id, pp."order",
          p.name as project_name, p.manager_id
        FROM project_phases pp
        JOIN projects p ON pp.project_id = p.id
        WHERE p.status NOT IN ('cancelled', 'archived', 'completed')
        ORDER BY pp.project_id, pp."order"
      `);
      queriesRun++;
      const phases = (phaseRows.rows || []) as any[];

      const keyStageRows = await db.execute(sql`
        SELECT ks.id, ks.project_id, ks.stage_number, ks.stage_name, ks.phase,
          ks.is_completed, ks.completed_date, p.name as project_name, p.manager_id
        FROM project_key_stages ks
        JOIN projects p ON ks.project_id = p.id
        WHERE p.status NOT IN ('cancelled', 'archived', 'completed')
        ORDER BY ks.project_id, ks.stage_number
      `);
      queriesRun++;
      const keyStages = (keyStageRows.rows || []) as any[];

      // ── P1: Overdue Task (WOs past planned_end_date) ──
      for (const wo of allWOs) {
        if (!wo.planned_end_date) continue;
        const daysOverdue = Number(wo.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.p1_overdue_days) continue;

        const level: 'L1' | 'L2' | 'L3' = daysOverdue >= 90 ? 'L3' : daysOverdue >= 30 ? 'L2' : 'L1';
        const fingerprint = fp('p1_overdue_task', 'wo', wo.id);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `P1 Overdue Task: ${wo.work_order_number} — ${wo.title} (${daysOverdue}d)`,
          description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" is ${daysOverdue} days past planned end date (${wo.planned_end_date}).\nStatus: ${wo.status}`,
          logicType: 'rule_based',
          dataSnapshot: { woId: wo.id, daysOverdue, projectId: wo.project_id },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            wo.supervisor_id ? Number(wo.supervisor_id) : null,
            Number(wo.project_id),
            'Production'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Overdue Task: ${wo.work_order_number}`,
            actionType: 'create_task',
            rationale: `Work order ${wo.work_order_number} is ${daysOverdue} days overdue. Needs review and action.`,
            actionPayload: {
              title: `[Agent] Project Control – Overdue Task: ${wo.work_order_number} — "${wo.title}" (${daysOverdue}d overdue)`,
              description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" is ${daysOverdue} days past planned end date.\nPlanned end: ${wo.planned_end_date}\nStatus: ${wo.status}\nAgent severity: ${agentSeverityFromLevel(level)}\n\nPlease review and update status or escalate blockers.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Project ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P3: Task Stuck (no update for 14+ days) ──
      for (const wo of allWOs) {
        const daysSinceUpdate = Number(wo.days_since_update || 0);
        if (daysSinceUpdate < THRESHOLDS.p3_stuck_days) continue;

        const level: 'L1' | 'L2' = daysSinceUpdate >= 30 ? 'L2' : 'L1';
        const fingerprint = fp('p3_stuck', 'wo', wo.id);

        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: severityFromLevel(level) as any,
          title: `P3 Task Stuck: ${wo.work_order_number} — ${daysSinceUpdate}d no update`,
          description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" has had no status update for ${daysSinceUpdate} days.\nCurrent status: ${wo.status}`,
          logicType: 'rule_based',
          dataSnapshot: { woId: wo.id, daysSinceUpdate, projectId: wo.project_id },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            wo.supervisor_id ? Number(wo.supervisor_id) : null,
            Number(wo.project_id),
            'Production'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Task Stuck: ${wo.work_order_number}`,
            actionType: 'create_task',
            rationale: `Work order has not been updated for ${daysSinceUpdate} days. May be blocked or forgotten.`,
            actionPayload: {
              title: `[Agent] Project Control – Task Stuck: ${wo.work_order_number} — "${wo.title}" (${daysSinceUpdate}d no update)`,
              description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" has had no update for ${daysSinceUpdate} days.\nStatus: ${wo.status}\nLast update: ${wo.updated_at}\nAgent severity: ${agentSeverityFromLevel(level)}\n\nPlease review status, update progress, or report blockers.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Project ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P5: No Recent Project Activity (7d) & P11: Project Inactive (14d) ──
      const wosByProject: Record<number, any[]> = {};
      for (const wo of allWOs) {
        const pid = Number(wo.project_id);
        if (!wosByProject[pid]) wosByProject[pid] = [];
        wosByProject[pid].push(wo);
      }

      for (const project of projects) {
        const pid = Number(project.id);
        const projectWOs = wosByProject[pid] || [];
        if (projectWOs.length === 0) continue;

        const maxUpdate = Math.max(...projectWOs.map((w: any) => {
          const d = w.updated_at ? new Date(w.updated_at).getTime() : 0;
          return d;
        }));
        const daysSinceActivity = maxUpdate > 0 
          ? Math.floor((Date.now() - maxUpdate) / (1000 * 60 * 60 * 24))
          : 999;

        // P11: Project Inactive (14+ days) → L2
        if (daysSinceActivity >= THRESHOLDS.p11_inactive_days) {
          const fingerprint = fp('p11_inactive', 'project', pid);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: 'high',
            title: `P11 Project Inactive: ${project.project_name} — ${daysSinceActivity}d no updates`,
            description: `Project "${project.project_name}" has had no work order updates for ${daysSinceActivity} days. May need management attention.`,
            logicType: 'rule_based',
            dataSnapshot: { projectId: pid, daysSinceActivity },
            relatedEntityType: 'project',
            relatedEntityId: String(pid),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(pid);
            const assignTo = pm || await resolveAssignment(null, pid, 'Administration');
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Project Inactive: ${project.project_name}`,
              actionType: 'create_task',
              rationale: `No work order updates for ${daysSinceActivity} days. Project may be stalled.`,
              actionPayload: {
                title: `[Agent] Project Control – Project Inactive: ${project.project_name} (${daysSinceActivity}d no updates)`,
                description: `Project "${project.project_name}" has had no work order updates for ${daysSinceActivity} days.\nAgent severity: risk\n\nPlease review project status and provide an update.`,
                assignedTo: assignTo,
                priority: 'High',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              priority: 'high',
              confidence: 0.9,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
        // P5: No Recent Activity (7-13 days) → L1
        else if (daysSinceActivity >= THRESHOLDS.p5_inactive_days) {
          const fingerprint = fp('p5_no_activity', 'project', pid);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: 'medium',
            title: `P5 No Recent Activity: ${project.project_name} — ${daysSinceActivity}d silent`,
            description: `Project "${project.project_name}" has had no work order updates for ${daysSinceActivity} days.`,
            logicType: 'rule_based',
            dataSnapshot: { projectId: pid, daysSinceActivity },
            relatedEntityType: 'project',
            relatedEntityId: String(pid),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(pid);
            const assignTo = pm || await resolveAssignment(null, pid, 'Administration');
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – No Activity: ${project.project_name}`,
              actionType: 'create_task',
              rationale: `No updates for ${daysSinceActivity} days. Project manager should review.`,
              actionPayload: {
                title: `[Agent] Project Control – No Activity: ${project.project_name} (${daysSinceActivity}d silent)`,
                description: `Project "${project.project_name}" has had no work order updates for ${daysSinceActivity} days.\nAgent severity: warning\n\nPlease provide a status update.`,
                assignedTo: assignTo,
                priority: 'Medium',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              priority: 'medium',
              confidence: 0.8,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── P8: Project Schedule Slippage ──
      for (const project of projects) {
        if (!project.target_end_date) continue;
        const targetDate = new Date(project.target_end_date);
        const daysUntil = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const completionPct = Number(project.wo_completion_pct || 0);

        if (daysUntil <= THRESHOLDS.p8_slippage_warning_days && daysUntil > -365 && completionPct < 90) {
          const level: 'L1' | 'L2' | 'L3' = daysUntil <= -30 ? 'L3' : daysUntil <= 0 ? 'L2' : 'L1';
          const fingerprint = fp('p8_schedule_slip', 'project', project.id);

          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity: severityFromLevel(level) as any,
            title: `P8 Schedule Slippage: ${project.project_name} — ${daysUntil <= 0 ? Math.abs(daysUntil) + 'd PAST deadline' : daysUntil + 'd to deadline'}, ${completionPct}% complete`,
            description: `Project "${project.project_name}" ${daysUntil <= 0 ? 'is ' + Math.abs(daysUntil) + ' days PAST its deadline' : 'is due in ' + daysUntil + ' days'} but only ${completionPct}% of work orders are completed.\nOverdue WOs: ${project.overdue_work_orders}`,
            logicType: 'rule_based',
            dataSnapshot: { projectId: project.id, daysUntil, completionPct, overdueWOs: project.overdue_work_orders },
            relatedEntityType: 'project',
            relatedEntityId: String(project.id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(Number(project.id));
            const assignTo = pm || Number(project.manager_id) || gmId;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Schedule Slippage: ${project.project_name}`,
              actionType: 'create_task',
              rationale: `Project is ${daysUntil <= 0 ? 'past its deadline' : 'approaching deadline'} with only ${completionPct}% completion.`,
              actionPayload: {
                title: `[Agent] Project Control – Schedule Slippage: ${project.project_name} — ${daysUntil <= 0 ? Math.abs(daysUntil) + 'd OVERDUE' : daysUntil + 'd remaining'}, ${completionPct}% done`,
                description: `Project "${project.project_name}"\nTarget end date: ${project.target_end_date}\n${daysUntil <= 0 ? 'OVERDUE by ' + Math.abs(daysUntil) + ' days' : daysUntil + ' days remaining'}\nCompletion: ${completionPct}%\nOverdue WOs: ${project.overdue_work_orders}\nAgent severity: ${agentSeverityFromLevel(level)}\n\nReview resource allocation, reprioritize work orders, and update timeline if needed.`,
                assignedTo: assignTo,
                priority: priorityFromLevel(level),
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              priority: severityFromLevel(level) as any,
              confidence: 0.95,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── P2: Milestone Delayed (phases past target_end_date) ──
      for (const phase of phases) {
        if (!phase.target_end_date || phase.status === 'completed') continue;
        const targetDate = new Date(phase.target_end_date);
        const daysOverdue = Math.floor((Date.now() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue < THRESHOLDS.p2_milestone_overdue_days) continue;

        const level: 'L2' | 'L3' = daysOverdue >= 60 ? 'L3' : 'L2';
        const fingerprint = fp('p2_milestone', 'phase', phase.id);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `P2 Milestone Delayed: ${phase.phase_name} in ${phase.project_name} (${daysOverdue}d overdue)`,
          description: `Phase "${phase.phase_name}" in project "${phase.project_name}" is ${daysOverdue} days past its target end date (${phase.target_end_date}).\nProgress: ${phase.progress || 0}%\nStatus: ${phase.status}`,
          logicType: 'rule_based',
          dataSnapshot: { phaseId: phase.id, projectId: phase.project_id, daysOverdue, progress: phase.progress },
          relatedEntityType: 'project_phase',
          relatedEntityId: String(phase.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            phase.phase_lead_id ? Number(phase.phase_lead_id) : null,
            Number(phase.project_id),
            'Administration'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Milestone Delayed: ${phase.phase_name}`,
            actionType: 'create_task',
            rationale: `Phase "${phase.phase_name}" is ${daysOverdue} days past target. Needs immediate attention.`,
            actionPayload: {
              title: `[Agent] Project Control – Milestone Delayed: ${phase.phase_name} in ${phase.project_name} (${daysOverdue}d overdue)`,
              description: `Phase "${phase.phase_name}" in project "${phase.project_name}" is ${daysOverdue} days past target end date.\nTarget: ${phase.target_end_date}\nProgress: ${phase.progress || 0}%\nAgent severity: ${agentSeverityFromLevel(level)}\n\nReview phase status and take corrective action.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Project ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P4: Dependency Blocking (earlier phase incomplete blocking later phase) ──
      const phasesByProject: Record<number, any[]> = {};
      for (const p of phases) {
        const pid = Number(p.project_id);
        if (!phasesByProject[pid]) phasesByProject[pid] = [];
        phasesByProject[pid].push(p);
      }

      for (const [pidStr, projectPhases] of Object.entries(phasesByProject)) {
        const sorted = projectPhases.sort((a: any, b: any) => Number(a.order) - Number(b.order));
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          if (prev.status !== 'completed' && prev.target_end_date) {
            const prevTarget = new Date(prev.target_end_date);
            const daysOverdue = Math.floor((Date.now() - prevTarget.getTime()) / (1000 * 60 * 60 * 24));
            if (daysOverdue > 0) {
              const fingerprint = fp('p4_dependency', 'phase', `${prev.id}_${curr.id}`);
              const finding = await findingManager.createFinding({
                findingType: 'anomaly',
                severity: 'medium',
                title: `P4 Dependency Blocking: ${prev.phase_name} blocking ${curr.phase_name} in ${prev.project_name}`,
                description: `Phase "${prev.phase_name}" (target: ${prev.target_end_date}) is incomplete and blocking "${curr.phase_name}" in project "${prev.project_name}".`,
                logicType: 'derived',
                dataSnapshot: { prevPhaseId: prev.id, currPhaseId: curr.id, projectId: prev.project_id },
                relatedEntityType: 'project_phase',
                relatedEntityId: String(prev.id),
              });
              if (!finding.isDuplicate) findingsCount++;

              if (!await hasOpenTask(fingerprint)) {
                const assignTo = await resolveAssignment(
                  prev.phase_lead_id ? Number(prev.phase_lead_id) : null,
                  Number(prev.project_id),
                  'Administration'
                );
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id || finding.findingId,
                  title: `[Agent] Project Control – Phase Blocking: ${prev.phase_name} → ${curr.phase_name}`,
                  actionType: 'create_task',
                  rationale: `Phase "${prev.phase_name}" is overdue and blocking "${curr.phase_name}".`,
                  actionPayload: {
                    title: `[Agent] Project Control – Phase Blocking: ${prev.phase_name} blocking ${curr.phase_name} in ${prev.project_name}`,
                    description: `Phase "${prev.phase_name}" (target: ${prev.target_end_date}) in project "${prev.project_name}" is incomplete and blocking the next phase "${curr.phase_name}".\nAgent severity: warning\n\nComplete or unblock the predecessor phase.`,
                    assignedTo: assignTo,
                    priority: 'Medium',
                    category: `Project ${fingerprint}`,
                  },
                  actionCategory: 'task_creation',
                  priority: 'medium',
                  confidence: 0.85,
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
              }
            }
          }
        }
      }

      // ── P6: Commitment Nearing Due Date & P7: Commitment Overdue ──
      const commitmentRows = await db.execute(sql`
        SELECT t.id, t.title, t.status, t.assigned_to, t.finish_date, t.due_date,
          pt.project_id, p.name as project_name,
          COALESCE(NULLIF(t.due_date, ''), t.finish_date) as effective_due,
          u.username as assignee_name
        FROM tasks t
        JOIN project_tasks pt ON pt.task_id = t.id
        JOIN projects p ON pt.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.status NOT IN ('completed', 'cancelled')
          AND COALESCE(NULLIF(t.due_date, ''), t.finish_date) IS NOT NULL
          AND COALESCE(NULLIF(t.due_date, ''), t.finish_date) != ''
      `);
      queriesRun++;

      for (const task of (commitmentRows.rows || []) as any[]) {
        const dueDate = new Date(task.effective_due);
        const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) {
          // P7: Commitment Overdue → L2
          const daysOverdue = Math.abs(daysUntil);
          const fingerprint = fp('p7_commitment_overdue', 'task', task.id);
          const finding = await findingManager.createFinding({
            findingType: 'overdue',
            severity: 'high',
            title: `P7 Commitment Overdue: ${task.title} (${daysOverdue}d late)`,
            description: `Task "${task.title}" linked to project "${task.project_name}" is ${daysOverdue} days overdue.\nAssigned to: ${task.assignee_name || 'Unassigned'}`,
            logicType: 'derived',
            dataSnapshot: { taskId: task.id, projectId: task.project_id, daysOverdue },
            relatedEntityType: 'task',
            relatedEntityId: String(task.id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(Number(task.project_id));
            const assignTo = pm || gmId;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Commitment Overdue: ${task.title}`,
              actionType: 'create_task',
              rationale: `Project commitment is ${daysOverdue} days overdue.`,
              actionPayload: {
                title: `[Agent] Project Control – Commitment Overdue: ${task.title} (${daysOverdue}d late)`,
                description: `Task "${task.title}" linked to project "${task.project_name}" is ${daysOverdue} days overdue.\nDue: ${task.effective_due}\nAssigned to: ${task.assignee_name || 'Unassigned'}\nAgent severity: risk`,
                assignedTo: assignTo,
                priority: 'High',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              priority: 'high',
              confidence: 0.85,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        } else if (daysUntil <= THRESHOLDS.p6_commitment_warning_days) {
          // P6: Commitment Nearing Due → L1
          const fingerprint = fp('p6_commitment_due', 'task', task.id);
          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity: 'medium',
            title: `P6 Commitment Due Soon: ${task.title} (${daysUntil}d left)`,
            description: `Task "${task.title}" linked to project "${task.project_name}" is due in ${daysUntil} days.\nAssigned to: ${task.assignee_name || 'Unassigned'}`,
            logicType: 'derived',
            dataSnapshot: { taskId: task.id, projectId: task.project_id, daysUntil },
            relatedEntityType: 'task',
            relatedEntityId: String(task.id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const assignTo = task.assigned_to ? Number(task.assigned_to) : await resolveAssignment(null, Number(task.project_id), 'Administration');
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Commitment Due Soon: ${task.title}`,
              actionType: 'create_task',
              rationale: `Project commitment due in ${daysUntil} days.`,
              actionPayload: {
                title: `[Agent] Project Control – Commitment Due Soon: ${task.title} (${daysUntil}d left)`,
                description: `Task "${task.title}" linked to project "${task.project_name}" is due in ${daysUntil} days.\nDue: ${task.effective_due}\nAssigned to: ${task.assignee_name || 'Unassigned'}\nAgent severity: warning`,
                assignedTo: assignTo,
                priority: 'Medium',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              priority: 'medium',
              confidence: 0.8,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── P9: Critical Path Delay ──
      const criticalPhases = ['Manufacturing', 'Quality', 'Shipping & Commissioning'];
      for (const [pidStr, projectPhases] of Object.entries(phasesByProject)) {
        const sorted = projectPhases.sort((a: any, b: any) => Number(a.order) - Number(b.order));
        for (const phase of sorted) {
          if (!criticalPhases.includes(phase.phase_name)) continue;
          const idx = sorted.indexOf(phase);
          const predecessorsIncomplete = sorted.slice(0, idx).some((p: any) => p.status !== 'completed');
          if (predecessorsIncomplete && phase.target_end_date) {
            const targetDate = new Date(phase.target_end_date);
            const daysUntil = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 30) {
              const fingerprint = fp('p9_critical_path', 'phase', phase.id);
              const finding = await findingManager.createFinding({
                findingType: 'threshold_breach',
                severity: 'critical',
                title: `P9 Critical Path Delay: ${phase.phase_name} in ${phase.project_name} — predecessors incomplete`,
                description: `Critical phase "${phase.phase_name}" in project "${phase.project_name}" has predecessor phases still incomplete. Target: ${phase.target_end_date} (${daysUntil <= 0 ? Math.abs(daysUntil) + 'd PAST' : daysUntil + 'd remaining'}).`,
                logicType: 'derived',
                dataSnapshot: { phaseId: phase.id, projectId: phase.project_id, daysUntil },
                relatedEntityType: 'project_phase',
                relatedEntityId: String(phase.id),
              });
              if (!finding.isDuplicate) findingsCount++;

              if (!await hasOpenTask(fingerprint)) {
                const pm = await resolveProjectManager(Number(phase.project_id));
                const assignTo = pm || gmId;
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id || finding.findingId,
                  title: `[Agent] Project Control – Critical Path Delay: ${phase.phase_name}`,
                  actionType: 'create_task',
                  rationale: `Critical phase blocked by incomplete predecessors. Requires management intervention.`,
                  actionPayload: {
                    title: `[Agent] Project Control – Critical Path Delay: ${phase.phase_name} in ${phase.project_name}`,
                    description: `Critical phase "${phase.phase_name}" in project "${phase.project_name}" has predecessor phases still incomplete.\nTarget: ${phase.target_end_date}\nAgent severity: critical\n\nRequires immediate management review and intervention.`,
                    assignedTo: assignTo,
                    priority: 'Critical',
                    category: `Project ${fingerprint}`,
                  },
                  actionCategory: 'task_creation',
                  priority: 'critical',
                  confidence: 0.9,
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
              }
            }
          }
        }
      }

      // ── P10: Resource Overload ──
      const resourceRows = await db.execute(sql`
        SELECT u.id as user_id, u.username, u.reporting_manager_id,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.supervisor_id = u.id AND wo.status NOT IN ('completed','cancelled')) as open_wos,
          (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status NOT IN ('completed','cancelled')) as open_tasks
        FROM users u
        WHERE u.is_active = true
        HAVING (SELECT COUNT(*) FROM work_orders wo WHERE wo.supervisor_id = u.id AND wo.status NOT IN ('completed','cancelled'))
             + (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status NOT IN ('completed','cancelled')) > ${THRESHOLDS.p10_overload_open_items}
      `);
      queriesRun++;

      for (const user of (resourceRows.rows || []) as any[]) {
        const totalItems = Number(user.open_wos) + Number(user.open_tasks);
        const fingerprint = fp('p10_overload', 'user', user.user_id);

        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach',
          severity: 'medium',
          title: `P10 Resource Overload: ${user.username} — ${totalItems} open items`,
          description: `User "${user.username}" has ${user.open_wos} open work orders and ${user.open_tasks} open tasks (total: ${totalItems}). May cause delays.`,
          logicType: 'proxy',
          dataSnapshot: { userId: user.user_id, openWOs: user.open_wos, openTasks: user.open_tasks },
          relatedEntityType: 'user',
          relatedEntityId: String(user.user_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = user.reporting_manager_id ? Number(user.reporting_manager_id) : gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Resource Overload: ${user.username}`,
            actionType: 'create_task',
            rationale: `User has ${totalItems} open items. Review workload distribution.`,
            actionPayload: {
              title: `[Agent] Project Control – Resource Overload: ${user.username} (${totalItems} open items)`,
              description: `User "${user.username}" has ${user.open_wos} open work orders and ${user.open_tasks} open tasks.\nTotal: ${totalItems} open items\nAgent severity: warning\n\nReview workload and redistribute if necessary.`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Project ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P12: Project Health Deterioration ──
      for (const project of projects) {
        const overdueWOs = Number(project.overdue_work_orders || 0);
        const totalWOs = Number(project.total_work_orders || 0);
        const completionPct = Number(project.wo_completion_pct || 0);
        if (totalWOs === 0) continue;

        const overduePct = totalWOs > 0 ? (overdueWOs / totalWOs) * 100 : 0;
        const pid = Number(project.id);
        const projectWOsList = wosByProject[pid] || [];
        const maxInactiveDays = projectWOsList.length > 0
          ? Math.max(...projectWOsList.map((w: any) => Number(w.days_since_update || 0)))
          : 0;

        const projectPhases = phasesByProject[pid] || [];
        const delayedPhases = projectPhases.filter((p: any) =>
          p.target_end_date && p.status !== 'completed' &&
          new Date(p.target_end_date).getTime() < Date.now()
        ).length;

        const healthScore = Math.max(0, 100 - overduePct - (maxInactiveDays * 2) - (delayedPhases * 10));

        if (healthScore < THRESHOLDS.p12_health_threshold) {
          const fingerprint = fp('p12_health', 'project', pid);
          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity: 'critical',
            title: `P12 Health Alert: ${project.project_name} (score: ${Math.round(healthScore)})`,
            description: `Project "${project.project_name}" health score is ${Math.round(healthScore)}/100.\nOverdue WOs: ${overdueWOs}/${totalWOs} (${Math.round(overduePct)}%)\nMax inactivity: ${maxInactiveDays}d\nDelayed phases: ${delayedPhases}\nCompletion: ${completionPct}%`,
            logicType: 'derived',
            dataSnapshot: { projectId: pid, healthScore, overduePct, maxInactiveDays, delayedPhases, completionPct },
            relatedEntityType: 'project',
            relatedEntityId: String(pid),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Health Alert: ${project.project_name}`,
              actionType: 'create_task',
              rationale: `Project health score (${Math.round(healthScore)}) is below threshold. Requires management review.`,
              actionPayload: {
                title: `[Agent] Project Control – Health Alert: ${project.project_name} (score: ${Math.round(healthScore)}/100)`,
                description: `Project "${project.project_name}" health score is critically low.\nScore: ${Math.round(healthScore)}/100\nOverdue WOs: ${overdueWOs}/${totalWOs}\nMax inactivity: ${maxInactiveDays}d\nDelayed phases: ${delayedPhases}\nAgent severity: critical\n\nRequires immediate management review.`,
                assignedTo: gmId,
                priority: 'Critical',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              priority: 'critical',
              confidence: 0.9,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

    } catch (err: any) {
      console.error(`[ProjectControl] Project Management module error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 2: DESIGN MANAGEMENT (D1–D10)
    // ════════════════════════════════════════════════════════════════════════
    try {
      // ── Grouped design query ──
      const drawingRows = await db.execute(sql`
        SELECT dd.id, dd.drawing_number, dd.drawing_title, dd.status, dd.due_date,
          dd.assigned_to_id, dd.category, dd.current_revision, dd.client_approval_required,
          dd.client_approved_date, dd.created_at, dd.updated_at,
          u.username as assignee_name, u.reporting_manager_id as assignee_mgr_id,
          dp.design_project_name, dp.design_manager_id, dp.project_id as parent_project_id,
          dp.id as design_project_id
        FROM design_drawings dd
        LEFT JOIN users u ON dd.assigned_to_id = u.id
        LEFT JOIN design_projects dp ON dd.design_project_id = dp.id
        WHERE dd.status NOT IN ('Approved', 'Issued', 'Superseded')
        ORDER BY dd.id
      `);
      queriesRun++;
      const drawings = (drawingRows.rows || []) as any[];

      const reviewRows = await db.execute(sql`
        SELECT dr.id, dr.review_title, dr.status, dr.priority, dr.due_date,
          dr.reviewer_id, dr.completed_date, dr.created_at, dr.updated_at,
          dr.drawing_id, dr.recommendation,
          u.username as reviewer_name, u.reporting_manager_id as reviewer_mgr_id,
          dd.drawing_number, dd.drawing_title,
          dp.design_project_name, dp.design_manager_id, dp.project_id as parent_project_id
        FROM design_reviews dr
        LEFT JOIN users u ON dr.reviewer_id = u.id
        LEFT JOIN design_drawings dd ON dr.drawing_id = dd.id
        LEFT JOIN design_projects dp ON dd.design_project_id = dp.id
        ORDER BY dr.id
      `);
      queriesRun++;
      const reviews = (reviewRows.rows || []) as any[];

      const drawingVersionRows = await db.execute(sql`
        SELECT dv.id, dv.drawing_id, dv.version, dv.revision, dv.review_status, dv.created_at
        FROM drawing_versions dv
        ORDER BY dv.drawing_id, dv.created_at DESC
      `);
      queriesRun++;
      const drawingVersions = (drawingVersionRows.rows || []) as any[];

      const designProjectRows = await db.execute(sql`
        SELECT dp.id, dp.design_project_name, dp.status, dp.overall_progress,
          dp.target_end_date, dp.design_manager_id, dp.project_id,
          u.username as manager_name,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id) as total_drawings,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id AND dd.status IN ('Approved', 'Issued')) as approved_drawings,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id AND dd.status NOT IN ('Approved', 'Issued', 'Superseded')) as open_drawings
        FROM design_projects dp
        LEFT JOIN users u ON dp.design_manager_id = u.id
        WHERE dp.status IN ('In Progress', 'Active', 'active', 'in_progress')
      `);
      queriesRun++;
      const designProjects = (designProjectRows.rows || []) as any[];

      // ── D1: Drawing Overdue ──
      for (const d of drawings) {
        if (!d.due_date) continue;
        const daysOverdue = Math.floor((Date.now() - new Date(d.due_date).getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue < 1) continue;

        const level: 'L1' | 'L2' = daysOverdue >= 30 ? 'L2' : 'L1';
        const fingerprint = fp('d1_drawing_overdue', 'drawing', d.id);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `D1 Drawing Overdue: ${d.drawing_number || d.drawing_title} (${daysOverdue}d)`,
          description: `Drawing "${d.drawing_title}" (${d.drawing_number || ''}) in project "${d.design_project_name || ''}" is ${daysOverdue} days past due date.\nAssigned to: ${d.assignee_name || 'Unassigned'}\nStatus: ${d.status}`,
          logicType: 'rule_based',
          dataSnapshot: { drawingId: d.id, daysOverdue },
          relatedEntityType: 'design_drawing',
          relatedEntityId: String(d.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            d.assigned_to_id ? Number(d.assigned_to_id) : null,
            d.parent_project_id ? Number(d.parent_project_id) : null,
            'Design'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Drawing Overdue: ${d.drawing_number || d.drawing_title}`,
            actionType: 'create_task',
            rationale: `Drawing is ${daysOverdue} days past due date.`,
            actionPayload: {
              title: `[Agent] Project Control – Drawing Overdue: ${d.drawing_number || ''} — "${d.drawing_title}" (${daysOverdue}d)`,
              description: `Drawing "${d.drawing_title}" (${d.drawing_number || ''}) in project "${d.design_project_name || ''}" is ${daysOverdue} days overdue.\nDue date: ${d.due_date}\nAssigned to: ${d.assignee_name || 'Unassigned'}\nStatus: ${d.status}\nAgent severity: ${agentSeverityFromLevel(level)}`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D2: Drawing Stuck in Review (10+ days) ──
      for (const r of reviews) {
        if (!['Pending', 'In Progress'].includes(r.status)) continue;
        const createdDate = r.created_at ? new Date(r.created_at) : null;
        const dueDate = r.due_date ? new Date(r.due_date) : null;
        const refDate = dueDate || createdDate;
        if (!refDate) continue;

        const daysInReview = Math.floor((Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysInReview < THRESHOLDS.d2_review_stuck_days) continue;

        const level: 'L1' | 'L2' = daysInReview >= 21 ? 'L2' : 'L1';
        const fingerprint = fp('d2_stuck_review', 'review', r.id);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `D2 Drawing Stuck in Review: ${r.review_title} (${daysInReview}d)`,
          description: `Review "${r.review_title}" for drawing ${r.drawing_number || ''} ("${r.drawing_title || ''}") has been in "${r.status}" status for ${daysInReview} days.\nReviewer: ${r.reviewer_name || 'Unassigned'}\nProject: ${r.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { reviewId: r.id, daysInReview, reviewerName: r.reviewer_name },
          relatedEntityType: 'design_review',
          relatedEntityId: String(r.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            r.reviewer_id ? Number(r.reviewer_id) : null,
            r.parent_project_id ? Number(r.parent_project_id) : null,
            'Design'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Drawing Stuck in Review: ${r.review_title}`,
            actionType: 'create_task',
            rationale: `Review has been pending for ${daysInReview} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Drawing Stuck in Review: ${r.review_title} (${daysInReview}d)`,
              description: `Review "${r.review_title}" for drawing ${r.drawing_number || ''} has been pending for ${daysInReview} days.\nReviewer: ${r.reviewer_name || 'Unassigned'}\nProject: ${r.design_project_name || ''}\nAgent severity: ${agentSeverityFromLevel(level)}`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D3: Review Comments Not Closed (7+ days) ──
      for (const r of reviews) {
        if (r.status !== 'Approved with Comments') continue;
        const completedDate = r.completed_date ? new Date(r.completed_date) : (r.updated_at ? new Date(r.updated_at) : null);
        if (!completedDate) continue;

        const daysSince = Math.floor((Date.now() - completedDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince < THRESHOLDS.d3_comments_pending_days) continue;

        const fingerprint = fp('d3_comments_open', 'review', r.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `D3 Review Comments Not Closed: ${r.review_title} (${daysSince}d pending)`,
          description: `Review "${r.review_title}" was approved with comments ${daysSince} days ago but comments remain open.\nDrawing: ${r.drawing_number || ''}\nProject: ${r.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { reviewId: r.id, daysSince },
          relatedEntityType: 'design_review',
          relatedEntityId: String(r.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            r.reviewer_id ? Number(r.reviewer_id) : null,
            r.parent_project_id ? Number(r.parent_project_id) : null,
            'Design'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Review Comments Open: ${r.review_title}`,
            actionType: 'create_task',
            rationale: `Review comments pending for ${daysSince} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Review Comments Open: ${r.review_title} (${daysSince}d pending)`,
              description: `Review "${r.review_title}" was approved with comments but comments remain open for ${daysSince} days.\nDrawing: ${r.drawing_number || ''}\nProject: ${r.design_project_name || ''}\nAgent severity: warning`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D4: Client Approval Pending (14+ days) ──
      for (const d of drawings) {
        if (!d.client_approval_required || d.client_approved_date) continue;
        const createdDate = new Date(d.created_at);
        const daysPending = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysPending < THRESHOLDS.d4_client_approval_days) continue;

        const fingerprint = fp('d4_client_approval', 'drawing', d.id);
        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: 'high',
          title: `D4 Client Approval Pending: ${d.drawing_number || d.drawing_title} (${daysPending}d)`,
          description: `Drawing "${d.drawing_title}" requires client approval pending for ${daysPending} days.\nProject: ${d.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { drawingId: d.id, daysPending },
          relatedEntityType: 'design_drawing',
          relatedEntityId: String(d.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const assignTo = d.design_manager_id ? Number(d.design_manager_id) : (deptHead || gmId);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Client Approval Pending: ${d.drawing_number || d.drawing_title}`,
            actionType: 'create_task',
            rationale: `Client approval pending for ${daysPending} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Client Approval Pending: ${d.drawing_number || ''} — "${d.drawing_title}" (${daysPending}d)`,
              description: `Drawing "${d.drawing_title}" requires client approval pending for ${daysPending} days.\nProject: ${d.design_project_name || ''}\nAgent severity: risk\n\nFollow up with client for approval.`,
              assignedTo: assignTo,
              priority: 'High',
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'high',
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D5: Revision Delay (latest version stale 14+ days, drawing not approved) ──
      const latestVersionByDrawing: Record<number, any> = {};
      for (const v of drawingVersions) {
        const did = Number(v.drawing_id);
        if (!latestVersionByDrawing[did]) latestVersionByDrawing[did] = v;
      }

      for (const d of drawings) {
        const latestVer = latestVersionByDrawing[Number(d.id)];
        if (!latestVer) continue;
        const daysSinceVersion = Math.floor((Date.now() - new Date(latestVer.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceVersion < THRESHOLDS.d5_revision_stale_days) continue;

        const fingerprint = fp('d5_revision_delay', 'drawing', d.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `D5 Revision Delayed: ${d.drawing_number || d.drawing_title} Rev ${latestVer.revision} (${daysSinceVersion}d stale)`,
          description: `Drawing "${d.drawing_title}" latest revision (${latestVer.revision}) was created ${daysSinceVersion} days ago and drawing is still not approved.\nProject: ${d.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { drawingId: d.id, revision: latestVer.revision, daysSinceVersion },
          relatedEntityType: 'design_drawing',
          relatedEntityId: String(d.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            d.assigned_to_id ? Number(d.assigned_to_id) : null,
            d.parent_project_id ? Number(d.parent_project_id) : null,
            'Design'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Revision Delayed: ${d.drawing_number || d.drawing_title}`,
            actionType: 'create_task',
            rationale: `Latest revision is ${daysSinceVersion} days old with no new version issued.`,
            actionPayload: {
              title: `[Agent] Project Control – Revision Delayed: ${d.drawing_number || ''} Rev ${latestVer.revision} (${daysSinceVersion}d stale)`,
              description: `Drawing "${d.drawing_title}" latest revision (${latestVer.revision}) is ${daysSinceVersion} days old.\nProject: ${d.design_project_name || ''}\nAgent severity: warning\n\nReview and issue updated revision if needed.`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D6 & D7: IFC/AFC Drawing Delayed (proxy from key stages) ──
      const ifcAfcStages = (await db.execute(sql`
        SELECT ks.id, ks.project_id, ks.stage_name, ks.phase, ks.is_completed,
          pp.target_end_date, p.name as project_name, p.manager_id
        FROM project_key_stages ks
        JOIN projects p ON ks.project_id = p.id
        LEFT JOIN project_phases pp ON pp.project_id = ks.project_id AND pp.name = ks.phase
        WHERE ks.is_completed = false
          AND ks.phase = 'Design'
          AND (ks.stage_name ILIKE '%IFC%' OR ks.stage_name ILIKE '%AFC%' OR ks.stage_name ILIKE '%issued for construction%' OR ks.stage_name ILIKE '%approved for construction%')
      `)).rows as any[];
      queriesRun++;

      for (const stage of ifcAfcStages) {
        if (!stage.target_end_date) continue;
        const daysOverdue = Math.floor((Date.now() - new Date(stage.target_end_date).getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue <= 0) continue;

        const isIFC = stage.stage_name.toUpperCase().includes('IFC');
        const findingId = isIFC ? 'd6_ifc_delayed' : 'd7_afc_delayed';
        const findingName = isIFC ? 'D6 IFC Delayed' : 'D7 AFC Delayed';
        const fingerprint = fp(findingId, 'stage', stage.id);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: 'high',
          title: `${findingName}: ${stage.stage_name} in ${stage.project_name} (${daysOverdue}d)`,
          description: `Key stage "${stage.stage_name}" in project "${stage.project_name}" is ${daysOverdue} days past design phase target.\nPhase target: ${stage.target_end_date}`,
          logicType: 'proxy',
          dataSnapshot: { stageId: stage.id, projectId: stage.project_id, daysOverdue },
          relatedEntityType: 'project_key_stage',
          relatedEntityId: String(stage.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const assignTo = deptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – ${isIFC ? 'IFC' : 'AFC'} Delayed: ${stage.project_name}`,
            actionType: 'create_task',
            rationale: `${isIFC ? 'IFC' : 'AFC'} stage is ${daysOverdue} days past target.`,
            actionPayload: {
              title: `[Agent] Project Control – ${isIFC ? 'IFC Drawing' : 'AFC Drawing'} Delayed: ${stage.stage_name} in ${stage.project_name} (${daysOverdue}d)`,
              description: `Key stage "${stage.stage_name}" in project "${stage.project_name}" is ${daysOverdue} days overdue.\nPhase target: ${stage.target_end_date}\nAgent severity: risk\n\nExpedite ${isIFC ? 'IFC' : 'AFC'} release.`,
              assignedTo: assignTo,
              priority: 'High',
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'high',
            confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D9: Design Backlog ──
      for (const dp of designProjects) {
        const openDrawings = Number(dp.open_drawings || 0);
        const progress = Number(dp.overall_progress || 0);
        if (openDrawings < THRESHOLDS.d9_backlog_threshold) continue;

        const fingerprint = fp('d9_backlog', 'dp', dp.id);
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach',
          severity: 'high',
          title: `D9 Design Backlog: ${dp.design_project_name} — ${openDrawings} open drawings`,
          description: `Design project "${dp.design_project_name}" has ${openDrawings} open drawings out of ${dp.total_drawings} total.\nProgress: ${progress}%\nManager: ${dp.manager_name || 'Unassigned'}`,
          logicType: 'rule_based',
          dataSnapshot: { dpId: dp.id, openDrawings, totalDrawings: dp.total_drawings, progress },
          relatedEntityType: 'design_project',
          relatedEntityId: String(dp.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = dp.design_manager_id ? Number(dp.design_manager_id) : (await resolveDepartmentHead('Design') || gmId);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Design Backlog: ${dp.design_project_name}`,
            actionType: 'create_task',
            rationale: `${openDrawings} open drawings need attention.`,
            actionPayload: {
              title: `[Agent] Project Control – Design Backlog: ${dp.design_project_name} (${openDrawings} open drawings)`,
              description: `Design project "${dp.design_project_name}" has ${openDrawings} open drawings.\nTotal: ${dp.total_drawings}\nApproved: ${dp.approved_drawings}\nProgress: ${progress}%\nAgent severity: risk\n\nReview workload and prioritize drawings.`,
              assignedTo: assignTo,
              priority: 'High',
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'high',
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D8: Design Blocking Procurement (cross-module) ──
      const phaseRows2 = await db.execute(sql`
        SELECT pp.project_id, p.name as project_name, p.manager_id,
          MAX(CASE WHEN pp.name = 'Design' THEN pp.status END) as design_status,
          MAX(CASE WHEN pp.name = 'Procurement' THEN pp.target_end_date END) as proc_target,
          MAX(CASE WHEN pp.name = 'Procurement' THEN pp.status END) as proc_status
        FROM project_phases pp
        JOIN projects p ON pp.project_id = p.id
        WHERE p.status NOT IN ('cancelled', 'archived', 'completed')
        GROUP BY pp.project_id, p.name, p.manager_id
        HAVING MAX(CASE WHEN pp.name = 'Design' THEN pp.status END) != 'completed'
          AND MAX(CASE WHEN pp.name = 'Procurement' THEN pp.target_end_date END) IS NOT NULL
      `);
      queriesRun++;

      for (const row of (phaseRows2.rows || []) as any[]) {
        if (!row.proc_target) continue;
        const procTarget = new Date(row.proc_target);
        const daysUntilProc = Math.ceil((procTarget.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilProc > 14) continue;

        const fingerprint = fp('d8_design_blocks_proc', 'project', row.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `D8 Design Blocking Procurement: ${row.project_name}`,
          description: `Design phase is incomplete but Procurement phase target is ${daysUntilProc <= 0 ? Math.abs(daysUntilProc) + 'd PAST' : daysUntilProc + 'd away'} in project "${row.project_name}".`,
          logicType: 'derived',
          dataSnapshot: { projectId: row.project_id, daysUntilProc },
          relatedEntityType: 'project',
          relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const assignTo = deptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Design Blocking Procurement: ${row.project_name}`,
            actionType: 'create_task',
            rationale: `Design phase incomplete is blocking procurement start.`,
            actionPayload: {
              title: `[Agent] Project Control – Design Blocking Procurement: ${row.project_name}`,
              description: `Design phase is incomplete but Procurement target is ${daysUntilProc <= 0 ? Math.abs(daysUntilProc) + 'd PAST' : 'in ' + daysUntilProc + 'd'}.\nProject: ${row.project_name}\nAgent severity: risk\n\nExpedite design completion to unblock procurement.`,
              assignedTo: assignTo,
              priority: 'High',
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'high',
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D10: Design Impacting Project Milestone (cross-module) ──
      for (const project of (await db.execute(sql`
        SELECT p.id, p.name, p.target_end_date, p.manager_id
        FROM projects p
        WHERE p.status NOT IN ('cancelled', 'archived', 'completed')
          AND p.target_end_date IS NOT NULL
      `)).rows as any[]) {
        if (!project.target_end_date) continue;
        const daysUntil = Math.ceil((new Date(project.target_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil > 30) continue;

        const incompleteDesignStages = (await db.execute(sql`
          SELECT COUNT(*) as cnt FROM project_key_stages
          WHERE project_id = ${project.id} AND phase = 'Design' AND is_completed = false
        `)).rows as any[];
        const incompleteCount = Number(incompleteDesignStages[0]?.cnt || 0);
        if (incompleteCount === 0) continue;

        const fingerprint = fp('d10_design_milestone', 'project', project.id);
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach',
          severity: 'critical',
          title: `D10 Design Impacting Milestone: ${project.name} — ${incompleteCount} design stages incomplete, ${daysUntil}d to deadline`,
          description: `Project "${project.name}" has ${incompleteCount} incomplete design stages with only ${daysUntil <= 0 ? '0' : daysUntil} days to deadline.`,
          logicType: 'derived',
          dataSnapshot: { projectId: project.id, incompleteCount, daysUntil },
          relatedEntityType: 'project',
          relatedEntityId: String(project.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Design Impacting Milestone: ${project.name}`,
            actionType: 'create_task',
            rationale: `${incompleteCount} design stages incomplete with deadline in ${daysUntil}d.`,
            actionPayload: {
              title: `[Agent] Project Control – Design Impacting Milestone: ${project.name} (${incompleteCount} design stages, ${daysUntil}d to deadline)`,
              description: `Project "${project.name}" has ${incompleteCount} incomplete design stages.\nDeadline: ${project.target_end_date} (${daysUntil <= 0 ? 'OVERDUE' : daysUntil + 'd remaining'})\nAgent severity: critical\n\nRequires immediate management review.`,
              assignedTo: gmId,
              priority: 'Critical',
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'critical',
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
      queriesRun++;

    } catch (err: any) {
      console.error(`[ProjectControl] Design Management module error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 3: PROCUREMENT MANAGEMENT (R1–R12)
    // ════════════════════════════════════════════════════════════════════════
    try {
      const purchaseDeptHead = await resolveDepartmentHead('Purchase');

      // ── Grouped procurement queries ──
      const sapPORows = await db.execute(sql`
        SELECT spo.id, spo.doc_num, spo.vendor_name, spo.vendor_code, spo.doc_date,
          spo.doc_due_date, spo.doc_total, spo.doc_currency, spo.project_code,
          spo.doc_status, spo.cancelled, spo.comments, spo.created_by,
          (CURRENT_DATE - spo.doc_due_date) as days_overdue,
          EXTRACT(DAY FROM NOW() - spo.created_at)::int as days_since_created
        FROM sap_purchase_orders spo
        WHERE spo.doc_status = 'bost_Open' AND spo.cancelled = 'tNO'
        ORDER BY spo.doc_due_date ASC NULLS LAST
      `);
      queriesRun++;
      const sapPOs = (sapPORows.rows || []) as any[];

      const sapPRRows = await db.execute(sql`
        SELECT spr.id, spr.doc_num, spr.doc_date, spr.due_date, spr.requester_name,
          spr.doc_status, spr.priority, spr.comments, spr.department, spr.created_by,
          (CURRENT_DATE - spr.due_date) as days_overdue
        FROM sap_purchase_requisitions spr
        WHERE spr.doc_status = 'bost_Open'
        ORDER BY spr.due_date ASC NULLS LAST
      `);
      queriesRun++;
      const sapPRs = (sapPRRows.rows || []) as any[];

      const localPORows = await db.execute(sql`
        SELECT po.id, po.purchase_order_number, po.title, po.status, po.vendor_id,
          po.project_id, p.name as project_name, po.required_by_date, po.created_by,
          po.created_at, po.actual_delivery_date,
          EXTRACT(DAY FROM NOW() - po.created_at)::int as days_since_created
        FROM purchase_orders po
        LEFT JOIN projects p ON po.project_id = p.id
        WHERE po.status NOT IN ('cancelled', 'completed', 'delivered')
        ORDER BY po.created_at
      `);
      queriesRun++;
      const localPOs = (localPORows.rows || []) as any[];

      const inspectionRows = await db.execute(sql`
        SELECT io.id, io.inspection_order_number, io.status, io.planned_date,
          io.completed_date, io.project_id, io.work_order_id, io.item_code,
          io.inspection_type, io.created_at,
          p.name as project_name, p.manager_id,
          EXTRACT(DAY FROM NOW() - io.created_at)::int as days_since_created
        FROM inspection_orders io
        LEFT JOIN projects p ON io.project_id = p.id
        WHERE io.status IN ('pending', 'Pending')
        ORDER BY io.created_at
      `);
      queriesRun++;
      const pendingInspections = (inspectionRows.rows || []) as any[];

      const goodsReceiptRows = await db.execute(sql`
        SELECT gr.id, gr.doc_num, gr.vendor_name, gr.base_doc_entry, gr.base_doc_num,
          gr.doc_date, gr.posting_date
        FROM sap_goods_receipt_po gr
        WHERE gr.cancelled = 'tNO'
        ORDER BY gr.doc_date DESC
      `);
      queriesRun++;
      const goodsReceipts = (goodsReceiptRows.rows || []) as any[];
      const grByBasePO: Record<string, any[]> = {};
      for (const gr of goodsReceipts) {
        const key = String(gr.base_doc_entry || gr.base_doc_num || '');
        if (key) {
          if (!grByBasePO[key]) grByBasePO[key] = [];
          grByBasePO[key].push(gr);
        }
      }

      // ── R1: PR Pending Conversion (7+ days) ──
      for (const pr of sapPRs) {
        if (!pr.due_date) continue;
        const daysOverdue = Number(pr.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r1_pr_conversion_days) continue;

        const level: 'L1' | 'L2' = daysOverdue >= 21 ? 'L2' : 'L1';
        const fingerprint = fp('r1_pr_pending', 'pr', pr.id);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `R1 PR Pending Conversion: PR#${pr.doc_num} (${daysOverdue}d)`,
          description: `Purchase requisition #${pr.doc_num} is ${daysOverdue} days past due date without PO conversion.\nRequester: ${pr.requester_name || 'Unknown'}\nDepartment: ${pr.department || 'N/A'}`,
          logicType: 'rule_based',
          dataSnapshot: { prId: pr.id, docNum: pr.doc_num, daysOverdue },
          relatedEntityType: 'purchase_requisition',
          relatedEntityId: String(pr.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = purchaseDeptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – PR Pending Conversion: PR#${pr.doc_num}`,
            actionType: 'create_task',
            rationale: `PR open for ${daysOverdue} days without PO issuance.`,
            actionPayload: {
              title: `[Agent] Project Control – PR Pending Conversion: PR#${pr.doc_num} (${daysOverdue}d overdue)`,
              description: `Purchase requisition #${pr.doc_num} is ${daysOverdue} days past due without PO conversion.\nRequester: ${pr.requester_name || 'Unknown'}\nDue: ${pr.due_date}\nAgent severity: ${agentSeverityFromLevel(level)}\n\nConvert to PO or update status.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R2: RFQ Pending (proxy: key stage "RFQs Sent" done but "Vendor Quotes Received" not) ──
      const rfqStages = (await db.execute(sql`
        SELECT ks1.project_id, p.name as project_name, p.manager_id,
          ks1.completed_date as rfq_sent_date
        FROM project_key_stages ks1
        JOIN projects p ON ks1.project_id = p.id
        WHERE ks1.stage_name ILIKE '%RFQ%Sent%' AND ks1.is_completed = true
          AND NOT EXISTS (
            SELECT 1 FROM project_key_stages ks2
            WHERE ks2.project_id = ks1.project_id
              AND ks2.stage_name ILIKE '%Vendor%Quotes%Received%'
              AND ks2.is_completed = true
          )
      `)).rows as any[];
      queriesRun++;

      for (const stage of rfqStages) {
        const daysSince = stage.rfq_sent_date
          ? Math.floor((Date.now() - new Date(stage.rfq_sent_date).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        if (daysSince < THRESHOLDS.r2_rfq_pending_days) continue;

        const fingerprint = fp('r2_rfq_pending', 'project', stage.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `R2 RFQ Pending Response: ${stage.project_name} (${daysSince}d since RFQ sent)`,
          description: `RFQs were sent for project "${stage.project_name}" ${daysSince} days ago but vendor quotes have not been received.`,
          logicType: 'proxy',
          dataSnapshot: { projectId: stage.project_id, daysSince },
          relatedEntityType: 'project',
          relatedEntityId: String(stage.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = purchaseDeptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – RFQ Pending Response: ${stage.project_name}`,
            actionType: 'create_task',
            rationale: `No vendor quotes received ${daysSince} days after RFQ.`,
            actionPayload: {
              title: `[Agent] Project Control – RFQ Pending Response: ${stage.project_name} (${daysSince}d)`,
              description: `RFQs sent for project "${stage.project_name}" ${daysSince} days ago but vendor quotes not received.\nAgent severity: warning\n\nFollow up with vendors.`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R3: Offer Evaluation Pending (proxy: "Vendor Quotes Received" done but "Vendors Selected" not) ──
      const evalStages = (await db.execute(sql`
        SELECT ks1.project_id, p.name as project_name, p.manager_id,
          ks1.completed_date as quotes_received_date
        FROM project_key_stages ks1
        JOIN projects p ON ks1.project_id = p.id
        WHERE ks1.stage_name ILIKE '%Vendor%Quotes%Received%' AND ks1.is_completed = true
          AND NOT EXISTS (
            SELECT 1 FROM project_key_stages ks2
            WHERE ks2.project_id = ks1.project_id
              AND ks2.stage_name ILIKE '%Vendors%Selected%'
              AND ks2.is_completed = true
          )
      `)).rows as any[];
      queriesRun++;

      for (const stage of evalStages) {
        const daysSince = stage.quotes_received_date
          ? Math.floor((Date.now() - new Date(stage.quotes_received_date).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        if (daysSince < THRESHOLDS.r3_eval_pending_days) continue;

        const fingerprint = fp('r3_eval_pending', 'project', stage.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `R3 Offer Evaluation Pending: ${stage.project_name} (${daysSince}d)`,
          description: `Vendor quotes received for project "${stage.project_name}" ${daysSince} days ago but vendor selection not completed.`,
          logicType: 'proxy',
          dataSnapshot: { projectId: stage.project_id, daysSince },
          relatedEntityType: 'project',
          relatedEntityId: String(stage.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = purchaseDeptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Offer Evaluation Pending: ${stage.project_name}`,
            actionType: 'create_task',
            rationale: `Vendor selection pending for ${daysSince} days after quotes received.`,
            actionPayload: {
              title: `[Agent] Project Control – Offer Evaluation Pending: ${stage.project_name} (${daysSince}d)`,
              description: `Vendor quotes received for "${stage.project_name}" ${daysSince} days ago but evaluation/selection not completed.\nAgent severity: warning\n\nComplete vendor evaluation and selection.`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R5: PO Release Delay (draft local POs stuck 14+ days) ──
      for (const po of localPOs) {
        if (po.status !== 'draft') continue;
        const daysSince = Number(po.days_since_created || 0);
        if (daysSince < THRESHOLDS.r5_po_draft_stuck_days) continue;

        const level: 'L1' | 'L2' = daysSince >= 30 ? 'L2' : 'L1';
        const fingerprint = fp('r5_po_release', 'local_po', po.id);

        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: severityFromLevel(level) as any,
          title: `R5 PO Release Delay: ${po.purchase_order_number} — ${po.title} (${daysSince}d in draft)`,
          description: `Purchase order "${po.title}" (${po.purchase_order_number}) for project "${po.project_name || 'N/A'}" has been in draft for ${daysSince} days.${!po.vendor_id ? ' No vendor assigned.' : ''}`,
          logicType: 'rule_based',
          dataSnapshot: { poId: po.id, daysSince, hasVendor: !!po.vendor_id },
          relatedEntityType: 'purchase_order',
          relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveAssignment(
            po.created_by ? Number(po.created_by) : null,
            po.project_id ? Number(po.project_id) : null,
            'Purchase'
          );
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – PO Release Delay: ${po.purchase_order_number}`,
            actionType: 'create_task',
            rationale: `PO in draft for ${daysSince} days. Finalize or cancel.`,
            actionPayload: {
              title: `[Agent] Project Control – PO Release Delay: ${po.purchase_order_number} — "${po.title}" (${daysSince}d in draft)`,
              description: `PO "${po.title}" (${po.purchase_order_number}) in draft for ${daysSince} days.\nProject: ${po.project_name || 'N/A'}\nRequired by: ${po.required_by_date || 'Not set'}\nAgent severity: ${agentSeverityFromLevel(level)}\n\nFinalize with vendor or cancel.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R6: Vendor Submission Overdue (SAP PO open, no goods receipt, 30+ days past due) ──
      for (const po of sapPOs) {
        if (!po.doc_due_date) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r6_vendor_submission_days) continue;
        if (daysOverdue >= THRESHOLDS.r7_manufacturing_delay_days) continue;

        const hasGR = grByBasePO[String(po.doc_entry)]?.length > 0 || grByBasePO[String(po.doc_num)]?.length > 0;
        if (hasGR) continue;

        const fingerprint = fp('r6_vendor_submit', 'sap_po', po.id);
        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: 'medium',
          title: `R6 Vendor Submission Overdue: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d)`,
          description: `SAP PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue} days past due with no goods receipt.\nValue: ${po.doc_currency} ${Number(po.doc_total || 0).toLocaleString()}`,
          logicType: 'proxy',
          dataSnapshot: { poId: po.id, docNum: po.doc_num, daysOverdue, vendorName: po.vendor_name },
          relatedEntityType: 'sap_purchase_order',
          relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = purchaseDeptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Vendor Submission Overdue: PO#${po.doc_num}`,
            actionType: 'create_task',
            rationale: `No vendor submission ${daysOverdue} days past due.`,
            actionPayload: {
              title: `[Agent] Project Control – Vendor Submission Overdue: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d)`,
              description: `PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue}d past due with no goods receipt.\nValue: ${po.doc_currency} ${Number(po.doc_total || 0).toLocaleString()}\nAgent severity: warning\n\nContact vendor for submission status.`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R7: Manufacturing Delay (SAP PO 60+ days overdue, no GR) ──
      for (const po of sapPOs) {
        if (!po.doc_due_date) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r7_manufacturing_delay_days) continue;

        const hasGR = grByBasePO[String(po.doc_entry)]?.length > 0 || grByBasePO[String(po.doc_num)]?.length > 0;
        if (hasGR) continue;

        const fingerprint = fp('r7_mfg_delay', 'sap_po', po.id);
        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: 'high',
          title: `R7 Manufacturing Delay: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d overdue)`,
          description: `SAP PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue} days overdue with no goods receipt — likely vendor manufacturing delay.\nValue: ${po.doc_currency} ${Number(po.doc_total || 0).toLocaleString()}`,
          logicType: 'proxy',
          dataSnapshot: { poId: po.id, docNum: po.doc_num, daysOverdue, vendorName: po.vendor_name },
          relatedEntityType: 'sap_purchase_order',
          relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const mgr = purchaseDeptHead ? await resolveReportingManager(purchaseDeptHead) : null;
          const assignTo = mgr || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Manufacturing Delay: PO#${po.doc_num}`,
            actionType: 'create_task',
            rationale: `Vendor manufacturing likely delayed — ${daysOverdue}d overdue with no goods receipt.`,
            actionPayload: {
              title: `[Agent] Project Control – Manufacturing Delay: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d)`,
              description: `PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue}d overdue with no goods receipt.\nValue: ${po.doc_currency} ${Number(po.doc_total || 0).toLocaleString()}\nAgent severity: risk\n\nEscalate vendor manufacturing status.`,
              assignedTo: assignTo,
              priority: 'High',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'high',
            confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R8: Delivery Date Missed ──
      for (const po of sapPOs) {
        if (!po.doc_due_date) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r8_delivery_missed_days) continue;
        if (daysOverdue >= THRESHOLDS.r6_vendor_submission_days) continue;

        const level: 'L1' | 'L2' | 'L3' = daysOverdue >= 90 ? 'L3' : daysOverdue >= 30 ? 'L2' : 'L1';
        const fingerprint = fp('r8_delivery_missed', 'sap_po', po.id);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `R8 Delivery Missed: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d)`,
          description: `SAP PO #${po.doc_num} from "${po.vendor_name}" delivery date missed by ${daysOverdue} days.\nDue: ${po.doc_due_date}\nValue: ${po.doc_currency} ${Number(po.doc_total || 0).toLocaleString()}`,
          logicType: 'rule_based',
          dataSnapshot: { poId: po.id, docNum: po.doc_num, daysOverdue, vendorName: po.vendor_name },
          relatedEntityType: 'sap_purchase_order',
          relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = purchaseDeptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Delivery Missed: PO#${po.doc_num}`,
            actionType: 'create_task',
            rationale: `Delivery date missed by ${daysOverdue} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Delivery Missed: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d overdue)`,
              description: `PO #${po.doc_num} from "${po.vendor_name}" delivery missed by ${daysOverdue}d.\nDue: ${po.doc_due_date}\nValue: ${po.doc_currency} ${Number(po.doc_total || 0).toLocaleString()}\nAgent severity: ${agentSeverityFromLevel(level)}\n\nFollow up on delivery status.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R9: Inspection Pending ──
      for (const io of pendingInspections) {
        const daysPending = Number(io.days_since_created || 0);
        if (io.planned_date) {
          const daysOverdue = Math.floor((Date.now() - new Date(io.planned_date).getTime()) / (1000 * 60 * 60 * 24));
          if (daysOverdue < 1) continue;
        } else {
          if (daysPending < THRESHOLDS.r9_inspection_pending_days) continue;
        }

        const fingerprint = fp('r9_inspection', 'io', io.id);
        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: 'medium',
          title: `R9 Inspection Pending: ${io.inspection_order_number} (${daysPending}d)`,
          description: `Inspection order ${io.inspection_order_number} is pending for ${daysPending} days.\nType: ${io.inspection_type || 'N/A'}\nProject: ${io.project_name || 'N/A'}\nPlanned date: ${io.planned_date || 'Not scheduled'}`,
          logicType: 'rule_based',
          dataSnapshot: { ioId: io.id, daysPending, inspectionType: io.inspection_type },
          relatedEntityType: 'inspection_order',
          relatedEntityId: String(io.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const qcHead = await resolveDepartmentHead('Quality Control');
          const assignTo = qcHead || (io.manager_id ? Number(io.manager_id) : gmId);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Inspection Pending: ${io.inspection_order_number}`,
            actionType: 'create_task',
            rationale: `Inspection pending for ${daysPending} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Inspection Pending: ${io.inspection_order_number} (${daysPending}d)`,
              description: `Inspection order ${io.inspection_order_number} pending for ${daysPending} days.\nType: ${io.inspection_type || 'N/A'}\nProject: ${io.project_name || 'N/A'}\nPlanned: ${io.planned_date || 'Not scheduled'}\nAgent severity: warning\n\nSchedule and complete inspection.`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R10: Dispatch Delay (goods receipt exists but PO still open) ──
      for (const po of sapPOs) {
        const hasGR = grByBasePO[String(po.doc_entry)]?.length > 0 || grByBasePO[String(po.doc_num)]?.length > 0;
        if (!hasGR) continue;
        if (!po.doc_due_date) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r10_dispatch_delay_days) continue;

        const fingerprint = fp('r10_dispatch', 'sap_po', po.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `R10 Dispatch Delay: PO#${po.doc_num} — ${po.vendor_name} (GR received, PO still open)`,
          description: `PO #${po.doc_num} has goods receipt but remains open ${daysOverdue}d past due. Material may not have been dispatched/received fully.`,
          logicType: 'proxy',
          dataSnapshot: { poId: po.id, docNum: po.doc_num, daysOverdue, vendorName: po.vendor_name },
          relatedEntityType: 'sap_purchase_order',
          relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const storesHead = await resolveDepartmentHead('Stores');
          const assignTo = storesHead || purchaseDeptHead || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Dispatch Delay: PO#${po.doc_num}`,
            actionType: 'create_task',
            rationale: `Goods receipt exists but PO still open — possible dispatch/receipt issue.`,
            actionPayload: {
              title: `[Agent] Project Control – Dispatch Delay: PO#${po.doc_num} — ${po.vendor_name}`,
              description: `PO #${po.doc_num} has partial goods receipt but remains open ${daysOverdue}d past due.\nVendor: ${po.vendor_name}\nAgent severity: warning\n\nVerify dispatch status and close PO if fully received.`,
              assignedTo: assignTo,
              priority: 'Medium',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'medium',
            confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R11: Logistics Delay (open PO 30+ days overdue with partial GR) ──
      for (const po of sapPOs) {
        if (!po.doc_due_date) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r11_logistics_delay_days) continue;

        const grList = grByBasePO[String(po.doc_entry)] || grByBasePO[String(po.doc_num)] || [];
        if (grList.length === 0) continue;

        const fingerprint = fp('r11_logistics', 'sap_po', po.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `R11 Logistics Delay: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d, partial receipt)`,
          description: `PO #${po.doc_num} has ${grList.length} goods receipts but remains open ${daysOverdue}d past due. Possible logistics/transit delay.`,
          logicType: 'proxy',
          dataSnapshot: { poId: po.id, docNum: po.doc_num, daysOverdue, grCount: grList.length },
          relatedEntityType: 'sap_purchase_order',
          relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const mgr = purchaseDeptHead ? await resolveReportingManager(purchaseDeptHead) : null;
          const assignTo = mgr || gmId;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Logistics Delay: PO#${po.doc_num}`,
            actionType: 'create_task',
            rationale: `Partial receipt with PO still open ${daysOverdue}d — logistics issue.`,
            actionPayload: {
              title: `[Agent] Project Control – Logistics Delay: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d)`,
              description: `PO #${po.doc_num} has ${grList.length} goods receipts but remains open ${daysOverdue}d past due.\nVendor: ${po.vendor_name}\nAgent severity: risk\n\nInvestigate transit/logistics status.`,
              assignedTo: assignTo,
              priority: 'High',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'high',
            confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R4: Critical PR Not Raised (cross-module) ──
      const procPhaseProjects = (await db.execute(sql`
        SELECT pp.project_id, p.name as project_name, p.manager_id,
          pp.target_end_date as proc_target, pp.status as proc_status
        FROM project_phases pp
        JOIN projects p ON pp.project_id = p.id
        WHERE pp.name = 'Procurement' AND pp.status != 'completed'
          AND pp.target_end_date IS NOT NULL
          AND p.status NOT IN ('cancelled', 'archived', 'completed')
      `)).rows as any[];
      queriesRun++;

      for (const proj of procPhaseProjects) {
        const procTarget = new Date(proj.proc_target);
        const daysUntil = Math.ceil((procTarget.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil > 14) continue;

        const prCount = (await db.execute(sql`
          SELECT COUNT(*) as cnt FROM sap_purchase_requisitions spr
          WHERE spr.doc_status = 'bost_Open'
        `)).rows as any[];

        const poCount = (await db.execute(sql`
          SELECT COUNT(*) as cnt FROM sap_purchase_orders spo
          WHERE spo.project_code = ${proj.project_name?.substring(0, 8) || 'NONE'}
            AND spo.doc_status = 'bost_Open' AND spo.cancelled = 'tNO'
        `)).rows as any[];

        const totalProcItems = Number(prCount[0]?.cnt || 0) + Number(poCount[0]?.cnt || 0);

        const fingerprint = fp('r4_critical_pr', 'project', proj.project_id);
        if (totalProcItems === 0 || daysUntil <= 0) {
          const finding = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: 'high',
            title: `R4 Critical PR Not Raised: ${proj.project_name} — procurement phase ${daysUntil <= 0 ? 'OVERDUE' : daysUntil + 'd away'}`,
            description: `Project "${proj.project_name}" procurement phase target is ${daysUntil <= 0 ? 'overdue' : daysUntil + 'd away'} but procurement activity is insufficient.`,
            logicType: 'derived',
            dataSnapshot: { projectId: proj.project_id, daysUntil, totalProcItems },
            relatedEntityType: 'project',
            relatedEntityId: String(proj.project_id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(Number(proj.project_id));
            const assignTo = pm || gmId;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Critical PR Not Raised: ${proj.project_name}`,
              actionType: 'create_task',
              rationale: `Procurement phase approaching but insufficient procurement activity.`,
              actionPayload: {
                title: `[Agent] Project Control – Critical PR Not Raised: ${proj.project_name}`,
                description: `Project "${proj.project_name}" procurement phase is ${daysUntil <= 0 ? 'OVERDUE' : daysUntil + 'd away'} but procurement activity is insufficient.\nAgent severity: risk\n\nRaise required purchase requisitions immediately.`,
                assignedTo: assignTo,
                priority: 'High',
                category: `Procurement ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              priority: 'high',
              confidence: 0.8,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── R12: Material Delay Affecting Project (cross-module) ──
      for (const po of sapPOs) {
        if (!po.doc_due_date || !po.project_code) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < 14) continue;

        const projMatch = (await db.execute(sql`
          SELECT p.id, p.name, p.target_end_date, p.manager_id
          FROM projects p
          WHERE p.code = ${po.project_code} OR p.name ILIKE ${'%' + po.project_code + '%'}
          LIMIT 1
        `)).rows as any[];

        if (projMatch.length === 0) continue;
        const proj = projMatch[0];

        const mfgPhase = (await db.execute(sql`
          SELECT pp.target_end_date FROM project_phases pp
          WHERE pp.project_id = ${proj.id} AND pp.name = 'Manufacturing'
          LIMIT 1
        `)).rows as any[];

        if (mfgPhase.length === 0) continue;
        const mfgTarget = mfgPhase[0].target_end_date;
        if (!mfgTarget) continue;
        const daysToMfg = Math.ceil((new Date(mfgTarget).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysToMfg > 30) continue;

        const fingerprint = fp('r12_material_impact', 'sap_po', po.id);
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach',
          severity: 'critical',
          title: `R12 Material Delay Affecting Project: PO#${po.doc_num} impacting ${proj.name}`,
          description: `PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue}d overdue and linked to project "${proj.name}" with Manufacturing phase ${daysToMfg <= 0 ? 'OVERDUE' : daysToMfg + 'd away'}.`,
          logicType: 'derived',
          dataSnapshot: { poId: po.id, projectId: proj.id, daysOverdue, daysToMfg },
          relatedEntityType: 'project',
          relatedEntityId: String(proj.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Material Delay Affecting Project: ${proj.name}`,
            actionType: 'create_task',
            rationale: `Overdue PO impacting project manufacturing timeline.`,
            actionPayload: {
              title: `[Agent] Project Control – Material Delay Affecting Project: PO#${po.doc_num} → ${proj.name}`,
              description: `PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue}d overdue.\nProject: ${proj.name}\nManufacturing phase: ${daysToMfg <= 0 ? 'OVERDUE' : daysToMfg + 'd away'}\nAgent severity: critical\n\nRequires immediate management intervention.`,
              assignedTo: gmId,
              priority: 'Critical',
              category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            priority: 'critical',
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

    } catch (err: any) {
      console.error(`[ProjectControl] Procurement Management module error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // AUTO-EXECUTE APPROVED RECOMMENDATIONS
    // ════════════════════════════════════════════════════════════════════════
    for (const recId of autoExecuteQueue) {
      try {
        const rows = await db.execute(sql`
          SELECT id, action_type, action_payload, status FROM agent_recommendations WHERE id = ${recId}
        `);
        const rec = (rows.rows as any[])[0];
        if (!rec || rec.status !== 'approved') continue;

        const payload = typeof rec.action_payload === 'string' ? JSON.parse(rec.action_payload) : rec.action_payload;
        if (!payload?.title) continue;

        const today = new Date().toISOString().split('T')[0];
        const finishDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

        await db.execute(sql`
          INSERT INTO tasks (title, description, status, assigned_to, created_by, priority, category, start_date, finish_date, source_type, source_id, source_agent, created_at)
          VALUES (
            ${payload.title},
            ${payload.description || ''},
            'pending',
            ${payload.assignedTo || 1},
            1,
            ${payload.priority || 'Medium'},
            ${payload.category || 'Project'},
            ${today},
            ${finishDate},
            'agent_task',
            ${recId},
            ${SOURCE_AGENT},
            NOW()::text
          )
        `);

        await db.execute(sql`
          UPDATE agent_recommendations SET status = 'executed', executed_at = NOW() WHERE id = ${recId}
        `);
        autoExecutedCount++;
      } catch (err: any) {
        console.error(`[ProjectControl] Auto-execute error for rec ${recId}:`, err.message);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ProjectControl] Complete: ${findingsCount} findings, ${recommendationsCount} recommendations, ${autoExecutedCount} auto-executed, ${autoClosedCount} auto-closed, ${queriesRun} queries in ${elapsed}ms`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      autoExecutedActions: autoExecutedCount,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Project Control Agent (34-finding model): ${findingsCount} findings, ${recommendationsCount} recommendations, ${autoExecutedCount} tasks created, ${autoClosedCount} resolved tasks auto-closed. Modules: Project (P1-P12), Design (D1-D10), Procurement (R1-R12).`,
    };
  }
}
