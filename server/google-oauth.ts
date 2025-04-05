import { OAuth2Client } from 'google-auth-library';

// Set proper redirect URI based on environment
const redirectUri = 'https://thermopac-communication-thermopacllp.replit.app/auth/google/callback';

// Override environment variable with the correct redirect URI
process.env.GOOGLE_REDIRECT_URI = redirectUri;

// Check OAuth credentials and add detailed logging
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('WARNING: Missing Google OAuth credentials in environment variables');
  console.warn('Google Mail integration will not work until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set');
} else {
  // Log OAuth configuration (with truncated sensitive data for security)
  console.log('Google OAuth Configuration:');
  console.log(`- Client ID: ${process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.substring(0, 5) + '...' : 'MISSING'}`);
  console.log(`- Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? '******' : 'MISSING'}`);
  console.log(`- Redirect URI: ${redirectUri}`);
}

// Create an OAuth2 client with explicit credentials (no environment variables)
export const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
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
  // Check if OAuth credentials are available
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials - cannot generate auth URL');
    throw new Error('Google OAuth is not configured. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.');
  }
  
  console.log('Generating auth URL with the following parameters:');
  console.log(`- Client ID: ${process.env.GOOGLE_CLIENT_ID?.substring(0, 5)}...`);
  console.log(`- Redirect URI: ${redirectUri}`);
  console.log(`- Scopes: ${SCOPES.join(', ')}`);
  
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force re-consent to get refresh token each time
      redirect_uri: redirectUri // Explicitly set redirect URI
    });
    
    console.log(`Successfully generated auth URL: ${authUrl.substring(0, 50)}...`);
    return authUrl;
  } catch (error) {
    console.error('Error generating auth URL:', error);
    throw new Error(`Failed to generate auth URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokens(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
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
  const { google } = require('googleapis');
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Get the OAuth2 client
 */
export function getOAuth2Client() {
  return oauth2Client;
}