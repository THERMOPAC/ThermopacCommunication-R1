import { Request, Response } from 'express';
import { db } from './db';
import { businessMeetings, meetingTemplates, users } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { GoogleCalendarService } from './google-calendar-service';

// Initialize Google Calendar service
const googleCalendarService = new GoogleCalendarService();

// MD Meeting Template Definitions based on MD_Yearly_Meeting_Plan_2025.md
export const mdMeetingTemplates = {
  // Weekly Templates
  weekly: {
    executiveBrief: {
      title: "Executive Brief",
      description: "Key updates from department heads",
      meetingType: "Executive",
      priority: "High",
      duration: 30,
      dayOfWeek: 0, // Monday (0-based for Monday-start week)
      timeSlot: "10:00", // Updated: No meetings before 10:00 AM
      attendeeRoles: ["General Manager", "Senior Manager", "Manager"]
    },
    strategicThinking: {
      title: "Strategic Thinking Session",
      description: "Individual planning and analysis",
      meetingType: "Strategic",
      priority: "Critical",
      duration: 120,
      dayOfWeek: 0, // Monday (0-based for Monday-start week)
      timeSlot: "10:30", // Updated: No meetings before 10:00 AM
      attendeeRoles: [] // Individual time
    },
    marketingStrategyCheckin: {
      title: "Marketing Strategy Check-in",
      description: "Weekly marketing performance and strategy alignment",
      meetingType: "Marketing",
      priority: "High",
      duration: 60,
      dayOfWeek: 1, // Tuesday (0-based for Monday-start week)
      timeSlot: "14:00",
      attendeeRoles: ["Marketing Manager", "Sales Manager"]
    },
    customerProjectReviews: {
      title: "Customer Project Reviews",
      description: "Project launches, milestone reviews, escalation support",
      meetingType: "Customer Projects",
      priority: "High",
      duration: 90,
      dayOfWeek: 1, // Tuesday (0-based for Monday-start week)
      timeSlot: "15:00",
      attendeeRoles: ["Project Manager", "Senior Manager"]
    },
    campaignPlanningReview: {
      title: "Campaign Planning/Performance Review",
      description: "Marketing campaign performance analysis or new campaign development",
      meetingType: "Marketing",
      priority: "Medium",
      duration: 90,
      dayOfWeek: 2, // Wednesday (0-based for Monday-start week)
      timeSlot: "14:30",
      attendeeRoles: ["Marketing Manager", "Creative Manager"]
    },
    externalPositioning: {
      title: "External Positioning & Branding",
      description: "Brand alignment, positioning strategy, external communications",
      meetingType: "Brand Strategy",
      priority: "Medium",
      duration: 60,
      dayOfWeek: 3, // Thursday (0-based for Monday-start week)
      timeSlot: "15:00",
      attendeeRoles: ["Marketing Manager", "Communications Manager"]
    },
    leadershipDevelopment: {
      title: "Leadership Development",
      description: "Team growth and development",
      meetingType: "People Development",
      priority: "Medium",
      duration: 60,
      dayOfWeek: 2, // Wednesday (0-based for Monday-start week)
      timeSlot: "10:00", // Updated: No meetings before 10:00 AM
      attendeeRoles: ["HR Manager", "General Manager"]
    }
  },

  // Monthly Templates
  monthly: {
    executiveLeadershipTeam: {
      title: "Executive Leadership Team Meeting",
      description: "Strategic decisions, cross-functional alignment",
      meetingType: "Executive",
      priority: "Critical",
      duration: 120,
      monthlySchedule: "first-monday",
      timeSlot: "10:00", // Updated: No meetings before 10:00 AM
      attendeeRoles: ["General Manager", "Senior Manager"]
    },
    departmentHeadCouncil: {
      title: "Department Head Council",
      description: "Operational alignment, cross-department coordination",
      meetingType: "Operations",
      priority: "High",
      duration: 90,
      monthlySchedule: "third-wednesday",
      timeSlot: "10:00",
      attendeeRoles: ["General Manager", "Senior Manager", "Manager"]
    }
  },

  // Quarterly Templates
  quarterly: {
    quarterlyBusinessReview: {
      title: "Quarterly Business Review (QBR)",
      description: "Performance review, strategic alignment, resource planning",
      meetingType: "Strategic",
      priority: "Critical",
      duration: 180,
      quarterlySchedule: "first-week",
      timeSlot: "09:00",
      attendeeRoles: ["General Manager", "Senior Manager", "Manager"]
    },
    bankInvestorReview: {
      title: "Bank/Investor Review",
      description: "Financial health, funding needs",
      meetingType: "Financial",
      priority: "High",
      duration: 120,
      quarterlySchedule: "second-week",
      timeSlot: "14:00",
      attendeeRoles: ["CFO", "Finance Manager"]
    }
  },

  // Annual Templates
  annual: {
    strategicPlanningRetreat: {
      title: "Annual Strategic Planning Retreat",
      description: "Set yearly vision, strategic priorities, budget allocation",
      meetingType: "Strategic",
      priority: "Critical",
      duration: 480, // 2 days
      month: 1, // January
      timeSlot: "10:00", // Updated: No meetings before 10:00 AM
      attendeeRoles: ["General Manager", "Senior Manager", "Manager"]
    },
    midYearStrategicReview: {
      title: "Mid-Year Strategic Review",
      description: "Assess progress, pivot strategies, resource reallocation",
      meetingType: "Strategic",
      priority: "Critical",
      duration: 240, // 1 day
      month: 7, // July
      timeSlot: "10:00", // Updated: No meetings before 10:00 AM
      attendeeRoles: ["General Manager", "Senior Manager", "Manager"]
    },
    annualBoardMeeting: {
      title: "Annual Board Meeting",
      description: "Annual performance review, next year approval",
      meetingType: "Board",
      priority: "Critical",
      duration: 240,
      month: 12, // December
      timeSlot: "10:00",
      attendeeRoles: ["Board Member", "General Manager"]
    }
  }
};

