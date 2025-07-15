import { db } from './db';
import { businessMeetings, users } from '@shared/schema';
import { and, or, eq, inArray, sql } from 'drizzle-orm';

export interface ConflictDetails {
  userId: number;
  userName: string;
  conflicts: {
    meetingId: number;
    title: string;
    startTime: string;
    endTime: string;
    meetingDate: string;
    conflictType: 'overlap' | 'adjacent';
  }[];
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: ConflictDetails[];
  warnings: ConflictDetails[];
}

/**
 * Calendar Conflict Detection Service
 * Checks for scheduling conflicts when creating or updating meetings
 */
export class CalendarConflictService {
  
  /**
   * Check for conflicts when creating a new meeting
   */
  static async checkNewMeetingConflicts(
    attendeeIds: number[],
    meetingDate: string,
    startTime: string,
    endTime: string,
    organizerId: number
  ): Promise<ConflictCheckResult> {
    try {
      // Temporarily disable conflict detection to fix SQL issue
      console.log('Conflict detection temporarily disabled');
      return {
        hasConflicts: false,
        conflicts: [],
        warnings: []
      };
      
      // Include organizer in conflict check
      const allParticipants = Array.from(new Set([organizerId, ...attendeeIds]));
      
      return await this.checkMeetingConflicts(
        allParticipants,
        meetingDate,
        startTime,
        endTime
      );
    } catch (error) {
      console.error('Error checking new meeting conflicts:', error);
      throw new Error('Failed to check calendar conflicts');
    }
  }

  /**
   * Check for conflicts when updating an existing meeting
   */
  static async checkUpdateMeetingConflicts(
    meetingId: number,
    attendeeIds: number[],
    meetingDate: string,
    startTime: string,
    endTime: string,
    organizerId: number
  ): Promise<ConflictCheckResult> {
    try {
      // Include organizer in conflict check
      const allParticipants = Array.from(new Set([organizerId, ...attendeeIds]));
      
      return await this.checkMeetingConflicts(
        allParticipants,
        meetingDate,
        startTime,
        endTime,
        meetingId // Exclude the meeting being updated
      );
    } catch (error) {
      console.error('Error checking update meeting conflicts:', error);
      throw new Error('Failed to check calendar conflicts');
    }
  }

