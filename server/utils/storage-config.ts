import { Storage } from '@google-cloud/storage';

/**
 * Configuration for Google Cloud Storage
 * 
 * To use this module:
 * 1. Create a service account in Google Cloud Console
 * 2. Grant it Storage Admin permissions
 * 3. Download the JSON key file
 * 4. Set the GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_BUCKET environment variables
 * 5. Set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of the key file
 *    or provide the key file contents as a JSON string in GOOGLE_CREDENTIALS
 */

// Check if we have the required environment variables
if (!process.env.GOOGLE_CLOUD_BUCKET) {
  console.warn('GOOGLE_CLOUD_BUCKET environment variable is not set. File storage will not work properly.');
}

// Initialize the storage client
let storage: Storage | null = null;

try {
  // If GOOGLE_CREDENTIALS is provided as a JSON string
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      storage = new Storage({ credentials });
    } catch (error) {
      console.error('Failed to parse GOOGLE_CREDENTIALS:', error);
    }
  } else {
    // Otherwise, use the path to the credentials file (GOOGLE_APPLICATION_CREDENTIALS)
    storage = new Storage();
  }
} catch (error) {
  console.error('Failed to initialize Google Cloud Storage:', error);
}

export const bucketName = process.env.GOOGLE_CLOUD_BUCKET || '';

export default storage;