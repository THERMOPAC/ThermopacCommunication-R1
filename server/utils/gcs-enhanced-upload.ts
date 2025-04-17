import storage, { bucketName } from './storage-config';

/**
 * Enhanced upload function with better diagnostics
 * This is a separate function to avoid modifying the GcsStorage class
 */
export async function uploadFileWithDiagnostics(
  filePath: string, 
  buffer: Buffer, 
  contentType: string
): Promise<{ 
  successful: boolean; 
  error?: any; 
  url?: string;
  path?: string;
  bucketDetails?: any;
  environment?: string;
}> {
  console.log(`GCS: Starting upload to path: ${filePath}`);
  console.log(`GCS: Environment: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    // Validate bucket name is properly configured
    if (!bucketName) {
      console.error('GCS bucket name is not configured');
      return { 
        successful: false, 
        error: new Error('GCS bucket name is not configured. Please check GOOGLE_CLOUD_BUCKET environment variable.'),
        environment: process.env.NODE_ENV,
        bucketDetails: {
          configuredName: bucketName,
          envVar: process.env.GOOGLE_CLOUD_BUCKET || '(not set)'
        }
      };
    }
    
    console.log(`GCS: Using bucket: ${bucketName}`);
    
    // Get bucket and file references
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    
    // Check if the bucket exists and is accessible
    try {
      const [exists] = await bucket.exists();
      if (!exists) {
        console.error(`Bucket ${bucketName} does not exist or is not accessible`);
        return { 
          successful: false, 
          error: new Error(`Bucket ${bucketName} does not exist or is not accessible`),
          environment: process.env.NODE_ENV,
          bucketDetails: {
            name: bucketName,
            exists: exists,
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '(not set)'
          }
        };
      }
      console.log(`GCS: Bucket ${bucketName} exists and is accessible`);
    } catch (bucketError: any) {
      console.error(`GCS: Bucket check failed: ${bucketError.message}`);
      return {
        successful: false,
        error: bucketError,
        environment: process.env.NODE_ENV,
        bucketDetails: {
          name: bucketName,
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '(not set)'
        }
      };
    }
    
    // Ensure parent directory exists
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dirPath) {
      console.log(`GCS: Ensuring directory structure exists: ${dirPath}`);
      try {
        // Create .keep file in directory
        const keepFile = bucket.file(`${dirPath}/.keep`);
        await keepFile.save('', {
          contentType: 'application/x-empty',
          metadata: {
            'x-goog-meta-directory': 'true'
          }
        });
      } catch (dirError) {
        console.warn(`GCS: Warning - Failed to create directory structure: ${dirError}`);
        // Continue with upload anyway, Google Storage doesn't require directories
      }
    }
    
    // Upload the file
    console.log(`GCS: Uploading file to: ${filePath}`);
    
    try {
      await file.save(buffer, {
        contentType,
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000', // Cache for 1 year
        },
      });
      
      console.log('GCS: File uploaded successfully');
      
      // Generate a signed URL for immediate access
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });
      
      return { 
        successful: true, 
        url,
        path: filePath,
        environment: process.env.NODE_ENV,
        bucketDetails: {
          name: bucketName,
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
        }
      };
    } catch (uploadError: any) {
      console.error(`GCS: Upload failed: ${uploadError.message}`);
      console.error('GCS: Upload error stack:', uploadError.stack);
      
      // Handle specific error types
      const errorData: any = {
        message: uploadError.message,
        code: uploadError.code,
        stack: uploadError.stack
      };
      
      return { 
        successful: false, 
        error: errorData,
        path: filePath,
        environment: process.env.NODE_ENV,
        bucketDetails: {
          name: bucketName,
          configuredName: process.env.GOOGLE_CLOUD_BUCKET,
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
        }
      };
    }
  } catch (error: any) {
    console.error('GCS: Unexpected error during upload:', error);
    return { 
      successful: false, 
      error,
      environment: process.env.NODE_ENV,
      bucketDetails: {
        name: bucketName,
        envVar: process.env.GOOGLE_CLOUD_BUCKET || '(not set)',
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '(not set)'
      }
    };
  }
}