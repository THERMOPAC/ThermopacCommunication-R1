import storage, { bucketName } from './storage-config';

// Function to check if GCS permissions are set up correctly
export async function checkGcsPermissions() {
  try {
    // Get environment name (development or production)
    const environment = process.env.NODE_ENV || 'development';
    
    // Extract project and service account information
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'unknown';
    let serviceAccount = 'unknown';
    
    // Try to extract service account from credentials if available
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      try {
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        if (credentials && credentials.client_email) {
          serviceAccount = credentials.client_email;
        }
      } catch (e) {
        console.error('Failed to parse GOOGLE_CLOUD_CREDENTIALS to extract service account email');
      }
    }
    
    // Check if the bucket exists
    let bucketExists = false;
    try {
      const [bucketResponse] = await storage.bucket(bucketName).exists();
      bucketExists = bucketResponse;
    } catch (error) {
      console.error('Error checking if bucket exists:', error);
    }
    
    // Check if we can list files in the bucket
    let canListFiles = false;
    try {
      if (bucketExists) {
        await storage.bucket(bucketName).getFiles({ maxResults: 1 });
        canListFiles = true;
      }
    } catch (error) {
      console.error('Error listing files in bucket:', error);
    }
    
    // Check if we can upload files to the bucket
    let canUploadFiles = false;
    try {
      if (bucketExists) {
        const testFile = storage.bucket(bucketName).file('test-permissions.txt');
        await testFile.save('test', { contentType: 'text/plain' });
        canUploadFiles = true;
        
        // Clean up the test file
        try {
          await testFile.delete();
        } catch (deleteError) {
          console.error('Error deleting test file:', deleteError);
        }
      }
    } catch (error) {
      console.error('Error uploading file to bucket:', error);
    }
    
    // Check if we can download files from the bucket
    let canDownloadFiles = false;
    try {
      if (bucketExists && canUploadFiles) {
        // Upload another test file
        const testFile = storage.bucket(bucketName).file('test-download.txt');
        await testFile.save('download test', { contentType: 'text/plain' });
        
        // Try to download it
        const [fileContent] = await testFile.download();
        if (fileContent.toString() === 'download test') {
          canDownloadFiles = true;
        }
        
        // Clean up
        try {
          await testFile.delete();
        } catch (deleteError) {
          console.error('Error deleting test download file:', deleteError);
        }
      }
    } catch (error) {
      console.error('Error downloading file from bucket:', error);
    }

    // Determine if we have all the necessary permissions
    const success = bucketExists && canListFiles && canUploadFiles && canDownloadFiles;
    
    // Build an array of error messages
    const errors: string[] = [];
    if (!bucketExists) {
      errors.push(`The bucket "${bucketName}" does not exist or is not accessible with the current credentials.`);
    }
    if (bucketExists && !canListFiles) {
      errors.push('Cannot list files in the bucket. The service account may be missing the Storage Object Viewer role.');
    }
    if (bucketExists && !canUploadFiles) {
      errors.push('Cannot upload files to the bucket. The service account may be missing the Storage Object Creator role.');
    }
    if (bucketExists && canUploadFiles && !canDownloadFiles) {
      errors.push('Cannot download files from the bucket. The service account may be missing proper download permissions.');
    }
    
    // Check if environment variables are properly set
    if (!process.env.GOOGLE_CLOUD_BUCKET) {
      errors.push('GOOGLE_CLOUD_BUCKET environment variable is not set.');
    }
    if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
      errors.push('GOOGLE_CLOUD_PROJECT_ID environment variable is not set.');
    }
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
      errors.push('GOOGLE_CLOUD_CREDENTIALS environment variable is not set.');
    }
    
    return {
      success,
      permissions: {
        bucketExists,
        canListFiles,
        canUploadFiles,
        canDownloadFiles
      },
      environment: {
        bucketName,
        projectId,
        serviceAccount,
        environment
      },
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('Error checking GCS permissions:', error);
    
    return {
      success: false,
      permissions: {
        bucketExists: false,
        canListFiles: false,
        canUploadFiles: false,
        canDownloadFiles: false
      },
      environment: {
        bucketName: process.env.GOOGLE_CLOUD_BUCKET || 'unknown',
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'unknown',
        serviceAccount: 'unknown',
        environment: process.env.NODE_ENV || 'development'
      },
      errors: [
        'Failed to initialize Google Cloud Storage client. Check your credential configuration.',
        error instanceof Error ? error.message : String(error)
      ]
    };
  }
}