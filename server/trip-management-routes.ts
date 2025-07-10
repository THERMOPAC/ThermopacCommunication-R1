import { Request, Response } from 'express';
import { db } from './db';
import { businessTrips, tripApprovals, tripBookings, tripExpenses, tripReimbursements, tripDocuments, users } from '@shared/schema';
import { eq, and, or, desc, asc, sql, sum, count } from 'drizzle-orm';
import { z } from 'zod';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';

// ===================== GCS CONFIGURATION =====================

// Initialize Google Cloud Storage
let storage: Storage;
let bucket: any;

try {
  const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS 
    ? JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS)
    : null;

  if (credentials) {
    storage = new Storage({
      credentials,
      projectId: credentials.project_id,
    });
    bucket = storage.bucket('thermopac_storage');
  } else {
    console.log('Google Cloud credentials not found, file upload will be disabled');
  }
} catch (error) {
  console.error('Error initializing Google Cloud Storage:', error);
}

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document and image formats
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/zip'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, images, and ZIP files are allowed.'));
    }
  }
});

// Helper function to generate structured GCS path
const generateGCSPath = (employeeData: any, destination: string, fromDate: string, documentType: string, fileName: string): string => {
  // Get current financial year (April to March)
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 0-based
  
  const financialYear = currentMonth >= 4 
    ? `FY${currentYear}-${currentYear + 1}`
    : `FY${currentYear - 1}-${currentYear}`;
  
  // Use employee name or username
  const employeeName = employeeData.firstName && employeeData.lastName 
    ? `${employeeData.firstName}_${employeeData.lastName}`.replace(/\s+/g, '_')
    : employeeData.username.replace(/\s+/g, '_');
  
  // Clean destination and document type for file path
  const cleanDestination = destination.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanDocumentType = documentType.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // Format date for path
  const formattedDate = new Date(fromDate).toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Generate path: FY/{user_id_or_name}/{Destination}/{From Date}/{Document Type}/filename
  return `${financialYear}/${employeeName}/${cleanDestination}/${formattedDate}/${cleanDocumentType}/${fileName}`;
};

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
      employeeId,
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
    if (!employeeId || !tripTitle || !purpose || !destination || !fromDate || !toDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.insert(businessTrips).values({
      employeeId: parseInt(employeeId),
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
 * Delete trip request
 */
export const deleteTrip = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    // Check if trip exists
    const existingTrip = await db
      .select()
      .from(businessTrips)
      .where(eq(businessTrips.id, parseInt(id)))
      .limit(1);

    if (!existingTrip.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Check permissions: users can only delete their own trips unless they are admin
    const isOwner = existingTrip[0].employeeId === userId;
    const isAdmin = userRole === 'Superuser' || userRole === 'General Manager';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own trip requests.' });
    }

    // Only allow deletion if trip is in draft or rejected status
    if (!['draft', 'rejected'].includes(existingTrip[0].status)) {
      return res.status(400).json({ error: 'Cannot delete trip in current status. Only draft or rejected trips can be deleted.' });
    }

    // Delete associated records first (cascade delete)
    await db.delete(tripApprovals).where(eq(tripApprovals.tripId, parseInt(id)));
    await db.delete(tripDocuments).where(eq(tripDocuments.tripId, parseInt(id)));
    await db.delete(tripBookings).where(eq(tripBookings.tripId, parseInt(id)));
    await db.delete(tripExpenses).where(eq(tripExpenses.tripId, parseInt(id)));
    await db.delete(tripReimbursements).where(eq(tripReimbursements.tripId, parseInt(id)));

    // Delete the trip request
    await db.delete(businessTrips).where(eq(businessTrips.id, parseInt(id)));

    res.json({ message: 'Trip request deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ error: 'Failed to delete trip request' });
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

// ===================== TRIP DOCUMENT UPLOAD ENDPOINTS =====================

/**
 * Upload document for a business trip
 */
export const uploadTripDocument = async (req: Request, res: Response) => {
  try {
    if (!bucket) {
      return res.status(500).json({ error: 'File upload service not available' });
    }

    const { tripId } = req.params;
    const { documentType, description } = req.body;
    const file = req.file;
    const userId = (req.user as any)?.id;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!documentType) {
      return res.status(400).json({ error: 'Document type is required' });
    }

    // Get trip details for path generation
    const trip = await db
      .select({
        id: businessTrips.id,
        destination: businessTrips.destination,
        fromDate: businessTrips.fromDate,
        employeeId: businessTrips.employeeId,
      })
      .from(businessTrips)
      .where(eq(businessTrips.id, parseInt(tripId)))
      .limit(1);

    if (!trip.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get employee details for path generation
    const employee = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, trip[0].employeeId))
      .limit(1);

    if (!employee.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${originalName}`;

    // Generate structured GCS path
    const gcsPath = generateGCSPath(
      employee[0],
      trip[0].destination,
      trip[0].fromDate.toString(),
      documentType,
      fileName
    );

    // Upload to Google Cloud Storage
    const gcsFile = bucket.file(gcsPath);
    const stream = gcsFile.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        cacheControl: 'no-cache',
      },
      resumable: false,
    });

    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(file.buffer);
    });

    // Generate signed URL for access
    const [signedUrl] = await gcsFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    // Save document record to database
    const result = await db.insert(tripDocuments).values({
      tripId: parseInt(tripId),
      documentType,
      documentName: file.originalname,
      filePath: gcsPath,
      fileUrl: signedUrl,
      fileSize: file.size,
      fileType: file.mimetype,
      description: description || null,
      uploadedBy: userId,
    }).returning();

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: result[0],
    });
  } catch (error) {
    console.error('Error uploading trip document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

/**
 * Get all documents for a trip
 */
export const getTripDocuments = async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;

    const documents = await db
      .select({
        id: tripDocuments.id,
        documentType: tripDocuments.documentType,
        documentName: tripDocuments.documentName,
        filePath: tripDocuments.filePath,
        fileUrl: tripDocuments.fileUrl,
        fileSize: tripDocuments.fileSize,
        fileType: tripDocuments.fileType,
        description: tripDocuments.description,
        uploadedAt: tripDocuments.uploadedAt,
        uploadedByName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`,
        uploadedBy: tripDocuments.uploadedBy,
      })
      .from(tripDocuments)
      .leftJoin(users, eq(tripDocuments.uploadedBy, users.id))
      .where(and(
        eq(tripDocuments.tripId, parseInt(tripId)),
        eq(tripDocuments.isActive, true)
      ))
      .orderBy(desc(tripDocuments.uploadedAt));

    res.json(documents);
  } catch (error) {
    console.error('Error fetching trip documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

/**
 * Delete a trip document
 */
export const deleteTripDocument = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const userId = (req.user as any)?.id;

    // Get document details
    const document = await db
      .select()
      .from(tripDocuments)
      .where(eq(tripDocuments.id, parseInt(documentId)))
      .limit(1);

    if (!document.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user can delete (uploaded by user or admin)
    const userRole = (req.user as any)?.role;
    if (document[0].uploadedBy !== userId && !['Superuser', 'General Manager'].includes(userRole)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Soft delete - mark as inactive
    await db
      .update(tripDocuments)
      .set({ isActive: false })
      .where(eq(tripDocuments.id, parseInt(documentId)));

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

/**
 * Download document (generate fresh signed URL)
 */
export const downloadTripDocument = async (req: Request, res: Response) => {
  try {
    if (!bucket) {
      return res.status(500).json({ error: 'File download service not available' });
    }

    const { documentId } = req.params;

    // Get document details
    const document = await db
      .select()
      .from(tripDocuments)
      .where(and(
        eq(tripDocuments.id, parseInt(documentId)),
        eq(tripDocuments.isActive, true)
      ))
      .limit(1);

    if (!document.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const gcsFile = bucket.file(document[0].filePath);
    
    // Check if file exists in GCS
    const [exists] = await gcsFile.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    // Generate fresh signed URL for download
    const [signedUrl] = await gcsFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    res.json({
      downloadUrl: signedUrl,
      fileName: document[0].documentName,
      fileType: document[0].fileType,
      fileSize: document[0].fileSize,
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
};

export default {
  getUserTrips,
  getAllTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip,
  submitTrip,
  approveTrip,
  getTripDashboard,
  uploadTripDocument,
  getTripDocuments,
  deleteTripDocument,
  downloadTripDocument,
  upload, // Export multer upload middleware
};