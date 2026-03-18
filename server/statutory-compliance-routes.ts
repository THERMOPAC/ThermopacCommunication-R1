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
import { sapHttpsClient } from './sap-b1-integration/sap-https-client';
import { sapSessionManager } from './sap-session-manager';

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
  const user = (req as any).user;
  if (!user || (user.role !== 'Superuser' && user.role !== 'Manager')) {
    return res.status(403).json({ error: 'Only Superuser or Manager can edit GL mappings' });
  }
  const id = parseInt(req.params.id);
  const { glAccountCode, glAccountName, debitCredit, isActive } = req.body;
  const [mapping] = await db.update(glAccountMappings)
    .set({ glAccountCode, glAccountName, debitCredit, isActive, updatedBy: user.id, updatedAt: new Date() })
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
  const seedRows = moduleType === 'PAYROLL' ? PAYROLL_SEED_ROWS
    : moduleType === 'LOAN_ADVANCE' ? LOAN_ADVANCE_SEED_ROWS
    : null;
  if (seedRows) {
    const allMappings = await db.select().from(glAccountMappings)
      .where(eq(glAccountMappings.isActive, true));
    const mappedKeys = new Set(
      allMappings
        .filter(m => m.glAccountCode && m.glAccountCode.trim() !== '')
        .map(m => `${m.componentCode}|${m.postingContext}`)
    );
    const missingComponents = seedRows
      .filter(r => !mappedKeys.has(`${r.componentCode}|${r.postingContext}`))
      .map(r => ({ componentCode: r.componentCode, postingContext: r.postingContext, componentName: r.componentName }));
    return res.json({ valid: missingComponents.length === 0, missing: missingComponents.map(m => m.componentCode), missingComponents, total: seedRows.length, mapped: seedRows.length - missingComponents.length });
  }

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
  const mapped = mappings.filter(m => m.glAccountCode && m.glAccountCode.trim() !== '').map(m => m.componentCode);
  const missing = required.filter(r => !mapped.includes(r));
  res.json({ valid: missing.length === 0, missing, mapped });
});

