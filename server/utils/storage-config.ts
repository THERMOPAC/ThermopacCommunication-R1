import { Storage } from '@google-cloud/storage';

/**
 * This file contains configuration for Google Cloud Storage.
 * To use GCS, you need to provide:
 * 1. Google Cloud credentials (either as a JSON file or environment variables)
 * 2. A bucket name
 */

// Use the bucket name from environment variable if defined, otherwise use default
// Explicitly check for typos in the bucket name
const envBucketName = process.env.GOOGLE_CLOUD_BUCKET || '';
const correctBucketName = 'thermopac_storage';

// If the environment variable is set but contains a typo, use the correct name
export const bucketName = envBucketName.includes('thermopac_s') && envBucketName !== correctBucketName
  ? correctBucketName  // Use the correct name if there's a typo
  : (envBucketName || correctBucketName);  // Use env var if set, otherwise use default
  
console.log(`Using GCS bucket name: ${bucketName} (corrected from env: ${envBucketName})`);

// Log a warning if there's a typo in the environment variable
if (envBucketName && envBucketName !== correctBucketName && envBucketName.includes('thermopac_s')) {
  console.warn(`⚠️ WARNING: Environment variable GOOGLE_CLOUD_BUCKET has a typo: "${envBucketName}". Using "${correctBucketName}" instead.`);
}

// Function to create storage client
function createStorageClient() {
  try {
    // Check if we have explicit credentials in the environment
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      try {
        // Parse the credentials from the environment variable
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        
        console.log('Using explicit GCS credentials with project:', 
          process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id);
          
        // Create a Storage client with explicit credentials
        return new Storage({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
          credentials: credentials
        });
      } catch (parseError) {
        console.error('Error parsing GOOGLE_CLOUD_CREDENTIALS:', parseError);
        throw new Error('Failed to parse GOOGLE_CLOUD_CREDENTIALS. Please check the format.');
      }
    } else {
      // If no explicit credentials, use default client (works in Google Cloud environments)
      console.log('No explicit GCS credentials found, using default authentication');
      console.log('Project ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
      
      return new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });
    }
  } catch (error) {
    console.error('Error creating GCS client:', error);
    
    // For debugging only - DO NOT log credential details in production
    console.log('Storage configuration:');
    console.log('- GOOGLE_CLOUD_PROJECT_ID exists:', !!process.env.GOOGLE_CLOUD_PROJECT_ID);
    console.log('- GOOGLE_CLOUD_BUCKET exists:', !!process.env.GOOGLE_CLOUD_BUCKET);
    console.log('- GOOGLE_CLOUD_CREDENTIALS exists:', !!process.env.GOOGLE_CLOUD_CREDENTIALS);
    
    // Still return a storage instance for graceful degradation
    console.log('Creating fallback storage client - uploads will likely fail');
    return new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'thermopac-development'
    });
  }
}

// Create the storage client
const storage = createStorageClient();

// Export the configured storage instance
export default storage;