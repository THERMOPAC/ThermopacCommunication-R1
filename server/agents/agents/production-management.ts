import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { resolveEscalation } from '../framework/escalation';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  resolveProjectManager,
  resolveDepartmentHead, hasOpenTask as hasOpenTaskShared,
} from './project-control-shared';

const SOURCE_AGENT = 'production_manager';
const AGENT_KEY = 'production_management';

const PROD_MANAGER_ID = 8;   // Jawahar — Production Manager
const DESIGN_SENIOR_MGR_ID = 4; // Pallab — Senior Manager Design (reports to GM)

const SEVERITY_MAP: Record<string, string> = {
  P1: 'warning', P2: 'warning', P3: 'risk', P4: 'warning', P5: 'risk',
  P6: 'warning', P7: 'warning', P8: 'risk', P9: 'warning', P10: 'warning',
  P11: 'critical', P12: 'risk', P13: 'warning', P14: 'warning', P15: 'critical',
  P16: 'risk', P17: 'risk', P18: 'warning', P19: 'risk', P20: 'risk',
  P21: 'risk', P22: 'warning', P23: 'risk', P24: 'warning', P25: 'critical',
  P26: 'risk', P27: 'risk', P28: 'risk', P29: 'warning', P30: 'warning',
  P31: 'warning', P32: 'risk', P33: 'warning', P34: 'risk',
  P35: 'risk', P36: 'critical', P37: 'warning', P38: 'warning', P39: 'warning',
  P40: 'risk', P41: 'risk', P42: 'warning', P43: 'warning', P44: 'warning', P45: 'critical',
  R1: 'risk', R2: 'risk', R3: 'critical', R4: 'warning', R5: 'risk',
  R6: 'risk', R7: 'risk', R8: 'critical', R9: 'risk', R10: 'warning',
};

function agentSev(code: string): string {
  return SEVERITY_MAP[code] || 'warning';
}

function fp(type: string, entity: string, id: string | number): string {
  return `[fp:pm_${type}:${entity}:${id}]`;
}

function fpProject(type: string, projectId: number | string, entity: string, id: string | number): string {
  return `[fp:pm_${type}:p${projectId}:${entity}:${id}]`;
}

async function hasOpenTask(fingerprint: string): Promise<boolean> {
  return hasOpenTaskShared(fingerprint, SOURCE_AGENT);
}

async function escalationAssign(level: 'L1' | 'L2' | 'L3', entityOwnerId: number | null): Promise<number> {
  return resolveEscalation(level, entityOwnerId || PROD_MANAGER_ID);
}

function priorityFromSeverity(sev: string): string {
  if (sev === 'critical') return 'Critical';
  if (sev === 'risk') return 'High';
  return 'Medium';
}

function escalationLevel(sev: string): 'L1' | 'L2' | 'L3' {
  if (sev === 'critical') return 'L3';
  if (sev === 'risk') return 'L2';
  return 'L1';
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closed = 0;
  const openTasks = await db.execute(sql`
    SELECT id, category FROM tasks
    WHERE source_type = 'agent_task' AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'cancelled')
  `);

  for (const task of (openTasks.rows || []) as any[]) {
    const cat = task.category || '';
    const fpMatch = cat.match(/\[fp:pm_([a-z0-9_]+):[^\]]+:(\d+)\]/);
    if (!fpMatch) continue;

    const findingType = fpMatch[1];
    const entityId = Number(fpMatch[2]);
    let resolved = false;

    if (['p3_overdue', 'p17_not_started', 'p5_backlog'].includes(findingType)) {
      const result = await db.execute(sql`
        SELECT 1 FROM work_orders WHERE id = ${entityId} AND status IN ('completed', 'cancelled') LIMIT 1
      `);
      resolved = (result.rows || []).length > 0;
    } else if (findingType === 'p40_dpr_missing') {
      resolved = false;
    }

    if (resolved) {
      await db.execute(sql`
        UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${task.id}
      `);
      closed++;
    }
  }
  return closed;
}

