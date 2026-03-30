import { Router, Request, Response } from 'express';
import { db } from './db';
import { notifications, users } from '@shared/schema';
import { eq, and, desc, sql, inArray, or, ilike } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const category = req.query.category as string;
    const priority = req.query.priority as string;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const conditions: any[] = [eq(notifications.userId, user.id)];

    if (category && category !== 'all') {
      conditions.push(eq(notifications.category, category));
    }
    if (priority && priority !== 'all') {
      conditions.push(eq(notifications.priority, priority));
    }
    if (status && status !== 'all') {
      if (status === 'new') {
        conditions.push(eq(notifications.status, 'new'));
      } else if (status === 'seen') {
        conditions.push(eq(notifications.status, 'seen'));
      } else if (status === 'acknowledged') {
        conditions.push(eq(notifications.status, 'acknowledged'));
      } else if (status === 'active') {
        conditions.push(or(eq(notifications.status, 'new'), eq(notifications.status, 'seen'))!);
      }
    }
    if (search) {
      conditions.push(or(ilike(notifications.title, `%${search}%`), ilike(notifications.message, `%${search}%`))!);
    }

    const results = await db.select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      link: notifications.link,
      isRead: notifications.isRead,
      priority: notifications.priority,
      category: notifications.category,
      status: notifications.status,
      sourceType: notifications.sourceType,
      sourceId: notifications.sourceId,
      createdBy: notifications.createdBy,
      createdAt: notifications.createdAt,
      createdByName: users.firstName,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.createdBy, users.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

    res.json(results);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/unread-count', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

    res.json({ count: result?.count || 0 });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

router.get('/summary', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const [counts] = await db.select({
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where is_read = false)::int`,
      newCount: sql<number>`count(*) filter (where status = 'new')::int`,
      highPriority: sql<number>`count(*) filter (where priority = 'high' and status != 'acknowledged')::int`,
      mediumPriority: sql<number>`count(*) filter (where priority = 'medium' and status != 'acknowledged')::int`,
      lowPriority: sql<number>`count(*) filter (where priority = 'low' and status != 'acknowledged')::int`,
    })
    .from(notifications)
    .where(eq(notifications.userId, user.id));

    const categoryCounts = await db.select({
      category: notifications.category,
      count: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where is_read = false)::int`,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), or(eq(notifications.status, 'new'), eq(notifications.status, 'seen'))!))
    .groupBy(notifications.category);

    res.json({
      ...counts,
      byCategory: categoryCounts,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.patch('/:id/read', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id);

    await db.update(notifications)
      .set({ isRead: true, status: 'seen' })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.patch('/:id/acknowledge', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id);

    await db.update(notifications)
      .set({ isRead: true, status: 'acknowledged' })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error acknowledging notification:', error);
    res.status(500).json({ error: 'Failed to acknowledge' });
  }
});

router.patch('/read-all', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    await db.update(notifications)
      .set({ isRead: true, status: 'seen' })
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.patch('/acknowledge-all', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { category } = req.body;

    const conditions: any[] = [eq(notifications.userId, user.id)];
    if (category && category !== 'all') {
      conditions.push(eq(notifications.category, category));
    }

    await db.update(notifications)
      .set({ isRead: true, status: 'acknowledged' })
      .where(and(...conditions));

    res.json({ success: true });
  } catch (error) {
    console.error('Error acknowledging all:', error);
    res.status(500).json({ error: 'Failed to acknowledge all' });
  }
});

router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id);

    await db.delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export async function createNotification(data: {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  priority?: string;
  category?: string;
  sourceType?: string;
  sourceId?: number;
  createdBy?: number;
}) {
  try {
    const priority = data.priority || deriveAlertPriority(data.type);
    const category = data.category || deriveAlertCategory(data.type, data.sourceType);

    const [notif] = await db.insert(notifications).values({
      ...data,
      priority,
      category,
      status: 'new',
    }).returning();
    return notif;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

function deriveAlertPriority(type: string): string {
  switch (type) {
    case 'approval_request': return 'high';
    case 'approval_decision': return 'medium';
    case 'task_assigned': return 'high';
    case 'task_completed': return 'low';
    case 'epc_gate_blocked': return 'critical';
    case 'epc_inspection_failed': return 'critical';
    case 'epc_supersession': return 'high';
    case 'epc_lifecycle': return 'medium';
    case 'epc_release': return 'medium';
    default: return 'medium';
  }
}

function deriveAlertCategory(type: string, sourceType?: string): string {
  if (sourceType === 'leave_request') return 'leave';
  if (sourceType === 'attendance_regularization') return 'attendance';
  if (sourceType === 'task') return 'task';
  if (sourceType === 'epc_automation') return 'epc';
  
  switch (type) {
    case 'approval_request':
    case 'approval_decision':
      return 'approval';
    case 'task_assigned':
    case 'task_completed':
      return 'task';
    case 'epc_gate_blocked':
    case 'epc_inspection_failed':
    case 'epc_supersession':
    case 'epc_lifecycle':
    case 'epc_release':
      return 'epc';
    default:
      return 'general';
  }
}

export default router;
