/**
 * This script runs the migrations for the After-Sales module
 * It creates all the necessary tables for service requests, activities, parts, contracts, etc.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ws from 'ws';

// Configure Neon to use ws for WebSocket
neonConfig.webSocketConstructor = ws;

// Get the current file path and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAfterSalesMigration() {
  console.log('Starting After-Sales module migration...');
  
  // Initialize DB connection
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Read the SQL file
    const sqlFilePath = path.resolve(__dirname, '../create_after_sales_tables.sql');
    console.log(`Reading SQL file from: ${sqlFilePath}`);
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL commands
    console.log('Executing After-Sales tables migration...');
    await pool.query(sqlContent);
    
    console.log('After-Sales tables created successfully!');
  } catch (error) {
    console.error('Error running After-Sales tables migration:', error);
    throw error;
  } finally {
    // Close the DB connection
    await pool.end();
  }
}

// Run the migration
runAfterSalesMigration()
  .then(() => {
    console.log('After-Sales migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });