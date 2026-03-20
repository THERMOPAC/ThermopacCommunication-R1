import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { InsightManager } from '../framework/insight-manager';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const AGENT_KEY = 'advisor';

const ALL_AGENTS = [
  'project_control',
  'predictive_project_control',
  'communications',
  'finance',
  'executive_mis',
  'sales_marketing',
  'production_management',
  'quality_management',
  'administration_control',
  'master_control',
];

const AGENT_NAMES: Record<string, string> = {
  project_control: 'Project Control',
  predictive_project_control: 'Predictive Project Control',
  communications: 'Communications',
  finance: 'Finance Control',
  executive_mis: 'Executive MIS',
  sales_marketing: 'Sales & Marketing',
  production_management: 'Production Management',
  quality_management: 'Quality Management',
  administration_control: 'Administration Control',
  master_control: 'Master Control',
};

const AGENT_DOMAINS: Record<string, string> = {
  project_control: 'Project schedules & work orders',
  predictive_project_control: 'Project risk forecasting',
  communications: 'Task follow-ups & activity compliance',
  finance: 'Invoicing, payments & receivables',
  executive_mis: 'Cross-module KPI reporting',
  sales_marketing: 'Sales pipeline & lead management',
  production_management: 'Shop floor & production ops',
  quality_management: 'Inspections, calibration & welding',
  administration_control: 'HR, payroll & employee compliance',
  master_control: 'Agent system governance',
};

interface AgentStatus {
  key: string;
  name: string;
  domain: string;
  lastRunStatus: string | null;
  lastRunTime: string | null;
  findingsToday: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  openTasks: number;
  overdueTasks: number;
  ran: boolean;
  healthy: boolean;
}

interface Issue {
  title: string;
  why: string;
  severity: 'critical' | 'high' | 'medium';
  agents: string[];
  count: number;
}

interface Action {
  text: string;
  owner: string;
  priority: 'critical' | 'high' | 'medium';
}

function cfg(context: AgentRunContext) {
  return { superuser_id: 3, ...(context.config || {}) };
}

async function resolveUserName(userId: number): Promise<string> {
  try {
    const result = await db.execute(sql`
      SELECT first_name, last_name, username FROM users WHERE id = ${userId} LIMIT 1
    `);
    const u = (result.rows as any[])[0];
    if (!u) return `User #${userId}`;
    return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
  } catch {
    return `User #${userId}`;
  }
}

