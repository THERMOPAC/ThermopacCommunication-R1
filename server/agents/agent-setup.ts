import { db } from '../db';
import { agentRegistry, agentPolicies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { orchestrator } from './framework/orchestrator';
import { agentScheduler } from './framework/scheduler';
import { ProjectControlAgent } from './agents/project-control';
import { CommunicationsAgent } from './agents/communications';
import { ExecutiveMISAgent } from './agents/executive-mis';
import { FinanceControlAgent } from './agents/finance-control';
import { SalesMarketingAgent } from './agents/sales-marketing';
import { PredictiveProjectControlAgent } from './agents/predictive-project-control';
import { ProductionManagementAgent } from './agents/production-management';
import { QualityManagementAgent } from './agents/quality-management';
import { scheduleTaskAutoArchive } from './maintenance/task-auto-archive';

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
  {
    agentKey: 'predictive_project_control',
    displayName: 'Predictive Project Control Agent',
    description: 'Predictive intelligence layer for project control. Uses trend analysis, velocity calculations, and cross-module signals to forecast project delays, design bottlenecks, procurement risks, and cascading cross-module failures. 12 prediction types: PP1-PP3 (project), PD1-PD3 (design), PR1-PR3 (procurement), PX1-PX3 (cross-module).',
    category: 'intelligence',
    defaultSchedule: '0 4 * * *',
    config: {
      closureDeclineThresholdPct: 30,
      velocityGapThresholdPct: 50,
      phaseStallProgressGap: 20,
      reviewTurnaroundIncreasePct: 30,
      revisionSpikeThresholdPct: 50,
      procCycleLagIncreasePct: 30,
      vendorOverduePOThreshold: 3,
      grDeclineThresholdPct: 30,
      compositeRiskThreshold: 60,
      crossModuleLoadThreshold: 8,
      findingsIncreasePct: 30,
    },
  },
  {
    agentKey: 'production_management',
    displayName: 'Production Management Agent',
    description: 'Monitors production operations, shop floor execution, workforce compliance, and DPR submissions. 45 core findings (P1-P45) across planning, material, shop floor, efficiency, workforce, and compliance. 10 risk intelligence findings (R1-R10) for predictive production risk detection.',
    category: 'operations',
    defaultSchedule: '0 1 * * *',
    config: {
      production_manager_id: 8,
      overdue_wo_threshold_days: 1,
      not_started_threshold_days: 3,
      backlog_wo_threshold: 10,
      variance_threshold_pct: 30,
      yield_threshold_pct: 85,
      rejection_threshold_pct: 15,
      downtime_threshold_minutes: 120,
      staffing_shortage_threshold_pct: 30,
      cycle_deviation_threshold: 1.5,
    },
  },
  {
    agentKey: 'sales_marketing',
    displayName: 'Sales & Marketing Agent',
    description: 'Monitors sales pipeline health, lead follow-ups, offer lifecycle, customer engagement, and digital marketing campaigns (Google Ads). 20 automated findings + 4 observations + 2 intelligence reports.',
    category: 'sales',
    defaultSchedule: '0 1 * * *',
    config: {
      sales_l1_user_id: 2,
      sales_l2_user_id: 3,
      stale_lead_days: 7,
      stale_lead_escalation_days: 15,
      lead_stuck_days: 30,
      high_value_lead_min_probability: 50,
      offer_expiry_warning_days: 7,
      offer_draft_stuck_days: 7,
      offer_sent_no_response_days: 10,
      offer_high_rejection_threshold: 3,
      dormant_customer_days: 90,
      followup_overdue_days: 3,
      high_value_neglect_days: 60,
      gads_low_quality_score: 5,
      gads_waste_spend_threshold: 100,
      campaign_overbudget_pct: 110,
    },
  },
  {
    agentKey: 'quality_management',
    displayName: 'Quality Management Agent',
    description: 'Monitors quality management across 5 control groups: Q1 Inspection Control, Q2 Calibration Control, Q3 Welding Qualification Control, Q4 Document/Procedure Control, Q5 Material Traceability Control. Classifies findings as compliance_risk, operational_risk, master_data_hygiene, traceability_gap, or document_control_gap. 4-level dynamic escalation: Entity Owner → Production Manager → Project Manager → GM.',
    category: 'quality',
    defaultSchedule: '0 2 * * *',
    config: {
      stale_inspection_days: 180,
      calibration_warning_days: 90,
      welder_cert_warning_days: 90,
      pma_expiry_warning_days: 90,
      material_traceability_min_docs: 1,
    },
  },
];

const DEFAULT_POLICIES = [
  { agentKey: 'project_control', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 100 },
  { agentKey: 'project_control', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'auto', cooldownMinutes: 5, maxPerDay: 50 },
  { agentKey: 'project_control', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'auto', cooldownMinutes: 15, maxPerDay: 30 },
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
  { agentKey: 'predictive_project_control', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'auto', cooldownMinutes: 10, maxPerDay: 30 },
  { agentKey: 'predictive_project_control', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 50 },
  { agentKey: 'predictive_project_control', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'require_approval', cooldownMinutes: 30, maxPerDay: 10 },
  { agentKey: 'production_management', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'auto', cooldownMinutes: 5, maxPerDay: 60 },
  { agentKey: 'production_management', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 100 },
  { agentKey: 'production_management', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'auto', cooldownMinutes: 15, maxPerDay: 30 },
  { agentKey: 'sales_marketing', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 100 },
  { agentKey: 'sales_marketing', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'auto', cooldownMinutes: 5, maxPerDay: 50 },
  { agentKey: 'sales_marketing', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'auto', cooldownMinutes: 15, maxPerDay: 30 },
  { agentKey: 'sales_marketing', actionCategory: 'report_generation', actionType: 'generate_report', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 10 },
  { agentKey: 'quality_management', actionCategory: 'task_creation', actionType: 'create_task', approvalMode: 'auto', cooldownMinutes: 5, maxPerDay: 50 },
  { agentKey: 'quality_management', actionCategory: 'notification', actionType: 'send_alert', approvalMode: 'auto', cooldownMinutes: 60, maxPerDay: 100 },
  { agentKey: 'quality_management', actionCategory: 'escalation', actionType: 'escalate_to_manager', approvalMode: 'auto', cooldownMinutes: 15, maxPerDay: 30 },
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
  orchestrator.registerAgent(new PredictiveProjectControlAgent());
  orchestrator.registerAgent(new ProductionManagementAgent());
  orchestrator.registerAgent(new CommunicationsAgent());
  orchestrator.registerAgent(new FinanceControlAgent());
  orchestrator.registerAgent(new ExecutiveMISAgent());
  orchestrator.registerAgent(new SalesMarketingAgent());
  orchestrator.registerAgent(new QualityManagementAgent());

  setTimeout(() => {
    agentScheduler.start().catch(err => {
      console.error('[AgentSystem] Scheduler failed to start:', err.message);
    });
  }, 10000);

  scheduleTaskAutoArchive();

  console.log('[AgentSystem] Multi-Agent Intelligence Layer initialized successfully.');
  console.log(`[AgentSystem] ${orchestrator.getRegisteredAgents().length} agents registered.`);
}