/**
 * Apply MD scheduling constraints to meeting times
 * - No meetings before 10:00 AM
 * - No meetings during 13:00-14:00 (1-2 PM lunch block)
 */
function applyMDSchedulingConstraints(timeSlot: string, duration: number): { startTime: string; endTime: string } {
  let [hours, minutes] = timeSlot.split(':').map(Number);
  
  // Rule 1: No meetings before 10:00 AM
  if (hours < 10) {
    hours = 10;
    minutes = 0;
  }
  
  // Calculate end time
  const startTimeMinutes = hours * 60 + minutes;
  const endTimeMinutes = startTimeMinutes + duration;
  const endHours = Math.floor(endTimeMinutes / 60);
  const endMins = endTimeMinutes % 60;
  
  // Rule 2: Check lunch block overlap (13:00-14:00)
  const lunchStart = 13 * 60; // 13:00 in minutes
  const lunchEnd = 14 * 60;   // 14:00 in minutes
  
  // If meeting overlaps lunch block, adjust
  if (startTimeMinutes < lunchEnd && endTimeMinutes > lunchStart) {
    if (startTimeMinutes < lunchStart) {
      // Meeting starts before lunch, end it at lunch start
      const adjustedEndMinutes = lunchStart;
      const adjustedEndHours = Math.floor(adjustedEndMinutes / 60);
      const adjustedEndMins = adjustedEndMinutes % 60;
      
      return {
        startTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        endTime: `${String(adjustedEndHours).padStart(2, '0')}:${String(adjustedEndMins).padStart(2, '0')}`
      };
    } else {
      // Meeting starts during or after lunch start, move it to after lunch
      hours = 14;
      minutes = 0;
      const newStartTimeMinutes = hours * 60 + minutes;
      const newEndTimeMinutes = newStartTimeMinutes + duration;
      const newEndHours = Math.floor(newEndTimeMinutes / 60);
      const newEndMins = newEndTimeMinutes % 60;
      
      return {
        startTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        endTime: `${String(newEndHours).padStart(2, '0')}:${String(newEndMins).padStart(2, '0')}`
      };
    }
  }
  
  // No conflicts, return original times
  return {
    startTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    endTime: `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`
  };
}

