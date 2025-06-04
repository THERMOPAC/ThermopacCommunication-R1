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
  insertEmployeeSalarySchema,
  insertPayrollPeriodSchema,
  insertPayrollRecordSchema,
  insertPayrollSettingSchema,
  insertBonusRuleSchema,
  insertPayrollApprovalSchema
} from '@shared/schema';
import { eq, and, gte, lte, desc, asc, sum, avg, count } from 'drizzle-orm';
import { z } from 'zod';

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
      .set({ isActive: false, endDate: new Date() })
      .where(and(
        eq(employeeSalaries.userId, data.userId),
        eq(employeeSalaries.isActive, true)
      ));

    const [newSalary] = await db
      .insert(employeeSalaries)
      .values({
        ...data,
        createdBy: req.user?.id,
      })
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

// Generate Payroll Records for a Period
router.post('/generate-payroll/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    
    // Get the payroll period
    const [period] = await db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.id, periodId));

    if (!period) {
      return res.status(404).json({ error: 'Payroll period not found' });
    }

    // Get all active employee salaries
    const activeSalaries = await db
      .select({
        userId: employeeSalaries.userId,
        baseSalary: employeeSalaries.baseSalary,
        userName: users.username,
        userEmail: users.email,
      })
      .from(employeeSalaries)
      .leftJoin(users, eq(employeeSalaries.userId, users.id))
      .where(eq(employeeSalaries.isActive, true));

    // Get payroll settings
    const settings = await db.select().from(payrollSettings);
    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.settingName] = setting.settingValue;
      return acc;
    }, {} as Record<string, string>);

    // Get bonus rules
    const rules = await db
      .select()
      .from(bonusRules)
      .where(eq(bonusRules.isActive, true));

    const payrollRecordsToInsert = [];

    for (const salary of activeSalaries) {
      // Calculate KPI metrics for the period
      const kpiMetrics = await calculateKPIMetrics(salary.userId, period.startDate, period.endDate);
      
      // Calculate bonuses based on KPI and rules
      const bonuses = calculateBonuses(kpiMetrics, rules, parseFloat(salary.baseSalary));
      
      // Calculate deductions
      const deductions = calculateDeductions(parseFloat(salary.baseSalary), settingsMap);
      
      const grossPay = parseFloat(salary.baseSalary) + bonuses.total;
      const netPay = grossPay - deductions.total;

      payrollRecordsToInsert.push({
        periodId,
        userId: salary.userId,
        baseSalary: salary.baseSalary,
        productivityBonus: bonuses.productivity.toString(),
        attendanceBonus: bonuses.attendance.toString(),
        taskCompletionBonus: bonuses.taskCompletion.toString(),
        satisfactionBonus: bonuses.satisfaction.toString(),
        grossPay: grossPay.toString(),
        incomeTax: deductions.incomeTax.toString(),
        professionalTax: deductions.professionalTax.toString(),
        providentFund: deductions.providentFund.toString(),
        esiDeduction: deductions.esi.toString(),
        totalDeductions: deductions.total.toString(),
        netPay: netPay.toString(),
        dwarProductivityScore: kpiMetrics.productivityScore.toString(),
        attendancePercentage: kpiMetrics.attendancePercentage.toString(),
        tasksCompleted: kpiMetrics.tasksCompleted,
        averageSatisfactionRating: kpiMetrics.avgSatisfaction.toString(),
        status: 'draft',
      });
    }

    // Insert all payroll records
    const insertedRecords = await db
      .insert(payrollRecords)
      .values(payrollRecordsToInsert)
      .returning();

    // Update period totals
    const totalGross = payrollRecordsToInsert.reduce((sum, record) => sum + parseFloat(record.grossPay), 0);
    const totalDeductions = payrollRecordsToInsert.reduce((sum, record) => sum + parseFloat(record.totalDeductions), 0);
    const totalNet = payrollRecordsToInsert.reduce((sum, record) => sum + parseFloat(record.netPay), 0);

    await db
      .update(payrollPeriods)
      .set({
        totalEmployees: insertedRecords.length,
        totalGrossPay: totalGross.toString(),
        totalDeductions: totalDeductions.toString(),
        totalNetPay: totalNet.toString(),
        status: 'processing',
      })
      .where(eq(payrollPeriods.id, periodId));

    res.json({ 
      message: 'Payroll records generated successfully', 
      recordsCreated: insertedRecords.length,
      totalGrossPay: totalGross,
      totalNetPay: totalNet,
    });
  } catch (error) {
    console.error('Error generating payroll:', error);
    res.status(500).json({ error: 'Failed to generate payroll records' });
  }
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
  const presentDays = attendanceData.filter(record => record.status === 'present' || record.status === 'half-day').length;
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

export default router;