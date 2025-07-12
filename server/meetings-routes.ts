import { Request, Response } from 'express';
import { db } from './db';
import { eq, and, or, desc, asc, sql, gte, lte, ne, inArray } from 'drizzle-orm';
import { 
  businessMeetings, 
  meetingCommitments, 
  meetingAttendance,
  meetingReminders,
  meetingAnalytics,
  meetingKpiLinks,
  meetingTemplates,
  users,
  tasks,
  insertBusinessMeetingSchema,
  insertMeetingCommitmentSchema,
  insertMeetingAttendanceSchema,
  insertTaskSchema,
  type BusinessMeeting,
  type MeetingCommitment,
  type MeetingAttendance,
  type Task
} from '@shared/schema';
import { ensureAuthenticated } from './middlewares/auth';
import { googleCalendarService } from './google-calendar-service';
import { aiMeetingNotesService } from './ai-meeting-notes-service';
import { enhancedAIMeetingService } from './enhanced-ai-meeting-service';

// =============================================================================
// BUSINESS MEETINGS ENDPOINTS
// =============================================================================

/**
 * Get all meetings with filtering and pagination
 */
export const getMeetings = async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      type, 
      priority, 
      organizerId, 
      attendeeId,
      startDate, 
      endDate, 
      page = 1, 
      limit = 20,
      sortBy = 'meetingDate',
      sortOrder = 'desc'
    } = req.query;

    let query = db
      .select({
        meeting: businessMeetings,
        organizer: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(businessMeetings)
      .leftJoin(users, eq(businessMeetings.organizerId, users.id));

    // Apply filters
    const conditions = [];
    
    if (status) {
      conditions.push(eq(businessMeetings.status, status as string));
    }
    
    if (type) {
      conditions.push(eq(businessMeetings.meetingType, type as string));
    }
    
    if (priority) {
      conditions.push(eq(businessMeetings.priority, priority as string));
    }
    
    if (organizerId) {
      conditions.push(eq(businessMeetings.organizerId, parseInt(organizerId as string)));
    }
    
    if (attendeeId) {
      conditions.push(sql`${businessMeetings.attendeeIds} @> ${JSON.stringify([parseInt(attendeeId as string)])}`);
    }
    
    if (startDate) {
      conditions.push(gte(businessMeetings.meetingDate, startDate as string));
    }
    
    if (endDate) {
      conditions.push(lte(businessMeetings.meetingDate, endDate as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    const orderBy = sortOrder === 'asc' ? asc : desc;
    if (sortBy === 'meetingDate') {
      query = query.orderBy(orderBy(businessMeetings.meetingDate));
    } else if (sortBy === 'title') {
      query = query.orderBy(orderBy(businessMeetings.title));
    } else if (sortBy === 'priority') {
      query = query.orderBy(orderBy(businessMeetings.priority));
    } else {
      query = query.orderBy(orderBy(businessMeetings.createdAt));
    }

    // Apply pagination
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    query = query.limit(parseInt(limit as string)).offset(offset);

    const results = await query;

    // Get total count for pagination
    const totalQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(businessMeetings);
    
    if (conditions.length > 0) {
      totalQuery.where(and(...conditions));
    }
    
    const [{ count }] = await totalQuery;

    res.json({
      meetings: results,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
};

/**
 * Get meeting by ID with full details
 */
export const getMeetingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid meeting ID' });
    }

    const [meeting] = await db
      .select({
        meeting: businessMeetings,
        organizer: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(businessMeetings)
      .leftJoin(users, eq(businessMeetings.organizerId, users.id))
      .where(eq(businessMeetings.id, parseInt(id)));

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Get meeting commitments
    const commitments = await db
      .select({
        commitment: meetingCommitments,
        assignedTo: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(meetingCommitments)
      .leftJoin(users, eq(meetingCommitments.assignedToId, users.id))
      .where(eq(meetingCommitments.meetingId, parseInt(id)))
      .orderBy(desc(meetingCommitments.dueDate));

    // Get attendance records
    const attendance = await db
      .select({
        attendance: meetingAttendance,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(meetingAttendance)
      .leftJoin(users, eq(meetingAttendance.userId, users.id))
      .where(eq(meetingAttendance.meetingId, parseInt(id)));

    res.json({
      ...meeting,
      commitments,
      attendance
    });
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
};

/**
 * Create new meeting
 */
export const createMeeting = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const validatedData = insertBusinessMeetingSchema.parse({
      ...req.body,
      organizerId: user.id,
      createdBy: user.id,
    });

    // Calculate duration if start and end times provided
    if (validatedData.startTime && validatedData.endTime) {
      const [startHour, startMin] = validatedData.startTime.split(':').map(Number);
      const [endHour, endMin] = validatedData.endTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      validatedData.duration = endMinutes - startMinutes;
    }

    const [meeting] = await db
      .insert(businessMeetings)
      .values(validatedData)
      .returning();

    // Create attendance records for internal attendees
    if (validatedData.attendeeIds && validatedData.attendeeIds.length > 0) {
      const attendanceData = validatedData.attendeeIds.map((attendeeId: number) => ({
        meetingId: meeting.id,
        userId: attendeeId,
        status: 'Invited' as const,
      }));

      await db.insert(meetingAttendance).values(attendanceData);
    }

    // Auto-sync to Google Calendar and create Google Meet link if requested
    let googleMeetLink = null;
    let googleCalendarConnected = false;
    
    try {
      const [organizer] = await db
        .select({
          googleCalendarConnected: users.googleCalendarConnected,
          googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
        })
        .from(users)
        .where(eq(users.id, user.id));

      googleCalendarConnected = organizer?.googleCalendarConnected || false;

      // Auto-create Google Meet if user requested it and has Google Calendar connected
      if (validatedData.autoCreateGoogleMeet && organizer?.googleCalendarConnected && organizer?.googleCalendarSyncEnabled) {
        console.log(`Attempting to create Google Calendar event for meeting ${meeting.id} with Google Meet enabled`);
        
        const result = await googleCalendarService.createCalendarEvent(user.id, meeting);
        
        if (result && result.eventId) {
          // Update meeting with Google event ID, sync status, and Meet link
          const updateData: any = { 
            googleEventId: result.eventId,
            googleCalendarSynced: true 
          };
          
          if (result.meetLink) {
            updateData.googleMeetLink = result.meetLink;
            updateData.googleMeetUrl = result.meetLink; // Store in both fields for compatibility
            googleMeetLink = result.meetLink;
          }
          
          await db
            .update(businessMeetings)
            .set(updateData)
            .where(eq(businessMeetings.id, meeting.id));
          
          console.log(`Meeting ${meeting.id} automatically synced to Google Calendar with event ID: ${result.eventId}`);
          if (googleMeetLink) {
            console.log(`Google Meet link automatically generated: ${googleMeetLink}`);
          } else {
            console.log(`Warning: Google Calendar event created but no Meet link was generated`);
          }
        } else {
          console.log(`Failed to create Google Calendar event for meeting ${meeting.id}`);
        }
      } else {
        console.log(`Google Meet auto-creation skipped for meeting ${meeting.id}. AutoCreate: ${validatedData.autoCreateGoogleMeet}, Connected: ${organizer?.googleCalendarConnected}, Sync: ${organizer?.googleCalendarSyncEnabled}`);
      }
    } catch (syncError) {
      console.error('Error auto-syncing meeting to Google Calendar:', syncError);
      // Don't fail meeting creation if calendar sync fails
    }

    res.status(201).json({
      ...meeting,
      googleMeetLink,
      googleCalendarConnected,
      autoCreated: !!googleMeetLink
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
};

/**
 * Update meeting
 */
export const updateMeeting = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = insertBusinessMeetingSchema.partial().parse(req.body);

    // Calculate duration if start and end times provided
    if (validatedData.startTime && validatedData.endTime) {
      const [startHour, startMin] = validatedData.startTime.split(':').map(Number);
      const [endHour, endMin] = validatedData.endTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      validatedData.duration = endMinutes - startMinutes;
    }

    // Get original meeting data for Google Calendar sync
    const [originalMeeting] = await db
      .select()
      .from(businessMeetings)
      .where(eq(businessMeetings.id, parseInt(id)));

    if (!originalMeeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const [meeting] = await db
      .update(businessMeetings)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(businessMeetings.id, parseInt(id)))
      .returning();

    // Auto-sync updates to Google Calendar if meeting was previously synced
    try {
      if (originalMeeting.googleEventId && originalMeeting.googleCalendarSynced) {
        const user = req.user as any;
        
        // Check if organizer still has calendar connected
        const [organizer] = await db
          .select({
            googleCalendarConnected: users.googleCalendarConnected,
            googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
          })
          .from(users)
          .where(eq(users.id, originalMeeting.organizerId));

        if (organizer?.googleCalendarConnected && organizer?.googleCalendarSyncEnabled) {
          const success = await googleCalendarService.updateCalendarEvent(
            originalMeeting.organizerId, 
            originalMeeting.googleEventId, 
            meeting
          );
          
          if (success) {
            console.log(`Meeting ${meeting.id} automatically updated in Google Calendar`);
          } else {
            console.log(`Failed to update meeting ${meeting.id} in Google Calendar`);
          }
        }
      }
    } catch (syncError) {
      console.error('Error auto-syncing meeting update to Google Calendar:', syncError);
      // Don't fail meeting update if calendar sync fails
    }

    res.json(meeting);
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
};

/**
 * Delete meeting
 */
export const deleteMeeting = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get meeting data before deletion for Google Calendar sync
    const [meetingToDelete] = await db
      .select()
      .from(businessMeetings)
      .where(eq(businessMeetings.id, parseInt(id)));

    if (!meetingToDelete) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Delete from Google Calendar if it was synced
    try {
      if (meetingToDelete.googleEventId && meetingToDelete.googleCalendarSynced) {
        // Check if organizer still has calendar connected
        const [organizer] = await db
          .select({
            googleCalendarConnected: users.googleCalendarConnected,
            googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
          })
          .from(users)
          .where(eq(users.id, meetingToDelete.organizerId));

        if (organizer?.googleCalendarConnected) {
          const success = await googleCalendarService.deleteCalendarEvent(
            meetingToDelete.organizerId, 
            meetingToDelete.googleEventId, 
            meetingToDelete.id
          );
          
          if (success) {
            console.log(`Meeting ${meetingToDelete.id} automatically deleted from Google Calendar`);
          } else {
            console.log(`Failed to delete meeting ${meetingToDelete.id} from Google Calendar`);
          }
        }
      }
    } catch (syncError) {
      console.error('Error auto-deleting meeting from Google Calendar:', syncError);
      // Don't fail meeting deletion if calendar sync fails
    }

    const [deletedMeeting] = await db
      .delete(businessMeetings)
      .where(eq(businessMeetings.id, parseInt(id)))
      .returning();

    res.json({ message: 'Meeting deleted successfully' });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
};

// =============================================================================
// MEETING COMMITMENTS ENDPOINTS
// =============================================================================

/**
 * Get commitments with filtering
 */
export const getCommitments = async (req: Request, res: Response) => {
  try {
    const {
      meetingId,
      assignedToId,
      status,
      priority,
      overdue,
      page = 1,
      limit = 20
    } = req.query;

    console.log('getCommitments called with params:', { meetingId, assignedToId, status, priority, overdue, page, limit });
    
    // Log user info for debugging
    const user = req.user as any;
    console.log('User in getCommitments:', user ? { id: user.id, username: user.username } : 'No user found');

    let query = db
      .select({
        commitment: meetingCommitments,
        assignedTo: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        meeting: {
          id: businessMeetings.id,
          title: businessMeetings.title,
          meetingDate: businessMeetings.meetingDate,
        }
      })
      .from(meetingCommitments)
      .leftJoin(users, eq(meetingCommitments.assignedToId, users.id))
      .leftJoin(businessMeetings, 
        and(
          eq(meetingCommitments.meetingId, businessMeetings.id),
          eq(meetingCommitments.meetingType, 'internal')
        )
      );

    const conditions = [];

    if (meetingId && meetingId !== '' && !isNaN(parseInt(meetingId as string))) {
      conditions.push(eq(meetingCommitments.meetingId, parseInt(meetingId as string)));
    }

    if (assignedToId && assignedToId !== '' && !isNaN(parseInt(assignedToId as string))) {
      conditions.push(eq(meetingCommitments.assignedToId, parseInt(assignedToId as string)));
    }

    if (status && status !== 'all') {
      conditions.push(eq(meetingCommitments.status, status as string));
    }

    if (priority && priority !== 'all') {
      conditions.push(eq(meetingCommitments.priority, priority as string));
    }

    if (overdue === 'true') {
      conditions.push(
        and(
          ne(meetingCommitments.status, 'Completed'),
          sql`${meetingCommitments.dueDate} < CURRENT_DATE`
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply pagination
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    query = query
      .orderBy(asc(meetingCommitments.dueDate))
      .limit(parseInt(limit as string))
      .offset(offset);

    const results = await query;

    res.json({ commitments: results });
  } catch (error) {
    console.error('Error fetching commitments:', error);
    res.status(500).json({ error: 'Failed to fetch commitments' });
  }
};

/**
 * Get user's pending commitments for dashboard
 */
export const getUserPendingCommitments = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { limit = 10 } = req.query;

    const pendingCommitments = await db
      .select({
        commitment: meetingCommitments,
        meeting: {
          id: businessMeetings.id,
          title: businessMeetings.title,
          meetingDate: businessMeetings.meetingDate,
        }
      })
      .from(meetingCommitments)
      .leftJoin(businessMeetings, 
        and(
          eq(meetingCommitments.meetingId, businessMeetings.id),
          eq(meetingCommitments.meetingType, 'internal')
        )
      )
      .where(
        and(
          eq(meetingCommitments.assignedToId, user.id),
          or(
            eq(meetingCommitments.status, 'Pending'),
            eq(meetingCommitments.status, 'In Progress'),
            eq(meetingCommitments.status, 'Overdue')
          )
        )
      )
      .orderBy(asc(meetingCommitments.dueDate))
      .limit(parseInt(limit as string));

    // Mark overdue commitments
    const now = new Date();
    const commitmentsWithOverdue = pendingCommitments.map(item => ({
      ...item,
      isOverdue: new Date(item.commitment.dueDate) < now && item.commitment.status !== 'Completed'
    }));

    res.json({ commitments: commitmentsWithOverdue });
  } catch (error) {
    console.error('Error fetching user commitments:', error);
    res.status(500).json({ error: 'Failed to fetch user commitments' });
  }
};

/**
 * Create commitment and automatically generate linked task
 */
export const createCommitment = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const validatedData = insertMeetingCommitmentSchema.parse({
      ...req.body,
      assignedById: user.id,
      createdBy: user.id,
    });

    // Start database transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      // Create the meeting commitment
      const [commitment] = await tx
        .insert(meetingCommitments)
        .values(validatedData)
        .returning();

      // Get meeting details for task description based on meeting type
      let meetingTitle = 'Unknown Meeting';
      if (commitment.meetingType === 'internal' && commitment.meetingId) {
        const [meeting] = await tx
          .select()
          .from(businessMeetings)
          .where(eq(businessMeetings.id, commitment.meetingId));
        meetingTitle = meeting?.title || 'Internal Meeting';
      } else if (commitment.meetingType === 'google_calendar') {
        meetingTitle = commitment.meetingTitle || 'Google Calendar Event';
      }

      // Automatically create a linked task from the commitment
      const taskData = {
        title: commitment.title,
        description: commitment.description || `Task generated from meeting commitment: ${commitment.title}`,
        status: 'pending',
        priority: commitment.priority || 'Medium',
        startDate: new Date().toISOString().split('T')[0],
        finishDate: commitment.dueDate,
        dueDate: commitment.dueDate,
        assignedTo: commitment.assignedToId,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        category: 'Meeting Follow-up',
        sourceType: 'meeting_commitment' as const,
        sourceId: commitment.id
      };

      const [task] = await tx
        .insert(tasks)
        .values(taskData)
        .returning();

      return { commitment, task, meetingTitle };
    });

    console.log(`Automatically created task ID ${result.task.id} for meeting commitment ID ${result.commitment.id} from meeting "${result.meetingTitle}"`);

    res.status(201).json({
      commitment: result.commitment,
      linkedTask: result.task,
      message: `Commitment created and task automatically generated (Task ID: ${result.task.id})`
    });
  } catch (error) {
    console.error('Error creating commitment:', error);
    res.status(500).json({ error: 'Failed to create commitment and linked task' });
  }
};

/**
 * Update commitment with bidirectional task synchronization
 */
export const updateCommitment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = insertMeetingCommitmentSchema.partial().parse(req.body);

    // If status is being updated to Completed, set completion date
    if (validatedData.status === 'Completed' && !validatedData.completionDate) {
      validatedData.completionDate = new Date().toISOString().split('T')[0];
    }

    // Start database transaction for bidirectional sync
    const result = await db.transaction(async (tx) => {
      // Update the commitment
      const [commitment] = await tx
        .update(meetingCommitments)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(meetingCommitments.id, parseInt(id)))
        .returning();

      if (!commitment) {
        throw new Error('Commitment not found');
      }

      // Find and update linked task if it exists
      const linkedTasks = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.sourceType, 'meeting_commitment'),
            eq(tasks.sourceId, commitment.id)
          )
        );

      if (linkedTasks.length > 0) {
        const linkedTask = linkedTasks[0];
        
        // Sync status between commitment and task
        let taskStatus = linkedTask.status;
        if (validatedData.status) {
          switch (validatedData.status) {
            case 'Pending':
              taskStatus = 'pending';
              break;
            case 'In Progress':
              taskStatus = 'in_progress';
              break;
            case 'Completed':
              taskStatus = 'completed';
              break;
            case 'Overdue':
              taskStatus = 'pending'; // Keep as pending but mark overdue
              break;
            case 'On Hold':
              taskStatus = 'on_hold';
              break;
            case 'Cancelled':
              taskStatus = 'canceled';
              break;
          }
        }

        // Update linked task with synchronized data
        const taskUpdateData = {
          ...(validatedData.title && { title: validatedData.title }),
          ...(validatedData.description && { description: validatedData.description }),
          ...(validatedData.priority && { priority: validatedData.priority }),
          ...(validatedData.dueDate && { 
            dueDate: validatedData.dueDate,
            finishDate: validatedData.dueDate 
          }),
          ...(validatedData.status && { status: taskStatus }),
          ...(validatedData.status === 'Completed' && { 
            completedAt: new Date().toISOString() 
          })
        };

        const [updatedTask] = await tx
          .update(tasks)
          .set(taskUpdateData)
          .where(eq(tasks.id, linkedTask.id))
          .returning();

        console.log(`Synchronized task ID ${updatedTask.id} with commitment ID ${commitment.id} - Status: ${taskStatus}`);

        return { commitment, linkedTask: updatedTask };
      }

      return { commitment, linkedTask: null };
    });

    res.json({
      commitment: result.commitment,
      linkedTask: result.linkedTask,
      message: result.linkedTask 
        ? `Commitment updated and linked task synchronized (Task ID: ${result.linkedTask.id})`
        : 'Commitment updated (no linked task found)'
    });
  } catch (error) {
    console.error('Error updating commitment:', error);
    res.status(500).json({ error: 'Failed to update commitment' });
  }
};

