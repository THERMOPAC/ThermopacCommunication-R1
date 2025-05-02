// Debugging script for inspection order generation
import { db } from '../db.ts';
import { 
  eq, 
  inArray,
} from 'drizzle-orm';
import { 
  projects, 
  projectItems, 
  masterItems,
  inspectionOrders
} from '../../shared/schema.ts';

async function debugInspectionOrderGeneration() {
  try {
    const projectId = 3; // Project 2025-1
    
    console.log('\n=== INSPECTION ORDER GENERATION DEBUG SCRIPT ===\n');
    
    // 1. Fetch project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      console.log('❌ ERROR: Project not found');
      return;
    }
    
    console.log(`✅ Project found: ${project.id} ${project.code}`);
    console.log(`Project status: ${project.status}`);
    
    // 2. Fetch all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    if (!projectItemsList.length) {
      console.log('❌ ERROR: No project items found for this project');
      return;
    }
    
    console.log(`✅ Found ${projectItemsList.length} project items`);
    
    // 3. Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`✅ Found ${masterItemsArray.length} master items out of ${masterItemIds.length} requested`);
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // 4. Get existing inspection orders for this project
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    console.log(`✅ Found ${existingInspectionOrders.length} existing inspection orders`);
    
    // 5. Create a set of PROJECT ITEM IDs that already have inspection orders
    const projectItemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        projectItemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    console.log(`✅ Found ${projectItemsWithInspectionOrders.size} project items with existing inspection orders`);
    console.log('Project items with existing inspection orders:', Array.from(projectItemsWithInspectionOrders));
    
    // 6. Separate items into "Make" items and "Buy" items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy';
    });
    
    console.log(`✅ Found ${makeItems.length} make items and ${buyItems.length} buy items before filtering`);
    
    // 7. Filter out items that already have inspection orders
    const filteredMakeItems = makeItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    const filteredBuyItems = buyItems.filter(item => !projectItemsWithInspectionOrders.has(item.id));
    
    console.log(`✅ After filtering: ${filteredMakeItems.length} make items, ${filteredBuyItems.length} buy items available for inspection orders`);
    
    // 8. List all eligible items
    console.log('\n--- Make Items Eligible for Inspection Orders ---');
    filteredMakeItems.forEach((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId);
      console.log(`${index + 1}. Project Item ID: ${item.id}, Master Item ID: ${item.itemId}, Code: ${masterItem?.itemCode}, Make/Buy: ${masterItem?.makeOrBuy}`);
    });
    
    console.log('\n--- Buy Items Eligible for Inspection Orders ---');
    filteredBuyItems.forEach((item, index) => {
      const masterItem = masterItemsMap.get(item.itemId);
      console.log(`${index + 1}. Project Item ID: ${item.id}, Master Item ID: ${item.itemId}, Code: ${masterItem?.itemCode}, Make/Buy: ${masterItem?.makeOrBuy}`);
    });
    
    // 9. Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total project items: ${projectItemsList.length}`);
    console.log(`Make items: ${makeItems.length}, Buy items: ${buyItems.length}`);
    console.log(`Make items eligible for inspection: ${filteredMakeItems.length}`);
    console.log(`Buy items eligible for inspection: ${filteredBuyItems.length}`);
    console.log(`Total eligible items: ${filteredMakeItems.length + filteredBuyItems.length}`);
    
    if (filteredMakeItems.length === 0 && filteredBuyItems.length === 0) {
      console.log('\n❌ No items available for inspection order generation');
    } else {
      console.log('\n✅ Items available for inspection order generation');
    }
    
  } catch (error) {
    console.error('Error in debug script:', error);
  }
}

// Run the debug script
debugInspectionOrderGeneration();