import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { agentDataRepo } from '../data-access/agent-data-repo';

const FINANCE_CATEGORIES = ['Finance'];
const FINANCE_KEYWORDS = ['BRC', 'invoice', 'payment', 'remittance', 'outstanding'];

function isFinanceTask(task: { title?: string; category?: string }): boolean {
  if (FINANCE_CATEGORIES.includes(task.category || '')) return true;
  const titleLower = (task.title || '').toLowerCase();
  return FINANCE_KEYWORDS.some(kw => titleLower.includes(kw.toLowerCase()));
}

function getBusinessImpact(category: string): string {
  if (category === 'Email') {
    return 'Unanswered emails may result in missed business opportunities, delayed decisions, or unresolved operational issues.';
  }
  if (category === 'Meeting Follow-up') {
    return 'Meeting follow-up tasks ensure commitments and action items are tracked to completion.\nDelays may cause project slippage, missed commitments, or repeated discussions on unresolved items.';
  }
  if (category === 'General') {
    return 'These are general operational tasks that may span multiple departments.\nProlonged delays indicate potential workflow bottlenecks or resource constraints.';
  }
  return 'Overdue tasks indicate follow-up gaps that may affect team accountability and operational continuity.';
}

export class CommunicationsAgent implements IAgent {
  key = 'communications';
  displayName = 'Communications Agent';
  category = 'operations';

  getSubscribedEvents(): string[] {
    return [
      'communication.email.received',
      'communication.task.overdue',
      'communication.attendance.anomaly',
      'communication.dwar.missing',
      'communication.commitment.overdue',
    ];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let queriesRun = 0;

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);

    // ─── 1. OVERDUE TASKS (excluding Finance) ───
    const overdueTasks = await agentDataRepo.getOverdueTasks(context.companyScope, 1);
    queriesRun++;

    const nonFinanceTasks = overdueTasks.filter(t => !isFinanceTask(t));

    const tasksByAssignee: Record<string, Record<string, typeof nonFinanceTasks>> = {};
    for (const task of nonFinanceTasks) {
      if (task.daysOverdue < 7) continue;
      const assignee = task.assigneeName || 'Unassigned';
      const category = task.category || 'General';
      if (!tasksByAssignee[assignee]) tasksByAssignee[assignee] = {};
      if (!tasksByAssignee[assignee][category]) tasksByAssignee[assignee][category] = [];
      tasksByAssignee[assignee][category].push(task);
    }

