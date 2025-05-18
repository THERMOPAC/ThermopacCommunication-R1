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
        i.status,
        CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'Paid' THEN true ELSE false END as "overdue"
      FROM 
        invoices i
      LEFT JOIN 
        customers c ON i.customer_id = c.id
      ORDER BY 
        i.issue_date DESC
      LIMIT 5
    `;
    
    const recentInvoicesResult = await pool.query(recentInvoicesQuery);
    const recentInvoices = recentInvoicesResult.rows;
    
    // Get recent payments
    const recentPaymentsQuery = `
      SELECT 
        p.id,
        p.reference_number as "referenceNumber",
        c.bp_name as "clientName",
        p.payment_date as "paymentDate",
        p.amount,
        p.payment_method as "paymentMethod",
        p.currency,
        p.notes,
        p.is_advance_payment as "isAdvancePayment",
        CASE WHEN p.unallocated_amount = p.amount THEN 'Unallocated'
             WHEN p.unallocated_amount > 0 THEN 'Partially Allocated'
             ELSE 'Fully Allocated' END as "allocationStatus",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt"
      FROM 
        payments p
      LEFT JOIN 
        customers c ON p.customer_id = c.id
      ORDER BY 
        p.payment_date DESC
      LIMIT 5
    `;
    
    const recentPaymentsResult = await pool.query(recentPaymentsQuery);
    const latestPayments = recentPaymentsResult.rows;
    
    // Get all latest invoices with details
    const latestInvoicesQuery = `
      SELECT 
        i.id,
        i.invoice_number as "invoiceNumber",
        i.customer_id as "customerId",
        i.issue_date as "issueDate",
        i.due_date as "dueDate",
        i.total_amount as "totalAmount",
        i.currency,
        i.status,
        i.notes,
        i.created_at as "createdAt",
        i.updated_at as "updatedAt"
      FROM 
        invoices i
      ORDER BY 
        i.issue_date DESC
      LIMIT 5
    `;
    
    const latestInvoicesResult = await pool.query(latestInvoicesQuery);
    const latestInvoices = latestInvoicesResult.rows;
    
    // Calculate INR amount (for marketing dashboard)
    const exchangeRate = 85.60; // USD to INR
    const invoicedAmountUSD = parseFloat(invoiceStats.totalAmount || 0);
    const invoicedAmountINR = invoicedAmountUSD * exchangeRate;
    
    // Construct the dashboard data
    const dashboardData = {
      totalInvoices: {
        count: parseInt(invoiceStats.totalCount || 0),
        amount: parseFloat(invoiceStats.totalAmount || 0).toFixed(2)
      },
      totalPaid: {
        count: parseInt(invoiceStats.paidCount || 0),
        amount: parseFloat(invoiceStats.paidAmount || 0).toFixed(2)
      },
      totalUnpaid: {
        count: parseInt(invoiceStats.unpaidCount || 0),
        amount: parseFloat(invoiceStats.unpaidAmount || 0).toFixed(2)
      },
      outstandingInvoices: {
        count: parseInt(invoiceStats.unpaidCount || 0),
        amount: parseFloat(invoiceStats.outstandingAmount || 0).toFixed(2)
      },
      overdueInvoices: {
        count: parseInt(invoiceStats.overdueCount || 0),
        amount: parseFloat(invoiceStats.overdueAmount || 0).toFixed(2)
      },
      totalOutstanding: {
        count: parseInt(invoiceStats.unpaidCount || 0),
        amount: parseFloat(invoiceStats.outstandingAmount || 0).toFixed(2)
      },
      totalOverdue: {
        count: parseInt(invoiceStats.overdueCount || 0),
        amount: parseFloat(invoiceStats.overdueAmount || 0).toFixed(2)
      },
      totalPayments: {
        count: parseInt(paymentStats.totalCount || 0),
        amount: parseFloat(paymentStats.totalAmount || 0).toFixed(2)
      },
      recentInvoices,
      latestPayments,
      latestInvoices,
      
      // For marketing dashboard
      invoicedAmountUSD,
      invoicedAmountINR,
      exchangeRate
    };
    
    res.json(dashboardData);
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

/**
 * Get all invoices
 */
router.get('/invoices', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const invoices = [
      {
        id: 1,
        invoiceNumber: "INV-2526-001",
        customerId: 1,
        issueDate: "2025-05-01",
        dueDate: "2025-05-31",
        totalAmount: "125000.00",
        tax: "10000.00",
        currency: "USD",
        status: "Paid",
        notes: "Project A Phase 1",
        createdBy: 1,
        createdAt: "2025-05-01T10:00:00Z",
        updatedAt: "2025-06-15T10:00:00Z"
      },
      {
        id: 2,
        invoiceNumber: "INV-2526-002",
        customerId: 2,
        issueDate: "2025-06-01",
        dueDate: "2025-06-30",
        totalAmount: "100000.00",
        tax: "8000.00",
        currency: "USD",
        status: "Paid",
        notes: "Project B Initial Payment",
        createdBy: 1,
        createdAt: "2025-06-01T10:00:00Z",
        updatedAt: "2025-07-22T10:00:00Z"
      },
      {
        id: 3,
        invoiceNumber: "INV-2526-003",
        customerId: 3,
        issueDate: "2025-07-01",
        dueDate: "2025-07-31",
        totalAmount: "150000.00",
        tax: "12000.00",
        currency: "USD",
        status: "Unpaid",
        notes: "Project C Full Payment",
        createdBy: 1,
        createdAt: "2025-07-01T10:00:00Z",
        updatedAt: "2025-07-01T10:00:00Z"
      },
      {
        id: 4,
        invoiceNumber: "INV-2526-004",
        customerId: 1,
        issueDate: "2025-07-15",
        dueDate: "2025-08-15",
        totalAmount: "125000.00",
        tax: "10000.00",
        currency: "USD",
        status: "Unpaid",
        notes: "Project A Phase 2",
        createdBy: 1,
        createdAt: "2025-07-15T10:00:00Z",
        updatedAt: "2025-07-15T10:00:00Z"
      },
      {
        id: 5,
        invoiceNumber: "INV-2526-005",
        customerId: 4,
        issueDate: "2025-08-01",
        dueDate: "2025-08-31",
        totalAmount: "125000.00",
        tax: "10000.00",
        currency: "USD",
        status: "Unpaid",
        notes: "Project D Initial Payment",
        createdBy: 1,
        createdAt: "2025-08-01T10:00:00Z",
        updatedAt: "2025-08-01T10:00:00Z"
      }
    ];
    
    res.json(invoices);
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

/**
 * Get an invoice by ID from the /invoices/view/:id route
 */
router.get('/invoices/view/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // Use direct database query to get the invoice
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
        i.sap_invoice_no as "sapInvoiceNo", 
        i.invoice_type as "invoiceType",
        i.notes,
        i.created_at as "createdAt", 
        i.updated_at as "updatedAt",
        i.created_by as "createdBy"
      FROM invoices i
      WHERE i.id = $1
    `;
    
    const itemsQuery = `
      SELECT 
        id,
        invoice_id as "invoiceId",
        description,
        quantity,
        unit_price as "unitPrice",
        amount,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM invoice_items
      WHERE invoice_id = $1
    `;
    
    const invoiceResult = await pool.query(query, [invoiceId]);
    
    if (!invoiceResult || !invoiceResult.rows || invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];
    
    // Format dates for frontend
    if (invoice.issueDate) {
      invoice.issueDate = new Date(invoice.issueDate).toISOString().split('T')[0];
    }
    if (invoice.dueDate) {
      invoice.dueDate = new Date(invoice.dueDate).toISOString().split('T')[0];
    }
    
    // Try to get customer name
    try {
      if (invoice.customerId) {
        const customerQuery = `SELECT bp_name FROM customers WHERE id = $1`;
        const customerResult = await pool.query(customerQuery, [invoice.customerId]);
        if (customerResult && customerResult.rows && customerResult.rows.length > 0) {
          invoice.customerName = customerResult.rows[0].bp_name;
        } else {
          invoice.customerName = `Customer ${invoice.customerId}`;
        }
      }
    } catch (customerError) {
      console.error('Error getting customer name:', customerError);
      invoice.customerName = `Customer ${invoice.customerId}`;
    }
    
    // Get invoice items
    const itemsResult = await pool.query(itemsQuery, [invoiceId]);
    const items = itemsResult.rows || [];
    
    // Return the invoice and items in the format expected by the frontend
    res.json({
      invoice: invoice,
      items: items
    });
  } catch (error) {
    console.error(`Error getting invoice view ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to get invoice',
      details: error.message
    });
  }
});

/**
 * Get a specific invoice by ID - using real database
 */
router.get('/invoices/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Use direct database query to get the invoice
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
        i.sap_invoice_no as "sapInvoiceNo", 
        i.invoice_type as "invoiceType",
        i.notes,
        i.created_at as "createdAt", 
        i.updated_at as "updatedAt",
        i.created_by as "createdBy"
      FROM invoices i
      WHERE i.id = $1
    `;
    
    const itemsQuery = `
      SELECT 
        id,
        invoice_id as "invoiceId",
        description,
        quantity,
        unit_price as "unitPrice",
        amount,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM invoice_items
      WHERE invoice_id = $1
    `;
    
    const invoiceResult = await pool.query(query, [id]);
    
    if (!invoiceResult || !invoiceResult.rows || invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];
    
    // Format dates for frontend
    if (invoice.issueDate) {
      invoice.issueDate = new Date(invoice.issueDate).toISOString().split('T')[0];
    }
    if (invoice.dueDate) {
      invoice.dueDate = new Date(invoice.dueDate).toISOString().split('T')[0];
    }
    
    // Try to get customer name
    try {
      if (invoice.customerId) {
        const customerQuery = `SELECT bp_name FROM customers WHERE id = $1`;
        const customerResult = await pool.query(customerQuery, [invoice.customerId]);
        if (customerResult && customerResult.rows && customerResult.rows.length > 0) {
          invoice.customerName = customerResult.rows[0].bp_name;
        } else {
          invoice.customerName = `Customer ${invoice.customerId}`;
        }
      }
    } catch (customerError) {
      console.error('Error getting customer name:', customerError);
      invoice.customerName = `Customer ${invoice.customerId}`;
    }
    
    // Get invoice items
    const itemsResult = await pool.query(itemsQuery, [id]);
    const items = itemsResult.rows || [];
    
    // Return the invoice and items in the format expected by the frontend
    res.json({
      invoice: invoice,
      items: items
    });
  } catch (error) {
    console.error(`Error getting invoice ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

/**
 * Get all payments
 */
router.get('/payments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Query payments from the database
    const query = `
      SELECT 
        p.id,
        p.reference_number as "referenceNumber",
        p.customer_id as "customerId",
        c.bp_name as "customerName",
        p.payment_date as "paymentDate",
        p.amount,
        p.allocated_amount as "allocatedAmount",
        p.unallocated_amount as "unallocatedAmount",
        p.payment_method as "paymentMethod",
        p.currency,
        p.notes,
        p.is_advance_payment as "isAdvancePayment",
        CASE WHEN p.unallocated_amount = p.amount THEN 'Unallocated'
             WHEN p.unallocated_amount > 0 THEN 'Partially Allocated'
             ELSE 'Fully Allocated' END as "allocationStatus",
        p.created_by as "createdBy",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt"
      FROM 
        payments p
      LEFT JOIN 
        customers c ON p.customer_id = c.id
      ORDER BY 
        p.payment_date DESC
    `;
    
    const result = await pool.query(query);
    const payments = result.rows;
    
    // Log the number of payments being returned from the database
    console.log(`Retrieved ${payments.length} payments from database`);
    
    res.json(payments);
  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

/**
 * Get unallocated advance payments for a specific customer
 */
router.get('/payments/unallocated-advances/:customerId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    console.log(`Fetching unallocated advance payments for customer ID: ${customerId}`);
    
    // Get advance payments for the specific customer with unallocated amounts
    const query = `
      SELECT 
        p.id,
        p.reference_number as "referenceNumber",
        p.customer_id as "customerId",
        c.bp_name as "customerName",
        p.payment_date as "paymentDate",
        p.amount,
        p.allocated_amount as "allocatedAmount",
        p.unallocated_amount as "unallocatedAmount",
        p.payment_method as "paymentMethod",
        p.currency,
        p.notes,
        p.is_advance_payment as "isAdvancePayment",
        CASE WHEN p.unallocated_amount = p.amount THEN 'Unallocated'
             WHEN p.unallocated_amount > 0 THEN 'Partially Allocated'
             ELSE 'Fully Allocated' END as "allocationStatus",
        p.created_by as "createdBy",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt"
      FROM 
        payments p
      JOIN 
        customers c ON p.customer_id = c.id
      WHERE 
        p.customer_id = $1
        AND p.is_advance_payment = true
        AND p.unallocated_amount > 0
      ORDER BY 
        p.payment_date DESC
    `;
    
    const result = await pool.query(query, [customerId]);
    const customerAdvances = result.rows;
    
    console.log(`Found ${customerAdvances.length} unallocated advance payments for customer ${customerId}`);
    
    // Calculate total unallocated amount
    const totalUnallocatedAmount = customerAdvances.reduce((sum, payment) => 
      sum + parseFloat(payment.unallocatedAmount), 0).toFixed(2);
    
    // Return the advances and total
    res.json({
      advances: customerAdvances,
      totalUnallocatedAmount,
      currency: customerAdvances.length > 0 ? customerAdvances[0].currency : 'USD'
    });
  } catch (error) {
    console.error(`Error getting unallocated advances for customer ${req.params.customerId}:`, error);
    res.status(500).json({ error: 'Failed to get unallocated advance payments' });
  }
});

/**
 * Create a new payment allocation (manually apply a payment to an invoice)
 */
router.post('/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { paymentId, invoiceId, amount } = req.body;
    
    if (!paymentId || !invoiceId || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide paymentId, invoiceId, and amount.' 
      });
    }
    
    // Import the payment allocation service
    const { paymentAllocationService } = require('./payment-allocation-service');
    
    // Create the allocation
    const allocation = await paymentAllocationService.allocatePaymentToInvoice(
      parseInt(paymentId),
      parseInt(invoiceId),
      parseFloat(amount),
      req.user?.id || 1
    );
    
    // Return the created allocation
    res.status(201).json(allocation);
  } catch (error: any) {
    console.error('Error creating payment allocation:', error);
    res.status(500).json({ 
      error: 'Failed to create payment allocation',
      message: error.message
    });
  }
});

/**
 * Remove a payment allocation
 */
router.delete('/allocations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Import the payment allocation service
    const { paymentAllocationService } = require('./payment-allocation-service');
    
    // Remove the allocation
    const result = await paymentAllocationService.removeAllocation(parseInt(id));
    
    // Return success message
    res.json(result);
  } catch (error: any) {
    console.error(`Error removing allocation ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to remove payment allocation',
      message: error.message
    });
  }
});

