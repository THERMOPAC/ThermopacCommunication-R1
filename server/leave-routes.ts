import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
import { Router, Request, Response } from "express";
import { ensureAuthenticated } from "./auth-middleware";
import { db } from "./db";
import { leaveTypes, leaveBalances, leaveRequests, companyHolidays, users, attendanceRecords, leaveDeductions, leaveAccrualLog, leaveBalanceAdjustments } from "@shared/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { checkModulePermission } from "./utils/permission-utils";
import { checkPayrollLock } from './payroll-lock-service';
import { createNotification } from './notification-routes';
import { computeSandwichLeave } from './sandwich-leave-utils';
import {
  applyLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  revokeApprovedLeave,
  runMonthlyClAccrual,
  runYearEndClCarryover,
  SANDWICH_EFFECTIVE_DATE as SVC_SANDWICH_DATE,
} from './leave-service';

// Sandwich leave applies FORWARD only — no retro-deduction for pre-cutover requests.
const SANDWICH_EFFECTIVE_DATE = '2026-05-01';

const router = Router();

router.get('/types', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const types = await db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.isActive, true))
      .orderBy(leaveTypes.name);
    
    res.json(types);
  } catch (error) {
    console.error('Error fetching leave types:', error);
    sendError(res, error);
  }
});

router.get('/my-balance', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const balances = await db
      .select({
        id: leaveBalances.id,
        leaveTypeId: leaveBalances.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        leaveTypeCode: leaveTypes.code,
        colorCode: leaveTypes.colorCode,
        isPaid: leaveTypes.isPaid,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
        carryoverDays: leaveBalances.carryoverDays
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.year, year)
      ));

    const balancesWithAvailable = balances.map(b => ({
      ...b,
      availableDays: parseFloat(b.allocatedDays || '0') + parseFloat(b.carryoverDays || '0') 
                     - parseFloat(b.usedDays || '0') - parseFloat(b.pendingDays || '0')
    }));

    res.json(balancesWithAvailable);
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    sendError(res, error);
  }
});

router.get('/balance/:userId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const balances = await db
      .select({
        id: leaveBalances.id,
        leaveTypeId: leaveBalances.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        leaveTypeCode: leaveTypes.code,
        isPaid: leaveTypes.isPaid,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
        carryoverDays: leaveBalances.carryoverDays
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveBalances.userId, targetUserId),
        eq(leaveBalances.year, year)
      ));

    const balancesWithAvailable = balances.map(b => ({
      ...b,
      availableDays: parseFloat(b.allocatedDays || '0') + parseFloat(b.carryoverDays || '0')
                     - parseFloat(b.usedDays || '0') - parseFloat(b.pendingDays || '0')
    }));

    res.json(balancesWithAvailable);
  } catch (error) {
    console.error('Error fetching user leave balance:', error);
    sendError(res, error);
  }
});

router.get('/admin/all-balances', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const search = (req.query.search as string || '').toLowerCase();

    const allLeaveTypes = await db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.isActive, true))
      .orderBy(leaveTypes.name);

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        cardName: users.cardName,
        employeeCode: users.employeeCode,
        role: users.role,
        department: users.department,
        userType: users.userType,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.firstName);

    const allBalances = await db
      .select({
        id: leaveBalances.id,
        userId: leaveBalances.userId,
        leaveTypeId: leaveBalances.leaveTypeId,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
        carryoverDays: leaveBalances.carryoverDays,
        adjustmentDays: leaveBalances.adjustmentDays,
      })
      .from(leaveBalances)
      .where(eq(leaveBalances.year, year));

    const employeesWithBalances = allUsers
      .filter(user => {
        if (!search) return true;
        const name = (user.cardName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username).toLowerCase();
        const code = (user.employeeCode || '').toLowerCase();
        return name.includes(search) || code.includes(search);
      })
      .map(user => {
        const userBalances = allBalances.filter(b => b.userId === user.id);
        const name = user.cardName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
        const balances = allLeaveTypes.map(lt => {
          const bal = userBalances.find(b => b.leaveTypeId === lt.id);
          const allocated = parseFloat(bal?.allocatedDays || '0');
          const used = parseFloat(bal?.usedDays || '0');
          const pending = parseFloat(bal?.pendingDays || '0');
          const carryover = parseFloat(bal?.carryoverDays || '0');
          const adjustment = parseFloat(bal?.adjustmentDays || '0');
          return {
            leaveTypeId: lt.id,
            leaveTypeName: lt.name,
            leaveTypeCode: lt.code,
            colorCode: lt.colorCode,
            isPaid: lt.isPaid,
            balanceId: bal?.id ?? null,
            allocated,
            used,
            pending,
            carryover,
            adjustment,
            remaining: allocated + carryover + adjustment - used - pending,
          };
        });

        return {
          userId: user.id,
          name,
          employeeCode: user.employeeCode,
          role: user.role,
          department: user.department,
          userType: user.userType,
          balances,
        };
      });

    res.json({ employees: employeesWithBalances, leaveTypes: allLeaveTypes, year });
  } catch (error) {
    console.error('Error fetching all leave balances:', error);
    sendError(res, error);
  }
});

