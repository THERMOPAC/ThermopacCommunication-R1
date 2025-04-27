import express, { Request, Response } from 'express';
import multer from 'multer';
import { pool } from '../db';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { uploadWpsPqrDocument, getWpsPqrDocumentUrl } from '../utils/wps-pqr-document-upload';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDFs and images
    if (
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/png'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, and PNG files are allowed'));
    }
  },
});

// Middleware to check if user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  console.log('Unauthenticated user tried to access', req.path);
  res.status(401).json({ error: 'Authentication required' });
}

// Helper function to generate WPS ID
async function generateWpsId(): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT "wpsId" FROM wps_documents 
      ORDER BY "wpsId" DESC 
      LIMIT 1
    `);

    let nextNumber = 1;
    if (result.rows.length > 0) {
      const lastId = result.rows[0].wpsId;
      const match = lastId.match(/WPS-(\d+)/);
      if (match && match[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `WPS-${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating WPS ID:', error);
    return `WPS-${Date.now()}`;
  }
}

// Helper function to generate PQR ID matching WPS ID
function generatePqrId(wpsId: string): string {
  const wpsNumberMatch = wpsId.match(/WPS-(\d+)/);
  if (wpsNumberMatch && wpsNumberMatch[1]) {
    return `PQR-${wpsNumberMatch[1]}`;
  }
  return `PQR-${Date.now()}`;
}

