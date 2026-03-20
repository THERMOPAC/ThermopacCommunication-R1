import { db } from './db';
import {
  payrollRecords,
  payrollPeriods,
  payrollAttendanceSnapshot,
  payrollSalarySnapshot,
  attendanceRecords,
  leaveRequests,
  leaveTypes,
  leaveBalances,
  employeeSalaries,
  employeeLoans,
  employeeLoanRepayments,
  employeeAdvances,
  employeeAdvanceRecoveries,
  tdsMonthlyRecords,
  users,
  companyHolidays,
} from '@shared/schema';
import { eq, and, gte, lte, asc, desc, inArray } from 'drizzle-orm';

const MONTHLY_DIVISOR = 30;
const MONEY_TOLERANCE = 1.0;
const DAYS_TOLERANCE = 0;

type IssueType =
  | 'calculation_error'
  | 'data_completeness_error'
  | 'policy_error'
  | 'policy_warning'
  | 'info';

type IssueSeverity = 'error' | 'warning' | 'info';

interface VerificationIssue {
  type: IssueType;
  severity: IssueSeverity;
  field: string;
  title: string;
  details: string;
  expected?: number | string;
  actual?: number | string;
  difference?: number | string;
}

interface EmployeeVerificationResult {
  userId: number;
  username: string;
  employeeCode: string;
  salaryType: string;
  status: 'passed' | 'failed' | 'error';
  issues: VerificationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  verifiedAt: string;
}

interface PeriodVerificationSummary {
  periodId: number;
  periodName: string;
  totalRecords: number;
  passed: number;
  failed: number;
  errors: number;
  periodVerificationStatus: 'all_passed' | 'has_errors' | 'has_warnings' | 'pending';
  employeeResults: EmployeeVerificationResult[];
  verifiedAt: string;
  verifiedBy: number;
}

interface SourceSnapshot {
  attendanceRecords: any[];
  leaveRequests: any[];
  salaryConfig: any;
  leaveTypes: any[];
  leaveBalancesData: any[];
  loanRepayments: any[];
  advanceRecoveries: any[];
  tdsRecord: any | null;
  period: any;
  cutoffTimestamp: string;
}

function p(val: any): number {
  if (val === null || val === undefined) return 0;
  return parseFloat(val.toString()) || 0;
}

function moneyMatch(expected: number, actual: number): boolean {
  return Math.abs(expected - actual) <= MONEY_TOLERANCE;
}

function daysMatch(expected: number, actual: number): boolean {
  return Math.abs(expected - actual) <= DAYS_TOLERANCE;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

async function fetchSourceSnapshot(
  userId: number,
  periodId: number,
  period: any
): Promise<SourceSnapshot> {
  const cutoffTimestamp = new Date().toISOString();

  const [attRecords, leaves, allLeaveTypes, empLeaveBalances, salConfigs, loanReps, advRecoveries, tdsRecs] = await Promise.all([
    db.select().from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        gte(attendanceRecords.date, period.startDate),
        lte(attendanceRecords.date, period.endDate)
      )),
    db.select().from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, userId),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.startDate, period.endDate),
        gte(leaveRequests.endDate, period.startDate)
      )),
    db.select().from(leaveTypes),
    db.select().from(leaveBalances)
      .where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.year, new Date(period.startDate).getFullYear())
      )),
    db.select().from(employeeSalaries)
      .where(and(
        eq(employeeSalaries.userId, userId),
        eq(employeeSalaries.isActive, true)
      ))
      .orderBy(desc(employeeSalaries.effectiveDate))
      .limit(1),
    db.select().from(employeeLoanRepayments)
      .where(and(
        eq(employeeLoanRepayments.employeeId, userId),
        eq(employeeLoanRepayments.payrollPeriodId, periodId)
      )),
    db.select().from(employeeAdvanceRecoveries)
      .where(and(
        eq(employeeAdvanceRecoveries.employeeId, userId),
        eq(employeeAdvanceRecoveries.payrollPeriodId, periodId)
      )),
    db.select().from(tdsMonthlyRecords)
      .where(and(
        eq(tdsMonthlyRecords.userId, userId),
        eq(tdsMonthlyRecords.periodId, periodId)
      ))
      .limit(1),
  ]);

  return {
    attendanceRecords: attRecords,
    leaveRequests: leaves,
    salaryConfig: salConfigs[0] || null,
    leaveTypes: allLeaveTypes,
    leaveBalancesData: empLeaveBalances,
    loanRepayments: loanReps,
    advanceRecoveries: advRecoveries,
    tdsRecord: tdsRecs[0] || null,
    period,
    cutoffTimestamp,
  };
}

