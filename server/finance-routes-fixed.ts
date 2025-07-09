import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';
import { storage } from './storage';

const router = Router();

/**
 * Get BRC pending invoices (invoices with partial BRC or no BRC)
 */
router.get('/brc/pending', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const pendingQuery = `
      SELECT 
        i.id,
        i.invoice_number,
        i.total_amount as invoice_amount,
        i.currency,
        i.issue_date,
        i.due_date,
        c.bp_name as customer_name,
        COALESCE(SUM(brc.amount), 0) as brc_received_amount,
        (i.total_amount - COALESCE(SUM(brc.amount), 0)) as brc_pending_amount
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN bank_realization_certificates brc ON i.id = brc.related_invoice_id
      WHERE i.brc_required = true
      GROUP BY i.id, i.invoice_number, i.total_amount, i.currency, i.issue_date, i.due_date, c.bp_name
      HAVING (i.total_amount - COALESCE(SUM(brc.amount), 0)) > 0
      ORDER BY i.issue_date DESC
    `;

    const result = await pool.query(pendingQuery);
    
    console.log(`Found ${result.rows.length} invoices with pending BRC amounts`);
    console.log('Sample pending invoice data:', result.rows[0]);
    
    const pendingInvoices = result.rows.map(row => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceAmount: row.invoice_amount,
      currency: row.currency,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      customerName: row.customer_name,
      brcReceivedAmount: row.brc_received_amount,
      brcPendingAmount: row.brc_pending_amount
    }));

    console.log(`Found ${pendingInvoices.length} invoices with pending BRC amounts`);
    res.json(pendingInvoices);
  } catch (error) {
    console.error('Error getting BRC pending invoices:', error);
    res.status(500).json({ error: 'Failed to get BRC pending invoices' });
  }
});

/**
 * Get all BRCs from database
 */
router.get('/brc', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        brc.*,
        i.invoice_number,
        i.total_amount as invoice_amount,
        i.customer_id,
        c.bp_name as customer_name
      FROM bank_realization_certificates brc
      LEFT JOIN invoices i ON brc.related_invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      ORDER BY brc.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching BRCs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch BRCs',
      message: error.message
    });
  }
});

/**
 * Get overall financial dashboard data
 */
