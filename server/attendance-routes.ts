import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
import { Router, Request, Response } from 'express';
import { db } from './db';
import { attendanceRecords, attendanceSettings, attendanceIssues, workLocations, users, dailyQuotes, dailyWorkReports, attendanceRegularizations, payrollPeriods, payrollLocks, leaveRequests, companyHolidays } from '@shared/schema';
import { createNotification } from './notification-routes';
import { eq, and, gte, lte, desc, asc, sql, isNull, inArray } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { attendanceMidnightProcessor } from './attendance-midnight-processor';
import { checkPayrollLock } from './payroll-lock-service';
import { determineAttendanceStatus } from './attendance-status-engine';

const router = Router();

const REQUEST_TYPE_LABELS: Record<string, string> = {
  outdoor_duty: 'Outdoor Duty',
  missed_checkin: 'Missed Check-In',
  missed_checkout: 'Missed Check-Out',
  full_day_regularization: 'Full Day Regularization',
};

// Helper function to check if user has submitted DWAR for a given date
export async function checkDwarCompletionStatus(userId: number, date: string): Promise<{
  isCompleted: boolean;
  status: string | null;
  reportId: number | null;
}> {
  try {
    const [dwar] = await db
      .select({
        id: dailyWorkReports.id,
        status: dailyWorkReports.status
      })
      .from(dailyWorkReports)
      .where(and(
        eq(dailyWorkReports.userId, userId),
        eq(dailyWorkReports.reportDate, date)
      ));

    if (!dwar) {
      return { isCompleted: false, status: null, reportId: null };
    }

    // DWAR is considered complete only if status is 'submitted' or 'approved'
    const isCompleted = dwar.status === 'submitted' || dwar.status === 'approved';
    
    return { 
      isCompleted, 
      status: dwar.status, 
      reportId: dwar.id 
    };
  } catch (error) {
    console.error('Error checking DWAR completion status:', error);
    return { isCompleted: false, status: null, reportId: null };
  }
}

// Get current user's attendance status for today
router.get('/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0];

    const [todayRecord] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        eq(attendanceRecords.date, today)
      ));

    res.json({
      hasRecord: !!todayRecord,
      record: todayRecord || null,
      canCheckIn: !todayRecord || !todayRecord.checkInTime,
      canCheckOut: todayRecord && todayRecord.checkInTime && !todayRecord.checkOutTime
    });
  } catch (error) {
    console.error('Error getting attendance status:', error);
    sendError(res, error);
  }
});

// Check-in endpoint
router.post('/check-in', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      workLocationId,
      latitude,
      longitude,
      address,
      deviceInfo
    } = req.body;

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const ipAddress = req.ip || req.connection.remoteAddress;

    const lockCheck = await checkPayrollLock('attendance', today, userId);
    if (lockCheck.isLocked) {
      return res.status(403).json({ error: `Attendance is locked for this period: ${lockCheck.message}` });
    }

    // Check if already checked in today
    const [existingRecord] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        eq(attendanceRecords.date, today)
      ));

    if (existingRecord && existingRecord.checkInTime) {
      return res.status(400).json({ 
        error: 'Already checked in today',
        checkInTime: existingRecord.checkInTime
      });
    }

    // Validate location if work location is provided
    let isLocationVerified = false;
    let isIpVerified = false;

    if (workLocationId) {
      const [location] = await db
        .select()
        .from(workLocations)
        .where(eq(workLocations.id, workLocationId));

      if (location) {
        // Verify GPS location if coordinates are provided
        if (location.latitude && location.longitude && latitude && longitude) {
          const distance = calculateDistance(
            latitude, longitude,
            location.latitude, location.longitude
          );
          isLocationVerified = distance <= (location.radiusMeters || 100);
        }

        // Verify IP address if restrictions are set
        if (location.ipRestrictions && location.ipRestrictions.length > 0 && ipAddress) {
          isIpVerified = location.ipRestrictions.some((allowedIp: string) => 
            ipAddress.includes(allowedIp) || allowedIp.includes(ipAddress)
          );
        } else {
          isIpVerified = true; // No IP restrictions
        }
      }
    }

    // Create or update attendance record
    if (existingRecord) {
      const [updatedRecord] = await db
        .update(attendanceRecords)
        .set({
          checkInTime: now,
          checkInLatitude: latitude,
          checkInLongitude: longitude,
          checkInAddress: address,
          checkInIpAddress: ipAddress,
          checkInDeviceInfo: deviceInfo,
          workLocationId: workLocationId || null,
          isLocationVerified,
          isIpVerified,
          updatedAt: now
        })
        .where(eq(attendanceRecords.id, existingRecord.id))
        .returning();

      res.json({
        success: true,
        message: 'Checked in successfully',
        record: updatedRecord,
        locationVerified: isLocationVerified,
        ipVerified: isIpVerified
      });
    } else {
      const [newRecord] = await db
        .insert(attendanceRecords)
        .values({
          userId,
          workLocationId: workLocationId || null,
          date: today,
          checkInTime: now,
          checkInLatitude: latitude,
          checkInLongitude: longitude,
          checkInAddress: address,
          checkInIpAddress: ipAddress,
          checkInDeviceInfo: deviceInfo,
          isLocationVerified,
          isIpVerified,
          status: 'present'
        })
        .returning();

      res.json({
        success: true,
        message: 'Checked in successfully',
        record: newRecord,
        locationVerified: isLocationVerified,
        ipVerified: isIpVerified
      });
    }
  } catch (error) {
    console.error('Error during check-in:', error);
    sendError(res, error);
  }
});

