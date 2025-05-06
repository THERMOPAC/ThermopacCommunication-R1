/**
 * This script helps check synchronization between the database and local WPQR document files
 * It identifies:
 * 1. WPQR documents in the database that don't have local files
 * 2. Local files that don't have corresponding database entries
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');
const readline = require('readline');
require('dotenv').config();

// Create interface for CLI input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configure Neon database client
const dbConfig = { webSocketConstructor: ws };

// Ensure we have a DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Initialize database pool with connection string from environment variables
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ...dbConfig });

// Define the local WPQR directory
const LOCAL_WPQR_DIRECTORY = path.join(process.cwd(), 'wpqr_documents');

// Ensure the directory exists
if (!fs.existsSync(LOCAL_WPQR_DIRECTORY)) {
  console.log(`Creating directory: ${LOCAL_WPQR_DIRECTORY}`);
  fs.mkdirSync(LOCAL_WPQR_DIRECTORY, { recursive: true });
}

/**
 * Get all WPQR documents from the database
 */
async function getWpqrDocumentsFromDb() {
  try {
    const result = await pool.query(
      'SELECT id, document_id, title, file_path FROM wpqr_documents ORDER BY id'
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching WPQR documents from database:', error);
    return [];
  }
}

/**
 * Get all local WPQR document files
 */
function getLocalWpqrFiles() {
  try {
    const files = fs.readdirSync(LOCAL_WPQR_DIRECTORY);
    return files.filter(file => file.endsWith('.pdf')); // Only include PDF files
  } catch (error) {
    console.error('Error reading local WPQR directory:', error);
    return [];
  }
}

/**
 * Normalize document ID for comparison
 * Ensures format is consistent (WPQR-N) regardless of input format
 */
function normalizeDocumentId(id) {
  if (!id) return '';
  id = id.toString().toUpperCase().trim();
  
  // Convert numeric ID to WPQR-N format
  if (/^\d+$/.test(id)) {
    return `WPQR-${id}`;
  }
  
  // If already in WPQR-N format, return as is
  if (/^WPQR-\d+$/i.test(id)) {
    return id.toUpperCase();
  }
  
  // If it's a filename with .pdf extension, extract and normalize
  if (id.toUpperCase().endsWith('.PDF')) {
    const baseFileName = path.basename(id, '.pdf');
    return normalizeDocumentId(baseFileName);
  }
  
  return id;
}

/**
 * Main function to check synchronization between database and local files
 */
async function checkSynchronization() {
  try {
    console.log('\n🔍 WPQR Document Synchronization Checker');
    console.log('Checking for mismatches between database and local files...\n');
    
    // Get all documents from database
    const dbDocuments = await getWpqrDocumentsFromDb();
    console.log(`Found ${dbDocuments.length} documents in the database.`);
    
    // Get all files in local directory
    const localFiles = getLocalWpqrFiles();
    console.log(`Found ${localFiles.length} files in local WPQR directory.`);
    
    // Normalize document IDs for comparison
    const normalizedDbDocIds = dbDocuments.map(doc => ({
      id: doc.id,
      normalizedId: normalizeDocumentId(doc.document_id),
      documentId: doc.document_id,
      title: doc.title,
      filePath: doc.file_path
    }));
    
    const normalizedLocalFileIds = localFiles.map(file => {
      const baseFileName = path.basename(file, '.pdf');
      return {
        fileName: file,
        normalizedId: normalizeDocumentId(baseFileName)
      };
    });
    
    // Find database entries without local files
    const missingLocalFiles = normalizedDbDocIds.filter(dbDoc => 
      !normalizedLocalFileIds.some(localFile => localFile.normalizedId === dbDoc.normalizedId)
    );
    
    // Find local files without database entries
    const missingDbEntries = normalizedLocalFileIds.filter(localFile => 
      !normalizedDbDocIds.some(dbDoc => dbDoc.normalizedId === localFile.normalizedId)
    );
    
    // Display results
    console.log('\n===== RESULTS =====');
    
    // Documents in database missing local files
    console.log('\nDatabase entries that are missing local files:');
    if (missingLocalFiles.length === 0) {
      console.log('✅ No missing files! All database entries have corresponding local files.');
    } else {
      console.log(`⚠️ Found ${missingLocalFiles.length} database entries without local files:`);
      missingLocalFiles.forEach(doc => {
        console.log(`- ID: ${doc.id}, Document ID: ${doc.documentId}, Title: ${doc.title}`);
        console.log(`  Expected local file: ${doc.normalizedId}.pdf`);
      });
    }
    
    // Local files missing database entries
    console.log('\nLocal files that don\'t have database entries:');
    if (missingDbEntries.length === 0) {
      console.log('✅ No orphaned files! All local files have corresponding database entries.');
    } else {
      console.log(`⚠️ Found ${missingDbEntries.length} local files without database entries:`);
      missingDbEntries.forEach(file => {
        console.log(`- File: ${file.fileName}, Normalized ID: ${file.normalizedId}`);
      });
    }
    
    // Provide recommendations
    console.log('\n===== RECOMMENDATIONS =====');
    
    if (missingLocalFiles.length > 0) {
      console.log('\nTo create missing local files:');
      console.log('Run `node scripts/upload-wpqr.js` and create files for the following document IDs:');
      missingLocalFiles.forEach(doc => {
        console.log(`- ${doc.documentId}`);
      });
    }
    
    if (missingDbEntries.length > 0) {
      console.log('\nTo handle orphaned local files:');
      console.log('1. Option: Delete these files if they\'re not needed');
      console.log('2. Option: Create database entries for them via the web interface');
    }
    
    console.log('\nDone! Synchronization check complete.');
    
    // Close the database connection
    await pool.end();
    
    // Close the readline interface
    rl.close();
  } catch (error) {
    console.error('Error during synchronization check:', error);
    // Close the database connection
    try {
      await pool.end();
    } catch (err) {
      // Ignore error during cleanup
    }
    // Close the readline interface
    rl.close();
  }
}

// Run the synchronization check
checkSynchronization();

// Event handler for readline close
rl.on('close', () => {
  console.log('\nThank you for using the WPQR synchronization checker. Goodbye!');
  process.exit(0);
});