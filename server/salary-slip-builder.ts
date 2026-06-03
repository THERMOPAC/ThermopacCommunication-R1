/**
 * Salary Slip Data Builder
 * Shared helper used by both the GET /salary-slip/:id download route
 * and the post-SAP email dispatch to build SalarySlipData from a payroll record ID.
 */
import { db } from './db';
import {
  payrollRecords,
  users,
  payrollPeriods,
  payrollAttendanceSnapshot,
  leaveTypes,
  leaveBalances,
  leaveRequests,
  leaveAccrualLog,
  attendanceRecords,
  companyHolidays,
} from '../shared/schema';
import { eq, and, desc, gte, lte, inArray } from 'drizzle-orm';
import { SalarySlipData } from './salary-slip-generator';
import { numberToWords } from './salary-slip-generator';

export interface BuiltSalarySlip {
  slipData: SalarySlipData;
  employeeEmail: string | null;
  employeeFullName: string;
  filename: string;
}

export async function buildSalarySlipData(recordId: number): Promise<BuiltSalarySlip | null> {
  const payrollRecord = await db
    .select({
      id: payrollRecords.id,
      periodId: payrollRecords.periodId,
      userId: payrollRecords.userId,
      baseSalary: payrollRecords.baseSalary,
      grossPay: payrollRecords.grossPay,
      netPay: payrollRecords.netPay,
      incomeTax: payrollRecords.incomeTax,
      professionalTax: payrollRecords.professionalTax,
      providentFund: payrollRecords.providentFund,
      hra: payrollRecords.hra,
      conveyanceAllowance: payrollRecords.conveyanceAllowance,
      ltaAllowance: payrollRecords.ltaAllowance,
      specialAllowance: payrollRecords.specialAllowance,
      supplementaryAllowance: payrollRecords.supplementaryAllowance,
      kgpAllowance: payrollRecords.kgpAllowance,
      overtimePay: payrollRecords.overtimePay,
      bonus: payrollRecords.bonus,
      otherAllowances: payrollRecords.otherAllowances,
      esic: payrollRecords.esic,
      groupInsurance: payrollRecords.groupInsurance,
      otherDeductions: payrollRecords.otherDeductions,
      employeePf: payrollRecords.employeePf,
      employeeEsic: payrollRecords.employeeEsic,
      employerPf: payrollRecords.employerPf,
      employerEsic: payrollRecords.employerEsic,
      gratuity: payrollRecords.gratuity,
      calculationSnapshot: payrollRecords.calculationSnapshot,
      presentDays: payrollRecords.presentDays,
      paidDays: payrollRecords.paidDays,
      lopDays: payrollRecords.lopDays,
      workingDays: payrollRecords.workingDays,
      paidLeaveDays: payrollRecords.paidLeaveDays,
      unpaidLeaveDays: payrollRecords.unpaidLeaveDays,
      totalDeductions: payrollRecords.totalDeductions,
      loanDeductions: payrollRecords.loanDeductions,
      advanceDeductions: payrollRecords.advanceDeductions,
      createdAt: payrollRecords.createdAt,

      employeeName: users.username,
      employeeCode: users.employeeCode,
      firstName: users.firstName,
      lastName: users.lastName,
      jobTitle: users.jobTitle,
      userRole: users.role,
      department: users.department,
      panNumber: users.panNumber,
      dateOfJoining: users.dateOfJoining,
      userSalaryType: users.salaryType,
      weeklyOffDays: users.weeklyOffDays,
      email: users.email,

      periodName: payrollPeriods.periodName,
      startDate: payrollPeriods.startDate,
      endDate: payrollPeriods.endDate,
    })
    .from(payrollRecords)
    .innerJoin(users, eq(payrollRecords.userId, users.id))
    .innerJoin(payrollPeriods, eq(payrollRecords.periodId, payrollPeriods.id))
    .where(eq(payrollRecords.id, recordId))
    .limit(1);

  if (!payrollRecord.length) return null;

  const record = payrollRecord[0];
  const workingDays = parseInt((record as any).workingDays?.toString() || '26');

  const employeeFullName =
    record.firstName && record.lastName
      ? `${record.firstName} ${record.lastName}`
      : record.employeeName;

  const calcSnap = (record as any).calculationSnapshot || {};
  const deductions = calcSnap.deductions || {};
  const salaryType = calcSnap.salaryType || (record as any).userSalaryType || 'monthly';
  const salaryBasis = salaryType === 'daily' ? 'actual_days' : 30;

  const employerPf = parseFloat(
    (record as any).employerPf?.toString() || deductions.employerPF?.toString() || '0'
  );
  const employerEsic = parseFloat(
    (record as any).employerEsic?.toString() || deductions.employerESIC?.toString() || '0'
  );
  const gratuity = parseFloat(
    (record as any).gratuity?.toString() || deductions.gratuity?.toString() || '0'
  );
  const groupInsuranceVal = parseFloat(
    record.groupInsurance?.toString() || deductions.groupInsurance?.toString() || '0'
  );
  const bonus = parseFloat(record.bonus?.toString() || '0');
  const kgpAllowance = parseFloat(record.kgpAllowance?.toString() || '0');

  const basicComp = parseFloat(record.baseSalary?.toString() || '0');
  const hraComp = parseFloat(record.hra?.toString() || '0');
  const convComp = parseFloat(record.conveyanceAllowance?.toString() || '0');
  const ltaComp = parseFloat(record.ltaAllowance?.toString() || '0');
  const specComp = parseFloat(record.specialAllowance?.toString() || '0');
  const suppComp = parseFloat(record.supplementaryAllowance?.toString() || '0');
  const kgpComp = parseFloat(record.kgpAllowance?.toString() || '0');
  const otComp = parseFloat(record.overtimePay?.toString() || '0');
  const otherAllowComp = parseFloat(record.otherAllowances?.toString() || '0');
  const grossPay =
    basicComp + hraComp + convComp + ltaComp + specComp + suppComp + kgpComp + otComp + otherAllowComp;

  const ctcMonthly = grossPay + employerPf + employerEsic + gratuity + groupInsuranceVal + bonus;

  const [empUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, record.userId))
    .limit(1);
  const kgpPercent =
    kgpAllowance > 0 && ['Manager', 'Employee'].includes(empUser?.role || '') ? 15 : 0;

  const [snapRow] = await db
    .select({ calculationSnapshot: payrollRecords.calculationSnapshot })
    .from(payrollRecords)
    .where(eq(payrollRecords.id, recordId))
    .limit(1);
  const directSnap = (snapRow?.calculationSnapshot || {}) as any;
  const actualKpiPercent: number | null = (() => {
    const v =
      directSnap?.kpiAdjustment?.compositeKpiPercent ??
      calcSnap?.kpiAdjustment?.compositeKpiPercent;
    if (v != null) return parseFloat(String(v));
    return null;
  })();

  const snap = await db
    .select()
    .from(payrollAttendanceSnapshot)
    .where(
      and(
        eq(payrollAttendanceSnapshot.periodId, record.periodId),
        eq(payrollAttendanceSnapshot.userId, record.userId)
      )
    )
    .orderBy(desc(payrollAttendanceSnapshot.runNumber))
    .limit(1);

  const attSnap = snap[0];

  let fallbackHolidayCount = 0;
  if (!attSnap) {
    const holidaysInPeriod = await db
      .select({ date: companyHolidays.date })
      .from(companyHolidays)
      .where(
        and(
          gte(companyHolidays.date, record.startDate as string),
          lte(companyHolidays.date, record.endDate as string)
        )
      );
    fallbackHolidayCount = holidaysInPeriod.length;
  }

  const paidDays = attSnap
    ? parseFloat(attSnap.paidDays?.toString() || '30')
    : parseFloat((record as any).paidDays?.toString() || '30');
  const presentDays = attSnap
    ? parseFloat(attSnap.presentDays?.toString() || '0')
    : parseFloat((record as any).presentDays?.toString() || paidDays.toString());
  const lopDays = attSnap
    ? parseFloat(attSnap.lopDays?.toString() || '0')
    : parseFloat((record as any).lopDays?.toString() || '0');
  const absentDays = attSnap
    ? parseFloat(attSnap.absentDays?.toString() || '0')
    : lopDays;
  const holidays = attSnap ? (attSnap.holidays || 0) : fallbackHolidayCount;
  const weeklyOffs = attSnap
    ? (attSnap.weeklyOffs || 0)
    : (() => {
        const sDate = new Date(record.startDate as string);
        const eDate = new Date(record.endDate as string);
        const calendarDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;
        const recordWorkingDays = parseInt((record as any).workingDays?.toString() || '0');
        return Math.max(0, calendarDays - recordWorkingDays - fallbackHolidayCount);
      })();

  const employeePfVal = Math.round(parseFloat(record.providentFund?.toString() || '0'));
  const ptVal = Math.round(parseFloat(record.professionalTax?.toString() || '0'));
  const esicVal = Math.round(parseFloat(record.esic?.toString() || '0'));
  const tdsVal = Math.round(parseFloat(record.incomeTax?.toString() || '0'));
  const otherDeductionsVal = Math.round(parseFloat(record.otherDeductions?.toString() || '0'));
  const loanDeductionVal = Math.round(parseFloat(record.loanDeductions?.toString() || '0'));
  const advanceDeductionVal = Math.round(parseFloat(record.advanceDeductions?.toString() || '0'));
  const actualTotalDeductions =
    employeePfVal + ptVal + esicVal + tdsVal + otherDeductionsVal + loanDeductionVal + advanceDeductionVal;
  const actualNetPay = Math.round(grossPay) - actualTotalDeductions;

  const salarySlipData: SalarySlipData = {
    employee: {
      name: employeeFullName,
      employeeCode: record.employeeCode || 'N/A',
      designation: (record as any).userRole || 'N/A',
      department: record.department || 'N/A',
      joiningDate: (record as any).dateOfJoining || 'N/A',
      panNumber: (record as any).panNumber || 'N/A',
    },
    company: {
      name: 'THERMOPAC',
      address:
        'L 4, 405 The Summit Business Bay, Vile Parle Western Express Highway Vile Parle Mumbai India 400 057',
    },
    period: {
      month: (() => {
        const pn = record.periodName || '';
        const yr = new Date(record.startDate as string).getFullYear();
        if (pn && pn.includes(yr.toString())) {
          return pn.replace(` ${yr}`, '').replace(`${yr}`, '');
        }
        return pn || new Date(record.startDate as string).toLocaleDateString('en-US', { month: 'long' });
      })(),
      year: new Date(record.startDate as string).getFullYear(),
      workingDays,
      paidDays,
      salaryBasis,
      salaryType,
      holidays,
      weeklyOffs,
      absentDays,
      presentDays,
      paidLeaveDays: attSnap
        ? parseFloat(attSnap.paidLeaveDays?.toString() || '0')
        : parseFloat((record as any).paidLeaveDays?.toString() || '0'),
      unpaidLeaveDays: attSnap
        ? parseFloat(attSnap.unpaidLeaveDays?.toString() || '0')
        : parseFloat((record as any).unpaidLeaveDays?.toString() || '0'),
      lopDays,
    },
    earnings: {
      basicSalary: Math.round(basicComp),
      hra: Math.round(hraComp),
      conveyanceAllowance: Math.round(convComp),
      ltaAllowance: Math.round(ltaComp),
      specialAllowance: Math.round(specComp),
      supplementaryAllowance: Math.round(suppComp),
      kgpAllowance: Math.round(kgpAllowance),
      overtimePay: Math.round(otComp),
      bonus: Math.round(bonus),
      otherAllowances: Math.round(otherAllowComp),
    },
    deductions: {
      providentFund: employeePfVal,
      professionalTax: ptVal,
      incomeTax: tdsVal,
      esic: esicVal,
      groupInsurance: 0,
      otherDeductions: otherDeductionsVal,
      loanDeduction: loanDeductionVal,
      advanceDeduction: advanceDeductionVal,
    },
    employerCosts: {
      esicEmployer: Math.round(employerEsic),
      groupInsurance: Math.round(groupInsuranceVal),
      pfEmployer: Math.round(employerPf),
      gratuity: Math.round(gratuity),
    },
    totals: {
      grossEarnings: Math.round(grossPay),
      totalDeductions: actualTotalDeductions,
      netPay: actualNetPay,
      ctcMonthly: Math.round(ctcMonthly),
      ctcYearly: Math.round(ctcMonthly) * 12,
    },
    kgpPercent,
    actualKpiPercent,
    netPayInWords: numberToWords(Math.round(actualNetPay)),
    leaveBalances: [],
  };

  // Leave balances
  const periodYear = new Date(record.startDate as string).getFullYear();
  const activeLeaveTypes = await db
    .select()
    .from(leaveTypes)
    .where(eq(leaveTypes.isActive, true));
  const empLeaveBalances = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.userId, record.userId), eq(leaveBalances.year, periodYear)));
  const balanceMap = new Map(empLeaveBalances.map((b) => [b.leaveTypeId, b]));

  const monthlyLeaveReqs = await db
    .select({ leaveTypeId: leaveRequests.leaveTypeId, totalDays: leaveRequests.totalDays })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, record.userId),
        eq(leaveRequests.status, 'approved'),
        gte(leaveRequests.startDate, record.startDate as string),
        lte(leaveRequests.startDate, record.endDate as string)
      )
    );
  const usedInMonthMap = new Map<number, number>();
  for (const req of monthlyLeaveReqs) {
    usedInMonthMap.set(
      req.leaveTypeId,
      (usedInMonthMap.get(req.leaveTypeId) || 0) + parseFloat(req.totalDays?.toString() || '0')
    );
  }

  const periodEndExtended = new Date(record.endDate as string);
  periodEndExtended.setDate(periodEndExtended.getDate() + 2);
  const monthlyAccruals = await db
    .select({ leaveTypeId: leaveAccrualLog.leaveTypeId, daysAccrued: leaveAccrualLog.daysAccrued })
    .from(leaveAccrualLog)
    .where(
      and(
        eq(leaveAccrualLog.userId, record.userId),
        gte(leaveAccrualLog.createdAt, new Date(record.startDate as string)),
        lte(leaveAccrualLog.createdAt, periodEndExtended)
      )
    );
  const accruedInMonthMap = new Map<number, number>();
  for (const acc of monthlyAccruals) {
    accruedInMonthMap.set(
      acc.leaveTypeId,
      (accruedInMonthMap.get(acc.leaveTypeId) || 0) + parseFloat(acc.daysAccrued?.toString() || '0')
    );
  }

  for (const lt of activeLeaveTypes) {
    if (['ML', 'PL', 'BL', 'ST'].includes(lt.code)) continue;
    const bal = balanceMap.get(lt.id);
    if (!bal) continue;
    const allocated = parseFloat(bal.allocatedDays?.toString() || '0');
    const carryover = parseFloat(bal.carryoverDays?.toString() || '0');
    const usedYTD = parseFloat(bal.usedDays?.toString() || '0');
    const currentClosing = Math.max(0, allocated + carryover - usedYTD);
    const usedInMonth = usedInMonthMap.get(lt.id) || 0;
    const accruedInMonth = accruedInMonthMap.get(lt.id) || 0;
    const opening = currentClosing + usedInMonth - accruedInMonth;
    if (opening === 0 && usedInMonth === 0 && accruedInMonth === 0) continue;
    salarySlipData.leaveBalances!.push({
      leaveType: lt.code,
      opening: Math.max(0, opening),
      used: usedInMonth,
      accrued: accruedInMonth,
      closing: currentClosing,
    });
  }

  // Absent date entries
  const absentRecords = await db
    .select({ date: attendanceRecords.date, status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.userId, record.userId),
        gte(attendanceRecords.date, record.startDate as string),
        lte(attendanceRecords.date, record.endDate as string),
        inArray(attendanceRecords.status, ['absent', 'half_day'])
      )
    )
    .orderBy(attendanceRecords.date);

  const allAttRecords = await db
    .select({ date: attendanceRecords.date })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.userId, record.userId),
        gte(attendanceRecords.date, record.startDate as string),
        lte(attendanceRecords.date, record.endDate as string)
      )
    );
  const recordedDates = new Set(allAttRecords.map((r) => r.date));

  const holidayRecords = await db
    .select({ date: companyHolidays.date })
    .from(companyHolidays)
    .where(
      and(
        gte(companyHolidays.date, record.startDate as string),
        lte(companyHolidays.date, record.endDate as string)
      )
    );
  const holidaySet = new Set(holidayRecords.map((r) => r.date));

  const empUser2 = await db
    .select({ weeklyOffDays: users.weeklyOffDays })
    .from(users)
    .where(eq(users.id, record.userId))
    .limit(1);
  const weeklyOffDays: number[] = empUser2[0]?.weeklyOffDays || [0];

  const absentDateEntries: { date: string; type: string }[] = [];
  for (const r of absentRecords) {
    absentDateEntries.push({
      date: r.date,
      type: r.status === 'half_day' ? 'Half Day' : 'LOP',
    });
  }

  const startStr =
    typeof record.startDate === 'string'
      ? record.startDate
      : new Date(record.startDate as any).toISOString().split('T')[0];
  const endStr =
    typeof record.endDate === 'string'
      ? record.endDate
      : new Date(record.endDate as any).toISOString().split('T')[0];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const pStart = new Date(sy, sm - 1, sd);
  const pEnd = new Date(ey, em - 1, ed);
  for (let dt = new Date(pStart); dt <= pEnd; dt.setDate(dt.getDate() + 1)) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = dt.getDay();
    if (weeklyOffDays.includes(dayOfWeek)) continue;
    if (holidaySet.has(dateStr)) continue;
    if (recordedDates.has(dateStr)) continue;
    absentDateEntries.push({ date: dateStr, type: 'LOP' });
  }
  absentDateEntries.sort((a, b) => a.date.localeCompare(b.date));
  salarySlipData.absentDates = absentDateEntries;

  const fn = `Salary_Slip_${employeeFullName.replace(/\s+/g, '_')}_${salarySlipData.period.month}_${salarySlipData.period.year}.pdf`;

  return {
    slipData: salarySlipData,
    employeeEmail: (record as any).email || null,
    employeeFullName,
    filename: fn,
  };
}
