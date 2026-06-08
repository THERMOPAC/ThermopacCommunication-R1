import { Router, Request, Response } from 'express';
import { db } from './db';
import { 
  glAccountMappings, glPostingLog, 
  statutoryChallans, statutoryChallanDetails, statutoryFilingStatus,
  ptStateConfig, payrollPeriods, payrollRecords, users,
  tdsComplianceRegister, tdsPayrollSapReconciliation, sapWhtSyncLog,
  insertGlAccountMappingSchema, insertStatutoryFilingStatusSchema
} from '@shared/schema';
import { eq, and, sql, desc, asc, inArray, isNull } from 'drizzle-orm';
import { payrollSettings } from '@shared/schema';
import { ensureAuthenticated } from './auth-middleware';
import { sapSession } from './sap-b1-integration/sap-central-session';

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
  const rawDetails = await db.select({
    id: statutoryChallanDetails.id,
    employeeId: statutoryChallanDetails.employeeId,
    payrollRecordId: statutoryChallanDetails.payrollRecordId,
    employeeContribution: statutoryChallanDetails.employeeContribution,
    employerContribution: statutoryChallanDetails.employerContribution,
    grossSalary: statutoryChallanDetails.grossSalary,
    firstName: users.firstName,
    lastName: users.lastName,
    cardName: users.cardName,
    employeeCode: users.employeeCode,
  }).from(statutoryChallanDetails)
    .leftJoin(users, eq(statutoryChallanDetails.employeeId, users.id))
    .where(eq(statutoryChallanDetails.challanId, challan.id))
    .orderBy(asc(users.cardName));
  let details = rawDetails.map(d => ({
    ...d,
    employeeName: d.cardName || [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unknown',
  }));

  if (details.length === 0 && challan.moduleType === 'TDS' && challan.tdsSection !== '192') {
    const registerEntries = await db.select().from(tdsComplianceRegister)
      .where(and(
        eq(tdsComplianceRegister.challanId, challan.id),
        eq(tdsComplianceRegister.sourceCategory, 'sap_wht_non_salary'),
      ))
      .orderBy(asc(tdsComplianceRegister.deducteeName));

    if (registerEntries.length > 0) {
      const grouped = new Map<string, { name: string, pan: string | null, baseTotal: number, tdsTotal: number, count: number }>();
      for (const entry of registerEntries) {
        const key = entry.deducteeName || 'Unknown';
        const existing = grouped.get(key) || { name: key, pan: entry.deducteePan, baseTotal: 0, tdsTotal: 0, count: 0 };
        existing.baseTotal += parseFloat(entry.baseAmount?.toString() || '0');
        existing.tdsTotal += parseFloat(entry.tdsAmount?.toString() || '0');
        existing.count += 1;
        grouped.set(key, existing);
      }
      details = Array.from(grouped.values()).map((g, i) => ({
        id: i + 1,
        employeeId: null,
        payrollRecordId: null,
        employeeContribution: g.tdsTotal.toFixed(2),
        employerContribution: '0.00',
        grossSalary: g.baseTotal.toFixed(2),
        firstName: null,
        lastName: null,
        cardName: g.name,
        employeeCode: g.pan || '—',
        employeeName: g.name,
      }));
    }
  }

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

  // C7: official records only — trial records must not appear in statutory TDS challans
  const records = await db.select().from(payrollRecords)
    .where(and(
      eq(payrollRecords.periodId, payrollPeriodId),
      eq(payrollRecords.recordType as any, 'official'),
      inArray(payrollRecords.status as any, [
        'generated', 'processed', 'approved', 'paid', 'locked', 'verified', 'transferred',
      ])
    ));

  if (records.length === 0) {
    return res.status(400).json({ error: 'No official payroll records found for this period' });
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

    if ((empAmt > 0 || emprAmt > 0) && rec.userId) {
      totalEmp += empAmt;
      totalEmpr += emprAmt;
      detailRows.push({
        employeeId: rec.userId,
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

  if (moduleType === 'TDS' && detailRows.length > 0) {
    const quarter = getTdsQuarter(month);
    const employeeIds = detailRows.map(d => d.employeeId);
    const employees = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      cardName: users.cardName,
      panNumber: users.panNumber,
    }).from(users).where(inArray(users.id, employeeIds));
    const empMap = new Map(employees.map(e => [e.id, e]));

    for (const d of detailRows) {
      const emp = empMap.get(d.employeeId);
      if (!emp) continue;
      const empName = emp.cardName || [emp.firstName, emp.lastName].filter(Boolean).join(' ') || 'Unknown';
      const existing = await db.select().from(tdsComplianceRegister)
        .where(and(
          eq(tdsComplianceRegister.sourceCategory, 'payroll_192'),
          eq(tdsComplianceRegister.tdsSection, '192'),
          eq(tdsComplianceRegister.month, month),
          eq(tdsComplianceRegister.year, year),
          sql`${tdsComplianceRegister.deducteeName} = ${empName}`,
        ));
      if (existing.length === 0) {
        await db.insert(tdsComplianceRegister).values({
          sourceCategory: 'payroll_192',
          tdsSection: '192',
          financialYear: fy,
          quarter,
          month,
          year,
          deducteeName: empName,
          deducteePan: emp.panNumber || null,
          deducteeType: 'employee',
          employeeId: d.employeeId,
          payrollRecordId: d.payrollRecordId,
          baseAmount: d.grossSalary,
          tdsAmount: d.employeeContribution,
          tdsRate: null,
          panStatus: emp.panNumber ? 'valid' : 'not_available',
          challanId: challan.id,
          challanStatus: 'included',
        });
      }
    }
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
  // Include periods that are formally finalized (status in VALID_PAYROLL_STATUSES)
  // OR that have at least one official payroll record run (period stuck in 'draft'
  // but payroll was executed — the real-world signal that the period is usable).
  const periods = await db.select().from(payrollPeriods)
    .where(
      sql`${payrollPeriods.status} = ANY(ARRAY[${sql.raw(VALID_PAYROLL_STATUSES.map(s => `'${s}'`).join(','))}]::text[])
          OR EXISTS (
            SELECT 1 FROM payroll_records pr
            WHERE pr.period_id = ${payrollPeriods.id}
              AND pr.record_type = 'official'
          )`
    )
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
    let sourceTotal = 0;
    let sourceLabel = 'Payroll Total';
    const isNonSalaryTds = moduleType === 'TDS' && ch.tdsSection && ch.tdsSection !== '192';

    if (isNonSalaryTds) {
      sourceLabel = 'Register Total';
      const regEntries = await db.select().from(tdsComplianceRegister)
        .where(and(
          eq(tdsComplianceRegister.challanId, ch.id),
          eq(tdsComplianceRegister.sourceCategory, 'sap_wht_non_salary'),
        ));
      for (const entry of regEntries) {
        sourceTotal += parseFloat(entry.tdsAmount?.toString() || '0');
      }
    } else if (ch.payrollPeriodId) {
      const records = await db.select().from(payrollRecords)
        .where(eq(payrollRecords.periodId, ch.payrollPeriodId));
      for (const rec of records) {
        switch (moduleType) {
          case 'TDS':
            sourceTotal += parseFloat(rec.tdsAmount?.toString() || rec.incomeTax?.toString() || '0');
            break;
          case 'PF':
            sourceTotal += parseFloat(rec.employeePf?.toString() || '0') + parseFloat(rec.employerPf?.toString() || '0');
            break;
          case 'ESIC':
            sourceTotal += parseFloat(rec.employeeEsic?.toString() || '0') + parseFloat(rec.employerEsic?.toString() || '0');
            break;
          case 'PT':
            sourceTotal += parseFloat(rec.professionalTax?.toString() || '0');
            break;
        }
      }
    }

    const challanBase = parseFloat(ch.totalEmployeeContribution?.toString() || '0') 
                      + parseFloat(ch.totalEmployerContribution?.toString() || '0');
    const sapAmount = ch.glPostingId ? parseFloat(ch.totalAmount?.toString() || '0') : 0;

    result.push({
      month: ch.month,
      year: ch.year,
      tdsSection: ch.tdsSection || null,
      challanId: ch.id,
      challanReference: ch.challanReference,
      challanStatus: ch.status,
      payrollTotal: sourceTotal.toFixed(2),
      sourceLabel,
      challanTotal: challanBase.toFixed(2),
      sapPosted: sapAmount.toFixed(2),
      variance: (sourceTotal - challanBase).toFixed(2),
    });
  }

  res.json(result);
});

async function postJeToSap(userId: number, jePayload: any): Promise<{ success: boolean; docEntry?: number; jeNumber?: string; error?: string }> {
  try {
    const sapResponse = await sapSession.request({
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
  const m = mappings.find(r =>
    r.componentCode === code &&
    r.postingContext === context &&
    r.isActive &&
    (
      (r.glAccountCode && r.glAccountCode.trim() !== '') ||
      (r.sapAcctCode && r.sapAcctCode.trim() !== '')
    )
  );
  if (!m) return null;
  if (m.sapAcctCode && m.sapAcctCode.trim() !== '') return m.sapAcctCode;
  return m.glAccountCode;
}

router.get('/sap-bank-accounts', async (req: Request, res: Response) => {
  try {
    const sapResponse = await sapSession.request({
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
        sapBankAccountCode: bankAccountCode.trim(),
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

    const [challan] = await db.select().from(statutoryChallans).where(eq(statutoryChallans.id, challanId));
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.sapPostingStatus !== 'posted') {
      return res.status(400).json({ error: 'Only posted challans can be reversed.' });
    }

    if (challan.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This challan has already been reversed.', reversalJeNumber: challan.reversalSapJeNumber });
    }

    const bankAccountCode = challan.sapBankAccountCode;
    if (!bankAccountCode) {
      return res.status(400).json({ error: 'Original bank account code not found on this challan. Cannot reverse without matching the original JE.' });
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
        AccountCode: bankAccountCode,
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

router.get('/tds/reconciliation', async (req: Request, res: Response) => {
  try {
    const { financialYear, quarter, periodId } = req.query;
    const conditions: any[] = [];
    if (financialYear) conditions.push(eq(tdsPayrollSapReconciliation.financialYear, financialYear as string));
    if (quarter) conditions.push(eq(tdsPayrollSapReconciliation.quarter, quarter as string));
    if (periodId) conditions.push(eq(tdsPayrollSapReconciliation.periodId, parseInt(periodId as string)));

    const rows = await db.select().from(tdsPayrollSapReconciliation)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tdsPayrollSapReconciliation.year), desc(tdsPayrollSapReconciliation.month), asc(tdsPayrollSapReconciliation.employeeName));

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tds/reconciliation/refresh', async (req: Request, res: Response) => {
  try {
    const { periodId } = req.body;
    if (!periodId) return res.status(400).json({ error: 'periodId is required' });

    const period = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId)).limit(1);
    if (!period.length) return res.status(404).json({ error: 'Period not found' });

    const p = period[0];
    const startDate = new Date(p.startDate);
    const month = startDate.getMonth() + 1;
    const year = startDate.getFullYear();
    const fy = getFinancialYear(month, year);
    const qtr = getTdsQuarter(month);

    // C8: official records only — trial records must not appear in SAP reconciliation
    const records = await db.select({
      pr: payrollRecords,
      u: users,
    }).from(payrollRecords)
      .innerJoin(users, eq(payrollRecords.userId, users.id))
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.recordType as any, 'official'),
        inArray(payrollRecords.status, ['generated', 'processed', 'approved', 'paid', 'locked', 'verified', 'transferred']),
      ));

    if (!records.length) return res.json({ message: 'No payroll records found for this period', refreshed: 0 });

    await db.delete(tdsPayrollSapReconciliation).where(eq(tdsPayrollSapReconciliation.periodId, periodId));

    const now = new Date();
    const insertRows = [];

    for (const { pr, u } of records) {
      if (!pr.userId) continue;
      const tdsAmt = parseFloat(pr.tdsAmount?.toString() || pr.incomeTax?.toString() || '0');
      if (tdsAmt <= 0) continue;

      let postingStatus = 'sap_missing';
      if (pr.sapPostingStatus === 'posted') postingStatus = 'posted';
      else if (pr.sapPostingStatus === 'failed') postingStatus = 'posting_failed';

      insertRows.push({
        employeeId: pr.userId,
        employeeName: u.cardName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'Unknown',
        employeeCode: u.employeeCode || null,
        periodId: periodId,
        month,
        year,
        financialYear: fy,
        quarter: qtr,
        payrollTdsAmount: tdsAmt.toFixed(2),
        sapPostingStatus: postingStatus,
        sapDocEntry: pr.sapDocEntry || null,
        sapJeNumber: pr.sapJeNumber || null,
        sapPostingDate: pr.sapPostedAt || null,
        sapVerifiedTdsAmount: null,
        sapVerificationStatus: 'not_verified',
        variance: null,
        toleranceApplied: null,
        payrollRecordId: pr.id,
        lastReconciledAt: now,
        lastVerifiedAt: null,
      });
    }

    if (insertRows.length > 0) {
      await db.insert(tdsPayrollSapReconciliation).values(insertRows as any);
    }

    const summary = {
      total: insertRows.length,
      posted: insertRows.filter(r => r.sapPostingStatus === 'posted').length,
      sapMissing: insertRows.filter(r => r.sapPostingStatus === 'sap_missing').length,
      postingFailed: insertRows.filter(r => r.sapPostingStatus === 'posting_failed').length,
    };

    res.json({ message: 'Reconciliation refreshed', refreshed: insertRows.length, summary });
  } catch (error: any) {
    console.error('Error refreshing TDS reconciliation:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/tds/mismatch-exceptions', async (req: Request, res: Response) => {
  try {
    const { financialYear, quarter } = req.query;
    const conditions: any[] = [
      sql`${tdsPayrollSapReconciliation.sapPostingStatus} IN ('sap_missing', 'posting_failed')
          OR ${tdsPayrollSapReconciliation.sapVerificationStatus} IN ('mismatched', 'verification_error')`,
    ];
    if (financialYear) conditions.push(eq(tdsPayrollSapReconciliation.financialYear, financialYear as string));
    if (quarter) conditions.push(eq(tdsPayrollSapReconciliation.quarter, quarter as string));

    const rows = await db.select().from(tdsPayrollSapReconciliation)
      .where(and(...conditions))
      .orderBy(desc(tdsPayrollSapReconciliation.year), desc(tdsPayrollSapReconciliation.month));

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tds/tolerance', async (_req: Request, res: Response) => {
  try {
    const result = await db.select().from(payrollSettings)
      .where(eq(payrollSettings.settingName, 'tds_reconciliation_tolerance'))
      .limit(1);
    const tolerance = result.length ? result[0].settingValue : '1.00';
    res.json({ tolerance: parseFloat(tolerance || '1.00') });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/tds/tolerance', async (req: Request, res: Response) => {
  try {
    const { tolerance } = req.body;
    if (tolerance === undefined || tolerance === null || isNaN(parseFloat(tolerance))) {
      return res.status(400).json({ error: 'Valid numeric tolerance value is required' });
    }
    const val = parseFloat(tolerance).toFixed(2);
    const existing = await db.select().from(payrollSettings)
      .where(eq(payrollSettings.settingName, 'tds_reconciliation_tolerance'))
      .limit(1);

    if (existing.length) {
      await db.update(payrollSettings)
        .set({ settingValue: val, updatedAt: new Date() })
        .where(eq(payrollSettings.settingName, 'tds_reconciliation_tolerance'));
    } else {
      await db.insert(payrollSettings).values({
        settingName: 'tds_reconciliation_tolerance',
        settingValue: val,
        description: 'Tolerance amount (INR) for TDS payroll-SAP reconciliation variance matching',
      } as any);
    }

    res.json({ tolerance: parseFloat(val) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tds/deep-je-verify', async (req: Request, res: Response) => {
  try {
    const { periodId, financialYear } = req.body;
    if (!periodId && !financialYear) {
      return res.status(400).json({ error: 'Either periodId or financialYear is required' });
    }

    const conditions: any[] = [
      eq(tdsPayrollSapReconciliation.sapPostingStatus, 'posted'),
    ];
    if (periodId) conditions.push(eq(tdsPayrollSapReconciliation.periodId, parseInt(periodId)));
    if (financialYear) conditions.push(eq(tdsPayrollSapReconciliation.financialYear, financialYear as string));

    const rows = await db.select().from(tdsPayrollSapReconciliation)
      .where(and(...conditions));

    const postedRows = rows.filter(r => r.sapDocEntry);
    if (postedRows.length === 0) {
      return res.json({
        message: 'No posted records with SAP DocEntry found for verification',
        verified: 0,
        matched: 0,
        withinTolerance: 0,
        mismatched: 0,
        verificationErrors: 0,
      });
    }

    const tolResult = await db.select().from(payrollSettings)
      .where(eq(payrollSettings.settingName, 'tds_reconciliation_tolerance'))
      .limit(1);
    const tolerance = parseFloat(tolResult.length ? tolResult[0].settingValue || '1.00' : '1.00');

    const currentUser = (req as any).user;

    let matched = 0, withinTolerance = 0, mismatched = 0, verificationErrors = 0;
    const now = new Date();
    const results: any[] = [];

    for (const row of postedRows) {
      try {
        const jeResp = await sapSession.request({
          method: 'GET',
          path: `/b1s/v1/JournalEntries(${row.sapDocEntry})?$select=JournalEntryLines`,
        });

        if (!jeResp.ok) {
          verificationErrors++;
          results.push({ id: row.id, status: 'error', error: `SAP returned ${jeResp.statusCode}` });
          await db.update(tdsPayrollSapReconciliation)
            .set({
              sapVerificationStatus: 'verification_error',
              lastVerifiedAt: now,
              updatedAt: now,
            })
            .where(eq(tdsPayrollSapReconciliation.id, row.id));
          continue;
        }

        const jeData = JSON.parse(jeResp.body);
        const lines = jeData.JournalEntryLines || [];

        let sapTdsAmount = 0;
        for (const line of lines) {
          const acctCode = line.AccountCode || '';
          const shortCode = line.ShortName || '';
          if (
            acctCode.includes('TDS') || acctCode.includes('tds') ||
            shortCode.includes('TDS') || shortCode.includes('tds') ||
            acctCode === '2310001' || acctCode === '2310002'
          ) {
            sapTdsAmount += Math.abs(parseFloat(line.Credit || '0') - parseFloat(line.Debit || '0'));
          }
        }

        if (sapTdsAmount === 0) {
          let maxCreditLine = { credit: 0 };
          for (const line of lines) {
            const credit = parseFloat(line.Credit || '0');
            if (credit > maxCreditLine.credit) {
              maxCreditLine = { credit };
            }
          }
          const totalCredit = lines.reduce((s: number, l: any) => s + parseFloat(l.Credit || '0'), 0);
          const totalDebit = lines.reduce((s: number, l: any) => s + parseFloat(l.Debit || '0'), 0);
          sapTdsAmount = Math.min(totalCredit, totalDebit);
        }

        const payrollAmt = parseFloat(row.payrollTdsAmount?.toString() || '0');
        const variance = Math.abs(payrollAmt - sapTdsAmount);
        let verStatus: string;

        if (variance === 0 || (payrollAmt === sapTdsAmount)) {
          verStatus = 'matched';
          matched++;
        } else if (variance <= tolerance) {
          verStatus = 'within_tolerance';
          withinTolerance++;
        } else {
          verStatus = 'mismatched';
          mismatched++;
        }

        await db.update(tdsPayrollSapReconciliation)
          .set({
            sapVerifiedTdsAmount: sapTdsAmount.toFixed(2),
            sapVerificationStatus: verStatus,
            variance: (payrollAmt - sapTdsAmount).toFixed(2),
            toleranceApplied: tolerance.toFixed(2),
            lastVerifiedAt: now,
            updatedAt: now,
          })
          .where(eq(tdsPayrollSapReconciliation.id, row.id));

        results.push({
          id: row.id,
          employee: row.employeeName,
          payrollAmount: payrollAmt,
          sapAmount: sapTdsAmount,
          variance: (payrollAmt - sapTdsAmount).toFixed(2),
          status: verStatus,
        });

      } catch (err: any) {
        verificationErrors++;
        results.push({ id: row.id, status: 'error', error: err.message });
        await db.update(tdsPayrollSapReconciliation)
          .set({
            sapVerificationStatus: 'verification_error',
            lastVerifiedAt: now,
            updatedAt: now,
          })
          .where(eq(tdsPayrollSapReconciliation.id, row.id));
      }
    }

    res.json({
      message: 'Deep JE verification complete',
      verified: postedRows.length,
      matched,
      withinTolerance,
      mismatched,
      verificationErrors,
      tolerance,
      results,
    });
  } catch (error: any) {
    console.error('Error in deep JE verification:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/tds/compliance-register', async (req: Request, res: Response) => {
  try {
    const { financialYear, quarter, month, tdsSection, sourceCategory, deductionStage, challanStatus } = req.query;
    const conditions: any[] = [];
    if (financialYear) conditions.push(eq(tdsComplianceRegister.financialYear, financialYear as string));
    if (quarter) conditions.push(eq(tdsComplianceRegister.quarter, quarter as string));
    if (month) conditions.push(eq(tdsComplianceRegister.month, parseInt(month as string)));
    if (tdsSection) conditions.push(eq(tdsComplianceRegister.tdsSection, tdsSection as string));
    if (sourceCategory) conditions.push(eq(tdsComplianceRegister.sourceCategory, sourceCategory as string));
    if (deductionStage) conditions.push(eq(tdsComplianceRegister.deductionStage, deductionStage as string));
    if (challanStatus) conditions.push(eq(tdsComplianceRegister.challanStatus, challanStatus as string));

    const rows = await db.select().from(tdsComplianceRegister)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tdsComplianceRegister.year), desc(tdsComplianceRegister.month), asc(tdsComplianceRegister.deducteeName));

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tds/sync-log', async (req: Request, res: Response) => {
  try {
    const { financialYear } = req.query;
    const conditions: any[] = [];
    if (financialYear) conditions.push(eq(sapWhtSyncLog.financialYear, financialYear as string));

    const rows = await db.select().from(sapWhtSyncLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sapWhtSyncLog.syncedAt));

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tds/gl-config', async (_req: Request, res: Response) => {
  try {
    const mappings = await db.select().from(glAccountMappings)
      .where(and(
        eq(glAccountMappings.isActive, true),
        sql`${glAccountMappings.componentCode} LIKE 'TDS%'`,
      ))
      .orderBy(asc(glAccountMappings.componentCode));
    res.json(mappings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const SAP_WT_CODE_MAP: Record<string, { section: string; rate: number; stage: string }> = {
  'C1': { section: '194C', rate: 1, stage: 'payment' },
  'C2': { section: '194C', rate: 2, stage: 'payment' },
  'J1': { section: '194J', rate: 2, stage: 'payment' },
  'J2': { section: '194J', rate: 10, stage: 'payment' },
  'H1': { section: '194H', rate: 5, stage: 'payment' },
  'I1': { section: '194I', rate: 10, stage: 'payment' },
  'I2': { section: '194I', rate: 2, stage: 'payment' },
  'Q1': { section: '194Q', rate: 0.1, stage: 'payment' },
  'IC1': { section: '194C', rate: 1, stage: 'invoice' },
  'IC2': { section: '194C', rate: 2, stage: 'invoice' },
  'IJ1': { section: '194J', rate: 2, stage: 'invoice' },
  'IJ2': { section: '194J', rate: 10, stage: 'invoice' },
  'IH1': { section: '194H', rate: 5, stage: 'invoice' },
  'II1': { section: '194I', rate: 10, stage: 'invoice' },
  'II2': { section: '194I', rate: 2, stage: 'invoice' },

  '201I': { section: '194C', rate: 1, stage: 'invoice' },
  '202I': { section: '194C', rate: 2, stage: 'invoice' },
  '203I': { section: '194J', rate: 2, stage: 'invoice' },
  '204I': { section: '194J', rate: 10, stage: 'invoice' },
  '206I': { section: '194I', rate: 2, stage: 'invoice' },
  '226I': { section: '194C', rate: 2, stage: 'payment' },
  '234I': { section: '194Q', rate: 0.1, stage: 'invoice' },
};

function validatePan(pan: string | null | undefined): { status: string; error?: string } {
  if (!pan || pan.trim() === '') return { status: 'not_available', error: 'PAN not provided' };
  const cleaned = pan.trim().toUpperCase();
  if (cleaned.length !== 10) return { status: 'invalid', error: 'PAN must be 10 characters' };
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  if (!panRegex.test(cleaned)) return { status: 'invalid', error: 'Invalid PAN format (AAAAA9999A)' };
  return { status: 'valid' };
}

async function fetchSapWhtDocuments(docType: string, dateFilter: string): Promise<any[]> {
  const results: any[] = [];
  let skip = 0;
  const top = 50;

  const entityMap: Record<string, { endpoint: string; whtProp: string }> = {
    'PurchaseInvoice': { endpoint: 'PurchaseInvoices', whtProp: 'WithholdingTaxDataCollection' },
    'VendorPayment': { endpoint: 'VendorPayments', whtProp: 'WithholdingTaxDataWTXCollection' },
    'APCreditMemo': { endpoint: 'PurchaseCreditNotes', whtProp: 'WithholdingTaxDataCollection' },
  };

  const config = entityMap[docType];
  if (!config) return [];
  const { endpoint: entity, whtProp } = config;

  while (true) {
    const path = `/${entity}?$filter=${encodeURIComponent(dateFilter)}&$top=${top}&$skip=${skip}&$select=DocEntry,DocNum,DocDate,CardCode,CardName,${whtProp}`;

    try {
      const response = await sapSession.request({ method: 'GET', path });

      if (!response.ok) {
        console.error(`SAP WHT fetch error for ${docType}: ${response.statusCode} - ${response.body.substring(0, 200)}`);
        break;
      }

      const data = JSON.parse(response.body);
      const items = data.value || [];
      if (items.length > 0 && skip === 0) {
        console.log(`SAP WHT ${docType}: fetched ${items.length} docs (first batch). Sample keys:`, Object.keys(items[0]).join(', '));
      }
      results.push(...items.map((item: any) => ({ ...item, _docType: docType })));

      if (items.length < top) break;
      skip += top;
    } catch (error: any) {
      console.error(`SAP WHT fetch exception for ${docType}:`, error.message);
      break;
    }
  }

  return results;
}

router.post('/tds/sap-wht-sync', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    if (!currentUser?.id) return res.status(401).json({ error: 'Not authenticated' });

    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year are required' });

    const m = parseInt(month);
    const y = parseInt(year);
    const fy = getFinancialYear(m, y);
    const qtr = getTdsQuarter(m);

    const batchId = `WHT-${fy}-${String(m).padStart(2, '0')}-${Date.now()}`;

    await db.insert(sapWhtSyncLog).values({
      syncBatchId: batchId,
      financialYear: fy,
      month: m,
      year: y,
      syncStatus: 'in_progress',
      sapDocTypesQueried: 'PurchaseInvoice,VendorPayment,APCreditMemo',
      syncedBy: currentUser.id,
      syncedAt: new Date(),
    } as any);

    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    const dateFilter = `DocDate ge '${startDate}' and DocDate le '${endDate}'`;

    const docTypes = ['PurchaseInvoice', 'VendorPayment', 'APCreditMemo'];
    let allDocs: any[] = [];

    for (const docType of docTypes) {
      const docs = await fetchSapWhtDocuments(docType, dateFilter);
      allDocs = allDocs.concat(docs);
    }

    const panCache: Record<string, string | null> = {};
    let bpSampleLogged = false;
    async function lookupVendorPan(cardCode: string): Promise<string | null> {
      if (!cardCode) return null;
      if (cardCode in panCache) return panCache[cardCode];
      try {
        const bpResp = await sapSession.request({
          method: 'GET',
          path: `/b1s/v1/BusinessPartners('${encodeURIComponent(cardCode)}')`,
        });
        if (bpResp.ok) {
          const bpData = JSON.parse(bpResp.body);
          let pan = bpData.U_PAN_Number?.trim() || bpData.FederalTaxID?.trim() || null;
          if (!pan && bpData.BPFiscalTaxIDCollection?.length > 0) {
            pan = bpData.BPFiscalTaxIDCollection[0]?.TaxId0?.trim() || null;
          }
          panCache[cardCode] = pan;
          return pan;
        }
      } catch (e: any) {
        console.error(`SAP BP PAN lookup failed for ${cardCode}:`, e.message);
      }
      panCache[cardCode] = null;
      return null;
    }

    let fetched = 0;
    let inserted = 0;
    let skipped = 0;
    let updated = 0;
    const errors: string[] = [];
    const unmappedCodes: Record<string, number> = {};
    const zeroAmountCodes: Record<string, number> = {};

    for (const doc of allDocs) {
      const whtLines = doc.WithholdingTaxDataCollection || doc.WithholdingTaxDataWTXCollection || [];
      for (let lineIdx = 0; lineIdx < whtLines.length; lineIdx++) {
        const wht = whtLines[lineIdx];
        fetched++;

        const wtCode = wht.WTCode || '';
        const mapping = SAP_WT_CODE_MAP[wtCode];

        if (!mapping) {
          unmappedCodes[wtCode] = (unmappedCodes[wtCode] || 0) + 1;
          skipped++;
          continue;
        }

        const tdsAmount = parseFloat(wht.WTAmount?.toString() || wht.WTAmountSC?.toString() || wht.WTAmountSys?.toString() || '0');
        if (tdsAmount === 0) {
          zeroAmountCodes[wtCode] = (zeroAmountCodes[wtCode] || 0) + 1;
          skipped++;
          continue;
        }

        const isCreditMemo = doc._docType === 'APCreditMemo';
        const finalTdsAmount = isCreditMemo ? -Math.abs(tdsAmount) : Math.abs(tdsAmount);

        const baseAmount = parseFloat(wht.TaxableAmount?.toString() || wht.TaxableAmountSC?.toString() || wht.TaxableAmountinSys?.toString() || '0');
        const bpPan = await lookupVendorPan(doc.CardCode);
        const vendorPan = bpPan || wht.BPTaxNum || doc.FederalTaxID || null;
        const panResult = validatePan(vendorPan);

        const docDate = doc.DocDate ? new Date(doc.DocDate) : new Date();
        const docMonth = docDate.getMonth() + 1;
        const docYear = docDate.getFullYear();
        const docFy = getFinancialYear(docMonth, docYear);
        const docQtr = getTdsQuarter(docMonth);

        const existing = await db.select({ id: tdsComplianceRegister.id })
          .from(tdsComplianceRegister)
          .where(and(
            eq(tdsComplianceRegister.sourceCategory, 'sap_wht_non_salary'),
            eq(tdsComplianceRegister.sapDocEntry, doc.DocEntry),
            eq(tdsComplianceRegister.sapDocType, doc._docType),
            eq(tdsComplianceRegister.sapWtCode, wtCode),
            eq(tdsComplianceRegister.sapLineIndex, lineIdx),
          ))
          .limit(1);

        if (existing.length > 0) {
          await db.update(tdsComplianceRegister)
            .set({
              tdsAmount: finalTdsAmount.toFixed(2),
              baseAmount: Math.abs(baseAmount).toFixed(2),
              tdsRate: mapping.rate.toFixed(2),
              deductionDate: docDate,
              deducteeName: doc.CardName || 'Unknown Vendor',
              deducteePan: vendorPan?.trim()?.toUpperCase() || null,
              panStatus: panResult.status,
              panValidationError: panResult.error || null,
              syncBatchId: batchId,
              updatedAt: new Date(),
            })
            .where(eq(tdsComplianceRegister.id, existing[0].id));
          updated++;
        } else {
          try {
            await db.insert(tdsComplianceRegister).values({
              sourceCategory: 'sap_wht_non_salary',
              tdsSection: mapping.section,
              financialYear: docFy,
              quarter: docQtr,
              month: docMonth,
              year: docYear,
              deducteeName: doc.CardName || 'Unknown Vendor',
              deducteePan: vendorPan?.trim()?.toUpperCase() || null,
              panStatus: panResult.status,
              panValidationError: panResult.error || null,
              deducteeType: 'vendor',
              sapVendorCode: doc.CardCode || null,
              sapDocEntry: doc.DocEntry,
              sapDocType: doc._docType,
              sapWtCode: wtCode,
              sapLineIndex: lineIdx,
              deductionStage: mapping.stage,
              baseAmount: Math.abs(baseAmount).toFixed(2),
              tdsAmount: finalTdsAmount.toFixed(2),
              tdsRate: mapping.rate.toFixed(2),
              deductionDate: docDate,
              challanStatus: 'pending',
              syncBatchId: batchId,
            } as any);
            inserted++;
          } catch (insertErr: any) {
            if (insertErr.code === '23505') {
              skipped++;
            } else {
              errors.push(`Doc ${doc.DocEntry}/${wtCode}: ${insertErr.message}`);
              skipped++;
            }
          }
        }
      }
    }

    if (Object.keys(unmappedCodes).length > 0) {
      console.log('SAP WHT Sync - Unmapped WTCodes (skipped):', JSON.stringify(unmappedCodes));
    }
    if (Object.keys(zeroAmountCodes).length > 0) {
      console.log('SAP WHT Sync - Zero amount WTCodes (skipped):', JSON.stringify(zeroAmountCodes));
    }
    console.log(`SAP WHT Sync Summary: ${allDocs.length} docs, ${fetched} WHT lines, ${inserted} inserted, ${skipped} skipped, ${updated} updated`);

    const syncStatus = errors.length > 0 ? 'completed_with_errors' : 'completed';
    await db.update(sapWhtSyncLog)
      .set({
        recordsFetched: fetched,
        recordsInserted: inserted,
        recordsSkipped: skipped,
        recordsUpdated: updated,
        syncStatus,
        errorMessage: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
      })
      .where(eq(sapWhtSyncLog.syncBatchId, batchId));

    res.json({
      success: true,
      batchId,
      summary: {
        fetched,
        inserted,
        updated,
        skipped,
        errors: errors.length,
        documentsProcessed: allDocs.length,
        docTypes: docTypes.join(', '),
      },
    });
  } catch (error: any) {
    console.error('SAP WHT sync error:', error);
    res.status(500).json({ error: error.message || 'SAP WHT sync failed' });
  }
});

router.get('/tds/wt-code-mappings', async (_req: Request, res: Response) => {
  res.json(SAP_WT_CODE_MAP);
});

router.get('/tds/non-salary-challan-periods', async (req: Request, res: Response) => {
  try {
    const { financialYear } = req.query;
    const fy = financialYear as string || getFinancialYear(new Date().getMonth() + 1, new Date().getFullYear());

    const periods = await db.execute(sql`
      SELECT DISTINCT month, year, tds_section, quarter,
        COUNT(*) as entry_count,
        SUM(tds_amount::numeric) as total_tds,
        SUM(base_amount::numeric) as total_base
      FROM tds_compliance_register
      WHERE source_category = 'sap_wht_non_salary'
        AND financial_year = ${fy}
        AND challan_status = 'pending'
        AND tds_amount::numeric > 0
      GROUP BY month, year, tds_section, quarter
      ORDER BY tds_section, year, month
    `);

    const existingChallans = await db.select({
      tdsSection: statutoryChallans.tdsSection,
      month: statutoryChallans.month,
      year: statutoryChallans.year,
      status: statutoryChallans.status,
    }).from(statutoryChallans)
      .where(and(
        eq(statutoryChallans.moduleType, 'TDS'),
        eq(statutoryChallans.financialYear, fy),
        isNull(statutoryChallans.payrollPeriodId),
      ));

    const challanSet = new Set(
      existingChallans
        .filter(c => c.status !== 'reversed')
        .map(c => `${c.tdsSection}-${c.month}-${c.year}`)
    );

    const available = (periods.rows || periods).map((p: any) => ({
      ...p,
      entryCount: parseInt(p.entry_count || p.entryCount || '0'),
      totalTds: parseFloat(p.total_tds || p.totalTds || '0'),
      totalBase: parseFloat(p.total_base || p.totalBase || '0'),
      hasChallan: challanSet.has(`${p.tds_section || p.tdsSection}-${p.month}-${p.year}`),
    }));

    res.json(available);
  } catch (error: any) {
    console.error('Error fetching non-salary challan periods:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/tds/generate-non-salary-challan', async (req: Request, res: Response) => {
  try {
    const { tdsSection, month, year } = req.body;
    if (!tdsSection || !month || !year) {
      return res.status(400).json({ error: 'tdsSection, month, and year are required' });
    }

    const fy = getFinancialYear(month, year);
    const quarter = getTdsQuarter(month);

    const existing = await db.select().from(statutoryChallans)
      .where(and(
        eq(statutoryChallans.moduleType, 'TDS'),
        eq(statutoryChallans.tdsSection, tdsSection),
        eq(statutoryChallans.month, month),
        eq(statutoryChallans.year, year),
        isNull(statutoryChallans.payrollPeriodId),
      ));
    const notReversed = existing.filter(e => e.status !== 'reversed');
    if (notReversed.length > 0) {
      return res.status(409).json({ error: `A non-salary TDS challan for Section ${tdsSection}, ${month}/${year} already exists` });
    }

    const entries = await db.select().from(tdsComplianceRegister)
      .where(and(
        eq(tdsComplianceRegister.sourceCategory, 'sap_wht_non_salary'),
        eq(tdsComplianceRegister.tdsSection, tdsSection),
        eq(tdsComplianceRegister.month, month),
        eq(tdsComplianceRegister.year, year),
        eq(tdsComplianceRegister.challanStatus, 'pending'),
      ));

    if (entries.length === 0) {
      return res.status(400).json({ error: 'No pending register entries found for this section/period' });
    }

    const totalTds = entries.reduce((s, e) => s + parseFloat(e.tdsAmount?.toString() || '0'), 0);
    const totalBase = entries.reduce((s, e) => s + parseFloat(e.baseAmount?.toString() || '0'), 0);

    if (totalTds <= 0) {
      return res.status(400).json({ error: 'Net TDS amount must be positive to generate a challan (credit memos may reduce it to zero or negative)' });
    }

    const deducteeCount = new Set(entries.map(e => e.deducteePan || e.deducteeName)).size;
    const ref = `TDS-${tdsSection}-${year}-${month.toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    const [challan] = await db.insert(statutoryChallans).values({
      challanReference: ref,
      moduleType: 'TDS',
      payrollPeriodId: null,
      month,
      year,
      financialYear: fy,
      employeeCount: deducteeCount,
      totalEmployeeContribution: totalTds.toFixed(2),
      totalEmployerContribution: '0',
      totalAmount: totalTds.toFixed(2),
      tdsSection,
      tdsQuarter: quarter,
      status: 'calculated',
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    }).returning();

    await db.update(tdsComplianceRegister)
      .set({ challanStatus: 'included', challanId: challan.id, updatedAt: new Date() })
      .where(and(
        eq(tdsComplianceRegister.sourceCategory, 'sap_wht_non_salary'),
        eq(tdsComplianceRegister.tdsSection, tdsSection),
        eq(tdsComplianceRegister.month, month),
        eq(tdsComplianceRegister.year, year),
        eq(tdsComplianceRegister.challanStatus, 'pending'),
      ));

    res.json({
      challan,
      summary: {
        section: tdsSection,
        month,
        year,
        quarter,
        entryCount: entries.length,
        deducteeCount,
        totalBase: totalBase.toFixed(2),
        totalTds: totalTds.toFixed(2),
      },
    });
  } catch (error: any) {
    console.error('Error generating non-salary challan:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/challans/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [challan] = await db.select().from(statutoryChallans).where(eq(statutoryChallans.id, id));
  if (!challan) return res.status(404).json({ error: 'Challan not found' });
  if (challan.status !== 'calculated' && challan.status !== 'draft') {
    return res.status(400).json({ error: 'Only draft or calculated challans can be deleted' });
  }

  await db.delete(statutoryChallanDetails).where(eq(statutoryChallanDetails.challanId, id));

  if (challan.moduleType === 'TDS' && challan.tdsSection === '192' && challan.payrollPeriodId) {
    const startDate = new Date(challan.year, (challan.month || 1) - 1);
    await db.update(tdsComplianceRegister).set({
      challanId: null,
      challanStatus: 'pending',
    }).where(and(
      eq(tdsComplianceRegister.sourceCategory, 'payroll_192'),
      eq(tdsComplianceRegister.month, challan.month || 0),
      eq(tdsComplianceRegister.year, challan.year || 0),
    ));
  }

  if (challan.moduleType === 'TDS' && challan.tdsSection !== '192' && !challan.payrollPeriodId) {
    await db.update(tdsComplianceRegister).set({
      challanId: null,
      challanStatus: 'pending',
    }).where(and(
      eq(tdsComplianceRegister.sourceCategory, 'sap_wht_non_salary'),
      eq(tdsComplianceRegister.tdsSection, challan.tdsSection || ''),
      eq(tdsComplianceRegister.month, challan.month || 0),
      eq(tdsComplianceRegister.year, challan.year || 0),
    ));
  }

  await db.delete(statutoryChallans).where(eq(statutoryChallans.id, id));
  res.json({ success: true, message: 'Challan deleted successfully' });
});

router.post('/pt/seed-maharashtra', async (_req: Request, res: Response) => {
  const existing = await db.select().from(ptStateConfig).where(eq(ptStateConfig.state, 'Maharashtra'));
  if (existing.length > 0) {
    return res.json({ message: 'Maharashtra PT config already exists', config: existing[0] });
  }

  const [config] = await db.insert(ptStateConfig).values({
    state: 'Maharashtra',
    ptrcNumber: '',
    filingFrequency: 'monthly',
    paymentDueDay: 10,
    isActive: true,
    slabConfig: JSON.stringify([
      { minSalary: 0, maxSalary: 7500, amount: 0, gender: 'all' },
      { minSalary: 7501, maxSalary: 10000, amount: 175, gender: 'all' },
      { minSalary: 10001, maxSalary: 999999999, amount: 200, gender: 'male' },
      { minSalary: 10001, maxSalary: 999999999, amount: 200, gender: 'female' },
      { minSalary: 10001, maxSalary: 999999999, amount: 300, gender: 'male', monthOverride: 'february' },
    ]),
  }).returning();

  res.json({ message: 'Maharashtra PT config seeded', config });
});

export { postJeToSap, getGlCode };
export default router;
