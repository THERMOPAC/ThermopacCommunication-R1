import { Router } from 'express';
import { db } from './db';
import { 
  employeeSalaries, 
  payrollPeriods, 
  payrollRecords, 
  payrollSettings, 
  bonusRules, 
  payrollApprovals,
  dailyWorkReports,
  attendanceRecords,
  users,
  tasks,
  payrollLocks,
  payrollLockExceptions,
  taxSlabs,
  employeeTaxDeclarations,
  employeeInvestmentProofs,
  tdsMonthlyRecords,
  insertEmployeeSalarySchema,
  insertPayrollPeriodSchema,
  insertPayrollRecordSchema,
  insertPayrollSettingSchema,
  insertBonusRuleSchema,
  insertPayrollApprovalSchema,
  insertTaxSlabSchema,
  insertEmployeeTaxDeclarationSchema,
  insertEmployeeInvestmentProofSchema,
} from '@shared/schema';
import { eq, and, gte, lte, desc, asc, sum, avg, count } from 'drizzle-orm';
import { z } from 'zod';
import {
  startPayrollRun,
  executeStep,
  transitionPeriodStatus,
  resetPayrollRun,
  getRunLog,
  getExceptions,
  resolveException,
  getAttendanceSnapshots,
  getSalarySnapshots,
  PIPELINE_STEPS,
} from './payroll-run-engine';
import {
  checkPayrollLock,
  createPayrollLock,
  unlockPayrollLock,
  getLocksForPeriod,
  createLockException,
  approveLockException,
  rejectLockException,
  closeLockException,
  getLockExceptions,
} from './payroll-lock-service';
import {
  computeAndSaveTdsForPeriod,
  getTdsRecordsForPeriod,
  getTdsRecordsForEmployee,
  getDefaultSlabs,
} from './tds-calculation-service';

const router = Router();

// Employee Salary Management
router.get('/employee-salaries', async (req, res) => {
  try {
    const salaries = await db
      .select({
        id: employeeSalaries.id,
        userId: employeeSalaries.userId,
        userName: users.username,
        userEmail: users.email,
        baseSalary: employeeSalaries.baseSalary,
        currency: employeeSalaries.currency,
        payFrequency: employeeSalaries.payFrequency,
        effectiveDate: employeeSalaries.effectiveDate,
        endDate: employeeSalaries.endDate,
        isActive: employeeSalaries.isActive,
        salaryGrade: employeeSalaries.salaryGrade,
        department: employeeSalaries.department,
        position: employeeSalaries.position,
        createdAt: employeeSalaries.createdAt,
      })
      .from(employeeSalaries)
      .leftJoin(users, eq(employeeSalaries.userId, users.id))
      .orderBy(desc(employeeSalaries.createdAt));

    res.json(salaries);
  } catch (error) {
    console.error('Error fetching employee salaries:', error);
    res.status(500).json({ error: 'Failed to fetch employee salaries' });
  }
});

router.post('/employee-salaries', async (req, res) => {
  try {
    const data = insertEmployeeSalarySchema.parse(req.body);
    
    // Mark previous salary records as inactive for this user
    await db
      .update(employeeSalaries)
      .set({ isActive: false, endDate: new Date().toISOString().split('T')[0] })
      .where(and(
        eq(employeeSalaries.userId, data.userId),
        eq(employeeSalaries.isActive, true)
      ));

    const [newSalary] = await db
      .insert(employeeSalaries)
      .values(data)
      .returning();

    res.status(201).json(newSalary);
  } catch (error) {
    console.error('Error creating employee salary:', error);
    res.status(500).json({ error: 'Failed to create employee salary' });
  }
});

// Payroll Periods Management
router.get('/payroll-periods', async (req, res) => {
  try {
    const periods = await db
      .select()
      .from(payrollPeriods)
      .orderBy(desc(payrollPeriods.createdAt));

    res.json(periods);
  } catch (error) {
    console.error('Error fetching payroll periods:', error);
    res.status(500).json({ error: 'Failed to fetch payroll periods' });
  }
});

router.post('/payroll-periods', async (req, res) => {
  try {
    const data = insertPayrollPeriodSchema.parse(req.body);
    
    const [newPeriod] = await db
      .insert(payrollPeriods)
      .values(data)
      .returning();

    res.status(201).json(newPeriod);
  } catch (error) {
    console.error('Error creating payroll period:', error);
    res.status(500).json({ error: 'Failed to create payroll period' });
  }
});

