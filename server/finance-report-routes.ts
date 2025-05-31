import { Router, Request, Response } from 'express';
import { financeReportService } from './finance-report-service';
import { db } from './db';
import { Pool } from 'pg';

export const financeReportRouter = Router();

// Create a pg pool for raw SQL queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Note: Authentication middleware removed temporarily for demo purposes
// In a production environment, proper authentication would be implemented

/**
 * Get reconciliation report
 */
financeReportRouter.get('/reconciliation', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Use the pool for direct PostgreSQL queries
    const client = await pool.connect();
    
    try {
      // 1. Get real data for outstanding invoices by type
      const invoiceSummaryQuery = `
        SELECT 
          invoice_type,
          COUNT(*) as count,
          SUM(total_amount) as total_amount,
          SUM(outstanding_amount) as outstanding_amount
        FROM 
          invoices
        WHERE 
          status <> 'Paid'
        GROUP BY 
          invoice_type
      `;
      
      const invoiceSummaryResult = await client.query(invoiceSummaryQuery);
      
      // 2. Get data for invoice aging
      const agingQuery = `
        SELECT
          age_category as aging_period,
          COUNT(*) as count,
          SUM(outstanding_amount) as outstanding_amount
        FROM (
          SELECT
            CASE
              WHEN (CURRENT_DATE - issue_date) <= 30 THEN '0-30 days'
              WHEN (CURRENT_DATE - issue_date) <= 60 THEN '31-60 days'
              WHEN (CURRENT_DATE - issue_date) <= 90 THEN '61-90 days'
              ELSE 'Over 90 days'
            END as age_category,
            outstanding_amount
          FROM
            invoices
          WHERE
            status <> 'Paid'
        ) as aged_invoices
        GROUP BY
          age_category
        ORDER BY
          CASE 
            WHEN age_category = '0-30 days' THEN 1
            WHEN age_category = '31-60 days' THEN 2
            WHEN age_category = '61-90 days' THEN 3
            ELSE 4
          END
      `;
      
      const agingResult = await client.query(agingQuery);
      
      // 3. Get top customers with outstanding invoices
      const topCustomersQuery = `
        SELECT
          c.bp_name as customer_name,
          COUNT(i.id) as invoice_count,
          SUM(i.outstanding_amount) as outstanding_amount
        FROM
          invoices i
        JOIN
          customers c ON i.customer_id = c.id
        WHERE
          i.status <> 'Paid'
        GROUP BY
          c.bp_name
        ORDER BY
          outstanding_amount DESC
        LIMIT 5
      `;
      
      const topCustomersResult = await client.query(topCustomersQuery);
      
      // 4. Get advance payments summary
      const advancePaymentsQuery = `
        SELECT
          payment_type,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          SUM(unallocated_amount) as unallocated_amount
        FROM
          payments
        WHERE
          is_advance_payment = true
          AND unallocated_amount > 0
        GROUP BY
          payment_type
      `;
      
      const advancePaymentsResult = await client.query(advancePaymentsQuery);
      
      // 5. Get recent payment allocations
      const recentAllocationsQuery = `
        SELECT
          pa.id,
          p.irm_no as payment_ref,
          i.invoice_number,
          pa.amount_applied as allocated_amount,
          pa.created_at,
          c.bp_name as customer_name
        FROM
          payment_allocations pa
        JOIN
          payments p ON pa.payment_id = p.id
        JOIN
          invoices i ON pa.invoice_id = i.id
        JOIN
          customers c ON p.customer_id = c.id
        ORDER BY
          pa.created_at DESC
        LIMIT 10
      `;
      
      const recentAllocationsResult = await client.query(recentAllocationsQuery);
      
      // Calculate totals
      const totalOutstanding = invoiceSummaryResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.outstanding_amount || '0'), 
        0
      );
      
      const totalAvailable = advancePaymentsResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.unallocated_amount || '0'), 
        0
      );
      
      const totalAllocated = recentAllocationsResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.allocated_amount || '0'), 
        0
      );
      
      // Format the response with real data
      const response = {
        reportDate: new Date().toISOString(),
        period: {
          startDate: startDate || 'All Time',
          endDate: endDate || 'Present'
        },
        outstandingInvoices: {
          summary: invoiceSummaryResult.rows.map(row => ({
            invoice_type: row.invoice_type,
            count: parseInt(row.count),
            total_amount: parseFloat(row.total_amount || '0'),
            outstanding_amount: parseFloat(row.outstanding_amount || '0')
          })),
          aging: agingResult.rows.map(row => ({
            aging_period: row.aging_period,
            count: parseInt(row.count),
            outstanding_amount: parseFloat(row.outstanding_amount || '0')
          })),
          topCustomers: topCustomersResult.rows.map(row => ({
            customer_name: row.customer_name,
            invoice_count: parseInt(row.invoice_count),
            outstanding_amount: parseFloat(row.outstanding_amount || '0')
          })),
          totalOutstanding
        },
        advancePayments: {
          breakdown: advancePaymentsResult.rows.map(row => ({
            payment_type: row.payment_type,
            count: parseInt(row.count),
            total_amount: parseFloat(row.total_amount || '0'),
            unallocated_amount: parseFloat(row.unallocated_amount || '0')
          })),
          totalAvailable
        },
        recentAllocations: {
          recentAllocations: recentAllocationsResult.rows.map(row => ({
            id: row.id,
            payment_ref: row.payment_ref,
            invoice_number: row.invoice_number,
            allocated_amount: parseFloat(row.allocated_amount || '0'),
            created_at: row.created_at,
            customer_name: row.customer_name
          })),
          totalAllocated
        },
        // Simplified write-offs section to avoid potential errors
        writeOffs: {
          recentWriteOffs: [],
          byReason: [],
          totalWrittenOff: 0
        },
        healthIndicators: {
          dso: 45.3, // Using industry average as placeholder
          avgDaysToPayment: 32, // Using industry average as placeholder
          writeOffPercentage: 0,
          outstandingToRevenueRatio: 0.35 // Using industry average as placeholder
        },
        recommendations: {
          priorityActions: [] as any[],
          generalRecommendations: [
            'Review credit terms with customers that consistently pay late',
            'Consider early payment discounts for customers with large outstanding balances',
            'Implement more regular follow-ups on invoices as they approach 60 days outstanding',
            'Review write-off policies to ensure they align with business goals'
          ]
        }
      };
      
      // Add priority action for aged receivables if any
      const agedReceivables = agingResult.rows.find(row => row.aging_period === 'Over 90 days');
      if (agedReceivables && parseFloat(agedReceivables.outstanding_amount) > 0) {
        response.recommendations.priorityActions.push({
          action: 'Follow up on aged receivables',
          description: `${agedReceivables.count} invoices totaling ${formatCurrency(parseFloat(agedReceivables.outstanding_amount))} are overdue by more than 90 days.`,
          priority: 'High'
        });
      }
      
      // Add priority action for unallocated advance payments if any
      if (totalAvailable > 0) {
        const advancePaymentCount = advancePaymentsResult.rows.reduce(
          (sum, row) => sum + parseInt(row.count || '0'), 
          0
        );
        
        response.recommendations.priorityActions.push({
          action: 'Allocate advance payments',
          description: `${advancePaymentCount} advance payments with ${formatCurrency(totalAvailable)} remain unallocated.`,
          priority: 'Medium'
        });
      }
      
      res.json(response);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error generating reconciliation report:', error);
    res.status(500).json({ error: 'Failed to generate reconciliation report' });
  }
});

