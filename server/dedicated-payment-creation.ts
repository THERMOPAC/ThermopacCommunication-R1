import type { Express, Request, Response } from "express";
import { db } from "./db";
import { payments } from "@shared/schema";
import { sql } from "drizzle-orm";
// Authentication middleware - basic version
const ensureAuthenticated = (req: any, res: any, next: any) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
};

export function setupDedicatedPaymentCreation(app: Express) {
  app.post('/api/payment-creation-dedicated', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('=== DEDICATED PAYMENT ENDPOINT HIT ===');
      console.log('Creating new payment with data:', req.body);
      
      const {
        irm_no: irmNo,
        paymentDate,
        amount,
        customerId,
        currency,
        paymentMethod,
        paymentType,
        notes = null,
        sapPaymentNo = null,
        isAdvancePayment = false
      } = req.body;

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      // Generate reference number
      const today = new Date(paymentDate);
      const month = today.getMonth();
      const year = today.getFullYear();
      const startYear = month < 3 ? year - 1 : year;
      const endYear = startYear + 1;
      const financialYear = `${startYear.toString().slice(-2)}${endYear.toString().slice(-2)}`;
      
      // Get next sequence number using direct DB query
      const existingPayments = await db.select().from(payments);
      const currentYearPayments = existingPayments.filter(p => {
        const paymentYear = new Date(p.payment_date).getFullYear();
        const paymentMonth = new Date(p.payment_date).getMonth();
        const paymentStartYear = paymentMonth < 3 ? paymentYear - 1 : paymentYear;
        const paymentFinancialYear = `${paymentStartYear.toString().slice(-2)}${(paymentStartYear + 1).toString().slice(-2)}`;
        return paymentFinancialYear === financialYear;
      });
      
      const sequenceNumber = String(currentYearPayments.length + 1).padStart(3, '0');
      const referenceNumber = `PAY-${financialYear}-${sequenceNumber}`;

      const paymentData = {
        irm_no: irmNo || null,
        payment_date: paymentDate,
        sap_payment_no: sapPaymentNo,
        payment_type: paymentType,
        amount: parseFloat(amount),
        currency: currency,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes: notes,
        is_advance_payment: isAdvancePayment,
        customer_id: parseInt(customerId),
        allocated_amount: 0,
        unallocated_amount: parseFloat(amount),
        created_by: userId
      };

      console.log('Payment data to create:', paymentData);

      // Use direct database client with parameterized query
      const insertQuery = `
        INSERT INTO payments (
          irm_no, payment_date, sap_payment_no, payment_type, amount, currency, 
          payment_method, reference_number, notes, is_advance_payment, 
          customer_id, allocated_amount, unallocated_amount, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *
      `;
      
      const values = [
        paymentData.irm_no,
        paymentData.payment_date,
        paymentData.sap_payment_no,
        paymentData.payment_type,
        paymentData.amount,
        paymentData.currency,
        paymentData.payment_method,
        paymentData.reference_number,
        paymentData.notes,
        paymentData.is_advance_payment,
        paymentData.customer_id,
        paymentData.allocated_amount,
        paymentData.unallocated_amount,
        paymentData.created_by
      ];

      console.log('SQL Query:', insertQuery);
      console.log('Values:', values);
      
      const result = await db.execute(sql`
        INSERT INTO payments (
          irm_no, payment_date, sap_payment_no, payment_type, amount, currency, 
          payment_method, notes, is_advance_payment, 
          customer_id, allocated_amount, unallocated_amount, created_by
        ) VALUES (
          ${paymentData.irm_no}, ${paymentData.payment_date}, ${paymentData.sap_payment_no}, 
          ${paymentData.payment_type}, ${paymentData.amount}, ${paymentData.currency}, 
          ${paymentData.payment_method}, ${paymentData.notes}, 
          ${paymentData.is_advance_payment}, ${paymentData.customer_id}, ${paymentData.allocated_amount}, 
          ${paymentData.unallocated_amount}, ${paymentData.created_by}
        ) RETURNING *
      `);
      const newPayment = result.rows;
      console.log('Created payment:', newPayment[0]);

      return res.json({
        success: true,
        payment: newPayment,
        message: 'Payment created successfully'
      });

    } catch (error) {
      console.error('Error creating payment:', error);
      console.error('Payment data that failed:', req.body);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment',
        details: error.message || 'Unknown error'
      });
    }
  });
}