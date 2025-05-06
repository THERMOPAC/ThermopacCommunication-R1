# WPQR Document Download System

## Current Status

The system includes a robust multi-level download mechanism for WPQR documents with the following fallback levels:

1. **LOCAL FILES**: First checks for files in the local `wpqr_documents` directory
2. **GOOGLE CLOUD STORAGE**: Attempts to download from Google Cloud Storage bucket
3. **LOCAL CACHE**: Checks the local document cache for previously downloaded files
4. **PUBLIC URL**: Attempts to download from public URL (if available)
5. **EMERGENCY TEXT**: As a last resort, returns a text file with document information

Currently, the Google Cloud Storage access is experiencing permission issues. The service account `7921-civvhpvzj.iam.gserviceaccount.com` lacks the required `storage.objects.get` permission needed for downloading documents.

## Using Local File Storage

Until the GCS permissions are resolved, you can use the local file system for WPQR documents:

1. All WPQR documents should be placed in the `wpqr_documents` directory at the project root
2. Files should be named following the pattern: `WPQR-[ID].pdf` (e.g., `WPQR-9.pdf`)
3. The system will automatically find and serve these files when users attempt to download documents

## Helper Tool

A helper script is included to assist with managing local WPQR documents:

```bash
node scripts/upload-wpqr.js
```

This tool:
- Lists all existing WPQR documents in the local directory
- Allows you to create placeholder documents for testing
- Ensures proper file naming conventions

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

If documents are not downloading:

1. Check server logs for detailed error messages
2. Verify that the document exists in the database
3. Ensure the file exists in the `wpqr_documents` directory with the correct name
4. Check GCS bucket permissions if using Google Cloud Storage