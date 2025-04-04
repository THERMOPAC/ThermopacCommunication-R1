import { OAuth2Client } from 'google-auth-library';

// Create an OAuth2 client using environment variables
export const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
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
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force re-consent to get refresh token each time
  });
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