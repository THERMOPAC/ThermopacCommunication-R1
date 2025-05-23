import { Router } from 'express';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';

const router = Router();

// Simple allocation endpoint using direct SQL queries
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

    // Import the database connection
    const { db } = await import('./storage');
    
    console.log(`Processing allocation: Payment ${paymentId} → Invoice ${invoiceId}, Amount: ${allocationAmount}`);
    
    // Update payment amounts
    const paymentUpdateResult = await db.execute(sql`
      UPDATE payments
      SET 
        allocated_amount = COALESCE(allocated_amount, 0) + ${allocationAmount},
        unallocated_amount = COALESCE(unallocated_amount, amount) - ${allocationAmount},
        updated_at = NOW()
      WHERE id = ${paymentId}
      RETURNING id, allocated_amount, unallocated_amount
    `);
    
    console.log('Payment updated:', paymentUpdateResult.rows[0]);
    
    // Update invoice amounts and status
    const invoiceUpdateResult = await db.execute(sql`
      UPDATE invoices
      SET 
        paid_amount = COALESCE(paid_amount, 0) + ${allocationAmount},
        outstanding_amount = total_amount - (COALESCE(paid_amount, 0) + ${allocationAmount}),
        status = CASE 
          WHEN (total_amount - (COALESCE(paid_amount, 0) + ${allocationAmount})) <= 0 THEN 'Paid'
          WHEN (COALESCE(paid_amount, 0) + ${allocationAmount}) > 0 THEN 'Partially Paid'
          ELSE status 
        END,
        updated_at = NOW()
      WHERE id = ${invoiceId}
      RETURNING id, paid_amount, outstanding_amount, status
    `);
    
    console.log('Invoice updated:', invoiceUpdateResult.rows[0]);
    
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