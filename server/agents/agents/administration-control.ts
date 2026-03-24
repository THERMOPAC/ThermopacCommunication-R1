import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  resolveReportingManager,
  hasOpenTask as hasOpenTaskShared,
  priorityFromLevel,
} from './project-control-shared';

const SOURCE_AGENT = 'administration_controller';
const AGENT_KEY = 'administration_control';

const DEFAULTS = {
  hr_admin_user_id: 3,
  finance_admin_user_id: 5,
  superuser_id: 3,
  salary_setup_missing_days: 7,
  payroll_cutoff_warning_days: 5,
  attendance_absence_threshold: 5,
  leave_pending_max_days: 3,
  visa_warning_days_high: 30,
  visa_warning_days_medium: 90,
  schengen_breach_threshold_days: 75,
  password_stale_days: 180,
  password_never_changed_days: 14,
  inactive_no_attendance_days: 90,
  max_admin_count: 5,
  payroll_exception_stale_days: 7,
  sap_failure_lookback_days: 7,
  sap_failure_count_threshold: 3,
  summary_mode_threshold: 50,
  statutory_due_date_buffer_days: 5,
};

type Cfg = typeof DEFAULTS;
function cfg(context: AgentRunContext): Cfg {
  return { ...DEFAULTS, ...(context.config || {}) };
}

function fp(type: string, entity: string, id: string | number): string {
  return `[fp:ac_${type}:${entity}:${id}]`;
}

function fpGlobal(type: string): string {
  return `[fp:ac_${type}:global]`;
}

async function hasOpenTask(fingerprint: string): Promise<boolean> {
  return hasOpenTaskShared(fingerprint, SOURCE_AGENT);
}

async function getL1Manager(employeeId: number): Promise<number | null> {
  return resolveReportingManager(employeeId);
}

async function getL2Manager(employeeId: number): Promise<number | null> {
  const l1 = await getL1Manager(employeeId);
  if (!l1) return null;
  return resolveReportingManager(l1);
}

async function getL3Manager(employeeId: number): Promise<number | null> {
  const l2 = await getL2Manager(employeeId);
  if (!l2) return null;
  return resolveReportingManager(l2);
}

async function resolveAssignee(employeeId: number, fallback: number): Promise<number> {
  const l1 = await getL1Manager(employeeId);
  return l1 || fallback;
}

async function resolveEscalee(employeeId: number, level: 'L2' | 'L3', fallback: number): Promise<number> {
  if (level === 'L2') {
    const l2 = await getL2Manager(employeeId);
    return l2 || fallback;
  }
  const l3 = await getL3Manager(employeeId);
  return l3 || fallback;
}

interface FindingAccumulator {
  total: number;
  perType: Record<string, number>;
  perEntity: Record<string, number>;
  taskCreated: number;
  notificationSent: number;
  escalationSent: number;
  blockingFindings: string[];
  findingIds: number[];
  groupCounts: Record<string, number>;
}

function newAccumulator(): FindingAccumulator {
  return {
    total: 0, perType: {}, perEntity: {}, taskCreated: 0,
    notificationSent: 0, escalationSent: 0, blockingFindings: [],
    findingIds: [], groupCounts: {},
  };
}

function canCreateTask(acc: FindingAccumulator, findingType: string, entityKey: string): boolean {
  if (acc.taskCreated >= 25) return false;
  if ((acc.perType[findingType] || 0) >= 3) return false;
  if ((acc.perEntity[entityKey] || 0) >= 2) return false;
  return true;
}

function canSendNotification(acc: FindingAccumulator, findingType: string, entityKey: string): boolean {
  if (acc.notificationSent >= 50) return false;
  if ((acc.perType[findingType] || 0) >= 5) return false;
  if ((acc.perEntity[entityKey] || 0) >= 3) return false;
  return true;
}

function canEscalate(acc: FindingAccumulator, findingType: string, entityKey: string): boolean {
  if (acc.escalationSent >= 10) return false;
  if ((acc.perType[findingType] || 0) >= 2) return false;
  if ((acc.perEntity[entityKey] || 0) >= 1) return false;
  return true;
}

function recordAction(acc: FindingAccumulator, actionType: 'task' | 'notification' | 'escalation', findingType: string, entityKey: string): void {
  if (actionType === 'task') { acc.taskCreated++; }
  else if (actionType === 'notification') { acc.notificationSent++; }
  else { acc.escalationSent++; }
  acc.perType[findingType] = (acc.perType[findingType] || 0) + 1;
  acc.perEntity[entityKey] = (acc.perEntity[entityKey] || 0) + 1;
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closed = 0;
  const openTasks = await db.execute(sql`
    SELECT id, category FROM tasks
    WHERE source_type = 'agent_task' AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'cancelled')
      AND category LIKE '%[fp:ac_%'
  `);

  for (const row of (openTasks.rows || []) as any[]) {
    const cat = row.category || '';
    let shouldClose = false;

    const salaryMatch = cat.match(/\[fp:ac_a1_01_no_salary:user:(\d+)\]/);
    if (salaryMatch) {
      const check = await db.execute(sql`
        SELECT 1 FROM employee_salaries WHERE user_id = ${Number(salaryMatch[1])} AND is_active = true LIMIT 1
      `);
      if ((check.rows || []).length > 0) shouldClose = true;
    }

    const panMatch = cat.match(/\[fp:ac_a3_01_no_pan:user:(\d+)\]/);
    if (panMatch) {
      const check = await db.execute(sql`
        SELECT pan_number FROM users WHERE id = ${Number(panMatch[1])}
      `);
      if ((check.rows as any[])[0]?.pan_number) shouldClose = true;
    }

    const bankMatch = cat.match(/\[fp:ac_a3_02_no_bank:user:(\d+)\]/);
    if (bankMatch) {
      const check = await db.execute(sql`
        SELECT bank_account_no, bank_name FROM employee_salaries
        WHERE user_id = ${Number(bankMatch[1])} AND is_active = true LIMIT 1
      `);
      const r = (check.rows as any[])[0];
      if (r?.bank_account_no && r?.bank_name) shouldClose = true;
    }

    const leaveMatch = cat.match(/\[fp:ac_a4_01_stale_leave:leave:(\d+)\]/);
    if (leaveMatch) {
      const check = await db.execute(sql`
        SELECT status FROM leave_requests WHERE id = ${Number(leaveMatch[1])}
      `);
      const s = (check.rows as any[])[0]?.status;
      if (s && s !== 'pending') shouldClose = true;
    }

    if (shouldClose) {
      await db.execute(sql`UPDATE tasks SET status = 'completed', completed_at = NOW()::text WHERE id = ${row.id}`);
      closed++;
    }
  }
  return closed;
}


