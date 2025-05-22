import type { Express, Request, Response } from "express";
import { neon } from "@neondatabase/serverless";

// Direct database connection
const sql = neon(process.env.DATABASE_URL!);

// Authentication middleware
const ensureAuthenticated = (req: any, res: any, next: any) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
};

export function setupCleanPaymentCreation(app: Express) {
  app.post('/api/clean-payment-creation', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('=== CLEAN PAYMENT ENDPOINT HIT ===');
      const { irm_no, paymentDate, sapPaymentNo, paymentType, amount, currency, paymentMethod, notes, isAdvancePayment, customerId } = req.body;
      
      console.log('Creating payment with data:', {
        irm_no, paymentDate, sapPaymentNo, paymentType, amount, currency, paymentMethod, notes, isAdvancePayment, customerId
      });

      // Calculate allocation amounts
      const numericAmount = parseFloat(amount);
      const allocatedAmount = 0; // Initially unallocated
      const unallocatedAmount = numericAmount;

      // Direct SQL insert without any ORM dependencies
      const result = await sql`
        INSERT INTO payments (
          irm_no, payment_date, sap_payment_no, payment_type, amount, currency, 
          payment_method, notes, is_advance_payment, 
          customer_id, allocated_amount, unallocated_amount, created_by
        ) VALUES (
          ${irm_no}, ${paymentDate}, ${sapPaymentNo}, ${paymentType}, ${numericAmount}, ${currency},
          ${paymentMethod}, ${notes}, ${isAdvancePayment},
          ${parseInt(customerId)}, ${allocatedAmount}, ${unallocatedAmount}, ${req.user.id}
        ) RETURNING *
      `;

      console.log('Payment created successfully:', result[0]);
      
      res.json({
        success: true,
        payment: result[0],
        message: 'Payment created successfully'
      });

    } catch (error: any) {
      console.error('Clean payment creation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create payment',
        details: error.message
      });
    }
  });
}