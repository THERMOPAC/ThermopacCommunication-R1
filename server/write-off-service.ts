import { db } from './db';
import { invoices } from '@shared/schema';
import { writeOffs } from '@shared/schema-finance-write-offs';
import { eq, and, gt } from 'drizzle-orm';
import { Request, Response } from 'express';
import { ensureAuthenticated } from './auth-middleware';

// Get all write-offs with optional filtering by status
export const getWriteOffs = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    let query = db.select().from(writeOffs)
      .leftJoin(invoices, eq(writeOffs.invoiceId, invoices.id));
    
    // Apply status filter if provided
    if (status) {
      query = query.where(eq(writeOffs.status, status as string));
    }
    
    const results = await query.orderBy(writeOffs.dateCreated);
    
    // Map the join results to a clean response object
    const formattedResults = results.map(row => ({
      id: row.write_offs.id,
      invoiceId: row.write_offs.invoiceId,
      invoiceNumber: row.invoices?.invoiceNumber || 'Unknown',
      customerName: row.invoices?.customerName || 'Unknown',
      amount: row.write_offs.amount,
      originalInvoiceAmount: row.invoices?.amount || 0,
      reason: row.write_offs.reason,
      notes: row.write_offs.notes,
      dateCreated: row.write_offs.dateCreated,
      createdBy: row.write_offs.createdBy,
      status: row.write_offs.status,
      approvedBy: row.write_offs.approvedBy,
      approvalDate: row.write_offs.approvalDate,
      currency: row.invoices?.currency || 'INR'
    }));
    
    res.status(200).json(formattedResults);
  } catch (error) {
    console.error('Error fetching write-offs:', error);
    res.status(500).json({ error: 'Failed to fetch write-offs' });
  }
};

// Get a single write-off by ID
export const getWriteOffById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.select()
      .from(writeOffs)
      .leftJoin(invoices, eq(writeOffs.invoiceId, invoices.id))
      .where(eq(writeOffs.id, parseInt(id)));
    
    if (!result) {
      return res.status(404).json({ error: 'Write-off not found' });
    }
    
    // Format the response
    const writeOff = {
      id: result.write_offs.id,
      invoiceId: result.write_offs.invoiceId,
      invoiceNumber: result.invoices?.invoiceNumber || 'Unknown',
      customerName: result.invoices?.customerName || 'Unknown',
      amount: result.write_offs.amount,
      originalInvoiceAmount: result.invoices?.amount || 0,
      reason: result.write_offs.reason,
      notes: result.write_offs.notes,
      dateCreated: result.write_offs.dateCreated,
      createdBy: result.write_offs.createdBy,
      status: result.write_offs.status,
      approvedBy: result.write_offs.approvedBy,
      approvalDate: result.write_offs.approvalDate,
      currency: result.invoices?.currency || 'INR'
    };
    
    res.status(200).json(writeOff);
  } catch (error) {
    console.error('Error fetching write-off:', error);
    res.status(500).json({ error: 'Failed to fetch write-off' });
  }
};

// Create a new write-off
export const createWriteOff = async (req: Request, res: Response) => {
  try {
    const { invoiceId, amount, reason, notes } = req.body;
    
    if (!invoiceId || !amount || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if invoice exists and has outstanding amount
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    if (invoice.outstandingAmount <= 0) {
      return res.status(400).json({ error: 'Invoice has no outstanding amount' });
    }
    
    if (amount > invoice.outstandingAmount) {
      return res.status(400).json({ 
        error: `Write-off amount exceeds outstanding amount (${invoice.outstandingAmount})` 
      });
    }
    
    // Create the write-off
    const [writeOff] = await db.insert(writeOffs)
      .values({
        invoiceId,
        amount,
        reason,
        notes: notes || null,
        dateCreated: new Date().toISOString(),
        createdBy: req.user ? req.user.id : 1, // Default to user ID 1 if not authenticated
        status: 'Pending',
        approvedBy: null,
        approvalDate: null
      })
      .returning();
    
    // Format the response with invoice details
    const result = {
      id: writeOff.id,
      invoiceId: writeOff.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      amount: writeOff.amount,
      originalInvoiceAmount: invoice.amount,
      reason: writeOff.reason,
      notes: writeOff.notes,
      dateCreated: writeOff.dateCreated,
      createdBy: writeOff.createdBy,
      status: writeOff.status,
      currency: invoice.currency
    };
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating write-off:', error);
    res.status(500).json({ error: 'Failed to create write-off' });
  }
};

// Update write-off status (approve/reject)
export const updateWriteOffStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
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
        approvedBy: req.user ? req.user.id : 1, // Default to user ID 1 if not authenticated
        approvalDate: new Date().toISOString()
      })
      .where(eq(writeOffs.id, parseInt(id)))
      .returning();
    
    // If approved, update the invoice outstanding amount
    if (status === 'Approved') {
      const [invoice] = await db.select()
        .from(invoices)
        .where(eq(invoices.id, existingWriteOff.invoiceId));
      
      if (invoice) {
        // Reduce the outstanding amount by the write-off amount
        const newOutstandingAmount = Math.max(0, invoice.outstandingAmount - existingWriteOff.amount);
        
        await db.update(invoices)
          .set({ outstandingAmount: newOutstandingAmount })
          .where(eq(invoices.id, invoice.id));
      }
    }
    
    res.status(200).json({ 
      id: updatedWriteOff.id,
      status: updatedWriteOff.status,
      approvedBy: updatedWriteOff.approvedBy,
      approvalDate: updatedWriteOff.approvalDate,
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