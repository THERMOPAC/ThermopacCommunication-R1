import { pool } from './db';

/**
 * Service for handling batch advance payment allocations
 * This service specializes in allocating multiple advance payments to multiple
 * outstanding invoices for a customer in a single transaction.
 */
export class BatchAllocationService {
  /**
   * Apply advance payments to outstanding invoices for a customer
   * 
   * This method:
   * 1. Gets all outstanding invoices for the customer
   * 2. Gets all unallocated advance payments for the customer
   * 3. Groups them by type (Product/Service)
   * 4. Allocates payments to invoices based on invoice date (oldest first)
   * 5. Returns allocation results with detailed information
   */
  async applyAdvancePaymentsForCustomer(customerId: number, userId: number) {
    // Validate input parameters
    if (!customerId || isNaN(customerId)) {
      throw new Error('Invalid customer ID provided');
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // First, check if customer exists
      const customerCheckResult = await client.query(
        `SELECT id, bp_name FROM customers WHERE id = $1`,
        [customerId]
      );
      
      if (customerCheckResult.rows.length === 0) {
        throw new Error(`Customer with ID ${customerId} does not exist`);
      }
      
      const customerName = customerCheckResult.rows[0].bp_name;
      console.log(`Processing batch allocation for customer: ${customerName} (ID: ${customerId})`);
      
      // Get outstanding invoices for this customer
      const invoicesResult = await client.query(
        `SELECT i.*, c.bp_name AS customer_name
         FROM invoices i
         JOIN customers c ON i.customer_id = c.id
         WHERE i.customer_id = $1
           AND i.outstanding_amount > 0
         ORDER BY i.issue_date ASC`,
        [customerId]
      );
      
      if (invoicesResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error(`No outstanding invoices found for ${customerName} (ID: ${customerId})`);
      }
      
      console.log(`Found ${invoicesResult.rows.length} outstanding invoices for ${customerName}`);
      
      // Get unallocated advance payments for this customer
      const advancesResult = await client.query(
        `SELECT p.*, c.bp_name AS customer_name
         FROM payments p
         JOIN customers c ON p.customer_id = c.id
         WHERE p.customer_id = $1
           AND p.is_advance_payment = true
           AND p.unallocated_amount > 0
         ORDER BY p.payment_date ASC`,
        [customerId]
      );
      
      if (advancesResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error(`No unallocated advance payments found for ${customerName} (ID: ${customerId})`);
      }
      
      console.log(`Found ${advancesResult.rows.length} unallocated advance payments for ${customerName}`);
      
      // Group invoices by type
      const productInvoices = invoicesResult.rows.filter(inv => inv.invoice_type === 'Product');
      const serviceInvoices = invoicesResult.rows.filter(inv => inv.invoice_type === 'Service');
      
      // Group advance payments by type
      const productAdvances = advancesResult.rows.filter(pmt => pmt.payment_type === 'Product');
      const serviceAdvances = advancesResult.rows.filter(pmt => pmt.payment_type === 'Service');
      
      console.log(`For ${customerName}: Found ${productInvoices.length} product invoices, ${serviceInvoices.length} service invoices`);
      console.log(`For ${customerName}: Found ${productAdvances.length} product advances, ${serviceAdvances.length} service advances`);
      
      // Initialize results array to track all allocations
      const results = [];
      
      // Process product invoices
      if (productInvoices.length > 0 && productAdvances.length > 0) {
        // Set up working copies of advances with mutable unallocated amounts
        const workingAdvances = productAdvances.map(adv => ({
          ...adv,
          remainingUnallocated: parseFloat(adv.unallocated_amount)
        }));
        
        // Process each invoice oldest first
        for (const invoice of productInvoices) {
          let outstandingAmount = parseFloat(invoice.outstanding_amount);
          
          // Skip if already paid
          if (outstandingAmount <= 0) continue;
          
          // Try to apply each advance payment to this invoice
          for (let i = 0; i < workingAdvances.length; i++) {
            const advance = workingAdvances[i];
            
            // Skip if this advance is fully allocated or invoice is fully paid
            if (advance.remainingUnallocated <= 0 || outstandingAmount <= 0) continue;
            
            // Calculate allocation amount (min of advance unallocated and invoice outstanding)
            const allocationAmount = Math.min(
              advance.remainingUnallocated,
              outstandingAmount
            );
            
            // Insert allocation record
            const allocationResult = await client.query(
              `INSERT INTO payment_allocations
               (payment_id, invoice_id, allocation_amount, allocation_date, created_by)
               VALUES ($1, $2, $3, CURRENT_DATE, $4)
               RETURNING *`,
              [advance.id, invoice.id, allocationAmount, userId]
            );
            
            const allocation = allocationResult.rows[0];
            
            // Update payment unallocated amount in database
            await client.query(
              `UPDATE payments
               SET unallocated_amount = unallocated_amount - $1,
                   allocated_amount = allocated_amount + $1,
                   allocation_status = CASE 
                                         WHEN unallocated_amount - $1 <= 0 THEN 'Fully Allocated'
                                         ELSE 'Partially Allocated'
                                       END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [allocationAmount, advance.id]
            );
            
            // Update invoice outstanding amount in database
            await client.query(
              `UPDATE invoices
               SET outstanding_amount = outstanding_amount - $1,
                   status = CASE
                              WHEN outstanding_amount - $1 <= 0 THEN 'Paid'
                              ELSE 'Partially Paid'
                            END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [allocationAmount, invoice.id]
            );
            
            // Update our tracking variables
            advance.remainingUnallocated -= allocationAmount;
            outstandingAmount -= allocationAmount;
            
            // Add to results
            results.push({
              id: allocation.id,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              paymentId: advance.id,
              paymentReference: advance.reference_number,
              type: 'Product', 
              amountAllocated: allocationAmount,
              allocationDate: new Date().toISOString().split('T')[0]
            });
            
            // If invoice is fully paid, move to next invoice
            if (outstandingAmount <= 0) break;
          }
        }
      }
      
      // Process service invoices (same logic as product invoices)
      if (serviceInvoices.length > 0 && serviceAdvances.length > 0) {
        console.log(`Processing ${serviceInvoices.length} service invoices with ${serviceAdvances.length} service advances`);
        
        // Set up working copies of advances with mutable unallocated amounts
        const workingAdvances = serviceAdvances.map(adv => ({
          ...adv,
          remainingUnallocated: parseFloat(adv.unallocated_amount)
        }));
        
        // Process each invoice oldest first
        for (const invoice of serviceInvoices) {
          let outstandingAmount = parseFloat(invoice.outstanding_amount);
          console.log(`Processing service invoice #${invoice.invoice_number} with outstanding: ${outstandingAmount}`);
          
          // Skip if already paid
          if (outstandingAmount <= 0) continue;
          
          // Try to apply each advance payment to this invoice
          for (let i = 0; i < workingAdvances.length; i++) {
            const advance = workingAdvances[i];
            
            // Skip if this advance is fully allocated or invoice is fully paid
            if (advance.remainingUnallocated <= 0 || outstandingAmount <= 0) continue;
            
            // Calculate allocation amount (min of advance unallocated and invoice outstanding)
            const allocationAmount = Math.min(
              advance.remainingUnallocated,
              outstandingAmount
            );
            
            // Insert allocation record
            const allocationResult = await client.query(
              `INSERT INTO payment_allocations
               (payment_id, invoice_id, allocation_amount, allocation_date, created_by)
               VALUES ($1, $2, $3, CURRENT_DATE, $4)
               RETURNING *`,
              [advance.id, invoice.id, allocationAmount, userId]
            );
            
            const allocation = allocationResult.rows[0];
            
            // Update payment unallocated amount in database
            await client.query(
              `UPDATE payments
               SET unallocated_amount = unallocated_amount - $1,
                   allocated_amount = allocated_amount + $1,
                   allocation_status = CASE 
                                         WHEN unallocated_amount - $1 <= 0 THEN 'Fully Allocated'
                                         ELSE 'Partially Allocated'
                                       END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [allocationAmount, advance.id]
            );
            
            // Update invoice outstanding amount in database
            await client.query(
              `UPDATE invoices
               SET outstanding_amount = outstanding_amount - $1,
                   status = CASE
                              WHEN outstanding_amount - $1 <= 0 THEN 'Paid'
                              ELSE 'Partially Paid'
                            END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [allocationAmount, invoice.id]
            );
            
            // Update our tracking variables
            advance.remainingUnallocated -= allocationAmount;
            outstandingAmount -= allocationAmount;
            
            // Add to results
            results.push({
              id: allocation.id,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              paymentId: advance.id,
              paymentReference: advance.reference_number,
              type: 'Service',
              amountAllocated: allocationAmount,
              allocationDate: new Date().toISOString().split('T')[0]
            });
            
            // If invoice is fully paid, move to next invoice
            if (outstandingAmount <= 0) break;
          }
        }
      }
      
      // If no allocations were made, rollback transaction
      if (results.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('No allocations could be made. Either no matching invoice/payment types or all advances already allocated.');
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      // Calculate summary data
      const uniqueInvoicesUpdated = new Set(results.map(r => r.invoiceId)).size;
      const uniquePaymentsUsed = new Set(results.map(r => r.paymentId)).size;
      const totalAmountAllocated = results.reduce((sum, r) => sum + r.amountAllocated, 0);
      
      return {
        success: true,
        customer: customerId,
        message: `Successfully processed ${results.length} allocations across multiple invoices`,
        uniqueInvoicesUpdated,
        uniquePaymentsUsed,
        totalAmountAllocated,
        allocations: results
      };
      
    } catch (error) {
      // Rollback in case of error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Release the client
      client.release();
    }
  }
}

// Export singleton instance
export const batchAllocationService = new BatchAllocationService();