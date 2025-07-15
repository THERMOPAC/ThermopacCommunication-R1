import { Request, Response } from 'express';
import { db } from './db';
import { businessMeetings, users } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { GoogleCalendarService } from './google-calendar-service';

// Initialize Google Calendar service
const googleCalendarService = new GoogleCalendarService();

/**
 * Employee Planning Template - Simple daily planning pattern
 */
export const employeePlanningTemplate = {
  title: "Daily Planning Session",
  description: "Personal planning and task organization",
  meetingType: "Personal Planning",
  priority: "Medium",
  duration: 30, // 30 minutes as requested
  timeSlot: "11:00", // Fixed at 11:00 AM
  agenda: "Daily task review, priority setting, and goal alignment"
};

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
      
      // Create meeting object
      const meeting = {
        title: employeePlanningTemplate.title,
        description: employeePlanningTemplate.description,
        meetingDate: dateStr,
        startTime: employeePlanningTemplate.timeSlot,
        endTime: "11:30", // 30-minute duration
        meetingType: employeePlanningTemplate.meetingType,
        priority: employeePlanningTemplate.priority,
        agenda: employeePlanningTemplate.agenda,
        organizerId: user.id,
        attendeeIds: [user.id], // Only the employee themselves
        location: null,
        meetingUrl: null,
        googleMeetLink: null,
        autoCreateGoogleMeet: false,
        status: 'Scheduled'
      };
      
      meetingsToCreate.push(meeting);
    }
    
    // Insert meetings into database
    if (meetingsToCreate.length > 0) {
      await db.insert(businessMeetings).values(meetingsToCreate);
      console.log(`✅ Created ${meetingsToCreate.length} employee planning meetings`);
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