import express, { Express, Request, Response, NextFunction } from 'express';
import wpsPqrRoutes from './quality/wps-pqr-routes';
import wpqrRoutes from './quality/wpqr-routes';
import materialIdentificationRoutes from './quality/material-identification-routes';
import inspectionDocumentRoutes from './quality/inspection-document-routes';
import finalDossierRoutes from './quality/final-dossier-routes';
import calibrationRoutes from './quality/calibration-routes';
import { previewInspectionOrders, generateInspectionOrders } from './quality/inspection-order-generator';
import { db } from './db';
import { inspectionOrders, inspectionOrderItems, materialInspectionLinks } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { registerWelderRoutes } from './quality/welder-routes';
import { registerWelderCertificateRoutes } from './quality/welder-certificate-routes';
import { registerWelderPhotoRoutes } from './quality/welder-photo-routes';
import debugRouter from './quality/debug-routes';
import { generateInspectionOrdersForProject3 } from './quality/project3-special-fix';
import { generateInspectionOrdersForProject4 } from './quality/project4-special-fix';
import { generateInspectionOrdersForProject5 } from './quality/project5-special-fix';
import { generateInspectionOrdersForProject6 } from './quality/project6-special-fix';
import { generateInspectionOrdersForProject7 } from './quality/project7-special-fix';

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
    
    // Fetch inspection orders for this project, sorted by inspection order number ascending
    // Use natural sorting to handle alphanumeric sequences properly (IO-2025-1-M-1, IO-2025-1-M-2, etc.)
    const orders = await db.execute(sql`
      SELECT * FROM inspection_orders 
      WHERE project_id = ${projectId}
      ORDER BY 
        -- Extract year and project number for primary sorting
        CAST(SPLIT_PART(SPLIT_PART(inspection_order_number, '-', 2), '-', 1) AS INTEGER),
        CAST(SPLIT_PART(SPLIT_PART(inspection_order_number, '-', 3), '-', 1) AS INTEGER),
        -- Then sort by M/B category
        SPLIT_PART(inspection_order_number, '-', 4),
        -- Finally sort by sequence number
        CAST(SPLIT_PART(inspection_order_number, '-', 5) AS INTEGER)
    `);
    
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
    
    // Fetch material links for this inspection order
    const materials = await db.query.materialInspectionLinks.findMany({
      where: eq(materialInspectionLinks.inspectionOrderId, orderId)
    });
    
    // Parse NDT data if it exists
    let ndtRecords = [];
    if (inspectionOrder.ndtData) {
      try {
        ndtRecords = JSON.parse(inspectionOrder.ndtData);
      } catch (e) {
        console.error('Error parsing NDT data:', e);
      }
    }
    
    // Parse Visual Inspection data if it exists
    let visualRecords = [];
    if (inspectionOrder.visualData) {
      try {
        visualRecords = JSON.parse(inspectionOrder.visualData);
      } catch (e) {
        console.error('Error parsing Visual Inspection data:', e);
      }
    }
    
    // Parse Weld data if it exists
    let weldRecords = [];
    if (inspectionOrder.weldData) {
      try {
        weldRecords = JSON.parse(inspectionOrder.weldData);
      } catch (e) {
        console.error('Error parsing Weld data:', e);
      }
    }
    
    // Parse NCR data if it exists
    let ncrRecords = [];
    console.log('Checking for NCR data in inspection order:', inspectionOrder.ncrData);
    if (inspectionOrder.ncrData) {
      try {
        ncrRecords = JSON.parse(inspectionOrder.ncrData);
        console.log('Successfully parsed NCR data:', ncrRecords);
      } catch (e) {
        console.error('Error parsing NCR data:', e);
      }
    } else {
      console.log('No NCR data found in inspection order.');
    }
    
    // Return detailed inspection order with items, materials, NDT records, Visual Inspection records, Weld records, and NCR records
    res.json({
      ...inspectionOrder,
      items: orderItems,
      materials: materials,
      ndtRecords: ndtRecords,
      visualRecords: visualRecords,
      welds: weldRecords,
      ncrRecords: ncrRecords
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

    // Extract materials, NDT records, Visual Inspection records, Weld records, and NCR records from the request body
    const { materials, ndtRecords, visualRecords, welds, ncrRecords, ...orderData } = req.body;
    
    // Store NDT records in the orderData as a JSON string if they exist
    if (ndtRecords && Array.isArray(ndtRecords)) {
      orderData.ndtData = JSON.stringify(ndtRecords);
    }
    
    // Store Visual Inspection records in the orderData as a JSON string if they exist
    if (visualRecords && Array.isArray(visualRecords)) {
      orderData.visualData = JSON.stringify(visualRecords);
    }
    
    // Store Weld records in the orderData as a JSON string if they exist
    if (welds && Array.isArray(welds)) {
      orderData.weldData = JSON.stringify(welds);
    }
    
    // Store NCR records in the orderData as a JSON string if they exist
    if (ncrRecords && Array.isArray(ncrRecords)) {
      console.log('Storing NCR records in order update:', ncrRecords);
      orderData.ncrData = JSON.stringify(ncrRecords);
    } else {
      console.log('No NCR records to store in order update:', ncrRecords);
    }

    // Update inspection order
    const updatedOrder = await db.update(inspectionOrders)
      .set({
        ...orderData,
        updatedAt: new Date()
      })
      .where(eq(inspectionOrders.id, orderId))
      .returning();
    
    // If materials are provided, update material links
    if (materials && Array.isArray(materials)) {
      // First, delete existing material links
      await db.delete(materialInspectionLinks)
        .where(eq(materialInspectionLinks.inspectionOrderId, orderId));
      
      // Then insert new material links
      if (materials.length > 0) {
        const materialLinksToInsert = materials.map(material => ({
          inspectionOrderId: orderId,
          materialId: material.materialId,
          materialIdentificationId: material.materialIdentificationId,
          materialCertificateNumber: material.materialCertificateNumber,
          heatNumber: material.heatNumber,
          materialGrade: material.materialGrade,
          materialSpecification: material.materialSpecification,
          allocatedQuantity: material.allocatedQuantity,
          quantityUnit: material.quantityUnit,
          description: material.description
        }));
        
        await db.insert(materialInspectionLinks).values(materialLinksToInsert);
      }
    }
    
    // Fetch the updated materials for this order
    const updatedMaterials = await db.query.materialInspectionLinks.findMany({
      where: eq(materialInspectionLinks.inspectionOrderId, orderId)
    });
    
    // Parse NDT data for the response
    let parsedNdtRecords = [];
    if (updatedOrder[0].ndtData) {
      try {
        parsedNdtRecords = JSON.parse(updatedOrder[0].ndtData);
      } catch (e) {
        console.error('Error parsing NDT data in response:', e);
      }
    }
    
    // Parse Visual Inspection data for the response
    let parsedVisualRecords = [];
    if (updatedOrder[0].visualData) {
      try {
        parsedVisualRecords = JSON.parse(updatedOrder[0].visualData);
      } catch (e) {
        console.error('Error parsing Visual Inspection data in response:', e);
      }
    }
    
    // Parse Weld data for the response
    let parsedWeldRecords = [];
    if (updatedOrder[0].weldData) {
      try {
        parsedWeldRecords = JSON.parse(updatedOrder[0].weldData);
      } catch (e) {
        console.error('Error parsing Weld data in response:', e);
      }
    }
    
    // Parse NCR data for the response
    let parsedNcrRecords = [];
    console.log('Checking for NCR data in updated order response:', updatedOrder[0].ncrData);
    if (updatedOrder[0].ncrData) {
      try {
        parsedNcrRecords = JSON.parse(updatedOrder[0].ncrData);
        console.log('Successfully parsed NCR data in response:', parsedNcrRecords);
      } catch (e) {
        console.error('Error parsing NCR data in response:', e);
      }
    } else {
      console.log('No NCR data found in updated order response');
    }
    
    // Return updated order with materials, NDT records, Visual Inspection records, Weld records, and NCR records
    res.json({
      ...updatedOrder[0],
      materials: updatedMaterials,
      ndtRecords: parsedNdtRecords,
      visualRecords: parsedVisualRecords,
      welds: parsedWeldRecords,
      ncrRecords: parsedNcrRecords
    });
  } catch (error) {
    console.error('Error updating inspection order:', error);
    res.status(500).json({ 
      error: 'Failed to update inspection order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete an inspection order
router.delete('/inspection-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
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

    // First, delete all associated material links
    await db.delete(materialInspectionLinks)
      .where(eq(materialInspectionLinks.inspectionOrderId, orderId));
    
    // Then, delete all child inspection order items
    await db.delete(inspectionOrderItems)
      .where(eq(inspectionOrderItems.inspectionOrderId, orderId));
    
    // Finally, delete the inspection order itself
    const deletedOrder = await db.delete(inspectionOrders)
      .where(eq(inspectionOrders.id, orderId))
      .returning();
    
    res.json({ success: true, message: 'Inspection order deleted successfully', deletedOrder: deletedOrder[0] });
  } catch (error) {
    console.error('Error deleting inspection order:', error);
    res.status(500).json({ 
      error: 'Failed to delete inspection order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Route for generating inspection orders (preview and create)
router.post('/inspection-orders/preview/:projectId', ensureAuthenticated, previewInspectionOrders);
router.post('/inspection-orders/generate/:projectId', ensureAuthenticated, generateInspectionOrders);

// Add the route that's being used by the frontend for compatibility
router.post('/inspection-orders/generate-for-project/:projectId', ensureAuthenticated, generateInspectionOrders);

// Special fix routes for various projects
router.post('/inspection-orders/special-fix-project-3', ensureAuthenticated, generateInspectionOrdersForProject3);
router.post('/inspection-orders/special-fix-project-4', ensureAuthenticated, generateInspectionOrdersForProject4);
router.post('/inspection-orders/special-fix-project-5', ensureAuthenticated, generateInspectionOrdersForProject5);
router.post('/inspection-orders/special-fix-project-6', ensureAuthenticated, generateInspectionOrdersForProject6);
router.post('/inspection-orders/special-fix-project-7', ensureAuthenticated, generateInspectionOrdersForProject7);

/**
 * Set up quality management routes
 * @param app Express application
 */
export function setupQualityRoutes(app: Express) {
  app.use('/api/quality', router);
  
  // Setup welder management routes directly
  registerWelderRoutes(app);
  
  // Setup welder certificate routes
  registerWelderCertificateRoutes(app);
  
  // Setup welder photo upload routes
  registerWelderPhotoRoutes(app);
  
  // Setup inspection document routes
  app.use('/api/quality/inspection-documents', inspectionDocumentRoutes);
  
  // Setup final dossier generation routes
  app.use('/api/quality/final-dossier', finalDossierRoutes);
  
  // Setup debug routes
  app.use('/api/debug/quality', debugRouter);
  
  // Setup calibration routes
  app.use('/api/quality/calibration', calibrationRoutes);
  console.log('Calibration routes registered at /api/quality/calibration');
  
  // Mount calibration test routes for easy testing
  try {
    // Use ES module import instead of require
    import('../server/testapi/calibration-test-routes.ts').then(module => {
      app.use('/api/testapi/calibration', module.default);
      console.log('Registered calibration test routes at /api/testapi/calibration');
    }).catch(error => {
      console.error('Error importing calibration test routes:', error);
    });
  } catch (error) {
    console.error('Error registering calibration test routes:', error);
  }
  
  console.log('Quality management routes registered');
}

export default router;