router.post('/gl-mappings/validate-je', async (req: Request, res: Response) => {
  try {
    const { components } = req.body;
    if (!components || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ error: 'components array is required — pass only the component codes used in this JE' });
    }
    const needed: { code: string; context: string }[] = components;
    const allMappings = await db.select().from(glAccountMappings)
      .where(eq(glAccountMappings.isActive, true));

    const missing: { componentCode: string; postingContext: string; componentName: string }[] = [];
    for (const c of needed) {
      const match = allMappings.find(
        m => m.componentCode === c.code && m.postingContext === c.context && m.glAccountCode && m.glAccountCode.trim() !== ''
      );
      if (!match) {
        const nameRow = allMappings.find(m => m.componentCode === c.code);
        missing.push({ componentCode: c.code, postingContext: c.context, componentName: nameRow?.componentName || c.code });
      }
    }
    res.json({ valid: missing.length === 0, missing, totalChecked: needed.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PAYROLL_SEED_ROWS = [
  { componentCode: 'BASIC', componentName: 'Basic Salary', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'HRA', componentName: 'House Rent Allowance', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'CONVEYANCE', componentName: 'Conveyance Allowance', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'LTA', componentName: 'Leave Travel Allowance', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'SPECIAL_ALLOWANCE', componentName: 'Special Allowance', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'SUPPLEMENTARY', componentName: 'Supplementary Allowance', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'KGP', componentName: 'KPI Growth Pay', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'BONUS', componentName: 'Bonus', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'OVERTIME', componentName: 'Overtime Pay', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'OTHER_ALLOWANCES', componentName: 'Other Allowances', category: 'earning', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'PF_EMPLOYEE', componentName: 'Employee PF Contribution', category: 'deduction', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'ESIC_EMPLOYEE', componentName: 'Employee ESIC', category: 'deduction', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'LOAN_DEDUCTION', componentName: 'Loan EMI Recovery', category: 'deduction', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'ADVANCE_DEDUCTION', componentName: 'Advance Recovery', category: 'deduction', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'OTHER_DEDUCTIONS', componentName: 'Other Deductions', category: 'deduction', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'PT', componentName: 'Professional Tax', category: 'statutory', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'TDS', componentName: 'Tax Deducted at Source', category: 'statutory', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'PF_EMPLOYER', componentName: 'Employer PF Contribution', category: 'employer_contribution', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'PF_EMPLOYER', componentName: 'Employer PF Contribution', category: 'employer_contribution', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'ESIC_EMPLOYER', componentName: 'Employer ESIC', category: 'employer_contribution', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'ESIC_EMPLOYER', componentName: 'Employer ESIC', category: 'employer_contribution', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'GRATUITY', componentName: 'Gratuity Provision', category: 'employer_contribution', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'GRATUITY', componentName: 'Gratuity Provision', category: 'employer_contribution', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'GROUP_INSURANCE', componentName: 'Group Insurance', category: 'employer_contribution', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'GROUP_INSURANCE', componentName: 'Group Insurance', category: 'employer_contribution', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'NET_PAY', componentName: 'Net Salary Payable', category: 'net_pay', postingContext: 'payroll_liability', debitCredit: 'credit' },
];

const TDS_SEED_ROWS = [
  { componentCode: 'TDS', componentName: 'Tax Deducted at Source', category: 'statutory', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'TDS_INTEREST', componentName: 'TDS Interest (Late Deposit)', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'TDS_INTEREST', componentName: 'TDS Interest (Late Deposit)', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'TDS_PENALTY', componentName: 'TDS Penalty', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'TDS_PENALTY', componentName: 'TDS Penalty', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'TDS_LATE_FEE', componentName: 'TDS Late Filing Fee (234E)', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'TDS_LATE_FEE', componentName: 'TDS Late Filing Fee (234E)', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
];

const PF_SEED_ROWS = [
  { componentCode: 'PF_EMPLOYEE', componentName: 'Employee PF Contribution', category: 'deduction', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'PF_EMPLOYER', componentName: 'Employer PF Contribution', category: 'employer_contribution', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'PF_ADMIN_CHARGES', componentName: 'PF Admin Charges (0.5%)', category: 'employer_contribution', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'PF_ADMIN_CHARGES', componentName: 'PF Admin Charges (0.5%)', category: 'employer_contribution', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'PF_ADMIN_CHARGES', componentName: 'PF Admin Charges (0.5%)', category: 'employer_contribution', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'EDLI_CONTRIBUTION', componentName: 'EDLI Contribution (0.5%)', category: 'employer_contribution', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'EDLI_CONTRIBUTION', componentName: 'EDLI Contribution (0.5%)', category: 'employer_contribution', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'EDLI_CONTRIBUTION', componentName: 'EDLI Contribution (0.5%)', category: 'employer_contribution', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'EDLI_ADMIN_CHARGES', componentName: 'EDLI Admin Charges', category: 'employer_contribution', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'EDLI_ADMIN_CHARGES', componentName: 'EDLI Admin Charges', category: 'employer_contribution', postingContext: 'payroll_liability', debitCredit: 'credit' },
  { componentCode: 'EDLI_ADMIN_CHARGES', componentName: 'EDLI Admin Charges', category: 'employer_contribution', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'PF_INTEREST', componentName: 'PF Interest (Late Deposit)', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'PF_INTEREST', componentName: 'PF Interest (Late Deposit)', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'PF_PENALTY', componentName: 'PF Penalty / Damages', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'PF_PENALTY', componentName: 'PF Penalty / Damages', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
];

const ESIC_SEED_ROWS = [
  { componentCode: 'ESIC_EMPLOYEE', componentName: 'Employee ESIC', category: 'deduction', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'ESIC_EMPLOYER', componentName: 'Employer ESIC', category: 'employer_contribution', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'ESIC_INTEREST', componentName: 'ESIC Interest (Late Deposit)', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'ESIC_INTEREST', componentName: 'ESIC Interest (Late Deposit)', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'ESIC_PENALTY', componentName: 'ESIC Penalty', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'ESIC_PENALTY', componentName: 'ESIC Penalty', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
];

const PT_SEED_ROWS = [
  { componentCode: 'PT', componentName: 'Professional Tax', category: 'statutory', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'PT_INTEREST', componentName: 'PT Interest (Late Payment)', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'PT_INTEREST', componentName: 'PT Interest (Late Payment)', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'PT_PENALTY', componentName: 'PT Penalty', category: 'statutory_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'PT_PENALTY', componentName: 'PT Penalty', category: 'statutory_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
];

const CIT_SEED_ROWS = [
  { componentCode: 'CIT_CURRENT_TAX_EXPENSE', componentName: 'Current Tax Expense', category: 'company_tax', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'CIT_DEFERRED_TAX', componentName: 'Deferred Tax Expense/Benefit', category: 'company_tax', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'CIT_DEFERRED_TAX', componentName: 'Deferred Tax Expense/Benefit', category: 'company_tax', postingContext: 'tax_liability', debitCredit: 'credit' },
  { componentCode: 'CIT_TAX_PROVISION', componentName: 'Income Tax Provision', category: 'company_tax', postingContext: 'tax_liability', debitCredit: 'credit' },
  { componentCode: 'CIT_TAX_PROVISION', componentName: 'Income Tax Provision', category: 'company_tax', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'CIT_PROVISION_OFFSET', componentName: 'Provision Offset (Year-End Adjustment)', category: 'company_tax', postingContext: 'tax_liability', debitCredit: 'debit' },
  { componentCode: 'CIT_ADVANCE_TAX', componentName: 'Advance Tax Paid', category: 'company_tax', postingContext: 'statutory_payment', debitCredit: 'debit' },
  { componentCode: 'CIT_ADVANCE_TAX', componentName: 'Advance Tax Paid', category: 'company_tax', postingContext: 'tax_liability', debitCredit: 'credit' },
  { componentCode: 'CIT_TDS_RECEIVABLE', componentName: 'TDS Receivable (Tax Credits)', category: 'company_tax', postingContext: 'recovery', debitCredit: 'debit' },
  { componentCode: 'CIT_TDS_RECEIVABLE', componentName: 'TDS Receivable (Tax Credits)', category: 'company_tax', postingContext: 'tax_liability', debitCredit: 'credit' },
  { componentCode: 'CIT_TAX_REFUND', componentName: 'Tax Refund Receivable', category: 'company_tax', postingContext: 'recovery', debitCredit: 'debit' },
  { componentCode: 'CIT_TAX_REFUND', componentName: 'Tax Refund Receivable', category: 'company_tax', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'CIT_INTEREST_234B', componentName: 'Interest u/s 234B (Advance Tax Default)', category: 'company_tax_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'CIT_INTEREST_234B', componentName: 'Interest u/s 234B (Advance Tax Default)', category: 'company_tax_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'CIT_INTEREST_234C', componentName: 'Interest u/s 234C (Deferment)', category: 'company_tax_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'CIT_INTEREST_234C', componentName: 'Interest u/s 234C (Deferment)', category: 'company_tax_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'CIT_INTEREST_234A', componentName: 'Interest u/s 234A (Late Filing)', category: 'company_tax_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'CIT_INTEREST_234A', componentName: 'Interest u/s 234A (Late Filing)', category: 'company_tax_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
  { componentCode: 'CIT_TAX_PENALTY', componentName: 'Income Tax Penalty', category: 'company_tax_penalty', postingContext: 'expense', debitCredit: 'debit' },
  { componentCode: 'CIT_TAX_PENALTY', componentName: 'Income Tax Penalty', category: 'company_tax_penalty', postingContext: 'statutory_payment', debitCredit: 'credit' },
];

const LOAN_ADVANCE_SEED_ROWS = [
  { componentCode: 'LOAN_RECEIVABLE', componentName: 'Loans to Employees (Asset)', category: 'loan_advance', postingContext: 'loan_disbursement', debitCredit: 'debit' },
  { componentCode: 'ADVANCE_RECEIVABLE', componentName: 'Advances to Employees (Asset)', category: 'loan_advance', postingContext: 'advance_disbursement', debitCredit: 'debit' },
  { componentCode: 'LOAN_ADVANCE_BANK', componentName: 'Bank / Cash (Disbursement)', category: 'loan_advance', postingContext: 'loan_disbursement', debitCredit: 'credit' },
  { componentCode: 'LOAN_ADVANCE_BANK', componentName: 'Bank / Cash (Disbursement)', category: 'loan_advance', postingContext: 'advance_disbursement', debitCredit: 'credit' },
];

const ALL_SEED_MODULES: Record<string, { rows: typeof PAYROLL_SEED_ROWS; label: string }> = {
  payroll: { rows: PAYROLL_SEED_ROWS, label: 'Payroll' },
  loan_advance: { rows: LOAN_ADVANCE_SEED_ROWS, label: 'Loan & Advance Disbursement' },
  tds: { rows: TDS_SEED_ROWS, label: 'TDS Compliance' },
  pf: { rows: PF_SEED_ROWS, label: 'PF Compliance' },
  esic: { rows: ESIC_SEED_ROWS, label: 'ESIC Compliance' },
  pt: { rows: PT_SEED_ROWS, label: 'PT Compliance' },
  cit: { rows: CIT_SEED_ROWS, label: 'Company Income Tax' },
};

router.post('/gl-mappings/seed-payroll', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== 'Superuser' && user.role !== 'Manager')) {
      return res.status(403).json({ error: 'Only Superuser or Manager can seed GL mappings' });
    }

    const existing = await db.select({
      code: glAccountMappings.componentCode,
      ctx: glAccountMappings.postingContext,
    }).from(glAccountMappings);

    const existingKeys = new Set(existing.map(e => `${e.code}|${e.ctx}`));
    const toInsert = PAYROLL_SEED_ROWS.filter(r => !existingKeys.has(`${r.componentCode}|${r.postingContext}`));

    if (toInsert.length === 0) {
      return res.json({ message: 'All payroll GL mappings already exist', created: 0, total: PAYROLL_SEED_ROWS.length });
    }

    const inserted = await db.insert(glAccountMappings).values(
      toInsert.map(r => ({
        ...r,
        glAccountCode: '',
        glAccountName: '',
        isActive: true,
        companyId: 1,
        createdBy: user.id,
        updatedBy: user.id,
      }))
    ).returning();

    res.json({ message: `Seeded ${inserted.length} payroll GL mappings`, created: inserted.length, total: PAYROLL_SEED_ROWS.length, rows: inserted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/gl-mappings/seed/:module', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== 'Superuser' && user.role !== 'Manager')) {
      return res.status(403).json({ error: 'Only Superuser or Manager can seed GL mappings' });
    }

    const moduleName = req.params.module.toLowerCase();
    const moduleDef = ALL_SEED_MODULES[moduleName];
    if (!moduleDef) {
      return res.status(400).json({ error: `Unknown module: ${moduleName}. Valid: ${Object.keys(ALL_SEED_MODULES).join(', ')}` });
    }

    const existing = await db.select({
      code: glAccountMappings.componentCode,
      ctx: glAccountMappings.postingContext,
    }).from(glAccountMappings);

    const existingKeys = new Set(existing.map(e => `${e.code}|${e.ctx}`));
    const toInsert = moduleDef.rows.filter(r => !existingKeys.has(`${r.componentCode}|${r.postingContext}`));

    if (toInsert.length === 0) {
      return res.json({ message: `All ${moduleDef.label} GL mappings already exist`, created: 0, total: moduleDef.rows.length });
    }

    const inserted = await db.insert(glAccountMappings).values(
      toInsert.map(r => ({
        ...r,
        glAccountCode: '',
        glAccountName: '',
        isActive: true,
        companyId: 1,
        createdBy: user.id,
        updatedBy: user.id,
      }))
    ).returning();

    res.json({ message: `Seeded ${inserted.length} ${moduleDef.label} GL mappings`, created: inserted.length, total: moduleDef.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/gl-mappings/seed-all', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== 'Superuser' && user.role !== 'Manager')) {
      return res.status(403).json({ error: 'Only Superuser or Manager can seed GL mappings' });
    }

    const allRows = Object.values(ALL_SEED_MODULES).flatMap(m => m.rows);
    const existing = await db.select({
      code: glAccountMappings.componentCode,
      ctx: glAccountMappings.postingContext,
    }).from(glAccountMappings);

    const existingKeys = new Set(existing.map(e => `${e.code}|${e.ctx}`));
    const toInsert = allRows.filter(r => !existingKeys.has(`${r.componentCode}|${r.postingContext}`));

    if (toInsert.length === 0) {
      return res.json({ message: 'All GL mappings already exist', created: 0, total: allRows.length });
    }

    const inserted = await db.insert(glAccountMappings).values(
      toInsert.map(r => ({
        ...r,
        glAccountCode: '',
        glAccountName: '',
        isActive: true,
        companyId: 1,
        createdBy: user.id,
        updatedBy: user.id,
      }))
    ).returning();

    const summary = Object.entries(ALL_SEED_MODULES).map(([key, def]) => {
      const moduleInserted = inserted.filter(i => def.rows.some(r => r.componentCode === i.componentCode && r.postingContext === i.postingContext));
      return `${def.label}: ${moduleInserted.length}/${def.rows.length}`;
    });

    res.json({ message: `Seeded ${inserted.length} GL mappings`, created: inserted.length, total: allRows.length, breakdown: summary });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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

async function postJeToSap(userId: number, jePayload: any): Promise<{ success: boolean; docEntry?: number; jeNumber?: string; error?: string }> {
  const session = sapSessionManager.getSession(userId);
  const sapUrl = process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000';
  const sapUser = process.env.SAP_USERNAME || '';
  const sapPass = process.env.SAP_PASSWORD || '';
  const sapDb = process.env.SAP_COMPANY_DB || '';

  if (!sapUser || !sapPass || !sapDb) {
    return { success: false, error: 'SAP credentials not configured. Please set SAP_USERNAME, SAP_PASSWORD, and SAP_COMPANY_DB.' };
  }

  try {
    let sessionId: string;
    if (session) {
      sessionId = session.sessionId;
    } else {
      const loginResult = await sapHttpsClient.login(sapUser, sapPass, sapDb);
      sapSessionManager.setSession(userId, { sessionId: loginResult.sessionId, routeId: undefined, userId, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60000) });
      sessionId = loginResult.sessionId;
    }

    const sapResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'POST',
      path: '/b1s/v1/JournalEntries',
      body: jePayload,
    });

    if (sapResponse.ok) {
      const responseData = JSON.parse(sapResponse.body);
      return {
        success: true,
        docEntry: responseData.DocEntry,
        jeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
      };
    } else {
      let errorMsg = `SAP posting failed (${sapResponse.statusCode})`;
      try {
        const errParsed = JSON.parse(sapResponse.body);
        errorMsg = errParsed?.error?.message?.value || errorMsg;
      } catch (_) {}
      return { success: false, error: errorMsg };
    }
  } catch (err: any) {
    return { success: false, error: `SAP connection error: ${err.message}` };
  }
}

function getGlCode(mappings: any[], code: string, context: string): string | null {
  const m = mappings.find(r => r.componentCode === code && r.postingContext === context && r.glAccountCode && r.glAccountCode.trim() !== '' && r.isActive);
  return m ? m.glAccountCode : null;
}

router.get('/sap-bank-accounts', async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const sapUser = process.env.SAP_USERNAME || '';
    const sapPass = process.env.SAP_PASSWORD || '';
    const sapDb = process.env.SAP_COMPANY_DB || '';

    if (!sapUser || !sapPass || !sapDb) {
      return res.status(500).json({ error: 'SAP credentials not configured' });
    }

    const session = sapSessionManager.getSession(currentUser.id);
    let sessionId: string;
    if (session) {
      sessionId = session.sessionId;
    } else {
      const loginResult = await sapHttpsClient.login(sapUser, sapPass, sapDb);
      sapSessionManager.setSession(currentUser.id, { sessionId: loginResult.sessionId, routeId: undefined, userId: currentUser.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60000) });
      sessionId = loginResult.sessionId;
    }

    const sapResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'GET',
      path: "/b1s/v1/ChartOfAccounts?$filter=ActiveAccount eq 'tYES' and (AccountType eq 'at_Other')&$select=Code,Name,AccountType&$top=500",
    });

    if (sapResponse.ok) {
      const data = JSON.parse(sapResponse.body);
      const allAccounts = data.value || [];
      return res.json({ accounts: allAccounts.map((a: any) => ({ code: a.Code, name: `${a.Code} - ${a.Name}` })) });
    } else {
      return res.status(500).json({ error: 'Failed to fetch accounts from SAP' });
    }
  } catch (err: any) {
    console.error('Error fetching SAP bank accounts:', err);
    return res.status(500).json({ error: err.message });
  }
});

const MODULE_CONFIG: Record<string, {
  liabilityComponents: { code: string; amountKey: string }[];
  interestCode?: string;
  penaltyCode?: string;
  lateFeeCode?: string;
}> = {
  TDS: {
    liabilityComponents: [{ code: 'TDS', amountKey: 'totalEmployeeContribution' }],
    interestCode: 'TDS_INTEREST',
    penaltyCode: 'TDS_PENALTY',
    lateFeeCode: 'TDS_LATE_FEE',
  },
  PF: {
    liabilityComponents: [
      { code: 'PF_EMPLOYEE', amountKey: 'totalEmployeeContribution' },
      { code: 'PF_EMPLOYER', amountKey: 'totalEmployerContribution' },
      { code: 'PF_ADMIN_CHARGES', amountKey: 'adminCharges' },
    ],
    interestCode: 'PF_INTEREST',
    penaltyCode: 'PF_PENALTY',
  },
  ESIC: {
    liabilityComponents: [
      { code: 'ESIC_EMPLOYEE', amountKey: 'totalEmployeeContribution' },
      { code: 'ESIC_EMPLOYER', amountKey: 'totalEmployerContribution' },
    ],
    interestCode: 'ESIC_INTEREST',
    penaltyCode: 'ESIC_PENALTY',
  },
  PT: {
    liabilityComponents: [{ code: 'PT', amountKey: 'totalEmployeeContribution' }],
    interestCode: 'PT_INTEREST',
    penaltyCode: 'PT_PENALTY',
  },
};

router.post('/challans/:id/post-sap', async (req: Request, res: Response) => {
  try {
    const challanId = parseInt(req.params.id);
    const currentUser = (req as any).user;
    const { bankAccountCode } = req.body;

    if (!bankAccountCode || typeof bankAccountCode !== 'string' || bankAccountCode.trim() === '') {
      return res.status(400).json({ error: 'bankAccountCode is required. Please select a bank/cash account for this payment.' });
    }

    const [challan] = await db.select().from(statutoryChallans).where(eq(statutoryChallans.id, challanId));
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.sapPostingStatus === 'posted') {
      return res.status(400).json({
        error: 'This challan has already been posted to SAP.',
        sapJeNumber: challan.sapJeNumber,
        sapDocEntry: challan.sapDocEntry,
      });
    }

    if (challan.sapPostingStatus === 'reversed') {
      return res.status(400).json({ error: 'This challan has been reversed and cannot be reposted.' });
    }

    if (challan.status !== 'paid') {
      return res.status(400).json({ error: `Only paid challans can be posted to SAP. Current status: ${challan.status}. Please record payment first.` });
    }

    const moduleType = challan.moduleType.toUpperCase();
    const config = MODULE_CONFIG[moduleType];
    if (!config) {
      return res.status(400).json({ error: `Unsupported module type: ${moduleType}` });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));

    const missingMappings: string[] = [];
    for (const comp of config.liabilityComponents) {
      if (!getGlCode(allMappings, comp.code, 'statutory_payment')) {
        missingMappings.push(`${comp.code} (statutory_payment)`);
      }
    }

    if (config.interestCode && parseFloat(challan.interest?.toString() || '0') > 0) {
      if (!getGlCode(allMappings, config.interestCode, 'expense')) {
        missingMappings.push(`${config.interestCode} (expense)`);
      }
    }
    if (config.penaltyCode && parseFloat(challan.penalty?.toString() || '0') > 0) {
      if (!getGlCode(allMappings, config.penaltyCode, 'expense')) {
        missingMappings.push(`${config.penaltyCode} (expense)`);
      }
    }

    if (missingMappings.length > 0) {
      await db.update(statutoryChallans).set({
        sapPostingStatus: 'failed',
        sapPostingError: `GL mappings missing: ${missingMappings.join(', ')}`,
        updatedAt: new Date(),
      }).where(eq(statutoryChallans.id, challanId));
      return res.status(400).json({ error: 'GL mappings incomplete', missingMappings });
    }

    const jeLines: any[] = [];
    let lineNum = 0;
    let totalBankCredit = 0;
    const periodLabel = `${challan.month}/${challan.year}`;

    for (const comp of config.liabilityComponents) {
      const amount = parseFloat((challan as any)[comp.amountKey]?.toString() || '0');
      if (amount > 0) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: getGlCode(allMappings, comp.code, 'statutory_payment'),
          Debit: amount,
          Credit: 0,
          LineMemo: `${comp.code} Payment - ${moduleType} - ${periodLabel}`,
        });
        totalBankCredit += amount;
      }
    }

    const interestAmt = parseFloat(challan.interest?.toString() || '0');
    if (interestAmt > 0 && config.interestCode) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: getGlCode(allMappings, config.interestCode, 'expense'),
        Debit: interestAmt,
        Credit: 0,
        LineMemo: `${config.interestCode} - ${moduleType} - ${periodLabel}`,
      });
      totalBankCredit += interestAmt;
    }

    const penaltyAmt = parseFloat(challan.penalty?.toString() || '0');
    if (penaltyAmt > 0 && config.penaltyCode) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: getGlCode(allMappings, config.penaltyCode, 'expense'),
        Debit: penaltyAmt,
        Credit: 0,
        LineMemo: `${config.penaltyCode} - ${moduleType} - ${periodLabel}`,
      });
      totalBankCredit += penaltyAmt;
    }

    if (totalBankCredit > 0) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: bankAccountCode.trim(),
        Debit: 0,
        Credit: totalBankCredit,
        LineMemo: `Bank Payment - ${moduleType} Challan ${challan.challanReference} - ${periodLabel}`,
      });
    }

    if (jeLines.length === 0) {
      return res.status(400).json({ error: 'No amounts to post. All challan amounts are zero.' });
    }

    const postingDate = challan.paymentDate
      ? new Date(challan.paymentDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const jePayload = {
      ReferenceDate: postingDate,
      Memo: `${moduleType} Payment - Challan ${challan.challanReference} - ${periodLabel}`,
      Reference2: challan.challanReference,
      Reference3: moduleType,
      JournalEntryLines: jeLines,
    };

    await db.update(statutoryChallans).set({
      sapPostingStatus: 'pending',
      sapPostingError: null,
      updatedAt: new Date(),
    }).where(eq(statutoryChallans.id, challanId));

    const result = await postJeToSap(currentUser.id, jePayload);

    if (result.success) {
      await db.update(statutoryChallans).set({
        sapDocEntry: result.docEntry,
        sapJeNumber: result.jeNumber,
        sapJeReference: result.jeNumber,
        sapPostedAt: new Date(),
        sapPostingStatus: 'posted',
        sapPostingError: null,
        updatedAt: new Date(),
      }).where(eq(statutoryChallans.id, challanId));

      return res.json({
        success: true,
        message: `${moduleType} challan posted to SAP successfully`,
        sapDocEntry: result.docEntry,
        sapJeNumber: result.jeNumber,
      });
    } else {
      await db.update(statutoryChallans).set({
        sapPostingStatus: 'failed',
        sapPostingError: result.error,
        updatedAt: new Date(),
      }).where(eq(statutoryChallans.id, challanId));

      return res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Error posting statutory challan to SAP:', error);
    res.status(500).json({ error: error.message || 'Failed to post challan to SAP' });
  }
});

