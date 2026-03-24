import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  resolveReportingManager,
  resolveGM,
  resolveDepartmentHead,
  resolveProductionManager,
  resolveQCTeamLead,
  hasOpenTask as hasOpenTaskShared,
} from './project-control-shared';

const SOURCE_AGENT = 'master_controller';
const AGENT_KEY = 'master_control';

const GOVERNED_AGENTS = [
  'project_control',
  'predictive_project_control',
  'communications',
  'finance',
  'executive_mis',
  'sales_marketing',
  'production_management',
  'quality_management',
  'administration_control',
];

const DEFAULTS = {
  superuser_id: 3,
  hr_admin_user_id: 3,
  finance_admin_user_id: 5,
  run_stuck_threshold_minutes: 30,
  run_slow_multiplier: 3.0,
  silence_min_7d_avg: 5,
  silence_consecutive_zero_days: 2,
  findings_spike_multiplier: 3.0,
  missed_run_window_hours: 26,
  task_noise_completion_threshold: 0.30,
  task_untouched_days: 7,
  global_daily_task_ceiling: 100,
  per_employee_daily_task_ceiling: 5,
  employee_overload_dominant_agent_pct: 0.60,
  effectiveness_completion_threshold: 0.30,
  effectiveness_lookback_days: 7,
};

type Cfg = typeof DEFAULTS;
function cfg(context: AgentRunContext): Cfg {
  return { ...DEFAULTS, ...(context.config || {}) };
}

function fp(type: string, entity: string, id: string | number): string {
  return `[fp:mc_${type}:${entity}:${id}]`;
}

function fpGlobal(type: string): string {
  return `[fp:mc_${type}:global]`;
}

async function hasOpenTask(fingerprint: string): Promise<boolean> {
  return hasOpenTaskShared(fingerprint, SOURCE_AGENT);
}

async function resolveFunctionHead(agentKey: string, c: Cfg): Promise<number> {
  switch (agentKey) {
    case 'project_control':
    case 'predictive_project_control':
      return await resolveGM();
    case 'finance':
      return c.finance_admin_user_id;
    case 'administration_control':
      return c.hr_admin_user_id;
    case 'sales_marketing': {
      const head = await resolveDepartmentHead('Sales');
      return head || c.superuser_id;
    }
    case 'production_management': {
      const pm = await resolveProductionManager();
      return pm || c.superuser_id;
    }
    case 'quality_management': {
      const qc = await resolveQCTeamLead();
      return qc || c.superuser_id;
    }
    case 'communications':
    case 'executive_mis':
    default:
      return c.superuser_id;
  }
}

function agentDisplayName(key: string): string {
  const names: Record<string, string> = {
    project_control: 'Project Control',
    predictive_project_control: 'Predictive Project Control',
    communications: 'Communications',
    finance: 'Finance Control',
    executive_mis: 'Executive MIS',
    sales_marketing: 'Sales & Marketing',
    production_management: 'Production Management',
    quality_management: 'Quality Management',
    administration_control: 'Administration Control',
  };
  return names[key] || key;
}

interface GovernanceAccumulator {
  total: number;
  taskCreated: number;
  escalationSent: number;
  perAgent: Record<string, number>;
  findingIds: number[];
  groupCounts: Record<string, number>;
  agentHealthScores: Record<string, number>;
}

function newAccumulator(): GovernanceAccumulator {
  return {
    total: 0, taskCreated: 0, escalationSent: 0,
    perAgent: {}, findingIds: [], groupCounts: {},
    agentHealthScores: {},
  };
}

function canCreateTask(acc: GovernanceAccumulator): boolean {
  return acc.taskCreated < 15;
}

function canEscalate(acc: GovernanceAccumulator): boolean {
  return acc.escalationSent < 5;
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closed = 0;

  const failedRunTasks = await db.execute(sql`
    SELECT t.id, t.category FROM tasks t
    WHERE t.source_type = 'agent_task' AND t.source_agent = ${SOURCE_AGENT}
      AND t.status NOT IN ('completed', 'cancelled')
      AND t.category LIKE '%[fp:mc_m1_01_failed:%'
  `);

  for (const row of (failedRunTasks.rows || []) as any[]) {
    const agentMatch = row.category?.match(/\[fp:mc_m1_01_failed:agent:(\w+)\]/);
    if (!agentMatch) continue;
    const agentKey = agentMatch[1];
    const check = await db.execute(sql`
      SELECT 1 FROM agent_runs
      WHERE agent_key = ${agentKey} AND status = 'completed'
        AND completed_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `);
    if ((check.rows || []).length > 0) {
      await db.execute(sql`UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${row.id}`);
      closed++;
    }
  }

  const stuckRunTasks = await db.execute(sql`
    SELECT t.id, t.category FROM tasks t
    WHERE t.source_type = 'agent_task' AND t.source_agent = ${SOURCE_AGENT}
      AND t.status NOT IN ('completed', 'cancelled')
      AND t.category LIKE '%[fp:mc_m1_02_stuck:%'
  `);

  for (const row of (stuckRunTasks.rows || []) as any[]) {
    const runMatch = row.category?.match(/\[fp:mc_m1_02_stuck:run:(\d+)\]/);
    if (!runMatch) continue;
    const runId = Number(runMatch[1]);
    const check = await db.execute(sql`
      SELECT status FROM agent_runs WHERE id = ${runId}
    `);
    const status = (check.rows as any[])[0]?.status;
    if (status && status !== 'running') {
      await db.execute(sql`UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${row.id}`);
      closed++;
    }
  }

  const missedRunTasks = await db.execute(sql`
    SELECT t.id, t.category FROM tasks t
    WHERE t.source_type = 'agent_task' AND t.source_agent = ${SOURCE_AGENT}
      AND t.status NOT IN ('completed', 'cancelled')
      AND t.category LIKE '%[fp:mc_m2_01_missed:%'
  `);

  for (const row of (missedRunTasks.rows || []) as any[]) {
    const agentMatch = row.category?.match(/\[fp:mc_m2_01_missed:agent:(\w+)\]/);
    if (!agentMatch) continue;
    const agentKey = agentMatch[1];
    const check = await db.execute(sql`
      SELECT 1 FROM agent_runs
      WHERE agent_key = ${agentKey} AND status = 'completed'
        AND completed_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `);
    if ((check.rows || []).length > 0) {
      await db.execute(sql`UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${row.id}`);
      closed++;
    }
  }

  return closed;
}


