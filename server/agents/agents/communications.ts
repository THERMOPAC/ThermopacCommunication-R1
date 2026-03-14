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

type EscalationTier = 'reminder_1' | 'reminder_2' | 'reminder_3' | 'creator_notify' | 'escalation_30' | 'escalation_60' | 'escalation_90' | 'zombie_risk' | 'zombie_review';

function getEscalationTier(daysOverdue: number): EscalationTier {
  if (daysOverdue >= 180) return 'zombie_review';
  if (daysOverdue >= 90)  return 'zombie_risk';
  if (daysOverdue >= 60)  return 'escalation_60';
  if (daysOverdue >= 30)  return 'escalation_30';
  if (daysOverdue >= 15)  return 'reminder_3';
  if (daysOverdue >= 7)   return 'reminder_2';
  return 'reminder_1';
}

function getTierSeverity(tier: EscalationTier): 'low' | 'medium' | 'high' | 'critical' {
  switch (tier) {
    case 'reminder_1':     return 'low';
    case 'reminder_2':     return 'medium';
    case 'reminder_3':     return 'medium';
    case 'creator_notify': return 'medium';
    case 'escalation_30':  return 'high';
    case 'escalation_60':  return 'high';
    case 'escalation_90':  return 'critical';
    case 'zombie_risk':    return 'critical';
    case 'zombie_review':  return 'critical';
  }
}

function getTierLabel(tier: EscalationTier): string {
  switch (tier) {
    case 'reminder_1':     return '1st Reminder (1+ day overdue)';
    case 'reminder_2':     return '2nd Reminder (7+ days overdue)';
    case 'reminder_3':     return 'Strong Reminder (15+ days overdue)';
    case 'creator_notify': return 'Creator Notified (15+ days overdue)';
    case 'escalation_30':  return 'Escalation Level 1 (30+ days overdue)';
    case 'escalation_60':  return 'Escalation Level 2 (60+ days overdue)';
    case 'escalation_90':  return 'Management Review (90+ days overdue)';
    case 'zombie_risk':    return 'Zombie-Risk Task (90+ days overdue)';
    case 'zombie_review':  return 'Zombie Task Review (180+ days overdue)';
  }
}

function getNotifyTargets(tier: EscalationTier, task: any): string[] {
  const targets: string[] = [];
  switch (tier) {
    case 'reminder_1':
    case 'reminder_2':
    case 'reminder_3':
      targets.push(`→ Notify: ${task.assigneeName}`);
      break;
    case 'creator_notify':
      targets.push(`→ Notify: ${task.creatorName} (task creator) — review and follow up`);
      break;
    case 'escalation_30':
      targets.push(`→ Notify: ${task.assigneeName} (assignee)`);
      targets.push(`→ Notify: ${task.creatorName} (task creator)`);
      if (task.creatorManagerName) targets.push(`→ Notify: ${task.creatorManagerName} (creator's manager)`);
      break;
    case 'escalation_60':
      targets.push(`→ Notify: ${task.assigneeName} (assignee)`);
      targets.push(`→ Notify: ${task.creatorName} (task creator)`);
      if (task.creatorManagerName) targets.push(`→ Notify: ${task.creatorManagerName} (creator's manager)`);
      if (task.assigneeManagerName) targets.push(`→ Notify: ${task.assigneeManagerName} (assignee's manager)`);
      break;
    case 'escalation_90':
    case 'zombie_risk':
    case 'zombie_review':
      targets.push(`→ Notify: ${task.assigneeName} (assignee)`);
      targets.push(`→ Notify: ${task.creatorName} (task creator)`);
      if (task.creatorManagerName) targets.push(`→ Notify: ${task.creatorManagerName} (creator's manager)`);
      if (task.assigneeManagerName) targets.push(`→ Notify: ${task.assigneeManagerName} (assignee's manager)`);
      targets.push(`→ Flag for Management Review`);
      break;
  }
  return targets;
}

function getBusinessImpactForTier(tier: EscalationTier): string {
  switch (tier) {
    case 'reminder_1':
      return 'This task has just crossed its due date. Early attention prevents escalation.';
    case 'reminder_2':
      return 'This task has been overdue for a week. The assignee should prioritize this or communicate blockers.';
    case 'reminder_3':
      return 'This task is significantly overdue. The task creator has been notified to review and follow up directly with the assignee.';
    case 'creator_notify':
      return 'The task creator should review whether this task is still relevant, reassign if needed, or close if completed outside the system.';
    case 'escalation_30':
      return 'Task overdue for 30+ days indicates a systemic follow-up failure. Both the assignee and creator\'s manager have been notified. This may indicate resource constraints, unclear requirements, or deprioritization without formal closure.';
    case 'escalation_60':
      return 'Task overdue for 60+ days is a serious concern. All stakeholders including both managers have been notified. Consider whether this task needs reassignment, scope change, or formal cancellation.';
    case 'escalation_90':
    case 'zombie_risk':
      return 'ZOMBIE-RISK: Task overdue for 90+ days. This task has likely been abandoned without formal closure. Management review required to decide: reassign, close as not applicable, or escalate as a process failure.';
    case 'zombie_review':
      return 'ZOMBIE TASK: Overdue for 180+ days. This task should be reviewed for immediate closure or formal reassignment. Its continued open status distorts workload metrics and overdue reporting.';
  }
}

