/**
 * Payroll Salary Core — v2.0.0
 * Single source of truth for all payroll arithmetic.
 * Pure function: no DB access, no side effects, deterministic.
 * Both Trial and Official payroll routes call this exclusively.
 * Baseline: docs/payroll-governance-v4.1-baseline.md
 */

export const PAYROLL_CONSTANTS = {
  MONTHLY_DIVISOR: 30,
  PF_RATE: 0.12,
  PF_CEILING: 15000,
  EMPLOYEE_ESIC_RATE: 0.0075,
  EMPLOYER_ESIC_RATE: 0.0325,
  ESIC_GROSS_CEILING: 21000,
  GRATUITY_NUMERATOR: 15,
  GRATUITY_DENOMINATOR: 26,
  GRATUITY_MONTHS: 12,
  BONUS_DEFAULT_RATE: 0.0833,
  ENGINE_VERSION: '2.0.0' as const,
} as const;

export const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface SalaryInputs {
  basicSalary: number;
  salaryType: 'monthly' | 'daily';
  houseRentAllowance: number;
  conveyance: number;
  lta: number;
  specialAllowance: number;
  supplementaryAllowance: number;
  kgpAllowance: number;
  configBonus: number;
  groupInsurance: number;
  workingHoursPerDay: number;
  otRate: number;
  otMultiplier: number;

  paidDays: number;
  lopDays: number;
  totalWorkingDays: number;
  overtimeHours: number;

  isPFApplicable: boolean;
  isESICApplicable: boolean;
  isPTApplicable: boolean;

  ptMonthly: number;
  ptFebruary: number;
  isFebruary: boolean;

  activeLoans: Array<{
    id: number;
    outstandingBalance: string;
    emiAmount: string;
    loanType: string;
  }>;
  activeAdvances: Array<{
    id: number;
    outstandingBalance: string;
    recoveryAmount: string;
    recoveryType: string;
  }>;
  minimumTakeHome: number;
}

export interface LoanBreakdownItem {
  loanId: number;
  requested: number;
  applied: number;
}

export interface AdvanceBreakdownItem {
  advanceId: number;
  requested: number;
  applied: number;
}

export interface SalaryResult {
  proratedBase: number;
  hra: number;
  conv: number;
  lta: number;
  specialAllowance: number;
  supplementaryAllowance: number;
  kgpAllowance: number;
  bonusAllowance: number;
  overtimePay: number;
  grossPay: number;

  employeePF: number;
  employerPF: number;
  employeeESIC: number;
  employerESIC: number;
  professionalTax: number;
  gratuity: number;
  groupInsurance: number;

  loanDeductions: number;
  advanceDeductions: number;
  loanBreakdown: LoanBreakdownItem[];
  advanceBreakdown: AdvanceBreakdownItem[];

  totalStatutoryDeductions: number;
  totalDeductionsPreTds: number;
  netPayPreTds: number;

  ctcMonthly: number;
  ctcYearly: number;

  paidDays: number;
  salaryBasis: number | 'actual_days';
  engineVersion: '2.0.0';
}

function computeProfessionalTax(
  grossPay: number,
  isPTApplicable: boolean,
  ptMonthly: number,
  ptFebruary: number,
  isFebruary: boolean,
): number {
  if (!isPTApplicable) return 0;
  const rate = isFebruary ? ptFebruary : ptMonthly;
  if (grossPay > 10000) return rate;
  if (grossPay > 7500) return 175;
  return 0;
}

