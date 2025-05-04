import { ServiceAccount } from '@google-cloud/storage';

// Parse the GCS credentials from environment variables
export let gcsCredentials: ServiceAccount;
export let gcsBucketName: string;

try {
  const credentialsString = process.env.GOOGLE_CLOUD_CREDENTIALS || '';
  if (!credentialsString) {
    console.error('GOOGLE_CLOUD_CREDENTIALS environment variable is not set.');
  } else {
    gcsCredentials = JSON.parse(credentialsString);
    
    // Validate that we have the required fields
    const validation = {
      hasType: !!gcsCredentials.type,
      hasProjectId: !!gcsCredentials.project_id,
      hasClientEmail: !!gcsCredentials.client_email,
      hasPrivateKey: !!gcsCredentials.private_key,
    };
    
    console.log('Credential validation:', validation);
    
    if (!validation.hasType || !validation.hasProjectId || !validation.hasClientEmail || !validation.hasPrivateKey) {
      console.error('Google Cloud credentials are missing required fields.');
    }
  }
} catch (error) {
  console.error('Error parsing Google Cloud credentials:', error);
}

// Get the bucket name from environment variables
gcsBucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';

if (!gcsBucketName) {
  console.error('GOOGLE_CLOUD_BUCKET environment variable is not set.');
}