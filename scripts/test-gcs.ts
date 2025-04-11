import { Storage } from '@google-cloud/storage';

async function testGcsConnection() {
  try {
    console.log('Testing Google Cloud Storage connection...');
    console.log('GOOGLE_CLOUD_PROJECT_ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
    console.log('GOOGLE_CLOUD_BUCKET:', process.env.GOOGLE_CLOUD_BUCKET);

    // Initialize Storage
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });

    const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac-project-files';
    const bucket = storage.bucket(bucketName);

    // Check if bucket exists
    console.log(`Checking if bucket '${bucketName}' exists...`);
    const [exists] = await bucket.exists();
    
    if (exists) {
      console.log(`✓ Bucket '${bucketName}' exists!`);
      
      // List files in the bucket
      console.log(`Listing files in bucket '${bucketName}'...`);
      const [files] = await bucket.getFiles();
      console.log(`Found ${files.length} files/directories`);
      files.forEach(file => {
        console.log(`- ${file.name}`);
      });

      // Create a test directory
      const testDirName = 'test-directory/';
      const testDir = bucket.file(testDirName);
      const [testDirExists] = await testDir.exists();
      
      if (!testDirExists) {
        console.log(`Creating test directory '${testDirName}'...`);
        await testDir.save('', { contentType: 'application/x-directory' });
        console.log(`✓ Test directory created!`);
      } else {
        console.log(`Test directory '${testDirName}' already exists`);
      }
    } else {
      console.error(`× Bucket '${bucketName}' does not exist!`);
    }
  } catch (error) {
    console.error('Error testing GCS connection:', error);
  }
}

// Run the test
testGcsConnection()
  .then(() => {
    console.log('GCS test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('GCS test failed:', error);
    process.exit(1);
  });