router.get('/dashboard', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Set cache control headers to prevent caching
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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
    
    // Get monthly revenue data for the last 6 months
    const monthlyRevenueQuery = `
      SELECT 
        TO_CHAR(i.issue_date, 'Mon YYYY') as month,
        COALESCE(SUM(i.total_amount), 0) as total
      FROM invoices i
      WHERE i.issue_date >= CURRENT_DATE - INTERVAL '6 months'
        AND i.status = 'Paid'
      GROUP BY 
        TO_CHAR(i.issue_date, 'Mon YYYY'),
        EXTRACT(YEAR FROM i.issue_date),
        EXTRACT(MONTH FROM i.issue_date)
      ORDER BY 
        EXTRACT(YEAR FROM i.issue_date),
        EXTRACT(MONTH FROM i.issue_date)
    `;
    
    console.log('Executing monthly revenue query...');
    let monthlyRevenueResult;
    try {
      monthlyRevenueResult = await pool.query(monthlyRevenueQuery);
      console.log('Monthly Revenue Query Result:', monthlyRevenueResult.rows);
      console.log('Monthly Revenue Query Row Count:', monthlyRevenueResult.rows.length);
    } catch (monthlyError) {
      console.error('Error in monthly revenue query:', monthlyError);
      monthlyRevenueResult = { rows: [] };
    }
    
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
      })),
      monthlyRevenue: monthlyRevenueResult.rows.map(row => ({
        month: row.month,
        total: parseFloat(row.total || '0')
      }))
    });
    
    console.log('Dashboard response includes monthlyRevenue:', !!monthlyRevenueResult.rows.length);
    console.log('Dashboard API response generated at:', new Date().toISOString());
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
          payment_date = $2,
          sap_payment_no = $3,
          payment_type = $4,
          amount = $5,
          currency = $6,
          payment_method = $7,
          notes = $8,
          is_advance_payment = $9,
          customer_id = $10,
          updated_at = NOW()
        WHERE id = $11
        RETURNING *;
      `;
      
      const paymentResult = await client.query(updatePaymentQuery, [
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
        COALESCE(SUM(outstanding_amount), 0) as "totalOutstanding",
        COALESCE(SUM(
          (SELECT SUM(amount_lc) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id)
        ), 0) as "totalInvoicedINR",
        COALESCE(SUM(
          CASE WHEN status = 'Paid' THEN 
            (SELECT SUM(amount_lc) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id)
          ELSE 0 END
        ), 0) as "totalReceivedINR"
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
        COALESCE(SUM(
          (SELECT SUM(amount_lc) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id)
        ), 0) as monthly_invoiced_inr,
        COALESCE(SUM(
          CASE WHEN status = 'Paid' THEN 
            (SELECT SUM(amount_lc) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id)
          ELSE 0 END
        ), 0) as monthly_received_inr,
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
    
    // Calculate outstanding INR using actual invoice amounts minus received amounts
    const totalOutstandingINR = (parseFloat(data.totalInvoicedINR) || 0) - (parseFloat(data.totalReceivedINR) || 0);
    
    // Format response for frontend
    const response = {
      reportDate: new Date().toISOString(),
      totalInvoiced: parseFloat(data.totalInvoiced) || 0,
      totalReceived: parseFloat(data.totalReceived) || 0,
      totalOutstanding: parseFloat(data.totalOutstanding) || 0,
      totalInvoicedINR: parseFloat(data.totalInvoicedINR) || 0,
      totalReceivedINR: parseFloat(data.totalReceivedINR) || 0,
      totalOutstandingINR: totalOutstandingINR,
      monthlyData: monthlyData.map(row => {
        const monthlyOutstandingINR = (parseFloat(row.monthly_invoiced_inr) || 0) - (parseFloat(row.monthly_received_inr) || 0);
        return {
          month: row.month_label.trim(),
          invoicedAmount: parseFloat(row.monthly_invoiced) || 0,
          receivedAmount: parseFloat(row.monthly_received) || 0,
          outstanding: parseFloat(row.monthly_outstanding) || 0,
          percentCollected: parseFloat(row.percent_collected) || 0,
          invoicedAmountINR: parseFloat(row.monthly_invoiced_inr) || 0,
          receivedAmountINR: parseFloat(row.monthly_received_inr) || 0,
          outstandingINR: monthlyOutstandingINR
        };
      })
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
        p.irm_no,
        p.payment_date,
        p.payment_method,
        p.sap_payment_no,
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
          irmNo: row.irm_no,
          paymentDate: row.payment_date,
          paymentMethod: row.payment_method,
          sapPaymentNo: row.sap_payment_no,
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

/**
 * Create a new BRC
 */
router.post('/brc', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('BRC creation request:', req.body);
    const { invoiceId, brcNumber, brcDate, bankName, amountRealized, currency, notes, documentPath } = req.body;
    
    // Validate required fields
    if (!invoiceId || !brcNumber || !brcDate || !bankName) {
      console.log('Missing required fields:', { invoiceId, brcNumber, brcDate, bankName });
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['invoiceId', 'brcNumber', 'brcDate', 'bankName']
      });
    }
    
    // Insert directly into database with correct column names including document_path
    const result = await pool.query(`
      INSERT INTO bank_realization_certificates 
      (related_invoice_id, certificate_number, issue_date, bank_name, amount, currency, notes, document_path, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `, [
      parseInt(invoiceId),
      brcNumber,
      brcDate,
      bankName,
      parseFloat(amountRealized || 0),
      currency || 'USD',
      notes || '',
      documentPath || null,
      req.user?.id || 1
    ]);
    
    // Update the invoice's brc_received status to true
    await pool.query(`
      UPDATE invoices 
      SET brc_received = true, updated_at = NOW()
      WHERE id = $1
    `, [parseInt(invoiceId)]);
    
    console.log('BRC created successfully:', result.rows[0]);
    console.log('Invoice BRC status updated to received for invoice ID:', invoiceId);
    res.status(201).json({ 
      success: true,
      brc: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error creating BRC:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create BRC',
      message: error.message
    });
  }
});

/**
 * Update an existing BRC
 */
router.put('/brc/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceId, brcNumber, brcDate, bankName, amountRealized, currency, notes, documentPath } = req.body;
    
    // Update directly in database with correct column names including document_path
    const result = await pool.query(`
      UPDATE bank_realization_certificates 
      SET related_invoice_id = $1, certificate_number = $2, issue_date = $3, bank_name = $4, 
          amount = $5, currency = $6, notes = $7, document_path = $8, updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      parseInt(invoiceId),
      brcNumber,
      brcDate,
      bankName,
      parseFloat(amountRealized),
      currency,
      notes,
      documentPath || null,
      parseInt(id)
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'BRC not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating BRC:', error);
    res.status(500).json({ 
      error: 'Failed to update BRC',
      message: error.message
    });
  }
});