/**
 * Preview weekly meetings for MD
 */
export const previewWeeklyMDMeetings = async (req: Request, res: Response) => {
  console.log('\n🔥 PREVIEW WEEKLY MD MEETINGS - ENDPOINT HIT!');
  try {
    const user = req.user as any;
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const previewMeetings = [];
    
    console.log(`\n=== MD WEEKLY PREVIEW DEBUG ===`);
    console.log(`Processing ${Object.keys(mdMeetingTemplates.weekly).length} templates`);
    console.log(`Input startDate: ${startDate}, endDate: ${endDate}`);
    console.log(`Parsed start: ${start.toISOString()}, end: ${end.toISOString()}`);
    console.log(`Templates: ${Object.keys(mdMeetingTemplates.weekly).join(', ')}`);
    
    for (const [templateKey, template] of Object.entries(mdMeetingTemplates.weekly)) {
      console.log(`\n--- Processing Template: ${templateKey} ---`);
      console.log(`Template dayOfWeek: ${template.dayOfWeek}, title: "${template.title}"`);
      
      // Calculate meeting date within the current week range
      // Find Monday of the current week range
      const startDay = start.getDay(); // 0=Sunday, 1=Monday, etc.
      const daysFromMonday = startDay === 0 ? 6 : startDay - 1; // Days from Monday
      
      const mondayOfWeek = new Date(start);
      mondayOfWeek.setDate(mondayOfWeek.getDate() - daysFromMonday);
      
      // Add template day offset to Monday
      const meetingDate = new Date(mondayOfWeek);
      meetingDate.setDate(meetingDate.getDate() + template.dayOfWeek);
      
      // If the calculated date is before our start range, move to next week
      if (meetingDate < start) {
        meetingDate.setDate(meetingDate.getDate() + 7);
      }
      
      // If still outside range (happens with Monday meetings), try end of week
      if (meetingDate < start && template.dayOfWeek === 0) {
        // For Monday meetings, try the Monday at the end of the range
        const mondayAtEnd = new Date(end);
        if (mondayAtEnd.getDay() === 1) { // If end is Monday, use it
          meetingDate.setTime(mondayAtEnd.getTime());
        }
      }
      
      console.log(`Start date: ${start.toDateString()}`);
      console.log(`Template dayOfWeek offset: ${template.dayOfWeek}`);
      console.log(`Calculated meetingDate: ${meetingDate.toDateString()}`);
      console.log(`Within range check: ${meetingDate.toDateString()} between ${start.toDateString()} and ${end.toDateString()}`);
      
      // Skip if meeting date is outside our range
      if (meetingDate < start || meetingDate > end) {
        console.log(`❌ SKIPPED - ${templateKey}: Outside date range`);
        continue;
      }
      console.log(`✅ INCLUDED - ${templateKey}: Within date range`);
      
      // Check if meeting already exists
      const existingMeeting = await db
        .select()
        .from(businessMeetings)
        .where(
          and(
            eq(businessMeetings.title, template.title),
            eq(businessMeetings.meetingDate, meetingDate.toISOString().split('T')[0]),
            eq(businessMeetings.startTime, template.timeSlot),
            eq(businessMeetings.organizerId, user.id)
          )
        );
        
      // Apply MD scheduling constraints
      const adjustedTimes = applyMDSchedulingConstraints(template.timeSlot, template.duration);
      
      // Time constraints applied automatically
      
      previewMeetings.push({
        title: template.title,
        description: template.description,
        meetingType: template.meetingType,
        priority: template.priority,
        meetingDate: meetingDate.toISOString().split('T')[0],
        startTime: adjustedTimes.startTime,
        endTime: adjustedTimes.endTime,
        duration: template.duration,
        timeAllocation: template.timeAllocation,
        status: existingMeeting.length > 0 ? 'Already exists' : 'Will be created',
        dayOfWeek: template.dayOfWeek === 0 ? 'Monday' : 
                   template.dayOfWeek === 1 ? 'Tuesday' : 
                   template.dayOfWeek === 2 ? 'Wednesday' : 
                   template.dayOfWeek === 3 ? 'Thursday' : 'Unknown',
        originalTimeSlot: template.timeSlot, // Track original for debugging
        wasAdjusted: template.timeSlot !== adjustedTimes.startTime
      });
    }
    
    res.json({
      success: true,
      meetings: previewMeetings,
      weekRange: `${start.toDateString()} - ${end.toDateString()}`,
      weekOf: `${start.toDateString()} - ${end.toDateString()}`, // Add weekOf for frontend compatibility
      totalNewMeetings: previewMeetings.filter(m => m.status === 'Will be created').length,
      totalExisting: previewMeetings.filter(m => m.status === 'Already exists').length,
      totalTemplates: Object.keys(mdMeetingTemplates.weekly).length,
      processedTemplates: previewMeetings.length
    });
    
  } catch (error) {
    console.error('Error previewing weekly MD meetings:', error);
    res.status(500).json({ error: 'Failed to preview weekly MD meetings' });
  }
};

