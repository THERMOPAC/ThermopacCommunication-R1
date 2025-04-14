import { sql } from "drizzle-orm";
import { db } from "../server/db";
import * as schema from "../shared/schema";

/**
 * This script adds the latestRevision column to the master_items table
 * and initializes it with a value of 0 for all existing items.
 */
async function addLatestRevisionColumn() {
  console.log("Adding latestRevision column to master_items table...");

  // Check if the column already exists
  const checkColumn = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'master_items' AND column_name = 'latest_revision'
  `);

  // If the column doesn't exist, add it
  if (checkColumn.rows.length === 0) {
    console.log("Column 'latest_revision' doesn't exist. Adding it now...");
    
    try {
      // Add the latestRevision column with a default value of 0
      await db.execute(sql`
        ALTER TABLE master_items
        ADD COLUMN latest_revision INTEGER DEFAULT 0
      `);
      
      console.log("Successfully added latestRevision column to master_items table");
      
      // Update existing master items with latest revision from GCS if available
      // We'll do this in a separate step with a helper script
      
    } catch (error) {
      console.error("Error adding latestRevision column:", error);
      throw error;
    }
  } else {
    console.log("Column 'latest_revision' already exists. No changes made.");
  }

  console.log("Migration completed successfully!");
  process.exit(0);
}

addLatestRevisionColumn().catch((err) => {
  console.error("Error during migration:", err);
  process.exit(1);
});