router.get('/my-requests', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const requests = await db
      .select({
        id: leaveRequests.id,
        leaveTypeId: leaveRequests.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        leaveTypeColor: leaveTypes.colorCode,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        totalDays: leaveRequests.totalDays,
        isHalfDay: leaveRequests.isHalfDay,
        halfDayPeriod: leaveRequests.halfDayPeriod,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        appliedDate: leaveRequests.appliedDate,
        managerId: leaveRequests.managerId,
        managerApprovalStatus: leaveRequests.managerApprovalStatus,
        managerApprovalDate: leaveRequests.managerApprovalDate,
        managerComments: leaveRequests.managerComments
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveRequests.employeeId, userId),
        gte(leaveRequests.startDate, `${year}-01-01`),
        lte(leaveRequests.startDate, `${year}-12-31`)
      ))
      .orderBy(desc(leaveRequests.appliedDate));

    const requestsWithManager = await Promise.all(requests.map(async (r) => {
      let managerName = null;
      if (r.managerId) {
        const [manager] = await db
          .select({ username: users.username, firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, r.managerId));
        if (manager) {
          managerName = manager.firstName || manager.username;
        }
      }
      return { ...r, managerName };
    }));

    res.json(requestsWithManager);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    sendError(res, error);
  }
});

router.get('/my-reporting-manager', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;

    const [currentUser] = await db
      .select({ reportingManagerId: users.reportingManagerId })
      .from(users)
      .where(eq(users.id, userId));

    if (!currentUser?.reportingManagerId) {
      return res.json(null);
    }

    const [manager] = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email
      })
      .from(users)
      .where(eq(users.id, currentUser.reportingManagerId));

    res.json(manager || null);
  } catch (error) {
    console.error('Error fetching reporting manager:', error);
    sendError(res, error);
  }
});

router.get('/company-holidays', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const holidays = await db
      .select()
      .from(companyHolidays)
      .where(and(
        gte(companyHolidays.date, `${year}-01-01`),
        lte(companyHolidays.date, `${year}-12-31`)
      ))
      .orderBy(companyHolidays.date);

    res.json(holidays);
  } catch (error) {
    console.error('Error fetching company holidays:', error);
    sendError(res, error);
  }
});

/**
 * GET /api/leave/calculate-days
 * Returns base days, sandwich off-days, and final totalDays for a date range.
 * Used by the frontend to show the sandwich leave preview before submission.
 */