// Check-out endpoint
router.post('/check-out', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      latitude,
      longitude,
      address,
      deviceInfo,
      employeeNotes
    } = req.body;

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Find today's record
    const [existingRecord] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        eq(attendanceRecords.date, today)
      ));

    if (!existingRecord || !existingRecord.checkInTime) {
      return res.status(400).json({ 
        error: 'No check-in record found for today'
      });
    }

    if (existingRecord.checkOutTime) {
      return res.status(400).json({ 
        error: 'Already checked out today',
        checkOutTime: existingRecord.checkOutTime
      });
    }

    // Check DWAR completion status
    const dwarStatus = await checkDwarCompletionStatus(userId, today);
    const isDwarCompleted = dwarStatus.isCompleted;

    const employeeUser = req.user as any;

    const statusResult = await determineAttendanceStatus({
      userId,
      date: today,
      checkInTime: new Date(existingRecord.checkInTime),
      checkOutTime: now,
      userConfig: {
        minimumDailyHours: employeeUser.minimumDailyHours,
        halfDayMinimumHours: employeeUser.halfDayMinimumHours,
        weeklyOffDays: employeeUser.weeklyOffDays,
      },
      workLocationId: existingRecord.workLocationId,
    });

    const workingHours = statusResult.workingHours;
    const overtimeHours = statusResult.overtimeHours;
    const attendanceStatus = statusResult.status;

    const [updatedRecord] = await db
      .update(attendanceRecords)
      .set({
        checkOutTime: now,
        checkOutLatitude: latitude,
        checkOutLongitude: longitude,
        checkOutAddress: address,
        checkOutIpAddress: ipAddress,
        checkOutDeviceInfo: deviceInfo,
        workingHours: workingHours.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        employeeNotes,
        status: attendanceStatus,
        updatedAt: now
      })
      .where(eq(attendanceRecords.id, existingRecord.id))
      .returning();

    // If DWAR not completed, create a compliance warning (does NOT affect attendance status)
    if (!isDwarCompleted) {
      try {
        await db.insert(attendanceIssues).values({
          attendanceRecordId: existingRecord.id,
          userId: userId,
          issueType: 'no_dwar',
          description: `DWAR not submitted at checkout. DWAR status: ${dwarStatus.status || 'Not created'}. Attendance status based on hours worked: ${attendanceStatus}.`,
          severity: 'medium',
          status: 'pending',
          detectedAt: now,
          managerNotified: false,
          hrNotified: false
        });
        console.log(`Created DWAR compliance warning for user ${userId} (attendance status: ${attendanceStatus})`);
      } catch (issueError) {
        console.error('Error creating attendance issue:', issueError);
      }
    }

    // Get user details for personalized message
    const [user] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId));

    // Generate dynamic gratitude message
    const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
    const isFriday = dayOfWeek === 5;
    const isSaturday = dayOfWeek === 6;
    const isThursday = dayOfWeek === 4;
    
    let gratitudeMessage;
    
    if (isFriday) {
      gratitudeMessage = `🙏 Thank you for your contributions today, ${user?.username || 'User'}! Have a great weekend! Looking forward to working with you on Monday.`;
    } else if (isSaturday) {
      gratitudeMessage = `🙏 Thank you for your contributions today, ${user?.username || 'User'}! Enjoy your weekend! See you on Monday.`;
    } else if (isThursday) {
      gratitudeMessage = `🙏 Thank you for your contributions today, ${user?.username || 'User'}! One more day to the weekend! Looking forward to working with you tomorrow.`;
    } else {
      gratitudeMessage = `🙏 Thank you for your contributions today, ${user?.username || 'User'}! Looking forward to working with you tomorrow.`;
    }

    // Build response based on DWAR status
    let responseMessage = 'Checked out successfully';
    let dwarWarning = null;
    
    if (!isDwarCompleted) {
      dwarWarning = 'Your DWAR was not submitted for today. This has been flagged for compliance review. Your attendance status is based on hours worked.';
      responseMessage = 'Checked out successfully - DWAR compliance warning recorded';
    }

    res.json({
      success: true,
      message: responseMessage,
      record: updatedRecord,
      workingHours: Number(workingHours.toFixed(2)),
      overtimeHours: Number(overtimeHours.toFixed(2)),
      gratitudeMessage: isDwarCompleted ? gratitudeMessage : null,
      dwarWarning,
      dwarStatus: {
        isCompleted: isDwarCompleted,
        status: dwarStatus.status
      }
    });
  } catch (error) {
    console.error('Error during check-out:', error);
    sendError(res, error);
  }
});

