import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { agentDataRepo } from '../data-access/agent-data-repo';

export class ProjectControlAgent implements IAgent {
  key = 'project_control';
  displayName = 'Project Control Agent';
  category = 'operations';

  getSubscribedEvents(): string[] {
    return [
      'project.project.status_changed',
      'project.work_order.status_changed',
      'project.milestone.overdue',
    ];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let queriesRun = 0;

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);

    const projectHealth = await agentDataRepo.getProjectHealth(context.companyScope);
    queriesRun++;

    const overdueWOs = await agentDataRepo.getOverdueWorkOrders(context.companyScope, 7);
    queriesRun++;

    const wosByProject: Record<string, typeof overdueWOs> = {};
    for (const wo of overdueWOs) {
      const key = wo.projectName || 'Unknown';
      if (!wosByProject[key]) wosByProject[key] = [];
      wosByProject[key].push(wo);
    }

    for (const project of projectHealth) {
      const projectWOs = wosByProject[project.projectName] || [];
      if (projectWOs.length === 0 && project.overdueWorkOrders === 0) continue;

      const overdueCount = projectWOs.length || project.overdueWorkOrders;
      const maxDaysOverdue = projectWOs.length > 0
        ? Math.max(...projectWOs.map(w => w.daysOverdue))
        : 0;

      const severity = maxDaysOverdue >= 90 ? 'critical' as const :
                       maxDaysOverdue >= 30 ? 'high' as const :
                       overdueCount >= 5 ? 'high' as const :
                       overdueCount >= 2 ? 'medium' as const : 'low' as const;

      const topWOs = projectWOs
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
        .slice(0, 5);
      const topWOsList = topWOs.map(w =>
        `  • ${w.workOrderNumber}: "${w.title}" (${w.daysOverdue} days overdue)`
      ).join('\n');

      const overduePct = project.totalWorkOrders > 0 ? Math.round((overdueCount / project.totalWorkOrders) * 100) : 0;
      const impactLevel = overduePct >= 30 ? 'significant' : overduePct >= 15 ? 'moderate' : 'limited';
      const businessImpact = [
        `${overduePct}% of work orders in this project are overdue — indicating ${impactLevel} production schedule impact.`,
        maxDaysOverdue >= 90 ? 'Work orders overdue by 90+ days suggest stalled production activities, potential resource reallocation needs, or blocked dependencies.' :
        maxDaysOverdue >= 30 ? 'Work orders overdue by 30+ days may indicate resource constraints, material delays, or scope changes requiring management attention.' :
        'Recently overdue work orders should be reviewed for scheduling adjustments.',
      ].join('\n');

      const description = [
        `Project "${project.projectName}" has ${overdueCount} overdue work orders out of ${project.totalWorkOrders} total.`,
        `Work order completion: ${project.woCompletionPct}%.`,
        `Worst overdue: ${maxDaysOverdue} days.`,
        `\n${businessImpact}`,
        topWOs.length > 0 ? `\nTop overdue work orders:\n${topWOsList}` : '',
        projectWOs.length > 5 ? `\n...and ${projectWOs.length - 5} more overdue work orders.` : '',
      ].filter(Boolean).join('\n');

      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity,
        title: `Project ${project.projectNumber || project.projectName}: ${overdueCount} overdue work orders (worst: ${maxDaysOverdue} days)`,
        description,
        logicType: 'rule_based',
        dataSnapshot: {
          projectId: project.id,
          projectName: project.projectName,
          projectNumber: project.projectNumber,
          overdueCount,
          maxDaysOverdue,
          totalWorkOrders: project.totalWorkOrders,
          completionPct: project.woCompletionPct,
          topOverdueWOs: topWOs.map(w => ({
            woNumber: w.workOrderNumber,
            title: w.title,
            daysOverdue: w.daysOverdue,
          })),
        },
        relatedEntityType: 'project',
        relatedEntityId: String(project.id),
        companyName: project.companyName,
      });
      if (!result.isDuplicate) findingsCount++;

      if (project.targetEndDate) {
        const targetDate = new Date(project.targetEndDate);
        const daysUntil = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 14 && daysUntil > 0 && project.woCompletionPct < 80) {
          const result = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity: daysUntil <= 7 ? 'critical' as const : 'high' as const,
            title: `Project ${project.projectNumber || project.projectName} at risk — ${daysUntil} days to deadline, ${project.woCompletionPct}% complete`,
            description: `Project "${project.projectName}" is due in ${daysUntil} days but only ${project.woCompletionPct}% of work orders are completed. ${overdueCount} work orders are still overdue.`,
            logicType: 'rule_based',
            dataSnapshot: { ...project, daysUntil },
            relatedEntityType: 'project',
            relatedEntityId: String(project.id),
            companyName: project.companyName,
          });
          if (!result.isDuplicate) findingsCount++;
        }
      }
    }

    if (findingsCount > 0 || projectHealth.length > 0) {
      const summary = projectHealth.map(p =>
        `${p.projectNumber || p.projectName}: ${p.woCompletionPct}% complete, ${p.overdueWorkOrders} overdue WOs`
      ).join('\n');

      await insightManager.createInsight({
        findingIds: [],
        insightType: 'summary',
        title: `Project Health Summary - ${new Date().toLocaleDateString()}`,
        content: `Active Projects: ${projectHealth.length}\nOverdue Work Orders: ${overdueWOs.length}\n\nProject Details:\n${summary}`,
        logicType: 'rule_based',
        dataSources: ['vw_agent_project_health', 'vw_agent_overdue_work_orders'],
        scopePeriod: 'daily',
      });
      insightsCount++;
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
