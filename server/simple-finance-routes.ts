import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { storage } from './storage';
import { InsertInvoice, InsertInvoiceItem } from '@shared/schema';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { pool } from './db';

const router = Router();

// Write-off approval endpoint - using the working router pattern
router.post('/approve-writeoff/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log(`🚀 WORKING APPROVAL ENDPOINT HIT! ID: ${req.params.id}`);
    
    // Set JSON content type immediately
    res.setHeader('Content-Type', 'application/json');
    
    // Get user from session
    const userId = req.user?.id || 3; // fallback to user 3 for testing
    
    const updateQuery = `
      UPDATE write_offs 
      SET status = 'Approved', 
          approved_by = $1, 
          approval_date = NOW(), 
          updated_at = NOW()
      WHERE id = $2 AND status = 'Pending'
      RETURNING *
    `;
    
    console.log(`📝 Executing working approval query for write-off ${req.params.id} by user ${userId}`);
    const result = await pool.query(updateQuery, [userId, req.params.id]);
    
    if (result.rows.length === 0) {
      console.log(`❌ Write-off ${req.params.id} not found or already processed`);
      return res.status(404).json({ 
        success: false, 
        message: 'Write-off not found or already processed' 
      });
    }

    // Update the related invoice to reflect the write-off
    const writeOff = result.rows[0];
    const invoiceUpdateQuery = `
      UPDATE invoices 
      SET write_off_amount = COALESCE(write_off_amount, 0) + $1,
          outstanding_amount = total_amount - COALESCE(paid_amount, 0) - (COALESCE(write_off_amount, 0) + $1),
          status = CASE 
            WHEN (total_amount - COALESCE(paid_amount, 0) - (COALESCE(write_off_amount, 0) + $1)) <= 0 THEN 'Paid'
            WHEN COALESCE(paid_amount, 0) > 0 OR (COALESCE(write_off_amount, 0) + $1) > 0 THEN 'Partially Paid'
            ELSE status 
          END
      WHERE id = $2
    `;
    
    console.log(`📝 Updating invoice ${writeOff.invoice_id} to reflect write-off amount ${writeOff.amount}`);
    await pool.query(invoiceUpdateQuery, [writeOff.amount, writeOff.invoice_id]);
    
    console.log(`✅ WORKING SUCCESS! Write-off ${req.params.id} approved successfully!`);
    return res.status(200).json({ 
      success: true, 
      message: 'Write-off approved successfully',
      writeOff: result.rows[0] 
    });
  } catch (error: any) {
    console.error('❌ Working writeoff approval error:', error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to approve write-off',
      message: error.message 
    });
  }
});

// Write-off rejection endpoint - using the working router pattern
router.post('/reject-writeoff/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log(`🚀 WORKING REJECTION ENDPOINT HIT! ID: ${req.params.id}`);
    
    // Set JSON content type immediately
    res.setHeader('Content-Type', 'application/json');
    
    // Get user from session
    const userId = req.user?.id || 3; // fallback to user 3 for testing
    
    const updateQuery = `
      UPDATE write_offs 
      SET status = 'Rejected', 
          approved_by = $1, 
          approval_date = NOW()
      WHERE id = $2 AND status = 'Pending'
      RETURNING *
    `;
    
    console.log(`📝 Executing working rejection query for write-off ${req.params.id} by user ${userId}`);
    const result = await pool.query(updateQuery, [userId, req.params.id]);
    
    if (result.rows.length === 0) {
      console.log(`❌ Write-off ${req.params.id} not found or already processed`);
      return res.status(404).json({ 
        success: false, 
        message: 'Write-off not found or already processed' 
      });
    }
    
    console.log(`✅ WORKING REJECTION SUCCESS! Write-off ${req.params.id} rejected successfully!`);
    return res.status(200).json({ 
      success: true, 
      message: 'Write-off rejected successfully',
      writeOff: result.rows[0] 
    });
  } catch (error: any) {
    console.error('❌ Working writeoff rejection error:', error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to reject write-off',
      message: error.message 
    });
  }
});

