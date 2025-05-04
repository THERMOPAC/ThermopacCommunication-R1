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