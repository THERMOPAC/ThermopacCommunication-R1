import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';

const router = Router();

/**
 * Get overall financial dashboard data
 */
router.get('/dashboard', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    // Return sample data for dashboard
    const dashboardData = {
      totalInvoices: {
        count: 5,
        amount: "625000.00"
      },
      totalPaid: {
        count: 2,
        amount: "225000.00"
      },
      totalUnpaid: {
        count: 3,
        amount: "400000.00"
      },
      outstandingInvoices: {
        count: 3,
        amount: "400000.00"
      },
      overdueInvoices: {
        count: 2,
        amount: "200000.00"
      },
      totalOutstanding: {
        count: 3,
        amount: "400000.00"
      },
      totalOverdue: {
        count: 2,
        amount: "200000.00"
      },
      totalPayments: {
        count: 2,
        amount: "225000.00"
      },
      recentInvoices: [
        {
          id: 1,
          invoiceNumber: "INV-2526-001",
          clientName: "Acme Corporation",
          issueDate: "2025-05-15",
          dueDate: "2025-06-14",
          amount: "150000.00",
          status: "Paid"
        },
        {
          id: 2,
          invoiceNumber: "INV-2526-002",
          clientName: "Globex Corporation",
          issueDate: "2025-06-02",
          dueDate: "2025-07-01", 
          amount: "200000.00",
          status: "Pending"
        },
        {
          id: 3,
          invoiceNumber: "INV-2526-003",
          clientName: "Stark Industries",
          issueDate: "2025-06-10",
          dueDate: "2025-07-09",
          amount: "125000.00",
          status: "Overdue"
        },
        {
          id: 4,
          invoiceNumber: "INV-2526-004",
          clientName: "Wayne Enterprises",
          issueDate: "2025-06-15",
          dueDate: "2025-07-14",
          amount: "75000.00",
          status: "Pending"
        },
        {
          id: 5,
          invoiceNumber: "INV-2526-005",
          clientName: "LexCorp",
          issueDate: "2025-06-20",
          dueDate: "2025-07-19",
          amount: "75000.00",
          status: "Pending"
        }
      ],
      latestPayments: [
        {
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
        },
        {
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
      ],
      latestInvoices: [
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
      ]
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
router.get('/payments', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    // Include all three payments in the system
    const payments = [
      {
        id: 1,
        referenceNumber: "PAY-2526-001",
        customerId: 1,
        customerName: "Acme Corporation",
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
      },
      {
        id: 2,
        referenceNumber: "PAY-2526-002",
        customerId: 2,
        customerName: "TechSolutions Inc",
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
      },
      {
        id: 3,
        referenceNumber: "PAY-2526-003",
        customerId: 3,
        customerName: "Global Enterprises Ltd",
        paymentDate: "2025-08-05",
        amount: "75000.00",
        paymentMethod: "Credit Card",
        currency: "USD",
        notes: "Advance payment for upcoming project",
        isAdvancePayment: true,
        allocationStatus: "Unallocated",
        createdBy: 1,
        createdAt: "2025-08-05T09:30:00Z",
        updatedAt: "2025-08-05T09:30:00Z"
      }
    ];
    
    // Log the number of payments being returned
    console.log(`Returning ${payments.length} payments`);
    
    res.json(payments);
  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

/**
 * Get a specific payment by ID
 */
router.get('/payments/:id', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    console.log(`Fetching payment details for payment ID: ${req.params.id}`);
    
    // Create a direct mapping for payment IDs to ensure consistent data
    const paymentId = req.params.id;
    
    // Hardcoded data for specific payment IDs
    const paymentData: Record<string, any> = {
      "1": {
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
        },
        invoiceLinks: [
          {
            link: {
              id: 1,
              paymentId: 1,
              invoiceId: 1,
              amountApplied: "125000.00",
              createdAt: "2025-06-15T10:05:00Z",
              updatedAt: "2025-06-15T10:05:00Z"
            },
            invoice: {
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
            }
          }
        ]
      },
      "2": {
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
        },
        invoiceLinks: [
          {
            link: {
              id: 2,
              paymentId: 2,
              invoiceId: 2,
              amountApplied: "100000.00",
              createdAt: "2025-07-22T10:05:00Z",
              updatedAt: "2025-07-22T10:05:00Z"
            },
            invoice: {
              id: 2,
              invoiceNumber: "INV-2526-002",
              customerId: 2,
              issueDate: "2025-06-02",
              dueDate: "2025-07-01",
              totalAmount: "100000.00",
              tax: "8000.00",
              currency: "USD",
              status: "Paid",
              notes: "Project B Phase 1",
              createdBy: 1,
              createdAt: "2025-06-02T10:00:00Z",
              updatedAt: "2025-07-22T10:00:00Z"
            }
          }
        ]
      }
    };
    
    // Get the payment data based on ID, default to payment 1 if not found
    const responseData = paymentData[paymentId] || paymentData["1"];
    
    console.log(`Sending payment data for ID ${paymentId}, customerId: ${responseData.payment.customerId}`);
    
    // Send the response with camelCase property names that match the frontend
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
    const { invoice, items } = req.body;
    
    if (!invoice) {
      return res.status(400).json({ error: 'Invalid request body - invoice data missing' });
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
      status: 'Pending',
      notes: invoice.notes || null,
      createdBy: req.user?.id || 1,
      createdAt: newInvoice.createdAt,
      updatedAt: newInvoice.updatedAt
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
router.post('/payments', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const newPayment = {
      id: 3,
      referenceNumber: req.body.referenceNumber || "PAY-2526-003",
      customerId: req.body.customerId,
      paymentDate: req.body.paymentDate,
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod,
      currency: req.body.currency || "USD",
      notes: req.body.notes || null,
      isAdvancePayment: req.body.isAdvancePayment || false,
      allocationStatus: req.body.isAdvancePayment ? "Unallocated" : "Allocated",
      createdBy: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    res.status(201).json(newPayment);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: 'Failed to create payment' });
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
router.get('/payments/unallocated-advances', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const unallocatedAdvances = [
      {
        id: 4,
        referenceNumber: "PAY-2526-004",
        customerId: 1,
        paymentDate: "2025-08-15",
        amount: "200000.00",
        paymentMethod: "Wire Transfer",
        currency: "USD",
        notes: "Advance payment for upcoming projects",
        isAdvancePayment: true,
        allocationStatus: "Unallocated",
        createdBy: 1,
        createdAt: "2025-08-15T09:15:00Z",
        updatedAt: "2025-08-15T09:15:00Z"
      }
    ];
    
    res.json(unallocatedAdvances);
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

export default router;