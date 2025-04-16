import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { gcsStorage } from './utils/gcs-storage';
import { db } from './db';
import * as schema from '@shared/schema';
import { gcsDirectories, projectDocuments, directoryTemplates, masterItems } from '@shared/schema';
import { eq, and, like } from 'drizzle-orm';

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
   * Get all available directory templates
   * Used by the frontend to show available templates when creating directories
   */
  app.get('/api/storage/templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templates = await db
        .select()
        .from(directoryTemplates)
        .orderBy(directoryTemplates.department, directoryTemplates.subDirectory);
      
      res.status(200).json(templates);
    } catch (error) {
      console.error('Error getting directory templates:', error);
      res.status(500).json({ error: 'Failed to get directory templates' });
    }
  });

  /**
   * Get project directory structure
   * Returns the directory tree for a project based on financial year and project code
   * Combines standard templates with project-specific custom directories
   */
  app.get('/api/storage/directories/:financialYear/:projectCode', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { financialYear, projectCode } = req.params;
      
      if (!financialYear || !projectCode) {
        return res.status(400).json({ error: 'Financial year and project code are required' });
      }
      
      // Get all templates
      const templates = await db
        .select()
        .from(directoryTemplates);
      
      // Get all project-specific directories 
      const projectDirs = await db
        .select()
        .from(gcsDirectories)
        .where(
          and(
            eq(gcsDirectories.financialYear, financialYear),
            eq(gcsDirectories.projectCode, projectCode)
          )
        );
      
      // Combine templates with project directories
      const allDirectories = [
        ...templates.map(template => ({
          ...template,
          financialYear,
          projectCode,
          // Add template flag for frontend to identify
          isTemplate: true,
          // Compute the full path for the template
          fullPath: template.subDirectory
            ? `${financialYear}/${projectCode}/${template.department}/${template.subDirectory}`
            : `${financialYear}/${projectCode}/${template.department}`
        })),
        
        // Include project-specific directories (these override templates)
        ...projectDirs
      ];
      
      res.status(200).json(allDirectories);
    } catch (error) {
      console.error('Error getting project directories:', error);
      res.status(500).json({ error: 'Failed to get project directories' });
    }
  });

  /**
   * Create a new directory in GCS
   * Creates a directory in the specified path
   * Only creates physical directories for custom paths not in templates
   */
  app.post('/api/storage/directories', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { financialYear, projectCode, department, subDirectory } = req.body;
      
      if (!financialYear || !projectCode || !department) {
        return res.status(400).json({ error: 'Financial year, project code, and department are required' });
      }
      
      // Build the GCS path
      let fullPath = `${financialYear}/${projectCode}/${department}`;
      if (subDirectory) {
        fullPath += `/${subDirectory}`;
      }
      
      // Check if this is a template directory 
      const templateCheck = await db
        .select()
        .from(directoryTemplates)
        .where(
          and(
            eq(directoryTemplates.department, department),
            subDirectory 
              ? eq(directoryTemplates.subDirectory, subDirectory) 
              : eq(directoryTemplates.subDirectory, null as any)
          )
        );
      
      const isTemplateDir = templateCheck.length > 0;
      
      // Check if directory already exists in database
      const existingDirs = await db
        .select()
        .from(gcsDirectories)
        .where(eq(gcsDirectories.fullPath, fullPath));
      
      if (existingDirs.length > 0) {
        return res.status(200).json(existingDirs[0]);
      }
      
      // If not a template, create the physical directory
      if (!isTemplateDir) {
        const dirCreated = await gcsStorage.createDirectory(fullPath);
        if (!dirCreated) {
          return res.status(500).json({ error: 'Failed to create directory' });
        }
      }
      
      // Add to our database regardless
      const [newDir] = await db
        .insert(gcsDirectories)
        .values({
          financialYear,
          projectCode,
          department,
          subDirectory,
          fullPath,
          createdBy: req.user?.id || 0,
          isPublic: isTemplateDir ? templateCheck[0].isPublic : false,
          updatedAt: new Date()
        })
        .returning();
      
      res.status(201).json(newDir);
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
   * Simple endpoint for finding drawings by drawing number
   * Uses a direct approach scanning all files in the bucket
   */
  app.get('/api/storage/drawings', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingNo = req.query.drawingNo as string;
      
      if (!drawingNo) {
        return res.status(400).json({ error: 'Drawing number is required' });
      }
      
      console.log(`[DRAWING-SIMPLE] Looking for drawings with number: ${drawingNo}`);
            
      // Import storage module directly 
      const storageModule = await import('./utils/storage-config');
      const bucketName = storageModule.bucketName;
      const storage = storageModule.default;
      const bucket = storage.bucket(bucketName);
      
      // Get all files in the bucket
      console.log(`[DRAWING-SIMPLE] Getting all files from bucket: ${bucketName}`);
      const [allFiles] = await bucket.getFiles();
      
      console.log(`[DRAWING-SIMPLE] Found ${allFiles.length} total files in bucket`);
      
      // Filter to only include relevant drawing files
      const matchingFiles = allFiles.filter(file => {
        const filePath = file.name;
        const fileName = filePath.split('/').pop() || '';
        
        // Skip non-drawing files (not PDF, DWG, DXF)
        if (!filePath.toLowerCase().endsWith('.pdf') && 
            !filePath.toLowerCase().endsWith('.dwg') && 
            !filePath.toLowerCase().endsWith('.dxf')) {
          return false;
        }
        
        // Check if the drawing number appears anywhere in the path
        const filePathLower = filePath.toLowerCase();
        const drawingNoLower = drawingNo.toLowerCase();
        
        return filePathLower.includes(drawingNoLower);
      });
      
      console.log(`[DRAWING-SIMPLE] Found ${matchingFiles.length} matching drawing files for ${drawingNo}`);
      
      // Map the files to a standard format
      const processedFiles = matchingFiles.map(file => {
        const filePath = file.name;
        const fileName = filePath.split('/').pop() || '';
        
        return {
          name: fileName,
          path: filePath,
          contentType: file.metadata.contentType || 'application/pdf',
          size: file.metadata.size || 0,
          updated: file.metadata.updated || new Date().toISOString(),
          created: file.metadata.timeCreated || new Date().toISOString(),
          isDirectory: false
        };
      });
      
      return res.status(200).json(processedFiles);
    } catch (error) {
      console.error('[DRAWING-SIMPLE] Error finding drawings:', error);
      res.status(500).json({ error: 'Failed to find drawings' });
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
      
      // Create storage path
      const storagePath = gcsStorage.buildStoragePath({
        financialYear,
        projectCode,
        department,
        subDirectory,
        fileName,
        contentType
      });
      
      // Generate a signed URL
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
      
      // Generate a signed URL for downloading
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
      
      // Delete the file
      const success = await gcsStorage.deleteFile(filePath);
      
      if (!success) {
        return res.status(404).json({ error: 'File not found or deletion failed' });
      }
      
      // Update database records
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

  return app;
}