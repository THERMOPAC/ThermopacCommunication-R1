import { initializeGCS } from './gcs-operations';

/**
 * Clean up orphaned files in GCS that don't have corresponding database records
 */
export async function cleanupOrphanedFile(filePath: string): Promise<boolean> {
  try {
    console.log(`🧹 Attempting to clean up orphaned file: ${filePath}`);
    
    const { bucket } = await initializeGCS();
    
    if (!bucket) {
      throw new Error('GCS bucket not available - initialization failed');
    }
    
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    
    if (exists) {
      console.log(`🧹 File exists in GCS, deleting: ${filePath}`);
      await file.delete();
      console.log(`🧹 ✅ Successfully deleted orphaned file: ${filePath}`);
      return true;
    } else {
      console.log(`🧹 ⚠️ File not found in GCS: ${filePath}`);
      return false;
    }
  } catch (error: any) {
    console.error(`🧹 ❌ Failed to delete orphaned file ${filePath}:`, error);
    return false;
  }
}

/**
 * Clean up specific Shop Inspection orphaned file
 */
export async function cleanupShopInspectionOrphanedFile(): Promise<boolean> {
  const filePath = 'QMS/Inspections_Records/2025-1/IO-2025-1-M-7/ShopInspection/SI-1.pdf';
  return await cleanupOrphanedFile(filePath);
}