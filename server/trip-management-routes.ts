import { Request, Response } from 'express';
import { db } from './db';
import { businessTrips, tripApprovals, tripBookings, tripExpenses, tripReimbursements, users } from '@shared/schema';
import { eq, and, or, desc, asc, sql, sum, count } from 'drizzle-orm';
import { z } from 'zod';

// ===================== TRIP MANAGEMENT ENDPOINTS =====================

/**
 * Get all business trips for the current user
 */
export const getUserTrips = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { status, year, month } = req.query;

    let query = db
      .select({
        id: businessTrips.id,
        tripTitle: businessTrips.tripTitle,
        purpose: businessTrips.purpose,
        destination: businessTrips.destination,
        fromDate: businessTrips.fromDate,
        toDate: businessTrips.toDate,
        estimatedTravelCost: businessTrips.estimatedTravelCost,
        estimatedAccommodationCost: businessTrips.estimatedAccommodationCost,
        estimatedMiscCost: businessTrips.estimatedMiscCost,
        advanceRequested: businessTrips.advanceRequested,
        status: businessTrips.status,
        createdAt: businessTrips.createdAt,
        updatedAt: businessTrips.updatedAt,
        employeeName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
        employeeId: businessTrips.employeeId,
      })
      .from(businessTrips)
      .leftJoin(users, eq(businessTrips.employeeId, users.id))
      .where(eq(businessTrips.employeeId, userId))
      .orderBy(desc(businessTrips.createdAt));

    if (status) {
      query = query.where(eq(businessTrips.status, status as string));
    }

    if (year) {
      query = query.where(sql`EXTRACT(YEAR FROM ${businessTrips.fromDate}) = ${year}`);
    }

    if (month) {
      query = query.where(sql`EXTRACT(MONTH FROM ${businessTrips.fromDate}) = ${month}`);
    }

    const trips = await query;

    res.json(trips);
  } catch (error) {
    console.error('Error fetching user trips:', error);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
};

/**
 * Get all business trips for admin view
 */
