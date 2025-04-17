# Google Cloud Storage Production Setup Guide

This guide will help you properly configure Google Cloud Storage in your Production environment.

## Environment Variables to Set

You need to set two environment variables:

1. **GOOGLE_CLOUD_BUCKET**
   - Correct value: `thermopac_storage`

2. **GOOGLE_CLOUD_CREDENTIALS**
   - Use the same JSON credentials string from your Development environment
   - This should include the service account: `thermopac-cloud@thermopac-communication-system.iam.gserviceaccount.com`

## Method 1: Using Replit Secrets UI

1. Go to your Production Replit project
2. Click on "Tools" > "Secrets" in the left sidebar
3. Add the GOOGLE_CLOUD_BUCKET secret:
   - Key: `GOOGLE_CLOUD_BUCKET`
   - Value: `thermopac_storage`
4. Add the GOOGLE_CLOUD_CREDENTIALS secret:
   - Key: `GOOGLE_CLOUD_CREDENTIALS`
   - Value: Copy the full JSON string from Development

## Method 2: Using .env File

1. Create a .env file in your project root:
   ```
   GOOGLE_CLOUD_BUCKET=thermopac_storage
   GOOGLE_CLOUD_CREDENTIALS=paste_your_full_json_string_here
   ```
2. Import this file in Replit Secrets:
   - Go to "Tools" > "Secrets"
   - Click "Import from .env"
   - Select your .env file

## Method 3: Manually in server/utils/storage-config.ts

If neither of the above methods work, you can modify the storage-config.ts file directly:

```typescript
// Already set correctly in the code:
const correctBucketName = 'thermopac_storage';
```

The code already has a good fallback mechanism that will use `thermopac_storage` regardless of what's in the environment variable, but it's better to set the variable correctly as well.

## Verifying the Configuration

1. After setting these variables and restarting your application, go to the Item Management section
2. Select an item and go to the Drawing Management tab
3. Click on "Storage Diagnostics" and run the diagnostics
4. Check that all permissions are correctly set:
   - "Bucket Exists" should show a green checkmark
   - "Can List Files" should show a green checkmark
   - "Can Write Files" should show a green checkmark
   - "Can Delete Files" should show a green checkmark
   - "Has Credentials" should show a green checkmark

## Troubleshooting

If the diagnostics still show issues after setting these variables:

1. Check that both environment variables are set correctly
2. Make sure the GOOGLE_CLOUD_CREDENTIALS JSON is complete and correctly formatted
3. Verify that the service account has the proper permissions on the bucket
4. Check server logs for detailed error messages