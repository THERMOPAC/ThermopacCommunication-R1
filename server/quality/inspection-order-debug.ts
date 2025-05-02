import { db } from '../db';
import { projects, projectItems, masterItems, inspectionOrders } from '@shared/schema';
import { eq, inArray, and } from 'drizzle-orm';

const debugInspectionOrderGeneration = async (projectId) => {
  console.log(`\n===== INSPECTION ORDER GENERATION DEBUG =====`);
  console.log(`Debugging inspection order generation for Project ID: ${projectId}`);
  
  try {
    // Check if project exists and is active
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      console.log(`ERROR: Project with ID ${projectId} not found`);
      return { success: false, error: 'Project not found' };
    }
    
    console.log(`Project details: ID ${project.id}, Code ${project.code}, Status: ${project.status}`);
    
    // Check project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    console.log(`Found ${projectItemsList.length} project items for project ${project.code}`);
    
    if (projectItemsList.length === 0) {
      console.log(`ERROR: No project items found for project ${project.code}`);
      return { success: false, error: 'No project items found' };
    }
    
    // Get master items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Found ${masterItemsArray.length} master items for project ${project.code}`);
    
    if (masterItemsArray.length === 0) {
      console.log(`ERROR: No master items found for project ${project.code}`);
      return { success: false, error: 'No master items found' };
    }
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Check if there are make and buy items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy';
    });
    
    console.log(`Found ${makeItems.length} Make items and ${buyItems.length} Buy items`);
    
    // List the first few make and buy items for reference
    if (makeItems.length > 0) {
      console.log(`\nSample Make items:`);
      makeItems.slice(0, 5).forEach(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`  - ID: ${item.id}, Master Item ID: ${item.itemId}, Code: ${masterItem?.itemCode}, Description: ${masterItem?.description}`);
      });
    }
    
    if (buyItems.length > 0) {
      console.log(`\nSample Buy items:`);
      buyItems.slice(0, 5).forEach(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`  - ID: ${item.id}, Master Item ID: ${item.itemId}, Code: ${masterItem?.itemCode}, Description: ${masterItem?.description}`);
      });
    }
    
    // Check existing inspection orders
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    console.log(`\nFound ${existingInspectionOrders.length} existing inspection orders for project ${project.code}`);
    
    // Check the status of the inspection orders
    const inspectionOrdersByStatus = {};
    existingInspectionOrders.forEach(order => {
      inspectionOrdersByStatus[order.status] = (inspectionOrdersByStatus[order.status] || 0) + 1;
    });
    
    console.log(`Inspection order status breakdown:`, inspectionOrdersByStatus);
    
    // Show project item IDs that have inspection orders
    const projectItemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        projectItemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    console.log(`\n${projectItemsWithInspectionOrders.size} project items already have inspection orders`);
    
    // Check how many make and buy items are filtered out
    const filteredMakeItems = makeItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    const filteredBuyItems = buyItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    
    console.log(`\nAfter filtering:
  - Make items: ${makeItems.length} total, ${filteredMakeItems.length} available for inspection orders
  - Buy items: ${buyItems.length} total, ${filteredBuyItems.length} available for inspection orders`);
    
    // Check master item IDs vs project item IDs
    const projectItemIds = new Set(projectItemsList.map(item => item.id));
    const inspectionOrderItemIds = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) inspectionOrderItemIds.add(order.itemId);
    });
    
    console.log(`\nProject item IDs available: ${projectItemIds.size}`);
    console.log(`Inspection order item IDs used: ${inspectionOrderItemIds.size}`);
    
    // Check for any inspection orders with invalid item IDs
    const invalidItemIds = Array.from(inspectionOrderItemIds).filter(id => !projectItemIds.has(id));
    if (invalidItemIds.length > 0) {
      console.log(`WARNING: Found ${invalidItemIds.length} inspection orders with invalid project item IDs:`, invalidItemIds);
    }
    
    // Check if project items have status
    const projectItemsWithStatus = projectItemsList.filter(item => item.status);
    const inactiveProjectItems = projectItemsList.filter(item => item.status && item.status !== 'active');
    
    console.log(`\nProject items with status: ${projectItemsWithStatus.length} of ${projectItemsList.length}`);
    if (inactiveProjectItems.length > 0) {
      console.log(`Inactive project items: ${inactiveProjectItems.length}`);
    }
    
    // Summary output
    if (filteredMakeItems.length === 0 && filteredBuyItems.length === 0) {
      console.log(`\nNo items available for inspection order generation.`);
      console.log(`Possible issues:`);
      console.log(`1. All items already have inspection orders.`);
      console.log(`2. No make/buy items found in project.`);
      console.log(`3. Filtering logic is incorrectly excluding valid items.`);
    } else {
      console.log(`\nItems are available for inspection order generation.`);
      console.log(`Expected to generate ${filteredMakeItems.length + filteredBuyItems.length} inspection orders.`);
    }
    
    console.log(`\n===== DEBUG COMPLETE =====`);
    
    return {
      success: true,
      project,
      projectItemsCount: projectItemsList.length,
      masterItemsCount: masterItemsArray.length,
      makeItemsCount: makeItems.length,
      buyItemsCount: buyItems.length,
      availableMakeItemsCount: filteredMakeItems.length,
      availableBuyItemsCount: filteredBuyItems.length,
      existingOrdersCount: existingInspectionOrders.length,
      availableForOrders: filteredMakeItems.length + filteredBuyItems.length > 0
    };
    
  } catch (error) {
    console.error(`Error during debug:`, error);
    return { success: false, error: error.message };
  }
};

const inspectionOrderDebugAPIRoute = async (req: any, res: any) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Run the debug function
    const result = await debugInspectionOrderGeneration(projectId);
    
    return res.status(200).json({
      message: 'Debug completed. Check server logs for detailed output.',
      projectId,
      results: result
    });
  } catch (error) {
    console.error('Error during inspection order debug:', error);
    return res.status(500).json({ 
      error: 'Error during inspection order debug', 
      details: error.message 
    });
  }
};

export {
  debugInspectionOrderGeneration,
  inspectionOrderDebugAPIRoute
};