export const getAllTrips = async (req: Request, res: Response) => {
  try {
    const { status, employeeId, year, month } = req.query;

    let query = db
      .select({
        id: businessTrips.id,
        tripTitle: businessTrips.tripTitle,
        purpose: businessTrips.purpose,
        destination: businessTrips.destination,
        fromDate: businessTrips.fromDate,
        toDate: businessTrips.toDate,
        estimatedTravelCost: businessTrips.estimatedTravelCost,
        estimatedAccommodationCost: businessTrips.estimatedAccommodationCost,
        estimatedMiscCost: businessTrips.estimatedMiscCost,
        advanceRequested: businessTrips.advanceRequested,
        status: businessTrips.status,
        createdAt: businessTrips.createdAt,
        updatedAt: businessTrips.updatedAt,
        employeeName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
        employeeId: businessTrips.employeeId,
        employeeDepartment: users.department,
      })
      .from(businessTrips)
      .leftJoin(users, eq(businessTrips.employeeId, users.id))
      .orderBy(desc(businessTrips.createdAt));

    if (status) {
      query = query.where(eq(businessTrips.status, status as string));
    }

    if (employeeId) {
      query = query.where(eq(businessTrips.employeeId, parseInt(employeeId as string)));
    }

    if (year) {
      query = query.where(sql`EXTRACT(YEAR FROM ${businessTrips.fromDate}) = ${year}`);
    }

    if (month) {
      query = query.where(sql`EXTRACT(MONTH FROM ${businessTrips.fromDate}) = ${month}`);
    }

    const trips = await query;

    res.json(trips);
  } catch (error) {
    console.error('Error fetching all trips:', error);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
};

/**
 * Get trip by ID with full details
 */
export const getTripById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const trip = await db
      .select({
        id: businessTrips.id,
        tripTitle: businessTrips.tripTitle,
        purpose: businessTrips.purpose,
        destination: businessTrips.destination,
        fromDate: businessTrips.fromDate,
        toDate: businessTrips.toDate,
        estimatedTravelCost: businessTrips.estimatedTravelCost,
        estimatedAccommodationCost: businessTrips.estimatedAccommodationCost,
        estimatedMiscCost: businessTrips.estimatedMiscCost,
        advanceRequested: businessTrips.advanceRequested,
        supportingDocumentUrl: businessTrips.supportingDocumentUrl,
        status: businessTrips.status,
        createdAt: businessTrips.createdAt,
        updatedAt: businessTrips.updatedAt,
        employeeName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
        employeeId: businessTrips.employeeId,
        employeeDepartment: users.department,
      })
      .from(businessTrips)
      .leftJoin(users, eq(businessTrips.employeeId, users.id))
      .where(eq(businessTrips.id, parseInt(id)))
      .limit(1);

    if (!trip.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get approvals
    const approvals = await db
      .select({
        id: tripApprovals.id,
        approvalType: tripApprovals.approvalType,
        status: tripApprovals.status,
        comments: tripApprovals.comments,
        approvedAt: tripApprovals.approvedAt,
        createdAt: tripApprovals.createdAt,
        approverName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
        approverId: tripApprovals.approverId,
      })
      .from(tripApprovals)
      .leftJoin(users, eq(tripApprovals.approverId, users.id))
      .where(eq(tripApprovals.tripId, parseInt(id)))
      .orderBy(asc(tripApprovals.createdAt));

    // Get bookings
    const bookings = await db
      .select({
        id: tripBookings.id,
        bookingType: tripBookings.bookingType,
        bookingDetails: tripBookings.bookingDetails,
        pnrReference: tripBookings.pnrReference,
        hotelName: tripBookings.hotelName,
        visaStatus: tripBookings.visaStatus,
        bookingDocumentUrl: tripBookings.bookingDocumentUrl,
        createdAt: tripBookings.createdAt,
        updatedAt: tripBookings.updatedAt,
        createdByName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
      })
      .from(tripBookings)
      .leftJoin(users, eq(tripBookings.createdBy, users.id))
      .where(eq(tripBookings.tripId, parseInt(id)))
      .orderBy(asc(tripBookings.createdAt));

    // Get expenses
    const expenses = await db
      .select({
        id: tripExpenses.id,
        category: tripExpenses.category,
        description: tripExpenses.description,
        amount: tripExpenses.amount,
        receiptUrl: tripExpenses.receiptUrl,
        expenseDate: tripExpenses.expenseDate,
        createdAt: tripExpenses.createdAt,
        submittedByName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
      })
      .from(tripExpenses)
      .leftJoin(users, eq(tripExpenses.submittedBy, users.id))
      .where(eq(tripExpenses.tripId, parseInt(id)))
      .orderBy(asc(tripExpenses.expenseDate));

    // Get reimbursement
    const reimbursement = await db
      .select({
        id: tripReimbursements.id,
        totalExpenses: tripReimbursements.totalExpenses,
        advanceGiven: tripReimbursements.advanceGiven,
        status: tripReimbursements.status,
        processedAt: tripReimbursements.processedAt,
        paymentReference: tripReimbursements.paymentReference,
        createdAt: tripReimbursements.createdAt,
        processedByName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
      })
      .from(tripReimbursements)
      .leftJoin(users, eq(tripReimbursements.processedBy, users.id))
      .where(eq(tripReimbursements.tripId, parseInt(id)))
      .limit(1);

    res.json({
      trip: trip[0],
      approvals,
      bookings,
      expenses,
      reimbursement: reimbursement[0] || null,
    });
  } catch (error) {
    console.error('Error fetching trip details:', error);
    res.status(500).json({ error: 'Failed to fetch trip details' });
  }
};

/**
 * Create a new trip request
 */
export const createTrip = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const {
      tripTitle,
      purpose,
      destination,
      fromDate,
      toDate,
      estimatedTravelCost,
      estimatedAccommodationCost,
      estimatedMiscCost,
      advanceRequested,
      supportingDocumentUrl,
    } = req.body;

    // Validate required fields
    if (!tripTitle || !purpose || !destination || !fromDate || !toDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.insert(businessTrips).values({
      employeeId: userId,
      tripTitle,
      purpose,
      destination,
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      estimatedTravelCost: estimatedTravelCost || '0',
      estimatedAccommodationCost: estimatedAccommodationCost || '0',
      estimatedMiscCost: estimatedMiscCost || '0',
      advanceRequested: advanceRequested || '0',
      supportingDocumentUrl,
      status: 'draft',
    }).returning();

    res.status(201).json({ 
      message: 'Trip request created successfully',
      trip: result[0]
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ error: 'Failed to create trip request' });
  }
};

