const { db } = require('../db');
const { eq, and, inArray } = require('drizzle-orm');
const { projectItems, masterItems, inspectionOrders, projects } = require('../../shared/schema');

// This is a script to directly create inspection orders for project 2025-1
async function createInspectionOrdersForProject3() {
  try {
    console.log('Starting manual fix for project 2025-1 (ID: 3)...');
    
    // Get the project
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, 3)
    });
    
    if (!project) {
      console.log('Project not found!');
      return;
    }
    
    console.log(`Found project: ${project.code} (${project.name})`);
    
    // Get all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, 3)
    });
    
    console.log(`Found ${projectItemsList.length} project items`);
    
    // Get all master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    console.log(`Found ${masterItemsArray.length} master items`);
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get existing inspection orders for this project
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, 3)
    });
    
    console.log(`Found ${existingInspectionOrders.length} existing inspection orders`);
    
    // Create a set of item IDs that already have inspection orders
    const itemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        itemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    console.log('Items with existing inspection orders:', Array.from(itemsWithInspectionOrders));
    
    // Select all Make items that don't have inspection orders yet
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make' && !itemsWithInspectionOrders.has(item.itemId);
    });
    
    // Select all Buy items that don't have inspection orders yet
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy' && !itemsWithInspectionOrders.has(item.itemId);
    });
    
    console.log(`Found ${makeItems.length} make items and ${buyItems.length} buy items without inspection orders`);
    
    // Now create inspection orders for these items
    if (makeItems.length > 0 || buyItems.length > 0) {
      console.log('Would create inspection orders for these items:');
      
      makeItems.forEach((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`Make item ${index + 1}: ${masterItem?.itemCode} - ${masterItem?.description}`);
      });
      
      buyItems.forEach((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`Buy item ${index + 1}: ${masterItem?.itemCode} - ${masterItem?.description}`);
      });
    } else {
      console.log('No new items to create inspection orders for.');
    }
    
    // Return data for inspection order creation
    return {
      makeItemsCount: makeItems.length,
      buyItemsCount: buyItems.length,
      makeItems,
      buyItems,
      masterItemsMap,
      project
    };
  } catch (error) {
    console.error('Error in manual fix:', error);
  }
}

module.exports = { createInspectionOrdersForProject3 };