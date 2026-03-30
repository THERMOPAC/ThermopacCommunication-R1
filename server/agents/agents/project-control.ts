import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { resolveEscalation, severityToLevel } from '../framework/escalation';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  resolveProjectManager, resolveReportingManager, resolveDepartmentHead,
  severityFromLevel, priorityFromLevel,
  fpWithProject, fpGlobal, hasOpenTask as hasOpenTaskShared, hasCompletedTask as hasCompletedTaskShared,
  resolveAssignment,
} from './project-control-shared';
import { fetchOpenPurchaseOrders, fetchRecentGRPOs, buildGRPOLookupByBasePO } from './sap-live-queries';
import {
  EPC_FINDING_DEFS, hasGracePassed, trackFinding, markAlerted, markTaskCreated, resolveFindings,
} from './epc-findings-tracker';

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
  p10_weighted_load_threshold: 12,
  p12_red_threshold: 40,
  p12_amber_threshold: 60,
  p12_watch_threshold: 80,
  d2_review_stuck_days: 10,
  d3_comments_pending_days: 7,
  d4_client_approval_days: 14,
  d5_revision_stale_days: 14,
  d9_backlog_threshold: 5,
  r1_pr_conversion_days: 7,
  r3_eval_pending_days: 7,
  r5_po_draft_stuck_days: 14,
  r8_delivery_missed_days: 14,
  r9_inspection_pending_days: 14,
  r10_dispatch_delay_days: 7,
  r2_rfq_pending_days: 7,
  r6_vendor_submission_days: 30,
  r7_manufacturing_delay_days: 90,
  r7_manufacturing_delay_max_days: 365,
  r8_delivery_missed_max_days: 180,
  r11_logistics_delay_days: 30,
};

const AGENT_SEVERITY_MAP: Record<string, string> = {
  P1: 'warning', P3: 'warning', P5: 'warning', P6: 'warning', P10: 'warning',
  P4: 'warning',
  P2: 'risk', P7: 'risk', P8: 'risk', P11: 'risk',
  P9: 'critical', P12: 'critical',
  D1: 'warning', D2: 'warning', D3: 'warning', D5: 'warning',
  D4: 'risk', D8: 'risk', D9: 'risk',
  D6: 'risk', D7: 'risk', D10: 'critical',
  R1: 'warning', R2: 'warning', R3: 'warning', R5: 'warning', R8: 'warning',
  R9: 'warning', R10: 'warning',
  R6: 'warning', R7: 'risk', R11: 'risk', R4: 'risk',
  R12: 'critical',
};

function agentSev(findingCode: string, escalatedLevel?: 'L1' | 'L2' | 'L3'): string {
  const base = AGENT_SEVERITY_MAP[findingCode] || 'warning';
  if (escalatedLevel === 'L3') return 'critical';
  if (escalatedLevel === 'L2' && base === 'warning') return 'risk';
  return base;
}

async function hasOpenTask(fingerprint: string): Promise<boolean> {
  return hasOpenTaskShared(fingerprint, SOURCE_AGENT);
}

async function hasCompletedTask(fingerprint: string): Promise<boolean> {
  return hasCompletedTaskShared(fingerprint, SOURCE_AGENT);
}

