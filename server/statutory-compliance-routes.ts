import { Router, Request, Response } from 'express';
import { db } from './db';
import { 
  glAccountMappings, glPostingLog, 
  statutoryChallans, statutoryChallanDetails, statutoryFilingStatus,
  ptStateConfig, payrollPeriods, payrollRecords, users,
  insertGlAccountMappingSchema, insertStatutoryFilingStatusSchema
} from '@shared/schema';
import { eq, and, sql, desc, asc, inArray } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();
router.use(ensureAuthenticated);

const VALID_PAYROLL_STATUSES = ['processed', 'approved', 'paid', 'locked'];

function getFinancialYear(month: number, year: number): string {
  if (month >= 4) return `${year}-${(year + 1).toString().slice(2)}`;
  return `${year - 1}-${year.toString().slice(2)}`;
}

function getTdsQuarter(month: number): string {
  if (month >= 4 && month <= 6) return 'Q1';
  if (month >= 7 && month <= 9) return 'Q2';
  if (month >= 10 && month <= 12) return 'Q3';
  return 'Q4';
}

function getEsicHalf(month: number): string {
  if (month >= 4 && month <= 9) return 'H1';
  return 'H2';
}

router.get('/gl-mappings', async (_req: Request, res: Response) => {
  const mappings = await db.select().from(glAccountMappings).orderBy(asc(glAccountMappings.category), asc(glAccountMappings.componentCode));
  res.json(mappings);
});

