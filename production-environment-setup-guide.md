# Production Environment Setup Guide

## What's Been Done

We have identified the issue in your Production environment:
1. The bucket name is incorrectly set (or missing)
2. The Google Cloud credentials are missing

We've extracted the working configuration from the Development environment and prepared it for Production.

## How to Update Production Environment

### Method 1: Using .env.production File (Recommended)

1. **Download the .env.production file** we've created in this Development environment
2. **In Production Replit project**:
   - Go to Tools > Secrets
   - Click "Import from .env"
   - Upload the .env.production file
   - Click "Import"

### Method 2: Manual Update in Replit Secrets

If you prefer to manually update the secrets:

1. **Set GOOGLE_CLOUD_BUCKET**:
   - Key: `GOOGLE_CLOUD_BUCKET`
   - Value: `thermopac_storage`

2. **Set GOOGLE_CLOUD_CREDENTIALS**:
   - Key: `GOOGLE_CLOUD_CREDENTIALS`
   - Value: Copy the entire JSON string from the .env.production file (the long string starting with `{"type":"service_account"...`)

### Method 3: Update in Google Cloud Console

If you prefer to generate new credentials:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "IAM & Admin" > "Service Accounts"
3. Find the service account: `thermopac-cloud@thermopac-communication-system.iam.gserviceaccount.com`
4. Create a new key (JSON format)
5. Use the downloaded JSON file contents as your GOOGLE_CLOUD_CREDENTIALS value

## Verify The Configuration

After updating, restart your Production application and:

1. Go to the Drawing Management section for any master item
2. Look for the "Storage Diagnostics" section
3. Click "Run Diagnostics"
4. Verify all permissions show green checkmarks

## Troubleshooting

If issues persist:

1. Check the server logs in Production for detailed error messages
2. Verify the service account has proper permissions on the bucket:
   - In Google Cloud Console, go to "Cloud Storage" > "Buckets" > "thermopac_storage"
   - Click "Permissions" and verify the service account has at least "Storage Object Admin" (roles/storage.objectAdmin) role

## What This Fixes

These changes will resolve:
- Drawing upload failures in Production
- "Missing credentials" errors in the Storage Diagnostics
- Permission denied errors when accessing files
- Any differences between Development and Production environments