function verifyAttendanceAndDays(
  record: any,
  snapshot: SourceSnapshot,
  salaryType: string,
  user: any,
  issues: VerificationIssue[]
): { expectedPaidDays: number; expectedLopDays: number; expectedPresentDays: number } {
  const records = snapshot.attendanceRecords;

  const presentFull = records.filter(r => r.status === 'present').length;
  const halfDays = records.filter(r => r.status === 'half_day').length;
  const lateDays = records.filter(r => r.status === 'late').length;
  const absentCount = records.filter(r => r.status === 'absent').length;

  const presentEquivalentDays = presentFull + lateDays + (halfDays * 0.5);

  if (halfDays > 0) {
    const halfDayContribution = halfDays * 0.5;
    issues.push({
      type: 'info',
      severity: 'info',
      field: 'halfDays',
      title: 'Half-day attendance',
      details: `${halfDays} half-day record(s) counted as ${halfDayContribution} day(s).`,
      expected: halfDayContribution,
      actual: halfDayContribution,
    });
  }

  let expectedPaidDays: number;
  let expectedLopDays: number;
  const expectedPresentDays = presentEquivalentDays;

  if (salaryType === 'daily') {
    const paidTypeIds = new Set(
      snapshot.leaveTypes.filter(lt => lt.isPaid).map(lt => lt.id)
    );
    let paidLeaveDays = 0;
    for (const leave of snapshot.leaveRequests) {
      if (paidTypeIds.has(leave.leaveTypeId)) {
        paidLeaveDays += parseFloat(leave.totalDays);
      }
    }

    expectedPaidDays = presentEquivalentDays + paidLeaveDays;
    expectedLopDays = 0;

    const recordLop = p(record.lopDays);
    if (recordLop !== 0) {
      issues.push({
        type: 'policy_error',
        severity: 'error',
        field: 'lopDays',
        title: 'LOP applied to daily worker',
        details: 'Daily workers should have zero LOP. LOP concept does not apply.',
        expected: 0,
        actual: recordLop,
      });
    }
  } else {
    const weeklyOffs = user.weeklyOffDays || [0, 6];
    const sDate = new Date(snapshot.period.startDate);
    const eDate = new Date(snapshot.period.endDate);

    const expectedWorkingDates: string[] = [];
    const iter = new Date(sDate);
    while (iter <= eDate) {
      if (!weeklyOffs.includes(iter.getDay())) {
        expectedWorkingDates.push(iter.toISOString().slice(0, 10));
      }
      iter.setDate(iter.getDate() + 1);
    }

    const attendanceDateSet = new Set(
      records.map(r => {
        const d = typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0, 10);
        return d.slice(0, 10);
      })
    );

    const missingDates = expectedWorkingDates.filter(d => !attendanceDateSet.has(d));

    if (missingDates.length > 0) {
      issues.push({
        type: 'data_completeness_error',
        severity: 'warning',
        field: 'attendanceCompleteness',
        title: 'Incomplete attendance for monthly employee',
        details: `${missingDates.length} working day(s) missing attendance records. Missing dates treated as absent for LOP.`,
        expected: expectedWorkingDates.length,
        actual: expectedWorkingDates.length - missingDates.length,
      });
    }

    const rawLopDays = absentCount + (halfDays * 0.5) + missingDates.length;

    const paidTypeIds = new Set(
      snapshot.leaveTypes.filter(lt => lt.isPaid).map(lt => lt.id)
    );
    let paidLeaveDays = 0;
    for (const leave of snapshot.leaveRequests) {
      if (paidTypeIds.has(leave.leaveTypeId)) {
        paidLeaveDays += parseFloat(leave.totalDays);
      }
    }

    const coveredByPaidLeave = Math.min(paidLeaveDays, rawLopDays);
    expectedLopDays = Math.max(0, rawLopDays - coveredByPaidLeave);
    expectedPaidDays = Math.min(MONTHLY_DIVISOR - expectedLopDays, MONTHLY_DIVISOR);

    if (expectedPaidDays > MONTHLY_DIVISOR) {
      issues.push({
        type: 'policy_error',
        severity: 'error',
        field: 'paidDays',
        title: 'Paid days exceed 30 for monthly employee',
        details: `Paid days cannot exceed ${MONTHLY_DIVISOR} for monthly salary.`,
        expected: MONTHLY_DIVISOR,
        actual: expectedPaidDays,
      });
    }
  }

  const recordPaidDays = p(record.paidDays);
  if (!daysMatch(expectedPaidDays, recordPaidDays)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'paidDays',
      title: 'Paid days mismatch',
      details: `Recalculated paid days do not match stored value.`,
      expected: expectedPaidDays,
      actual: recordPaidDays,
      difference: round2(recordPaidDays - expectedPaidDays),
    });
  }

  const recordPresentDays = p(record.presentDays);
  if (!daysMatch(expectedPresentDays, recordPresentDays)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'presentDays',
      title: 'Present days mismatch',
      details: `Present days from attendance records do not match stored value.`,
      expected: expectedPresentDays,
      actual: recordPresentDays,
      difference: round2(recordPresentDays - expectedPresentDays),
    });
  }

  if (salaryType !== 'daily') {
    const recordLop = p(record.lopDays);
    if (!daysMatch(expectedLopDays, recordLop)) {
      issues.push({
        type: 'calculation_error',
        severity: 'error',
        field: 'lopDays',
        title: 'LOP days mismatch',
        details: `Recalculated LOP days do not match stored value.`,
        expected: expectedLopDays,
        actual: recordLop,
        difference: round2(recordLop - expectedLopDays),
      });
    }
  }

  return { expectedPaidDays, expectedLopDays, expectedPresentDays };
}

