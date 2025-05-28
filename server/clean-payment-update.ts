import { Router, Request, Response } from 'express';
import { pool } from './storage';

const router = Router();

// Middleware to ensure user is authenticated
const ensureAuthenticated = (req: any, res: any, next: any) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

/**
 * Clean payment update endpoint - fixes the duplicate column assignment error
 */
router.post('/payments/update-clean/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id);
    const payment = req.body;
    
    console.log('Clean payment update for ID:', paymentId);
    console.log('Payment data:', payment);
    
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    // Extract and normalize the data
    const irmNo = payment.irmNo || null;
    const paymentDate = new Date(payment.paymentDate);
    const sapPaymentNo = payment.sapPaymentNo || null;
    const paymentType = payment.paymentType || 'Service';
    
    // Clean UPDATE query with no duplicate columns
    const updateQuery = `
      UPDATE payments SET
        irm_no = $1,
        payment_date = $2,
        sap_payment_no = $3,
        payment_type = $4,
        amount = $5,
        currency = $6,
        payment_method = $7,
        notes = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `;
    
    const values = [
      irmNo,
      paymentDate.toISOString().split('T')[0],
      sapPaymentNo,
      paymentType,
      payment.amount,
      payment.currency || 'USD',
      payment.paymentMethod || 'bank transfer',
      payment.notes || null,
      paymentId
    ];
    
    console.log('Executing clean update with values:', values);
    
    const result = await pool.query(updateQuery, values);
    
    if (!result || !result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const updatedPayment = result.rows[0];
    
    res.json({
      message: 'Payment updated successfully',
      payment: {
        id: updatedPayment.id,
        irmNo: updatedPayment.irm_no,
        paymentDate: updatedPayment.payment_date,
        sapPaymentNo: updatedPayment.sap_payment_no,
        paymentType: updatedPayment.payment_type,
        amount: updatedPayment.amount.toString(),
        currency: updatedPayment.currency,
        paymentMethod: updatedPayment.payment_method,
        notes: updatedPayment.notes
      }
    });
    
  } catch (error) {
    console.error('Clean payment update error:', error);
    res.status(500).json({ 
      error: 'Failed to update payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as cleanPaymentUpdateRouter };