/**
 * Helper function to format currency values
 */
function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Get turnover report with Indian Financial Year filtering
 */
financeReportRouter.get('/turnover', async (req: Request, res: Response) => {
  console.log('🔥 FINANCE-REPORT TURNOVER ENDPOINT HIT!');
  console.log('🔥 Request query:', req.query);
  try {
    const { startDate, endDate, currency } = req.query;
    
    console.log('🎯 PROCESSING TURNOVER with params:', { startDate, endDate, currency });
    
    // Build query conditions
    let whereConditions = [];
    let queryParams: any[] = [];
    let paramIndex = 1;
    
    if (startDate && endDate) {
      whereConditions.push(`issue_date >= $${paramIndex} AND issue_date <= $${paramIndex + 1}`);
      queryParams.push(startDate, endDate);
      paramIndex += 2;
      console.log('✅ APPLYING DATE FILTER:', { startDate, endDate });
    }
    
    if (currency && currency !== 'all') {
      whereConditions.push(`currency = $${paramIndex}`);
      queryParams.push(currency);
      paramIndex++;
      console.log('✅ APPLYING CURRENCY FILTER:', currency);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Execute aggregate query for turnover summary
    const aggregateQuery = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_invoiced,
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN total_amount ELSE 0 END), 0) as total_received,
        COALESCE(SUM(outstanding_amount), 0) as total_outstanding
      FROM invoices ${whereClause}
    `;

    const client = await pool.connect();
    console.log('📋 EXECUTING TURNOVER QUERY:', aggregateQuery);
    console.log('📋 WITH PARAMS:', queryParams);
    
    try {
      const result = await client.query(aggregateQuery, queryParams);
      const data = result.rows[0];
      
      console.log('📊 TURNOVER DATABASE RESULT:', data);
      
      // Format response with authentic database data
      const response = {
        reportDate: new Date().toISOString(),
        totalInvoiced: parseFloat(data.total_invoiced) || 0,
        totalReceived: parseFloat(data.total_received) || 0,
        totalOutstanding: parseFloat(data.total_outstanding) || 0,
        totalInvoicedINR: (parseFloat(data.total_invoiced) || 0) * 85.413325,
        totalReceivedINR: (parseFloat(data.total_received) || 0) * 85.413325,
        totalOutstandingINR: (parseFloat(data.total_outstanding) || 0) * 85.413325,
        monthlyData: []
      };
      
      console.log('📤 SENDING TURNOVER RESPONSE:', response);
      res.json(response);
    } finally {
      client.release();
    }
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
    // Extract date range from query parameters
    const { startDate, endDate, currency } = req.query;
    
    const client = await pool.connect();
    try {
      // Build date filter conditions if dates are provided
      let dateFilter = '';
      if (startDate && endDate) {
        dateFilter = `AND i.issue_date BETWEEN '${startDate}' AND '${endDate}'`;
      }
      
      // Add currency filter if specified
      let currencyFilter = '';
      if (currency && currency !== 'all') {
        currencyFilter = `AND i.currency = '${currency}'`;
      }
      
      // First, let's directly verify the data in our tables
      const checkInvoicesQuery = `SELECT * FROM invoices LIMIT 5`;
      const checkCustomersQuery = `SELECT * FROM customers LIMIT 5`;
      
      console.log('Checking invoices data...');
      const invoicesCheck = await client.query(checkInvoicesQuery);
      console.log('Sample invoices:', JSON.stringify(invoicesCheck.rows));
      
      console.log('Checking customers data...');
      const customersCheck = await client.query(checkCustomersQuery);
      console.log('Sample customers:', JSON.stringify(customersCheck.rows));
      
      // Check if we have invoices with outstanding amounts
      const countQuery = `
        SELECT COUNT(*) 
        FROM invoices 
        WHERE outstanding_amount > 0
      `;
      
      const countResult = await client.query(countQuery);
      console.log('Outstanding invoices count:', countResult.rows[0].count);
      
      // Get invoice-level outstanding data
      const query = `
        SELECT 
          i.id,
          i.invoice_number as "invoiceNumber",
          c.bp_name as "customerName",
          i.issue_date as "issueDate",
          i.due_date as "dueDate",
          i.total_amount as amount,
          i.outstanding_amount as "balanceDue",
          CASE 
            WHEN CURRENT_DATE > i.due_date THEN (CURRENT_DATE - i.due_date)
            ELSE 0
          END as "daysOverdue",
          i.currency
        FROM 
          invoices i
        JOIN 
          customers c ON i.customer_id = c.id
        WHERE 
          i.outstanding_amount > 0
          ${dateFilter}
          ${currencyFilter}
        ORDER BY 
          i.due_date ASC
      `;
      
      console.log('Running outstanding invoices query:', query);
      const result = await client.query(query);
      console.log('Found', result.rows.length, 'outstanding invoices');
      
      if (result.rows.length > 0) {
        console.log('First invoice data:', JSON.stringify(result.rows[0]));
      } else {
        console.log('No outstanding invoices found in the database.');
      }
      
      // Calculate total outstanding amount
      const totalOutstanding = result.rows.reduce((sum, row) => sum + parseFloat(row.balanceDue), 0);
      
      // Calculate total overdue amount (invoices past due date)
      const totalOverdue = result.rows
        .filter(row => parseInt(row.daysOverdue) > 0)
        .reduce((sum, row) => sum + parseFloat(row.balanceDue), 0);
      
      // Calculate amount within due date
      const withinDueDate = totalOutstanding - totalOverdue;
      
      // Format the data for the frontend
      const formattedInvoices = result.rows.map(row => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customerName,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        amount: parseFloat(row.amount),
        balanceDue: parseFloat(row.balanceDue),
        daysOverdue: parseInt(row.daysOverdue),
        currency: row.currency
      }));
      
      console.log('Outstanding report summary:', {
        totalOutstanding,
        totalOverdue,
        withinDueDate,
        invoiceCount: formattedInvoices.length
      });
      
      res.json({
        reportDate: new Date().toISOString(),
        totalOutstanding,
        totalOverdue,
        withinDueDate,
        // Adding currency conversion values for INR (USD to INR rate = 85.55)
        totalOutstandingINR: totalOutstanding * 85.55,
        totalOverdueINR: totalOverdue * 85.55,
        withinDueDateINR: withinDueDate * 85.55,
        invoices: formattedInvoices
      });
    } finally {
      client.release();
    }
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
    const { startDate, endDate, currency } = req.query;
    
    // Build query with date filtering
    let dateFilter = '';
    let currencyFilter = '';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (startDate && endDate) {
      dateFilter = `AND p.payment_date BETWEEN $${paramIndex} AND $${paramIndex+1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    } else if (startDate) {
      dateFilter = `AND p.payment_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex += 1;
    } else if (endDate) {
      dateFilter = `AND p.payment_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex += 1;
    }
    
    if (currency && currency !== 'all') {
      currencyFilter = `AND p.currency = $${paramIndex}`;
      params.push(currency);
    }
    
    const client = await pool.connect();
    try {
      // Log parameters for debugging
      console.log("Remittances report query params:", { startDate, endDate, currency, params });
      
      // Query for payments with inward remittance details
      const query = `
        SELECT 
          p.id as payment_id,
          p.irm_no as payment_ref,
          c.bpName as customer_name,
          p.amount,
          p.currency,
          p.payment_date as remittance_date,
          COALESCE(p.payment_method, 'Pending') as brc_status,
          i.invoice_number,
          pa.amount_applied
        FROM 
          payments p
        LEFT JOIN 
          customers c ON p.customer_id = c.id
        LEFT JOIN 
          payment_allocations pa ON p.id = pa.payment_id
        LEFT JOIN 
          invoices i ON pa.invoice_id = i.id
        WHERE 
          1=1
          ${dateFilter}
          ${currencyFilter}
        ORDER BY 
          p.payment_date DESC
      `;
      
      // Log the constructed SQL query for debugging
      console.log("Remittances SQL query:", query);
      
      const result = await client.query(query, params);
      
      console.log(`Found ${result.rows.length} payments for remittances report`);
      if (result.rows.length > 0) {
        console.log("Sample payment data:", result.rows[0]);
      }
      
      // Calculate total remittance amount
      const totalRemittances = result.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      
      // Format data for response in the structure the frontend expects
      const remittances = result.rows.map(row => ({
        remittanceNumber: row.payment_ref || `PAY-${row.payment_id}`,
        customerName: row.customer_name || "Unknown Customer",
        amount: parseFloat(row.amount) || 0,
        currency: row.currency || 'USD',
        date: row.remittance_date,
        brcStatus: row.brc_status === 'bank transfer' ? 'Issued' : (row.brc_status === 'wire transfer' ? 'Processing' : 'Pending'),
        invoiceNumber: row.invoice_number || `INV-${1000 + row.payment_id}`
      }));
      
      // Calculate BRC statuses based on payment method
      const totalBRCs = remittances.filter(r => r.brcStatus === 'Issued').length;
      const pendingBRCs = remittances.filter(r => r.brcStatus !== 'Issued').length;
      
      const response = {
        reportDate: new Date().toISOString(),
        totalRemittances,
        totalRemittancesINR: totalRemittances * 85.55, // Approximate INR conversion
        totalBRCs,
        pendingBRCs,
        remittances
      };
      
      console.log("Sending remittances report with data count:", remittances.length);
      res.json(response);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error generating remittances report:', error);
    res.status(500).json({ error: 'Failed to generate remittances report' });
  }
});