router.post('/challans/:id/reverse-sap', async (req: Request, res: Response) => {
  try {
    const challanId = parseInt(req.params.id);
    const currentUser = (req as any).user;
    const { bankAccountCode } = req.body;

    if (!bankAccountCode || typeof bankAccountCode !== 'string' || bankAccountCode.trim() === '') {
      return res.status(400).json({ error: 'bankAccountCode is required. Please select the bank/cash account used for the original payment.' });
    }

    const [challan] = await db.select().from(statutoryChallans).where(eq(statutoryChallans.id, challanId));
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.sapPostingStatus !== 'posted') {
      return res.status(400).json({ error: 'Only posted challans can be reversed.' });
    }

    if (challan.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This challan has already been reversed.', reversalJeNumber: challan.reversalSapJeNumber });
    }

    const moduleType = challan.moduleType.toUpperCase();
    const config = MODULE_CONFIG[moduleType];
    if (!config) return res.status(400).json({ error: `Unsupported module type: ${moduleType}` });

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));

    const jeLines: any[] = [];
    let lineNum = 0;
    let totalBankDebit = 0;
    const periodLabel = `${challan.month}/${challan.year}`;

    for (const comp of config.liabilityComponents) {
      const amount = parseFloat((challan as any)[comp.amountKey]?.toString() || '0');
      if (amount > 0) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: getGlCode(allMappings, comp.code, 'statutory_payment'),
          Debit: 0,
          Credit: amount,
          LineMemo: `REVERSAL: ${comp.code} Payment - ${moduleType} - ${periodLabel}`,
        });
        totalBankDebit += amount;
      }
    }

    const interestAmt = parseFloat(challan.interest?.toString() || '0');
    if (interestAmt > 0 && config.interestCode) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: getGlCode(allMappings, config.interestCode, 'expense'),
        Debit: 0,
        Credit: interestAmt,
        LineMemo: `REVERSAL: ${config.interestCode} - ${moduleType} - ${periodLabel}`,
      });
      totalBankDebit += interestAmt;
    }

    const penaltyAmt = parseFloat(challan.penalty?.toString() || '0');
    if (penaltyAmt > 0 && config.penaltyCode) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: getGlCode(allMappings, config.penaltyCode, 'expense'),
        Debit: 0,
        Credit: penaltyAmt,
        LineMemo: `REVERSAL: ${config.penaltyCode} - ${moduleType} - ${periodLabel}`,
      });
      totalBankDebit += penaltyAmt;
    }

    if (totalBankDebit > 0) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: bankAccountCode.trim(),
        Debit: totalBankDebit,
        Credit: 0,
        LineMemo: `REVERSAL: Bank - ${moduleType} Challan ${challan.challanReference} - ${periodLabel}`,
      });
    }

    const jePayload = {
      ReferenceDate: new Date().toISOString().split('T')[0],
      Memo: `REVERSAL: ${moduleType} Payment - Challan ${challan.challanReference} - ${periodLabel}`,
      Reference2: challan.challanReference,
      Reference3: `${moduleType}-REV`,
      JournalEntryLines: jeLines,
    };

    const result = await postJeToSap(currentUser.id, jePayload);

    if (result.success) {
      await db.update(statutoryChallans).set({
        reversalSapDocEntry: result.docEntry,
        reversalSapJeNumber: result.jeNumber,
        reversalSapPostedAt: new Date(),
        reversedBy: currentUser.id,
        reversedAt: new Date(),
        sapPostingStatus: 'reversed',
        updatedAt: new Date(),
      }).where(eq(statutoryChallans.id, challanId));

      return res.json({
        success: true,
        message: `${moduleType} challan reversal JE posted to SAP.`,
        reversalDocEntry: result.docEntry,
        reversalJeNumber: result.jeNumber,
      });
    } else {
      return res.status(500).json({ error: `Reversal failed: ${result.error}` });
    }
  } catch (error: any) {
    console.error('Error reversing statutory challan in SAP:', error);
    res.status(500).json({ error: error.message || 'Failed to reverse challan in SAP' });
  }
});

export { postJeToSap, getGlCode };
export default router;
