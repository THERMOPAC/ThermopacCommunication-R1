import { Storage } from '@google-cloud/storage';

/**
 * This file contains configuration for Google Cloud Storage.
 * To use GCS, you need to provide:
 * 1. Google Cloud credentials (either as a JSON file or environment variables)
 * 2. A bucket name
 */

// Get bucket name from environment variable
export const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac-project-files';

// Create a Storage client
// Google Cloud will auto-detect credentials from the environment
// or from a service account key file if specified
const storage = new Storage({
  // For local development, we'll use a mock implementation
  // In production, this should be provided through environment variables
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'mock-project-id'
});

// Export the configured storage instance
export default storage;