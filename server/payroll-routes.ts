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
import { eq, and, gte, lte, desc, asc, sum, avg, count, inArray } from 'drizzle-orm';
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
    const { periodId, runNumber, step, includeNonSystem } = req.body;
    const executedBy = req.user?.id || 1;
    const result = await executeStep(periodId, runNumber, step, executedBy, includeNonSystem === true);
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

    const MONTHLY_DIVISOR = 30;

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
    if (!period) return res.status(404).json({ error: 'Period not found' });

    const [salaryConfig] = await db.select().from(employeeSalaries)
      .where(and(eq(employeeSalaries.userId, userId), eq(employeeSalaries.isActive, true)))
      .limit(1);
    if (!salaryConfig) return res.status(400).json({ error: 'No active salary configuration for this user' });

    const [employee] = await db.select().from(users).where(eq(users.id, userId));
    if (!employee) return res.status(404).json({ error: 'User not found' });

    const priorRecords = await db.select({ id: payrollRecords.id }).from(payrollRecords)
      .where(and(eq(payrollRecords.periodId, periodId), eq(payrollRecords.userId, userId)));

    for (const pr of priorRecords) {
      const priorLoanReps = await db.select().from(employeeLoanRepayments)
        .where(and(eq(employeeLoanRepayments.payrollRecordId, pr.id), inArray(employeeLoanRepayments.status, ['deducted', 'partial'])));
      for (const rep of priorLoanReps) {
        await db.update(employeeLoanRepayments).set({ status: 'reversed', reversedAt: new Date() })
          .where(eq(employeeLoanRepayments.id, rep.id));
        const [parentLoan] = await db.select().from(employeeLoans).where(eq(employeeLoans.id, rep.loanId));
        if (parentLoan) {
          const newRepaid = Math.max(0, parseFloat(parentLoan.totalRepaid || '0') - parseFloat(rep.amount));
          const newBalance = parseFloat(parentLoan.outstandingBalance || '0') + parseFloat(rep.amount);
          const newInstPaid = Math.max(0, (parentLoan.installmentsPaid || 0) - 1);
          await db.update(employeeLoans).set({
            totalRepaid: newRepaid.toFixed(2), outstandingBalance: newBalance.toFixed(2),
            installmentsPaid: newInstPaid, status: parentLoan.status === 'closed' ? 'active' : parentLoan.status, updatedAt: new Date(),
          }).where(eq(employeeLoans.id, rep.loanId));
        }
      }

      const priorAdvRecs = await db.select().from(employeeAdvanceRecoveries)
        .where(and(eq(employeeAdvanceRecoveries.payrollRecordId, pr.id), inArray(employeeAdvanceRecoveries.status, ['deducted', 'partial'])));
      for (const rec of priorAdvRecs) {
        await db.update(employeeAdvanceRecoveries).set({ status: 'reversed', reversedAt: new Date() })
          .where(eq(employeeAdvanceRecoveries.id, rec.id));
        const [parentAdv] = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, rec.advanceId));
        if (parentAdv) {
          const newRecovered = Math.max(0, parseFloat(parentAdv.totalRecovered || '0') - parseFloat(rec.amount));
          const newBalance = parseFloat(parentAdv.outstandingBalance || '0') + parseFloat(rec.amount);
          const newInstRec = Math.max(0, (parentAdv.installmentsRecovered || 0) - 1);
          await db.update(employeeAdvances).set({
            totalRecovered: newRecovered.toFixed(2), outstandingBalance: newBalance.toFixed(2),
            installmentsRecovered: newInstRec, status: parentAdv.status === 'closed' ? 'active' : parentAdv.status, updatedAt: new Date(),
          }).where(eq(employeeAdvances.id, rec.advanceId));
        }
      }
    }

    await db.delete(payrollRecords).where(
      and(eq(payrollRecords.periodId, periodId), eq(payrollRecords.userId, userId))
    );

    const { computeMonthlyTds, saveTdsRecord } = await import('./tds-calculation-service');

    const startDate = period.startDate;
    const endDate = period.endDate;

    const { companyHolidays, attendanceRecords: attRecords, workweekPolicies, payrollRecords: payrollRecs, employeeLoans, employeeAdvances, employeeLoanRepayments, employeeAdvanceRecoveries } = await import('@shared/schema');
    const { between } = await import('drizzle-orm');

    const holidays = await db.select({ date: companyHolidays.date })
      .from(companyHolidays)
      .where(between(companyHolidays.date, startDate, endDate));
    const holidayDates = new Set(holidays.map(h => String(h.date)));

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    const calendarDaysInPeriod = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;

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
    const lateDays = attRecordsDb.filter(r => r.status === 'late').length;
    const absentCount = attRecordsDb.filter(r => r.status === 'absent').length;
    const totalOT = attRecordsDb.reduce((sum, r) => sum + parseFloat(r.overtimeHours || '0'), 0);

    const salaryType = salaryConfig.salaryType || 'monthly';
    let lopDays: number;
    let paidDays: number;
    let presentDays: number;

    if (salaryType === 'daily') {
      presentDays = presentFull + lateDays + (presentHalf * 0.5);
      paidDays = presentDays;
      lopDays = 0;
    } else {
      const expectedWorkingDates: string[] = [];
      const iter = new Date(sDate);
      while (iter <= eDate) {
        if (!weeklyOffs.includes(iter.getDay())) {
          expectedWorkingDates.push(iter.toISOString().slice(0, 10));
        }
        iter.setDate(iter.getDate() + 1);
      }

      const attendanceDateSet = new Set(
        attRecordsDb.map(r => {
          const d = typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0, 10);
          return d.slice(0, 10);
        })
      );

      const missingCount = expectedWorkingDates.filter(d => !attendanceDateSet.has(d)).length;
      presentDays = presentFull + lateDays + (presentHalf * 0.5);
      lopDays = absentCount + (presentHalf * 0.5) + missingCount;
      paidDays = Math.max(MONTHLY_DIVISOR - lopDays, 0);
      if (paidDays > MONTHLY_DIVISOR) paidDays = MONTHLY_DIVISOR;
    }

    const totalWorkingDays = calendarDaysInPeriod - weekOffCount - holidayDates.size;

    const { leaveRequests, leaveTypes } = await import('@shared/schema');
    const allLeaveTypes = await db.select().from(leaveTypes);
    const paidTypeIds = new Set(allLeaveTypes.filter(lt => lt.isPaid).map(lt => lt.id));

    const leaves = await db.select().from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, userId),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.startDate, endDate),
        gte(leaveRequests.endDate, startDate)
      ));

    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    for (const leave of leaves) {
      const days = parseFloat(leave.totalDays);
      if (paidTypeIds.has(leave.leaveTypeId)) {
        paidLeaveDays += days;
      } else {
        unpaidLeaveDays += days;
      }
    }

    if (salaryType === 'daily') {
      paidDays = paidDays + paidLeaveDays;
    } else {
      const coveredByPaidLeave = Math.min(paidLeaveDays, lopDays);
      lopDays = Math.max(0, lopDays - coveredByPaidLeave);
      paidDays = Math.min(MONTHLY_DIVISOR - lopDays, MONTHLY_DIVISOR);
      paidLeaveDays = coveredByPaidLeave;
    }

    const sal = salaryConfig;
    const basic = parseFloat(sal.basicSalary || '0');
    const configHra = parseFloat(sal.houseRentAllowance || '0');
    const configConv = parseFloat(sal.conveyance || '0');
    const configLta = parseFloat(sal.lta || '0');
    const configSpec = parseFloat(sal.specialAllowance || '0');
    const configSupp = parseFloat(sal.supplementaryAllowance || '0');
    const configKgp = parseFloat(sal.kgpAllowance || '0');
    const configBonus = parseFloat(sal.bonus || '0');

    let earnBasic: number, earnHra: number, earnConv: number, earnLta: number;
    let earnSpecial: number, earnSupp: number, earnKgp: number, earnBonus: number;
    let grossPay: number, overtimePay = 0;

    if (salaryType === 'daily') {
      earnBasic = basic * paidDays;
      const hourlyRate = parseFloat(sal.hourlyRate || '0') || (basic / (sal.workingHoursPerDay || 8));
      const otRate = parseFloat(sal.otRate || '1.0');
      const otMultiplier = parseFloat(sal.otMultiplier || '1.0');
      overtimePay = hourlyRate * totalOT * otRate * otMultiplier;
      earnHra = 0; earnConv = 0; earnLta = 0; earnSpecial = 0; earnSupp = 0; earnKgp = 0;
      earnBonus = Math.round(earnBasic * 0.0833 * 100) / 100;
      grossPay = earnBasic + overtimePay;
    } else {
      const ratio = paidDays / MONTHLY_DIVISOR;
      earnBasic = Math.round(basic * ratio * 100) / 100;
      earnHra = Math.round(configHra * ratio * 100) / 100;
      earnConv = Math.round(configConv * ratio * 100) / 100;
      earnLta = Math.round(configLta * ratio * 100) / 100;
      earnSpecial = Math.round(configSpec * ratio * 100) / 100;
      earnSupp = Math.round(configSupp * ratio * 100) / 100;
      earnKgp = Math.round(configKgp * ratio * 100) / 100;
      earnBonus = configBonus > 0
        ? Math.round(configBonus * ratio * 100) / 100
        : Math.round(basic * 0.0833 * ratio * 100) / 100;
      grossPay = earnBasic + earnHra + earnConv + earnLta + earnSpecial + earnSupp + earnKgp;
    }

    const pfBase = Math.min(earnBasic, 15000);
    const empPf = pfBase * 0.12;
    const emplrPf = pfBase * 0.12;

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
    const periodEndDate = endDate;

    const statutoryDeductions = empPf + pt + empEsic;
    const availableForRecovery = grossPay - statutoryDeductions;

    const minTakeHomeSetting = await db.select().from(payrollSettings)
      .where(eq(payrollSettings.settingName, 'minimum_take_home'));
    const minimumTakeHome = minTakeHomeSetting.length > 0 ? parseFloat(minTakeHomeSetting[0].settingValue) : 10000;
    let remaining = Math.max(0, availableForRecovery - minimumTakeHome);

    const activeAdvances = await db.select().from(employeeAdvances)
      .where(and(
        eq(employeeAdvances.employeeId, userId),
        eq(employeeAdvances.status, 'active'),
        lte(employeeAdvances.startRecoveryDate, periodEndDate)
      )).orderBy(asc(employeeAdvances.createdAt));

    const advDeductions: { adv: any; actual: number; requested: number }[] = [];
    for (const adv of activeAdvances) {
      if (remaining <= 0) break;
      let requested: number;
      if (adv.recoveryType === 'lump_sum') {
        requested = parseFloat(adv.outstandingBalance || '0');
      } else {
        requested = Math.min(parseFloat(adv.recoveryAmount || '0'), parseFloat(adv.outstandingBalance || '0'));
      }
      const actual = Math.min(requested, remaining);
      if (actual > 0) { advDed += actual; remaining -= actual; advDeductions.push({ adv, actual, requested }); }
    }

    const activeLoans = await db.select().from(employeeLoans)
      .where(and(
        eq(employeeLoans.employeeId, userId),
        eq(employeeLoans.status, 'active'),
        lte(employeeLoans.startDeductionDate, periodEndDate)
      )).orderBy(asc(employeeLoans.createdAt));

    const emergencyLoans = activeLoans.filter(l => l.loanType === 'emergency');
    const otherLoans = activeLoans.filter(l => l.loanType !== 'emergency');
    const sortedLoans = [...emergencyLoans, ...otherLoans];

    const loanDeductions: { loan: any; actual: number; requested: number }[] = [];
    for (const loan of sortedLoans) {
      if (remaining <= 0) break;
      const requested = Math.min(parseFloat(loan.emiAmount || '0'), parseFloat(loan.outstandingBalance || '0'));
      const actual = Math.min(requested, remaining);
      if (actual > 0) { loanDed += actual; remaining -= actual; loanDeductions.push({ loan, actual, requested }); }
    }
    const totalDeductionsPreTds = statutoryDeductions + loanDed + advDed;
    const netPayPreTds = grossPay - totalDeductionsPreTds;

    const ctcMonthly = grossPay + emplrPf + emplrEsic + gratuity + groupIns + earnBonus;

    const [record] = await db.insert(payrollRecs).values({
      periodId,
      userId,
      baseSalary: earnBasic.toFixed(2),
      hra: earnHra.toFixed(2),
      conveyanceAllowance: earnConv.toFixed(2),
      ltaAllowance: earnLta.toFixed(2),
      specialAllowance: earnSpecial.toFixed(2),
      supplementaryAllowance: earnSupp.toFixed(2),
      kgpAllowance: earnKgp.toFixed(2),
      bonus: earnBonus.toFixed(2),
      overtimePay: overtimePay.toFixed(2),
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
      totalDeductions: totalDeductionsPreTds.toFixed(2),
      netPay: netPayPreTds.toFixed(2),
      workingDays: totalWorkingDays,
      paidDays: paidDays.toFixed(1),
      presentDays: presentDays.toFixed(1),
      paidLeaveDays: paidLeaveDays.toFixed(2),
      unpaidLeaveDays: unpaidLeaveDays.toFixed(2),
      lopDays: lopDays.toFixed(2),
      status: 'generated',
    } as any).returning();

    for (const { adv, actual, requested } of advDeductions) {
      const newBalance = parseFloat(adv.outstandingBalance || '0') - actual;
      const instNum = (adv.installmentsRecovered || 0) + 1;
      const status = actual < requested ? 'partial' : 'deducted';
      await db.insert(employeeAdvanceRecoveries).values({
        advanceId: adv.id, employeeId: userId, installmentNumber: instNum,
        amount: actual.toFixed(2), recoveryDate: periodEndDate, payrollRecordId: record.id,
        payrollPeriodId: periodId, runNumber: 1, balanceAfter: newBalance.toFixed(2), status,
      });
      await db.update(employeeAdvances).set({
        totalRecovered: (parseFloat(adv.totalRecovered || '0') + actual).toFixed(2),
        outstandingBalance: newBalance.toFixed(2), installmentsRecovered: instNum,
        status: newBalance <= 0 ? 'closed' : 'active', updatedAt: new Date(),
      }).where(eq(employeeAdvances.id, adv.id));
    }

    for (const { loan, actual, requested } of loanDeductions) {
      const newBalance = parseFloat(loan.outstandingBalance || '0') - actual;
      const instNum = (loan.installmentsPaid || 0) + 1;
      const status = actual < requested ? 'partial' : 'deducted';
      await db.insert(employeeLoanRepayments).values({
        loanId: loan.id, employeeId: userId, installmentNumber: instNum,
        amount: actual.toFixed(2), repaymentDate: periodEndDate, payrollRecordId: record.id,
        payrollPeriodId: periodId, runNumber: 1, balanceAfter: newBalance.toFixed(2), status,
      });
      await db.update(employeeLoans).set({
        totalRepaid: (parseFloat(loan.totalRepaid || '0') + actual).toFixed(2),
        outstandingBalance: newBalance.toFixed(2), installmentsPaid: instNum,
        status: newBalance <= 0 ? 'closed' : 'active', updatedAt: new Date(),
      }).where(eq(employeeLoans.id, loan.id));
    }

    const endDateObj = new Date(endDate);
    const month = endDateObj.getMonth() + 1;
    const year = endDateObj.getFullYear();
    const tdsResult = await computeMonthlyTds(userId, periodId, month, year, grossPay);
    await saveTdsRecord(userId, periodId, month, year, tdsResult);

    const tds = tdsResult.tdsActualMonthly;
    const finalDeductions = statutoryDeductions + tds + loanDed + advDed;
    const finalNet = grossPay - finalDeductions;

    await db.update(payrollRecs).set({
      incomeTax: tds.toFixed(2),
      tdsAmount: tds.toFixed(2),
      totalDeductions: finalDeductions.toFixed(2),
      netPay: finalNet.toFixed(2),
    }).where(eq(payrollRecs.id, record.id));

    const employeeName = employee.firstName && employee.lastName
      ? `${employee.firstName} ${employee.lastName}`
      : employee.username;

    const daysInMonth = calendarDaysInPeriod;

    res.json({
      success: true,
      employee: employeeName,
      period: period.periodName,
      grossPay: grossPay.toFixed(2),
      totalDeductions: finalDeductions.toFixed(2),
      netPay: finalNet.toFixed(2),
      loanDeductions: loanDed.toFixed(2),
      advanceDeductions: advDed.toFixed(2),
      attendance: { daysInMonth, workingDays: totalWorkingDays, presentDays, halfDays: presentHalf, absentDays: absentCount, paidDays, weeklyOffs: weekOffCount, holidays: holidayDates.size, lopDays, paidLeaveDays, unpaidLeaveDays },
      salary: { basic: earnBasic, hra: earnHra, conveyance: earnConv, lta: earnLta, specialAllowance: earnSpecial, supplementary: earnSupp, kgp: earnKgp, bonus: earnBonus, overtimePay },
      deductions: { pf: empPf, esic: empEsic, pt, tds, loanDeductions: loanDed, advanceDeductions: advDed },
      employer: { pf: emplrPf, esic: emplrEsic, gratuity, groupInsurance: groupIns, ctcMonthly },
      tds: { regime: tdsResult.regime, projectedAnnualIncome: tdsResult.grossSalaryProjected, taxableIncome: tdsResult.taxableIncomeProjected, annualTaxLiability: tdsResult.totalTaxLiabilityAnnual, monthlyTds: tds },
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