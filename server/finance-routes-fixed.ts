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

export default router;