import express, { Request, Response } from 'express';
import { pool } from './db';
import { format } from 'date-fns';

// Create standalone Express router for routes that need to bypass middleware
const router = express.Router();

/**
 * Calculate next calibration date based on frequency
 */
function calculateNextCalibrationDate(lastCalibrationDate: string, frequency: string): string {
  const lastDate = new Date(lastCalibrationDate);
  const nextDate = new Date(lastDate);
  
  switch (frequency) {
    case '1 Month':
      nextDate.setMonth(lastDate.getMonth() + 1);
      break;
    case '3 Months':
      nextDate.setMonth(lastDate.getMonth() + 3);
      break;
    case '6 Months':
      nextDate.setMonth(lastDate.getMonth() + 6);
      break;
    case '1 Year':
      nextDate.setFullYear(lastDate.getFullYear() + 1);
      break;
    case '2 Years':
      nextDate.setFullYear(lastDate.getFullYear() + 2);
      break;
    case '3 Years':
      nextDate.setFullYear(lastDate.getFullYear() + 3);
      break;
    case '5 Years':
      nextDate.setFullYear(lastDate.getFullYear() + 5);
      break;
    default:
      nextDate.setFullYear(lastDate.getFullYear() + 1);
  }
  
  return format(nextDate, 'yyyy-MM-dd');
}

/**
 * Direct calibration instrument update endpoint that completely bypasses standard middleware
 */
router.put('/direct-update-instrument/:id', async (req: Request, res: Response) => {
  // Force all response headers to ensure JSON
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  console.log('[STANDALONE] Received update request for instrument ID:', req.params.id);
  console.log('[STANDALONE] Request body:', req.body);
  
  try {
    const { id } = req.params;
    
    // Extract fields from request body
    const {
      instrument_name,
      instrument_type,
      manufacturer,
      serial_number,
      location,
      calibration_frequency,
      last_calibration_date,
      calibration_status,
      certificate_number,
      remarks
    } = req.body;
    
    // Calculate next calibration date if last_calibration_date is provided
    let next_calibration_date;
    if (last_calibration_date && calibration_frequency) {
      next_calibration_date = calculateNextCalibrationDate(
        last_calibration_date,
        calibration_frequency
      );
    }
    
    // First check if the instrument exists
    const instrumentCheck = await pool.query(
      'SELECT * FROM calibration_instruments WHERE id = $1',
      [id]
    );
    
    if (instrumentCheck.rows.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(404).json({ 
        success: false, 
        error: 'Calibration instrument not found' 
      });
    }
    
    // Build update query
    const updateFields: Record<string, any> = {};
    if (instrument_name) updateFields.instrument_name = instrument_name;
    if (instrument_type) updateFields.instrument_type = instrument_type;
    if (manufacturer) updateFields.manufacturer = manufacturer;
    if (serial_number) updateFields.serial_number = serial_number;
    if (location) updateFields.location = location;
    if (calibration_frequency) updateFields.calibration_frequency = calibration_frequency;
    if (last_calibration_date) updateFields.last_calibration_date = last_calibration_date;
    if (calibration_status) updateFields.calibration_status = calibration_status;
    if (certificate_number !== undefined) updateFields.certificate_number = certificate_number || null;
    if (remarks !== undefined) updateFields.remarks = remarks || null;
    
    // Add next_calibration_date if it was calculated
    if (next_calibration_date) {
      updateFields.next_calibration_date = next_calibration_date;
    }
    
    // Prepare query parts and values
    const queryParts: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        queryParts.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    // Add the ID as the last parameter
    values.push(id);
    
    // Execute update query
    console.log('[STANDALONE] Update query parts:', queryParts);
    console.log('[STANDALONE] Param values:', values.map(v => typeof v === 'string' ? v.substring(0, 30) : v));
    
    if (queryParts.length === 0) {
      return res.status(400).end(JSON.stringify({ 
        success: false, 
        error: 'No fields to update'
      }));
    }
    
    const result = await pool.query(
      `UPDATE calibration_instruments
       SET ${queryParts.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    console.log('[STANDALONE] Update successful');
    
    // Return the updated instrument with proper headers and JSON formatting
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      success: true,
      message: 'Calibration instrument updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[STANDALONE] Error updating instrument:', error);
    
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      success: false,
      error: 'Failed to update calibration instrument',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;