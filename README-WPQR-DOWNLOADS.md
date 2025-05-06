# WPQR Document Management System

## Current Status

The system uses Google Cloud Storage (GCS) as the primary storage mechanism for WPQR documents. For download operations only, the system includes a fallback mechanism with the following levels when GCS access fails:

1. **GOOGLE CLOUD STORAGE**: Primary mechanism - attempts to download from Google Cloud Storage bucket
2. **PUBLIC URL**: Attempts to download from public URL (if available)
3. **EMERGENCY TEXT**: As a last resort, returns a text file with document information

Currently, the Google Cloud Storage access is experiencing permission issues. The service account `7921-civvhpvzj.iam.gserviceaccount.com` lacks the required `storage.objects.get` permission needed for downloading documents.

## Error: Document Already Exists

If you're seeing the error "Key (document_id)=(WPQR-10) already exists" when trying to create a new WPQR document, it means the document ID already exists in the database but the actual PDF file may be missing from Google Cloud Storage.

**Solution**: The file must be uploaded directly to Google Cloud Storage with the correct path.

## Using Google Cloud Storage

All file uploads are directed exclusively to Google Cloud Storage:

1. Files are stored with the path pattern: `/QMS/WPQR/WPQR-[ID].pdf` (e.g., `/QMS/WPQR/WPQR-9.pdf`)
2. The system will attempt to upload files directly to this path
3. For proper access, the GCS service account must have the correct permissions

## Resolving Google Cloud Storage Issues

To fix the GCS permissions issue:

1. Log into the Google Cloud Console
2. Navigate to IAM & Admin > Service Accounts
3. Find the service account `7921-civvhpvzj.iam.gserviceaccount.com`
4. Add the `Storage Object Viewer` role for read access and `Storage Object Creator` role for write access
5. Alternatively, consider using a different service account with appropriate permissions

## Document Naming Convention

All WPQR documents follow a standardized naming convention:
- Database ID: numeric primary key (e.g., 9)
- Document ID: format "WPQR-[ID]" (e.g., "WPQR-9")
- Filename: "[Document ID].pdf" (e.g., "WPQR-9.pdf")
- GCS Path: "/QMS/WPQR/[Document ID].pdf" (e.g., "/QMS/WPQR/WPQR-9.pdf")

## Troubleshooting

### Common Issues and Solutions

1. **Error: Document Already Exists**
   - Problem: The document ID already exists in the database
   - Solution: Use a different document ID or delete the existing record first

2. **File Not Found When Downloading**
   - Problem: The file doesn't exist in GCS
   - Solution: Ensure the file is uploaded to the correct path in GCS

3. **Downloaded File Has Incorrect Name**
   - Problem: Redundant "WPQR-" prefix in filename
   - Solution: This has been fixed. Files now download with correct names

4. **Google Cloud Storage Permission Denied**
   - Problem: Service account lacks necessary permissions
   - Solution: Add Storage Object Viewer role for read access and Storage Object Creator role for write access

### Additional Debugging

If documents are still not downloading or uploading:

1. Check server logs for detailed error messages
2. Verify that the document exists in the database
3. Check GCS bucket permissions and that the service account has appropriate roles
4. Verify the document exists in the correct location in GCS using the Google Cloud Console