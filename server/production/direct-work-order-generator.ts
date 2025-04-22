/**
 * Direct Work Order Generator
 * 
 * A completely new implementation of work order generation that addresses the issue
 * of sub-assembly components not getting work orders properly.
 * 
 * This implementation uses a more direct approach to:
 * 1. Find all "Make" parent items in a project
 * 2. Find all sub-assembly components related to those parent items
 * 3. Generate work orders for both, maintaining proper parent-child relationships
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { eq, inArray, sql } from 'drizzle-orm';
import { 
  workOrders, workOrderItems, projects, projectItems, masterItems, itemComponents 
} from '@shared/schema';

export async function generateDirectWorkOrders(req: Request, res: Response) {
  try {
    const projectId = parseInt(req.params.projectId);
    const { confirm } = req.body;
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    console.log(`Starting direct work order generation for project ${projectId}`);
    
    // Get project info
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Step 1: Get all project items
    console.log(`Getting project items for project ${projectId}`);
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (projectItemsList.length === 0) {
      return res.status(404).json({ error: 'No items found for this project' });
    }
    
    // Step 2: Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    console.log(`Getting master items for ${masterItemIds.length} project items`);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Step 3: Find all "Make" parent items
    console.log(`Identifying 'Make' items from project items`);
    const makeParentItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem && masterItem.makeOrBuy === 'Make';
    });
    
    if (makeParentItems.length === 0) {
      return res.status(400).json({ error: 'No "Make" items found for this project' });
    }
    
    console.log(`Found ${makeParentItems.length} 'Make' parent items`);
    
    // Step 4: Get component relationships for this project's items from the database
    console.log(`Getting component relationships from database`);
    // Only get relationships for the master items in this project
    const allComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, masterItemIds)
    });
    
    // Create maps for parent-child relationships
    const parentToChildrenMap = new Map<number, number[]>();
    const childToParentMap = new Map<number, number>();
    
    allComponentRelationships.forEach(rel => {
      // Parent to children mapping
      if (!parentToChildrenMap.has(rel.parentItemId)) {
        parentToChildrenMap.set(rel.parentItemId, []);
      }
      const childrenArray = parentToChildrenMap.get(rel.parentItemId);
      if (childrenArray) {
        childrenArray.push(rel.componentItemId);
      }
      
      // Child to parent mapping
      childToParentMap.set(rel.componentItemId, rel.parentItemId);
    });
    
    // Step 5: Get all sub-assembly components for our "Make" parent items
    console.log(`Finding sub-assembly components for 'Make' parent items`);
    const componentMasterItemIds = new Set<number>();
    makeParentItems.forEach(parentItem => {
      const children = parentToChildrenMap.get(parentItem.itemId) || [];
      children.forEach((childId: number) => componentMasterItemIds.add(childId));
    });
    
    // Convert Set to Array
    const componentMasterItemIdsArray = Array.from(componentMasterItemIds);
    console.log(`Found ${componentMasterItemIdsArray.length} unique component IDs`);
    
    // Step 6: Get the master items for all these components
    if (componentMasterItemIdsArray.length > 0) {
      const componentMasterItems = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, componentMasterItemIdsArray as number[])
      });
      
      // Add these to our master items map
      componentMasterItems.forEach(item => {
        if (!masterItemsMap.has(item.id)) {
          masterItemsMap.set(item.id, item);
        }
      });
    }
    
    // Step 7: Get existing work orders for this project to avoid duplicates
    console.log(`Checking existing work orders for project ${projectId}`);
    const existingWorkOrders = await db.query.workOrders.findMany({
      where: eq(workOrders.projectId, projectId)
    });
    
    // Get all work order numbers to ensure uniqueness
    const existingWorkOrderNumbers = new Set(existingWorkOrders.map(wo => wo.workOrderNumber));
    
    // Step 8: Get existing work order items
    const existingWorkOrderItems = existingWorkOrders.length > 0 
      ? await db.query.workOrderItems.findMany({
          where: inArray(workOrderItems.workOrderId, existingWorkOrders.map(wo => wo.id))
        })
      : [];
    
    const existingProjectItemIds = new Set(existingWorkOrderItems.map(item => item.projectItemId));
    
    // Step 9: Filter out project items that already have work orders
    console.log(`Filtering out items that already have work orders`);
    const filteredMakeParentItems = makeParentItems.filter(item => 
      !existingProjectItemIds.has(item.id)
    );
    
    if (filteredMakeParentItems.length === 0 && existingWorkOrderItems.length > 0) {
      return res.status(200).json({ 
        message: 'All parent items already have work orders', 
        itemCount: 0,
        items: []
      });
    }
    
    // Log filtered items
    filteredMakeParentItems.forEach(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      console.log(`Will create work order for parent: ${masterItem?.itemCode} (${item.id})`);
    });
    
    // Step 10: Prepare virtual component items for these filtered parent items
    const virtualComponentItems = [];
    const projectItemsSet = new Set(projectItemsList.map(item => item.itemId));
    
    for (const parentItem of filteredMakeParentItems) {
      const components = parentToChildrenMap.get(parentItem.itemId) || [];
      console.log(`Parent ${masterItemsMap.get(parentItem.itemId)?.itemCode} has ${components.length} components`);
      
      for (let componentId of components) {
        // Ensure componentId is a number
        componentId = Number(componentId);
        
        // Skip if component already exists as a project item
        if (projectItemsSet.has(componentId)) {
          console.log(`Component ${componentId} already exists as project item`);
          continue;
        }
        
        const componentMasterItem = masterItemsMap.get(componentId);
        if (!componentMasterItem) {
          console.log(`Component ${componentId} not found in master items`);
          continue;
        }
        
        console.log(`Creating virtual component: ${componentMasterItem.itemCode}`);
        
        // Create virtual component
        const quantity = typeof parentItem.quantity === 'string' 
          ? parseFloat(parentItem.quantity) 
          : parentItem.quantity;
        
        const validQuantity = !isNaN(quantity) && quantity > 0 ? quantity : 1;
        
        virtualComponentItems.push({
          id: -(Math.abs(componentId)), // Negative ID marks it as virtual
          projectId: parentItem.projectId,
          projectCode: project.code,
          itemId: componentId,
          quantity: validQuantity.toString(),
          parentItemId: parentItem.itemId, // Keep track of parent
          notes: `Sub-assembly of ${masterItemsMap.get(parentItem.itemId)?.itemCode}`,
          status: 'Not Started',
          createdAt: new Date(),
          updatedAt: new Date(),
          actualCost: null,
          estimatedCost: null
        });
      }
    }
    
    console.log(`Created ${virtualComponentItems.length} virtual component items`);
    
    // If not confirmed, just return the count
    if (!confirm) {
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'Please confirm to generate work orders',
        itemCount: filteredMakeParentItems.length + virtualComponentItems.length,
        parentCount: filteredMakeParentItems.length,
        componentCount: virtualComponentItems.length
      });
    }
    
    // Step 11: Set up work order creation arrays
    console.log(`Preparing to create work orders`);
    const workOrdersToCreate = [];
    const workOrderItemsToCreate = [];
    const workOrdersMap = new Map();
    
    // Set default dates
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 30); // Default to 30 days schedule
    
    // Generate sequence numbers for work orders
    let seqNumberCounter = existingWorkOrders.length + 1;
    
    // Step 12: Create parent work orders first
    for (const parentItem of filteredMakeParentItems) {
      const masterItem = masterItemsMap.get(parentItem.itemId);
      if (!masterItem) continue;
      
      let workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      
      // Ensure uniqueness
      while (existingWorkOrderNumbers.has(workOrderNumber)) {
        seqNumberCounter++;
        workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      }
      
      existingWorkOrderNumbers.add(workOrderNumber);
      seqNumberCounter++;
      
      // Create parent work order
      const title = `${masterItem.itemCode} - ${masterItem.description || 'Item'}`;
      const description = `Work order for parent item: ${masterItem.itemCode}`;
      
      // Convert quantity to number
      const quantity = typeof parentItem.quantity === 'string' 
        ? parseFloat(parentItem.quantity) 
        : parentItem.quantity;
      
      const validQuantity = !isNaN(quantity) && quantity > 0 ? quantity : 1;
      
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
        quantity: validQuantity.toString(), // Convert to string for database compatibility
        supervisorId: req.user!.id,
        createdBy: req.user!.id,
        createdAt: today,
        updatedAt: today,
        batchNumber: masterItem.drawingNo || null
      };
      
      workOrdersToCreate.push(workOrder);
      
      // Create work order item for this parent
      const unit = masterItem.uom || 'EA';
      
      const workOrderItem = {
        tempWorkOrderIndex: workOrdersToCreate.length - 1,
        projectItemId: parentItem.id,
        itemCode: masterItem.itemCode,
        description: masterItem.description || 'No description',
        quantity: validQuantity.toString(), // Convert to string for database compatibility
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
    
    // Step 13: Create component work orders
    for (const component of virtualComponentItems) {
      const masterItem = masterItemsMap.get(component.itemId);
      const parentItemId = component.parentItemId;
      const parentInfo = parentItemId ? workOrdersMap.get(parentItemId.toString()) : null;
      
      if (!masterItem || !parentInfo) continue;
      
      // Use parent's work order number with SUB suffix
      const workOrderNumber = `${parentInfo.workOrderNumber}-SUB`;
      
      // Create sub-assembly work order
      const title = `${masterItem.itemCode} - ${masterItem.description || 'Component'}`;
      const description = `Sub-assembly component for parent item ${masterItemsMap.get(parentItemId)?.itemCode}`;
      
      // Convert quantity to number
      const quantity = typeof component.quantity === 'string' 
        ? parseFloat(component.quantity) 
        : component.quantity;
      
      const validQuantity = !isNaN(quantity) && quantity > 0 ? quantity : 1;
      
      // Create work order object
      const componentWorkOrder = {
        projectId,
        projectCode: project.code,
        workOrderNumber,
        title,
        description,
        status: 'planned',
        priority: 'Medium',
        plannedStartDate: today,
        plannedEndDate: endDate,
        quantity: validQuantity.toString(), // Convert to string for database compatibility
        supervisorId: req.user!.id,
        createdBy: req.user!.id,
        createdAt: today,
        updatedAt: today,
        batchNumber: masterItem.drawingNo || null
      };
      
      workOrdersToCreate.push(componentWorkOrder);
      
      // Create work order item for this component
      const unit = masterItem.uom || 'EA';
      
      // Find parent project item to use its ID
      const parentItem = filteredMakeParentItems.find(item => item.itemId === parentItemId);
      const projectItemId = parentItem?.id || component.id;
      
      const componentWorkOrderItem = {
        tempWorkOrderIndex: workOrdersToCreate.length - 1,
        projectItemId: projectItemId,
        itemCode: masterItem.itemCode,
        description: masterItem.description || 'No description',
        quantity: validQuantity.toString(), // Convert to string for database compatibility
        unit,
        itemType: 'Child',
        isVirtual: true,
        status: 'pending',
        sequenceNumber: 1,
        notes: `Sub-assembly of ${masterItemsMap.get(parentItemId)?.itemCode}`,
        createdAt: today,
        updatedAt: today
      };
      
      workOrderItemsToCreate.push(componentWorkOrderItem);
    }
    
    console.log(`Ready to create ${workOrdersToCreate.length} work orders with ${workOrderItemsToCreate.length} items`);
    
    // Step 14: Insert all work orders in bulk
    // Convert quantity to number to match schema
    const workOrdersToCreateFixed = workOrdersToCreate.map(wo => ({
      ...wo,
      quantity: Number(wo.quantity) // Convert string to number for database
    }));
    
    const createdWorkOrders = await db.insert(workOrders)
      .values(workOrdersToCreateFixed)
      .returning();
    
    // Step 15: Update work order IDs in items
    const finalWorkOrderItems = workOrderItemsToCreate.map(item => {
      const workOrderIndex = item.tempWorkOrderIndex;
      const { tempWorkOrderIndex, ...rest } = item;
      
      return {
        ...rest,
        workOrderId: createdWorkOrders[workOrderIndex].id
      };
    });
    
    // Step 16: Insert all work order items
    await db.insert(workOrderItems)
      .values(finalWorkOrderItems);
    
    // Return success message
    return res.status(201).json({
      message: 'Work orders created successfully', 
      count: createdWorkOrders.length,
      parentCount: filteredMakeParentItems.length,
      componentCount: virtualComponentItems.length
    });
  } catch (error) {
    console.error('Error generating direct work orders:', error);
    return res.status(500).json({ error: 'Failed to generate work orders' });
  }
}