/**
 * Get a specific payment by ID
 */
router.get('/payments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id);
    console.log(`Fetching payment details for payment ID: ${paymentId}`);
    
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    // Get payment details from database
    const paymentQuery = `
      SELECT 
        p.id,
        p.reference_number as "referenceNumber",
        p.customer_id as "customerId",
        c.bp_name as "customerName",
        p.payment_date as "paymentDate",
        p.sap_invoice_no as "sapInvoiceNo",
        p.invoice_type as "invoiceType",
        p.amount,
        p.allocated_amount as "allocatedAmount",
        p.unallocated_amount as "unallocatedAmount",
        p.payment_method as "paymentMethod",
        p.currency,
        p.notes,
        p.is_advance_payment as "isAdvancePayment",
        CASE WHEN p.unallocated_amount = p.amount THEN 'Unallocated'
             WHEN p.unallocated_amount > 0 THEN 'Partially Allocated'
             ELSE 'Fully Allocated' END as "allocationStatus",
        p.created_by as "createdBy",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt"
      FROM 
        payments p
      LEFT JOIN 
        customers c ON p.customer_id = c.id
      WHERE 
        p.id = $1
    `;
    
    const paymentResult = await pool.query(paymentQuery, [paymentId]);
    
    if (!paymentResult.rows || paymentResult.rows.length === 0) {
      console.log(`Payment with ID ${paymentId} not found in database`);
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    console.log(`Found payment in database: ${payment.referenceNumber}`);
    
    // Get any invoice allocation links
    let allocations = [];
    try {
      const allocationsQuery = `
        SELECT 
          pa.id,
          pa.payment_id as "paymentId",
          pa.invoice_id as "invoiceId",
          pa.amount_applied as "amountApplied",
          pa.created_at as "createdAt",
          pa.updated_at as "updatedAt"
        FROM 
          payment_allocations pa
        WHERE 
          pa.payment_id = $1
      `;
      
      const allocationsResult = await pool.query(allocationsQuery, [paymentId]);
      allocations = allocationsResult.rows || [];
    } catch (allocErr) {
      console.log('No payment allocations found or table not yet created:', allocErr.message);
      allocations = [];
    }
    
    // Get related invoice details if there are allocations
    const invoiceLinks = [];
    
    if (allocations.length > 0) {
      try {
        for (const allocation of allocations) {
          try {
            const invoiceQuery = `
              SELECT 
                i.id,
                i.invoice_number as "invoiceNumber",
                i.customer_id as "customerId",
                i.issue_date as "issueDate", 
                i.due_date as "dueDate", 
                i.total_amount as "totalAmount",
                i.currency, 
                i.status,
                i.notes,
                i.created_by as "createdBy",
                i.created_at as "createdAt", 
                i.updated_at as "updatedAt"
              FROM 
                invoices i
              WHERE 
                i.id = $1
            `;
            
            const invoiceResult = await pool.query(invoiceQuery, [allocation.invoiceId]);
            
            if (invoiceResult.rows && invoiceResult.rows.length > 0) {
              invoiceLinks.push({
                link: allocation,
                invoice: invoiceResult.rows[0]
              });
            }
          } catch (invoiceErr) {
            console.error(`Error getting invoice detail for invoice ${allocation.invoiceId}:`, invoiceErr.message);
          }
        }
      } catch (err) {
        console.error('Error processing payment allocations:', err.message);
      }
    }
    
    // Format dates for the frontend
    if (payment.paymentDate) {
      payment.paymentDate = new Date(payment.paymentDate).toISOString().split('T')[0];
    }
    
    // Ensure amount is properly formatted as string
    if (payment.amount) {
      payment.amount = payment.amount.toString();
    }
    
    if (payment.allocatedAmount) {
      payment.allocatedAmount = payment.allocatedAmount.toString();
    }
    
    if (payment.unallocatedAmount) {
      payment.unallocatedAmount = payment.unallocatedAmount.toString();
    }
    
    // Return the payment details and any linked invoices
    const responseData = {
      payment,
      invoiceLinks
    };
    
    // Send the response
    res.json(responseData);
  } catch (error) {
    console.error(`Error getting payment ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get payment' });
  }
});

/**
 * Create a new invoice
 */
router.post('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Log the received data for debugging
    console.log('Creating invoice with data:', JSON.stringify(req.body, null, 2));
    
    // Extract data from the request body
    const { invoice, items, advancePaymentAllocations } = req.body;
    
    if (!invoice) {
      return res.status(400).json({ error: 'Invalid request body - invoice data missing' });
    }
    
    // Log advance payment allocations if present
    if (advancePaymentAllocations && advancePaymentAllocations.length > 0) {
      console.log('Processing advance payment allocations:', JSON.stringify(advancePaymentAllocations, null, 2));
    }

    // Format dates - ensure we have valid dates for required fields
    const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : new Date();
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date(new Date().setDate(new Date().getDate() + 30));
    
    // Calculate total amount from items if not provided
    const totalAmount = invoice.totalAmount || (items && items.length > 0 
                 ? items.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0) 
                 : 0);
    
    // Create invoice in database with direct query
    const insertInvoiceQuery = `
      INSERT INTO invoices (
        invoice_number, 
        customer_id, 
        project_id, 
        issue_date, 
        due_date, 
        total_amount, 
        currency, 
        status,
        sap_invoice_no,
        invoice_type,
        notes,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, invoice_number as "invoiceNumber", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const invoiceValues = [
      invoice.invoiceNumber,
      invoice.customerId,
      invoice.projectId || null,
      issueDate.toISOString().split('T')[0], // Format as YYYY-MM-DD for SQL
      dueDate.toISOString().split('T')[0], // Format as YYYY-MM-DD for SQL
      totalAmount,
      invoice.currency || 'USD',
      'Pending',
      invoice.sapInvoiceNo || null,
      invoice.invoiceType || 'Product',
      invoice.notes || null,
      req.user?.id || 1
    ];
    
    console.log('Executing SQL with values:', invoiceValues);
    const invoiceResult = await pool.query(insertInvoiceQuery, invoiceValues);
    
    if (!invoiceResult || !invoiceResult.rows || invoiceResult.rows.length === 0) {
      throw new Error('Failed to create invoice in database');
    }
    
    const newInvoice = invoiceResult.rows[0];
    const invoiceId = newInvoice.id;
    
    // Create invoice items
    if (items && items.length > 0) {
      for (const item of items) {
        const insertItemQuery = `
          INSERT INTO invoice_items (
            invoice_id,
            description,
            quantity,
            unit_price,
            amount
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `;
        
        const quantity = item.quantity || 1;
        const unitPrice = parseFloat(item.amount) / quantity;
        
        const itemValues = [
          invoiceId,
          item.description || '',
          quantity,
          unitPrice,
          parseFloat(item.amount) || 0
        ];
        
        await pool.query(insertItemQuery, itemValues);
      }
    }
    
    // Process advance payment allocations if provided
    let advancePaymentsApplied = 0;
    let totalAdvanceAmount = 0;
    
    if (advancePaymentAllocations && advancePaymentAllocations.length > 0) {
      // Filter allocations with valid amounts
      const validAllocations = advancePaymentAllocations.filter(
        allocation => allocation.amountToApply && parseFloat(allocation.amountToApply) > 0
      );
      
      advancePaymentsApplied = validAllocations.length;
      
      if (advancePaymentsApplied > 0) {
        console.log(`Processing ${advancePaymentsApplied} advance payment allocations`);
        
        // Import the payment allocation service
        const { paymentAllocationService } = require('./payment-allocation-service');
        
        try {
          // Apply advance payments using our service
          const result = await paymentAllocationService.applyAdvancePaymentsToInvoice(
            invoiceId,
            invoice.customerId,
            validAllocations.map(allocation => ({
              paymentId: allocation.paymentId,
              amountToApply: parseFloat(allocation.amountToApply)
            })),
            req.user?.id || 1
          );
          
          console.log('Applied advance payments:', result);
          
          totalAdvanceAmount = result.totalApplied;
          advancePaymentsApplied = result.allocations.length;
          
          // The service has already updated:
          // 1. Created payment allocation records
          // 2. Updated payment unallocated amounts
          // 3. Updated invoice outstanding amount
          // 4. Updated invoice status
        } catch (error) {
          console.error('Error applying advance payments:', error);
          // Continue with invoice creation even if advance payment application fails
        }
      }
    } else {
      // If no advance payments were specified but there are unallocated advances for this customer,
      // we could auto-apply them here (optionally based on a setting)
      
      // Initialize outstanding_amount to total_amount
      await pool.query(
        'UPDATE invoices SET outstanding_amount = total_amount WHERE id = $1',
        [invoiceId]
      );
    }
    
    // Log the success
    console.log('Successfully created invoice in database:', invoiceId);
    
    // Return success response with the newly created invoice data
    res.status(201).json({
      id: invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      projectId: invoice.projectId,
      issueDate: issueDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      totalAmount: totalAmount,
      currency: invoice.currency || 'USD',
      sapInvoiceNo: invoice.sapInvoiceNo || null,
      invoiceType: invoice.invoiceType || 'Product',
      status: totalAdvanceAmount >= parseFloat(totalAmount.toString()) ? 'Paid' : 'Pending',
      notes: invoice.notes || null,
      createdBy: req.user?.id || 1,
      createdAt: newInvoice.createdAt,
      updatedAt: newInvoice.updatedAt,
      // Include advance payment information in the response
      advancePaymentsApplied,
      totalAdvanceAmount,
      remainingBalance: Math.max(0, parseFloat(totalAmount.toString()) - totalAdvanceAmount)
    });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ 
      error: 'Failed to create invoice',
      details: error.message 
    });
  }
});

