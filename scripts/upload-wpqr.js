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
    console.log('\n=== Create a WPQR Document ===');
    
    // Get document ID
    const docId = await new Promise(resolve => {
      rl.question('Enter WPQR document ID (e.g., "WPQR-10" or just "10"): ', answer => {
        resolve(answer.trim());
      });
    });
    
    // Format document ID if needed
    const formattedDocId = docId.startsWith('WPQR-') ? docId : `WPQR-${docId}`;
    
    // Create empty document
    const filePath = path.join(LOCAL_WPQR_DIRECTORY, `${formattedDocId}.pdf`);
    
    // Create simple PDF content (just text for now)
    const content = `${formattedDocId} Document\n\nThis is a placeholder document for ${formattedDocId}.\nCreated on ${new Date().toISOString()}`;
    
    // Write the file
    fs.writeFileSync(filePath, content);
    
    console.log(`\n✅ Success! Created document: ${filePath}`);
    console.log('This document can now be downloaded through the application.');
    
    // Ask if user wants to continue
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
  } catch (error) {
    console.error('Error:', error);
    rl.close();
  }
}

console.log('\n🔍 WPQR Document Local Upload Tool');
console.log('This tool helps you create local WPQR documents when Google Cloud Storage is unavailable.');
createDocument();

// Event handler for readline close
rl.on('close', () => {
  console.log('\nThank you for using the WPQR upload tool. Goodbye!');
  process.exit(0);
});