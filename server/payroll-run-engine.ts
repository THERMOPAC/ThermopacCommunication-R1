import { db } from './db';
import {
  payrollPeriods,
  payrollRecords,
  payrollRunLog,
  payrollExceptions,
  payrollAttendanceSnapshot,
  payrollSalarySnapshot,
  attendanceRecords,
  leaveRequests,
  leaveTypes,
  employeeSalaries,
  bonusRules,
  payrollSettings,
  dailyWorkReports,
  users,
  companyHolidays,
  workweekPolicies,
  payrollLocks,
  employeeLoans,
  employeeLoanRepayments,
  employeeAdvances,
  employeeAdvanceRecoveries,
} from '@shared/schema';
import { eq, and, gte, lte, desc, asc, sql, ne, isNull, between, inArray } from 'drizzle-orm';
import { createPayrollLock } from './payroll-lock-service';
import { computeAndSaveTdsForPeriod } from './tds-calculation-service';

const MONTHLY_DIVISOR = 30;

async function getEmployeeSalaryType(userId: number, periodEndDate: string): Promise<{ salaryType: string; salaryRecord: any | null }> {
  const salaryRecords = await db
    .select()
    .from(employeeSalaries)
    .where(
      and(
        eq(employeeSalaries.userId, userId),
        eq(employeeSalaries.isActive, true),
        lte(employeeSalaries.effectiveDate, periodEndDate)
      )
    )
    .orderBy(desc(employeeSalaries.effectiveDate))
    .limit(1);

  if (salaryRecords.length === 0) {
    return { salaryType: 'monthly', salaryRecord: null };
  }
  return { salaryType: salaryRecords[0].salaryType || 'monthly', salaryRecord: salaryRecords[0] };
}

async function getProfessionalTaxConfig(): Promise<{ monthly: number; february: number }> {
  const settings = await db.select().from(payrollSettings).where(
    sql`${payrollSettings.settingName} IN ('professional_tax_monthly', 'professional_tax_february')`
  );
  let monthly = 200;
  let february = 300;
  for (const s of settings) {
    if (s.settingName === 'professional_tax_monthly') monthly = parseFloat(s.settingValue) || 200;
    if (s.settingName === 'professional_tax_february') february = parseFloat(s.settingValue) || 300;
  }
  return { monthly, february };
}

export type PipelineStep =
  | 'attendance_snapshot'
  | 'leave_consolidation'
  | 'salary_calculation'
  | 'bonus_calculation'
  | 'deduction_calculation'
  | 'tds_calculation';

const PIPELINE_ORDER: PipelineStep[] = [
  'attendance_snapshot',
  'leave_consolidation',
  'salary_calculation',
  'bonus_calculation',
  'deduction_calculation',
  'tds_calculation',
];

interface StepResult {
  success: boolean;
  employeesProcessed: number;
  employeesSkipped: number;
  errorCount: number;
  summary: Record<string, any>;
  exceptions: Array<{
    userId?: number;
    type: string;
    severity: string;
    title: string;
    details?: string;
    dataSnapshot?: any;
  }>;
}

export async function startPayrollRun(periodId: number, executedBy: number): Promise<{ runNumber: number; periodId: number }> {
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
  if (!period) throw new Error('Payroll period not found');

  if (period.status === 'paid' || period.status === 'locked') {
    throw new Error(`Cannot start run on period with status: ${period.status}`);
  }

  const newRunNumber = (period.currentRunNumber || 0) + 1;

  await db
    .update(payrollPeriods)
    .set({
      currentRunNumber: newRunNumber,
      status: 'processing',
    })
    .where(eq(payrollPeriods.id, periodId));

  await db.insert(payrollRunLog).values({
    periodId,
    runNumber: newRunNumber,
    step: 'attendance_snapshot',
    status: 'pending',
    executedBy,
    attemptNumber: 1,
  });

  return { runNumber: newRunNumber, periodId };
}

export async function executeStep(
  periodId: number,
  runNumber: number,
  step: PipelineStep,
  executedBy: number,
  includeNonSystem: boolean = false
): Promise<StepResult> {
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
  if (!period) throw new Error('Payroll period not found');

  const logEntry = await db.insert(payrollRunLog).values({
    periodId,
    runNumber,
    step,
    status: 'running',
    startedAt: new Date(),
    executedBy,
    attemptNumber: 1,
  }).returning();

  const logId = logEntry[0].id;

  try {
    let result: StepResult;

    switch (step) {
      case 'attendance_snapshot':
        result = await stepAttendanceSnapshot(periodId, runNumber, period, includeNonSystem);
        break;
      case 'leave_consolidation':
        result = await stepLeaveConsolidation(periodId, runNumber, period, includeNonSystem);
        break;
      case 'salary_calculation':
        result = await stepSalaryCalculation(periodId, runNumber, period, executedBy, includeNonSystem);
        break;
      case 'bonus_calculation':
        result = await stepKpiAdjustment(periodId, runNumber, period, includeNonSystem);
        break;
      case 'deduction_calculation':
        result = await stepDeductionCalculation(periodId, runNumber, period, executedBy, includeNonSystem);
        break;
      case 'tds_calculation':
        result = await stepTdsCalculation(periodId, runNumber, period, executedBy, includeNonSystem);
        break;
      default:
        throw new Error(`Unknown step: ${step}`);
    }

    for (const exc of result.exceptions) {
      await db.insert(payrollExceptions).values({
        periodId,
        runNumber,
        step,
        userId: exc.userId,
        exceptionType: exc.type as any,
        severity: exc.severity as any,
        title: exc.title,
        details: exc.details,
        dataSnapshot: exc.dataSnapshot,
      });
    }

    await db.update(payrollRunLog).set({
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date(),
      employeesProcessed: result.employeesProcessed,
      employeesSkipped: result.employeesSkipped,
      errorCount: result.errorCount,
      summary: result.summary,
    }).where(eq(payrollRunLog.id, logId));

    return result;
  } catch (error: any) {
    await db.update(payrollRunLog).set({
      status: 'failed',
      completedAt: new Date(),
      notes: error.message,
    }).where(eq(payrollRunLog.id, logId));

    throw error;
  }
}

async function getActiveEmployees(includeNonSystem: boolean = false): Promise<any[]> {
  const conditions = [eq(users.isActive, true), ne(users.role, 'superuser')];
  if (!includeNonSystem) {
    conditions.push(sql`coalesce(${users.userType}, 'system_user') = 'system_user'`);
  }
  return db
    .select({ id: users.id, username: users.username, email: users.email, role: users.role, workLocationId: users.workLocationId, department: users.department, weeklyOffDays: users.weeklyOffDays, userType: users.userType })
    .from(users)
    .where(and(...conditions));
}

async function getWorkweekPolicyForEmployee(workLocationId?: number, department?: string): Promise<number[]> {
  let policy: any = null;

  if (workLocationId) {
    const [locPolicy] = await db.select().from(workweekPolicies)
      .where(and(eq(workweekPolicies.policyType, 'location'), eq(workweekPolicies.locationId, workLocationId), eq(workweekPolicies.isActive, true)))
      .orderBy(desc(workweekPolicies.createdAt)).limit(1);
    if (locPolicy) policy = locPolicy;
  }

  if (!policy && department) {
    const [deptPolicy] = await db.select().from(workweekPolicies)
      .where(and(eq(workweekPolicies.policyType, 'department'), eq(workweekPolicies.department, department), eq(workweekPolicies.isActive, true)))
      .orderBy(desc(workweekPolicies.createdAt)).limit(1);
    if (deptPolicy) policy = deptPolicy;
  }

  if (!policy) {
    const [globalPolicy] = await db.select().from(workweekPolicies)
      .where(and(eq(workweekPolicies.policyType, 'global'), eq(workweekPolicies.isActive, true)))
      .orderBy(desc(workweekPolicies.createdAt)).limit(1);
    if (globalPolicy) policy = globalPolicy;
  }

  const days = policy?.workingDays;
  if (Array.isArray(days)) return days;
  return [1, 2, 3, 4, 5, 6];
}