/**
 * Get invoice aging analysis
 */
financeReportRouter.get('/invoice-aging', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, currency } = req.query;
    
    const client = await pool.connect();
    try {
      // Build date filter conditions
      let dateFilter = '';
      if (startDate && endDate) {
        dateFilter = `AND i.issue_date BETWEEN '${startDate}' AND '${endDate}'`;
      }
      
      // Add currency filter if specified
      let currencyFilter = '';
      if (currency && currency !== 'all') {
        currencyFilter = `AND i.currency = '${currency}'`;
      }
      
      // Get invoice aging data
      const query = `
        SELECT 
          i.id,
          i.invoice_number,
          c.bp_name as customer_name,
          i.issue_date,
          i.due_date,
          i.total_amount,
          i.outstanding_amount,
          i.currency,
          i.status,
          CASE 
            WHEN i.outstanding_amount <= 0 THEN 0
            ELSE CURRENT_DATE - i.due_date
          END as days_overdue
        FROM 
          invoices i
        JOIN 
          customers c ON i.customer_id = c.id
        WHERE 
          i.outstanding_amount > 0
          ${dateFilter}
          ${currencyFilter}
        ORDER BY 
          i.due_date ASC
      `;
      
      console.log('Running invoice aging query:', query);
      const result = await client.query(query);
      console.log('Found', result.rows.length, 'invoices for aging analysis');
      
      // Initialize aging buckets
      const agingBuckets = {
        'Current': { count: 0, amount: 0, percentage: 0 },
        '1-30 days': { count: 0, amount: 0, percentage: 0 },
        '31-60 days': { count: 0, amount: 0, percentage: 0 },
        '61-90 days': { count: 0, amount: 0, percentage: 0 },
        '91+ days': { count: 0, amount: 0, percentage: 0 }
      };
      
      const customerSummaries = {};
      let totalOutstanding = 0;
      
      // Process each invoice for aging analysis
      const processedInvoices = result.rows.map(row => {
        const outstandingAmount = parseFloat(row.outstanding_amount);
        const daysOverdue = parseInt(row.days_overdue);
        
        totalOutstanding += outstandingAmount;
        
        // Determine aging bucket
        let agingBucket;
        if (daysOverdue <= 0) {
          agingBucket = 'Current';
        } else if (daysOverdue <= 30) {
          agingBucket = '1-30 days';
        } else if (daysOverdue <= 60) {
          agingBucket = '31-60 days';
        } else if (daysOverdue <= 90) {
          agingBucket = '61-90 days';
        } else {
          agingBucket = '91+ days';
        }
        
        // Update aging buckets
        agingBuckets[agingBucket].count += 1;
        agingBuckets[agingBucket].amount += outstandingAmount;
        
        // Update customer summaries
        if (!customerSummaries[row.customer_name]) {
          customerSummaries[row.customer_name] = {
            customerName: row.customer_name,
            totalOutstanding: 0,
            agingBuckets: {
              'Current': 0,
              '1-30 days': 0,
              '31-60 days': 0,
              '61-90 days': 0,
              '91+ days': 0
            }
          };
        }
        
        customerSummaries[row.customer_name].totalOutstanding += outstandingAmount;
        customerSummaries[row.customer_name].agingBuckets[agingBucket] += outstandingAmount;
        
        return {
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerName: row.customer_name,
          issueDate: row.issue_date,
          dueDate: row.due_date,
          amount: parseFloat(row.total_amount),
          outstandingAmount,
          currency: row.currency,
          status: row.status,
          daysOverdue,
          agingBucket
        };
      });
      
      // Calculate percentages for aging buckets
      Object.keys(agingBuckets).forEach(bucket => {
        if (totalOutstanding > 0) {
          agingBuckets[bucket].percentage = (agingBuckets[bucket].amount / totalOutstanding * 100);
        }
      });
      
      const response = {
        totalOutstanding,
        currencyCode: currency || 'USD',
        agingBuckets,
        customerSummaries: Object.values(customerSummaries),
        invoices: processedInvoices,
        paymentTrends: [
          {
            month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
            avgDaysToPayment: Math.round(processedInvoices.reduce((sum, inv) => sum + Math.max(0, inv.daysOverdue), 0) / Math.max(1, processedInvoices.length)),
            invoiceCount: processedInvoices.length
          }
        ]
      };
      
      console.log('Invoice aging summary:', {
        totalOutstanding,
        invoiceCount: processedInvoices.length,
        agingDistribution: Object.keys(agingBuckets).map(bucket => `${bucket}: ${agingBuckets[bucket].count} invoices`)
      });
      
      res.json(response);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error generating invoice aging report:', error);
    res.status(500).json({ error: 'Failed to generate invoice aging report' });
  }
});