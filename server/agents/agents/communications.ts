import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { agentDataRepo } from '../data-access/agent-data-repo';

function getBusinessImpact(category: string, subcategory: string | null, tasks: any[]): string {
  if (subcategory === 'BRC') {
    return 'These tasks relate to export BRC (Bank Realisation Certificate) submission for completed invoices.\nDelayed BRC submissions may impact export compliance, foreign remittance documentation, and RBI reporting obligations.';
  }
  if (subcategory === 'Invoice') {
    return 'These tasks relate to outstanding invoice follow-ups and payment collection.\nDelayed follow-ups may impact cash flow, accounts receivable aging, and customer payment discipline.';
  }
  if (category === 'Finance') {
    const hasBRC = tasks.some(t => t.title?.startsWith('BRC Pending'));
    const hasInvoice = tasks.some(t => t.title?.toLowerCase().includes('invoice') || t.title?.toLowerCase().includes('outstanding'));
    if (hasBRC && hasInvoice) {
      return 'These tasks include a mix of BRC submissions and invoice follow-ups.\nDelays may impact export compliance, cash flow, and financial reporting.';
    }
    return 'These tasks relate to financial operations and compliance.\nDelays may impact cash flow, regulatory filings, or payment cycles.';
  }
  if (category === 'Email') {
    const hasTax = tasks.some(t => t.title?.toLowerCase().includes('tax') || t.title?.toLowerCase().includes('gst'));
    const hasCompliance = tasks.some(t => t.title?.toLowerCase().includes('compliance') || t.title?.toLowerCase().includes('mandatory'));
    if (hasTax || hasCompliance) {
      return 'Some of these emails relate to tax or regulatory compliance matters.\nDelayed responses may result in penalties, missed filing deadlines, or audit issues.';
    }
    return 'Unanswered emails may result in missed business opportunities, delayed decisions, or unresolved operational issues.';
  }
  if (category === 'Meeting Follow-up') {
    return 'Meeting follow-up tasks ensure commitments and action items are tracked to completion.\nDelays may cause project slippage, missed commitments, or repeated discussions on unresolved items.';
  }
  if (category === 'General') {
    return 'These are general operational tasks that may span multiple departments.\nProlonged delays indicate potential workflow bottlenecks or resource constraints.';
  }
  return '';
}

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

        const brcCount = tasks.filter(t => t.title?.startsWith('BRC Pending')).length;
        const invoiceCount = tasks.filter(t => t.title?.toLowerCase().includes('invoice') || t.title?.toLowerCase().includes('outstanding')).length;

        const subcategory = brcCount > totalTasks / 2 ? 'BRC' :
                            invoiceCount > totalTasks / 2 ? 'Invoice' : null;

        const topTaskList = topTasks.map(t => {
          const shortTitle = t.title?.replace('BRC Pending for ', '').replace('Invoice ', '') || t.title;
          return `  • ${shortTitle} (${t.daysOverdue} days)`;
        }).join('\n');

        const businessImpact = getBusinessImpact(category, subcategory, tasks);

        const description = [
          `${assignee} has ${totalTasks} overdue ${subcategory ? subcategory + ' ' : ''}${category} task${totalTasks > 1 ? 's' : ''}.`,
          `Worst overdue: ${maxDays} days.`,
          businessImpact ? `\n${businessImpact}` : '',
          `\nTop overdue tasks:\n${topTaskList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
        ].filter(Boolean).join('\n');

        const result = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `${assignee}: ${totalTasks} overdue ${subcategory ? subcategory + ' ' : ''}${category} task${totalTasks > 1 ? 's' : ''} (worst: ${maxDays} days)`,
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
