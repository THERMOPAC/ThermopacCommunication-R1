import { db } from './db';
import {
  taxSlabs,
  employeeTaxDeclarations,
  tdsMonthlyRecords,
  employeeSalaries,
  payrollPeriods,
  payrollRecords,
  users,
} from '@shared/schema';
import { eq, and, asc, desc, lte, gte, sql } from 'drizzle-orm';

interface TaxComputationResult {
  grossSalaryMonthly: number;
  grossSalaryYtd: number;
  grossSalaryProjected: number;
  standardDeduction: number;
  hraExemption: number;
  section80cDeduction: number;
  section80dDeduction: number;
  otherChapter6aDeductions: number;
  section24bDeduction: number;
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
  regime: string;
}

export async function getDefaultSlabs(financialYear: string): Promise<void> {
  const existing = await db.select().from(taxSlabs).where(
    and(eq(taxSlabs.financialYear, financialYear), eq(taxSlabs.isActive, true))
  );

  if (existing.length > 0) return;

  const newRegimeSlabs = [
    { regime: 'new', financialYear, slabOrder: 1, minIncome: '0', maxIncome: '400000', rate: '0', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '700000' },
    { regime: 'new', financialYear, slabOrder: 2, minIncome: '400001', maxIncome: '800000', rate: '5', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '700000' },
    { regime: 'new', financialYear, slabOrder: 3, minIncome: '800001', maxIncome: '1200000', rate: '10', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '700000' },
    { regime: 'new', financialYear, slabOrder: 4, minIncome: '1200001', maxIncome: '1600000', rate: '15', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '700000' },
    { regime: 'new', financialYear, slabOrder: 5, minIncome: '1600001', maxIncome: '2000000', rate: '20', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '700000' },
    { regime: 'new', financialYear, slabOrder: 6, minIncome: '2000001', maxIncome: '2400000', rate: '25', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '700000' },
    { regime: 'new', financialYear, slabOrder: 7, minIncome: '2400001', maxIncome: null, rate: '30', cessRate: '4.00', surchargeRate: '0', standardDeduction: '75000', section87aRebateLimit: '700000' },
  ];

  const oldRegimeSlabs = [
    { regime: 'old', financialYear, slabOrder: 1, minIncome: '0', maxIncome: '250000', rate: '0', cessRate: '4.00', surchargeRate: '0', standardDeduction: '50000', section87aRebateLimit: '500000' },
    { regime: 'old', financialYear, slabOrder: 2, minIncome: '250001', maxIncome: '500000', rate: '5', cessRate: '4.00', surchargeRate: '0', standardDeduction: '50000', section87aRebateLimit: '500000' },
    { regime: 'old', financialYear, slabOrder: 3, minIncome: '500001', maxIncome: '1000000', rate: '20', cessRate: '4.00', surchargeRate: '0', standardDeduction: '50000', section87aRebateLimit: '500000' },
    { regime: 'old', financialYear, slabOrder: 4, minIncome: '1000001', maxIncome: null, rate: '30', cessRate: '4.00', surchargeRate: '0', standardDeduction: '50000', section87aRebateLimit: '500000' },
  ];

  for (const slab of [...newRegimeSlabs, ...oldRegimeSlabs]) {
    await db.insert(taxSlabs).values(slab as any);
  }
}

function calculateHraExemption(
  basicSalaryAnnual: number,
  hraReceivedAnnual: number,
  monthlyRentPaid: number,
  isMetroCity: boolean
): number {
  if (monthlyRentPaid <= 0) return 0;

  const annualRentPaid = monthlyRentPaid * 12;
  const metroPercent = isMetroCity ? 0.5 : 0.4;

  const exemption1 = hraReceivedAnnual;
  const exemption2 = annualRentPaid - (0.1 * basicSalaryAnnual);
  const exemption3 = metroPercent * basicSalaryAnnual;

  return Math.max(0, Math.min(exemption1, exemption2, exemption3));
}

