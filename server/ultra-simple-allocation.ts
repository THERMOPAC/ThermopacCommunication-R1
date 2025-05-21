import { Router, Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';

export const ultraSimpleAllocationApi = Router();

/**
 * Ultra-simple allocation endpoint - absolutely basic implementation
 * This is designed to be extremely reliable
 */
ultraSimpleAllocationApi.post('/allocate', ensureAuthenticated, async (req: Request, res: Response) => {
  // Force content type
  res.setHeader('Content-Type', 'application/json');
  
  // Validate request
  const { paymentId, invoiceId, amount } = req.body;
  
  if (!paymentId || !invoiceId || !amount) {
    return res.json({
      success: false,
      message: 'Missing required fields'
    });
  }
  
  try {
    // 1. Insert allocation record
    const insertResult = await pool.query(
      'INSERT INTO payment_allocations (payment_id, invoice_id, amount_applied, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [paymentId, invoiceId, amount]
    );
    
    const allocationId = insertResult.rows[0]?.id;
    
    // 2. Update invoice paid amount
    await pool.query(
      'UPDATE invoices SET paid_amount = COALESCE(paid_amount, 0) + $1, outstanding_amount = total_amount - (COALESCE(paid_amount, 0) + $1) WHERE id = $2',
      [amount, invoiceId]
    );
    
    // 3. Update payment allocated amount
    await pool.query(
      'UPDATE payments SET allocated_amount = COALESCE(allocated_amount, 0) + $1, remaining_amount = amount - (COALESCE(allocated_amount, 0) + $1) WHERE id = $2',
      [amount, paymentId]
    );
    
    // Return success
    return res.json({
      success: true,
      message: 'Allocation successful',
      allocationId
    });
  } catch (error) {
    console.error('Error in ultra-simple allocation:', error);
    return res.json({
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
  // Force content type
  res.setHeader('Content-Type', 'application/json');
  
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
    
    return res.json({
      success: true,
      allocations: result.rows
    });
  } catch (error) {
    console.error('Error fetching allocations:', error);
    return res.json({
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
  // Force content type
  res.setHeader('Content-Type', 'application/json');
  
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
    
    return res.json({
      success: true,
      allocations: result.rows
    });
  } catch (error) {
    console.error('Error fetching allocations:', error);
    return res.json({
      success: false,
      message: 'Failed to fetch allocations',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});