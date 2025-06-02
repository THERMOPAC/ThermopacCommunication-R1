import { Request, Response, Router } from 'express';
import { db } from './db';
import { eq, inArray } from 'drizzle-orm';
import { projects, projectItems, masterItems, itemComponents, workOrders, workOrderItems } from '@shared/schema';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

export function setupDebugWorkOrderRoutes(app: Router) {
  // Debug endpoint to check work order generation prerequisites
  app.get('/api/debug/work-orders/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      console.log(`=== DEBUG: Work Order Prerequisites for Project ${projectId} ===`);
      
      // Step 1: Get project info
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      console.log(`Project found: ${project.code} - ${project.name}`);
      
      // Step 2: Get project items
      const projectItemsList = await db.query.projectItems.findMany({
        where: eq(projectItems.projectId, projectId)
      });
      
      console.log(`Found ${projectItemsList.length} project items`);
      
      if (projectItemsList.length === 0) {
        return res.json({
          project,
          issue: 'No project items found',
          projectItems: [],
          masterItems: [],
          makeItems: [],
          components: [],
          existingWorkOrders: []
        });
      }
      
      // Step 3: Get master items
      const masterItemIds = projectItemsList.map(item => item.itemId);
      const masterItemsArray = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, masterItemIds)
      });
      
      console.log(`Found ${masterItemsArray.length} master items`);
      
      // Step 4: Find "Make" items
      const makeItems = projectItemsList.filter(projectItem => {
        const masterItem = masterItemsArray.find(mi => mi.id === projectItem.itemId);
        return masterItem && masterItem.makeOrBuy === 'Make';
      });
      
      console.log(`Found ${makeItems.length} "Make" items`);
      
      // Step 5: Get component relationships
      const componentRelationships = await db.query.itemComponents.findMany({
        where: inArray(itemComponents.parentItemId, masterItemIds)
      });
      
      console.log(`Found ${componentRelationships.length} component relationships`);
      
      // Step 6: Get existing work orders
      const existingWorkOrders = await db.query.workOrders.findMany({
        where: eq(workOrders.projectId, projectId)
      });
      
      console.log(`Found ${existingWorkOrders.length} existing work orders`);
      
      // Step 7: Get existing work order items
      const existingWorkOrderItems = existingWorkOrders.length > 0 
        ? await db.query.workOrderItems.findMany({
            where: inArray(workOrderItems.workOrderId, existingWorkOrders.map(wo => wo.id))
          })
        : [];
      
      console.log(`Found ${existingWorkOrderItems.length} existing work order items`);
      
      // Prepare detailed response
      const debugInfo = {
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        projectItems: projectItemsList.map(item => ({
          id: item.id,
          itemId: item.itemId,
          quantity: item.quantity,
          status: item.status
        })),
        masterItems: masterItemsArray.map(item => ({
          id: item.id,
          itemCode: item.itemCode,
          description: item.description,
          makeOrBuy: item.makeOrBuy,
          unit: item.unit
        })),
        makeItems: makeItems.map(item => {
          const masterItem = masterItemsArray.find(mi => mi.id === item.itemId);
          return {
            projectItemId: item.id,
            itemId: item.itemId,
            itemCode: masterItem?.itemCode,
            description: masterItem?.description,
            quantity: item.quantity
          };
        }),
        componentRelationships: componentRelationships.map(rel => {
          const parentItem = masterItemsArray.find(mi => mi.id === rel.parentItemId);
          const componentItem = masterItemsArray.find(mi => mi.id === rel.componentItemId);
          return {
            parentItemId: rel.parentItemId,
            parentItemCode: parentItem?.itemCode,
            componentItemId: rel.componentItemId,
            componentItemCode: componentItem?.itemCode,
            quantity: rel.quantity
          };
        }),
        existingWorkOrders: existingWorkOrders.map(wo => ({
          id: wo.id,
          workOrderNumber: wo.workOrderNumber,
          title: wo.title,
          status: wo.status
        })),
        existingWorkOrderItems: existingWorkOrderItems.map(item => ({
          id: item.id,
          workOrderId: item.workOrderId,
          projectItemId: item.projectItemId,
          quantity: item.quantity
        })),
        analysis: {
          hasProjectItems: projectItemsList.length > 0,
          hasMasterItems: masterItemsArray.length > 0,
          hasMakeItems: makeItems.length > 0,
          hasComponents: componentRelationships.length > 0,
          hasExistingWorkOrders: existingWorkOrders.length > 0,
          canCreateWorkOrders: makeItems.length > 0 && projectItemsList.length > 0
        }
      };
      
      console.log(`=== DEBUG COMPLETE ===`);
      
      return res.json(debugInfo);
      
    } catch (error) {
      console.error('Error in debug endpoint:', error);
      return res.status(500).json({ error: 'Debug endpoint failed', details: error });
    }
  });
}