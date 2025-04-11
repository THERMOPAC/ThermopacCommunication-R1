import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { gcsStorage } from './utils/gcs-storage';
import { db } from './db';
import { gcsDirectories, projectDocuments } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import path from 'path';

// We'll use the standard Request type from Express
// which will be augmented by multer to include the file property

// Configure multer for memory storage (we're not saving files to disk)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB file size limit
  }
});

// Auth middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'You must be logged in to access this resource' });
}

/**
 * Setup file storage routes
 */
export function setupFileStorageRoutes(app: Router) {
  /**
   * Get project directory structure
   * Returns the directory tree for a project based on financial year and project code
   */
  app.get('/api/storage/directories/:financialYear/:projectCode', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { financialYear, projectCode } = req.params;
      
      // Get all directories for this project from the database
      const directories = await db
        .select()
        .from(gcsDirectories)
        .where(
          and(
            eq(gcsDirectories.financialYear, financialYear),
            eq(gcsDirectories.projectCode, projectCode)
          )
        );
      
      res.status(200).json(directories);
    } catch (error) {
      console.error('Error fetching directories:', error);
      res.status(500).json({ error: 'Failed to fetch directory structure' });
    }
  });

  /**
   * Create a new directory in GCS
   * Creates a directory in the specified path
   */
  app.post('/api/storage/directories', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { financialYear, projectCode, department, subDirectory } = req.body;
      
      if (!financialYear || !projectCode || !department) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      // Build the full path
      let fullPath = path.join(financialYear, projectCode, department);
      if (subDirectory) {
        fullPath = path.join(fullPath, subDirectory);
      }
      fullPath = fullPath.replace(/\\/g, '/'); // Normalize path separators
      
      // Ensure the directory exists in GCS by creating a placeholder
      const success = await gcsStorage.ensureDirectoryStructure(fullPath);
      if (!success) {
        return res.status(500).json({ error: 'Failed to create directory in GCS' });
      }
      
      // Check if this directory already exists in our database
      const existingDir = await db
        .select()
        .from(gcsDirectories)
        .where(eq(gcsDirectories.fullPath, fullPath));
      
      if (existingDir.length > 0) {
        return res.status(200).json(existingDir[0]);
      }
      
      // Store the directory in our database
      const [newDirectory] = await db
        .insert(gcsDirectories)
        .values({
          financialYear,
          projectCode,
          department,
          subDirectory,
          fullPath,
          createdBy: req.user?.id || 0, // Default to 0 if user id is not available
          isPublic: false
        })
        .returning();
      
      res.status(201).json(newDirectory);
    } catch (error) {
      console.error('Error creating directory:', error);
      res.status(500).json({ error: 'Failed to create directory' });
    }
  });

  /**
   * List files in a directory
   * Returns all files in the specified directory path
   */
  app.get('/api/storage/files', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { path } = req.query;
      
      if (!path) {
        return res.status(400).json({ error: 'Path parameter is required' });
      }
      
      const files = await gcsStorage.listFiles(path as string);
      res.status(200).json(files);
    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  /**
   * Generate upload URL for a file
   * Creates a signed URL for direct browser-to-GCS upload
   */
  app.post('/api/storage/upload-url', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { 
        financialYear, 
        projectCode, 
        department, 
        subDirectory, 
        fileName, 
        contentType 
      } = req.body;
      
      if (!financialYear || !projectCode || !department || !fileName || !contentType) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      // Generate a signed URL for uploading the file
      const signedUrl = await gcsStorage.generateUploadSignedUrl({
        financialYear,
        projectCode,
        department,
        subDirectory,
        fileName,
        contentType
      });
      
      if (!signedUrl) {
        return res.status(500).json({ error: 'Failed to generate upload URL' });
      }
      
      // Calculate the storage path
      const storagePath = gcsStorage.buildStoragePath({
        financialYear,
        projectCode,
        department,
        subDirectory,
        fileName,
        contentType
      });
      
      res.status(200).json({ 
        signedUrl, 
        storagePath,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  /**
   * Generate download URL for a file
   * Creates a signed URL for secure file download
   */
  app.get('/api/storage/download-url', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { filePath, expirationMinutes } = req.query;
      
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }
      
      // Generate a signed URL for downloading the file
      const signedUrl = await gcsStorage.generateDownloadSignedUrl({
        filePath: filePath as string,
        expirationMinutes: expirationMinutes ? parseInt(expirationMinutes as string) : undefined
      });
      
      if (!signedUrl) {
        return res.status(404).json({ error: 'File not found or URL generation failed' });
      }
      
      res.status(200).json({ 
        downloadUrl: signedUrl,
        expiresAt: new Date(Date.now() + (parseInt(expirationMinutes as string) || 15) * 60 * 1000)
      });
    } catch (error) {
      console.error('Error generating download URL:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  /**
   * Delete a file from GCS
   */
  app.delete('/api/storage/files', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }
      
      // Delete the file from GCS
      const success = await gcsStorage.deleteFile(filePath);
      
      if (!success) {
        return res.status(404).json({ error: 'File not found or deletion failed' });
      }
      
      // Also remove any database records that reference this file
      await db
        .update(projectDocuments)
        .set({ storagePath: null, storageUrl: null, storageUrlExpiry: null })
        .where(eq(projectDocuments.storagePath, filePath));
      
      res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  /**
   * Upload a file directly to the server and then to GCS
   * For cases where direct browser-to-GCS upload isn't feasible
   */
  app.post('/api/storage/upload', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const { 
        financialYear, 
        projectCode, 
        department, 
        subDirectory, 
        projectId,
        phaseId,
        description,
        type,
        isPublic
      } = req.body;
      
      if (!financialYear || !projectCode || !department || !projectId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      // Calculate the storage path
      const fileName = req.file.originalname;
      const storagePath = gcsStorage.buildStoragePath({
        financialYear,
        projectCode,
        department,
        subDirectory,
        fileName,
        contentType: req.file.mimetype
      });
      
      // Ensure the directory structure exists
      const dirPath = path.dirname(storagePath);
      await gcsStorage.ensureDirectoryStructure(dirPath);
      
      // Create the file in GCS
      const bucket = await import('./utils/storage-config').then(module => module.default.bucket(module.bucketName));
      const file = bucket.file(storagePath);
      
      // Create a write stream to upload the file
      const stream = file.createWriteStream({
        metadata: {
          contentType: req.file.mimetype
        }
      });
      
      // Handle stream errors
      const streamError = new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          console.error('Stream error:', error);
          reject(error);
        });
        
        stream.on('finish', async () => {
          try {
            // Generate a temporary download URL
            const downloadUrl = await gcsStorage.generateDownloadSignedUrl({
              filePath: storagePath,
              expirationMinutes: 60 // 1 hour
            });
            
            // Create a document record in the database
            const [document] = await db
              .insert(projectDocuments)
              .values({
                projectId: parseInt(projectId),
                phaseId: phaseId ? parseInt(phaseId) : undefined,
                name: fileName,
                description: description || '',
                type: type || 'document',
                url: downloadUrl || '',
                uploadedBy: req.user?.id as number,
                size: req.file?.size || 0,
                format: path.extname(fileName).replace('.', ''),
                isPublic: isPublic === 'true',
                storagePath,
                storageUrl: downloadUrl || null,
                storageUrlExpiry: downloadUrl ? new Date(Date.now() + 60 * 60 * 1000) : null // 1 hour
              })
              .returning();
            
            resolve(document);
          } catch (error) {
            reject(error);
          }
        });
      });
      
      // Write the file to GCS
      stream.end(req.file.buffer);
      
      // Wait for the upload to complete
      const document = await streamError;
      
      res.status(201).json(document);
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  return app;
}