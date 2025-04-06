import express from 'express';
import { storage } from './storage';
import { insertInternalMessageSchema } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

export function setupInternalMessagesRoutes(app: express.Express) {
  // Get internal messages for the authenticated user (both sent and received)
  app.get('/api/internal-messages', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = req.user!.id;
      const type = req.query.type as string;
      const search = req.query.search as string;

      const messages = await storage.getInternalMessagesForUser(userId, {
        type: type === 'sent' ? 'sent' : 'inbox',
        search
      });

      res.json(messages);
    } catch (error) {
      console.error('Error fetching internal messages:', error);
      res.status(500).json({ error: 'Failed to fetch internal messages' });
    }
  });

  // Send a new internal message
  app.post('/api/internal-messages', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const senderId = req.user!.id;
      const senderName = req.user!.username;

      // Validate the request body
      const result = insertInternalMessageSchema.safeParse({
        ...req.body,
        senderId,
        senderName
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error.message });
      }

      // Get recipient name
      const recipient = await storage.getUser(req.body.recipientId);
      if (!recipient) {
        return res.status(400).json({ error: 'Recipient not found' });
      }

      // Create the message
      const message = await storage.createInternalMessage({
        ...result.data,
        recipientName: recipient.username
      });

      res.status(201).json(message);
    } catch (error) {
      console.error('Error sending internal message:', error);
      res.status(500).json({ error: 'Failed to send internal message' });
    }
  });

  // Mark a message as read
  app.patch('/api/internal-messages/:id/read', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const messageId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Check if the message exists and belongs to the user
      const message = await storage.getInternalMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      if (message.recipientId !== userId) {
        return res.status(403).json({ error: 'You are not authorized to mark this message as read' });
      }

      // Update the message
      const updatedMessage = await storage.updateInternalMessage(messageId, { isRead: true });
      res.json(updatedMessage);
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({ error: 'Failed to mark message as read' });
    }
  });

  // Get a specific message by ID
  app.get('/api/internal-messages/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const messageId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Check if the message exists and belongs to the user
      const message = await storage.getInternalMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      if (message.senderId !== userId && message.recipientId !== userId) {
        return res.status(403).json({ error: 'You are not authorized to view this message' });
      }

      res.json(message);
    } catch (error) {
      console.error('Error fetching internal message:', error);
      res.status(500).json({ error: 'Failed to fetch internal message' });
    }
  });

  // Delete a message
  app.delete('/api/internal-messages/:id', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const messageId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Check if the message exists and belongs to the user
      const message = await storage.getInternalMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      if (message.senderId !== userId && message.recipientId !== userId) {
        return res.status(403).json({ error: 'You are not authorized to delete this message' });
      }

      await storage.deleteInternalMessage(messageId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting internal message:', error);
      res.status(500).json({ error: 'Failed to delete internal message' });
    }
  });
}