function verifyLeaveImpact(
  record: any,
  snapshot: SourceSnapshot,
  salaryType: string,
  issues: VerificationIssue[]
) {
  const paidTypeIds = new Set(
    snapshot.leaveTypes.filter(lt => lt.isPaid).map(lt => lt.id)
  );

  let expectedPaidLeaveDays = 0;
  let expectedUnpaidLeaveDays = 0;
  for (const leave of snapshot.leaveRequests) {
    const days = parseFloat(leave.totalDays);
    if (paidTypeIds.has(leave.leaveTypeId)) {
      expectedPaidLeaveDays += days;
    } else {
      expectedUnpaidLeaveDays += days;
    }
  }

  for (const leave of snapshot.leaveRequests) {
    if (leave.status !== 'approved') {
      issues.push({
        type: 'policy_error',
        severity: 'error',
        field: 'leaveApproval',
        title: 'Non-approved leave counted',
        details: `Leave request ${leave.id} has status "${leave.status}" but was included in payroll.`,
      });
    }
  }

  if (expectedPaidLeaveDays > 0 || expectedUnpaidLeaveDays > 0) {
    issues.push({
      type: 'info',
      severity: 'info',
      field: 'leaveUsed',
      title: 'Leave applied in period',
      details: `Paid leave: ${expectedPaidLeaveDays} day(s), Unpaid leave: ${expectedUnpaidLeaveDays} day(s).`,
    });
  }
}

function verifyLeaveBalanceIntegrity(
  snapshot: SourceSnapshot,
  issues: VerificationIssue[]
) {
  const paidTypeIds = new Set(
    snapshot.leaveTypes.filter(lt => lt.isPaid).map(lt => lt.id)
  );

  for (const leave of snapshot.leaveRequests) {
    if (!paidTypeIds.has(leave.leaveTypeId)) continue;
    const days = parseFloat(leave.totalDays);
    const balance = snapshot.leaveBalancesData.find(b => b.leaveTypeId === leave.leaveTypeId);
    if (balance) {
      const allocated = p(balance.allocatedDays) + p(balance.carryoverDays);
      const used = p(balance.usedDays);
      const remaining = allocated - used;
      if (days > remaining + 0.01) {
        issues.push({
          type: 'policy_warning',
          severity: 'warning',
          field: 'leaveBalance',
          title: 'Paid leave exceeds balance',
          details: `Leave type ${leave.leaveTypeId}: ${days} days used but only ${remaining.toFixed(1)} remaining (allocated: ${allocated}, used: ${used}).`,
          expected: remaining,
          actual: days,
        });
      }
    }
  }
}

