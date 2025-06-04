import { db } from './db';
import { attendanceRecords, attendanceIssues, dailyWorkReports, users } from '@shared/schema';
import { eq, and, isNull, lt } from 'drizzle-orm';

/**
 * Midnight Attendance Processor
 * Runs at midnight to flag incomplete attendance records and create management issues
 */
export class AttendanceMidnightProcessor {
  private static instance: AttendanceMidnightProcessor;
  private isRunning = false;

  static getInstance(): AttendanceMidnightProcessor {
    if (!AttendanceMidnightProcessor.instance) {
      AttendanceMidnightProcessor.instance = new AttendanceMidnightProcessor();
    }
    return AttendanceMidnightProcessor.instance;
  }

  /**
   * Process incomplete attendance records at midnight
   */
  async processIncompleteAttendance(): Promise<void> {
    if (this.isRunning) {
      console.log('Midnight attendance processing already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log(`[${new Date().toISOString()}] Starting midnight attendance processing...`);

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Find all attendance records from yesterday that are incomplete
      const incompleteRecords = await db
        .select({
          attendanceRecord: attendanceRecords,
          user: {
            id: users.id,
            username: users.username,
            email: users.email,
            reportingManagerId: users.reportingManagerId,
          }
        })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(
          eq(attendanceRecords.date, yesterdayStr),
          isNull(attendanceRecords.checkInTime) // No check-in at all
        ));

      console.log(`Found ${incompleteRecords.length} incomplete attendance records for ${yesterdayStr}`);

      // Process each incomplete record
      for (const record of incompleteRecords) {
        await this.processIncompleteRecord(record.attendanceRecord, record.user);
      }

      // Also check for users who checked in but didn't check out
      const checkedInButNotOut = await db
        .select({
          attendanceRecord: attendanceRecords,
          user: {
            id: users.id,
            username: users.username,
            email: users.email,
            reportingManagerId: users.reportingManagerId,
          }
        })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(
          eq(attendanceRecords.date, yesterdayStr),
          isNull(attendanceRecords.checkOutTime) // Has check-in but no check-out
        ));

      console.log(`Found ${checkedInButNotOut.length} records with check-in but no check-out for ${yesterdayStr}`);

      for (const record of checkedInButNotOut) {
        await this.processIncompleteCheckout(record.attendanceRecord, record.user);
      }

      console.log(`[${new Date().toISOString()}] Midnight attendance processing completed`);
    } catch (error) {
      console.error('Error in midnight attendance processing:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single incomplete attendance record
   */
  private async processIncompleteRecord(record: any, user: any): Promise<void> {
    try {
      // Check if DWAR was submitted for this date
      const [dwarRecord] = await db
        .select()
        .from(dailyWorkReports)
        .where(and(
          eq(dailyWorkReports.userId, record.userId),
          eq(dailyWorkReports.reportDate, record.date)
        ));

      const issueType = !dwarRecord || dwarRecord.status !== 'submitted' 
        ? 'no_dwar' 
        : 'incomplete_checkout';

      const description = issueType === 'no_dwar'
        ? `Employee ${user?.username || 'Unknown'} did not submit Daily Work Activity Report for ${record.date}`
        : `Employee ${user?.username || 'Unknown'} checked in but did not check out on ${record.date}`;

      // Update attendance record as incomplete
      await db
        .update(attendanceRecords)
        .set({
          status: 'incomplete',
          isIncomplete: true,
          incompleteReason: description,
          flaggedAt: new Date(),
          requiresApproval: true,
          updatedAt: new Date()
        })
        .where(eq(attendanceRecords.id, record.id));

      // Create attendance issue for management attention
      await db
        .insert(attendanceIssues)
        .values({
          attendanceRecordId: record.id,
          userId: record.userId,
          issueType,
          description,
          severity: issueType === 'no_dwar' ? 'high' : 'medium',
          status: 'pending',
          detectedAt: new Date(),
          managerNotified: false,
          hrNotified: false
        });

      console.log(`Flagged incomplete attendance for user ${user?.username || record.userId} on ${record.date}`);
    } catch (error) {
      console.error(`Error processing incomplete record for user ${record.userId}:`, error);
    }
  }

  /**
   * Process attendance record with check-in but no check-out
   */
  private async processIncompleteCheckout(record: any, user: any): Promise<void> {
    try {
      // Skip if already processed
      if (record.isIncomplete) {
        return;
      }

      // Check if DWAR was submitted
      const [dwarRecord] = await db
        .select()
        .from(dailyWorkReports)
        .where(and(
          eq(dailyWorkReports.userId, record.userId),
          eq(dailyWorkReports.reportDate, record.date)
        ));

      const hasValidDwar = dwarRecord && dwarRecord.status === 'submitted';
      const description = `Employee ${user?.username || 'Unknown'} checked in at ${record.checkInTime} but did not check out on ${record.date}${hasValidDwar ? ' (DWAR submitted)' : ' (No DWAR submitted)'}`;

      // Update attendance record
      await db
        .update(attendanceRecords)
        .set({
          status: 'incomplete',
          isIncomplete: true,
          incompleteReason: description,
          flaggedAt: new Date(),
          requiresApproval: true,
          updatedAt: new Date()
        })
        .where(eq(attendanceRecords.id, record.id));

      // Create attendance issue
      await db
        .insert(attendanceIssues)
        .values({
          attendanceRecordId: record.id,
          userId: record.userId,
          issueType: 'incomplete_checkout',
          description,
          severity: hasValidDwar ? 'medium' : 'high',
          status: 'pending',
          detectedAt: new Date(),
          managerNotified: false,
          hrNotified: false
        });

      console.log(`Flagged incomplete checkout for user ${user?.username || record.userId} on ${record.date}`);
    } catch (error) {
      console.error(`Error processing incomplete checkout for user ${record.userId}:`, error);
    }
  }

  /**
   * Start the midnight scheduler
   */
  startScheduler(): void {
    // Calculate milliseconds until next midnight
    const now = new Date();
    const nextMidnight = new Date();
    nextMidnight.setDate(now.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    console.log(`Attendance midnight processor scheduled to run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);

    // Set timeout for first run at midnight
    setTimeout(() => {
      this.processIncompleteAttendance();
      
      // Then set up daily interval (24 hours)
      setInterval(() => {
        this.processIncompleteAttendance();
      }, 24 * 60 * 60 * 1000);
      
    }, msUntilMidnight);
  }

  /**
   * Manual trigger for testing (can be called via API endpoint)
   */
  async manualTrigger(): Promise<{ success: boolean; message: string }> {
    try {
      await this.processIncompleteAttendance();
      return {
        success: true,
        message: 'Midnight attendance processing completed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in attendance processing: ${error}`
      };
    }
  }
}

// Export singleton instance
export const attendanceMidnightProcessor = AttendanceMidnightProcessor.getInstance();