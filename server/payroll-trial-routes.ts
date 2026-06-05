/**
 * Trial Payroll Routes
 * Baseline: docs/payroll-governance-v4.1-baseline.md §5, §8
 *
 * Trial runs: read live data, compute salary via shared core,
 * persist record_type='trial'. NO loan/advance writes. NO saveTdsRecord().
 */
import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { db } from './db';
import {
  payrollPeriods,
  payrollRecords,
  payrollSettings,
  employeeSalaries,
  attendanceRecords,
  leaveRequests,
  leaveTypes,
  leaveBalances,
  employeeLoans,
  employeeAdvances,
  users,
  companyHolidays,
  dailyWorkReports,
  payrollLeaveAutocover,
} from '@shared/schema';
import { eq, and, gte, lte, desc, max, sql, asc, between, inArray, isNull, or } from 'drizzle-orm';
import { computeEmployeeSalaryNumbers, PAYROLL_CONSTANTS } from './payroll-salary-core';
import { resolveStatutoryApplicability } from '@shared/statutory-rules';
import type { EmployeeType } from '@shared/schema';
import { computeMonthlyTds } from './tds-calculation-service';
import { isLwpExempt } from './leave-service';

const router = Router();
router.use(ensureAuthenticated);

const TRIAL_ADMIN_ROLES = ['Admin', 'HR', 'Finance', 'Manager', 'Senior Manager', 'General Manager', 'Superuser'];

function requireTrialRole(req: Request, res: Response): number | null {
  const user = req.user as any;
  if (!user?.id) { res.status(401).json({ error: 'Authentication required' }); return null; }
  if (!TRIAL_ADMIN_ROLES.includes(user.role)) {
    res.status(403).json({ error: `Payroll trial requires one of: ${TRIAL_ADMIN_ROLES.join(', ')}` });
    return null;
  }
  return user.id;
}

async function getPtConfig(): Promise<{ monthly: number; february: number }> {
  const rows = await db.select().from(payrollSettings).where(
    sql`${payrollSettings.settingName} IN ('professional_tax_monthly', 'professional_tax_february')`
  );
  let monthly = 200, february = 300;
  for (const r of rows) {
    if (r.settingName === 'professional_tax_monthly') monthly = parseFloat(r.settingValue) || 200;
    if (r.settingName === 'professional_tax_february') february = parseFloat(r.settingValue) || 300;
  }
  return { monthly, february };
}

async function getMinTakeHome(): Promise<number> {
  const rows = await db.select().from(payrollSettings).where(eq(payrollSettings.settingName, 'minimum_take_home'));
  return rows.length > 0 ? parseFloat(rows[0].settingValue) || 10000 : 10000;
}

/**
 * POST /api/payroll/trial/run
 * Creates a new trial payroll record for one employee/period.
 * Live data read. No DB mutations to loans/advances/TDS tables.
 */