async function getCompanyHolidayDates(startDate: string, endDate: string): Promise<Set<string>> {
  const holidays = await db.select({ date: companyHolidays.date })
    .from(companyHolidays)
    .where(between(companyHolidays.date, startDate, endDate));
  return new Set(holidays.map(h => String(h.date)));
}

function countWorkingDays(startDate: string, endDate: string, workingDayNums: number[], holidayDates: Set<string>): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dayOfWeek = cur.getDay();
    const dateStr = cur.toISOString().split('T')[0];
    if (workingDayNums.includes(dayOfWeek) && !holidayDates.has(dateStr)) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

async function stepAttendanceSnapshot(
  periodId: number,
  runNumber: number,
  period: any,
  includeNonSystem: boolean = false
): Promise<StepResult> {
  const employees = await getActiveEmployees(includeNonSystem);
  const exceptions: StepResult['exceptions'] = [];
  let processed = 0;
  let skipped = 0;
  const holidayDates = await getCompanyHolidayDates(period.startDate, period.endDate);

  const sDate = new Date(period.startDate);
  const eDate = new Date(period.endDate);
  const calendarDaysInPeriod = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;

  for (const emp of employees) {
    try {
      const { salaryType } = await getEmployeeSalaryType(emp.id, period.endDate);

      const records = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.userId, emp.id),
            gte(attendanceRecords.date, period.startDate),
            lte(attendanceRecords.date, period.endDate)
          )
        );

      const weeklyOffs = emp.weeklyOffDays || [0, 6];
      let weekOffCount = 0;
      const cur = new Date(sDate);
      while (cur <= eDate) {
        if (weeklyOffs.includes(cur.getDay())) weekOffCount++;
        cur.setDate(cur.getDate() + 1);
      }

      const presentFull = records.filter(r => r.status === 'present').length;
      const halfDays = records.filter(r => r.status === 'half_day').length;
      const lateDays = records.filter(r => r.status === 'late').length;
      const absentCount = records.filter(r => r.status === 'absent').length;

      const totalOT = records.reduce(
        (sum, r) => sum + parseFloat(r.overtimeHours || '0'),
        0
      );

      let lopDays: number;
      let paidDays: number;
      let presentDays: number;

      if (salaryType === 'daily') {
        presentDays = presentFull + lateDays + (halfDays * 0.5);
        paidDays = presentDays;
        lopDays = 0;
      } else {
        if (records.length < calendarDaysInPeriod) {
          const missingDays = calendarDaysInPeriod - records.length;
          exceptions.push({
            userId: emp.id,
            type: 'attendance_incomplete',
            severity: 'error',
            title: `Attendance incomplete for ${emp.username}`,
            details: `${records.length} of ${calendarDaysInPeriod} days have attendance records. ${missingDays} day(s) missing. Please mark all days before processing payroll.`,
          });
          skipped++;
          continue;
        }

        presentDays = presentFull + lateDays + (halfDays * 0.5);
        lopDays = absentCount + (halfDays * 0.5);
        paidDays = Math.max(MONTHLY_DIVISOR - lopDays, 0);

        if (paidDays > MONTHLY_DIVISOR) {
          exceptions.push({
            userId: emp.id,
            type: 'calculation_error',
            severity: 'error',
            title: `Paid days exceed ${MONTHLY_DIVISOR} for ${emp.username}`,
            details: `Calculated paid days: ${paidDays}. This should never exceed ${MONTHLY_DIVISOR}. LOP: ${lopDays}.`,
          });
          skipped++;
          continue;
        }
      }

      const workingDayNums = await getWorkweekPolicyForEmployee(emp.workLocationId, emp.department);
      const totalWorkingDays = countWorkingDays(period.startDate, period.endDate, workingDayNums, holidayDates);

      await db
        .insert(payrollAttendanceSnapshot)
        .values({
          periodId,
          runNumber,
          userId: emp.id,
          totalWorkingDays,
          presentDays: presentDays.toString(),
          absentDays: absentCount.toString(),
          halfDays: halfDays.toString(),
          lateDays,
          overtimeHours: totalOT.toString(),
          paidDays: paidDays.toString(),
          weeklyOffs: weekOffCount,
          holidays: holidayDates.size,
          companyHolidays: holidayDates.size,
          paidLeaveDays: '0',
          unpaidLeaveDays: '0',
          lopDays: lopDays.toString(),
        })
        .onConflictDoUpdate({
          target: [payrollAttendanceSnapshot.periodId, payrollAttendanceSnapshot.runNumber, payrollAttendanceSnapshot.userId],
          set: {
            totalWorkingDays,
            presentDays: presentDays.toString(),
            absentDays: absentCount.toString(),
            halfDays: halfDays.toString(),
            lateDays,
            overtimeHours: totalOT.toString(),
            paidDays: paidDays.toString(),
            weeklyOffs: weekOffCount,
            holidays: holidayDates.size,
            companyHolidays: holidayDates.size,
            lopDays: lopDays.toString(),
          },
        });

      processed++;
    } catch (error: any) {
      skipped++;
      exceptions.push({
        userId: emp.id,
        type: 'calculation_error',
        severity: 'error',
        title: `Attendance snapshot failed for ${emp.username}`,
        details: error.message,
      });
    }
  }

  return {
    success: exceptions.filter(e => e.severity === 'error').length === 0,
    employeesProcessed: processed,
    employeesSkipped: skipped,
    errorCount: exceptions.filter(e => e.severity === 'error').length,
    summary: { calendarDays: calendarDaysInPeriod, totalEmployees: employees.length },
    exceptions,
  };
}

