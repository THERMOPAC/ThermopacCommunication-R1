import { Response, Router, Request } from 'express';
import { db } from './db';
import { insertWorkOrderSchema, workOrders, insertWorkOrderItemSchema, 
  workOrderItems, insertResourceAssignmentSchema, resourceAssignments,
  insertProductionRecordSchema, productionRecords, insertMaterialConsumptionSchema,
  materialConsumption, insertMachineAllocationSchema, machineAllocations, projects, projectItems, masterItems } from '@shared/schema';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';

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
      const makeItems = projectItemsList.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        return masterItem && masterItem.makeOrBuy === 'Make';
      });
      
      if (makeItems.length === 0) {
        return res.status(400).json({ error: 'No "Make" items found for this project' });
      }
      
      // Create preview data for client
      const previewItems = makeItems.map((item, index) => {
        const masterItem = masterItemsMap.get(item.itemId);
        return {
          sequenceNumber: index + 1,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'No description',
          quantity: item.quantity,
          unit: masterItem?.unit || 'EA',
          makeOrBuy: 'Make'
        };
      });
      
      // Generate a unique work order number
      const workOrderNumber = `WO-${project.code}-${Date.now().toString().substring(7)}`;
      
      res.status(200).json({
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        workOrderNumber,
        itemCount: makeItems.length,
        items: previewItems
      });
    } catch (error) {
      console.error('Error generating work orders preview:', error);
      res.status(500).json({ error: 'Failed to generate work orders preview' });
    }
  });

  // Generate work orders for all items in a project
  app.post('/api/production/work-orders/generate-for-project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { confirm } = req.body;
      
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Verify user can manage production
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to create work orders' });
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
      const makeItems = projectItemsList.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        return masterItem && masterItem.makeOrBuy === 'Make';
      });
      
      if (makeItems.length === 0) {
        return res.status(400).json({ error: 'No "Make" items found for this project' });
      }
      
      // If not confirmed, just return the count
      if (!confirm) {
        return res.status(200).json({
          requiresConfirmation: true,
          message: 'Please confirm to generate work orders',
          itemCount: makeItems.length
        });
      }
      
      // Create work order date range
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 30); // Default to 30 days schedule
      
      // Generate a unique work order number
      const workOrderNumber = `WO-${project.code}-${Date.now().toString().substring(7)}`;
      
      // Create the main work order
      const [newWorkOrder] = await db.insert(workOrders).values({
        projectId,
        projectCode: project.code,
        workOrderNumber,
        title: `Production order for ${project.name}`,
        description: `Auto-generated work order for project ${project.code}`,
        status: 'planned',
        priority: 'Medium',
        plannedStartDate: today,
        plannedEndDate: endDate,
        quantity: 1,
        supervisorId: req.user!.id,
        createdBy: req.user!.id,
        createdAt: today,
        updatedAt: today
      }).returning();
      
      // Add all make items to the work order
      let sequenceNumber = 1;
      const workOrderItemsList = [];
      
      for (const item of makeItems) {
        const masterItem = masterItemsMap.get(item.itemId);
        if (!masterItem) continue;
        
        const [newItem] = await db.insert(workOrderItems).values({
          workOrderId: newWorkOrder.id,
          projectItemId: item.id,
          quantity: item.quantity,
          status: 'pending',
          sequenceNumber: sequenceNumber++,
          notes: `Auto-generated from project item ${masterItem.description || masterItem.itemCode}`,
          createdAt: today,
          updatedAt: today
        }).returning();
        
        workOrderItemsList.push(newItem);
      }
      
      res.status(201).json({
        workOrder: newWorkOrder,
        items: workOrderItemsList,
        message: `Created work order with ${workOrderItemsList.length} items`
      });
    } catch (error) {
      console.error('Error generating work orders for project:', error);
      res.status(500).json({ error: 'Failed to generate work orders' });
    }
  });
  
  // Get all work orders for a project
  app.get('/api/production/work-orders/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
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
      const workOrderId = parseInt(req.params.id);
      
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
      
      // Create work order
      const [newWorkOrder] = await db.insert(workOrders).values({
        ...req.body,
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
      
      // Update work order
      const [updatedWorkOrder] = await db.update(workOrders)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(workOrders.id, workOrderId))
        .returning();
      
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
  
  // ==================== WORK ORDER ITEMS ====================
  
  // Get all items for a work order
  app.get('/api/production/work-orders/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      const workOrderItemsList = await db.query.workOrderItems.findMany({
        where: eq(workOrderItems.workOrderId, workOrderId),
        orderBy: [asc(workOrderItems.sequenceNumber)]
      });
      
      // Get related project items for more details
      const items = await Promise.all(workOrderItemsList.map(async (item) => {
        const projectItem = await db.query.projectItems.findFirst({
          where: eq(projectItems.id, item.projectItemId)
        });
        
        return {
          ...item,
          projectItem
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
}