/**
 * Mark invoice as domestic (BRC not required)
 */
router.put('/invoices/:id/mark-domestic', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    
    const result = await pool.query(`
      UPDATE invoices 
      SET is_export = false, brc_required = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [invoiceId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json({ 
      success: true,
      message: 'Invoice marked as domestic (BRC not required)',
      invoice: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error marking invoice as domestic:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update invoice status',
      message: error.message
    });
  }
});

/**
 * Get all invoices with customer information
 */
router.get('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        i.id,
        i.invoice_number as "invoiceNumber",
        i.customer_id as "customerId",
        i.project_id as "projectId",
        i.issue_date as "issueDate",
        i.due_date as "dueDate",
        i.total_amount as "totalAmount",
        i.currency,
        i.status,
        i.is_export as "isExport",
        i.notes,
        i.created_at as "createdAt",
        i.updated_at as "updatedAt",
        c.bp_name as "customerName",
        c.bp_code as "customerCode"
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      ORDER BY i.issue_date DESC
    `;
    
    const result = await pool.query(query);
    console.log('Found invoices in database:', result.rows.length);
    
    const invoices = result.rows.map(inv => ({
      ...inv,
      issueDate: inv.issueDate ? new Date(inv.issueDate).toISOString().split('T')[0] : null,
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : null
    }));
    
    res.json(invoices);
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      error: 'Failed to fetch invoices',
      message: error.message
    });
  }
});

/**
 * Upload BRC document to GCS
 */
