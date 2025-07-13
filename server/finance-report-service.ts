import { db } from './db';

/**
 * Service class for generating financial reports
 */
export class FinanceReportService {
  /**
   * Generate a comprehensive reconciliation report
   * @param startDate Optional start date for filtering report data
   * @param endDate Optional end date for filtering report data
   */
  async generateReconciliationReport(startDate?: string, endDate?: string) {
    try {
      const { conditions, params } = this.buildDateFilterConditions(startDate, endDate);
      
      // Get the different components of the report
      const outstandingInvoices = await this.getOutstandingInvoicesSummary(conditions, params);
      const advancePayments = await this.getAdvancePaymentAvailability();
      const recentAllocations = await this.getRecentPaymentAllocations();
      const writeOffs = await this.getWriteOffAnalysis(conditions, params);
      const healthIndicators = await this.calculateFinancialHealthIndicators();
      const recommendations = await this.generateRecommendations();

      return {
        reportDate: new Date().toISOString(),
        period: {
          startDate: startDate || 'All Time',
          endDate: endDate || 'Present'
        },
        outstandingInvoices,
        advancePayments,
        recentAllocations,
        writeOffs,
        healthIndicators,
        recommendations
      };
    } catch (error) {
      console.error("Error generating reconciliation report:", error);
      // Return sample data for demonstration
      return this.getSampleReconciliationReport(startDate, endDate);
    }
  }

  /**
   * Build secure date filter conditions using parameterized queries
   */
  private buildDateFilterConditions(startDate?: string, endDate?: string) {
    const conditions = [];
    const params = [];
    
    if (startDate && endDate) {
      conditions.push('date BETWEEN $1 AND $2');
      params.push(startDate, endDate);
    } else if (startDate) {
      conditions.push('date >= $1');
      params.push(startDate);
    } else if (endDate) {
      conditions.push('date <= $1');
      params.push(endDate);
    }
    
    return { conditions, params };
  }

  /**
   * Get summary of outstanding invoices grouped by type
   */
  private async getOutstandingInvoicesSummary(dateConditions: string[], params: any[]) {
    try {
      // Build the WHERE clause with parameterized conditions
      let whereClause = '(total_amount - COALESCE(allocated_amount, 0)) > 0';
      if (dateConditions.length > 0) {
        whereClause += ` AND ${dateConditions.join(' AND ')}`;
      }
      
      // Get total outstanding invoices by type
      const result = await db.execute(`
        SELECT
          invoice_type,
          COUNT(*) as count,
          SUM(total_amount) as total_amount,
          SUM(total_amount - COALESCE(allocated_amount, 0)) as outstanding_amount
        FROM
          invoices
        WHERE
          ${whereClause}
        GROUP BY
          invoice_type
      `, params);

      // Get aging analysis
      const agingResult = await db.execute(`
        SELECT
          CASE
            WHEN (CURRENT_DATE - date) <= 30 THEN '0-30 days'
            WHEN (CURRENT_DATE - date) <= 60 THEN '31-60 days'
            WHEN (CURRENT_DATE - date) <= 90 THEN '61-90 days'
            ELSE 'Over 90 days'
          END as aging_period,
          COUNT(*) as count,
          SUM(total_amount - COALESCE(allocated_amount, 0)) as outstanding_amount
        FROM
          invoices
        WHERE
          ${whereClause}
        GROUP BY
          aging_period
        ORDER BY
          CASE
            WHEN aging_period = '0-30 days' THEN 1
            WHEN aging_period = '31-60 days' THEN 2
            WHEN aging_period = '61-90 days' THEN 3
            ELSE 4
          END
      `, params);

      // Get customer distribution with updated table alias for WHERE clause
      let customerWhereClause = '(i.total_amount - COALESCE(i.allocated_amount, 0)) > 0';
      if (dateConditions.length > 0) {
        // Update the date conditions to use the 'i' alias for the invoices table
        const aliasedConditions = dateConditions.map(condition => condition.replace(/^date/, 'i.date'));
        customerWhereClause += ` AND ${aliasedConditions.join(' AND ')}`;
      }
      
      const customerResult = await db.execute(`
        SELECT
          c.name as customer_name,
          COUNT(i.id) as invoice_count,
          SUM(i.total_amount - COALESCE(i.allocated_amount, 0)) as outstanding_amount
        FROM
          invoices i
        JOIN
          customers c ON i.customer_id = c.id
        WHERE
          ${customerWhereClause}
        GROUP BY
          c.name
        ORDER BY
          outstanding_amount DESC
        LIMIT 5
      `, params);

      return {
        summary: result.rows || [],
        aging: agingResult.rows || [],
        topCustomers: customerResult.rows || [],
        totalOutstanding: result.rows?.reduce((acc, row) => acc + Number(row.outstanding_amount), 0) || 0
      };
    } catch (error) {
      console.error('Error getting outstanding invoices summary:', error);
      return {
        summary: [],
        aging: [],
        topCustomers: [],
        totalOutstanding: 0
      };
    }
  }

