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
    const dateFilter = this.buildDateFilter(startDate, endDate);
    
    // Get the different components of the report
    const outstandingInvoices = await this.getOutstandingInvoicesSummary(dateFilter);
    const advancePayments = await this.getAdvancePaymentAvailability();
    const recentAllocations = await this.getRecentPaymentAllocations();
    const writeOffs = await this.getWriteOffAnalysis(dateFilter);
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
  }

  /**
   * Build SQL date filter clause based on provided date range
   */
  private buildDateFilter(startDate?: string, endDate?: string): string {
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND date BETWEEN '${startDate}' AND '${endDate}'`;
    } else if (startDate) {
      dateFilter = `AND date >= '${startDate}'`;
    } else if (endDate) {
      dateFilter = `AND date <= '${endDate}'`;
    }
    return dateFilter;
  }

  /**
   * Get summary of outstanding invoices grouped by type
   */
  private async getOutstandingInvoicesSummary(dateFilter: string) {
    try {
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
          (total_amount - COALESCE(allocated_amount, 0)) > 0
          ${dateFilter}
        GROUP BY
          invoice_type
      `);

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
          (total_amount - COALESCE(allocated_amount, 0)) > 0
          ${dateFilter}
        GROUP BY
          aging_period
        ORDER BY
          CASE
            WHEN aging_period = '0-30 days' THEN 1
            WHEN aging_period = '31-60 days' THEN 2
            WHEN aging_period = '61-90 days' THEN 3
            ELSE 4
          END
      `);

      // Get customer distribution
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
          (i.total_amount - COALESCE(i.allocated_amount, 0)) > 0
          ${dateFilter}
        GROUP BY
          c.name
        ORDER BY
          outstanding_amount DESC
        LIMIT 5
      `);

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
  private async getWriteOffAnalysis(dateFilter: string) {
    try {
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
          1=1
          ${dateFilter}
        ORDER BY
          w.created_at DESC
        LIMIT 10
      `);

      // Get summary by reason
      const reasonResult = await db.execute(`
        SELECT
          reason,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM
          financial_writeoffs
        WHERE
          1=1
          ${dateFilter}
        GROUP BY
          reason
        ORDER BY
          total_amount DESC
      `);

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

      const totalOutstanding = outstandingResult.rows?.[0]?.total_outstanding || 0;
      const totalRevenue = revenueResult.rows?.[0]?.total_revenue || 0;
      const avgDaysToPayment = daysToPaymentResult.rows?.[0]?.avg_days_to_payment || 0;
      const totalWriteOffs = writeOffsResult.rows?.[0]?.total_writeoffs || 0;
      
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
      
      if (overdueResult.rows?.[0]?.count > 0) {
        priorityActions.push({
          action: "Follow up on aged receivables",
          description: `${overdueResult.rows[0].count} invoices totaling INR ${Math.round(overdueResult.rows[0].amount)} are overdue by more than 90 days.`,
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
      
      if (advanceResult.rows?.[0]?.count > 0) {
        priorityActions.push({
          action: "Allocate advance payments",
          description: `${advanceResult.rows[0].count} advance payments with INR ${Math.round(advanceResult.rows[0].amount)} remain unallocated.`,
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
      
      if (stalledResult.rows?.[0]?.count > 0) {
        priorityActions.push({
          action: "Follow up on stalled payments",
          description: `${stalledResult.rows[0].count} invoices have received partial payments but no activity in the last 30 days.`,
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