router.get('/calculate-days', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { leaveTypeId, startDate, endDate, isHalfDay } = req.query as Record<string, string>;

    if (!leaveTypeId || !startDate) {
      return res.status(400).json({ error: 'leaveTypeId and startDate are required' });
    }

    if (isHalfDay === 'true') {
      return res.json({ baseDays: 0.5, offDaysInside: 0, totalDays: 0.5, sandwichApplicable: false, offDates: [] });
    }

    const effectiveEnd = endDate || startDate;

    const [leaveType] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.id, parseInt(leaveTypeId)), eq(leaveTypes.isActive, true)));
    if (!leaveType) return res.status(404).json({ error: 'Leave type not found' });

    const [userRow] = await db.select({ weeklyOffDays: users.weeklyOffDays }).from(users).where(eq(users.id, userId));
    const weeklyOffDays: number[] = (userRow?.weeklyOffDays as number[] | null) ?? [0, 6];

    const startYear = new Date(startDate).getFullYear();
    const endYear   = new Date(effectiveEnd).getFullYear();
    const holidayRows = await db.select({ date: companyHolidays.date })
      .from(companyHolidays)
      .where(and(gte(companyHolidays.date, `${startYear}-01-01`), lte(companyHolidays.date, `${endYear}-12-31`)));
    const holidayDates = new Set(holidayRows.map((h: any) => new Date(h.date).toISOString().split('T')[0]));

    // Forward-only: suppress sandwich for pre-cutover dates
    const sandwichActive = !!leaveType.sandwichApplicable && startDate >= SANDWICH_EFFECTIVE_DATE;
    const result = computeSandwichLeave(startDate, effectiveEnd, weeklyOffDays, holidayDates, sandwichActive);
    return res.json({ ...result, sandwichApplicable: sandwichActive });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/request', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { leaveTypeId, startDate, endDate, totalDays, isHalfDay, halfDayPeriod, reason, emergencyContact, workHandoverNotes } = req.body;

    if (!leaveTypeId || !startDate || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (totalDays === undefined || totalDays === null || isNaN(parseFloat(totalDays)) || parseFloat(totalDays) <= 0) {
      return res.status(400).json({ error: 'totalDays is required and must be a positive number' });
    }

    const effectiveEndDate = endDate || startDate;
    if (effectiveEndDate < startDate) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    const lockCheck = await checkPayrollLock('leave', startDate, userId);
    if (lockCheck.isLocked) {
      return res.status(403).json({ error: `Leave modifications are locked for this period: ${lockCheck.message}` });
    }

    const [leaveType] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.isActive, true)));
    if (!leaveType) {
      return res.status(400).json({ error: 'Invalid or inactive leave type' });
    }

    if (isHalfDay && !leaveType.canBeHalfDay) {
      return res.status(400).json({ error: `${leaveType.name} does not allow half-day requests` });
    }

    // Sandwich leave enforcement — recompute totalDays server-side (forward-only, >= cutover date)
    let enforcedTotalDays: number = isHalfDay ? 0.5 : parseFloat(totalDays);
    if (!isHalfDay && leaveType.sandwichApplicable && startDate >= SANDWICH_EFFECTIVE_DATE) {
      const [userRow] = await db.select({ weeklyOffDays: users.weeklyOffDays, reportingManagerId: users.reportingManagerId })
        .from(users).where(eq(users.id, userId));
      const weeklyOffDays: number[] = (userRow?.weeklyOffDays as number[] | null) ?? [0, 6];
      const startYear = new Date(startDate).getFullYear();
      const endYear   = new Date(effectiveEndDate).getFullYear();
      const holidayRows = await db.select({ date: companyHolidays.date })
        .from(companyHolidays)
        .where(and(gte(companyHolidays.date, `${startYear}-01-01`), lte(companyHolidays.date, `${endYear}-12-31`)));
      const holidayDates = new Set(holidayRows.map((h: any) => new Date(h.date).toISOString().split('T')[0]));
      const sandwich = computeSandwichLeave(startDate, effectiveEndDate, weeklyOffDays, holidayDates, true);
      enforcedTotalDays = sandwich.totalDays;
    }

    const [currentUser] = await db
      .select({ reportingManagerId: users.reportingManagerId })
      .from(users)
      .where(eq(users.id, userId));

    const managerId = currentUser?.reportingManagerId || null;
    if (!managerId) {
      return res.status(400).json({ error: 'Cannot submit leave request: no reporting manager assigned. Please contact HR to update your reporting manager.' });
    }

    const overlapping = await db.select({ id: leaveRequests.id }).from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, userId),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.startDate, effectiveEndDate),
        gte(leaveRequests.endDate, startDate)
      )).limit(1);
    if (overlapping.length > 0) {
      return res.status(409).json({ error: 'A pending or approved leave request already exists for overlapping dates' });
    }

    const balanceYear = new Date(startDate).getFullYear();
    if (leaveType.isPaid) {
      const [balance] = await db.select().from(leaveBalances).where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, balanceYear)
      ));

      const allocated = parseFloat(balance?.allocatedDays || '0');
      const carryover = parseFloat(balance?.carryoverDays || '0');
      const used = parseFloat(balance?.usedDays || '0');
      const pending = parseFloat(balance?.pendingDays || '0');
      const available = allocated + carryover - used - pending;

      if (enforcedTotalDays > available) {
        return res.status(400).json({
          error: `Insufficient ${leaveType.name} balance. Available: ${available} day${available !== 1 ? 's' : ''}, Requested: ${enforcedTotalDays} day${enforcedTotalDays !== 1 ? 's' : ''}${leaveType.sandwichApplicable ? ' (includes sandwiched weekends/holidays)' : ''}. You may apply for Unpaid Leave instead.`,
          code: 'INSUFFICIENT_BALANCE',
          available,
          requested: enforcedTotalDays,
          leaveTypeName: leaveType.name,
        });
      }
    }

    // All DB writes go through the service layer (Rule 1 — single source of truth)
    const newRequest = await applyLeave({
      userId,
      leaveTypeId,
      startDate,
      endDate: effectiveEndDate,
      totalDays: enforcedTotalDays,
      isHalfDay: isHalfDay || false,
      halfDayPeriod: isHalfDay ? halfDayPeriod : null,
      reason,
      emergencyContact: emergencyContact || null,
      workHandoverNotes: workHandoverNotes || null,
      managerId,
    });

    const user = req.user as any;
    const leaveTypeName = leaveType.name;
    await createNotification({
      userId: managerId,
      type: 'approval_request',
      title: `Leave Request: ${user.fullName || user.username}`,
      message: `${user.fullName || user.username} has applied for ${leaveTypeName} from ${startDate} to ${effectiveEndDate} (${enforcedTotalDays} day${enforcedTotalDays !== 1 ? 's' : ''}${leaveType.sandwichApplicable ? ' incl. weekends/holidays' : ''}). Reason: ${reason}`,
      link: '/leave-request',
      sourceType: 'leave_request',
      sourceId: newRequest.id,
      createdBy: userId,
    });

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating leave request:', error);
    sendError(res, error);
  }
});

