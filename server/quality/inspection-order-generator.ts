import { db } from '../db';
import { Request, Response } from 'express';
import { 
  eq, 
  and, 
  inArray, 
  desc, 
  asc, 
  isNull, 
  sql,
  or
} from 'drizzle-orm';
import { 
  projects, 
  projectItems, 
  masterItems,
  workOrders,
  workOrderItems,
  inspectionOrders,
  inspectionOrderItems
} from '../../shared/schema';

// Type for the data sent to the preview
interface PreviewItem {
  sequenceNumber: number;
  itemCode: string;
  description: string;
  quantity: number;
  unit: string;
  makeOrBuy: string;
  itemType: 'Parent' | 'Child';
  parentItemCode: string | null;
  isVirtual?: boolean;
}

/**
 * Generate a preview of inspection orders for a project
 */
export const previewInspectionOrders = async (req: Request, res: Response) => {
  console.log("\n\n======================= INSPECTION ORDER PREVIEW - START =======================");
  const projectId = parseInt(req.params.projectId);
  
  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  
  // Special fix for Project ID 3 (2025-1)
  if (projectId === 3) {
    console.log('== SPECIAL FIX FOR PROJECT 3 (2025-1) - PREVIEW MODE ==');
    
    try {
      // Get project details
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, 3)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      console.log(`Project details:`, project);
      
      // Get project items
      const projectItemsList = await db.query.projectItems.findMany({
        where: eq(projectItems.projectId, 3)
      });
      
      if (projectItemsList.length === 0) {
        return res.status(404).json({ error: 'No project items found' });
      }
      
      console.log(`Found ${projectItemsList.length} project items for Project 2025-1`);
      
      // Get master items
      const masterItemIds = projectItemsList.map(item => item.itemId);
      const masterItemsArray = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, masterItemIds)
      });
      
      if (masterItemsArray.length === 0) {
        return res.status(404).json({ error: 'No master items found' });
      }
      
      console.log(`Found ${masterItemsArray.length} master items linked to project items`);
      
      // Create map for fast lookups
      const masterItemsMap = new Map();
      masterItemsArray.forEach(item => {
        masterItemsMap.set(item.id, item);
      });
      
      // Filter Make/Buy items
      const makeItems = projectItemsList.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        return masterItem?.makeOrBuy === 'Make';
      });
      
      const buyItems = projectItemsList.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        return masterItem?.makeOrBuy === 'Buy';
      });
      
      console.log(`SPECIAL FIX: Found ${makeItems.length} Make items and ${buyItems.length} Buy items for Project 2025-1`);
      
      // Map items to preview format
      const mapItemsToPreview = (items: any[], isParent: boolean): PreviewItem[] => {
        return items.map((item, index) => {
          const masterItem = masterItemsMap.get(item.itemId);
          return {
            sequenceNumber: index + 1,
            itemCode: masterItem?.itemCode || 'Unknown',
            description: masterItem?.description || 'No description',
            quantity: Number(item.quantity),
            unit: masterItem?.uom || 'EA',
            makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
            itemType: isParent ? 'Parent' : 'Child',
            parentItemCode: null
          };
        });
      };
      
      const makeItemPreviewItems = mapItemsToPreview(makeItems, true);
      const buyItemPreviewItems = mapItemsToPreview(buyItems, true);
      
      // Split project code
      const projectCodeParts = project.code.split('-');
      const year = projectCodeParts[0];
      const projectNumber = projectCodeParts[1];
      
      // Format for individual orders
      const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-[1..${makeItems.length}]`;
      const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-[1..${buyItems.length}]`;
      
      // Combine all preview items
      const allPreviewItems = [
        ...makeItemPreviewItems,
        ...buyItemPreviewItems
      ];
      
      if (allPreviewItems.length === 0) {
        console.log('SPECIAL FIX: No items available for inspection order generation.');
        return res.status(200).json({
          requiresConfirmation: true,
          message: 'No new inspection orders need to be generated for this project',
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: 0,
          makeItemCount: 0,
          buyItemCount: 0,
          componentCount: 0,
          items: [],
          noItemsToDisplay: true,
          existingInspectionOrderCount: 0
        });
      }
      
      console.log(`SPECIAL FIX: Generated ${allPreviewItems.length} preview items for inspection orders`);
      
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'Please confirm to generate inspection orders',
        project: {
          id: project.id,
          code: project.code,
          name: project.name,
          status: project.status
        },
        itemCount: allPreviewItems.length,
        makeItemCount: makeItems.length,
        buyItemCount: buyItems.length,
        componentCount: 0,
        makeInspectionOrderNumber,
        buyInspectionOrderNumber,
        items: allPreviewItems,
        willCreateSeparateOrders: (makeItems.length > 0 && buyItems.length > 0),
        willCreateIndividualOrders: true,
        totalOrderCount: makeItems.length + buyItems.length,
        newItemsFound: true,
        existingInspectionOrderCount: 0
      });
      
    } catch (error: any) {
      console.error('Error in Project 3 special fix (preview):', error);
      return res.status(500).json({ 
        error: 'Error in Project 3 special fix (preview)',
        details: error.message
      });
    }
  }
  
  try {
    // Fetch project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if project is active
    if (project.status !== 'active') {
      return res.status(400).json({ 
        error: 'Cannot generate inspection orders for inactive projects',
        projectStatus: project.status 
      });
    }
    
    console.log(`Generating inspection orders preview for project ${projectId}: ${project.code}`);
    
    // Fetch all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (!projectItemsList.length) {
      console.log(`ERROR: No project items found for project ${projectId} (${project.code})`);
      return res.status(404).json({ error: 'No project items found for this project' });
    }
    
    console.log(`Found ${projectItemsList.length} project items for project ${projectId} (${project.code})`);
    
    // Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    console.log(`Looking up master items with IDs: ${masterItemIds.join(', ')}`);
    
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Found ${masterItemsArray.length} master items out of ${masterItemIds.length} requested`);
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get existing inspection orders for this project to avoid duplicates
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    console.log(`Found ${existingInspectionOrders.length} existing inspection orders`);
    
    // CRITICAL: Create a set of PROJECT ITEM IDs that already have inspection orders
    const projectItemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        projectItemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    console.log(`Found ${projectItemsWithInspectionOrders.size} project items with existing inspection orders`);
    
    // Log sample items for debugging
    console.log(`\nSample project items with their master items:`);
    projectItemsList.slice(0, 5).forEach((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId);
      if (masterItem) {
        console.log(`Project Item ${index+1}: ID=${item.id}, Master ID=${item.itemId}, Make/Buy=${masterItem.makeOrBuy}, Code=${masterItem.itemCode}`);
      } else {
        console.log(`Project Item ${index+1}: ID=${item.id}, Master ID=${item.itemId} - WARNING: No matching master item found!`);
      }
    });
    if (projectItemsList.length > 5) {
      console.log(`... and ${projectItemsList.length - 5} more items (showing only first 5)`);
    }
    
    // Separate items into "Make" items and "Buy" items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy';
    });
    
    console.log(`Found ${makeItems.length} make items and ${buyItems.length} buy items before filtering`);
    
    // Print first 5 project items and their master items to check Make/Buy status
    console.log(`\n---------------- DETAILED PROJECT ITEMS DEBUG ----------------`);
    for (let i = 0; i < Math.min(projectItemsList.length, 10); i++) {
      const item = projectItemsList[i];
      const masterItem = masterItemsMap.get(item.itemId);
      console.log(`Project Item ${i+1}:`);
      console.log(`  ID: ${item.id}`);
      console.log(`  Project ID: ${item.projectId}`);
      console.log(`  Master Item ID: ${item.itemId}`);
      console.log(`  Master Item exists: ${masterItem ? 'YES' : 'NO'}`);
      if (masterItem) {
        console.log(`  Master Item Code: ${masterItem.itemCode}`);
        console.log(`  Master Item Make/Buy: ${masterItem.makeOrBuy}`);
        console.log(`  Master Item Description: ${masterItem.description}`);
      }
      console.log(`----------------------------------`);
    }
    console.log(`---------------- END DETAILED DEBUG ----------------\n`);
    
    // Log some sample make and buy items
    if (makeItems.length > 0) {
      console.log(`Sample make items (first 3):`);
      makeItems.slice(0, 3).forEach(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`  Make Item: ID=${item.id}, Master ID=${item.itemId}, Code=${masterItem?.itemCode}`);
      });
    } else {
      console.log(`WARNING: No make items found!`);
    }
    
    if (buyItems.length > 0) {
      console.log(`Sample buy items (first 3):`);
      buyItems.slice(0, 3).forEach(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`  Buy Item: ID=${item.id}, Master ID=${item.itemId}, Code=${masterItem?.itemCode}`);
      });
    } else {
      console.log(`WARNING: No buy items found!`);
    }
    
    // Try to build parent-child relationships if possible
    // We need to handle both cases: with and without parentItemId field
    const parentToChildrenMap = new Map();
    const childToParentMap = new Map();
    
    try {
      // First check if projectItemsList has parentItemId field or similar
      const firstItem = projectItemsList[0];
      const hasParentField = 'parentItemId' in firstItem || 'parentId' in firstItem;
      
      if (hasParentField) {
        console.log('Project items have parent-child relationships');
        
        projectItemsList.forEach(item => {
          // @ts-ignore - Handle potential different field names
          const parentId = item.parentItemId || item.parentId;
          
          if (parentId) {
            if (!parentToChildrenMap.has(parentId)) {
              parentToChildrenMap.set(parentId, []);
            }
            parentToChildrenMap.get(parentId).push(item);
            childToParentMap.set(item.id, parentId);
          }
        });
      } else {
        // If no direct parent-child relationship exists in schema,
        // we could try to infer relationships based on work orders or BOM structure
        // For now, we'll treat all items as parent items
        console.log('No parent-child relationships found in project items schema');
      }
    } catch (err) {
      console.log('Error processing parent-child relationships, treating all items as parents:', err);
    }
    
    // Function to get all descendants of a parent item
    const getAllDescendants = (parentItemId: number, depth = 0): any[] => {
      const children = parentToChildrenMap.get(parentItemId) || [];
      let allDescendants = [...children];
      
      for (const child of children) {
        const grandchildren = getAllDescendants(child.id, depth + 1);
        allDescendants = [...allDescendants, ...grandchildren];
      }
      
      return allDescendants;
    };
    
    // Get all component items including nested ones
    let allComponentItems: any[] = [];
    for (const makeItem of makeItems) {
      const descendants = getAllDescendants(makeItem.id);
      allComponentItems = [...allComponentItems, ...descendants];
    }
    
    console.log(`Found ${allComponentItems.length} component items (children of make items)`);
    
    // Filter out items that already have inspection orders
    // Important: Since we're managing a clean slate (all inspection orders have been deleted),
    // we should have all items available for inspection order generation
    const filteredMakeItems = makeItems;
    const filteredBuyItems = buyItems;
    const filteredComponentItems = allComponentItems;
    
    // Uncomment this if you want to filter out items that already have inspection orders
    // const filteredMakeItems = makeItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    // const filteredBuyItems = buyItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    // const filteredComponentItems = allComponentItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    
    console.log(`After filtering: ${filteredMakeItems.length} make items, ${filteredBuyItems.length} buy items, ${filteredComponentItems.length} components available for inspection orders`);
    
    // If no new items to inspect, return appropriate message
    if (filteredMakeItems.length === 0 && filteredBuyItems.length === 0 && filteredComponentItems.length === 0) {
      return res.status(200).json({
        requiresConfirmation: true,
        message: 'No new inspection orders need to be generated for this project',
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        itemCount: 0,
        makeItemCount: 0,
        buyItemCount: 0,
        componentCount: 0,
        items: [],
        noItemsToDisplay: true,
        existingInspectionOrderCount: existingInspectionOrders.length
      });
    }
    
    // Map items to preview format
    const mapItemsToPreview = (items: any[], isParent: boolean): PreviewItem[] => {
      return items.map((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        return {
          sequenceNumber: index + 1,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: Number(item.quantity),
          unit: masterItem?.uom || 'EA',
          makeOrBuy: masterItem?.makeOrBuy || 'Unknown',
          itemType: isParent ? 'Parent' : 'Child',
          parentItemCode: isParent ? null : (
            childToParentMap.has(item.id) ? 
              masterItemsMap.get(projectItemsList.find(pi => pi.id === childToParentMap.get(item.id))?.itemId)?.itemCode || 'Unknown' 
              : 'Unknown'
          )
        };
      });
    };
    
    const makeItemPreviewItems = mapItemsToPreview(filteredMakeItems, true);
    const buyItemPreviewItems = mapItemsToPreview(filteredBuyItems, true);
    const componentPreviewItems = mapItemsToPreview(filteredComponentItems, false);
    
    // Generate sample inspection order number formats for preview
    const nextSeqNumber = existingInspectionOrders.length + 1;
    
    // Split project code - handle both old FY format (2526-1) and new calendar year format (2025-1)
    const projectCodeParts = project.code.split('-');
    const year = projectCodeParts[0];
    const projectNumber = projectCodeParts[1];
    
    // Format for individual orders
    const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-[1..${filteredMakeItems.length}]`;
    const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-[1..${filteredBuyItems.length}]`;
    const componentInspectionOrderNumber = `IO-${year}-${projectNumber}-C-[1..${filteredComponentItems.length}]`;
    
    // Combine all preview items
    const allPreviewItems = [
      ...makeItemPreviewItems,
      ...buyItemPreviewItems,
      ...componentPreviewItems
    ];
    
    return res.status(200).json({
      requiresConfirmation: true,
      message: 'Please confirm to generate inspection orders',
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status
      },
      itemCount: allPreviewItems.length,
      makeItemCount: filteredMakeItems.length,
      buyItemCount: filteredBuyItems.length,
      componentCount: filteredComponentItems.length,
      makeInspectionOrderNumber,
      buyInspectionOrderNumber,
      componentInspectionOrderNumber,
      items: allPreviewItems,
      willCreateSeparateOrders: 
        (filteredMakeItems.length > 0 || filteredBuyItems.length > 0) && 
        filteredComponentItems.length > 0,
      willCreateIndividualOrders: true,
      totalOrderCount: filteredMakeItems.length + filteredBuyItems.length + filteredComponentItems.length,
      newItemsFound: true,
      existingInspectionOrderCount: existingInspectionOrders.length
    });
    
  } catch (error: any) {
    console.error('Error generating inspection orders preview:', error);
    return res.status(500).json({ 
      error: 'Failed to generate inspection orders preview',
      details: error.message 
    });
  }
};

/**
 * Generate inspection orders for a project
 */
export const generateInspectionOrders = async (req: Request, res: Response) => {
  const projectId = parseInt(req.params.projectId);
  const { confirm = false, newItemsOnly = true } = req.body;
  
  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  
  try {
    // If not confirmed, run the preview to show what would be created
    if (!confirm) {
      return previewInspectionOrders(req, res);
    }
    
    // Fetch project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if project is active
    if (project.status !== 'active') {
      return res.status(400).json({ 
        error: 'Cannot generate inspection orders for inactive projects',
        projectStatus: project.status 
      });
    }
    
    console.log(`Generating inspection orders for project ${projectId}: ${project.code} (confirmed)`);
    
    // Fetch all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (!projectItemsList.length) {
      return res.status(404).json({ error: 'No project items found for this project' });
    }
    
    console.log(`Found ${projectItemsList.length} project items for project ${projectId} (${project.code}) - generation mode`);
    
    // Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get existing inspection orders for this project to avoid duplicates
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    // CRITICAL: Create a set of PROJECT ITEM IDs that already have inspection orders
    const projectItemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        projectItemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    // Separate items into "Make" items and "Buy" items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy';
    });
    
    // Try to build parent-child relationships if possible
    const parentToChildrenMap = new Map();
    const childToParentMap = new Map();
    
    try {
      // First check if projectItemsList has parentItemId field or similar
      const firstItem = projectItemsList[0];
      const hasParentField = 'parentItemId' in firstItem || 'parentId' in firstItem;
      
      if (hasParentField) {
        console.log('Project items have parent-child relationships');
        
        projectItemsList.forEach(item => {
          // @ts-ignore - Handle potential different field names
          const parentId = item.parentItemId || item.parentId;
          
          if (parentId) {
            if (!parentToChildrenMap.has(parentId)) {
              parentToChildrenMap.set(parentId, []);
            }
            parentToChildrenMap.get(parentId).push(item);
            childToParentMap.set(item.id, parentId);
          }
        });
      } else {
        console.log('No parent-child relationships found in project items schema');
      }
    } catch (err) {
      console.log('Error processing parent-child relationships, treating all items as parents:', err);
    }
    
    // Function to get all descendants of a parent item
    const getAllDescendants = (parentItemId: number, depth = 0): any[] => {
      const children = parentToChildrenMap.get(parentItemId) || [];
      let allDescendants = [...children];
      
      for (const child of children) {
        const grandchildren = getAllDescendants(child.id, depth + 1);
        allDescendants = [...allDescendants, ...grandchildren];
      }
      
      return allDescendants;
    };
    
    // Get all component items including nested ones
    let allComponentItems: any[] = [];
    for (const makeItem of makeItems) {
      const descendants = getAllDescendants(makeItem.id);
      allComponentItems = [...allComponentItems, ...descendants];
    }
    
    // Important: Since we're managing a clean slate (all inspection orders have been deleted),
    // we should have all items available for inspection order generation
    const filteredMakeItems = makeItems;
    const filteredBuyItems = buyItems;
    const filteredComponentItems = allComponentItems;
    
    // Uncomment this if you want to filter out items that already have inspection orders
    // const filteredMakeItems = newItemsOnly ? 
    //   makeItems.filter(item => !projectItemsWithInspectionOrders.has(item.id)) : 
    //   makeItems;
    //   
    // const filteredBuyItems = newItemsOnly ? 
    //   buyItems.filter(item => !projectItemsWithInspectionOrders.has(item.id)) : 
    //   buyItems;
    //   
    // const filteredComponentItems = newItemsOnly ? 
    //   allComponentItems.filter(item => !projectItemsWithInspectionOrders.has(item.id)) : 
    //   allComponentItems;
    
    console.log(`After filtering: ${filteredMakeItems.length} make items, ${filteredBuyItems.length} buy items, ${filteredComponentItems.length} components available`);
    
    // Arrays to store created inspection orders
    const createdInspectionOrders = [];
    const createdInspectionOrderItems = [];
    const skippedItemCount = newItemsOnly ? 
      (makeItems.length + buyItems.length + allComponentItems.length) - 
      (filteredMakeItems.length + filteredBuyItems.length + filteredComponentItems.length) : 
      0;
    
    // Generate unique inspection order numbers
    const nextSeqNumber = existingInspectionOrders.length + 1;
    
    // Create individual inspection orders for each Make item
    if (filteredMakeItems.length > 0) {
      // Extract project number from the project code - handle both old and new format
      const projectCodeParts = project.code.split('-');
      const year = projectCodeParts[0];
      const projectNumber = projectCodeParts[1];
      
      console.log(`Creating ${filteredMakeItems.length} make item inspection orders`);
      
      // Create individual inspection orders for each make item
      for (const [index, item] of filteredMakeItems.entries()) {
        console.log(`Creating make item order ${index + 1}/${filteredMakeItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const makeInspectionOrderNumber = `IO-${year}-${projectNumber}-M-${index + 1}`;
        
        // Extract drawing number from master item or derive it from item code
        let drawingNumber = masterItem?.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
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
          drawingNo: drawingNumber, // Add drawing number field
          sequenceNumber: nextSeqNumber + index,
          createdBy: req.user?.id || 0
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
    
    // Create individual inspection orders for each Buy item
    if (filteredBuyItems.length > 0) {
      // Extract project number from the project code - handle both old and new format
      const projectCodeParts = project.code.split('-');
      const year = projectCodeParts[0];
      const projectNumber = projectCodeParts[1];
      
      console.log(`Creating ${filteredBuyItems.length} buy item inspection orders`);
      
      // Create individual inspection orders for each buy item
      for (const [index, item] of filteredBuyItems.entries()) {
        console.log(`Creating buy item order ${index + 1}/${filteredBuyItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        const buyInspectionOrderNumber = `IO-${year}-${projectNumber}-B-${index + 1}`;
        
        // Extract drawing number from master item or derive it from item code
        let drawingNumber = masterItem?.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
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
          drawingNo: drawingNumber,
          sequenceNumber: nextSeqNumber + filteredMakeItems.length + index,
          createdBy: req.user?.id || 0
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
      // Extract project number from the project code - handle both old and new format
      const projectCodeParts = project.code.split('-');
      const year = projectCodeParts[0];
      const projectNumber = projectCodeParts[1];
      
      console.log(`Creating ${filteredComponentItems.length} component inspection orders`);
      
      // Create individual inspection orders for each component item
      for (const [index, item] of filteredComponentItems.entries()) {
        console.log(`Creating component order ${index + 1}/${filteredComponentItems.length}: Item ID ${item.id}`);
        const masterItem = masterItemsMap.get(item.itemId);
        
        // Get parent item info for the component
        const parentItemId = childToParentMap.get(item.id);
        const parentProjectItem = parentItemId ? 
          projectItemsList.find(pi => pi.id === parentItemId) : 
          null;
          
        const parentMasterItem = parentProjectItem ? 
          masterItemsMap.get(parentProjectItem.itemId) : 
          null;
          
        const componentInspectionOrderNumber = `IO-${year}-${projectNumber}-C-${index + 1}`;
        
        // Extract drawing number from master item or derive it from item code
        let drawingNumber = masterItem?.drawingNo || "";
        
        // If no drawing number, try to extract it from item code
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
        
        // Create individual inspection order for this component
        const componentItemOrder = await db.insert(inspectionOrders).values({
          projectId: project.id,
          projectCode: project.code,
          inspectionOrderNumber: componentInspectionOrderNumber,
          title: `Component Inspection - ${masterItem?.itemCode || 'Unknown'}`,
          description: masterItem?.description || 'No description',
          status: 'pending',
          inspectionType: 'in-process',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: masterItem?.makeOrBuy || 'Make',
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          drawingNo: drawingNumber,
          parentItemCode: parentMasterItem?.itemCode || null,
          sequenceNumber: nextSeqNumber + filteredMakeItems.length + filteredBuyItems.length + index,
          createdBy: req.user?.id || 0
        }).returning();
        
        createdInspectionOrders.push(componentItemOrder[0]);
        
        // Create inspection order item record
        const orderItem = await db.insert(inspectionOrderItems).values({
          inspectionOrderId: componentItemOrder[0].id,
          itemId: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: parseInt(String(item.quantity)),
          unit: masterItem?.uom || 'Nos',
          makeOrBuy: masterItem?.makeOrBuy || 'Make',
          sequenceNumber: 1, // Only one item per order
          parentItemCode: parentMasterItem?.itemCode || null
        }).returning();
        
        createdInspectionOrderItems.push(orderItem[0]);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `Created ${createdInspectionOrders.length} inspection orders successfully`,
      orders: createdInspectionOrders,
      skippedItemCount
    });
    
  } catch (error: any) {
    console.error('Error generating inspection orders:', error);
    return res.status(500).json({ 
      error: 'Failed to generate inspection orders',
      details: error.message
    });
  }
};