function verifyEarnings(
  record: any,
  snapshot: SourceSnapshot,
  salaryType: string,
  expectedPaidDays: number,
  issues: VerificationIssue[]
) {
  const sal = snapshot.salaryConfig;
  if (!sal) return;

  const recordGross = p(record.grossPay);

  if (salaryType === 'daily') {
    const dailyRate = p(sal.basicSalary);
    const expectedBase = round2(dailyRate * expectedPaidDays);
    const recordBase = p(record.baseSalary);

    if (!moneyMatch(expectedBase, recordBase)) {
      issues.push({
        type: 'calculation_error',
        severity: 'error',
        field: 'baseSalary',
        title: 'Base salary mismatch (daily)',
        details: `Expected: dailyRate(${dailyRate}) × paidDays(${expectedPaidDays}) = ₹${expectedBase.toFixed(2)}`,
        expected: expectedBase,
        actual: recordBase,
        difference: round2(recordBase - expectedBase),
      });
    }

    const overtimeHours = p(record.overtimeHours);
    const overtimePay = p(record.overtimePay);
    const expectedGross = round2(expectedBase + overtimePay);

    if (!moneyMatch(expectedGross, recordGross)) {
      issues.push({
        type: 'calculation_error',
        severity: 'error',
        field: 'grossPay',
        title: 'Gross pay mismatch (daily)',
        details: `Expected: base(₹${expectedBase.toFixed(2)}) + OT(₹${overtimePay.toFixed(2)}) = ₹${expectedGross.toFixed(2)}`,
        expected: expectedGross,
        actual: recordGross,
        difference: round2(recordGross - expectedGross),
      });
    }

    const recordHra = p(record.hra);
    const recordConv = p(record.conveyanceAllowance);
    const recordLta = p(record.ltaAllowance);
    const recordSpec = p(record.specialAllowance);
    const recordSupp = p(record.supplementaryAllowance);
    if (recordHra > 0 || recordConv > 0 || recordLta > 0 || recordSpec > 0 || recordSupp > 0) {
      issues.push({
        type: 'policy_error',
        severity: 'error',
        field: 'dailyAllowances',
        title: 'Allowances applied to daily worker',
        details: 'Daily workers should not have HRA, Conveyance, LTA, Special, or Supplementary allowances.',
      });
    }
  } else {
    const basicSalary = p(sal.basicSalary);
    const ratio = expectedPaidDays / MONTHLY_DIVISOR;
    const expectedBase = round2(basicSalary * ratio);
    const recordBase = p(record.baseSalary);

    if (!moneyMatch(expectedBase, recordBase)) {
      issues.push({
        type: 'calculation_error',
        severity: 'error',
        field: 'baseSalary',
        title: 'Basic salary proration mismatch',
        details: `Expected: basic(${basicSalary}) × ratio(${expectedPaidDays}/${MONTHLY_DIVISOR}) = ₹${expectedBase.toFixed(2)}`,
        expected: expectedBase,
        actual: recordBase,
        difference: round2(recordBase - expectedBase),
      });
    }

    const configHra = p(sal.houseRentAllowance);
    const configConv = p(sal.conveyance);
    const configLta = p(sal.lta);
    const configSpec = p(sal.specialAllowance);
    const configSupp = p(sal.supplementaryAllowance);
    const configKgp = p(sal.kgpAllowance);

    const expectedHra = round2(configHra * ratio);
    const expectedConv = round2(configConv * ratio);
    const expectedLta = round2(configLta * ratio);
    const expectedSpec = round2(configSpec * ratio);
    const expectedSupp = round2(configSupp * ratio);
    const expectedKgp = round2(configKgp * ratio);

    const allowanceChecks = [
      { field: 'hra', label: 'HRA', expected: expectedHra, actual: p(record.hra), config: configHra },
      { field: 'conveyanceAllowance', label: 'Conveyance', expected: expectedConv, actual: p(record.conveyanceAllowance), config: configConv },
      { field: 'ltaAllowance', label: 'LTA', expected: expectedLta, actual: p(record.ltaAllowance), config: configLta },
      { field: 'specialAllowance', label: 'Special Allowance', expected: expectedSpec, actual: p(record.specialAllowance), config: configSpec },
      { field: 'supplementaryAllowance', label: 'Supplementary', expected: expectedSupp, actual: p(record.supplementaryAllowance), config: configSupp },
    ];

    for (const chk of allowanceChecks) {
      if (!moneyMatch(chk.expected, chk.actual)) {
        issues.push({
          type: 'calculation_error',
          severity: 'error',
          field: chk.field,
          title: `${chk.label} proration mismatch`,
          details: `Config: ₹${chk.config}, ratio: ${ratio.toFixed(4)}, expected: ₹${chk.expected.toFixed(2)}, got: ₹${chk.actual.toFixed(2)}`,
          expected: chk.expected,
          actual: chk.actual,
          difference: round2(chk.actual - chk.expected),
        });
      }
    }

    const earningsSum = round2(expectedBase + expectedHra + expectedConv + expectedLta + expectedSpec + expectedSupp + expectedKgp);

    if (!moneyMatch(earningsSum, recordGross)) {
      issues.push({
        type: 'calculation_error',
        severity: 'error',
        field: 'grossPay',
        title: 'Gross pay ≠ sum of earnings (monthly)',
        details: `Sum of earnings: ₹${earningsSum.toFixed(2)}, stored gross: ₹${recordGross.toFixed(2)}`,
        expected: earningsSum,
        actual: recordGross,
        difference: round2(recordGross - earningsSum),
      });
    }

    if (expectedPaidDays === MONTHLY_DIVISOR) {
      const fullMonthGross = basicSalary + configHra + configConv + configLta + configSpec + configSupp + configKgp;
      if (recordGross > fullMonthGross + MONEY_TOLERANCE) {
        issues.push({
          type: 'policy_error',
          severity: 'error',
          field: 'grossPay',
          title: 'Gross exceeds full-month salary',
          details: `Full month gross: ₹${fullMonthGross.toFixed(2)}, calculated: ₹${recordGross.toFixed(2)}`,
          expected: fullMonthGross,
          actual: recordGross,
        });
      }
    }
  }

  const bonusInGross = p(record.bonus);
  if (bonusInGross > 0) {
    const earningsComponents = p(record.baseSalary) + p(record.hra) + p(record.conveyanceAllowance) +
      p(record.ltaAllowance) + p(record.specialAllowance) + p(record.supplementaryAllowance) +
      p(record.kgpAllowance) + p(record.overtimePay);
    if (moneyMatch(recordGross, earningsComponents + bonusInGross)) {
      issues.push({
        type: 'policy_error',
        severity: 'error',
        field: 'bonusInGross',
        title: 'Bonus included in gross pay',
        details: `Bonus (₹${bonusInGross.toFixed(2)}) appears to be included in gross pay. Bonus is CTC-only, not part of gross.`,
      });
    }
  }
}

function verifyNegativeValues(record: any, issues: VerificationIssue[]) {
  const fields = [
    { key: 'baseSalary', label: 'Base Salary' },
    { key: 'grossPay', label: 'Gross Pay' },
    { key: 'netPay', label: 'Net Pay' },
    { key: 'totalDeductions', label: 'Total Deductions' },
    { key: 'hra', label: 'HRA' },
    { key: 'employeePf', label: 'Employee PF' },
    { key: 'employeeEsic', label: 'Employee ESIC' },
    { key: 'professionalTax', label: 'Professional Tax' },
    { key: 'paidDays', label: 'Paid Days' },
  ];

  for (const f of fields) {
    const val = p(record[f.key]);
    if (val < 0) {
      issues.push({
        type: 'calculation_error',
        severity: 'error',
        field: f.key,
        title: `Negative ${f.label}`,
        details: `${f.label} is ₹${val.toFixed(2)}. No payroll field should be negative.`,
        actual: val,
      });
    }
  }
}