/**
 * Create a new payment - just return success without creating
 */
router.post('/payments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Extract data from the request
    const paymentData = req.body.payment || req.body;
    const invoiceLinks = req.body.invoiceLinks || [];
    
    // Get the authenticated user
    const userId = (req.user as any)?.id || 1;
    
    // Create a clean payment record for the database
    const payment = {
      reference_number: paymentData.referenceNumber || `PAY-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      payment_date: paymentData.paymentDate,
      sap_payment_no: paymentData.sapPaymentNo || null,
      payment_type: paymentData.paymentType || 'Product',
      amount: parseFloat(paymentData.amount),
      currency: paymentData.currency || "USD",
      payment_method: paymentData.paymentMethod,
      notes: paymentData.notes || null,
      is_advance_payment: paymentData.isAdvancePayment || false,
      allocated_amount: 0.00, // Start with zero allocated amount
      unallocated_amount: parseFloat(paymentData.amount), // Start with all amount unallocated
      customer_id: paymentData.customerId ? parseInt(paymentData.customerId) : null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Insert the payment into the database
    const insertPaymentQuery = `
      INSERT INTO payments (
        reference_number, payment_date, sap_payment_no, payment_type, amount, currency, payment_method, 
        notes, is_advance_payment, allocated_amount, unallocated_amount, customer_id,
        created_by, created_at, updated_at
      ) 
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING *
    `;
    
    const paymentValues = [
      payment.reference_number,
      payment.payment_date,
      payment.sap_payment_no,
      payment.payment_type,
      payment.amount,
      payment.currency,
      payment.payment_method,
      payment.notes,
      payment.is_advance_payment,
      payment.allocated_amount,
      payment.unallocated_amount,
      payment.customer_id,
      payment.created_by,
      payment.created_at,
      payment.updated_at
    ];
    
    const paymentResult = await pool.query(insertPaymentQuery, paymentValues);
    
    if (!paymentResult.rows || paymentResult.rows.length === 0) {
      throw new Error("Failed to create payment");
    }
    
    const newPayment = paymentResult.rows[0];
    console.log(`Created payment with ID: ${newPayment.id}`);
    
    // If there are invoice links, create them as well
    let allocations = [];
    if (invoiceLinks && invoiceLinks.length > 0) {
      for (const link of invoiceLinks) {
        const allocationQuery = `
          INSERT INTO payment_allocations (
            payment_id, invoice_id, amount_applied, created_at, updated_at
          ) 
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        
        const allocationValues = [
          newPayment.id,
          parseInt(link.invoiceId),
          parseFloat(link.amountApplied),
          new Date().toISOString(),
          new Date().toISOString()
        ];
        
        const allocationResult = await pool.query(allocationQuery, allocationValues);
        
        if (allocationResult.rows && allocationResult.rows.length > 0) {
          allocations.push(allocationResult.rows[0]);
          
          // Update unallocated amount for the payment
          const updatePaymentQuery = `
            UPDATE payments 
            SET unallocated_amount = unallocated_amount - $1, updated_at = $2
            WHERE id = $3
            RETURNING *
          `;
          
          await pool.query(updatePaymentQuery, [
            parseFloat(link.amountApplied),
            new Date().toISOString(),
            newPayment.id
          ]);
          
          // Update invoice outstanding amount and status if needed
          const updateInvoiceQuery = `
            UPDATE invoices 
            SET 
              outstanding_amount = CASE 
                WHEN outstanding_amount IS NULL THEN total_amount - $1
                ELSE outstanding_amount - $1
              END,
              status = CASE 
                WHEN (outstanding_amount - $1) <= 0 THEN 'Paid'
                ELSE status
              END,
              updated_at = $2
            WHERE id = $3
            RETURNING *
          `;
          
          await pool.query(updateInvoiceQuery, [
            parseFloat(link.amountApplied),
            new Date().toISOString(),
            parseInt(link.invoiceId)
          ]);
        }
      }
    }
    
    // Return the created payment
    const formattedPayment = {
      id: newPayment.id,
      referenceNumber: newPayment.reference_number,
      customerId: newPayment.customer_id,
      paymentDate: newPayment.payment_date,
      amount: newPayment.amount.toString(),
      paymentMethod: newPayment.payment_method,
      currency: newPayment.currency,
      notes: newPayment.notes,
      isAdvancePayment: newPayment.is_advance_payment,
      unallocatedAmount: newPayment.unallocated_amount.toString(),
      createdBy: newPayment.created_by,
      createdAt: newPayment.created_at,
      updatedAt: newPayment.updated_at
    };
    
    res.status(201).json(formattedPayment);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ 
      error: 'Failed to create payment',
      details: error.message 
    });
  }
});

