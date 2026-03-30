import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { actionExecutor } from '../framework/action-executor';
import { agentDataRepo } from '../data-access/agent-data-repo';
import { resolveEscalation } from '../framework/escalation';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  EPC_FINDING_DEFS, hasGracePassed, trackFinding, markAlerted, markTaskCreated, resolveFindings,
} from './epc-findings-tracker';

const SOURCE_AGENT = 'finance_controller';
const AGENT_KEY = 'finance';

const DEFAULT_SETTINGS = {
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
};

type FinanceSettings = typeof DEFAULT_SETTINGS;

async function getFinanceSettings(): Promise<FinanceSettings> {
  try {
    const result = await db.execute(sql`
      SELECT config FROM agent_registry WHERE agent_key = ${AGENT_KEY} LIMIT 1
    `);
    const config = (result.rows as any[])[0]?.config || {};
    return { ...DEFAULT_SETTINGS, ...config };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function isFirstRun(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM agent_runs 
    WHERE agent_key = ${AGENT_KEY} AND status = 'completed'
  `);
  return Number((result.rows as any[])[0]?.cnt || 0) === 0;
}

function makeFingerprint(findingType: string, entityKey: string): string {
  return `[fp:fin_${findingType}:${entityKey}]`;
}

async function hasOpenAgentTask(fingerprint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status NOT IN ('completed', 'cancelled')
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function hasCompletedAgentTask(fingerprint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status = 'completed'
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function hasRecentAgentTask(fingerprint: string, cooldownDays: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND created_at::timestamp > NOW() - INTERVAL '1 day' * ${cooldownDays}
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closedCount = 0;
  const openAgentTasks = await db.execute(sql`
    SELECT id, category, title FROM tasks
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'cancelled')
  `);

  for (const task of (openAgentTasks.rows || []) as any[]) {
    const cat = task.category || '';
    let shouldClose = false;

    if (cat.includes('fp:fin_overdue_inv')) {
      const match = cat.match(/fp:fin_overdue_inv[^:]*:inv:(\d+)/);
      if (match) {
        const invId = Number(match[1]);
        const inv = await db.execute(sql`SELECT status FROM invoices WHERE id = ${invId}`);
        if ((inv.rows as any[])[0]?.status === 'Paid') shouldClose = true;
      }
    }
    if (cat.includes('fp:fin_unalloc')) {
      const match = cat.match(/fp:fin_unalloc[^:]*:pay:(\d+)/);
      if (match) {
        const payId = Number(match[1]);
        const pay = await db.execute(sql`SELECT unallocated_amount FROM payments WHERE id = ${payId}`);
        if (Number((pay.rows as any[])[0]?.unallocated_amount || 0) <= 1) shouldClose = true;
      }
    }
    if (cat.includes('fp:fin_writeoff_pending') || cat.includes('fp:fin_writeoff_large')) {
      const match = cat.match(/fp:fin_writeoff_(?:pending|large)[^:]*:wo:(\d+)/);
      if (match) {
        const woId = Number(match[1]);
        const wo = await db.execute(sql`SELECT status FROM write_offs WHERE id = ${woId}`);
        const st = (wo.rows as any[])[0]?.status;
        if (st === 'Approved' || st === 'Rejected') shouldClose = true;
      }
    }
    if (cat.includes('fp:fin_brc')) {
      const match = cat.match(/fp:fin_brc[^:]*:inv:(\d+)/);
      if (match) {
        const invId = Number(match[1]);
        const inv = await db.execute(sql`SELECT brc_received FROM invoices WHERE id = ${invId}`);
        if ((inv.rows as any[])[0]?.brc_received === true) shouldClose = true;
      }
    }

    if (shouldClose) {
      await db.execute(sql`
        UPDATE tasks SET status = 'completed', completed_at = NOW()::text
        WHERE id = ${task.id}
      `);
      closedCount++;
    }
  }
  return closedCount;
}

export class FinanceControlAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Finance Control Agent';
  category = 'finance';

  getSubscribedEvents(): string[] {
    return ['finance.invoice.overdue', 'finance.payment.pending', 'finance.brc.overdue'];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let recommendationsCount = 0;
    let queriesRun = 0;
    let autoExecutedCount = 0;
    let autoClosedCount = 0;
    const autoExecuteQueue: number[] = [];

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    const settings = await getFinanceSettings();
    const financeL1userId = settings.finance_account_manager_user_id;
    const L1 = financeL1userId;
    const L2 = await resolveEscalation('L2', financeL1userId);
    const L3 = await resolveEscalation('L3', financeL1userId);

    const firstRun = await isFirstRun();

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) console.log(`[Finance] Auto-closed ${autoClosedCount} resolved tasks`);
    } catch (err: any) {
      console.error(`[Finance] Auto-close error:`, err.message);
    }

    const skipTaskCreation = firstRun;
    if (firstRun) {
      console.log(`[Finance] FIRST RUN — baseline only, no tasks created`);
    }

    // ══════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ══════════════════════════════════════════════════════════════════

    const overdueInvoices = await db.execute(sql`
      SELECT i.id, i.invoice_number, i.customer_id, i.total_amount, i.currency, i.status,
        i.due_date, i.issue_date, i.is_export, i.brc_required, i.brc_received,
        i.credit_note_amount,
        c.bp_name as customer_name,
        EXTRACT(DAY FROM NOW() - i.due_date::date)::int as days_overdue
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.status NOT IN ('Paid', 'Cancelled', 'Credit Note')
        AND i.due_date IS NOT NULL
        AND i.due_date::date < CURRENT_DATE
      ORDER BY days_overdue DESC
    `);
    queriesRun++;
    const overdueInvRows = (overdueInvoices.rows || []) as any[];

    const allInvoices = await db.execute(sql`
      SELECT i.id, i.invoice_number, i.customer_id, i.total_amount, i.currency, i.status,
        i.due_date, i.issue_date, i.is_export, i.brc_required, i.brc_received,
        i.credit_note_amount,
        c.bp_name as customer_name,
        CASE WHEN i.due_date IS NOT NULL AND i.due_date::date < CURRENT_DATE
          THEN EXTRACT(DAY FROM NOW() - i.due_date::date)::int ELSE 0 END as days_overdue
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.status NOT IN ('Cancelled')
      ORDER BY i.id DESC
    `);
    queriesRun++;
    const allInvRows = (allInvoices.rows || []) as any[];

    const payments = await db.execute(sql`
      SELECT p.id, p.irm_no, p.payment_date, p.amount, p.currency, p.unallocated_amount,
        p.allocated_amount, p.is_advance_payment, p.customer_id,
        c.bp_name as customer_name,
        EXTRACT(DAY FROM NOW() - p.payment_date::date)::int as days_since_payment
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.unallocated_amount > 1
      ORDER BY days_since_payment DESC
    `);
    queriesRun++;
    const unallocPayments = (payments.rows || []) as any[];

    const allPayments = await db.execute(sql`
      SELECT p.id, p.irm_no, p.payment_date, p.amount, p.currency,
        p.unallocated_amount, p.allocated_amount, p.is_advance_payment, p.customer_id,
        c.bp_name as customer_name
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      ORDER BY p.payment_date DESC
    `);
    queriesRun++;

    const paymentAllocations = await db.execute(sql`
      SELECT pa.id, pa.payment_id, pa.invoice_id, pa.amount_applied,
        p.amount as payment_amount, p.currency, p.irm_no,
        i.invoice_number, i.total_amount as invoice_amount, i.status as invoice_status
      FROM payment_allocations pa
      JOIN payments p ON pa.payment_id = p.id
      JOIN invoices i ON pa.invoice_id = i.id
    `);
    queriesRun++;
    const allocRows = (paymentAllocations.rows || []) as any[];

    const writeOffs = await db.execute(sql`
      SELECT wo.id, wo.invoice_id, wo.amount, wo.reason, wo.notes, wo.status,
        wo.date_created, wo.created_by, wo.approved_by,
        i.invoice_number, i.total_amount as invoice_total
      FROM write_offs wo
      LEFT JOIN invoices i ON wo.invoice_id = i.id
      ORDER BY wo.date_created DESC
    `);
    queriesRun++;
    const writeOffRows = (writeOffs.rows || []) as any[];

    const brcRecords = await db.execute(sql`
      SELECT b.id, b.certificate_number, b.issue_date, b.amount, b.currency,
        b.related_invoice_id, i.invoice_number, i.issue_date as inv_issue_date,
        i.is_export
      FROM bank_realization_certificates b
      LEFT JOIN invoices i ON b.related_invoice_id = i.id
    `);
    queriesRun++;

    const exportInvoicesNeedingBRC = await db.execute(sql`
      SELECT i.id, i.invoice_number, i.issue_date, i.total_amount, i.currency,
        i.brc_required, i.brc_received, i.customer_id,
        c.bp_name as customer_name,
        EXTRACT(MONTH FROM AGE(NOW(), i.issue_date::date))::int +
        EXTRACT(YEAR FROM AGE(NOW(), i.issue_date::date))::int * 12 as months_since_issue
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.is_export = true
        AND (i.brc_required = true OR i.is_export = true)
        AND (i.brc_received IS NULL OR i.brc_received = false)
        AND i.status NOT IN ('Cancelled')
      ORDER BY i.issue_date ASC
    `);
    queriesRun++;
    const brcPendingInvs = (exportInvoicesNeedingBRC.rows || []) as any[];

    const todayPayments = await db.execute(sql`
      SELECT COUNT(*) as cnt, 
        COALESCE(SUM(amount), 0) as total,
        currency
      FROM payments
      WHERE payment_date::date = CURRENT_DATE
      GROUP BY currency
    `);
    queriesRun++;

    // ══════════════════════════════════════════════════════════════════
    // F1-F5: OVERDUE INVOICE ESCALATION TIERS
    // ══════════════════════════════════════════════════════════════════

    const invTier1: any[] = []; // 1-15 days
    const invTier2: any[] = []; // 16-30 days
    const invTier3: any[] = []; // 31-60 days
    const invTier4: any[] = []; // 61-90 days
    const invTier5: any[] = []; // 90+ days

    for (const inv of overdueInvRows) {
      const d = Number(inv.days_overdue);
      if (d >= 90) invTier5.push(inv);
      else if (d >= 61) invTier4.push(inv);
      else if (d >= 31) invTier3.push(inv);
      else if (d >= 16) invTier2.push(inv);
      else if (d >= 1) invTier1.push(inv);
    }

    const invTiers = [
      { tier: invTier1, code: 'F1', label: 'Overdue Invoice Reminder (1-15 days)', severity: 'low' as const, assignTo: L1, cooldown: 7, range: '1-15', prevCode: null as string | null },
      { tier: invTier2, code: 'F2', label: 'Overdue Invoice Escalation L1 (16-30 days)', severity: 'medium' as const, assignTo: L1, cooldown: 7, range: '16-30', prevCode: null as string | null },
      { tier: invTier3, code: 'F3', label: 'Overdue Invoice Escalation L2 (31-60 days)', severity: 'high' as const, assignTo: L2, cooldown: 7, range: '31-60', prevCode: 'f2' },
      { tier: invTier4, code: 'F4', label: 'Overdue Invoice Escalation L3 (61-90 days)', severity: 'high' as const, assignTo: L2, cooldown: 7, range: '61-90', prevCode: 'f3' },
      { tier: invTier5, code: 'F5', label: 'Bad Debt Review (90+ days)', severity: 'critical' as const, assignTo: L3, cooldown: 7, range: '90+', prevCode: 'f4' },
    ];

    for (const { tier, code, label, severity, assignTo, cooldown, range, prevCode } of invTiers) {
      if (tier.length === 0) continue;

      const topInvs = tier.slice(0, 5);
      const topList = topInvs.map(i => `  • ${i.invoice_number} — ${i.customer_name || 'Unknown'} — ${i.currency} ${Number(i.total_amount).toLocaleString()} (${i.days_overdue}d overdue)`).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'overdue_invoice',
        severity,
        title: `${code}: ${tier.length} invoice${tier.length > 1 ? 's' : ''} overdue ${range} days — ${label}`,
        description: `${tier.length} invoice${tier.length > 1 ? 's' : ''} are ${range} days overdue.\n\n${topList}${tier.length > 5 ? `\n  ...and ${tier.length - 5} more` : ''}\n\nEscalation: ${assignTo === L1 ? 'Account Manager' : assignTo === L2 ? 'General Manager' : 'Super User'}`,
        logicType: 'rule_based',
        dataSnapshot: { count: tier.length, tier: code, range },
        relatedEntityType: 'invoice_aging',
        relatedEntityId: `${code}:${range}`,
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_OVERDUE_TASKS_PER_TIER = 5;
        let overdueTaskCount = 0;
        for (const inv of tier) {
          if (overdueTaskCount >= MAX_OVERDUE_TASKS_PER_TIER) break;
          if (prevCode) {
            const prevFp = makeFingerprint(`overdue_inv_${prevCode}`, `inv:${inv.id}`);
            if (!await hasCompletedAgentTask(prevFp)) continue;
          }
          const fp = makeFingerprint(`overdue_inv_${code.toLowerCase()}`, `inv:${inv.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, cooldown)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `${label}: ${inv.invoice_number} — ${inv.customer_name}`,
            description: `Invoice ${inv.invoice_number} is ${inv.days_overdue} days overdue. Amount: ${inv.currency} ${Number(inv.total_amount).toLocaleString()}.`,
            actionPayload: {
              title: `[Finance] ${label}: ${inv.invoice_number} — ${inv.customer_name}`,
              description: `Invoice ${inv.invoice_number} for ${inv.customer_name} is ${inv.days_overdue} days past due.\nAmount: ${inv.currency} ${Number(inv.total_amount).toLocaleString()}\nDue Date: ${inv.due_date}\n\nPlease follow up on collection.\n\nSource: Finance Control Agent — ${code}`,
              priority: severity === 'critical' ? 'Urgent' : severity === 'high' ? 'High' : 'Medium',
              assignedTo: assignTo,
              category: `Finance ${fp}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.95,
            priority: severity === 'critical' ? 'urgent' : 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; overdueTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F6: DUPLICATE INVOICE DETECTION
    // ══════════════════════════════════════════════════════════════════

    const duplicateCandidates = await db.execute(sql`
      SELECT i1.id as id1, i1.invoice_number as inv1, i2.id as id2, i2.invoice_number as inv2,
        i1.customer_id, c.bp_name as customer_name, i1.total_amount, i1.currency,
        i1.issue_date as date1, i2.issue_date as date2
      FROM invoices i1
      JOIN invoices i2 ON i1.customer_id = i2.customer_id
        AND i1.total_amount = i2.total_amount
        AND i1.currency = i2.currency
        AND i1.id < i2.id
        AND ABS(i1.issue_date::date - i2.issue_date::date) <= ${settings.duplicate_invoice_window_days}
      LEFT JOIN customers c ON i1.customer_id = c.id
      WHERE i1.status NOT IN ('Cancelled') AND i2.status NOT IN ('Cancelled')
    `);
    queriesRun++;
    const dupeRows = (duplicateCandidates.rows || []) as any[];

    if (dupeRows.length > 0) {
      const topDupes = dupeRows.slice(0, 5).map(d =>
        `  • ${d.inv1} & ${d.inv2} — ${d.customer_name} — ${d.currency} ${Number(d.total_amount).toLocaleString()}`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'duplicate_invoice',
        severity: 'medium',
        title: `F6: ${dupeRows.length} potential duplicate invoice${dupeRows.length > 1 ? 's' : ''} detected`,
        description: `Found ${dupeRows.length} invoice pair${dupeRows.length > 1 ? 's' : ''} with same customer, amount, and close issue dates.\n\n${topDupes}${dupeRows.length > 5 ? `\n  ...and ${dupeRows.length - 5} more` : ''}\n\nPlease verify these are not genuine duplicates.`,
        logicType: 'rule_based',
        dataSnapshot: { count: dupeRows.length },
        relatedEntityType: 'invoice',
        relatedEntityId: 'duplicates',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_DUPE_TASKS = 5;
        let dupeTaskCount = 0;
        for (const d of dupeRows) {
          if (dupeTaskCount >= MAX_DUPE_TASKS) break;
          const fp = makeFingerprint('dup_inv', `inv:${d.id1}:${d.id2}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 30)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Duplicate invoice check: ${d.inv1} & ${d.inv2}`,
            description: `Potential duplicate invoices for ${d.customer_name}.`,
            actionPayload: {
              title: `[Finance] Verify duplicate: ${d.inv1} & ${d.inv2} — ${d.customer_name}`,
              description: `Two invoices with same customer, amount (${d.currency} ${Number(d.total_amount).toLocaleString()}), and close dates detected.\n\n${d.inv1} (${d.date1}) & ${d.inv2} (${d.date2})\nCustomer: ${d.customer_name}\n\nPlease verify and cancel if duplicate.\n\nSource: Finance Control Agent — F6`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.8,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; dupeTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F7-F8: UNALLOCATED PAYMENTS
    // ══════════════════════════════════════════════════════════════════

    const unallocReminder = unallocPayments.filter(p => Number(p.days_since_payment) >= settings.unallocated_payment_reminder_days && Number(p.days_since_payment) < settings.unallocated_payment_escalation_days);
    const unallocEscalation = unallocPayments.filter(p => Number(p.days_since_payment) >= settings.unallocated_payment_escalation_days);

    for (const { items, code, label, severity, assignTo, cooldown, prevCode } of [
      { items: unallocReminder, code: 'F7', label: 'Unallocated Payment Reminder (>7d)', severity: 'medium' as const, assignTo: L1, cooldown: 5, prevCode: null as string | null },
      { items: unallocEscalation, code: 'F8', label: 'Unallocated Payment Escalation (>15d)', severity: 'high' as const, assignTo: L2, cooldown: 5, prevCode: 'f7' },
    ]) {
      if (items.length === 0) continue;

      const topList = items.slice(0, 5).map(p =>
        `  • ${p.irm_no || 'No Ref'} — ${p.currency} ${Number(p.unallocated_amount).toLocaleString()} unallocated (${p.days_since_payment}d)`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'unallocated_payment',
        severity,
        title: `${code}: ${items.length} payment${items.length > 1 ? 's' : ''} unallocated — ${label}`,
        description: `${items.length} payment${items.length > 1 ? 's' : ''} with unallocated amounts.\n\n${topList}${items.length > 5 ? `\n  ...and ${items.length - 5} more` : ''}`,
        logicType: 'rule_based',
        dataSnapshot: { count: items.length, tier: code },
        relatedEntityType: 'payment',
        relatedEntityId: `${code}:unallocated`,
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_UNALLOC_TASKS = 5;
        let unallocTaskCount = 0;
        for (const p of items) {
          if (unallocTaskCount >= MAX_UNALLOC_TASKS) break;
          if (prevCode) {
            const prevFp = makeFingerprint(`unalloc_${prevCode}`, `pay:${p.id}`);
            if (!await hasCompletedAgentTask(prevFp)) continue;
          }
          const fp = makeFingerprint(`unalloc_${code.toLowerCase()}`, `pay:${p.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, cooldown)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `${label}: ${p.irm_no || 'Payment #' + p.id}`,
            description: `Payment ${p.irm_no || p.id} has ${p.currency} ${Number(p.unallocated_amount).toLocaleString()} unallocated for ${p.days_since_payment} days.`,
            actionPayload: {
              title: `[Finance] Allocate payment: ${p.irm_no || 'Payment #' + p.id} — ${p.currency} ${Number(p.unallocated_amount).toLocaleString()}`,
              description: `Payment ${p.irm_no || '#' + p.id} from ${p.customer_name || 'Unknown'} has ${p.currency} ${Number(p.unallocated_amount).toLocaleString()} unallocated for ${p.days_since_payment} days.\n\nPlease allocate to the correct invoice(s).\n\nSource: Finance Control Agent — ${code}`,
              priority: severity === 'high' ? 'High' : 'Medium',
              assignedTo: assignTo,
              category: `Finance ${fp}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.9,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; unallocTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F9: ADVANCE PAYMENT AGING
    // ══════════════════════════════════════════════════════════════════

    const advancePayments = await db.execute(sql`
      SELECT p.id, p.irm_no, p.payment_date, p.amount, p.currency, p.unallocated_amount,
        p.customer_id, c.bp_name as customer_name,
        EXTRACT(DAY FROM NOW() - p.payment_date::date)::int as days_since
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.is_advance_payment = true
        AND p.unallocated_amount > 1
        AND EXTRACT(DAY FROM NOW() - p.payment_date::date) >= ${settings.advance_payment_aging_days}
      ORDER BY days_since DESC
    `);
    queriesRun++;
    const advRows = (advancePayments.rows || []) as any[];

    if (advRows.length > 0) {
      const topList = advRows.slice(0, 5).map(p =>
        `  • ${p.irm_no || 'Adv #' + p.id} — ${p.customer_name || 'Unknown'} — ${p.currency} ${Number(p.unallocated_amount).toLocaleString()} (${p.days_since}d)`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'advance_payment_aging',
        severity: 'medium',
        title: `F9: ${advRows.length} advance payment${advRows.length > 1 ? 's' : ''} aging >30 days`,
        description: `${advRows.length} advance payment${advRows.length > 1 ? 's' : ''} not applied to invoices.\n\n${topList}${advRows.length > 5 ? `\n  ...and ${advRows.length - 5} more` : ''}`,
        logicType: 'rule_based',
        dataSnapshot: { count: advRows.length },
        relatedEntityType: 'payment',
        relatedEntityId: 'advance_aging',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_ADV_TASKS = 5;
        let advTaskCount = 0;
        for (const p of advRows) {
          if (advTaskCount >= MAX_ADV_TASKS) break;
          const fp = makeFingerprint('adv_aging', `pay:${p.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 7)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Advance payment aging: ${p.irm_no || 'Payment #' + p.id}`,
            description: `Advance payment from ${p.customer_name} aging ${p.days_since} days.`,
            actionPayload: {
              title: `[Finance] Apply advance payment: ${p.irm_no || '#' + p.id} — ${p.customer_name || 'Unknown'}`,
              description: `Advance payment ${p.irm_no || '#' + p.id} from ${p.customer_name || 'Unknown'} has ${p.currency} ${Number(p.unallocated_amount).toLocaleString()} unapplied for ${p.days_since} days.\n\nPlease allocate to invoice or refund.\n\nSource: Finance Control Agent — F9`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.85,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; advTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F10: ALLOCATION MISMATCH
    // ══════════════════════════════════════════════════════════════════

    const allocByPayment: Record<number, { totalAllocated: number; paymentAmount: number; currency: string; irmNo: string }> = {};
    for (const a of allocRows) {
      const pid = Number(a.payment_id);
      if (!allocByPayment[pid]) {
        allocByPayment[pid] = { totalAllocated: 0, paymentAmount: Number(a.payment_amount), currency: a.currency, irmNo: a.irm_no };
      }
      allocByPayment[pid].totalAllocated += Number(a.amount_applied);
    }

    const mismatches: { paymentId: number; irmNo: string; currency: string; diff: number }[] = [];
    for (const [pid, data] of Object.entries(allocByPayment)) {
      const diff = Math.abs(data.totalAllocated - data.paymentAmount);
      if (diff > 1) {
        mismatches.push({ paymentId: Number(pid), irmNo: data.irmNo, currency: data.currency, diff });
      }
    }

    if (mismatches.length > 0) {
      const topList = mismatches.slice(0, 5).map(m =>
        `  • ${m.irmNo || 'Payment #' + m.paymentId} — mismatch ${m.currency} ${m.diff.toLocaleString()}`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'allocation_mismatch',
        severity: 'medium',
        title: `F10: ${mismatches.length} payment allocation mismatch${mismatches.length > 1 ? 'es' : ''}`,
        description: `${mismatches.length} payment${mismatches.length > 1 ? 's have' : ' has'} allocation amounts not matching payment total.\n\n${topList}`,
        logicType: 'rule_based',
        dataSnapshot: { count: mismatches.length },
        relatedEntityType: 'payment_allocation',
        relatedEntityId: 'mismatch',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const m of mismatches) {
          const fp = makeFingerprint('alloc_mismatch', `pay:${m.paymentId}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 5)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Allocation mismatch: ${m.irmNo || 'Payment #' + m.paymentId}`,
            description: `Payment allocation doesn't match total by ${m.currency} ${m.diff.toLocaleString()}.`,
            actionPayload: {
              title: `[Finance] Fix allocation mismatch: ${m.irmNo || 'Payment #' + m.paymentId}`,
              description: `Payment ${m.irmNo || '#' + m.paymentId} has a ${m.currency} ${m.diff.toLocaleString()} mismatch between total allocated and payment amount.\n\nPlease review and correct.\n\nSource: Finance Control Agent — F10`,
              priority: 'High',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F11: FULLY PAID BUT STATUS OPEN
    // ══════════════════════════════════════════════════════════════════

    const fullyPaidOpen = await db.execute(sql`
      SELECT i.id, i.invoice_number, i.total_amount, i.currency, i.status,
        c.bp_name as customer_name,
        COALESCE(SUM(pa.amount_applied), 0) as total_allocated
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN payment_allocations pa ON i.id = pa.invoice_id
      WHERE i.status NOT IN ('Paid', 'Cancelled', 'Credit Note')
      GROUP BY i.id, i.invoice_number, i.total_amount, i.currency, i.status, c.bp_name
      HAVING COALESCE(SUM(pa.amount_applied), 0) >= i.total_amount
    `);
    queriesRun++;
    const fullyPaidRows = (fullyPaidOpen.rows || []) as any[];

    if (fullyPaidRows.length > 0) {
      const topList = fullyPaidRows.slice(0, 5).map(i =>
        `  • ${i.invoice_number} — ${i.customer_name || 'Unknown'} — ${i.currency} ${Number(i.total_amount).toLocaleString()} (status: ${i.status})`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'status_mismatch',
        severity: 'low',
        title: `F11: ${fullyPaidRows.length} invoice${fullyPaidRows.length > 1 ? 's' : ''} fully paid but status not updated`,
        description: `${fullyPaidRows.length} invoice${fullyPaidRows.length > 1 ? 's have' : ' has'} allocations >= total but status is still "${fullyPaidRows[0]?.status}".\n\n${topList}`,
        logicType: 'rule_based',
        dataSnapshot: { count: fullyPaidRows.length },
        relatedEntityType: 'invoice',
        relatedEntityId: 'fully_paid_open',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const inv of fullyPaidRows) {
          const fp = makeFingerprint('fully_paid_open', `inv:${inv.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 5)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Update status: ${inv.invoice_number} fully paid`,
            description: `Invoice ${inv.invoice_number} is fully allocated but status is still ${inv.status}.`,
            actionPayload: {
              title: `[Finance] Update invoice status: ${inv.invoice_number} — fully paid`,
              description: `Invoice ${inv.invoice_number} for ${inv.customer_name || 'Unknown'} has been fully allocated (${inv.currency} ${Number(inv.total_allocated).toLocaleString()}) but status is still "${inv.status}".\n\nPlease update to "Paid".\n\nSource: Finance Control Agent — F11`,
              priority: 'Low',
              assignedTo: L1,
              category: `Finance ${fp}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.95,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F12: PARTIALLY PAID INVOICE STALE
    // ══════════════════════════════════════════════════════════════════

    const partiallyPaidStale = await db.execute(sql`
      SELECT i.id, i.invoice_number, i.total_amount, i.currency, i.status,
        c.bp_name as customer_name,
        COALESCE(SUM(pa.amount_applied), 0) as allocated,
        MAX(pa.created_at) as last_allocation_date,
        EXTRACT(DAY FROM NOW() - MAX(pa.created_at))::int as days_since_last
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      JOIN payment_allocations pa ON i.id = pa.invoice_id
      WHERE i.status NOT IN ('Paid', 'Cancelled', 'Credit Note')
      GROUP BY i.id, i.invoice_number, i.total_amount, i.currency, i.status, c.bp_name
      HAVING COALESCE(SUM(pa.amount_applied), 0) > 0
        AND COALESCE(SUM(pa.amount_applied), 0) < i.total_amount
        AND EXTRACT(DAY FROM NOW() - MAX(pa.created_at)) >= ${settings.partial_paid_stale_days}
    `);
    queriesRun++;
    const partialRows = (partiallyPaidStale.rows || []) as any[];

    if (partialRows.length > 0) {
      const topList = partialRows.slice(0, 5).map(i =>
        `  • ${i.invoice_number} — ${i.customer_name || 'Unknown'} — paid ${i.currency} ${Number(i.allocated).toLocaleString()} of ${Number(i.total_amount).toLocaleString()} (${i.days_since_last}d stale)`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'partial_paid_stale',
        severity: 'medium',
        title: `F12: ${partialRows.length} partially paid invoice${partialRows.length > 1 ? 's' : ''} stale >30 days`,
        description: `${partialRows.length} invoice${partialRows.length > 1 ? 's' : ''} with partial payment but no allocation activity for 30+ days.\n\n${topList}`,
        logicType: 'rule_based',
        dataSnapshot: { count: partialRows.length },
        relatedEntityType: 'invoice',
        relatedEntityId: 'partial_stale',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const inv of partialRows) {
          const fp = makeFingerprint('partial_stale', `inv:${inv.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 7)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Partial payment stale: ${inv.invoice_number}`,
            description: `Invoice ${inv.invoice_number} partially paid, no activity for ${inv.days_since_last} days.`,
            actionPayload: {
              title: `[Finance] Follow up partial payment: ${inv.invoice_number} — ${inv.customer_name || 'Unknown'}`,
              description: `Invoice ${inv.invoice_number} for ${inv.customer_name || 'Unknown'} is partially paid (${inv.currency} ${Number(inv.allocated).toLocaleString()} of ${Number(inv.total_amount).toLocaleString()}) with no activity for ${inv.days_since_last} days.\n\nBalance: ${inv.currency} ${(Number(inv.total_amount) - Number(inv.allocated)).toLocaleString()}\n\nPlease follow up on remaining balance.\n\nSource: Finance Control Agent — F12`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F13-F14: HIGH OUTSTANDING / % OF TURNOVER
    // ══════════════════════════════════════════════════════════════════

    const customerOutstanding = await db.execute(sql`
      SELECT i.customer_id, c.bp_name as customer_name,
        SUM(CASE WHEN i.status NOT IN ('Paid','Cancelled','Credit Note') THEN i.total_amount ELSE 0 END) as outstanding,
        SUM(i.total_amount) as yearly_total,
        i.currency
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.issue_date::date >= CURRENT_DATE - INTERVAL '1 year'
      GROUP BY i.customer_id, c.bp_name, i.currency
      HAVING SUM(CASE WHEN i.status NOT IN ('Paid','Cancelled','Credit Note') THEN i.total_amount ELSE 0 END) > 0
      ORDER BY outstanding DESC
    `);
    queriesRun++;
    const custOutRows = (customerOutstanding.rows || []) as any[];

    const highOutstanding = custOutRows.filter(c => Number(c.outstanding) >= settings.outstanding_threshold);
    if (highOutstanding.length > 0) {
      const topList = highOutstanding.slice(0, 5).map(c =>
        `  • ${c.customer_name || 'Unknown'} — ${c.currency} ${Number(c.outstanding).toLocaleString()}`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'high_outstanding',
        severity: 'high',
        title: `F13: ${highOutstanding.length} customer${highOutstanding.length > 1 ? 's' : ''} with outstanding > ₹10,00,000`,
        description: `${highOutstanding.length} customer${highOutstanding.length > 1 ? 's have' : ' has'} outstanding balance exceeding threshold.\n\n${topList}`,
        logicType: 'rule_based',
        dataSnapshot: { count: highOutstanding.length, threshold: settings.outstanding_threshold },
        relatedEntityType: 'customer',
        relatedEntityId: 'high_outstanding',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fpL1 = makeFingerprint('high_outstanding_L1', 'aggregate');
        const fpL2 = makeFingerprint('high_outstanding_L2', 'aggregate');
        if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2) && !await hasRecentAgentTask(fpL2, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `[L2 Escalation] Credit Control Review: ${highOutstanding.length} high-outstanding customers`,
            description: `${highOutstanding.length} customers exceed outstanding threshold. L1 task completed — escalating to L2.`,
            actionPayload: {
              title: `[Finance] [L2] Credit Control Review: ${highOutstanding.length} customers with high outstanding`,
              description: `The following customers have outstanding balance exceeding ₹10,00,000:\n\n${topList}\n\nL1 review completed. Escalating to General Manager for strategic review.\n\nSource: Finance Control Agent — F13 (L2)`,
              priority: 'High',
              assignedTo: L2,
              category: `Finance ${fpL2}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.9,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        } else if (!await hasOpenAgentTask(fpL1) && !await hasRecentAgentTask(fpL1, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Credit Control Review: ${highOutstanding.length} high-outstanding customers`,
            description: `${highOutstanding.length} customers exceed outstanding threshold.`,
            actionPayload: {
              title: `[Finance] Credit Control Review: ${highOutstanding.length} customers with high outstanding`,
              description: `The following customers have outstanding balance exceeding ₹10,00,000:\n\n${topList}\n\nPlease review credit terms and collection strategy.\n\nSource: Finance Control Agent — F13 (L1)`,
              priority: 'High',
              assignedTo: L1,
              category: `Finance ${fpL1}`,
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

    const turnoverBreach = custOutRows.filter(c => {
      const yt = Number(c.yearly_total);
      const os = Number(c.outstanding);
      return yt > 0 && (os / yt * 100) >= settings.outstanding_turnover_pct;
    });
    if (turnoverBreach.length > 0) {
      const topList = turnoverBreach.slice(0, 5).map(c => {
        const pct = (Number(c.outstanding) / Number(c.yearly_total) * 100).toFixed(1);
        return `  • ${c.customer_name || 'Unknown'} — ${pct}% outstanding of yearly turnover`;
      }).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'outstanding_turnover_pct',
        severity: 'high',
        title: `F14: ${turnoverBreach.length} customer${turnoverBreach.length > 1 ? 's' : ''} — outstanding >20% of turnover`,
        description: `${turnoverBreach.length} customer${turnoverBreach.length > 1 ? 's have' : ' has'} outstanding exceeding ${settings.outstanding_turnover_pct}% of yearly turnover.\n\n${topList}`,
        logicType: 'rule_based',
        dataSnapshot: { count: turnoverBreach.length, threshold: settings.outstanding_turnover_pct },
        relatedEntityType: 'customer',
        relatedEntityId: 'turnover_breach',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fpL1 = makeFingerprint('turnover_breach_L1', 'aggregate');
        const fpL2 = makeFingerprint('turnover_breach_L2', 'aggregate');
        if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2) && !await hasRecentAgentTask(fpL2, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `[L2 Escalation] Turnover risk review: ${turnoverBreach.length} customers`,
            description: `${turnoverBreach.length} customers have outstanding >20% of turnover. L1 task completed — escalating to L2.`,
            actionPayload: {
              title: `[Finance] [L2] Turnover Risk: ${turnoverBreach.length} customers with disproportionate outstanding`,
              description: `${turnoverBreach.length} customers have outstanding balance exceeding ${settings.outstanding_turnover_pct}% of their yearly turnover.\n\n${topList}\n\nL1 review completed. Escalating to General Manager.\n\nSource: Finance Control Agent — F14 (L2)`,
              priority: 'High',
              assignedTo: L2,
              category: `Finance ${fpL2}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.85,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        } else if (!await hasOpenAgentTask(fpL1) && !await hasRecentAgentTask(fpL1, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Turnover risk review: ${turnoverBreach.length} customers`,
            description: `${turnoverBreach.length} customers have outstanding >20% of turnover.`,
            actionPayload: {
              title: `[Finance] Turnover Risk: ${turnoverBreach.length} customers with disproportionate outstanding`,
              description: `${turnoverBreach.length} customers have outstanding balance exceeding ${settings.outstanding_turnover_pct}% of their yearly turnover.\n\n${topList}\n\nThis indicates high receivable risk. Please review.\n\nSource: Finance Control Agent — F14 (L1)`,
              priority: 'High',
              assignedTo: L1,
              category: `Finance ${fpL1}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F15: AGING BUCKET ESCALATION
    // ══════════════════════════════════════════════════════════════════

    const agingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const agingAmounts: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const totalReceivables = overdueInvRows.reduce((s, i) => s + Number(i.total_amount), 0);

    for (const inv of overdueInvRows) {
      const d = Number(inv.days_overdue);
      const amt = Number(inv.total_amount);
      if (d >= 90) { agingBuckets['90+']++; agingAmounts['90+'] += amt; }
      else if (d >= 61) { agingBuckets['61-90']++; agingAmounts['61-90'] += amt; }
      else if (d >= 31) { agingBuckets['31-60']++; agingAmounts['31-60'] += amt; }
      else { agingBuckets['0-30']++; agingAmounts['0-30'] += amt; }
    }

    const movedTo90Plus = overdueInvRows.filter(i => Number(i.days_overdue) >= 90 && Number(i.days_overdue) < 120);
    if (movedTo90Plus.length > 0) {
      const fr = await findingManager.createFinding({
        findingType: 'aging_bucket_escalation',
        severity: 'medium',
        title: `F15: ${movedTo90Plus.length} invoice${movedTo90Plus.length > 1 ? 's' : ''} entered 90+ day aging bucket`,
        description: `${movedTo90Plus.length} invoice${movedTo90Plus.length > 1 ? 's have' : ' has'} moved into the 90+ day aging bucket, indicating increasing bad debt risk.`,
        logicType: 'rule_based',
        dataSnapshot: { count: movedTo90Plus.length, buckets: agingBuckets },
        relatedEntityType: 'invoice_aging',
        relatedEntityId: 'bucket_escalation',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('aging_escalation', 'bucket_90');
        if (!await hasOpenAgentTask(fp) && !await hasRecentAgentTask(fp, 7)) {
          const topList = movedTo90Plus.slice(0, 5).map(i =>
            `  • ${i.invoice_number} — ${i.customer_name} — ${i.currency} ${Number(i.total_amount).toLocaleString()}`
          ).join('\n');
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Aging escalation: ${movedTo90Plus.length} invoices entered 90+ bucket`,
            description: `Review invoices that recently entered 90+ day aging.`,
            actionPayload: {
              title: `[Finance] Aging Alert: ${movedTo90Plus.length} invoices now 90+ days overdue`,
              description: `${movedTo90Plus.length} invoices have entered the 90+ day bucket:\n\n${topList}\n\nThese require immediate collection attention.\n\nSource: Finance Control Agent — F15`,
              priority: 'High',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F16: RECEIVABLE CONCENTRATION RISK
    // ══════════════════════════════════════════════════════════════════

    if (totalReceivables > 0) {
      const pct60Plus = ((agingAmounts['61-90'] + agingAmounts['90+']) / totalReceivables * 100);
      const pct90Plus = (agingAmounts['90+'] / totalReceivables * 100);

      if (pct60Plus >= settings.receivable_concentration_60_pct || pct90Plus >= settings.receivable_concentration_90_pct) {
        const fr = await findingManager.createFinding({
          findingType: 'concentration_risk',
          severity: 'high',
          title: `F16: Receivable concentration risk — ${pct60Plus.toFixed(1)}% in 60+ days, ${pct90Plus.toFixed(1)}% in 90+`,
          description: `Receivable aging is concentrated in high-risk buckets.\n60+ days: ${pct60Plus.toFixed(1)}% (threshold: ${settings.receivable_concentration_60_pct}%)\n90+ days: ${pct90Plus.toFixed(1)}% (threshold: ${settings.receivable_concentration_90_pct}%)\n\nThis indicates systemic collection issues.`,
          logicType: 'rule_based',
          dataSnapshot: { pct60Plus, pct90Plus, totalReceivables },
          relatedEntityType: 'invoice_aging',
          relatedEntityId: 'concentration_risk',
        });
        if (!fr.isDuplicate) findingsCount++;

        if (!skipTaskCreation) {
          const fpL1 = makeFingerprint('concentration_risk_L1', 'aging');
          const fpL2 = makeFingerprint('concentration_risk_L2', 'aging');
          if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2) && !await hasRecentAgentTask(fpL2, 30)) {
            const rec = await recommendationManager.createRecommendation({
              actionCategory: 'task_creation',
              actionType: 'create_task',
              title: `[L2 Escalation] Receivable concentration risk review`,
              description: `${pct60Plus.toFixed(1)}% of receivables in 60+ bucket. L1 task completed — escalating to L2.`,
              actionPayload: {
                title: `[Finance] [L2] Receivable Concentration Risk — ${pct60Plus.toFixed(1)}% in 60+ days`,
                description: `Receivable aging concentration exceeds thresholds:\n\n60+ days: ${pct60Plus.toFixed(1)}% (limit: ${settings.receivable_concentration_60_pct}%)\n90+ days: ${pct90Plus.toFixed(1)}% (limit: ${settings.receivable_concentration_90_pct}%)\n\nL1 review completed. Escalating to General Manager.\n\nSource: Finance Control Agent — F16 (L2)`,
                priority: 'High',
                assignedTo: L2,
                category: `Finance ${fpL2}`,
                sourceType: 'agent_task',
                sourceAgent: SOURCE_AGENT,
                dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              },
              logicType: 'rule_based',
              confidence: 0.9,
              priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (!await hasOpenAgentTask(fpL1) && !await hasRecentAgentTask(fpL1, 30)) {
            const rec = await recommendationManager.createRecommendation({
              actionCategory: 'task_creation',
              actionType: 'create_task',
              title: `Receivable concentration risk review`,
              description: `${pct60Plus.toFixed(1)}% of receivables in 60+ bucket.`,
              actionPayload: {
                title: `[Finance] Receivable Concentration Risk — ${pct60Plus.toFixed(1)}% in 60+ days`,
                description: `Receivable aging concentration exceeds thresholds:\n\n60+ days: ${pct60Plus.toFixed(1)}% (limit: ${settings.receivable_concentration_60_pct}%)\n90+ days: ${pct90Plus.toFixed(1)}% (limit: ${settings.receivable_concentration_90_pct}%)\n\nReview collection strategy and customer credit terms.\n\nSource: Finance Control Agent — F16 (L1)`,
                priority: 'High',
                assignedTo: L1,
                category: `Finance ${fpL1}`,
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
    }

    // ══════════════════════════════════════════════════════════════════
    // F17: CUSTOMER AGING DETERIORATION (simplified — compare avg days overdue)
    // ══════════════════════════════════════════════════════════════════

    const custAgingNow: Record<string, number[]> = {};
    for (const inv of overdueInvRows) {
      const cust = inv.customer_name || 'Unknown';
      if (!custAgingNow[cust]) custAgingNow[cust] = [];
      custAgingNow[cust].push(Number(inv.days_overdue));
    }
    const deterioratedCusts: { name: string; avgDays: number }[] = [];
    for (const [cust, days] of Object.entries(custAgingNow)) {
      const avg = days.reduce((a, b) => a + b, 0) / days.length;
      if (avg >= settings.aging_deterioration_days && days.length >= 2) {
        deterioratedCusts.push({ name: cust, avgDays: Math.round(avg) });
      }
    }

    if (deterioratedCusts.length > 0) {
      const topList = deterioratedCusts.sort((a, b) => b.avgDays - a.avgDays).slice(0, 5).map(c =>
        `  • ${c.name} — avg ${c.avgDays} days overdue`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'aging_deterioration',
        severity: 'medium',
        title: `F17: ${deterioratedCusts.length} customer${deterioratedCusts.length > 1 ? 's' : ''} with aging deterioration`,
        description: `${deterioratedCusts.length} customer${deterioratedCusts.length > 1 ? 's show' : ' shows'} avg overdue exceeding ${settings.aging_deterioration_days} days.\n\n${topList}`,
        logicType: 'rule_based',
        dataSnapshot: { count: deterioratedCusts.length },
        relatedEntityType: 'customer',
        relatedEntityId: 'aging_deterioration',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('aging_deterioration', 'customers');
        if (!await hasOpenAgentTask(fp) && !await hasRecentAgentTask(fp, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Customer aging deterioration: ${deterioratedCusts.length} customers`,
            description: `Multiple customers show worsening payment behavior.`,
            actionPayload: {
              title: `[Finance] Customer Aging Review: ${deterioratedCusts.length} customers deteriorating`,
              description: `The following customers show aging deterioration (avg overdue >${settings.aging_deterioration_days} days):\n\n${topList}\n\nReview payment terms and follow up.\n\nSource: Finance Control Agent — F17`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F18-F20: FINANCIAL RECONCILIATION
    // F18: Unreconciled items >30 days (payments without allocation)
    // F19: Monthly reconciliation not completed (placeholder)
    // F20: Bank entry without payment record (placeholder — no bank table yet)
    // ══════════════════════════════════════════════════════════════════

    const unreconciledPayments = unallocPayments.filter(p => Number(p.days_since_payment) >= settings.unreconciled_days);
    if (unreconciledPayments.length > 0) {
      const fr = await findingManager.createFinding({
        findingType: 'unreconciled',
        severity: 'medium',
        title: `F18: ${unreconciledPayments.length} unreconciled payment${unreconciledPayments.length > 1 ? 's' : ''} >30 days`,
        description: `${unreconciledPayments.length} payment${unreconciledPayments.length > 1 ? 's remain' : ' remains'} unreconciled for more than ${settings.unreconciled_days} days.`,
        logicType: 'rule_based',
        dataSnapshot: { count: unreconciledPayments.length },
        relatedEntityType: 'payment',
        relatedEntityId: 'unreconciled',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('unreconciled', 'payments');
        if (!await hasOpenAgentTask(fp) && !await hasRecentAgentTask(fp, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Reconciliation review: ${unreconciledPayments.length} unreconciled payments`,
            description: `${unreconciledPayments.length} payments unreconciled for 30+ days.`,
            actionPayload: {
              title: `[Finance] Reconciliation: ${unreconciledPayments.length} payments unreconciled >30 days`,
              description: `${unreconciledPayments.length} payments have been unreconciled for more than 30 days.\n\nPlease allocate or investigate these payments.\n\nSource: Finance Control Agent — F18`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // F19: Reconciliation overdue — check if there are many unreconciled across the board
    const totalUnreconciledAmount = unallocPayments.reduce((s, p) => s + Number(p.unallocated_amount), 0);
    if (totalUnreconciledAmount > 500000) {
      const fr = await findingManager.createFinding({
        findingType: 'reconciliation_overdue',
        severity: 'high',
        title: `F19: Monthly reconciliation concern — large unreconciled pool`,
        description: `Total unreconciled payment pool is significant. ${unallocPayments.length} payments with total unallocated amount. Reconciliation review recommended.`,
        logicType: 'rule_based',
        dataSnapshot: { totalAmount: totalUnreconciledAmount, count: unallocPayments.length },
        relatedEntityType: 'reconciliation',
        relatedEntityId: 'monthly_overdue',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fpL1 = makeFingerprint('recon_overdue_L1', 'monthly');
        const fpL2 = makeFingerprint('recon_overdue_L2', 'monthly');
        if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2) && !await hasRecentAgentTask(fpL2, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `[L2 Escalation] Monthly reconciliation review needed`,
            description: `Large unreconciled payment pool detected. L1 task completed — escalating to L2.`,
            actionPayload: {
              title: `[Finance] [L2] Monthly Reconciliation Review — significant unreconciled pool`,
              description: `The total unreconciled payment pool is significant across ${unallocPayments.length} payments.\n\nL1 review completed. Escalating to General Manager.\n\nSource: Finance Control Agent — F19 (L2)`,
              priority: 'High',
              assignedTo: L2,
              category: `Finance ${fpL2}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.8,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        } else if (!await hasOpenAgentTask(fpL1) && !await hasRecentAgentTask(fpL1, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Monthly reconciliation review needed`,
            description: `Large unreconciled payment pool detected.`,
            actionPayload: {
              title: `[Finance] Monthly Reconciliation Review — significant unreconciled pool`,
              description: `The total unreconciled payment pool is significant across ${unallocPayments.length} payments.\n\nPlease complete monthly reconciliation.\n\nSource: Finance Control Agent — F19 (L1)`,
              priority: 'High',
              assignedTo: L1,
              category: `Finance ${fpL1}`,
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
      }
    }

    // F20: Bank entry without payment — payments with no allocations and old
    const orphanPayments = unallocPayments.filter(p =>
      Number(p.unallocated_amount) === Number(p.amount || p.unallocated_amount) && Number(p.days_since_payment) >= 30
    );
    if (orphanPayments.length > 0) {
      const fr = await findingManager.createFinding({
        findingType: 'orphan_payment',
        severity: 'medium',
        title: `F20: ${orphanPayments.length} payment${orphanPayments.length > 1 ? 's' : ''} with zero allocation (30+ days)`,
        description: `${orphanPayments.length} payment${orphanPayments.length > 1 ? 's have' : ' has'} no invoice allocation at all and are 30+ days old.`,
        logicType: 'rule_based',
        dataSnapshot: { count: orphanPayments.length },
        relatedEntityType: 'payment',
        relatedEntityId: 'orphan_payments',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('orphan_payment', 'batch');
        if (!await hasOpenAgentTask(fp) && !await hasRecentAgentTask(fp, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Orphan payments: ${orphanPayments.length} with zero allocation`,
            description: `${orphanPayments.length} payments have no allocation for 30+ days.`,
            actionPayload: {
              title: `[Finance] Investigate ${orphanPayments.length} orphan payments — zero allocation`,
              description: `${orphanPayments.length} payments have been received but have NO invoice allocation for 30+ days.\n\nThese may be bank entries without matching invoices.\n\nSource: Finance Control Agent — F20`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F21-F23: INWARD REMITTANCES
    // ══════════════════════════════════════════════════════════════════

    // F21: Remittance not linked to invoice (payments with no allocations, recent)
    const unlinkedRemittances = unallocPayments.filter(p =>
      Number(p.days_since_payment) >= 7 && Number(p.days_since_payment) < 30
    );
    if (unlinkedRemittances.length > 0) {
      const fr = await findingManager.createFinding({
        findingType: 'remittance_unlinked',
        severity: 'medium',
        title: `F21: ${unlinkedRemittances.length} remittance${unlinkedRemittances.length > 1 ? 's' : ''} not linked to invoice`,
        description: `${unlinkedRemittances.length} payment${unlinkedRemittances.length > 1 ? 's' : ''} received but not linked to any invoice (7-30 days old).`,
        logicType: 'rule_based',
        dataSnapshot: { count: unlinkedRemittances.length },
        relatedEntityType: 'payment',
        relatedEntityId: 'remittance_unlinked',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const p of unlinkedRemittances.slice(0, 10)) {
          const fp = makeFingerprint('remit_unlinked', `pay:${p.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 7)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Link remittance: ${p.irm_no || 'Payment #' + p.id}`,
            description: `Remittance from ${p.customer_name} not linked to invoice.`,
            actionPayload: {
              title: `[Finance] Link remittance to invoice: ${p.irm_no || '#' + p.id}`,
              description: `Remittance ${p.irm_no || '#' + p.id} from ${p.customer_name || 'Unknown'} (${p.currency} ${Number(p.unallocated_amount).toLocaleString()}) received ${p.days_since_payment} days ago but not linked to any invoice.\n\nSource: Finance Control Agent — F21`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // F22: Remittance-invoice amount mismatch — handled via F10 allocation mismatch
    // F23: Remittance without BRC — export payments without BRC filed
    const exportPaymentsNoBRC = await db.execute(sql`
      SELECT p.id, p.irm_no, p.amount, p.currency, p.customer_id,
        c.bp_name as customer_name,
        i.id as invoice_id, i.invoice_number, i.is_export, i.brc_received
      FROM payment_allocations pa
      JOIN payments p ON pa.payment_id = p.id
      JOIN invoices i ON pa.invoice_id = i.id
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE i.is_export = true
        AND (i.brc_received IS NULL OR i.brc_received = false)
      ORDER BY p.payment_date ASC
    `);
    queriesRun++;
    const exportNoBRC = (exportPaymentsNoBRC.rows || []) as any[];

    if (exportNoBRC.length > 0) {
      const fr = await findingManager.createFinding({
        findingType: 'remittance_no_brc',
        severity: 'medium',
        title: `F23: ${exportNoBRC.length} export remittance${exportNoBRC.length > 1 ? 's' : ''} without BRC`,
        description: `${exportNoBRC.length} export payment${exportNoBRC.length > 1 ? 's' : ''} linked to invoices that don't have BRC received.`,
        logicType: 'rule_based',
        dataSnapshot: { count: exportNoBRC.length },
        relatedEntityType: 'payment',
        relatedEntityId: 'remittance_no_brc',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('remit_no_brc', 'batch');
        if (!await hasOpenAgentTask(fp) && !await hasRecentAgentTask(fp, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Export remittances without BRC: ${exportNoBRC.length}`,
            description: `${exportNoBRC.length} export remittances need BRC filing.`,
            actionPayload: {
              title: `[Finance] File BRC for ${exportNoBRC.length} export remittances`,
              description: `${exportNoBRC.length} export payments are linked to invoices without BRC.\n\nPlease file BRC for compliance.\n\nSource: Finance Control Agent — F23`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // F24-F27: BRC MANAGEMENT
    // ══════════════════════════════════════════════════════════════════

    const brcReminder = brcPendingInvs.filter(i => Number(i.months_since_issue) >= settings.brc_reminder_months && Number(i.months_since_issue) < settings.brc_warning_months);
    const brcWarning = brcPendingInvs.filter(i => Number(i.months_since_issue) >= settings.brc_warning_months && Number(i.months_since_issue) < settings.brc_critical_months);
    const brcCritical = brcPendingInvs.filter(i => Number(i.months_since_issue) >= settings.brc_critical_months);

    for (const { items, code, label, severity, assignTo, cooldown, prevCode } of [
      { items: brcReminder, code: 'F24', label: 'BRC Reminder (6 months)', severity: 'medium' as const, assignTo: L1, cooldown: 30, prevCode: null as string | null },
      { items: brcWarning, code: 'F25', label: 'BRC Warning (8 months)', severity: 'high' as const, assignTo: L2, cooldown: 30, prevCode: 'f24' },
      { items: brcCritical, code: 'F26', label: 'BRC Critical (8.5 months — regulatory deadline)', severity: 'critical' as const, assignTo: L3, cooldown: 7, prevCode: 'f25' },
    ]) {
      if (items.length === 0) continue;

      const topList = items.slice(0, 5).map(i =>
        `  • ${i.invoice_number} — ${i.customer_name || 'Unknown'} — ${i.currency} ${Number(i.total_amount).toLocaleString()} (${i.months_since_issue}mo)`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: `brc_${code.toLowerCase()}`,
        severity,
        title: `${code}: ${items.length} export invoice${items.length > 1 ? 's' : ''} — ${label}`,
        description: `${items.length} export invoice${items.length > 1 ? 's' : ''} without BRC.\n\n${topList}${items.length > 5 ? `\n  ...and ${items.length - 5} more` : ''}\n\nBRC regulatory deadline: 9 months from export date.`,
        logicType: 'rule_based',
        dataSnapshot: { count: items.length, tier: code },
        relatedEntityType: 'brc',
        relatedEntityId: `${code}:pending`,
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const inv of items) {
          if (prevCode) {
            const prevFp = makeFingerprint(`brc_${prevCode}`, `inv:${inv.id}`);
            if (!await hasCompletedAgentTask(prevFp)) continue;
          }
          const fp = makeFingerprint(`brc_${code.toLowerCase()}`, `inv:${inv.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, cooldown)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `${label}: ${inv.invoice_number}`,
            description: `Export invoice ${inv.invoice_number} needs BRC — ${inv.months_since_issue} months since issue.`,
            actionPayload: {
              title: `[Finance] ${label}: ${inv.invoice_number} — ${inv.customer_name || 'Unknown'}`,
              description: `Export invoice ${inv.invoice_number} for ${inv.customer_name || 'Unknown'} issued ${inv.months_since_issue} months ago.\nAmount: ${inv.currency} ${Number(inv.total_amount).toLocaleString()}\n\nBRC not yet received. Regulatory deadline is 9 months.\n\n${severity === 'critical' ? '⚠️ CRITICAL: Approaching regulatory deadline!' : ''}\n\nSource: Finance Control Agent — ${code}`,
              priority: severity === 'critical' ? 'Urgent' : severity === 'high' ? 'High' : 'Medium',
              assignedTo: assignTo,
              category: `Finance ${fp}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + (severity === 'critical' ? 1 : 3) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.95,
            priority: severity === 'critical' ? 'urgent' : 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // F27: BRC pending count high
    if (brcPendingInvs.length >= settings.brc_pending_count_threshold) {
      const fr = await findingManager.createFinding({
        findingType: 'brc_count_high',
        severity: 'high',
        title: `F27: ${brcPendingInvs.length} BRC pending — above threshold (${settings.brc_pending_count_threshold})`,
        description: `Total pending BRCs: ${brcPendingInvs.length}. This is above the threshold of ${settings.brc_pending_count_threshold}.\n\nOverall BRC compliance needs attention.`,
        logicType: 'rule_based',
        dataSnapshot: { count: brcPendingInvs.length, threshold: settings.brc_pending_count_threshold },
        relatedEntityType: 'brc',
        relatedEntityId: 'count_high',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        const fpL1 = makeFingerprint('brc_count_high_L1', 'total');
        const fpL2 = makeFingerprint('brc_count_high_L2', 'total');
        if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2) && !await hasRecentAgentTask(fpL2, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `[L2 Escalation] BRC pending count high: ${brcPendingInvs.length}`,
            description: `Total BRC pending exceeds threshold. L1 task completed — escalating to L2.`,
            actionPayload: {
              title: `[Finance] [L2] BRC Compliance Alert: ${brcPendingInvs.length} BRCs pending`,
              description: `Total pending BRC count (${brcPendingInvs.length}) exceeds threshold of ${settings.brc_pending_count_threshold}.\n\nL1 review completed. Escalating to General Manager.\n\nSource: Finance Control Agent — F27 (L2)`,
              priority: 'High',
              assignedTo: L2,
              category: `Finance ${fpL2}`,
              sourceType: 'agent_task',
              sourceAgent: SOURCE_AGENT,
              dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
            logicType: 'rule_based',
            confidence: 0.9,
            priority: 'normal',
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        } else if (!await hasOpenAgentTask(fpL1) && !await hasRecentAgentTask(fpL1, 30)) {
          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `BRC pending count high: ${brcPendingInvs.length}`,
            description: `Total BRC pending exceeds threshold.`,
            actionPayload: {
              title: `[Finance] BRC Compliance Alert: ${brcPendingInvs.length} BRCs pending`,
              description: `Total pending BRC count (${brcPendingInvs.length}) exceeds threshold of ${settings.brc_pending_count_threshold}.\n\nPlease review BRC submission pipeline.\n\nSource: Finance Control Agent — F27 (L1)`,
              priority: 'High',
              assignedTo: L1,
              category: `Finance ${fpL1}`,
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

    // ══════════════════════════════════════════════════════════════════
    // F28-F30: WRITE-OFF MANAGEMENT
    // ══════════════════════════════════════════════════════════════════

    const pendingWriteOffs = writeOffRows.filter(w => w.status === 'Pending');

    // F28: Pending approval >7 days
    const staleWriteOffs = pendingWriteOffs.filter(w => {
      const created = new Date(w.date_created);
      const daysSince = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
      return daysSince >= settings.writeoff_pending_days;
    });

    if (staleWriteOffs.length > 0) {
      const fr = await findingManager.createFinding({
        findingType: 'writeoff_pending',
        severity: 'medium',
        title: `F28: ${staleWriteOffs.length} write-off${staleWriteOffs.length > 1 ? 's' : ''} pending approval >7 days`,
        description: `${staleWriteOffs.length} write-off request${staleWriteOffs.length > 1 ? 's are' : ' is'} pending approval for more than ${settings.writeoff_pending_days} days.`,
        logicType: 'rule_based',
        dataSnapshot: { count: staleWriteOffs.length },
        relatedEntityType: 'write_off',
        relatedEntityId: 'pending_stale',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const wo of staleWriteOffs) {
          const fpL1 = makeFingerprint('writeoff_pending_L1', `wo:${wo.id}`);
          const fpL2 = makeFingerprint('writeoff_pending_L2', `wo:${wo.id}`);
          if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2) && !await hasRecentAgentTask(fpL2, 7)) {
            const rec = await recommendationManager.createRecommendation({
              actionCategory: 'task_creation',
              actionType: 'create_task',
              title: `[L2 Escalation] Write-off pending: ${wo.invoice_number || 'WO #' + wo.id}`,
              description: `Write-off for invoice ${wo.invoice_number} pending approval. L1 task completed — escalating to L2.`,
              actionPayload: {
                title: `[Finance] [L2] Approve/Reject write-off: ${wo.invoice_number || 'WO #' + wo.id}`,
                description: `Write-off request for invoice ${wo.invoice_number || 'Unknown'} (amount: ${Number(wo.amount).toLocaleString()}) has been pending approval for 7+ days.\n\nReason: ${wo.reason || 'Not specified'}\n\nL1 review completed. Escalating to General Manager.\n\nSource: Finance Control Agent — F28 (L2)`,
                priority: 'High',
                assignedTo: L2,
                category: `Finance ${fpL2}`,
                sourceType: 'agent_task',
                sourceAgent: SOURCE_AGENT,
                dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              },
              logicType: 'rule_based',
              confidence: 0.9,
              priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (!await hasOpenAgentTask(fpL1) && !await hasRecentAgentTask(fpL1, 7)) {
            const rec = await recommendationManager.createRecommendation({
              actionCategory: 'task_creation',
              actionType: 'create_task',
              title: `Write-off pending: ${wo.invoice_number || 'WO #' + wo.id}`,
              description: `Write-off for invoice ${wo.invoice_number} pending approval.`,
              actionPayload: {
                title: `[Finance] Approve/Reject write-off: ${wo.invoice_number || 'WO #' + wo.id}`,
                description: `Write-off request for invoice ${wo.invoice_number || 'Unknown'} (amount: ${Number(wo.amount).toLocaleString()}) has been pending approval for 7+ days.\n\nReason: ${wo.reason || 'Not specified'}\n\nPlease review and approve/reject.\n\nSource: Finance Control Agent — F28 (L1)`,
                priority: 'Medium',
                assignedTo: L1,
                category: `Finance ${fpL1}`,
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
        }
      }
    }

    // F29: Large write-off alert
    const largeWriteOffs = pendingWriteOffs.filter(w => Number(w.amount) >= settings.writeoff_approval_threshold);
    if (largeWriteOffs.length > 0) {
      const topList = largeWriteOffs.map(w =>
        `  • ${w.invoice_number || 'WO #' + w.id} — ₹${Number(w.amount).toLocaleString()}`
      ).join('\n');

      const fr = await findingManager.createFinding({
        findingType: 'writeoff_large',
        severity: 'critical',
        title: `F29: ${largeWriteOffs.length} large write-off${largeWriteOffs.length > 1 ? 's' : ''} (>₹1,00,000) pending`,
        description: `${largeWriteOffs.length} write-off${largeWriteOffs.length > 1 ? 's' : ''} above ₹${settings.writeoff_approval_threshold.toLocaleString()} require CFO/Super User approval.\n\n${topList}`,
        logicType: 'rule_based',
        dataSnapshot: { count: largeWriteOffs.length, threshold: settings.writeoff_approval_threshold },
        relatedEntityType: 'write_off',
        relatedEntityId: 'large_writeoff',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const wo of largeWriteOffs) {
          const fpL1 = makeFingerprint('writeoff_large_L1', `wo:${wo.id}`);
          const fpL2 = makeFingerprint('writeoff_large_L2', `wo:${wo.id}`);
          const fpL3 = makeFingerprint('writeoff_large_L3', `wo:${wo.id}`);
          if (await hasCompletedAgentTask(fpL2) && !await hasOpenAgentTask(fpL3) && !await hasRecentAgentTask(fpL3, 7)) {
            const rec = await recommendationManager.createRecommendation({
              actionCategory: 'task_creation',
              actionType: 'create_task',
              title: `[L3 Escalation] Large write-off approval: ${wo.invoice_number || 'WO #' + wo.id}`,
              description: `Write-off of ₹${Number(wo.amount).toLocaleString()} requires Super User approval. L2 task completed — escalating to L3.`,
              actionPayload: {
                title: `[Finance] [L3] URGENT: Large write-off approval — ${wo.invoice_number || 'WO #' + wo.id} (₹${Number(wo.amount).toLocaleString()})`,
                description: `Write-off request for invoice ${wo.invoice_number || 'Unknown'} with amount ₹${Number(wo.amount).toLocaleString()} exceeds the threshold of ₹${settings.writeoff_approval_threshold.toLocaleString()}.\n\nReason: ${wo.reason || 'Not specified'}\n\nL2 review completed. Escalating to Super User / CFO for final approval.\n\nSource: Finance Control Agent — F29 (L3)`,
                priority: 'Urgent',
                assignedTo: L3,
                category: `Finance ${fpL3}`,
                sourceType: 'agent_task',
                sourceAgent: SOURCE_AGENT,
                dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              },
              logicType: 'rule_based',
              confidence: 0.95,
              priority: 'urgent',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2) && !await hasRecentAgentTask(fpL2, 7)) {
            const rec = await recommendationManager.createRecommendation({
              actionCategory: 'task_creation',
              actionType: 'create_task',
              title: `[L2 Escalation] Large write-off review: ${wo.invoice_number || 'WO #' + wo.id}`,
              description: `Write-off of ₹${Number(wo.amount).toLocaleString()} — L1 review completed, escalating to L2.`,
              actionPayload: {
                title: `[Finance] [L2] Large write-off review — ${wo.invoice_number || 'WO #' + wo.id} (₹${Number(wo.amount).toLocaleString()})`,
                description: `Write-off request for invoice ${wo.invoice_number || 'Unknown'} with amount ₹${Number(wo.amount).toLocaleString()} exceeds the threshold of ₹${settings.writeoff_approval_threshold.toLocaleString()}.\n\nReason: ${wo.reason || 'Not specified'}\n\nL1 review completed. Escalating to General Manager.\n\nSource: Finance Control Agent — F29 (L2)`,
                priority: 'High',
                assignedTo: L2,
                category: `Finance ${fpL2}`,
                sourceType: 'agent_task',
                sourceAgent: SOURCE_AGENT,
                dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              },
              logicType: 'rule_based',
              confidence: 0.95,
              priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (!await hasOpenAgentTask(fpL1) && !await hasRecentAgentTask(fpL1, 7)) {
            const rec = await recommendationManager.createRecommendation({
              actionCategory: 'task_creation',
              actionType: 'create_task',
              title: `Large write-off review: ${wo.invoice_number || 'WO #' + wo.id}`,
              description: `Write-off of ₹${Number(wo.amount).toLocaleString()} exceeds threshold — initial review needed.`,
              actionPayload: {
                title: `[Finance] Large write-off review — ${wo.invoice_number || 'WO #' + wo.id} (₹${Number(wo.amount).toLocaleString()})`,
                description: `Write-off request for invoice ${wo.invoice_number || 'Unknown'} with amount ₹${Number(wo.amount).toLocaleString()} exceeds the threshold of ₹${settings.writeoff_approval_threshold.toLocaleString()}.\n\nReason: ${wo.reason || 'Not specified'}\n\nPlease review and prepare for escalation.\n\nSource: Finance Control Agent — F29 (L1)`,
                priority: 'High',
                assignedTo: L1,
                category: `Finance ${fpL1}`,
                sourceType: 'agent_task',
                sourceAgent: SOURCE_AGENT,
                dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              },
              logicType: 'rule_based',
              confidence: 0.95,
              priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }
    }

    // F30: Write-off without documentation
    const undocumentedWriteOffs = writeOffRows.filter(w =>
      w.status === 'Pending' && (!w.reason || w.reason.trim().length < 5) && (!w.notes || w.notes.trim().length < 5)
    );
    if (undocumentedWriteOffs.length > 0) {
      const fr = await findingManager.createFinding({
        findingType: 'writeoff_no_docs',
        severity: 'medium',
        title: `F30: ${undocumentedWriteOffs.length} write-off${undocumentedWriteOffs.length > 1 ? 's' : ''} without documentation`,
        description: `${undocumentedWriteOffs.length} write-off request${undocumentedWriteOffs.length > 1 ? 's' : ''} created without proper reason/notes.`,
        logicType: 'rule_based',
        dataSnapshot: { count: undocumentedWriteOffs.length },
        relatedEntityType: 'write_off',
        relatedEntityId: 'no_docs',
      });
      if (!fr.isDuplicate) findingsCount++;

      if (!skipTaskCreation) {
        for (const wo of undocumentedWriteOffs) {
          const fp = makeFingerprint('writeoff_nodocs', `wo:${wo.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 7)) continue;

          const rec = await recommendationManager.createRecommendation({
            actionCategory: 'task_creation',
            actionType: 'create_task',
            title: `Add documentation: Write-off ${wo.invoice_number || '#' + wo.id}`,
            description: `Write-off request missing reason/notes.`,
            actionPayload: {
              title: `[Finance] Add documentation to write-off: ${wo.invoice_number || '#' + wo.id}`,
              description: `Write-off request for invoice ${wo.invoice_number || 'Unknown'} (amount: ${Number(wo.amount).toLocaleString()}) was created without proper reason or supporting notes.\n\nPlease add documentation before approval.\n\nSource: Finance Control Agent — F30`,
              priority: 'Medium',
              assignedTo: L1,
              category: `Finance ${fp}`,
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
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // O1-O6: OBSERVATIONAL METRICS (no tasks)
    // ══════════════════════════════════════════════════════════════════

    // O1: Daily payments received
    const todayPayRows = (todayPayments.rows || []) as any[];
    if (todayPayRows.length > 0) {
      const paymentsSummary = todayPayRows.map(r => `${r.currency}: ${Number(r.total).toLocaleString()} (${r.cnt} payments)`).join(', ');
      const fr = await findingManager.createFinding({
        findingType: 'observation',
        severity: 'low',
        title: `O1: Daily Payments Received — ${paymentsSummary}`,
        description: `Payments received today: ${paymentsSummary}`,
        logicType: 'rule_based',
        dataSnapshot: todayPayRows,
        relatedEntityType: 'observation',
        relatedEntityId: 'daily_payments',
      });
      if (!fr.isDuplicate) findingsCount++;
    }

    // O2: Invoice aging distribution
    {
      const fr = await findingManager.createFinding({
        findingType: 'observation',
        severity: 'low',
        title: `O2: Invoice Aging — 0-30d: ${agingBuckets['0-30']}, 31-60d: ${agingBuckets['31-60']}, 61-90d: ${agingBuckets['61-90']}, 90+d: ${agingBuckets['90+']}`,
        description: `Current aging distribution of overdue invoices:\n0-30 days: ${agingBuckets['0-30']} invoices\n31-60 days: ${agingBuckets['31-60']} invoices\n61-90 days: ${agingBuckets['61-90']} invoices\n90+ days: ${agingBuckets['90+']} invoices`,
        logicType: 'rule_based',
        dataSnapshot: { buckets: agingBuckets, amounts: agingAmounts },
        relatedEntityType: 'observation',
        relatedEntityId: 'aging_distribution',
      });
      if (!fr.isDuplicate) findingsCount++;
    }

    // O3: Collection efficiency
    const paidWithinTerms = allInvRows.filter(i => i.status === 'Paid' && Number(i.days_overdue) <= 0).length;
    const totalPaid = allInvRows.filter(i => i.status === 'Paid').length;
    const collectionEfficiency = totalPaid > 0 ? (paidWithinTerms / totalPaid * 100).toFixed(1) : '0';
    {
      const fr = await findingManager.createFinding({
        findingType: 'observation',
        severity: 'low',
        title: `O3: Collection Efficiency — ${collectionEfficiency}%`,
        description: `${collectionEfficiency}% of paid invoices were collected within their payment terms.\nPaid within terms: ${paidWithinTerms}\nTotal paid: ${totalPaid}`,
        logicType: 'rule_based',
        dataSnapshot: { paidWithinTerms, totalPaid, efficiency: collectionEfficiency },
        relatedEntityType: 'observation',
        relatedEntityId: 'collection_efficiency',
      });
      if (!fr.isDuplicate) findingsCount++;
    }

    // O4: BRC compliance ratio
    const totalExport = allInvRows.filter(i => i.is_export === true).length;
    const brcReceived = allInvRows.filter(i => i.is_export === true && i.brc_received === true).length;
    const brcRatio = totalExport > 0 ? (brcReceived / totalExport * 100).toFixed(1) : 'N/A';
    {
      const fr = await findingManager.createFinding({
        findingType: 'observation',
        severity: 'low',
        title: `O4: BRC Compliance — ${brcRatio}% (${brcReceived}/${totalExport})`,
        description: `BRC received: ${brcReceived} of ${totalExport} export invoices (${brcRatio}%).\nPending: ${brcPendingInvs.length}`,
        logicType: 'rule_based',
        dataSnapshot: { totalExport, brcReceived, brcPending: brcPendingInvs.length, ratio: brcRatio },
        relatedEntityType: 'observation',
        relatedEntityId: 'brc_compliance',
      });
      if (!fr.isDuplicate) findingsCount++;
    }

    // O5: Write-off trend
    const thisMonthWriteOffs = writeOffRows.filter(w => {
      const d = new Date(w.date_created);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && w.status === 'Approved';
    });
    const lastMonthWriteOffs = writeOffRows.filter(w => {
      const d = new Date(w.date_created);
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
      return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear() && w.status === 'Approved';
    });
    {
      const thisTotal = thisMonthWriteOffs.reduce((s, w) => s + Number(w.amount), 0);
      const lastTotal = lastMonthWriteOffs.reduce((s, w) => s + Number(w.amount), 0);
      const fr = await findingManager.createFinding({
        findingType: 'observation',
        severity: 'low',
        title: `O5: Write-off Trend — This month: ₹${thisTotal.toLocaleString()} (${thisMonthWriteOffs.length}), Last: ₹${lastTotal.toLocaleString()} (${lastMonthWriteOffs.length})`,
        description: `Write-off trend:\nThis month: ${thisMonthWriteOffs.length} approved (₹${thisTotal.toLocaleString()})\nLast month: ${lastMonthWriteOffs.length} approved (₹${lastTotal.toLocaleString()})`,
        logicType: 'rule_based',
        dataSnapshot: { thisMonth: { count: thisMonthWriteOffs.length, amount: thisTotal }, lastMonth: { count: lastMonthWriteOffs.length, amount: lastTotal } },
        relatedEntityType: 'observation',
        relatedEntityId: 'writeoff_trend',
      });
      if (!fr.isDuplicate) findingsCount++;
    }

    // O6: Unallocated payment pool
    {
      const totalPool = unallocPayments.reduce((s, p) => s + Number(p.unallocated_amount), 0);
      const fr = await findingManager.createFinding({
        findingType: 'observation',
        severity: 'low',
        title: `O6: Unallocated Payment Pool — ${unallocPayments.length} payments, total unallocated across currencies`,
        description: `Total unallocated payment pool: ${unallocPayments.length} payments with unallocated amounts.`,
        logicType: 'rule_based',
        dataSnapshot: { count: unallocPayments.length, totalPool },
        relatedEntityType: 'observation',
        relatedEntityId: 'unallocated_pool',
      });
      if (!fr.isDuplicate) findingsCount++;
    }

    // ══════════════════════════════════════════════════════════════════
    // EXECUTE AUTO-APPROVED RECOMMENDATIONS
    // ══════════════════════════════════════════════════════════════════

    for (const recId of autoExecuteQueue) {
      try {
        const result = await actionExecutor.execute(recId);
        if (result.success) autoExecutedCount++;
      } catch (err: any) {
        console.error(`[Finance] Auto-execute error for rec ${recId}:`, err.message);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // I1: DAILY FINANCE SUMMARY (every run)
    // ══════════════════════════════════════════════════════════════════

    const totalOutstanding = overdueInvRows.reduce((s, i) => s + Number(i.total_amount), 0);
    const todayCollections = todayPayRows.reduce((s, r) => s + Number(r.total), 0);

    await insightManager.createInsight({
      findingIds: [],
      insightType: 'summary',
      title: `Daily Finance Summary — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      content: [
        `=== DAILY FINANCE SUMMARY ===`,
        `Date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
        ``,
        `--- OVERDUE INVOICES ---`,
        `Total overdue: ${overdueInvRows.length} invoices`,
        `1-15 days: ${invTier1.length} | 16-30 days: ${invTier2.length} | 31-60 days: ${invTier3.length}`,
        `61-90 days: ${invTier4.length} | 90+ days: ${invTier5.length}`,
        ``,
        `--- COLLECTIONS ---`,
        `Today: ${todayPayRows.map(r => `${r.currency} ${Number(r.total).toLocaleString()}`).join(', ') || 'None'}`,
        ``,
        `--- PAYMENT ALLOCATION ---`,
        `Unallocated payments: ${unallocPayments.length}`,
        `Allocation mismatches: ${mismatches.length}`,
        `Fully paid but status open: ${fullyPaidRows.length}`,
        ``,
        `--- BRC COMPLIANCE ---`,
        `Pending BRCs: ${brcPendingInvs.length}`,
        `At 6mo reminder: ${brcReminder.length} | At 8mo warning: ${brcWarning.length} | At 8.5mo critical: ${brcCritical.length}`,
        `BRC compliance ratio: ${brcRatio}%`,
        ``,
        `--- WRITE-OFFS ---`,
        `Pending approval: ${pendingWriteOffs.length}`,
        `Stale (>7d): ${staleWriteOffs.length} | Large (>₹1L): ${largeWriteOffs.length}`,
        ``,
        `--- AGING DISTRIBUTION ---`,
        `0-30d: ${agingBuckets['0-30']} | 31-60d: ${agingBuckets['31-60']} | 61-90d: ${agingBuckets['61-90']} | 90+d: ${agingBuckets['90+']}`,
        `Collection efficiency: ${collectionEfficiency}%`,
        ``,
        `--- AGENT ACTIONS ---`,
        `First run (baseline): ${firstRun}`,
        `Auto-closed tasks: ${autoClosedCount}`,
        `Tasks created: ${autoExecutedCount}`,
        `Findings: ${findingsCount}`,
      ].join('\n'),
      logicType: 'rule_based',
      dataSources: ['invoices', 'payments', 'payment_allocations', 'bank_realization_certificates', 'write_offs'],
      scopePeriod: 'daily',
    });
    insightsCount++;

    // ══════════════════════════════════════════════════════════════════
    // I2: WEEKLY FINANCE HEALTH REPORT (Mondays)
    // ══════════════════════════════════════════════════════════════════

    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 1) {
      const top10Debtors = custOutRows.sort((a, b) => Number(b.outstanding) - Number(a.outstanding)).slice(0, 10);
      const debtorList = top10Debtors.map((c, i) =>
        `  ${i + 1}. ${c.customer_name || 'Unknown'} — ${c.currency} ${Number(c.outstanding).toLocaleString()}`
      ).join('\n');

      await insightManager.createInsight({
        findingIds: [],
        insightType: 'kpi_report',
        title: `Weekly Finance Health Report — Week of ${new Date().toLocaleDateString('en-IN')}`,
        content: [
          `=== WEEKLY FINANCE HEALTH REPORT ===`,
          `Week ending: ${new Date().toLocaleDateString('en-IN')}`,
          ``,
          `--- TOP 10 DEBTORS ---`,
          debtorList || '  No outstanding debtors',
          ``,
          `--- AGING MOVEMENT ---`,
          `0-30d: ${agingBuckets['0-30']} invoices`,
          `31-60d: ${agingBuckets['31-60']} invoices`,
          `61-90d: ${agingBuckets['61-90']} invoices`,
          `90+d: ${agingBuckets['90+']} invoices`,
          ``,
          `--- COLLECTION PERFORMANCE ---`,
          `Efficiency: ${collectionEfficiency}%`,
          `Unallocated payments: ${unallocPayments.length}`,
          ``,
          `--- BRC COMPLIANCE ---`,
          `Ratio: ${brcRatio}%`,
          `Pending: ${brcPendingInvs.length}`,
          `Critical (8.5mo+): ${brcCritical.length}`,
          ``,
          `--- WRITE-OFF SUMMARY ---`,
          `Pending: ${pendingWriteOffs.length}`,
          `This month approved: ${thisMonthWriteOffs.length}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSources: ['invoices', 'payments', 'bank_realization_certificates', 'write_offs'],
        scopePeriod: 'weekly',
      });
      insightsCount++;
    }

    // ══════════════════════════════════════════════════════════════════
    // I3: MONTHLY FINANCE MIS (1st of month)
    // ══════════════════════════════════════════════════════════════════

    const dayOfMonth = new Date().getDate();
    if (dayOfMonth === 1) {
      const totalInvoiced = allInvRows.reduce((s, i) => s + Number(i.total_amount), 0);
      const totalPaidAmount = allInvRows.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.total_amount), 0);
      const dso = totalPaid > 0
        ? Math.round(allInvRows.filter(i => i.status === 'Paid' && i.days_overdue !== undefined).reduce((s, i) => s + Math.max(0, Number(i.days_overdue)), 0) / totalPaid)
        : 0;

      await insightManager.createInsight({
        findingIds: [],
        insightType: 'kpi_report',
        title: `Monthly Finance MIS — ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
        content: [
          `=== MONTHLY FINANCE MIS ===`,
          `Period: ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
          ``,
          `--- TURNOVER ---`,
          `Total invoiced (12 months): ${totalInvoiced.toLocaleString()}`,
          `Total collected: ${totalPaidAmount.toLocaleString()}`,
          ``,
          `--- RECEIVABLES ---`,
          `Total outstanding: ${totalOutstanding.toLocaleString()}`,
          `Overdue invoices: ${overdueInvRows.length}`,
          `DSO (Days Sales Outstanding): ${dso} days`,
          ``,
          `--- BAD DEBT EXPOSURE ---`,
          `90+ day invoices: ${invTier5.length}`,
          `Bad debt risk amount: ${agingAmounts['90+'].toLocaleString()}`,
          ``,
          `--- BRC STATUS ---`,
          `Compliance: ${brcRatio}%`,
          `Pending: ${brcPendingInvs.length}`,
          `Critical: ${brcCritical.length}`,
          ``,
          `--- WRITE-OFFS ---`,
          `This month: ${thisMonthWriteOffs.length} (₹${thisMonthWriteOffs.reduce((s, w) => s + Number(w.amount), 0).toLocaleString()})`,
          `Pending: ${pendingWriteOffs.length}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSources: ['invoices', 'payments', 'bank_realization_certificates', 'write_offs'],
        scopePeriod: 'monthly',
      });
      insightsCount++;
    }

    // ══════════════════════════════════════════════════════════════════
    // EPC BILLING MONITORING (EPC-BR1)
    // ══════════════════════════════════════════════════════════════════
    let epcResolved = 0;
    try {
      const epcBR1Active = new Set<string>();

      const br1Rows = await db.execute(sql`
        SELECT ebr.id, ebr.status, ebr.updated_at, ebr.project_id,
          p.name as project_name, p.manager_id
        FROM epc_billing_readiness ebr
        JOIN projects p ON ebr.project_id = p.id
        WHERE ebr.status = 'ready'
          AND NOT EXISTS (
            SELECT 1 FROM epc_invoices ei
            WHERE ei.billing_readiness_id = ebr.id
          )
      `);
      queriesRun++;
      const br1Def = EPC_FINDING_DEFS['EPC-BR1'];
      for (const row of (br1Rows.rows || []) as any[]) {
        if (!hasGracePassed(row.updated_at, br1Def)) continue;
        const fingerprint = `[fp:fin_epc_br1:billing:${row.id}]`;
        epcBR1Active.add(fingerprint);
        const daysSince = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / 86400000);
        const track = await trackFinding({
          fingerprint, findingCode: 'EPC-BR1', agentKey: AGENT_KEY,
          severity: br1Def.severity, projectId: row.project_id,
          entityType: 'epc_billing_readiness', entityId: row.id,
          cooldownHours: br1Def.cooldownHours,
          metadata: { daysSince },
        });
        if (track.withinCooldown) continue;

        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'medium',
          title: `EPC-BR1 Billing Ready No Invoice: Project "${row.project_name}" (${daysSince}d)`,
          description: `Billing milestone ready ${daysSince}d ago but no invoice raised.\nProject: ${row.project_name}\nRevenue delay — milestone cleared for billing.`,
          logicType: 'rule_based',
          dataSnapshot: { billingId: row.id, daysSince, projectId: row.project_id },
          relatedEntityType: 'epc_billing_readiness', relatedEntityId: String(row.id),
        });
        if (!finding.isDuplicate) findingsCount++;

        if (!await hasOpenAgentTask(fingerprint)) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding.id || finding.findingId,
            title: `[Agent] EPC-BR1 Billing Ready No Invoice: ${row.project_name}`,
            actionType: 'create_task',
            description: `Billing milestone ready ${daysSince}d ago, no invoice.`,
            actionPayload: {
              title: `[Agent] EPC-BR1 Billing Ready — No Invoice (${daysSince}d)`,
              description: `Billing readiness #${row.id} marked ready ${daysSince}d ago but no invoice raised.\nProject: ${row.project_name}\nagent_severity: ${br1Def.severity}\n\nAction: Raise invoice for this billing milestone.`,
              assignedTo: L1, priority: 'Medium', category: `Finance ${fingerprint}`,
            },
            actionCategory: 'task_creation', logicType: 'rule_based', priority: 'medium', confidence: 0.9,
          });
          if (rec.id > 0) {
            recommendationsCount++;
            if (rec.autoApproved) autoExecuteQueue.push(rec.id);
            await markTaskCreated(track.id);
          }
        }
        await markAlerted(track.id);
      }

      epcResolved += await resolveFindings({
        findingCode: 'EPC-BR1', agentKey: AGENT_KEY, sourceAgent: SOURCE_AGENT, stillActiveFingerprints: epcBR1Active,
      });
      console.log(`[Finance] EPC Module: ${epcBR1Active.size} active, ${epcResolved} resolved`);
    } catch (err: any) {
      console.error(`[Finance] EPC Billing module error:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // RETURN RESULT
    // ══════════════════════════════════════════════════════════════════

    console.log(`[Finance] Run complete — findings: ${findingsCount}, insights: ${insightsCount}, recommendations: ${recommendationsCount}, tasks created: ${autoExecutedCount}, auto-closed: ${autoClosedCount}`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      executionMetadata: {
        durationMs: Date.now() - startTime,
        queriesRun,
        llmCalls: 0,
        tokensUsed: 0,
        firstRun,
        autoClosedCount,
        autoExecutedCount,
        epcResolved,
        settings: {
          L1_accountManager: L1,
          L2_generalManager: L2,
          L3_superUser: L3,
        },
      },
    };
  }
}
