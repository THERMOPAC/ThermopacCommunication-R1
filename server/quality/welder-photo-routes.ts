import express, { Request, Response } from 'express';
import multer from 'multer';
import { uploadWelderPhoto, getWelderPhotoUrl } from '../utils/welder-photo-upload';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  }
});

// Auth middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

// Register routes
export function registerWelderPhotoRoutes(app: any) {
  // Verify GCS credentials endpoint
  app.get('/api/test/gcs-credentials', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const credentialsStr = process.env.GOOGLE_CLOUD_CREDENTIALS;
      
      if (!credentialsStr) {
        return res.status(500).json({
          success: false,
          error: 'GOOGLE_CLOUD_CREDENTIALS environment variable is not set'
        });
      }
      
      // Check if it's a valid JSON string
      try {
        const credentials = JSON.parse(credentialsStr);
        
        // Return a redacted version of the credentials
        return res.status(200).json({
          success: true,
          credentialsLength: credentialsStr.length,
          hasRequiredFields: {
            type: !!credentials.type,
            project_id: !!credentials.project_id,
            client_email: !!credentials.client_email,
            private_key: !!credentials.private_key,
          },
          isValidServiceAccount: credentials.type === 'service_account',
          redactedInfo: {
            type: credentials.type,
            project_id: credentials.project_id,
            client_email: credentials.client_email,
            private_key_id: credentials.private_key_id ? 
              `${credentials.private_key_id.substring(0, 4)}...${credentials.private_key_id.substring(credentials.private_key_id.length - 4)}` : 
              'Not present',
            private_key: credentials.private_key ? 
              `${credentials.private_key.substring(0, 15)}...${credentials.private_key.substring(credentials.private_key.length - 15)}` : 
              'Not present'
          }
        });
      } catch (parseError) {
        return res.status(500).json({
          success: false,
          error: 'GOOGLE_CLOUD_CREDENTIALS is not valid JSON',
          credentialsLength: credentialsStr.length,
          firstChars: credentialsStr.substring(0, 20) + '...'
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Error checking GCS credentials',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Simple GCS connectivity test endpoint
  app.get('/api/test/gcs-connectivity', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Import storage configuration using ES modules
      const { default: storage, bucketName } = await import('../utils/storage-config');
      
      console.log(`Testing GCS connectivity to bucket: ${bucketName}`);
      
      // Check if the bucket exists
      const [exists] = await storage.bucket(bucketName).exists();
      
      // Try to list files (requires list permission)
      let canListFiles = false;
      let filesList: any[] = [];
      try {
        [filesList] = await storage.bucket(bucketName).getFiles({ maxResults: 5 });
        canListFiles = true;
      } catch (listError) {
        console.error('Error listing files in bucket:', listError);
      }
      
      // Create a test file (requires write permission)
      let canWrite = false;
      const testFileName = `test-file-${Date.now()}.txt`;
      try {
        const file = storage.bucket(bucketName).file(testFileName);
        await file.save('Test file for GCS connectivity check', {
          contentType: 'text/plain',
        });
        canWrite = true;
        
        // Delete the test file immediately
        try {
          await file.delete();
        } catch (deleteError) {
          console.warn('Could not delete test file, but write test passed:', deleteError);
        }
      } catch (writeError) {
        console.error('Error writing test file to bucket:', writeError);
      }
      
      return res.status(200).json({
        success: true,
        bucketExists: exists,
        canListFiles,
        numFiles: filesList.length,
        sampleFiles: filesList.slice(0, 3).map((f: any) => f.name),
        canWrite,
        bucketName,
        permissions: {
          read: exists,
          list: canListFiles,
          write: canWrite
        }
      });
    } catch (error) {
      console.error('Error testing GCS connectivity:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to test GCS connectivity',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Upload welder photo
  app.post('/api/upload/welder-photo', 
    ensureAuthenticated,
    upload.single('file'),
    async (req: Request, res: Response) => {
      console.log('Received welder photo upload request');
      try {
        console.log('Request user:', req.user ? req.user.username : 'Not authenticated');
        console.log('Request body keys:', Object.keys(req.body));
        console.log('Request body welderId:', req.body.welderId);
        console.log('Request body welderCode:', req.body.welderCode);
        console.log('Request file:', req.file ? {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        } : 'No file in request');
        
        if (!req.file) {
          console.error('No file uploaded in the request');
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { buffer, originalname, mimetype } = req.file;
        console.log(`File details: ${originalname}, ${mimetype}, size: ${buffer.length} bytes`);
        
        // Get the welder ID - check if it's in the welderCode or welderId field
        let welderId = '';
        if (req.body.welderId) {
          welderId = req.body.welderId;
          console.log(`Using welderId from request body: ${welderId}`);
        } else if (req.body.welderCode) {
          welderId = req.body.welderCode;
          console.log(`Using welderCode from request body: ${welderId}`);
        } else {
          console.error('No welder ID provided in the request body');
          return res.status(400).json({ error: 'Welder ID is required for photo upload' });
        }
        
        console.log(`Processing photo upload for welder ID: ${welderId}`);

        // Upload the file to GCS
        console.log(`Calling uploadWelderPhoto with params: originalname=${originalname}, mimetype=${mimetype}, welderId=${welderId}`);
        
        let result;
        try {
          result = await uploadWelderPhoto(
            buffer,
            originalname,
            mimetype,
            welderId
          );
        } catch (uploadError) {
          console.error('Uncaught error in uploadWelderPhoto:', uploadError);
          return res.status(500).json({ 
            error: 'Unexpected error in file upload process',
            details: uploadError instanceof Error ? uploadError.message : String(uploadError)
          });
        }

        if (!result.success) {
          console.error('Upload failed with error:', result.error);
          return res.status(500).json({ 
            error: 'Failed to upload photo', 
            details: result.error 
          });
        }

        // If a welder ID was provided, update the welder record with the photo path
        if (welderId && welderId.trim() !== '') {
          try {
            // First approach - try to parse welderId as number (numeric database ID)
            const welderDbId = parseInt(welderId);
            
            if (!isNaN(welderDbId)) {
              // It's a numeric ID, directly update the record
              console.log(`Attempting to update photoPath in database for numeric ID: ${welderDbId}, path: ${result.filePath}`);
              
              const updateResult = await db.update(schema.welders)
                .set({ photoPath: result.filePath })
                .where(eq(schema.welders.id, welderDbId));
                
              console.log(`Direct update result:`, updateResult);
            } else if (welderId.startsWith('W-')) {
              // It's a welder code like "W-001", try to find by welderId field
              console.log(`Attempting to update photoPath for welder code: ${welderId}, path: ${result.filePath}`);
              
              // Query to find the welder record by welderId field
              const welders = await db.select()
                .from(schema.welders)
                .where(eq(schema.welders.welderId, welderId));
              
              if (welders.length > 0) {
                const welder = welders[0];
                console.log(`Found welder with code ${welderId}, database ID: ${welder.id}`);
                
                // Update the record using the numeric ID
                const updateResult = await db.update(schema.welders)
                  .set({ photoPath: result.filePath })
                  .where(eq(schema.welders.id, welder.id));
                  
                console.log(`Update by code result:`, updateResult);
              } else {
                console.error(`No welder found with code: ${welderId}`);
              }
            } else {
              console.error(`Unable to process welder ID format for database update: ${welderId}`);
            }
          } catch (dbError) {
            console.error('Error updating welder record with photo path:', dbError);
            // Continue even if update fails, as we still want to return the upload result
          }
        }

        res.status(200).json({
          success: true,
          path: result.filePath,
          url: result.url
        });
      } catch (error) {
        console.error('Error in welder photo upload route:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Get welder photo URL
  app.get('/api/welder-photos/:welderId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const welderId = parseInt(req.params.welderId);
      
      if (isNaN(welderId)) {
        return res.status(400).json({ error: 'Invalid welder ID' });
      }
      
      // Get the welder from the database
      const [welder] = await db.select().from(schema.welders).where(eq(schema.welders.id, welderId));
      
      if (!welder) {
        return res.status(404).json({ error: 'Welder not found' });
      }
      
      if (!welder.photoPath) {
        return res.status(404).json({ error: 'No photo available for this welder' });
      }
      
      // Generate a signed URL for the photo
      const photoUrl = await getWelderPhotoUrl(welder.photoPath);
      
      if (!photoUrl) {
        return res.status(404).json({ error: 'Photo file not found or inaccessible' });
      }
      
      res.status(200).json({ url: photoUrl });
    } catch (error) {
      console.error('Error getting welder photo URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  console.log('Welder photo routes registered');
}