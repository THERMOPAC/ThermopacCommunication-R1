import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';

const router = Router();

/**
 * Get overall financial dashboard data
 */
router.get('/dashboard', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get invoices from database
    const invoicesQuery = `
      SELECT 
        COUNT(*) as "totalCount",
        COALESCE(SUM(total_amount), 0) as "totalAmount",
        COUNT(CASE WHEN status = 'Paid' THEN 1 END) as "paidCount",
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN total_amount ELSE 0 END), 0) as "paidAmount",
        COUNT(CASE WHEN status != 'Paid' THEN 1 END) as "unpaidCount",
        COALESCE(SUM(CASE WHEN status != 'Paid' THEN total_amount ELSE 0 END), 0) as "unpaidAmount",
        COALESCE(SUM(CASE WHEN status != 'Paid' THEN outstanding_amount ELSE 0 END), 0) as "outstandingAmount",
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'Paid' THEN 1 END) as "overdueCount",
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status != 'Paid' THEN outstanding_amount ELSE 0 END), 0) as "overdueAmount"
      FROM 
        invoices
    `;
    
    const invoiceStatsResult = await pool.query(invoicesQuery);
    const invoiceStats = invoiceStatsResult.rows[0];
    
    // Get payment stats
    const paymentsQuery = `
      SELECT 
        COUNT(*) as "totalCount",
        COALESCE(SUM(amount), 0) as "totalAmount"
      FROM 
        payments
    `;
    
    const paymentStatsResult = await pool.query(paymentsQuery);
    const paymentStats = paymentStatsResult.rows[0];
    
    // Get recent invoices
    const recentInvoicesQuery = `
      SELECT 
        i.id,
        i.invoice_number as "invoiceNumber",
        c.bp_name as "clientName",
        i.issue_date as "issueDate",
        i.due_date as "dueDate",
        i.total_amount as "amount",
        i.status
      FROM 
        invoices i
      LEFT JOIN
        customers c ON i.customer_id = c.id
      ORDER BY 
        i.issue_date DESC
      LIMIT 5
    `;
    
    const recentInvoicesResult = await pool.query(recentInvoicesQuery);

    // Get recent payments
    const recentPaymentsQuery = `
      SELECT 
        p.id,
        p.reference_number as "referenceNumber",
        p.customer_id as "customerId", 
        c.bp_name as "customerName",
        p.payment_date as "paymentDate",
        p.amount,
        p.payment_method as "paymentMethod",
        p.currency,
        CASE 
          WHEN p.unallocated_amount > 0 THEN 'Partially Allocated' 
          WHEN p.unallocated_amount = p.amount THEN 'Unallocated'
          ELSE 'Fully Allocated'
        END as "allocationStatus"
      FROM 
        payments p
      LEFT JOIN
        customers c ON p.customer_id = c.id
      ORDER BY 
        p.payment_date DESC
      LIMIT 5
    `;
    
    const recentPaymentsResult = await pool.query(recentPaymentsQuery);
    
    // Format response
    res.json({
      totalInvoices: {
        count: parseInt(invoiceStats.totalCount),
        amount: invoiceStats.totalAmount.toString()
      },
      paidInvoices: {
        count: parseInt(invoiceStats.paidCount),
        amount: invoiceStats.paidAmount.toString()
      },
      unpaidInvoices: {
        count: parseInt(invoiceStats.unpaidCount),
        amount: invoiceStats.unpaidAmount.toString()
      },
      overdueInvoices: {
        count: parseInt(invoiceStats.overdueCount),
        amount: invoiceStats.overdueAmount.toString()
      },
      totalOutstanding: {
        count: parseInt(invoiceStats.unpaidCount),
        amount: invoiceStats.outstandingAmount.toString()
      },
      totalOverdue: {
        count: parseInt(invoiceStats.overdueCount),
        amount: invoiceStats.overdueAmount.toString()
      },
      totalPayments: {
        count: parseInt(paymentStats.totalCount),
        amount: paymentStats.totalAmount.toString()
      },
      recentInvoices: recentInvoicesResult.rows.map(row => ({
        ...row,
        issueDate: row.issueDate ? new Date(row.issueDate).toISOString().split('T')[0] : '',
        dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : '',
        amount: row.amount ? row.amount.toString() : '0.00'
      })),
      latestPayments: recentPaymentsResult.rows.map(row => ({
        ...row,
        paymentDate: row.paymentDate ? new Date(row.paymentDate).toISOString().split('T')[0] : '',
        amount: row.amount ? row.amount.toString() : '0.00'
      }))
    });
  } catch (error) {
    console.error('Error retrieving dashboard data:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve dashboard data',
      details: error instanceof Error ? error.message : String(error) 
    });
  }
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
          p.notes AS "notes",
          c.bp_name AS "customerName",
          -- Include original field names as well for better compatibility
          p.sap_payment_no,
          p.notes
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
  console.log('Update payload:', JSON.stringify(req.body, null, 2));
  
  try {
    const client = await pool.connect();
    try {
      // Handle both camelCase and snake_case properties
      // Use the property that exists, with snake_case as preference
      const body = req.body;
      
      // Extract payment data - check both naming formats with fallbacks to existing data
      const reference_number = body.referenceNumber || body.reference || '';
      const irm_no = body.irmNo || body.irm_no || body.paymentNumber || '';
      const payment_date = body.paymentDate || body.payment_date || new Date().toISOString().split('T')[0];
      
      // Special handling for SAP Payment No which is known to have issues
      // Make sure to check all possible property formats
      const sap_payment_no = body.sapPaymentNo !== undefined ? body.sapPaymentNo : 
                           (body.sap_payment_no !== undefined ? body.sap_payment_no : '');
      console.log('SAP Payment No found in request:', sap_payment_no);
      
      const payment_type = body.paymentType || body.payment_type || 'Service';
      const amount = body.amount || '0.00';
      const currency = body.currency || 'USD';
      const payment_method = body.paymentMethod || body.payment_method || '';
      
      // Special handling for Notes field which is known to have issues
      // Make sure to check if the field exists before assuming it's empty
      const notes = body.notes !== undefined ? body.notes : '';
      console.log('Notes found in request:', notes);
      
      const is_advance_payment = body.isAdvancePayment !== undefined ? body.isAdvancePayment : 
                               (body.is_advance_payment !== undefined ? body.is_advance_payment : false);
      const customer_id = body.customerId || body.customer_id || null;
      
      console.log('Extracted payment data for update:', {
        reference_number, irm_no, payment_date, sap_payment_no, 
        payment_type, amount, currency, payment_method, notes,
        is_advance_payment, customer_id
      });
      
      // Begin transaction
      await client.query('BEGIN');
      
      // Get existing payment to preserve values we don't want to change
      const getPaymentQuery = `
        SELECT * FROM payments WHERE id = $1
      `;
      const existingPaymentResult = await client.query(getPaymentQuery, [paymentId]);
      
      if (existingPaymentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Payment not found' });
      }
      
      const existingPayment = existingPaymentResult.rows[0];
      console.log('Existing payment:', existingPayment);
      
      // Update payment record - preserving data if not provided in update
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
        reference_number || existingPayment.reference_number,
        irm_no || existingPayment.irm_no,
        payment_date || existingPayment.payment_date,
        sap_payment_no || existingPayment.sap_payment_no,
        payment_type || existingPayment.payment_type,
        amount || existingPayment.amount,
        currency || existingPayment.currency,
        payment_method || existingPayment.payment_method,
        notes || existingPayment.notes,
        is_advance_payment !== undefined ? is_advance_payment : existingPayment.is_advance_payment,
        customer_id || existingPayment.customer_id,
        paymentId
      ]);
      
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
      res.status(500).json({ message: 'Database error occurred while updating the payment', error: dbError.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'An error occurred while processing the payment update', error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * Direct access to payment fields in their original database format
 * This helps client applications get the raw field values from the database
 */
router.get('/payments/:id/direct-fields', ensureAuthenticated, async (req: Request, res: Response) => {
  const paymentId = parseInt(req.params.id);
  
  try {
    const client = await pool.connect();
    try {
      // Simple query that returns all fields with original database column names
      const query = `
        SELECT * FROM payments WHERE id = $1
      `;
      
      const result = await client.query(query, [paymentId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Payment not found' });
      }
      
      res.json({
        payment: result.rows[0]
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error retrieving payment direct fields:', error);
    res.status(500).json({ message: 'Failed to retrieve payment fields' });
  }
});

export default router;