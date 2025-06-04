import { Router, Request, Response } from 'express';
import { db } from './db';
import { attendanceRecords, attendanceSettings, attendanceIssues, workLocations, users, dailyQuotes } from '@shared/schema';
import { eq, and, gte, lte, desc, sql, isNull } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { attendanceMidnightProcessor } from './attendance-midnight-processor';

const router = Router();

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
    res.status(500).json({ error: 'Failed to get attendance status' });
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
    res.status(500).json({ error: 'Failed to check in' });
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

    // Calculate working hours
    const checkInTime = new Date(existingRecord.checkInTime);
    const workingHours = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

    // Get attendance settings for overtime calculation
    let overtimeHours = 0;
    if (existingRecord.workLocationId) {
      const [settings] = await db
        .select()
        .from(attendanceSettings)
        .where(eq(attendanceSettings.workLocationId, existingRecord.workLocationId));

      if (settings) {
        const standardHours = parseFloat(settings.standardWorkingHours?.toString() || '8');
        const breakHours = settings.automaticBreakDeduction 
          ? (settings.lunchBreakDuration || 60) / 60 
          : 0;
        
        const netWorkingHours = workingHours - breakHours;
        if (netWorkingHours > standardHours) {
          overtimeHours = netWorkingHours - standardHours;
        }
      }
    }

    // Update attendance record
    const [updatedRecord] = await db
      .update(attendanceRecords)
      .set({
        checkOutTime: now,
        checkOutLatitude: latitude,
        checkOutLongitude: longitude,
        checkOutAddress: address,
        checkOutIpAddress: ipAddress,
        checkOutDeviceInfo: deviceInfo,
        workingHours: Number(workingHours.toFixed(2)),
        overtimeHours: Number(overtimeHours.toFixed(2)),
        employeeNotes,
        updatedAt: now
      })
      .where(eq(attendanceRecords.id, existingRecord.id))
      .returning();

    res.json({
      success: true,
      message: 'Checked out successfully',
      record: updatedRecord,
      workingHours: Number(workingHours.toFixed(2)),
      overtimeHours: Number(overtimeHours.toFixed(2))
    });
  } catch (error) {
    console.error('Error during check-out:', error);
    res.status(500).json({ error: 'Failed to check out' });
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

    res.json(records);
  } catch (error) {
    console.error('Error getting attendance records:', error);
    res.status(500).json({ error: 'Failed to get attendance records' });
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
    res.status(500).json({ error: 'Failed to get attendance summary' });
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
    res.status(500).json({ error: 'Failed to get attendance records' });
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
    res.status(500).json({ error: 'Failed to get attendance issues' });
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
    res.status(500).json({ error: 'Failed to resolve attendance issue' });
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
    res.status(500).json({ error: 'Failed to approve attendance record' });
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
    res.status(500).json({ error: 'Failed to get daily quote' });
  }
});

export default router;