router.post('/gl-mappings', async (req: Request, res: Response) => {
  try {
    const parsed = insertGlAccountMappingSchema.parse(req.body);
    const [mapping] = await db.insert(glAccountMappings).values({
      ...parsed,
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    }).returning();
    res.json(mapping);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/gl-mappings/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { glAccountCode, glAccountName, debitCredit, isActive } = req.body;
  const [mapping] = await db.update(glAccountMappings)
    .set({ glAccountCode, glAccountName, debitCredit, isActive, updatedBy: (req as any).user?.id, updatedAt: new Date() })
    .where(eq(glAccountMappings.id, id))
    .returning();
  res.json(mapping);
});

router.delete('/gl-mappings/:id', async (req: Request, res: Response) => {
  await db.delete(glAccountMappings).where(eq(glAccountMappings.id, parseInt(req.params.id)));
  res.json({ success: true });
});

router.get('/gl-mappings/validate/:moduleType', async (req: Request, res: Response) => {
  const moduleType = req.params.moduleType.toUpperCase();
  const componentMap: Record<string, string[]> = {
    TDS: ['TDS'],
    PF: ['PF_EMPLOYEE', 'PF_EMPLOYER'],
    ESIC: ['ESIC_EMPLOYEE', 'ESIC_EMPLOYER'],
    PT: ['PT'],
  };
  const required = componentMap[moduleType] || [];
  const mappings = await db.select().from(glAccountMappings)
    .where(and(
      inArray(glAccountMappings.componentCode, required),
      eq(glAccountMappings.postingContext, 'statutory_payment'),
      eq(glAccountMappings.isActive, true),
    ));
  const mapped = mappings.map(m => m.componentCode);
  const missing = required.filter(r => !mapped.includes(r));
  res.json({ valid: missing.length === 0, missing, mapped });
});

router.get('/challans', async (req: Request, res: Response) => {
  const { moduleType, financialYear, status } = req.query;
  let query = db.select().from(statutoryChallans);
  const conditions: any[] = [];
  if (moduleType) conditions.push(eq(statutoryChallans.moduleType, moduleType as string));
  if (financialYear) conditions.push(eq(statutoryChallans.financialYear, financialYear as string));
  if (status) conditions.push(eq(statutoryChallans.status, status as string));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  const challans = await (query as any).orderBy(desc(statutoryChallans.year), desc(statutoryChallans.month));
  res.json(challans);
});

router.get('/challans/:id', async (req: Request, res: Response) => {
  const [challan] = await db.select().from(statutoryChallans).where(eq(statutoryChallans.id, parseInt(req.params.id)));
  if (!challan) return res.status(404).json({ error: 'Challan not found' });
  const details = await db.select({
    id: statutoryChallanDetails.id,
    employeeId: statutoryChallanDetails.employeeId,
    payrollRecordId: statutoryChallanDetails.payrollRecordId,
    employeeContribution: statutoryChallanDetails.employeeContribution,
    employerContribution: statutoryChallanDetails.employerContribution,
    grossSalary: statutoryChallanDetails.grossSalary,
    employeeName: users.name,
    employeeCode: users.employeeId,
  }).from(statutoryChallanDetails)
    .leftJoin(users, eq(statutoryChallanDetails.employeeId, users.id))
    .where(eq(statutoryChallanDetails.challanId, challan.id))
    .orderBy(asc(users.name));
  res.json({ ...challan, details });
});

router.post('/challans/generate', async (req: Request, res: Response) => {
  const { moduleType, payrollPeriodId, state } = req.body;
  if (!moduleType || !payrollPeriodId) {
    return res.status(400).json({ error: 'moduleType and payrollPeriodId are required' });
  }

  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, payrollPeriodId));
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });

  if (!VALID_PAYROLL_STATUSES.includes(period.status || '')) {
    return res.status(400).json({ error: `Payroll period must be in one of these statuses: ${VALID_PAYROLL_STATUSES.join(', ')}. Current status: ${period.status}` });
  }

  const stateCondition = moduleType === 'PT' && state ? state : null;
  const existingConditions: any[] = [
    eq(statutoryChallans.moduleType, moduleType),
    eq(statutoryChallans.payrollPeriodId, payrollPeriodId),
  ];
  const existing = await db.select().from(statutoryChallans).where(and(...existingConditions));
  const notReversed = existing.filter(e => e.status !== 'reversed' && (moduleType !== 'PT' || e.state === stateCondition));
  if (notReversed.length > 0) {
    return res.status(409).json({ error: 'A challan already exists for this module and period' });
  }

  const records = await db.select().from(payrollRecords)
    .where(eq(payrollRecords.periodId, payrollPeriodId));

  if (records.length === 0) {
    return res.status(400).json({ error: 'No payroll records found for this period' });
  }

  const startDate = new Date(period.startDate);
  const month = startDate.getMonth() + 1;
  const year = startDate.getFullYear();
  const fy = getFinancialYear(month, year);

  let totalEmp = 0, totalEmpr = 0;
  const detailRows: any[] = [];

  for (const rec of records) {
    let empAmt = 0, emprAmt = 0;
    const gross = parseFloat(rec.grossPay?.toString() || '0');

    switch (moduleType) {
      case 'TDS':
        empAmt = parseFloat(rec.tdsAmount?.toString() || rec.incomeTax?.toString() || '0');
        break;
      case 'PF':
        empAmt = parseFloat(rec.employeePf?.toString() || rec.providentFund?.toString() || '0');
        emprAmt = parseFloat(rec.employerPf?.toString() || '0');
        break;
      case 'ESIC':
        empAmt = parseFloat(rec.employeeEsic?.toString() || rec.esiDeduction?.toString() || '0');
        emprAmt = parseFloat(rec.employerEsic?.toString() || '0');
        break;
      case 'PT':
        empAmt = parseFloat(rec.professionalTax?.toString() || '0');
        break;
    }

    if (empAmt > 0 || emprAmt > 0) {
      totalEmp += empAmt;
      totalEmpr += emprAmt;
      detailRows.push({
        employeeId: rec.employeeId,
        payrollRecordId: rec.id,
        employeeContribution: empAmt.toFixed(2),
        employerContribution: emprAmt.toFixed(2),
        grossSalary: gross.toFixed(2),
      });
    }
  }

  const totalAmount = totalEmp + totalEmpr;
  const ref = `${moduleType}-${year}-${month.toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

  const [challan] = await db.insert(statutoryChallans).values({
    challanReference: ref,
    moduleType,
    payrollPeriodId,
    month,
    year,
    financialYear: fy,
    state: stateCondition,
    employeeCount: detailRows.length,
    totalEmployeeContribution: totalEmp.toFixed(2),
    totalEmployerContribution: totalEmpr.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    tdsSection: moduleType === 'TDS' ? '192' : null,
    tdsQuarter: moduleType === 'TDS' ? getTdsQuarter(month) : null,
    status: 'calculated',
    createdBy: (req as any).user?.id,
    updatedBy: (req as any).user?.id,
  }).returning();

  if (detailRows.length > 0) {
    await db.insert(statutoryChallanDetails).values(
      detailRows.map(d => ({ ...d, challanId: challan.id }))
    );
  }

  res.json(challan);
});

router.put('/challans/:id/payment', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { paymentDate, paymentMode, paymentReference, bankName, challanSerial,
          bsrCode, cinNumber, trrnNumber, grnNumber, esicEmployerCode, 
          establishmentCode, ptrcNumber, interest, penalty } = req.body;

  const [challan] = await db.select().from(statutoryChallans).where(eq(statutoryChallans.id, id));
  if (!challan) return res.status(404).json({ error: 'Challan not found' });
  if (challan.status !== 'calculated') {
    return res.status(400).json({ error: 'Challan must be in calculated status to record payment' });
  }

  const interestAmt = parseFloat(interest || '0');
  const penaltyAmt = parseFloat(penalty || '0');
  const baseAmount = parseFloat(challan.totalEmployeeContribution?.toString() || '0') 
                   + parseFloat(challan.totalEmployerContribution?.toString() || '0')
                   + parseFloat(challan.adminCharges?.toString() || '0');
  const newTotal = baseAmount + interestAmt + penaltyAmt;

  const [updated] = await db.update(statutoryChallans).set({
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    paymentMode, paymentReference, bankName, challanSerial,
    bsrCode, cinNumber, trrnNumber, grnNumber, esicEmployerCode, establishmentCode, ptrcNumber,
    interest: interestAmt.toFixed(2),
    penalty: penaltyAmt.toFixed(2),
    totalAmount: newTotal.toFixed(2),
    status: 'paid',
    updatedBy: (req as any).user?.id,
    updatedAt: new Date(),
  }).where(eq(statutoryChallans.id, id)).returning();

  res.json(updated);
});

router.put('/challans/:id/filing', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [challan] = await db.select().from(statutoryChallans).where(eq(statutoryChallans.id, id));
  if (!challan) return res.status(404).json({ error: 'Challan not found' });
  if (challan.status !== 'paid') {
    return res.status(400).json({ error: 'Challan must be paid before marking as filed' });
  }

  const [updated] = await db.update(statutoryChallans).set({
    status: 'filed',
    updatedBy: (req as any).user?.id,
    updatedAt: new Date(),
  }).where(eq(statutoryChallans.id, id)).returning();

  res.json(updated);
});

router.get('/filing-status', async (req: Request, res: Response) => {
  const { moduleType, financialYear } = req.query;
  const conditions: any[] = [];
  if (moduleType) conditions.push(eq(statutoryFilingStatus.moduleType, moduleType as string));
  if (financialYear) conditions.push(eq(statutoryFilingStatus.financialYear, financialYear as string));
  let query = db.select().from(statutoryFilingStatus);
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  const filings = await (query as any).orderBy(desc(statutoryFilingStatus.financialYear), asc(statutoryFilingStatus.filingPeriod));
  res.json(filings);
});

router.post('/filing-status', async (req: Request, res: Response) => {
  try {
    const parsed = insertStatutoryFilingStatusSchema.parse(req.body);
    const [filing] = await db.insert(statutoryFilingStatus).values({
      ...parsed,
      filedBy: (req as any).user?.id,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate as any) : null,
      filingDate: parsed.filingDate ? new Date(parsed.filingDate as any) : null,
    }).returning();
    res.json(filing);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/filing-status/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { filingDate, acknowledgementNumber, status, remarks } = req.body;
  const [filing] = await db.update(statutoryFilingStatus).set({
    filingDate: filingDate ? new Date(filingDate) : undefined,
    acknowledgementNumber, status, remarks,
    filedBy: (req as any).user?.id,
    updatedAt: new Date(),
  }).where(eq(statutoryFilingStatus.id, id)).returning();
  res.json(filing);
});

router.get('/posting-log', async (req: Request, res: Response) => {
  const { sourceModule, payrollPeriodId } = req.query;
  const conditions: any[] = [];
  if (sourceModule) conditions.push(eq(glPostingLog.sourceModule, sourceModule as string));
  if (payrollPeriodId) conditions.push(eq(glPostingLog.payrollPeriodId, parseInt(payrollPeriodId as string)));
  let query = db.select().from(glPostingLog);
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  const logs = await (query as any).orderBy(desc(glPostingLog.createdAt));
  res.json(logs);
});

router.get('/pt-state-config', async (_req: Request, res: Response) => {
  const configs = await db.select().from(ptStateConfig).orderBy(asc(ptStateConfig.state));
  res.json(configs);
});

router.post('/pt-state-config', async (req: Request, res: Response) => {
  const { state, ptrcNumber, filingFrequency, paymentDueDay, slabConfig } = req.body;
  if (!state) return res.status(400).json({ error: 'State is required' });
  const [config] = await db.insert(ptStateConfig).values({
    state, ptrcNumber, filingFrequency: filingFrequency || 'monthly',
    paymentDueDay: paymentDueDay || 0, slabConfig,
    createdBy: (req as any).user?.id,
  }).returning();
  res.json(config);
});

router.put('/pt-state-config/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { state, ptrcNumber, filingFrequency, paymentDueDay, isActive, slabConfig } = req.body;
  const [config] = await db.update(ptStateConfig).set({
    state, ptrcNumber, filingFrequency, paymentDueDay, isActive, slabConfig, updatedAt: new Date(),
  }).where(eq(ptStateConfig.id, id)).returning();
  res.json(config);
});

router.get('/payroll-periods/finalized', async (_req: Request, res: Response) => {
  const periods = await db.select().from(payrollPeriods)
    .where(inArray(payrollPeriods.status, VALID_PAYROLL_STATUSES))
    .orderBy(desc(payrollPeriods.startDate));
  res.json(periods);
});

router.get('/reconciliation/:moduleType', async (req: Request, res: Response) => {
  const moduleType = req.params.moduleType.toUpperCase();
  const { financialYear } = req.query;

  const challans = await db.select().from(statutoryChallans)
    .where(and(
      eq(statutoryChallans.moduleType, moduleType),
      financialYear ? eq(statutoryChallans.financialYear, financialYear as string) : sql`true`
    ))
    .orderBy(asc(statutoryChallans.year), asc(statutoryChallans.month));

  const result = [];
  for (const ch of challans) {
    const records = await db.select().from(payrollRecords)
      .where(eq(payrollRecords.periodId, ch.payrollPeriodId));

    let payrollTotal = 0;
    for (const rec of records) {
      switch (moduleType) {
        case 'TDS':
          payrollTotal += parseFloat(rec.tdsAmount?.toString() || rec.incomeTax?.toString() || '0');
          break;
        case 'PF':
          payrollTotal += parseFloat(rec.employeePf?.toString() || '0') + parseFloat(rec.employerPf?.toString() || '0');
          break;
        case 'ESIC':
          payrollTotal += parseFloat(rec.employeeEsic?.toString() || '0') + parseFloat(rec.employerEsic?.toString() || '0');
          break;
        case 'PT':
          payrollTotal += parseFloat(rec.professionalTax?.toString() || '0');
          break;
      }
    }

    const challanBase = parseFloat(ch.totalEmployeeContribution?.toString() || '0') 
                      + parseFloat(ch.totalEmployerContribution?.toString() || '0');
    const sapAmount = ch.glPostingId ? parseFloat(ch.totalAmount?.toString() || '0') : 0;

    result.push({
      month: ch.month,
      year: ch.year,
      challanId: ch.id,
      challanReference: ch.challanReference,
      challanStatus: ch.status,
      payrollTotal: payrollTotal.toFixed(2),
      challanTotal: challanBase.toFixed(2),
      sapPosted: sapAmount.toFixed(2),
      variance: (payrollTotal - challanBase).toFixed(2),
    });
  }

  res.json(result);
});

export default router;
