/**
 * This script adds the new tables for Production and Quality Management modules
 */
import { db } from "../server/db";
import { readFileSync } from "fs";
import path from "path";
import { sql } from "drizzle-orm";

async function addProductionQualityTables() {
  console.log("Starting to add Production and Quality Management tables...");

  try {
    // Production Management Tables
    console.log("Adding Production Management tables...");
    const productionSql = readFileSync(path.join(process.cwd(), 'create_production_management_tables.sql'), 'utf8');
    await db.execute(sql.raw(productionSql));
    console.log("Production Management tables created successfully.");

    // Quality Management Tables
    console.log("Adding Quality Management tables...");
    const qualitySql = readFileSync(path.join(process.cwd(), 'create_quality_management_tables.sql'), 'utf8');
    await db.execute(sql.raw(qualitySql));
    console.log("Quality Management tables created successfully.");

    console.log("All tables have been created successfully!");
  } catch (error) {
    console.error("Error creating tables:", error);
    process.exit(1);
  }
}

// Run the function
addProductionQualityTables().then(() => {
  console.log("Database migration completed successfully.");
  process.exit(0);
}).catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});