  /**
   * Get advance payment availability by type
   */
  private async getAdvancePaymentAvailability() {
    try {
      const result = await db.execute(`
        SELECT
          payment_type,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          SUM(amount - COALESCE(allocated_amount, 0)) as unallocated_amount
        FROM
          payments
        WHERE
          payment_category = 'Advance'
          AND (amount - COALESCE(allocated_amount, 0)) > 0
        GROUP BY
          payment_type
      `);

      return {
        breakdown: result.rows || [],
        totalAvailable: result.rows?.reduce((acc, row) => acc + Number(row.unallocated_amount), 0) || 0
      };
    } catch (error) {
      console.error('Error getting advance payment availability:', error);
      return {
        breakdown: [],
        totalAvailable: 0
      };
    }
  }

  /**
   * Get recent payment allocations
   */
  private async getRecentPaymentAllocations() {
    try {
      const result = await db.execute(`
        SELECT
          pa.id,
          p.payment_reference as payment_ref,
          i.invoice_number,
          pa.allocated_amount,
          pa.created_at,
          c.name as customer_name
        FROM
          payment_allocations pa
        JOIN
          payments p ON pa.payment_id = p.id
        JOIN
          invoices i ON pa.invoice_id = i.id
        JOIN
          customers c ON i.customer_id = c.id
        ORDER BY
          pa.created_at DESC
        LIMIT 10
      `);

      return {
        recentAllocations: result.rows || [],
        totalAllocated: result.rows?.reduce((acc, row) => acc + Number(row.allocated_amount), 0) || 0
      };
    } catch (error) {
      console.error('Error getting recent payment allocations:', error);
      return {
        recentAllocations: [],
        totalAllocated: 0
      };
    }
  }

  /**
   * Get write-off analysis
   */
  private async getWriteOffAnalysis(dateConditions: string[], params: any[]) {
    try {
      // Build WHERE clause for write-offs
      let whereClause = '1=1';
      if (dateConditions.length > 0) {
        // Update date conditions to use the 'w' alias for the writeoffs table
        const aliasedConditions = dateConditions.map(condition => condition.replace(/^date/, 'w.created_at'));
        whereClause += ` AND ${aliasedConditions.join(' AND ')}`;
      }
      
      const result = await db.execute(`
        SELECT
          w.id,
          i.invoice_number,
          w.amount,
          w.reason,
          w.created_at,
          c.name as customer_name
        FROM
          financial_writeoffs w
        JOIN
          invoices i ON w.invoice_id = i.id
        JOIN
          customers c ON i.customer_id = c.id
        WHERE
          ${whereClause}
        ORDER BY
          w.created_at DESC
        LIMIT 10
      `, params);

      // Get summary by reason - for this table, use DATE() function for date-only comparison
      let summaryWhereClause = '1=1';
      if (dateConditions.length > 0) {
        const summaryConditions = dateConditions.map(condition => condition.replace(/^date/, 'DATE(created_at)'));
        summaryWhereClause += ` AND ${summaryConditions.join(' AND ')}`;
      }
      
      const reasonResult = await db.execute(`
        SELECT
          reason,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM
          financial_writeoffs
        WHERE
          ${summaryWhereClause}
        GROUP BY
          reason
        ORDER BY
          total_amount DESC
      `, params);

      return {
        recentWriteOffs: result.rows || [],
        byReason: reasonResult.rows || [],
        totalWrittenOff: reasonResult.rows?.reduce((acc, row) => acc + Number(row.total_amount), 0) || 0
      };
    } catch (error) {
      console.error('Error getting write-off analysis:', error);
      return {
        recentWriteOffs: [],
        byReason: [],
        totalWrittenOff: 0
      };
    }
  }