    for (const [assignee, categories] of Object.entries(tasksByAssignee)) {
      for (const [category, tasks] of Object.entries(categories)) {
        if (tasks.length === 0) continue;
        const maxDays = Math.max(...tasks.map(t => t.daysOverdue));
        const totalTasks = tasks.length;
        const severity = maxDays >= 90 ? 'critical' as const :
                         maxDays >= 30 ? 'high' as const :
                         maxDays >= 14 ? 'medium' as const : 'low' as const;

        const topTasks = tasks.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
        const topTaskList = topTasks.map(t => `  • ${t.title} (${t.daysOverdue} days)`).join('\n');
        const businessImpact = getBusinessImpact(category);

        const description = [
          `${assignee} has ${totalTasks} overdue ${category} task${totalTasks > 1 ? 's' : ''}.`,
          `Worst overdue: ${maxDays} days.`,
          `\n${businessImpact}`,
          `\nTop overdue tasks:\n${topTaskList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
        ].filter(Boolean).join('\n');

        const result = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `${assignee}: ${totalTasks} overdue ${category} task${totalTasks > 1 ? 's' : ''} (worst: ${maxDays} days)`,
          description,
          logicType: 'rule_based',
          dataSnapshot: {
            assigneeName: assignee, category, taskCount: totalTasks, maxDaysOverdue: maxDays,
            topTasks: topTasks.map(t => ({ id: t.id, title: t.title, daysOverdue: t.daysOverdue, priority: t.priority })),
          },
          relatedEntityType: 'task_group',
          relatedEntityId: `${assignee}:${category}`,
        });
        if (!result.isDuplicate) findingsCount++;
      }
    }

    // ─── 2. OVERDUE RECURRING TASKS ───
    const overdueRecurring = await agentDataRepo.getOverdueRecurringTasks(7);
    queriesRun++;

    const recurringByAssignee: Record<string, typeof overdueRecurring> = {};
    for (const rt of overdueRecurring) {
      const assignee = rt.assigneeName || 'Unassigned';
      if (!recurringByAssignee[assignee]) recurringByAssignee[assignee] = [];
      recurringByAssignee[assignee].push(rt);
    }

    for (const [assignee, tasks] of Object.entries(recurringByAssignee)) {
      const maxDays = Math.max(...tasks.map(t => t.daysOverdue));
      const severity = maxDays >= 30 ? 'high' as const : maxDays >= 14 ? 'medium' as const : 'low' as const;

      const topTasks = tasks.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
      const topList = topTasks.map(t => `  • ${t.title} (${t.daysOverdue} days)`).join('\n');

      const description = [
        `${assignee} has ${tasks.length} overdue recurring task${tasks.length > 1 ? 's' : ''}.`,
        `Worst overdue: ${maxDays} days.`,
        `\nRecurring tasks represent scheduled, repeating responsibilities. Overdue items suggest the assignee may be overburdened or the task schedule needs review.`,
        `\nTop overdue:\n${topList}`,
        tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
      ].filter(Boolean).join('\n');

      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity,
        title: `${assignee}: ${tasks.length} overdue recurring tasks (worst: ${maxDays} days)`,
        description,
        logicType: 'rule_based',
        dataSnapshot: { assigneeName: assignee, taskCount: tasks.length, maxDaysOverdue: maxDays },
        relatedEntityType: 'recurring_task_group',
        relatedEntityId: `${assignee}:recurring`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 3. UNANSWERED EMAILS ───
    const unansweredEmails = await agentDataRepo.getUnansweredEmails(24);
    queriesRun++;

    const criticalEmails = unansweredEmails.filter(e => ['P0', 'P1'].includes(e.priority) && e.hoursUnanswered >= 24);
    for (const email of criticalEmails) {
      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity: email.priority === 'P0' ? 'critical' as const : 'high' as const,
        title: `${email.priority} email unanswered for ${email.hoursUnanswered}h: "${email.subject}"`,
        description: `A ${email.priority} priority email from ${email.fromAddress} with subject "${email.subject}" has been unanswered for ${email.hoursUnanswered} hours.\n\nHigh-priority emails require timely response to maintain professional communication standards and prevent escalation.`,
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
        description: `Email from ${email.fromAddress} has been unanswered for ${email.hoursUnanswered} hours.\n\nProlonged silence on emails — even lower-priority ones — can affect professional relationships and operational follow-through.`,
        logicType: 'rule_based',
        dataSnapshot: email,
        relatedEntityType: 'email',
        relatedEntityId: String(email.id),
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 4. ATTENDANCE ANOMALIES ───
    const attendanceIssues = await agentDataRepo.getAttendanceAnomalies(7);
    queriesRun++;

    for (const issue of attendanceIssues) {
      if (issue.incompleteCount + issue.absentCount < 2) continue;
      const severity = issue.absentCount >= 3 ? 'high' as const :
                       issue.incompleteCount >= 3 ? 'medium' as const : 'low' as const;

      const description = [
        `${issue.employeeName} has ${issue.absentCount} absent day${issue.absentCount !== 1 ? 's' : ''} and ${issue.incompleteCount} incomplete attendance record${issue.incompleteCount !== 1 ? 's' : ''} in the last 7 days.`,
        `\nFrequent attendance irregularities may indicate personal issues, disengagement, or timesheet management gaps that need supervisor attention.`,
      ].join('\n');

      const result = await findingManager.createFinding({
        findingType: 'anomaly',
        severity,
        title: `${issue.employeeName}: attendance issues (${issue.absentCount} absent, ${issue.incompleteCount} incomplete) in last 7 days`,
        description,
        logicType: 'rule_based',
        dataSnapshot: issue,
        relatedEntityType: 'attendance',
        relatedEntityId: `${issue.userId}:attendance`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 5. DAILY WORK REPORT (DWAR) SUBMISSION GAPS ───
    const dwarGaps = await agentDataRepo.getDWARSubmissionGaps(3);
    queriesRun++;

    for (const gap of dwarGaps) {
      if (gap.missingDays < 2) continue;
      const severity = gap.missingDays >= 5 ? 'high' as const :
                       gap.missingDays >= 3 ? 'medium' as const : 'low' as const;

      const description = [
        `${gap.employeeName} has not submitted daily work reports for ${gap.missingDays} working day${gap.missingDays !== 1 ? 's' : ''} in the last week.`,
        `\nDaily work reports are essential for productivity tracking, workload visibility, and performance assessment. Consistent non-submission hampers management oversight.`,
      ].join('\n');

      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity,
        title: `${gap.employeeName}: ${gap.missingDays} missing daily work reports this week`,
        description,
        logicType: 'rule_based',
        dataSnapshot: gap,
        relatedEntityType: 'dwar',
        relatedEntityId: `${gap.userId}:dwar`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 6. PENDING LEAVE REQUESTS ───
    const pendingLeaves = await agentDataRepo.getPendingLeaveRequests();
    queriesRun++;

    if (pendingLeaves.length > 0) {
      const oldestPending = Math.max(...pendingLeaves.map(l => l.daysPending));
      const severity = oldestPending >= 7 ? 'high' as const :
                       oldestPending >= 3 ? 'medium' as const : 'low' as const;

      const leaveList = pendingLeaves.slice(0, 5).map(l =>
        `  • ${l.employeeName}: ${l.leaveType} (${l.startDate} to ${l.endDate}, pending ${l.daysPending} days)`
      ).join('\n');

      const description = [
        `${pendingLeaves.length} leave request${pendingLeaves.length > 1 ? 's' : ''} awaiting approval.`,
        `Oldest pending: ${oldestPending} days.`,
        `\nDelayed leave approvals can disrupt employee planning, affect morale, and create last-minute scheduling conflicts.`,
        `\nPending requests:\n${leaveList}`,
        pendingLeaves.length > 5 ? `\n...and ${pendingLeaves.length - 5} more.` : '',
      ].filter(Boolean).join('\n');

      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity,
        title: `${pendingLeaves.length} leave requests pending approval (oldest: ${oldestPending} days)`,
        description,
        logicType: 'rule_based',
        dataSnapshot: { count: pendingLeaves.length, oldestPending },
        relatedEntityType: 'leave_request',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 7. OVERDUE MEETING COMMITMENTS ───
    const overdueCommitments = await agentDataRepo.getOverdueMeetingCommitments(7);
    queriesRun++;

    const commitmentsByAssignee: Record<string, typeof overdueCommitments> = {};
    for (const c of overdueCommitments) {
      const assignee = c.assigneeName || 'Unassigned';
      if (!commitmentsByAssignee[assignee]) commitmentsByAssignee[assignee] = [];
      commitmentsByAssignee[assignee].push(c);
    }

    for (const [assignee, commitments] of Object.entries(commitmentsByAssignee)) {
      const maxDays = Math.max(...commitments.map(c => c.daysOverdue));
      const severity = maxDays >= 30 ? 'high' as const :
                       maxDays >= 14 ? 'medium' as const : 'low' as const;

      const topList = commitments.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5)
        .map(c => `  • ${c.title} (${c.daysOverdue} days, from meeting: ${c.meetingTitle || 'N/A'})`).join('\n');

      const description = [
        `${assignee} has ${commitments.length} overdue meeting commitment${commitments.length > 1 ? 's' : ''}.`,
        `Worst overdue: ${maxDays} days.`,
        `\nMeeting commitments represent agreed-upon action items. Overdue items indicate broken commitments that may erode team trust and meeting effectiveness.`,
        `\nTop overdue:\n${topList}`,
        commitments.length > 5 ? `\n...and ${commitments.length - 5} more.` : '',
      ].filter(Boolean).join('\n');

      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity,
        title: `${assignee}: ${commitments.length} overdue meeting commitments (worst: ${maxDays} days)`,
        description,
        logicType: 'rule_based',
        dataSnapshot: { assigneeName: assignee, commitmentCount: commitments.length, maxDaysOverdue: maxDays },
        relatedEntityType: 'meeting_commitment_group',
        relatedEntityId: `${assignee}:commitments`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 8. UNREAD INTERNAL MESSAGES ───
    const unreadMessages = await agentDataRepo.getUnreadInternalMessages(48);
    queriesRun++;

    if (unreadMessages.length >= 5) {
      const severity = unreadMessages.length >= 20 ? 'high' as const :
                       unreadMessages.length >= 10 ? 'medium' as const : 'low' as const;

      const description = [
        `${unreadMessages.length} internal messages have been unread for more than 48 hours.`,
        `\nUnread internal messages may indicate communication breakdowns within the team. Important updates, requests, or decisions could be missed.`,
      ].join('\n');

      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity,
        title: `${unreadMessages.length} internal messages unread for 48+ hours`,
        description,
        logicType: 'rule_based',
        dataSnapshot: { count: unreadMessages.length },
        relatedEntityType: 'internal_message',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── DAILY INSIGHT SUMMARY ───
    const taskStats = await agentDataRepo.getTaskStats();
    const emailStats = await agentDataRepo.getEmailStats();
    queriesRun += 2;

    const nonFinanceOverdue = nonFinanceTasks.filter(t => t.daysOverdue >= 7).length;

    await insightManager.createInsight({
      findingIds: [],
      insightType: 'summary',
      title: `Communications & People Activity Summary - ${new Date().toLocaleDateString()}`,
      content: [
        `=== PEOPLE ACTIVITY & COMMUNICATION DISCIPLINE ===`,
        `Date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
        ``,
        `--- TASKS (Non-Finance) ---`,
        `Overdue (7+ days): ${nonFinanceOverdue} tasks across ${Object.keys(tasksByAssignee).length} people`,
        ``,
        `--- RECURRING TASKS ---`,
        `Overdue: ${overdueRecurring.length} recurring tasks across ${Object.keys(recurringByAssignee).length} people`,
        ``,
        `--- EMAILS ---`,
        `Unread (7 days): ${emailStats.totalUnread}, High Priority (P0/P1): ${emailStats.highPriority}`,
        `Critical unanswered (24h+): ${criticalEmails.length}, Long unanswered (72h+): ${longUnanswered.length}`,
        ``,
        `--- ATTENDANCE ---`,
        `People with anomalies (7 days): ${attendanceIssues.filter(i => i.incompleteCount + i.absentCount >= 2).length}`,
        ``,
        `--- DAILY WORK REPORTS ---`,
        `People with missing DWARs: ${dwarGaps.filter(g => g.missingDays >= 2).length}`,
        ``,
        `--- LEAVE REQUESTS ---`,
        `Pending approval: ${pendingLeaves.length}`,
        ``,
        `--- MEETING COMMITMENTS ---`,
        `Overdue commitments: ${overdueCommitments.length} across ${Object.keys(commitmentsByAssignee).length} people`,
        ``,
        `--- INTERNAL MESSAGES ---`,
        `Unread 48h+: ${unreadMessages.length}`,
      ].join('\n'),
      logicType: 'rule_based',
      dataSources: [
        'tasks', 'recurring_tasks', 'gmail_messages', 'attendance_records',
        'daily_work_reports', 'leave_requests', 'meeting_commitments', 'internal_messages',
      ],
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