// Get attendance records for current user
router.get('/my-records', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, limit = 30, offset = 0 } = req.query;

    let query = db
      .select({
        id: attendanceRecords.id,
        date: attendanceRecords.date,
        checkInTime: attendanceRecords.checkInTime,
        checkOutTime: attendanceRecords.checkOutTime,
        workingHours: attendanceRecords.workingHours,
        overtimeHours: attendanceRecords.overtimeHours,
        status: attendanceRecords.status,
        isLocationVerified: attendanceRecords.isLocationVerified,
        isIpVerified: attendanceRecords.isIpVerified,
        employeeNotes: attendanceRecords.employeeNotes,
        adminNotes: attendanceRecords.adminNotes,
        workLocation: {
          id: workLocations.id,
          name: workLocations.name,
          city: workLocations.city
        }
      })
      .from(attendanceRecords)
      .leftJoin(workLocations, eq(attendanceRecords.workLocationId, workLocations.id))
      .where(eq(attendanceRecords.userId, userId));

    const conditions = [];
    if (startDate) {
      conditions.push(gte(attendanceRecords.date, startDate as string));
    }
    if (endDate) {
      conditions.push(lte(attendanceRecords.date, endDate as string));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(eq(attendanceRecords.userId, userId), ...conditions));
    }

    const records = await query
      .orderBy(desc(attendanceRecords.date))
      .limit(Number(limit))
      .offset(Number(offset));

    if (!startDate || !endDate) {
      return res.json(records);
    }

    const employee = req.user as any;
    const weeklyOffDays: number[] = Array.isArray(employee.weeklyOffDays)
      ? employee.weeklyOffDays
      : [0, 6];

    const holidays = await db
      .select({ date: companyHolidays.date, name: companyHolidays.name })
      .from(companyHolidays)
      .where(and(
        gte(companyHolidays.date, startDate as string),
        lte(companyHolidays.date, endDate as string)
      ));
    const holidayMap = new Map(holidays.map(h => [h.date, h.name]));

    const approvedLeaves = await db
      .select({
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        isHalfDay: leaveRequests.isHalfDay,
      })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, userId),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.startDate, endDate as string),
        gte(leaveRequests.endDate, startDate as string)
      ));

    const leaveDateMap = new Map<string, boolean>();
    for (const leave of approvedLeaves) {
      const ls = new Date(leave.startDate);
      const le = new Date(leave.endDate);
      for (let d = new Date(ls); d <= le; d.setDate(d.getDate() + 1)) {
        leaveDateMap.set(d.toISOString().split('T')[0], leave.isHalfDay || false);
      }
    }

    const recordMap = new Map<string, any>();
    for (const r of records) {
      recordMap.set(r.date, r);
    }

    const today = new Date().toISOString().split('T')[0];
    const allRecords: any[] = [];
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (dateStr > today) continue;

      const dayOfWeek = d.getDay();
      const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
      const holidayName = holidayMap.get(dateStr);
      const isLeave = leaveDateMap.has(dateStr);

      const existing = recordMap.get(dateStr);

      let overrideStatus: string | null = null;
      let adminNotes: string | null = null;
      if (holidayName) {
        overrideStatus = 'holiday';
        adminNotes = holidayName;
      } else if (isWeeklyOff) {
        overrideStatus = 'weekly off';
      } else if (isLeave) {
        overrideStatus = leaveDateMap.get(dateStr) ? 'half_day' : 'on leave';
      }

      if (existing) {
        allRecords.push({
          ...existing,
          status: overrideStatus || existing.status,
          adminNotes: adminNotes || existing.adminNotes,
        });
        continue;
      }

      allRecords.push({
        id: null,
        date: dateStr,
        checkInTime: null,
        checkOutTime: null,
        workingHours: null,
        overtimeHours: null,
        status: overrideStatus || 'absent',
        isLocationVerified: false,
        isIpVerified: false,
        employeeNotes: null,
        adminNotes,
        workLocation: null,
      });
    }

    res.json(allRecords);
  } catch (error) {
    console.error('Error getting attendance records:', error);
    sendError(res, error);
  }
});

// Get attendance summary for current user
router.get('/my-summary', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { month, year } = req.query;

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month as string) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year as string) : currentDate.getFullYear();

    const startDate = `${targetYear}-${targetMonth.toString().padStart(2, '0')}-01`;
    const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];

    const records = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        gte(attendanceRecords.date, startDate),
        lte(attendanceRecords.date, endDate)
      ));

    const summary = {
      totalDays: records.length,
      presentDays: records.filter(r => r.status === 'present').length,
      absentDays: records.filter(r => r.status === 'absent').length,
      lateDays: records.filter(r => r.status === 'late').length,
      totalWorkingHours: records.reduce((sum, r) => sum + parseFloat(r.workingHours?.toString() || '0'), 0),
      totalOvertimeHours: records.reduce((sum, r) => sum + parseFloat(r.overtimeHours?.toString() || '0'), 0),
      averageWorkingHours: 0
    };

    if (summary.presentDays > 0) {
      summary.averageWorkingHours = summary.totalWorkingHours / summary.presentDays;
    }

    res.json(summary);
  } catch (error) {
    console.error('Error getting attendance summary:', error);
    sendError(res, error);
  }
});

// Admin: Get all attendance records with filters
router.get('/admin/records', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Check if user has admin permissions
    if (!['Superuser', 'Manager', 'Senior Manager'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { 
      userId, 
      workLocationId, 
      startDate, 
      endDate, 
      status,
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = db
      .select({
        id: attendanceRecords.id,
        date: attendanceRecords.date,
        checkInTime: attendanceRecords.checkInTime,
        checkOutTime: attendanceRecords.checkOutTime,
        workingHours: attendanceRecords.workingHours,
        overtimeHours: attendanceRecords.overtimeHours,
        status: attendanceRecords.status,
        isLocationVerified: attendanceRecords.isLocationVerified,
        isIpVerified: attendanceRecords.isIpVerified,
        employeeNotes: attendanceRecords.employeeNotes,
        adminNotes: attendanceRecords.adminNotes,
        user: {
          id: users.id,
          username: users.username,
          email: users.email
        },
        workLocation: {
          id: workLocations.id,
          name: workLocations.name,
          city: workLocations.city
        }
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id))
      .leftJoin(workLocations, eq(attendanceRecords.workLocationId, workLocations.id));

    // Apply filters
    const conditions = [];
    if (userId) conditions.push(eq(attendanceRecords.userId, parseInt(userId as string)));
    if (workLocationId) conditions.push(eq(attendanceRecords.workLocationId, parseInt(workLocationId as string)));
    if (startDate) conditions.push(gte(attendanceRecords.date, startDate as string));
    if (endDate) conditions.push(lte(attendanceRecords.date, endDate as string));
    if (status) conditions.push(eq(attendanceRecords.status, status as string));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const records = await query
      .orderBy(desc(attendanceRecords.date), desc(attendanceRecords.checkInTime))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json(records);
  } catch (error) {
    console.error('Error getting admin attendance records:', error);
    sendError(res, error);
  }
});

// Helper function to calculate distance between two GPS coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Get attendance issues for management review
router.get('/issues', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { status = 'pending', limit = '50', offset = '0' } = req.query;

    const issues = await db
      .select({
        issue: attendanceIssues,
        user: {
          id: users.id,
          username: users.username,
          email: users.email
        },
        attendanceRecord: {
          id: attendanceRecords.id,
          date: attendanceRecords.date,
          checkInTime: attendanceRecords.checkInTime,
          checkOutTime: attendanceRecords.checkOutTime,
          status: attendanceRecords.status
        }
      })
      .from(attendanceIssues)
      .leftJoin(users, eq(attendanceIssues.userId, users.id))
      .leftJoin(attendanceRecords, eq(attendanceIssues.attendanceRecordId, attendanceRecords.id))
      .where(eq(attendanceIssues.status, status as string))
      .orderBy(desc(attendanceIssues.detectedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json(issues);
  } catch (error) {
    console.error('Error getting attendance issues:', error);
    sendError(res, error);
  }
});

// Resolve attendance issue
router.patch('/issues/:id/resolve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const issueId = parseInt(req.params.id);
    const { resolutionNotes } = req.body;
    const userId = req.user!.id;

    const [updatedIssue] = await db
      .update(attendanceIssues)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolutionNotes,
        updatedAt: new Date()
      })
      .where(eq(attendanceIssues.id, issueId))
      .returning();

    res.json({
      success: true,
      message: 'Attendance issue resolved',
      issue: updatedIssue
    });
  } catch (error) {
    console.error('Error resolving attendance issue:', error);
    sendError(res, error);
  }
});

