import { Router, Request, Response } from 'express';
import { pool } from './db';

const router = Router();

/**
 * Direct invoice creation endpoint that uses raw SQL to ensure field name matching
 * This bypasses the ORM layer to prevent field mapping issues
 */
router.post('/invoices/direct', async (req: Request, res: Response) => {
  // Check authentication
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // Log the received data for debugging
    console.log('Creating invoice with direct method, data:', JSON.stringify(req.body, null, 2));
    
    // Extract data from the request body
    const { invoice, items } = req.body;
    
    if (!invoice || !invoice.invoiceNumber) {
      return res.status(400).json({ 
        error: 'Invalid request body - invoice data or invoice number missing' 
      });
    }
    
    // Calculate total amount if not provided
    const totalAmount = invoice.totalAmount || 
      (items && items.length > 0 
        ? items.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0) 
        : 0);
    
    // Use client from the pool for transaction
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      // Insert invoice using properly mapped column names
      const insertInvoiceQuery = `
        INSERT INTO invoices (
          invoice_number, customer_id, project_id, issue_date, due_date, 
          total_amount, outstanding_amount, paid_amount, currency, exchange_rate, status, notes, created_by, sap_invoice_no, invoice_type,
          is_export, brc_required, shipping_bill_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
        RETURNING *
      `;
      
      const invoiceValues = [
        invoice.invoiceNumber,
        invoice.customerId,
        invoice.projectId || null,
        invoice.issueDate,
        invoice.dueDate,
        totalAmount,
        totalAmount, // outstanding_amount = total_amount initially
        0, // paid_amount = 0 initially
        invoice.currency || 'USD',
        parseFloat(invoice.exchangeRate || '1.0000'),
        'Pending',
        invoice.notes || null,
        req.user?.id || 1,
        invoice.sapInvoiceNo && invoice.sapInvoiceNo !== '' ? invoice.sapInvoiceNo : null,
        invoice.invoiceType || 'Product',
        invoice.isExport || false,
        invoice.brcRequired !== undefined ? invoice.brcRequired : true, // Default to true
        invoice.shippingBillNumber || null
      ];
      
      // Execute invoice insertion
      const invoiceResult = await client.query(insertInvoiceQuery, invoiceValues);
      const newInvoice = invoiceResult.rows[0];
      
      // Insert invoice items
      if (items && items.length > 0) {
        const itemInsertPromises = items.map((item: any) => {
          const insertItemQuery = `
            INSERT INTO invoice_items (
              invoice_id, description, quantity, unit_price, amount
            ) VALUES ($1, $2, $3, $4, $5) 
            RETURNING *
          `;
          
          const itemValues = [
            newInvoice.id,
            item.description || '',
            parseFloat(item.quantity) || 1,
            parseFloat(item.unitPrice) || parseFloat(item.amount) || 0,
            parseFloat(item.amount) || 0
          ];
          
          return client.query(insertItemQuery, itemValues);
        });
        
        await Promise.all(itemInsertPromises);
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      // Success response
      res.status(201).json({
        success: true,
        message: 'Invoice created successfully',
        invoice: newInvoice
      });
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Database error in direct invoice creation:', error);
      throw error;
    } finally {
      // Release client back to pool
      client.release();
    }
  } catch (error: any) {
    console.error('Error in direct invoice creation:', error);
    res.status(500).json({ 
      error: 'Failed to create invoice directly',
      details: error.message 
    });
  }
});

/**
 * Update an existing invoice using direct SQL for reliable field mapping
 */
router.put('/invoices/direct/:id', async (req: Request, res: Response) => {
  // Check authentication
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // Extract data from the request body
    const { invoice, items } = req.body;
    
    if (!invoice) {
      return res.status(400).json({ 
        error: 'Invalid request body - invoice data missing' 
      });
    }
    
    // Use client from the pool for transaction
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      // First get the current invoice to preserve status and payment fields
      const currentInvoiceQuery = `SELECT status, paid_amount, outstanding_amount FROM invoices WHERE id = $1`;
      const currentInvoiceResult = await client.query(currentInvoiceQuery, [invoiceId]);
      
      if (currentInvoiceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Invoice not found' });
      }
      
      const currentInvoice = currentInvoiceResult.rows[0];
      
      // Update invoice
      const updateInvoiceQuery = `
        UPDATE invoices SET
          invoice_number = $1,
          customer_id = $2,
          project_id = $3,
          issue_date = $4,
          due_date = $5,
          total_amount = $6,
          currency = $7,
          exchange_rate = $8,
          status = $9,
          notes = $10,
          sap_invoice_no = $11,
          invoice_type = $12,
          shipping_bill_number = $13,
          is_export = $14,
          brc_required = $15
        WHERE id = $16
        RETURNING *
      `;
      
      const invoiceValues = [
        invoice.invoiceNumber,
        invoice.customerId,
        invoice.projectId || null,
        invoice.issueDate,
        invoice.dueDate,
        invoice.totalAmount,
        invoice.currency || 'USD',
        parseFloat(invoice.exchangeRate || '1.0000'),
        currentInvoice.status, // Preserve original status
        invoice.notes || null,
        invoice.sapInvoiceNo || null,
        invoice.invoiceType || 'Product',
        invoice.shippingBillNumber || null,
        invoice.isExport || false,
        invoice.brcRequired !== undefined ? invoice.brcRequired : true,
        invoiceId
      ];
      
      // Execute invoice update
      const invoiceResult = await client.query(updateInvoiceQuery, invoiceValues);
      
      if (invoiceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Invoice not found' });
      }
      
      const updatedInvoice = invoiceResult.rows[0];
      
      // Handle invoice items - delete existing ones first
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
      
      // Then insert new items
      if (items && items.length > 0) {
        const itemInsertPromises = items.map((item: any) => {
          const insertItemQuery = `
            INSERT INTO invoice_items (
              invoice_id, description, quantity, unit_price, amount
            ) VALUES ($1, $2, $3, $4, $5) 
            RETURNING *
          `;
          
          const itemValues = [
            invoiceId,
            item.description || '',
            parseFloat(item.quantity) || 1,
            parseFloat(item.unitPrice) || parseFloat(item.amount) || 0,
            parseFloat(item.amount) || 0
          ];
          
          return client.query(insertItemQuery, itemValues);
        });
        
        await Promise.all(itemInsertPromises);
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      // Success response
      res.status(200).json({
        success: true,
        message: 'Invoice updated successfully',
        invoice: updatedInvoice
      });
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Database error in direct invoice update:', error);
      throw error;
    } finally {
      // Release client back to pool
      client.release();
    }
  } catch (error: any) {
    console.error('Error in direct invoice update:', error);
    res.status(500).json({ 
      error: 'Failed to update invoice directly',
      details: error.message 
    });
  }
});

export default router;