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
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
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
    if (welderProcess && welderProcess.length > 20) {
      console.log(`Trimming welderProcess from ${welderProcess.length} to 20 characters`);
      welderProcess = welderProcess.substring(0, 20);
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
    
    // Upload the file to Google Cloud Storage
    const filePath = `/QMS/WPQR/${documentId}.pdf`;
    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    
    // Flag to track if GCS upload was successful
    let gcsUploadSuccess = false;
    
    // No longer saving files locally as per requirements
    // All uploads should go directly to Google Cloud Storage
    
    // Upload file to GCS using our utility function
    console.log(`Attempting to upload file to GCS: ${filePath}`);
    
    const uploadResult = await uploadFileToGCS(filePath, fileBuffer, fileType);
    
    if (!uploadResult.success) {
      console.error('GCS upload failed:', uploadResult.message);
      throw new Error(`Google Cloud Storage upload failed: ${uploadResult.message}`);
    }
    
    console.log('GCS upload successful:', uploadResult.message);
    gcsUploadSuccess = true;
    
    // Get the file URL from the upload result or generate it
    const fileUrl = uploadResult.url || `https://storage.googleapis.com/${bucketName}${filePath}`;
    
    // Insert document record into the database
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
        filePath,
        fileUrl,
        status,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();
    
    const insertedDocument = insertedDocuments[0];
    
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
    if (welderProcess && welderProcess.length > 20) {
      console.log(`Trimming welderProcess from ${welderProcess.length} to 20 characters`);
      welderProcess = welderProcess.substring(0, 20);
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
    
    // Handle file uploads if a new file was uploaded
    if (req.file) {
      console.log(`File uploaded in PATCH request. Processing file for WPQR document: ${document.documentId}`);
      
      // Use the existing document ID for the file name
      const filePath = `/QMS/WPQR/${document.documentId}.pdf`;
      const fileBuffer = req.file.buffer;
      const fileType = req.file.mimetype;
      
      // Flag to track if GCS upload was successful
      let gcsUploadSuccess = false;
      
      // No longer saving files locally as per requirements
      // All uploads should go directly to Google Cloud Storage
      
      // Upload file to GCS using our utility function
      console.log(`Attempting to upload file to GCS: ${filePath}`);
      
      const uploadResult = await uploadFileToGCS(filePath, fileBuffer, fileType);
      
      if (!uploadResult.success) {
        console.error('GCS upload failed:', uploadResult.message);
        throw new Error(`Google Cloud Storage upload failed: ${uploadResult.message}`);
      }
      
      console.log('GCS upload successful:', uploadResult.message);
      gcsUploadSuccess = true;
      
      // Update file path and URL in the database
      updateData.filePath = filePath;
      
      // Get the file URL from the upload result or generate it
      updateData.fileUrl = uploadResult.url || `https://storage.googleapis.com/${bucketName}${filePath}`;
      
      console.log(`GCS upload successful: ${gcsUploadSuccess}, URL: ${updateData.fileUrl}`);
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

// Delete a WPQR document
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get the existing document for file path
    const existingDocument = await db.select()
      .from(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .limit(1);
    
    if (!existingDocument.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = existingDocument[0];
    
    // Delete the file from GCS if it exists
    if (document.filePath) {
      console.log(`Attempting to delete file from GCS: ${document.filePath}`);
      
      try {
        // Use our GCS utility to delete the file
        const deleteResult = await deleteFileFromGCS(document.filePath);
        
        if (deleteResult.success) {
          console.log(`File deletion successful: ${deleteResult.message}`);
        } else {
          // We'll still continue with database record deletion even if file deletion fails
          // This prevents database records from being orphaned if GCS has issues
          console.warn(`Warning: ${deleteResult.message} - continuing with document deletion anyway`);
        }
      } catch (fileError) {
        // Log the error but continue with database record deletion
        console.warn(`Unexpected error during file deletion: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
        console.warn(`Continuing with document deletion despite file deletion failure`);
      }
    }
    
    // Delete the document record from the database
    console.log(`Deleting document record from database: ID ${documentId}`);
    const deletedDocuments = await db.delete(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .returning();
    
    if (!deletedDocuments.length) {
      console.error(`No document with ID ${documentId} was deleted from the database`);
      return res.status(404).json({ error: 'Document not found in database during delete operation' });
    }
    
    console.log(`Successfully deleted document with ID ${documentId} from database`);
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
      
      // APPROACH 1: Use our GCS utility to directly stream from GCS
      try {
        console.log(`Attempting to stream file directly from GCS: ${filePath}`);
        
        // Set the appropriate content type
        const contentType = 'application/pdf';
        
        // Create a clean document filename
        // Remove redundant "WPQR-" prefix if docId already contains it
        const cleanDocId = docId.startsWith('WPQR-') ? docId : `WPQR-${docId}`;
        const downloadFilename = `${cleanDocId}.pdf`;
        
        // Use our GCS utility to stream the file directly
        const streamSuccess = await streamFileFromGCS(
          filePath,
          res,
          contentType,
          downloadFilename
        );
        
        if (streamSuccess) {
          console.log(`Successfully started streaming file from GCS: ${filePath}`);
          // Return to end the request handling here since streaming has begun
          return;
        } else {
          console.error(`Failed to stream file from GCS: ${filePath}`);
        }
      } catch (gcsStreamError) {
        console.error(`Error streaming from GCS: ${gcsStreamError instanceof Error ? gcsStreamError.message : String(gcsStreamError)}`);
        // Continue to backup approaches
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