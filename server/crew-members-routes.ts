import { Response, Router, Request } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { sendError, sendValidationError, sendNotFound } from './utils/error-response';

const router = Router();

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// GET /api/crew-members
router.get('/api/crew-members', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM crew_members ORDER BY is_active DESC, name ASC`);
    let data = rows.rows as any[];

    const { role_type, search, active } = req.query;
    if (active === 'true')  data = data.filter(r => r.is_active);
    if (active === 'false') data = data.filter(r => !r.is_active);
    if (role_type) data = data.filter(r => Array.isArray(r.role_types) && r.role_types.includes(role_type as string));
    if (search) {
      const s = (search as string).toLowerCase();
      data = data.filter(r => r.name.toLowerCase().includes(s));
    }
    res.json(data);
  } catch (e) { sendError(res, e); }
});

// POST /api/crew-members
router.post('/api/crew-members', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { name, role_types, employee_code } = req.body;
    if (!name?.trim()) return sendValidationError(res, 'Name is required');

    const roleArray = Array.isArray(role_types) ? role_types : [];
    const empCode = employee_code?.trim() || null;

    const dup = await db.execute(sql`SELECT id FROM crew_members WHERE LOWER(name) = LOWER(${name.trim()})`);
    if (dup.rows.length > 0) return res.status(409).json({ error: 'A crew member with this name already exists' });

    const r = await db.execute(sql`
      INSERT INTO crew_members (name, role_types, employee_code, is_active, created_at, updated_at)
      VALUES (${name.trim()}, ${roleArray}::text[], ${empCode}, true, NOW(), NOW())
      RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch (e) { sendError(res, e); }
});

// PUT /api/crew-members/:id
router.put('/api/crew-members/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid ID');

    const { name, role_types, employee_code } = req.body;
    if (!name?.trim()) return sendValidationError(res, 'Name is required');

    const existing = await db.execute(sql`SELECT id FROM crew_members WHERE id = ${id}`);
    if (existing.rows.length === 0) return sendNotFound(res, 'Crew member not found');

    const dup = await db.execute(sql`SELECT id FROM crew_members WHERE LOWER(name) = LOWER(${name.trim()}) AND id != ${id}`);
    if (dup.rows.length > 0) return res.status(409).json({ error: 'A crew member with this name already exists' });

    const roleArray = Array.isArray(role_types) ? role_types : [];
    const empCode = employee_code?.trim() || null;

    const r = await db.execute(sql`
      UPDATE crew_members
      SET name = ${name.trim()}, role_types = ${roleArray}::text[], employee_code = ${empCode}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    res.json(r.rows[0]);
  } catch (e) { sendError(res, e); }
});

// PATCH /api/crew-members/:id/toggle-status
router.patch('/api/crew-members/:id/toggle-status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid ID');

    const existing = await db.execute(sql`SELECT id, is_active FROM crew_members WHERE id = ${id}`);
    if (existing.rows.length === 0) return sendNotFound(res, 'Crew member not found');
    const current = (existing.rows[0] as any).is_active;

    const r = await db.execute(sql`
      UPDATE crew_members SET is_active = ${!current}, updated_at = NOW() WHERE id = ${id} RETURNING *
    `);
    res.json(r.rows[0]);
  } catch (e) { sendError(res, e); }
});

export default router;
