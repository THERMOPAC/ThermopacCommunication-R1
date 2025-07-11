import { google } from 'googleapis';
import { Express, Request, Response } from 'express';
import { storage } from './storage';
import { SessionData } from 'express-session';
import { sanitizeAuthCode } from './google-oauth';

// Extend the session data type to include our custom properties
declare module 'express-session' {
  interface SessionData {
    passport?: { user: number };
    gmailAuthUser?: number;
    temporaryGoogleTokens?: any;
  }
}

// Set the redirect URI to match exactly what's configured in Google Cloud Console
// IMPORTANT: This MUST match exactly what's configured in Google Cloud Console
// First try to use the environment variable, then fall back to hardcoded value if not set
const redirectUri = process.env.GOOGLE_REDIRECT_URI || "https://thermopac-communication-thermopacllp.replit.app/auth/google/callback";

// Note: If you continue to see redirect_uri_mismatch errors, you need to:
// 1. Copy the exact URI from the google error message
// 2. Add it to your Google Cloud Console under "Authorized redirect URIs"
// 3. Then set it as GOOGLE_REDIRECT_URI in your Replit environment variables

// Log the effective redirect URI for debugging
console.log(`Google Auth using OAuth redirect URI: ${redirectUri}`);
console.log(`Using OAuth redirect URI: ${redirectUri}`);

// Temporary hardcoded fallback values (will be replaced with proper environment variables)
const clientId = process.env.GOOGLE_CLIENT_ID || "1078980534389-n5207fth1m2oo2iqgnsqpp530qdalb73.apps.googleusercontent.com";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "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";

// Log the credentials we're using (partially masked for security)
console.log(`Google Auth using credential configuration:`);
console.log(`- Client ID: ${clientId.substring(0, 8)}...${clientId.substring(clientId.length - 5)}`);
console.log(`- Client Secret: ${clientSecret.substring(0, 6)}...`);

// Configure OAuth 2.0 client with the determined redirect URI and our credentials
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
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
  // Create a direct implementation to avoid import issues
  console.log('===== GENERATING OAUTH URL DIRECTLY =====');
  
  // Create a fresh OAuth2 client specifically for this request to avoid any state issues
  const authClient = new google.auth.OAuth2(
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
  
  console.log(`Successfully generated auth URL: ${authUrl.substring(0, 50)}...`);
  return authUrl;
}

