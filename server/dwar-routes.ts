import { Router, Request, Response } from 'express';
import { db } from './db';
import { dailyWorkReports, monthlyKpiSummary, attendanceRecords, users, tasks, recurringTasks } from '@shared/schema';
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

// Get today's completed tasks for DWAR integration
router.get('/todays-completed-tasks', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0];
    
    const completedRegular = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        priority: tasks.priority,
        status: tasks.status,
        completedAt: tasks.completedAt
      })
      .from(tasks)
      .where(and(
        eq(tasks.assignedTo, userId),
        eq(tasks.status, 'completed'),
        gte(tasks.completedAt, today + 'T00:00:00.000Z'),
        lte(tasks.completedAt, today + 'T23:59:59.999Z')
      ))
      .orderBy(desc(tasks.completedAt));

    const completedRecurring = await db
      .select({
        id: recurringTasks.id,
        title: recurringTasks.title,
        description: recurringTasks.description,
        priority: recurringTasks.priority,
        status: recurringTasks.status,
        completedAt: recurringTasks.completedAt
      })
      .from(recurringTasks)
      .where(and(
        eq(recurringTasks.assignedTo, userId),
        eq(recurringTasks.status, 'completed'),
        gte(recurringTasks.completedAt, today + 'T00:00:00.000Z'),
        lte(recurringTasks.completedAt, today + 'T23:59:59.999Z')
      ))
      .orderBy(desc(recurringTasks.completedAt));

    const allCompleted = [
      ...completedRegular,
      ...completedRecurring.map(rt => ({ ...rt, id: rt.id + 1000000 })),
    ].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

    res.json(allCompleted);
  } catch (error) {
    console.error('Error fetching today\'s completed tasks:', error);
    res.json([]);
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

    const updatedActivities = [...(Array.isArray(todayReport.activities) ? todayReport.activities : []), newActivity];
    const totalHours = updatedActivities.reduce((sum, a) => sum + (a.timeSpent || 0), 0);
    const completedTasks = updatedActivities.filter(a => a.status === 'completed').length;
    const inProgressTasks = updatedActivities.filter(a => a.status === 'in_progress').length;

    const priorityWeight = (p: string) => p === 'high' ? 3 : p === 'medium' ? 2 : 1;
    let productivityScore = 0;
    if (updatedActivities.length > 0) {
      const weightedCompleted = updatedActivities
        .filter(a => a.status === 'completed')
        .reduce((sum, a) => sum + priorityWeight(a.priority || 'medium'), 0);
      const weightedTotal = updatedActivities
        .reduce((sum, a) => sum + priorityWeight(a.priority || 'medium'), 0);
      productivityScore = weightedTotal > 0 ? Math.min((weightedCompleted / weightedTotal) * 100, 100) : 0;
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

function calculatePlanFollowThrough(
  yesterdayPlans: string | null | undefined,
  yesterdayPriorityTasks: any[] | null | undefined,
  todayActivities: any[] | null | undefined
): { score: number; details: any } {
  const result = {
    score: 0,
    details: {
      yesterdayPlannedItems: [] as { text: string; matched: boolean; matchedActivity?: string }[],
      todayUnplannedItems: [] as string[],
      matchRate: 0,
      plannedCount: 0,
      matchedCount: 0,
      hasYesterdayPlans: false
    }
  };

  const plannedItems: string[] = [];

  if (yesterdayPriorityTasks && Array.isArray(yesterdayPriorityTasks) && yesterdayPriorityTasks.length > 0) {
    for (const pt of yesterdayPriorityTasks) {
      if (pt.task && pt.task.trim()) {
        plannedItems.push(pt.task.trim());
      }
    }
  }

  if (yesterdayPlans && yesterdayPlans.trim()) {
    const lines = yesterdayPlans.split(/[\n,;•\-]+/).map(l => l.trim()).filter(l => l.length > 3);
    for (const line of lines) {
      if (!plannedItems.some(p => p.toLowerCase() === line.toLowerCase())) {
        plannedItems.push(line);
      }
    }
  }

  if (plannedItems.length === 0) {
    return { score: 0, details: { ...result.details, hasYesterdayPlans: false } };
  }

  result.details.hasYesterdayPlans = true;
  result.details.plannedCount = plannedItems.length;

  const activities = (todayActivities && Array.isArray(todayActivities)) ? todayActivities : [];
  const activityDescriptions = activities.map((a: any) => (a.description || '').toLowerCase());

  function extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because', 'as', 'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'work', 'complete', 'finish', 'start', 'continue', 'need', 'plan', 'today', 'tomorrow']);
    return text.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  }

  let matchedCount = 0;
  for (const planned of plannedItems) {
    const plannedKeywords = extractKeywords(planned);
    let bestMatch = '';
    let bestMatchScore = 0;

    for (let i = 0; i < activityDescriptions.length; i++) {
      const activityKeywords = extractKeywords(activityDescriptions[i]);
      if (plannedKeywords.length === 0 || activityKeywords.length === 0) continue;

      let matchingWords = 0;
      for (const pk of plannedKeywords) {
        if (activityKeywords.some(ak => ak.includes(pk) || pk.includes(ak))) {
          matchingWords++;
        }
      }

      const matchScore = matchingWords / plannedKeywords.length;
      if (matchScore > bestMatchScore) {
        bestMatchScore = matchScore;
        bestMatch = activities[i]?.description || '';
      }
    }

    const isMatched = bestMatchScore >= 0.4;
    if (isMatched) matchedCount++;

    result.details.yesterdayPlannedItems.push({
      text: planned,
      matched: isMatched,
      matchedActivity: isMatched ? bestMatch : undefined
    });
  }

  const matchedActivities = new Set(
    result.details.yesterdayPlannedItems
      .filter(p => p.matched && p.matchedActivity)
      .map(p => p.matchedActivity!.toLowerCase())
  );

  for (const act of activities) {
    const desc = (act.description || '').toLowerCase();
    if (!matchedActivities.has(desc) && desc.length > 3) {
      result.details.todayUnplannedItems.push(act.description);
    }
  }

  result.details.matchedCount = matchedCount;
  result.details.matchRate = plannedItems.length > 0 ? Math.round((matchedCount / plannedItems.length) * 100) : 0;
  result.score = Math.min(result.details.matchRate, 100);

  return result;
}