function verifyDeductions(
  record: any,
  snapshot: SourceSnapshot,
  salaryType: string,
  expectedPaidDays: number,
  issues: VerificationIssue[]
) {
  const sal = snapshot.salaryConfig;
  if (!sal) return;

  const basicSalary = p(sal.basicSalary);
  const recordGross = p(record.grossPay);

  let expectedBase: number;
  if (salaryType === 'daily') {
    expectedBase = round2(basicSalary * expectedPaidDays);
  } else {
    expectedBase = round2(basicSalary * (expectedPaidDays / MONTHLY_DIVISOR));
  }

  const pfBase = Math.min(expectedBase, 15000);
  const expectedEmployeePf = round2(pfBase * 0.12);
  const recordPf = p(record.employeePf);
  if (!moneyMatch(expectedEmployeePf, recordPf)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'employeePf',
      title: 'PF calculation mismatch',
      details: `PF base: min(${expectedBase.toFixed(2)}, 15000) = ${pfBase}. 12% = ₹${expectedEmployeePf.toFixed(2)}`,
      expected: expectedEmployeePf,
      actual: recordPf,
      difference: round2(recordPf - expectedEmployeePf),
    });
  }

  const expectedEmployeeEsic = recordGross <= 21000 ? round2(recordGross * 0.0075) : 0;
  const recordEsic = p(record.employeeEsic);
  if (!moneyMatch(expectedEmployeeEsic, recordEsic)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'employeeEsic',
      title: 'ESIC calculation mismatch',
      details: `Gross: ₹${recordGross.toFixed(2)}, threshold: 21000, expected ESIC: ₹${expectedEmployeeEsic.toFixed(2)}`,
      expected: expectedEmployeeEsic,
      actual: recordEsic,
      difference: round2(recordEsic - expectedEmployeeEsic),
    });
  }

  const expectedEmployerPf = round2(pfBase * 0.12);
  const recordEmployerPf = p(record.employerPf);
  if (!moneyMatch(expectedEmployerPf, recordEmployerPf)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'employerPf',
      title: 'Employer PF mismatch',
      details: `Expected: ₹${expectedEmployerPf.toFixed(2)}, stored: ₹${recordEmployerPf.toFixed(2)}`,
      expected: expectedEmployerPf,
      actual: recordEmployerPf,
      difference: round2(recordEmployerPf - expectedEmployerPf),
    });
  }

  const expectedEmployerEsic = recordGross <= 21000 ? round2(recordGross * 0.0325) : 0;
  const recordEmployerEsic = p(record.employerEsic);
  if (!moneyMatch(expectedEmployerEsic, recordEmployerEsic)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'employerEsic',
      title: 'Employer ESIC mismatch',
      details: `Expected: ₹${expectedEmployerEsic.toFixed(2)}, stored: ₹${recordEmployerEsic.toFixed(2)}`,
      expected: expectedEmployerEsic,
      actual: recordEmployerEsic,
      difference: round2(recordEmployerEsic - expectedEmployerEsic),
    });
  }

  const statutoryDeductions = p(record.employeePf) + p(record.employeeEsic) + p(record.professionalTax);
  const loanDed = p(record.loanDeductions);
  const advDed = p(record.advanceDeductions);
  const expectedTotalDed = round2(statutoryDeductions + loanDed + advDed);
  const recordTotalDed = p(record.totalDeductions);
  if (!moneyMatch(expectedTotalDed, recordTotalDed)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'totalDeductions',
      title: 'Total deductions sum mismatch',
      details: `PF(${p(record.employeePf)}) + ESIC(${p(record.employeeEsic)}) + PT(${p(record.professionalTax)}) + Loans(${loanDed}) + Advances(${advDed}) = ₹${expectedTotalDed.toFixed(2)}, stored: ₹${recordTotalDed.toFixed(2)}`,
      expected: expectedTotalDed,
      actual: recordTotalDed,
      difference: round2(recordTotalDed - expectedTotalDed),
    });
  }
}