router.post('/request/:id/cancel', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const requestId = parseInt(req.params.id);
    await cancelLeave(requestId, userId);
    res.json({ success: true, message: 'Request cancelled successfully' });
  } catch (error: any) {
    console.error('Error cancelling leave request:', error);
    if (error.message?.includes('Only pending')) return res.status(400).json({ error: error.message });
    if (error.message?.includes('not found')) return res.status(404).json({ error: error.message });
    sendError(res, error);
  }
});

// Manager/Self: Revoke an approved leave (employee can request, manager approves — here it's self-service for future use)
router.post('/request/:id/revoke', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req.user as any);
    const requestId = parseInt(req.params.id);
    const { reason } = req.body;

    // Only admin / HR / Superuser / GM can revoke
    const allowedRoles = ['admin', 'hr', 'Superuser', 'General Manager', 'Senior Manager'];
    const hasAdminPermission = await checkModulePermission(currentUser.id, 'Administration', 'edit');
    if (!hasAdminPermission && !allowedRoles.includes(currentUser.role)) {
      return sendPermissionError(res);
    }
    if (!reason) return res.status(400).json({ error: 'Reason is required to revoke leave' });

    await revokeApprovedLeave(requestId, currentUser.id, reason);
    res.json({ success: true, message: 'Leave revoked successfully' });
  } catch (error: any) {
    console.error('Error revoking leave:', error);
    if (error.message?.includes('Only approved')) return res.status(400).json({ error: error.message });
    sendError(res, error);
  }
});

router.get('/team-requests', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const managerId = (req.user as any).id;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const requests = await db
      .select({
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        leaveTypeId: leaveRequests.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        leaveTypeColor: leaveTypes.colorCode,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        totalDays: leaveRequests.totalDays,
        isHalfDay: leaveRequests.isHalfDay,
        halfDayPeriod: leaveRequests.halfDayPeriod,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        appliedDate: leaveRequests.appliedDate,
        managerApprovalStatus: leaveRequests.managerApprovalStatus,
        employeeName: users.username,
        employeeFirstName: users.firstName,
        employeeEmail: users.email
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .innerJoin(users, eq(leaveRequests.employeeId, users.id))
      .where(and(
        eq(leaveRequests.managerId, managerId),
        gte(leaveRequests.startDate, `${year}-01-01`),
        lte(leaveRequests.startDate, `${year}-12-31`)
      ))
      .orderBy(desc(leaveRequests.appliedDate));

    const formattedRequests = requests.map(r => ({
      ...r,
      employeeDisplayName: r.employeeFirstName || r.employeeName
    }));

    res.json(formattedRequests);
  } catch (error) {
    console.error('Error fetching team leave requests:', error);
    sendError(res, error);
  }
});

router.get('/has-direct-reports', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;

    const directReports = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.reportingManagerId, userId))
      .limit(1);

    res.json({ hasDirectReports: directReports.length > 0 });
  } catch (error) {
    console.error('Error checking direct reports:', error);
    sendError(res, error);
  }
});

router.post('/request/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const managerId = (req.user as any).id;
    const requestId = parseInt(req.params.id);
    const { comments } = req.body;

    // Verify this manager owns the request
    const [existingRequest] = await db
      .select()
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.id, requestId),
        eq(leaveRequests.managerId, managerId)
      ));

    if (!existingRequest) {
      return res.status(404).json({ error: 'Request not found or you are not the manager' });
    }

    await approveLeave(requestId, managerId, comments);

    const manager = req.user as any;
    const [leaveType] = await db.select({ name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.id, existingRequest.leaveTypeId));
    const leaveTypeName = leaveType?.name || 'Leave';
    await createNotification({
      userId: existingRequest.employeeId,
      type: 'approval_decision',
      title: `Leave Approved: ${leaveTypeName}`,
      message: `Your ${leaveTypeName} request from ${existingRequest.startDate} to ${existingRequest.endDate} has been approved by ${manager.fullName || manager.username}.${comments ? ` Comments: ${comments}` : ''}`,
      link: '/leave-request',
      sourceType: 'leave_request',
      sourceId: requestId,
      createdBy: managerId,
    });

    res.json({ success: true, message: 'Leave request approved successfully' });
  } catch (error: any) {
    console.error('Error approving leave request:', error);
    if (error.message?.includes('already been processed')) return res.status(409).json({ error: error.message });
    sendError(res, error);
  }
});

