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
    
    console.log(`======= DEBUGGING INSPECTION ORDER GENERATION =======`);
    console.log(`Generating inspection orders preview for project ${projectId}: ${project.code}`);
    
    // Fetch all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (!projectItemsList.length) {
      console.log(`ERROR: No project items found for project ${projectId} (${project.code})`);
      return res.status(404).json({ error: 'No project items found for this project' });
    }
    
    console.log(`Found ${projectItemsList.length} project items for project ${projectId} (${project.code})`);
    // Print the first few items for debugging
    if (projectItemsList.length > 0) {
      console.log(`First project item: ${JSON.stringify(projectItemsList[0])}`);
      // Check if parentItemId exists in the schema
      console.log(`Does first item have parentItemId property? ${projectItemsList[0].hasOwnProperty('parentItemId')}`);
      console.log(`First item properties: ${Object.keys(projectItemsList[0]).join(', ')}`);
    }
    
    // Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    console.log(`Looking up master items with IDs: ${masterItemIds.join(', ')}`);
    
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Found ${masterItemsArray.length} master items out of ${masterItemIds.length} requested`);
    
    // Show first master item for debugging
    if (masterItemsArray.length > 0) {
      console.log(`First master item: ${JSON.stringify(masterItemsArray[0])}`);
      // Check if makeOrBuy exists
      console.log(`Does first master item have makeOrBuy property? ${masterItemsArray[0].hasOwnProperty('makeOrBuy')}`);
      console.log(`First master item properties: ${Object.keys(masterItemsArray[0]).join(', ')}`);
    } else {
      console.log(`WARNING: No master items found for project ${projectId}!`);
    }
    
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
    // Handle case where parentItemId might not exist in schema
    console.log(`Project ID ${projectId}: Checking for parentItemId field in project items...`);
    const hasParentField = projectItemsList.length > 0 ? Object.prototype.hasOwnProperty.call(projectItemsList[0], "parentItemId") : false;
    console.log(`Project ID ${projectId}: parentItemId field exists: ${hasParentField}`);
    
    const makeParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      if (!masterItem) return false;
      
      // Only check parentItemId if the field exists in schema
      if (hasParentField) {
        return masterItem.makeOrBuy === "Make" && !item.parentItemId;
      } else {
        // If parentItemId doesn't exist in schema, treat all Make items as parent items
        return masterItem.makeOrBuy === "Make";
    projectItemsList.forEach(item => {
      // Only map parent-child relationships if the parentItemId field exists
      if (hasParentField && item.parentItemId) {
        if (!parentToChildrenMap.has(item.parentItemId)) {
          parentToChildrenMap.set(item.parentItemId, []);
        }
        parentToChildrenMap.get(item.parentItemId).push(item);
        childToParentMap.set(item.id, item.parentItemId);
      }
    });
        return masterItem.makeOrBuy === "Buy" && !item.parentItemId;
      } else {
        // If parentItemId doesn't exist in schema, treat all Buy items as parent items
        return masterItem.makeOrBuy === "Buy";
      }
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
    // Using itemId from project item to match with itemId (masterItemId) stored in inspection orders
    const filteredMakeParentItems = makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId));
    const filteredBuyParentItems = buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId));
    const filteredComponentItems = allComponentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId));
    
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
    
    // Generate sample inspection order number formats for preview
    const nextSeqNumber = existingInspectionOrders.length + 1;
    
    // Split project code - handle both old FY format (2526-1) and new calendar year format (2025-1)
    const projectCodeParts = project.code.split('-');
    const year = projectCodeParts[0];
    const projectNumber = projectCodeParts[1];
    
    // Format for individual orders
    const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-[1..${filteredMakeParentItems.length}]`;
    const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-[1..${filteredBuyParentItems.length}]`;
    const componentInspectionOrderNumber = `IO-${year}-${projectNumber}-C-[1..${filteredComponentItems.length}]`;
    
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
      willCreateIndividualOrders: true,
      totalOrderCount: filteredMakeParentItems.length + filteredBuyParentItems.length + filteredComponentItems.length,
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
    
    console.log(`Found ${projectItemsList.length} project items for project ${projectId} (${project.code}) - generation mode`);
    // Print the first few items for debugging
    if (projectItemsList.length > 0) {
      console.log(`First project item (generation): ${JSON.stringify(projectItemsList[0])}`);
    // Create a set of item IDs that already have inspection orders
    const itemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        itemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    // Check if parentItemId field exists in project items
    console.log(`Project ID ${projectId}: Checking for parentItemId field in project items (generation mode)...`);
    const hasParentField = projectItemsList.length > 0 ? Object.prototype.hasOwnProperty.call(projectItemsList[0], "parentItemId") : false;
    console.log(`Project ID ${projectId}: parentItemId field exists: ${hasParentField} (generation mode)`);
    
    // Separate items into parent "Make" items and "Buy" items
    const makeParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      if (!masterItem) return false;
      
      // Only check parentItemId if the field exists in schema
      if (hasParentField) {
        return masterItem.makeOrBuy === "Make" && !item.parentItemId;
      } else {
    projectItemsList.forEach(item => {
      // Only map parent-child relationships if the parentItemId field exists
      if (hasParentField && item.parentItemId) {
        if (!parentToChildrenMap.has(item.parentItemId)) {
          parentToChildrenMap.set(item.parentItemId, []);
        }
        parentToChildrenMap.get(item.parentItemId).push(item);
        childToParentMap.set(item.id, item.parentItemId);
      }
    });
      // Only check parentItemId if the field exists in schema
      if (hasParentField) {
        return masterItem.makeOrBuy === "Buy" && !item.parentItemId;
      } else {
        // If parentItemId doesn't exist in schema, treat all Buy items as parent items
        return masterItem.makeOrBuy === "Buy";
      }
    });
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
    // Using itemId from project item to match with itemId (masterItemId) stored in inspection orders
    const filteredMakeParentItems = newItemsOnly ? 
      makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      makeParentItems;
      
    const filteredBuyParentItems = newItemsOnly ? 
      buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      buyParentItems;
      
    const filteredComponentItems = newItemsOnly ? 
      allComponentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      allComponentItems;
    
    console.log(`After filtering: ${filteredMakeParentItems.length} make parents, ${filteredBuyParentItems.length} buy parents, ${filteredComponentItems.length} components`);
    
    // Arrays to store created inspection orders
    const createdInspectionOrders = [];
    const createdInspectionOrderItems = [];
    const skippedItemCount = newItemsOnly ? 
      (makeParentItems.length + buyParentItems.length + allComponentItems.length) - 
      (filteredMakeParentItems.length + filteredBuyParentItems.length + filteredComponentItems.length) : 
      0;
    
    // Generate unique inspection order numbers
    const nextSeqNumber = existingInspectionOrders.length + 1;
    
    // Create individual inspection orders for each Make parent item
    if (filteredMakeParentItems.length > 0) {
      // Extract project number from the project code - handle both old and new format
      const projectCodeParts = project.code.split('-');
      const year = projectCodeParts[0];
      const projectNumber = projectCodeParts[1];
      
      console.log(`Creating ${filteredMakeParentItems.length} make item inspection orders`);
      
      // Create individual inspection orders for each make item
      for (const [index, item] of filteredMakeParentItems.entries()) {
        console.log(`Creating make item order ${index + 1}/${filteredMakeParentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-${index + 1}`;
        
        // Extract drawing number from master item or derive it from item code
        let drawingNumber = masterItem?.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
        if (!drawingNumber && masterItem?.itemCode) {
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
        
        // Create individual inspection order for this item
        const makeItemOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: makeInspectionOrderNumber,
          title: `Make Item Inspection - ${masterItem?.itemCode || 'Unknown'}`,
          description: masterItem?.description || 'No description',
          status: 'pending',
          inspectionType: 'in-process',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Make',
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          drawingNo: drawingNumber, // Add drawing number field
          sequenceNumber: nextSeqNumber + index,
          createdBy: req.user.id
        }).returning();
        
        createdInspectionOrders.push(makeItemOrder[0]);
        
        // Create inspection order item record
        const orderItem = await db.insert(inspectionOrderItems).values({
          inspectionOrderId: makeItemOrder[0].id,
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Make',
          sequenceNumber: 1 // Only one item per order
        }).returning();
        
        createdInspectionOrderItems.push(orderItem[0]);
      }
    }
    
    // Create individual inspection orders for each Buy parent item
    if (filteredBuyParentItems.length > 0) {
      // Extract project number from the project code - handle both old and new format
      const projectCodeParts = project.code.split('-');
      const year = projectCodeParts[0];
      const projectNumber = projectCodeParts[1];
      
      console.log(`Creating ${filteredBuyParentItems.length} buy item inspection orders`);
      
      // Create individual inspection orders for each buy item
      for (const [index, item] of filteredBuyParentItems.entries()) {
        console.log(`Creating buy item order ${index + 1}/${filteredBuyParentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-${index + 1}`;
        
        // Extract drawing number from master item or derive it from item code
        let drawingNumber = masterItem?.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
        if (!drawingNumber && masterItem?.itemCode) {
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
        
        // Create individual inspection order for this item
        const buyItemOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: buyInspectionOrderNumber,
          title: `Buy Item Inspection - ${masterItem?.itemCode || 'Unknown'}`,
          description: masterItem?.description || 'No description',
          status: 'pending',
          inspectionType: 'incoming',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Buy',
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          drawingNo: drawingNumber, // Add drawing number field
          sequenceNumber: nextSeqNumber + filteredMakeParentItems.length + index,
          createdBy: req.user.id
        }).returning();
        
        createdInspectionOrders.push(buyItemOrder[0]);
        
        // Create inspection order item record
        const orderItem = await db.insert(inspectionOrderItems).values({
          inspectionOrderId: buyItemOrder[0].id,
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Buy',
          sequenceNumber: 1 // Only one item per order
        }).returning();
        
        createdInspectionOrderItems.push(orderItem[0]);
      }
    }
    
    // Create individual inspection orders for each component item
    if (filteredComponentItems.length > 0) {
      // Extract project number from the project code - handle both old and new format
      const projectCodeParts = project.code.split('-');
      const year = projectCodeParts[0];
      const projectNumber = projectCodeParts[1];
      
      console.log(`Creating ${filteredComponentItems.length} component inspection orders`);
      
      // Create individual inspection orders for each component item
      for (const [index, item] of filteredComponentItems.entries()) {
        console.log(`Creating component order ${index + 1}/${filteredComponentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const parentItem = projectItemsList.find(parent => parent.id === item.parentItemId);
        const parentMasterItem = parentItem ? masterItemsMap.get(parentItem.itemId) : null;
        const componentInspectionOrderNumber = `IO-${year}-${projectNumber}-C-${index + 1}`;
        
        // Extract drawing number from master item or derive it from item code
        let drawingNumber = masterItem?.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
        if (!drawingNumber && masterItem?.itemCode) {
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
        
        // Create individual inspection order for this component
        const componentItemOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: componentInspectionOrderNumber,
          title: `Component Inspection - ${masterItem?.itemCode || 'Unknown'}`,
          description: `${masterItem?.description || 'No description'} (for ${parentMasterItem?.itemCode || 'Unknown'})`,
          status: 'pending',
          inspectionType: 'in-process',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          drawingNo: drawingNumber, // Add drawing number field
          parentItemId: item.parentItemId,
          sequenceNumber: nextSeqNumber + filteredMakeParentItems.length + filteredBuyParentItems.length + index,
          createdBy: req.user.id
        }).returning();
        
        createdInspectionOrders.push(componentItemOrder[0]);
        
        // Create inspection order item record
        const orderItem = await db.insert(inspectionOrderItems).values({
          inspectionOrderId: componentItemOrder[0].id,
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: `${masterItem?.description || 'No description'} (for ${parentMasterItem?.itemCode || 'Unknown'})`,
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
          sequenceNumber: 1 // Only one item per order
        }).returning();
        
        createdInspectionOrderItems.push(orderItem[0]);
      }
    }
    
    // Return success response with created inspection orders information
    console.log(`Orders generation complete: Created ${createdInspectionOrders.length} orders from ${filteredMakeParentItems.length} make items, ${filteredBuyParentItems.length} buy items, and ${filteredComponentItems.length} component items.`);
    
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