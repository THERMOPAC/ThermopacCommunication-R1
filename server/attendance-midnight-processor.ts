import { db } from './db';
import { attendanceRecords, attendanceIssues, dailyWorkReports, users } from '@shared/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';
import { determineAttendanceStatus } from './attendance-status-engine';

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

      const userSelect = {
        id: users.id,
        username: users.username,
        email: users.email,
        reportingManagerId: users.reportingManagerId,
        minimumDailyHours: users.minimumDailyHours,
        halfDayMinimumHours: users.halfDayMinimumHours,
        weeklyOffDays: users.weeklyOffDays,
        dutyTimeOut: users.dutyTimeOut,
      };

      const incompleteRecords = await db
        .select({ attendanceRecord: attendanceRecords, user: userSelect })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(
          eq(attendanceRecords.date, yesterdayStr),
          isNull(attendanceRecords.checkInTime)
        ));

      console.log(`Found ${incompleteRecords.length} incomplete attendance records for ${yesterdayStr}`);

      for (const record of incompleteRecords) {
        await this.processIncompleteRecord(record.attendanceRecord, record.user);
      }

      const checkedInButNotOut = await db
        .select({ attendanceRecord: attendanceRecords, user: userSelect })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(
          eq(attendanceRecords.date, yesterdayStr),
          isNull(attendanceRecords.checkOutTime)
        ));

      console.log(`Found ${checkedInButNotOut.length} records with check-in but no check-out for ${yesterdayStr}`);

      for (const record of checkedInButNotOut) {
        await this.processIncompleteCheckout(record.attendanceRecord, record.user);
      }

      const completedRecords = await db
        .select({ attendanceRecord: attendanceRecords, user: userSelect })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(
          eq(attendanceRecords.date, yesterdayStr),
          eq(attendanceRecords.status, 'present')
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
   * Process a single incomplete attendance record (no check-in at all)
   */
  private async processIncompleteRecord(record: any, user: any): Promise<void> {
    try {
      const statusResult = await determineAttendanceStatus({
        userId: record.userId,
        date: record.date,
        checkInTime: null,
        checkOutTime: null,
        userConfig: {
          minimumDailyHours: user?.minimumDailyHours,
          halfDayMinimumHours: user?.halfDayMinimumHours,
          weeklyOffDays: user?.weeklyOffDays,
        },
        workLocationId: record.workLocationId,
      });

      if (statusResult.statusSource === 'holiday' || statusResult.statusSource === 'weekly_off' || statusResult.statusSource === 'leave') {
        await db.update(attendanceRecords).set({
          status: statusResult.status,
          updatedAt: new Date()
        }).where(eq(attendanceRecords.id, record.id));
        console.log(`Set status '${statusResult.status}' (${statusResult.statusSource}) for user ${user?.username || record.userId} on ${record.date}`);
        return;
      }

      const description = `Employee ${user?.username || 'Unknown'} has no check-in record for ${record.date}`;

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

      await db
        .insert(attendanceIssues)
        .values({
          attendanceRecordId: record.id,
          userId: record.userId,
          issueType: 'no_checkin',
          description,
          severity: 'high',
          status: 'pending',
          detectedAt: new Date(),
          managerNotified: false,
          hrNotified: false
        });

      console.log(`Flagged absent (no check-in) for user ${user?.username || record.userId} on ${record.date}`);
    } catch (error) {
      console.error(`Error processing incomplete record for user ${record.userId}:`, error);
    }
  }

  /**
   * Process attendance record with check-in but no check-out
   */
  private async processIncompleteCheckout(record: any, user: any): Promise<void> {
    try {
      if (record.isIncomplete) {
        return;
      }

      const dutyEndStr = user?.dutyTimeOut || '18:00';
      const [h, m] = dutyEndStr.split(':').map(Number);
      const assumedCheckout = new Date(record.date + 'T00:00:00');
      assumedCheckout.setHours(h, m, 0, 0);

      const statusResult = await determineAttendanceStatus({
        userId: record.userId,
        date: record.date,
        checkInTime: record.checkInTime,
        checkOutTime: assumedCheckout,
        userConfig: {
          minimumDailyHours: user?.minimumDailyHours,
          halfDayMinimumHours: user?.halfDayMinimumHours,
          weeklyOffDays: user?.weeklyOffDays,
        },
        workLocationId: record.workLocationId,
      });

      const description = `Employee ${user?.username || 'Unknown'} checked in at ${record.checkInTime} but did not check out on ${record.date}. Status estimated using duty end time (${dutyEndStr}). Estimated hours: ${statusResult.workingHours}. Status: ${statusResult.status}. Flagged for review.`;

      await db
        .update(attendanceRecords)
        .set({
          status: statusResult.status,
          workingHours: statusResult.workingHours.toFixed(2),
          isIncomplete: true,
          incompleteReason: description,
          flaggedAt: new Date(),
          requiresApproval: true,
          updatedAt: new Date()
        })
        .where(eq(attendanceRecords.id, record.id));

      await db
        .insert(attendanceIssues)
        .values({
          attendanceRecordId: record.id,
          userId: record.userId,
          issueType: 'no_checkout',
          description,
          severity: 'high',
          status: 'pending',
          detectedAt: new Date(),
          managerNotified: false,
          hrNotified: false
        });

      console.log(`Flagged incomplete checkout for user ${user?.username || record.userId} on ${record.date} — estimated status: ${statusResult.status} (${statusResult.workingHours}h)`);
    } catch (error) {
      console.error(`Error processing incomplete checkout for user ${record.userId}:`, error);
    }
  }

  /**
   * Process DWAR compliance for completed attendance records
   * DWAR non-submission creates a compliance warning but does NOT change attendance status
   */
  private async processDwarCompliance(record: any, user: any): Promise<void> {
    try {
      const [dwarRecord] = await db
        .select()
        .from(dailyWorkReports)
        .where(and(
          eq(dailyWorkReports.userId, record.userId),
          eq(dailyWorkReports.reportDate, record.date)
        ));

      const hasValidDwar = dwarRecord && (dwarRecord.status === 'submitted' || dwarRecord.status === 'approved');
      
      if (hasValidDwar) {
        return;
      }

      const workingHours = parseFloat(record.workingHours || '0');
      const description = `Employee ${user?.username || 'Unknown'} did not submit DWAR for ${record.date}. Attendance status '${record.status}' unchanged — DWAR is a compliance requirement, not a status factor. Hours worked: ${workingHours.toFixed(1)}.`;

      await db
        .insert(attendanceIssues)
        .values({
          attendanceRecordId: record.id,
          userId: record.userId,
          issueType: 'no_dwar',
          description,
          severity: 'medium',
          status: 'pending',
          detectedAt: new Date(),
          managerNotified: false,
          hrNotified: false
        });

      console.log(`DWAR compliance warning for user ${user?.username || record.userId} on ${record.date} (status unchanged: ${record.status})`);
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
      // Exclude today's date - users may not have submitted DWAR yet since day is ongoing
      const today = new Date().toISOString().split('T')[0];
      let effectiveEndDate = endDate;
      if (endDate >= today) {
        effectiveEndDate = new Date(new Date(today).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        console.log(`Excluding today (${today}) from processing. Adjusted end date: ${effectiveEndDate}`);
      }
      
      // If start date is after effective end date, nothing to process
      if (startDate > effectiveEndDate) {
        console.log('No historical records to process (date range only includes today)');
        return {
          success: true,
          message: 'No historical records to process - cannot process today\'s records as day is still ongoing',
          processed: 0,
          markedAbsent: 0,
          details: []
        };
      }

      console.log(`Processing historical DWAR compliance from ${startDate} to ${effectiveEndDate}...`);

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
          lte(attendanceRecords.date, effectiveEndDate),
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
          const description = `Retroactive compliance: DWAR not submitted for ${rec.date}. Status: ${dwarRecord?.status || 'Not created'}. Attendance status unchanged — DWAR is a compliance requirement, not a status factor.`;

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
                severity: 'medium',
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
            action: 'dwar_compliance_warning'
          });

          console.log(`DWAR compliance warning: ${user?.username || rec.userId} on ${rec.date} (DWAR: ${dwarRecord?.status || 'none'}, status unchanged: ${rec.status})`);
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