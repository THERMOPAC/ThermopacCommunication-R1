import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

// Set the redirect URI to match exactly what's configured in Google Cloud Console
// IMPORTANT: This MUST match exactly what's configured in Google Cloud Console
// First try to use the environment variable, then fall back to hardcoded value if not set
const redirectUri = process.env.GOOGLE_REDIRECT_URI || "https://thermopac-communication-thermopacllp.replit.app/auth/google/callback";

// Check existing environment variable and issue warning if it appears to be a placeholder
if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.includes('your-domain')) {
  console.warn('WARNING: GOOGLE_REDIRECT_URI appears to contain a placeholder value!');
  console.warn('Current value:', process.env.GOOGLE_REDIRECT_URI);
  console.warn('Please set GOOGLE_REDIRECT_URI to the exact value from your Google Cloud Console');
}

// Note: If you continue to see redirect_uri_mismatch errors, you need to:
// 1. Copy the exact URI from the google error message
// 2. Add it to your Google Cloud Console under "Authorized redirect URIs"
// 3. Then set it as GOOGLE_REDIRECT_URI in your Replit environment variables

// Log the effective redirect URI for debugging
console.log(`Using OAuth redirect URI: ${redirectUri}`);

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('WARNING: Missing Google OAuth credentials — Google Mail integration will not work');
}

// Require environment variables - no fallback values for security
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required');
}

console.log(`Google OAuth credentials loaded. Redirect URI: ${redirectUri}`);

// Create an OAuth2 client with explicit credentials
export const oauth2Client = new OAuth2Client(
  clientId,
  clientSecret,
  redirectUri
);

// Define the scopes we need for Gmail access
export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',  // Read-only access to Gmail
  'https://www.googleapis.com/auth/gmail.modify'     // Modify but not delete access to Gmail
];

/**
 * Generate a URL for user authorization
 */
export function getAuthUrl(): string {
  // We are now using the hardcoded fallback credentials if env vars are not available
  console.log('Generating OAuth URL...');
  
  try {
    // Create a fresh OAuth2 client specifically for this request to avoid any state issues
    const authClient = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );
    
    const authUrl = authClient.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force re-consent to get refresh token each time
      include_granted_scopes: true,
      redirect_uri: redirectUri // Explicitly set redirect URI
    });
    
    console.log(`Successfully generated auth URL`);
    
    return authUrl;
  } catch (error) {
    console.error('===== ERROR GENERATING AUTH URL =====');
    console.error('Error details:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw new Error(`Failed to generate auth URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokens(code: string) {
  // Sanitize the code first
  code = sanitizeAuthCode(code);
  console.log('Exchanging auth code for tokens');
  
  try {
    
    // Create a new OAuth client with our credentials to avoid the type errors
    const tokenOAuthClient = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );
    
    // Then call getToken with just the code and redirect URI
    const { tokens } = await tokenOAuthClient.getToken({
      code,
      redirect_uri: redirectUri
    });
    
    console.log('Successfully exchanged code for tokens');
    console.log('Access token received:', !!tokens.access_token);
    console.log('Refresh token received:', !!tokens.refresh_token);
    
    return tokens;
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Clean and validate an authorization code
 */
export function sanitizeAuthCode(code: string): string {
  console.log('Sanitizing auth code, original length:', code.length);
  
  // Trim whitespace and remove any quotes that might have been accidentally included
  code = code.trim().replace(/["']/g, '');
  
  // Direct Google authorization code format - if it already looks like a valid Google code, return it as is
  if (/^4\/0A[a-zA-Z0-9_-]+$/.test(code)) {
    console.log('Detected direct Google OAuth code format, using as-is');
    return code;
  }
  
  // Check if it's a full URL containing a code parameter
  if (code.includes('https://') && code.includes('code=')) {
    try {
      console.log('Detected full URL with code parameter');
      const match = code.match(/[?&]code=([^&]+)/);
      if (match && match[1]) {
        console.log('Extracted code from URL parameter');
        code = match[1];
      }
    } catch (err) {
      console.error('Error extracting code from URL:', err);
    }
  } 
  // If it's just a code parameter fragment (code=xxxx)
  else if (code.startsWith('code=')) {
    try {
      console.log('Detected code parameter fragment');
      const parts = code.split('=');
      if (parts.length > 1) {
        code = parts[1];
        console.log('Extracted code value from fragment');
      }
    } catch (err) {
      console.error('Error extracting code from fragment:', err);
    }
  }
  // Handle JSON-like objects that might be pasted
  else if (code.includes('"code":')) {
    try {
      console.log('Detected JSON-like string with code property');
      const match = code.match(/"code"\s*:\s*"([^"]+)"/);
      if (match && match[1]) {
        console.log('Extracted code from JSON');
        code = match[1];
      }
    } catch (err) {
      console.error('Error extracting code from JSON:', err);
    }
  }
  
  // Handle possible URL encoding
  try {
    if (code.includes('%')) {
      const decodedCode = decodeURIComponent(code);
      console.log('Decoded URL-encoded auth code');
      code = decodedCode;
    }
  } catch (err) {
    console.error('Error decoding auth code:', err);
  }
  
  console.log('Sanitized code length:', code.length);
  return code;
}

/**
 * Set credentials for the OAuth client
 */
export function setCredentials(tokens: any) {
  oauth2Client.setCredentials(tokens);
}

/**
 * Get a Gmail client
 */
export function getGmailClient() {
  // Use the already imported google object from the top of this file
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Get the OAuth2 client
 */
export function getOAuth2Client() {
  return oauth2Client;
}