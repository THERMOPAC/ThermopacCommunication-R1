const { db } = require('../db');
const { eq, inArray } = require('drizzle-orm');
const { 
  projects, 
  projectItems, 
  masterItems,
  inspectionOrders,
  inspectionOrderItems
} = require('../../shared/schema');

/**
 * Run this debugging script to see why inspection orders are not being generated
 */
async function debugInspectionOrderGeneration(projectId = 3) {
  try {
    console.log(`DEBUGGING INSPECTION ORDER GENERATION FOR PROJECT ${projectId}`);
    
    // Get project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    
    if (!project) {
      console.log('Project not found!');
      return;
    }
    
    console.log(`Found project: ${project.code} (${project.name})`);
    
    // Get all project items
    const projectItemsList = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, projectId)
    });
    
    console.log(`Found ${projectItemsList.length} project items`);
    
    // Get master items for these project items
    const masterItemIds = projectItemsList.map(item => item.itemId);
    const masterItemsArray = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });
    
    // Create a map for faster lookups
    const masterItemsMap = new Map();
    masterItemsArray.forEach(item => {
      masterItemsMap.set(item.id, item);
    });
    
    // Get existing inspection orders for this project
    const existingInspectionOrders = await db.query.inspectionOrders.findMany({
      where: eq(inspectionOrders.projectId, projectId)
    });
    
    console.log(`Found ${existingInspectionOrders.length} existing inspection orders`);
    
    // Print the first few inspection orders
    if (existingInspectionOrders.length > 0) {
      const sampleOrders = existingInspectionOrders.slice(0, 3);
      console.log('Sample inspection orders:');
      sampleOrders.forEach(order => {
        console.log(`ID: ${order.id}, Number: ${order.inspectionOrderNumber}, ItemID: ${order.itemId}`);
      });
    }
    
    // Create a set of item IDs that already have inspection orders
    const itemsWithInspectionOrders = new Set();
    existingInspectionOrders.forEach(order => {
      if (order.itemId) {
        itemsWithInspectionOrders.add(order.itemId);
      }
    });
    
    console.log(`Found ${itemsWithInspectionOrders.size} unique items with inspection orders`);
    
    // Separate items into "Make" and "Buy" items
    const makeItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Make';
    });
    
    const buyItems = projectItemsList.filter(item => {
      const masterItem = masterItemsMap.get(item.itemId);
      return masterItem?.makeOrBuy === 'Buy';
    });
    
    console.log(`Found ${makeItems.length} make items and ${buyItems.length} buy items before filtering`);
    
    // Filter out items that already have inspection orders
    const filteredMakeItems = makeItems.filter(item => !itemsWithInspectionOrders.has(item.itemId));
    const filteredBuyItems = buyItems.filter(item => !itemsWithInspectionOrders.has(item.itemId));
    
    console.log(`After filtering: ${filteredMakeItems.length} make items and ${filteredBuyItems.length} buy items available for inspection orders`);
    
    // Print information about available items
    if (filteredMakeItems.length > 0) {
      console.log('\nAvailable Make items:');
      filteredMakeItems.forEach(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`- Item ID: ${item.id}, Master Item ID: ${item.itemId}, Code: ${masterItem?.itemCode}, Description: ${masterItem?.description}`);
      });
    }
    
    if (filteredBuyItems.length > 0) {
      console.log('\nAvailable Buy items:');
      filteredBuyItems.forEach(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        console.log(`- Item ID: ${item.id}, Master Item ID: ${item.itemId}, Code: ${masterItem?.itemCode}, Description: ${masterItem?.description}`);
      });
    }
    
    // Check the deleted inspection orders
    const uniqueItemIds = new Set(projectItemsList.map(item => item.itemId));
    console.log(`\nProject has ${uniqueItemIds.size} unique master items`);
    
    // Determine which items have no inspection orders
    const itemsWithoutOrders = [...uniqueItemIds].filter(id => !itemsWithInspectionOrders.has(id));
    console.log(`\nFound ${itemsWithoutOrders.length} master items without inspection orders`);
    
    if (itemsWithoutOrders.length > 0) {
      console.log('\nItems without inspection orders:');
      itemsWithoutOrders.forEach(itemId => {
        const relatedItems = projectItemsList.filter(item => item.itemId === itemId);
        const masterItem = masterItemsMap.get(itemId);
        relatedItems.forEach(item => {
          console.log(`- Project Item ID: ${item.id}, Master Item ID: ${itemId}, Code: ${masterItem?.itemCode}, Description: ${masterItem?.description}, makeOrBuy: ${masterItem?.makeOrBuy}`);
        });
      });
    } else {
      console.log('\nAll master items have inspection orders. Nothing to generate.');
    }
    
    // Check for project item IDs versus inspection order item IDs
    console.log(`\nInspection order item IDs: ${Array.from(itemsWithInspectionOrders).join(', ')}`);
    const projectItemIds = projectItemsList.map(item => item.id);
    console.log(`\nProject item IDs: ${projectItemIds.join(', ')}`);
    
    // Critical check: comparison between itemId fields
    const inspectionOrderItemIds = existingInspectionOrders.map(order => order.itemId);
    console.log('\nCRITICAL COMPARISON:');
    console.log(`Inspection orders itemId field data type: ${typeof inspectionOrderItemIds[0]}`);
    console.log(`First few inspection order itemIds: ${inspectionOrderItemIds.slice(0, 5).join(', ')}`);
    
    const projectItemIds2 = projectItemsList.map(item => item.itemId);
    console.log(`Project items itemId field data type: ${typeof projectItemIds2[0]}`);
    console.log(`First few project item itemIds: ${projectItemIds2.slice(0, 5).join(', ')}`);
    
    // Check if the inspection orders reference project item IDs instead of master item IDs
    const usingProjectItemIds = existingInspectionOrders.some(order => 
      projectItemIds.includes(order.itemId)
    );
    
    console.log(`\nINSPECTION ORDERS ARE REFERENCING ${usingProjectItemIds ? 'PROJECT ITEM IDs' : 'MASTER ITEM IDs'}`);
    
    return {
      project,
      projectItemsCount: projectItemsList.length,
      masterItemsCount: masterItemsArray.length,
      inspectionOrdersCount: existingInspectionOrders.length,
      makeItemsCount: makeItems.length,
      buyItemsCount: buyItems.length,
      availableMakeItemsCount: filteredMakeItems.length,
      availableBuyItemsCount: filteredBuyItems.length,
      usingProjectItemIds
    };
    
  } catch (error) {
    console.error('Error in debugging script:', error);
  }
}

module.exports = { debugInspectionOrderGeneration };