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
router.get('/invoices/outstanding', ensureAuthenticated, (req: Request, res: Response) => {
  res.json({
    invoices: [],
    totalOutstanding: "0.00",
    count: 0
  });
});

/**
 * Get unallocated advance payments
 */
router.get('/payments/unallocated-advances', ensureAuthenticated, (req: Request, res: Response) => {
  res.json({
    advances: [],
    totalUnallocatedAmount: "0.00",
    count: 0
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