function verifyNetPayAndCtc(
  record: any,
  snapshot: SourceSnapshot,
  salaryType: string,
  expectedPaidDays: number,
  issues: VerificationIssue[]
) {
  const recordGross = p(record.grossPay);
  const recordTotalDed = p(record.totalDeductions);
  const expectedNet = round2(recordGross - recordTotalDed);
  const recordNet = p(record.netPay);

  if (!moneyMatch(expectedNet, recordNet)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'netPay',
      title: 'Net pay arithmetic mismatch',
      details: `Gross(₹${recordGross.toFixed(2)}) - Deductions(₹${recordTotalDed.toFixed(2)}) = ₹${expectedNet.toFixed(2)}, stored: ₹${recordNet.toFixed(2)}`,
      expected: expectedNet,
      actual: recordNet,
      difference: round2(recordNet - expectedNet),
    });
  }

  const sal = snapshot.salaryConfig;
  if (!sal) return;

  const basicSalary = p(sal.basicSalary);
  const employerPf = p(record.employerPf);
  const employerEsic = p(record.employerEsic);
  const gratuity = p(record.gratuity);
  const groupInsurance = parseFloat(sal.groupInsurance || '1500');
  const bonusAllow = p(record.bonus);

  const expectedCtcMonthly = round2(recordGross + employerPf + employerEsic + gratuity + groupInsurance + bonusAllow);

  const calcSnap = record.calculationSnapshot as any;
  const storedCtcMonthly = calcSnap?.ctcMonthly || 0;
  if (storedCtcMonthly > 0 && !moneyMatch(expectedCtcMonthly, storedCtcMonthly)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'ctcMonthly',
      title: 'Monthly CTC mismatch',
      details: `Gross(${recordGross.toFixed(2)}) + EmployerPF(${employerPf.toFixed(2)}) + EmployerESIC(${employerEsic.toFixed(2)}) + Gratuity(${gratuity.toFixed(2)}) + GI(${groupInsurance.toFixed(2)}) + Bonus(${bonusAllow.toFixed(2)}) = ₹${expectedCtcMonthly.toFixed(2)}, stored: ₹${storedCtcMonthly.toFixed(2)}`,
      expected: expectedCtcMonthly,
      actual: storedCtcMonthly,
      difference: round2(storedCtcMonthly - expectedCtcMonthly),
    });
  }

  const storedCtcYearly = calcSnap?.ctcYearly || 0;
  const expectedCtcYearly = round2(expectedCtcMonthly * 12);
  if (storedCtcYearly > 0 && !moneyMatch(expectedCtcYearly, storedCtcYearly)) {
    issues.push({
      type: 'calculation_error',
      severity: 'error',
      field: 'ctcYearly',
      title: 'Annual CTC mismatch',
      details: `Monthly CTC(₹${expectedCtcMonthly.toFixed(2)}) × 12 = ₹${expectedCtcYearly.toFixed(2)}, stored: ₹${storedCtcYearly.toFixed(2)}`,
      expected: expectedCtcYearly,
      actual: storedCtcYearly,
      difference: round2(storedCtcYearly - expectedCtcYearly),
    });
  }
}

function verifyTdsReference(
  record: any,
  snapshot: SourceSnapshot,
  issues: VerificationIssue[]
) {
  const recordTds = p(record.tdsAmount) || p(record.incomeTax);
  const tdsRecord = snapshot.tdsRecord;

  if (tdsRecord) {
    const approvedTds = p(tdsRecord.monthlyTds);
    if (!moneyMatch(approvedTds, recordTds)) {
      issues.push({
        type: 'calculation_error',
        severity: 'error',
        field: 'tdsAmount',
        title: 'TDS mismatch with approved record',
        details: `Approved TDS: ₹${approvedTds.toFixed(2)}, payroll TDS: ₹${recordTds.toFixed(2)}`,
        expected: approvedTds,
        actual: recordTds,
        difference: round2(recordTds - approvedTds),
      });
    }
  } else if (recordTds > 0) {
    issues.push({
      type: 'info',
      severity: 'info',
      field: 'tdsAmount',
      title: 'TDS without reference record',
      details: `TDS of ₹${recordTds.toFixed(2)} applied but no tds_monthly_records entry found for cross-reference.`,
    });
  }
}

function verifySalaryTypeApplicability(
  record: any,
  snapshot: SourceSnapshot,
  salaryType: string,
  user: any,
  issues: VerificationIssue[]
) {
  if (salaryType === 'daily') {
    const kgpAllow = p(record.kgpAllowance);
    if (kgpAllow > 0) {
      issues.push({
        type: 'policy_warning',
        severity: 'warning',
        field: 'kgpAllowance',
        title: 'KGP allowance on daily worker',
        details: `KGP (₹${kgpAllow.toFixed(2)}) is typically a monthly-only component linked to KPI/DWAR.`,
      });
    }

    const dwarScore = p(record.dwarProductivityScore);
    if (dwarScore > 0 && dwarScore !== 100) {
      issues.push({
        type: 'policy_warning',
        severity: 'warning',
        field: 'dwarProductivityScore',
        title: 'KPI adjustment on daily worker',
        details: `DWAR productivity score (${dwarScore}%) was applied. KPI adjustments are typically monthly-only.`,
      });
    }
  }
}

