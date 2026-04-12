import { Router } from 'express';
import { db } from './db';
import { agentUsageLimits, agentUsageDailyLog } from '@shared/schema';
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm';

const router = Router();

function ensureAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

function ensureSuperuser(req: any, res: any, next: any) {
  if (req.user?.role === 'Superuser') return next();
  res.status(403).json({ error: 'Superuser access required' });
}

router.get('/limits', ensureAuthenticated, async (_req, res) => {
  try {
    const [limits] = await db.select().from(agentUsageLimits).limit(1);
    if (!limits) {
      const [newLimits] = await db.insert(agentUsageLimits).values({
        monthlyLimitUnits: '500',
        dailyLimitUnits: '50',
        softBlockEnabled: true,
      }).returning();
      return res.json(newLimits);
    }
    res.json(limits);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/limits', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    const { monthlyLimitUnits, dailyLimitUnits, softBlockEnabled } = req.body;
    const [existing] = await db.select().from(agentUsageLimits).limit(1);

    if (existing) {
      const [updated] = await db.update(agentUsageLimits)
        .set({
          monthlyLimitUnits: String(monthlyLimitUnits),
          dailyLimitUnits: String(dailyLimitUnits),
          softBlockEnabled,
          updatedBy: (req as any).user?.id,
          updatedAt: new Date(),
        })
        .where(eq(agentUsageLimits.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db.insert(agentUsageLimits).values({
      monthlyLimitUnits: String(monthlyLimitUnits),
      dailyLimitUnits: String(dailyLimitUnits),
      softBlockEnabled,
      updatedBy: (req as any).user?.id,
    }).returning();
    res.json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/daily-log', ensureAuthenticated, async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const logs = await db.select()
      .from(agentUsageDailyLog)
      .where(gte(agentUsageDailyLog.logDate, startDate))
      .orderBy(desc(agentUsageDailyLog.logDate));

    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/daily-log', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    const { logDate, estimatedUnits, estimatedCost, notes } = req.body;
    const dateObj = new Date(logDate);
    const startOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const existing = await db.select()
      .from(agentUsageDailyLog)
      .where(and(
        gte(agentUsageDailyLog.logDate, startOfDay),
        lte(agentUsageDailyLog.logDate, endOfDay)
      ));

    if (existing.length > 0) {
      const [updated] = await db.update(agentUsageDailyLog)
        .set({
          estimatedUnits: String(estimatedUnits),
          estimatedCost: String(estimatedCost),
          notes,
          loggedBy: (req as any).user?.id,
        })
        .where(eq(agentUsageDailyLog.id, existing[0].id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db.insert(agentUsageDailyLog).values({
      logDate: startOfDay,
      estimatedUnits: String(estimatedUnits),
      estimatedCost: String(estimatedCost),
      notes,
      loggedBy: (req as any).user?.id,
    }).returning();
    res.json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary', ensureAuthenticated, async (_req, res) => {
  try {
    const [limits] = await db.select().from(agentUsageLimits).limit(1);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const monthlyLogs = await db.select()
      .from(agentUsageDailyLog)
      .where(gte(agentUsageDailyLog.logDate, startOfMonth));

    const monthlyTotal = monthlyLogs.reduce((sum, log) => sum + parseFloat(log.estimatedUnits || '0'), 0);

    const todayLog = monthlyLogs.find(log => {
      const logDate = new Date(log.logDate);
      return logDate >= startOfDay && logDate < endOfDay;
    });
    const dailyTotal = todayLog ? parseFloat(todayLog.estimatedUnits || '0') : 0;

    const monthlyLimit = limits ? parseFloat(limits.monthlyLimitUnits || '500') : 500;
    const dailyLimit = limits ? parseFloat(limits.dailyLimitUnits || '50') : 50;
    const monthlyPercent = monthlyLimit > 0 ? (monthlyTotal / monthlyLimit) * 100 : 0;
    const dailyPercent = dailyLimit > 0 ? (dailyTotal / dailyLimit) * 100 : 0;

    let warningLevel: 'none' | 'caution' | 'warning' | 'critical' | 'limit_reached' = 'none';
    const maxPercent = Math.max(monthlyPercent, dailyPercent);
    if (maxPercent >= 100) warningLevel = 'limit_reached';
    else if (maxPercent >= 90) warningLevel = 'critical';
    else if (maxPercent >= 75) warningLevel = 'warning';
    else if (maxPercent >= 50) warningLevel = 'caution';

    res.json({
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      monthlyLimit,
      monthlyPercent: Math.round(monthlyPercent * 10) / 10,
      dailyTotal: Math.round(dailyTotal * 100) / 100,
      dailyLimit,
      dailyPercent: Math.round(dailyPercent * 10) / 10,
      warningLevel,
      softBlockEnabled: limits?.softBlockEnabled ?? true,
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      dayOfMonth: now.getDate(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
