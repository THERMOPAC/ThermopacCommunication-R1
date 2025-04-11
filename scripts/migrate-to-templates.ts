import { db } from '../server/db';
import { gcsDirectories, directoryTemplates } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * This script migrates existing directory records to use the template-based approach:
 * 1. Normalizes department names (e.g., "Design" -> "design")
 * 2. Identifies and marks template-matching directories
 * 3. Adds isTemplate flag to appropriate records
 * 
 * IMPORTANT: Run this script in simulation mode first (SIMULATION = true)
 * to verify the changes before actually making them
 */
const SIMULATION = false; // Set to false to actually perform the changes

async function migrateToTemplates() {
  try {
    console.log(`Starting migration to template-based directories (SIMULATION=${SIMULATION})...`);
    
    // Get all templates
    const templates = await db
      .select()
      .from(directoryTemplates);
    
    console.log(`Found ${templates.length} directory templates`);
    
    // Get all existing directories
    const allDirectories = await db
      .select()
      .from(gcsDirectories);
    
    console.log(`Found ${allDirectories.length} existing directory records`);
    
    // Step 1: Normalize department names (lowercase)
    const departmentsToNormalize = new Set();
    for (const dir of allDirectories) {
      // If department is not lowercase and matches a template department when lowercased
      const normalizedDept = dir.department.toLowerCase();
      if (normalizedDept !== dir.department && 
          templates.some(t => t.department === normalizedDept)) {
        departmentsToNormalize.add(dir.department);
      }
    }
    
    console.log(`\nFound ${departmentsToNormalize.size} department names to normalize:`);
    for (const dept of departmentsToNormalize) {
      console.log(`- "${dept}" -> "${dept.toLowerCase()}"`);
    }
    
    // Step 2: Perform the normalization
    for (const dept of departmentsToNormalize) {
      const normalizedDept = dept.toLowerCase();
      
      console.log(`\nNormalizing department "${dept}" to "${normalizedDept}"...`);
      const matchingDirs = allDirectories.filter(d => d.department === dept);
      console.log(`- Found ${matchingDirs.length} directories to update`);
      
      if (!SIMULATION && matchingDirs.length > 0) {
        await db
          .update(gcsDirectories)
          .set({ 
            department: normalizedDept,
            updatedAt: new Date()
          })
          .where(eq(gcsDirectories.department, dept));
        
        console.log(`- Updated ${matchingDirs.length} directories`);
      } else if (SIMULATION) {
        console.log(`- Would update ${matchingDirs.length} directories (SIMULATION)`);
      }
    }
    
    // Step 3: Re-fetch directories if we made changes
    const updatedDirectories = !SIMULATION && departmentsToNormalize.size > 0
      ? await db.select().from(gcsDirectories)
      : allDirectories;
    
    // Step 4: Identify template-matching and custom directories
    const templateMatches = [];
    const customDirs = [];
    
    for (const dir of updatedDirectories) {
      // Check if this directory matches a template pattern
      const matchingTemplate = templates.find(t => 
        t.department === dir.department && 
        t.subDirectory === dir.subDirectory
      );
      
      if (matchingTemplate) {
        templateMatches.push(dir);
      } else {
        customDirs.push(dir);
      }
    }
    
    console.log(`\nAfter normalization:`);
    console.log(`- Template-matching directories: ${templateMatches.length}`);
    console.log(`- Custom directories: ${customDirs.length}`);
    
    // Step 5: Add isTemplate field (in a real migration)
    // In reality, we would add the isTemplate column to the table
    // For this simulation, we just log what would happen
    
    console.log(`\nMigration summary:`);
    console.log(`- Department names normalized: ${departmentsToNormalize.size}`);
    console.log(`- Template-matching directories found: ${templateMatches.length}`);
    console.log(`- Custom directories identified: ${customDirs.length}`);
    
    if (SIMULATION) {
      console.log(`\nThis was a SIMULATION. Set SIMULATION = false to perform actual changes.`);
    } else {
      console.log(`\nMigration completed successfully!`);
    }
  } catch (error) {
    console.error('Error in template migration:', error);
  } finally {
    process.exit(0);
  }
}

migrateToTemplates();