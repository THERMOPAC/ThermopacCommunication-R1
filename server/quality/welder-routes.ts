import express, { Request, Response, Router } from 'express';
import { pool } from '../db';
import multer from 'multer';
import { format } from 'date-fns';
import { generateWelderID, generateCertificateNumber } from '../utils/id-generators';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to ensure authenticated users
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  console.log('Unauthenticated user tried to access', req.path);
  res.status(401).json({ error: 'Authentication required' });
}

// GET all welders
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM welders 
      ORDER BY "updatedAt" DESC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching welders:', error);
    res.status(500).json({ error: 'Failed to fetch welders' });
  }
});

// GET a specific welder by ID
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM welders 
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Welder not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching welder:', error);
    res.status(500).json({ error: 'Failed to fetch welder' });
  }
});

// POST - Create a new welder
router.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      welderName,
      trade,
      processQualified,
      materialGroupQualified,
      thicknessRange,
      positionQualified,
      wpsId,
      testDate,
      testResults,
      certificateExpiryDate,
      status,
      remarks
    } = req.body;

    // Validate required fields
    if (!welderName || !trade || !processQualified || !materialGroupQualified || 
        !thicknessRange || !positionQualified || !wpsId || !testDate || 
        !testResults || !certificateExpiryDate || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate unique IDs
    const welderId = await generateWelderID();
    const certificateNo = await generateCertificateNumber();
    
    // Get current user ID for created_by
    const userId = req.user?.id;
    
    // Format dates to ISO strings
    const formattedTestDate = new Date(testDate).toISOString();
    const formattedExpiryDate = new Date(certificateExpiryDate).toISOString();
    
    // Insert the welder record
    const result = await pool.query(`
      INSERT INTO welders (
        "welderId", "welderName", trade, "processQualified", "materialGroupQualified",
        "thicknessRange", "positionQualified", "wpsId", "testDate", 
        "testResults", "certificateNo", "certificateExpiryDate", status, 
        remarks, "createdBy", "createdAt", "updatedAt"
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING *
    `, [
      welderId, welderName, trade, processQualified, materialGroupQualified,
      thicknessRange, positionQualified, wpsId, formattedTestDate, 
      testResults, certificateNo, formattedExpiryDate, status, 
      remarks || null, userId
    ]);

    // Create a qualification record in the welder_wps_qualifications table
    const welderRecord = result.rows[0];
    
    // Try to get the WPS document ID from wps_documents
    const wpsResult = await pool.query(`
      SELECT id FROM wps_documents WHERE "wpsId" = $1
    `, [wpsId]);
    
    if (wpsResult.rows.length > 0) {
      const wpsDocumentId = wpsResult.rows[0].id;
      
      // Create the qualification record
      await pool.query(`
        INSERT INTO welder_wps_qualifications (
          "welderId", "wpsId", "qualificationDate", "expiryDate", 
          "qualificationStatus", "certificationNumber", "remarks", 
          "createdBy", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      `, [
        welderRecord.id, wpsDocumentId, formattedTestDate, formattedExpiryDate,
        status, certificateNo, remarks || null, userId
      ]);
    }

    res.status(201).json(welderRecord);
  } catch (error) {
    console.error('Error creating welder:', error);
    res.status(500).json({ error: 'Failed to create welder' });
  }
});

