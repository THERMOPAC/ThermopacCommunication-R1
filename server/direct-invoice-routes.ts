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
          total_amount, currency, status, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        RETURNING *
      `;
      
      const invoiceValues = [
        invoice.invoiceNumber,
        invoice.customerId,
        invoice.projectId || null,
        invoice.issueDate,
        invoice.dueDate,
        totalAmount,
        invoice.currency || 'USD',
        'Pending',
        invoice.notes || null,
        req.user?.id || 1
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

export default router;