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
        p.irm_no as "referenceNumber",
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
          p.irm_no AS reference,
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
          p.irm_no AS reference,
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
      const irm_no = body.referenceNumber || body.reference || body.irmNo || body.irm_no || body.paymentNumber || '';
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
        irm_no, irm_no, payment_date, sap_payment_no, 
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
          irm_no = $1,
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
        irm_no || existingPayment.irm_no,
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

/**
 * Test endpoint to generate payment reference number
 */
router.get('/test/payment-reference', ensureAuthenticated, (req: Request, res: Response) => {
  // Get date from query parameter or use current date
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  
  // Calculate Indian financial year (April to March)
  const month = date.getMonth(); // 0-11 (0 = January)
  const year = date.getFullYear();
  
  // If month is January to March (0-2), use previous year as starting year
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  
  // Format as YY-ZZ (e.g. "2526" for 2025-2026)
  const financialYear = startYear.toString().slice(-2) + endYear.toString().slice(-2);
  
  // Get the latest payment reference number for this financial year
  pool.query(
    'SELECT irm_no FROM payments WHERE irm_no LIKE $1 ORDER BY irm_no DESC LIMIT 1',
    [`PAY-${financialYear}-%`]
  ).then(result => {
    let nextSequence = 1;
    
    if (result.rows.length > 0) {
      const latestRef = result.rows[0].irm_no;
      console.log(`Found latest payment reference: ${latestRef}`);
      
      // Extract sequence number from PAY-YYZZ-XXX format
      const sequenceMatch = latestRef.match(/PAY-\d{4}-(\d{3})/);
      if (sequenceMatch && sequenceMatch[1]) {
        nextSequence = parseInt(sequenceMatch[1], 10) + 1;
      }
    }
    
    // Format with leading zeros (3 digits)
    const sequenceStr = nextSequence.toString().padStart(3, '0');
    const referenceNumber = `PAY-${financialYear}-${sequenceStr}`;
    
    console.log(`Generated payment reference number: ${referenceNumber}`);
    res.json({ referenceNumber });
  }).catch(error => {
    console.error('Error getting latest payment reference:', error);
    
    // Fallback with sequence 001
    const referenceNumber = `PAY-${financialYear}-001`;
    res.json({ referenceNumber });
  });
});

/**
 * Generate payment reference number based on date
 * This uses the same implementation approach as the successful invoice number generation
 */
router.get('/generate-payment-reference', ensureAuthenticated, (req: Request, res: Response) => {
  // Get date from query parameter or use current date
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  
  // Calculate Indian financial year (April to March)
  const month = date.getMonth(); // 0-11 (0 = January)
  const year = date.getFullYear();
  
  // If month is January to March (0-2), use previous year as starting year
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  
  // Format as YY-ZZ (e.g. "2526" for 2025-2026)
  const financialYear = startYear.toString().slice(-2) + endYear.toString().slice(-2);
  
  // Get the latest payment reference number for this financial year
  pool.query(
    'SELECT irm_no FROM payments WHERE irm_no LIKE $1 ORDER BY irm_no DESC LIMIT 1',
    [`PAY-${financialYear}-%`]
  ).then(result => {
    let nextSequence = 1;
    
    if (result.rows.length > 0) {
      const latestRef = result.rows[0].irm_no;
      console.log(`Found latest payment reference: ${latestRef}`);
      
      // Extract sequence number from PAY-YYZZ-XXX format
      const sequenceMatch = latestRef.match(/PAY-\d{4}-(\d{3})/);
      if (sequenceMatch && sequenceMatch[1]) {
        nextSequence = parseInt(sequenceMatch[1], 10) + 1;
      }
    }
    
    // Format with leading zeros (3 digits)
    const sequenceStr = nextSequence.toString().padStart(3, '0');
    const referenceNumber = `PAY-${financialYear}-${sequenceStr}`;
    
    console.log(`Generated payment reference number: ${referenceNumber}`);
    res.json({ referenceNumber });
  }).catch(error => {
    console.error('Error getting latest payment reference:', error);
    
    // Fallback with sequence 001
    const referenceNumber = `PAY-${financialYear}-001`;
    res.json({ referenceNumber });
  });
});

