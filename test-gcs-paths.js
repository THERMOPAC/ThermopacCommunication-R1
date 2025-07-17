import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';

async function checkFilePaths() {
  console.log('Testing GCS file paths for Material Identification documents...');
  
  const bucket = storage.bucket(bucketName);
  
  // Test paths for MI-2025-22 (document ID 64)
  const testPaths = [
    'QMS/Material_Identification/2025-1/MI-2025-22/Other Document.PDF',
    'QMS/Material_Identification/MI-2025-22/Other Document.PDF',
    'QMS/Material_Identification/2025-1/MI-2025-22/thermopac business letter .PDF',
    'QMS/Material_Identification/MI-2025-22/thermopac business letter .PDF'
  ];
  
  for (const path of testPaths) {
    try {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      
      if (exists) {
        const [metadata] = await file.getMetadata();
        console.log(`✅ FOUND: ${path}`);
        console.log(`   Size: ${metadata.size} bytes`);
        console.log(`   Content-Type: ${metadata.contentType}`);
        console.log(`   Created: ${metadata.timeCreated}`);
        console.log('');
      } else {
        console.log(`❌ NOT FOUND: ${path}`);
      }
    } catch (error) {
      console.log(`❌ ERROR checking ${path}: ${error.message}`);
    }
  }
  
  // List all files in Material_Identification directory
  console.log('\nListing all files in QMS/Material_Identification/ directory:');
  const [files] = await bucket.getFiles({ prefix: 'QMS/Material_Identification/' });
  
  files.forEach((file, index) => {
    if (index < 20) { // Show first 20 files
      console.log(`${index + 1}. ${file.name} (${file.metadata.size} bytes)`);
    }
  });
  
  if (files.length > 20) {
    console.log(`... and ${files.length - 20} more files`);
  }
}

checkFilePaths().catch(console.error);