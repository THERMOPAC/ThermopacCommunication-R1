import { db } from './db';
import {
  taxSlabs,
  employeeTaxDeclarations,
  tdsMonthlyRecords,
  payrollPeriods,
  payrollRecords,
  users,
} from '@shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getTaxConfig, type TaxSlab } from './tax-config';

interface TaxComputationResult {
  grossSalaryMonthly: number;
  grossSalaryYtd: number;
  grossSalaryProjected: number;
  annualBonusIncluded: number;
  standardDeduction: number;
  totalDeductions: number;
  taxableIncomeProjected: number;
  taxOnProjectedIncome: number;
  cessAmount: number;
  surchargeAmount: number;
  section87aRebate: number;
  totalTaxLiabilityAnnual: number;
  tdsDeductedYtd: number;
  previousEmployerTds: number;
  tdsRequiredMonthly: number;
  catchUpAdjustment: number;
  tdsActualMonthly: number;
  financialYear: string;
}

// R3: Retained for Tax Slabs UI display tab — seeds tax_slabs DB table (New Regime only).
// Not called from computeMonthlyTds(). Only invoked by the seed-defaults endpoint.
export async function getDefaultSlabs(financialYear: string): Promise<void> {
  const existing = await db.select().from(taxSlabs).where(
    and(eq(taxSlabs.financialYear, financialYear), eq(taxSlabs.isActive, true))
  );
  if (existing.length > 0) return;

  const newRegimeSlabs = [
    { regime: 'new', financialYear, slabOrder: 1, minIncome: '0',        maxIncome: '400000',  rate: '0',  cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '1200000' },
    { regime: 'new', financialYear, slabOrder: 2, minIncome: '400001',   maxIncome: '800000',  rate: '5',  cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '1200000' },
    { regime: 'new', financialYear, slabOrder: 3, minIncome: '800001',   maxIncome: '1200000', rate: '10', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '1200000' },
    { regime: 'new', financialYear, slabOrder: 4, minIncome: '1200001',  maxIncome: '1600000', rate: '15', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '1200000' },
    { regime: 'new', financialYear, slabOrder: 5, minIncome: '1600001',  maxIncome: '2000000', rate: '20', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '1200000' },
    { regime: 'new', financialYear, slabOrder: 6, minIncome: '2000001',  maxIncome: '2400000', rate: '25', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '1200000' },
    { regime: 'new', financialYear, slabOrder: 7, minIncome: '2400001',  maxIncome: null,       rate: '30', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '1200000' },
  ];

  for (const slab of newRegimeSlabs) {
    await db.insert(taxSlabs).values(slab as any);
  }
}

// N4: In-memory slab arithmetic — uses FyTaxConfig slabs (numbers), not DB string records
function calculateTaxOnIncome(taxableIncome: number, slabs: TaxSlab[]): number {
  let tax = 0;
  for (const slab of slabs) {
    if (taxableIncome <= slab.min) break;
    const taxableInSlab = Math.min(taxableIncome, slab.max) - slab.min;
    if (taxableInSlab > 0) tax += taxableInSlab * slab.rate;
  }
  return tax;
}

