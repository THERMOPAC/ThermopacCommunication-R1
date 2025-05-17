import { pool } from './db';

/**
 * Service for handling payment allocations and tracking financial amounts
 */
export class PaymentAllocationService {
  /**
   * Allocate a payment to an invoice
   */
  async allocatePaymentToInvoice(paymentId: number, invoiceId: number, amount: number, userId: number) {
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Get payment and invoice details
      const paymentResult = await client.query(
        'SELECT * FROM payments WHERE id = $1',
        [paymentId]
      );
      
      const invoiceResult = await client.query(
        'SELECT * FROM invoices WHERE id = $1',
        [invoiceId]
      );
      
      if (paymentResult.rows.length === 0) {
        throw new Error(`Payment with ID ${paymentId} not found`);
      }
      
      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }
      
      const payment = paymentResult.rows[0];
      const invoice = invoiceResult.rows[0];
      
      // 2. Validate the allocation
      if (amount <= 0) {
        throw new Error('Allocation amount must be greater than zero');
      }
      
      if (amount > payment.unallocated_amount) {
        throw new Error(`Cannot allocate more than available unallocated amount (${payment.unallocated_amount})`);
      }
      
      if (amount > invoice.outstanding_amount) {
        throw new Error(`Cannot allocate more than outstanding invoice amount (${invoice.outstanding_amount})`);
      }
      
      // 3. Create the allocation record
      const allocationResult = await client.query(
        `INSERT INTO payment_allocations (
          payment_id, 
          invoice_id, 
          amount_allocated, 
          created_by
        ) VALUES ($1, $2, $3, $4) RETURNING id`,
        [paymentId, invoiceId, amount, userId]
      );
      
      const allocationId = allocationResult.rows[0].id;
      
      // 4. Update payment unallocated amount
      await client.query(
        'UPDATE payments SET unallocated_amount = unallocated_amount - $1 WHERE id = $2',
        [amount, paymentId]
      );
      
      // 5. Update invoice outstanding amount
      await client.query(
        'UPDATE invoices SET outstanding_amount = outstanding_amount - $1 WHERE id = $2',
        [amount, invoiceId]
      );
      
      // 6. Update invoice status if needed
      await this.updateInvoiceStatus(client, invoiceId);
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        id: allocationId,
        paymentId,
        invoiceId,
        amountAllocated: amount
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
  
  /**
   * Remove a payment allocation
   */
  async removeAllocation(allocationId: number) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Get allocation details
      const allocationResult = await client.query(
        'SELECT * FROM payment_allocations WHERE id = $1',
        [allocationId]
      );
      
      if (allocationResult.rows.length === 0) {
        throw new Error(`Allocation with ID ${allocationId} not found`);
      }
      
      const allocation = allocationResult.rows[0];
      
      // 2. Restore payment unallocated amount
      await client.query(
        'UPDATE payments SET unallocated_amount = unallocated_amount + $1 WHERE id = $2',
        [allocation.amount_allocated, allocation.payment_id]
      );
      
      // 3. Restore invoice outstanding amount
      await client.query(
        'UPDATE invoices SET outstanding_amount = outstanding_amount + $1 WHERE id = $2',
        [allocation.amount_allocated, allocation.invoice_id]
      );
      
      // 4. Delete the allocation
      await client.query('DELETE FROM payment_allocations WHERE id = $1', [allocationId]);
      
      // 5. Update invoice status
      await this.updateInvoiceStatus(client, allocation.invoice_id);
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        success: true,
        message: `Allocation ${allocationId} removed successfully`
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
  
