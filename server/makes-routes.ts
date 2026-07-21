import { Router } from 'express';
import { db } from './db';
import { makes } from '../shared/schema';
import { eq, ilike, or, desc, sql } from 'drizzle-orm';

const router = Router();

function normalizeMake(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// GET /api/makes?search=abc  — returns up to 50 matches ranked by usage then alpha
router.get('/', async (req, res) => {
  try {
    const search = ((req.query.search as string) || '').trim();

    const rows = await db
      .select()
      .from(makes)
      .where(search ? ilike(makes.name, `%${search}%`) : undefined)
      .orderBy(makes.name)
      .limit(50);

    res.json(rows);
  } catch (e: any) {
    console.error('[Makes] GET error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/makes  { name }  — idempotent: returns existing if normalized duplicate
router.post('/', async (req, res) => {
  try {
    const raw: string = (req.body?.name ?? '').toString();
    if (!raw.trim()) return res.status(400).json({ error: 'name is required' });

    const norm = normalizeMake(raw);

    // Check for existing
    const [existing] = await db.select().from(makes).where(eq(makes.normalized, norm)).limit(1);
    if (existing) return res.status(200).json({ ...existing, alreadyExisted: true });

    const userId = (req as any).user?.id ?? null;
    const [created] = await db
      .insert(makes)
      .values({ name: raw.trim(), normalized: norm, createdBy: userId })
      .returning();

    res.status(201).json({ ...created, alreadyExisted: false });
  } catch (e: any) {
    console.error('[Makes] POST error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
