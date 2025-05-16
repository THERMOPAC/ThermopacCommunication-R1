import { Request, Response, Router } from 'express';
import { db } from './db';
import { ensureAuthenticated } from './auth-middleware';
import { invoices, payments as paymentsTable, paymentInvoiceLinks, bankRealizationCertificates } from '@shared/schema';
import { and, eq, sql, desc, lte, gte, not, gt, asc } from 'drizzle-orm';

const router = Router();

/**
 * Get overall financial dashboard data
 */
router.get('/dashboard', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get total invoices
    const totalInvoicesResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
        amount: sql<string>`SUM(${invoices.totalAmount})`
      })
      .from(invoices);
    
    // Get total paid
    const totalPaidResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
        amount: sql<string>`SUM(${invoices.totalAmount})`
      })
      .from(invoices)
      .where(eq(invoices.status, 'Paid'));
    
    // Get total unpaid
    const totalUnpaidResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
        amount: sql<string>`SUM(${invoices.totalAmount})`
      })
      .from(invoices)
      .where(eq(invoices.status, 'Unpaid'));
    
    // Get latest payments
    const latestPayments = await db
      .select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.paymentDate))
      .limit(5);
    
    // Get latest invoices
    const latestInvoices = await db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.issueDate))
      .limit(5);
    
    res.json({
      totalInvoices: totalInvoicesResult[0],
      totalPaid: totalPaidResult[0],
      totalUnpaid: totalUnpaidResult[0],
      latestPayments,
      latestInvoices
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

/**
 * Get all invoices
 */
router.get('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const results = await db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.issueDate));
    
    res.json(results);
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

/**
 * Get a specific invoice by ID
 */
router.get('/invoices/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, parseInt(id)));
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error(`Error getting invoice ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

/**
 * Get all payments
 */
router.get('/payments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const results = await db
      .select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.paymentDate));
    
    res.json(results);
  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

/**
 * Get a specific payment by ID
 */
router.get('/payments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const payment = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, parseInt(id)));
    
    if (payment.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // Get invoice links for this payment
    const links = await db
      .select({
        link: paymentInvoiceLinks,
        invoice: invoices
      })
      .from(paymentInvoiceLinks)
      .leftJoin(invoices, eq(paymentInvoiceLinks.invoiceId, invoices.id))
      .where(eq(paymentInvoiceLinks.paymentId, parseInt(id)));
    
    res.json({
      payment: payment[0],
      invoiceLinks: links
    });
  } catch (error) {
    console.error(`Error getting payment ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get payment' });
  }
});

/**
 * Create a new invoice
 */
router.post('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      invoiceNumber,
      customerId,
      issueDate,
      dueDate,
      totalAmount,
      tax,
      currency,
      status,
      notes
    } = req.body;
    
    // Validate required fields
    if (!invoiceNumber || !customerId || !issueDate || !dueDate || !totalAmount || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await db.insert(invoices).values({
      invoiceNumber,
      customerId,
      issueDate,
      dueDate,
      totalAmount,
      tax: tax || '0.00',
      currency: currency || 'USD',
      status,
      notes: notes || null,
      createdBy: req.user.id
    }).returning();
    
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

/**
 * Create a new payment
 */
router.post('/payments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      referenceNumber,
      customerId,
      paymentDate,
      amount,
      paymentMethod,
      currency,
      notes,
      isAdvancePayment,
      invoiceLinks
    } = req.body;
    
    // Validate required fields
    if (!paymentDate || !amount || !paymentMethod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Insert payment
    const payment = await db.insert(paymentsTable).values({
      referenceNumber,
      customerId,
      paymentDate,
      amount,
      paymentMethod,
      currency: currency || 'USD',
      notes: notes || null,
      isAdvancePayment: isAdvancePayment || false,
      allocationStatus: isAdvancePayment ? 'Unallocated' : 'Allocated',
      createdBy: req.user.id
    }).returning();
    
    const paymentId = payment[0].id;
    
    // If invoice links are provided, create payment-invoice links
    if (invoiceLinks && Array.isArray(invoiceLinks) && invoiceLinks.length > 0) {
      const linkValues = invoiceLinks.map(link => ({
        paymentId,
        invoiceId: link.invoiceId,
        amountApplied: link.amountApplied
      }));
      
      await db.insert(paymentInvoiceLinks).values(linkValues);
      
      // Update invoice status based on payment
      for (const link of invoiceLinks) {
        const invoice = await db
          .select({
            id: invoices.id,
            totalAmount: invoices.totalAmount
          })
          .from(invoices)
          .where(eq(invoices.id, link.invoiceId));
        
        if (invoice.length > 0) {
          // Get total payments for this invoice
          const payments = await db
            .select({
              totalPaid: sql<string>`SUM(${paymentInvoiceLinks.amountApplied})`
            })
            .from(paymentInvoiceLinks)
            .where(eq(paymentInvoiceLinks.invoiceId, link.invoiceId));
          
          const totalPaid = parseFloat(payments[0].totalPaid || '0');
          const invoiceTotal = parseFloat(invoice[0].totalAmount);
          
          let status = 'Unpaid';
          if (totalPaid >= invoiceTotal) {
            status = 'Paid';
          } else if (totalPaid > 0) {
            status = 'Partially Paid';
          }
          
          await db
            .update(invoices)
            .set({ status })
            .where(eq(invoices.id, link.invoiceId));
        }
      }
    }
    
    res.status(201).json(payment[0]);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

/**
 * Update invoice status
 */
router.patch('/invoices/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const result = await db
      .update(invoices)
      .set({ status })
      .where(eq(invoices.id, parseInt(id)))
      .returning();
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error(`Error updating invoice ${req.params.id} status:`, error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
});

/**
 * Add a BRC (Bank Realization Certificate) for a payment
 */
router.post('/payments/:id/brc', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { certificateNumber, issueDate, bankName, documentUrl } = req.body;
    
    // Validate payment exists
    const payment = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, parseInt(id)));
    
    if (payment.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // Create BRC
    const result = await db
      .insert(bankRealizationCertificates)
      .values({
        relatedPaymentId: parseInt(id),
        certificateNumber,
        issueDate,
        bankName,
        documentUrl,
        createdBy: req.user.id
      })
      .returning();
    
    res.status(201).json(result[0]);
  } catch (error) {
    console.error(`Error adding BRC for payment ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to add BRC' });
  }
});

/**
 * Get all BRCs
 */
router.get('/brc', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const results = await db
      .select({
        brc: bankRealizationCertificates,
        payment: paymentsTable
      })
      .from(bankRealizationCertificates)
      .leftJoin(paymentsTable, eq(bankRealizationCertificates.relatedPaymentId, paymentsTable.id))
      .orderBy(desc(bankRealizationCertificates.issueDate));
    
    res.json(results);
  } catch (error) {
    console.error('Error getting BRCs:', error);
    res.status(500).json({ error: 'Failed to get BRCs' });
  }
});

/**
 * Get foreign currency payments without BRC
 */
router.get('/payments/foreign-without-brc', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    // Get foreign payments that don't have a BRC
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          gte(paymentsTable.paymentDate, startDate as string),
          lte(paymentsTable.paymentDate, endDate as string),
          not(eq(paymentsTable.currency, 'INR'))
        )
      )
      .orderBy(asc(paymentsTable.paymentDate));
    
    // Filter out payments that already have a BRC
    const paymentsWithoutBrc = [];
    
    for (const payment of payments) {
      const brc = await db
        .select()
        .from(bankRealizationCertificates)
        .where(eq(bankRealizationCertificates.relatedPaymentId, payment.id));
      
      if (brc.length === 0) {
        paymentsWithoutBrc.push(payment);
      }
    }
    
    res.json(paymentsWithoutBrc);
  } catch (error) {
    console.error('Error getting foreign payments without BRC:', error);
    res.status(500).json({ error: 'Failed to get foreign payments without BRC' });
  }
});

/**
 * Allocate advance payment to invoices
 */
router.post('/payments/:id/allocate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceAllocations } = req.body;
    
    if (!invoiceAllocations || !Array.isArray(invoiceAllocations) || invoiceAllocations.length === 0) {
      return res.status(400).json({ error: 'Invoice allocations are required' });
    }
    
    // Validate payment exists and is an advance payment
    const payment = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.id, parseInt(id)),
          eq(paymentsTable.isAdvancePayment, true)
        )
      );
    
    if (payment.length === 0) {
      return res.status(404).json({ error: 'Advance payment not found' });
    }
    
    // Calculate total amount being allocated
    const totalAllocated = invoiceAllocations.reduce((sum, allocation) => {
      return sum + parseFloat(allocation.amountApplied);
    }, 0);
    
    // Ensure total allocated doesn't exceed payment amount
    if (totalAllocated > parseFloat(payment[0].amount)) {
      return res.status(400).json({ 
        error: 'Total allocated amount exceeds payment amount',
        payment: payment[0].amount,
        allocated: totalAllocated
      });
    }
    
    // Create payment-invoice links
    const linkValues = invoiceAllocations.map(allocation => ({
      paymentId: parseInt(id),
      invoiceId: allocation.invoiceId,
      amountApplied: allocation.amountApplied
    }));
    
    await db.insert(paymentInvoiceLinks).values(linkValues);
    
    // Update invoice statuses
    for (const allocation of invoiceAllocations) {
      const invoice = await db
        .select({
          id: invoices.id,
          totalAmount: invoices.totalAmount
        })
        .from(invoices)
        .where(eq(invoices.id, allocation.invoiceId));
      
      if (invoice.length > 0) {
        // Get total payments for this invoice
        const payments = await db
          .select({
            totalPaid: sql<string>`SUM(${paymentInvoiceLinks.amountApplied})`
          })
          .from(paymentInvoiceLinks)
          .where(eq(paymentInvoiceLinks.invoiceId, allocation.invoiceId));
        
        const totalPaid = parseFloat(payments[0].totalPaid || '0');
        const invoiceTotal = parseFloat(invoice[0].totalAmount);
        
        let status = 'Unpaid';
        if (totalPaid >= invoiceTotal) {
          status = 'Paid';
        } else if (totalPaid > 0) {
          status = 'Partially Paid';
        }
        
        await db
          .update(invoices)
          .set({ status })
          .where(eq(invoices.id, allocation.invoiceId));
      }
    }
    
    // Update payment allocation status if fully allocated
    const remainingAmount = parseFloat(payment[0].amount) - totalAllocated;
    const allocationStatus = remainingAmount <= 0 ? 'Fully Allocated' : 'Partially Allocated';
    
    await db
      .update(paymentsTable)
      .set({ allocationStatus })
      .where(eq(paymentsTable.id, parseInt(id)));
    
    // Get updated payment with its allocations
    const updatedPayment = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, parseInt(id)));
    
    const allocations = await db
      .select({
        link: paymentInvoiceLinks,
        invoice: invoices
      })
      .from(paymentInvoiceLinks)
      .leftJoin(invoices, eq(paymentInvoiceLinks.invoiceId, invoices.id))
      .where(eq(paymentInvoiceLinks.paymentId, parseInt(id)));
    
    res.json({
      payment: updatedPayment[0],
      allocations,
      remainingAmount
    });
  } catch (error) {
    console.error(`Error allocating payment ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to allocate payment' });
  }
});

/**
 * Get unallocated advance payments
 */
router.get('/payments/unallocated-advances', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get payments that are advance payments and not fully allocated
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.isAdvancePayment, true),
          not(eq(paymentsTable.allocationStatus, 'Fully Allocated'))
        )
      )
      .orderBy(desc(paymentsTable.paymentDate));
    
    // For each payment, calculate the remaining amount available for allocation
    const unallocatedAdvances = await Promise.all(
      payments.map(async (payment) => {
        // Get total amount already allocated
        const allocations = await db
          .select({
            totalAllocated: sql<string>`SUM(${paymentInvoiceLinks.amountApplied})`
          })
          .from(paymentInvoiceLinks)
          .where(eq(paymentInvoiceLinks.paymentId, payment.id));
        
        const totalAllocated = parseFloat(allocations[0].totalAllocated || '0');
        const remainingAmount = parseFloat(payment.amount) - totalAllocated;
        
        return {
          ...payment,
          totalAllocated,
          remainingAmount
        };
      })
    );
    
    res.json(unallocatedAdvances);
  } catch (error) {
    console.error('Error getting unallocated advances:', error);
    res.status(500).json({ error: 'Failed to fetch unallocated advances' });
  }
});