export function computeEmployeeSalaryNumbers(inputs: SalaryInputs): SalaryResult {
  const {
    basicSalary, salaryType, houseRentAllowance, conveyance, lta,
    specialAllowance, supplementaryAllowance, kgpAllowance, configBonus,
    groupInsurance: groupInsuranceConfig,
    workingHoursPerDay, otRate, otMultiplier,
    paidDays: rawPaidDays, lopDays, totalWorkingDays, overtimeHours,
    isPFApplicable, isESICApplicable, isPTApplicable,
    ptMonthly, ptFebruary, isFebruary,
    activeLoans, activeAdvances, minimumTakeHome,
  } = inputs;

  const {
    MONTHLY_DIVISOR, PF_RATE, PF_CEILING,
    EMPLOYEE_ESIC_RATE, EMPLOYER_ESIC_RATE, ESIC_GROSS_CEILING,
    GRATUITY_NUMERATOR, GRATUITY_DENOMINATOR, GRATUITY_MONTHS,
    BONUS_DEFAULT_RATE,
  } = PAYROLL_CONSTANTS;

  let proratedBase: number;
  let hra = 0, conv = 0, ltaVal = 0, specAllow = 0, suppAllow = 0, kgpAllow = 0, bonusAllow = 0;
  let overtimePay = 0;
  let grossPay: number;
  let paidDays: number;
  let salaryBasis: number | 'actual_days';

  if (salaryType === 'daily') {
    paidDays = rawPaidDays;
    salaryBasis = 'actual_days';
    proratedBase = basicSalary * paidDays;
    const hourlyRate = basicSalary / workingHoursPerDay;
    overtimePay = r2(hourlyRate * overtimeHours * otRate * otMultiplier);
    bonusAllow = r2(proratedBase * BONUS_DEFAULT_RATE);
    grossPay = proratedBase + overtimePay;
  } else {
    paidDays = Math.min(rawPaidDays, MONTHLY_DIVISOR);
    salaryBasis = MONTHLY_DIVISOR;
    const ratio = paidDays / MONTHLY_DIVISOR;

    proratedBase = r2(basicSalary * ratio);
    hra = r2(houseRentAllowance * ratio);
    conv = r2(conveyance * ratio);
    ltaVal = r2(lta * ratio);
    specAllow = r2(specialAllowance * ratio);
    suppAllow = r2(supplementaryAllowance * ratio);
    kgpAllow = r2(kgpAllowance * ratio);
    bonusAllow = configBonus > 0
      ? r2(configBonus * ratio)
      : r2(basicSalary * BONUS_DEFAULT_RATE * ratio);
    overtimePay = 0;

    grossPay = proratedBase + hra + conv + ltaVal + specAllow + suppAllow + kgpAllow;
  }

  const pfBase = Math.min(proratedBase, PF_CEILING);
  let employeePF = 0;
  let employerPF = 0;
  if (isPFApplicable) {
    employeePF = r2(pfBase * PF_RATE);
    employerPF = r2(pfBase * PF_RATE);
  }

  let employeeESIC = 0;
  let employerESIC = 0;
  if (isESICApplicable && grossPay <= ESIC_GROSS_CEILING) {
    employeeESIC = r2(grossPay * EMPLOYEE_ESIC_RATE);
    employerESIC = r2(grossPay * EMPLOYER_ESIC_RATE);
  }

  const professionalTax = computeProfessionalTax(grossPay, isPTApplicable, ptMonthly, ptFebruary, isFebruary);

  const gratuity = r2((basicSalary * GRATUITY_NUMERATOR / GRATUITY_DENOMINATOR) / GRATUITY_MONTHS);

  const groupInsurance = groupInsuranceConfig;

  const totalStatutoryDeductions = employeePF + employeeESIC + professionalTax;

  let loanDeductions = 0;
  let advanceDeductions = 0;
  const loanBreakdown: LoanBreakdownItem[] = [];
  const advanceBreakdown: AdvanceBreakdownItem[] = [];

  const availableForRecovery = grossPay - totalStatutoryDeductions;
  let remaining = Math.max(0, availableForRecovery - minimumTakeHome);

  for (const adv of activeAdvances) {
    if (remaining <= 0) break;
    const outstandingBalance = parseFloat(adv.outstandingBalance || '0');
    const recoveryAmount = parseFloat(adv.recoveryAmount || '0');
    let requested: number;
    if (adv.recoveryType === 'lump_sum') {
      requested = outstandingBalance;
    } else {
      requested = Math.min(recoveryAmount, outstandingBalance);
    }
    const applied = Math.min(requested, remaining);
    if (applied > 0) {
      advanceDeductions += applied;
      remaining -= applied;
      advanceBreakdown.push({ advanceId: adv.id, requested, applied });
    }
  }

  const emergencyLoans = activeLoans.filter(l => l.loanType === 'emergency');
  const otherLoans = activeLoans.filter(l => l.loanType !== 'emergency');
  const sortedLoans = [...emergencyLoans, ...otherLoans];

  for (const loan of sortedLoans) {
    if (remaining <= 0) break;
    const outstandingBalance = parseFloat(loan.outstandingBalance || '0');
    const emiAmount = parseFloat(loan.emiAmount || '0');
    const requested = Math.min(emiAmount, outstandingBalance);
    const applied = Math.min(requested, remaining);
    if (applied > 0) {
      loanDeductions += applied;
      remaining -= applied;
      loanBreakdown.push({ loanId: loan.id, requested, applied });
    }
  }

  const totalDeductionsPreTds = totalStatutoryDeductions + loanDeductions + advanceDeductions;
  const netPayPreTds = grossPay - totalDeductionsPreTds;

  const ctcMonthly = grossPay + employerPF + employerESIC + gratuity + groupInsurance + bonusAllow;
  const ctcYearly = ctcMonthly * 12;

  return {
    proratedBase,
    hra,
    conv,
    lta: ltaVal,
    specialAllowance: specAllow,
    supplementaryAllowance: suppAllow,
    kgpAllowance: kgpAllow,
    bonusAllowance: bonusAllow,
    overtimePay,
    grossPay,
    employeePF,
    employerPF,
    employeeESIC,
    employerESIC,
    professionalTax,
    gratuity,
    groupInsurance,
    loanDeductions,
    advanceDeductions,
    loanBreakdown,
    advanceBreakdown,
    totalStatutoryDeductions,
    totalDeductionsPreTds,
    netPayPreTds,
    ctcMonthly,
    ctcYearly,
    paidDays,
    salaryBasis,
    engineVersion: PAYROLL_CONSTANTS.ENGINE_VERSION,
  };
}