router.post('/request/:id/reject', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const managerId = (req.user as any).id;
    const requestId = parseInt(req.params.id);
    const { comments } = req.body;

    if (!comments) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Verify this manager owns the request
    const [existingRequest] = await db
      .select()
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.id, requestId),
        eq(leaveRequests.managerId, managerId)
      ));

    if (!existingRequest) {
      return res.status(404).json({ error: 'Request not found or you are not the manager' });
    }

    await rejectLeave(requestId, managerId, comments);

    const manager = req.user as any;
    const [leaveType] = await db.select({ name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.id, existingRequest.leaveTypeId));
    const leaveTypeName = leaveType?.name || 'Leave';
    await createNotification({
      userId: existingRequest.employeeId,
      type: 'approval_decision',
      title: `Leave Rejected: ${leaveTypeName}`,
      message: `Your ${leaveTypeName} request from ${existingRequest.startDate} to ${existingRequest.endDate} has been rejected by ${manager.fullName || manager.username}. Reason: ${comments}`,
      link: '/leave-request',
      sourceType: 'leave_request',
      sourceId: requestId,
      createdBy: managerId,
    });

    res.json({ success: true, message: 'Leave request rejected' });
  } catch (error: any) {
    console.error('Error rejecting leave request:', error);
    if (error.message?.includes('already been processed')) return res.status(409).json({ error: error.message });
    sendError(res, error);
  }
});

// Admin endpoint: Get all users' leave allocations by year
router.get('/admin/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    // Check if user has Administration module permission or is in allowed roles
    const hasAdminPermission = await checkModulePermission(userId, 'Administration', 'view');
    const isAllowedRole = ['admin', 'manager', 'hr', 'Superuser', 'General Manager', 'Senior Manager'].includes(userRole);
    
    if (!hasAdminPermission && !isAllowedRole) {
      return sendPermissionError(res);
    }

    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Get all users with their leave allocations
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
        employeeCode: users.employeeCode,
        weeklyOffDays: users.weeklyOffDays,
        isActive: users.isActive
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.firstName);

    // Get all leave types with normalized fields
    const rawLeaveTypes = await db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.isActive, true))
      .orderBy(leaveTypes.name);
    
    const allLeaveTypes = rawLeaveTypes.map(lt => ({
      ...lt,
      code: lt.code || lt.name?.substring(0, 3).toUpperCase() || 'N/A',
      colorCode: lt.colorCode || '#6B7280',
      isPaid: lt.isPaid ?? true
    }));

    // Get all balances for the year
    const allBalances = await db
      .select({
        id: leaveBalances.id,
        userId: leaveBalances.userId,
        leaveTypeId: leaveBalances.leaveTypeId,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
        carryoverDays: leaveBalances.carryoverDays
      })
      .from(leaveBalances)
      .where(eq(leaveBalances.year, year));

    // Build user allocation data
    const usersWithAllocations = allUsers.map(user => {
      const userBalances = allBalances.filter(b => b.userId === user.id);
      
      let totalPaidAllocated = 0;
      let totalPaidUsed = 0;
      let totalUnpaidAllocated = 0;
      let totalUnpaidUsed = 0;

      const allocations = allLeaveTypes.map(lt => {
        const balance = userBalances.find(b => b.leaveTypeId === lt.id);
        const allocated = parseFloat(balance?.allocatedDays || '0');
        const used = parseFloat(balance?.usedDays || '0');
        const pending = parseFloat(balance?.pendingDays || '0');
        const carryover = parseFloat(balance?.carryoverDays || '0');
        const available = allocated + carryover - used - pending;

        if (lt.isPaid) {
          totalPaidAllocated += allocated;
          totalPaidUsed += used;
        } else {
          totalUnpaidAllocated += allocated;
          totalUnpaidUsed += used;
        }

        return {
          balanceId: balance?.id || null,
          leaveTypeId: lt.id,
          leaveTypeName: lt.name,
          leaveTypeCode: lt.code,
          isPaid: lt.isPaid,
          colorCode: lt.colorCode,
          allocated,
          used,
          pending,
          carryover,
          available
        };
      });

      // Ensure weeklyOffDays is always a valid array of integers 0-6
      let weeklyOff: number[] = [0, 6]; // Default: Sunday and Saturday off
      const rawWeeklyOff = user.weeklyOffDays;
      
      if (rawWeeklyOff != null) {
        if (Array.isArray(rawWeeklyOff) && rawWeeklyOff.length > 0) {
          // Filter to only valid day numbers (0-6)
          const validDays = rawWeeklyOff.filter((d: any) => 
            typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6
          );
          if (validDays.length > 0) {
            weeklyOff = validDays;
          }
        } else if (typeof rawWeeklyOff === 'string' && rawWeeklyOff.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(rawWeeklyOff);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const validDays = parsed.filter((d: any) => 
                typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6
              );
              if (validDays.length > 0) {
                weeklyOff = validDays;
              }
            }
          } catch {
            // Keep default
          }
        }
        // Empty objects {}, non-array types, etc. all fall through to default
      }

      return {
        userId: user.id,
        username: user.username,
        displayName: user.firstName || user.username,
        fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName || user.username,
        department: user.department || null,
        employeeCode: user.employeeCode || null,
        weeklyOffDays: weeklyOff,
        allocations,
        summary: {
          totalPaidAllocated,
          totalPaidUsed,
          totalPaidAvailable: totalPaidAllocated - totalPaidUsed,
          totalUnpaidAllocated,
          totalUnpaidUsed
        }
      };
    });

    // Calculate org-wide summary
    const orgSummary = {
      totalPaidAllocated: usersWithAllocations.reduce((sum, u) => sum + u.summary.totalPaidAllocated, 0),
      totalPaidUsed: usersWithAllocations.reduce((sum, u) => sum + u.summary.totalPaidUsed, 0),
      totalUnpaidAllocated: usersWithAllocations.reduce((sum, u) => sum + u.summary.totalUnpaidAllocated, 0),
      totalUnpaidUsed: usersWithAllocations.reduce((sum, u) => sum + u.summary.totalUnpaidUsed, 0),
      totalUsers: usersWithAllocations.length
    };

    res.json({
      year,
      leaveTypes: allLeaveTypes,
      users: usersWithAllocations,
      orgSummary
    });
  } catch (error) {
    console.error('Error fetching admin leave allocations:', error);
    sendError(res, error);
  }
});

