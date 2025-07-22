import express, { Express, Request, Response, NextFunction } from 'express';
import wpsPqrRoutes from './quality/wps-pqr-routes';
import wpqrRoutes from './quality/wpqr-routes';
import pmaRoutes from './quality/pma-routes';
import testProceduresRoutes from './quality/test-procedures-routes';
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

// Register new PMA document routes
router.use('/pma', pmaRoutes);

// Register Test Procedures routes
router.use('/test-procedures', testProceduresRoutes);

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
        -- Split by year (2025)
        CAST(SPLIT_PART(inspection_order_number, '-', 2) AS INTEGER),
        -- Split by project number (1)
        CAST(SPLIT_PART(inspection_order_number, '-', 3) AS INTEGER),
        -- Sort by sequence number first (lowest numbers first)
        CAST(SPLIT_PART(inspection_order_number, '-', 5) AS INTEGER),
        -- Then sort by M/B category
        SPLIT_PART(inspection_order_number, '-', 4)
    `);
    
    // Return the rows array from the query result
    const ordersArray = Array.isArray(orders) ? orders : orders.rows || [];
    
    res.json(ordersArray);
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
    
    // Fetch material links for this inspection order with material description
    const materials = await db.query.materialInspectionLinks.findMany({
      where: eq(materialInspectionLinks.inspectionOrderId, orderId),
      with: {
        material: {
          columns: {
            materialDescription: true
          }
        }
      }
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
    
    // Parse Hydrotest data if it exists
    let hydrotestRecords = [];
    console.log('Checking for Hydrotest data in inspection order:', inspectionOrder.hydrotestData);
    if (inspectionOrder.hydrotestData) {
      try {
        hydrotestRecords = JSON.parse(inspectionOrder.hydrotestData);
        console.log('Successfully parsed Hydrotest data:', hydrotestRecords);
      } catch (e) {
        console.error('Error parsing Hydrotest data:', e);
      }
    } else {
      console.log('No Hydrotest data found in inspection order.');
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
    
    // Parse Approved Drawing data if it exists
    let approvedDrawingRecords = [];
    console.log('Checking for Approved Drawing data in inspection order:', inspectionOrder.approvedDrawingData);
    if (inspectionOrder.approvedDrawingData) {
      try {
        approvedDrawingRecords = JSON.parse(inspectionOrder.approvedDrawingData);
        console.log('Successfully parsed Approved Drawing data:', approvedDrawingRecords);
      } catch (e) {
        console.error('Error parsing Approved Drawing data:', e);
      }
    } else {
      console.log('No Approved Drawing data found in inspection order.');
    }
    
    // Parse DVR data if it exists
    let dvrRecords = [];
    console.log('Checking for DVR data in inspection order:', inspectionOrder.dvrData);
    if (inspectionOrder.dvrData) {
      try {
        dvrRecords = JSON.parse(inspectionOrder.dvrData);
        console.log('Successfully parsed DVR data:', dvrRecords);
      } catch (e) {
        console.error('Error parsing DVR data:', e);
      }
    } else {
      console.log('No DVR data found in inspection order.');
    }
    
    // Parse ITP data if it exists
    let itpRecords = [];
    console.log('Checking for ITP data in inspection order:', inspectionOrder.itpData);
    if (inspectionOrder.itpData) {
      try {
        itpRecords = JSON.parse(inspectionOrder.itpData);
        console.log('Successfully parsed ITP data:', itpRecords);
      } catch (e) {
        console.error('Error parsing ITP data:', e);
      }
    } else {
      console.log('No ITP data found in inspection order.');
    }
    
    // Return detailed inspection order with items, materials, NDT records, Visual Inspection records, Weld records, Hydrotest records, NCR records, Approved Drawing records, DVR records, and ITP records
    res.json({
      ...inspectionOrder,
      items: orderItems,
      materials: materials,
      ndtRecords: ndtRecords,
      visualRecords: visualRecords,
      welds: weldRecords,
      hydrotestRecords: hydrotestRecords,
      ncrRecords: ncrRecords,
      approvedDrawingRecords: approvedDrawingRecords,
      dvrRecords: dvrRecords,
      itpRecords: itpRecords
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

    // Extract materials, NDT records, Visual Inspection records, Weld records, Hydrotest records, NCR records, Approved Drawing records, DVR records, and ITP records from the request body
    const { materials, ndtRecords, visualRecords, welds, hydrotestRecords, ncrRecords, approvedDrawingRecords, dvrRecords, itpRecords, ...orderData } = req.body;
    
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
    
    // Store Hydrotest records in the orderData as a JSON string if they exist
    if (hydrotestRecords && Array.isArray(hydrotestRecords)) {
      console.log('Storing Hydrotest records in order update:', hydrotestRecords);
      orderData.hydrotestData = JSON.stringify(hydrotestRecords);
    } else {
      console.log('No Hydrotest records to store in order update:', hydrotestRecords);
    }
    
    // Store NCR records in the orderData as a JSON string if they exist
    if (ncrRecords && Array.isArray(ncrRecords)) {
      console.log('Storing NCR records in order update:', ncrRecords);
      orderData.ncrData = JSON.stringify(ncrRecords);
    } else {
      console.log('No NCR records to store in order update:', ncrRecords);
    }
    
    // Store Approved Drawing records in the orderData as a JSON string if they exist
    if (approvedDrawingRecords && Array.isArray(approvedDrawingRecords)) {
      console.log('Storing Approved Drawing records in order update:', approvedDrawingRecords);
      orderData.approvedDrawingData = JSON.stringify(approvedDrawingRecords);
    } else {
      console.log('No Approved Drawing records to store in order update:', approvedDrawingRecords);
    }
    
    // Store DVR records in the orderData as a JSON string if they exist
    if (dvrRecords && Array.isArray(dvrRecords)) {
      console.log('Storing DVR records in order update:', dvrRecords);
      orderData.dvrData = JSON.stringify(dvrRecords);
    } else {
      console.log('No DVR records to store in order update:', dvrRecords);
    }
    
    // Store ITP records in the orderData as a JSON string if they exist
    if (itpRecords && Array.isArray(itpRecords)) {
      console.log('Storing ITP records in order update:', itpRecords);
      orderData.itpData = JSON.stringify(itpRecords);
    } else {
      console.log('No ITP records to store in order update:', itpRecords);
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
    
    // Parse Hydrotest data for the response
    let parsedHydrotestRecords = [];
    console.log('Checking for Hydrotest data in updated order response:', updatedOrder[0].hydrotestData);
    if (updatedOrder[0].hydrotestData) {
      try {
        parsedHydrotestRecords = JSON.parse(updatedOrder[0].hydrotestData);
        console.log('Successfully parsed Hydrotest data in response:', parsedHydrotestRecords);
      } catch (e) {
        console.error('Error parsing Hydrotest data in response:', e);
      }
    } else {
      console.log('No Hydrotest data found in updated order response');
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
    
    // Parse Approved Drawing data for the response
    let parsedApprovedDrawingRecords = [];
    console.log('Checking for Approved Drawing data in updated order response:', updatedOrder[0].approvedDrawingData);
    if (updatedOrder[0].approvedDrawingData) {
      try {
        parsedApprovedDrawingRecords = JSON.parse(updatedOrder[0].approvedDrawingData);
        console.log('Successfully parsed Approved Drawing data in response:', parsedApprovedDrawingRecords);
      } catch (e) {
        console.error('Error parsing Approved Drawing data in response:', e);
      }
    } else {
      console.log('No Approved Drawing data found in updated order response');
    }
    
    // Parse DVR data for the response
    let parsedDvrRecords = [];
    console.log('Checking for DVR data in updated order response:', updatedOrder[0].dvrData);
    if (updatedOrder[0].dvrData) {
      try {
        parsedDvrRecords = JSON.parse(updatedOrder[0].dvrData);
        console.log('Successfully parsed DVR data in response:', parsedDvrRecords);
      } catch (e) {
        console.error('Error parsing DVR data in response:', e);
      }
    } else {
      console.log('No DVR data found in updated order response');
    }
    
    // Parse ITP data for the response
    let parsedItpRecords = [];
    console.log('Checking for ITP data in updated order response:', updatedOrder[0].itpData);
    if (updatedOrder[0].itpData) {
      try {
        parsedItpRecords = JSON.parse(updatedOrder[0].itpData);
        console.log('Successfully parsed ITP data in response:', parsedItpRecords);
      } catch (e) {
        console.error('Error parsing ITP data in response:', e);
      }
    } else {
      console.log('No ITP data found in updated order response');
    }
    
    // Return updated order with all records including Approved Drawing, DVR, and ITP records
    res.json({
      ...updatedOrder[0],
      materials: updatedMaterials,
      ndtRecords: parsedNdtRecords,
      visualRecords: parsedVisualRecords,
      welds: parsedWeldRecords,
      hydrotestRecords: parsedHydrotestRecords,
      ncrRecords: parsedNcrRecords,
      approvedDrawingRecords: parsedApprovedDrawingRecords,
      dvrRecords: parsedDvrRecords,
      itpRecords: parsedItpRecords
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