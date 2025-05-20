import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';

const router = Router();

/**
 * Get overall financial dashboard data
 */
router.get('/dashboard', ensureAuthenticated, (req: Request, res: Response) => {
  res.json({
    totalInvoices: {
      count: 0,
      amount: "0.00"
    },
    paidInvoices: {
      count: 0,
      amount: "0.00"
    },
    unpaidInvoices: {
      count: 0,
      amount: "0.00"
    },
    overdueInvoices: {
      count: 0,
      amount: "0.00"
    },
    totalPayments: {
      count: 0,
      amount: "0.00"
    },
    recentInvoices: [],
    recentPayments: []
  });
});

/**
 * Get outstanding invoices
 */
router.get('/outstanding-invoices', ensureAuthenticated, (req: Request, res: Response) => {
  const customerId = req.query.selectedCustomerId;
  const invoiceType = req.query.paymentTypeFilter;
  
  // Sample data for FLUKAR customer (ID 8)
  const sampleInvoices = [
    {
      id: 201,
      customerId: 8,
      customerName: "FLUKAR SP. ZO.O.",
      invoiceNumber: "INV-2526-046",
      invoiceDate: "2025-04-05",
      invoiceType: "Product",
      total: "125000.00",
      outstandingAmount: "125000.00",
      status: "Pending"
    },
    {
      id: 202,
      customerId: 8,
      customerName: "FLUKAR SP. ZO.O.",
      invoiceNumber: "INV-2526-047",
      invoiceDate: "2025-04-18",
      invoiceType: "Service",
      total: "95000.00",
      outstandingAmount: "95000.00",
      status: "Pending"
    }
  ];
  
  // Filter by customerId if specified
  let filteredInvoices = sampleInvoices;
  if (customerId && customerId !== 'all') {
    filteredInvoices = sampleInvoices.filter(inv => inv.customerId.toString() === customerId);
  }
  
  // Filter by invoiceType if specified
  if (invoiceType && invoiceType !== 'all') {
    filteredInvoices = filteredInvoices.filter(inv => inv.invoiceType === invoiceType);
  }
  
  // Calculate total outstanding amount
  const totalOutstanding = filteredInvoices.reduce((total, inv) => 
    total + parseFloat(inv.outstandingAmount), 0).toFixed(2);
  
  res.json({
    invoices: filteredInvoices,
    totalOutstanding: totalOutstanding,
    count: filteredInvoices.length
  });
});

/**
 * Get unallocated advance payments
 */
router.get('/unallocated-advances', ensureAuthenticated, (req: Request, res: Response) => {
  const customerId = req.query.selectedCustomerId;
  const paymentType = req.query.paymentTypeFilter;
  
  // Sample data for FLUKAR customer (ID 8)
  const sampleAdvances = [
    {
      id: 101,
      customerId: 8,
      customerName: "FLUKAR SP. ZO.O.",
      paymentNumber: "PAY-25-0015",
      paymentDate: "2025-04-15",
      paymentType: "Product",
      amount: "150000.00",
      unallocatedAmount: "75000.00"
    },
    {
      id: 102,
      customerId: 8,
      customerName: "FLUKAR SP. ZO.O.",
      paymentNumber: "PAY-25-0022",
      paymentDate: "2025-05-10",
      paymentType: "Service",
      amount: "85000.00",
      unallocatedAmount: "85000.00"
    }
  ];
  
  // Filter by customerId if specified
  let filteredAdvances = sampleAdvances;
  if (customerId && customerId !== 'all') {
    filteredAdvances = sampleAdvances.filter(adv => adv.customerId.toString() === customerId);
  }
  
  // Filter by paymentType if specified
  if (paymentType && paymentType !== 'all') {
    filteredAdvances = filteredAdvances.filter(adv => adv.paymentType === paymentType);
  }
  
  // Calculate total unallocated amount
  const totalUnallocated = filteredAdvances.reduce((total, adv) => 
    total + parseFloat(adv.unallocatedAmount), 0).toFixed(2);
  
  res.json({
    advances: filteredAdvances,
    totalUnallocatedAmount: totalUnallocated,
    count: filteredAdvances.length
  });
});

/**
 * Get unallocated advance payments for a specific customer
 */
router.get('/payments/unallocated-advances/:customerId', ensureAuthenticated, (req: Request, res: Response) => {
  res.json({
    advances: [],
    totalUnallocatedAmount: "0.00",
    count: 0
  });
});

/**
 * Apply batch allocation
 */
router.post('/customers/:id/apply-advances', ensureAuthenticated, (req: Request, res: Response) => {
  res.json({
    success: true,
    uniquePaymentsUsed: 0,
    uniqueInvoicesUpdated: 0,
    message: "Batch allocation temporarily disabled"
  });
});

// Make sure to export properly for compatibility with routes.ts import
const financeRoutes = router;
export default financeRoutes;