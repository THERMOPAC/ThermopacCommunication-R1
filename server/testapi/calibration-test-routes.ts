import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { calculateNextCalibrationDate } from '../utils/date-utils';
import { testGCSConnection } from '../utils/list-gcs-files';

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

// Completely bypass middleware version for testing
router.put('/direct-instrument-update/:id', async (req: Request, res: Response) => {
  // Set headers explicitly at the beginning
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  try {
    const { id } = req.params;
    console.log('[TEST API DIRECT] Update request received for instrument ID:', id);
    console.log('[TEST API DIRECT] Request body:', req.body);
    
    // Update without file handling
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
    
    const queryParts: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
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
    
    // Build the SQL query parts
    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        queryParts.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    // Add the ID as the last parameter
    values.push(id);
    
    const result = await pool.query(`
      UPDATE calibration_instruments
      SET ${queryParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    console.log('[TEST API DIRECT] Update successful, returning JSON response');
    
    // Instead of using res.json, manually stringify and send
    return res.status(200).end(JSON.stringify({
      success: true,
      message: 'Instrument updated successfully',
      data: result.rows[0]
    }));
  } catch (error) {
    console.error('[TEST API DIRECT] Error updating calibration instrument:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    return res.status(500).end(JSON.stringify({ 
      error: 'Failed to update calibration instrument',
      details: errorMsg
    }));
  }
});

// Add a test update route
router.post('/update-instrument/:id', async (req: Request, res: Response) => {
  // Set headers explicitly at the beginning
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  try {
    const { id } = req.params;
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
    
    console.log('[TEST API] Update request received for instrument ID:', id);
    console.log('[TEST API] Request body:', req.body);
    
    // Calculate next calibration date if last_calibration_date is provided
    let next_calibration_date;
    if (last_calibration_date && calibration_frequency) {
      next_calibration_date = calculateNextCalibrationDate(
        last_calibration_date,
        calibration_frequency
      );
    }
    
    // Get current instrument data
    const currentResult = await pool.query(`
      SELECT * FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).end(JSON.stringify({ error: 'Calibration instrument not found' }));
    }
    
    // Prepare update fields
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
    
    // Build the SQL query
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
    
    const result = await pool.query(`
      UPDATE calibration_instruments
      SET ${queryParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    console.log('[TEST API] Instrument updated, sending JSON response');
    
    // Instead of using res.json, manually stringify and send
    const jsonResponse = JSON.stringify({
      success: true,
      message: 'Instrument updated successfully',
      data: result.rows[0]
    });
    
    return res.status(200).end(jsonResponse);
  } catch (error) {
    console.error('[TEST API] Error updating calibration instrument:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log('[TEST API] Error details:', errorMsg);
    
    return res.status(500).end(JSON.stringify({ 
      error: 'Failed to update calibration instrument',
      details: errorMsg
    }));
  }
});

export default router;