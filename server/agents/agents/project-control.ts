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

    for (const project of projectHealth) {
      if (project.overdueWorkOrders > 0) {
        const severity = project.overdueWorkOrders >= 5 ? 'high' as const :
                         project.overdueWorkOrders >= 2 ? 'medium' as const : 'low' as const;
        const result = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `Project ${project.projectNumber || project.projectName} has ${project.overdueWorkOrders} overdue work orders`,
          description: `Project "${project.projectName}" has ${project.overdueWorkOrders} overdue work orders out of ${project.totalWorkOrders} total. Work order completion is at ${project.woCompletionPct}%.`,
          logicType: 'rule_based',
          dataSnapshot: project,
          relatedEntityType: 'project',
          relatedEntityId: String(project.id),
          companyName: project.companyName,
        });
        if (!result.isDuplicate) findingsCount++;
      }

      if (project.targetEndDate) {
        const targetDate = new Date(project.targetEndDate);
        const daysUntil = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 14 && daysUntil > 0 && project.woCompletionPct < 80) {
          const result = await findingManager.createFinding({
            findingType: 'threshold_breach',
            severity: 'high',
            title: `Project ${project.projectNumber || project.projectName} at risk - ${daysUntil} days to deadline with ${project.woCompletionPct}% completion`,
            description: `Project "${project.projectName}" is due in ${daysUntil} days but only ${project.woCompletionPct}% of work orders are completed.`,
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

    const overdueWOs = await agentDataRepo.getOverdueWorkOrders(context.companyScope, 7);
    queriesRun++;

    for (const wo of overdueWOs) {
      if (wo.daysOverdue >= 14) {
        const result = await findingManager.createFinding({
          findingType: 'overdue',
          severity: wo.daysOverdue >= 30 ? 'critical' as const : 'high' as const,
          title: `Work Order ${wo.workOrderNumber} is ${wo.daysOverdue} days overdue`,
          description: `Work order "${wo.title}" (${wo.workOrderNumber}) for project "${wo.projectName}" has been overdue for ${wo.daysOverdue} days.`,
          logicType: 'rule_based',
          dataSnapshot: wo,
          relatedEntityType: 'work_order',
          relatedEntityId: String(wo.id),
        });
        if (!result.isDuplicate) findingsCount++;
      }
    }

    if (findingsCount > 0) {
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