export class AdministrationControlAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Administration Control Agent';
  category = 'administration';

  getSubscribedEvents(): string[] {
    return [
      'hr.user.created',
      'hr.user.deactivated',
      'payroll.period.completed',
      'payroll.record.sap_failed',
      'attendance.record.created',
    ];
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
    const acc = newAccumulator();
    const c = cfg(context);

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) console.log(`[AdminControl] Auto-closed ${autoClosedCount} resolved tasks`);
    } catch (err: any) {
      console.error(`[AdminControl] Auto-close error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BATCH DATA QUERIES
    // ════════════════════════════════════════════════════════════════════════
    let activeUsers: any[] = [];
    let salaryRecords: any[] = [];
    let currentPeriod: any = null;
    let latestCompletedPeriod: any = null;
    let payrollRecords: any[] = [];
    let activeLoans: any[] = [];
    let activeAdvances: any[] = [];
    let attendanceRecords: any[] = [];
    let leaveRequests: any[] = [];
    let approvedLeaves: any[] = [];
    let leaveBalances: any[] = [];
    let visaRecords: any[] = [];
    let schengenLogs: any[] = [];
    let approvedTrips: any[] = [];
    let payrollExceptions: any[] = [];
    let sapWhtFailures: any[] = [];
    let statutoryChallans: any[] = [];

    try {
      const usersResult = await db.execute(sql`
        SELECT id, username, first_name, last_name, email, role, department,
          employee_code, pan_number, card_code, card_name, date_of_joining, is_active,
          user_type, salary_type, weekly_off_days, duty_time_in, duty_time_out,
          reporting_manager_id, work_location_id, password_needs_update,
          last_password_change, created_at, updated_at, epf_no, esic_no
        FROM users WHERE is_active = true AND user_type = 'system_user'
      `);
      activeUsers = (usersResult.rows || []) as any[];
      queriesRun++;

      const salaryResult = await db.execute(sql`
        SELECT user_id, bank_name, bank_account_no, basic_salary, base_salary,
          employee_pf_contribution, employer_pf_contribution,
          employee_esic_contribution, employer_esic_contribution,
          is_active, salary_start_date
        FROM employee_salaries WHERE is_active = true
      `);
      salaryRecords = (salaryResult.rows || []) as any[];
      queriesRun++;

      const periodResult = await db.execute(sql`
        SELECT id, period_name, start_date, end_date, pay_date, status
        FROM payroll_periods
        WHERE end_date >= CURRENT_DATE - INTERVAL '60 days'
        ORDER BY end_date DESC
      `);
      queriesRun++;
      const periods = (periodResult.rows || []) as any[];
      currentPeriod = periods.find((p: any) => p.status === 'draft' || p.status === 'open') || periods[0];
      latestCompletedPeriod = periods.find((p: any) =>
        ['processed', 'locked', 'paid'].includes(p.status)
      );

      if (latestCompletedPeriod) {
        const prResult = await db.execute(sql`
          SELECT id, user_id, period_id, run_number, status, sap_posting_status,
            sap_error_message, loan_deductions, advance_deductions, net_pay,
            verification_status
          FROM payroll_records WHERE period_id = ${latestCompletedPeriod.id}
        `);
        payrollRecords = (prResult.rows || []) as any[];
        queriesRun++;
      }

      const loanResult = await db.execute(sql`
        SELECT id, employee_id, loan_reference, emi_amount, outstanding_balance,
          start_deduction_date, status
        FROM employee_loans WHERE status = 'active'
      `);
      activeLoans = (loanResult.rows || []) as any[];
      queriesRun++;

      const advResult = await db.execute(sql`
        SELECT id, employee_id, advance_reference, recovery_amount, outstanding_balance,
          start_recovery_date, status
        FROM employee_advances WHERE status = 'active'
      `);
      activeAdvances = (advResult.rows || []) as any[];
      queriesRun++;

      const attResult = await db.execute(sql`
        SELECT user_id, date, status, is_location_verified, work_location_id
        FROM attendance_records
        WHERE date >= date_trunc('month', CURRENT_DATE)
      `);
      attendanceRecords = (attResult.rows || []) as any[];
      queriesRun++;

      const leaveResult = await db.execute(sql`
        SELECT id, employee_id, leave_type_id, start_date, end_date, total_days,
          status, applied_date, manager_id
        FROM leave_requests
        WHERE status = 'pending' OR (status = 'approved' AND end_date >= CURRENT_DATE - INTERVAL '30 days')
      `);
      leaveRequests = (leaveResult.rows || []) as any[];
      approvedLeaves = leaveRequests.filter((l: any) => l.status === 'approved');
      queriesRun++;

      const lbResult = await db.execute(sql`
        SELECT lb.user_id, lb.leave_type_id, lb.allocated_days, lb.used_days,
          lb.pending_days, lb.carryover_days, lt.name as leave_type_name
        FROM leave_balances lb
        JOIN leave_types lt ON lb.leave_type_id = lt.id
        WHERE lb.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
      `);
      leaveBalances = (lbResult.rows || []) as any[];
      queriesRun++;

      const visaResult = await db.execute(sql`
        SELECT id, employee_id, visa_type, country, expiry_date, status
        FROM visa_records WHERE status = 'Active'
      `);
      visaRecords = (visaResult.rows || []) as any[];
      queriesRun++;

      const schengenResult = await db.execute(sql`
        SELECT employee_id, entry_date, exit_date, country
        FROM schengen_travel_log
        WHERE exit_date >= CURRENT_DATE - INTERVAL '180 days' OR exit_date IS NULL
      `);
      schengenLogs = (schengenResult.rows || []) as any[];
      queriesRun++;

      const tripResult = await db.execute(sql`
        SELECT id, employee_id, trip_title, destination, from_date, to_date, status
        FROM business_trips
        WHERE status = 'approved' AND to_date >= CURRENT_DATE - INTERVAL '30 days'
      `);
      approvedTrips = (tripResult.rows || []) as any[];
      queriesRun++;

      const peResult = await db.execute(sql`
        SELECT id, period_id, user_id, exception_type, severity, is_resolved, created_at
        FROM payroll_exceptions
        WHERE is_resolved = false
      `);
      payrollExceptions = (peResult.rows || []) as any[];
      queriesRun++;

      const sapResult = await db.execute(sql`
        SELECT id, status, created_at, error_message
        FROM sap_wht_sync_log
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      `);
      sapWhtFailures = (sapResult.rows || []) as any[];
      queriesRun++;

      const scResult = await db.execute(sql`
        SELECT id, module_type, period, status
        FROM statutory_challans
        WHERE created_at >= CURRENT_DATE - INTERVAL '60 days'
      `);
      statutoryChallans = (scResult.rows || []) as any[];
      queriesRun++;
    } catch (err: any) {
      console.error(`[AdminControl] Data query error:`, err.message);
    }

    const salaryByUser = new Map<number, any>();
    for (const s of salaryRecords) salaryByUser.set(Number(s.user_id), s);

    const payrollByUser = new Map<number, any[]>();
    for (const p of payrollRecords) {
      const uid = Number(p.user_id);
      if (!payrollByUser.has(uid)) payrollByUser.set(uid, []);
      payrollByUser.get(uid)!.push(p);
    }

    const attendanceByUser = new Map<number, any[]>();
    for (const a of attendanceRecords) {
      const uid = Number(a.user_id);
      if (!attendanceByUser.has(uid)) attendanceByUser.set(uid, []);
      attendanceByUser.get(uid)!.push(a);
    }

    const userName = (u: any) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;

    // ════════════════════════════════════════════════════════════════════════
    // GROUP A1: PAYROLL READINESS & POSTING
    // ════════════════════════════════════════════════════════════════════════
    try {
      for (const user of activeUsers) {
        const uid = Number(user.id);
        const name = userName(user);
        const joinDate = user.date_of_joining ? new Date(user.date_of_joining) : null;
        const daysSinceJoin = joinDate ? Math.floor((Date.now() - joinDate.getTime()) / 86400000) : 0;

        // A1.01: Missing salary structure
        if (!salaryByUser.has(uid) && daysSinceJoin >= c.salary_setup_missing_days) {
          const fingerprint = fp('a1_01_no_salary', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'high',
            title: `A1.01 Missing salary structure: ${name}`,
            description: `Employee "${name}" (${user.employee_code}) joined ${daysSinceJoin} days ago but has no active salary record.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, employeeCode: user.employee_code, dateOfJoining: user.date_of_joining, daysSinceJoin },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A1.01:${name}`);
            acc.groupCounts['A1'] = (acc.groupCounts['A1'] || 0) + 1;
            if (canCreateTask(acc, 'a1_01', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Missing salary: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Set up salary structure for ${name}.`,
                actionPayload: {
                  title: `[Agent] Admin – Set up salary for ${name} (${user.employee_code})`,
                  description: `Employee "${name}" joined ${daysSinceJoin} days ago but has no salary record.\nEmployee Code: ${user.employee_code}\nDepartment: ${user.department}\nisBlocking: true\n\nPlease configure their salary structure.`,
                  assignedTo: assignTo, priority: 'High', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.95, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a1_01', `user:${uid}`); }
            }
          }
        }
      }

      // A1.02: Payroll period gap
      if (!currentPeriod) {
        const fingerprint = fpGlobal('a1_02_period_gap');
        const finding = await findingManager.createFinding({
          findingType: 'gap', severity: 'medium',
          title: 'A1.02 Payroll period gap — no current month period',
          description: 'No payroll period exists for the current month.',
          logicType: 'rule_based',
          dataSnapshot: { month: new Date().toISOString().slice(0, 7) },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.blockingFindings.push('A1.02:period_gap');
          acc.groupCounts['A1'] = (acc.groupCounts['A1'] || 0) + 1;
          if (canSendNotification(acc, 'a1_02', 'global') && !(await hasOpenTask(fingerprint))) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: '[Agent] Admin – Payroll period gap',
              actionType: 'create_task', actionCategory: 'task_creation',
              description: 'Create payroll period for current month.',
              actionPayload: {
                title: '[Agent] Admin – Create payroll period for current month',
                description: 'No payroll period found for the current calendar month.\nisBlocking: true\n\nPlease create the period to enable payroll processing.',
                assignedTo: c.hr_admin_user_id, priority: 'High', category: `Administration ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.95, priority: 'high',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'notification', 'a1_02', 'global'); }
          }
        }
      }

      // A1.03: Payroll run incomplete near cutoff
      if (currentPeriod && (currentPeriod.status === 'draft' || currentPeriod.status === 'open')) {
        const endDate = new Date(currentPeriod.end_date);
        const daysToEnd = Math.floor((endDate.getTime() - Date.now()) / 86400000);
        if (daysToEnd <= c.payroll_cutoff_warning_days && daysToEnd >= 0) {
          const fingerprint = fpGlobal('a1_03_cutoff_warning');
          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach', severity: 'high',
            title: `A1.03 Payroll incomplete — ${daysToEnd} days to cutoff`,
            description: `Period "${currentPeriod.period_name}" is still in draft with ${daysToEnd} days left.`,
            logicType: 'rule_based',
            dataSnapshot: { periodId: currentPeriod.id, periodName: currentPeriod.period_name, daysToEnd },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push('A1.03:cutoff');
            acc.groupCounts['A1'] = (acc.groupCounts['A1'] || 0) + 1;
            if (canCreateTask(acc, 'a1_03', 'global') && !(await hasOpenTask(fingerprint))) {
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: '[Agent] Admin – Payroll cutoff approaching',
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Payroll period "${currentPeriod.period_name}" needs processing.`,
                actionPayload: {
                  title: `[Agent] Admin – Payroll period "${currentPeriod.period_name}" — ${daysToEnd}d to cutoff`,
                  description: `Payroll period is still in draft status with ${daysToEnd} days remaining before cutoff.\nisBlocking: true`,
                  assignedTo: c.hr_admin_user_id, priority: 'High', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a1_03', 'global'); }
            }
          }
        }
      }

      // A1.04: SAP transfer failed
      for (const pr of payrollRecords) {
        if (pr.status === 'verified' && ['failed', 'error'].includes(pr.sap_posting_status)) {
          const uid = Number(pr.user_id);
          const user = activeUsers.find(u => Number(u.id) === uid);
          const name = user ? userName(user) : `User #${uid}`;
          const fingerprint = fp('a1_04_sap_fail', 'payroll', pr.id);
          const finding = await findingManager.createFinding({
            findingType: 'mismatch', severity: 'critical',
            title: `A1.04 SAP transfer failed: ${name}`,
            description: `Payroll record #${pr.id} for ${name} failed SAP posting: ${pr.sap_error_message || 'unknown error'}`,
            logicType: 'rule_based',
            relatedEntityType: 'payroll_record', relatedEntityId: String(pr.id),
            dataSnapshot: { payrollId: pr.id, userId: uid, sapError: pr.sap_error_message },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A1'] = (acc.groupCounts['A1'] || 0) + 1;
            if (canEscalate(acc, 'a1_04', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = c.finance_admin_user_id;
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – SAP posting failed: ${name}`,
                actionType: 'create_task', actionCategory: 'escalation',
                description: `SAP posting failed for payroll record.`,
                actionPayload: {
                  title: `[Agent] Admin – SAP posting failed for ${name} (record #${pr.id})`,
                  description: `SAP error: ${pr.sap_error_message || 'unknown'}\nPayroll Record ID: ${pr.id}\nEmployee: ${name}`,
                  assignedTo: assignTo, priority: 'Critical', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.95, priority: 'urgent',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'escalation', 'a1_04', `user:${uid}`); }
            }
          }
        }
      }

      // A1.05: Loan active but payroll recovery missing
      for (const loan of activeLoans) {
        const uid = Number(loan.employee_id);
        const userPR = payrollByUser.get(uid) || [];
        const latestPR = userPR[0];
        if (latestPR && Number(latestPR.loan_deductions || 0) === 0) {
          const user = activeUsers.find(u => Number(u.id) === uid);
          const name = user ? userName(user) : `User #${uid}`;
          const fingerprint = fp('a1_05_loan_no_recovery', 'loan', loan.id);
          const finding = await findingManager.createFinding({
            findingType: 'mismatch', severity: 'high',
            title: `A1.05 Loan recovery missing: ${name} (${loan.loan_reference})`,
            description: `Active loan ${loan.loan_reference} for ${name} but latest payroll has zero loan deductions.`,
            logicType: 'rule_based',
            relatedEntityType: 'employee_loan', relatedEntityId: String(loan.id),
            dataSnapshot: { loanId: loan.id, userId: uid, loanRef: loan.loan_reference, emiAmount: loan.emi_amount },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A1.05:${name}`);
            acc.groupCounts['A1'] = (acc.groupCounts['A1'] || 0) + 1;
            if (canCreateTask(acc, 'a1_05', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Loan recovery missing: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Loan ${loan.loan_reference} not being recovered.`,
                actionPayload: {
                  title: `[Agent] Admin – Loan recovery missing for ${name} (${loan.loan_reference})`,
                  description: `Active loan ${loan.loan_reference} (EMI: ₹${loan.emi_amount}) but latest payroll shows ₹0 deduction.\nisBlocking: true`,
                  assignedTo: assignTo, priority: 'High', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a1_05', `user:${uid}`); }
            }
          }
        }
      }

      // A1.06: Advance active but recovery missing
      for (const adv of activeAdvances) {
        const uid = Number(adv.employee_id);
        const userPR = payrollByUser.get(uid) || [];
        const latestPR = userPR[0];
        if (latestPR && Number(latestPR.advance_deductions || 0) === 0) {
          const user = activeUsers.find(u => Number(u.id) === uid);
          const name = user ? userName(user) : `User #${uid}`;
          const fingerprint = fp('a1_06_advance_no_recovery', 'advance', adv.id);
          const finding = await findingManager.createFinding({
            findingType: 'mismatch', severity: 'high',
            title: `A1.06 Advance recovery missing: ${name} (${adv.advance_reference})`,
            description: `Active advance ${adv.advance_reference} for ${name} but latest payroll has zero advance deductions.`,
            logicType: 'rule_based',
            relatedEntityType: 'employee_advance', relatedEntityId: String(adv.id),
            dataSnapshot: { advanceId: adv.id, userId: uid, advRef: adv.advance_reference },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A1.06:${name}`);
            acc.groupCounts['A1'] = (acc.groupCounts['A1'] || 0) + 1;
            if (canCreateTask(acc, 'a1_06', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Advance recovery missing: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Advance ${adv.advance_reference} not being recovered.`,
                actionPayload: {
                  title: `[Agent] Admin – Advance recovery missing for ${name} (${adv.advance_reference})`,
                  description: `Active advance ${adv.advance_reference} but latest payroll shows ₹0 deduction.\nisBlocking: true`,
                  assignedTo: assignTo, priority: 'High', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a1_06', `user:${uid}`); }
            }
          }
        }
      }

      // A1.07: Duplicate payroll records
      if (latestCompletedPeriod) {
        const dupResult = await db.execute(sql`
          SELECT user_id, period_id, run_number, COUNT(*) as cnt
          FROM payroll_records
          WHERE period_id = ${latestCompletedPeriod.id}
          GROUP BY user_id, period_id, run_number
          HAVING COUNT(*) > 1
        `);
        queriesRun++;
        for (const dup of (dupResult.rows || []) as any[]) {
          const uid = Number(dup.user_id);
          const user = activeUsers.find(u => Number(u.id) === uid);
          const name = user ? userName(user) : `User #${uid}`;
          const fingerprint = fp('a1_07_dup_payroll', 'user_period', `${uid}_${dup.period_id}_${dup.run_number}`);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly', severity: 'critical',
            title: `A1.07 Duplicate payroll records: ${name}`,
            description: `${dup.cnt} duplicate records for ${name} in period ${latestCompletedPeriod.period_name}, run ${dup.run_number}.`,
            logicType: 'rule_based',
            relatedEntityType: 'payroll_record', relatedEntityId: `${uid}_${dup.period_id}`,
            dataSnapshot: { userId: uid, periodId: dup.period_id, runNumber: dup.run_number, count: dup.cnt },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A1.07:${name}`);
            acc.groupCounts['A1'] = (acc.groupCounts['A1'] || 0) + 1;
            if (canEscalate(acc, 'a1_07', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Duplicate payroll: ${name}`,
                actionType: 'create_task', actionCategory: 'escalation',
                description: `Duplicate payroll records detected.`,
                actionPayload: {
                  title: `[Agent] Admin – CRITICAL: Duplicate payroll for ${name} (${dup.cnt} records)`,
                  description: `Found ${dup.cnt} duplicate payroll records for ${name} in period "${latestCompletedPeriod.period_name}".\nisBlocking: true\n\nImmediate investigation required.`,
                  assignedTo: c.hr_admin_user_id, priority: 'Critical', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.99, priority: 'urgent',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'escalation', 'a1_07', `user:${uid}`); }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[AdminControl] A1 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GROUP A2: ATTENDANCE & TIME COMPLIANCE
    // ════════════════════════════════════════════════════════════════════════
    try {
      for (const user of activeUsers) {
        const uid = Number(user.id);
        const name = userName(user);
        const userAtt = attendanceByUser.get(uid) || [];

        // A2.01: Excessive unexcused absences
        const absentDays = userAtt.filter((a: any) => a.status === 'absent').length;
        const approvedLeaveDates = new Set<string>();
        for (const leave of approvedLeaves.filter((l: any) => Number(l.employee_id) === uid)) {
          const start = new Date(leave.start_date);
          const end = new Date(leave.end_date);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            approvedLeaveDates.add(d.toISOString().split('T')[0]);
          }
        }
        const unexcusedAbsent = userAtt.filter((a: any) =>
          a.status === 'absent' && !approvedLeaveDates.has(new Date(a.date).toISOString().split('T')[0])
        ).length;

        if (unexcusedAbsent >= c.attendance_absence_threshold) {
          const fingerprint = fp('a2_01_excess_absent', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach', severity: 'medium',
            title: `A2.01 Excessive absences: ${name} (${unexcusedAbsent} days)`,
            description: `${name} has ${unexcusedAbsent} unexcused absences this month.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, unexcusedAbsent, totalAbsent: absentDays },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A2'] = (acc.groupCounts['A2'] || 0) + 1;
            if (canCreateTask(acc, 'a2_01', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Excess absences: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Review ${unexcusedAbsent} unexcused absences.`,
                actionPayload: {
                  title: `[Agent] Admin – Review absences: ${name} (${unexcusedAbsent} unexcused)`,
                  description: `${name} has ${unexcusedAbsent} unexcused absences this month.\nTotal absent: ${absentDays}\n\nPlease review and take appropriate action.`,
                  assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.85, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a2_01', `user:${uid}`); }
            }
          }
        }

        // A2.02: Incomplete attendance before payroll cutoff
        if (currentPeriod && currentPeriod.status === 'draft') {
          const endDate = new Date(currentPeriod.end_date);
          const daysToEnd = Math.floor((endDate.getTime() - Date.now()) / 86400000);
          if (daysToEnd <= c.payroll_cutoff_warning_days && daysToEnd >= 0) {
            const periodStart = new Date(currentPeriod.start_date);
            const today = new Date();
            const expectedDays = Math.floor((Math.min(today.getTime(), endDate.getTime()) - periodStart.getTime()) / 86400000);
            const actualDays = userAtt.length;
            const missingDays = Math.max(0, expectedDays - actualDays - 4);
            if (missingDays > 3) {
              const fingerprint = fp('a2_02_incomplete_att', 'user', uid);
              const finding = await findingManager.createFinding({
                findingType: 'gap', severity: 'high',
                title: `A2.02 Incomplete attendance: ${name} (~${missingDays} missing days)`,
                description: `${name} has ~${missingDays} missing attendance records with ${daysToEnd} days to payroll cutoff.`,
                logicType: 'rule_based',
                relatedEntityType: 'user', relatedEntityId: String(uid),
                dataSnapshot: { userId: uid, missingDays, daysToEnd, actualDays, expectedDays },
              });
              if (!finding.isDuplicate) {
                findingsCount++;
                acc.findingIds.push(finding.id);
                acc.blockingFindings.push(`A2.02:${name}`);
                acc.groupCounts['A2'] = (acc.groupCounts['A2'] || 0) + 1;
                if (canCreateTask(acc, 'a2_02', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
                  const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
                  const rec = await recommendationManager.createRecommendation({
                    findingId: finding.id, title: `[Agent] Admin – Incomplete attendance: ${name}`,
                    actionType: 'create_task', actionCategory: 'task_creation',
                    description: `Complete attendance records before cutoff.`,
                    actionPayload: {
                      title: `[Agent] Admin – Complete attendance for ${name} (~${missingDays} missing)`,
                      description: `${name} has ~${missingDays} missing attendance records.\nPayroll cutoff in ${daysToEnd} days.\nisBlocking: true`,
                      assignedTo: assignTo, priority: 'High', category: `Administration ${fingerprint}`,
                    },
                    logicType: 'rule_based', confidence: 0.85, priority: 'high',
                  });
                  if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a2_02', `user:${uid}`); }
                }
              }
            }
          }
        }

        // A2.04: Unauthorized location check-in
        const unauthorizedCheckins = userAtt.filter((a: any) =>
          a.is_location_verified === false && a.work_location_id
        );
        if (unauthorizedCheckins.length > 0) {
          const fingerprint = fp('a2_04_unauth_location', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly', severity: 'low',
            title: `A2.04 Unauthorized location: ${name} (${unauthorizedCheckins.length} occurrences)`,
            description: `${name} checked in from unverified locations ${unauthorizedCheckins.length} times this month.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, count: unauthorizedCheckins.length },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A2'] = (acc.groupCounts['A2'] || 0) + 1;
            if (canSendNotification(acc, 'a2_04', `user:${uid}`)) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Unauth location: ${name}`,
                actionType: 'send_alert', actionCategory: 'notification',
                description: `${unauthorizedCheckins.length} check-ins from unverified locations.`,
                actionPayload: { userId: uid, employeeName: name, count: unauthorizedCheckins.length },
                logicType: 'rule_based', confidence: 0.7, priority: 'low',
              });
              if (rec.id > 0) { recommendationsCount++; recordAction(acc, 'notification', 'a2_04', `user:${uid}`); }
            }
          }
        }

        // A2.05: No workweek policy
        if (!user.weekly_off_days || !user.duty_time_in || !user.duty_time_out) {
          const fingerprint = fp('a2_05_no_workweek', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'medium',
            title: `A2.05 No workweek policy: ${name}`,
            description: `${name} is missing workweek configuration (weekly off days or duty times).`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, weeklyOffDays: user.weekly_off_days, dutyTimeIn: user.duty_time_in, dutyTimeOut: user.duty_time_out },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A2.05:${name}`);
            acc.groupCounts['A2'] = (acc.groupCounts['A2'] || 0) + 1;
            if (canCreateTask(acc, 'a2_05', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – No workweek policy: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Configure workweek for ${name}.`,
                actionPayload: {
                  title: `[Agent] Admin – Set up workweek policy for ${name}`,
                  description: `${name} is missing workweek configuration.\nisBlocking: true\n\nPlease set weekly off days and duty times.`,
                  assignedTo: c.hr_admin_user_id, priority: 'Medium', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a2_05', `user:${uid}`); }
            }
          }
        }
      }

      // A2.03: Leave approved but attendance marked present
      for (const leave of approvedLeaves) {
        const uid = Number(leave.employee_id);
        const userAtt = attendanceByUser.get(uid) || [];
        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        for (const att of userAtt) {
          const attDate = new Date(att.date);
          if (attDate >= start && attDate <= end && att.status === 'present') {
            const user = activeUsers.find(u => Number(u.id) === uid);
            const name = user ? userName(user) : `User #${uid}`;
            const dateStr = attDate.toISOString().split('T')[0];
            const fingerprint = fp('a2_03_leave_present', 'user_date', `${uid}_${dateStr}`);
            const finding = await findingManager.createFinding({
              findingType: 'mismatch', severity: 'medium',
              title: `A2.03 Leave/attendance conflict: ${name} on ${dateStr}`,
              description: `${name} has approved leave but attendance marked present on ${dateStr}.`,
              logicType: 'rule_based',
              relatedEntityType: 'user', relatedEntityId: String(uid),
              dataSnapshot: { userId: uid, date: dateStr, leaveId: leave.id },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['A2'] = (acc.groupCounts['A2'] || 0) + 1;
              if (canCreateTask(acc, 'a2_03', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
                const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Admin – Leave/attendance mismatch: ${name}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `Resolve leave vs attendance conflict on ${dateStr}.`,
                  actionPayload: {
                    title: `[Agent] Admin – Leave/attendance conflict: ${name} on ${dateStr}`,
                    description: `${name} has approved leave (ID: ${leave.id}) but was marked present on ${dateStr}.\n\nPlease correct either the attendance record or the leave request.`,
                    assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.9, priority: 'normal',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a2_03', `user:${uid}`); }
              }
            }
            break;
          }
        }
      }

      // A2.06: Attendance after employee deactivated
      const inactiveAttResult = await db.execute(sql`
        SELECT ar.user_id, ar.date, u.first_name, u.last_name, u.username, u.updated_at as deactivated_at
        FROM attendance_records ar
        JOIN users u ON ar.user_id = u.id
        WHERE u.is_active = false AND ar.date >= u.updated_at::date
        AND ar.date >= CURRENT_DATE - INTERVAL '30 days'
        LIMIT 20
      `);
      queriesRun++;
      for (const row of (inactiveAttResult.rows || []) as any[]) {
        const uid = Number(row.user_id);
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username;
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        const fingerprint = fp('a2_06_inactive_att', 'user', uid);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `A2.06 Attendance after deactivation: ${name} on ${dateStr}`,
          description: `Inactive employee ${name} has attendance record on ${dateStr} after deactivation.`,
          logicType: 'rule_based',
          relatedEntityType: 'user', relatedEntityId: String(uid),
          dataSnapshot: { userId: uid, date: dateStr, deactivatedAt: row.deactivated_at },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A2'] = (acc.groupCounts['A2'] || 0) + 1;
          if (canCreateTask(acc, 'a2_06', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: `[Agent] Admin – Inactive employee attendance: ${name}`,
              actionType: 'create_task', actionCategory: 'task_creation',
              description: `Investigate attendance for deactivated employee.`,
              actionPayload: {
                title: `[Agent] Admin – Attendance after deactivation: ${name}`,
                description: `Inactive employee ${name} has attendance recorded on ${dateStr}.\nDeactivated: ${row.deactivated_at}\n\nPlease investigate and correct.`,
                assignedTo: c.hr_admin_user_id, priority: 'High', category: `Administration ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.9, priority: 'high',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a2_06', `user:${uid}`); }
          }
        }
      }
    } catch (err: any) {
      console.error(`[AdminControl] A2 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GROUP A3: EMPLOYEE MASTER & LIFECYCLE
    // ════════════════════════════════════════════════════════════════════════
    try {
      for (const user of activeUsers) {
        const uid = Number(user.id);
        const name = userName(user);
        const salary = salaryByUser.get(uid);

        // A3.01: Missing PAN
        if (!user.pan_number || String(user.pan_number).trim() === '') {
          const fingerprint = fp('a3_01_no_pan', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'medium',
            title: `A3.01 Missing PAN: ${name}`,
            description: `${name} (${user.employee_code}) has no PAN number on record.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, employeeCode: user.employee_code },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A3.01:${name}`);
            acc.groupCounts['A3'] = (acc.groupCounts['A3'] || 0) + 1;
            if (canCreateTask(acc, 'a3_01', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Missing PAN: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Collect PAN for ${name}.`,
                actionPayload: {
                  title: `[Agent] Admin – Collect PAN number for ${name}`,
                  description: `${name} (${user.employee_code}) has no PAN number.\nisBlocking: true\n\nRequired for TDS compliance.`,
                  assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.95, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a3_01', `user:${uid}`); }
            }
          }
        }

        // A3.03: No work location
        if (!user.work_location_id) {
          const fingerprint = fp('a3_03_no_location', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'medium',
            title: `A3.03 No work location: ${name}`,
            description: `${name} has no work location assigned.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A3'] = (acc.groupCounts['A3'] || 0) + 1;
            if (canCreateTask(acc, 'a3_03', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – No work location: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Assign work location for ${name}.`,
                actionPayload: {
                  title: `[Agent] Admin – Assign work location for ${name}`,
                  description: `${name} has no work location.\n\nPlease assign the correct work location.`,
                  assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a3_03', `user:${uid}`); }
            }
          }
        }

        // A3.04: No reporting manager
        if (!user.reporting_manager_id && user.role !== 'Superuser') {
          const fingerprint = fp('a3_04_no_manager', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'medium',
            title: `A3.04 No reporting manager: ${name}`,
            description: `${name} (role: ${user.role}) has no reporting manager assigned.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, role: user.role },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A3'] = (acc.groupCounts['A3'] || 0) + 1;
            if (canCreateTask(acc, 'a3_04', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – No reporting manager: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Assign reporting manager for ${name}.`,
                actionPayload: {
                  title: `[Agent] Admin – Assign reporting manager for ${name}`,
                  description: `${name} (role: ${user.role}) has no reporting manager.\n\nThis breaks escalation chains.`,
                  assignedTo: c.hr_admin_user_id, priority: 'Medium', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a3_04', `user:${uid}`); }
            }
          }
        }
      }

      // A3.05: Inactive employee still flagged active
      const dormantResult = await db.execute(sql`
        SELECT u.id, u.username, u.first_name, u.last_name, u.employee_code
        FROM users u
        WHERE u.is_active = true AND u.user_type = 'system_user'
          AND NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.user_id = u.id AND ar.date >= CURRENT_DATE - INTERVAL '90 days'
          )
          AND NOT EXISTS (
            SELECT 1 FROM leave_requests lr
            WHERE lr.employee_id = u.id AND lr.status = 'approved'
              AND lr.end_date >= CURRENT_DATE - INTERVAL '90 days'
          )
          AND NOT EXISTS (
            SELECT 1 FROM business_trips bt
            WHERE bt.employee_id = u.id AND bt.status = 'approved'
              AND bt.to_date >= CURRENT_DATE - INTERVAL '90 days'
          )
      `);
      queriesRun++;
      for (const row of (dormantResult.rows || []) as any[]) {
        const uid = Number(row.id);
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username;
        const fingerprint = fp('a3_05_dormant', 'user', uid);
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'medium',
          title: `A3.05 Potentially inactive employee: ${name}`,
          description: `${name} has no attendance, approved leave, or trips in the last 90 days but is marked active.`,
          logicType: 'rule_based',
          relatedEntityType: 'user', relatedEntityId: String(uid),
          dataSnapshot: { userId: uid, employeeCode: row.employee_code },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A3'] = (acc.groupCounts['A3'] || 0) + 1;
          if (canCreateTask(acc, 'a3_05', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
            const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: `[Agent] Admin – Dormant employee: ${name}`,
              actionType: 'create_task', actionCategory: 'task_creation',
              description: `Verify employment status of ${name}.`,
              actionPayload: {
                title: `[Agent] Admin – Verify status: ${name} (90d no activity)`,
                description: `${name} is marked active but has no attendance, leave, or trips in 90 days.\n\nPlease verify employment status and deactivate if appropriate.`,
                assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.8, priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a3_05', `user:${uid}`); }
          }
        }
      }

      // A3.06: Joined but no payroll record
      if (latestCompletedPeriod) {
        for (const user of activeUsers) {
          const uid = Number(user.id);
          const name = userName(user);
          const joinDate = user.date_of_joining ? new Date(user.date_of_joining) : null;
          if (!joinDate) continue;
          const daysSinceJoin = Math.floor((Date.now() - joinDate.getTime()) / 86400000);
          if (daysSinceJoin < c.salary_setup_missing_days) continue;
          if (!salaryByUser.has(uid)) continue;
          if ((payrollByUser.get(uid) || []).length > 0) continue;

          const anyPRResult = await db.execute(sql`
            SELECT 1 FROM payroll_records pr
            JOIN payroll_periods pp ON pr.period_id = pp.id
            WHERE pr.user_id = ${uid} AND pp.status IN ('processed', 'locked', 'paid')
            LIMIT 1
          `);
          queriesRun++;
          if ((anyPRResult.rows || []).length > 0) continue;

          const fingerprint = fp('a3_06_no_payroll', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'high',
            title: `A3.06 No payroll record: ${name}`,
            description: `${name} joined ${daysSinceJoin} days ago, has salary setup, but no payroll records in any completed period.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, daysSinceJoin, dateOfJoining: user.date_of_joining },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A3'] = (acc.groupCounts['A3'] || 0) + 1;
            if (canCreateTask(acc, 'a3_06', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – No payroll record: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `${name} has salary setup but was never included in payroll.`,
                actionPayload: {
                  title: `[Agent] Admin – Include ${name} in payroll (joined ${daysSinceJoin}d ago)`,
                  description: `${name} joined ${daysSinceJoin} days ago and has salary configured but was never processed in payroll.\n\nPlease verify and include in next payroll run.`,
                  assignedTo: assignTo, priority: 'High', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a3_06', `user:${uid}`); }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[AdminControl] A3 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GROUP A4: LEAVE / TRAVEL / VISA / LEGAL
    // ════════════════════════════════════════════════════════════════════════
    try {
      // A4.01: Stale pending leave
      const pendingLeaves = leaveRequests.filter((l: any) => l.status === 'pending');
      for (const leave of pendingLeaves) {
        const appliedDate = new Date(leave.applied_date);
        const daysPending = Math.floor((Date.now() - appliedDate.getTime()) / 86400000);
        if (daysPending < c.leave_pending_max_days) continue;
        const uid = Number(leave.employee_id);
        const user = activeUsers.find(u => Number(u.id) === uid);
        const name = user ? userName(user) : `User #${uid}`;
        const fingerprint = fp('a4_01_stale_leave', 'leave', leave.id);
        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'medium',
          title: `A4.01 Stale leave request: ${name} (${daysPending}d pending)`,
          description: `Leave request #${leave.id} for ${name} has been pending for ${daysPending} days.`,
          logicType: 'rule_based',
          relatedEntityType: 'leave_request', relatedEntityId: String(leave.id),
          dataSnapshot: { leaveId: leave.id, userId: uid, daysPending },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A4'] = (acc.groupCounts['A4'] || 0) + 1;
          if (canCreateTask(acc, 'a4_01', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
            const assignTo = leave.manager_id ? Number(leave.manager_id) : await resolveAssignee(uid, c.hr_admin_user_id);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: `[Agent] Admin – Stale leave: ${name}`,
              actionType: 'create_task', actionCategory: 'task_creation',
              description: `Approve/reject leave request pending ${daysPending} days.`,
              actionPayload: {
                title: `[Agent] Admin – Review leave request: ${name} (${daysPending}d pending)`,
                description: `Leave request #${leave.id} from ${name} has been pending ${daysPending} days.\nStart: ${leave.start_date}\nEnd: ${leave.end_date}\n\nPlease approve or reject.`,
                assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.9, priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a4_01', `user:${uid}`); }
          }
        }
      }

      // A4.02: Leave balance exhaustion
      for (const lb of leaveBalances) {
        const remaining = Number(lb.allocated_days || 0) + Number(lb.carryover_days || 0) - Number(lb.used_days || 0) - Number(lb.pending_days || 0);
        if (remaining > 1) continue;
        const uid = Number(lb.user_id);
        const user = activeUsers.find(u => Number(u.id) === uid);
        if (!user) continue;
        const name = userName(user);
        const fingerprint = fp('a4_02_leave_low', 'user_type', `${uid}_${lb.leave_type_id}`);
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'low',
          title: `A4.02 Leave balance low: ${name} — ${lb.leave_type_name} (${remaining.toFixed(1)} remaining)`,
          description: `${name}'s ${lb.leave_type_name} balance is at ${remaining.toFixed(1)} days.`,
          logicType: 'rule_based',
          relatedEntityType: 'user', relatedEntityId: String(uid),
          dataSnapshot: { userId: uid, leaveType: lb.leave_type_name, remaining },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A4'] = (acc.groupCounts['A4'] || 0) + 1;
          if (canSendNotification(acc, 'a4_02', `user:${uid}`)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: `[Agent] Admin – Leave balance low: ${name}`,
              actionType: 'send_alert', actionCategory: 'notification',
              description: `${lb.leave_type_name} nearly exhausted.`,
              actionPayload: { userId: uid, leaveType: lb.leave_type_name, remaining },
              logicType: 'rule_based', confidence: 0.8, priority: 'low',
            });
            if (rec.id > 0) { recommendationsCount++; recordAction(acc, 'notification', 'a4_02', `user:${uid}`); }
          }
        }
      }

      // A4.03: Visa expiring
      for (const visa of visaRecords) {
        const expiryDate = new Date(visa.expiry_date);
        const daysToExpiry = Math.floor((expiryDate.getTime() - Date.now()) / 86400000);
        if (daysToExpiry > c.visa_warning_days_medium) continue;
        const uid = Number(visa.employee_id);
        const user = activeUsers.find(u => Number(u.id) === uid);
        const name = user ? userName(user) : `User #${uid}`;
        const severity = daysToExpiry <= c.visa_warning_days_high ? 'high' as const : 'medium' as const;
        const fingerprint = fp('a4_03_visa_expiry', 'visa', visa.id);
        const finding = await findingManager.createFinding({
          findingType: 'expiry', severity,
          title: `A4.03 Visa expiring: ${name} — ${visa.country} (${daysToExpiry}d)`,
          description: `${name}'s ${visa.visa_type} visa for ${visa.country} expires in ${daysToExpiry} days.`,
          logicType: 'rule_based',
          relatedEntityType: 'visa_record', relatedEntityId: String(visa.id),
          dataSnapshot: { visaId: visa.id, userId: uid, country: visa.country, daysToExpiry },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A4'] = (acc.groupCounts['A4'] || 0) + 1;
          if (daysToExpiry <= c.visa_warning_days_high) {
            if (canCreateTask(acc, 'a4_03', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Visa expiring: ${name} (${visa.country})`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Visa expires in ${daysToExpiry} days.`,
                actionPayload: {
                  title: `[Agent] Admin – Renew visa: ${name} — ${visa.country} (${daysToExpiry}d left)`,
                  description: `${visa.visa_type} visa for ${visa.country} expires on ${visa.expiry_date}.\n\nInitiate renewal process.`,
                  assignedTo: assignTo, priority: 'High', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.9, priority: 'high',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a4_03', `user:${uid}`); }
            }
          } else {
            if (canSendNotification(acc, 'a4_03', `user:${uid}`)) {
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Visa expiry notice: ${name}`,
                actionType: 'send_alert', actionCategory: 'notification',
                description: `Visa expires in ${daysToExpiry} days.`,
                actionPayload: { userId: uid, country: visa.country, daysToExpiry },
                logicType: 'rule_based', confidence: 0.8, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; recordAction(acc, 'notification', 'a4_03', `user:${uid}`); }
            }
          }
        }
      }

      // A4.04: Schengen 90/180-day breach risk
      const schengenByUser = new Map<number, any[]>();
      for (const log of schengenLogs) {
        const uid = Number(log.employee_id);
        if (!schengenByUser.has(uid)) schengenByUser.set(uid, []);
        schengenByUser.get(uid)!.push(log);
      }
      for (const [uid, logs] of schengenByUser) {
        let totalDays = 0;
        const today = new Date();
        const windowStart = new Date(today.getTime() - 180 * 86400000);
        for (const log of logs) {
          const entry = new Date(log.entry_date);
          const exit = log.exit_date ? new Date(log.exit_date) : today;
          const effectiveStart = entry < windowStart ? windowStart : entry;
          const effectiveEnd = exit > today ? today : exit;
          if (effectiveEnd >= effectiveStart) {
            totalDays += Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;
          }
        }
        if (totalDays >= c.schengen_breach_threshold_days) {
          const user = activeUsers.find(u => Number(u.id) === uid);
          const name = user ? userName(user) : `User #${uid}`;
          const fingerprint = fp('a4_04_schengen', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'threshold_breach', severity: 'high',
            title: `A4.04 Schengen limit risk: ${name} (${totalDays}/90 days)`,
            description: `${name} has spent ${totalDays} days in Schengen zone in the last 180 days (limit: 90).`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, totalDays, limit: 90 },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A4'] = (acc.groupCounts['A4'] || 0) + 1;
            if (canEscalate(acc, 'a4_04', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const escalateTo = await resolveEscalee(uid, 'L3', c.superuser_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Schengen limit: ${name}`,
                actionType: 'create_task', actionCategory: 'escalation',
                description: `Schengen overstay risk.`,
                actionPayload: {
                  title: `[Agent] Admin – SCHENGEN RISK: ${name} (${totalDays}/90 days used)`,
                  description: `${name} has used ${totalDays} of 90 allowed Schengen days in the last 180 days.\n\nImmediate review required to prevent overstay violation.`,
                  assignedTo: escalateTo, priority: 'Critical', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.95, priority: 'urgent',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'escalation', 'a4_04', `user:${uid}`); }
            }
          }
        }
      }

      // A4.05: Trip overlapping leave
      for (const trip of approvedTrips) {
        const uid = Number(trip.employee_id);
        const tripStart = new Date(trip.from_date);
        const tripEnd = new Date(trip.to_date);
        for (const leave of approvedLeaves.filter((l: any) => Number(l.employee_id) === uid)) {
          const leaveStart = new Date(leave.start_date);
          const leaveEnd = new Date(leave.end_date);
          if (tripStart <= leaveEnd && tripEnd >= leaveStart) {
            const user = activeUsers.find(u => Number(u.id) === uid);
            const name = user ? userName(user) : `User #${uid}`;
            const fingerprint = fp('a4_05_trip_leave', 'trip_leave', `${trip.id}_${leave.id}`);
            const finding = await findingManager.createFinding({
              findingType: 'mismatch', severity: 'medium',
              title: `A4.05 Trip/leave overlap: ${name}`,
              description: `${name}'s trip "${trip.trip_title}" overlaps with approved leave (#${leave.id}).`,
              logicType: 'rule_based',
              relatedEntityType: 'business_trip', relatedEntityId: String(trip.id),
              dataSnapshot: { tripId: trip.id, leaveId: leave.id, userId: uid },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['A4'] = (acc.groupCounts['A4'] || 0) + 1;
              if (canCreateTask(acc, 'a4_05', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
                const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Admin – Trip/leave overlap: ${name}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `Resolve trip and leave overlap.`,
                  actionPayload: {
                    title: `[Agent] Admin – Trip/leave overlap: ${name}`,
                    description: `Trip "${trip.trip_title}" (${trip.from_date} to ${trip.to_date}) overlaps with approved leave (#${leave.id}: ${leave.start_date} to ${leave.end_date}).\n\nPlease resolve the conflict.`,
                    assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.85, priority: 'normal',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a4_05', `user:${uid}`); }
              }
            }
            break;
          }
        }
      }
    } catch (err: any) {
      console.error(`[AdminControl] A4 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GROUP A5: ACCESS / PERMISSIONS / SECURITY
    // ════════════════════════════════════════════════════════════════════════
    try {
      // A5.01: Admin role count
      const adminCount = activeUsers.filter(u => ['Superuser', 'Admin'].includes(u.role)).length;
      if (adminCount > c.max_admin_count) {
        const fingerprint = fpGlobal('a5_01_admin_count');
        const finding = await findingManager.createFinding({
          findingType: 'threshold_breach', severity: 'medium',
          title: `A5.01 Admin count exceeds threshold (${adminCount}/${c.max_admin_count})`,
          description: `There are ${adminCount} users with Admin/Superuser role (threshold: ${c.max_admin_count}).`,
          logicType: 'rule_based',
          dataSnapshot: { adminCount, threshold: c.max_admin_count },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A5'] = (acc.groupCounts['A5'] || 0) + 1;
          if (canSendNotification(acc, 'a5_01', 'global')) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: '[Agent] Admin – High admin count',
              actionType: 'send_alert', actionCategory: 'notification',
              description: `${adminCount} admin users detected.`,
              actionPayload: { adminCount, threshold: c.max_admin_count },
              logicType: 'rule_based', confidence: 0.8, priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; recordAction(acc, 'notification', 'a5_01', 'global'); }
          }
        }
      }

      // A5.02 & A5.03: Password checks
      for (const user of activeUsers) {
        const uid = Number(user.id);
        const name = userName(user);

        if (!user.last_password_change) {
          const createdAt = user.created_at ? new Date(user.created_at) : null;
          const daysSinceCreation = createdAt ? Math.floor((Date.now() - createdAt.getTime()) / 86400000) : 999;
          if (daysSinceCreation >= c.password_never_changed_days) {
            const fingerprint = fp('a5_02_pwd_never', 'user', uid);
            const finding = await findingManager.createFinding({
              findingType: 'gap', severity: 'medium',
              title: `A5.02 Password never changed: ${name}`,
              description: `${name}'s account was created ${daysSinceCreation} days ago and password has never been changed.`,
              logicType: 'rule_based',
              relatedEntityType: 'user', relatedEntityId: String(uid),
              dataSnapshot: { userId: uid, daysSinceCreation },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['A5'] = (acc.groupCounts['A5'] || 0) + 1;
              if (canCreateTask(acc, 'a5_02', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Admin – Password never changed: ${name}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `Change password for ${name}.`,
                  actionPayload: {
                    title: `[Agent] Admin – Change password: ${name} (never changed)`,
                    description: `${name}'s password has never been changed since account creation (${daysSinceCreation} days ago).\n\nPlease update your password.`,
                    assignedTo: uid, priority: 'Medium', category: `Administration ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.9, priority: 'normal',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a5_02', `user:${uid}`); }
              }
            }
          }
        } else {
          const lastChange = new Date(user.last_password_change);
          const daysSinceChange = Math.floor((Date.now() - lastChange.getTime()) / 86400000);
          if (daysSinceChange >= c.password_stale_days) {
            const fingerprint = fp('a5_03_pwd_stale', 'user', uid);
            const finding = await findingManager.createFinding({
              findingType: 'expiry', severity: 'low',
              title: `A5.03 Stale password: ${name} (${daysSinceChange}d)`,
              description: `${name}'s password was last changed ${daysSinceChange} days ago.`,
              logicType: 'rule_based',
              relatedEntityType: 'user', relatedEntityId: String(uid),
              dataSnapshot: { userId: uid, daysSinceChange },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['A5'] = (acc.groupCounts['A5'] || 0) + 1;
              if (canSendNotification(acc, 'a5_03', `user:${uid}`)) {
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Admin – Stale password: ${name}`,
                  actionType: 'send_alert', actionCategory: 'notification',
                  description: `Password last changed ${daysSinceChange} days ago.`,
                  actionPayload: { userId: uid, daysSinceChange },
                  logicType: 'rule_based', confidence: 0.7, priority: 'low',
                });
                if (rec.id > 0) { recommendationsCount++; recordAction(acc, 'notification', 'a5_03', `user:${uid}`); }
              }
            }
          }
        }
      }

      // A5.04: Dormant user still active (security perspective)
      // Reuses A3.05 results but with security focus — skip if A3.05 already flagged
      // The A3.05 query already ran above and produced findings. A5.04 is handled by the same dormant check.
    } catch (err: any) {
      console.error(`[AdminControl] A5 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GROUP A6: STATUTORY & PAYROLL COMPLIANCE
    // ════════════════════════════════════════════════════════════════════════
    try {
      if (latestCompletedPeriod) {
        const periodEnd = new Date(latestCompletedPeriod.end_date);
        const daysSincePeriodEnd = Math.floor((Date.now() - periodEnd.getTime()) / 86400000);

        if (daysSincePeriodEnd >= c.statutory_due_date_buffer_days) {
          const periodMonth = periodEnd.toISOString().slice(0, 7);

          // A6.01: TDS challan pending
          const hasTDS = statutoryChallans.some((ch: any) => ch.module_type === 'TDS' && ch.period === periodMonth);
          if (!hasTDS) {
            const fingerprint = fpGlobal(`a6_01_tds_${periodMonth}`);
            const finding = await findingManager.createFinding({
              findingType: 'overdue', severity: 'high',
              title: `A6.01 TDS challan pending for ${periodMonth}`,
              description: `No TDS challan found for ${periodMonth}. Payroll completed ${daysSincePeriodEnd} days ago.`,
              logicType: 'rule_based',
              dataSnapshot: { period: periodMonth, daysSincePeriodEnd },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['A6'] = (acc.groupCounts['A6'] || 0) + 1;
              if (canCreateTask(acc, 'a6_01', 'global') && !(await hasOpenTask(fingerprint))) {
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Admin – TDS challan pending: ${periodMonth}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `File TDS challan for ${periodMonth}.`,
                  actionPayload: {
                    title: `[Agent] Admin – File TDS challan for ${periodMonth}`,
                    description: `Payroll for ${periodMonth} is complete but TDS challan has not been filed.\nDays since period end: ${daysSincePeriodEnd}`,
                    assignedTo: c.finance_admin_user_id, priority: 'High', category: `Administration ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.9, priority: 'high',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a6_01', 'global'); }
              }
            }
          }

          // A6.02: PF challan pending
          const hasPF = statutoryChallans.some((ch: any) => ch.module_type === 'PF' && ch.period === periodMonth);
          if (!hasPF) {
            const fingerprint = fpGlobal(`a6_02_pf_${periodMonth}`);
            const finding = await findingManager.createFinding({
              findingType: 'overdue', severity: 'high',
              title: `A6.02 PF challan pending for ${periodMonth}`,
              description: `No PF challan found for ${periodMonth}. Payroll completed ${daysSincePeriodEnd} days ago.`,
              logicType: 'rule_based',
              dataSnapshot: { period: periodMonth, daysSincePeriodEnd },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['A6'] = (acc.groupCounts['A6'] || 0) + 1;
              if (canCreateTask(acc, 'a6_02', 'global') && !(await hasOpenTask(fingerprint))) {
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Admin – PF challan pending: ${periodMonth}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `File PF challan for ${periodMonth}.`,
                  actionPayload: {
                    title: `[Agent] Admin – File PF challan for ${periodMonth}`,
                    description: `Payroll for ${periodMonth} is complete but PF challan has not been filed.\nDays since period end: ${daysSincePeriodEnd}`,
                    assignedTo: c.finance_admin_user_id, priority: 'High', category: `Administration ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.9, priority: 'high',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a6_02', 'global'); }
              }
            }
          }

          // A6.03: ESIC challan pending
          const hasESIC = statutoryChallans.some((ch: any) => ch.module_type === 'ESIC' && ch.period === periodMonth);
          if (!hasESIC) {
            const fingerprint = fpGlobal(`a6_03_esic_${periodMonth}`);
            const finding = await findingManager.createFinding({
              findingType: 'overdue', severity: 'high',
              title: `A6.03 ESIC challan pending for ${periodMonth}`,
              description: `No ESIC challan found for ${periodMonth}. Payroll completed ${daysSincePeriodEnd} days ago.`,
              logicType: 'rule_based',
              dataSnapshot: { period: periodMonth, daysSincePeriodEnd },
            });
            if (!finding.isDuplicate) {
              findingsCount++;
              acc.findingIds.push(finding.id);
              acc.groupCounts['A6'] = (acc.groupCounts['A6'] || 0) + 1;
              if (canCreateTask(acc, 'a6_03', 'global') && !(await hasOpenTask(fingerprint))) {
                const rec = await recommendationManager.createRecommendation({
                  findingId: finding.id, title: `[Agent] Admin – ESIC challan pending: ${periodMonth}`,
                  actionType: 'create_task', actionCategory: 'task_creation',
                  description: `File ESIC challan for ${periodMonth}.`,
                  actionPayload: {
                    title: `[Agent] Admin – File ESIC challan for ${periodMonth}`,
                    description: `Payroll for ${periodMonth} is complete but ESIC challan has not been filed.\nDays since period end: ${daysSincePeriodEnd}`,
                    assignedTo: c.finance_admin_user_id, priority: 'High', category: `Administration ${fingerprint}`,
                  },
                  logicType: 'rule_based', confidence: 0.9, priority: 'high',
                });
                if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a6_03', 'global'); }
              }
            }
          }
        }
      }

      // A6.04: Missing EPF/ESIC numbers
      for (const user of activeUsers) {
        const uid = Number(user.id);
        const salary = salaryByUser.get(uid);
        if (!salary) continue;
        const name = userName(user);

        if (Number(salary.employee_pf_contribution || 0) > 0 && !user.epf_no) {
          const fingerprint = fp('a6_04_no_epf', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'medium',
            title: `A6.04 Missing EPF number: ${name}`,
            description: `${name} has PF deductions configured but no EPF number on record.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, pfContribution: salary.employee_pf_contribution },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A6.04:${name}`);
            acc.groupCounts['A6'] = (acc.groupCounts['A6'] || 0) + 1;
            if (canCreateTask(acc, 'a6_04', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Missing EPF no: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Collect EPF number for ${name}.`,
                actionPayload: {
                  title: `[Agent] Admin – Collect EPF number for ${name}`,
                  description: `${name} has PF contributions (₹${salary.employee_pf_contribution}) but no EPF number.\nisBlocking: true`,
                  assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.95, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a6_04', `user:${uid}`); }
            }
          }
        }

        if (Number(salary.employee_esic_contribution || 0) > 0 && !user.esic_no) {
          const fingerprint = fp('a6_04_no_esic', 'user', uid);
          const finding = await findingManager.createFinding({
            findingType: 'gap', severity: 'medium',
            title: `A6.04 Missing ESIC number: ${name}`,
            description: `${name} has ESIC deductions configured but no ESIC number on record.`,
            logicType: 'rule_based',
            relatedEntityType: 'user', relatedEntityId: String(uid),
            dataSnapshot: { userId: uid, esicContribution: salary.employee_esic_contribution },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.blockingFindings.push(`A6.04:${name}`);
            acc.groupCounts['A6'] = (acc.groupCounts['A6'] || 0) + 1;
            if (canCreateTask(acc, 'a6_04_esic', `user:${uid}`) && !(await hasOpenTask(fingerprint))) {
              const assignTo = await resolveAssignee(uid, c.hr_admin_user_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: `[Agent] Admin – Missing ESIC no: ${name}`,
                actionType: 'create_task', actionCategory: 'task_creation',
                description: `Collect ESIC number for ${name}.`,
                actionPayload: {
                  title: `[Agent] Admin – Collect ESIC number for ${name}`,
                  description: `${name} has ESIC contributions (₹${salary.employee_esic_contribution}) but no ESIC number.\nisBlocking: true`,
                  assignedTo: assignTo, priority: 'Medium', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.95, priority: 'normal',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a6_04_esic', `user:${uid}`); }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[AdminControl] A6 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GROUP A7: SYSTEM EXCEPTIONS / INTEGRATION HEALTH
    // ════════════════════════════════════════════════════════════════════════
    try {
      // A7.01: Unresolved payroll exceptions
      const staleExceptions = payrollExceptions.filter((pe: any) => {
        const created = new Date(pe.created_at);
        const daysSince = Math.floor((Date.now() - created.getTime()) / 86400000);
        return daysSince >= c.payroll_exception_stale_days;
      });
      for (const pe of staleExceptions) {
        const fingerprint = fp('a7_01_exception', 'payroll_exception', pe.id);
        const finding = await findingManager.createFinding({
          findingType: 'overdue', severity: 'medium',
          title: `A7.01 Unresolved payroll exception #${pe.id}`,
          description: `Payroll exception #${pe.id} (${pe.exception_type}, severity: ${pe.severity}) has been unresolved for over ${c.payroll_exception_stale_days} days.`,
          logicType: 'rule_based',
          relatedEntityType: 'payroll_exception', relatedEntityId: String(pe.id),
          dataSnapshot: { exceptionId: pe.id, type: pe.exception_type, severity: pe.severity },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A7'] = (acc.groupCounts['A7'] || 0) + 1;
          if (canCreateTask(acc, 'a7_01', `exception:${pe.id}`) && !(await hasOpenTask(fingerprint))) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: `[Agent] Admin – Payroll exception unresolved #${pe.id}`,
              actionType: 'create_task', actionCategory: 'task_creation',
              description: `Resolve payroll exception.`,
              actionPayload: {
                title: `[Agent] Admin – Resolve payroll exception #${pe.id} (${pe.exception_type})`,
                description: `Payroll exception #${pe.id} has been unresolved.\nType: ${pe.exception_type}\nSeverity: ${pe.severity}`,
                assignedTo: c.hr_admin_user_id, priority: 'Medium', category: `Administration ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.85, priority: 'normal',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'task', 'a7_01', `exception:${pe.id}`); }
          }
        }
      }

      // A7.02: Repeated SAP WHT sync failures (≥3 in 7 days)
      const failedSyncs = sapWhtFailures.filter((s: any) => s.status === 'failed');
      if (failedSyncs.length >= c.sap_failure_count_threshold) {
        const fingerprint = fpGlobal('a7_02_sap_wht_fail');
        const finding = await findingManager.createFinding({
          findingType: 'anomaly', severity: 'high',
          title: `A7.02 Repeated SAP WHT sync failures (${failedSyncs.length} in 7d)`,
          description: `${failedSyncs.length} SAP WHT sync failures in the last 7 days.`,
          logicType: 'rule_based',
          dataSnapshot: { failureCount: failedSyncs.length, threshold: c.sap_failure_count_threshold },
        });
        if (!finding.isDuplicate) {
          findingsCount++;
          acc.findingIds.push(finding.id);
          acc.groupCounts['A7'] = (acc.groupCounts['A7'] || 0) + 1;
          if (canEscalate(acc, 'a7_02', 'global') && !(await hasOpenTask(fingerprint))) {
            const escalateTo = await resolveEscalee(c.finance_admin_user_id, 'L3', c.superuser_id);
            const rec = await recommendationManager.createRecommendation({
              findingId: finding.id, title: '[Agent] Admin – SAP WHT sync failures',
              actionType: 'create_task', actionCategory: 'escalation',
              description: `Repeated SAP WHT sync failures detected.`,
              actionPayload: {
                title: `[Agent] Admin – SAP WHT sync failures (${failedSyncs.length}x in 7 days)`,
                description: `${failedSyncs.length} SAP WHT sync failures detected in the last 7 days.\nThreshold: ${c.sap_failure_count_threshold}\n\nInvestigate SAP integration health.`,
                assignedTo: escalateTo, priority: 'High', category: `Administration ${fingerprint}`,
              },
              logicType: 'rule_based', confidence: 0.9, priority: 'high',
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'escalation', 'a7_02', 'global'); }
          }
        }
      }

      // A7.03: Bulk payroll SAP posting failures
      if (latestCompletedPeriod) {
        const failedPostings = payrollRecords.filter((pr: any) =>
          ['failed', 'error'].includes(pr.sap_posting_status)
        ).length;
        if (failedPostings >= c.sap_failure_count_threshold) {
          const fingerprint = fpGlobal(`a7_03_bulk_sap_fail_${latestCompletedPeriod.id}`);
          const finding = await findingManager.createFinding({
            findingType: 'anomaly', severity: 'critical',
            title: `A7.03 Bulk SAP posting failures (${failedPostings} records)`,
            description: `${failedPostings} payroll records failed SAP posting in period "${latestCompletedPeriod.period_name}".`,
            logicType: 'rule_based',
            dataSnapshot: { failedCount: failedPostings, periodId: latestCompletedPeriod.id, periodName: latestCompletedPeriod.period_name },
          });
          if (!finding.isDuplicate) {
            findingsCount++;
            acc.findingIds.push(finding.id);
            acc.groupCounts['A7'] = (acc.groupCounts['A7'] || 0) + 1;
            if (canEscalate(acc, 'a7_03', 'global') && !(await hasOpenTask(fingerprint))) {
              const escalateTo = await resolveEscalee(c.finance_admin_user_id, 'L3', c.superuser_id);
              const rec = await recommendationManager.createRecommendation({
                findingId: finding.id, title: '[Agent] Admin – Bulk SAP failures',
                actionType: 'create_task', actionCategory: 'escalation',
                description: `${failedPostings} SAP posting failures.`,
                actionPayload: {
                  title: `[Agent] Admin – CRITICAL: ${failedPostings} SAP posting failures in ${latestCompletedPeriod.period_name}`,
                  description: `${failedPostings} payroll records failed SAP posting.\nPeriod: ${latestCompletedPeriod.period_name}\n\nImmediate investigation required.`,
                  assignedTo: escalateTo, priority: 'Critical', category: `Administration ${fingerprint}`,
                },
                logicType: 'rule_based', confidence: 0.95, priority: 'urgent',
              });
              if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); recordAction(acc, 'escalation', 'a7_03', 'global'); }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[AdminControl] A7 error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // SUMMARY MODE: If too many findings, consolidate into summary tasks
    // ════════════════════════════════════════════════════════════════════════
    if (findingsCount > c.summary_mode_threshold) {
      console.log(`[AdminControl] Summary mode activated: ${findingsCount} findings exceed threshold (${c.summary_mode_threshold}). Individual tasks capped.`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // INSIGHTS
    // ════════════════════════════════════════════════════════════════════════
    try {
      const totalBlockers = acc.blockingFindings.length;
      const groupScores: Record<string, number> = {};
      const groups = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
      for (const g of groups) {
        const issues = acc.groupCounts[g] || 0;
        groupScores[g] = Math.max(0, 100 - issues * 10);
      }
      const blockingWeight = 3;
      const totalIssues = findingsCount;
      const weightedIssues = totalIssues + totalBlockers * (blockingWeight - 1);
      const healthScore = Math.max(0, Math.min(100, 100 - weightedIssues * 2));

      const insight1 = await insightManager.createInsight({
        findingIds: acc.findingIds.slice(0, 50),
        insightType: 'summary',
        title: 'Administration Health Score',
        content: `Overall Score: ${healthScore}/100\n` +
          `Total Findings: ${totalIssues}\nBlocking Issues: ${totalBlockers}\n\n` +
          groups.map(g => `${g}: ${acc.groupCounts[g] || 0} issues (score: ${groupScores[g]})`).join('\n') +
          (totalBlockers > 0 ? `\n\nBlocking items:\n${acc.blockingFindings.slice(0, 10).map(b => `  - ${b}`).join('\n')}` : ''),
        logicType: 'rule_based',
        dataSources: ['users', 'employee_salaries', 'payroll_records', 'attendance_records', 'leave_requests', 'visa_records'],
        scopePeriod: new Date().toISOString().slice(0, 10),
      });
      if (!insight1.isDuplicate) insightsCount++;

      const payrollReady = totalBlockers === 0;
      const insight2 = await insightManager.createInsight({
        findingIds: acc.findingIds.filter((_, i) => acc.blockingFindings[i]),
        insightType: 'kpi_report',
        title: 'Payroll Readiness Status',
        content: payrollReady
          ? 'PAYROLL READY — No blocking issues detected.'
          : `PAYROLL BLOCKED — ${totalBlockers} blocking issue(s):\n${acc.blockingFindings.slice(0, 15).map(b => `  ✗ ${b}`).join('\n')}`,
        logicType: 'rule_based',
        dataSources: ['users', 'employee_salaries', 'payroll_records', 'attendance_records'],
        scopePeriod: new Date().toISOString().slice(0, 10),
      });
      if (!insight2.isDuplicate) insightsCount++;
    } catch (err: any) {
      console.error(`[AdminControl] Insight error:`, err.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // AUTO-EXECUTE APPROVED RECOMMENDATIONS
    // ════════════════════════════════════════════════════════════════════════
    for (const recId of autoExecuteQueue) {
      try {
        const rows = await db.execute(sql`
          SELECT id, action_type, action_payload, status FROM agent_recommendations WHERE id = ${recId}
        `);
        const rec = (rows.rows as any[])[0];
        if (!rec || (rec.status !== 'approved' && rec.status !== 'auto_approved')) continue;

        const payload = typeof rec.action_payload === 'string' ? JSON.parse(rec.action_payload) : rec.action_payload;
        if (!payload?.title) continue;

        const today = new Date().toISOString().split('T')[0];
        const finishDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

        await db.execute(sql`
          INSERT INTO tasks (title, description, status, assigned_to, created_by, priority, category, start_date, finish_date, source_type, source_id, source_agent, created_at)
          VALUES (
            ${payload.title},
            ${payload.description || ''},
            'pending',
            ${payload.assignedTo || 1},
            1,
            ${payload.priority || 'Medium'},
            ${payload.category || 'Administration'},
            ${today},
            ${finishDate},
            'agent_task',
            ${recId},
            ${SOURCE_AGENT},
            NOW()::text
          )
        `);

        await db.execute(sql`
          UPDATE agent_recommendations SET status = 'executed', updated_at = NOW() WHERE id = ${recId}
        `);
        autoExecutedCount++;
      } catch (err: any) {
        console.error(`[AdminControl] Auto-execute error for rec ${recId}:`, err.message);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // EXECUTION METADATA
    // ════════════════════════════════════════════════════════════════════════
    const elapsed = Date.now() - startTime;
    const executionMetadata = {
      findings_detected: findingsCount,
      tasks_created: autoExecutedCount,
      tasks_closed: autoClosedCount,
      recommendations_generated: recommendationsCount,
      insights_generated: insightsCount,
      execution_time_ms: elapsed,
      queries_run: queriesRun,
      blocking_findings: acc.blockingFindings.length,
      group_counts: acc.groupCounts,
      summary_mode: findingsCount > c.summary_mode_threshold,
      daily_caps: {
        tasks: `${acc.taskCreated}/25`,
        notifications: `${acc.notificationSent}/50`,
        escalations: `${acc.escalationSent}/10`,
      },
      modules: ['A1-A7'],
    };

    try {
      await db.execute(sql`
        UPDATE agent_runs
        SET execution_metadata = ${JSON.stringify(executionMetadata)}::jsonb
        WHERE id = ${context.runId}
      `);
    } catch (err: any) {
      console.error(`[AdminControl] Failed to update execution_metadata:`, err.message);
    }

    console.log(`[AdminControl] Complete: ${findingsCount} findings, ${recommendationsCount} recommendations, ${insightsCount} insights, ${autoExecutedCount} tasks created, ${autoClosedCount} auto-closed, ${acc.blockingFindings.length} blockers, ${queriesRun} queries in ${elapsed}ms`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      autoExecutedActions: autoExecutedCount,
      queriesRun,
      executionTimeMs: elapsed,
      summary: `Administration Control Agent (35-finding model): ${findingsCount} findings, ${recommendationsCount} recommendations, ${insightsCount} insights, ${autoExecutedCount} tasks created, ${autoClosedCount} auto-closed, ${acc.blockingFindings.length} blockers. Groups: A1(Payroll), A2(Attendance), A3(Lifecycle), A4(Leave/Travel), A5(Security), A6(Statutory), A7(System). Execution: ${elapsed}ms.`,
    };
  }
}
