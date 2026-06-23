---
name: GCS auth in production vs dev
description: Replit production autoscale containers cannot use GOOGLE_CLOUD_CREDENTIALS for GCS; must use ADC (new Storage()). Dev uses explicit key.
---

## Rule
Any new GCS route must use `new Storage()` (ADC) in production and `new Storage({ credentials })` in development.

**Why:** The Replit autoscale production container's GOOGLE_CLOUD_CREDENTIALS private key fails with `invalid_grant: Invalid JWT Signature` for JWT auth and HTTP 403 for signed URLs. The ADC metadata-server path (`new Storage()` with no args) works correctly in production and is completely immune to private-key issues. This is the pattern already used by wpqr-routes.ts, welder-certificate-routes.ts, and (after June 2026 fix) local-agent-routes.ts download handler.

**How to apply:**
```typescript
if (process.env.NODE_ENV === 'production') {
  storage = new Storage(); // ADC — works in Replit autoscale
} else {
  const creds = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS!);
  storage = new Storage({ projectId: creds.project_id, credentials: { client_email: creds.client_email, private_key: creds.private_key } });
}
```

Note: ADC in production does NOT support local RSA signing for signed URLs (needs signBlob IAM API). Use direct `file.createReadStream().pipe(res)` streaming instead of redirect-to-signed-URL when the download must go through the server.