// Working Turnover Report Endpoint with authentic database queries
router.get('/reports/turnover-direct', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, currency } = req.query;
    
    console.log('🎯 DIRECT TURNOVER with dates:', { startDate, endDate, currency });
    
    // Build query conditions
    let whereConditions = ['1=1'];
    let queryParams: any[] = [];
    let paramIndex = 1;
    
    if (startDate && endDate) {
      whereConditions.push(`issue_date >= $${paramIndex} AND issue_date <= $${paramIndex + 1}`);
      queryParams.push(startDate, endDate);
      paramIndex += 2;
      console.log('✅ APPLYING DATE FILTER:', { startDate, endDate });
    }
    
    if (currency && currency !== 'all') {
      whereConditions.push(`currency = $${paramIndex}`);
      queryParams.push(currency);
      paramIndex++;
    }
    
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    
    // Use same successful query pattern as finance dashboard
    const query = `
      SELECT 
        COUNT(*) as "totalCount",
        COALESCE(SUM(total_amount), 0) as "totalInvoiced",
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN total_amount ELSE 0 END), 0) as "totalReceived",
        COALESCE(SUM(outstanding_amount), 0) as "totalOutstanding"
      FROM invoices ${whereClause}
    `;
    
    console.log('🔍 EXECUTING DIRECT QUERY:', query);
    console.log('📋 WITH PARAMS:', queryParams);
    
    const result = await pool.query(query, queryParams);
    const data = result.rows[0];
    
    console.log('📊 DIRECT RESULT:', data);
    
    // Get monthly breakdown data
    const monthlyQuery = `
      SELECT 
        EXTRACT(YEAR FROM issue_date) as year,
        EXTRACT(MONTH FROM issue_date) as month,
        TO_CHAR(issue_date, 'Month YYYY') as month_label,
        COALESCE(SUM(total_amount), 0) as monthly_invoiced,
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN total_amount ELSE 0 END), 0) as monthly_received,
        COALESCE(SUM(outstanding_amount), 0) as monthly_outstanding,
        CASE 
          WHEN SUM(total_amount) > 0 
          THEN ROUND((SUM(CASE WHEN status = 'Paid' THEN total_amount ELSE 0 END) * 100.0 / SUM(total_amount)), 2)
          ELSE 0 
        END as percent_collected
      FROM invoices ${whereClause}
      GROUP BY EXTRACT(YEAR FROM issue_date), EXTRACT(MONTH FROM issue_date), TO_CHAR(issue_date, 'Month YYYY')
      ORDER BY year, month
    `;
    
    console.log('📅 MONTHLY QUERY:', monthlyQuery);
    const monthlyResult = await pool.query(monthlyQuery, queryParams);
    const monthlyData = monthlyResult.rows;
    
    console.log('📅 MONTHLY DATA:', monthlyData);
    
    // Format response for frontend
    const response = {
      reportDate: new Date().toISOString(),
      totalInvoiced: parseFloat(data.totalInvoiced) || 0,
      totalReceived: parseFloat(data.totalReceived) || 0,
      totalOutstanding: parseFloat(data.totalOutstanding) || 0,
      totalInvoicedINR: (parseFloat(data.totalInvoiced) || 0) * 85.413325,
      totalReceivedINR: (parseFloat(data.totalReceived) || 0) * 85.413325,
      totalOutstandingINR: (parseFloat(data.totalOutstanding) || 0) * 85.413325,
      monthlyData: monthlyData.map(row => ({
        month: row.month_label.trim(),
        invoicedAmount: parseFloat(row.monthly_invoiced) || 0,
        receivedAmount: parseFloat(row.monthly_received) || 0,
        outstanding: parseFloat(row.monthly_outstanding) || 0,
        percentCollected: parseFloat(row.percent_collected) || 0,
        invoicedAmountINR: (parseFloat(row.monthly_invoiced) || 0) * 85.413325,
        receivedAmountINR: (parseFloat(row.monthly_received) || 0) * 85.413325,
        outstandingINR: (parseFloat(row.monthly_outstanding) || 0) * 85.413325
      }))
    };
    
    console.log('📤 SENDING DIRECT RESPONSE:', response);
    res.json(response);
    
  } catch (error) {
    console.error('❌ DIRECT TURNOVER ERROR:', error);
    res.status(500).json({ error: 'Failed to generate turnover report' });
  }
});

// Get existing payment-invoice allocations to prevent duplicate selections
router.get('/payment-invoice-links', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT payment_id, invoice_id, amount_applied, created_at
      FROM payment_invoice_links
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      links: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching payment-invoice links:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch payment-invoice links' 
    });
  }
});

// Enhanced payment details with allocation breakdown
router.get('/payments/:id/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id);
    
    const query = `
      SELECT 
        pil.amount_applied,
        pil.created_at,
        i.id as invoice_id,
        i.invoice_number,
        i.total_amount as invoice_total,
        i.status as invoice_status,
        i.issue_date,
        i.due_date,
        i.currency,
        c.bp_name as customer_name
      FROM payment_invoice_links pil
      JOIN invoices i ON pil.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE pil.payment_id = $1
      ORDER BY pil.created_at DESC
    `;
    
    const result = await pool.query(query, [paymentId]);
    
    res.json({
      success: true,
      paymentId: paymentId,
      allocations: result.rows.map(row => ({
        amountApplied: parseFloat(row.amount_applied),
        allocationDate: row.created_at,
        invoice: {
          id: row.invoice_id,
          invoiceNumber: row.invoice_number,
          totalAmount: parseFloat(row.invoice_total),
          status: row.invoice_status,
          issueDate: row.issue_date,
          dueDate: row.due_date,
          currency: row.currency,
          customerName: row.customer_name
        }
      }))
    });
    
  } catch (error) {
    console.error('Error fetching payment allocations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch payment allocations' 
    });
  }
});

// Enhanced invoice allocation details endpoint
router.get('/invoices/:id/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    
    const query = `
      SELECT 
        pil.amount_applied,
        pil.created_at,
        p.id as payment_id,
        p.payment_number,
        p.payment_date,
        p.payment_method,
        p.reference,
        p.currency,
        c.bp_name as customer_name
      FROM payment_invoice_links pil
      JOIN payments p ON pil.payment_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE pil.invoice_id = $1
      ORDER BY pil.created_at DESC
    `;
    
    const result = await pool.query(query, [invoiceId]);
    
    res.json({
      success: true,
      invoiceId: invoiceId,
      allocations: result.rows.map(row => ({
        amountApplied: parseFloat(row.amount_applied),
        allocationDate: row.created_at,
        payment: {
          id: row.payment_id,
          paymentNumber: row.payment_number,
          paymentDate: row.payment_date,
          paymentMethod: row.payment_method,
          reference: row.reference,
          currency: row.currency,
          customerName: row.customer_name
        }
      }))
    });
    
  } catch (error) {
    console.error('Error fetching invoice allocations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch invoice allocations' 
    });
  }
});

export default router;