export async function computeMonthlyTds(
  userId: number,
  periodId: number,
  currentMonth: number,
  currentYear: number,
  grossSalaryThisMonth: number,
  // Annual taxable bonus (e.g. statutory bonus = monthly bonusAllowance × 12).
  // Not paid monthly but fully taxable; included in projected annual income for TDS.
  annualBonus: number = 0
): Promise<TaxComputationResult> {
  const financialYear = currentMonth >= 4
    ? `${currentYear}-${(currentYear + 1).toString().slice(2)}`
    : `${currentYear - 1}-${currentYear.toString().slice(2)}`;

  const monthsElapsed = currentMonth >= 4 ? currentMonth - 3 : currentMonth + 9;
  const remainingMonths = 12 - monthsElapsed;

  // N1-N3: in-memory FY config — no DB query for slab arithmetic
  const config = getTaxConfig(financialYear);

  // C2: approved declarations only; reads previousEmployerIncome, previousEmployerTds, otherIncome
  const [declaration] = await db.select().from(employeeTaxDeclarations)
    .where(and(
      eq(employeeTaxDeclarations.userId, userId),
      eq(employeeTaxDeclarations.financialYear, financialYear),
      eq(employeeTaxDeclarations.status, 'approved')
    ));

  // YTD tracking from tds_monthly_records (prior periods in same FY only)
  const allTdsRecords = await db.select().from(tdsMonthlyRecords)
    .where(and(
      eq(tdsMonthlyRecords.userId, userId),
      eq(tdsMonthlyRecords.financialYear, financialYear)
    ));
  const previousTdsRecords = allTdsRecords.filter(r => r.periodId !== periodId);

  const tdsDeductedYtd = previousTdsRecords.reduce(
    (sum, r) => sum + parseFloat(r.tdsActualMonthly || '0'), 0
  );
  const grossSalaryYtd = previousTdsRecords.reduce(
    (sum, r) => sum + parseFloat(r.grossSalaryMonthly || '0'), 0
  ) + grossSalaryThisMonth;

  // Projected annual gross (forward projection from YTD)
  const monthsWithData = previousTdsRecords.length + 1;
  const projectedFromYtd = grossSalaryYtd + (grossSalaryThisMonth * remainingMonths);
  const annualizedFromCurrent = grossSalaryThisMonth * 12;
  const grossSalaryProjected = monthsWithData < monthsElapsed
    ? Math.max(annualizedFromCurrent, projectedFromYtd)
    : projectedFromYtd;

  // Previous employer income and other income (approved declaration only)
  const previousEmployerIncome = declaration
    ? parseFloat(declaration.previousEmployerIncome || '0') : 0;
  const previousEmployerTds = declaration
    ? parseFloat(declaration.previousEmployerTds || '0') : 0;
  const otherIncome = declaration
    ? parseFloat(declaration.otherIncome || '0') : 0;
  // Annual bonus is taxable even though it is not paid monthly.
  // Added once (not per month) to the projected annual income as a lump-sum.
  const totalGrossProjected = grossSalaryProjected + previousEmployerIncome + otherIncome + annualBonus;

  // New Regime: only standard deduction from FY config
  const standardDeduction = config.standardDeduction;
  const totalDeductions = standardDeduction;
  const taxableIncomeProjected = Math.max(0, totalGrossProjected - totalDeductions);

  // Slab tax on projected taxable income — in-memory, no DB query
  let taxOnProjectedIncome = calculateTaxOnIncome(taxableIncomeProjected, config.slabs);

  // C4: correct Section 87A — eligibility threshold + capped rebate from FY config
  let section87aRebate = 0;
  if (taxableIncomeProjected <= config.section87aRebateLimit) {
    section87aRebate = Math.min(taxOnProjectedIncome, config.section87aRebateCap);
    taxOnProjectedIncome = Math.max(0, taxOnProjectedIncome - section87aRebate);
  }

  const cessAmount = taxOnProjectedIncome * config.cessRate;
  const surchargeAmount = 0; // No THERMOPAC employee currently exceeds ₹50L
  const totalTaxLiabilityAnnual = Math.max(0, taxOnProjectedIncome + cessAmount + surchargeAmount);

  // Remaining TDS to collect this FY
  const totalTdsRequired = totalTaxLiabilityAnnual - previousEmployerTds;
  const tdsRemaining = Math.max(0, totalTdsRequired - tdsDeductedYtd);

  // C6: monthsLeft always uses actual remaining months — no special first-month exception
  const monthsLeft = Math.max(1, remainingMonths + 1);
  const tdsRequiredMonthly = Math.round((tdsRemaining / monthsLeft) * 100) / 100;

  const catchUpAdjustment = 0;
  const tdsActualMonthly = Math.max(0, tdsRequiredMonthly + catchUpAdjustment);

  return {
    grossSalaryMonthly: grossSalaryThisMonth,
    grossSalaryYtd,
    grossSalaryProjected,
    annualBonusIncluded: annualBonus,
    standardDeduction,
    totalDeductions,
    taxableIncomeProjected,
    taxOnProjectedIncome,
    cessAmount,
    surchargeAmount,
    section87aRebate,
    totalTaxLiabilityAnnual,
    tdsDeductedYtd,
    previousEmployerTds,
    tdsRequiredMonthly,
    catchUpAdjustment,
    tdsActualMonthly,
    financialYear,
  };
}

// R4: Old Regime fields removed — regime column retained for DB schema compatibility
export async function saveTdsRecord(
  userId: number,
  periodId: number,
  month: number,
  year: number,
  computation: TaxComputationResult
): Promise<any> {
  const financialYear = computation.financialYear;

  const existing = await db.select().from(tdsMonthlyRecords)
    .where(and(
      eq(tdsMonthlyRecords.userId, userId),
      eq(tdsMonthlyRecords.periodId, periodId)
    ));

  const record = {
    userId,
    periodId,
    financialYear,
    month,
    year,
    grossSalaryMonthly: computation.grossSalaryMonthly.toFixed(2),
    grossSalaryYtd: computation.grossSalaryYtd.toFixed(2),
    grossSalaryProjected: computation.grossSalaryProjected.toFixed(2),
    standardDeduction: computation.standardDeduction.toFixed(2),
    totalDeductions: computation.totalDeductions.toFixed(2),
    taxableIncomeProjected: computation.taxableIncomeProjected.toFixed(2),
    taxOnProjectedIncome: computation.taxOnProjectedIncome.toFixed(2),
    cessAmount: computation.cessAmount.toFixed(2),
    surchargeAmount: computation.surchargeAmount.toFixed(2),
    section87aRebate: computation.section87aRebate.toFixed(2),
    totalTaxLiabilityAnnual: computation.totalTaxLiabilityAnnual.toFixed(2),
    tdsDeductedYtd: computation.tdsDeductedYtd.toFixed(2),
    previousEmployerTds: computation.previousEmployerTds.toFixed(2),
    tdsRequiredMonthly: computation.tdsRequiredMonthly.toFixed(2),
    catchUpAdjustment: computation.catchUpAdjustment.toFixed(2),
    tdsActualMonthly: computation.tdsActualMonthly.toFixed(2),
    regime: 'new', // always New Regime; column retained for DB schema compatibility
    calculationSnapshot: computation,
  };

  if (existing.length > 0) {
    const [updated] = await db.update(tdsMonthlyRecords)
      .set(record)
      .where(eq(tdsMonthlyRecords.id, existing[0].id))
      .returning();
    return updated;
  }

  const [inserted] = await db.insert(tdsMonthlyRecords)
    .values(record as any)
    .returning();
  return inserted;
}