// Set up Google OAuth routes and handlers
export function setupGoogleAuth(app: Express) {
  // Endpoint to initiate OAuth flow
  app.get('/api/auth/google', (req, res) => {
    console.log('OAuth initiation requested by user:', req.user?.id);
    
    if (!req.isAuthenticated()) {
      console.error('Unauthenticated user attempted to connect Gmail');
      return res.status(401).json({ error: 'You must be logged in to connect Gmail' });
    }
    
    // Force save the session with a regenerated ID to ensure persistence
    req.session.regenerate((regenerateErr: Error | null) => {
      if (regenerateErr) {
        console.error('Failed to regenerate session ID:', regenerateErr);
        return res.status(500).json({ error: 'Session error, please try again' });
      }
      
      // Save user info in regenerated session
      req.session.passport = { user: req.user?.id };
      
      // Now save the session
      req.session.save((saveErr: Error | null) => {
        if (saveErr) {
          console.error('Failed to save session before OAuth flow:', saveErr);
          return res.status(500).json({ error: 'Session error, please try again' });
        }
        
        console.log(`User ${req.user?.username} (ID: ${req.user?.id}) starting Gmail authorization`);
        console.log('Session ID (regenerated):', req.sessionID);
        
        // Store the user ID directly in the session for recovery
        req.session.gmailAuthUser = req.user?.id;
        
        try {
          const authUrl = getAuthUrl();
          console.log('Generated auth URL:', authUrl.substring(0, 50) + '...');
          res.json({ url: authUrl, authUrl: authUrl });
        } catch (error) {
          console.error('Error generating auth URL:', error);
          res.status(500).json({ 
            error: 'Failed to generate Google authorization URL',
            message: error instanceof Error ? error.message : String(error)
          });
        }
      });
    });
  });

  // First, capture any path that ends with /auth/google/callback
  // This helps us handle potential path prefixes or variations
  app.get('**/auth/google/callback', (req, res, next) => {
    console.log('==== CALLBACK HANDLER TRIGGERED ====');
    console.log('Original URL:', req.originalUrl);
    console.log('Path:', req.path);
    console.log('Query:', req.query);
    console.log('Is authenticated:', req.isAuthenticated());
    
    // If this is our exact expected path, let this route handle it
    if (req.path === '/auth/google/callback') {
      console.log('Processing exact callback path match');
      handleGoogleCallback(req, res, next);
    } else {
      // If it's a variation, redirect to the correct path
      const callbackPath = '/auth/google/callback';
      const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const redirectUrl = `${callbackPath}${queryString}`;
      console.log(`Redirecting variant callback path to: ${redirectUrl}`);
      res.redirect(redirectUrl);
    }
  });
  
  // Define a function to handle the callback logic
  async function handleGoogleCallback(req: any, res: any, next?: any) {
    console.log('==== GOOGLE AUTH CALLBACK RECEIVED ====');
    console.log('Request query params:', req.query);
    console.log('User authenticated:', req.isAuthenticated());
    console.log('User ID:', req.user?.id);
    console.log('Session data:', JSON.stringify(req.session));
    
    // Check if this is a Google Calendar OAuth callback
    const { state, code } = req.query;
    let isCalendarCallback = false;
    
    // Check for both old and new state formats
    if (state === 'service=calendar') {
      isCalendarCallback = true;
    } else if (state && typeof state === 'string') {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        if (stateData.service === 'calendar') {
          isCalendarCallback = true;
        }
      } catch (e) {
        // Not JSON, continue with normal processing
      }
    }
    
    if (isCalendarCallback) {
      console.log('Calendar OAuth callback detected, passing to next handler');
      // Let the next handler (Google Calendar routes) handle this
      return next();
    }
    
    // Continue with Gmail OAuth handling
    
    if (!code || typeof code !== 'string') {
      console.error('Authentication failed: No code provided');
      return res.status(400).send('Authentication failed: No code provided');
    }

    try {
      console.log('Received Google auth callback with code');
      
      // Exchange code for tokens
      console.log('Attempting to exchange code for tokens with:');
      console.log(`- Redirect URI: ${redirectUri}`);
      console.log(`- Client ID: ${clientId.substring(0, 8)}...${clientId.substring(clientId.length - 5)}`);
      
      // Clean the code to make sure it's properly formatted
      const cleanCode = sanitizeAuthCode(code);
      console.log(`Original code length: ${code.length}, cleaned code length: ${cleanCode.length}`);
      
      // Create a new OAuth client with our hardcoded credentials
      const callbackOAuthClient = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );
      
      // Use the new OAuth client with explicit redirect URI
      const tokenResponse = await callbackOAuthClient.getToken({
        code: cleanCode,
        redirect_uri: redirectUri
      });
      
      const tokens = tokenResponse.tokens;
      console.log('Successfully exchanged code for tokens:', tokens ? 'Tokens received' : 'No tokens received');
      console.log('Access token received:', !!tokens.access_token);
      console.log('Refresh token received:', !!tokens.refresh_token);
      
      // Check if we have an authenticated user
      const userId = req.isAuthenticated() ? req.user?.id : (req.session?.gmailAuthUser || null);
      
      if (userId) {
        try {
          console.log(`Saving tokens for user ID: ${userId}`);
          await storage.saveGoogleTokens(userId, tokens);
          console.log(`Successfully saved Google tokens for user ${userId}`);
          
          // Make sure the session is preserved after redirecting
          req.session.save((err: Error | null) => {
            if (err) {
              console.error('Error saving session after OAuth:', err);
            }
            console.log('Session saved successfully, redirecting to emails page');
            res.redirect('/emails?success=true');
          });
        } catch (error) {
          const saveError = error as Error;
          console.error('Error saving tokens to database:', saveError);
          res.redirect('/emails?error=token_save_failed&message=' + encodeURIComponent(saveError.message || 'Unknown error'));
        }
      } else {
        console.error('CRITICAL ERROR: Cannot identify user during Google callback');
        console.error('Session may have been lost during the OAuth flow');
        console.error('Session ID:', req.sessionID);
        console.error('Session data:', JSON.stringify(req.session));
        
        // Save the tokens temporarily in the session as a fallback
        req.session.temporaryGoogleTokens = tokens;
        req.session.save(() => {
          res.redirect('/emails?error=session_lost&message=Please+try+manual+authentication');
        });
      }
    } catch (error) {
      console.error('Error during token exchange:', error);
      
      // Determine the specific error for better user feedback
      let errorType = 'token_exchange_failed';
      let errorMessage = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('Detailed error message:', errorMessage);
        
        // Check for specific error conditions
        if (errorMessage.includes('redirect_uri_mismatch')) {
          errorType = 'redirect_uri_mismatch';
          console.error(`CRITICAL ERROR: Redirect URI mismatch! Google expected ${redirectUri}`);
          console.error('Please ensure this URI is registered in Google Cloud Console!');
        } else if (errorMessage.includes('invalid_grant')) {
          errorType = 'invalid_grant';
        } else if (errorMessage.includes('invalid_client')) {
          errorType = 'invalid_client';
        }
      }
      
      // Redirect with specific error information
      res.redirect(`/emails?error=${errorType}&message=${encodeURIComponent(errorMessage)}`);
    }
  }

  // Endpoint to check if user has connected Gmail
  app.get('/api/google/status', async (req, res) => {
    console.log('Checking Gmail connection status for user:', req.user?.id);
    
    if (!req.isAuthenticated()) {
      console.log('User not authenticated when checking Gmail status');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const tokens = await storage.getGoogleTokens(req.user!.id);
      console.log('Gmail tokens found for user:', !!tokens);
      if (tokens) {
        console.log('Token details: access_token exists:', !!tokens.accessToken);
        console.log('Token details: refresh_token exists:', !!tokens.refreshToken);
        console.log('Token details: expiry exists:', !!tokens.tokenExpiry);
      }
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
  
  // Using the imported sanitizeAuthCode function from google-oauth.ts

  // Manual authentication endpoint for when redirect doesn't work
  app.post('/api/gmail/manual-auth', async (req, res) => {
    console.log('Manual Gmail authentication attempt');
    
    if (!req.isAuthenticated()) {
      console.error('Unauthorized manual auth attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { code } = req.body;
    
    if (!code || typeof code !== 'string') {
      console.error('No authorization code provided for manual auth');
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    console.log('Processing manual authentication with code');
    console.log('Raw input:', code.substring(0, 30) + '...');
    
    // Clean and validate the authorization code
    const cleanCode = sanitizeAuthCode(code);
    console.log(`Original code length: ${code.length}, cleaned code length: ${cleanCode.length}`);
    
    // Additional validation
    if (!cleanCode || cleanCode.length < 10) {
      console.error('Code extraction failed or resulted in invalid code');
      return res.status(400).json({ 
        error: 'invalid_code_format', 
        message: 'Could not extract a valid authorization code. Please make sure you are copying the entire URL after Google authorization. The URL should contain "code=" followed by a long string of characters.' 
      });
    }
    
    try {
      // Exchange code for tokens
      console.log('Attempting to exchange code for tokens with:');
      console.log(`- Redirect URI: ${redirectUri}`);
      console.log(`- Client ID: ${clientId.substring(0, 8)}...${clientId.substring(clientId.length - 5)}`);
      console.log(`- Using code (first 10 chars): ${cleanCode.substring(0, 10)}...`);
      
      // Create a fresh OAuth client for each request
      const freshOAuthClient = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );
      
      const tokenResponse = await freshOAuthClient.getToken({
        code: cleanCode,
        redirect_uri: redirectUri
      });
      
      const tokens = tokenResponse.tokens;
      console.log('Successfully exchanged code for tokens:', tokens ? 'Tokens received' : 'No tokens received');
      console.log('Access token received:', !!tokens.access_token);
      console.log('Refresh token received:', !!tokens.refresh_token);
      
      // Save tokens to the user's record in database
      await storage.saveGoogleTokens(req.user!.id, tokens);
      console.log(`Successfully saved Google tokens for user ${req.user!.id} via manual auth`);
      
      res.json({ 
        success: true, 
        message: 'Gmail account connected successfully' 
      });
    } catch (error) {
      console.error('Error during manual token exchange:', error);
      
      // Determine specific error type
      let errorType = 'token_exchange_failed';
      let errorMessage = error instanceof Error ? error.message : String(error);
      let userFriendlyMessage = '';
      
      if (error instanceof Error) {
        const errorMsg = error.message || '';
        
        if (errorMsg.includes('redirect_uri_mismatch')) {
          errorType = 'redirect_uri_mismatch';
          userFriendlyMessage = 'There is a mismatch between the redirect URI configured in Google Cloud Console and this application.';
        } else if (errorMsg.includes('invalid_grant')) {
          errorType = 'invalid_grant';
          userFriendlyMessage = 'The authorization code is invalid or has expired. Authorization codes typically expire after a few minutes. Please try the process again and copy the URL immediately after authorizing with Google.';
        } else if (errorMsg.includes('invalid_client')) {
          errorType = 'invalid_client';
          userFriendlyMessage = 'The Google OAuth client configuration is invalid. Please check your client ID and client secret.';
        } else {
          userFriendlyMessage = 'An error occurred during the OAuth process. Please try again.';
        }
      }
      
      res.status(400).json({ 
        error: errorType, 
        message: userFriendlyMessage || errorMessage
      });
    }
  });
}

// Helper function to get authenticated Gmail client for a user
export async function getGmailClient(userId: number) {
  console.log(`Getting Gmail client for user ${userId}`);
  
  // Get stored tokens
  const storedTokens = await storage.getGoogleTokens(userId);
  
  if (!storedTokens) {
    console.error(`No Google tokens found for user ${userId}`);
    throw new Error('User has not connected Gmail');
  }
  
  // Validate token data
  if (!storedTokens.accessToken) {
    console.error(`Invalid token data for user ${userId}: Missing access token`);
    throw new Error('Invalid Gmail token: Missing access token');
  }
  
  const now = Date.now();
  const tokenExpiry = storedTokens.tokenExpiry ? new Date(storedTokens.tokenExpiry).getTime() : undefined;
  const isExpired = tokenExpiry ? tokenExpiry < now : false;
  const timeUntilExpiry = tokenExpiry ? Math.floor((tokenExpiry - now) / 1000 / 60) : 'unknown';
  
  console.log(`Token diagnostics for user ${userId}:`, {
    hasAccessToken: !!storedTokens.accessToken,
    accessTokenLength: storedTokens.accessToken ? storedTokens.accessToken.length : 0,
    hasRefreshToken: !!storedTokens.refreshToken,
    refreshTokenLength: storedTokens.refreshToken ? storedTokens.refreshToken.length : 0,
    tokenExpiry: tokenExpiry ? new Date(tokenExpiry).toISOString() : 'none',
    isExpired: isExpired,
    timeUntilExpiryMinutes: timeUntilExpiry,
    updatedAt: storedTokens.updatedAt ? new Date(storedTokens.updatedAt).toISOString() : 'unknown'
  });
  
  if (isExpired && !storedTokens.refreshToken) {
    console.error(`Token expired for user ${userId} and no refresh token available`);
    throw new Error('Token has been expired and no refresh token is available. Please reconnect your Gmail account.');
  }
  
  try {
    // Create a new OAuth2 client with the same client ID and secret
    const userOAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri // Use hardcoded redirect URI
    );
    
    // Check for token expiration
    if (isExpired) {
      console.warn(`Access token for user ${userId} has expired. Token expiry: ${tokenExpiry ? new Date(tokenExpiry).toISOString() : 'unknown'}`);
      console.log('Will attempt to refresh using refresh token...');
      
      if (!storedTokens.refreshToken) {
        throw new Error('Cannot refresh token: No refresh token available');
      }
    }
    
    // Configure oauth client with user's tokens
    userOAuth2Client.setCredentials({
      access_token: storedTokens.accessToken,
      refresh_token: storedTokens.refreshToken || undefined,
      expiry_date: tokenExpiry
    });
    
    // Set up token refresh handler to update stored tokens
    userOAuth2Client.on('tokens', async (tokens) => {
      console.log(`Received token refresh for user ${userId}:`, {
        hasNewAccessToken: !!tokens.access_token,
        hasNewRefreshToken: !!tokens.refresh_token,
        hasNewExpiryDate: !!tokens.expiry_date
      });
      
      if (tokens.access_token || tokens.refresh_token) {
        console.log('Updating tokens in database');
        try {
          const updates: Partial<GmailToken> = {
            updatedAt: new Date()
          };
          
          if (tokens.access_token) {
            updates.accessToken = tokens.access_token;
          }
          
          if (tokens.refresh_token) {
            updates.refreshToken = tokens.refresh_token;
          }
          
          if (tokens.expiry_date) {
            updates.tokenExpiry = new Date(tokens.expiry_date);
          }
          
          await storage.updateGmailToken(userId, updates);
          console.log(`Successfully updated tokens for user ${userId}`);
        } catch (error) {
          console.error('Error updating tokens after refresh:', error);
        }
      }
    });
    
    // Force token refresh if expired
    if (isExpired && storedTokens.refreshToken) {
      try {
        console.log('Forcing token refresh...');
        // This will trigger the 'tokens' event if successful
        const refreshResult = await userOAuth2Client.getAccessToken();
        console.log('Token refresh successful:', refreshResult ? 'Got result' : 'No result');
      } catch (refreshError: any) {
        console.error('Error refreshing token:', refreshError.message || refreshError);
        throw new Error(`Failed to refresh expired token: ${refreshError.message || 'Unknown error'}`);
      }
    }
    
    // Create Gmail client
    console.log(`Creating Gmail client for user ${userId}`);
    const gmail = google.gmail({ version: 'v1', auth: userOAuth2Client });
    
    return gmail;
  } catch (error: any) {
    console.error(`Error creating Gmail client for user ${userId}:`, error);
    
    // Provide more specific error messages for common issues
    if (error.message?.includes('invalid_grant')) {
      throw new Error('Invalid or expired refresh token. Please reconnect your Gmail account.');
    } else if (error.message?.includes('Token has been expired')) {
      throw new Error('Your Google authentication has expired. Please reconnect your Gmail account.');
    } else {
      throw error;
    }
  }
}