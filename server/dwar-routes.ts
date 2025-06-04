import { Router, Request, Response } from 'express';
import { db } from './db';
import { dailyWorkReports, monthlyKpiSummary, attendanceRecords, users, tasks } from '@shared/schema';
import { eq, and, gte, lte, desc, sql, avg, sum, count } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

// Get available tasks for auto-association
router.get('/available-tasks', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // Get active tasks assigned to the user
    const availableTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        priority: tasks.priority,
        status: tasks.status,
        startDate: tasks.startDate,
        finishDate: tasks.finishDate,
        dueDate: tasks.dueDate
      })
      .from(tasks)
      .where(and(
        eq(tasks.assignedTo, userId),
        eq(tasks.status, 'pending')
      ))
      .orderBy(desc(tasks.createdAt))
      .limit(20);

    res.json(availableTasks);
  } catch (error) {
    console.error('Error fetching available tasks:', error);
    res.json([]); // Return empty array if tasks table doesn't exist yet
  }
});

// Auto-create DWAR activity when task is completed
router.post('/auto-activity-from-task', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { taskId, timeSpent, status } = req.body;
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0];

    // Get or create today's DWAR
    let [todayReport] = await db
      .select()
      .from(dailyWorkReports)
      .where(and(
        eq(dailyWorkReports.userId, userId),
        eq(dailyWorkReports.reportDate, today)
      ));

    if (!todayReport) {
      [todayReport] = await db
        .insert(dailyWorkReports)
        .values({
          userId,
          reportDate: today,
          activities: [],
          priorityTasks: [],
          status: 'draft'
        })
        .returning();
    }

    // Get task details
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Create activity from completed task
    const newActivity = {
      type: 'Task Work',
      description: task.title,
      timeSpent: timeSpent || 1,
      plannedHours: 1, // Default planned hours
      priority: task.priority?.toLowerCase() || 'medium',
      status: status === 'completed' ? 'completed' : 'in_progress',
      taskId: task.id,
      blockedReason: ''
    };

    const updatedActivities = [...(todayReport.activities || []), newActivity];
    const totalHours = updatedActivities.reduce((sum, a) => sum + (a.timeSpent || 0), 0);
    const completedTasks = updatedActivities.filter(a => a.status === 'completed').length;
    const inProgressTasks = updatedActivities.filter(a => a.status === 'in_progress').length;

    // Calculate productivity score
    let productivityScore = 0;
    if (updatedActivities.length > 0) {
      const completedActivities = updatedActivities.filter(a => a.status === 'completed');
      const totalActivities = updatedActivities.length;
      const avgTimeSpent = updatedActivities.reduce((sum, a) => sum + (a.timeSpent || 0), 0) / totalActivities;
      
      productivityScore = (completedActivities.length / totalActivities) * 50 + 
                         Math.min(avgTimeSpent / 8, 1) * 30 + 
                         completedTasks * 5;
      productivityScore = Math.min(productivityScore, 100);
    }

    // Update DWAR with new activity
    const [updatedReport] = await db
      .update(dailyWorkReports)
      .set({
        activities: updatedActivities,
        hoursWorked: totalHours,
        tasksCompleted: completedTasks,
        tasksInProgress: inProgressTasks,
        productivityScore: Number(productivityScore.toFixed(2)),
        updatedAt: new Date()
      })
      .where(eq(dailyWorkReports.id, todayReport.id))
      .returning();

    res.json({ 
      message: 'Task activity auto-added to DWAR', 
      report: updatedReport,
      activity: newActivity 
    });

  } catch (error) {
    console.error('Error auto-creating DWAR activity from task:', error);
    res.status(500).json({ error: 'Failed to auto-create activity from task' });
  }
});

// Get or create today's DWAR for current user
router.get('/today', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0];

    let [todayReport] = await db
      .select()
      .from(dailyWorkReports)
      .where(and(
        eq(dailyWorkReports.userId, userId),
        eq(dailyWorkReports.reportDate, today)
      ));

    if (!todayReport) {
      // Create a new report for today
      [todayReport] = await db
        .insert(dailyWorkReports)
        .values({
          userId,
          reportDate: today,
          activities: [],
          priorityTasks: [],
          status: 'draft'
        })
        .returning();
    }

    res.json(todayReport);
  } catch (error) {
    console.error('Error getting today\'s DWAR:', error);
    res.status(500).json({ error: 'Failed to get today\'s report' });
  }
});

