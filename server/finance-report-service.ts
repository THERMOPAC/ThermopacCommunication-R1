import { pool } from './db';

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
      // Prepare date filters
      const dateFilter = this.buildDateFilter(startDate, endDate);
      
      // 1. Get outstanding invoices summary
      const outstandingInvoices = await this.getOutstandingInvoicesSummary(dateFilter);
      
      // 2. Get advance payment availability
      const advancePayments = await this.getAdvancePaymentAvailability();
      
      // 3. Get recent payment allocations
      const recentAllocations = await this.getRecentPaymentAllocations();
      
      // 4. Get write-off analysis
      const writeOffs = await this.getWriteOffAnalysis(dateFilter);
      
      // 5. Calculate financial health indicators
      const healthIndicators = await this.calculateFinancialHealthIndicators();
      
      // 6. Generate recommendations
      const recommendations = await this.generateRecommendations();
      
      // Compile the full report
      return {
        reportDate: new Date().toISOString(),
        filters: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        outstandingInvoices,
        advancePayments,
        recentAllocations,
        writeOffs,
        healthIndicators,
        recommendations
      };
    } catch (error) {
      console.error('Error generating reconciliation report:', error);
      throw new Error('Failed to generate financial reconciliation report');
    }
  }
  
  /**
   * Build SQL date filter clause based on provided date range
   */
  private buildDateFilter(startDate?: string, endDate?: string): string {
    const filters = [];
    
    if (startDate) {
      filters.push(`issue_date >= '${startDate}'`);
    }
    
    if (endDate) {
      filters.push(`issue_date <= '${endDate}'`);
    }
    
    return filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
  }
  
  /**
   * Get summary of outstanding invoices grouped by type
   */
  private async getOutstandingInvoicesSummary(dateFilter: string) {
    const query = `
      SELECT 
        invoice_type as type,
        COUNT(*) as count,
        SUM(total_amount::numeric) as total_value,
        AVG(EXTRACT(DAY FROM (CURRENT_DATE - issue_date::date))) as avg_age,
        SUM(CASE WHEN due_date < CURRENT_DATE AND status != 'Paid' THEN 1 ELSE 0 END) as overdue_count
      FROM 
        invoices
      WHERE 
        status != 'Paid'
        ${dateFilter}
      GROUP BY 
        invoice_type
    `;
    
    const result = await pool.query(query);
    
    let total = {
      count: 0,
      total_value: 0,
      overdue_count: 0
    };
    
    const summary = result.rows.map(row => {
      total.count += parseInt(row.count);
      total.total_value += parseFloat(row.total_value);
      total.overdue_count += parseInt(row.overdue_count);
      
      return {
        type: row.type,
        count: parseInt(row.count),
        totalValue: parseFloat(row.total_value).toFixed(2),
        avgAge: Math.round(parseFloat(row.avg_age)),
        overdueCount: parseInt(row.overdue_count),
        status: parseInt(row.overdue_count) > 0 ? 'Warning' : 'Good'
      };
    });
    
    // Add total row
    summary.push({
      type: 'TOTAL',
      count: total.count,
      totalValue: total.total_value.toFixed(2),
      avgAge: Math.round(result.rows.reduce((sum, row) => sum + (parseInt(row.count) * parseFloat(row.avg_age)), 0) / total.count),
      overdueCount: total.overdue_count,
      status: (total.overdue_count / total.count > 0.1) ? 'Warning' : 'Good'
    });
    
    return summary;
  }
  
  /**
   * Get advance payment availability by type
   */
  private async getAdvancePaymentAvailability() {
    const query = `
      SELECT 
        payment_type as type,
        COUNT(*) as count,
        SUM(
          CASE 
            WHEN allocated_amount IS NULL THEN amount::numeric
            ELSE amount::numeric - allocated_amount::numeric
          END
        ) as unallocated_amount
      FROM 
        payments
      WHERE 
        (allocated_amount IS NULL OR amount::numeric > allocated_amount::numeric)
      GROUP BY 
        payment_type
    `;
    
    const result = await pool.query(query);
    
    let total = {
      count: 0,
      unallocated_amount: 0
    };
    
    const summary = result.rows.map(row => {
      total.count += parseInt(row.count);
      total.unallocated_amount += parseFloat(row.unallocated_amount);
      
      return {
        type: row.type,
        count: parseInt(row.count),
        unallocatedAmount: parseFloat(row.unallocated_amount).toFixed(2),
        status: parseFloat(row.unallocated_amount) > 0 ? 'Ready for allocation' : 'No funds available'
      };
    });
    
    // Add total row
    summary.push({
      type: 'TOTAL',
      count: total.count,
      unallocatedAmount: total.unallocated_amount.toFixed(2),
      status: total.unallocated_amount > 0 ? 'Ready for allocation' : 'No funds available'
    });
    
    return summary;
  }
  
  /**
   * Get recent payment allocations
   */
  private async getRecentPaymentAllocations() {
    const query = `
      SELECT 
        pa.created_at as date,
        i.invoice_number,
        p.reference_number as payment_ref,
        pa.amount,
        i.total_amount::numeric - COALESCE(
          (SELECT SUM(amount::numeric) FROM payment_allocations WHERE invoice_id = i.id), 
          0
        ) as balance_after
      FROM 
        payment_allocations pa
      JOIN 
        invoices i ON pa.invoice_id = i.id
      JOIN 
        payments p ON pa.payment_id = p.id
      WHERE 
        pa.created_at >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY 
        pa.created_at DESC
      LIMIT 10
    `;
    
    const result = await pool.query(query);
    
    return result.rows.map(row => {
      return {
        date: new Date(row.date).toLocaleDateString(),
        invoiceNumber: row.invoice_number,
        paymentRef: row.payment_ref,
        amountApplied: parseFloat(row.amount).toFixed(2),
        balanceAfter: parseFloat(row.balance_after).toFixed(2),
        status: parseFloat(row.balance_after) <= 0 ? 'Fully Paid' : 'Partially Paid'
      };
    });
  }
  
  /**
   * Get write-off analysis
   */
  private async getWriteOffAnalysis(dateFilter: string) {
    const query = `
      SELECT 
        write_off_type as type,
        COUNT(*) as count,
        SUM(amount::numeric) as total_amount,
        SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved_count
      FROM 
        financial_write_offs
      WHERE 
        created_at >= CURRENT_DATE - INTERVAL '90 days'
        ${dateFilter}
      GROUP BY 
        write_off_type
    `;
    
    const result = await pool.query(query);
    
    let total = {
      count: 0,
      total_amount: 0,
      approved_count: 0
    };
    
    const summary = result.rows.map(row => {
      total.count += parseInt(row.count);
      total.total_amount += parseFloat(row.total_amount);
      total.approved_count += parseInt(row.approved_count);
      
      return {
        category: row.type,
        count: parseInt(row.count),
        totalAmount: parseFloat(row.total_amount).toFixed(2),
        approvalStatus: `${row.approved_count} Approved, ${parseInt(row.count) - parseInt(row.approved_count)} Pending`
      };
    });
    
    // Add total row if we have data
    if (summary.length > 0) {
      summary.push({
        category: 'TOTAL',
        count: total.count,
        totalAmount: total.total_amount.toFixed(2),
        approvalStatus: `${((total.approved_count / total.count) * 100).toFixed(1)}% Approved`
      });
    }
    
    return summary;
  }
  
  /**
   * Calculate financial health indicators
   */
  private async calculateFinancialHealthIndicators() {
    // Days Sales Outstanding (DSO)
    const dsoQuery = `
      SELECT 
        AVG(EXTRACT(DAY FROM (
          CASE 
            WHEN status = 'Paid' THEN 
              (SELECT MAX(created_at) FROM payment_allocations WHERE invoice_id = i.id)::date
            ELSE 
              CURRENT_DATE
          END - issue_date::date
        ))) as dso
      FROM 
        invoices i
      WHERE 
        issue_date >= CURRENT_DATE - INTERVAL '90 days'
    `;
    
    // Collection Efficiency
    const collectionQuery = `
      SELECT 
        (SUM(CASE WHEN status = 'Paid' THEN total_amount::numeric ELSE 0 END) / 
         NULLIF(SUM(total_amount::numeric), 0)) * 100 as efficiency
      FROM 
        invoices
      WHERE 
        issue_date >= CURRENT_DATE - INTERVAL '90 days'
    `;
    
    // Advance Payment Ratio
    const advanceRatioQuery = `
      SELECT 
        (SUM(
          CASE 
            WHEN allocated_amount IS NULL THEN amount::numeric
            ELSE amount::numeric - allocated_amount::numeric
          END
        ) / NULLIF(
          (SELECT SUM(total_amount::numeric) FROM invoices WHERE status != 'Paid'), 
          0
        )) * 100 as ratio
      FROM 
        payments
      WHERE 
        (allocated_amount IS NULL OR amount::numeric > allocated_amount::numeric)
    `;
    
    // Unallocated Payment Aging
    const unallocatedAgingQuery = `
      SELECT 
        AVG(EXTRACT(DAY FROM (CURRENT_DATE - payment_date::date))) as aging
      FROM 
        payments
      WHERE 
        (allocated_amount IS NULL OR amount::numeric > allocated_amount::numeric)
    `;
    
    // Execute all queries
    const dsoResult = await pool.query(dsoQuery);
    const collectionResult = await pool.query(collectionQuery);
    const advanceRatioResult = await pool.query(advanceRatioQuery);
    const unallocatedAgingResult = await pool.query(unallocatedAgingQuery);
    
    // Build indicators
    const indicators = [
      {
        metric: 'Days Sales Outstanding (DSO)',
        value: Math.round(parseFloat(dsoResult.rows[0]?.dso || '0')),
        target: '<45',
        status: parseFloat(dsoResult.rows[0]?.dso || '0') < 45 ? 'Good' : 'Warning'
      },
      {
        metric: 'Collection Efficiency',
        value: parseFloat(collectionResult.rows[0]?.efficiency || '0').toFixed(1) + '%',
        target: '>85%',
        status: parseFloat(collectionResult.rows[0]?.efficiency || '0') > 85 ? 'Good' : 'Warning'
      },
      {
        metric: 'Advance Payment Ratio',
        value: parseFloat(advanceRatioResult.rows[0]?.ratio || '0').toFixed(1) + '%',
        target: '>40%',
        status: parseFloat(advanceRatioResult.rows[0]?.ratio || '0') > 40 ? 'Excellent' : 'Good'
      },
      {
        metric: 'Unallocated Payment Aging',
        value: Math.round(parseFloat(unallocatedAgingResult.rows[0]?.aging || '0')),
        target: '<10',
        status: parseFloat(unallocatedAgingResult.rows[0]?.aging || '0') < 10 ? 'Good' : 'Moderate'
      }
    ];
    
    return indicators;
  }
  
  /**
   * Generate recommendations based on financial data
   */
  private async generateRecommendations() {
    // Get overdue invoices
    const overdueQuery = `
      SELECT 
        id, invoice_number, customer_id, total_amount, due_date,
        EXTRACT(DAY FROM (CURRENT_DATE - due_date::date)) as days_overdue
      FROM 
        invoices
      WHERE 
        status != 'Paid' AND due_date < CURRENT_DATE
      ORDER BY 
        days_overdue DESC
      LIMIT 3
    `;
    
    // Get largest unallocated advances
    const unallocatedQuery = `
      SELECT 
        id, reference_number, payment_type,
        CASE 
          WHEN allocated_amount IS NULL THEN amount::numeric
          ELSE amount::numeric - allocated_amount::numeric
        END as unallocated_amount
      FROM 
        payments
      WHERE 
        (allocated_amount IS NULL OR amount::numeric > allocated_amount::numeric)
      ORDER BY 
        unallocated_amount DESC
      LIMIT 3
    `;
    
    // Execute queries
    const overdueResult = await pool.query(overdueQuery);
    const unallocatedResult = await pool.query(unallocatedQuery);
    
    // Generate priority actions
    const priorityActions = [];
    
    // Add overdue invoice actions
    overdueResult.rows.forEach(invoice => {
      priorityActions.push(
        `Follow up on overdue invoice ${invoice.invoice_number} (${Math.round(invoice.days_overdue)} days past due)`
      );
    });
    
    // Add unallocated payment actions
    unallocatedResult.rows.forEach(payment => {
      priorityActions.push(
        `Allocate ${payment.payment_type} payment ${payment.reference_number} with ${parseFloat(payment.unallocated_amount).toFixed(2)} available`
      );
    });
    
    // Generate optimization opportunities
    const optimizationOpportunities = [
      "Consider implementing automatic payment allocation for recurring customers",
      "Review invoice payment terms for customers with consistent late payments",
      "Analyze write-off patterns to identify potential process improvements"
    ];
    
    if (unallocatedResult.rows.length > 0) {
      const totalUnallocated = unallocatedResult.rows.reduce(
        (sum, payment) => sum + parseFloat(payment.unallocated_amount), 0
      );
      
      optimizationOpportunities.unshift(
        `Utilize ${totalUnallocated.toFixed(2)} in unallocated payments for upcoming projects`
      );
    }
    
    return {
      priorityActions: priorityActions.slice(0, 3),
      optimizationOpportunities: optimizationOpportunities.slice(0, 3)
    };
  }
}

export const financeReportService = new FinanceReportService();