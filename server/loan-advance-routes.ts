import { Router, Request, Response } from 'express';
import { db } from './db';
import { employeeLoans, employeeLoanRepayments, employeeAdvances, employeeAdvanceRecoveries, users, glAccountMappings } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { sapHttpsClient } from './sap-b1-integration/sap-https-client';
import { sapSessionManager } from './sap-session-manager';

const router = Router();

async function generateLoanReference(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.select({ count: sql<number>`count(*)` }).from(employeeLoans);
  const num = (result[0]?.count || 0) + 1;
  return `LN-${year}-${String(num).padStart(3, '0')}`;
}

async function generateAdvanceReference(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.select({ count: sql<number>`count(*)` }).from(employeeAdvances);
  const num = (result[0]?.count || 0) + 1;
  return `ADV-${year}-${String(num).padStart(3, '0')}`;
}

router.get('/loans', async (req: Request, res: Response) => {
  try {
    const { employeeId, status } = req.query;
    let query = db.select().from(employeeLoans).orderBy(desc(employeeLoans.createdAt));

    const conditions: any[] = [];
    if (employeeId) conditions.push(eq(employeeLoans.employeeId, Number(employeeId)));
    if (status) conditions.push(eq(employeeLoans.status, String(status)));

    const loans = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    const loansWithNames = await Promise.all(loans.map(async (loan) => {
      const emp = await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(eq(users.id, loan.employeeId));
      const approver = loan.approvedBy ? await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(eq(users.id, loan.approvedBy)) : [];
      const empName = emp[0] ? (emp[0].firstName && emp[0].lastName ? `${emp[0].firstName} ${emp[0].lastName}` : emp[0].username) : 'Unknown';
      const approverName = approver[0] ? (approver[0].firstName && approver[0].lastName ? `${approver[0].firstName} ${approver[0].lastName}` : approver[0].username) : null;
      return {
        ...loan,
        employeeName: empName,
        approvedByName: approverName,
      };
    }));

    res.json(loansWithNames);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/loans/:id', async (req: Request, res: Response) => {
  try {
    const loan = await db.select().from(employeeLoans).where(eq(employeeLoans.id, Number(req.params.id)));
    if (!loan.length) return res.status(404).json({ message: 'Loan not found' });

    const repayments = await db.select().from(employeeLoanRepayments)
      .where(eq(employeeLoanRepayments.loanId, Number(req.params.id)))
      .orderBy(desc(employeeLoanRepayments.createdAt));

    const emp = await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(eq(users.id, loan[0].employeeId));
    const empName = emp[0] ? (emp[0].firstName && emp[0].lastName ? `${emp[0].firstName} ${emp[0].lastName}` : emp[0].username) : 'Unknown';

    res.json({ ...loan[0], employeeName: empName, repayments });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/loans', async (req: Request, res: Response) => {
  try {
    const { employeeId, loanType, principalAmount, interestRate, emiAmount, tenureMonths, disbursementDate, startDeductionDate, remarks, approvedBy } = req.body;

    const loanReference = await generateLoanReference();
    const currentUser = (req as any).user?.id || 1;

    const [loan] = await db.insert(employeeLoans).values({
      employeeId,
      loanType,
      loanReference,
      principalAmount: String(principalAmount),
      interestRate: String(interestRate || 0),
      emiAmount: String(emiAmount),
      tenureMonths,
      disbursementDate,
      startDeductionDate,
      totalRepaid: '0',
      outstandingBalance: String(principalAmount),
      installmentsPaid: 0,
      status: 'active',
      remarks,
      approvedBy: approvedBy || currentUser,
      createdBy: currentUser,
    }).returning();

    res.status(201).json(loan);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/loans/:id', async (req: Request, res: Response) => {
  try {
    const { status, emiAmount, remarks } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (emiAmount) updates.emiAmount = String(emiAmount);
    if (remarks !== undefined) updates.remarks = remarks;

    const [loan] = await db.update(employeeLoans).set(updates)
      .where(eq(employeeLoans.id, Number(req.params.id))).returning();

    res.json(loan);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/loans/:id/repayments', async (req: Request, res: Response) => {
  try {
    const repayments = await db.select().from(employeeLoanRepayments)
      .where(eq(employeeLoanRepayments.loanId, Number(req.params.id)))
      .orderBy(desc(employeeLoanRepayments.createdAt));
    res.json(repayments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/advances', async (req: Request, res: Response) => {
  try {
    const { employeeId, status } = req.query;

    const conditions: any[] = [];
    if (employeeId) conditions.push(eq(employeeAdvances.employeeId, Number(employeeId)));
    if (status) conditions.push(eq(employeeAdvances.status, String(status)));

    const advances = conditions.length > 0
      ? await db.select().from(employeeAdvances).where(and(...conditions)).orderBy(desc(employeeAdvances.createdAt))
      : await db.select().from(employeeAdvances).orderBy(desc(employeeAdvances.createdAt));

    const advancesWithNames = await Promise.all(advances.map(async (adv) => {
      const emp = await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(eq(users.id, adv.employeeId));
      const approver = adv.approvedBy ? await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(eq(users.id, adv.approvedBy)) : [];
      const empName = emp[0] ? (emp[0].firstName && emp[0].lastName ? `${emp[0].firstName} ${emp[0].lastName}` : emp[0].username) : 'Unknown';
      const approverName = approver[0] ? (approver[0].firstName && approver[0].lastName ? `${approver[0].firstName} ${approver[0].lastName}` : approver[0].username) : null;
      return {
        ...adv,
        employeeName: empName,
        approvedByName: approverName,
      };
    }));

    res.json(advancesWithNames);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/advances/:id', async (req: Request, res: Response) => {
  try {
    const advance = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, Number(req.params.id)));
    if (!advance.length) return res.status(404).json({ message: 'Advance not found' });

    const recoveries = await db.select().from(employeeAdvanceRecoveries)
      .where(eq(employeeAdvanceRecoveries.advanceId, Number(req.params.id)))
      .orderBy(desc(employeeAdvanceRecoveries.createdAt));

    const emp = await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(eq(users.id, advance[0].employeeId));
    const empName = emp[0] ? (emp[0].firstName && emp[0].lastName ? `${emp[0].firstName} ${emp[0].lastName}` : emp[0].username) : 'Unknown';

    res.json({ ...advance[0], employeeName: empName, recoveries });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/advances', async (req: Request, res: Response) => {
  try {
    const { employeeId, amount, recoveryType, recoveryAmount, recoveryMonths, advanceDate, startRecoveryDate, reason, approvedBy } = req.body;

    const advanceReference = await generateAdvanceReference();
    const currentUser = (req as any).user?.id || 1;

    const [advance] = await db.insert(employeeAdvances).values({
      employeeId,
      advanceReference,
      amount: String(amount),
      recoveryType,
      recoveryAmount: recoveryAmount ? String(recoveryAmount) : null,
      recoveryMonths: recoveryMonths || null,
      advanceDate,
      startRecoveryDate,
      totalRecovered: '0',
      outstandingBalance: String(amount),
      installmentsRecovered: 0,
      status: 'active',
      reason,
      approvedBy: approvedBy || currentUser,
      createdBy: currentUser,
    }).returning();

    res.status(201).json(advance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/advances/:id', async (req: Request, res: Response) => {
  try {
    const { status, recoveryAmount, remarks } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (recoveryAmount) updates.recoveryAmount = String(recoveryAmount);
    if (remarks !== undefined) updates.reason = remarks;

    const [advance] = await db.update(employeeAdvances).set(updates)
      .where(eq(employeeAdvances.id, Number(req.params.id))).returning();

    res.json(advance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/advances/:id/recoveries', async (req: Request, res: Response) => {
  try {
    const recoveries = await db.select().from(employeeAdvanceRecoveries)
      .where(eq(employeeAdvanceRecoveries.advanceId, Number(req.params.id)))
      .orderBy(desc(employeeAdvanceRecoveries.createdAt));
    res.json(recoveries);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/employee/:employeeId/summary', async (req: Request, res: Response) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const activeLoans = await db.select().from(employeeLoans)
      .where(and(eq(employeeLoans.employeeId, employeeId), eq(employeeLoans.status, 'active')));
    const activeAdvances = await db.select().from(employeeAdvances)
      .where(and(eq(employeeAdvances.employeeId, employeeId), eq(employeeAdvances.status, 'active')));

    const totalLoanOutstanding = activeLoans.reduce((s, l) => s + parseFloat(l.outstandingBalance || '0'), 0);
    const totalAdvanceOutstanding = activeAdvances.reduce((s, a) => s + parseFloat(a.outstandingBalance || '0'), 0);
    const totalMonthlyEmi = activeLoans.reduce((s, l) => s + parseFloat(l.emiAmount || '0'), 0);

    res.json({
      activeLoans: activeLoans.length,
      activeAdvances: activeAdvances.length,
      totalLoanOutstanding,
      totalAdvanceOutstanding,
      totalMonthlyEmi,
      loans: activeLoans,
      advances: activeAdvances,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

async function postDisbursementJE(
  type: 'loan' | 'advance',
  recordId: number,
  amount: string,
  employeeId: number,
  reference: string,
  disbursementDate: string,
  currentUserId: number,
): Promise<{ success: boolean; sapDocEntry?: number; sapJeNumber?: string; error?: string }> {
  const table = type === 'loan' ? employeeLoans : employeeAdvances;

  const [employee] = await db.select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    username: users.username,
    cardCode: users.cardCode,
    cardName: users.cardName,
  }).from(users).where(eq(users.id, employeeId));

  if (!employee) return { success: false, error: 'Employee not found' };

  const empName = employee.firstName && employee.lastName
    ? `${employee.firstName} ${employee.lastName}`
    : employee.username || 'Unknown';

  if (!employee.cardCode || employee.cardCode.trim() === '') {
    await db.update(table).set({
      sapPostingStatus: 'failed',
      sapErrorMessage: `Employee ${empName} has no SAP BP code linked.`,
      updatedAt: new Date(),
    } as any).where(eq(table.id, recordId));
    return { success: false, error: `Employee ${empName} has no SAP BP code linked. Please assign a BP code before posting.` };
  }

  const debitContext = type === 'loan' ? 'loan_disbursement' : 'advance_disbursement';
  const creditContext = debitContext;
  const debitCode = type === 'loan' ? 'LOAN_RECEIVABLE' : 'ADVANCE_RECEIVABLE';
  const creditCode = 'LOAN_ADVANCE_BANK';

  const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));

  const debitMapping = allMappings.find(
    m => m.componentCode === debitCode && m.postingContext === debitContext && m.glAccountCode && m.glAccountCode.trim() !== ''
  );
  const creditMapping = allMappings.find(
    m => m.componentCode === creditCode && m.postingContext === creditContext && m.glAccountCode && m.glAccountCode.trim() !== ''
  );

  const missingMappings: string[] = [];
  if (!debitMapping) missingMappings.push(`${debitCode} (${debitContext})`);
  if (!creditMapping) missingMappings.push(`${creditCode} (${creditContext})`);

  if (missingMappings.length > 0) {
    await db.update(table).set({
      sapPostingStatus: 'failed',
      sapErrorMessage: `GL mappings missing: ${missingMappings.join(', ')}. Go to Finance > GL Mapping to set them up.`,
      updatedAt: new Date(),
    } as any).where(eq(table.id, recordId));
    return { success: false, error: `GL mappings missing: ${missingMappings.join(', ')}` };
  }

  const disbAmount = parseFloat(amount);
  const typeLabel = type === 'loan' ? 'Loan' : 'Advance';
  const postingDate = disbursementDate || new Date().toISOString().split('T')[0];

  const jePayload = {
    ReferenceDate: postingDate,
    Memo: `${typeLabel} Disbursement - ${empName} - ${reference}`,
    Reference2: employee.cardCode,
    Reference3: reference,
    JournalEntryLines: [
      {
        Line_ID: 0,
        AccountCode: debitMapping!.glAccountCode,
        Debit: disbAmount,
        Credit: 0,
        LineMemo: `${typeLabel} Disbursement - ${empName} - ${reference}`,
      },
      {
        Line_ID: 1,
        AccountCode: creditMapping!.glAccountCode,
        Debit: 0,
        Credit: disbAmount,
        LineMemo: `${typeLabel} Disbursement - ${empName} - ${reference}`,
      },
    ],
  };

  await db.update(table).set({
    sapPostingStatus: 'pending',
    sapErrorMessage: null,
    updatedAt: new Date(),
  } as any).where(eq(table.id, recordId));

  const sapUrl = process.env.SAP_SERVICE_LAYER_URL || '';
  const sapUser = process.env.SAP_USERNAME || '';
  const sapPass = process.env.SAP_PASSWORD || '';
  const sapDb = process.env.SAP_COMPANY_DB || '';

  if (!sapUser || !sapPass || !sapDb || !sapUrl) {
    await db.update(table).set({
      sapPostingStatus: 'failed',
      sapErrorMessage: 'SAP credentials not configured.',
      updatedAt: new Date(),
    } as any).where(eq(table.id, recordId));
    return { success: false, error: 'SAP credentials not configured' };
  }

  try {
    let sessionId: string;
    const existingSession = sapSessionManager.getSession(currentUserId);
    if (existingSession) {
      sessionId = existingSession.sessionId;
    } else {
      const loginResult = await sapHttpsClient.login(sapUser, sapPass, sapDb);
      sessionId = loginResult.sessionId;
      sapSessionManager.setSession(currentUserId, {
        sessionId: loginResult.sessionId,
        routeId: undefined,
        userId: currentUserId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60000),
      });
    }

    const sapResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'POST',
      path: '/b1s/v1/JournalEntries',
      body: jePayload,
    });

    if (sapResponse.ok) {
      const responseData = JSON.parse(sapResponse.body);
      const docEntry = responseData.DocEntry;
      const jeNumber = String(responseData.Number || responseData.DocNum || responseData.DocEntry);

      await db.update(table).set({
        sapDocEntry: docEntry,
        sapJeNumber: jeNumber,
        sapPostingStatus: 'posted',
        sapPostedAt: new Date(),
        sapErrorMessage: null,
        updatedAt: new Date(),
      } as any).where(eq(table.id, recordId));

      return { success: true, sapDocEntry: docEntry, sapJeNumber: jeNumber };
    } else {
      let errorMsg = `SAP posting failed (${sapResponse.statusCode})`;
      try {
        const errParsed = JSON.parse(sapResponse.body);
        errorMsg = errParsed?.error?.message?.value || errorMsg;
      } catch (_) {}

      await db.update(table).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: errorMsg,
        updatedAt: new Date(),
      } as any).where(eq(table.id, recordId));

      return { success: false, error: errorMsg };
    }
  } catch (sapErr: any) {
    const errorMsg = `SAP connection error: ${sapErr.message}`;
    await db.update(table).set({
      sapPostingStatus: 'failed',
      sapErrorMessage: errorMsg,
      updatedAt: new Date(),
    } as any).where(eq(table.id, recordId));
    return { success: false, error: errorMsg };
  }
}

router.post('/loans/:id/transfer-sap', async (req: Request, res: Response) => {
  try {
    const loanId = Number(req.params.id);
    const currentUser = (req as any).user?.id || 1;

    const [loan] = await db.select().from(employeeLoans).where(eq(employeeLoans.id, loanId));
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    if (loan.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'This loan has already been posted to SAP', sapJeNumber: loan.sapJeNumber });
    }

    const result = await postDisbursementJE(
      'loan', loanId, loan.principalAmount, loan.employeeId,
      loan.loanReference, loan.disbursementDate, currentUser
    );

    if (result.success) {
      return res.json({ success: true, message: 'Loan JE posted to SAP successfully', sapDocEntry: result.sapDocEntry, sapJeNumber: result.sapJeNumber });
    } else {
      return res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to post loan JE to SAP' });
  }
});

router.post('/advances/:id/transfer-sap', async (req: Request, res: Response) => {
  try {
    const advanceId = Number(req.params.id);
    const currentUser = (req as any).user?.id || 1;

    const [advance] = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, advanceId));
    if (!advance) return res.status(404).json({ error: 'Advance not found' });

    if (advance.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'This advance has already been posted to SAP', sapJeNumber: advance.sapJeNumber });
    }

    const result = await postDisbursementJE(
      'advance', advanceId, advance.amount, advance.employeeId,
      advance.advanceReference, advance.advanceDate, currentUser
    );

    if (result.success) {
      return res.json({ success: true, message: 'Advance JE posted to SAP successfully', sapDocEntry: result.sapDocEntry, sapJeNumber: result.sapJeNumber });
    } else {
      return res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to post advance JE to SAP' });
  }
});

export default router;
