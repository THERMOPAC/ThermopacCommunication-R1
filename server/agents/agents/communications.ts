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

    const criticalTasks = overdueTasks.filter(t => t.daysOverdue >= 7);
    const warningTasks = overdueTasks.filter(t => t.daysOverdue >= 3 && t.daysOverdue < 7);

    for (const task of criticalTasks) {
      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: task.daysOverdue >= 14 ? 'critical' as const : 'high' as const,
        title: `Task "${task.title}" is ${task.daysOverdue} days overdue`,
        description: `Task assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days. Priority: ${task.priority}. Category: ${task.category || 'general'}.`,
        logicType: 'rule_based',
        dataSnapshot: task,
        relatedEntityType: 'task',
        relatedEntityId: String(task.id),
      });
      if (!result.isDuplicate) findingsCount++;
    }

    for (const task of warningTasks) {
      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: 'medium',
        title: `Task "${task.title}" is ${task.daysOverdue} days overdue`,
        description: `Task assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
        logicType: 'rule_based',
        dataSnapshot: task,
        relatedEntityType: 'task',
        relatedEntityId: String(task.id),
      });
      if (!result.isDuplicate) findingsCount++;
    }

    const unansweredEmails = await agentDataRepo.getUnansweredEmails(24);
    queriesRun++;

    const criticalEmails = unansweredEmails.filter(e => ['P0', 'P1'].includes(e.priority) && e.hoursUnanswered >= 24);
    const warningEmails = unansweredEmails.filter(e => e.hoursUnanswered >= 48);

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

    for (const email of warningEmails) {
      if (!criticalEmails.find(e => e.id === email.id)) {
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
    }

    const taskStats = await agentDataRepo.getTaskStats();
    const emailStats = await agentDataRepo.getEmailStats();
    queriesRun += 2;

    await insightManager.createInsight({
      findingIds: [],
      insightType: 'summary',
      title: `Communications Summary - ${new Date().toLocaleDateString()}`,
      content: `Task Overview: ${taskStats.total} total, ${taskStats.completed} completed, ${taskStats.overdue} overdue, ${taskStats.pending} pending.\nEmail Overview: ${emailStats.totalUnread} unread emails, ${emailStats.highPriority} high priority (P0/P1).\nOverdue Tasks: ${overdueTasks.length} tasks overdue (${criticalTasks.length} critical, ${warningTasks.length} warning).\nUnanswered Emails: ${unansweredEmails.length} unanswered over 24h (${criticalEmails.length} critical priority).`,
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