async function stepLeaveConsolidation(
  periodId: number,
  runNumber: number,
  period: any,
  includeNonSystem: boolean = false
): Promise<StepResult> {
  const employees = await getActiveEmployees(includeNonSystem);
  const exceptions: StepResult['exceptions'] = [];
  let processed = 0;
  let skipped = 0;

  const allLeaveTypes = await db.select().from(leaveTypes);
  const paidTypeIds = new Set(allLeaveTypes.filter(lt => lt.isPaid).map(lt => lt.id));

  for (const emp of employees) {
    try {
      const { salaryType } = await getEmployeeSalaryType(emp.id, period.endDate);

      const leaves = await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.employeeId, emp.id),
            eq(leaveRequests.status, 'approved'),
            lte(leaveRequests.startDate, period.endDate),
            gte(leaveRequests.endDate, period.startDate)
          )
        );

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

      const snapshot = await db
        .select()
        .from(payrollAttendanceSnapshot)
        .where(
          and(
            eq(payrollAttendanceSnapshot.periodId, periodId),
            eq(payrollAttendanceSnapshot.runNumber, runNumber),
            eq(payrollAttendanceSnapshot.userId, emp.id)
          )
        );

      if (snapshot.length > 0) {
        const snap = snapshot[0];
        const currentPaidDays = parseFloat(snap.paidDays);
        const currentLopDays = parseFloat(snap.lopDays || '0');

        if (salaryType === 'daily') {
          const newPaidDays = currentPaidDays + paidLeaveDays;

          await db
            .update(payrollAttendanceSnapshot)
            .set({
              paidLeaveDays: paidLeaveDays.toString(),
              unpaidLeaveDays: unpaidLeaveDays.toString(),
              lopDays: '0',
              paidDays: newPaidDays.toString(),
              autoLeaveApplied: leaves.map(l => ({
                leaveId: l.id,
                leaveTypeId: l.leaveTypeId,
                days: parseFloat(l.totalDays),
                isPaid: paidTypeIds.has(l.leaveTypeId),
              })),
            })
            .where(eq(payrollAttendanceSnapshot.id, snap.id));
        } else {
          const coveredByPaidLeave = Math.min(paidLeaveDays, currentLopDays);
          const newLopDays = Math.max(0, currentLopDays - coveredByPaidLeave);
          const newPaidDays = Math.min(MONTHLY_DIVISOR - newLopDays, MONTHLY_DIVISOR);

          await db
            .update(payrollAttendanceSnapshot)
            .set({
              paidLeaveDays: coveredByPaidLeave.toString(),
              unpaidLeaveDays: unpaidLeaveDays.toString(),
              lopDays: newLopDays.toString(),
              paidDays: newPaidDays.toString(),
              autoLeaveApplied: leaves.map(l => ({
                leaveId: l.id,
                leaveTypeId: l.leaveTypeId,
                days: parseFloat(l.totalDays),
                isPaid: paidTypeIds.has(l.leaveTypeId),
              })),
            })
            .where(eq(payrollAttendanceSnapshot.id, snap.id));
        }
      }

      processed++;
    } catch (error: any) {
      skipped++;
      exceptions.push({
        userId: emp.id,
        type: 'leave_conflict',
        severity: 'error',
        title: `Leave consolidation failed for ${emp.username}`,
        details: error.message,
      });
    }
  }

  return {
    success: exceptions.filter(e => e.type === 'calculation_error').length === 0,
    employeesProcessed: processed,
    employeesSkipped: skipped,
    errorCount: exceptions.filter(e => e.severity === 'error').length,
    summary: { totalEmployees: employees.length },
    exceptions,
  };
}

