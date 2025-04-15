// Server-side routes for engineering change management
import { Router, Request, Response } from 'express';
import { db } from './db';
import { 
  engineeringChangeRequests, 
  engineeringChangeNotices, 
  changeDocuments,
  insertEcrSchema,
  insertEcnSchema,
  insertChangeDocumentSchema
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import multer from 'multer';
import { gcsStorage } from './utils/gcs-storage';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import gcsClient, { bucketName } from './utils/storage-config';

// Helper functions for file handling
function generateUniqueFileName(originalName: string): string {
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  return `${baseName}_${Date.now()}_${uuidv4().slice(0, 8)}${extension}`;
}

async function uploadFile(buffer: Buffer, filePath: string, contentType: string) {
  const bucket = gcsClient.bucket(bucketName);
  const file = bucket.file(filePath);
  
  await file.save(buffer, {
    contentType,
    metadata: {
      contentType,
    },
  });
  
  // Create a public URL for the file
  const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
  
  return {
    path: filePath,
    publicUrl
  };
}

// Multer setup for file uploads
const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

// Role-based access control
function canManage(role: string): boolean {
  return ['Superuser', 'General Manager', 'Senior Manager', 'Manager'].includes(role);
}

// Set up ECR and ECN routes
export function setupEngineeringChangeRoutes(app: Router) {
  /**
   * Get ECRs for a specific master item
   */
  app.get('/api/ecr/item/:itemId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      
      const results = await db.select()
        .from(engineeringChangeRequests)
        .where(eq(engineeringChangeRequests.item_id, itemId))
        .orderBy(engineeringChangeRequests.created_at);
      
      res.status(200).json(results);
    } catch (error) {
      console.error('Error fetching ECRs:', error);
      res.status(500).json({ error: 'Failed to fetch ECRs' });
    }
  });
  
  /**
   * Get ECNs for a specific master item
   */
  app.get('/api/ecn/item/:itemId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      
      const results = await db.select()
        .from(engineeringChangeNotices)
        .where(eq(engineeringChangeNotices.item_id, itemId))
        .orderBy(engineeringChangeNotices.created_at);
      
      res.status(200).json(results);
    } catch (error) {
      console.error('Error fetching ECNs:', error);
      res.status(500).json({ error: 'Failed to fetch ECNs' });
    }
  });
  
  /**
   * Get a single ECR by ID
   */
  app.get('/api/ecr/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const ecrId = parseInt(req.params.id);
      
      const [result] = await db.select()
        .from(engineeringChangeRequests)
        .where(eq(engineeringChangeRequests.id, ecrId));
        
      if (!result) {
        return res.status(404).json({ error: 'ECR not found' });
      }
      
      // Get related documents
      const documents = await db.select()
        .from(changeDocuments)
        .where(eq(changeDocuments.ecr_id, ecrId));
      
      res.status(200).json({
        ...result,
        documents
      });
    } catch (error) {
      console.error('Error fetching ECR:', error);
      res.status(500).json({ error: 'Failed to fetch ECR' });
    }
  });
  
  /**
   * Get a single ECN by ID
   */
  app.get('/api/ecn/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const ecnId = parseInt(req.params.id);
      
      const [result] = await db.select()
        .from(engineeringChangeNotices)
        .where(eq(engineeringChangeNotices.id, ecnId));
        
      if (!result) {
        return res.status(404).json({ error: 'ECN not found' });
      }
      
      // Get related documents
      const documents = await db.select()
        .from(changeDocuments)
        .where(eq(changeDocuments.ecn_id, ecnId));
      
      res.status(200).json({
        ...result,
        documents
      });
    } catch (error) {
      console.error('Error fetching ECN:', error);
      res.status(500).json({ error: 'Failed to fetch ECN' });
    }
  });
  
  /**
   * Create a new ECR
   */
  app.post('/api/ecr', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to create an ECR' });
      }
      
      // Generate a unique document number with prefix ECR
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const documentNumber = `ECR-${year}${month}-${Math.floor(1000 + Math.random() * 9000)}`;
      
      // Parse and validate input
      const validatedData = insertEcrSchema.parse({
        ...req.body,
        document_number: documentNumber,
        requested_by: req.user.id,
        requested_date: new Date(),
        status: 'Draft',
        created_at: new Date(),
        updated_at: new Date()
      });
      
      // Insert the ECR
      const [createdEcr] = await db.insert(engineeringChangeRequests)
        .values(validatedData)
        .returning();
      
      res.status(201).json(createdEcr);
    } catch (error) {
      console.error('Error creating ECR:', error);
      res.status(500).json({ error: 'Failed to create ECR' });
    }
  });
  
  /**
   * Create a new ECN
   */
  app.post('/api/ecn', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to create an ECN' });
      }
      
      // Generate a unique document number with prefix ECN
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const documentNumber = `ECN-${year}${month}-${Math.floor(1000 + Math.random() * 9000)}`;
      
      // Parse and validate input
      const validatedData = insertEcnSchema.parse({
        ...req.body,
        document_number: documentNumber,
        issued_by: req.user.id,
        issued_date: new Date(),
        status: 'Draft',
        created_at: new Date(),
        updated_at: new Date()
      });
      
      // Insert the ECN
      const [createdEcn] = await db.insert(engineeringChangeNotices)
        .values(validatedData)
        .returning();
      
      res.status(201).json(createdEcn);
    } catch (error) {
      console.error('Error creating ECN:', error);
      res.status(500).json({ error: 'Failed to create ECN' });
    }
  });
  
  /**
   * Update an ECR
   */
  app.put('/api/ecr/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to update an ECR' });
      }
      
      const ecrId = parseInt(req.params.id);
      
      // Get the existing ECR
      const [existingEcr] = await db.select()
        .from(engineeringChangeRequests)
        .where(eq(engineeringChangeRequests.id, ecrId));
        
      if (!existingEcr) {
        return res.status(404).json({ error: 'ECR not found' });
      }
      
      // Update the ECR
      const [updatedEcr] = await db.update(engineeringChangeRequests)
        .set({
          ...req.body,
          updated_at: new Date()
        })
        .where(eq(engineeringChangeRequests.id, ecrId))
        .returning();
      
      res.status(200).json(updatedEcr);
    } catch (error) {
      console.error('Error updating ECR:', error);
      res.status(500).json({ error: 'Failed to update ECR' });
    }
  });
  
  /**
   * Update an ECN
   */
  app.put('/api/ecn/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to update an ECN' });
      }
      
      const ecnId = parseInt(req.params.id);
      
      // Get the existing ECN
      const [existingEcn] = await db.select()
        .from(engineeringChangeNotices)
        .where(eq(engineeringChangeNotices.id, ecnId));
        
      if (!existingEcn) {
        return res.status(404).json({ error: 'ECN not found' });
      }
      
      // Update the ECN
      const [updatedEcn] = await db.update(engineeringChangeNotices)
        .set({
          ...req.body,
          updated_at: new Date()
        })
        .where(eq(engineeringChangeNotices.id, ecnId))
        .returning();
      
      res.status(200).json(updatedEcn);
    } catch (error) {
      console.error('Error updating ECN:', error);
      res.status(500).json({ error: 'Failed to update ECN' });
    }
  });
  
  /**
   * Delete an ECR
   */
  app.delete('/api/ecr/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete an ECR' });
      }
      
      const ecrId = parseInt(req.params.id);
      
      // Delete associated documents first
      await db.delete(changeDocuments)
        .where(eq(changeDocuments.ecr_id, ecrId));
      
      // Delete the ECR
      await db.delete(engineeringChangeRequests)
        .where(eq(engineeringChangeRequests.id, ecrId));
      
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting ECR:', error);
      res.status(500).json({ error: 'Failed to delete ECR' });
    }
  });
  
  /**
   * Delete an ECN
   */
  app.delete('/api/ecn/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete an ECN' });
      }
      
      const ecnId = parseInt(req.params.id);
      
      // Delete associated documents first
      await db.delete(changeDocuments)
        .where(eq(changeDocuments.ecn_id, ecnId));
      
      // Delete the ECN
      await db.delete(engineeringChangeNotices)
        .where(eq(engineeringChangeNotices.id, ecnId));
      
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting ECN:', error);
      res.status(500).json({ error: 'Failed to delete ECN' });
    }
  });
  
  /**
   * Upload a document for an ECR
   */
  app.post('/api/ecr/:id/documents', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to upload documents' });
      }
      
      const ecrId = parseInt(req.params.id);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Get the ECR
      const [ecr] = await db.select()
        .from(engineeringChangeRequests)
        .where(eq(engineeringChangeRequests.id, ecrId));
        
      if (!ecr) {
        return res.status(404).json({ error: 'ECR not found' });
      }
      
      // Upload the file to GCS
      const fileName = generateUniqueFileName(file.originalname);
      const storagePath = `engineering_changes/ecr/${ecrId}/${fileName}`;
      
      const uploadedFile = await uploadFile(
        file.buffer,
        storagePath,
        file.mimetype
      );
      
      // Create a document record
      const [document] = await db.insert(changeDocuments)
        .values({
          ecr_id: ecrId,
          document_type: req.body.documentType || 'Drawing',
          document_name: file.originalname,
          document_path: storagePath,
          uploaded_by: req.user.id,
          uploaded_at: new Date(),
          storage_path: storagePath,
          storage_url: uploadedFile.publicUrl
        })
        .returning();
      
      res.status(201).json(document);
    } catch (error) {
      console.error('Error uploading ECR document:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });
  
  /**
   * Upload a document for an ECN
   */
  app.post('/api/ecn/:id/documents', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to upload documents' });
      }
      
      const ecnId = parseInt(req.params.id);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Get the ECN
      const [ecn] = await db.select()
        .from(engineeringChangeNotices)
        .where(eq(engineeringChangeNotices.id, ecnId));
        
      if (!ecn) {
        return res.status(404).json({ error: 'ECN not found' });
      }
      
      // Upload the file to GCS
      const fileName = generateUniqueFileName(file.originalname);
      const storagePath = `engineering_changes/ecn/${ecnId}/${fileName}`;
      
      const uploadedFile = await uploadFile(
        file.buffer,
        storagePath,
        file.mimetype
      );
      
      // Create a document record
      const [document] = await db.insert(changeDocuments)
        .values({
          ecn_id: ecnId,
          document_type: req.body.documentType || 'Drawing',
          document_name: file.originalname,
          document_path: storagePath,
          uploaded_by: req.user.id,
          uploaded_at: new Date(),
          storage_path: storagePath,
          storage_url: uploadedFile.publicUrl
        })
        .returning();
      
      res.status(201).json(document);
    } catch (error) {
      console.error('Error uploading ECN document:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });
  
  /**
   * Get a document download URL
   */
  app.get('/api/engineering-changes/documents/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      
      // Get the document
      const [document] = await db.select()
        .from(changeDocuments)
        .where(eq(changeDocuments.id, documentId));
        
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Create a signed URL for downloading
      // You'll need to implement this function in your GCS storage utils
      const downloadUrl = document.storage_url;
      
      res.status(200).json({ downloadUrl });
    } catch (error) {
      console.error('Error getting document download URL:', error);
      res.status(500).json({ error: 'Failed to get document download URL' });
    }
  });
  
  /**
   * Delete a document
   */
  app.delete('/api/engineering-changes/documents/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete documents' });
      }
      
      const documentId = parseInt(req.params.id);
      
      // Get the document
      const [document] = await db.select()
        .from(changeDocuments)
        .where(eq(changeDocuments.id, documentId));
        
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Delete the document from the database
      await db.delete(changeDocuments)
        .where(eq(changeDocuments.id, documentId));
      
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });
}