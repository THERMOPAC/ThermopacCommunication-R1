import { Router, Request, Response } from 'express';
import { db } from './db';
import {
  manualSalaryEntries,
  payrollRecords,
  payrollPeriods,
  users,
  payrollSettings,
  glAccountMappings,
  tdsComplianceRegister,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { postJeToSap, getGlCode } from './statutory-compliance-routes';
import { checkModulePermission } from './utils/permission-utils';

const router = Router();
router.use(ensureAuthenticated);

async function ensurePayrollAdmin(req: Request, res: Response, next: Function) {
  const user = req.user as any;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const allowedRoles = ['Superuser', 'Admin', 'HR Manager', 'Finance Manager'];
  if (allowedRoles.includes(user.role)) {
    return next();
  }
  try {
    const hasFinanceView = await checkModulePermission(user.id, 'Finance', 'view');
    if (hasFinanceView) {
      return next();
    }
  } catch (e) {
  }
  return res.status(403).json({ error: 'Access denied. Only Admin, HR, or Finance roles can manage manual salaries.' });
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

async function calculateManualSalary(input: {
  entryType: string;
  daysWorked: number;
  hoursWorked: number;
  quantity: number;
  baseRate: number;
  overtimeHours: number;
  overtimeRateMultiplier: number;
  periodMonth: number;
  employeeRole?: string;
  entryPurpose?: string;
}) {
  const isOtOnly = input.entryPurpose === 'ot_only';

  let baseEarnings = 0;
  if (!isOtOnly) {
    if (input.entryType === 'daily') {
      baseEarnings = input.daysWorked * input.baseRate;
    } else if (input.entryType === 'hourly') {
      baseEarnings = input.hoursWorked * input.baseRate;
    } else {
      baseEarnings = input.quantity * input.baseRate;
    }
  }

  const hourlyRateForOT = isOtOnly
    ? input.baseRate
    : input.entryType === 'daily'
      ? input.baseRate / 8
      : input.entryType === 'hourly'
        ? input.baseRate
        : input.baseRate / 8;

  const overtimeEarned = input.overtimeHours * hourlyRateForOT * input.overtimeRateMultiplier;
  const grossEarnings = baseEarnings + overtimeEarned;

  const pfAmount = 0;
  const esicAmount = 0;
  const ptAmount = 0;
  const tdsAmount = 0;

  const totalDeductions = 0;
  const netPay = Math.round(grossEarnings * 100) / 100;

  return {
    baseEarnings: Math.round(baseEarnings * 100) / 100,
    overtimeEarned: Math.round(overtimeEarned * 100) / 100,
    grossEarnings: Math.round(grossEarnings * 100) / 100,
    pfAmount,
    ptAmount,
    esicAmount,
    tdsAmount,
    totalDeductions,
    netPay,
  };
}

function getUserName(user: any): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  return user.cardName || user.username || 'Unknown';
}

function buildStatusTransition(fromStatus: string, toStatus: string, action: string, reason: string | null, user: any) {
  return {
    from: fromStatus,
    to: toStatus,
    action,
    reason: reason || null,
    by: getUserName(user),
    byId: user.id,
    at: new Date().toISOString(),
  };
}

function getFinancialYear(month: number, year: number): string {
  if (month >= 4) return `${year}-${(year + 1).toString().slice(2)}`;
  return `${year - 1}-${year.toString().slice(2)}`;
}

function getQuarter(month: number): string {
  if (month >= 4 && month <= 6) return 'Q1';
  if (month >= 7 && month <= 9) return 'Q2';
  if (month >= 10 && month <= 12) return 'Q3';
  return 'Q4';
}

router.post('/preview', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const { entryType, daysWorked, hoursWorked, quantity, baseRate, overtimeHours, overtimeRateMultiplier, periodId, entryPurpose } = req.body;
    let periodMonth = new Date().getMonth() + 1;
    if (periodId) {
      const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
      if (period) periodMonth = new Date(period.startDate).getMonth() + 1;
    }
    const result = await calculateManualSalary({
      entryType: entryType || 'daily',
      daysWorked: parseFloat(daysWorked || '0'),
      hoursWorked: parseFloat(hoursWorked || '0'),
      quantity: parseFloat(quantity || '0'),
      baseRate: parseFloat(baseRate || '0'),
      overtimeHours: parseFloat(overtimeHours || '0'),
      overtimeRateMultiplier: parseFloat(overtimeRateMultiplier || '1.5'),
      periodMonth,
      entryPurpose: entryPurpose || undefined,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/create', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    const { periodId, userId, entryType, daysWorked, hoursWorked, quantity, baseRate, overtimeHours, overtimeRateMultiplier, entryPurpose, remarks } = req.body;

    const purpose = entryPurpose || 'full_salary';
    if (purpose === 'ot_only') {
      if (!periodId || !userId) {
        return res.status(400).json({ error: 'periodId and userId are required for OT-only entries' });
      }
    } else {
      if (!periodId || !userId || !baseRate) {
        return res.status(400).json({ error: 'periodId, userId, and baseRate are required' });
      }
    }

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
    if (!period) return res.status(404).json({ error: 'Payroll period not found' });

    const [employee] = await db.select().from(users).where(eq(users.id, userId));
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if ((employee as any).userType !== 'non_system_user') {
      return res.status(400).json({ error: 'Manual salary processing is only allowed for Non-System Users. Please change the user type first.' });
    }

    const periodMonth = new Date(period.startDate).getMonth() + 1;
    let calc: any;
    if (purpose === 'ot_only') {
      const otHrs = parseFloat(overtimeHours || '0');
      const otMult = parseFloat(overtimeRateMultiplier || '1.5');
      const hourlyRate = parseFloat(baseRate || '0');
      const otEarned = otHrs * hourlyRate * otMult;
      calc = {
        baseEarnings: 0,
        overtimeEarned: otEarned,
        grossEarnings: otEarned,
        pfAmount: 0,
        esicAmount: 0,
        ptAmount: 0,
        tdsAmount: 0,
        totalDeductions: 0,
        netPay: otEarned,
      };
    } else {
      calc = await calculateManualSalary({
        entryType: entryType || 'daily',
        daysWorked: parseFloat(daysWorked || '0'),
        hoursWorked: parseFloat(hoursWorked || '0'),
        quantity: parseFloat(quantity || '0'),
        baseRate: parseFloat(baseRate || '0'),
        overtimeHours: parseFloat(overtimeHours || '0'),
        overtimeRateMultiplier: parseFloat(overtimeRateMultiplier || '1.5'),
        periodMonth,
        employeeRole: (employee as any).role,
      });
    }

    const purposeLabel = purpose === 'ot_only' ? 'OT-only manual salary entry' : 'Manual salary entry created for non-system user';
    const initialHistory = [buildStatusTransition('new', 'generated', 'create', purposeLabel, currentUser)];

    const [payrollRecord] = await db.insert(payrollRecords).values({
      periodId,
      userId,
      baseSalary: calc.baseEarnings.toString(),
      grossPay: calc.grossEarnings.toString(),
      netPay: calc.netPay.toString(),
      overtimeHours: (overtimeHours || '0').toString(),
      overtimePay: calc.overtimeEarned.toString(),
      employeePf: calc.pfAmount.toString(),
      professionalTax: calc.ptAmount.toString(),
      employeeEsic: calc.esicAmount.toString(),
      tdsAmount: calc.tdsAmount.toString(),
      totalDeductions: calc.totalDeductions.toString(),
      status: 'generated',
      salarySource: purpose === 'ot_only' ? 'manual_ot_only' : 'manual_salary',
      workerType: 'non_system_user',
      statusHistory: initialHistory,
    }).returning();

    const [entry] = await db.insert(manualSalaryEntries).values({
      periodId,
      userId,
      payrollRecordId: payrollRecord.id,
      entryType: entryType || 'daily',
      entryPurpose: purpose,
      daysWorked: (daysWorked || '0').toString(),
      hoursWorked: (hoursWorked || '0').toString(),
      quantity: (quantity || '0').toString(),
      baseRate: (baseRate || '0').toString(),
      overtimeHours: (overtimeHours || '0').toString(),
      overtimeRateMultiplier: (overtimeRateMultiplier || '1.5').toString(),
      overtimeEarned: calc.overtimeEarned.toString(),
      baseEarnings: calc.baseEarnings.toString(),
      grossEarnings: calc.grossEarnings.toString(),
      pfAmount: calc.pfAmount.toString(),
      ptAmount: calc.ptAmount.toString(),
      esicAmount: calc.esicAmount.toString(),
      tdsAmount: calc.tdsAmount.toString(),
      totalDeductions: calc.totalDeductions.toString(),
      netPay: calc.netPay.toString(),
      remarks,
      createdBy: currentUser?.id,
    }).returning();

    await db.update(payrollRecords).set({ manualSalaryEntryId: entry.id }).where(eq(payrollRecords.id, payrollRecord.id));

    if (calc.tdsAmount > 0 && purpose !== 'ot_only') {
      const periodYear = new Date(period.startDate).getFullYear();
      const empName = getUserName(employee);
      await db.insert(tdsComplianceRegister).values({
        sourceCategory: 'salary',
        tdsSection: '192',
        financialYear: getFinancialYear(periodMonth, periodYear),
        quarter: getQuarter(periodMonth),
        month: periodMonth,
        year: periodYear,
        deducteeName: empName,
        deducteePan: (employee as any).panNumber || null,
        deducteeType: 'employee',
        employeeId: userId,
        payrollRecordId: payrollRecord.id,
        baseAmount: calc.grossEarnings.toString(),
        tdsAmount: calc.tdsAmount.toString(),
        tdsRate: '1.00',
        deductionDate: new Date(),
        challanStatus: 'pending',
      });
    }

    res.json({ entry, payrollRecord });
  } catch (e: any) {
    console.error('Error creating manual salary:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const { entryType, daysWorked, hoursWorked, quantity, baseRate, overtimeHours, overtimeRateMultiplier, remarks } = req.body;

    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (!entry.payrollRecordId) return res.status(400).json({ error: 'No linked payroll record' });

    const [pr] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!pr) return res.status(404).json({ error: 'Payroll record not found' });

    if (pr.status !== 'generated') {
      return res.status(400).json({ error: `Cannot update entry with status '${pr.status}'. Only entries in 'Generated' status can be updated.` });
    }

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, entry.periodId));
    const periodMonth = period ? new Date(period.startDate).getMonth() + 1 : new Date().getMonth() + 1;

    const [empForRole] = await db.select({ role: users.role }).from(users).where(eq(users.id, entry.userId));

    const calc = await calculateManualSalary({
      entryType: entryType || entry.entryType || 'daily',
      daysWorked: parseFloat(daysWorked ?? entry.daysWorked ?? '0'),
      hoursWorked: parseFloat(hoursWorked ?? entry.hoursWorked ?? '0'),
      quantity: parseFloat(quantity ?? entry.quantity ?? '0'),
      baseRate: parseFloat(baseRate ?? entry.baseRate ?? '0'),
      overtimeHours: parseFloat(overtimeHours ?? entry.overtimeHours ?? '0'),
      overtimeRateMultiplier: parseFloat(overtimeRateMultiplier ?? entry.overtimeRateMultiplier ?? '1.5'),
      periodMonth,
      employeeRole: empForRole?.role || undefined,
    });

    await db.update(manualSalaryEntries).set({
      entryType: entryType || entry.entryType,
      daysWorked: (daysWorked ?? entry.daysWorked ?? '0').toString(),
      hoursWorked: (hoursWorked ?? entry.hoursWorked ?? '0').toString(),
      quantity: (quantity ?? entry.quantity ?? '0').toString(),
      baseRate: (baseRate ?? entry.baseRate ?? '0').toString(),
      overtimeHours: (overtimeHours ?? entry.overtimeHours ?? '0').toString(),
      overtimeRateMultiplier: (overtimeRateMultiplier ?? entry.overtimeRateMultiplier ?? '1.5').toString(),
      overtimeEarned: calc.overtimeEarned.toString(),
      baseEarnings: calc.baseEarnings.toString(),
      grossEarnings: calc.grossEarnings.toString(),
      pfAmount: calc.pfAmount.toString(),
      ptAmount: calc.ptAmount.toString(),
      esicAmount: calc.esicAmount.toString(),
      tdsAmount: calc.tdsAmount.toString(),
      totalDeductions: calc.totalDeductions.toString(),
      netPay: calc.netPay.toString(),
      remarks: remarks ?? entry.remarks,
      updatedAt: new Date(),
    }).where(eq(manualSalaryEntries.id, id));

    const history = Array.isArray(pr.statusHistory) ? [...(pr.statusHistory as any[])] : [];
    history.push(buildStatusTransition('generated', 'generated', 'update', 'Manual salary entry updated', currentUser));

    await db.update(payrollRecords).set({
      baseSalary: calc.baseEarnings.toString(),
      grossPay: calc.grossEarnings.toString(),
      netPay: calc.netPay.toString(),
      overtimeHours: (overtimeHours ?? entry.overtimeHours ?? '0').toString(),
      overtimePay: calc.overtimeEarned.toString(),
      employeePf: calc.pfAmount.toString(),
      professionalTax: calc.ptAmount.toString(),
      employeeEsic: calc.esicAmount.toString(),
      tdsAmount: calc.tdsAmount.toString(),
      totalDeductions: calc.totalDeductions.toString(),
      statusHistory: history,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, entry.payrollRecordId));

    await db.delete(tdsComplianceRegister).where(
      and(
        eq(tdsComplianceRegister.payrollRecordId, entry.payrollRecordId),
        eq(tdsComplianceRegister.tdsSection, '194C'),
        eq(tdsComplianceRegister.sourceCategory, 'non_salary')
      )
    );

    if (calc.tdsAmount > 0 && period) {
      const periodYear = new Date(period.startDate).getFullYear();
      const [employee] = await db.select().from(users).where(eq(users.id, entry.userId));
      const empName = employee ? getUserName(employee) : 'Unknown';
      await db.insert(tdsComplianceRegister).values({
        sourceCategory: 'non_salary',
        tdsSection: '194C',
        financialYear: getFinancialYear(periodMonth, periodYear),
        quarter: getQuarter(periodMonth),
        month: periodMonth,
        year: periodYear,
        deducteeName: empName,
        deducteePan: (employee as any)?.panNumber || null,
        deducteeType: 'contractor',
        employeeId: entry.userId,
        payrollRecordId: entry.payrollRecordId,
        baseAmount: calc.grossEarnings.toString(),
        tdsAmount: calc.tdsAmount.toString(),
        tdsRate: '1.00',
        deductionDate: new Date(),
        challanStatus: 'pending',
      });
    }

    res.json({ success: true, message: 'Entry updated successfully' });
  } catch (e: any) {
    console.error('Error updating manual salary:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/list', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query;
    const conditions: any[] = [];
    if (periodId) conditions.push(eq(manualSalaryEntries.periodId, parseInt(periodId as string)));

    const entries = await db.select({
      id: manualSalaryEntries.id,
      periodId: manualSalaryEntries.periodId,
      userId: manualSalaryEntries.userId,
      payrollRecordId: manualSalaryEntries.payrollRecordId,
      entryType: manualSalaryEntries.entryType,
      daysWorked: manualSalaryEntries.daysWorked,
      hoursWorked: manualSalaryEntries.hoursWorked,
      quantity: manualSalaryEntries.quantity,
      baseRate: manualSalaryEntries.baseRate,
      overtimeHours: manualSalaryEntries.overtimeHours,
      overtimeRateMultiplier: manualSalaryEntries.overtimeRateMultiplier,
      overtimeEarned: manualSalaryEntries.overtimeEarned,
      baseEarnings: manualSalaryEntries.baseEarnings,
      grossEarnings: manualSalaryEntries.grossEarnings,
      pfAmount: manualSalaryEntries.pfAmount,
      ptAmount: manualSalaryEntries.ptAmount,
      esicAmount: manualSalaryEntries.esicAmount,
      tdsAmount: manualSalaryEntries.tdsAmount,
      tdsSection: manualSalaryEntries.tdsSection,
      totalDeductions: manualSalaryEntries.totalDeductions,
      netPay: manualSalaryEntries.netPay,
      remarks: manualSalaryEntries.remarks,
      createdAt: manualSalaryEntries.createdAt,
      userName: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      employeeCode: users.employeeCode,
      department: users.department,
      cardCode: users.cardCode,
      cardName: users.cardName,
    }).from(manualSalaryEntries)
      .leftJoin(users, eq(manualSalaryEntries.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(manualSalaryEntries.createdAt));

    const entriesWithStatus = [];
    for (const entry of entries) {
      let payrollStatus = 'generated';
      let sapPostingStatus = null;
      let sapJeNumber = null;
      let reversalSapJeNumber = null;
      if (entry.payrollRecordId) {
        const [pr] = await db.select({
          status: payrollRecords.status,
          sapPostingStatus: payrollRecords.sapPostingStatus,
          sapJeNumber: payrollRecords.sapJeNumber,
          sapDocEntry: payrollRecords.sapDocEntry,
          verifiedBy: payrollRecords.verifiedBy,
          verifiedAt: payrollRecords.verifiedAt,
          heldReason: payrollRecords.heldReason,
          reversalSapJeNumber: payrollRecords.reversalSapJeNumber,
        }).from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
        if (pr) {
          payrollStatus = pr.status || 'generated';
          sapPostingStatus = pr.sapPostingStatus;
          sapJeNumber = pr.sapJeNumber;
          reversalSapJeNumber = pr.reversalSapJeNumber;
        }
      }
      entriesWithStatus.push({
        ...entry,
        payrollStatus,
        sapPostingStatus,
        sapJeNumber,
        reversalSapJeNumber,
      });
    }

    res.json(entriesWithStatus);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    if (entry.payrollRecordId) {
      const [pr] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
      if (pr && pr.status !== 'generated') {
        return res.status(400).json({ error: `Cannot delete entry with status: ${pr.status}. Only generated entries can be deleted.` });
      }
      await db.delete(tdsComplianceRegister).where(
        and(
          eq(tdsComplianceRegister.payrollRecordId, entry.payrollRecordId),
          eq(tdsComplianceRegister.tdsSection, '194C'),
          eq(tdsComplianceRegister.sourceCategory, 'non_salary')
        )
      );
      await db.delete(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    }

    await db.delete(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/status', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const { action, reason } = req.body;

    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry || !entry.payrollRecordId) return res.status(404).json({ error: 'Entry not found' });

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    if (record.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'This record has been transferred to SAP and is locked.' });
    }
    if (record.status === 'reversed' || record.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This record has been reversed and is permanently locked.' });
    }
    if (record.status === 'voided') {
      return res.status(400).json({ error: 'This record has been voided. Voided records cannot be modified.' });
    }

    const currentStatus = record.status || 'generated';
    const history = Array.isArray(record.statusHistory) ? [...(record.statusHistory as any[])] : [];
    const now = new Date();

    let newStatus: string;
    const updateData: any = { updatedAt: now };

    switch (action) {
      case 'verify':
        if (currentStatus !== 'generated' && currentStatus !== 'held') {
          return res.status(400).json({ error: `Cannot verify a record in '${currentStatus}' status. Only 'Generated' or 'Held' records can be verified.` });
        }
        newStatus = 'verified';
        updateData.verifiedBy = currentUser.id;
        updateData.verifiedAt = now;
        updateData.heldReason = null;
        updateData.heldBy = null;
        updateData.heldAt = null;
        break;

      case 'hold':
        if (currentStatus !== 'generated' && currentStatus !== 'verified') {
          return res.status(400).json({ error: `Cannot hold a record in '${currentStatus}' status.` });
        }
        if (!reason || reason.trim() === '') {
          return res.status(400).json({ error: 'A reason is required when holding a record.' });
        }
        newStatus = 'held';
        updateData.heldReason = reason.trim();
        updateData.heldBy = currentUser.id;
        updateData.heldAt = now;
        updateData.verifiedBy = null;
        updateData.verifiedAt = null;
        break;

      case 'reject':
        if (currentStatus !== 'generated' && currentStatus !== 'verified' && currentStatus !== 'held') {
          return res.status(400).json({ error: `Cannot reject a record in '${currentStatus}' status.` });
        }
        if (!reason || reason.trim() === '') {
          return res.status(400).json({ error: 'A reason is required when rejecting a record.' });
        }
        newStatus = 'rejected';
        updateData.heldReason = reason.trim();
        updateData.heldBy = currentUser.id;
        updateData.heldAt = now;
        updateData.verifiedBy = null;
        updateData.verifiedAt = null;
        break;

      case 'reopen':
        if (currentStatus !== 'held' && currentStatus !== 'rejected') {
          return res.status(400).json({ error: `Cannot reopen a record in '${currentStatus}' status.` });
        }
        newStatus = 'generated';
        updateData.heldReason = null;
        updateData.heldBy = null;
        updateData.heldAt = null;
        updateData.verifiedBy = null;
        updateData.verifiedAt = null;
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    history.push(buildStatusTransition(currentStatus, newStatus, action, reason || null, currentUser));

    updateData.status = newStatus;
    updateData.statusHistory = history;

    await db.update(payrollRecords).set(updateData).where(eq(payrollRecords.id, entry.payrollRecordId));

    res.json({
      success: true,
      status: newStatus,
      message: `Record ${action === 'verify' ? 'verified' : action === 'hold' ? 'held' : action === 'reject' ? 'rejected' : 'reopened'} successfully`,
    });
  } catch (e: any) {
    console.error('Error updating manual salary status:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/post-sap', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry || !entry.payrollRecordId) return res.status(404).json({ error: 'Entry not found' });

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    if (record.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'Already posted to SAP', sapJeNumber: record.sapJeNumber });
    }
    if (record.status !== 'verified') {
      return res.status(400).json({ error: `Only verified records can be posted to SAP. Current status: ${record.status || 'generated'}.` });
    }
    if (record.status === 'reversed' || record.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This record has been reversed and cannot be reposted to SAP.' });
    }

    const [employee] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      cardCode: users.cardCode,
      cardName: users.cardName,
      employeeCode: users.employeeCode,
    }).from(users).where(eq(users.id, record.userId));

    if (!employee) return res.status(400).json({ error: 'Employee not found' });

    const empName = getUserName(employee);

    if (!employee.cardCode || employee.cardCode.trim() === '') {
      await db.update(payrollRecords).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: `Employee ${empName} has no SAP BP code linked.`,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));
      return res.status(400).json({ error: `Employee ${empName} has no SAP BP code linked.` });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));

    const isOtOnly = entry.entryPurpose === 'ot_only';

    if (isOtOnly) {
      const otGl = getGlCode(allMappings, 'OVERTIME', 'expense');
      const payableGl = getGlCode(allMappings, 'NET_PAY', 'payroll_liability');
      const missingOt: string[] = [];
      if (!otGl) missingOt.push('OVERTIME (expense)');
      if (!payableGl) missingOt.push('NET_PAY (payroll_liability)');
      if (missingOt.length > 0) {
        await db.update(payrollRecords).set({
          sapPostingStatus: 'failed',
          sapErrorMessage: `GL mappings missing for: ${missingOt.join(', ')}`,
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, record.id));
        return res.status(400).json({ error: 'GL mappings incomplete', missingMappings: missingOt });
      }
    } else {
      const REQUIRED_COMPONENTS = [
        { code: 'BASIC', context: 'expense' },
        { code: 'OVERTIME', context: 'expense' },
        { code: 'PF_EMPLOYEE', context: 'payroll_liability' },
        { code: 'ESIC_EMPLOYEE', context: 'payroll_liability' },
        { code: 'PT', context: 'payroll_liability' },
        { code: 'TDS', context: 'payroll_liability' },
        { code: 'NET_PAY', context: 'payroll_liability' },
      ];

      const missingMappings: string[] = [];
      for (const comp of REQUIRED_COMPONENTS) {
        const gl = getGlCode(allMappings, comp.code, comp.context);
        if (!gl) missingMappings.push(`${comp.code} (${comp.context})`);
      }

      if (missingMappings.length > 0) {
        await db.update(payrollRecords).set({
          sapPostingStatus: 'failed',
          sapErrorMessage: `GL mappings missing for: ${missingMappings.join(', ')}`,
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, record.id));
        return res.status(400).json({ error: 'GL mappings incomplete', missingMappings });
      }
    }

    const [period] = await db.select({ periodName: payrollPeriods.periodName, startDate: payrollPeriods.startDate })
      .from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    const periodLabel = period?.periodName || 'Unknown Period';

    const postingDate = period?.startDate
      ? new Date(new Date(period.startDate).getFullYear(), new Date(period.startDate).getMonth() + 1, 0).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    let jePayload: any;

    if (isOtOnly) {
      const otAmount = parseFloat(entry.overtimeEarned || '0');
      const otGl = getGlCode(allMappings, 'OVERTIME', 'expense')!;
      const payableGl = getGlCode(allMappings, 'NET_PAY', 'payroll_liability')!;

      jePayload = {
        ReferenceDate: postingDate,
        TaxDate: postingDate,
        DueDate: postingDate,
        Memo: `Manual Overtime Entry - ${empName} - ${periodLabel}`,
        Reference: `OT-ENTRY-${entry.id}`,
        Reference2: employee.cardCode,
        U_Employee_Name: empName,
        JournalEntryLines: [
          {
            AccountCode: otGl,
            Debit: otAmount,
            Credit: 0,
            LineMemo: `Manual OT Expense - ${empName} - ${periodLabel}`,
          },
          {
            AccountCode: payableGl,
            ShortName: employee.cardCode,
            Debit: 0,
            Credit: otAmount,
            LineMemo: `Manual OT Payable - ${empName} - ${periodLabel}`,
          },
        ],
      };
    } else {
      const jeLines: any[] = [];

      const earningComponents = [
        { code: 'BASIC', value: parseFloat(entry.baseEarnings || '0') },
        { code: 'OVERTIME', value: parseFloat(entry.overtimeEarned || '0') },
      ];

      for (const comp of earningComponents) {
        if (comp.value > 0) {
          const acctCode = getGlCode(allMappings, comp.code, 'expense');
          if (acctCode) {
            jeLines.push({
              AccountCode: acctCode,
              Debit: comp.value,
              Credit: 0,
              LineMemo: `Manual Salary ${comp.code} - ${empName} - ${periodLabel}`,
            });
          }
        }
      }

      const deductionComponents = [
        { code: 'PF_EMPLOYEE', value: parseFloat(entry.pfAmount || '0') },
        { code: 'ESIC_EMPLOYEE', value: parseFloat(entry.esicAmount || '0') },
        { code: 'PT', value: parseFloat(entry.ptAmount || '0') },
        { code: 'TDS', value: parseFloat(entry.tdsAmount || '0') },
      ];

      for (const comp of deductionComponents) {
        if (comp.value > 0) {
          const acctCode = getGlCode(allMappings, comp.code, 'payroll_liability');
          if (acctCode) {
            jeLines.push({
              AccountCode: acctCode,
              Debit: 0,
              Credit: comp.value,
              LineMemo: `Manual Salary ${comp.code} - ${empName} - ${periodLabel}`,
            });
          }
        }
      }

      const netPayVal = parseFloat(entry.netPay || '0');
      if (netPayVal > 0) {
        const acctCode = getGlCode(allMappings, 'NET_PAY', 'payroll_liability');
        if (acctCode) {
          jeLines.push({
            AccountCode: acctCode,
            Debit: 0,
            Credit: netPayVal,
            LineMemo: `Manual Salary Net Pay - ${empName} - ${periodLabel}`,
          });
        }
      }

      if (jeLines.length === 0) {
        return res.status(400).json({ error: 'No JE lines could be built. GL mappings may be missing.' });
      }

      jePayload = {
        ReferenceDate: postingDate,
        TaxDate: postingDate,
        DueDate: postingDate,
        Memo: `Manual Salary JE - ${empName} - ${periodLabel}`,
        Reference: `MS-ENTRY-${entry.id}`,
        Reference2: employee.cardCode,
        Reference3: '194C',
        U_Employee_Name: empName,
        U_TDS_Status: 'A',
        U_PF_Status: 'A',
        U_ESIC_Status: 'A',
        U_PT_Status: 'A',
        JournalEntryLines: jeLines,
      };
    }

    await db.update(payrollRecords).set({
      sapPostingStatus: 'pending',
      sapErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, record.id));

    const sapResult = await postJeToSap(currentUser.id, jePayload);

    if (sapResult.success) {
      const history = Array.isArray(record.statusHistory) ? [...(record.statusHistory as any[])] : [];
      history.push(buildStatusTransition(record.status || 'verified', 'transferred', 'post_sap', `Posted to SAP - JE #${sapResult.jeNumber}`, currentUser));

      await db.update(payrollRecords).set({
        sapDocEntry: sapResult.docEntry!,
        sapJeNumber: sapResult.jeNumber!,
        sapPostedAt: new Date(),
        sapPostingStatus: 'posted',
        status: 'transferred',
        sapErrorMessage: null,
        statusHistory: history,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));

      res.json({ success: true, sapDocEntry: sapResult.docEntry, sapJeNumber: sapResult.jeNumber });
    } else {
      await db.update(payrollRecords).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: sapResult.error || 'SAP posting failed',
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));

      res.status(500).json({ error: sapResult.error || 'SAP posting failed' });
    }
  } catch (e: any) {
    console.error('Error posting contract worker salary to SAP:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reverse-sap', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry || !entry.payrollRecordId) return res.status(404).json({ error: 'Entry not found' });

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    if (record.sapPostingStatus !== 'posted') {
      return res.status(400).json({ error: 'Only SAP-posted records can be reversed.' });
    }
    if (record.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This record has already been reversed.', reversalJeNumber: record.reversalSapJeNumber });
    }

    const [employee] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      cardCode: users.cardCode,
      cardName: users.cardName,
      employeeCode: users.employeeCode,
    }).from(users).where(eq(users.id, record.userId));

    if (!employee) return res.status(400).json({ error: 'Employee not found' });
    const empName = getUserName(employee);

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));

    const [period] = await db.select({ periodName: payrollPeriods.periodName, startDate: payrollPeriods.startDate })
      .from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    const periodLabel = period?.periodName || 'Unknown Period';

    const jeLines: any[] = [];
    let lineNum = 0;

    const earningComponents = [
      { code: 'BASIC', value: parseFloat(entry.baseEarnings || '0') },
      { code: 'OVERTIME', value: parseFloat(entry.overtimeEarned || '0') },
    ];

    for (const comp of earningComponents) {
      if (comp.value > 0) {
        const acctCode = getGlCode(allMappings, comp.code, 'expense');
        if (acctCode) {
          jeLines.push({
            Line_ID: lineNum++,
            AccountCode: acctCode,
            Debit: 0,
            Credit: comp.value,
            LineMemo: `REVERSAL - Manual Salary ${comp.code} - ${empName} - ${periodLabel}`,
          });
        }
      }
    }

    const deductionComponents = [
      { code: 'PF_EMPLOYEE', value: parseFloat(entry.pfAmount || '0') },
      { code: 'ESIC_EMPLOYEE', value: parseFloat(entry.esicAmount || '0') },
      { code: 'PT', value: parseFloat(entry.ptAmount || '0') },
      { code: 'TDS', value: parseFloat(entry.tdsAmount || '0') },
    ];

    for (const comp of deductionComponents) {
      if (comp.value > 0) {
        const acctCode = getGlCode(allMappings, comp.code, 'payroll_liability');
        if (acctCode) {
          jeLines.push({
            Line_ID: lineNum++,
            AccountCode: acctCode,
            Debit: comp.value,
            Credit: 0,
            LineMemo: `REVERSAL - Manual Salary ${comp.code} - ${empName} - ${periodLabel}`,
          });
        }
      }
    }

    const netPayVal = parseFloat(entry.netPay || '0');
    if (netPayVal > 0) {
      const acctCode = getGlCode(allMappings, 'NET_PAY', 'payroll_liability');
      if (acctCode) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: acctCode,
          Debit: netPayVal,
          Credit: 0,
          LineMemo: `REVERSAL - Manual Salary Net Pay - ${empName} - ${periodLabel}`,
        });
      }
    }

    if (jeLines.length === 0) {
      return res.status(400).json({ error: 'No JE lines could be built for reversal. GL mappings may be missing.' });
    }

    const originalJeRef = record.sapJeNumber || String(record.sapDocEntry);

    // Use the same posting date as the original JE (last day of the period month).
    // Never use today's date — the reversal must sit on the same accounting period as the original.
    const postingDate = period?.startDate
      ? new Date(new Date(period.startDate).getFullYear(), new Date(period.startDate).getMonth() + 1, 0).toISOString().split('T')[0]
      : (record.sapPostedAt ? new Date(record.sapPostedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    const jePayload = {
      ReferenceDate: postingDate,
      TaxDate: postingDate,
      DueDate: postingDate,
      Memo: `REVERSAL - Manual Salary Salary JE #${originalJeRef} - ${empName} - ${periodLabel}`,
      Reference: originalJeRef,        // Links reversal back to original JE number in SAP
      Reference2: employee.cardCode || '',
      Reference3: `REV-194C-${originalJeRef}`,
      U_Employee_Name: empName,
      JournalEntryLines: jeLines,
    };

    const sapResult = await postJeToSap(currentUser.id, jePayload);

    if (sapResult.success) {
      const history = Array.isArray(record.statusHistory) ? [...(record.statusHistory as any[])] : [];
      history.push(buildStatusTransition(record.status || 'transferred', 'reversed', 'reverse', `Reversal JE #${sapResult.jeNumber} posted to SAP`, currentUser));

      await db.update(payrollRecords).set({
        status: 'reversed',
        reversalSapDocEntry: sapResult.docEntry!,
        reversalSapJeNumber: sapResult.jeNumber!,
        reversalSapPostedAt: new Date(),
        reversedBy: currentUser.id,
        reversedAt: new Date(),
        reversalMemo: `REVERSAL of Manual Salary Salary JE #${originalJeRef} - ${empName} - ${periodLabel}`,
        statusHistory: history,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, entry.payrollRecordId));

      return res.json({
        success: true,
        message: `Reversal JE posted successfully`,
        originalJeNumber: record.sapJeNumber,
        reversalJeNumber: sapResult.jeNumber,
        reversalDocEntry: sapResult.docEntry,
      });
    } else {
      return res.status(500).json({ error: sapResult.error || 'SAP reversal posting failed' });
    }
  } catch (e: any) {
    console.error('Error reversing contract worker salary in SAP:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
