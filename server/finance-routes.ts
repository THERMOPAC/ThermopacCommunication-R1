import express, { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { 
  invoices, 
  invoiceItems, 
  payments as paymentsTable, 
  paymentInvoiceLinks, 
  bankRealizationCertificates,
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertPaymentSchema,
  insertPaymentInvoiceLinkSchema,
  insertBankRealizationCertificateSchema
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router();

// Middleware to check if user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Get all invoices with optional filters
router.get('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { status, startDate, endDate, customerId } = req.query;
    
    let query = db.select().from(invoices);
    
    if (status) {
      query = query.where(eq(invoices.status, status as string));
    }
    
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(invoices.issueDate, startDate as string),
          lte(invoices.issueDate, endDate as string)
        )
      );
    }
    
    if (customerId) {
      query = query.where(eq(invoices.customerId, parseInt(customerId as string)));
    }
    
    const results = await query.orderBy(desc(invoices.issueDate));
    res.json(results);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get a specific invoice with its items
router.get('/invoices/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    // Make sure id is a valid integer
    if (!/^\d+$/.test(idParam)) {
      return res.status(400).json({ error: 'Invalid invoice ID format' });
    }
    
    const id = parseInt(idParam);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    const invoice = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    
    if (!invoice.length) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    
    const invoicePayments = await db
      .select({
        payment: paymentsTable,
        amountApplied: paymentInvoiceLinks.amountApplied
      })
      .from(paymentInvoiceLinks)
      .innerJoin(paymentsTable, eq(paymentInvoiceLinks.paymentId, paymentsTable.id))
      .where(eq(paymentInvoiceLinks.invoiceId, id));
    
    res.json({
      invoice: invoice[0],
      items,
      payments: invoicePayments
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice details' });
  }
});