// Turnover report
router.get('/reports/turnover', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, currency } = req.query;
    
    // Query for invoices in the given period
    let query = db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        customerName: sql<string>`'Customer-' || CAST(${invoices.customerId} AS TEXT)`,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        amount: invoices.totalAmount,
        currency: invoices.currency,
        status: invoices.status
      })
      .from(invoices);
    
    // Apply date filters if provided
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(invoices.issueDate, startDate as string),
          lte(invoices.issueDate, endDate as string)
        )
      );
    }
    
    // Apply currency filter if provided
    if (currency && currency !== 'all') {
      query = query.where(eq(invoices.currency, currency as string));
    }
    
    const invoicesResult = await query.orderBy(desc(invoices.issueDate));
    
    // Calculate totals
    let totalInvoiced = 0;
    let totalInvoicedINR = 0;
    
    invoicesResult.forEach(invoice => {
      const amount = Number(invoice.amount);
      totalInvoiced += amount;
      
      // Convert to INR for USD invoices
      if (invoice.currency === 'USD') {
        totalInvoicedINR += amount * 85.55; // USD to INR conversion rate
      } else {
        totalInvoicedINR += amount;
      }
    });
    
    // Generate summary by month
    const monthlySummary = {};
    
    invoicesResult.forEach(invoice => {
      const month = invoice.issueDate.substring(0, 7); // Format: YYYY-MM
      if (!monthlySummary[month]) {
        monthlySummary[month] = {
          month,
          count: 0,
          amount: 0,
          amountINR: 0
        };
      }
      
      const amount = Number(invoice.amount);
      monthlySummary[month].count += 1;
      monthlySummary[month].amount += amount;
      
      // Convert to INR for USD invoices
      if (invoice.currency === 'USD') {
        monthlySummary[month].amountINR += amount * 85.55;
      } else {
        monthlySummary[month].amountINR += amount;
      }
    });
    
    // Convert to array and sort by month
    const monthlyData = Object.values(monthlySummary).sort((a: any, b: any) => {
      return a.month.localeCompare(b.month);
    });
    
    res.json({
      totalInvoiced,
      totalInvoicedINR,
      invoices: invoicesResult,
      monthlyData
    });
  } catch (error) {
    console.error('Error generating turnover report:', error);
    res.status(500).json({ error: 'Failed to generate turnover report' });
  }
});