async function stepSalaryCalculation(
  periodId: number,
  runNumber: number,
  period: any,
  executedBy: number,
  includeNonSystem: boolean = false
): Promise<StepResult> {
  const employees = await getActiveEmployees(includeNonSystem);
  const exceptions: StepResult['exceptions'] = [];
  let processed = 0;
  let skipped = 0;

  for (const emp of employees) {
    try {
      const salaryRecords = await db
        .select()
        .from(employeeSalaries)
        .where(
          and(
            eq(employeeSalaries.userId, emp.id),
            eq(employeeSalaries.isActive, true),
            lte(employeeSalaries.effectiveDate, period.endDate)
          )
        )
        .orderBy(desc(employeeSalaries.effectiveDate))
        .limit(1);

      if (salaryRecords.length === 0) {
        skipped++;
        exceptions.push({
          userId: emp.id,
          type: 'salary_missing',
          severity: 'error',
          title: `No active salary record for ${emp.username}`,
          details: 'Employee has no active salary record effective for this period',
        });
        continue;
      }

      const sal = salaryRecords[0];

      await db
        .insert(payrollSalarySnapshot)
        .values({
          periodId,
          runNumber,
          userId: emp.id,
          salaryRecordId: sal.id,
          baseSalary: sal.baseSalary,
          basicSalary: sal.basicSalary,
          houseRentAllowance: sal.houseRentAllowance,
          conveyance: sal.conveyance,
          lta: sal.lta,
          specialAllowance: sal.specialAllowance,
          supplementaryAllowance: sal.supplementaryAllowance,
          kgpAllowance: sal.kgpAllowance,
          bonus: sal.bonus,
          salaryType: sal.salaryType,
          workingHoursPerDay: sal.workingHoursPerDay,
          otRate: sal.otRate,
          otMultiplier: sal.otMultiplier,
          employeePfContribution: sal.employeePfContribution,
          employerPfContribution: sal.employerPfContribution,
          employeeEsicContribution: sal.employeeEsicContribution,
          employerEsicContribution: sal.employerEsicContribution,
          groupInsurance: sal.groupInsurance,
          professionalTax: sal.professionalTax,
          takeHomeSalary: sal.takeHomeSalary,
          ctcMonthly: sal.ctcMonthly,
          ctcYearly: sal.ctcYearly,
        })
        .onConflictDoUpdate({
          target: [payrollSalarySnapshot.periodId, payrollSalarySnapshot.runNumber, payrollSalarySnapshot.userId],
          set: {
            salaryRecordId: sal.id,
            baseSalary: sal.baseSalary,
            basicSalary: sal.basicSalary,
            houseRentAllowance: sal.houseRentAllowance,
            conveyance: sal.conveyance,
            lta: sal.lta,
            specialAllowance: sal.specialAllowance,
            supplementaryAllowance: sal.supplementaryAllowance,
            kgpAllowance: sal.kgpAllowance,
            bonus: sal.bonus,
          },
        });

      const attSnap = await db
        .select()
        .from(payrollAttendanceSnapshot)
        .where(
          and(
            eq(payrollAttendanceSnapshot.periodId, periodId),
            eq(payrollAttendanceSnapshot.runNumber, runNumber),
            eq(payrollAttendanceSnapshot.userId, emp.id)
          )
        );

      const lopDays = attSnap.length > 0 ? parseFloat(attSnap[0].lopDays || '0') : 0;
      const totalWorkingDays = attSnap.length > 0 ? attSnap[0].totalWorkingDays : 26;
      const overtimeHours = attSnap.length > 0 ? parseFloat(attSnap[0].overtimeHours || '0') : 0;

      const basicSalary = parseFloat(sal.basicSalary || sal.baseSalary);
      const salaryType = sal.salaryType || 'monthly';
      const workingHoursPerDay = sal.workingHoursPerDay || 8;
      const groupInsuranceAmount = parseFloat(sal.groupInsurance || '1500');
      const ptConfig = await getProfessionalTaxConfig();

      const rawPaidDays = attSnap.length > 0 ? parseFloat(attSnap[0].paidDays) : 0;

      let proratedBase: number, overtimePay: number, grossPay: number;
      let hra = 0, conv = 0, ltaVal = 0, specAllow = 0, suppAllow = 0, kgpAllow = 0, bonusAllow = 0;
      let paidDays: number;

      if (salaryType === 'daily') {
        paidDays = rawPaidDays;
        proratedBase = basicSalary * paidDays;
        const hourlyRate = parseFloat(sal.hourlyRate || '0') || (basicSalary / workingHoursPerDay);
        const otRate = parseFloat(sal.otRate || '1.0');
        const otMultiplier = parseFloat(sal.otMultiplier || '1.0');
        overtimePay = hourlyRate * overtimeHours * otRate * otMultiplier;
        const configKgp = parseFloat(sal.kgpAllowance || '0');
        kgpAllow = configKgp > 0 ? Math.round(configKgp * paidDays * 100) / 100 : 0;
        bonusAllow = Math.round(proratedBase * 0.0833 * 100) / 100;
        grossPay = proratedBase + overtimePay + kgpAllow + bonusAllow;
      } else {
        paidDays = Math.min(rawPaidDays, MONTHLY_DIVISOR);

        if (paidDays > MONTHLY_DIVISOR) {
          exceptions.push({
            userId: emp.id,
            type: 'calculation_error',
            severity: 'error',
            title: `Paid days exceed ${MONTHLY_DIVISOR} for ${emp.username}`,
            details: `Paid days: ${paidDays}. Cannot exceed ${MONTHLY_DIVISOR} for monthly salary.`,
          });
          skipped++;
          continue;
        }

        const ratio = paidDays / MONTHLY_DIVISOR;
        proratedBase = Math.round(basicSalary * ratio * 100) / 100;
        overtimePay = 0;

        const configHra = parseFloat(sal.houseRentAllowance || '0');
        const configConv = parseFloat(sal.conveyance || '0');
        const configLta = parseFloat(sal.lta || '0');
        const configSpec = parseFloat(sal.specialAllowance || '0');
        const configSupp = parseFloat(sal.supplementaryAllowance || '0');
        const configKgp = parseFloat(sal.kgpAllowance || '0');
        const configBonus = parseFloat(sal.bonus || '0');

        hra = Math.round(configHra * ratio * 100) / 100;
        conv = Math.round(configConv * ratio * 100) / 100;
        ltaVal = Math.round(configLta * ratio * 100) / 100;
        specAllow = Math.round(configSpec * ratio * 100) / 100;
        suppAllow = Math.round(configSupp * ratio * 100) / 100;
        kgpAllow = Math.round(configKgp * ratio * 100) / 100;
        bonusAllow = configBonus > 0
          ? Math.round(configBonus * ratio * 100) / 100
          : Math.round(basicSalary * 0.0833 * ratio * 100) / 100;

        grossPay = proratedBase + hra + conv + ltaVal + specAllow + suppAllow + kgpAllow + bonusAllow;

        if (paidDays === MONTHLY_DIVISOR) {
          const fullMonthGross = basicSalary + configHra + configConv + configLta + configSpec + configSupp + configKgp + (configBonus > 0 ? configBonus : basicSalary * 0.0833);
          if (grossPay > fullMonthGross + 1) {
            exceptions.push({
              userId: emp.id,
              type: 'salary_overflow',
              severity: 'warning',
              title: `Gross pay exceeds full-month configured salary for ${emp.username}`,
              details: `Calculated gross: ₹${grossPay.toFixed(2)}, Full-month configured: ₹${fullMonthGross.toFixed(2)}.`,
            });
          }
        }
      }

      const pfBase = Math.min(proratedBase, 15000);
      const employeePF = pfBase * 0.12;
      const employerPF = pfBase * 0.12;

      const employeeESIC = grossPay <= 21000 ? grossPay * 0.0075 : 0;
      const employerESIC = grossPay <= 21000 ? grossPay * 0.0325 : 0;

      const gratuityAmount = (basicSalary * 15 / 26) / 12;

      let professionalTax = 0;
      if (emp.role !== 'Superuser') {
        const periodMonth = new Date(period.startDate).getMonth() + 1;
        professionalTax = periodMonth === 2 ? ptConfig.february : ptConfig.monthly;
      }

      const totalDeductions = employeePF + employeeESIC + professionalTax;
      const netPay = grossPay - totalDeductions;

      const ctcMonthly = grossPay + employerPF + employerESIC + gratuityAmount + groupInsuranceAmount;
      const ctcYearly = (ctcMonthly * 12) + (bonusAllow * 12);

      const calculationSnapshot = {
        basicSalary,
        salaryType,
        salaryBasis: salaryType === 'daily' ? 'actual_days' : MONTHLY_DIVISOR,
        totalWorkingDays,
        paidDays,
        lopDays,
        proratedBase,
        allowances: { hra, conveyance: conv, lta: ltaVal, specialAllowance: specAllow, supplementaryAllowance: suppAllow, kgpAllowance: kgpAllow, bonus: bonusAllow },
        overtime: { hours: overtimeHours, pay: overtimePay },
        deductions: { employeePF, employerPF, employeeESIC, employerESIC, professionalTax, gratuity: gratuityAmount },
        employerCosts: { groupInsurance: groupInsuranceAmount, gratuity: gratuityAmount, employerPF, employerESIC },
        grossPay,
        totalDeductions,
        netPay,
        ctcMonthly,
        ctcYearly,
        salaryRecordId: sal.id,
        snapshotDate: new Date().toISOString(),
      };

      const existingRecord = await db
        .select()
        .from(payrollRecords)
        .where(
          and(
            eq(payrollRecords.periodId, periodId),
            eq(payrollRecords.userId, emp.id)
          )
        );

      const payrollData = {
        runNumber,
        baseSalary: proratedBase.toFixed(2),
        workingDays: totalWorkingDays,
        paidDays: paidDays.toFixed(2),
        lopDays: lopDays.toFixed(2),
        presentDays: (attSnap[0]?.presentDays || '0'),
        paidLeaveDays: (attSnap[0]?.paidLeaveDays || '0'),
        unpaidLeaveDays: (attSnap[0]?.unpaidLeaveDays || '0'),
        hra: hra.toFixed(2),
        conveyanceAllowance: conv.toFixed(2),
        ltaAllowance: ltaVal.toFixed(2),
        specialAllowance: specAllow.toFixed(2),
        supplementaryAllowance: suppAllow.toFixed(2),
        kgpAllowance: kgpAllow.toFixed(2),
        bonus: bonusAllow.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        overtimePay: overtimePay.toFixed(2),
        grossPay: grossPay.toFixed(2),
        employeePf: employeePF.toFixed(2),
        employeeEsic: employeeESIC.toFixed(2),
        employerPf: employerPF.toFixed(2),
        employerEsic: employerESIC.toFixed(2),
        providentFund: employeePF.toFixed(2),
        esiDeduction: employeeESIC.toFixed(2),
        professionalTax: professionalTax.toFixed(2),
        gratuity: gratuityAmount.toFixed(2),
        groupInsurance: groupInsuranceAmount.toFixed(2),
        totalDeductions: totalDeductions.toFixed(2),
        netPay: netPay.toFixed(2),
        calculationSnapshot,
        status: 'draft',
      };

      if (existingRecord.length > 0) {
        await db
          .update(payrollRecords)
          .set({ ...payrollData, updatedAt: new Date() })
          .where(eq(payrollRecords.id, existingRecord[0].id));
      } else {
        await db.insert(payrollRecords).values({
          periodId,
          userId: emp.id,
          ...payrollData,
        });
      }

      processed++;
    } catch (error: any) {
      skipped++;
      exceptions.push({
        userId: emp.id,
        type: 'calculation_error',
        severity: 'error',
        title: `Salary calculation failed for ${emp.username}`,
        details: error.message,
      });
    }
  }

  await createPayrollLock(periodId, 'attendance', executedBy, 'Auto-locked after salary calculation');
  await createPayrollLock(periodId, 'leave', executedBy, 'Auto-locked after salary calculation');

  const hardErrors = exceptions.filter(e => e.type === 'calculation_error').length;
  return {
    success: hardErrors === 0,
    employeesProcessed: processed,
    employeesSkipped: skipped,
    errorCount: exceptions.filter(e => e.severity === 'error').length,
    summary: { totalEmployees: employees.length },
    exceptions,
  };
}