/**
 * Generate weekly meetings for MD based on templates
 */
export const generateWeeklyMDMeetings = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const generatedMeetings = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Generate meetings for each week in the date range
    for (let currentWeek = new Date(start); currentWeek <= end; currentWeek.setDate(currentWeek.getDate() + 7)) {
      const weekStart = new Date(currentWeek);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      weekStart.setDate(diff);
      
      // Generate each weekly meeting
      for (const [templateKey, template] of Object.entries(mdMeetingTemplates.weekly)) {
        const meetingDate = new Date(weekStart);
        meetingDate.setDate(meetingDate.getDate() + template.dayOfWeek);
        
        console.log(`\n=== Processing ${templateKey} (${template.title}) ===`);
        console.log(`Template dayOfWeek: ${template.dayOfWeek}`);
        console.log(`Week start: ${weekStart.toISOString().split('T')[0]}`);
        console.log(`Meeting date: ${meetingDate.toISOString().split('T')[0]}`);
        console.log(`Range: ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`);
        console.log(`Original timeSlot: ${template.timeSlot}, duration: ${template.duration}`);
        
        // Skip if meeting date is outside our range
        if (meetingDate < start || meetingDate > end) {
          console.log(`❌ SKIPPED: Meeting date outside range`);
          continue;
        }
        
        // Apply MD scheduling constraints first
        const adjustedTimes = applyMDSchedulingConstraints(template.timeSlot, template.duration);
        console.log(`Adjusted times: ${adjustedTimes.startTime} - ${adjustedTimes.endTime}`);
        
        // Check if meeting already exists with adjusted time
        const existingMeeting = await db
          .select()
          .from(businessMeetings)
          .where(
            and(
              eq(businessMeetings.title, template.title),
              eq(businessMeetings.meetingDate, meetingDate.toISOString().split('T')[0]),
              eq(businessMeetings.startTime, adjustedTimes.startTime),
              eq(businessMeetings.organizerId, user.id)
            )
          );
          
        if (existingMeeting.length === 0) {
          console.log(`✅ CREATING: No duplicate found, proceeding with creation`);
          console.log(`🔥 Creating meeting: ${template.title} on ${meetingDate.toISOString().split('T')[0]} at ${adjustedTimes.startTime}`);
          
          const newMeeting = await db
            .insert(businessMeetings)
            .values({
              title: template.title,
              description: template.description,
              meetingType: template.meetingType,
              priority: template.priority,
              meetingDate: meetingDate.toISOString().split('T')[0],
              startTime: adjustedTimes.startTime,
              endTime: adjustedTimes.endTime,
              location: "Conference Room A",
              organizerId: user.id,
              createdBy: user.id,
              attendeeIds: [], // Will be populated based on roles
              status: "Scheduled",
              agenda: template.description,
              autoCreateGoogleMeet: true
            })
            .returning();
            
          generatedMeetings.push(newMeeting[0]);
          console.log(`✅ Successfully created meeting ID: ${newMeeting[0].id}`);
          
          // Auto-create Google Meet if user has Google Calendar connected
          try {
            const [organizer] = await db
              .select({
                googleCalendarConnected: users.googleCalendarConnected,
                googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
              })
              .from(users)
              .where(eq(users.id, user.id));
              
            if (organizer?.googleCalendarConnected && organizer?.googleCalendarSyncEnabled) {
              console.log(`🔗 Creating Google Calendar event for MD meeting ${newMeeting[0].id}`);
              
              const result = await googleCalendarService.createCalendarEvent(user.id, newMeeting[0]);
              
              if (result && result.eventId) {
                const updateData: any = { 
                  googleEventId: result.eventId,
                  googleCalendarSynced: true 
                };
                
                if (result.meetLink) {
                  updateData.googleMeetLink = result.meetLink;
                  updateData.googleMeetUrl = result.meetLink;
                  console.log(`🎥 Google Meet link generated: ${result.meetLink}`);
                }
                
                await db
                  .update(businessMeetings)
                  .set(updateData)
                  .where(eq(businessMeetings.id, newMeeting[0].id));
                  
                console.log(`📅 MD meeting synced to Google Calendar with event ID: ${result.eventId}`);
              } else {
                console.log(`⚠️ Failed to create Google Calendar event for MD meeting ${newMeeting[0].id}`);
              }
            } else {
              console.log(`⏭️ Google Calendar integration skipped - not connected or enabled`);
            }
          } catch (syncError) {
            console.error('❌ Error syncing MD meeting to Google Calendar:', syncError);
            // Don't fail meeting creation if calendar sync fails
          }
        } else {
          console.log(`⏭️ Skipping duplicate: ${template.title} on ${meetingDate.toISOString().split('T')[0]} at ${adjustedTimes.startTime}`);
        }
      }
    }
    
    res.json({
      success: true,
      message: `Generated ${generatedMeetings.length} weekly MD meetings`,
      meetings: generatedMeetings
    });
    
  } catch (error) {
    console.error('Error generating weekly MD meetings:', error);
    res.status(500).json({ error: 'Failed to generate weekly MD meetings' });
  }
};

