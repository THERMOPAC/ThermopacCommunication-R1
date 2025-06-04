import express, { Request, Response } from 'express';
import { db } from './db';
import { workLocations, users, InsertWorkLocation, WorkLocation } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

const router = express.Router();

// Get all work locations
router.get('/work-locations', async (req: Request, res: Response) => {
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

// Get active work locations
router.get('/work-locations/active', async (req: Request, res: Response) => {
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

// Get work location by ID
router.get('/work-locations/:id', async (req: Request, res: Response) => {
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

// Create new work location
router.post('/work-locations', async (req: Request, res: Response) => {
  try {
    const locationData: InsertWorkLocation = req.body;
    
    const [newLocation] = await db
      .insert(workLocations)
      .values({
        ...locationData,
        updatedAt: new Date()
      })
      .returning();
    
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Error creating work location:', error);
    res.status(500).json({ error: 'Failed to create work location' });
  }
});

// Update work location
router.put('/work-locations/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const locationData: Partial<InsertWorkLocation> = req.body;
    
    const [updatedLocation] = await db
      .update(workLocations)
      .set({
        ...locationData,
        updatedAt: new Date()
      })
      .where(eq(workLocations.id, id))
      .returning();
    
    if (!updatedLocation) {
      return res.status(404).json({ error: 'Work location not found' });
    }
    
    res.json(updatedLocation);
  } catch (error) {
    console.error('Error updating work location:', error);
    res.status(500).json({ error: 'Failed to update work location' });
  }
});

// Delete work location
router.delete('/work-locations/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    // Check if any users are assigned to this location
    const usersWithLocation = await db
      .select()
      .from(users)
      .where(eq(users.workLocationId, id));
    
    if (usersWithLocation.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete location. Users are assigned to this location.' 
      });
    }
    
    const [deletedLocation] = await db
      .delete(workLocations)
      .where(eq(workLocations.id, id))
      .returning();
    
    if (!deletedLocation) {
      return res.status(404).json({ error: 'Work location not found' });
    }
    
    res.json({ message: 'Work location deleted successfully' });
  } catch (error) {
    console.error('Error deleting work location:', error);
    res.status(500).json({ error: 'Failed to delete work location' });
  }
});

// Toggle location status (activate/deactivate)
router.patch('/work-locations/:id/toggle-status', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
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
        updatedAt: new Date()
      })
      .where(eq(workLocations.id, id))
      .returning();
    
    res.json(updatedLocation);
  } catch (error) {
    console.error('Error toggling location status:', error);
    res.status(500).json({ error: 'Failed to toggle location status' });
  }
});

// Get users by work location
router.get('/work-locations/:id/users', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    const locationUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        mobileNumber: users.mobileNumber,
        countryCode: users.countryCode
      })
      .from(users)
      .where(eq(users.workLocationId, id));
    
    res.json(locationUsers);
  } catch (error) {
    console.error('Error fetching users for location:', error);
    res.status(500).json({ error: 'Failed to fetch users for location' });
  }
});

export default router;