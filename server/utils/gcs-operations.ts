import { Storage, Bucket, File } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { gcsCredentials, gcsBucketName } from './gcs-config';

// Define the GCS bucket name
const bucketName = process.env.GCS_BUCKET_NAME || gcsBucketName || 'thermopac_storage';

// Initialize GCS client
let gcsStorage: Storage | null = null;
let gcsBucket: Bucket | null = null;

/**
 * Initialize GCS Storage client and bucket
 */
export const initializeGCS = async (): Promise<{ storage: Storage | null, bucket: Bucket | null }> => {
  try {
    // Check if we're running in production (with service account credentials)
    if (process.env.NODE_ENV === 'production') {
      console.log('Environment: production - Creating GCS client with default credentials');
      gcsStorage = new Storage();
    } else {
      // For development, use explicit credentials from environment variable
      console.log('Environment: development - Creating GCS client with explicit credentials');
      
      if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
        throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable is not set');
      }
      
      const credentialsString = process.env.GOOGLE_CLOUD_CREDENTIALS;
      console.log(`Credentials string length: ${credentialsString.length}`);
      console.log(`First 20 chars: ${credentialsString.substring(0, 20)}...`);
      
      console.log('Attempting to parse Google Cloud credentials...');
      const credentials = JSON.parse(credentialsString);
      
      // Validate credentials have required fields
      const validation = {
        hasType: !!credentials.type,
        hasProjectId: !!credentials.project_id,
        hasClientEmail: !!credentials.client_email,
        hasPrivateKey: !!credentials.private_key
      };
      
      console.log('✅ Successfully parsed credentials JSON');
      console.log(`Credential validation: ${JSON.stringify(validation)}`);
      
      if (!validation.hasType || !validation.hasProjectId || !validation.hasClientEmail || !validation.hasPrivateKey) {
        throw new Error('Google Cloud credentials are missing required fields');
      }
      
      // Create GCS client with explicit credentials
      gcsStorage = new Storage({
        projectId: credentials.project_id,
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key
        }
      });
      
      console.log(`Using explicit GCS credentials with project: ${credentials.project_id}`);
      console.log(`Service account: ${credentials.client_email}`);
    }
    
    // Get bucket name from environment or use default
    const bucketName = process.env.GCS_BUCKET_NAME || gcsBucketName || 'thermopac_storage';
    console.log(`Using GCS bucket name: ${bucketName}`);
    
    // CRITICAL CHANGE: Always create a bucket reference if we have a storage client
    // We'll attempt operations even without bucket-level permissions
    if (gcsStorage) {
      // Create the bucket reference regardless of whether we can verify it exists
      gcsBucket = gcsStorage.bucket(bucketName);
      console.log(`Created bucket reference for ${bucketName}`);
      
      // Try to verify bucket exists, but NEVER fail initialization if we can't verify
      try {
        const [exists] = await gcsBucket.exists();
        if (exists) {
          console.log(`✅ Successfully verified bucket ${bucketName} exists`);
        } else {
          console.log(`⚠️ Bucket ${bucketName} does not exist or we can't verify it`);
          // We'll still return the bucket reference, and let individual operations decide how to handle failures
        }
      } catch (error) {
        // Check if this is a permissions error
        const errorMsg = String(error);
        if (errorMsg.includes('Permission') || errorMsg.includes('storage.buckets.get')) {
          console.log(`⚠️ No permission to verify bucket existence - this is expected with object-level permissions`);
          console.log(`ℹ️ Will proceed with assuming bucket exists and attempt operations with object-level permissions`);
          // Continue with the reference - we'll test actual permissions during operations
        } else {
          console.error(`⚠️ Unusual error when verifying bucket existence: ${errorMsg}`);
          console.log(`ℹ️ Will still attempt operations with the bucket reference`);
        }
      }
      
      // Always return the storage and bucket references, even if verification failed
      return { storage: gcsStorage, bucket: gcsBucket };
    } else {
      console.error('❌ Failed to create GCS storage client');
      return { storage: null, bucket: null };
    }
  } catch (error) {
    console.error(`Failed to initialize GCS: ${error instanceof Error ? error.message : String(error)}`);
    return { storage: null, bucket: null };
  }
};

