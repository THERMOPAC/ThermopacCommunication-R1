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
    const { confirm, newComponentsOnly = false } = req.body;
    
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
      console.log(`Parent item ${parentItem.itemId} (${masterItemsMap.get(parentItem.itemId)?.itemCode}) has ${children.length} component children`);
      
      children.forEach((childId: number) => {
        console.log(`  - Adding component: ${childId} (${masterItemsMap.get(childId)?.itemCode || 'Unknown Item'})`);
        componentMasterItemIds.add(childId);
      });
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
    
    // Step 8: Get existing work order items in the current project
    const existingWorkOrderItems = existingWorkOrders.length > 0 
      ? await db.query.workOrderItems.findMany({
          where: inArray(workOrderItems.workOrderId, existingWorkOrders.map(wo => wo.id))
        })
      : [];
    
    // Get related projects (projects from the same customer/client)
    let relatedProjectIds: number[] = [];
    if (project.customerId) {
      try {
        // Use SQL to avoid TypeScript issues with column types
        const result = await db.execute(
          sql`SELECT id FROM projects WHERE customer_id = ${project.customerId}`
        );
        
        // Convert SQL result to a proper array of IDs
        if (result && Array.isArray(result)) {
          relatedProjectIds = result.map((row: any) => row.id).filter(Boolean);
        } else if (result && result.rows && Array.isArray(result.rows)) {
          relatedProjectIds = result.rows.map((row: any) => row.id).filter(Boolean);
        }
      } catch (error) {
        console.error('Error fetching related projects:', error);
      }
    }
    
    // Filter out the current project from related projects
    relatedProjectIds = relatedProjectIds.filter(id => id !== projectId);
    
    console.log(`Found ${relatedProjectIds.length} related projects for cross-project component check`);
    
    // Get work orders from related projects
    let crossProjectWorkOrderItems: any[] = [];
    if (relatedProjectIds.length > 0) {
      const relatedWorkOrders = await db.query.workOrders.findMany({
        where: inArray(workOrders.projectId, relatedProjectIds)
      });
      
      if (relatedWorkOrders.length > 0) {
        console.log(`Found ${relatedWorkOrders.length} work orders in related projects`);
        
        // Get work order items from related projects
        crossProjectWorkOrderItems = await db.query.workOrderItems.findMany({
          where: inArray(workOrderItems.workOrderId, relatedWorkOrders.map(wo => wo.id))
        });
        
        console.log(`Found ${crossProjectWorkOrderItems.length} work order items in related projects`);
      }
    }
    
    const existingProjectItemIds = new Set(existingWorkOrderItems.map(item => item.projectItemId));
    
    // Step 9: Filter out project items that already have work orders
    console.log(`Filtering out items that already have work orders`);
    let filteredMakeParentItems = makeParentItems.filter(item => 
      !existingProjectItemIds.has(item.id)
    );
    
    // If we're only handling new components and all parent items already have work orders,
    // we need to find the parent items with existing work orders that have new components
    if (newComponentsOnly && filteredMakeParentItems.length === 0 && existingWorkOrderItems.length > 0) {
      console.log('Checking for new components on existing parent items...');
      
      // Get existing work order items to find which components already have work orders
      const existingComponentIds = new Set<number>();
      
      // Identify components that already have work order items
      try {
        // Using direct query to avoid schema mismatches
        const currentItemsQuery = await db.query.workOrderItems.findMany({
          where: inArray(workOrderItems.id, existingWorkOrderItems.map(item => item.id))
        });
        
        for (const item of currentItemsQuery) {
          // Cast to any to work with extended schema properties
          const typedItem = item as any;
          
          if (typedItem.isVirtual && typedItem.itemType === 'Child' && typedItem.itemCode) {
            const masterItem = masterItemsArray.find(m => m.itemCode === typedItem.itemCode);
            if (masterItem) {
              existingComponentIds.add(masterItem.id);
              console.log(`Existing component identified: ${masterItem.itemCode} (${masterItem.id})`);
            }
          }
        }
      } catch (error) {
        console.error('Error checking existing components:', error);
      }
      
      // Find parent items that have new components
      const parentsWithNewComponents = makeParentItems.filter(parentItem => {
        const components = parentToChildrenMap.get(parentItem.itemId) || [];
        
        // Check if any component doesn't have a work order yet
        return components.some(componentId => !existingComponentIds.has(componentId));
      });
      
      // Use these parent items for creating work orders for their new components
      if (parentsWithNewComponents.length > 0) {
        console.log(`Found ${parentsWithNewComponents.length} parent items with new components`);
        filteredMakeParentItems = parentsWithNewComponents;
      } else {
        return res.status(200).json({ 
          message: 'No new components found for existing parent items', 
          itemCount: 0,
          items: []
        });
      }
    } else if (filteredMakeParentItems.length === 0 && existingWorkOrderItems.length > 0) {
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
    
    // Collect existing component IDs that already have work orders when in newComponentsOnly mode
    const existingComponentIds = new Set<number>();
    
    if (newComponentsOnly) {
      console.log('Identifying components that already have work orders...');
      
      // Create a mapping of item codes to master items for faster lookup
      const masterItemsByCode = new Map();
      masterItemsArray.forEach(item => {
        if (item.itemCode) masterItemsByCode.set(item.itemCode, item);
      });
      
      // Check current project work orders
      if (existingWorkOrderItems.length > 0) {
        try {
          // Get current project work order details
          const currentItemsQuery = await db.query.workOrderItems.findMany({
            where: inArray(workOrderItems.id, existingWorkOrderItems.map(item => item.id))
          });
          
          for (const item of currentItemsQuery) {
            // Cast to any to work with extended schema properties
            const typedItem = item as any;
            
            if (typedItem.isVirtual && typedItem.itemType === 'Child' && typedItem.itemCode) {
              const masterItem = masterItemsByCode.get(typedItem.itemCode) || 
                                masterItemsArray.find(m => m.itemCode === typedItem.itemCode);
                                
              if (masterItem) {
                existingComponentIds.add(masterItem.id);
                console.log(`Current project component identified: ${masterItem.itemCode} (${masterItem.id})`);
              }
            }
          }
        } catch (error) {
          console.error('Error checking current project components:', error);
        }
      }
      
      // Check related projects work orders
      if (crossProjectWorkOrderItems.length > 0) {
        try {
          console.log('Checking for components in related projects...');
          
          // Get cross-project work order details
          const crossItemsQuery = await db.query.workOrderItems.findMany({
            where: inArray(workOrderItems.id, crossProjectWorkOrderItems.map(item => item.id))
          });
          
          for (const item of crossItemsQuery) {
            // Cast to any to work with extended schema properties
            const typedItem = item as any;
            
            if (typedItem.isVirtual && typedItem.itemType === 'Child' && typedItem.itemCode) {
              const masterItem = masterItemsByCode.get(typedItem.itemCode) || 
                                masterItemsArray.find(m => m.itemCode === typedItem.itemCode);
                                
              if (masterItem) {
                existingComponentIds.add(masterItem.id);
                console.log(`Cross-project component identified: ${masterItem.itemCode} (${masterItem.id})`);
              }
            }
          }
        } catch (error) {
          console.error('Error checking cross-project components:', error);
        }
      }
    }
    
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
        
        // Skip components that already have work orders when in newComponentsOnly mode
        if (newComponentsOnly && existingComponentIds.has(componentId)) {
          console.log(`Component ${componentId} already has a work order - skipping`);
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
    
    // Get information about cross-project components if any
    const crossProjectInfo = crossProjectWorkOrderItems.length > 0 ? {
      count: crossProjectWorkOrderItems.length,
      projectCodes: Array.from(new Set(crossProjectWorkOrderItems.map(item => item.projectCode))).join(', ')
    } : null;
    
    // If not confirmed, prepare preview data with item details
    if (!confirm) {
      // Prepare preview items for parent items
      const parentPreviewItems = filteredMakeParentItems.map((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        return {
          sequenceNumber: index + 1,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: item.quantity,
          unit: masterItem?.uom || 'EA',
          makeOrBuy: 'Make',
          itemType: 'Parent',
          parentItemCode: null
        };
      });
      
      // Prepare preview items for virtual component items
      const componentPreviewItems = virtualComponentItems.map((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        const parentMasterItem = item.parentItemId ? masterItemsMap.get(item.parentItemId) : null;
        return {
          sequenceNumber: index + 1,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: item.quantity,
          unit: masterItem?.uom || 'EA',
          makeOrBuy: 'Make',
          itemType: 'Child',
          parentItemCode: parentMasterItem?.itemCode || 'Unknown',
          isVirtual: true
        };
      });
      
      // Generate sample work order numbers for preview
      const nextSeqNumber = existingWorkOrders.length + 1;
      const parentWorkOrderNumber = `WO-${project.code}-${nextSeqNumber}`;
      
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'Please confirm to generate work orders',
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        itemCount: filteredMakeParentItems.length + virtualComponentItems.length,
        parentCount: filteredMakeParentItems.length,
        componentCount: virtualComponentItems.length,
        parentWorkOrderNumber,
        items: [...parentPreviewItems, ...componentPreviewItems],
        willCreateSeparateOrders: filteredMakeParentItems.length > 0 && virtualComponentItems.length > 0,
        crossProjectComponents: crossProjectInfo
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
      
      // Use parent's work order number with a child sequence number (e.g., WO-2526-3-1-1)
      // Start with child sequence number 1
      let childSequence = 1;
      let workOrderNumber = `${parentInfo.workOrderNumber}-${childSequence}`;
      
      // Check if this work order number already exists
      while (existingWorkOrderNumbers.has(workOrderNumber)) {
        // Increment the child sequence number
        childSequence++;
        workOrderNumber = `${parentInfo.workOrderNumber}-${childSequence}`;
      }
      
      // Add to our tracking set
      existingWorkOrderNumbers.add(workOrderNumber);
      
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
      
      // For virtual components, we need to use a real project item ID
      // We'll use the parent's project item ID instead of the virtual negative ID
      console.log(`Creating child work order item with component ID: ${component.id} (virtual)`);
      
      // Find parent project item for this component
      const componentParentItemId = childToParentMap.get(component.itemId);
      // Find a parent project item to use instead of the virtual negative ID
      const parentProjectItem = projectItemsList.find(item => item.itemId === componentParentItemId);
      const projectItemId = parentProjectItem?.id || projectItemsList[0].id; // Fallback to first project item if parent not found
      
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
        notes: `Sub-assembly of ${masterItemsMap.get(componentParentItemId)?.itemCode}`,
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
    
    // Return success message with cross-project component info if any
    return res.status(201).json({
      message: 'Work orders created successfully', 
      count: createdWorkOrders.length,
      parentCount: filteredMakeParentItems.length,
      componentCount: virtualComponentItems.length,
      crossProjectComponents: crossProjectInfo
    });
  } catch (error: any) {
    console.error('Error generating direct work orders:', error);
    
    // Special handling for PostgreSQL constraint violations
    if (error.code === '23505') {
      // Unique constraint violation
      const duplicateKey = error.detail ? error.detail.match(/\((.*?)\)=\((.*?)\)/) : null;
      const keyName = duplicateKey ? duplicateKey[1] : 'unknown';
      const keyValue = duplicateKey ? duplicateKey[2] : 'unknown';
      
      // Clear the work orders for this project first
      if (keyName === 'work_order_number') {
        return res.status(409).json({ 
          error: 'Work order number conflict',
          details: `A work order with number ${keyValue} already exists. Please clean up existing work orders first.`,
          suggestion: 'Use the "Clean Up Existing Orders" button and try again.'
        });
      }
    } else if (error.code === '23503') {
      // Foreign key constraint violation
      const match = error.detail ? error.detail.match(/Key \((.*?)\)=\((.*?)\) is not present in table "(.*?)"/) : null;
      
      if (match) {
        const [_, keyName, keyValue, tableName] = match;
        
        if (keyName === 'project_item_id' && keyValue.startsWith('-')) {
          return res.status(422).json({ 
            error: 'Virtual component reference error',
            details: `Cannot reference virtual component ID ${keyValue} directly. Please check the component linking.`,
            suggestion: 'This is a system error. Contact your administrator.'
          });
        }
        
        return res.status(422).json({ 
          error: 'Database reference error',
          details: `The ${keyName} with value ${keyValue} does not exist in table ${tableName}.`,
          suggestion: 'This is a system error. Contact your administrator.'
        });
      }
    }
    
    return res.status(500).json({ error: 'Failed to generate work orders', details: error.message || 'Unknown error' });
  }
}