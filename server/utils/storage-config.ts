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

// More robust bucket name handling
export const bucketName = (() => {
  // If environment variable is not set, use default
  if (!envBucketName) {
    console.log(`GOOGLE_CLOUD_BUCKET not set, using default: ${correctBucketName}`);
    return correctBucketName;
  }
  
  // First trim any whitespace from the bucket name
  const trimmedBucketName = envBucketName.trim();
  
  // If it matches exactly after trimming, use it
  if (trimmedBucketName === correctBucketName) {
    if (trimmedBucketName !== envBucketName) {
      console.warn(`⚠️ WARNING: GOOGLE_CLOUD_BUCKET has extra whitespace: "${envBucketName}". Using trimmed version: "${trimmedBucketName}"`);
    }
    return correctBucketName;
  }
  
  // Check for typos - if it contains "thermopac_s" but isn't exact
  if (trimmedBucketName.includes('thermopac_s') && trimmedBucketName !== correctBucketName) {
    console.warn(`⚠️ WARNING: Environment variable GOOGLE_CLOUD_BUCKET has a typo: "${trimmedBucketName}". Using "${correctBucketName}" instead.`);
    return correctBucketName;
  }
  
  // If it's completely different, log a warning but use what's provided
  console.warn(`⚠️ WARNING: Using non-standard bucket name: "${trimmedBucketName}". Expected: "${correctBucketName}"`);
  return trimmedBucketName;
})();

console.log(`Using GCS bucket name: ${bucketName} (from env: ${envBucketName || 'not set'})`);

// Function to create storage client
function createStorageClient() {
  try {
    // Check if we have explicit credentials in the environment
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      try {
        // Detect environment for troubleshooting
        const nodeEnv = process.env.NODE_ENV || 'development';
        console.log(`Environment: ${nodeEnv} - Creating GCS client with explicit credentials`);
        
        // Parse the credentials from the environment variable
        const credentialsStr = process.env.GOOGLE_CLOUD_CREDENTIALS.trim();
        console.log(`Credentials string length: ${credentialsStr.length}`);
        console.log(`First 20 chars: ${credentialsStr.substring(0, 20)}...`);
        
        // Check if the credentials start with a curly brace (JSON format)
        if (!credentialsStr.startsWith('{')) {
          console.error('GOOGLE_CLOUD_CREDENTIALS does not appear to be in JSON format.');
          console.log('Credentials should start with "{" and be a valid JSON string.');
          throw new Error('Invalid credentials format. Must be a JSON object.');
        }
        
        // Attempt to parse the credentials
        console.log('Attempting to parse Google Cloud credentials...');
        let credentials;
        try {
          credentials = JSON.parse(credentialsStr);
          console.log('✅ Successfully parsed credentials JSON');
        } catch (error) {
          const parseError = error as Error;
          console.error('❌ Failed to parse credentials JSON:', parseError.message);
          throw parseError;
        }
        
        // Validate required fields in credentials
        const validationResults = {
          hasType: !!credentials.type,
          hasProjectId: !!credentials.project_id,
          hasClientEmail: !!credentials.client_email,
          hasPrivateKey: !!credentials.private_key,
        };
        
        console.log('Credential validation:', JSON.stringify(validationResults));
        
        if (!credentials.type || credentials.type !== 'service_account') {
          console.warn(`⚠️ WARNING: Credentials type is ${credentials.type || 'missing'}, should be "service_account"`);
        }
        
        if (!credentials.project_id) {
          console.warn('⚠️ WARNING: Credentials missing project_id');
        }
        
        if (!credentials.client_email) {
          console.error('❌ ERROR: Credentials missing client_email - authentication will fail');
        }
        
        if (!credentials.private_key) {
          console.error('❌ ERROR: Credentials missing private_key - authentication will fail');
        }
        
        console.log('Using explicit GCS credentials with project:', 
          process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id);
        console.log('Service account:', credentials.client_email);
          
        // Create a Storage client with explicit credentials
        return new Storage({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
          credentials: credentials
        });
      } catch (parseError) {
        console.error('Error parsing GOOGLE_CLOUD_CREDENTIALS:', parseError);
        console.log('Credentials length:', process.env.GOOGLE_CLOUD_CREDENTIALS.length);
        console.log('First 20 chars:', process.env.GOOGLE_CLOUD_CREDENTIALS.substring(0, 20) + '...');
        throw new Error('Failed to parse GOOGLE_CLOUD_CREDENTIALS. Please check the format.');
      }
    } else {
      // If no explicit credentials, use default client (works in Google Cloud environments)
      console.log('No explicit GCS credentials found, using default authentication');
      console.log('Project ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
      
      // In Production with no credentials, this is likely to fail
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ WARNING: Running in production without explicit GCS credentials');
        console.warn('This may fail if default authentication is not available.');
      }
      
      return new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });
    }
  } catch (error) {
    console.error('Error creating GCS client:', error);
    
    // For debugging only - DO NOT log credential details in production
    console.log('Storage configuration:');
    console.log('- NODE_ENV:', process.env.NODE_ENV);
    console.log('- GOOGLE_CLOUD_PROJECT_ID exists:', !!process.env.GOOGLE_CLOUD_PROJECT_ID);
    console.log('- GOOGLE_CLOUD_BUCKET exists:', !!process.env.GOOGLE_CLOUD_BUCKET);
    console.log('- GOOGLE_CLOUD_CREDENTIALS exists:', !!process.env.GOOGLE_CLOUD_CREDENTIALS);
    
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      console.log('- GOOGLE_CLOUD_CREDENTIALS length:', process.env.GOOGLE_CLOUD_CREDENTIALS.length);
    }
    
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