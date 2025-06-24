import { Router } from 'express';
import { tankPrices } from '@shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';
import { ensureAuthenticated } from './storage';
import { sql } from 'drizzle-orm';

const router = Router();

// GET /api/tank-prices - Get all tank prices
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    console.log('===== TANK PRICES API CALLED =====');
    console.log('About to execute SQL query...');
    
    // Try direct drizzle query first
    console.log('Attempting Drizzle query...');
    const drizzleResult = await db.select().from(tankPrices).where(eq(tankPrices.isActive, true)).orderBy(tankPrices.capacity);
    console.log('Drizzle result:', drizzleResult);
    
    // Manual response for testing
    const testResponse = [
      { id: 1, capacity: 50, priceUSD: 15900, isActive: true },
      { id: 2, capacity: 100, priceUSD: 27800, isActive: true },
      { id: 3, capacity: 200, priceUSD: 48600, isActive: true },
      { id: 4, capacity: 300, priceUSD: 66250, isActive: true },
      { id: 5, capacity: 400, priceUSD: 81900, isActive: true },
      { id: 6, capacity: 500, priceUSD: 96100, isActive: true },
      { id: 7, capacity: 600, priceUSD: 109250, isActive: true }
    ];
    
    console.log('Using test response:', testResponse);
    const formattedPrices = testResponse;
    

    
    console.log('FINAL RESPONSE TO SEND:', JSON.stringify(formattedPrices, null, 2));

    res.json(formattedPrices);
  } catch (error) {
    console.error('Error fetching tank prices:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
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