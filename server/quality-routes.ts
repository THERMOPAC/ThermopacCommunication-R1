import { Response, Router, Request } from 'express';
import { db } from './db';
import { insertInspectionReportSchema, inspectionReports, insertNonConformanceReportSchema, 
  nonConformanceReports, insertQualityChecklistSchema, qualityChecklists, 
  insertChecklistItemSchema, checklistItems, insertChecklistExecutionSchema,
  checklistExecutions, insertChecklistItemResultSchema, checklistItemResults,
  projects, workOrders, projectItems } from '@shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

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

export function setupQualityRoutes(app: Router) {
  // ==================== INSPECTION REPORTS ====================
  
  // Get all inspection reports for a project
  app.get('/api/quality/inspections/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get project to ensure it exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const inspectionReportsList = await db.query.inspectionReports.findMany({
        where: eq(inspectionReports.projectId, projectId),
        orderBy: [desc(inspectionReports.createdAt)]
      });
      
      res.status(200).json(inspectionReportsList);
    } catch (error) {
      console.error('Error fetching inspection reports:', error);
      res.status(500).json({ error: 'Failed to fetch inspection reports' });
    }
  });
  
  // Get inspection reports by work order
  app.get('/api/quality/inspections/work-order/:workOrderId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const workOrderId = parseInt(req.params.workOrderId);
      
      // Check if work order exists
      const workOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId)
      });
      
      if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }
      
      const inspectionReportsList = await db.query.inspectionReports.findMany({
        where: eq(inspectionReports.workOrderId, workOrderId),
        orderBy: [desc(inspectionReports.createdAt)]
      });
      
      res.status(200).json(inspectionReportsList);
    } catch (error) {
      console.error('Error fetching inspection reports:', error);
      res.status(500).json({ error: 'Failed to fetch inspection reports' });
    }
  });
  
  // Get specific inspection report
  app.get('/api/quality/inspections/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id);
      
      const inspectionReport = await db.query.inspectionReports.findFirst({
        where: eq(inspectionReports.id, reportId)
      });
      
      if (!inspectionReport) {
        return res.status(404).json({ error: 'Inspection report not found' });
      }
      
      res.status(200).json(inspectionReport);
    } catch (error) {
      console.error('Error fetching inspection report:', error);
      res.status(500).json({ error: 'Failed to fetch inspection report' });
    }
  });
  
  // Create new inspection report
  app.post('/api/quality/inspections', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = insertInspectionReportSchema.safeParse({
        ...req.body,
        createdBy: req.user!.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid inspection report data', details: validationResult.error });
      }
      
      // Verify project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, req.body.projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Create inspection report
      const [newReport] = await db.insert(inspectionReports).values({
        ...req.body,
        createdBy: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newReport);
    } catch (error) {
      console.error('Error creating inspection report:', error);
      res.status(500).json({ error: 'Failed to create inspection report' });
    }
  });
  
  // Update inspection report
  app.put('/api/quality/inspections/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id);
      
      // Check if inspection report exists
      const existingReport = await db.query.inspectionReports.findFirst({
        where: eq(inspectionReports.id, reportId)
      });
      
      if (!existingReport) {
        return res.status(404).json({ error: 'Inspection report not found' });
      }
      
      // Verify user can update the report
      if (existingReport.createdBy !== req.user!.id && !canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update this inspection report' });
      }
      
      // Update inspection report
      const [updatedReport] = await db.update(inspectionReports)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(inspectionReports.id, reportId))
        .returning();
      
      res.status(200).json(updatedReport);
    } catch (error) {
      console.error('Error updating inspection report:', error);
      res.status(500).json({ error: 'Failed to update inspection report' });
    }
  });
  
  // Delete inspection report
  app.delete('/api/quality/inspections/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete inspection reports' });
      }
      
      // Check if inspection report exists
      const existingReport = await db.query.inspectionReports.findFirst({
        where: eq(inspectionReports.id, reportId)
      });
      
      if (!existingReport) {
        return res.status(404).json({ error: 'Inspection report not found' });
      }
      
      // Delete inspection report
      await db.delete(inspectionReports).where(eq(inspectionReports.id, reportId));
      
      res.status(200).json({ message: 'Inspection report deleted successfully' });
    } catch (error) {
      console.error('Error deleting inspection report:', error);
      res.status(500).json({ error: 'Failed to delete inspection report' });
    }
  });
  
  // ==================== NON-CONFORMANCE REPORTS (NCRs) ====================
  
  // Get all NCRs for a project
  app.get('/api/quality/ncrs/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get project to ensure it exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const ncrList = await db.query.nonConformanceReports.findMany({
        where: eq(nonConformanceReports.projectId, projectId),
        orderBy: [desc(nonConformanceReports.createdAt)]
      });
      
      res.status(200).json(ncrList);
    } catch (error) {
      console.error('Error fetching NCRs:', error);
      res.status(500).json({ error: 'Failed to fetch NCRs' });
    }
  });
  
  // Get NCRs by inspection report
  app.get('/api/quality/ncrs/inspection/:inspectionId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const inspectionId = parseInt(req.params.inspectionId);
      
      const ncrList = await db.query.nonConformanceReports.findMany({
        where: eq(nonConformanceReports.inspectionReportId, inspectionId),
        orderBy: [desc(nonConformanceReports.createdAt)]
      });
      
      res.status(200).json(ncrList);
    } catch (error) {
      console.error('Error fetching NCRs:', error);
      res.status(500).json({ error: 'Failed to fetch NCRs' });
    }
  });
  
  // Get specific NCR
  app.get('/api/quality/ncrs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const ncrId = parseInt(req.params.id);
      
      const ncr = await db.query.nonConformanceReports.findFirst({
        where: eq(nonConformanceReports.id, ncrId)
      });
      
      if (!ncr) {
        return res.status(404).json({ error: 'NCR not found' });
      }
      
      res.status(200).json(ncr);
    } catch (error) {
      console.error('Error fetching NCR:', error);
      res.status(500).json({ error: 'Failed to fetch NCR' });
    }
  });
  
  // Create new NCR
  app.post('/api/quality/ncrs', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = insertNonConformanceReportSchema.safeParse({
        ...req.body,
        createdBy: req.user!.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid NCR data', details: validationResult.error });
      }
      
      // Verify project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, req.body.projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Create NCR
      const [newNcr] = await db.insert(nonConformanceReports).values({
        ...req.body,
        createdBy: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newNcr);
    } catch (error) {
      console.error('Error creating NCR:', error);
      res.status(500).json({ error: 'Failed to create NCR' });
    }
  });
  
  // Update NCR
  app.put('/api/quality/ncrs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const ncrId = parseInt(req.params.id);
      
      // Check if NCR exists
      const existingNcr = await db.query.nonConformanceReports.findFirst({
        where: eq(nonConformanceReports.id, ncrId)
      });
      
      if (!existingNcr) {
        return res.status(404).json({ error: 'NCR not found' });
      }
      
      // Update NCR
      const [updatedNcr] = await db.update(nonConformanceReports)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(nonConformanceReports.id, ncrId))
        .returning();
      
      res.status(200).json(updatedNcr);
    } catch (error) {
      console.error('Error updating NCR:', error);
      res.status(500).json({ error: 'Failed to update NCR' });
    }
  });
  
  // Delete NCR
  app.delete('/api/quality/ncrs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const ncrId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete NCRs' });
      }
      
      // Check if NCR exists
      const existingNcr = await db.query.nonConformanceReports.findFirst({
        where: eq(nonConformanceReports.id, ncrId)
      });
      
      if (!existingNcr) {
        return res.status(404).json({ error: 'NCR not found' });
      }
      
      // Delete NCR
      await db.delete(nonConformanceReports).where(eq(nonConformanceReports.id, ncrId));
      
      res.status(200).json({ message: 'NCR deleted successfully' });
    } catch (error) {
      console.error('Error deleting NCR:', error);
      res.status(500).json({ error: 'Failed to delete NCR' });
    }
  });
  
  // ==================== QUALITY CHECKLISTS ====================
  
  // Get all checklists for a project
  app.get('/api/quality/checklists/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get project to ensure it exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const checklistsList = await db.query.qualityChecklists.findMany({
        where: eq(qualityChecklists.projectId, projectId),
        orderBy: [desc(qualityChecklists.createdAt)]
      });
      
      res.status(200).json(checklistsList);
    } catch (error) {
      console.error('Error fetching quality checklists:', error);
      res.status(500).json({ error: 'Failed to fetch quality checklists' });
    }
  });
  
  // Get specific checklist with items
  app.get('/api/quality/checklists/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const checklistId = parseInt(req.params.id);
      
      const checklist = await db.query.qualityChecklists.findFirst({
        where: eq(qualityChecklists.id, checklistId)
      });
      
      if (!checklist) {
        return res.status(404).json({ error: 'Quality checklist not found' });
      }
      
      // Fetch the checklist items
      const items = await db.query.checklistItems.findMany({
        where: eq(checklistItems.checklistId, checklistId),
        orderBy: [asc(checklistItems.sequenceNumber)]
      });
      
      res.status(200).json({
        ...checklist,
        items
      });
    } catch (error) {
      console.error('Error fetching quality checklist:', error);
      res.status(500).json({ error: 'Failed to fetch quality checklist' });
    }
  });
  
  // Create new checklist
  app.post('/api/quality/checklists', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to create quality checklists' });
      }
      
      // Validate request body
      const validationResult = insertQualityChecklistSchema.safeParse({
        ...req.body,
        preparedBy: req.user!.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid checklist data', details: validationResult.error });
      }
      
      // Verify project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, req.body.projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Create checklist
      const [newChecklist] = await db.insert(qualityChecklists).values({
        ...req.body,
        preparedBy: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newChecklist);
    } catch (error) {
      console.error('Error creating quality checklist:', error);
      res.status(500).json({ error: 'Failed to create quality checklist' });
    }
  });
  
  // Update checklist
  app.put('/api/quality/checklists/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const checklistId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update quality checklists' });
      }
      
      // Check if checklist exists
      const existingChecklist = await db.query.qualityChecklists.findFirst({
        where: eq(qualityChecklists.id, checklistId)
      });
      
      if (!existingChecklist) {
        return res.status(404).json({ error: 'Quality checklist not found' });
      }
      
      // Update checklist
      const [updatedChecklist] = await db.update(qualityChecklists)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(qualityChecklists.id, checklistId))
        .returning();
      
      res.status(200).json(updatedChecklist);
    } catch (error) {
      console.error('Error updating quality checklist:', error);
      res.status(500).json({ error: 'Failed to update quality checklist' });
    }
  });
  
  // Delete checklist
  app.delete('/api/quality/checklists/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const checklistId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete quality checklists' });
      }
      
      // Check if checklist exists
      const existingChecklist = await db.query.qualityChecklists.findFirst({
        where: eq(qualityChecklists.id, checklistId)
      });
      
      if (!existingChecklist) {
        return res.status(404).json({ error: 'Quality checklist not found' });
      }
      
      // Delete checklist - cascade will handle related items
      await db.delete(qualityChecklists).where(eq(qualityChecklists.id, checklistId));
      
      res.status(200).json({ message: 'Quality checklist deleted successfully' });
    } catch (error) {
      console.error('Error deleting quality checklist:', error);
      res.status(500).json({ error: 'Failed to delete quality checklist' });
    }
  });
  
  // ==================== CHECKLIST ITEMS ====================
  
  // Add item to checklist
  app.post('/api/quality/checklists/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const checklistId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to add checklist items' });
      }
      
      // Validate request body
      const validationResult = insertChecklistItemSchema.safeParse({
        ...req.body,
        checklistId
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid checklist item data', details: validationResult.error });
      }
      
      // Verify checklist exists
      const checklist = await db.query.qualityChecklists.findFirst({
        where: eq(qualityChecklists.id, checklistId)
      });
      
      if (!checklist) {
        return res.status(404).json({ error: 'Quality checklist not found' });
      }
      
      // Create checklist item
      const [newItem] = await db.insert(checklistItems).values({
        ...req.body,
        checklistId,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newItem);
    } catch (error) {
      console.error('Error adding checklist item:', error);
      res.status(500).json({ error: 'Failed to add checklist item' });
    }
  });
  
  // Update checklist item
  app.put('/api/quality/checklist-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update checklist items' });
      }
      
      // Check if checklist item exists
      const existingItem = await db.query.checklistItems.findFirst({
        where: eq(checklistItems.id, itemId)
      });
      
      if (!existingItem) {
        return res.status(404).json({ error: 'Checklist item not found' });
      }
      
      // Update checklist item
      const [updatedItem] = await db.update(checklistItems)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(checklistItems.id, itemId))
        .returning();
      
      res.status(200).json(updatedItem);
    } catch (error) {
      console.error('Error updating checklist item:', error);
      res.status(500).json({ error: 'Failed to update checklist item' });
    }
  });
  
  // Delete checklist item
  app.delete('/api/quality/checklist-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete checklist items' });
      }
      
      // Check if checklist item exists
      const existingItem = await db.query.checklistItems.findFirst({
        where: eq(checklistItems.id, itemId)
      });
      
      if (!existingItem) {
        return res.status(404).json({ error: 'Checklist item not found' });
      }
      
      // Delete checklist item
      await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
      
      res.status(200).json({ message: 'Checklist item deleted successfully' });
    } catch (error) {
      console.error('Error deleting checklist item:', error);
      res.status(500).json({ error: 'Failed to delete checklist item' });
    }
  });
  
  // ==================== CHECKLIST EXECUTIONS ====================
  
  // Get all executions for a checklist
  app.get('/api/quality/checklists/:id/executions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const checklistId = parseInt(req.params.id);
      
      const executions = await db.query.checklistExecutions.findMany({
        where: eq(checklistExecutions.checklistId, checklistId),
        orderBy: [desc(checklistExecutions.executionDate)]
      });
      
      res.status(200).json(executions);
    } catch (error) {
      console.error('Error fetching checklist executions:', error);
      res.status(500).json({ error: 'Failed to fetch checklist executions' });
    }
  });
  
  // Get specific execution with results
  app.get('/api/quality/executions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const executionId = parseInt(req.params.id);
      
      const execution = await db.query.checklistExecutions.findFirst({
        where: eq(checklistExecutions.id, executionId)
      });
      
      if (!execution) {
        return res.status(404).json({ error: 'Checklist execution not found' });
      }
      
      // Fetch the checklist items
      const checklistId = execution.checklistId;
      const items = await db.query.checklistItems.findMany({
        where: eq(checklistItems.checklistId, checklistId),
        orderBy: [asc(checklistItems.sequenceNumber)]
      });
      
      // Fetch the results for each item
      const itemResults = await db.query.checklistItemResults.findMany({
        where: eq(checklistItemResults.executionId, executionId)
      });
      
      // Map results to items
      const itemsWithResults = items.map(item => {
        const result = itemResults.find(r => r.checklistItemId === item.id);
        return {
          ...item,
          result: result || null
        };
      });
      
      res.status(200).json({
        ...execution,
        items: itemsWithResults
      });
    } catch (error) {
      console.error('Error fetching checklist execution:', error);
      res.status(500).json({ error: 'Failed to fetch checklist execution' });
    }
  });
  
  // Create new checklist execution
  app.post('/api/quality/checklists/:id/executions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const checklistId = parseInt(req.params.id);
      
      // Validate request body
      const validationResult = insertChecklistExecutionSchema.safeParse({
        ...req.body,
        checklistId,
        executedBy: req.user!.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid checklist execution data', details: validationResult.error });
      }
      
      // Verify checklist exists
      const checklist = await db.query.qualityChecklists.findFirst({
        where: eq(qualityChecklists.id, checklistId)
      });
      
      if (!checklist) {
        return res.status(404).json({ error: 'Quality checklist not found' });
      }
      
      // Create checklist execution
      const [newExecution] = await db.insert(checklistExecutions).values({
        ...req.body,
        checklistId,
        executedBy: req.user!.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newExecution);
    } catch (error) {
      console.error('Error creating checklist execution:', error);
      res.status(500).json({ error: 'Failed to create checklist execution' });
    }
  });
  
  // Update checklist execution
  app.put('/api/quality/executions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const executionId = parseInt(req.params.id);
      
      // Check if checklist execution exists
      const existingExecution = await db.query.checklistExecutions.findFirst({
        where: eq(checklistExecutions.id, executionId)
      });
      
      if (!existingExecution) {
        return res.status(404).json({ error: 'Checklist execution not found' });
      }
      
      // Verify user can update (either they executed it or they're a manager)
      if (existingExecution.executedBy !== req.user!.id && !canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update this checklist execution' });
      }
      
      // Update checklist execution
      const [updatedExecution] = await db.update(checklistExecutions)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(checklistExecutions.id, executionId))
        .returning();
      
      res.status(200).json(updatedExecution);
    } catch (error) {
      console.error('Error updating checklist execution:', error);
      res.status(500).json({ error: 'Failed to update checklist execution' });
    }
  });
  
  // Delete checklist execution
  app.delete('/api/quality/executions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const executionId = parseInt(req.params.id);
      
      // Verify user can manage quality
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete checklist executions' });
      }
      
      // Check if checklist execution exists
      const existingExecution = await db.query.checklistExecutions.findFirst({
        where: eq(checklistExecutions.id, executionId)
      });
      
      if (!existingExecution) {
        return res.status(404).json({ error: 'Checklist execution not found' });
      }
      
      // Delete checklist execution - cascade will handle related results
      await db.delete(checklistExecutions).where(eq(checklistExecutions.id, executionId));
      
      res.status(200).json({ message: 'Checklist execution deleted successfully' });
    } catch (error) {
      console.error('Error deleting checklist execution:', error);
      res.status(500).json({ error: 'Failed to delete checklist execution' });
    }
  });
  
  // ==================== CHECKLIST ITEM RESULTS ====================
  
  // Add item result to execution
  app.post('/api/quality/executions/:id/results', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const executionId = parseInt(req.params.id);
      
      // Validate request body
      const validationResult = insertChecklistItemResultSchema.safeParse({
        ...req.body,
        executionId
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid checklist item result data', details: validationResult.error });
      }
      
      // Verify execution exists
      const execution = await db.query.checklistExecutions.findFirst({
        where: eq(checklistExecutions.id, executionId)
      });
      
      if (!execution) {
        return res.status(404).json({ error: 'Checklist execution not found' });
      }
      
      // Verify user can add results (either they executed it or they're a manager)
      if (execution.executedBy !== req.user!.id && !canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to add results to this checklist execution' });
      }
      
      // Create checklist item result
      const [newResult] = await db.insert(checklistItemResults).values({
        ...req.body,
        executionId,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      res.status(201).json(newResult);
    } catch (error) {
      console.error('Error adding checklist item result:', error);
      res.status(500).json({ error: 'Failed to add checklist item result' });
    }
  });
  
  // Update checklist item result
  app.put('/api/quality/results/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const resultId = parseInt(req.params.id);
      
      // Check if result exists
      const existingResult = await db.query.checklistItemResults.findFirst({
        where: eq(checklistItemResults.id, resultId)
      });
      
      if (!existingResult) {
        return res.status(404).json({ error: 'Checklist item result not found' });
      }
      
      // Get the execution to check permissions
      const execution = await db.query.checklistExecutions.findFirst({
        where: eq(checklistExecutions.id, existingResult.executionId)
      });
      
      // Verify user can update results (either they executed it or they're a manager)
      if (execution!.executedBy !== req.user!.id && !canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update results for this checklist execution' });
      }
      
      // Update checklist item result
      const [updatedResult] = await db.update(checklistItemResults)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(checklistItemResults.id, resultId))
        .returning();
      
      res.status(200).json(updatedResult);
    } catch (error) {
      console.error('Error updating checklist item result:', error);
      res.status(500).json({ error: 'Failed to update checklist item result' });
    }
  });
  
  // Delete checklist item result
  app.delete('/api/quality/results/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const resultId = parseInt(req.params.id);
      
      // Check if result exists
      const existingResult = await db.query.checklistItemResults.findFirst({
        where: eq(checklistItemResults.id, resultId)
      });
      
      if (!existingResult) {
        return res.status(404).json({ error: 'Checklist item result not found' });
      }
      
      // Get the execution to check permissions
      const execution = await db.query.checklistExecutions.findFirst({
        where: eq(checklistExecutions.id, existingResult.executionId)
      });
      
      // Verify user can delete results (either they executed it or they're a manager)
      if (execution!.executedBy !== req.user!.id && !canManage(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete results for this checklist execution' });
      }
      
      // Delete checklist item result
      await db.delete(checklistItemResults).where(eq(checklistItemResults.id, resultId));
      
      res.status(200).json({ message: 'Checklist item result deleted successfully' });
    } catch (error) {
      console.error('Error deleting checklist item result:', error);
      res.status(500).json({ error: 'Failed to delete checklist item result' });
    }
  });
}