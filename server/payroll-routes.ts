import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
import { Router, Request, Response, NextFunction } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { requireReauth } from './middleware/require-reauth';
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
  leaveRequests,
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
import { eq, and, gte, lte, desc, asc, sum, avg, count, inArray, sql } from 'drizzle-orm';
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

router.use(ensureAuthenticated);

function requireUserId(req: Request, res: Response): number | null {
  const userId = (req.user as any)?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required — no user ID in session' });
    return null;
  }
  return userId;
}

const PAYROLL_ADMIN_ROLES = ['Admin', 'HR', 'Finance', 'Manager', 'Senior Manager', 'General Manager', 'Superuser'];

function requirePayrollRole(req: Request, res: Response): number | null {
  const userId = requireUserId(req, res);
  if (!userId) return null;
  const userRole = (req.user as any)?.role;
  if (!userRole || !PAYROLL_ADMIN_ROLES.includes(userRole)) {
    res.status(403).json({ error: `Insufficient permissions. Payroll operations require one of: ${PAYROLL_ADMIN_ROLES.join(', ')}. Your role: ${userRole || 'none'}` });
    return null;
  }
  return userId;
}

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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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

router.post('/payroll-periods/ensure', async (req, res) => {
  try {
    const { year, month } = req.body;
    const y = parseInt(year);
    const m = parseInt(month);
    if (!y || !m || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Invalid year/month' });
    }

    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const existing = await db.select().from(payrollPeriods)
      .where(and(
        eq(payrollPeriods.startDate, startDate),
        eq(payrollPeriods.endDate, endDate)
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ period: existing[0], created: false });
    }

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const payDate = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    const [newPeriod] = await db.insert(payrollPeriods).values({
      periodName: `${monthNames[m - 1]} ${y}`,
      startDate,
      endDate,
      payDate,
      status: 'draft',
    }).returning();

    res.json({ period: newPeriod, created: true });
  } catch (error: any) {
    console.error('Error ensuring payroll period:', error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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

// ============================================================================
// PAYROLL RUN ENGINE ENDPOINTS
// ============================================================================

router.get('/pipeline-steps', (_req, res) => {
  res.json(PIPELINE_STEPS);
});

router.post('/run/start', requireReauth('payroll.run_official'), async (req, res) => {
  try {
    const executedBy = requirePayrollRole(req, res);
    if (!executedBy) return;
    const { periodId } = req.body;
    const result = await startPayrollRun(periodId, executedBy);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/step', async (req, res) => {
  try {
    const executedBy = requirePayrollRole(req, res);
    if (!executedBy) return;
    const { periodId, runNumber, step, includeNonSystem } = req.body;
    const result = await executeStep(periodId, runNumber, step, executedBy, includeNonSystem === true);

    if (step === 'tds_calculation' && result.success) {
      try {
        const verificationResult = await verifyPeriod(periodId, executedBy, false);
        (result as any).autoVerification = verificationResult;
      } catch (verifyErr: any) {
        console.error('Auto-verification after payroll run failed:', verifyErr.message);
        (result as any).autoVerificationError = verifyErr.message;
      }
    }

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/transition', async (req, res) => {
  try {
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const { periodId, newStatus } = req.body;
    const result = await transitionPeriodStatus(periodId, newStatus, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/reset', async (req, res) => {
  try {
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const { periodId, reason } = req.body;
    const result = await resetPayrollRun(periodId, userId, reason);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/run/single-user', async (_req, res) => {
  console.warn('[DEPRECATED] POST /api/payroll/run/single-user called — returning 410');
  return res.status(410).json({
    error: 'This endpoint has been deprecated.',
    migration: 'Use POST /api/payroll/trial/run for trial runs. Use POST /api/payroll/run/start for the official payroll pipeline.',
    code: 'ENDPOINT_DEPRECATED',
  });
});


/**
 * GET /api/payroll/run/preflight/:periodId
 * Pre-flight checks before the official Start Run.
 * Returns blocking issues and drift warnings.
 * Baseline: docs/payroll-governance-v4.1-baseline.md §11
 */
router.get('/run/preflight/:periodId', async (req, res) => {
  try {
    const executedBy = requirePayrollRole(req, res);
    if (!executedBy) return;
    const periodId = parseInt(req.params.periodId);

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
    if (!period) return res.status(404).json({ error: 'Period not found' });

    // ── Check 1: any trial JEs currently sap_posted? ────────────────────────
    const activeTrialJes = await db
      .select({ userId: payrollRecords.userId, trialRunNo: payrollRecords.trialRunNo, sapJeNumber: payrollRecords.sapJeNumber })
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.recordType as any, 'trial'),
        eq(payrollRecords.trialStatus as any, 'sap_posted'),
      ));

    const noActiveTrialJes = activeTrialJes.length === 0;

    // ── Check 2: drift detection for employees with reversed trials ──────────
    const reversedTrials = await db
      .select({
        userId: payrollRecords.userId,
        trialRunNo: payrollRecords.trialRunNo,
        createdAt: payrollRecords.createdAt,
      })
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.recordType as any, 'trial'),
        eq(payrollRecords.trialStatus as any, 'reversed'),
      ))
      .orderBy(desc(payrollRecords.trialRunNo));

    const latestReversedByUser = new Map<number, { trialRunNo: number; createdAt: Date }>();
    for (const t of reversedTrials) {
      if (!latestReversedByUser.has(t.userId)) {
        latestReversedByUser.set(t.userId, { trialRunNo: t.trialRunNo!, createdAt: t.createdAt! });
      }
    }

    const driftEmployees: Array<{
      userId: number;
      employeeName: string;
      latestTrialRunNo: number;
      trialCreatedAt: string;
      driftReasons: Array<{ source: string; description: string; changedAt: string }>;
    }> = [];

    for (const [userId, trialInfo] of latestReversedByUser) {
      const trialTs = trialInfo.createdAt;
      const driftReasons: Array<{ source: string; description: string; changedAt: string }> = [];

      const attDrift = await db
        .select({ date: attendanceRecords.date, updatedAt: attendanceRecords.updatedAt })
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.userId, userId),
          gte(attendanceRecords.date, period.startDate),
          lte(attendanceRecords.date, period.endDate),
          sql`${attendanceRecords.updatedAt} > ${trialTs}`,
        ))
        .limit(3);

      for (const a of attDrift) {
        driftReasons.push({ source: 'attendance', description: `Attendance on ${a.date} updated after trial`, changedAt: String(a.updatedAt) });
      }

      const leaveDrift = await db
        .select({ id: leaveRequests.id, updatedAt: leaveRequests.updatedAt, startDate: leaveRequests.startDate })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.employeeId, userId),
          lte(leaveRequests.startDate, period.endDate),
          gte(leaveRequests.endDate, period.startDate),
          sql`${leaveRequests.updatedAt} > ${trialTs}`,
        ))
        .limit(3);

      for (const lv of leaveDrift) {
        driftReasons.push({ source: 'leave', description: `Leave record from ${lv.startDate} updated after trial`, changedAt: String(lv.updatedAt) });
      }

      const [emp] = await db.select({ username: users.username, firstName: users.firstName, lastName: users.lastName })
        .from(users).where(eq(users.id, userId));
      const empName = emp?.firstName && emp?.lastName ? `${emp.firstName} ${emp.lastName}` : (emp?.username || String(userId));

      if (driftReasons.length > 0) {
        driftEmployees.push({
          userId,
          employeeName: empName,
          latestTrialRunNo: trialInfo.trialRunNo,
          trialCreatedAt: trialInfo.createdAt.toISOString(),
          driftReasons,
        });
      }
    }

    const noDriftSinceTrialReversal = driftEmployees.length === 0;

    const checks = {
      noActiveTrialJes,
      noDriftSinceTrialReversal,
    };

    const blocking: string[] = [];
    const warnings: string[] = [];

    if (!noActiveTrialJes) blocking.push('noActiveTrialJes');
    if (!noDriftSinceTrialReversal) warnings.push('noDriftSinceTrialReversal');

    res.json({
      periodId,
      periodName: period.periodName,
      checks,
      blocking,
      warnings,
      canProceed: blocking.length === 0,
      activeTrialJes: noActiveTrialJes ? [] : activeTrialJes,
      driftReport: {
        hasDrift: !noDriftSinceTrialReversal,
        employees: driftEmployees,
      },
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
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { resolution, notes } = req.body;
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
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const { periodId, lockType, lockReason } = req.body;
    const lock = await createPayrollLock(periodId, lockType, userId, lockReason);
    res.json(lock);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/:id/unlock', async (req, res) => {
  try {
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { reason } = req.body;
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
    const requestedBy = requirePayrollRole(req, res);
    if (!requestedBy) return;
    const { lockId, periodId, reason } = req.body;
    const result = await createLockException({ lockId, periodId, reason, requestedBy });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/exceptions/:id/approve', async (req, res) => {
  try {
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const result = await approveLockException(id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/exceptions/:id/reject', async (req, res) => {
  try {
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const result = await rejectLockException(id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/locks/exceptions/:id/close', async (req, res) => {
  try {
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { changesDescription } = req.body;
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
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
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
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
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
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
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
    const userId = requirePayrollRole(req, res);
    if (!userId) return;
    const periodId = parseInt(req.params.periodId);
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

import {
  verifyPeriod,
  getVerificationSummary,
  getEmployeeVerificationDetails,
  overrideVerification,
  canPostToSap,
  resetVerificationStatus,
} from './payroll-calculation-verifier';

router.post('/verify/:periodId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const currentUser = req.user as any;
    if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
    const result = await verifyPeriod(periodId, currentUser.id, false);
    res.json(result);
  } catch (error: any) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify/:periodId/failed', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const currentUser = req.user as any;
    if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
    const result = await verifyPeriod(periodId, currentUser.id, true);
    res.json(result);
  } catch (error: any) {
    console.error('Re-verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/verify/:periodId/summary', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const summary = await getVerificationSummary(periodId);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/verify/:periodId/:userId', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const userId = parseInt(req.params.userId);
    const details = await getEmployeeVerificationDetails(periodId, userId);
    if (!details) return res.status(404).json({ error: 'Record not found' });
    res.json(details);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify/:periodId/:recordId/override', async (req, res) => {
  try {
    const recordId = parseInt(req.params.recordId);
    const currentUser = req.user as any;
    if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
    const { reason } = req.body;
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Override reason is required' });
    }
    const result = await overrideVerification(recordId, currentUser.id, reason);
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/verify/:periodId/can-post-sap', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const result = await canPostToSap(periodId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sap-transfer/:periodId/preview', async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);

    const records = await db.select().from(payrollRecords)
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.salarySource, 'payroll_engine'),
      ));

    const eligible: any[] = [];
    const blocked: any[] = [];
    const posted: any[] = [];

    for (const r of records) {
      const [emp] = await db.select({
        id: users.id, firstName: users.firstName, lastName: users.lastName,
        username: users.username, cardCode: users.cardCode, employeeCode: users.employeeCode,
      }).from(users).where(eq(users.id, r.userId));

      const empName = emp?.firstName && emp?.lastName ? `${emp.firstName} ${emp.lastName}` : emp?.username || 'Unknown';
      const vs = r.verificationStatus || 'pending';
      const sapStatus = r.sapPostingStatus || 'not_posted';

      const entry = {
        recordId: r.id,
        userId: r.userId,
        employeeName: empName,
        employeeCode: emp?.employeeCode,
        cardCode: emp?.cardCode,
        netPay: r.netPay,
        grossPay: r.grossPay,
        status: r.status,
        verificationStatus: vs,
        sapPostingStatus: sapStatus,
        sapJeNumber: r.sapJeNumber,
      };

      if (sapStatus === 'posted' || r.status === 'transferred') {
        posted.push(entry);
        continue;
      }

      const blockReasons: string[] = [];
      if (r.status !== 'verified') blockReasons.push(`Status: ${r.status || 'generated'}`);
      if (vs !== 'passed' && vs !== 'overridden') blockReasons.push(`Verification: ${vs}`);
      if (r.status === 'reversed') blockReasons.push('Reversed');
      if (r.status === 'held') blockReasons.push('On hold');
      if (r.status === 'rejected') blockReasons.push('Rejected');
      if (!emp?.cardCode) blockReasons.push('No SAP BP code');

      if (blockReasons.length > 0) {
        blocked.push({ ...entry, blockReasons });
      } else {
        eligible.push(entry);
      }
    }

    res.json({
      periodId,
      totalRecords: records.length,
      eligible: eligible.length,
      blocked: blocked.length,
      posted: posted.length,
      eligibleRecords: eligible,
      blockedRecords: blocked,
      postedRecords: posted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;