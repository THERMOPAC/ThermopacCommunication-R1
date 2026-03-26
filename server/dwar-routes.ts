import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
import { Router, Request, Response } from 'express';
import { db } from './db';
import { dailyWorkReports, monthlyKpiSummary, attendanceRecords, users, tasks, recurringTasks, recurringPatterns, notifications } from '@shared/schema';
import { eq, and, gte, lte, desc, sql, avg, sum, count } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

router.get('/available-tasks', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const regularTasks = await db
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
      .limit(50);

    const recurring = await db
      .select({
        id: recurringTasks.id,
        title: recurringTasks.title,
        description: recurringTasks.description,
        priority: recurringTasks.priority,
        status: recurringTasks.status,
        startDate: recurringTasks.startDate,
        finishDate: recurringTasks.finishDate,
        dueDate: recurringTasks.dueDate,
        plannedHours: recurringTasks.plannedHours,
        templatePlannedHours: recurringPatterns.templatePlannedHours
      })
      .from(recurringTasks)
      .leftJoin(recurringPatterns, eq(recurringTasks.recurringPatternId, recurringPatterns.id))
      .where(and(
        eq(recurringTasks.assignedTo, userId),
        eq(recurringTasks.status, 'pending')
      ))
      .orderBy(desc(recurringTasks.dueDate))
      .limit(50);

    const recurringWithPrefix = recurring.map(rt => ({
      ...rt,
      id: rt.id + 1000000,
      title: `[Recurring] ${rt.title}`,
      source: 'recurring' as const,
      plannedHours: (rt.plannedHours && rt.plannedHours > 0) ? rt.plannedHours : (rt.templatePlannedHours || 0)
    }));

    res.json([...regularTasks, ...recurringWithPrefix]);
  } catch (error) {
    console.error('Error fetching available tasks:', error);
    res.json([]);
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

    const scores = calculateAllScores(updatedActivities, null, null);

    const [updatedReport] = await db
      .update(dailyWorkReports)
      .set({
        activities: updatedActivities,
        hoursWorked: totalHours,
        tasksCompleted: completedTasks,
        tasksInProgress: inProgressTasks,
        productivityScore: scores.productivity !== null ? Number(scores.productivity.toFixed(2)) : null,
        qualityScore: scores.quality !== null ? Number(scores.quality.toFixed(2)) : null,
        efficiencyRating: scores.efficiency !== null ? Number(scores.efficiency.toFixed(2)) : null,
        collaborationScore: scores.collaboration !== null ? Number(scores.collaboration.toFixed(2)) : null,
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
    sendError(res, error);
  }
});

// === SHARED SCORING HELPERS ===

const priorityWeight = (p: string) => p === 'high' ? 3 : p === 'medium' ? 2 : 1;

function calculateProductivityScore(activities: any[]): number | null {
  if (!activities || activities.length === 0) return null;
  const weightedCompleted = activities
    .filter(a => a.status === 'completed')
    .reduce((sum: number, a: any) => sum + priorityWeight(a.priority || 'medium'), 0);
  const weightedTotal = activities
    .reduce((sum: number, a: any) => sum + priorityWeight(a.priority || 'medium'), 0);
  return weightedTotal > 0 ? Math.min((weightedCompleted / weightedTotal) * 100, 100) : 0;
}

function calculateEfficiencyScore(activities: any[]): number | null {
  if (!activities || activities.length === 0) return null;
  const validCompleted = activities.filter(
    (a: any) => a.status === 'completed' && (a.plannedHours || 0) > 0 && (a.timeSpent || 0) > 0
  );
  if (validCompleted.length === 0) return null;
  const sumPlanned = validCompleted.reduce((sum: number, a: any) => sum + a.plannedHours, 0);
  const sumActual = validCompleted.reduce((sum: number, a: any) => sum + a.timeSpent, 0);
  return Math.min((sumPlanned / sumActual) * 100, 100);
}

function calculateCollaborationScore(activities: any[]): number | null {
  if (!activities || activities.length === 0) return null;
  let weightedCollabCount = 0;
  for (const a of activities) {
    if (a.collaborative === true) {
      weightedCollabCount += 1.0;
    } else if (a.collaborative === undefined || a.collaborative === null) {
      const desc = (a.description || '').toLowerCase();
      if (desc.includes('meeting') || desc.includes('collaboration') || desc.includes('team')) {
        weightedCollabCount += 0.5;
      }
    }
  }
  return Math.min((weightedCollabCount / activities.length) * 100, 100);
}

