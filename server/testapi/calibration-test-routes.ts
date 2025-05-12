import { Router, Request, Response } from 'express';
import { pool } from '../db';

// Create the router
const router = Router();

// Get calibration instruments directly with JSON response
router.get('/direct-instruments', async (req: Request, res: Response) => {
  // Set headers explicitly
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  try {
    console.log("[TEST API] Fetching calibration instruments directly");
    
    const result = await pool.query(`
      SELECT * FROM calibration_instruments
      ORDER BY next_calibration_date ASC
    `);
    
    console.log(`[TEST API] Found ${result.rows.length} calibration instruments`);
    
    // Send response directly to avoid any middleware issues
    const jsonData = JSON.stringify(result.rows);
    console.log("[TEST API] Sending JSON data length:", jsonData.length);
    
    return res.end(jsonData);
  } catch (error) {
    console.error('[TEST API] Error fetching calibration instruments:', error);
    return res.status(500).end(JSON.stringify({ error: 'Failed to fetch calibration instruments' }));
  }
});

export default router;