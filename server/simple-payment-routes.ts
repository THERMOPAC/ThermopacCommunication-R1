import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';

const router = Router();

/**
 * Create a new payment - simplified version
 */
router.post('/create-simple-payment', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Creating new payment (simple version):', req.body);
    
    const { 
      paymentDate, 
      sapPaymentNo,
      paymentType,
      amount, 
      currency = 'USD', 
      paymentMethod, 
      notes,
      isAdvancePayment = true,
      customerId,
      irmNo
    } = req.body;
    
    // Validate required fields
    if (!amount || !paymentDate || !customerId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Amount, payment date, and customer ID are required'
      });
    }
    
    // Basic parameter cleanup
    const cleanAmount = parseFloat(amount);
    const payDate = new Date(paymentDate);
    const customer = parseInt(customerId);
    
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount value' });
    }
    
    if (isNaN(customer)) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    
    // Insert the payment record
    const insertQuery = `
      INSERT INTO payments (
        payment_date, 
        amount, 
        currency, 
        payment_method, 
        notes,
        is_advance_payment,
        customer_id,
        created_by,
        created_at,
        updated_at,
        unallocated_amount,
        allocated_amount,
        payment_type,
        irm_no,
        sap_payment_no
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
    const now = new Date();
    const createdBy = req.user?.id || 1; // Default to user ID 1 if not available
    
    const result = await pool.query(insertQuery, [
      payDate,
      cleanAmount,
      currency,
      paymentMethod,
      notes,
      isAdvancePayment,
      customer,
      createdBy,
      now,
      now,
      cleanAmount, // Initially, unallocated amount equals the total amount
      0, // Initially, allocated amount is zero
      paymentType,
      irmNo,
      sapPaymentNo
    ]);
    
    // Get the newly created payment
    const newPayment = result.rows[0];
    
    // Update reference number to use payment ID
    const refNumber = `PAY-2526-${String(newPayment.id).padStart(3, '0')}`;
    await pool.query('UPDATE payments SET reference_number = $1 WHERE id = $2', [refNumber, newPayment.id]);
    
    // Return success with payment details
    return res.status(201).json({
      success: true,
      id: newPayment.id,
      referenceNumber: refNumber,
      message: `Payment successfully created with ID: ${newPayment.id}`
    });
  } catch (error) {
    console.error('Error in simple payment creation:', error);
    return res.status(500).json({ 
      error: 'Failed to create payment',
      details: error.message
    });
  }
});

/**
 * Get unallocated payments (payments with remaining amount to allocate)
 */
router.get('/unallocated-advances', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Fetching unallocated payments (simple version)');
    
    // Query payments with customer names
    const payments = await pool.query(`
      SELECT 
        p.*,
        c.bp_name as customer_name
      FROM 
        payments p
      LEFT JOIN 
        customers c ON p.customer_id = c.id
      WHERE 
        p.unallocated_amount > 0
      LIMIT 10
    `);
    
    console.log(`Found ${payments.rowCount} unallocated payments`);
    
    // Format the response in a consistent way
    const formattedPayments = payments.rows.map(payment => ({
      id: payment.id,
      paymentReference: payment.irm_no || `PAY-${payment.id}`,
      customerId: payment.customer_id,
      customerName: payment.customer_name || 'Unknown Customer', // Use actual customer name
      paymentDate: payment.payment_date,
      amount: parseFloat(payment.amount),
      allocatedAmount: parseFloat(payment.allocated_amount || '0'),
      remainingAmount: parseFloat(payment.unallocated_amount || '0'),
      currency: payment.currency || 'USD',
      status: parseFloat(payment.unallocated_amount) === parseFloat(payment.amount) 
        ? 'Unallocated' 
        : parseFloat(payment.unallocated_amount) > 0 
          ? 'Partially Allocated' 
          : 'Fully Allocated',
      paymentType: payment.payment_type
    }));

    // Calculate total
    const totalUnallocated = formattedPayments.reduce(
      (sum, p) => sum + p.remainingAmount, 
      0
    );
    
    return res.json({
      advances: formattedPayments,
      totalUnallocatedAmount: totalUnallocated.toFixed(2),
      count: formattedPayments.length
    });
  } catch (error) {
    console.error('Error fetching unallocated payments:', error);
    return res.json({
      advances: [],
      totalUnallocatedAmount: "0.00",
      count: 0
    });
  }
});

/**
 * Get outstanding invoices that need payment
 */
router.get('/outstanding-invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Fetching outstanding invoices (simple version)');
    
    const invoiceType = req.query.invoiceType as string;
    console.log('Filter by invoice type:', invoiceType || 'All');
    
    let query = `
      SELECT 
        i.*,
        c.bp_name as customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.outstanding_amount > 0
    `;
    
    const params: any[] = [];
    
    // Add optional filter
    if (invoiceType) {
      params.push(invoiceType);
      query += ` AND i.invoice_type = $1`;
    }
    
    query += ` LIMIT 20`;
    
    const invoices = await pool.query(query, params);
    console.log(`Found ${invoices.rowCount} outstanding invoices`);
    
    // Format the response
    const formattedInvoices = invoices.rows.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceType: invoice.invoice_type,
      invoiceDate: invoice.issue_date,
      dueDate: invoice.due_date,
      totalAmount: parseFloat(invoice.total_amount),
      paidAmount: parseFloat(invoice.total_amount) - parseFloat(invoice.outstanding_amount),
      outstandingAmount: parseFloat(invoice.outstanding_amount),
      currency: invoice.currency || 'USD',
      status: parseFloat(invoice.outstanding_amount) === parseFloat(invoice.total_amount) 
        ? 'Unpaid' 
        : parseFloat(invoice.outstanding_amount) > 0 
          ? 'Partially Paid' 
          : 'Paid',
      customerName: invoice.customer_name || 'Unknown Customer' // Use actual customer name from database
    }));
    
    // Calculate total
    const totalOutstanding = formattedInvoices.reduce(
      (sum, inv) => sum + inv.outstandingAmount, 
      0
    );
    
    return res.json({
      invoices: formattedInvoices,
      totalOutstanding: totalOutstanding.toFixed(2),
      count: formattedInvoices.length
    });
  } catch (error) {
    console.error('Error fetching outstanding invoices:', error);
    return res.json({
      invoices: [],
      totalOutstanding: "0.00",
      count: 0
    });
  }
});

/**
 * Apply a payment to invoices
 */
router.post('/payments/:id/allocate', ensureAuthenticated, async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    const paymentId = parseInt(req.params.id);
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    const { invoiceAllocations, comment } = req.body;
    
    if (!invoiceAllocations || !Array.isArray(invoiceAllocations) || invoiceAllocations.length === 0) {
      return res.status(400).json({ error: 'Invoice allocations are required' });
    }
    
    console.log(`Processing payment allocation for payment ID ${paymentId}`, 
      invoiceAllocations.map(a => `Invoice: ${a.invoiceId}, Amount: ${a.amountApplied}`));
    
    // Start transaction
    await client.query('BEGIN');
    
    // Step 1: Get payment and verify it exists
    const paymentResult = await client.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );
    
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    const totalAllocationAmount = invoiceAllocations.reduce(
      (sum, alloc) => sum + parseFloat(alloc.amountApplied.toString()), 
      0
    );
    
    // Step 2: Insert payment allocations
    const allocations = [];
    const now = new Date();
    const username = req.user?.username || 'System';
    
    for (const allocation of invoiceAllocations) {
      const invoiceId = parseInt(allocation.invoiceId.toString());
      const amountApplied = parseFloat(allocation.amountApplied.toString());
      
      // Insert allocation record
      const allocResult = await client.query(
        `INSERT INTO payment_allocations 
          (payment_id, invoice_id, amount_applied, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [paymentId, invoiceId, amountApplied, username, now]
      );
      
      // Update invoice outstanding amount
      await client.query(
        `UPDATE invoices
         SET outstanding_amount = outstanding_amount - $1,
             updated_at = $2,
             status = CASE 
               WHEN outstanding_amount - $1 <= 0 THEN 'Paid'
               ELSE 'Partially Paid'
             END
         WHERE id = $3`,
        [amountApplied, now, invoiceId]
      );
      
      allocations.push({
        id: allocResult.rows[0].id,
        paymentId,
        invoiceId,
        amountApplied
      });
    }
    
    // Update payment unallocated amount
    await client.query(
      `UPDATE payments
       SET allocated_amount = allocated_amount + $1,
           unallocated_amount = unallocated_amount - $1,
           updated_at = $2
       WHERE id = $3`,
      [totalAllocationAmount, now, paymentId]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Return success
    return res.json({
      success: true,
      message: 'Payment allocated successfully',
      allocations
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error allocating payment:', error);
    return res.status(500).json({ error: 'Failed to allocate payment' });
  } finally {
    client.release();
  }
});

export default router;