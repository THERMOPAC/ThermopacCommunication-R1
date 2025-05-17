import { pool } from './db';

/**
 * Service for handling financial write-offs
 */
export class WriteOffService {
  /**
   * Create a write-off for an invoice
   */
  async writeOffInvoice(
    invoiceId: number,
    amount: number,
    reason: string,
    userId: number,
    options: {
      status?: 'Pending' | 'Approved' | 'Rejected';
      glAccount?: string;
    } = {}
  ) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the invoice details
      const invoiceResult = await client.query(
        'SELECT * FROM invoices WHERE id = $1',
        [invoiceId]
      );
      
      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }
      
      const invoice = invoiceResult.rows[0];
      
      // Validate the write-off amount
      if (amount <= 0) {
        throw new Error('Write-off amount must be greater than zero');
      }
      
      if (amount > parseFloat(invoice.outstanding_amount)) {
        throw new Error(`Cannot write off more than the outstanding amount (${invoice.outstanding_amount})`);
      }
      
      // Set default status if not provided
      const status = options.status || 'Approved';
      
      // Create the write-off record
      const writeOffResult = await client.query(
        `INSERT INTO write_offs (
          source_type,
          source_id,
          amount,
          reason,
          status,
          created_by,
          gl_account
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          'Invoice',
          invoiceId,
          amount,
          reason,
          status,
          userId,
          options.glAccount || null
        ]
      );
      
      const writeOffId = writeOffResult.rows[0].id;
      
      // If status is Approved, update the invoice outstanding amount
      if (status === 'Approved') {
        // Update the invoice outstanding amount
        await client.query(
          'UPDATE invoices SET outstanding_amount = outstanding_amount - $1 WHERE id = $2',
          [amount, invoiceId]
        );
        
        // Check if the invoice is now fully paid
        const updatedInvoiceResult = await client.query(
          'SELECT outstanding_amount FROM invoices WHERE id = $1',
          [invoiceId]
        );
        
        const updatedInvoice = updatedInvoiceResult.rows[0];
        
        // Update the invoice status if necessary
        if (parseFloat(updatedInvoice.outstanding_amount) <= 0) {
          await client.query(
            'UPDATE invoices SET status = $1 WHERE id = $2',
            ['Paid', invoiceId]
          );
        }
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        id: writeOffId,
        invoiceId,
        amount,
        reason,
        status,
        message: `Invoice ${invoiceId} write-off ${status === 'Approved' ? 'created and applied' : 'created'} successfully`
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
   * Create a write-off for a payment's unallocated amount
   */
  async writeOffPayment(
    paymentId: number,
    amount: number,
    reason: string,
    userId: number,
    options: {
      status?: 'Pending' | 'Approved' | 'Rejected';
      glAccount?: string;
    } = {}
  ) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the payment details
      const paymentResult = await client.query(
        'SELECT * FROM payments WHERE id = $1',
        [paymentId]
      );
      
      if (paymentResult.rows.length === 0) {
        throw new Error(`Payment with ID ${paymentId} not found`);
      }
      
      const payment = paymentResult.rows[0];
      
      // Validate the write-off amount
      if (amount <= 0) {
        throw new Error('Write-off amount must be greater than zero');
      }
      
      if (amount > parseFloat(payment.unallocated_amount)) {
        throw new Error(`Cannot write off more than the unallocated amount (${payment.unallocated_amount})`);
      }
      
      // Set default status if not provided
      const status = options.status || 'Approved';
      
      // Create the write-off record
      const writeOffResult = await client.query(
        `INSERT INTO write_offs (
          source_type,
          source_id,
          amount,
          reason,
          status,
          created_by,
          gl_account
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          'Payment',
          paymentId,
          amount,
          reason,
          status,
          userId,
          options.glAccount || null
        ]
      );
      
      const writeOffId = writeOffResult.rows[0].id;
      
      // If status is Approved, update the payment unallocated amount
      if (status === 'Approved') {
        await client.query(
          'UPDATE payments SET unallocated_amount = unallocated_amount - $1 WHERE id = $2',
          [amount, paymentId]
        );
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        id: writeOffId,
        paymentId,
        amount,
        reason,
        status,
        message: `Payment ${paymentId} write-off ${status === 'Approved' ? 'created and applied' : 'created'} successfully`
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
   * Approve a pending write-off
   */
  async approveWriteOff(writeOffId: number, approvedByUserId: number) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the write-off details
      const writeOffResult = await client.query(
        'SELECT * FROM write_offs WHERE id = $1',
        [writeOffId]
      );
      
      if (writeOffResult.rows.length === 0) {
        throw new Error(`Write-off with ID ${writeOffId} not found`);
      }
      
      const writeOff = writeOffResult.rows[0];
      
      // Check if the write-off is already approved or rejected
      if (writeOff.status !== 'Pending') {
        throw new Error(`Write-off is already ${writeOff.status.toLowerCase()}`);
      }
      
      // Update the write-off status
      await client.query(
        'UPDATE write_offs SET status = $1, approved_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['Approved', approvedByUserId, writeOffId]
      );
      
      // Apply the write-off based on the source type
      if (writeOff.source_type === 'Invoice') {
        // Update the invoice outstanding amount
        await client.query(
          'UPDATE invoices SET outstanding_amount = outstanding_amount - $1 WHERE id = $2',
          [writeOff.amount, writeOff.source_id]
        );
        
        // Check if the invoice is now fully paid
        const invoiceResult = await client.query(
          'SELECT outstanding_amount FROM invoices WHERE id = $1',
          [writeOff.source_id]
        );
        
        if (invoiceResult.rows.length > 0) {
          const invoice = invoiceResult.rows[0];
          
          // Update the invoice status if necessary
          if (parseFloat(invoice.outstanding_amount) <= 0) {
            await client.query(
              'UPDATE invoices SET status = $1 WHERE id = $2',
              ['Paid', writeOff.source_id]
            );
          } else if (parseFloat(invoice.outstanding_amount) < parseFloat(invoice.total_amount)) {
            await client.query(
              'UPDATE invoices SET status = $1 WHERE id = $2',
              ['Partially Paid', writeOff.source_id]
            );
          }
        }
      } else if (writeOff.source_type === 'Payment') {
        // Update the payment unallocated amount
        await client.query(
          'UPDATE payments SET unallocated_amount = unallocated_amount - $1 WHERE id = $2',
          [writeOff.amount, writeOff.source_id]
        );
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        id: writeOffId,
        status: 'Approved',
        approvedBy: approvedByUserId,
        message: `Write-off ${writeOffId} approved and applied successfully`
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
   * Reject a pending write-off
   */
  async rejectWriteOff(writeOffId: number, approvedByUserId: number, reason: string = '') {
    const client = await pool.connect();
    
    try {
      // Get the write-off details
      const writeOffResult = await client.query(
        'SELECT * FROM write_offs WHERE id = $1',
        [writeOffId]
      );
      
      if (writeOffResult.rows.length === 0) {
        throw new Error(`Write-off with ID ${writeOffId} not found`);
      }
      
      const writeOff = writeOffResult.rows[0];
      
      // Check if the write-off is already approved or rejected
      if (writeOff.status !== 'Pending') {
        throw new Error(`Write-off is already ${writeOff.status.toLowerCase()}`);
      }
      
      // Update the write-off status and reason
      await client.query(
        'UPDATE write_offs SET status = $1, approved_by = $2, reason = CONCAT(reason, $3), updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        ['Rejected', approvedByUserId, reason ? ` (Rejection reason: ${reason})` : '', writeOffId]
      );
      
      return {
        id: writeOffId,
        status: 'Rejected',
        approvedBy: approvedByUserId,
        message: `Write-off ${writeOffId} rejected successfully`
      };
    } catch (error) {
      throw error;
    } finally {
      // Release the client
      client.release();
    }
  }
  
  /**
   * Get write-offs by source (invoice or payment)
   */
  async getWriteOffsBySource(sourceType: 'Invoice' | 'Payment', sourceId: number) {
    try {
      const result = await pool.query(
        `SELECT 
          w.id,
          w.source_type as "sourceType",
          w.source_id as "sourceId",
          w.amount,
          w.reason,
          w.status,
          w.created_by as "createdBy",
          u1.username as "createdByUser",
          w.approved_by as "approvedBy",
          u2.username as "approvedByUser",
          w.gl_account as "glAccount",
          w.created_at as "createdAt",
          w.updated_at as "updatedAt"
        FROM 
          write_offs w
        LEFT JOIN
          users u1 ON w.created_by = u1.id
        LEFT JOIN
          users u2 ON w.approved_by = u2.id
        WHERE 
          w.source_type = $1 AND w.source_id = $2
        ORDER BY 
          w.created_at DESC`,
        [sourceType, sourceId]
      );
      
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get all write-offs with optional filters
   */
  async getAllWriteOffs(filters: {
    status?: 'Pending' | 'Approved' | 'Rejected';
    sourceType?: 'Invoice' | 'Payment';
    createdBy?: number;
    fromDate?: Date;
    toDate?: Date;
  } = {}) {
    let query = `
      SELECT 
        w.id,
        w.source_type as "sourceType",
        w.source_id as "sourceId",
        w.amount,
        w.reason,
        w.status,
        w.created_by as "createdBy",
        u1.username as "createdByUser",
        w.approved_by as "approvedBy",
        u2.username as "approvedByUser",
        w.gl_account as "glAccount",
        w.created_at as "createdAt",
        w.updated_at as "updatedAt"
      FROM 
        write_offs w
      LEFT JOIN
        users u1 ON w.created_by = u1.id
      LEFT JOIN
        users u2 ON w.approved_by = u2.id
      WHERE 1=1
    `;
    
    const queryParams: any[] = [];
    let paramIndex = 1;
    
    // Add filters if provided
    if (filters.status) {
      query += ` AND w.status = $${paramIndex++}`;
      queryParams.push(filters.status);
    }
    
    if (filters.sourceType) {
      query += ` AND w.source_type = $${paramIndex++}`;
      queryParams.push(filters.sourceType);
    }
    
    if (filters.createdBy) {
      query += ` AND w.created_by = $${paramIndex++}`;
      queryParams.push(filters.createdBy);
    }
    
    if (filters.fromDate) {
      query += ` AND w.created_at >= $${paramIndex++}`;
      queryParams.push(filters.fromDate);
    }
    
    if (filters.toDate) {
      query += ` AND w.created_at <= $${paramIndex++}`;
      queryParams.push(filters.toDate);
    }
    
    // Add order by
    query += ` ORDER BY w.created_at DESC`;
    
    try {
      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
}

// Export singleton instance
export const writeOffService = new WriteOffService();