// Add customers with outstanding invoices endpoint
router.get('/customers-with-outstanding', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('=== CUSTOMERS WITH OUTSTANDING ENDPOINT HIT ===');
    
    const query = `
      SELECT DISTINCT
        c.id,
        c.bp_name as name
      FROM customers c
      INNER JOIN invoices i ON c.id = i.customer_id
      WHERE i.outstanding_amount > 0
      ORDER BY c.bp_name ASC
    `;
    
    const result = await pool.query(query);
    console.log('Found customers with outstanding invoices:', result.rows);
    
    res.json({
      customers: result.rows
    });
  } catch (error) {
    console.error('Error fetching customers with outstanding invoices:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Add a route for getting invoice list using direct database access
router.get('/invoices-list', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Getting invoices list with direct SQL');
    
    // Use a simple direct query to get all invoices
    try {
      // Limit to 30 most recent invoices for faster loading

      const query = `
        SELECT 
          id,
          invoice_number AS "invoiceNumber",
          customer_id AS "customerId",
          issue_date AS "issueDate",
          due_date AS "dueDate",
          total_amount AS "totalAmount",
          COALESCE(paid_amount, 0) AS "paidAmount",
          COALESCE(outstanding_amount, 0) AS "outstandingAmount",
          currency,
          status,
          sap_invoice_no AS "sapInvoiceNo", 
          invoice_type AS "invoiceType",
          shipping_bill_number AS "shippingBillNumber",
          is_export AS "isExport",
          brc_required AS "brcRequired",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM invoices 
        ORDER BY 
          CASE 
            WHEN status = 'Paid' THEN 1 
            WHEN status = 'Pending' THEN 2 
            ELSE 3 
          END,
          created_at DESC, 
          invoice_number DESC
        LIMIT 50
      `;
      
      const result = await pool.query(query);
      
      if (result && result.rows && result.rows.length > 0) {
        console.log('Found invoices in database:', result.rows.length);
        console.log('First invoice raw data:', result.rows[0]);
        console.log('All invoice numbers found:', result.rows.map(inv => inv.invoiceNumber));
        console.log('Invoice statuses:', result.rows.map(inv => `${inv.invoiceNumber}: ${inv.status}`).slice(0, 10));
        
        // Format dates for frontend display
        const formattedInvoices = result.rows.map(invoice => ({
          ...invoice,
          issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().split('T')[0] : null,
          dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : null,
          outstandingAmount: invoice.outstandingAmount, // Explicitly preserve outstanding amount
          customerName: null // Will be filled by customer lookup
        }));
        
        // Try to get customer names if possible
        try {
          const customerIds = formattedInvoices
            .map(inv => inv.customerId)
            .filter(id => id)
            .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs
          
          if (customerIds.length > 0) {
            // Create placeholder parameters for the query - use bp_name for customer name
            const params = customerIds.map((_, i) => `$${i+1}`).join(',');
            const customerQuery = `SELECT id, bp_name as name FROM customers WHERE id IN (${params})`;
            const customerResult = await pool.query(customerQuery, customerIds);
            
            if (customerResult && customerResult.rows && customerResult.rows.length > 0) {
              // Create a lookup map of customer id to name
              const customerMap = {};
              customerResult.rows.forEach(customer => {
                customerMap[customer.id] = customer.name;
              });
              
              // Update the invoice data with customer names
              formattedInvoices.forEach(invoice => {
                if (invoice.customerId && customerMap[invoice.customerId]) {
                  invoice.customerName = customerMap[invoice.customerId];
                }
              });
            }
          }
        } catch (customerError) {
          console.error('Error getting customer names:', customerError);
          // Continue with default customer names
        }
        
        return res.json(formattedInvoices);
      } else {
        console.log('No invoices found in database');
        return res.json([]);
      }
    } catch (error) {
      console.error('Error executing invoice query:', error);
      return res.status(500).json({ 
        error: 'Database query failed',
        message: error.message 
      });
    }
  } catch (error) {
    console.error('Error in invoices-list route:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch invoices',
      message: error.message
    });
  }
});

