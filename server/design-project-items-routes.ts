import express from 'express';
import { db } from './db';
import { masterItems, itemComponents, projectItems } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = express.Router();

// GET /api/design/project-items - Get all project items (both parent and child) with relationships
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Project ID is required' 
      });
    }

    // Get all project items for the specified project
    const allProjectItems = await db.query.projectItems.findMany({
      where: eq(projectItems.projectId, parseInt(projectId as string))
    });

    if (allProjectItems.length === 0) {
      return res.json({ 
        success: true, 
        data: { 
          parentItems: [],
          childItems: [],
          allItems: [] 
        } 
      });
    }

    // Get all master item IDs
    const masterItemIds = allProjectItems.map(item => item.itemId);

    // Get all master items details
    const masterItemsData = await db.query.masterItems.findMany({
      where: inArray(masterItems.id, masterItemIds)
    });

    // Create lookup map for master items
    const masterItemsMap = new Map();
    masterItemsData.forEach(item => {
      masterItemsMap.set(item.id, item);
    });

    // Get all parent-child relationships
    const itemComponentRelationships = await db.query.itemComponents.findMany({
      where: inArray(itemComponents.parentItemId, masterItemIds)
    });

    // Get component master items if any exist
    const componentItemIds = itemComponentRelationships.map(rel => rel.componentItemId);
    if (componentItemIds.length > 0) {
      const componentMasterItems = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, componentItemIds)
      });
      
      // Add components to master items map
      componentMasterItems.forEach(item => {
        if (!masterItemsMap.has(item.id)) {
          masterItemsMap.set(item.id, item);
        }
      });
    }

    // Create relationship maps
    const parentToChildMap = new Map<number, any[]>();
    const childToParentMap = new Map<number, number>();
    
    itemComponentRelationships.forEach(rel => {
      if (!parentToChildMap.has(rel.parentItemId)) {
        parentToChildMap.set(rel.parentItemId, []);
      }
      
      const childItem = masterItemsMap.get(rel.componentItemId);
      if (childItem) {
        parentToChildMap.get(rel.parentItemId)!.push({
          id: childItem.id,
          itemCode: childItem.itemCode,
          description: childItem.description,
          makeOrBuy: childItem.makeOrBuy,
          quantity: rel.quantity,
          relationshipId: rel.id,
          isChild: true
        });
        childToParentMap.set(rel.componentItemId, rel.parentItemId);
      }
    });

    // Process all project items
    const parentItems: any[] = [];
    const childItems: any[] = [];
    const allItems: any[] = [];

    allProjectItems.forEach(projectItem => {
      const masterItem = masterItemsMap.get(projectItem.itemId);
      if (!masterItem) return;

      const itemData = {
        id: masterItem.id,
        projectItemId: projectItem.id,
        itemCode: masterItem.itemCode,
        description: masterItem.description,
        makeOrBuy: masterItem.makeOrBuy,
        specification: masterItem.specification,
        unit: masterItem.unit,
        estimatedCost: masterItem.estimatedCost,
        supplier: masterItem.supplier,
        drawingNo: masterItem.drawingNo,
        isParent: parentToChildMap.has(masterItem.id),
        isChild: childToParentMap.has(masterItem.id),
        childComponents: parentToChildMap.get(masterItem.id) || [],
        parentItemId: childToParentMap.get(masterItem.id) || null
      };

      // Add parent item info if this is a child
      if (itemData.isChild) {
        const parentItem = masterItemsMap.get(itemData.parentItemId!);
        if (parentItem) {
          itemData.parentItem = {
            id: parentItem.id,
            itemCode: parentItem.itemCode,
            description: parentItem.description
          };
        }
      }

      // Categorize items
      if (itemData.isParent) {
        parentItems.push(itemData);
      }
      
      if (itemData.isChild) {
        childItems.push(itemData);
      }
      
      allItems.push(itemData);
    });

    // Sort all categories by item code
    const sortByItemCode = (a: any, b: any) => (a.itemCode || '').localeCompare(b.itemCode || '');
    parentItems.sort(sortByItemCode);
    childItems.sort(sortByItemCode);
    allItems.sort(sortByItemCode);

    console.log(`Project ${projectId}: Found ${allItems.length} total items (${parentItems.length} parents, ${childItems.length} children)`);

    res.json({ 
      success: true, 
      data: {
        parentItems,
        childItems,
        allItems,
        stats: {
          totalItems: allItems.length,
          parentItems: parentItems.length,
          childItems: childItems.length,
          relationships: itemComponentRelationships.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching project items:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch project items' 
    });
  }
});

export default router;