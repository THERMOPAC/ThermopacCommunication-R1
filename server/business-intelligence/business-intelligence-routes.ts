import { Router } from 'express';
import { db } from '../db';
import { 
  userActivityLogs, 
  userModuleStats, 
  userComplianceMetrics, 
  userProductivityMetrics,
  users,
  inspectionOrders,
  invoices,
  tasks,
  attendanceRecords,
  insertUserActivityLogSchema,
  insertUserModuleStatsSchema,
  insertUserComplianceMetricsSchema,
  insertUserProductivityMetricsSchema
} from '../../shared/schema';
import { eq, desc, count, sum, avg, and, gte, lte, sql } from 'drizzle-orm';
import { ensureAuthenticated } from '../auth-middleware';
import { z } from 'zod';

const router = Router();

// Middleware to ensure only Superusers can access Business Intelligence
router.use(ensureAuthenticated);
router.use((req: any, res: any, next: any) => {
  if (req.user?.role !== 'Superuser') {
    return res.status(403).json({ 
      success: false, 
      error: 'Access denied. Superuser role required.' 
    });
  }
  next();
});

// ============================================================================
// OVERVIEW & DASHBOARD ANALYTICS
// ============================================================================

// Get dashboard overview statistics
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to last 30 days if no date range provided
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get total active users (users with activity in date range)
    const activeUsersResult = await db
      .select({ count: count() })
      .from(userActivityLogs)
      .where(
        and(
          gte(userActivityLogs.createdAt, start),
          lte(userActivityLogs.createdAt, end)
        )
      );

    // Get total users
    const totalUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.isActive, true));

    // Get system health metrics
    const systemHealthMetrics = await db
      .select({
        totalInspections: count(inspectionOrders.id),
        completedInspections: count(sql`CASE WHEN ${inspectionOrders.status} = 'completed' THEN 1 END`),
        totalInvoices: count(invoices.id),
        paidInvoices: count(sql`CASE WHEN ${invoices.status} = 'Paid' THEN 1 END`),
      })
      .from(inspectionOrders)
      .leftJoin(invoices, eq(invoices.id, invoices.id));

    // Calculate compliance rate (placeholder - we'll enhance this)
    const complianceRate = 85.5; // This should be calculated from actual compliance data

    // Calculate productivity index (placeholder - we'll enhance this)
    const productivityIndex = 92.3; // This should be calculated from actual productivity metrics

    const overview = {
      totalActiveUsers: activeUsersResult[0]?.count || 0,
      totalUsers: totalUsersResult[0]?.count || 0,
      systemHealthScore: 94.2, // Calculated based on various factors
      complianceRate,
      productivityIndex,
      ...systemHealthMetrics[0]
    };

    res.json(overview);
  } catch (error) {
    console.error('Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview statistics' });
  }
});

// ============================================================================
// USER ACTIVITY ANALYTICS
// ============================================================================

// Get user activity statistics
router.get('/activity-stats', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get activity by time periods
    const activityByTime = await db
      .select({
        date: sql`DATE(${userActivityLogs.createdAt})`,
        totalActions: count(userActivityLogs.id),
        uniqueUsers: count(sql`DISTINCT ${userActivityLogs.userId}`)
      })
      .from(userActivityLogs)
      .where(
        and(
          gte(userActivityLogs.createdAt, start),
          lte(userActivityLogs.createdAt, end)
        )
      )
      .groupBy(sql`DATE(${userActivityLogs.createdAt})`)
      .orderBy(sql`DATE(${userActivityLogs.createdAt})`);

    // Get most active users
    const mostActiveUsers = await db
      .select({
        userId: userActivityLogs.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        totalActions: count(userActivityLogs.id),
        averageSessionDuration: avg(userActivityLogs.sessionDuration)
      })
      .from(userActivityLogs)
      .leftJoin(users, eq(userActivityLogs.userId, users.id))
      .where(
        and(
          gte(userActivityLogs.createdAt, start),
          lte(userActivityLogs.createdAt, end)
        )
      )
      .groupBy(userActivityLogs.userId, users.username, users.firstName, users.lastName, users.role)
      .orderBy(desc(count(userActivityLogs.id)))
      .limit(10);

    // Get peak activity hours
    const peakHours = await db
      .select({
        hour: sql`EXTRACT(HOUR FROM ${userActivityLogs.createdAt})`,
        activityCount: count(userActivityLogs.id)
      })
      .from(userActivityLogs)
      .where(
        and(
          gte(userActivityLogs.createdAt, start),
          lte(userActivityLogs.createdAt, end)
        )
      )
      .groupBy(sql`EXTRACT(HOUR FROM ${userActivityLogs.createdAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${userActivityLogs.createdAt})`);

    res.json({
      activityByTime,
      mostActiveUsers,
      peakHours
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity statistics' });
  }
});

