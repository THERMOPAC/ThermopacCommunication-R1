/**
 * This script checks for synchronization issues between WPQR database records and local files
 * It helps identify missing files or database entries
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

// Get database connection string from environment variables
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Define the local WPQR directory
const LOCAL_WPQR_DIRECTORY = path.join(process.cwd(), 'wpqr_documents');

// Ensure the directory exists
if (!fs.existsSync(LOCAL_WPQR_DIRECTORY)) {
  console.log(`Creating directory: ${LOCAL_WPQR_DIRECTORY}`);
  fs.mkdirSync(LOCAL_WPQR_DIRECTORY, { recursive: true });
}

// Initialize database client
const client = new Client({
  connectionString: dbUrl,
});

async function main() {
  try {
    // Connect to database
    await client.connect();
    console.log('Connected to database successfully');

    // Get all WPQR documents from database
    const { rows: wpqrDocuments } = await client.query(
      'SELECT id, document_id AS "documentId", title, file_path AS "filePath" FROM wpqr_documents'
    );
    console.log(`Found ${wpqrDocuments.length} WPQR documents in database`);

    // Get all files in the local directory
    const files = fs.readdirSync(LOCAL_WPQR_DIRECTORY);
    console.log(`Found ${files.length} files in local directory`);

    // Track issues
    const missingFiles = [];
    const missingDbEntries = [];
    const issues = [];

    // Check for database entries without files
    for (const doc of wpqrDocuments) {
      const expectedFilename = `${doc.documentId}.pdf`;
      const expectedPath = path.join(LOCAL_WPQR_DIRECTORY, expectedFilename);
      
      if (!fs.existsSync(expectedPath)) {
        missingFiles.push({
          id: doc.id,
          documentId: doc.documentId,
          title: doc.title,
          expectedPath
        });
      }
    }

    // Check for files without database entries
    for (const file of files) {
      if (file.endsWith('.pdf')) {
        const documentId = path.basename(file, '.pdf');
        const dbEntry = wpqrDocuments.find(doc => doc.documentId === documentId);
        
        if (!dbEntry) {
          missingDbEntries.push({
            filename: file,
            documentId
          });
        }
      }
    }

    // Print issues
    console.log('\n===== SYNCING ISSUES =====');
    
    if (missingFiles.length === 0 && missingDbEntries.length === 0) {
      console.log('✅ No synchronization issues found! Everything is in perfect sync.');
    } else {
      console.log(`Found ${missingFiles.length} database entries without files`);
      console.log(`Found ${missingDbEntries.length} local files without database entries`);
      
      if (missingFiles.length > 0) {
        console.log('\n=== Database Entries Without Local Files ===');
        missingFiles.forEach(item => {
          console.log(`- ${item.documentId}: "${item.title}" (ID: ${item.id})`);
          console.log(`  Expected file: ${item.expectedPath}`);
        });
      }
      
      if (missingDbEntries.length > 0) {
        console.log('\n=== Local Files Without Database Entries ===');
        missingDbEntries.forEach(item => {
          console.log(`- ${item.filename} (Document ID: ${item.documentId})`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close database connection
    await client.end();
  }
}

main();