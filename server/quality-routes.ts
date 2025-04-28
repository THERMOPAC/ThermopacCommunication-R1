import express, { Express, Request, Response, NextFunction } from 'express';
import wpsPqrRoutes from './quality/wps-pqr-routes';
import wpqrRoutes from './quality/wpqr-routes';
import materialIdentificationRoutes from './quality/material-identification-routes';
import { previewInspectionOrders, generateInspectionOrders } from './quality/inspection-order-generator';
import { db } from './db';
import { inspectionOrders, inspectionOrderItems } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

const router = express.Router();

// Register WPS/PQR management routes
router.use('/wps-pqr', wpsPqrRoutes);

// Register new WPQR document routes
router.use('/wpqr', wpqrRoutes);

// Register Material Identification routes
router.use('/material-identification', materialIdentificationRoutes);

// Register Inspection Orders routes
router.get('/inspection-orders/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Fetch inspection orders for this project
    const orders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId),
      orderBy: (inspectionOrders, { desc }) => [desc(inspectionOrders.createdAt)]
    });
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching inspection orders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch inspection orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get a single inspection order by ID
router.get('/inspection-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid inspection order ID' });
    }
    
    // Fetch inspection order
    const inspectionOrder = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.id, orderId)
    });
    
    if (!inspectionOrder) {
      return res.status(404).json({ error: 'Inspection order not found' });
    }

    // Fetch inspection order items
    const orderItems = await db.query.inspectionOrderItems.findMany({
      where: eq(inspectionOrderItems.inspectionOrderId, orderId),
      orderBy: (items) => [items.sequenceNumber]
    });
    
    // Return detailed inspection order with items
    res.json({
      ...inspectionOrder,
      items: orderItems
    });
  } catch (error) {
    console.error('Error fetching inspection order details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch inspection order details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update an inspection order
router.patch('/inspection-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid inspection order ID' });
    }
    
    // Fetch inspection order to make sure it exists
    const existingOrder = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.id, orderId)
    });
    
    if (!existingOrder) {
      return res.status(404).json({ error: 'Inspection order not found' });
    }

    // Update inspection order
    const updatedOrder = await db.update(inspectionOrders)
      .set({
        ...req.body,
        updatedAt: new Date()
      })
      .where(eq(inspectionOrders.id, orderId))
      .returning();
    
    res.json(updatedOrder[0]);
  } catch (error) {
    console.error('Error updating inspection order:', error);
    res.status(500).json({ 
      error: 'Failed to update inspection order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Route for generating inspection orders (preview and create)
router.post('/inspection-orders/preview/:projectId', ensureAuthenticated, previewInspectionOrders);
router.post('/inspection-orders/generate/:projectId', ensureAuthenticated, generateInspectionOrders);

/**
 * Set up quality management routes
 * @param app Express application
 */
export function setupQualityRoutes(app: Express) {
  app.use('/api/quality', router);
  console.log('Quality management routes registered');
}

export default router;