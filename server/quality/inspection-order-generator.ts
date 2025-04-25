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

// Type for the data sent to the preview
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
 * Generate a preview of inspection orders for a project
 */
export const previewInspectionOrders = async (req: Request, res: Response) => {
  const projectId = parseInt(req.params.projectId);
  
  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  
  try {
    // Fetch project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    console.log(`Generating inspection orders preview for project ${projectId}: ${project.code}`);
    
    // Fetch all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (!projectItemsList.length) {
      return res.status(404).json({ error: 'No project items found for this project' });
    }
    
    console.log(`Found ${projectItemsList.length} project items`);
    
    // Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Found ${masterItemsArray.length} master items`);
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get existing inspection orders for this project to avoid duplicates
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    console.log(`Found ${existingInspectionOrders.length} existing inspection orders`);
    
    // Get existing inspection order items
    const existingInspectionOrderIds = existingInspectionOrders.map(order => order.id);
    let existingInspectionOrderItems = [];
    
    if (existingInspectionOrderIds.length > 0) {
      existingInspectionOrderItems = await db.query.inspectionOrderItems.findMany({
        where: inArray(inspectionOrderItems.inspectionOrderId, existingInspectionOrderIds)
      });
      console.log(`Found ${existingInspectionOrderItems.length} existing inspection order items`);
    }
    
    // Create a set of item IDs that already have inspection orders
    const itemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        itemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    // Separate items into parent "Make" items and "Buy" items
    const makeParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make' && !item.parentItemId;
    });
    
    const buyParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy' && !item.parentItemId;
    });
    
    // Find all child components for the Make items
    // Create a map of parent to children for faster lookups
    const parentToChildrenMap = new Map();
    const childToParentMap = new Map();
    
    projectItemsList.forEach(item => {
      if (item.parentItemId) {
        if (!parentToChildrenMap.has(item.parentItemId)) {
          parentToChildrenMap.set(item.parentItemId, []);
        }
        parentToChildrenMap.get(item.parentItemId).push(item);
        childToParentMap.set(item.id, item.parentItemId);
      }
    });
    
    // Function to get all descendants of a parent item
    const getAllDescendants = (parentItemId: number, depth = 0): any[] => {
      const children = parentToChildrenMap.get(parentItemId) || [];
      let allDescendants = [...children];
      
      for (const child of children) {
        const grandchildren = getAllDescendants(child.id, depth + 1);
        allDescendants = [...allDescendants, ...grandchildren];
      }
      
      return allDescendants;
    };
    
    // Get all component items including nested ones
    let allComponentItems = [];
    for (const makeItem of makeParentItems) {
      const descendants = getAllDescendants(makeItem.id);
      allComponentItems = [...allComponentItems, ...descendants];
    }
    
    // Filter out items that already have inspection orders
    const filteredMakeParentItems = makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.id));
    const filteredBuyParentItems = buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.id));
    const filteredComponentItems = allComponentItems.filter(item => !itemsWithInspectionOrders.has(item.id));
    
    console.log(`After filtering: ${filteredMakeParentItems.length} make parents, ${filteredBuyParentItems.length} buy parents, ${filteredComponentItems.length} components`);
    
    // If no new items to inspect, return appropriate message
    if (filteredMakeParentItems.length === 0 && filteredBuyParentItems.length === 0 && filteredComponentItems.length === 0) {
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'No new inspection orders need to be generated for this project',
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        itemCount: 0,
        makeParentCount: 0,
        buyParentCount: 0,
        componentCount: 0,
        items: [],
        noItemsToDisplay: true,
        existingInspectionOrderCount: existingInspectionOrders.length
      });
    }
    
    // Map items to preview format
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
          parentItemCode: isParent ? null : (
            masterItemsMap.get(childToParentMap.get(item.id))?.itemCode || 'Unknown'
          )
        };
      });
    };
    
    const makeParentPreviewItems = mapItemsToPreview(filteredMakeParentItems, true);
    const buyParentPreviewItems = mapItemsToPreview(filteredBuyParentItems, true);
    const componentPreviewItems = mapItemsToPreview(filteredComponentItems, false);
    
    // Generate sample inspection order numbers for preview
    const nextSeqNumber = existingInspectionOrders.length + 1;
    const makeInspectionOrderNumber = `IO-${project.code}-M-${nextSeqNumber}`;
    const buyInspectionOrderNumber = `IO-${project.code}-B-${nextSeqNumber + 1}`;
    const componentInspectionOrderNumber = `IO-${project.code}-C-${nextSeqNumber + 2}`;
    
    // Combine all preview items
    const allPreviewItems = [
      ...makeParentPreviewItems,
      ...buyParentPreviewItems,
      ...componentPreviewItems
    ];
    
    return res.status(200).json({
      requiresConfirmation: true,
      message: 'Please confirm to generate inspection orders',
      project: {
        id: project.id,
        code: project.code,
        name: project.name
      },
      itemCount: allPreviewItems.length,
      makeParentCount: filteredMakeParentItems.length,
      buyParentCount: filteredBuyParentItems.length,
      componentCount: filteredComponentItems.length,
      makeInspectionOrderNumber,
      buyInspectionOrderNumber,
      componentInspectionOrderNumber,
      items: allPreviewItems,
      willCreateSeparateOrders: 
        (filteredMakeParentItems.length > 0 || filteredBuyParentItems.length > 0) && 
        filteredComponentItems.length > 0,
      newItemsFound: true,
      existingInspectionOrderCount: existingInspectionOrders.length
    });
    
  } catch (error) {
    console.error('Error generating inspection orders preview:', error);
    return res.status(500).json({ 
      error: 'Failed to generate inspection orders preview',
      details: error.message 
    });
  }
};