// Approve incomplete attendance record
router.patch('/records/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const { approvalNotes } = req.body;
    const userId = req.user!.id;

    const [updatedRecord] = await db
      .update(attendanceRecords)
      .set({
        requiresApproval: false,
        approvedBy: userId,
        approvalDate: new Date(),
        approvalNotes,
        updatedAt: new Date()
      })
      .where(eq(attendanceRecords.id, recordId))
      .returning();

    res.json({
      success: true,
      message: 'Attendance record approved',
      record: updatedRecord
    });
  } catch (error) {
    console.error('Error approving attendance record:', error);
    sendError(res, error);
  }
});

// Manual trigger for midnight processing (for testing)
router.post('/process-midnight', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await attendanceMidnightProcessor.manualTrigger();
    res.json(result);
  } catch (error) {
    console.error('Error in manual midnight processing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to trigger midnight processing' 
    });
  }
});

// Process historical DWAR compliance for a date range (admin only)
router.post('/process-historical-dwar', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    if (!userRole || !['Superuser', 'Administrator', 'General Manager', 'HR'].includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only administrators can run historical DWAR compliance processing' 
      });
    }

    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'Dates must be in YYYY-MM-DD format'
      });
    }

    // Validate date ordering
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before or equal to endDate'
      });
    }

    // Limit date range to 90 days maximum
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 90) {
      return res.status(400).json({
        success: false,
        message: 'Date range cannot exceed 90 days. Please process in smaller batches.'
      });
    }

    console.log(`Admin ${req.user?.username} triggered historical DWAR processing from ${startDate} to ${endDate}`);
    
    const result = await attendanceMidnightProcessor.processHistoricalDwarCompliance(startDate, endDate);
    res.json(result);
  } catch (error) {
    console.error('Error in historical DWAR processing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process historical DWAR compliance' 
    });
  }
});

// Get daily Buddha quote
router.get('/daily-quote', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    // Handle leap years by capping at 365
    const quoteDayOfYear = dayOfYear > 365 ? 365 : dayOfYear;
    
    const [quote] = await db
      .select()
      .from(dailyQuotes)
      .where(eq(dailyQuotes.dayOfYear, quoteDayOfYear));

    if (!quote) {
      // Fallback to day 1 if specific day not found
      const [fallbackQuote] = await db
        .select()
        .from(dailyQuotes)
        .where(eq(dailyQuotes.dayOfYear, 1));
      
      return res.json(fallbackQuote || {
        quoteText: "Three things cannot be long hidden: the sun, the moon, and the truth.",
        attribution: "Buddha",
        source: "Dhammapada"
      });
    }

    res.json(quote);
  } catch (error) {
    console.error('Error getting daily quote:', error);
    sendError(res, error);
  }
});

