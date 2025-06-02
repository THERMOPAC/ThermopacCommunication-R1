import { db } from './db';
import { eq, inArray } from 'drizzle-orm';
import { projectItems, masterItems, itemComponents, workOrders, workOrderItems } from '@shared/schema';

/**
 * Detects sub-assembly components that need work orders
 * This handles the specific case where components are added to a parent item
 * after the initial work order generation
 */
export async function detectComponentsNeedingWorkOrders(projectId: number) {
  console.log(`[COMPONENT-DETECTOR] Starting detection for project ${projectId}`);
  
  // 1. Get all project items
  const allProjectItems = await db.query.projectItems.findMany({
    where: eq(projectItems.projectId, projectId)
  });
  
  console.log(`[COMPONENT-DETECTOR] Found ${allProjectItems.length} project items`);
  
  // 2. Get all master items for these project items
  const itemIds = allProjectItems.map(pi => pi.itemId);
  const allMasterItems = await db.query.masterItems.findMany({
    where: inArray(masterItems.id, itemIds)
  });
  
  console.log(`[COMPONENT-DETECTOR] Found ${allMasterItems.length} master items`);
  
  // 3. Find all component relationships for these items
  const componentRelationships = await db.query.itemComponents.findMany({
    where: inArray(itemComponents.parentItemId, itemIds)
  });
  
  console.log(`[COMPONENT-DETECTOR] Found ${componentRelationships.length} component relationships`);
  
  if (componentRelationships.length === 0) {
    return [];
  }
  
  // 4. Get component master items
  const componentItemIds = componentRelationships.map(rel => rel.componentItemId);
  const componentMasterItems = await db.query.masterItems.findMany({
    where: inArray(masterItems.id, componentItemIds)
  });
  
  console.log(`[COMPONENT-DETECTOR] Found ${componentMasterItems.length} component master items`);
  
  // 5. Check which components already have work orders
  const existingWorkOrders = await db.query.workOrders.findMany({
    where: eq(workOrders.projectId, projectId)
  });
  
  const existingWorkOrderIds = existingWorkOrders.map(wo => wo.id);
  const existingWorkOrderItems = await db.query.workOrderItems.findMany({
    where: inArray(workOrderItems.workOrderId, existingWorkOrderIds)
  });
  
  // Map project item IDs to item IDs for existing work orders
  const existingItemIds = new Set();
  for (const woItem of existingWorkOrderItems) {
    const projectItem = allProjectItems.find(pi => pi.id === woItem.projectItemId);
    if (projectItem) {
      existingItemIds.add(projectItem.itemId);
    }
  }
  
  console.log(`[COMPONENT-DETECTOR] Items with existing work orders:`, Array.from(existingItemIds));
  
  // 6. Find components that need work orders
  const componentsNeedingWorkOrders = [];
  
  for (const rel of componentRelationships) {
    const componentMasterItem = componentMasterItems.find(mi => mi.id === rel.componentItemId);
    
    if (componentMasterItem && 
        componentMasterItem.makeOrBuy === 'Make' && 
        !existingItemIds.has(rel.componentItemId)) {
      
      const parentProjectItem = allProjectItems.find(pi => pi.itemId === rel.parentItemId);
      const parentMasterItem = allMasterItems.find(mi => mi.id === rel.parentItemId);
      
      if (parentProjectItem && parentMasterItem) {
        console.log(`[COMPONENT-DETECTOR] Component needs work order: ${componentMasterItem.itemCode}`);
        
        componentsNeedingWorkOrders.push({
          componentId: rel.componentItemId,
          componentCode: componentMasterItem.itemCode,
          componentDescription: componentMasterItem.description,
          parentId: rel.parentItemId,
          parentCode: parentMasterItem.itemCode,
          parentProjectItemId: parentProjectItem.id,
          quantity: rel.quantity || 1
        });
      }
    }
  }
  
  console.log(`[COMPONENT-DETECTOR] Found ${componentsNeedingWorkOrders.length} components needing work orders`);
  
  return componentsNeedingWorkOrders;
}