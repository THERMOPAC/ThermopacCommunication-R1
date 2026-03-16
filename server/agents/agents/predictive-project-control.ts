import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { resolveEscalation } from '../framework/escalation';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  resolveProjectManager, resolveGM, resolveAssignment,
  resolveDepartmentHead, resolveReportingManager,
  fpWithProject, fpGlobal, hasOpenTask as hasOpenTaskShared,
  trendDirection, velocityScore,
} from './project-control-shared';

const SOURCE_AGENT = 'predictive_project_controller';
const AGENT_KEY = 'predictive_project_control';

const PREDICTION_SEVERITY_MAP: Record<string, string> = {
  PP1: 'warning', PP2: 'risk', PP3: 'critical',
  PD1: 'warning', PD2: 'risk', PD3: 'warning',
  PR1: 'risk', PR2: 'warning', PR3: 'risk',
  PX1: 'critical', PX2: 'risk', PX3: 'critical',
};

function predSev(code: string): string {
  return PREDICTION_SEVERITY_MAP[code] || 'warning';
}

function fpPred(type: string, projectId: number | string | null, entity: string, id: string | number): string {
  const pid = projectId || 'global';
  return `[fp:ppc_${type}:p${pid}:${entity}:${id}]`;
}

async function hasOpenTask(fingerprint: string): Promise<boolean> {
  return hasOpenTaskShared(fingerprint, SOURCE_AGENT);
}

function confidenceLabel(score: number): string {
  if (score >= 80) return 'High';
  if (score >= 60) return 'Medium';
  return 'Low';
}

function riskBand(score: number): string {
  if (score >= 80) return 'Critical Risk';
  if (score >= 60) return 'High Risk';
  if (score >= 40) return 'Moderate Risk';
  return 'Low Risk';
}

