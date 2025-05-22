import { Router, Request, Response } from 'express';
import { db } from './db.js';

const router = Router();

// Middleware to ensure user is authenticated
const ensureAuthenticated = (req: Request, res: Response, next: any) => {
  if (req.user) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
};

/**
 * Get unallocated advance payments - clean implementation
 */
router.get('/unallocated-advances', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Fetching unallocated advance payments...');
    
    const query = `
      SELECT 
        p.id, 
        p.irm_no as "paymentReference",
        p.customer_id as "customerId",
        c.bp_name as "customerName",
        p.payment_date as "paymentDate",
        p.amount,
        p.allocated_amount as "allocatedAmount",
        p.unallocated_amount as "unallocatedAmount",
        p.payment_method as "paymentMethod",
        p.payment_type as "paymentType",
        p.currency,
        p.notes,
        p.is_advance_payment as "isAdvancePayment"
      FROM 
        payments p
      JOIN 
        customers c ON p.customer_id = c.id
      WHERE 
        p.is_advance_payment = true
        AND p.unallocated_amount > 0
      ORDER BY 
        p.payment_date DESC
    `;
    
    const result = await pool.query(query);
    const advances = result.rows;
    
    console.log(`Found ${advances.length} unallocated advance payments`);
    
    // Calculate total unallocated amount
    const totalUnallocated = advances.reduce((sum, payment) => {
      const amount = parseFloat(payment.unallocatedAmount) || 0;
      return sum + amount;
    }, 0);
    
    res.json({
      advances: advances,
      totalUnallocatedAmount: totalUnallocated.toFixed(2),
      count: advances.length
    });
    
  } catch (error) {
    console.error('Error getting unallocated advances:', error);
    res.status(500).json({
      error: 'Failed to fetch unallocated advances',
      advances: [],
      totalUnallocatedAmount: "0.00",
      count: 0
    });
  }
});

export default router;