export class AdvisorAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Advisor Agent';
  category = 'intelligence';

  getSubscribedEvents(): string[] {
    return [];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let queriesRun = 0;
    let insightsCount = 0;
    const c = cfg(context);
    const insightManager = new InsightManager(context.runId, this.key);

    const agentStatuses: AgentStatus[] = [];
    const issues: Issue[] = [];
    const actions: Action[] = [];
    const findingIds: number[] = [];

    try {
      const runsResult = await db.execute(sql`
        SELECT agent_key, status, started_at, completed_at, findings_count, error_message,
          execution_metadata
        FROM agent_runs
        WHERE started_at >= NOW() - INTERVAL '26 hours'
          AND agent_key != ${AGENT_KEY}
        ORDER BY started_at DESC
      `);
      queriesRun++;

      const latestRunByAgent = new Map<string, any>();
      for (const row of (runsResult.rows || []) as any[]) {
        if (!latestRunByAgent.has(row.agent_key)) {
          latestRunByAgent.set(row.agent_key, row);
        }
      }

      const findingsResult = await db.execute(sql`
        SELECT id, agent_key, severity, title, finding_type, related_entity_type
        FROM agent_findings
        WHERE created_at >= NOW() - INTERVAL '26 hours'
          AND agent_key != ${AGENT_KEY}
        ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          created_at DESC
      `);
      queriesRun++;

      const findingsByAgent = new Map<string, any[]>();
      for (const f of (findingsResult.rows || []) as any[]) {
        if (!findingsByAgent.has(f.agent_key)) findingsByAgent.set(f.agent_key, []);
        findingsByAgent.get(f.agent_key)!.push(f);
        findingIds.push(Number(f.id));
      }

      const openTasksResult = await db.execute(sql`
        SELECT source_agent, assigned_to, status, due_date, created_at
        FROM tasks
        WHERE source_type = 'agent_task'
          AND status NOT IN ('completed', 'cancelled')
          AND source_agent IS NOT NULL
      `);
      queriesRun++;

      const tasksByAgent = new Map<string, { open: number; overdue: number; assignees: Map<number, number> }>();
      for (const t of (openTasksResult.rows || []) as any[]) {
        const agent = t.source_agent;
        if (!tasksByAgent.has(agent)) tasksByAgent.set(agent, { open: 0, overdue: 0, assignees: new Map() });
        const entry = tasksByAgent.get(agent)!;
        entry.open++;
        if (t.due_date && new Date(t.due_date) < new Date()) entry.overdue++;
        if (t.assigned_to) {
          const aid = Number(t.assigned_to);
          entry.assignees.set(aid, (entry.assignees.get(aid) || 0) + 1);
        }
      }

      for (const agentKey of ALL_AGENTS) {
        const run = latestRunByAgent.get(agentKey);
        const findings = findingsByAgent.get(agentKey) || [];
        const tasks = tasksByAgent.get(agentKey) || { open: 0, overdue: 0, assignees: new Map() };

        const critCount = findings.filter((f: any) => f.severity === 'critical').length;
        const highCount = findings.filter((f: any) => f.severity === 'high').length;
        const medCount = findings.filter((f: any) => f.severity === 'medium').length;
        const lowCount = findings.filter((f: any) => f.severity === 'low').length;

        const ran = !!run;
        const healthy = ran && run.status === 'completed' && critCount === 0;

        agentStatuses.push({
          key: agentKey,
          name: AGENT_NAMES[agentKey] || agentKey,
          domain: AGENT_DOMAINS[agentKey] || '',
          lastRunStatus: run?.status || null,
          lastRunTime: run?.completed_at || run?.started_at || null,
          findingsToday: findings.length,
          criticalFindings: critCount,
          highFindings: highCount,
          mediumFindings: medCount,
          lowFindings: lowCount,
          openTasks: tasks.open,
          overdueTasks: tasks.overdue,
          ran,
          healthy,
        });
      }

      const failedAgents = agentStatuses.filter(a => a.ran && a.lastRunStatus === 'failed');
      if (failedAgents.length > 0) {
        issues.push({
          title: `${failedAgents.length} agent(s) failed to run: ${failedAgents.map(a => a.name).join(', ')}`,
          why: 'Agent execution error — possibly a code bug, database timeout, or schema change.',
          severity: 'critical',
          agents: failedAgents.map(a => a.key),
          count: failedAgents.length,
        });
      }

      const missedAgents = agentStatuses.filter(a => !a.ran);
      if (missedAgents.length > 0) {
        issues.push({
          title: `${missedAgents.length} agent(s) did not run in the last 26 hours: ${missedAgents.map(a => a.name).join(', ')}`,
          why: 'Scheduler may not have triggered, or the agent is disabled/suspended.',
          severity: 'high',
          agents: missedAgents.map(a => a.key),
          count: missedAgents.length,
        });
      }

      const criticalAgents = agentStatuses.filter(a => a.criticalFindings > 0);
      if (criticalAgents.length > 0) {
        const totalCrit = criticalAgents.reduce((s, a) => s + a.criticalFindings, 0);
        issues.push({
          title: `${totalCrit} critical finding(s) from ${criticalAgents.map(a => a.name).join(', ')}`,
          why: `Critical issues detected in: ${criticalAgents.map(a => a.domain).join('; ')}.`,
          severity: 'critical',
          agents: criticalAgents.map(a => a.key),
          count: totalCrit,
        });
      }

      const highFindingAgents = agentStatuses.filter(a => a.highFindings >= 3);
      if (highFindingAgents.length > 0) {
        const totalHigh = highFindingAgents.reduce((s, a) => s + a.highFindings, 0);
        issues.push({
          title: `${totalHigh} high-severity findings across ${highFindingAgents.length} area(s): ${highFindingAgents.map(a => a.name).join(', ')}`,
          why: `Elevated issues in: ${highFindingAgents.map(a => a.domain).join('; ')}.`,
          severity: 'high',
          agents: highFindingAgents.map(a => a.key),
          count: totalHigh,
        });
      }

      const taskBacklogAgents = agentStatuses.filter(a => a.overdueTasks >= 5);
      if (taskBacklogAgents.length > 0) {
        const totalOverdue = taskBacklogAgents.reduce((s, a) => s + a.overdueTasks, 0);
        issues.push({
          title: `${totalOverdue} overdue agent tasks across ${taskBacklogAgents.length} area(s)`,
          why: 'Tasks are being created but not acted on — assignees may be overloaded or tasks are too noisy.',
          severity: 'medium',
          agents: taskBacklogAgents.map(a => a.key),
          count: totalOverdue,
        });
      }

      const stuckAgents = agentStatuses.filter(a => a.ran && a.lastRunStatus === 'running');
      if (stuckAgents.length > 0) {
        issues.push({
          title: `${stuckAgents.length} agent(s) appear stuck (still running): ${stuckAgents.map(a => a.name).join(', ')}`,
          why: 'Long-running query or infinite loop in agent logic.',
          severity: 'high',
          agents: stuckAgents.map(a => a.key),
          count: stuckAgents.length,
        });
      }

      issues.sort((a, b) => {
        const sev = { critical: 0, high: 1, medium: 2 };
        return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
      });
      const topIssues = issues.slice(0, 5);

      for (const issue of topIssues) {
        if (issue.severity === 'critical') {
          if (issue.agents.some(a => failedAgents.map(f => f.key).includes(a))) {
            actions.push({
              text: `Investigate failed agent runs — check server logs for ${issue.agents.map(a => AGENT_NAMES[a]).join(', ')}`,
              owner: await resolveUserName(c.superuser_id),
              priority: 'critical',
            });
          }
          if (issue.agents.some(a => criticalAgents.map(f => f.key).includes(a))) {
            for (const agentKey of issue.agents.filter(a => criticalAgents.map(f => f.key).includes(a))) {
              const agentFindings = findingsByAgent.get(agentKey) || [];
              const critFindings = agentFindings.filter((f: any) => f.severity === 'critical');
              if (critFindings.length > 0) {
                const topFinding = critFindings[0];
                const cleanTitle = topFinding.title.replace(/^[A-Z]\d+\.\d+\s+/, '');
                actions.push({
                  text: `Review critical: ${cleanTitle}`,
                  owner: await resolveUserName(c.superuser_id),
                  priority: 'critical',
                });
              }
            }
          }
        } else if (issue.severity === 'high') {
          if (missedAgents.length > 0 && issue.agents.some(a => missedAgents.map(m => m.key).includes(a))) {
            actions.push({
              text: `Check why ${issue.agents.filter(a => missedAgents.map(m => m.key).includes(a)).map(a => AGENT_NAMES[a]).join(', ')} did not run`,
              owner: await resolveUserName(c.superuser_id),
              priority: 'high',
            });
          }
          if (stuckAgents.length > 0 && issue.agents.some(a => stuckAgents.map(s => s.key).includes(a))) {
            actions.push({
              text: `Check stuck agent(s): ${issue.agents.filter(a => stuckAgents.map(s => s.key).includes(a)).map(a => AGENT_NAMES[a]).join(', ')}`,
              owner: await resolveUserName(c.superuser_id),
              priority: 'high',
            });
          }
          if (highFindingAgents.length > 0 && issue.agents.some(a => highFindingAgents.map(h => h.key).includes(a))) {
            for (const agentKey of issue.agents.filter(a => highFindingAgents.map(h => h.key).includes(a)).slice(0, 2)) {
              const agentFindings = findingsByAgent.get(agentKey) || [];
              const highFindings = agentFindings.filter((f: any) => f.severity === 'high');
              if (highFindings.length > 0) {
                const topFinding = highFindings[0];
                const cleanTitle = topFinding.title.replace(/^[A-Z]\d+\.\d+\s+/, '');
                actions.push({
                  text: `Review: ${cleanTitle}`,
                  owner: await resolveUserName(c.superuser_id),
                  priority: 'high',
                });
              }
            }
          }
        } else {
          if (taskBacklogAgents.length > 0) {
            const topOverdueAgent = taskBacklogAgents.sort((a, b) => b.overdueTasks - a.overdueTasks)[0];
            const topAssignee = [...(tasksByAgent.get(topOverdueAgent.key)?.assignees.entries() || [])].sort((a, b) => b[1] - a[1])[0];
            if (topAssignee) {
              const assigneeName = await resolveUserName(topAssignee[0]);
              actions.push({
                text: `Review task backlog for ${assigneeName} — ${topAssignee[1]} open tasks from ${topOverdueAgent.name}`,
                owner: assigneeName,
                priority: 'medium',
              });
            }
          }
        }
      }

      const uniqueActions: Action[] = [];
      const seenTexts = new Set<string>();
      for (const action of actions) {
        const key = action.text.toLowerCase();
        if (!seenTexts.has(key)) {
          seenTexts.add(key);
          uniqueActions.push(action);
        }
      }
      const topActions = uniqueActions.slice(0, 5);

      const totalAgents = agentStatuses.length;
      const healthyAgents = agentStatuses.filter(a => a.healthy).length;
      const totalCritical = agentStatuses.reduce((s, a) => s + a.criticalFindings, 0);
      const totalHigh = agentStatuses.reduce((s, a) => s + a.highFindings, 0);
      const anyFailed = failedAgents.length > 0;
      const majorityFailed = failedAgents.length > totalAgents / 2;

      let systemStatus: 'YES' | 'PARTIALLY' | 'NO';
      if (majorityFailed || totalCritical >= 3) {
        systemStatus = 'NO';
      } else if (anyFailed || totalCritical > 0 || totalHigh >= 5 || missedAgents.length >= 3 || stuckAgents.length > 0) {
        systemStatus = 'PARTIALLY';
      } else {
        systemStatus = 'YES';
      }

      let priorityToday = 'No critical issues — system is running normally.';
      if (topIssues.length > 0) {
        const top = topIssues[0];
        priorityToday = top.title;
      }

      const today = new Date().toISOString().slice(0, 10);
      const prasadName = await resolveUserName(c.superuser_id);

      let briefing = '';
      briefing += `DAILY EXECUTIVE BRIEFING — ${today}\n`;
      briefing += `Prepared for: ${prasadName}\n`;
      briefing += `═══════════════════════════════════════════\n\n`;

      briefing += `1. IS THE SYSTEM WORKING?\n`;
      briefing += `   ${systemStatus}\n`;
      briefing += `   (${healthyAgents}/${totalAgents} agents healthy)\n\n`;

      briefing += `2. WHAT IS NOT WORKING?\n`;
      if (topIssues.length === 0) {
        briefing += `   Nothing — all systems operating normally.\n\n`;
      } else {
        for (let i = 0; i < topIssues.length; i++) {
          const issue = topIssues[i];
          const sevLabel = issue.severity.toUpperCase();
          briefing += `   ${i + 1}. [${sevLabel}] ${issue.title}\n`;
        }
        briefing += `\n`;
      }

      briefing += `3. WHY IS IT HAPPENING?\n`;
      if (topIssues.length === 0) {
        briefing += `   N/A — no issues detected.\n\n`;
      } else {
        for (let i = 0; i < topIssues.length; i++) {
          const issue = topIssues[i];
          briefing += `   ${i + 1}. ${issue.why}\n`;
        }
        briefing += `\n`;
      }

      briefing += `4. WHAT SHOULD WE DO?\n`;
      if (topActions.length === 0) {
        briefing += `   No actions needed — continue monitoring.\n\n`;
      } else {
        for (let i = 0; i < topActions.length; i++) {
          const action = topActions[i];
          briefing += `   ${i + 1}. ${action.text}\n`;
          briefing += `      → ${action.owner} [${action.priority.toUpperCase()}]\n`;
        }
        briefing += `\n`;
      }

      briefing += `5. PRIORITY TODAY\n`;
      briefing += `   ${priorityToday}\n\n`;

      briefing += `───────────────────────────────────────────\n`;
      briefing += `AGENT STATUS SUMMARY\n`;
      for (const agent of agentStatuses) {
        const status = !agent.ran ? '⊘ DID NOT RUN'
          : agent.lastRunStatus === 'failed' ? '✗ FAILED'
          : agent.lastRunStatus === 'running' ? '⟳ STUCK'
          : agent.criticalFindings > 0 ? `⚠ ${agent.criticalFindings} critical`
          : agent.highFindings > 0 ? `△ ${agent.highFindings} high`
          : '✓ OK';
        const taskNote = agent.overdueTasks > 0 ? ` | ${agent.overdueTasks} overdue tasks` : '';
        briefing += `   ${agent.name}: ${status}${taskNote}\n`;
      }

      const insight = await insightManager.createInsight({
        findingIds: findingIds.slice(0, 100),
        insightType: 'briefing',
        title: `Daily Executive Briefing — ${today}`,
        content: briefing,
        logicType: 'rule_based',
        dataSources: ['agent_runs', 'agent_findings', 'tasks'],
        scopePeriod: today,
      });
      if (!insight.isDuplicate) insightsCount++;

    } catch (err: any) {
      console.error(`[Advisor] Execution error:`, err.message);
    }

    const elapsed = Date.now() - startTime;

    const executionMetadata = {
      execution_time_ms: elapsed,
      queries_run: queriesRun,
      insights_generated: insightsCount,
      issues_found: issues.length,
      actions_recommended: actions.length,
      system_status: issues.length === 0 ? 'YES' : issues.some(i => i.severity === 'critical') ? 'NO' : 'PARTIALLY',
    };

    try {
      await db.execute(sql`
        UPDATE agent_runs
        SET execution_metadata = ${JSON.stringify(executionMetadata)}::jsonb
        WHERE id = ${context.runId}
      `);
    } catch (err: any) {
      console.error(`[Advisor] Failed to update execution_metadata:`, err.message);
    }

    console.log(`[Advisor] Complete: ${insightsCount} insight, ${issues.length} issues, ${actions.length} actions in ${elapsed}ms`);

    return {
      findingsCount: 0,
      insightsCount,
      recommendationsCount: 0,
      autoExecutedActions: 0,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Advisor Agent: ${insightsCount} briefing insight produced. ${issues.length} issues identified, ${actions.length} actions recommended. Execution: ${elapsed}ms.`,
    } as any;
  }
}
