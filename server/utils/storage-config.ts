import { Storage } from '@google-cloud/storage';

/**
 * This file contains configuration for Google Cloud Storage.
 * To use GCS, you need to provide:
 * 1. Google Cloud credentials (either as a JSON file or environment variables)
 * 2. A bucket name
 */

// Get bucket name from environment variable and fix common issues
let configuredBucketName = process.env.GOOGLE_CLOUD_BUCKET;
if (configuredBucketName) {
  // Trim spaces and fix common typos
  configuredBucketName = configuredBucketName.trim();
  if (configuredBucketName === 'thermopac_sorage') {
    configuredBucketName = 'thermopac_storage';
  }
}

// Use the corrected bucket name or default to thermopac_storage
export const bucketName = configuredBucketName || 'thermopac_storage';
console.log(`Using GCS bucket name: ${bucketName}`);

// Function to create storage client
function createStorageClient() {
  try {
    // Check if we have explicit credentials in the environment
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      // Parse the credentials from the environment variable
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
      
      // Create a Storage client with explicit credentials
      return new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        credentials: credentials
      });
    } else {
      // If no explicit credentials, use default client (works in Google Cloud environments)
      console.log('No explicit GCS credentials found, using default authentication');
      return new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });
    }
  } catch (error) {
    console.error('Error creating GCS client:', error);
    // Return a storage instance anyway, but it will likely fail on operations
    return new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    });
  }
}

// Create the storage client
const storage = createStorageClient();

// Export the configured storage instance
export default storage;