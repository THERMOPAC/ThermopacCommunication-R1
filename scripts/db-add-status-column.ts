import { pool } from '../server/db';

async function addStatusColumn() {
  console.log('Starting migration to add status column to project_items table...');
  const client = await pool.connect();

  try {
    // Start a transaction
    await client.query('BEGIN');

    // Check if the status column already exists in the project_items table
    const checkColumn = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'project_items' 
        AND column_name = 'status'
      );
    `);

    const columnExists = checkColumn.rows[0].exists;

    if (!columnExists) {
      console.log('Adding status column to project_items table...');
      
      // Add the status column with a default value
      await client.query(`
        ALTER TABLE project_items
        ADD COLUMN status TEXT DEFAULT 'Not Started';
      `);
      
      console.log('Successfully added status column to project_items table');
    } else {
      console.log('Status column already exists in project_items table');
    }

    // Commit the transaction
    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    console.error('Error in migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Execute the migration
addStatusColumn()
  .then(() => {
    console.log('Migration script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });