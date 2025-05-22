import express from 'express';
import type { Request, Response } from 'express';
import { pool } from './db';

// Simple authentication middleware
const ensureAuthenticated = (req: Request, res: Response, next: any) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
};

const router = express.Router();

/**
 * Simple allocation endpoint for the Basic Payment Allocation page
 */
router.post('/allocate-payment', ensureAuthenticated, async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { paymentId, invoiceId, amount } = req.body;
    
    // Validate input
    if (!paymentId || !invoiceId || !amount || amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid input data'
      });
    }
    
    // Create allocation record
    const allocationQuery = `
      INSERT INTO payment_allocations (payment_id, invoice_id, amount_applied, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id
    `;
    
    const allocationResult = await client.query(allocationQuery, [paymentId, invoiceId, amount]);
    
    // Update payment allocated amount
    const updatePaymentQuery = `
      UPDATE payments 
      SET allocated_amount = COALESCE(allocated_amount, 0) + $1,
          updated_at = NOW()
      WHERE id = $2
    `;
    
    await client.query(updatePaymentQuery, [amount, paymentId]);
    
    // Update invoice outstanding amount
    const updateInvoiceQuery = `
      UPDATE invoices 
      SET outstanding_amount = COALESCE(outstanding_amount, total_amount) - $1,
          updated_at = NOW()
      WHERE id = $2
    `;
    
    await client.query(updateInvoiceQuery, [amount, invoiceId]);
    
    await client.query('COMMIT');
    
    res.status(200).json({
      success: true,
      message: 'Payment allocated successfully',
      allocationId: allocationResult.rows[0].id
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in basic allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to allocate payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
});

export default router;