// Outstanding invoices report
router.get('/reports/outstanding', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, currency } = req.query;
    
    // Query for outstanding invoices
    let query = db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        customerName: sql<string>`'Customer-' || CAST(${invoices.customerId} AS TEXT)`,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        amount: invoices.totalAmount,
        currency: invoices.currency,
        status: invoices.status,
        daysOverdue: sql<number>`CASE WHEN ${invoices.dueDate} < CURRENT_DATE AND ${invoices.status} != 'Paid' THEN EXTRACT(DAY FROM CURRENT_DATE - ${invoices.dueDate}::date) ELSE 0 END`
      })
      .from(invoices)
      .where(
        not(eq(invoices.status, 'Paid'))
      );
    
    // Apply date filters if provided
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(invoices.issueDate, startDate as string),
          lte(invoices.issueDate, endDate as string)
        )
      );
    }
    
    // Apply currency filter if provided
    if (currency && currency !== 'all') {
      query = query.where(eq(invoices.currency, currency as string));
    }
    
    const outstandingInvoices = await query.orderBy(desc(invoices.dueDate));
    
    // Calculate totals
    let totalOutstanding = 0;
    let totalOutstandingINR = 0;
    let totalOverdue = 0;
    let totalOverdueINR = 0;
    let totalWithinDue = 0;
    let totalWithinDueINR = 0;
    
    outstandingInvoices.forEach(invoice => {
      const amount = Number(invoice.amount);
      totalOutstanding += amount;
      
      // Convert to INR for USD invoices
      if (invoice.currency === 'USD') {
        totalOutstandingINR += amount * 85.55; // USD to INR conversion rate
      } else {
        totalOutstandingINR += amount;
      }
      
      // Categorize as overdue or within due date
      if (invoice.daysOverdue > 0) {
        totalOverdue += amount;
        if (invoice.currency === 'USD') {
          totalOverdueINR += amount * 85.55;
        } else {
          totalOverdueINR += amount;
        }
      } else {
        totalWithinDue += amount;
        if (invoice.currency === 'USD') {
          totalWithinDueINR += amount * 85.55;
        } else {
          totalWithinDueINR += amount;
        }
      }
    });
    
    res.json({
      totalOutstanding,
      totalOutstandingINR,
      totalOverdue,
      totalOverdueINR,
      totalWithinDue,
      totalWithinDueINR,
      outstandingInvoices
    });
  } catch (error) {
    console.error('Error generating outstanding report:', error);
    res.status(500).json({ error: 'Failed to generate outstanding report' });
  }
});

