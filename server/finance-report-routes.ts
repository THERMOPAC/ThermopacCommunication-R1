import { Router, Request, Response } from 'express';
import { financeReportService } from './finance-report-service';

export const financeReportRouter = Router();

// Note: Authentication middleware removed temporarily for demo purposes
// In a production environment, proper authentication would be implemented

/**
 * Get reconciliation report
 */
financeReportRouter.get('/reconciliation', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // For demo purposes, we're returning sample data
    // In a production environment, this would be real data from the database
    res.json({
      reportDate: new Date().toISOString(),
      period: {
        startDate: startDate || 'All Time',
        endDate: endDate || 'Present'
      },
      outstandingInvoices: {
        summary: [
          {
            invoice_type: 'Product',
            count: 12,
            total_amount: 456789,
            outstanding_amount: 234567
          },
          {
            invoice_type: 'Service',
            count: 8,
            total_amount: 345678,
            outstanding_amount: 123456
          }
        ],
        aging: [
          {
            aging_period: '0-30 days',
            count: 8,
            outstanding_amount: 150000
          },
          {
            aging_period: '31-60 days',
            count: 6,
            outstanding_amount: 120000
          },
          {
            aging_period: '61-90 days',
            count: 4,
            outstanding_amount: 68000
          },
          {
            aging_period: 'Over 90 days',
            count: 2,
            outstanding_amount: 20023
          }
        ],
        topCustomers: [
          {
            customer_name: 'ABC Industries',
            invoice_count: 5,
            outstanding_amount: 120000
          },
          {
            customer_name: 'XYZ Corporation',
            invoice_count: 3,
            outstanding_amount: 95000
          },
          {
            customer_name: 'Acme Solutions',
            invoice_count: 4,
            outstanding_amount: 78000
          }
        ],
        totalOutstanding: 358023
      },
      advancePayments: {
        breakdown: [
          {
            payment_type: 'Product',
            count: 3,
            total_amount: 150000,
            unallocated_amount: 75000
          },
          {
            payment_type: 'Service',
            count: 2,
            total_amount: 80000,
            unallocated_amount: 45000
          }
        ],
        totalAvailable: 120000
      },
      recentAllocations: {
        recentAllocations: [
          {
            id: 1,
            payment_ref: 'PAY-2022-001',
            invoice_number: 'INV-2022-001',
            allocated_amount: 25000,
            created_at: '2025-05-15T10:30:00.000Z',
            customer_name: 'ABC Industries'
          },
          {
            id: 2,
            payment_ref: 'PAY-2022-002',
            invoice_number: 'INV-2022-003',
            allocated_amount: 15000,
            created_at: '2025-05-14T11:20:00.000Z',
            customer_name: 'XYZ Corporation'
          },
          {
            id: 3,
            payment_ref: 'PAY-2022-003',
            invoice_number: 'INV-2022-007',
            allocated_amount: 18500,
            created_at: '2025-05-13T09:45:00.000Z',
            customer_name: 'Acme Solutions'
          }
        ],
        totalAllocated: 58500
      },
      writeOffs: {
        recentWriteOffs: [
          {
            id: 1,
            invoice_number: 'INV-2022-005',
            amount: 5000,
            reason: 'Goodwill Adjustment',
            created_at: '2025-05-10T14:30:00.000Z',
            customer_name: 'ABC Industries'
          },
          {
            id: 2,
            invoice_number: 'INV-2022-008',
            amount: 3500,
            reason: 'Rounding Difference',
            created_at: '2025-05-09T10:15:00.000Z',
            customer_name: 'XYZ Corporation'
          }
        ],
        byReason: [
          {
            reason: 'Goodwill Adjustment',
            count: 3,
            total_amount: 12000
          },
          {
            reason: 'Rounding Difference',
            count: 5,
            total_amount: 7500
          },
          {
            reason: 'Bad Debt',
            count: 1,
            total_amount: 25000
          }
        ],
        totalWrittenOff: 44500
      },
      healthIndicators: {
        dso: 45.3,
        avgDaysToPayment: 32,
        writeOffPercentage: 1.2,
        outstandingToRevenueRatio: 0.35
      },
      recommendations: {
        priorityActions: [
          {
            action: 'Follow up on aged receivables',
            description: '2 invoices totaling INR 20023 are overdue by more than 90 days.',
            priority: 'High'
          },
          {
            action: 'Allocate advance payments',
            description: '5 advance payments with INR 120000 remain unallocated.',
            priority: 'Medium'
          }
        ],
        generalRecommendations: [
          'Review credit terms with customers that consistently pay late',
          'Consider early payment discounts for customers with large outstanding balances',
          'Implement more regular follow-ups on invoices as they approach 60 days outstanding',
          'Review write-off policies to ensure they align with business goals'
        ]
      }
    });
  } catch (error) {
    console.error('Error generating reconciliation report:', error);
    res.status(500).json({ error: 'Failed to generate reconciliation report' });
  }
});

/**
 * Get turnover report
 */
financeReportRouter.get('/turnover', (req: Request, res: Response) => {
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
financeReportRouter.get('/outstanding', (req: Request, res: Response) => {
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
financeReportRouter.get('/remittances', (req: Request, res: Response) => {
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