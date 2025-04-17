import { Request, Response, Router } from 'express';
import { eq, asc, desc, and, inArray, gte } from 'drizzle-orm';
import { db } from './db';
import { 
  projects, projectItems, workOrders, workOrderItems, 
  resourceAssignments, productionRecords, materialUsage, 
  machineUsage, users, masterItems, itemComponents,
  insertWorkOrderSchema, insertWorkOrderItemSchema, 
  insertResourceAssignmentSchema, insertProductionRecordSchema,
  insertMaterialUsageSchema, insertMachineUsageSchema
} from '@shared/schema';

/**
 * Preview work orders for a project
 */
app.get('/api/production/work-orders/preview/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Validate projectId parameter
    const projectId = parseInt(req.params.projectId);
    
    // Check if project ID is valid
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Get project to ensure it exists
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get all project items
    const allProjectItems = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    // Build a list of master item IDs used in this project
    const masterItemIds = allProjectItems.map(item => item.itemId);
    
    // Get master item details for all project items
    const masterItemsList = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map for quick lookup of master item details
    const masterItemsMap = new Map<number, typeof masterItems.$inferSelect>();
    masterItemsList.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Group items by "makeOrBuy" status
    const makeItems = allProjectItems.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem && masterItem.makeOrBuy === 'Make';
    });
    
    // Identify parent-child relationships using item components table
    const itemComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, masterItemIds)
    });
    
    // If we have components, also get their master item details
    const componentItemIds = itemComponentRelationships.map(rel => rel.componentItemId);
    if (componentItemIds.length > 0) {
      const componentMasterItems = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, componentItemIds)
      });
      
      // Add these to the master items map
      componentMasterItems.forEach(item => {
        if (!masterItemsMap.has(item.id)) {
          masterItemsMap.set(item.id, item);
        }
      });
    }
    
    // Create lookup maps for parent-child relationships
    const parentToChildMap = new Map<number, number[]>();
    const childToParentMap = new Map<number, number>();
    
    itemComponentRelationships.forEach(rel => {
      if (!parentToChildMap.has(rel.parentItemId)) {
        parentToChildMap.set(rel.parentItemId, []);
      }
      parentToChildMap.get(rel.parentItemId)!.push(rel.componentItemId);
      childToParentMap.set(rel.componentItemId, rel.parentItemId);
    });
    
    // Get existing work orders to check for duplicates
    const existingWorkOrders = await db.query.workOrders.findMany({
      where: eq(workOrders.projectId, projectId)
    });
    
    if (makeItems.length === 0) {
      return res.status(400).json({ error: 'No "Make" items found for this project' });
    }
    
    // If there are existing work orders, check for duplicates
    let filteredMakeItems = [...makeItems];
    if (existingWorkOrders.length > 0) {
      // Get all work order items for this project
      const existingWorkOrderIds = existingWorkOrders.map(wo => wo.id);
      const existingWorkOrderItems = await db.query.workOrderItems.findMany({
        where: inArray(workOrderItems.workOrderId, existingWorkOrderIds)
      });
      
      // Create a set of project item IDs that already have work orders
      const existingProjectItemIds = new Set(existingWorkOrderItems.map(item => item.projectItemId));
      
      // Filter out items that already have work orders
      filteredMakeItems = makeItems.filter(item => !existingProjectItemIds.has(item.id));
    }
    
    // Track parent items that have components
    const parentsWithComponents = new Set<number>();
    
    // Divide items into parent and child categories
    const parentItems: typeof makeItems = [];
    const childItems: typeof makeItems = [];
    
    filteredMakeItems.forEach(item => {
      const masterItemId = item.itemId;
      
      // If this item is a component (child) of another item
      if (childToParentMap.has(masterItemId)) {
        childItems.push(item);
      } else {
        // Otherwise it's a top-level item (parent)
        parentItems.push(item);
        
        // Check if this parent has components
        if (parentToChildMap.has(masterItemId)) {
          parentsWithComponents.add(masterItemId);
        }
      }
    });
    
    // Now, for each parent with components, add virtual project items for component items
    // that are not already included in the project
    const virtualChildItems: any[] = [];
    
    parentsWithComponents.forEach(parentItemId => {
      // Find the original project item for this parent
      const parentProjectItem = filteredMakeItems.find(item => item.itemId === parentItemId);
      if (!parentProjectItem) return;
      
      // Get all component items for this parent
      const componentItemIds = parentToChildMap.get(parentItemId) || [];
      
      componentItemIds.forEach(componentItemId => {
        // Check if this component already exists as a project item
        const existingComponentItem = filteredMakeItems.find(item => item.itemId === componentItemId);
        
        if (!existingComponentItem) {
          // If component is not already a project item, create a virtual one
          const masterComponentItem = masterItemsMap.get(componentItemId);
          if (masterComponentItem && masterComponentItem.makeOrBuy === 'Make') {
            // Create a virtual project item for this component
            // We use negative IDs for virtual items to avoid conflicts
            virtualChildItems.push({
              id: -(Math.abs(componentItemId)), // Use negative ID to mark as virtual
              projectId: parentProjectItem.projectId,
              itemId: componentItemId,
              quantity: 1, // Default to 1 for now, could be improved with BOM relationships
              makeOrBuy: 'Make' as const,
              notes: `Virtual component of ${masterItemsMap.get(parentItemId)?.itemCode || 'parent item'}`
            });
          }
        }
      });
    });
    
    // Add virtual items to child items
    childItems.push(...virtualChildItems);
    
    // Expand items with master item details for the frontend
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
    
    // Convert parent items to preview format
    const previewParentItems: PreviewItem[] = parentItems.map((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId)!;
      return {
        sequenceNumber: index + 1,
        itemCode: masterItem?.itemCode || 'Unknown',
        description: masterItem?.description || 'Unknown Item',
        quantity: item.quantity,
        unit: masterItem?.unit || 'EA',
        makeOrBuy: 'Make',
        itemType: 'Parent',
        parentItemCode: null
      };
    });
    
    // Convert child items to preview format
    const previewChildItems: PreviewItem[] = childItems.map((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId)!;
      const parentId = childToParentMap.get(item.itemId);
      const parentItemCode = parentId ? masterItemsMap.get(parentId)?.itemCode || null : null;
      return {
        sequenceNumber: index + 1,
        itemCode: masterItem?.itemCode || 'Unknown',
        description: masterItem?.description || 'Unknown Item',
        quantity: item.quantity,
        unit: masterItem?.unit || 'EA',
        makeOrBuy: 'Make',
        itemType: 'Child',
        parentItemCode,
        isVirtual: typeof item.id === 'number' && item.id < 0
      };
    });
    
    res.json({
      parentItems: previewParentItems,
      childItems: previewChildItems,
      parentItemCount: parentItems.length,
      childItemCount: childItems.length
    });
  } catch (error) {
    console.error('Error previewing work orders:', error);
    res.status(500).json({ error: 'Failed to preview work orders' });
  }
});

