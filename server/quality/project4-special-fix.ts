import { db } from '../db';
import { Request, Response } from 'express';
import {
  eq,
  and,
  inArray,
  desc,
  asc,
  isNull,
  sql,
  or
} from 'drizzle-orm';
import {
  projects,
  projectItems,
  masterItems,
  workOrders,
  workOrderItems,
  inspectionOrders,
  inspectionOrderItems
} from '../../shared/schema';

/**
 * Special fix for generating inspection orders for Project 2025-2 (ID 4)
 * This handles decimal quantities and special cases for this specific project
 */
export const generateInspectionOrdersForProject4 = async (req: Request, res: Response) => {
  try {
    console.log('== SPECIAL FIX FOR PROJECT 4 (2025-2) - EXECUTION MODE ==');
    const projectId = 4; // Hard-coded project ID
    const userId = req.user?.id || 0;
    
    // 1. Get project info
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Extract year and project number from project code (e.g., "2025-2")
    const projectCodeParts = project.code.split('-');
    const year = projectCodeParts[0] || '2025';
    const projectNumber = projectCodeParts[1] || '2';
    
    console.log(`Working with project: ${project.name} (${project.code})`);
    
    // 2. Get all project items for this project
    const projectItemsList = await db.select().from(projectItems)
      .where(eq(projectItems.projectId, projectId));
    
    if (projectItemsList.length === 0) {
      return res.status(404).json({ error: 'No project items found for this project' });
    }
    
    console.log(`Found ${projectItemsList.length} project items for the project`);
    
    // 3. Get all master items for the project items
    const masterItemIds = projectItemsList.map(item => item.itemId).filter(Boolean);
    
    const masterItemsList = await db.select().from(masterItems)
      .where(inArray(masterItems.id, masterItemIds));
    
    // Create a map for quick lookup of master items
    const masterItemsMap = new Map();
    for (const masterItem of masterItemsList) {
      masterItemsMap.set(masterItem.id, masterItem);
    }
    
    console.log(`Found ${masterItemsList.length} master items for the project items`);
    
    // 4. Categorize items into 'Make' and 'Buy'
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem && masterItem.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem && masterItem.makeOrBuy === 'Buy';
    });
    
    console.log(`Categorized ${makeItems.length} 'Make' items and ${buyItems.length} 'Buy' items`);
    
    // 5. Get the next inspection order sequence number
    const existingOrders = await db.select().from(inspectionOrders)
      .where(eq(inspectionOrders.projectId, projectId))
      .orderBy(desc(inspectionOrders.sequenceNumber));
    
    const nextSeqNumber = existingOrders.length > 0
      ? Math.max(...existingOrders.map(order => order.sequenceNumber || 0)) + 1
      : 1;
    
    console.log(`Next sequence number for inspection orders: ${nextSeqNumber}`);
    
    // 6. Get max order number to ensure unique order numbers
    const [maxOrder] = await db.select({
      maxNumber: sql<number>`MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(${inspectionOrders.inspectionOrderNumber}, '-', -1), '-', 1) AS UNSIGNED))`
    }).from(inspectionOrders)
      .where(and(
        eq(inspectionOrders.projectCode, project.code)
      ));
    
    const maxOrderNumber = maxOrder?.maxNumber || 0;
    console.log(`Max order number for this project: ${maxOrderNumber}`);
    
    // 7. Prepare to create inspection orders
    const createdInspectionOrders = [];
    const createdInspectionOrderItems = [];
    
    // 8. Generate orders for Make items
    if (makeItems.length > 0) {
      console.log(`Creating ${makeItems.length} make inspection orders`);
      
      for (const [index, item] of makeItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        if (!masterItem) continue;
        
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
        
        // Parse quantity and ensure it's an integer
        const parsedQuantity = parseInt(String(item.quantity)) || 1;
        
        // Create a unique inspection order number with maxOrderNumber + index
        const orderSequence = maxOrderNumber + index + 1;
        const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-${orderSequence}`;
        
        // Create inspection order
        const makeOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: makeInspectionOrderNumber,
          title: `Make Item Inspection - ${masterItem.itemCode || 'Unknown'}`,
          description: masterItem.description || 'No description',
          status: 'pending',
          inspectionType: 'in-process',
          quantity: parsedQuantity,
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
          
          // Create inspection order item with parsed quantity
          const orderItem = await db.insert(inspectionOrderItems).values({
            inspectionOrderId: makeOrder[0].id,
            itemId: item.id,
            itemCode: masterItem.itemCode || 'Unknown',
            description: masterItem.description || 'No description',
            quantity: parsedQuantity,
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
    
    // 9. Generate orders for Buy items
    if (buyItems.length > 0) {
      console.log(`Creating ${buyItems.length} buy inspection orders`);
      
      for (const [index, item] of buyItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        if (!masterItem) continue;
        
        // Parse quantity and ensure it's an integer
        const parsedQuantity = parseInt(String(item.quantity)) || 1;
        
        // Create a unique inspection order number with maxOrderNumber + makeItems.length + index
        const orderSequence = maxOrderNumber + makeItems.length + index + 1;
        const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-${orderSequence}`;
        
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
          quantity: parsedQuantity,
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
            quantity: parsedQuantity,
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
    
    // 10. Respond with results
    return res.status(200).json({
      success: true,
      message: `Created ${createdInspectionOrders.length} inspection orders successfully (SPECIAL FIX for 2025-2)`,
      ordersCreated: createdInspectionOrders.length,
      itemsCreated: createdInspectionOrderItems.length,
      makeItemCount: makeItems.length,
      buyItemCount: buyItems.length
    });
    
  } catch (error: any) {
    console.error('Error in special fix for Project 4:', error);
    return res.status(500).json({
      error: 'Failed to generate inspection orders',
      details: error.message
    });
  }
};