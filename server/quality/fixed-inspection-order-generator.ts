import { Request, Response } from 'express';
import { db } from '../db';
import { eq, and, inArray, gt, or, not, isNull } from 'drizzle-orm';
import { 
  projects, projectItems, masterItems, inspectionOrders, inspectionOrderItems, itemComponents
} from '@shared/schema';

/**
 * Preview inspection orders for a project
 */
/**
 * Automatically add missing component items to a project based on item_components relationships
 */
async function addMissingComponentItems(projectId: number): Promise<{ added: number, componentIds: number[] }> {
  // Get project details first
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId)
  });
  
  if (!project) {
    console.log(`[AUTO-ADD] Project ${projectId} not found`);
    return { added: 0, componentIds: [] };
  }
  
  // Get all project items
  const projectItemsList = await db.query.projectItems.findMany({
    where: eq(projectItems.projectId, projectId)
  });
  
  const masterItemIds = projectItemsList.map(item => item.itemId);
  
  // Get component relationships for items in this project
  const itemComponentRelationships = await db.query.itemComponents.findMany({
    where: inArray(itemComponents.parentItemId, masterItemIds)
  });
  
  // Find component items that are missing from the project
  const componentItemIds = itemComponentRelationships.map(rel => rel.componentItemId);
  const existingItemIds = new Set(projectItemsList.map(item => item.itemId));
  const missingComponentItemIds = componentItemIds.filter(id => !existingItemIds.has(id));
  
  console.log(`[AUTO-ADD] Found ${missingComponentItemIds.length} missing component items for project ${projectId}`);
  
  if (missingComponentItemIds.length > 0) {
    // Add missing component items to the project
    const newComponentProjectItems = missingComponentItemIds.map(itemId => ({
      projectId,
      projectCode: project.code,
      itemId,
      quantity: 1
    }));
    
    await db.insert(projectItems).values(newComponentProjectItems);
    console.log(`[AUTO-ADD] Successfully added ${missingComponentItemIds.length} component items to project ${projectId} (${project.code})`);
  }
  
  return { added: missingComponentItemIds.length, componentIds: missingComponentItemIds };
}

