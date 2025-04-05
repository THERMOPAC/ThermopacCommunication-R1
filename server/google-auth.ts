import { google } from 'googleapis';
import { Express, Request, Response } from 'express';
import { storage } from './storage';

// Configure OAuth 2.0 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Define the scopes needed for Gmail access
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.modify',
  'profile',
  'email'
];

// Generate authentication URL
export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI // Explicitly include the redirect URI
  });
}

// Set up Google OAuth routes and handlers
export function setupGoogleAuth(app: Express) {
  // Endpoint to initiate OAuth flow
  app.get('/api/auth/google', (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'You must be logged in to connect Gmail' });
    }

    const authUrl = getAuthUrl();
    res.json({ authUrl });
  });

  // OAuth callback handler - matches the route specified in GOOGLE_REDIRECT_URI
  app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code || typeof code !== 'string') {
      console.error('Authentication failed: No code provided');
      return res.status(400).send('Authentication failed: No code provided');
    }

    try {
      console.log('Received Google auth callback with code');
      
      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken({
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
      });
      console.log('Successfully exchanged code for tokens');
      
      // Save tokens to the user's record in database
      if (req.isAuthenticated() && req.user?.id) {
        await storage.saveGoogleTokens(req.user.id, tokens);
        console.log(`Saved Google tokens for user ${req.user.id}`);
        res.redirect('/emails'); // Redirect to the email interface
      } else {
        console.error('User not authenticated during Google callback');
        res.redirect('/auth?error=not_authenticated');
      }
    } catch (error) {
      console.error('Error during token exchange:', error);
      res.redirect('/auth?error=token_exchange_failed');
    }
  });
  
  // Add a duplicate route to handle the variant of the redirect URI
  app.get('*/auth/google/callback', (req, res) => {
    // Strip any prefix and forward to the actual callback handler
    const callbackPath = '/auth/google/callback';
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    console.log(`Redirecting OAuth callback to ${callbackPath}${queryString}`);
    res.redirect(`${callbackPath}${queryString}`);
  });

  // Endpoint to check if user has connected Gmail
  app.get('/api/google/status', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const tokens = await storage.getGoogleTokens(req.user!.id);
      res.json({ connected: !!tokens });
    } catch (error) {
      console.error('Error checking Google connection status:', error);
      res.status(500).json({ error: 'Failed to check Google connection status' });
    }
  });

  // Endpoint to disconnect Gmail
  app.post('/api/google/disconnect', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await storage.deleteGoogleTokens(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting Google:', error);
      res.status(500).json({ error: 'Failed to disconnect Google' });
    }
  });
}

// Helper function to get authenticated Gmail client for a user
export async function getGmailClient(userId: number) {
  // Get stored tokens
  const storedTokens = await storage.getGoogleTokens(userId);
  
  if (!storedTokens) {
    throw new Error('User has not connected Gmail');
  }

  // Create a new OAuth2 client with the same client ID and secret
  const userOAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  // Configure oauth client with user's tokens
  userOAuth2Client.setCredentials({
    access_token: storedTokens.accessToken,
    refresh_token: storedTokens.refreshToken || undefined,
    expiry_date: storedTokens.tokenExpiry ? new Date(storedTokens.tokenExpiry).getTime() : undefined
  });

  // Create Gmail client
  const gmail = google.gmail({ version: 'v1', auth: userOAuth2Client });
  
  return gmail;
}