/**
 * Update an existing payment
 */
router.post('/payments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    // Get payment data from request body
    const { payment, invoiceLinks } = req.body;
    
    if (!payment) {
      return res.status(400).json({ error: 'Invalid request body - payment data missing' });
    }
    
    console.log(`Updating payment with ID ${paymentId}:`, payment);
    
    // Format dates for the database
    const paymentDate = payment.paymentDate ? new Date(payment.paymentDate) : new Date();
    
    // Log payment method value for debugging
    console.log('Payment method value received:', payment.paymentMethod);
    
    // First, retrieve current payment data to check allocated amount
    const currentPaymentQuery = `
      SELECT amount, unallocated_amount 
      FROM payments 
      WHERE id = $1
    `;
    const currentPaymentResult = await pool.query(currentPaymentQuery, [paymentId]);
    const currentPayment = currentPaymentResult.rows[0];
    
    if (!currentPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // Get existing allocation information
    const currentAmount = parseFloat(currentPayment.amount);
    const currentUnallocated = parseFloat(currentPayment.unallocated_amount || currentAmount);
    
    // Calculate allocated amount - either use the existing allocated_amount or calculate it
    let allocatedAmount = 0;
    if ('allocated_amount' in currentPayment) {
      // Use the existing allocated_amount if it exists
      allocatedAmount = parseFloat(currentPayment.allocated_amount || 0);
    } else {
      // Fall back to calculating it from amount - unallocated (for backward compatibility)
      allocatedAmount = currentAmount - currentUnallocated;
    }
    
    // Calculate new unallocated amount
    const newAmount = parseFloat(payment.amount);
    const newUnallocatedAmount = newAmount - allocatedAmount;
    const newAllocatedAmount = allocatedAmount; // Allocated amount stays the same when just updating payment details
    
    console.log('Payment amount update:', {
      currentAmount,
      currentUnallocated,
      allocatedAmount,
      newAmount,
      newUnallocatedAmount,
      newAllocatedAmount
    });
    
    // Update payment in database with updated unallocated amount
    const updatePaymentQuery = `
      UPDATE payments SET
        reference_number = $1,
        payment_date = $2,
        sap_invoice_no = $3,
        invoice_type = $4,
        amount = $5,
        currency = $6,
        payment_method = $7,
        notes = $8,
        is_advance_payment = $9,
        customer_id = $10,
        allocated_amount = $11,
        unallocated_amount = $12,
        updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `;
    
    const paymentValues = [
      payment.referenceNumber,
      paymentDate.toISOString().split('T')[0], // Format as YYYY-MM-DD for SQL
      payment.sapInvoiceNo || null,
      payment.invoiceType || 'Product',
      payment.amount,
      payment.currency || 'USD',
      payment.paymentMethod || 'bank transfer', // Ensure a default if null
      payment.notes || null,
      payment.isAdvancePayment,
      payment.isAdvancePayment ? payment.customerId : null,
      newAllocatedAmount,
      newUnallocatedAmount,
      paymentId
    ];
    
    console.log('Executing payment update with values:', paymentValues);
    const paymentResult = await pool.query(updatePaymentQuery, paymentValues);
    
    if (!paymentResult || !paymentResult.rows || paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found or update failed' });
    }
    
    const updatedPayment = paymentResult.rows[0];
    
    // Format the response data
    const formattedPayment = {
      id: updatedPayment.id,
      referenceNumber: updatedPayment.reference_number,
      customerId: updatedPayment.customer_id,
      paymentDate: updatedPayment.payment_date,
      amount: updatedPayment.amount.toString(),
      paymentMethod: updatedPayment.payment_method,
      currency: updatedPayment.currency,
      notes: updatedPayment.notes,
      isAdvancePayment: updatedPayment.is_advance_payment,
      createdAt: updatedPayment.created_at,
      updatedAt: updatedPayment.updated_at
    };
    
    // Return success response
    res.json({
      message: 'Payment updated successfully',
      payment: formattedPayment
    });
  } catch (error) {
    console.error(`Error updating payment ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to update payment',
      details: error.message
    });
  }
});

/**
 * Update invoice status - just return success without updating
 */
router.patch('/invoices/:id/status', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const updatedInvoice = {
      id: parseInt(id),
      invoiceNumber: `INV-2526-00${id}`,
      customerId: 1,
      issueDate: "2025-05-01",
      dueDate: "2025-05-31",
      totalAmount: "125000.00",
      tax: "10000.00",
      currency: "USD",
      status: status,
      notes: "Project A Phase 1",
      createdBy: 1,
      createdAt: "2025-05-01T10:00:00Z",
      updatedAt: new Date().toISOString()
    };
    
    res.json(updatedInvoice);
  } catch (error) {
    console.error(`Error updating invoice ${req.params.id} status:`, error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
});

/**
 * Add a BRC (Bank Realization Certificate) for a payment
 */
router.post('/payments/:id/brc', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { certificateNumber, issueDate, bankName, documentUrl } = req.body;
    
    const newBRC = {
      id: 1,
      relatedPaymentId: parseInt(id),
      certificateNumber,
      issueDate,
      bankName,
      documentUrl,
      createdBy: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    res.status(201).json(newBRC);
  } catch (error) {
    console.error(`Error adding BRC for payment ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to add BRC' });
  }
});

