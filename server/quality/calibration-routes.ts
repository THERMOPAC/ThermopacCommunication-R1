import { Request, Response, Router } from 'express';
import { pool } from '../db';
import { format } from 'date-fns';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadCalibrationCertificate, getCertificateUrl } from '../utils/calibration-certificate-upload';

// Create the router
const router = Router();

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.setHeader('Content-Type', 'application/json');
  res.status(401).json({ error: 'Unauthorized' });
}

// Set up multer for memory storage (for GCS upload)
const memoryStorage = multer.memoryStorage();

// Also keep local storage option for fallback
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './uploads/calibration';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({ 
  storage: memoryStorage, // Use memory storage for GCS uploads
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Check MIME type first
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    
    // Also check file extension as a backup validation
    const allowedFileTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedFileTypes.includes(ext)) {
      return cb(null, true);
    }
    
    // If neither check passes, reject the file
    return cb(new Error('Only PDF and image files are allowed'));
  }
});

const router = Router();

// Generate a new instrument ID
async function generateInstrumentId(): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) FROM calibration_instruments
    `);
    
    const count = parseInt(result.rows[0].count);
    const nextNumber = count + 1;
    return `INST-${nextNumber.toString().padStart(5, '0')}`;
  } catch (error) {
    console.error('Error generating instrument ID:', error);
    return `INST-${uuidv4().substring(0, 8).toUpperCase()}`;
  }
}

// Calculate next calibration date based on frequency
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

// Get all calibration instruments with direct JSON response
router.get('/instruments', async (req: Request, res: Response) => {
  // Don't check authentication for debugging purposes temporarily
  
  // Force content type and no-cache headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  try {
    console.log("[DEBUG] Fetching calibration instruments directly");
    const result = await pool.query(`
      SELECT * FROM calibration_instruments
      ORDER BY next_calibration_date ASC
    `);
    
    // Log what we found to help debug
    console.log(`[DEBUG] Found ${result.rows.length} calibration instruments`);
    if (result.rows.length > 0) {
      console.log("[DEBUG] First instrument ID:", result.rows[0].instrument_id);
    }
    
    // Create a simple stringified response
    const jsonData = JSON.stringify(result.rows);
    console.log("[DEBUG] Sending JSON response length:", jsonData.length);
    
    // Send the response without using res.json() to avoid middleware interference
    res.statusCode = 200;
    return res.end(jsonData);
    
  } catch (error) {
    console.error('[DEBUG] Error fetching calibration instruments:', error);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Failed to fetch calibration instruments' }));
  }
});

// Get calibration instrument by ID
router.get('/instruments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calibration instrument not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching calibration instrument:', error);
    res.status(500).json({ error: 'Failed to fetch calibration instrument' });
  }
});

// Custom error handling middleware for multer errors
const handleMulterError = (err: any, req: Request, res: Response, next: Function) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    return res.status(400).json({ 
      error: err.message || 'File upload error',
      code: 'UPLOAD_ERROR'
    });
  } else if (err) {
    // An unknown error occurred
    return res.status(400).json({ 
      error: err.message || 'Unknown file upload error',
      code: 'UNKNOWN_ERROR'
    });
  }
  // No error occurred, continue
  next();
};

// Create a new calibration instrument - simplified error-handling approach
router.post('/instruments', ensureAuthenticated, async (req: Request, res: Response) => {
  // Force Content-Type to JSON to prevent issues with HTML responses
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Use a promise wrapper to handle multer's callback-based API
    const processUpload = () => {
      return new Promise((resolve, reject) => {
        upload.single('certificate')(req, res, (err) => {
          if (err) {
            return reject(err);
          }
          resolve(true);
        });
      });
    };
    
    // Process the upload
    await processUpload();
    
    // Check for required fields after file is processed
    const requiredFields = [
      'instrument_name', 
      'instrument_type', 
      'manufacturer', 
      'serial_number',
      'location',
      'calibration_frequency',
      'last_calibration_date',
      'calibration_status'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_FIELDS'
      });
    }
    
    // Log file info
    console.log('File upload info:', {
      hasFile: !!req.file,
      bodyFields: Object.keys(req.body),
      fileInfo: req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null
    });
    
    // Extract form fields
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
    
    // Generate instrument ID
    const instrument_id = await generateInstrumentId();
    
    // Calculate next calibration date
    const next_calibration_date = calculateNextCalibrationDate(
      last_calibration_date,
      calibration_frequency
    );
    
    console.log(`Creating new instrument with ID: ${instrument_id}`);
    
    // Handle certificate file upload to GCS if present
    let certificate_file_path = null;
    let certificate_url = null;
    
    if (req.file) {
      try {
        // Upload file to GCS with the instrument ID
        const uploadResult = await uploadCalibrationCertificate(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          instrument_id
        );
        
        if (uploadResult.success && uploadResult.filePath) {
          certificate_file_path = uploadResult.filePath;
          certificate_url = uploadResult.url;
          console.log(`Certificate uploaded to GCS: ${certificate_file_path}`);
        } else {
          console.error('Failed to upload certificate to GCS:', uploadResult.error);
        }
      } catch (uploadError) {
        console.error('Error uploading certificate:', uploadError);
        // Continue without certificate if upload fails
      }
    }
    
    // Insert into database
    const result = await pool.query(`
      INSERT INTO calibration_instruments (
        instrument_id,
        instrument_name,
        instrument_type,
        manufacturer,
        serial_number,
        location,
        calibration_frequency,
        last_calibration_date,
        next_calibration_date,
        calibration_status,
        certificate_number,
        certificate_file_path,
        remarks
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      instrument_id,
      instrument_name,
      instrument_type,
      manufacturer,
      serial_number,
      location,
      calibration_frequency,
      last_calibration_date,
      next_calibration_date,
      calibration_status,
      certificate_number || null,
      certificate_file_path,
      remarks || null
    ]);
    
    // Log success of instrument creation
    console.log(`Successfully created calibration instrument with ID: ${instrument_id}`);
    
    // Add the certificate URL to the response for immediate display
    const response = {
      ...result.rows[0],
      certificate_url: certificate_url
    };
    
    // Set content type header explicitly and send success response
    res.setHeader('Content-Type', 'application/json');
    return res.status(201).json(response);
    
  } catch (error) {
    // Log and send error
    console.error('Error creating calibration instrument:', error);
    return res.status(500).json({ 
      error: 'Failed to create calibration instrument', 
      details: error instanceof Error ? error.message : String(error),
      code: 'SERVER_ERROR'
    });
  }
});

