import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
import { Router, Request, Response } from "express";
import { ensureAuthenticated } from "./auth-middleware";
import { db } from "./db";
import { leaveTypes, leaveBalances, leaveRequests, companyHolidays, users } from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { checkModulePermission } from "./utils/permission-utils";
import { checkPayrollLock } from './payroll-lock-service';
import { createNotification } from './notification-routes';

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
          return {
            leaveTypeId: lt.id,
            leaveTypeName: lt.name,
            leaveTypeCode: lt.code,
            colorCode: lt.colorCode,
            isPaid: lt.isPaid,
            allocated,
            used,
            pending,
            carryover,
            remaining: allocated + carryover - used - pending,
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

router.post('/request', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { leaveTypeId, startDate, endDate, totalDays, isHalfDay, halfDayPeriod, reason, emergencyContact, workHandoverNotes } = req.body;

    if (!leaveTypeId || !startDate || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const lockCheck = await checkPayrollLock('leave', startDate, userId);
    if (lockCheck.isLocked) {
      return res.status(403).json({ error: `Leave modifications are locked for this period: ${lockCheck.message}` });
    }

    const [leaveType] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, leaveTypeId));
    if (!leaveType) {
      return res.status(400).json({ error: 'Invalid leave type' });
    }

    if (leaveType.isPaid) {
      const currentYear = new Date(startDate).getFullYear();
      const [balance] = await db.select().from(leaveBalances).where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, currentYear)
      ));

      const allocated = parseFloat(balance?.allocatedDays || '0');
      const carryover = parseFloat(balance?.carryoverDays || '0');
      const used = parseFloat(balance?.usedDays || '0');
      const pending = parseFloat(balance?.pendingDays || '0');
      const available = allocated + carryover - used - pending;
      const requestedDays = parseFloat(totalDays);

      if (requestedDays > available) {
        return res.status(400).json({
          error: `Insufficient ${leaveType.name} balance. Available: ${available} day${available !== 1 ? 's' : ''}, Requested: ${requestedDays} day${requestedDays !== 1 ? 's' : ''}. You may apply for Unpaid Leave instead.`,
          code: 'INSUFFICIENT_BALANCE',
          available,
          requested: requestedDays,
          leaveTypeName: leaveType.name,
        });
      }
    }

    const [currentUser] = await db
      .select({ reportingManagerId: users.reportingManagerId })
      .from(users)
      .where(eq(users.id, userId));

    const managerId = currentUser?.reportingManagerId || null;

    const [newRequest] = await db
      .insert(leaveRequests)
      .values({
        employeeId: userId,
        leaveTypeId,
        startDate,
        endDate: endDate || startDate,
        totalDays: totalDays.toString(),
        isHalfDay: isHalfDay || false,
        halfDayPeriod: isHalfDay ? halfDayPeriod : null,
        reason,
        emergencyContact: emergencyContact || null,
        workHandoverNotes: workHandoverNotes || null,
        status: 'pending',
        managerId,
        managerApprovalStatus: managerId ? 'pending' : null
      })
      .returning();

    const balanceYear = new Date(startDate).getFullYear();
    const [existingBalance] = await db.select().from(leaveBalances).where(and(
      eq(leaveBalances.userId, userId),
      eq(leaveBalances.leaveTypeId, leaveTypeId),
      eq(leaveBalances.year, balanceYear)
    ));
    if (!existingBalance) {
      await db.insert(leaveBalances).values({
        userId,
        leaveTypeId,
        year: balanceYear,
        allocatedDays: '0.00',
        usedDays: '0.00',
        pendingDays: totalDays.toString(),
        carryoverDays: '0.00',
        lastUpdated: new Date()
      });
    } else {
      await db
        .update(leaveBalances)
        .set({
          pendingDays: sql`pending_days + ${totalDays}`,
          lastUpdated: new Date()
        })
        .where(eq(leaveBalances.id, existingBalance.id));
    }

    if (managerId) {
      const user = req.user as any;
      const [leaveType] = await db.select({ name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.id, leaveTypeId));
      const leaveTypeName = leaveType?.name || 'Leave';
      await createNotification({
        userId: managerId,
        type: 'approval_request',
        title: `Leave Request: ${user.fullName || user.username}`,
        message: `${user.fullName || user.username} has applied for ${leaveTypeName} from ${startDate} to ${endDate || startDate} (${totalDays} day${totalDays > 1 ? 's' : ''}). Reason: ${reason}`,
        link: '/leave-request',
        sourceType: 'leave_request',
        sourceId: newRequest.id,
        createdBy: userId,
      });
    }

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

    const [existingRequest] = await db
      .select()
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.id, requestId),
        eq(leaveRequests.employeeId, userId)
      ));

    if (!existingRequest) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (existingRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    await db
      .update(leaveRequests)
      .set({
        status: 'cancelled',
        updatedAt: new Date()
      })
      .where(eq(leaveRequests.id, requestId));

    const currentYear = new Date().getFullYear();
    await db
      .update(leaveBalances)
      .set({
        pendingDays: sql`GREATEST(0, pending_days - ${existingRequest.totalDays})`,
        lastUpdated: new Date()
      })
      .where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, existingRequest.leaveTypeId),
        eq(leaveBalances.year, currentYear)
      ));

    res.json({ success: true, message: 'Request cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling leave request:', error);
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

    if (existingRequest.managerApprovalStatus !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    await db
      .update(leaveRequests)
      .set({
        status: 'approved',
        managerApprovalStatus: 'approved',
        managerApprovalDate: new Date(),
        managerComments: comments || null,
        updatedAt: new Date()
      })
      .where(eq(leaveRequests.id, requestId));

    const currentYear = new Date().getFullYear();
    const [approvalBalance] = await db.select().from(leaveBalances).where(and(
      eq(leaveBalances.userId, existingRequest.employeeId),
      eq(leaveBalances.leaveTypeId, existingRequest.leaveTypeId),
      eq(leaveBalances.year, currentYear)
    ));
    if (!approvalBalance) {
      await db.insert(leaveBalances).values({
        userId: existingRequest.employeeId,
        leaveTypeId: existingRequest.leaveTypeId,
        year: currentYear,
        allocatedDays: '0.00',
        usedDays: existingRequest.totalDays.toString(),
        pendingDays: '0.00',
        carryoverDays: '0.00',
        lastUpdated: new Date()
      });
    } else {
      await db
        .update(leaveBalances)
        .set({
          pendingDays: sql`GREATEST(0, pending_days - ${existingRequest.totalDays})`,
          usedDays: sql`used_days + ${existingRequest.totalDays}`,
          lastUpdated: new Date()
        })
        .where(eq(leaveBalances.id, approvalBalance.id));
    }

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
  } catch (error) {
    console.error('Error approving leave request:', error);
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

    if (existingRequest.managerApprovalStatus !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    await db
      .update(leaveRequests)
      .set({
        status: 'rejected',
        managerApprovalStatus: 'rejected',
        managerApprovalDate: new Date(),
        managerComments: comments,
        updatedAt: new Date()
      })
      .where(eq(leaveRequests.id, requestId));

    const currentYear = new Date().getFullYear();
    const [rejectionBalance] = await db.select().from(leaveBalances).where(and(
      eq(leaveBalances.userId, existingRequest.employeeId),
      eq(leaveBalances.leaveTypeId, existingRequest.leaveTypeId),
      eq(leaveBalances.year, currentYear)
    ));
    if (rejectionBalance) {
      await db
        .update(leaveBalances)
        .set({
          pendingDays: sql`GREATEST(0, pending_days - ${existingRequest.totalDays})`,
          lastUpdated: new Date()
        })
        .where(eq(leaveBalances.id, rejectionBalance.id));
    }

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
  } catch (error) {
    console.error('Error rejecting leave request:', error);
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

export default router;