export async function computeAndSaveTdsForPeriod(
  periodId: number,
  executedBy: number
): Promise<{ processed: number; errors: number; details: any[] }> {
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
  if (!period) throw new Error('Period not found');

  const endDate = new Date(period.endDate);
  const month = endDate.getMonth() + 1;
  const year = endDate.getFullYear();

  // C3: official records only — trial records excluded from TDS computation
  const records = await db.select().from(payrollRecords)
    .where(and(
      eq(payrollRecords.periodId, periodId),
      eq(payrollRecords.recordType as any, 'official')
    ));

  let processed = 0;
  let errors = 0;
  const details: any[] = [];

  for (const record of records) {
    try {
      const grossSalary = parseFloat(record.grossPay);
      // Annual bonus = monthly bonusAllowance stored on the payroll record × 12.
      // Bonus is not paid monthly but is fully taxable; included in projected annual income.
      const annualBonus = parseFloat(record.bonus || '0') * 12;
      const computation = await computeMonthlyTds(record.userId, periodId, month, year, grossSalary, annualBonus);
      await saveTdsRecord(record.userId, periodId, month, year, computation);

      const pf = parseFloat(record.employeePf || record.providentFund || '0');
      const pt = parseFloat(record.professionalTax || '0');
      const esic = parseFloat(record.employeeEsic || record.esic || '0');
      const loanDed = parseFloat(record.loanDeductions || '0');
      const advDed = parseFloat(record.advanceDeductions || '0');
      const statutoryPlusTds = pf + pt + esic + computation.tdsActualMonthly;
      const allDeductions = statutoryPlusTds + loanDed + advDed;

      await db.update(payrollRecords).set({
        incomeTax: computation.tdsActualMonthly.toFixed(2),
        tdsAmount: computation.tdsActualMonthly.toFixed(2),
        totalDeductions: allDeductions.toFixed(2),
        netPay: (grossSalary - allDeductions).toFixed(2),
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));

      processed++;
      details.push({
        userId: record.userId,
        tds: computation.tdsActualMonthly,
        taxableIncome: computation.taxableIncomeProjected,
        financialYear: computation.financialYear,
      });
    } catch (err: any) {
      errors++;
      details.push({ userId: record.userId, error: err.message });
    }
  }

  if (records.length > 0) {
    const updatedRecords = await db.select().from(payrollRecords)
      .where(eq(payrollRecords.periodId, periodId));
    const totalDed = updatedRecords.reduce((s, r) => s + parseFloat(r.totalDeductions || '0'), 0);
    const totalNet = updatedRecords.reduce((s, r) => s + parseFloat(r.netPay), 0);

    await db.update(payrollPeriods).set({
      totalDeductions: totalDed.toFixed(2),
      totalNetPay: totalNet.toFixed(2),
    }).where(eq(payrollPeriods.id, periodId));
  }

  return { processed, errors, details };
}

export async function getTdsRecordsForEmployee(
  userId: number,
  financialYear: string
): Promise<any[]> {
  return db.select().from(tdsMonthlyRecords)
    .where(and(
      eq(tdsMonthlyRecords.userId, userId),
      eq(tdsMonthlyRecords.financialYear, financialYear)
    ))
    .orderBy(asc(tdsMonthlyRecords.month));
}

export async function getTdsRecordsForPeriod(periodId: number): Promise<any[]> {
  return db.select({
    id: tdsMonthlyRecords.id,
    userId: tdsMonthlyRecords.userId,
    userName: users.username,
    month: tdsMonthlyRecords.month,
    year: tdsMonthlyRecords.year,
    financialYear: tdsMonthlyRecords.financialYear,
    grossSalaryMonthly: tdsMonthlyRecords.grossSalaryMonthly,
    taxableIncomeProjected: tdsMonthlyRecords.taxableIncomeProjected,
    totalTaxLiabilityAnnual: tdsMonthlyRecords.totalTaxLiabilityAnnual,
    tdsActualMonthly: tdsMonthlyRecords.tdsActualMonthly,
    tdsDeductedYtd: tdsMonthlyRecords.tdsDeductedYtd,
  })
  .from(tdsMonthlyRecords)
  .leftJoin(users, eq(tdsMonthlyRecords.userId, users.id))
  .where(eq(tdsMonthlyRecords.periodId, periodId))
  .orderBy(asc(users.username));
}