/**
 * Generate inspection orders for a project
 */
export const generateInspectionOrders = async (req: Request, res: Response) => {
  const projectId = parseInt(req.params.projectId);
  const { confirm = false, newItemsOnly = true } = req.body;
  
  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  
  try {
    // If not confirmed, run the preview to show what would be created
    if (!confirm) {
      return previewInspectionOrders(req, res);
    }
    
    // Fetch project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    console.log(`Generating inspection orders for project ${projectId}: ${project.code} (confirmed)`);
    
    // Fetch all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (!projectItemsList.length) {
      return res.status(404).json({ error: 'No project items found for this project' });
    }
    
    // Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get existing inspection orders for this project to avoid duplicates
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    // Create a set of item IDs that already have inspection orders
    const itemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        itemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    // Separate items into parent "Make" items and "Buy" items
    const makeParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make' && !item.parentItemId;
    });
    
    const buyParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy' && !item.parentItemId;
    });
    
    // Find all child components for the Make items
    // Create a map of parent to children for faster lookups
    const parentToChildrenMap = new Map();
    const childToParentMap = new Map();
    
    projectItemsList.forEach(item => {
      if (item.parentItemId) {
        if (!parentToChildrenMap.has(item.parentItemId)) {
          parentToChildrenMap.set(item.parentItemId, []);
        }
        parentToChildrenMap.get(item.parentItemId).push(item);
        childToParentMap.set(item.id, item.parentItemId);
      }
    });
    
    // Function to get all descendants of a parent item
    const getAllDescendants = (parentItemId: number, depth = 0): any[] => {
      const children = parentToChildrenMap.get(parentItemId) || [];
      let allDescendants = [...children];
      
      for (const child of children) {
        const grandchildren = getAllDescendants(child.id, depth + 1);
        allDescendants = [...allDescendants, ...grandchildren];
      }
      
      return allDescendants;
    };
    
    // Get all component items including nested ones
    let allComponentItems = [];
    for (const makeItem of makeParentItems) {
      const descendants = getAllDescendants(makeItem.id);
      allComponentItems = [...allComponentItems, ...descendants];
    }
    
    // Filter out items that already have inspection orders if newItemsOnly is true
    const filteredMakeParentItems = newItemsOnly ? 
      makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      makeParentItems;
      
    const filteredBuyParentItems = newItemsOnly ? 
      buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      buyParentItems;
      
    const filteredComponentItems = newItemsOnly ? 
      allComponentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      allComponentItems;
    
    // Arrays to store created inspection orders
    const createdInspectionOrders = [];
    const createdInspectionOrderItems = [];
    const skippedItemCount = newItemsOnly ? 
      (makeParentItems.length + buyParentItems.length + allComponentItems.length) - 
      (filteredMakeParentItems.length + filteredBuyParentItems.length + filteredComponentItems.length) : 
      0;
    
    // Generate unique inspection order numbers
    const nextSeqNumber = existingInspectionOrders.length + 1;
    
    // Create inspection orders for Make parent items
    if (filteredMakeParentItems.length > 0) {
      const makeInspectionOrderNumber = `IO-${project.code}-M-${nextSeqNumber}`;
      
      // Create parent inspection order
      const makeParentOrder = await db.insert(inspectionOrders).values({
        projectId: project.id,
        projectCode: project.code,
        inspectionOrderNumber: makeInspectionOrderNumber,
        title: `Make Items Inspection - ${project.code}`,
        description: `Inspection order for Make items in project ${project.code}`,
        status: 'pending',
        inspectionType: 'in-process',
        quantity: filteredMakeParentItems.length,
        unit: 'Nos',
        makeOrBuy: 'Make',
        sequenceNumber: nextSeqNumber,
        createdBy: req.user.id
      }).returning();
      
      createdInspectionOrders.push(makeParentOrder[0]);
      
      // Create individual inspection order items for each make item
      for (const [index, item] of filteredMakeParentItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        
        // Create inspection order item
        const orderItem = await db.insert(inspectionOrderItems).values({
          inspectionOrderId: makeParentOrder[0].id,
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: item.quantity,
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Make',
          sequenceNumber: index + 1
        }).returning();
        
        createdInspectionOrderItems.push(orderItem[0]);
      }
    }
    
    // Create inspection orders for Buy parent items
    if (filteredBuyParentItems.length > 0) {
      const buyInspectionOrderNumber = `IO-${project.code}-B-${nextSeqNumber + 1}`;
      
      // Create parent inspection order
      const buyParentOrder = await db.insert(inspectionOrders).values({
        projectId: project.id,
        projectCode: project.code,
        inspectionOrderNumber: buyInspectionOrderNumber,
        title: `Buy Items Inspection - ${project.code}`,
        description: `Inspection order for Buy items in project ${project.code}`,
        status: 'pending',
        inspectionType: 'incoming',
        quantity: filteredBuyParentItems.length,
        unit: 'Nos',
        makeOrBuy: 'Buy',
        sequenceNumber: nextSeqNumber + 1,
        createdBy: req.user.id
      }).returning();
      
      createdInspectionOrders.push(buyParentOrder[0]);
      
      // Create individual inspection order items for each buy item
      for (const [index, item] of filteredBuyParentItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        
        // Create inspection order item
        const orderItem = await db.insert(inspectionOrderItems).values({
          inspectionOrderId: buyParentOrder[0].id,
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: item.quantity,
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Buy',
          sequenceNumber: index + 1
        }).returning();
        
        createdInspectionOrderItems.push(orderItem[0]);
      }
    }
    
    // Create inspection orders for component items
    if (filteredComponentItems.length > 0) {
      const componentInspectionOrderNumber = `IO-${project.code}-C-${nextSeqNumber + 2}`;
      
      // Create parent inspection order
      const componentParentOrder = await db.insert(inspectionOrders).values({
        projectId: project.id,
        projectCode: project.code,
        inspectionOrderNumber: componentInspectionOrderNumber,
        title: `Component Items Inspection - ${project.code}`,
        description: `Inspection order for Component items in project ${project.code}`,
        status: 'pending',
        inspectionType: 'in-process',
        quantity: filteredComponentItems.length,
        unit: 'Nos',
        sequenceNumber: nextSeqNumber + 2,
        createdBy: req.user.id
      }).returning();
      
      createdInspectionOrders.push(componentParentOrder[0]);
      
      // Create individual inspection order items for each component
      for (const [index, item] of filteredComponentItems.entries()) {
        const masterItem = masterItemsMap.get(item.itemId);
        const parentItem = projectItemsList.find(parent => parent.id === item.parentItemId);
        const parentMasterItem = parentItem ? masterItemsMap.get(parentItem.itemId) : null;
        
        // Create inspection order item
        const orderItem = await db.insert(inspectionOrderItems).values({
          inspectionOrderId: componentParentOrder[0].id,
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: `${masterItem?.description || 'No description'} (for ${parentMasterItem?.itemCode || 'Unknown'})`,
          quantity: item.quantity,
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
          sequenceNumber: index + 1
        }).returning();
        
        createdInspectionOrderItems.push(orderItem[0]);
      }
    }
    
    // Return success response with created inspection orders information
    return res.status(200).json({
      message: 'Inspection orders generated successfully',
      count: createdInspectionOrders.length,
      makeParentCount: filteredMakeParentItems.length,
      buyParentCount: filteredBuyParentItems.length,
      componentCount: filteredComponentItems.length,
      skippedItems: skippedItemCount,
      totalInspectionOrderItems: createdInspectionOrderItems.length
    });
    
  } catch (error) {
    console.error('Error generating inspection orders:', error);
    return res.status(500).json({ 
      error: 'Failed to generate inspection orders',
      details: error.message 
    });
  }
};