// PUT - Update a welder
router.put('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      welderName,
      trade,
      processQualified,
      materialGroupQualified,
      thicknessRange,
      positionQualified,
      wpsId,
      testDate,
      testResults,
      certificateExpiryDate,
      status,
      remarks
    } = req.body;

    // Validate required fields
    if (!welderName || !trade || !processQualified || !materialGroupQualified || 
        !thicknessRange || !positionQualified || !wpsId || !testDate || 
        !testResults || !certificateExpiryDate || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Format dates to ISO strings
    const formattedTestDate = new Date(testDate).toISOString();
    const formattedExpiryDate = new Date(certificateExpiryDate).toISOString();
    
    // Check if welder exists
    const checkResult = await pool.query(`
      SELECT * FROM welders WHERE id = $1
    `, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Welder not found' });
    }
    
    // Update the welder record
    const result = await pool.query(`
      UPDATE welders SET
        "welderName" = $1,
        trade = $2,
        "processQualified" = $3,
        "materialGroupQualified" = $4,
        "thicknessRange" = $5,
        "positionQualified" = $6,
        "wpsId" = $7,
        "testDate" = $8,
        "testResults" = $9,
        "certificateExpiryDate" = $10,
        status = $11,
        remarks = $12,
        "updatedAt" = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      welderName, trade, processQualified, materialGroupQualified,
      thicknessRange, positionQualified, wpsId, formattedTestDate, 
      testResults, formattedExpiryDate, status, 
      remarks || null, id
    ]);

    // Update qualification record in welder_wps_qualifications if WPS ID changed
    const previousWpsId = checkResult.rows[0].wpsId;
    if (wpsId !== previousWpsId) {
      // Try to get the new WPS document ID
      const wpsResult = await pool.query(`
        SELECT id FROM wps_documents WHERE "wpsId" = $1
      `, [wpsId]);
      
      if (wpsResult.rows.length > 0) {
        const wpsDocumentId = wpsResult.rows[0].id;
        
        // Check if a qualification record already exists
        const qualificationResult = await pool.query(`
          SELECT * FROM welder_wps_qualifications 
          WHERE "welderId" = $1
        `, [id]);
        
        if (qualificationResult.rows.length > 0) {
          // Update existing qualification
          await pool.query(`
            UPDATE welder_wps_qualifications SET
              "wpsId" = $1,
              "qualificationDate" = $2,
              "expiryDate" = $3,
              "qualificationStatus" = $4,
              "remarks" = $5,
              "updatedAt" = NOW()
            WHERE "welderId" = $6
          `, [
            wpsDocumentId, formattedTestDate, formattedExpiryDate,
            status, remarks || null, id
          ]);
        } else {
          // Create new qualification record
          await pool.query(`
            INSERT INTO welder_wps_qualifications (
              "welderId", "wpsId", "qualificationDate", "expiryDate", 
              "qualificationStatus", "certificationNumber", "remarks", 
              "createdBy", "createdAt", "updatedAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          `, [
            id, wpsDocumentId, formattedTestDate, formattedExpiryDate,
            status, checkResult.rows[0].certificateNo, remarks || null, req.user?.id
          ]);
        }
      }
    } else {
      // Just update the existing qualification record dates and status
      await pool.query(`
        UPDATE welder_wps_qualifications SET
          "qualificationDate" = $1,
          "expiryDate" = $2,
          "qualificationStatus" = $3,
          "remarks" = $4,
          "updatedAt" = NOW()
        WHERE "welderId" = $5
      `, [
        formattedTestDate, formattedExpiryDate,
        status, remarks || null, id
      ]);
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating welder:', error);
    res.status(500).json({ error: 'Failed to update welder' });
  }
});

// DELETE - Delete a welder
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if welder exists
    const checkResult = await pool.query(`
      SELECT * FROM welders WHERE id = $1
    `, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Welder not found' });
    }
    
    // Delete any qualification records first (due to foreign key constraint)
    await pool.query(`
      DELETE FROM welder_wps_qualifications
      WHERE "welderId" = $1
    `, [id]);
    
    // Delete the welder
    await pool.query(`
      DELETE FROM welders WHERE id = $1
    `, [id]);

    res.status(200).json({ message: 'Welder deleted successfully' });
  } catch (error) {
    console.error('Error deleting welder:', error);
    res.status(500).json({ error: 'Failed to delete welder' });
  }
});

// GET - Get all welders qualified for a specific WPS ID
router.get('/wps/:wpsId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { wpsId } = req.params;
    
    // Query welders by WPS ID
    const result = await pool.query(`
      SELECT w.* FROM welders w
      INNER JOIN welder_wps_qualifications q ON w.id = q."welderId"
      INNER JOIN wps_documents d ON q."wpsId" = d.id
      WHERE d."wpsId" = $1
      ORDER BY w."updatedAt" DESC
    `, [wpsId]);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching welders by WPS ID:', error);
    res.status(500).json({ error: 'Failed to fetch welders' });
  }
});

// GET - Get expiring welder certifications
router.get('/expiring/:days', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.params.days) || 30;
    
    // Get welders with certificates expiring in the specified number of days
    const result = await pool.query(`
      SELECT * FROM welders
      WHERE 
        status = 'Active'
        AND "certificateExpiryDate" BETWEEN NOW() AND (NOW() + INTERVAL '${days} days')
      ORDER BY "certificateExpiryDate" ASC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching expiring welders:', error);
    res.status(500).json({ error: 'Failed to fetch expiring welders' });
  }
});

export default router;