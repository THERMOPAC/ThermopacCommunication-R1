import express from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { googleCalendarService } from './google-calendar-service';
import { db } from './db';
import { users, businessMeetings } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
 * Handle Google OAuth callback - matches GOOGLE_REDIRECT_URI
 * This route is registered before authentication middleware to avoid session issues
 */
callbackRouter.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    console.log('Google OAuth callback received:', { code: !!code, state });
    
    if (!code || typeof code !== 'string') {
      console.log('Missing authorization code in callback');
      return res.redirect('/meetings-management?error=missing_code');
    }

    // Parse state parameter to get user ID and service type
    let stateData;
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
        return res.redirect('/meetings-management?error=invalid_state');
      }
    }
    
    // Check if this is a calendar OAuth callback
    if (stateData.service !== 'calendar') {
      console.log('OAuth callback not for calendar service, ignoring');
      return res.redirect('/meetings-management?error=invalid_state');
    }

    // Get user ID from state or session
    const userId = stateData.userId || req.user?.id;
    if (!userId) {
      console.log('No user ID available during OAuth callback');
      return res.redirect('/login?message=please_login_first');
    }

    console.log('Exchanging code for tokens for user:', userId);
    // Exchange code for tokens
    const tokens = await googleCalendarService.exchangeCodeForTokens(code);
    
    console.log('Saving tokens for user:', userId);
    // Save tokens to user account
    await googleCalendarService.saveUserTokens(userId, tokens);

    console.log('Google Calendar OAuth successful, redirecting...');
    // Redirect to meetings page with success message
    res.redirect('/meetings-management?connected=true');
  } catch (error) {
    console.error('Error handling Google Calendar callback:', error);
    res.redirect('/meetings-management?error=auth_failed');
  }
});

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

export default router;
export { callbackRouter };