export class CommunicationsAgent implements IAgent {
  key = 'communications';
  displayName = 'Communications Agent';
  category = 'operations';

  getSubscribedEvents(): string[] {
    return [
      'communication.task.overdue',
      'communication.task.completed',
      'communication.email.received',
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

    // ═══════════════════════════════════════════════════════
    // ─── WORKFLOW 1-4: TASK ESCALATION PIPELINE ───
    // ═══════════════════════════════════════════════════════
    const allOverdueTasks = await agentDataRepo.getOverdueTasksWithEscalation();
    queriesRun++;

    const nonFinanceTasks = allOverdueTasks.filter(t => !isFinanceTask(t));

    const tierCounts = { reminder_1: 0, reminder_2: 0, reminder_3: 0, creator_notify: 0,
      escalation_30: 0, escalation_60: 0, escalation_90: 0, zombie_risk: 0, zombie_review: 0 };

    const tasksByTier: Record<EscalationTier, typeof nonFinanceTasks> = {
      reminder_1: [], reminder_2: [], reminder_3: [], creator_notify: [],
      escalation_30: [], escalation_60: [], escalation_90: [],
      zombie_risk: [], zombie_review: [],
    };

    for (const task of nonFinanceTasks) {
      const tier = getEscalationTier(task.daysOverdue);
      tasksByTier[tier].push(task);
      tierCounts[tier]++;
    }

    // --- Tier 1: 1-day reminder (grouped by assignee) ---
    const tier1ByAssignee: Record<string, typeof nonFinanceTasks> = {};
    for (const t of tasksByTier.reminder_1) {
      const key = t.assigneeName;
      if (!tier1ByAssignee[key]) tier1ByAssignee[key] = [];
      tier1ByAssignee[key].push(t);
    }
    for (const [assignee, tasks] of Object.entries(tier1ByAssignee)) {
      const topList = tasks.slice(0, 5).map(t => `  • ${t.title} (${t.daysOverdue} day${t.daysOverdue > 1 ? 's' : ''})`).join('\n');
      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: 'low',
        title: `${assignee}: ${tasks.length} newly overdue task${tasks.length > 1 ? 's' : ''} — 1st Reminder`,
        description: [
          `${assignee} has ${tasks.length} task${tasks.length > 1 ? 's' : ''} that just crossed the due date.`,
          `\nEscalation: ${getTierLabel('reminder_1')}`,
          `→ Notify: ${assignee}`,
          `\n${getBusinessImpactForTier('reminder_1')}`,
          `\nTasks:\n${topList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
        ].filter(Boolean).join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'reminder_1', assigneeName: assignee, taskCount: tasks.length,
          notifyTargets: [assignee], tasks: tasks.map(t => ({ id: t.id, title: t.title, daysOverdue: t.daysOverdue })) },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `${assignee}:reminder_1`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // --- Tier 2: 7-day reminder (grouped by assignee) ---
    const tier2ByAssignee: Record<string, typeof nonFinanceTasks> = {};
    for (const t of tasksByTier.reminder_2) {
      const key = t.assigneeName;
      if (!tier2ByAssignee[key]) tier2ByAssignee[key] = [];
      tier2ByAssignee[key].push(t);
    }
    for (const [assignee, tasks] of Object.entries(tier2ByAssignee)) {
      const topList = tasks.slice(0, 5).map(t => `  • ${t.title} (${t.daysOverdue} days)`).join('\n');
      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: 'medium',
        title: `${assignee}: ${tasks.length} task${tasks.length > 1 ? 's' : ''} overdue 7+ days — 2nd Reminder`,
        description: [
          `${assignee} has ${tasks.length} task${tasks.length > 1 ? 's' : ''} overdue for 7+ days.`,
          `\nEscalation: ${getTierLabel('reminder_2')}`,
          `→ Notify: ${assignee}`,
          `\n${getBusinessImpactForTier('reminder_2')}`,
          `\nTasks:\n${topList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
        ].filter(Boolean).join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'reminder_2', assigneeName: assignee, taskCount: tasks.length,
          notifyTargets: [assignee], tasks: tasks.map(t => ({ id: t.id, title: t.title, daysOverdue: t.daysOverdue })) },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `${assignee}:reminder_2`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // --- Tier 3: 15-day strong reminder + creator notification (per task) ---
    for (const task of tasksByTier.reminder_3) {
      const notifyTargets = getNotifyTargets('reminder_3', task);
      const creatorNotify = getNotifyTargets('creator_notify', task);
      const allNotify = [...notifyTargets, ...creatorNotify];

      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: 'medium',
        title: `"${task.title}" — ${task.daysOverdue} days overdue — Strong Reminder + Creator Notified`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `Created by: ${task.creatorName}`,
          `Category: ${task.category || 'General'} | Priority: ${task.priority}`,
          `\nEscalation: ${getTierLabel('reminder_3')}`,
          ...allNotify,
          `\n${getBusinessImpactForTier('reminder_3')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'reminder_3', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, creatorName: task.creatorName,
          notifyTargets: [task.assigneeName, task.creatorName] },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:reminder_3`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // --- Tier 4: 30-day escalation (per task — includes creator's manager) ---
    for (const task of tasksByTier.escalation_30) {
      const notifyTargets = getNotifyTargets('escalation_30', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'high',
        title: `ESCALATION: "${task.title}" — ${task.daysOverdue} days overdue`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `Created by: ${task.creatorName}`,
          `Category: ${task.category || 'General'} | Priority: ${task.priority}`,
          `\nEscalation: ${getTierLabel('escalation_30')}`,
          ...notifyTargets,
          `\n${getBusinessImpactForTier('escalation_30')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'escalation_30', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, creatorName: task.creatorName,
          assigneeManagerName: task.assigneeManagerName, creatorManagerName: task.creatorManagerName,
          notifyTargets: notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:escalation_30`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // --- Tier 5: 60-day escalation (per task — includes assignee's manager) ---
    for (const task of tasksByTier.escalation_60) {
      const notifyTargets = getNotifyTargets('escalation_60', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'high',
        title: `ESCALATION L2: "${task.title}" — ${task.daysOverdue} days overdue`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `Created by: ${task.creatorName}`,
          `Category: ${task.category || 'General'} | Priority: ${task.priority}`,
          `\nEscalation: ${getTierLabel('escalation_60')}`,
          ...notifyTargets,
          `\n${getBusinessImpactForTier('escalation_60')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'escalation_60', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, creatorName: task.creatorName,
          assigneeManagerName: task.assigneeManagerName, creatorManagerName: task.creatorManagerName,
          notifyTargets: notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:escalation_60`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // --- Tier 6: 90-day zombie-risk + management review ---
    for (const task of [...tasksByTier.escalation_90, ...tasksByTier.zombie_risk]) {
      const notifyTargets = getNotifyTargets('zombie_risk', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'critical',
        title: `🔴 ZOMBIE-RISK: "${task.title}" — ${task.daysOverdue} days overdue — Management Review`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `Created by: ${task.creatorName}`,
          `Category: ${task.category || 'General'} | Priority: ${task.priority}`,
          `\nEscalation: ${getTierLabel('zombie_risk')}`,
          ...notifyTargets,
          `\n${getBusinessImpactForTier('zombie_risk')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'zombie_risk', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, creatorName: task.creatorName,
          assigneeManagerName: task.assigneeManagerName, creatorManagerName: task.creatorManagerName,
          notifyTargets: notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:zombie_risk`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // --- Tier 7: 180-day zombie task review ---
    for (const task of tasksByTier.zombie_review) {
      const notifyTargets = getNotifyTargets('zombie_review', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'critical',
        title: `⚫ ZOMBIE TASK: "${task.title}" — ${task.daysOverdue} days overdue — Immediate Review Required`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `Created by: ${task.creatorName}`,
          `Category: ${task.category || 'General'} | Priority: ${task.priority}`,
          `\nEscalation: ${getTierLabel('zombie_review')}`,
          ...notifyTargets,
          `\n${getBusinessImpactForTier('zombie_review')}`,
          `\nRecommended action: Close this task as "Not Applicable" or reassign with a new due date. Its continued open status distorts all overdue reporting.`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'zombie_review', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, creatorName: task.creatorName,
          assigneeManagerName: task.assigneeManagerName, creatorManagerName: task.creatorManagerName,
          notifyTargets: notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:zombie_review`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════
    // ─── WORKFLOW 5: COMPLETION VERIFICATION ───
    // ═══════════════════════════════════════════════════════
    const recentlyCompleted = await agentDataRepo.getRecentlyCompletedTasks(1);
    queriesRun++;

    for (const task of recentlyCompleted) {
      const result = await findingManager.createFinding({
        findingType: 'completion',
        severity: 'low',
        title: `✅ Task completed: "${task.title}" — Creator notified`,
        description: [
          `Task "${task.title}" has been marked as completed by ${task.assigneeName}.`,
          `Completed at: ${task.completedAt}`,
          `\n→ Notify: ${task.creatorName} (task creator) — please verify completion`,
          `\nTask creators should verify that the completed work meets the original requirements. If not satisfactory, the task can be reopened.`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { taskId: task.id, title: task.title, assigneeName: task.assigneeName,
          creatorName: task.creatorName, completedAt: task.completedAt,
          notifyTargets: [task.creatorName] },
        relatedEntityType: 'task_completion',
        relatedEntityId: `task:${task.id}:completed`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════
    // ─── WORKFLOW 6: NO WORKLOAD VISIBILITY ───
    // ═══════════════════════════════════════════════════════
    const noTaskUsers = await agentDataRepo.getUsersWithNoActiveTasks(2);
    queriesRun++;

    for (const user of noTaskUsers) {
      if (!user.managerName) continue;
      const result = await findingManager.createFinding({
        findingType: 'visibility',
        severity: 'low',
        title: `${user.employeeName}: No active tasks visible in the system`,
        description: [
          `${user.employeeName} has zero active tasks in the task management system.`,
          `\n→ Notify: ${user.managerName} (reporting manager)`,
          `\nThis is a workload visibility finding, not a disciplinary issue.`,
          `The employee may be actively working but tasks are not being captured in the system.`,
          `This reduces management's ability to track workload, set priorities, and plan resources.`,
          `\nSuggested action: Manager to check with ${user.employeeName} and ensure current work is reflected in the task system.`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { userId: user.userId, employeeName: user.employeeName,
          managerId: user.managerId, managerName: user.managerName,
          notifyTargets: [user.managerName] },
        relatedEntityType: 'workload_visibility',
        relatedEntityId: `user:${user.userId}:no_tasks`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════
    // ─── OVERDUE RECURRING TASKS ───
    // ═══════════════════════════════════════════════════════
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

      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity,
        title: `${assignee}: ${tasks.length} overdue recurring tasks (worst: ${maxDays} days)`,
        description: [
          `${assignee} has ${tasks.length} overdue recurring task${tasks.length > 1 ? 's' : ''}.`,
          `Worst overdue: ${maxDays} days.`,
          `\nRecurring tasks represent scheduled, repeating responsibilities. Overdue items suggest the assignee may be overburdened or the task schedule needs review.`,
          `\nTop overdue:\n${topList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
        ].filter(Boolean).join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { assigneeName: assignee, taskCount: tasks.length, maxDaysOverdue: maxDays },
        relatedEntityType: 'recurring_task_group',
        relatedEntityId: `${assignee}:recurring`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════
    // ─── UNANSWERED EMAILS ───
    // ═══════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════
    // ─── MODULE 1: ATTENDANCE MONITORING ───
    // ═══════════════════════════════════════════════════════
    const attendanceDetailed = await agentDataRepo.getDetailedAttendanceIssues(7);
    const todayMissing = await agentDataRepo.getTodayMissingAttendance();
    queriesRun += 2;

    let attendanceAnomalyCount = 0;
    let absentWithoutLeaveCount = 0;
    let incompleteAttendanceCount = 0;

    for (const emp of attendanceDetailed) {
      const totalIssues = emp.absentCount + emp.incompleteCount;
      if (totalIssues === 0) continue;

      if (emp.absentWithoutLeaveCount > 0) {
        absentWithoutLeaveCount += emp.absentWithoutLeaveCount;
        const severity = emp.absentWithoutLeaveCount >= 3 ? 'high' as const :
                         emp.absentWithoutLeaveCount >= 2 ? 'medium' as const : 'low' as const;
        const notifyTarget = severity === 'low' ? emp.employeeName : emp.managerName || emp.employeeName;
        const result = await findingManager.createFinding({
          findingType: 'anomaly',
          severity,
          title: `${emp.employeeName}: ${emp.absentWithoutLeaveCount} absence${emp.absentWithoutLeaveCount > 1 ? 's' : ''} without approved leave (7 days)`,
          description: [
            `${emp.employeeName} was absent on ${emp.absentWithoutLeaveCount} day${emp.absentWithoutLeaveCount > 1 ? 's' : ''} without any approved leave request in the last 7 days.`,
            `Absent dates: ${emp.absentDates.join(', ')}`,
            severity === 'low'
              ? `\n→ Notify: ${emp.employeeName} — please submit a leave request or clarify attendance.`
              : `\n→ Notify: ${emp.employeeName}\n→ Escalate to: ${emp.managerName || 'Reporting Manager'} — persistent absences without leave require manager attention.`,
            `\nAbsence without approved leave affects team planning, may violate attendance policies, and creates compliance gaps.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...emp, notifyTargets: [emp.employeeName, notifyTarget] },
          relatedEntityType: 'attendance',
          relatedEntityId: `${emp.userId}:absent_no_leave`,
        });
        if (!result.isDuplicate) findingsCount++;
      }

      if (emp.incompleteCount >= 3) {
        incompleteAttendanceCount += emp.incompleteCount;
        const result = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `${emp.employeeName}: ${emp.incompleteCount} incomplete attendance records (7 days)`,
          description: [
            `${emp.employeeName} has ${emp.incompleteCount} incomplete attendance records (check-in but no check-out) in the last 7 days.`,
            `Incomplete dates: ${emp.incompleteDates.join(', ')}`,
            `\n→ Notify: ${emp.employeeName} — please complete your attendance records.`,
            emp.incompleteCount >= 3 ? `→ Escalate to: ${emp.managerName || 'Reporting Manager'} — repeated incomplete records indicate a pattern.` : '',
            `\nIncomplete attendance records affect working-hours calculation, overtime tracking, and payroll accuracy.`,
          ].filter(Boolean).join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...emp, notifyTargets: [emp.employeeName, emp.managerName] },
          relatedEntityType: 'attendance',
          relatedEntityId: `${emp.userId}:incomplete_attendance`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else if (emp.incompleteCount > 0) {
        incompleteAttendanceCount += emp.incompleteCount;
        const result = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'low',
          title: `${emp.employeeName}: ${emp.incompleteCount} incomplete attendance record${emp.incompleteCount > 1 ? 's' : ''} (7 days)`,
          description: [
            `${emp.employeeName} has ${emp.incompleteCount} incomplete attendance record${emp.incompleteCount > 1 ? 's' : ''} (check-in but no check-out) in the last 7 days.`,
            `\n→ Notify: ${emp.employeeName} — please complete your attendance records.`,
            `\nIncomplete attendance records affect working-hours calculation and payroll accuracy.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { userId: emp.userId, employeeName: emp.employeeName, incompleteCount: emp.incompleteCount },
          relatedEntityType: 'attendance',
          relatedEntityId: `${emp.userId}:incomplete_attendance`,
        });
        if (!result.isDuplicate) findingsCount++;
      }

      if (totalIssues >= 2) attendanceAnomalyCount++;
    }

    if (todayMissing.length > 0) {
      const nameList = todayMissing.slice(0, 10).map(u => `  • ${u.employeeName}`).join('\n');
      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity: todayMissing.length >= 5 ? 'medium' as const : 'low' as const,
        title: `${todayMissing.length} employee${todayMissing.length > 1 ? 's' : ''} missing attendance today`,
        description: [
          `${todayMissing.length} active employee${todayMissing.length > 1 ? 's have' : ' has'} no attendance record for today and no approved leave.`,
          `\nEmployees without attendance:\n${nameList}`,
          todayMissing.length > 10 ? `\n...and ${todayMissing.length - 10} more.` : '',
          `\n→ Notify: Each employee listed above.`,
          `\nMissing attendance records should be recorded before end of day. Employees should either check in or submit a leave request.`,
        ].filter(Boolean).join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { count: todayMissing.length, employees: todayMissing.slice(0, 10) },
        relatedEntityType: 'attendance',
        relatedEntityId: `today:missing_attendance`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════
    // ─── MODULE 2: DWAR MONITORING ───
    // ═══════════════════════════════════════════════════════
    const dwarDetailed = await agentDataRepo.getDetailedDWARGaps();
    queriesRun++;

    let dwarMissingCount = 0;
    let dwarIncompleteCount = 0;

    for (const gap of dwarDetailed) {
      if (gap.missingDays === 0 && gap.incompleteDwarCount === 0) continue;

      if (gap.missingDays >= 3) {
        dwarMissingCount++;
        const severity = gap.missingDays >= 5 ? 'high' as const : 'medium' as const;
        const result = await findingManager.createFinding({
          findingType: 'escalation',
          severity,
          title: `${gap.employeeName}: ${gap.missingDays} missing DWARs this week — Escalated to Manager`,
          description: [
            `${gap.employeeName} has not submitted daily work reports for ${gap.missingDays} working day${gap.missingDays > 1 ? 's' : ''} in the last 7 working days.`,
            gap.consecutiveMissing >= 2 ? `${gap.consecutiveMissing} consecutive missing DWARs detected.` : '',
            `Missing dates: ${gap.missingDates.join(', ')}`,
            `\n→ Notify: ${gap.employeeName}`,
            `→ Escalate to: ${gap.managerName || 'Reporting Manager'} — ≥3 missing DWARs triggers manager escalation.`,
            `\nDaily work reports are essential for productivity tracking, workload visibility, and performance assessment. Consistent non-submission hampers management oversight.`,
          ].filter(Boolean).join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...gap, notifyTargets: [gap.employeeName, gap.managerName] },
          relatedEntityType: 'dwar',
          relatedEntityId: `${gap.userId}:dwar_escalation`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else if (gap.consecutiveMissing >= 2) {
        dwarMissingCount++;
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity: 'medium',
          title: `${gap.employeeName}: ${gap.consecutiveMissing} consecutive missing DWARs — Warning`,
          description: [
            `${gap.employeeName} has missed ${gap.consecutiveMissing} consecutive daily work reports.`,
            `Missing dates: ${gap.missingDates.join(', ')}`,
            `\n→ Notify: ${gap.employeeName} — consecutive missing DWARs indicate a pattern.`,
            `\nTwo consecutive missing DWARs trigger a warning. A third will escalate to your reporting manager.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...gap, notifyTargets: [gap.employeeName] },
          relatedEntityType: 'dwar',
          relatedEntityId: `${gap.userId}:dwar_warning`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else if (gap.missingDays >= 1) {
        dwarMissingCount++;
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity: 'low',
          title: `${gap.employeeName}: ${gap.missingDays} missing DWAR${gap.missingDays > 1 ? 's' : ''} this week — Reminder`,
          description: [
            `${gap.employeeName} has not submitted daily work report${gap.missingDays > 1 ? 's' : ''} for ${gap.missingDays} working day${gap.missingDays > 1 ? 's' : ''}.`,
            `Missing dates: ${gap.missingDates.join(', ')}`,
            `\n→ Notify: ${gap.employeeName} — please submit your daily work report by end of day.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { userId: gap.userId, employeeName: gap.employeeName, missingDays: gap.missingDays },
          relatedEntityType: 'dwar',
          relatedEntityId: `${gap.userId}:dwar_reminder`,
        });
        if (!result.isDuplicate) findingsCount++;
      }

      if (gap.incompleteDwarCount > 0) {
        dwarIncompleteCount++;
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity: 'low',
          title: `${gap.employeeName}: ${gap.incompleteDwarCount} incomplete/empty DWAR${gap.incompleteDwarCount > 1 ? 's' : ''} this week`,
          description: [
            `${gap.employeeName} submitted ${gap.incompleteDwarCount} daily work report${gap.incompleteDwarCount > 1 ? 's' : ''} with minimal or no content (draft status, very short text).`,
            `\n→ Notify: ${gap.employeeName} — DWARs should include meaningful details about tasks completed, challenges, and plans.`,
            `\nEmpty or too-short DWARs provide no visibility into work activities and defeat the purpose of daily reporting.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { userId: gap.userId, employeeName: gap.employeeName, incompleteDwarCount: gap.incompleteDwarCount },
          relatedEntityType: 'dwar',
          relatedEntityId: `${gap.userId}:dwar_incomplete`,
        });
        if (!result.isDuplicate) findingsCount++;
      }
    }

    // ═══════════════════════════════════════════════════════
    // ─── MODULE 3: LEAVE REQUEST MONITORING ───
    // ═══════════════════════════════════════════════════════
    const pendingLeaves = await agentDataRepo.getDetailedPendingLeaveRequests();
    queriesRun++;

    let leavePendingReminderCount = 0;
    let leaveEscalationCount = 0;
    let leaveClosureCount = 0;

    for (const leave of pendingLeaves) {
      if (leave.leaveDatePassed) {
        leaveClosureCount++;
        const result = await findingManager.createFinding({
          findingType: 'escalation',
          severity: 'high',
          title: `Leave request expired: ${leave.employeeName} — ${leave.leaveType} (${leave.startDate}–${leave.endDate}) still pending`,
          description: [
            `${leave.employeeName}'s ${leave.leaveType} request for ${leave.startDate} to ${leave.endDate} is still in Pending status, but the leave date has already passed.`,
            `Pending for ${leave.daysPending} days. Total days requested: ${leave.totalDays}`,
            `\n→ Notify: ${leave.managerName || 'Approving Manager'} — this leave request requires immediate closure.`,
            `\nRecommendation: Approve retroactively if leave was actually taken, or reject with clarification. Leaving expired requests open distorts leave balance reports.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...leave, notifyTargets: [leave.managerName] },
          relatedEntityType: 'leave_request',
          relatedEntityId: `leave:${leave.id}:expired`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else if (leave.daysPending >= 7) {
        leaveEscalationCount++;
        const result = await findingManager.createFinding({
          findingType: 'escalation',
          severity: 'high',
          title: `Leave approval overdue: ${leave.employeeName} — ${leave.leaveType} pending ${leave.daysPending} days`,
          description: [
            `${leave.employeeName}'s ${leave.leaveType} request (${leave.startDate} to ${leave.endDate}) has been pending approval for ${leave.daysPending} days.`,
            `Leave dates: ${leave.startDate} – ${leave.endDate} (${leave.totalDays} day${leave.totalDays > 1 ? 's' : ''})`,
            `\n→ Escalation: Pending >7 days — requires immediate manager action.`,
            `→ Notify: ${leave.managerName || 'Approving Manager'}`,
            `\nDelayed leave approvals disrupt employee planning and may violate HR policy response time requirements.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...leave, notifyTargets: [leave.managerName] },
          relatedEntityType: 'leave_request',
          relatedEntityId: `leave:${leave.id}:escalation`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else if (leave.daysPending >= 3) {
        leavePendingReminderCount++;
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity: 'medium',
          title: `Leave approval pending: ${leave.employeeName} — ${leave.leaveType} waiting ${leave.daysPending} days`,
          description: [
            `${leave.employeeName}'s ${leave.leaveType} request (${leave.startDate} to ${leave.endDate}) has been pending for ${leave.daysPending} days.`,
            `\n→ Reminder to: ${leave.managerName || 'Approving Manager'} — please review this leave request.`,
            `\nLeave requests pending >3 days affect employee planning and morale.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...leave, notifyTargets: [leave.managerName] },
          relatedEntityType: 'leave_request',
          relatedEntityId: `leave:${leave.id}:reminder`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else {
        leavePendingReminderCount++;
      }
    }

    // ═══════════════════════════════════════════════════════
    // ─── MODULE 4: MEETINGS & COMMITMENTS MONITORING ───
    // ═══════════════════════════════════════════════════════
    const detailedCommitments = await agentDataRepo.getDetailedMeetingCommitments();
    queriesRun++;

    let commitmentOverdueCount = 0;
    let commitmentEscalatedCount = 0;
    let commitmentNoTaskCount = 0;

    const commitmentsByAssignee: Record<string, typeof detailedCommitments> = {};
    for (const c of detailedCommitments) {
      const assignee = c.assigneeName || 'Unassigned';
      if (!commitmentsByAssignee[assignee]) commitmentsByAssignee[assignee] = [];
      commitmentsByAssignee[assignee].push(c);
    }

    for (const commitment of detailedCommitments) {
      if (commitment.daysOverdue >= 30) {
        commitmentEscalatedCount++;
        const result = await findingManager.createFinding({
          findingType: 'escalation',
          severity: 'high',
          title: `Meeting commitment overdue 30+ days: "${commitment.title}" — Escalated to Manager`,
          description: [
            `Commitment "${commitment.title}" from meeting "${commitment.meetingTitle}" (${commitment.meetingDate}) is ${commitment.daysOverdue} days overdue.`,
            `Assigned to: ${commitment.assigneeName} | Due: ${commitment.dueDate} | Priority: ${commitment.priority}`,
            `\n→ Notify: ${commitment.assigneeName} (assignee)`,
            `→ Escalate to: ${commitment.managerName || 'Reporting Manager'} — commitment overdue >30 days requires manager intervention.`,
            `\nOverdue meeting commitments indicate broken promises and may erode team trust. Manager should discuss blockers and next steps.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...commitment, notifyTargets: [commitment.assigneeName, commitment.managerName] },
          relatedEntityType: 'meeting_commitment',
          relatedEntityId: `commitment:${commitment.id}:escalation`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else if (commitment.daysOverdue >= 1) {
        commitmentOverdueCount++;
        const severity = commitment.daysOverdue >= 14 ? 'medium' as const : 'low' as const;
        const result = await findingManager.createFinding({
          findingType: 'overdue',
          severity,
          title: `Meeting commitment overdue: "${commitment.title}" — ${commitment.daysOverdue} days`,
          description: [
            `Commitment "${commitment.title}" from meeting "${commitment.meetingTitle}" (${commitment.meetingDate}) is ${commitment.daysOverdue} days overdue.`,
            `Assigned to: ${commitment.assigneeName} | Due: ${commitment.dueDate} | Priority: ${commitment.priority}`,
            `\n→ Notify: ${commitment.assigneeName} — please complete this commitment or update its status.`,
            `\nMeeting commitments represent agreed-upon action items. Timely completion maintains team accountability.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { commitmentId: commitment.id, title: commitment.title, daysOverdue: commitment.daysOverdue, assigneeName: commitment.assigneeName },
          relatedEntityType: 'meeting_commitment',
          relatedEntityId: `commitment:${commitment.id}:overdue`,
        });
        if (!result.isDuplicate) findingsCount++;
      }

      if (!commitment.hasLinkedTask) {
        commitmentNoTaskCount++;
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity: 'low',
          title: `Meeting commitment not linked to task: "${commitment.title}"`,
          description: [
            `Commitment "${commitment.title}" from meeting "${commitment.meetingTitle}" (${commitment.meetingDate}) has not been converted into a task.`,
            `Assigned to: ${commitment.assigneeName} | Due: ${commitment.dueDate}`,
            `\n→ Recommendation: Create a task from this commitment to ensure it is tracked in the task management system.`,
            `\nCommitments without linked tasks risk being forgotten as they are only visible in the meeting notes.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { commitmentId: commitment.id, title: commitment.title, assigneeName: commitment.assigneeName },
          relatedEntityType: 'meeting_commitment',
          relatedEntityId: `commitment:${commitment.id}:no_task`,
        });
        if (!result.isDuplicate) findingsCount++;
      }
    }

    // ═══════════════════════════════════════════════════════
    // ─── UNREAD INTERNAL MESSAGES ───
    // ═══════════════════════════════════════════════════════
    const unreadMessages = await agentDataRepo.getUnreadInternalMessages(48);
    queriesRun++;

    if (unreadMessages.length >= 5) {
      const severity = unreadMessages.length >= 20 ? 'high' as const :
                       unreadMessages.length >= 10 ? 'medium' as const : 'low' as const;
      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity,
        title: `${unreadMessages.length} internal messages unread for 48+ hours`,
        description: [
          `${unreadMessages.length} internal messages have been unread for more than 48 hours.`,
          `\nUnread internal messages may indicate communication breakdowns within the team. Important updates, requests, or decisions could be missed.`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { count: unreadMessages.length },
        relatedEntityType: 'internal_message',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════
    // ─── MODULE 5: DAILY PEOPLE ACTIVITY INSIGHT ───
    // ═══════════════════════════════════════════════════════
    const emailStats = await agentDataRepo.getEmailStats();
    queriesRun++;

    await insightManager.createInsight({
      findingIds: [],
      insightType: 'summary',
      title: `People Activity Summary - ${new Date().toLocaleDateString()}`,
      content: [
        `=== PEOPLE ACTIVITY & COMMUNICATION DISCIPLINE ===`,
        `Date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
        ``,
        `--- TASK ESCALATION PIPELINE (Non-Finance) ---`,
        `1st Reminder (1-6 days):   ${tierCounts.reminder_1} tasks`,
        `2nd Reminder (7-14 days):  ${tierCounts.reminder_2} tasks`,
        `Strong Reminder (15-29d):  ${tierCounts.reminder_3} tasks`,
        `Escalation L1 (30-59d):    ${tierCounts.escalation_30} tasks`,
        `Escalation L2 (60-89d):    ${tierCounts.escalation_60} tasks`,
        `Zombie-Risk (90-179d):     ${tierCounts.zombie_risk + tierCounts.escalation_90} tasks`,
        `Zombie Review (180+d):     ${tierCounts.zombie_review} tasks`,
        `Total overdue:             ${nonFinanceTasks.length} tasks`,
        ``,
        `--- COMPLETIONS ---`,
        `Recently completed (24h): ${recentlyCompleted.length} tasks (creator notified)`,
        ``,
        `--- WORKLOAD VISIBILITY ---`,
        `Users with zero active tasks: ${noTaskUsers.filter(u => u.managerName).length} (managers notified)`,
        ``,
        `--- RECURRING TASKS ---`,
        `Overdue: ${overdueRecurring.length} across ${Object.keys(recurringByAssignee).length} people`,
        ``,
        `--- EMAILS ---`,
        `Unread (7 days): ${emailStats.totalUnread}, High Priority: ${emailStats.highPriority}`,
        `Critical unanswered (24h+): ${criticalEmails.length}, Long unanswered (72h+): ${longUnanswered.length}`,
        ``,
        `--- ATTENDANCE ---`,
        `Missing attendance today: ${todayMissing.length} employees`,
        `Incomplete records (7d): ${incompleteAttendanceCount} records across ${attendanceDetailed.filter(e => e.incompleteCount > 0).length} employees`,
        `Absent without leave (7d): ${absentWithoutLeaveCount} instances`,
        `People with attendance anomalies: ${attendanceAnomalyCount}`,
        ``,
        `--- DAILY WORK REPORTS ---`,
        `Missing DWARs this week: ${dwarDetailed.filter(g => g.missingDays > 0).length} employees`,
        `  - Escalated to manager (≥3 missing): ${dwarDetailed.filter(g => g.missingDays >= 3).length}`,
        `  - Warning (2 consecutive): ${dwarDetailed.filter(g => g.consecutiveMissing >= 2 && g.missingDays < 3).length}`,
        `  - Reminder (1 missing): ${dwarDetailed.filter(g => g.missingDays === 1).length}`,
        `Incomplete/empty DWARs: ${dwarIncompleteCount} employees`,
        ``,
        `--- LEAVE REQUESTS ---`,
        `Total pending: ${pendingLeaves.length}`,
        `  - Expired (date passed): ${leaveClosureCount}`,
        `  - Escalation (>7 days): ${leaveEscalationCount}`,
        `  - Reminder (>3 days): ${leavePendingReminderCount}`,
        ``,
        `--- MEETING COMMITMENTS ---`,
        `Total overdue: ${detailedCommitments.length} across ${Object.keys(commitmentsByAssignee).length} people`,
        `  - Escalated to manager (>30d): ${commitmentEscalatedCount}`,
        `  - Overdue (notified assignee): ${commitmentOverdueCount}`,
        `  - Not linked to task: ${commitmentNoTaskCount}`,
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
