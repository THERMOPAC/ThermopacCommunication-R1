# WPQR Document Management System

## Current Status

The system includes a robust multi-level download mechanism for WPQR documents with the following fallback levels:

1. **LOCAL FILES**: First checks for files in the local `wpqr_documents` directory
2. **GOOGLE CLOUD STORAGE**: Attempts to download from Google Cloud Storage bucket
3. **LOCAL CACHE**: Checks the local document cache for previously downloaded files
4. **PUBLIC URL**: Attempts to download from public URL (if available)
5. **EMERGENCY TEXT**: As a last resort, returns a text file with document information

Currently, the Google Cloud Storage access is experiencing permission issues. The service account `7921-civvhpvzj.iam.gserviceaccount.com` lacks the required `storage.objects.get` permission needed for downloading documents.

## Error: Document Already Exists

If you're seeing the error "Key (document_id)=(WPQR-10) already exists" when trying to create a new WPQR document, it means:

1. The document ID already exists in the database
2. But the actual PDF file may be missing from Google Cloud Storage

**Solution**: Instead of creating a new entry in the database, use the local file upload tool to create a local file for the existing database record:

```bash
node scripts/upload-wpqr.js
```

When the tool asks for a document ID, enter the ID of the existing document (e.g., "WPQR-10").

## Using Local File Storage

Until the GCS permissions are resolved, you can use the local file system for WPQR documents:

1. All WPQR documents should be placed in the `wpqr_documents` directory at the project root
2. Files should be named following the pattern: `WPQR-[ID].pdf` (e.g., `WPQR-9.pdf`)
3. The system will automatically find and serve these files when users attempt to download documents

## Helper Tools

Two helper scripts are included to help manage WPQR documents:

### 1. Local File Upload Tool

```bash
node scripts/upload-wpqr.js
```

This tool:
- Lists all existing WPQR documents in the local directory
- Allows you to create new or update existing document files
- Ensures proper file naming conventions
- Creates placeholder documents with formatted content

### 2. Database-File Sync Checker

```bash
node scripts/check-wpqr-sync.js
```

This tool:
- Checks for mismatches between database records and local files
- Identifies database entries without corresponding local files
- Identifies local files without database entries
- Helps diagnose synchronization issues

## Step-by-Step Guides

### If a document exists in the database but the file is missing:

1. Run `node scripts/upload-wpqr.js`
2. Enter the document ID (e.g., "WPQR-10" or just "10")
3. Enter a title for the placeholder document
4. The tool will create a local file that can be served when users download this document

### If you want to check for synchronization issues:

1. Run `node scripts/check-wpqr-sync.js`
2. The tool will show you a list of documents that exist in the database but are missing files
3. Use `upload-wpqr.js` to create the missing files

## Resolving Google Cloud Storage Issues

To fix the GCS permissions issue:

1. Log into the Google Cloud Console
2. Navigate to IAM & Admin > Service Accounts
3. Find the service account `7921-civvhpvzj.iam.gserviceaccount.com`
4. Add the `Storage Object Viewer` role to this service account
5. Alternatively, consider using a different service account with appropriate permissions

## Document Naming Convention

All WPQR documents follow the naming convention:
- Database ID: numeric primary key (e.g., 9)
- Document ID: format "WPQR-[ID]" (e.g., "WPQR-9")
- Filename: "[Document ID].pdf" (e.g., "WPQR-9.pdf")

## Troubleshooting

### Common Issues and Solutions

1. **Error: Document Already Exists**
   - Problem: The document ID already exists in the database
   - Solution: Use the upload tool to create a local file with the same ID

2. **File Not Found When Downloading**
   - Problem: The file doesn't exist locally or in GCS
   - Solution: Check logs for file path details, then create local file with upload tool

3. **Downloaded File Has Incorrect Name**
   - Problem: Redundant "WPQR-" prefix in filename
   - Solution: This has been fixed. Files now download with correct names

4. **Google Cloud Storage Permission Denied**
   - Problem: Service account lacks necessary permissions
   - Solution: Add Storage Object Viewer role to service account

### Additional Debugging

If documents are still not downloading:

1. Check server logs for detailed error messages
2. Verify that the document exists in the database
3. Ensure the file exists in the `wpqr_documents` directory with the correct name
4. Check GCS bucket permissions if using Google Cloud Storage