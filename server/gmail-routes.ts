import express, { Request, Response } from 'express';
import { getAuthUrl, getTokens, setCredentials, getGmailClient, getOAuth2Client } from './google-oauth';
import { storage } from './storage';

export function setupGmailRoutes(app: express.Express) {
  // Get the Google OAuth URL for user to authenticate
  app.get('/api/gmail/auth-url', (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const url = getAuthUrl();
      return res.json({ url });
    } catch (error) {
      console.error('Error generating Google auth URL:', error);
      return res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  // Handle the OAuth callback from Google
  app.get('/auth/google/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    
    if (!code) {
      return res.redirect('/settings?error=Missing_authorization_code');
    }
    
    if (!req.isAuthenticated()) {
      return res.redirect('/auth?error=Not_logged_in');
    }
    
    try {
      // Exchange the code for tokens
      const tokens = await getTokens(code);
      
      // Save the tokens to the database
      await storage.saveGmailToken({
        userId: req.user!.id,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
      });
      
      // Redirect to settings page with success message
      return res.redirect('/settings?success=Gmail_connected');
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      return res.redirect('/settings?error=Failed_to_connect_Gmail');
    }
  });

  // Disconnect Gmail account
  app.post('/api/gmail/disconnect', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      await storage.deleteGmailToken(req.user!.id);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting Gmail:', error);
      return res.status(500).json({ error: 'Failed to disconnect Gmail account' });
    }
  });

  // Get Gmail account status
  app.get('/api/gmail/status', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const token = await storage.getGmailToken(req.user!.id);
      
      if (!token) {
        return res.json({ connected: false });
      }
      
      // Check if token is still valid
      const isTokenValid = token.tokenExpiry ? new Date(token.tokenExpiry) > new Date() : false;
      
      return res.json({ 
        connected: true,
        tokenValid: isTokenValid,
        connectedSince: token.createdAt
      });
    } catch (error) {
      console.error('Error checking Gmail status:', error);
      return res.status(500).json({ error: 'Failed to check Gmail connection status' });
    }
  });

  // Get Gmail messages
  app.get('/api/gmail/messages', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      // Parse query parameters
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
      
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }
      
      const messages = await storage.getGmailMessagesForUser(req.user!.id, filters);
      return res.json(messages);
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      return res.status(500).json({ error: 'Failed to fetch Gmail messages' });
    }
  });

  // Mark a Gmail message as read
  app.patch('/api/gmail/messages/:id/read', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const messageId = parseInt(req.params.id);
      const message = await storage.getGmailMessage(messageId);
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      if (message.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to access this message' });
      }
      
      const updatedMessage = await storage.updateGmailMessage(messageId, { isRead: true });
      return res.json(updatedMessage);
    } catch (error) {
      console.error('Error marking message as read:', error);
      return res.status(500).json({ error: 'Failed to mark message as read' });
    }
  });

  // Mark a Gmail message as important
  app.patch('/api/gmail/messages/:id/important', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const messageId = parseInt(req.params.id);
      const message = await storage.getGmailMessage(messageId);
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      if (message.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to access this message' });
      }
      
      const updatedMessage = await storage.updateGmailMessage(messageId, {
        isImportant: req.body.important === true
      });
      
      return res.json(updatedMessage);
    } catch (error) {
      console.error('Error updating message importance:', error);
      return res.status(500).json({ error: 'Failed to update message importance' });
    }
  });

  // Get Gmail settings
  app.get('/api/gmail/settings', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const settings = await storage.getGmailSettings(req.user!.id);
      
      if (!settings) {
        // Create default settings if none exist
        const defaultSettings = {
          userId: req.user!.id,
          autoSyncEnabled: true,
          syncFrequencyMinutes: 30,
          autoForwardRules: []
        };
        
        const newSettings = await storage.saveGmailSettings(defaultSettings);
        return res.json(newSettings);
      }
      
      return res.json(settings);
    } catch (error) {
      console.error('Error fetching Gmail settings:', error);
      return res.status(500).json({ error: 'Failed to fetch Gmail settings' });
    }
  });

  // Update Gmail settings
  app.patch('/api/gmail/settings', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      // Validate the request body
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
      
      // Check if settings exist
      let settings = await storage.getGmailSettings(req.user!.id);
      
      if (!settings) {
        // Create default settings if none exist
        const defaultSettings = {
          userId: req.user!.id,
          ...updateData
        };
        
        settings = await storage.saveGmailSettings(defaultSettings);
      } else {
        // Update existing settings
        settings = await storage.updateGmailSettings(req.user!.id, updateData);
      }
      
      return res.json(settings);
    } catch (error) {
      console.error('Error updating Gmail settings:', error);
      return res.status(500).json({ error: 'Failed to update Gmail settings' });
    }
  });

  // Sync Gmail messages (manual trigger)
  app.post('/api/gmail/sync', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const token = await storage.getGmailToken(req.user!.id);
      
      if (!token) {
        return res.status(400).json({ error: 'Gmail not connected' });
      }
      
      // Set credentials for the OAuth client
      setCredentials({
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expiry_date: token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : undefined
      });
      
      // Create Gmail client
      const gmail = getGmailClient();
      
      // Fetch messages from Gmail API
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 50,
        q: 'is:thermopac'  // Filter for THERMOPAC business emails
      });
      
      const messages = response.data.messages || [];
      const syncedMessages = [];
      
      // Process each message
      for (const message of messages) {
        // Get full message details
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!
        });
        
        // Extract headers
        const headers = fullMessage.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value;
        
        // Extract snippet and body
        const snippet = fullMessage.data.snippet || '';
        let body = '';
        
        // Get body from message parts recursively
        if (fullMessage.data.payload?.body?.data) {
          body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
        } else if (fullMessage.data.payload?.parts) {
          // Find the text part
          const textPart = fullMessage.data.payload.parts.find(
            part => part.mimeType === 'text/plain' || part.mimeType === 'text/html'
          );
          
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }
        
        // Extract labels
        const labels = fullMessage.data.labelIds || [];
        
        // Save the message to the database
        const savedMessage = await storage.saveGmailMessage({
          userId: req.user!.id,
          messageId: message.id!,
          threadId: message.threadId!,
          from,
          to,
          subject,
          snippet,
          body,
          receivedAt: date ? new Date(date) : undefined,
          isRead: labels.includes('UNREAD') ? false : true,
          isImportant: labels.includes('IMPORTANT') ? true : false,
          labels
        });
        
        syncedMessages.push(savedMessage);
      }
      
      return res.json({
        success: true,
        messageCount: syncedMessages.length,
        messages: syncedMessages
      });
    } catch (error) {
      console.error('Error syncing Gmail messages:', error);
      return res.status(500).json({ error: 'Failed to sync Gmail messages' });
    }
  });
}