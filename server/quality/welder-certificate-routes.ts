import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { welderCertificates, welders, users } from '@shared/schema';
import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createRevision, logDownload, logAuditEvent, softDeleteRevision,
  getLatestRevision, checkUploadPermission, checkDeletePermission,
  type QmsModule,
} from '../utils/qms-file-governance';

// Helper function to safely handle GCS file paths
function getGCSCleanPath(filePath: any): string {
  // First ensure filePath is a string
  const pathStr = typeof filePath === 'string' ? filePath : String(filePath || '');
  
  // Remove leading slash if present - GCS doesn't want leading slashes
  return pathStr.startsWith('/') ? pathStr.substring(1) : pathStr;
}

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
    console.log(`Credential validation: ${JSON.stringify({ valid: Object.values(validation).every(Boolean) })}`);
    
    // Create GCS client with explicit credentials
    gcsClient = new Storage({
      projectId: credentials.project_id,
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key
      }
    });
    
    console.log(`Using explicit GCS credentials with project: ${credentials.project_id}`);
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

// Helper to generate a unique certificate number for a specific welder
async function generateCertificateNumber(welderId: number) {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("certificate_no" FROM 6) AS INTEGER)) as max_id
    FROM welder_certificates
    WHERE welder_id = ${welderId}
  `);
  
  const maxIdStr = result.rows[0]?.max_id as string | undefined;
  const maxId = maxIdStr ? parseInt(maxIdStr) : 0;
  const nextId = maxId + 1;
  return `CERT-${nextId.toString().padStart(3, '0')}`;
}

// Get all certificates across all welders with fresh signed URLs
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
    
    // Generate fresh signed URLs for each certificate
    const bucket = gcsClient.bucket(bucketName);
    const certificatesWithSignedUrls = await Promise.all(
      certificates.rows.map(async (cert: any) => {
        // If we have a file path, generate a fresh signed URL
        if (cert.file_path) {
          try {
            // Get file path and ensure it's properly formatted for GCS
            const cleanPath = getGCSCleanPath(cert.file_path);
            const file = bucket.file(cleanPath);
            
            // Generate a signed URL valid for 24 hours
            const [signedUrl] = await file.getSignedUrl({
              version: 'v4',
              action: 'read',
              expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
              responseDisposition: 'attachment', // Force download rather than viewing in browser
            });
            
            // Update the file_url with the fresh signed URL
            return { ...cert, file_url: signedUrl };
          } catch (error) {
            console.error('Error generating signed URL:', error);
            return cert; // Return the original cert if there was an error
          }
        }
        return cert;
      })
    );
    
    res.json(certificatesWithSignedUrls);
  } catch (error) {
    console.error('Error fetching all welder certificates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch all certificates',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all certificates for a welder with fresh signed URLs
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
    
    // Generate fresh signed URLs for each certificate
    const bucket = gcsClient.bucket(bucketName);
    const certificatesWithSignedUrls = await Promise.all(
      certificates.rows.map(async (cert: any) => {
        // If we have a file path, generate a fresh signed URL
        if (cert.file_path) {
          try {
            // Get file path and ensure it's properly formatted for GCS
            const cleanPath = getGCSCleanPath(cert.file_path);
            const file = bucket.file(cleanPath);
            
            // Generate a signed URL valid for 24 hours
            const [signedUrl] = await file.getSignedUrl({
              version: 'v4',
              action: 'read',
              expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
              responseDisposition: 'attachment', // Force download rather than viewing in browser
            });
            
            // Update the file_url with the fresh signed URL
            return { ...cert, file_url: signedUrl };
          } catch (error) {
            console.error('Error generating signed URL:', error);
            return cert; // Return the original cert if there was an error
          }
        }
        return cert;
      })
    );
    
    res.json(certificatesWithSignedUrls);
  } catch (error) {
    console.error('Error fetching welder certificates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch welder certificates',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload a new certificate for a welder
router.post('/:welderId', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
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

    const userRole = (req.user as any)?.role || '';
    const roleCheck = checkUploadPermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }
    
    const certificateNo = await generateCertificateNumber(welderIdInt);

    const result = await db.execute(sql`
      INSERT INTO welder_certificates (
        welder_id, certificate_no, certificate_type, description,
        issue_date, expiry_date, file_path, status, created_by
      ) VALUES (
        ${welderIdInt}, ${certificateNo}, ${certificateType}, ${description},
        ${issueDate}, ${expiryDate}, ${''}, ${status}, ${userId}
      )
      RETURNING id, certificate_no, certificate_type, issue_date, expiry_date
    `);

    if (result.rows.length === 0) {
      throw new Error('Failed to insert certificate record');
    }

    const certId = (result.rows[0] as any).id;
    const docNumber = `${welderIdString}-${certificateNo}`;

    try {
      const govResult = await createRevision({
        module: 'WelderManagement' as QmsModule,
        documentNumber: docNumber,
        label: `cert-${certificateType}`,
        fileBuffer: req.file.buffer,
        originalFileName: req.file.originalname,
        contentType: req.file.mimetype,
        parentEntityType: 'welder_certificate',
        parentEntityId: certId,
        userId: userId!,
        userRole,
        ipAddress: req.ip,
      });

      await db.execute(sql`
        UPDATE welder_certificates SET file_path = ${govResult.gcsPath}
        WHERE id = ${certId}
      `);

      console.log(`Welder certificate uploaded via governance: ${govResult.gcsPath} (rev ${govResult.revisionNumber})`);
    } catch (govErr) {
      console.error('Governance upload failed for welder cert:', govErr);
      return res.status(500).json({ error: 'Failed to upload certificate file' });
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

// Get a fresh signed URL for a specific certificate (with audit logging)
router.get('/:certificateId/url', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const userId = (req.user as any)?.id || 0;
    const userRole = (req.user as any)?.role || '';

    if (!certificateId || isNaN(parseInt(certificateId))) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }

    const certificateIdInt = parseInt(certificateId);

    const latestRev = await getLatestRevision('welder_certificate', certificateIdInt);

    if (latestRev) {
      const bucket = gcsClient.bucket(bucketName);
      const file = bucket.file(latestRev.gcsPath);
      const [exists] = await file.exists();

      if (exists) {
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000,
          responseDisposition: 'attachment',
        });

        await logDownload({
          module: 'WelderManagement',
          documentNumber: latestRev.documentNumber,
          gcsPath: latestRev.gcsPath,
          userId,
          userRole,
          ipAddress: req.ip,
        });

        return res.json({
          success: true,
          fileUrl: signedUrl,
          certificateNo: latestRev.documentNumber,
          revisionNumber: latestRev.revisionNumber,
        });
      }
    }

    const certResult = await db.execute(sql`
      SELECT file_path, certificate_no FROM welder_certificates WHERE id = ${certificateIdInt}
    `);

    if (certResult.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const filePathRaw = certResult.rows[0].file_path;
    const certificateNo = certResult.rows[0].certificate_no;

    if (!filePathRaw) {
      return res.status(404).json({ error: 'Certificate file path not found' });
    }

    const bucket = gcsClient.bucket(bucketName);
    const cleanPath = getGCSCleanPath(filePathRaw);
    const file = bucket.file(cleanPath);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        error: 'Certificate file not found in storage',
        details: `File not found at path: ${cleanPath}`
      });
    }

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
      responseDisposition: 'attachment',
    });

    await logDownload({
      module: 'WelderManagement',
      documentNumber: String(certificateNo),
      gcsPath: cleanPath,
      userId,
      userRole,
      ipAddress: req.ip,
      details: { source: 'legacy_fallback' },
    });

    res.json({
      success: true,
      fileUrl: signedUrl,
      certificateNo
    });
  } catch (error) {
    console.error('Error generating signed URL for certificate:', error);
    res.status(500).json({
      error: 'Failed to generate signed URL',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update certificate metadata (without changing the file)
router.put('/:certificateId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    
    if (!certificateId || isNaN(parseInt(certificateId))) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }
    
    const certificateIdInt = parseInt(certificateId);
    
    // Get certificate details first
    const certResult = await db.execute(sql`
      SELECT * FROM welder_certificates WHERE id = ${certificateIdInt}
    `);
    
    if (certResult.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    const { certificateType, certificateNo, description, issueDate, expiryDate, status, wpqrId } = req.body;
    
    // Basic validation
    if (!certificateType || !certificateNo || !issueDate || !expiryDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Update certificate in database
    const updateResult = await db.execute(sql`
      UPDATE welder_certificates SET
        certificate_type = ${certificateType},
        certificate_no = ${certificateNo},
        description = ${description || null},
        issue_date = ${issueDate},
        expiry_date = ${expiryDate},
        status = ${status || 'Active'},
        wpqr_id = ${wpqrId ? parseInt(wpqrId) : null},
        updated_at = NOW()
      WHERE id = ${certificateIdInt}
      RETURNING *
    `);
    
    res.json({
      success: true,
      message: 'Certificate updated successfully',
      certificate: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Error updating certificate:', error);
    res.status(500).json({
      error: 'Failed to update certificate',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update certificate with new file (non-destructive governance revision)
router.put('/:certificateId/file', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role || '';

    if (!certificateId || isNaN(parseInt(certificateId))) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }

    const certificateIdInt = parseInt(certificateId);

    const roleCheck = checkUploadPermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const certResult = await db.execute(sql`
      SELECT c.*, w."welderId"
      FROM welder_certificates c
      JOIN welders w ON c.welder_id = w.id
      WHERE c.id = ${certificateIdInt}
    `);

    if (certResult.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const certificate = certResult.rows[0] as any;
    const welderIdString = certificate.welderId;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const docNumber = `${welderIdString}-${certificate.certificate_no}`;

    const govResult = await createRevision({
      module: 'WelderManagement' as QmsModule,
      documentNumber: docNumber,
      label: `cert-${certificate.certificate_type}`,
      fileBuffer: req.file.buffer,
      originalFileName: req.file.originalname,
      contentType: req.file.mimetype,
      parentEntityType: 'welder_certificate',
      parentEntityId: certificateIdInt,
      userId: userId || 0,
      userRole,
      ipAddress: req.ip,
    });

    const updateResult = await db.execute(sql`
      UPDATE welder_certificates SET
        file_path = ${govResult.gcsPath},
        updated_at = NOW()
      WHERE id = ${certificateIdInt}
      RETURNING *
    `);

    console.log(`Welder certificate file revised via governance: ${govResult.gcsPath} (rev ${govResult.revisionNumber})`);

    res.json({
      success: true,
      message: 'Certificate file updated successfully',
      certificate: updateResult.rows[0],
      revisionNumber: govResult.revisionNumber,
    });
  } catch (error) {
    console.error('Error updating certificate file:', error);
    res.status(500).json({
      error: 'Failed to update certificate file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a certificate (Superuser only, soft-delete governance revisions)
router.delete('/:certificateId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const userId = (req.user as any)?.id || 0;
    const userRole = (req.user as any)?.role || '';

    if (!certificateId || isNaN(parseInt(certificateId))) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }

    const roleCheck = checkDeletePermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const certificateIdInt = parseInt(certificateId);

    const certResult = await db.execute(sql`
      SELECT c.certificate_no, w."welderId"
      FROM welder_certificates c
      JOIN welders w ON c.welder_id = w.id
      WHERE c.id = ${certificateIdInt}
    `);

    if (certResult.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const cert = certResult.rows[0] as any;
    const docNumber = `${cert.welderId}-${cert.certificate_no}`;

    const latestRev = await getLatestRevision('welder_certificate', certificateIdInt);
    if (latestRev) {
      await softDeleteRevision({
        revisionId: latestRev.id,
        userId,
        userRole,
        ipAddress: req.ip,
        reason: req.body?.reason || 'Certificate deleted',
      });
    }

    await logAuditEvent({
      action: 'soft_delete',
      module: 'WelderManagement',
      documentNumber: docNumber,
      userId,
      userRole,
      ipAddress: req.ip,
      details: { certificateId: certificateIdInt, reason: req.body?.reason },
    });

    const result = await db.execute(sql`
      DELETE FROM welder_certificates WHERE id = ${certificateIdInt}
      RETURNING id
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
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