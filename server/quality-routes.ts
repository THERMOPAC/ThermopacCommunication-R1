import { Router, Request, Response } from 'express';
import { db } from './db';
import { eq, asc, desc, inArray, and, sql } from 'drizzle-orm';
import {
  inspectionReports,
  nonConformanceReports,
  qualityChecklists,
  checklistItems,
  checklistExecutions,
  checklistItemResults,
  inspectionOrders,
  inspectionOrderItems
} from '../shared/schema';
import {
  previewInspectionOrders,
  generateInspectionOrders
} from './quality/fixed-inspection-order-generator';
import { setupWelderRoutes } from './quality/welder-routes';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export const setupQualityRoutes = (app: Router) => {
  // Set up welder management routes
  setupWelderRoutes(app);
  
  // Existing quality routes should be kept...

  // Inspection Orders endpoints
  
  // Get all inspection orders
  app.get('/api/quality/inspection-orders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const allInspectionOrders = await db.query.inspectionOrders.findMany({
        orderBy: [desc(inspectionOrders.createdAt)]
      });
      res.status(200).json(allInspectionOrders);
    } catch (error) {
      console.error('Error fetching inspection orders:', error);
      res.status(500).json({ error: 'Failed to fetch inspection orders' });
    }
  });

  // Get inspection orders for a specific project
  app.get('/api/quality/inspection-orders/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      const projectInspectionOrders = await db.query.inspectionOrders.findMany({
        where: eq(inspectionOrders.projectId, projectId),
        orderBy: [desc(inspectionOrders.createdAt)]
      });
      
      res.status(200).json(projectInspectionOrders);
    } catch (error) {
      console.error('Error fetching project inspection orders:', error);
      res.status(500).json({ error: 'Failed to fetch project inspection orders' });
    }
  });

  // Get a specific inspection order with its items
  app.get('/api/quality/inspection-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const inspectionOrderId = parseInt(req.params.id);
      
      if (isNaN(inspectionOrderId)) {
        return res.status(400).json({ error: 'Invalid inspection order ID' });
      }
      
      const inspectionOrder = await db.query.inspectionOrders.findFirst({
        where: eq(inspectionOrders.id, inspectionOrderId),
        with: {
          items: true,
          project: true,
          creator: true
        }
      });
      
      if (!inspectionOrder) {
        return res.status(404).json({ error: 'Inspection order not found' });
      }
      
      // Get the drawing number from master_items if we have an itemId
      if (inspectionOrder.itemId) {
        try {
          // Execute a truly raw SQL query to get the drawing number directly
          const result = await db.execute(sql`
            SELECT mi.drawing_no, mi.uom 
            FROM master_items mi 
            JOIN project_items pi ON mi.id = pi.item_id 
            WHERE pi.id = ${inspectionOrder.itemId};
          `);
          
          // The result is an array of rows
          if (result && result.rows && result.rows.length > 0) {
            const masterItemData = result.rows[0];
            
            // Add drawingNo and uom to inspection order response
            // These field names should match the database column names
            inspectionOrder.drawingNo = masterItemData.drawing_no;
            inspectionOrder.uom = masterItemData.uom;
            
            // Log the drawing number being added
            console.log(`Adding drawing number: ${masterItemData.drawing_no} for inspection order ${inspectionOrderId}`);
          } else {
            console.log(`No master item found for inspection order item ID ${inspectionOrder.itemId}`);
          }
        } catch (masterItemError) {
          console.error('Error fetching master item drawing number:', masterItemError);
          // Continue without drawing number rather than failing the whole request
        }
      }
      
      res.status(200).json(inspectionOrder);
    } catch (error) {
      console.error('Error fetching inspection order details:', error);
      res.status(500).json({ error: 'Failed to fetch inspection order details' });
    }
  });

  // Get preview of inspection orders for a project
  app.get('/api/quality/inspection-orders/preview/:projectId', ensureAuthenticated, previewInspectionOrders);

  // Generate inspection orders for a project
  app.post('/api/quality/inspection-orders/generate-for-project/:projectId', ensureAuthenticated, generateInspectionOrders);

  // Update inspection order status
  app.patch('/api/quality/inspection-orders/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const inspectionOrderId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (isNaN(inspectionOrderId)) {
        return res.status(400).json({ error: 'Invalid inspection order ID' });
      }
      
      if (!status || !['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      
      const updateData: any = {
        status,
        updatedAt: new Date()
      };
      
      // If status is 'completed', set completedDate
      if (status === 'completed') {
        updateData.completedDate = new Date();
      }
      
      const updatedOrder = await db.update(inspectionOrders)
        .set(updateData)
        .where(eq(inspectionOrders.id, inspectionOrderId))
        .returning();
      
      if (!updatedOrder.length) {
        return res.status(404).json({ error: 'Inspection order not found' });
      }
      
      res.status(200).json(updatedOrder[0]);
    } catch (error) {
      console.error('Error updating inspection order status:', error);
      res.status(500).json({ error: 'Failed to update inspection order status' });
    }
  });

  // Delete an inspection order
  app.delete('/api/quality/inspection-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const inspectionOrderId = parseInt(req.params.id);
      
      if (isNaN(inspectionOrderId)) {
        return res.status(400).json({ error: 'Invalid inspection order ID' });
      }
      
      // First delete all associated items
      await db.delete(inspectionOrderItems)
        .where(eq(inspectionOrderItems.inspectionOrderId, inspectionOrderId));
      
      // Then delete the inspection order
      const deletedOrder = await db.delete(inspectionOrders)
        .where(eq(inspectionOrders.id, inspectionOrderId))
        .returning();
      
      if (!deletedOrder.length) {
        return res.status(404).json({ error: 'Inspection order not found' });
      }
      
      res.status(200).json({ message: 'Inspection order deleted successfully' });
    } catch (error) {
      console.error('Error deleting inspection order:', error);
      res.status(500).json({ error: 'Failed to delete inspection order' });
    }
  });
};