import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  resolveProjectManager, resolveGM, resolveProductionManager,
  resolveReportingManager, hasOpenTask as hasOpenTaskShared,
} from './project-control-shared';

const SOURCE_AGENT = 'quality_controller';
const AGENT_KEY = 'quality_management';

type FindingCategory = 'compliance_risk' | 'operational_risk' | 'master_data_hygiene' | 'traceability_gap' | 'document_control_gap';

function fp(type: string, entity: string, id: string | number): string {
  return `[fp:qm_${type}:${entity}:${id}]`;
}

function fpProject(type: string, projectId: number | string, entity: string, id: string | number): string {
  return `[fp:qm_${type}:p${projectId}:${entity}:${id}]`;
}

async function hasOpenTask(fingerprint: string): Promise<boolean> {
  return hasOpenTaskShared(fingerprint, SOURCE_AGENT);
}

function priorityFromSeverity(sev: string): string {
  if (sev === 'critical') return 'Critical';
  if (sev === 'high') return 'High';
  if (sev === 'medium') return 'Medium';
  return 'Low';
}

async function resolveEscalation(
  level: 'L1' | 'L2' | 'L3' | 'L4',
  entityOwnerId: number | null,
  projectId: number | null,
): Promise<number> {
  if (level === 'L1' && entityOwnerId) return entityOwnerId;

  if (level === 'L2' || (level === 'L1' && !entityOwnerId)) {
    const prodMgr = await resolveProductionManager();
    if (prodMgr) return prodMgr;
  }

  if (level === 'L3') {
    if (projectId) {
      const pm = await resolveProjectManager(projectId);
      if (pm) return pm;
    }
    const prodMgr = await resolveProductionManager();
    if (prodMgr) return prodMgr;
  }

  return await resolveGM();
}

