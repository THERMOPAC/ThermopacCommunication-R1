import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { welderCertificates, welders, users } from '@shared/schema';
import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Create Google Cloud Storage client
let gcsClient: Storage;

try {
  // Check if we're running in production (with service account credentials)
  if (process.env.NODE_ENV === 'production') {
    console.log('Environment: production - Creating GCS client with default credentials');
    gcsClient = new Storage();
  } else {
    // For development, use explicit credentials from environment variable
    console.log('Environment: development - Creating GCS client with explicit credentials');
    
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
      throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable is not set');
    }
    
    const credentialsString = process.env.GOOGLE_CLOUD_CREDENTIALS;
    console.log(`Credentials string length: ${credentialsString.length}`);
    console.log(`First 20 chars: ${credentialsString.substring(0, 20)}...`);
    
    console.log('Attempting to parse Google Cloud credentials...');
    const credentials = JSON.parse(credentialsString);
    
    // Validate credentials have required fields
    const validation = {
      hasType: !!credentials.type,
      hasProjectId: !!credentials.project_id,
      hasClientEmail: !!credentials.client_email,
      hasPrivateKey: !!credentials.private_key
    };
    
    console.log('✅ Successfully parsed credentials JSON');
    console.log(`Credential validation: ${JSON.stringify(validation)}`);
    
    // Create GCS client with explicit credentials
    gcsClient = new Storage({
      projectId: credentials.project_id,
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key
      }
    });
    
    console.log(`Using explicit GCS credentials with project: ${credentials.project_id}`);
    console.log(`Service account: ${credentials.client_email}`);
  }
  
  console.log("GCS client created successfully for Welder Certificate routes");
} catch (error) {
  console.error('Failed to create GCS client:', error);
}

// Define bucket name
const bucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
console.log(`Using GCS bucket name: ${bucketName} (from env: ${process.env.GCS_BUCKET_NAME})`);

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Helper to generate a unique certificate number
async function generateCertificateNumber() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("certificate_no" FROM 5) AS INTEGER)) as max_id
    FROM welder_certificates
  `);
  
  const maxIdStr = result.rows[0]?.max_id as string | undefined;
  const maxId = maxIdStr ? parseInt(maxIdStr) : 0;
  const nextId = maxId + 1;
  return `CERT-${nextId.toString().padStart(3, '0')}`;
}

// Get all certificates across all welders
router.get('/all', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get all certificates with welder and creator info
    const certificates = await db.execute(sql`
      SELECT 
        wc.*,
        u.username as "createdByUsername"
      FROM welder_certificates wc
      LEFT JOIN users u ON wc.created_by = u.id
      ORDER BY wc.created_at DESC
    `);
    
    res.json(certificates.rows);
  } catch (error) {
    console.error('Error fetching all welder certificates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch all certificates',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all certificates for a welder
router.get('/welder/:welderId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { welderId } = req.params;
    
    // Validate input
    if (!welderId || isNaN(parseInt(welderId))) {
      return res.status(400).json({ error: 'Invalid welder ID' });
    }
    
    const welderIdInt = parseInt(welderId);
    
    // Check if welder exists
    const welderResult = await db.execute(sql`
      SELECT "welderId" FROM welders WHERE id = ${welderIdInt}
    `);
    
    if (welderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Welder not found' });
    }
    
    // Get all certificates for this welder
    const certificates = await db.execute(sql`
      SELECT 
        wc.*,
        u.username as "createdByUsername"
      FROM welder_certificates wc
      LEFT JOIN users u ON wc.created_by = u.id
      WHERE wc.welder_id = ${welderIdInt}
      ORDER BY wc.created_at DESC
    `);
    
    res.json(certificates.rows);
  } catch (error) {
    console.error('Error fetching welder certificates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch welder certificates',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload a new certificate for a welder
router.post('/:welderId', ensureAuthenticated, upload.single('certificate'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { welderId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Validate the welder ID
    if (!welderId || isNaN(parseInt(welderId))) {
      return res.status(400).json({ error: 'Invalid welder ID' });
    }
    
    const welderIdInt = parseInt(welderId);
    
    // Check if welder exists and get the welder ID string
    const welderResult = await db.execute(sql`
      SELECT "welderId" FROM welders WHERE id = ${welderIdInt}
    `);
    
    if (welderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Welder not found' });
    }
    
    const welderIdString = welderResult.rows[0].welderId;
    
    // Validate request body
    const { certificateType, description = '', issueDate, expiryDate, status = 'Active' } = req.body;
    
    // Basic validation
    if (!certificateType || !issueDate || !expiryDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No certificate file uploaded' });
    }
    
    // Generate a unique certificate number
    const certificateNo = await generateCertificateNumber();
    
    // Count existing certificates for this welder to determine file number in sequence
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM welder_certificates WHERE welder_id = ${welderIdInt}
    `);
    
    const existingCertCount = parseInt(countResult.rows[0].count) + 1;
    
    // Upload the file to Google Cloud Storage
    const filePath = `/QMS/WELDERS/${welderIdString}_${existingCertCount}.pdf`;
    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    
    // Upload file to GCS
    const bucket = gcsClient.bucket(bucketName);
    const file = bucket.file(filePath.slice(1)); // Remove leading slash
    
    await file.save(fileBuffer, {
      metadata: {
        contentType: fileType
      }
    });
    
    // Generate a public URL
    const fileUrl = `https://storage.googleapis.com/${bucketName}${filePath}`;
    
    // Insert certificate record into the database
    const result = await db.execute(sql`
      INSERT INTO welder_certificates (
        welder_id, certificate_no, certificate_type, description,
        issue_date, expiry_date, file_path, file_url, status, created_by
      ) VALUES (
        ${welderIdInt}, ${certificateNo}, ${certificateType}, ${description},
        ${issueDate}, ${expiryDate}, ${filePath}, ${fileUrl}, ${status}, ${userId}
      )
      RETURNING id, certificate_no, certificate_type, issue_date, expiry_date
    `);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to insert certificate record');
    }
    
    res.status(201).json({
      success: true,
      message: 'Certificate added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error uploading welder certificate:', error);
    res.status(500).json({ 
      error: 'Failed to upload welder certificate',
      details: error instanceof Error ? error.message : 'Unknown error',
      success: false
    });
  }
});

// Delete a certificate
router.delete('/:certificateId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    
    if (!certificateId || isNaN(parseInt(certificateId))) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }
    
    const certificateIdInt = parseInt(certificateId);
    
    // Get certificate details first
    const certResult = await db.execute(sql`
      SELECT file_path FROM welder_certificates WHERE id = ${certificateIdInt}
    `);
    
    if (certResult.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    const filePath = certResult.rows[0].file_path;
    
    // Delete from database
    const result = await db.execute(sql`
      DELETE FROM welder_certificates WHERE id = ${certificateIdInt}
      RETURNING id
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    // Try to delete file from GCS
    try {
      const bucket = gcsClient.bucket(bucketName);
      const file = bucket.file(filePath.slice(1)); // Remove leading slash
      await file.delete();
    } catch (fileError) {
      console.error('Error deleting file from GCS:', fileError);
      // Continue with the response even if file deletion fails
    }
    
    res.json({ 
      success: true,
      message: 'Certificate deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting certificate:', error);
    res.status(500).json({ 
      error: 'Failed to delete certificate',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export function registerWelderCertificateRoutes(app: express.Express) {
  app.use('/api/quality/welder-certificates', router);
  console.log('Welder certificate routes registered');
}