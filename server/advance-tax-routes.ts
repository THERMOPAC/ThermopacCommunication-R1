import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from './db';
import { advanceTaxCalculations, advanceTaxPayments, users } from '@shared/schema';
import { ensureAuthenticated } from './auth';

const router = Router();

// Helper function to get current Indian financial year
function getCurrentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 0-based to 1-based
  
  if (month >= 4) {
    // April onwards is current FY
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    // Jan-Mar is previous FY
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// Get all advance tax calculations for a user, grouped by financial year
router.get('/api/advance-tax/calculations', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const calculations = await db
      .select({
        id: advanceTaxCalculations.id,
        financialYear: advanceTaxCalculations.financialYear,
        annualTaxableIncome: advanceTaxCalculations.annualTaxableIncome,
        taxRate: advanceTaxCalculations.taxRate,
        surchargeRate: advanceTaxCalculations.surchargeRate,
        cessRate: advanceTaxCalculations.cessRate,
        baseTax: advanceTaxCalculations.baseTax,
        surchargeAmount: advanceTaxCalculations.surchargeAmount,
        cessAmount: advanceTaxCalculations.cessAmount,
        totalTaxLiability: advanceTaxCalculations.totalTaxLiability,
        paidJune: advanceTaxCalculations.paidJune,
        paidSeptember: advanceTaxCalculations.paidSeptember,
        paidDecember: advanceTaxCalculations.paidDecember,
        paidMarch: advanceTaxCalculations.paidMarch,
        status: advanceTaxCalculations.status,
        notes: advanceTaxCalculations.notes,
        createdAt: advanceTaxCalculations.createdAt,
        updatedAt: advanceTaxCalculations.updatedAt,
        lastPaymentDate: advanceTaxCalculations.lastPaymentDate,
      })
      .from(advanceTaxCalculations)
      .where(eq(advanceTaxCalculations.userId, userId))
      .orderBy(desc(advanceTaxCalculations.financialYear), desc(advanceTaxCalculations.createdAt));

    res.json(calculations);
  } catch (error) {
    console.error('Error fetching advance tax calculations:', error);
    res.status(500).json({ error: 'Failed to fetch calculations' });
  }
});

// Get a specific calculation by ID
router.get('/api/advance-tax/calculations/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const calculationId = parseInt(req.params.id);

    const [calculation] = await db
      .select()
      .from(advanceTaxCalculations)
      .where(and(
        eq(advanceTaxCalculations.id, calculationId),
        eq(advanceTaxCalculations.userId, userId)
      ));

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    res.json(calculation);
  } catch (error) {
    console.error('Error fetching calculation:', error);
    res.status(500).json({ error: 'Failed to fetch calculation' });
  }
});

// Create or update advance tax calculation
router.post('/api/advance-tax/calculations', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      financialYear,
      annualTaxableIncome,
      taxRate,
      surchargeRate,
      cessRate,
      paidJune = 0,
      paidSeptember = 0,
      paidDecember = 0,
      paidMarch = 0,
      notes
    } = req.body;

    // Calculate tax amounts
    const income = parseFloat(annualTaxableIncome);
    const baseTaxRate = parseFloat(taxRate) / 100;
    const surcharge = parseFloat(surchargeRate) / 100;
    const cess = parseFloat(cessRate) / 100;

    const baseTax = income * baseTaxRate;
    const surchargeAmount = baseTax * surcharge;
    const taxPlusSurcharge = baseTax + surchargeAmount;
    const cessAmount = taxPlusSurcharge * cess;
    const totalTaxLiability = taxPlusSurcharge + cessAmount;

    // Check if calculation already exists for this user and financial year
    const [existingCalculation] = await db
      .select()
      .from(advanceTaxCalculations)
      .where(and(
        eq(advanceTaxCalculations.userId, userId),
        eq(advanceTaxCalculations.financialYear, financialYear)
      ));

    let calculation;

    if (existingCalculation) {
      // Update existing calculation
      [calculation] = await db
        .update(advanceTaxCalculations)
        .set({
          annualTaxableIncome: annualTaxableIncome.toString(),
          taxRate: taxRate.toString(),
          surchargeRate: surchargeRate.toString(),
          cessRate: cessRate.toString(),
          baseTax: baseTax.toString(),
          surchargeAmount: surchargeAmount.toString(),
          cessAmount: cessAmount.toString(),
          totalTaxLiability: totalTaxLiability.toString(),
          paidJune: paidJune.toString(),
          paidSeptember: paidSeptember.toString(),
          paidDecember: paidDecember.toString(),
          paidMarch: paidMarch.toString(),
          notes,
          updatedAt: new Date(),
        })
        .where(eq(advanceTaxCalculations.id, existingCalculation.id))
        .returning();
    } else {
      // Create new calculation
      [calculation] = await db
        .insert(advanceTaxCalculations)
        .values({
          userId,
          financialYear,
          annualTaxableIncome: annualTaxableIncome.toString(),
          taxRate: taxRate.toString(),
          surchargeRate: surchargeRate.toString(),
          cessRate: cessRate.toString(),
          baseTax: baseTax.toString(),
          surchargeAmount: surchargeAmount.toString(),
          cessAmount: cessAmount.toString(),
          totalTaxLiability: totalTaxLiability.toString(),
          paidJune: paidJune.toString(),
          paidSeptember: paidSeptember.toString(),
          paidDecember: paidDecember.toString(),
          paidMarch: paidMarch.toString(),
          notes,
          status: 'active',
        })
        .returning();
    }

    res.json(calculation);
  } catch (error) {
    console.error('Error saving advance tax calculation:', error);
    res.status(500).json({ error: 'Failed to save calculation' });
  }
});

// Update payment amounts for a specific calculation
router.patch('/api/advance-tax/calculations/:id/payments', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const calculationId = parseInt(req.params.id);
    const { paidJune, paidSeptember, paidDecember, paidMarch } = req.body;

    // Verify ownership
    const [calculation] = await db
      .select()
      .from(advanceTaxCalculations)
      .where(and(
        eq(advanceTaxCalculations.id, calculationId),
        eq(advanceTaxCalculations.userId, userId)
      ));

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    // Update payment amounts
    const [updatedCalculation] = await db
      .update(advanceTaxCalculations)
      .set({
        paidJune: paidJune?.toString() || calculation.paidJune,
        paidSeptember: paidSeptember?.toString() || calculation.paidSeptember,
        paidDecember: paidDecember?.toString() || calculation.paidDecember,
        paidMarch: paidMarch?.toString() || calculation.paidMarch,
        lastPaymentDate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(advanceTaxCalculations.id, calculationId))
      .returning();

    res.json(updatedCalculation);
  } catch (error) {
    console.error('Error updating payments:', error);
    res.status(500).json({ error: 'Failed to update payments' });
  }
});

// Get available financial years
router.get('/api/advance-tax/financial-years', ensureAuthenticated, async (req, res) => {
  try {
    const currentFY = getCurrentFinancialYear();
    const currentYear = parseInt(currentFY.split('-')[0]);
    
    // Generate 5 years: 2 past, current, 2 future
    const financialYears = [];
    for (let i = -2; i <= 2; i++) {
      const year = currentYear + i;
      const nextYear = year + 1;
      financialYears.push(`${year}-${nextYear.toString().slice(-2)}`);
    }

    res.json({
      currentFinancialYear: currentFY,
      availableFinancialYears: financialYears
    });
  } catch (error) {
    console.error('Error fetching financial years:', error);
    res.status(500).json({ error: 'Failed to fetch financial years' });
  }
});

export default router;