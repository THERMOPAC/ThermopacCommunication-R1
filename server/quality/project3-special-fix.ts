import { Request, Response } from 'express';
import { db } from '../db';
import { projects, projectItems, masterItems, inspectionOrders, inspectionOrderItems, users } from '@shared/schema';
import { eq, inArray, and, desc, sql } from 'drizzle-orm';

// Define shared type for preview items
interface PreviewItem {
  sequenceNumber: number;
  itemCode: string;
  description: string;
  quantity: number;
  unit: string;
  makeOrBuy: string;
  itemType: 'Parent' | 'Child';
  parentItemCode: string | null;
  isVirtual?: boolean;
}

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
      
    // CRITICAL: Create a set of PROJECT ITEM IDs that already have inspection orders
    // This prevents duplicate inspection orders for the same items
    const projectItemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        projectItemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    // Filter out items that already have inspection orders
    const filteredMakeItems = makeItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    const filteredBuyItems = buyItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    
    console.log(`After filtering: ${filteredMakeItems.length} of ${makeItems.length} make items and ${filteredBuyItems.length} of ${buyItems.length} buy items will be processed`);
    
    // 11. Generate orders for Make items
    if (filteredMakeItems.length > 0) {
      console.log(`Creating ${filteredMakeItems.length} make inspection orders`);
      
      for (const [index, item] of filteredMakeItems.entries()) {
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
    
    // 12. Generate orders for Buy items
    if (filteredBuyItems.length > 0) {
      console.log(`Creating ${filteredBuyItems.length} buy inspection orders`);
      
      for (const [index, item] of filteredBuyItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        if (!masterItem) continue;
        
        // Parse quantity and ensure it's an integer
        const parsedQuantity = parseInt(String(item.quantity)) || 1;
        
        // Create a unique inspection order number with maxOrderNumber + filteredMakeItems.length + index
        const orderSequence = maxOrderNumber + filteredMakeItems.length + index + 1;
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
          sequenceNumber: nextSeqNumber + filteredMakeItems.length + index,
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
    
    // 13. Respond with results
    return res.status(200).json({
      success: true,
      message: `Created ${createdInspectionOrders.length} inspection orders successfully (SPECIAL FIX)`,
      ordersCreated: createdInspectionOrders.length,
      itemsCreated: createdInspectionOrderItems.length,
      makeItemCount: {
        total: makeItems.length,
        processed: filteredMakeItems.length,
        skipped: makeItems.length - filteredMakeItems.length
      },
      buyItemCount: {
        total: buyItems.length,
        processed: filteredBuyItems.length,
        skipped: buyItems.length - filteredBuyItems.length
      }
    });
    
  } catch (error: any) {
    console.error('Error in special fix for Project 3:', error);
    return res.status(500).json({
      error: 'Failed to generate inspection orders',
      details: error.message
    });
  }
};

/**
 * Preview inspection orders for Project 3 (2025-1)
 * This function generates a preview of the inspection orders that would be created,
 * allowing the user to confirm before actually creating them.
 */
export const previewInspectionOrdersForProject3 = async (req: Request, res: Response) => {
  console.log('== SPECIAL FIX PREVIEW FOR PROJECT 3 (2025-1) INITIATED ==');
  
  try {
    // 1. Get project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, 3)
    });
    
    if (!project) {
      console.log('Project ID 3 not found');
      return res.status(404).json({ error: 'Project not found' });
    }
    
    console.log(`Project preview: ${project.code} (${project.name}) - Status: ${project.status}`);
    
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
    
    console.log(`Preview found ${projectItemsList.length} project items`);
    
    // 3. Get master items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Preview found ${masterItemsArray.length} master items`);
    
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
    
    console.log(`Preview found ${makeItems.length} Make items and ${buyItems.length} Buy items`);
    
    // 6. Get existing inspection orders
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, 3)
    });
    
    console.log(`Preview found ${existingInspectionOrders.length} existing inspection orders`);
    
    // CRITICAL: Create a set of PROJECT ITEM IDs that already have inspection orders
    const projectItemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        projectItemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    // 7. Filter out items that already have inspection orders
    const filteredMakeItems = makeItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    const filteredBuyItems = buyItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    
    console.log(`Preview after filtering: ${filteredMakeItems.length} of ${makeItems.length} make items and ${filteredBuyItems.length} of ${buyItems.length} buy items available`);
    
    // 8. Map items to preview format
    const mapItemsToPreview = (items: any[], isParent: boolean): PreviewItem[] => {
      return items.map((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        return {
          sequenceNumber: index + 1,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: Number(item.quantity),
          unit: masterItem?.uom || 'EA',
          makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
          itemType: isParent ? 'Parent' : 'Child',
          parentItemCode: null
        };
      });
    };
    
    const makeItemPreviewItems = mapItemsToPreview(filteredMakeItems, true);
    const buyItemPreviewItems = mapItemsToPreview(filteredBuyItems, true);
    
    // 9. Generate sample inspection order numbers for preview
    const projectCodeParts = project.code.split('-');
    const year = projectCodeParts[0];
    const projectNumber = projectCodeParts[1];
    
    // Format for individual orders
    const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-[1..${filteredMakeItems.length}]`;
    const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-[1..${filteredBuyItems.length}]`;
    
    // Combine all preview items
    const allPreviewItems = [
      ...makeItemPreviewItems,
      ...buyItemPreviewItems
    ];
    
    if (allPreviewItems.length === 0) {
      console.log('SPECIAL FIX PREVIEW: No items available for inspection order generation.');
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'No new inspection orders need to be generated for this project',
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        itemCount: 0,
        makeItemCount: 0,
        buyItemCount: 0,
        componentCount: 0,
        items: [],
        noItemsToDisplay: true,
        existingInspectionOrderCount: existingInspectionOrders.length
      });
    }
    
    console.log(`SPECIAL FIX PREVIEW: Generated ${allPreviewItems.length} preview items for inspection orders`);
    
    return res.status(200).json({
      requiresConfirmation: true,
      message: 'Please confirm to generate inspection orders',
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status
      },
      itemCount: allPreviewItems.length,
      makeItemCount: filteredMakeItems.length,
      buyItemCount: filteredBuyItems.length,
      componentCount: 0,
      makeInspectionOrderNumber,
      buyInspectionOrderNumber,
      items: allPreviewItems,
      willCreateSeparateOrders: (filteredMakeItems.length > 0 && filteredBuyItems.length > 0),
      willCreateIndividualOrders: true,
      totalOrderCount: filteredMakeItems.length + filteredBuyItems.length,
      newItemsFound: true,
      existingInspectionOrderCount: existingInspectionOrders.length
    });
    
  } catch (error: any) {
    console.error('Error in Project 3 special fix preview:', error);
    return res.status(500).json({ 
      error: 'Error generating inspection orders preview for Project 3',
      details: error.message
    });
  }
};