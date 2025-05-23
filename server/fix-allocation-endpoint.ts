import { Router } from 'express';
import { storage } from './storage';
import type { Request, Response } from 'express';

const router = Router();

// This is the endpoint that the redesigned payment allocation page expects
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
    
    // Start transaction
    await client.query('BEGIN');
    
    // Step 1: Get payment details
    const paymentQuery = `
      SELECT id, irm_no, unallocated_amount, allocated_amount 
      FROM payments 
      WHERE id = $1
    `;
    const paymentResult = await client.query(paymentQuery, [paymentId]);
    
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    const currentUnallocated = parseFloat(payment.unallocated_amount || 0);
    
    if (currentUnallocated < allocationAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient unallocated amount. Available: ${currentUnallocated}, Requested: ${allocationAmount}` 
      });
    }
    
    // Step 2: Get invoice details
    const invoiceQuery = `
      SELECT id, invoice_number, total_amount, paid_amount, outstanding_amount 
      FROM invoices 
      WHERE id = $1
    `;
    const invoiceResult = await client.query(invoiceQuery, [invoiceId]);
    
    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];
    const currentOutstanding = parseFloat(invoice.outstanding_amount || invoice.total_amount || 0);
    
    if (currentOutstanding < allocationAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Allocation amount exceeds outstanding amount. Outstanding: ${currentOutstanding}, Requested: ${allocationAmount}` 
      });
    }
    
    // Step 3: Update payment amounts
    const updatePaymentQuery = `
      UPDATE payments
      SET 
        allocated_amount = COALESCE(allocated_amount, 0) + $1,
        unallocated_amount = COALESCE(unallocated_amount, 0) - $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING allocated_amount, unallocated_amount
    `;
    
    const updatedPayment = await client.query(updatePaymentQuery, [
      allocationAmount, 
      paymentId
    ]);
    
    // Step 4: Update invoice amounts and status
    const updateInvoiceQuery = `
      UPDATE invoices
      SET 
        paid_amount = COALESCE(paid_amount, 0) + $1,
        outstanding_amount = total_amount - (COALESCE(paid_amount, 0) + $1),
        status = CASE 
          WHEN (total_amount - (COALESCE(paid_amount, 0) + $1)) <= 0 THEN 'Paid'
          WHEN (COALESCE(paid_amount, 0) + $1) > 0 THEN 'Partially Paid'
          ELSE status 
        END,
        updated_at = NOW()
      WHERE id = $2
      RETURNING paid_amount, outstanding_amount, status
    `;
    
    const updatedInvoice = await client.query(updateInvoiceQuery, [
      allocationAmount, 
      invoiceId
    ]);
    
    // Step 5: Create allocation record (optional - for audit trail)
    const insertAllocationQuery = `
      INSERT INTO payment_allocations (payment_id, invoice_id, amount, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    
    try {
      await client.query(insertAllocationQuery, [paymentId, invoiceId, allocationAmount]);
    } catch (error) {
      // If allocation table doesn't exist, continue without creating record
      console.log('Payment allocations table not found, skipping allocation record');
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Return success response
    const response = {
      success: true,
      message: 'Payment allocated successfully',
      allocation: {
        paymentId,
        invoiceId,
        amount: allocationAmount,
        payment: {
          allocatedAmount: updatedPayment.rows[0].allocated_amount,
          unallocatedAmount: updatedPayment.rows[0].unallocated_amount
        },
        invoice: {
          paidAmount: updatedInvoice.rows[0].paid_amount,
          outstandingAmount: updatedInvoice.rows[0].outstanding_amount,
          status: updatedInvoice.rows[0].status
        }
      }
    };
    
    res.json(response);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error allocating payment:', error);
    res.status(500).json({ 
      error: 'Failed to allocate payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
});

export default router;