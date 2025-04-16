import { Request, Response, Router } from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import multer from 'multer';
import { storage } from './storage';
import { db } from './db';
import * as schema from '../shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

// Temp storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Auth middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'You must be logged in to access this resource' });
}

// Create OAuth2 Client for Gmail API
function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing required environment variables for Google OAuth');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Interface for email data
interface EmailData {
  id: string;
  threadId?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml: boolean;
  date: string;
  read: boolean;
  starred: boolean;
  labels?: string[];
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
  snippet?: string;
  isExternal: boolean;
}

export function setupEmailRoutes(app: Router) {
  /**
   * Get user's Gmail tokens
   */
  app.get('/api/emails/auth-status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if we have a token for this user in the database
      const userId = req.user!.id;
      
      const tokens = await db.select()
        .from(schema.gmailTokens)
        .where(eq(schema.gmailTokens.userId, userId));
      
      if (tokens && tokens.length > 0) {
        res.json({ authenticated: true });
      } else {
        res.json({ authenticated: false });
      }
    } catch (error) {
      console.error('Error checking Gmail auth status:', error);
      res.status(500).json({ error: 'Failed to check authentication status' });
    }
  });

  /**
   * Start Gmail authentication flow
   */
  app.get('/api/emails/auth', ensureAuthenticated, (req: Request, res: Response) => {
    try {
      const oauth2Client = getOAuth2Client();
      
      // Generate authentication URL with required scopes
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly', // Read-only access to Gmail
        'https://www.googleapis.com/auth/gmail.send',     // Send emails
        'https://www.googleapis.com/auth/gmail.modify',   // Modify email (for marking as read/unread)
      ];
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',  // Get refresh token
        scope: scopes,
        // State param to identify the user when they return from authorization
        state: req.user!.id.toString(),  
      });
      
      res.json({ authUrl });
    } catch (error) {
      console.error('Error starting Gmail authentication:', error);
      res.status(500).json({ error: 'Failed to start authentication' });
    }
  });

  /**
   * Handle Gmail OAuth callback
   */
  app.get('/auth/google/callback', async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).send('Missing code or state parameter');
      }
      
      // State should contain the user ID
      const userId = parseInt(state as string);
      
      // Exchange code for tokens
      const oauth2Client = getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Store tokens in database
      await db.insert(schema.gmailTokens)
        .values({
          userId,
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        })
        .onConflictDoUpdate({
          target: schema.gmailTokens.userId,
          set: {
            accessToken: tokens.access_token!,
            refreshToken: tokens.refresh_token || db.sql`${schema.gmailTokens.refreshToken}`,
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          }
        });
      
      // Redirect to email manager page
      res.redirect('/emails');
    } catch (error) {
      console.error('Error handling Google OAuth callback:', error);
      res.status(500).send('Authentication failed');
    }
  });

  /**
   * Get emails from Gmail
   */
  app.get('/api/emails', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const folder = req.query.folder as string || 'inbox';
      const query = req.query.query as string || '';
      const maxResults = parseInt(req.query.max as string || '50');
      
      // Get the user's Gmail token
      const tokenRecord = await db.select()
        .from(schema.gmailTokens)
        .where(eq(schema.gmailTokens.userId, userId))
        .limit(1);
      
      if (!tokenRecord || tokenRecord.length === 0) {
        return res.status(401).json({ error: 'Gmail authorization required', requiresAuth: true });
      }
      
      const token = tokenRecord[0];
      
      // Setup OAuth2 client with the stored token
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expiry_date: token.expiryDate?.getTime() || undefined,
      });
      
      // Create Gmail client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Determine Gmail query based on folder
      let gmailQuery = '';
      switch (folder) {
        case 'inbox':
          gmailQuery = 'in:inbox';
          break;
        case 'sent':
          gmailQuery = 'in:sent';
          break;
        case 'starred':
          gmailQuery = 'is:starred';
          break;
        case 'trash':
          gmailQuery = 'in:trash';
          break;
        default:
          gmailQuery = 'in:inbox';
      }
      
      // Add search query if provided
      if (query) {
        gmailQuery += ` ${query}`;
      }
      
      // List messages
      const messageList = await gmail.users.messages.list({
        userId: 'me',
        q: gmailQuery,
        maxResults,
      });
      
      if (!messageList.data.messages || messageList.data.messages.length === 0) {
        return res.json([]);
      }
      
      // Get full message details
      const emails: EmailData[] = [];
      
      for (const message of messageList.data.messages) {
        const messageDetail = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full',
        });
        
        if (!messageDetail.data || !messageDetail.data.payload) continue;
        
        // Process headers
        const headers = messageDetail.data.payload.headers || [];
        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
        const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        
        // Parse 'to' field
        const toHeader = headers.find(h => h.name?.toLowerCase() === 'to')?.value || '';
        const to = toHeader.split(',').map(email => email.trim());
        
        // Parse 'cc' field
        const ccHeader = headers.find(h => h.name?.toLowerCase() === 'cc')?.value || '';
        const cc = ccHeader ? ccHeader.split(',').map(email => email.trim()) : [];
        
        // Check if message has attachments
        const attachments = [];
        const parts = messageDetail.data.payload.parts || [];
        
        for (const part of parts) {
          if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
            attachments.push({
              id: part.body.attachmentId,
              filename: part.filename,
              contentType: part.mimeType || 'application/octet-stream',
              size: parseInt(part.body.size || '0'),
            });
          }
        }
        
        // Extract body
        let body = '';
        let isHtml = false;
        
        if (messageDetail.data.payload.mimeType === 'text/plain') {
          body = Buffer.from(messageDetail.data.payload.body?.data || '', 'base64').toString();
        } else if (messageDetail.data.payload.mimeType === 'text/html') {
          body = Buffer.from(messageDetail.data.payload.body?.data || '', 'base64').toString();
          isHtml = true;
        } else if (messageDetail.data.payload.parts) {
          // Look for text/plain or text/html parts
          const textPart = messageDetail.data.payload.parts.find(part => part.mimeType === 'text/plain');
          const htmlPart = messageDetail.data.payload.parts.find(part => part.mimeType === 'text/html');
          
          // Prefer HTML if available
          if (htmlPart && htmlPart.body?.data) {
            body = Buffer.from(htmlPart.body.data, 'base64').toString();
            isHtml = true;
          } else if (textPart && textPart.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString();
          }
        }
        
        // Determine if email is external
        const isExternal = !from.includes('@thermopac.in');
        
        // Convert Gmail date to ISO format
        const date = new Date(parseInt(messageDetail.data.internalDate || '0')).toISOString();
        
        emails.push({
          id: messageDetail.data.id!,
          threadId: messageDetail.data.threadId,
          from,
          to,
          cc: cc.length > 0 ? cc : undefined,
          subject,
          body,
          isHtml,
          date,
          read: !messageDetail.data.labelIds?.includes('UNREAD'),
          starred: messageDetail.data.labelIds?.includes('STARRED') || false,
          labels: messageDetail.data.labelIds,
          attachments: attachments.length > 0 ? attachments : undefined,
          snippet: messageDetail.data.snippet,
          isExternal,
        });
      }
      
      // Sort emails by date (newest first)
      emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      res.json(emails);
    } catch (error: any) {
      console.error('Error fetching emails:', error);
      
      // Handle token expiry
      if (error.code === 401) {
        return res.status(401).json({ error: 'Gmail authorization expired', requiresReauth: true });
      }
      
      res.status(500).json({ error: 'Failed to fetch emails' });
    }
  });

  /**
   * Send an email
   */
  app.post('/api/emails/send', ensureAuthenticated, upload.array('attachments'), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { to, cc, bcc, subject, body } = req.body;
      const attachments = req.files as Express.Multer.File[];
      
      if (!to || !subject || !body) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Get the user's Gmail token
      const tokenRecord = await db.select()
        .from(schema.gmailTokens)
        .where(eq(schema.gmailTokens.userId, userId))
        .limit(1);
      
      if (!tokenRecord || tokenRecord.length === 0) {
        return res.status(401).json({ error: 'Gmail authorization required', requiresAuth: true });
      }
      
      const token = tokenRecord[0];
      
      // Setup OAuth2 client with the stored token
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expiry_date: token.expiryDate?.getTime() || undefined,
      });
      
      // Create Gmail client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Get user info for from address
      const user = req.user!;
      const fromEmail = user.email;
      const fromName = user.username;
      
      // Create email headers
      let emailContent = [
        `From: ${fromName} <${fromEmail}>`,
        `To: ${to}`,
        subject ? `Subject: ${subject}` : '',
        cc ? `Cc: ${cc}` : '',
        bcc ? `Bcc: ${bcc}` : '',
        'MIME-Version: 1.0',
      ];
      
      // If there are attachments, set up as multipart message
      if (attachments && attachments.length > 0) {
        const boundary = 'thermopac_boundary_' + Date.now().toString();
        emailContent.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        emailContent.push('');
        
        // Add the text part
        emailContent.push(`--${boundary}`);
        emailContent.push('Content-Type: text/plain; charset=UTF-8');
        emailContent.push('');
        emailContent.push(body);
        
        // Add each attachment
        for (const attachment of attachments) {
          emailContent.push(`--${boundary}`);
          emailContent.push(`Content-Type: ${attachment.mimetype || 'application/octet-stream'}`);
          emailContent.push('Content-Transfer-Encoding: base64');
          emailContent.push(`Content-Disposition: attachment; filename="${attachment.originalname}"`);
          emailContent.push('');
          
          // Convert file to base64
          const base64Data = attachment.buffer.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
          
          emailContent.push(base64Data);
        }
        
        emailContent.push(`--${boundary}--`);
      } else {
        // Simple text email without attachments
        emailContent.push('Content-Type: text/plain; charset=UTF-8');
        emailContent.push('');
        emailContent.push(body);
      }
      
      // Join all parts with proper line endings
      const email = emailContent.join('\r\n');
      
      // Encode the email
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      
      // Send the email
      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
        },
      });
      
      res.json({ success: true, messageId: result.data.id });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });

  /**
   * Mark an email as read/unread
   */
  app.patch('/api/emails/:id/read', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id;
      const markAsUnread = req.body.unread === true;
      
      // Get the user's Gmail token
      const tokenRecord = await db.select()
        .from(schema.gmailTokens)
        .where(eq(schema.gmailTokens.userId, userId))
        .limit(1);
      
      if (!tokenRecord || tokenRecord.length === 0) {
        return res.status(401).json({ error: 'Gmail authorization required', requiresAuth: true });
      }
      
      const token = tokenRecord[0];
      
      // Setup OAuth2 client with the stored token
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expiry_date: token.expiryDate?.getTime() || undefined,
      });
      
      // Create Gmail client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Modify the message labels
      const result = await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: markAsUnread ? ['UNREAD'] : [],
          removeLabelIds: markAsUnread ? [] : ['UNREAD'],
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking email as read/unread:', error);
      res.status(500).json({ error: 'Failed to update email' });
    }
  });

  /**
   * Star/unstar an email
   */
  app.patch('/api/emails/:id/star', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id;
      const starred = req.body.starred === true;
      
      // Get the user's Gmail token
      const tokenRecord = await db.select()
        .from(schema.gmailTokens)
        .where(eq(schema.gmailTokens.userId, userId))
        .limit(1);
      
      if (!tokenRecord || tokenRecord.length === 0) {
        return res.status(401).json({ error: 'Gmail authorization required', requiresAuth: true });
      }
      
      const token = tokenRecord[0];
      
      // Setup OAuth2 client with the stored token
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expiry_date: token.expiryDate?.getTime() || undefined,
      });
      
      // Create Gmail client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Modify the message labels
      const result = await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: starred ? ['STARRED'] : [],
          removeLabelIds: starred ? [] : ['STARRED'],
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating starred status:', error);
      res.status(500).json({ error: 'Failed to update email' });
    }
  });

  /**
   * Get attachment from an email
   */
  app.get('/api/emails/:id/attachments/:attachmentId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id;
      const attachmentId = req.params.attachmentId;
      
      // Get the user's Gmail token
      const tokenRecord = await db.select()
        .from(schema.gmailTokens)
        .where(eq(schema.gmailTokens.userId, userId))
        .limit(1);
      
      if (!tokenRecord || tokenRecord.length === 0) {
        return res.status(401).json({ error: 'Gmail authorization required', requiresAuth: true });
      }
      
      const token = tokenRecord[0];
      
      // Setup OAuth2 client with the stored token
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: token.accessToken,
        refresh_token: token.refreshToken || undefined,
        expiry_date: token.expiryDate?.getTime() || undefined,
      });
      
      // Create Gmail client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Get attachment
      const attachment = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: emailId,
        id: attachmentId,
      });
      
      if (!attachment.data.data) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      
      // Decode attachment
      const data = Buffer.from(attachment.data.data, 'base64');
      
      // Get attachment name and content type
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
      });
      
      const parts = message.data.payload?.parts || [];
      const attachmentPart = parts.find(part => part.body?.attachmentId === attachmentId);
      
      if (!attachmentPart) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      
      const filename = attachmentPart.filename || 'attachment';
      const contentType = attachmentPart.mimeType || 'application/octet-stream';
      
      // Set appropriate headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.send(data);
    } catch (error) {
      console.error('Error fetching attachment:', error);
      res.status(500).json({ error: 'Failed to fetch attachment' });
    }
  });
  
  return app;
}