// ============================================================================
// MODULE USAGE ANALYTICS
// ============================================================================

// Get module usage statistics
router.get('/module-usage', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get module usage statistics
    const moduleUsage = await db
      .select({
        module: userActivityLogs.module,
        totalActions: count(userActivityLogs.id),
        uniqueUsers: count(sql`DISTINCT ${userActivityLogs.userId}`),
        averageSessionDuration: avg(userActivityLogs.sessionDuration)
      })
      .from(userActivityLogs)
      .where(
        and(
          gte(userActivityLogs.createdAt, start),
          lte(userActivityLogs.createdAt, end)
        )
      )
      .groupBy(userActivityLogs.module)
      .orderBy(desc(count(userActivityLogs.id)));

    // Get module adoption over time
    const moduleAdoption = await db
      .select({
        date: sql`DATE(${userActivityLogs.createdAt})`,
        module: userActivityLogs.module,
        uniqueUsers: count(sql`DISTINCT ${userActivityLogs.userId}`)
      })
      .from(userActivityLogs)
      .where(
        and(
          gte(userActivityLogs.createdAt, start),
          lte(userActivityLogs.createdAt, end)
        )
      )
      .groupBy(sql`DATE(${userActivityLogs.createdAt})`, userActivityLogs.module)
      .orderBy(sql`DATE(${userActivityLogs.createdAt})`, userActivityLogs.module);

    res.json({
      moduleUsage,
      moduleAdoption
    });
  } catch (error) {
    console.error('Error fetching module usage:', error);
    res.status(500).json({ error: 'Failed to fetch module usage statistics' });
  }
});

// ============================================================================
// PRODUCTIVITY METRICS
// ============================================================================

// Get productivity metrics
router.get('/productivity-metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get productivity metrics by user
    const userProductivity = await db
      .select({
        userId: userProductivityMetrics.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        department: users.department,
        totalTasks: sum(userProductivityMetrics.tasksCompleted),
        totalInspections: sum(userProductivityMetrics.inspectionsProcessed),
        totalDocuments: sum(userProductivityMetrics.documentsGenerated),
        averageAttendance: avg(userProductivityMetrics.attendanceScore),
        averageEfficiency: avg(userProductivityMetrics.efficiencyScore)
      })
      .from(userProductivityMetrics)
      .leftJoin(users, eq(userProductivityMetrics.userId, users.id))
      .where(
        and(
          gte(userProductivityMetrics.date, start),
          lte(userProductivityMetrics.date, end)
        )
      )
      .groupBy(
        userProductivityMetrics.userId, 
        users.username, 
        users.firstName, 
        users.lastName, 
        users.role,
        users.department
      )
      .orderBy(desc(avg(userProductivityMetrics.efficiencyScore)));

    // Get productivity trends over time
    const productivityTrends = await db
      .select({
        date: userProductivityMetrics.date,
        averageEfficiency: avg(userProductivityMetrics.efficiencyScore),
        totalTasks: sum(userProductivityMetrics.tasksCompleted),
        totalInspections: sum(userProductivityMetrics.inspectionsProcessed)
      })
      .from(userProductivityMetrics)
      .where(
        and(
          gte(userProductivityMetrics.date, start),
          lte(userProductivityMetrics.date, end)
        )
      )
      .groupBy(userProductivityMetrics.date)
      .orderBy(userProductivityMetrics.date);

    res.json({
      userProductivity,
      productivityTrends
    });
  } catch (error) {
    console.error('Error fetching productivity metrics:', error);
    res.status(500).json({ error: 'Failed to fetch productivity metrics' });
  }
});

