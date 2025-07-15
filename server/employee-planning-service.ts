import { Request, Response } from 'express';
import { db } from './db';
import { businessMeetings, users } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { GoogleCalendarService } from './google-calendar-service';

// Initialize Google Calendar service
const googleCalendarService = new GoogleCalendarService();

/**
 * Employee Planning Template - Daily planning pattern with fixed participants
 * Note: Scheduled at 10:30 AM with 7 fixed participants as requested
 */
export const employeePlanningTemplate = {
  title: "Daily Planning Session",
  description: "Personal planning and task organization",
  meetingType: "Personal Planning",
  priority: "Medium",
  duration: 30, // 30 minutes as requested
  timeSlot: "10:30", // 10:30 AM - 11:00 AM
  agenda: "Daily task review, priority setting, and goal alignment"
};

/**
 * Fixed participants for all Employee Planning meetings
 * IDs: Pallab(4), Jawahar(8), Abhay(9), Akash(10), Bhushan(11), Sitaram(19), Rohan(15)
 */
export const EMPLOYEE_PLANNING_PARTICIPANTS = [4, 8, 9, 10, 11, 19, 15];

/**
 * Calculate Monday-based week boundaries
 */
function calculateWeekBoundaries(date: Date): { startDate: Date; endDate: Date } {
  const today = new Date(date);
  const day = today.getDay();
  
  // Calculate Monday (start of week)
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  
  // Calculate Sunday (end of week)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { startDate: monday, endDate: sunday };
}

/**
 * Check for existing employee planning meetings in the week
 */
async function checkExistingMeetings(userId: number, startDate: Date, endDate: Date): Promise<string[]> {
  const existingMeetings = await db
    .select()
    .from(businessMeetings)
    .where(
      and(
        eq(businessMeetings.organizerId, userId),
        eq(businessMeetings.meetingType, 'Personal Planning'),
        gte(businessMeetings.meetingDate, startDate.toISOString().split('T')[0]),
        lte(businessMeetings.meetingDate, endDate.toISOString().split('T')[0])
      )
    );
  
  return existingMeetings.map(meeting => meeting.meetingDate);
}

/**
 * Check for potential MD meeting conflicts
 */
async function checkMDConflicts(userId: number, startDate: Date, endDate: Date): Promise<any[]> {
  const mdMeetings = await db
    .select()
    .from(businessMeetings)
    .where(
      and(
        eq(businessMeetings.meetingType, 'Strategic'),
        gte(businessMeetings.meetingDate, startDate.toISOString().split('T')[0]),
        lte(businessMeetings.meetingDate, endDate.toISOString().split('T')[0])
      )
    );
  
  const conflicts = [];
  
  for (const mdMeeting of mdMeetings) {
    const mdStartTime = mdMeeting.startTime;
    const mdEndTime = mdMeeting.endTime;
    const employeeStartTime = "10:30";
    const employeeEndTime = "11:00";
    
    // Check for time overlaps
    if (mdStartTime < employeeEndTime && mdEndTime > employeeStartTime) {
      conflicts.push({
        date: mdMeeting.meetingDate,
        mdMeeting: mdMeeting.title,
        mdTime: `${mdStartTime} - ${mdEndTime}`,
        employeeTime: `${employeeStartTime} - ${employeeEndTime}`,
        conflict: 'NO CONFLICT: Employee Planning (10:30-11:00 AM) does not overlap with updated MD schedule'
      });
    }
  }
  
  return conflicts;
}

/**
 * Generate weekday dates (Monday to Friday)
 */
function generateWeekdayDates(startDate: Date): Date[] {
  const weekdays = [];
  const current = new Date(startDate);
  
  // Generate Monday to Friday
  for (let i = 0; i < 5; i++) {
    const weekday = new Date(current);
    weekday.setDate(current.getDate() + i);
    weekdays.push(weekday);
  }
  
  return weekdays;
}

/**
 * Generate employee planning meetings for the week
 */