// Create a new invoice with items
router.post('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { invoice: invoiceData, items } = req.body;
    
    // Validate invoice data
    const parsedInvoice = insertInvoiceSchema.parse({
      ...invoiceData,
      createdBy: user.id
    });
    
    // Begin transaction
    const result = await db.transaction(async (tx) => {
      // Insert invoice
      const [insertedInvoice] = await tx
        .insert(invoices)
        .values(parsedInvoice)
        .returning();
      
      // Insert invoice items
      if (items && items.length > 0) {
        await Promise.all(
          items.map(async (item: any) => {
            const parsedItem = insertInvoiceItemSchema.parse({
              ...item,
              invoiceId: insertedInvoice.id
            });
            
            await tx.insert(invoiceItems).values(parsedItem);
          })
        );
      }
      
      return insertedInvoice;
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating invoice:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Update invoice
router.put('/invoices/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const id = parseInt(req.params.id);
    const { invoice: invoiceData, items } = req.body;
    
    // Begin transaction
    const result = await db.transaction(async (tx) => {
      // Update invoice
      const [updatedInvoice] = await tx
        .update(invoices)
        .set({ 
          ...invoiceData,
          updatedAt: new Date()
        })
        .where(eq(invoices.id, id))
        .returning();
      
      if (!updatedInvoice) {
        throw new Error('Invoice not found');
      }
      
      // Delete existing items
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      
      // Insert updated items
      if (items && items.length > 0) {
        await Promise.all(
          items.map(async (item: any) => {
            const parsedItem = insertInvoiceItemSchema.parse({
              ...item,
              invoiceId: id
            });
            
            await tx.insert(invoiceItems).values(parsedItem);
          })
        );
      }
      
      return updatedInvoice;
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error updating invoice:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Update invoice status
router.patch('/invoices/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    
    const [updated] = await db
      .update(invoices)
      .set({ 
        status,
        updatedAt: new Date()
      })
      .where(eq(invoices.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
});

// Get all payments
router.get('/payments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = db.select().from(paymentsTable);
    
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(paymentsTable.paymentDate, startDate as string),
          lte(paymentsTable.paymentDate, endDate as string)
        )
      );
    }
    
    const results = await query.orderBy(desc(paymentsTable.paymentDate));
    res.json(results);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get a specific payment with linked invoices
router.get('/payments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    const payment = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id)).limit(1);
    
    if (!payment.length) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const invoiceLinks = await db
      .select({
        invoice: invoices,
        amountApplied: paymentInvoiceLinks.amountApplied
      })
      .from(paymentInvoiceLinks)
      .innerJoin(invoices, eq(paymentInvoiceLinks.invoiceId, invoices.id))
      .where(eq(paymentInvoiceLinks.paymentId, id));
    
    const brc = await db
      .select()
      .from(bankRealizationCertificates)
      .where(eq(bankRealizationCertificates.relatedPaymentId, id));
    
    res.json({
      payment: payment[0],
      invoiceLinks,
      bankRealizationCertificate: brc.length > 0 ? brc[0] : null
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: 'Failed to fetch payment details' });
  }
});

// Record a new payment and link to invoices
router.post('/payments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { payment: paymentData, invoiceLinks } = req.body;
    
    // Validate payment data
    const parsedPayment = insertPaymentSchema.parse({
      ...paymentData,
      createdBy: user.id
    });
    
    // Begin transaction
    const result = await db.transaction(async (tx) => {
      // Insert payment
      const [insertedPayment] = await tx
        .insert(paymentsTable)
        .values(parsedPayment)
        .returning();
      
      // Link payment to invoices
      if (invoiceLinks && invoiceLinks.length > 0) {
        await Promise.all(
          invoiceLinks.map(async (link: any) => {
            const parsedLink = insertPaymentInvoiceLinkSchema.parse({
              paymentId: insertedPayment.id,
              invoiceId: link.invoiceId,
              amountApplied: link.amountApplied
            });
            
            await tx.insert(paymentInvoiceLinks).values(parsedLink);
            
            // Check if invoice is fully paid and update status
            const invoice = await tx
              .select()
              .from(invoices)
              .where(eq(invoices.id, link.invoiceId))
              .limit(1);
            
            if (invoice.length > 0) {
              const totalPaid = await tx
                .select({
                  total: sql<number>`SUM(${paymentInvoiceLinks.amountApplied})`
                })
                .from(paymentInvoiceLinks)
                .where(eq(paymentInvoiceLinks.invoiceId, link.invoiceId));
              
              const paidAmount = totalPaid[0]?.total || 0;
              
              let newStatus = invoice[0].status;
              
              if (paidAmount >= invoice[0].totalAmount) {
                newStatus = 'Paid';
              } else if (paidAmount > 0) {
                newStatus = 'Partially Paid';
              }
              
              await tx
                .update(invoices)
                .set({ 
                  status: newStatus,
                  updatedAt: new Date()
                })
                .where(eq(invoices.id, link.invoiceId));
            }
          })
        );
      }
      
      return insertedPayment;
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error recording payment:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Get BRC records
router.get('/brc', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const results = await db
      .select()
      .from(bankRealizationCertificates)
      .orderBy(desc(bankRealizationCertificates.issueDate));
    
    res.json(results);
  } catch (error) {
    console.error('Error fetching BRC records:', error);
    res.status(500).json({ error: 'Failed to fetch BRC records' });
  }
});

// Create a new BRC record
router.post('/brc', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const brcData = req.body;
    
    // Validate BRC data
    const parsedBRC = insertBankRealizationCertificateSchema.parse({
      ...brcData,
      createdBy: user.id
    });
    
    const [result] = await db
      .insert(bankRealizationCertificates)
      .values(parsedBRC)
      .returning();
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating BRC record:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create BRC record' });
  }
});

// Get next invoice number
router.get('/invoices/next-number', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const financialYear = req.query.financialYear as string;
    
    if (!financialYear || !/^\d{4}$/.test(financialYear)) {
      return res.status(400).json({ error: 'Valid financial year is required (YYYY format)' });
    }
    
    // Find the highest serial number for the given financial year
    const yearPattern = `INV-${financialYear}-%`;
    
    const result = await db
      .select({
        maxInvoiceNumber: sql<string>`MAX(${invoices.invoiceNumber})`,
      })
      .from(invoices)
      .where(sql`${invoices.invoiceNumber} LIKE ${yearPattern}`);
    
    let nextNumber = 1;
    const maxInvoiceNumber = result[0]?.maxInvoiceNumber;
    
    console.log(`Generating invoice number for financial year ${financialYear}`, {
      maxInvoiceNumber,
      financialYear,
      yearPattern
    });
    
    if (maxInvoiceNumber) {
      // Extract the serial number from the invoice number (format: INV-YYYY-SERIES)
      const parts = maxInvoiceNumber.split('-');
      if (parts.length === 3) {
        const currentSerial = parseInt(parts[2]);
        if (!isNaN(currentSerial)) {
          nextNumber = currentSerial + 1;
        }
      }
    }
    
    // Format the next invoice number with leading zeros (e.g., 001, 010, 100)
    const formattedNextNumber = String(nextNumber).padStart(3, '0');
    const nextInvoiceNumber = `INV-${financialYear}-${formattedNextNumber}`;
    
    console.log(`Generated next invoice number: ${nextInvoiceNumber}`);
    res.json({ invoiceNumber: nextInvoiceNumber });
  } catch (error) {
    console.error('Error generating next invoice number:', error);
    res.status(500).json({ error: 'Failed to generate next invoice number' });
  }
});

