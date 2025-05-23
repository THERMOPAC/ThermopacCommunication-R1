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
    
    // Execute the database updates using raw SQL
    await storage.db.execute(
      sql`UPDATE payments SET 
        allocated_amount = COALESCE(allocated_amount, 0) + ${allocationAmount},
        unallocated_amount = COALESCE(unallocated_amount, amount) - ${allocationAmount}
        WHERE id = ${paymentId}`
    );
    
    await storage.db.execute(
      sql`UPDATE invoices SET 
        paid_amount = COALESCE(paid_amount, 0) + ${allocationAmount},
        outstanding_amount = total_amount - (COALESCE(paid_amount, 0) + ${allocationAmount}),
        status = CASE 
          WHEN (total_amount - (COALESCE(paid_amount, 0) + ${allocationAmount})) <= 0 THEN 'Paid'
          WHEN (COALESCE(paid_amount, 0) + ${allocationAmount}) > 0 THEN 'Partially Paid'
          ELSE status 
        END
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