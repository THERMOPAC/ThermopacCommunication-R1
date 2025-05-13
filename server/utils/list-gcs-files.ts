import { gcsCredentials, gcsBucketName } from './gcs-config';
import { Storage } from '@google-cloud/storage';

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: gcsCredentials,
});
const bucket = storage.bucket(gcsBucketName);

/**
 * Test the connection to GCS by writing and reading a small test file
 * This is useful for debugging permissions issues
 */
export async function testGCSConnection(): Promise<{ 
  success: boolean; 
  canWrite: boolean; 
  canRead: boolean; 
  canList: boolean; 
  message: string; 
}> {
  const testFilePath = 'test/connection-test.txt';
  const testContent = `Connection test file created at ${new Date().toISOString()}`;
  
  let canWrite = false;
  let canRead = false;
  let canList = false;
  let message = '';
  
  try {
    console.log('Testing GCS connection with a small file write/read operation');
    
    // Try to write a test file
    try {
      const file = bucket.file(testFilePath);
      await file.save(Buffer.from(testContent), {
        contentType: 'text/plain',
        metadata: {
          contentType: 'text/plain',
        },
      });
      console.log('✅ Successfully wrote test file to GCS');
      canWrite = true;
    } catch (writeError) {
      console.error('Failed to write test file to GCS:', writeError);
      message += `Write error: ${writeError instanceof Error ? writeError.message : String(writeError)}. `;
    }
    
    // Try to read the test file if write was successful
    if (canWrite) {
      try {
        const file = bucket.file(testFilePath);
        const [exists] = await file.exists();
        
        if (exists) {
          const [fileContent] = await file.download();
          const content = fileContent.toString('utf-8');
          console.log(`✅ Successfully read test file from GCS: ${content.substring(0, 20)}...`);
          canRead = true;
        } else {
          console.error('Test file does not exist in GCS even though write appeared successful');
        }
      } catch (readError) {
        console.error('Failed to read test file from GCS:', readError);
        message += `Read error: ${readError instanceof Error ? readError.message : String(readError)}. `;
      }
    }
    
    // Try to list files in the test directory
    try {
      const [files] = await bucket.getFiles({ prefix: 'test/' });
      console.log(`✅ Successfully listed ${files.length} files in test directory`);
      canList = true;
    } catch (listError) {
      console.error('Failed to list files in test directory:', listError);
      message += `List error: ${listError instanceof Error ? listError.message : String(listError)}. `;
    }
    
    // Try to delete the test file if it was created
    if (canWrite) {
      try {
        await bucket.file(testFilePath).delete();
        console.log('✅ Successfully deleted test file from GCS');
      } catch (deleteError) {
        console.warn('Unable to delete test file (this may require manual cleanup):', deleteError);
      }
    }
    
    return {
      success: canWrite && canRead && canList,
      canWrite,
      canRead,
      canList,
      message: message || 'GCS connection test completed successfully'
    };
  } catch (error) {
    console.error('Unexpected error during GCS connection test:', error);
    return {
      success: false,
      canWrite: false,
      canRead: false,
      canList: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

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