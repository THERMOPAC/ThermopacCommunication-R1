import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { notificationService } from '../framework/notification-service';
import { actionExecutor } from '../framework/action-executor';
import { agentDataRepo } from '../data-access/agent-data-repo';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const SOURCE_AGENT = 'communicator';

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
      return 'Task overdue for 30+ days indicates a systemic follow-up failure. Both the assignee and creator\'s manager have been notified.';
    case 'escalation_60':
      return 'Task overdue for 60+ days is a serious concern. All stakeholders including both managers have been notified.';
    case 'escalation_90':
    case 'zombie_risk':
      return 'ZOMBIE-RISK: Task overdue for 90+ days. Management review required to decide: reassign, close, or escalate.';
    case 'zombie_review':
      return 'ZOMBIE TASK: Overdue for 180+ days. Immediate closure or formal reassignment required.';
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

const COOLDOWN_DAYS = 7;

async function hasOpenAgentTask(fingerprint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status NOT IN ('completed', 'cancelled')
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function hasRecentAgentTask(fingerprint: string, cooldownDays: number = COOLDOWN_DAYS): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND category LIKE ${'%' + fingerprint + '%'}
      AND created_at::timestamp > NOW() - INTERVAL '1 day' * ${cooldownDays}
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

function makeFingerprint(findingType: string, entityKey: string): string {
  return `[fp:${findingType}:${entityKey}]`;
}

function tierToAssigneeRule(tier: EscalationTier, task: any): { assignedTo: number | null; stage: string; priority: string } {
  switch (tier) {
    case 'reminder_1':
    case 'reminder_2':
    case 'reminder_3':
      return { assignedTo: task.assigneeId, stage: 'Stage 1: Assignee', priority: tier === 'reminder_1' ? 'Medium' : 'High' };
    case 'creator_notify':
      return { assignedTo: task.creatorId, stage: 'Stage 2: Creator', priority: 'High' };
    case 'escalation_30':
      return { assignedTo: task.creatorId, stage: 'Stage 2: Creator Review', priority: 'High' };
    case 'escalation_60':
      return { assignedTo: task.creatorManagerId || task.creatorId, stage: 'Stage 3: Creator Manager', priority: 'Urgent' };
    case 'escalation_90':
    case 'zombie_risk':
      return { assignedTo: task.assigneeManagerId || task.creatorManagerId || 1, stage: 'Stage 4: Management Review', priority: 'Urgent' };
    case 'zombie_review':
      return { assignedTo: 1, stage: 'Stage 5: Superuser Closure', priority: 'Urgent' };
  }
}

async function isFirstRun(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM agent_runs 
    WHERE agent_key = 'communications' AND status = 'completed'
  `);
  return Number((result.rows as any[])[0]?.cnt || 0) === 0;
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closedCount = 0;

  const openAgentTasks = await db.execute(sql`
    SELECT id, category, title FROM tasks
    WHERE source_type = 'agent_task'
      AND source_agent = 'communicator'
      AND status NOT IN ('completed', 'cancelled')
      AND category IS NOT NULL
  `);

  for (const task of (openAgentTasks.rows || []) as any[]) {
    const cat = task.category || '';
    let shouldClose = false;
    let closeReason = '';

    const fpMatch = cat.match(/\[fp:(\w+):(.+?)\]/);
    if (!fpMatch) continue;
    const [, fpType, fpEntity] = fpMatch;

    try {
      if (fpType === 'leave_expired' || fpType === 'leave_escalation' || fpType === 'leave_reminder') {
        const leaveId = fpEntity.replace('leave:', '');
        const check = await db.execute(sql`
          SELECT status FROM leave_requests WHERE id = ${Number(leaveId)}
        `);
        if ((check.rows as any[])[0]?.status !== 'Pending') {
          shouldClose = true;
          closeReason = 'Leave request is no longer pending';
        }
      }

      if (fpType === 'dwar_missing' || fpType === 'dwar_warning') {
        const userId = Number(fpEntity);
        const check = await db.execute(sql`
          SELECT COUNT(*) as cnt FROM (
            SELECT d::date AS work_date
            FROM generate_series(
              date_trunc('week', CURRENT_DATE),
              CURRENT_DATE - INTERVAL '1 day',
              '1 day'
            ) d
            WHERE EXTRACT(DOW FROM d::date) NOT IN (0, 6)
            EXCEPT
            SELECT date::date FROM daily_work_reports WHERE user_id = ${userId}
          ) missing
        `);
        if (Number((check.rows as any[])[0]?.cnt || 0) === 0) {
          shouldClose = true;
          closeReason = 'All DWARs have been submitted';
        }
      }

      if (fpType === 'attendance_incomplete') {
        const userId = Number(fpEntity);
        const check = await db.execute(sql`
          SELECT COUNT(*) as cnt FROM attendance_records
          WHERE user_id = ${userId}
            AND date::date > CURRENT_DATE - INTERVAL '7 days'
            AND check_in IS NOT NULL AND check_out IS NULL
        `);
        if (Number((check.rows as any[])[0]?.cnt || 0) === 0) {
          shouldClose = true;
          closeReason = 'Attendance records have been completed';
        }
      }

      if (fpType.startsWith('overdue_tier') || fpType.startsWith('overdue_escalation') || fpType === 'zombie_risk' || fpType === 'zombie_review') {
        const taskIdMatch = fpEntity.match(/task:(\d+)/);
        if (taskIdMatch) {
          const origTaskId = Number(taskIdMatch[1]);
          const check = await db.execute(sql`
            SELECT status FROM tasks WHERE id = ${origTaskId}
          `);
          if (['completed', 'cancelled'].includes((check.rows as any[])[0]?.status)) {
            shouldClose = true;
            closeReason = 'Original task has been completed/cancelled';
          }
        }
      }

      if (shouldClose) {
        await db.execute(sql`
          UPDATE tasks SET status = 'completed',
            completed_at = ${new Date().toISOString().split('T')[0]},
            description = description || ${'\n\n[Auto-closed by Communications Agent: ' + closeReason + ']'}
          WHERE id = ${task.id}
        `);
        closedCount++;
      }
    } catch (err: any) {
      // Silently skip — table may not exist for some fingerprint types
    }
  }

  return closedCount;
}

export class CommunicationsAgent implements IAgent {
  key = 'communications';
  displayName = 'Communications Agent';
  category = 'operations';

  getSubscribedEvents(): string[] {
    return ['task.overdue', 'dwar.missing', 'attendance.anomaly', 'leave.pending', 'meeting.overdue'];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    let findingsCount = 0;
    let insightsCount = 0;
    let recommendationsCount = 0;
    let queriesRun = 0;
    let autoExecutedCount = 0;
    let autoClosedCount = 0;
    const autoExecuteQueue: number[] = [];

    const firstRun = await isFirstRun();

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) {
        console.log(`[Communications] Auto-closed ${autoClosedCount} resolved agent tasks`);
      }
    } catch (err: any) {
      console.error(`[Communications] Auto-close sweep error:`, err.message);
    }

    const skipTaskCreation = firstRun;
    if (firstRun) {
      console.log(`[Communications] FIRST RUN detected — findings/insights only, no tasks created (historical backlog suppressed)`);
    }

    const allOverdueTasks = await agentDataRepo.getOverdueTasksWithEscalation();
    queriesRun++;
    const nonFinanceTasks = allOverdueTasks.filter(t => !isFinanceTask(t));

    const tasksByTier: Record<string, typeof nonFinanceTasks> = {
      reminder_1: [], reminder_2: [], reminder_3: [], creator_notify: [],
      escalation_30: [], escalation_60: [], escalation_90: [],
      zombie_risk: [], zombie_review: [],
    };

    const tierCounts = { reminder_1: 0, reminder_2: 0, reminder_3: 0, creator_notify: 0,
      escalation_30: 0, escalation_60: 0, escalation_90: 0, zombie_risk: 0, zombie_review: 0 };

    for (const task of nonFinanceTasks) {
      const tier = getEscalationTier(task.daysOverdue);
      tasksByTier[tier].push(task);
      tierCounts[tier as keyof typeof tierCounts]++;
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 1-7: OVERDUE TASK ESCALATION TIERS ───
    // ─── [AUTOMATED: Task creation per tier with escalation ladder] ───
    // ═══════════════════════════════════════════════════════════════

    const tier1ByAssignee: Record<string, typeof nonFinanceTasks> = {};
    for (const t of tasksByTier.reminder_1) {
      const key = t.assigneeName || 'Unassigned';
      if (!tier1ByAssignee[key]) tier1ByAssignee[key] = [];
      tier1ByAssignee[key].push(t);
    }
    for (const [assignee, tasks] of Object.entries(tier1ByAssignee)) {
      const topTasks = tasks.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
      const topList = topTasks.map(t => `  • "${t.title}" (${t.daysOverdue}d overdue)`).join('\n');
      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: 'low',
        title: `${assignee}: ${tasks.length} task${tasks.length > 1 ? 's' : ''} overdue 1-6 days — 1st Reminder`,
        description: [
          `${assignee} has ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''} in the 1-6 day range.`,
          `\n${getTierLabel('reminder_1')}`,
          `\nTop overdue:\n${topList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
          `\n${getBusinessImpactForTier('reminder_1')}`,
        ].filter(Boolean).join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'reminder_1', assigneeName: assignee, taskCount: tasks.length,
          topTasks: topTasks.map(t => ({ id: t.id, title: t.title, daysOverdue: t.daysOverdue })) },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `${assignee}:tier1`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    const tier2ByAssignee: Record<string, typeof nonFinanceTasks> = {};
    for (const t of tasksByTier.reminder_2) {
      const key = t.assigneeName || 'Unassigned';
      if (!tier2ByAssignee[key]) tier2ByAssignee[key] = [];
      tier2ByAssignee[key].push(t);
    }
    for (const [assignee, tasks] of Object.entries(tier2ByAssignee)) {
      const topTasks = tasks.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
      const topList = topTasks.map(t => `  • "${t.title}" (${t.daysOverdue}d overdue)`).join('\n');
      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: 'medium',
        title: `${assignee}: ${tasks.length} task${tasks.length > 1 ? 's' : ''} overdue 7-14 days — 2nd Reminder`,
        description: [
          `${assignee} has ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''} in the 7-14 day range.`,
          `\n${getTierLabel('reminder_2')}`,
          `\nTop overdue:\n${topList}`,
          tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
          `\n${getBusinessImpactForTier('reminder_2')}`,
        ].filter(Boolean).join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'reminder_2', assigneeName: assignee, taskCount: tasks.length,
          topTasks: topTasks.map(t => ({ id: t.id, title: t.title, daysOverdue: t.daysOverdue })) },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `${assignee}:tier2`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    for (const task of tasksByTier.reminder_3) {
      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity: 'medium',
        title: `"${task.title}" — ${task.daysOverdue} days overdue — Strong Reminder`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `Created by: ${task.creatorName} | Priority: ${task.priority}`,
          `\n${getTierLabel('reminder_3')}`,
          `\n${getNotifyTargets('reminder_3', task).join('\n')}`,
          `\n${getBusinessImpactForTier('reminder_3')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'reminder_3', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, creatorName: task.creatorName },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:tier3`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    for (const task of tasksByTier.escalation_30) {
      const notifyTargets = getNotifyTargets('escalation_30', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'high',
        title: `"${task.title}" — ${task.daysOverdue} days overdue — Escalation L1`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `\nEscalation: ${getTierLabel('escalation_30')}`,
          `\n${notifyTargets.join('\n')}`,
          `\n${getBusinessImpactForTier('escalation_30')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'escalation_30', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:escalation_30`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    for (const task of tasksByTier.escalation_60) {
      const notifyTargets = getNotifyTargets('escalation_60', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'high',
        title: `"${task.title}" — ${task.daysOverdue} days overdue — Escalation L2`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `\nEscalation: ${getTierLabel('escalation_60')}`,
          `\n${notifyTargets.join('\n')}`,
          `\n${getBusinessImpactForTier('escalation_60')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'escalation_60', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:escalation_60`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    for (const task of [...tasksByTier.escalation_90, ...tasksByTier.zombie_risk]) {
      const notifyTargets = getNotifyTargets('zombie_risk', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'critical',
        title: `ZOMBIE-RISK: "${task.title}" — ${task.daysOverdue} days overdue`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `\n${notifyTargets.join('\n')}`,
          `\n${getBusinessImpactForTier('zombie_risk')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'zombie_risk', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:zombie`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    for (const task of tasksByTier.zombie_review) {
      const notifyTargets = getNotifyTargets('zombie_review', task);
      const result = await findingManager.createFinding({
        findingType: 'escalation',
        severity: 'critical',
        title: `ZOMBIE TASK: "${task.title}" — ${task.daysOverdue} days overdue — Immediate Closure Required`,
        description: [
          `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.`,
          `\n${notifyTargets.join('\n')}`,
          `\n${getBusinessImpactForTier('zombie_review')}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { tier: 'zombie_review', taskId: task.id, title: task.title, daysOverdue: task.daysOverdue,
          assigneeName: task.assigneeName, notifyTargets },
        relatedEntityType: 'task_escalation',
        relatedEntityId: `task:${task.id}:zombie_review`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 8: TASK COMPLETED ───
    // ─── [SUPPRESSED: Positive event, no action needed] ───
    // ═══════════════════════════════════════════════════════════════
    const recentlyCompleted = await agentDataRepo.getRecentlyCompletedTasks(1);
    queriesRun++;

    for (const task of recentlyCompleted) {
      const result = await findingManager.createFinding({
        findingType: 'completion',
        severity: 'low',
        title: `✅ Task completed: "${task.title}"`,
        description: [
          `Task "${task.title}" has been marked as completed by ${task.assigneeName}.`,
          `Completed at: ${task.completedAt}`,
          `Creator: ${task.creatorName}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { taskId: task.id, title: task.title, assigneeName: task.assigneeName,
          creatorName: task.creatorName, completedAt: task.completedAt },
        relatedEntityType: 'task_completion',
        relatedEntityId: `task:${task.id}:completed`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 9: NO WORKLOAD VISIBILITY ───
    // ─── [SUPPRESSED: Unreliable for field/production staff] ───
    // ═══════════════════════════════════════════════════════════════
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
          `\nThis is a workload visibility finding, not a disciplinary issue.`,
          `The employee may be actively working but tasks are not being captured in the system.`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { userId: user.userId, employeeName: user.employeeName,
          managerId: user.managerId, managerName: user.managerName },
        relatedEntityType: 'workload_visibility',
        relatedEntityId: `user:${user.userId}:no_tasks`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 10: OVERDUE RECURRING TASKS ───
    // ─── [AUTOMATED: Create grouped review task per assignee] ───
    // ═══════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 11-12: UNANSWERED EMAILS ───
    // ─── [AUTOMATED: P0/P1 creates response task; 72h+ creates review task] ───
    // ═══════════════════════════════════════════════════════════════
    const unansweredEmails = await agentDataRepo.getUnansweredEmails(24);
    queriesRun++;

    const criticalEmails = unansweredEmails.filter(e => ['P0', 'P1'].includes(e.priority) && e.hoursUnanswered >= 24);
    for (const email of criticalEmails) {
      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity: email.priority === 'P0' ? 'critical' as const : 'high' as const,
        title: `${email.priority} email unanswered for ${email.hoursUnanswered}h: "${email.subject}"`,
        description: `A ${email.priority} priority email from ${email.fromAddress} with subject "${email.subject}" has been unanswered for ${email.hoursUnanswered} hours.\n\nHigh-priority emails require timely response.`,
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

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 13-15: ATTENDANCE MONITORING (7-DAY) ───
    // ─── [AUTOMATED: 2+ absent without leave → task for manager] ───
    // ─── [AUTOMATED: 3+ incomplete → task for employee] ───
    // ─── [SUPPRESSED: 1 absent / 1-2 incomplete → too minor] ───
    // ═══════════════════════════════════════════════════════════════
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
        const result = await findingManager.createFinding({
          findingType: 'anomaly',
          severity,
          title: `${emp.employeeName}: ${emp.absentWithoutLeaveCount} absence${emp.absentWithoutLeaveCount > 1 ? 's' : ''} without approved leave (7 days)`,
          description: [
            `${emp.employeeName} was absent on ${emp.absentWithoutLeaveCount} day${emp.absentWithoutLeaveCount > 1 ? 's' : ''} without any approved leave request in the last 7 days.`,
            `Absent dates: ${emp.absentDates.join(', ')}`,
            severity !== 'low'
              ? `\n→ Escalate to: ${emp.managerName || 'Reporting Manager'}`
              : `\n→ Notify: ${emp.employeeName}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...emp },
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
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...emp },
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
            `${emp.employeeName} has ${emp.incompleteCount} incomplete attendance record${emp.incompleteCount > 1 ? 's' : ''} in the last 7 days.`,
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
        ].filter(Boolean).join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { count: todayMissing.length, employees: todayMissing.slice(0, 10) },
        relatedEntityType: 'attendance',
        relatedEntityId: `today:missing_attendance`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 16-19: DWAR MONITORING ───
    // ─── [AUTOMATED: 3+ missing → task for employee + mgr escalation] ───
    // ─── [AUTOMATED: 2 consecutive → warning task for employee] ───
    // ─── [SUPPRESSED: 1 missing → too minor for task] ───
    // ─── [AUTOMATED: incomplete/empty → task for employee] ───
    // ═══════════════════════════════════════════════════════════════
    const dwarDetailed = await agentDataRepo.getDetailedDWARGaps();
    queriesRun++;

    let dwarMissingCount = 0;

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
            `${gap.employeeName} has not submitted daily work reports for ${gap.missingDays} working day${gap.missingDays > 1 ? 's' : ''}.`,
            gap.consecutiveMissing >= 2 ? `${gap.consecutiveMissing} consecutive missing DWARs detected.` : '',
            `Missing dates: ${gap.missingDates.join(', ')}`,
            `\n→ Escalate to: ${gap.managerName || 'Reporting Manager'}`,
          ].filter(Boolean).join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...gap },
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
            `\nTwo consecutive missing DWARs trigger a warning. A third will escalate to your reporting manager.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...gap },
          relatedEntityType: 'dwar',
          relatedEntityId: `${gap.userId}:dwar_warning`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else if (gap.missingDays >= 1) {
        dwarMissingCount++;
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity: 'low',
          title: `${gap.employeeName}: ${gap.missingDays} missing DWAR${gap.missingDays > 1 ? 's' : ''} this week`,
          description: [
            `${gap.employeeName} has not submitted daily work report${gap.missingDays > 1 ? 's' : ''} for ${gap.missingDays} working day${gap.missingDays > 1 ? 's' : ''}.`,
            `Missing dates: ${gap.missingDates.join(', ')}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { userId: gap.userId, employeeName: gap.employeeName, missingDays: gap.missingDays },
          relatedEntityType: 'dwar',
          relatedEntityId: `${gap.userId}:dwar_reminder`,
        });
        if (!result.isDuplicate) findingsCount++;
      }

      if (gap.incompleteDwarCount > 0) {
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity: 'low',
          title: `${gap.employeeName}: ${gap.incompleteDwarCount} incomplete/empty DWAR${gap.incompleteDwarCount > 1 ? 's' : ''} this week`,
          description: [
            `${gap.employeeName} submitted ${gap.incompleteDwarCount} daily work report${gap.incompleteDwarCount > 1 ? 's' : ''} with minimal or no content.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { userId: gap.userId, employeeName: gap.employeeName, incompleteDwarCount: gap.incompleteDwarCount },
          relatedEntityType: 'dwar',
          relatedEntityId: `${gap.userId}:dwar_incomplete`,
        });
        if (!result.isDuplicate) findingsCount++;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 20-23: LEAVE REQUEST MONITORING ───
    // ─── [AUTOMATED: All leave findings → task for manager] ───
    // ═══════════════════════════════════════════════════════════════
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
            `\n→ Manager: ${leave.managerName || 'Approving Manager'} — approve retroactively or reject.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...leave },
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
            `\n→ Escalation: Pending >7 days — requires immediate manager action.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...leave },
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
            `\n→ Reminder to: ${leave.managerName || 'Approving Manager'}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...leave },
          relatedEntityType: 'leave_request',
          relatedEntityId: `leave:${leave.id}:reminder`,
        });
        if (!result.isDuplicate) findingsCount++;
      } else {
        leavePendingReminderCount++;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 24-26: MEETINGS & COMMITMENTS ───
    // ─── [AUTOMATED: All overdue → task for assignee / manager] ───
    // ─── [AUTOMATED: No linked task → create task from commitment] ───
    // ═══════════════════════════════════════════════════════════════
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
            `\n→ Escalate to: ${commitment.managerName || 'Reporting Manager'}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...commitment },
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
            `Assigned to: ${commitment.assigneeName} | Due: ${commitment.dueDate}`,
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
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { commitmentId: commitment.id, title: commitment.title, assigneeName: commitment.assigneeName },
          relatedEntityType: 'meeting_commitment',
          relatedEntityId: `commitment:${commitment.id}:no_task`,
        });
        if (!result.isDuplicate) findingsCount++;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 27: UNREAD INTERNAL MESSAGES ───
    // ─── [WEEKLY SUMMARY: Contributes to consolidated review task] ───
    // ═══════════════════════════════════════════════════════════════
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
          `\nUnread messages may indicate communication breakdowns within the team.`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: { count: unreadMessages.length },
        relatedEntityType: 'internal_message',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 28: DWAR QUALITY SCORING ───
    // ─── [AUTOMATED: Score ≤30 → task for employee] ───
    // ═══════════════════════════════════════════════════════════════
    const dwarQuality = await agentDataRepo.getDWARQualityScores();
    queriesRun++;

    let dwarQualityFindingsCount = 0;
    for (const dq of dwarQuality) {
      if (dq.poorCount + dq.emptyCount >= 2 || dq.avgScore < 30) {
        const severity = dq.avgScore < 20 ? 'high' as const : 'medium' as const;
        const result = await findingManager.createFinding({
          findingType: 'gap',
          severity,
          title: `${dq.employeeName}: Low DWAR quality score (${dq.avgScore}/100) — ${dq.poorCount + dq.emptyCount} poor/empty reports`,
          description: [
            `${dq.employeeName}'s daily work reports quality this week:`,
            `  Complete: ${dq.completeCount} | Weak: ${dq.weakCount} | Poor: ${dq.poorCount} | Empty: ${dq.emptyCount}`,
            `  Average quality score: ${dq.avgScore}/100`,
            `\nScoring: Complete (all 4 fields filled, 80+ chars) = 100, Weak (2-3 fields, 30-79 chars) = 50, Poor (<30 chars or 1 field) = 25, Empty (draft, <10 chars) = 0`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...dq },
          relatedEntityType: 'dwar_quality',
          relatedEntityId: `${dq.userId}:quality`,
        });
        if (!result.isDuplicate) { findingsCount++; dwarQualityFindingsCount++; }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 29-30: 30-DAY ATTENDANCE PATTERNS ───
    // ─── [AUTOMATED: Pattern → task for manager] ───
    // ═══════════════════════════════════════════════════════════════
    const attendancePatterns = await agentDataRepo.getAttendancePatterns30Day();
    queriesRun++;

    let attendancePatternFindingsCount = 0;
    for (const ap of attendancePatterns) {
      if (ap.hasWeekendPattern) {
        const result = await findingManager.createFinding({
          findingType: 'anomaly',
          severity: 'medium',
          title: `${ap.employeeName}: Monday/Friday absence pattern detected (30-day)`,
          description: [
            `${ap.employeeName} has a noticeable Monday/Friday absence pattern over the last 30 days.`,
            `Total absences: ${ap.totalAbsent} | Monday: ${ap.mondayAbsences} | Friday: ${ap.fridayAbsences}`,
            `Absent without leave: ${ap.absentWithoutLeave}`,
            `\n→ Escalate to: ${ap.managerName || 'Reporting Manager'}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...ap },
          relatedEntityType: 'attendance_pattern',
          relatedEntityId: `${ap.userId}:weekend_pattern`,
        });
        if (!result.isDuplicate) { findingsCount++; attendancePatternFindingsCount++; }
      }

      if (ap.absentWithoutLeave >= 3) {
        const result = await findingManager.createFinding({
          findingType: 'escalation',
          severity: 'high',
          title: `${ap.employeeName}: ${ap.absentWithoutLeave} absences without leave (30-day pattern)`,
          description: [
            `${ap.employeeName} has been absent without approved leave ${ap.absentWithoutLeave} times in the last 30 days.`,
            `Total absences: ${ap.totalAbsent} | Incomplete records: ${ap.totalIncomplete}`,
            `\n→ Escalate to: ${ap.managerName || 'Reporting Manager'}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...ap },
          relatedEntityType: 'attendance_pattern',
          relatedEntityId: `${ap.userId}:30d_absent_no_leave`,
        });
        if (!result.isDuplicate) { findingsCount++; attendancePatternFindingsCount++; }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 31-32: LEAVE BALANCE ALERTS ───
    // ─── [SUPPRESSED: Informational — no actionable task] ───
    // ═══════════════════════════════════════════════════════════════
    const leaveBalances = await agentDataRepo.getLeaveBalanceAlerts();
    queriesRun++;

    let leaveBalanceFindingsCount = 0;
    for (const lb of leaveBalances) {
      if (lb.remaining <= 0 && lb.pendingRequests > 0) {
        const result = await findingManager.createFinding({
          findingType: 'risk',
          severity: 'medium',
          title: `${lb.employeeName}: Zero ${lb.leaveType} balance with ${lb.pendingRequests} pending request(s)`,
          description: [
            `${lb.employeeName} has exhausted their ${lb.leaveType} balance.`,
            `Entitled: ${lb.totalEntitled} | Used: ${lb.used} | Remaining: ${lb.remaining}`,
            `Pending leave requests: ${lb.pendingRequests}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...lb },
          relatedEntityType: 'leave_balance',
          relatedEntityId: `${lb.userId}:${lb.leaveType}:balance`,
        });
        if (!result.isDuplicate) { findingsCount++; leaveBalanceFindingsCount++; }
      } else if (lb.remaining <= 1) {
        const result = await findingManager.createFinding({
          findingType: 'risk',
          severity: 'low',
          title: `${lb.employeeName}: Low ${lb.leaveType} balance (${lb.remaining} remaining)`,
          description: [
            `${lb.employeeName} has only ${lb.remaining} ${lb.leaveType} day(s) remaining.`,
            `Entitled: ${lb.totalEntitled} | Used: ${lb.used}`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: { ...lb },
          relatedEntityType: 'leave_balance',
          relatedEntityId: `${lb.userId}:${lb.leaveType}:low_balance`,
        });
        if (!result.isDuplicate) { findingsCount++; leaveBalanceFindingsCount++; }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── FINDING TYPE 33-34: MEETING DISCIPLINE METRICS ───
    // ─── [WEEKLY SUMMARY: Contributes to consolidated review task] ───
    // ═══════════════════════════════════════════════════════════════
    const meetingDiscipline = await agentDataRepo.getMeetingDisciplineMetrics();
    queriesRun++;

    let meetingDisciplineFindingsCount = 0;
    if (meetingDiscipline.completionRate < 50 && meetingDiscipline.totalCommitments >= 5) {
      const result = await findingManager.createFinding({
        findingType: 'risk',
        severity: 'high',
        title: `Meeting commitment completion rate critically low: ${meetingDiscipline.completionRate}%`,
        description: [
          `Only ${meetingDiscipline.completionRate}% of meeting commitments have been completed.`,
          `Total: ${meetingDiscipline.totalCommitments} | Completed: ${meetingDiscipline.completedCommitments} | Overdue: ${meetingDiscipline.overdueCommitments}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: meetingDiscipline,
        relatedEntityType: 'meeting_discipline',
        relatedEntityId: 'completion_rate',
      });
      if (!result.isDuplicate) { findingsCount++; meetingDisciplineFindingsCount++; }
    }

    for (const offender of meetingDiscipline.repeatOffenders) {
      if (offender.overdueCount >= 3) {
        const result = await findingManager.createFinding({
          findingType: 'escalation',
          severity: 'medium',
          title: `${offender.employeeName}: ${offender.overdueCount} overdue meeting commitments — repeat pattern`,
          description: [
            `${offender.employeeName} has ${offender.overdueCount} overdue meeting commitments.`,
            `This indicates a pattern of not following through on meeting action items.`,
          ].join('\n'),
          logicType: 'rule_based',
          dataSnapshot: offender,
          relatedEntityType: 'meeting_discipline',
          relatedEntityId: `${offender.userId}:repeat_offender`,
        });
        if (!result.isDuplicate) { findingsCount++; meetingDisciplineFindingsCount++; }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════
    // ═══════  TASK CREATION ENGINE (28 + 5 + 5 MODEL)  ═══════════════════
    // ═══════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════

    // Query inactive user tasks before the skip guard — needed for insight summary
    const inactiveUserTasks = await agentDataRepo.getTasksAssignedToInactiveUsers();
    queriesRun++;

    // ─── GROUP A: 28 AUTOMATED TASK-CREATING FINDINGS ───
    // On first run, skip all task creation to avoid flooding with historical backlog

    if (!skipTaskCreation) {

    // A1-A7: OVERDUE TASK ESCALATION — create review task per tier with escalation ladder
    // Tier 1-2: Grouped per assignee → one task listing all overdue items
    for (const [assignee, tasks] of Object.entries(tier1ByAssignee)) {
      if (tasks.length === 0) continue;
      const firstTask = tasks[0];
      const fp = makeFingerprint('overdue_tier1', `${firstTask.assigneeId || assignee}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const topList = tasks.slice(0, 5).map(t => `• "${t.title}" (${t.daysOverdue}d overdue)`).join('\n');
      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Overdue task review for ${assignee} (${tasks.length} tasks, 1-6 days)`,
        description: `${assignee} has ${tasks.length} tasks overdue 1-6 days. Create a review task.`,
        actionPayload: {
          title: `[Agent] Review ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''} (1-6 days)`,
          description: `You have ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''} in the 1-6 day range.\n\n${topList}${tasks.length > 5 ? `\n...and ${tasks.length - 5} more` : ''}\n\nPlease update progress, complete, or request deadline extensions.\n\nSource: Communications Agent — Stage 1: Assignee Review`,
          priority: 'Medium',
          assignedTo: firstTask.assigneeId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    for (const [assignee, tasks] of Object.entries(tier2ByAssignee)) {
      if (tasks.length === 0) continue;
      const firstTask = tasks[0];
      const fp = makeFingerprint('overdue_tier2', `${firstTask.assigneeId || assignee}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const topList = tasks.slice(0, 5).map(t => `• "${t.title}" (${t.daysOverdue}d overdue)`).join('\n');
      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Overdue task review for ${assignee} (${tasks.length} tasks, 7-14 days)`,
        description: `${assignee} has ${tasks.length} tasks overdue 7-14 days. Second reminder.`,
        actionPayload: {
          title: `[Agent] Review ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''} (7-14 days) — 2nd Reminder`,
          description: `You have ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''} in the 7-14 day range.\n\n${topList}${tasks.length > 5 ? `\n...and ${tasks.length - 5} more` : ''}\n\nThis is your second reminder. Please prioritize these or communicate blockers.\n\nSource: Communications Agent — Stage 1: Assignee Review`,
          priority: 'High',
          assignedTo: firstTask.assigneeId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // Tier 3: Per-task → assignee review + creator notification
    for (const task of tasksByTier.reminder_3) {
      const fp = makeFingerprint('overdue_tier3', `task:${task.id}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Strong reminder: "${task.title}" (${task.daysOverdue}d overdue)`,
        description: `Task "${task.title}" is ${task.daysOverdue} days overdue. Strong reminder to assignee, notifying creator.`,
        actionPayload: {
          title: `[Agent] Complete overdue task: "${task.title}" (${task.daysOverdue}d) — Strong Reminder`,
          description: `Your task "${task.title}" has been overdue for ${task.daysOverdue} days.\nCreated by: ${task.creatorName}\n\nThis is a strong reminder. If not acted on, this will be escalated to management.\n\nSource: Communications Agent — Stage 1: Assignee Review + Creator Notified`,
          priority: 'High',
          assignedTo: task.assigneeId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // Tier 4-5: Escalation → task for manager
    for (const task of [...tasksByTier.escalation_30, ...tasksByTier.escalation_60]) {
      const tier = getEscalationTier(task.daysOverdue);
      const { assignedTo, stage, priority } = tierToAssigneeRule(tier, task);
      const fp = makeFingerprint(`overdue_${tier}`, `task:${task.id}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Escalation: "${task.title}" (${task.daysOverdue}d overdue) → Manager`,
        description: `Task "${task.title}" is ${task.daysOverdue} days overdue. Escalated to manager.`,
        actionPayload: {
          title: `[Agent] ESCALATION: Review overdue task "${task.title}" (${task.daysOverdue}d)`,
          description: `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.\nCreated by: ${task.creatorName}\n\nThis task has been escalated because previous reminders to the assignee were not acted on.\n\nRequired action: Review with assignee, reassign if needed, or close with justification.\n\nSource: Communications Agent — ${stage}`,
          priority,
          assignedTo,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.95,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A6: ZOMBIE-RISK (90-179d) → management review task
    for (const task of [...tasksByTier.escalation_90, ...tasksByTier.zombie_risk]) {
      const { assignedTo, stage, priority } = tierToAssigneeRule('zombie_risk', task);
      const fp = makeFingerprint('zombie_risk', `task:${task.id}`);
      if (await hasRecentAgentTask(fp, 14)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Zombie-risk review: "${task.title}" (${task.daysOverdue}d overdue)`,
        description: `Task "${task.title}" is ${task.daysOverdue} days overdue. Management review required.`,
        actionPayload: {
          title: `[Agent] ZOMBIE-RISK: Review "${task.title}" (${task.daysOverdue}d overdue)`,
          description: `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.\nCreated by: ${task.creatorName}\n\nThis task is at zombie-risk — it has been overdue for 90+ days through all reminders.\n\nRequired action: Review with assignee, reassign, or close with justification.\n\nSource: Communications Agent — ${stage}`,
          priority,
          assignedTo,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.95,
        priority: 'urgent',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A7: ZOMBIE REVIEW (180+d) → superuser closure task
    for (const task of tasksByTier.zombie_review) {
      const { assignedTo, stage, priority } = tierToAssigneeRule('zombie_review', task);
      const fp = makeFingerprint('zombie_review', `task:${task.id}`);
      if (await hasRecentAgentTask(fp, 14)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Zombie closure required: "${task.title}" (${task.daysOverdue}d overdue)`,
        description: `Task "${task.title}" is ${task.daysOverdue} days overdue. Superuser closure required.`,
        actionPayload: {
          title: `[Agent] ZOMBIE TASK: Close or reassign "${task.title}" (${task.daysOverdue}d overdue)`,
          description: `Task "${task.title}" assigned to ${task.assigneeName} has been overdue for ${task.daysOverdue} days.\nCreated by: ${task.creatorName}\n\nThis task is classified as a ZOMBIE — overdue 180+ days, ignored through all escalation stages.\n\nImmediate action required: Close as not applicable, formally reassign, or escalate as process failure.\n\nSource: Communications Agent — ${stage}`,
          priority,
          assignedTo,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.95,
        priority: 'urgent',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A8: OVERDUE RECURRING TASKS — grouped per assignee
    for (const [assignee, tasks] of Object.entries(recurringByAssignee)) {
      if (tasks.length === 0) continue;
      const firstTask = tasks[0];
      const fp = makeFingerprint('recurring_overdue', `${firstTask.assigneeId || assignee}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const maxDays = Math.max(...tasks.map(t => t.daysOverdue));
      const topList = tasks.slice(0, 5).map(t => `• ${t.title} (${t.daysOverdue}d overdue)`).join('\n');
      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Recurring task backlog for ${assignee} (${tasks.length} tasks)`,
        description: `${assignee} has ${tasks.length} overdue recurring tasks. Worst: ${maxDays} days.`,
        actionPayload: {
          title: `[Agent] Review ${tasks.length} overdue recurring task${tasks.length > 1 ? 's' : ''} (worst: ${maxDays}d)`,
          description: `You have ${tasks.length} overdue recurring task${tasks.length > 1 ? 's' : ''}.\n\n${topList}${tasks.length > 5 ? `\n...and ${tasks.length - 5} more` : ''}\n\nRecurring tasks represent scheduled responsibilities. Please complete or reschedule.\n\nSource: Communications Agent`,
          priority: maxDays >= 30 ? 'High' : 'Medium',
          assignedTo: firstTask.assigneeId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A9: P0/P1 UNANSWERED EMAILS — response task per email
    for (const email of criticalEmails) {
      if (!email.userId) continue;
      const fp = makeFingerprint('email_response', `email:${email.id}`);
      if (await hasRecentAgentTask(fp, 3)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Respond to ${email.priority} email: "${email.subject}"`,
        description: `${email.priority} email from ${email.fromAddress} unanswered for ${email.hoursUnanswered}h.`,
        actionPayload: {
          title: `[Agent] Respond to ${email.priority} email: "${email.subject}" (${email.hoursUnanswered}h unanswered)`,
          description: `A ${email.priority} priority email from ${email.fromAddress} requires your response.\nSubject: "${email.subject}"\nUnanswered for: ${email.hoursUnanswered} hours\n\nPlease respond or delegate.\n\nSource: Communications Agent`,
          priority: email.priority === 'P0' ? 'Urgent' : 'High',
          assignedTo: email.userId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A10: 72h+ UNANSWERED P2+ PRIORITY EMAILS — review task (P3/low excluded)
    for (const email of longUnanswered) {
      if (!email.userId) continue;
      if (email.priority === 'P3') continue;
      const fp = makeFingerprint('email_review', `email:${email.id}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Review unanswered email: "${email.subject}" (${email.hoursUnanswered}h)`,
        description: `Email from ${email.fromAddress} unanswered for ${email.hoursUnanswered}h.`,
        actionPayload: {
          title: `[Agent] Review unanswered email: "${email.subject}" (${email.hoursUnanswered}h)`,
          description: `An email from ${email.fromAddress} has been unanswered for ${email.hoursUnanswered} hours.\nSubject: "${email.subject}"\n\nPlease respond, delegate, or archive if no response needed.\n\nSource: Communications Agent`,
          priority: 'Medium',
          assignedTo: email.userId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.8,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A11: ABSENT WITHOUT LEAVE (2+) — attendance review task for manager
    for (const emp of attendanceDetailed) {
      if (emp.absentWithoutLeaveCount < 2) continue;
      const fp = makeFingerprint('attendance_absent', `${emp.userId}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const managerId = emp.managerId || null;
      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Attendance review: ${emp.employeeName} (${emp.absentWithoutLeaveCount} absences w/o leave)`,
        description: `${emp.employeeName} has ${emp.absentWithoutLeaveCount} absences without approved leave in 7 days.`,
        actionPayload: {
          title: `[Agent] Review attendance: ${emp.employeeName} — ${emp.absentWithoutLeaveCount} absences without leave`,
          description: `${emp.employeeName} was absent on ${emp.absentWithoutLeaveCount} day(s) without any approved leave request in the last 7 days.\nAbsent dates: ${emp.absentDates.join(', ')}\n\nPlease check with ${emp.employeeName} about these absences and ensure leave requests are submitted.\n\nSource: Communications Agent — ${managerId ? 'Manager Review' : 'HR Review'}`,
          priority: emp.absentWithoutLeaveCount >= 3 ? 'High' : 'Medium',
          assignedTo: managerId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: emp.absentWithoutLeaveCount >= 3 ? 'high' : 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A12: INCOMPLETE ATTENDANCE (3+) — task for employee
    for (const emp of attendanceDetailed) {
      if (emp.incompleteCount < 3) continue;
      const fp = makeFingerprint('attendance_incomplete', `${emp.userId}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Complete attendance records: ${emp.employeeName} (${emp.incompleteCount} incomplete)`,
        description: `${emp.employeeName} has ${emp.incompleteCount} incomplete attendance records in 7 days.`,
        actionPayload: {
          title: `[Agent] Complete ${emp.incompleteCount} incomplete attendance records`,
          description: `You have ${emp.incompleteCount} incomplete attendance records (check-in but no check-out) in the last 7 days.\nIncomplete dates: ${emp.incompleteDates.join(', ')}\n\nPlease update your attendance records.\n\nSource: Communications Agent`,
          priority: 'Medium',
          assignedTo: emp.userId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A13: DWAR MISSING (3+) — task for employee
    for (const gap of dwarDetailed) {
      if (gap.missingDays < 3) continue;
      const fp = makeFingerprint('dwar_missing', `${gap.userId}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `DWAR compliance task for ${gap.employeeName} (${gap.missingDays} missing)`,
        description: `${gap.employeeName} has ${gap.missingDays} missing DWARs this week.`,
        actionPayload: {
          title: `[Agent] Submit missing DWARs (${gap.missingDays} days)`,
          description: `You have ${gap.missingDays} missing daily work reports this week.\nMissing dates: ${gap.missingDates.join(', ')}\n\nPlease submit all missing DWARs.\n\nSource: Communications Agent`,
          priority: gap.missingDays >= 5 ? 'High' : 'Medium',
          assignedTo: gap.userId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A14: 2 CONSECUTIVE MISSING DWARs — warning task for employee
    for (const gap of dwarDetailed) {
      if (gap.missingDays >= 3 || gap.consecutiveMissing < 2) continue;
      const fp = makeFingerprint('dwar_warning', `${gap.userId}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `DWAR warning for ${gap.employeeName} (${gap.consecutiveMissing} consecutive)`,
        description: `${gap.employeeName} has ${gap.consecutiveMissing} consecutive missing DWARs.`,
        actionPayload: {
          title: `[Agent] Submit missing DWARs — ${gap.consecutiveMissing} consecutive days missing`,
          description: `You have missed ${gap.consecutiveMissing} consecutive daily work reports.\nMissing dates: ${gap.missingDates.join(', ')}\n\nWarning: A third consecutive missing DWAR will trigger escalation to your manager.\n\nSource: Communications Agent`,
          priority: 'Medium',
          assignedTo: gap.userId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A15: DWAR QUALITY ≤30 — improvement task for employee
    for (const dq of dwarQuality) {
      if (dq.avgScore > 30) continue;
      const fp = makeFingerprint('dwar_quality', `${dq.userId}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `DWAR quality improvement for ${dq.employeeName} (score: ${dq.avgScore}/100)`,
        description: `${dq.employeeName} has a low DWAR quality score (${dq.avgScore}/100).`,
        actionPayload: {
          title: `[Agent] Improve daily work report quality (score: ${dq.avgScore}/100)`,
          description: `Your daily work reports this week have a quality score of ${dq.avgScore}/100.\n\nComplete: ${dq.completeCount} | Weak: ${dq.weakCount} | Poor: ${dq.poorCount} | Empty: ${dq.emptyCount}\n\nPlease ensure your DWARs include:\n1. Detailed description of work done\n2. All relevant fields filled in\n3. Meaningful content (not just a few words)\n\nSource: Communications Agent`,
          priority: dq.avgScore < 20 ? 'High' : 'Medium',
          assignedTo: dq.userId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A16: LEAVE REQUEST EXPIRED — closure task for manager
    for (const leave of pendingLeaves) {
      if (!leave.leaveDatePassed) continue;
      const fp = makeFingerprint('leave_expired', `leave:${leave.id}`);
      if (await hasRecentAgentTask(fp, 14)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Close expired leave: ${leave.employeeName} (${leave.leaveType})`,
        description: `Leave request for ${leave.employeeName} has expired and needs closure.`,
        actionPayload: {
          title: `[Agent] Close expired leave request: ${leave.employeeName} — ${leave.leaveType}`,
          description: `${leave.employeeName}'s ${leave.leaveType} request (${leave.startDate}–${leave.endDate}) is still pending but the leave date has passed (${leave.daysPending} days pending).\n\nPlease approve retroactively if leave was taken, or reject.\n\nSource: Communications Agent`,
          priority: 'High',
          assignedTo: leave.managerId || null,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.95,
        priority: 'urgent',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A17: LEAVE PENDING 7+ DAYS — approval follow-up task for manager
    for (const leave of pendingLeaves) {
      if (leave.leaveDatePassed || leave.daysPending < 7) continue;
      const fp = makeFingerprint('leave_escalation', `leave:${leave.id}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Leave approval overdue: ${leave.employeeName} (${leave.daysPending}d pending)`,
        description: `${leave.employeeName}'s leave request has been pending ${leave.daysPending} days.`,
        actionPayload: {
          title: `[Agent] Approve/reject leave: ${leave.employeeName} — ${leave.leaveType} (${leave.daysPending}d pending)`,
          description: `${leave.employeeName}'s ${leave.leaveType} request (${leave.startDate}–${leave.endDate}) has been pending for ${leave.daysPending} days.\n\nLeave requests pending >7 days require immediate action.\n\nSource: Communications Agent`,
          priority: 'High',
          assignedTo: leave.managerId || null,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A18: LEAVE PENDING 3-6 DAYS — reminder task for manager
    for (const leave of pendingLeaves) {
      if (leave.leaveDatePassed || leave.daysPending < 3 || leave.daysPending >= 7) continue;
      const fp = makeFingerprint('leave_reminder', `leave:${leave.id}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Leave approval reminder: ${leave.employeeName} (${leave.daysPending}d pending)`,
        description: `${leave.employeeName}'s leave request has been pending ${leave.daysPending} days.`,
        actionPayload: {
          title: `[Agent] Review leave request: ${leave.employeeName} — ${leave.leaveType} (${leave.daysPending}d pending)`,
          description: `${leave.employeeName}'s ${leave.leaveType} request (${leave.startDate}–${leave.endDate}) has been pending for ${leave.daysPending} days.\n\nPlease review and approve or reject.\n\nSource: Communications Agent`,
          priority: 'Medium',
          assignedTo: leave.managerId || null,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A19: MEETING COMMITMENT OVERDUE 30+ DAYS — escalation task for manager
    for (const commitment of detailedCommitments) {
      if (commitment.daysOverdue < 30) continue;
      const fp = makeFingerprint('commitment_escalation', `commitment:${commitment.id}`);
      if (await hasRecentAgentTask(fp, 14)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Escalate commitment: "${commitment.title}" (${commitment.daysOverdue}d overdue)`,
        description: `Meeting commitment "${commitment.title}" is ${commitment.daysOverdue} days overdue. Manager review.`,
        actionPayload: {
          title: `[Agent] ESCALATION: Overdue commitment "${commitment.title}" (${commitment.daysOverdue}d)`,
          description: `Commitment "${commitment.title}" from meeting "${commitment.meetingTitle}" (${commitment.meetingDate}) is ${commitment.daysOverdue} days overdue.\nAssigned to: ${commitment.assigneeName}\n\nPlease review with ${commitment.assigneeName} and close or reassign.\n\nSource: Communications Agent — Manager Escalation`,
          priority: 'High',
          assignedTo: commitment.managerId || commitment.assigneeId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A20: MEETING COMMITMENT OVERDUE 1-29 DAYS — task for assignee
    for (const commitment of detailedCommitments) {
      if (commitment.daysOverdue < 1 || commitment.daysOverdue >= 30) continue;
      const fp = makeFingerprint('commitment_overdue', `commitment:${commitment.id}`);
      if (await hasRecentAgentTask(fp, 7)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Complete commitment: "${commitment.title}" (${commitment.daysOverdue}d overdue)`,
        description: `Meeting commitment "${commitment.title}" is ${commitment.daysOverdue} days overdue.`,
        actionPayload: {
          title: `[Agent] Complete meeting commitment: "${commitment.title}" (${commitment.daysOverdue}d overdue)`,
          description: `Your commitment "${commitment.title}" from meeting "${commitment.meetingTitle}" (${commitment.meetingDate}) is ${commitment.daysOverdue} days overdue.\nDue: ${commitment.dueDate}\n\nPlease complete or update status.\n\nSource: Communications Agent`,
          priority: commitment.daysOverdue >= 14 ? 'High' : 'Medium',
          assignedTo: commitment.assigneeId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A21: MEETING COMMITMENT NOT LINKED TO TASK — create task from commitment
    for (const commitment of detailedCommitments) {
      if (commitment.hasLinkedTask) continue;
      const fp = makeFingerprint('commitment_task', `commitment:${commitment.id}`);
      if (await hasOpenAgentTask(fp)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Create task from commitment: "${commitment.title}"`,
        description: `Commitment "${commitment.title}" from "${commitment.meetingTitle}" has no linked task.`,
        actionPayload: {
          title: `[Meeting] ${commitment.title}`,
          description: `Auto-created from meeting commitment.\nMeeting: ${commitment.meetingTitle} (${commitment.meetingDate})\nOriginal due date: ${commitment.dueDate}\n\nSource: Communications Agent`,
          priority: commitment.priority || 'Medium',
          assignedTo: commitment.assigneeId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          sourceId: commitment.id,
          dueDate: commitment.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A22: REPEAT OFFENDER MEETING COMMITMENTS (3+) — manager notification task
    for (const offender of meetingDiscipline.repeatOffenders) {
      if (offender.overdueCount < 3) continue;
      const fp = makeFingerprint('commitment_repeat', `${offender.userId}`);
      if (await hasRecentAgentTask(fp, 14)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Review commitment discipline: ${offender.employeeName} (${offender.overdueCount} overdue)`,
        description: `${offender.employeeName} has ${offender.overdueCount} overdue meeting commitments — repeat pattern.`,
        actionPayload: {
          title: `[Agent] Review commitment discipline: ${offender.employeeName} (${offender.overdueCount} overdue commitments)`,
          description: `${offender.employeeName} has ${offender.overdueCount} overdue meeting commitments, indicating a pattern of not following through.\n\nPlease discuss with ${offender.employeeName} about capacity and commitment follow-through.\n\nSource: Communications Agent — Manager Review`,
          priority: 'High',
          assignedTo: offender.managerId || null,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.85,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A23: MON/FRI ABSENCE PATTERN — review task for manager
    for (const ap of attendancePatterns) {
      if (!ap.hasWeekendPattern) continue;
      const fp = makeFingerprint('attendance_pattern', `${ap.userId}`);
      if (await hasRecentAgentTask(fp, 30)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Review Mon/Fri absence pattern: ${ap.employeeName}`,
        description: `${ap.employeeName} has a Monday/Friday absence pattern over 30 days.`,
        actionPayload: {
          title: `[Agent] Review attendance pattern: ${ap.employeeName} — Mon/Fri absences`,
          description: `${ap.employeeName} has a noticeable Monday/Friday absence pattern over the last 30 days.\nTotal absences: ${ap.totalAbsent} | Monday: ${ap.mondayAbsences} | Friday: ${ap.fridayAbsences}\nAbsent without leave: ${ap.absentWithoutLeave}\n\nPlease discuss with ${ap.employeeName}.\n\nSource: Communications Agent — Manager Review`,
          priority: 'Medium',
          assignedTo: ap.managerId || null,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.8,
        priority: 'normal',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A24: 3+ ABSENCES WITHOUT LEAVE (30-DAY) — disciplinary review task for manager
    for (const ap of attendancePatterns) {
      if (ap.absentWithoutLeave < 3) continue;
      const fp = makeFingerprint('attendance_30d_absent', `${ap.userId}`);
      if (await hasRecentAgentTask(fp, 30)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Attendance review: ${ap.employeeName} (${ap.absentWithoutLeave} absences, 30-day)`,
        description: `${ap.employeeName} has ${ap.absentWithoutLeave} absences without leave in 30 days.`,
        actionPayload: {
          title: `[Agent] Attendance disciplinary review: ${ap.employeeName} — ${ap.absentWithoutLeave} absences without leave`,
          description: `${ap.employeeName} has been absent without approved leave ${ap.absentWithoutLeave} times in the last 30 days.\nTotal absences: ${ap.totalAbsent} | Incomplete: ${ap.totalIncomplete}\n\nThis requires disciplinary review.\n\nSource: Communications Agent — Manager Escalation`,
          priority: 'High',
          assignedTo: ap.managerId || null,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.9,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    // A25: TASKS ASSIGNED TO INACTIVE USERS — reassignment task for creator
    for (const it of inactiveUserTasks.slice(0, 5)) {
      const fp = makeFingerprint('inactive_user_task', `task:${it.taskId}`);
      if (await hasOpenAgentTask(fp)) continue;

      const rec = await recommendationManager.createRecommendation({
        actionCategory: 'task_creation',
        actionType: 'create_task',
        title: `Reassign task from inactive user: "${it.taskTitle}"`,
        description: `Task "${it.taskTitle}" is assigned to ${it.assigneeName} who is no longer active.`,
        actionPayload: {
          title: `[Agent] Reassign task: "${it.taskTitle}" — assigned to inactive user ${it.assigneeName}`,
          description: `Task "${it.taskTitle}" is assigned to ${it.assigneeName} who is no longer active in the system.\n\nPlease reassign to an active team member or close if no longer needed.\n\nSource: Communications Agent`,
          priority: 'High',
          assignedTo: it.creatorId,
          category: `Agent Task ${fp}`,
          sourceType: 'agent_task',
          sourceAgent: SOURCE_AGENT,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        logicType: 'rule_based',
        confidence: 0.95,
        priority: 'high',
      });
      if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
    }

    } // end skipTaskCreation guard for Group A

    // ─── GROUP B: WEEKLY CONSOLIDATED "COMMUNICATIONS HEALTH REVIEW" TASK ───
    // Findings that contribute: unread messages (27), meeting completion rate (33),
    // leave balance zero+pending (31), repeat offenders already covered individually
    // This task is created once per week on Monday
    if (!skipTaskCreation && new Date().getDay() === 1) {
      const fpWeekly = makeFingerprint('weekly_health_review', `week:${new Date().toISOString().split('T')[0]}`);
      if (!(await hasRecentAgentTask(fpWeekly, 7))) {
        const weeklyItems: string[] = [];
        if (unreadMessages.length >= 5) {
          weeklyItems.push(`• ${unreadMessages.length} internal messages unread for 48+ hours`);
        }
        if (meetingDiscipline.completionRate < 50 && meetingDiscipline.totalCommitments >= 5) {
          weeklyItems.push(`• Meeting commitment completion rate: ${meetingDiscipline.completionRate}% (critically low)`);
        }
        const zeroBalanceWithPending = leaveBalances.filter(lb => lb.remaining <= 0 && lb.pendingRequests > 0);
        if (zeroBalanceWithPending.length > 0) {
          weeklyItems.push(`• ${zeroBalanceWithPending.length} employee(s) with zero leave balance and pending requests`);
        }
        const lowBalance = leaveBalances.filter(lb => lb.remaining <= 1 && !(lb.remaining <= 0 && lb.pendingRequests > 0));
        if (lowBalance.length > 0) {
          weeklyItems.push(`• ${lowBalance.length} employee(s) with low leave balance (≤1 day remaining)`);
        }
        if (todayMissing.length > 0) {
          weeklyItems.push(`• ${todayMissing.length} employee(s) missing attendance today`);
        }

        if (weeklyItems.length > 0) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Weekly Communications Health Review`,
            description: `Consolidated weekly review of aggregate findings.`,
            actionPayload: {
              title: `[Agent] Weekly Communications Health Review — ${new Date().toLocaleDateString('en-IN')}`,
              description: `This is your weekly consolidated review of organizational health metrics that require attention but don't have individual task assignments.\n\n${weeklyItems.join('\n')}\n\nPlease review these items and take action where needed.\n\nSource: Communications Agent — Weekly Consolidated Review`,
              priority: 'Medium',
              assignedTo: 1,
              category: `Agent Task ${fpWeekly}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.9,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ─── AUTO-EXECUTE all approved recommendations ───
    for (const recId of autoExecuteQueue) {
      try {
        const result = await actionExecutor.execute(recId);
        if (result.success) autoExecutedCount++;
      } catch (err: any) {
        console.error(`[Communications] Auto-execute failed for rec ${recId}:`, err.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── TREND ANALYSIS + DAILY INSIGHT ───
    // ═══════════════════════════════════════════════════════════════
    const emailStats = await agentDataRepo.getEmailStats();
    const trends = await agentDataRepo.getTrendComparison();
    queriesRun += 2;

    const trendLine = (current: number, previous: number, label: string): string => {
      if (previous === 0) return `${label}: ${current} (no prior data)`;
      const change = current - previous;
      const pct = Math.round((change / previous) * 100);
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      return `${label}: ${current} (${arrow} ${Math.abs(pct)}% vs prior week)`;
    };

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
        `Tasks assigned to inactive users: ${inactiveUserTasks.length}`,
        ``,
        `--- COMPLETIONS ---`,
        `Recently completed (24h): ${recentlyCompleted.length} tasks`,
        ``,
        `--- WORKLOAD VISIBILITY ---`,
        `Users with zero active tasks: ${noTaskUsers.filter(u => u.managerName).length}`,
        ``,
        `--- RECURRING TASKS ---`,
        `Overdue: ${overdueRecurring.length} across ${Object.keys(recurringByAssignee).length} people`,
        ``,
        `--- EMAILS ---`,
        `Unread (7 days): ${emailStats.totalUnread}, High Priority: ${emailStats.highPriority}`,
        `Critical unanswered (24h+): ${criticalEmails.length}, Long unanswered (72h+): ${longUnanswered.length}`,
        ``,
        `--- ATTENDANCE ---`,
        `Missing today: ${todayMissing.length} employees`,
        `Incomplete records (7d): ${incompleteAttendanceCount} across ${attendanceDetailed.filter(e => e.incompleteCount > 0).length} employees`,
        `Absent without leave (7d): ${absentWithoutLeaveCount} instances`,
        `30-day patterns flagged: ${attendancePatterns.length} employees`,
        `Mon/Fri pattern detected: ${attendancePatterns.filter(a => a.hasWeekendPattern).length} employees`,
        ``,
        `--- DAILY WORK REPORTS ---`,
        `Missing DWARs this week: ${dwarDetailed.filter(g => g.missingDays > 0).length} employees`,
        `  - Escalated to manager: ${dwarDetailed.filter(g => g.missingDays >= 3).length}`,
        `  - Warning: ${dwarDetailed.filter(g => g.consecutiveMissing >= 2 && g.missingDays < 3).length}`,
        `  - Reminder: ${dwarDetailed.filter(g => g.missingDays === 1).length}`,
        `DWAR Quality Issues: ${dwarQuality.length} employees flagged`,
        `  - Avg score <30: ${dwarQuality.filter(q => q.avgScore < 30).length}`,
        `  - Poor/empty reports: ${dwarQuality.reduce((s, q) => s + q.poorCount + q.emptyCount, 0)}`,
        ``,
        `--- LEAVE REQUESTS ---`,
        `Total pending: ${pendingLeaves.length}`,
        `  - Expired: ${leaveClosureCount}`,
        `  - Escalation (>7d): ${leaveEscalationCount}`,
        `  - Reminder (>3d): ${leavePendingReminderCount}`,
        `Low balance alerts: ${leaveBalances.length} employees`,
        ``,
        `--- MEETING DISCIPLINE ---`,
        `Completion rate: ${meetingDiscipline.completionRate}% (${meetingDiscipline.completedCommitments}/${meetingDiscipline.totalCommitments})`,
        `Overdue commitments: ${meetingDiscipline.overdueCommitments}`,
        `Repeat offenders (3+ overdue): ${meetingDiscipline.repeatOffenders.filter(o => o.overdueCount >= 3).length}`,
        `Not linked to task: ${commitmentNoTaskCount}`,
        ``,
        `--- INTERNAL MESSAGES ---`,
        `Unread 48h+: ${unreadMessages.length}`,
        ``,
        `--- TRENDS (vs prior week) ---`,
        trendLine(trends.currentOverdueTasks, trends.previousOverdueTasks, 'Overdue tasks'),
        trendLine(trends.currentDwarMissing, trends.previousDwarMissing, 'DWAR issues'),
        trendLine(trends.currentAttendanceIssues, trends.previousAttendanceIssues, 'Attendance issues'),
        trendLine(trends.currentPendingLeaves, trends.previousPendingLeaves, 'Pending leaves'),
        trendLine(trends.currentOverdueCommitments, trends.previousOverdueCommitments, 'Overdue commitments'),
        ``,
        `--- AUTOMATION ---`,
        `Recommendations generated: ${recommendationsCount}`,
        `Auto-executed actions: ${autoExecutedCount}`,
        `Auto-closed resolved tasks: ${autoClosedCount}`,
        `First run (backlog suppressed): ${firstRun}`,
      ].join('\n'),
      logicType: 'rule_based',
      dataSources: [
        'tasks', 'recurring_tasks', 'gmail_messages', 'attendance_records',
        'daily_work_reports', 'leave_requests', 'meeting_commitments', 'internal_messages',
        'leave_balances', 'agent_findings',
      ],
      scopePeriod: 'daily',
    });
    insightsCount++;

    if (new Date().getDay() === 1) {
      await insightManager.createInsight({
        findingIds: [],
        insightType: 'kpi_report',
        title: `Weekly Communication Discipline Report - Week of ${new Date().toLocaleDateString()}`,
        content: [
          `=== WEEKLY COMMUNICATION DISCIPLINE REPORT ===`,
          `Week ending: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
          ``,
          `--- TASK DISCIPLINE ---`,
          `Total overdue (non-finance): ${nonFinanceTasks.length}`,
          `Zombie tasks (90+d): ${(tasksByTier.zombie_risk?.length || 0) + (tasksByTier.escalation_90?.length || 0) + (tasksByTier.zombie_review?.length || 0)}`,
          trendLine(trends.currentOverdueTasks, trends.previousOverdueTasks, 'Trend'),
          ``,
          `--- DWAR COMPLIANCE ---`,
          `Employees with missing DWARs: ${dwarDetailed.filter(g => g.missingDays > 0).length}`,
          `Quality issues: ${dwarQuality.length} employees`,
          trendLine(trends.currentDwarMissing, trends.previousDwarMissing, 'Trend'),
          ``,
          `--- LEAVE APPROVAL ---`,
          `Pending requests: ${pendingLeaves.length}`,
          `Expired (date passed): ${leaveClosureCount}`,
          trendLine(trends.currentPendingLeaves, trends.previousPendingLeaves, 'Trend'),
          ``,
          `--- MEETING COMMITMENTS ---`,
          `Completion rate: ${meetingDiscipline.completionRate}%`,
          `Overdue: ${meetingDiscipline.overdueCommitments}`,
          trendLine(trends.currentOverdueCommitments, trends.previousOverdueCommitments, 'Trend'),
          ``,
          `--- ATTENDANCE ---`,
          `30-day patterns flagged: ${attendancePatterns.length}`,
          trendLine(trends.currentAttendanceIssues, trends.previousAttendanceIssues, 'Trend'),
        ].join('\n'),
        logicType: 'rule_based',
        dataSources: ['tasks', 'daily_work_reports', 'leave_requests', 'meeting_commitments', 'attendance_records'],
        scopePeriod: 'weekly',
      });
      insightsCount++;
    }

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      executionMetadata: {
        durationMs: Date.now() - startTime,
        queriesRun,
        llmCalls: 0,
        tokensUsed: 0,
        notificationsSent: 0,
        autoExecutedActions: autoExecutedCount,
        autoClosedTasks: autoClosedCount,
        firstRun: firstRun,
      },
    };
  }
}
