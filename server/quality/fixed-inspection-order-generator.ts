import { Request, Response } from 'express';
import { db } from '../db';
import { eq, and, inArray, gt, or, not, isNull } from 'drizzle-orm';
import { 
  projects, projectItems, masterItems, inspectionOrders, inspectionOrderItems, itemComponents
} from '@shared/schema';

/**
 * Preview inspection orders for a project
 */
export const previewInspectionOrders = async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { newItemsOnly } = req.body;
    
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
    const filteredMakeParentItems = newItemsOnly ? 
      makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      makeParentItems;
      
    const filteredBuyParentItems = newItemsOnly ? 
      buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      buyParentItems;
      
    const filteredComponentItems = newItemsOnly ? 
      componentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      componentItems;
    
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
  try {
    const projectId = parseInt(req.params.projectId);
    const { newItemsOnly } = req.body;
    
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
    const filteredMakeParentItems = newItemsOnly ? 
      makeParentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      makeParentItems;
      
    const filteredBuyParentItems = newItemsOnly ? 
      buyParentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      buyParentItems;
      
    const filteredComponentItems = newItemsOnly ? 
      componentItems.filter(item => !itemsWithInspectionOrders.has(item.id)) : 
      componentItems;
    
    console.log(`After filtering: ${filteredMakeParentItems.length} make parents, ${filteredBuyParentItems.length} buy parents, ${filteredComponentItems.length} components`);
    
    // Arrays to store created inspection orders
    const createdInspectionOrders = [];
    const createdInspectionOrderItems = [];
    const skippedItemCount = newItemsOnly ? 
      (makeParentItems.length + buyParentItems.length + componentItems.length) - 
      (filteredMakeParentItems.length + filteredBuyParentItems.length + filteredComponentItems.length) : 
      0;
    
    // Generate unique inspection order numbers
    const nextSeqNumber = existingInspectionOrders.length + 1;
    
    // Create individual inspection orders for each Make parent item
    if (filteredMakeParentItems.length > 0) {
      // Extract project number from the project code
      const [financialYear, projectNumber] = project.code.split('-');
      
      console.log(`Creating ${filteredMakeParentItems.length} make item inspection orders`);
      
      // Create individual inspection orders for each make item
      for (const [index, item] of filteredMakeParentItems.entries()) {
        console.log(`Creating make item order ${index + 1}/${filteredMakeParentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const makeInspectionOrderNumber = `IO-${financialYear}-${projectNumber}-M-${index + 1}`;
        
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
          sequenceNumber: nextSeqNumber + index,
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
      // Extract project number from the project code
      const [financialYear, projectNumber] = project.code.split('-');
      
      console.log(`Creating ${filteredBuyParentItems.length} buy item inspection orders`);
      
      // Create individual inspection orders for each buy item
      for (const [index, item] of filteredBuyParentItems.entries()) {
        console.log(`Creating buy item order ${index + 1}/${filteredBuyParentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const buyInspectionOrderNumber = `IO-${financialYear}-${projectNumber}-B-${index + 1}`;
        
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
          sequenceNumber: nextSeqNumber + filteredMakeParentItems.length + index,
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
      // Extract project number from the project code
      const [financialYear, projectNumber] = project.code.split('-');
      
      console.log(`Creating ${filteredComponentItems.length} component inspection orders`);
      
      // Create individual inspection orders for each component item
      for (const [index, item] of filteredComponentItems.entries()) {
        console.log(`Creating component order ${index + 1}/${filteredComponentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const parentProjectItemId = projectItemParentMap.get(item.id);
        const parentItem = parentProjectItemId ? projectItemsList.find(pi => pi.id === parentProjectItemId) : null;
        const parentMasterItem = parentItem ? masterItemsMap.get(parentItem.itemId) : null;
        const componentInspectionOrderNumber = `IO-${financialYear}-${projectNumber}-C-${index + 1}`;
        
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
          parentItemId: parentProjectItemId || undefined,
          sequenceNumber: nextSeqNumber + filteredMakeParentItems.length + filteredBuyParentItems.length + index,
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