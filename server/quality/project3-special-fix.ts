import { Request, Response } from 'express';
import { db } from '../db';
import { projects, projectItems, masterItems, inspectionOrders, inspectionOrderItems, users } from '@shared/schema';
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
    
    // 10. Prepare for orders generation
    const createdInspectionOrders = [];
    const createdInspectionOrderItems = [];
    let nextSeqNumber = existingInspectionOrders.length > 0 
      ? Math.max(...existingInspectionOrders.map(order => order.sequenceNumber || 0)) + 1 
      : 1;
    
    // 11. Generate orders for Make items
    if (makeItems.length > 0) {
      console.log(`Creating ${makeItems.length} make inspection orders`);
      
      for (const [index, item] of makeItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        if (!masterItem) continue;
        
        // Generate order number
        const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-${index + 1}`;
        
        // Extract drawing number from master item or item code
        let drawingNumber = masterItem.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
        if (!drawingNumber && masterItem.itemCode) {
          const itemCode = masterItem.itemCode;
          if (/^\d+$/.test(itemCode)) {
            // For numeric drawing numbers, use as-is
            drawingNumber = itemCode;
          } else if (itemCode.includes('-')) {
            // For alpha-numeric with hyphens, extract the part before the last segment
            const parts = itemCode.split('-');
            if (parts.length >= 2) {
              drawingNumber = parts.slice(0, -1).join('-');
            } else {
              drawingNumber = itemCode;
            }
          } else {
            // If no hyphen, use as-is
            drawingNumber = itemCode;
          }
        }
        
        // Create inspection order
        const makeOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: makeInspectionOrderNumber,
          title: `Make Item Inspection - ${masterItem.itemCode || 'Unknown'}`,
          description: masterItem.description || 'No description',
          status: 'pending',
          inspectionType: 'in-process',
          quantity: Number(item.quantity) || 1,
          unit: masterItem.uom || 'EA',
          makeOrBuy: 'Make',
          itemId: item.id,
          itemCode: masterItem.itemCode || 'Unknown',
          drawingNo: drawingNumber,
          sequenceNumber: nextSeqNumber + index,
          createdBy: userId
        }).returning();
        
        if (makeOrder && makeOrder.length > 0) {
          createdInspectionOrders.push(makeOrder[0]);
          
          // Create inspection order item
          const orderItem = await db.insert(inspectionOrderItems).values({
            inspectionOrderId: makeOrder[0].id,
            itemId: item.id,
            itemCode: masterItem.itemCode || 'Unknown',
            description: masterItem.description || 'No description',
            quantity: Number(item.quantity) || 1,
            unit: masterItem.uom || 'EA',
            makeOrBuy: 'Make',
            sequenceNumber: 1 // Only one item per order
          }).returning();
          
          if (orderItem && orderItem.length > 0) {
            createdInspectionOrderItems.push(orderItem[0]);
          }
        }
      }
    }
    
    // 12. Generate orders for Buy items
    if (buyItems.length > 0) {
      console.log(`Creating ${buyItems.length} buy inspection orders`);
      
      for (const [index, item] of buyItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        if (!masterItem) continue;
        
        // Generate order number
        const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-${index + 1}`;
        
        // Extract drawing number from master item or item code
        let drawingNumber = masterItem.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
        if (!drawingNumber && masterItem.itemCode) {
          const itemCode = masterItem.itemCode;
          if (/^\d+$/.test(itemCode)) {
            // For numeric drawing numbers, use as-is
            drawingNumber = itemCode;
          } else if (itemCode.includes('-')) {
            // For alpha-numeric with hyphens, extract the part before the last segment
            const parts = itemCode.split('-');
            if (parts.length >= 2) {
              drawingNumber = parts.slice(0, -1).join('-');
            } else {
              drawingNumber = itemCode;
            }
          } else {
            // If no hyphen, use as-is
            drawingNumber = itemCode;
          }
        }
        
        // Create inspection order
        const buyOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: buyInspectionOrderNumber,
          title: `Buy Item Inspection - ${masterItem.itemCode || 'Unknown'}`,
          description: masterItem.description || 'No description',
          status: 'pending',
          inspectionType: 'incoming',
          quantity: Number(item.quantity) || 1,
          unit: masterItem.uom || 'EA',
          makeOrBuy: 'Buy',
          itemId: item.id,
          itemCode: masterItem.itemCode || 'Unknown',
          drawingNo: drawingNumber,
          sequenceNumber: nextSeqNumber + makeItems.length + index,
          createdBy: userId
        }).returning();
        
        if (buyOrder && buyOrder.length > 0) {
          createdInspectionOrders.push(buyOrder[0]);
          
          // Create inspection order item
          const orderItem = await db.insert(inspectionOrderItems).values({
            inspectionOrderId: buyOrder[0].id,
            itemId: item.id,
            itemCode: masterItem.itemCode || 'Unknown',
            description: masterItem.description || 'No description',
            quantity: Number(item.quantity) || 1,
            unit: masterItem.uom || 'EA',
            makeOrBuy: 'Buy',
            sequenceNumber: 1 // Only one item per order
          }).returning();
          
          if (orderItem && orderItem.length > 0) {
            createdInspectionOrderItems.push(orderItem[0]);
          }
        }
      }
    }
    
    // 13. Respond with results
    return res.status(200).json({
      success: true,
      message: `Created ${createdInspectionOrders.length} inspection orders successfully (SPECIAL FIX)`,
      ordersCreated: createdInspectionOrders.length,
      itemsCreated: createdInspectionOrderItems.length,
      makeItemCount: makeItems.length,
      buyItemCount: buyItems.length
    });
    
  } catch (error: any) {
    console.error('Error in special fix for Project 3:', error);
    return res.status(500).json({
      error: 'Failed to generate inspection orders',
      details: error.message
    });
  }
};