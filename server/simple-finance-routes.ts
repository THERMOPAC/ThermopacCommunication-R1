import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { storage } from './storage';
import { InsertInvoice, InsertInvoiceItem } from '@shared/schema';
import { db } from './db';

const router = Router();

/**
 * Create a new invoice - with database persistence
 */
router.post('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
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
    
    // Prepare the invoice data for database insertion
    const invoiceData: InsertInvoice = {
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      projectId: invoice.projectId || null,
      invoiceDate: new Date(invoice.issueDate),
      dueDate: new Date(invoice.dueDate),
      totalAmount: totalAmount,
      currency: invoice.currency || 'USD',
      sapInvoiceNo: invoice.sapInvoiceNo || null,
      invoiceType: invoice.invoiceType || 'Product',
      status: 'Pending',
      notes: invoice.notes || null,
      createdBy: req.user?.id || 1
    };
    
    // Prepare invoice items
    const invoiceItems: InsertInvoiceItem[] = [];
    if (items && items.length > 0) {
      for (const item of items) {
        invoiceItems.push({
          description: item.description || '',
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || parseFloat(item.amount) || 0,
          amount: parseFloat(item.amount) || 0,
          taxRate: parseFloat(item.taxRate) || 0,
          taxAmount: parseFloat(item.taxAmount) || 0,
          discountPercent: parseFloat(item.discountPercent) || 0,
          discountAmount: parseFloat(item.discountAmount) || 0,
          lineTotal: parseFloat(item.lineTotal) || parseFloat(item.amount) || 0,
          projectItemId: item.projectItemId || null,
          masterItemId: item.masterItemId || null,
          hsnCode: item.hsnCode || null
        });
      }
    }
    
    // Save the invoice to the database
    const savedInvoice = await storage.createInvoice(invoiceData, invoiceItems);
    
    // Log the success
    console.log('Successfully created invoice:', savedInvoice.id);
    
    // Return success response
    res.status(201).json(savedInvoice);
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ 
      error: 'Failed to create invoice',
      details: error.message 
    });
  }
});

/**
 * Get all invoices with filtering
 */
router.get('/invoices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { 
      customerId, 
      projectId, 
      fromDate, 
      toDate, 
      status, 
      currency 
    } = req.query;

    // Build filters for database query
    const filters: any = {};
    
    if (customerId) {
      filters.customerId = parseInt(customerId as string);
    }
    
    if (projectId) {
      filters.projectId = parseInt(projectId as string);
    }
    
    if (fromDate) {
      filters.fromDate = new Date(fromDate as string);
    }
    
    if (toDate) {
      filters.toDate = new Date(toDate as string);
    }
    
    if (status) {
      filters.status = status as string;
    }
    
    if (currency) {
      filters.currency = currency as string;
    }
    
    // Fetch invoices from database
    const invoices = await storage.getInvoices(filters);
    
    // Return the invoices
    res.json({ invoices });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      error: 'Failed to fetch invoices',
      details: error.message
    });
  }
});

/**
 * Get a single invoice by ID
 */
router.get('/invoices/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // Fetch the invoice from database
    const invoice = await storage.getInvoice(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Return the invoice
    res.json({ invoice });
  } catch (error: any) {
    console.error(`Error fetching invoice ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to fetch invoice',
      details: error.message
    });
  }
});

/**
 * Get all items for an invoice
 */
router.get('/invoices/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    
    // First check if the invoice exists
    const invoice = await storage.getInvoice(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Fetch the invoice items from database
    const items = await storage.getInvoiceItems(invoiceId);
    
    // Return the items
    res.json({ items });
  } catch (error: any) {
    console.error(`Error fetching items for invoice ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to fetch invoice items',
      details: error.message
    });
  }
});

export default router;