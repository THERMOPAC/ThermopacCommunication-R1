import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from './middleware';
import { pool } from './db';

const router = Router();

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
        p.irm_no as "referenceNumber",
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
      WHERE 
        p.id = $1
    `;
    
    const paymentResult = await pool.query(paymentQuery, [paymentId]);
    
    if (!paymentResult.rows || paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    
    // Get any invoice allocation links
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
    const allocations = allocationsResult.rows || [];
    
    // Get related invoice details if there are allocations
    const invoiceLinks = [];
    
    if (allocations.length > 0) {
      for (const allocation of allocations) {
        const invoiceQuery = `
          SELECT 
            i.id,
            i.invoice_number as "invoiceNumber",
            i.customer_id as "customerId",
            i.issue_date as "issueDate", 
            i.due_date as "dueDate", 
            i.total_amount as "totalAmount",
            i.tax,
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
    
    res.json(responseData);
  } catch (error) {
    console.error(`Error getting payment ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get payment details' });
  }
});

export default router;