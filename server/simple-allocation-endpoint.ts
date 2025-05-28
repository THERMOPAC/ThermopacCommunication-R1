import { Router } from 'express';
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { storage } from './storage';

const router = Router();

// Simple allocation endpoint that works with the existing database setup
router.post('/allocate-payment', async (req: Request, res: Response) => {
  try {
    const { paymentId, invoiceId, amount } = req.body;
    
    // Validate input
    if (!paymentId || !invoiceId || !amount) {
      return res.status(400).json({ error: 'Payment ID, Invoice ID, and amount are required' });
    }
    
    const allocationAmount = parseFloat(amount.toString());
    if (allocationAmount <= 0) {
      return res.status(400).json({ error: 'Allocation amount must be greater than 0' });
    }

    console.log(`Processing allocation: Payment ${paymentId} → Invoice ${invoiceId}, Amount: ${allocationAmount}`);
    
    // First, check current payment state to prevent over-allocation
    const currentPayment = await storage.db.execute(
      sql`SELECT amount, COALESCE(allocated_amount, 0) as allocated_amount, 
          COALESCE(unallocated_amount, amount) as unallocated_amount 
          FROM payments WHERE id = ${paymentId}`
    );
    
    if (currentPayment.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = currentPayment.rows[0] as any;
    const availableAmount = Number(payment.unallocated_amount);
    
    if (allocationAmount > availableAmount) {
      return res.status(400).json({ 
        error: `Allocation amount (${allocationAmount}) exceeds available payment amount (${availableAmount})` 
      });
    }
    
    // Insert allocation record first
    await storage.db.execute(
      sql`INSERT INTO payment_invoice_links (payment_id, invoice_id, amount_applied, created_at)
          VALUES (${paymentId}, ${invoiceId}, ${allocationAmount}, NOW())`
    );
    
    // Update payment amounts based on payment_invoice_links table (single source of truth)
    console.log(`Updating payment ${paymentId} amounts after allocation of ${allocationAmount}`);
    
    const updateResult = await storage.db.execute(
      sql`UPDATE payments SET 
        allocated_amount = (
          SELECT COALESCE(SUM(amount_applied), 0) 
          FROM payment_invoice_links 
          WHERE payment_id = ${paymentId}
        ),
        unallocated_amount = amount - (
          SELECT COALESCE(SUM(amount_applied), 0) 
          FROM payment_invoice_links 
          WHERE payment_id = ${paymentId}
        ),
        updated_at = NOW()
        WHERE id = ${paymentId}`
    );
    
    console.log(`Payment ${paymentId} update result:`, updateResult);
    
    // Update invoice amounts
    await storage.db.execute(
      sql`UPDATE invoices SET 
        paid_amount = COALESCE(paid_amount, 0) + ${allocationAmount},
        outstanding_amount = total_amount - (COALESCE(paid_amount, 0) + ${allocationAmount}),
        status = CASE 
          WHEN (total_amount - (COALESCE(paid_amount, 0) + ${allocationAmount})) <= 0 THEN 'Paid'
          WHEN (COALESCE(paid_amount, 0) + ${allocationAmount}) > 0 THEN 'Partially Paid'
          ELSE status 
        END,
        updated_at = NOW()
        WHERE id = ${invoiceId}`
    );
    
    console.log(`✅ Successfully allocated ${allocationAmount} from payment ${paymentId} to invoice ${invoiceId}`);
    
    // Return success response
    res.json({
      success: true,
      message: 'Payment allocated successfully',
      allocation: {
        paymentId,
        invoiceId,
        amount: allocationAmount
      }
    });
    
  } catch (error) {
    console.error('Error allocating payment:', error);
    res.status(500).json({ 
      error: 'Failed to allocate payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Reconcile payment amounts based on payment_invoice_links table
router.post('/reconcile-payments', async (req: Request, res: Response) => {
  try {
    // Update all payments to match their allocation records
    await storage.db.execute(
      sql`UPDATE payments SET 
        allocated_amount = (
          SELECT COALESCE(SUM(amount_applied), 0) 
          FROM payment_invoice_links 
          WHERE payment_id = payments.id
        ),
        unallocated_amount = amount - (
          SELECT COALESCE(SUM(amount_applied), 0) 
          FROM payment_invoice_links 
          WHERE payment_id = payments.id
        ),
        updated_at = NOW()`
    );
    
    res.json({ success: true, message: 'All payments reconciled successfully' });
  } catch (error) {
    console.error('Error reconciling payments:', error);
    res.status(500).json({ error: 'Failed to reconcile payments' });
  }
});

export default router;