# Google Cloud Storage Credentials for Production

Use these settings to update your Production environment.

## Bucket Name
```
thermopac_storage
```

## Google Cloud Credentials JSON

The full Google Cloud credentials JSON is available in the Development environment at:
```
/temp_secrets/google_credentials.json
```

Copy the entire contents of this file to set as the GOOGLE_CLOUD_CREDENTIALS environment variable in Production.

## How to Apply These Settings

See the complete setup guide in `gcs-production-setup-guide.md` for step-by-step instructions on applying these settings to your Production environment.

## What to Expect

After applying these settings, your GCS Diagnostics should show all green checkmarks, and file uploads in the Drawing Management tab should work correctly.