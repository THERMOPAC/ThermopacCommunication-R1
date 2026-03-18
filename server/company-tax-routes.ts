import { Router, Request, Response } from 'express';
import { db } from './db';
import {
  companyTaxYears, companyTaxEstimates, companyTaxChallans,
  companyAdvanceTax, companyTaxProvisions, companyTaxReturns,
  companyTaxNotices, glPostingLog, glAccountMappings,
  insertCompanyTaxYearSchema, insertCompanyTaxEstimateSchema,
  insertCompanyTaxChallanSchema, insertCompanyAdvanceTaxSchema,
  insertCompanyTaxProvisionSchema, insertCompanyTaxReturnSchema
} from '@shared/schema';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { postJeToSap, getGlCode } from './statutory-compliance-routes';

const router = Router();
router.use(ensureAuthenticated);

function generateChallanRef(type: string): string {
  const prefix = type === 'advance_tax' ? 'CIT-ADV' : type === 'self_assessment_tax' ? 'CIT-SA' : 'CIT';
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

router.get('/tax-years', async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(companyTaxYears).orderBy(desc(companyTaxYears.financialYear));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tax-years', async (req: Request, res: Response) => {
  try {
    const parsed = insertCompanyTaxYearSchema.parse({
      ...req.body,
      createdBy: (req as any).user?.id
    });
    const [row] = await db.insert(companyTaxYears).values(parsed).returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/tax-years/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(companyTaxYears)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companyTaxYears.id, id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/tax-years/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(companyTaxYears).where(eq(companyTaxYears.id, id));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/estimates', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });
    const rows = await db.select().from(companyTaxEstimates)
      .where(eq(companyTaxEstimates.taxYearId, taxYearId))
      .orderBy(desc(companyTaxEstimates.estimateDate));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/estimates', async (req: Request, res: Response) => {
  try {
    const parsed = insertCompanyTaxEstimateSchema.parse({
      ...req.body,
      preparedBy: (req as any).user?.id
    });
    await db.update(companyTaxEstimates)
      .set({ isLatest: false })
      .where(eq(companyTaxEstimates.taxYearId, parsed.taxYearId));
    const [row] = await db.insert(companyTaxEstimates)
      .values({ ...parsed, isLatest: true })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/advance-tax', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });
    const rows = await db.select().from(companyAdvanceTax)
      .where(eq(companyAdvanceTax.taxYearId, taxYearId))
      .orderBy(asc(companyAdvanceTax.dueDate));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/advance-tax/initialize', async (req: Request, res: Response) => {
  try {
    const { taxYearId, financialYear } = req.body;
    if (!taxYearId || !financialYear) return res.status(400).json({ error: 'taxYearId and financialYear required' });

    const parts = financialYear.split('-');
    const startYear = parseInt(parts[0]);

    const latestEstimate = await db.select().from(companyTaxEstimates)
      .where(and(eq(companyTaxEstimates.taxYearId, taxYearId), eq(companyTaxEstimates.isLatest, true)))
      .limit(1);
    const liability = latestEstimate.length > 0 ? parseFloat(latestEstimate[0].effectiveTaxPayable || '0') : 0;
    const estimateId = latestEstimate.length > 0 ? latestEstimate[0].id : null;

    const installments = [
      { installment: 'Q1', dueDate: new Date(startYear, 5, 15), cumulativePercent: '15', amountDue: (liability * 0.15).toFixed(2) },
      { installment: 'Q2', dueDate: new Date(startYear, 8, 15), cumulativePercent: '45', amountDue: (liability * 0.30).toFixed(2) },
      { installment: 'Q3', dueDate: new Date(startYear, 11, 15), cumulativePercent: '75', amountDue: (liability * 0.30).toFixed(2) },
      { installment: 'Q4', dueDate: new Date(startYear + 1, 2, 15), cumulativePercent: '100', amountDue: (liability * 0.25).toFixed(2) },
    ];

    const rows = [];
    for (const inst of installments) {
      const existing = await db.select().from(companyAdvanceTax)
        .where(and(eq(companyAdvanceTax.taxYearId, taxYearId), eq(companyAdvanceTax.installment, inst.installment)));
      if (existing.length === 0) {
        const [row] = await db.insert(companyAdvanceTax).values({
          taxYearId,
          estimateId,
          installment: inst.installment,
          dueDate: inst.dueDate,
          cumulativePercent: inst.cumulativePercent,
          estimatedLiability: liability.toFixed(2),
          amountDue: inst.amountDue,
          status: new Date() > inst.dueDate ? 'overdue' : 'upcoming',
        }).returning();
        rows.push(row);
      } else {
        rows.push(existing[0]);
      }
    }
    res.json(rows);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/advance-tax/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(companyAdvanceTax)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companyAdvanceTax.id, id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/challans', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });
    const rows = await db.select().from(companyTaxChallans)
      .where(eq(companyTaxChallans.taxYearId, taxYearId))
      .orderBy(desc(companyTaxChallans.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/challans', async (req: Request, res: Response) => {
  try {
    const challanReference = generateChallanRef(req.body.paymentType || 'other');
    const parsed = insertCompanyTaxChallanSchema.parse({
      ...req.body,
      challanReference,
      createdBy: (req as any).user?.id
    });
    const [row] = await db.insert(companyTaxChallans).values(parsed).returning();

    if (parsed.advanceTaxId) {
      await db.update(companyAdvanceTax)
        .set({
          challanId: row.id,
          amountPaid: parsed.totalAmount,
          paymentDate: parsed.paymentDate,
          status: 'paid',
          updatedAt: new Date()
        })
        .where(eq(companyAdvanceTax.id, parsed.advanceTaxId));
    }

    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/challans/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(companyTaxChallans)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companyTaxChallans.id, id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/challans/:id/payment', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { paymentDate, paymentMode, paymentReference, bankName, bsrCode, cinNumber } = req.body;
    const [row] = await db.update(companyTaxChallans)
      .set({ paymentDate, paymentMode, paymentReference, bankName, bsrCode, cinNumber, status: 'paid', updatedAt: new Date() })
      .where(eq(companyTaxChallans.id, id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/challans/:id/post-sap', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = (req as any).user;

    const [challan] = await db.select().from(companyTaxChallans).where(eq(companyTaxChallans.id, id));
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'Already posted to SAP', sapJeNumber: challan.sapJeNumber });
    }
    if (challan.status !== 'paid') {
      return res.status(400).json({ error: 'Only paid challans can be posted to SAP' });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const bankGl = getGlCode(allMappings, 'CIT_BANK', 'statutory_payment');
    const provisionGl = getGlCode(allMappings, 'CIT_TAX_PROVISION', 'statutory_payment');

    if (!bankGl || !provisionGl) {
      const missing = [];
      if (!bankGl) missing.push('CIT_BANK (statutory_payment)');
      if (!provisionGl) missing.push('CIT_TAX_PROVISION (statutory_payment)');
      return res.status(400).json({ error: 'GL mappings incomplete', missingMappings: missing });
    }

    const amount = parseFloat(challan.amount?.toString() || '0');
    if (amount <= 0) {
      return res.status(400).json({ error: 'Challan amount is zero or negative' });
    }

    const postingDate = challan.paymentDate
      ? new Date(challan.paymentDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const jePayload = {
      ReferenceDate: postingDate,
      Memo: `Company Income Tax Payment - Challan ${challan.challanReference} - ${challan.challanType}`,
      Reference2: challan.challanReference,
      Reference3: 'CIT',
      JournalEntryLines: [
        { Line_ID: 0, AccountCode: provisionGl, Debit: amount, Credit: 0, LineMemo: `CIT Tax Provision Payment - ${challan.challanType} - ${challan.challanReference}` },
        { Line_ID: 1, AccountCode: bankGl, Debit: 0, Credit: amount, LineMemo: `Bank - CIT Challan ${challan.challanReference}` },
      ],
    };

    const result = await postJeToSap(currentUser.id, jePayload);

    if (result.success) {
      await db.update(companyTaxChallans).set({
        sapDocEntry: result.docEntry,
        sapJeNumber: result.jeNumber,
        sapJeReference: result.jeNumber,
        sapPostedAt: new Date(),
        sapPostingStatus: 'posted',
        sapPostingError: null,
        status: 'posted',
        updatedAt: new Date(),
      }).where(eq(companyTaxChallans.id, id));

      return res.json({ success: true, sapDocEntry: result.docEntry, sapJeNumber: result.jeNumber });
    } else {
      await db.update(companyTaxChallans).set({
        sapPostingStatus: 'failed',
        sapPostingError: result.error,
        updatedAt: new Date(),
      }).where(eq(companyTaxChallans.id, id));
      return res.status(500).json({ error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/challans/:id/reverse-sap', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = (req as any).user;

    const [challan] = await db.select().from(companyTaxChallans).where(eq(companyTaxChallans.id, id));
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.sapPostingStatus !== 'posted') {
      return res.status(400).json({ error: 'Only posted challans can be reversed' });
    }
    if (challan.reversalSapDocEntry) {
      return res.status(400).json({ error: 'Already reversed', reversalJeNumber: challan.reversalSapJeNumber });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const bankGl = getGlCode(allMappings, 'CIT_BANK', 'statutory_payment');
    const provisionGl = getGlCode(allMappings, 'CIT_TAX_PROVISION', 'statutory_payment');

    const amount = parseFloat(challan.amount?.toString() || '0');

    const jePayload = {
      ReferenceDate: new Date().toISOString().split('T')[0],
      Memo: `REVERSAL: CIT Payment - Challan ${challan.challanReference}`,
      Reference2: challan.challanReference,
      Reference3: 'CIT-REV',
      JournalEntryLines: [
        { Line_ID: 0, AccountCode: provisionGl, Debit: 0, Credit: amount, LineMemo: `REVERSAL: CIT Tax Provision - ${challan.challanReference}` },
        { Line_ID: 1, AccountCode: bankGl, Debit: amount, Credit: 0, LineMemo: `REVERSAL: Bank - CIT Challan ${challan.challanReference}` },
      ],
    };

    const result = await postJeToSap(currentUser.id, jePayload);

    if (result.success) {
      await db.update(companyTaxChallans).set({
        reversalSapDocEntry: result.docEntry,
        reversalSapJeNumber: result.jeNumber,
        reversalSapPostedAt: new Date(),
        reversedBy: currentUser.id,
        reversedAt: new Date(),
        sapPostingStatus: 'reversed',
        updatedAt: new Date(),
      }).where(eq(companyTaxChallans.id, id));

      return res.json({ success: true, reversalDocEntry: result.docEntry, reversalJeNumber: result.jeNumber });
    } else {
      return res.status(500).json({ error: `Reversal failed: ${result.error}` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/provisions', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });
    const rows = await db.select().from(companyTaxProvisions)
      .where(eq(companyTaxProvisions.taxYearId, taxYearId))
      .orderBy(desc(companyTaxProvisions.provisionDate));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/provisions', async (req: Request, res: Response) => {
  try {
    const parsed = insertCompanyTaxProvisionSchema.parse({
      ...req.body,
      createdBy: (req as any).user?.id
    });
    const [row] = await db.insert(companyTaxProvisions).values(parsed).returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/provisions/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(companyTaxProvisions)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companyTaxProvisions.id, id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/provisions/:id/post-sap', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = (req as any).user;

    const [provision] = await db.select().from(companyTaxProvisions).where(eq(companyTaxProvisions.id, id));
    if (!provision) return res.status(404).json({ error: 'Provision not found' });

    if (provision.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'Already posted to SAP', sapJeNumber: provision.sapJeNumber });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const expenseGl = getGlCode(allMappings, 'CIT_CURRENT_TAX_EXPENSE', 'expense');
    const provisionGl = getGlCode(allMappings, 'CIT_TAX_PROVISION', 'tax_liability');

    if (!expenseGl || !provisionGl) {
      const missing = [];
      if (!expenseGl) missing.push('CIT_CURRENT_TAX_EXPENSE (expense)');
      if (!provisionGl) missing.push('CIT_TAX_PROVISION (tax_liability)');
      return res.status(400).json({ error: 'GL mappings incomplete', missingMappings: missing });
    }

    const amount = parseFloat(provision.amount?.toString() || '0');
    if (amount === 0) {
      return res.status(400).json({ error: 'Provision amount is zero' });
    }

    const postingDate = provision.provisionDate
      ? new Date(provision.provisionDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const isReversal = amount < 0;
    const absAmount = Math.abs(amount);

    const jePayload = {
      ReferenceDate: postingDate,
      Memo: `${isReversal ? 'REVERSAL: ' : ''}Income Tax Provision - ${provision.provisionPeriod} - ${provision.provisionType}`,
      Reference2: `CIT-PROV-${id}`,
      Reference3: isReversal ? 'CIT-PROV-REV' : 'CIT-PROV',
      JournalEntryLines: [
        { Line_ID: 0, AccountCode: expenseGl, Debit: isReversal ? 0 : absAmount, Credit: isReversal ? absAmount : 0, LineMemo: `${isReversal ? 'REVERSAL: ' : ''}Tax Expense Provision - ${provision.provisionPeriod}` },
        { Line_ID: 1, AccountCode: provisionGl, Debit: isReversal ? absAmount : 0, Credit: isReversal ? 0 : absAmount, LineMemo: `${isReversal ? 'REVERSAL: ' : ''}Tax Provision Liability - ${provision.provisionPeriod}` },
      ],
    };

    const result = await postJeToSap(currentUser.id, jePayload);

    if (result.success) {
      await db.update(companyTaxProvisions).set({
        sapDocEntry: result.docEntry,
        sapJeNumber: result.jeNumber,
        sapJeReference: result.jeNumber,
        sapPostedAt: new Date(),
        sapPostingStatus: 'posted',
        sapPostingError: null,
        postingStatus: 'posted',
        updatedAt: new Date(),
      }).where(eq(companyTaxProvisions.id, id));

      return res.json({ success: true, sapDocEntry: result.docEntry, sapJeNumber: result.jeNumber });
    } else {
      await db.update(companyTaxProvisions).set({
        sapPostingStatus: 'failed',
        sapPostingError: result.error,
        updatedAt: new Date(),
      }).where(eq(companyTaxProvisions.id, id));
      return res.status(500).json({ error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/provisions/:id/reverse', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const original = await db.select().from(companyTaxProvisions).where(eq(companyTaxProvisions.id, id));
    if (!original.length) return res.status(404).json({ error: 'Not found' });

    const [reversal] = await db.insert(companyTaxProvisions).values({
      taxYearId: original[0].taxYearId,
      provisionDate: new Date(),
      provisionPeriod: original[0].provisionPeriod,
      provisionType: original[0].provisionType,
      amount: (-parseFloat(original[0].amount)).toFixed(2),
      reversedProvisionId: id,
      adjustmentReference: `Reversal of provision #${id}`,
      postingStatus: 'draft',
      createdBy: (req as any).user?.id,
    }).returning();

    await db.update(companyTaxProvisions)
      .set({ postingStatus: 'reversed', updatedAt: new Date() })
      .where(eq(companyTaxProvisions.id, id));

    res.json(reversal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/returns', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });
    const rows = await db.select().from(companyTaxReturns)
      .where(eq(companyTaxReturns.taxYearId, taxYearId))
      .orderBy(desc(companyTaxReturns.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/returns', async (req: Request, res: Response) => {
  try {
    const parsed = insertCompanyTaxReturnSchema.parse({
      ...req.body,
      filedBy: (req as any).user?.id
    });
    const [row] = await db.insert(companyTaxReturns).values(parsed).returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/returns/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(companyTaxReturns)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companyTaxReturns.id, id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/notices', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });
    const rows = await db.select().from(companyTaxNotices)
      .where(eq(companyTaxNotices.taxYearId, taxYearId))
      .orderBy(desc(companyTaxNotices.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notices', async (req: Request, res: Response) => {
  try {
    const [row] = await db.insert(companyTaxNotices).values({
      ...req.body,
      createdBy: (req as any).user?.id
    }).returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/notices/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(companyTaxNotices)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companyTaxNotices.id, id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });

    const [taxYear] = await db.select().from(companyTaxYears).where(eq(companyTaxYears.id, taxYearId));
    if (!taxYear) return res.status(404).json({ error: 'Tax year not found' });

    const latestEstimate = await db.select().from(companyTaxEstimates)
      .where(and(eq(companyTaxEstimates.taxYearId, taxYearId), eq(companyTaxEstimates.isLatest, true)))
      .limit(1);

    const advanceRows = await db.select().from(companyAdvanceTax)
      .where(eq(companyAdvanceTax.taxYearId, taxYearId))
      .orderBy(asc(companyAdvanceTax.dueDate));

    const challans = await db.select().from(companyTaxChallans)
      .where(eq(companyTaxChallans.taxYearId, taxYearId));

    const provisions = await db.select().from(companyTaxProvisions)
      .where(eq(companyTaxProvisions.taxYearId, taxYearId));

    const returns = await db.select().from(companyTaxReturns)
      .where(eq(companyTaxReturns.taxYearId, taxYearId));

    const estimatedLiability = latestEstimate.length > 0 ? parseFloat(latestEstimate[0].effectiveTaxPayable || '0') : 0;
    const advanceTaxPaid = challans.filter(c => c.paymentType === 'advance_tax' && c.status !== 'draft')
      .reduce((sum, c) => sum + parseFloat(c.totalAmount || '0'), 0);
    const selfAssessmentPaid = challans.filter(c => c.paymentType === 'self_assessment_tax' && c.status !== 'draft')
      .reduce((sum, c) => sum + parseFloat(c.totalAmount || '0'), 0);
    const tdsCredits = latestEstimate.length > 0 ? parseFloat(latestEstimate[0].tdsReceivable || '0') : 0;
    const totalTaxPaid = advanceTaxPaid + selfAssessmentPaid + tdsCredits;
    const totalProvisions = provisions.filter(p => p.postingStatus !== 'reversed')
      .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const sapPostings = challans.filter(c => c.sapJeReference).reduce((sum, c) => sum + parseFloat(c.totalAmount || '0'), 0)
      + provisions.filter(p => p.sapJeReference && p.postingStatus === 'posted').reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

    res.json({
      taxYear,
      latestEstimate: latestEstimate[0] || null,
      advanceInstallments: advanceRows,
      summary: {
        estimatedLiability,
        advanceTaxPaid,
        selfAssessmentPaid,
        tdsCredits,
        totalTaxPaid,
        netPayable: estimatedLiability - totalTaxPaid,
        totalProvisions,
        sapPostings,
      },
      returnStatus: returns.length > 0 ? returns[0] : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reconciliation', async (req: Request, res: Response) => {
  try {
    const taxYearId = req.query.taxYearId ? parseInt(req.query.taxYearId as string) : null;
    if (!taxYearId) return res.status(400).json({ error: 'taxYearId required' });

    const latestEstimate = await db.select().from(companyTaxEstimates)
      .where(and(eq(companyTaxEstimates.taxYearId, taxYearId), eq(companyTaxEstimates.isLatest, true)))
      .limit(1);

    const challans = await db.select().from(companyTaxChallans)
      .where(eq(companyTaxChallans.taxYearId, taxYearId));

    const provisions = await db.select().from(companyTaxProvisions)
      .where(eq(companyTaxProvisions.taxYearId, taxYearId));

    const returns = await db.select().from(companyTaxReturns)
      .where(eq(companyTaxReturns.taxYearId, taxYearId));

    const estimatedLiability = latestEstimate.length > 0 ? parseFloat(latestEstimate[0].effectiveTaxPayable || '0') : 0;
    const taxPerReturn = returns.length > 0 ? parseFloat(returns[0].totalTaxPayable || '0') : 0;
    const advanceTaxPaid = challans.filter(c => c.paymentType === 'advance_tax' && c.status !== 'draft')
      .reduce((sum, c) => sum + parseFloat(c.totalAmount || '0'), 0);
    const selfAssessmentPaid = challans.filter(c => c.paymentType === 'self_assessment_tax' && c.status !== 'draft')
      .reduce((sum, c) => sum + parseFloat(c.totalAmount || '0'), 0);
    const tdsCredits = latestEstimate.length > 0 ? parseFloat(latestEstimate[0].tdsReceivable || '0') : 0;
    const totalTaxPaid = advanceTaxPaid + selfAssessmentPaid + tdsCredits;
    const totalProvisions = provisions.filter(p => p.postingStatus !== 'reversed')
      .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const sapChallans = challans.filter(c => c.sapJeReference).reduce((sum, c) => sum + parseFloat(c.totalAmount || '0'), 0);
    const sapProvisions = provisions.filter(p => p.sapJeReference && p.postingStatus === 'posted')
      .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const totalSapPostings = sapChallans + sapProvisions;

    const referenceLiability = taxPerReturn > 0 ? taxPerReturn : estimatedLiability;

    res.json({
      estimatedLiability,
      taxPerReturn,
      estimateVariance: taxPerReturn > 0 ? taxPerReturn - estimatedLiability : null,
      advanceTaxPaid,
      selfAssessmentPaid,
      tdsCredits,
      totalTaxPaid,
      paymentMismatch: totalTaxPaid - referenceLiability,
      totalProvisions,
      timingDifference: totalProvisions - referenceLiability,
      totalSapPostings,
      postingMismatch: totalSapPostings - (sapChallans + sapProvisions > 0 ? sapChallans + sapProvisions : 0),
      challansPostedToSap: sapChallans,
      provisionsPostedToSap: sapProvisions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;