  /**
   * Apply available advance payments to a new invoice
   */
  async applyAdvancePaymentsToInvoice(
    invoiceId: number, 
    customerId: number, 
    advanceAllocations: Array<{paymentId: number, amountToApply: number}>,
    userId: number
  ) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get invoice details
      const invoiceResult = await client.query(
        'SELECT * FROM invoices WHERE id = $1',
        [invoiceId]
      );
      
      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }
      
      const invoice = invoiceResult.rows[0];
      
      // For each advance payment allocation
      let totalApplied = 0;
      const allocations = [];
      
      for (const allocation of advanceAllocations) {
        // Verify payment exists and belongs to the customer
        const paymentResult = await client.query(
          'SELECT * FROM payments WHERE id = $1 AND customer_id = $2 AND is_advance_payment = true',
          [allocation.paymentId, customerId]
        );
        
        if (paymentResult.rows.length === 0) {
          console.warn(`Payment ${allocation.paymentId} is not a valid advance payment for customer ${customerId}`);
          continue;
        }
        
        const payment = paymentResult.rows[0];
        
        // Validate amount to apply
        const amountToApply = Math.min(
          parseFloat(allocation.amountToApply),
          parseFloat(payment.unallocated_amount),
          parseFloat(invoice.outstanding_amount) - totalApplied
        );
        
        if (amountToApply <= 0) {
          console.warn(`Invalid amount to apply for payment ${allocation.paymentId}: ${amountToApply}`);
          continue;
        }
        
        // Create allocation
        const allocationResult = await client.query(
          `INSERT INTO payment_allocations (
            payment_id, 
            invoice_id, 
            amount_allocated, 
            created_by
          ) VALUES ($1, $2, $3, $4) RETURNING id`,
          [allocation.paymentId, invoiceId, amountToApply, userId]
        );
        
        // Update payment unallocated amount
        await client.query(
          'UPDATE payments SET unallocated_amount = unallocated_amount - $1 WHERE id = $2',
          [amountToApply, allocation.paymentId]
        );
        
        // Track total applied
        totalApplied += amountToApply;
        
        allocations.push({
          id: allocationResult.rows[0].id,
          paymentId: allocation.paymentId,
          invoiceId,
          amountAllocated: amountToApply
        });
      }
      
      // Update invoice outstanding amount
      if (totalApplied > 0) {
        await client.query(
          'UPDATE invoices SET outstanding_amount = outstanding_amount - $1 WHERE id = $2',
          [totalApplied, invoiceId]
        );
        
        // Update invoice status
        await this.updateInvoiceStatus(client, invoiceId);
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        success: true,
        totalApplied,
        allocations
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
  
  /**
   * Update the status of an invoice based on its outstanding amount
   */
  private async updateInvoiceStatus(client: any, invoiceId: number) {
    const invoiceResult = await client.query(
      'SELECT id, total_amount, outstanding_amount FROM invoices WHERE id = $1',
      [invoiceId]
    );
    
    if (invoiceResult.rows.length === 0) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }
    
    const invoice = invoiceResult.rows[0];
    let newStatus = 'Pending';
    
    if (parseFloat(invoice.outstanding_amount) <= 0) {
      newStatus = 'Paid';
    } else if (parseFloat(invoice.outstanding_amount) < parseFloat(invoice.total_amount)) {
      newStatus = 'Partially Paid';
    }
    
    await client.query(
      'UPDATE invoices SET status = $1 WHERE id = $2',
      [newStatus, invoiceId]
    );
    
    return newStatus;
  }
  
  /**
   * Get all allocations for an invoice
   */
  async getAllocationsForInvoice(invoiceId: number) {
    const result = await pool.query(
      `SELECT 
        pa.id, 
        pa.payment_id, 
        pa.invoice_id, 
        pa.amount_allocated, 
        pa.allocation_date,
        p.reference_number as payment_reference,
        p.payment_date,
        p.customer_id
      FROM payment_allocations pa
      JOIN payments p ON pa.payment_id = p.id
      WHERE pa.invoice_id = $1
      ORDER BY pa.allocation_date DESC`,
      [invoiceId]
    );
    
    return result.rows;
  }
  
  /**
   * Get all allocations for a payment
   */
  async getAllocationsForPayment(paymentId: number) {
    const result = await pool.query(
      `SELECT 
        pa.id, 
        pa.payment_id, 
        pa.invoice_id, 
        pa.amount_allocated, 
        pa.allocation_date,
        i.invoice_number,
        i.issue_date,
        i.total_amount
      FROM payment_allocations pa
      JOIN invoices i ON pa.invoice_id = i.id
      WHERE pa.payment_id = $1
      ORDER BY pa.allocation_date DESC`,
      [paymentId]
    );
    
    return result.rows;
  }
}

// Export singleton instance
export const paymentAllocationService = new PaymentAllocationService();