router.post('/trial/run', async (req: Request, res: Response) => {
  try {
    const executedBy = requireTrialRole(req, res);
    if (!executedBy) return;

    const { periodId, userId } = req.body;
    if (!periodId || !userId) return res.status(400).json({ error: 'periodId and userId are required' });

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
    if (!period) return res.status(404).json({ error: 'Payroll period not found' });

    if (period.status === 'paid' || period.status === 'locked') {
      return res.status(409).json({ error: `Cannot run trial on period with status: ${period.status}` });
    }

    const [employee] = await db.select().from(users).where(eq(users.id, userId));
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const [sal] = await db.select().from(employeeSalaries)
      .where(and(eq(employeeSalaries.userId, userId), eq(employeeSalaries.isActive, true), lte(employeeSalaries.effectiveDate, period.endDate)))
      .orderBy(desc(employeeSalaries.effectiveDate))
      .limit(1);
    if (!sal) return res.status(400).json({ error: 'No active salary configuration for this employee' });

    // ── Single unified SAP-posted guard (raw SQL to guarantee exact match) ───
    // Block if a payroll_engine record for this employee+period has a live SAP JE (posted and not reversed).
    // Manual OT / manual salary entries from a different salary_source do NOT block the payroll engine trial run.
    const guardResult = await db.execute(sql`
      SELECT id, sap_je_number, trial_run_no, sap_posting_status, reversal_sap_doc_entry
      FROM payroll_records
      WHERE period_id = ${Number(periodId)}
        AND user_id = ${Number(userId)}
        AND sap_posting_status = 'posted'
        AND reversal_sap_doc_entry IS NULL
        AND salary_source NOT IN ('manual_ot_only', 'manual_salary')
      LIMIT 1
    `);

    if (guardResult.rows.length > 0) {
      const blocked = guardResult.rows[0] as any;
      return res.status(409).json({
        error: 'Official payroll already exists and SAP JE is posted for this employee and period. Reverse the SAP JE before proceeding.',
        code: 'OFFICIAL_JE_UNREVERSED',
        recordId: blocked.id,
        sapJeNumber: blocked.sap_je_number,
        trialRunNo: blocked.trial_run_no,
      });
    }

    // ── Read live attendance ─────────────────────────────────────────────────
    const attendanceReadAt = new Date().toISOString();
    const startDate = period.startDate;
    const endDate = period.endDate;

    const holidays = await db.select({ date: companyHolidays.date })
      .from(companyHolidays)
      .where(between(companyHolidays.date, startDate, endDate));
    const holidayDates = new Set(holidays.map(h => String(h.date)));

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    const weeklyOffs: number[] = employee.weeklyOffDays || [0, 6];
    let weekOffCount = 0;
    const cur = new Date(sDate);
    while (cur <= eDate) { if (weeklyOffs.includes(cur.getDay())) weekOffCount++; cur.setDate(cur.getDate() + 1); }

    const attRecordsDb = await db.select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, userId), gte(attendanceRecords.date, startDate), lte(attendanceRecords.date, endDate)));

    const salaryType = (sal.salaryType || 'monthly') as 'monthly' | 'daily';
    const calendarDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;
    const totalWorkingDays = calendarDays - weekOffCount - holidayDates.size;

    const presentFull = attRecordsDb.filter(r => r.status === 'present').length;
    const presentHalf = attRecordsDb.filter(r => r.status === 'half_day').length;
    const lateDays = attRecordsDb.filter(r => r.status === 'late').length;
    const absentCount = attRecordsDb.filter(r => r.status === 'absent').length;
    const totalOT = attRecordsDb.reduce((s, r) => s + parseFloat(r.overtimeHours || '0'), 0);

    let lopDays: number, paidDays: number, presentDays: number, paidLeaveDays = 0, unpaidLeaveDays = 0;

    if (salaryType === 'daily') {
      presentDays = presentFull + lateDays + presentHalf * 0.5;
      paidDays = presentDays;
      lopDays = 0;
    } else {
      const expectedDates: string[] = [];
      const iter = new Date(sDate);
      while (iter <= eDate) {
        const dateStr = iter.toISOString().slice(0, 10);
        // Exclude both weekly-off days AND company holidays from expected working dates.
        // Without this, holidays with no attendance record are counted as missing → false LOP.
        if (!weeklyOffs.includes(iter.getDay()) && !holidayDates.has(dateStr)) {
          expectedDates.push(dateStr);
        }
        iter.setDate(iter.getDate() + 1);
      }
      const attDateSet = new Set(attRecordsDb.map(r => String(r.date).slice(0, 10)));
      const missingCount = expectedDates.filter(d => !attDateSet.has(d)).length;
      presentDays = presentFull + lateDays + presentHalf * 0.5;
      lopDays = absentCount + presentHalf * 0.5 + missingCount;
      paidDays = Math.max(PAYROLL_CONSTANTS.MONTHLY_DIVISOR - lopDays, 0);
    }

    const allLeaveTypes = await db.select().from(leaveTypes);
    const paidTypeIds = new Set(allLeaveTypes.filter(lt => lt.isPaid).map(lt => lt.id));
    const leaves = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.employeeId, userId), eq(leaveRequests.status, 'approved'), lte(leaveRequests.startDate, endDate), gte(leaveRequests.endDate, startDate)));

    for (const leave of leaves) {
      const days = parseFloat(leave.totalDays);
      if (paidTypeIds.has(leave.leaveTypeId)) paidLeaveDays += days;
      else unpaidLeaveDays += days;
    }

    let lwpExemptApplied = false;
    let balanceCoveredDays = 0;
    if (salaryType === 'daily') {
      paidDays += paidLeaveDays;

      // ── Auto-cover absent/missing working days with CL balance (daily employees) ──
      // Daily-rate employees (especially non-system users who cannot submit leave
      // requests) have absent working days simply subtracted from paid days.
      // If paid leave balance is available, auto-apply it to cover those absent
      // days — mirroring HR practice of retrospective CL booking against absences.
      // Missing records (working days with no attendance entry) are also treated
      // as absent, the same as explicit 'absent' status records.
      const dailyExpectedDates: string[] = [];
      const dailyIter = new Date(sDate);
      while (dailyIter <= eDate) {
        const dStr = dailyIter.toISOString().slice(0, 10);
        if (!weeklyOffs.includes(dailyIter.getDay()) && !holidayDates.has(dStr)) {
          dailyExpectedDates.push(dStr);
        }
        dailyIter.setDate(dailyIter.getDate() + 1);
      }
      const dailyAttDateSet = new Set(attRecordsDb.map(r => String(r.date).slice(0, 10)));
      const dailyMissingCount = dailyExpectedDates.filter(d => !dailyAttDateSet.has(d)).length;
      // Total absent = explicit absent records + days with no record at all,
      // minus any already covered by approved leave requests (paidLeaveDays).
      const dailyAbsentDays = Math.max(0, absentCount + dailyMissingCount - paidLeaveDays);

      if (dailyAbsentDays > 0) {
        const periodYear = new Date(startDate).getFullYear();
        const paidLeaveTypeIds = new Set(allLeaveTypes.filter(lt => lt.isPaid).map(lt => lt.id));
        const balances = await db.select({
          allocatedDays: leaveBalances.allocatedDays,
          usedDays: leaveBalances.usedDays,
          pendingDays: leaveBalances.pendingDays,
          carryoverDays: leaveBalances.carryoverDays,
          leaveTypeId: leaveBalances.leaveTypeId,
        }).from(leaveBalances)
          .where(and(
            eq(leaveBalances.userId, userId),
            eq(leaveBalances.year, periodYear),
          ));

        let availablePaidBalance = 0;
        for (const bal of balances) {
          if (!paidLeaveTypeIds.has(bal.leaveTypeId)) continue;
          const remaining =
            parseFloat(bal.allocatedDays) +
            parseFloat(bal.carryoverDays as string || '0') -
            parseFloat(bal.usedDays) -
            parseFloat(bal.pendingDays);
          if (remaining > 0) availablePaidBalance += remaining;
        }

        balanceCoveredDays = Math.min(availablePaidBalance, dailyAbsentDays);
        if (balanceCoveredDays > 0) {
          paidDays += balanceCoveredDays;
          paidLeaveDays += balanceCoveredDays;
        }
      }
      // Company holidays are paid for daily-rate employees
      paidDays += holidayDates.size;
    } else {
      const covered = Math.min(paidLeaveDays, lopDays);
      lopDays = Math.max(0, lopDays - covered);
      paidLeaveDays = covered;

      // ── Auto-cover remaining LOP from paid leave balance ─────────────────────
      // If approved leave requests don't fully cover the LOP (e.g. employee was
      // half-day absent without a formal leave application), but the employee
      // still has paid leave balance available, auto-apply it here so the trial
      // reflects their entitlement.  This mirrors the HR practice of
      // retrospectively booking CL against short absences.
      if (lopDays > 0) {
        const periodYear = new Date(startDate).getFullYear();
        const paidLeaveTypeIds = new Set(allLeaveTypes.filter(lt => lt.isPaid).map(lt => lt.id));
        const balances = await db.select({
          allocatedDays: leaveBalances.allocatedDays,
          usedDays: leaveBalances.usedDays,
          pendingDays: leaveBalances.pendingDays,
          carryoverDays: leaveBalances.carryoverDays,
          leaveTypeId: leaveBalances.leaveTypeId,
        }).from(leaveBalances)
          .where(and(
            eq(leaveBalances.userId, userId),
            eq(leaveBalances.year, periodYear),
          ));

        // Sum up remaining paid leave balance across all paid leave types
        let availablePaidBalance = 0;
        for (const bal of balances) {
          if (!paidLeaveTypeIds.has(bal.leaveTypeId)) continue;
          const remaining =
            parseFloat(bal.allocatedDays) +
            parseFloat(bal.carryoverDays as string || '0') -
            parseFloat(bal.usedDays) -
            parseFloat(bal.pendingDays);
          if (remaining > 0) availablePaidBalance += remaining;
        }

        balanceCoveredDays = Math.min(availablePaidBalance, lopDays);
        if (balanceCoveredDays > 0) {
          lopDays = Math.max(0, lopDays - balanceCoveredDays);
          paidLeaveDays += balanceCoveredDays;
        }
      }

      // LWP Exemption — role-based (Superuser/GM/SM) OR salary config flag OR users.lwp_exempt grant
      const roleExempt = await isLwpExempt(userId);
      const salaryConfigExempt = sal.lwpExempt === true;
      if ((roleExempt || salaryConfigExempt) && lopDays > 0) {
        lwpExemptApplied = true;
        lopDays = 0;
      }

      paidDays = Math.min(PAYROLL_CONSTANTS.MONTHLY_DIVISOR - lopDays, PAYROLL_CONSTANTS.MONTHLY_DIVISOR);
    }

    // ── Composite KPI scoring for KGP (Phase 2 — mirrors stepKpiAdjustment) ──
    // Applies to Manager and Employee roles with kgp_allowance > 0.
    // Formula: composite = prod×0.70 + plan×0.15 + eff×0.10 + qual×0.05
    // Missing DWAR day → 0 for all signals; stays in denominator (presentCount).
    // Weekly-offs, holidays, absent days excluded via status filter on attRecordsDb.
    const kgpCeilingFromConfig = parseFloat(sal.kgpAllowance || '0');
    const basicSalary = parseFloat(sal.basicSalary || sal.baseSalary || '0');
    let scoredKgpAllowance = kgpCeilingFromConfig;
    let trialKpiSnapshot: Record<string, any> | null = null;

    // KGP eligibility: system users with kgp_allowance > 0 get DWAR-scored KGP.
    // Non-system users (userType !== 'system_user') receive 100% of the configured
    // KGP allowance with no DWAR scoring and no KPI % displayed on the slip.
    if (kgpCeilingFromConfig > 0 && salaryType === 'monthly' && employee.userType === 'system_user') {
      const kpiPaidAttDays = attRecordsDb.filter(r =>
        ['present', 'late', 'half_day', 'on_leave'].includes(r.status ?? '')
      );
      const kpiPresentCount = kpiPaidAttDays.length;

      if (kpiPresentCount > 0) {
        const validDwars = await db.select({
          reportDate: dailyWorkReports.reportDate,
          productivityScore: dailyWorkReports.productivityScore,
          planFollowThroughScore: dailyWorkReports.planFollowThroughScore,
          efficiencyRating: dailyWorkReports.efficiencyRating,
          qualityScore: dailyWorkReports.qualityScore,
        }).from(dailyWorkReports)
          .where(and(
            eq(dailyWorkReports.userId, userId),
            gte(dailyWorkReports.reportDate, startDate),
            lte(dailyWorkReports.reportDate, endDate),
            inArray(dailyWorkReports.status, ['submitted', 'approved'])
          ));

        const dwarByDate = new Map<string, { prod: number; plan: number; eff: number; qual: number }>();
        for (const dwar of validDwars) {
          const ds = typeof dwar.reportDate === 'string'
            ? dwar.reportDate
            : new Date(dwar.reportDate as any).toISOString().split('T')[0];
          dwarByDate.set(ds, {
            prod: parseFloat(dwar.productivityScore?.toString() || '0') || 0,
            plan: parseFloat(dwar.planFollowThroughScore?.toString() || '0') || 0,
            eff:  parseFloat(dwar.efficiencyRating?.toString() || '0') || 0,
            qual: parseFloat(dwar.qualityScore?.toString() || '0') || 0,
          });
        }

        let totalComposite = 0;
        let kpiDwarMatched = 0;
        let kpiDwarMissing = 0;
        for (const attDay of kpiPaidAttDays) {
          const ds = typeof attDay.date === 'string'
            ? attDay.date
            : new Date(attDay.date as any).toISOString().split('T')[0];
          const signals = dwarByDate.get(ds);
          if (signals) {
            totalComposite += (signals.prod * 0.70) + (signals.plan * 0.15) + (signals.eff * 0.10) + (signals.qual * 0.05);
            kpiDwarMatched++;
          } else {
            kpiDwarMissing++;
          }
        }

        const compositeKpiPct = totalComposite / kpiPresentCount; // 0–100
        scoredKgpAllowance = basicSalary * 0.15 * (compositeKpiPct / 100);

        trialKpiSnapshot = {
          compositeKpiPercent: compositeKpiPct,
          formula: 'productivity×70% + planFollowThrough×15% + efficiency×10% + quality×5%',
          kpiSource: `composite_kpi_v2_${kpiPresentCount}_days_${kpiDwarMatched}_dwars_${kpiDwarMissing}_missing`,
          paidAttendanceDays: kpiPresentCount,
          dwarDaysMatched: kpiDwarMatched,
          dwarDaysMissing: kpiDwarMissing,
          kgpCeiling: kgpCeilingFromConfig,
          scoredKgpAllowance,
        };
      }
    }

    // ── Statutory resolution ─────────────────────────────────────────────────
    const ratio = salaryType === 'monthly' ? Math.min(paidDays, PAYROLL_CONSTANTS.MONTHLY_DIVISOR) / PAYROLL_CONSTANTS.MONTHLY_DIVISOR : 1;
    const prelimGross = salaryType === 'daily'
      ? basicSalary * paidDays
      : basicSalary * ratio
        + parseFloat(sal.houseRentAllowance || '0') * ratio
        + parseFloat(sal.conveyance || '0') * ratio
        + parseFloat(sal.lta || '0') * ratio
        + parseFloat(sal.specialAllowance || '0') * ratio
        + parseFloat(sal.supplementaryAllowance || '0') * ratio
        + scoredKgpAllowance * ratio;

    let empAgeForTrial: number | undefined;
    if (employee.dateOfBirth) {
      const dob = new Date(employee.dateOfBirth);
      const refDate = new Date(endDate);
      empAgeForTrial = refDate.getFullYear() - dob.getFullYear();
      const md = refDate.getMonth() - dob.getMonth();
      if (md < 0 || (md === 0 && refDate.getDate() < dob.getDate())) empAgeForTrial--;
    }

    const statutoryResult = resolveStatutoryApplicability({
      employeeType: (employee.employeeType as EmployeeType) || null,
      grossEarnings: prelimGross,
      hasEpfNumber: !!employee.epfNo,
      hasPfConfigured: true,
      role: employee.role,
      pfApplicable: sal.pfApplicable !== false,
      employeeAge: empAgeForTrial,
    });

    // ── Working hours ─────────────────────────────────────────────────────────
    let workingHoursPerDay = 8;
    if (employee.dutyTimeIn && employee.dutyTimeOut) {
      const [inH, inM] = employee.dutyTimeIn.split(':').map(Number);
      const [outH, outM] = employee.dutyTimeOut.split(':').map(Number);
      const h = (outH * 60 + outM - (inH * 60 + inM)) / 60;
      if (h > 0) workingHoursPerDay = h;
    } else if (employee.minimumDailyHours) {
      workingHoursPerDay = employee.minimumDailyHours;
    }

    // ── Read salary config timestamp for snapshot ─────────────────────────────
    const salaryConfigReadAt = new Date().toISOString();

    const ptConfig = await getPtConfig();
    const minimumTakeHome = await getMinTakeHome();
    const isFebruary = new Date(period.startDate).getMonth() + 1 === 2;

    // ── Read live loans and advances for simulation ──────────────────────────
    const activeLoans = await db.select({
      id: employeeLoans.id,
      outstandingBalance: employeeLoans.outstandingBalance,
      emiAmount: employeeLoans.emiAmount,
      loanType: employeeLoans.loanType,
    }).from(employeeLoans)
      .where(and(eq(employeeLoans.employeeId, userId), eq(employeeLoans.status, 'active'), lte(employeeLoans.startDeductionDate, endDate)))
      .orderBy(asc(employeeLoans.createdAt));

    const activeAdvances = await db.select({
      id: employeeAdvances.id,
      outstandingBalance: employeeAdvances.outstandingBalance,
      recoveryAmount: employeeAdvances.recoveryAmount,
      recoveryType: employeeAdvances.recoveryType,
    }).from(employeeAdvances)
      .where(and(eq(employeeAdvances.employeeId, userId), eq(employeeAdvances.status, 'active'), lte(employeeAdvances.startRecoveryDate, endDate)))
      .orderBy(asc(employeeAdvances.createdAt));

    // ── Compute salary using shared core ─────────────────────────────────────
    const coreResult = computeEmployeeSalaryNumbers({
      basicSalary,
      salaryType,
      houseRentAllowance: parseFloat(sal.houseRentAllowance || '0'),
      conveyance: parseFloat(sal.conveyance || '0'),
      lta: parseFloat(sal.lta || '0'),
      specialAllowance: parseFloat(sal.specialAllowance || '0'),
      supplementaryAllowance: parseFloat(sal.supplementaryAllowance || '0'),
      kgpAllowance: scoredKgpAllowance,
      configBonus: parseFloat(sal.bonus || '0'),
      groupInsurance: parseFloat(sal.groupInsurance || '1500'),
      workingHoursPerDay,
      otRate: parseFloat(sal.otRate || '1.0'),
      otMultiplier: parseFloat(sal.otMultiplier || '1.0'),
      paidDays,
      lopDays,
      totalWorkingDays,
      overtimeHours: totalOT,
      isPFApplicable: !!statutoryResult.isPFApplicable,
      isESICApplicable: !!statutoryResult.isESICApplicable,
      isPTApplicable: !!(statutoryResult.isPTApplicable && employee.role !== 'Superuser'),
      ptMonthly: ptConfig.monthly,
      ptFebruary: ptConfig.february,
      isFebruary,
      activeLoans,
      activeAdvances,
      minimumTakeHome,
    });

    // ── TDS projection (no saveTdsRecord — trial only) ───────────────────────
    const periodMonth = new Date(endDate).getMonth() + 1;
    const periodYear = new Date(endDate).getFullYear();
    let tdsAmount = 0;
    try {
      // Annual bonus is taxable even though it is not paid monthly.
      // bonusAllowance = monthly equivalent; × 12 gives the full-year taxable bonus.
      const trialAnnualBonus = coreResult.bonusAllowance * 12;
      const tdsResult = await computeMonthlyTds(userId, periodId, periodMonth, periodYear, coreResult.grossPay, trialAnnualBonus);
      tdsAmount = tdsResult.tdsActualMonthly;
    } catch (_) {}

    const finalNetPay = coreResult.netPayPreTds - tdsAmount;
    const finalTotalDeductions = coreResult.totalStatutoryDeductions + coreResult.loanDeductions + coreResult.advanceDeductions + tdsAmount;

    // ── Assign trial_run_no inside a transaction ─────────────────────────────
    const calculationSnapshot = {
      engineVersion: coreResult.engineVersion,
      snapshotDate: new Date().toISOString(),
      attendanceReadAt,
      salaryConfigReadAt,
      reproducibilityNote: 'Trial run. Live data used at execution time. Not a frozen snapshot. Results may differ if attendance, leave, salary config, or payroll settings change after this timestamp.',
      ptUsed: coreResult.professionalTax,
      isFebruary,
      paidDays: coreResult.paidDays,
      lopDays,
      salaryBasis: coreResult.salaryBasis,
      statutory: {
        isPFApplicable: !!statutoryResult.isPFApplicable,
        isESICApplicable: !!statutoryResult.isESICApplicable,
        isPTApplicable: !!(statutoryResult.isPTApplicable && employee.role !== 'Superuser'),
        basis: statutoryResult.basis,
      },
      tdsProjection: tdsAmount,
      loanBreakdown: coreResult.loanBreakdown,
      advanceBreakdown: coreResult.advanceBreakdown,
      kpiAdjustment: trialKpiSnapshot,
    };

    const [newRecord] = await db.transaction(async (tx) => {
      const [maxRow] = await tx.select({ maxNo: sql<number>`COALESCE(MAX(trial_run_no), 0)` })
        .from(payrollRecords)
        .where(and(eq(payrollRecords.periodId, periodId), eq(payrollRecords.userId, userId), eq(payrollRecords.recordType, 'trial')));

      const nextTrialRunNo = (maxRow?.maxNo ?? 0) + 1;

      return tx.insert(payrollRecords).values({
        periodId,
        userId,
        recordType: 'trial',
        trialRunNo: nextTrialRunNo,
        trialStatus: 'generated',
        calculationEngineVersion: coreResult.engineVersion,
        runNumber: null,
        baseSalary: coreResult.proratedBase.toFixed(2),
        workingDays: totalWorkingDays,
        paidDays: coreResult.paidDays.toFixed(2),
        lopDays: lopDays.toFixed(2),
        presentDays: presentDays.toFixed(1),
        paidLeaveDays: paidLeaveDays.toFixed(2),
        unpaidLeaveDays: unpaidLeaveDays.toFixed(2),
        hra: coreResult.hra.toFixed(2),
        conveyanceAllowance: coreResult.conv.toFixed(2),
        ltaAllowance: coreResult.lta.toFixed(2),
        specialAllowance: coreResult.specialAllowance.toFixed(2),
        supplementaryAllowance: coreResult.supplementaryAllowance.toFixed(2),
        kgpAllowance: coreResult.kgpAllowance.toFixed(2),
        bonus: coreResult.bonusAllowance.toFixed(2),
        overtimeHours: totalOT.toFixed(2),
        overtimePay: coreResult.overtimePay.toFixed(2),
        grossPay: coreResult.grossPay.toFixed(2),
        employeePf: coreResult.employeePF.toFixed(2),
        providentFund: coreResult.employeePF.toFixed(2),
        employerPf: coreResult.employerPF.toFixed(2),
        employeeEsic: coreResult.employeeESIC.toFixed(2),
        employerEsic: coreResult.employerESIC.toFixed(2),
        esic: coreResult.employeeESIC.toFixed(2),
        professionalTax: coreResult.professionalTax.toFixed(2),
        gratuity: coreResult.gratuity.toFixed(2),
        groupInsurance: coreResult.groupInsurance.toFixed(2),
        loanDeductions: coreResult.loanDeductions.toFixed(2),
        advanceDeductions: coreResult.advanceDeductions.toFixed(2),
        incomeTax: tdsAmount.toFixed(2),
        tdsAmount: tdsAmount.toFixed(2),
        totalDeductions: finalTotalDeductions.toFixed(2),
        netPay: finalNetPay.toFixed(2),
        calculationSnapshot: calculationSnapshot as any,
        status: 'generated',
        verificationStatus: 'pending',
      } as any).returning();
    });

    // ── Trial auto-cover: write leave balance deductions ─────────────────────
    // Mirrors the official run's deduction step so the leave ledger is accurate
    // during the trial phase, not only after conversion to official.
    // On re-run: reverse the previous trial's auto-cover first, then apply fresh.
    if (balanceCoveredDays > 0) {
      const existingCovers = await db
        .select()
        .from(payrollLeaveAutocover)
        .where(and(
          eq(payrollLeaveAutocover.userId, userId),
          eq(payrollLeaveAutocover.periodId, periodId),
          eq(payrollLeaveAutocover.status, 'applied')
        ));

      // Reverse previous deductions for this employee/period
      for (const cover of existingCovers) {
        const daysToRestore = parseFloat(cover.daysDeducted?.toString() || '0');
        if (daysToRestore > 0) {
          await db.execute(sql`
            UPDATE leave_balances
            SET used_days = GREATEST(0, used_days::numeric - ${daysToRestore}::numeric),
                last_updated = NOW()
            WHERE user_id = ${userId}
              AND leave_type_id = ${cover.leaveTypeId}
              AND year = ${periodYear}
          `);
        }
        await db
          .update(payrollLeaveAutocover)
          .set({ status: 'reversed', reversedAt: new Date() })
          .where(eq(payrollLeaveAutocover.id, cover.id));
      }

      // Apply fresh deductions: greedy across paid leave balances
      const allLTs = await db.select().from(leaveTypes);
      const paidLTIds = new Set(allLTs.filter(lt => lt.isPaid).map(lt => lt.id));
      const balancesForDeduct = await db
        .select({
          id: leaveBalances.id,
          leaveTypeId: leaveBalances.leaveTypeId,
          usedDays: leaveBalances.usedDays,
          allocatedDays: leaveBalances.allocatedDays,
          carryoverDays: leaveBalances.carryoverDays,
          pendingDays: leaveBalances.pendingDays,
        })
        .from(leaveBalances)
        .where(and(eq(leaveBalances.userId, userId), eq(leaveBalances.year, periodYear)));

      let remaining = balanceCoveredDays;
      for (const bal of balancesForDeduct) {
        if (!paidLTIds.has(bal.leaveTypeId)) continue;
        if (remaining <= 0) break;
        const available =
          parseFloat(bal.allocatedDays) +
          parseFloat((bal.carryoverDays as string) || '0') -
          parseFloat(bal.usedDays) -
          parseFloat(bal.pendingDays);
        if (available <= 0) continue;
        const toDeduct = Math.min(remaining, available);
        const newUsedDays = parseFloat(bal.usedDays) + toDeduct;

        await db
          .update(leaveBalances)
          .set({ usedDays: newUsedDays.toFixed(2), lastUpdated: new Date() })
          .where(eq(leaveBalances.id, bal.id));

        await db.insert(payrollLeaveAutocover).values({
          payrollRecordId: newRecord.id,
          periodId,
          runNumber: 0,
          userId,
          leaveTypeId: bal.leaveTypeId,
          daysDeducted: toDeduct.toFixed(2),
          status: 'applied',
          notes: `Trial run ${newRecord.trialRunNo}: ${toDeduct.toFixed(2)} day(s) deducted from leave balance to cover LOP`,
        } as any);

        remaining -= toDeduct;
      }
    }

    const empName = employee.firstName && employee.lastName ? `${employee.firstName} ${employee.lastName}` : employee.username;

    res.json({
      success: true,
      trialRunNo: newRecord.trialRunNo,
      recordId: newRecord.id,
      employee: empName,
      period: period.periodName,
      calculationEngineVersion: coreResult.engineVersion,
      grossPay: coreResult.grossPay.toFixed(2),
      totalDeductions: finalTotalDeductions.toFixed(2),
      netPay: finalNetPay.toFixed(2),
      attendance: {
        daysInMonth: calendarDays,
        workingDays: totalWorkingDays,
        presentDays: presentDays,
        halfDays: presentHalf,
        paidLeaveDays,
        unpaidLeaveDays,
        lopDays,
        balanceCoveredDays,
        paidDays: coreResult.paidDays,
        weeklyOffs: weekOffCount,
        holidays: holidayDates.size,
        lwpExemptApplied,
      },
      deductions: {
        pf: coreResult.employeePF.toFixed(2),
        esic: coreResult.employeeESIC.toFixed(2),
        pt: coreResult.professionalTax.toFixed(2),
        tds: tdsAmount.toFixed(2),
        loanDeductions: coreResult.loanDeductions.toFixed(2),
        advanceDeductions: coreResult.advanceDeductions.toFixed(2),
      },
      breakdown: {
        paidDays: coreResult.paidDays,
        lopDays,
        proratedBase: coreResult.proratedBase,
        hra: coreResult.hra,
        conv: coreResult.conv,
        lta: coreResult.lta,
        specialAllowance: coreResult.specialAllowance,
        supplementaryAllowance: coreResult.supplementaryAllowance,
        kgpAllowance: coreResult.kgpAllowance,
        kgpCeiling: trialKpiSnapshot?.kgpCeiling ?? null,
        compositeKpiPercent: trialKpiSnapshot?.compositeKpiPercent ?? null,
        kpiDwarMatched: trialKpiSnapshot?.dwarDaysMatched ?? null,
        kpiPaidDays: trialKpiSnapshot?.paidAttendanceDays ?? null,
        bonusAllowance: coreResult.bonusAllowance,
        overtimePay: coreResult.overtimePay,
        employeePF: coreResult.employeePF,
        employeeESIC: coreResult.employeeESIC,
        professionalTax: coreResult.professionalTax,
        gratuity: coreResult.gratuity,
        loanDeductions: coreResult.loanDeductions,
        advanceDeductions: coreResult.advanceDeductions,
        tdsAmount,
        loanBreakdown: coreResult.loanBreakdown,
        advanceBreakdown: coreResult.advanceBreakdown,
      },
      reproducibilityNote: calculationSnapshot.reproducibilityNote,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payroll/trial/history/:periodId/:userId
 * List all trial runs for an employee in a period with data freshness indicators.
 */
router.get('/trial/history/:periodId/:userId', async (req: Request, res: Response) => {
  try {
    const executedBy = requireTrialRole(req, res);
    if (!executedBy) return;
    const periodId = parseInt(req.params.periodId);
    const userId = parseInt(req.params.userId);

    const trials = await db.select()
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.userId, userId),
        eq(payrollRecords.recordType, 'trial'),
      ))
      .orderBy(asc(payrollRecords.trialRunNo));

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));

    const result = await Promise.all(trials.map(async (t) => {
      let dataFreshness: 'current' | 'stale' = 'current';
      const stalenessReasons: string[] = [];
      const trialCreatedAt = t.createdAt;

      if (trialCreatedAt && period) {
        const [attDrift] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(attendanceRecords)
          .where(and(
            eq(attendanceRecords.userId, userId),
            gte(attendanceRecords.date, period.startDate),
            lte(attendanceRecords.date, period.endDate),
            sql`${attendanceRecords.updatedAt} > ${trialCreatedAt}`,
          ));
        if ((attDrift?.count ?? 0) > 0) {
          dataFreshness = 'stale';
          stalenessReasons.push(`Attendance updated after this trial`);
        }

        const [leaveDrift] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(leaveRequests)
          .where(and(
            eq(leaveRequests.employeeId, userId),
            eq(leaveRequests.status, 'approved'),
            lte(leaveRequests.startDate, period.endDate),
            gte(leaveRequests.endDate, period.startDate),
            sql`${leaveRequests.updatedAt} > ${trialCreatedAt}`,
          ));
        if ((leaveDrift?.count ?? 0) > 0) {
          dataFreshness = 'stale';
          stalenessReasons.push(`Leave records updated after this trial`);
        }
      }

      return {
        id: t.id,
        trialRunNo: t.trialRunNo,
        trialStatus: t.trialStatus,
        calculationEngineVersion: t.calculationEngineVersion,
        grossPay: t.grossPay,
        netPay: t.netPay,
        totalDeductions: t.totalDeductions,
        professionalTax: t.professionalTax,
        sapDocEntry: t.sapDocEntry,
        sapJeNumber: t.sapJeNumber,
        sapPostedAt: t.sapPostedAt,
        reversalSapDocEntry: t.reversalSapDocEntry,
        reversedAt: t.reversedAt,
        createdAt: t.createdAt,
        dataFreshness,
        stalenessReasons,
      };
    }));

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payroll/trial/:recordId/cancel
 * Cancel a trial record in 'generated' state.
 */
