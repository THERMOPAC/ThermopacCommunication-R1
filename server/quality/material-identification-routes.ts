import express from 'express';
import { ensureAuthenticated } from '../middleware/auth';
import { db } from '../db';
import { materialIdentification, materialIdentificationCounter } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

/**
 * Generate a new Material Identification ID 
 * Format: MI-YYYY-N where YYYY is current year and N is sequence number
 */
async function generateMaterialIdentificationId(): Promise<string> {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get current counter for this year or create if not exists
    const counterRecord = await db.select()
      .from(materialIdentificationCounter)
      .where(eq(materialIdentificationCounter.year, currentYear));
    
    if (counterRecord.length === 0) {
      // Create new counter for this year starting at 1
      await db.insert(materialIdentificationCounter)
        .values({ year: currentYear, sequenceNumber: 1 });
      
      return `MI-${currentYear}-1`;
    } else {
      // Increment counter
      const newSequence = counterRecord[0].sequenceNumber + 1;
      
      await db.update(materialIdentificationCounter)
        .set({ sequenceNumber: newSequence })
        .where(eq(materialIdentificationCounter.year, currentYear));
      
      return `MI-${currentYear}-${newSequence}`;
    }
  } catch (error) {
    console.error("Error generating Material Identification ID:", error);
    throw error;
  }
}

/**
 * Get the next Material Identification ID without incrementing the counter
 */
router.get('/next-id', ensureAuthenticated, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get current counter for this year or create if not exists
    const counterRecord = await db.select()
      .from(materialIdentificationCounter)
      .where(eq(materialIdentificationCounter.year, currentYear));
    
    if (counterRecord.length === 0) {
      return res.json({ nextId: `MI-${currentYear}-1` });
    } else {
      const nextSequence = counterRecord[0].sequenceNumber + 1;
      return res.json({ nextId: `MI-${currentYear}-${nextSequence}` });
    }
  } catch (error) {
    console.error("Error getting next Material Identification ID:", error);
    res.status(500).json({ error: "Failed to get next Material Identification ID" });
  }
});

/**
 * Create a new Material Identification record
 */
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { body } = req;
    
    // Generate Material Identification ID
    const materialIdentificationId = await generateMaterialIdentificationId();
    
    // Add created by user ID and MI ID to the request
    const materialIdentificationData = {
      ...body,
      materialIdentificationId,
      createdBy: req.user!.id,
    };
    
    // Create the record
    const result = await db.insert(materialIdentification)
      .values(materialIdentificationData)
      .returning();
    
    res.status(201).json(result[0]);
  } catch (error) {
    console.error("Error creating Material Identification record:", error);
    res.status(500).json({ error: "Failed to create Material Identification record" });
  }
});

/**
 * Get all Material Identification records
 */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const records = await db.select()
      .from(materialIdentification)
      .orderBy(materialIdentification.createdAt);
    
    res.json(records);
  } catch (error) {
    console.error("Error fetching Material Identification records:", error);
    res.status(500).json({ error: "Failed to fetch Material Identification records" });
  }
});

/**
 * Get Material Identification record by ID
 */
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [record] = await db.select()
      .from(materialIdentification)
      .where(eq(materialIdentification.id, parseInt(id)));
    
    if (!record) {
      return res.status(404).json({ error: "Material Identification record not found" });
    }
    
    res.json(record);
  } catch (error) {
    console.error("Error fetching Material Identification record:", error);
    res.status(500).json({ error: "Failed to fetch Material Identification record" });
  }
});

export default router;