function verifySlipDisplayConsistency(
  record: any,
  salaryType: string,
  issues: VerificationIssue[]
) {
  if (salaryType === 'daily') {
    if (p(record.lopDays) > 0) {
      issues.push({
        type: 'policy_warning',
        severity: 'warning',
        field: 'slipDisplay',
        title: 'Salary slip may show LOP for daily worker',
        details: `LOP (${p(record.lopDays)}) is stored but should not appear on daily salary slip.`,
      });
    }
  }

  if (salaryType === 'monthly') {
    const presentDays = p(record.presentDays);
    const lopDays = p(record.lopDays);
    const paidDays = p(record.paidDays);
    if (!daysMatch(paidDays, MONTHLY_DIVISOR - lopDays)) {
      issues.push({
        type: 'policy_warning',
        severity: 'warning',
        field: 'slipDisplay',
        title: 'Salary slip days inconsistency',
        details: `PaidDays(${paidDays}) should equal 30 - LOP(${lopDays}) = ${MONTHLY_DIVISOR - lopDays}.`,
      });
    }
  }
}

async function verifyEmployee(
  record: any,
  user: any,
  period: any
): Promise<EmployeeVerificationResult> {
  const issues: VerificationIssue[] = [];
  const salaryType = record.workerType === 'daily' ? 'daily' :
    (record.calculationSnapshot as any)?.salaryType || 'monthly';

  const snapshot = await fetchSourceSnapshot(record.userId, record.periodId, period);

  if (!snapshot.salaryConfig) {
    issues.push({
      type: 'data_completeness_error',
      severity: 'error',
      field: 'salaryConfig',
      title: 'No salary configuration found',
      details: `Employee has no active salary configuration. Cannot verify calculations.`,
    });

    return {
      userId: record.userId,
      username: user.cardName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
      employeeCode: user.employeeCode || '',
      salaryType,
      status: 'failed',
      issues,
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
      verifiedAt: new Date().toISOString(),
    };
  }

  const actualSalaryType = snapshot.salaryConfig.salaryType || salaryType;

  const { expectedPaidDays, expectedLopDays, expectedPresentDays } =
    verifyAttendanceAndDays(record, snapshot, actualSalaryType, user, issues);

  const recordPaidDays = p(record.paidDays);
  const paidDaysForCalcChecks = daysMatch(expectedPaidDays, recordPaidDays)
    ? expectedPaidDays
    : recordPaidDays;

  verifyLeaveImpact(record, snapshot, actualSalaryType, issues);
  verifyLeaveBalanceIntegrity(snapshot, issues);
  verifyEarnings(record, snapshot, actualSalaryType, paidDaysForCalcChecks, issues);
  verifyDeductions(record, snapshot, actualSalaryType, paidDaysForCalcChecks, issues);
  verifyNetPayAndCtc(record, snapshot, actualSalaryType, paidDaysForCalcChecks, issues);
  verifyTdsReference(record, snapshot, issues);
  verifySalaryTypeApplicability(record, snapshot, actualSalaryType, user, issues);
  verifySlipDisplayConsistency(record, actualSalaryType, issues);
  verifyNegativeValues(record, issues);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  return {
    userId: record.userId,
    username: user.cardName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
    employeeCode: user.employeeCode || '',
    salaryType: actualSalaryType,
    status: errorCount > 0 ? 'failed' : 'passed',
    issues,
    errorCount,
    warningCount,
    infoCount,
    verifiedAt: new Date().toISOString(),
  };
}

export async function verifyPeriod(
  periodId: number,
  verifiedBy: number,
  onlyFailed: boolean = false
): Promise<PeriodVerificationSummary> {
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
  if (!period) throw new Error(`Period ${periodId} not found`);

  let recordsQuery = db.select().from(payrollRecords)
    .where(eq(payrollRecords.periodId, periodId));

  const allRecords = await recordsQuery;

  const recordsToVerify = onlyFailed
    ? allRecords.filter(r => r.verificationStatus === 'failed')
    : allRecords;

  const userIds = [...new Set(recordsToVerify.map(r => r.userId))];
  const allUsers = userIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(allUsers.map(u => [u.id, u]));

  const employeeResults: EmployeeVerificationResult[] = [];

  for (const record of recordsToVerify) {
    const user = userMap.get(record.userId);
    if (!user) continue;

    try {
      const result = await verifyEmployee(record, user, period);
      employeeResults.push(result);

      await db.update(payrollRecords).set({
        verificationStatus: result.status,
        verificationRunAt: new Date(),
        verificationRunBy: verifiedBy,
        verificationDetails: {
          issues: result.issues,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
          infoCount: result.infoCount,
          sourceSnapshot: { cutoffTimestamp: new Date().toISOString() },
        },
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));
    } catch (err: any) {
      employeeResults.push({
        userId: record.userId,
        username: user.cardName || user.username,
        employeeCode: user.employeeCode || '',
        salaryType: 'unknown',
        status: 'error',
        issues: [{
          type: 'data_completeness_error',
          severity: 'error',
          field: 'system',
          title: 'Verification error',
          details: err.message,
        }],
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        verifiedAt: new Date().toISOString(),
      });

      await db.update(payrollRecords).set({
        verificationStatus: 'failed',
        verificationRunAt: new Date(),
        verificationRunBy: verifiedBy,
        verificationDetails: { error: err.message },
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));
    }
  }

  const allRecordsAfter = await db.select().from(payrollRecords)
    .where(eq(payrollRecords.periodId, periodId));

  const passed = allRecordsAfter.filter(r => r.verificationStatus === 'passed' || r.verificationStatus === 'overridden').length;
  const failed = allRecordsAfter.filter(r => r.verificationStatus === 'failed').length;
  const pending = allRecordsAfter.filter(r => r.verificationStatus === 'pending' || !r.verificationStatus).length;
  const hasErrors = failed > 0;
  const hasWarnings = employeeResults.some(r => r.warningCount > 0 && r.errorCount === 0);

  let periodVerificationStatus: PeriodVerificationSummary['periodVerificationStatus'];
  if (pending > 0) periodVerificationStatus = 'pending';
  else if (hasErrors) periodVerificationStatus = 'has_errors';
  else if (hasWarnings) periodVerificationStatus = 'has_warnings';
  else periodVerificationStatus = 'all_passed';

  return {
    periodId,
    periodName: period.periodName,
    totalRecords: allRecordsAfter.length,
    passed,
    failed,
    errors: failed,
    periodVerificationStatus,
    employeeResults,
    verifiedAt: new Date().toISOString(),
    verifiedBy,
  };
}

