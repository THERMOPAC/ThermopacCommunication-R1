import { Request, Response } from 'express';
import { db } from './db';
import { tankPricing } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const getTankPricing = async (req: Request, res: Response) => {
  try {
    const pricing = await db.select().from(tankPricing).where(eq(tankPricing.isActive, true)).orderBy(tankPricing.tankSize);
    res.json(pricing);
  } catch (error) {
    console.error('Error fetching tank pricing:', error);
    res.status(500).json({ error: 'Failed to fetch tank pricing' });
  }
};

export const updateTankPrice = async (req: Request, res: Response) => {
  try {
    const { tankSize, priceUSD } = req.body;
    const userId = req.user?.id;

    if (!tankSize || !priceUSD || !userId) {
      return res.status(400).json({ error: 'Tank size, price, and user ID are required' });
    }

    const updated = await db.update(tankPricing)
      .set({ 
        priceUSD: priceUSD.toString(),
        updatedAt: new Date(),
        updatedBy: userId
      })
      .where(eq(tankPricing.tankSize, tankSize))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Tank size not found' });
    }

    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating tank price:', error);
    res.status(500).json({ error: 'Failed to update tank price' });
  }
};