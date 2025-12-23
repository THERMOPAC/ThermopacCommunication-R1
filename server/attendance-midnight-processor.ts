import { db } from './db';
import { attendanceRecords, attendanceIssues, dailyWorkReports, users } from '@shared/schema';
import { eq, and, isNull, lt, gte, lte } from 'drizzle-orm';

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

      // Check for completed attendance records (with checkout) that don't have submitted DWAR
      // These should also be marked as absent retroactively
      const completedRecords = await db
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
          eq(attendanceRecords.status, 'present') // Only check records still marked as present
        ));

      console.log(`Checking ${completedRecords.length} completed records for DWAR compliance on ${yesterdayStr}`);

      for (const record of completedRecords) {
        await this.processDwarCompliance(record.attendanceRecord, record.user);
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

      // Determine status based on DWAR completion
      // If DWAR not submitted, mark as ABSENT
      const attendanceStatus = hasValidDwar ? 'incomplete' : 'absent';
      
      // Update attendance record
      await db
        .update(attendanceRecords)
        .set({
          status: attendanceStatus,
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
          issueType: hasValidDwar ? 'incomplete_checkout' : 'no_dwar',
          description,
          severity: hasValidDwar ? 'medium' : 'high',
          status: 'pending',
          detectedAt: new Date(),
          managerNotified: false,
          hrNotified: false
        });

      console.log(`Flagged ${attendanceStatus} for user ${user?.username || record.userId} on ${record.date} (DWAR: ${hasValidDwar ? 'submitted' : 'not submitted'})`);
    } catch (error) {
      console.error(`Error processing incomplete checkout for user ${record.userId}:`, error);
    }
  }

  /**
   * Process DWAR compliance for completed attendance records
   * If DWAR was not submitted, mark the attendance as absent
   */
  private async processDwarCompliance(record: any, user: any): Promise<void> {
    try {
      // Check if DWAR was submitted
      const [dwarRecord] = await db
        .select()
        .from(dailyWorkReports)
        .where(and(
          eq(dailyWorkReports.userId, record.userId),
          eq(dailyWorkReports.reportDate, record.date)
        ));

      const hasValidDwar = dwarRecord && (dwarRecord.status === 'submitted' || dwarRecord.status === 'approved');
      
      // If DWAR was submitted, no action needed
      if (hasValidDwar) {
        return;
      }

      const description = `Employee ${user?.username || 'Unknown'} did not submit DWAR for ${record.date}. Marked as absent.`;

      // Update attendance record to absent
      await db
        .update(attendanceRecords)
        .set({
          status: 'absent',
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
          issueType: 'no_dwar',
          description,
          severity: 'high',
          status: 'pending',
          detectedAt: new Date(),
          managerNotified: false,
          hrNotified: false
        });

      console.log(`Marked absent (DWAR not submitted) for user ${user?.username || record.userId} on ${record.date}`);
    } catch (error) {
      console.error(`Error processing DWAR compliance for user ${record.userId}:`, error);
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

  /**
   * Process historical attendance records for a date range
   * This is used to retroactively mark users as absent if they didn't submit DWAR
   */
  async processHistoricalDwarCompliance(
    startDate: string,
    endDate: string
  ): Promise<{ 
    success: boolean; 
    message: string; 
    processed: number; 
    markedAbsent: number;
    details: Array<{ userId: number; username: string; date: string; action: string }>;
  }> {
    const details: Array<{ userId: number; username: string; date: string; action: string }> = [];
    let processed = 0;
    let markedAbsent = 0;

    try {
      console.log(`Processing historical DWAR compliance from ${startDate} to ${endDate}...`);

      // Find all attendance records in the date range that are still marked as 'present'
      // but either have no checkout or might be missing DWAR
      const recordsToCheck = await db
        .select({
          attendanceRecord: attendanceRecords,
          user: {
            id: users.id,
            username: users.username,
            email: users.email,
          }
        })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(
          gte(attendanceRecords.date, startDate),
          lte(attendanceRecords.date, endDate),
          eq(attendanceRecords.status, 'present') // Only check records still marked as present
        ));

      console.log(`Found ${recordsToCheck.length} records to check in date range`);

      for (const record of recordsToCheck) {
        processed++;
        const rec = record.attendanceRecord;
        const user = record.user;

        // Check if DWAR was submitted for this date
        const [dwarRecord] = await db
          .select()
          .from(dailyWorkReports)
          .where(and(
            eq(dailyWorkReports.userId, rec.userId),
            eq(dailyWorkReports.reportDate, rec.date)
          ));

        const hasValidDwar = dwarRecord && 
          (dwarRecord.status === 'submitted' || dwarRecord.status === 'approved');

        if (!hasValidDwar) {
          // Mark as absent and reset approval flags for consistent state
          const description = `Retroactive: DWAR not submitted for ${rec.date}. Status: ${dwarRecord?.status || 'Not created'}`;

          await db
            .update(attendanceRecords)
            .set({
              status: 'absent',
              incompleteReason: description,
              flaggedAt: new Date(),
              isIncomplete: false,
              requiresApproval: false,
              updatedAt: new Date()
            })
            .where(eq(attendanceRecords.id, rec.id));

          // Check if issue already exists
          const existingIssue = await db
            .select()
            .from(attendanceIssues)
            .where(and(
              eq(attendanceIssues.attendanceRecordId, rec.id),
              eq(attendanceIssues.issueType, 'no_dwar')
            ));

          if (existingIssue.length === 0) {
            await db
              .insert(attendanceIssues)
              .values({
                attendanceRecordId: rec.id,
                userId: rec.userId,
                issueType: 'no_dwar',
                description,
                severity: 'high',
                status: 'pending',
                detectedAt: new Date(),
                managerNotified: false,
                hrNotified: false
              });
          }

          markedAbsent++;
          details.push({
            userId: rec.userId,
            username: user?.username || 'Unknown',
            date: rec.date,
            action: 'marked_absent'
          });

          console.log(`Marked absent: ${user?.username || rec.userId} on ${rec.date} (DWAR: ${dwarRecord?.status || 'none'})`);
        } else {
          details.push({
            userId: rec.userId,
            username: user?.username || 'Unknown',
            date: rec.date,
            action: 'dwar_valid'
          });
        }
      }

      console.log(`Historical processing complete: ${processed} checked, ${markedAbsent} marked absent`);

      return {
        success: true,
        message: `Processed ${processed} records, marked ${markedAbsent} as absent due to missing DWAR`,
        processed,
        markedAbsent,
        details
      };
    } catch (error) {
      console.error('Error in historical DWAR compliance processing:', error);
      return {
        success: false,
        message: `Error: ${error}`,
        processed,
        markedAbsent,
        details
      };
    }
  }
}

// Export singleton instance
export const attendanceMidnightProcessor = AttendanceMidnightProcessor.getInstance();