router.post('/payroll-periods/generate-year', async (req, res) => {
  try {
    const { year } = req.body;
    const targetYear = parseInt(year);
    if (!targetYear || targetYear < 2020 || targetYear > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const existing = await db.select().from(payrollPeriods)
      .where(and(
        gte(payrollPeriods.startDate, `${targetYear}-01-01`),
        lte(payrollPeriods.startDate, `${targetYear}-12-31`)
      ));

    const existingMonths = new Set(existing.map(p => new Date(p.startDate).getMonth() + 1));
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    let created = 0;
    const periods: any[] = [];

    for (let month = 1; month <= 12; month++) {
      if (existingMonths.has(month)) continue;

      const lastDay = new Date(targetYear, month, 0).getDate();
      const startDate = `${targetYear}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${targetYear}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const payDate = month === 12
        ? `${targetYear + 1}-01-01`
        : `${targetYear}-${String(month + 1).padStart(2, '0')}-01`;

      const [p] = await db.insert(payrollPeriods).values({
        periodName: `${monthNames[month - 1]} ${targetYear}`,
        startDate,
        endDate,
        payDate,
        status: 'draft',
      }).returning();

      periods.push(p);
      created++;
    }

    res.json({ message: `Created ${created} periods for ${targetYear}`, created, skipped: 12 - created, periods });
  } catch (error: any) {
    console.error('Error generating year periods:', error);
    res.status(500).json({ error: error.message });
  }
});

// [DEPRECATED] Legacy payroll generation endpoint — uses flat-rate deductions instead of the 6-step pipeline.
// Disabled 2026-03-17. Use POST /run/start + POST /run/step pipeline instead.
// Kept for reference only — do not re-enable without review.
router.post('/generate-payroll/:periodId', async (_req, res) => {
  return res.status(410).json({
    error: 'This endpoint is deprecated. Use the Payroll Run Engine pipeline (POST /api/payroll/run/start) instead.',
    deprecated: true,
    deprecatedAt: '2026-03-17',
    replacement: 'POST /api/payroll/run/start + POST /api/payroll/run/step',
  });
});

// Get Payroll Records for a Period
router.get('/payroll-records/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    
    const records = await db
      .select({
        id: payrollRecords.id,
        userId: payrollRecords.userId,
        userName: users.username,
        userEmail: users.email,
        baseSalary: payrollRecords.baseSalary,
        productivityBonus: payrollRecords.productivityBonus,
        attendanceBonus: payrollRecords.attendanceBonus,
        taskCompletionBonus: payrollRecords.taskCompletionBonus,
        satisfactionBonus: payrollRecords.satisfactionBonus,
        grossPay: payrollRecords.grossPay,
        totalDeductions: payrollRecords.totalDeductions,
        netPay: payrollRecords.netPay,
        dwarProductivityScore: payrollRecords.dwarProductivityScore,
        attendancePercentage: payrollRecords.attendancePercentage,
        tasksCompleted: payrollRecords.tasksCompleted,
        averageSatisfactionRating: payrollRecords.averageSatisfactionRating,
        status: payrollRecords.status,
        paymentDate: payrollRecords.paymentDate,
        paymentReference: payrollRecords.paymentReference,
      })
      .from(payrollRecords)
      .leftJoin(users, eq(payrollRecords.userId, users.id))
      .where(eq(payrollRecords.periodId, periodId))
      .orderBy(asc(users.username));

    res.json(records);
  } catch (error) {
    console.error('Error fetching payroll records:', error);
    res.status(500).json({ error: 'Failed to fetch payroll records' });
  }
});

// Payroll Settings Management
router.get('/settings', async (req, res) => {
  try {
    const settings = await db
      .select()
      .from(payrollSettings)
      .where(eq(payrollSettings.isActive, true))
      .orderBy(asc(payrollSettings.settingName));

    res.json(settings);
  } catch (error) {
    console.error('Error fetching payroll settings:', error);
    res.status(500).json({ error: 'Failed to fetch payroll settings' });
  }
});

router.put('/settings/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { settingValue } = req.body;
    
    const [updatedSetting] = await db
      .update(payrollSettings)
      .set({
        settingValue,
        updatedAt: new Date(),
        updatedBy: req.user?.id,
      })
      .where(eq(payrollSettings.id, id))
      .returning();

    res.json(updatedSetting);
  } catch (error) {
    console.error('Error updating payroll setting:', error);
    res.status(500).json({ error: 'Failed to update payroll setting' });
  }
});

// Bonus Rules Management
router.get('/bonus-rules', async (req, res) => {
  try {
    const rules = await db
      .select()
      .from(bonusRules)
      .orderBy(asc(bonusRules.ruleType), asc(bonusRules.minThreshold));

    res.json(rules);
  } catch (error) {
    console.error('Error fetching bonus rules:', error);
    res.status(500).json({ error: 'Failed to fetch bonus rules' });
  }
});

router.post('/bonus-rules', async (req, res) => {
  try {
    const data = insertBonusRuleSchema.parse(req.body);
    
    const [newRule] = await db
      .insert(bonusRules)
      .values(data)
      .returning();

    res.status(201).json(newRule);
  } catch (error) {
    console.error('Error creating bonus rule:', error);
    res.status(500).json({ error: 'Failed to create bonus rule' });
  }
});

// Helper function to calculate KPI metrics
async function calculateKPIMetrics(userId: number, startDate: Date, endDate: Date) {
  // Get DWAR data for the period
  const dwarReports = await db
    .select({
      id: dailyWorkReports.id,
      plannedHours: dailyWorkReports.plannedHours,
      actualHours: dailyWorkReports.actualHours,
      satisfactionLevel: dailyWorkReports.satisfactionLevel,
      tasksCompleted: dailyWorkReports.tasksCompleted,
    })
    .from(dailyWorkReports)
    .where(and(
      eq(dailyWorkReports.userId, userId),
      gte(dailyWorkReports.reportDate, startDate),
      lte(dailyWorkReports.reportDate, endDate)
    ));

  // Get attendance data for the period
  const attendanceData = await db
    .select({
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .where(and(
      eq(attendanceRecords.userId, userId),
      gte(attendanceRecords.date, startDate),
      lte(attendanceRecords.date, endDate)
    ));

  // Calculate metrics
  const totalPlannedHours = dwarReports.reduce((sum, report) => sum + (parseFloat(report.plannedHours) || 0), 0);
  const totalActualHours = dwarReports.reduce((sum, report) => sum + (parseFloat(report.actualHours) || 0), 0);
  const productivityScore = totalPlannedHours > 0 ? (totalActualHours / totalPlannedHours) * 100 : 0;

  const totalWorkingDays = attendanceData.length;
  const presentDays = attendanceData.filter(record => record.status === 'present' || record.status === 'half_day').length;
  const attendancePercentage = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;

  const totalTasksCompleted = dwarReports.reduce((sum, report) => sum + (report.tasksCompleted || 0), 0);

  const satisfactionRatings = dwarReports.filter(report => report.satisfactionLevel).map(report => parseFloat(report.satisfactionLevel!));
  const avgSatisfaction = satisfactionRatings.length > 0 
    ? satisfactionRatings.reduce((sum, rating) => sum + rating, 0) / satisfactionRatings.length 
    : 0;

  return {
    productivityScore: Math.min(productivityScore, 100),
    attendancePercentage: Math.min(attendancePercentage, 100),
    tasksCompleted: totalTasksCompleted,
    avgSatisfaction,
  };
}

// Helper function to calculate bonuses
function calculateBonuses(kpiMetrics: any, rules: any[], baseSalary: number) {
  const bonuses = {
    productivity: 0,
    attendance: 0,
    taskCompletion: 0,
    satisfaction: 0,
    total: 0,
  };

  rules.forEach(rule => {
    let qualifies = false;
    let value = 0;

    switch (rule.ruleType) {
      case 'productivity':
        value = kpiMetrics.productivityScore;
        break;
      case 'attendance':
        value = kpiMetrics.attendancePercentage;
        break;
      case 'task_completion':
        value = kpiMetrics.tasksCompleted;
        break;
      case 'satisfaction':
        value = kpiMetrics.avgSatisfaction;
        break;
    }

    qualifies = value >= parseFloat(rule.minThreshold) && 
                (!rule.maxThreshold || value <= parseFloat(rule.maxThreshold));

    if (qualifies) {
      const bonusAmount = rule.isPercentage 
        ? (baseSalary * parseFloat(rule.bonusPercentage)) / 100
        : parseFloat(rule.fixedAmount);

      bonuses[rule.ruleType as keyof typeof bonuses] += bonusAmount;
    }
  });

  bonuses.total = bonuses.productivity + bonuses.attendance + bonuses.taskCompletion + bonuses.satisfaction;
  return bonuses;
}

// Helper function to calculate deductions
function calculateDeductions(baseSalary: number, settings: Record<string, string>) {
  const incomeTaxRate = parseFloat(settings.income_tax_rate || '10') / 100;
  const professionalTaxRate = parseFloat(settings.professional_tax_rate || '2.5') / 100;
  const providentFundRate = parseFloat(settings.provident_fund_rate || '12') / 100;
  const esiRate = parseFloat(settings.esi_rate || '1.75') / 100;

  const incomeTax = baseSalary * incomeTaxRate;
  const professionalTax = baseSalary * professionalTaxRate;
  const providentFund = baseSalary * providentFundRate;
  const esi = baseSalary * esiRate;

  return {
    incomeTax,
    professionalTax,
    providentFund,
    esi,
    total: incomeTax + professionalTax + providentFund + esi,
  };
}

// ============================================================================
// PAYROLL RUN ENGINE ENDPOINTS
// ============================================================================

router.get('/pipeline-steps', (_req, res) => {
  res.json(PIPELINE_STEPS);
});

router.post('/run/start', async (req, res) => {
  try {
    const { periodId } = req.body;
    const executedBy = req.user?.id || 1;
    const result = await startPayrollRun(periodId, executedBy);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/step', async (req, res) => {
  try {
    const { periodId, runNumber, step } = req.body;
    const executedBy = req.user?.id || 1;
    const result = await executeStep(periodId, runNumber, step, executedBy);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/transition', async (req, res) => {
  try {
    const { periodId, newStatus } = req.body;
    const userId = req.user?.id || 1;
    const result = await transitionPeriodStatus(periodId, newStatus, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/reset', async (req, res) => {
  try {
    const { periodId, reason } = req.body;
    const userId = req.user?.id || 1;
    const result = await resetPayrollRun(periodId, userId, reason);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/single-user', async (req, res) => {
  try {
    const { periodId, userId } = req.body;
    const executedBy = req.user?.id || 1;

    if (!periodId || !userId) {
      return res.status(400).json({ error: 'periodId and userId are required' });
    }

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
    if (!period) return res.status(404).json({ error: 'Period not found' });

    const [salaryConfig] = await db.select().from(employeeSalaries)
      .where(and(eq(employeeSalaries.userId, userId), eq(employeeSalaries.isActive, true)))
      .limit(1);
    if (!salaryConfig) return res.status(400).json({ error: 'No active salary configuration for this user' });

    const [employee] = await db.select().from(users).where(eq(users.id, userId));
    if (!employee) return res.status(404).json({ error: 'User not found' });

    await db.delete(payrollRecords).where(
      and(eq(payrollRecords.periodId, periodId), eq(payrollRecords.userId, userId))
    );

    const { computeMonthlyTds, saveTdsRecord } = await import('./tds-calculation-service');

    const startDate = period.startDate;
    const endDate = period.endDate;

    const { companyHolidays, attendanceRecords: attRecords, workweekPolicies, payrollAttendanceSnapshot, payrollSalarySnapshot, payrollRecords: payrollRecs, loanDeductions, advanceDeductions, employeeLoans, salaryAdvances } = await import('@shared/schema');
    const { between, ne } = await import('drizzle-orm');

    const holidays = await db.select({ date: companyHolidays.date })
      .from(companyHolidays)
      .where(between(companyHolidays.date, startDate, endDate));
    const holidayDates = new Set(holidays.map(h => String(h.date)));

    let workingDayNums = [1, 2, 3, 4, 5, 6];
    if (employee.workLocationId) {
      const [locPolicy] = await db.select().from(workweekPolicies)
        .where(and(eq(workweekPolicies.policyType, 'location'), eq(workweekPolicies.locationId, employee.workLocationId), eq(workweekPolicies.isActive, true)))
        .orderBy(desc(workweekPolicies.createdAt)).limit(1);
      if (locPolicy?.workingDays && Array.isArray(locPolicy.workingDays)) workingDayNums = locPolicy.workingDays as number[];
    }

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    let totalWorkingDays = 0;
    const cur = new Date(sDate);
    while (cur <= eDate) {
      const dayOfWeek = cur.getDay();
      const dateStr = cur.toISOString().split('T')[0];
      if (workingDayNums.includes(dayOfWeek) && !holidayDates.has(dateStr)) totalWorkingDays++;
      cur.setDate(cur.getDate() + 1);
    }

    const daysInMonth = Math.round((eDate.getTime() - sDate.getTime()) / (86400000)) + 1;
    const weeklyOffs = (employee.weeklyOffDays || [0, 6]);
    let weekOffCount = 0;
    const cur2 = new Date(sDate);
    while (cur2 <= eDate) {
      if (weeklyOffs.includes(cur2.getDay())) weekOffCount++;
      cur2.setDate(cur2.getDate() + 1);
    }

    const attRecordsDb = await db.select().from(attRecords)
      .where(and(eq(attRecords.userId, userId), gte(attRecords.date, startDate), lte(attRecords.date, endDate)));

    const presentFull = attRecordsDb.filter(r => r.status === 'present').length;
    const presentHalf = attRecordsDb.filter(r => r.status === 'half_day').length;
    const absentCount = totalWorkingDays - presentFull - presentHalf;
    const paidDays = presentFull + (presentHalf * 0.5) + weekOffCount + holidayDates.size;

    const sal = salaryConfig;
    const basic = parseFloat(sal.basicSalary || '0');
    const hra = parseFloat(sal.houseRentAllowance || '0');
    const conv = parseFloat(sal.conveyance || '0');
    const lta = parseFloat(sal.lta || '0');
    const special = parseFloat(sal.specialAllowance || '0');
    const supp = parseFloat(sal.supplementaryAllowance || '0');
    const kgp = parseFloat(sal.kgpAllowance || '0');
    const bonus = parseFloat(sal.bonus || '0');
    const ratio = paidDays / daysInMonth;

    const earnBasic = Math.round(basic * ratio * 100) / 100;
    const earnHra = Math.round(hra * ratio * 100) / 100;
    const earnConv = Math.round(conv * ratio * 100) / 100;
    const earnLta = Math.round(lta * ratio * 100) / 100;
    const earnSpecial = Math.round(special * ratio * 100) / 100;
    const earnSupp = Math.round(supp * ratio * 100) / 100;
    const earnKgp = Math.round(kgp * ratio * 100) / 100;
    const earnBonus = Math.round(bonus * ratio * 100) / 100;
    const grossPay = earnBasic + earnHra + earnConv + earnLta + earnSpecial + earnSupp + earnKgp + earnBonus;

    const pfBase = Math.min(earnBasic, 15000);
    const empPf = Math.round(pfBase * 0.12 * 100) / 100;
    const emplrPf = Math.round(pfBase * 0.12 * 100) / 100;

    let empEsic = 0, emplrEsic = 0;
    if (grossPay <= 21000) {
      empEsic = Math.round(grossPay * 0.0075 * 100) / 100;
      emplrEsic = Math.round(grossPay * 0.0325 * 100) / 100;
    }

    let pt = 0;
    if (grossPay > 10000) pt = 300;
    else if (grossPay > 7500) pt = 175;

    const gratuity = Math.round((earnBasic * 15 / 26) / 12 * 100) / 100;
    const groupIns = parseFloat(sal.groupInsurance || '0');

    let loanDed = 0;
    let advDed = 0;
    try {
      const activeLoans = await db.select().from(employeeLoans)
        .where(and(eq(employeeLoans.userId, userId), eq(employeeLoans.status, 'active')));
      for (const loan of activeLoans) {
        const pending = await db.select().from(loanDeductions)
          .where(and(eq(loanDeductions.loanId, loan.id), eq(loanDeductions.status, 'pending')))
          .orderBy(asc(loanDeductions.dueDate)).limit(1);
        if (pending.length > 0) loanDed += parseFloat(pending[0].amount);
      }
      const activeAdvances = await db.select().from(salaryAdvances)
        .where(and(eq(salaryAdvances.userId, userId), eq(salaryAdvances.status, 'approved')));
      for (const adv of activeAdvances) {
        const pending = await db.select().from(advanceDeductions)
          .where(and(eq(advanceDeductions.advanceId, adv.id), eq(advanceDeductions.status, 'pending')))
          .orderBy(asc(advanceDeductions.dueDate)).limit(1);
        if (pending.length > 0) advDed += parseFloat(pending[0].amount);
      }
    } catch {}

    const totalDeductions = empPf + pt + empEsic;
    const netPay = grossPay - totalDeductions - loanDed - advDed;

    const ctcMonthly = grossPay + emplrPf + emplrEsic + gratuity + groupIns;

    const [record] = await db.insert(payrollRecs).values({
      periodId,
      userId,
      basicSalary: earnBasic.toFixed(2),
      houseRentAllowance: earnHra.toFixed(2),
      conveyanceAllowance: earnConv.toFixed(2),
      lta: earnLta.toFixed(2),
      specialAllowance: earnSpecial.toFixed(2),
      supplementaryAllowance: earnSupp.toFixed(2),
      kgpAllowance: earnKgp.toFixed(2),
      bonus: earnBonus.toFixed(2),
      grossPay: grossPay.toFixed(2),
      employeePf: empPf.toFixed(2),
      providentFund: empPf.toFixed(2),
      employerPf: emplrPf.toFixed(2),
      employeeEsic: empEsic.toFixed(2),
      employerEsic: emplrEsic.toFixed(2),
      esic: empEsic.toFixed(2),
      professionalTax: pt.toFixed(2),
      gratuity: gratuity.toFixed(2),
      groupInsurance: groupIns.toFixed(2),
      loanDeductions: loanDed.toFixed(2),
      advanceDeductions: advDed.toFixed(2),
      incomeTax: '0',
      tdsAmount: '0',
      totalDeductions: totalDeductions.toFixed(2),
      netPay: netPay.toFixed(2),
      ctcMonthly: ctcMonthly.toFixed(2),
      ctcYearly: (ctcMonthly * 12).toFixed(2),
      daysInMonth: daysInMonth.toString(),
      paidDays: paidDays.toFixed(1),
      presentDays: presentFull.toString(),
      absentDays: absentCount.toFixed(1),
      weeklyOffs: weekOffCount.toString(),
      holidays: holidayDates.size.toString(),
      workingDays: totalWorkingDays.toString(),
      halfDays: presentHalf.toString(),
      status: 'generated',
      createdBy: executedBy,
    } as any).returning();

    const endDateObj = new Date(endDate);
    const month = endDateObj.getMonth() + 1;
    const year = endDateObj.getFullYear();
    const tdsResult = await computeMonthlyTds(userId, periodId, month, year, grossPay);
    await saveTdsRecord(userId, periodId, month, year, tdsResult);

    const tds = tdsResult.tdsActualMonthly;
    const finalDeductions = totalDeductions + tds;
    const finalNet = grossPay - finalDeductions - loanDed - advDed;

    await db.update(payrollRecs).set({
      incomeTax: tds.toFixed(2),
      tdsAmount: tds.toFixed(2),
      totalDeductions: finalDeductions.toFixed(2),
      netPay: finalNet.toFixed(2),
    }).where(eq(payrollRecs.id, record.id));

    res.json({
      success: true,
      employee: employee.username,
      period: period.periodName,
      grossPay: grossPay.toFixed(2),
      tds: tds.toFixed(2),
      totalDeductions: finalDeductions.toFixed(2),
      netPay: finalNet.toFixed(2),
      attendance: { daysInMonth, totalWorkingDays, present: presentFull, halfDays: presentHalf, absent: absentCount, paidDays, weeklyOffs: weekOffCount, holidays: holidayDates.size },
      tdsDetails: { regime: tdsResult.regime, projectedAnnual: tdsResult.grossSalaryProjected, taxableIncome: tdsResult.taxableIncomeProjected, annualTax: tdsResult.totalTaxLiabilityAnnual },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/run/log/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const runNumber = req.query.runNumber ? parseInt(req.query.runNumber as string) : undefined;
    const logs = await getRunLog(periodId, runNumber);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/run/exceptions/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const runNumber = req.query.runNumber ? parseInt(req.query.runNumber as string) : undefined;
    const exceptions = await getExceptions(periodId, runNumber);
    res.json(exceptions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/run/exceptions/:id/resolve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { resolution, notes } = req.body;
    const userId = req.user?.id || 1;
    const result = await resolveException(id, userId, resolution, notes);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/run/snapshots/attendance/:periodId/:runNumber', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const runNumber = parseInt(req.params.runNumber);
    const snapshots = await getAttendanceSnapshots(periodId, runNumber);
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/run/snapshots/salary/:periodId/:runNumber', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const runNumber = parseInt(req.params.runNumber);
    const snapshots = await getSalarySnapshots(periodId, runNumber);
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PAYROLL LOCK ENDPOINTS
// ============================================================================

router.get('/locks/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const locks = await getLocksForPeriod(periodId);
    res.json(locks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/locks', async (req, res) => {
  try {
    const { periodId, lockType, lockReason } = req.body;
    const userId = req.user?.id || 1;
    const lock = await createPayrollLock(periodId, lockType, userId, lockReason);
    res.json(lock);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/:id/unlock', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;
    const userId = req.user?.id || 1;
    const result = await unlockPayrollLock(id, userId, reason);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/check', async (req, res) => {
  try {
    const { module, effectiveDate, userId } = req.body;
    const result = await checkPayrollLock(module, effectiveDate, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/locks/:lockId/exceptions', async (req, res) => {
  try {
    const lockId = parseInt(req.params.lockId);
    const exceptions = await getLockExceptions(lockId);
    res.json(exceptions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/locks/exceptions', async (req, res) => {
  try {
    const { lockId, userId, reason } = req.body;
    const requestedBy = req.user?.id || 1;
    const result = await createLockException({ lockId, userId, reason, requestedBy });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/exceptions/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { expiresAt } = req.body;
    const userId = req.user?.id || 1;
    const result = await approveLockException(id, userId, expiresAt ? new Date(expiresAt) : undefined);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/exceptions/:id/reject', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || 1;
    const result = await rejectLockException(id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/exceptions/:id/close', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { changesDescription } = req.body;
    const userId = req.user?.id || 1;
    const result = await closeLockException(id, userId, changesDescription);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// INCOME TAX / TDS ENGINE ENDPOINTS
// ============================================================================

router.get('/tax-slabs', async (req, res) => {
  try {
    const financialYear = req.query.fy as string;
    const conditions = [eq(taxSlabs.isActive, true)];
    if (financialYear) conditions.push(eq(taxSlabs.financialYear, financialYear));

    const slabs = await db.select().from(taxSlabs)
      .where(and(...conditions))
      .orderBy(asc(taxSlabs.regime), asc(taxSlabs.slabOrder));

    res.json(slabs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tax-slabs', async (req, res) => {
  try {
    const data = insertTaxSlabSchema.parse(req.body);
    const [slab] = await db.insert(taxSlabs).values(data).returning();
    res.status(201).json(slab);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/tax-slabs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { rate, cessRate, surchargeRate, standardDeduction, section87aRebateLimit, isActive } = req.body;
    const [updated] = await db.update(taxSlabs).set({
      rate, cessRate, surchargeRate, standardDeduction, section87aRebateLimit, isActive,
      updatedAt: new Date(),
    }).where(eq(taxSlabs.id, id)).returning();
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/tax-slabs/seed-defaults', async (req, res) => {
  try {
    const { financialYear } = req.body;
    await getDefaultSlabs(financialYear || '2025-26');
    const slabs = await db.select().from(taxSlabs)
      .where(and(eq(taxSlabs.financialYear, financialYear || '2025-26'), eq(taxSlabs.isActive, true)))
      .orderBy(asc(taxSlabs.regime), asc(taxSlabs.slabOrder));
    res.json({ message: 'Default slabs seeded', slabs });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/tax-slabs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(taxSlabs).set({ isActive: false }).where(eq(taxSlabs.id, id));
    res.json({ message: 'Slab deactivated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/tax-declarations', async (req, res) => {
  try {
    const financialYear = req.query.fy as string;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

    const conditions: any[] = [];
    if (financialYear) conditions.push(eq(employeeTaxDeclarations.financialYear, financialYear));
    if (userId) conditions.push(eq(employeeTaxDeclarations.userId, userId));

    const declarations = await db.select({
      id: employeeTaxDeclarations.id,
      userId: employeeTaxDeclarations.userId,
      userName: users.username,
      financialYear: employeeTaxDeclarations.financialYear,
      regime: employeeTaxDeclarations.regime,
      regimeLocked: employeeTaxDeclarations.regimeLocked,
      monthlyRentPaid: employeeTaxDeclarations.monthlyRentPaid,
      isMetroCity: employeeTaxDeclarations.isMetroCity,
      section80c: employeeTaxDeclarations.section80c,
      section80ccd1b: employeeTaxDeclarations.section80ccd1b,
      section80d: employeeTaxDeclarations.section80d,
      section80dParents: employeeTaxDeclarations.section80dParents,
      section80e: employeeTaxDeclarations.section80e,
      section80g: employeeTaxDeclarations.section80g,
      section80tta: employeeTaxDeclarations.section80tta,
      section24b: employeeTaxDeclarations.section24b,
      otherDeductions: employeeTaxDeclarations.otherDeductions,
      otherDeductionsDescription: employeeTaxDeclarations.otherDeductionsDescription,
      previousEmployerIncome: employeeTaxDeclarations.previousEmployerIncome,
      previousEmployerTds: employeeTaxDeclarations.previousEmployerTds,
      otherIncome: employeeTaxDeclarations.otherIncome,
      status: employeeTaxDeclarations.status,
      submittedAt: employeeTaxDeclarations.submittedAt,
      approvedAt: employeeTaxDeclarations.approvedAt,
      remarks: employeeTaxDeclarations.remarks,
      createdAt: employeeTaxDeclarations.createdAt,
    })
    .from(employeeTaxDeclarations)
    .leftJoin(users, eq(employeeTaxDeclarations.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(employeeTaxDeclarations.createdAt));

    res.json(declarations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tax-declarations', async (req, res) => {
  try {
    const data = insertEmployeeTaxDeclarationSchema.parse(req.body);
    const [decl] = await db.insert(employeeTaxDeclarations).values(data).returning();
    res.status(201).json(decl);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/tax-declarations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updateData = { ...req.body, updatedAt: new Date() };
    delete updateData.id;
    delete updateData.createdAt;

    if (updateData.status === 'submitted') {
      updateData.submittedAt = new Date();
    }

    const [updated] = await db.update(employeeTaxDeclarations)
      .set(updateData)
      .where(eq(employeeTaxDeclarations.id, id))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/tax-declarations/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || 1;
    const { remarks } = req.body;

    const [updated] = await db.update(employeeTaxDeclarations).set({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      remarks,
      updatedAt: new Date(),
    }).where(eq(employeeTaxDeclarations.id, id)).returning();

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/tax-declarations/:id/reject', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || 1;
    const { remarks } = req.body;

    const [updated] = await db.update(employeeTaxDeclarations).set({
      status: 'rejected',
      approvedBy: userId,
      approvedAt: new Date(),
      remarks,
      updatedAt: new Date(),
    }).where(eq(employeeTaxDeclarations.id, id)).returning();

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/investment-proofs/:declarationId', async (req, res) => {
  try {
    const declarationId = parseInt(req.params.declarationId);
    const proofs = await db.select().from(employeeInvestmentProofs)
      .where(eq(employeeInvestmentProofs.declarationId, declarationId));
    res.json(proofs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/investment-proofs', async (req, res) => {
  try {
    const data = insertEmployeeInvestmentProofSchema.parse(req.body);
    const [proof] = await db.insert(employeeInvestmentProofs).values(data).returning();
    res.status(201).json(proof);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/investment-proofs/:id/verify', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || 1;
    const { proofStatus, proofAmount, verificationNotes } = req.body;

    const [updated] = await db.update(employeeInvestmentProofs).set({
      proofStatus,
      proofAmount,
      verifiedBy: userId,
      verifiedAt: new Date(),
      verificationNotes,
    }).where(eq(employeeInvestmentProofs.id, id)).returning();

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/tds/compute/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const userId = req.user?.id || 1;
    const result = await computeAndSaveTdsForPeriod(periodId, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/tds/period/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const records = await getTdsRecordsForPeriod(periodId);
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tds/employee/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const fy = req.query.fy as string || '2025-26';
    const records = await getTdsRecordsForEmployee(userId, fy);
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;