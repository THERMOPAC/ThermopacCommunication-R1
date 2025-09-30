import express from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { googleCalendarService } from './google-calendar-service';
import { db } from './db';
import { users, businessMeetings, concludedCalendarEvents, insertConcludedCalendarEventSchema } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Router for OAuth callback (no auth required)
const callbackRouter = express.Router();

// Router for main Google Calendar routes (auth required)
const router = express.Router();

/**
 * Generate Google Calendar OAuth URL
 */
router.get('/auth/google/calendar', ensureAuthenticated, (req, res) => {
  try {
    // Include user ID in state parameter to maintain session across OAuth redirect
    const stateData = {
      service: 'calendar',
      userId: req.user!.id
    };
    const state = encodeURIComponent(JSON.stringify(stateData));
    
    const authUrl = googleCalendarService.generateAuthUrl(state);
    console.log('Generated Google Calendar OAuth URL:', authUrl);
    console.log('Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 15) + '...');
    console.log('Redirect URI:', process.env.GOOGLE_REDIRECT_URI);
    console.log('State with user ID:', stateData);
    
    // For debugging, let's also return the URL in JSON format if requested
    if (req.query.debug === 'true') {
      return res.json({ 
        authUrl,
        clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 15) + '...',
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'],
        state: stateData
      });
    }
    
    // Redirect directly to Google OAuth instead of returning JSON
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error generating Google Calendar auth URL:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate authorization URL' 
    });
  }
});

/**
 * Handle Google OAuth callback - unified handler for both Gmail and Calendar
 * This function can be used as middleware or standalone handler
 */
