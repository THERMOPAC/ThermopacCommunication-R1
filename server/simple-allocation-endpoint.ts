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
    
    // Calculate new allocation totals by summing all allocations for this payment (including the one just inserted)
    const allocationSumResult = await storage.db.execute(
      sql`SELECT COALESCE(SUM(amount_applied), 0) as total_allocated 
          FROM payment_invoice_links 
          WHERE payment_id = ${paymentId}`
    );
    
    const totalAllocated = Number(allocationSumResult.rows[0]?.total_allocated || 0);
    const newUnallocated = Number(payment.amount) - totalAllocated;
    
    // Update payment amounts with correct totals
    await storage.db.execute(
      sql`UPDATE payments SET 
        allocated_amount = ${totalAllocated},
        unallocated_amount = ${newUnallocated},
        updated_at = NOW()
        WHERE id = ${paymentId}`
    );
    
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

export default router;