/**
 * Delete commitment
 */
export const deleteCommitment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [deletedCommitment] = await db
      .delete(meetingCommitments)
      .where(eq(meetingCommitments.id, parseInt(id)))
      .returning();

    if (!deletedCommitment) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    res.json({ message: 'Commitment deleted successfully' });
  } catch (error) {
    console.error('Error deleting commitment:', error);
    res.status(500).json({ error: 'Failed to delete commitment' });
  }
};

// =============================================================================
// DASHBOARD & ANALYTICS ENDPOINTS
// =============================================================================

/**
 * Get dashboard statistics for user
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { period = '30' } = req.query; // Days to look back

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period as string));

    // Get meeting statistics
    const meetingStats = await db
      .select({
        total: sql<number>`count(*)`,
        organized: sql<number>`count(*) filter (where ${businessMeetings.organizerId} = ${user.id})`,
        attended: sql<number>`count(*) filter (where ${businessMeetings.attendeeIds} @> ${JSON.stringify([user.id])})`
      })
      .from(businessMeetings)
      .where(gte(businessMeetings.meetingDate, startDate.toISOString().split('T')[0]));

    // Get commitment statistics
    const commitmentStats = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${meetingCommitments.status} = 'Pending')`,
        inProgress: sql<number>`count(*) filter (where ${meetingCommitments.status} = 'In Progress')`,
        completed: sql<number>`count(*) filter (where ${meetingCommitments.status} = 'Completed')`,
        overdue: sql<number>`count(*) filter (where ${meetingCommitments.status} = 'Overdue' or (${meetingCommitments.dueDate} < current_date and ${meetingCommitments.status} != 'Completed'))`
      })
      .from(meetingCommitments)
      .where(eq(meetingCommitments.assignedToId, user.id));

    res.json({
      meetings: meetingStats[0] || { total: 0, organized: 0, attended: 0 },
      commitments: commitmentStats[0] || { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

/**
 * Get upcoming meetings for user
 */
