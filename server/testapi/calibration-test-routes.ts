import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { calculateNextCalibrationDate } from '../utils/date-utils';
import { testGCSConnection, listFiles } from '../utils/list-gcs-files';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { gcsCredentials, gcsBucketName } from '../utils/gcs-config';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB file size limit
  },
});

// Initialize GCS client for tests
const storage = new Storage({
  credentials: gcsCredentials as any,
});
const bucket = storage.bucket(gcsBucketName);

// Create the router
const router = Router();

// Test uploading a calibration certificate to GCS
router.post('/test-upload-certificate', upload.single('certificate'), async (req: Request, res: Response) => {
  // Set headers explicitly
  res.setHeader('Content-Type', 'application/json');
  
  try {
    console.log('[TEST API] Certificate upload test requested');
    
    // Check if file was provided
    if (!req.file) {
      console.log('[TEST API] No file uploaded');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    // Log file info
    console.log('[TEST API] File info:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    
    // Generate a test instrument ID for the upload
    const testInstrumentId = `TEST-INST-${Date.now()}`;
    
    // Define the file path in GCS - only use singular path now
    const filePath = `QMS/Instrument/${testInstrumentId}.pdf`;
    
    // Only upload to the standard path now
    const uploadResults = {
      upload: null,
      listing: null
    };
    
    // Upload to the standard path
    try {
      console.log(`[TEST API] Uploading to path: ${filePath}`);
      const file = bucket.file(filePath);
      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        metadata: {
          contentType: req.file.mimetype,
        },
      });
      
      // Generate a signed URL
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });
      
      uploadResults.upload = {
        success: true,
        path: filePath,
        url: url
      };
      console.log(`[TEST API] Successfully uploaded to path: ${filePath}`);
    } catch (error) {
      console.error(`[TEST API] Error uploading to path: ${error}`);
      uploadResults.upload = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    
    // Now try to list files to see if our upload appears
    try {
      console.log('[TEST API] Listing files in QMS/Instrument');
      const files = await listFiles('QMS/Instrument');
      console.log(`[TEST API] Found ${files.length} files in QMS/Instrument`);
      
      uploadResults.listing = {
        success: true,
        fileCount: files.length,
        files
      };
    } catch (listError) {
      console.error(`[TEST API] Error listing files: ${listError}`);
      uploadResults.listing = {
        success: false,
        error: listError instanceof Error ? listError.message : String(listError)
      };
    }
    
    // Return the detailed results
    return res.status(200).json({
      success: true,
      message: 'Upload test completed',
      testInstrumentId,
      results: uploadResults
    });
  } catch (error) {
    console.error('[TEST API] Unexpected error during certificate upload test:', error);
    return res.status(500).json({
      success: false,
      message: 'Upload test failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// List all files in a GCS directory
router.get('/list-gcs-files', async (req: Request, res: Response) => {
  // Set headers explicitly
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { path = 'QMS/Instrument' } = req.query;
    const directoryPath = String(path);
    
    console.log(`[TEST API] Listing files in GCS directory: ${directoryPath}`);
    
    // Get files from the specified directory
    const files = await listFiles(directoryPath);
    
    return res.status(200).json({
      success: true,
      path: directoryPath,
      fileCount: files.length,
      files
    });
  } catch (error) {
    console.error('[TEST API] Error listing GCS files:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list GCS files',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Test Google Cloud Storage connection and permissions
router.get('/test-gcs-connection', async (req: Request, res: Response) => {
  // Set headers explicitly
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  try {
    console.log('[TEST API] Starting GCS connection test');
    
    // Run the GCS connection test
    const testResult = await testGCSConnection();
    
    console.log('[TEST API] GCS connection test results:', testResult);
    
    // Send test results to client
    return res.status(200).json({
      success: true,
      message: 'GCS connection test completed',
      data: testResult
    });
  } catch (error) {
    console.error('[TEST API] Error during GCS connection test:', error);
    
    return res.status(500).json({
      success: false,
      message: 'GCS connection test failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

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