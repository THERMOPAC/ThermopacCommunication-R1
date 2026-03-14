import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { InsightManager } from '../framework/insight-manager';
import { FindingManager } from '../framework/finding-manager';
import { agentDataRepo } from '../data-access/agent-data-repo';

export class ExecutiveMISAgent implements IAgent {
  key = 'executive_mis';
  displayName = 'Executive MIS Agent';
  category = 'intelligence';

  getSubscribedEvents(): string[] {
    return ['agent.run.completed'];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let queriesRun = 0;

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);

    const projectHealth = await agentDataRepo.getProjectHealth(context.companyScope);
    const woStats = await agentDataRepo.getWorkOrderCount();
    const taskStats = await agentDataRepo.getTaskStats();
    const emailStats = await agentDataRepo.getEmailStats();
    const financeKPIs = await agentDataRepo.getFinanceKPIs(context.companyScope);
    const inspectionStats = await agentDataRepo.getInspectionStats();
    queriesRun += 6;

    const projectSection = [
      `Active Projects: ${projectHealth.length}`,
      `Total Work Orders: ${woStats.total} (Completed: ${woStats.completed}, In Progress: ${woStats.inProgress}, Overdue: ${woStats.overdue})`,
    ];

    for (const p of projectHealth) {
      projectSection.push(`  - ${p.projectNumber || p.projectName}: ${p.woCompletionPct}% WO completion, ${p.overdueWorkOrders} overdue`);
    }

    const taskSection = [
      `Total Tasks: ${taskStats.total}`,
      `Completed: ${taskStats.completed}, Pending: ${taskStats.pending}, Overdue: ${taskStats.overdue}`,
    ];

    const emailSection = [
      `Unread Emails (7 days): ${emailStats.totalUnread}`,
      `High Priority (P0/P1): ${emailStats.highPriority}`,
    ];

    const financeSection = financeKPIs.map(kpi =>
      `${kpi.companyName}: ${kpi.totalInvoices} invoices (${kpi.pendingInvoices} pending, ${kpi.overdueInvoices} overdue)`
    );

    const qualitySection = [
      `Total Inspections: ${inspectionStats.total}`,
      `Pending: ${inspectionStats.pending}, Completed: ${inspectionStats.completed}`,
    ];

    const briefing = [
      `=== EXECUTIVE MIS BRIEFING ===`,
      `Date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      ``,
      `--- PROJECT MANAGEMENT ---`,
      ...projectSection,
      ``,
      `--- TASK MANAGEMENT ---`,
      ...taskSection,
      ``,
      `--- COMMUNICATIONS ---`,
      ...emailSection,
      ``,
      `--- FINANCE ---`,
      ...financeSection,
      ``,
      `--- QUALITY ---`,
      ...qualitySection,
    ].join('\n');

    await insightManager.createInsight({
      findingIds: [],
      insightType: 'briefing',
      title: `Executive MIS Briefing - ${new Date().toLocaleDateString()}`,
      content: briefing,
      logicType: 'rule_based',
      dataSources: [
        'vw_agent_project_health',
        'work_orders',
        'tasks',
        'gmail_messages',
        'vw_agent_finance_kpis',
        'inspection_orders',
      ],
      scopePeriod: 'daily',
    });
    insightsCount++;

    if (woStats.overdue > 10) {
      const result = await findingManager.createFinding({
        findingType: 'threshold_breach',
        severity: 'high',
        title: `${woStats.overdue} work orders are overdue across all projects`,
        description: `There are ${woStats.overdue} overdue work orders out of ${woStats.total} total. This represents a significant backlog that may impact project delivery timelines.`,
        logicType: 'rule_based',
        dataSnapshot: woStats,
        relatedEntityType: 'work_order',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    if (taskStats.overdue > 20) {
      const result = await findingManager.createFinding({
        findingType: 'threshold_breach',
        severity: 'high',
        title: `${taskStats.overdue} tasks are overdue across the platform`,
        description: `There are ${taskStats.overdue} overdue tasks out of ${taskStats.total} total.`,
        logicType: 'rule_based',
        dataSnapshot: taskStats,
        relatedEntityType: 'task',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    const totalOverdueInvoices = financeKPIs.reduce((sum, k) => sum + k.overdueInvoices, 0);
    if (totalOverdueInvoices > 5) {
      const result = await findingManager.createFinding({
        findingType: 'threshold_breach',
        severity: 'medium',
        title: `${totalOverdueInvoices} invoices are overdue across all companies`,
        description: `There are ${totalOverdueInvoices} overdue invoices that require attention.`,
        logicType: 'rule_based',
        dataSnapshot: financeKPIs,
        relatedEntityType: 'invoice',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    return {
      findingsCount,
      insightsCount,
      recommendationsCount: 0,
      executionMetadata: {
        durationMs: Date.now() - startTime,
        queriesRun,
        llmCalls: 0,
        tokensUsed: 0,
      },
    };
  }
}