function calculateTaxOnIncome(taxableIncome: number, slabs: any[]): number {
  let tax = 0;

  for (const slab of slabs) {
    const min = parseFloat(slab.minIncome);
    const max = slab.maxIncome ? parseFloat(slab.maxIncome) : Infinity;
    const rate = parseFloat(slab.rate) / 100;

    if (taxableIncome <= min) break;

    const taxableInSlab = Math.min(taxableIncome, max) - min;
    if (taxableInSlab > 0) {
      tax += taxableInSlab * rate;
    }
  }

  return tax;
}

export async function computeMonthlyTds(
  userId: number,
  periodId: number,
  currentMonth: number,
  currentYear: number,
  grossSalaryThisMonth: number
): Promise<TaxComputationResult> {
  const financialYear = currentMonth >= 4
    ? `${currentYear}-${(currentYear + 1).toString().slice(2)}`
    : `${currentYear - 1}-${currentYear.toString().slice(2)}`;

  const monthsElapsed = currentMonth >= 4 ? currentMonth - 3 : currentMonth + 9;
  const remainingMonths = 12 - monthsElapsed;

  await getDefaultSlabs(financialYear);

  const [declaration] = await db.select().from(employeeTaxDeclarations)
    .where(and(
      eq(employeeTaxDeclarations.userId, userId),
      eq(employeeTaxDeclarations.financialYear, financialYear)
    ));

  const regime = 'new';

  const slabs = await db.select().from(taxSlabs)
    .where(and(
      eq(taxSlabs.financialYear, financialYear),
      eq(taxSlabs.regime, regime),
      eq(taxSlabs.isActive, true)
    ))
    .orderBy(asc(taxSlabs.slabOrder));

  if (slabs.length === 0) {
    throw new Error(`No tax slabs found for FY ${financialYear}, regime ${regime}`);
  }

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

  const monthsWithData = previousTdsRecords.length + 1;
  const annualizedFromCurrent = grossSalaryThisMonth * 12;
  const projectedFromYtd = grossSalaryYtd + (grossSalaryThisMonth * remainingMonths);
  const grossSalaryProjected = monthsWithData < monthsElapsed
    ? Math.max(annualizedFromCurrent, projectedFromYtd)
    : projectedFromYtd;

  const previousEmployerIncome = declaration ? parseFloat(declaration.previousEmployerIncome || '0') : 0;
  const previousEmployerTds = declaration ? parseFloat(declaration.previousEmployerTds || '0') : 0;
  const otherIncome = declaration ? parseFloat(declaration.otherIncome || '0') : 0;
  const totalGrossProjected = grossSalaryProjected + previousEmployerIncome + otherIncome;

  const standardDeduction = parseFloat(slabs[0].standardDeduction || '50000');

  let hraExemption = 0;
  let section80cDeduction = 0;
  let section80dDeduction = 0;
  let otherChapter6aDeductions = 0;
  let section24bDeduction = 0;

  if (regime === 'old' && declaration) {
    const salaryRecords = await db.select().from(employeeSalaries)
      .where(and(eq(employeeSalaries.userId, userId), eq(employeeSalaries.isActive, true)))
      .limit(1);

    if (salaryRecords.length > 0) {
      const sal = salaryRecords[0];
      const basicAnnual = parseFloat(sal.basicSalary || '0') * 12;
      const hraAnnual = parseFloat(sal.houseRentAllowance || '0') * 12;
      hraExemption = calculateHraExemption(
        basicAnnual,
        hraAnnual,
        parseFloat(declaration.monthlyRentPaid || '0'),
        declaration.isMetroCity || false
      );
    }

    section80cDeduction = Math.min(parseFloat(declaration.section80c || '0') + parseFloat(declaration.section80ccd1b || '0'), 200000);
    section80dDeduction = Math.min(
      parseFloat(declaration.section80d || '0') + parseFloat(declaration.section80dParents || '0'),
      100000
    );
    otherChapter6aDeductions =
      parseFloat(declaration.section80e || '0') +
      parseFloat(declaration.section80g || '0') +
      parseFloat(declaration.section80tta || '0') +
      parseFloat(declaration.otherDeductions || '0');
    section24bDeduction = Math.min(parseFloat(declaration.section24b || '0'), 200000);
  }

  const totalDeductions = standardDeduction + hraExemption + section80cDeduction +
    section80dDeduction + otherChapter6aDeductions + section24bDeduction;

  const taxableIncomeProjected = Math.max(0, totalGrossProjected - totalDeductions);
  let taxOnProjectedIncome = calculateTaxOnIncome(taxableIncomeProjected, slabs);

  const cessRate = parseFloat(slabs[0].cessRate || '4') / 100;
  let cessAmount = taxOnProjectedIncome * cessRate;
  let surchargeAmount = 0;

  const section87aLimit = slabs[0].section87aRebateLimit ? parseFloat(slabs[0].section87aRebateLimit) : 0;
  let section87aRebate = 0;
  if (section87aLimit > 0 && taxableIncomeProjected <= section87aLimit) {
    section87aRebate = Math.min(taxOnProjectedIncome + cessAmount, taxOnProjectedIncome + cessAmount);
    taxOnProjectedIncome = 0;
    cessAmount = 0;
  }

  const totalTaxLiabilityAnnual = Math.max(0, taxOnProjectedIncome + cessAmount + surchargeAmount - section87aRebate);

  const totalTdsRequired = totalTaxLiabilityAnnual - previousEmployerTds;
  const tdsRemaining = Math.max(0, totalTdsRequired - tdsDeductedYtd);
  const hasNoPriorTds = previousTdsRecords.length === 0 && tdsDeductedYtd === 0;
  const monthsLeft = hasNoPriorTds ? 12 : Math.max(1, remainingMonths + 1);
  const tdsRequiredMonthly = Math.round((tdsRemaining / monthsLeft) * 100) / 100;

  const catchUpAdjustment = 0;
  const tdsActualMonthly = Math.max(0, tdsRequiredMonthly + catchUpAdjustment);

  return {
    grossSalaryMonthly: grossSalaryThisMonth,
    grossSalaryYtd,
    grossSalaryProjected,
    standardDeduction,
    hraExemption,
    section80cDeduction,
    section80dDeduction,
    otherChapter6aDeductions,
    section24bDeduction,
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
    regime,
  };
}