/**
 * Preview monthly meetings for MD
 */
export const previewMonthlyMDMeetings = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { year, month } = req.body;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    const previewMeetings = [];
    
    for (const [templateKey, template] of Object.entries(mdMeetingTemplates.monthly)) {
      let meetingDate: Date;
      
      // Calculate meeting date based on monthly schedule
      if (template.monthlySchedule === "first-monday") {
        meetingDate = getFirstMondayOfMonth(year, month - 1);
      } else if (template.monthlySchedule === "third-wednesday") {
        meetingDate = getThirdWednesdayOfMonth(year, month - 1);
      } else {
        continue;
      }
      
      // Check if meeting already exists
      const existingMeeting = await db
        .select()
        .from(businessMeetings)
        .where(
          and(
            eq(businessMeetings.title, template.title),
            eq(businessMeetings.meetingDate, meetingDate.toISOString().split('T')[0]),
            eq(businessMeetings.startTime, template.timeSlot),
            eq(businessMeetings.organizerId, user.id)
          )
        );
        
      const [endHour, endMinute] = template.timeSlot.split(':').map(Number);
      const endTime = new Date(meetingDate);
      endTime.setHours(endHour, endMinute + template.duration);
      
      previewMeetings.push({
        title: template.title,
        description: template.description,
        meetingType: template.meetingType,
        priority: template.priority,
        meetingDate: meetingDate.toISOString().split('T')[0],
        startTime: template.timeSlot,
        endTime: `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`,
        duration: template.duration,
        monthlySchedule: template.monthlySchedule,
        status: existingMeeting.length > 0 ? 'Already exists' : 'Will be created'
      });
    }
    
    res.json({
      success: true,
      meetings: previewMeetings,
      monthYear: `${getMonthName(month)} ${year}`,
      totalNewMeetings: previewMeetings.filter(m => m.status === 'Will be created').length,
      totalExisting: previewMeetings.filter(m => m.status === 'Already exists').length
    });
    
  } catch (error) {
    console.error('Error previewing monthly MD meetings:', error);
    res.status(500).json({ error: 'Failed to preview monthly MD meetings' });
  }
};