router.post('/trial/:recordId/cancel', async (req: Request, res: Response) => {
  try {
    const executedBy = requireTrialRole(req, res);
    if (!executedBy) return;
    const recordId = parseInt(req.params.recordId);

    const [record] = await db.select().from(payrollRecords)
      .where(and(eq(payrollRecords.id, recordId), eq(payrollRecords.recordType, 'trial')));
    if (!record) return res.status(404).json({ error: 'Trial record not found' });
    if (record.trialStatus !== 'generated') {
      return res.status(409).json({ error: `Cannot cancel trial in status: ${record.trialStatus}. Only 'generated' trials may be cancelled.` });
    }

    // Reverse any auto-cover deductions applied by this trial
    const trialCovers = await db
      .select()
      .from(payrollLeaveAutocover)
      .where(and(
        eq(payrollLeaveAutocover.payrollRecordId, recordId),
        eq(payrollLeaveAutocover.status, 'applied')
      ));

    for (const cover of trialCovers) {
      const daysToRestore = parseFloat(cover.daysDeducted?.toString() || '0');
      if (daysToRestore > 0) {
        const [period] = await db.select({ startDate: payrollPeriods.startDate })
          .from(payrollPeriods)
          .where(eq(payrollPeriods.id, cover.periodId));
        const coverYear = period ? new Date(period.startDate).getFullYear() : new Date().getFullYear();
        await db.execute(sql`
          UPDATE leave_balances
          SET used_days = GREATEST(0, used_days::numeric - ${daysToRestore}::numeric),
              last_updated = NOW()
          WHERE user_id = ${cover.userId}
            AND leave_type_id = ${cover.leaveTypeId}
            AND year = ${coverYear}
        `);
      }
      await db
        .update(payrollLeaveAutocover)
        .set({ status: 'reversed', reversedAt: new Date() })
        .where(eq(payrollLeaveAutocover.id, cover.id));
    }

    await db.update(payrollRecords)
      .set({ trialStatus: 'cancelled', updatedAt: new Date() })
      .where(eq(payrollRecords.id, recordId));

    res.json({ success: true, message: `Trial #${record.trialRunNo} cancelled.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
