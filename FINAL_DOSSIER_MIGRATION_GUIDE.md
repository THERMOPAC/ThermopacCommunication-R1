# Final Dossier Migration Guide

## Overview

This guide covers the complete migration of Final Dossier files from the legacy path structure to the new standardized path structure, ensuring consistency and eliminating confusion between old and new file locations.

## Path Structure Changes

### Before (Legacy Path)
```
QMS/Inspections_Records/{projectCode}/{inspectionOrderNumber}/Final Dossier/FD_{inspectionOrderNumber}.pdf
```

### After (New Standardized Path)
```
QMS/Inspections_Records/{projectCode}/{inspectionOrderNumber}/Final_Dossier/FD_{inspectionOrderNumber}.pdf
```

**Key Change**: `Final Dossier` (with space) → `Final_Dossier` (with underscore)

## Implementation Status

### ✅ Completed Tasks

1. **Generate Function Updated**
   - `generateFinalDossier()` function now uses only the new path structure
   - File location: `server/utils/final-dossier-generator.ts` (lines 560-562)
   - All new Final Dossier PDFs will be created in `Final_Dossier` directory

2. **Check Function Updated**
   - `checkExistingFinalDossier()` function now only checks new path structure
   - Backward compatibility with old paths has been removed
   - File location: `server/utils/final-dossier-generator.ts` (lines 665-745)

3. **Migration Utility Created**
   - Comprehensive migration tool: `server/utils/final-dossier-migration.ts`
   - Features: copy files from old to new location, delete originals, preserve file history
   - Includes detailed logging and error handling

4. **API Endpoints Added**
   - Migration status check: `GET /api/quality/final-dossier/migration/status`
   - Execute migration: `POST /api/quality/final-dossier/migration/execute`
   - File location: `server/index.ts` (lines 128-168)

5. **Command Line Script**
   - Migration script: `scripts/migrate-final-dossier.js`
   - Usage: `node scripts/migrate-final-dossier.js [--check-only]`
   - Provides interactive migration interface

## Migration Process

### Step 1: Check Migration Status
```bash
# Command line
node scripts/migrate-final-dossier.js --check-only

# Or via API
curl -X GET "http://localhost:5000/api/quality/final-dossier/migration/status"
```

### Step 2: Execute Migration
```bash
# Command line
node scripts/migrate-final-dossier.js

# Or via API
curl -X POST "http://localhost:5000/api/quality/final-dossier/migration/execute"
```

### Step 3: Verify Results
- Check migration summary for success/failure counts
- Verify files exist in new location
- Confirm old files have been deleted

## Migration Features

### ✅ File Safety
- Checks if destination files already exist (prevents overwriting)
- Only deletes original files after successful copy
- Comprehensive error handling and rollback capability

### ✅ Detailed Reporting
- Files migrated per inspection order
- Success/failure statistics
- Detailed error messages for troubleshooting

### ✅ Database Integration
- Automatically discovers all inspection orders requiring migration
- Filters out invalid project codes (e.g., 'UNKNOWN')
- Preserves file metadata and relationships

## Technical Details

### Migration Function Flow
1. Query database for all inspection orders with valid project codes
2. For each inspection order:
   - Check old path: `QMS/Inspections_Records/{projectCode}/{inspectionOrderNumber}/Final Dossier/`
   - List all PDF files in old directory
   - Copy each file to new path: `QMS/Inspections_Records/{projectCode}/{inspectionOrderNumber}/Final_Dossier/`
   - Delete original files after successful copy
   - Clean up empty old directories

### Error Handling
- Non-existent source files: Skip with warning
- Permission errors: Log error, continue with next file
- Network issues: Retry with exponential backoff
- Partial failures: Detailed error reporting per file

## Post-Migration Verification

### ✅ Forward Compatibility
- All new Final Dossier generation uses `Final_Dossier` path
- Check functions only look in new location
- No backward compatibility fallbacks

### ✅ System Consistency
- Generation endpoint: Uses new path structure
- Check endpoint: Uses new path structure only
- Download endpoint: Works with new path structure

## Usage Examples

### Check Current Status
```javascript
// Frontend usage
const response = await fetch('/api/quality/final-dossier/migration/status');
const status = await response.json();
console.log(`Files needing migration: ${status.needsMigration}`);
```

### Execute Migration
```javascript
// Frontend usage
const response = await fetch('/api/quality/final-dossier/migration/execute', {
  method: 'POST'
});
const result = await response.json();
console.log(`Migration completed: ${result.summary.totalFilesMigrated} files migrated`);
```

## Important Notes

### ⚠️ Before Migration
- Ensure adequate GCS storage space
- Backup critical Final Dossier files if needed
- Verify GCS credentials and permissions
- Test migration on non-production environment first

### ⚠️ During Migration
- Migration can take time for large numbers of files
- System remains operational during migration
- Monitor logs for any errors or warnings

### ⚠️ After Migration
- Verify all critical Final Dossier files are accessible
- Test Final Dossier generation and viewing functionality
- Clean up any empty old directories manually if needed

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Verify GCS service account has proper Storage Object Creator/Admin roles
   - Check bucket permissions and access controls

2. **File Not Found Errors**
   - Some files may have been moved manually
   - Check for files in unexpected locations

3. **Network Timeouts**
   - Migration will retry automatically
   - Large files may take longer to copy

4. **Disk Space Issues**
   - Ensure sufficient GCS storage quota
   - Monitor storage usage during migration

### Recovery Procedures

If migration fails partially:
1. Check migration status to see what completed
2. Re-run migration (it skips already-migrated files)
3. Manual verification of critical files
4. Contact system administrator if issues persist

## Migration Timeline

- **Preparation**: Review this guide and verify system status
- **Execution**: Run migration during low-usage period
- **Verification**: Test Final Dossier functionality thoroughly
- **Cleanup**: Remove old empty directories if desired

## Support

For technical issues during migration:
1. Check server logs for detailed error messages
2. Verify GCS connectivity and permissions
3. Review migration status reports
4. Contact system administrator for assistance

---

**Migration Status**: Ready for execution
**Last Updated**: July 23, 2025
**Version**: 1.0.0