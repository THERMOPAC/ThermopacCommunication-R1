import express, { Express, Request, Response } from 'express';
import wpsPqrRoutes from './quality/wps-pqr-routes';
import materialIdentificationRoutes from './quality/material-identification-routes';
import { previewInspectionOrders, generateInspectionOrders } from './quality/inspection-order-generator';
import { db } from './db';
import { inspectionOrders, inspectionOrderItems } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-utils';

const router = express.Router();

// Register WPS/PQR management routes
router.use('/wps-pqr', wpsPqrRoutes);

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