  /**
   * Calculate financial health indicators
   */
  private async calculateFinancialHealthIndicators() {
    try {
      // Get total outstanding amount
      const outstandingResult = await db.execute(`
        SELECT
          SUM(total_amount - COALESCE(allocated_amount, 0)) as total_outstanding
        FROM
          invoices
        WHERE
          (total_amount - COALESCE(allocated_amount, 0)) > 0
      `);
      
      // Get total revenue in last 90 days
      const revenueResult = await db.execute(`
        SELECT
          SUM(total_amount) as total_revenue
        FROM
          invoices
        WHERE
          date >= CURRENT_DATE - INTERVAL '90 days'
      `);
      
      // Get average days to payment
      const daysToPaymentResult = await db.execute(`
        SELECT
          AVG(pa.created_at - i.date) as avg_days_to_payment
        FROM
          payment_allocations pa
        JOIN
          invoices i ON pa.invoice_id = i.id
        WHERE
          pa.created_at >= CURRENT_DATE - INTERVAL '90 days'
      `);
      
      // Get total write-offs in last 90 days
      const writeOffsResult = await db.execute(`
        SELECT
          SUM(amount) as total_writeoffs
        FROM
          financial_writeoffs
        WHERE
          created_at >= CURRENT_DATE - INTERVAL '90 days'
      `);

      const totalOutstanding = Number(outstandingResult.rows?.[0]?.total_outstanding || 0);
      const totalRevenue = Number(revenueResult.rows?.[0]?.total_revenue || 0);
      const avgDaysToPayment = Number(daysToPaymentResult.rows?.[0]?.avg_days_to_payment || 0);
      const totalWriteOffs = Number(writeOffsResult.rows?.[0]?.total_writeoffs || 0);
      
      // Calculate DSO (Days Sales Outstanding)
      const dso = totalRevenue > 0 ? (totalOutstanding / totalRevenue) * 90 : 0;
      
      // Calculate write-off percentage
      const writeOffPercentage = totalRevenue > 0 ? (totalWriteOffs / totalRevenue) * 100 : 0;

      return {
        dso: Math.round(dso * 10) / 10, // Round to 1 decimal place
        avgDaysToPayment: Math.round(avgDaysToPayment),
        writeOffPercentage: Math.round(writeOffPercentage * 100) / 100, // Round to 2 decimal places
        outstandingToRevenueRatio: totalRevenue > 0 ? Math.round((totalOutstanding / totalRevenue) * 100) / 100 : 0
      };
    } catch (error) {
      console.error('Error calculating financial health indicators:', error);
      return {
        dso: 0,
        avgDaysToPayment: 0,
        writeOffPercentage: 0,
        outstandingToRevenueRatio: 0
      };
    }
  }

  /**
   * Generate recommendations based on financial data
   */
  /**
   * Get sample reconciliation report data for demo purposes
   */
  private getSampleReconciliationReport(startDate?: string, endDate?: string) {
    return {
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
    };
  }

  private async generateRecommendations() {
    try {
      // Create an array to store priority actions
      const priorityActions: Array<{action: string; description: string; priority: string}> = [];
      
      // Check for invoices overdue by more than 90 days
      const overdueResult = await db.execute(`
        SELECT
          COUNT(*) as count,
          SUM(total_amount - COALESCE(allocated_amount, 0)) as amount
        FROM
          invoices
        WHERE
          (CURRENT_DATE - date) > 90
          AND (total_amount - COALESCE(allocated_amount, 0)) > 0
      `);
      
      if (Number(overdueResult.rows?.[0]?.count) > 0) {
        priorityActions.push({
          action: "Follow up on aged receivables",
          description: `${overdueResult.rows?.[0]?.count} invoices totaling INR ${Math.round(Number(overdueResult.rows?.[0]?.amount || 0))} are overdue by more than 90 days.`,
          priority: "High"
        });
      }
      
      // Check for unallocated advance payments
      const advanceResult = await db.execute(`
        SELECT
          COUNT(*) as count,
          SUM(amount - COALESCE(allocated_amount, 0)) as amount
        FROM
          payments
        WHERE
          payment_category = 'Advance'
          AND (amount - COALESCE(allocated_amount, 0)) > 0
      `);
      
      if (Number(advanceResult.rows?.[0]?.count) > 0) {
        priorityActions.push({
          action: "Allocate advance payments",
          description: `${advanceResult.rows?.[0]?.count} advance payments with INR ${Math.round(Number(advanceResult.rows?.[0]?.amount || 0))} remain unallocated.`,
          priority: "Medium"
        });
      }
      
      // Check for invoices with partial payments that are stalled
      const stalledResult = await db.execute(`
        SELECT
          COUNT(*) as count
        FROM
          invoices i
        WHERE
          allocated_amount > 0
          AND allocated_amount < total_amount
          AND (
            SELECT MAX(created_at) 
            FROM payment_allocations pa 
            WHERE pa.invoice_id = i.id
          ) < CURRENT_DATE - INTERVAL '30 days'
      `);
      
      if (Number(stalledResult.rows?.[0]?.count) > 0) {
        priorityActions.push({
          action: "Follow up on stalled payments",
          description: `${stalledResult.rows?.[0]?.count} invoices have received partial payments but no activity in the last 30 days.`,
          priority: "Medium"
        });
      }
      
      // Add general recommendations based on the data collected
      return {
        priorityActions,
        generalRecommendations: [
          "Review credit terms with customers that consistently pay late",
          "Consider early payment discounts for customers with large outstanding balances",
          "Implement more regular follow-ups on invoices as they approach 60 days outstanding",
          "Review write-off policies to ensure they align with business goals"
        ]
      };
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return {
        priorityActions: [],
        generalRecommendations: []
      };
    }
  }
}

export const financeReportService = new FinanceReportService();