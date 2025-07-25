import { initializeGCS } from '../server/utils/gcs-operations.ts';

async function cleanupOrphanedShopInspectionFile() {
  try {
    console.log('🧹 Starting cleanup of orphaned Shop Inspection file...');
    
    const filePath = 'QMS/Inspections_Records/2025-1/IO-2025-1-M-7/ShopInspection/SI-1.pdf';
    console.log(`🧹 Target file path: ${filePath}`);
    
    const { bucket } = await initializeGCS();
    
    if (!bucket) {
      throw new Error('GCS bucket not available - initialization failed');
    }
    
    console.log('🧹 GCS bucket initialized successfully');
    
    const file = bucket.file(filePath);
    
    // Check if file exists
    console.log('🧹 Checking if file exists...');
    const [exists] = await file.exists();
    
    if (exists) {
      console.log('🧹 File exists in GCS, attempting deletion...');
      await file.delete();
      console.log('🧹 ✅ Successfully deleted orphaned file!');
      return true;
    } else {
      console.log('🧹 ⚠️ File not found in GCS (may have been already deleted)');
      return false;
    }
  } catch (error) {
    console.error('🧹 ❌ Failed to cleanup orphaned file:', error);
    return false;
  }
}

// Run the cleanup
cleanupOrphanedShopInspectionFile()
  .then((success) => {
    if (success) {
      console.log('🧹 🎉 Cleanup completed successfully!');
    } else {
      console.log('🧹 ⚠️ Cleanup completed but file may not have existed');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('🧹 💥 Cleanup failed:', error);
    process.exit(1);
  });