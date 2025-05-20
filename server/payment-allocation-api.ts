import { Router, Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';

export const paymentAllocationApi = Router();

/**
 * Get payment allocations for a specific invoice
 */
paymentAllocationApi.get('/invoices/:invoiceId/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // Get all payment allocations for this invoice with payment details
    // Also join with invoices table to filter by matching payment and invoice types
    const query = `
      SELECT 
        pa.id as allocation_id,
        pa.payment_id,
        pa.invoice_id,
        pa.amount_allocated,
        pa.created_at as allocation_date,
        p.reference_number as payment_reference,
        p.payment_date,
        p.payment_method,
        p.payment_type,
        p.sap_payment_no,
        p.irm_no,
        p.amount as payment_total,
        p.currency,
        i.invoice_type
      FROM 
        payment_allocations pa
      JOIN 
        payments p ON pa.payment_id = p.id
      JOIN 
        invoices i ON pa.invoice_id = i.id
      WHERE 
        pa.invoice_id = $1
        AND p.payment_type = i.invoice_type
      ORDER BY 
        pa.created_at DESC
    `;
    
    const result = await pool.query(query, [invoiceId]);
    
    // Transform the results to a more frontend-friendly format
    const allocations = result.rows.map(row => ({
      id: row.allocation_id,
      paymentId: row.payment_id,
      invoiceId: row.invoice_id,
      allocatedAmount: row.amount_allocated,
      allocationDate: row.allocation_date,
      paymentReference: row.payment_reference,
      paymentDate: row.payment_date,
      paymentMethod: row.payment_method,
      paymentType: row.payment_type,
      sapPaymentNo: row.sap_payment_no,
      irmNo: row.irm_no,
      paymentTotal: row.payment_total,
      currency: row.currency
    }));
    
    res.json(allocations);
  } catch (error) {
    console.error('Error fetching payment allocations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment allocations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get payment allocations for a specific payment
 */
paymentAllocationApi.get('/payments/:paymentId/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.paymentId);
    
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    // Get all invoice allocations for this payment with invoice details
    const query = `
      SELECT 
        pa.id as allocation_id,
        pa.payment_id,
        pa.invoice_id,
        pa.amount_applied as amount_allocated,
        pa.created_at as allocation_date,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.total_amount as invoice_total,
        i.outstanding_amount,
        i.status as invoice_status,
        i.invoice_type,
        i.sap_invoice_no,
        i.currency
      FROM 
        payment_allocations pa
      JOIN 
        invoices i ON pa.invoice_id = i.id
      WHERE 
        pa.payment_id = $1
      ORDER BY 
        pa.created_at DESC
    `;
    
    const result = await pool.query(query, [paymentId]);
    
    // Transform the results to a more frontend-friendly format
    const allocations = result.rows.map(row => ({
      id: row.allocation_id,
      paymentId: row.payment_id,
      invoiceId: row.invoice_id,
      allocatedAmount: row.amount_allocated,
      allocationDate: row.allocation_date,
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      invoiceTotal: row.invoice_total,
      outstandingAmount: row.outstanding_amount,
      invoiceStatus: row.invoice_status,
      invoiceType: row.invoice_type,
      sapInvoiceNo: row.sap_invoice_no,
      currency: row.currency
    }));
    
    res.json(allocations);
  } catch (error) {
    console.error('Error fetching payment allocations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment allocations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get summary of allocation status for multiple invoices
 */
paymentAllocationApi.get('/invoices/allocation-summary', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceIds = req.query.ids;
    
    if (!invoiceIds) {
      return res.status(400).json({ error: 'Invoice IDs are required' });
    }
    
    // Parse the comma-separated IDs
    const ids = String(invoiceIds).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid invoice IDs provided' });
    }
    
    // Get summary of allocations for these invoices
    const query = `
      SELECT 
        i.id as invoice_id,
        i.invoice_number,
        i.total_amount,
        i.outstanding_amount,
        COALESCE(SUM(pa.amount_allocated), 0) as total_allocated
      FROM 
        invoices i
      LEFT JOIN 
        payment_allocations pa ON i.id = pa.invoice_id
      WHERE 
        i.id = ANY($1::int[])
      GROUP BY 
        i.id, i.invoice_number, i.total_amount, i.outstanding_amount
    `;
    
    const result = await pool.query(query, [ids]);
    
    // Transform to a more useful format
    const summaries = result.rows.map(row => ({
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      totalAmount: parseFloat(row.total_amount),
      outstandingAmount: parseFloat(row.outstanding_amount || row.total_amount),
      totalAllocated: parseFloat(row.total_allocated),
      paymentPercentage: parseFloat(row.total_allocated) / parseFloat(row.total_amount) * 100
    }));
    
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching allocation summaries:', error);
    res.status(500).json({ 
      error: 'Failed to fetch allocation summaries',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});