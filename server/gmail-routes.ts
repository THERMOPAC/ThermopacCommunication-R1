import express, { Request, Response } from 'express';
import { storage } from './storage';
import { getGmailClient, getAuthUrl } from './google-auth';
import { getTokens, sanitizeAuthCode } from './google-oauth';
import { gmail_v1 } from 'googleapis';

export function setupGmailRoutes(app: express.Express) {
  // Manual authentication endpoint for Gmail
  app.post('/api/gmail/manual-auth', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      console.log('=== MANUAL GMAIL AUTHENTICATION ===');
      console.log(`User ${req.user!.username} (ID: ${req.user!.id}) attempting manual authentication`);
      
      const { code } = req.body;
      
      if (!code) {
        console.error('No code provided in request body');
        return res.status(400).json({ error: 'Authorization code is required' });
      }
      
      console.log(`Raw input code length: ${code.length}`);
      
      // Clean the code to extract the authorization code
      const cleanCode = sanitizeAuthCode(code);
      console.log(`Cleaned code length: ${cleanCode.length}`);
      
      if (!cleanCode || cleanCode.length < 20) {
        console.error('Invalid authorization code after cleaning');
        return res.status(400).json({ 
          error: 'Invalid authorization code', 
          details: 'The code could not be extracted from your input. Please make sure to copy the full URL after Google authorization.'
        });
      }
      
      // Exchange the code for tokens
      console.log(`Attempting to exchange manual auth code for user: ${req.user!.id}`);
      const tokens = await getTokens(cleanCode);
      
      if (!tokens) {
        console.error('No tokens returned from getTokens');
        return res.status(400).json({ error: 'Failed to exchange authorization code for tokens' });
      }
      
      console.log('Token exchange successful:');
      console.log('- Access token received:', !!tokens.access_token);
      console.log('- Refresh token received:', !!tokens.refresh_token);
      
      // Save the tokens in database
      await storage.saveGoogleTokens(req.user!.id, tokens);
      
      console.log(`Successfully saved Google tokens for user ${req.user!.id} via manual auth`);
      res.json({ 
        success: true, 
        message: 'Gmail connected successfully!'
      });
    } catch (error) {
      console.error('=== MANUAL AUTH ERROR ===');
      console.error('Error details:', error);
      
      let errorMessage = 'Authentication failed';
      let errorDetails = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('Error message:', errorMessage);
        console.error('Error stack:', error.stack);
        
        // Check for specific error types
        if (errorMessage.includes('invalid_grant')) {
          errorDetails = 'The authorization code has expired or has already been used. Please try again with a new authorization.';
        } else if (errorMessage.includes('redirect_uri_mismatch')) {
          errorDetails = 'The redirect URI doesn\'t match what\'s configured in Google Cloud Console.';
        } else if (errorMessage.includes('invalid_request')) {
          errorDetails = 'The request was malformed. Please ensure you\'re copying the complete URL after authorization.';
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: errorDetails || 'An unexpected error occurred during OAuth authentication'
      });
    }
  });
  // Get Gmail auth URL for connecting account
  app.get('/api/gmail/auth-url', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      console.log('=== GENERATING GMAIL AUTH URL ===');
      console.log(`User ${req.user!.username} (ID: ${req.user!.id}) requesting Gmail auth URL`);
      
      // Store the user ID in the session to help with redirects
      req.session.gmailAuthUser = req.user!.id;
      
      // Save the session before proceeding
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session before Gmail auth:', err);
            reject(err);
          } else {
            console.log('Session saved successfully with ID:', req.sessionID);
            resolve();
          }
        });
      });
      
      // Use the auth utility to generate the URL - with fallback credentials if needed
      const authUrl = getAuthUrl();
      
      // Log the auth operation
      console.log('Auth URL generated and returning to client');
      
      // Return the URL to the client
      res.json({ 
        url: authUrl,
        sessionId: req.sessionID, // Include session ID for debugging
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      let errorMessage = 'Failed to generate authentication URL';
      
      if (error instanceof Error) {
        console.error('Detailed error message:', error.message);
        console.error('Error stack:', error.stack);
        errorMessage = error.message;
      }
      
      res.status(500).json({ 
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Check if user has connected Gmail
  app.get('/api/gmail/status', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      const token = await storage.getGmailToken(req.user!.id);
      res.json({ connected: !!token });
    } catch (error) {
      console.error('Error checking Gmail connection status:', error);
      res.status(500).json({ error: 'Failed to check Gmail connection status' });
    }
  });
  
  // Disconnect Gmail
  app.post('/api/gmail/disconnect', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      await storage.deleteGmailToken(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting Gmail:', error);
      res.status(500).json({ error: 'Failed to disconnect Gmail' });
    }
  });
  // Fetch Gmail messages for authenticated user
  app.get('/api/gmail/messages', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    
    try {
      // Check if user has configured Gmail first
      const token = await storage.getGmailToken(userId);
      if (!token) {
        return res.status(400).json({ error: 'Gmail not connected. Please connect your Gmail account first.' });
      }

      // Set up filters
      const filters: any = {};
      
      if (req.query.isRead !== undefined) {
        filters.isRead = req.query.isRead === 'true';
      }
      
      if (req.query.isImportant !== undefined) {
        filters.isImportant = req.query.isImportant === 'true';
      }
      
      if (req.query.from) {
        filters.from = req.query.from as string;
      }
      
      if (req.query.to) {
        filters.to = req.query.to as string;
      }
      
      if (req.query.subject) {
        filters.subject = req.query.subject as string;
      }
      
      // Handle date filters
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }
      
      // Retrieve messages from database
      const messages = await storage.getGmailMessagesForUser(userId, filters);
      
      // Return messages
      res.json(messages);
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      res.status(500).json({ error: 'Failed to fetch Gmail messages' });
    }
  });

  // Mark message as read/unread
  app.patch('/api/gmail/messages/:id/read', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const messageId = parseInt(req.params.id);
    const { isRead } = req.body;
    
    if (isRead === undefined) {
      return res.status(400).json({ error: 'isRead is required' });
    }
    
    try {
      // Update message in the database
      const message = await storage.updateGmailMessage(messageId, { isRead });
      
      // Also update in Gmail if connected
      try {
        const gmail = await getGmailClient(req.user!.id);
        const labels = isRead ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] };
        await gmail.users.messages.modify({
          userId: 'me',
          id: message.messageId,
          requestBody: labels
        });
      } catch (error) {
        console.warn('Could not update read status in Gmail:', error);
        // Continue anyway as we've updated the local database
      }
      
      res.json(message);
    } catch (error) {
      console.error('Error updating message read status:', error);
      res.status(500).json({ error: 'Failed to update message read status' });
    }
  });

  // Mark message as important/not important
  app.patch('/api/gmail/messages/:id/important', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const messageId = parseInt(req.params.id);
    const { isImportant } = req.body;
    
    if (isImportant === undefined) {
      return res.status(400).json({ error: 'isImportant is required' });
    }
    
    try {
      // Update message in the database
      const message = await storage.updateGmailMessage(messageId, { isImportant });
      
      // Also update in Gmail if connected
      try {
        const gmail = await getGmailClient(req.user!.id);
        const labels = isImportant ? { addLabelIds: ['IMPORTANT'] } : { removeLabelIds: ['IMPORTANT'] };
        await gmail.users.messages.modify({
          userId: 'me',
          id: message.messageId,
          requestBody: labels
        });
      } catch (error) {
        console.warn('Could not update important status in Gmail:', error);
        // Continue anyway as we've updated the local database
      }
      
      res.json(message);
    } catch (error) {
      console.error('Error updating message important status:', error);
      res.status(500).json({ error: 'Failed to update message important status' });
    }
  });

  // Get Gmail settings for user
  app.get('/api/gmail/settings', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      const settings = await storage.getGmailSettings(req.user!.id);
      if (!settings) {
        // Create default settings if none exist
        const newSettings = await storage.saveGmailSettings({
          userId: req.user!.id,
          autoSyncEnabled: true,
          syncFrequencyMinutes: 30,
          autoForwardRules: []
        });
        return res.json(newSettings);
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching Gmail settings:', error);
      res.status(500).json({ error: 'Failed to fetch Gmail settings' });
    }
  });

  // Update Gmail settings
  app.patch('/api/gmail/settings', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { autoSyncEnabled, syncFrequencyMinutes, autoForwardRules } = req.body;
    const updateData: any = {};
    
    if (autoSyncEnabled !== undefined) {
      updateData.autoSyncEnabled = autoSyncEnabled;
    }
    
    if (syncFrequencyMinutes !== undefined) {
      updateData.syncFrequencyMinutes = syncFrequencyMinutes;
    }
    
    if (autoForwardRules !== undefined) {
      updateData.autoForwardRules = autoForwardRules;
    }
    
    try {
      // Check if settings exist
      let settings = await storage.getGmailSettings(req.user!.id);
      
      if (!settings) {
        // Create new settings if none exist
        settings = await storage.saveGmailSettings({
          userId: req.user!.id,
          ...updateData,
          autoSyncEnabled: updateData.autoSyncEnabled !== undefined ? updateData.autoSyncEnabled : true,
          syncFrequencyMinutes: updateData.syncFrequencyMinutes !== undefined ? updateData.syncFrequencyMinutes : 30,
          autoForwardRules: updateData.autoForwardRules || []
        });
      } else {
        // Update existing settings
        settings = await storage.updateGmailSettings(req.user!.id, updateData);
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Error updating Gmail settings:', error);
      res.status(500).json({ error: 'Failed to update Gmail settings' });
    }
  });

  // Trigger manual sync
  app.post('/api/gmail/sync', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      console.log('Starting Gmail sync for user:', req.user!.id);
      
      const token = await storage.getGmailToken(req.user!.id);
      if (!token) {
        return res.status(400).json({ error: 'Gmail not connected. Please connect your Gmail account first.' });
      }
      
      let gmail: any;
      let messageIds: string[] = [];
      
      try {
        gmail = await getGmailClient(req.user!.id);
        
        // Get most recent messages
        const response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 20, // Limit to 20 messages for manual sync
        });
        
        const messages = response.data.messages || [];
        
        if (messages.length === 0) {
          console.log('No messages found in Gmail for user:', req.user!.id);
          return res.json({ messageCount: 0, message: 'No new messages found.' });
        }
        
        console.log(`Found ${messages.length} messages in Gmail for user:`, req.user!.id);
        
        // Get all message IDs from the response
        messageIds = messages.map((m: any) => m.id).filter(Boolean) as string[];
      } catch (apiError: any) {
        console.error('Gmail API Error:', apiError);
        
        // Check if this is an API not enabled error
        if (apiError.message && apiError.message.includes('Gmail API has not been used in project') &&
            apiError.message.includes('or it is disabled')) {
          
          // Extract the project ID and console URL from the error message if available
          const projectIdMatch = apiError.message.match(/project (\d+)/);
          const projectId = projectIdMatch ? projectIdMatch[1] : 'your Google Cloud project';
          
          const consoleUrlMatch = apiError.message.match(/(https:\/\/console\.developers\.google\.com\/apis\/api\/gmail\.googleapis\.com\/overview\?project=\d+)/);
          const consoleUrl = consoleUrlMatch ? consoleUrlMatch[1] : 'https://console.cloud.google.com/apis/library/gmail.googleapis.com';
          
          return res.status(400).json({ 
            error: 'Gmail API not enabled or still activating',
            message: `The Gmail API needs to be enabled in your Google Cloud project (${projectId}). If you've already enabled it, please wait 5-10 minutes for the changes to fully propagate through Google's systems. You can verify the API is enabled at ${consoleUrl}`
          });
        }
        
        // Handle other API errors with appropriate messages
        return res.status(400).json({
          error: 'Gmail API error',
          message: apiError.message || 'An error occurred while communicating with the Gmail API'
        });
      }
      
      // Check if we successfully got messageIds
      if (!messageIds.length) {
        return res.json({ messageCount: 0, message: 'No messages found to sync.' });
      }
      
      // Get existing messages in one query to avoid querying multiple times
      const existingMessages = await storage.getGmailMessagesForUser(req.user!.id, {});
      const existingMessageIds = new Set(existingMessages.map(m => m.messageId));
      
      // Filter to only process new messages
      const newMessageIds = messageIds.filter((id: string) => !existingMessageIds.has(id));
      
      console.log(`Found ${newMessageIds.length} new messages to sync for user:`, req.user!.id);
      
      const syncedMessages = [];
      
      // Process each new message
      for (const messageId of newMessageIds) {
        try {
          console.log(`Processing message ${messageId} for user:`, req.user!.id);
          
          // Fetch full message details
          const messageDetails = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
          });
          
          const payload = messageDetails.data.payload;
          if (!payload) {
            console.log(`No payload found for message ${messageId}`);
            continue;
          }
          
          // Extract headers
          const headers = payload.headers || [];
          const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from');
          const toHeader = headers.find((h: any) => h.name?.toLowerCase() === 'to');
          const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject');
          const dateHeader = headers.find((h: any) => h.name?.toLowerCase() === 'date');
          
          // Extract message body
          let body = '';
          if (payload.body?.data) {
            // Base64 encoded body
            body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
          } else if (payload.parts) {
            // Multipart message
            for (const part of payload.parts) {
              if (part.mimeType === 'text/plain' && part.body?.data) {
                body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                break;
              }
            }
          }
          
          // Determine labels
          const labels = messageDetails.data.labelIds || [];
          const isRead = !labels.includes('UNREAD');
          const isImportant = labels.includes('IMPORTANT');
          
          // Create message in database
          const newMessage = await storage.saveGmailMessage({
            userId: req.user!.id,
            messageId: messageId,
            threadId: messageDetails.data.threadId || '',
            from: fromHeader?.value || 'Unknown',
            to: toHeader?.value || 'Unknown',
            subject: subjectHeader?.value || '',
            snippet: messageDetails.data.snippet || '',
            body,
            receivedAt: dateHeader?.value ? new Date(dateHeader.value) : new Date(),
            isRead,
            isImportant,
            labels
          });
          
          syncedMessages.push(newMessage);
        } catch (messageError) {
          console.error(`Error processing message ${messageId}:`, messageError);
          // Continue with the next message even if one fails
          continue;
        }
      }
      
      console.log(`Successfully synced ${syncedMessages.length} messages for user:`, req.user!.id);
      res.json({ messageCount: syncedMessages.length, message: `Successfully synced ${syncedMessages.length} messages` });
    } catch (error: any) {
      console.error('Error syncing Gmail messages:', error);
      
      // Provide a more helpful error message
      let errorMessage = 'Failed to sync Gmail messages';
      
      if (error.message) {
        // Check if this is a common error
        if (error.message.includes('Gmail API has not been used')) {
          errorMessage = 'Gmail API not enabled. Please enable it in your Google Cloud Console.';
        } else if (error.message.includes('invalid_grant')) {
          errorMessage = 'Your Gmail authorization has expired. Please reconnect your Gmail account.';
        } else if (error.message.includes('Rate Limit Exceeded')) {
          errorMessage = 'Gmail API rate limit exceeded. Please try again later.';
        } else {
          // Include a generic version of the error message
          errorMessage = `Failed to sync Gmail messages: ${error.message}`;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: error.message || 'Unknown error'
      });
    }
  });
}