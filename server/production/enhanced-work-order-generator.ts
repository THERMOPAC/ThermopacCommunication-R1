/**
 * Enhanced Work Order Generator
 * 
 * Implements intelligent logic to detect newly added sub-assembly components
 * that don't have work orders yet, similar to how the system handles new project items.
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { eq, inArray, sql, and, isNull } from 'drizzle-orm';
import { 
  workOrders, workOrderItems, projects, projectItems, masterItems, itemComponents 
} from '@shared/schema';

interface ComponentWorkOrderCandidate {
  componentItemCode: string;
  componentDescription: string;
  parentItemCode: string;
  parentDescription: string;
  quantity: number;
  componentItemId: number;
  parentItemId: number;
  hasExistingWorkOrder: boolean;
}

/**
 * Enhanced function to detect newly added sub-assembly components
 * that need work orders but don't have them yet
 */
export async function detectNewSubAssemblyComponents(projectId: number): Promise<ComponentWorkOrderCandidate[]> {
  console.log(`=== Detecting New Sub-Assembly Components for Project ${projectId} ===`);
  
  // Step 1: Get all existing work order titles in this project
  const existingWorkOrders = await db.execute(sql`
    SELECT title, work_order_number 
    FROM work_orders 
    WHERE project_id = ${projectId}
  `);
  
  const existingWorkOrderTitles = new Set<string>();
  const existingItemCodes = new Set<string>();
  
  if (existingWorkOrders.rows) {
    existingWorkOrders.rows.forEach((wo: any) => {
      if (wo.title) {
        existingWorkOrderTitles.add(wo.title);
        // Extract item code from title (format: "ITEMCODE - Description")
        const itemCode = wo.title.split(' - ')[0]?.trim();
        if (itemCode) {
          existingItemCodes.add(itemCode);
        }
      }
    });
  }
  
  console.log(`Found ${existingItemCodes.size} items with existing work orders`);
  
  // Step 2: Get all "Make" items in the project that have sub-components
  const projectItemsQuery = await db.execute(sql`
    SELECT 
      pi.id as project_item_id,
      pi.project_id,
      mi.id as master_item_id,
      mi.item_code as parent_item_code,
      mi.description as parent_description,
      mi.make_or_buy
    FROM project_items pi
    JOIN master_items mi ON pi.item_id = mi.id
    WHERE pi.project_id = ${projectId}
      AND mi.make_or_buy = 'Make'
  `);
  
  const makeItems = projectItemsQuery.rows || [];
  console.log(`Found ${makeItems.length} "Make" items in project`);
  
  // Step 3: For each "Make" item, get its sub-components
  const componentCandidates: ComponentWorkOrderCandidate[] = [];
  
  for (const makeItem of makeItems) {
    const componentsQuery = await db.execute(sql`
      SELECT 
        ic.quantity,
        comp_mi.id as component_item_id,
        comp_mi.item_code as component_item_code,
        comp_mi.description as component_description
      FROM item_components ic
      JOIN master_items comp_mi ON ic.component_item_id = comp_mi.id
      WHERE ic.parent_item_id = ${makeItem.master_item_id}
    `);
    
    const components = componentsQuery.rows || [];
    console.log(`Item ${makeItem.parent_item_code} has ${components.length} sub-components`);
    
    // Step 4: Check which components don't have work orders yet
    for (const component of components) {
      const hasExistingWorkOrder = existingItemCodes.has(component.component_item_code);
      
      componentCandidates.push({
        componentItemCode: component.component_item_code,
        componentDescription: component.component_description,
        parentItemCode: makeItem.parent_item_code,
        parentDescription: makeItem.parent_description,
        quantity: component.quantity,
        componentItemId: component.component_item_id,
        parentItemId: makeItem.master_item_id,
        hasExistingWorkOrder
      });
      
      if (!hasExistingWorkOrder) {
        console.log(`🔍 NEW COMPONENT DETECTED: ${component.component_item_code} (parent: ${makeItem.parent_item_code})`);
      }
    }
  }
  
  const newComponents = componentCandidates.filter(c => !c.hasExistingWorkOrder);
  console.log(`Found ${newComponents.length} new sub-components that need work orders`);
  
  return componentCandidates;
}

/**
 * Generate work orders for newly detected sub-assembly components
 */
