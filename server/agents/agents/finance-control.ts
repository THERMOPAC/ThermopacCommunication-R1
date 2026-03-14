import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { agentDataRepo } from '../data-access/agent-data-repo';

export class FinanceControlAgent implements IAgent {
  key = 'finance_control';
  displayName = 'Finance Control Agent';
  category = 'finance';

  getSubscribedEvents(): string[] {
    return [
      'finance.brc.overdue',
      'finance.invoice.overdue',
      'finance.payment.pending',
    ];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let queriesRun = 0;

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);

    // ─── 1. BRC PENDING TASKS ───
    const overdueTasks = await agentDataRepo.getOverdueTasks(context.companyScope, 1);
    queriesRun++;

    const brcTasks = overdueTasks.filter(t =>
      t.category === 'Finance' && (t.title || '').startsWith('BRC Pending')
    );

    const brcByAssignee: Record<string, typeof brcTasks> = {};
    for (const task of brcTasks) {
      if (task.daysOverdue < 7) continue;
      const assignee = task.assigneeName || 'Unassigned';
      if (!brcByAssignee[assignee]) brcByAssignee[assignee] = [];
      brcByAssignee[assignee].push(task);
    }

    for (const [assignee, tasks] of Object.entries(brcByAssignee)) {
      const maxDays = Math.max(...tasks.map(t => t.daysOverdue));
      const severity = maxDays >= 90 ? 'critical' as const :
                       maxDays >= 30 ? 'high' as const :
                       maxDays >= 14 ? 'medium' as const : 'low' as const;

      const topTasks = tasks.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
      const topList = topTasks.map(t => {
        const shortTitle = (t.title || '').replace('BRC Pending for ', '');
        return `  • ${shortTitle} (${t.daysOverdue} days)`;
      }).join('\n');

      const description = [
        `${assignee} has ${tasks.length} overdue BRC Finance task${tasks.length > 1 ? 's' : ''}.`,
        `Worst overdue: ${maxDays} days.`,
        `\nThese tasks relate to export BRC (Bank Realisation Certificate) submission for completed invoices.`,
        `Delayed BRC submissions may impact export compliance, foreign remittance documentation, and RBI reporting obligations.`,
        `\nTop overdue tasks:\n${topList}`,
        tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
      ].filter(Boolean).join('\n');

      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity,
        title: `${assignee}: ${tasks.length} overdue BRC tasks (worst: ${maxDays} days)`,
        description,
        logicType: 'rule_based',
        dataSnapshot: {
          assigneeName: assignee, taskCount: tasks.length, maxDaysOverdue: maxDays,
          topTasks: topTasks.map(t => ({ id: t.id, title: t.title, daysOverdue: t.daysOverdue })),
        },
        relatedEntityType: 'brc_task_group',
        relatedEntityId: `${assignee}:brc`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 2. INVOICE FOLLOW-UP TASKS ───
    const invoiceTasks = overdueTasks.filter(t =>
      t.category === 'Finance' && !(t.title || '').startsWith('BRC Pending')
    );

    const invoiceByAssignee: Record<string, typeof invoiceTasks> = {};
    for (const task of invoiceTasks) {
      if (task.daysOverdue < 7) continue;
      const assignee = task.assigneeName || 'Unassigned';
      if (!invoiceByAssignee[assignee]) invoiceByAssignee[assignee] = [];
      invoiceByAssignee[assignee].push(task);
    }

    for (const [assignee, tasks] of Object.entries(invoiceByAssignee)) {
      const maxDays = Math.max(...tasks.map(t => t.daysOverdue));
      const severity = maxDays >= 90 ? 'critical' as const :
                       maxDays >= 30 ? 'high' as const :
                       maxDays >= 14 ? 'medium' as const : 'low' as const;

      const topTasks = tasks.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
      const topList = topTasks.map(t => `  • ${t.title} (${t.daysOverdue} days)`).join('\n');

      const description = [
        `${assignee} has ${tasks.length} overdue invoice/payment follow-up task${tasks.length > 1 ? 's' : ''}.`,
        `Worst overdue: ${maxDays} days.`,
        `\nThese tasks relate to outstanding invoice follow-ups and payment collection.`,
        `Delayed follow-ups may impact cash flow, accounts receivable aging, and customer payment discipline.`,
        `\nTop overdue tasks:\n${topList}`,
        tasks.length > 5 ? `\n...and ${tasks.length - 5} more.` : '',
      ].filter(Boolean).join('\n');

      const result = await findingManager.createFinding({
        findingType: 'overdue',
        severity,
        title: `${assignee}: ${tasks.length} overdue invoice/payment tasks (worst: ${maxDays} days)`,
        description,
        logicType: 'rule_based',
        dataSnapshot: {
          assigneeName: assignee, taskCount: tasks.length, maxDaysOverdue: maxDays,
          topTasks: topTasks.map(t => ({ id: t.id, title: t.title, daysOverdue: t.daysOverdue })),
        },
        relatedEntityType: 'invoice_task_group',
        relatedEntityId: `${assignee}:invoice`,
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 3. OVERDUE INVOICES (from finance KPIs) ───
    const financeKPIs = await agentDataRepo.getFinanceKPIs(context.companyScope);
    queriesRun++;

    const totalOverdueInvoices = financeKPIs.reduce((sum, k) => sum + k.overdueInvoices, 0);
    if (totalOverdueInvoices > 5) {
      const severity = totalOverdueInvoices >= 100 ? 'critical' as const :
                       totalOverdueInvoices >= 50 ? 'high' as const : 'medium' as const;

      const companyBreakdown = financeKPIs
        .filter(k => k.overdueInvoices > 0)
        .map(k => `  • ${k.companyName}: ${k.overdueInvoices} overdue out of ${k.totalInvoices} total`)
        .join('\n');

      const invoiceImpact = totalOverdueInvoices >= 100
        ? 'Critical accounts receivable situation. Overdue invoices at this scale directly impact cash flow, working capital, and may signal collection process failures.'
        : totalOverdueInvoices >= 50
        ? 'Significant overdue invoice volume. Cash flow impact likely material. Review aging report and escalate high-value overdue accounts.'
        : 'Overdue invoice count above threshold. Monitor closely and review collection follow-up processes.';

      const result = await findingManager.createFinding({
        findingType: 'threshold_breach',
        severity,
        title: `${totalOverdueInvoices} invoices overdue across all companies`,
        description: [
          `There are ${totalOverdueInvoices} overdue invoices across ${financeKPIs.filter(k => k.overdueInvoices > 0).length} companies.`,
          `\nCompany breakdown:\n${companyBreakdown}`,
          `\n${invoiceImpact}`,
        ].join('\n'),
        logicType: 'rule_based',
        dataSnapshot: financeKPIs,
        relatedEntityType: 'invoice',
        relatedEntityId: 'aggregate',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── 4. PAYMENT ALLOCATION GAPS ───
    const paymentGaps = await agentDataRepo.getUnallocatedPayments();
    queriesRun++;

    if (paymentGaps.length > 0) {
      const totalUnallocated = paymentGaps.reduce((sum, p) => sum + p.unallocatedAmount, 0);
      const severity = totalUnallocated >= 500000 ? 'high' as const :
                       totalUnallocated >= 100000 ? 'medium' as const : 'low' as const;

      const topPayments = paymentGaps.slice(0, 5).map(p =>
        `  • Payment ${p.paymentRef}: ${p.currency} ${p.unallocatedAmount.toLocaleString()} unallocated (${p.daysSincePayment} days old)`
      ).join('\n');

      const description = [
        `${paymentGaps.length} payment${paymentGaps.length > 1 ? 's' : ''} with unallocated amounts totaling approximately ${paymentGaps[0]?.currency || ''} ${totalUnallocated.toLocaleString()}.`,
        `\nUnallocated payments make it difficult to reconcile accounts, track customer balances, and generate accurate financial statements.`,
        `\nTop unallocated:\n${topPayments}`,
        paymentGaps.length > 5 ? `\n...and ${paymentGaps.length - 5} more.` : '',
      ].filter(Boolean).join('\n');

      const result = await findingManager.createFinding({
        findingType: 'gap',
        severity,
        title: `${paymentGaps.length} payments with unallocated amounts`,
        description,
        logicType: 'rule_based',
        dataSnapshot: { count: paymentGaps.length, totalUnallocated },
        relatedEntityType: 'payment',
        relatedEntityId: 'unallocated',
      });
      if (!result.isDuplicate) findingsCount++;
    }

    // ─── DAILY INSIGHT SUMMARY ───
    const totalBRC = Object.values(brcByAssignee).reduce((sum, arr) => sum + arr.length, 0);
    const totalInvTasks = Object.values(invoiceByAssignee).reduce((sum, arr) => sum + arr.length, 0);

    await insightManager.createInsight({
      findingIds: [],
      insightType: 'summary',
      title: `Finance Control Summary - ${new Date().toLocaleDateString()}`,
      content: [
        `=== FINANCE CONTROL SUMMARY ===`,
        `Date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
        ``,
        `--- BRC SUBMISSIONS ---`,
        `Overdue BRC tasks: ${totalBRC} across ${Object.keys(brcByAssignee).length} people`,
        ``,
        `--- INVOICE FOLLOW-UPS ---`,
        `Overdue invoice tasks: ${totalInvTasks} across ${Object.keys(invoiceByAssignee).length} people`,
        ``,
        `--- INVOICE STATUS ---`,
        ...financeKPIs.map(k =>
          `${k.companyName}: ${k.totalInvoices} total, ${k.pendingInvoices} pending, ${k.overdueInvoices} overdue`
        ),
        ``,
        `--- PAYMENT ALLOCATION ---`,
        `Unallocated payments: ${paymentGaps.length}`,
      ].join('\n'),
      logicType: 'rule_based',
      dataSources: ['tasks', 'vw_agent_finance_kpis', 'payments'],
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
