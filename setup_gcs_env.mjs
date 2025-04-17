// Script to set up Google Cloud Storage credentials in the environment
import fs from 'fs';
import { execSync } from 'child_process';

// Get the Google Cloud credentials from the existing environment
// and save them to a temporary file with the correct bucket name
try {
  // Create .env file with the correct bucket name
  fs.writeFileSync('.env', 'GOOGLE_CLOUD_BUCKET=thermopac_storage\n');
  
  // Add the credentials to the .env file if they exist
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    console.log("Found Google Cloud credentials in environment");
    console.log(`Credentials length: ${process.env.GOOGLE_CLOUD_CREDENTIALS.length} characters`);
    
    // Add the credentials to the .env file
    // Note: We're not actually printing the credentials for security reasons
    fs.appendFileSync('.env', 'GOOGLE_CLOUD_CREDENTIALS=<<CREDENTIALS JSON VALUE>>\n');
    
    console.log('Added credentials placeholder to .env file');
    console.log('To complete setup:');
    console.log('1. Get the actual GOOGLE_CLOUD_CREDENTIALS JSON from Development environment');
    console.log('2. Edit the .env file and replace <<CREDENTIALS JSON VALUE>> with the actual JSON');
    console.log('3. Import the .env file in Replit Secrets');
  } else {
    console.log("Google Cloud credentials not found in environment");
    console.log('You will need to manually add the GOOGLE_CLOUD_CREDENTIALS to the .env file');
  }
  
  // Also, save the credentials separately for reference if they exist
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    // Save to a temporary file in a safe location
    if (!fs.existsSync('./temp_secrets')) {
      fs.mkdirSync('./temp_secrets');
    }
    fs.writeFileSync('./temp_secrets/google_credentials.json', process.env.GOOGLE_CLOUD_CREDENTIALS);
    console.log('Saved credentials to ./temp_secrets/google_credentials.json for reference');
  }
  
  console.log('\nSetup completed successfully');
  console.log('File .env has been created with the bucket name');
} catch (error) {
  console.error('Error setting up environment:', error);
}