export class MasterControlAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Master Control Agent';
  category = 'governance';

  getSubscribedEvents(): string[] {
    return ['agent.run.failed', 'agent.run.stuck'];
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
    const acc = newAccumulator();
    const c = cfg(context);

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) console.log(`[MasterControl] Auto-closed ${autoClosedCount} resolved tasks`);
    } catch (err: any) {
      console.error(`[MasterControl] Auto-close error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BATCH DATA QUERIES
    // ════════════════════════════════════════════════════════════════════════
    let recentRuns: any[] = [];
    let historicalRuns: any[] = [];
    let registryEntries: any[] = [];
    let agentTasksToday: any[] = [];
    let agentTasksRecent: any[] = [];

    try {
      const runsResult = await db.execute(sql`
        SELECT id, agent_key, trigger_type, status, started_at, completed_at,
          findings_count, insights_count, recommendations_count,
          error_message, execution_metadata
        FROM agent_runs
        WHERE started_at >= NOW() - INTERVAL '26 hours'
        ORDER BY started_at DESC
      `);
      recentRuns = (runsResult.rows || []) as any[];
      queriesRun++;

      const histResult = await db.execute(sql`
        SELECT agent_key, status, findings_count, started_at, completed_at, execution_metadata
        FROM agent_runs
        WHERE started_at >= NOW() - INTERVAL '7 days'
          AND agent_key != ${AGENT_KEY}
        ORDER BY started_at DESC
      `);
      historicalRuns = (histResult.rows || []) as any[];
      queriesRun++;

      const regResult = await db.execute(sql`
        SELECT agent_key, display_name, is_enabled, is_suspended, default_schedule, config
        FROM agent_registry
        WHERE agent_key != ${AGENT_KEY}
      `);
      registryEntries = (regResult.rows || []) as any[];
      queriesRun++;

      const todayTasksResult = await db.execute(sql`
        SELECT id, title, assigned_to, source_agent, status, category, created_at
        FROM tasks
        WHERE source_type = 'agent_task' AND created_at::date = CURRENT_DATE
      `);
      agentTasksToday = (todayTasksResult.rows || []) as any[];
      queriesRun++;

      const recentTasksResult = await db.execute(sql`
        SELECT id, title, assigned_to, source_agent, status, category, created_at, completed_at
        FROM tasks
        WHERE source_type = 'agent_task'
          AND created_at::date >= CURRENT_DATE - INTERVAL '7 days'
      `);
      agentTasksRecent = (recentTasksResult.rows || []) as any[];
      queriesRun++;
    } catch (err: any) {
      console.error(`[MasterControl] Data query error:`, err.message);
    }

    const runsByAgent = new Map<string, any[]>();
    for (const run of recentRuns) {
      const key = run.agent_key;
      if (key === AGENT_KEY) continue;
      if (!runsByAgent.has(key)) runsByAgent.set(key, []);
      runsByAgent.get(key)!.push(run);
    }

    const historicalByAgent = new Map<string, any[]>();
    for (const run of historicalRuns) {
      if (!historicalByAgent.has(run.agent_key)) historicalByAgent.set(run.agent_key, []);
      historicalByAgent.get(run.agent_key)!.push(run);
    }

    const tasksByAgent = new Map<string, any[]>();
    for (const t of agentTasksToday) {
      if (!tasksByAgent.has(t.source_agent)) tasksByAgent.set(t.source_agent, []);
      tasksByAgent.get(t.source_agent)!.push(t);
    }

    // ════════════════════════════════════════════════════════════════════════
    // M1: AGENT RUN HEALTH MONITORING
    // ════════════════════════════════════════════════════════════════════════
    try {
      for (const agentKey of GOVERNED_AGENTS) {
        const runs = runsByAgent.get(agentKey) || [];
        const history = historicalByAgent.get(agentKey) || [];
        const displayName = agentDisplayName(agentKey);

        // M1.01: Agent run failed
        const failedRuns = runs.filter((r: any) => r.status === 'failed');
        for (const run of failedRuns) {
          const fingerprint = fp('m1_01_failed', 'agent', agentKey);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly', severity: 'critical',
            title: `M1.01 Agent run failed: ${displayName}`,
            description: `${displayName} agent run #${run.id} failed.\nError: ${run.error_message || 'unknown'}\nTrigger: ${run.trigger_type}`,
            logicType: 'rule_based',
            relatedEntityType: 'agent_run', relatedEntityId: String(run.id),
            dataSnapshot: { agentKey, runId: run.id, error: run.error_message, triggerType: run.trigger_type },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['M1'] = (acc.groupCounts['M1'] || 0) + 1;
            if (canEscalate(acc) && !(await hasOpenTask(fingerprint))) {
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Governance – Run failed: ${displayName}`,
                actionType: 'create_task', actionCategory: 'escalation',
                description: `${displayName} agent run failed. Investigate and resolve.`,
                actionPayload: {
                  title: `[Agent] Governance – FAILED: ${displayName} agent run #${run.id}`,
                  description: `${displayName} agent run #${run.id} failed.\nError: ${run.error_message || 'unknown'}\nTrigger: ${run.trigger_type}\nStarted: ${run.started_at}\n\nInvestigate the failure and ensure the agent can run successfully.`,
                  assignedTo: c.superuser_id, priority: 'Critical', category: `Governance ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.99, priority: 'urgent',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.escalationSent++; }
            }
          }
        }

        // M1.02: Agent run stuck (running > threshold)
        const stuckRuns = runs.filter((r: any) => {
          if (r.status !== 'running') return false;
          const started = new Date(r.started_at);
          const minutesElapsed = (Date.now() - started.getTime()) / 60000;
          return minutesElapsed > c.run_stuck_threshold_minutes;
        });
        for (const run of stuckRuns) {
          const minutesElapsed = Math.floor((Date.now() - new Date(run.started_at).getTime()) / 60000);
          const fingerprint = fp('m1_02_stuck', 'run', run.id);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly', severity: 'high',
            title: `M1.02 Agent stuck: ${displayName} (${minutesElapsed}min)`,
            description: `${displayName} run #${run.id} has been in "running" state for ${minutesElapsed} minutes (threshold: ${c.run_stuck_threshold_minutes}min).`,
            logicType: 'rule_based',
            relatedEntityType: 'agent_run', relatedEntityId: String(run.id),
            dataSnapshot: { agentKey, runId: run.id, minutesElapsed, threshold: c.run_stuck_threshold_minutes },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['M1'] = (acc.groupCounts['M1'] || 0) + 1;
            if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
              const functionHead = await resolveFunctionHead(agentKey, c);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Governance – Stuck run: ${displayName}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `${displayName} run appears stuck.`,
                actionPayload: {
                  title: `[Agent] Governance – Stuck: ${displayName} run #${run.id} (${minutesElapsed}min)`,
                  description: `${displayName} run #${run.id} has been running for ${minutesElapsed} minutes.\nStarted: ${run.started_at}\n\nMay need manual intervention. Check server logs for the agent.`,
                  assignedTo: c.superuser_id, priority: 'High', category: `Governance ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }

              if (functionHead !== c.superuser_id && canCreateTask(acc)) {
                const rec2 = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Governance – Stuck run notice: ${displayName}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `${displayName} run stuck — function head awareness.`,
                  actionPayload: {
                    title: `[Agent] Governance – ${displayName} agent appears stuck (${minutesElapsed}min)`,
                    description: `The ${displayName} agent run #${run.id} has been running for ${minutesElapsed} minutes without completing.\nThis may affect outputs from this agent today.`,
                    assignedTo: functionHead, priority: 'High', category: `Governance ${fingerprint}_fh`,
                  },
                  logicType: 'rule_based', confidence: 0.9, priority: 'high',
                });
                if (rec2.id > 0) { recommendationsCount++; if (rec2.autoApproved) autoExecuteQueue.push(rec2.id); acc.taskCreated++; }
              }
            }
          }
        }

        // M1.03: Agent abnormally slow (Low → insight only, no task)
        const completedRuns = runs.filter((r: any) => r.status === 'completed');
        const histCompleted = history.filter((r: any) => r.status === 'completed');
        if (completedRuns.length > 0 && histCompleted.length >= 3) {
          const avgHistMs = histCompleted.reduce((sum: number, r: any) => {
            const meta = typeof r.execution_metadata === 'string' ? JSON.parse(r.execution_metadata) : r.execution_metadata;
            return sum + (meta?.execution_time_ms || 0);
          }, 0) / histCompleted.length;

          for (const run of completedRuns) {
            const meta = typeof run.execution_metadata === 'string' ? JSON.parse(run.execution_metadata) : run.execution_metadata;
            const runMs = meta?.execution_time_ms || 0;
            if (avgHistMs > 0 && runMs > avgHistMs * c.run_slow_multiplier) {
              const fingerprint = fp('m1_03_slow', 'agent', agentKey);
              const finding = await findingManager.createFinding({
                findingType: 'threshold_breach', severity: 'low',
                title: `M1.03 Agent slow: ${displayName} (${Math.round(runMs / 1000)}s vs avg ${Math.round(avgHistMs / 1000)}s)`,
                description: `${displayName} took ${Math.round(runMs / 1000)}s — ${(runMs / avgHistMs).toFixed(1)}× its 7-day average of ${Math.round(avgHistMs / 1000)}s.`,
                logicType: 'rule_based',
                relatedEntityType: 'agent_run', relatedEntityId: String(run.id),
                dataSnapshot: { agentKey, runMs, avgMs: avgHistMs, multiplier: (runMs / avgHistMs).toFixed(1) },
              });
              if (!finding.isDuplicate) { findingsCount++; acc.findingIds.push(finding.id); acc.groupCounts['M1'] = (acc.groupCounts['M1'] || 0) + 1; }
            }
          }
        }

        // M1.04: Unexpected silence (zero findings when abnormal)
        if (completedRuns.length > 0 && histCompleted.length >= 5) {
          const latestRun = completedRuns[0];
          const latestFindings = Number(latestRun.findings_count || 0);

          if (latestFindings === 0) {
            const avg7d = histCompleted.reduce((s: number, r: any) => s + Number(r.findings_count || 0), 0) / histCompleted.length;

            if (avg7d >= c.silence_min_7d_avg) {
              const recentDays = histCompleted.slice(0, c.silence_consecutive_zero_days + 1);
              const consecutiveZeroDays = recentDays.filter((r: any) => Number(r.findings_count || 0) === 0).length;

              let hasActiveData = true;
              try {
                if (['project_control', 'predictive_project_control'].includes(agentKey)) {
                  const check = await db.execute(sql`SELECT 1 FROM projects WHERE status != 'completed' LIMIT 1`);
                  hasActiveData = (check.rows || []).length > 0;
                } else if (agentKey === 'administration_control') {
                  const check = await db.execute(sql`SELECT 1 FROM users WHERE is_active = true AND user_type = 'system_user' LIMIT 1`);
                  hasActiveData = (check.rows || []).length > 0;
                } else if (agentKey === 'finance') {
                  const check = await db.execute(sql`SELECT 1 FROM invoices WHERE status != 'paid' LIMIT 1`);
                  hasActiveData = (check.rows || []).length > 0;
                }
                queriesRun++;
              } catch { /* table may not exist, assume active data */ }

              if (consecutiveZeroDays >= c.silence_consecutive_zero_days && hasActiveData) {
                const severity = 'medium' as const;
                const fingerprint = fp('m1_04_silence', 'agent', agentKey);
                const finding = await findingManager.createFinding({
                  findingType: 'anomaly', severity,
                  title: `M1.04 Unexpected silence: ${displayName} (${consecutiveZeroDays} zero-days, avg ${avg7d.toFixed(1)})`,
                  description: `${displayName} produced 0 findings for ${consecutiveZeroDays} consecutive days despite a 7-day average of ${avg7d.toFixed(1)} findings. Active data confirmed in its domain.`,
                  logicType: 'rule_based',
                  relatedEntityType: 'agent', relatedEntityId: agentKey,
                  dataSnapshot: { agentKey, consecutiveZeroDays, avg7d, hasActiveData },
                });
                if (!finding.isDuplicate) {
                  findingsCount++;
                  acc.findingIds.push(finding.id);
                  acc.groupCounts['M1'] = (acc.groupCounts['M1'] || 0) + 1;
                  if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
                    const functionHead = await resolveFunctionHead(agentKey, c);
                    const rec = await recommendationManager.createRecommendation({
                      findingId: finding.id, title: `[Agent] Governance – Silence: ${displayName}`,
                      actionType: 'create_task', actionCategory: 'task_creation',
                      description: `${displayName} unexpectedly silent.`,
                      actionPayload: {
                        title: `[Agent] Governance – Unexpected silence: ${displayName} (${consecutiveZeroDays}d zero findings)`,
                        description: `${displayName} has produced 0 findings for ${consecutiveZeroDays} consecutive days.\n7-day average: ${avg7d.toFixed(1)} findings/run.\nActive data exists in its domain.\n\nPlease investigate — the agent may have a query issue or data access problem.`,
                        assignedTo: functionHead, priority: 'Medium', category: `Governance ${fingerprint}`,
                      },
                      logicType: 'rule_based', confidence: 0.8, priority: 'normal',
                    });
                    if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }
                  }
                }
              } else if (latestFindings === 0 && avg7d >= c.silence_min_7d_avg) {
                const fingerprint = fp('m1_04_silence_low', 'agent', agentKey);
                const finding = await findingManager.createFinding({
                  findingType: 'anomaly', severity: 'low',
                  title: `M1.04 Zero findings: ${displayName} (1 day, avg ${avg7d.toFixed(1)})`,
                  description: `${displayName} produced 0 findings today (7d avg: ${avg7d.toFixed(1)}). Monitoring for consecutive pattern.`,
                  logicType: 'rule_based',
                  relatedEntityType: 'agent', relatedEntityId: agentKey,
                  dataSnapshot: { agentKey, avg7d },
                });
                if (!finding.isDuplicate) { findingsCount++; acc.findingIds.push(finding.id); acc.groupCounts['M1'] = (acc.groupCounts['M1'] || 0) + 1; }
              }
            }
          }
        }

        // M1.05: Abnormally high findings (>3× average)
        if (completedRuns.length > 0 && histCompleted.length >= 3) {
          const avg7d = histCompleted.reduce((s: number, r: any) => s + Number(r.findings_count || 0), 0) / histCompleted.length;
          for (const run of completedRuns) {
            const count = Number(run.findings_count || 0);
            if (avg7d > 2 && count > avg7d * c.findings_spike_multiplier) {
              const fingerprint = fp('m1_05_spike', 'agent', agentKey);
              const finding = await findingManager.createFinding({
                findingType: 'anomaly', severity: 'high',
                title: `M1.05 Finding spike: ${displayName} (${count} vs avg ${avg7d.toFixed(1)})`,
                description: `${displayName} produced ${count} findings — ${(count / avg7d).toFixed(1)}× its 7-day average of ${avg7d.toFixed(1)}. May indicate a data issue or agent misconfiguration.`,
                logicType: 'rule_based',
                relatedEntityType: 'agent_run', relatedEntityId: String(run.id),
                dataSnapshot: { agentKey, count, avg7d, multiplier: (count / avg7d).toFixed(1) },
              });
              if (!finding.isDuplicate) {
                findingsCount++;
                acc.findingIds.push(finding.id);
                acc.groupCounts['M1'] = (acc.groupCounts['M1'] || 0) + 1;
                if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
                  const functionHead = await resolveFunctionHead(agentKey, c);
                  const rec = await recommendationManager.createRecommendation({
                    findingId: finding.id, title: `[Agent] Governance – Finding spike: ${displayName}`,
                    actionType: 'create_task', actionCategory: 'task_creation',
                    description: `${displayName} produced abnormally high findings.`,
                    actionPayload: {
                      title: `[Agent] Governance – Finding spike: ${displayName} (${count} findings, ${(count / avg7d).toFixed(1)}× avg)`,
                      description: `${displayName} produced ${count} findings vs 7-day average of ${avg7d.toFixed(1)}.\nThis may indicate:\n- A genuine data quality issue in its domain\n- Agent misconfiguration or threshold drift\n- Bulk data import or system change\n\nReview the agent's latest findings and verify accuracy.`,
                      assignedTo: c.superuser_id, priority: 'High', category: `Governance ${fingerprint}`,
                    },
                    logicType: 'rule_based', confidence: 0.85, priority: 'high',
                  });
                  if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }

                  if (functionHead !== c.superuser_id && canCreateTask(acc)) {
                    const rec2 = await recommendationManager.createRecommendation({
                      findingId: finding.id, title: `[Agent] Governance – Spike notice: ${displayName}`,
                      actionType: 'create_task', actionCategory: 'task_creation',
                      description: `High finding volume from ${displayName}.`,
                      actionPayload: {
                        title: `[Agent] Governance – ${displayName} spike: ${count} findings (review domain data)`,
                        description: `The ${displayName} agent produced ${count} findings today — significantly above normal.\nPlease review your domain data for recent bulk changes or anomalies.`,
                        assignedTo: functionHead, priority: 'High', category: `Governance ${fingerprint}_fh`,
                      },
                      logicType: 'rule_based', confidence: 0.85, priority: 'high',
                    });
                    if (rec2.id > 0) { recommendationsCount++; if (rec2.autoApproved) autoExecuteQueue.push(rec2.id); acc.taskCreated++; }
                  }
                }
              }
            }
          }
        }

        // Agent health score for insight
        const totalRuns = history.filter((r: any) => r.agent_key === agentKey).length;
        const failedTotal = history.filter((r: any) => r.agent_key === agentKey && r.status === 'failed').length;
        const successRate = totalRuns > 0 ? ((totalRuns - failedTotal) / totalRuns) * 100 : 100;
        acc.agentHealthScores[agentKey] = Math.round(successRate);
      }
    } catch (err: any) {
      console.error(`[MasterControl] M1 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // M2: MISSED & SKIPPED RUNS
    // ════════════════════════════════════════════════════════════════════════
    try {
      for (const reg of registryEntries) {
        const agentKey = reg.agent_key;
        if (!GOVERNED_AGENTS.includes(agentKey)) continue;
        const displayName = agentDisplayName(agentKey);

        // M2.01: Scheduled agent missed run
        if (reg.is_enabled && !reg.is_suspended) {
          const runs = runsByAgent.get(agentKey) || [];
          const completedRecently = runs.some((r: any) => r.status === 'completed');
          const runningNow = runs.some((r: any) => r.status === 'running');

          if (!completedRecently && !runningNow) {
            const fingerprint = fp('m2_01_missed', 'agent', agentKey);
            const finding = await findingManager.createFinding({
              findingType: 'gap', severity: 'high',
              title: `M2.01 Missed run: ${displayName}`,
              description: `${displayName} has no completed run in the last ${c.missed_run_window_hours} hours. Schedule: ${reg.default_schedule || 'unknown'}`,
              logicType: 'rule_based',
              relatedEntityType: 'agent', relatedEntityId: agentKey,
              dataSnapshot: { agentKey, schedule: reg.default_schedule, windowHours: c.missed_run_window_hours },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['M2'] = (acc.groupCounts['M2'] || 0) + 1;
              if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Governance – Missed run: ${displayName}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `${displayName} missed its scheduled run.`,
                  actionPayload: {
                    title: `[Agent] Governance – Missed run: ${displayName} (no run in ${c.missed_run_window_hours}h)`,
                    description: `${displayName} has no completed run in the last ${c.missed_run_window_hours} hours.\nSchedule: ${reg.default_schedule}\n\nCheck scheduler logs and verify the agent can execute.`,
                    assignedTo: c.superuser_id, priority: 'High', category: `Governance ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.9, priority: 'high',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }
              }
            }
          }
        }

        // M2.02: Agent disabled (Low → insight only)
        if (!reg.is_enabled) {
          const fingerprint = fp('m2_02_disabled', 'agent', agentKey);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'low',
            title: `M2.02 Agent disabled: ${displayName}`,
            description: `${displayName} is currently disabled. Its monitoring capabilities are inactive.`,
            logicType: 'rule_based',
            relatedEntityType: 'agent', relatedEntityId: agentKey,
            dataSnapshot: { agentKey, isEnabled: false },
          });
          if (!finding.isDuplicate) { findingsCount++; acc.findingIds.push(finding.id); acc.groupCounts['M2'] = (acc.groupCounts['M2'] || 0) + 1; }
        }

        // M2.03: Agent suspended (Low → insight only)
        if (reg.is_suspended) {
          const fingerprint = fp('m2_03_suspended', 'agent', agentKey);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'low',
            title: `M2.03 Agent suspended: ${displayName}`,
            description: `${displayName} is currently suspended. Scheduled runs are blocked.`,
            logicType: 'rule_based',
            relatedEntityType: 'agent', relatedEntityId: agentKey,
            dataSnapshot: { agentKey, isSuspended: true },
          });
          if (!finding.isDuplicate) { findingsCount++; acc.findingIds.push(finding.id); acc.groupCounts['M2'] = (acc.groupCounts['M2'] || 0) + 1; }
        }
      }
    } catch (err: any) {
      console.error(`[MasterControl] M2 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // M3: CROSS-AGENT CONFLICT & DUPLICATION
    // ════════════════════════════════════════════════════════════════════════
    try {
      const entityAgentMap = new Map<string, { agents: Set<string>; tasks: any[] }>();
      for (const task of agentTasksRecent) {
        if (!task.source_agent || !task.category) continue;
        const fpMatch = task.category.match(/\[fp:\w+_([a-z]\d+_\d+)_\w+:(?:user|project|work_order|inspection|loan|advance|payroll|leave|visa|trip):(\w+)\]/);
        if (!fpMatch) continue;
        const entityKey = `${fpMatch[1]}:${fpMatch[2]}`;
        if (!entityAgentMap.has(entityKey)) entityAgentMap.set(entityKey, { agents: new Set(), tasks: [] });
        const entry = entityAgentMap.get(entityKey)!;
        entry.agents.add(task.source_agent);
        entry.tasks.push(task);
      }

      const userEntityMap = new Map<string, { agents: Set<string>; tasks: any[] }>();
      for (const task of agentTasksRecent) {
        if (!task.source_agent || !task.category) continue;
        const userMatch = task.category.match(/user:(\d+)/);
        if (!userMatch) continue;
        const userKey = `user:${userMatch[1]}`;
        if (!userEntityMap.has(userKey)) userEntityMap.set(userKey, { agents: new Set(), tasks: [] });
        const entry = userEntityMap.get(userKey)!;
        entry.agents.add(task.source_agent);
        entry.tasks.push(task);
      }

      // M3.01: Duplicate actions — same entity, same action pattern, different agents (Low → insight only)
      for (const [entityKey, entry] of entityAgentMap) {
        if (entry.agents.size < 2) continue;
        const agentList = Array.from(entry.agents);
        const fingerprint = fp('m3_01_duplicate', 'entity', entityKey.replace(/[^a-zA-Z0-9]/g, '_'));
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'low',
          title: `M3.01 Duplicate actions: ${agentList.map(a => agentDisplayName(a)).join(' + ')} on ${entityKey}`,
          description: `Multiple agents (${agentList.join(', ')}) created tasks for the same entity: ${entityKey}. ${entry.tasks.length} total tasks.`,
          logicType: 'rule_based',
          relatedEntityType: 'cross_agent', relatedEntityId: entityKey,
          dataSnapshot: { entityKey, agents: agentList, taskCount: entry.tasks.length },
        });
        if (!finding.isDuplicate) { findingsCount++; acc.findingIds.push(finding.id); acc.groupCounts['M3'] = (acc.groupCounts['M3'] || 0) + 1; }
      }

      // M3.03: Contradictory actions detection
      // Look for cases where one agent creates a "complete/close" action and another creates a "investigate/escalate" on same entity
      const contradictionPatterns = [
        { positive: /complete|close|resolve|auto-close/i, negative: /escalat|investigate|review|urgent/i },
      ];
      for (const [userKey, entry] of userEntityMap) {
        if (entry.agents.size < 2) continue;
        const titles = entry.tasks.map((t: any) => ({ title: t.title, agent: t.source_agent }));
        for (const pattern of contradictionPatterns) {
          const positiveTasks = titles.filter(t => pattern.positive.test(t.title));
          const negativeTasks = titles.filter(t => pattern.negative.test(t.title));
          if (positiveTasks.length > 0 && negativeTasks.length > 0) {
            const posAgents = [...new Set(positiveTasks.map(t => t.agent))];
            const negAgents = [...new Set(negativeTasks.map(t => t.agent))];
            const hasConflict = posAgents.some(a => !negAgents.includes(a)) || negAgents.some(a => !posAgents.includes(a));
            if (!hasConflict) continue;
            const userId = userKey.split(':')[1];
            const fingerprint = fp('m3_03_contradict', 'user', userId);
            const finding = await findingManager.createFinding({
              findingType: 'mismatch', severity: 'high',
              title: `M3.03 Contradictory actions on user #${userId}`,
              description: `Agents are issuing contradictory directives for user #${userId}:\n- ${posAgents.map(a => agentDisplayName(a)).join(', ')}: suggest closing/completing\n- ${negAgents.map(a => agentDisplayName(a)).join(', ')}: suggest investigating/escalating`,
              logicType: 'rule_based',
              relatedEntityType: 'user', relatedEntityId: userId,
              dataSnapshot: { userId, positiveAgents: posAgents, negativeAgents: negAgents },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['M3'] = (acc.groupCounts['M3'] || 0) + 1;
              if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Governance – Contradiction on user #${userId}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `Conflicting agent recommendations.`,
                  actionPayload: {
                    title: `[Agent] Governance – Contradictory agent actions on user #${userId}`,
                    description: `Different agents are issuing conflicting directives for user #${userId}:\n\nClose/Complete direction:\n${positiveTasks.map(t => `  [${agentDisplayName(t.agent)}] ${t.title}`).join('\n')}\n\nInvestigate/Escalate direction:\n${negativeTasks.map(t => `  [${agentDisplayName(t.agent)}] ${t.title}`).join('\n')}\n\nPlease resolve which direction is correct and adjust agent policies if needed.`,
                    assignedTo: c.superuser_id, priority: 'High', category: `Governance ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.85, priority: 'high',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }
              }
            }
            break;
          }
        }
      }
    } catch (err: any) {
      console.error(`[MasterControl] M3 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // M4: TASK VOLUME & NOISE CONTROL
    // ════════════════════════════════════════════════════════════════════════
    try {
      // M4.01: Agent exceeded daily task creation cap
      for (const [agentKey, tasks] of tasksByAgent) {
        if (agentKey === SOURCE_AGENT) continue;
        const displayName = agentDisplayName(agentKey);
        const policyResult = await db.execute(sql`
          SELECT max_actions_per_day FROM agent_policies
          WHERE agent_key = ${agentKey} AND action_category = 'task_creation'
          LIMIT 1
        `);
        queriesRun++;
        const maxPerDay = Number((policyResult.rows as any[])[0]?.max_actions_per_day || 50);

        if (tasks.length > maxPerDay) {
          const fingerprint = fp('m4_01_cap_breach', 'agent', agentKey);
          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach', severity: 'high',
            title: `M4.01 Task cap breached: ${displayName} (${tasks.length}/${maxPerDay})`,
            description: `${displayName} created ${tasks.length} tasks today, exceeding its daily limit of ${maxPerDay}.`,
            logicType: 'rule_based',
            relatedEntityType: 'agent', relatedEntityId: agentKey,
            dataSnapshot: { agentKey, created: tasks.length, limit: maxPerDay },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['M4'] = (acc.groupCounts['M4'] || 0) + 1;
            if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Governance – Task cap breached: ${displayName}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `${displayName} exceeded daily task limit.`,
                actionPayload: {
                  title: `[Agent] Governance – ${displayName} exceeded task cap (${tasks.length}/${maxPerDay})`,
                  description: `${displayName} created ${tasks.length} tasks today (limit: ${maxPerDay}).\n\nThis may indicate a configuration issue or genuine spike in problems. Review the agent's thresholds and recent findings.`,
                  assignedTo: c.superuser_id, priority: 'High', category: `Governance ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }
            }
          }
        }
      }

      // M4.02: Low task completion rate (Low → insight only)
      const agentTaskStats = new Map<string, { total: number; completed: number }>();
      for (const task of agentTasksRecent) {
        if (!task.source_agent || task.source_agent === SOURCE_AGENT) continue;
        if (!agentTaskStats.has(task.source_agent)) agentTaskStats.set(task.source_agent, { total: 0, completed: 0 });
        const stats = agentTaskStats.get(task.source_agent)!;
        stats.total++;
        if (task.status === 'completed') stats.completed++;
      }
      for (const [agentKey, stats] of agentTaskStats) {
        if (stats.total < 5) continue;
        const rate = stats.completed / stats.total;
        if (rate < c.task_noise_completion_threshold) {
          const displayName = agentDisplayName(agentKey);
          const fingerprint = fp('m4_02_low_completion', 'agent', agentKey);
          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach', severity: 'low',
            title: `M4.02 Low completion: ${displayName} (${(rate * 100).toFixed(0)}% of ${stats.total} tasks)`,
            description: `Only ${stats.completed}/${stats.total} tasks (${(rate * 100).toFixed(0)}%) created by ${displayName} in the last 7 days were completed. Threshold: ${(c.task_noise_completion_threshold * 100).toFixed(0)}%.`,
            logicType: 'rule_based',
            relatedEntityType: 'agent', relatedEntityId: agentKey,
            dataSnapshot: { agentKey, total: stats.total, completed: stats.completed, rate: (rate * 100).toFixed(1) },
          });
          if (!finding.isDuplicate) { findingsCount++; acc.findingIds.push(finding.id); acc.groupCounts['M4'] = (acc.groupCounts['M4'] || 0) + 1; }
        }
      }

      // M4.03: Agent tasks untouched >7 days (Low → insight only)
      const untouchedResult = await db.execute(sql`
        SELECT source_agent, COUNT(*) as cnt
        FROM tasks
        WHERE source_type = 'agent_task'
          AND status = 'pending'
          AND created_at::date <= CURRENT_DATE - INTERVAL '7 days'
          AND source_agent != ${SOURCE_AGENT}
        GROUP BY source_agent
        HAVING COUNT(*) >= 3
      `);
      queriesRun++;
      for (const row of (untouchedResult.rows || []) as any[]) {
        const agentKey = row.source_agent;
        const count = Number(row.cnt);
        const displayName = agentDisplayName(agentKey);
        const fingerprint = fp('m4_03_untouched', 'agent', agentKey);
        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'low',
          title: `M4.03 Untouched tasks: ${displayName} (${count} tasks >7d)`,
          description: `${count} tasks from ${displayName} have been pending for over 7 days without any action.`,
          logicType: 'rule_based',
          relatedEntityType: 'agent', relatedEntityId: agentKey,
          dataSnapshot: { agentKey, untouchedCount: count },
        });
        if (!finding.isDuplicate) { findingsCount++; acc.findingIds.push(finding.id); acc.groupCounts['M4'] = (acc.groupCounts['M4'] || 0) + 1; }
      }

      // M4.04: Global daily task ceiling breached
      const totalAgentTasksToday = agentTasksToday.filter(t => t.source_agent !== SOURCE_AGENT).length;
      if (totalAgentTasksToday > c.global_daily_task_ceiling) {
        const fingerprint = fpGlobal('m4_04_global_ceiling');
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'high',
          title: `M4.04 Global task ceiling breached (${totalAgentTasksToday}/${c.global_daily_task_ceiling})`,
          description: `All agents combined created ${totalAgentTasksToday} tasks today, exceeding the global ceiling of ${c.global_daily_task_ceiling}.`,
          logicType: 'rule_based',
          dataSnapshot: { total: totalAgentTasksToday, ceiling: c.global_daily_task_ceiling },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['M4'] = (acc.groupCounts['M4'] || 0) + 1;
          if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: '[Agent] Governance – Global task ceiling breached',
              actionType: 'create_task', actionCategory: 'task_creation',
              description: `System-wide agent task volume too high.`,
              actionPayload: {
                title: `[Agent] Governance – Global task ceiling breached (${totalAgentTasksToday}/${c.global_daily_task_ceiling})`,
                description: `All agents combined created ${totalAgentTasksToday} tasks today (ceiling: ${c.global_daily_task_ceiling}).\n\nBreakdown by agent:\n${Array.from(tasksByAgent.entries()).filter(([k]) => k !== SOURCE_AGENT).map(([k, t]) => `  ${agentDisplayName(k)}: ${t.length}`).join('\n')}\n\nReview agent thresholds and consider adjusting.`,
                assignedTo: c.superuser_id, priority: 'High', category: `Governance ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.9, priority: 'high',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }
          }
        }
      }

      // M4.05: Single employee overloaded
      const employeeTaskCount = new Map<number, { total: number; byAgent: Record<string, number> }>();
      for (const task of agentTasksToday) {
        if (!task.assigned_to || task.source_agent === SOURCE_AGENT) continue;
        const empId = Number(task.assigned_to);
        if (!employeeTaskCount.has(empId)) employeeTaskCount.set(empId, { total: 0, byAgent: {} });
        const entry = employeeTaskCount.get(empId)!;
        entry.total++;
        entry.byAgent[task.source_agent] = (entry.byAgent[task.source_agent] || 0) + 1;
      }

      for (const [empId, entry] of employeeTaskCount) {
        if (entry.total <= c.per_employee_daily_task_ceiling) continue;
        const fingerprint = fp('m4_05_overload', 'user', empId);
        const agentBreakdown = Object.entries(entry.byAgent).sort((a, b) => b[1] - a[1]);
        const dominantAgent = agentBreakdown[0];
        const dominantPct = dominantAgent ? dominantAgent[1] / entry.total : 0;

        let empNameResult;
        try {
          empNameResult = await db.execute(sql`
            SELECT first_name, last_name, username, reporting_manager_id FROM users WHERE id = ${empId}
          `);
          queriesRun++;
        } catch { continue; }
        const emp = (empNameResult.rows as any[])[0];
        if (!emp) continue;
        const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.username;

        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'medium',
          title: `M4.05 Employee overloaded: ${empName} (${entry.total} agent tasks today)`,
          description: `${empName} received ${entry.total} agent-generated tasks today (ceiling: ${c.per_employee_daily_task_ceiling}).\nBreakdown: ${agentBreakdown.map(([a, c]) => `${agentDisplayName(a)}: ${c}`).join(', ')}`,
          logicType: 'rule_based',
          relatedEntityType: 'user', relatedEntityId: String(empId),
          dataSnapshot: { userId: empId, total: entry.total, byAgent: entry.byAgent },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['M4'] = (acc.groupCounts['M4'] || 0) + 1;
          if (canCreateTask(acc) && !(await hasOpenTask(fingerprint))) {
            const assignTo = emp.reporting_manager_id ? Number(emp.reporting_manager_id) : c.hr_admin_user_id;
            let dominantNote = '';
            if (dominantAgent && dominantPct >= c.employee_overload_dominant_agent_pct) {
              const domFH = await resolveFunctionHead(dominantAgent[0], c);
              const domFHResult = await db.execute(sql`SELECT first_name, last_name, username FROM users WHERE id = ${domFH}`);
              const domFHUser = (domFHResult.rows as any[])[0];
              const domFHName = domFHUser ? `${domFHUser.first_name || ''} ${domFHUser.last_name || ''}`.trim() || domFHUser.username : `User #${domFH}`;
              dominantNote = `\n\nNote: ${agentDisplayName(dominantAgent[0])} contributes ${(dominantPct * 100).toFixed(0)}% of these tasks. Function head for visibility: ${domFHName} (ID: ${domFH}).`;
            }
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: `[Agent] Governance – Employee overload: ${empName}`,
              actionType: 'create_task', actionCategory: 'task_creation',
              description: `${empName} receiving too many agent tasks.`,
              actionPayload: {
                title: `[Agent] Governance – Employee overloaded: ${empName} (${entry.total} tasks today)`,
                description: `${empName} received ${entry.total} agent-generated tasks today (ceiling: ${c.per_employee_daily_task_ceiling}).\n\nBreakdown:\n${agentBreakdown.map(([a, cnt]) => `  ${agentDisplayName(a)}: ${cnt}`).join('\n')}${dominantNote}\n\nConsider prioritizing or consolidating tasks for this employee.`,
                assignedTo: assignTo, priority: 'Medium', category: `Governance ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.85, priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); acc.taskCreated++; }
          }
        }
      }

    } catch (err: any) {
      console.error(`[MasterControl] M4 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // INSIGHTS
    // ════════════════════════════════════════════════════════════════════════
    try {
      const agentScoreEntries = Object.entries(acc.agentHealthScores);
      const overallScore = agentScoreEntries.length > 0
        ? Math.round(agentScoreEntries.reduce((s, [, v]) => s + v, 0) / agentScoreEntries.length)
        : 100;

      const insight1 = await insightManager.createInsight({
        findingIds: acc.findingIds.slice(0, 50),
        insightType: 'summary',
        title: 'Agent System Health Score',
        content: `Overall Agent Health: ${overallScore}/100\n` +
          `Total Governance Findings: ${findingsCount}\n` +
          `Groups: M1(Run Health): ${acc.groupCounts['M1'] || 0}, M2(Missed Runs): ${acc.groupCounts['M2'] || 0}, M3(Conflicts): ${acc.groupCounts['M3'] || 0}, M4(Noise): ${acc.groupCounts['M4'] || 0}\n\n` +
          `Per-Agent Health (7-day success rate):\n` +
          agentScoreEntries.map(([k, v]) => `  ${agentDisplayName(k)}: ${v}%`).join('\n') +
          `\n\nAgent Tasks Today: ${agentTasksToday.filter(t => t.source_agent !== SOURCE_AGENT).length}` +
          `\nGlobal Ceiling: ${c.global_daily_task_ceiling}`,
        logicType: 'rule_based',
        dataSources: ['agent_runs', 'agent_registry', 'tasks', 'agent_findings'],
        scopePeriod: new Date().toISOString().slice(0, 10),
      });
      if (!insight1.isDuplicate) insightsCount++;
    } catch (err: any) {
      console.error(`[MasterControl] Insight error:`, err.message);
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
            ${payload.category || 'Governance'},
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
        console.error(`[MasterControl] Auto-execute error for rec ${recId}:`, err.message);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // EXECUTION METADATA
    // ════════════════════════════════════════════════════════════════════════
    const elapsed = Date.now() - startTime;
    const executionMetadata = {
      findings_detected: findingsCount,
      tasks_created: autoExecutedCount,
      tasks_closed: autoClosedCount,
      recommendations_generated: recommendationsCount,
      insights_generated: insightsCount,
      execution_time_ms: elapsed,
      queries_run: queriesRun,
      group_counts: acc.groupCounts,
      agent_health_scores: acc.agentHealthScores,
      daily_caps: { tasks: `${acc.taskCreated}/15`, escalations: `${acc.escalationSent}/5` },
      governed_agents: GOVERNED_AGENTS.length,
      modules: ['M1-M4'],
    };

    try {
      await db.execute(sql`
        UPDATE agent_runs
        SET execution_metadata = ${JSON.stringify(executionMetadata)}::jsonb
        WHERE id = ${context.runId}
      `);
    } catch (err: any) {
      console.error(`[MasterControl] Failed to update execution_metadata:`, err.message);
    }

    console.log(`[MasterControl] Complete: ${findingsCount} findings, ${recommendationsCount} recommendations, ${insightsCount} insights, ${autoExecutedCount} tasks created, ${autoClosedCount} auto-closed, ${queriesRun} queries in ${elapsed}ms`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      autoExecutedActions: autoExecutedCount,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Master Control Agent (V1 — M1-M4): ${findingsCount} findings, ${recommendationsCount} recommendations, ${insightsCount} insights, ${autoExecutedCount} tasks created, ${autoClosedCount} auto-closed. Groups: M1(Run Health), M2(Missed Runs), M3(Conflicts), M4(Noise/Effectiveness). Governing ${GOVERNED_AGENTS.length} agents. Execution: ${elapsed}ms.`,
    };
  }
}