export async function handleOAuthCallback(req: any, res: any) {
  let stateData: any;
  let errorRedirect = '/admin/meetings-management?error=auth_failed';
  
  try {
    const { code, state } = req.query;
    
    console.log('Google OAuth callback received:', { code: !!code, state });
    
    if (!code || typeof code !== 'string') {
      console.log('Missing authorization code in callback');
      return res.redirect('/meetings-management?error=missing_code');
    }

    // Parse state parameter to get user ID and service type
    try {
      stateData = JSON.parse(decodeURIComponent(state as string));
      console.log('Parsed state data:', stateData);
    } catch (e) {
      console.log('Invalid state parameter, falling back to legacy format');
      // Fallback for old state format
      if (state === 'service=calendar') {
        stateData = { service: 'calendar', userId: req.user?.id };
      } else {
        console.log('OAuth callback not for calendar service, ignoring');
        return res.redirect('/admin/meetings-management?error=invalid_state');
      }
    }
    
    // Check if this is a calendar or Gmail OAuth callback
    if (stateData.service !== 'calendar' && stateData.service !== 'gmail') {
      console.log('OAuth callback not for calendar or gmail service, ignoring');
      return res.redirect('/admin/meetings-management?error=invalid_state');
    }
    
    // Route to appropriate page based on service type
    const successRedirect = stateData.service === 'gmail' ? '/emails?connected=true' : '/admin/meetings-management?connected=true';
    errorRedirect = stateData.service === 'gmail' ? '/emails?error=auth_failed' : '/admin/meetings-management?error=auth_failed';

    // Get user ID from state or session
    const userId = stateData.userId || req.user?.id;
    if (!userId) {
      console.log('No user ID available during OAuth callback');
      return res.redirect('/login?message=please_login_first');
    }

    console.log(`Exchanging code for tokens for user: ${userId} (service: ${stateData.service})`);
    console.log('Authorization code length:', code.length);
    console.log('Using redirect URI:', process.env.GOOGLE_REDIRECT_URI);
    
    // Exchange code for tokens
    const tokens = await googleCalendarService.exchangeCodeForTokens(code);
    console.log('Received tokens:', { 
      hasAccessToken: !!tokens.access_token, 
      hasRefreshToken: !!tokens.refresh_token,
      expiresAt: tokens.expiry_date 
    });
    
    console.log('Saving tokens for user:', userId);
    // Save tokens to user account
    await googleCalendarService.saveUserTokens(userId, tokens);

    console.log(`Google OAuth successful for ${stateData.service}`);
    
    // For Gmail, send auto-close HTML (popup window)
    // For Calendar, redirect to meetings page (full page flow)
    if (stateData.service === 'gmail') {
      console.log('Sending auto-close HTML for Gmail OAuth');
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            .checkmark {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            .message {
              font-size: 1.5rem;
              margin-bottom: 0.5rem;
            }
            .sub-message {
              opacity: 0.9;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark">✓</div>
            <div class="message">Gmail Connected Successfully!</div>
            <div class="sub-message">This window will close automatically...</div>
          </div>
          <script>
            // Close the popup window after a brief delay
            setTimeout(() => {
              window.close();
            }, 1500);
          </script>
        </body>
        </html>
      `);
    } else {
      console.log(`Redirecting to ${successRedirect} for Calendar OAuth`);
      res.redirect(successRedirect);
    }
  } catch (error) {
    console.error(`Error handling Google OAuth callback for ${stateData?.service || 'unknown'}:`, error);
    res.redirect(errorRedirect);
  }
}

/**
 * Register callback handler in router
 */
callbackRouter.get('/auth/google/callback', handleOAuthCallback);

/**
 * Debug endpoint to check Google OAuth configuration
 */
router.get('/calendar/debug', ensureAuthenticated, (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 15) + '...',
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    requiredScopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    instructions: {
      step1: 'Go to Google Cloud Console (console.cloud.google.com)',
      step2: 'Select your project: thermopac-communication-system',
      step3: 'Enable Google Calendar API in APIs & Services > Library',
      step4: 'Configure OAuth consent screen in APIs & Services > OAuth consent screen',
      step5: 'Add authorized redirect URI in APIs & Services > Credentials',
      step6: 'Make sure both scopes above are added to the OAuth consent screen'
    }
  });
});

/**
 * Get user's Google Calendar connection status
 */
router.get('/calendar/status', ensureAuthenticated, async (req, res) => {
  try {
    const [user] = await db
      .select({
        googleCalendarConnected: users.googleCalendarConnected,
        googleCalendarSyncEnabled: users.googleCalendarSyncEnabled,
        googleEmail: users.googleEmail
      })
      .from(users)
      .where(eq(users.id, req.user!.id));

    res.json({
      success: true,
      isConnected: user?.googleCalendarConnected || false,
      syncEnabled: user?.googleCalendarSyncEnabled || false,
      googleEmail: user?.googleEmail || null
    });
  } catch (error) {
    console.error('Error getting calendar status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get calendar status' 
    });
  }
});

/**
 * Disconnect Google Calendar
 */
router.post('/calendar/disconnect', ensureAuthenticated, async (req, res) => {
  try {
    const success = await googleCalendarService.disconnectCalendar(req.user!.id);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Google Calendar disconnected successfully' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to disconnect Google Calendar' 
      });
    }
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to disconnect Google Calendar' 
    });
  }
});

/**
 * Toggle Google Calendar sync for user
 */
router.post('/calendar/sync/toggle', ensureAuthenticated, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    await db
      .update(users)
      .set({ googleCalendarSyncEnabled: enabled })
      .where(eq(users.id, req.user!.id));

    res.json({ 
      success: true, 
      syncEnabled: enabled,
      message: `Google Calendar sync ${enabled ? 'enabled' : 'disabled'}` 
    });
  } catch (error) {
    console.error('Error toggling calendar sync:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to toggle calendar sync' 
    });
  }
});

/**
 * Fetch upcoming Google Calendar events with Google Meet links
 */
router.get('/calendar/upcoming-events', ensureAuthenticated, async (req, res) => {
  try {
    const maxResults = parseInt(req.query.maxResults as string) || 25;
    const userId = req.user!.id;

    console.log(`Fetching upcoming Google Calendar events for user ${userId}`);

    // Check if user has Google Calendar connected
    const [user] = await db
      .select({
        googleCalendarConnected: users.googleCalendarConnected,
        googleCalendarSyncEnabled: users.googleCalendarSyncEnabled,
        googleAccessToken: users.googleAccessToken,
        googleTokenExpiresAt: users.googleTokenExpiresAt
      })
      .from(users)
      .where(eq(users.id, userId));

    console.log('User Google Calendar status:', {
      connected: user?.googleCalendarConnected,
      syncEnabled: user?.googleCalendarSyncEnabled,
      hasAccessToken: !!user?.googleAccessToken,
      tokenExpiresAt: user?.googleTokenExpiresAt
    });

    if (!user?.googleCalendarConnected) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar not connected',
        message: 'Please connect your Google Calendar to fetch events',
        requiresConnection: true
      });
    }

    if (!user.googleCalendarSyncEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar sync disabled',
        message: 'Please enable Google Calendar sync to fetch events'
      });
    }

    // Get concluded events for this user
    const concludedEvents = await db
      .select({
        googleEventId: concludedCalendarEvents.googleEventId
      })
      .from(concludedCalendarEvents)
      .where(eq(concludedCalendarEvents.userId, userId));

    const concludedEventIds = new Set(concludedEvents.map(event => event.googleEventId));
    console.log(`Found ${concludedEvents.length} concluded events:`, Array.from(concludedEventIds));

    // Fetch upcoming events with Google Meet links
    const allEvents = await googleCalendarService.fetchUpcomingEvents(userId, maxResults);
    console.log(`All events from Google Calendar:`, allEvents.map(e => ({ id: e.id, summary: e.summary })));
    
    // Filter out concluded events
    const events = allEvents.filter(event => !concludedEventIds.has(event.id));
    console.log(`Events after filtering concluded ones:`, events.map(e => ({ id: e.id, summary: e.summary })));

    res.json({
      success: true,
      events: events,
      count: events.length,
      message: `Found ${events.length} upcoming events`
    });

  } catch (error) {
    console.error('Error fetching upcoming calendar events:', error);
    
    if (error.message.includes('Calendar not connected')) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar not connected',
        message: 'Please connect your Google Calendar to fetch events',
        requiresConnection: true
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch calendar events',
      message: error.message || 'An error occurred while fetching calendar events'
    });
  }
});

/**
 * Manually sync meeting to Google Calendar
 */
router.post('/calendar/sync/:meetingId', ensureAuthenticated, async (req, res) => {
  try {
    const meetingId = parseInt(req.params.meetingId);
    
    // Get meeting data
    const [meeting] = await db
      .select()
      .from(businessMeetings)
      .where(eq(businessMeetings.id, meetingId));

    if (!meeting) {
      return res.status(404).json({ 
        success: false, 
        error: 'Meeting not found' 
      });
    }

    // Check if user can sync this meeting (organizer or attendee)
    const canSync = meeting.organizerId === req.user!.id || 
      (meeting.attendeeIds as number[]).includes(req.user!.id);

    if (!canSync) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to sync this meeting' 
      });
    }

    let eventId: string | null = null;

    // Create or update calendar event
    if (meeting.googleEventId) {
      // Update existing event
      const success = await googleCalendarService.updateCalendarEvent(
        req.user!.id, 
        meeting.googleEventId, 
        meeting
      );
      if (success) {
        eventId = meeting.googleEventId;
      }
    } else {
      // Create new event
      eventId = await googleCalendarService.createCalendarEvent(req.user!.id, meeting);
    }

    if (eventId) {
      // Update meeting with Google event ID
      await db
        .update(businessMeetings)
        .set({ 
          googleEventId: eventId,
          googleCalendarSynced: true 
        })
        .where(eq(businessMeetings.id, meetingId));

      res.json({ 
        success: true, 
        eventId,
        message: 'Meeting synced to Google Calendar successfully' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to sync meeting to Google Calendar' 
      });
    }
  } catch (error) {
    console.error('Error syncing meeting to calendar:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to sync meeting to calendar' 
    });
  }
});

/**
 * Get sync history for meetings
 */
router.get('/calendar/sync/history', ensureAuthenticated, async (req, res) => {
  try {
    const syncHistory = await db.query.googleCalendarSyncLog.findMany({
      where: eq(db.query.googleCalendarSyncLog.userId, req.user!.id),
      orderBy: (syncLog, { desc }) => [desc(syncLog.createdAt)],
      limit: 50
    });

    res.json({ success: true, history: syncHistory });
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get sync history' 
    });
  }
});

/**
 * Mark a Google Calendar event as concluded
 */
router.post('/calendar/conclude-event', ensureAuthenticated, async (req, res) => {
  try {
    const { googleEventId, eventTitle } = req.body;
    const userId = req.user!.id;

    // Validate input
    if (!googleEventId) {
      return res.status(400).json({
        success: false,
        error: 'Google event ID is required'
      });
    }

    console.log(`Marking event ${googleEventId} as concluded for user ${userId}`);

    // Check if event is already concluded
    const existingConcluded = await db
      .select()
      .from(concludedCalendarEvents)
      .where(
        and(
          eq(concludedCalendarEvents.googleEventId, googleEventId),
          eq(concludedCalendarEvents.userId, userId)
        )
      );

    if (existingConcluded.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Event is already marked as concluded'
      });
    }

    // Insert concluded event record
    await db
      .insert(concludedCalendarEvents)
      .values({
        googleEventId,
        userId,
        eventTitle: eventTitle || null
      });

    console.log(`Successfully marked event ${googleEventId} as concluded`);

    res.json({
      success: true,
      message: 'Event marked as concluded successfully'
    });

  } catch (error) {
    console.error('Error concluding calendar event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark event as concluded'
    });
  }
});

export default router;
export { callbackRouter };