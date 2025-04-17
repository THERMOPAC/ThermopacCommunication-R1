import storage, { bucketName } from './storage-config';

/**
 * Utility to check Google Cloud Storage permissions
 * This helps diagnose permission issues in production environments
 */
export async function checkGcsPermissions(): Promise<{
  success: boolean;
  details: {
    bucketExists: boolean;
    canListFiles: boolean;
    canWriteFiles: boolean;
    canDeleteFiles: boolean;
    error?: any;
    environment: string;
    bucket: string;
    credentials: {
      type: string | null;
      projectId: string | null;
      privateKeyId: string | null;
      clientEmail: string | null;
      hasPrivateKey: boolean;
    };
  }
}> {
  console.log('Running comprehensive GCS permissions check...');
  
  const result = {
    success: false,
    details: {
      bucketExists: false,
      canListFiles: false,
      canWriteFiles: false,
      canDeleteFiles: false,
      environment: process.env.NODE_ENV || 'development',
      bucket: bucketName || '(not set)',
      error: undefined as any,
      credentials: {
        type: null,
        projectId: null,
        privateKeyId: null,
        clientEmail: null,
        hasPrivateKey: false
      }
    }
  };
  
  try {
    // Check if credentials are properly set up
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      try {
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        result.details.credentials = {
          type: credentials.type || null,
          projectId: credentials.project_id || null,
          privateKeyId: credentials.private_key_id || null,
          clientEmail: credentials.client_email || null,
          hasPrivateKey: !!credentials.private_key
        };
      } catch (e) {
        console.error('Error parsing GCS credentials:', e);
      }
    }
    
    // Check if bucket exists
    console.log(`Checking if bucket ${bucketName} exists...`);
    const bucket = storage.bucket(bucketName);
    
    try {
      const [exists] = await bucket.exists();
      result.details.bucketExists = exists;
      
      if (!exists) {
        console.error(`Bucket ${bucketName} does not exist or is not accessible`);
        return result;
      }
      
      console.log(`Bucket ${bucketName} exists, checking permissions...`);
      
      // Test listing files
      try {
        const [files] = await bucket.getFiles({ maxResults: 1 });
        result.details.canListFiles = true;
        console.log('Successfully listed files in bucket');
      } catch (e) {
        console.error('Error listing files:', e);
        result.details.error = e;
      }
      
      // Test writing a file
      try {
        const testFile = bucket.file('_permission_test_file.txt');
        await testFile.save('This is a test file to check write permissions', {
          contentType: 'text/plain'
        });
        result.details.canWriteFiles = true;
        console.log('Successfully wrote test file to bucket');
        
        // Test deleting a file
        try {
          await testFile.delete();
          result.details.canDeleteFiles = true;
          console.log('Successfully deleted test file from bucket');
        } catch (e) {
          console.error('Error deleting test file:', e);
        }
      } catch (e) {
        console.error('Error writing test file:', e);
      }
      
      // Overall success
      result.success = result.details.bucketExists && 
                      result.details.canListFiles && 
                      result.details.canWriteFiles;
                      
      return result;
    } catch (bucketError) {
      console.error('Error checking bucket existence:', bucketError);
      result.details.error = bucketError;
      return result;
    }
  } catch (error) {
    console.error('Unexpected error during GCS permissions check:', error);
    result.details.error = error;
    return result;
  }
}