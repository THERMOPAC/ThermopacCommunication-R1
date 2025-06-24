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
    
    // Use raw SQL to get tank prices directly
    const result = await db.execute(sql`
      SELECT id, capacity, price_usd, is_active, created_at, updated_at, created_by, updated_by
      FROM tank_prices 
      WHERE is_active = true 
      ORDER BY capacity
    `);
    
    console.log('SQL Query executed, rows:', result.rows.length);
    
    // Convert to proper format  
    const formattedPrices = result.rows.map((row: any) => {
      const numericPrice = parseFloat(row.price_usd?.toString() || '0');
      console.log(`Tank ${row.capacity} KL: ${row.price_usd} -> ${numericPrice}`);
      return {
        id: row.id,
        capacity: row.capacity,
        priceUSD: numericPrice,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by
      };
    });
    
    console.log('SENDING RESPONSE:', JSON.stringify(formattedPrices, null, 2));

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