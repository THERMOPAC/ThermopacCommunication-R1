import { gcsCredentials, gcsBucketName } from './gcs-config';
import { Storage } from '@google-cloud/storage';

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: gcsCredentials,
});
const bucket = storage.bucket(gcsBucketName);

/**
 * List files in a specific directory in Google Cloud Storage
 */
export async function listFilesInDirectory(directoryPath: string): Promise<string[]> {
  try {
    console.log(`Listing files in GCS directory: ${directoryPath}`);
    
    // Remove leading slash if present
    const normalizePath = directoryPath.startsWith('/') 
      ? directoryPath.substring(1) 
      : directoryPath;
    
    // Add trailing slash if not present (for directory filtering)
    const dirPath = normalizePath.endsWith('/') 
      ? normalizePath 
      : `${normalizePath}/`;
    
    console.log(`Normalized directory path: ${dirPath}`);
    
    // List files with the prefix (directory path)
    const [files] = await bucket.getFiles({ prefix: dirPath });
    
    // Log the file paths
    const filePaths = files.map(file => file.name);
    console.log(`Found ${filePaths.length} files in directory ${dirPath}`);
    filePaths.forEach(path => console.log(`- ${path}`));
    
    return filePaths;
  } catch (error) {
    console.error('Error listing files in GCS directory:', error);
    throw error;
  }
}

/**
 * List files that match a specific pattern or prefix
 */
export async function listFiles(prefixPattern: string): Promise<string[]> {
  try {
    console.log(`Listing files in GCS with pattern: ${prefixPattern}`);
    
    // Remove leading slash if present
    const normalizedPattern = prefixPattern.startsWith('/') 
      ? prefixPattern.substring(1) 
      : prefixPattern;
    
    // List files with the prefix pattern
    const [files] = await bucket.getFiles({ prefix: normalizedPattern });
    
    // Return the file paths
    const filePaths = files.map(file => file.name);
    console.log(`Found ${filePaths.length} files matching pattern ${normalizedPattern}`);
    
    return filePaths;
  } catch (error) {
    console.error('Error listing files with pattern in GCS:', error);
    return [];
  }
}

/**
 * Get a signed URL for a file in GCS
 */
export async function getSignedUrl(filePath: string): Promise<string> {
  try {
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    
    if (!exists) {
      console.error(`File ${filePath} does not exist in GCS`);
      return '';
    }
    
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL expires in 7 days
    });
    
    return url;
  } catch (error) {
    console.error(`Error getting signed URL for ${filePath}:`, error);
    return '';
  }
}