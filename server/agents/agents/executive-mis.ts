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
      const overduePct = woStats.total > 0 ? Math.round((woStats.overdue / woStats.total) * 100) : 0;
      const severity = overduePct >= 30 ? 'critical' as const :
                       woStats.overdue >= 30 ? 'high' as const : 'medium' as const;
      const woImpact = overduePct >= 30
        ? 'This level of overdue work orders indicates systemic production delays that may impact delivery commitments, client satisfaction, and revenue recognition.'
        : overduePct >= 15
        ? 'A moderate proportion of overdue work orders suggests resource bottlenecks or scheduling issues that need management review.'
        : 'While the percentage is manageable, the absolute count warrants attention to prevent escalation.';

      const result = await findingManager.createFinding({
        findingType: 'threshold_breach',
        severity,
        title: `${woStats.overdue} work orders overdue (${overduePct}% of total)`,
        description: `There are ${woStats.overdue} overdue work orders out of ${woStats.total} total (${overduePct}%). Completed: ${woStats.completed}, In Progress: ${woStats.inProgress}.\n\n${woImpact}`,
        logicType: 'rule_based',
        dataSnapshot: { ...woStats, overduePct },
        relatedEntityType: 'work_order',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    if (taskStats.overdue > 20) {
      const taskOverduePct = taskStats.total > 0 ? Math.round((taskStats.overdue / taskStats.total) * 100) : 0;
      const taskImpact = taskStats.overdue >= 50
        ? 'This volume of overdue tasks suggests systematic workload management issues. Team capacity review and task prioritization exercise recommended.'
        : 'Overdue task count is above threshold. Review for blocked items, reassignment opportunities, or scope adjustments.';

      const result = await findingManager.createFinding({
        findingType: 'threshold_breach',
        severity: taskStats.overdue >= 50 ? 'high' as const : 'medium' as const,
        title: `${taskStats.overdue} tasks overdue across the platform (${taskOverduePct}% of total)`,
        description: `There are ${taskStats.overdue} overdue tasks out of ${taskStats.total} total. Completed: ${taskStats.completed}, Pending: ${taskStats.pending}.\n\n${taskImpact}`,
        logicType: 'rule_based',
        dataSnapshot: taskStats,
        relatedEntityType: 'task',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    const totalOverdueInvoices = financeKPIs.reduce((sum, k) => sum + k.overdueInvoices, 0);
    const totalPendingValue = financeKPIs.reduce((sum, k) => sum + (k.pendingInvoices || 0), 0);
    if (totalOverdueInvoices > 5) {
      const severity = totalOverdueInvoices >= 100 ? 'critical' as const :
                       totalOverdueInvoices >= 50 ? 'high' as const : 'medium' as const;
      const companyBreakdown = financeKPIs
        .filter(k => k.overdueInvoices > 0)
        .map(k => `  • ${k.companyName}: ${k.overdueInvoices} overdue out of ${k.totalInvoices} total`)
        .join('\n');
      const invoiceImpact = totalOverdueInvoices >= 100
        ? 'Critical accounts receivable situation. Overdue invoices at this scale directly impact cash flow, working capital, and may signal collection process failures.'
        : totalOverdueInvoices >= 50
        ? 'Significant overdue invoice volume. Cash flow impact likely material. Review aging report and escalate high-value overdue accounts.'
        : 'Overdue invoice count above threshold. Monitor closely and review collection follow-up processes.';

      const result = await findingManager.createFinding({
        findingType: 'threshold_breach',
        severity,
        title: `${totalOverdueInvoices} invoices overdue across all companies`,
        description: [
          `There are ${totalOverdueInvoices} overdue invoices across ${financeKPIs.filter(k => k.overdueInvoices > 0).length} companies.`,
          `\nCompany breakdown:\n${companyBreakdown}`,
          `\n${invoiceImpact}`,
        ].join('\n'),
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
