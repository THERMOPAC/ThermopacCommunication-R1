import express from 'express';
import type { Request, Response } from 'express';

const router = express.Router();

/**
 * Simple allocation endpoint for the Basic Payment Allocation page
 */
router.post('/basic-allocate', async (req: Request, res: Response) => {
  try {
    // Set JSON response headers explicitly
    res.setHeader('Content-Type', 'application/json');
    
    const { paymentId, invoiceId, amount } = req.body;
    
    // Log the allocation attempt
    console.log('Basic allocation attempt:', { paymentId, invoiceId, amount });
    
    // Validate input
    if (!paymentId || !invoiceId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input data'
      });
    }
    
    // For now, return success to test the JSON response
    // This will be connected to database once JSON parsing is working
    const result = {
      success: true,
      message: 'Payment allocation processed successfully',
      allocationId: Math.floor(Math.random() * 1000), // Temporary ID
      data: {
        paymentId,
        invoiceId,
        amount,
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('Allocation result:', result);
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Error in basic allocation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to allocate payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;