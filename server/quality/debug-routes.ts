import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { inspectionOrderDebugAPIRoute } from './inspection-order-debug';
import { db } from '../db';
import { projects, projectItems, masterItems, inspectionOrders } from '@shared/schema';
import { eq, inArray, and } from 'drizzle-orm';

const debugRouter = Router();

/**
 * Debug inspection order generation for a project
 */
debugRouter.get('/inspection-orders/debug/:projectId', ensureAuthenticated, inspectionOrderDebugAPIRoute);

/**
 * Special debug endpoint for project 2025-1 (project ID 3)
 */
debugRouter.get('/inspection-orders/debug-project-3', ensureAuthenticated, async (req: Request, res: Response) => {
  console.log('Running special debug for project 2025-1 (ID 3)');
  
  try {
    // Get project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, 3)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project with ID 3 not found' });
    }
    
    console.log(`Project details:`, project);
    
    // Get project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, 3)
    });
    
    console.log(`Found ${projectItemsList.length} project items for project 3 (${project.code})`);
    
    // Get master item IDs
    const masterItemIds = projectItemsList.map(item => item.itemId);
    
    // Get master items
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Found ${masterItemsArray.length} master items linked to project items`);
    
    // Create item maps for analysis
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Check for Make/Buy items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy';
    });
    
    const unknownItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return !masterItem || (masterItem.makeOrBuy !== 'Make' && masterItem.makeOrBuy !== 'Buy');
    });
    
    console.log(`Make items: ${makeItems.length}`);
    console.log(`Buy items: ${buyItems.length}`);
    console.log(`Unknown MakeOrBuy: ${unknownItems.length}`);
    
    if (unknownItems.length > 0) {
      console.log('First 5 unknown items:');
      unknownItems.slice(0, 5).forEach(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`- Project Item ID: ${item.id}, Master Item ID: ${item.itemId}`);
        console.log(`  Master Item exists: ${masterItem ? 'YES' : 'NO'}`);
        if (masterItem) {
          console.log(`  Master Item Code: ${masterItem.itemCode}`);
          console.log(`  Master Item Make/Buy: ${masterItem.makeOrBuy || 'NULL'}`);
        }
      });
    }
    
    // Check existing inspection orders
    const existingOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, 3)
    });
    
    console.log(`Existing inspection orders: ${existingOrders.length}`);
    
    // Return debug results
    return res.status(200).json({
      project,
      projectItemsCount: projectItemsList.length,
      masterItemsCount: masterItemsArray.length,
      makeItemsCount: makeItems.length,
      buyItemsCount: buyItems.length,
      unknownItemsCount: unknownItems.length,
      existingOrdersCount: existingOrders.length,
      makeItemsAvailable: makeItems.length > 0,
      buyItemsAvailable: buyItems.length > 0,
      sampleMasterItems: masterItemsArray.slice(0, 5),
      sampleMakeItems: makeItems.slice(0, 5).map(item => ({
        projectItemId: item.id,
        masterItemId: item.itemId,
        masterItemCode: masterItemsMap.get(item.itemId)?.itemCode,
        makeOrBuy: masterItemsMap.get(item.itemId)?.makeOrBuy
      })),
      sampleBuyItems: buyItems.slice(0, 5).map(item => ({
        projectItemId: item.id,
        masterItemId: item.itemId,
        masterItemCode: masterItemsMap.get(item.itemId)?.itemCode,
        makeOrBuy: masterItemsMap.get(item.itemId)?.makeOrBuy
      }))
    });
  } catch (error: any) {
    console.error('Error in debug-project-3:', error);
    return res.status(500).json({ 
      error: 'Debug failed', 
      details: error.message,
      stack: error.stack
    });
  }
});

export default debugRouter;