import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { gcsStorage } from './utils/gcs-storage';
import { db } from './db';
import { gcsDirectories, projectDocuments, directoryTemplates } from '@shared/schema';
import { eq, and, like } from 'drizzle-orm';
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
   * Get all available directory templates
   * Used by the frontend to show available templates when creating directories
   */
  app.get('/api/storage/templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templates = await db
        .select()
        .from(directoryTemplates)
        .orderBy(directoryTemplates.department, directoryTemplates.subDirectory);
      
      // Group templates by department for easier frontend handling
      const templatesByDepartment = templates.reduce((acc: any, template) => {
        if (!acc[template.department]) {
          acc[template.department] = [];
        }
        
        if (template.subDirectory) {
          acc[template.department].push(template);
        }
        
        return acc;
      }, {});
      
      res.json(templatesByDepartment);
    } catch (error) {
      console.error('Error fetching directory templates:', error);
      res.status(500).json({ error: 'Failed to fetch directory templates' });
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
      
      // 1. Get standard directory templates from directory_templates table
      const templates = await db
        .select()
        .from(directoryTemplates);
      
      // 2. Get custom directories specific to this project from gcs_directories table
      const customDirectories = await db
        .select()
        .from(gcsDirectories)
        .where(
          and(
            eq(gcsDirectories.financialYear, financialYear),
            eq(gcsDirectories.projectCode, projectCode)
          )
        );
      
      console.log(`Found ${templates.length} directory templates and ${customDirectories.length} custom directories`);
      
      // 3. Create a combined directory list with both template-based and custom directories
      const combinedDirectories = [];
      
      // Add template-based directories with the project-specific path
      for (const template of templates) {
        // Build the virtual GCS path for this template in the project context
        let fullPath = path.join(financialYear, projectCode, template.department);
        if (template.subDirectory) {
          fullPath = path.join(fullPath, template.subDirectory);
        }
        fullPath = fullPath.replace(/\\/g, '/'); // Normalize path separators
        
        // Check if an actual custom directory exists for this path
        const customExists = customDirectories.some(dir => dir.fullPath === fullPath);
        
        // If a custom directory already exists, skip the template version
        if (!customExists) {
          combinedDirectories.push({
            id: 0, // Virtual ID for templates that don't exist in GCS yet
            financialYear,
            projectCode,
            department: template.department,
            subDirectory: template.subDirectory,
            fullPath,
            createdBy: req.user?.id || 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            isPublic: template.isPublic,
            isTemplate: true // Mark as template-based
          });
        }
      }
      
      // Add all custom directories (they take precedence over templates)
      combinedDirectories.push(...customDirectories.map(dir => ({
        ...dir,
        isTemplate: false // Mark as custom/actual directory
      })));
      
      // Sort directories by department and then by subDirectory for consistent display
      combinedDirectories.sort((a, b) => {
        if (a.department !== b.department) {
          return a.department.localeCompare(b.department);
        }
        // If subdirectory is null, it should come before any named subdirectory
        if (!a.subDirectory && b.subDirectory) return -1;
        if (a.subDirectory && !b.subDirectory) return 1;
        if (!a.subDirectory && !b.subDirectory) return 0;
        return a.subDirectory!.localeCompare(b.subDirectory!);
      });
      
      res.status(200).json(combinedDirectories);
    } catch (error) {
      console.error('Error fetching directories:', error);
      res.status(500).json({ error: 'Failed to fetch directory structure' });
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
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      // Build the full path with THERMOPAC_PROJECTS prefix
      let fullPath = path.join('THERMOPAC_PROJECTS', financialYear, projectCode, department);
      if (subDirectory) {
        fullPath = path.join(fullPath, subDirectory);
      }
      fullPath = fullPath.replace(/\\/g, '/'); // Normalize path separators
      
      // Check if this directory already exists in our database
      const existingDir = await db
        .select()
        .from(gcsDirectories)
        .where(eq(gcsDirectories.fullPath, fullPath));
      
      if (existingDir.length > 0) {
        return res.status(200).json(existingDir[0]);
      }
      
      // Check if this path matches a template (department + subdirectory)
      const templates = await db
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
      
      const isTemplateDirectory = templates.length > 0;
      
      // Only create the physical directory for custom directories not already in templates
      if (!isTemplateDirectory) {
        // Always create the physical directory in GCS
        const success = await gcsStorage.ensureDirectoryStructure(fullPath);
        if (!success) {
          return res.status(500).json({ error: 'Failed to create directory in GCS' });
        }
      }
      
      // For template directories, we still record the project-specific instance in the database,
      // but we don't need to create the actual GCS directory yet (will be created on first file upload)
      const [newDirectory] = await db
        .insert(gcsDirectories)
        .values({
          financialYear,
          projectCode,
          department,
          subDirectory,
          fullPath,
          createdBy: req.user?.id || 0, // Default to 0 if user id is not available
          isPublic: isTemplateDirectory ? templates[0].isPublic : false,
          updatedAt: new Date()
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
      
      // Use the real GCS implementation
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
      
      // Create storage path
      const storagePath = gcsStorage.buildStoragePath({
        financialYear,
        projectCode,
        department,
        subDirectory,
        fileName,
        contentType
      });
      
      // Generate a real signed URL
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
      
      // Use the real GCS implementation
      const success = await gcsStorage.deleteFile(filePath);
      
      if (!success) {
        return res.status(404).json({ error: 'File not found or deletion failed' });
      }
      
      // Always update database records regardless of environment
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
      
      // Ensure the directory structure exists in GCS
      const dirPath = path.dirname(storagePath);
      
      // First, check for an existing directory record in the database
      const dirComponents = dirPath.split('/');
      
      // Skip the "THERMOPAC_PROJECTS" prefix if it exists
      if (dirComponents.length >= 4 && dirComponents[0] === 'THERMOPAC_PROJECTS') {
        const financialYear = dirComponents[1];
        const projectCode = dirComponents[2];
        const department = dirComponents[3];
        let subDirectory = null;
        
        if (dirComponents.length > 4) {
          subDirectory = dirComponents.slice(4).join('/');
        }
        
        // Look for an existing directory
        const existingDirs = await db
          .select()
          .from(gcsDirectories)
          .where(
            and(
              eq(gcsDirectories.financialYear, financialYear),
              eq(gcsDirectories.projectCode, projectCode),
              eq(gcsDirectories.department, department),
              subDirectory ? eq(gcsDirectories.subDirectory, subDirectory) : eq(gcsDirectories.subDirectory, null as any)
            )
          );
        
        // If no directory record exists, create one (which happens if we're uploading to a template directory)
        if (existingDirs.length === 0) {
          console.log(`Creating directory record for ${dirPath}`);
          
          // Check if it matches a template
          const templates = await db
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
          
          // Create the directory record
          await db
            .insert(gcsDirectories)
            .values({
              financialYear,
              projectCode,
              department,
              subDirectory,
              fullPath: dirPath,
              createdBy: req.user?.id || 0,
              isPublic: templates.length > 0 ? templates[0].isPublic : false,
              updatedAt: new Date()
            });
        }
      }
      
      let document;
      
      // Ensure the physical directory exists in GCS
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
            const [doc] = await db
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
            
            resolve(doc);
          } catch (error) {
            reject(error);
          }
        });
      });
      
      // Write the file to GCS
      stream.end(req.file.buffer);
      
      // Wait for the upload to complete
      document = await streamError;
      
      res.status(201).json(document);
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  return app;
}