import { Router, Request, Response } from 'express';
import { db } from './db';
import {
  manualSalaryEntries,
  payrollRecords,
  payrollPeriods,
  users,
  payrollSettings,
  glAccountMappings,
} from '@shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { sapHttpsClient } from './sap-b1-integration/sap-https-client';
import { sapSessionManager } from './sap-session-manager';

const router = Router();
router.use(ensureAuthenticated);

async function getPtConfig(): Promise<{ monthly: number; february: number }> {
  const settings = await db.select().from(payrollSettings).where(
    eq(payrollSettings.isActive, true)
  );
  let monthly = 200;
  let february = 300;
  for (const s of settings) {
    if (s.settingName === 'professional_tax_monthly') monthly = parseFloat(s.settingValue) || 200;
    if (s.settingName === 'professional_tax_february') february = parseFloat(s.settingValue) || 300;
  }
  return { monthly, february };
}

function calculateManualSalary(input: {
  entryType: string;
  daysWorked: number;
  hoursWorked: number;
  quantity: number;
  baseRate: number;
  overtimeHours: number;
  overtimeRateMultiplier: number;
  periodMonth: number;
}) {
  let baseEarnings = 0;
  if (input.entryType === 'daily') {
    baseEarnings = input.daysWorked * input.baseRate;
  } else if (input.entryType === 'hourly') {
    baseEarnings = input.hoursWorked * input.baseRate;
  } else {
    baseEarnings = input.quantity * input.baseRate;
  }

  const hourlyRateForOT = input.entryType === 'daily'
    ? input.baseRate / 8
    : input.entryType === 'hourly'
      ? input.baseRate
      : input.baseRate / 8;

  const overtimeEarned = input.overtimeHours * hourlyRateForOT * input.overtimeRateMultiplier;
  const grossEarnings = baseEarnings + overtimeEarned;

  const pfBase = Math.min(grossEarnings, 15000);
  const pfAmount = Math.round(pfBase * 0.12 * 100) / 100;
  const esicAmount = grossEarnings <= 21000 ? Math.round(grossEarnings * 0.0075 * 100) / 100 : 0;
  const ptAmount = input.periodMonth === 2 ? 300 : 200;
  const tdsAmount = Math.round(grossEarnings * 0.01 * 100) / 100;

  const totalDeductions = Math.round((pfAmount + ptAmount + esicAmount + tdsAmount) * 100) / 100;
  const netPay = Math.round((grossEarnings - totalDeductions) * 100) / 100;

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

router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { entryType, daysWorked, hoursWorked, quantity, baseRate, overtimeHours, overtimeRateMultiplier, periodId } = req.body;
    let periodMonth = new Date().getMonth() + 1;
    if (periodId) {
      const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
      if (period) periodMonth = new Date(period.startDate).getMonth() + 1;
    }
    const result = calculateManualSalary({
      entryType: entryType || 'daily',
      daysWorked: parseFloat(daysWorked || '0'),
      hoursWorked: parseFloat(hoursWorked || '0'),
      quantity: parseFloat(quantity || '0'),
      baseRate: parseFloat(baseRate || '0'),
      overtimeHours: parseFloat(overtimeHours || '0'),
      overtimeRateMultiplier: parseFloat(overtimeRateMultiplier || '1.5'),
      periodMonth,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/create', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    const { periodId, userId, entryType, daysWorked, hoursWorked, quantity, baseRate, overtimeHours, overtimeRateMultiplier, remarks } = req.body;

    if (!periodId || !userId || !baseRate) {
      return res.status(400).json({ error: 'periodId, userId, and baseRate are required' });
    }

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
    if (!period) return res.status(404).json({ error: 'Payroll period not found' });

    const [employee] = await db.select().from(users).where(eq(users.id, userId));
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const periodMonth = new Date(period.startDate).getMonth() + 1;
    const calc = calculateManualSalary({
      entryType: entryType || 'daily',
      daysWorked: parseFloat(daysWorked || '0'),
      hoursWorked: parseFloat(hoursWorked || '0'),
      quantity: parseFloat(quantity || '0'),
      baseRate: parseFloat(baseRate || '0'),
      overtimeHours: parseFloat(overtimeHours || '0'),
      overtimeRateMultiplier: parseFloat(overtimeRateMultiplier || '1.5'),
      periodMonth,
    });

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
      salarySource: 'manual_salary',
      workerType: 'contract_worker',
      statusHistory: [{
        status: 'generated',
        timestamp: new Date().toISOString(),
        userId: currentUser?.id,
        reason: 'Manual salary entry created for contract worker',
      }],
    }).returning();

    const [entry] = await db.insert(manualSalaryEntries).values({
      periodId,
      userId,
      payrollRecordId: payrollRecord.id,
      entryType: entryType || 'daily',
      daysWorked: (daysWorked || '0').toString(),
      hoursWorked: (hoursWorked || '0').toString(),
      quantity: (quantity || '0').toString(),
      baseRate: baseRate.toString(),
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

    res.json({ entry, payrollRecord });
  } catch (e: any) {
    console.error('Error creating manual salary:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/list', async (req: Request, res: Response) => {
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
    }).from(manualSalaryEntries)
      .leftJoin(users, eq(manualSalaryEntries.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(manualSalaryEntries.createdAt));

    const entriesWithStatus = [];
    for (const entry of entries) {
      let payrollStatus = 'generated';
      let sapPostingStatus = null;
      let sapJeNumber = null;
      if (entry.payrollRecordId) {
        const [pr] = await db.select({
          status: payrollRecords.status,
          sapPostingStatus: payrollRecords.sapPostingStatus,
          sapJeNumber: payrollRecords.sapJeNumber,
          sapDocEntry: payrollRecords.sapDocEntry,
          verifiedBy: payrollRecords.verifiedBy,
          verifiedAt: payrollRecords.verifiedAt,
          heldReason: payrollRecords.heldReason,
        }).from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
        if (pr) {
          payrollStatus = pr.status || 'generated';
          sapPostingStatus = pr.sapPostingStatus;
          sapJeNumber = pr.sapJeNumber;
        }
      }
      entriesWithStatus.push({
        ...entry,
        payrollStatus,
        sapPostingStatus,
        sapJeNumber,
      });
    }

    res.json(entriesWithStatus);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    if (entry.payrollRecordId) {
      const [pr] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
      if (pr && pr.status !== 'generated') {
        return res.status(400).json({ error: `Cannot delete entry with status: ${pr.status}. Only generated entries can be deleted.` });
      }
      await db.delete(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    }

    await db.delete(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (!entry.payrollRecordId) return res.status(400).json({ error: 'No linked payroll record' });

    const [pr] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!pr) return res.status(404).json({ error: 'Payroll record not found' });
    if (pr.status !== 'generated') return res.status(400).json({ error: `Cannot verify from status: ${pr.status}` });

    const history = Array.isArray(pr.statusHistory) ? [...pr.statusHistory] : [];
    history.push({
      status: 'verified',
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
      reason: 'Manual salary verified',
    });

    await db.update(payrollRecords).set({
      status: 'verified',
      verifiedBy: currentUser?.id,
      verifiedAt: new Date(),
      statusHistory: history,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, entry.payrollRecordId));

    res.json({ success: true, status: 'verified' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/hold', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const { reason } = req.body;
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry || !entry.payrollRecordId) return res.status(404).json({ error: 'Entry not found' });

    const [pr] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!pr) return res.status(404).json({ error: 'Payroll record not found' });

    const history = Array.isArray(pr.statusHistory) ? [...pr.statusHistory] : [];
    history.push({
      status: 'held',
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
      reason: reason || 'Put on hold',
    });

    await db.update(payrollRecords).set({
      status: 'held',
      heldBy: currentUser?.id,
      heldAt: new Date(),
      heldReason: reason || 'Put on hold',
      statusHistory: history,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, entry.payrollRecordId));

    res.json({ success: true, status: 'held' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const { reason } = req.body;
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry || !entry.payrollRecordId) return res.status(404).json({ error: 'Entry not found' });

    const [pr] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!pr) return res.status(404).json({ error: 'Payroll record not found' });

    const history = Array.isArray(pr.statusHistory) ? [...pr.statusHistory] : [];
    history.push({
      status: 'rejected',
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
      reason: reason || 'Rejected',
    });

    await db.update(payrollRecords).set({
      status: 'rejected',
      statusHistory: history,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, entry.payrollRecordId));

    res.json({ success: true, status: 'rejected' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/release', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry || !entry.payrollRecordId) return res.status(404).json({ error: 'Entry not found' });

    const [pr] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!pr) return res.status(404).json({ error: 'Payroll record not found' });
    if (pr.status !== 'held' && pr.status !== 'rejected') {
      return res.status(400).json({ error: `Cannot release from status: ${pr.status}` });
    }

    const history = Array.isArray(pr.statusHistory) ? [...pr.statusHistory] : [];
    history.push({
      status: 'generated',
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
      reason: 'Released back to generated',
    });

    await db.update(payrollRecords).set({
      status: 'generated',
      heldBy: null,
      heldAt: null,
      heldReason: null,
      statusHistory: history,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, entry.payrollRecordId));

    res.json({ success: true, status: 'generated' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/post-sap', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.user as any;
    const [entry] = await db.select().from(manualSalaryEntries).where(eq(manualSalaryEntries.id, id));
    if (!entry || !entry.payrollRecordId) return res.status(404).json({ error: 'Entry not found' });

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, entry.payrollRecordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    if (record.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'Already posted to SAP' });
    }
    if (record.status !== 'verified') {
      return res.status(400).json({ error: 'Only verified records can be posted to SAP' });
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

    const empName = employee.firstName && employee.lastName
      ? `${employee.firstName} ${employee.lastName}`
      : employee.username || 'Unknown';

    if (!employee.cardCode || employee.cardCode.trim() === '') {
      await db.update(payrollRecords).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: `Employee ${empName} has no SAP BP code.`,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));
      return res.status(400).json({ error: `Employee ${empName} has no SAP BP code.` });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const glMap = new Map<string, string>();
    const REQUIRED = [
      { code: 'BASIC', context: 'expense' },
      { code: 'OVERTIME', context: 'expense' },
      { code: 'PF_EMPLOYEE', context: 'payroll_liability' },
      { code: 'ESIC_EMPLOYEE', context: 'payroll_liability' },
      { code: 'PT', context: 'payroll_liability' },
      { code: 'TDS', context: 'payroll_liability' },
      { code: 'NET_PAY', context: 'payroll_liability' },
    ];
    const missing: string[] = [];
    for (const comp of REQUIRED) {
      const mapping = allMappings.find(m => m.componentCode === comp.code && m.postingContext === comp.context && m.glAccountCode && m.glAccountCode.trim() !== '');
      if (!mapping) missing.push(`${comp.code} (${comp.context})`);
      else glMap.set(`${comp.code}|${comp.context}`, mapping.glAccountCode!);
    }

    if (missing.length > 0) {
      await db.update(payrollRecords).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: `GL mappings missing: ${missing.join(', ')}`,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));
      return res.status(400).json({ error: 'GL mappings incomplete', missing });
    }

    const [period] = await db.select({ periodName: payrollPeriods.periodName, startDate: payrollPeriods.startDate })
      .from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    const periodLabel = period?.periodName || 'Unknown Period';

    const jeLines: any[] = [];
    let lineNum = 0;
    const baseAmount = parseFloat(entry.baseEarnings || '0');
    const otAmount = parseFloat(entry.overtimeEarned || '0');

    if (baseAmount > 0) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: glMap.get('BASIC|expense'),
        Debit: baseAmount,
        Credit: 0,
        LineMemo: `Contract Worker BASIC - ${empName} - ${periodLabel}`,
      });
    }
    if (otAmount > 0) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: glMap.get('OVERTIME|expense'),
        Debit: otAmount,
        Credit: 0,
        LineMemo: `Contract Worker OVERTIME - ${empName} - ${periodLabel}`,
      });
    }

    const deductions = [
      { code: 'PF_EMPLOYEE', value: parseFloat(entry.pfAmount || '0') },
      { code: 'ESIC_EMPLOYEE', value: parseFloat(entry.esicAmount || '0') },
      { code: 'PT', value: parseFloat(entry.ptAmount || '0') },
      { code: 'TDS', value: parseFloat(entry.tdsAmount || '0') },
    ];
    for (const d of deductions) {
      if (d.value > 0) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: glMap.get(`${d.code}|payroll_liability`),
          Debit: 0,
          Credit: d.value,
          LineMemo: `Contract Worker ${d.code} - ${empName} - ${periodLabel}`,
        });
      }
    }

    const netPayVal = parseFloat(entry.netPay || '0');
    if (netPayVal > 0) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: glMap.get('NET_PAY|payroll_liability'),
        Debit: 0,
        Credit: netPayVal,
        LineMemo: `Contract Worker Net Pay - ${empName} - ${periodLabel}`,
      });
    }

    const postingDate = period?.startDate
      ? new Date(new Date(period.startDate).getFullYear(), new Date(period.startDate).getMonth() + 1, 0).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const jePayload = {
      ReferenceDate: postingDate,
      Memo: `Contract Worker Salary JE - ${empName} - ${periodLabel}`,
      Reference2: employee.cardCode,
      Reference3: '194C',
      U_Employee_Name: empName,
      JournalEntryLines: jeLines,
    };

    await db.update(payrollRecords).set({
      sapPostingStatus: 'pending',
      sapErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, record.id));

    let session = sapSessionManager.getSession(currentUser.id);
    if (!session) {
      const sapUrl = process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000';
      const sapUser = process.env.SAP_USERNAME || '';
      const sapPass = process.env.SAP_PASSWORD || '';
      const sapDb = process.env.SAP_COMPANY_DB || '';
      if (!sapUser || !sapPass || !sapDb) {
        await db.update(payrollRecords).set({
          sapPostingStatus: 'failed',
          sapErrorMessage: 'SAP credentials not configured',
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, record.id));
        return res.status(500).json({ error: 'SAP credentials not configured' });
      }
      const loginResp = await sapHttpsClient.post(`${sapUrl}/b1s/v1/Login`, { UserName: sapUser, Password: sapPass, CompanyDB: sapDb });
      if (loginResp.error) {
        await db.update(payrollRecords).set({
          sapPostingStatus: 'failed',
          sapErrorMessage: `SAP login failed: ${loginResp.error}`,
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, record.id));
        return res.status(500).json({ error: `SAP login failed: ${loginResp.error}` });
      }
      session = loginResp.data?.SessionId || loginResp.SessionId;
    }

    const sapUrl = process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000';
    const jeResp = await sapHttpsClient.post(`${sapUrl}/b1s/v1/JournalEntries`, jePayload, {
      headers: { Cookie: `B1SESSION=${session}` },
    });

    if (jeResp.error || !jeResp.data) {
      await db.update(payrollRecords).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: `SAP JE posting failed: ${jeResp.error || JSON.stringify(jeResp)}`,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, record.id));
      return res.status(500).json({ error: `SAP JE posting failed: ${jeResp.error}` });
    }

    const sapDocEntry = jeResp.data.DocEntry;
    const sapJeNumber = jeResp.data.Number?.toString() || jeResp.data.DocEntry?.toString();

    const history = Array.isArray(record.statusHistory) ? [...record.statusHistory] : [];
    history.push({
      status: 'transferred',
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
      reason: `Posted to SAP - JE #${sapJeNumber}`,
    });

    await db.update(payrollRecords).set({
      sapDocEntry,
      sapJeNumber,
      sapPostedAt: new Date(),
      sapPostingStatus: 'posted',
      status: 'transferred',
      statusHistory: history,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, record.id));

    res.json({ success: true, sapDocEntry, sapJeNumber });
  } catch (e: any) {
    console.error('Error posting contract worker salary to SAP:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
