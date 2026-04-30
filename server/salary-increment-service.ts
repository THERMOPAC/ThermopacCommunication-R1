import { db } from './db';
import { employeeSalaries, salaryIncrementProposals, salaryIncrementAuditLog, users } from '../shared/schema';
import { eq, and, lte, ne } from 'drizzle-orm';

/**
 * Recalculate all salary components from the proposed basicSalary and persist
 * to employee_salaries. Transitions the proposal to status = 'applied'.
 *
 * This is the single authoritative path for applying an increment.
 * It does NOT delegate to the PUT /salary-setup/:id route.
 */
export async function applySalaryIncrement(proposalId: number, appliedByUserId: number): Promise<void> {
  const [proposal] = await db
    .select()
    .from(salaryIncrementProposals)
    .where(eq(salaryIncrementProposals.id, proposalId));

  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  // Idempotency: already applied by a concurrent call — skip silently
  if (proposal.status === 'applied') {
    console.log(`[IncrementService] Proposal ${proposalId} already applied — skipping`);
    return;
  }

  if (proposal.status !== 'approved') {
    throw new Error(`Proposal ${proposalId} cannot be applied — current status: ${proposal.status}`);
  }

  const today = new Date().toISOString().split('T')[0];
  if ((proposal.effectiveDate as string) > today) {
    throw new Error(`Effective date ${proposal.effectiveDate} is in the future`);
  }

  // ── Atomic status transition ─────────────────────────────────────────────
  // Use a conditional UPDATE (WHERE status='approved') so concurrent calls
  // (API + midnight cron) cannot both apply the same proposal.
  const transitioned = await db
    .update(salaryIncrementProposals)
    .set({ status: 'applied', appliedAt: new Date(), appliedBy: appliedByUserId })
    .where(and(
      eq(salaryIncrementProposals.id, proposalId),
      eq(salaryIncrementProposals.status, 'approved'),
    ))
    .returning({ id: salaryIncrementProposals.id });

  if (transitioned.length === 0) {
    // Another concurrent call already transitioned the row — skip safely
    console.log(`[IncrementService] Proposal ${proposalId} transition lost to concurrent call — skipping`);
    return;
  }

  const [salaryConfig] = await db
    .select()
    .from(employeeSalaries)
    .where(eq(employeeSalaries.id, proposal.employeeSalaryId));

  if (!salaryConfig || !salaryConfig.isActive) {
    throw new Error(`Salary config ${proposal.employeeSalaryId} not found or inactive`);
  }

  // Fetch user duty schedule for accurate working hours
  const [employeeUser] = await db
    .select({ dutyTimeIn: users.dutyTimeIn, dutyTimeOut: users.dutyTimeOut, minimumDailyHours: users.minimumDailyHours })
    .from(users)
    .where(eq(users.id, salaryConfig.userId));

  // Derive working hours from duty schedule (source of truth)
  let workingHours = 8;
  if (employeeUser?.dutyTimeIn && employeeUser?.dutyTimeOut) {
    const [inH, inM] = employeeUser.dutyTimeIn.split(':').map(Number);
    const [outH, outM] = employeeUser.dutyTimeOut.split(':').map(Number);
    const h = (outH * 60 + outM - (inH * 60 + inM)) / 60;
    if (h > 0) workingHours = h;
  } else if (employeeUser?.minimumDailyHours) {
    workingHours = employeeUser.minimumDailyHours;
  }

  const MONTHLY_DIVISOR = 30;
  const newBasic = parseFloat(proposal.proposedBasicSalary as string);
  const isDaily = salaryConfig.salaryType === 'daily';
  const paidDays = Number(salaryConfig.paidDays) || 30;
  const kpiPct = parseFloat((salaryConfig.kpiPercent as string) || '0');
  const groupIns = parseFloat((salaryConfig.groupInsurance as string) || '1500');
  const otHours = parseFloat((salaryConfig.overtimeHours as string) || '0');
  const otRate = parseFloat((salaryConfig.otRate as string) || '1.0');

  let grossBasic: number;
  let houseRent = 0, conveyance = 0, lta = 0, special = 0, supplementary = 0, kgp = 0, overtimePay = 0;

  if (isDaily) {
    grossBasic = newBasic * paidDays;
    const hourlyRate = newBasic / workingHours;
    overtimePay = hourlyRate * otHours * otRate;
  } else {
    const proRated = (newBasic / MONTHLY_DIVISOR) * paidDays;
    grossBasic = proRated;
    houseRent = grossBasic * 0.4;
    conveyance = grossBasic * 0.3;
    lta = grossBasic * 0.2;
    special = grossBasic * 0.3;
    supplementary = grossBasic * 0.3;
    kgp = newBasic * 0.15 * (kpiPct / 100);
  }

  const bonus = newBasic * 0.0833;
  const grossEarnings = isDaily
    ? grossBasic + overtimePay
    : grossBasic + houseRent + conveyance + lta + special + supplementary + kgp;

  const pfBase = Math.min(grossBasic, 15000);
  const employeePF = pfBase * 0.12;
  const employerPF = pfBase * 0.12;
  const employeeESIC = grossEarnings <= 21000 ? grossEarnings * 0.0075 : 0;
  const employerESIC = grossEarnings <= 21000 ? grossEarnings * 0.0325 : 0;
  const gratuity = (newBasic * 15 / 26) / 12;
  const professionalTax = 200;
  const takeHome = grossEarnings - employeePF - employeeESIC - professionalTax;
  const ctcMonthly = grossEarnings + employerPF + employerESIC + gratuity + groupIns;
  const ctcYearly = (ctcMonthly * 12) + (bonus * 12);

  const oldValues = {
    basicSalary: salaryConfig.basicSalary,
    takeHomeSalary: salaryConfig.takeHomeSalary,
    ctcMonthly: salaryConfig.ctcMonthly,
    ctcYearly: salaryConfig.ctcYearly,
  };

  // Proposal row is already transitioned to 'applied' by the atomic update above.
  // Now update the actual salary figures in employee_salaries.
  await db.update(employeeSalaries).set({
    basicSalary: newBasic.toFixed(2),
    baseSalary: newBasic.toFixed(2),
    houseRentAllowance: isDaily ? null : houseRent.toFixed(2),
    conveyance: isDaily ? null : conveyance.toFixed(2),
    lta: isDaily ? null : lta.toFixed(2),
    specialAllowance: isDaily ? null : special.toFixed(2),
    supplementaryAllowance: isDaily ? null : supplementary.toFixed(2),
    kgpAllowance: isDaily ? null : kgp.toFixed(2),
    bonus: bonus.toFixed(2),
    employeePfContribution: employeePF.toFixed(2),
    employerPfContribution: employerPF.toFixed(2),
    employeeEsicContribution: employeeESIC.toFixed(2),
    employerEsicContribution: employerESIC.toFixed(2),
    gratuityCost: gratuity.toFixed(2),
    takeHomeSalary: takeHome.toFixed(2),
    actualSalaryForMonth: takeHome.toFixed(2),
    ctcMonthly: ctcMonthly.toFixed(2),
    ctcYearly: ctcYearly.toFixed(2),
    workingHoursPerDay: parseFloat(workingHours.toFixed(2)),
    updatedAt: new Date(),
  }).where(eq(employeeSalaries.id, proposal.employeeSalaryId));

  await db.insert(salaryIncrementAuditLog).values({
    proposalId,
    employeeSalaryId: proposal.employeeSalaryId,
    employeeId: proposal.employeeId,
    action: 'applied',
    actorId: appliedByUserId,
    oldValues,
    newValues: {
      basicSalary: newBasic.toFixed(2),
      takeHomeSalary: takeHome.toFixed(2),
      ctcMonthly: ctcMonthly.toFixed(2),
      ctcYearly: ctcYearly.toFixed(2),
    },
    remarks: `Applied increment of ${proposal.incrementPercentage}% effective ${proposal.effectiveDate}`,
  });
}

/**
 * Check all approved proposals whose effectiveDate <= today and apply each one.
 * Called by the midnight cron and by the GET increment-history route on page load.
 */
export async function autoApplyDueIncrements(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const due = await db
    .select({ id: salaryIncrementProposals.id })
    .from(salaryIncrementProposals)
    .where(and(
      eq(salaryIncrementProposals.status, 'approved'),
      lte(salaryIncrementProposals.effectiveDate, today)
    ));

  for (const row of due) {
    try {
      await applySalaryIncrement(row.id, 0);
      console.log(`[IncrementService] Auto-applied proposal ${row.id}`);
    } catch (err) {
      console.error(`[IncrementService] Failed to apply proposal ${row.id}:`, err);
    }
  }
}