// Update DWAR
router.put('/update/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(req.params.id);
    const userId = req.user!.id;
    const updateData = req.body;

    // Calculate productivity score based on activities
    let productivityScore = 0;
    if (updateData.activities && updateData.activities.length > 0) {
      const completedActivities = updateData.activities.filter((a: any) => a.status === 'completed');
      const totalActivities = updateData.activities.length;
      const avgTimeSpent = updateData.activities.reduce((sum: number, a: any) => sum + (a.timeSpent || 0), 0) / totalActivities;
      
      productivityScore = (completedActivities.length / totalActivities) * 50 + 
                         Math.min(avgTimeSpent / 8, 1) * 30 + 
                         (updateData.tasksCompleted || 0) * 5;
      productivityScore = Math.min(productivityScore, 100);
    }

    // Calculate quality score based on task completion rate and manager feedback
    let qualityScore = productivityScore * 0.7; // Base on productivity
    if (updateData.managerRating) {
      qualityScore = (updateData.managerRating / 5) * 100;
    }

    // Calculate efficiency rating
    const efficiencyRating = updateData.hoursWorked > 0 ? 
      ((updateData.tasksCompleted || 0) / updateData.hoursWorked) * 20 : 0;

    // Calculate collaboration score (based on activities involving others)
    const collaborationActivities = updateData.activities?.filter((a: any) => 
      a.description?.toLowerCase().includes('meeting') || 
      a.description?.toLowerCase().includes('collaboration') ||
      a.description?.toLowerCase().includes('team')
    ) || [];
    const collaborationScore = Math.min((collaborationActivities.length / (updateData.activities?.length || 1)) * 100, 100);

    const [updatedReport] = await db
      .update(dailyWorkReports)
      .set({
        ...updateData,
        productivityScore: Number(productivityScore.toFixed(2)),
        qualityScore: Number(qualityScore.toFixed(2)),
        efficiencyRating: Number(efficiencyRating.toFixed(2)),
        collaborationScore: Number(collaborationScore.toFixed(2)),
        updatedAt: new Date()
      })
      .where(and(
        eq(dailyWorkReports.id, reportId),
        eq(dailyWorkReports.userId, userId)
      ))
      .returning();

    if (!updatedReport) {
      return res.status(404).json({ error: 'Report not found or access denied' });
    }

    res.json(updatedReport);
  } catch (error) {
    console.error('Error updating DWAR:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Submit DWAR for approval
router.post('/submit/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(req.params.id);
    const userId = req.user!.id;

    const [updatedReport] = await db
      .update(dailyWorkReports)
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(dailyWorkReports.id, reportId),
        eq(dailyWorkReports.userId, userId),
        eq(dailyWorkReports.status, 'draft')
      ))
      .returning();

    if (!updatedReport) {
      return res.status(404).json({ error: 'Report not found or already submitted' });
    }

    // Trigger monthly KPI calculation if it's month-end
    await calculateMonthlyKPIs(userId);

    res.json({ message: 'Report submitted successfully', report: updatedReport });
  } catch (error) {
    console.error('Error submitting DWAR:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Get user's DWAR history
router.get('/my-reports', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, status, limit = 20, offset = 0 } = req.query;

    let query = db
      .select()
      .from(dailyWorkReports)
      .where(eq(dailyWorkReports.userId, userId));

    const conditions = [eq(dailyWorkReports.userId, userId)];
    if (startDate) conditions.push(gte(dailyWorkReports.reportDate, startDate as string));
    if (endDate) conditions.push(lte(dailyWorkReports.reportDate, endDate as string));
    if (status) conditions.push(eq(dailyWorkReports.status, status as string));

    const reports = await db
      .select()
      .from(dailyWorkReports)
      .where(and(...conditions))
      .orderBy(desc(dailyWorkReports.reportDate))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json(reports);
  } catch (error) {
    console.error('Error getting DWAR history:', error);
    res.status(500).json({ error: 'Failed to get report history' });
  }
});

