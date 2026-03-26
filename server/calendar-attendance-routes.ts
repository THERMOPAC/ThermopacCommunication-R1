import { Router, Request, Response } from 'express';
import { db } from './db';
import {
  attendanceRecords,
  users,
  workweekPolicies,
  employeeWorkweekAssignments,
  companyHolidays,
  leaveRequests,
  leaveTypes,
  payrollRecords,
  payrollPeriods,
} from '@shared/schema';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();
router.use(ensureAuthenticated);

function ensurePayrollAdmin(req: Request, res: Response, next: Function) {
  const user = req.user as any;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const allowedRoles = ['Superuser', 'Admin', 'HR Manager', 'Finance Manager', 'Manager', 'Senior Manager', 'Employee'];
  if (!allowedRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

router.get('/calendar-data/:userId/:year/:month', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (!userId || !year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const [employee] = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      cardName: users.cardName,
      userType: users.userType,
      dateOfJoining: users.dateOfJoining,
      weeklyOffDays: users.weeklyOffDays,
    }).from(users).where(eq(users.id, userId));

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const assignment = await db.select({
      policyId: employeeWorkweekAssignments.workweekPolicyId,
      customWorkingDays: employeeWorkweekAssignments.customWorkingDays,
    }).from(employeeWorkweekAssignments)
      .where(and(
        eq(employeeWorkweekAssignments.employeeId, userId),
        eq(employeeWorkweekAssignments.isActive, true),
      ))
      .limit(1);

    let workingDaysConfig = [1, 2, 3, 4, 5];
    let policyName = 'Default (Mon-Fri)';

    if (assignment.length > 0) {
      const [policy] = await db.select().from(workweekPolicies).where(eq(workweekPolicies.id, assignment[0].policyId));
      if (policy) {
        workingDaysConfig = (assignment[0].customWorkingDays || policy.workingDays) as number[];
        policyName = policy.name;
      }
    } else if (employee.weeklyOffDays) {
      const offDays = employee.weeklyOffDays as number[];
      if (offDays.length > 0) {
        workingDaysConfig = [0, 1, 2, 3, 4, 5, 6].filter(d => !offDays.includes(d));
        policyName = offDays.length === 1 && offDays[0] === 0 
          ? 'Sunday Off Only' 
          : offDays.includes(0) && offDays.includes(6) 
            ? 'Sat-Sun Off' 
            : `Custom (Off: ${offDays.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')})`;
      }
    }

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const holidays = await db.select({
      id: companyHolidays.id,
      name: companyHolidays.name,
      date: companyHolidays.date,
      isOptional: companyHolidays.isOptional,
    }).from(companyHolidays)
      .where(and(
        gte(companyHolidays.date, monthStart),
        lte(companyHolidays.date, monthEnd),
      ));

    const leaves = await db.select({
      id: leaveRequests.id,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      status: leaveRequests.status,
      isHalfDay: leaveRequests.isHalfDay,
      totalDays: leaveRequests.totalDays,
      leaveTypeName: leaveTypes.name,
      leaveTypeCode: leaveTypes.code,
      isPaid: leaveTypes.isPaid,
    }).from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveRequests.employeeId, userId),
        lte(leaveRequests.startDate, monthEnd),
        gte(leaveRequests.endDate, monthStart),
        inArray(leaveRequests.status, ['approved', 'pending']),
      ));

    const existingAttendance = await db.select({
      id: attendanceRecords.id,
      date: attendanceRecords.date,
      status: attendanceRecords.status,
      source: attendanceRecords.source,
      workingHours: attendanceRecords.workingHours,
    }).from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        gte(attendanceRecords.date, monthStart),
        lte(attendanceRecords.date, monthEnd),
        eq(attendanceRecords.source, 'manual_calendar'),
      ));

    const existingPayroll = await db.select({
      id: payrollRecords.id,
      status: payrollRecords.status,
    }).from(payrollRecords)
      .innerJoin(payrollPeriods, eq(payrollRecords.periodId, payrollPeriods.id))
      .where(and(
        eq(payrollRecords.userId, userId),
        lte(payrollPeriods.startDate, monthEnd),
        gte(payrollPeriods.endDate, monthStart),
      ))
      .limit(1);

    const isLocked = existingPayroll.length > 0 && 
      ['verified', 'transferred', 'sap_posted'].includes(existingPayroll[0].status || '');

    const allDays = getDaysInMonth(year, month);
    const holidayMap = new Map(holidays.map(h => [h.date, h]));

    const leaveDayMap = new Map<string, { status: string; leaveTypeName: string; leaveTypeCode: string; isPaid: boolean | null; isHalfDay: boolean | null }>();
    for (const leave of leaves) {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        if (dateStr >= monthStart && dateStr <= monthEnd) {
          leaveDayMap.set(dateStr, {
            status: leave.status,
            leaveTypeName: leave.leaveTypeName,
            leaveTypeCode: leave.leaveTypeCode,
            isPaid: leave.isPaid,
            isHalfDay: leave.isHalfDay,
          });
        }
      }
    }

    const attendanceMap = new Map(existingAttendance.map(a => [a.date, a]));

    const calendarDays = allDays.map(day => {
      const dateStr = formatDate(day);
      const dayOfWeek = day.getDay();
      const isWeeklyHoliday = !workingDaysConfig.includes(dayOfWeek);
      const holiday = holidayMap.get(dateStr);
      const leave = leaveDayMap.get(dateStr);
      const attendance = attendanceMap.get(dateStr);

      let dayType: string;
      let editable = false;

      if (isWeeklyHoliday) {
        dayType = 'weekly_holiday';
      } else if (holiday && !holiday.isOptional) {
        dayType = 'company_holiday';
      } else if (leave) {
        dayType = leave.status === 'approved' ? 'approved_leave' : 'pending_leave';
      } else {
        dayType = 'working_day';
        editable = !isLocked;
      }

      return {
        date: dateStr,
        dayOfWeek,
        dayType,
        editable,
        status: attendance?.status || null,
        holiday: holiday ? { name: holiday.name, isOptional: holiday.isOptional } : null,
        leave: leave ? {
          status: leave.status,
          leaveTypeName: leave.leaveTypeName,
          leaveTypeCode: leave.leaveTypeCode,
          isPaid: leave.isPaid,
          isHalfDay: leave.isHalfDay,
        } : null,
      };
    });

    let workingDays = 0;
    let weeklyHolidays = 0;
    let companyHolidayCount = 0;
    let approvedLeaves = 0;
    let pendingLeaves = 0;

    calendarDays.forEach(d => {
      if (d.dayType === 'weekly_holiday') weeklyHolidays++;
      else if (d.dayType === 'company_holiday') companyHolidayCount++;
      else if (d.dayType === 'approved_leave') approvedLeaves++;
      else if (d.dayType === 'pending_leave') pendingLeaves++;
      else workingDays++;
    });

    const markedPresent = calendarDays.filter(d => d.status === 'present').length;
    const markedHalfDay = calendarDays.filter(d => d.status === 'half_day').length;
    const markedAbsent = workingDays - markedPresent - markedHalfDay;

    res.json({
      employee: {
        id: employee.id,
        name: employee.cardName || [employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.username,
        userType: employee.userType,
        dateOfJoining: employee.dateOfJoining,
      },
      policyName,
      workingDaysConfig,
      year,
      month,
      isLocked,
      calendarDays,
      summary: {
        totalCalendarDays: allDays.length,
        weeklyHolidays,
        companyHolidays: companyHolidayCount,
        approvedLeaves,
        pendingLeaves,
        netWorkingDays: workingDays,
        presentDays: markedPresent,
        halfDays: markedHalfDay,
        absentDays: markedAbsent > 0 ? markedAbsent : 0,
        effectiveWorking: markedPresent + (markedHalfDay * 0.5),
      },
    });
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

router.post('/save-attendance', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, year, month, attendance } = req.body;

    if (!userId || !year || !month || !Array.isArray(attendance)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const existingPayroll = await db.select({
      id: payrollRecords.id,
      status: payrollRecords.status,
    }).from(payrollRecords)
      .innerJoin(payrollPeriods, eq(payrollRecords.periodId, payrollPeriods.id))
      .where(and(
        eq(payrollRecords.userId, userId),
        lte(payrollPeriods.startDate, monthEnd),
        gte(payrollPeriods.endDate, monthStart),
      ))
      .limit(1);

    if (existingPayroll.length > 0 && 
        ['verified', 'transferred', 'sap_posted'].includes(existingPayroll[0].status || '')) {
      return res.status(400).json({ error: 'Attendance is locked — payroll already verified/transferred for this period.' });
    }

    await db.delete(attendanceRecords).where(and(
      eq(attendanceRecords.userId, userId),
      gte(attendanceRecords.date, monthStart),
      lte(attendanceRecords.date, monthEnd),
      eq(attendanceRecords.source, 'manual_calendar'),
    ));

    const adminUser = req.user as any;
    const records = attendance.map((entry: { date: string; status: string }) => ({
      userId,
      date: entry.date,
      status: entry.status,
      source: 'manual_calendar',
      workingHours: entry.status === 'present' ? '8.00' : entry.status === 'half_day' ? '4.00' : '0',
      adminNotes: `Marked via calendar by ${adminUser.username}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (records.length > 0) {
      for (const record of records) {
        await db.insert(attendanceRecords)
          .values(record)
          .onConflictDoUpdate({
            target: [attendanceRecords.userId, attendanceRecords.date],
            set: {
              status: record.status,
              source: 'manual_calendar',
              workingHours: record.workingHours,
              adminNotes: record.adminNotes,
              updatedAt: new Date(),
            },
          });
      }
    }

    res.json({ 
      success: true, 
      message: `Attendance saved for ${records.length} days`,
      recordCount: records.length,
    });
  } catch (error) {
    console.error('Error saving calendar attendance:', error);
    res.status(500).json({ error: 'Failed to save attendance' });
  }
});

router.get('/non-system-users', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const nonSystemUsers = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      cardName: users.cardName,
      employeeCode: users.employeeCode,
      userType: users.userType,
      isActive: users.isActive,
    }).from(users)
      .where(and(
        eq(users.isActive, true),
        sql`coalesce(${users.userType}, 'system_user') = 'non_system_user'`,
      ));

    const result = nonSystemUsers.map(u => ({
      ...u,
      name: u.cardName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching non-system users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/attendance-status/:userId/:periodId', ensurePayrollAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const periodId = parseInt(req.params.periodId);

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId));
    if (!period) {
      return res.json({ submitted: false, message: 'Period not found' });
    }

    const records = await db.select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        gte(attendanceRecords.date, period.startDate),
        lte(attendanceRecords.date, period.endDate),
        eq(attendanceRecords.source, 'manual_calendar'),
      ))
      .limit(1);

    res.json({ 
      submitted: records.length > 0,
      periodName: period.periodName,
    });
  } catch (error) {
    console.error('Error checking attendance status:', error);
    res.status(500).json({ error: 'Failed to check attendance status' });
  }
});

export default router;