/**
 * Generate monthly meetings for MD
 */
export const generateMonthlyMDMeetings = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { year, month } = req.body;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    const generatedMeetings = [];
    
    for (const [templateKey, template] of Object.entries(mdMeetingTemplates.monthly)) {
      let meetingDate: Date;
      
      // Calculate meeting date based on monthly schedule
      if (template.monthlySchedule === "first-monday") {
        meetingDate = getFirstMondayOfMonth(year, month - 1);
      } else if (template.monthlySchedule === "third-wednesday") {
        meetingDate = getThirdWednesdayOfMonth(year, month - 1);
      } else {
        continue;
      }
      
      // Check if meeting already exists with stronger duplicate check
      const existingMeeting = await db
        .select()
        .from(businessMeetings)
        .where(
          and(
            eq(businessMeetings.title, template.title),
            eq(businessMeetings.meetingDate, meetingDate.toISOString().split('T')[0]),
            eq(businessMeetings.startTime, template.timeSlot),
            eq(businessMeetings.organizerId, user.id)
          )
        );
        
      if (existingMeeting.length === 0) {
        const [endHour, endMinute] = template.timeSlot.split(':').map(Number);
        const endTime = new Date(meetingDate);
        endTime.setHours(endHour, endMinute + template.duration);
        
        const newMeeting = await db
          .insert(businessMeetings)
          .values({
            title: template.title,
            description: template.description,
            meetingType: template.meetingType,
            priority: template.priority,
            meetingDate: meetingDate.toISOString().split('T')[0],
            startTime: template.timeSlot,
            endTime: `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`,
            location: "Executive Conference Room",
            organizerId: user.id,
            createdBy: user.id,
            attendeeIds: [],
            status: "Scheduled",
            agenda: template.description,
            autoCreateGoogleMeet: true
          })
          .returning();
          
        generatedMeetings.push(newMeeting[0]);
        console.log(`✅ Successfully created monthly meeting ID: ${newMeeting[0].id}`);
        
        // Auto-create Google Meet if user has Google Calendar connected
        try {
          const [organizer] = await db
            .select({
              googleCalendarConnected: users.googleCalendarConnected,
              googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
            })
            .from(users)
            .where(eq(users.id, user.id));
            
          if (organizer?.googleCalendarConnected && organizer?.googleCalendarSyncEnabled) {
            console.log(`🔗 Creating Google Calendar event for monthly MD meeting ${newMeeting[0].id}`);
            
            const result = await googleCalendarService.createCalendarEvent(user.id, newMeeting[0]);
            
            if (result && result.eventId) {
              const updateData: any = { 
                googleEventId: result.eventId,
                googleCalendarSynced: true 
              };
              
              if (result.meetLink) {
                updateData.googleMeetLink = result.meetLink;
                updateData.googleMeetUrl = result.meetLink;
                console.log(`🎥 Google Meet link generated: ${result.meetLink}`);
              }
              
              await db
                .update(businessMeetings)
                .set(updateData)
                .where(eq(businessMeetings.id, newMeeting[0].id));
                
              console.log(`📅 Monthly MD meeting synced to Google Calendar with event ID: ${result.eventId}`);
            } else {
              console.log(`⚠️ Failed to create Google Calendar event for monthly MD meeting ${newMeeting[0].id}`);
            }
          } else {
            console.log(`⏭️ Google Calendar integration skipped - not connected or enabled`);
          }
        } catch (syncError) {
          console.error('❌ Error syncing monthly MD meeting to Google Calendar:', syncError);
          // Don't fail meeting creation if calendar sync fails
        }
      }
    }
    
    res.json({
      success: true,
      message: `Generated ${generatedMeetings.length} monthly MD meetings`,
      meetings: generatedMeetings
    });
    
  } catch (error) {
    console.error('Error generating monthly MD meetings:', error);
    res.status(500).json({ error: 'Failed to generate monthly MD meetings' });
  }
};

