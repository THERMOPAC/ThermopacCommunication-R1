import { Router } from 'express';
import { tankPrices } from '@shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';
import { ensureAuthenticated } from './storage';

const router = Router();

// GET /api/tank-prices - Get all tank prices
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Tank prices GET route hit');
    const prices = await db.select().from(tankPrices).where(eq(tankPrices.isActive, true)).orderBy(tankPrices.capacity);
    console.log('Found tank prices:', prices.length);
    console.log('Raw tank prices from DB:', JSON.stringify(prices, null, 2));
    
    // Convert database field names to frontend format
    const formattedPrices = prices.map(price => ({
      id: price.id,
      capacity: price.capacity,
      priceUSD: parseFloat(price.priceUSD?.toString() || '0'),
      isActive: price.isActive,
      createdAt: price.createdAt,
      updatedAt: price.updatedAt,
      createdBy: price.createdBy,
      updatedBy: price.updatedBy
    }));
    console.log('Formatted tank prices:', JSON.stringify(formattedPrices, null, 2));
    res.json(formattedPrices);
  } catch (error) {
    console.error('Error fetching tank prices:', error);
    res.status(500).json({ error: 'Failed to fetch tank prices' });
  }
});

// PUT /api/tank-prices/:id - Update tank price
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { priceUSD } = req.body;
    const userId = (req as any).user?.id;

    if (!priceUSD || isNaN(parseFloat(priceUSD))) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    const updatedPrice = await db
      .update(tankPrices)
      .set({ 
        priceUSD: parseFloat(priceUSD).toString(),
        updatedAt: new Date(),
        updatedBy: userId
      })
      .where(eq(tankPrices.id, parseInt(id)))
      .returning();

    if (updatedPrice.length === 0) {
      return res.status(404).json({ error: 'Tank price not found' });
    }

    console.log('Updated tank price:', updatedPrice[0]);
    res.json(updatedPrice[0]);
  } catch (error) {
    console.error('Error updating tank price:', error);
    res.status(500).json({ error: 'Failed to update tank price' });
  }
});

export default router;