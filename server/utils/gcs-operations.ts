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
    
    // Initialize bucket
    if (gcsStorage) {
      gcsBucket = gcsStorage.bucket(bucketName);
      
      // Verify bucket exists
      try {
        const [exists] = await gcsBucket.exists();
        if (exists) {
          console.log(`✅ Successfully verified bucket ${bucketName} exists`);
        } else {
          console.error(`❌ Bucket ${bucketName} does not exist`);
          gcsBucket = null;
        }
      } catch (error) {
        console.error(`Error verifying bucket existence: ${error instanceof Error ? error.message : String(error)}`);
        gcsBucket = null;
      }
    }
    
    return { storage: gcsStorage, bucket: gcsBucket };
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
    // Initialize if not already done
    if (!gcsStorage || !gcsBucket) {
      const { storage, bucket } = await initializeGCS();
      if (!storage || !bucket) {
        return { 
          success: false, 
          message: 'Failed to initialize Google Cloud Storage' 
        };
      }
      gcsStorage = storage;
      gcsBucket = bucket;
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
    // Initialize if not already done
    if (!gcsStorage || !gcsBucket) {
      const { storage, bucket } = await initializeGCS();
      if (!storage || !bucket) {
        return { 
          success: false, 
          message: 'Failed to initialize Google Cloud Storage' 
        };
      }
      gcsStorage = storage;
      gcsBucket = bucket;
    }
    
    // Normalize filepath (remove leading slash if present)
    const normalizedPath = gcsPath.startsWith('/') ? gcsPath.slice(1) : gcsPath;
    
    // Get file reference
    const file = gcsBucket.file(normalizedPath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return {
        success: false,
        message: `File not found in GCS: ${normalizedPath}`
      };
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
 * @returns True if streaming started successfully, false otherwise
 */
export const streamFileFromGCS = async (
  gcsPath: string,
  response: any,
  contentType: string = 'application/octet-stream'
): Promise<boolean> => {
  try {
    // Initialize if not already done
    if (!gcsStorage || !gcsBucket) {
      const { storage, bucket } = await initializeGCS();
      if (!storage || !bucket) {
        console.error('Failed to initialize Google Cloud Storage');
        return false;
      }
      gcsStorage = storage;
      gcsBucket = bucket;
    }
    
    // Normalize filepath (remove leading slash if present)
    const normalizedPath = gcsPath.startsWith('/') ? gcsPath.slice(1) : gcsPath;
    
    // Get file reference
    const file = gcsBucket.file(normalizedPath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`File not found in GCS: ${normalizedPath}`);
      return false;
    }
    
    // Set appropriate headers
    response.setHeader('Content-Type', contentType);
    
    // Create read stream and pipe to response
    const readStream = file.createReadStream();
    
    // Handle errors
    readStream.on('error', (err) => {
      console.error(`Error streaming file from GCS: ${err.message}`);
      if (!response.headersSent) {
        response.status(500).send(`Error streaming file: ${err.message}`);
      }
    });
    
    // Pipe to response
    readStream.pipe(response);
    
    return true;
  } catch (error) {
    console.error(`Error setting up GCS file stream: ${error instanceof Error ? error.message : String(error)}`);
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

// Export the storage and bucket instance
export { gcsStorage, gcsBucket };