/**
 * Get all BRCs
 */
router.get('/brc', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const brcData = [
      {
        brc: {
          id: 1,
          relatedPaymentId: 1,
          certificateNumber: "BRC-2526-001",
          issueDate: "2025-06-20",
          bankName: "Bank of America",
          documentUrl: "https://example.com/brc-2526-001.pdf",
          createdBy: 1,
          createdAt: "2025-06-20T15:30:00Z",
          updatedAt: "2025-06-20T15:30:00Z"
        },
        payment: {
          id: 1,
          referenceNumber: "PAY-2526-001",
          customerId: 1,
          paymentDate: "2025-06-15",
          amount: "125000.00",
          paymentMethod: "Wire Transfer",
          currency: "USD",
          notes: "Payment for INV-2526-001",
          isAdvancePayment: false,
          allocationStatus: "Allocated",
          createdBy: 1,
          createdAt: "2025-06-15T10:00:00Z",
          updatedAt: "2025-06-15T10:00:00Z"
        }
      },
      {
        brc: {
          id: 2,
          relatedPaymentId: 2,
          certificateNumber: "BRC-2526-002",
          issueDate: "2025-07-25",
          bankName: "Bank of America",
          documentUrl: "https://example.com/brc-2526-002.pdf",
          createdBy: 1,
          createdAt: "2025-07-25T11:45:00Z",
          updatedAt: "2025-07-25T11:45:00Z"
        },
        payment: {
          id: 2,
          referenceNumber: "PAY-2526-002",
          customerId: 2,
          paymentDate: "2025-07-22",
          amount: "100000.00",
          paymentMethod: "Bank Transfer",
          currency: "USD",
          notes: "Payment for INV-2526-002",
          isAdvancePayment: false,
          allocationStatus: "Allocated",
          createdBy: 1,
          createdAt: "2025-07-22T10:00:00Z",
          updatedAt: "2025-07-22T10:00:00Z"
        }
      }
    ];
    
    res.json(brcData);
  } catch (error) {
    console.error('Error getting BRCs:', error);
    res.status(500).json({ error: 'Failed to get BRCs' });
  }
});

