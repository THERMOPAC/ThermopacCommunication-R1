import { Response, Router, Request } from 'express';
import { db } from './db';
import { insertWorkOrderSchema, workOrders, insertWorkOrderItemSchema, 
  workOrderItems, insertResourceAssignmentSchema, resourceAssignments,
  insertProductionRecordSchema, productionRecords, insertMaterialConsumptionSchema,
  materialConsumption, insertMachineAllocationSchema, machineAllocations, projects, projectItems, masterItems, itemComponents,
  workOrderHistory, insertWorkOrderHistorySchema } from '@shared/schema';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { generateWorkOrders } from './production/work-order-generator';
import { generateWorkOrdersForProject } from './optimized-work-order-generation';
import { generateImprovedWorkOrders } from './production/improved-work-order-generator';
import { generateDirectWorkOrders } from './production/direct-work-order-generator';
import { detectComponentsNeedingWorkOrders } from './component-work-order-detector';
import { cleanupDuplicateWorkOrders } from './production/direct-work-order-generator';
import { 
  generateWorkOrdersForNewComponents, 
  previewNewComponentWorkOrders 
} from './production/enhanced-work-order-generator';

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
  
  // Get all work orders (for Shop Floor Management)
  app.get('/api/production/work-orders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('Fetching all work orders for Shop Floor Management');
      
      // Get all work orders across all projects, ordered by most recent first
      const allWorkOrders = await db.query.workOrders.findMany({
        orderBy: [desc(workOrders.createdAt)],
        limit: 100 // Limit to most recent 100 orders for performance
      });
      
      console.log(`Found ${allWorkOrders.length} work orders`);
      
      res.status(200).json(allWorkOrders);
    } catch (error) {
      console.error('Error fetching all work orders:', error);
      res.status(500).json({ error: 'Failed to fetch work orders' });
    }
  });
  
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
    
    let filteredMakeItems = makeItems;
    let hasExistingWorkOrders = false;
    
    if (existingWorkOrders.length > 0) {
      hasExistingWorkOrders = true;
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
    
    makeItems = filteredMakeItems;
    
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
    
    // Enhanced logic: Detect newly added sub-assembly components that need work orders
    const virtualChildItems: typeof makeItems = [];
    
    // First, get ALL parent items from the original project (not just filtered ones)
    const allProjectMakeItems = await db.query.projectItems.findMany({
      where: and(
        eq(projectItems.projectId, projectId),
        eq(projectItems.status, 'active')
      )
    });
    
    // We need to ensure masterItemsMap has ALL master items, not just the filtered ones
    const allMasterItemIds = allProjectMakeItems.map(item => item.itemId);
    console.log(`[DEBUG] Project has ${allProjectMakeItems.length} project items with IDs:`, allMasterItemIds);
    
    if (allMasterItemIds.length > 0) {
      const allMasterItems = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, allMasterItemIds)
      });
      
      console.log(`[DEBUG] Found ${allMasterItems.length} master items for project items`);
      
      allMasterItems.forEach(item => {
        masterItemsMap.set(item.id, item);
        console.log(`[DEBUG] Added master item: ${item.itemCode} (ID: ${item.id}, Make/Buy: ${item.makeOrBuy})`);
      });
    }
    
    const allParentItemIds = allProjectMakeItems
      .map(item => item.itemId)
      .filter(itemId => {
        const masterItem = masterItemsMap.get(itemId);
        const isMake = masterItem && masterItem.makeOrBuy === 'Make';
        if (isMake) {
          console.log(`[DEBUG] Found Make item: ${masterItem.itemCode} (ID: ${itemId})`);
        }
        return isMake;
      });
    
    // Get all component relationships for ALL parent items in the project
    console.log(`[DEBUG] Looking for components of parent items:`, allParentItemIds);
    const allItemComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, allParentItemIds)
    });
    console.log(`[DEBUG] Raw component relationships found:`, allItemComponentRelationships.length);
    
    // Create map of all component master items
    const allComponentItemIds = allItemComponentRelationships.map(rel => rel.componentItemId);
    if (allComponentItemIds.length > 0) {
      const allComponentMasterItems = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, allComponentItemIds)
      });
      
      allComponentMasterItems.forEach(item => {
        if (!masterItemsMap.has(item.id)) {
          masterItemsMap.set(item.id, item);
        }
      });
    }
    
    // If we have existing work orders, check for newly added components that don't have work orders
    if (hasExistingWorkOrders) {
      console.log(`[DEBUG] Project ${projectId} has existing work orders, checking for components...`);
      
      // Get existing work order items to see which components already have work orders
      const existingWorkOrderIds = existingWorkOrders.map(wo => wo.id);
      const existingWorkOrderItems = await db.query.workOrderItems.findMany({
        where: inArray(workOrderItems.workOrderId, existingWorkOrderIds)
      });
      
      console.log(`[DEBUG] Found ${existingWorkOrderItems.length} existing work order items`);
      
      // Create set of item IDs that already have work orders (both project items and potential components)
      const existingItemWorkOrderIds = new Set();
      existingWorkOrderItems.forEach(woItem => {
        // Check if this work order item corresponds to a project item
        const projectItem = allProjectMakeItems.find(pi => pi.id === woItem.projectItemId);
        if (projectItem) {
          existingItemWorkOrderIds.add(projectItem.itemId);
        }
      });
      
      console.log(`[DEBUG] Items with existing work orders:`, Array.from(existingItemWorkOrderIds));
      console.log(`[DEBUG] Found ${allItemComponentRelationships.length} component relationships`);
      
      // Now check each parent item for components that don't have work orders
      allItemComponentRelationships.forEach(rel => {
        const componentMasterItem = masterItemsMap.get(rel.componentItemId);
        
        console.log(`[DEBUG] Checking component ${rel.componentItemId}:`, {
          exists: !!componentMasterItem,
          makeOrBuy: componentMasterItem?.makeOrBuy,
          hasWorkOrder: existingItemWorkOrderIds.has(rel.componentItemId),
          itemCode: componentMasterItem?.itemCode
        });
        
        if (componentMasterItem && 
            componentMasterItem.makeOrBuy === 'Make' && 
            !existingItemWorkOrderIds.has(rel.componentItemId)) {
          
          console.log(`[DEBUG] Component ${componentMasterItem.itemCode} needs a work order`);
          
          // This component needs a work order - find its parent project item
          const parentProjectItem = allProjectMakeItems.find(item => item.itemId === rel.parentItemId);
          
          if (parentProjectItem) {
            // Get component quantity from the relationship
            const componentRelation = allItemComponentRelationships.find(
              r => r.parentItemId === rel.parentItemId && r.componentItemId === rel.componentItemId
            );
            
            const componentQuantity = componentRelation?.quantity || 1;
            
            console.log(`[DEBUG] Creating virtual item for component ${componentMasterItem.itemCode}`);
            
            // Create virtual project item for this component
            virtualChildItems.push({
              id: -rel.componentItemId, // Use negative ID to indicate virtual item
              projectId: parentProjectItem.projectId,
              projectCode: project.code,
              itemId: rel.componentItemId,
              quantity: componentQuantity.toString(),
              notes: `Sub-component of ${masterItemsMap.get(rel.parentItemId)?.itemCode || 'parent item'}`,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
              actualCost: null,
              estimatedCost: null
            });
          } else {
            console.log(`[DEBUG] No parent project item found for component ${componentMasterItem.itemCode}`);
          }
        }
      });
      
      console.log(`[DEBUG] Created ${virtualChildItems.length} virtual child items`);
    } else {
      // Original logic for projects without existing work orders
      parentsWithComponents.forEach(parentItemId => {
        const parentProjectItem = makeItems.find(item => item.itemId === parentItemId);
        if (!parentProjectItem) return;
        
        const componentItemIds = parentToChildMap.get(parentItemId) || [];
        
        componentItemIds.forEach(componentItemId => {
          const existingComponentItem = makeItems.find(item => item.itemId === componentItemId);
          
          if (!existingComponentItem) {
            const masterComponentItem = masterItemsMap.get(componentItemId);
            if (masterComponentItem && masterComponentItem.makeOrBuy === 'Make') {
              const parentQuantity = typeof parentProjectItem.quantity === 'string' 
                ? parseFloat(parentProjectItem.quantity) 
                : parentProjectItem.quantity;
                
              const validParentQuantity = !isNaN(parentQuantity) && parentQuantity > 0 
                ? parentQuantity 
                : 1;
                
              virtualChildItems.push({
                id: -componentItemId,
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
          }
        });
      });
    }
    
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
    
    // ENHANCED LOGIC: Check for newly added sub-assembly components that need work orders
    if (allPreviewItems.length === 0 && hasExistingWorkOrders) {
      console.log('[PREVIEW] No regular items found, checking for components needing work orders...');
      
      const componentsNeedingWorkOrders = await detectComponentsNeedingWorkOrders(projectId);
      
      if (componentsNeedingWorkOrders.length > 0) {
        console.log(`[PREVIEW] Found ${componentsNeedingWorkOrders.length} components needing work orders`);
        
        // Create preview items for these components
        const componentPreviewItems = componentsNeedingWorkOrders.map((comp, index) => ({
          sequenceNumber: index + 1,
          itemCode: comp.componentCode,
          description: comp.componentDescription,
          quantity: comp.quantity,
          unit: 'EA',
          makeOrBuy: 'Make',
          itemType: 'Child' as const,
          parentItemCode: comp.parentCode
        }));
        
        const nextSeqNumber = (await db.query.workOrders.findMany({
          where: eq(workOrders.projectId, projectId),
        })).length + 1;
        
        return res.status(200).json({
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: componentPreviewItems.length,
          items: componentPreviewItems,
          parentWorkOrderNumber: `WO-${project.code}-${nextSeqNumber}`,
          childWorkOrderNumber: `WO-${project.code}-${nextSeqNumber + 1}`,
          message: `Found ${componentPreviewItems.length} sub-assembly components that need work orders`
        });
      }
    }
    
    // Check if we have any items to process (including virtual components)
    if (allPreviewItems.length === 0) {
      return res.status(200).json({ 
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        itemCount: 0,
        items: [],
        message: hasExistingWorkOrders 
          ? 'All items and sub-components already have work orders'
          : 'No "Make" items found for work order generation'
      });
    }
    
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
  
  // Clean up duplicate work orders for a project
  app.post('/api/production/work-orders/cleanup-duplicates/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Check if project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      console.log(`Manual cleanup of duplicate work orders requested for project ${projectId}`);
      
      // Run the cleanup
      await cleanupDuplicateWorkOrders(projectId);
      
      // Get updated work orders after cleanup
      const updatedWorkOrders = await db.query.workOrders.findMany({
        where: eq(workOrders.projectId, projectId),
        orderBy: [asc(workOrders.workOrderNumber)]
      });
      
      return res.status(200).json({ 
        message: 'Duplicate work orders cleanup completed',
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        workOrderCount: updatedWorkOrders.length,
        workOrders: updatedWorkOrders.map(wo => ({
          id: wo.id,
          workOrderNumber: wo.workOrderNumber,
          title: wo.title
        }))
      });
    } catch (error) {
      console.error('Error cleaning up duplicate work orders:', error);
      return res.status(500).json({ error: 'An unexpected error occurred during duplicate cleanup' });
    }
  });
  
  // Generate work orders for a project with direct implementation that properly handles sub-assemblies
  app.post('/api/production/work-orders/generate-for-project/:projectId', ensureAuthenticated, generateDirectWorkOrders);
  
  // Alternative implementations (kept as fallback)
  app.post('/api/production/work-orders/generate-for-project-improved/:projectId', ensureAuthenticated, generateImprovedWorkOrders);
  app.post('/api/production/work-orders/generate-for-project-optimized/:projectId', ensureAuthenticated, generateWorkOrdersForProject);
  app.post('/api/production/work-orders/generate-for-project-old/:projectId', ensureAuthenticated, generateWorkOrders);
  
  // Legacy implementation (kept for reference, will be removed later)
  app.post('/api/production/work-orders/generate-for-project-legacy/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
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
        
        // Get project items
        db.query.projectItems.findMany({
          where: eq(projectItems.projectId, projectId)
        }),
        
        // Get all work order numbers for this project (for uniqueness check)
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
      
      console.timeEnd('master-items-fetch');
      
      console.time('item-processing');
      
      // Get component relationships first before filtering items
      // Get parent-child relationships from component table
      const itemComponentRelationships = await db.query.itemComponents.findMany({
        where: inArray(itemComponents.parentItemId, masterItemIds)
      });
      
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
      
      // OPTIMIZATION: Fetch existing work order items
      const existingWorkOrderItems = existingWorkOrders.length > 0 
        ? await db.query.workOrderItems.findMany({
            where: inArray(workOrderItems.workOrderId, existingWorkOrders.map(wo => wo.id))
          })
        : [];
      
      // Filter out items that already have work orders
      let filteredMakeItems = makeItems;
      if (existingWorkOrderItems.length > 0) {
        const existingProjectItemIds = new Set(existingWorkOrderItems.map(item => item.projectItemId));
        filteredMakeItems = makeItems.filter(item => !existingProjectItemIds.has(item.id));
        
        if (filteredMakeItems.length === 0) {
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
          itemCount: filteredMakeItems.length
        });
      }
      
      // Categorize items as parents or children
      const parentItems: typeof makeItems = [];
      const childItems: typeof makeItems = [];
      const parentsWithComponents = new Set<number>();
      
      filteredMakeItems.forEach(item => {
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
      
      // Create virtual child items for components not explicitly included in the project
      const virtualChildItems: typeof makeItems = [];
      
      parentsWithComponents.forEach(parentItemId => {
        const parentProjectItem = filteredMakeItems.find(item => item.itemId === parentItemId);
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
          if (filteredMakeItems.some(item => item.itemId === componentItemId)) return;
          
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
      
      // Map work order items to their created work orders
      const finalWorkOrderItems = workOrderItemsToCreate.map(item => {
        const { tempWorkOrderIndex, ...rest } = item as any;
        return {
          ...rest,
          workOrderId: createdWorkOrders[tempWorkOrderIndex].id
        };
      });
      
      // Insert all work order items in bulk
      const createdWorkOrderItems = await db.insert(workOrderItems)
        .values(finalWorkOrderItems)
        .returning();
      
      console.timeEnd('work-order-creation');
      console.timeEnd('work-order-generation-total');
      
      const executionTime = Date.now() - Date.now(); // Just a placeholder
      
      // Return success response
      return res.status(201).json({
        message: 'Successfully generated work orders',
        workOrders: createdWorkOrders,
        itemCount: filteredMakeItems.length,
        parentItemCount: parentItems.length,
        childItemCount: childItems.length,
        executionTime: `${executionTime}ms`
      });
      
    } catch (error: any) {
      console.error('Error generating work orders:', error);
      return res.status(500).json({ error: error.message || 'Failed to generate work orders' });
    }
  });
  
  // Legacy implementation (kept for reference, will be removed later)
  app.post('/api/production/work-orders/generate-for-project-legacy/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.time('work-order-generation-legacy');
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
      
      // OPTIMIZATION: Fetch all required data in parallel to reduce database roundtrips
      console.time('initial-data-fetch');
      
      const [project, existingWorkOrders, projectItemsList, allWorkOrdersByNumber] = await Promise.all([
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
        
        // Get all work order numbers for this project (for uniqueness check)
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
      
      console.timeEnd('master-items-fetch');
      
      // OPTIMIZATION: Only filter make items once
      console.time('item-processing');
      const makeItems = projectItemsList.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        return masterItem && masterItem.makeOrBuy === 'Make';
      });
      
      if (makeItems.length === 0) {
        return res.status(400).json({ error: 'No "Make" items found for this project' });
      }
      
      // OPTIMIZATION: Fetch existing work order items and component relationships in parallel
      const [existingWorkOrderItems, itemComponentRelationships] = await Promise.all([
        // Only fetch if we have existing work orders
        existingWorkOrders.length > 0 
          ? db.query.workOrderItems.findMany({
              where: inArray(workOrderItems.workOrderId, existingWorkOrders.map(wo => wo.id))
            })
          : Promise.resolve([]),
          
        // Get parent-child relationships from component table
        db.query.itemComponents.findMany({
          where: inArray(itemComponents.parentItemId, masterItemIds)
        })
      ]);
      
      // OPTIMIZATION: Process component items only if needed
      const componentItemIds = itemComponentRelationships.map(rel => rel.componentItemId);
      let componentMasterItems: typeof masterItemsData = [];
      
      if (componentItemIds.length > 0) {
        componentMasterItems = await db.query.masterItems.findMany({
          where: inArray(masterItems.id, componentItemIds)
        });
        
        // Add to master items map
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
      
      // OPTIMIZATION: Process existing items once using a Set for O(1) lookups
      let filteredMakeItems = makeItems;
      if (existingWorkOrderItems.length > 0) {
        const existingProjectItemIds = new Set(existingWorkOrderItems.map(item => item.projectItemId));
        filteredMakeItems = makeItems.filter(item => !existingProjectItemIds.has(item.id));
        
        if (filteredMakeItems.length === 0) {
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
          itemCount: filteredMakeItems.length
        });
      }
      
      // OPTIMIZATION: Create work order date range
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 30); // Default to 30 days schedule
      
      // OPTIMIZATION: Create a set of existing work order numbers for faster lookups
      const existingWorkOrderNumbers = new Set(allWorkOrdersByNumber.map(wo => wo.workOrderNumber));
      
      // OPTIMIZATION: Pre-generate work order numbers without database queries
      // Calculate initial sequential numbers
      const nextParentSeqNumber = existingWorkOrders.length + 1;
      const nextChildSeqNumber = existingWorkOrders.length + 2;
      
      // Generate work order numbers upfront
      let parentWorkOrderNumber = `WO-${project.code}-${nextParentSeqNumber}`;
      let childWorkOrderNumber = `WO-${project.code}-${nextChildSeqNumber}`;
      
      // Ensure uniqueness without multiple database queries
      while (existingWorkOrderNumbers.has(parentWorkOrderNumber)) {
        parentWorkOrderNumber = `WO-${project.code}-${nextParentSeqNumber + 1}`;
      }
      
      // Ensure uniqueness without multiple database queries
      while (existingWorkOrderNumbers.has(childWorkOrderNumber) || childWorkOrderNumber === parentWorkOrderNumber) {
        childWorkOrderNumber = `WO-${project.code}-${nextChildSeqNumber + 1}`;
      }
      
      // OPTIMIZATION: Create arrays in a single pass through the items
      const parentItems: typeof makeItems = [];
      const childItems: typeof makeItems = [];
      const parentsWithComponents = new Set<number>();
      
      filteredMakeItems.forEach(item => {
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
      
      // OPTIMIZATION: Process virtual items more efficiently
      const virtualChildItems: typeof makeItems = [];
      
      parentsWithComponents.forEach(parentItemId => {
        const parentProjectItem = filteredMakeItems.find(item => item.itemId === parentItemId);
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
          if (filteredMakeItems.some(item => item.itemId === componentItemId)) return;
          
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
      const createdWorkOrders: any[] = [];
      const createdWorkOrderItems: any[] = [];
      
      // OPTIMIZATION: Create a more efficient createWorkOrder function
      const createWorkOrder = async (items: typeof makeItems, isParent: boolean, workOrderNumber: string) => {
        if (items.length === 0) return null;
        
        // Determine title and description
        let title: string;
        let description: string;
        
        if (items.length > 0) {
          const firstItem = items[0];
          const masterItem = masterItemsMap.get(firstItem.itemId);
          
          if (isParent && masterItem) {
            title = `${masterItem.itemCode} - ${masterItem.description || 'Item'}`;
            description = `Work order for parent item: ${masterItem.itemCode}`;
          } else if (!isParent) {
            title = 'Sub-Assembly Components';
            description = 'Work order for sub-assembly components';
          } else {
            title = isParent ? 'Parent Items' : 'Sub-Assembly Components';
            description = isParent ? 'Work order for parent items' : 'Work order for sub-assembly components';
          }
        } else {
          title = isParent ? 'Parent Items' : 'Sub-Assembly Components';
          description = isParent ? 'Work order for parent items' : 'Work order for sub-assembly components';
        }
        
        // This code section was removed to fix duplicate declarations
        
        // Get the quantity from the first item in the array
        // If there are no items or the quantity is invalid, default to 1
        let itemQuantity = 1;
        if (items.length > 0 && items[0].quantity) {
          // Convert the quantity to a number if it's a string
          const quantity = typeof items[0].quantity === 'string' 
            ? parseFloat(items[0].quantity) 
            : items[0].quantity;
            
          // Make sure it's a valid positive number
          if (!isNaN(quantity) && quantity > 0) {
            itemQuantity = quantity;
          }
        }
        
        // Get drawing number and UOM for parent item
        let drawingNo = null;
        if (items.length > 0 && isParent) {
          // Get the drawing number from the first item (parent items)
          const firstItem = items[0];
          
          console.log(`First item data:`, firstItem);
          
          // Get the master item to extract drawing number and UOM
          const masterItem = masterItemsMap.get(firstItem.itemId);
          
          if (masterItem) {
            console.log(`Master item data:`, masterItem);
            
            // Use drawing number from master item
            if (masterItem.drawingNo && masterItem.drawingNo.trim() !== '') {
              drawingNo = masterItem.drawingNo;
              console.log(`Using master item drawing number: ${drawingNo}`);
            }
          }
        }
        
        // Create work order with the correct quantity and drawing number
        const [newWorkOrder] = await db.insert(workOrders).values({
          projectId,
          projectCode: project.code,
          workOrderNumber: workOrderNumber,
          title: title,
          description: description,
          status: 'planned',
          priority: 'Medium',
          plannedStartDate: today,
          plannedEndDate: endDate,
          quantity: itemQuantity,
          supervisorId: req.user!.id,
          createdBy: req.user!.id,
          createdAt: today,
          updatedAt: today,
          batchNumber: drawingNo // Using batchNumber field to store drawing number
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
          
          // Prepare unit field from master item UOM
          let unit = null;
          if (masterItem && masterItem.uom) {
            unit = masterItem.uom;
            console.log(`Using UOM value "${unit}" from master item for work order item`);
          } else if (masterItem && masterItem.unit) {
            unit = masterItem.unit;
            console.log(`Using unit value "${unit}" from master item for work order item`);
          } else {
            console.log(`No UOM/unit found for master item, using default 'EA'`);
            unit = 'EA';
          }
          
          const [newItem] = await db.insert(workOrderItems).values({
            workOrderId: newWorkOrder.id,
            projectItemId: projectItemId,
            quantity: item.quantity,
            status: 'pending',
            sequenceNumber: sequenceNumber++,
            notes: itemNotes,
            createdAt: today,
            updatedAt: today,
            unit: unit // Store the UOM from master item
          }).returning();
          
          createdWorkOrderItems.push(newItem);
        }
        
        return newWorkOrder;
      };
      
      // Create individual work orders for each parent item
      for (const parentItem of parentItems) {
        // Creating a work order for the parent item first
        const parentWorkOrder = await createWorkOrder([parentItem], true, parentWorkOrderNumber);
        if (!parentWorkOrder) {
          console.warn(`Failed to create parent work order for parent item ${parentItem.id}`);
          continue;
        }
        
        // Find all direct children of this parent
        const directChildren = childItems.filter(child => {
          // Match child's parentItemId with parent's itemId
          const parentRelation = childToParentMap.get(child.itemId);
          return parentRelation === parentItem.itemId;
        });
        
        // Extract the parent work order number
        const parentWONumber = parentWorkOrder.workOrderNumber;
        
        // Now create work orders for each child with hierarchical numbering
        for (let i = 0; i < directChildren.length; i++) {
          // Get the child item details for inclusion in work order
          const childItem = directChildren[i];
          const childMasterItem = masterItemsMap.get(childItem.itemId);
          
          if (!childMasterItem) {
            console.warn(`Missing master item data for child component with itemId ${childItem.itemId}`);
          }
          
          // Create hierarchical numbering (e.g., WO-2526-1-6-1, WO-2526-1-6-2)
          const childSeqNumber = i + 1;
          await createWorkOrder(
            [directChildren[i]], 
            false, 
            `${parentWorkOrderNumber}-${childSeqNumber}`
          );
        }
      }
      
      // Handle any remaining child items that might not have parents in the makeItems list
      const processedChildItemIds = new Set();
      parentItems.forEach(parent => {
        const directChildren = childItems.filter(child => {
          const parentRelation = childToParentMap.get(child.itemId);
          return parentRelation === parent.itemId;
        });
        directChildren.forEach(child => processedChildItemIds.add(child.id));
      });
      
      const remainingChildren = childItems.filter(child => !processedChildItemIds.has(child.id));
      // Create a separate work order for each remaining child item
      for (const childItem of remainingChildren) {
        await createWorkOrder([childItem], false, childWorkOrderNumber);
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
      let nextSeqNumber = existingWorkOrderCount.length + 1;
      
      // If workOrderNumber not provided by client, generate one with sequential numbering
      // following the standard format: WO-[ProjectCode]-[SequentialNumber]
      const workOrderData = { ...req.body };
      if (!workOrderData.workOrderNumber) {
        let workOrderNumber = `WO-${project.code}-${nextSeqNumber}`;
        
        // Ensure the generated work order number is unique
        let workOrderExists = await db.query.workOrders.findFirst({
          where: eq(workOrders.workOrderNumber, workOrderNumber)
        });
        
        // If a work order with this number already exists, increment until we find a unique one
        while (workOrderExists) {
          nextSeqNumber++;
          workOrderNumber = `WO-${project.code}-${nextSeqNumber}`;
          workOrderExists = await db.query.workOrders.findFirst({
            where: eq(workOrders.workOrderNumber, workOrderNumber)
          });
        }
        
        workOrderData.workOrderNumber = workOrderNumber;
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
      
      // Extract and format the date fields properly
      const { plannedStartDate, plannedEndDate, changeComment, ...otherFields } = req.body;
      
      // Ensure dates are properly converted to Date objects
      const formattedData = {
        ...otherFields,
        updatedAt: new Date(),
        ...(plannedStartDate ? { plannedStartDate: new Date(plannedStartDate) } : {}),
        ...(plannedEndDate ? { plannedEndDate: new Date(plannedEndDate) } : {})
      };
      
      // Store change comment for history
      const userComment = changeComment || null;
      
      // Track changes for history
      const changedFields: { field: string, oldValue: any, newValue: any, description: string }[] = [];
      
      // Check for changes in each field
      Object.keys(formattedData).forEach(key => {
        // Skip the updatedAt field
        if (key === 'updatedAt') return;
        
        // Get values for comparison, handle dates properly
        let oldValue = existingWorkOrder[key as keyof typeof existingWorkOrder];
        let newValue = formattedData[key as keyof typeof formattedData];
        
        // Convert Date objects to strings for comparison
        if (oldValue instanceof Date) oldValue = oldValue.toISOString();
        if (newValue instanceof Date) newValue = newValue.toISOString();
        
        // Check if the value has changed
        if (oldValue !== newValue) {
          changedFields.push({
            field: key,
            oldValue: oldValue ? String(oldValue) : '',
            newValue: newValue ? String(newValue) : '',
            description: `Changed ${key} from "${oldValue || ''}" to "${newValue || ''}"`
          });
        }
      });
      
      // Update work order with properly formatted data
      const [updatedWorkOrder] = await db.update(workOrders)
        .set(formattedData)
        .where(eq(workOrders.id, workOrderId))
        .returning();
      
      // Create history records for each changed field
      if (changedFields.length > 0) {
        // Common history record data
        const historyBaseData = {
          workOrderId,
          userId: req.user!.id,
          username: req.user!.username,
          createdAt: new Date()
        };
        
        // Add detailed history entries for each change
        const historyEntries = changedFields.map(change => ({
          ...historyBaseData,
          changeType: 'field_update',
          fieldName: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          changeDescription: change.description,
          comment: userComment // Use the extracted change comment
        }));
        
        // Add a summary entry if there are multiple changes
        if (changedFields.length > 1) {
          historyEntries.push({
            ...historyBaseData,
            changeType: 'update',
            fieldName: '',
            oldValue: '',
            newValue: '',
            changeDescription: `Updated work order with ${changedFields.length} changes`,
            comment: userComment
          });
        }
        
        // Insert all history records
        await db.insert(workOrderHistory).values(historyEntries);
      }
      
      // If there was a status change, add special status change history record
      if (formattedData.status && existingWorkOrder.status !== formattedData.status) {
        await db.insert(workOrderHistory).values({
          workOrderId,
          userId: req.user!.id,
          username: req.user!.username,
          changeType: 'status_change',
          fieldName: 'status',
          oldValue: existingWorkOrder.status,
          newValue: formattedData.status,
          changeDescription: `Status changed from "${existingWorkOrder.status}" to "${formattedData.status}"`,
          comment: userComment,
          createdAt: new Date()
        });
      }
      
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
  
  // Clean up all work orders for a project (for testing/dev purposes)
  app.delete('/api/production/work-orders/project/:projectId/clean', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Only allow Superusers to perform this operation as it's destructive
      if (req.user!.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superusers can clean up all work orders for a project' });
      }
      
      // Check if project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Find all work orders for this project
      const projectWorkOrders = await db.query.workOrders.findMany({
        where: eq(workOrders.projectId, projectId)
      });
      
      const workOrderIds = projectWorkOrders.map(wo => wo.id);
      
      // Delete all work order items first
      if (workOrderIds.length > 0) {
        // Create a condition to match any work order ID in the list
        const workOrderIdConditions = inArray(workOrderItems.workOrderId, workOrderIds);
        await db.delete(workOrderItems).where(workOrderIdConditions);
      }
      
      // Then delete all work orders for this project
      await db.delete(workOrders).where(eq(workOrders.projectId, projectId));
      
      res.status(200).json({ 
        message: `Successfully deleted ${projectWorkOrders.length} work orders for project ${project.code}`,
        deletedCount: projectWorkOrders.length
      });
    } catch (error) {
      console.error('Error cleaning up work orders:', error);
      res.status(500).json({ error: 'Failed to clean up work orders for project' });
    }
  });
  
  // ==================== WORK ORDER ITEMS ====================
  
  // Get all items for a work order
  app.get('/api/production/work-orders/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // First, get the work order to determine if it's a child/component work order
      const workOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      // Check if this is a component work order (has parent work order number in the format WO-YYYY-#-#-#)
      const isComponentWorkOrder = workOrder.workOrderNumber.split('-').length > 4; // WO-YYYY-#-#-# has 5 parts
      
      const workOrderItemsList = await db.query.workOrderItems.findMany({
        where: eq(workOrderItems.workOrderId, workOrderId),
        orderBy: [asc(workOrderItems.sequenceNumber)]
      });
      
      // Debug log to check if unit field is present in work order items
      console.log('Fetched work order items with unit field:', workOrderItemsList[0]);
      
      // Get related project items and master items for more details
      const items = await Promise.all(workOrderItemsList.map(async (item) => {
        // Get project item
        const projectItem = await db.query.projectItems.findFirst({
          where: eq(projectItems.id, item.projectItemId)
        });
        
        let masterItem = null;
        let isVirtual = false;
        
        // For component work orders, we need to prioritize getting the actual component item details
        if (isComponentWorkOrder && item.notes) {
          // Try to extract the component item code and description from the notes first
          const match = item.notes.match(/Virtual component: ([\w\-\.]+) - (.*?)( \(|$)/);
          
          if (match && match.length >= 3) {
            isVirtual = true;
            const componentItemCode = match[1].trim();
            const componentDescription = match[2].trim();
            
            // First try to find the actual master item by item code
            const actualMasterItem = await db.query.masterItems.findFirst({
              where: eq(masterItems.itemCode, componentItemCode)
            });
            
            if (actualMasterItem) {
              // Great! We found the actual master item
              masterItem = actualMasterItem;
            } else {
              // Create a virtual item with the extracted information
              masterItem = {
                id: -1, // Use a negative ID to mark as virtual
                itemCode: componentItemCode,
                description: componentDescription,
                revision: 0,
                unit: "EA",
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          }
        }
        
        // If we haven't found a master item yet, proceed with the normal lookup
        if (!masterItem && projectItem) {
          // Get the actual master item with item code and description
          masterItem = await db.query.masterItems.findFirst({
            where: eq(masterItems.id, projectItem.itemId)
          });
          
          // Check if the project item has a virtual component via notes
          if (!isVirtual && item.notes && item.notes.includes("Virtual component:")) {
            isVirtual = true;
            
            // Try to extract the actual item code and description from the notes
            const match = item.notes.match(/Virtual component: ([\w\-\.]+) - (.*?)( \(|$)/);
            if (match && match.length >= 3) {
              // If we found a match and didn't already set masterItem, use the extracted info
              if (!masterItem) {
                masterItem = {
                  id: -1, // Use a negative ID to mark as virtual
                  itemCode: match[1].trim(),
                  description: match[2].trim(),
                  // Add other required fields with default values
                  revision: 0,
                  unit: "EA",
                  createdAt: new Date(),
                  updatedAt: new Date()
                };
              }
            }
          }
        }
        
        return {
          ...item,
          projectItem,
          masterItem,
          isVirtual
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
  
  // ==================== WORK ORDER HISTORY ====================
  
  // Get all history records for a work order
  app.get('/api/production/work-orders/:id/history', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Verify workOrderId is valid
      if (isNaN(workOrderId)) {
        return res.status(400).json({ error: 'Invalid work order ID' });
      }
      
      // Check if the work order exists
      const workOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      // Get all history records for this work order, newest first
      const historyRecords = await db.query.workOrderHistory.findMany({
        where: eq(workOrderHistory.workOrderId, workOrderId),
        orderBy: [desc(workOrderHistory.createdAt)]
      });
      
      res.status(200).json(historyRecords);
    } catch (error) {
      console.error('Error fetching work order history:', error);
      res.status(500).json({ error: 'Failed to fetch work order history' });
    }
  });
  
  // Add a history record for a work order
  app.post('/api/production/work-orders/:id/history', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      // Verify workOrderId is valid
      if (isNaN(workOrderId)) {
        return res.status(400).json({ error: 'Invalid work order ID' });
      }
      
      // Check if the work order exists
      const workOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      // Validate history data
      const validationResult = insertWorkOrderHistorySchema.safeParse({
        ...req.body,
        workOrderId,
        userId: req.user!.id,
        username: req.user!.username,
        createdAt: new Date()
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid history data', 
          details: validationResult.error 
        });
      }
      
      // Create history record
      const [newHistoryRecord] = await db.insert(workOrderHistory).values(validationResult.data).returning();
      
      res.status(201).json(newHistoryRecord);
    } catch (error) {
      console.error('Error adding work order history record:', error);
      res.status(500).json({ error: 'Failed to add work order history record' });
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

  // ==================== ENHANCED SUB-ASSEMBLY COMPONENT DETECTION ====================
  
  // Preview newly added sub-assembly components that need work orders
  app.get('/api/production/work-orders/new-components/preview/:projectId', ensureAuthenticated, previewNewComponentWorkOrders);
  
  // Generate work orders for newly added sub-assembly components
  app.post('/api/production/work-orders/new-components/generate/:projectId', ensureAuthenticated, generateWorkOrdersForNewComponents);
}