/**
 * Server-side test script for drawing search endpoint
 * 
 * Usage:
 *   npx tsx server/test-utils/test-drawings-api.js [drawing-number]
 */

import { Storage } from '@google-cloud/storage';
import { bucketName } from '../utils/storage-config.js';

async function testDrawingsEndpoint(drawingNo = '4906001001001000') {
  try {
    console.log('DIRECT STORAGE TEST');
    console.log('------------------');
    
    // Test direct storage access
    console.log(`Looking for drawing files with number: ${drawingNo}`);
    
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);
    
    console.log(`Using bucket: ${bucketName}`);
    
    const [files] = await bucket.getFiles();
    console.log(`Total files in bucket: ${files.length}`);
    
    // Filter to only include drawing files containing the drawing number
    const matchingFiles = files.filter(file => {
      const filePath = file.name;
      const fileName = filePath.split('/').pop() || '';
      
      // Skip non-drawing files
      if (!filePath.toLowerCase().endsWith('.pdf') && 
          !filePath.toLowerCase().endsWith('.dwg') && 
          !filePath.toLowerCase().endsWith('.dxf')) {
        return false;
      }
      
      // Check if drawing number appears in the path (case-insensitive)
      return filePath.toLowerCase().includes(drawingNo.toLowerCase());
    });
    
    console.log(`Found ${matchingFiles.length} matching drawing files`);
    
    // Display the first few files found
    if (matchingFiles.length > 0) {
      console.log('\nMatching files:');
      matchingFiles.slice(0, 5).forEach(file => {
        console.log(`- ${file.name}`);
      });
    } else {
      console.log('\nNo matching files found');
      
      // Show a sample of PDF files in the bucket
      const pdfFiles = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length > 0) {
        console.log('\nSample PDF files in bucket:');
        pdfFiles.slice(0, 5).forEach(file => {
          console.log(`- ${file.name}`);
        });
      }
    }
    
    return matchingFiles;
  } catch (error) {
    console.error('Error in direct storage test:', error);
    return [];
  }
}

// Run the test if executed directly
if (process.argv[1].includes('test-drawings-api.js')) {
  // Get drawing number from command line argument or use default
  const drawingNo = process.argv[2] || '4906001001001000';
  
  testDrawingsEndpoint(drawingNo)
    .then(() => {
      console.log('\nTest completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}