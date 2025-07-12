// Direct script to manually trigger Google Calendar sync for meeting ID 14
import { db } from './server/db.js';
import { businessMeetings, users } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { GoogleCalendarService } from './server/google-calendar-service.js';

async function fixMeetingSync() {
  try {
    console.log('🔄 Starting manual Google Calendar sync for meeting ID 14...');
    
    // Get meeting details
    const [meeting] = await db
      .select()
      .from(businessMeetings)
      .where(eq(businessMeetings.id, 14));

    if (!meeting) {
      console.log('❌ Meeting not found');
      return;
    }

    console.log('📅 Found meeting:', {
      id: meeting.id,
      title: meeting.title,
      date: meeting.meetingDate,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      autoCreate: meeting.autoCreateGoogleMeet,
      organizerId: meeting.organizerId
    });

    // Get organizer's Google Calendar connection status
    const [organizer] = await db
      .select()
      .from(users)
      .where(eq(users.id, meeting.organizerId));

    if (!organizer?.googleCalendarConnected) {
      console.log('❌ Organizer Google Calendar not connected');
      return;
    }

    console.log('👤 Organizer Google Calendar connected:', organizer.googleCalendarConnected);
    console.log('🔗 Creating Google Calendar event...');

    // Create Google Calendar service instance
    const googleCalendarService = new GoogleCalendarService();

    // Create Google Calendar event
    const eventResult = await googleCalendarService.createCalendarEvent(
      meeting.organizerId,
      meeting.title,
      meeting.description || 'Meeting created from internal system',
      meeting.meetingDate,
      meeting.startTime,
      meeting.endTime,
      meeting.id
    );

    if (eventResult.success && eventResult.eventId) {
      // Update meeting with Google Calendar details
      const [updatedMeeting] = await db
        .update(businessMeetings)
        .set({
          googleEventId: eventResult.eventId,
          googleMeetLink: eventResult.meetLink || null,
          googleCalendarSynced: true,
          updatedAt: new Date()
        })
        .where(eq(businessMeetings.id, 14))
        .returning();

      console.log('✅ Successfully synced meeting to Google Calendar!');
      console.log('📋 Results:', {
        googleEventId: eventResult.eventId,
        googleMeetLink: eventResult.meetLink,
        meetingTitle: updatedMeeting.title,
        synced: updatedMeeting.googleCalendarSynced
      });
    } else {
      console.log('❌ Failed to create Google Calendar event:', eventResult.error);
    }
  } catch (error) {
    console.error('❌ Error during sync:', error);
  }
}

fixMeetingSync();