export const getUpcomingMeetings = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { limit = 5 } = req.query;

    const upcomingMeetings = await db
      .select({
        meeting: businessMeetings,
        organizer: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(businessMeetings)
      .leftJoin(users, eq(businessMeetings.organizerId, users.id))
      .where(
        and(
          or(
            eq(businessMeetings.organizerId, user.id),
            sql`${businessMeetings.attendeeIds} @> ${JSON.stringify([user.id])}`
          ),
          gte(businessMeetings.meetingDate, new Date().toISOString().split('T')[0]),
          eq(businessMeetings.status, 'Scheduled')
        )
      )
      .orderBy(asc(businessMeetings.meetingDate), asc(businessMeetings.startTime))
      .limit(parseInt(limit as string));

    res.json({ meetings: upcomingMeetings });
  } catch (error) {
    console.error('Error fetching upcoming meetings:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming meetings' });
  }
};

/**
 * Manually sync meeting to Google Calendar (for existing meetings)
 */
export const syncMeetingToGoogleCalendar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user as any;

    // Get meeting details
    const [meeting] = await db
      .select()
      .from(businessMeetings)
      .where(eq(businessMeetings.id, parseInt(id)));

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Check if user is the organizer
    if (meeting.organizerId !== user.id) {
      return res.status(403).json({ error: 'Only the meeting organizer can sync to Google Calendar' });
    }

    // Get organizer's Google Calendar connection status
    const [organizer] = await db
      .select({
        googleCalendarConnected: users.googleCalendarConnected,
        googleCalendarSyncEnabled: users.googleCalendarSyncEnabled
      })
      .from(users)
      .where(eq(users.id, meeting.organizerId));

    if (!organizer?.googleCalendarConnected) {
      return res.status(400).json({ error: 'Google Calendar not connected for organizer' });
    }

    // Create Google Calendar event
    const eventResult = await googleCalendarService.createCalendarEvent(
      meeting.organizerId,
      meeting.title,
      meeting.description || '',
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
        .where(eq(businessMeetings.id, parseInt(id)))
        .returning();

      console.log(`Successfully synced meeting ${id} to Google Calendar. Event ID: ${eventResult.eventId}, Meet Link: ${eventResult.meetLink}`);

      res.json({
        success: true,
        message: 'Meeting successfully synced to Google Calendar',
        meeting: updatedMeeting,
        googleEventId: eventResult.eventId,
        googleMeetLink: eventResult.meetLink
      });
    } else {
      console.error(`Failed to sync meeting ${id} to Google Calendar:`, eventResult.error);
      res.status(500).json({ 
        error: 'Failed to create Google Calendar event',
        details: eventResult.error 
      });
    }
  } catch (error) {
    console.error('Error syncing meeting to Google Calendar:', error);
    res.status(500).json({ error: 'Failed to sync meeting to Google Calendar' });
  }
};

