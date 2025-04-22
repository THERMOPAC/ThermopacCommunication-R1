import { Request, Response } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { 
  projects, projectItems, workOrders, workOrderItems, 
  masterItems, itemComponents
} from '@shared/schema';

/**
 * Improved implementation of work order generation that correctly handles sub-assembly components
 * This function specifically addresses the issue where work orders were not being created
 * for child components of parent items that have makeOrBuy = 'Make'
 */
export async function generateImprovedWorkOrders(req: Request, res: Response) {
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
    const [project, existingWorkOrders, projectItemsList, allWorkOrdersByNumber] = await Promise.all([
      // Get project details
      db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      }),
      
      // Get existing work orders
      db.query.workOrders.findMany({
        where: eq(workOrders.projectId, projectId)
      }),
      
      // Get all project items
      db.query.projectItems.findMany({
        where: eq(projectItems.projectId, projectId)
      }),
      
      // Get all work order numbers for this project to avoid duplicates
      db.select({
        workOrderNumber: workOrders.workOrderNumber
      }).from(workOrders).where(eq(workOrders.projectId, projectId))
    ]);
    
    console.timeEnd('initial-data-fetch');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (projectItemsList.length === 0) {
      return res.status(404).json({ error: 'No items found for this project' });
    }
    
    console.time('master-items-fetch');
    
    // Get all master items details for the project items
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
    
    console.time('relationship-fetch');
    
    // Get component relationships
    const itemComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, masterItemIds)
    });
    
    // Get all component master items if any
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
    
    console.timeEnd('relationship-fetch');
    
    console.time('item-processing');
    
    // Filter for "Make" items AND their child components
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      
      // Include items marked as "Make"
      if (masterItem && masterItem.makeOrBuy === 'Make') {
        return true;
      }
      
      // Include child components of "Make" parent items
      if (childToParentMap.has(item.itemId)) {
        const parentItemId = childToParentMap.get(item.itemId);
        const parentItem = masterItemsMap.get(parentItemId!);
        return parentItem && parentItem.makeOrBuy === 'Make';
      }
      
      return false;
    });
    
    if (makeItems.length === 0) {
      return res.status(400).json({ error: 'No "Make" items found for this project' });
    }
    
    // Get existing work order items
    const existingWorkOrderItems = existingWorkOrders.length > 0 
      ? await db.query.workOrderItems.findMany({
          where: inArray(workOrderItems.workOrderId, existingWorkOrders.map(wo => wo.id))
        })
      : [];
    
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
    
    // Create virtual components for parent items
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
        // NOTE: We are no longer checking makeOrBuy for child components because
        // parent-child relationships are already captured in the component hierarchy
        if (masterComponentItem) {
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
    
    console.time('work-order-number-generation');
    
    // Create a set of existing work order numbers for faster lookups
    const existingWorkOrderNumbers = new Set(allWorkOrdersByNumber.map(wo => wo.workOrderNumber));
    
    // Set default dates
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 30); // Default to 30 days schedule
    
    // OPTIMIZATION: Generate work order numbers without database queries
    let seqNumberCounter = existingWorkOrders.length + 1;
    const workOrderNumbers: { [key: string]: string } = {};
    
    // Parent work order numbers
    parentItems.forEach((_, index) => {
      let workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      
      // Ensure uniqueness
      while (existingWorkOrderNumbers.has(workOrderNumber)) {
        seqNumberCounter++;
        workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      }
      
      // Store the work order number
      workOrderNumbers[`parent-${index}`] = workOrderNumber;
      existingWorkOrderNumbers.add(workOrderNumber); // Add to set to prevent duplicates
      seqNumberCounter++;
    });
    
    console.timeEnd('work-order-number-generation');
    
    console.time('work-order-creation');
    
    // Prepare bulk insert arrays
    const workOrdersToCreate = [];
    const workOrderItemsToCreate = [];
    const workOrdersMap = new Map<string, any>(); // Map to track created work orders
    
    // Create parent work orders
    for (let i = 0; i < parentItems.length; i++) {
      const parentItem = parentItems[i];
      const masterItem = masterItemsMap.get(parentItem.itemId);
      const workOrderNumber = workOrderNumbers[`parent-${i}`];
      
      if (!masterItem) continue;
      
      const title = `${masterItem.itemCode} - ${masterItem.description || 'Item'}`;
      const description = `Work order for parent item: ${masterItem.itemCode}`;
      
      // Convert quantity to number
      const quantity = typeof parentItem.quantity === 'string' 
        ? parseFloat(parentItem.quantity) 
        : parentItem.quantity;
      
      const validQuantity = !isNaN(quantity) && quantity > 0 ? quantity : 1;
      
      // Get drawing number if available
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
        batchNumber: drawingNo // Using batchNumber field to store drawing number
      };
      
      workOrdersToCreate.push(workOrder);
      
      // Create work order item
      const unit = masterItem.uom || 'EA';
      
      const workOrderItem = {
        // workOrderId will be filled after insertion
        tempWorkOrderIndex: workOrdersToCreate.length - 1, // Store index to map later
        projectItemId: parentItem.id,
        itemId: parentItem.itemId,
        itemCode: masterItem.itemCode,
        description: masterItem.description || 'No description',
        quantity: validQuantity,
        unit,
        itemType: 'Parent',
        isVirtual: false,
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
    
    // Handle child items with parent references
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
        // Create a new work order number for this child
        workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
        
        // Ensure uniqueness
        while (existingWorkOrderNumbers.has(workOrderNumber)) {
          seqNumberCounter++;
          workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
        }
        
        existingWorkOrderNumbers.add(workOrderNumber);
        seqNumberCounter++;
      }
      
      // Create a title and description
      const title = `${masterItem.itemCode} - ${masterItem.description || 'Component'}`;
      const description = parentItemId 
        ? `Sub-assembly component for parent item ${masterItemsMap.get(parentItemId)?.itemCode || ''}`
        : `Sub-assembly component for project ${project.code}`;
      
      // Convert quantity to number
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
      
      // Create work order item for the child
      const unit = masterItem.uom || 'EA';
      const isVirtual = childItem.id < 0;
      
      // For virtual items, we need to handle project item IDs carefully
      let projectItemId = childItem.id;
      let itemNotes = `Auto-generated component for project ${project.code}`;
      
      if (isVirtual && parentItemId) {
        // Find the parent project item to use its ID
        const parentProjectItem = parentItems.find(item => item.itemId === parentItemId);
        if (parentProjectItem) {
          projectItemId = parentProjectItem.id;
          itemNotes = `Virtual component of parent item ${masterItemsMap.get(parentItemId)?.itemCode || ''}`;
        }
      }
      
      const childWorkOrderItem = {
        // workOrderId will be filled after insertion
        tempWorkOrderIndex: workOrdersToCreate.length - 1, // Store index to map later
        projectItemId,
        itemId: childItem.itemId,
        itemCode: masterItem.itemCode,
        description: masterItem.description || 'No description',
        quantity: validQuantity,
        unit,
        itemType: 'Child',
        status: 'pending',
        sequenceNumber: 1,
        notes: itemNotes,
        createdAt: today,
        updatedAt: today
      };
      
      workOrderItemsToCreate.push(childWorkOrderItem);
    }
    
    // Insert all work orders in bulk
    const createdWorkOrders = await db.insert(workOrders)
      .values(workOrdersToCreate)
      .returning();
    
    // Update workOrderId references in items
    for (let i = 0; i < workOrderItemsToCreate.length; i++) {
      const item = workOrderItemsToCreate[i];
      const workOrderIndex = item.tempWorkOrderIndex;
      
      if (workOrderIndex !== undefined && createdWorkOrders[workOrderIndex]) {
        // Replace temp field with actual workOrderId
        workOrderItemsToCreate[i] = {
          ...item,
          workOrderId: createdWorkOrders[workOrderIndex].id,
        };
        
        // Remove the temp property
        delete workOrderItemsToCreate[i].tempWorkOrderIndex;
      }
    }
    
    // Insert all work order items in bulk
    await db.insert(workOrderItems)
      .values(workOrderItemsToCreate)
      .execute();
    
    console.timeEnd('work-order-creation');
    
    console.timeEnd('work-order-generation-total');
    
    // Total runtime in milliseconds
    const totalTimeMs = Date.now() - startTime;
    
    return res.status(201).json({
      message: 'Work orders generated successfully',
      count: createdWorkOrders.length,
      items: createdWorkOrders,
      processingTimeMs: totalTimeMs
    });
  } catch (error) {
    console.error('Error generating work orders:', error);
    return res.status(500).json({
      error: 'An error occurred while generating work orders',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}