export const previewInspectionOrders = async (req: Request, res: Response) => {
  console.log("[PREVIEW] previewInspectionOrders called with projectId:", req.params.projectId);
  try {
    const projectId = parseInt(req.params.projectId);
    const { newItemsOnly } = req.body;
    console.log("[PREVIEW] Parsed projectId:", projectId, "newItemsOnly:", newItemsOnly);
    
    // Automatically add missing component items
    const addResult = await addMissingComponentItems(projectId);
    if (addResult.added > 0) {
      console.log(`[PREVIEW] Auto-added ${addResult.added} missing component items: ${addResult.componentIds.join(', ')}`);
    }
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Get project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (projectItemsList.length === 0) {
      return res.status(404).json({ error: 'No items found for this project' });
    }
    
    // Get existing inspection orders for this project
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    // Get all master items for the project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsList = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map of master item id to details for faster lookups
    const masterItemsMap = new Map();
    masterItemsList.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get all item component relationships for master items in this project
    const itemComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, masterItemIds)
    });
    
    console.log(`Found ${itemComponentRelationships.length} component relationships for the master items in this project`);
    
    // Create component relationship maps to identify which master items are components of others
    const masterItemParentToChildMap = new Map<number, number[]>();
    const masterItemChildToParentMap = new Map<number, number>();
    
    itemComponentRelationships.forEach(rel => {
      if (!masterItemParentToChildMap.has(rel.parentItemId)) {
        masterItemParentToChildMap.set(rel.parentItemId, []);
      }
      masterItemParentToChildMap.get(rel.parentItemId)!.push(rel.componentItemId);
      masterItemChildToParentMap.set(rel.componentItemId, rel.parentItemId);
    });
    
    // Create a set of item IDs that already have inspection orders
    const itemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        itemsWithInspectionOrders.add(order.itemId);
      }
    });

    console.log(`[PREVIEW DEBUG] Found ${existingInspectionOrders.length} existing inspection orders for project ${projectId}`);
    console.log(`[PREVIEW DEBUG] Master item IDs with existing inspection orders: [${Array.from(itemsWithInspectionOrders).join(', ')}]`);
    console.log(`[PREVIEW DEBUG] newItemsOnly parameter: ${newItemsOnly}`);
    
    // Separate items into parent "Make" items, "Buy" items, and component items
    // Parent items are those that are not components of other items according to item_components table
    const makeParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make' && !masterItemChildToParentMap.has(item.itemId);
    });
    
    const buyParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy' && !masterItemChildToParentMap.has(item.itemId);
    });
    
    // Find all project items that are components (their master item appears as a component in item_components)
    const componentItems = projectItemsList.filter(item => 
      masterItemChildToParentMap.has(item.itemId)
    );
    
    console.log(`[PREVIEW] Make parent items: ${makeParentItems.length}, Buy parent items: ${buyParentItems.length}, Component items: ${componentItems.length}`);
    console.log(`[PREVIEW] masterItemChildToParentMap has ${masterItemChildToParentMap.size} entries`);
    if (componentItems.length > 0) {
      console.log('[PREVIEW] Sample component items:', componentItems.slice(0, 3).map(item => ({ id: item.id, itemId: item.itemId, masterItem: masterItemsMap.get(item.itemId)?.itemCode })));
    }
    
    // Check if components are missing from project
    const componentItemIds = itemComponentRelationships.map(rel => rel.componentItemId);
    const existingComponentItemIds = new Set(projectItemsList.map(item => item.itemId));
    const missingComponentItemIds = componentItemIds.filter(id => !existingComponentItemIds.has(id));
    
    console.log(`[PREVIEW] Component item IDs from relationships: ${componentItemIds.join(', ')}`);
    console.log(`[PREVIEW] Missing component items not in project: ${missingComponentItemIds.join(', ')}`);
    console.log(`[PREVIEW] This explains why Component items = 0 despite having ${itemComponentRelationships.length} relationships`);
    
    // Map project items to their parents for display
    const projectItemParentMap = new Map<number, number>();
    
    projectItemsList.forEach(projectItem => {
      const parentMasterItemId = masterItemChildToParentMap.get(projectItem.itemId);
      if (parentMasterItemId) {
        // Find a project item with this parent master item ID
        const parentProjectItems = projectItemsList.filter(pi => pi.itemId === parentMasterItemId);
        if (parentProjectItems.length > 0) {
          projectItemParentMap.set(projectItem.id, parentProjectItems[0].id);
        }
      }
    });
    
    // Filter out items that already have inspection orders if newItemsOnly is true
    // BUGFIX: Check item.itemId (master item ID) instead of item.id (project item ID)
    const filteredMakeParentItems = newItemsOnly ? 
      makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      makeParentItems;
      
    const filteredBuyParentItems = newItemsOnly ? 
      buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      buyParentItems;
      
    const filteredComponentItems = newItemsOnly ? 
      componentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      componentItems;
    
    console.log(`[PREVIEW] After filtering: Make=${filteredMakeParentItems.length}/${makeParentItems.length}, Buy=${filteredBuyParentItems.length}/${buyParentItems.length}, Component=${filteredComponentItems.length}/${componentItems.length}`);
    
    // Count the skipped items
    const skippedItemCount = newItemsOnly ? 
      (makeParentItems.length + buyParentItems.length + componentItems.length) - 
      (filteredMakeParentItems.length + filteredBuyParentItems.length + filteredComponentItems.length) : 
      0;
    
    // Create preview data
    type PreviewItem = {
      sequenceNumber: number;
      itemCode: string;
      description: string;
      quantity: number;
      unit: string;
      makeOrBuy: string;
      itemType: 'Parent' | 'Child';
      parentItemCode: string | null;
      isVirtual?: boolean;
    };
    
    const previewItems: PreviewItem[] = [];
    
    // Add Make parent items to preview
    filteredMakeParentItems.forEach((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId);
      previewItems.push({
        sequenceNumber: index + 1,
        itemCode: masterItem?.itemCode || 'Unknown',
        description: masterItem?.description || 'No description',
        quantity: parseInt(String(item.quantity)),
        unit: masterItem?.uom || 'Nos',
        makeOrBuy: 'Make',
        itemType: 'Parent',
        parentItemCode: null
      });
    });
    
    // Add Buy parent items to preview
    filteredBuyParentItems.forEach((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId);
      previewItems.push({
        sequenceNumber: filteredMakeParentItems.length + index + 1,
        itemCode: masterItem?.itemCode || 'Unknown',
        description: masterItem?.description || 'No description',
        quantity: parseInt(String(item.quantity)),
        unit: masterItem?.uom || 'Nos',
        makeOrBuy: 'Buy',
        itemType: 'Parent',
        parentItemCode: null
      });
    });
    
    // Add Component items to preview
    filteredComponentItems.forEach((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId);
      const parentProjectItemId = projectItemParentMap.get(item.id);
      const parentItem = parentProjectItemId ? projectItemsList.find(pi => pi.id === parentProjectItemId) : null;
      const parentMasterItem = parentItem ? masterItemsMap.get(parentItem.itemId) : null;
      
      previewItems.push({
        sequenceNumber: filteredMakeParentItems.length + filteredBuyParentItems.length + index + 1,
        itemCode: masterItem?.itemCode || 'Unknown',
        description: masterItem?.description || 'No description',
        quantity: parseInt(String(item.quantity)),
        unit: masterItem?.uom || 'Nos',
        makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
        itemType: 'Child',
        parentItemCode: parentMasterItem?.itemCode || null
      });
    });
    
    // Return preview information
    return res.status(200).json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name
      },
      makeParentCount: filteredMakeParentItems.length,
      buyParentCount: filteredBuyParentItems.length,
      componentCount: filteredComponentItems.length,
      totalCount: previewItems.length,
      skippedItems: skippedItemCount,
      items: previewItems,
      willCreateIndividualOrders: true
    });
    
  } catch (error) {
    console.error('Error previewing inspection orders:', error);
    return res.status(500).json({ 
      error: 'Failed to preview inspection orders',
      details: (error as Error).message
    });
  }
};