export async function generateWorkOrdersForNewComponents(req: Request, res: Response) {
  try {
    const projectId = parseInt(req.params.projectId);
    const { confirm } = req.body;
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Get project info
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Detect new components
    const componentCandidates = await detectNewSubAssemblyComponents(projectId);
    const newComponents = componentCandidates.filter(c => !c.hasExistingWorkOrder);
    
    if (!confirm) {
      // Return preview of what would be generated
      return res.json({
        success: true,
        preview: true,
        project: {
          id: projectId,
          name: project.name,
          code: project.code
        },
        existingComponents: componentCandidates.filter(c => c.hasExistingWorkOrder).length,
        newComponentsFound: newComponents.length,
        newComponents: newComponents.map(c => ({
          itemCode: c.componentItemCode,
          description: c.componentDescription,
          parentItem: c.parentItemCode,
          quantity: c.quantity
        }))
      });
    }
    
    // Generate work orders for new components
    if (newComponents.length === 0) {
      return res.json({
        success: true,
        message: 'No new sub-assembly components found that need work orders',
        workOrdersCreated: 0
      });
    }
    
    const createdWorkOrders = [];
    
    // Get the highest work order number for this project
    const lastWorkOrderQuery = await db.execute(sql`
      SELECT work_order_number 
      FROM work_orders 
      WHERE project_id = ${projectId}
        AND work_order_number LIKE 'WO-' || ${project.code} || '-%'
      ORDER BY id DESC 
      LIMIT 1
    `);
    
    let nextWorkOrderNumber = 1;
    if (lastWorkOrderQuery.rows && lastWorkOrderQuery.rows.length > 0) {
      const lastNumber = lastWorkOrderQuery.rows[0].work_order_number;
      const match = lastNumber.match(/WO-.*-(\d+)$/);
      if (match) {
        nextWorkOrderNumber = parseInt(match[1]) + 1;
      }
    }
    
    // Create work orders for each new component
    for (const component of newComponents) {
      const workOrderNumber = `WO-${project.code}-${nextWorkOrderNumber}`;
      const title = `${component.componentItemCode} - ${component.componentDescription}`;
      const description = `Work order for sub-component: ${component.componentItemCode} (parent: ${component.parentItemCode})`;
      
      console.log(`Creating work order ${workOrderNumber} for component ${component.componentItemCode}`);
      
      // Create the work order
      const [newWorkOrder] = await db.insert(workOrders).values({
        projectId: projectId,
        projectCode: project.code || '',
        workOrderNumber,
        title,
        description,
        status: 'planned',
        priority: 'medium',
        quantity: component.quantity,
        createdBy: req.user?.id || 1
      }).returning();
      
      // Add to project items if the component doesn't exist as a project item
      let projectItemId: number;
      
      const existingProjectItem = await db.execute(sql`
        SELECT id FROM project_items 
        WHERE project_id = ${projectId} AND item_id = ${component.componentItemId}
        LIMIT 1
      `);
      
      if (existingProjectItem.rows && existingProjectItem.rows.length > 0) {
        projectItemId = existingProjectItem.rows[0].id;
      } else {
        // Create new project item for this component
        const [newProjectItem] = await db.insert(projectItems).values({
          projectId: projectId,
          projectCode: project.code || '',
          itemId: component.componentItemId,
          quantity: component.quantity,
          status: 'Not Started'
        }).returning();
        
        projectItemId = newProjectItem.id;
        console.log(`Created project item ${projectItemId} for component ${component.componentItemCode}`);
      }
      
      // Create work order item
      await db.insert(workOrderItems).values({
        workOrderId: newWorkOrder.id,
        projectItemId: projectItemId,
        quantity: component.quantity
      });
      
      createdWorkOrders.push({
        workOrderNumber,
        itemCode: component.componentItemCode,
        description: component.componentDescription,
        parentItem: component.parentItemCode,
        quantity: component.quantity
      });
      
      nextWorkOrderNumber++;
    }
    
    console.log(`✅ Successfully created ${createdWorkOrders.length} work orders for new sub-components`);
    
    return res.json({
      success: true,
      message: `Successfully created ${createdWorkOrders.length} work orders for new sub-assembly components`,
      workOrdersCreated: createdWorkOrders.length,
      workOrders: createdWorkOrders
    });
    
  } catch (error) {
    console.error('Error generating work orders for new components:', error);
    return res.status(500).json({
      error: 'Failed to generate work orders for new components',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Preview endpoint to show what new components would get work orders
 */
export async function previewNewComponentWorkOrders(req: Request, res: Response) {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    const componentCandidates = await detectNewSubAssemblyComponents(projectId);
    const newComponents = componentCandidates.filter(c => !c.hasExistingWorkOrder);
    const existingComponents = componentCandidates.filter(c => c.hasExistingWorkOrder);
    
    return res.json({
      success: true,
      projectId,
      summary: {
        totalComponents: componentCandidates.length,
        existingWorkOrders: existingComponents.length,
        newComponentsNeedingWorkOrders: newComponents.length
      },
      newComponents: newComponents.map(c => ({
        itemCode: c.componentItemCode,
        description: c.componentDescription,
        parentItem: c.parentItemCode,
        quantity: c.quantity
      })),
      existingComponents: existingComponents.map(c => ({
        itemCode: c.componentItemCode,
        description: c.componentDescription,
        parentItem: c.parentItemCode
      }))
    });
    
  } catch (error) {
    console.error('Error previewing new component work orders:', error);
    return res.status(500).json({
      error: 'Failed to preview new component work orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}