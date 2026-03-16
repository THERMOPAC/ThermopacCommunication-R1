import { Router, Request, Response } from 'express';
import { db } from './db';
import { notifications, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const limit = parseInt(req.query.limit as string) || 50;

    const results = await db.select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      link: notifications.link,
      isRead: notifications.isRead,
      sourceType: notifications.sourceType,
      sourceId: notifications.sourceId,
      createdBy: notifications.createdBy,
      createdAt: notifications.createdAt,
      createdByName: users.fullName,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.createdBy, users.id))
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

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

router.patch('/:id/read', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id);

    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.patch('/read-all', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

export async function createNotification(data: {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  sourceType?: string;
  sourceId?: number;
  createdBy?: number;
}) {
  try {
    const [notif] = await db.insert(notifications).values(data).returning();
    return notif;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

export default router;