/**
 * Get foreign currency payments without BRC
 */
router.get('/payments/foreign-without-brc', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const paymentsWithoutBrc = [
      {
        id: 3,
        referenceNumber: "PAY-2526-003",
        customerId: 3,
        paymentDate: "2025-08-10",
        amount: "150000.00",
        paymentMethod: "Wire Transfer",
        currency: "USD",
        notes: "Payment for INV-2526-003",
        isAdvancePayment: false,
        allocationStatus: "Allocated",
        createdBy: 1,
        createdAt: "2025-08-10T14:30:00Z",
        updatedAt: "2025-08-10T14:30:00Z"
      }
    ];
    
    res.json(paymentsWithoutBrc);
  } catch (error) {
    console.error('Error getting foreign payments without BRC:', error);
    res.status(500).json({ error: 'Failed to get foreign payments without BRC' });
  }
});

/**
 * Allocate advance payment to invoices
 */
router.post('/payments/:id/allocate', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceAllocations } = req.body;
    
    if (!invoiceAllocations || !Array.isArray(invoiceAllocations) || invoiceAllocations.length === 0) {
      return res.status(400).json({ error: 'Invoice allocations are required' });
    }
    
    // Create a success response
    const allocationResponse = {
      success: true,
      payment: {
        id: parseInt(id),
        allocationStatus: "Allocated",
        updatedAt: new Date().toISOString()
      },
      allocations: invoiceAllocations
    };
    
    res.json(allocationResponse);
  } catch (error) {
    console.error(`Error allocating payment ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to allocate payment' });
  }
});

/**
 * Test endpoint to generate next invoice number
 * This endpoint is used by the frontend to generate the next invoice number
 * Format: INV-YYZZ-XXX where YY is the last 2 digits of the start year,
 * ZZ is the last 2 digits of the end year, and XXX is a sequence number
 */
router.get('/test/invoice-number', (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    
    // Get the financial year
    const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    const endYear = startYear + 1;
    
    // Format YY-ZZ part
    const startYearStr = startYear.toString().substring(2);
    const endYearStr = endYear.toString().substring(2);
    const financialYear = `${startYearStr}${endYearStr}`;
    
    // Find the existing invoice with the highest sequence number
    // In a real app, this would query the database, but for now we'll use the sample data
    const sampleInvoices = [
      { id: 1, invoiceNumber: "INV-2526-001" },
      { id: 2, invoiceNumber: "INV-2526-002" },
      { id: 3, invoiceNumber: "INV-2526-003" },
      { id: 4, invoiceNumber: "INV-2526-004" },
      { id: 5, invoiceNumber: "INV-2526-005" }
    ];
    
    // Find the max sequence number for this financial year
    let maxSequenceNumber = 0;
    for (const invoice of sampleInvoices) {
      const match = invoice.invoiceNumber.match(/INV-(\d{4})-(\d{3})/);
      if (match && match[1] === financialYear) {
        const sequenceNumber = parseInt(match[2]);
        maxSequenceNumber = Math.max(maxSequenceNumber, sequenceNumber);
      }
    }
    
    // Generate the next sequence number
    const nextSequenceNumber = maxSequenceNumber + 1;
    // Format it to 3 digits with leading zeros
    const sequenceStr = nextSequenceNumber.toString().padStart(3, '0');
    
    // Return the next invoice number
    const nextInvoiceNumber = `INV-${financialYear}-${sequenceStr}`;
    res.json({ nextInvoiceNumber });
    
  } catch (error) {
    console.error('Error generating next invoice number:', error);
    res.status(500).json({ error: 'Failed to generate next invoice number' });
  }
});

/**
 * Get unallocated advance payments
 */
router.get('/payments/unallocated-advances', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Query payments from the database that are advance payments with unallocated amounts
    const query = `
      SELECT 
        p.id,
        p.reference_number as "referenceNumber",
        p.customer_id as "customerId",
        c.bp_name as "customerName",
        p.payment_date as "paymentDate",
        p.amount,
        p.allocated_amount as "allocatedAmount",
        p.unallocated_amount as "unallocatedAmount",
        p.payment_method as "paymentMethod",
        p.currency,
        p.notes,
        p.is_advance_payment as "isAdvancePayment",
        CASE WHEN p.unallocated_amount = p.amount THEN 'Unallocated'
             WHEN p.unallocated_amount > 0 THEN 'Partially Allocated'
             ELSE 'Fully Allocated' END as "allocationStatus",
        p.created_by as "createdBy",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt"
      FROM 
        payments p
      JOIN 
        customers c ON p.customer_id = c.id
      WHERE 
        p.is_advance_payment = true
        AND p.unallocated_amount > 0
      ORDER BY 
        p.payment_date DESC
    `;
    
    const result = await pool.query(query);
    const advances = result.rows;
    
    // Calculate total unallocated amount
    const totalUnallocatedAmount = advances.reduce((sum, payment) => 
      sum + parseFloat(payment.unallocatedAmount), 0).toFixed(2);
    
    res.json({
      advances: advances,
      totalUnallocatedAmount: totalUnallocatedAmount,
      count: advances.length
    });
  } catch (error) {
    console.error('Error getting unallocated advances:', error);
    res.status(500).json({ error: 'Failed to get unallocated advances' });
  }
});

// Financial reports

/**
 * Turnover report
 */
router.get('/reports/turnover', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const { startDate, endDate, currency } = req.query;
    
    // Sample turnover data
    const invoicesResult = [
      {
        id: 1,
        invoiceNumber: "INV-2526-001",
        issueDate: "2025-05-01",
        amount: "125000.00",
        currency: "USD",
        status: "Paid"
      },
      {
        id: 2,
        invoiceNumber: "INV-2526-002",
        issueDate: "2025-06-01",
        amount: "100000.00",
        currency: "USD",
        status: "Paid"
      },
      {
        id: 3,
        invoiceNumber: "INV-2526-003",
        issueDate: "2025-07-01",
        amount: "150000.00",
        currency: "USD",
        status: "Unpaid"
      },
      {
        id: 4,
        invoiceNumber: "INV-2526-004",
        issueDate: "2025-07-15",
        amount: "125000.00",
        currency: "USD",
        status: "Unpaid"
      },
      {
        id: 5,
        invoiceNumber: "INV-2526-005",
        issueDate: "2025-08-01",
        amount: "125000.00",
        currency: "USD",
        status: "Unpaid"
      }
    ];
    
    // Generate monthly summary
    const monthlyData = [
      {
        month: "2025-05",
        count: 1,
        amount: 125000,
        amountINR: 10693750
      },
      {
        month: "2025-06",
        count: 1,
        amount: 100000,
        amountINR: 8555000
      },
      {
        month: "2025-07",
        count: 2,
        amount: 275000,
        amountINR: 23526250
      },
      {
        month: "2025-08",
        count: 1,
        amount: 125000,
        amountINR: 10693750
      }
    ];
    
    res.json({
      totalInvoiced: 625000,
      totalInvoicedINR: 53468750,
      invoices: invoicesResult,
      monthlyData
    });
  } catch (error) {
    console.error('Error generating turnover report:', error);
    res.status(500).json({ error: 'Failed to generate turnover report' });
  }
});

/**
 * Outstanding invoices report
 */
router.get('/reports/outstanding', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const { startDate, endDate, currency } = req.query;
    
    // Sample static data for outstanding invoices
    const outstandingInvoices = [
      {
        id: 3,
        invoiceNumber: 'INV-2526-003',
        customerId: 3,
        customerName: 'ABC Industries Ltd.',
        issueDate: '2025-07-01',
        dueDate: '2025-07-31',
        amount: '150000.00',
        currency: 'USD',
        status: 'Unpaid',
        daysOverdue: 15,
        agingBucket: '0-30 days'
      },
      {
        id: 4,
        invoiceNumber: 'INV-2526-004',
        customerId: 1,
        customerName: 'XYZ Corp',
        issueDate: '2025-07-15',
        dueDate: '2025-08-15',
        amount: '125000.00',
        currency: 'USD',
        status: 'Unpaid',
        daysOverdue: 0,
        agingBucket: '0-30 days'
      },
      {
        id: 5,
        invoiceNumber: 'INV-2526-005',
        customerId: 4,
        customerName: 'Delta Systems',
        issueDate: '2025-08-01',
        dueDate: '2025-08-31',
        amount: '125000.00',
        currency: 'USD',
        status: 'Unpaid',
        daysOverdue: 0,
        agingBucket: '0-30 days'
      },
      {
        id: 6,
        invoiceNumber: 'INV-2526-006',
        customerId: 1,
        customerName: 'XYZ Corp',
        issueDate: '2025-04-01',
        dueDate: '2025-04-30',
        amount: '75000.00',
        currency: 'USD',
        status: 'Unpaid',
        daysOverdue: 107,
        agingBucket: '90+ days'
      },
      {
        id: 7,
        invoiceNumber: 'INV-2526-007',
        customerId: 3,
        customerName: 'ABC Industries Ltd.',
        issueDate: '2025-05-15',
        dueDate: '2025-06-15',
        amount: '50000.00',
        currency: 'USD',
        status: 'Unpaid',
        daysOverdue: 62,
        agingBucket: '61-90 days'
      }
    ];
    
    // Calculate totals
    let totalOutstanding = 0;
    let totalOutstandingINR = 0;
    let totalOverdue = 0;
    let totalOverdueINR = 0;
    let totalWithinDue = 0;
    let totalWithinDueINR = 0;
    
    outstandingInvoices.forEach(invoice => {
      const amount = Number(invoice.amount);
      totalOutstanding += amount;
      
      // Convert to INR for USD invoices
      if (invoice.currency === 'USD') {
        totalOutstandingINR += amount * 85.55; // USD to INR conversion rate
      } else {
        totalOutstandingINR += amount;
      }
      
      // Categorize as overdue or within due date
      if (invoice.daysOverdue > 0) {
        totalOverdue += amount;
        if (invoice.currency === 'USD') {
          totalOverdueINR += amount * 85.55;
        } else {
          totalOverdueINR += amount;
        }
      } else {
        totalWithinDue += amount;
        if (invoice.currency === 'USD') {
          totalWithinDueINR += amount * 85.55;
        } else {
          totalWithinDueINR += amount;
        }
      }
    });
    
    res.json({
      totalOutstanding,
      totalOutstandingINR,
      totalOverdue,
      totalOverdueINR,
      totalWithinDue,
      totalWithinDueINR,
      outstandingInvoices
    });
  } catch (error) {
    console.error('Error generating outstanding report:', error);
    res.status(500).json({ error: 'Failed to generate outstanding report' });
  }
});

/**
 * Inward remittances report
 */
router.get('/reports/remittances', ensureAuthenticated, (req: Request, res: Response) => {
  // Sample remittance data for demonstration
  const remittanceData = {
    totalRemittances: 72000,
    totalRemittancesINR: 6159600, // 72000 * 85.55
    currencyBreakdown: [
      {
        currency: 'USD',
        amount: 72000,
        amountINR: 6159600
      }
    ],
    remittances: [
      {
        paymentId: 1,
        paymentReference: 'PAY-2526-001',
        customer: 'XYZ Corp',
        date: '2025-06-15',
        amount: 50000,
        currency: 'USD',
        amountINR: 4277500,
        brc: 'BRC-2526-001',
        brcDate: '2025-06-20',
        bank: 'Bank of America'
      },
      {
        paymentId: 2,
        paymentReference: 'PAY-2526-002',
        customer: 'ABC Industries Ltd.',
        date: '2025-07-22',
        amount: 22000,
        currency: 'USD',
        amountINR: 1882100,
        brc: 'BRC-2526-002',
        brcDate: '2025-07-25',
        bank: 'Bank of America'
      }
    ],
    monthlyData: [
      {
        month: '2025-06',
        amount: 50000,
        amountINR: 4277500
      },
      {
        month: '2025-07',
        amount: 22000,
        amountINR: 1882100
      }
    ]
  };
  
  res.json(remittanceData);
});

/**
 * Create a write-off for an invoice
 */
router.post('/invoices/:id/write-off', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, reason, glAccount } = req.body;
    
    if (!amount || !reason) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide amount and reason.' 
      });
    }
    
    // Import the write-off service
    const { writeOffService } = require('./write-off-service');
    
    // Create the write-off
    const writeOff = await writeOffService.writeOffInvoice(
      parseInt(id),
      parseFloat(amount),
      reason,
      req.user?.id || 1,
      {
        glAccount
      }
    );
    
    // Return the created write-off
    res.status(201).json(writeOff);
  } catch (error: any) {
    console.error(`Error creating write-off for invoice ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to create invoice write-off',
      message: error.message
    });
  }
});

