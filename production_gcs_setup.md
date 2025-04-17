# Setting Up Google Cloud Storage in Production

The Google Cloud Storage diagnostics show that the Production environment is missing proper credentials. 
Here's how to fix it:

## 1. Update the GOOGLE_CLOUD_BUCKET Environment Variable

Set the bucket name to the correct value:

```
GOOGLE_CLOUD_BUCKET=thermopac_storage
```

## 2. Add the GOOGLE_CLOUD_CREDENTIALS Environment Variable

The credentials JSON has been extracted from the Development environment and saved to:
`./temp_secrets/google_credentials.json`

**For security reasons, we don't show the complete credentials here.**

Go to the Replit Secrets panel in your Production environment:
1. Click on "Tools" in the sidebar
2. Select "Secrets"
3. Add a new secret with key "GOOGLE_CLOUD_CREDENTIALS"
4. Paste the entire contents of the google_credentials.json file as the value
5. Click "Add secret"

## 3. Restart Your Application

After setting these variables, restart your application or redeploy to apply the changes.

## 4. Verify the Configuration

Use the GCS Diagnostics tool in the Drawing Management section to verify that all permissions are now working correctly.
