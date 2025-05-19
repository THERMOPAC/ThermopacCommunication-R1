import { Router, Request, Response } from 'express';
import { financeReportService } from './finance-report-service';

export const financeReportRouter = Router();

// Authentication middleware to ensure user is logged in
const checkAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
};

/**
 * Get reconciliation report
 */
financeReportRouter.get('/reconciliation', checkAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const report = await financeReportService.generateReconciliationReport(
      startDate as string, 
      endDate as string
    );
    
    res.json(report);
  } catch (error) {
    console.error('Error generating reconciliation report:', error);
    res.status(500).json({ error: 'Failed to generate reconciliation report' });
  }
});

/**
 * Get turnover report
 */
financeReportRouter.get('/turnover', checkAuthenticated, (req: Request, res: Response) => {
  // Currently returning demo data
  // This will be implemented with real data in the future
  res.json({
    reportDate: new Date().toISOString(),
    data: [
      {
        month: 'January',
        productRevenue: 456500,
        serviceRevenue: 184300,
        totalRevenue: 640800
      },
      {
        month: 'February',
        productRevenue: 521000,
        serviceRevenue: 193000,
        totalRevenue: 714000
      },
      {
        month: 'March',
        productRevenue: 498650,
        serviceRevenue: 201500,
        totalRevenue: 700150
      },
      {
        month: 'April',
        productRevenue: 467800,
        serviceRevenue: 213450,
        totalRevenue: 681250
      },
      {
        month: 'May',
        productRevenue: 495000,
        serviceRevenue: 220000,
        totalRevenue: 715000
      }
    ]
  });
});

/**
 * Get outstanding invoices report
 */
financeReportRouter.get('/outstanding', checkAuthenticated, (req: Request, res: Response) => {
  // Currently returning demo data
  // This will be implemented with real data in the future
  res.json({
    reportDate: new Date().toISOString(),
    totalOutstanding: 1234500,
    data: [
      {
        customer: 'ABC Corporation',
        invoiceCount: 3,
        totalOutstanding: 345000,
        oldestInvoiceDate: '2025-04-15',
        status: 'Some Overdue'
      },
      {
        customer: 'XYZ Industries',
        invoiceCount: 2,
        totalOutstanding: 283000,
        oldestInvoiceDate: '2025-05-01',
        status: 'Current'
      },
      {
        customer: 'Global Enterprises',
        invoiceCount: 4,
        totalOutstanding: 412000,
        oldestInvoiceDate: '2025-03-20',
        status: 'All Overdue'
      },
      {
        customer: 'Tech Solutions Inc',
        invoiceCount: 1,
        totalOutstanding: 94500,
        oldestInvoiceDate: '2025-05-10',
        status: 'Current'
      },
      {
        customer: 'Standard Manufacturing',
        invoiceCount: 2,
        totalOutstanding: 100000,
        oldestInvoiceDate: '2025-04-28',
        status: 'Some Overdue'
      }
    ]
  });
});

/**
 * Get inward remittances report
 */
financeReportRouter.get('/remittances', checkAuthenticated, (req: Request, res: Response) => {
  // Currently returning demo data
  // This will be implemented with real data in the future
  res.json({
    reportDate: new Date().toISOString(),
    totalRemittances: 830000,
    data: [
      {
        paymentRef: 'PAY-2526-010',
        customer: 'ABC Corporation',
        amount: 200000,
        currency: 'USD',
        remittanceDate: '2025-05-12',
        brcStatus: 'Received'
      },
      {
        paymentRef: 'PAY-2526-009',
        customer: 'XYZ Industries',
        amount: 150000,
        currency: 'EUR',
        remittanceDate: '2025-05-08',
        brcStatus: 'Pending'
      },
      {
        paymentRef: 'PAY-2526-008',
        customer: 'Global Enterprises',
        amount: 180000,
        currency: 'USD',
        remittanceDate: '2025-05-01',
        brcStatus: 'Received'
      },
      {
        paymentRef: 'PAY-2526-007',
        customer: 'Tech Solutions Inc',
        amount: 120000,
        currency: 'EUR',
        remittanceDate: '2025-04-25',
        brcStatus: 'Not Required'
      },
      {
        paymentRef: 'PAY-2526-006',
        customer: 'Standard Manufacturing',
        amount: 180000,
        currency: 'USD',
        remittanceDate: '2025-04-18',
        brcStatus: 'Received'
      }
    ]
  });
});