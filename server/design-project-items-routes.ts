import express from 'express';
import { db } from './db';
import { masterItems, itemComponents, projectItems, designDrawings, drawingVersions } from '../shared/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = express.Router();

// GET /api/design/project-items - Get all project items (both parent and child) with relationships
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, showAllRevisions } = req.query;
    console.log(`=== PROJECT ITEMS API CALLED === projectId: ${projectId}, showAllRevisions: ${showAllRevisions}`);
    
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

    // Get drawing revision information for all project items (only if showAllRevisions is enabled)
    const drawingRevisions = new Map();
    const shouldShowRevisions = showAllRevisions === 'true';
    
    if (shouldShowRevisions) {
      // Fetch drawing versions for all items that have drawing numbers
      const itemsWithDrawingNumbers = Array.from(masterItemsMap.values())
        .filter(item => item.drawingNo);
      
      if (itemsWithDrawingNumbers.length > 0) {
        // Get design drawings for these drawing numbers
        const drawingNumbers = itemsWithDrawingNumbers.map(item => item.drawingNo);
        const drawings = await db.select({
          id: designDrawings.id,
          drawingNumber: designDrawings.drawingNumber,
          drawingTitle: designDrawings.drawingTitle
        })
        .from(designDrawings)
        .where(inArray(designDrawings.drawingNumber, drawingNumbers));
        
        if (drawings.length > 0) {
          const drawingIds = drawings.map(d => d.id);
          
          // Get all versions for each drawing
          const versions = await db.select({
            id: drawingVersions.id,
            drawingId: drawingVersions.drawingId,
            revision: drawingVersions.revision,
            fileName: drawingVersions.fileName,
            createdAt: drawingVersions.createdAt
          })
          .from(drawingVersions)
          .where(inArray(drawingVersions.drawingId, drawingIds))
          .orderBy(desc(drawingVersions.createdAt));
          
          // Group all versions by drawing (return individual versions)
          const allVersionsMap = new Map();
          versions.forEach(version => {
            if (!allVersionsMap.has(version.drawingId)) {
              allVersionsMap.set(version.drawingId, []);
            }
            allVersionsMap.get(version.drawingId).push(version);
          });
          
          // Map drawing numbers to their individual versions
          drawings.forEach(drawing => {
            const drawingVersions = allVersionsMap.get(drawing.id);
            if (drawingVersions && drawingVersions.length > 0) {
              // Sort versions by creation date (newest first)
              drawingVersions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              
              // Store all individual versions
              drawingRevisions.set(drawing.drawingNumber, drawingVersions.map(version => ({
                revision: version.revision,
                fileName: version.fileName,
                versionId: version.id,
                createdAt: version.createdAt
              })));
            }
          });
          
          console.log(`Total drawing revisions found: ${drawingRevisions.size}`);
        }
      }
    }

    // Process all project items
    const parentItems: any[] = [];
    const childItems: any[] = [];
    const allItems: any[] = [];

    allProjectItems.forEach(projectItem => {
      const masterItem = masterItemsMap.get(projectItem.itemId);
      if (!masterItem) return;

      // Get revision information for this item
      const revisionVersions = drawingRevisions.get(masterItem.drawingNo);
      
      if (shouldShowRevisions && revisionVersions && revisionVersions.length > 0) {
        // When showing all revisions, create separate entries for each version
        console.log(`=== ITEM ${masterItem.itemCode} HAS ${revisionVersions.length} VERSIONS`);
        
        revisionVersions.forEach((version, index) => {
          const itemData = {
            id: `${masterItem.id}_v${index}`, // Unique ID for each version
            originalId: masterItem.id,
            projectItemId: projectItem.id,
            itemCode: masterItem.itemCode,
            description: masterItem.description,
            makeOrBuy: masterItem.makeOrBuy,
            specification: masterItem.specification,
            unit: masterItem.unit,
            estimatedCost: masterItem.estimatedCost,
            supplier: masterItem.supplier,
            drawingNo: masterItem.drawingNo,
            revision: version.revision,
            fileName: version.fileName,
            versionId: version.versionId,
            lastUpdated: version.createdAt,
            isVersion: true,
            versionIndex: index,
            totalVersions: revisionVersions.length,
            isParent: parentToChildMap.has(masterItem.id),
            isChild: childToParentMap.has(masterItem.id),
            childComponents: index === 0 ? parentToChildMap.get(masterItem.id) || [] : [], // Only show child components for first version
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
        
        return; // Skip normal processing for this item
      }

      // Normal processing when not showing revisions or no revisions found
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
        revision: null,
        fileName: null,
        lastUpdated: null,
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