router.post('/regularization', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { requestDate, requestType, reason } = req.body;

    if (!requestDate || !requestType || !reason) {
      return res.status(400).json({ error: 'requestDate, requestType, and reason are required' });
    }

    const validTypes = ['outdoor_duty', 'missed_checkout', 'full_day_regularization'];
    if (!validTypes.includes(requestType)) {
      return res.status(400).json({ error: 'Invalid request type. Use Leave Request for full-day absences.' });
    }
    const effectiveRequestType = requestType === 'full_day_regularization' ? 'outdoor_duty' : requestType;

    const [attendanceState] = await db.select({
      checkInTime: attendanceRecords.checkInTime,
      checkOutTime: attendanceRecords.checkOutTime,
      status: attendanceRecords.status,
    }).from(attendanceRecords).where(and(
      eq(attendanceRecords.userId, user.id),
      eq(attendanceRecords.date, requestDate)
    ));

    const hasCheckIn = !!attendanceState?.checkInTime;
    const hasCheckOut = !!attendanceState?.checkOutTime;
    const isMissingCheckout = hasCheckIn && !hasCheckOut;
    const isNoRecord = !attendanceState || (!hasCheckIn && !hasCheckOut) || attendanceState.status === 'absent';

    if (effectiveRequestType === 'missed_checkout' && !isMissingCheckout) {
      return res.status(400).json({ error: 'Missed Check-Out is only valid when check-in exists but check-out is missing' });
    }
    if (effectiveRequestType === 'outdoor_duty' && isMissingCheckout) {
      return res.status(400).json({ error: 'Outdoor Duty is not valid for a date with existing check-in. Use Missed Check-Out instead.' });
    }

    const lockCheck = await checkPayrollLock('attendance', requestDate, user.id);
    if (lockCheck.isLocked) {
      return res.status(403).json({ error: 'Payroll is locked for this period. Regularization cannot be submitted.' });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const reqDate = new Date(requestDate);
    if (reqDate > today) {
      return res.status(400).json({ error: 'Cannot submit regularization for a future date' });
    }
    if (effectiveRequestType === 'missed_checkout' && requestDate === todayStr) {
      return res.status(400).json({ error: 'Cannot submit a missed check-out regularization for today. Please use the Check Out button instead.' });
    }

    const existing = await db.select().from(attendanceRegularizations)
      .where(and(
        eq(attendanceRegularizations.employeeId, user.id),
        eq(attendanceRegularizations.requestDate, requestDate),
        eq(attendanceRegularizations.requestType, effectiveRequestType)
      ));
    if (existing.length > 0) {
      return res.status(409).json({ error: 'A regularization request already exists for this date and type' });
    }

    const [attendanceRec] = await db.select().from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, user.id),
        eq(attendanceRecords.date, requestDate)
      ));

    const [empUser] = await db.select({ reportingManagerId: users.reportingManagerId }).from(users).where(eq(users.id, user.id));
    const approverId = empUser?.reportingManagerId || null;

    const originalData = attendanceRec ? {
      checkInTime: attendanceRec.checkInTime,
      checkOutTime: attendanceRec.checkOutTime,
      status: attendanceRec.status,
      workingHours: attendanceRec.workingHours,
    } : { status: 'no_record' };

    const empName = `${user.firstName || ''}${user.lastName ? ' ' + user.lastName : ''}`.trim() || user.username;

    const auditEntry = [{
      action: 'submitted',
      by: user.id,
      byName: empName,
      at: new Date().toISOString(),
      details: `Regularization request submitted: ${effectiveRequestType}`,
    }];

    const [reg] = await db.insert(attendanceRegularizations).values({
      employeeId: user.id,
      attendanceRecordId: attendanceRec?.id || null,
      requestDate,
      requestType: effectiveRequestType,
      correctedCheckIn: null,
      correctedCheckOut: null,
      reason,
      status: 'pending',
      approverId,
      originalData,
      auditTrail: auditEntry,
    }).returning();

    const typeLabel = REQUEST_TYPE_LABELS[effectiveRequestType] || effectiveRequestType;

    if (approverId) {
      await createNotification({
        userId: approverId,
        type: 'approval_request',
        title: `Attendance Regularization: ${empName}`,
        message: `${empName} has submitted a ${typeLabel} regularization request for ${requestDate}. Reason: ${reason}`,
        link: '/attendance/regularization',
        sourceType: 'attendance_regularization',
        sourceId: reg.id,
        createdBy: user.id,
      });
    }

    res.status(201).json(reg);
  } catch (error: any) {
    console.error('Error creating regularization:', error);
    sendError(res, error);
  }
});

router.get('/regularization/absent-days', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    console.log('[absent-days] Fetching for user:', user.id, 'query:', req.query);
    const { month, year } = req.query;
    const now = new Date();
    const targetMonth = month ? parseInt(month as string) - 1 : now.getMonth();
    const targetYear = year ? parseInt(year as string) : now.getFullYear();

    const firstDay = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(targetYear, targetMonth + 1, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const endDate = lastDay < today ? lastDay : today;
    const startStr = firstDay.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const existingRecords = await db
      .select({ date: attendanceRecords.date, status: attendanceRecords.status, checkInTime: attendanceRecords.checkInTime, checkOutTime: attendanceRecords.checkOutTime })
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, user.id),
        gte(attendanceRecords.date, startStr),
        lte(attendanceRecords.date, endStr)
      ));

    const attendanceMap = new Map<string, any>();
    for (const rec of existingRecords) {
      attendanceMap.set(rec.date, rec);
    }

    const approvedLeaves = await db
      .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, user.id),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.startDate, endStr),
        gte(leaveRequests.endDate, startStr)
      ));

    const leaveDates = new Set<string>();
    for (const leave of approvedLeaves) {
      const ls = new Date(leave.startDate);
      const le = new Date(leave.endDate);
      for (let d = new Date(ls); d <= le; d.setDate(d.getDate() + 1)) {
        leaveDates.add(d.toISOString().split('T')[0]);
      }
    }

    const holidays = await db
      .select({ date: companyHolidays.date })
      .from(companyHolidays)
      .where(and(
        gte(companyHolidays.date, startStr),
        lte(companyHolidays.date, endStr)
      ));
    const holidayDates = new Set(holidays.map(h => h.date));

    const existingRegs = await db
      .select({ requestDate: attendanceRegularizations.requestDate, status: attendanceRegularizations.status })
      .from(attendanceRegularizations)
      .where(and(
        eq(attendanceRegularizations.employeeId, user.id),
        inArray(attendanceRegularizations.status, ['pending', 'approved']),
        gte(attendanceRegularizations.requestDate, startStr),
        lte(attendanceRegularizations.requestDate, endStr)
      ));
    const excludedRegDates = new Set(existingRegs.map(r => r.requestDate));

    const [userRecord] = await db.select({ weeklyOffDays: users.weeklyOffDays }).from(users).where(eq(users.id, user.id));
    const weeklyOff = new Set<number>(userRecord?.weeklyOffDays || [0]);

    const absentDays: Array<{ date: string; dayName: string; reason: string }> = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let d = new Date(firstDay); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();

      if (weeklyOff.has(dayOfWeek)) continue;
      if (holidayDates.has(dateStr)) continue;
      if (leaveDates.has(dateStr)) continue;
      if (excludedRegDates.has(dateStr)) continue;

      const record = attendanceMap.get(dateStr);
      if (!record) {
        absentDays.push({ date: dateStr, dayName: dayNames[dayOfWeek], reason: 'No Check-In & Out', attendanceState: 'no_record' });
      } else if (record.checkInTime && !record.checkOutTime) {
        absentDays.push({ date: dateStr, dayName: dayNames[dayOfWeek], reason: 'No Check-Out', attendanceState: 'missing_checkout' });
      } else if (!record.checkInTime && !record.checkOutTime) {
        absentDays.push({ date: dateStr, dayName: dayNames[dayOfWeek], reason: 'No Check-In & Out', attendanceState: 'no_record' });
      } else if (record.status === 'absent') {
        absentDays.push({ date: dateStr, dayName: dayNames[dayOfWeek], reason: 'Absent', attendanceState: 'absent' });
      }
    }

    console.log('[absent-days] Found', absentDays.length, 'absent days');
    res.json(absentDays);
  } catch (error) {
    console.error('Error fetching absent days:', error);
    sendError(res, error);
  }
});

