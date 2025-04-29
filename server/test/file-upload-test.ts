import { Request, Response } from 'express';
import multer from 'multer';
import storage from '../utils/storage-config';
import { bucketName } from '../utils/storage-config';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Create middleware to ensure the user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

/**
 * Register all test file upload routes
 */
export function registerFileUploadTestRoutes(app: any) {
  // Test file upload endpoint
  app.post('/api/test/file-upload', 
    ensureAuthenticated,
    upload.single('file'),
    async (req: Request, res: Response) => {
      console.log('Received test file upload request');
      
      try {
        console.log('Request user:', req.user ? req.user.username : 'Not authenticated');
        
        if (!req.file) {
          console.error('No file uploaded in the request');
          return res.status(400).json({ 
            success: false,
            error: 'No file uploaded' 
          });
        }
        
        // Log file details for diagnostic purposes
        const { buffer, originalname, mimetype, size } = req.file;
        console.log(`Test file details: ${originalname}, ${mimetype}, size: ${buffer.length} bytes`);
        
        // Set destination path in GCS
        const timestamp = Date.now();
        const testFilePath = `TEST/file-upload-test/${timestamp}-${originalname}`;
        
        // Upload the file to GCS
        try {
          const file = storage.bucket(bucketName).file(testFilePath);
          
          // Start timer for upload time measurement
          const startTime = Date.now();
          
          // Upload file to GCS
          await file.save(buffer, {
            contentType: mimetype,
            metadata: {
              contentDisposition: `inline; filename="${originalname}"`,
              testUpload: 'true',
              uploadedBy: req.user?.username || 'unknown',
              uploadTimestamp: timestamp.toString()
            }
          });
          
          // Calculate upload time
          const uploadTime = Date.now() - startTime;
          
          // Generate a signed URL for the uploaded file
          const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
          });
          
          console.log(`Test file successfully uploaded to: ${testFilePath}`);
          
          // Return success response with details
          return res.status(200).json({
            success: true,
            filePath: testFilePath,
            url,
            fileDetails: {
              name: originalname,
              size,
              type: mimetype
            },
            uploadTime,
            uploadSpeed: size > 0 ? `${((size / 1024) / (uploadTime / 1000)).toFixed(2)} KB/s` : '0 KB/s',
            timestamp
          });
        } catch (uploadError) {
          console.error('Error uploading test file to GCS:', uploadError);
          return res.status(500).json({
            success: false,
            error: 'Failed to upload file to Google Cloud Storage',
            details: uploadError instanceof Error ? uploadError.message : String(uploadError)
          });
        }
      } catch (error) {
        console.error('Unexpected error in test file upload route:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error during file upload test',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  // Clean up test files (optional endpoint to delete test files to avoid cluttering the bucket)
  app.post('/api/test/clean-test-files',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      try {
        // Only allow superusers to clean up test files
        if (req.user && req.user.role !== 'Superuser') {
          return res.status(403).json({ 
            success: false,
            error: 'Only superusers can clean up test files'
          });
        }

        // Delete files in the test directory
        const [files] = await storage.bucket(bucketName).getFiles({
          prefix: 'TEST/file-upload-test/'
        });

        console.log(`Found ${files.length} test files to delete`);

        // Delete each file
        if (files.length > 0) {
          await Promise.all(files.map(file => file.delete()));
          console.log(`Deleted ${files.length} test files`);
        }

        return res.status(200).json({
          success: true,
          message: `Deleted ${files.length} test files`,
          count: files.length
        });
      } catch (error) {
        console.error('Error cleaning up test files:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to clean up test files',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  console.log('File upload test routes registered');
}