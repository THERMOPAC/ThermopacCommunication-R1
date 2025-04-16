import { Request, Response, Router } from 'express';
import { db } from './db';
import * as schema from '../shared/schema';
import { eq, and, or, desc, asc, sql } from 'drizzle-orm';

// Auth middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'You must be logged in to access this resource' });
}

export function setupMessageRoutes(app: Router) {
  /**
   * Get all messages for the current user
   */
  app.get('/api/messages', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const query = req.query.query as string || '';
      
      // Fetch messages where current user is either sender or recipient
      let messagesQuery = db.select({
        message: schema.messages,
        sender: schema.users,
        recipient: schema.users.as('recipient')
      })
        .from(schema.messages)
        .leftJoin(schema.users, eq(schema.messages.senderId, schema.users.id))
        .leftJoin(schema.users.as('recipient'), eq(schema.messages.recipientId, schema.users.as('recipient').id))
        .where(
          or(
            eq(schema.messages.senderId, userId),
            eq(schema.messages.recipientId, userId)
          )
        )
        .orderBy(desc(schema.messages.createdAt));
      
      // Add search filter if query is provided
      if (query) {
        messagesQuery = messagesQuery.where(
          or(
            sql`lower(${schema.messages.subject}) like ${`%${query.toLowerCase()}%`}`,
            sql`lower(${schema.messages.content}) like ${`%${query.toLowerCase()}%`}`
          )
        );
      }
      
      const messages = await messagesQuery;
      
      // Map results to a cleaner structure for the client
      const formattedMessages = messages.map(record => ({
        id: record.message.id,
        subject: record.message.subject,
        content: record.message.content,
        createdAt: record.message.createdAt.toISOString(),
        read: record.message.read,
        sender: {
          id: record.sender.id,
          username: record.sender.username,
          email: record.sender.email
        },
        recipient: record.recipient ? {
          id: record.recipient.id,
          username: record.recipient.username,
          email: record.recipient.email
        } : null,
        // Determine if the current user is the sender
        isSender: record.message.senderId === userId,
        // Determine if this is unread for the current user
        isUnread: record.message.recipientId === userId && !record.message.read
      }));
      
      res.json(formattedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  /**
   * Get a specific message
   */
  app.get('/api/messages/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageId = parseInt(req.params.id);
      
      // Fetch message with sender and recipient info
      const [message] = await db.select({
        message: schema.messages,
        sender: schema.users,
        recipient: schema.users.as('recipient')
      })
        .from(schema.messages)
        .leftJoin(schema.users, eq(schema.messages.senderId, schema.users.id))
        .leftJoin(schema.users.as('recipient'), eq(schema.messages.recipientId, schema.users.as('recipient').id))
        .where(
          and(
            eq(schema.messages.id, messageId),
            or(
              eq(schema.messages.senderId, userId),
              eq(schema.messages.recipientId, userId)
            )
          )
        );
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      // Mark message as read if current user is the recipient and message is unread
      if (message.message.recipientId === userId && !message.message.read) {
        await db.update(schema.messages)
          .set({ read: true })
          .where(eq(schema.messages.id, messageId));
      }
      
      // Format response
      const formattedMessage = {
        id: message.message.id,
        subject: message.message.subject,
        content: message.message.content,
        createdAt: message.message.createdAt.toISOString(),
        read: message.message.read || message.message.recipientId === userId, // Mark as read in the response
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          email: message.sender.email
        },
        recipient: message.recipient ? {
          id: message.recipient.id,
          username: message.recipient.username,
          email: message.recipient.email
        } : null,
        isSender: message.message.senderId === userId
      };
      
      res.json(formattedMessage);
    } catch (error) {
      console.error('Error fetching message:', error);
      res.status(500).json({ error: 'Failed to fetch message' });
    }
  });

  /**
   * Send a new message
   */
  app.post('/api/messages', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const senderId = req.user!.id;
      const { recipientId, subject, content } = req.body;
      
      if (!recipientId || !subject || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify recipient exists
      const [recipient] = await db.select()
        .from(schema.users)
        .where(eq(schema.users.id, recipientId));
      
      if (!recipient) {
        return res.status(404).json({ error: 'Recipient not found' });
      }
      
      // Create new message
      const [message] = await db.insert(schema.messages)
        .values({
          senderId,
          recipientId,
          subject,
          content,
          read: false,
          createdAt: new Date()
        })
        .returning();
      
      // Return created message
      res.status(201).json({
        id: message.id,
        subject: message.subject,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        read: message.read,
        senderId,
        recipientId
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  /**
   * Mark a message as read
   */
  app.patch('/api/messages/:id/read', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageId = parseInt(req.params.id);
      
      // Verify message belongs to current user
      const [message] = await db.select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.id, messageId),
            eq(schema.messages.recipientId, userId)
          )
        );
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found or you do not have permission to access it' });
      }
      
      // Update read status
      await db.update(schema.messages)
        .set({ read: true })
        .where(eq(schema.messages.id, messageId));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({ error: 'Failed to update message' });
    }
  });

  /**
   * Delete a message
   */
  app.delete('/api/messages/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const messageId = parseInt(req.params.id);
      
      // Verify message belongs to current user (either as sender or recipient)
      const [message] = await db.select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.id, messageId),
            or(
              eq(schema.messages.senderId, userId),
              eq(schema.messages.recipientId, userId)
            )
          )
        );
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found or you do not have permission to delete it' });
      }
      
      // Delete the message
      await db.delete(schema.messages)
        .where(eq(schema.messages.id, messageId));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });
  
  return app;
}