// Update a calibration instrument
router.put('/instruments/:id', ensureAuthenticated, (req: Request, res: Response, next: Function) => {
  // Force Content-Type to JSON to prevent issues with HTML responses
  res.setHeader('Content-Type', 'application/json');
  upload.single('certificate')(req, res, function(err) {
    if (err) {
      return res.status(400).json({ 
        error: err.message || 'File upload error', 
        code: 'UPLOAD_ERROR' 
      });
    }
    next();
  });
}, async (req: Request, res: Response) => {
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
    
    // Calculate next calibration date if last_calibration_date is provided
    let next_calibration_date;
    if (last_calibration_date && calibration_frequency) {
      next_calibration_date = calculateNextCalibrationDate(
        last_calibration_date,
        calibration_frequency
      );
    }
    
    // Get current instrument data to check if we need to delete an old certificate file
    const currentResult = await pool.query(`
      SELECT instrument_id, certificate_file_path FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calibration instrument not found' });
    }
    
    const currentFilePath = currentResult.rows[0].certificate_file_path;
    const instrumentId = currentResult.rows[0].instrument_id;
    
    // Handle certificate file upload to GCS if present
    let certificate_file_path = undefined;
    let certificate_url = null;
    
    if (req.file) {
      try {
        // Upload file to GCS using the instrument ID for consistent naming
        const uploadResult = await uploadCalibrationCertificate(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          instrumentId
        );
        
        if (uploadResult.success && uploadResult.filePath) {
          certificate_file_path = uploadResult.filePath;
          certificate_url = uploadResult.url;
          console.log(`Certificate uploaded to GCS: ${certificate_file_path}`);
        } else {
          console.error('Failed to upload certificate to GCS:', uploadResult.error);
        }
      } catch (uploadError) {
        console.error('Error uploading certificate:', uploadError);
        // Continue without certificate if upload fails
      }
    }
    
    // Build update query dynamically
    let queryParts = [];
    let values = [];
    let paramIndex = 1;
    
    const updateFields: Record<string, any> = {
      instrument_name,
      instrument_type,
      manufacturer,
      serial_number,
      location,
      calibration_frequency,
      last_calibration_date,
      calibration_status,
      certificate_number,
      remarks,
      updated_at: new Date()
    };
    
    // Add next_calibration_date if it was calculated
    if (next_calibration_date) {
      updateFields['next_calibration_date'] = next_calibration_date;
    }
    
    // Add certificate_file_path if a new file was uploaded
    if (certificate_file_path) {
      updateFields['certificate_file_path'] = certificate_file_path;
    }
    
    // Build the query parts and values array
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
    
    // We don't need to delete local files for GCS paths
    // But we may need to handle old local file paths during the transition
    if (currentFilePath && !currentFilePath.startsWith('QMS/') && fs.existsSync(currentFilePath)) {
      try {
        fs.unlinkSync(currentFilePath);
        console.log(`Deleted old local certificate file: ${currentFilePath}`);
      } catch (deleteError) {
        console.error(`Error deleting old certificate file: ${deleteError}`);
      }
    }
    
    // Add the certificate URL to the response for immediate display
    const response = {
      ...result.rows[0],
      certificate_url: certificate_url
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error updating calibration instrument:', error);
    res.status(500).json({ error: 'Failed to update calibration instrument' });
  }
});

// Delete a calibration instrument
router.delete('/instruments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get current instrument data to check if we need to delete a certificate file
    const currentResult = await pool.query(`
      SELECT instrument_id, certificate_file_path FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calibration instrument not found' });
    }
    
    const currentFilePath = currentResult.rows[0].certificate_file_path;
    const instrumentId = currentResult.rows[0].instrument_id;
    
    const result = await pool.query(`
      DELETE FROM calibration_instruments
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    // Handle file deletion based on storage location
    if (currentFilePath) {
      if (currentFilePath.startsWith('QMS/')) {
        // It's a GCS file - we don't delete GCS files in this version
        // Just log it for now
        console.log(`GCS certificate file will be retained: ${currentFilePath}`);
      } else if (fs.existsSync(currentFilePath)) {
        // It's a local file
        fs.unlinkSync(currentFilePath);
        console.log(`Deleted local certificate file: ${currentFilePath}`);
      }
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error deleting calibration instrument:', error);
    res.status(500).json({ error: 'Failed to delete calibration instrument' });
  }
});

// Get calibration dashboard statistics
router.get('/instruments/stats/dashboard', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    
    const todayFormatted = format(today, 'yyyy-MM-dd');
    const thirtyDaysLaterFormatted = format(thirtyDaysLater, 'yyyy-MM-dd');
    
    // Get total count
    const totalResult = await pool.query(`
      SELECT COUNT(*) FROM calibration_instruments
    `);
    
    // Get calibrated (valid) count
    const calibratedResult = await pool.query(`
      SELECT COUNT(*) FROM calibration_instruments
      WHERE next_calibration_date > $1
      AND calibration_status = 'Calibrated'
    `, [todayFormatted]);
    
    // Get due soon count (due within 30 days)
    const dueSoonResult = await pool.query(`
      SELECT COUNT(*) FROM calibration_instruments
      WHERE next_calibration_date BETWEEN $1 AND $2
      AND calibration_status = 'Calibrated'
    `, [todayFormatted, thirtyDaysLaterFormatted]);
    
    // Get overdue count
    const overdueResult = await pool.query(`
      SELECT COUNT(*) FROM calibration_instruments
      WHERE next_calibration_date < $1
      OR calibration_status = 'Overdue'
    `, [todayFormatted]);
    
    const stats = {
      total: parseInt(totalResult.rows[0].count),
      calibrated: parseInt(calibratedResult.rows[0].count),
      dueSoon: parseInt(dueSoonResult.rows[0].count),
      overdue: parseInt(overdueResult.rows[0].count)
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching calibration dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch calibration dashboard stats' });
  }
});

// Download or redirect to certificate file
router.get('/instruments/:id/certificate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT instrument_id, certificate_file_path FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calibration instrument not found' });
    }
    
    const certificateFilePath = result.rows[0].certificate_file_path;
    const instrumentId = result.rows[0].instrument_id;
    
    if (!certificateFilePath) {
      return res.status(404).json({ error: 'No certificate file found for this instrument' });
    }
    
    // Check if it's a GCS path
    if (certificateFilePath.startsWith('QMS/')) {
      // Get signed URL for GCS file
      const signedUrl = await getCertificateUrl(certificateFilePath);
      
      if (!signedUrl) {
        return res.status(404).json({ error: 'Certificate file not found in cloud storage' });
      }
      
      // Redirect to the signed URL
      return res.redirect(signedUrl);
    } else {
      // Handle legacy local file paths
      if (!fs.existsSync(certificateFilePath)) {
        return res.status(404).json({ error: 'Certificate file not found on server' });
      }
      
      res.download(certificateFilePath);
    }
  } catch (error) {
    console.error('Error accessing certificate file:', error);
    res.status(500).json({ error: 'Failed to access certificate file' });
  }
});

// Endpoint to fetch calibration instruments data for reporting
router.get('/report', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { instrumentId, instrumentType, status, dueWithin } = req.query;
    
    let queryParams = [];
    let queryConditions = [];
    let paramIndex = 1;
    
    let query = `
      SELECT 
        ci.*,
        u.username as created_by_user
      FROM calibration_instruments ci
      LEFT JOIN users u ON ci.created_by = u.id
      WHERE 1=1
    `;
    
    // Add filters if provided
    if (instrumentId) {
      queryConditions.push(`ci.instrument_id = $${paramIndex}`);
      queryParams.push(instrumentId);
      paramIndex++;
    }
    
    if (instrumentType) {
      queryConditions.push(`ci.instrument_type = $${paramIndex}`);
      queryParams.push(instrumentType);
      paramIndex++;
    }
    
    if (status) {
      queryConditions.push(`ci.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }
    
    // Filter for instruments due within a certain timeframe (in days)
    if (dueWithin) {
      queryConditions.push(`ci.next_calibration_date <= (CURRENT_DATE + INTERVAL '${parseInt(dueWithin as string)} days')`);
    }
    
    // Add conditions to query
    if (queryConditions.length > 0) {
      query += ` AND ${queryConditions.join(' AND ')}`;
    }
    
    // Order by calibration due date
    query += ' ORDER BY ci.next_calibration_date';
    
    const result = await pool.query(query, queryParams);
    
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching report data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch report data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;