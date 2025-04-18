import { Response, Router, Request } from 'express';
import { db } from './db';
import { insertWorkOrderSchema, workOrders, insertWorkOrderItemSchema, 
  workOrderItems, insertResourceAssignmentSchema, resourceAssignments,
  insertProductionRecordSchema, productionRecords, insertMaterialConsumptionSchema,
  materialConsumption, insertMachineAllocationSchema, machineAllocations, projects, projectItems, masterItems, itemComponents } from '@shared/schema';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Role authorization middleware
function canManage(role: string): boolean {
  return ['Superuser', 'General Manager', 'Senior Manager', 'Manager'].includes(role);
}

export function setupProductionRoutes(app: Router) {
  // ==================== WORK ORDERS ====================
  
  // Preview work orders for a project
  app.get('/api/production/work-orders/preview/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Check if project ID is valid
    if (isNaN(projectId)) {
      console.log('Invalid project ID in preview endpoint:', req.params.projectId);
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Get project to ensure it exists
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get all items for the project
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (projectItemsList.length === 0) {
      return res.status(404).json({ error: 'No items found for this project' });
    }
    
    // Get all master items details for the project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsData = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map of master item id to details for faster lookups
    const masterItemsMap = new Map();
    masterItemsData.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Group items by "makeOrBuy" status
    let makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem && masterItem.makeOrBuy === 'Make';
    });
    
    if (makeItems.length === 0) {
      return res.status(400).json({ error: 'No "Make" items found for this project' });
    }
    
    // Check for existing work orders to avoid duplicates
    const existingWorkOrders = await db.query.workOrders.findMany({
      where: eq(workOrders.projectId, projectId)
    });
    
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
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: 0,
          items: [],
          message: 'All "Make" items already have work orders'
        });
      }
      
      // Update makeItems to only include items that don't already have work orders
      makeItems = filteredMakeItems;
    }
    
    // Get item components relationships for separation
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
    
    // Separate items into parent and child categories
    const parentItems: typeof makeItems = [];
    const childItems: typeof makeItems = [];
    
    // Track parent items that have components
    const parentsWithComponents = new Set<number>();
    
    makeItems.forEach(item => {
      const masterItemId = item.itemId;
      if (childToParentMap.has(masterItemId)) {
        childItems.push(item);
      } else {
        parentItems.push(item);
        
        // Check if this parent has components
        if (parentToChildMap.has(masterItemId)) {
          parentsWithComponents.add(masterItemId);
        }
      }
    });
    
    // Now, for each parent with components, add virtual project items for component items
    // that are not already included in the project
    const virtualChildItems: typeof makeItems = [];
    
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
            // We use negative IDs for virtual items to avoid conflicts
            virtualChildItems.push({
              id: -componentItemId, // Use negative ID to indicate virtual item
              projectId: parentProjectItem.projectId,
              itemId: componentItemId,
              quantity: '1', // Default to 1 for now, could be improved with BOM relationships
              notes: `Virtual component of ${masterItemsMap.get(parentItemId)?.itemCode || 'parent item'}`
            });
          }
        }
      });
    });
    
    // Add virtual items to child items
    childItems.push(...virtualChildItems);
    
    // Create preview data for client
    type PreviewItem = {
      sequenceNumber: number;
      itemCode: string;
      description: string;
      quantity: number;
      unit: string;
      makeOrBuy: string;
      itemType: 'Parent' | 'Child';
      parentItemCode: string | null;
    };
    
    const mapItemsToPreview = (items: typeof makeItems, isParent: boolean): PreviewItem[] => {
      return items.map((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        return {
          sequenceNumber: index + 1,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: Number(item.quantity),
          unit: masterItem?.unit || 'EA',
          makeOrBuy: 'Make',
          itemType: isParent ? 'Parent' : 'Child',
          parentItemCode: isParent ? null : (
            masterItemsMap.get(childToParentMap.get(item.itemId)!)?.itemCode || 'Unknown'
          )
        };
      });
    };
    
    const parentPreviewItems: PreviewItem[] = mapItemsToPreview(parentItems, true);
    const childPreviewItems: PreviewItem[] = mapItemsToPreview(childItems, false);
    const allPreviewItems = [...parentPreviewItems, ...childPreviewItems];
    
    // Get the count of existing work orders for this project to determine the sequence number
    const workOrderCount = await db.query.workOrders.findMany({
      where: eq(workOrders.projectId, projectId),
    });
    
    // Calculate the next sequential numbers
    const nextParentSeqNumber = workOrderCount.length + 1;
    const nextChildSeqNumber = workOrderCount.length + 2;
    
    // Generate unique work order numbers with sequential numbering using the format WO-[ProjectCode]-[SequentialNumber]
    const parentWorkOrderNumber = `WO-${project.code}-${nextParentSeqNumber}`;
    const childWorkOrderNumber = `WO-${project.code}-${nextChildSeqNumber}`;
    
    res.status(200).json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name
      },
      parentWorkOrderNumber,
      childWorkOrderNumber,
      itemCount: makeItems.length,
      parentItemCount: parentItems.length,
      childItemCount: childItems.length,
      items: allPreviewItems,
      willCreateSeparateOrders: parentItems.length > 0 && childItems.length > 0
    });
  } catch (error) {
    console.error('Error generating work orders preview:', error);
    res.status(500).json({ error: 'Failed to generate work orders preview' });
  }
});
  
  // Generate work orders for a project
  app.post('/api/production/work-orders/generate-for-project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { confirm } = req.body;
      
      // Check if project ID is valid
      if (isNaN(projectId)) {
        console.log('Invalid project ID in work order generation:', req.params.projectId);
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to create work orders' });
      }
      
      // Get project to ensure it exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if there are already work orders for this project
      const existingWorkOrders = await db.query.workOrders.findMany({
        where: eq(workOrders.projectId, projectId)
      });
      
      // Get all items for the project
      const projectItemsList = await db.query.projectItems.findMany({
        where: eq(projectItems.projectId, projectId)
      });
      
      if (projectItemsList.length === 0) {
        return res.status(404).json({ error: 'No items found for this project' });
      }
      
      // Get all master items details for the project items
      const masterItemIds = projectItemsList.map(item => item.itemId);
      const masterItemsData = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, masterItemIds)
      });
      
      // Create a map of master item id to details for faster lookups
      const masterItemsMap = new Map();
      masterItemsData.forEach(item => {
        masterItemsMap.set(item.id, item);
      });
      
      // Group items by "makeOrBuy" status
      const makeItems = projectItemsList.filter(item => {
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
      const virtualChildItems: typeof makeItems = [];
      
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
              // We use numeric ID with a special value for virtual items
              virtualChildItems.push({
                id: -(Math.abs(componentItemId)), // Use negative ID to mark as virtual
                projectId: parentProjectItem.projectId,
                itemId: componentItemId,
                quantity: '1', // Default to 1 for now, could be improved with BOM relationships
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
          // For virtual items, we need to use a valid project item ID since the foreign key constraint
          // requires project_item_id to reference an existing record in the project_items table
          // We'll use the parent project item's ID since it's guaranteed to exist
          let projectItemId = item.id;
          let itemNotes = `Auto-generated from ${isParent ? 'parent' : 'child'} item ${masterItem.description || masterItem.itemCode}`;
          
          if (item.id < 0) {
            // For virtual items, find a valid project item ID to use
            // Find the parent project item of this virtual component
            const parentItemId = childToParentMap.get(item.itemId);
            if (parentItemId) {
              // Find the project item for this parent
              const parentProjectItem = makeItems.find(pi => pi.itemId === parentItemId);
              if (parentProjectItem && parentProjectItem.id > 0) {
                projectItemId = parentProjectItem.id;
                itemNotes = `Virtual component: ${masterItem.itemCode} - ${masterItem.description} (using parent project item ${projectItemId})`;
              }
            }
          }

          // Make sure we have a valid project item ID
          if (projectItemId < 0) {
            // If we still don't have a valid ID, use the first valid project item
            const firstValidItem = makeItems.find(pi => pi.id > 0);
            if (firstValidItem) {
              projectItemId = firstValidItem.id;
              itemNotes = `Virtual component: ${masterItem.itemCode} - ${masterItem.description} (using fallback project item ${projectItemId})`;
            } else {
              console.log('Warning: Could not find a valid project item ID for virtual component', item);
              // Skip this item to avoid foreign key violation
              continue;
            }
          }
          
          const [newItem] = await db.insert(workOrderItems).values({
            workOrderId: newWorkOrder.id,
            projectItemId: projectItemId,
            quantity: item.quantity,
            status: 'pending',
            sequenceNumber: sequenceNumber++,
            notes: itemNotes,
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
  
  // Get all work orders for a project
  app.get('/api/production/work-orders/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate projectId parameter
      const projectId = parseInt(req.params.projectId);
      
      // Check if project ID is valid
      if (isNaN(projectId)) {
        console.log('Invalid project ID in work orders fetch:', req.params.projectId);
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Get project to ensure it exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const allWorkOrders = await db.query.workOrders.findMany({
        where: eq(workOrders.projectId, projectId),
        orderBy: [desc(workOrders.createdAt)]
      });
      
      res.status(200).json(allWorkOrders);
    } catch (error) {
      console.error('Error fetching work orders:', error);
      res.status(500).json({ error: 'Failed to fetch work orders' });
    }
  });
  
  // Get specific work order by ID
  app.get('/api/production/work-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate work order ID parameter
      const workOrderId = parseInt(req.params.id);
      
      // Check if work order ID is valid
      if (isNaN(workOrderId)) {
        console.log('Invalid work order ID in work order fetch:', req.params.id);
        return res.status(400).json({ error: 'Invalid work order ID' });
      }
      
      const workOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      res.status(200).json(workOrder);
    } catch (error) {
      console.error('Error fetching work order:', error);
      res.status(500).json({ error: 'Failed to fetch work order' });
    }
  });
  
  // Create new work order
  app.post('/api/production/work-orders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to create work orders' });
      }
      
      // Validate request body
      const validationResult = insertWorkOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid work order data', details: validationResult.error });
      }
      
      // Verify project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, req.body.projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Count existing work orders for this project to generate sequential work order number
      const existingWorkOrderCount = await db.query.workOrders.findMany({
        where: eq(workOrders.projectId, req.body.projectId),
      });
      const nextSeqNumber = existingWorkOrderCount.length + 1;
      
      // If workOrderNumber not provided by client, generate one with sequential numbering
      // following the standard format: WO-[ProjectCode]-[SequentialNumber]
      const workOrderData = { ...req.body };
      if (!workOrderData.workOrderNumber) {
        workOrderData.workOrderNumber = `WO-${project.code}-${nextSeqNumber}`;
      }
      
      // Create work order
      const [newWorkOrder] = await db.insert(workOrders).values({
        ...workOrderData,
        createdBy: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newWorkOrder);
    } catch (error) {
      console.error('Error creating work order:', error);
      res.status(500).json({ error: 'Failed to create work order' });
    }
  });
  
  // Update work order
  app.put('/api/production/work-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update work orders' });
      }
      
      // Check if work order exists
      const existingWorkOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!existingWorkOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      // Update work order
      const [updatedWorkOrder] = await db.update(workOrders)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(workOrders.id, workOrderId))
        .returning();
      
      res.status(200).json(updatedWorkOrder);
    } catch (error) {
      console.error('Error updating work order:', error);
      res.status(500).json({ error: 'Failed to update work order' });
    }
  });
  
  // Delete work order
  app.delete('/api/production/work-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete work orders' });
      }
      
      // Check if work order exists
      const existingWorkOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!existingWorkOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      // Delete work order - cascade will handle related records
      await db.delete(workOrders).where(eq(workOrders.id, workOrderId));
      
      res.status(200).json({ message: 'Work order deleted successfully' });
    } catch (error) {
      console.error('Error deleting work order:', error);
      res.status(500).json({ error: 'Failed to delete work order' });
    }
  });
  
  // ==================== WORK ORDER ITEMS ====================
  
  // Get all items for a work order
  app.get('/api/production/work-orders/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      const workOrderItemsList = await db.query.workOrderItems.findMany({
        where: eq(workOrderItems.workOrderId, workOrderId),
        orderBy: [asc(workOrderItems.sequenceNumber)]
      });
      
      // Get related project items for more details
      const items = await Promise.all(workOrderItemsList.map(async (item) => {
        const projectItem = await db.query.projectItems.findFirst({
          where: eq(projectItems.id, item.projectItemId)
        });
        
        return {
          ...item,
          projectItem
        };
      }));
      
      res.status(200).json(items);
    } catch (error) {
      console.error('Error fetching work order items:', error);
      res.status(500).json({ error: 'Failed to fetch work order items' });
    }
  });
  
  // Add item to work order
  app.post('/api/production/work-orders/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to add items to work orders' });
      }
      
      // Validate request body
      const validationResult = insertWorkOrderItemSchema.safeParse({
        ...req.body,
        workOrderId
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid work order item data', details: validationResult.error });
      }
      
      // Verify work order exists
      const workOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      // Verify project item exists
      const projectItem = await db.query.projectItems.findFirst({
        where: eq(projectItems.id, req.body.projectItemId)
      });
      
      if (!projectItem) {
        return res.status(404).json({ error: 'Project item not found' });
      }
      
      // Create work order item
      const [newWorkOrderItem] = await db.insert(workOrderItems).values({
        ...req.body,
        workOrderId,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newWorkOrderItem);
    } catch (error) {
      console.error('Error adding item to work order:', error);
      res.status(500).json({ error: 'Failed to add item to work order' });
    }
  });
  
  // Update work order item
  app.put('/api/production/work-order-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderItemId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update work order items' });
      }
      
      // Check if work order item exists
      const existingWorkOrderItem = await db.query.workOrderItems.findFirst({
        where: eq(workOrderItems.id, workOrderItemId)
      });
      
      if (!existingWorkOrderItem) {
        return res.status(404).json({ error: 'Work order item not found' });
      }
      
      // Update work order item
      const [updatedWorkOrderItem] = await db.update(workOrderItems)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(workOrderItems.id, workOrderItemId))
        .returning();
      
      res.status(200).json(updatedWorkOrderItem);
    } catch (error) {
      console.error('Error updating work order item:', error);
      res.status(500).json({ error: 'Failed to update work order item' });
    }
  });
  
  // Delete work order item
  app.delete('/api/production/work-order-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderItemId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete work order items' });
      }
      
      // Check if work order item exists
      const existingWorkOrderItem = await db.query.workOrderItems.findFirst({
        where: eq(workOrderItems.id, workOrderItemId)
      });
      
      if (!existingWorkOrderItem) {
        return res.status(404).json({ error: 'Work order item not found' });
      }
      
      // Delete work order item
      await db.delete(workOrderItems).where(eq(workOrderItems.id, workOrderItemId));
      
      res.status(200).json({ message: 'Work order item deleted successfully' });
    } catch (error) {
      console.error('Error deleting work order item:', error);
      res.status(500).json({ error: 'Failed to delete work order item' });
    }
  });
  
  // ==================== RESOURCE ASSIGNMENTS ====================
  
  // Get all resource assignments for a work order
  app.get('/api/production/work-orders/:id/resources', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      const assignments = await db.query.resourceAssignments.findMany({
        where: eq(resourceAssignments.workOrderId, workOrderId)
      });
      
      res.status(200).json(assignments);
    } catch (error) {
      console.error('Error fetching resource assignments:', error);
      res.status(500).json({ error: 'Failed to fetch resource assignments' });
    }
  });
  
  // Assign resource to work order
  app.post('/api/production/work-orders/:id/resources', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to assign resources' });
      }
      
      // Validate request body
      const validationResult = insertResourceAssignmentSchema.safeParse({
        ...req.body,
        workOrderId
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid resource assignment data', details: validationResult.error });
      }
      
      // Create resource assignment
      const [newAssignment] = await db.insert(resourceAssignments).values({
        ...req.body,
        workOrderId,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newAssignment);
    } catch (error) {
      console.error('Error assigning resource:', error);
      res.status(500).json({ error: 'Failed to assign resource' });
    }
  });
  
  // Update resource assignment
  app.put('/api/production/resources/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const resourceId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update resource assignments' });
      }
      
      // Check if resource assignment exists
      const existingAssignment = await db.query.resourceAssignments.findFirst({
        where: eq(resourceAssignments.id, resourceId)
      });
      
      if (!existingAssignment) {
        return res.status(404).json({ error: 'Resource assignment not found' });
      }
      
      // Update resource assignment
      const [updatedAssignment] = await db.update(resourceAssignments)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(resourceAssignments.id, resourceId))
        .returning();
      
      res.status(200).json(updatedAssignment);
    } catch (error) {
      console.error('Error updating resource assignment:', error);
      res.status(500).json({ error: 'Failed to update resource assignment' });
    }
  });
  
  // Delete resource assignment
  app.delete('/api/production/resources/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const resourceId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete resource assignments' });
      }
      
      // Check if resource assignment exists
      const existingAssignment = await db.query.resourceAssignments.findFirst({
        where: eq(resourceAssignments.id, resourceId)
      });
      
      if (!existingAssignment) {
        return res.status(404).json({ error: 'Resource assignment not found' });
      }
      
      // Delete resource assignment
      await db.delete(resourceAssignments).where(eq(resourceAssignments.id, resourceId));
      
      res.status(200).json({ message: 'Resource assignment deleted successfully' });
    } catch (error) {
      console.error('Error deleting resource assignment:', error);
      res.status(500).json({ error: 'Failed to delete resource assignment' });
    }
  });
  
  // ==================== PRODUCTION RECORDS ====================
  
  // Get all production records for a work order
  app.get('/api/production/work-orders/:id/records', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      const records = await db.query.productionRecords.findMany({
        where: eq(productionRecords.workOrderId, workOrderId),
        orderBy: [desc(productionRecords.date)]
      });
      
      res.status(200).json(records);
    } catch (error) {
      console.error('Error fetching production records:', error);
      res.status(500).json({ error: 'Failed to fetch production records' });
    }
  });
  
  // Create production record
  app.post('/api/production/work-orders/:id/records', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Validate request body
      const validationResult = insertProductionRecordSchema.safeParse({
        ...req.body,
        workOrderId,
        recordedBy: req.user!.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid production record data', details: validationResult.error });
      }
      
      // Create production record
      const [newRecord] = await db.insert(productionRecords).values({
        ...req.body,
        workOrderId,
        recordedBy: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newRecord);
    } catch (error) {
      console.error('Error creating production record:', error);
      res.status(500).json({ error: 'Failed to create production record' });
    }
  });
  
  // Update production record
  app.put('/api/production/records/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const recordId = parseInt(req.params.id);
      
      // Check if record exists
      const existingRecord = await db.query.productionRecords.findFirst({
        where: eq(productionRecords.id, recordId)
      });
      
      if (!existingRecord) {
        return res.status(404).json({ error: 'Production record not found' });
      }
      
      // Verify user can update (either they recorded it or they're a manager)
      if (existingRecord.recordedBy !== req.user!.id && !canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update this production record' });
      }
      
      // Update production record
      const [updatedRecord] = await db.update(productionRecords)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(productionRecords.id, recordId))
        .returning();
      
      res.status(200).json(updatedRecord);
    } catch (error) {
      console.error('Error updating production record:', error);
      res.status(500).json({ error: 'Failed to update production record' });
    }
  });
  
  // Delete production record
  app.delete('/api/production/records/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const recordId = parseInt(req.params.id);
      
      // Check if record exists
      const existingRecord = await db.query.productionRecords.findFirst({
        where: eq(productionRecords.id, recordId)
      });
      
      if (!existingRecord) {
        return res.status(404).json({ error: 'Production record not found' });
      }
      
      // Verify user can delete (either they recorded it or they're a manager)
      if (existingRecord.recordedBy !== req.user!.id && !canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete this production record' });
      }
      
      // Delete production record
      await db.delete(productionRecords).where(eq(productionRecords.id, recordId));
      
      res.status(200).json({ message: 'Production record deleted successfully' });
    } catch (error) {
      console.error('Error deleting production record:', error);
      res.status(500).json({ error: 'Failed to delete production record' });
    }
  });
  
  // ==================== MATERIAL CONSUMPTION ====================
  
  // Get all material consumption for a work order
  app.get('/api/production/work-orders/:id/materials', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      const materials = await db.query.materialConsumption.findMany({
        where: eq(materialConsumption.workOrderId, workOrderId)
      });
      
      res.status(200).json(materials);
    } catch (error) {
      console.error('Error fetching material consumption:', error);
      res.status(500).json({ error: 'Failed to fetch material consumption' });
    }
  });
  
  // Add material consumption
  app.post('/api/production/work-orders/:id/materials', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Validate request body
      const validationResult = insertMaterialConsumptionSchema.safeParse({
        ...req.body,
        workOrderId,
        recordedBy: req.user!.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid material consumption data', details: validationResult.error });
      }
      
      // Create material consumption
      const [newMaterial] = await db.insert(materialConsumption).values({
        ...req.body,
        workOrderId,
        recordedBy: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newMaterial);
    } catch (error) {
      console.error('Error adding material consumption:', error);
      res.status(500).json({ error: 'Failed to add material consumption' });
    }
  });
  
  // Update material consumption
  app.put('/api/production/materials/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const materialId = parseInt(req.params.id);
      
      // Check if material consumption exists
      const existingMaterial = await db.query.materialConsumption.findFirst({
        where: eq(materialConsumption.id, materialId)
      });
      
      if (!existingMaterial) {
        return res.status(404).json({ error: 'Material consumption not found' });
      }
      
      // Update material consumption
      const [updatedMaterial] = await db.update(materialConsumption)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(materialConsumption.id, materialId))
        .returning();
      
      res.status(200).json(updatedMaterial);
    } catch (error) {
      console.error('Error updating material consumption:', error);
      res.status(500).json({ error: 'Failed to update material consumption' });
    }
  });
  
  // Delete material consumption
  app.delete('/api/production/materials/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const materialId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete material consumption' });
      }
      
      // Check if material consumption exists
      const existingMaterial = await db.query.materialConsumption.findFirst({
        where: eq(materialConsumption.id, materialId)
      });
      
      if (!existingMaterial) {
        return res.status(404).json({ error: 'Material consumption not found' });
      }
      
      // Delete material consumption
      await db.delete(materialConsumption).where(eq(materialConsumption.id, materialId));
      
      res.status(200).json({ message: 'Material consumption deleted successfully' });
    } catch (error) {
      console.error('Error deleting material consumption:', error);
      res.status(500).json({ error: 'Failed to delete material consumption' });
    }
  });
  
  // ==================== MACHINE ALLOCATIONS ====================
  
  // Get all machine allocations for a work order
  app.get('/api/production/work-orders/:id/machines', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      const machines = await db.query.machineAllocations.findMany({
        where: eq(machineAllocations.workOrderId, workOrderId)
      });
      
      res.status(200).json(machines);
    } catch (error) {
      console.error('Error fetching machine allocations:', error);
      res.status(500).json({ error: 'Failed to fetch machine allocations' });
    }
  });
  
  // Add machine allocation
  app.post('/api/production/work-orders/:id/machines', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to allocate machines' });
      }
      
      // Validate request body
      const validationResult = insertMachineAllocationSchema.safeParse({
        ...req.body,
        workOrderId
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid machine allocation data', details: validationResult.error });
      }
      
      // Create machine allocation
      const [newMachine] = await db.insert(machineAllocations).values({
        ...req.body,
        workOrderId,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newMachine);
    } catch (error) {
      console.error('Error adding machine allocation:', error);
      res.status(500).json({ error: 'Failed to add machine allocation' });
    }
  });
  
  // Update machine allocation
  app.put('/api/production/machines/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const machineId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update machine allocations' });
      }
      
      // Check if machine allocation exists
      const existingMachine = await db.query.machineAllocations.findFirst({
        where: eq(machineAllocations.id, machineId)
      });
      
      if (!existingMachine) {
        return res.status(404).json({ error: 'Machine allocation not found' });
      }
      
      // Update machine allocation
      const [updatedMachine] = await db.update(machineAllocations)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(machineAllocations.id, machineId))
        .returning();
      
      res.status(200).json(updatedMachine);
    } catch (error) {
      console.error('Error updating machine allocation:', error);
      res.status(500).json({ error: 'Failed to update machine allocation' });
    }
  });
  
  // Delete machine allocation
  app.delete('/api/production/machines/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const machineId = parseInt(req.params.id);
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete machine allocations' });
      }
      
      // Check if machine allocation exists
      const existingMachine = await db.query.machineAllocations.findFirst({
        where: eq(machineAllocations.id, machineId)
      });
      
      if (!existingMachine) {
        return res.status(404).json({ error: 'Machine allocation not found' });
      }
      
      // Delete machine allocation
      await db.delete(machineAllocations).where(eq(machineAllocations.id, machineId));
      
      res.status(200).json({ message: 'Machine allocation deleted successfully' });
    } catch (error) {
      console.error('Error deleting machine allocation:', error);
      res.status(500).json({ error: 'Failed to delete machine allocation' });
    }
  });
}