export class PredictiveProjectControlAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Predictive Project Control Agent';
  category = 'intelligence';

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

    // ════════════════════════════════════════════════════════════════════════
    // PP SERIES: PROJECT DELAY PREDICTIONS
    // Uses task closure rate, WO completion velocity, phase progress stalling
    // ════════════════════════════════════════════════════════════════════════
    try {
      const projectRows = await db.execute(sql`
        SELECT p.id, p.name, p.status, p.target_end_date, p.manager_id,
          p.code as project_code
        FROM projects p
        WHERE p.status NOT IN ('cancelled', 'archived', 'completed')
      `);
      queriesRun++;
      const projects = (projectRows.rows || []) as any[];

      for (const project of projects) {
        const pid = Number(project.id);

        // ── PP1: Task Closure Rate Declining ──
        const closureRateRows = await db.execute(sql`
          SELECT
            (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = ${pid}
              AND wo.status = 'completed'
              AND wo.updated_at >= NOW() - INTERVAL '14 days'
              AND wo.updated_at < NOW() - INTERVAL '7 days')::int as prev_week_closed,
            (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = ${pid}
              AND wo.status = 'completed'
              AND wo.updated_at >= NOW() - INTERVAL '7 days')::int as curr_week_closed,
            (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = ${pid}
              AND wo.status NOT IN ('completed', 'cancelled'))::int as open_count,
            (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = ${pid})::int as total_count
        `);
        queriesRun++;
        const cr = (closureRateRows.rows as any[])[0] || {};
        const prevClosed = Number(cr.prev_week_closed || 0);
        const currClosed = Number(cr.curr_week_closed || 0);
        const openCount = Number(cr.open_count || 0);
        const totalCount = Number(cr.total_count || 0);

        if (totalCount < 3) continue;

        const trend = trendDirection(openCount > 0 ? (openCount - currClosed) : 0, openCount > 0 ? (openCount - prevClosed) : 0);
        const closureVelocity = velocityScore(currClosed, prevClosed);

        if (currClosed < prevClosed && prevClosed >= 2 && openCount > 3) {
          const declinePct = prevClosed > 0 ? Math.round(((prevClosed - currClosed) / prevClosed) * 100) : 100;
          const confidence = Math.min(90, 50 + declinePct);
          const fingerprint = fpPred('pp1_closure_decline', pid, 'project', pid);
          const severity = predSev('PP1');

          const finding = await findingManager.createFinding({
            findingType: 'prediction',
            severity: 'medium',
            title: `PP1 Task Closure Rate Declining: ${project.name} — ${currClosed} vs ${prevClosed} last week`,
            description: `Project "${project.name}" task closure rate has declined ${declinePct}%.\nCurrent week: ${currClosed} completed | Previous week: ${prevClosed} completed\nOpen WOs: ${openCount}/${totalCount}\nTrend: ${trend}\nPrediction confidence: ${confidenceLabel(confidence)} (${confidence}%)`,
            logicType: 'predictive',
            dataSnapshot: { projectId: pid, currClosed, prevClosed, openCount, totalCount, declinePct, confidence, trend },
            relatedEntityType: 'project',
            relatedEntityId: String(pid),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(pid);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Predictive Control – Task Closure Declining: ${project.name}`,
              actionType: 'create_task',
              description: `Task closure rate declined ${declinePct}% — potential project delay.`,
              actionPayload: {
                title: `[Agent] Predictive Control – Task Closure Rate Declining: ${project.name} (${declinePct}% drop)`,
                description: `Project "${project.name}" task closure rate is declining.\nCurrent week: ${currClosed} closed | Previous week: ${prevClosed} closed\nOpen WOs: ${openCount}/${totalCount}\nPrediction: Potential project delay if trend continues\nagent_severity: ${severity}\n\nReview team capacity and identify blockers.`,
                assignedTo: await resolveEscalation('L2', pm),
                priority: declinePct >= 50 ? 'High' : 'Medium',
                category: `Prediction ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: declinePct >= 50 ? 'high' : 'medium',
              confidence: confidence / 100,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }

        // ── PP2: WO Completion Velocity Below Required Rate ──
        if (project.target_end_date && openCount > 0) {
          const targetDate = new Date(project.target_end_date);
          const daysRemaining = Math.max(1, Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          const requiredRate = openCount / (daysRemaining / 7);
          const actualRate = currClosed;

          if (daysRemaining < 90 && daysRemaining > 0 && actualRate < requiredRate * 0.5 && openCount >= 3) {
            const gapPct = Math.round(((requiredRate - actualRate) / requiredRate) * 100);
            const confidence = Math.min(85, 40 + gapPct);
            const fingerprint = fpPred('pp2_velocity_gap', pid, 'project', pid);
            const severity = predSev('PP2');

            const finding = await findingManager.createFinding({
              findingType: 'prediction',
              severity: 'high',
              title: `PP2 Completion Velocity Gap: ${project.name} — ${actualRate}/wk vs ${requiredRate.toFixed(1)}/wk needed`,
              description: `Project "${project.name}" WO completion rate (${actualRate}/week) is below the required rate (${requiredRate.toFixed(1)}/week) to meet deadline.\nDays remaining: ${daysRemaining} | Open WOs: ${openCount}\nVelocity gap: ${gapPct}%\nPrediction: Project will likely miss deadline at current pace.\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
              logicType: 'predictive',
              dataSnapshot: { projectId: pid, actualRate, requiredRate: Math.round(requiredRate * 10) / 10, daysRemaining, openCount, gapPct, confidence },
              relatedEntityType: 'project',
              relatedEntityId: String(pid),
            });
            if (!finding.isDuplicate) findingsCount++;

            if (!await hasOpenTask(fingerprint)) {
              const pm = await resolveProjectManager(pid);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id || finding.findingId,
                title: `[Agent] Predictive Control – Velocity Gap: ${project.name}`,
                actionType: 'create_task',
                description: `WO completion rate ${actualRate}/wk vs ${requiredRate.toFixed(1)}/wk required.`,
                actionPayload: {
                  title: `[Agent] Predictive Control – Completion Velocity Gap: ${project.name} (${gapPct}% below target)`,
                  description: `Project "${project.name}" completion velocity is insufficient.\nActual rate: ${actualRate} WOs/week\nRequired rate: ${requiredRate.toFixed(1)} WOs/week\nDays remaining: ${daysRemaining}\nOpen WOs: ${openCount}\nPrediction: Project will miss ${project.target_end_date} deadline at current pace\nagent_severity: ${severity}\n\nRequires resource reallocation or timeline revision.`,
                  assignedTo: await resolveEscalation('L2', pm),
                  priority: gapPct >= 70 ? 'Critical' : 'High',
                  category: `Prediction ${fingerprint}`,
                },
                actionCategory: 'task_creation',
                logicType: 'rule_based',
                priority: gapPct >= 70 ? 'critical' : 'high',
                confidence: confidence / 100,
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
            }
          }
        }

        // ── PP3: Phase Progress Stalling (milestone miss prediction) ──
        const phaseProgressRows = await db.execute(sql`
          SELECT pp.id, pp.name, pp.status, pp.progress, pp.target_end_date, pp."order",
            pp.phase_lead_id,
            EXTRACT(DAY FROM NOW() - pp.updated_at)::int as days_since_update
          FROM project_phases pp
          WHERE pp.project_id = ${pid} AND pp.status NOT IN ('completed', 'cancelled')
            AND pp.target_end_date IS NOT NULL
          ORDER BY pp."order"
        `);
        queriesRun++;

        for (const phase of (phaseProgressRows.rows || []) as any[]) {
          const targetDate = new Date(phase.target_end_date);
          const daysRemaining = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const progress = Number(phase.progress || 0);
          const daysSinceUpdate = Number(phase.days_since_update || 0);

          if (daysRemaining > 0 && daysRemaining <= 30 && progress < 70 && daysSinceUpdate >= 7) {
            const expectedProgress = Math.min(100, Math.round(100 - (daysRemaining / 30 * 30)));
            const progressGap = expectedProgress - progress;
            if (progressGap < 20) continue;

            const confidence = Math.min(85, 40 + progressGap);
            const fingerprint = fpPred('pp3_phase_stall', pid, 'phase', phase.id);
            const severity = predSev('PP3');

            const finding = await findingManager.createFinding({
              findingType: 'prediction',
              severity: progressGap >= 40 ? 'critical' : 'high',
              title: `PP3 Phase Stalling: ${phase.name} (seq ${phase.order}) in ${project.name} — ${progress}% vs ${expectedProgress}% expected`,
              description: `Phase "${phase.name}" (seq: ${phase.order}) in project "${project.name}" progress has stalled.\nCurrent: ${progress}% | Expected: ${expectedProgress}% | Gap: ${progressGap}pp\nDays remaining: ${daysRemaining} | Days since update: ${daysSinceUpdate}\nPrediction: Milestone "${phase.name}" will likely be missed.\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
              logicType: 'predictive',
              dataSnapshot: { phaseId: phase.id, projectId: pid, progress, expectedProgress, progressGap, daysRemaining, daysSinceUpdate, confidence, phaseOrder: phase.order },
              relatedEntityType: 'project_phase',
              relatedEntityId: String(phase.id),
            });
            if (!finding.isDuplicate) findingsCount++;

            if (!await hasOpenTask(fingerprint)) {
              const assignTo = await resolveAssignment(
                phase.phase_lead_id ? Number(phase.phase_lead_id) : null, pid, 'Administration'
              );
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id || finding.findingId,
                title: `[Agent] Predictive Control – Phase Stalling: ${phase.name} in ${project.name}`,
                actionType: 'create_task',
                description: `Phase progress ${progress}% vs ${expectedProgress}% expected, ${daysRemaining}d to deadline.`,
                actionPayload: {
                  title: `[Agent] Predictive Control – Phase Stalling: ${phase.name} in ${project.name} (${progressGap}pp behind)`,
                  description: `Phase "${phase.name}" (seq: ${phase.order}) in project "${project.name}" is falling behind.\nProgress: ${progress}% vs ${expectedProgress}% expected\nTarget: ${phase.target_end_date} (${daysRemaining}d remaining)\nLast update: ${daysSinceUpdate}d ago\nPrediction: Milestone will be missed\nagent_severity: ${severity}\n\nReview and accelerate phase completion.`,
                  assignedTo: assignTo,
                  priority: progressGap >= 40 ? 'Critical' : 'High',
                  category: `Prediction ${fingerprint}`,
                },
                actionCategory: 'task_creation',
                logicType: 'rule_based',
                priority: progressGap >= 40 ? 'critical' : 'high',
                confidence: confidence / 100,
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[PredictivePC] PP series error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PD SERIES: DESIGN BOTTLENECK PREDICTIONS
    // Uses drawing release pace, review turnaround trends, revision frequency
    // ════════════════════════════════════════════════════════════════════════
    try {
      const designProjectRows = await db.execute(sql`
        SELECT dp.id, dp.design_project_name, dp.project_id, dp.design_manager_id,
          dp.target_end_date, dp.overall_progress,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id
            AND dd.status IN ('Approved', 'Issued')
            AND dd.updated_at >= NOW() - INTERVAL '14 days'
            AND dd.updated_at < NOW() - INTERVAL '7 days')::int as prev_week_released,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id
            AND dd.status IN ('Approved', 'Issued')
            AND dd.updated_at >= NOW() - INTERVAL '7 days')::int as curr_week_released,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id
            AND dd.status NOT IN ('Approved', 'Issued', 'Superseded'))::int as open_drawings,
          (SELECT COUNT(*) FROM design_drawings dd WHERE dd.design_project_id = dp.id)::int as total_drawings
        FROM design_projects dp
        WHERE dp.status IN ('In Progress', 'Active', 'active', 'in_progress')
      `);
      queriesRun++;

      for (const dp of (designProjectRows.rows || []) as any[]) {
        const prevReleased = Number(dp.prev_week_released || 0);
        const currReleased = Number(dp.curr_week_released || 0);
        const openDrawings = Number(dp.open_drawings || 0);
        const totalDrawings = Number(dp.total_drawings || 0);
        const pid = dp.project_id ? Number(dp.project_id) : null;

        if (totalDrawings < 3) continue;

        // ── PD1: Drawing Release Pace Declining ──
        if (currReleased < prevReleased && prevReleased >= 2 && openDrawings >= 3) {
          const declinePct = Math.round(((prevReleased - currReleased) / prevReleased) * 100);
          const confidence = Math.min(85, 45 + declinePct);
          const fingerprint = fpPred('pd1_release_decline', pid, 'dp', dp.id);
          const severity = predSev('PD1');

          const finding = await findingManager.createFinding({
            findingType: 'prediction',
            severity: 'medium',
            title: `PD1 Drawing Release Pace Declining: ${dp.design_project_name} — ${currReleased} vs ${prevReleased} last week`,
            description: `Design project "${dp.design_project_name}" drawing release pace declined ${declinePct}%.\nCurrent week: ${currReleased} released | Previous week: ${prevReleased}\nOpen drawings: ${openDrawings}/${totalDrawings}\nPrediction: Design bottleneck forming\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
            logicType: 'predictive',
            dataSnapshot: { dpId: dp.id, projectId: pid, currReleased, prevReleased, openDrawings, totalDrawings, declinePct, confidence },
            relatedEntityType: 'design_project',
            relatedEntityId: String(dp.id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const deptHead = await resolveDepartmentHead('Design');
            const assignTo = dp.design_manager_id ? Number(dp.design_manager_id) : (deptHead || gmId);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Predictive Control – Drawing Release Declining: ${dp.design_project_name}`,
              actionType: 'create_task',
              description: `Drawing release pace declined ${declinePct}%.`,
              actionPayload: {
                title: `[Agent] Predictive Control – Drawing Release Pace Declining: ${dp.design_project_name} (${declinePct}% drop)`,
                description: `Design project "${dp.design_project_name}" drawing release pace is declining.\nCurrent week: ${currReleased} | Previous week: ${prevReleased}\nOpen: ${openDrawings}/${totalDrawings}\nPrediction: Design bottleneck forming\nagent_severity: ${severity}\n\nReview design team capacity and priorities.`,
                assignedTo: assignTo,
                priority: declinePct >= 50 ? 'High' : 'Medium',
                category: `Prediction ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: declinePct >= 50 ? 'high' : 'medium',
              confidence: confidence / 100,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── PD2: Review Turnaround Time Increasing ──
      const reviewTurnaroundRows = await db.execute(sql`
        SELECT dp.id as dp_id, dp.design_project_name, dp.project_id, dp.design_manager_id,
          (SELECT AVG(EXTRACT(DAY FROM dr.completed_date::timestamp - dr.created_at::timestamp))
            FROM design_reviews dr
            JOIN design_drawings dd ON dr.drawing_id = dd.id
            WHERE dd.design_project_id = dp.id
              AND dr.status IN ('Approved', 'Approved with Comments', 'Rejected')
              AND dr.completed_date IS NOT NULL
              AND dr.completed_date::timestamp >= NOW() - INTERVAL '30 days'
              AND dr.completed_date::timestamp < NOW() - INTERVAL '15 days') as prev_avg_turnaround,
          (SELECT AVG(EXTRACT(DAY FROM dr.completed_date::timestamp - dr.created_at::timestamp))
            FROM design_reviews dr
            JOIN design_drawings dd ON dr.drawing_id = dd.id
            WHERE dd.design_project_id = dp.id
              AND dr.status IN ('Approved', 'Approved with Comments', 'Rejected')
              AND dr.completed_date IS NOT NULL
              AND dr.completed_date::timestamp >= NOW() - INTERVAL '15 days') as curr_avg_turnaround,
          (SELECT COUNT(*) FROM design_reviews dr
            JOIN design_drawings dd ON dr.drawing_id = dd.id
            WHERE dd.design_project_id = dp.id
              AND dr.status IN ('Pending', 'In Progress'))::int as pending_reviews
        FROM design_projects dp
        WHERE dp.status IN ('In Progress', 'Active', 'active', 'in_progress')
      `);
      queriesRun++;

      for (const row of (reviewTurnaroundRows.rows || []) as any[]) {
        const prevAvg = Number(row.prev_avg_turnaround || 0);
        const currAvg = Number(row.curr_avg_turnaround || 0);
        const pendingReviews = Number(row.pending_reviews || 0);

        if (prevAvg <= 0 || currAvg <= 0 || pendingReviews === 0) continue;
        if (currAvg <= prevAvg * 1.3) continue;

        const increasePct = Math.round(((currAvg - prevAvg) / prevAvg) * 100);
        const confidence = Math.min(80, 40 + increasePct / 2);
        const fingerprint = fpPred('pd2_review_slow', row.project_id, 'dp', row.dp_id);
        const severity = predSev('PD2');

        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'high',
          title: `PD2 Review Turnaround Increasing: ${row.design_project_name} — ${currAvg.toFixed(1)}d avg vs ${prevAvg.toFixed(1)}d prior`,
          description: `Design project "${row.design_project_name}" review turnaround increased ${increasePct}%.\nCurrent avg: ${currAvg.toFixed(1)} days | Previous avg: ${prevAvg.toFixed(1)} days\nPending reviews: ${pendingReviews}\nPrediction: Review backlog building\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
          logicType: 'predictive',
          dataSnapshot: { dpId: row.dp_id, projectId: row.project_id, currAvg: Math.round(currAvg * 10) / 10, prevAvg: Math.round(prevAvg * 10) / 10, increasePct, pendingReviews, confidence },
          relatedEntityType: 'design_project',
          relatedEntityId: String(row.dp_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const assignTo = row.design_manager_id ? Number(row.design_manager_id) : (deptHead || gmId);
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Predictive Control – Review Turnaround Increasing: ${row.design_project_name}`,
            actionType: 'create_task',
            description: `Review turnaround increased ${increasePct}% — backlog building.`,
            actionPayload: {
              title: `[Agent] Predictive Control – Review Turnaround Increasing: ${row.design_project_name} (${increasePct}% slower)`,
              description: `Design project "${row.design_project_name}" review turnaround is increasing.\nCurrent: ${currAvg.toFixed(1)}d avg | Previous: ${prevAvg.toFixed(1)}d avg\nPending reviews: ${pendingReviews}\nagent_severity: ${severity}\n\nAssign additional reviewers or prioritize review queue.`,
              assignedTo: assignTo,
              priority: 'High',
              category: `Prediction ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'high',
            confidence: confidence / 100,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── PD3: Revision Frequency Increasing (quality signal) ──
      const revisionFreqRows = await db.execute(sql`
        SELECT dp.id as dp_id, dp.design_project_name, dp.project_id, dp.design_manager_id,
          (SELECT COUNT(*) FROM drawing_versions dv
            JOIN design_drawings dd ON dv.drawing_id = dd.id
            WHERE dd.design_project_id = dp.id
              AND dv.created_at >= NOW() - INTERVAL '14 days'
              AND dv.created_at < NOW() - INTERVAL '7 days')::int as prev_week_revisions,
          (SELECT COUNT(*) FROM drawing_versions dv
            JOIN design_drawings dd ON dv.drawing_id = dd.id
            WHERE dd.design_project_id = dp.id
              AND dv.created_at >= NOW() - INTERVAL '7 days')::int as curr_week_revisions
        FROM design_projects dp
        WHERE dp.status IN ('In Progress', 'Active', 'active', 'in_progress')
      `);
      queriesRun++;

      for (const row of (revisionFreqRows.rows || []) as any[]) {
        const prevRevisions = Number(row.prev_week_revisions || 0);
        const currRevisions = Number(row.curr_week_revisions || 0);

        if (prevRevisions < 2 || currRevisions < prevRevisions * 1.5) continue;

        const increasePct = Math.round(((currRevisions - prevRevisions) / prevRevisions) * 100);
        const confidence = Math.min(75, 35 + increasePct / 3);
        const fingerprint = fpPred('pd3_revision_spike', row.project_id, 'dp', row.dp_id);
        const severity = predSev('PD3');

        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'medium',
          title: `PD3 Revision Frequency Spike: ${row.design_project_name} — ${currRevisions} vs ${prevRevisions} last week`,
          description: `Design project "${row.design_project_name}" revision frequency increased ${increasePct}%.\nCurrent week: ${currRevisions} revisions | Previous: ${prevRevisions}\nPrediction: Quality issues or scope changes detected\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
          logicType: 'predictive',
          dataSnapshot: { dpId: row.dp_id, projectId: row.project_id, currRevisions, prevRevisions, increasePct, confidence },
          relatedEntityType: 'design_project',
          relatedEntityId: String(row.dp_id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const deptHead = await resolveDepartmentHead('Design');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Predictive Control – Revision Spike: ${row.design_project_name}`,
            actionType: 'create_task',
            description: `Revision frequency increased ${increasePct}% — quality concern.`,
            actionPayload: {
              title: `[Agent] Predictive Control – Revision Frequency Spike: ${row.design_project_name} (${increasePct}% increase)`,
              description: `Design project "${row.design_project_name}" revision frequency is spiking.\nCurrent week: ${currRevisions} | Previous: ${prevRevisions}\nPrediction: Design quality or scope stability issue\nagent_severity: ${severity}\n\nReview design quality process and scope changes.`,
              assignedTo: row.design_manager_id ? Number(row.design_manager_id) : await resolveEscalation('L1', deptHead),
              priority: 'Medium',
              category: `Prediction ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'medium',
            confidence: confidence / 100,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

    } catch (err: any) {
      console.error(`[PredictivePC] PD series error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PR SERIES: PROCUREMENT DELAY PREDICTIONS
    // Uses procurement cycle lag, vendor delivery patterns, GR receipt rate
    // ════════════════════════════════════════════════════════════════════════
    try {
      // ── PR1: Procurement Cycle Lag Increasing ──
      const procCycleRows = await db.execute(sql`
        SELECT
          (SELECT AVG(EXTRACT(DAY FROM spo.created_at - spr.created_at))
            FROM sap_purchase_orders spo
            JOIN sap_purchase_requisitions spr ON spo.comments LIKE '%' || spr.doc_num::text || '%'
            WHERE spo.created_at >= NOW() - INTERVAL '60 days'
              AND spo.created_at < NOW() - INTERVAL '30 days') as prev_cycle_days,
          (SELECT AVG(EXTRACT(DAY FROM spo.created_at - spr.created_at))
            FROM sap_purchase_orders spo
            JOIN sap_purchase_requisitions spr ON spo.comments LIKE '%' || spr.doc_num::text || '%'
            WHERE spo.created_at >= NOW() - INTERVAL '30 days') as curr_cycle_days,
          (SELECT COUNT(*) FROM sap_purchase_requisitions WHERE doc_status = 'bost_Open')::int as open_prs
      `);
      queriesRun++;

      const pc = (procCycleRows.rows as any[])[0] || {};
      const prevCycle = Number(pc.prev_cycle_days || 0);
      const currCycle = Number(pc.curr_cycle_days || 0);
      const openPRs = Number(pc.open_prs || 0);

      if (prevCycle > 0 && currCycle > prevCycle * 1.3 && openPRs > 0) {
        const increasePct = Math.round(((currCycle - prevCycle) / prevCycle) * 100);
        const confidence = Math.min(80, 40 + increasePct / 2);
        const fingerprint = fpPred('pr1_cycle_lag', null, 'procurement', 'global');
        const severity = predSev('PR1');

        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'high',
          title: `PR1 Procurement Cycle Lag Increasing: ${currCycle.toFixed(1)}d avg vs ${prevCycle.toFixed(1)}d prior`,
          description: `Procurement cycle time (PR to PO) increased ${increasePct}%.\nCurrent: ${currCycle.toFixed(1)} days avg | Previous: ${prevCycle.toFixed(1)} days avg\nOpen PRs: ${openPRs}\nPrediction: Procurement delays will cascade to project timelines\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
          logicType: 'predictive',
          dataSnapshot: { currCycle: Math.round(currCycle * 10) / 10, prevCycle: Math.round(prevCycle * 10) / 10, increasePct, openPRs, confidence },
          relatedEntityType: 'procurement',
          relatedEntityId: 'global',
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const purchaseHead = await resolveDepartmentHead('Purchase');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Predictive Control – Procurement Cycle Lag Increasing`,
            actionType: 'create_task',
            description: `PR-to-PO cycle increased ${increasePct}%.`,
            actionPayload: {
              title: `[Agent] Predictive Control – Procurement Cycle Lag Increasing (${increasePct}% slower)`,
              description: `Procurement cycle time (PR to PO conversion) has increased.\nCurrent: ${currCycle.toFixed(1)}d avg | Previous: ${prevCycle.toFixed(1)}d avg\nOpen PRs: ${openPRs}\nagent_severity: ${severity}\n\nReview procurement process bottlenecks.`,
              assignedTo: await resolveEscalation('L2', purchaseHead),
              priority: 'High',
              category: `Prediction ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: 'high',
            confidence: confidence / 100,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── PR2: Vendor Delivery Pattern Deteriorating ──
      const vendorDeliveryRows = await db.execute(sql`
        SELECT spo.vendor_name, spo.vendor_code,
          COUNT(*)::int as total_open,
          AVG(CASE WHEN spo.doc_due_date < CURRENT_DATE THEN (CURRENT_DATE - spo.doc_due_date) ELSE 0 END)::int as avg_days_late,
          COUNT(CASE WHEN spo.doc_due_date < CURRENT_DATE THEN 1 END)::int as overdue_count
        FROM sap_purchase_orders spo
        WHERE spo.doc_status = 'bost_Open' AND spo.cancelled = 'tNO'
        GROUP BY spo.vendor_name, spo.vendor_code
        HAVING COUNT(CASE WHEN spo.doc_due_date < CURRENT_DATE THEN 1 END) >= 3
        ORDER BY avg_days_late DESC
        LIMIT 10
      `);
      queriesRun++;

      for (const vendor of (vendorDeliveryRows.rows || []) as any[]) {
        const avgDaysLate = Number(vendor.avg_days_late || 0);
        const overdueCount = Number(vendor.overdue_count || 0);
        if (avgDaysLate < 14) continue;

        const confidence = Math.min(85, 50 + Math.min(avgDaysLate, 60));
        const fingerprint = fpGlobal('pr2_vendor_pattern', 'vendor', vendor.vendor_code || vendor.vendor_name);
        const severity = predSev('PR2');

        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: 'medium',
          title: `PR2 Vendor Delivery Deteriorating: ${vendor.vendor_name} — ${overdueCount} overdue, avg ${avgDaysLate}d late`,
          description: `Vendor "${vendor.vendor_name}" has ${overdueCount} overdue POs averaging ${avgDaysLate} days late.\nTotal open POs: ${vendor.total_open}\nPrediction: Future orders from this vendor likely to be delayed\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
          logicType: 'predictive',
          dataSnapshot: { vendorName: vendor.vendor_name, vendorCode: vendor.vendor_code, overdueCount, avgDaysLate, totalOpen: vendor.total_open, confidence },
          relatedEntityType: 'vendor',
          relatedEntityId: vendor.vendor_code || vendor.vendor_name,
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const purchaseHead = await resolveDepartmentHead('Purchase');
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Predictive Control – Vendor Delivery Risk: ${vendor.vendor_name}`,
            actionType: 'create_task',
            description: `${overdueCount} POs avg ${avgDaysLate}d late from this vendor.`,
            actionPayload: {
              title: `[Agent] Predictive Control – Vendor Delivery Pattern Deteriorating: ${vendor.vendor_name}`,
              description: `Vendor "${vendor.vendor_name}" delivery pattern is deteriorating.\nOverdue POs: ${overdueCount} | Avg late: ${avgDaysLate}d\nTotal open: ${vendor.total_open}\nagent_severity: ${severity}\n\nReview vendor performance and consider alternate sourcing.`,
              assignedTo: await resolveEscalation('L2', purchaseHead),
              priority: avgDaysLate >= 30 ? 'High' : 'Medium',
              category: `Prediction ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: avgDaysLate >= 30 ? 'high' : 'medium',
            confidence: confidence / 100,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }

      // ── PR3: GR Receipt Rate Declining ──
      const grRateRows = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM sap_goods_receipt_po gr
            WHERE gr.cancelled = 'tNO'
              AND gr.created_at >= NOW() - INTERVAL '14 days'
              AND gr.created_at < NOW() - INTERVAL '7 days')::int as prev_week_gr,
          (SELECT COUNT(*) FROM sap_goods_receipt_po gr
            WHERE gr.cancelled = 'tNO'
              AND gr.created_at >= NOW() - INTERVAL '7 days')::int as curr_week_gr,
          (SELECT COUNT(*) FROM sap_purchase_orders spo
            WHERE spo.doc_status = 'bost_Open' AND spo.cancelled = 'tNO'
              AND spo.doc_due_date < CURRENT_DATE)::int as overdue_po_count
      `);
      queriesRun++;

      const gr = (grRateRows.rows as any[])[0] || {};
      const prevGR = Number(gr.prev_week_gr || 0);
      const currGR = Number(gr.curr_week_gr || 0);
      const overduePOCount = Number(gr.overdue_po_count || 0);

      if (prevGR >= 2 && currGR < prevGR && overduePOCount > 3) {
        const declinePct = Math.round(((prevGR - currGR) / prevGR) * 100);
        if (declinePct >= 30) {
          const confidence = Math.min(80, 40 + declinePct);
          const fingerprint = fpPred('pr3_gr_decline', null, 'procurement', 'global');
          const severity = predSev('PR3');

          const finding = await findingManager.createFinding({
            findingType: 'prediction',
            severity: 'high',
            title: `PR3 GR Receipt Rate Declining: ${currGR}/wk vs ${prevGR}/wk — ${overduePOCount} POs overdue`,
            description: `Goods receipt rate declined ${declinePct}%.\nCurrent week: ${currGR} GRs | Previous week: ${prevGR}\nOverdue POs awaiting receipt: ${overduePOCount}\nPrediction: Material shortages likely\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
            logicType: 'predictive',
            dataSnapshot: { currGR, prevGR, declinePct, overduePOCount, confidence },
            relatedEntityType: 'procurement',
            relatedEntityId: 'global',
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const purchaseHead = await resolveDepartmentHead('Purchase');
            const mgr = purchaseHead ? await resolveReportingManager(purchaseHead) : null;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Predictive Control – GR Receipt Rate Declining`,
              actionType: 'create_task',
              description: `GR rate declined ${declinePct}% with ${overduePOCount} POs overdue.`,
              actionPayload: {
                title: `[Agent] Predictive Control – GR Receipt Rate Declining (${declinePct}% drop)`,
                description: `Goods receipt rate is declining significantly.\nCurrent: ${currGR}/week | Previous: ${prevGR}/week\nOverdue POs: ${overduePOCount}\nagent_severity: ${severity}\n\nReview vendor expediting and logistics.`,
                assignedTo: await resolveEscalation('L2', mgr || purchaseHead),
                priority: 'High',
                category: `Prediction ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: 'high',
              confidence: confidence / 100,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

    } catch (err: any) {
      console.error(`[PredictivePC] PR series error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PX SERIES: CROSS-MODULE RISK PREDICTIONS
    // Combined velocity signals across project, design, and procurement
    // ════════════════════════════════════════════════════════════════════════
    try {
      const crossModuleRows = await db.execute(sql`
        SELECT p.id, p.name, p.target_end_date, p.manager_id, p.code,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = p.id AND wo.status NOT IN ('completed','cancelled'))::int as open_wos,
          (SELECT COUNT(*) FROM work_orders wo WHERE wo.project_id = p.id AND wo.status = 'completed'
            AND wo.updated_at >= NOW() - INTERVAL '7 days')::int as wos_closed_this_week,
          (SELECT COUNT(*) FROM design_drawings dd
            JOIN design_projects dp ON dd.design_project_id = dp.id
            WHERE dp.project_id = p.id AND dd.status NOT IN ('Approved','Issued','Superseded'))::int as open_drawings,
          (SELECT COUNT(*) FROM design_drawings dd
            JOIN design_projects dp ON dd.design_project_id = dp.id
            WHERE dp.project_id = p.id AND dd.status IN ('Approved','Issued')
            AND dd.updated_at >= NOW() - INTERVAL '7 days')::int as drawings_released_this_week,
          (SELECT COUNT(*) FROM sap_purchase_orders spo
            WHERE spo.project_code = p.code AND spo.doc_status = 'bost_Open' AND spo.cancelled = 'tNO'
            AND spo.doc_due_date < CURRENT_DATE)::int as overdue_pos,
          (SELECT COUNT(*) FROM project_phases pp
            WHERE pp.project_id = p.id AND pp.status != 'completed'
            AND pp.target_end_date IS NOT NULL AND pp.target_end_date < CURRENT_DATE)::int as overdue_phases
        FROM projects p
        WHERE p.status NOT IN ('cancelled', 'archived', 'completed')
          AND p.target_end_date IS NOT NULL
      `);
      queriesRun++;

      for (const proj of (crossModuleRows.rows || []) as any[]) {
        const pid = Number(proj.id);
        const targetDate = new Date(proj.target_end_date);
        const daysRemaining = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysRemaining > 60 || daysRemaining < -180) continue;

        const openWOs = Number(proj.open_wos || 0);
        const wosClosedWeek = Number(proj.wos_closed_this_week || 0);
        const openDrawings = Number(proj.open_drawings || 0);
        const drawingsReleasedWeek = Number(proj.drawings_released_this_week || 0);
        const overduePOs = Number(proj.overdue_pos || 0);
        const overduePhases = Number(proj.overdue_phases || 0);

        if (openWOs + openDrawings < 3) continue;

        // ── PX1: Cascading Cross-Module Delay ──
        const woVelocityScore = openWOs > 0 ? Math.max(0, 100 - ((openWOs - wosClosedWeek * 4) / openWOs) * 100) : 100;
        const designVelocityScore = openDrawings > 0 ? Math.max(0, 100 - ((openDrawings - drawingsReleasedWeek * 4) / openDrawings) * 100) : 100;
        const procRiskScore = overduePOs > 0 ? Math.max(0, 100 - overduePOs * 15) : 100;
        const phaseRiskScore = overduePhases > 0 ? Math.max(0, 100 - overduePhases * 20) : 100;

        const compositeRisk = Math.round(
          (woVelocityScore * 0.30) +
          (designVelocityScore * 0.25) +
          (procRiskScore * 0.25) +
          (phaseRiskScore * 0.20)
        );

        if (compositeRisk >= 60) continue;

        const riskLevel = riskBand(100 - compositeRisk);
        const confidence = Math.min(85, 50 + (60 - compositeRisk));
        const fingerprint = fpPred('px1_cascade', pid, 'project', pid);
        const severity = predSev('PX1');

        const finding = await findingManager.createFinding({
          findingType: 'prediction',
          severity: compositeRisk < 30 ? 'critical' : 'high',
          title: `PX1 Cascading Delay Risk: ${proj.name} — composite score ${compositeRisk}/100 (${riskLevel})`,
          description: `Project "${proj.name}" shows cross-module risk signals.\nComposite velocity score: ${compositeRisk}/100 (${riskLevel})\nWO velocity: ${Math.round(woVelocityScore)} | Design velocity: ${Math.round(designVelocityScore)}\nProcurement risk: ${Math.round(procRiskScore)} | Phase risk: ${Math.round(phaseRiskScore)}\nOpen WOs: ${openWOs} | Open drawings: ${openDrawings} | Overdue POs: ${overduePOs} | Overdue phases: ${overduePhases}\nDays to deadline: ${daysRemaining}\nPrediction: Multi-module cascading delay likely\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
          logicType: 'predictive',
          dataSnapshot: {
            projectId: pid, compositeRisk, riskLevel, daysRemaining, confidence,
            woVelocityScore: Math.round(woVelocityScore),
            designVelocityScore: Math.round(designVelocityScore),
            procRiskScore: Math.round(procRiskScore),
            phaseRiskScore: Math.round(phaseRiskScore),
            openWOs, openDrawings, overduePOs, overduePhases,
          },
          relatedEntityType: 'project',
          relatedEntityId: String(pid),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] Predictive Control – Cascading Delay Risk: ${proj.name}`,
            actionType: 'create_task',
            description: `Multi-module risk score ${compositeRisk}/100 — cascading delay likely.`,
            actionPayload: {
              title: `[Agent] Predictive Control – Cascading Delay Risk: ${proj.name} (score: ${compositeRisk}/100, ${riskLevel})`,
              description: `Project "${proj.name}" shows cross-module cascading delay signals.\nComposite score: ${compositeRisk}/100 (${riskLevel})\nWO velocity: ${Math.round(woVelocityScore)} | Design: ${Math.round(designVelocityScore)} | Procurement: ${Math.round(procRiskScore)} | Phase: ${Math.round(phaseRiskScore)}\nDeadline: ${proj.target_end_date} (${daysRemaining}d)\nagent_severity: ${severity}\n\nRequires immediate cross-functional management review.`,
              assignedTo: await resolveEscalation('L3', pm),
              priority: compositeRisk < 30 ? 'Critical' : 'High',
              category: `Prediction ${fingerprint}`,
            },
            actionCategory: 'task_creation',
            logicType: 'rule_based',
            priority: compositeRisk < 30 ? 'critical' : 'high',
            confidence: confidence / 100,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }

        // ── PX2: Resource Contention Across Modules ──
        const resourceRows = await db.execute(sql`
          SELECT u.id as user_id, u.username,
            (SELECT COUNT(*) FROM work_orders wo WHERE wo.supervisor_id = u.id AND wo.status NOT IN ('completed','cancelled') AND wo.project_id = ${pid})::int as wo_count,
            (SELECT COUNT(*) FROM design_drawings dd
              JOIN design_projects dp ON dd.design_project_id = dp.id
              WHERE dd.assigned_to_id = u.id AND dp.project_id = ${pid}
              AND dd.status NOT IN ('Approved','Issued','Superseded'))::int as drawing_count,
            (SELECT COUNT(*) FROM tasks t
              JOIN project_tasks pt ON pt.task_id = t.id
              WHERE t.assigned_to = u.id AND pt.project_id = ${pid}
              AND t.status NOT IN ('completed','cancelled'))::int as task_count
          FROM users u
          WHERE u.is_active = true
            AND (
              EXISTS (SELECT 1 FROM work_orders wo WHERE wo.supervisor_id = u.id AND wo.project_id = ${pid} AND wo.status NOT IN ('completed','cancelled'))
              OR EXISTS (SELECT 1 FROM design_drawings dd JOIN design_projects dp ON dd.design_project_id = dp.id WHERE dd.assigned_to_id = u.id AND dp.project_id = ${pid} AND dd.status NOT IN ('Approved','Issued','Superseded'))
            )
        `);
        queriesRun++;

        for (const user of (resourceRows.rows || []) as any[]) {
          const woCount = Number(user.wo_count || 0);
          const drawingCount = Number(user.drawing_count || 0);
          const taskCount = Number(user.task_count || 0);
          const crossModuleLoad = woCount + drawingCount + taskCount;
          const modulesCovered = (woCount > 0 ? 1 : 0) + (drawingCount > 0 ? 1 : 0) + (taskCount > 0 ? 1 : 0);

          if (modulesCovered < 2 || crossModuleLoad < 8) continue;

          const confidence = Math.min(80, 40 + crossModuleLoad * 3);
          const fingerprint = fpPred('px2_resource_contention', pid, 'user', user.user_id);
          const severity = predSev('PX2');

          const finding = await findingManager.createFinding({
            findingType: 'prediction',
            severity: 'high',
            title: `PX2 Resource Contention: ${user.username} in ${proj.name} — ${crossModuleLoad} items across ${modulesCovered} modules`,
            description: `User "${user.username}" is spread across ${modulesCovered} modules in project "${proj.name}".\nWOs: ${woCount} | Drawings: ${drawingCount} | Tasks: ${taskCount}\nTotal cross-module load: ${crossModuleLoad}\nPrediction: Resource bottleneck will slow multiple modules\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
            logicType: 'predictive',
            dataSnapshot: { userId: user.user_id, projectId: pid, woCount, drawingCount, taskCount, crossModuleLoad, modulesCovered, confidence },
            relatedEntityType: 'user',
            relatedEntityId: String(user.user_id),
          });
          if (!finding.isDuplicate) findingsCount++;

          if (!await hasOpenTask(fingerprint)) {
            const pm = await resolveProjectManager(pid);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id || finding.findingId,
              title: `[Agent] Predictive Control – Resource Contention: ${user.username} in ${proj.name}`,
              actionType: 'create_task',
              description: `User spread across ${modulesCovered} modules with ${crossModuleLoad} items.`,
              actionPayload: {
                title: `[Agent] Predictive Control – Resource Contention: ${user.username} in ${proj.name} (${crossModuleLoad} items, ${modulesCovered} modules)`,
                description: `User "${user.username}" is overloaded across modules in project "${proj.name}".\nWOs: ${woCount} | Drawings: ${drawingCount} | Tasks: ${taskCount}\nagent_severity: ${severity}\n\nConsider redistributing workload to prevent bottleneck.`,
                assignedTo: await resolveEscalation('L2', pm),
                priority: 'High',
                category: `Prediction ${fingerprint}`,
              },
              actionCategory: 'task_creation',
              logicType: 'rule_based',
              priority: 'high',
              confidence: confidence / 100,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }

      // ── PX3: Project-Wide Risk Score Trending Down ──
      const recentRunRows = await db.execute(sql`
        SELECT ar.execution_metadata
        FROM agent_runs ar
        WHERE ar.agent_key = 'project_control'
          AND ar.status = 'completed'
          AND ar.completed_at IS NOT NULL
        ORDER BY ar.completed_at DESC
        LIMIT 5
      `);
      queriesRun++;

      const recentRuns = (recentRunRows.rows || []) as any[];
      if (recentRuns.length >= 2) {
        const latestMeta = typeof recentRuns[0]?.execution_metadata === 'string'
          ? JSON.parse(recentRuns[0].execution_metadata)
          : recentRuns[0]?.execution_metadata;
        const prevMeta = typeof recentRuns[1]?.execution_metadata === 'string'
          ? JSON.parse(recentRuns[1].execution_metadata)
          : recentRuns[1]?.execution_metadata;

        if (latestMeta && prevMeta) {
          const latestFindings = Number(latestMeta.findings_detected || 0);
          const prevFindings = Number(prevMeta.findings_detected || 0);

          if (latestFindings > prevFindings * 1.3 && latestFindings >= 5 && prevFindings >= 3) {
            const increasePct = Math.round(((latestFindings - prevFindings) / prevFindings) * 100);
            const confidence = Math.min(75, 35 + increasePct / 3);
            const fingerprint = fpPred('px3_risk_trending', null, 'system', 'global');
            const severity = predSev('PX3');

            const finding = await findingManager.createFinding({
              findingType: 'prediction',
              severity: 'critical',
              title: `PX3 System-Wide Risk Trending Up: ${latestFindings} findings vs ${prevFindings} previous run (${increasePct}% increase)`,
              description: `The reactive Project Control Agent detected ${latestFindings} findings in its latest run vs ${prevFindings} in the previous run — a ${increasePct}% increase.\nThis indicates overall project control health is deteriorating.\nPrediction: Systemic issues building across projects\nConfidence: ${confidenceLabel(confidence)} (${confidence}%)`,
              logicType: 'predictive',
              dataSnapshot: { latestFindings, prevFindings, increasePct, confidence },
              relatedEntityType: 'system',
              relatedEntityId: 'global',
            });
            if (!finding.isDuplicate) findingsCount++;

            if (!await hasOpenTask(fingerprint)) {
              const insightResult = await insightManager.createInsight({
                insightType: 'trend_analysis',
                severity: 'critical',
                title: `Project Control Risk Trend: Findings increasing ${increasePct}%`,
                description: `The number of reactive findings is increasing run-over-run. Latest: ${latestFindings}, Previous: ${prevFindings}. This signals systemic deterioration requiring management review.`,
                dataSnapshot: { latestFindings, prevFindings, increasePct },
                logicType: 'predictive',
              });
              if (insightResult && !insightResult.isDuplicate) insightsCount++;

              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id || finding.findingId,
                title: `[Agent] Predictive Control – System-Wide Risk Trending Up`,
                actionType: 'create_task',
                description: `Reactive findings increased ${increasePct}% — systemic risk.`,
                actionPayload: {
                  title: `[Agent] Predictive Control – System-Wide Risk Trending Up (${increasePct}% more findings)`,
                  description: `Project Control Agent findings increased from ${prevFindings} to ${latestFindings} (${increasePct}% increase).\nThis indicates systemic project control issues are building.\nagent_severity: ${severity}\n\nRequires executive review of project portfolio health.`,
                  assignedTo: await resolveEscalation('L3', await resolveGM()),
                  priority: 'Critical',
                  category: `Prediction ${fingerprint}`,
                },
                actionCategory: 'task_creation',
                logicType: 'rule_based',
                priority: 'critical',
                confidence: confidence / 100,
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
            }
          }
        }
      }

    } catch (err: any) {
      console.error(`[PredictivePC] PX series error:`, err.message);
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
            ${payload.category || 'Prediction'},
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
        console.error(`[PredictivePC] Auto-execute error for rec ${recId}:`, err.message);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // AGENT RUN LOGGING
    // ════════════════════════════════════════════════════════════════════════
    const elapsed = Date.now() - startTime;
    const executionMetadata = {
      findings_detected: findingsCount,
      tasks_created: autoExecutedCount,
      tasks_closed: 0,
      recommendations_generated: recommendationsCount,
      insights_generated: insightsCount,
      execution_time_ms: elapsed,
      queries_run: queriesRun,
      series: ['PP1-PP3', 'PD1-PD3', 'PR1-PR3', 'PX1-PX3'],
    };

    try {
      await db.execute(sql`
        UPDATE agent_runs
        SET execution_metadata = ${JSON.stringify(executionMetadata)}::jsonb
        WHERE id = ${context.runId}
      `);
    } catch (err: any) {
      console.error(`[PredictivePC] Failed to update execution_metadata:`, err.message);
    }

    console.log(`[PredictivePC] Complete: ${findingsCount} predictions, ${recommendationsCount} recommendations, ${autoExecutedCount} auto-executed, ${insightsCount} insights. ${queriesRun} queries in ${elapsed}ms`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      autoExecutedActions: autoExecutedCount,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Predictive Project Control Agent (12-prediction model): ${findingsCount} predictions detected, ${recommendationsCount} recommendations, ${autoExecutedCount} tasks created, ${insightsCount} insights generated. Series: PP (project delay), PD (design bottleneck), PR (procurement delay), PX (cross-module risk). Execution: ${elapsed}ms.`,
    };
  }
}
