import express, { Router } from 'express';
import { writeOffs } from '@shared/schema-finance-write-offs';
import { invoices, users } from '@shared/schema';
import { db } from './db';
import { eq, and, gt } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { canManage } from '@shared/roles';

const router = Router();

// Get all write-offs with optional filtering by status
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = db.select().from(writeOffs)
      .leftJoin(invoices, eq(writeOffs.invoiceId, invoices.id))
      .leftJoin(users, eq(writeOffs.createdBy, users.id));
    
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
      customerName: 'Customer ' + row.invoices?.customerId, // We should join with customers table in a real implementation
      amount: row.write_offs.amount,
      originalInvoiceAmount: row.invoices?.totalAmount || 0,
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
});

// Get a single write-off by ID
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.select()
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
      customerName: 'Customer ' + result.invoices?.customerId, // We should join with customers table in a real implementation
      amount: result.write_offs.amount,
      originalInvoiceAmount: result.invoices?.totalAmount || 0,
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
});

// Create a new write-off
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { invoiceId, amount, reason, notes } = req.body;
    
    if (!invoiceId || !amount || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if invoice exists
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // For now, assume the outstanding amount is the total amount
    // In a real implementation, we'd calculate this from payments
    const outstandingAmount = parseFloat(invoice.totalAmount);
    
    if (outstandingAmount <= 0) {
      return res.status(400).json({ error: 'Invoice has no outstanding amount' });
    }
    
    if (amount > outstandingAmount) {
      return res.status(400).json({ 
        error: `Write-off amount exceeds outstanding amount (${outstandingAmount})` 
      });
    }
    
    // Create the write-off
    const [writeOff] = await db.insert(writeOffs)
      .values({
        invoiceId,
        amount,
        reason,
        notes: notes || null,
        dateCreated: new Date(),
        createdBy: req.user?.id || 3, // From authenticated user with fallback
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
      customerName: 'Customer ' + invoice.customerId, // We should join with customers table in a real implementation
      amount: writeOff.amount,
      originalInvoiceAmount: parseFloat(invoice.totalAmount),
      reason: writeOff.reason,
      notes: writeOff.notes,
      dateCreated: writeOff.dateCreated,
      createdBy: {
        id: writeOff.createdBy,
        name: req.user.username
      },
      status: writeOff.status,
      currency: invoice.currency
    };
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating write-off:', error);
    res.status(500).json({ error: 'Failed to create write-off' });
  }
});

// Update write-off status (approve/reject)
router.patch('/:id/status', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Only managers or above can approve/reject write-offs
    if (!canManage(req.user.role, 'Manager')) {
      return res.status(403).json({ error: 'Not authorized to approve or reject write-offs' });
    }
    
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
        approvedBy: req.user.id,
        approvalDate: new Date().toISOString()
      })
      .where(eq(writeOffs.id, parseInt(id)))
      .returning();
    
    // In a real implementation, if approved, we would also update the invoice's outstanding amount
    // For now, we'll just return success
    
    res.status(200).json({ 
      id: updatedWriteOff.id,
      status: updatedWriteOff.status,
      approvedBy: {
        id: updatedWriteOff.approvedBy,
        name: req.user.username
      },
      approvalDate: updatedWriteOff.approvalDate,
      success: true 
    });
  } catch (error) {
    console.error('Error updating write-off status:', error);
    res.status(500).json({ error: 'Failed to update write-off status' });
  }
});

// Export the router to be used in the main application
export default router;