export class ProductionManagementAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Production Management Agent';
  category = 'operations';

  getSubscribedEvents(): string[] {
    return [];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let recommendationsCount = 0;
    let queriesRun = 0;
    let autoExecutedCount = 0;
    const autoExecuteQueue: number[] = [];

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    const tasksClosed = await autoCloseResolvedTasks();

    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION A: CORE PRODUCTION FINDINGS (P1–P45)
    // ════════════════════════════════════════════════════════════════════════════════

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GROUP 1: PRODUCTION PLANNING (P1–P10)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // ── P1: Production Plan Missing (project with no WOs) ──
      const p1Rows = await db.execute(sql`
        SELECT p.id, p.name, p.status, p.code
        FROM projects p
        WHERE p.status IN ('active', 'in_progress')
          AND NOT EXISTS (SELECT 1 FROM work_orders wo WHERE wo.project_id = p.id)
      `);
      queriesRun++;
      for (const proj of (p1Rows.rows || []) as any[]) {
        const severity = agentSev('P1');
        const fingerprint = fpProject('p1_no_plan', proj.id, 'project', proj.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P1 Production Plan Missing: ${proj.name} (${proj.code})`,
          description: `Active project "${proj.name}" has no work orders created.\nProject Code: ${proj.code}\nStatus: ${proj.status}\nAction: Create production plan and generate work orders.`,
          logicType: 'reactive',
          dataSnapshot: { projectId: proj.id, projectCode: proj.code },
          relatedEntityType: 'project',
          relatedEntityId: String(proj.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const pm = await resolveProjectManager(proj.id);
          const level = escalationLevel(severity);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Plan Missing: ${proj.name}`,
            actionType: 'create_task',
            description: `Active project has no production plan or work orders.`,
            actionPayload: {
              title: `[Agent] Production Plan Missing: ${proj.name} (${proj.code})`,
              description: `Active project "${proj.name}" has no work orders.\nProject Code: ${proj.code}\nImpact: No production activity can be tracked\nagent_severity: ${severity}\n\nAction Required: Create production plan and generate work orders for this project.`,
              assignedTo: await escalationAssign(level, pm),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P2: Production Order Not Released (status='planned' for > 7 days past planned_start) ──
      const p2Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id, wo.supervisor_id,
          wo.planned_start_date, wo.production_line, wo.batch_number,
          p.name as project_name, p.code as project_code,
          EXTRACT(DAY FROM NOW() - wo.planned_start_date)::int as days_past_start
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.status = 'planned'
          AND wo.planned_start_date < CURRENT_DATE - INTERVAL '7 days'
        ORDER BY wo.planned_start_date
      `);
      queriesRun++;
      for (const wo of (p2Rows.rows || []) as any[]) {
        const severity = agentSev('P2');
        const fingerprint = fpProject('p2_not_released', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P2 Production Order Not Released: ${wo.work_order_number} — ${wo.days_past_start}d past planned start`,
          description: `Work order "${wo.work_order_number}" is still in 'planned' status ${wo.days_past_start} days after its planned start date.\nWO: ${wo.work_order_number} | ${wo.title}\nProject: ${wo.project_name} (${wo.project_code})\nPlanned Start: ${new Date(wo.planned_start_date).toISOString().split('T')[0]}\nProduction Line: ${wo.production_line || 'Not assigned'}\nAction: Release the production order or update the schedule.`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, woNumber: wo.work_order_number, projectId: wo.project_id, daysPastStart: wo.days_past_start },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const level = escalationLevel(severity);
          const pm = await resolveProjectManager(wo.project_id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Order Not Released: ${wo.work_order_number}`,
            actionType: 'create_task',
            description: `WO still in planned status ${wo.days_past_start}d past planned start.`,
            actionPayload: {
              title: `[Agent] Production Order Not Released: ${wo.work_order_number} (${wo.days_past_start}d overdue)`,
              description: `Work order "${wo.work_order_number}" has not been released.\nTitle: ${wo.title}\nProject: ${wo.project_name} (${wo.project_code})\nPlanned Start: ${new Date(wo.planned_start_date).toISOString().split('T')[0]}\nDays Past Start: ${wo.days_past_start}\nProduction Line: ${wo.production_line || 'Not assigned'}\nagent_severity: ${severity}\n\nAction Required: Release the production order or update the production schedule with a reason for delay.`,
              assignedTo: await escalationAssign(level, pm),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P3: Production Order Overdue ──
      const p3Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id, wo.supervisor_id,
          wo.status, wo.planned_end_date, wo.production_line, wo.batch_number, wo.quantity,
          p.name as project_name, p.code as project_code,
          EXTRACT(DAY FROM NOW() - wo.planned_end_date)::int as days_overdue,
          u.username as supervisor_name
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        LEFT JOIN users u ON wo.supervisor_id = u.id
        WHERE wo.status NOT IN ('completed', 'cancelled')
          AND wo.planned_end_date < CURRENT_DATE
        ORDER BY (NOW() - wo.planned_end_date) DESC
      `);
      queriesRun++;
      for (const wo of (p3Rows.rows || []) as any[]) {
        const daysOverdue = Number(wo.days_overdue || 0);
        const severity = daysOverdue >= 30 ? 'critical' : agentSev('P3');
        const fingerprint = fpProject('p3_overdue', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: daysOverdue >= 30 ? 'critical' : 'high',
          title: `P3 Production Order Overdue: ${wo.work_order_number} — ${daysOverdue}d overdue`,
          description: `Work order "${wo.work_order_number}" is ${daysOverdue} days past its planned end date.\nWO: ${wo.work_order_number} | ${wo.title}\nProject: ${wo.project_name} (${wo.project_code})\nStatus: ${wo.status} | Qty: ${wo.quantity}\nPlanned End: ${new Date(wo.planned_end_date).toISOString().split('T')[0]}\nSupervisor: ${wo.supervisor_name || 'Not assigned'}\nProduction Line: ${wo.production_line || 'Not assigned'}`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, woNumber: wo.work_order_number, projectId: wo.project_id, daysOverdue, supervisorId: wo.supervisor_id },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const level = escalationLevel(severity);
          const pm = await resolveProjectManager(wo.project_id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Order Overdue: ${wo.work_order_number}`,
            actionType: 'create_task',
            description: `WO ${daysOverdue}d overdue — production schedule at risk.`,
            actionPayload: {
              title: `[Agent] Production Order Overdue: ${wo.work_order_number} (${daysOverdue}d overdue)`,
              description: `Work order "${wo.work_order_number}" is overdue.\nTitle: ${wo.title}\nProject: ${wo.project_name} (${wo.project_code})\nStatus: ${wo.status} | Qty: ${wo.quantity}\nPlanned End: ${new Date(wo.planned_end_date).toISOString().split('T')[0]}\nDays Overdue: ${daysOverdue}\nSupervisor: ${wo.supervisor_name || 'Not assigned'}\nProduction Line: ${wo.production_line || 'Not assigned'}\nagent_severity: ${severity}\n\nAction Required: Complete the work order or update schedule with justification.`,
              assignedTo: await escalationAssign(level, pm),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P4: Production Scheduling Conflict (overlapping WOs on same production line) ──
      const p4Rows = await db.execute(sql`
        SELECT a.id as wo_a_id, a.work_order_number as wo_a, a.production_line,
          b.id as wo_b_id, b.work_order_number as wo_b,
          a.planned_start_date::date as a_start, a.planned_end_date::date as a_end,
          b.planned_start_date::date as b_start, b.planned_end_date::date as b_end
        FROM work_orders a
        JOIN work_orders b ON a.production_line = b.production_line AND a.id < b.id
        WHERE a.status NOT IN ('completed','cancelled') AND b.status NOT IN ('completed','cancelled')
          AND a.production_line IS NOT NULL AND a.production_line != ''
          AND a.planned_start_date < b.planned_end_date AND b.planned_start_date < a.planned_end_date
        LIMIT 20
      `);
      queriesRun++;
      for (const conflict of (p4Rows.rows || []) as any[]) {
        const severity = agentSev('P4');
        const fingerprint = fp('p4_conflict', 'wo_pair', `${conflict.wo_a_id}_${conflict.wo_b_id}`);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P4 Scheduling Conflict: ${conflict.wo_a} & ${conflict.wo_b} on ${conflict.production_line}`,
          description: `Two work orders overlap on the same production line.\nLine: ${conflict.production_line}\nWO-A: ${conflict.wo_a} (${conflict.a_start} to ${conflict.a_end})\nWO-B: ${conflict.wo_b} (${conflict.b_start} to ${conflict.b_end})\nAction: Resolve scheduling conflict.`,
          logicType: 'reactive',
          dataSnapshot: { woAId: conflict.wo_a_id, woBId: conflict.wo_b_id, line: conflict.production_line },
          relatedEntityType: 'work_order',
          relatedEntityId: String(conflict.wo_a_id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Scheduling Conflict: ${conflict.production_line}`,
            actionType: 'create_task',
            description: `Overlapping WOs on ${conflict.production_line}.`,
            actionPayload: {
              title: `[Agent] Production Scheduling Conflict: ${conflict.wo_a} & ${conflict.wo_b} on ${conflict.production_line}`,
              description: `Scheduling conflict detected on production line "${conflict.production_line}".\nWO-A: ${conflict.wo_a} (${conflict.a_start} → ${conflict.a_end})\nWO-B: ${conflict.wo_b} (${conflict.b_start} → ${conflict.b_end})\nagent_severity: ${severity}\n\nAction Required: Reschedule one of the work orders to resolve overlap.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P5: Production Backlog Building (project with > 10 open WOs) ──
      const p5Rows = await db.execute(sql`
        SELECT p.id, p.name, p.code,
          COUNT(*)::int as open_wo_count,
          MIN(wo.planned_end_date)::date as earliest_deadline,
          MAX(EXTRACT(DAY FROM NOW() - wo.planned_end_date))::int as max_overdue_days
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.status NOT IN ('completed','cancelled')
        GROUP BY p.id, p.name, p.code
        HAVING COUNT(*) >= 10
        ORDER BY COUNT(*) DESC
      `);
      queriesRun++;
      for (const proj of (p5Rows.rows || []) as any[]) {
        const severity = agentSev('P5');
        const fingerprint = fpProject('p5_backlog', proj.id, 'project', proj.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P5 Production Backlog Building: ${proj.name} — ${proj.open_wo_count} open WOs`,
          description: `Project "${proj.name}" (${proj.code}) has ${proj.open_wo_count} open work orders.\nEarliest deadline: ${proj.earliest_deadline}\nMax overdue: ${proj.max_overdue_days}d\nAction: Review backlog and prioritize production schedule.`,
          logicType: 'reactive',
          dataSnapshot: { projectId: proj.id, openWOCount: proj.open_wo_count, maxOverdueDays: proj.max_overdue_days },
          relatedEntityType: 'project',
          relatedEntityId: String(proj.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const pm = await resolveProjectManager(proj.id);
          const level = escalationLevel(severity);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Backlog Building: ${proj.name}`,
            actionType: 'create_task',
            description: `${proj.open_wo_count} open WOs building up.`,
            actionPayload: {
              title: `[Agent] Production Backlog Building: ${proj.name} (${proj.open_wo_count} open WOs)`,
              description: `Project "${proj.name}" (${proj.code}) has a production backlog of ${proj.open_wo_count} open work orders.\nEarliest deadline: ${proj.earliest_deadline}\nMax overdue: ${proj.max_overdue_days}d\nagent_severity: ${severity}\n\nAction Required: Review and prioritize production schedule, allocate additional resources if needed.`,
              assignedTo: await escalationAssign(level, pm),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P6: Production Plan Variance (estimated vs actual hours deviate >30%) ──
      const p6Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id,
          wo.estimated_hours, wo.actual_hours, wo.supervisor_id,
          p.name as project_name, p.code as project_code,
          u.username as supervisor_name,
          ROUND(ABS(wo.actual_hours - wo.estimated_hours)::numeric / NULLIF(wo.estimated_hours, 0) * 100, 1) as variance_pct
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        LEFT JOIN users u ON wo.supervisor_id = u.id
        WHERE wo.status = 'completed'
          AND wo.estimated_hours IS NOT NULL AND wo.estimated_hours > 0
          AND wo.actual_hours IS NOT NULL AND wo.actual_hours > 0
          AND ABS(wo.actual_hours - wo.estimated_hours)::numeric / NULLIF(wo.estimated_hours, 0) > 0.30
        ORDER BY variance_pct DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const wo of (p6Rows.rows || []) as any[]) {
        const severity = agentSev('P6');
        const fingerprint = fpProject('p6_variance', wo.project_id, 'wo', wo.id);
        const direction = Number(wo.actual_hours) > Number(wo.estimated_hours) ? 'over' : 'under';
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P6 Production Plan Variance: ${wo.work_order_number} — ${wo.variance_pct}% ${direction}`,
          description: `Work order "${wo.work_order_number}" has a ${wo.variance_pct}% variance between estimated and actual hours.\nEstimated: ${wo.estimated_hours}h | Actual: ${wo.actual_hours}h (${direction})\nProject: ${wo.project_name}\nSupervisor: ${wo.supervisor_name || 'N/A'}`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, estimated: wo.estimated_hours, actual: wo.actual_hours, variancePct: wo.variance_pct, direction },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P7: Batch Size Abnormal (WO quantity = 0 or extremely high) ──
      const p7Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.quantity, wo.project_id,
          p.name as project_name
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.status NOT IN ('cancelled')
          AND (wo.quantity <= 0 OR wo.quantity > 1000)
        LIMIT 20
      `);
      queriesRun++;
      for (const wo of (p7Rows.rows || []) as any[]) {
        const severity = agentSev('P7');
        const fingerprint = fpProject('p7_batch_abnormal', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P7 Batch Size Abnormal: ${wo.work_order_number} — qty ${wo.quantity}`,
          description: `Work order "${wo.work_order_number}" has an abnormal quantity of ${wo.quantity}.\nProject: ${wo.project_name}\nAction: Verify batch size is correct.`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, quantity: wo.quantity },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P8: Machine Capacity Exceeded (supervisor with > 15 open WOs) ──
      const p8Rows = await db.execute(sql`
        SELECT wo.supervisor_id, u.username, COUNT(*)::int as open_count,
          STRING_AGG(DISTINCT wo.production_line, ', ') as lines
        FROM work_orders wo
        JOIN users u ON wo.supervisor_id = u.id
        WHERE wo.status NOT IN ('completed','cancelled')
        GROUP BY wo.supervisor_id, u.username
        HAVING COUNT(*) > 15
        ORDER BY COUNT(*) DESC
      `);
      queriesRun++;
      for (const row of (p8Rows.rows || []) as any[]) {
        const severity = agentSev('P8');
        const fingerprint = fp('p8_capacity', 'supervisor', row.supervisor_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P8 Supervisor Capacity Exceeded: ${row.username} — ${row.open_count} open WOs`,
          description: `Supervisor "${row.username}" has ${row.open_count} open work orders.\nProduction Lines: ${row.lines || 'N/A'}\nThreshold: 15 WOs\nAction: Review workload and redistribute if needed.`,
          logicType: 'reactive',
          dataSnapshot: { supervisorId: row.supervisor_id, openCount: row.open_count, lines: row.lines },
          relatedEntityType: 'user',
          relatedEntityId: String(row.supervisor_id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Supervisor Capacity Exceeded: ${row.username}`,
            actionType: 'create_task',
            description: `${row.open_count} open WOs exceed threshold of 15.`,
            actionPayload: {
              title: `[Agent] Supervisor Capacity Exceeded: ${row.username} (${row.open_count} open WOs)`,
              description: `Supervisor "${row.username}" is overloaded with ${row.open_count} open work orders.\nLines: ${row.lines || 'N/A'}\nagent_severity: ${severity}\n\nAction Required: Review workload distribution and reassign WOs to other supervisors.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P9: Production Plan Changed After Release (WO status changed from in_progress back) ──
      const p9Rows = await db.execute(sql`
        SELECT woh.work_order_id, woh.old_value, woh.new_value, woh.created_at::date as changed_date,
          woh.username as changed_by,
          wo.work_order_number, wo.title, wo.project_id, p.name as project_name
        FROM work_order_history woh
        JOIN work_orders wo ON woh.work_order_id = wo.id
        JOIN projects p ON wo.project_id = p.id
        WHERE woh.field_name = 'status'
          AND woh.old_value = 'in_progress' AND woh.new_value = 'planned'
          AND woh.created_at >= NOW() - INTERVAL '7 days'
      `);
      queriesRun++;
      for (const change of (p9Rows.rows || []) as any[]) {
        const severity = agentSev('P9');
        const fingerprint = fpProject('p9_plan_change', change.project_id, 'wo', change.work_order_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P9 Production Plan Changed After Release: ${change.work_order_number}`,
          description: `WO "${change.work_order_number}" was reverted from in_progress to planned.\nProject: ${change.project_name}\nChanged by: ${change.changed_by}\nDate: ${change.changed_date}\nAction: Verify reason for production plan reversal.`,
          logicType: 'reactive',
          dataSnapshot: { woId: change.work_order_id, changedBy: change.changed_by, changedDate: change.changed_date },
          relatedEntityType: 'work_order',
          relatedEntityId: String(change.work_order_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P10: Excess WIP Inventory (WOs in_progress > 14 days without completion) ──
      const p10Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id, wo.supervisor_id,
          wo.actual_start_date, wo.planned_end_date, wo.quantity,
          p.name as project_name, u.username as supervisor_name,
          EXTRACT(DAY FROM NOW() - COALESCE(wo.actual_start_date, wo.planned_start_date))::int as days_in_progress
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        LEFT JOIN users u ON wo.supervisor_id = u.id
        WHERE wo.status = 'in_progress'
          AND COALESCE(wo.actual_start_date, wo.planned_start_date) < CURRENT_DATE - INTERVAL '14 days'
      `);
      queriesRun++;
      for (const wo of (p10Rows.rows || []) as any[]) {
        const severity = agentSev('P10');
        const fingerprint = fpProject('p10_wip', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P10 Excess WIP: ${wo.work_order_number} — ${wo.days_in_progress}d in progress`,
          description: `WO "${wo.work_order_number}" has been in progress for ${wo.days_in_progress} days.\nProject: ${wo.project_name}\nSupervisor: ${wo.supervisor_name || 'N/A'}\nAction: Review and expedite or close.`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, daysInProgress: wo.days_in_progress },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[ProductionAgent] P1-P10 error:`, err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GROUP 2: MATERIAL & INVENTORY (P11–P16)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // ── P11: Material Shortage (consumption > 90% of required) ──
      const p11Rows = await db.execute(sql`
        SELECT mc.id, mc.work_order_id, mc.quantity_required, mc.quantity_consumed, mc.status,
          wo.work_order_number, wo.title as wo_title, wo.project_id,
          p.name as project_name,
          ROUND((mc.quantity_consumed / NULLIF(mc.quantity_required, 0) * 100)::numeric, 1) as consumption_pct
        FROM material_consumption mc
        JOIN work_orders wo ON mc.work_order_id = wo.id
        JOIN projects p ON wo.project_id = p.id
        WHERE mc.quantity_consumed >= mc.quantity_required * 0.9
          AND mc.quantity_consumed < mc.quantity_required
          AND wo.status NOT IN ('completed','cancelled')
        ORDER BY consumption_pct DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p11Rows.rows || []) as any[]) {
        const severity = agentSev('P11');
        const fingerprint = fpProject('p11_material_short', row.project_id, 'mc', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'critical',
          title: `P11 Material Shortage Risk: WO ${row.work_order_number} — ${row.consumption_pct}% consumed`,
          description: `Material consumption at ${row.consumption_pct}% of required quantity.\nWO: ${row.work_order_number}\nRequired: ${row.quantity_required} | Consumed: ${row.quantity_consumed}\nProject: ${row.project_name}\nAction: Arrange additional material before shortage halts production.`,
          logicType: 'reactive',
          dataSnapshot: { mcId: row.id, woId: row.work_order_id, consumptionPct: row.consumption_pct },
          relatedEntityType: 'material_consumption',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Material Shortage Risk: WO ${row.work_order_number}`,
            actionType: 'create_task',
            description: `Material consumption at ${row.consumption_pct}% — shortage imminent.`,
            actionPayload: {
              title: `[Agent] Material Shortage Risk: WO ${row.work_order_number} (${row.consumption_pct}% consumed)`,
              description: `Material for WO "${row.work_order_number}" is nearly depleted.\nRequired: ${row.quantity_required} | Consumed: ${row.quantity_consumed}\nProject: ${row.project_name}\nagent_severity: ${severity}\n\nAction Required: Arrange additional material procurement immediately.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: 'Critical',
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'critical',
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P13: Material Consumption Variance (consumed > required by >10%) ──
      const p13Rows = await db.execute(sql`
        SELECT mc.id, mc.work_order_id, mc.quantity_required, mc.quantity_consumed,
          wo.work_order_number, wo.project_id, p.name as project_name,
          ROUND(((mc.quantity_consumed - mc.quantity_required) / NULLIF(mc.quantity_required, 0) * 100)::numeric, 1) as over_pct
        FROM material_consumption mc
        JOIN work_orders wo ON mc.work_order_id = wo.id
        JOIN projects p ON wo.project_id = p.id
        WHERE mc.quantity_consumed > mc.quantity_required * 1.1
        ORDER BY over_pct DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p13Rows.rows || []) as any[]) {
        const severity = agentSev('P13');
        const fingerprint = fpProject('p13_consumption_var', row.project_id, 'mc', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P13 Material Consumption Variance: WO ${row.work_order_number} — ${row.over_pct}% over`,
          description: `Material consumption exceeds required by ${row.over_pct}%.\nWO: ${row.work_order_number}\nRequired: ${row.quantity_required} | Consumed: ${row.quantity_consumed}\nProject: ${row.project_name}`,
          logicType: 'reactive',
          dataSnapshot: { mcId: row.id, woId: row.work_order_id, overPct: row.over_pct },
          relatedEntityType: 'material_consumption',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P14: Material Issued But Production Not Started ──
      const p14Rows = await db.execute(sql`
        SELECT mc.work_order_id, wo.work_order_number, wo.project_id, wo.status,
          p.name as project_name, SUM(mc.quantity_consumed)::numeric as total_consumed
        FROM material_consumption mc
        JOIN work_orders wo ON mc.work_order_id = wo.id
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.status = 'planned' AND mc.quantity_consumed > 0
        GROUP BY mc.work_order_id, wo.work_order_number, wo.project_id, wo.status, p.name
      `);
      queriesRun++;
      for (const row of (p14Rows.rows || []) as any[]) {
        const severity = agentSev('P14');
        const fingerprint = fpProject('p14_material_no_start', row.project_id, 'wo', row.work_order_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P14 Material Issued But Production Not Started: WO ${row.work_order_number}`,
          description: `Material has been consumed (${row.total_consumed} units) but WO is still in 'planned' status.\nWO: ${row.work_order_number}\nProject: ${row.project_name}\nAction: Start production or investigate material discrepancy.`,
          logicType: 'reactive',
          dataSnapshot: { woId: row.work_order_id, totalConsumed: row.total_consumed },
          relatedEntityType: 'work_order',
          relatedEntityId: String(row.work_order_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P16: Inventory Mismatch (consumed > required) ──
      const p16Rows = await db.execute(sql`
        SELECT mc.id, mc.work_order_id, mc.quantity_required, mc.quantity_consumed,
          wo.work_order_number, p.name as project_name, wo.project_id,
          ROUND((mc.quantity_consumed - mc.quantity_required)::numeric, 2) as overshoot
        FROM material_consumption mc
        JOIN work_orders wo ON mc.work_order_id = wo.id
        JOIN projects p ON wo.project_id = p.id
        WHERE mc.quantity_consumed > mc.quantity_required AND mc.quantity_required > 0
        ORDER BY overshoot DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p16Rows.rows || []) as any[]) {
        const severity = agentSev('P16');
        const fingerprint = fpProject('p16_inv_mismatch', row.project_id, 'mc', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P16 Inventory Mismatch: WO ${row.work_order_number} — consumed exceeds required by ${row.overshoot}`,
          description: `Consumed quantity (${row.quantity_consumed}) exceeds required (${row.quantity_required}) by ${row.overshoot}.\nWO: ${row.work_order_number}\nProject: ${row.project_name}\nAction: Investigate inventory discrepancy.`,
          logicType: 'reactive',
          dataSnapshot: { mcId: row.id, overshoot: row.overshoot },
          relatedEntityType: 'material_consumption',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[ProductionAgent] P11-P16 error:`, err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GROUP 3: SHOP FLOOR EXECUTION (P17–P26)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // ── P17: Production Not Started After Release (planned, start date passed) ──
      const p17Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id, wo.supervisor_id,
          wo.planned_start_date, wo.production_line,
          p.name as project_name, u.username as supervisor_name,
          EXTRACT(DAY FROM NOW() - wo.planned_start_date)::int as days_past_start
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        LEFT JOIN users u ON wo.supervisor_id = u.id
        WHERE wo.status = 'planned'
          AND wo.planned_start_date < CURRENT_DATE
        ORDER BY wo.planned_start_date
      `);
      queriesRun++;
      for (const wo of (p17Rows.rows || []) as any[]) {
        const daysPast = Number(wo.days_past_start || 0);
        const severity = daysPast >= 30 ? 'critical' : agentSev('P17');
        const fingerprint = fpProject('p17_not_started', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: daysPast >= 30 ? 'critical' : 'high',
          title: `P17 Production Not Started: ${wo.work_order_number} — ${daysPast}d past planned start`,
          description: `WO "${wo.work_order_number}" has not started ${daysPast} days after planned start.\nTitle: ${wo.title}\nProject: ${wo.project_name}\nPlanned Start: ${new Date(wo.planned_start_date).toISOString().split('T')[0]}\nSupervisor: ${wo.supervisor_name || 'N/A'}\nLine: ${wo.production_line || 'Not assigned'}`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, daysPastStart: daysPast, supervisorId: wo.supervisor_id },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint) && daysPast >= 3) {
          const level = escalationLevel(severity);
          const pm = await resolveProjectManager(wo.project_id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Not Started: ${wo.work_order_number}`,
            actionType: 'create_task',
            description: `WO not started ${daysPast}d past planned start date.`,
            actionPayload: {
              title: `[Agent] Production Not Started: ${wo.work_order_number} (${daysPast}d past start)`,
              description: `WO "${wo.work_order_number}" has passed its planned start date but has not been started.\nTitle: ${wo.title}\nProject: ${wo.project_name}\nPlanned Start: ${new Date(wo.planned_start_date).toISOString().split('T')[0]}\nSupervisor: ${wo.supervisor_name || 'N/A'}\nProduction Line: ${wo.production_line || 'Not assigned'}\nDays Past Start: ${daysPast}\nagent_severity: ${severity}\n\nAction Required: Investigate delay and start production or update schedule with reason.`,
              assignedTo: await escalationAssign(level, pm),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P19: Machine Idle With Pending Orders (allocated machine with no active WO) ──
      const p19Rows = await db.execute(sql`
        SELECT ma.machine_name, ma.machine_code, ma.work_order_id, ma.status as alloc_status,
          ma.downtime_minutes,
          wo.work_order_number, wo.status as wo_status, wo.project_id
        FROM machine_allocations ma
        JOIN work_orders wo ON ma.work_order_id = wo.id
        WHERE ma.status = 'idle'
          AND wo.status NOT IN ('completed','cancelled')
          AND ma.downtime_minutes > 60
        ORDER BY ma.downtime_minutes DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p19Rows.rows || []) as any[]) {
        const severity = agentSev('P19');
        const fingerprint = fp('p19_machine_idle', 'machine', row.machine_code || row.machine_name);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P19 Machine Idle With Pending Orders: ${row.machine_name} — ${row.downtime_minutes}min idle`,
          description: `Machine "${row.machine_name}" (${row.machine_code || 'N/A'}) is idle for ${row.downtime_minutes} minutes with pending WO ${row.work_order_number}.\nWO Status: ${row.wo_status}\nAction: Investigate machine idle reason and resume production.`,
          logicType: 'reactive',
          dataSnapshot: { machineName: row.machine_name, downtime: row.downtime_minutes, woId: row.work_order_id },
          relatedEntityType: 'machine_allocation',
          relatedEntityId: row.machine_code || row.machine_name,
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Machine Idle With Pending Orders: ${row.machine_name}`,
            actionType: 'create_task',
            description: `Machine idle ${row.downtime_minutes}min with pending WO.`,
            actionPayload: {
              title: `[Agent] Machine Idle With Pending Orders: ${row.machine_name} (${row.downtime_minutes}min)`,
              description: `Machine "${row.machine_name}" is idle with pending work order ${row.work_order_number}.\nDowntime: ${row.downtime_minutes} minutes\nagent_severity: ${severity}\n\nAction Required: Investigate idle reason and resume production.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P20: Unplanned Machine Downtime (>120 min downtime) ──
      const p20Rows = await db.execute(sql`
        SELECT ma.id, ma.machine_name, ma.machine_code, ma.work_order_id, ma.downtime_minutes,
          ma.notes, wo.work_order_number, wo.project_id
        FROM machine_allocations ma
        JOIN work_orders wo ON ma.work_order_id = wo.id
        WHERE ma.downtime_minutes > 120
          AND ma.created_at >= NOW() - INTERVAL '7 days'
        ORDER BY ma.downtime_minutes DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p20Rows.rows || []) as any[]) {
        const severity = agentSev('P20');
        const fingerprint = fp('p20_downtime', 'machine_alloc', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P20 Unplanned Downtime: ${row.machine_name} — ${row.downtime_minutes}min on WO ${row.work_order_number}`,
          description: `Unplanned machine downtime of ${row.downtime_minutes} minutes.\nMachine: ${row.machine_name} (${row.machine_code || 'N/A'})\nWO: ${row.work_order_number}\nNotes: ${row.notes || 'None'}\nAction: Review maintenance and prevent recurrence.`,
          logicType: 'reactive',
          dataSnapshot: { allocId: row.id, downtime: row.downtime_minutes, machineName: row.machine_name },
          relatedEntityType: 'machine_allocation',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P21: Frequent Machine Stoppage (>3 downtime records in 7 days) ──
      const p21Rows = await db.execute(sql`
        SELECT ma.machine_name, ma.machine_code,
          COUNT(*)::int as stoppage_count,
          SUM(ma.downtime_minutes)::int as total_downtime
        FROM machine_allocations ma
        WHERE ma.downtime_minutes > 0
          AND ma.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY ma.machine_name, ma.machine_code
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC
      `);
      queriesRun++;
      for (const row of (p21Rows.rows || []) as any[]) {
        const severity = agentSev('P21');
        const fingerprint = fp('p21_frequent_stop', 'machine', row.machine_code || row.machine_name);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P21 Frequent Machine Stoppage: ${row.machine_name} — ${row.stoppage_count} stops, ${row.total_downtime}min total`,
          description: `Machine "${row.machine_name}" had ${row.stoppage_count} stoppages in 7 days totaling ${row.total_downtime} minutes.\nAction: Investigate root cause and schedule preventive maintenance.`,
          logicType: 'reactive',
          dataSnapshot: { machineName: row.machine_name, stoppageCount: row.stoppage_count, totalDowntime: row.total_downtime },
          relatedEntityType: 'machine_allocation',
          relatedEntityId: row.machine_code || row.machine_name,
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Frequent Machine Stoppage: ${row.machine_name}`,
            actionType: 'create_task',
            description: `${row.stoppage_count} stoppages in 7 days — maintenance review needed.`,
            actionPayload: {
              title: `[Agent] Frequent Machine Stoppage: ${row.machine_name} (${row.stoppage_count} stops)`,
              description: `Machine "${row.machine_name}" is experiencing frequent stoppages.\nStoppages: ${row.stoppage_count} in 7 days\nTotal downtime: ${row.total_downtime} minutes\nagent_severity: ${severity}\n\nAction Required: Schedule preventive maintenance and investigate root cause.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P22: Production Data Not Logged (active WO with no production records in 7 days) ──
      const p22Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id, wo.supervisor_id,
          p.name as project_name, u.username as supervisor_name,
          (SELECT MAX(pr.date) FROM production_records pr WHERE pr.work_order_id = wo.id) as last_record_date
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        LEFT JOIN users u ON wo.supervisor_id = u.id
        WHERE wo.status = 'in_progress'
          AND NOT EXISTS (
            SELECT 1 FROM production_records pr
            WHERE pr.work_order_id = wo.id AND pr.date >= CURRENT_DATE - 7
          )
      `);
      queriesRun++;
      for (const wo of (p22Rows.rows || []) as any[]) {
        const severity = agentSev('P22');
        const fingerprint = fpProject('p22_no_log', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P22 Production Data Not Logged: ${wo.work_order_number}`,
          description: `Active WO "${wo.work_order_number}" has no production records in the last 7 days.\nProject: ${wo.project_name}\nSupervisor: ${wo.supervisor_name || 'N/A'}\nLast record: ${wo.last_record_date || 'Never'}\nAction: Log production data or update WO status.`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, lastRecordDate: wo.last_record_date },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P24: Operator Missing on Machine (resource assignment with no user activity) ──
      const p24Rows = await db.execute(sql`
        SELECT ra.id, ra.work_order_id, ra.user_id, ra.role, ra.status,
          wo.work_order_number, u.username,
          NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.user_id = ra.user_id AND ar.date = CURRENT_DATE AND ar.status != 'absent'
          ) as absent_today
        FROM resource_assignments ra
        JOIN work_orders wo ON ra.work_order_id = wo.id
        JOIN users u ON ra.user_id = u.id
        WHERE wo.status = 'in_progress'
          AND ra.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.user_id = ra.user_id AND ar.date = CURRENT_DATE AND ar.status != 'absent'
          )
      `);
      queriesRun++;
      for (const row of (p24Rows.rows || []) as any[]) {
        const severity = agentSev('P24');
        const fingerprint = fp('p24_operator_missing', 'ra', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P24 Operator Missing: ${row.username} absent for active WO ${row.work_order_number}`,
          description: `Assigned operator "${row.username}" is absent today but has an active assignment on WO ${row.work_order_number}.\nRole: ${row.role}\nAction: Assign backup operator.`,
          logicType: 'reactive',
          dataSnapshot: { raId: row.id, userId: row.user_id, woId: row.work_order_id },
          relatedEntityType: 'resource_assignment',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[ProductionAgent] P17-P26 error:`, err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GROUP 4: PRODUCTION EFFICIENCY (P27–P34)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // ── P27: Production Yield Below Threshold (<85%) ──
      const p27Rows = await db.execute(sql`
        SELECT pr.work_order_id,
          wo.work_order_number, wo.quantity as planned_qty, wo.project_id,
          p.name as project_name,
          SUM(pr.quantity_produced)::int as total_produced,
          SUM(pr.quantity_rejected)::int as total_rejected,
          CASE WHEN SUM(pr.quantity_produced) + SUM(pr.quantity_rejected) > 0
            THEN ROUND(SUM(pr.quantity_produced)::numeric / (SUM(pr.quantity_produced) + SUM(pr.quantity_rejected)) * 100, 1)
            ELSE 100 END as yield_pct
        FROM production_records pr
        JOIN work_orders wo ON pr.work_order_id = wo.id
        JOIN projects p ON wo.project_id = p.id
        GROUP BY pr.work_order_id, wo.work_order_number, wo.quantity, wo.project_id, p.name
        HAVING CASE WHEN SUM(pr.quantity_produced) + SUM(pr.quantity_rejected) > 0
          THEN SUM(pr.quantity_produced)::numeric / (SUM(pr.quantity_produced) + SUM(pr.quantity_rejected)) * 100
          ELSE 100 END < 85
        ORDER BY yield_pct
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p27Rows.rows || []) as any[]) {
        const severity = agentSev('P27');
        const fingerprint = fpProject('p27_low_yield', row.project_id, 'wo', row.work_order_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P27 Production Yield Below Threshold: WO ${row.work_order_number} — ${row.yield_pct}%`,
          description: `WO "${row.work_order_number}" has a yield of ${row.yield_pct}% (threshold: 85%).\nProduced: ${row.total_produced} | Rejected: ${row.total_rejected}\nProject: ${row.project_name}\nAction: Investigate quality issues causing low yield.`,
          logicType: 'reactive',
          dataSnapshot: { woId: row.work_order_id, yieldPct: row.yield_pct, produced: row.total_produced, rejected: row.total_rejected },
          relatedEntityType: 'work_order',
          relatedEntityId: String(row.work_order_id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Low Production Yield: WO ${row.work_order_number}`,
            actionType: 'create_task',
            description: `Yield at ${row.yield_pct}% — below 85% threshold.`,
            actionPayload: {
              title: `[Agent] Low Production Yield: WO ${row.work_order_number} (${row.yield_pct}%)`,
              description: `WO "${row.work_order_number}" has a yield below threshold.\nYield: ${row.yield_pct}%\nProduced: ${row.total_produced} | Rejected: ${row.total_rejected}\nProject: ${row.project_name}\nagent_severity: ${severity}\n\nAction Required: Investigate root cause of rejections and implement corrective measures.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P28: High Rejection Rate (>15%) ──
      const p28Rows = await db.execute(sql`
        SELECT pr.work_order_id, wo.work_order_number, wo.project_id, p.name as project_name,
          SUM(pr.quantity_produced)::int as produced, SUM(pr.quantity_rejected)::int as rejected,
          ROUND(SUM(pr.quantity_rejected)::numeric / NULLIF(SUM(pr.quantity_produced) + SUM(pr.quantity_rejected), 0) * 100, 1) as rejection_pct
        FROM production_records pr
        JOIN work_orders wo ON pr.work_order_id = wo.id
        JOIN projects p ON wo.project_id = p.id
        WHERE pr.quantity_rejected > 0
        GROUP BY pr.work_order_id, wo.work_order_number, wo.project_id, p.name
        HAVING SUM(pr.quantity_rejected)::numeric / NULLIF(SUM(pr.quantity_produced) + SUM(pr.quantity_rejected), 0) * 100 > 15
        ORDER BY rejection_pct DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p28Rows.rows || []) as any[]) {
        const severity = agentSev('P28');
        const fingerprint = fpProject('p28_high_reject', row.project_id, 'wo', row.work_order_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P28 High Rejection Rate: WO ${row.work_order_number} — ${row.rejection_pct}%`,
          description: `WO "${row.work_order_number}" has a rejection rate of ${row.rejection_pct}%.\nProduced: ${row.produced} | Rejected: ${row.rejected}\nProject: ${row.project_name}`,
          logicType: 'reactive',
          dataSnapshot: { woId: row.work_order_id, rejectionPct: row.rejection_pct, produced: row.produced, rejected: row.rejected },
          relatedEntityType: 'work_order',
          relatedEntityId: String(row.work_order_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P30: Production Cycle Time Deviation (actual hours > 1.5x estimated) ──
      const p30Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.project_id, wo.estimated_hours, wo.actual_hours,
          p.name as project_name,
          ROUND((wo.actual_hours::numeric / NULLIF(wo.estimated_hours, 0) - 1) * 100, 1) as deviation_pct
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.actual_hours IS NOT NULL AND wo.estimated_hours IS NOT NULL
          AND wo.estimated_hours > 0
          AND wo.actual_hours > wo.estimated_hours * 1.5
        ORDER BY deviation_pct DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const wo of (p30Rows.rows || []) as any[]) {
        const severity = agentSev('P30');
        const fingerprint = fpProject('p30_cycle_deviation', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P30 Cycle Time Deviation: WO ${wo.work_order_number} — ${wo.deviation_pct}% over estimate`,
          description: `WO "${wo.work_order_number}" actual hours exceeded estimate by ${wo.deviation_pct}%.\nEstimated: ${wo.estimated_hours}h | Actual: ${wo.actual_hours}h\nProject: ${wo.project_name}`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, deviationPct: wo.deviation_pct },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P31: Low Plant Utilization (< 50% of WOs completed per production line) ──
      const p31Rows = await db.execute(sql`
        SELECT production_line,
          COUNT(*)::int as total_wos,
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed,
          ROUND(COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as utilization_pct
        FROM work_orders
        WHERE production_line IS NOT NULL AND production_line != ''
        GROUP BY production_line
        HAVING COUNT(*) >= 3
          AND COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100 < 50
        ORDER BY utilization_pct
      `);
      queriesRun++;
      for (const row of (p31Rows.rows || []) as any[]) {
        const severity = agentSev('P31');
        const fingerprint = fp('p31_low_util', 'line', row.production_line);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P31 Low Plant Utilization: ${row.production_line} — ${row.utilization_pct}% completion rate`,
          description: `Production line "${row.production_line}" has only ${row.utilization_pct}% completion rate.\nTotal WOs: ${row.total_wos} | Completed: ${row.completed}\nAction: Review line efficiency and scheduling.`,
          logicType: 'reactive',
          dataSnapshot: { line: row.production_line, totalWOs: row.total_wos, completed: row.completed, utilizationPct: row.utilization_pct },
          relatedEntityType: 'production_line',
          relatedEntityId: row.production_line,
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P32: Bottleneck Machine Detected (machine with highest cumulative setup + downtime) ──
      const p32Rows = await db.execute(sql`
        SELECT ma.machine_name, ma.machine_code,
          COUNT(*)::int as allocation_count,
          SUM(ma.setup_time_minutes)::int as total_setup,
          SUM(ma.downtime_minutes)::int as total_downtime,
          SUM(ma.setup_time_minutes + ma.downtime_minutes)::int as total_idle
        FROM machine_allocations ma
        WHERE ma.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY ma.machine_name, ma.machine_code
        HAVING SUM(ma.setup_time_minutes + ma.downtime_minutes) > 480
        ORDER BY total_idle DESC
        LIMIT 10
      `);
      queriesRun++;
      for (const row of (p32Rows.rows || []) as any[]) {
        const severity = agentSev('P32');
        const fingerprint = fp('p32_bottleneck', 'machine', row.machine_code || row.machine_name);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P32 Bottleneck Machine: ${row.machine_name} — ${row.total_idle}min idle in 30 days`,
          description: `Machine "${row.machine_name}" is a bottleneck with ${row.total_idle} minutes of setup + downtime in 30 days.\nSetup: ${row.total_setup}min | Downtime: ${row.total_downtime}min\nAllocations: ${row.allocation_count}\nAction: Optimize setup procedures or add capacity.`,
          logicType: 'reactive',
          dataSnapshot: { machineName: row.machine_name, totalSetup: row.total_setup, totalDowntime: row.total_downtime, totalIdle: row.total_idle },
          relatedEntityType: 'machine_allocation',
          relatedEntityId: row.machine_code || row.machine_name,
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Bottleneck Machine Detected: ${row.machine_name}`,
            actionType: 'create_task',
            description: `${row.total_idle}min idle time — production bottleneck.`,
            actionPayload: {
              title: `[Agent] Bottleneck Machine Detected: ${row.machine_name} (${row.total_idle}min idle)`,
              description: `Machine "${row.machine_name}" is causing a production bottleneck.\nSetup time: ${row.total_setup}min | Downtime: ${row.total_downtime}min\nTotal idle: ${row.total_idle}min in 30 days\nagent_severity: ${severity}\n\nAction Required: Optimize setup, schedule preventive maintenance, or add parallel capacity.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    } catch (err: any) {
      console.error(`[ProductionAgent] P27-P34 error:`, err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GROUP 5: WORKFORCE & SHIFT (P35–P39)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // ── P35: Shift Staffing Shortage (production team members absent today) ──
      const p35Rows = await db.execute(sql`
        SELECT u.id, u.username,
          NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.user_id = u.id AND ar.date = CURRENT_DATE
              AND ar.check_in_time IS NOT NULL
          ) as not_checked_in
        FROM users u
        WHERE u.department = 'Production' AND u.is_active = true
      `);
      queriesRun++;
      const absentToday = ((p35Rows.rows || []) as any[]).filter(r => r.not_checked_in);
      const totalProdStaff = (p35Rows.rows || []).length;
      if (absentToday.length > 0 && absentToday.length >= totalProdStaff * 0.3) {
        const severity = agentSev('P35');
        const today = new Date().toISOString().split('T')[0];
        const fingerprint = fp('p35_staffing', 'date', today);
        const absentNames = absentToday.map((u: any) => u.username).join(', ');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'high',
          title: `P35 Shift Staffing Shortage: ${absentToday.length}/${totalProdStaff} production staff absent`,
          description: `${absentToday.length} out of ${totalProdStaff} production team members have not checked in today.\nAbsent: ${absentNames}\nDate: ${today}\nAction: Arrange backup staffing or adjust production schedule.`,
          logicType: 'reactive',
          dataSnapshot: { absentCount: absentToday.length, totalStaff: totalProdStaff, absentUsers: absentToday.map((u: any) => ({ id: u.id, name: u.username })) },
          relatedEntityType: 'attendance',
          relatedEntityId: today,
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Shift Staffing Shortage: ${absentToday.length} absent`,
            actionType: 'create_task',
            description: `${absentToday.length}/${totalProdStaff} production staff absent today.`,
            actionPayload: {
              title: `[Agent] Shift Staffing Shortage: ${absentToday.length}/${totalProdStaff} Production Staff Absent`,
              description: `Production team staffing shortage detected.\nAbsent: ${absentNames}\nTotal production staff: ${totalProdStaff}\nDate: ${today}\nagent_severity: ${severity}\n\nAction Required: Arrange backup staffing or adjust production schedule.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P36: Production Supervisor Missing (Jawahar not checked in) ──
      const p36Rows = await db.execute(sql`
        SELECT NOT EXISTS (
          SELECT 1 FROM attendance_records ar
          WHERE ar.user_id = ${PROD_MANAGER_ID} AND ar.date = CURRENT_DATE
            AND ar.check_in_time IS NOT NULL
        ) as supervisor_absent
      `);
      queriesRun++;
      const supervisorAbsent = ((p36Rows.rows as any[])[0])?.supervisor_absent;
      if (supervisorAbsent) {
        const today = new Date().toISOString().split('T')[0];
        const severity = agentSev('P36');
        const fingerprint = fp('p36_supervisor_missing', 'date', today);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'critical',
          title: `P36 Production Supervisor Missing: Jawahar not checked in`,
          description: `Production Manager Jawahar has not checked in today (${today}).\nImpact: Production floor without supervision\nAction: Assign acting supervisor immediately.`,
          logicType: 'reactive',
          dataSnapshot: { supervisorId: PROD_MANAGER_ID, date: today },
          relatedEntityType: 'attendance',
          relatedEntityId: today,
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Supervisor Missing`,
            actionType: 'create_task',
            description: `Production Manager absent — floor unsupervised.`,
            actionPayload: {
              title: `[Agent] Production Supervisor Missing: Jawahar Not Checked In (${today})`,
              description: `Production Manager Jawahar has not checked in today.\nDate: ${today}\nImpact: Production floor without direct supervision\nagent_severity: ${severity}\n\nAction Required: Assign acting production supervisor immediately.`,
              assignedTo: await resolveEscalation('L3', PROD_MANAGER_ID),
              priority: 'Critical',
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'critical',
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── P38: Excess Overtime (production staff with >4 overtime days in 14 days) ──
      const p38Rows = await db.execute(sql`
        SELECT ar.user_id, u.username,
          COUNT(*)::int as overtime_days,
          SUM(ar.overtime_hours)::numeric(8,1) as total_overtime
        FROM attendance_records ar
        JOIN users u ON ar.user_id = u.id
        WHERE u.department = 'Production' AND u.is_active = true
          AND ar.date >= CURRENT_DATE - 14
          AND ar.overtime_hours > 0
        GROUP BY ar.user_id, u.username
        HAVING COUNT(*) >= 4
        ORDER BY total_overtime DESC
      `);
      queriesRun++;
      for (const row of (p38Rows.rows || []) as any[]) {
        const severity = agentSev('P38');
        const fingerprint = fp('p38_overtime', 'user', row.user_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P38 Excess Overtime: ${row.username} — ${row.overtime_days} days, ${row.total_overtime}h in 14 days`,
          description: `Production team member "${row.username}" has worked overtime on ${row.overtime_days} days totaling ${row.total_overtime} hours in 14 days.\nAction: Review workload and staffing levels.`,
          logicType: 'reactive',
          dataSnapshot: { userId: row.user_id, overtimeDays: row.overtime_days, totalOvertime: row.total_overtime },
          relatedEntityType: 'user',
          relatedEntityId: String(row.user_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P39: Attendance Mismatch (production staff checked in but no DPR submitted) ──
      const p39Rows = await db.execute(sql`
        SELECT u.id as user_id, u.username
        FROM users u
        WHERE u.department = 'Production' AND u.is_active = true
          AND EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.user_id = u.id AND ar.date = CURRENT_DATE - 1
              AND ar.check_in_time IS NOT NULL AND ar.status != 'absent'
          )
          AND NOT EXISTS (
            SELECT 1 FROM daily_work_reports dwr
            WHERE dwr.user_id = u.id AND dwr.report_date = CURRENT_DATE - 1
          )
      `);
      queriesRun++;
      for (const row of (p39Rows.rows || []) as any[]) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const severity = agentSev('P39');
        const fingerprint = fp('p39_attendance_mismatch', 'user_date', `${row.user_id}_${yesterday}`);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P39 Attendance Mismatch: ${row.username} — checked in but no DPR for ${yesterday}`,
          description: `Production team member "${row.username}" was present on ${yesterday} but did not submit a Daily Production Report.\nAction: Follow up on missing DPR.`,
          logicType: 'reactive',
          dataSnapshot: { userId: row.user_id, date: yesterday },
          relatedEntityType: 'user',
          relatedEntityId: String(row.user_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[ProductionAgent] P35-P39 error:`, err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GROUP 6: REPORTING & COMPLIANCE (P40–P45)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // ── P40: DPR Missing (production team members who did not submit DPR yesterday) ──
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const dayOfWeek = new Date(Date.now() - 86400000).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const p40Rows = await db.execute(sql`
          SELECT u.id, u.username
          FROM users u
          WHERE u.department = 'Production' AND u.is_active = true
            AND u.role != 'Manager'
            AND NOT EXISTS (
              SELECT 1 FROM daily_work_reports dwr
              WHERE dwr.user_id = u.id AND dwr.report_date = ${yesterday}::date
            )
            AND EXISTS (
              SELECT 1 FROM attendance_records ar
              WHERE ar.user_id = u.id AND ar.date = ${yesterday}::date
                AND ar.check_in_time IS NOT NULL
            )
        `);
        queriesRun++;
        for (const user of (p40Rows.rows || []) as any[]) {
          const severity = agentSev('P40');
          const fingerprint = fp('p40_dpr_missing', 'user_date', `${user.id}_${yesterday}`);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: 'high',
            title: `P40 DPR Missing: ${user.username} — no report for ${yesterday}`,
            description: `Production team member "${user.username}" was present on ${yesterday} but has not submitted a Daily Production Report.\nAction: Follow up and ensure DPR is submitted.`,
            logicType: 'reactive',
            dataSnapshot: { userId: user.id, date: yesterday },
            relatedEntityType: 'daily_work_report',
            relatedEntityId: `${user.id}_${yesterday}`,
          });
          if (!finding.isDuplicate) findingsCount++;
          if (!await hasOpenTask(fingerprint)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] DPR Missing: ${user.username}`,
              actionType: 'create_task',
              description: `No DPR submitted by ${user.username} for ${yesterday}.`,
              actionPayload: {
                title: `[Agent] DPR Missing: ${user.username} (${yesterday})`,
                description: `Production team member "${user.username}" has not submitted a Daily Production Report for ${yesterday}.\nUser was marked as present in attendance.\nagent_severity: ${severity}\n\nAction Required: Follow up with ${user.username} and ensure DPR is submitted.`,
                assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
                priority: priorityFromSeverity(severity),
                category: `Production ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: priorityFromSeverity(severity).toLowerCase(),
              confidence: 0.95,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── P42: Production Data Incomplete (WO completed but no actual hours or dates) ──
      const p42Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id,
          p.name as project_name,
          wo.actual_start_date IS NULL as missing_start,
          wo.actual_end_date IS NULL as missing_end,
          wo.actual_hours IS NULL as missing_hours
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        WHERE wo.status = 'completed'
          AND (wo.actual_start_date IS NULL OR wo.actual_end_date IS NULL OR wo.actual_hours IS NULL)
        LIMIT 30
      `);
      queriesRun++;
      for (const wo of (p42Rows.rows || []) as any[]) {
        const missingFields: string[] = [];
        if (wo.missing_start) missingFields.push('actual_start_date');
        if (wo.missing_end) missingFields.push('actual_end_date');
        if (wo.missing_hours) missingFields.push('actual_hours');
        const severity = agentSev('P42');
        const fingerprint = fpProject('p42_incomplete', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P42 Production Data Incomplete: ${wo.work_order_number} — missing ${missingFields.join(', ')}`,
          description: `Completed WO "${wo.work_order_number}" is missing production data.\nMissing: ${missingFields.join(', ')}\nProject: ${wo.project_name}\nAction: Update WO with actual production data.`,
          logicType: 'reactive',
          dataSnapshot: { woId: wo.id, missingFields },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P44: Late DPR Submission (DPR submitted >24h after report_date) ──
      const p44Rows = await db.execute(sql`
        SELECT dwr.id, dwr.user_id, dwr.report_date, dwr.submitted_at,
          u.username,
          EXTRACT(HOUR FROM dwr.submitted_at - dwr.report_date::timestamp)::int as hours_late
        FROM daily_work_reports dwr
        JOIN users u ON dwr.user_id = u.id
        WHERE u.department = 'Production'
          AND dwr.submitted_at IS NOT NULL
          AND dwr.submitted_at > dwr.report_date::timestamp + INTERVAL '36 hours'
          AND dwr.report_date >= CURRENT_DATE - 7
        ORDER BY hours_late DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p44Rows.rows || []) as any[]) {
        const severity = agentSev('P44');
        const fingerprint = fp('p44_late_dpr', 'dwr', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `P44 Late DPR Submission: ${row.username} — ${row.hours_late}h late for ${row.report_date}`,
          description: `DPR by "${row.username}" for ${row.report_date} was submitted ${row.hours_late} hours late.\nAction: Enforce timely DPR submission.`,
          logicType: 'reactive',
          dataSnapshot: { dwrId: row.id, userId: row.user_id, hoursLate: row.hours_late },
          relatedEntityType: 'daily_work_report',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── P45: Unauthorized Production Change (WO field changes by non-supervisor) ──
      const p45Rows = await db.execute(sql`
        SELECT woh.id, woh.work_order_id, woh.username as changed_by,
          woh.field_name, woh.old_value, woh.new_value, woh.created_at::date as change_date,
          wo.work_order_number, wo.supervisor_id,
          (SELECT u2.username FROM users u2 WHERE u2.id = wo.supervisor_id) as supervisor_name
        FROM work_order_history woh
        JOIN work_orders wo ON woh.work_order_id = wo.id
        WHERE woh.created_at >= NOW() - INTERVAL '7 days'
          AND woh.change_type IN ('field_update', 'status_change')
          AND woh.username IS NOT NULL
          AND woh.username != (SELECT u3.username FROM users u3 WHERE u3.id = wo.supervisor_id)
          AND woh.username != 'Prasad'
          AND woh.username != 'Jawahar'
        ORDER BY woh.created_at DESC
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (p45Rows.rows || []) as any[]) {
        const severity = agentSev('P45');
        const fingerprint = fp('p45_unauth_change', 'woh', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'critical',
          title: `P45 Unauthorized Production Change: ${row.work_order_number} by ${row.changed_by}`,
          description: `WO "${row.work_order_number}" was modified by ${row.changed_by} (not the supervisor ${row.supervisor_name}).\nField: ${row.field_name}\nOld: ${row.old_value || 'N/A'} → New: ${row.new_value || 'N/A'}\nDate: ${row.change_date}\nAction: Verify authorization.`,
          logicType: 'reactive',
          dataSnapshot: { wohId: row.id, woId: row.work_order_id, changedBy: row.changed_by, field: row.field_name },
          relatedEntityType: 'work_order_history',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[ProductionAgent] P40-P45 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION B: PRODUCTION RISK INTELLIGENCE (R1–R10)
    // ════════════════════════════════════════════════════════════════════════════════

    try {
      // ── R1: Machine Becoming a Bottleneck (increasing downtime trend) ──
      const r1Rows = await db.execute(sql`
        SELECT ma.machine_name, ma.machine_code,
          (SELECT SUM(ma2.downtime_minutes) FROM machine_allocations ma2
            WHERE ma2.machine_name = ma.machine_name
              AND ma2.created_at >= NOW() - INTERVAL '14 days'
              AND ma2.created_at < NOW() - INTERVAL '7 days')::int as prev_week_downtime,
          (SELECT SUM(ma3.downtime_minutes) FROM machine_allocations ma3
            WHERE ma3.machine_name = ma.machine_name
              AND ma3.created_at >= NOW() - INTERVAL '7 days')::int as curr_week_downtime
        FROM machine_allocations ma
        GROUP BY ma.machine_name, ma.machine_code
        HAVING (SELECT SUM(ma3.downtime_minutes) FROM machine_allocations ma3
            WHERE ma3.machine_name = ma.machine_name
              AND ma3.created_at >= NOW() - INTERVAL '7 days') >
          COALESCE((SELECT SUM(ma2.downtime_minutes) FROM machine_allocations ma2
            WHERE ma2.machine_name = ma.machine_name
              AND ma2.created_at >= NOW() - INTERVAL '14 days'
              AND ma2.created_at < NOW() - INTERVAL '7 days'), 0) * 1.5
      `);
      queriesRun++;
      for (const row of (r1Rows.rows || []) as any[]) {
        const prevDown = Number(row.prev_week_downtime || 0);
        const currDown = Number(row.curr_week_downtime || 0);
        if (currDown < 60) continue;
        const severity = agentSev('R1');
        const fingerprint = fp('r1_bottleneck_trend', 'machine', row.machine_code || row.machine_name);
        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'high',
          title: `R1 Machine Becoming Bottleneck: ${row.machine_name} — downtime trending up (${currDown}min vs ${prevDown}min)`,
          description: `Machine "${row.machine_name}" downtime is increasing.\nCurrent week: ${currDown}min | Previous week: ${prevDown}min\nPrediction: Machine becoming a production bottleneck.\nAction: Schedule preventive maintenance.`,
          logicType: 'predictive',
          dataSnapshot: { machineName: row.machine_name, currWeekDowntime: currDown, prevWeekDowntime: prevDown },
          relatedEntityType: 'machine_allocation',
          relatedEntityId: row.machine_code || row.machine_name,
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── R2: Production Plan Slippage Trend ──
      const r2Rows = await db.execute(sql`
        SELECT p.id, p.name, p.code,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = p.id
            AND wo.status NOT IN ('completed','cancelled')
            AND wo.planned_end_date < CURRENT_DATE)::int as overdue_count,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = p.id
            AND wo.status NOT IN ('completed','cancelled'))::int as open_count,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = p.id
            AND wo.status = 'completed'
            AND wo.actual_end_date > wo.planned_end_date)::int as late_completed
        FROM projects p
        WHERE p.status IN ('active', 'in_progress')
      `);
      queriesRun++;
      for (const proj of (r2Rows.rows || []) as any[]) {
        const overdueCount = Number(proj.overdue_count || 0);
        const openCount = Number(proj.open_count || 0);
        const lateCompleted = Number(proj.late_completed || 0);
        if (openCount === 0 || overdueCount === 0) continue;
        const slippagePct = Math.round((overdueCount / openCount) * 100);
        if (slippagePct < 50) continue;
        const severity = agentSev('R2');
        const fingerprint = fpProject('r2_slippage_trend', proj.id, 'project', proj.id);
        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'high',
          title: `R2 Production Slippage Trend: ${proj.name} — ${slippagePct}% of open WOs overdue`,
          description: `Project "${proj.name}" (${proj.code}) shows systematic production slippage.\nOverdue: ${overdueCount}/${openCount} open WOs (${slippagePct}%)\nLate completed WOs: ${lateCompleted}\nPrediction: Project timeline at serious risk.\nAction: Review production schedule and resource allocation.`,
          logicType: 'predictive',
          dataSnapshot: { projectId: proj.id, overdueCount, openCount, slippagePct, lateCompleted },
          relatedEntityType: 'project',
          relatedEntityId: String(proj.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const pm = await resolveProjectManager(proj.id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Slippage Trend: ${proj.name}`,
            actionType: 'create_task',
            description: `${slippagePct}% of open WOs overdue — systematic slippage.`,
            actionPayload: {
              title: `[Agent] Production Slippage Trend: ${proj.name} (${slippagePct}% overdue)`,
              description: `Project "${proj.name}" (${proj.code}) has systematic production slippage.\nOverdue: ${overdueCount}/${openCount} open WOs (${slippagePct}%)\nLate completed: ${lateCompleted}\nagent_severity: ${severity}\n\nAction Required: Conduct production schedule review meeting and reallocate resources.`,
              assignedTo: await resolveEscalation('L1', pm || PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.85,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R4: Operator Fatigue Risk (high hours + consecutive days) ──
      const r4Rows = await db.execute(sql`
        SELECT ar.user_id, u.username,
          COUNT(*)::int as consecutive_days,
          SUM(ar.working_hours)::numeric(8,1) as total_hours,
          AVG(ar.working_hours)::numeric(8,1) as avg_daily_hours
        FROM attendance_records ar
        JOIN users u ON ar.user_id = u.id
        WHERE u.department = 'Production' AND u.is_active = true
          AND ar.date >= CURRENT_DATE - 10
          AND ar.working_hours > 8
        GROUP BY ar.user_id, u.username
        HAVING COUNT(*) >= 5
        ORDER BY total_hours DESC
      `);
      queriesRun++;
      for (const row of (r4Rows.rows || []) as any[]) {
        const severity = agentSev('R4');
        const fingerprint = fp('r4_fatigue', 'user', row.user_id);
        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'medium',
          title: `R4 Operator Fatigue Risk: ${row.username} — ${row.consecutive_days} days, avg ${row.avg_daily_hours}h/day`,
          description: `Operator "${row.username}" has worked extended hours (>8h) for ${row.consecutive_days} days in 10 days.\nTotal: ${row.total_hours}h | Avg: ${row.avg_daily_hours}h/day\nPrediction: Fatigue-related quality and safety risks.\nAction: Review workload and enforce rest periods.`,
          logicType: 'predictive',
          dataSnapshot: { userId: row.user_id, consecutiveDays: row.consecutive_days, totalHours: row.total_hours, avgDailyHours: row.avg_daily_hours },
          relatedEntityType: 'user',
          relatedEntityId: String(row.user_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── R5: Early Rejection Trend (rejections increasing week-over-week) ──
      const r5Rows = await db.execute(sql`
        SELECT
          (SELECT SUM(pr.quantity_rejected) FROM production_records pr
            WHERE pr.date >= CURRENT_DATE - 14 AND pr.date < CURRENT_DATE - 7)::int as prev_week_rejects,
          (SELECT SUM(pr.quantity_rejected) FROM production_records pr
            WHERE pr.date >= CURRENT_DATE - 7)::int as curr_week_rejects
      `);
      queriesRun++;
      const prevRejects = Number((r5Rows.rows as any[])[0]?.prev_week_rejects || 0);
      const currRejects = Number((r5Rows.rows as any[])[0]?.curr_week_rejects || 0);
      if (prevRejects > 0 && currRejects > prevRejects * 1.3 && currRejects >= 5) {
        const severity = agentSev('R5');
        const increasePct = Math.round(((currRejects - prevRejects) / prevRejects) * 100);
        const fingerprint = fp('r5_rejection_trend', 'global', 'weekly');
        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'high',
          title: `R5 Early Rejection Trend: rejections up ${increasePct}% (${currRejects} vs ${prevRejects})`,
          description: `Production rejections are trending upward.\nCurrent week: ${currRejects} | Previous week: ${prevRejects} (${increasePct}% increase)\nPrediction: Quality issues building — expect higher scrap and rework.\nAction: Investigate quality control processes.`,
          logicType: 'predictive',
          dataSnapshot: { currRejects, prevRejects, increasePct },
          relatedEntityType: 'production',
          relatedEntityId: 'global',
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── R7: Production Throughput Drop ──
      const r7Rows = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.status = 'completed'
            AND wo.updated_at >= NOW() - INTERVAL '14 days'
            AND wo.updated_at < NOW() - INTERVAL '7 days')::int as prev_week_completed,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.status = 'completed'
            AND wo.updated_at >= NOW() - INTERVAL '7 days')::int as curr_week_completed,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.status NOT IN ('completed','cancelled'))::int as backlog
      `);
      queriesRun++;
      const prevCompleted = Number((r7Rows.rows as any[])[0]?.prev_week_completed || 0);
      const currCompleted = Number((r7Rows.rows as any[])[0]?.curr_week_completed || 0);
      const backlog = Number((r7Rows.rows as any[])[0]?.backlog || 0);
      if (prevCompleted >= 2 && currCompleted < prevCompleted * 0.7) {
        const dropPct = Math.round(((prevCompleted - currCompleted) / prevCompleted) * 100);
        const severity = agentSev('R7');
        const fingerprint = fp('r7_throughput_drop', 'global', 'weekly');
        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'high',
          title: `R7 Production Throughput Drop: ${dropPct}% decline (${currCompleted} vs ${prevCompleted} WOs/week)`,
          description: `Production throughput has declined ${dropPct}%.\nCurrent week: ${currCompleted} completed | Previous week: ${prevCompleted}\nBacklog: ${backlog} open WOs\nPrediction: Production capacity issue — schedule delays likely.\nAction: Investigate throughput decline and optimize workflow.`,
          logicType: 'predictive',
          dataSnapshot: { currCompleted, prevCompleted, dropPct, backlog },
          relatedEntityType: 'production',
          relatedEntityId: 'global',
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Production Throughput Drop: ${dropPct}%`,
            actionType: 'create_task',
            description: `Throughput declined ${dropPct}% with ${backlog} WOs in backlog.`,
            actionPayload: {
              title: `[Agent] Production Throughput Drop (${dropPct}% decline, ${backlog} WOs backlog)`,
              description: `Production throughput has declined significantly.\nCurrent: ${currCompleted}/week | Previous: ${prevCompleted}/week\nBacklog: ${backlog} open WOs\nagent_severity: ${severity}\n\nAction Required: Investigate root cause and optimize production workflow.`,
              assignedTo: await resolveEscalation('L1', PROD_MANAGER_ID),
              priority: priorityFromSeverity(severity),
              category: `Production ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(severity).toLowerCase(),
            confidence: 0.80,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── R10: End-of-Day Production Failure Risk (WOs approaching deadline with low progress) ──
      const r10Rows = await db.execute(sql`
        SELECT wo.id, wo.work_order_number, wo.title, wo.project_id, wo.supervisor_id,
          wo.planned_end_date, wo.quantity,
          p.name as project_name, u.username as supervisor_name,
          EXTRACT(DAY FROM wo.planned_end_date - NOW())::int as days_remaining,
          COALESCE((SELECT SUM(pr.quantity_produced) FROM production_records pr WHERE pr.work_order_id = wo.id), 0)::int as produced
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        LEFT JOIN users u ON wo.supervisor_id = u.id
        WHERE wo.status = 'in_progress'
          AND wo.planned_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
      `);
      queriesRun++;
      for (const wo of (r10Rows.rows || []) as any[]) {
        const produced = Number(wo.produced || 0);
        const planned = Number(wo.quantity || 1);
        const completionPct = Math.round((produced / planned) * 100);
        if (completionPct >= 80) continue;
        const severity = agentSev('R10');
        const fingerprint = fpProject('r10_end_day_risk', wo.project_id, 'wo', wo.id);
        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'medium',
          title: `R10 End-of-Day Production Failure Risk: ${wo.work_order_number} — ${completionPct}% complete, ${wo.days_remaining}d remaining`,
          description: `WO "${wo.work_order_number}" is approaching deadline with low completion.\nProduced: ${produced}/${planned} (${completionPct}%)\nDeadline: ${new Date(wo.planned_end_date).toISOString().split('T')[0]} (${wo.days_remaining}d remaining)\nSupervisor: ${wo.supervisor_name || 'N/A'}\nProject: ${wo.project_name}\nPrediction: WO will likely miss deadline.`,
          logicType: 'predictive',
          dataSnapshot: { woId: wo.id, produced, planned, completionPct, daysRemaining: wo.days_remaining },
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Generate Production Health Insight ──
      const healthRows = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM work_orders WHERE status NOT IN ('completed','cancelled'))::int as open_wos,
          (SELECT COUNT(*) FROM work_orders WHERE status NOT IN ('completed','cancelled') AND planned_end_date < CURRENT_DATE)::int as overdue_wos,
          (SELECT COUNT(*) FROM work_orders WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '7 days')::int as completed_this_week,
          (SELECT COUNT(*) FROM work_orders WHERE status = 'planned' AND planned_start_date < CURRENT_DATE)::int as not_started
      `);
      queriesRun++;
      const health = (healthRows.rows as any[])[0] || {};
      const openWOs = Number(health.open_wos || 0);
      const overdueWOs = Number(health.overdue_wos || 0);
      const completedWeek = Number(health.completed_this_week || 0);
      const notStarted = Number(health.not_started || 0);

      if (openWOs > 0) {
        const healthScore = Math.max(0, Math.min(100, 100 - (overdueWOs / openWOs) * 50 - (notStarted / openWOs) * 30));
        const insightResult = await insightManager.createInsight({
          insightType: 'production_health',
          severity: healthScore < 40 ? 'critical' : healthScore < 60 ? 'high' : healthScore < 80 ? 'medium' : 'low',
          title: `Production Health Score: ${Math.round(healthScore)}/100`,
          description: `Weekly production health summary.\nOpen WOs: ${openWOs} | Overdue: ${overdueWOs} (${Math.round(overdueWOs / openWOs * 100)}%)\nCompleted this week: ${completedWeek} | Not started: ${notStarted}\nHealth Score: ${Math.round(healthScore)}/100`,
          dataSnapshot: { openWOs, overdueWOs, completedWeek, notStarted, healthScore: Math.round(healthScore) },
          logicType: 'aggregate',
        });
        if (insightResult && !insightResult.isDuplicate) insightsCount++;
      }

    } catch (err: any) {
      console.error(`[ProductionAgent] Risk Intelligence error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // AUTO-EXECUTE APPROVED RECOMMENDATIONS
    // ════════════════════════════════════════════════════════════════════════════════
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
            ${payload.assignedTo || PROD_MANAGER_ID},
            1,
            ${payload.priority || 'Medium'},
            ${payload.category || 'Production'},
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
        console.error(`[ProductionAgent] Auto-execute error for rec ${recId}:`, err.message);
      }
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // AGENT RUN LOGGING
    // ════════════════════════════════════════════════════════════════════════════════
    const elapsed = Date.now() - startTime;
    const executionMetadata = {
      findings_detected: findingsCount,
      tasks_created: autoExecutedCount,
      tasks_closed: tasksClosed,
      recommendations_generated: recommendationsCount,
      insights_generated: insightsCount,
      execution_time_ms: elapsed,
      queries_run: queriesRun,
      groups: ['P1-P10 Planning', 'P11-P16 Material', 'P17-P26 Shop Floor', 'P27-P34 Efficiency', 'P35-P39 Workforce', 'P40-P45 Compliance', 'R1-R10 Risk Intelligence'],
    };

    try {
      await db.execute(sql`
        UPDATE agent_runs
        SET execution_metadata = ${JSON.stringify(executionMetadata)}::jsonb
        WHERE id = ${context.runId}
      `);
    } catch (err: any) {
      console.error(`[ProductionAgent] Failed to update execution_metadata:`, err.message);
    }

    console.log(`[ProductionAgent] Complete: ${findingsCount} findings, ${recommendationsCount} recommendations, ${autoExecutedCount} tasks created, ${tasksClosed} tasks closed, ${insightsCount} insights. ${queriesRun} queries in ${elapsed}ms`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      autoExecutedActions: autoExecutedCount,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Production Management Agent: ${findingsCount} findings detected, ${recommendationsCount} recommendations, ${autoExecutedCount} tasks created, ${tasksClosed} tasks auto-closed, ${insightsCount} insights. Groups: Planning (P1-P10), Material (P11-P16), Shop Floor (P17-P26), Efficiency (P27-P34), Workforce (P35-P39), Compliance (P40-P45), Risk Intelligence (R1-R10). Execution: ${elapsed}ms.`,
    };
  }
}