function calculateLogQuality(activities: any[]): number {
  if (!activities || activities.length === 0) return 0;
  const total = activities.length;
  const goodDescriptions = activities.filter((a: any) => (a.description || '').length > 10).length;
  const hasTime = activities.filter((a: any) => (a.timeSpent || 0) > 0).length;
  const validPriority = activities.filter((a: any) => ['high', 'medium', 'low'].includes(a.priority)).length;
  return (goodDescriptions / total) * 33.3 + (hasTime / total) * 33.3 + (validPriority / total) * 33.3;
}

function calculateQualityScore(
  productivityScore: number | null,
  followThroughScore: number | null,
  logQuality: number,
  managerRating?: number | null
): number | null {
  if (managerRating) return (managerRating / 5) * 100;
  if (productivityScore === null) return null;
  const completionAccuracy = productivityScore;
  if (followThroughScore !== null && followThroughScore !== undefined) {
    return Math.min(
      Math.round(((completionAccuracy * 0.4) + (followThroughScore * 0.4) + (logQuality * 0.2)) * 100) / 100,
      100
    );
  }
  return Math.min(
    Math.round(((completionAccuracy * 0.5) + (logQuality * 0.5)) * 100) / 100,
    100
  );
}

function calculateAllScores(activities: any[], followThroughScore: number | null, managerRating?: number | null) {
  const productivity = calculateProductivityScore(activities);
  const efficiency = calculateEfficiencyScore(activities);
  const collaboration = calculateCollaborationScore(activities);
  const logQuality = calculateLogQuality(activities);
  const quality = calculateQualityScore(productivity, followThroughScore, logQuality, managerRating);
  return { productivity, efficiency, collaboration, quality };
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because', 'as', 'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'work', 'complete', 'finish', 'start', 'continue', 'need', 'plan', 'today', 'tomorrow']);
  return text.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
}

