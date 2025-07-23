import { Storage } from '@google-cloud/storage';
import { pool } from '../db';

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}'),
});
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage');

interface MigrationResult {
  inspectionOrderNumber: string;
  projectCode: string;
  migratedFiles: string[];
  errors: string[];
  success: boolean;
}

interface MigrationSummary {
  totalInspectionOrders: number;
  successfulMigrations: number;
  failedMigrations: number;
  totalFilesMigrated: number;
  totalFilesDeleted: number;
  details: MigrationResult[];
  errors: string[];
}

/**
 * Lists all files in a GCS directory
 */
async function listFilesInDirectory(directoryPath: string): Promise<string[]> {
  try {
    const [files] = await bucket.getFiles({
      prefix: directoryPath,
      delimiter: '/',
    });
    
    return files.map(file => file.name);
  } catch (error) {
    console.error(`Error listing files in directory ${directoryPath}:`, error);
    return [];
  }
}

/**
 * Copy a file from old path to new path in GCS
 */
async function copyFile(oldPath: string, newPath: string): Promise<boolean> {
  try {
    const sourceFile = bucket.file(oldPath);
    const destinationFile = bucket.file(newPath);
    
    // Check if source file exists
    const [exists] = await sourceFile.exists();
    if (!exists) {
      console.log(`Source file does not exist: ${oldPath}`);
      return false;
    }
    
    // Check if destination already exists to avoid overwriting
    const [destExists] = await destinationFile.exists();
    if (destExists) {
      console.log(`Destination file already exists, skipping: ${newPath}`);
      return true;
    }
    
    // Copy the file
    await sourceFile.copy(destinationFile);
    console.log(`✅ Copied: ${oldPath} → ${newPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error copying file from ${oldPath} to ${newPath}:`, error);
    return false;
  }
}

/**
 * Delete a file from GCS
 */
async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const file = bucket.file(filePath);
    await file.delete();
    console.log(`🗑️ Deleted: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting file ${filePath}:`, error);
    return false;
  }
}

/**
 * Migrate Final Dossier files for a specific inspection order
 */
async function migrateInspectionOrderFiles(
  inspectionOrderNumber: string, 
  projectCode: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    inspectionOrderNumber,
    projectCode,
    migratedFiles: [],
    errors: [],
    success: false
  };

  try {
    // Define old and new paths
    const oldBasePath = `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Final Dossier/`;
    const newBasePath = `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Final_Dossier/`;
    
    console.log(`\n🔄 Migrating files for ${inspectionOrderNumber}...`);
    console.log(`Old path: ${oldBasePath}`);
    console.log(`New path: ${newBasePath}`);
    
    // List files in old directory
    const oldFiles = await listFilesInDirectory(oldBasePath);
    
    if (oldFiles.length === 0) {
      console.log(`No files found in old directory for ${inspectionOrderNumber}`);
      result.success = true;
      return result;
    }
    
    console.log(`Found ${oldFiles.length} files in old directory`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    // Migrate each file
    for (const oldFilePath of oldFiles) {
      // Extract filename from full path
      const fileName = oldFilePath.replace(oldBasePath, '');
      if (!fileName) continue; // Skip if it's just a directory
      
      const newFilePath = `${newBasePath}${fileName}`;
      
      console.log(`Migrating: ${fileName}`);
      
      // Copy file to new location
      const copySuccess = await copyFile(oldFilePath, newFilePath);
      
      if (copySuccess) {
        result.migratedFiles.push(fileName);
        migratedCount++;
        
        // Delete original file after successful copy
        const deleteSuccess = await deleteFile(oldFilePath);
        if (!deleteSuccess) {
          result.errors.push(`Failed to delete original file: ${oldFilePath}`);
          errorCount++;
        }
      } else {
        result.errors.push(`Failed to copy file: ${oldFilePath}`);
        errorCount++;
      }
    }
    
    // Try to delete old directory if it's empty
    try {
      const remainingFiles = await listFilesInDirectory(oldBasePath);
      if (remainingFiles.length === 0) {
        console.log(`🗑️ Old directory is empty, cleaning up: ${oldBasePath}`);
      }
    } catch (error) {
      console.log(`Note: Could not clean up old directory: ${oldBasePath}`);
    }
    
    result.success = errorCount === 0;
    console.log(`✅ Migration completed for ${inspectionOrderNumber}: ${migratedCount} files migrated, ${errorCount} errors`);
    
  } catch (error) {
    const errorMsg = `Failed to migrate files for ${inspectionOrderNumber}: ${error}`;
    console.error(`❌ ${errorMsg}`);
    result.errors.push(errorMsg);
    result.success = false;
  }
  
  return result;
}

