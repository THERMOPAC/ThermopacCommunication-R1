import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { agentDataRepo } from '../data-access/agent-data-repo';

export class CommunicationsAgent implements IAgent {
  key = 'communications';
  displayName = 'Communications Agent';
  category = 'operations';

  getSubscribedEvents(): string[] {
    return [
      'communication.email.received',
      'communication.task.overdue',
      'communication.task.created',
    ];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let queriesRun = 0;

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);

    const overdueTasks = await agentDataRepo.getOverdueTasks(context.companyScope, 1);
    queriesRun++;

    const tasksByAssignee: Record<string, {
      assigneeName: string;
      categories: Record<string, typeof overdueTasks>;
    }> = {};

    for (const task of overdueTasks) {
      if (task.daysOverdue < 7) continue;

      const assignee = task.assigneeName || 'Unassigned';
      if (!tasksByAssignee[assignee]) {
        tasksByAssignee[assignee] = { assigneeName: assignee, categories: {} };
      }
      const category = task.category || 'General';
      if (!tasksByAssignee[assignee].categories[category]) {
        tasksByAssignee[assignee].categories[category] = [];
      }
      tasksByAssignee[assignee].categories[category].push(task);
    }

    for (const [assignee, data] of Object.entries(tasksByAssignee)) {
      for (const [category, tasks] of Object.entries(data.categories)) {
        if (tasks.length === 0) continue;

        const maxDays = Math.max(...tasks.map(t => t.daysOverdue));
        const totalTasks = tasks.length;

        const severity = maxDays >= 90 ? 'critical' as const :
                         maxDays >= 30 ? 'high' as const :
                         maxDays >= 14 ? 'medium' as const : 'low' as const;

        const topTasks = tasks
          .sort((a, b) => b.daysOverdue - a.daysOverdue)
          .slice(0, 5);
        const topTaskList = topTasks.map(t =>
          `  - "${t.title}" (${t.daysOverdue} days, priority: ${t.priority})`
        ).join('\n');

        const description = [
          `${assignee} has ${totalTasks} overdue ${category} task${totalTasks > 1 ? 's' : ''}.`,
          `Most overdue: ${maxDays} days.`,
          `\nTop overdue tasks:\n${topTaskList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
        ].filter(Boolean).join(' ');

        const result = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `${assignee}: ${totalTasks} overdue ${category} task${totalTasks > 1 ? 's' : ''} (worst: ${maxDays} days)`,
          description,
          logicType: 'rule_based',
          dataSnapshot: {
            assigneeName: assignee,
            category,
            taskCount: totalTasks,
            maxDaysOverdue: maxDays,
            topTasks: topTasks.map(t => ({
              id: t.id,
              title: t.title,
              daysOverdue: t.daysOverdue,
              priority: t.priority,
            })),
          },
          relatedEntityType: 'task_group',
          relatedEntityId: `${assignee}:${category}`,
        });
        if (!result.isDuplicate) findingsCount++;
      }
    }

    const unansweredEmails = await agentDataRepo.getUnansweredEmails(24);
    queriesRun++;

    const criticalEmails = unansweredEmails.filter(e => ['P0', 'P1'].includes(e.priority) && e.hoursUnanswered >= 24);
    for (const email of criticalEmails) {
      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity: email.priority === 'P0' ? 'critical' as const : 'high' as const,
        title: `${email.priority} email unanswered for ${email.hoursUnanswered}h: "${email.subject}"`,
        description: `A ${email.priority} priority email from ${email.fromAddress} with subject "${email.subject}" has been unanswered for ${email.hoursUnanswered} hours.`,
        logicType: 'rule_based',
        dataSnapshot: email,
        relatedEntityType: 'email',
        relatedEntityId: String(email.id),
      });
      if (!result.isDuplicate) findingsCount++;
    }

    const longUnanswered = unansweredEmails.filter(e =>
      e.hoursUnanswered >= 72 && !criticalEmails.find(c => c.id === e.id)
    );
    for (const email of longUnanswered) {
      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity: 'medium',
        title: `Email unanswered for ${email.hoursUnanswered}h: "${email.subject}"`,
        description: `Email from ${email.fromAddress} has been unanswered for ${email.hoursUnanswered} hours.`,
        logicType: 'rule_based',
        dataSnapshot: email,
        relatedEntityType: 'email',
        relatedEntityId: String(email.id),
      });
      if (!result.isDuplicate) findingsCount++;
    }

    const taskStats = await agentDataRepo.getTaskStats();
    const emailStats = await agentDataRepo.getEmailStats();
    queriesRun += 2;

    await insightManager.createInsight({
      findingIds: [],
      insightType: 'summary',
      title: `Communications Summary - ${new Date().toLocaleDateString()}`,
      content: `Task Overview: ${taskStats.total} total, ${taskStats.completed} completed, ${taskStats.overdue} overdue, ${taskStats.pending} pending.\nEmail Overview: ${emailStats.totalUnread} unread emails, ${emailStats.highPriority} high priority (P0/P1).\nOverdue Tasks: ${overdueTasks.length} tasks overdue (${Object.keys(tasksByAssignee).length} assignees affected).`,
      logicType: 'rule_based',
      dataSources: ['vw_agent_overdue_tasks', 'vw_agent_unanswered_emails'],
      scopePeriod: 'daily',
    });
    insightsCount++;

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
