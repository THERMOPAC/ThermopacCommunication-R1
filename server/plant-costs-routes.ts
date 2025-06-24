import { Request, Response, Router } from 'express';
import { db } from './db';
import { plantCosts, insertPlantCostSchema } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

// Get all plant costs
router.get('/api/plant-costs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const costs = await db
      .select()
      .from(plantCosts)
      .where(eq(plantCosts.isActive, true))
      .orderBy(plantCosts.capacity);

    res.json(costs);
  } catch (error) {
    console.error('Error fetching plant costs:', error);
    res.status(500).json({ error: 'Failed to fetch plant costs' });
  }
});

// Update plant cost
router.put('/api/plant-costs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { capacity, priceUSD } = req.body;
    const userId = (req as any).user.id;

    // Validate input
    if (!capacity || !priceUSD) {
      return res.status(400).json({ error: 'Capacity and price are required' });
    }

    // Update the plant cost
    const [updatedCost] = await db
      .update(plantCosts)
      .set({
        capacity: parseInt(capacity),
        priceUSD: priceUSD.toString(),
        updatedBy: userId,
        updatedAt: new Date()
      })
      .where(eq(plantCosts.id, parseInt(id)))
      .returning();

    if (!updatedCost) {
      return res.status(404).json({ error: 'Plant cost not found' });
    }

    res.json(updatedCost);
  } catch (error) {
    console.error('Error updating plant cost:', error);
    res.status(500).json({ error: 'Failed to update plant cost' });
  }
});

// Create new plant cost
router.post('/api/plant-costs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { capacity, priceUSD } = req.body;
    const userId = (req as any).user.id;

    // Validate input
    if (!capacity || !priceUSD) {
      return res.status(400).json({ error: 'Capacity and price are required' });
    }

    // Create new plant cost
    const [newCost] = await db
      .insert(plantCosts)
      .values({
        capacity: parseInt(capacity),
        priceUSD: priceUSD.toString(),
        createdBy: userId,
        updatedBy: userId
      })
      .returning();

    res.json(newCost);
  } catch (error) {
    console.error('Error creating plant cost:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'Plant capacity already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create plant cost' });
    }
  }
});

// Delete plant cost
router.delete('/api/plant-costs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Soft delete by setting isActive to false
    const [deletedCost] = await db
      .update(plantCosts)
      .set({ isActive: false })
      .where(eq(plantCosts.id, parseInt(id)))
      .returning();

    if (!deletedCost) {
      return res.status(404).json({ error: 'Plant cost not found' });
    }

    res.json({ message: 'Plant cost deleted successfully' });
  } catch (error) {
    console.error('Error deleting plant cost:', error);
    res.status(500).json({ error: 'Failed to delete plant cost' });
  }
});

export default router;