export async function getVerificationSummary(periodId: number): Promise<{
  periodId: number;
  totalRecords: number;
  passed: number;
  failed: number;
  pending: number;
  overridden: number;
  periodVerificationStatus: string;
}> {
  const records = await db.select().from(payrollRecords)
    .where(eq(payrollRecords.periodId, periodId));

  const passed = records.filter(r => r.verificationStatus === 'passed').length;
  const failed = records.filter(r => r.verificationStatus === 'failed').length;
  const overridden = records.filter(r => r.verificationStatus === 'overridden').length;
  const pending = records.filter(r => r.verificationStatus === 'pending' || !r.verificationStatus).length;

  let periodVerificationStatus: string;
  if (records.length === 0) periodVerificationStatus = 'no_records';
  else if (pending > 0) periodVerificationStatus = 'pending';
  else if (failed > 0) periodVerificationStatus = 'has_errors';
  else periodVerificationStatus = 'all_passed';

  return { periodId, totalRecords: records.length, passed, failed, pending, overridden, periodVerificationStatus };
}

export async function getEmployeeVerificationDetails(periodId: number, userId: number) {
  const [record] = await db.select().from(payrollRecords)
    .where(and(eq(payrollRecords.periodId, periodId), eq(payrollRecords.userId, userId)));

  if (!record) return null;

  return {
    recordId: record.id,
    userId: record.userId,
    verificationStatus: record.verificationStatus,
    verificationRunAt: record.verificationRunAt,
    verificationRunBy: record.verificationRunBy,
    verificationDetails: record.verificationDetails,
    verificationOverrideReason: record.verificationOverrideReason,
    verificationOverrideBy: record.verificationOverrideBy,
    verificationOverrideAt: record.verificationOverrideAt,
  };
}

export async function overrideVerification(
  recordId: number,
  overrideBy: number,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const [record] = await db.select().from(payrollRecords)
    .where(eq(payrollRecords.id, recordId));

  if (!record) return { success: false, message: 'Record not found' };

  const details = record.verificationDetails as any;
  const hasErrors = details?.issues?.some((i: any) =>
    i.type === 'calculation_error' || i.type === 'data_completeness_error' || i.type === 'policy_error'
  );

  if (hasErrors) {
    return {
      success: false,
      message: 'Cannot override records with calculation errors, data completeness errors, or policy errors. Only policy warnings can be overridden.',
    };
  }

  await db.update(payrollRecords).set({
    verificationStatus: 'overridden',
    verificationOverrideReason: reason,
    verificationOverrideBy: overrideBy,
    verificationOverrideAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(payrollRecords.id, recordId));

  return { success: true, message: 'Verification overridden successfully' };
}

export async function resetVerificationStatus(periodId: number, userId?: number) {
  if (userId) {
    await db.update(payrollRecords).set({
      verificationStatus: 'pending',
      verificationRunAt: null,
      verificationRunBy: null,
      verificationDetails: null,
      verificationOverrideReason: null,
      verificationOverrideBy: null,
      verificationOverrideAt: null,
      updatedAt: new Date(),
    }).where(and(eq(payrollRecords.periodId, periodId), eq(payrollRecords.userId, userId)));
  } else {
    await db.update(payrollRecords).set({
      verificationStatus: 'pending',
      verificationRunAt: null,
      verificationRunBy: null,
      verificationDetails: null,
      verificationOverrideReason: null,
      verificationOverrideBy: null,
      verificationOverrideAt: null,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.periodId, periodId));
  }
}

export async function canPostToSap(periodId: number): Promise<{
  allowed: boolean;
  reason?: string;
  summary?: { total: number; passed: number; failed: number; pending: number; overridden: number };
}> {
  const summary = await getVerificationSummary(periodId);

  if (summary.failed > 0) {
    return {
      allowed: false,
      reason: `${summary.failed} record(s) have verification errors. Fix and re-verify before posting to SAP.`,
      summary,
    };
  }

  if (summary.pending > 0) {
    return {
      allowed: false,
      reason: `${summary.pending} record(s) have not been verified yet. Run verification before posting to SAP.`,
      summary,
    };
  }

  return { allowed: true, summary };
}
