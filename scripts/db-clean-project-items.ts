import { pool } from '../server/db';

async function runCleanupMigration() {
  console.log('Starting project_items cleanup migration...');
  const client = await pool.connect();

  try {
    // Start a transaction
    await client.query('BEGIN');

    // Check if there are duplicate columns in project_items
    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'project_items'
      AND column_name IN ('item_code', 'description', 'specification', 'uom', 'make_or_buy', 'supplier');
    `);

    if (columns.rows.length > 0) {
      const columnsToRemove = columns.rows.map(row => row.column_name);
      console.log(`Removing redundant columns from project_items: ${columnsToRemove.join(', ')}`);

      // Create a single ALTER TABLE statement to remove all the columns
      const dropColumnsSQL = `
        ALTER TABLE project_items
        ${columnsToRemove.map(col => `DROP COLUMN IF EXISTS ${col}`).join(',\n')};
      `;

      await client.query(dropColumnsSQL);
      
      console.log('Successfully removed redundant columns from project_items table');
    } else {
      console.log('No redundant columns found in project_items table');
    }

    // Commit the transaction
    await client.query('COMMIT');
    console.log('Database cleanup completed successfully');
    
  } catch (error) {
    // Rollback the transaction in case of error
    await client.query('ROLLBACK');
    console.error('Error during cleanup migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
runCleanupMigration()
  .then(() => {
    console.log('Cleanup migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup migration failed:', error);
    process.exit(1);
  });