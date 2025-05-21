import express, { Router } from 'express';
import { writeOffs } from '@shared/schema-finance-write-offs';
import { invoices, users, customers } from '@shared/schema';
import { db } from './db';
import { eq, and, gt } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { canManage } from '@shared/roles';

const router = Router();

// Get all write-offs with optional filtering by status
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Create a query builder for selecting the data
    const qb = db.select({
      writeOff: writeOffs,
      invoice: invoices,
      user: users,
      customer: customers
    })
    .from(writeOffs)
    .leftJoin(invoices, eq(writeOffs.invoiceId, invoices.id))
    .leftJoin(users, eq(writeOffs.createdBy, users.id))
    .leftJoin(customers, eq(invoices.customerId, customers.id));
    
    // Apply status filter if provided
    let results;
    if (status && typeof status === 'string') {
      results = await qb.where(eq(writeOffs.status, status))
        .orderBy(writeOffs.dateCreated);
    } else {
      results = await qb.orderBy(writeOffs.dateCreated);
    }
    
    // Map the join results to a clean response object
    // Log the first row of results to see what we're working with
    console.log("Customer data from first write-off:", results[0]?.customer);
    
    // Log the actual properties on the customer object
    if (results.length > 0 && results[0].customer) {
      console.log("Customer object keys:", Object.keys(results[0].customer));
      for (const key of Object.keys(results[0].customer)) {
        console.log(`Key: ${key}, Value: ${results[0].customer[key]}`);
      }
    }
    
    const formattedResults = results.map(row => {
      // Get customer name regardless of case convention
      let customerName = 'Unknown Customer';
      if (row.customer) {
        // Try both ways of accessing the property
        customerName = row.customer.bpName || row.customer['bpName'] || 'Unknown Customer';
        console.log(`Customer ID: ${row.customer.id}, Name found: ${customerName}`);
      }
      
      return {
        id: row.writeOff.id,
        invoiceId: row.writeOff.invoiceId,
        invoiceNumber: row.invoice?.invoiceNumber || 'Unknown',
        customerName: customerName,
        amount: row.writeOff.amount,
        originalInvoiceAmount: row.invoice?.totalAmount || '0',
        reason: row.writeOff.reason,
        notes: row.writeOff.notes,
        dateCreated: row.writeOff.dateCreated,
        createdBy: {
          id: row.writeOff.createdBy,
          name: row.user?.username || 'Unknown'
        },
        status: row.writeOff.status,
        approvedBy: row.writeOff.approvedBy ? {
          id: row.writeOff.approvedBy,
          name: 'Approver' // We should join with users table for approver in a real implementation
        } : null,
        approvalDate: row.writeOff.approvalDate,
        currency: row.invoice?.currency || 'INR'
      };
    });
    
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
    
    const [result] = await db.select({
      writeOff: writeOffs,
      invoice: invoices,
      user: users,
      customer: customers
    })
    .from(writeOffs)
    .leftJoin(invoices, eq(writeOffs.invoiceId, invoices.id))
    .leftJoin(users, eq(writeOffs.createdBy, users.id))
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(writeOffs.id, parseInt(id)));
    
    if (!result) {
      return res.status(404).json({ error: 'Write-off not found' });
    }
    
    // Format the response
    const writeOff = {
      id: result.writeOff.id,
      invoiceId: result.writeOff.invoiceId,
      invoiceNumber: result.invoice?.invoiceNumber || 'Unknown',
      customerName: result.customer?.bpName || 'Unknown Customer',
      amount: result.writeOff.amount,
      originalInvoiceAmount: result.invoice?.totalAmount || '0',
      reason: result.writeOff.reason,
      notes: result.writeOff.notes,
      dateCreated: result.writeOff.dateCreated,
      createdBy: {
        id: result.writeOff.createdBy,
        name: result.user?.username || 'Unknown'
      },
      status: result.writeOff.status,
      approvedBy: result.writeOff.approvedBy ? {
        id: result.writeOff.approvedBy,
        name: 'Approver' // We should join with users table for approver in a real implementation
      } : null,
      approvalDate: result.writeOff.approvalDate,
      currency: result.invoice?.currency || 'INR'
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
    
    // Check if invoice exists and get customer information
    const [result] = await db.select({
      invoice: invoices,
      customer: customers
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(invoices.id, invoiceId));
    
    if (!result || !result.invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = result.invoice;
    
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
    const responseData = {
      id: writeOff.id,
      invoiceId: writeOff.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerName: result.customer?.bpName || 'Unknown Customer',
      amount: writeOff.amount,
      originalInvoiceAmount: parseFloat(invoice.totalAmount),
      reason: writeOff.reason,
      notes: writeOff.notes,
      dateCreated: writeOff.dateCreated,
      createdBy: {
        id: writeOff.createdBy,
        name: req.user?.username || 'Unknown'
      },
      status: writeOff.status,
      currency: invoice.currency
    };
    
    res.status(201).json(responseData);
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
    if (!req.user || !canManage(req.user.role, 'Manager')) {
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
        approvedBy: req.user?.id || null,
        approvalDate: new Date()
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
        name: req.user?.username || 'Unknown'
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
