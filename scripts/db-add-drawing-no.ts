import { pool } from '../server/db';

async function addDrawingNoColumn() {
  console.log('Starting database migration to add drawing_no column...');
  const client = await pool.connect();

  try {
    // Start a transaction
    await client.query('BEGIN');

    // 1. Check if the drawing_no column already exists in master_items table
    const checkColumnExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'master_items' 
        AND column_name = 'drawing_no'
      );
    `);

    if (!checkColumnExists.rows[0].exists) {
      console.log('Adding drawing_no column to master_items table...');
      
      await client.query(`
        ALTER TABLE master_items 
        ADD COLUMN drawing_no TEXT;
      `);
      
      console.log('Successfully added drawing_no column to master_items table');
    } else {
      console.log('drawing_no column already exists in master_items table');
    }

    // Commit the transaction
    await client.query('COMMIT');
    console.log('Database migration completed successfully');
  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    console.error('Error during database migration:', error);
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

// Run the migration
addDrawingNoColumn()
  .then(() => {
    console.log('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });