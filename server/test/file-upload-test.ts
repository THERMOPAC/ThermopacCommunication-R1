import { Express, Request, Response } from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { getGcsCredentials, bucketName } from '../utils/storage-config';

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Ensure the user is authenticated before allowing access to protected routes
 */
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Allow only Superusers to access GCS test endpoints
  if (req.user!.role !== "Superuser") {
    return res.status(403).json({ error: 'Only Superusers can access GCS test endpoints' });
  }
  
  next();
}

/**
 * File upload test route to diagnose GCS connectivity issues
 */
export function registerFileUploadTestRoutes(app: Express) {
  // Create a GCS client
  const credentials = getGcsCredentials();
  const storage = new Storage({
    credentials,
    projectId: credentials.project_id
  });
  
  const bucket = storage.bucket(bucketName);
  
  // Test file upload endpoint
  app.post(
    '/api/test/file-upload',
    ensureAuthenticated,
    upload.single('file'),
    async (req: Request, res: Response) => {
      console.log('Received test file upload request');
      try {
        console.log('Request user:', req.user ? req.user.username : 'Not authenticated');
        
        if (!req.file) {
          return res.status(400).json({ 
            success: false, 
            error: 'No file uploaded' 
          });
        }

        const { buffer, originalname, mimetype, size } = req.file;
        console.log(`Test file details: ${originalname}, ${mimetype}, size: ${size} bytes`);
        
        // Create a timestamp for the file name to avoid conflicts
        const timestamp = Date.now();
        const fileName = `${timestamp}-${originalname}`;
        const destination = `TEST/file-upload-test/${fileName}`;
        
        // Create a reference to the file in the bucket
        const file = bucket.file(destination);
        
        // Start upload timer
        const uploadStartTime = Date.now();
        
        // Upload the file to GCS
        await file.save(buffer, {
          contentType: mimetype,
          metadata: {
            cacheControl: 'public, max-age=31536000',
          },
        });
        
        // Calculate upload time
        const uploadEndTime = Date.now();
        const uploadTime = uploadEndTime - uploadStartTime;
        
        // Calculate upload speed in KB/s
        const fileSizeKB = size / 1024;
        const uploadTimeSeconds = uploadTime / 1000;
        const uploadSpeed = fileSizeKB / uploadTimeSeconds;
        
        console.log(`Test file successfully uploaded to: ${destination}`);
        
        // Generate a signed URL for the file
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        });
        
        res.status(200).json({
          success: true,
          filePath: destination,
          url,
          fileDetails: {
            name: originalname,
            size,
            type: mimetype
          },
          uploadTime,
          uploadSpeed: `${uploadSpeed.toFixed(2)} KB/s`,
          timestamp
        });
      } catch (error) {
        console.error('Error in test file upload:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to upload test file',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );
  
  console.log('File upload test routes registered');
}