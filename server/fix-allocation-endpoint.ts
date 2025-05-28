import express, { Request, Response } from 'express';
import { sql } from 'drizzle-orm';

const router = express.Router();

// Fixed allocation endpoint that properly updates payment amounts
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

    console.log(`🔥 FIXED ALLOCATION: Payment ${paymentId} → Invoice ${invoiceId}, Amount: ${allocationAmount}`);
    
    // Import storage here to avoid circular dependency
    const { storage } = await import('./storage');
    
    // Get current allocated amount from payment_invoice_links (single source of truth)
    const currentAllocations = await storage.db.execute(
      sql`SELECT COALESCE(SUM(amount_applied), 0) as total_allocated 
          FROM payment_invoice_links WHERE payment_id = ${paymentId}`
    );
    
    const currentPayment = await storage.db.execute(
      sql`SELECT amount FROM payments WHERE id = ${paymentId}`
    );
    
    if (currentPayment.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = currentPayment.rows[0] as any;
    const totalAmount = Number(payment.amount);
    const currentlyAllocated = Number(currentAllocations.rows[0].total_allocated);
    const availableAmount = totalAmount - currentlyAllocated;
    
    console.log(`🔥 Payment ${paymentId} state: Total: ${totalAmount}, Allocated: ${currentlyAllocated}, Available: ${availableAmount}`);
    
    if (allocationAmount > availableAmount) {
      return res.status(400).json({ 
        error: `Allocation amount (${allocationAmount}) exceeds available payment amount (${availableAmount})` 
      });
    }
    
    // Insert allocation record first
    console.log(`🔥 Creating allocation record...`);
    await storage.db.execute(
      sql`INSERT INTO payment_invoice_links (payment_id, invoice_id, amount_applied, created_at)
          VALUES (${paymentId}, ${invoiceId}, ${allocationAmount}, NOW())`
    );
    
    // Update payment amounts based on payment_invoice_links table (single source of truth)
    console.log(`🔥 Updating payment ${paymentId} amounts...`);
    
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
    
    console.log(`🔥 Payment ${paymentId} update result:`, updateResult);
    
    // Update invoice amounts
    console.log(`🔥 Updating invoice ${invoiceId} amounts...`);
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
    
    console.log(`🔥 ✅ Successfully allocated ${allocationAmount} from payment ${paymentId} to invoice ${invoiceId}`);
    
    res.json({
      success: true,
      message: 'Payment allocated successfully',
      data: {
        paymentId,
        invoiceId,
        allocationAmount,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('🔥 ❌ Allocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to allocate payment',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;