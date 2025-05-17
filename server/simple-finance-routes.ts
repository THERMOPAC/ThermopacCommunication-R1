import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { storage } from './storage';
import { InsertInvoice, InsertInvoiceItem } from '@shared/schema';
import { db } from './db';

const router = Router();

/**
 * Create a new invoice - simplified version without database operations
 */
router.post('/invoices', ensureAuthenticated, (req: Request, res: Response) => {
  try {
    // Log the received data for debugging
    console.log('Creating invoice with data:', JSON.stringify(req.body, null, 2));
    
    // Extract data from the request body
    const { invoice, items } = req.body;
    
    if (!invoice) {
      return res.status(400).json({ error: 'Invalid request body - invoice data missing' });
    }
    
    // Calculate total amount
    const totalAmount = invoice.totalAmount || 
      (items && items.length > 0 
        ? items.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0) 
        : 0);
    
    // Create a response object without using database
    const newInvoice = {
      id: Math.floor(Math.random() * 1000), // Generate random ID
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      projectId: invoice.projectId,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      totalAmount: totalAmount,
      currency: invoice.currency || 'USD',
      sapInvoiceNo: invoice.sapInvoiceNo || null,
      invoiceType: invoice.invoiceType || 'Product',
      status: 'Pending',
      notes: invoice.notes || null,
      createdBy: req.user?.id || 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Log the success
    console.log('Successfully created invoice (mock):', newInvoice.id);
    
    // Return success response
    res.status(201).json(newInvoice);
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ 
      error: 'Failed to create invoice',
      details: error.message 
    });
  }
});

/**
 * Get all invoices - simplified for testing
 */
router.get('/invoices', ensureAuthenticated, (req: Request, res: Response) => {
  // Return mock invoice data
  res.json({
    invoices: [
      {
        id: 1,
        invoiceNumber: 'INV-2526-001',
        customerId: 1,
        customerName: 'Acme Corp',
        issueDate: '2025-04-01',
        dueDate: '2025-05-01',
        totalAmount: 1000,
        currency: 'USD',
        sapInvoiceNo: 'SAP-001',
        invoiceType: 'Product',
        status: 'Paid',
        createdAt: '2025-04-01T00:00:00Z'
      },
      {
        id: 2,
        invoiceNumber: 'INV-2526-002',
        customerId: 2,
        customerName: 'Beta Industries',
        issueDate: '2025-04-15',
        dueDate: '2025-05-15',
        totalAmount: 2500,
        currency: 'USD',
        sapInvoiceNo: 'SAP-002',
        invoiceType: 'Service',
        status: 'Pending',
        createdAt: '2025-04-15T00:00:00Z'
      }
    ]
  });
});

export default router;