// Get all WPS documents
router.get('/wps', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.id,
        w."wpsId",
        w."pqrId",
        w."revisionNo",
        w."welderProcess",
        w."baseMetalGrade",
        w."baseMetalThickness",
        w."fillerMaterial",
        w."jointType",
        w."weldPosition",
        w.status,
        w."createdAt",
        w."updatedAt",
        w."document_file_path",
        u.username AS "createdByUser",
        au.username AS "approvedByUser"
      FROM wps_documents w
      LEFT JOIN users u ON w."createdBy" = u.id
      LEFT JOIN users au ON w."approvedBy" = au.id
      ORDER BY w."wpsId" DESC
    `);

    // Add signed URLs for documents where available
    const wpsWithUrls = await Promise.all(
      result.rows.map(async (row) => {
        if (row.document_file_path) {
          try {
            const docUrl = await getWpsPqrDocumentUrl(row.document_file_path);
            return { ...row, document_url: docUrl };
          } catch (error) {
            console.error(`Error getting document URL for WPS ${row.wpsId}:`, error);
            return { ...row, document_url: null };
          }
        }
        return { ...row, document_url: null };
      })
    );

    res.json(wpsWithUrls);
  } catch (error) {
    console.error('Error fetching WPS documents:', error);
    res.status(500).json({ error: 'Failed to fetch WPS documents' });
  }
});

// Get a specific WPS document
router.get('/wps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        w.*,
        u.username AS "createdByUser",
        au.username AS "approvedByUser"
      FROM wps_documents w
      LEFT JOIN users u ON w."createdBy" = u.id
      LEFT JOIN users au ON w."approvedBy" = au.id
      WHERE w.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    // Add signed URL if document exists
    let wpsData = result.rows[0];
    if (wpsData.document_file_path) {
      try {
        const docUrl = await getWpsPqrDocumentUrl(wpsData.document_file_path);
        wpsData = { ...wpsData, document_url: docUrl };
      } catch (error) {
        console.error(`Error getting document URL for WPS ${wpsData.wpsId}:`, error);
        wpsData = { ...wpsData, document_url: null };
      }
    } else {
      wpsData = { ...wpsData, document_url: null };
    }
    
    res.json(wpsData);
  } catch (error) {
    console.error('Error fetching WPS document:', error);
    res.status(500).json({ error: 'Failed to fetch WPS document' });
  }
});

// Create a new WPS document
router.post('/wps', ensureAuthenticated, upload.single('document'), async (req: Request, res: Response) => {
  try {
    const {
      welderProcess,
      baseMetalGrade,
      baseMetalThickness,
      fillerMaterial,
      jointType,
      weldPosition,
      preheatingTemp,
      postWeldHeatTreatment,
      electricalParameters,
      shieldingGas,
      status,
      remarks
    } = req.body;
    
    // Generate WPS and PQR IDs
    const wpsId = await generateWpsId();
    const pqrId = generatePqrId(wpsId);
    
    console.log(`Creating new WPS with ID: ${wpsId} and PQR ID: ${pqrId}`);
    
    // Handle document file upload to GCS if present
    let document_file_path = null;
    let document_url = null;
    
    if (req.file) {
      try {
        // Upload file to GCS with the WPS ID
        const uploadResult = await uploadWpsPqrDocument(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          wpsId
        );
        
        if (uploadResult.success && uploadResult.filePath) {
          document_file_path = uploadResult.filePath;
          document_url = uploadResult.url;
          console.log(`WPS document uploaded to GCS: ${document_file_path}`);
        } else {
          console.error('Failed to upload WPS document to GCS:', uploadResult.error);
        }
      } catch (uploadError) {
        console.error('Error uploading WPS document:', uploadError);
        // Continue without document if upload fails
      }
    }
    
    // Parse JSON parameters if provided as strings
    const parsedElectricalParams = electricalParameters ? 
      (typeof electricalParameters === 'string' ? 
        JSON.parse(electricalParameters) : electricalParameters) : 
      null;
    
    const result = await pool.query(`
      INSERT INTO wps_documents (
        "wpsId",
        "pqrId",
        "welderProcess",
        "baseMetalGrade",
        "baseMetalThickness",
        "fillerMaterial",
        "jointType",
        "weldPosition",
        "preheatingTemp",
        "postWeldHeatTreatment",
        "electricalParameters",
        "shieldingGas",
        "document_file_path",
        status,
        remarks,
        "createdBy",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
      RETURNING *
    `, [
      wpsId,
      pqrId,
      welderProcess,
      baseMetalGrade,
      baseMetalThickness,
      fillerMaterial,
      jointType,
      weldPosition,
      preheatingTemp || null,
      postWeldHeatTreatment || null,
      parsedElectricalParams,
      shieldingGas || null,
      document_file_path,
      status || 'Draft',
      remarks || null,
      req.user.id
    ]);
    
    // Add the document URL to the response for immediate display
    const response = {
      ...result.rows[0],
      document_url: document_url
    };
    
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating WPS document:', error);
    res.status(500).json({ error: 'Failed to create WPS document' });
  }
});

// Update a WPS document
router.put('/wps/:id', ensureAuthenticated, upload.single('document'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      welderProcess,
      baseMetalGrade,
      baseMetalThickness,
      fillerMaterial,
      jointType,
      weldPosition,
      preheatingTemp,
      postWeldHeatTreatment,
      electricalParameters,
      shieldingGas,
      status,
      remarks
    } = req.body;
    
    // Get current WPS data
    const currentResult = await pool.query(`
      SELECT "wpsId", "document_file_path" FROM wps_documents
      WHERE id = $1
    `, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    const currentWpsId = currentResult.rows[0].wpsId;
    const currentFilePath = currentResult.rows[0].document_file_path;
    
    // Handle document file upload to GCS if present
    let document_file_path = undefined;
    let document_url = null;
    
    if (req.file) {
      try {
        // Upload file to GCS using the WPS ID for consistent naming
        const uploadResult = await uploadWpsPqrDocument(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          currentWpsId
        );
        
        if (uploadResult.success && uploadResult.filePath) {
          document_file_path = uploadResult.filePath;
          document_url = uploadResult.url;
          console.log(`WPS document uploaded to GCS: ${document_file_path}`);
        } else {
          console.error('Failed to upload WPS document to GCS:', uploadResult.error);
        }
      } catch (uploadError) {
        console.error('Error uploading WPS document:', uploadError);
        // Continue without document if upload fails
      }
    }
    
    // Parse JSON parameters if provided as strings
    const parsedElectricalParams = electricalParameters ? 
      (typeof electricalParameters === 'string' ? 
        JSON.parse(electricalParameters) : electricalParameters) : 
      null;
    
    // Build update query dynamically
    let queryParts = [];
    let values = [];
    let paramIndex = 1;
    
    const updateFields: Record<string, any> = {
      "welderProcess": welderProcess,
      "baseMetalGrade": baseMetalGrade,
      "baseMetalThickness": baseMetalThickness,
      "fillerMaterial": fillerMaterial,
      "jointType": jointType,
      "weldPosition": weldPosition,
      "preheatingTemp": preheatingTemp || null,
      "postWeldHeatTreatment": postWeldHeatTreatment || null,
      "electricalParameters": parsedElectricalParams,
      "shieldingGas": shieldingGas || null,
      status: status,
      remarks: remarks || null,
      "updatedAt": new Date()
    };
    
    // Add document_file_path if a new file was uploaded
    if (document_file_path) {
      updateFields['document_file_path'] = document_file_path;
    }
    
    // Add approval fields if status changed to Approved
    if (status === 'Approved') {
      updateFields['approvedBy'] = req.user.id;
      updateFields['approvalDate'] = new Date();
    }
    
    // Build the query parts and values array
    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        queryParts.push(`"${key}" = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    // Add the ID as the last parameter
    values.push(id);
    
    const result = await pool.query(`
      UPDATE wps_documents
      SET ${queryParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    // Add the document URL to the response for immediate display
    const response = {
      ...result.rows[0],
      document_url: document_url
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error updating WPS document:', error);
    res.status(500).json({ error: 'Failed to update WPS document' });
  }
});

// Delete a WPS document
router.delete('/wps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get current WPS data to check if we need to delete a document file
    const currentResult = await pool.query(`
      SELECT "wpsId", "document_file_path" FROM wps_documents
      WHERE id = $1
    `, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    const currentWpsId = currentResult.rows[0].wpsId;
    const currentFilePath = currentResult.rows[0].document_file_path;
    
    const result = await pool.query(`
      DELETE FROM wps_documents
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    // Handle file deletion based on storage location
    if (currentFilePath) {
      if (currentFilePath.startsWith('QMS/')) {
        // It's a GCS file - we don't delete GCS files in this version
        // Just log it for now
        console.log(`GCS WPS document will be retained: ${currentFilePath}`);
      } else if (fs.existsSync(currentFilePath)) {
        // It's a local file
        fs.unlinkSync(currentFilePath);
        console.log(`Deleted local WPS document file: ${currentFilePath}`);
      }
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error deleting WPS document:', error);
    res.status(500).json({ error: 'Failed to delete WPS document' });
  }
});

// Download or redirect to WPS document file
router.get('/wps/:id/document', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT "wpsId", "document_file_path" FROM wps_documents
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    const wpsId = result.rows[0].wpsId;
    const documentFilePath = result.rows[0].document_file_path;
    
    if (!documentFilePath) {
      return res.status(404).json({ error: 'No document file found for this WPS' });
    }
    
    // Check if it's a GCS path
    if (documentFilePath.startsWith('QMS/')) {
      // Get signed URL for GCS file
      const signedUrl = await getWpsPqrDocumentUrl(documentFilePath);
      
      if (!signedUrl) {
        return res.status(404).json({ error: 'Document file not found in cloud storage' });
      }
      
      // Redirect to the signed URL
      return res.redirect(signedUrl);
    } else {
      // Handle legacy local file paths
      if (!fs.existsSync(documentFilePath)) {
        return res.status(404).json({ error: 'Document file not found on server' });
      }
      
      res.download(documentFilePath);
    }
  } catch (error) {
    console.error('Error accessing WPS document file:', error);
    res.status(500).json({ error: 'Failed to access WPS document file' });
  }
});

export default router;