import { OAuth2Client } from 'google-auth-library';
import { google, calendar_v3 } from 'googleapis';
import { db } from './db';
import { users, businessMeetings, googleCalendarSyncLog } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Google Calendar OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// Use the authorized redirect URI from environment
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://thermopac-communication-thermopacllp.replit.app/api/auth/google/callback';

// Scopes required for Google Calendar and Meet access
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email'
];

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate Google OAuth URL for calendar authorization
   */
  generateAuthUrl(customState?: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: CALENDAR_SCOPES,
      prompt: 'consent', // Force consent to get refresh token
      state: customState || 'service=calendar' // Add state parameter to identify this as calendar OAuth
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Save user's Google Calendar tokens to database
   */
  async saveUserTokens(userId: number, tokens: any) {
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    
    await db
      .update(users)
      .set({
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiresAt: expiresAt,
        googleCalendarConnected: true,
        googleCalendarSyncEnabled: true
      })
      .where(eq(users.id, userId));
  }

  /**
   * Refresh access token if expired
   */
  async refreshTokenIfNeeded(userId: number): Promise<boolean> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.googleRefreshToken) {
        console.log(`No refresh token found for user ${userId}`);
        return false;
      }

      // Check if token is expired (with 5 minute buffer)
      const now = new Date();
      const expiresAt = user.googleTokenExpiresAt;
      const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (expiresAt && now.getTime() > (expiresAt.getTime() - bufferTime)) {
        console.log(`Token expired for user ${userId}, refreshing...`);
        
        this.oauth2Client.setCredentials({
          refresh_token: user.googleRefreshToken
        });

        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update tokens in database
        await this.saveUserTokens(userId, credentials);
        console.log(`Successfully refreshed token for user ${userId}`);
        return true;
      }

      return true; // Token is still valid
    } catch (error) {
      console.error(`Error refreshing token for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get authenticated calendar client for user
   */
  async getCalendarClient(userId: number): Promise<calendar_v3.Calendar | null> {
    try {
      // Refresh token if needed
      const tokenValid = await this.refreshTokenIfNeeded(userId);
      if (!tokenValid) {
        return null;
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.googleAccessToken || !user.googleCalendarConnected) {
        return null;
      }

      // Set up OAuth client with user's tokens
      this.oauth2Client.setCredentials({
        access_token: user.googleAccessToken,
        refresh_token: user.googleRefreshToken
      });

      return google.calendar({ version: 'v3', auth: this.oauth2Client });
    } catch (error) {
      console.error(`Failed to get calendar client for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Fetch upcoming Google Calendar events with Google Meet links
   */
  async fetchUpcomingEvents(userId: number, maxResults: number = 25): Promise<any[]> {
    try {
      const calendar = await this.getCalendarClient(userId);
      if (!calendar) {
        throw new Error('Google Calendar not connected for user');
      }

      // Get current time and 30 days from now
      const now = new Date();
      const maxTime = new Date();
      maxTime.setDate(now.getDate() + 30);

      console.log(`Fetching upcoming events for user ${userId} from ${now.toISOString()} to ${maxTime.toISOString()}`);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: maxTime.toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
        fields: 'items(id,summary,description,start,end,hangoutLink,creator,organizer,attendees,location,status,htmlLink)'
      });

      const events = response.data.items || [];
      console.log(`Retrieved ${events.length} total events from Google Calendar`);

      // Filter events that have Google Meet links (hangoutLink)
      const meetEvents = events.filter(event => event.hangoutLink);
      console.log(`Found ${meetEvents.length} events with Google Meet links`);

      // Transform events to our format
      const transformedEvents = meetEvents.map(event => ({
        id: event.id,
        summary: event.summary || 'Untitled Event',
        description: event.description || '',
        start: {
          dateTime: event.start?.dateTime,
          date: event.start?.date,
          timeZone: event.start?.timeZone
        },
        end: {
          dateTime: event.end?.dateTime,
          date: event.end?.date,
          timeZone: event.end?.timeZone
        },
        hangoutLink: event.hangoutLink,
        location: event.location,
        status: event.status,
        htmlLink: event.htmlLink,
        creator: {
          email: event.creator?.email,
          displayName: event.creator?.displayName
        },
        organizer: {
          email: event.organizer?.email,
          displayName: event.organizer?.displayName
        },
        attendees: event.attendees?.map(attendee => ({
          email: attendee.email,
          displayName: attendee.displayName,
          responseStatus: attendee.responseStatus
        })) || []
      }));

      console.log(`Successfully fetched and transformed ${transformedEvents.length} upcoming events with Google Meet links`);
      return transformedEvents;

    } catch (error) {
      console.error(`Error fetching upcoming events for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create Google Calendar event from meeting data
   */
  async createCalendarEvent(userId: number, meetingData: any): Promise<string | null> {
    try {
      const calendar = await this.getCalendarClient(userId);
      if (!calendar) {
        throw new Error('Google Calendar not connected for user');
      }

      // Get attendee emails from the database
      const attendeeEmails = await this.getAttendeeEmails(meetingData.attendeeIds, meetingData.externalAttendees);

      // Convert meeting date and times to ISO format
      const startDateTime = this.createDateTime(meetingData.meetingDate, meetingData.startTime, meetingData.timezone);
      const endDateTime = this.createDateTime(meetingData.meetingDate, meetingData.endTime, meetingData.timezone);

      const event: calendar_v3.Schema$Event = {
        summary: meetingData.title,
        description: this.formatEventDescription(meetingData),
        location: meetingData.location || meetingData.meetingUrl,
        start: {
          dateTime: startDateTime,
          timeZone: meetingData.timezone || 'Asia/Kolkata'
        },
        end: {
          dateTime: endDateTime,
          timeZone: meetingData.timezone || 'Asia/Kolkata'
        },
        attendees: attendeeEmails.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'popup', minutes: 10 }       // 10 minutes before
          ]
        },
        visibility: 'default',
        transparency: 'opaque',
        // Auto-generate Google Meet link
        conferenceData: meetingData.googleMeetEnabled !== false ? {
          createRequest: {
            requestId: `meet-${meetingData.id}-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        } : undefined
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        sendUpdates: 'all', // Send invitations to all attendees
        conferenceDataVersion: 1 // Required for conference data
      });

      // Extract Google Meet link if created
      const meetLink = response.data.conferenceData?.entryPoints?.find(
        entry => entry.entryPointType === 'video'
      )?.uri;

      // Update meeting with Google Meet link if available
      if (meetLink) {
        await db
          .update(businessMeetings)
          .set({ 
            googleMeetLink: meetLink,
            googleMeetUrl: meetLink  // Store in both fields for compatibility
          })
          .where(eq(businessMeetings.id, meetingData.id));
          
        console.log(`Meeting ${meetingData.id} updated with Google Meet link: ${meetLink}`);
      }

      // Log successful creation
      await this.logSyncOperation(meetingData.id, userId, 'create', response.data.id!, 'success');

      return response.data.id!;
    } catch (error) {
      console.error('Failed to create Google Calendar event:', error);
      
      // Log error
      await this.logSyncOperation(
        meetingData.id, 
        userId, 
        'create', 
        null, 
        'error', 
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      return null;
    }
  }

  /**
   * Update existing Google Calendar event
   */
  async updateCalendarEvent(userId: number, eventId: string, meetingData: any): Promise<boolean> {
    try {
      const calendar = await this.getCalendarClient(userId);
      if (!calendar) {
        throw new Error('Google Calendar not connected for user');
      }

      const attendeeEmails = await this.getAttendeeEmails(meetingData.attendeeIds, meetingData.externalAttendees);
      const startDateTime = this.createDateTime(meetingData.meetingDate, meetingData.startTime, meetingData.timezone);
      const endDateTime = this.createDateTime(meetingData.meetingDate, meetingData.endTime, meetingData.timezone);

      const event: calendar_v3.Schema$Event = {
        summary: meetingData.title,
        description: this.formatEventDescription(meetingData),
        location: meetingData.location || meetingData.meetingUrl,
        start: {
          dateTime: startDateTime,
          timeZone: meetingData.timezone || 'Asia/Kolkata'
        },
        end: {
          dateTime: endDateTime,
          timeZone: meetingData.timezone || 'Asia/Kolkata'
        },
        attendees: attendeeEmails.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 }
          ]
        },
        // Preserve or add Google Meet link
        conferenceData: meetingData.googleMeetEnabled !== false ? {
          createRequest: {
            requestId: `meet-${meetingData.id}-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        } : undefined
      };

      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: event,
        sendUpdates: 'all',
        conferenceDataVersion: 1
      });

      // Extract and update Google Meet link if available
      const meetLink = response.data.conferenceData?.entryPoints?.find(
        entry => entry.entryPointType === 'video'
      )?.uri;

      if (meetLink) {
        await db
          .update(businessMeetings)
          .set({ googleMeetLink: meetLink })
          .where(eq(businessMeetings.id, meetingData.id));
      }

      await this.logSyncOperation(meetingData.id, userId, 'update', eventId, 'success');
      return true;
    } catch (error) {
      console.error('Failed to update Google Calendar event:', error);
      await this.logSyncOperation(
        meetingData.id, 
        userId, 
        'update', 
        eventId, 
        'error', 
        error instanceof Error ? error.message : 'Unknown error'
      );
      return false;
    }
  }

  /**
   * Delete Google Calendar event
   */
  async deleteCalendarEvent(userId: number, eventId: string, meetingId: number): Promise<boolean> {
    try {
      const calendar = await this.getCalendarClient(userId);
      if (!calendar) {
        throw new Error('Google Calendar not connected for user');
      }

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendUpdates: 'all'
      });

      await this.logSyncOperation(meetingId, userId, 'delete', eventId, 'success');
      return true;
    } catch (error) {
      console.error('Failed to delete Google Calendar event:', error);
      await this.logSyncOperation(
        meetingId, 
        userId, 
        'delete', 
        eventId, 
        'error', 
        error instanceof Error ? error.message : 'Unknown error'
      );
      return false;
    }
  }

  /**
   * Disconnect user's Google Calendar
   */
  async disconnectCalendar(userId: number): Promise<boolean> {
    try {
      await db
        .update(users)
        .set({
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiresAt: null,
          googleCalendarConnected: false,
          googleCalendarSyncEnabled: false,
          googleEmail: null
        })
        .where(eq(users.id, userId));

      return true;
    } catch (error) {
      console.error('Failed to disconnect Google Calendar:', error);
      return false;
    }
  }

  /**
   * Get attendee email addresses from user IDs and external attendees
   */
  private async getAttendeeEmails(attendeeIds: number[], externalAttendees: any[]): Promise<string[]> {
    const emails: string[] = [];

    // Get internal attendee emails
    if (attendeeIds && attendeeIds.length > 0) {
      const attendees = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, attendeeIds[0])); // Simple query for first attendee

      emails.push(...attendees.map(a => a.email));
    }

    // Add external attendee emails
    if (externalAttendees && externalAttendees.length > 0) {
      emails.push(...externalAttendees.map((attendee: any) => attendee.email));
    }

    return emails.filter(email => email && email.includes('@'));
  }

  /**
   * Create ISO datetime string from date and time
   */
  private createDateTime(date: string, time: string, timezone: string): string {
    const dateStr = new Date(date).toISOString().split('T')[0];
    return `${dateStr}T${time}`;
  }

  /**
   * Format meeting description for calendar event
   */
  private formatEventDescription(meetingData: any): string {
    let description = '';
    
    if (meetingData.description) {
      description += `${meetingData.description}\n\n`;
    }

    if (meetingData.agenda) {
      description += `Agenda:\n${meetingData.agenda}\n\n`;
    }

    if (meetingData.meetingUrl) {
      description += `Meeting Link: ${meetingData.meetingUrl}\n`;
    }

    description += `Meeting Type: ${meetingData.meetingType}\n`;
    description += `Priority: ${meetingData.priority}\n`;

    return description.trim();
  }

  /**
   * Generate Google Meet link for a meeting by creating a real calendar event
   */
  async generateMeetLink(meetingData: any, userId: number): Promise<string | null> {
    try {
      // Check if user has Google Calendar connected
      const [user] = await db
        .select({
          googleCalendarConnected: users.googleCalendarConnected,
          googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.googleCalendarConnected || !user?.googleCalendarSyncEnabled) {
        console.log(`User ${userId} doesn't have Google Calendar connected. Providing connection instructions.`);
        throw new Error('GOOGLE_CALENDAR_NOT_CONNECTED');
      }

      // Create real Google Calendar event with Meet link
      const eventId = await this.createCalendarEvent(userId, meetingData);
      
      if (!eventId) {
        throw new Error('Failed to create Google Calendar event');
      }

      // Update meeting with Google event ID and sync status
      await db
        .update(businessMeetings)
        .set({ 
          googleEventId: eventId,
          googleCalendarSynced: true 
        })
        .where(eq(businessMeetings.id, meetingData.id));

      // Get the meeting record to return the Meet link
      const [updatedMeeting] = await db
        .select({ googleMeetLink: businessMeetings.googleMeetLink })
        .from(businessMeetings)
        .where(eq(businessMeetings.id, meetingData.id));

      const meetLink = updatedMeeting?.googleMeetLink;
      
      if (meetLink) {
        console.log(`Generated real Google Meet link for meeting ${meetingData.id}: ${meetLink}`);
        return meetLink;
      } else {
        throw new Error('Google Meet link not found in created event');
      }
      
    } catch (error) {
      console.error('Error generating Google Meet link:', error);
      return null;
    }
  }

  /**
   * Log sync operation to database
   */
  private async logSyncOperation(
    meetingId: number, 
    userId: number, 
    action: string, 
    googleEventId: string | null, 
    status: string, 
    errorMessage?: string
  ) {
    try {
      await db.insert(googleCalendarSyncLog).values({
        meetingId,
        userId,
        action,
        googleEventId,
        status,
        errorMessage,
        syncDetails: {
          timestamp: new Date().toISOString(),
          action,
          status
        }
      });
    } catch (error) {
      console.error('Failed to log sync operation:', error);
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();