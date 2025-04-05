import express, { Request, Response } from 'express';
import { storage } from './storage';
import { getGmailClient } from './google-auth';
import { gmail_v1 } from 'googleapis';
// Import getAuthUrl from google-oauth.ts instead of google-auth.ts
import { getAuthUrl } from './google-oauth';

export function setupGmailRoutes(app: express.Express) {
  // Get Gmail auth URL for connecting account
  app.get('/api/gmail/auth-url', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      const authUrl = getAuthUrl();
      res.json({ url: authUrl });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
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
      const token = await storage.getGmailToken(req.user!.id);
      if (!token) {
        return res.status(400).json({ error: 'Gmail not connected. Please connect your Gmail account first.' });
      }
      
      const gmail = await getGmailClient(req.user!.id);
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 20, // Limit to 20 messages for manual sync
      });
      
      const messages = response.data.messages || [];
      const syncedMessages = [];
      
      // Process each message
      for (const message of messages) {
        const messageId = message.id;
        if (!messageId) continue;
        
        // Check if message already exists in database
        const existingMessages = await storage.getGmailMessagesForUser(req.user!.id, {});
        const messageExists = existingMessages.some(m => m.messageId === messageId);
        
        if (!messageExists) {
          // Fetch full message details
          const messageDetails = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
          });
          
          const payload = messageDetails.data.payload;
          if (!payload) continue;
          
          // Extract headers
          const headers = payload.headers || [];
          const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from');
          const toHeader = headers.find(h => h.name?.toLowerCase() === 'to');
          const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
          const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date');
          
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
        }
      }
      
      res.json({ synced: syncedMessages.length, messages: syncedMessages });
    } catch (error) {
      console.error('Error syncing Gmail messages:', error);
      res.status(500).json({ error: 'Failed to sync Gmail messages' });
    }
  });
}