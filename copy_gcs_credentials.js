// Script to safely extract and print Google Cloud credentials
const fs = require('fs');

// Get the credentials and bucket name
const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
const bucket = process.env.GOOGLE_CLOUD_BUCKET;

// Create a clean output directory
if (!fs.existsSync('./temp_secrets')) {
  fs.mkdirSync('./temp_secrets');
}

// Write the credentials to a temporary file
fs.writeFileSync('./temp_secrets/google_credentials.json', credentials);

// Write the bucket name (with correction for typo)
const correctedBucket = bucket === 'thermopac_sorage' ? 'thermopac_storage' : bucket;
fs.writeFileSync('./temp_secrets/bucket_name.txt', correctedBucket);

console.log('Credentials and bucket name extracted to ./temp_secrets/');
console.log('IMPORTANT: The credentials file contains sensitive information.');
console.log('Bucket Name:', correctedBucket);
