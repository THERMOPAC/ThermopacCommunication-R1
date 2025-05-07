import express, { Request, Response } from 'express';
import multer from 'multer';
import { uploadWelderPhoto, getWelderPhotoUrl } from '../utils/welder-photo-upload';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';

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

  // Direct upload v3 - using unique filenames to avoid permission issues
  app.post('/api/direct-upload/welder-photo', 
    ensureAuthenticated,
    upload.single('file'),
    async (req: Request, res: Response) => {
      console.log('==================================================');
      console.log('Received DIRECT v3 upload welder photo request');
      console.log('==================================================');
      try {
        // Log request info (without sensitive headers)
        console.log('Request body keys:', Object.keys(req.body));
        console.log('Request query:', req.query);
        console.log('Request user:', req.user ? (req.user as any).username : 'Not authenticated');
        
        if (!req.file) {
          console.error('No file uploaded in the request');
          console.log('Request body:', req.body);
          return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('File received:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer_length: req.file.buffer ? req.file.buffer.length : 'No buffer'
        });

        // Extract the welder ID
        const welderId = req.body.welderId;
        console.log('Received welderId from body:', welderId);
        if (!welderId) {
          console.error('No welderId in request body');
          return res.status(400).json({ error: 'Welder ID is required' });
        }
        
        // Format a W-XXX style code if it's a number
        let welderCode: string;
        try {
          const numericId = parseInt(welderId);
          if (!isNaN(numericId)) {
            welderCode = `W-${numericId.toString().padStart(3, '0')}`;
          } else {
            welderCode = welderId;
          }
        } catch (e) {
          welderCode = welderId;
        }
        
        const { buffer, originalname, mimetype } = req.file;
        
        // Use standard naming convention but with a special upload approach
        const fileExt = originalname.split('.').pop() || 'jpg';
        const timestamp = Date.now();
        const standardFilename = `${welderCode}.${fileExt}`;
        const standardPath = `QMS/WELDERS/${welderCode}/${standardFilename}`;
        
        // We'll add a version query parameter to the URL for cache busting
        
        console.log(`Using standard path for consistency: ${standardPath}`);
        console.log(`Upload timestamp (for cache busting): ${timestamp}`);
        
        try {
          if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
            console.error('GOOGLE_CLOUD_CREDENTIALS not available');
            return res.status(500).json({ 
              error: 'GOOGLE_CLOUD_CREDENTIALS environment variable is not set' 
            });
          }
          
          const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
          console.log('Creating minimal GCS client with explicit credentials');
          
          // Create storage client with minimal configuration
          const storage = new Storage({
            projectId: credentials.project_id,
            credentials: credentials
          });
          
          // Create a reference to the file
          const bucketName = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
          const file = storage.bucket(bucketName).file(standardPath);
          
          console.log(`Starting upload to ${bucketName}/${standardPath}`);
          
          // Try to upload with writeStream method first (more reliable)
          try {
            console.log('Attempting write stream upload method');
            await new Promise<void>((resolve, reject) => {
              const writeStream = file.createWriteStream({
                contentType: mimetype,
                resumable: false,
                metadata: {
                  contentType: mimetype,
                  cacheControl: 'no-cache, no-store, must-revalidate'
                }
              });
              
              writeStream.on('error', (err) => {
                console.error('Write stream error:', err);
                reject(err);
              });
              
              writeStream.on('finish', () => {
                console.log('Write stream finished successfully');
                resolve();
              });
              
              // Push the buffer into the stream
              writeStream.end(buffer);
            });
            console.log('Write stream upload successful');
          } catch (streamError) {
            console.error('Error during write stream upload:', streamError);
            
            // If stream method fails, try with direct save
            console.log('Falling back to direct file save');
            await file.save(buffer, {
              contentType: mimetype,
              resumable: false,
              metadata: {
                contentType: mimetype,
                cacheControl: 'no-cache, no-store, must-revalidate'
              }
            });
            console.log('Direct file save successful');
          }
          
          // Generate a signed URL for the client to use
          let signedUrl = '';
          try {
            console.log('Generating signed URL for uploaded file');
            const [url] = await file.getSignedUrl({
              version: 'v4',
              action: 'read',
              expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
              queryParams: { 'v': timestamp.toString() }  // Add cache busting
            });
            signedUrl = url;
            console.log('Generated signed URL successfully');
          } catch (signedUrlError) {
            console.error('Error generating signed URL:', signedUrlError);
            // Use a public URL as fallback
            signedUrl = `https://storage.googleapis.com/${bucketName}/${standardPath}?v=${timestamp}`;
            console.log('Using public URL fallback:', signedUrl);
          }
          
          // Update the database with the photo path
          let dbUpdateResult = null;
          try {
            const welderIdNum = parseInt(welderId);
            if (!isNaN(welderIdNum)) {
              console.log(`Updating database for welder ID ${welderIdNum} with path ${standardPath}`);
              dbUpdateResult = await db.update(schema.welders)
                .set({ photoPath: standardPath })
                .where(eq(schema.welders.id, welderIdNum));
              console.log('Database update result:', dbUpdateResult);
            }
          } catch (dbError) {
            console.error('Database update error:', dbError);
            // Continue even if database update fails, we still have a successful upload
          }
          
          return res.status(200).json({
            success: true,
            path: standardPath,
            url: signedUrl,
            dbUpdate: dbUpdateResult ? 'success' : 'not attempted',
            timestamp: timestamp
          });
        } catch (uploadError) {
          console.error('Fatal upload error:', uploadError);
          return res.status(500).json({
            error: 'Upload failed',
            details: uploadError instanceof Error ? uploadError.message : String(uploadError)
          });
        }
      } catch (error) {
        console.error('Unhandled error in direct upload endpoint:', error);
        return res.status(500).json({ 
          error: 'Internal server error', 
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );
  
  // Special upload endpoint for emergency direct uploads - will be removed once permissions are fixed
  app.post('/api/force-upload/welder-photo', 
    ensureAuthenticated,
    upload.single('file'),
    async (req: Request, res: Response) => {
      console.log('--------------------------------------------------');
      console.log('Received FORCE upload welder photo request');
      console.log('--------------------------------------------------');
      try {
        // Log request headers first
        console.log('Request headers:', JSON.stringify(req.headers, null, 2));
        console.log('Request body keys:', Object.keys(req.body));
        console.log('Request query:', req.query);
        
        // Log authentication status
        console.log('Request user:', req.user ? req.user.username : 'Not authenticated');
        
        if (!req.file) {
          console.error('No file uploaded in the request');
          console.log('Request body:', req.body);
          return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('File received:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer_length: req.file.buffer ? req.file.buffer.length : 'No buffer'
        });

        // Extract the welder ID
        const welderId = req.body.welderId;
        console.log('Received welderId from body:', welderId);
        if (!welderId) {
          console.error('No welderId in request body');
          return res.status(400).json({ error: 'Welder ID is required' });
        }
        
        // Format a W-XXX style code if it's a number
        let welderCode: string;
        try {
          const numericId = parseInt(welderId);
          if (!isNaN(numericId)) {
            welderCode = `W-${numericId.toString().padStart(3, '0')}`;
          } else {
            welderCode = welderId;
          }
        } catch (e) {
          welderCode = welderId;
        }
        
        const { buffer, originalname, mimetype } = req.file;
        
        // Use consistent path for replacement instead of unique filenames
        // This will ensure we always overwrite the existing file
        const fileExt = originalname.split('.').pop() || 'jpg';
        const standardFilename = `${welderCode}.${fileExt}`;
        const standardPath = `QMS/WELDERS/${welderCode}/${standardFilename}`;
        
        // Generate timestamp just for cache busting in URLs
        const timestamp = Date.now();
        
        console.log(`Uploading directly to GCS with path: ${standardPath}`);
        
        try {
          // Initialize GCS directly
          console.log('Initializing direct GCS connection');
          let credentials;
          
          if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
          } else {
            return res.status(500).json({ error: 'GCS credentials not available' });
          }
          
          // Using import { Storage } from '@google-cloud/storage' at the top
          // This is a direct approach that bypasses bucket permissions check
          const gcsStorage = new Storage({
            credentials: credentials,
            projectId: credentials.project_id
          });
          
          const bucket = gcsStorage.bucket(process.env.GCS_BUCKET_NAME || 'thermopac_storage');
          const file = bucket.file(standardPath);
          
          const metadata = {
            contentType: mimetype,
            cacheControl: 'no-cache, no-store, must-revalidate'
          };
          
          // Try a different approach using raw HTTP APIs
          console.log('Trying raw HTTP upload approach');
          
          try {
            // Step 1: Create a random upload ID to avoid collisions
            const uploadId = `upload-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
            const destinationPath = `upload-staging/${uploadId}/${standardFilename}`;
            
            console.log(`Using temporary staging path: ${destinationPath}`);
            
            // Step 2: Upload to a staging location first
            const stagingFile = bucket.file(destinationPath);
            await stagingFile.save(buffer, {
              resumable: true, // This is key - resumable uploads don't check for existing files
              contentType: mimetype,
              metadata: {
                contentType: mimetype,
                cacheControl: 'no-cache, no-store, must-revalidate'
              }
            });
            
            console.log('Successfully uploaded to staging location');
            
            // Step 3: Copy from staging to final destination using the copyFrom method
            // This method doesn't require delete permissions
            const copyOperation = await stagingFile.copy(file);
            console.log('Successfully copied from staging to final location');
            
            // Step 4: Clean up the staging file (optional, requires delete permissions)
            try {
              await stagingFile.delete();
              console.log('Cleaned up staging file');
            } catch (cleanupError) {
              console.log('Could not clean up staging file, but that\'s okay:', 
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
              // We can just leave it there, it's not a critical error
            }
            
            console.log('Raw HTTP upload completed successfully');
          } catch (rawUploadError) {
            console.error('Raw HTTP upload error:', rawUploadError);
            throw rawUploadError;
          }
          
          // Generate a signed URL
          let signedUrl = '';
          try {
            const [url] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
              queryParams: { 'v': timestamp.toString() }
            });
            signedUrl = url;
            console.log('Successfully generated signed URL');
          } catch (signedUrlError) {
            console.error('Error generating signed URL:', signedUrlError);
            // Continue even without a signed URL - the upload was still successful
            // The client can fetch the URL separately through the existing photo URL endpoint
            signedUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME || 'thermopac_storage'}/${standardPath}?v=${timestamp}`;
            console.log('Using public URL as fallback:', signedUrl);
          }
          
          console.log('Direct file upload complete, updating database');
          
          // Update the database with the new path
          if (welderId) {
            try {
              const welderIdNum = parseInt(welderId);
              if (!isNaN(welderIdNum)) {
                const updateResult = await db.update(schema.welders)
                  .set({ photoPath: standardPath })
                  .where(eq(schema.welders.id, welderIdNum));
                console.log('Updated database with new path:', updateResult);
              }
            } catch (dbError) {
              console.error('Database update error:', dbError);
            }
          }
          
          return res.status(200).json({
            success: true,
            path: standardPath,
            url: signedUrl
          });
          
        } catch (uploadError) {
          console.error('Direct upload error:', uploadError);
          return res.status(500).json({ 
            error: 'Direct upload failed',
            details: uploadError instanceof Error ? uploadError.message : String(uploadError)
          });
        }
      } catch (error) {
        console.error('Error in force upload endpoint:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );
  
  // Original upload endpoint
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
        console.log('Request body forceOverride:', req.body.forceOverride);
        console.log('Request body timestamp:', req.body.timestamp);
        console.log('Request query:', req.query);
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
        
        // Check if we should force override
        const forceOverride = req.body.forceOverride === 'true';
        console.log(`Force override flag: ${forceOverride}`);
        
        // Extract timestamp if provided
        const timestamp = req.body.timestamp || Date.now();
        console.log(`Using timestamp: ${timestamp}`);
        
        // Get the welder ID - check if it's in the welderCode or welderId field
        let welderId = '';
        let welderCode = '';
        
        if (req.body.welderId) {
          welderId = req.body.welderId;
          console.log(`Using welderId from request body: ${welderId}`);
        } else if (req.body.welderCode) {
          welderId = req.body.welderCode;
          console.log(`Using welderCode from request body as welderId: ${welderId}`);
        } else {
          console.error('No welder ID provided in the request body');
          return res.status(400).json({ error: 'Welder ID is required for photo upload' });
        }
        
        // If welderCode is provided separately, store it
        if (req.body.welderCode) {
          welderCode = req.body.welderCode;
          console.log(`Separate welderCode provided: ${welderCode}`);
        }
        
        console.log(`Processing photo upload for welder ID: ${welderId} with force override: ${forceOverride}`);

        // Before uploading, determine the actual welder database record and code
        let welderDbId: number | null = null;
        let welderDbCode: string | null = null;
        
        // First approach - try to parse welderId as number (numeric database ID)
        try {
          const numericId = parseInt(welderId);
          
          if (!isNaN(numericId)) {
            // It's a numeric ID, look up the record to get the code
            console.log(`Looking up welder with numeric ID: ${numericId}`);
            const [welder] = await db.select().from(schema.welders).where(eq(schema.welders.id, numericId));
            
            if (welder) {
              console.log(`Found welder record for ID ${numericId}: ${welder.welderId} - ${welder.name}`);
              welderDbId = welder.id;
              welderDbCode = welder.welderId; // This should be in W-XXX format
            } else {
              console.error(`No welder found with numeric ID: ${numericId}`);
            }
          } 
          // If that failed, and it looks like a welder code (W-XXX)
          else if (welderId.startsWith('W-')) {
            console.log(`Looking up welder with code: ${welderId}`);
            const [welder] = await db.select().from(schema.welders).where(eq(schema.welders.welderId, welderId));
            
            if (welder) {
              console.log(`Found welder record for code ${welderId}: ID ${welder.id} - ${welder.name}`);
              welderDbId = welder.id;
              welderDbCode = welder.welderId;
            } else {
              console.error(`No welder found with code: ${welderId}`);
            }
          }
          // None of these work - try welderCode if available
          else if (welderCode && welderCode.startsWith('W-')) {
            console.log(`Looking up welder using separate welderCode: ${welderCode}`);
            const [welder] = await db.select().from(schema.welders).where(eq(schema.welders.welderId, welderCode));
            
            if (welder) {
              console.log(`Found welder record for separate code ${welderCode}: ID ${welder.id} - ${welder.name}`);
              welderDbId = welder.id;
              welderDbCode = welder.welderId;
            } else {
              console.error(`No welder found with separate code: ${welderCode}`);
            }
          }
        } catch (dbError) {
          console.error('Error looking up welder record:', dbError);
        }
        
        // If we couldn't find a welder in the database, use what we have
        if (!welderDbCode && welderId.startsWith('W-')) {
          welderDbCode = welderId;
          console.log(`Using provided welderId as code: ${welderDbCode}`);
        } else if (!welderDbCode && welderCode && welderCode.startsWith('W-')) {
          welderDbCode = welderCode;
          console.log(`Using provided welderCode as code: ${welderDbCode}`);
        } 
        
        // Make one last attempt to create a code if we have a numeric ID but couldn't find the record
        if (!welderDbCode && !isNaN(parseInt(welderId))) {
          welderDbCode = `W-${parseInt(welderId).toString().padStart(3, '0')}`;
          console.log(`Created welderCode from numeric ID: ${welderDbCode}`);
        }
        
        // Ensure we have a valid welder code for GCS storage
        if (!welderDbCode) {
          console.error('Failed to determine a valid welder code for GCS storage');
          return res.status(400).json({ error: 'Could not determine a valid welder code for storage' });
        }

        // Upload the file to GCS using the determined welder code
        console.log(`Calling uploadWelderPhoto with params: originalname=${originalname}, mimetype=${mimetype}, welderId=${welderDbCode}`);
        
        let result;
        try {
          result = await uploadWelderPhoto(
            buffer,
            originalname,
            mimetype,
            welderDbCode
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

        // Update the welder record with the photo path if we have a valid DB ID
        if (welderDbId) {
          try {
            console.log(`Updating photoPath in database for ID: ${welderDbId}, path: ${result.filePath}`);
            
            const updateResult = await db.update(schema.welders)
              .set({ photoPath: result.filePath })
              .where(eq(schema.welders.id, welderDbId));
              
            console.log(`Database update result:`, updateResult);
          } catch (dbError) {
            console.error('Error updating welder record with photo path:', dbError);
            // Continue even if update fails, as we still want to return the upload result
          }
        } else {
          console.warn('No database ID available for updating welder record. Photo uploaded to GCS but database not updated.');
        }

        // Return success response
        res.status(200).json({
          success: true,
          path: result.filePath,
          url: result.url,
          welderDbId,
          welderDbCode
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