/**
 * Get MD meeting plan overview
 */
export const getMDMeetingPlanOverview = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date();
    const end = endDate ? new Date(endDate as string) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // Get all MD meetings in the date range
    const mdMeetings = await db
      .select()
      .from(businessMeetings)
      .where(
        and(
          eq(businessMeetings.organizerId, user.id),
          gte(businessMeetings.meetingDate, start.toISOString().split('T')[0]),
          lte(businessMeetings.meetingDate, end.toISOString().split('T')[0])
        )
      );
    
    // Categorize meetings by type
    const categorizedMeetings = {
      strategic: mdMeetings.filter(m => m.meetingType === 'Strategic'),
      marketing: mdMeetings.filter(m => m.meetingType === 'Marketing'),
      customerProjects: mdMeetings.filter(m => m.meetingType === 'Customer Projects'),
      executive: mdMeetings.filter(m => m.meetingType === 'Executive'),
      operations: mdMeetings.filter(m => m.meetingType === 'Operations'),
      external: mdMeetings.filter(m => m.meetingType === 'External Relations')
    };
    
    // Calculate time allocation
    const timeAllocation = {
      totalMeetings: mdMeetings.length,
      strategicHours: calculateMeetingHours(categorizedMeetings.strategic),
      marketingHours: calculateMeetingHours(categorizedMeetings.marketing),
      customerProjectHours: calculateMeetingHours(categorizedMeetings.customerProjects),
      executiveHours: calculateMeetingHours(categorizedMeetings.executive),
      operationsHours: calculateMeetingHours(categorizedMeetings.operations),
      externalHours: calculateMeetingHours(categorizedMeetings.external)
    };
    
    res.json({
      success: true,
      data: {
        meetings: categorizedMeetings,
        timeAllocation,
        templates: mdMeetingTemplates
      }
    });
    
  } catch (error) {
    console.error('Error getting MD meeting plan overview:', error);
    res.status(500).json({ error: 'Failed to get MD meeting plan overview' });
  }
};

// Helper functions
function getFirstMondayOfMonth(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return new Date(year, month, 1 + daysUntilMonday);
}

function getThirdWednesdayOfMonth(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay();
  const daysUntilWednesday = dayOfWeek <= 3 ? 3 - dayOfWeek : 10 - dayOfWeek;
  return new Date(year, month, 1 + daysUntilWednesday + 14); // Add 14 days for third occurrence
}

function calculateMeetingHours(meetings: any[]): number {
  return meetings.reduce((total, meeting) => {
    const [startHour, startMinute] = meeting.startTime.split(':').map(Number);
    const [endHour, endMinute] = meeting.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    return total + (endMinutes - startMinutes) / 60;
  }, 0);
}

function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || 'Unknown';
}