function escalationLevelFromSeverity(sev: string): 'L1' | 'L2' | 'L3' | 'L4' {
  if (sev === 'critical') return 'L3';
  if (sev === 'high') return 'L2';
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
    let resolved = false;

    const calMatch = cat.match(/\[fp:qm_q2_\w+:instrument:(\d+)\]/);
    if (calMatch) {
      const r = await db.execute(sql`
        SELECT 1 FROM calibration_instruments WHERE id = ${Number(calMatch[1])}
          AND next_calibration_date >= CURRENT_DATE LIMIT 1
      `);
      resolved = (r.rows || []).length > 0;
    }

    const welderMatch = cat.match(/\[fp:qm_q3_\w+:welder:(\d+)\]/);
    if (welderMatch) {
      const r = await db.execute(sql`
        SELECT 1 FROM welders WHERE id = ${Number(welderMatch[1])}
          AND "certificateExpiryDate" >= CURRENT_DATE LIMIT 1
      `);
      resolved = (r.rows || []).length > 0;
    }

    const pmaMatch = cat.match(/\[fp:qm_q4_pma_expired:pma:(\d+)\]/);
    if (pmaMatch) {
      const r = await db.execute(sql`
        SELECT 1 FROM pma_documents WHERE id = ${Number(pmaMatch[1])}
          AND (expiry_date >= CURRENT_DATE OR status = 'Inactive') LIMIT 1
      `);
      resolved = (r.rows || []).length > 0;
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

export class QualityManagementAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Quality Management Agent';
  category = 'quality';

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

    const gmId = await resolveGM();
    const tasksClosed = await autoCloseResolvedTasks();

    // ════════════════════════════════════════════════════════════════════════════════
    // Q1: INSPECTION CONTROL (Q1.01–Q1.10)
    // ════════════════════════════════════════════════════════════════════════════════
    try {
      // ── Q1.01: Project Inspection Backlog (grouped per project) ──
      const q101Rows = await db.execute(sql`
        SELECT p.id as project_id, p.name as project_name, p.code as project_code,
          COUNT(*)::int as pending_count,
          COUNT(CASE WHEN io.planned_date IS NULL THEN 1 END)::int as no_planned_date,
          MIN(io.created_at)::date as oldest_created,
          EXTRACT(DAY FROM NOW() - MIN(io.created_at))::int as oldest_age_days,
          STRING_AGG(DISTINCT io.inspection_type, ', ') as types
        FROM inspection_orders io
        JOIN projects p ON io.project_id = p.id
        WHERE io.status IN ('pending', 'in_progress')
        GROUP BY p.id, p.name, p.code
        HAVING COUNT(*) >= 5
        ORDER BY COUNT(*) DESC
      `);
      queriesRun++;
      for (const row of (q101Rows.rows || []) as any[]) {
        const pendingCount = Number(row.pending_count);
        const oldestAge = Number(row.oldest_age_days || 0);
        const sev = pendingCount >= 50 ? 'critical' : pendingCount >= 20 ? 'high' : 'medium';
        const category: FindingCategory = 'operational_risk';
        const fingerprint = fpProject('q1_backlog', row.project_id, 'project', row.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.01 Inspection Backlog: ${row.project_name} — ${pendingCount} pending inspections`,
          description: `Category: ${category}\nProject "${row.project_name}" (${row.project_code}) has ${pendingCount} pending inspections.\nWithout planned date: ${row.no_planned_date}\nOldest created: ${row.oldest_created} (${oldestAge} days ago)\nInspection types: ${row.types}\n\nAction Required: Review backlog, assign planned dates, and schedule inspections.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: row.project_id, pendingCount, noPlannedDate: row.no_planned_date, oldestAge, category },
          relatedEntityType: 'project',
          relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const level = escalationLevelFromSeverity(sev);
          const pm = await resolveProjectManager(row.project_id);
          const assignee = await resolveEscalation(level, null, row.project_id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Inspection Backlog: ${row.project_name} (${pendingCount} pending)`,
            actionType: 'create_task',
            description: `${pendingCount} pending inspections — oldest ${oldestAge}d ago. Project-summary task.`,
            actionPayload: {
              title: `[Agent] Inspection Backlog: ${row.project_name} — ${pendingCount} Pending Inspections`,
              description: `Project "${row.project_name}" (${row.project_code}) has accumulated ${pendingCount} pending inspections.\nWithout planned date: ${row.no_planned_date}\nOldest: ${row.oldest_created} (${oldestAge} days)\nTypes: ${row.types}\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required:\n1. Review all pending inspections for this project\n2. Assign planned dates and inspectors\n3. Prioritize based on production schedule`,
              assignedTo: assignee,
              priority: priorityFromSeverity(sev),
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(sev).toLowerCase() as any,
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q1.02: Inspections Missing Planned Date ──
      const q102Rows = await db.execute(sql`
        SELECT p.id as project_id, p.name as project_name,
          COUNT(*)::int as missing_date_count,
          STRING_AGG(io.inspection_order_number, ', ' ORDER BY io.id) as io_numbers
        FROM inspection_orders io
        JOIN projects p ON io.project_id = p.id
        WHERE io.status IN ('pending', 'in_progress') AND io.planned_date IS NULL
        GROUP BY p.id, p.name
        ORDER BY COUNT(*) DESC
      `);
      queriesRun++;
      for (const row of (q102Rows.rows || []) as any[]) {
        const count = Number(row.missing_date_count);
        const sev = count >= 20 ? 'high' : 'medium';
        const category: FindingCategory = 'operational_risk';
        const fingerprint = fpProject('q1_no_date', row.project_id, 'project', row.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.02 Inspections Without Planned Date: ${row.project_name} — ${count} inspections`,
          description: `Category: ${category}\n${count} inspections in project "${row.project_name}" have no planned date assigned.\nThis prevents scheduling and resource planning.\n\nAction Required: Assign planned dates to all pending inspections.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: row.project_id, count, category },
          relatedEntityType: 'project',
          relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q1.03: Final Inspection Pending Before Release (critical compliance) ──
      const q103Rows = await db.execute(sql`
        SELECT io.id, io.inspection_order_number, io.title, io.project_id, io.item_code,
          io.created_by, p.name as project_name, p.code as project_code,
          EXTRACT(DAY FROM NOW() - io.created_at)::int as age_days
        FROM inspection_orders io
        JOIN projects p ON io.project_id = p.id
        WHERE io.inspection_type = 'final' AND io.status IN ('pending', 'in_progress')
        ORDER BY io.created_at
      `);
      queriesRun++;
      for (const row of (q103Rows.rows || []) as any[]) {
        const sev = 'critical';
        const category: FindingCategory = 'compliance_risk';
        const fingerprint = fpProject('q1_final_pending', row.project_id, 'io', row.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.03 Final Inspection Pending: ${row.inspection_order_number} — ${row.age_days}d old`,
          description: `Category: ${category}\nFinal inspection "${row.inspection_order_number}" is still pending.\nProject: ${row.project_name} (${row.project_code})\nItem: ${row.item_code || 'N/A'}\nAge: ${row.age_days} days since created\n\nImpact: Cannot release product without final inspection approval.\nAction Required: Schedule and complete final inspection immediately.`,
          logicType: 'rule_based',
          dataSnapshot: { ioId: row.id, projectId: row.project_id, ageDays: row.age_days, createdBy: row.created_by, category },
          relatedEntityType: 'inspection_order',
          relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const entityOwner = row.created_by ? Number(row.created_by) : null;
          const assignee = await resolveEscalation('L1', entityOwner, row.project_id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Final Inspection Pending: ${row.inspection_order_number}`,
            actionType: 'create_task',
            description: `Final inspection blocking product release — ${row.age_days}d old.`,
            actionPayload: {
              title: `[Agent] Final Inspection Pending: ${row.inspection_order_number} (${row.project_name})`,
              description: `Final inspection "${row.inspection_order_number}" is pending and blocking product release.\nProject: ${row.project_name} (${row.project_code})\nItem: ${row.item_code || 'N/A'}\nAge: ${row.age_days} days\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required: Schedule and complete final inspection immediately to allow product release.`,
              assignedTo: assignee,
              priority: 'Critical',
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'critical',
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q1.04: Incoming Inspection Pending (materials waiting) ──
      const q104Rows = await db.execute(sql`
        SELECT p.id as project_id, p.name as project_name,
          COUNT(*)::int as pending_incoming,
          EXTRACT(DAY FROM NOW() - MIN(io.created_at))::int as oldest_age
        FROM inspection_orders io
        JOIN projects p ON io.project_id = p.id
        WHERE io.inspection_type = 'incoming' AND io.status = 'pending'
        GROUP BY p.id, p.name
      `);
      queriesRun++;
      for (const row of (q104Rows.rows || []) as any[]) {
        const sev = Number(row.oldest_age || 0) > 30 ? 'high' : 'medium';
        const category: FindingCategory = 'operational_risk';
        const fingerprint = fpProject('q1_incoming_pending', row.project_id, 'project', row.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.04 Incoming Inspection Pending: ${row.project_name} — ${row.pending_incoming} awaiting`,
          description: `Category: ${category}\n${row.pending_incoming} incoming inspections pending for "${row.project_name}".\nOldest: ${row.oldest_age} days\nImpact: Materials cannot be released for production until incoming inspection is completed.\n\nAction Required: Complete incoming material inspections.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: row.project_id, pendingCount: row.pending_incoming, oldestAge: row.oldest_age, category },
          relatedEntityType: 'project',
          relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q1.05: Inspection Without Item Linkage (traceability gap) ──
      const q105Rows = await db.execute(sql`
        SELECT p.id as project_id, p.name as project_name,
          COUNT(*)::int as unlinked_count
        FROM inspection_orders io
        JOIN projects p ON io.project_id = p.id
        WHERE io.item_id IS NULL AND io.status NOT IN ('cancelled')
        GROUP BY p.id, p.name
        HAVING COUNT(*) >= 3
      `);
      queriesRun++;
      for (const row of (q105Rows.rows || []) as any[]) {
        const sev = 'high';
        const category: FindingCategory = 'traceability_gap';
        const fingerprint = fpProject('q1_no_item', row.project_id, 'project', row.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.05 Inspection Without Item Linkage: ${row.project_name} — ${row.unlinked_count} inspections`,
          description: `Category: ${category}\n${row.unlinked_count} inspections in "${row.project_name}" are not linked to any project item.\nImpact: Breaks traceability chain — cannot trace inspection to specific equipment/component.\n\nAction Required: Link inspections to the correct project items.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: row.project_id, unlinkedCount: row.unlinked_count, category },
          relatedEntityType: 'project',
          relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q1.06: Inspection Completion Rate (project health insight) ──
      const q106Rows = await db.execute(sql`
        SELECT p.id as project_id, p.name as project_name,
          COUNT(*)::int as total,
          COUNT(CASE WHEN io.status = 'completed' THEN 1 END)::int as completed,
          ROUND(COUNT(CASE WHEN io.status = 'completed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as completion_pct
        FROM inspection_orders io
        JOIN projects p ON io.project_id = p.id
        WHERE p.status IN ('active', 'in_progress')
        GROUP BY p.id, p.name
        HAVING COUNT(*) >= 5
        ORDER BY completion_pct
      `);
      queriesRun++;
      for (const row of (q106Rows.rows || []) as any[]) {
        const pct = Number(row.completion_pct || 0);
        if (pct >= 80) continue;
        const sev = pct < 20 ? 'high' : 'medium';
        const category: FindingCategory = 'operational_risk';
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.06 Low Inspection Completion: ${row.project_name} — ${row.completion_pct}% (${row.completed}/${row.total})`,
          description: `Category: ${category}\nProject "${row.project_name}" has only ${row.completion_pct}% inspection completion rate.\nCompleted: ${row.completed} / ${row.total}\n\nInsight: Low completion rate may indicate scheduling or resource issues.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: row.project_id, total: row.total, completed: row.completed, completionPct: pct, category },
          relatedEntityType: 'project',
          relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q1.07: Stale Inspections (pending > 180 days) ──
      const q107Rows = await db.execute(sql`
        SELECT p.id as project_id, p.name as project_name,
          COUNT(*)::int as stale_count,
          MAX(EXTRACT(DAY FROM NOW() - io.created_at))::int as max_age
        FROM inspection_orders io
        JOIN projects p ON io.project_id = p.id
        WHERE io.status = 'pending'
          AND io.created_at < NOW() - INTERVAL '180 days'
        GROUP BY p.id, p.name
      `);
      queriesRun++;
      for (const row of (q107Rows.rows || []) as any[]) {
        const sev = 'high';
        const category: FindingCategory = 'operational_risk';
        const fingerprint = fpProject('q1_stale', row.project_id, 'project', row.project_id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.07 Stale Inspections: ${row.project_name} — ${row.stale_count} pending > 180 days`,
          description: `Category: ${category}\n${row.stale_count} inspections in "${row.project_name}" have been pending for over 180 days (oldest: ${row.max_age}d).\nImpact: Suggests systemic scheduling failure.\n\nAction Required: Review whether inspections are still needed or should be cancelled/rescheduled.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: row.project_id, staleCount: row.stale_count, maxAge: row.max_age, category },
          relatedEntityType: 'project',
          relatedEntityId: String(row.project_id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const assignee = await resolveEscalation('L2', null, row.project_id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Stale Inspections: ${row.project_name}`,
            actionType: 'create_task',
            description: `${row.stale_count} inspections pending > 180d — systemic issue.`,
            actionPayload: {
              title: `[Agent] Stale Inspections: ${row.project_name} — ${row.stale_count} Pending > 180 Days`,
              description: `${row.stale_count} inspections in "${row.project_name}" have been pending for over 180 days.\nOldest: ${row.max_age} days\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required: Review all stale inspections — cancel obsolete ones, reschedule active ones.`,
              assignedTo: assignee,
              priority: priorityFromSeverity(sev),
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(sev).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q1.08: Active Project Without Any Inspection Orders ──
      const q108Rows = await db.execute(sql`
        SELECT p.id, p.name, p.code, p.status
        FROM projects p
        WHERE p.status IN ('active', 'in_progress')
          AND NOT EXISTS (SELECT 1 FROM inspection_orders io WHERE io.project_id = p.id)
      `);
      queriesRun++;
      for (const proj of (q108Rows.rows || []) as any[]) {
        const sev = 'high';
        const category: FindingCategory = 'operational_risk';
        const fingerprint = fpProject('q1_no_inspections', proj.id, 'project', proj.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q1.08 No Inspection Orders: ${proj.name} (${proj.code})`,
          description: `Category: ${category}\nActive project "${proj.name}" has no inspection orders created.\nCode: ${proj.code} | Status: ${proj.status}\n\nImpact: No quality control in place for this project.\nAction Required: Create inspection plan based on project scope.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: proj.id, projectCode: proj.code, category },
          relatedEntityType: 'project',
          relatedEntityId: String(proj.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const pm = await resolveProjectManager(proj.id);
          const assignee = await resolveEscalation('L2', null, proj.id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] No Inspection Orders: ${proj.name}`,
            actionType: 'create_task',
            description: `Active project with zero inspection orders — no QC coverage.`,
            actionPayload: {
              title: `[Agent] No Inspection Orders: ${proj.name} (${proj.code})`,
              description: `Active project "${proj.name}" (${proj.code}) has no inspection orders.\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required: Create inspection plan covering incoming, in-process, and final inspections.`,
              assignedTo: assignee,
              priority: priorityFromSeverity(sev),
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(sev).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    } catch (err: any) {
      console.error(`[QualityAgent] Q1 Inspection Control error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // Q2: CALIBRATION CONTROL (Q2.01–Q2.08)
    // ════════════════════════════════════════════════════════════════════════════════
    try {
      // ── Q2.01: Instrument In Use With Expired Calibration (CRITICAL COMPLIANCE) ──
      const q201Rows = await db.execute(sql`
        SELECT id, instrument_id, instrument_name, instrument_type, location,
          calibration_status, next_calibration_date, certificate_number, serial_number,
          EXTRACT(DAY FROM NOW() - next_calibration_date::timestamp)::int as days_overdue
        FROM calibration_instruments
        WHERE in_use = 'In Use' AND next_calibration_date < CURRENT_DATE
        ORDER BY next_calibration_date
      `);
      queriesRun++;
      const inUseOverdue = (q201Rows.rows || []) as any[];

      for (const inst of inUseOverdue) {
        const daysOverdue = Number(inst.days_overdue || 0);
        const sev = 'critical';
        const category: FindingCategory = 'compliance_risk';
        const fingerprint = fp('q2_inuse_expired', 'instrument', inst.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q2.01 Instrument In Use With Expired Calibration: ${inst.instrument_id} — ${daysOverdue}d overdue`,
          description: `Category: ${category}\nINSTRUMENT IN ACTIVE USE WITH EXPIRED CALIBRATION.\nInstrument: ${inst.instrument_name} (${inst.instrument_id})\nType: ${inst.instrument_type}\nLocation: ${inst.location}\nSerial: ${inst.serial_number}\nCalibration Due: ${new Date(inst.next_calibration_date).toISOString().split('T')[0]}\nDays Overdue: ${daysOverdue}\nCertificate: ${inst.certificate_number || 'N/A'}\n\nRisk: All measurements taken with this instrument since calibration expiry may be invalid.\nAction Required: Remove from service immediately and send for recalibration.`,
          logicType: 'rule_based',
          dataSnapshot: { instrumentId: inst.id, code: inst.instrument_id, daysOverdue, inUse: true, category },
          relatedEntityType: 'calibration_instrument',
          relatedEntityId: String(inst.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const assignee = await resolveEscalation('L2', null, null);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] CRITICAL: Instrument In Use With Expired Calibration: ${inst.instrument_id}`,
            actionType: 'create_task',
            description: `Active instrument ${daysOverdue}d past calibration — compliance violation.`,
            actionPayload: {
              title: `[Agent] CRITICAL: ${inst.instrument_id} — In Use With Expired Calibration (${daysOverdue}d overdue)`,
              description: `COMPLIANCE RISK: Instrument "${inst.instrument_name}" (${inst.instrument_id}) is actively in use with expired calibration.\nType: ${inst.instrument_type} | Serial: ${inst.serial_number}\nLocation: ${inst.location}\nCalibration Due: ${new Date(inst.next_calibration_date).toISOString().split('T')[0]} (${daysOverdue}d overdue)\nCertificate: ${inst.certificate_number || 'N/A'}\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required:\n1. Remove instrument from service immediately\n2. Send for recalibration\n3. Review any measurements/inspections done since expiry`,
              assignedTo: assignee,
              priority: 'Critical',
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'critical',
            confidence: 0.98,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q2.02: Systemic Calibration Failure (escalation-summary if ≥3 in-use instruments overdue) ──
      if (inUseOverdue.length >= 3) {
        const sev = 'critical';
        const category: FindingCategory = 'compliance_risk';
        const fingerprint = fp('q2_systemic', 'global', 'calibration');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q2.02 Systemic Calibration Failure: ${inUseOverdue.length} instruments in use with expired calibration`,
          description: `Category: ${category}\nSYSTEMIC COMPLIANCE FAILURE: ${inUseOverdue.length} calibration instruments currently in active use have expired calibration.\nThis indicates a breakdown in the calibration management process.\n\nInstruments: ${inUseOverdue.map((i: any) => i.instrument_id).join(', ')}\n\nImpact: All quality measurements from these instruments may be compromised.\nAction Required: Halt use of all expired instruments, conduct calibration audit.`,
          logicType: 'rule_based',
          dataSnapshot: { count: inUseOverdue.length, instruments: inUseOverdue.map((i: any) => ({ id: i.id, code: i.instrument_id, daysOverdue: i.days_overdue })), category },
          relatedEntityType: 'calibration',
          relatedEntityId: 'systemic',
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const assignee = await resolveEscalation('L3', null, null);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] SYSTEMIC: ${inUseOverdue.length} Instruments In Use With Expired Calibration`,
            actionType: 'create_task',
            description: `Systemic calibration failure — ${inUseOverdue.length} active instruments overdue.`,
            actionPayload: {
              title: `[Agent] SYSTEMIC Calibration Failure: ${inUseOverdue.length} Active Instruments With Expired Calibration`,
              description: `SYSTEMIC COMPLIANCE FAILURE: ${inUseOverdue.length} calibration instruments in active use have expired calibration.\nInstruments: ${inUseOverdue.map((i: any) => `${i.instrument_id} (${i.days_overdue}d overdue)`).join(', ')}\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required:\n1. Conduct emergency calibration audit\n2. Remove all expired instruments from service\n3. Review and fix calibration tracking process\n4. Report to management on compliance gap`,
              assignedTo: assignee,
              priority: 'Critical',
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'critical',
            confidence: 0.98,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q2.03: Inactive Instrument Overdue Calibration (cleanup — lower severity) ──
      const q203Rows = await db.execute(sql`
        SELECT id, instrument_id, instrument_name, instrument_type, location,
          calibration_status, next_calibration_date,
          EXTRACT(DAY FROM NOW() - next_calibration_date::timestamp)::int as days_overdue
        FROM calibration_instruments
        WHERE in_use = 'Not in Use' AND next_calibration_date < CURRENT_DATE
        ORDER BY next_calibration_date
      `);
      queriesRun++;
      const inactiveOverdue = (q203Rows.rows || []) as any[];
      if (inactiveOverdue.length > 0) {
        const sev = 'medium';
        const category: FindingCategory = 'master_data_hygiene';
        const fingerprint = fp('q2_inactive_overdue', 'global', 'cleanup');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q2.03 Inactive Instruments Overdue: ${inactiveOverdue.length} out-of-service instruments need status update`,
          description: `Category: ${category}\n${inactiveOverdue.length} instruments marked "Not in Use" have overdue calibration.\nThese are NOT compliance risks but need master data cleanup.\nInstruments: ${inactiveOverdue.map((i: any) => `${i.instrument_id} (${i.days_overdue}d)`).join(', ')}\n\nAction Required: Update calibration status to reflect current state, or schedule recalibration if returning to service.`,
          logicType: 'rule_based',
          dataSnapshot: { count: inactiveOverdue.length, instruments: inactiveOverdue.map((i: any) => ({ id: i.id, code: i.instrument_id, daysOverdue: i.days_overdue })), category },
          relatedEntityType: 'calibration',
          relatedEntityId: 'inactive',
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q2.04: Calibration Due Soon (upcoming 30/60/90 day warning) ──
      const q204Rows = await db.execute(sql`
        SELECT id, instrument_id, instrument_name, instrument_type, location,
          next_calibration_date,
          EXTRACT(DAY FROM next_calibration_date::timestamp - NOW())::int as days_remaining
        FROM calibration_instruments
        WHERE in_use = 'In Use'
          AND next_calibration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
        ORDER BY next_calibration_date
      `);
      queriesRun++;
      for (const inst of (q204Rows.rows || []) as any[]) {
        const daysRemaining = Number(inst.days_remaining || 0);
        const sev = daysRemaining <= 30 ? 'high' : 'medium';
        const category: FindingCategory = 'operational_risk';
        const window = daysRemaining <= 30 ? '30-day' : daysRemaining <= 60 ? '60-day' : '90-day';
        const fingerprint = fp('q2_due_soon', 'instrument', inst.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q2.04 Calibration Due Soon: ${inst.instrument_id} — ${daysRemaining}d remaining (${window})`,
          description: `Category: ${category}\nInstrument "${inst.instrument_name}" (${inst.instrument_id}) calibration due in ${daysRemaining} days.\nType: ${inst.instrument_type} | Location: ${inst.location}\nDue Date: ${new Date(inst.next_calibration_date).toISOString().split('T')[0]}\n\nAction Required: Schedule calibration before due date to avoid compliance gap.`,
          logicType: 'rule_based',
          dataSnapshot: { instrumentId: inst.id, code: inst.instrument_id, daysRemaining, window, category },
          relatedEntityType: 'calibration_instrument',
          relatedEntityId: String(inst.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q2.05: Calibration Status Mismatch (status says "Calibrated" but date is past) ──
      const q205Rows = await db.execute(sql`
        SELECT id, instrument_id, instrument_name, calibration_status, in_use,
          next_calibration_date,
          EXTRACT(DAY FROM NOW() - next_calibration_date::timestamp)::int as days_overdue
        FROM calibration_instruments
        WHERE calibration_status = 'Calibrated' AND next_calibration_date < CURRENT_DATE
      `);
      queriesRun++;
      const statusMismatches = (q205Rows.rows || []) as any[];
      if (statusMismatches.length > 0) {
        const hasInUse = statusMismatches.some((i: any) => i.in_use === 'In Use');
        const sev = hasInUse ? 'high' : 'medium';
        const category: FindingCategory = 'master_data_hygiene';
        const fingerprint = fp('q2_status_mismatch', 'global', 'calibration');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q2.05 Calibration Status Mismatch: ${statusMismatches.length} instruments show "Calibrated" but are overdue`,
          description: `Category: ${category}\n${statusMismatches.length} instruments have status "Calibrated" but their next calibration date has passed.\n${hasInUse ? 'SOME ARE IN ACTIVE USE — data integrity risk.' : 'None currently in use — cleanup task.'}\n\nAction Required: Update calibration status to "Overdue" or "Out of Service" and schedule recalibration.`,
          logicType: 'rule_based',
          dataSnapshot: { count: statusMismatches.length, hasInUse, instruments: statusMismatches.map((i: any) => ({ id: i.id, code: i.instrument_id, inUse: i.in_use })), category },
          relatedEntityType: 'calibration',
          relatedEntityId: 'status_mismatch',
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[QualityAgent] Q2 Calibration Control error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // Q3: WELDING QUALIFICATION CONTROL (Q3.01–Q3.08)
    // ════════════════════════════════════════════════════════════════════════════════
    try {
      // ── Q3.01: Active Welder With Expired Certificate (CRITICAL COMPLIANCE) ──
      const q301Rows = await db.execute(sql`
        SELECT w.id, w."welderId", w.name, w.status, w."certificateExpiryDate",
          w."certificateNo", w."wpsNumber", w.trade,
          EXTRACT(DAY FROM NOW() - w."certificateExpiryDate"::timestamp)::int as days_expired
        FROM welders w
        WHERE w.status = 'Active' AND w."certificateExpiryDate" < CURRENT_DATE
        ORDER BY w."certificateExpiryDate"
      `);
      queriesRun++;
      for (const welder of (q301Rows.rows || []) as any[]) {
        const daysExpired = Number(welder.days_expired || 0);
        const sev = daysExpired > 365 ? 'critical' : 'high';
        const category: FindingCategory = daysExpired > 365 ? 'master_data_hygiene' : 'compliance_risk';
        const fingerprint = fp('q3_active_expired', 'welder', welder.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q3.01 Active Welder With Expired Certificate: ${welder.name} (${welder.welderId}) — ${daysExpired}d expired`,
          description: `Category: ${category}\nWelder "${welder.name}" (${welder.welderId}) is marked "Active" but certificate expired ${daysExpired} days ago.\nCertificate: ${welder.certificateNo}\nExpiry: ${new Date(welder.certificateExpiryDate).toISOString().split('T')[0]}\nWPS: ${welder.wpsNumber} | Trade: ${welder.trade}\n${daysExpired > 365 ? 'NOTE: Expired >1 year — likely a master data issue (status not updated).' : 'Risk: Welder may be performing welding without valid qualification.'}\n\nAction Required: ${daysExpired > 365 ? 'Update welder status to "Expired" or arrange recertification.' : 'Immediately stop welding activities until certificate is renewed.'}`,
          logicType: 'rule_based',
          dataSnapshot: { welderId: welder.id, welderCode: welder.welderId, daysExpired, certificateNo: welder.certificateNo, category },
          relatedEntityType: 'welder',
          relatedEntityId: String(welder.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const level = escalationLevelFromSeverity(sev);
          const assignee = await resolveEscalation(level, null, null);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Active Welder Expired Certificate: ${welder.name} (${welder.welderId})`,
            actionType: 'create_task',
            description: `Active welder with certificate expired ${daysExpired}d.`,
            actionPayload: {
              title: `[Agent] Active Welder Expired Certificate: ${welder.name} (${welder.welderId}) — ${daysExpired}d expired`,
              description: `Welder "${welder.name}" (${welder.welderId}) is marked Active with expired certificate.\nCertificate: ${welder.certificateNo}\nExpiry: ${new Date(welder.certificateExpiryDate).toISOString().split('T')[0]} (${daysExpired}d ago)\nWPS: ${welder.wpsNumber} | Trade: ${welder.trade}\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required: ${daysExpired > 365 ? 'Update status to Expired or arrange recertification test.' : 'Stop welding activities and arrange immediate recertification.'}`,
              assignedTo: assignee,
              priority: priorityFromSeverity(sev),
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(sev).toLowerCase(),
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q3.02: Welder Status Mismatch (status "Expired" but certificate is valid) ──
      const q302Rows = await db.execute(sql`
        SELECT w.id, w."welderId", w.name, w.status, w."certificateExpiryDate",
          EXTRACT(DAY FROM w."certificateExpiryDate"::timestamp - NOW())::int as days_remaining
        FROM welders w
        WHERE w.status = 'Expired' AND w."certificateExpiryDate" >= CURRENT_DATE
      `);
      queriesRun++;
      for (const welder of (q302Rows.rows || []) as any[]) {
        const sev = 'medium';
        const category: FindingCategory = 'master_data_hygiene';
        const fingerprint = fp('q3_status_mismatch', 'welder', welder.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q3.02 Welder Status Mismatch: ${welder.name} (${welder.welderId}) — marked "Expired" but certificate valid`,
          description: `Category: ${category}\nWelder "${welder.name}" (${welder.welderId}) is marked "Expired" but certificate is valid until ${new Date(welder.certificateExpiryDate).toISOString().split('T')[0]} (${welder.days_remaining}d remaining).\n\nAction Required: Update welder status to "Active".`,
          logicType: 'rule_based',
          dataSnapshot: { welderId: welder.id, welderCode: welder.welderId, daysRemaining: welder.days_remaining, category },
          relatedEntityType: 'welder',
          relatedEntityId: String(welder.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q3.03: Welder Certificate Expiring Soon (30/60/90 day warning) ──
      const q303Rows = await db.execute(sql`
        SELECT w.id, w."welderId", w.name, w.status, w."certificateExpiryDate", w."certificateNo",
          EXTRACT(DAY FROM w."certificateExpiryDate"::timestamp - NOW())::int as days_remaining
        FROM welders w
        WHERE w.status = 'Active'
          AND w."certificateExpiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
        ORDER BY w."certificateExpiryDate"
      `);
      queriesRun++;
      for (const welder of (q303Rows.rows || []) as any[]) {
        const daysRemaining = Number(welder.days_remaining || 0);
        const sev = daysRemaining <= 30 ? 'high' : 'medium';
        const category: FindingCategory = 'operational_risk';
        const fingerprint = fp('q3_expiring_soon', 'welder', welder.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q3.03 Welder Certificate Expiring: ${welder.name} (${welder.welderId}) — ${daysRemaining}d remaining`,
          description: `Category: ${category}\nWelder "${welder.name}" (${welder.welderId}) certificate expires in ${daysRemaining} days.\nCertificate: ${welder.certificateNo}\nExpiry: ${new Date(welder.certificateExpiryDate).toISOString().split('T')[0]}\n\nAction Required: Schedule recertification test before expiry.`,
          logicType: 'rule_based',
          dataSnapshot: { welderId: welder.id, welderCode: welder.welderId, daysRemaining, category },
          relatedEntityType: 'welder',
          relatedEntityId: String(welder.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q3.04: Welder Without WPQR Coverage ──
      const q304Rows = await db.execute(sql`
        SELECT w.id, w."welderId", w.name, w.status, w."wpsNumber"
        FROM welders w
        WHERE w.status = 'Active'
          AND NOT EXISTS (
            SELECT 1 FROM wpqr_welders ww WHERE ww.welder_id = w.id
          )
      `);
      queriesRun++;
      for (const welder of (q304Rows.rows || []) as any[]) {
        const sev = 'high';
        const category: FindingCategory = 'compliance_risk';
        const fingerprint = fp('q3_no_wpqr', 'welder', welder.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q3.04 Welder Without WPQR Coverage: ${welder.name} (${welder.welderId})`,
          description: `Category: ${category}\nActive welder "${welder.name}" (${welder.welderId}) has no WPQR document linked.\nWPS Reference: ${welder.wpsNumber}\n\nRisk: Cannot verify welder's qualification against approved welding procedure.\nAction Required: Link welder to appropriate WPQR document(s).`,
          logicType: 'rule_based',
          dataSnapshot: { welderId: welder.id, welderCode: welder.welderId, wpsNumber: welder.wpsNumber, category },
          relatedEntityType: 'welder',
          relatedEntityId: String(welder.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q3.05: WPQR Without Any Linked Welders ──
      const q305Rows = await db.execute(sql`
        SELECT wpqr.id, wpqr.document_id, wpqr.title, wpqr.status, wpqr.welder_process, wpqr.base_metal_grade
        FROM wpqr_documents wpqr
        WHERE wpqr.status = 'Active'
          AND NOT EXISTS (SELECT 1 FROM wpqr_welders ww WHERE ww.wpqr_document_id = wpqr.id)
      `);
      queriesRun++;
      for (const wpqr of (q305Rows.rows || []) as any[]) {
        const sev = 'medium';
        const category: FindingCategory = 'document_control_gap';
        const fingerprint = fp('q3_wpqr_no_welder', 'wpqr', wpqr.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q3.05 WPQR Without Linked Welders: ${wpqr.document_id}`,
          description: `Category: ${category}\nWPQR "${wpqr.document_id}" (${wpqr.title}) has no welders linked.\nProcess: ${wpqr.welder_process} | Base Metal: ${wpqr.base_metal_grade}\n\nAction Required: Link qualified welders to this WPQR.`,
          logicType: 'rule_based',
          dataSnapshot: { wpqrId: wpqr.id, documentId: wpqr.document_id, category },
          relatedEntityType: 'wpqr_document',
          relatedEntityId: String(wpqr.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q3.06: Revoked Welder Certificates (cleanup audit) ──
      const q306Rows = await db.execute(sql`
        SELECT wc.welder_id,
          (SELECT w.name FROM welders w WHERE w.id = wc.welder_id) as welder_name,
          (SELECT w."welderId" FROM welders w WHERE w.id = wc.welder_id) as welder_code,
          COUNT(*)::int as revoked_count
        FROM welder_certificates wc
        WHERE wc.status = 'Revoked'
        GROUP BY wc.welder_id
        HAVING COUNT(*) >= 2
      `);
      queriesRun++;
      for (const row of (q306Rows.rows || []) as any[]) {
        const sev = 'low';
        const category: FindingCategory = 'master_data_hygiene';
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q3.06 Multiple Revoked Certificates: ${row.welder_name} (${row.welder_code}) — ${row.revoked_count} revoked`,
          description: `Category: ${category}\nWelder "${row.welder_name}" has ${row.revoked_count} revoked certificates.\nThis is a data cleanup item — review and archive revoked records.`,
          logicType: 'rule_based',
          dataSnapshot: { welderId: row.welder_id, revokedCount: row.revoked_count, category },
          relatedEntityType: 'welder',
          relatedEntityId: String(row.welder_id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q3.07: Dummy/Placeholder WPQR Documents ──
      const q307Rows = await db.execute(sql`
        SELECT id, document_id, title FROM wpqr_documents
        WHERE LOWER(title) LIKE '%dummy%' OR LOWER(title) LIKE '%placeholder%'
          OR LOWER(title) LIKE '%not with us%' OR LOWER(title) LIKE '%test%system%'
      `);
      queriesRun++;
      for (const wpqr of (q307Rows.rows || []) as any[]) {
        const sev = 'low';
        const category: FindingCategory = 'master_data_hygiene';
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q3.07 Dummy WPQR Document: ${wpqr.document_id} — "${wpqr.title}"`,
          description: `Category: ${category}\nWPQR "${wpqr.document_id}" appears to be a dummy/placeholder record.\nTitle: "${wpqr.title}"\n\nAction Required: Replace with actual WPQR or mark as inactive.`,
          logicType: 'rule_based',
          dataSnapshot: { wpqrId: wpqr.id, documentId: wpqr.document_id, title: wpqr.title, category },
          relatedEntityType: 'wpqr_document',
          relatedEntityId: String(wpqr.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[QualityAgent] Q3 Welding Qualification Control error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // Q4: DOCUMENT & PROCEDURE CONTROL (Q4.01–Q4.08)
    // ════════════════════════════════════════════════════════════════════════════════
    try {
      // ── Q4.01: Expired PMA Still Active (CRITICAL COMPLIANCE) ──
      const q401Rows = await db.execute(sql`
        SELECT id, pma_number, specification, grade, status, expiry_date, certified_by,
          EXTRACT(DAY FROM NOW() - expiry_date::timestamp)::int as days_expired
        FROM pma_documents
        WHERE status = 'Active' AND expiry_date < CURRENT_DATE
        ORDER BY expiry_date
      `);
      queriesRun++;
      for (const pma of (q401Rows.rows || []) as any[]) {
        const daysExpired = Number(pma.days_expired || 0);
        const sev = 'critical';
        const category: FindingCategory = 'compliance_risk';
        const fingerprint = fp('q4_pma_expired', 'pma', pma.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q4.01 Expired PMA Still Active: ${pma.pma_number} — ${daysExpired}d expired`,
          description: `Category: ${category}\nPMA "${pma.pma_number}" is marked "Active" but expired ${daysExpired} days ago.\nSpecification: ${pma.specification} | Grade: ${pma.grade}\nExpiry: ${new Date(pma.expiry_date).toISOString().split('T')[0]}\nCertified By: ${pma.certified_by}\n\nRisk: Materials approved under this PMA may no longer be valid.\nAction Required: Renew PMA or mark as Inactive and verify affected materials.`,
          logicType: 'rule_based',
          dataSnapshot: { pmaId: pma.id, pmaNumber: pma.pma_number, daysExpired, specification: pma.specification, grade: pma.grade, category },
          relatedEntityType: 'pma_document',
          relatedEntityId: String(pma.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const assignee = await resolveEscalation('L2', null, null);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Expired PMA Still Active: ${pma.pma_number}`,
            actionType: 'create_task',
            description: `PMA expired ${daysExpired}d ago but still marked Active.`,
            actionPayload: {
              title: `[Agent] Expired PMA Still Active: ${pma.pma_number} (${daysExpired}d expired)`,
              description: `PMA "${pma.pma_number}" is expired but still marked Active.\nSpecification: ${pma.specification} | Grade: ${pma.grade}\nExpiry: ${new Date(pma.expiry_date).toISOString().split('T')[0]} (${daysExpired}d ago)\nCertified By: ${pma.certified_by}\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required:\n1. Renew PMA with certification authority, OR\n2. Mark as Inactive\n3. Review all materials approved under this PMA`,
              assignedTo: assignee,
              priority: 'Critical',
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'critical',
            confidence: 0.95,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q4.02: PMA Expiring Soon (30/60/90 day warning) ──
      const q402Rows = await db.execute(sql`
        SELECT id, pma_number, specification, grade, expiry_date, certified_by,
          EXTRACT(DAY FROM expiry_date::timestamp - NOW())::int as days_remaining
        FROM pma_documents
        WHERE status = 'Active'
          AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
        ORDER BY expiry_date
      `);
      queriesRun++;
      for (const pma of (q402Rows.rows || []) as any[]) {
        const daysRemaining = Number(pma.days_remaining || 0);
        const sev = daysRemaining <= 30 ? 'high' : 'medium';
        const category: FindingCategory = 'operational_risk';
        const fingerprint = fp('q4_pma_expiring', 'pma', pma.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q4.02 PMA Expiring Soon: ${pma.pma_number} — ${daysRemaining}d remaining`,
          description: `Category: ${category}\nPMA "${pma.pma_number}" expires in ${daysRemaining} days.\nSpecification: ${pma.specification} | Grade: ${pma.grade}\nExpiry: ${new Date(pma.expiry_date).toISOString().split('T')[0]}\n\nAction Required: Initiate PMA renewal with ${pma.certified_by}.`,
          logicType: 'rule_based',
          dataSnapshot: { pmaId: pma.id, pmaNumber: pma.pma_number, daysRemaining, category },
          relatedEntityType: 'pma_document',
          relatedEntityId: String(pma.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q4.03: Missing NDT Test Procedure (NDT method used in inspections but no procedure) ──
      const q403Rows = await db.execute(sql`
        WITH used_methods AS (
          SELECT DISTINCT
            CASE
              WHEN io.ndt_data IS NOT NULL AND io.ndt_data != '' AND io.ndt_data != 'null' THEN 'NDT'
              WHEN io.visual_data IS NOT NULL AND io.visual_data != '' AND io.visual_data != 'null' THEN 'VT'
              WHEN io.weld_data IS NOT NULL AND io.weld_data != '' AND io.weld_data != 'null' THEN 'WELD'
              WHEN io.hydrotest_data IS NOT NULL AND io.hydrotest_data != '' AND io.hydrotest_data != 'null' THEN 'HT'
            END as method_used
          FROM inspection_orders io
          WHERE io.status NOT IN ('cancelled')
        )
        SELECT DISTINCT method_used FROM used_methods
        WHERE method_used IS NOT NULL
          AND method_used NOT IN (SELECT DISTINCT ndt_method FROM test_procedures WHERE status = 'Approved')
      `);
      queriesRun++;
      for (const row of (q403Rows.rows || []) as any[]) {
        const sev = 'high';
        const category: FindingCategory = 'document_control_gap';
        const fingerprint = fp('q4_missing_procedure', 'method', row.method_used);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q4.03 Missing Test Procedure: ${row.method_used} — used in inspections but no approved procedure`,
          description: `Category: ${category}\nNDT method "${row.method_used}" is referenced in inspection data but no approved test procedure exists for this method.\nApproved methods: ${(await db.execute(sql`SELECT DISTINCT ndt_method FROM test_procedures WHERE status = 'Approved'`)).rows?.map((r: any) => r.ndt_method).join(', ') || 'N/A'}\n\nRisk: Inspections performed without documented procedures may not meet code requirements.\nAction Required: Create and approve test procedure for ${row.method_used}.`,
          logicType: 'rule_based',
          dataSnapshot: { method: row.method_used, category },
          relatedEntityType: 'test_procedure',
          relatedEntityId: row.method_used,
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q4.04: Test Procedure Not Approved (draft procedures) ──
      const q404Rows = await db.execute(sql`
        SELECT id, procedure_number, procedure_name, ndt_method, status, approval_level
        FROM test_procedures
        WHERE status IN ('Draft', 'draft', 'Pending', 'pending')
      `);
      queriesRun++;
      for (const tp of (q404Rows.rows || []) as any[]) {
        const sev = 'high';
        const category: FindingCategory = 'document_control_gap';
        const fingerprint = fp('q4_tp_not_approved', 'tp', tp.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q4.04 Test Procedure Not Approved: ${tp.procedure_number} — ${tp.procedure_name}`,
          description: `Category: ${category}\nTest procedure "${tp.procedure_number}" (${tp.procedure_name}) is in "${tp.status}" status.\nMethod: ${tp.ndt_method}\n\nRisk: Cannot perform inspections with unapproved procedures.\nAction Required: Complete review and approve procedure.`,
          logicType: 'rule_based',
          dataSnapshot: { tpId: tp.id, procedureNumber: tp.procedure_number, method: tp.ndt_method, status: tp.status, category },
          relatedEntityType: 'test_procedure',
          relatedEntityId: String(tp.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }

      // ── Q4.05: Active Project Without QAP ──
      const q405Rows = await db.execute(sql`
        SELECT p.id, p.name, p.code, p.status
        FROM projects p
        WHERE p.status IN ('active', 'in_progress')
          AND NOT EXISTS (SELECT 1 FROM generated_qaps gq WHERE gq.project_id = p.id)
      `);
      queriesRun++;
      for (const proj of (q405Rows.rows || []) as any[]) {
        const sev = 'high';
        const category: FindingCategory = 'document_control_gap';
        const fingerprint = fpProject('q4_no_qap', proj.id, 'project', proj.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q4.05 Active Project Without QAP: ${proj.name} (${proj.code})`,
          description: `Category: ${category}\nActive project "${proj.name}" (${proj.code}) has no Quality Assurance Plan.\n\nRisk: No formal quality plan defined — inspections may be ad-hoc.\nAction Required: Generate QAP from template and get approval.`,
          logicType: 'rule_based',
          dataSnapshot: { projectId: proj.id, projectCode: proj.code, category },
          relatedEntityType: 'project',
          relatedEntityId: String(proj.id),
        });
        if (!finding.isDuplicate) findingsCount++;
        if (!await hasOpenTask(fingerprint)) {
          const pm = await resolveProjectManager(proj.id);
          const assignee = await resolveEscalation('L2', pm, proj.id);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Active Project Without QAP: ${proj.name}`,
            actionType: 'create_task',
            description: `Active project with no Quality Assurance Plan.`,
            actionPayload: {
              title: `[Agent] Active Project Without QAP: ${proj.name} (${proj.code})`,
              description: `Active project "${proj.name}" (${proj.code}) has no Quality Assurance Plan generated.\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required:\n1. Select appropriate QAP template\n2. Generate QAP for this project\n3. Get QAP reviewed and approved`,
              assignedTo: assignee,
              priority: priorityFromSeverity(sev),
              category: `Quality ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: priorityFromSeverity(sev).toLowerCase(),
            confidence: 0.90,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── Q4.06: QAP Not Approved (draft QAPs) ──
      const q406Rows = await db.execute(sql`
        SELECT gq.id, gq.title, gq.status, gq.project_id, gq.prepared_by,
          p.name as project_name, p.code as project_code,
          u.username as prepared_by_name
        FROM generated_qaps gq
        JOIN projects p ON gq.project_id = p.id
        LEFT JOIN users u ON gq.prepared_by = u.id
        WHERE gq.status IN ('draft', 'pending_review')
      `);
      queriesRun++;
      for (const qap of (q406Rows.rows || []) as any[]) {
        const sev = 'medium';
        const category: FindingCategory = 'document_control_gap';
        const fingerprint = fpProject('q4_qap_draft', qap.project_id, 'qap', qap.id);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q4.06 QAP Not Approved: ${qap.title} — ${qap.project_name}`,
          description: `Category: ${category}\nQAP "${qap.title}" for project "${qap.project_name}" (${qap.project_code}) is in "${qap.status}" status.\nPrepared by: ${qap.prepared_by_name || 'N/A'}\n\nAction Required: Complete review and approve QAP.`,
          logicType: 'rule_based',
          dataSnapshot: { qapId: qap.id, projectId: qap.project_id, status: qap.status, preparedBy: qap.prepared_by, category },
          relatedEntityType: 'generated_qap',
          relatedEntityId: String(qap.id),
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[QualityAgent] Q4 Document/Procedure Control error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // Q5: MATERIAL TRACEABILITY CONTROL (Q5.01–Q5.06)
    // ════════════════════════════════════════════════════════════════════════════════
    try {
      // ── Q5.01: Material Without Supporting Documents (MTC missing) ──
      const q501Rows = await db.execute(sql`
        SELECT mi.id, mi.material_identification_id, mi.project_id, mi.material_description,
          mi.material_code, mi.heat_number, mi.mill_name, mi.material_status,
          p.name as project_name, p.code as project_code
        FROM material_identification mi
        JOIN projects p ON mi.project_id = p.id
        WHERE NOT EXISTS (
          SELECT 1 FROM material_identification_documents mid
          WHERE mid.material_identification_id = mi.id
        )
        ORDER BY mi.created_at DESC
      `);
      queriesRun++;
      const materialsNoDocs = (q501Rows.rows || []) as any[];
      if (materialsNoDocs.length > 0) {
        const projectGroups: Record<string, any[]> = {};
        for (const m of materialsNoDocs) {
          const key = `${m.project_id}`;
          if (!projectGroups[key]) projectGroups[key] = [];
          projectGroups[key].push(m);
        }

        for (const [projectId, materials] of Object.entries(projectGroups)) {
          const first = materials[0];
          const sev = materials.length >= 3 ? 'critical' : 'high';
          const category: FindingCategory = 'traceability_gap';
          const fingerprint = fpProject('q5_no_docs', projectId, 'project', projectId);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: sev,
            title: `Q5.01 Materials Without Documents: ${first.project_name} — ${materials.length} materials missing MTC/docs`,
            description: `Category: ${category}\n${materials.length} materials in project "${first.project_name}" (${first.project_code}) have no supporting documents (MTC, test certificates, etc.).\nMaterials: ${materials.map((m: any) => `${m.material_identification_id} (${m.material_code})`).join(', ')}\n\nRisk: Traceability break — cannot verify material origin and quality.\nAction Required: Upload Mill Test Certificates and supporting documents.`,
            logicType: 'rule_based',
            dataSnapshot: { projectId: Number(projectId), count: materials.length, materialIds: materials.map((m: any) => m.id), category },
            relatedEntityType: 'project',
            relatedEntityId: projectId,
          });
          if (!finding.isDuplicate) findingsCount++;
          if (!await hasOpenTask(fingerprint)) {
            const entityOwner = first.created_by ? Number(first.created_by) : null;
            const assignee = await resolveEscalation(escalationLevelFromSeverity(sev), entityOwner, Number(projectId));
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Materials Without Documents: ${first.project_name}`,
              actionType: 'create_task',
              description: `${materials.length} materials missing supporting documents — traceability gap.`,
              actionPayload: {
                title: `[Agent] Materials Without Documents: ${first.project_name} — ${materials.length} Missing MTC`,
                description: `${materials.length} materials in "${first.project_name}" (${first.project_code}) have no supporting documents.\nMaterials: ${materials.map((m: any) => `${m.material_identification_id} (${m.material_code} / Heat: ${m.heat_number})`).join('\n')}\nagent_severity: ${sev}\nfinding_category: ${category}\n\nAction Required: Upload Mill Test Certificates and supporting documents for all listed materials.`,
                assignedTo: assignee,
                priority: priorityFromSeverity(sev),
                category: `Quality ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: priorityFromSeverity(sev).toLowerCase(),
              confidence: 0.95,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── Q5.02: Material Without Inspection Link ──
      const q502Rows = await db.execute(sql`
        SELECT mi.id, mi.material_identification_id, mi.project_id,
          mi.material_code, mi.heat_number,
          p.name as project_name
        FROM material_identification mi
        JOIN projects p ON mi.project_id = p.id
        WHERE NOT EXISTS (
          SELECT 1 FROM material_inspection_links mil WHERE mil.material_id = mi.id
        )
        AND p.status IN ('active', 'in_progress')
      `);
      queriesRun++;
      const materialsNoInspLink = (q502Rows.rows || []) as any[];
      if (materialsNoInspLink.length >= 3) {
        const projectGroups: Record<string, any[]> = {};
        for (const m of materialsNoInspLink) {
          const key = `${m.project_id}`;
          if (!projectGroups[key]) projectGroups[key] = [];
          projectGroups[key].push(m);
        }

        for (const [projectId, materials] of Object.entries(projectGroups)) {
          if (materials.length < 3) continue;
          const first = materials[0];
          const sev = 'high';
          const category: FindingCategory = 'traceability_gap';
          const fingerprint = fpProject('q5_no_insp_link', projectId, 'project', projectId);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly',
            severity: sev,
            title: `Q5.02 Materials Without Inspection Link: ${first.project_name} — ${materials.length} materials`,
            description: `Category: ${category}\n${materials.length} materials in "${first.project_name}" are not linked to any inspection order.\n\nRisk: Cannot trace which inspections verified these materials.\nAction Required: Link materials to their corresponding inspection orders.`,
            logicType: 'rule_based',
            dataSnapshot: { projectId: Number(projectId), count: materials.length, category },
            relatedEntityType: 'project',
            relatedEntityId: projectId,
          });
          if (!finding.isDuplicate) findingsCount++;
        }
      }

      // ── Q5.03: Material Traceability Completeness (heat number, MTC, mill verification) ──
      const q503Rows = await db.execute(sql`
        SELECT mi.id, mi.material_identification_id, mi.project_id, mi.material_code,
          mi.heat_number, mi.mill_test_certificate_number, mi.mill_name,
          p.name as project_name
        FROM material_identification mi
        JOIN projects p ON mi.project_id = p.id
        WHERE p.status IN ('active', 'in_progress')
          AND (mi.heat_number IS NULL OR mi.heat_number = ''
            OR mi.mill_test_certificate_number IS NULL OR mi.mill_test_certificate_number = ''
            OR mi.mill_name IS NULL OR mi.mill_name = '')
      `);
      queriesRun++;
      if ((q503Rows.rows || []).length > 0) {
        const count = (q503Rows.rows || []).length;
        const sev = count >= 5 ? 'critical' : 'high';
        const category: FindingCategory = 'traceability_gap';
        const fingerprint = fp('q5_incomplete_trace', 'global', 'material');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: sev,
          title: `Q5.03 Incomplete Material Traceability: ${count} materials missing heat/MTC/mill data`,
          description: `Category: ${category}\n${count} materials in active projects have incomplete traceability data (missing heat number, MTC number, or mill name).\n\nRisk: Cannot fully trace material origin — code compliance risk.\nAction Required: Complete material traceability data.`,
          logicType: 'rule_based',
          dataSnapshot: { count, category },
          relatedEntityType: 'material_identification',
          relatedEntityId: 'global',
        });
        if (!finding.isDuplicate) findingsCount++;
      }
    } catch (err: any) {
      console.error(`[QualityAgent] Q5 Material Traceability Control error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // QUALITY HEALTH INSIGHT
    // ════════════════════════════════════════════════════════════════════════════════
    try {
      const healthRows = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM inspection_orders WHERE status IN ('pending', 'in_progress'))::int as pending_inspections,
          (SELECT COUNT(*) FROM inspection_orders WHERE status = 'completed')::int as completed_inspections,
          (SELECT COUNT(*) FROM calibration_instruments WHERE in_use = 'In Use' AND next_calibration_date < CURRENT_DATE)::int as overdue_in_use_instruments,
          (SELECT COUNT(*) FROM calibration_instruments WHERE in_use = 'In Use')::int as total_in_use_instruments,
          (SELECT COUNT(*) FROM welders WHERE status = 'Active' AND "certificateExpiryDate" < CURRENT_DATE)::int as expired_active_welders,
          (SELECT COUNT(*) FROM welders WHERE status = 'Active')::int as total_active_welders,
          (SELECT COUNT(*) FROM pma_documents WHERE status = 'Active' AND expiry_date < CURRENT_DATE)::int as expired_active_pmas,
          (SELECT COUNT(*) FROM pma_documents WHERE status = 'Active')::int as total_active_pmas
      `);
      queriesRun++;
      const h = (healthRows.rows as any[])[0] || {};
      const pendingInsp = Number(h.pending_inspections || 0);
      const completedInsp = Number(h.completed_inspections || 0);
      const totalInsp = pendingInsp + completedInsp;
      const overdueInstr = Number(h.overdue_in_use_instruments || 0);
      const totalInstr = Number(h.total_in_use_instruments || 0);
      const expiredWelders = Number(h.expired_active_welders || 0);
      const totalWelders = Number(h.total_active_welders || 0);
      const expiredPMAs = Number(h.expired_active_pmas || 0);
      const totalPMAs = Number(h.total_active_pmas || 0);

      const inspScore = totalInsp > 0 ? (completedInsp / totalInsp) * 100 : 100;
      const calScore = totalInstr > 0 ? ((totalInstr - overdueInstr) / totalInstr) * 100 : 100;
      const welderScore = totalWelders > 0 ? ((totalWelders - expiredWelders) / totalWelders) * 100 : 100;
      const pmaScore = totalPMAs > 0 ? ((totalPMAs - expiredPMAs) / totalPMAs) * 100 : 100;
      const overallScore = Math.round((inspScore * 0.3 + calScore * 0.3 + welderScore * 0.2 + pmaScore * 0.2));

      const insightResult = await insightManager.createInsight({
        findingIds: [],
        insightType: 'quality_health',
        title: `Quality Health Score: ${overallScore}/100`,
        content: `Weekly quality management health summary.\nInspection Completion: ${Math.round(inspScore)}% (${completedInsp}/${totalInsp})\nCalibration Compliance: ${Math.round(calScore)}% (${overdueInstr} overdue of ${totalInstr} in use)\nWelder Qualification: ${Math.round(welderScore)}% (${expiredWelders} expired of ${totalWelders} active)\nPMA Validity: ${Math.round(pmaScore)}% (${expiredPMAs} expired of ${totalPMAs} active)\n\nOverall Quality Health: ${overallScore}/100`,
        dataSources: ['calibration_instruments', 'welders', 'pma_documents', 'inspection_orders'],
        logicType: 'rule_based',
        scopePeriod: 'daily',
      });
      if (insightResult && !insightResult.isDuplicate) insightsCount++;
    } catch (err: any) {
      console.error(`[QualityAgent] Health Insight error:`, err.message);
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
            ${payload.assignedTo || 1},
            1,
            ${payload.priority || 'Medium'},
            ${payload.category || 'Quality'},
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
        console.error(`[QualityAgent] Auto-execute error for rec ${recId}:`, err.message);
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
      groups: ['Q1 Inspection Control', 'Q2 Calibration Control', 'Q3 Welding Qualification Control', 'Q4 Document/Procedure Control', 'Q5 Material Traceability Control'],
    };

    try {
      await db.execute(sql`
        UPDATE agent_runs
        SET execution_metadata = ${JSON.stringify(executionMetadata)}::jsonb
        WHERE id = ${context.runId}
      `);
    } catch (err: any) {
      console.error(`[QualityAgent] Failed to update execution_metadata:`, err.message);
    }

    console.log(`[QualityAgent] Complete: ${findingsCount} findings, ${recommendationsCount} recommendations, ${autoExecutedCount} tasks created, ${tasksClosed} tasks closed, ${insightsCount} insights. ${queriesRun} queries in ${elapsed}ms`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      autoExecutedActions: autoExecutedCount,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Quality Management Agent: ${findingsCount} findings, ${recommendationsCount} recommendations, ${autoExecutedCount} tasks created, ${tasksClosed} auto-closed, ${insightsCount} insights. Groups: Q1 Inspection Control, Q2 Calibration Control, Q3 Welding Qualification Control, Q4 Document/Procedure Control, Q5 Material Traceability Control. Execution: ${elapsed}ms.`,
    };
  }
}
