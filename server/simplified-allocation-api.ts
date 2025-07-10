import { Router, Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';

export const simplifiedAllocationApi = Router();

/**
 * Most basic allocation endpoint possible - allocate a single invoice payment
 */
simplifiedAllocationApi.post('/allocate-single', ensureAuthenticated, async (req: Request, res: Response) => {
  // Set content type header explicitly
  res.setHeader('Content-Type', 'application/json');
  
  const { paymentId, invoiceId, amount } = req.body;
  
  // Basic validation
  if (!paymentId || !invoiceId || !amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: paymentId, invoiceId, and amount'
    });
  }
  
  const client = await pool.connect();
  
  try {
    // Begin transaction
    await client.query('BEGIN');
    
    // 1. Get payment details
    const paymentResult = await client.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    const payment = paymentResult.rows[0];
    
    // 2. Get invoice details
    const invoiceResult = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];
    
    // 3. Validate payment type matches invoice type
    if (payment.payment_type !== invoice.invoice_type) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Payment type (${payment.payment_type}) does not match invoice type (${invoice.invoice_type})`
      });
    }
    
    // 4. Validate allocation amount
    const paymentRemaining = payment.remaining_amount || payment.amount - (payment.allocated_amount || 0);
    if (amount > paymentRemaining) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Allocation amount (${amount}) exceeds remaining payment amount (${paymentRemaining})`
      });
    }
    
    const invoiceOutstanding = invoice.outstanding_amount || invoice.total_amount - (invoice.paid_amount || 0);
    if (amount > invoiceOutstanding) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Allocation amount (${amount}) exceeds outstanding invoice amount (${invoiceOutstanding})`
      });
    }
    
    // 5. Insert allocation record - using only fields that exist in the database
    await client.query(
      'INSERT INTO payment_allocations (payment_id, invoice_id, amount_applied, created_at) VALUES ($1, $2, $3, NOW())',
      [paymentId, invoiceId, amount]
    );
    
    // 6. Update invoice
    await client.query(
      `UPDATE invoices 
       SET paid_amount = COALESCE(paid_amount, 0) + $1,
           outstanding_amount = total_amount - (COALESCE(paid_amount, 0) + $1),
           status = CASE
             WHEN (total_amount - (COALESCE(paid_amount, 0) + $1)) <= 0 THEN 'Paid'
             WHEN (COALESCE(paid_amount, 0) + $1) > 0 THEN 'Partially Paid'
             ELSE status
           END
       WHERE id = $2`,
      [amount, invoiceId]
    );
    
    // 7. Update payment
    await client.query(
      `UPDATE payments
       SET allocated_amount = COALESCE(allocated_amount, 0) + $1,
           remaining_amount = amount - (COALESCE(allocated_amount, 0) + $1),
           status = CASE
             WHEN (amount - (COALESCE(allocated_amount, 0) + $1)) <= 0 THEN 'Fully Allocated'
             WHEN (COALESCE(allocated_amount, 0) + $1) > 0 THEN 'Partially Allocated'
             ELSE status
           END
       WHERE id = $2`,
      [amount, paymentId]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Return success
    return res.status(200).json({
      success: true,
      message: 'Payment allocated successfully',
      allocation: {
        paymentId,
        invoiceId,
        amount,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    
    console.error('Error in simple allocation:', error);
    
    // Check if it's a unique constraint violation on payment_allocations
    if (error instanceof Error && error.message.includes('unique')) {
      return res.status(400).json({
        success: false,
        message: 'Unable to process allocation due to data constraints. Please verify the payment and invoice details.',
        type: 'constraint_violation'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error allocating payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
  } finally {
    // Release client
    client.release();
  }
});

/**
 * Process multiple allocations in separate transactions
 * This is safer but slower than batching them all in a single transaction
 */
simplifiedAllocationApi.post('/allocate-multiple', ensureAuthenticated, async (req: Request, res: Response) => {
  // Set content type header explicitly
  res.setHeader('Content-Type', 'application/json');
  
  const { paymentId, allocations } = req.body;
  
  // Basic validation
  if (!paymentId || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid request format. Expected paymentId and allocations array.'
    });
  }

  const results = [];
  const errors = [];
  
  for (const allocation of allocations) {
    const { invoiceId, amount } = allocation;
    
    // Skip invalid allocations
    if (!invoiceId || !amount || amount <= 0) {
      errors.push({ invoiceId, message: 'Invalid allocation data' });
      continue;
    }
    
    try {
      // For each allocation, make a separate request to the single allocation endpoint
      const response = await fetch(`${req.protocol}://${req.get('host')}/api/finance/simplified-allocations/allocate-single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': req.headers.cookie || '' // Forward cookies for authentication
        },
        body: JSON.stringify({
          paymentId,
          invoiceId,
          amount
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        results.push(data.allocation);
      } else {
        errors.push({ invoiceId, message: data.message });
      }
      
    } catch (error) {
      errors.push({ 
        invoiceId, 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  // Return combined results
  return res.json({
    success: errors.length === 0,
    message: errors.length === 0 
      ? 'All allocations processed successfully' 
      : 'Some allocations failed',
    results,
    errors: errors.length > 0 ? errors : undefined,
    totalAllocated: results.reduce((sum, r) => sum + r.amount, 0),
    successCount: results.length,
    failureCount: errors.length
  });
});