router.get('/regularization/my-requests', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { status } = req.query;

    let conditions: any[] = [eq(attendanceRegularizations.employeeId, user.id)];
    if (status && status !== 'all') {
      conditions.push(eq(attendanceRegularizations.status, status as string));
    }

    const requests = await db.select({
      id: attendanceRegularizations.id,
      employeeId: attendanceRegularizations.employeeId,
      requestDate: attendanceRegularizations.requestDate,
      requestType: attendanceRegularizations.requestType,
      correctedCheckIn: attendanceRegularizations.correctedCheckIn,
      correctedCheckOut: attendanceRegularizations.correctedCheckOut,
      reason: attendanceRegularizations.reason,
      status: attendanceRegularizations.status,
      approverId: attendanceRegularizations.approverId,
      approvedAt: attendanceRegularizations.approvedAt,
      approverRemarks: attendanceRegularizations.approverRemarks,
      rejectedAt: attendanceRegularizations.rejectedAt,
      rejectionReason: attendanceRegularizations.rejectionReason,
      appliedToAttendance: attendanceRegularizations.appliedToAttendance,
      createdAt: attendanceRegularizations.createdAt,
      approverName: users.firstName,
    })
    .from(attendanceRegularizations)
    .leftJoin(users, eq(attendanceRegularizations.approverId, users.id))
    .where(and(...conditions))
    .orderBy(desc(attendanceRegularizations.createdAt));

    res.json(requests);
  } catch (error) {
    console.error('Error fetching regularization requests:', error);
    sendError(res, error);
  }
});

router.get('/regularization/pending-approvals', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    let conditions: any[] = [
      eq(attendanceRegularizations.status, 'pending'),
      eq(attendanceRegularizations.approverId, user.id),
    ];

    const pending = await db.select({
      id: attendanceRegularizations.id,
      employeeId: attendanceRegularizations.employeeId,
      requestDate: attendanceRegularizations.requestDate,
      requestType: attendanceRegularizations.requestType,
      correctedCheckIn: attendanceRegularizations.correctedCheckIn,
      correctedCheckOut: attendanceRegularizations.correctedCheckOut,
      reason: attendanceRegularizations.reason,
      status: attendanceRegularizations.status,
      originalData: attendanceRegularizations.originalData,
      createdAt: attendanceRegularizations.createdAt,
      employeeName: users.firstName,
      employeeCode: users.employeeCode,
    })
    .from(attendanceRegularizations)
    .innerJoin(users, eq(attendanceRegularizations.employeeId, users.id))
    .where(and(...conditions))
    .orderBy(asc(attendanceRegularizations.createdAt));

    res.json(pending);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    sendError(res, error);
  }
});