// Admin endpoint: Update or create leave allocation for a user
router.post('/admin/allocations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    // Check if user has Administration module permission or is in allowed roles
    const hasAdminPermission = await checkModulePermission(currentUserId, 'Administration', 'edit');
    const isAllowedRole = ['admin', 'hr', 'Superuser', 'General Manager'].includes(userRole);
    
    if (!hasAdminPermission && !isAllowedRole) {
      return sendPermissionError(res);
    }

    const { userId, leaveTypeId, year, allocatedDays, carryoverDays } = req.body;

    if (!userId || !leaveTypeId || !year) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if balance exists
    const [existing] = await db
      .select()
      .from(leaveBalances)
      .where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year)
      ));

    if (existing) {
      // Update existing
      await db
        .update(leaveBalances)
        .set({
          allocatedDays: allocatedDays?.toString() || existing.allocatedDays,
          carryoverDays: carryoverDays?.toString() || existing.carryoverDays,
          lastUpdated: new Date()
        })
        .where(eq(leaveBalances.id, existing.id));
    } else {
      // Create new
      await db
        .insert(leaveBalances)
        .values({
          userId,
          leaveTypeId,
          year,
          allocatedDays: allocatedDays?.toString() || '0',
          usedDays: '0',
          pendingDays: '0',
          carryoverDays: carryoverDays?.toString() || '0',
          lastUpdated: new Date()
        });
    }

    res.json({ success: true, message: 'Leave allocation updated' });
  } catch (error) {
    console.error('Error updating leave allocation:', error);
    sendError(res, error);
  }
});

// Admin endpoint: Bulk allocate leave for a year (supports multiple leave types)
router.post('/admin/allocations/bulk', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    // Check if user has Administration module permission or is in allowed roles
    const hasAdminPermission = await checkModulePermission(currentUserId, 'Administration', 'edit');
    const isAllowedRole = ['admin', 'hr', 'Superuser', 'General Manager'].includes(userRole);
    
    if (!hasAdminPermission && !isAllowedRole) {
      return sendPermissionError(res);
    }

    const { year, allocations } = req.body;
    // Coerce overwriteExisting to boolean (handles both boolean true and string "true")
    const overwriteExisting = req.body.overwriteExisting === true || req.body.overwriteExisting === 'true';

    // Support both old single-type format and new multi-type format
    if (!year) {
      return res.status(400).json({ error: 'Year is required' });
    }

    // Get all active users
    const allUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isActive, true));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Handle new multi-type format: { year, allocations: [{ leaveTypeId, days }], overwriteExisting }
    if (allocations && Array.isArray(allocations)) {
      for (const alloc of allocations) {
        const { leaveTypeId, days } = alloc;
        if (!leaveTypeId || days === undefined) continue;

        for (const user of allUsers) {
          const [existing] = await db
            .select()
            .from(leaveBalances)
            .where(and(
              eq(leaveBalances.userId, user.id),
              eq(leaveBalances.leaveTypeId, leaveTypeId),
              eq(leaveBalances.year, year)
            ));

          if (!existing) {
            await db
              .insert(leaveBalances)
              .values({
                userId: user.id,
                leaveTypeId,
                year,
                allocatedDays: days.toString(),
                usedDays: '0',
                pendingDays: '0',
                carryoverDays: '0',
                lastUpdated: new Date()
              });
            created++;
          } else if (overwriteExisting) {
            await db
              .update(leaveBalances)
              .set({
                allocatedDays: days.toString(),
                lastUpdated: new Date()
              })
              .where(eq(leaveBalances.id, existing.id));
            updated++;
          } else {
            skipped++;
          }
        }
      }
      res.json({ 
        success: true, 
        message: `Bulk allocation complete. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`,
        created,
        updated,
        skipped
      });
      return;
    }

    // Handle old single-type format for backwards compatibility
    const { leaveTypeId, defaultDays } = req.body;
    if (!leaveTypeId || defaultDays === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    for (const user of allUsers) {
      const [existing] = await db
        .select()
        .from(leaveBalances)
        .where(and(
          eq(leaveBalances.userId, user.id),
          eq(leaveBalances.leaveTypeId, leaveTypeId),
          eq(leaveBalances.year, year)
        ));

      if (!existing) {
        await db
          .insert(leaveBalances)
          .values({
            userId: user.id,
            leaveTypeId,
            year,
            allocatedDays: defaultDays.toString(),
            usedDays: '0',
            pendingDays: '0',
            carryoverDays: '0',
            lastUpdated: new Date()
          });
        created++;
      } else {
        skipped++;
      }
    }

    res.json({ success: true, message: `Bulk allocation complete. Created: ${created}, Skipped: ${skipped}` });
  } catch (error) {
    console.error('Error bulk allocating leave:', error);
    sendError(res, error);
  }
});