function healthBand(score: number): string {
  if (score >= 80) return 'Green';
  if (score >= 60) return 'Watch';
  if (score >= 40) return 'Amber';
  return 'Red';
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closed = 0;

  const openTasks = await db.execute(sql`
    SELECT id, category FROM tasks
    WHERE source_type = 'agent_task' AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'cancelled')
      AND category LIKE '%[fp:pc_%'
  `);

  for (const row of (openTasks.rows as any[])) {
    const cat = row.category || '';
    let shouldClose = false;

    const woMatch = cat.match(/\[fp:pc_(?:p1_overdue_task|p3_stuck):p\d+:wo:(\d+)\]/);
    if (woMatch) {
      const check = await db.execute(sql`SELECT status FROM work_orders WHERE id = ${parseInt(woMatch[1])}`);
      const s = (check.rows as any[])[0]?.status;
      if (s === 'completed' || s === 'cancelled') shouldClose = true;
    }

    const reviewMatch = cat.match(/\[fp:pc_d2_stuck_review:p\d+:review:(\d+)\]/);
    if (reviewMatch) {
      const check = await db.execute(sql`SELECT status FROM design_reviews WHERE id = ${parseInt(reviewMatch[1])}`);
      const s = (check.rows as any[])[0]?.status;
      if (s === 'Approved' || s === 'Approved with Comments' || s === 'Rejected') shouldClose = true;
    }

    const poMatch = cat.match(/\[fp:pc_(?:r8_delivery_missed|r6_vendor_submit|r7_mfg_delay):p\w+:sap_po:(\d+)\]/);
    if (poMatch) {
      shouldClose = false;
    }

    const drawingMatch = cat.match(/\[fp:pc_d1_drawing_overdue:p\d+:drawing:(\d+)\]/);
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

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) console.log(`[ProjectControl] Auto-closed ${autoClosedCount} resolved tasks`);
    } catch (err: any) {
      console.error(`[ProjectControl] Auto-close error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 1: PROJECT MANAGEMENT (P1–P12)
    // Grouped queries for project data
    // ════════════════════════════════════════════════════════════════════════
    try {
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

      const wosByProject: Record<number, any[]> = {};
      for (const wo of allWOs) {
        const pid = Number(wo.project_id);
        if (!wosByProject[pid]) wosByProject[pid] = [];
        wosByProject[pid].push(wo);
      }

      const phasesByProject: Record<number, any[]> = {};
      for (const p of phases) {
        const pid = Number(p.project_id);
        if (!phasesByProject[pid]) phasesByProject[pid] = [];
        phasesByProject[pid].push(p);
      }

      const keyStagesByProject: Record<number, any[]> = {};
      for (const ks of keyStages) {
        const pid = Number(ks.project_id);
        if (!keyStagesByProject[pid]) keyStagesByProject[pid] = [];
        keyStagesByProject[pid].push(ks);
      }

      // ── P1: Overdue Task (WOs past planned_end_date) ──
      for (const wo of allWOs) {
        if (!wo.planned_end_date) continue;
        const daysOverdue = Number(wo.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.p1_overdue_days) continue;

        const fingerprint = fpWithProject('p1_overdue_task', wo.project_id, 'wo', wo.id);

        // Progressive escalation: always start at L1, escalate only if prior level task was completed but issue persists
        const l1Fp = `${fingerprint}_L1`;
        const l2Fp = `${fingerprint}_L2`;
        const l3Fp = `${fingerprint}_L3`;
        const hasOpenL1 = await hasOpenTask(l1Fp);
        const hasOpenL2 = await hasOpenTask(l2Fp);
        const hasOpenL3 = await hasOpenTask(l3Fp);
        const hasCompletedL1 = !hasOpenL1 && await hasCompletedTask(l1Fp);
        const hasCompletedL2 = !hasOpenL2 && await hasCompletedTask(l2Fp);

        let level: 'L1' | 'L2' | 'L3';
        let currentFp: string;
        if (!hasOpenL1 && !hasCompletedL1) {
          level = 'L1'; currentFp = l1Fp;
        } else if (hasCompletedL1 && !hasOpenL2 && !hasCompletedL2 && daysOverdue >= 30) {
          level = 'L2'; currentFp = l2Fp;
        } else if (hasCompletedL1 && hasCompletedL2 && !hasOpenL3 && daysOverdue >= 90) {
          level = 'L3'; currentFp = l3Fp;
        } else {
          continue;
        }
        const severity = agentSev('P1', level);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `P1 Overdue Task: ${wo.work_order_number} — ${wo.title} (${daysOverdue}d)`,
          description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" is ${daysOverdue} days past planned end date (${wo.planned_end_date}).\nStatus: ${wo.status}\nEscalation: ${level}`,
          logicType: 'rule_based',
          dataSnapshot: { woId: wo.id, daysOverdue, projectId: wo.project_id, escalationLevel: level },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(currentFp)) {
          const entityOwner = wo.supervisor_id ? Number(wo.supervisor_id) : pm;
          const assignTo = await resolveEscalation(level, entityOwner);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Overdue Task: ${wo.work_order_number} (${level} Escalation)`,
            actionType: 'create_task',
            description: `Work order ${wo.work_order_number} is ${daysOverdue} days overdue. Escalation level: ${level}.`,
            actionPayload: {
              title: `[Agent] Project Control – Overdue Task: ${wo.work_order_number} — "${wo.title}" (${daysOverdue}d overdue) [${level}]`,
              description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" is ${daysOverdue} days past planned end date.\nPlanned end: ${wo.planned_end_date}\nStatus: ${wo.status}\nagent_severity: ${severity}\nEscalation: ${level}\n\nPlease review and update status or escalate blockers.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Project ${currentFp}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
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

        const fingerprint = fpWithProject('p3_stuck', wo.project_id, 'wo', wo.id);

        // Progressive escalation: L1 first, then L2 only if L1 completed but issue persists
        const stuckL1Fp = `${fingerprint}_L1`;
        const stuckL2Fp = `${fingerprint}_L2`;
        const hasOpenStuckL1 = await hasOpenTask(stuckL1Fp);
        const hasOpenStuckL2 = await hasOpenTask(stuckL2Fp);
        const hasCompletedStuckL1 = !hasOpenStuckL1 && await hasCompletedTask(stuckL1Fp);

        let stuckLevel: 'L1' | 'L2';
        let stuckCurrentFp: string;
        if (!hasOpenStuckL1 && !hasCompletedStuckL1) {
          stuckLevel = 'L1'; stuckCurrentFp = stuckL1Fp;
        } else if (hasCompletedStuckL1 && !hasOpenStuckL2 && daysSinceUpdate >= 30) {
          stuckLevel = 'L2'; stuckCurrentFp = stuckL2Fp;
        } else {
          continue;
        }
        const severity = agentSev('P3', stuckLevel);

        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: severityFromLevel(stuckLevel) as any,
          title: `P3 Task Stuck: ${wo.work_order_number} — ${daysSinceUpdate}d no update`,
          description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" has had no status update for ${daysSinceUpdate} days.\nCurrent status: ${wo.status}\nEscalation: ${stuckLevel}`,
          logicType: 'rule_based',
          dataSnapshot: { woId: wo.id, daysSinceUpdate, projectId: wo.project_id, escalationLevel: stuckLevel },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(stuckCurrentFp)) {
          const entityOwner = wo.supervisor_id ? Number(wo.supervisor_id) : pm;
          const assignTo = await resolveEscalation(stuckLevel, entityOwner);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Task Stuck: ${wo.work_order_number} (${stuckLevel} Escalation)`,
            actionType: 'create_task',
            description: `Work order has not been updated for ${daysSinceUpdate} days. Escalation level: ${stuckLevel}.`,
            actionPayload: {
              title: `[Agent] Project Control – Task Stuck: ${wo.work_order_number} — "${wo.title}" (${daysSinceUpdate}d no update) [${stuckLevel}]`,
              description: `Work order "${wo.title}" (${wo.work_order_number}) in project "${wo.project_name}" has had no update for ${daysSinceUpdate} days.\nStatus: ${wo.status}\nLast update: ${wo.updated_at}\nagent_severity: ${severity}\nEscalation: ${stuckLevel}\n\nPlease review status, update progress, or report blockers.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(stuckLevel),
              category: `Project ${stuckCurrentFp}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: severityFromLevel(stuckLevel) as any,
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P5: No Recent Activity (7d) & P11: Project Inactive (14d) ──
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

        if (daysSinceActivity >= THRESHOLDS.p11_inactive_days) {
          const fingerprint = fpWithProject('p11_inactive', pid, 'project', pid);
          const severity = agentSev('P11');
          const finding = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: 'high',
            title: `P11 Project Inactive: ${project.project_name} — ${daysSinceActivity}d no updates`,
            description: `Project "${project.project_name}" has had no work order updates for ${daysSinceActivity} days.`,
            logicType: 'rule_based',
            dataSnapshot: { projectId: pid, daysSinceActivity },
            relatedEntityType: 'project',
            relatedEntityId: String(pid),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(pid);
            const assignTo = await resolveEscalation('L1', pm);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Project Inactive: ${project.project_name}`,
              actionType: 'create_task',
              description: `No work order updates for ${daysSinceActivity} days.`,
              actionPayload: {
                title: `[Agent] Project Control – Project Inactive: ${project.project_name} (${daysSinceActivity}d no updates)`,
                description: `Project "${project.project_name}" has had no work order updates for ${daysSinceActivity} days.\nagent_severity: ${severity}\n\nPlease review project status and provide an update.`,
                assignedTo: assignTo,
                priority: 'High',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: 'high',
              confidence: 0.9,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        } else if (daysSinceActivity >= THRESHOLDS.p5_inactive_days) {
          const fingerprint = fpWithProject('p5_no_activity', pid, 'project', pid);
          const severity = agentSev('P5');
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
            const assignTo = await resolveEscalation('L1', pm);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – No Activity: ${project.project_name}`,
              actionType: 'create_task',
              description: `No updates for ${daysSinceActivity} days.`,
              actionPayload: {
                title: `[Agent] Project Control – No Activity: ${project.project_name} (${daysSinceActivity}d silent)`,
                description: `Project "${project.project_name}" has had no work order updates for ${daysSinceActivity} days.\nagent_severity: ${severity}\n\nPlease provide a status update.`,
                assignedTo: assignTo,
                priority: 'Medium',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
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
        const pid = Number(project.id);

        if (daysUntil <= THRESHOLDS.p8_slippage_warning_days && daysUntil > -365 && completionPct < 90) {
          const fingerprint = fpWithProject('p8_schedule_slip', pid, 'project', pid);

          const p8L1Fp = `${fingerprint}_L1`;
          const p8L2Fp = `${fingerprint}_L2`;
          const p8L3Fp = `${fingerprint}_L3`;
          const hasOpenP8L1 = await hasOpenTask(p8L1Fp);
          const hasOpenP8L2 = await hasOpenTask(p8L2Fp);
          const hasOpenP8L3 = await hasOpenTask(p8L3Fp);
          const hasCompletedP8L1 = !hasOpenP8L1 && await hasCompletedTask(p8L1Fp);
          const hasCompletedP8L2 = !hasOpenP8L2 && await hasCompletedTask(p8L2Fp);

          let p8Level: 'L1' | 'L2' | 'L3';
          let p8CurrentFp: string;
          if (!hasOpenP8L1 && !hasCompletedP8L1) {
            p8Level = 'L1'; p8CurrentFp = p8L1Fp;
          } else if (hasCompletedP8L1 && !hasOpenP8L2 && !hasCompletedP8L2 && daysUntil <= 0) {
            p8Level = 'L2'; p8CurrentFp = p8L2Fp;
          } else if (hasCompletedP8L1 && hasCompletedP8L2 && !hasOpenP8L3 && daysUntil <= -30) {
            p8Level = 'L3'; p8CurrentFp = p8L3Fp;
          } else {
            continue;
          }
          const severity = agentSev('P8', p8Level);

          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity: severityFromLevel(p8Level) as any,
            title: `P8 Schedule Slippage: ${project.project_name} — ${daysUntil <= 0 ? Math.abs(daysUntil) + 'd PAST deadline' : daysUntil + 'd to deadline'}, ${completionPct}% complete`,
            description: `Project "${project.project_name}" ${daysUntil <= 0 ? 'is ' + Math.abs(daysUntil) + ' days PAST its deadline' : 'is due in ' + daysUntil + ' days'} but only ${completionPct}% of work orders are completed.\nOverdue WOs: ${project.overdue_work_orders}\nEscalation: ${p8Level}`,
            logicType: 'rule_based',
            dataSnapshot: { projectId: pid, daysUntil, completionPct, overdueWOs: project.overdue_work_orders, escalationLevel: p8Level },
            relatedEntityType: 'project',
            relatedEntityId: String(pid),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(p8CurrentFp)) {
            const pm = await resolveProjectManager(pid);
            const assignTo = await resolveEscalation(p8Level, pm || Number(project.manager_id));
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Schedule Slippage: ${project.project_name} (${p8Level} Escalation)`,
              actionType: 'create_task',
              description: `Project is ${daysUntil <= 0 ? 'past its deadline' : 'approaching deadline'} with only ${completionPct}% completion. Escalation: ${p8Level}.`,
              actionPayload: {
                title: `[Agent] Project Control – Schedule Slippage: ${project.project_name} — ${daysUntil <= 0 ? Math.abs(daysUntil) + 'd OVERDUE' : daysUntil + 'd remaining'}, ${completionPct}% done [${p8Level}]`,
                description: `Project "${project.project_name}"\nTarget end date: ${project.target_end_date}\n${daysUntil <= 0 ? 'OVERDUE by ' + Math.abs(daysUntil) + ' days' : daysUntil + ' days remaining'}\nCompletion: ${completionPct}%\nOverdue WOs: ${project.overdue_work_orders}\nagent_severity: ${severity}\nEscalation: ${p8Level}\n\nReview resource allocation, reprioritize work orders, and update timeline if needed.`,
                assignedTo: assignTo,
                priority: priorityFromLevel(p8Level),
                category: `Project ${p8CurrentFp}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: severityFromLevel(p8Level) as any,
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

        const fingerprint = fpWithProject('p2_milestone', phase.project_id, 'phase', phase.id);

        const p2L1Fp = `${fingerprint}_L1`;
        const p2L2Fp = `${fingerprint}_L2`;
        const p2L3Fp = `${fingerprint}_L3`;
        const hasOpenP2L1 = await hasOpenTask(p2L1Fp);
        const hasOpenP2L2 = await hasOpenTask(p2L2Fp);
        const hasOpenP2L3 = await hasOpenTask(p2L3Fp);
        const hasCompletedP2L1 = !hasOpenP2L1 && await hasCompletedTask(p2L1Fp);
        const hasCompletedP2L2 = !hasOpenP2L2 && await hasCompletedTask(p2L2Fp);

        let p2Level: 'L1' | 'L2' | 'L3';
        let p2CurrentFp: string;
        if (!hasOpenP2L1 && !hasCompletedP2L1) {
          p2Level = 'L1'; p2CurrentFp = p2L1Fp;
        } else if (hasCompletedP2L1 && !hasOpenP2L2 && !hasCompletedP2L2 && daysOverdue >= 30) {
          p2Level = 'L2'; p2CurrentFp = p2L2Fp;
        } else if (hasCompletedP2L1 && hasCompletedP2L2 && !hasOpenP2L3 && daysOverdue >= 60) {
          p2Level = 'L3'; p2CurrentFp = p2L3Fp;
        } else {
          continue;
        }
        const severity = agentSev('P2', p2Level);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(p2Level) as any,
          title: `P2 Milestone Delayed: ${phase.phase_name} in ${phase.project_name} (${daysOverdue}d overdue)`,
          description: `Phase "${phase.phase_name}" (order: ${phase.order}) in project "${phase.project_name}" is ${daysOverdue} days past its target end date (${phase.target_end_date}).\nProgress: ${phase.progress || 0}%\nStatus: ${phase.status}\nEscalation: ${p2Level}`,
          logicType: 'rule_based',
          dataSnapshot: { phaseId: phase.id, projectId: phase.project_id, daysOverdue, progress: phase.progress, phaseOrder: phase.order, escalationLevel: p2Level },
          relatedEntityType: 'project_phase',
          relatedEntityId: String(phase.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(p2CurrentFp)) {
          const entityOwner = phase.phase_lead_id ? Number(phase.phase_lead_id) : pm;
          const assignTo = await resolveEscalation(p2Level, entityOwner);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Milestone Delayed: ${phase.phase_name} (${p2Level} Escalation)`,
            actionType: 'create_task',
            description: `Phase "${phase.phase_name}" is ${daysOverdue} days past target. Escalation: ${p2Level}.`,
            actionPayload: {
              title: `[Agent] Project Control – Milestone Delayed: ${phase.phase_name} in ${phase.project_name} (${daysOverdue}d overdue) [${p2Level}]`,
              description: `Phase "${phase.phase_name}" (sequence: ${phase.order}) in project "${phase.project_name}" is ${daysOverdue} days past target end date.\nTarget: ${phase.target_end_date}\nProgress: ${phase.progress || 0}%\nagent_severity: ${severity}\nEscalation: ${p2Level}\n\nReview phase status and take corrective action.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(p2Level),
              category: `Project ${p2CurrentFp}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: severityFromLevel(p2Level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P4: Dependency Blocking (phase sequence order based) ──
      for (const [pidStr, projectPhases] of Object.entries(phasesByProject)) {
        const sorted = projectPhases.sort((a: any, b: any) => Number(a.order) - Number(b.order));
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          if (prev.status !== 'completed' && prev.target_end_date) {
            const prevTarget = new Date(prev.target_end_date);
            const daysOverdue = Math.floor((Date.now() - prevTarget.getTime()) / (1000 * 60 * 60 * 24));
            if (daysOverdue > 0) {
              const fingerprint = fpWithProject('p4_dependency', prev.project_id, 'phase', `${prev.id}_${curr.id}`);
              const severity = agentSev('P4');
              const finding = await findingManager.createFinding({
                findingType: 'anomaly',
                severity: 'medium',
                title: `P4 Dependency Blocking: ${prev.phase_name} (seq ${prev.order}) blocking ${curr.phase_name} (seq ${curr.order}) in ${prev.project_name}`,
                description: `Phase "${prev.phase_name}" (sequence order: ${prev.order}, target: ${prev.target_end_date}) is incomplete and blocking "${curr.phase_name}" (sequence order: ${curr.order}) in project "${prev.project_name}".`,
                logicType: 'derived',
                dataSnapshot: { prevPhaseId: prev.id, currPhaseId: curr.id, projectId: prev.project_id, prevOrder: prev.order, currOrder: curr.order },
                relatedEntityType: 'project_phase',
                relatedEntityId: String(prev.id),
              });
              if (!finding.isDuplicate) findingsCount++;

              if (!await hasOpenTask(fingerprint)) {
                const assignTo = await resolveEscalation('L1', prev.phase_lead_id ? Number(prev.phase_lead_id) : pm);
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id || finding.findingId,
                  title: `[Agent] Project Control – Phase Blocking: ${prev.phase_name} → ${curr.phase_name}`,
                  actionType: 'create_task',
                  description: `Phase "${prev.phase_name}" (seq ${prev.order}) is overdue and blocking "${curr.phase_name}" (seq ${curr.order}).`,
                  actionPayload: {
                    title: `[Agent] Project Control – Phase Blocking: ${prev.phase_name} blocking ${curr.phase_name} in ${prev.project_name}`,
                    description: `Phase "${prev.phase_name}" (sequence: ${prev.order}, target: ${prev.target_end_date}) in project "${prev.project_name}" is incomplete and blocking the next phase "${curr.phase_name}" (sequence: ${curr.order}).\nagent_severity: ${severity}\n\nComplete or unblock the predecessor phase.`,
                    assignedTo: assignTo,
                    priority: 'Medium',
                    category: `Project ${fingerprint}`,
                  },
                  actionCategory: 'task_creation',
                  logicType: 'rule_based',
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
          const daysOverdue = Math.abs(daysUntil);
          const fingerprint = fpWithProject('p7_commitment_overdue', task.project_id, 'task', task.id);

          const p7L1Fp = `${fingerprint}_L1`;
          const p7L2Fp = `${fingerprint}_L2`;
          const hasOpenP7L1 = await hasOpenTask(p7L1Fp);
          const hasOpenP7L2 = await hasOpenTask(p7L2Fp);
          const hasCompletedP7L1 = !hasOpenP7L1 && await hasCompletedTask(p7L1Fp);

          let p7Level: 'L1' | 'L2';
          let p7CurrentFp: string;
          if (!hasOpenP7L1 && !hasCompletedP7L1) {
            p7Level = 'L1'; p7CurrentFp = p7L1Fp;
          } else if (hasCompletedP7L1 && !hasOpenP7L2 && daysOverdue >= 14) {
            p7Level = 'L2'; p7CurrentFp = p7L2Fp;
          } else {
            continue;
          }
          const severity = agentSev('P7');

          const finding = await findingManager.createFinding({
            findingType: 'overdue',
            severity: severityFromLevel(p7Level) as any,
            title: `P7 Commitment Overdue: ${task.title} (${daysOverdue}d late)`,
            description: `Task "${task.title}" linked to project "${task.project_name}" is ${daysOverdue} days overdue.\nAssigned to: ${task.assignee_name || 'Unassigned'}\nEscalation: ${p7Level}`,
            logicType: 'derived',
            dataSnapshot: { taskId: task.id, projectId: task.project_id, daysOverdue, escalationLevel: p7Level },
            relatedEntityType: 'task',
            relatedEntityId: String(task.id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(p7CurrentFp)) {
            const pm = await resolveProjectManager(Number(task.project_id));
            const entityOwner = task.assigned_to ? Number(task.assigned_to) : pm;
            const assignTo = await resolveEscalation(p7Level, entityOwner);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Commitment Overdue: ${task.title} (${p7Level} Escalation)`,
              actionType: 'create_task',
              description: `Project commitment is ${daysOverdue} days overdue. Escalation: ${p7Level}.`,
              actionPayload: {
                title: `[Agent] Project Control – Commitment Overdue: ${task.title} (${daysOverdue}d late) [${p7Level}]`,
                description: `Task "${task.title}" linked to project "${task.project_name}" is ${daysOverdue} days overdue.\nDue: ${task.effective_due}\nAssigned to: ${task.assignee_name || 'Unassigned'}\nagent_severity: ${severity}\nEscalation: ${p7Level}`,
                assignedTo: assignTo,
                priority: priorityFromLevel(p7Level),
                category: `Project ${p7CurrentFp}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: severityFromLevel(p7Level) as any,
              confidence: 0.85,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        } else if (daysUntil <= THRESHOLDS.p6_commitment_warning_days) {
          const fingerprint = fpWithProject('p6_commitment_due', task.project_id, 'task', task.id);
          const severity = agentSev('P6');
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
            const assignTo = await resolveEscalation('L1', task.assigned_to ? Number(task.assigned_to) : pm);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Commitment Due Soon: ${task.title}`,
              actionType: 'create_task',
              description: `Project commitment due in ${daysUntil} days.`,
              actionPayload: {
                title: `[Agent] Project Control – Commitment Due Soon: ${task.title} (${daysUntil}d left)`,
                description: `Task "${task.title}" linked to project "${task.project_name}" is due in ${daysUntil} days.\nDue: ${task.effective_due}\nAssigned to: ${task.assignee_name || 'Unassigned'}\nagent_severity: ${severity}`,
                assignedTo: assignTo,
                priority: 'Medium',
                category: `Project ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: 'medium',
              confidence: 0.8,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── P9: Critical Path Delay (phase sequence order based) ──
      const criticalPhaseNames = ['Manufacturing', 'Quality', 'Shipping & Commissioning'];
      for (const [pidStr, projectPhases] of Object.entries(phasesByProject)) {
        const sorted = projectPhases.sort((a: any, b: any) => Number(a.order) - Number(b.order));
        for (const phase of sorted) {
          if (!criticalPhaseNames.includes(phase.phase_name)) continue;
          const phaseOrder = Number(phase.order);
          const predecessorsIncomplete = sorted
            .filter((p: any) => Number(p.order) < phaseOrder)
            .some((p: any) => p.status !== 'completed');
          if (predecessorsIncomplete && phase.target_end_date) {
            const targetDate = new Date(phase.target_end_date);
            const daysUntil = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 30) {
              const fingerprint = fpWithProject('p9_critical_path', phase.project_id, 'phase', phase.id);

              const p9L1Fp = `${fingerprint}_L1`;
              const p9L2Fp = `${fingerprint}_L2`;
              const hasOpenP9L1 = await hasOpenTask(p9L1Fp);
              const hasOpenP9L2 = await hasOpenTask(p9L2Fp);
              const hasCompletedP9L1 = !hasOpenP9L1 && await hasCompletedTask(p9L1Fp);

              let p9Level: 'L1' | 'L2';
              let p9CurrentFp: string;
              if (!hasOpenP9L1 && !hasCompletedP9L1) {
                p9Level = 'L1'; p9CurrentFp = p9L1Fp;
              } else if (hasCompletedP9L1 && !hasOpenP9L2 && daysUntil <= 0) {
                p9Level = 'L2'; p9CurrentFp = p9L2Fp;
              } else {
                continue;
              }
              const severity = agentSev('P9');

              const finding = await findingManager.createFinding({
                findingType: 'threshold_breach',
                severity: severityFromLevel(p9Level) as any,
                title: `P9 Critical Path Delay: ${phase.phase_name} (seq ${phase.order}) in ${phase.project_name} — predecessors incomplete`,
                description: `Critical phase "${phase.phase_name}" (sequence: ${phase.order}) in project "${phase.project_name}" has predecessor phases still incomplete. Target: ${phase.target_end_date} (${daysUntil <= 0 ? Math.abs(daysUntil) + 'd PAST' : daysUntil + 'd remaining'}).\nEscalation: ${p9Level}`,
                logicType: 'derived',
                dataSnapshot: { phaseId: phase.id, projectId: phase.project_id, daysUntil, phaseOrder: phase.order, escalationLevel: p9Level },
                relatedEntityType: 'project_phase',
                relatedEntityId: String(phase.id),
              });
              if (!finding.isDuplicate) findingsCount++;

              if (!await hasOpenTask(p9CurrentFp)) {
                const pm = await resolveProjectManager(Number(phase.project_id));
                const assignTo = await resolveEscalation(p9Level, pm);
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id || finding.findingId,
                  title: `[Agent] Project Control – Critical Path Delay: ${phase.phase_name} (${p9Level} Escalation)`,
                  actionType: 'create_task',
                  description: `Critical phase blocked by incomplete predecessors. Escalation: ${p9Level}.`,
                  actionPayload: {
                    title: `[Agent] Project Control – Critical Path Delay: ${phase.phase_name} in ${phase.project_name} [${p9Level}]`,
                    description: `Critical phase "${phase.phase_name}" (sequence: ${phase.order}) in project "${phase.project_name}" has predecessor phases still incomplete.\nTarget: ${phase.target_end_date}\nagent_severity: ${severity}\nEscalation: ${p9Level}\n\nRequires immediate management review and intervention.`,
                    assignedTo: assignTo,
                    priority: priorityFromLevel(p9Level),
                    category: `Project ${p9CurrentFp}`,
                  },
                  actionCategory: 'task_creation',
                  logicType: 'rule_based',
                  priority: severityFromLevel(p9Level) as any,
                  confidence: 0.9,
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
              }
            }
          }
        }
      }

      // ── P10: Resource Overload (weighted load score) ──
      const resourceRows = await db.execute(sql`
        SELECT u.id as user_id, u.username, u.reporting_manager_id,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.supervisor_id = u.id AND wo.status NOT IN ('completed','cancelled'))::int as open_wos,
          (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status NOT IN ('completed','cancelled'))::int as open_tasks,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.assigned_to_id = u.id AND dd.status NOT IN ('Approved','Issued','Superseded'))::int as open_drawings,
          (SELECT COUNT(*) FROM purchase_orders po WHERE po.created_by = u.id AND po.status NOT IN ('completed','cancelled','delivered'))::int as open_procurement
        FROM users u
        WHERE u.is_active = true
      `);
      queriesRun++;

      for (const user of (resourceRows.rows || []) as any[]) {
        const openTasks = Number(user.open_tasks || 0);
        const openWOs = Number(user.open_wos || 0);
        const openDrawings = Number(user.open_drawings || 0);
        const openProcurement = Number(user.open_procurement || 0);

        const weightedLoad =
          ((openTasks + openWOs) * 1.0) +
          (openDrawings * 1.2) +
          (openProcurement * 1.0);

        if (weightedLoad < THRESHOLDS.p10_weighted_load_threshold) continue;

        const fingerprint = fpGlobal('p10_overload', 'user', user.user_id);

        const p10L1Fp = `${fingerprint}_L1`;
        const p10L2Fp = `${fingerprint}_L2`;
        const hasOpenP10L1 = await hasOpenTask(p10L1Fp);
        const hasOpenP10L2 = await hasOpenTask(p10L2Fp);
        const hasCompletedP10L1 = !hasOpenP10L1 && await hasCompletedTask(p10L1Fp);

        let p10Level: 'L1' | 'L2';
        let p10CurrentFp: string;
        if (!hasOpenP10L1 && !hasCompletedP10L1) {
          p10Level = 'L1'; p10CurrentFp = p10L1Fp;
        } else if (hasCompletedP10L1 && !hasOpenP10L2) {
          p10Level = 'L2'; p10CurrentFp = p10L2Fp;
        } else {
          continue;
        }
        const severity = agentSev('P10');

        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach',
          severity: severityFromLevel(p10Level) as any,
          title: `P10 Resource Overload: ${user.username} — load score ${weightedLoad.toFixed(1)}`,
          description: `User "${user.username}" weighted load score is ${weightedLoad.toFixed(1)} (threshold: ${THRESHOLDS.p10_weighted_load_threshold}).\nBreakdown: ${openTasks} tasks (×1.0) + ${openWOs} WOs (×1.0) + ${openDrawings} drawings (×1.2) + ${openProcurement} procurement (×1.0)\nEscalation: ${p10Level}`,
          logicType: 'proxy',
          dataSnapshot: { userId: user.user_id, weightedLoad, openTasks, openWOs, openDrawings, openProcurement, escalationLevel: p10Level },
          relatedEntityType: 'user',
          relatedEntityId: String(user.user_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(p10CurrentFp)) {
          const assignTo = await resolveEscalation(p10Level, Number(user.user_id));
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Resource Overload: ${user.username} (${p10Level} Escalation)`,
            actionType: 'create_task',
            description: `Weighted load score ${weightedLoad.toFixed(1)} exceeds threshold. Escalation: ${p10Level}.`,
            actionPayload: {
              title: `[Agent] Project Control – Resource Overload: ${user.username} (load: ${weightedLoad.toFixed(1)}) [${p10Level}]`,
              description: `User "${user.username}" weighted load score: ${weightedLoad.toFixed(1)}\nTasks: ${openTasks} (×1.0), WOs: ${openWOs} (×1.0), Drawings: ${openDrawings} (×1.2), Procurement: ${openProcurement} (×1.0)\nagent_severity: ${severity}\nEscalation: ${p10Level}\n\nReview workload and redistribute if necessary.`,
              assignedTo: assignTo,
              priority: priorityFromLevel(p10Level),
              category: `Project ${p10CurrentFp}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: severityFromLevel(p10Level) as any,
            confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P12: Project Health Deterioration (weighted formula with bands) ──
      for (const project of projects) {
        const pid = Number(project.id);
        const totalWOs = Number(project.total_work_orders || 0);
        if (totalWOs === 0) continue;

        const overdueWOs = Number(project.overdue_work_orders || 0);
        const completionPct = Number(project.wo_completion_pct || 0);
        const projectWOsList = wosByProject[pid] || [];
        const maxInactiveDays = projectWOsList.length > 0
          ? Math.max(...projectWOsList.map((w: any) => Number(w.days_since_update || 0)))
          : 0;

        const projectPhases = phasesByProject[pid] || [];
        const totalPhases = projectPhases.length || 1;
        const delayedPhases = projectPhases.filter((p: any) =>
          p.target_end_date && p.status !== 'completed' &&
          new Date(p.target_end_date).getTime() < Date.now()
        ).length;

        const projectKS = keyStagesByProject[pid] || [];
        const totalKS = projectKS.length || 1;
        const completedKS = projectKS.filter((ks: any) => ks.is_completed).length;

        const overdueTaskScore = Math.max(0, 100 - (overdueWOs / totalWOs) * 100);
        const designDelayScore = (() => {
          const designDrawingsResult = projectWOsList.length > 0 ? completionPct : 100;
          return designDrawingsResult;
        })();
        const procurementDelayScore = 100;
        const inactivityScore = Math.max(0, 100 - (maxInactiveDays * 3));
        const milestoneScore = Math.max(0, 100 - (delayedPhases / totalPhases) * 100);

        const healthScore =
          (overdueTaskScore * 0.25) +
          (designDelayScore * 0.20) +
          (procurementDelayScore * 0.25) +
          (inactivityScore * 0.15) +
          (milestoneScore * 0.15);

        const band = healthBand(healthScore);

        if (band === 'Red' || band === 'Amber') {
          const fingerprint = fpWithProject('p12_health', pid, 'project', pid);

          const p12L1Fp = `${fingerprint}_L1`;
          const p12L2Fp = `${fingerprint}_L2`;
          const p12L3Fp = `${fingerprint}_L3`;
          const hasOpenP12L1 = await hasOpenTask(p12L1Fp);
          const hasOpenP12L2 = await hasOpenTask(p12L2Fp);
          const hasOpenP12L3 = await hasOpenTask(p12L3Fp);
          const hasCompletedP12L1 = !hasOpenP12L1 && await hasCompletedTask(p12L1Fp);
          const hasCompletedP12L2 = !hasOpenP12L2 && await hasCompletedTask(p12L2Fp);

          let p12Level: 'L1' | 'L2' | 'L3';
          let p12CurrentFp: string;
          if (!hasOpenP12L1 && !hasCompletedP12L1) {
            p12Level = 'L1'; p12CurrentFp = p12L1Fp;
          } else if (hasCompletedP12L1 && !hasOpenP12L2 && !hasCompletedP12L2) {
            p12Level = 'L2'; p12CurrentFp = p12L2Fp;
          } else if (hasCompletedP12L1 && hasCompletedP12L2 && !hasOpenP12L3 && band === 'Red') {
            p12Level = 'L3'; p12CurrentFp = p12L3Fp;
          } else {
            continue;
          }
          const severity = agentSev('P12');

          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity: severityFromLevel(p12Level) as any,
            title: `P12 Health Alert: ${project.project_name} (score: ${Math.round(healthScore)}, band: ${band})`,
            description: `Project "${project.project_name}" health score is ${Math.round(healthScore)}/100 (${band}).\nWeighted breakdown:\n  Overdue Tasks (25%): ${Math.round(overdueTaskScore)} — ${overdueWOs}/${totalWOs} overdue\n  Design Delays (20%): ${Math.round(designDelayScore)}\n  Procurement Delays (25%): ${Math.round(procurementDelayScore)}\n  Inactivity (15%): ${Math.round(inactivityScore)} — ${maxInactiveDays}d max\n  Milestone Risk (15%): ${Math.round(milestoneScore)} — ${delayedPhases}/${totalPhases} delayed\nCompletion: ${completionPct}%\nEscalation: ${p12Level}`,
            logicType: 'derived',
            dataSnapshot: {
              projectId: pid, healthScore: Math.round(healthScore), band,
              overdueTaskScore: Math.round(overdueTaskScore),
              designDelayScore: Math.round(designDelayScore),
              procurementDelayScore: Math.round(procurementDelayScore),
              inactivityScore: Math.round(inactivityScore),
              milestoneScore: Math.round(milestoneScore),
              escalationLevel: p12Level,
            },
            relatedEntityType: 'project',
            relatedEntityId: String(pid),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(p12CurrentFp)) {
            const assignTo = await resolveEscalation(p12Level, pm);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Health Alert: ${project.project_name} (${band}) (${p12Level} Escalation)`,
              actionType: 'create_task',
              description: `Project health score (${Math.round(healthScore)}, ${band}) requires review. Escalation: ${p12Level}.`,
              actionPayload: {
                title: `[Agent] Project Control – Health Alert: ${project.project_name} (score: ${Math.round(healthScore)}/100, ${band}) [${p12Level}]`,
                description: `Project "${project.project_name}" health score: ${Math.round(healthScore)}/100 (${band})\nOverdue Tasks: ${overdueWOs}/${totalWOs}\nMax inactivity: ${maxInactiveDays}d\nDelayed phases: ${delayedPhases}\nagent_severity: ${severity}\nEscalation: ${p12Level}\n\nRequires management review.`,
                assignedTo: assignTo,
                priority: priorityFromLevel(p12Level),
                category: `Project ${p12CurrentFp}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: severityFromLevel(p12Level) as any,
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
    // Grouped queries for design data
    // ════════════════════════════════════════════════════════════════════════
    try {
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
          AND NOT EXISTS (
            SELECT 1 FROM epc_drawing_controls edc
            WHERE edc.design_drawing_id = dd.id
              AND edc.status NOT IN ('superseded','cancelled')
          )
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
        const fingerprint = fpWithProject('d1_drawing_overdue', d.parent_project_id, 'drawing', d.id);
        const severity = agentSev('D1', level);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `D1 Drawing Overdue: ${d.drawing_number || d.drawing_title} (${daysOverdue}d)`,
          description: `Drawing "${d.drawing_title}" (${d.drawing_number || ''}) in project "${d.design_project_name || ''}" is ${daysOverdue} days past due date.\nAssigned to: ${d.assignee_name || 'Unassigned'}\nStatus: ${d.status}`,
          logicType: 'rule_based',
          dataSnapshot: { drawingId: d.id, daysOverdue, projectId: d.parent_project_id },
          relatedEntityType: 'design_drawing',
          relatedEntityId: String(d.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveEscalation('L1', d.assigned_to_id ? Number(d.assigned_to_id) : pm);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Drawing Overdue: ${d.drawing_number || d.drawing_title}`,
            actionType: 'create_task',
            description: `Drawing is ${daysOverdue} days past due date.`,
            actionPayload: {
              title: `[Agent] Project Control – Drawing Overdue: ${d.drawing_number || ''} — "${d.drawing_title}" (${daysOverdue}d)`,
              description: `Drawing "${d.drawing_title}" (${d.drawing_number || ''}) in project "${d.design_project_name || ''}" is ${daysOverdue} days overdue.\nDue date: ${d.due_date}\nAssigned to: ${d.assignee_name || 'Unassigned'}\nStatus: ${d.status}\nagent_severity: ${severity}`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D2: Drawing Stuck in Review ──
      for (const r of reviews) {
        if (!['Pending', 'In Progress'].includes(r.status)) continue;
        const refDate = r.due_date ? new Date(r.due_date) : (r.created_at ? new Date(r.created_at) : null);
        if (!refDate) continue;

        const daysInReview = Math.floor((Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysInReview < THRESHOLDS.d2_review_stuck_days) continue;

        const level: 'L1' | 'L2' = daysInReview >= 21 ? 'L2' : 'L1';
        const fingerprint = fpWithProject('d2_stuck_review', r.parent_project_id, 'review', r.id);
        const severity = agentSev('D2', level);

        const finding = await findingManager.createFinding({
          findingType: 'overdue',
          severity: severityFromLevel(level) as any,
          title: `D2 Drawing Stuck in Review: ${r.review_title} (${daysInReview}d)`,
          description: `Review "${r.review_title}" for drawing ${r.drawing_number || ''} ("${r.drawing_title || ''}") has been in "${r.status}" status for ${daysInReview} days.\nReviewer: ${r.reviewer_name || 'Unassigned'}\nProject: ${r.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { reviewId: r.id, daysInReview, projectId: r.parent_project_id },
          relatedEntityType: 'design_review',
          relatedEntityId: String(r.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveEscalation('L1', r.reviewer_id ? Number(r.reviewer_id) : pm);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Drawing Stuck in Review: ${r.review_title}`,
            actionType: 'create_task',
            description: `Review has been pending for ${daysInReview} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Drawing Stuck in Review: ${r.review_title} (${daysInReview}d)`,
              description: `Review "${r.review_title}" for drawing ${r.drawing_number || ''} has been pending for ${daysInReview} days.\nReviewer: ${r.reviewer_name || 'Unassigned'}\nProject: ${r.design_project_name || ''}\nagent_severity: ${severity}`,
              assignedTo: assignTo,
              priority: priorityFromLevel(level),
              category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: severityFromLevel(level) as any,
            confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D3: Review Comments Not Closed ──
      for (const r of reviews) {
        if (r.status !== 'Approved with Comments') continue;
        const completedDate = r.completed_date ? new Date(r.completed_date) : (r.updated_at ? new Date(r.updated_at) : null);
        if (!completedDate) continue;

        const daysSince = Math.floor((Date.now() - completedDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince < THRESHOLDS.d3_comments_pending_days) continue;

        const fingerprint = fpWithProject('d3_comments_open', r.parent_project_id, 'review', r.id);
        const severity = agentSev('D3');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `D3 Review Comments Not Closed: ${r.review_title} (${daysSince}d pending)`,
          description: `Review "${r.review_title}" was approved with comments ${daysSince} days ago but comments remain open.\nDrawing: ${r.drawing_number || ''}\nProject: ${r.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { reviewId: r.id, daysSince, projectId: r.parent_project_id },
          relatedEntityType: 'design_review',
          relatedEntityId: String(r.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveEscalation('L1', r.reviewer_id ? Number(r.reviewer_id) : pm);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Review Comments Open: ${r.review_title}`,
            actionType: 'create_task',
            description: `Review comments pending for ${daysSince} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Review Comments Open: ${r.review_title} (${daysSince}d pending)`,
              description: `Review "${r.review_title}" was approved with comments but comments remain open for ${daysSince} days.\nDrawing: ${r.drawing_number || ''}\nProject: ${r.design_project_name || ''}\nagent_severity: ${severity}`,
              assignedTo: assignTo, priority: 'Medium', category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D4: Client Approval Pending ──
      for (const d of drawings) {
        if (!d.client_approval_required || d.client_approved_date) continue;
        const daysPending = Math.floor((Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysPending < THRESHOLDS.d4_client_approval_days) continue;

        const fingerprint = fpWithProject('d4_client_approval', d.parent_project_id, 'drawing', d.id);
        const severity = agentSev('D4');
        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'high',
          title: `D4 Client Approval Pending: ${d.drawing_number || d.drawing_title} (${daysPending}d)`,
          description: `Drawing "${d.drawing_title}" requires client approval pending for ${daysPending} days.\nProject: ${d.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { drawingId: d.id, daysPending, projectId: d.parent_project_id },
          relatedEntityType: 'design_drawing', relatedEntityId: String(d.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const assignTo = await resolveEscalation('L1', d.design_manager_id ? Number(d.design_manager_id) : deptHead);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Client Approval Pending: ${d.drawing_number || d.drawing_title}`,
            actionType: 'create_task', description: `Client approval pending for ${daysPending} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Client Approval Pending: ${d.drawing_number || ''} — "${d.drawing_title}" (${daysPending}d)`,
              description: `Drawing "${d.drawing_title}" requires client approval pending for ${daysPending} days.\nProject: ${d.design_project_name || ''}\nagent_severity: ${severity}\n\nFollow up with client for approval.`,
              assignedTo: assignTo, priority: 'High', category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D5: Revision Delay ──
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

        const fingerprint = fpWithProject('d5_revision_delay', d.parent_project_id, 'drawing', d.id);
        const severity = agentSev('D5');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'medium',
          title: `D5 Revision Delayed: ${d.drawing_number || d.drawing_title} Rev ${latestVer.revision} (${daysSinceVersion}d stale)`,
          description: `Drawing "${d.drawing_title}" latest revision (${latestVer.revision}) was created ${daysSinceVersion} days ago and drawing is still not approved.\nProject: ${d.design_project_name || ''}`,
          logicType: 'rule_based',
          dataSnapshot: { drawingId: d.id, revision: latestVer.revision, daysSinceVersion, projectId: d.parent_project_id },
          relatedEntityType: 'design_drawing', relatedEntityId: String(d.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveEscalation('L1', d.assigned_to_id ? Number(d.assigned_to_id) : pm);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Revision Delayed: ${d.drawing_number || d.drawing_title}`,
            actionType: 'create_task', description: `Latest revision is ${daysSinceVersion} days old.`,
            actionPayload: {
              title: `[Agent] Project Control – Revision Delayed: ${d.drawing_number || ''} Rev ${latestVer.revision} (${daysSinceVersion}d stale)`,
              description: `Drawing "${d.drawing_title}" latest revision (${latestVer.revision}) is ${daysSinceVersion} days old.\nProject: ${d.design_project_name || ''}\nagent_severity: ${severity}\n\nReview and issue updated revision if needed.`,
              assignedTo: assignTo, priority: 'Medium', category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D6 & D7: IFC/AFC Drawing Delayed (proxy from key stages + phase target) ──
      const ifcAfcStages = (await db.execute(sql`
        SELECT ks.id, ks.project_id, ks.stage_name, ks.phase, ks.is_completed,
          ks.stage_number,
          pp.target_end_date, pp."order" as phase_order,
          p.name as project_name, p.manager_id
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
        const findingCode = isIFC ? 'D6' : 'D7';
        const fpType = isIFC ? 'd6_ifc_delayed' : 'd7_afc_delayed';
        const fingerprint = fpWithProject(fpType, stage.project_id, 'stage', stage.id);
        const severity = agentSev(findingCode);

        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'high',
          title: `${findingCode} ${isIFC ? 'IFC' : 'AFC'} Delayed: ${stage.stage_name} in ${stage.project_name} (${daysOverdue}d)`,
          description: `Key stage "${stage.stage_name}" (stage #${stage.stage_number}) in project "${stage.project_name}" is ${daysOverdue} days past Design phase target (${stage.target_end_date}).`,
          logicType: 'proxy',
          dataSnapshot: { stageId: stage.id, projectId: stage.project_id, daysOverdue, stageNumber: stage.stage_number, phaseOrder: stage.phase_order },
          relatedEntityType: 'project_key_stage', relatedEntityId: String(stage.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const assignTo = await resolveEscalation('L1', deptHead);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – ${isIFC ? 'IFC' : 'AFC'} Delayed: ${stage.project_name}`,
            actionType: 'create_task', description: `${isIFC ? 'IFC' : 'AFC'} stage is ${daysOverdue} days past target.`,
            actionPayload: {
              title: `[Agent] Project Control – ${isIFC ? 'IFC Drawing' : 'AFC Drawing'} Delayed: ${stage.stage_name} in ${stage.project_name} (${daysOverdue}d)`,
              description: `Key stage "${stage.stage_name}" in project "${stage.project_name}" is ${daysOverdue} days overdue.\nPhase target: ${stage.target_end_date}\nagent_severity: ${severity}\n\nExpedite ${isIFC ? 'IFC' : 'AFC'} release.`,
              assignedTo: assignTo, priority: 'High', category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D9: Design Backlog ──
      for (const dp of designProjects) {
        const openDrawings = Number(dp.open_drawings || 0);
        if (openDrawings < THRESHOLDS.d9_backlog_threshold) continue;

        const fingerprint = fpWithProject('d9_backlog', dp.project_id, 'dp', dp.id);
        const severity = agentSev('D9');
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'high',
          title: `D9 Design Backlog: ${dp.design_project_name} — ${openDrawings} open drawings`,
          description: `Design project "${dp.design_project_name}" has ${openDrawings} open drawings out of ${dp.total_drawings} total.\nProgress: ${dp.overall_progress || 0}%\nManager: ${dp.manager_name || 'Unassigned'}`,
          logicType: 'rule_based',
          dataSnapshot: { dpId: dp.id, openDrawings, totalDrawings: dp.total_drawings, projectId: dp.project_id },
          relatedEntityType: 'design_project', relatedEntityId: String(dp.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveEscalation('L1', dp.design_manager_id ? Number(dp.design_manager_id) : deptHead);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Design Backlog: ${dp.design_project_name}`,
            actionType: 'create_task', description: `${openDrawings} open drawings need attention.`,
            actionPayload: {
              title: `[Agent] Project Control – Design Backlog: ${dp.design_project_name} (${openDrawings} open drawings)`,
              description: `Design project "${dp.design_project_name}" has ${openDrawings} open drawings.\nTotal: ${dp.total_drawings}\nApproved: ${dp.approved_drawings}\nProgress: ${dp.overall_progress || 0}%\nagent_severity: ${severity}\n\nReview workload and prioritize drawings.`,
              assignedTo: assignTo, priority: 'High', category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D8: Design Blocking Procurement (cross-module, phase sequence order) ──
      const crossModuleDesignRows = await db.execute(sql`
        SELECT pd.project_id, p.name as project_name, p.manager_id,
          pd."order" as design_order, pd.status as design_status,
          pp."order" as proc_order, pp.target_end_date as proc_target, pp.status as proc_status
        FROM project_phases pd
        JOIN project_phases pp ON pd.project_id = pp.project_id AND pp.name = 'Procurement'
        JOIN projects p ON pd.project_id = p.id
        WHERE pd.name = 'Design'
          AND pd.status != 'completed'
          AND pd."order" < pp."order"
          AND p.status NOT IN ('cancelled', 'archived', 'completed')
          AND pp.target_end_date IS NOT NULL
      `);
      queriesRun++;

      for (const row of (crossModuleDesignRows.rows || []) as any[]) {
        const procTarget = new Date(row.proc_target);
        const daysUntilProc = Math.ceil((procTarget.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilProc > 14) continue;

        const fingerprint = fpWithProject('d8_design_blocks_proc', row.project_id, 'project', row.project_id);
        const severity = agentSev('D8');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `D8 Design Blocking Procurement: ${row.project_name}`,
          description: `Design phase (seq ${row.design_order}) is incomplete but Procurement phase (seq ${row.proc_order}) target is ${daysUntilProc <= 0 ? Math.abs(daysUntilProc) + 'd PAST' : daysUntilProc + 'd away'} in project "${row.project_name}". Phase dependency violated.`,
          logicType: 'derived',
          dataSnapshot: { projectId: row.project_id, daysUntilProc, designOrder: row.design_order, procOrder: row.proc_order },
          relatedEntityType: 'project', relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const assignTo = await resolveEscalation('L1', deptHead);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Design Blocking Procurement: ${row.project_name}`,
            actionType: 'create_task', description: `Design (seq ${row.design_order}) incomplete, blocking Procurement (seq ${row.proc_order}).`,
            actionPayload: {
              title: `[Agent] Project Control – Design Blocking Procurement: ${row.project_name}`,
              description: `Design phase (sequence: ${row.design_order}) is incomplete but Procurement phase (sequence: ${row.proc_order}) target is ${daysUntilProc <= 0 ? Math.abs(daysUntilProc) + 'd PAST' : 'in ' + daysUntilProc + 'd'}.\nProject: ${row.project_name}\nagent_severity: ${severity}\n\nExpedite design completion to unblock procurement.`,
              assignedTo: assignTo, priority: 'High', category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── D10: Design Impacting Project Milestone (cross-module, key stages + phases) ──
      for (const project of (await db.execute(sql`
        SELECT p.id, p.name, p.target_end_date, p.manager_id
        FROM projects p
        WHERE p.status NOT IN ('cancelled', 'archived', 'completed')
          AND p.target_end_date IS NOT NULL
      `)).rows as any[]) {
        const daysUntil = Math.ceil((new Date(project.target_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil > 30) continue;

        const incompleteDesignStages = (await db.execute(sql`
          SELECT COUNT(*) as cnt FROM project_key_stages
          WHERE project_id = ${project.id} AND phase = 'Design' AND is_completed = false
        `)).rows as any[];
        const incompleteCount = Number(incompleteDesignStages[0]?.cnt || 0);
        if (incompleteCount === 0) continue;

        const fingerprint = fpWithProject('d10_design_milestone', project.id, 'project', project.id);
        const severity = agentSev('D10');
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'critical',
          title: `D10 Design Impacting Milestone: ${project.name} — ${incompleteCount} design key stages incomplete, ${daysUntil}d to deadline`,
          description: `Project "${project.name}" has ${incompleteCount} incomplete design key stages with only ${daysUntil <= 0 ? '0' : daysUntil} days to deadline (${project.target_end_date}).`,
          logicType: 'derived',
          dataSnapshot: { projectId: project.id, incompleteCount, daysUntil },
          relatedEntityType: 'project', relatedEntityId: String(project.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Design Impacting Milestone: ${project.name}`,
            actionType: 'create_task', description: `${incompleteCount} design key stages incomplete with deadline in ${daysUntil}d.`,
            actionPayload: {
              title: `[Agent] Project Control – Design Impacting Milestone: ${project.name} (${incompleteCount} design stages, ${daysUntil}d to deadline)`,
              description: `Project "${project.name}" has ${incompleteCount} incomplete design key stages.\nDeadline: ${project.target_end_date} (${daysUntil <= 0 ? 'OVERDUE' : daysUntil + 'd remaining'})\nagent_severity: ${severity}\n\nRequires immediate management review.`,
              assignedTo: await resolveEscalation('L3', project.manager_id ? Number(project.manager_id) : pm), priority: 'Critical', category: `Design ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'critical', confidence: 0.9,
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
    // Grouped queries for procurement data
    // ════════════════════════════════════════════════════════════════════════
    try {
      const purchaseDeptHead = await resolveDepartmentHead('Purchase');

      const sapPOResult = await fetchOpenPurchaseOrders();
      queriesRun++;
      if (!sapPOResult.available) {
        console.warn(`[${AGENT_KEY}] SAP unavailable — skipping SAP PO rules (R6/R7/R8). Error: ${sapPOResult.error}`);
      }
      const sapPOs = sapPOResult.data;

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
          po.created_at,
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
          io.project_id, io.inspection_type, io.created_at,
          p.name as project_name, p.manager_id,
          EXTRACT(DAY FROM NOW() - io.created_at)::int as days_since_created
        FROM inspection_orders io
        LEFT JOIN projects p ON io.project_id = p.id
        WHERE io.status IN ('pending', 'Pending')
        ORDER BY io.created_at
      `);
      queriesRun++;
      const pendingInspections = (inspectionRows.rows || []) as any[];

      const grpoResult = await fetchRecentGRPOs(90);
      queriesRun++;
      const grByBasePO: Record<string, any[]> = {};
      if (grpoResult.available) {
        const grLookup = buildGRPOLookupByBasePO(grpoResult.data);
        for (const [entry, grs] of Object.entries(grLookup)) {
          grByBasePO[entry] = grs;
        }
      } else {
        console.warn(`[${AGENT_KEY}] SAP GRPO data unavailable — GR-based checks (R6/R7) may over-report`);
      }

      // ── R1: PR Pending Conversion ──
      for (const pr of sapPRs) {
        if (!pr.due_date) continue;
        const daysOverdue = Number(pr.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r1_pr_conversion_days) continue;

        const level: 'L1' | 'L2' = daysOverdue >= 21 ? 'L2' : 'L1';
        const fingerprint = fpGlobal('r1_pr_pending', 'pr', pr.id);
        const severity = agentSev('R1', level);

        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: severityFromLevel(level) as any,
          title: `R1 PR Pending Conversion: PR#${pr.doc_num} (${daysOverdue}d)`,
          description: `Purchase requisition #${pr.doc_num} is ${daysOverdue} days past due date without PO conversion.\nRequester: ${pr.requester_name || 'Unknown'}\nDepartment: ${pr.department || 'N/A'}`,
          logicType: 'rule_based',
          dataSnapshot: { prId: pr.id, docNum: pr.doc_num, daysOverdue },
          relatedEntityType: 'purchase_requisition', relatedEntityId: String(pr.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveEscalation('L1', purchaseDeptHead);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – PR Pending Conversion: PR#${pr.doc_num}`,
            actionType: 'create_task', description: `PR open for ${daysOverdue} days without PO issuance.`,
            actionPayload: {
              title: `[Agent] Project Control – PR Pending Conversion: PR#${pr.doc_num} (${daysOverdue}d overdue)`,
              description: `Purchase requisition #${pr.doc_num} is ${daysOverdue} days past due without PO conversion.\nRequester: ${pr.requester_name || 'Unknown'}\nDue: ${pr.due_date}\nagent_severity: ${severity}\n\nConvert to PO or update status.`,
              assignedTo: assignTo, priority: priorityFromLevel(level), category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: severityFromLevel(level) as any, confidence: 0.9,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R2: RFQ Pending (proxy from key stages sequence) ──
      const rfqStages = (await db.execute(sql`
        SELECT ks1.project_id, p.name as project_name, ks1.completed_date as rfq_sent_date, ks1.stage_number
        FROM project_key_stages ks1
        JOIN projects p ON ks1.project_id = p.id
        WHERE ks1.stage_name ILIKE '%RFQ%Sent%' AND ks1.is_completed = true
          AND NOT EXISTS (
            SELECT 1 FROM project_key_stages ks2
            WHERE ks2.project_id = ks1.project_id
              AND ks2.stage_name ILIKE '%Vendor%Quotes%Received%'
              AND ks2.is_completed = true
              AND ks2.stage_number > ks1.stage_number
          )
      `)).rows as any[];
      queriesRun++;

      for (const stage of rfqStages) {
        const daysSince = stage.rfq_sent_date ? Math.floor((Date.now() - new Date(stage.rfq_sent_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        if (daysSince < THRESHOLDS.r2_rfq_pending_days) continue;

        const fingerprint = fpWithProject('r2_rfq_pending', stage.project_id, 'project', stage.project_id);
        const severity = agentSev('R2');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'medium',
          title: `R2 RFQ Pending Response: ${stage.project_name} (${daysSince}d since RFQ sent)`,
          description: `RFQs were sent for project "${stage.project_name}" ${daysSince} days ago (stage #${stage.stage_number}) but vendor quotes have not been received.`,
          logicType: 'proxy',
          dataSnapshot: { projectId: stage.project_id, daysSince, stageNumber: stage.stage_number },
          relatedEntityType: 'project', relatedEntityId: String(stage.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – RFQ Pending Response: ${stage.project_name}`,
            actionType: 'create_task', description: `No vendor quotes received ${daysSince} days after RFQ.`,
            actionPayload: {
              title: `[Agent] Project Control – RFQ Pending Response: ${stage.project_name} (${daysSince}d)`,
              description: `RFQs sent for project "${stage.project_name}" ${daysSince} days ago but vendor quotes not received.\nagent_severity: ${severity}\n\nFollow up with vendors.`,
              assignedTo: await resolveEscalation('L1', purchaseDeptHead), priority: 'Medium', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R3: Offer Evaluation Pending (proxy from key stages sequence) ──
      const evalStages = (await db.execute(sql`
        SELECT ks1.project_id, p.name as project_name, ks1.completed_date as quotes_received_date, ks1.stage_number
        FROM project_key_stages ks1
        JOIN projects p ON ks1.project_id = p.id
        WHERE ks1.stage_name ILIKE '%Vendor%Quotes%Received%' AND ks1.is_completed = true
          AND NOT EXISTS (
            SELECT 1 FROM project_key_stages ks2
            WHERE ks2.project_id = ks1.project_id
              AND ks2.stage_name ILIKE '%Vendors%Selected%'
              AND ks2.is_completed = true
              AND ks2.stage_number > ks1.stage_number
          )
      `)).rows as any[];
      queriesRun++;

      for (const stage of evalStages) {
        const daysSince = stage.quotes_received_date ? Math.floor((Date.now() - new Date(stage.quotes_received_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        if (daysSince < THRESHOLDS.r3_eval_pending_days) continue;

        const fingerprint = fpWithProject('r3_eval_pending', stage.project_id, 'project', stage.project_id);
        const severity = agentSev('R3');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'medium',
          title: `R3 Offer Evaluation Pending: ${stage.project_name} (${daysSince}d)`,
          description: `Vendor quotes received for project "${stage.project_name}" ${daysSince} days ago (stage #${stage.stage_number}) but vendor selection not completed.`,
          logicType: 'proxy',
          dataSnapshot: { projectId: stage.project_id, daysSince, stageNumber: stage.stage_number },
          relatedEntityType: 'project', relatedEntityId: String(stage.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Offer Evaluation Pending: ${stage.project_name}`,
            actionType: 'create_task', description: `Vendor selection pending for ${daysSince} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Offer Evaluation Pending: ${stage.project_name} (${daysSince}d)`,
              description: `Vendor quotes received for "${stage.project_name}" ${daysSince} days ago but evaluation/selection not completed.\nagent_severity: ${severity}\n\nComplete vendor evaluation and selection.`,
              assignedTo: await resolveEscalation('L1', purchaseDeptHead), priority: 'Medium', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R5: PO Release Delay ──
      for (const po of localPOs) {
        if (po.status !== 'draft') continue;
        const daysSince = Number(po.days_since_created || 0);
        if (daysSince < THRESHOLDS.r5_po_draft_stuck_days) continue;

        const level: 'L1' | 'L2' = daysSince >= 30 ? 'L2' : 'L1';
        const fingerprint = fpWithProject('r5_po_release', po.project_id, 'local_po', po.id);
        const severity = agentSev('R5', level);

        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: severityFromLevel(level) as any,
          title: `R5 PO Release Delay: ${po.purchase_order_number} — ${po.title} (${daysSince}d in draft)`,
          description: `Purchase order "${po.title}" (${po.purchase_order_number}) for project "${po.project_name || 'N/A'}" has been in draft for ${daysSince} days.${!po.vendor_id ? ' No vendor assigned.' : ''}`,
          logicType: 'rule_based',
          dataSnapshot: { poId: po.id, daysSince, hasVendor: !!po.vendor_id, projectId: po.project_id },
          relatedEntityType: 'purchase_order', relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const assignTo = await resolveEscalation('L1', po.created_by ? Number(po.created_by) : pm);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – PO Release Delay: ${po.purchase_order_number}`,
            actionType: 'create_task', description: `PO in draft for ${daysSince} days.`,
            actionPayload: {
              title: `[Agent] Project Control – PO Release Delay: ${po.purchase_order_number} — "${po.title}" (${daysSince}d in draft)`,
              description: `PO "${po.title}" (${po.purchase_order_number}) in draft for ${daysSince} days.\nProject: ${po.project_name || 'N/A'}\nRequired by: ${po.required_by_date || 'Not set'}\nagent_severity: ${severity}\n\nFinalize with vendor or cancel.`,
              assignedTo: assignTo, priority: priorityFromLevel(level), category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: severityFromLevel(level) as any, confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R6: Vendor Submission Overdue (30-59d, no GR) — Live SAP ──
      for (const po of sapPOs) {
        if (!po.DocDueDate) continue;
        const daysOverdue = po.daysOverdue;
        if (daysOverdue < THRESHOLDS.r6_vendor_submission_days || daysOverdue >= THRESHOLDS.r7_manufacturing_delay_days) continue;
        const hasGR = grByBasePO[String(po.DocEntry)]?.length > 0;
        if (hasGR) continue;

        const fingerprint = fpWithProject('r6_vendor_submit', po.Project, 'sap_po', po.DocEntry);
        const severity = agentSev('R6');
        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'medium',
          title: `R6 Vendor Submission Overdue: PO#${po.DocNum} — ${po.CardName} (${daysOverdue}d)`,
          description: `SAP PO #${po.DocNum} from "${po.CardName}" is ${daysOverdue} days past due with no goods receipt.\nValue: ${po.DocCurrency} ${po.DocTotal.toLocaleString()}\nProject: ${po.Project || 'N/A'}`,
          logicType: 'proxy',
          dataSnapshot: { docEntry: po.DocEntry, docNum: po.DocNum, daysOverdue, vendorName: po.CardName, projectCode: po.Project },
          relatedEntityType: 'sap_purchase_order', relatedEntityId: String(po.DocEntry),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Vendor Submission Overdue: PO#${po.DocNum}`,
            actionType: 'create_task', description: `No vendor submission ${daysOverdue} days past due.`,
            actionPayload: {
              title: `[Agent] Project Control – Vendor Submission Overdue: PO#${po.DocNum} — ${po.CardName} (${daysOverdue}d)`,
              description: `PO #${po.DocNum} from "${po.CardName}" is ${daysOverdue}d past due with no goods receipt.\nValue: ${po.DocCurrency} ${po.DocTotal.toLocaleString()}\nagent_severity: ${severity}\n\nContact vendor for submission status.`,
              assignedTo: await resolveEscalation('L1', purchaseDeptHead), priority: 'Medium', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R7: Manufacturing Delay (90+d, no GR, max 365d) — Live SAP ──
      for (const po of sapPOs) {
        if (!po.DocDueDate) continue;
        const daysOverdue = po.daysOverdue;
        if (daysOverdue < THRESHOLDS.r7_manufacturing_delay_days) continue;
        if (daysOverdue > THRESHOLDS.r7_manufacturing_delay_max_days) continue;
        const hasGR = grByBasePO[String(po.DocEntry)]?.length > 0;
        if (hasGR) continue;

        const fingerprint = fpWithProject('r7_mfg_delay', po.Project, 'sap_po', po.DocEntry);
        const severity = agentSev('R7');
        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'high',
          title: `R7 Manufacturing Delay: PO#${po.DocNum} — ${po.CardName} (${daysOverdue}d overdue)`,
          description: `SAP PO #${po.DocNum} from "${po.CardName}" is ${daysOverdue} days overdue with no goods receipt — likely vendor manufacturing delay.\nValue: ${po.DocCurrency} ${po.DocTotal.toLocaleString()}\nProject: ${po.Project || 'N/A'}`,
          logicType: 'proxy',
          dataSnapshot: { docEntry: po.DocEntry, docNum: po.DocNum, daysOverdue, vendorName: po.CardName, projectCode: po.Project },
          relatedEntityType: 'sap_purchase_order', relatedEntityId: String(po.DocEntry),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const mgr = purchaseDeptHead ? await resolveReportingManager(purchaseDeptHead) : null;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Manufacturing Delay: PO#${po.DocNum}`,
            actionType: 'create_task', description: `Vendor manufacturing likely delayed — ${daysOverdue}d overdue.`,
            actionPayload: {
              title: `[Agent] Project Control – Manufacturing Delay: PO#${po.DocNum} — ${po.CardName} (${daysOverdue}d)`,
              description: `PO #${po.DocNum} from "${po.CardName}" is ${daysOverdue}d overdue with no goods receipt.\nValue: ${po.DocCurrency} ${po.DocTotal.toLocaleString()}\nagent_severity: ${severity}\n\nEscalate vendor manufacturing status.`,
              assignedTo: await resolveEscalation('L2', mgr), priority: 'High', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.8,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R8: Delivery Date Missed (7-29d overdue) — Live SAP ──
      for (const po of sapPOs) {
        if (!po.DocDueDate) continue;
        const daysOverdue = po.daysOverdue;
        if (daysOverdue < THRESHOLDS.r8_delivery_missed_days || daysOverdue >= THRESHOLDS.r6_vendor_submission_days) continue;

        const level: 'L1' | 'L2' | 'L3' = daysOverdue >= 90 ? 'L3' : daysOverdue >= 30 ? 'L2' : 'L1';
        const fingerprint = fpWithProject('r8_delivery_missed', po.Project, 'sap_po', po.DocEntry);
        const severity = agentSev('R8', level);

        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: severityFromLevel(level) as any,
          title: `R8 Delivery Missed: PO#${po.DocNum} — ${po.CardName} (${daysOverdue}d)`,
          description: `SAP PO #${po.DocNum} from "${po.CardName}" delivery date missed by ${daysOverdue} days.\nDue: ${po.DocDueDate}\nValue: ${po.DocCurrency} ${po.DocTotal.toLocaleString()}\nProject: ${po.Project || 'N/A'}`,
          logicType: 'rule_based',
          dataSnapshot: { docEntry: po.DocEntry, docNum: po.DocNum, daysOverdue, vendorName: po.CardName, projectCode: po.Project },
          relatedEntityType: 'sap_purchase_order', relatedEntityId: String(po.DocEntry),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Delivery Missed: PO#${po.DocNum}`,
            actionType: 'create_task', description: `Delivery date missed by ${daysOverdue} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Delivery Missed: PO#${po.DocNum} — ${po.CardName} (${daysOverdue}d overdue)`,
              description: `PO #${po.DocNum} from "${po.CardName}" delivery missed by ${daysOverdue}d.\nDue: ${po.DocDueDate}\nValue: ${po.DocCurrency} ${po.DocTotal.toLocaleString()}\nagent_severity: ${severity}\n\nFollow up on delivery status.`,
              assignedTo: await resolveEscalation('L1', purchaseDeptHead), priority: priorityFromLevel(level), category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: severityFromLevel(level) as any, confidence: 0.9,
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

        const fingerprint = fpWithProject('r9_inspection', io.project_id, 'io', io.id);
        const severity = agentSev('R9');
        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'medium',
          title: `R9 Inspection Pending: ${io.inspection_order_number} (${daysPending}d)`,
          description: `Inspection order ${io.inspection_order_number} is pending for ${daysPending} days.\nType: ${io.inspection_type || 'N/A'}\nProject: ${io.project_name || 'N/A'}\nPlanned: ${io.planned_date || 'Not scheduled'}`,
          logicType: 'rule_based',
          dataSnapshot: { ioId: io.id, daysPending, inspectionType: io.inspection_type, projectId: io.project_id },
          relatedEntityType: 'inspection_order', relatedEntityId: String(io.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const qcHead = await resolveDepartmentHead('Quality Control');
          const assignTo = await resolveEscalation('L1', qcHead || (io.manager_id ? Number(io.manager_id) : pm));
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Inspection Pending: ${io.inspection_order_number}`,
            actionType: 'create_task', description: `Inspection pending for ${daysPending} days.`,
            actionPayload: {
              title: `[Agent] Project Control – Inspection Pending: ${io.inspection_order_number} (${daysPending}d)`,
              description: `Inspection order ${io.inspection_order_number} pending for ${daysPending} days.\nType: ${io.inspection_type || 'N/A'}\nProject: ${io.project_name || 'N/A'}\nagent_severity: ${severity}\n\nSchedule and complete inspection.`,
              assignedTo: assignTo, priority: 'Medium', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R10: Dispatch Delay (GR exists but PO still open) ──
      for (const po of sapPOs) {
        const hasGR = grByBasePO[String(po.doc_entry)]?.length > 0 || grByBasePO[String(po.doc_num)]?.length > 0;
        if (!hasGR || !po.doc_due_date) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r10_dispatch_delay_days) continue;

        const fingerprint = fpWithProject('r10_dispatch', po.project_code, 'sap_po', po.id);
        const severity = agentSev('R10');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'medium',
          title: `R10 Dispatch Delay: PO#${po.doc_num} — ${po.vendor_name} (GR received, PO still open)`,
          description: `PO #${po.doc_num} has goods receipt but remains open ${daysOverdue}d past due.`,
          logicType: 'proxy',
          dataSnapshot: { poId: po.id, docNum: po.doc_num, daysOverdue, projectCode: po.project_code },
          relatedEntityType: 'sap_purchase_order', relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const storesHead = await resolveDepartmentHead('Stores');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Dispatch Delay: PO#${po.doc_num}`,
            actionType: 'create_task', description: `GR exists but PO still open.`,
            actionPayload: {
              title: `[Agent] Project Control – Dispatch Delay: PO#${po.doc_num} — ${po.vendor_name}`,
              description: `PO #${po.doc_num} has partial goods receipt but remains open ${daysOverdue}d past due.\nVendor: ${po.vendor_name}\nagent_severity: ${severity}\n\nVerify dispatch status and close PO if fully received.`,
              assignedTo: await resolveEscalation('L1', storesHead || purchaseDeptHead), priority: 'Medium', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R11: Logistics Delay (30+d overdue, partial GR) ──
      for (const po of sapPOs) {
        if (!po.doc_due_date) continue;
        const daysOverdue = Number(po.days_overdue || 0);
        if (daysOverdue < THRESHOLDS.r11_logistics_delay_days) continue;
        const grList = grByBasePO[String(po.doc_entry)] || grByBasePO[String(po.doc_num)] || [];
        if (grList.length === 0) continue;

        const fingerprint = fpWithProject('r11_logistics', po.project_code, 'sap_po', po.id);
        const severity = agentSev('R11');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `R11 Logistics Delay: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d, partial receipt)`,
          description: `PO #${po.doc_num} has ${grList.length} goods receipts but remains open ${daysOverdue}d past due.`,
          logicType: 'proxy',
          dataSnapshot: { poId: po.id, docNum: po.doc_num, daysOverdue, grCount: grList.length, projectCode: po.project_code },
          relatedEntityType: 'sap_purchase_order', relatedEntityId: String(po.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const mgr = purchaseDeptHead ? await resolveReportingManager(purchaseDeptHead) : null;
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Logistics Delay: PO#${po.doc_num}`,
            actionType: 'create_task', description: `Partial receipt with PO still open ${daysOverdue}d.`,
            actionPayload: {
              title: `[Agent] Project Control – Logistics Delay: PO#${po.doc_num} — ${po.vendor_name} (${daysOverdue}d)`,
              description: `PO #${po.doc_num} has ${grList.length} goods receipts but remains open ${daysOverdue}d past due.\nVendor: ${po.vendor_name}\nagent_severity: ${severity}\n\nInvestigate transit/logistics status.`,
              assignedTo: await resolveEscalation('L2', mgr), priority: 'High', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.75,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R4: Critical PR Not Raised (cross-module, phase sequence + key stages) ──
      const procPhaseProjects = (await db.execute(sql`
        SELECT pp.project_id, p.name as project_name, p.manager_id,
          pp.target_end_date as proc_target, pp.status as proc_status, pp."order" as proc_order,
          (SELECT pd."order" FROM project_phases pd WHERE pd.project_id = pp.project_id AND pd.name = 'Design' LIMIT 1) as design_order,
          (SELECT pd.status FROM project_phases pd WHERE pd.project_id = pp.project_id AND pd.name = 'Design' LIMIT 1) as design_status
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

        const procKS = (await db.execute(sql`
          SELECT COUNT(*) as cnt FROM project_key_stages WHERE project_id = ${proj.project_id} AND phase = 'Procurement' AND is_completed = true
        `)).rows as any[];
        const completedProcStages = Number(procKS[0]?.cnt || 0);

        const fingerprint = fpWithProject('r4_critical_pr', proj.project_id, 'project', proj.project_id);
        if (completedProcStages === 0 || daysUntil <= 0) {
          const severity = agentSev('R4');
          const finding = await findingManager.createFinding({
            findingType: 'anomaly', severity: 'high',
            title: `R4 Critical PR Not Raised: ${proj.project_name} — procurement phase (seq ${proj.proc_order}) ${daysUntil <= 0 ? 'OVERDUE' : daysUntil + 'd away'}`,
            description: `Project "${proj.project_name}" procurement phase (sequence: ${proj.proc_order}) target is ${daysUntil <= 0 ? 'overdue' : daysUntil + 'd away'} but procurement activity is insufficient (${completedProcStages} key stages completed).`,
            logicType: 'derived',
            dataSnapshot: { projectId: proj.project_id, daysUntil, completedProcStages, procOrder: proj.proc_order, designStatus: proj.design_status },
            relatedEntityType: 'project', relatedEntityId: String(proj.project_id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(Number(proj.project_id));
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Project Control – Critical PR Not Raised: ${proj.project_name}`,
              actionType: 'create_task', description: `Procurement phase approaching but insufficient activity.`,
              actionPayload: {
                title: `[Agent] Project Control – Critical PR Not Raised: ${proj.project_name}`,
                description: `Project "${proj.project_name}" procurement phase (sequence: ${proj.proc_order}) is ${daysUntil <= 0 ? 'OVERDUE' : daysUntil + 'd away'} but procurement activity is insufficient.\nCompleted procurement stages: ${completedProcStages}\nagent_severity: ${severity}\n\nRaise required purchase requisitions immediately.`,
                assignedTo: await resolveEscalation('L2', pm), priority: 'High', category: `Procurement ${fingerprint}`,
              },
              actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.8,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── R12: Material Delay Affecting Project (cross-module, phase targets) ──
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
          SELECT pp.target_end_date, pp."order" as mfg_order FROM project_phases pp
          WHERE pp.project_id = ${proj.id} AND pp.name = 'Manufacturing'
          LIMIT 1
        `)).rows as any[];
        if (mfgPhase.length === 0) continue;
        const mfgTarget = mfgPhase[0].target_end_date;
        if (!mfgTarget) continue;
        const daysToMfg = Math.ceil((new Date(mfgTarget).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysToMfg > 30) continue;

        const fingerprint = fpWithProject('r12_material_impact', proj.id, 'sap_po', po.id);
        const severity = agentSev('R12');
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'critical',
          title: `R12 Material Delay Affecting Project: PO#${po.doc_num} impacting ${proj.name}`,
          description: `PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue}d overdue and linked to project "${proj.name}" with Manufacturing phase (seq ${mfgPhase[0].mfg_order || 'N/A'}) ${daysToMfg <= 0 ? 'OVERDUE' : daysToMfg + 'd away'}.`,
          logicType: 'derived',
          dataSnapshot: { poId: po.id, projectId: proj.id, daysOverdue, daysToMfg, mfgOrder: mfgPhase[0].mfg_order },
          relatedEntityType: 'project', relatedEntityId: String(proj.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Project Control – Material Delay Affecting Project: ${proj.name}`,
            actionType: 'create_task', description: `Overdue PO impacting project manufacturing timeline.`,
            actionPayload: {
              title: `[Agent] Project Control – Material Delay Affecting Project: PO#${po.doc_num} → ${proj.name}`,
              description: `PO #${po.doc_num} from "${po.vendor_name}" is ${daysOverdue}d overdue.\nProject: ${proj.name}\nManufacturing phase: ${daysToMfg <= 0 ? 'OVERDUE' : daysToMfg + 'd away'}\nagent_severity: ${severity}\n\nRequires immediate management intervention.`,
              assignedTo: await resolveEscalation('L3', proj.manager_id ? Number(proj.manager_id) : pm), priority: 'Critical', category: `Procurement ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'critical', confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

    } catch (err: any) {
      console.error(`[ProjectControl] Procurement Management module error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 4: EPC LIFECYCLE MONITORING (EPC-DC3, DC4, BC4, PR2, PR3, PE2)
    // ════════════════════════════════════════════════════════════════════════
    let epcResolved = 0;
    try {
      const epcDC3Active = new Set<string>();
      const epcDC4Active = new Set<string>();
      const epcBC4Active = new Set<string>();
      const epcPR2Active = new Set<string>();
      const epcPR3Active = new Set<string>();
      const epcPE2Active = new Set<string>();

      // ── EPC-DC3: Drawing Approved Not Released ──
      const dc3Rows = await db.execute(sql`
        SELECT edc.id, edc.control_number, edc.status, edc.approved_at,
          edc.project_item_id, edc.design_drawing_id,
          pi.project_id, p.name as project_name, p.manager_id
        FROM epc_drawing_controls edc
        JOIN project_items pi ON edc.project_item_id = pi.id
        JOIN projects p ON pi.project_id = p.id
        WHERE edc.status = 'approved'
          AND edc.approved_at IS NOT NULL
      `);
      queriesRun++;
      const dc3Def = EPC_FINDING_DEFS['EPC-DC3'];
      for (const row of (dc3Rows.rows || []) as any[]) {
        if (!hasGracePassed(row.approved_at, dc3Def)) continue;
        const fingerprint = `[fp:pc_epc_dc3:p${row.project_id}:dwg_ctrl:${row.id}]`;
        epcDC3Active.add(fingerprint);
        const daysSince = Math.floor((Date.now() - new Date(row.approved_at).getTime()) / 86400000);
        const track = await trackFinding({
          fingerprint, findingCode: 'EPC-DC3', agentKey: AGENT_KEY,
          severity: dc3Def.severity, projectId: row.project_id,
          projectItemId: row.project_item_id, entityType: 'epc_drawing_control',
          entityId: row.id, cooldownHours: dc3Def.cooldownHours,
          metadata: { controlNumber: row.control_number, daysSince },
        });
        if (track.withinCooldown) continue;

        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `EPC-DC3 Drawing Approved Not Released: ${row.control_number} (${daysSince}d)`,
          description: `EPC drawing control "${row.control_number}" has been approved for ${daysSince} days but not released. Blocks downstream procurement and production gates.\nProject: ${row.project_name}`,
          logicType: 'rule_based',
          dataSnapshot: { drawingControlId: row.id, daysSince, projectId: row.project_id },
          relatedEntityType: 'epc_drawing_control', relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const engLead = await resolveAssignment(null, row.project_id, 'Design');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] EPC-DC3 Drawing Approved Not Released: ${row.control_number}`,
            actionType: 'create_task',
            description: `Drawing approved ${daysSince}d ago but not released — blocks procurement/production.`,
            actionPayload: {
              title: `[Agent] EPC-DC3 Drawing Approved Not Released: ${row.control_number} (${daysSince}d)`,
              description: `EPC drawing control "${row.control_number}" approved ${daysSince}d ago but not released.\nProject: ${row.project_name}\nagent_severity: ${dc3Def.severity}\n\nAction: Release the drawing to unblock downstream gates.`,
              assignedTo: engLead, priority: 'High', category: `EPC ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.95,
          });
          if (rec.id > 0) {
            recommendationsCount++;
            if (rec.autoApproved) autoExecuteQueue.push(rec.id);
            await markTaskCreated(track.id);
          }
        }
        await markAlerted(track.id);
      }

      // ── EPC-DC4: Released Drawing — No BOM ──
      const dc4Rows = await db.execute(sql`
        SELECT edc.id, edc.control_number, edc.status, edc.released_at,
          edc.project_item_id, edc.design_drawing_id,
          pi.project_id, p.name as project_name, p.manager_id
        FROM epc_drawing_controls edc
        JOIN project_items pi ON edc.project_item_id = pi.id
        JOIN projects p ON pi.project_id = p.id
        WHERE edc.status = 'released'
          AND edc.released_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM epc_bom_headers bh
            WHERE bh.project_item_id = edc.project_item_id
              AND bh.status NOT IN ('cancelled','superseded')
          )
      `);
      queriesRun++;
      const dc4Def = EPC_FINDING_DEFS['EPC-DC4'];
      for (const row of (dc4Rows.rows || []) as any[]) {
        if (!hasGracePassed(row.released_at, dc4Def)) continue;
        const fingerprint = `[fp:pc_epc_dc4:p${row.project_id}:dwg_ctrl:${row.id}]`;
        epcDC4Active.add(fingerprint);
        const daysSince = Math.floor((Date.now() - new Date(row.released_at).getTime()) / 86400000);
        const track = await trackFinding({
          fingerprint, findingCode: 'EPC-DC4', agentKey: AGENT_KEY,
          severity: dc4Def.severity, projectId: row.project_id,
          projectItemId: row.project_item_id, entityType: 'epc_drawing_control',
          entityId: row.id, cooldownHours: dc4Def.cooldownHours,
          metadata: { controlNumber: row.control_number, daysSince },
        });
        if (track.withinCooldown) continue;

        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'medium',
          title: `EPC-DC4 Released Drawing No BOM: ${row.control_number} (${daysSince}d)`,
          description: `Drawing "${row.control_number}" released ${daysSince} days ago but no BOM exists for this project item.\nProject: ${row.project_name}\nEngineering output incomplete — procurement/production gates will block.`,
          logicType: 'rule_based',
          dataSnapshot: { drawingControlId: row.id, daysSince, projectId: row.project_id },
          relatedEntityType: 'epc_drawing_control', relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const engLead = await resolveAssignment(null, row.project_id, 'Design');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] EPC-DC4 Released Drawing No BOM: ${row.control_number}`,
            actionType: 'create_task',
            description: `Drawing released ${daysSince}d ago but no BOM created yet.`,
            actionPayload: {
              title: `[Agent] EPC-DC4 Released Drawing No BOM: ${row.control_number} (${daysSince}d)`,
              description: `Drawing "${row.control_number}" released but no BOM exists.\nProject: ${row.project_name}\nagent_severity: ${dc4Def.severity}\n\nAction: Create BOM for the project item.`,
              assignedTo: engLead, priority: 'Medium', category: `EPC ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.9,
          });
          if (rec.id > 0) {
            recommendationsCount++;
            if (rec.autoApproved) autoExecuteQueue.push(rec.id);
            await markTaskCreated(track.id);
          }
        }
        await markAlerted(track.id);
      }

      // ── EPC-BC4: Empty BOM Released (alert only) ──
      const bc4Rows = await db.execute(sql`
        SELECT bh.id, bh.bom_number, bh.status, bh.project_item_id,
          pi.project_id, p.name as project_name, p.manager_id
        FROM epc_bom_headers bh
        JOIN project_items pi ON bh.project_item_id = pi.id
        JOIN projects p ON pi.project_id = p.id
        WHERE bh.status = 'released'
          AND NOT EXISTS (
            SELECT 1 FROM epc_bom_lines bl
            WHERE bl.bom_id = bh.id AND bl.status != 'cancelled'
          )
      `);
      queriesRun++;
      const bc4Def = EPC_FINDING_DEFS['EPC-BC4'];
      for (const row of (bc4Rows.rows || []) as any[]) {
        const fingerprint = `[fp:pc_epc_bc4:bom:${row.id}]`;
        epcBC4Active.add(fingerprint);
        const track = await trackFinding({
          fingerprint, findingCode: 'EPC-BC4', agentKey: AGENT_KEY,
          severity: bc4Def.severity, projectId: row.project_id,
          projectItemId: row.project_item_id, entityType: 'epc_bom_header',
          entityId: row.id, cooldownHours: bc4Def.cooldownHours,
          metadata: { bomNumber: row.bom_number },
        });
        if (track.withinCooldown) continue;

        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'critical',
          title: `EPC-BC4 Empty BOM Released: ${row.bom_number}`,
          description: `BOM "${row.bom_number}" is released but has zero active lines. Data integrity violation — BOM explosion would produce nothing.\nProject: ${row.project_name}`,
          logicType: 'rule_based',
          dataSnapshot: { bomId: row.id, projectId: row.project_id },
          relatedEntityType: 'epc_bom_header', relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        await markAlerted(track.id);
      }

      // ── EPC-PR2: Procurement Plan — No Execution Record ──
      const pr2Rows = await db.execute(sql`
        SELECT ipr.id, ipr.planning_type, ipr.status, ipr.updated_at,
          ipr.project_item_id, pi.project_id, p.name as project_name, p.manager_id
        FROM item_planning_records ipr
        JOIN project_items pi ON ipr.project_item_id = pi.id
        JOIN projects p ON pi.project_id = p.id
        WHERE ipr.planning_type = 'procurement'
          AND ipr.status IN ('confirmed','active')
          AND NOT EXISTS (
            SELECT 1 FROM procurement_execution_records per
            WHERE per.project_item_id = ipr.project_item_id
          )
      `);
      queriesRun++;
      const pr2Def = EPC_FINDING_DEFS['EPC-PR2'];
      for (const row of (pr2Rows.rows || []) as any[]) {
        if (!hasGracePassed(row.updated_at, pr2Def)) continue;
        const fingerprint = `[fp:pc_epc_pr2:p${row.project_id}:plan:${row.id}]`;
        epcPR2Active.add(fingerprint);
        const daysSince = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / 86400000);
        const track = await trackFinding({
          fingerprint, findingCode: 'EPC-PR2', agentKey: AGENT_KEY,
          severity: pr2Def.severity, projectId: row.project_id,
          projectItemId: row.project_item_id, entityType: 'item_planning_record',
          entityId: row.id, cooldownHours: pr2Def.cooldownHours,
          metadata: { daysSince },
        });
        if (track.withinCooldown) continue;

        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `EPC-PR2 Procurement Plan No Execution: Plan #${row.id} (${daysSince}d)`,
          description: `Procurement planning record confirmed ${daysSince}d ago but no execution record exists.\nProject: ${row.project_name}\nHandoff from planning to execution is broken.`,
          logicType: 'rule_based',
          dataSnapshot: { planId: row.id, daysSince, projectId: row.project_id },
          relatedEntityType: 'item_planning_record', relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const procLead = await resolveAssignment(null, row.project_id, 'Purchase');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] EPC-PR2 Procurement Plan No Execution: Plan #${row.id}`,
            actionType: 'create_task',
            description: `Procurement plan confirmed ${daysSince}d ago, no execution record.`,
            actionPayload: {
              title: `[Agent] EPC-PR2 Procurement Plan No Execution Record (${daysSince}d)`,
              description: `Procurement plan #${row.id} confirmed ${daysSince}d ago but no execution record created.\nProject: ${row.project_name}\nagent_severity: ${pr2Def.severity}\n\nAction: Create procurement execution record to proceed.`,
              assignedTo: procLead, priority: 'High', category: `EPC ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.9,
          });
          if (rec.id > 0) {
            recommendationsCount++;
            if (rec.autoApproved) autoExecuteQueue.push(rec.id);
            await markTaskCreated(track.id);
          }
        }
        await markAlerted(track.id);
      }

      // ── EPC-PR3: Production Plan — No Execution Record ──
      const pr3Rows = await db.execute(sql`
        SELECT ipr.id, ipr.planning_type, ipr.status, ipr.updated_at,
          ipr.project_item_id, pi.project_id, p.name as project_name, p.manager_id
        FROM item_planning_records ipr
        JOIN project_items pi ON ipr.project_item_id = pi.id
        JOIN projects p ON pi.project_id = p.id
        WHERE ipr.planning_type = 'production'
          AND ipr.status IN ('confirmed','active')
          AND NOT EXISTS (
            SELECT 1 FROM production_execution_records per
            WHERE per.project_item_id = ipr.project_item_id
          )
      `);
      queriesRun++;
      const pr3Def = EPC_FINDING_DEFS['EPC-PR3'];
      for (const row of (pr3Rows.rows || []) as any[]) {
        if (!hasGracePassed(row.updated_at, pr3Def)) continue;
        const fingerprint = `[fp:pc_epc_pr3:p${row.project_id}:plan:${row.id}]`;
        epcPR3Active.add(fingerprint);
        const daysSince = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / 86400000);
        const track = await trackFinding({
          fingerprint, findingCode: 'EPC-PR3', agentKey: AGENT_KEY,
          severity: pr3Def.severity, projectId: row.project_id,
          projectItemId: row.project_item_id, entityType: 'item_planning_record',
          entityId: row.id, cooldownHours: pr3Def.cooldownHours,
          metadata: { daysSince },
        });
        if (track.withinCooldown) continue;

        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `EPC-PR3 Production Plan No Execution: Plan #${row.id} (${daysSince}d)`,
          description: `Production planning record confirmed ${daysSince}d ago but no execution record exists.\nProject: ${row.project_name}\nManufacturing will never start for this item.`,
          logicType: 'rule_based',
          dataSnapshot: { planId: row.id, daysSince, projectId: row.project_id },
          relatedEntityType: 'item_planning_record', relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const prodMgr = await resolveAssignment(null, row.project_id, 'Production');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] EPC-PR3 Production Plan No Execution: Plan #${row.id}`,
            actionType: 'create_task',
            description: `Production plan confirmed ${daysSince}d ago, no execution record.`,
            actionPayload: {
              title: `[Agent] EPC-PR3 Production Plan No Execution Record (${daysSince}d)`,
              description: `Production plan #${row.id} confirmed ${daysSince}d ago but no execution record created.\nProject: ${row.project_name}\nagent_severity: ${pr3Def.severity}\n\nAction: Create production execution record.`,
              assignedTo: prodMgr, priority: 'High', category: `EPC ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'high', confidence: 0.9,
          });
          if (rec.id > 0) {
            recommendationsCount++;
            if (rec.autoApproved) autoExecuteQueue.push(rec.id);
            await markTaskCreated(track.id);
          }
        }
        await markAlerted(track.id);
      }

      // ── EPC-PE2: Procurement Gate Block Unresolved ──
      const pe2Rows = await db.execute(sql`
        SELECT t.id, t.title, t.status, t.created_at, t.category,
          t.assigned_to as assigned_to_id
        FROM tasks t
        WHERE t.source_type = 'epc_automation'
          AND t.description LIKE '%[automation_key:epc:procurement_execution:%:gate_blocked]%'
          AND t.status NOT IN ('completed','cancelled','obsolete')
          AND t.created_at::timestamp < NOW() - INTERVAL '7 days'
      `);
      queriesRun++;
      const pe2Def = EPC_FINDING_DEFS['EPC-PE2'];
      for (const row of (pe2Rows.rows || []) as any[]) {
        const fingerprint = `[fp:pc_epc_pe2:task:${row.id}]`;
        epcPE2Active.add(fingerprint);
        const daysSince = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000);
        const track = await trackFinding({
          fingerprint, findingCode: 'EPC-PE2', agentKey: AGENT_KEY,
          severity: pe2Def.severity, entityType: 'task',
          entityId: row.id, cooldownHours: pe2Def.cooldownHours,
          metadata: { taskTitle: row.title, daysSince },
        });
        if (track.withinCooldown) continue;

        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `EPC-PE2 Procurement Gate Block Unresolved: Task #${row.id} (${daysSince}d)`,
          description: `Procurement gate block task "${row.title}" has been open ${daysSince} days. Engineering is not responding to the dependency.`,
          logicType: 'rule_based',
          dataSnapshot: { taskId: row.id, daysSince },
          relatedEntityType: 'task', relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const engLead = await resolveDepartmentHead('Design');
          const assignTo = await resolveEscalation(daysSince >= 14 ? 'L3' : 'L1', engLead);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] EPC-PE2 Procurement Gate Block Unresolved (${daysSince}d)`,
            actionType: 'create_task',
            description: `Procurement gate block unresolved for ${daysSince} days.`,
            actionPayload: {
              title: `[Agent] EPC-PE2 Procurement Gate Block Unresolved — Task #${row.id} (${daysSince}d)`,
              description: `Gate block task "${row.title}" unresolved for ${daysSince} days.\nagent_severity: ${pe2Def.severity}\n\nAction: Resolve engineering dependency to unblock procurement.`,
              assignedTo: assignTo, priority: daysSince >= 14 ? 'Critical' : 'High', category: `EPC ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: daysSince >= 14 ? 'critical' : 'high', confidence: 0.95,
          });
          if (rec.id > 0) {
            recommendationsCount++;
            if (rec.autoApproved) autoExecuteQueue.push(rec.id);
            await markTaskCreated(track.id);
          }
        }
        await markAlerted(track.id);
      }

      // ── Resolution pass for all PC EPC findings ──
      const pcCodes: [string, Set<string>][] = [
        ['EPC-DC3', epcDC3Active], ['EPC-DC4', epcDC4Active], ['EPC-BC4', epcBC4Active],
        ['EPC-PR2', epcPR2Active], ['EPC-PR3', epcPR3Active], ['EPC-PE2', epcPE2Active],
      ];
      for (const [code, activeSet] of pcCodes) {
        epcResolved += await resolveFindings({
          findingCode: code, agentKey: AGENT_KEY, sourceAgent: SOURCE_AGENT, stillActiveFingerprints: activeSet,
        });
      }
      console.log(`[ProjectControl] EPC Module: ${epcDC3Active.size + epcDC4Active.size + epcBC4Active.size + epcPR2Active.size + epcPR3Active.size + epcPE2Active.size} active findings, ${epcResolved} resolved`);
    } catch (err: any) {
      console.error(`[ProjectControl] EPC Lifecycle module error:`, err.message);
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
        if (!rec || (rec.status !== 'approved' && rec.status !== 'auto_approved')) continue;

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
          UPDATE agent_recommendations SET status = 'executed', updated_at = NOW() WHERE id = ${recId}
        `);
        autoExecutedCount++;
      } catch (err: any) {
        console.error(`[ProjectControl] Auto-execute error for rec ${recId}:`, err.message);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // AGENT RUN LOGGING (execution_metadata)
    // ════════════════════════════════════════════════════════════════════════
    const elapsed = Date.now() - startTime;
    const executionMetadata = {
      findings_detected: findingsCount,
      tasks_created: autoExecutedCount,
      tasks_closed: autoClosedCount,
      recommendations_generated: recommendationsCount,
      execution_time_ms: elapsed,
      queries_run: queriesRun,
      epc_resolved: epcResolved,
      modules: ['P1-P12', 'D1-D10', 'R1-R12', 'EPC-DC3/DC4/BC4/PR2/PR3/PE2'],
    };

    try {
      await db.execute(sql`
        UPDATE agent_runs
        SET execution_metadata = ${JSON.stringify(executionMetadata)}::jsonb
        WHERE id = ${context.runId}
      `);
    } catch (err: any) {
      console.error(`[ProjectControl] Failed to update execution_metadata:`, err.message);
    }

    console.log(`[ProjectControl] Complete: ${findingsCount} findings, ${recommendationsCount} recommendations, ${autoExecutedCount} auto-executed, ${autoClosedCount} auto-closed, ${queriesRun} queries in ${elapsed}ms`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      autoExecutedActions: autoExecutedCount,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Project Control Agent (34-finding model): ${findingsCount} findings, ${recommendationsCount} recommendations, ${autoExecutedCount} tasks created, ${autoClosedCount} resolved tasks auto-closed. Modules: Project (P1-P12), Design (D1-D10), Procurement (R1-R12). Health bands: Green(80+), Watch(60-79), Amber(40-59), Red(0-39). Execution: ${elapsed}ms.`,
    };
  }
}
