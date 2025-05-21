import { Router, Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';

export const ultraSimpleAllocationApi = Router();

/**
 * Ultra-simple allocation endpoint - absolutely basic implementation
 * This is designed to be extremely reliable
 */
ultraSimpleAllocationApi.post('/allocate', ensureAuthenticated, async (req: Request, res: Response) => {
  // Validate request
  const { paymentId, invoiceId, amount } = req.body;
  
  if (!paymentId || !invoiceId || !amount) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields'
    });
  }
  
  try {
    // Start a database transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Insert allocation record
      const insertResult = await client.query(
        'INSERT INTO payment_allocations (payment_id, invoice_id, amount_applied, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
        [paymentId, invoiceId, amount]
      );
      
      const allocationId = insertResult.rows[0]?.id;
      
      // 2. Update invoice outstanding amount
      await client.query(
        'UPDATE invoices SET outstanding_amount = total_amount - $1 WHERE id = $2',
        [amount, invoiceId]
      );
      
      // 3. Update payment allocated and unallocated amount
      await client.query(
        'UPDATE payments SET allocated_amount = COALESCE(allocated_amount, 0) + $1, unallocated_amount = amount - (COALESCE(allocated_amount, 0) + $1) WHERE id = $2',
        [amount, paymentId]
      );
      
      // Commit the transaction
      await client.query('COMMIT');
      
      // Return success
      return res.status(200).json({
        success: true,
        message: 'Allocation successful',
        allocationId
      });
    } catch (err) {
      // Rollback in case of any error
      await client.query('ROLLBACK');
      throw err;
    } finally {
      // Release client back to pool
      client.release();
    }
  } catch (error) {
    console.error('Error in ultra-simple allocation:', error);
    return res.status(500).json({
      success: false,
      message: 'Database error occurred',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all allocations for a payment
 */
ultraSimpleAllocationApi.get('/payment/:paymentId', ensureAuthenticated, async (req: Request, res: Response) => {
  const { paymentId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT pa.id, pa.payment_id, pa.invoice_id, pa.amount_applied, pa.created_at,
        p.payment_reference, i.invoice_number
      FROM payment_allocations pa
      JOIN payments p ON pa.payment_id = p.id
      JOIN invoices i ON pa.invoice_id = i.id
      WHERE pa.payment_id = $1
      ORDER BY pa.created_at DESC`,
      [paymentId]
    );
    
    return res.status(200).json({
      success: true,
      allocations: result.rows
    });
  } catch (error) {
    console.error('Error fetching allocations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch allocations',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all allocations for an invoice
 */
ultraSimpleAllocationApi.get('/invoice/:invoiceId', ensureAuthenticated, async (req: Request, res: Response) => {
  const { invoiceId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT pa.id, pa.payment_id, pa.invoice_id, pa.amount_applied, pa.created_at,
        p.payment_reference, i.invoice_number
      FROM payment_allocations pa
      JOIN payments p ON pa.payment_id = p.id
      JOIN invoices i ON pa.invoice_id = i.id
      WHERE pa.invoice_id = $1
      ORDER BY pa.created_at DESC`,
      [invoiceId]
    );
    
    return res.status(200).json({
      success: true,
      allocations: result.rows
    });
  } catch (error) {
    console.error('Error fetching allocations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch allocations',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});