/**
 * Generate work orders for a project
 */
app.post('/api/production/work-orders/generate-for-project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Validate projectId parameter and confirm flag
    const projectId = parseInt(req.params.projectId);
    const { confirm } = req.body;
    
    // Check if project ID is valid
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Get project to ensure it exists
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get existing work orders to avoid duplicates
    const existingWorkOrders = await db.query.workOrders.findMany({
      where: eq(workOrders.projectId, projectId)
    });
    
    // Get all project items
    const allProjectItems = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    // Build a list of master item IDs used in this project
    const masterItemIds = allProjectItems.map(item => item.itemId);
    
    // Get master item details for all project items
    const masterItemsList = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map for quick lookup of master item details
    const masterItemsMap = new Map<number, typeof masterItems.$inferSelect>();
    masterItemsList.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Filter for "Make" items that need to be manufactured
    const makeItems = allProjectItems.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem && masterItem.makeOrBuy === 'Make';
    });
    
    // Identify parent-child relationships using item components table
    // We already have masterItemIds from above, so we can use it directly
    const itemComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, masterItemIds)
    });
    
    // If we have components, also get their master item details
    const componentItemIds = itemComponentRelationships.map(rel => rel.componentItemId);
    if (componentItemIds.length > 0) {
      const componentMasterItems = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, componentItemIds)
      });
      
      // Add these to the master items map
      componentMasterItems.forEach(item => {
        if (!masterItemsMap.has(item.id)) {
          masterItemsMap.set(item.id, item);
        }
      });
    }
    
    // Create lookup maps for parent-child relationships
    const parentToChildMap = new Map<number, number[]>();
    const childToParentMap = new Map<number, number>();
    
    itemComponentRelationships.forEach(rel => {
      if (!parentToChildMap.has(rel.parentItemId)) {
        parentToChildMap.set(rel.parentItemId, []);
      }
      parentToChildMap.get(rel.parentItemId)!.push(rel.componentItemId);
      childToParentMap.set(rel.componentItemId, rel.parentItemId);
    });
    
    if (makeItems.length === 0) {
      return res.status(400).json({ error: 'No "Make" items found for this project' });
    }
    
    // Check for existing work order items to avoid duplicates
    if (existingWorkOrders.length > 0) {
      // Get all work order items for this project
      const existingWorkOrderIds = existingWorkOrders.map(wo => wo.id);
      const existingWorkOrderItems = await db.query.workOrderItems.findMany({
        where: inArray(workOrderItems.workOrderId, existingWorkOrderIds)
      });
      
      // Create a set of project item IDs that already have work orders
      const existingProjectItemIds = new Set(existingWorkOrderItems.map(item => item.projectItemId));
      
      // Filter out items that already have work orders
      const filteredMakeItems = makeItems.filter(item => !existingProjectItemIds.has(item.id));
      
      if (filteredMakeItems.length === 0) {
        return res.status(200).json({ 
          message: 'All applicable items already have work orders', 
          itemCount: 0,
          items: []
        });
      }
      
      // Update makeItems to only include items that don't already have work orders
      makeItems.length = 0;
      makeItems.push(...filteredMakeItems);
    }
    
    // If not confirmed, just return the count
    if (!confirm) {
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'Please confirm to generate work orders',
        itemCount: makeItems.length
      });
    }
    
    // Create work order date range
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 30); // Default to 30 days schedule
    
    // Generate a unique work order number using sequential numbering with format WO-[ProjectCode]-[SequentialNumber]
    const nextSeqNumber = existingWorkOrders.length + 1;
    const workOrderNumber = `WO-${project.code}-${nextSeqNumber}`;
    
    // Divide items into parent and child categories
    const parentItems: typeof makeItems = [];
    const childItems: typeof makeItems = [];
    
    // Track parent items that have components
    const parentsWithComponents = new Set<number>();
    
    makeItems.forEach(item => {
      const masterItemId = item.itemId;
      
      // If this item is a component (child) of another item
      if (childToParentMap.has(masterItemId)) {
        childItems.push(item);
      } else {
        // Otherwise it's a top-level item (parent)
        parentItems.push(item);
        
        // Check if this parent has components
        if (parentToChildMap.has(masterItemId)) {
          parentsWithComponents.add(masterItemId);
        }
      }
    });
    
    // Now, for each parent with components, add virtual project items for component items
    // that are not already included in the project
    const virtualChildItems: any[] = [];
    
    parentsWithComponents.forEach(parentItemId => {
      // Find the original project item for this parent
      const parentProjectItem = makeItems.find(item => item.itemId === parentItemId);
      if (!parentProjectItem) return;
      
      // Get all component items for this parent
      const componentItemIds = parentToChildMap.get(parentItemId) || [];
      
      componentItemIds.forEach(componentItemId => {
        // Check if this component already exists as a project item
        const existingComponentItem = makeItems.find(item => item.itemId === componentItemId);
        
        if (!existingComponentItem) {
          // If component is not already a project item, create a virtual one
          const masterComponentItem = masterItemsMap.get(componentItemId);
          if (masterComponentItem && masterComponentItem.makeOrBuy === 'Make') {
            // Create a virtual project item for this component
            virtualChildItems.push({
              id: -(Math.abs(componentItemId)), // Use negative ID to mark as virtual
              projectId: parentProjectItem.projectId,
              itemId: componentItemId,
              quantity: 1, // Default to 1 for now
              makeOrBuy: 'Make' as const,
              notes: `Virtual component of ${masterItemsMap.get(parentItemId)?.itemCode || 'parent item'}`
            });
          }
        }
      });
    });
    
    // Add virtual items to child items
    childItems.push(...virtualChildItems);
    
    const createdWorkOrders: any[] = [];
    const createdWorkOrderItems: any[] = [];
    
    // Get the count of existing work orders for this project to determine the sequence number
    const workOrderCount = await db.query.workOrders.findMany({
      where: eq(workOrders.projectId, projectId),
    });
    
    // Calculate the next sequential numbers
    const nextParentSeqNumber = workOrderCount.length + 1;
    const nextChildSeqNumber = workOrderCount.length + 2;
    
    // Helper function to create a work order
    const createWorkOrder = async (items: typeof makeItems, isParent: boolean) => {
      // For consistency across the application, always use the simple sequential number 
      // format: WO-[ProjectCode]-[SequentialNumber]
      const seqNumber = isParent ? nextParentSeqNumber : nextChildSeqNumber;
      const specificWorkOrderNumber = `WO-${project.code}-${seqNumber}`;
      const typeDescription = isParent ? 'Parent Items' : 'Child Components';
      
      // Create work order
      const [newWorkOrder] = await db.insert(workOrders).values({
        projectId,
        projectCode: project.code,
        workOrderNumber: specificWorkOrderNumber,
        title: `${typeDescription} for ${project.name}`,
        description: `Auto-generated ${typeDescription.toLowerCase()} work order for project ${project.code}`,
        status: 'planned',
        priority: 'Medium',
        plannedStartDate: today,
        plannedEndDate: endDate,
        quantity: 1,
        supervisorId: req.user!.id,
        createdBy: req.user!.id,
        createdAt: today,
        updatedAt: today
      }).returning();
      
      createdWorkOrders.push(newWorkOrder);
      
      // Add items to the work order
      let sequenceNumber = 1;
      
      // Process all items for this work order
      for (const item of items) {
        const masterItem = masterItemsMap.get(item.itemId);
        if (!masterItem) continue;
        
        // Add item to work order
        const [newItem] = await db.insert(workOrderItems).values({
          workOrderId: newWorkOrder.id,
          projectItemId: item.id < 0 ? 0 : item.id, // Handle virtual items (negative IDs)
          quantity: item.quantity,
          status: 'pending',
          sequenceNumber: sequenceNumber++,
          notes: item.id < 0 
            ? `Virtual component: ${masterItem.itemCode} - ${masterItem.description}`
            : `Auto-generated from ${isParent ? 'parent' : 'child'} item ${masterItem.description || masterItem.itemCode}`,
          createdAt: today,
          updatedAt: today
        }).returning();
        
        createdWorkOrderItems.push(newItem);
      }
      
      return newWorkOrder;
    };
    
    // Create work orders for parent items
    if (parentItems.length > 0) {
      await createWorkOrder(parentItems, true);
    }
    
    // Create work orders for child items
    if (childItems.length > 0) {
      await createWorkOrder(childItems, false);
    }
    
    res.status(201).json({
      workOrders: createdWorkOrders,
      items: createdWorkOrderItems,
      message: `Created ${createdWorkOrders.length} work orders with ${createdWorkOrderItems.length} items`
    });
  } catch (error) {
    console.error('Error generating work orders for project:', error);
    res.status(500).json({ error: 'Failed to generate work orders' });
  }
});