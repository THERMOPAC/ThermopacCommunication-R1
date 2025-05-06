/**
 * This script helps upload WPQR documents directly to the local directory
 * It's useful when Google Cloud Storage permissions are not working correctly
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create interface for CLI input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Define the local WPQR directory
const LOCAL_WPQR_DIRECTORY = path.join(process.cwd(), 'wpqr_documents');

// Ensure the directory exists
if (!fs.existsSync(LOCAL_WPQR_DIRECTORY)) {
  console.log(`Creating directory: ${LOCAL_WPQR_DIRECTORY}`);
  fs.mkdirSync(LOCAL_WPQR_DIRECTORY, { recursive: true });
}

// List existing WPQR documents
console.log('\nExisting WPQR documents:');
const files = fs.readdirSync(LOCAL_WPQR_DIRECTORY);
if (files.length === 0) {
  console.log('No documents found');
} else {
  files.forEach(file => console.log(`- ${file}`));
}

// Main function to create a document
async function createDocument() {
  try {
    console.log('\n=== Create or Update a WPQR Document ===');
    
    // Get document ID
    const docId = await new Promise(resolve => {
      rl.question('Enter WPQR document ID (e.g., "WPQR-10" or just "10"): ', answer => {
        resolve(answer.trim());
      });
    });
    
    // Format document ID if needed
    const formattedDocId = docId.startsWith('WPQR-') ? docId : `WPQR-${docId}`;
    
    // Create file path
    const filePath = path.join(LOCAL_WPQR_DIRECTORY, `${formattedDocId}.pdf`);
    
    // Check if file already exists
    const fileExists = fs.existsSync(filePath);
    if (fileExists) {
      console.log(`\n⚠️ Warning: File ${filePath} already exists.`);
      const overwrite = await new Promise(resolve => {
        rl.question('Do you want to overwrite it? (y/n): ', answer => {
          resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
        });
      });
      
      if (!overwrite) {
        console.log('Skipping this document.');
        await askContinue();
        return;
      }
    }
    
    // Get document title
    const title = await new Promise(resolve => {
      rl.question('Enter document title: ', answer => {
        resolve(answer.trim());
      });
    });
    
    // Create document content with more detailed text
    const content = `${formattedDocId} - ${title}\n\n` +
      `This is a placeholder document for ${formattedDocId}.\n` +
      `Title: ${title}\n` +
      `Created on: ${new Date().toISOString()}\n\n` +
      `Note: This file was created by the local WPQR upload tool as a placeholder.\n` +
      `It can be replaced with the actual document once GCS permissions are fixed.`;
    
    // Write the file
    fs.writeFileSync(filePath, content);
    
    console.log(`\n✅ Success! ${fileExists ? 'Updated' : 'Created'} document: ${filePath}`);
    console.log('This document can now be downloaded through the application.');
    console.log('Note: If this document already exists in the database, no additional');
    console.log('database entry needs to be created. The file will be served from the local directory.');
    
    await askContinue();
  } catch (error) {
    console.error('Error:', error);
    rl.close();
  }
}

// Helper function to ask if user wants to continue
async function askContinue() {
  const continueResponse = await new Promise(resolve => {
    rl.question('\nDo you want to create another document? (y/n): ', answer => {
      resolve(answer.toLowerCase().trim());
    });
  });
  
  if (continueResponse === 'y' || continueResponse === 'yes') {
    await createDocument();
  } else {
    rl.close();
  }
}

console.log('\n🔍 WPQR Document Local Upload Tool');
console.log('This tool helps you create local WPQR documents when Google Cloud Storage is unavailable.');
console.log('Note: This tool only creates local files and does NOT add entries to the database.');
console.log('Use the web interface to create new WPQR records in the database.');
createDocument();

// Event handler for readline close
rl.on('close', () => {
  console.log('\nThank you for using the WPQR upload tool. Goodbye!');
  process.exit(0);
});