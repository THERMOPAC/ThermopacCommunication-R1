import type { Express, Request, Response } from "express";
import { db } from "./db";
import { payments } from "@shared/schema";
// Authentication middleware - basic version
const ensureAuthenticated = (req: any, res: any, next: any) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
};

export function setupDedicatedPaymentCreation(app: Express) {
  app.post('/api/create-new-payment', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('Creating new payment with data:', req.body);
      
      const {
        irmNo,
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
        reference_number: referenceNumber,
        irm_no: irmNo || null,
        payment_date: paymentDate,
        sap_payment_no: sapPaymentNo,
        payment_type: paymentType,
        amount: parseFloat(amount),
        currency: currency,
        payment_method: paymentMethod,
        notes: notes,
        is_advance_payment: isAdvancePayment,
        customer_id: parseInt(customerId),
        allocated_amount: 0,
        unallocated_amount: parseFloat(amount),
        created_by: userId
      };

      console.log('Payment data to create:', paymentData);

      // Direct database insertion to bypass routing issues
      const newPayment = await db.insert(payments).values(paymentData).returning();
      console.log('Created payment:', newPayment[0]);

      return res.json({
        success: true,
        payment: newPayment,
        message: 'Payment created successfully'
      });

    } catch (error) {
      console.error('Error creating payment:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment'
      });
    }
  });
}