router.post('/upload/gcs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Import multer and GCS Storage dynamically
    const multer = await import('multer');
    const { Storage } = await import('@google-cloud/storage');
    
    // Configure multer for memory storage
    const upload = multer.default({ storage: multer.default.memoryStorage() });
    
    // Handle the file upload
    upload.single('file')(req, res, async (err: any) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: 'File upload error' });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const { fileName, filePath } = req.body;
      
      if (!fileName || !filePath) {
        return res.status(400).json({ error: 'Missing fileName or filePath' });
      }
      
      try {
        // Initialize GCS client
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}');
        const storage = new Storage({
          credentials,
          projectId: credentials.project_id
        });
        
        const bucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
        const bucket = storage.bucket(bucketName);
        
        // Create the file path in GCS
        const gcsFileName = filePath;
        const file = bucket.file(gcsFileName);
        
        // Upload the file
        const stream = file.createWriteStream({
          metadata: {
            contentType: req.file.mimetype,
          },
        });
        
        await new Promise((resolve, reject) => {
          stream.on('error', reject);
          stream.on('finish', resolve);
          stream.end(req.file.buffer);
        });
        
        console.log(`File uploaded successfully to: ${bucketName}/${gcsFileName}`);
        
        res.json({
          success: true,
          filePath: gcsFileName,
          fileName: fileName,
          message: 'File uploaded successfully'
        });
        
      } catch (gcsError: any) {
        console.error('GCS upload error:', gcsError);
        res.status(500).json({
          error: 'Failed to upload to GCS',
          message: gcsError.message
        });
      }
    });
    
  } catch (error: any) {
    console.error('Upload endpoint error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * Invoice aging analysis
 */
router.get('/reports/invoice-aging', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Invoice aging API called with params:', req.query);
    
    const { startDate, endDate, currency } = req.query;
    
    // Build the WHERE clause for filtering
    let whereClause = '';
    const queryParams = [];
    let paramIndex = 1;
    
    if (startDate && endDate) {
      whereClause = `WHERE i.issue_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      queryParams.push(startDate, endDate);
      paramIndex += 2;
    }
    
    if (currency && currency !== 'ALL') {
      if (whereClause) {
        whereClause += ` AND i.currency = $${paramIndex}`;
      } else {
        whereClause = `WHERE i.currency = $${paramIndex}`;
      }
      queryParams.push(currency);
      paramIndex++;
    }
    
    // Query to get invoice data with outstanding amounts
    const invoicesQuery = `
      SELECT 
        i.id,
        i.invoice_number,
        i.customer_id,
        c.bp_name as customer_name,
        i.issue_date,
        i.due_date,
        i.total_amount,
        i.currency,
        COALESCE(SUM(pa.amount_applied), 0) as paid_amount
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN payment_allocations pa ON i.id = pa.invoice_id
      ${whereClause}
      GROUP BY i.id, i.invoice_number, i.customer_id, c.bp_name, 
               i.issue_date, i.due_date, i.total_amount, i.currency
      ORDER BY i.issue_date DESC
    `;
    
    console.log('Executing invoice aging query:', invoicesQuery);
    console.log('Query params:', queryParams);
    
    const invoicesResult = await pool.query(invoicesQuery, queryParams);
    const invoices = invoicesResult.rows;
      
      console.log(`Found ${invoices.length} invoices for aging analysis`);
      
      // Calculate aging buckets and customer summaries
      const agingBuckets = {
        'Current': { count: 0, amount: 0, percentage: 0 },
        '1-30 days': { count: 0, amount: 0, percentage: 0 },
        '31-60 days': { count: 0, amount: 0, percentage: 0 },
        '61-90 days': { count: 0, amount: 0, percentage: 0 },
        '91+ days': { count: 0, amount: 0, percentage: 0 }
      };
      
      const customerSummaries = {};
      let totalOutstanding = 0;
      
      const processedInvoices = invoices.map(row => {
        const outstandingAmount = parseFloat(row.total_amount) - parseFloat(row.paid_amount || 0);
        const today = new Date();
        const dueDate = new Date(row.due_date);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Determine aging bucket
        let agingBucket;
        if (daysOverdue <= 0) {
          agingBucket = 'Current';
        } else if (daysOverdue <= 30) {
          agingBucket = '1-30 days';
        } else if (daysOverdue <= 60) {
          agingBucket = '31-60 days';
        } else if (daysOverdue <= 90) {
          agingBucket = '61-90 days';
        } else {
          agingBucket = '91+ days';
        }
        
        // Update aging buckets if there's an outstanding amount
        if (outstandingAmount > 0) {
          agingBuckets[agingBucket].count++;
          agingBuckets[agingBucket].amount += outstandingAmount;
          totalOutstanding += outstandingAmount;
          
          // Update customer summary
          const customerId = row.customer_id;
          if (!customerSummaries[customerId]) {
            customerSummaries[customerId] = {
              customerId,
              customerName: row.customer_name,
              totalOutstanding: 0,
              invoiceCount: 0,
              agingBreakdown: {}
            };
          }
          
          customerSummaries[customerId].totalOutstanding += outstandingAmount;
          customerSummaries[customerId].invoiceCount++;
          
          if (!customerSummaries[customerId].agingBreakdown[agingBucket]) {
            customerSummaries[customerId].agingBreakdown[agingBucket] = 0;
          }
          customerSummaries[customerId].agingBreakdown[agingBucket] += outstandingAmount;
        }
        
        return {
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerId: row.customer_id,
          customerName: row.customer_name,
          issueDate: row.issue_date,
          dueDate: row.due_date,
          amount: parseFloat(row.total_amount),
          outstandingAmount,
          currencyCode: row.currency,
          daysOverdue,
          agingBucket
        };
      });
      
      // Calculate percentages for aging buckets
      Object.keys(agingBuckets).forEach(bucket => {
        if (totalOutstanding > 0) {
          agingBuckets[bucket].percentage = (agingBuckets[bucket].amount / totalOutstanding * 100);
        }
      });
      
      const response = {
        totalOutstanding,
        currencyCode: currency || 'USD',
        agingBuckets,
        customerSummaries: Object.values(customerSummaries),
        invoices: processedInvoices.filter(inv => inv.outstandingAmount > 0),
        paymentTrends: [
          {
            month: 'May 2025',
            avgDaysToPayment: 15,
            invoiceCount: invoices.length
          }
        ]
      };
      
    console.log("Invoice aging response:", JSON.stringify(response, null, 2));
    
    res.json(response);
  } catch (error) {
    console.error('Error generating invoice aging report:', error);
    res.status(500).json({ error: 'Failed to generate invoice aging report' });
  }
});

/**
 * Get BRC document PDF
 */
router.get('/brc/:id/document', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('🔍 BRC document request received for ID:', req.params.id);
    console.log('🔍 User authenticated:', !!req.user);
    
    const brcId = parseInt(req.params.id);
    
    if (isNaN(brcId)) {
      console.log('❌ Invalid BRC ID provided:', req.params.id);
      return res.status(400).json({ error: 'Invalid BRC ID' });
    }

    // Get BRC document path from database
    const query = `
      SELECT document_path, certificate_number 
      FROM bank_realization_certificates 
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [brcId]);
    
    if (result.rows.length === 0) {
      console.log('❌ BRC not found for ID:', brcId);
      return res.status(404).json({ error: 'BRC not found' });
    }
    
    const brc = result.rows[0];
    console.log('✅ Found BRC:', { id: brcId, documentPath: brc.document_path });
    
    if (!brc.document_path) {
      return res.status(404).json({ error: 'No document found for this BRC' });
    }

    // Import GCS client dynamically
    const { Storage } = await import('@google-cloud/storage');
    
    // Initialize Google Cloud Storage with credentials
    let storage;
    try {
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        storage = new Storage({
          projectId: credentials.project_id,
          credentials: credentials
        });
        console.log('✅ GCS client initialized with credentials');
      } else {
        console.log('❌ No Google Cloud credentials found');
        return res.status(500).json({ error: 'Storage service not configured' });
      }
    } catch (error) {
      console.error('❌ Error initializing GCS client:', error);
      return res.status(500).json({ error: 'Storage service unavailable' });
    }

    const bucketName = 'thermopac_storage';
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(brc.document_path);

    console.log('🔍 Checking file existence:', brc.document_path);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.log('❌ File not found in storage:', brc.document_path);
      return res.status(404).json({ error: 'Document file not found in storage' });
    }

    console.log('✅ File exists, getting metadata...');

    // Get file metadata to set appropriate headers
    const [metadata] = await file.getMetadata();
    
    // Set appropriate headers for PDF viewing
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${brc.certificate_number}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    
    console.log('✅ Headers set, starting file stream...');

    // Stream the file directly to the response
    const stream = file.createReadStream();
    
    stream.on('error', (error) => {
      console.error('❌ Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading document' });
      }
    });
    
    stream.on('end', () => {
      console.log('✅ File stream completed successfully');
    });
    
    stream.pipe(res);
    
  } catch (error: any) {
    console.error('❌ Error getting BRC document:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to retrieve BRC document',
        message: error.message
      });
    }
  }
});

