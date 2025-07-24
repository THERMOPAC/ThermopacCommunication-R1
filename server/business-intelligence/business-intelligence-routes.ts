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

    // Calculate actual compliance rate from real data
    const totalUsersForCompliance = totalUsersResult[0]?.count || 0;
    const activePeriodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const expectedAttendanceDays = activePeriodDays * totalUsersForCompliance;
    
    // Get actual attendance data
    const actualAttendanceResult = await db
      .select({ count: count() })
      .from(attendanceRecords)
      .where(
        and(
          gte(attendanceRecords.date, start),
          lte(attendanceRecords.date, end)
        )
      );
    
    const actualAttendance = actualAttendanceResult[0]?.count || 0;
    const attendanceRate = expectedAttendanceDays > 0 ? (actualAttendance / expectedAttendanceDays) * 100 : 0;
    
    // Calculate task completion rate for productivity
    const tasksResult = await db
      .select({
        totalTasks: count(),
        completedTasks: count(sql`CASE WHEN ${tasks.status} = 'completed' THEN 1 END`)
      })
      .from(tasks)
      .where(
        and(
          gte(tasks.createdAt, start),
          lte(tasks.createdAt, end)
        )
      );
    
    const taskCompletionRate = tasksResult[0]?.totalTasks > 0 
      ? (tasksResult[0]?.completedTasks / tasksResult[0]?.totalTasks) * 100 
      : 0;
    
    // Calculate inspection completion rate for quality metrics
    const inspectionCompletionRate = systemHealthMetrics[0]?.totalInspections > 0
      ? (systemHealthMetrics[0]?.completedInspections / systemHealthMetrics[0]?.totalInspections) * 100
      : 0;
    
    // Calculate invoice payment rate for financial health
    const invoicePaymentRate = systemHealthMetrics[0]?.totalInvoices > 0
      ? (systemHealthMetrics[0]?.paidInvoices / systemHealthMetrics[0]?.totalInvoices) * 100
      : 0;
    
    // Weighted system health score
    const systemHealthScore = Math.round(
      (attendanceRate * 0.2) + 
      (taskCompletionRate * 0.3) + 
      (inspectionCompletionRate * 0.3) + 
      (invoicePaymentRate * 0.2)
    );
    
    const overview = {
      totalActiveUsers: activeUsersResult[0]?.count || 0,
      totalUsers: totalUsersForCompliance,
      systemHealthScore: Math.min(100, Math.max(0, systemHealthScore)),
      complianceRate: Math.round(attendanceRate),
      productivityIndex: Math.round(taskCompletionRate),
      taskCompletionRate: Math.round(taskCompletionRate),
      inspectionCompletionRate: Math.round(inspectionCompletionRate),
      invoicePaymentRate: Math.round(invoicePaymentRate),
      ...systemHealthMetrics[0],
      // Add actionable insights
      insights: {
        healthStatus: systemHealthScore >= 80 ? 'healthy' : systemHealthScore >= 60 ? 'warning' : 'critical',
        complianceStatus: attendanceRate >= 85 ? 'good' : attendanceRate >= 70 ? 'moderate' : 'poor',
        productivityStatus: taskCompletionRate >= 80 ? 'excellent' : taskCompletionRate >= 60 ? 'good' : 'needs_improvement'
      }
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
// BUSINESS INSIGHTS & RECOMMENDATIONS
// ============================================================================

// Get actionable business insights and recommendations
router.get('/insights', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get overdue tasks with details
    const overdueTasksDetails = await db
      .select()
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedTo, users.id))
      .where(
        and(
          eq(tasks.status, 'pending'),
          lte(tasks.dueDate, new Date())
        )
      )
      .orderBy(tasks.dueDate)
      .limit(10);

    // Get overdue tasks count
    const overdueTasks = await db
      .select({
        count: count(),
        oldestOverdue: sql`MIN(${tasks.dueDate})`
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'pending'),
          lte(tasks.dueDate, new Date())
        )
      );

    // Get users with low attendance
    const lowAttendanceUsers = await db
      .select({
        userId: attendanceRecords.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        attendanceCount: count(attendanceRecords.id)
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id))
      .where(
        and(
          gte(attendanceRecords.date, start),
          lte(attendanceRecords.date, end)
        )
      )
      .groupBy(attendanceRecords.userId, users.username, users.firstName, users.lastName)
      .having(sql`COUNT(${attendanceRecords.id}) < 20`); // Less than 20 days in period

    // Get pending inspections
    const pendingInspections = await db
      .select({
        count: count(),
        oldestPending: sql`MIN(${inspectionOrders.createdAt})`
      })
      .from(inspectionOrders)
      .where(eq(inspectionOrders.status, 'pending'));

    // Get unpaid invoices
    const unpaidInvoices = await db
      .select({
        count: count(),
        totalAmount: sum(invoices.totalAmount),
        oldestUnpaid: sql`MIN(${invoices.issueDate})`
      })
      .from(invoices)
      .where(eq(invoices.status, 'Pending'));

    // Generate insights based on data
    const insights = [];
    const recommendations = [];
    const alerts = [];

    // Task Management Insights
    if (overdueTasks[0]?.count > 0) {
      alerts.push({
        type: 'critical',
        category: 'tasks',
        title: 'Overdue Tasks Alert',
        message: `${overdueTasks[0].count} tasks are overdue and require immediate attention`,
        action: 'Review and reassign overdue tasks immediately',
        priority: 'High',
        context: {
          totalOverdue: overdueTasks[0].count,
          oldestOverdueDate: overdueTasks[0].oldestOverdue,
          taskDetails: overdueTasksDetails.map(row => {
            const task = row.tasks;
            const user = row.users;
            const daysPastDue = Math.floor((new Date().getTime() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24));
            
            return {
              id: task.id,
              title: task.title,
              assignee: user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}` 
                : user?.username || 'Unassigned',
              dueDate: task.dueDate,
              daysPastDue: daysPastDue,
              priority: task.priority || 'Normal'
            };
          })
        }
      });
      
      recommendations.push({
        category: 'productivity',
        title: 'Task Management Improvement',
        description: 'Implement daily task review meetings to prevent overdue tasks',
        impact: 'High',
        effort: 'Medium'
      });
    }

    // Attendance Insights
    if (lowAttendanceUsers.length > 0) {
      alerts.push({
        type: 'warning',
        category: 'attendance',
        title: 'Low Attendance Alert',
        message: `${lowAttendanceUsers.length} users have low attendance`,
        action: 'Contact HR department for attendance review',
        priority: 'medium'
      });

      recommendations.push({
        category: 'compliance',
        title: 'Attendance Monitoring',
        description: 'Implement automated attendance tracking and alerts',
        impact: 'Medium',
        effort: 'Low'
      });
    }

    // Quality Management Insights
    if (pendingInspections[0]?.count > 0) {
      const urgencyLevel = pendingInspections[0].count > 10 ? 'critical' : 'warning';
      alerts.push({
        type: urgencyLevel,
        category: 'quality',
        title: 'Pending Inspections',
        message: `${pendingInspections[0].count} inspections are pending`,
        action: 'Allocate additional inspection resources',
        priority: urgencyLevel === 'critical' ? 'high' : 'medium'
      });
    }

    // Financial Insights
    if (unpaidInvoices[0]?.count > 0) {
      alerts.push({
        type: 'warning',
        category: 'finance',
        title: 'Outstanding Payments',
        message: `${unpaidInvoices[0].count} invoices pending payment (₹${unpaidInvoices[0].totalAmount || 0})`,
        action: 'Follow up with finance team on payment collection',
        priority: 'high'
      });

      recommendations.push({
        category: 'finance',
        title: 'Payment Process Optimization',
        description: 'Implement automated payment reminders and follow-up system',
        impact: 'High',
        effort: 'Medium'
      });
    }

    // Performance Insights
    insights.push({
      category: 'performance',
      title: 'System Utilization',
      description: 'Current system shows good user engagement with room for process optimization',
      trend: 'stable',
      recommendation: 'Focus on automation to improve efficiency'
    });

    res.json({
      insights,
      recommendations,
      alerts,
      summary: {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.type === 'critical').length,
        pendingActions: alerts.filter(a => a.priority === 'high').length,
        improvementOpportunities: recommendations.length
      }
    });
  } catch (error) {
    console.error('Error fetching business insights:', error);
    res.status(500).json({ error: 'Failed to fetch business insights' });
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