// Dashboard data
router.get('/dashboard', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get total invoices amount
    const totalInvoicesAmount = await db
      .select({
        total: sql<number>`SUM(${invoices.totalAmount})`,
        count: sql<number>`COUNT(*)`
      })
      .from(invoices);
    
    // Get outstanding invoices
    const outstandingInvoices = await db
      .select({
        total: sql<number>`SUM(${invoices.totalAmount})`,
        count: sql<number>`COUNT(*)`
      })
      .from(invoices)
      .where(eq(invoices.status, 'Pending'));
    
    // Get overdue invoices
    const overdueInvoices = await db
      .select({
        total: sql<number>`SUM(${invoices.totalAmount})`,
        count: sql<number>`COUNT(*)`
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, 'Pending'),
          lte(invoices.dueDate, new Date().toISOString().split('T')[0])
        )
      );
    
    // Get total payments amount
    const totalPaymentsAmount = await db
      .select({
        total: sql<number>`SUM(${paymentsTable.amount})`,
        count: sql<number>`COUNT(*)`
      })
      .from(paymentsTable);
    
    // Get monthly revenue (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyRevenue = await db
      .select({
        month: sql<string>`to_char(${paymentsTable.paymentDate}, 'YYYY-MM')`,
        total: sql<number>`SUM(${paymentsTable.amount})`
      })
      .from(paymentsTable)
      .where(gte(paymentsTable.paymentDate, sixMonthsAgo.toISOString().split('T')[0]))
      .groupBy(sql`to_char(${paymentsTable.paymentDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${paymentsTable.paymentDate}, 'YYYY-MM')`);
    
    res.json({
      totalInvoices: {
        amount: totalInvoicesAmount[0]?.total || 0,
        count: totalInvoicesAmount[0]?.count || 0
      },
      outstandingInvoices: {
        amount: outstandingInvoices[0]?.total || 0,
        count: outstandingInvoices[0]?.count || 0
      },
      overdueInvoices: {
        amount: overdueInvoices[0]?.total || 0,
        count: overdueInvoices[0]?.count || 0
      },
      totalPayments: {
        amount: totalPaymentsAmount[0]?.total || 0,
        count: totalPaymentsAmount[0]?.count || 0
      },
      monthlyRevenue
    });
  } catch (error) {
    console.error('Error fetching finance dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Test invoice number generation (for debugging purposes)
router.get('/test/invoice-number', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required (format: YYYY-MM-DD)' });
    }
    
    // Parse the date
    const testDate = new Date(date as string);
    
    // Determine financial year
    const month = testDate.getMonth(); // 0-11 (Jan-Dec)
    const year = testDate.getFullYear();
    
    // If month is January(0), February(1), or March(2), it's the previous year's financial year
    // Otherwise, it's the current year's financial year
    const financialYear = month < 3 ? year - 1 : year;
    
    // Find the highest serial number for the given financial year
    const yearPattern = `INV-${financialYear}-%`;
    
    const result = await db
      .select({
        maxInvoiceNumber: sql<string>`MAX(${invoices.invoiceNumber})`,
      })
      .from(invoices)
      .where(sql`${invoices.invoiceNumber} LIKE ${yearPattern}`);
    
    let nextNumber = 1;
    const maxInvoiceNumber = result[0]?.maxInvoiceNumber;
    
    if (maxInvoiceNumber) {
      // Extract the serial number from the invoice number (format: INV-YYYY-SERIES)
      const parts = maxInvoiceNumber.split('-');
      if (parts.length === 3) {
        const currentSerial = parseInt(parts[2]);
        if (!isNaN(currentSerial)) {
          nextNumber = currentSerial + 1;
        }
      }
    }
    
    // Format the next invoice number with leading zeros (e.g., 001, 010, 100)
    const formattedNextNumber = String(nextNumber).padStart(3, '0');
    const nextInvoiceNumber = `INV-${financialYear}-${formattedNextNumber}`;
    
    res.json({
      testDate: testDate.toISOString().split('T')[0],
      month: month + 1, // Add 1 to make it 1-12 for human readability
      year,
      financialYear,
      yearPattern,
      currentMaxInvoice: maxInvoiceNumber || 'None',
      nextInvoiceNumber
    });
  } catch (error) {
    console.error('Error in test invoice number generation:', error);
    res.status(500).json({ error: 'Failed to test invoice number generation' });
  }
});