// Admin: Get all reports for approval
router.get('/admin/pending', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!['Superuser', 'Manager', 'Senior Manager'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const reports = await db
      .select({
        id: dailyWorkReports.id,
        reportDate: dailyWorkReports.reportDate,
        tasksCompleted: dailyWorkReports.tasksCompleted,
        tasksInProgress: dailyWorkReports.tasksInProgress,
        hoursWorked: dailyWorkReports.hoursWorked,
        productivityScore: dailyWorkReports.productivityScore,
        status: dailyWorkReports.status,
        submittedAt: dailyWorkReports.submittedAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email
        }
      })
      .from(dailyWorkReports)
      .leftJoin(users, eq(dailyWorkReports.userId, users.id))
      .where(eq(dailyWorkReports.status, 'submitted'))
      .orderBy(desc(dailyWorkReports.submittedAt));

    res.json(reports);
  } catch (error) {
    console.error('Error getting pending reports:', error);
    res.status(500).json({ error: 'Failed to get pending reports' });
  }
});

// Admin: Approve/Reject DWAR
router.post('/admin/review/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!['Superuser', 'Manager', 'Senior Manager'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const reportId = parseInt(req.params.id);
    const { action, managerFeedback, managerRating } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be approve or reject' });
    }

    const [updatedReport] = await db
      .update(dailyWorkReports)
      .set({
        status: action === 'approve' ? 'approved' : 'rejected',
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        managerFeedback,
        managerRating: managerRating ? parseInt(managerRating) : undefined,
        updatedAt: new Date()
      })
      .where(and(
        eq(dailyWorkReports.id, reportId),
        eq(dailyWorkReports.status, 'submitted')
      ))
      .returning();

    if (!updatedReport) {
      return res.status(404).json({ error: 'Report not found or not in submitted status' });
    }

    // Calculate monthly KPIs after approval
    await calculateMonthlyKPIs(updatedReport.userId);

    res.json({ message: `Report ${action}d successfully`, report: updatedReport });
  } catch (error) {
    console.error('Error reviewing DWAR:', error);
    res.status(500).json({ error: 'Failed to review report' });
  }
});

// Get monthly KPI summary
router.get('/kpi/:userId/:year/:month', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    // Check if user can access this data
    if (userId !== req.user!.id && !['Superuser', 'Manager', 'Senior Manager'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let [kpiSummary] = await db
      .select()
      .from(monthlyKpiSummary)
      .where(and(
        eq(monthlyKpiSummary.userId, userId),
        eq(monthlyKpiSummary.year, year),
        eq(monthlyKpiSummary.month, month)
      ));

    if (!kpiSummary) {
      // Calculate and create KPI summary
      kpiSummary = await calculateMonthlyKPIs(userId, year, month);
    }

    res.json(kpiSummary);
  } catch (error) {
    console.error('Error getting monthly KPI:', error);
    res.status(500).json({ error: 'Failed to get KPI summary' });
  }
});