/**
 * Update trip request
 */
export const updateTrip = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any)?.id;
    const {
      tripTitle,
      purpose,
      destination,
      fromDate,
      toDate,
      estimatedTravelCost,
      estimatedAccommodationCost,
      estimatedMiscCost,
      advanceRequested,
      supportingDocumentUrl,
    } = req.body;

    // Check if trip exists and belongs to user
    const existingTrip = await db
      .select()
      .from(businessTrips)
      .where(and(
        eq(businessTrips.id, parseInt(id)),
        eq(businessTrips.employeeId, userId)
      ))
      .limit(1);

    if (!existingTrip.length) {
      return res.status(404).json({ error: 'Trip not found or access denied' });
    }

    // Only allow updates if trip is in draft or rejected status
    if (!['draft', 'rejected'].includes(existingTrip[0].status)) {
      return res.status(400).json({ error: 'Cannot update trip in current status' });
    }

    const result = await db.update(businessTrips)
      .set({
        tripTitle,
        purpose,
        destination,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        estimatedTravelCost: estimatedTravelCost || '0',
        estimatedAccommodationCost: estimatedAccommodationCost || '0',
        estimatedMiscCost: estimatedMiscCost || '0',
        advanceRequested: advanceRequested || '0',
        supportingDocumentUrl,
        updatedAt: new Date(),
      })
      .where(eq(businessTrips.id, parseInt(id)))
      .returning();

    res.json({ 
      message: 'Trip updated successfully',
      trip: result[0]
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
};

/**
 * Submit trip for approval
 */
export const submitTrip = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any)?.id;

    // Check if trip exists and belongs to user
    const existingTrip = await db
      .select()
      .from(businessTrips)
      .where(and(
        eq(businessTrips.id, parseInt(id)),
        eq(businessTrips.employeeId, userId)
      ))
      .limit(1);

    if (!existingTrip.length) {
      return res.status(404).json({ error: 'Trip not found or access denied' });
    }

    if (existingTrip[0].status !== 'draft') {
      return res.status(400).json({ error: 'Trip cannot be submitted in current status' });
    }

    // Update trip status to submitted
    await db.update(businessTrips)
      .set({
        status: 'submitted',
        updatedAt: new Date(),
      })
      .where(eq(businessTrips.id, parseInt(id)));

    // Create manager approval record
    // For now, we'll use the user's reporting manager or admin
    // In a real system, this would be determined by org structure
    await db.insert(tripApprovals).values({
      tripId: parseInt(id),
      approverId: userId, // TODO: Get actual manager ID
      approvalType: 'manager',
      status: 'pending',
    });

    res.json({ message: 'Trip submitted for approval successfully' });
  } catch (error) {
    console.error('Error submitting trip:', error);
    res.status(500).json({ error: 'Failed to submit trip' });
  }
};

/**
 * Approve or reject trip
 */
