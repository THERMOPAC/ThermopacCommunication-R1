import { Request, Response } from 'express';
import { db } from '../db';
import { projects, projectItems, masterItems, inspectionOrders, users } from '@shared/schema';
import { eq, inArray, and, desc, sql } from 'drizzle-orm';

/**
 * Special fix function for Project ID 3 (2025-1)
 * This function is designed to work around the issue with inspection order generation
 * for this specific project.
 */
export const generateInspectionOrdersForProject3 = async (req: Request, res: Response) => {
  console.log('== SPECIAL FIX FOR PROJECT 3 (2025-1) INITIATED ==');
  
  try {
    // 1. Get project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, 3)
    });
    
    if (!project) {
      console.log('Project ID 3 not found');
      return res.status(404).json({ error: 'Project not found' });
    }
    
    console.log(`Project found: ${project.code} (${project.name}) - Status: ${project.status}`);
    
    if (project.status !== 'active') {
      console.log(`Project status is not active: ${project.status}`);
      return res.status(400).json({ 
        error: 'Project is not active',
        status: project.status
      });
    }
    
    // 2. Get project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, 3)
    });
    
    if (projectItemsList.length === 0) {
      console.log('No project items found');
      return res.status(404).json({ error: 'No project items found' });
    }
    
    console.log(`Found ${projectItemsList.length} project items`);
    
    // 3. Get master items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Found ${masterItemsArray.length} master items`);
    
    if (masterItemsArray.length === 0) {
      console.log('No master items found');
      return res.status(404).json({ error: 'No master items found' });
    }
    
    // 4. Create map for fast lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // 5. Check make/buy items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy';
    });
    
    console.log(`Found ${makeItems.length} Make items and ${buyItems.length} Buy items`);
    
    // 6. Get existing inspection orders
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, 3)
    });
    
    console.log(`Found ${existingInspectionOrders.length} existing inspection orders`);
    
    // 7. Get current user
    const userId = req.user?.id || 1; // Default to user ID 1 if not found
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });
    
    const createdBy = user?.username || 'System';
    
    // 8. Get max inspection order number
    let maxOrderNumber = 0;
    if (existingInspectionOrders.length > 0) {
      // Find the highest IO number to generate sequential numbers
      for (const order of existingInspectionOrders) {
        const match = order.inspectionOrderNumber.match(/IO-\d+-\d+-[MB]-(\d+)/);
        if (match && match[1]) {
          const orderNum = parseInt(match[1]);
          if (orderNum > maxOrderNumber) {
            maxOrderNumber = orderNum;
          }
        }
      }
    }
    
    console.log(`Current max order number: ${maxOrderNumber}`);
    
    // 9. Generate new inspection orders
    const projectCodeParts = project.code.split('-');
    const year = projectCodeParts[0];
    const projectNumber = projectCodeParts[1];
    
    // 10. Prepare items sets with any filtering needed
    // For this special fix, we're not filtering based on existing orders
    
    // 11. Generate inspection orders
    const generatedOrders = [];
    let orderCounter = maxOrderNumber;
    
    // Generate for Make items
    for (const item of makeItems) {
      const masterItem = masterItemsMap.get(item.itemId);
      if (!masterItem) continue;
      
      orderCounter++;
      
      const orderNumber = `IO-${year}-${projectNumber}-M-${orderCounter}`;
      
      // Create inspection order record
      const newOrder = {
        projectId: project.id,
        ioNumber: orderNumber,
        status: 'draft',
        itemId: item.id,
        itemCode: masterItem.itemCode,
        description: masterItem.description,
        createdBy,
        createdAt: new Date(),
      };
      
      generatedOrders.push(newOrder);
    }
    
    // Generate for Buy items
    for (const item of buyItems) {
      const masterItem = masterItemsMap.get(item.itemId);
      if (!masterItem) continue;
      
      orderCounter++;
      
      const orderNumber = `IO-${year}-${projectNumber}-B-${orderCounter}`;
      
      // Create inspection order record
      const newOrder = {
        projectId: project.id,
        ioNumber: orderNumber,
        status: 'draft',
        itemId: item.id,
        itemCode: masterItem.itemCode,
        description: masterItem.description,
        createdBy,
        createdAt: new Date(),
      };
      
      generatedOrders.push(newOrder);
    }
    
    console.log(`Generated ${generatedOrders.length} new inspection orders`);
    
    // 12. Insert the new orders
    if (generatedOrders.length > 0) {
      const result = await db.insert(inspectionOrders).values(generatedOrders);
      console.log(`Database insert result:`, result);
      
      return res.status(200).json({
        success: true,
        message: `Successfully generated ${generatedOrders.length} inspection orders`,
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        generatedCount: generatedOrders.length,
        makeItemCount: makeItems.length,
        buyItemCount: buyItems.length
      });
    } else {
      return res.status(200).json({
        success: false,
        message: 'No inspection orders were generated',
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        }
      });
    }
    
  } catch (error: any) {
    console.error('Error in special fix for Project 3:', error);
    return res.status(500).json({
      error: 'Failed to generate inspection orders',
      details: error.message
    });
  }
};