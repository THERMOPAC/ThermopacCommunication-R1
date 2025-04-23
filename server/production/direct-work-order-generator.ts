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

/**
 * Add a dedicated function to clean up any duplicate work orders before creating new ones
 * @param projectId The project ID to clean duplicate work orders for
 */
export async function cleanupDuplicateWorkOrders(projectId: number) {
  try {
    console.log('Checking for duplicate work orders to clean up...');
    
    // Find all duplicate work orders for components in this project
    const duplicatesQuery = await db.execute(sql`
      WITH component_work_orders AS (
        SELECT 
          wo.id,
          wo.work_order_number,
          wo.title,
          SUBSTRING(wo.work_order_number FROM 1 FOR POSITION('-' IN SUBSTRING(wo.work_order_number FROM 4))) as parent_wo_base
        FROM work_orders wo
        WHERE wo.project_id = ${projectId}
          AND wo.work_order_number LIKE 'WO-%-%-%'  -- This matches child work orders
      )
      SELECT 
        title,
        parent_wo_base,
        array_agg(id) as duplicate_ids,
        array_agg(work_order_number) as duplicate_numbers
      FROM component_work_orders
      GROUP BY title, parent_wo_base
      HAVING COUNT(*) > 1
    `);
    
    const duplicates = duplicatesQuery.rows || duplicatesQuery;
    
    if (!Array.isArray(duplicates) || duplicates.length === 0) {
      console.log('No duplicate work orders found.');
      return;
    }
    
    console.log(`Found ${duplicates.length} groups of duplicate work orders to clean up.`);
    
    // For each set of duplicates, keep the one with the lowest sequence number and delete others
    for (const duplicate of duplicates) {
      if (!duplicate.duplicate_ids || !Array.isArray(duplicate.duplicate_ids)) {
        continue;
      }
      
      console.log(`Processing duplicates for ${duplicate.title} under parent base ${duplicate.parent_wo_base}`);
      console.log(`Duplicate work order numbers: ${duplicate.duplicate_numbers.join(', ')}`);
      
      // Sort the work order IDs by their sequence number (extracted from work_order_number)
      const sortedIds = [...duplicate.duplicate_ids];
      const sortedNumbers = [...duplicate.duplicate_numbers];
      
      // Sort arrays together based on the work order number
      const combined = sortedNumbers.map((num, index) => ({
        number: num,
        id: sortedIds[index]
      }));
      
      combined.sort((a, b) => {
        // Extract the sequence number from the end of the work order number
        const seqA = parseInt(a.number.split('-').pop() || '0');
        const seqB = parseInt(b.number.split('-').pop() || '0');
        return seqA - seqB;
      });
      
      // Keep the first one (lowest sequence) and delete the rest
      const toKeep = combined[0].id;
      const toDelete = combined.slice(1).map(item => item.id);
      
      console.log(`Keeping work order ID ${toKeep}, deleting IDs: ${toDelete.join(', ')}`);
      
      if (toDelete.length > 0) {
        // First delete the work order items
        await db.execute(sql`
          DELETE FROM work_order_items
          WHERE work_order_id IN (${sql.join(toDelete)})
        `);
        
        // Then delete the work orders
        await db.execute(sql`
          DELETE FROM work_orders
          WHERE id IN (${sql.join(toDelete)})
        `);
        
        console.log(`Successfully deleted ${toDelete.length} duplicate work orders.`);
      }
    }
    
    console.log('Duplicate work order cleanup completed.');
  } catch (error) {
    console.error('Error cleaning up duplicate work orders:', error);
    // Don't throw - just log and continue with the main process
  }
}