export const approveTrip = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any)?.id;
    const { action, comments, approvalType } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    if (!['manager', 'admin', 'finance'].includes(approvalType)) {
      return res.status(400).json({ error: 'Invalid approval type' });
    }

    // Check if trip exists
    const existingTrip = await db
      .select()
      .from(businessTrips)
      .where(eq(businessTrips.id, parseInt(id)))
      .limit(1);

    if (!existingTrip.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Update or create approval record
    const existingApproval = await db
      .select()
      .from(tripApprovals)
      .where(and(
        eq(tripApprovals.tripId, parseInt(id)),
        eq(tripApprovals.approvalType, approvalType)
      ))
      .limit(1);

    if (existingApproval.length) {
      // Update existing approval
      await db.update(tripApprovals)
        .set({
          status: action === 'approve' ? 'approved' : 'rejected',
          comments,
          approvedAt: action === 'approve' ? new Date() : null,
        })
        .where(eq(tripApprovals.id, existingApproval[0].id));
    } else {
      // Create new approval
      await db.insert(tripApprovals).values({
        tripId: parseInt(id),
        approverId: userId,
        approvalType,
        status: action === 'approve' ? 'approved' : 'rejected',
        comments,
        approvedAt: action === 'approve' ? new Date() : null,
      });
    }

    // Update trip status based on approval workflow
    let newStatus = existingTrip[0].status;
    if (action === 'reject') {
      newStatus = 'rejected';
    } else if (action === 'approve') {
      if (approvalType === 'manager') {
        newStatus = 'manager_approved';
      } else if (approvalType === 'admin' || approvalType === 'finance') {
        newStatus = 'final_approved';
      }
    }

    await db.update(businessTrips)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(businessTrips.id, parseInt(id)));

    res.json({ message: `Trip ${action}d successfully` });
  } catch (error) {
    console.error('Error approving/rejecting trip:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
};

/**
 * Get trip dashboard statistics
 */
export const getTripDashboard = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    // Base query condition - employees see only their trips, admins see all
    const baseCondition = userRole === 'Superuser' || userRole === 'General Manager' 
      ? undefined 
      : eq(businessTrips.employeeId, userId);

    // Get trip counts by status
    const statusCounts = await db
      .select({
        status: businessTrips.status,
        count: count(),
      })
      .from(businessTrips)
      .where(baseCondition)
      .groupBy(businessTrips.status);

    // Get upcoming trips (next 30 days)
    const upcomingTrips = await db
      .select({
        id: businessTrips.id,
        tripTitle: businessTrips.tripTitle,
        destination: businessTrips.destination,
        fromDate: businessTrips.fromDate,
        toDate: businessTrips.toDate,
        status: businessTrips.status,
        employeeName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
      })
      .from(businessTrips)
      .leftJoin(users, eq(businessTrips.employeeId, users.id))
      .where(and(
        baseCondition,
        sql`${businessTrips.fromDate} >= CURRENT_DATE`,
        sql`${businessTrips.fromDate} <= CURRENT_DATE + INTERVAL '30 days'`,
        or(
          eq(businessTrips.status, 'final_approved'),
          eq(businessTrips.status, 'manager_approved')
        )
      ))
      .orderBy(asc(businessTrips.fromDate))
      .limit(10);

    // Get monthly spend summary (last 12 months)
    const monthlySpend = await db
      .select({
        month: sql<string>`TO_CHAR(${businessTrips.fromDate}, 'YYYY-MM')`,
        totalEstimated: sum(sql`${businessTrips.estimatedTravelCost} + ${businessTrips.estimatedAccommodationCost} + ${businessTrips.estimatedMiscCost}`),
        tripCount: count(),
      })
      .from(businessTrips)
      .where(and(
        baseCondition,
        sql`${businessTrips.fromDate} >= CURRENT_DATE - INTERVAL '12 months'`
      ))
      .groupBy(sql`TO_CHAR(${businessTrips.fromDate}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${businessTrips.fromDate}, 'YYYY-MM')`);

    // Get pending approvals (for managers/admins)
    const pendingApprovals = await db
      .select({
        id: businessTrips.id,
        tripTitle: businessTrips.tripTitle,
        destination: businessTrips.destination,
        fromDate: businessTrips.fromDate,
        status: businessTrips.status,
        employeeName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
        createdAt: businessTrips.createdAt,
      })
      .from(businessTrips)
      .leftJoin(users, eq(businessTrips.employeeId, users.id))
      .where(or(
        eq(businessTrips.status, 'submitted'),
        eq(businessTrips.status, 'manager_approved')
      ))
      .orderBy(asc(businessTrips.createdAt))
      .limit(10);

    res.json({
      statusCounts,
      upcomingTrips,
      monthlySpend,
      pendingApprovals: userRole === 'Superuser' || userRole === 'General Manager' ? pendingApprovals : [],
    });
  } catch (error) {
    console.error('Error fetching trip dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

export default {
  getUserTrips,
  getAllTrips,
  getTripById,
  createTrip,
  updateTrip,
  submitTrip,
  approveTrip,
  getTripDashboard,
};