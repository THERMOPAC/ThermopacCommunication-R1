import express, { Request, Response } from 'express';
import { db } from '../db';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { eq, sql, desc } from 'drizzle-orm';
import { wpqrDocuments } from '@shared/schema';
import multer from 'multer';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
});

// Configure Google Cloud Storage
const gcsBucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
let gcsClient: Storage;

try {
  const credentials = JSON.parse(process.env.GCS_CREDENTIALS || '{}');
  gcsClient = new Storage({
    projectId: credentials.project_id,
    credentials
  });
  console.log('GCS client created successfully for WPQR routes');
} catch (error) {
  console.error('Error initializing GCS client for WPQR routes:', error);
  // Fallback to default credentials if environment variables aren't set
  gcsClient = new Storage();
}

// Get all WPQR documents
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await db.select().from(wpqrDocuments).orderBy(desc(wpqrDocuments.createdAt));
    res.json(result);
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
    const documentId = parseInt(req.params.id);
    const [document] = await db.select().from(wpqrDocuments).where(eq(wpqrDocuments.id, documentId));
    
    if (!document) {
      return res.status(404).json({ error: 'WPQR document not found' });
    }
    
    res.json(document);
  } catch (error) {
    console.error(`Error fetching WPQR document ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new WPQR document with file upload
router.post('/', ensureAuthenticated, upload.single('document'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document file uploaded' });
    }

    // Generate a unique document ID (WPQR-Year-Sequence)
    const currentYear = new Date().getFullYear();
    
    // Get the next sequence number for this year
    const seqResult = await db.execute(sql`
      SELECT COUNT(*) + 1 as next_seq 
      FROM wpqr_documents 
      WHERE document_id LIKE ${`WPQR-${currentYear}-%`}
    `);
    
    const nextSeq = seqResult.rows && seqResult.rows.length > 0 ? 
      parseInt(seqResult.rows[0].next_seq) || 1 : 1;
    
    const documentId = `WPQR-${currentYear}-${nextSeq.toString().padStart(3, '0')}`;
    
    // Upload the file to Google Cloud Storage
    const fileExtension = path.extname(req.file.originalname);
    const gcsFileName = `QMS/WPQR/${documentId}${fileExtension}`;
    const file = gcsClient.bucket(gcsBucketName).file(gcsFileName);
    
    // Upload file to GCS
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      },
    });
    
    // Make the file publicly accessible
    await file.makePublic();
    
    // Get the public URL
    const fileUrl = `https://storage.googleapis.com/${gcsBucketName}/${gcsFileName}`;
    
    // Save document record to database
    const [newDocument] = await db.insert(wpqrDocuments)
      .values({
        documentId,
        title: req.body.title,
        description: req.body.description || null,
        welderProcess: req.body.welderProcess,
        baseMetalGrade: req.body.baseMetalGrade,
        jointType: req.body.jointType,
        filePath: gcsFileName,
        fileUrl,
        status: 'Active',
        createdBy: req.user!.id,
      })
      .returning();
    
    res.status(201).json(newDocument);
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
    const documentId = parseInt(req.params.id);
    const [existingDocument] = await db.select().from(wpqrDocuments).where(eq(wpqrDocuments.id, documentId));
    
    if (!existingDocument) {
      return res.status(404).json({ error: 'WPQR document not found' });
    }
    
    // Check if a new file was uploaded
    let filePath = existingDocument.filePath;
    let fileUrl = existingDocument.fileUrl;
    
    if (req.file) {
      // Upload the new file to Google Cloud Storage
      const fileExtension = path.extname(req.file.originalname);
      const gcsFileName = `QMS/WPQR/${existingDocument.documentId}${fileExtension}`;
      const file = gcsClient.bucket(gcsBucketName).file(gcsFileName);
      
      // Upload file to GCS
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
      });
      
      // Make the file publicly accessible
      await file.makePublic();
      
      // Update file path and URL
      filePath = gcsFileName;
      fileUrl = `https://storage.googleapis.com/${gcsBucketName}/${gcsFileName}`;
    }
    
    // Update document record in database
    const [updatedDocument] = await db.update(wpqrDocuments)
      .set({
        title: req.body.title || existingDocument.title,
        description: req.body.description || existingDocument.description,
        welderProcess: req.body.welderProcess || existingDocument.welderProcess,
        baseMetalGrade: req.body.baseMetalGrade || existingDocument.baseMetalGrade,
        jointType: req.body.jointType || existingDocument.jointType,
        filePath,
        fileUrl,
        status: req.body.status || existingDocument.status,
        updatedAt: new Date(),
      })
      .where(eq(wpqrDocuments.id, documentId))
      .returning();
    
    res.json(updatedDocument);
  } catch (error) {
    console.error(`Error updating WPQR document ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to update WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a WPQR document
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(req.params.id);
    const [existingDocument] = await db.select().from(wpqrDocuments).where(eq(wpqrDocuments.id, documentId));
    
    if (!existingDocument) {
      return res.status(404).json({ error: 'WPQR document not found' });
    }
    
    // Delete file from Google Cloud Storage if it exists
    if (existingDocument.filePath) {
      try {
        await gcsClient.bucket(gcsBucketName).file(existingDocument.filePath).delete();
      } catch (deleteError) {
        console.warn(`Failed to delete file from GCS: ${existingDocument.filePath}`, deleteError);
        // Continue with database deletion even if file deletion fails
      }
    }
    
    // Delete document record from database
    await db.delete(wpqrDocuments).where(eq(wpqrDocuments.id, documentId));
    
    res.status(200).json({ message: 'WPQR document deleted successfully' });
  } catch (error) {
    console.error(`Error deleting WPQR document ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to delete WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Download a WPQR document
router.get('/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(req.params.id);
    const [document] = await db.select().from(wpqrDocuments).where(eq(wpqrDocuments.id, documentId));
    
    if (!document) {
      return res.status(404).json({ error: 'WPQR document not found' });
    }
    
    if (!document.fileUrl) {
      return res.status(404).json({ error: 'Document file not found' });
    }
    
    // Redirect to the file URL for download
    res.redirect(document.fileUrl);
  } catch (error) {
    console.error(`Error downloading WPQR document ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to download WPQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;