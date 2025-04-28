import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { wpqrDocuments, wpqrDocumentSchema, users } from '@shared/schema';
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
  
  console.log('GCS client created successfully for WPQR routes');
} catch (error) {
  console.error('Failed to initialize Google Cloud Storage client:', error);
}

// Define the GCS bucket name
const bucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
console.log(`Using GCS bucket name: ${bucketName} (from env: ${process.env.GCS_BUCKET_NAME})`);

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
    const documents = await db.select({
      id: wpqrDocuments.id,
      documentId: wpqrDocuments.documentId,
      title: wpqrDocuments.title,
      description: wpqrDocuments.description,
      welderProcess: wpqrDocuments.welderProcess,
      baseMetalGrade: wpqrDocuments.baseMetalGrade,
      jointType: wpqrDocuments.jointType,
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
    
    res.json(documents);
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
    
    res.json(document[0]);
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
router.get('/next-document-id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
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

// Create a new WPQR document
router.post('/', ensureAuthenticated, upload.single('document'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Validate the request body
    const { 
      title, 
      description = null, 
      welderProcess, 
      baseMetalGrade, 
      jointType,
      status = 'Active'
    } = req.body;
    
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
    
    // Upload file to GCS
    const bucket = gcsClient.bucket(bucketName);
    const file = bucket.file(filePath.slice(1)); // Remove leading slash
    
    await file.save(fileBuffer, {
      metadata: {
        contentType: fileType
      }
    });
    
    // Generate a public URL (optional, you may keep it private)
    const fileUrl = `https://storage.googleapis.com/${bucketName}${filePath}`;
    
    // Insert document record into the database
    const insertedDocuments = await db.insert(wpqrDocuments)
      .values({
        documentId,
        title,
        description,
        welderProcess,
        baseMetalGrade,
        jointType,
        filePath,
        fileUrl,
        status,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();
    
    const insertedDocument = insertedDocuments[0];
    
    res.status(201).json(insertedDocument);
  } catch (error) {
    console.error('Error creating WPQR document:', error);
    res.status(500).json({ 
      error: 'Failed to create WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a WPQR document
router.put('/:id', ensureAuthenticated, upload.single('document'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    
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
    
    // Prepare update data
    const updateData: Partial<typeof wpqrDocuments.$inferInsert> = {
      title: req.body.title || document.title,
      description: req.body.description !== undefined ? req.body.description : document.description,
      welderProcess: req.body.welderProcess || document.welderProcess,
      baseMetalGrade: req.body.baseMetalGrade || document.baseMetalGrade,
      jointType: req.body.jointType || document.jointType,
      status: req.body.status || document.status,
      updatedAt: new Date()
    };
    
    // If a new file is uploaded, update the file
    if (req.file) {
      // Upload the file to Google Cloud Storage
      const filePath = document.filePath || `/QMS/WPQR/${document.documentId}.pdf`;
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
      
      // Generate a public URL (optional, you may keep it private)
      const fileUrl = `https://storage.googleapis.com/${bucketName}${filePath}`;
      
      // Update file information in the update data
      updateData.filePath = filePath;
      updateData.fileUrl = fileUrl;
    }
    
    // Update the document in the database
    const updatedDocuments = await db.update(wpqrDocuments)
      .set(updateData)
      .where(eq(wpqrDocuments.id, documentId))
      .returning();
    
    res.json(updatedDocuments[0]);
  } catch (error) {
    console.error('Error updating WPQR document:', error);
    res.status(500).json({ 
      error: 'Failed to update WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
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
      try {
        const bucket = gcsClient.bucket(bucketName);
        const file = bucket.file(document.filePath.slice(1)); // Remove leading slash
        await file.delete();
      } catch (fileError) {
        console.warn(`Warning: Could not delete file ${document.filePath} from GCS:`, fileError);
        // Continue with deletion even if file removal fails
      }
    }
    
    // Delete the document record from the database
    const deletedDocuments = await db.delete(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .returning();
    
    res.json(deletedDocuments[0]);
  } catch (error) {
    console.error('Error deleting WPQR document:', error);
    res.status(500).json({ 
      error: 'Failed to delete WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Download a WPQR document
router.get('/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);
    
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    // Get the document to obtain the file path
    const document = await db.select()
      .from(wpqrDocuments)
      .where(eq(wpqrDocuments.id, documentId))
      .limit(1);
    
    if (!document.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const filePath = document[0].filePath;
    
    if (!filePath) {
      return res.status(404).json({ error: 'No file associated with this document' });
    }
    
    // Create a temporary signed URL for download
    const bucket = gcsClient.bucket(bucketName);
    const file = bucket.file(filePath.slice(1)); // Remove leading slash
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found in storage' });
    }
    
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes
    });
    
    // Redirect to the signed URL for download
    res.redirect(url);
  } catch (error) {
    console.error('Error downloading WPQR document:', error);
    res.status(500).json({ 
      error: 'Failed to download WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;