router.post('/regularization/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const regId = parseInt(req.params.id);
    const { remarks } = req.body;

    const [reg] = await db.select().from(attendanceRegularizations).where(eq(attendanceRegularizations.id, regId));
    if (!reg) return res.status(404).json({ error: 'Request not found' });
    if (reg.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    if (reg.approverId !== user.id) {
      return res.status(403).json({ error: 'You are not authorized to approve this request' });
    }

    const lockCheck = await checkPayrollLock('attendance', reg.requestDate, reg.employeeId);
    if (lockCheck.isLocked) {
      return res.status(403).json({ error: 'Payroll is locked for this period. Cannot approve regularization.' });
    }

    const approverName = `${user.firstName || ''}${user.lastName ? ' ' + user.lastName : ''}`.trim() || user.username;

    const existingTrail = (reg.auditTrail as any[]) || [];
    existingTrail.push({
      action: 'approved',
      by: user.id,
      byName: approverName,
      at: new Date().toISOString(),
      remarks,
    });

    let appliedToAttendance = false;

    const [employee] = await db.select({
      dutyTimeIn: users.dutyTimeIn,
      dutyTimeOut: users.dutyTimeOut,
      minimumDailyHours: users.minimumDailyHours,
    }).from(users).where(eq(users.id, reg.employeeId));

    const dutyIn = employee?.dutyTimeIn || '09:00';
    const dutyOut = employee?.dutyTimeOut || '18:00';

    function buildDutyDateTime(dateStr: string, timeStr: string): Date {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const dt = new Date(dateStr + 'T00:00:00');
      dt.setHours(hours, minutes, 0, 0);
      return dt;
    }

    const dutyCheckIn = buildDutyDateTime(reg.requestDate, dutyIn);
    const dutyCheckOut = buildDutyDateTime(reg.requestDate, dutyOut);

    const [existingAttendance] = await db.select().from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, reg.employeeId),
        eq(attendanceRecords.date, reg.requestDate)
      ));

    if (reg.requestType === 'outdoor_duty') {
      if (existingAttendance) {
        await db.update(attendanceRecords).set({
          status: 'present',
          checkInTime: dutyCheckIn,
          checkOutTime: dutyCheckOut,
          workingHours: calculateWorkingHours(dutyCheckIn, dutyCheckOut),
          adminNotes: `Regularized: Outdoor duty - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: `Outdoor duty regularization approved`,
          adjustmentDate: new Date(),
          updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, existingAttendance.id));
      } else {
        await db.insert(attendanceRecords).values({
          userId: reg.employeeId,
          date: reg.requestDate,
          checkInTime: dutyCheckIn,
          checkOutTime: dutyCheckOut,
          workingHours: calculateWorkingHours(dutyCheckIn, dutyCheckOut),
          status: 'present',
          adminNotes: `Regularized: Outdoor duty - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: `Outdoor duty regularization approved`,
          adjustmentDate: new Date(),
        });
      }
      appliedToAttendance = true;
    } else if (reg.requestType === 'missed_checkin') {
      if (existingAttendance) {
        await db.update(attendanceRecords).set({
          checkInTime: dutyCheckIn,
          status: existingAttendance.checkOutTime ? 'present' : existingAttendance.status,
          workingHours: calculateWorkingHours(dutyCheckIn, existingAttendance.checkOutTime),
          isIncomplete: false,
          adminNotes: `Regularized: Missed check-in - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: `Missed check-in regularization approved`,
          adjustmentDate: new Date(),
          updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, existingAttendance.id));
        appliedToAttendance = true;
      } else {
        await db.insert(attendanceRecords).values({
          userId: reg.employeeId,
          date: reg.requestDate,
          checkInTime: dutyCheckIn,
          checkOutTime: dutyCheckOut,
          workingHours: calculateWorkingHours(dutyCheckIn, dutyCheckOut),
          status: 'present',
          adminNotes: `Regularized: Missed check-in (no existing record, full day applied) - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: `Missed check-in regularization approved - no existing record, full day from duty schedule`,
          adjustmentDate: new Date(),
        });
        appliedToAttendance = true;
      }
    } else if (reg.requestType === 'missed_checkout') {
      if (existingAttendance && existingAttendance.checkInTime) {
        const actualCheckIn = new Date(existingAttendance.checkInTime);
        let resolvedCheckOut: Date;
        if (reg.correctedCheckOut) {
          resolvedCheckOut = new Date(reg.correctedCheckOut);
        } else {
          resolvedCheckOut = dutyCheckOut;
        }
        const regStatusResult = await determineAttendanceStatus({
          userId: reg.employeeId,
          date: reg.requestDate,
          checkInTime: actualCheckIn,
          checkOutTime: resolvedCheckOut,
          userConfig: {
            minimumDailyHours: employee?.minimumDailyHours,
            halfDayMinimumHours: null,
            weeklyOffDays: null,
          },
          workLocationId: existingAttendance.workLocationId,
        });
        await db.update(attendanceRecords).set({
          checkOutTime: resolvedCheckOut,
          status: regStatusResult.status,
          workingHours: regStatusResult.workingHours.toFixed(2),
          isIncomplete: false,
          adminNotes: `Regularized: Missed check-out - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: reg.correctedCheckOut
            ? `Missed check-out regularization approved - corrected check-out time used`
            : `Missed check-out regularization approved - duty end time used as fallback`,
          adjustmentDate: new Date(),
          updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, existingAttendance.id));
        appliedToAttendance = true;
      } else {
        await db.insert(attendanceRecords).values({
          userId: reg.employeeId,
          date: reg.requestDate,
          checkInTime: dutyCheckIn,
          checkOutTime: dutyCheckOut,
          workingHours: calculateWorkingHours(dutyCheckIn, dutyCheckOut),
          status: 'present',
          adminNotes: `Regularized: Missed check-out (no existing record, full day applied) - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: `Missed check-out regularization approved - no existing record, full day from duty schedule`,
          adjustmentDate: new Date(),
        });
        appliedToAttendance = true;
      }
    } else if (reg.requestType === 'full_day_regularization') {
      if (existingAttendance) {
        await db.update(attendanceRecords).set({
          checkInTime: dutyCheckIn,
          checkOutTime: dutyCheckOut,
          status: 'present',
          workingHours: calculateWorkingHours(dutyCheckIn, dutyCheckOut),
          isIncomplete: false,
          adminNotes: `Regularized: Full day - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: `Full day regularization approved`,
          adjustmentDate: new Date(),
          updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, existingAttendance.id));
      } else {
        await db.insert(attendanceRecords).values({
          userId: reg.employeeId,
          date: reg.requestDate,
          checkInTime: dutyCheckIn,
          checkOutTime: dutyCheckOut,
          workingHours: calculateWorkingHours(dutyCheckIn, dutyCheckOut),
          status: 'present',
          adminNotes: `Regularized: Full day - ${reg.reason}`,
          adminAdjustment: { type: 'regularization', regularizationId: reg.id },
          adjustedBy: user.id,
          adjustmentReason: `Full day regularization approved`,
          adjustmentDate: new Date(),
        });
      }
      appliedToAttendance = true;
    }

    await db.update(attendanceRegularizations).set({
      status: 'approved',
      approverId: user.id,
      approvedAt: new Date(),
      approverRemarks: remarks || null,
      appliedToAttendance,
      correctedCheckIn: dutyCheckIn,
      correctedCheckOut: dutyCheckOut,
      auditTrail: existingTrail,
      updatedAt: new Date(),
    }).where(eq(attendanceRegularizations.id, regId));

    const typeLabel = REQUEST_TYPE_LABELS[reg.requestType] || reg.requestType;
    await createNotification({
      userId: reg.employeeId,
      type: 'approval_decision',
      title: `Regularization Approved: ${typeLabel}`,
      message: `Your attendance regularization for ${reg.requestDate} (${typeLabel}) has been approved by ${approverName}.${remarks ? ` Remarks: ${remarks}` : ''} Your attendance record has been updated.`,
      link: '/attendance/regularization',
      sourceType: 'attendance_regularization',
      sourceId: reg.id,
      createdBy: user.id,
    });

    const [updated] = await db.select().from(attendanceRegularizations).where(eq(attendanceRegularizations.id, regId));
    res.json(updated);
  } catch (error) {
    console.error('Error approving regularization:', error);
    sendError(res, error);
  }
});

router.post('/regularization/:id/reject', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const regId = parseInt(req.params.id);
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const [reg] = await db.select().from(attendanceRegularizations).where(eq(attendanceRegularizations.id, regId));
    if (!reg) return res.status(404).json({ error: 'Request not found' });
    if (reg.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    if (reg.approverId !== user.id) {
      return res.status(403).json({ error: 'You are not authorized to reject this request' });
    }

    const rejecterName = `${user.firstName || ''}${user.lastName ? ' ' + user.lastName : ''}`.trim() || user.username;

    const existingTrail = (reg.auditTrail as any[]) || [];
    existingTrail.push({
      action: 'rejected',
      by: user.id,
      byName: rejecterName,
      at: new Date().toISOString(),
      rejectionReason,
    });

    await db.update(attendanceRegularizations).set({
      status: 'rejected',
      rejectedBy: user.id,
      rejectedAt: new Date(),
      rejectionReason,
      auditTrail: existingTrail,
      updatedAt: new Date(),
    }).where(eq(attendanceRegularizations.id, regId));

    const typeLabel = REQUEST_TYPE_LABELS[reg.requestType] || reg.requestType;
    await createNotification({
      userId: reg.employeeId,
      type: 'approval_decision',
      title: `Regularization Rejected: ${typeLabel}`,
      message: `Your attendance regularization for ${reg.requestDate} (${typeLabel}) has been rejected by ${rejecterName}. Reason: ${rejectionReason}`,
      link: '/attendance/regularization',
      sourceType: 'attendance_regularization',
      sourceId: reg.id,
      createdBy: user.id,
    });

    const [updated] = await db.select().from(attendanceRegularizations).where(eq(attendanceRegularizations.id, regId));
    res.json(updated);
  } catch (error) {
    console.error('Error rejecting regularization:', error);
    sendError(res, error);
  }
});

router.delete('/regularization/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const regId = parseInt(req.params.id);

    const [reg] = await db.select().from(attendanceRegularizations).where(eq(attendanceRegularizations.id, regId));
    if (!reg) return res.status(404).json({ error: 'Request not found' });
    if (reg.employeeId !== user.id) return res.status(403).json({ error: 'You can only cancel your own requests' });
    if (reg.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled' });

    await db.delete(attendanceRegularizations).where(eq(attendanceRegularizations.id, regId));
    res.json({ message: 'Request cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling regularization:', error);
    sendError(res, error);
  }
});

router.get('/regularization/all', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userRole = user.role || '';
    const isAdmin = ['Superuser', 'General Manager', 'Senior Manager'].includes(userRole);
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { status, employeeId } = req.query;
    let conditions: any[] = [];
    if (status && status !== 'all') {
      conditions.push(eq(attendanceRegularizations.status, status as string));
    }
    if (employeeId) {
      conditions.push(eq(attendanceRegularizations.employeeId, parseInt(employeeId as string)));
    }

    const allRequests = await db.select({
      id: attendanceRegularizations.id,
      employeeId: attendanceRegularizations.employeeId,
      requestDate: attendanceRegularizations.requestDate,
      requestType: attendanceRegularizations.requestType,
      correctedCheckIn: attendanceRegularizations.correctedCheckIn,
      correctedCheckOut: attendanceRegularizations.correctedCheckOut,
      reason: attendanceRegularizations.reason,
      status: attendanceRegularizations.status,
      approverId: attendanceRegularizations.approverId,
      approvedAt: attendanceRegularizations.approvedAt,
      approverRemarks: attendanceRegularizations.approverRemarks,
      rejectedAt: attendanceRegularizations.rejectedAt,
      rejectionReason: attendanceRegularizations.rejectionReason,
      appliedToAttendance: attendanceRegularizations.appliedToAttendance,
      originalData: attendanceRegularizations.originalData,
      auditTrail: attendanceRegularizations.auditTrail,
      createdAt: attendanceRegularizations.createdAt,
      employeeName: users.firstName,
      employeeCode: users.employeeCode,
    })
    .from(attendanceRegularizations)
    .innerJoin(users, eq(attendanceRegularizations.employeeId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(attendanceRegularizations.createdAt));

    res.json(allRequests);
  } catch (error) {
    console.error('Error fetching all regularizations:', error);
    sendError(res, error);
  }
});

function calculateWorkingHours(checkIn: Date | null | undefined, checkOut: Date | null | undefined): string | null {
  if (!checkIn || !checkOut) return null;
  const inTime = new Date(checkIn);
  const outTime = new Date(checkOut);
  const diff = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
  return Math.max(0, diff).toFixed(2);
}

export default router;