export async function generateDirectWorkOrders(req: Request, res: Response) {
  try {
    const projectId = parseInt(req.params.projectId);
    const { confirm } = req.body;
    // Always skip components that already have work orders
    const newComponentsOnly = true;
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // FIRST DEFENSE: Clean up any existing duplicate work orders first
    await cleanupDuplicateWorkOrders(projectId);
    
    // SECOND DEFENSE: Get all existing work order titles across the entire system
    // This is to prevent components from being recreated even if they're already in other projects
    console.log(`Building global work order title database for duplicate prevention`);
    
    // Create a set for item codes that already have work orders (across projects)
    const globalItemCodesWithWorkOrders = new Set<string>();
    
    // For current project item codes specifically
    const currentProjectItemCodes = new Set<string>();
    
    try {
      // Get ALL work orders in the system
      const allWorkOrdersQuery = await db.execute(sql`
        SELECT id, title, work_order_number, project_id 
        FROM work_orders 
        ORDER BY id
      `);
      
      if (allWorkOrdersQuery.rows && Array.isArray(allWorkOrdersQuery.rows)) {
        console.log(`Found ${allWorkOrdersQuery.rows.length} total work orders in system`);
        
        allWorkOrdersQuery.rows.forEach(wo => {
          if (wo.title) {
            // Extract item code from title (format: "ITEMCODE - Description")
            const parts = wo.title.split(' - ');
            if (parts.length > 0) {
              const itemCode = parts[0].trim();
              if (itemCode) {
                // Add to global tracking
                globalItemCodesWithWorkOrders.add(itemCode);
                
                // If this is for current project, also add to current project tracking
                if (wo.project_id === projectId) {
                  currentProjectItemCodes.add(itemCode);
                }
              }
            }
          }
        });
        
        console.log(`Indexed ${globalItemCodesWithWorkOrders.size} unique item codes (${currentProjectItemCodes.size} in current project)`);
      }
    } catch (error) {
      console.error('Error building global work order title database:', error);
      // Continue with original workflow even if this enhancement fails
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
    const masterItemsMap = new Map<number, typeof masterItems.$inferSelect>();
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
      
    // Get project item IDs from existing work order items
    const existingProjectItemIdsArray = existingWorkOrderItems.map(item => item.projectItemId);
    
    // Create a set for faster lookups
    const existingProjectItemIdSet = new Set<number>(existingProjectItemIdsArray);
    
    // Get project items that already have work orders
    const projectItemsWithWorkOrders = existingProjectItemIdsArray.length > 0
      ? await db.query.projectItems.findMany({
          where: inArray(projectItems.id, existingProjectItemIdsArray)
        })
      : [];
    
    // Find the corresponding master items to get their item codes
    const masterItemIdsWithWorkOrders = projectItemsWithWorkOrders.map(item => item.itemId);
    const masterItemsWithWorkOrders = masterItemIdsWithWorkOrders.length > 0
      ? await db.query.masterItems.findMany({
          where: inArray(masterItems.id, masterItemIdsWithWorkOrders)
        })
      : [];
      
    // Create a set of item codes that already have work orders to avoid duplicates
    const existingItemCodesWithWorkOrders = new Set<string>();
    
    // Create a deep tracking of what work orders already exist for each item code
    // This helps us track which specific work orders are assigned to which components
    const workOrdersByItemCode = new Map<string, Set<string>>();
    
    masterItemsWithWorkOrders.forEach(item => {
      if (item.itemCode) {
        existingItemCodesWithWorkOrders.add(item.itemCode);
        
        // Initialize the set if it doesn't exist yet
        if (!workOrdersByItemCode.has(item.itemCode)) {
          workOrdersByItemCode.set(item.itemCode, new Set<string>());
        }
      }
    });
    
    // Now populate the actual work order numbers for each item code
    // This will let us check if a specific item code already has a work order with a specific parent
    for (const workOrderItem of existingWorkOrderItems) {
      const projectItem = projectItemsWithWorkOrders.find(item => item.id === workOrderItem.projectItemId);
      if (projectItem) {
        const masterItem = masterItemsWithWorkOrders.find(item => item.id === projectItem.itemId);
        if (masterItem && masterItem.itemCode) {
          const workOrder = existingWorkOrders.find(wo => wo.id === workOrderItem.workOrderId);
          if (workOrder) {
            const itemCodeSet = workOrdersByItemCode.get(masterItem.itemCode);
            if (itemCodeSet) {
              itemCodeSet.add(workOrder.workOrderNumber);
              console.log(`Item code ${masterItem.itemCode} has work order ${workOrder.workOrderNumber}`);
            }
          }
        }
      }
    }
    
    console.log(`Found ${existingWorkOrderItems.length} existing work order items`);
    console.log(`Found ${existingItemCodesWithWorkOrders.size} unique item codes with work orders`);
    
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
    
    // Step 9: Filter out project items that already have work orders
    console.log(`Filtering out items that already have work orders`);
    let filteredMakeParentItems = makeParentItems.filter(item => 
      !existingProjectItemIdSet.has(item.id)
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
        
        // Check if the item code exists in our global tracking set
        // This is a CRITICAL ENHANCEMENT to prevent duplicate work orders
        if (componentMasterItem.itemCode && existingItemCodesWithWorkOrders.has(componentMasterItem.itemCode)) {
          console.log(`GLOBAL PREVENTION: Component ${componentMasterItem.itemCode} already has a work order in the system - skipping`);
          continue;
        }
        
        // Also check in the global tracking set
        if (componentMasterItem.itemCode && globalItemCodesWithWorkOrders && globalItemCodesWithWorkOrders.has(componentMasterItem.itemCode)) {
          console.log(`GLOBAL PREVENTION (2): Component ${componentMasterItem.itemCode} found in global tracking - skipping`);
          continue;
        }
        
        // Additional check in current project tracking
        if (componentMasterItem.itemCode && currentProjectItemCodes && currentProjectItemCodes.has(componentMasterItem.itemCode)) {
          console.log(`CURRENT PROJECT PREVENTION: Component ${componentMasterItem.itemCode} already has a work order in this project - skipping`);
          continue;
        }
        
        console.log(`Creating virtual component: ${componentMasterItem.itemCode}`);
        
        // Create virtual component
        const quantity = typeof parentItem.quantity === 'string' 
          ? parseFloat(parentItem.quantity) 
          : parentItem.quantity;
        
        const validQuantity = !isNaN(quantity) && quantity > 0 ? quantity : 1;
        
        // Add to tracking immediately to prevent duplicates
        if (componentMasterItem.itemCode) {
          existingItemCodesWithWorkOrders.add(componentMasterItem.itemCode);
          console.log(`Added ${componentMasterItem.itemCode} to tracking set to prevent duplicates`);
        }
        
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
    
    // Get counts of components that already have work orders vs. new ones
    const newComponents = virtualComponentItems.filter(component => {
      const masterItem = masterItemsMap.get(component.itemId);
      return !(masterItem && masterItem.itemCode && existingItemCodesWithWorkOrders.has(masterItem.itemCode));
    });
    
    console.log(`Found ${newComponents.length} new components out of ${virtualComponentItems.length} total`);
    
    // If not confirmed, prepare preview data with item details
    if (!confirm) {
      console.log(`Preview mode: Filtered parent items: ${filteredMakeParentItems.length}, Virtual components: ${virtualComponentItems.length}, New components: ${newComponents.length}`);
      
      // Skip preview data generation if there are no new items to create work orders for
      if ((filteredMakeParentItems.length === 0 && newComponents.length === 0)) {
        // Return an empty preview dataset when there are no new items
        return res.status(200).json({
          requiresConfirmation: true,
          message: 'No new work orders need to be generated for this project',
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: 0,
          parentCount: 0,
          componentCount: 0,
          items: [],
          willCreateSeparateOrders: false,
          noItemsToDisplay: true, // Flag to indicate no new items need work orders
          existingWorkOrderCount: existingWorkOrders.length,
          crossProjectComponents: crossProjectInfo
        });
      }
      
      // Filter parent items that already have work orders
      const filteredPreviewParentItems = filteredMakeParentItems.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        // Skip if this parent already has a work order (by item code)
        if (masterItem && masterItem.itemCode && existingItemCodesWithWorkOrders.has(masterItem.itemCode)) {
          console.log(`Preview: Skipping parent preview for ${masterItem.itemCode} - already has a work order`);
          return false;
        }
        return true;
      });
      
      // Prepare preview items for parent items
      const parentPreviewItems = filteredPreviewParentItems.map((item, index) => {
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
      // First filter out any components that already have work orders
      const filteredVirtualComponents = virtualComponentItems.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        // Skip if this component already has a work order (by item code)
        if (masterItem && existingItemCodesWithWorkOrders.has(masterItem.itemCode)) {
          console.log(`Preview: Skipping component preview for ${masterItem.itemCode} - already has a work order`);
          return false;
        }
        return true;
      });
      
      const componentPreviewItems = filteredVirtualComponents.map((item, index) => {
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
      
      // If after filtering out existing work orders we have no components left, check if we should show a 'no items' message
      if (filteredMakeParentItems.length === 0 && filteredVirtualComponents.length === 0) {
        return res.status(200).json({
          requiresConfirmation: true,
          message: 'No new work orders need to be generated for this project',
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: 0,
          parentCount: 0,
          componentCount: 0,
          items: [],
          willCreateSeparateOrders: false,
          noItemsToDisplay: true, // Flag to indicate no new items need work orders
          existingWorkOrderCount: existingWorkOrders.length,
          crossProjectComponents: crossProjectInfo
        });
      }
      
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'Please confirm to generate work orders',
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        itemCount: filteredPreviewParentItems.length + filteredVirtualComponents.length,
        parentCount: filteredPreviewParentItems.length,
        componentCount: filteredVirtualComponents.length,
        parentWorkOrderNumber,
        items: [...parentPreviewItems, ...componentPreviewItems],
        willCreateSeparateOrders: filteredPreviewParentItems.length > 0 && filteredVirtualComponents.length > 0,
        crossProjectComponents: crossProjectInfo,
        newItemsFound: true, // Flag to indicate new items require work orders
        existingItemCount: virtualComponentItems.length - filteredVirtualComponents.length // Count of items with existing work orders
      });
    }
    
    // Step 11: Set up work order creation arrays
    console.log(`Preparing to create work orders`);
    const workOrdersToCreate = [];
    const workOrderItemsToCreate = [];
    const workOrdersMap = new Map();
    
    // Global tracker to prevent duplicate component work orders
    // This is a set of "parentItemCode:componentItemCode" strings
    const processedComponentKeys = new Set<string>();
    
    // CRITICAL ENHANCEMENT: Extract all item codes from work order titles
    // This is the most reliable method to track what items already have work orders
    const allExistingItemCodesFromTitles = new Set<string>();
    
    // Get all work order titles for this project
    const workOrderTitlesQuery = await db.execute(sql`
      SELECT title FROM work_orders WHERE project_id = ${projectId}
    `);
    
    if (workOrderTitlesQuery.rows && Array.isArray(workOrderTitlesQuery.rows)) {
      workOrderTitlesQuery.rows.forEach(row => {
        if (row.title) {
          // Extract item code from title (format: "ITEMCODE - Description")
          const parts = row.title.split(' - ');
          if (parts.length > 0) {
            const itemCode = parts[0].trim();
            if (itemCode) {
              allExistingItemCodesFromTitles.add(itemCode);
              existingItemCodesWithWorkOrders.add(itemCode);
              console.log(`Item code extracted from work order title: ${itemCode}`);
            }
          }
        }
      });
    }
    
    console.log(`Found ${allExistingItemCodesFromTitles.size} unique item codes from work order titles`);
    
    // IMPORTANT: Add a direct check for each item code we have in this session
    // This is a CRITICAL prevention step
    for (const component of virtualComponentItems) {
      const masterItem = masterItemsMap.get(component.itemId);
      if (masterItem && masterItem.itemCode) {
        if (allExistingItemCodesFromTitles.has(masterItem.itemCode)) {
          console.log(`CRITICAL PREVENTION: ${masterItem.itemCode} already has a work order (detected from titles)`);
          existingItemCodesWithWorkOrders.add(masterItem.itemCode);
        }
      }
    }
    
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
      
      // Check if this parent item already has a work order - avoid duplicates
      if (masterItem.itemCode && existingItemCodesWithWorkOrders.has(masterItem.itemCode)) {
        console.log(`Skipping parent work order for ${masterItem.itemCode} - already has a work order`);
        continue;
      }
      
      let workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      
      // Ensure uniqueness
      while (existingWorkOrderNumbers.has(workOrderNumber)) {
        seqNumberCounter++;
        workOrderNumber = `WO-${project.code}-${seqNumberCounter}`;
      }
      
      existingWorkOrderNumbers.add(workOrderNumber);
      // Also mark this item code as having a work order now
      if (masterItem.itemCode) {
        existingItemCodesWithWorkOrders.add(masterItem.itemCode);
      }
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
      
      // Store the item code in the tracking set for duplicate prevention
      if (masterItem.itemCode) {
        existingItemCodesWithWorkOrders.add(masterItem.itemCode);
      }
      
      // Create the work order item with only fields in the database schema
      const workOrderItem = {
        tempWorkOrderIndex: workOrdersToCreate.length - 1,
        projectItemId: parentItem.id,
        quantity: validQuantity.toString(), // Convert to string for database compatibility
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
    
    // NEW COMPREHENSIVE PROJECT-ITEM RELATIONSHIP CHECK:
    // First, query all work order items in this project to find item codes
    // This will identify virtual components that don't have proper project items
    const existingWorkOrdersQuery = await db.execute(sql`
      SELECT wo.id, wo.work_order_number, wo.title
      FROM work_orders wo
      WHERE wo.project_id = ${projectId}
    `);
    
    const workOrderIds = [];
    if (existingWorkOrdersQuery.rows && Array.isArray(existingWorkOrdersQuery.rows)) {
      for (const row of existingWorkOrdersQuery.rows) {
        if (row.id) {
          workOrderIds.push(row.id);
        }
      }
    }
    
    // Create a hashmap of existing work order IDs for faster lookup
    const existingWorkOrderIds = new Set(workOrderIds);
    
    // Critical: Get ALL item codes from work order titles
    // This catches virtual components that don't have direct master item links
    const itemCodesInTitles = new Set<string>();
    if (existingWorkOrdersQuery.rows && Array.isArray(existingWorkOrdersQuery.rows)) {
      existingWorkOrdersQuery.rows.forEach(wo => {
        if (wo.title) {
          // Work order titles have format "ITEMCODE - Description"
          const parts = wo.title.split(' - ');
          if (parts.length > 0) {
            const itemCode = parts[0].trim();
            if (itemCode) {
              itemCodesInTitles.add(itemCode);
              // Also add to our existing tracking set
              existingItemCodesWithWorkOrders.add(itemCode);
              console.log(`Item code ${itemCode} found in work order title`);
            }
          }
        }
      });
    }
    
    // Now, query to get master item IDs that have direct project item links
    const existingWorkOrderItemsQuery = await db.execute(sql`
      SELECT DISTINCT mi.id as master_item_id, mi.item_code 
      FROM work_orders wo
      JOIN work_order_items wi ON wi.work_order_id = wo.id 
      JOIN project_items pi ON wi.project_item_id = pi.id
      JOIN master_items mi ON pi.item_id = mi.id
      WHERE wo.project_id = ${projectId}
    `);
    
    // Create a set of master item IDs that already have work orders in this project
    const masterItemsWithWorkOrdersInProject = new Set<number>();
    // Also track by item code for virtual components
    const itemCodesWithWorkOrdersInProject = new Set<string>();
    
    if (existingWorkOrderItemsQuery.rows && Array.isArray(existingWorkOrderItemsQuery.rows)) {
      existingWorkOrderItemsQuery.rows.forEach(row => {
        if (row.master_item_id) {
          masterItemsWithWorkOrdersInProject.add(row.master_item_id);
        }
        if (row.item_code) {
          itemCodesWithWorkOrdersInProject.add(row.item_code);
          // Also add to our existing tracking set
          existingItemCodesWithWorkOrders.add(row.item_code);
          console.log(`Item code ${row.item_code} has work order (via master item)`);
        }
      });
    }
    
    // Merge the item codes from the work order titles with the item codes from the master items
    itemCodesInTitles.forEach(code => {
      itemCodesWithWorkOrdersInProject.add(code);
    });
    
    console.log(`Project ${projectId} already has work orders for ${masterItemsWithWorkOrdersInProject.size} master items and ${itemCodesWithWorkOrdersInProject.size} item codes`);
    
    // Step 13: Create component work orders
    for (const component of virtualComponentItems) {
      const masterItem = masterItemsMap.get(component.itemId);
      const parentItemId = component.parentItemId;
      
      // ENHANCED MULTILAYER PREVENTION
      // Before going any further, check multiple sources to prevent duplicates
      
      if (masterItem) {
        // Layer 1: Check all existing item codes from global scan
        if (masterItem.itemCode && globalItemCodesWithWorkOrders && globalItemCodesWithWorkOrders.has(masterItem.itemCode)) {
          console.log(`LAYER 1 PREVENTION: Component ${masterItem.itemCode} found in global work order database - skipping`);
          continue;
        }
        
        // Layer 2: Check by current title extraction
        if (masterItem.itemCode && allExistingItemCodesFromTitles && allExistingItemCodesFromTitles.has(masterItem.itemCode)) {
          console.log(`LAYER 2 PREVENTION: Component ${masterItem.itemCode} found in title extraction - skipping`);
          continue;
        }
        
        // Layer 3: Check by ID in master items with work orders
        if (masterItemsWithWorkOrdersInProject.has(masterItem.id)) {
          console.log(`LAYER 3 PREVENTION: Component ${masterItem.itemCode} (ID: ${masterItem.id}) already has a work order in project ${projectId} (checked by ID)`);
          continue;
        }
        
        // Layer 4: Check by item code in current project
        if (masterItem.itemCode && itemCodesWithWorkOrdersInProject.has(masterItem.itemCode)) {
          console.log(`LAYER 4 PREVENTION: Component ${masterItem.itemCode} - already has a work order in project ${projectId} (checked by item code)`);
          continue;
        }
        
        // Layer 5: Check existing item codes with work orders
        if (masterItem.itemCode && existingItemCodesWithWorkOrders.has(masterItem.itemCode)) {
          console.log(`LAYER 5 PREVENTION: Component ${masterItem.itemCode} - already in tracking set - skipping`);
          continue;
        }
        
        // Layer 6: Check current project item codes
        if (masterItem.itemCode && currentProjectItemCodes && currentProjectItemCodes.has(masterItem.itemCode)) {
          console.log(`LAYER 6 PREVENTION: Component ${masterItem.itemCode} already in current project tracking - skipping`);
          continue;
        }
      }
      
      // Find parent's work order - either from current session or existing orders
      let parentInfo = parentItemId ? workOrdersMap.get(parentItemId.toString()) : null;
      
      // If parent isn't in our current session map, try to look it up from existing work orders
      if (!parentInfo && parentItemId) {
        // Find the project item for this parent
        const parentProjectItem = projectItemsList.find(item => item.itemId === parentItemId);
        
        if (parentProjectItem) {
          // Look up work orders for this parent
          const existingParentWorkOrder = existingWorkOrders.find(wo => {
            // Find the corresponding work order item
            const workOrderItem = existingWorkOrderItems.find(item => 
              item.workOrderId === wo.id && item.projectItemId === parentProjectItem.id
            );
            return !!workOrderItem;
          });
          
          if (existingParentWorkOrder) {
            // Create a parentInfo entry similar to what we'd get from the current session
            parentInfo = {
              workOrderNumber: existingParentWorkOrder.workOrderNumber,
              tempIndex: -1 // Not used when dealing with existing work orders
            };
            console.log(`Found existing parent work order ${existingParentWorkOrder.workOrderNumber} for component`);
          }
        }
      }
      
      if (!masterItem || !parentInfo) {
        console.log(`Skipping component - no master item or parent work order found`);
        continue;
      }
      
      // SIGNIFICANTLY SIMPLIFIED DUPLICATE DETECTION
      // Create a unique composite key for parent+component pair - this is the most reliable way to prevent duplicates
      if (masterItem.itemCode) {
        const parentItemCode = masterItemsMap.get(parentItemId)?.itemCode || 'unknown';
        const uniqueKey = `${parentItemCode}:${masterItem.itemCode}`;
        
        // If we've already processed this exact parent+component combination, skip it
        if (processedComponentKeys.has(uniqueKey)) {
          console.log(`Skipping duplicate component: ${masterItem.itemCode} under parent ${parentItemCode} - already processed`);
          continue;
        }
        
        // MUCH MORE RELIABLE CHECK: Look directly at work order titles to find duplicates
        // This is the most reliable check as item codes are in the title
        try {
          // First check: Look for exact item code in work order titles
          const titleCheckQuery = await db.execute(sql`
            SELECT id, work_order_number, title
            FROM work_orders 
            WHERE project_id = ${projectId}
              AND title LIKE ${masterItem.itemCode + ' - %'}
          `);
          
          const titleResults = titleCheckQuery.rows || titleCheckQuery;
          
          if (titleResults && Array.isArray(titleResults) && titleResults.length > 0) {
            const existingWorkOrder = titleResults[0];
            console.log(`CRITICAL TITLE CHECK: Found existing work order ${existingWorkOrder.work_order_number} for component ${masterItem.itemCode} in title "${existingWorkOrder.title}"`);
            console.log(`Skipping duplicate component - already exists with work order ID: ${existingWorkOrder.id}`);
            continue;
          }
          
          // Second check: Look for work orders under this specific parent (hierarchical relationship)
          const parentChildQuery = await db.execute(sql`
            SELECT id, work_order_number, title
            FROM work_orders
            WHERE project_id = ${projectId}
              AND work_order_number LIKE ${parentInfo.workOrderNumber + '-%'}
              AND title LIKE ${masterItem.itemCode + ' - %'} 
          `);
          
          const parentChildResults = parentChildQuery.rows || parentChildQuery;
          
          if (parentChildResults && Array.isArray(parentChildResults) && parentChildResults.length > 0) {
            const existingChildWorkOrder = parentChildResults[0];
            console.log(`PARENT-CHILD CHECK: Found existing child work order ${existingChildWorkOrder.work_order_number} for component ${masterItem.itemCode} under parent ${parentInfo.workOrderNumber}`);
            console.log(`Skipping duplicate component - already exists with work order ID: ${existingChildWorkOrder.id}`);
            continue;
          }
          
          // Third check: Look for any work order where this item code is part of the title
          // This handles cases where the item might be a parent in one work order and a child in another
          const fuzzyTitleCheck = await db.execute(sql`
            SELECT id, work_order_number, title
            FROM work_orders
            WHERE project_id = ${projectId}
              AND (
                title LIKE ${'% ' + masterItem.itemCode + ' %'} OR
                title LIKE ${masterItem.itemCode + ' %'} OR
                title LIKE ${'% ' + masterItem.itemCode}
              )
          `);
          
          const fuzzyResults = fuzzyTitleCheck.rows || fuzzyTitleCheck;
          
          if (fuzzyResults && Array.isArray(fuzzyResults) && fuzzyResults.length > 0) {
            const existingFuzzyWorkOrder = fuzzyResults[0];
            console.log(`FUZZY TITLE CHECK: Found work order containing item code ${masterItem.itemCode} in title "${existingFuzzyWorkOrder.title}"`);
            console.log(`Skipping duplicate component - found in work order: ${existingFuzzyWorkOrder.work_order_number}`);
            continue;
          }
        } catch (error) {
          console.error('Error performing direct database checks for duplicate components:', error);
          // Continue with other checks if this one fails
        }
        
        // Mark this parent+component combination as processed
        processedComponentKeys.add(uniqueKey);
        console.log(`Marking composite key ${uniqueKey} as processed to prevent duplicates`);
      }
      
      console.log(`Will create work order for component ${masterItem.itemCode}`);
      
      
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
      // Also mark this item code as having a work order now
      existingItemCodesWithWorkOrders.add(masterItem.itemCode);
      
      // Track this component in the global tracking set to avoid duplicates
      if (masterItem.itemCode) {
        const parentItemCode = masterItemsMap.get(parentItemId)?.itemCode || 'unknown';
        const uniqueKey = `${parentItemCode}:${masterItem.itemCode}`;
        processedComponentKeys.add(uniqueKey);
        console.log(`Added ${masterItem.itemCode} to global tracking under parent ${parentItemCode}`);
      }
      
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
      
      // Store the component item code in the tracking set for duplicate prevention
      if (masterItem.itemCode) {
        existingItemCodesWithWorkOrders.add(masterItem.itemCode);
      }
      
      // Create work order item with only fields in the database schema
      const componentWorkOrderItem = {
        tempWorkOrderIndex: workOrdersToCreate.length - 1,
        projectItemId: projectItemId,
        quantity: validQuantity.toString(), // Convert to string for database compatibility
        unit,
        status: 'pending',
        sequenceNumber: 1,
        notes: `Sub-assembly of ${masterItemsMap.get(componentParentItemId)?.itemCode}`,
        createdAt: today,
        updatedAt: today
      };
      
      workOrderItemsToCreate.push(componentWorkOrderItem);
    }
    
    console.log(`Ready to create ${workOrdersToCreate.length} work orders with ${workOrderItemsToCreate.length} items`);
    
    // Debug: Log all work orders that will be created
    console.log('Final check before creating work orders:');
    const componentWorkOrdersToCreate = workOrdersToCreate.filter((wo, index) => index >= filteredMakeParentItems.length);
    
    // Detect duplicates in what we're about to create
    const workOrderTitles = componentWorkOrdersToCreate.map(wo => wo.title);
    const duplicateTitles = workOrderTitles.filter((title, index) => workOrderTitles.indexOf(title) !== index);
    
    if (duplicateTitles.length > 0) {
      console.error('!!! DUPLICATE DETECTION: Found duplicate component work orders about to be created !!!');
      console.error('Duplicate titles:', Array.from(new Set(duplicateTitles)));
      
      // Log all work orders to debug the issue
      componentWorkOrdersToCreate.forEach(wo => {
        console.log(`Work order to create: ${wo.workOrderNumber} - ${wo.title}`);
      });
      
      // Remove duplicates from the array - Keep only the first occurrence of each title
      const uniqueTitles = new Set();
      const deduplicatedWorkOrders = [];
      const deduplicatedWorkOrderItems = [];
      
      workOrdersToCreate.forEach((wo, index) => {
        if (index < filteredMakeParentItems.length) {
          // Always keep parent work orders
          deduplicatedWorkOrders.push(wo);
          deduplicatedWorkOrderItems.push(workOrderItemsToCreate[index]);
        } else {
          // For components, check for duplicates
          if (!uniqueTitles.has(wo.title)) {
            uniqueTitles.add(wo.title);
            deduplicatedWorkOrders.push(wo);
            deduplicatedWorkOrderItems.push(workOrderItemsToCreate[index]);
          } else {
            console.log(`Removing duplicate work order: ${wo.workOrderNumber} - ${wo.title}`);
          }
        }
      });
      
      // Replace the arrays with deduplicated versions
      workOrdersToCreate.length = 0;
      workOrderItemsToCreate.length = 0;
      workOrdersToCreate.push(...deduplicatedWorkOrders);
      workOrderItemsToCreate.push(...deduplicatedWorkOrderItems);
      
      console.log(`After deduplication: ${workOrdersToCreate.length} work orders (${workOrdersToCreate.length - filteredMakeParentItems.length} components)`);
    }
    
    // Step 14: Insert all work orders in bulk, but only if there are any to create
    if (workOrdersToCreate.length === 0) {
      return res.status(200).json({
        message: 'No new work orders needed to be created', 
        count: 0,
        parentCount: 0,
        componentCount: 0,
        skippedItems: 0,
        crossProjectComponents: null
      });
    }
    
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
    
    // Step 16: Insert all work order items, but only if there are any to create
    if (finalWorkOrderItems.length > 0) {
      await db.insert(workOrderItems)
        .values(finalWorkOrderItems);
    }
    
    // Count skipped components and add isVirtual field for tracking 
    // Add the isVirtual property to each workOrderItem for proper filtering
    workOrderItemsToCreate.forEach((item, index) => {
      // For component items (child sequence), mark as virtual
      if (index >= filteredMakeParentItems.length) {
        (item as any).isVirtual = true;
        (item as any).itemType = 'Child';
      } else {
        (item as any).isVirtual = false;
        (item as any).itemType = 'Parent';
      }
    });
    
    // Now count properly
    const skippedComponentCount = virtualComponentItems.length - workOrderItemsToCreate.filter(item => (item as any).isVirtual).length;
    
    // Return success message with cross-project component info if any
    return res.status(201).json({
      message: 'Work orders created successfully', 
      count: createdWorkOrders.length,
      parentCount: filteredMakeParentItems.length,
      componentCount: virtualComponentItems.length,
      skippedItems: skippedComponentCount,
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