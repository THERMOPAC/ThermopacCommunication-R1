import { Request, Response } from 'express';
import { writeOffs, insertWriteOffSchema, writeOffStatusUpdateSchema } from '@shared/schema-finance-write-offs';
import { invoices, users } from '@shared/schema';
import { db } from './db';
import { eq, and, gt } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { canManage } from '@shared/roles';

/**
 * Get all write-offs with optional filtering by status
 */
export const getWriteOffs = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    let query = db.select({
      write_offs: writeOffs,
      invoices: invoices,
      users: users
    })
    .from(writeOffs)
    .leftJoin(invoices, eq(writeOffs.invoiceId, invoices.id))
    .leftJoin(users, eq(writeOffs.createdBy, users.id));
    
    // Apply status filter if provided
    if (status) {
      return query.where(eq(writeOffs.status, status as string));
    }
    
    const results = await query.orderBy(writeOffs.dateCreated);
    
    // Map the join results to a clean response object
    const formattedResults = results.map(row => ({
      id: row.write_offs.id,
      invoiceId: row.write_offs.invoiceId,
      invoiceNumber: row.invoices?.invoiceNumber || 'Unknown',
      customerName: row.invoices ? `Customer ${row.invoices.customerId}` : 'Unknown', 
      amount: row.write_offs.amount,
      originalInvoiceAmount: row.invoices?.totalAmount || '0',
      reason: row.write_offs.reason,
      notes: row.write_offs.notes,
      dateCreated: row.write_offs.dateCreated,
      createdBy: {
        id: row.write_offs.createdBy,
        name: row.users?.username || 'Unknown'
      },
      status: row.write_offs.status,
      approvedBy: row.write_offs.approvedBy ? {
        id: row.write_offs.approvedBy,
        name: 'Approver' // We should join with users table for approver in a real implementation
      } : null,
      approvalDate: row.write_offs.approvalDate,
      currency: row.invoices?.currency || 'INR'
    }));
    
    res.status(200).json(formattedResults);
  } catch (error) {
    console.error('Error fetching write-offs:', error);
    res.status(500).json({ error: 'Failed to fetch write-offs' });
  }
};

/**
 * Get a single write-off by ID
 */
export const getWriteOffById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.select({
      write_offs: writeOffs,
      invoices: invoices,
      users: users
    })
    .from(writeOffs)
    .leftJoin(invoices, eq(writeOffs.invoiceId, invoices.id))
    .leftJoin(users, eq(writeOffs.createdBy, users.id))
    .where(eq(writeOffs.id, parseInt(id)));
    
    if (!result) {
      return res.status(404).json({ error: 'Write-off not found' });
    }
    
    // Format the response
    const writeOff = {
      id: result.write_offs.id,
      invoiceId: result.write_offs.invoiceId,
      invoiceNumber: result.invoices?.invoiceNumber || 'Unknown',
      customerName: result.invoices ? `Customer ${result.invoices.customerId}` : 'Unknown',
      amount: result.write_offs.amount,
      originalInvoiceAmount: result.invoices?.totalAmount || '0',
      reason: result.write_offs.reason,
      notes: result.write_offs.notes,
      dateCreated: result.write_offs.dateCreated,
      createdBy: {
        id: result.write_offs.createdBy,
        name: result.users?.username || 'Unknown'
      },
      status: result.write_offs.status,
      approvedBy: result.write_offs.approvedBy ? {
        id: result.write_offs.approvedBy,
        name: 'Approver' // We should join with users table for approver in a real implementation
      } : null,
      approvalDate: result.write_offs.approvalDate,
      currency: result.invoices?.currency || 'INR'
    };
    
    res.status(200).json(writeOff);
  } catch (error) {
    console.error('Error fetching write-off:', error);
    res.status(500).json({ error: 'Failed to fetch write-off' });
  }
};

/**
 * Create a new write-off
 */
