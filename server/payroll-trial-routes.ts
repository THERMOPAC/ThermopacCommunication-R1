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
  employeeLoans,
  employeeAdvances,
  users,
  companyHolidays,
} from '@shared/schema';
import { eq, and, gte, lte, desc, max, sql, asc, between } from 'drizzle-orm';
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

    const existingPostedTrial = await db.select({ id: payrollRecords.id, trialRunNo: payrollRecords.trialRunNo })
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.userId, userId),
        eq(payrollRecords.recordType, 'trial'),
        eq(payrollRecords.trialStatus, 'sap_posted'),
      ));
    if (existingPostedTrial.length > 0) {
      return res.status(409).json({
        error: `Trial #${existingPostedTrial[0].trialRunNo} is posted in SAP. Reverse it before running another trial.`,
        code: 'TRIAL_JE_UNREVERSED',
        trialRunNo: existingPostedTrial[0].trialRunNo,
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
    if (salaryType === 'daily') {
      paidDays += paidLeaveDays;
    } else {
      const covered = Math.min(paidLeaveDays, lopDays);
      lopDays = Math.max(0, lopDays - covered);
      paidLeaveDays = covered;

      // LWP Exemption — mirrors official run engine exactly
      // Superuser, GM, SM (and any explicit lwp_exempt grant) → zero out remaining LOP
      const exempt = await isLwpExempt(userId);
      if (exempt && lopDays > 0) {
        lwpExemptApplied = true;
        lopDays = 0;
      }

      paidDays = Math.min(PAYROLL_CONSTANTS.MONTHLY_DIVISOR - lopDays, PAYROLL_CONSTANTS.MONTHLY_DIVISOR);
    }

    // ── Statutory resolution ─────────────────────────────────────────────────
    const basicSalary = parseFloat(sal.basicSalary || sal.baseSalary || '0');
    const ratio = salaryType === 'monthly' ? Math.min(paidDays, PAYROLL_CONSTANTS.MONTHLY_DIVISOR) / PAYROLL_CONSTANTS.MONTHLY_DIVISOR : 1;
    const prelimGross = salaryType === 'daily'
      ? basicSalary * paidDays
      : basicSalary * ratio
        + parseFloat(sal.houseRentAllowance || '0') * ratio
        + parseFloat(sal.conveyance || '0') * ratio
        + parseFloat(sal.lta || '0') * ratio
        + parseFloat(sal.specialAllowance || '0') * ratio
        + parseFloat(sal.supplementaryAllowance || '0') * ratio
        + parseFloat(sal.kgpAllowance || '0') * ratio;

    const statutoryResult = resolveStatutoryApplicability({
      employeeType: (employee.employeeType as EmployeeType) || null,
      grossEarnings: prelimGross,
      hasEpfNumber: !!employee.epfNo,
      hasPfConfigured: true,
      role: employee.role,
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
      kgpAllowance: parseFloat(sal.kgpAllowance || '0'),
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

    await db.update(payrollRecords)
      .set({ trialStatus: 'cancelled', updatedAt: new Date() })
      .where(eq(payrollRecords.id, recordId));

    res.json({ success: true, message: `Trial #${record.trialRunNo} cancelled.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
