/**
 * This script adds the new tables for Dispatch & Shipping module
 */
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

async function addDispatchShippingTables() {
  console.log('Starting to add Dispatch & Shipping tables...');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  try {
    // Read the SQL file
    const sqlFilePath = join(process.cwd(), 'create_dispatch_shipping_tables.sql');
    const sqlQueries = readFileSync(sqlFilePath, 'utf8');

    // Execute the SQL queries
    console.log('Adding Dispatch & Shipping tables...');
    await pool.query(sqlQueries);
    console.log('Dispatch & Shipping tables created successfully.');

    console.log('All tables have been created successfully!');
    console.log('Database migration completed successfully.');
  } catch (error) {
    console.error('Error executing migration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the migration
addDispatchShippingTables().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});