/**
 * Create a write-off for a payment
 */
router.post('/payments/:id/write-off', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, reason, glAccount } = req.body;
    
    if (!amount || !reason) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide amount and reason.' 
      });
    }
    
    // Import the write-off service
    const { writeOffService } = require('./write-off-service');
    
    // Create the write-off
    const writeOff = await writeOffService.writeOffPayment(
      parseInt(id),
      parseFloat(amount),
      reason,
      req.user?.id || 1,
      {
        glAccount
      }
    );
    
    // Return the created write-off
    res.status(201).json(writeOff);
  } catch (error: any) {
    console.error(`Error creating write-off for payment ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to create payment write-off',
      message: error.message
    });
  }
});

/**
 * Get write-offs for an invoice
 */
router.get('/invoices/:id/write-offs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Import the write-off service
    const { writeOffService } = require('./write-off-service');
    
    // Get the write-offs
    const writeOffs = await writeOffService.getWriteOffsBySource('Invoice', parseInt(id));
    
    // Return the write-offs
    res.json(writeOffs);
  } catch (error: any) {
    console.error(`Error getting write-offs for invoice ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to get invoice write-offs',
      message: error.message
    });
  }
});

/**
 * Get write-offs for a payment
 */
router.get('/payments/:id/write-offs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Import the write-off service
    const { writeOffService } = require('./write-off-service');
    
    // Get the write-offs
    const writeOffs = await writeOffService.getWriteOffsBySource('Payment', parseInt(id));
    
    // Return the write-offs
    res.json(writeOffs);
  } catch (error: any) {
    console.error(`Error getting write-offs for payment ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to get payment write-offs',
      message: error.message
    });
  }
});

/**
 * Get all write-offs with filtering options
 */
router.get('/write-offs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { status, sourceType, createdBy, fromDate, toDate } = req.query;
    
    // Import the write-off service
    const { writeOffService } = require('./write-off-service');
    
    // Prepare filters
    const filters: any = {};
    
    if (status && ['Pending', 'Approved', 'Rejected'].includes(status as string)) {
      filters.status = status;
    }
    
    if (sourceType && ['Invoice', 'Payment'].includes(sourceType as string)) {
      filters.sourceType = sourceType;
    }
    
    if (createdBy) {
      filters.createdBy = parseInt(createdBy as string);
    }
    
    if (fromDate) {
      filters.fromDate = new Date(fromDate as string);
    }
    
    if (toDate) {
      filters.toDate = new Date(toDate as string);
    }
    
    // Get the write-offs
    const writeOffs = await writeOffService.getAllWriteOffs(filters);
    
    // Return the write-offs
    res.json(writeOffs);
  } catch (error: any) {
    console.error('Error getting write-offs:', error);
    res.status(500).json({ 
      error: 'Failed to get write-offs',
      message: error.message
    });
  }
});

/**
 * Approve a pending write-off
 */
router.post('/write-offs/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Import the write-off service
    const { writeOffService } = require('./write-off-service');
    
    // Approve the write-off
    const result = await writeOffService.approveWriteOff(parseInt(id), req.user?.id || 1);
    
    // Return the result
    res.json(result);
  } catch (error: any) {
    console.error(`Error approving write-off ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to approve write-off',
      message: error.message
    });
  }
});

/**
 * Reject a pending write-off
 */
router.post('/write-offs/:id/reject', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Import the write-off service
    const { writeOffService } = require('./write-off-service');
    
    // Reject the write-off
    const result = await writeOffService.rejectWriteOff(parseInt(id), req.user?.id || 1, reason);
    
    // Return the result
    res.json(result);
  } catch (error: any) {
    console.error(`Error rejecting write-off ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to reject write-off',
      message: error.message
    });
  }
});

export default router;