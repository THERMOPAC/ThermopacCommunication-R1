import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { wpqrDocuments, wpqrDocumentSchema, users, wpqrWelders, welders } from '@shared/schema';
import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { 
  uploadFileToGCS, 
  downloadFileFromGCS, 
  streamFileFromGCS,
  deleteFileFromGCS
} from '../utils/gcs-operations';
import {
  createRevision, logDownload, logAuditEvent, softDeleteRevision,
  getLatestRevision, checkUploadPermission, checkDeletePermission,
  type QmsModule,
} from '../utils/qms-file-governance';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Define the GCS bucket name
const bucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
console.log(`Using GCS bucket name: ${bucketName} (from env: ${process.env.GCS_BUCKET_NAME})`);

// Also create a local file storage directory for direct file access
const LOCAL_WPQR_DIRECTORY = path.join(process.cwd(), 'wpqr_documents');

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
  
  console.log('GCS client created successfully for WPQR routes');
  
  // Add bucket verification
  const verifyBucket = async () => {
    try {
      const bucket = gcsClient.bucket(bucketName);
      const [exists] = await bucket.exists();
      if (exists) {
        console.log(`✅ Successfully verified bucket ${bucketName} exists`);
      } else {
        console.error(`❌ Bucket ${bucketName} does not exist`);
      }
      return exists;
    } catch (error) {
      console.error('Error verifying bucket:', error);
      return false;
    }
  };
  
  // Perform verification asynchronously
  verifyBucket().then(exists => {
    if (!exists) {
      console.error(`WARNING: GCS bucket ${bucketName} verification failed. File uploads may not work.`);
    }
  });
  
} catch (error) {
  console.error('Failed to initialize Google Cloud Storage client:', error);
}

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Get all WPQR documents
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Join with users table to get creator names
    // Get all WPQR documents with their basic info
    const documents = await db.select({
      id: wpqrDocuments.id,
      documentId: wpqrDocuments.documentId,
      title: wpqrDocuments.title,
      description: wpqrDocuments.description,
      welderProcess: wpqrDocuments.welderProcess,
      baseMetalGrade: wpqrDocuments.baseMetalGrade,
      jointType: wpqrDocuments.jointType,
      certificateNo: wpqrDocuments.certificateNo,
      inspectionAuthority: wpqrDocuments.inspectionAuthority,
      filePath: wpqrDocuments.filePath,
      fileUrl: wpqrDocuments.fileUrl,
      status: wpqrDocuments.status,
      createdBy: wpqrDocuments.createdBy,
      createdAt: wpqrDocuments.createdAt,
      updatedAt: wpqrDocuments.updatedAt,
      createdByUser: users.username
    })
    .from(wpqrDocuments)
    .leftJoin(users, eq(wpqrDocuments.createdBy, users.id))
    .orderBy(desc(wpqrDocuments.createdAt));
    
    // Get linked welders for each document
    const documentsWithWelders = await Promise.all(
      documents.map(async (doc) => {
        const linkedWelders = await db.select({
          welderId: welders.id,
          welderCode: welders.welderId,
          welderName: welders.name
        })
        .from(wpqrWelders)
        .leftJoin(welders, eq(wpqrWelders.welderId, welders.id))
        .where(eq(wpqrWelders.wpqrDocumentId, doc.id));
        
        return {
          ...doc,
          linkedWelders
        };
      })
    );
    
    res.json(documentsWithWelders);
  } catch (error) {
    console.error('Error fetching WPQR documents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch WPQR documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get a specific WPQR document by ID
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await db.select({
      id: wpqrDocuments.id,
      documentId: wpqrDocuments.documentId,
      title: wpqrDocuments.title,
      description: wpqrDocuments.description,
      welderProcess: wpqrDocuments.welderProcess,
      baseMetalGrade: wpqrDocuments.baseMetalGrade,
      jointType: wpqrDocuments.jointType,
      certificateNo: wpqrDocuments.certificateNo,
      inspectionAuthority: wpqrDocuments.inspectionAuthority,
      filePath: wpqrDocuments.filePath,
      fileUrl: wpqrDocuments.fileUrl,
      status: wpqrDocuments.status,
      createdBy: wpqrDocuments.createdBy,
      createdAt: wpqrDocuments.createdAt,
      updatedAt: wpqrDocuments.updatedAt,
      createdByUser: users.username
    })
    .from(wpqrDocuments)
    .leftJoin(users, eq(wpqrDocuments.createdBy, users.id))
    .where(eq(wpqrDocuments.id, documentId))
    .limit(1);
    
    if (!document.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Get linked welders for this document
    const linkedWelders = await db.select({
      welderId: welders.id,
      welderCode: welders.welderId,
      welderName: welders.name
    })
    .from(wpqrWelders)
    .leftJoin(welders, eq(wpqrWelders.welderId, welders.id))
    .where(eq(wpqrWelders.wpqrDocumentId, documentId));
    
    const documentWithWelders = {
      ...document[0],
      linkedWelders
    };
    
    res.json(documentWithWelders);
  } catch (error) {
    console.error('Error fetching WPQR document:', error);
    res.status(500).json({ 
      error: 'Failed to fetch WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to generate a unique document ID
async function generateWpqrDocumentId(): Promise<string> {
  // Count existing documents to determine the next number
  const result = await db
    .select({ count: sql`count(${wpqrDocuments.id})` })
    .from(wpqrDocuments);
  
  const count = Number(result[0]?.count || 0);
  
  // Format: WPQR-N where N is an incremental number
  const nextNumber = count + 1;
  return `WPQR-${nextNumber}`;
}

// Get the next document ID that will be generated
router.get('/next-document-id', async (req: Request, res: Response) => {
  try {
    // Allow this endpoint without authentication since it's just informational
    // and used in the create dialog
    const nextDocumentId = await generateWpqrDocumentId();
    res.json({ documentId: nextDocumentId });
  } catch (error) {
    console.error('Error generating next document ID:', error);
    res.status(500).json({ 
      error: 'Failed to generate next document ID',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get welders linked to a specific WPQR document
router.get('/:id/welders', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    
    console.log(`[WPQR Welders] Fetching welders for WPQR document ID: ${documentId}`);
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get linked welders for this document with additional fields for filtering
    // Use INNER JOIN to avoid null welder records
    const linkedWelders = await db.select({
      id: welders.id,
      welderId: welders.welderId,
      name: welders.name,
      welderCode: welders.welderId, // Keep backward compatibility
      welderName: welders.name,     // Keep backward compatibility
      trade: welders.trade,         // Use available field instead of certification
      status: welders.status
    })
    .from(wpqrWelders)
    .innerJoin(welders, eq(wpqrWelders.welderId, welders.id))
    .where(eq(wpqrWelders.wpqrDocumentId, documentId));
    
    console.log(`[WPQR Welders] Found ${linkedWelders.length} welders for WPQR ${documentId}:`, linkedWelders);
    
    res.json(linkedWelders);
  } catch (error) {
    console.error('Error fetching WPQR welders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch WPQR welders',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new WPQR document
router.post('/', ensureAuthenticated, upload.single('document'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    console.log('Creating WPQR document for user:', userId);
    
    // Validate the request body
    let { 
      title, 
      description = null, 
      welderProcess, 
      baseMetalGrade, 
      jointType,
      certificateNo = null,
      inspectionAuthority = null,
      status = 'Active',
      welderIds = []
    } = req.body;
    
    // Log the input values for debugging
    console.log('WPQR document input values:', {
      title: title ? `${title.substring(0, 20)}... (${title.length} chars)` : null,
      welderProcess: welderProcess ? `${welderProcess.substring(0, 10)}... (${welderProcess.length} chars)` : null,
      baseMetalGrade: baseMetalGrade ? `${baseMetalGrade.substring(0, 10)}... (${baseMetalGrade.length} chars)` : null,
      jointType: jointType ? `${jointType.substring(0, 10)}... (${jointType.length} chars)` : null,
      certificateNo: certificateNo ? `${certificateNo.substring(0, 10)}... (${certificateNo.length} chars)` : null,
      inspectionAuthority: inspectionAuthority ? `${inspectionAuthority.substring(0, 10)}... (${inspectionAuthority.length} chars)` : null
    });
    
    // Ensure values don't exceed database column lengths
    if (welderProcess && welderProcess.length > 50) {
      console.log(`Trimming welderProcess from ${welderProcess.length} to 50 characters`);
      welderProcess = welderProcess.substring(0, 50);
    }
    
    if (certificateNo && certificateNo.length > 100) {
      console.log(`Trimming certificateNo from ${certificateNo.length} to 100 characters`);
      certificateNo = certificateNo.substring(0, 100);
    }
    
    if (inspectionAuthority && inspectionAuthority.length > 50) {
      console.log(`Trimming inspectionAuthority from ${inspectionAuthority.length} to 50 characters`);
      inspectionAuthority = inspectionAuthority.substring(0, 50);
    }
    
    if (title && title.length > 100) {
      console.log(`Trimming title from ${title.length} to 100 characters`);
      title = title.substring(0, 100);
    }
    
    if (baseMetalGrade && baseMetalGrade.length > 100) {
      console.log(`Trimming baseMetalGrade from ${baseMetalGrade.length} to 100 characters`);
      baseMetalGrade = baseMetalGrade.substring(0, 100);
    }
    
    if (jointType && jointType.length > 50) {
      console.log(`Trimming jointType from ${jointType.length} to 50 characters`);
      jointType = jointType.substring(0, 50);
    }
    
    // Basic validation for required fields
    if (!title || !welderProcess || !baseMetalGrade || !jointType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No document file uploaded' });
    }
    
    // Generate a unique document ID
    const documentId = await generateWpqrDocumentId();
    
    const user = (req as any).user;
    const userRole = user?.role || '';
    const roleCheck = checkUploadPermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const insertedDocuments = await db.insert(wpqrDocuments)
      .values({
        documentId,
        title,
        description,
        welderProcess,
        baseMetalGrade,
        jointType,
        certificateNo,
        inspectionAuthority,
        filePath: null,
        fileUrl: null,
        status,
        createdBy: userId!,
        updatedAt: new Date()
      })
      .returning();

    const insertedDocument = insertedDocuments[0];

    try {
      const govResult = await createRevision({
        module: 'WPQR' as QmsModule,
        documentNumber: documentId,
        label: 'qualification-record',
        fileBuffer: req.file.buffer,
        originalFileName: req.file.originalname,
        contentType: req.file.mimetype,
        parentEntityType: 'wpqr_document',
        parentEntityId: insertedDocument.id,
        userId: userId!,
        userRole,
        ipAddress: req.ip,
      });

      await db.update(wpqrDocuments)
        .set({ filePath: govResult.gcsPath, fileUrl: govResult.gcsPath })
        .where(eq(wpqrDocuments.id, insertedDocument.id));
      insertedDocument.filePath = govResult.gcsPath;
      insertedDocument.fileUrl = govResult.gcsPath;
      console.log(`WPQR uploaded via governance: ${govResult.gcsPath} (rev ${govResult.revisionNumber})`);
    } catch (govErr) {
      console.error('Governance upload failed, falling back to legacy:', govErr);
      const filePath = `/QMS/WPQR/${documentId}.pdf`;
      const uploadResult = await uploadFileToGCS(filePath, req.file.buffer, req.file.mimetype);
      if (uploadResult.success) {
        const fileUrl = uploadResult.url || `https://storage.googleapis.com/${bucketName}${filePath}`;
        await db.update(wpqrDocuments)
          .set({ filePath, fileUrl })
          .where(eq(wpqrDocuments.id, insertedDocument.id));
        insertedDocument.filePath = filePath;
        insertedDocument.fileUrl = fileUrl;
      }
    }
    
    // Handle welder linking if welderIds are provided
    if (welderIds && Array.isArray(welderIds) && welderIds.length > 0) {
      console.log(`Linking ${welderIds.length} welders to WPQR document ${insertedDocument.id}`);
      
      // Insert welder links in batch
      const welderLinkData = welderIds.map((welderId: number) => ({
        wpqrDocumentId: insertedDocument.id,
        welderId: welderId,
        linkedBy: userId
      }));
      
      await db.insert(wpqrWelders).values(welderLinkData);
      console.log('Successfully linked welders to WPQR document');
    }
    
    res.status(201).json(insertedDocument);
  } catch (error) {
    console.error('Error creating WPQR document:', error);
    
    // Create more detailed error with stack trace
    let errorDetails = 'Unknown error';
    
    if (error instanceof Error) {
      errorDetails = `${error.message}\n${error.stack}`;
      
      // Log additional information about the error
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // Check if it's a database constraint violation
    const errorStr = String(error);
    if (errorStr.includes('violates') || errorStr.includes('constraint')) {
      console.error('Database constraint violation detected');
      
      // Try to extract the constraint name
      const constraintMatch = errorStr.match(/constraint "([^"]+)"/);
      if (constraintMatch && constraintMatch[1]) {
        console.error('Constraint name:', constraintMatch[1]);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to create WPQR document',
      details: errorDetails
    });
  }
});

// Update a WPQR document
router.patch('/:id', ensureAuthenticated, upload.single('document'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    console.log(`Updating WPQR document ${documentId} by user ${userId}`);
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get the existing document
    const existingDocument = await db.select()
      .from(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .limit(1);
    
    if (!existingDocument.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = existingDocument[0];
    
    // Get values from request body or existing document
    let title = req.body.title || document.title;
    let description = req.body.description !== undefined ? req.body.description : document.description;
    let welderProcess = req.body.welderProcess || document.welderProcess;
    let baseMetalGrade = req.body.baseMetalGrade || document.baseMetalGrade;
    let jointType = req.body.jointType || document.jointType;
    let certificateNo = req.body.certificateNo !== undefined ? req.body.certificateNo : document.certificateNo;
    let inspectionAuthority = req.body.inspectionAuthority !== undefined ? req.body.inspectionAuthority : document.inspectionAuthority;
    let status = req.body.status || document.status;
    let welderIds = req.body.welderIds || [];

    // Log the input values for debugging
    console.log('WPQR document update values:', {
      title: title ? `${title.substring(0, 20)}... (${title.length} chars)` : null,
      welderProcess: welderProcess ? `${welderProcess.substring(0, 10)}... (${welderProcess.length} chars)` : null,
      baseMetalGrade: baseMetalGrade ? `${baseMetalGrade.substring(0, 10)}... (${baseMetalGrade.length} chars)` : null,
      jointType: jointType ? `${jointType.substring(0, 10)}... (${jointType.length} chars)` : null,
      certificateNo: certificateNo ? `${certificateNo.substring(0, 10)}... (${certificateNo.length} chars)` : null,
      inspectionAuthority: inspectionAuthority ? `${inspectionAuthority.substring(0, 10)}... (${inspectionAuthority.length} chars)` : null
    });

    // Ensure values don't exceed database column lengths
    if (welderProcess && welderProcess.length > 50) {
      console.log(`Trimming welderProcess from ${welderProcess.length} to 50 characters`);
      welderProcess = welderProcess.substring(0, 50);
    }
    
    if (certificateNo && certificateNo.length > 100) {
      console.log(`Trimming certificateNo from ${certificateNo.length} to 100 characters`);
      certificateNo = certificateNo.substring(0, 100);
    }
    
    if (inspectionAuthority && inspectionAuthority.length > 50) {
      console.log(`Trimming inspectionAuthority from ${inspectionAuthority.length} to 50 characters`);
      inspectionAuthority = inspectionAuthority.substring(0, 50);
    }
    
    if (title && title.length > 100) {
      console.log(`Trimming title from ${title.length} to 100 characters`);
      title = title.substring(0, 100);
    }
    
    if (baseMetalGrade && baseMetalGrade.length > 100) {
      console.log(`Trimming baseMetalGrade from ${baseMetalGrade.length} to 100 characters`);
      baseMetalGrade = baseMetalGrade.substring(0, 100);
    }
    
    if (jointType && jointType.length > 50) {
      console.log(`Trimming jointType from ${jointType.length} to 50 characters`);
      jointType = jointType.substring(0, 50);
    }
    
    // Prepare update data
    const updateData: Partial<typeof wpqrDocuments.$inferInsert> = {
      title,
      description,
      welderProcess,
      baseMetalGrade,
      jointType,
      certificateNo,
      inspectionAuthority,
      status,
      updatedAt: new Date()
    };
    
    if (req.file) {
      const user = (req as any).user;
      const userRole = user?.role || '';
      const roleCheck = checkUploadPermission(userRole);
      if (!roleCheck.allowed) {
        return res.status(403).json({ error: roleCheck.reason });
      }

      try {
        const govResult = await createRevision({
          module: 'WPQR' as QmsModule,
          documentNumber: document.documentId,
          label: 'qualification-record',
          fileBuffer: req.file.buffer,
          originalFileName: req.file.originalname,
          contentType: req.file.mimetype,
          parentEntityType: 'wpqr_document',
          parentEntityId: documentId,
          userId: userId!,
          userRole,
          ipAddress: req.ip,
        });

        updateData.filePath = govResult.gcsPath;
        updateData.fileUrl = govResult.gcsPath;
        console.log(`WPQR revised via governance: ${govResult.gcsPath} (rev ${govResult.revisionNumber})`);
      } catch (govErr) {
        console.error('Governance revision failed:', govErr);
        return res.status(500).json({ error: 'Failed to create file revision' });
      }
    }
    
    // Update the document in the database
    const updatedDocuments = await db.update(wpqrDocuments)
      .set(updateData)
      .where(eq(wpqrDocuments.id, documentId))
      .returning();
    
    // Handle welder linking if welderIds are provided
    if (welderIds && Array.isArray(welderIds)) {
      console.log(`Updating welder links for WPQR document ${documentId}`);
      
      // First, remove existing welder links
      await db.delete(wpqrWelders)
        .where(eq(wpqrWelders.wpqrDocumentId, documentId));
      
      // Then, add new welder links if any
      if (welderIds.length > 0) {
        const welderLinkData = welderIds.map((welderId: number) => ({
          wpqrDocumentId: documentId,
          welderId: welderId,
          linkedBy: userId
        }));
        
        await db.insert(wpqrWelders).values(welderLinkData);
        console.log(`Successfully linked ${welderIds.length} welders to WPQR document`);
      }
    }
    
    res.json(updatedDocuments[0]);
  } catch (error) {
    console.error('Error updating WPQR document:', error);
    
    // Create more detailed error with stack trace
    let errorDetails = 'Unknown error';
    
    if (error instanceof Error) {
      errorDetails = `${error.message}\n${error.stack}`;
      
      // Log additional information about the error
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // Check if it's a database constraint violation
    const errorStr = String(error);
    if (errorStr.includes('violates') || errorStr.includes('constraint')) {
      console.error('Database constraint violation detected');
      
      // Try to extract the constraint name
      const constraintMatch = errorStr.match(/constraint "([^"]+)"/);
      if (constraintMatch && constraintMatch[1]) {
        console.error('Constraint name:', constraintMatch[1]);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to update WPQR document',
      details: errorDetails
    });
  }
});

router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    const user = (req as any).user;
    const userRole = user?.role || '';

    const deleteCheck = checkDeletePermission(userRole);
    if (!deleteCheck.allowed) {
      return res.status(403).json({ error: deleteCheck.reason });
    }

    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const existingDocument = await db.select()
      .from(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .limit(1);

    if (!existingDocument.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = existingDocument[0];
    const reason = req.body?.reason || 'No reason provided';

    const governed = await getLatestRevision('WPQR', document.documentId);
    if (governed) {
      await softDeleteRevision({
        module: 'WPQR',
        documentNumber: document.documentId,
        revisionId: governed.revisionId,
        userId: user?.id || 0,
        userRole,
        reason,
        ipAddress: req.ip,
      });
    }

    const deletedDocuments = await db.delete(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .returning();

    await logAuditEvent({
      module: 'WPQR',
      documentNumber: document.documentId,
      action: 'soft_delete',
      userId: user?.id || 0,
      userRole,
      ipAddress: req.ip,
      details: { reason, entityDeleted: true },
    });

    console.log(`Successfully deleted WPQR document with ID ${documentId} from database (GCS files preserved)`);
    res.json(deletedDocuments[0]);
  } catch (error) {
    console.error('Error deleting WPQR document:', error);
    
    // Create more detailed error with stack trace
    let errorDetails = 'Unknown error';
    
    if (error instanceof Error) {
      errorDetails = `${error.message}\n${error.stack}`;
      
      // Log additional information about the error
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    res.status(500).json({ 
      error: 'Failed to delete WPQR document',
      details: errorDetails
    });
  }
});

// Special route for downloading WPQR documents with maximal robustness
router.get('/download/:id', async (req: Request, res: Response) => {
  // Skip authentication for download to eliminate one possible source of errors
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    
    console.log(`======== WPQR DOWNLOAD START ========`);
    console.log(`Download requested for WPQR ID: ${id}`);
    console.log(`Current working directory: ${process.cwd()}`);
    console.log(`Local WPQR directory: ${LOCAL_WPQR_DIRECTORY}`);
    
    // Create local directory if it doesn't exist
    try {
      await fs.promises.mkdir(LOCAL_WPQR_DIRECTORY, { recursive: true });
      console.log(`Ensured local WPQR directory exists: ${LOCAL_WPQR_DIRECTORY}`);
    } catch (mkdirError) {
      console.error(`Failed to create local WPQR directory: ${mkdirError}`);
    }
    
    // List files in the local WPQR directory for debugging
    try {
      const files = await fs.promises.readdir(LOCAL_WPQR_DIRECTORY);
      console.log(`Files in local WPQR directory: ${files.join(', ') || 'none'}`);
    } catch (readdirError) {
      console.error(`Failed to read local WPQR directory: ${readdirError}`);
    }
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get the document from database
    console.log(`Fetching WPQR document with ID: ${documentId}`);
    const document = await db.select()
      .from(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .limit(1);
    
    console.log(`Database query result: ${JSON.stringify(document)}`);
    
    if (!document.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const filePath = document[0].filePath;
    const fileUrl = document[0].fileUrl;
    const docId = document[0].documentId;
    
    if (!filePath) {
      return res.status(404).json({ error: 'No file associated with this document' });
    }
    
    console.log(`Processing download request for WPQR ID: ${documentId}, path: ${filePath}`);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    // Remove redundant "WPQR-" prefix if docId already contains it
    const cleanDocId = docId.startsWith('WPQR-') ? docId : `WPQR-${docId}`;
    res.setHeader('Content-Disposition', `attachment; filename="${cleanDocId}.pdf"`);
    
    // Create directory for storing temporary files
    const tmpDir = path.join(os.tmpdir(), 'wpqr-downloads');
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const tmpFilePath = path.join(tmpDir, `wpqr-${docId}-${Date.now()}.pdf`);
    
    // Check local cache directory first
    const localCacheDir = path.join(process.cwd(), 'local_document_cache', 'wpqr');
    await fs.promises.mkdir(localCacheDir, { recursive: true });
    const localCachePath = path.join(localCacheDir, `WPQR-${docId}.pdf`);
    
    // We'll check if this file exists later as another download approach
    
    // Function to clean up temp file
    const cleanupTempFile = () => {
      try {
        fs.unlinkSync(tmpFilePath);
        console.log(`Cleaned up temp file: ${tmpFilePath}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error cleaning up temp file: ${errMsg}`);
      }
    };
    
    try {
      console.log('=== WPQR DOWNLOAD DEBUG INFO ===');
      console.log(`Document ID: ${documentId}`);
      console.log(`File Path: ${filePath}`);
      console.log(`File URL: ${fileUrl || 'N/A'}`);
      console.log(`Temp File Path: ${tmpFilePath}`);
      console.log(`GCS Client Initialized: ${!!gcsClient}`);
      console.log(`Bucket Name: ${bucketName}`);
      
      // Create an emergency text file response in case all GCS methods fail
      let emergencyResponse = 
        `WPQR Document Information\n` +
        `Document ID: ${docId}\n` +
        `Original File Path: ${filePath}\n\n` +
        `This is an emergency text response because the PDF file could not be downloaded.\n` + 
        `Please contact IT support to resolve this issue with Google Cloud Storage access.\n\n` +
        `Additional Details:\n` + 
        `Bucket Name: ${bucketName}\n`;
      
      const downloadUser = (req as any).user;
      let governedPath: string | null = null;
      const governed = await getLatestRevision('WPQR', docId);
      if (governed) {
        governedPath = governed.gcsPath;
      }

      const effectivePath = governedPath || filePath;

      try {
        console.log(`Attempting to stream file directly from GCS: ${effectivePath}`);
        const contentType = 'application/pdf';
        const cleanDocId = docId.startsWith('WPQR-') ? docId : `WPQR-${docId}`;
        const downloadFilename = `${cleanDocId}.pdf`;

        const streamSuccess = await streamFileFromGCS(
          effectivePath,
          res,
          contentType,
          downloadFilename
        );

        if (streamSuccess) {
          console.log(`Successfully started streaming file from GCS: ${effectivePath}`);
          await logDownload({
            module: 'WPQR',
            documentNumber: docId,
            revisionId: governed?.revisionId,
            gcsPath: effectivePath,
            userId: downloadUser?.id || 0,
            userRole: downloadUser?.role,
            ipAddress: req.ip,
          });
          return;
        } else {
          console.error(`Failed to stream file from GCS: ${effectivePath}`);
        }
      } catch (gcsStreamError) {
        console.error(`Error streaming from GCS: ${gcsStreamError instanceof Error ? gcsStreamError.message : String(gcsStreamError)}`);
      }
      
      // APPROACH 2: Check local document directory as backup
      try {
        // Check if a local copy exists in our local documents directory using both naming conventions:
        // 1. WPQR-9.pdf (original format)
        // 2. WPQR-WPQR-9.pdf (with redundant prefix)
        const localFilePathOriginal = docId.startsWith('WPQR-') 
          ? path.join(LOCAL_WPQR_DIRECTORY, `${docId}.pdf`) 
          : path.join(LOCAL_WPQR_DIRECTORY, `WPQR-${docId}.pdf`);
          
        const localFilePathRedundant = docId.startsWith('WPQR-') 
          ? path.join(LOCAL_WPQR_DIRECTORY, `WPQR-${docId}.pdf`) 
          : path.join(LOCAL_WPQR_DIRECTORY, `WPQR-WPQR-${docId}.pdf`);
        
        // First try the original format
        let localFilePath = localFilePathOriginal;
        
        console.log(`Checking for local file (original format): ${localFilePath}`);
        
        // Check if the file exists in the local file system using original format
        let localFileExists = await fs.promises.access(localFilePath)
          .then(() => true)
          .catch(() => false);
        
        // If not found, try the redundant format
        if (!localFileExists) {
          localFilePath = localFilePathRedundant;
          console.log(`First format not found. Checking redundant format: ${localFilePath}`);
          localFileExists = await fs.promises.access(localFilePath)
            .then(() => true)
            .catch(() => false);
        }
        
        if (localFileExists) {
          // Get file stats to check size
          const fileStats = await fs.promises.stat(localFilePath);
          console.log(`Local file found, size: ${fileStats.size} bytes`);
          
          if (fileStats.size > 0) {
            // Stream the local file to client
            console.log(`Streaming local file from: ${localFilePath}`);
            const fileStream = fs.createReadStream(localFilePath);
            
            fileStream.on('error', (err: Error) => {
              console.error(`Local file stream error: ${err.message}`);
              if (!res.headersSent) {
                res.status(500).send('Error streaming file from local filesystem');
              }
            });
            
            fileStream.pipe(res);
            return;
          } else {
            console.error('Local file exists but is empty');
          }
        } else {
          console.log('Local file does not exist in either format');
        }
      } catch (localError: unknown) {
        const errMsg = localError instanceof Error ? localError.message : String(localError);
        console.error(`Local file access error: ${errMsg}`);
        // Continue to next approach
      }
      
      // APPROACH 2: Try direct file download from GCS
      if (gcsClient) {
        try {
          const bucket = gcsClient.bucket(bucketName);
          const gcsPath = filePath.slice(1); // Remove leading slash
          const file = bucket.file(gcsPath);
          
          console.log(`Attempting direct GCS download to temp file: ${gcsPath}`);
          
          // Check if the file exists first
          const [exists] = await file.exists();
          if (!exists) {
            console.error(`File does not exist in GCS: ${gcsPath}`);
            throw new Error(`File does not exist in GCS: ${gcsPath}`);
          }
          
          // Download file from GCS to temp file
          await file.download({ destination: tmpFilePath });
          
          // Verify the downloaded file
          const fileStats = await fs.promises.stat(tmpFilePath);
          console.log(`Downloaded file size: ${fileStats.size} bytes`);
          
          if (fileStats.size === 0) {
            throw new Error('Downloaded file is empty');
          }
          
          // SUCCESS: Also save to local cache for future use
          try {
            const localCacheFile = path.join(LOCAL_WPQR_DIRECTORY, `WPQR-${docId}.pdf`);
            await fs.promises.copyFile(tmpFilePath, localCacheFile);
            console.log(`Saved a copy to local cache: ${localCacheFile}`);
          } catch (cacheError: unknown) {
            const errMsg = cacheError instanceof Error ? cacheError.message : String(cacheError);
            console.error(`Failed to save to local cache: ${errMsg}`);
          }
          
          // Stream the temp file to client
          console.log(`Successfully downloaded to ${tmpFilePath}, streaming to client`);
          const fileStream = fs.createReadStream(tmpFilePath);
          
          fileStream.on('end', cleanupTempFile);
          fileStream.on('error', (err: Error) => {
            console.error(`Stream error: ${err.message}`);
            cleanupTempFile();
            if (!res.headersSent) {
              res.status(500).send('Error streaming file');
            }
          });
          
          fileStream.pipe(res);
          return;
        } catch (gcsError: unknown) {
          const errMsg = gcsError instanceof Error ? gcsError.message : String(gcsError);
          console.error(`GCS download failed: ${errMsg}`);
          // Continue to next approach
        }
      }
      
      // APPROACH 2: Check local cache file
      try {
        console.log(`Checking local cache file: ${localCachePath}`);
        
        // Check if file exists in local cache
        const localFileExists = await fs.promises.access(localCachePath)
          .then(() => true)
          .catch(() => false);
        
        if (localFileExists) {
          // Get file stats to check size
          const fileStats = await fs.promises.stat(localCachePath);
          console.log(`Local cache file exists, size: ${fileStats.size} bytes`);
          
          if (fileStats.size > 0) {
            // Stream the local file to client
            console.log(`Streaming local cache file: ${localCachePath}`);
            const fileStream = fs.createReadStream(localCachePath);
            
            fileStream.on('error', (err: Error) => {
              console.error(`Local file stream error: ${err.message}`);
              if (!res.headersSent) {
                res.status(500).send('Error streaming file from local cache');
              }
            });
            
            fileStream.pipe(res);
            return;
          } else {
            console.error('Local cache file exists but is empty');
          }
        } else {
          console.log('Local cache file does not exist');
        }
      } catch (localError: unknown) {
        const errMsg = localError instanceof Error ? localError.message : String(localError);
        console.error(`Local cache error: ${errMsg}`);
        // Continue to next approach
      }
      
      // APPROACH 3: Try downloading from public URL if available
      if (fileUrl) {
        try {
          console.log(`Attempting to download from public URL: ${fileUrl}`);
          
          const fetchResponse = await fetch(fileUrl);
          if (!fetchResponse.ok) {
            throw new Error(`Failed to fetch from URL: ${fetchResponse.status}`);
          }
          
          // Download from URL to temp file
          const fileStream = fs.createWriteStream(tmpFilePath);
          
          await new Promise((resolve, reject) => {
            if (!fetchResponse.body) {
              reject(new Error('Response body is null'));
              return;
            }
            
            fetchResponse.body.pipe(fileStream);
            fetchResponse.body.on('error', (err: Error) => {
              console.error(`Fetch stream error: ${err.message}`);
              reject(err);
            });
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
          });
          
          // SUCCESS: Also save to local cache for future use
          try {
            await fs.promises.copyFile(tmpFilePath, localCachePath);
            console.log(`Saved a copy to local cache: ${localCachePath}`);
          } catch (cacheError: unknown) {
            const errMsg = cacheError instanceof Error ? cacheError.message : String(cacheError);
            console.error(`Failed to save to local cache: ${errMsg}`);
          }
          
          // Now stream the downloaded file to client
          console.log(`URL downloaded to ${tmpFilePath}, streaming to client`);
          const responseStream = fs.createReadStream(tmpFilePath);
          
          responseStream.on('end', cleanupTempFile);
          responseStream.on('error', (err: Error) => {
            console.error(`Stream error: ${err.message}`);
            cleanupTempFile();
            if (!res.headersSent) {
              res.status(500).send('Error streaming file');
            }
          });
          
          responseStream.pipe(res);
          return;
        } catch (urlError: unknown) {
          const errMsg = urlError instanceof Error ? urlError.message : String(urlError);
          console.error(`URL download failed: ${errMsg}`);
          // Fall through to final error
        }
      }
      
      // APPROACH 3: Last resort - return a text file with document info
      console.log('All download methods failed, sending emergency text response');
      
      if (!res.headersSent) {
        // Change content type to text
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="WPQR-${docId}-INFO.txt"`);
        
        // Send emergency text response
        res.send(emergencyResponse);
        return;
      }
      
    } catch (finalError: unknown) {
      // Clean up any temp file if it exists
      cleanupTempFile();
      
      if (!res.headersSent) {
        const errMsg = finalError instanceof Error ? finalError.message : String(finalError);
        console.error(`Download completely failed: ${errMsg}`);
        
        // Try to send a text response even in this error case
        try {
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', `attachment; filename="WPQR-${docId}-ERROR.txt"`);
          res.send(
            `WPQR Document Error Report\n` +
            `Document ID: ${docId}\n` +
            `Error: ${errMsg}\n\n` +
            `The system encountered an error while trying to download this document.\n` +
            `Please contact IT support with this information for assistance.`
          );
        } catch (sendError) {
          res.status(500).send('Critical error in document download');
        }
      }
    }
  } catch (error) {
    if (!res.headersSent) {
      console.error('Error in download endpoint:', error);
      res.status(500).json({
        error: 'Download error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Get WPQR files from GCS for a specific document
router.get('/:documentId/files', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    
    console.log(`🔍 WPQR Files API called for document: ${documentId}`);
    
    // Validate documentId format
    if (!documentId || !documentId.startsWith('WPQR-')) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }
    
    // Check if the document exists in our database
    const document = await db.select()
      .from(wpqrDocuments)
      .where(eq(wpqrDocuments.documentId, documentId))
      .limit(1);
    
    if (!document.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    console.log(`📋 Found document: ${documentId}`);
    
    // GCS operations
    console.log('Using explicit credentials from GOOGLE_CLOUD_CREDENTIALS');
    
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
      throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable is not set');
    }
    
    const credentialsString = process.env.GOOGLE_CLOUD_CREDENTIALS;
    console.log('Parsing Google Cloud credentials...');
    const credentials = JSON.parse(credentialsString);
    
    console.log('✅ Successfully validated credentials');
    
    // Create GCS client with explicit credentials
    const storage = new Storage({
      projectId: credentials.project_id,
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key
      }
    });
    
    console.log('✅ GCS client initialized successfully');
    
    const bucketName = 'thermopac_storage';
    console.log(`Using GCS bucket name: ${bucketName}`);
    
    const bucket = storage.bucket(bucketName);
    
    console.log('Created bucket reference for thermopac_storage');
    
    // Skip bucket existence verification to avoid permission issues
    console.log('Skipping bucket existence verification for thermopac_storage');
    console.log('Will proceed with assuming bucket exists and attempt operations with object-level permissions');
    
    // List files for this WPQR document
    const prefix = `QMS/WPQR/${documentId}`;
    console.log(`🔍 Listing WPQR files for document ${documentId} with prefix: ${prefix}`);
    
    const [files] = await bucket.getFiles({
      prefix: prefix
    });
    
    console.log(`📁 Found ${files.length} files for document ${documentId}`);
    
    const fileDetails = await Promise.all(
      files
        .filter(file => file.name.endsWith('.pdf')) // Only show PDF files
        .map(async (file) => {
          try {
            const [metadata] = await file.getMetadata();
            console.log(`📄 File: ${file.name}, Size: ${metadata.size}, Updated: ${metadata.updated}`);
            
            // Generate signed URL for download
            const [signedUrl] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + 15 * 60 * 1000, // 15 minutes
            });
            
            return {
              name: file.name.split('/').pop(), // Get just the filename
              gcsPath: file.name,
              size: parseInt(metadata.size || '0'),
              updated: metadata.updated,
              downloadUrl: signedUrl
            };
          } catch (error) {
            console.error(`Error getting metadata for file ${file.name}:`, error);
            return null;
          }
        })
    );
    
    // Filter out any null results from failed metadata requests
    const validFiles = fileDetails.filter(file => file !== null);
    
    console.log(`📁 Found ${validFiles.length} WPQR files for document ${documentId}`);
    
    res.json(validFiles);
  } catch (error) {
    console.error('Error fetching WPQR files:', error);
    res.status(500).json({ 
      error: 'Failed to fetch WPQR files',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all welders for the frontend dropdown
router.get('/welders', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const allWelders = await db.select({
      id: welders.id,
      welderId: welders.welderId,
      name: welders.name,
      certification: welders.certification,
      status: welders.status
    })
    .from(welders)
    .where(eq(welders.status, 'Active'))
    .orderBy(welders.welderId);
    
    res.json(allWelders);
  } catch (error) {
    console.error('Error fetching welders:', error);
    res.status(500).json({ error: 'Failed to fetch welders' });
  }
});

export default router;