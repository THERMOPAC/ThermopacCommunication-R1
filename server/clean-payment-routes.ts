import { Router, Request, Response } from 'express';
import { db } from './db.js';
import { sql } from 'drizzle-orm';

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
    
    const result = await db.execute(sql`
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
    `);
    const advances = result.rows;
    
    console.log(`Found ${advances.length} unallocated advance payments`);
    
    // Calculate total unallocated amount
    const totalUnallocated = advances.reduce((sum: number, payment: any) => {
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

/**
 * Create a new payment - clean implementation that returns JSON
 */
router.post('/create-payment-simple', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('Creating new payment (clean route):', req.body);
    
    const { 
      paymentDate, 
      sapPaymentNo,
      paymentType,
      amount, 
      currency = 'USD', 
      paymentMethod, 
      notes,
      isAdvancePayment = true,
      customerId,
      irmNo
    } = req.body;
    
    // Validate required fields
    if (!amount || !paymentDate || !customerId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Amount, payment date, and customer ID are required'
      });
    }
    
    // Basic parameter cleanup
    const cleanAmount = parseFloat(amount);
    const payDate = new Date(paymentDate);
    const customer = parseInt(customerId);
    
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount value' });
    }
    
    if (isNaN(customer)) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    
    // Insert the payment record using direct SQL
    const insertResult = await db.execute(sql`
      INSERT INTO payments (
        payment_date, 
        amount, 
        currency, 
        payment_method, 
        notes,
        is_advance_payment,
        customer_id,
        created_by,
        created_at,
        updated_at,
        unallocated_amount,
        allocated_amount,
        payment_type,
        irm_no,
        sap_payment_no
      ) VALUES (
        ${payDate}, ${cleanAmount}, ${currency}, ${paymentMethod}, ${notes},
        ${isAdvancePayment}, ${customer}, ${(req.user as any)?.id || 1}, 
        NOW(), NOW(), ${cleanAmount}, 0, ${paymentType}, ${irmNo}, ${sapPaymentNo}
      )
      RETURNING id
    `);
    
    // Get the newly created payment ID
    const paymentId = insertResult.rows[0]?.id;
    
    if (!paymentId) {
      throw new Error('Failed to create payment - no ID returned');
    }
    
    // Update reference number to use payment ID
    const refNumber = `PAY-2526-${String(paymentId).padStart(3, '0')}`;
    await db.execute(sql`
      UPDATE payments 
      SET reference_number = ${refNumber} 
      WHERE id = ${paymentId}
    `);
    
    // Return success with payment details
    return res.status(201).json({
      success: true,
      message: 'Payment created successfully',
      paymentId: paymentId,
      referenceNumber: refNumber
    });
    
  } catch (error) {
    console.error('Error creating payment:', error);
    return res.status(500).json({ 
      error: 'Failed to create payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;