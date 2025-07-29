import { Router, Request, Response } from 'express';
import { pool } from './db';

const router = Router();

// Test endpoint to verify CASPIAN LUBRICANTS payment filtering
router.get('/test/caspian-payments', async (req: Request, res: Response) => {
  try {
    console.log('=== TESTING CASPIAN LUBRICANTS PAYMENT FILTERING ===');
    
    // Query to check unallocated advance payments for CASPIAN LUBRICANTS
    const query = `
      SELECT 
        p.id, 
        p.customer_id, 
        p.amount, 
        p.is_advance_payment,
        c.bp_name as customer_name,
        COALESCE(SUM(pa.amount_applied), 0) as total_allocated,
        p.amount - COALESCE(SUM(pa.amount_applied), 0) as unallocated_amount,
        CASE 
          WHEN p.amount - COALESCE(SUM(pa.amount_applied), 0) > 0.01 THEN 'SHOULD APPEAR IN DROPDOWN'
          ELSE 'SHOULD NOT APPEAR (FULLY ALLOCATED)'
        END as filtering_status
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN payment_allocations pa ON p.id = pa.payment_id
      WHERE p.is_advance_payment = true 
        AND p.customer_id = 10  -- CASPIAN LUBRICANTS
      GROUP BY p.id, p.customer_id, p.amount, p.is_advance_payment, c.bp_name
      ORDER BY p.id
    `;
    
    const result = await pool.query(query);
    
    console.log('CASPIAN LUBRICANTS Payment Analysis:', result.rows);
    
    // Specific test for Payment ID 63
    const payment63 = result.rows.find(row => row.id === 63);
    
    const testResults = {
      customer: 'CASPIAN LUBRICANTS RECYCLING LIMITED LIABILITY COMPANY',
      customerId: 10,
      allPayments: result.rows,
      payment63Test: {
        exists: !!payment63,
        shouldAppear: payment63 ? payment63.filtering_status.includes('SHOULD APPEAR') : false,
        details: payment63 || 'Payment 63 not found',
        testPassed: payment63 ? payment63.filtering_status.includes('SHOULD NOT APPEAR') : false
      },
      summary: {
        totalAdvancePayments: result.rows.length,
        fullyAllocatedPayments: result.rows.filter(r => r.filtering_status.includes('SHOULD NOT APPEAR')).length,
        unallocatedPayments: result.rows.filter(r => r.filtering_status.includes('SHOULD APPEAR')).length
      }
    };
    
    console.log('Test Results:', testResults);
    
    res.json({
      success: true,
      testResults,
      conclusion: payment63 && payment63.filtering_status.includes('SHOULD NOT APPEAR') 
        ? '✅ PASSED: Payment 63 correctly filtered out (fully allocated)'
        : '❌ FAILED: Payment 63 filtering issue detected'
    });
    
  } catch (error) {
    console.error('Error in CASPIAN payment test:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test CASPIAN payments',
      details: error.message 
    });
  }
});

export default router;