export const createWriteOff = async (req: Request, res: Response) => {
  try {
    // Validate the request body
    const result = insertWriteOffSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Invalid write-off data', 
        details: result.error.format() 
      });
    }
    
    const validatedData = result.data;
    
    // Check if invoice exists
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, validatedData.invoiceId));
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Calculate outstanding amount from total amount
    // In a real implementation, we would subtract allocated payments
    const outstandingAmount = parseFloat(invoice.totalAmount);
    
    if (outstandingAmount <= 0) {
      return res.status(400).json({ error: 'Invoice has no outstanding amount' });
    }
    
    if (validatedData.amount > outstandingAmount) {
      return res.status(400).json({ 
        error: `Write-off amount exceeds outstanding amount (${outstandingAmount})` 
      });
    }
    
    // Create the write-off
    const [writeOff] = await db.insert(writeOffs)
      .values({
        invoiceId: validatedData.invoiceId,
        amount: validatedData.amount.toString(), // Convert to string for database
        reason: validatedData.reason,
        notes: validatedData.notes,
        dateCreated: new Date(),
        createdBy: req.user?.id || 1, // From authenticated user or fallback
        status: 'Pending',
        approvedBy: null,
        approvalDate: null
      })
      .returning();
    
    // Format the response with invoice details
    const result2 = {
      id: writeOff.id,
      invoiceId: writeOff.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerName: `Customer ${invoice.customerId}`, 
      amount: writeOff.amount,
      originalInvoiceAmount: invoice.totalAmount,
      reason: writeOff.reason,
      notes: writeOff.notes,
      dateCreated: writeOff.dateCreated,
      createdBy: {
        id: writeOff.createdBy,
        name: req.user!.username
      },
      status: writeOff.status,
      currency: invoice.currency
    };
    
    res.status(201).json(result2);
  } catch (error) {
    console.error('Error creating write-off:', error);
    res.status(500).json({ error: 'Failed to create write-off' });
  }
};

/**
 * Update write-off status (approve/reject)
 */
export const updateWriteOffStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate the request body
    const result = writeOffStatusUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Invalid status update data', 
        details: result.error.format() 
      });
    }
    
    const { status, notes } = result.data;
    
    // Only managers or above can approve/reject write-offs
    if (!canManage(req.user!.role, 'Manager')) {
      return res.status(403).json({ error: 'Not authorized to approve or reject write-offs' });
    }
    
    // Get the write-off
    const [existingWriteOff] = await db.select()
      .from(writeOffs)
      .where(eq(writeOffs.id, parseInt(id)));
    
    if (!existingWriteOff) {
      return res.status(404).json({ error: 'Write-off not found' });
    }
    
    if (existingWriteOff.status !== 'Pending') {
      return res.status(400).json({ 
        error: `Write-off is already ${existingWriteOff.status.toLowerCase()}` 
      });
    }
    
    // Update the write-off status
    const [updatedWriteOff] = await db.update(writeOffs)
      .set({
        status,
        approvedBy: req.user!.id,
        approvalDate: new Date(),
        notes: notes ? (existingWriteOff.notes ? `${existingWriteOff.notes}\n\n${notes}` : notes) : existingWriteOff.notes
      })
      .where(eq(writeOffs.id, parseInt(id)))
      .returning();
    
    // If approved, update the invoice outstanding amount
    if (status === 'Approved') {
      // In a real implementation, we would update the invoice's outstanding amount
      // This would involve calculating the current outstanding amount and subtracting the write-off amount
      // For now, we'll just note that it should be done
      console.log(`Write-off ${id} approved. Should update invoice ${existingWriteOff.invoiceId} outstanding amount.`);
    }
    
    res.status(200).json({ 
      id: updatedWriteOff.id,
      status: updatedWriteOff.status,
      approvedBy: {
        id: updatedWriteOff.approvedBy,
        name: req.user!.username
      },
      approvalDate: updatedWriteOff.approvalDate,
      notes: updatedWriteOff.notes,
      success: true 
    });
  } catch (error) {
    console.error('Error updating write-off status:', error);
    res.status(500).json({ error: 'Failed to update write-off status' });
  }
};

// Register the write-off routes
export const registerWriteOffRoutes = (app: any) => {
  app.get('/api/finance/write-offs', ensureAuthenticated, getWriteOffs);
  app.get('/api/finance/write-offs/:id', ensureAuthenticated, getWriteOffById);
  app.post('/api/finance/write-offs', ensureAuthenticated, createWriteOff);
  app.patch('/api/finance/write-offs/:id/status', ensureAuthenticated, updateWriteOffStatus);
  
  console.log('Write-off routes registered');
};

// Export as a service object for other modules to use
export const writeOffService = {
  getWriteOffs,
  getWriteOffById,
  createWriteOff,
  updateWriteOffStatus,
  registerWriteOffRoutes
};