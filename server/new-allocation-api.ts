import { Router, Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';

export const newAllocationApi = Router();

/**
 * Allocate payment to invoices
 */
newAllocationApi.post('/allocate', ensureAuthenticated, async (req: Request, res: Response) => {
  // Start a database transaction
  const client = await pool.connect();
  
  try {
    // Extract the payment ID and allocations from the request body
    const { paymentId, invoices } = req.body;
    
    if (!paymentId || !invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid request body' });
    }
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Get payment details
    const paymentQuery = 'SELECT * FROM payments WHERE id = $1';
    const paymentResult = await client.query(paymentQuery, [paymentId]);
    
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    const paymentRemainingAmount = payment.remaining_amount || payment.amount - (payment.allocated_amount || 0);
    
    // Calculate total allocation amount
    const totalAllocationAmount = invoices.reduce((sum, inv) => sum + inv.allocationAmount, 0);
    
    // Check if total allocation exceeds remaining payment amount
    if (totalAllocationAmount > paymentRemainingAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Total allocation (${totalAllocationAmount}) exceeds remaining payment amount (${paymentRemainingAmount})` 
      });
    }
    
    // Process each invoice allocation
    for (const allocation of invoices) {
      // Get invoice details
      const invoiceQuery = 'SELECT * FROM invoices WHERE id = $1';
      const invoiceResult = await client.query(invoiceQuery, [allocation.invoiceId]);
      
      if (invoiceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: `Invoice with ID ${allocation.invoiceId} not found` });
      }
      
      const invoice = invoiceResult.rows[0];
      
      // Verify payment type matches invoice type
      if (payment.payment_type !== invoice.invoice_type) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Payment type (${payment.payment_type}) does not match invoice type (${invoice.invoice_type})` 
        });
      }
      
      // Check if allocation amount exceeds outstanding amount
      const outstandingAmount = invoice.outstanding_amount || invoice.total_amount - (invoice.paid_amount || 0);
      
      if (allocation.allocationAmount > outstandingAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Allocation amount (${allocation.allocationAmount}) for invoice ${invoice.invoice_number} exceeds outstanding amount (${outstandingAmount})` 
        });
      }
      
      // Insert allocation record - only using columns that exist in the actual table
      const allocationQuery = `
        INSERT INTO payment_allocations 
        (payment_id, invoice_id, amount_applied, created_at) 
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `;
      
      await client.query(allocationQuery, [
        paymentId, 
        allocation.invoiceId, 
        allocation.allocationAmount
      ]);
      
      // Update invoice paid and outstanding amounts
      const updateInvoiceQuery = `
        UPDATE invoices 
        SET 
          paid_amount = COALESCE(paid_amount, 0) + $1,
          outstanding_amount = total_amount - (COALESCE(paid_amount, 0) + $1),
          status = CASE
            WHEN (total_amount - (COALESCE(paid_amount, 0) + $1)) <= 0 THEN 'Paid'
            WHEN (COALESCE(paid_amount, 0) + $1) > 0 THEN 'Partially Paid'
            ELSE status
          END
        WHERE id = $2
      `;
      
      await client.query(updateInvoiceQuery, [allocation.allocationAmount, allocation.invoiceId]);
    }
    
    // Update payment allocated and remaining amounts
    const updatePaymentQuery = `
      UPDATE payments 
      SET 
        allocated_amount = COALESCE(allocated_amount, 0) + $1,
        remaining_amount = amount - (COALESCE(allocated_amount, 0) + $1),
        status = CASE
          WHEN (amount - (COALESCE(allocated_amount, 0) + $1)) <= 0 THEN 'Fully Allocated'
          WHEN (COALESCE(allocated_amount, 0) + $1) > 0 THEN 'Partially Allocated'
          ELSE status
        END
      WHERE id = $2
    `;
    
    await client.query(updatePaymentQuery, [totalAllocationAmount, paymentId]);
    
    // Commit the transaction
    await client.query('COMMIT');
    
    // Send success response
    res.json({ 
      success: true, 
      message: 'Payment allocated successfully',
      totalAllocated: totalAllocationAmount
    });
    
  } catch (error) {
    // Roll back the transaction if any error occurs
    await client.query('ROLLBACK');
    
    console.error('Error allocating payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to allocate payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    // Release the client back to the pool
    client.release();
  }
});