function getPreviousWorkingDay(fromDate: Date): Date {
  const yesterday = new Date(fromDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
}

async function calculatePlanFollowThrough(
  yesterdayPriorityTasks: any[] | null | undefined,
  todayActivities: any[] | null | undefined,
  todayDateStr: string
): Promise<{ score: number | null; details: any }> {
  const result = {
    score: null as number | null,
    details: {
      yesterdayPlannedItems: [] as { text: string; taskId?: number; matched: boolean; matchedActivity?: string; matchMethod?: string }[],
      todayUnplannedItems: [] as string[],
      matchRate: 0,
      plannedCount: 0,
      matchedCount: 0,
      hasYesterdayPlans: false
    }
  };

  if (!yesterdayPriorityTasks || !Array.isArray(yesterdayPriorityTasks) || yesterdayPriorityTasks.length === 0) {
    return { score: null, details: { ...result.details, hasYesterdayPlans: false } };
  }

  const plannedItems: { text: string; taskId?: number }[] = [];
  for (const pt of yesterdayPriorityTasks) {
    if (pt.task && pt.task.trim()) {
      plannedItems.push({ text: pt.task.trim(), taskId: pt.taskId || undefined });
    }
  }

  if (plannedItems.length === 0) {
    return { score: null, details: { ...result.details, hasYesterdayPlans: false } };
  }

  result.details.hasYesterdayPlans = true;
  result.details.plannedCount = plannedItems.length;

  const activities = (todayActivities && Array.isArray(todayActivities)) ? todayActivities : [];
  const activityDescriptions = activities.map((a: any) => (a.description || '').toLowerCase());

  let matchedCount = 0;
  for (const planned of plannedItems) {
    let isMatched = false;
    let matchedActivity = '';
    let matchMethod = '';

    if (planned.taskId) {
      const [linkedTask] = await db
        .select({ status: tasks.status, completedAt: tasks.completedAt })
        .from(tasks)
        .where(eq(tasks.id, planned.taskId));
      
      if (linkedTask && linkedTask.status === 'completed' && linkedTask.completedAt) {
        const completedDate = new Date(linkedTask.completedAt).toISOString().split('T')[0];
        if (completedDate === todayDateStr) {
          isMatched = true;
          matchedActivity = `Task #${planned.taskId} completed`;
          matchMethod = 'task_completion';
        }
      }
    } else {
      const plannedKeywords = extractKeywords(planned.text);
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

      if (bestMatchScore >= 0.4) {
        isMatched = true;
        matchedActivity = bestMatch;
        matchMethod = 'keyword_match';
      }
    }

    if (isMatched) matchedCount++;

    result.details.yesterdayPlannedItems.push({
      text: planned.text,
      taskId: planned.taskId,
      matched: isMatched,
      matchedActivity: isMatched ? matchedActivity : undefined,
      matchMethod: isMatched ? matchMethod : undefined
    });
  }

  const matchedActivitiesSet = new Set(
    result.details.yesterdayPlannedItems
      .filter(p => p.matched && p.matchedActivity)
      .map(p => p.matchedActivity!.toLowerCase())
  );

  for (const act of activities) {
    const desc = (act.description || '').toLowerCase();
    if (!matchedActivitiesSet.has(desc) && desc.length > 3) {
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
    const yesterday = getPreviousWorkingDay(today);

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
        score: null,
        details: {
          hasYesterdayPlans: false,
          message: 'No DWAR found for previous working day',
          yesterdayDate: yesterdayStr
        }
      });
    }

    const todayActivities = todayReport ? (Array.isArray(todayReport.activities) ? todayReport.activities : []) : [];
    const result = await calculatePlanFollowThrough(
      yesterdayReport.priorityTasks as any[],
      todayActivities,
      todayStr
    );

    if (todayReport && result.details.hasYesterdayPlans) {
      await db.update(dailyWorkReports)
        .set({
          planFollowThroughScore: result.score !== null ? result.score.toString() : null,
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
    sendError(res, error);
  }
});

// Get yesterday's DWAR for carry-forward, quick duplicate, and sidebar
router.get('/yesterday', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date();
    const yesterday = getPreviousWorkingDay(today);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const [yesterdayReport] = await db
      .select()
      .from(dailyWorkReports)
      .where(and(
        eq(dailyWorkReports.userId, userId),
        eq(dailyWorkReports.reportDate, yesterdayStr)
      ));

    if (!yesterdayReport) {
      return res.json({ report: null, date: yesterdayStr });
    }

    res.json({ report: yesterdayReport, date: yesterdayStr });
  } catch (error) {
    console.error('Error getting yesterday\'s DWAR:', error);
    res.status(500).json({ error: 'Failed to get yesterday\'s report' });
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

    const [existingReport] = await db
      .select({ 
        planFollowThroughScore: dailyWorkReports.planFollowThroughScore,
        tomorrowPlans: dailyWorkReports.tomorrowPlans
      })
      .from(dailyWorkReports)
      .where(eq(dailyWorkReports.id, reportId));

    const ftScore = existingReport?.planFollowThroughScore;
    const followThroughScore = (ftScore !== null && ftScore !== undefined && Number(ftScore) > 0) ? Number(ftScore) : null;

    const scores = calculateAllScores(
      updateData.activities || [],
      followThroughScore,
      updateData.managerRating
    );

    const [updatedReport] = await db
      .update(dailyWorkReports)
      .set({
        ...updateData,
        productivityScore: scores.productivity !== null ? Number(scores.productivity.toFixed(2)) : null,
        qualityScore: scores.quality !== null ? Number(scores.quality.toFixed(2)) : null,
        efficiencyRating: scores.efficiency !== null ? Number(scores.efficiency.toFixed(2)) : null,
        collaborationScore: scores.collaboration !== null ? Number(scores.collaboration.toFixed(2)) : null,
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
    sendError(res, error);
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

    // System Monitoring Hooks (async, non-blocking)
    try {
      const warnings: string[] = [];
      const activities: any[] = updatedReport.activities as any[] || [];
      const totalHours = activities.reduce((sum: number, a: any) => sum + (a.timeSpent || 0), 0);

      // 1. Low hours warning
      if (totalHours < 4 && activities.length > 0) {
        warnings.push(`Low hours recorded (${totalHours}h). Please ensure all work time is accounted for.`);
      }

      // 2. Missing activity entries
      if (activities.length === 0) {
        warnings.push('No activities logged. Please add activities before submitting.');
      }

      // 3. Repeated carry-forward detection
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentReports = await db
        .select()
        .from(dailyWorkReports)
        .where(and(
          eq(dailyWorkReports.userId, userId),
          gte(dailyWorkReports.reportDate, weekAgo.toISOString().split('T')[0]),
          lte(dailyWorkReports.reportDate, new Date().toISOString().split('T')[0])
        ));

      const todayDescriptions = activities.map((a: any) => (a.description || '').toLowerCase().trim()).filter(Boolean);
      let carryForwardCount = 0;
      for (const report of recentReports) {
        if (report.id === updatedReport.id) continue;
        const rActivities: any[] = report.activities as any[] || [];
        for (const ra of rActivities) {
          const desc = (ra.description || '').toLowerCase().trim();
          if (desc && todayDescriptions.includes(desc)) {
            carryForwardCount++;
          }
        }
      }
      if (carryForwardCount >= 3) {
        warnings.push(`${carryForwardCount} activities appear repeatedly across the last 7 days. Consider breaking them into smaller tasks or escalating blockers.`);
      }

      // Create notifications for warnings
      for (const warning of warnings) {
        await db.insert(notifications).values({
          userId,
          type: 'dwar_monitoring',
          title: 'DWAR Monitoring Alert',
          message: warning,
          priority: 'low',
          category: 'dwar',
          status: 'new',
          sourceType: 'dwar',
          sourceId: updatedReport.id,
          createdBy: userId
        });
      }
    } catch (monitoringError) {
      console.error('DWAR monitoring hooks error (non-blocking):', monitoringError);
    }

    // Trigger monthly KPI calculation
    await calculateMonthlyKPIs(userId);

    res.json({ 
      message: 'Report submitted successfully', 
      report: updatedReport,
      autoCheckout: checkoutResult
    });
  } catch (error) {
    console.error('Error submitting DWAR:', error);
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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

    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1);

    let kpiSummary;
    if (isCurrentMonth) {
      kpiSummary = await calculateMonthlyKPIs(userId, year, month);
    } else {
      [kpiSummary] = await db
        .select()
        .from(monthlyKpiSummary)
        .where(and(
          eq(monthlyKpiSummary.userId, userId),
          eq(monthlyKpiSummary.year, year),
          eq(monthlyKpiSummary.month, month)
        ));
      if (!kpiSummary) {
        kpiSummary = await calculateMonthlyKPIs(userId, year, month);
      }
    }

    res.json(kpiSummary);
  } catch (error) {
    console.error('Error getting monthly KPI:', error);
    sendError(res, error);
  }
});