/**
 * Get allocation history with pagination
 */
router.get('/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, paymentId, invoiceId } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let whereClause = '';
    const queryParams = [];
    let paramCount = 0;

    if (paymentId) {
      paramCount++;
      whereClause += `WHERE pa.payment_id = $${paramCount}`;
      queryParams.push(paymentId);
    }

    if (invoiceId) {
      if (whereClause) {
        paramCount++;
        whereClause += ` AND pa.invoice_id = $${paramCount}`;
      } else {
        paramCount++;
        whereClause += `WHERE pa.invoice_id = $${paramCount}`;
      }
      queryParams.push(invoiceId);
    }

    const allocationQuery = `
      SELECT 
        pa.id,
        pa.payment_id,
        pa.invoice_id,
        pa.amount,
        pa.created_at as allocation_date,
        pa.created_by,
        p.reference_number as payment_reference,
        p.amount as payment_total_amount,
        i.invoice_number,
        i.total_amount as invoice_total_amount,
        u.name as created_by_name
      FROM payment_allocations pa
      JOIN payments p ON pa.payment_id = p.id
      JOIN invoices i ON pa.invoice_id = i.id
      LEFT JOIN users u ON pa.created_by = u.id
      ${whereClause}
      ORDER BY pa.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(allocationQuery, queryParams);

    res.json({
      allocations: result.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: result.rows.length
      }
    });

  } catch (error: any) {
    console.error('Error fetching allocations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch allocations',
      message: error.message
    });
  }
});

/**
 * Update allocation amount
 */
router.put('/allocations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const userId = req.user?.id || 1;

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount. Amount must be greater than 0.' 
      });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current allocation details
      const currentAllocationQuery = `
        SELECT 
          pa.id,
          pa.payment_id,
          pa.invoice_id,
          pa.amount as current_amount,
          p.amount as payment_total_amount,
          p.allocated_amount as payment_allocated,
          i.total_amount as invoice_total,
          i.paid_amount as invoice_paid
        FROM payment_allocations pa
        JOIN payments p ON pa.payment_id = p.id
        JOIN invoices i ON pa.invoice_id = i.id
        WHERE pa.id = $1
      `;
      
      const currentResult = await client.query(currentAllocationQuery, [id]);
      
      if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Allocation not found' });
      }

      const allocation = currentResult.rows[0];
      const oldAmount = parseFloat(allocation.current_amount);
      const newAmount = parseFloat(amount);
      const amountDifference = newAmount - oldAmount;

      // Validate the new amount against payment remaining balance
      const paymentRemainingBeforeUpdate = parseFloat(allocation.payment_total_amount) - parseFloat(allocation.payment_allocated) + oldAmount;
      
      if (newAmount > paymentRemainingBeforeUpdate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient payment balance. Available: ${paymentRemainingBeforeUpdate}, Requested: ${newAmount}` 
        });
      }

      // Validate the new amount against invoice outstanding balance  
      const invoiceOutstandingBeforeUpdate = parseFloat(allocation.invoice_total) - parseFloat(allocation.invoice_paid) + oldAmount;
      
      if (newAmount > invoiceOutstandingBeforeUpdate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Amount exceeds invoice outstanding. Available: ${invoiceOutstandingBeforeUpdate}, Requested: ${newAmount}` 
        });
      }

      // Update the allocation amount
      await client.query(
        'UPDATE payment_allocations SET amount = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
        [newAmount, userId, id]
      );

      // Update payment allocated amount
      const newPaymentAllocated = parseFloat(allocation.payment_allocated) + amountDifference;
      await client.query(
        'UPDATE payments SET allocated_amount = $1, updated_at = NOW() WHERE id = $2',
        [newPaymentAllocated, allocation.payment_id]
      );

      // Update invoice paid amount
      const newInvoicePaid = parseFloat(allocation.invoice_paid) + amountDifference;
      await client.query(
        'UPDATE invoices SET paid_amount = $1, updated_at = NOW() WHERE id = $2',
        [newInvoicePaid, allocation.invoice_id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Allocation updated successfully',
        allocation: {
          id: parseInt(id),
          amount: newAmount,
          oldAmount: oldAmount,
          difference: amountDifference
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error(`Error updating allocation ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to update allocation',
      message: error.message
    });
  }
});

