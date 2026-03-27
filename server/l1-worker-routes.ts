import { Router, Request, Response } from "express";
import { db } from "./db";
import { l1Workers, l1Events, l1Actions } from "@shared/schema";
import { eq, desc, sql, and, gte, count } from "drizzle-orm";

const router = Router();

function ensureAuthenticated(req: Request, res: Response, next: any) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ success: false, message: "Not authenticated" });
}

router.get("/dashboard/summary", ensureAuthenticated, async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const workers = await db.select().from(l1Workers).orderBy(l1Workers.workerKey);

    const todayEvents = await db
      .select({ count: count() })
      .from(l1Events)
      .where(gte(l1Events.createdAt, todayStart));

    const todayActionsGenerated = await db
      .select({ count: count() })
      .from(l1Actions)
      .where(gte(l1Actions.createdAt, todayStart));

    const openActions = await db
      .select({ count: count() })
      .from(l1Actions)
      .where(eq(l1Actions.status, "open"));

    const todayResolved = await db
      .select({ count: count() })
      .from(l1Actions)
      .where(and(eq(l1Actions.status, "resolved"), gte(l1Actions.resolvedAt, todayStart)));

    const activeWorkers = workers.filter(w => w.isEnabled && !w.isSuspended).length;
    const errorWorkers = workers.filter(w => w.consecutiveErrors > 0).length;

    const totalAvgMs = workers.length > 0
      ? Math.round(workers.reduce((s, w) => s + w.avgResponseMs, 0) / workers.length)
      : 0;

    res.json({
      workers,
      stats: {
        totalWorkers: workers.length,
        activeWorkers,
        errorWorkers,
        eventsToday: todayEvents[0]?.count || 0,
        actionsGenerated: todayActionsGenerated[0]?.count || 0,
        openActions: openActions[0]?.count || 0,
        resolvedToday: todayResolved[0]?.count || 0,
        avgResponseMs: totalAvgMs,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/events", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const eventType = req.query.eventType as string;
    const workerKey = req.query.workerKey as string;

    let conditions = [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    conditions.push(gte(l1Events.createdAt, todayStart));

    if (eventType && eventType !== "all") {
      conditions.push(eq(l1Events.eventType, eventType));
    }
    if (workerKey && workerKey !== "all") {
      conditions.push(eq(l1Events.workerKey, workerKey));
    }

    const events = await db
      .select()
      .from(l1Events)
      .where(and(...conditions))
      .orderBy(desc(l1Events.createdAt))
      .limit(limit);

    res.json(events);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/actions", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const status = req.query.status as string;

    let conditions = [];
    if (userId) {
      conditions.push(eq(l1Actions.userId, userId));
    }
    if (status && status !== "all") {
      conditions.push(eq(l1Actions.status, status));
    }

    const actions = await db
      .select()
      .from(l1Actions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(l1Actions.createdAt))
      .limit(100);

    res.json(actions);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/actions/my", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user) return res.status(401).json({ success: false, message: "Not authenticated" });

    const actions = await db
      .select()
      .from(l1Actions)
      .where(eq(l1Actions.userId, user.id))
      .orderBy(desc(l1Actions.createdAt))
      .limit(50);

    const open = actions.filter(a => a.status === "open");
    const resolved = actions.filter(a => a.status === "resolved");
    const dismissed = actions.filter(a => a.status === "dismissed");

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const thisWeek = actions.filter(a => new Date(a.createdAt!) >= weekStart);

    res.json({
      open,
      resolved,
      dismissed,
      weekSummary: {
        total: thisWeek.length,
        resolved: thisWeek.filter(a => a.status === "resolved").length,
        open: thisWeek.filter(a => a.status === "open").length,
        dismissed: thisWeek.filter(a => a.status === "dismissed").length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/actions/team", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const openActions = await db
      .select()
      .from(l1Actions)
      .where(eq(l1Actions.status, "open"))
      .orderBy(desc(l1Actions.createdAt));

    const byUser: Record<string, { userName: string; userId: number; open: number; oldest: any }> = {};
    for (const action of openActions) {
      const key = String(action.userId);
      if (!byUser[key]) {
        byUser[key] = { userName: action.userName || `User ${action.userId}`, userId: action.userId, open: 0, oldest: null };
      }
      byUser[key].open++;
      if (!byUser[key].oldest || new Date(action.createdAt!) < new Date(byUser[key].oldest.createdAt)) {
        byUser[key].oldest = action;
      }
    }

    res.json({
      teamMembers: Object.values(byUser).sort((a, b) => b.open - a.open),
      totalOpen: openActions.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/effectiveness", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const allActions = await db
      .select()
      .from(l1Actions)
      .where(sql`${l1Actions.status} != 'open'`);

    const byWarningType: Record<string, { warning: string; shown: number; acted: number; dismissed: number }> = {};
    for (const action of allActions) {
      const wt = action.warningType || action.what;
      if (!byWarningType[wt]) {
        byWarningType[wt] = { warning: wt, shown: 0, acted: 0, dismissed: 0 };
      }
      byWarningType[wt].shown++;
      if (action.status === "resolved") byWarningType[wt].acted++;
      if (action.status === "dismissed") byWarningType[wt].dismissed++;
    }

    const warnings = Object.values(byWarningType).sort((a, b) => b.shown - a.shown);

    const eventFlow = await db
      .select({
        eventType: l1Events.eventType,
        count: count(),
      })
      .from(l1Events)
      .groupBy(l1Events.eventType)
      .orderBy(desc(count()));

    res.json({ warnings, eventFlow });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/actions/:id/dismiss", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db
      .update(l1Actions)
      .set({ status: "dismissed", dismissedAt: new Date(), dismissCount: sql`${l1Actions.dismissCount} + 1` })
      .where(eq(l1Actions.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/actions/:id/resolve", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db
      .update(l1Actions)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(l1Actions.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/workers/:workerKey/enable", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workerKey } = req.params;
    await db.update(l1Workers).set({ isEnabled: true }).where(eq(l1Workers.workerKey, workerKey));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/workers/:workerKey/disable", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workerKey } = req.params;
    await db.update(l1Workers).set({ isEnabled: false }).where(eq(l1Workers.workerKey, workerKey));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