// Admin endpoint: Update user weekly off days
router.patch('/admin/users/:userId/weekly-off', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    // Check if user has Administration module permission or is in allowed roles
    const hasAdminPermission = await checkModulePermission(currentUserId, 'Administration', 'edit');
    const isAllowedRole = ['admin', 'hr', 'Superuser', 'General Manager'].includes(userRole);
    
    if (!hasAdminPermission && !isAllowedRole) {
      return sendPermissionError(res);
    }

    const userId = parseInt(req.params.userId);
    const { weeklyOffDays } = req.body;

    if (!Array.isArray(weeklyOffDays)) {
      return res.status(400).json({ error: 'weeklyOffDays must be an array' });
    }

    // Validate each day is an integer between 0 and 6
    const validDays = weeklyOffDays.every((day: any) => 
      Number.isInteger(day) && day >= 0 && day <= 6
    );
    if (!validDays) {
      return res.status(400).json({ error: 'weeklyOffDays must contain integers between 0 (Sunday) and 6 (Saturday)' });
    }

    // Remove duplicates and sort
    const uniqueDays = [...new Set(weeklyOffDays)].sort((a, b) => a - b);

    await db
      .update(users)
      .set({ weeklyOffDays: uniqueDays })
      .where(eq(users.id, userId));

    res.json({ success: true, message: 'Weekly off days updated' });
  } catch (error) {
    console.error('Error updating weekly off days:', error);
    sendError(res, error);
  }
});

// ──────────────────────────────────────────────
// ADMIN: CL Accrual & Year-End Carryover Trigger
// ──────────────────────────────────────────────

// POST /api/leave/admin/accrual/monthly?month=YYYY-MM
// Manually trigger monthly CL accrual for a given month
router.post('/admin/accrual/monthly', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req.user as any);
    const hasAdminPermission = await checkModulePermission(currentUser.id, 'Administration', 'edit');
    if (!hasAdminPermission && !['admin', 'hr', 'Superuser'].includes(currentUser.role)) {
      return sendPermissionError(res);
    }
    const { month } = req.query; // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
      return res.status(400).json({ error: 'month query param required in YYYY-MM format' });
    }
    const result = await runMonthlyClAccrual(String(month));
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error running monthly CL accrual:', error);
    sendError(res, error);
  }
});

// POST /api/leave/admin/accrual/year-end?year=YYYY
// Manually trigger year-end CL carryover for a given year
router.post('/admin/accrual/year-end', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req.user as any);
    const hasAdminPermission = await checkModulePermission(currentUser.id, 'Administration', 'edit');
    if (!hasAdminPermission && !['admin', 'hr', 'Superuser'].includes(currentUser.role)) {
      return sendPermissionError(res);
    }
    const year = parseInt(String(req.query.year ?? ''));
    if (!year || year < 2020 || year > 2100) {
      return res.status(400).json({ error: 'year query param required (YYYY)' });
    }
    const result = await runYearEndClCarryover(year);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error running year-end CL carryover:', error);
    sendError(res, error);
  }
});