/**
 * Generate inspection orders for a project
 */
export const generateInspectionOrders = async (req: Request, res: Response) => {
  console.log("[GENERATE] generateInspectionOrders called with projectId:", req.params.projectId);
  console.log("[GENERATE] Request body:", req.body);
  try {
    const projectId = parseInt(req.params.projectId);
    const { newItemsOnly = true } = req.body; // Default to true to prevent duplicates
    console.log("[GENERATE] Parsed projectId:", projectId, "newItemsOnly:", newItemsOnly);
    
    // Automatically add missing component items
    const addResult = await addMissingComponentItems(projectId);
    if (addResult.added > 0) {
      console.log(`[GENERATE] Auto-added ${addResult.added} missing component items: ${addResult.componentIds.join(', ')}`);
    }
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Get project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (projectItemsList.length === 0) {
      return res.status(404).json({ error: 'No items found for this project' });
    }
    
    // Get existing inspection orders for this project
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    // Get all master items for the project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsList = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map of master item id to details for faster lookups
    const masterItemsMap = new Map();
    masterItemsList.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get all item component relationships for master items in this project
    const itemComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, masterItemIds)
    });
    
    console.log(`Found ${itemComponentRelationships.length} component relationships for the master items in this project`);
    
    // Create component relationship maps to identify which master items are components of others
    const masterItemParentToChildMap = new Map<number, number[]>();
    const masterItemChildToParentMap = new Map<number, number>();
    
    itemComponentRelationships.forEach(rel => {
      if (!masterItemParentToChildMap.has(rel.parentItemId)) {
        masterItemParentToChildMap.set(rel.parentItemId, []);
      }
      masterItemParentToChildMap.get(rel.parentItemId)!.push(rel.componentItemId);
      masterItemChildToParentMap.set(rel.componentItemId, rel.parentItemId);
    });
    
    // Create a set of item IDs that already have inspection orders
    const itemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        itemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    console.log(`[DUPLICATE CHECK] Found ${existingInspectionOrders.length} existing inspection orders for project ${projectId}`);
    console.log(`[DUPLICATE CHECK] Item IDs with existing inspection orders: [${Array.from(itemsWithInspectionOrders).join(', ')}]`);
    console.log(`[DUPLICATE CHECK] newItemsOnly flag: ${newItemsOnly}`);
    
    // Separate items into parent "Make" items, "Buy" items, and component items
    const makeParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make' && !masterItemChildToParentMap.has(item.itemId);
    });
    
    const buyParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy' && !masterItemChildToParentMap.has(item.itemId);
    });
    
    // Find all project items that are components
    const componentItems = projectItemsList.filter(item => 
      masterItemChildToParentMap.has(item.itemId)
    );
    
    // Map project items to their parents for reference
    const projectItemParentMap = new Map<number, number>();
    
    projectItemsList.forEach(projectItem => {
      const parentMasterItemId = masterItemChildToParentMap.get(projectItem.itemId);
      if (parentMasterItemId) {
        // Find a project item with this parent master item ID
        const parentProjectItems = projectItemsList.filter(pi => pi.itemId === parentMasterItemId);
        if (parentProjectItems.length > 0) {
          projectItemParentMap.set(projectItem.id, parentProjectItems[0].id);
        }
      }
    });
    
    // Filter out items that already have inspection orders if newItemsOnly is true
    // BUGFIX: Check item.itemId (master item ID) instead of item.id (project item ID)
    const filteredMakeParentItems = newItemsOnly ? 
      makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      makeParentItems;
      
    const filteredBuyParentItems = newItemsOnly ? 
      buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      buyParentItems;
      
    const filteredComponentItems = newItemsOnly ? 
      componentItems.filter(item => !itemsWithInspectionOrders.has(item.itemId)) : 
      componentItems;
    
    console.log(`[FILTERING] Before filtering: ${makeParentItems.length} make parents, ${buyParentItems.length} buy parents, ${componentItems.length} components`);
    console.log(`[FILTERING] After filtering: ${filteredMakeParentItems.length} make parents, ${filteredBuyParentItems.length} buy parents, ${filteredComponentItems.length} components`);
    
    // Arrays to store created inspection orders
    const createdInspectionOrders = [];
    const createdInspectionOrderItems = [];
    const skippedItemCount = newItemsOnly ? 
      (makeParentItems.length + buyParentItems.length + componentItems.length) - 
      (filteredMakeParentItems.length + filteredBuyParentItems.length + filteredComponentItems.length) : 
      0;
    
    if (skippedItemCount > 0) {
      console.log(`[FILTERING] Skipped ${skippedItemCount} items that already have inspection orders`);
    }
    
    // Extract project number from the project code
    const [financialYear, projectNumber] = project.code.split('-');
    
    // Find the next available numbers for each type
    const existingMakeNumbers = existingInspectionOrders
      .filter(order => order.inspectionOrderNumber?.includes(`IO-${financialYear}-${projectNumber}-M-`))
      .map(order => {
        const match = order.inspectionOrderNumber?.match(/IO-\d+-\d+-M-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .sort((a, b) => a - b);
    
    const existingBuyNumbers = existingInspectionOrders
      .filter(order => order.inspectionOrderNumber?.includes(`IO-${financialYear}-${projectNumber}-B-`))
      .map(order => {
        const match = order.inspectionOrderNumber?.match(/IO-\d+-\d+-B-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .sort((a, b) => a - b);
    
    const existingComponentNumbers = existingInspectionOrders
      .filter(order => order.inspectionOrderNumber?.includes(`IO-${financialYear}-${projectNumber}-C-`))
      .map(order => {
        const match = order.inspectionOrderNumber?.match(/IO-\d+-\d+-C-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .sort((a, b) => a - b);
    
    console.log(`Existing Make numbers: [${existingMakeNumbers.join(', ')}]`);
    console.log(`Existing Buy numbers: [${existingBuyNumbers.join(', ')}]`);
    console.log(`Existing Component numbers: [${existingComponentNumbers.join(', ')}]`);
    
    // Function to get next available number
    const getNextNumber = (existingNumbers: number[]) => {
      let nextNum = 1;
      for (const num of existingNumbers) {
        if (num === nextNum) {
          nextNum++;
        } else {
          break;
        }
      }
      return nextNum;
    };
    
    // Create individual inspection orders for each Make parent item
    if (filteredMakeParentItems.length > 0) {
      console.log(`Creating ${filteredMakeParentItems.length} make item inspection orders`);
      
      let makeNumberStart = getNextNumber(existingMakeNumbers);
      
      // Create individual inspection orders for each make item
      for (const [index, item] of filteredMakeParentItems.entries()) {
        console.log(`Creating make item order ${index + 1}/${filteredMakeParentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const makeOrderNumber = makeNumberStart + index;
        const makeInspectionOrderNumber = `IO-${financialYear}-${projectNumber}-M-${makeOrderNumber}`;
        
        // Extract drawing number from masterItem data
        let drawingNumber = masterItem?.drawingNo || "";
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
        
        console.log(`Make order ${makeInspectionOrderNumber}: Drawing number extracted: "${drawingNumber}" from itemCode: "${masterItem?.itemCode}"`);
        
        // Create individual inspection order for this item
        const makeItemOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: makeInspectionOrderNumber,
          title: `Make Item Inspection - ${masterItem?.itemCode || 'Unknown'}`,
          description: masterItem?.description || 'No description',
          drawingNo: drawingNumber,
          status: 'pending',
          inspectionType: 'in-process',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Make',
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          sequenceNumber: makeOrderNumber,
          createdBy: req.user!.id
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
      console.log(`Creating ${filteredBuyParentItems.length} buy item inspection orders`);
      
      let buyNumberStart = getNextNumber(existingBuyNumbers);
      
      // Create individual inspection orders for each buy item
      for (const [index, item] of filteredBuyParentItems.entries()) {
        console.log(`Creating buy item order ${index + 1}/${filteredBuyParentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const buyOrderNumber = buyNumberStart + index;
        const buyInspectionOrderNumber = `IO-${financialYear}-${projectNumber}-B-${buyOrderNumber}`;
        
        // Extract drawing number from masterItem data
        let drawingNumber = masterItem?.drawingNo || "";
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
        
        console.log(`Buy order ${buyInspectionOrderNumber}: Drawing number extracted: "${drawingNumber}" from itemCode: "${masterItem?.itemCode}"`);
        
        // Create individual inspection order for this item
        const buyItemOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: buyInspectionOrderNumber,
          title: `Buy Item Inspection - ${masterItem?.itemCode || 'Unknown'}`,
          description: masterItem?.description || 'No description',
          drawingNo: drawingNumber,
          status: 'pending',
          inspectionType: 'incoming',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: 'Buy',
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          sequenceNumber: buyOrderNumber,
          createdBy: req.user!.id
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
      console.log(`Creating ${filteredComponentItems.length} component inspection orders`);
      
      let componentNumberStart = getNextNumber(existingComponentNumbers);
      
      // Create individual inspection orders for each component item
      for (const [index, item] of filteredComponentItems.entries()) {
        console.log(`Creating component order ${index + 1}/${filteredComponentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const parentProjectItemId = projectItemParentMap.get(item.id);
        const parentItem = parentProjectItemId ? projectItemsList.find(pi => pi.id === parentProjectItemId) : null;
        const parentMasterItem = parentItem ? masterItemsMap.get(parentItem.itemId) : null;
        const componentOrderNumber = componentNumberStart + index;
        const componentInspectionOrderNumber = `IO-${financialYear}-${projectNumber}-C-${componentOrderNumber}`;
        
        // Extract drawing number from masterItem data
        let drawingNumber = masterItem?.drawingNo || "";
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
        
        console.log(`Component order ${componentInspectionOrderNumber}: Drawing number extracted: "${drawingNumber}" from itemCode: "${masterItem?.itemCode}"`);
        
        // Create individual inspection order for this component
        const componentItemOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: componentInspectionOrderNumber,
          title: `Component Inspection - ${masterItem?.itemCode || 'Unknown'}`,
          description: `${masterItem?.description || 'No description'} (for ${parentMasterItem?.itemCode || 'Unknown'})`,
          drawingNo: drawingNumber,
          status: 'pending',
          inspectionType: 'in-process',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          sequenceNumber: componentOrderNumber,
          createdBy: req.user!.id
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
      details: (error as Error).message 
    });
  }
};