/**
 * Create a new invoice - with database persistence
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
    
    // Calculate total amount
    const totalAmount = invoice.totalAmount || 
      (items && items.length > 0 
        ? items.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0) 
        : 0);
    
    // Prepare the invoice data for database insertion - using the correct field names from the schema
    const invoiceData: InsertInvoice = {
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      projectId: invoice.projectId || null,
      issueDate: new Date(invoice.issue_date || invoice.issueDate),
      dueDate: new Date(invoice.due_date || invoice.dueDate),
      totalAmount: totalAmount,
      paidAmount: 0, // Initialize with 0 (no payments yet)
      outstandingAmount: totalAmount, // Initialize with full amount outstanding
      currency: invoice.currency || 'USD',
      status: 'Pending',
      notes: invoice.notes || null,
      shippingBillNumber: invoice.shippingBillNumber || null,
      isExport: invoice.isExport || false,
      brcRequired: invoice.brcRequired !== undefined ? invoice.brcRequired : true,
      createdBy: req.user?.id || 1
    };
    
    // Prepare invoice items
    const invoiceItems: InsertInvoiceItem[] = [];
    if (items && items.length > 0) {
      for (const item of items) {
        invoiceItems.push({
          description: item.description || '',
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || parseFloat(item.amount) || 0,
          amount: parseFloat(item.amount) || 0,
          taxRate: parseFloat(item.taxRate) || 0,
          taxAmount: parseFloat(item.taxAmount) || 0,
          discountPercent: parseFloat(item.discountPercent) || 0,
          discountAmount: parseFloat(item.discountAmount) || 0,
          lineTotal: parseFloat(item.lineTotal) || parseFloat(item.amount) || 0,
          projectItemId: item.projectItemId || null,
          masterItemId: item.masterItemId || null,
          hsnCode: item.hsnCode || null
        });
      }
    }
    
    // Log the invoice data we're about to save
    console.log('Attempting to save invoice with data:', JSON.stringify(invoiceData, null, 2));
    console.log('Invoice items to save:', JSON.stringify(invoiceItems, null, 2));
    
    try {
      // Save the invoice to the database
      const savedInvoice = await storage.createInvoice(invoiceData, invoiceItems);
      
      // Log the success
      console.log('Successfully created invoice:', savedInvoice.id);
      
      // Return success response
      return res.status(201).json(savedInvoice);
    } catch (dbError) {
      console.error('Database error creating invoice:', dbError);
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ 
      error: 'Failed to create invoice',
      details: error.message 
    });
  }
});

/**
 * Get all invoices with filtering
 */
router.get('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { 
      customerId, 
      projectId, 
      fromDate, 
      toDate, 
      status, 
      currency 
    } = req.query;

    // Build filters for database query
    const filters: any = {};
    
    if (customerId) {
      filters.customerId = parseInt(customerId as string);
    }
    
    if (projectId) {
      filters.projectId = parseInt(projectId as string);
    }
    
    if (fromDate) {
      filters.fromDate = new Date(fromDate as string);
    }
    
    if (toDate) {
      filters.toDate = new Date(toDate as string);
    }
    
    if (status) {
      filters.status = status as string;
    }
    
    if (currency) {
      filters.currency = currency as string;
    }
    
    // Use direct query instead of storage function to avoid ORM issues
    try {
      const query = `
        SELECT 
          i.id, 
          i.invoice_number as "invoiceNumber", 
          i.customer_id as "customerId",
          i.issue_date as "issueDate", 
          i.due_date as "dueDate", 
          i.total_amount as "totalAmount", 
          COALESCE(i.paid_amount, 0) as "paidAmount",
          COALESCE(i.outstanding_amount, i.total_amount) as "outstandingAmount",
          i.currency, 
          i.status,
          i.sap_invoice_no as "sapInvoiceNo", 
          i.invoice_type as "invoiceType",
          i.created_at as "createdAt", 
          i.updated_at as "updatedAt"
        FROM invoices i
        ORDER BY i.created_at DESC
        LIMIT 50
      `;
      
      const result = await pool.query(query);
      
      // Get actual invoice data from the database query result
      if (result && result.rows && result.rows.length > 0) {
        console.log('Found invoices in database:', result.rows.length);
        const invoices = result.rows.map(inv => ({
          ...inv,
          issueDate: inv.issueDate ? new Date(inv.issueDate).toISOString().split('T')[0] : null,
          dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : null,
          customerName: `Customer ${inv.customerId}` // Default name
        }));
        return res.json(invoices);
      } else {
        console.log('No invoices found in database');
        return res.json([]);
      }
    } catch (dbError) {
      console.error('Error with database query:', dbError);
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      error: 'Failed to fetch invoices',
      details: error.message
    });
  }
});

/**
 * Get a single invoice by ID
 */
router.get('/invoices/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // Use direct query instead of storage function
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
        i.shipping_bill_number as "shippingBillNumber",
        i.is_export as "isExport",
        i.brc_required as "brcRequired",
        i.notes,
        i.created_at as "createdAt", 
        i.updated_at as "updatedAt",
        i.created_by as "createdBy"
      FROM invoices i
      WHERE i.id = $1
    `;
    
    const result = await pool.query(query, [invoiceId]);
    
    if (!result || !result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = result.rows[0];
    
    // Format dates for frontend
    if (invoice.issueDate) {
      invoice.issueDate = new Date(invoice.issueDate).toISOString().split('T')[0];
    }
    if (invoice.dueDate) {
      invoice.dueDate = new Date(invoice.dueDate).toISOString().split('T')[0];
    }
    
    // Try to get customer name from bp_name
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
    
    // Return the invoice directly to match frontend expectations
    res.json(invoice);
  } catch (error: any) {
    console.error(`Error fetching invoice ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to fetch invoice',
      details: error.message
    });
  }
});

