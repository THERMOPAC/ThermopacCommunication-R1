import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';

const router = Router();

/**
 * Get payment allocations for a specific invoice
 */
router.get('/invoices/:invoiceId/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is required' });
    }

    // First get the invoice details
    const invoiceQuery = `
      SELECT 
        i.id,
        i.invoice_number as "invoiceNumber",
        i.customer_id as "customerId",
        c.bp_name as "customerName",
        i.issue_date as "issueDate",
        i.due_date as "dueDate",
        i.total_amount as "totalAmount",
        i.outstanding_amount as "outstandingAmount",
        i.currency,
        i.status,
        i.invoice_type as "invoiceType"
      FROM 
        invoices i
      LEFT JOIN
        customers c ON i.customer_id = c.id
      WHERE 
        i.id = $1
    `;

    const invoiceResult = await pool.query(invoiceQuery, [invoiceId]);
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];

    // Get all payment allocations for this invoice
    const allocationsQuery = `
      SELECT 
        pa.id,
        pa.invoice_id as "invoiceId",
        pa.payment_id as "paymentId",
        pa.amount as "allocatedAmount",
        pa.created_at as "createdAt",
        p.reference_number as "paymentReference",
        p.payment_date as "paymentDate",
        p.payment_method as "paymentMethod",
        p.amount as "paymentTotal",
        p.currency,
        p.payment_type as "paymentType",
        p.irm_no as "irmNo",
        p.sap_payment_no as "sapPaymentNo"
      FROM 
        payment_allocations pa
      JOIN
        payments p ON pa.payment_id = p.id
      WHERE 
        pa.invoice_id = $1
      ORDER BY
        p.payment_date DESC
    `;
    
    const allocationsResult = await pool.query(allocationsQuery, [invoiceId]);
    const allocations = allocationsResult.rows;

    // Calculate total allocated
    const totalAllocated = allocations.reduce((total: number, allocation: any) => {
      return total + parseFloat(allocation.allocatedAmount);
    }, 0);

    return res.status(200).json({ 
      invoice,
      allocations,
      totalAllocated
    });
  } catch (error) {
    console.error('Error fetching invoice payment allocations:', error);
    return res.status(500).json({ error: 'Error fetching invoice payment allocations' });
  }
});

export default router;