/**
 * Upload a file to Google Cloud Storage
 * 
 * @param filePath Path within the bucket where the file should be stored (without leading slash)
 * @param fileBuffer The file content as a Buffer
 * @param contentType MIME type of the file
 * @returns Object with success flag and result information
 */
export const uploadFileToGCS = async (
  filePath: string, 
  fileBuffer: Buffer, 
  contentType: string
): Promise<{ success: boolean; message: string; url?: string }> => {
  try {
    // Always attempt to initialize GCS before operations
    // This is important for production where GCS might not be initialized yet
    console.log(`Attempting to upload file to GCS: ${filePath}`);
    
    // Force re-initialization to get the latest storage client
    // This helps in production where permissions might change
    const { storage, bucket } = await initializeGCS();
    
    // IMPORTANT: Continue even if bucket verification failed
    if (!storage) {
      console.error('Failed to initialize Google Cloud Storage client for upload');
      return { 
        success: false, 
        message: 'Failed to initialize Google Cloud Storage client' 
      };
    }
    
    // Use the latest storage client
    gcsStorage = storage;
    
    // If initializeGCS couldn't verify the bucket but created a reference, use it
    if (bucket) {
      console.log('Using verified bucket reference for upload');
      gcsBucket = bucket;
    } else if (gcsStorage) {
      // Create a new bucket reference directly
      console.log(`Creating new bucket reference for ${bucketName} for upload operation`);
      gcsBucket = gcsStorage.bucket(bucketName);
    } else {
      console.error('Failed to create bucket reference for upload');
      return { 
        success: false, 
        message: 'Failed to create bucket reference' 
      };
    }
    
    // Normalize filepath (remove leading slash if present)
    const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    
    // Get file reference
    const file = gcsBucket.file(normalizedPath);
    
    // Try multiple upload methods for maximum reliability
    try {
      // Method 1: Direct, non-resumable upload
      console.log(`Attempting non-resumable upload to ${normalizedPath}`);
      await file.save(fileBuffer, {
        metadata: {
          contentType
        },
        resumable: false
      });
      
      console.log(`✅ File uploaded successfully via direct method to ${normalizedPath}`);
    } catch (error1) {
      console.warn(`First upload method failed: ${error1 instanceof Error ? error1.message : String(error1)}`);
      
      // Method 2: Stream-based upload
      try {
        console.log(`Attempting stream-based upload to ${normalizedPath}`);
        const stream = file.createWriteStream({
          metadata: {
            contentType
          },
          resumable: false
        });
        
        await new Promise<void>((resolve, reject) => {
          stream.on('error', (err) => {
            console.error(`Stream upload error: ${err.message}`);
            reject(err);
          });
          
          stream.on('finish', () => {
            console.log('Stream upload finished successfully');
            resolve();
          });
          
          // Write to stream and end
          stream.end(fileBuffer);
        });
        
        console.log(`✅ File uploaded successfully via stream method to ${normalizedPath}`);
      } catch (error2) {
        console.error(`All upload methods failed: ${error2 instanceof Error ? error2.message : String(error2)}`);
        
        // Extract the specific error message
        let errorMessage = 'Unknown upload error';
        if (error2 instanceof Error) {
          errorMessage = error2.message;
          
          // Check for common permission errors
          if (errorMessage.includes('storage.objects.create')) {
            errorMessage = `Permission denied: The service account does not have the 'Storage Object Creator' role. Please update the service account permissions in Google Cloud Console.`;
          } else if (errorMessage.includes('403')) {
            errorMessage = `Forbidden: The service account doesn't have permission to upload files to bucket '${gcsBucket.name}'.`;
          }
        }
        
        return { 
          success: false, 
          message: `Failed to upload file: ${errorMessage}` 
        };
      }
    }
    
    // Generate public URL for the file
    if (!gcsBucket) {
      throw new Error('GCS bucket is not initialized');
    }
    const publicUrl = `https://storage.googleapis.com/${gcsBucket.name}/${normalizedPath}`;
    
    return {
      success: true,
      message: 'File uploaded successfully',
      url: publicUrl
    };
  } catch (error) {
    console.error(`Unexpected error during GCS upload: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      success: false,
      message: `Unexpected error during upload: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * Download a file from Google Cloud Storage
 * 
 * @param gcsPath Path to file in GCS (without leading slash)
 * @param destinationPath Local file system path where the file should be saved
 * @returns Object with success flag and result information
 */
export const downloadFileFromGCS = async (
  gcsPath: string,
  destinationPath: string
): Promise<{ success: boolean; message: string; localPath?: string }> => {
  try {
    // Always attempt to initialize GCS before operations
    // This is important for production where GCS might not be initialized yet
    console.log(`Attempting to download file from GCS: ${gcsPath}`);
    
    // Force re-initialization to get the latest storage client
    // This helps in production where permissions might change
    const { storage, bucket } = await initializeGCS();
    
    // IMPORTANT: Continue even if bucket verification failed
    if (!storage) {
      console.error('Failed to initialize Google Cloud Storage client for download');
      return { 
        success: false, 
        message: 'Failed to initialize Google Cloud Storage client' 
      };
    }
    
    // Use the latest storage client
    gcsStorage = storage;
    
    // If initializeGCS couldn't verify the bucket but created a reference, use it
    if (bucket) {
      console.log('Using verified bucket reference for download');
      gcsBucket = bucket;
    } else if (gcsStorage) {
      // Create a new bucket reference directly
      console.log(`Creating new bucket reference for ${bucketName} for download operation`);
      gcsBucket = gcsStorage.bucket(bucketName);
    } else {
      console.error('Failed to create bucket reference for download');
      return { 
        success: false, 
        message: 'Failed to create bucket reference' 
      };
    }
    
    // Normalize filepath (remove leading slash if present)
    const normalizedPath = gcsPath.startsWith('/') ? gcsPath.slice(1) : gcsPath;
    
    // Get file reference
    const file = gcsBucket.file(normalizedPath);
    
    // Try to check if file exists, but be more forgiving with permissions
    try {
      const [exists] = await file.exists();
      if (!exists) {
        console.warn(`File not found in GCS: ${normalizedPath}`);
        // But we'll still try downloading in case the file exists but we lack permissions to check
      }
    } catch (existsError) {
      // Check if this is a permissions error
      const errorMsg = String(existsError);
      if (errorMsg.includes('Permission') || errorMsg.includes('storage.objects.get')) {
        console.log(`⚠️ No permission to check if file exists - will try to download it anyway`);
        // Continue anyway, as we may be able to download even without permission to check existence
      } else {
        console.warn(`Error checking if file exists: ${existsError instanceof Error ? existsError.message : String(existsError)}`);
        // We'll still try to download it
      }
    }
    
    // Create directory if it doesn't exist
    const dir = path.dirname(destinationPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    // Download the file
    await file.download({ destination: destinationPath });
    
    return {
      success: true,
      message: 'File downloaded successfully',
      localPath: destinationPath
    };
  } catch (error) {
    console.error(`Error downloading file from GCS: ${error instanceof Error ? error.message : String(error)}`);
    
    // Extract the specific error message
    let errorMessage = 'Unknown download error';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check for common permission errors
      if (errorMessage.includes('storage.objects.get')) {
        errorMessage = `Permission denied: The service account does not have the 'Storage Object Viewer' role. Please update the service account permissions in Google Cloud Console.`;
      } else if (errorMessage.includes('403')) {
        errorMessage = `Forbidden: The service account doesn't have permission to download files from bucket '${gcsBucket?.name || bucketName}'.`;
      }
    }
    
    return {
      success: false,
      message: `Failed to download file: ${errorMessage}`
    };
  }
};

/**
 * Stream a file directly from GCS to a response object
 * 
 * @param gcsPath Path to file in GCS (without leading slash)
 * @param response Express Response object to stream to
 * @param contentType MIME type of the file
 * @param downloadFilename Optional filename to suggest for download
 * @returns True if streaming started successfully, false otherwise
 */
export const streamFileFromGCS = async (
  gcsPath: string,
  response: any, // Use any for Express.Response to avoid TypeScript limitations with pipe()
  contentType: string = 'application/octet-stream',
  downloadFilename?: string
): Promise<boolean> => {
  try {
    // Always attempt to initialize GCS before operations
    // This is important for production where GCS might not be initialized yet
    console.log(`Attempting to stream file from GCS: ${gcsPath}`);
    
    // Force re-initialization to get the latest storage client
    // This helps in production where permissions might change
    const { storage, bucket } = await initializeGCS();
    
    // IMPORTANT: Continue even if bucket verification failed
    if (!storage) {
      console.error('Failed to initialize Google Cloud Storage client for streaming');
      if (!response.headersSent) {
        response.status(500).send('Error: Failed to initialize Google Cloud Storage');
      }
      return false;
    }
    
    // Use the latest storage client
    gcsStorage = storage;
    
    // If initializeGCS couldn't verify the bucket but created a reference, use it
    if (bucket) {
      console.log('Using verified bucket reference for streaming');
      gcsBucket = bucket;
    } else if (gcsStorage) {
      // Create a new bucket reference directly
      console.log(`Creating new bucket reference for ${bucketName} for streaming operation`);
      gcsBucket = gcsStorage.bucket(bucketName);
    } else {
      console.error('Failed to create bucket reference for streaming');
      if (!response.headersSent) {
        response.status(500).send('Error: Failed to access Google Cloud Storage bucket');
      }
      return false;
    }
    
    // Normalize filepath (remove leading slash if present)
    const normalizedPath = gcsPath.startsWith('/') ? gcsPath.slice(1) : gcsPath;
    
    // Get file reference
    const file = gcsBucket.file(normalizedPath);
    
    // Try to check if file exists, but don't fail completely if we can't check
    try {
      const [exists] = await file.exists();
      if (!exists) {
        console.warn(`File not found in GCS: ${normalizedPath}`);
        // We'll still try to stream it, in case the file exists but we don't have permission to check
      }
    } catch (existsError) {
      // Check if this is a permissions error
      const errorMsg = String(existsError);
      if (errorMsg.includes('Permission') || errorMsg.includes('storage.objects.get')) {
        console.log(`⚠️ No permission to check if file exists - will try to stream it anyway`);
        // Continue anyway, as we may be able to stream even without permission to check existence
      } else {
        console.warn(`Error checking if file exists: ${existsError instanceof Error ? existsError.message : String(existsError)}`);
        // We'll still try to stream it
      }
    }
    
    // Get file metadata (for content type if not specified)
    try {
      const [metadata] = await file.getMetadata();
      console.log(`File metadata: ${JSON.stringify(metadata.contentType || 'No content type in metadata')}`);
      
      // Use the content type from metadata if not explicitly specified
      if (contentType === 'application/octet-stream' && metadata.contentType) {
        contentType = metadata.contentType;
        console.log(`Using content type from metadata: ${contentType}`);
      }
    } catch (metadataError) {
      console.warn(`Could not retrieve file metadata: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`);
      // Continue with the provided content type
    }
    
    // Set appropriate headers
    response.setHeader('Content-Type', contentType);
    
    // If download filename is provided, set Content-Disposition
    if (downloadFilename) {
      // Ensure filename is properly encoded for HTTP headers
      const encodedFilename = encodeURIComponent(downloadFilename);
      response.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"`);
    }
    
    // Create read stream and pipe to response
    const readStream = file.createReadStream();
    
    // Handle errors
    readStream.on('error', (err) => {
      console.error(`Error streaming file from GCS: ${err.message}`);
      if (!response.headersSent) {
        response.status(500).send(`Error streaming file: ${err.message}`);
      }
    });
    
    // Pipe to response (with type assertion to handle the Express.Response object)
    // This is safe because Express.Response implements the necessary WritableStream interface
    readStream.pipe(response as any);
    console.log(`Successfully started streaming file: ${normalizedPath}`);
    
    return true;
  } catch (error) {
    console.error(`Error setting up GCS file stream: ${error instanceof Error ? error.message : String(error)}`);
    if (!response.headersSent) {
      response.status(500).send(`Error streaming file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return false;
  }
};

// Initialize GCS on module load
initializeGCS().then(({ storage, bucket }) => {
  if (storage && bucket) {
    console.log('GCS utility initialized successfully');
  } else {
    console.warn('GCS utility initialization failed');
  }
}).catch(err => {
  console.error('Error during GCS utility initialization:', err);
});

/**
 * Delete a file from Google Cloud Storage
 * 
 * @param gcsPath Path to file in GCS (without leading slash)
 * @returns Object with success flag and result information
 */
export const deleteFileFromGCS = async (
  gcsPath: string
): Promise<{ success: boolean; message: string }> => {
  try {
    // Always attempt to initialize GCS before operations
    // This is important for production where GCS might not be initialized yet
    console.log(`Attempting to delete file from GCS: ${gcsPath}`);
    
    // Force re-initialization to get the latest storage client
    // This helps in production where permissions might change
    const { storage, bucket } = await initializeGCS();
    
    // IMPORTANT: Continue even if bucket verification failed
    if (!storage) {
      console.error('Failed to initialize Google Cloud Storage client for deletion');
      return { 
        success: false, 
        message: 'Failed to initialize Google Cloud Storage client' 
      };
    }
    
    // Use the latest storage client
    gcsStorage = storage;
    
    // If initializeGCS couldn't verify the bucket but created a reference, use it
    if (bucket) {
      console.log('Using verified bucket reference for deletion');
      gcsBucket = bucket;
    } else if (gcsStorage) {
      // Create a new bucket reference directly
      console.log(`Creating new bucket reference for ${bucketName} for deletion operation`);
      gcsBucket = gcsStorage.bucket(bucketName);
    } else {
      console.error('Failed to create bucket reference for deletion');
      return { 
        success: false, 
        message: 'Failed to create bucket reference' 
      };
    }
    
    // Normalize filepath (remove leading slash if present)
    const normalizedPath = gcsPath.startsWith('/') ? gcsPath.slice(1) : gcsPath;
    
    // Get file reference
    const file = gcsBucket.file(normalizedPath);
    
    // Try to check if file exists, but be more forgiving with permissions errors
    try {
      const [exists] = await file.exists();
      if (!exists) {
        return {
          success: true,
          message: `File not found in GCS: ${normalizedPath} (no deletion needed)`
        };
      }
    } catch (existsError) {
      // Check if this is a permissions error
      const errorMsg = String(existsError);
      if (errorMsg.includes('Permission') || errorMsg.includes('storage.objects.get')) {
        console.log(`⚠️ No permission to check if file exists - will try to delete it anyway`);
        // Continue anyway, as we may be able to delete even without permission to check existence
      } else {
        console.warn(`Error checking if file exists: ${existsError instanceof Error ? existsError.message : String(existsError)}`);
        // We'll still try to delete it
      }
    }
    
    // Delete the file
    await file.delete({ ignoreNotFound: true });
    
    return {
      success: true,
      message: 'File deleted successfully'
    };
  } catch (error) {
    console.error(`Error deleting file from GCS: ${error instanceof Error ? error.message : String(error)}`);
    
    // Extract the specific error message
    let errorMessage = 'Unknown delete error';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check for common permission errors
      if (errorMessage.includes('storage.objects.delete')) {
        errorMessage = `Permission denied: The service account does not have the 'Storage Object Admin' role required for deletion. Please update the service account permissions in Google Cloud Console.`;
      } else if (errorMessage.includes('403')) {
        errorMessage = `Forbidden: The service account doesn't have permission to delete files from bucket '${gcsBucket?.name || bucketName}'.`;
      }
    }
    
    return {
      success: false,
      message: `Failed to delete file: ${errorMessage}`
    };
  }
};

// Export the storage and bucket instance
export { gcsStorage, gcsBucket };