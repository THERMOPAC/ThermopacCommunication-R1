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
  insertBusinessMeetingSchema,
  insertMeetingCommitmentSchema,
  insertMeetingAttendanceSchema,
  type BusinessMeeting,
  type MeetingCommitment,
  type MeetingAttendance
} from '@shared/schema';
import { ensureAuthenticated } from './middlewares/auth';

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

    res.status(201).json(meeting);
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

    const [meeting] = await db
      .update(businessMeetings)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(businessMeetings.id, parseInt(id)))
      .returning();

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
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

    const [deletedMeeting] = await db
      .delete(businessMeetings)
      .where(eq(businessMeetings.id, parseInt(id)))
      .returning();

    if (!deletedMeeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

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
      .leftJoin(businessMeetings, eq(meetingCommitments.meetingId, businessMeetings.id));

    const conditions = [];

    if (meetingId) {
      conditions.push(eq(meetingCommitments.meetingId, parseInt(meetingId as string)));
    }

    if (assignedToId) {
      conditions.push(eq(meetingCommitments.assignedToId, parseInt(assignedToId as string)));
    }

    if (status) {
      conditions.push(eq(meetingCommitments.status, status as string));
    }

    if (priority) {
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
      .leftJoin(businessMeetings, eq(meetingCommitments.meetingId, businessMeetings.id))
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
 * Create commitment
 */
export const createCommitment = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const validatedData = insertMeetingCommitmentSchema.parse({
      ...req.body,
      assignedById: user.id,
      createdBy: user.id,
    });

    const [commitment] = await db
      .insert(meetingCommitments)
      .values(validatedData)
      .returning();

    res.status(201).json(commitment);
  } catch (error) {
    console.error('Error creating commitment:', error);
    res.status(500).json({ error: 'Failed to create commitment' });
  }
};

/**
 * Update commitment
 */
export const updateCommitment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = insertMeetingCommitmentSchema.partial().parse(req.body);

    // If status is being updated to Completed, set completion date
    if (validatedData.status === 'Completed' && !validatedData.completionDate) {
      validatedData.completionDate = new Date().toISOString().split('T')[0];
    }

    const [commitment] = await db
      .update(meetingCommitments)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(meetingCommitments.id, parseInt(id)))
      .returning();

    if (!commitment) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    res.json(commitment);
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

// All functions are already exported above, no need for duplicate export block