// =============================================================================
// REMINDER & ESCALATION ENDPOINTS
// =============================================================================

/**
 * Send reminder for commitment
 */
export const sendCommitmentReminder = async (req: Request, res: Response) => {
  try {
    const { commitmentId } = req.params;
    const { message, deliveryMethod = 'email' } = req.body;

    // Get commitment details
    const [commitment] = await db
      .select()
      .from(meetingCommitments)
      .where(eq(meetingCommitments.id, parseInt(commitmentId)));

    if (!commitment) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    // Create reminder record
    const [reminder] = await db
      .insert(meetingReminders)
      .values({
        commitmentId: commitment.id,
        reminderType: 'commitment_due',
        recipientId: commitment.assignedToId,
        reminderMessage: message || `Reminder: Commitment "${commitment.title}" is due on ${commitment.dueDate}`,
        deliveryMethod: deliveryMethod as 'email' | 'sms' | 'push' | 'in_app',
      })
      .returning();

    // Update last reminder sent timestamp
    await db
      .update(meetingCommitments)
      .set({ lastReminderSent: new Date() })
      .where(eq(meetingCommitments.id, parseInt(commitmentId)));

    res.json({ 
      message: 'Reminder sent successfully',
      reminder 
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
};

/**
 * Escalate overdue commitment to manager
 */
export const escalateCommitment = async (req: Request, res: Response) => {
  try {
    const { commitmentId } = req.params;

    // Get commitment and assignee details
    const [result] = await db
      .select({
        commitment: meetingCommitments,
        assignee: users,
      })
      .from(meetingCommitments)
      .leftJoin(users, eq(meetingCommitments.assignedToId, users.id))
      .where(eq(meetingCommitments.id, parseInt(commitmentId)));

    if (!result) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    const { commitment, assignee } = result;

    // Get reporting manager
    if (!assignee.reportingManagerId) {
      return res.status(400).json({ error: 'No reporting manager found for assignee' });
    }

    // Create escalation reminder
    const escalationMessage = `Escalation: Commitment "${commitment.title}" assigned to ${assignee.username} is overdue (due date: ${commitment.dueDate}). Please follow up.`;

    const [reminder] = await db
      .insert(meetingReminders)
      .values({
        commitmentId: commitment.id,
        reminderType: 'escalation',
        recipientId: assignee.reportingManagerId,
        reminderMessage: escalationMessage,
        deliveryMethod: 'email',
      })
      .returning();

    // Update escalation status
    await db
      .update(meetingCommitments)
      .set({ 
        escalationSent: true,
        escalatedAt: new Date(),
        escalatedToId: assignee.reportingManagerId
      })
      .where(eq(meetingCommitments.id, parseInt(commitmentId)));

    res.json({ 
      message: 'Commitment escalated to manager successfully',
      escalation: reminder 
    });
  } catch (error) {
    console.error('Error escalating commitment:', error);
    res.status(500).json({ error: 'Failed to escalate commitment' });
  }
};

// =============================================================================
// TASK INTEGRATION ENDPOINTS
// =============================================================================

/**
 * Get tasks linked to meeting commitments for a specific meeting
 */
export const getMeetingTasks = async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;

    // Get all commitments for this meeting and their linked tasks
    const results = await db
      .select({
        commitment: meetingCommitments,
        task: tasks,
        assignedTo: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(meetingCommitments)
      .leftJoin(
        tasks, 
        and(
          eq(tasks.sourceType, 'meeting_commitment'),
          eq(tasks.sourceId, meetingCommitments.id)
        )
      )
      .leftJoin(users, eq(meetingCommitments.assignedToId, users.id))
      .where(eq(meetingCommitments.meetingId, parseInt(meetingId)));

    res.json({ meetingTasks: results });
  } catch (error) {
    console.error('Error fetching meeting tasks:', error);
    res.status(500).json({ error: 'Failed to fetch meeting tasks' });
  }
};

/**
 * Get all tasks generated from meeting commitments
 */
export const getCommitmentTasks = async (req: Request, res: Response) => {
  try {
    const { assignedToId, status, page = 1, limit = 20 } = req.query;

    let query = db
      .select({
        task: tasks,
        commitment: meetingCommitments,
        meeting: {
          id: businessMeetings.id,
          title: businessMeetings.title,
          meetingDate: businessMeetings.meetingDate,
        },
        assignedTo: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(tasks)
      .innerJoin(
        meetingCommitments,
        eq(tasks.sourceId, meetingCommitments.id)
      )
      .leftJoin(businessMeetings, eq(meetingCommitments.meetingId, businessMeetings.id))
      .leftJoin(users, eq(tasks.assignedTo, users.id))
      .where(eq(tasks.sourceType, 'meeting_commitment'));

    const conditions = [eq(tasks.sourceType, 'meeting_commitment')];

    if (assignedToId) {
      conditions.push(eq(tasks.assignedTo, parseInt(assignedToId as string)));
    }

    if (status) {
      conditions.push(eq(tasks.status, status as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply pagination
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    query = query
      .orderBy(asc(tasks.dueDate))
      .limit(parseInt(limit as string))
      .offset(offset);

    const results = await query;

    res.json({ commitmentTasks: results });
  } catch (error) {
    console.error('Error fetching commitment tasks:', error);
    res.status(500).json({ error: 'Failed to fetch commitment tasks' });
  }
};

// =============================================================================
// AI MEETING NOTES ENDPOINTS
// =============================================================================

/**
 * Enable recording for a meeting
 */
export const enableMeetingRecording = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const success = await aiMeetingNotesService.enableMeetingRecording(parseInt(id));
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Recording enabled for meeting. Google Meet will automatically record when the meeting starts.' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to enable recording' 
      });
    }
  } catch (error) {
    console.error('Error enabling meeting recording:', error);
    res.status(500).json({ error: 'Failed to enable meeting recording' });
  }
};

/**
 * Process AI notes from Google Meet transcript
 */
export const processAIMeetingNotes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { transcriptUrl, recordingUrl } = req.body;
    
    const success = await aiMeetingNotesService.processAINotesFromTranscript(
      parseInt(id), 
      transcriptUrl, 
      recordingUrl
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'AI meeting notes processing initiated. Notes will be available once Google Meet completes processing.' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process AI meeting notes' 
      });
    }
  } catch (error) {
    console.error('Error processing AI meeting notes:', error);
    res.status(500).json({ error: 'Failed to process AI meeting notes' });
  }
};

/**
 * Update AI-generated content (called by Google Meet webhook or manual update)
 */
export const updateAIGeneratedContent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { aiSummary, aiActionItems, aiKeyPoints } = req.body;
    
    const success = await aiMeetingNotesService.updateAIGeneratedContent(
      parseInt(id),
      aiSummary,
      aiActionItems || [],
      aiKeyPoints || []
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'AI-generated meeting content updated successfully' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update AI-generated content' 
      });
    }
  } catch (error) {
    console.error('Error updating AI-generated content:', error);
    res.status(500).json({ error: 'Failed to update AI-generated content' });
  }
};

/**
 * Generate AI notes from meeting content (enhanced version)
 */
export const generateAINotesFromContent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, inputType, context } = req.body;

    if (!content || !inputType) {
      return res.status(400).json({
        success: false,
        error: 'Content and input type are required'
      });
    }

    const success = await enhancedAIMeetingService.processInternalMeetingNotes(
      parseInt(id),
      content,
      inputType,
      context || {}
    );

    if (success) {
      res.json({
        success: true,
        message: 'AI notes generated successfully from content'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to generate AI notes'
      });
    }
  } catch (error) {
    console.error('Error generating AI notes from content:', error);
    res.status(500).json({ error: 'Failed to generate AI notes from content' });
  }
};

/**
 * Analyze Google Calendar event for AI insights
 */
export const analyzeGoogleCalendarEvent = async (req: Request, res: Response) => {
  try {
    const { eventId, title, description, attendees } = req.body;

    if (!eventId || !title) {
      return res.status(400).json({
        success: false,
        error: 'Event ID and title are required'
      });
    }

    const aiNotes = await enhancedAIMeetingService.generateNotesForGoogleCalendarEvent(
      eventId,
      title,
      description || '',
      attendees || []
    );

    res.json({
      success: true,
      data: aiNotes
    });
  } catch (error) {
    console.error('Error analyzing Google Calendar event:', error);
    res.status(500).json({ error: 'Failed to analyze Google Calendar event' });
  }
};

/**
 * Get meeting analytics dashboard data
 */
export const getMeetingAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateRange = {
      start: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: endDate ? new Date(endDate as string) : new Date()
    };

    const analytics = await enhancedAIMeetingService.getMeetingAnalytics(dateRange);

    if (analytics) {
      res.json({
        success: true,
        data: analytics
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch meeting analytics'
      });
    }
  } catch (error) {
    console.error('Error fetching meeting analytics:', error);
    res.status(500).json({ error: 'Failed to fetch meeting analytics' });
  }
};

/**
 * Get AI meeting notes for a specific meeting
 */