// Inward remittances report
router.get('/reports/remittances', ensureAuthenticated, (req: Request, res: Response) => {
  // Sample remittance data for demonstration
  const remittanceData = {
    totalRemittances: 72000,
    totalRemittancesINR: 6159600, // 72000 * 85.55
    totalBRCs: 2,
    pendingBRCs: 1,
    remittances: [
      {
        paymentId: 1,
        remittanceNumber: 'PAY-2526-001',
        date: '2025-06-15',
        customerName: 'Customer-1',
        amount: '25000.00',
        currency: 'USD',
        paymentMethod: 'Wire Transfer',
        invoiceNumber: 'INV-2526-001',
        brcId: null,
        brcStatus: 'Pending',
        brcDocumentUrl: null
      },
      {
        paymentId: 2,
        remittanceNumber: 'PAY-2526-002',
        date: '2025-07-22',
        customerName: 'Customer-2',
        amount: '15000.00',
        currency: 'USD',
        paymentMethod: 'Wire Transfer',
        invoiceNumber: 'INV-2526-002',
        brcId: 1,
        brcStatus: 'Issued',
        brcDocumentUrl: '/api/finance/brc/document/1'
      },
      {
        paymentId: 3,
        remittanceNumber: 'PAY-2526-003',
        date: '2025-08-05',
        customerName: 'Customer-3',
        amount: '32000.00',
        currency: 'USD',
        paymentMethod: 'Bank Transfer',
        invoiceNumber: 'INV-2526-003',
        brcId: 2,
        brcStatus: 'Issued',
        brcDocumentUrl: '/api/finance/brc/document/2'
      }
    ]
  };
  
  // Send the data directly without any database queries
  res.json(remittanceData);
});

export default router;
