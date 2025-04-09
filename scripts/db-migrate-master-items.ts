import { pool } from '../server/db';

async function runMigration() {
  console.log('Starting database migration...');
  const client = await pool.connect();

  try {
    // Start a transaction
    await client.query('BEGIN');

    // 1. Check if master_items table exists
    const checkMasterItemsTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'master_items'
      );
    `);

    if (!checkMasterItemsTable.rows[0].exists) {
      console.log('Creating master_items table...');
      
      await client.query(`
        CREATE TABLE master_items (
          id SERIAL PRIMARY KEY,
          item_code TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          specification TEXT,
          uom TEXT NOT NULL,
          make_or_buy TEXT,
          standard_cost DECIMAL(12,2),
          supplier TEXT,
          notes TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      
      console.log('Successfully created master_items table');
    } else {
      console.log('master_items table already exists');
    }

    // 2. Check if the project_items table has the necessary columns
    const checkItemIdColumn = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'project_items' 
        AND column_name = 'item_id'
      );
    `);

    if (!checkItemIdColumn.rows[0].exists) {
      console.log('Updating project_items table structure...');
      
      // Check if the table has an item_code column
      const checkItemCodeColumn = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'project_items' 
          AND column_name = 'item_code'
        );
      `);
      
      if (checkItemCodeColumn.rows[0].exists) {
        console.log('Found item_code column in project_items, migrating data...');
        
        // Step 1: Add the item_id column
        await client.query(`
          ALTER TABLE project_items 
          ADD COLUMN item_id INTEGER;
        `);
        
        // Step 2: Migrate existing items to master_items table
        const existingItems = await client.query(`
          SELECT DISTINCT item_code, description, uom, specification, make_or_buy
          FROM project_items
          WHERE item_code IS NOT NULL AND item_code != ''
        `);
        
        for (const item of existingItems.rows) {
          // Insert into master_items if not exists
          const result = await client.query(`
            INSERT INTO master_items(item_code, description, specification, uom, make_or_buy)
            VALUES($1, $2, $3, $4, $5)
            ON CONFLICT (item_code) DO UPDATE
            SET description = EXCLUDED.description,
                specification = EXCLUDED.specification,
                uom = EXCLUDED.uom,
                make_or_buy = EXCLUDED.make_or_buy
            RETURNING id
          `, [
            item.item_code, 
            item.description || 'No description', 
            item.specification, 
            item.uom || 'Nos', 
            item.make_or_buy
          ]);
          
          const masterId = result.rows[0].id;
          
          // Update project_items to reference the master item
          await client.query(`
            UPDATE project_items
            SET item_id = $1
            WHERE item_code = $2
          `, [masterId, item.item_code]);
        }
        
        // Step 3: Make item_id NOT NULL and add foreign key constraint
        await client.query(`
          ALTER TABLE project_items 
          ALTER COLUMN item_id SET NOT NULL,
          ADD CONSTRAINT fk_master_item FOREIGN KEY (item_id) REFERENCES master_items(id)
        `);
      } else {
        // If item_code doesn't exist, this is a fresh table structure
        console.log('Creating fresh project_items table structure...');
        
        // Check if project_items table exists
        const checkProjectItemsTable = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'project_items'
          );
        `);
        
        if (checkProjectItemsTable.rows[0].exists) {
          // Drop and recreate the table
          await client.query(`DROP TABLE project_items;`);
        }
        
        await client.query(`
          CREATE TABLE project_items (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            project_code TEXT NOT NULL,
            item_id INTEGER NOT NULL REFERENCES master_items(id),
            quantity DECIMAL(10,2) NOT NULL,
            estimated_cost DECIMAL(12,2),
            actual_cost DECIMAL(12,2),
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `);
      }
      
      console.log('Successfully updated project_items table structure');
    } else {
      console.log('project_items table already has the necessary structure');
    }

    // Commit the transaction
    await client.query('COMMIT');
    console.log('Database migration completed successfully');
    
  } catch (error) {
    // Rollback the transaction in case of error
    await client.query('ROLLBACK');
    console.error('Error during migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });