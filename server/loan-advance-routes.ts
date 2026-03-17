import { Router, Request, Response } from 'express';
import { db } from './db';
import { employeeLoans, employeeLoanRepayments, employeeAdvances, employeeAdvanceRecoveries, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

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
      const emp = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, loan.employeeId));
      const approver = loan.approvedBy ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, loan.approvedBy)) : [];
      return {
        ...loan,
        employeeName: emp[0]?.fullName || 'Unknown',
        approvedByName: approver[0]?.fullName || null,
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

    const emp = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, loan[0].employeeId));

    res.json({ ...loan[0], employeeName: emp[0]?.fullName || 'Unknown', repayments });
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
      const emp = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, adv.employeeId));
      const approver = adv.approvedBy ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, adv.approvedBy)) : [];
      return {
        ...adv,
        employeeName: emp[0]?.fullName || 'Unknown',
        approvedByName: approver[0]?.fullName || null,
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

    const emp = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, advance[0].employeeId));

    res.json({ ...advance[0], employeeName: emp[0]?.fullName || 'Unknown', recoveries });
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

export default router;