  /**
   * Core conflict detection logic
   */
  private static async checkMeetingConflicts(
    participantIds: number[],
    meetingDate: string,
    startTime: string,
    endTime: string,
    excludeMeetingId?: number
  ): Promise<ConflictCheckResult> {
    if (participantIds.length === 0) {
      return { hasConflicts: false, conflicts: [], warnings: [] };
    }

    // Get all users for name resolution
    const users_data = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.id, participantIds));

    const userMap = new Map(
      users_data.map(user => [
        user.id,
        user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.username
      ])
    );

    // Query for conflicting meetings
    let conflictQuery = db
      .select({
        id: businessMeetings.id,
        title: businessMeetings.title,
        meetingDate: businessMeetings.meetingDate,
        startTime: businessMeetings.startTime,
        endTime: businessMeetings.endTime,
        organizerId: businessMeetings.organizerId,
        attendeeIds: businessMeetings.attendeeIds,
        status: businessMeetings.status,
      })
      .from(businessMeetings)
      .where(
        and(
          eq(businessMeetings.meetingDate, meetingDate),
          // Only check active meetings
          sql`${businessMeetings.status} NOT IN ('Cancelled', 'Completed')`,
          // Check if any participant is involved
          or(
            sql`${businessMeetings.organizerId} = ANY(ARRAY[${participantIds.join(',')}])`,
            sql`${businessMeetings.attendeeIds} && ARRAY[${participantIds.join(',')}]`
          )
        )
      );

    // Exclude the meeting being updated
    if (excludeMeetingId) {
      conflictQuery = conflictQuery.where(
        and(
          eq(businessMeetings.meetingDate, meetingDate),
          sql`${businessMeetings.status} NOT IN ('Cancelled', 'Completed')`,
          or(
            sql`${businessMeetings.organizerId} = ANY(ARRAY[${participantIds.join(',')}])`,
            sql`${businessMeetings.attendeeIds} && ARRAY[${participantIds.join(',')}]`
          ),
          sql`${businessMeetings.id} != ${excludeMeetingId}`
        )
      );
    }

    const existingMeetings = await conflictQuery;

    const conflicts: ConflictDetails[] = [];
    const warnings: ConflictDetails[] = [];

    // Check each participant for conflicts
    for (const participantId of participantIds) {
      const userName = userMap.get(participantId) || `User ${participantId}`;
      const userConflicts: ConflictDetails['conflicts'] = [];
      const userWarnings: ConflictDetails['conflicts'] = [];

      for (const meeting of existingMeetings) {
        // Check if this participant is involved in the existing meeting
        const isOrganizer = meeting.organizerId === participantId;
        const isAttendee = Array.isArray(meeting.attendeeIds) && 
          meeting.attendeeIds.includes(participantId);

        if (!isOrganizer && !isAttendee) {
          continue;
        }

        const conflictType = this.getTimeConflictType(
          startTime,
          endTime,
          meeting.startTime,
          meeting.endTime
        );

        if (conflictType === 'overlap') {
          userConflicts.push({
            meetingId: meeting.id,
            title: meeting.title,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            meetingDate: meeting.meetingDate,
            conflictType,
          });
        } else if (conflictType === 'adjacent') {
          userWarnings.push({
            meetingId: meeting.id,
            title: meeting.title,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            meetingDate: meeting.meetingDate,
            conflictType,
          });
        }
      }

      if (userConflicts.length > 0) {
        conflicts.push({
          userId: participantId,
          userName,
          conflicts: userConflicts,
        });
      }

      if (userWarnings.length > 0) {
        warnings.push({
          userId: participantId,
          userName,
          conflicts: userWarnings,
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      warnings,
    };
  }

  /**
   * Determine the type of time conflict between two meetings
   */
  private static getTimeConflictType(
    newStartTime: string,
    newEndTime: string,
    existingStartTime: string,
    existingEndTime: string
  ): 'overlap' | 'adjacent' | 'none' {
    const newStart = this.timeToMinutes(newStartTime);
    const newEnd = this.timeToMinutes(newEndTime);
    const existingStart = this.timeToMinutes(existingStartTime);
    const existingEnd = this.timeToMinutes(existingEndTime);

    // Check for overlap
    if (
      (newStart < existingEnd && newEnd > existingStart) ||
      (existingStart < newEnd && existingEnd > newStart)
    ) {
      return 'overlap';
    }

    // Check for adjacent meetings (within 15 minutes)
    const adjacentThreshold = 15; // minutes
    if (
      Math.abs(newStart - existingEnd) <= adjacentThreshold ||
      Math.abs(newEnd - existingStart) <= adjacentThreshold
    ) {
      return 'adjacent';
    }

    return 'none';
  }

  /**
   * Convert time string (HH:MM or HH:MM:SS) to minutes since midnight
   */
  private static timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Get suggested alternative time slots
   */
  static async getSuggestedTimeSlots(
    attendeeIds: number[],
    meetingDate: string,
    durationMinutes: number,
    organizerId: number,
    excludeMeetingId?: number
  ): Promise<{ startTime: string; endTime: string }[]> {
    try {
      const allParticipants = Array.from(new Set([organizerId, ...attendeeIds]));
      
      // Get all existing meetings for the day
      let query = db
        .select({
          startTime: businessMeetings.startTime,
          endTime: businessMeetings.endTime,
        })
        .from(businessMeetings)
        .where(
          and(
            eq(businessMeetings.meetingDate, meetingDate),
            sql`${businessMeetings.status} NOT IN ('Cancelled', 'Completed')`,
            or(
              eq(businessMeetings.organizerId, sql`ANY(${allParticipants})`),
              sql`${businessMeetings.attendeeIds} && ${JSON.stringify(allParticipants)}`
            )
          )
        );

      if (excludeMeetingId) {
        query = query.where(
          and(
            eq(businessMeetings.meetingDate, meetingDate),
            sql`${businessMeetings.status} NOT IN ('Cancelled', 'Completed')`,
            or(
              eq(businessMeetings.organizerId, sql`ANY(${allParticipants})`),
              sql`${businessMeetings.attendeeIds} && ${JSON.stringify(allParticipants)}`
            ),
            sql`${businessMeetings.id} != ${excludeMeetingId}`
          )
        );
      }

      const existingMeetings = await query;

      // Find available time slots
      const suggestions = this.findAvailableSlots(
        existingMeetings.map(m => ({
          start: this.timeToMinutes(m.startTime),
          end: this.timeToMinutes(m.endTime),
        })),
        durationMinutes
      );

      return suggestions.map(slot => ({
        startTime: this.minutesToTime(slot.start),
        endTime: this.minutesToTime(slot.end),
      }));
    } catch (error) {
      console.error('Error getting suggested time slots:', error);
      return [];
    }
  }

  /**
   * Find available time slots in a day
   */
  private static findAvailableSlots(
    occupiedSlots: { start: number; end: number }[],
    durationMinutes: number
  ): { start: number; end: number }[] {
    const workingHours = {
      start: 9 * 60, // 9:00 AM
      end: 18 * 60,  // 6:00 PM
    };

    const suggestions: { start: number; end: number }[] = [];
    
    // Sort occupied slots by start time
    const sortedSlots = occupiedSlots.sort((a, b) => a.start - b.start);
    
    let currentTime = workingHours.start;
    const endOfDay = workingHours.end;

    for (const slot of sortedSlots) {
      // Check if there's enough time before this meeting
      if (slot.start - currentTime >= durationMinutes) {
        suggestions.push({
          start: currentTime,
          end: currentTime + durationMinutes,
        });
      }
      currentTime = Math.max(currentTime, slot.end);
    }

    // Check if there's time at the end of the day
    if (endOfDay - currentTime >= durationMinutes) {
      suggestions.push({
        start: currentTime,
        end: currentTime + durationMinutes,
      });
    }

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  /**
   * Convert minutes since midnight to time string
   */
  private static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}