router.get('/plan-follow-through', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 1);
    if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const [yesterdayReport] = await db
      .select()
      .from(dailyWorkReports)
      .where(and(
        eq(dailyWorkReports.userId, userId),
        eq(dailyWorkReports.reportDate, yesterdayStr)
      ));

    const [todayReport] = await db
      .select()
      .from(dailyWorkReports)
      .where(and(
        eq(dailyWorkReports.userId, userId),
        eq(dailyWorkReports.reportDate, todayStr)
      ));

    if (!yesterdayReport) {
      return res.json({
        score: 0,
        details: {
          hasYesterdayPlans: false,
          message: 'No DWAR found for previous working day',
          yesterdayDate: yesterdayStr
        }
      });
    }

    const todayActivities = todayReport ? (Array.isArray(todayReport.activities) ? todayReport.activities : []) : [];
    const result = calculatePlanFollowThrough(
      yesterdayReport.tomorrowPlans,
      yesterdayReport.priorityTasks as any[],
      todayActivities
    );

    if (todayReport && result.details.hasYesterdayPlans) {
      await db.update(dailyWorkReports)
        .set({
          planFollowThroughScore: result.score.toString(),
          planFollowThroughDetails: result.details,
          updatedAt: new Date()
        })
        .where(eq(dailyWorkReports.id, todayReport.id));
    }

    res.json({
      ...result,
      yesterdayDate: yesterdayStr,
      todayDate: todayStr
    });
  } catch (error) {
    console.error('Error calculating plan follow-through:', error);
    res.status(500).json({ error: 'Failed to calculate plan follow-through' });
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

    const priorityWeight = (p: string) => p === 'high' ? 3 : p === 'medium' ? 2 : 1;

    let productivityScore = 0;
    if (updateData.activities && updateData.activities.length > 0) {
      const weightedCompleted = updateData.activities
        .filter((a: any) => a.status === 'completed')
        .reduce((sum: number, a: any) => sum + priorityWeight(a.priority || 'medium'), 0);
      const weightedTotal = updateData.activities
        .reduce((sum: number, a: any) => sum + priorityWeight(a.priority || 'medium'), 0);
      productivityScore = weightedTotal > 0 ? Math.min((weightedCompleted / weightedTotal) * 100, 100) : 0;
    }

    let qualityScore = 0;
    if (updateData.managerRating) {
      qualityScore = (updateData.managerRating / 5) * 100;
    }

    let efficiencyRating = 0;
    if (updateData.activities && updateData.activities.length > 0 && updateData.hoursWorked > 0) {
      const weightedCompleted = updateData.activities
        .filter((a: any) => a.status === 'completed')
        .reduce((sum: number, a: any) => sum + priorityWeight(a.priority || 'medium'), 0);
      efficiencyRating = Math.min((weightedCompleted / updateData.hoursWorked) * 10, 100);
    }

    let collaborationScore = 0;
    if (updateData.activities && updateData.activities.length > 0) {
      let weightedCollabCount = 0;
      for (const a of updateData.activities) {
        if (a.collaborative === true) {
          weightedCollabCount += 1.0;
        } else if (a.collaborative === undefined || a.collaborative === null) {
          const desc = (a.description || '').toLowerCase();
          if (desc.includes('meeting') || desc.includes('collaboration') || desc.includes('team')) {
            weightedCollabCount += 0.5;
          }
        }
      }
      collaborationScore = Math.min((weightedCollabCount / updateData.activities.length) * 100, 100);
    }

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

    // Auto-checkout functionality
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Find today's attendance record
    const [attendanceRecord] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        eq(attendanceRecords.date, today)
      ));

    let checkoutResult = null;
    
    // Only proceed with checkout if user has checked in but not checked out
    if (attendanceRecord && attendanceRecord.checkInTime && !attendanceRecord.checkOutTime) {
      try {
        // Calculate working hours
        const checkInTime = new Date(attendanceRecord.checkInTime);
        const workingHours = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        // Update attendance record with checkout
        const [updatedAttendance] = await db
          .update(attendanceRecords)
          .set({
            checkOutTime: now,
            workingHours: workingHours.toFixed(2),
            employeeNotes: 'Auto-checkout via DWAR submission',
            updatedAt: now
          })
          .where(eq(attendanceRecords.id, attendanceRecord.id))
          .returning();

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

        checkoutResult = {
          success: true,
          workingHours: Number(workingHours.toFixed(2)),
          checkOutTime: now,
          gratitudeMessage
        };

        console.log(`Auto-checkout completed for user ${userId} after DWAR submission`);
      } catch (checkoutError) {
        console.error('Error during auto-checkout:', checkoutError);
        // Don't fail the DWAR submission if checkout fails
        checkoutResult = {
          success: false,
          error: 'Auto-checkout failed, please checkout manually'
        };
      }
    }

    // Trigger monthly KPI calculation if it's month-end
    await calculateMonthlyKPIs(userId);

    res.json({ 
      message: 'Report submitted successfully', 
      report: updatedReport,
      autoCheckout: checkoutResult
    });
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

  const reportsWithFollowThrough = approvedReports.filter(r => parseFloat(r.planFollowThroughScore?.toString() || '0') > 0);
  const avgPlanFollowThrough = reportsWithFollowThrough.length > 0 ?
    reportsWithFollowThrough.reduce((sum, r) => sum + parseFloat(r.planFollowThroughScore?.toString() || '0'), 0) / reportsWithFollowThrough.length : 0;

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