// Recalculate monthly KPIs for all users (admin only)
router.post('/kpi/recalculate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'Superuser') {
      return res.status(403).json({ error: 'Only superusers can trigger batch recalculation' });
    }

    const { year, month } = req.body;
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || (new Date().getMonth() + 1);

    const allUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.isActive, true));

    const results: { userId: number; username: string; score: number }[] = [];
    for (const u of allUsers) {
      try {
        const kpi = await calculateMonthlyKPIs(u.id, targetYear, targetMonth);
        results.push({ userId: u.id, username: u.username, score: kpi?.overallPerformanceScore || 0 });
      } catch (err) {
        console.error(`KPI recalc failed for user ${u.id}:`, err);
      }
    }

    res.json({ message: `Recalculated KPIs for ${results.length} users`, year: targetYear, month: targetMonth, results });
  } catch (error) {
    console.error('Error recalculating KPIs:', error);
    sendError(res, error);
  }
});

// Null-aware average: averages only non-null values from submitted reports
function nullAwareAvg(reports: any[], field: string): number | null {
  const values = reports
    .map(r => {
      const v = r[field];
      return v !== null && v !== undefined ? parseFloat(v.toString()) : null;
    })
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function calculateMonthlyKPIs(userId: number, targetYear?: number, targetMonth?: number) {
  const currentDate = new Date();
  const year = targetYear || currentDate.getFullYear();
  const month = targetMonth || currentDate.getMonth() + 1;

  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const attendanceData = await db
    .select()
    .from(attendanceRecords)
    .where(and(
      eq(attendanceRecords.userId, userId),
      gte(attendanceRecords.date, startDate),
      lte(attendanceRecords.date, endDate)
    ));

  const dwarData = await db
    .select()
    .from(dailyWorkReports)
    .where(and(
      eq(dailyWorkReports.userId, userId),
      gte(dailyWorkReports.reportDate, startDate),
      lte(dailyWorkReports.reportDate, endDate)
    ));

  const totalWorkingDays = attendanceData.length;
  const daysPresent = attendanceData.filter(r => r.status === 'present').length;
  const daysAbsent = attendanceData.filter(r => r.status === 'absent').length;
  const daysLate = attendanceData.filter(r => r.status === 'late').length;
  const totalHoursWorked = attendanceData.reduce((sum, r) => sum + parseFloat(r.workingHours?.toString() || '0'), 0);
  const overtimeHours = attendanceData.reduce((sum, r) => sum + parseFloat(r.overtimeHours?.toString() || '0'), 0);
  const attendancePercentage = totalWorkingDays > 0 ? (daysPresent / totalWorkingDays) * 100 : 0;

  const totalTasksCompleted = dwarData.reduce((sum, r) => sum + (r.tasksCompleted || 0), 0);
  const submittedReports = dwarData.filter(r => r.status === 'submitted' || r.status === 'approved');
  const rejectedReports = dwarData.filter(r => r.status === 'rejected');

  const avgProductivity = nullAwareAvg(submittedReports, 'productivityScore');
  const avgQuality = nullAwareAvg(submittedReports, 'qualityScore');
  const avgEfficiency = nullAwareAvg(submittedReports, 'efficiencyRating');
  const avgCollaboration = nullAwareAvg(submittedReports, 'collaborationScore');

  const avgManagerRating = nullAwareAvg(
    submittedReports.filter(r => r.managerRating),
    'managerRating'
  );

  const dwarSubmissionRate = totalWorkingDays > 0 ? (dwarData.filter(r => r.status !== 'draft').length / totalWorkingDays) * 100 : 0;

  const weights: { value: number | null; weight: number }[] = [
    { value: attendancePercentage, weight: 0.3 },
    { value: avgProductivity, weight: 0.25 },
    { value: avgQuality, weight: 0.25 },
    { value: avgEfficiency, weight: 0.1 },
    { value: avgCollaboration, weight: 0.1 },
  ];

  const validWeights = weights.filter(w => w.value !== null);
  const totalWeight = validWeights.reduce((sum, w) => sum + w.weight, 0);
  const overallPerformanceScore = totalWeight > 0
    ? validWeights.reduce((sum, w) => sum + (w.value! * (w.weight / totalWeight)), 0)
    : 0;

  let performanceGrade = 'D';
  if (overallPerformanceScore >= 95) performanceGrade = 'A+';
  else if (overallPerformanceScore >= 90) performanceGrade = 'A';
  else if (overallPerformanceScore >= 85) performanceGrade = 'B+';
  else if (overallPerformanceScore >= 80) performanceGrade = 'B';
  else if (overallPerformanceScore >= 75) performanceGrade = 'C+';
  else if (overallPerformanceScore >= 70) performanceGrade = 'C';

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
    averageProductivityScore: avgProductivity !== null ? Number(avgProductivity.toFixed(2)) : 0,
    averageQualityScore: avgQuality !== null ? Number(avgQuality.toFixed(2)) : 0,
    averageEfficiencyRating: avgEfficiency !== null ? Number(avgEfficiency.toFixed(2)) : 0,
    averageCollaborationScore: avgCollaboration !== null ? Number(avgCollaboration.toFixed(2)) : 0,
    dwarSubmissionRate: Number(dwarSubmissionRate.toFixed(2)),
    averageManagerRating: avgManagerRating !== null ? Number(avgManagerRating.toFixed(2)) : 0,
    totalApprovedReports: submittedReports.length,
    totalRejectedReports: rejectedReports.length,
    overallPerformanceScore: Number(overallPerformanceScore.toFixed(2)),
    performanceGrade,
    lastUpdated: new Date()
  };

  try {
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