async function stepKpiAdjustment(
  periodId: number,
  runNumber: number,
  period: any,
  includeNonSystem: boolean = false
): Promise<StepResult> {
  const exceptions: StepResult['exceptions'] = [];
  let processed = 0;
  let skipped = 0;
  let kpiAdjustedCount = 0;

  const records = await db
    .select()
    .from(payrollRecords)
    .where(eq(payrollRecords.periodId, periodId));

  for (const record of records) {
    try {
      const validDwars = await db
        .select({
          reportDate: dailyWorkReports.reportDate,
          productivityScore: dailyWorkReports.productivityScore,
          tasksCompleted: dailyWorkReports.tasksCompleted,
          satisfactionRating: dailyWorkReports.satisfactionRating,
        })
        .from(dailyWorkReports)
        .where(
          and(
            eq(dailyWorkReports.userId, record.userId),
            gte(dailyWorkReports.reportDate, period.startDate),
            lte(dailyWorkReports.reportDate, period.endDate),
            inArray(dailyWorkReports.status, ['submitted', 'approved'])
          )
        );

      const attendanceData = await db
        .select({ date: attendanceRecords.date, status: attendanceRecords.status })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.userId, record.userId),
            gte(attendanceRecords.date, period.startDate),
            lte(attendanceRecords.date, period.endDate)
          )
        );

      const totalWorkingDays = attendanceData.length || 1;
      const paidAttendanceDays = attendanceData.filter(r => r.status === 'present' || r.status === 'half_day' || r.status === 'late');
      const presentCount = paidAttendanceDays.length;
      const attendancePercentage = Math.min((presentCount / totalWorkingDays) * 100, 100);

      const totalTasksCompleted = validDwars.reduce((sum, r) => sum + (r.tasksCompleted || 0), 0);
      const satisfactionRatings = validDwars
        .filter(r => r.satisfactionRating != null)
        .map(r => r.satisfactionRating!);
      const avgSatisfaction = satisfactionRatings.length > 0
        ? satisfactionRatings.reduce((s, v) => s + v, 0) / satisfactionRatings.length
        : 0;

      const [empUser] = await db.select({ role: users.role, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, record.userId)).limit(1);
      const empRole = empUser?.role || '';
      const empName = `${empUser?.firstName || ''} ${empUser?.lastName || ''}`.trim();
      const kpiEligibleRoles = ['Manager', 'Employee'];
      const isKpiEligible = kpiEligibleRoles.includes(empRole);

      const snap = record.calculationSnapshot as any || {};
      const basicSalary = snap.basicSalary || parseFloat(record.baseSalary);
      const originalKgp = parseFloat(record.kgpAllowance || '0');

      let monthlyKpiPercent: number;
      let productivityScore: number;
      let newKgpAllow = originalKgp;
      let kgpReduction = 0;
      let kpiSource = '';
      let dwarDaysMatched = 0;
      let dwarDaysMissing = 0;

      if (!isKpiEligible) {
        monthlyKpiPercent = 1;
        productivityScore = 100;
        kpiSource = 'not_eligible';
      } else if (presentCount === 0) {
        monthlyKpiPercent = 0;
        productivityScore = 0;
        kpiSource = 'no_paid_days';
        newKgpAllow = 0;
        kgpReduction = originalKgp;

        exceptions.push({
          userId: record.userId,
          type: 'kpi_missing_dwar',
          severity: 'high',
          title: `No paid attendance days for ${empName} (ID: ${record.userId})`,
          details: `No paid attendance days found for ${empName} in payroll period ${period.startDate} to ${period.endDate}. KGP set to ₹0.`,
        });
      } else {
        const dwarByDate = new Map<string, number>();
        for (const dwar of validDwars) {
          const dateStr = typeof dwar.reportDate === 'string' ? dwar.reportDate : new Date(dwar.reportDate).toISOString().split('T')[0];
          dwarByDate.set(dateStr, parseFloat(dwar.productivityScore?.toString() || '0'));
        }

        let totalKpiScore = 0;
        for (const attDay of paidAttendanceDays) {
          const dateStr = typeof attDay.date === 'string' ? attDay.date : new Date(attDay.date).toISOString().split('T')[0];
          const dayScore = dwarByDate.get(dateStr) ?? 0;
          totalKpiScore += dayScore;
          if (dwarByDate.has(dateStr)) {
            dwarDaysMatched++;
          } else {
            dwarDaysMissing++;
          }
        }

        productivityScore = totalKpiScore / presentCount;
        monthlyKpiPercent = productivityScore / 100;
        kpiSource = `attendance_based_${presentCount}_days_${dwarDaysMatched}_dwars_${dwarDaysMissing}_missing`;

        newKgpAllow = basicSalary * 0.15 * monthlyKpiPercent;
        kgpReduction = originalKgp - newKgpAllow;

        if (dwarDaysMissing > 0) {
          exceptions.push({
            userId: record.userId,
            type: 'kpi_missing_dwar',
            severity: 'medium',
            title: `${dwarDaysMissing} paid day(s) without DWAR for ${empName} (ID: ${record.userId})`,
            details: `${empName} was present ${presentCount} days but has submitted/approved DWARs for only ${dwarDaysMatched} days. ${dwarDaysMissing} day(s) counted as KPI=0 in average. Monthly KPI: ${productivityScore.toFixed(1)}%.`,
          });
        }

        if (validDwars.length === 0) {
          exceptions.push({
            userId: record.userId,
            type: 'kpi_missing_dwar',
            severity: 'high',
            title: `No submitted/approved DWAR for ${empName} (ID: ${record.userId})`,
            details: `No submitted or approved DWAR found for ${empName} in payroll period ${period.startDate} to ${period.endDate}. All ${presentCount} paid days counted as KPI=0. KGP set to ₹0.`,
          });
        }
      }

      if (isKpiEligible && kgpReduction !== 0) {
        const grossPay = parseFloat(record.grossPay) - kgpReduction;
        const pfBase = Math.min(parseFloat(record.baseSalary), 15000);
        const employeePF = pfBase * 0.12;
        const employeeESIC = grossPay <= 21000 ? grossPay * 0.0075 : 0;
        const professionalTax = parseFloat(record.professionalTax || '0');

        const loanDedVal = parseFloat(record.loanDeductions || '0');
        const advDedVal = parseFloat(record.advanceDeductions || '0');
        const totalDeductions = employeePF + employeeESIC + professionalTax + loanDedVal + advDedVal;
        const netPay = grossPay - totalDeductions;

        await db.update(payrollRecords).set({
          kgpAllowance: newKgpAllow.toFixed(2),
          grossPay: grossPay.toFixed(2),
          employeePf: employeePF.toFixed(2),
          employeeEsic: employeeESIC.toFixed(2),
          providentFund: employeePF.toFixed(2),
          esiDeduction: employeeESIC.toFixed(2),
          totalDeductions: totalDeductions.toFixed(2),
          netPay: netPay.toFixed(2),
          dwarProductivityScore: productivityScore.toFixed(2),
          attendancePercentage: attendancePercentage.toFixed(2),
          tasksCompleted: totalTasksCompleted,
          averageSatisfactionRating: avgSatisfaction.toFixed(2),
          calculationSnapshot: {
            ...snap,
            kpiAdjustment: {
              monthlyKpiPercent: productivityScore,
              kpiSource,
              paidAttendanceDays: presentCount,
              dwarDaysMatched,
              dwarDaysMissing,
              originalKgp,
              adjustedKgp: newKgpAllow,
              kgpReduction,
              paidDaysUnchanged: true,
            },
          },
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, record.id));

        kpiAdjustedCount++;
        exceptions.push({
          userId: record.userId,
          type: 'kpi_adjustment',
          severity: 'info',
          title: `KPI adjusted KGP for ${empName} (ID: ${record.userId})`,
          details: `Monthly KPI ${productivityScore.toFixed(1)}% (${dwarDaysMatched} DWARs across ${presentCount} paid days, ${dwarDaysMissing} days at 0) reduced KGP from ₹${originalKgp.toFixed(2)} to ₹${newKgpAllow.toFixed(2)} (reduction: ₹${kgpReduction.toFixed(2)}). Base salary and paidDays unchanged.`,
        });
      } else {
        await db.update(payrollRecords).set({
          dwarProductivityScore: productivityScore.toFixed(2),
          attendancePercentage: attendancePercentage.toFixed(2),
          tasksCompleted: totalTasksCompleted,
          averageSatisfactionRating: avgSatisfaction.toFixed(2),
          calculationSnapshot: {
            ...snap,
            kpiAdjustment: {
              monthlyKpiPercent: productivityScore,
              kpiSource,
              paidAttendanceDays: presentCount,
              dwarDaysMatched,
              dwarDaysMissing,
              originalKgp,
              adjustedKgp: originalKgp,
              kgpReduction: 0,
              paidDaysUnchanged: true,
            },
          },
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, record.id));
      }

      processed++;
    } catch (error: any) {
      skipped++;
      exceptions.push({
        userId: record.userId,
        type: 'calculation_error',
        severity: 'error',
        title: `KPI adjustment failed for user ${record.userId}`,
        details: error.message,
      });
    }
  }

  return {
    success: exceptions.filter(e => e.type === 'calculation_error').length === 0,
    employeesProcessed: processed,
    employeesSkipped: skipped,
    errorCount: exceptions.filter(e => e.severity === 'error').length,
    summary: { totalRecords: records.length, kpiAdjusted: kpiAdjustedCount },
    exceptions,
  };
}