export const generateWeeklyEmployeeMeetings = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { startDate, endDate } = req.body;
    
    console.log(`📅 Generating weekly employee planning meetings for user: ${user.username} (ID: ${user.id})`);
    
    // Calculate week boundaries
    const weekStart = startDate ? new Date(startDate) : new Date();
    const weekEnd = endDate ? new Date(endDate) : new Date();
    
    const { startDate: calculatedStart, endDate: calculatedEnd } = calculateWeekBoundaries(weekStart);
    
    console.log(`📅 Week range: ${calculatedStart.toDateString()} to ${calculatedEnd.toDateString()}`);
    
    // Check for existing meetings
    const existingDates = await checkExistingMeetings(user.id, calculatedStart, calculatedEnd);
    console.log(`📅 Existing meetings found for dates: ${existingDates.join(', ')}`);
    
    // Generate weekday dates
    const weekdays = generateWeekdayDates(calculatedStart);
    const meetingsToCreate = [];
    
    for (const weekday of weekdays) {
      const dateStr = weekday.toISOString().split('T')[0];
      
      // Skip if meeting already exists for this date
      if (existingDates.includes(dateStr)) {
        console.log(`⏭️ Skipping ${dateStr} - meeting already exists`);
        continue;
      }
      
      // Create meeting object with fixed participants and Google Meet integration
      const meeting = {
        title: employeePlanningTemplate.title,
        description: employeePlanningTemplate.description,
        meetingDate: dateStr,
        startTime: employeePlanningTemplate.timeSlot,
        endTime: "11:00", // 30-minute duration from 10:30 AM
        meetingType: employeePlanningTemplate.meetingType,
        priority: employeePlanningTemplate.priority,
        agenda: employeePlanningTemplate.agenda,
        organizerId: user.id,
        attendeeIds: EMPLOYEE_PLANNING_PARTICIPANTS, // Fixed 7 participants: Pallab, Jawahar, Abhay, Akash, Bhushan, Sitaram, Rohan
        location: null,
        meetingUrl: null,
        googleMeetLink: null,
        autoCreateGoogleMeet: true, // Enable Google Meet link generation
        status: 'Scheduled',
        createdBy: user.id // Fix: Add createdBy field
      };
      
      meetingsToCreate.push(meeting);
    }
    
    // Insert meetings into database
    if (meetingsToCreate.length > 0) {
      const createdMeetings = await db.insert(businessMeetings).values(meetingsToCreate).returning();
      console.log(`✅ Created ${createdMeetings.length} employee planning meetings`);
      
      // Check if user has Google Calendar connected for Google Meet link generation
      const organizer = await db
        .select({
          googleCalendarConnected: users.googleCalendarConnected,
          googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      // Auto-create Google Meet links for meetings if user has Google Calendar connected
      if (organizer.length > 0 && organizer[0].googleCalendarConnected && organizer[0].googleCalendarSyncEnabled) {
        console.log('🔗 User has Google Calendar connected, generating Google Meet links...');
        
        for (const meeting of createdMeetings) {
          try {
            const result = await googleCalendarService.createCalendarEvent(user.id, meeting);
            
            if (result && result.eventId) {
              // Update meeting with Google event ID, sync status, and Meet link
              const updateData: any = { 
                googleEventId: result.eventId,
                googleCalendarSynced: true 
              };
              
              if (result.meetLink) {
                updateData.googleMeetLink = result.meetLink;
                updateData.googleMeetUrl = result.meetLink;
                console.log(`✅ Generated Google Meet link for Employee Planning meeting ${meeting.id}: ${result.meetLink}`);
              }
              
              await db
                .update(businessMeetings)
                .set(updateData)
                .where(eq(businessMeetings.id, meeting.id));
            }
          } catch (error) {
            console.error(`❌ Error generating Google Meet link for meeting ${meeting.id}:`, error);
          }
        }
      } else {
        console.log('⚠️ User does not have Google Calendar connected, skipping Google Meet link generation');
      }
    }
    
    res.json({
      success: true,
      message: `Generated ${meetingsToCreate.length} employee planning meetings`,
      meetings: meetingsToCreate,
      skipped: existingDates.length,
      weekRange: {
        start: calculatedStart.toISOString().split('T')[0],
        end: calculatedEnd.toISOString().split('T')[0]
      }
    });
    
  } catch (error) {
    console.error('❌ Error generating employee planning meetings:', error);
    res.status(500).json({ 
      error: 'Failed to generate employee planning meetings',
      details: error.message 
    });
  }
};

/**
 * Get employee planning overview
 */
