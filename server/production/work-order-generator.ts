import { Request, Response } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { 
  projects, projectItems, workOrders, workOrderItems, 
  masterItems, itemComponents
} from '@shared/schema';

/**
 * Optimized implementation of work order generation
 * This function improves performance with:
 * 1. Parallel data fetching to reduce database roundtrips
 * 2. Efficient filtering with Set for O(1) lookups
 * 3. Bulk database operations for faster inserts
 * 4. Optimized work order number generation without redundant queries
 */
export async function generateWorkOrders(req: Request, res: Response) {
  const startTime = Date.now();
  console.time('work-order-generation-total');
  
  try {
    const projectId = parseInt(req.params.projectId);
    const { confirm } = req.body;
    
    // Check if project ID is valid
    if (isNaN(projectId)) {
      console.log('Invalid project ID:', req.params.projectId);
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Verify user has permission
    const canManage = (role: string) => {
      return ['Superuser', 'Administrator', 'General Manager', 'Senior Manager', 'Manager'].includes(role);
    };
    
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to create work orders' });
    }
    
    console.time('initial-data-fetch');
    
    // OPTIMIZATION: Fetch all required data in parallel
    const [project, existingWorkOrders, projectItemsList, workOrderNumbers] = await Promise.all([
      // Get project details
      db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      }),
      
      // Get existing work orders
      db.query.workOrders.findMany({
        where: eq(workOrders.projectId, projectId)
      }),
      
      // Get project items
      db.query.projectItems.findMany({
        where: eq(projectItems.projectId, projectId)
      }),
      
      // Get all work order numbers for uniqueness check
      db.query.workOrders.findMany({
        columns: { workOrderNumber: true },
        where: eq(workOrders.projectId, projectId)
      })
    ]);
    
    console.timeEnd('initial-data-fetch');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (projectItemsList.length === 0) {
      return res.status(404).json({ error: 'No items found for this project' });
    }
    
    console.time('master-items-fetch');
    
    // Get master items for the project
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsData = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create lookup map for faster access
    const masterItemsMap = new Map();
    masterItemsData.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    console.timeEnd('master-items-fetch');
    
    console.time('item-processing');
    
    // Filter "Make" items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem && masterItem.makeOrBuy === 'Make';
    });
    
    if (makeItems.length === 0) {
      return res.status(400).json({ error: 'No "Make" items found for this project' });
    }
    
    // Get relationships and work order items in parallel
    const [existingWorkOrderItems, itemComponentRelationships] = await Promise.all([
      // Only fetch existing items if we have work orders
      existingWorkOrders.length > 0 
        ? db.query.workOrderItems.findMany({
            where: inArray(workOrderItems.workOrderId, existingWorkOrders.map(wo => wo.id))
          })
        : Promise.resolve([]),
          
      // Get component relationships
      db.query.itemComponents.findMany({
        where: inArray(itemComponents.parentItemId, masterItemIds)
      })
    ]);
    
    // Get component master items if any
    const componentItemIds = itemComponentRelationships.map(rel => rel.componentItemId);
    if (componentItemIds.length > 0) {
      const componentMasterItems = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, componentItemIds)
      });
      
      // Add to master items map
      componentMasterItems.forEach(item => {
        if (!masterItemsMap.has(item.id)) {
          masterItemsMap.set(item.id, item);
        }
      });
    }
    
    // Create relationship maps
    const parentToChildMap = new Map<number, number[]>();
    const childToParentMap = new Map<number, number>();
    
    itemComponentRelationships.forEach(rel => {
      if (!parentToChildMap.has(rel.parentItemId)) {
        parentToChildMap.set(rel.parentItemId, []);
      }
      parentToChildMap.get(rel.parentItemId)!.push(rel.componentItemId);
      childToParentMap.set(rel.componentItemId, rel.parentItemId);
    });
    
    // Filter out items that already have work orders
    let filteredItems = makeItems;
    if (existingWorkOrderItems.length > 0) {
      const existingItemIds = new Set(existingWorkOrderItems.map(item => item.projectItemId));
      filteredItems = makeItems.filter(item => !existingItemIds.has(item.id));
      
      if (filteredItems.length === 0) {
        return res.status(200).json({ 
          message: 'All applicable items already have work orders', 
          itemCount: 0,
          items: []
        });
      }
    }
    
    // If not confirmed, just return the count
    if (!confirm) {
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'Please confirm to generate work orders',
        itemCount: filteredItems.length
      });
    }
    
    // Categorize items
    const parentItems: typeof makeItems = [];
    const childItems: typeof makeItems = [];
    const parentsWithComponents = new Set<number>();
    
    filteredItems.forEach(item => {
      const masterItemId = item.itemId;
      
      if (childToParentMap.has(masterItemId)) {
        childItems.push(item);
      } else {
        parentItems.push(item);
        
        if (parentToChildMap.has(masterItemId)) {
          parentsWithComponents.add(masterItemId);
        }
      }
    });
    
    // Create virtual components
    const virtualChildItems: typeof makeItems = [];
    
    parentsWithComponents.forEach(parentItemId => {
      const parentProjectItem = filteredItems.find(item => item.itemId === parentItemId);
      if (!parentProjectItem) return;
      
      const componentItemIds = parentToChildMap.get(parentItemId) || [];
      const parentQuantity = typeof parentProjectItem.quantity === 'string' 
        ? parseFloat(parentProjectItem.quantity) 
        : parentProjectItem.quantity;
      
      const validParentQuantity = !isNaN(parentQuantity) && parentQuantity > 0 
        ? parentQuantity 
        : 1;
      
      componentItemIds.forEach(componentItemId => {
        // Skip if already exists as a project item
        if (filteredItems.some(item => item.itemId === componentItemId)) return;
        
        const masterComponentItem = masterItemsMap.get(componentItemId);
        if (masterComponentItem && masterComponentItem.makeOrBuy === 'Make') {
          virtualChildItems.push({
            id: -(Math.abs(componentItemId)),
            projectId: parentProjectItem.projectId,
            projectCode: project.code,
            itemId: componentItemId,
            quantity: validParentQuantity.toString(),
            notes: `Virtual component of ${masterItemsMap.get(parentItemId)?.itemCode || 'parent item'}`,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            actualCost: null,
            estimatedCost: null
          });
        }
      });
    });
    
    // Add virtual items to child items
    childItems.push(...virtualChildItems);
    console.timeEnd('item-processing');
    
    console.time('work-order-creation');
    
    // Create a set of existing work order numbers
    const existingWorkOrderNumbers = new Set(workOrderNumbers.map(wo => wo.workOrderNumber));
    
    // Default dates
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 30); // 30 days schedule
    
    // Generate work order numbers
    let seqNumberCounter = existingWorkOrders.length + 1;
    // Create a mapping of indices to work order numbers
    const parentWorkOrderMap: Record<string, string> = {};
    
    // Generate parent work order numbers
    parentItems.forEach((_, index) => {
      let workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      
      // Ensure uniqueness
      while (existingWorkOrderNumbers.has(workOrderNumber)) {
        seqNumberCounter++;
        workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      }
      
      parentWorkOrderMap[`parent-${index}`] = workOrderNumber;
      existingWorkOrderNumbers.add(workOrderNumber);
      seqNumberCounter++;
    });
    
    // Prepare bulk insert arrays
    const workOrdersToCreate = [];
    const workOrderItemsToCreate = [];
    const workOrdersMap = new Map<string, any>();
    
    // Create parent work orders
    for (let i = 0; i < parentItems.length; i++) {
      const parentItem = parentItems[i];
      const masterItem = masterItemsMap.get(parentItem.itemId);
      const workOrderNumber = parentWorkOrderMap[`parent-${i}`];
      
      if (!masterItem) continue;
      
      const title = `${masterItem.itemCode} - ${masterItem.description || 'Item'}`;
      const description = `Work order for parent item: ${masterItem.itemCode}`;
      
      // Convert quantity
      const quantity = typeof parentItem.quantity === 'string' 
        ? parseFloat(parentItem.quantity) 
        : parentItem.quantity;
      
      const validQuantity = !isNaN(quantity) && quantity > 0 ? quantity : 1;
      
      // Get drawing number
      const drawingNo = masterItem.drawingNo && masterItem.drawingNo.trim() !== '' 
        ? masterItem.drawingNo 
        : null;
      
      // Create work order object
      const workOrder = {
        projectId,
        projectCode: project.code,
        workOrderNumber,
        title,
        description,
        status: 'planned',
        priority: 'Medium',
        plannedStartDate: today,
        plannedEndDate: endDate,
        quantity: validQuantity,
        supervisorId: req.user!.id,
        createdBy: req.user!.id,
        createdAt: today,
        updatedAt: today,
        batchNumber: drawingNo
      };
      
      workOrdersToCreate.push(workOrder);
      
      // Create work order item
      const unit = masterItem.uom || masterItem.unit || 'EA';
      
      const workOrderItem = {
        tempWorkOrderIndex: workOrdersToCreate.length - 1,
        projectItemId: parentItem.id,
        quantity: validQuantity,
        unit,
        status: 'pending',
        sequenceNumber: 1,
        notes: `Auto-generated for project ${project.code}`,
        createdAt: today,
        updatedAt: today
      };
      
      workOrderItemsToCreate.push(workOrderItem);
      
      // Store for child relationships
      workOrdersMap.set(parentItem.itemId.toString(), { 
        workOrderNumber,
        tempIndex: workOrdersToCreate.length - 1 
      });
    }
    
    // Handle child items
    for (const childItem of childItems) {
      const masterItem = masterItemsMap.get(childItem.itemId);
      const parentItemId = childToParentMap.get(childItem.itemId);
      const parentInfo = parentItemId ? workOrdersMap.get(parentItemId.toString()) : null;
      
      if (!masterItem) continue;
      
      // Either use parent's work order number with suffix or create a new one
      let workOrderNumber;
      
      if (parentInfo) {
        workOrderNumber = `${parentInfo.workOrderNumber}-SUB`;
      } else {
        workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
        
        while (existingWorkOrderNumbers.has(workOrderNumber)) {
          seqNumberCounter++;
          workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
        }
        
        existingWorkOrderNumbers.add(workOrderNumber);
        seqNumberCounter++;
      }
      
      // Create title and description
      const title = `${masterItem.itemCode} - ${masterItem.description || 'Component'}`;
      const description = parentItemId 
        ? `Sub-assembly component for parent item ${masterItemsMap.get(parentItemId)?.itemCode || ''}`
        : `Sub-assembly component for project ${project.code}`;
      
      // Convert quantity
      const quantity = typeof childItem.quantity === 'string' 
        ? parseFloat(childItem.quantity) 
        : childItem.quantity;
      
      const validQuantity = !isNaN(quantity) && quantity > 0 ? quantity : 1;
      
      // Create child work order
      const childWorkOrder = {
        projectId,
        projectCode: project.code,
        workOrderNumber,
        title,
        description,
        status: 'planned',
        priority: 'Medium',
        plannedStartDate: today,
        plannedEndDate: endDate,
        quantity: validQuantity,
        supervisorId: req.user!.id,
        createdBy: req.user!.id,
        createdAt: today,
        updatedAt: today
      };
      
      workOrdersToCreate.push(childWorkOrder);
      
      // For virtual items, handle project item IDs carefully
      const isVirtual = childItem.id < 0;
      let projectItemId = childItem.id;
      let itemNotes = `Auto-generated component for project ${project.code}`;
      
      if (isVirtual && parentItemId) {
        // Use parent's project item ID for virtual items
        const parentProjectItem = parentItems.find(item => item.itemId === parentItemId);
        if (parentProjectItem) {
          projectItemId = parentProjectItem.id;
          itemNotes = `Virtual component of parent item ${masterItemsMap.get(parentItemId)?.itemCode || ''}`;
        }
      }
      
      const unit = masterItem.uom || masterItem.unit || 'EA';
      
      const childWorkOrderItem = {
        tempWorkOrderIndex: workOrdersToCreate.length - 1,
        projectItemId,
        quantity: validQuantity,
        unit,
        status: 'pending',
        sequenceNumber: 1,
        notes: itemNotes,
        createdAt: today,
        updatedAt: today
      };
      
      workOrderItemsToCreate.push(childWorkOrderItem);
    }
    
    // Insert work orders in bulk
    const createdWorkOrders = await db.insert(workOrders)
      .values(workOrdersToCreate)
      .returning();
    
    // Map work order items to their created work orders
    const finalWorkOrderItems = workOrderItemsToCreate.map(item => {
      const { tempWorkOrderIndex, ...rest } = item as any;
      return {
        ...rest,
        workOrderId: createdWorkOrders[tempWorkOrderIndex].id
      };
    });
    
    // Insert work order items in bulk
    const createdWorkOrderItems = await db.insert(workOrderItems)
      .values(finalWorkOrderItems)
      .returning();
    
    console.timeEnd('work-order-creation');
    console.timeEnd('work-order-generation-total');
    
    const executionTime = Date.now() - startTime;
    
    // Return success response
    return res.status(201).json({
      message: 'Successfully generated work orders',
      workOrders: createdWorkOrders,
      items: createdWorkOrderItems,
      itemCount: filteredItems.length,
      parentItemCount: parentItems.length,
      childItemCount: childItems.length,
      executionTime: `${executionTime}ms`
    });
    
  } catch (error: any) {
    console.error('Error generating work orders:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate work orders' 
    });
  }
}