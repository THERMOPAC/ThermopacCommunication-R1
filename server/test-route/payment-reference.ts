import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import { pool } from '../db';

const router = Router();

/**
 * Generate payment reference number based on date
 * Format: PAY-YYZZ-XXX where:
 * - YY: Last two digits of financial year start
 * - ZZ: Last two digits of financial year end
 * - XXX: Sequential number (001, 002, etc.)
 */
router.get('/generate-reference', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get date parameters from query string
    let year, month, day;
    
    if (req.query.year && req.query.month && req.query.day) {
      // If individual date components are provided, use them
      year = parseInt(req.query.year as string);
      month = parseInt(req.query.month as string);
      day = parseInt(req.query.day as string);
      
      // Month is 0-based in JavaScript Date (0 = January, 11 = December)
      // But incoming month from client will be 1-based, so adjust
      month = month - 1;
    } else {
      // Use current date as fallback
      const today = new Date();
      year = today.getFullYear();
      month = today.getMonth();
      day = today.getDate();
    }
    
    // Create date object
    const date = new Date(year, month, day);
    console.log(`Using payment date for reference: ${date.toDateString()} (y:${year} m:${month} d:${day})`);
    
    // Calculate financial year based on Indian calendar (April to March)
    // If month is January(0), February(1), or March(2), use previous year as start year
    const startYear = month < 3 ? year - 1 : year;
    const endYear = startYear + 1;
    
    // Format as YYZZ (e.g., "2425" for 2024-2025)
    const startYearStr = startYear.toString().slice(-2);
    const endYearStr = endYear.toString().slice(-2);
    const financialYear = `${startYearStr}${endYearStr}`;
    
    console.log(`Calculated financial year ${financialYear} for date ${date.toDateString()}`);
    
    try {
      // Query database for highest existing payment reference number with this prefix
      const query = `
        SELECT reference_number 
        FROM payments 
        WHERE reference_number LIKE $1 
        ORDER BY reference_number DESC
        LIMIT 1
      `;
      
      const searchPattern = `PAY-${financialYear}-%`;
      console.log(`Looking for payment references with pattern: ${searchPattern}`);
      
      const result = await pool.query(query, [searchPattern]);
      
      let nextSequenceNumber = 1; // Start from 1 if no existing payments
      
      if (result.rows.length > 0) {
        const latestRef = result.rows[0].reference_number;
        console.log(`Found latest payment reference: ${latestRef}`);
        
        // Extract sequence number from reference number (PAY-YYZZ-XXX)
        const match = latestRef.match(/PAY-\d{4}-(\d{3})/);
        if (match && match[1]) {
          const currentSequence = parseInt(match[1], 10);
          nextSequenceNumber = currentSequence + 1;
          console.log(`Current sequence: ${currentSequence}, next: ${nextSequenceNumber}`);
        } else {
          console.log(`Could not extract sequence number from ${latestRef}, using default 001`);
        }
      } else {
        console.log(`No existing payments found for financial year ${financialYear}, starting with 001`);
      }
      
      // Format with leading zeros (3 digits)
      const sequenceStr = nextSequenceNumber.toString().padStart(3, '0');
      const referenceNumber = `PAY-${financialYear}-${sequenceStr}`;
      
      console.log(`Generated payment reference number: ${referenceNumber}`);
      return res.json({ 
        success: true,
        referenceNumber,
        financialYear,
        debug: {
          date: date.toISOString(),
          startYear,
          endYear,
          month,
          sequence: nextSequenceNumber
        }
      });
    } catch (dbError) {
      console.error('Database error generating payment reference number:', dbError);
      
      // Return error with details
      return res.status(500).json({
        success: false,
        error: 'Database error while generating reference number',
        message: dbError instanceof Error ? dbError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error generating payment reference number:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate reference number. Please try again or enter manually.'
    });
  }
});

export default router;