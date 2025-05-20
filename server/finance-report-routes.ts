import { Router, Request, Response } from 'express';
import { financeReportService } from './finance-report-service';
import { db } from './db';

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
financeReportRouter.get('/turnover', async (req: Request, res: Response) => {
  try {
    // Get filter parameters from query
    const { year, month } = req.query;
    
    // Default to current year if not provided
    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
    
    // Build query for monthly revenue data
    const query = `
      SELECT 
        TO_CHAR(date, 'Month') as month,
        EXTRACT(MONTH FROM date)::int as month_num,
        SUM(CASE WHEN invoice_type = 'Product' THEN total_amount ELSE 0 END) as product_revenue,
        SUM(CASE WHEN invoice_type = 'Service' THEN total_amount ELSE 0 END) as service_revenue,
        SUM(total_amount) as total_revenue
      FROM 
        invoices
      WHERE 
        EXTRACT(YEAR FROM date) = $1
        ${month ? 'AND EXTRACT(MONTH FROM date) = $2' : ''}
      GROUP BY 
        month, month_num
      ORDER BY 
        month_num ASC
    `;

    const params = month ? [targetYear, parseInt(month as string)] : [targetYear];
    
    const { rows } = await db.query(query, params);
    
    // If no data found, return empty array
    if (!rows || rows.length === 0) {
      return res.json({
        reportDate: new Date().toISOString(),
        data: []
      });
    }
    
    // Format the data for response
    const formattedData = rows.map(row => ({
      month: row.month.trim(), // Trim any whitespace
      productRevenue: parseFloat(row.product_revenue) || 0,
      serviceRevenue: parseFloat(row.service_revenue) || 0,
      totalRevenue: parseFloat(row.total_revenue) || 0
    }));
    
    res.json({
      reportDate: new Date().toISOString(),
      data: formattedData
    });
  } catch (error) {
    console.error('Error generating turnover report:', error);
    res.status(500).json({ error: 'Failed to generate turnover report' });
  }
});

/**
 * Get outstanding invoices report
 */
financeReportRouter.get('/outstanding', async (req: Request, res: Response) => {
  try {
    // Get customer-wise outstanding invoice data
    const query = `
      WITH invoice_summary AS (
        SELECT 
          i.customer_id,
          c.name as customer_name,
          COUNT(i.id) as invoice_count,
          SUM(i.total_amount - COALESCE(i.allocated_amount, 0)) as total_outstanding,
          MIN(i.date) as oldest_invoice_date,
          SUM(CASE WHEN (CURRENT_DATE - i.date) > 30 THEN 1 ELSE 0 END) as overdue_count
        FROM 
          invoices i
        JOIN 
          customers c ON i.customer_id = c.id
        WHERE 
          (i.total_amount - COALESCE(i.allocated_amount, 0)) > 0
        GROUP BY 
          i.customer_id, c.name
      )
      SELECT 
        customer_name as customer,
        invoice_count,
        total_outstanding,
        oldest_invoice_date,
        CASE 
          WHEN overdue_count = 0 THEN 'Current'
          WHEN overdue_count = invoice_count THEN 'All Overdue'
          ELSE 'Some Overdue'
        END as status
      FROM 
        invoice_summary
      ORDER BY 
        total_outstanding DESC
    `;
    
    const { rows } = await db.query(query);
    
    // Calculate total outstanding amount
    const totalOutstanding = rows.reduce((sum, row) => sum + parseFloat(row.total_outstanding), 0);
    
    // Format dates and numbers
    const formattedData = rows.map(row => ({
      customer: row.customer,
      invoiceCount: parseInt(row.invoice_count),
      totalOutstanding: parseFloat(row.total_outstanding),
      oldestInvoiceDate: row.oldest_invoice_date,
      status: row.status
    }));
    
    res.json({
      reportDate: new Date().toISOString(),
      totalOutstanding,
      data: formattedData
    });
  } catch (error) {
    console.error('Error generating outstanding invoices report:', error);
    res.status(500).json({ error: 'Failed to generate outstanding invoices report' });
  }
});

/**
 * Get inward remittances report
 */
financeReportRouter.get('/remittances', async (req: Request, res: Response) => {
  try {
    // Optional date range filtering
    const { startDate, endDate } = req.query;
    
    // Build query with date filtering
    let dateFilter = '';
    const params: any[] = [];
    
    if (startDate && endDate) {
      dateFilter = 'AND p.payment_date BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = 'AND p.payment_date >= $1';
      params.push(startDate);
    } else if (endDate) {
      dateFilter = 'AND p.payment_date <= $1';
      params.push(endDate);
    }
    
    // Query for payments with inward remittance details
    const query = `
      SELECT 
        p.payment_reference as payment_ref,
        c.name as customer_name,
        p.amount,
        p.currency,
        p.payment_date as remittance_date,
        COALESCE(p.brc_status, 'Not Processed') as brc_status
      FROM 
        payments p
      JOIN 
        customers c ON p.customer_id = c.id
      WHERE 
        p.payment_category = 'Inward Remittance'
        ${dateFilter}
      ORDER BY 
        p.payment_date DESC
    `;
    
    const { rows } = await db.query(query, params);
    
    // Calculate total remittance amount
    const totalRemittances = rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
    
    // Format data for response
    const formattedData = rows.map(row => ({
      paymentRef: row.payment_ref,
      customer: row.customer_name,
      amount: parseFloat(row.amount),
      currency: row.currency || 'USD',
      remittanceDate: row.remittance_date,
      brcStatus: row.brc_status
    }));
    
    res.json({
      reportDate: new Date().toISOString(),
      totalRemittances,
      data: formattedData
    });
  } catch (error) {
    console.error('Error generating remittances report:', error);
    res.status(500).json({ error: 'Failed to generate remittances report' });
  }
});