// Financial reports

// Turnover report
router.get('/reports/turnover', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    let query: any;
    
    switch (groupBy) {
      case 'client':
        query = db
          .select({
            clientId: invoices.customerId,
            total: sql<number>`SUM(${invoices.totalAmount})`
          })
          .from(invoices)
          .where(
            and(
              gte(invoices.issueDate, startDate as string),
              lte(invoices.issueDate, endDate as string)
            )
          )
          .groupBy(invoices.customerId);
        break;
      
      case 'project':
        query = db
          .select({
            projectId: invoices.projectId,
            total: sql<number>`SUM(${invoices.totalAmount})`
          })
          .from(invoices)
          .where(
            and(
              gte(invoices.issueDate, startDate as string),
              lte(invoices.issueDate, endDate as string),
              sql`${invoices.projectId} IS NOT NULL`
            )
          )
          .groupBy(invoices.projectId);
        break;
      
      case 'monthly':
      default:
        query = db
          .select({
            month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`,
            total: sql<number>`SUM(${invoices.totalAmount})`
          })
          .from(invoices)
          .where(
            and(
              gte(invoices.issueDate, startDate as string),
              lte(invoices.issueDate, endDate as string)
            )
          )
          .groupBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`)
          .orderBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`);
        break;
    }
    
    const results = await query;
    res.json(results);
  } catch (error) {
    console.error('Error generating turnover report:', error);
    res.status(500).json({ error: 'Failed to generate turnover report' });
  }
});

// Outstanding report
router.get('/reports/outstanding', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const outstandingInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        status: invoices.status,
        agingDays: sql<number>`EXTRACT(DAY FROM NOW() - ${invoices.dueDate})::INTEGER`
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, 'Pending'),
          lte(invoices.dueDate, new Date().toISOString().split('T')[0])
        )
      )
      .orderBy(desc(sql`EXTRACT(DAY FROM NOW() - ${invoices.dueDate})::INTEGER`));
    
    // Group by aging brackets
    const agingBrackets = {
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+': { count: 0, amount: 0 }
    };
    
    outstandingInvoices.forEach(invoice => {
      if (invoice.agingDays <= 30) {
        agingBrackets['1-30'].count++;
        agingBrackets['1-30'].amount += Number(invoice.totalAmount);
      } else if (invoice.agingDays <= 60) {
        agingBrackets['31-60'].count++;
        agingBrackets['31-60'].amount += Number(invoice.totalAmount);
      } else if (invoice.agingDays <= 90) {
        agingBrackets['61-90'].count++;
        agingBrackets['61-90'].amount += Number(invoice.totalAmount);
      } else {
        agingBrackets['90+'].count++;
        agingBrackets['90+'].amount += Number(invoice.totalAmount);
      }
    });
    
    res.json({
      invoices: outstandingInvoices,
      agingBrackets
    });
  } catch (error) {
    console.error('Error generating outstanding report:', error);
    res.status(500).json({ error: 'Failed to generate outstanding report' });
  }
});

// Inward remittances report
router.get('/reports/remittances', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, foreignCurrencyOnly } = req.query;
    
    let query = db
      .select({
        payment: paymentsTable,
        brc: bankRealizationCertificates
      })
      .from(paymentsTable)
      .leftJoin(
        bankRealizationCertificates, 
        eq(paymentsTable.id, bankRealizationCertificates.relatedPaymentId)
      );
    
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(paymentsTable.paymentDate, startDate as string),
          lte(paymentsTable.paymentDate, endDate as string)
        )
      );
    }
    
    if (foreignCurrencyOnly === 'true') {
      query = query.where(sql`${paymentsTable.currency} != 'INR'`);
    }
    
    const results = await query.orderBy(desc(paymentsTable.paymentDate));
    res.json(results);
  } catch (error) {
    console.error('Error generating remittances report:', error);
    res.status(500).json({ error: 'Failed to generate remittances report' });
  }
});

export default router;