// Function to calculate monthly KPIs
async function calculateMonthlyKPIs(userId: number, targetYear?: number, targetMonth?: number) {
  const currentDate = new Date();
  const year = targetYear || currentDate.getFullYear();
  const month = targetMonth || currentDate.getMonth() + 1;

  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // Get attendance data
  const attendanceData = await db
    .select()
    .from(attendanceRecords)
    .where(and(
      eq(attendanceRecords.userId, userId),
      gte(attendanceRecords.date, startDate),
      lte(attendanceRecords.date, endDate)
    ));

  // Get DWAR data
  const dwarData = await db
    .select()
    .from(dailyWorkReports)
    .where(and(
      eq(dailyWorkReports.userId, userId),
      gte(dailyWorkReports.reportDate, startDate),
      lte(dailyWorkReports.reportDate, endDate)
    ));

  // Calculate attendance KPIs
  const totalWorkingDays = attendanceData.length;
  const daysPresent = attendanceData.filter(r => r.status === 'present').length;
  const daysAbsent = attendanceData.filter(r => r.status === 'absent').length;
  const daysLate = attendanceData.filter(r => r.status === 'late').length;
  const totalHoursWorked = attendanceData.reduce((sum, r) => sum + parseFloat(r.workingHours?.toString() || '0'), 0);
  const overtimeHours = attendanceData.reduce((sum, r) => sum + parseFloat(r.overtimeHours?.toString() || '0'), 0);
  const attendancePercentage = totalWorkingDays > 0 ? (daysPresent / totalWorkingDays) * 100 : 0;

  // Calculate DWAR KPIs
  const totalTasksCompleted = dwarData.reduce((sum, r) => sum + (r.tasksCompleted || 0), 0);
  const approvedReports = dwarData.filter(r => r.status === 'approved');
  const rejectedReports = dwarData.filter(r => r.status === 'rejected');
  
  const avgProductivityScore = approvedReports.length > 0 ? 
    approvedReports.reduce((sum, r) => sum + parseFloat(r.productivityScore?.toString() || '0'), 0) / approvedReports.length : 0;
  
  const avgQualityScore = approvedReports.length > 0 ? 
    approvedReports.reduce((sum, r) => sum + parseFloat(r.qualityScore?.toString() || '0'), 0) / approvedReports.length : 0;
  
  const avgEfficiencyRating = approvedReports.length > 0 ? 
    approvedReports.reduce((sum, r) => sum + parseFloat(r.efficiencyRating?.toString() || '0'), 0) / approvedReports.length : 0;
  
  const avgCollaborationScore = approvedReports.length > 0 ? 
    approvedReports.reduce((sum, r) => sum + parseFloat(r.collaborationScore?.toString() || '0'), 0) / approvedReports.length : 0;
  
  const avgManagerRating = approvedReports.filter(r => r.managerRating).length > 0 ?
    approvedReports.filter(r => r.managerRating).reduce((sum, r) => sum + (r.managerRating || 0), 0) / approvedReports.filter(r => r.managerRating).length : 0;

  const dwarSubmissionRate = totalWorkingDays > 0 ? (dwarData.length / totalWorkingDays) * 100 : 0;

  // Calculate overall performance score
  const overallPerformanceScore = (
    attendancePercentage * 0.3 + 
    avgProductivityScore * 0.25 + 
    avgQualityScore * 0.25 + 
    avgEfficiencyRating * 0.1 + 
    avgCollaborationScore * 0.1
  );

  // Determine performance grade
  let performanceGrade = 'D';
  if (overallPerformanceScore >= 95) performanceGrade = 'A+';
  else if (overallPerformanceScore >= 90) performanceGrade = 'A';
  else if (overallPerformanceScore >= 85) performanceGrade = 'B+';
  else if (overallPerformanceScore >= 80) performanceGrade = 'B';
  else if (overallPerformanceScore >= 75) performanceGrade = 'C+';
  else if (overallPerformanceScore >= 70) performanceGrade = 'C';

  // Upsert KPI summary
  const kpiData = {
    userId,
    month,
    year,
    totalWorkingDays,
    daysPresent,
    daysAbsent,
    daysLate,
    totalHoursWorked: Number(totalHoursWorked.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    attendancePercentage: Number(attendancePercentage.toFixed(2)),
    totalTasksCompleted,
    averageProductivityScore: Number(avgProductivityScore.toFixed(2)),
    averageQualityScore: Number(avgQualityScore.toFixed(2)),
    averageEfficiencyRating: Number(avgEfficiencyRating.toFixed(2)),
    averageCollaborationScore: Number(avgCollaborationScore.toFixed(2)),
    dwarSubmissionRate: Number(dwarSubmissionRate.toFixed(2)),
    averageManagerRating: Number(avgManagerRating.toFixed(2)),
    totalApprovedReports: approvedReports.length,
    totalRejectedReports: rejectedReports.length,
    overallPerformanceScore: Number(overallPerformanceScore.toFixed(2)),
    performanceGrade,
    lastUpdated: new Date()
  };

  try {
    // Try to update existing record
    const [updatedKpi] = await db
      .update(monthlyKpiSummary)
      .set(kpiData)
      .where(and(
        eq(monthlyKpiSummary.userId, userId),
        eq(monthlyKpiSummary.year, year),
        eq(monthlyKpiSummary.month, month)
      ))
      .returning();

    if (updatedKpi) {
      return updatedKpi;
    }
  } catch (error) {
    // If update fails, insert new record
  }

  const [newKpi] = await db
    .insert(monthlyKpiSummary)
    .values(kpiData)
    .returning();

  return newKpi;
}

export default router;