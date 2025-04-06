import { google } from 'googleapis';
import { Express, Request, Response } from 'express';
import { storage } from './storage';
import { SessionData } from 'express-session';

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

// Configure OAuth 2.0 client with the determined redirect URI
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
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
  // Log OAuth configuration for debugging
  console.log(`OAuth Config - Client ID: ${process.env.GOOGLE_CLIENT_ID?.substring(0, 5) || 'NOT_SET'}...`);
  console.log(`OAuth Config - Using redirect URI: ${redirectUri}`);
  
  // Validate required parameters
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('Missing OAuth credentials - please check environment variables');
    console.error('GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID);
    console.error('GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET);
    console.error('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI || 'not set');
    throw new Error('Google OAuth is not configured. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.');
  }
  
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      redirect_uri: redirectUri, // Use hardcoded redirect URI
      client_id: process.env.GOOGLE_CLIENT_ID // Explicitly include the client ID
    });
    
    console.log(`Successfully generated auth URL: ${authUrl.substring(0, 50)}...`);
    return authUrl;
  } catch (error) {
    console.error('Error generating auth URL:', error);
    throw new Error(`Failed to generate auth URL: ${error instanceof Error ? error.message : String(error)}`);
  }
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
      handleGoogleCallback(req, res);
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
  async function handleGoogleCallback(req: any, res: any) {
    console.log('==== GOOGLE AUTH CALLBACK RECEIVED ====');
    console.log('Request query params:', req.query);
    console.log('User authenticated:', req.isAuthenticated());
    console.log('User ID:', req.user?.id);
    console.log('Session data:', JSON.stringify(req.session));
    
    const { code } = req.query;
    
    if (!code || typeof code !== 'string') {
      console.error('Authentication failed: No code provided');
      return res.status(400).send('Authentication failed: No code provided');
    }

    try {
      console.log('Received Google auth callback with code');
      
      // Exchange code for tokens
      console.log('Attempting to exchange code for tokens with:');
      console.log(`- Redirect URI: ${redirectUri}`);
      console.log(`- Client ID: ${process.env.GOOGLE_CLIENT_ID?.substring(0, 5)}...`);
      
      // Clean the code to make sure it's properly formatted
      const cleanCode = sanitizeAuthCode(code);
      console.log(`Original code length: ${code.length}, cleaned code length: ${cleanCode.length}`);
      
      // Use the existing OAuth client with explicit redirect URI
      const tokenResponse = await oauth2Client.getToken({
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
  
  // Function to clean and validate an authorization code
  function sanitizeAuthCode(code: string): string {
    console.log('Sanitizing auth code, original length:', code.length);
    console.log('Raw input (first 30 chars):', code.substring(0, 30) + '...');
    
    // Early return for empty input
    if (!code) {
      console.log('Empty code provided');
      return '';
    }
    
    // Step 1: Trim whitespace and remove any quotes that might have been accidentally included
    code = code.trim().replace(/["']/g, '');
    
    // Step 2: Handle URL encoding FIRST (before extracting) as the URL itself might be encoded
    try {
      if (code.includes('%')) {
        const decodedCode = decodeURIComponent(code);
        console.log('Decoded URL-encoded auth code, length before:', code.length, 'after:', decodedCode.length);
        code = decodedCode;
      }
    } catch (err) {
      console.error('Error decoding auth code:', err);
    }
    
    let originalCode = code;
    let extractedCode = '';
    
    // Log the code we're trying to extract from
    console.log('Attempting to extract code from:', code.substring(0, 100) + (code.length > 100 ? '...' : ''));
    
    // Step 3: Try different methods to extract the code until one works
    
    // Method 1: Full URL with code parameter (most common scenario)
    if (!extractedCode && code.includes('code=')) {
      try {
        console.log('Trying to extract from URL with code parameter');
        const match = code.match(/[?&]code=([^&]+)/);
        if (match && match[1]) {
          extractedCode = match[1];
          console.log('Successfully extracted code from URL parameter, length:', extractedCode.length);
        }
      } catch (err) {
        console.error('Error extracting code from URL:', err);
      }
    }
    
    // Method 2: Code parameter fragment (code=xxxx)
    if (!extractedCode && code.startsWith('code=')) {
      try {
        console.log('Trying to extract from code parameter fragment');
        const parts = code.split('=');
        if (parts.length > 1) {
          extractedCode = parts[1].split('&')[0]; // Handle potential additional params
          console.log('Successfully extracted code from fragment, length:', extractedCode.length);
        }
      } catch (err) {
        console.error('Error extracting code from fragment:', err);
      }
    }
    
    // Method 3: Just code portion after code= anywhere in the string (more flexible)
    if (!extractedCode && code.includes('code=')) {
      try {
        console.log('Trying flexible extraction after code=');
        const codeStart = code.indexOf('code=') + 5;
        let codeEnd = code.indexOf('&', codeStart);
        if (codeEnd === -1) codeEnd = code.length;
        
        if (codeStart > 5 && codeEnd > codeStart) {
          extractedCode = code.substring(codeStart, codeEnd);
          console.log('Successfully extracted code using flexible method, length:', extractedCode.length);
        }
      } catch (err) {
        console.error('Error using flexible extraction:', err);
      }
    }
    
    // Method 4: JSON-like structure with code property
    if (!extractedCode && code.includes('"code"')) {
      try {
        console.log('Trying to extract from JSON-like structure');
        const match = code.match(/"code"\s*:\s*"([^"]+)"/);
        if (match && match[1]) {
          extractedCode = match[1];
          console.log('Successfully extracted code from JSON structure, length:', extractedCode.length);
        }
      } catch (err) {
        console.error('Error extracting code from JSON structure:', err);
      }
    }
    
    // Method 5: Try to extract after "callback?code=" which is most common for Google
    if (!extractedCode && code.includes('callback?code=')) {
      try {
        console.log('Trying specific extraction after callback?code=');
        const codeStart = code.indexOf('callback?code=') + 'callback?code='.length;
        let codeEnd = code.indexOf('&', codeStart);
        if (codeEnd === -1) codeEnd = code.length;
        
        if (codeStart > 'callback?code='.length && codeEnd > codeStart) {
          extractedCode = code.substring(codeStart, codeEnd);
          console.log('Successfully extracted code after callback, length:', extractedCode.length);
        }
      } catch (err) {
        console.error('Error using callback extraction:', err);
      }
    }
    
    // If any extraction method worked, use that result
    if (extractedCode) {
      code = extractedCode;
      console.log('Using extracted code:', code.substring(0, 10) + '...');
    } else {
      // If no method worked and the input looks like it might already be just the code,
      // keep it as is but log a warning
      if (code.length > 20 && !code.includes(' ') && !code.includes('=')) {
        console.log('No extraction method worked, but input appears to be a raw code already');
      } else {
        console.warn('WARNING: Failed to extract authorization code from input');
        console.warn('Input was:', code.substring(0, 100) + (code.length > 100 ? '...' : ''));
      }
    }
    
    // Final trim and validation
    code = code.trim();
    
    // Simple validation to ensure it looks like a typical OAuth2 code
    if (code.length < 10) {
      console.warn('WARNING: Extracted code seems too short:', code.length);
    }
    
    console.log('Original input length:', originalCode.length, 'Final code length:', code.length);
    return code;
  }

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
      console.log(`- Client ID: ${process.env.GOOGLE_CLIENT_ID?.substring(0, 5)}...`);
      console.log(`- Using code (first 10 chars): ${cleanCode.substring(0, 10)}...`);
      
      // Create a fresh OAuth client for each request
      const freshOAuthClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
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
  // Get stored tokens
  const storedTokens = await storage.getGoogleTokens(userId);
  
  if (!storedTokens) {
    throw new Error('User has not connected Gmail');
  }

  // Create a new OAuth2 client with the same client ID and secret
  const userOAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri // Use hardcoded redirect URI
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