export const getAIMeetingNotes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const aiNotes = await aiMeetingNotesService.getAIMeetingNotes(parseInt(id));
    
    if (aiNotes) {
      res.json({ 
        success: true, 
        data: aiNotes 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'AI meeting notes not found' 
      });
    }
  } catch (error) {
    console.error('Error fetching AI meeting notes:', error);
    res.status(500).json({ error: 'Failed to fetch AI meeting notes' });
  }
};

/**
 * Generate Google Meet link for a meeting
 */
export const generateGoogleMeetLink = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const meetingId = parseInt(id);
    const user = req.user as any;
    
    // Get the meeting details
    const [meeting] = await db
      .select()
      .from(businessMeetings)
      .where(eq(businessMeetings.id, meetingId));
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    if (meeting.googleMeetLink) {
      return res.json({ 
        success: true,
        googleMeetLink: meeting.googleMeetLink,
        message: 'Google Meet link already exists for this meeting'
      });
    }
    
    // Generate Google Meet link using Google Calendar service with user ID
    const googleMeetLink = await googleCalendarService.generateMeetLink(meeting, user.id);
    
    if (!googleMeetLink) {
      return res.status(400).json({ 
        error: 'Google Calendar not connected',
        message: 'Please connect your Google Calendar first to generate real Google Meet links',
        requiresConnection: true,
        settingsUrl: '/google-calendar-settings'
      });
    }
    
    res.json({
      success: true,
      googleMeetLink: googleMeetLink,
      meeting: meeting,
      message: 'Real Google Meet link generated and calendar event created successfully'
    });
  } catch (error) {
    console.error('Error generating Google Meet link:', error);
    
    if (error instanceof Error && error.message === 'GOOGLE_CALENDAR_NOT_CONNECTED') {
      return res.status(400).json({ 
        error: 'Google Calendar not connected',
        message: 'Please connect your Google Calendar first to generate real Google Meet links',
        requiresConnection: true,
        settingsUrl: '/google-calendar-settings'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to generate Google Meet link',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};