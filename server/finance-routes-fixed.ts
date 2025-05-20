import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';

const router = Router();

/**
 * Get overall financial dashboard data
 */
router.get('/dashboard', ensureAuthenticated, (req: Request, res: Response) => {
  res.json({
    totalInvoices: {
      count: 0,
      amount: "0.00"
    },
    paidInvoices: {
      count: 0,
      amount: "0.00"
    },
    unpaidInvoices: {
      count: 0,
      amount: "0.00"
    },
    overdueInvoices: {
      count: 0,
      amount: "0.00"
    },
    totalPayments: {
      count: 0,
      amount: "0.00"
    },
    recentInvoices: [],
    recentPayments: []
  });
});

/**
 * Get payment details by ID
 */
router.get('/payments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  const paymentId = parseInt(req.params.id);
  
  try {
    const client = await pool.connect();
    try {
      // Query for the payment details
      const paymentQuery = `
        SELECT 
          p.id, 
          p.payment_date AS "paymentDate",
          p.irm_no AS "paymentNumber",
          p.payment_type AS "paymentType",
          p.payment_method AS "paymentMethod",
          p.sap_payment_no AS "sapPaymentNo",
          p.reference_number AS reference,
          p.currency,
          p.amount,
          p.is_advance_payment AS "isAdvancePayment",
          p.customer_id AS "customerId",
          p.unallocated_amount AS "unallocatedAmount",
          p.allocated_amount AS "allocatedAmount",
          p.notes,
          c.bp_name AS "customerName"
        FROM 
          payments p
        JOIN 
          customers c ON p.customer_id = c.id
        WHERE 
          p.id = $1
      `;
      
      const paymentResult = await client.query(paymentQuery, [paymentId]);
      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      
      const payment = paymentResult.rows[0];
      
      // Get allocations for this payment with simplified query to avoid column name issues
      const allocationsQuery = `
        SELECT 
          pa.id,
          pa.invoice_id AS "invoiceId",
          pa.amount_applied AS "amountApplied",
          i.invoice_number AS "invoiceNumber",
          i.invoice_type AS "invoiceType",
          i.total_amount AS "invoiceAmount"
        FROM 
          payment_allocations pa
        JOIN 
          invoices i ON pa.invoice_id = i.id
        WHERE 
          pa.payment_id = $1
      `;
      
      const allocationsResult = await client.query(allocationsQuery, [paymentId]);
      
      // Format values for frontend
      res.json({
        payment: {
          ...payment,
          amount: payment.amount ? payment.amount.toString() : "0.00",
          unallocatedAmount: payment.unallocatedAmount ? payment.unallocatedAmount.toString() : "0.00",
          allocatedAmount: payment.allocatedAmount ? payment.allocatedAmount.toString() : "0.00"
        },
        allocations: allocationsResult.rows.map(row => ({
          ...row,
          invoiceDate: new Date().toISOString(), // Use current date as fallback
          amountApplied: row.amountApplied ? row.amountApplied.toString() : "0.00",
          invoiceAmount: row.invoiceAmount ? row.invoiceAmount.toString() : "0.00"
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve payment details', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get all payments
 */
router.get('/payments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          p.id, 
          p.payment_date AS "paymentDate",
          p.irm_no AS "paymentNumber",
          p.payment_type AS "paymentType",
          p.payment_method AS "paymentMethod",
          p.reference_number AS reference,
          p.currency,
          p.amount,
          p.is_advance_payment AS "isAdvancePayment",
          p.customer_id AS "customerId",
          p.unallocated_amount AS "unallocatedAmount",
          p.allocated_amount AS "allocatedAmount",
          c.bp_name AS "customerName"
        FROM 
          payments p
        LEFT JOIN 
          customers c ON p.customer_id = c.id
        ORDER BY 
          p.payment_date DESC
      `;
      
      const result = await client.query(query);
      
      res.json({
        payments: result.rows.map(payment => ({
          ...payment,
          amount: payment.amount.toString(),
          unallocatedAmount: payment.unallocatedAmount.toString(),
          allocatedAmount: payment.allocatedAmount.toString()
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to retrieve payments' });
  }
});

/**
 * Special update endpoint for payment form data - handles both camelCase and snake_case formats
 */
router.post('/payments/update/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  const paymentId = parseInt(req.params.id);
  console.log('Updating payment with ID:', paymentId);
  console.log('Update payload:', req.body);
  
  try {
    const client = await pool.connect();
    try {
      // Handle both camelCase and snake_case properties
      // Use the property that exists, with snake_case as preference
      const body = req.body;
      
      // Extract payment data - check both naming formats
      const reference_number = body.reference_number || body.reference || '';
      const irm_no = body.irm_no || body.paymentNumber || '';
      const payment_date = body.payment_date || body.paymentDate || new Date().toISOString().split('T')[0];
      const sap_payment_no = body.sap_payment_no || body.sapPaymentNo || '';
      const payment_type = body.payment_type || body.paymentType || 'Service';
      const amount = body.amount || '0.00';
      const currency = body.currency || 'USD';
      const payment_method = body.payment_method || body.paymentMethod || '';
      const notes = body.notes || '';
      const is_advance_payment = body.is_advance_payment !== undefined ? body.is_advance_payment : 
                                (body.isAdvancePayment !== undefined ? body.isAdvancePayment : false);
      const customer_id = body.customer_id || body.customerId || null;
      
      console.log('Extracted payment data:', {
        reference_number, irm_no, payment_date, sap_payment_no, 
        payment_type, amount, currency, payment_method, notes,
        is_advance_payment, customer_id
      });
      
      // Begin transaction
      await client.query('BEGIN');
      
      // Update payment record
      const updatePaymentQuery = `
        UPDATE payments 
        SET 
          reference_number = $1,
          irm_no = $2,
          payment_date = $3,
          sap_payment_no = $4,
          payment_type = $5,
          amount = $6,
          currency = $7,
          payment_method = $8,
          notes = $9,
          is_advance_payment = $10,
          customer_id = $11,
          updated_at = NOW()
        WHERE id = $12
        RETURNING *;
      `;
      
      const paymentResult = await client.query(updatePaymentQuery, [
        reference_number,
        irm_no,
        payment_date,
        sap_payment_no,
        payment_type,
        amount,
        currency,
        payment_method,
        notes,
        is_advance_payment,
        customer_id,
        paymentId
      ]);
      
      if (paymentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Payment not found' });
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      // Format the response
      const updatedPayment = paymentResult.rows[0];
      console.log('Payment updated successfully:', updatedPayment);
      
      res.json({ 
        success: true, 
        message: 'Payment updated successfully',
        payment: updatedPayment
      });
    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('Database error updating payment:', dbError);
      res.status(500).json({ message: 'Database error occurred while updating the payment' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'An error occurred while processing the payment update' });
  }
});

export default router;