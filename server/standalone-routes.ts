import express, { Request, Response } from 'express';
import { pool } from './db';
import { format } from 'date-fns';
import multer from 'multer';
import { uploadCalibrationCertificate } from './utils/calibration-certificate-upload';

// Configure multer for memory storage (does not write to disk)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

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

/**
 * POST endpoint that handles file uploads with a new approach
 * This route accepts a POST request with FormData containing instrumentId and certificate
 */
router.post('/direct-update-instrument', async (req: Request, res: Response) => {
  // Force all response headers to ensure JSON
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  console.log('[STANDALONE] Received direct update request');
  console.log('[STANDALONE] Request body:', req.body);
  
  try {
    const { instrumentId, ...updateData } = req.body;
    
    if (!instrumentId) {
      return res.status(400).json({
        success: false,
        error: 'instrumentId is required'
      });
    }
    
    // First check if the instrument exists
    const instrumentCheck = await pool.query(
      'SELECT * FROM calibration_instruments WHERE id = $1',
      [instrumentId]
    );
    
    if (instrumentCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Calibration instrument not found' 
      });
    }
    
    // Calculate next calibration date if last_calibration_date is provided
    let next_calibration_date;
    if (updateData.last_calibration_date && updateData.calibration_frequency) {
      next_calibration_date = calculateNextCalibrationDate(
        updateData.last_calibration_date,
        updateData.calibration_frequency
      );
      updateData.next_calibration_date = next_calibration_date;
    }
    
    // Build update query
    const updateFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        updateFields[key] = value;
      }
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
    values.push(instrumentId);
    
    if (queryParts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No fields to update'
      });
    }
    
    // Execute update query
    console.log('[STANDALONE] Update query parts:', queryParts);
    console.log('[STANDALONE] Param values:', values.map(v => typeof v === 'string' ? v.substring(0, 30) : v));
    
    const result = await pool.query(
      `UPDATE calibration_instruments
       SET ${queryParts.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    console.log('[STANDALONE] Update successful');
    
    // Return the updated instrument
    return res.status(200).json({
      success: true,
      message: 'Calibration instrument updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[STANDALONE] Error updating instrument:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to update calibration instrument',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST endpoint that handles file uploads for calibration instruments
 * This route accepts a multipart/form-data containing instrumentId and certificate file
 */
router.post('/calibration-instrument-file-upload', upload.single('certificate'), async (req: Request, res: Response) => {
  // Force all response headers to ensure JSON
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  console.log('[STANDALONE] Received file upload request');
  console.log('[STANDALONE] Request body:', req.body);
  
  try {
    const { instrumentId } = req.body;
    
    if (!instrumentId) {
      return res.status(400).json({
        success: false,
        error: 'instrumentId is required'
      });
    }
    
    // Check if file exists in the request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No certificate file uploaded'
      });
    }
    
    // First check if the instrument exists
    const instrumentCheck = await pool.query(
      'SELECT * FROM calibration_instruments WHERE id = $1',
      [instrumentId]
    );
    
    if (instrumentCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Calibration instrument not found' 
      });
    }
    
    const instrument = instrumentCheck.rows[0];
    
    // Upload the file to Google Cloud Storage
    console.log('[STANDALONE] Uploading certificate file to GCS');
    // Pass the instrument_id as both the originalFilename and the instrumentId
    // This ensures the file is named properly: {instrument_id}.pdf
    const uploadResult = await uploadCalibrationCertificate(
      req.file.buffer,
      instrument.instrument_id, // Pass instrument_id as originalFilename parameter
      req.file.mimetype || 'application/pdf',
      instrument.instrument_id  // Pass instrument_id again as instrumentId parameter
    );
    
    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to upload certificate file',
        details: uploadResult.error
      });
    }
    
    // Update the instrument record with the file path
    const updateResult = await pool.query(
      `UPDATE calibration_instruments
       SET certificate_file_path = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [uploadResult.filePath, instrumentId]
    );
    
    console.log('[STANDALONE] File upload and update successful');
    
    // Return the updated instrument
    return res.status(200).json({
      success: true,
      message: 'Calibration certificate uploaded successfully',
      data: updateResult.rows[0],
      file: {
        path: uploadResult.filePath,
        url: uploadResult.url
      }
    });
  } catch (error) {
    console.error('[STANDALONE] Error handling file upload:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to process certificate upload',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;