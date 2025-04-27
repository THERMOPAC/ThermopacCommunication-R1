import { Request, Response, Router } from 'express';
import { pool } from '../db';
import { ensureAuthenticated } from '../auth-middleware';
import { format } from 'date-fns';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Set up multer for file uploads
const storage = multer.diskStorage({
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
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedFileTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedFileTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
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

// Get all calibration instruments
router.get('/instruments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT * FROM calibration_instruments
      ORDER BY next_calibration_date ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching calibration instruments:', error);
    res.status(500).json({ error: 'Failed to fetch calibration instruments' });
  }
});

// Get calibration instrument by ID
router.get('/instruments/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
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

// Create a new calibration instrument
router.post('/instruments', ensureAuthenticated, upload.single('certificate'), async (req: Request, res: Response) => {
  try {
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
    
    // Get certificate file path if uploaded
    const certificate_file_path = req.file ? req.file.path : null;
    
    const result = await db.query(`
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
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating calibration instrument:', error);
    res.status(500).json({ error: 'Failed to create calibration instrument' });
  }
});

// Update a calibration instrument
router.put('/instruments/:id', ensureAuthenticated, upload.single('certificate'), async (req: Request, res: Response) => {
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
    
    // Get certificate file path if uploaded
    const certificate_file_path = req.file ? req.file.path : undefined;
    
    // Get current instrument data to check if we need to delete an old certificate file
    const currentResult = await db.query(`
      SELECT certificate_file_path FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calibration instrument not found' });
    }
    
    const currentFilePath = currentResult.rows[0].certificate_file_path;
    
    // Build update query dynamically
    let queryParts = [];
    let values = [];
    let paramIndex = 1;
    
    const updateFields = {
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
      updateFields.next_calibration_date = next_calibration_date;
    }
    
    // Add certificate_file_path if a new file was uploaded
    if (certificate_file_path) {
      updateFields.certificate_file_path = certificate_file_path;
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
    
    const result = await db.query(`
      UPDATE calibration_instruments
      SET ${queryParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    // Delete old certificate file if a new one was uploaded
    if (certificate_file_path && currentFilePath && fs.existsSync(currentFilePath)) {
      fs.unlinkSync(currentFilePath);
    }
    
    res.json(result.rows[0]);
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
    const currentResult = await db.query(`
      SELECT certificate_file_path FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calibration instrument not found' });
    }
    
    const currentFilePath = currentResult.rows[0].certificate_file_path;
    
    const result = await db.query(`
      DELETE FROM calibration_instruments
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    // Delete certificate file if it exists
    if (currentFilePath && fs.existsSync(currentFilePath)) {
      fs.unlinkSync(currentFilePath);
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
    const totalResult = await db.query(`
      SELECT COUNT(*) FROM calibration_instruments
    `);
    
    // Get calibrated (valid) count
    const calibratedResult = await db.query(`
      SELECT COUNT(*) FROM calibration_instruments
      WHERE next_calibration_date > $1
      AND calibration_status = 'Calibrated'
    `, [todayFormatted]);
    
    // Get due soon count (due within 30 days)
    const dueSoonResult = await db.query(`
      SELECT COUNT(*) FROM calibration_instruments
      WHERE next_calibration_date BETWEEN $1 AND $2
      AND calibration_status = 'Calibrated'
    `, [todayFormatted, thirtyDaysLaterFormatted]);
    
    // Get overdue count
    const overdueResult = await db.query(`
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

// Download certificate file
router.get('/instruments/:id/certificate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT certificate_file_path FROM calibration_instruments
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calibration instrument not found' });
    }
    
    const certificateFilePath = result.rows[0].certificate_file_path;
    
    if (!certificateFilePath) {
      return res.status(404).json({ error: 'No certificate file found for this instrument' });
    }
    
    if (!fs.existsSync(certificateFilePath)) {
      return res.status(404).json({ error: 'Certificate file not found on server' });
    }
    
    res.download(certificateFilePath);
  } catch (error) {
    console.error('Error downloading certificate file:', error);
    res.status(500).json({ error: 'Failed to download certificate file' });
  }
});

export default router;