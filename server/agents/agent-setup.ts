import { db } from '../db';
import { agentRegistry, agentPolicies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { orchestrator } from './framework/orchestrator';
import { agentScheduler } from './framework/scheduler';
import { ProjectControlAgent } from './agents/project-control';
import { CommunicationsAgent } from './agents/communications';
import { ExecutiveMISAgent } from './agents/executive-mis';
import { FinanceControlAgent } from './agents/finance-control';

const PHASE_1_AGENTS = [
  {
    agentKey: 'project_control',
    displayName: 'Project Control Agent',
    description: 'Monitors project schedules, work order progress, milestone risks, and resource utilization across all active projects.',
    category: 'operations',
    defaultSchedule: '30 3 * * *',
    config: {
      overdueWoThresholdDays: 7,
      projectRiskDaysBeforeDeadline: 14,
      completionRiskThresholdPct: 80,
    },
  },
  {
    agentKey: 'communications',
    displayName: 'Communications Agent',
    description: 'Monitors human activity and communication discipline: tasks, recurring tasks, emails, attendance, daily work reports, leave requests, meetings & commitments, and internal messages.',
    category: 'operations',
    defaultSchedule: '30 3 * * *',
    config: {
      taskOverdueCriticalDays: 7,
      emailUnansweredThresholdHours: 24,
      emailCriticalPriorities: ['P0', 'P1'],
      attendanceAnomalyDays: 7,
      dwarMinMissingDays: 2,
      commitmentOverdueDays: 7,
    },
  },
  {
    agentKey: 'finance',
    displayName: 'Finance Control Agent',
    description: 'Monitors financial operations: overdue invoices (5-tier escalation), payment allocation, BRC compliance (6/8/8.5 month tiers), write-off management, receivable concentration, aging deterioration, reconciliation, and remittance tracking. 30 automated findings + 6 observational metrics + 3 intelligence reports.',
    category: 'finance',
    defaultSchedule: '30 0 * * *',
    config: {
      finance_account_manager_user_id: 5,
      finance_general_manager_user_id: 2,
      finance_super_user_id: 3,
      outstanding_threshold: 1000000,
      outstanding_turnover_pct: 20,
      writeoff_approval_threshold: 100000,
      brc_reminder_months: 6,
      brc_warning_months: 8,
      brc_critical_months: 8.5,
      receivable_concentration_60_pct: 40,
      receivable_concentration_90_pct: 20,
      aging_deterioration_days: 30,
      unreconciled_days: 30,
      duplicate_invoice_window_days: 7,
      unallocated_payment_reminder_days: 7,
      unallocated_payment_escalation_days: 15,
      advance_payment_aging_days: 30,
      partial_paid_stale_days: 30,
      writeoff_pending_days: 7,
      brc_pending_count_threshold: 10,
    },
  },
  {
    agentKey: 'executive_mis',
    displayName: 'Executive MIS Agent',
    description: 'Generates cross-module executive briefings, KPI summaries, and threshold-based alerts across the entire platform.',
    category: 'intelligence',
    defaultSchedule: '0 3 * * *',
    config: {
      overdueWoThreshold: 10,
      overdueTaskThreshold: 20,
      overdueInvoiceThreshold: 5,
    },
  },
];

const DEFAULT_POLICIES = [
  { agentKey: 'project_control', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'require_approval' },
  { agentKey: 'project_control', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'require_approval' },
  { agentKey: 'project_control', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'require_approval' },
  { agentKey: 'communications', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 100 },
  { agentKey: 'communications', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'auto', cooldownMinutes: 5, maxPerDay: 20 },
  { agentKey: 'communications', actionCategory: 'task_creation', actionType: 'create_reminder', approvalMode: 'auto' },
  { agentKey: 'communications', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'auto', cooldownMinutes: 15, maxPerDay: 30 },
  { agentKey: 'communications', actionCategory: 'report_generation', actionType: 'generate_report', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 10 },
  { agentKey: 'communications', actionCategory: 'communication', actionType: 'draft_reply', approvalMode: 'auto' },
  { agentKey: 'finance', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 100 },
  { agentKey: 'finance', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'auto', cooldownMinutes: 5, maxPerDay: 50 },
  { agentKey: 'finance', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'auto', cooldownMinutes: 15, maxPerDay: 30 },
  { agentKey: 'finance', actionCategory: 'report_generation', actionType: 'generate_aging_report', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 10 },
  { agentKey: 'executive_mis', actionCategory: 'report_generation', actionType: 'generate_briefing', approvalMode: 'require_approval' },
  { agentKey: 'executive_mis', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'require_approval' },
];

export async function initializeAgentSystem(): Promise<void> {
  console.log('[AgentSystem] Initializing Multi-Agent Intelligence Layer...');

  for (const agentDef of PHASE_1_AGENTS) {
    const existing = await db.select()
      .from(agentRegistry)
      .where(eq(agentRegistry.agentKey, agentDef.agentKey))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(agentRegistry).values({
        agentKey: agentDef.agentKey,
        displayName: agentDef.displayName,
        description: agentDef.description,
        category: agentDef.category,
        defaultSchedule: agentDef.defaultSchedule,
        config: agentDef.config,
        isEnabled: true,
        isSuspended: false,
      });
      console.log(`[AgentSystem] Registered agent: ${agentDef.agentKey}`);
    } else {
      await db.update(agentRegistry)
        .set({
          displayName: agentDef.displayName,
          description: agentDef.description,
          category: agentDef.category,
          config: agentDef.config,
          defaultSchedule: agentDef.defaultSchedule,
        })
        .where(eq(agentRegistry.agentKey, agentDef.agentKey));
    }
  }

  for (const policy of DEFAULT_POLICIES) {
    const existing = await db.select()
      .from(agentPolicies)
      .where(
        eq(agentPolicies.agentKey, policy.agentKey)
      );

    const policyExists = existing.some(
      p => p.actionCategory === policy.actionCategory && p.actionType === policy.actionType
    );

    if (!policyExists) {
      await db.insert(agentPolicies).values({
        agentKey: policy.agentKey,
        actionCategory: policy.actionCategory,
        actionType: policy.actionType,
        approvalMode: policy.approvalMode,
        maxActionsPerDay: (policy as any).maxPerDay || 50,
        cooldownMinutes: (policy as any).cooldownMinutes || 30,
        isEnabled: true,
        companyScope: 'ALL',
      });
    }
  }

  orchestrator.registerAgent(new ProjectControlAgent());
  orchestrator.registerAgent(new CommunicationsAgent());
  orchestrator.registerAgent(new FinanceControlAgent());
  orchestrator.registerAgent(new ExecutiveMISAgent());

  setTimeout(() => {
    agentScheduler.start().catch(err => {
      console.error('[AgentSystem] Scheduler failed to start:', err.message);
    });
  }, 10000);

  console.log('[AgentSystem] Multi-Agent Intelligence Layer initialized successfully.');
  console.log(`[AgentSystem] ${orchestrator.getRegisteredAgents().length} agents registered.`);
}