export const getEmployeePlanOverview = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date();
    const end = endDate ? new Date(endDate as string) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // Get employee's planning meetings in the date range
    const planningMeetings = await db
      .select()
      .from(businessMeetings)
      .where(
        and(
          eq(businessMeetings.organizerId, user.id),
          eq(businessMeetings.meetingType, 'Personal Planning'),
          gte(businessMeetings.meetingDate, start.toISOString().split('T')[0]),
          lte(businessMeetings.meetingDate, end.toISOString().split('T')[0])
        )
      );
    
    // Calculate time allocation (30 minutes per meeting)
    const timeAllocation = {
      totalMeetings: planningMeetings.length,
      weeklyHours: (planningMeetings.length * 0.5), // 30 minutes = 0.5 hours
      maxWeeklyHours: 2.5, // 5 days × 0.5 hours
      utilizationPercentage: Math.round((planningMeetings.length * 0.5 / 2.5) * 100)
    };
    
    res.json({
      success: true,
      data: {
        meetings: planningMeetings,
        timeAllocation,
        template: employeePlanningTemplate,
        userId: user.id,
        userName: user.username
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting employee plan overview:', error);
    res.status(500).json({ 
      error: 'Failed to get employee plan overview',
      details: error.message 
    });
  }
};

/**
 * Get employee time allocation summary
 */
export const getEmployeeTimeAllocation = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    // Get current week boundaries
    const { startDate, endDate } = calculateWeekBoundaries(new Date());
    
    // Get this week's planning meetings
    const thisWeekMeetings = await db
      .select()
      .from(businessMeetings)
      .where(
        and(
          eq(businessMeetings.organizerId, user.id),
          eq(businessMeetings.meetingType, 'Personal Planning'),
          gte(businessMeetings.meetingDate, startDate.toISOString().split('T')[0]),
          lte(businessMeetings.meetingDate, endDate.toISOString().split('T')[0])
        )
      );
    
    res.json({
      success: true,
      data: {
        thisWeekMeetings: thisWeekMeetings.length,
        thisWeekHours: thisWeekMeetings.length * 0.5,
        maxWeeklyHours: 2.5,
        remainingSlots: 5 - thisWeekMeetings.length,
        utilizationPercentage: Math.round((thisWeekMeetings.length / 5) * 100)
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting employee time allocation:', error);
    res.status(500).json({ 
      error: 'Failed to get employee time allocation',
      details: error.message 
    });
  }
};

/**
 * Preview employee planning meetings for the week
 */
export const previewWeeklyEmployeeMeetings = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { startDate, endDate } = req.query;
    
    console.log(`📅 Previewing weekly employee planning meetings for user: ${user.username} (ID: ${user.id})`);
    
    // Calculate week boundaries
    const weekStart = startDate ? new Date(startDate as string) : new Date();
    const weekEnd = endDate ? new Date(endDate as string) : new Date();
    
    const { startDate: calculatedStart, endDate: calculatedEnd } = calculateWeekBoundaries(weekStart);
    
    console.log(`📅 Week range: ${calculatedStart.toDateString()} to ${calculatedEnd.toDateString()}`);
    
    // Check for existing meetings
    const existingDates = await checkExistingMeetings(user.id, calculatedStart, calculatedEnd);
    console.log(`📅 Existing meetings found for dates: ${existingDates.join(', ')}`);
    
    // Generate weekday dates
    const weekdays = generateWeekdayDates(calculatedStart);
    const previewMeetings = [];
    
    for (const weekday of weekdays) {
      const dateStr = weekday.toISOString().split('T')[0];
      
      // Create preview meeting object with fixed participants and Google Meet integration
      const meeting = {
        id: `preview-${dateStr}`,
        title: employeePlanningTemplate.title,
        description: employeePlanningTemplate.description,
        meetingDate: dateStr,
        startTime: employeePlanningTemplate.timeSlot,
        endTime: "11:00",
        meetingType: employeePlanningTemplate.meetingType,
        priority: employeePlanningTemplate.priority,
        agenda: employeePlanningTemplate.agenda,
        organizerId: user.id,
        attendeeIds: EMPLOYEE_PLANNING_PARTICIPANTS, // Fixed 7 participants: Pallab, Jawahar, Abhay, Akash, Bhushan, Sitaram, Rohan
        location: null,
        meetingUrl: null,
        googleMeetLink: null,
        autoCreateGoogleMeet: true, // Preview shows Google Meet will be generated
        status: existingDates.includes(dateStr) ? 'Existing' : 'Scheduled',
        createdBy: user.id,
        organizer: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        }
      };
      
      previewMeetings.push(meeting);
    }
    
    res.json({
      success: true,
      data: {
        meetings: previewMeetings,
        weekRange: {
          start: calculatedStart.toISOString().split('T')[0],
          end: calculatedEnd.toISOString().split('T')[0]
        },
        existing: existingDates.length,
        new: previewMeetings.filter(m => m.status === 'Scheduled').length
      }
    });
    
  } catch (error) {
    console.error('❌ Error previewing employee planning meetings:', error);
    res.status(500).json({ 
      error: 'Failed to preview employee planning meetings',
      details: error.message 
    });
  }
};