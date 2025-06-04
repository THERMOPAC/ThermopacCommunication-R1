import { Router } from 'express';
import { db } from './db';
import { 
  employeeSalaries, 
  payrollPeriods, 
  payrollRecords, 
  payrollSettings, 
  bonusRules,
  users
} from '@shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

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
    const { userId, baseSalary, currency = 'INR', payFrequency = 'monthly', effectiveDate, salaryGrade, department, position } = req.body;
    
    // Mark previous salary records as inactive for this user
    await db
      .update(employeeSalaries)
      .set({ isActive: false, endDate: new Date().toISOString().split('T')[0] })
      .where(and(
        eq(employeeSalaries.userId, userId),
        eq(employeeSalaries.isActive, true)
      ));

    const [newSalary] = await db
      .insert(employeeSalaries)
      .values({
        userId,
        baseSalary,
        currency,
        payFrequency,
        effectiveDate,
        salaryGrade,
        department,
        position,
        isActive: true,
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
    const { periodName, startDate, endDate, payDate } = req.body;
    
    const [newPeriod] = await db
      .insert(payrollPeriods)
      .values({
        periodName,
        startDate,
        endDate,
        payDate,
        status: 'draft',
      })
      .returning();

    res.status(201).json(newPeriod);
  } catch (error) {
    console.error('Error creating payroll period:', error);
    res.status(500).json({ error: 'Failed to create payroll period' });
  }
});

// Generate Payroll Records for a Period (Simplified)
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

    const payrollRecordsToInsert = [];

    for (const salary of activeSalaries) {
      // Simplified calculation - just base salary for now
      const baseSalaryNum = parseFloat(salary.baseSalary);
      const grossPay = baseSalaryNum;
      const deductions = baseSalaryNum * 0.15; // 15% total deductions
      const netPay = grossPay - deductions;

      payrollRecordsToInsert.push({
        periodId,
        userId: salary.userId,
        baseSalary: salary.baseSalary,
        grossPay: grossPay.toString(),
        totalDeductions: deductions.toString(),
        netPay: netPay.toString(),
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
        grossPay: payrollRecords.grossPay,
        totalDeductions: payrollRecords.totalDeductions,
        netPay: payrollRecords.netPay,
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
    const { ruleName, ruleType, minThreshold, maxThreshold, bonusPercentage, fixedAmount, isPercentage = true } = req.body;
    
    const [newRule] = await db
      .insert(bonusRules)
      .values({
        ruleName,
        ruleType,
        minThreshold,
        maxThreshold,
        bonusPercentage,
        fixedAmount,
        isPercentage,
        isActive: true,
      })
      .returning();

    res.status(201).json(newRule);
  } catch (error) {
    console.error('Error creating bonus rule:', error);
    res.status(500).json({ error: 'Failed to create bonus rule' });
  }
});

export default router;