/**
 * Get all inspection orders that need migration
 */
async function getInspectionOrdersForMigration(): Promise<{inspectionOrderNumber: string, projectCode: string}[]> {
  try {
    const query = `
      SELECT DISTINCT 
        inspection_order_number as "inspectionOrderNumber",
        project_code as "projectCode"
      FROM inspection_orders 
      WHERE inspection_order_number IS NOT NULL 
        AND project_code IS NOT NULL
        AND project_code != 'UNKNOWN'
      ORDER BY inspection_order_number
    `;
    
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching inspection orders:', error);
    return [];
  }
}

/**
 * Main migration function - migrates all Final Dossier files from old to new path structure
 */
export async function migrateFinalDossierFiles(): Promise<MigrationSummary> {
  console.log('🚀 Starting Final Dossier files migration...');
  console.log('This will move all files from "Final Dossier" to "Final_Dossier" directories');
  
  const summary: MigrationSummary = {
    totalInspectionOrders: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    totalFilesMigrated: 0,
    totalFilesDeleted: 0,
    details: [],
    errors: []
  };
  
  try {
    // Get all inspection orders
    const inspectionOrders = await getInspectionOrdersForMigration();
    summary.totalInspectionOrders = inspectionOrders.length;
    
    console.log(`Found ${inspectionOrders.length} inspection orders to process`);
    
    if (inspectionOrders.length === 0) {
      console.log('No inspection orders found for migration');
      return summary;
    }
    
    // Process each inspection order
    for (const { inspectionOrderNumber, projectCode } of inspectionOrders) {
      const migrationResult = await migrateInspectionOrderFiles(inspectionOrderNumber, projectCode);
      summary.details.push(migrationResult);
      
      if (migrationResult.success) {
        summary.successfulMigrations++;
        summary.totalFilesMigrated += migrationResult.migratedFiles.length;
      } else {
        summary.failedMigrations++;
        summary.errors.push(...migrationResult.errors);
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`Total inspection orders processed: ${summary.totalInspectionOrders}`);
    console.log(`Successful migrations: ${summary.successfulMigrations}`);
    console.log(`Failed migrations: ${summary.failedMigrations}`);
    console.log(`Total files migrated: ${summary.totalFilesMigrated}`);
    
    if (summary.errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      summary.errors.forEach(error => console.log(`  - ${error}`));
    }
    
  } catch (error) {
    const errorMsg = `Migration process failed: ${error}`;
    console.error(`❌ ${errorMsg}`);
    summary.errors.push(errorMsg);
  }
  
  return summary;
}

/**
 * Check migration status - shows what files exist in old vs new locations
 */
export async function checkMigrationStatus(): Promise<any> {
  console.log('🔍 Checking Final Dossier migration status...');
  
  try {
    const inspectionOrders = await getInspectionOrdersForMigration();
    const statusResults = [];
    
    for (const { inspectionOrderNumber, projectCode } of inspectionOrders.slice(0, 5)) { // Check first 5 for demo
      const oldPath = `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Final Dossier/`;
      const newPath = `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Final_Dossier/`;
      
      const oldFiles = await listFilesInDirectory(oldPath);
      const newFiles = await listFilesInDirectory(newPath);
      
      statusResults.push({
        inspectionOrderNumber,
        projectCode,
        oldPath,
        newPath,
        oldFilesCount: oldFiles.length,
        newFilesCount: newFiles.length,
        oldFiles: oldFiles.map(f => f.replace(oldPath, '')),
        newFiles: newFiles.map(f => f.replace(newPath, '')),
        needsMigration: oldFiles.length > 0
      });
    }
    
    return {
      totalChecked: statusResults.length,
      needsMigration: statusResults.filter(r => r.needsMigration).length,
      alreadyMigrated: statusResults.filter(r => !r.needsMigration && r.newFilesCount > 0).length,
      results: statusResults
    };
    
  } catch (error) {
    console.error('Error checking migration status:', error);
    return { error: error.message };
  }
}