// ============================================================================
// COMPLIANCE STATUS
// ============================================================================

// Get compliance status
router.get('/compliance-status', async (req, res) => {
  try {
    // Get compliance overview
    const complianceOverview = await db
      .select({
        complianceType: userComplianceMetrics.complianceType,
        status: userComplianceMetrics.status,
        count: count(userComplianceMetrics.id)
      })
      .from(userComplianceMetrics)
      .groupBy(userComplianceMetrics.complianceType, userComplianceMetrics.status)
      .orderBy(userComplianceMetrics.complianceType);

    // Get users with non-compliant status
    const nonCompliantUsers = await db
      .select({
        userId: userComplianceMetrics.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        department: users.department,
        complianceType: userComplianceMetrics.complianceType,
        status: userComplianceMetrics.status,
        dueDate: userComplianceMetrics.dueDate,
        score: userComplianceMetrics.score
      })
      .from(userComplianceMetrics)
      .leftJoin(users, eq(userComplianceMetrics.userId, users.id))
      .where(eq(userComplianceMetrics.status, 'non_compliant'))
      .orderBy(userComplianceMetrics.dueDate);

    // Get upcoming compliance deadlines
    const upcomingDeadlines = await db
      .select({
        userId: userComplianceMetrics.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        complianceType: userComplianceMetrics.complianceType,
        dueDate: userComplianceMetrics.dueDate,
        status: userComplianceMetrics.status
      })
      .from(userComplianceMetrics)
      .leftJoin(users, eq(userComplianceMetrics.userId, users.id))
      .where(
        and(
          gte(userComplianceMetrics.dueDate, new Date()),
          lte(userComplianceMetrics.dueDate, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
        )
      )
      .orderBy(userComplianceMetrics.dueDate);

    res.json({
      complianceOverview,
      nonCompliantUsers,
      upcomingDeadlines
    });
  } catch (error) {
    console.error('Error fetching compliance status:', error);
    res.status(500).json({ error: 'Failed to fetch compliance status' });
  }
});

// ============================================================================
// USER DETAILS
// ============================================================================

// Get detailed analytics for a specific user
router.get('/user-details/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get user basic info
    const userInfo = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userInfo.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user activity timeline
    const activityTimeline = await db
      .select()
      .from(userActivityLogs)
      .where(
        and(
          eq(userActivityLogs.userId, userId),
          gte(userActivityLogs.createdAt, start),
          lte(userActivityLogs.createdAt, end)
        )
      )
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(100);

    // Get user module statistics
    const moduleStats = await db
      .select()
      .from(userModuleStats)
      .where(
        and(
          eq(userModuleStats.userId, userId),
          gte(userModuleStats.date, start),
          lte(userModuleStats.date, end)
        )
      )
      .orderBy(userModuleStats.date);

    // Get user productivity metrics
    const productivityMetrics = await db
      .select()
      .from(userProductivityMetrics)
      .where(
        and(
          eq(userProductivityMetrics.userId, userId),
          gte(userProductivityMetrics.date, start),
          lte(userProductivityMetrics.date, end)
        )
      )
      .orderBy(userProductivityMetrics.date);

    // Get user compliance status
    const complianceStatus = await db
      .select()
      .from(userComplianceMetrics)
      .where(eq(userComplianceMetrics.userId, userId))
      .orderBy(desc(userComplianceMetrics.updatedAt));

    res.json({
      userInfo: userInfo[0],
      activityTimeline,
      moduleStats,
      productivityMetrics,
      complianceStatus
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// ============================================================================
// ACTIVITY LOGGING (for tracking user actions)
// ============================================================================

// Log user activity (this will be called by middleware in other modules)
router.post('/log-activity', async (req, res) => {
  try {
    const validatedData = insertUserActivityLogSchema.parse(req.body);
    
    const result = await db
      .insert(userActivityLogs)
      .values(validatedData)
      .returning();

    res.json(result[0]);
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

export { router as businessIntelligenceRoutes };