async function stepDeductionCalculation(
  periodId: number,
  runNumber: number,
  period: any,
  executedBy: number,
  includeNonSystem: boolean = false
): Promise<StepResult> {
  const exceptions: StepResult['exceptions'] = [];
  let processed = 0;
  let skipped = 0;
  const MISMATCH_THRESHOLD = 1.0;

  const records = await db
    .select()
    .from(payrollRecords)
    .where(eq(payrollRecords.periodId, periodId));

  for (const record of records) {
    try {
      const formulaPf = parseFloat(record.employeePf || '0');
      const formulaEsic = parseFloat(record.employeeEsic || '0');
      const formulaPt = parseFloat(record.professionalTax || '0');

      const salSnap = await db
        .select()
        .from(payrollSalarySnapshot)
        .where(
          and(
            eq(payrollSalarySnapshot.periodId, periodId),
            eq(payrollSalarySnapshot.runNumber, runNumber),
            eq(payrollSalarySnapshot.userId, record.userId)
          )
        );

      let configPf = 0, configPt = 0, configEsic = 0, groupIns = 0;
      if (salSnap.length > 0) {
        const snap = salSnap[0];
        configPf = parseFloat(snap.employeePfContribution || '0');
        configPt = parseFloat(snap.professionalTax || '0');
        configEsic = parseFloat(snap.employeeEsicContribution || '0');
        groupIns = parseFloat(snap.groupInsurance || '0');
      }

      if (configPf > 0 && Math.abs(formulaPf - configPf) > MISMATCH_THRESHOLD) {
        exceptions.push({
          userId: record.userId,
          type: 'deduction_mismatch',
          severity: 'warning',
          title: `PF mismatch for user ${record.userId}`,
          details: `Formula PF: ₹${formulaPf.toFixed(2)}, Config PF: ₹${configPf.toFixed(2)}. Formula value retained.`,
        });
      }
      if (configEsic > 0 && Math.abs(formulaEsic - configEsic) > MISMATCH_THRESHOLD) {
        exceptions.push({
          userId: record.userId,
          type: 'deduction_mismatch',
          severity: 'warning',
          title: `ESIC mismatch for user ${record.userId}`,
          details: `Formula ESIC: ₹${formulaEsic.toFixed(2)}, Config ESIC: ₹${configEsic.toFixed(2)}. Formula value retained.`,
        });
      }
      if (configPt > 0 && Math.abs(formulaPt - configPt) > MISMATCH_THRESHOLD) {
        exceptions.push({
          userId: record.userId,
          type: 'deduction_mismatch',
          severity: 'warning',
          title: `PT mismatch for user ${record.userId}`,
          details: `Formula PT: ₹${formulaPt.toFixed(2)}, Config PT: ₹${configPt.toFixed(2)}. Formula value retained.`,
        });
      }

      const grossPay = parseFloat(record.grossPay);
      const statutoryDeductions = formulaPf + formulaEsic + formulaPt;
      const availableForRecovery = grossPay - statutoryDeductions;

      const minTakeHomeSetting = await db.select().from(payrollSettings)
        .where(eq(payrollSettings.settingName, 'minimum_take_home'));
      const minimumTakeHome = minTakeHomeSetting.length > 0 ? parseFloat(minTakeHomeSetting[0].settingValue) : 10000;

      const maxRecoverable = Math.max(0, availableForRecovery - minimumTakeHome);

      let totalLoanDeduction = 0;
      let totalAdvanceDeduction = 0;
      let remaining = maxRecoverable;

      const periodEndDate = period.endDate;

      // Phase 4: Advances first (Priority 1)
      if (remaining > 0) {
        const activeAdvances = await db.select().from(employeeAdvances)
          .where(and(
            eq(employeeAdvances.employeeId, record.userId),
            eq(employeeAdvances.status, 'active'),
            lte(employeeAdvances.startRecoveryDate, periodEndDate)
          )).orderBy(asc(employeeAdvances.createdAt));

        for (const adv of activeAdvances) {
          if (remaining <= 0) {
            exceptions.push({
              userId: record.userId,
              type: 'skipped_deduction',
              severity: 'warning',
              title: `Advance recovery skipped for ${adv.advanceReference}`,
              details: `Insufficient salary after minimum take-home protection.`,
            });
            continue;
          }

          let requested: number;
          if (adv.recoveryType === 'lump_sum') {
            requested = Math.min(parseFloat(adv.outstandingBalance || '0'), remaining);
          } else {
            requested = Math.min(parseFloat(adv.recoveryAmount || '0'), parseFloat(adv.outstandingBalance || '0'));
          }

          const actualDeduction = Math.min(requested, remaining);
          let repaymentStatus = 'deducted';
          if (actualDeduction <= 0) {
            repaymentStatus = 'skipped';
            exceptions.push({
              userId: record.userId,
              type: 'skipped_deduction',
              severity: 'warning',
              title: `Advance recovery skipped for ${adv.advanceReference}`,
              details: `No remaining salary budget for advance recovery.`,
            });
            continue;
          } else if (actualDeduction < requested) {
            repaymentStatus = 'partial';
            exceptions.push({
              userId: record.userId,
              type: 'partial_deduction',
              severity: 'warning',
              title: `Partial advance recovery for ${adv.advanceReference}`,
              details: `Requested ₹${requested.toFixed(2)}, deducted ₹${actualDeduction.toFixed(2)} due to minimum take-home protection.`,
            });
          }

          const newBalance = parseFloat(adv.outstandingBalance || '0') - actualDeduction;
          const instNum = (adv.installmentsRecovered || 0) + 1;

          await db.insert(employeeAdvanceRecoveries).values({
            advanceId: adv.id,
            employeeId: record.userId,
            installmentNumber: instNum,
            amount: actualDeduction.toFixed(2),
            recoveryDate: periodEndDate,
            payrollRecordId: record.id,
            payrollPeriodId: periodId,
            runNumber: runNumber,
            balanceAfter: newBalance.toFixed(2),
            status: repaymentStatus,
          });

          await db.update(employeeAdvances).set({
            totalRecovered: (parseFloat(adv.totalRecovered || '0') + actualDeduction).toFixed(2),
            outstandingBalance: newBalance.toFixed(2),
            installmentsRecovered: instNum,
            status: newBalance <= 0 ? 'closed' : 'active',
            updatedAt: new Date(),
          }).where(eq(employeeAdvances.id, adv.id));

          totalAdvanceDeduction += actualDeduction;
          remaining -= actualDeduction;
        }
      }

      // Phase 5: Emergency Loans (Priority 2), then Other Loans (Priority 3)
      if (remaining > 0) {
        const activeLoans = await db.select().from(employeeLoans)
          .where(and(
            eq(employeeLoans.employeeId, record.userId),
            eq(employeeLoans.status, 'active'),
            lte(employeeLoans.startDeductionDate, periodEndDate)
          )).orderBy(asc(employeeLoans.createdAt));

        const emergencyLoans = activeLoans.filter(l => l.loanType === 'emergency');
        const otherLoans = activeLoans.filter(l => l.loanType !== 'emergency');
        const sortedLoans = [...emergencyLoans, ...otherLoans];

        for (const loan of sortedLoans) {
          if (remaining <= 0) {
            exceptions.push({
              userId: record.userId,
              type: 'skipped_deduction',
              severity: 'warning',
              title: `Loan EMI skipped for ${loan.loanReference}`,
              details: `Insufficient salary after minimum take-home protection.`,
            });
            continue;
          }

          const requested = Math.min(parseFloat(loan.emiAmount || '0'), parseFloat(loan.outstandingBalance || '0'));
          const actualDeduction = Math.min(requested, remaining);
          let repaymentStatus = 'deducted';

          if (actualDeduction <= 0) {
            repaymentStatus = 'skipped';
            exceptions.push({
              userId: record.userId,
              type: 'skipped_deduction',
              severity: 'warning',
              title: `Loan EMI skipped for ${loan.loanReference}`,
              details: `No remaining salary budget for loan deduction.`,
            });
            continue;
          } else if (actualDeduction < requested) {
            repaymentStatus = 'partial';
            exceptions.push({
              userId: record.userId,
              type: 'partial_deduction',
              severity: 'warning',
              title: `Partial loan EMI for ${loan.loanReference}`,
              details: `Requested ₹${requested.toFixed(2)}, deducted ₹${actualDeduction.toFixed(2)} due to minimum take-home protection.`,
            });
          }

          const newBalance = parseFloat(loan.outstandingBalance || '0') - actualDeduction;
          const instNum = (loan.installmentsPaid || 0) + 1;

          await db.insert(employeeLoanRepayments).values({
            loanId: loan.id,
            employeeId: record.userId,
            installmentNumber: instNum,
            amount: actualDeduction.toFixed(2),
            repaymentDate: periodEndDate,
            payrollRecordId: record.id,
            payrollPeriodId: periodId,
            runNumber: runNumber,
            balanceAfter: newBalance.toFixed(2),
            status: repaymentStatus,
          });

          await db.update(employeeLoans).set({
            totalRepaid: (parseFloat(loan.totalRepaid || '0') + actualDeduction).toFixed(2),
            outstandingBalance: newBalance.toFixed(2),
            installmentsPaid: instNum,
            status: newBalance <= 0 ? 'closed' : 'active',
            updatedAt: new Date(),
          }).where(eq(employeeLoans.id, loan.id));

          totalLoanDeduction += actualDeduction;
          remaining -= actualDeduction;
        }
      }

      if (maxRecoverable <= 0 && (totalLoanDeduction > 0 || totalAdvanceDeduction > 0)) {
        exceptions.push({
          userId: record.userId,
          type: 'minimum_takehome_applied',
          severity: 'info',
          title: `Minimum take-home protection applied for user ${record.userId}`,
          details: `Available for recovery: ₹${availableForRecovery.toFixed(2)}, Minimum take-home: ₹${minimumTakeHome}`,
        });
      }

      const totalDeductions = statutoryDeductions + totalLoanDeduction + totalAdvanceDeduction;
      const netPay = grossPay - totalDeductions;

      const existingSnapshot = record.calculationSnapshot as any || {};

      await db
        .update(payrollRecords)
        .set({
          groupInsurance: groupIns.toFixed(2),
          totalDeductions: totalDeductions.toFixed(2),
          loanDeductions: totalLoanDeduction.toFixed(2),
          advanceDeductions: totalAdvanceDeduction.toFixed(2),
          netPay: netPay.toFixed(2),
          calculationSnapshot: {
            ...existingSnapshot,
            step5Validation: {
              formulaDeductions: { pf: formulaPf, esic: formulaEsic, pt: formulaPt },
              configDeductions: { pf: configPf, esic: configEsic, pt: configPt },
              groupInsuranceInCtcOnly: groupIns,
              statutoryDeductions,
              loanDeductions: totalLoanDeduction,
              advanceDeductions: totalAdvanceDeduction,
              totalDeductions,
              netPay,
              availableForRecovery,
              maxRecoverable,
              minimumTakeHome,
              validatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(payrollRecords.id, record.id));

      processed++;
    } catch (error: any) {
      skipped++;
      exceptions.push({
        userId: record.userId,
        type: 'calculation_error',
        severity: 'error',
        title: `Deduction validation failed for user ${record.userId}`,
        details: error.message,
      });
    }
  }

  const updatedRecords = await db.select().from(payrollRecords).where(eq(payrollRecords.periodId, periodId));
  const totalGross = updatedRecords.reduce((s, r) => s + parseFloat(r.grossPay), 0);
  const totalNet = updatedRecords.reduce((s, r) => s + parseFloat(r.netPay), 0);
  const totalDed = updatedRecords.reduce((s, r) => s + parseFloat(r.totalDeductions || '0'), 0);

  await db.update(payrollPeriods).set({
    totalEmployees: updatedRecords.length,
    totalGrossPay: totalGross.toFixed(2),
    totalDeductions: totalDed.toFixed(2),
    totalNetPay: totalNet.toFixed(2),
  }).where(eq(payrollPeriods.id, periodId));

  return {
    success: exceptions.filter(e => e.type === 'calculation_error').length === 0,
    employeesProcessed: processed,
    employeesSkipped: skipped,
    errorCount: exceptions.filter(e => e.severity === 'error').length,
    summary: { totalGross, totalNet, totalDeductions: totalDed },
    exceptions,
  };
}

async function stepTdsCalculation(
  periodId: number,
  runNumber: number,
  period: any,
  executedBy: number,
  includeNonSystem: boolean = false
): Promise<StepResult> {
  const exceptions: StepResult['exceptions'] = [];

  try {
    const result = await computeAndSaveTdsForPeriod(periodId, executedBy);

    for (const detail of result.details) {
      if (detail.error) {
        exceptions.push({
          userId: detail.userId,
          type: 'calculation_error',
          severity: 'warning',
          title: `TDS calculation warning for user ${detail.userId}`,
          details: detail.error,
        });
      }
    }

    const updatedRecords = await db.select().from(payrollRecords).where(eq(payrollRecords.periodId, periodId));
    const totalGross = updatedRecords.reduce((s, r) => s + parseFloat(r.grossPay), 0);
    const totalNet = updatedRecords.reduce((s, r) => s + parseFloat(r.netPay), 0);
    const totalDed = updatedRecords.reduce((s, r) => s + parseFloat(r.totalDeductions || '0'), 0);

    await db.update(payrollPeriods).set({
      totalGrossPay: totalGross.toFixed(2),
      totalDeductions: totalDed.toFixed(2),
      totalNetPay: totalNet.toFixed(2),
      status: 'processed',
    }).where(eq(payrollPeriods.id, periodId));

    await createPayrollLock(periodId, 'salary', executedBy, 'Auto-locked after TDS calculation and final net pay');

    return {
      success: result.errors === 0,
      employeesProcessed: result.processed,
      employeesSkipped: result.errors,
      errorCount: result.errors,
      summary: { tdsProcessed: result.processed, tdsErrors: result.errors, totalGross, totalNet, totalDeductions: totalDed },
      exceptions,
    };
  } catch (error: any) {
    return {
      success: false,
      employeesProcessed: 0,
      employeesSkipped: 0,
      errorCount: 1,
      summary: { error: error.message },
      exceptions: [{
        userId: 0,
        type: 'system_error',
        severity: 'error',
        title: 'TDS calculation step failed',
        details: error.message,
      }],
    };
  }
}

export async function transitionPeriodStatus(
  periodId: number,
  newStatus: string,
  userId: number
): Promise<any> {
  const validTransitions: Record<string, string[]> = {
    draft: ['processing'],
    processing: ['processed', 'draft'],
    processed: ['reviewed'],
    reviewed: ['approved'],
    approved: ['paid'],
    paid: ['locked'],
  };

  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
  if (!period) throw new Error('Period not found');

  const currentStatus = period.status || 'draft';
  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }

  const updateData: any = { status: newStatus };

  if (newStatus === 'reviewed') {
    updateData.reviewedBy = userId;
    updateData.reviewedAt = new Date();
  } else if (newStatus === 'approved') {
    updateData.approvedAt = new Date();
    updateData.finalizedRunNumber = period.currentRunNumber;
  } else if (newStatus === 'paid') {
    updateData.paidAt = new Date();
    updateData.paidBy = userId;
  } else if (newStatus === 'locked') {
    updateData.isLocked = true;
    updateData.lockedAt = new Date();
    updateData.lockedBy = userId;
  }

  const [updated] = await db
    .update(payrollPeriods)
    .set(updateData)
    .where(eq(payrollPeriods.id, periodId))
    .returning();

  if (newStatus === 'locked') {
    await createPayrollLock(periodId, 'full', userId, 'Period locked after payment');
  }

  return updated;
}

export async function resetPayrollRun(
  periodId: number,
  userId: number,
  reason: string
): Promise<{ newRunNumber: number }> {
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
  if (!period) throw new Error('Period not found');

  if (period.status === 'paid' || period.status === 'locked') {
    throw new Error('Cannot reset a paid or locked period');
  }

  await db.insert(payrollRunLog).values({
    periodId,
    runNumber: period.currentRunNumber || 1,
    step: 'reset',
    status: 'completed',
    startedAt: new Date(),
    completedAt: new Date(),
    executedBy: userId,
    notes: reason,
    attemptNumber: 1,
  });

  await db.update(payrollLocks)
    .set({ isLocked: false, unlockedAt: new Date(), unlockedBy: userId, unlockReason: `Reset: ${reason}` })
    .where(and(eq(payrollLocks.periodId, periodId), eq(payrollLocks.isLocked, true)));

  const newRunNumber = (period.currentRunNumber || 0) + 1;

  await db.update(payrollPeriods).set({
    currentRunNumber: newRunNumber,
    status: 'draft',
  }).where(eq(payrollPeriods.id, periodId));

  return { newRunNumber };
}

export async function getRunLog(periodId: number, runNumber?: number): Promise<any[]> {
  const conditions = [eq(payrollRunLog.periodId, periodId)];
  if (runNumber) conditions.push(eq(payrollRunLog.runNumber, runNumber));

  return db
    .select()
    .from(payrollRunLog)
    .where(and(...conditions))
    .orderBy(desc(payrollRunLog.createdAt));
}

export async function getExceptions(periodId: number, runNumber?: number): Promise<any[]> {
  const conditions = [eq(payrollExceptions.periodId, periodId)];
  if (runNumber) conditions.push(eq(payrollExceptions.runNumber, runNumber));

  return db
    .select()
    .from(payrollExceptions)
    .where(and(...conditions))
    .orderBy(desc(payrollExceptions.createdAt));
}

export async function resolveException(
  exceptionId: number,
  resolvedBy: number,
  resolution: string,
  notes?: string
): Promise<any> {
  const [updated] = await db
    .update(payrollExceptions)
    .set({
      resolution: resolution as any,
      resolvedBy,
      resolvedAt: new Date(),
      resolutionNotes: notes,
    })
    .where(eq(payrollExceptions.id, exceptionId))
    .returning();

  return updated;
}

export async function getAttendanceSnapshots(periodId: number, runNumber: number): Promise<any[]> {
  return db
    .select({
      id: payrollAttendanceSnapshot.id,
      userId: payrollAttendanceSnapshot.userId,
      userName: users.username,
      totalWorkingDays: payrollAttendanceSnapshot.totalWorkingDays,
      presentDays: payrollAttendanceSnapshot.presentDays,
      absentDays: payrollAttendanceSnapshot.absentDays,
      halfDays: payrollAttendanceSnapshot.halfDays,
      lateDays: payrollAttendanceSnapshot.lateDays,
      paidLeaveDays: payrollAttendanceSnapshot.paidLeaveDays,
      unpaidLeaveDays: payrollAttendanceSnapshot.unpaidLeaveDays,
      lopDays: payrollAttendanceSnapshot.lopDays,
      overtimeHours: payrollAttendanceSnapshot.overtimeHours,
      paidDays: payrollAttendanceSnapshot.paidDays,
      autoLeaveApplied: payrollAttendanceSnapshot.autoLeaveApplied,
    })
    .from(payrollAttendanceSnapshot)
    .leftJoin(users, eq(payrollAttendanceSnapshot.userId, users.id))
    .where(
      and(
        eq(payrollAttendanceSnapshot.periodId, periodId),
        eq(payrollAttendanceSnapshot.runNumber, runNumber)
      )
    )
    .orderBy(asc(users.username));
}

export async function getSalarySnapshots(periodId: number, runNumber: number): Promise<any[]> {
  return db
    .select({
      id: payrollSalarySnapshot.id,
      userId: payrollSalarySnapshot.userId,
      userName: users.username,
      baseSalary: payrollSalarySnapshot.baseSalary,
      basicSalary: payrollSalarySnapshot.basicSalary,
      houseRentAllowance: payrollSalarySnapshot.houseRentAllowance,
      takeHomeSalary: payrollSalarySnapshot.takeHomeSalary,
      ctcMonthly: payrollSalarySnapshot.ctcMonthly,
    })
    .from(payrollSalarySnapshot)
    .leftJoin(users, eq(payrollSalarySnapshot.userId, users.id))
    .where(
      and(
        eq(payrollSalarySnapshot.periodId, periodId),
        eq(payrollSalarySnapshot.runNumber, runNumber)
      )
    )
    .orderBy(asc(users.username));
}

export const PIPELINE_STEPS = PIPELINE_ORDER;
