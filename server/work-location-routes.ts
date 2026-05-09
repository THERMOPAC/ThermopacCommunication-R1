import express, { Request, Response } from 'express';
import { db } from './db';
import {
  workLocations,
  workLocationAuditLog,
  users,
  insertWorkLocationSchema,
} from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = express.Router();

function superuserOnly(req: Request, res: Response): boolean {
  if ((req.user as any)?.role !== 'Superuser') {
    res.status(403).json({ error: 'Superuser access required' });
    return false;
  }
  return true;
}

async function writeAudit(
  workLocationId: number | null,
  action: string,
  changedBy: number | null,
  previousValues: object | null,
  newValues: object | null
): Promise<void> {
  try {
    await db.insert(workLocationAuditLog).values({
      workLocationId,
      action,
      changedBy,
      changedAt: new Date(),
      previousValues,
      newValues,
    });
  } catch (err) {
    console.error('[WorkLocationAudit] Failed to write audit row:', err);
  }
}

// GET all work locations
router.get('/work-locations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const locations = await db
      .select()
      .from(workLocations)
      .orderBy(desc(workLocations.createdAt));
    res.json(locations);
  } catch (error) {
    console.error('Error fetching work locations:', error);
    res.status(500).json({ error: 'Failed to fetch work locations' });
  }
});

// GET active work locations
router.get('/work-locations/active', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const locations = await db
      .select()
      .from(workLocations)
      .where(eq(workLocations.isActive, true))
      .orderBy(workLocations.name);
    res.json(locations);
  } catch (error) {
    console.error('Error fetching active work locations:', error);
    res.status(500).json({ error: 'Failed to fetch active work locations' });
  }
});

// GET work location by ID
router.get('/work-locations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [location] = await db
      .select()
      .from(workLocations)
      .where(eq(workLocations.id, id));

    if (!location) {
      return res.status(404).json({ error: 'Work location not found' });
    }
    res.json(location);
  } catch (error) {
    console.error('Error fetching work location:', error);
    res.status(500).json({ error: 'Failed to fetch work location' });
  }
});

// GET users by work location
router.get('/work-locations/:id/users', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const locationUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        mobileNumber: users.mobileNumber,
        countryCode: users.countryCode,
      })
      .from(users)
      .where(eq(users.workLocationId, id));
    res.json(locationUsers);
  } catch (error) {
    console.error('Error fetching users for location:', error);
    res.status(500).json({ error: 'Failed to fetch users for location' });
  }
});

// POST create new work location — Superuser only
router.post('/work-locations', ensureAuthenticated, async (req: Request, res: Response) => {
  if (!superuserOnly(req, res)) return;

  const parseResult = insertWorkLocationSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
  }

  try {
    const actorId = (req.user as any)?.id ?? null;
    const [newLocation] = await db
      .insert(workLocations)
      .values({
        ...parseResult.data,
        createdBy: actorId,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .returning();

    await writeAudit(newLocation.id, 'create', actorId, null, newLocation);
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Error creating work location:', error);
    res.status(500).json({ error: 'Failed to create work location' });
  }
});

// PUT update work location — Superuser only
router.put('/work-locations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  if (!superuserOnly(req, res)) return;

  const parseResult = insertWorkLocationSchema.partial().safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
  }

  try {
    const id = parseInt(req.params.id);
    const actorId = (req.user as any)?.id ?? null;

    const [existing] = await db
      .select()
      .from(workLocations)
      .where(eq(workLocations.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Work location not found' });
    }

    const [updatedLocation] = await db
      .update(workLocations)
      .set({
        ...parseResult.data,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(workLocations.id, id))
      .returning();

    await writeAudit(id, 'update', actorId, existing, updatedLocation);
    res.json(updatedLocation);
  } catch (error) {
    console.error('Error updating work location:', error);
    res.status(500).json({ error: 'Failed to update work location' });
  }
});

// DELETE work location — Superuser only
router.delete('/work-locations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  if (!superuserOnly(req, res)) return;

  try {
    const id = parseInt(req.params.id);
    const actorId = (req.user as any)?.id ?? null;

    const usersWithLocation = await db
      .select()
      .from(users)
      .where(eq(users.workLocationId, id));

    if (usersWithLocation.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete location. Users are assigned to this location.',
      });
    }

    const [deletedLocation] = await db
      .delete(workLocations)
      .where(eq(workLocations.id, id))
      .returning();

    if (!deletedLocation) {
      return res.status(404).json({ error: 'Work location not found' });
    }

    await writeAudit(id, 'delete', actorId, deletedLocation, null);
    res.json({ message: 'Work location deleted successfully' });
  } catch (error) {
    console.error('Error deleting work location:', error);
    res.status(500).json({ error: 'Failed to delete work location' });
  }
});

// PATCH toggle status — Superuser only
router.patch('/work-locations/:id/toggle-status', ensureAuthenticated, async (req: Request, res: Response) => {
  if (!superuserOnly(req, res)) return;

  try {
    const id = parseInt(req.params.id);
    const actorId = (req.user as any)?.id ?? null;

    const [location] = await db
      .select()
      .from(workLocations)
      .where(eq(workLocations.id, id));

    if (!location) {
      return res.status(404).json({ error: 'Work location not found' });
    }

    const [updatedLocation] = await db
      .update(workLocations)
      .set({
        isActive: !location.isActive,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(workLocations.id, id))
      .returning();

    await writeAudit(id, 'toggle_status', actorId, { isActive: location.isActive }, { isActive: !location.isActive });
    res.json(updatedLocation);
  } catch (error) {
    console.error('Error toggling location status:', error);
    res.status(500).json({ error: 'Failed to toggle location status' });
  }
});

export default router;
