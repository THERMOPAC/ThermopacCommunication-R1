import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { storage } from './storage';
import { InsertInvoice, InsertInvoiceItem } from '@shared/schema';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { pool } from './db';

const router = Router();

// Add a route for getting invoice list using direct database access
router.get('/invoices-list', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Getting invoices list with direct SQL');
    
    // Use a simple direct query to get all invoices
    try {
      const query = `
        SELECT 
          id,
          invoice_number AS "invoiceNumber",
          customer_id AS "customerId",
          issue_date AS "issueDate",
          due_date AS "dueDate",
          total_amount AS "totalAmount",
          currency,
          status,
          sap_invoice_no AS "sapInvoiceNo", 
          invoice_type AS "invoiceType",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM invoices 
        ORDER BY created_at DESC
        LIMIT 50
      `;
      
      const result = await pool.query(query);
      
      if (result && result.rows && result.rows.length > 0) {
        console.log('Found invoices in database:', result.rows.length);
        
        // Format dates for frontend display
        const formattedInvoices = result.rows.map(invoice => ({
          ...invoice,
          issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().split('T')[0] : null,
          dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : null,
          customerName: `Customer ${invoice.customerId}` // Default placeholder
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
    
    // Prepare the invoice data for database insertion - using exact database column names
    const invoiceData: InsertInvoice = {
      invoice_number: invoice.invoiceNumber,
      customer_id: invoice.customerId,
      project_id: invoice.projectId || null,
      issue_date: new Date(invoice.issue_date || invoice.issueDate),
      due_date: new Date(invoice.due_date || invoice.dueDate),
      total_amount: totalAmount,
      currency: invoice.currency || 'USD',
      sap_invoice_no: invoice.sap_invoice_no || invoice.sapInvoiceNo || null,
      invoice_type: invoice.invoice_type || invoice.invoiceType || 'Product',
      status: 'Pending',
      notes: invoice.notes || null,
      created_by: req.user?.id || 1
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
        notes = $10,
        updated_at = NOW()
      WHERE id = $11
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

export default router;