export async function saveTdsRecord(
  userId: number,
  periodId: number,
  month: number,
  year: number,
  computation: TaxComputationResult
): Promise<any> {
  const financialYear = month >= 4
    ? `${year}-${(year + 1).toString().slice(2)}`
    : `${year - 1}-${year.toString().slice(2)}`;

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
    hraExemption: computation.hraExemption.toFixed(2),
    section80cDeduction: computation.section80cDeduction.toFixed(2),
    section80dDeduction: computation.section80dDeduction.toFixed(2),
    otherChapter6aDeductions: computation.otherChapter6aDeductions.toFixed(2),
    section24bDeduction: computation.section24bDeduction.toFixed(2),
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
    regime: computation.regime,
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

  const records = await db.select().from(payrollRecords)
    .where(eq(payrollRecords.periodId, periodId));

  let processed = 0;
  let errors = 0;
  const details: any[] = [];

  for (const record of records) {
    try {
      const grossSalary = parseFloat(record.grossPay);
      const computation = await computeMonthlyTds(record.userId, periodId, month, year, grossSalary);
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
        regime: computation.regime,
        taxableIncome: computation.taxableIncomeProjected,
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
    grossSalaryMonthly: tdsMonthlyRecords.grossSalaryMonthly,
    taxableIncomeProjected: tdsMonthlyRecords.taxableIncomeProjected,
    totalTaxLiabilityAnnual: tdsMonthlyRecords.totalTaxLiabilityAnnual,
    tdsActualMonthly: tdsMonthlyRecords.tdsActualMonthly,
    tdsDeductedYtd: tdsMonthlyRecords.tdsDeductedYtd,
    regime: tdsMonthlyRecords.regime,
  })
  .from(tdsMonthlyRecords)
  .leftJoin(users, eq(tdsMonthlyRecords.userId, users.id))
  .where(eq(tdsMonthlyRecords.periodId, periodId))
  .orderBy(asc(users.username));
}