// GET /api/leave/admin/accrual-log?userId=&year=
// Fetch accrual log entries (filtered)
router.get('/admin/accrual-log', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req.user as any);
    const hasAdminPermission = await checkModulePermission(currentUser.id, 'Administration', 'view');
    if (!hasAdminPermission && !['admin', 'hr', 'Superuser', 'General Manager', 'Senior Manager'].includes(currentUser.role)) {
      return sendPermissionError(res);
    }
    const { userId, year } = req.query;
    let query = db.select().from(leaveAccrualLog);
    const conditions: any[] = [];
    if (userId) conditions.push(eq(leaveAccrualLog.userId, parseInt(String(userId))));
    if (year) {
      const yr = parseInt(String(year));
      conditions.push(gte(leaveAccrualLog.accrualMonth, `${yr}-01`));
      conditions.push(lte(leaveAccrualLog.accrualMonth, `${yr}-12`));
    }
    const rows = conditions.length > 0
      ? await db.select().from(leaveAccrualLog).where(and(...conditions)).orderBy(desc(leaveAccrualLog.createdAt))
      : await db.select().from(leaveAccrualLog).orderBy(desc(leaveAccrualLog.createdAt));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching accrual log:', error);
    sendError(res, error);
  }
});

// POST /api/leave/admin/balance-adjustment
// Manually adjust a leave balance (adds to adjustment_days, inserts ledger row)
router.post('/admin/balance-adjustment', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req.user as any);
    if (!['admin', 'hr', 'Superuser'].includes(currentUser.role)) {
      return sendPermissionError(res);
    }
    const { userId, leaveTypeId, year, adjustmentDays, reason } = req.body;
    if (!userId || !leaveTypeId || !year || adjustmentDays === undefined || !reason?.trim()) {
      return res.status(400).json({ error: 'userId, leaveTypeId, year, adjustmentDays, and reason are required' });
    }
    const delta = parseFloat(adjustmentDays);
    if (isNaN(delta) || delta === 0) return res.status(400).json({ error: 'adjustmentDays must be a non-zero number' });

    await db.transaction(async (tx) => {
      // Upsert the leave_balances row if needed, then increment adjustment_days
      const [existing] = await tx
        .select({ id: leaveBalances.id, adjustmentDays: leaveBalances.adjustmentDays })
        .from(leaveBalances)
        .where(and(eq(leaveBalances.userId, userId), eq(leaveBalances.leaveTypeId, leaveTypeId), eq(leaveBalances.year, year)));

      if (existing) {
        const newAdj = parseFloat(existing.adjustmentDays || '0') + delta;
        await tx.update(leaveBalances)
          .set({ adjustmentDays: newAdj.toFixed(2), lastUpdated: new Date(), updatedBy: currentUser.id })
          .where(eq(leaveBalances.id, existing.id));
      } else {
        // Create a new balance row with zero allocated/used, just the adjustment
        await tx.insert(leaveBalances).values({
          userId, leaveTypeId, year,
          allocatedDays: '0', usedDays: '0', pendingDays: '0', carryoverDays: '0',
          adjustmentDays: delta.toFixed(2),
          updatedBy: currentUser.id,
        });
      }

      // Insert ledger entry
      await tx.insert(leaveBalanceAdjustments).values({
        userId, leaveTypeId, year,
        adjustmentDays: delta.toFixed(2),
        reason: reason.trim(),
        adjustedBy: currentUser.id,
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error applying leave balance adjustment:', error);
    sendError(res, error);
  }
});

// GET /api/leave/admin/balance-adjustments?userId=&leaveTypeId=&year=
// Fetch adjustment ledger for an employee/leave type
router.get('/admin/balance-adjustments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req.user as any);
    if (!['admin', 'hr', 'Superuser'].includes(currentUser.role)) {
      return sendPermissionError(res);
    }
    const userId = parseInt(req.query.userId as string);
    const leaveTypeId = parseInt(req.query.leaveTypeId as string);
    const year = parseInt(req.query.year as string);
    if (!userId || !leaveTypeId || !year) {
      return res.status(400).json({ error: 'userId, leaveTypeId, and year are required' });
    }
    const rows = await db
      .select({
        id: leaveBalanceAdjustments.id,
        adjustmentDays: leaveBalanceAdjustments.adjustmentDays,
        reason: leaveBalanceAdjustments.reason,
        createdAt: leaveBalanceAdjustments.createdAt,
        adjustedByName: users.cardName,
        adjustedByCode: users.employeeCode,
      })
      .from(leaveBalanceAdjustments)
      .leftJoin(users, eq(leaveBalanceAdjustments.adjustedBy, users.id))
      .where(and(
        eq(leaveBalanceAdjustments.userId, userId),
        eq(leaveBalanceAdjustments.leaveTypeId, leaveTypeId),
        eq(leaveBalanceAdjustments.year, year),
      ))
      .orderBy(desc(leaveBalanceAdjustments.createdAt));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching balance adjustments:', error);
    sendError(res, error);
  }
});

export default router;