/**
 * Get all items for an invoice
 */
router.get('/invoices/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // Use direct query for invoice items
    const query = `
      SELECT 
        id,
        invoice_id as "invoiceId",
        description,
        quantity,
        unit_price as "unitPrice",
        amount,
        tax_rate as "taxRate",
        tax_amount as "taxAmount",
        discount_percent as "discountPercent",
        discount_amount as "discountAmount",
        line_total as "lineTotal",
        project_item_id as "projectItemId",
        master_item_id as "masterItemId",
        hsn_code as "hsnCode",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM invoice_items
      WHERE invoice_id = $1
    `;
    
    const result = await pool.query(query, [invoiceId]);
    
    if (!result || !result.rows) {
      return res.status(500).json({ error: 'Error fetching invoice items' });
    }
    
    // Return the items directly as an array to match frontend expectations
    res.json(result.rows);
  } catch (error: any) {
    console.error(`Error fetching items for invoice ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to fetch invoice items',
      details: error.message
    });
  }
});

/**
 * Update an existing invoice
 */
router.put('/invoices/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // Extract data from the request body
    const { invoice, items } = req.body;
    
    if (!invoice) {
      return res.status(400).json({ error: 'Invalid request body - invoice data missing' });
    }
    
    // First check if the invoice exists
    const checkQuery = `SELECT id FROM invoices WHERE id = $1`;
    const checkResult = await pool.query(checkQuery, [invoiceId]);
    
    if (!checkResult.rows || checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Update the invoice in the database
    const updateQuery = `
      UPDATE invoices
      SET 
        invoice_number = $1,
        customer_id = $2,
        project_id = $3,
        issue_date = $4,
        due_date = $5,
        total_amount = $6,
        currency = $7,
        sap_invoice_no = $8,
        invoice_type = $9,
        shipping_bill_number = $10,
        is_export = $11,
        brc_required = $12,
        notes = $13,
        updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `;
    
    const updateValues = [
      invoice.invoiceNumber,
      invoice.customerId,
      invoice.projectId || null,
      new Date(invoice.issueDate),
      new Date(invoice.dueDate),
      parseFloat(invoice.totalAmount),
      invoice.currency || 'USD',
      invoice.sapInvoiceNo || null,
      invoice.invoiceType || 'Product',
      invoice.shippingBillNumber || null,
      invoice.isExport || false,
      invoice.brcRequired !== undefined ? invoice.brcRequired : true,
      invoice.notes || null,
      invoiceId
    ];
    
    const updateResult = await pool.query(updateQuery, updateValues);
    
    if (!updateResult.rows || updateResult.rows.length === 0) {
      throw new Error('Failed to update invoice');
    }
    
    const updatedInvoice = updateResult.rows[0];
    
    // Delete existing invoice items
    const deleteItemsQuery = `DELETE FROM invoice_items WHERE invoice_id = $1`;
    await pool.query(deleteItemsQuery, [invoiceId]);
    
    // Insert new invoice items
    if (items && items.length > 0) {
      for (const item of items) {
        const itemQuery = `
          INSERT INTO invoice_items (
            invoice_id, description, quantity, unit_price, amount, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        `;
        
        const itemValues = [
          invoiceId,
          item.description || '',
          parseFloat(item.quantity) || 1,
          parseFloat(item.unitPrice) || 0,
          parseFloat(item.amount) || 0
        ];
        
        await pool.query(itemQuery, itemValues);
      }
    }
    
    // Format dates for response
    updatedInvoice.issueDate = new Date(updatedInvoice.issue_date).toISOString().split('T')[0];
    updatedInvoice.dueDate = new Date(updatedInvoice.due_date).toISOString().split('T')[0];
    
    res.json(updatedInvoice);
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ 
      error: 'Failed to update invoice',
      details: error.message 
    });
  }
});

// Payment allocation endpoint
router.post('/allocate-payment', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { paymentId, invoiceId, amount } = req.body;
    
    console.log('Processing payment allocation:', { paymentId, invoiceId, amount });
    
    if (!paymentId || !invoiceId || !amount) {
      return res.status(400).json({ error: 'Missing required fields: paymentId, invoiceId, amount' });
    }
    
    // Execute allocation using separate queries in a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update invoice with payment allocation
      await client.query(`
        UPDATE invoices 
        SET 
          paid_amount = COALESCE(paid_amount, 0) + $1,
          outstanding_amount = total_amount::numeric - (COALESCE(paid_amount, 0) + $1),
          status = CASE
            WHEN (total_amount::numeric - (COALESCE(paid_amount, 0) + $1)) <= 0 THEN 'Paid'
            WHEN (COALESCE(paid_amount, 0) + $1) > 0 THEN 'Partially Paid'
            ELSE status
          END,
          updated_at = NOW()
        WHERE id = $2
      `, [amount, invoiceId]);
      
      // Update payment with constraint-safe logic
      await client.query(`
        UPDATE payments 
        SET 
          allocated_amount = $1,
          unallocated_amount = amount - $1,
          updated_at = NOW()
        WHERE id = $2
      `, [amount, paymentId]);
      
      // Insert payment-invoice link
      await client.query(`
        INSERT INTO payment_invoice_links (payment_id, invoice_id, amount_applied, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
      `, [paymentId, invoiceId, amount]);
      
      await client.query('COMMIT');
      client.release();
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }
    
    console.log('Payment allocation completed successfully');
    
    res.json({ 
      success: true, 
      message: 'Payment allocated successfully',
      paymentId,
      invoiceId,
      amount 
    });
    
  } catch (error) {
    console.error('Error in payment allocation:', error);
    res.status(500).json({ 
      error: 'Failed to allocate payment',
      details: error.message 
    });
  }
});

// BRAND NEW APPROVAL ENDPOINT - COMPLETELY UNIQUE PATH
router.post('/writeoff-approve-action/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log(`🚀 NEW APPROVAL ENDPOINT HIT! 🚀`);
    const { id } = req.params;
    const approverId = req.user?.id;

    console.log(`✅ Approving write-off ${id} by user ${approverId}`);

    const updateQuery = `
      UPDATE write_offs 
      SET status = 'Approved', 
          approved_by = $1, 
          approval_date = NOW(), 
          updated_at = NOW()
      WHERE id = $2 AND status = 'Pending'
      RETURNING *
    `;

    console.log(`📝 Executing approval query for write-off ${id}`);
    const result = await pool.query(updateQuery, [approverId, id]);

    if (result.rows.length === 0) {
      console.log(`❌ Write-off ${id} not found or already processed`);
      return res.status(404).json({ 
        success: false, 
        message: 'Write-off not found or already processed' 
      });
    }

    console.log(`✅ Write-off ${id} approved successfully!`);
    res.json({ 
      success: true, 
      message: 'Write-off approved successfully',
      writeOff: result.rows[0] 
    });
  } catch (error: any) {
    console.error('❌ Error approving write-off:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to approve write-off',
      message: error.message 
    });
  }
});

// Keep the old endpoint for compatibility but with debugging
router.post('/write-offs/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log(`🚀 OLD APPROVAL ENDPOINT HIT IN SIMPLE-FINANCE-ROUTES! 🚀`);
    const { id } = req.params;
    const approverId = req.user?.id;

    console.log(`✅ Approving write-off ${id} by user ${approverId}`);

    const updateQuery = `
      UPDATE write_offs 
      SET status = 'Approved', 
          approved_by = $1, 
          approval_date = NOW(), 
          updated_at = NOW()
      WHERE id = $2 AND status = 'Pending'
      RETURNING *
    `;

    console.log(`📝 Executing approval query for write-off ${id}`);
    const result = await pool.query(updateQuery, [approverId, id]);

    if (result.rows.length === 0) {
      console.log(`❌ Write-off ${id} not found or already processed`);
      return res.status(404).json({ 
        success: false, 
        message: 'Write-off not found or already processed' 
      });
    }

    console.log(`✅ Write-off ${id} approved successfully!`);
    res.json({ 
      success: true, 
      message: 'Write-off approved successfully',
      writeOff: result.rows[0] 
    });
  } catch (error: any) {
    console.error('❌ Error approving write-off:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to approve write-off',
      message: error.message 
    });
  }
});

// Write-off rejection endpoint
router.post('/write-offs/:id/reject', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const approverId = req.user?.id;
    const { reason } = req.body;

    console.log(`Rejecting write-off ${id} by user ${approverId}`);

    const updateQuery = `
      UPDATE write_offs 
      SET status = 'Rejected', 
          approved_by = $1, 
          approval_date = NOW(), 
          rejection_reason = $2,
          updated_at = NOW()
      WHERE id = $3 AND status = 'Pending'
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [approverId, reason, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Write-off not found or already processed' 
      });
    }

    console.log(`Write-off ${id} rejected successfully`);
    res.json({ 
      success: true, 
      message: 'Write-off rejected successfully',
      writeOff: result.rows[0] 
    });
  } catch (error: any) {
    console.error('Error rejecting write-off:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reject write-off',
      message: error.message 
    });
  }
});

export default router;