/**
 * Delete allocation 
 */
router.delete('/allocations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get allocation details before deletion
      const allocationQuery = `
        SELECT 
          pa.payment_id,
          pa.invoice_id,
          pa.amount,
          p.allocated_amount as payment_allocated,
          i.paid_amount as invoice_paid
        FROM payment_allocations pa
        JOIN payments p ON pa.payment_id = p.id
        JOIN invoices i ON pa.invoice_id = i.id
        WHERE pa.id = $1
      `;
      
      const result = await client.query(allocationQuery, [id]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Allocation not found' });
      }

      const allocation = result.rows[0];
      const allocationAmount = parseFloat(allocation.amount);

      // Delete the allocation
      await client.query('DELETE FROM payment_allocations WHERE id = $1', [id]);

      // Update payment allocated amount
      const newPaymentAllocated = parseFloat(allocation.payment_allocated) - allocationAmount;
      await client.query(
        'UPDATE payments SET allocated_amount = $1, updated_at = NOW() WHERE id = $2',
        [newPaymentAllocated, allocation.payment_id]
      );

      // Update invoice paid amount
      const newInvoicePaid = parseFloat(allocation.invoice_paid) - allocationAmount;
      await client.query(
        'UPDATE invoices SET paid_amount = $1, updated_at = NOW() WHERE id = $2',
        [newInvoicePaid, allocation.invoice_id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Allocation deleted successfully',
        deletedAmount: allocationAmount
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error(`Error deleting allocation ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to delete allocation',
      message: error.message
    });
  }
});

/**
 * Get monthly revenue data for dashboard
 */
router.get('/monthly-revenue', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('TEST: Executing monthly revenue query...');
    
    const monthlyRevenueQuery = `
      SELECT 
        TO_CHAR(i.issue_date, 'Mon YYYY') as month,
        COALESCE(SUM(i.total_amount), 0) as total
      FROM invoices i
      WHERE i.issue_date >= CURRENT_DATE - INTERVAL '6 months'
        AND i.status = 'Paid'
      GROUP BY 
        TO_CHAR(i.issue_date, 'Mon YYYY'),
        EXTRACT(YEAR FROM i.issue_date),
        EXTRACT(MONTH FROM i.issue_date)
      ORDER BY 
        EXTRACT(YEAR FROM i.issue_date),
        EXTRACT(MONTH FROM i.issue_date)
    `;
    
    const result = await pool.query(monthlyRevenueQuery);
    
    console.log('TEST: Monthly Revenue Result:', result.rows);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('TEST: Error in monthly revenue query:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;