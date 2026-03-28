import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
import express, { Request, Response } from 'express';
import { storage } from './storage';
import { 
  insertProjectSchema, 
  insertProjectPhaseSchema,
  insertProjectMemberSchema,
  insertDeliverableSchema,
  insertProjectTaskSchema,
  insertPhaseApprovalSchema,
  insertProjectDocumentSchema,
  insertProjectItemSchema,
  insertCustomerSchema,
  workOrders,
  inspectionOrders,
  projectWorkflowEvents,
  itemPlanningRecords,
  procurementExecutionRecords,
  productionExecutionRecords,
  qualityPlanningRecords,
  poPreparationRecords,
} from '@shared/schema';
import { canManage } from '@shared/roles';
import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { checkModulePermissionMiddleware } from './middlewares/auth';
import { checkModulePermission } from './utils/permission-utils';
import { agentEventBus } from './agents/framework/event-bus';

// Helper function to validate a user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'You must be logged in to access this resource' });
}

export function setupProjectRoutes(app: express.Express) {
  // Project Routes
  app.get('/api/projects', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const projects = await storage.getUserProjects(userId);
      res.json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      sendError(res, error);
    }
  });
  
  // Get next project number for a financial year
  app.get('/api/projects/next-code/:financialYear', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const financialYear = req.params.financialYear;
      
      const yearCode = financialYear;
      
      const userId = req.user!.id;
      const allProjects = await storage.getUserProjects(userId);
      
      const regex = new RegExp(`^${yearCode}-(\\d+)$`);
      const matchingProjects = allProjects.filter(project => regex.test(project.code));
      
      let highestNumber = 0;
      matchingProjects.forEach(project => {
        const matches = project.code.match(regex);
        if (matches && matches.length > 1) {
          const projectNumber = parseInt(matches[1]);
          if (projectNumber > highestNumber) {
            highestNumber = projectNumber;
          }
        }
      });
      
      const nextNumber = highestNumber + 1;
      const nextCode = `${yearCode}-${nextNumber}`;
      
      res.json({ nextCode });
    } catch (error) {
      console.error('Error generating next project code:', error);
      sendError(res, error);
    }
  });

  app.get('/api/projects/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('Fetching project with ID:', req.params.id);
      
      // Use the raw project ID directly - don't parse it as a number
      const projectId = req.params.id;
      console.log('Project ID type:', typeof projectId);
      console.log('Project ID for lookup:', projectId);
      
      let project;
      
      // Check if it's a numeric ID or a project code
      if (/^\d+$/.test(projectId)) {
        // If it's a pure number, treat as a database ID
        project = await storage.getProject(parseInt(projectId));
        console.log("Looking up by numeric ID");
      } else {
        // Otherwise it might be a project code (like "2025-1")
        console.log("Looking up by project code");
        const allProjects = await storage.getAllProjects();
        project = allProjects.find(p => p.code === projectId);
      }
      
      if (!project) {
        console.log('Project not found for identifier:', projectId);
        return res.status(404).json({ error: 'Project not found' });
      }
      
      console.log('Project found:', project.id, project.code);
      res.json(project);
    } catch (error) {
      console.error(`Error fetching project ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to fetch project details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/projects', 
    ensureAuthenticated, 
    checkModulePermissionMiddleware('Project Management', 'create'), 
    async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      
      const projectData = insertProjectSchema.parse({
        ...req.body,
        createdBy: userId,
        managerId: userId, // Add managerId which is required in the schema
        createdAt: new Date(), // Use Date objects instead of strings
        updatedAt: new Date()
      });
      
      // Create the project
      const project = await storage.createProject(projectData);
      
      // Add creator as a project manager
      await storage.addProjectMember({
        projectId: project.id,
        userId,
        role: 'project_manager',
        assignedDate: new Date(), // Use Date object instead of string
        isActive: true
      });
      
      // Create default EPC lifecycle phases (7 phases)
      const phaseNames = [
        'Engineering & Design',
        'Procurement',
        'Production / Manufacturing',
        'Quality Assurance',
        'Dispatch & Shipping',
        'Project Commissioning',
        'After-Sales & Warranty',
      ];
      let startDate = new Date(project.startDate);
      
      const projectDuration = new Date(project.targetEndDate).getTime() - startDate.getTime();
      const phaseDuration = projectDuration / phaseNames.length;
      
      for (let i = 0; i < phaseNames.length; i++) {
        const phaseStartDate = new Date(startDate.getTime() + (i * phaseDuration));
        const phaseEndDate = new Date(phaseStartDate.getTime() + phaseDuration);
        
        await storage.createProjectPhase({
          projectId: project.id,
          name: phaseNames[i],
          description: `${phaseNames[i]} phase for project ${project.name}`,
          order: i + 1, // Using order instead of phaseNumber
          startDate: phaseStartDate,
          targetEndDate: phaseEndDate,
          status: 'pending',
          phaseLeadId: userId
        });
      }
      
      agentEventBus.emit('project.created', {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        customerId: project.customerId,
        managerId: project.managerId,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        status: project.status,
        phasesCreated: phaseNames,
        createdBy: userId,
      }, 'project-routes');
      console.log(`[EventBus] project.created emitted — projectId=${project.id}, code=${project.code}, createdBy=${userId}`);

      res.status(201).json(project);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(400).json({ error: 'Failed to create project', details: error.message });
    }
  });

  app.put('/api/projects/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized to update the project
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update this project' });
      }
      
      // Update project data
      // Create a clean copy of the request body without problematic fields
      const { updatedAt, createdAt, ...cleanRequestBody } = req.body;
      
      // Base update data
      // Filter out fields that don't exist in the database table
      const validColumns = [
        'name', 'description', 'code', 'status', 'priority', 
        'client_name', 'client_contact', 'client_email', 
        'start_date', 'target_end_date', 'actual_end_date',
        'estimated_budget', 'actual_cost', 'currency', 'progress',
        'manager_id', 'created_by', 'notes', 'tags', 'financial_year',
        'customer_id'
      ];
      
      // Create a clean update object containing only valid fields
      const updateData: any = {};
      Object.keys(cleanRequestBody).forEach(key => {
        // Convert camelCase keys to snake_case for comparison
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (validColumns.includes(snakeKey)) {
          updateData[key] = cleanRequestBody[key];
        }
      });
      
      // Pass through dates as strings - they'll be handled by the storage.updateProject method
      if (updateData.startDate) {
        console.log("startDate type:", typeof updateData.startDate);
        console.log("startDate value:", updateData.startDate);
        // Don't try to convert to Date, pass as-is
      }
      
      if (updateData.targetEndDate) {
        console.log("targetEndDate type:", typeof updateData.targetEndDate);
        console.log("targetEndDate value:", updateData.targetEndDate);
        // Don't try to convert to Date, pass as-is
      }
      
      // Add updated timestamp as ISO string
      updateData.updatedAt = new Date();
      
      console.log("Final clean update data:", updateData);
      
      const oldStatus = project.status;
      const updatedProject = await storage.updateProject(projectId, updateData);

      if (updateData.status && updateData.status !== oldStatus) {
        agentEventBus.emit('project.status_changed', {
          projectId,
          projectCode: project.code,
          projectName: project.name,
          oldStatus,
          newStatus: updateData.status,
          changedBy: userId,
        }, 'project-routes');
        console.log(`[EventBus] project.status_changed emitted — projectId=${projectId}, ${oldStatus} → ${updateData.status}, changedBy=${userId}`);
      }

      res.json(updatedProject);
    } catch (error) {
      console.error(`Error updating project ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update project', details: error.message });
    }
  });

  // Project Phases Routes
  app.get('/api/projects/:projectId/phases', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectIdParam = req.params.projectId;
      
      // Get the project first to ensure it exists
      const project = await storage.getProject(projectIdParam);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Use the numeric ID from the project record
      const projectId = project.id;
      
      const phases = await storage.getProjectPhases(projectId);
      res.json(phases);
    } catch (error) {
      console.error(`Error fetching phases for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/phases/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.id);
      const phase = await storage.getProjectPhase(phaseId);
      
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }
      
      res.json(phase);
    } catch (error) {
      console.error(`Error fetching phase ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/phases', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add phases to this project' });
      }
      
      const phaseData = insertProjectPhaseSchema.parse({
        ...req.body,
        projectId
      });
      
      const phase = await storage.createProjectPhase(phaseData);
      res.status(201).json(phase);
    } catch (error) {
      console.error(`Error creating phase for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project phase', details: error.message });
    }
  });

  app.put('/api/phases/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Check if phase exists
      const phase = await storage.getProjectPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(phase.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update this phase' });
      }
      
      // Update phase data
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };
      
      const updatedPhase = await storage.updateProjectPhase(phaseId, updateData);
      res.json(updatedPhase);
    } catch (error) {
      console.error(`Error updating phase ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update project phase', details: error.message });
    }
  });

  // Project Members Routes
  app.get('/api/projects/:projectId/members', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Check if projectId is a valid number
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      const members = await storage.getProjectMembers(projectId);
      res.json(members);
    } catch (error) {
      console.error(`Error fetching members for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/members', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'project_manager' || canManage(req.user!.role, 'Senior Manager'))
      );
      
      if (!userMember) {
        return res.status(403).json({ error: 'Not authorized to add members to this project' });
      }
      
      const memberData = insertProjectMemberSchema.parse({
        ...req.body,
        projectId,
        assignedDate: new Date() // Use Date object instead of string
      });
      
      const member = await storage.addProjectMember(memberData);
      res.status(201).json(member);
    } catch (error) {
      console.error(`Error adding member to project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to add project member', details: error.message });
    }
  });

  app.delete('/api/projects/:projectId/members/:userId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const memberUserId = parseInt(req.params.userId);
      const currentUserId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => 
        member.userId === currentUserId && (member.role === 'project_manager' || canManage(req.user!.role, 'Senior Manager'))
      );
      
      if (!userMember && currentUserId !== memberUserId) {
        return res.status(403).json({ error: 'Not authorized to remove members from this project' });
      }
      
      await storage.removeProjectMember(projectId, memberUserId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error removing member from project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.put('/api/projects/:projectId/members/:userId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const memberUserId = parseInt(req.params.userId);
      const currentUserId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => 
        member.userId === currentUserId && (member.role === 'project_manager' || canManage(req.user!.role, 'Senior Manager'))
      );
      
      if (!userMember) {
        return res.status(403).json({ error: 'Not authorized to update member roles in this project' });
      }
      
      // Update member data
      const updateData = {
        ...req.body
      };
      
      const updatedMember = await storage.updateProjectMember(projectId, memberUserId, updateData);
      res.json(updatedMember);
    } catch (error) {
      console.error(`Error updating member in project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to update project member', details: error.message });
    }
  });

  // Deliverables Routes
  app.get('/api/phases/:phaseId/deliverables', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const deliverables = await storage.getPhaseDeliverables(phaseId);
      res.json(deliverables);
    } catch (error) {
      console.error(`Error fetching deliverables for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/deliverables/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const deliverableId = parseInt(req.params.id);
      const deliverable = await storage.getDeliverable(deliverableId);
      
      if (!deliverable) {
        return res.status(404).json({ error: 'Deliverable not found' });
      }
      
      res.json(deliverable);
    } catch (error) {
      console.error(`Error fetching deliverable ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/phases/:phaseId/deliverables', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const userId = req.user!.id;
      
      // Check if phase exists
      const phase = await storage.getProjectPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(phase.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add deliverables to this phase' });
      }
      
      const deliverableData = insertDeliverableSchema.parse({
        ...req.body,
        phaseId,
        projectId: phase.projectId
      });
      
      const deliverable = await storage.createDeliverable(deliverableData);
      res.status(201).json(deliverable);
    } catch (error) {
      console.error(`Error creating deliverable for phase ${req.params.phaseId}:`, error);
      res.status(400).json({ error: 'Failed to create deliverable', details: error.message });
    }
  });

  app.put('/api/deliverables/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const deliverableId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Check if deliverable exists
      const deliverable = await storage.getDeliverable(deliverableId);
      if (!deliverable) {
        return res.status(404).json({ error: 'Deliverable not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(deliverable.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager') && userId !== deliverable.assignedTo) {
        return res.status(403).json({ error: 'Not authorized to update this deliverable' });
      }
      
      // Update deliverable data
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };
      
      const updatedDeliverable = await storage.updateDeliverable(deliverableId, updateData);
      res.json(updatedDeliverable);
    } catch (error) {
      console.error(`Error updating deliverable ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update deliverable', details: error.message });
    }
  });

  // Project Tasks Routes
  app.get('/api/projects/:projectId/tasks', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const tasks = await storage.getProjectTasks(projectId);
      res.json(tasks);
    } catch (error) {
      console.error(`Error fetching tasks for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/phases/:phaseId/tasks', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const tasks = await storage.getPhaseProjectTasks(phaseId);
      res.json(tasks);
    } catch (error) {
      console.error(`Error fetching tasks for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/tasks', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add tasks to this project' });
      }
      
      const taskData = insertProjectTaskSchema.parse({
        ...req.body,
        projectId
      });
      
      const task = await storage.createProjectTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      console.error(`Error creating task for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project task', details: error.message });
    }
  });

  // Phase Approvals Routes
  app.get('/api/phases/:phaseId/approvals', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const approvals = await storage.getPhaseApprovals(phaseId);
      res.json(approvals);
    } catch (error) {
      console.error(`Error fetching approvals for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/phases/:phaseId/approvals', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const userId = req.user!.id;
      
      // Check if phase exists
      const phase = await storage.getProjectPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }
      
      // Check if user is authorized - only project managers can request approvals
      const projectMembers = await storage.getProjectMembers(phase.projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'project_manager' || member.role === 'phase_lead')
      );
      
      if (!userMember && !canManage(req.user!.role, 'Senior Manager')) {
        return res.status(403).json({ error: 'Not authorized to request approvals for this phase' });
      }
      
      const approvalData = insertPhaseApprovalSchema.parse({
        ...req.body,
        phaseId,
        requestedAt: new Date()
      });
      
      const approval = await storage.createPhaseApproval(approvalData);
      res.status(201).json(approval);
    } catch (error) {
      console.error(`Error creating approval for phase ${req.params.phaseId}:`, error);
      res.status(400).json({ error: 'Failed to create phase approval', details: error.message });
    }
  });

  app.put('/api/approvals/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const approvalId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Get the approval
      const approval = await storage.getPhaseApproval(approvalId);
      if (!approval) {
        return res.status(404).json({ error: 'Approval not found' });
      }
      
      // Only the assigned approver can update the approval
      if (approval.approverId !== userId && !canManage(req.user!.role, 'Senior Manager')) {
        return res.status(403).json({ error: 'Not authorized to update this approval' });
      }
      
      // Update approval data
      const updateData = {
        ...req.body,
        respondedAt: req.body.status !== 'pending' ? new Date() : undefined
      };
      
      const updatedApproval = await storage.updatePhaseApproval(approvalId, updateData);
      
      // If approved and all approvals for this phase are complete, update phase status
      if (updateData.status === 'approved') {
        const phase = await storage.getProjectPhase(approval.phaseId);
        const allApprovals = await storage.getPhaseApprovals(approval.phaseId);
        
        const allApproved = allApprovals.every(a => a.status === 'approved');
        if (allApproved && phase) {
          await storage.updateProjectPhase(phase.id, {
            status: 'completed',
            actualEndDate: new Date()
          });
        }
      }
      
      res.json(updatedApproval);
    } catch (error) {
      console.error(`Error updating approval ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update approval', details: error.message });
    }
  });

  // Project Key Stages Routes
  app.get('/api/projects/:projectId/key-stages', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const keyStages = await storage.getProjectKeyStages(projectId);
      res.json(keyStages);
    } catch (error) {
      console.error(`Error fetching key stages for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });
  
  app.post('/api/projects/:projectId/key-stages', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      const { stageNumber, stageName, phase, description, isCompleted } = req.body;
      
      // Validate request
      if (stageNumber === undefined || stageName === undefined || !phase) {
        return res.status(400).json({ error: 'Stage number, name, and phase are required' });
      }
      
      const keyStage = await storage.createProjectKeyStage({
        project_id: projectId,
        stage_number: stageNumber,
        stage_name: stageName,
        phase: phase,
        description: description || null,
        is_completed: !!isCompleted,
        completed_by: isCompleted ? userId : null,
        completed_date: isCompleted ? new Date() : null
      });
      
      res.status(201).json(keyStage);
    } catch (error) {
      console.error(`Error creating key stage for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });
  
  app.patch('/api/projects/:projectId/key-stages/:stageId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const stageId = parseInt(req.params.stageId);
      const userId = req.user!.id;
      const { isCompleted, stageName, stageNumber, phase, description } = req.body;
      
      // Check if we're updating just completion status or other fields
      if (isCompleted !== undefined && 
          stageName === undefined && 
          stageNumber === undefined && 
          phase === undefined && 
          description === undefined) {
        // Use dedicated method for setting completion status
        const keyStage = await storage.setKeyStageCompleted(stageId, userId, isCompleted);
        return res.json(keyStage);
      }
      
      // Create updates object with all provided fields using snake_case
      const updates: any = {};
      if (isCompleted !== undefined) {
        updates.is_completed = isCompleted;
        updates.completed_by = isCompleted ? userId : null;
        updates.completed_date = isCompleted ? new Date() : null;
      }
      
      if (stageName !== undefined) updates.stage_name = stageName;
      if (stageNumber !== undefined) updates.stage_number = stageNumber;
      if (phase !== undefined) updates.phase = phase;
      if (description !== undefined) updates.description = description;
      
      // Regular update for other fields
      const keyStage = await storage.updateProjectKeyStage(stageId, updates);
      
      res.json(keyStage);
    } catch (error) {
      console.error(`Error updating key stage ${req.params.stageId}:`, error);
      sendError(res, error);
    }
  });
  
  // Dedicated endpoint for marking a key stage as completed
  app.post('/api/projects/:projectId/key-stages/:stageId/complete', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const stageId = parseInt(req.params.stageId);
      const userId = req.user!.id;
      
      const keyStage = await storage.setKeyStageCompleted(stageId, userId, true);
      
      res.json(keyStage);
    } catch (error) {
      console.error(`Error marking key stage ${req.params.stageId} as completed:`, error);
      sendError(res, error);
    }
  });
  
  // Dedicated endpoint for marking a key stage as incomplete
  app.post('/api/projects/:projectId/key-stages/:stageId/incomplete', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const stageId = parseInt(req.params.stageId);
      const userId = req.user!.id;
      
      const keyStage = await storage.setKeyStageCompleted(stageId, userId, false);
      
      res.json(keyStage);
    } catch (error) {
      console.error(`Error marking key stage ${req.params.stageId} as incomplete:`, error);
      sendError(res, error);
    }
  });
  
  // Project Documents Routes
  app.get('/api/projects/:projectId/documents', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documents = await storage.getProjectDocuments(projectId);
      res.json(documents);
    } catch (error) {
      console.error(`Error fetching documents for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/phases/:phaseId/documents', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const documents = await storage.getPhaseDocuments(phaseId);
      res.json(documents);
    } catch (error) {
      console.error(`Error fetching documents for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/documents', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add documents to this project' });
      }
      
      const documentData = insertProjectDocumentSchema.parse({
        ...req.body,
        projectId,
        uploadedBy: userId,
        uploadedAt: new Date()
      });
      
      const document = await storage.createProjectDocument(documentData);
      res.status(201).json(document);
    } catch (error) {
      console.error(`Error creating document for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project document', details: error.message });
    }
  });

  app.put('/api/documents/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Check if document exists
      const document = await storage.getProjectDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(document.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager') && userId !== document.uploadedBy) {
        return res.status(403).json({ error: 'Not authorized to update this document' });
      }
      
      // Update document data
      const updateData = {
        ...req.body
      };
      
      const updatedDocument = await storage.updateProjectDocument(documentId, updateData);
      res.json(updatedDocument);
    } catch (error) {
      console.error(`Error updating document ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update document', details: error.message });
    }
  });

  // Project Items Routes
  app.get('/api/projects/:projectId/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectIdParam = req.params.projectId;
      console.log('Fetching items for project ID:', projectIdParam);
      
      // Get the project first to ensure it exists
      const project = await storage.getProject(projectIdParam);
      
      if (!project) {
        console.log('Project not found for ID:', projectIdParam);
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Use the numeric ID from the project record
      const projectId = project.id;
      
      // Get items for the project
      const items = await storage.getProjectItems(projectId);
      console.log(`Found ${items.length} items for project ${projectId}`);
      res.json(items);
    } catch (error) {
      console.error(`Error fetching items for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  // Get virtual components for a project
  app.get('/api/projects/:projectId/virtual-components', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      const virtualComponents = await db.execute(sql`
        SELECT 
          ic.id,
          ic.parent_item_id,
          ic.component_item_id,
          mi_component.item_code as component_code,
          mi_component.description as component_description,
          ic.quantity,
          mi_component.uom as unit
        FROM item_components ic
        JOIN project_items pi ON ic.parent_item_id = pi.item_id
        JOIN master_items mi_component ON ic.component_item_id = mi_component.id
        WHERE pi.project_id = ${projectId}
        ORDER BY mi_component.item_code
      `);

      res.json(virtualComponents.rows || virtualComponents);
    } catch (error) {
      console.error(`Error fetching virtual components for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/projects/code/:projectCode/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectCode = req.params.projectCode;
      const items = await storage.getProjectItemsByCode(projectCode);
      res.json(items);
    } catch (error) {
      console.error(`Error fetching items for project code ${req.params.projectCode}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/project-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const item = await storage.getProjectItem(itemId);
      
      if (!item) {
        return res.status(404).json({ error: 'Project item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error(`Error fetching project item ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add items to this project' });
      }
      
      const itemData = insertProjectItemSchema.parse({
        ...req.body,
        projectId,
        projectCode: project.code,
        createdAt: new Date(),
        createdBy: userId,
      });
      
      const item = await storage.createProjectItem(itemData);

      const eventPayload = {
        projectId,
        projectItemId: item.id,
        masterItemId: item.itemId,
        changedBy: userId,
        timestamp: new Date().toISOString(),
      };
      agentEventBus.emit('project.item.added', eventPayload, 'project-routes');
      db.insert(projectWorkflowEvents).values({
        projectId,
        eventName: 'project.item.added',
        eventPayload,
        emittedBy: 'project-routes',
        emittedAt: new Date(),
        processed: false,
      }).then(() => console.log(`[ProjectItemEvent] project.item.added logged for project ${projectId}`))
        .catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.added:`, err));

      res.status(201).json(item);
    } catch (error) {
      console.error(`Error creating item for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project item', details: error.message });
    }
  });

  app.put('/api/project-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      console.log(`Updating project item ${itemId} by user ${userId} with data:`, req.body);
      
      // Check if item exists
      const item = await storage.getProjectItem(itemId);
      if (!item) {
        console.log(`Project item ${itemId} not found`);
        return res.status(404).json({ error: 'Project item not found' });
      }
      
      console.log(`Found project item:`, item);
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(item.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        console.log(`User ${userId} not authorized to update project item ${itemId}`);
        return res.status(403).json({ error: 'Not authorized to update this project item' });
      }

      // Extract fields from request body, including camelCase and snake_case variations
      const { 
        itemCode, 
        description, 
        quantity, 
        uom, 
        makeOrBuy, 
        make_or_buy, // Include snake_case version
        drawingNo, 
        drawing_no,  // Include snake_case version
        ...otherData 
      } = req.body;
      
      // Use the camelCase version if available, otherwise use snake_case version
      const effectiveMakeOrBuy = makeOrBuy || make_or_buy;
      const effectiveDrawingNo = drawingNo || drawing_no;
      
      console.log(`Extracted fields for update - itemCode: ${itemCode}, description: ${description}, quantity: ${quantity}, uom: ${uom}, makeOrBuy: ${effectiveMakeOrBuy}, drawingNo: ${effectiveDrawingNo}`);
      
      const oldMakeOrBuy = await storage.getMasterItem(item.itemId).then(mi => mi?.makeOrBuy || null);

      if (itemCode) {
        try {
          console.log(`Getting master item for item ID: ${item.itemId}`);
          const masterItem = await storage.getMasterItem(item.itemId);
          
          if (!masterItem) {
            console.log(`Master item with ID ${item.itemId} not found`);
            return res.status(404).json({ error: 'Associated master item not found' });
          }
          
          console.log(`Found master item:`, masterItem);
          
          // Check if the new itemCode already exists (but isn't this item)
          if (itemCode !== masterItem.itemCode) {
            console.log(`Checking if item code ${itemCode} already exists (current code: ${masterItem.itemCode})`);
            const existingItem = await storage.getMasterItemByCode(itemCode);
            
            if (existingItem) {
              console.log(`Found existing item with code ${itemCode}:`, existingItem);
              
              if (existingItem.id !== masterItem.id) {
                console.log(`Item code ${itemCode} already exists for another item (ID: ${existingItem.id})`);
                return res.status(400).json({ error: 'Item code already exists for another item' });
              }
            }
          }
          
          // Update the master item with new data
          // Be explicit about field names to ensure they match the database schema
          const masterItemUpdateData = {
            itemCode,
            description,
            uom,
            // Use the effective values which handle both camelCase and snake_case
            makeOrBuy: effectiveMakeOrBuy,
            drawingNo: effectiveDrawingNo,
            updatedAt: new Date()
          };
          
          console.log(`Explicitly setting make_or_buy: ${makeOrBuy} and drawing_no: ${drawingNo}`);
          
          console.log(`Updating master item ${masterItem.id} with data:`, masterItemUpdateData);
          const updatedMasterItem = await storage.updateMasterItem(masterItem.id, masterItemUpdateData);
          console.log(`Master item updated successfully:`, updatedMasterItem);
          
        } catch (error) {
          console.error(`Error updating master item for project item ${itemId}:`, error);
          return res.status(400).json({ error: 'Failed to update master item', details: error.message });
        }
      }
      
      // Now update the project item with remaining data
      const projectItemUpdateData = {
        quantity,
        ...otherData,
        updatedAt: new Date()
      };
      
      console.log(`Updating project item ${itemId} with data:`, projectItemUpdateData);
      const updatedItem = await storage.updateProjectItem(itemId, projectItemUpdateData);
      console.log(`Project item updated successfully:`, updatedItem);
      
      // AUTO-SYNC: Check if status is being updated and sync with related work orders
      if (otherData.status && otherData.status !== item.status) {
        console.log(`🔄 AUTO-SYNC: Project item status changed from "${item.status}" to "${otherData.status}"`);
        
        try {
          // Get the master item to find the item code
          const masterItem = await storage.getMasterItem(item.itemId);
          
          if (masterItem) {
            console.log(`🔍 AUTO-SYNC: Looking for work orders with item code: ${masterItem.itemCode}`);
            
            // Find related work orders by matching item code in title
            const relatedWorkOrders = await db.select()
              .from(workOrders)
              .where(sql`${workOrders.projectId} = ${item.projectId} AND ${workOrders.title} LIKE ${`%${masterItem.itemCode}%`}`);
            
            console.log(`🔍 AUTO-SYNC: Found ${relatedWorkOrders.length} related work orders`);
            
            if (relatedWorkOrders.length > 0) {
              // Map project item status to work order status
              let workOrderStatus = otherData.status;
              
              // Status mapping logic
              switch (otherData.status) {
                case 'active':
                case 'Active':
                  workOrderStatus = 'planned';
                  break;
                case 'cancelled':
                case 'Cancelled':
                  workOrderStatus = 'cancelled';
                  break;
                case 'completed':
                case 'Completed':
                  workOrderStatus = 'completed';
                  break;
                case 'in_progress':
                case 'In Progress':
                  workOrderStatus = 'in_progress';
                  break;
                default:
                  workOrderStatus = 'planned';
              }
              
              console.log(`🔄 AUTO-SYNC: Updating ${relatedWorkOrders.length} work orders to status: ${workOrderStatus}`);
              
              // Update all related work orders
              for (const workOrder of relatedWorkOrders) {
                try {
                  await db.update(workOrders)
                    .set({ 
                      status: workOrderStatus, 
                      updatedAt: new Date()
                    })
                    .where(eq(workOrders.id, workOrder.id));
                  
                  console.log(`✅ AUTO-SYNC: Updated work order ${workOrder.workOrderNumber} to status: ${workOrderStatus}`);
                } catch (woError) {
                  console.error(`❌ AUTO-SYNC: Failed to update work order ${workOrder.workOrderNumber}:`, woError);
                }
              }
              
              console.log(`🎯 AUTO-SYNC: Successfully synchronized ${relatedWorkOrders.length} work orders with project item status`);
            } else {
              console.log(`ℹ️ AUTO-SYNC: No related work orders found for item code: ${masterItem.itemCode}`);
            }

            // AUTO-SYNC: Also find and update related inspection orders
            console.log(`🔍 AUTO-SYNC: Looking for inspection orders related to project item ${itemId}`);
            
            const relatedInspectionOrders = await db.select()
              .from(inspectionOrders)
              .where(eq(inspectionOrders.itemId, itemId));
            
            console.log(`🔍 AUTO-SYNC: Found ${relatedInspectionOrders.length} related inspection orders`);
            
            if (relatedInspectionOrders.length > 0) {
              // Map project item status to inspection order status
              let inspectionOrderStatus = otherData.status;
              
              // Status mapping logic for inspection orders
              switch (otherData.status) {
                case 'active':
                case 'Active':
                  inspectionOrderStatus = 'pending';
                  break;
                case 'cancelled':
                case 'Cancelled':
                  inspectionOrderStatus = 'cancelled';
                  break;
                case 'completed':
                case 'Completed':
                  inspectionOrderStatus = 'completed';
                  break;
                case 'in_progress':
                case 'In Progress':
                  inspectionOrderStatus = 'in_progress';
                  break;
                default:
                  inspectionOrderStatus = 'pending';
              }
              
              console.log(`🔄 AUTO-SYNC: Updating ${relatedInspectionOrders.length} inspection orders to status: ${inspectionOrderStatus}`);
              
              // Update all related inspection orders
              for (const inspectionOrder of relatedInspectionOrders) {
                try {
                  await db.update(inspectionOrders)
                    .set({ 
                      status: inspectionOrderStatus, 
                      updatedAt: new Date()
                    })
                    .where(eq(inspectionOrders.id, inspectionOrder.id));
                  
                  console.log(`✅ AUTO-SYNC: Updated inspection order ${inspectionOrder.inspectionOrderNumber} to status: ${inspectionOrderStatus}`);
                } catch (ioError) {
                  console.error(`❌ AUTO-SYNC: Failed to update inspection order ${inspectionOrder.inspectionOrderNumber}:`, ioError);
                }
              }
              
              console.log(`🎯 AUTO-SYNC: Successfully synchronized ${relatedInspectionOrders.length} inspection orders with project item status`);
            } else {
              console.log(`ℹ️ AUTO-SYNC: No related inspection orders found for project item ${itemId}`);
            }
          } else {
            console.log(`⚠️ AUTO-SYNC: Could not find master item for project item ${itemId}`);
          }
        } catch (syncError) {
          console.error(`❌ AUTO-SYNC ERROR: Failed to synchronize work orders and inspection orders:`, syncError);
          // Don't fail the entire request - just log the sync error
        }
      }
      
      const fullUpdatedItem = await storage.getProjectItem(itemId);
      console.log(`Returning full updated item:`, fullUpdatedItem);

      const updateEventPayload = {
        projectId: item.projectId,
        projectItemId: itemId,
        masterItemId: item.itemId,
        changedBy: userId,
        timestamp: new Date().toISOString(),
      };
      agentEventBus.emit('project.item.updated', updateEventPayload, 'project-routes');
      db.insert(projectWorkflowEvents).values({
        projectId: item.projectId,
        eventName: 'project.item.updated',
        eventPayload: updateEventPayload,
        emittedBy: 'project-routes',
        emittedAt: new Date(),
        processed: false,
      }).then(() => console.log(`[ProjectItemEvent] project.item.updated logged for item ${itemId}`))
        .catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.updated:`, err));

      if (effectiveMakeOrBuy && oldMakeOrBuy && effectiveMakeOrBuy !== oldMakeOrBuy) {
        const classEventPayload = {
          projectId: item.projectId,
          projectItemId: itemId,
          masterItemId: item.itemId,
          oldClassification: oldMakeOrBuy,
          newClassification: effectiveMakeOrBuy,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        };
        agentEventBus.emit('project.item.classification_changed', classEventPayload, 'project-routes');
        db.insert(projectWorkflowEvents).values({
          projectId: item.projectId,
          eventName: 'project.item.classification_changed',
          eventPayload: classEventPayload,
          emittedBy: 'project-routes',
          emittedAt: new Date(),
          processed: false,
        }).then(() => console.log(`[ProjectItemEvent] project.item.classification_changed logged: ${oldMakeOrBuy} → ${effectiveMakeOrBuy} for item ${itemId}`))
          .catch(err => console.error(`[ProjectItemEvent] Failed to log classification change:`, err));
      }

      res.json(fullUpdatedItem);
    } catch (error) {
      console.error(`Error updating project item ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update project item', details: error.message });
    }
  });

  app.delete('/api/project-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const item = await storage.getProjectItem(itemId);
      if (!item) {
        return res.status(404).json({ error: 'Project item not found' });
      }
      
      const projectMembers = await storage.getProjectMembers(item.projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'project_manager' || canManage(req.user!.role, 'Manager'))
      );
      
      if (!userMember) {
        return res.status(403).json({ error: 'Not authorized to delete this project item' });
      }

      const poItems = await db.execute(
        sql`SELECT id FROM purchase_order_items WHERE project_item_id = ${itemId} LIMIT 5`
      );
      const woItems = await db.execute(
        sql`SELECT id FROM work_order_items WHERE project_item_id = ${itemId} LIMIT 5`
      );
      const ioItems = await db.execute(
        sql`SELECT id FROM inspection_orders WHERE project_item_id = ${itemId} LIMIT 5`
      );

      const dependencies: Record<string, number> = {};
      if (poItems.rows.length > 0) dependencies.purchase_order_items = poItems.rows.length;
      if (woItems.rows.length > 0) dependencies.work_order_items = woItems.rows.length;
      if (ioItems.rows.length > 0) dependencies.inspection_orders = ioItems.rows.length;

      const hasDependencies = Object.keys(dependencies).length > 0;

      if (hasDependencies) {
        const eventPayload = {
          projectId: item.projectId,
          projectItemId: itemId,
          masterItemId: item.itemId,
          changedBy: userId,
          deletionBlocked: true,
          downstreamDependencies: dependencies,
          timestamp: new Date().toISOString(),
        };
        agentEventBus.emit('project.item.removed', eventPayload, 'project-routes');
        db.insert(projectWorkflowEvents).values({
          projectId: item.projectId,
          eventName: 'project.item.removed',
          eventPayload,
          emittedBy: 'project-routes',
          emittedAt: new Date(),
          processed: false,
        }).catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.removed:`, err));

        return res.status(409).json({
          error: 'Cannot delete project item with downstream dependencies',
          dependencies,
          message: 'An impact review task has been created for the project manager to evaluate this deletion request.',
        });
      }

      await storage.deleteProjectItem(itemId);

      const eventPayload = {
        projectId: item.projectId,
        projectItemId: itemId,
        masterItemId: item.itemId,
        changedBy: userId,
        deletionBlocked: false,
        downstreamDependencies: {},
        timestamp: new Date().toISOString(),
      };
      agentEventBus.emit('project.item.removed', eventPayload, 'project-routes');
      db.insert(projectWorkflowEvents).values({
        projectId: item.projectId,
        eventName: 'project.item.removed',
        eventPayload,
        emittedBy: 'project-routes',
        emittedAt: new Date(),
        processed: false,
      }).catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.removed:`, err));

      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting project item ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.delete('/api/projects/:projectId/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectIdParam = req.params.projectId;
      const userId = req.user!.id;
      
      // Get the project first to ensure it exists
      const project = await storage.getProject(projectIdParam);
      
      if (!project) {
        console.log('Project not found for ID:', projectIdParam);
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Use the numeric ID from the project record
      const projectId = project.id;
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'project_manager' || canManage(req.user!.role, 'Senior Manager'))
      );
      
      if (!userMember) {
        return res.status(403).json({ error: 'Not authorized to delete all items from this project' });
      }
      
      const count = await storage.deleteProjectItems(projectId);
      console.log(`Deleted ${count} items from project ${projectId}`);
      res.json({ deletedCount: count });
    } catch (error) {
      console.error(`Error deleting all items from project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  // Customer Management Routes
  app.get('/api/customers/next-bp-code', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customers = await storage.getAllCustomers();
      let maxNum = 10363;
      for (const c of customers) {
        if (c.bpCode) {
          const match = c.bpCode.match(/^C(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      }
      const nextCode = 'C' + String(maxNum + 1);
      res.json({ nextBpCode: nextCode });
    } catch (error) {
      console.error('Error generating next BP code:', error);
      sendError(res, error);
    }
  });

  app.get('/api/customers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      sendError(res, error);
    }
  });

  app.get('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      const customer = await storage.getCustomer(customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      res.json(customer);
    } catch (error) {
      console.error(`Error fetching customer ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/customers/verify-email', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ valid: false, reason: 'Email is required' });
      }
      const { verifyEmailDomain } = await import('./email-verify');
      const result = await verifyEmailDomain(email);
      res.json(result);
    } catch (error: any) {
      res.json({ valid: true });
    }
  });

  app.post('/api/customers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if the user has permission to create customers
      const managementRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!managementRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to create customers' });
      }

      if (req.body.email) {
        const { verifyEmailDomain } = await import('./email-verify');
        const emailCheck = await verifyEmailDomain(req.body.email);
        if (!emailCheck.valid) {
          return res.status(400).json({ error: `Email verification failed: ${emailCheck.reason}` });
        }
      }
      
      const customerData = insertCustomerSchema.parse({
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Check if BP code already exists
      if (customerData.bpCode) {
        const existingCustomer = await storage.getCustomerByBPCode(customerData.bpCode);
        if (existingCustomer) {
          return res.status(400).json({ error: 'A customer with this BP code already exists' });
        }
      }
      
      const customer = await storage.createCustomer(customerData);
      
      try {
        const { sapBPSyncService } = await import('./sap-b1-integration/sap-bp-sync');
        const sapResult = await sapBPSyncService.createBusinessPartner(customer);
        if (sapResult.success) {
          console.log(`✅ Customer ${customer.bpCode} synced to SAP B1`);
        } else {
          console.warn(`⚠️ Customer ${customer.bpCode} created locally but SAP sync failed: ${sapResult.error}`);
        }
        res.status(201).json({ ...customer, sapSyncStatus: sapResult.success ? 'synced' : 'failed', sapSyncError: sapResult.error });
      } catch (sapError: any) {
        console.warn(`⚠️ SAP sync skipped for ${customer.bpCode}: ${sapError.message}`);
        res.status(201).json({ ...customer, sapSyncStatus: 'skipped', sapSyncError: sapError.message });
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(400).json({ error: 'Failed to create customer', details: error.message });
    }
  });

  app.put('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      
      // Check if the user has permission to update customers
      const managementRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!managementRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to update customers' });
      }
      
      // Check if customer exists
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (req.body.email && req.body.email !== customer.email) {
        const { verifyEmailDomain } = await import('./email-verify');
        const emailCheck = await verifyEmailDomain(req.body.email);
        if (!emailCheck.valid) {
          return res.status(400).json({ error: `Email verification failed: ${emailCheck.reason}` });
        }
      }
      
      // Check if BP code is being changed and if it already exists
      if (req.body.bpCode && req.body.bpCode !== customer.bpCode) {
        const existingCustomer = await storage.getCustomerByBPCode(req.body.bpCode);
        if (existingCustomer && existingCustomer.id !== customerId) {
          return res.status(400).json({ error: 'A customer with this BP code already exists' });
        }
      }
      
      // Update customer data
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };
      
      const updatedCustomer = await storage.updateCustomer(customerId, updateData);
      
      try {
        const { sapBPSyncService } = await import('./sap-b1-integration/sap-bp-sync');
        const sapResult = await sapBPSyncService.updateBusinessPartner(updatedCustomer);
        if (sapResult.success) {
          console.log(`✅ Customer ${updatedCustomer.bpCode} updated in SAP B1`);
        } else {
          console.warn(`⚠️ Customer ${updatedCustomer.bpCode} updated locally but SAP sync failed: ${sapResult.error}`);
        }
        res.json({ ...updatedCustomer, sapSyncStatus: sapResult.success ? 'synced' : 'failed', sapSyncError: sapResult.error });
      } catch (sapError: any) {
        console.warn(`⚠️ SAP sync skipped for ${updatedCustomer.bpCode}: ${sapError.message}`);
        res.json({ ...updatedCustomer, sapSyncStatus: 'skipped', sapSyncError: sapError.message });
      }
    } catch (error) {
      console.error(`Error updating customer ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update customer', details: error.message });
    }
  });

  app.delete('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      
      // Check if the user has permission to delete customers
      const managementRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!managementRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to delete customers' });
      }
      
      // Check if customer exists
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      // Check if customer is associated with any projects
      const projects = await storage.getUserProjects(req.user!.id);
      const associatedProjects = projects.filter(project => project.customerId === customerId);
      
      if (associatedProjects.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete customer with associated projects', 
          projects: associatedProjects.map(p => ({ id: p.id, name: p.name, code: p.code }))
        });
      }
      
      await storage.deleteCustomer(customerId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting customer ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  // ─── Planning Record Lifecycle Routes ─────────────────────────────────────

  app.get('/api/projects/:projectId/planning-records', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT ipr.*, u1.username as assigned_to_name, u2.username as created_by_name,
                              u3.username as reviewed_by_name, u4.username as released_by_name,
                              mi.name as item_name, mi.item_code
                       FROM item_planning_records ipr
                       LEFT JOIN users u1 ON ipr.assigned_to = u1.id
                       LEFT JOIN users u2 ON ipr.created_by = u2.id
                       LEFT JOIN users u3 ON ipr.reviewed_by = u3.id
                       LEFT JOIN users u4 ON ipr.released_by = u4.id
                       LEFT JOIN master_items mi ON ipr.master_item_id = mi.id
                       WHERE ipr.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND ipr.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND ipr.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY ipr.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/planning-records/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');

      const result = await db.execute(
        sql`SELECT ipr.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as reviewed_by_name, u4.username as released_by_name,
                   mi.name as item_name, mi.item_code
            FROM item_planning_records ipr
            LEFT JOIN users u1 ON ipr.assigned_to = u1.id
            LEFT JOIN users u2 ON ipr.created_by = u2.id
            LEFT JOIN users u3 ON ipr.reviewed_by = u3.id
            LEFT JOIN users u4 ON ipr.released_by = u4.id
            LEFT JOIN master_items mi ON ipr.master_item_id = mi.id
            WHERE ipr.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/submit-for-review', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit for review: record is in '${record.status}' status. Only 'draft' records can be submitted.`);
      }

      await db.update(itemPlanningRecords)
        .set({ status: 'under_review', updatedAt: new Date() })
        .where(eq(itemPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'planning_record.submitted_for_review', ${JSON.stringify({
          planningRecordId: id, planningType: record.planning_type,
          projectItemId: record.project_item_id, submittedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[PlanningLifecycle] Record ${id} submitted for review by user ${userId}`);
      res.json({ success: true, message: 'Planning record submitted for review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/review', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { reviewNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot review: record is in '${record.status}' status. Only 'under_review' records can be reviewed.`);
      }

      await db.update(itemPlanningRecords)
        .set({
          reviewedBy: userId, reviewedAt: new Date(),
          reviewNote: reviewNote || null, updatedAt: new Date(),
        })
        .where(eq(itemPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'planning_record.reviewed', ${JSON.stringify({
          planningRecordId: id, planningType: record.planning_type,
          projectItemId: record.project_item_id, reviewedBy: userId, reviewNote,
        })}::jsonb, NOW())`);

      console.log(`[PlanningLifecycle] Record ${id} reviewed by user ${userId}`);
      res.json({ success: true, message: 'Planning record reviewed', id, reviewedBy: userId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/release', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { releaseNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot release: record is in '${record.status}' status. Only reviewed 'under_review' records can be released.`);
      }
      if (!record.reviewed_by) {
        return sendBusinessError(res, 'Cannot release: record has not been reviewed yet. Please review first.');
      }

      const conflicting = await db.execute(
        sql`SELECT id FROM item_planning_records 
            WHERE project_id = ${record.project_id}
              AND project_item_id = ${record.project_item_id}
              AND planning_type = ${record.planning_type}
              AND status = 'released' AND id != ${id}`
      );
      if (conflicting.rows.length > 0) {
        return sendBusinessError(res, `Cannot release: another released planning record (ID ${(conflicting.rows[0] as any).id}) already exists for this item and planning type. Supersede it first.`);
      }

      await db.update(itemPlanningRecords)
        .set({
          status: 'released', releasedBy: userId, releasedAt: new Date(),
          releaseNote: releaseNote || null, updatedAt: new Date(),
        })
        .where(eq(itemPlanningRecords.id, id));

      let procurementExecId: number | null = null;

      if (record.planning_type === 'procurement') {
        const existingExec = await db.execute(
          sql`SELECT id FROM procurement_execution_records 
              WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_po')`
        );
        if (existingExec.rows.length === 0) {
          const itemSnapshot = await db.execute(
            sql`SELECT mi.item_code, mi.description, mi.specification, mi.uom, mi.drawing_no,
                       mi.preferred_vendor_id, mi.estimated_cost, v.name as vendor_name,
                       pi.quantity, pi.estimated_cost as project_estimated_cost
                FROM project_items pi
                JOIN master_items mi ON pi.item_id = mi.id
                LEFT JOIN vendors v ON mi.preferred_vendor_id = v.id
                WHERE pi.id = ${record.project_item_id}`
          );
          const snap = (itemSnapshot.rows[0] as any) || {};
          const qty = parseFloat(snap.quantity || '0');
          const unitCost = parseFloat(snap.estimated_cost || snap.project_estimated_cost || '0');

          const [newExec] = await db.insert(procurementExecutionRecords).values({
            projectId: record.project_id,
            projectItemId: record.project_item_id,
            planningRecordId: id,
            masterItemId: record.master_item_id,
            itemCode: snap.item_code || null,
            itemDescription: snap.description || null,
            itemSpecification: snap.specification || null,
            uom: snap.uom || null,
            drawingNo: snap.drawing_no || null,
            quantity: String(qty),
            estimatedUnitCost: unitCost > 0 ? String(unitCost) : null,
            estimatedTotalCost: unitCost > 0 && qty > 0 ? String(unitCost * qty) : null,
            preferredVendorId: snap.preferred_vendor_id || null,
            preferredVendorName: snap.vendor_name || null,
            status: 'draft',
            assignedTo: record.assigned_to,
            createdBy: userId,
          }).returning();
          procurementExecId = newExec.id;
          console.log(`[PlanningLifecycle] Created procurement execution record ${newExec.id} from released planning record ${id}`);
        } else {
          procurementExecId = (existingExec.rows[0] as any).id;
          console.log(`[PlanningLifecycle] Procurement execution record ${procurementExecId} already exists for planning record ${id}`);
        }
      }

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'planning_record.released', ${JSON.stringify({
          planningRecordId: id, planningType: record.planning_type,
          projectItemId: record.project_item_id, releasedBy: userId, releaseNote,
        })}::jsonb, NOW())`);

      let productionExecId: number | null = null;

      if (record.planning_type === 'production') {
        const existingExec = await db.execute(
          sql`SELECT id FROM production_execution_records 
              WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_wo')`
        );
        if (existingExec.rows.length === 0) {
          const itemSnapshot = await db.execute(
            sql`SELECT mi.item_code, mi.description, mi.specification, mi.uom, mi.drawing_no,
                       mi.latest_revision, mi.standard_cost, mi.make_or_buy,
                       pi.quantity, pi.estimated_cost as project_estimated_cost
                FROM project_items pi
                JOIN master_items mi ON pi.item_id = mi.id
                WHERE pi.id = ${record.project_item_id}`
          );
          const snap = (itemSnapshot.rows[0] as any) || {};
          const qty = parseFloat(snap.quantity || '0');
          const unitCost = parseFloat(snap.standard_cost || snap.project_estimated_cost || '0');

          const [newExec] = await db.insert(productionExecutionRecords).values({
            projectId: record.project_id,
            projectItemId: record.project_item_id,
            planningRecordId: id,
            masterItemId: record.master_item_id,
            itemCode: snap.item_code || null,
            itemDescription: snap.description || null,
            itemSpecification: snap.specification || null,
            uom: snap.uom || null,
            drawingNo: snap.drawing_no || null,
            drawingRevision: snap.latest_revision || null,
            quantity: String(qty),
            estimatedUnitCost: unitCost > 0 ? String(unitCost) : null,
            estimatedTotalCost: unitCost > 0 && qty > 0 ? String(unitCost * qty) : null,
            makeClassification: snap.make_or_buy || 'Make',
            status: 'draft',
            assignedTo: record.assigned_to,
            createdBy: userId,
          }).returning();
          productionExecId = newExec.id;
          console.log(`[PlanningLifecycle] Created production execution record ${newExec.id} from released planning record ${id}`);
        } else {
          productionExecId = (existingExec.rows[0] as any).id;
          console.log(`[PlanningLifecycle] Production execution record ${productionExecId} already exists for planning record ${id}`);
        }
      }

      if (procurementExecId) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
          VALUES (${record.project_id}, 'procurement_execution.created_from_release', ${JSON.stringify({
            procurementExecId, planningRecordId: id,
            projectItemId: record.project_item_id, createdBy: userId,
          })}::jsonb, NOW())`);
      }

      if (productionExecId) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
          VALUES (${record.project_id}, 'production_execution.created_from_release', ${JSON.stringify({
            productionExecId, planningRecordId: id,
            projectItemId: record.project_item_id, createdBy: userId,
          })}::jsonb, NOW())`);
      }

      console.log(`[PlanningLifecycle] Record ${id} released by user ${userId}`);
      res.json({ success: true, message: 'Planning record released', id, newStatus: 'released', procurementExecId, productionExecId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/cancel', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      await db.update(itemPlanningRecords)
        .set({
          status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(),
          cancelReason, updatedAt: new Date(),
        })
        .where(eq(itemPlanningRecords.id, id));

      let cascadedProcExecIds: number[] = [];
      let cascadedProdExecIds: number[] = [];
      if (record.planning_type === 'procurement') {
        const cascadeResult = await db.execute(
          sql`UPDATE procurement_execution_records 
              SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Planning record cancelled: ' + cancelReason}, updated_at = NOW()
              WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_po')
              RETURNING id`
        );
        cascadedProcExecIds = cascadeResult.rows.map((r: any) => r.id);
        for (const procId of cascadedProcExecIds) {
          await db.execute(
            sql`UPDATE quality_planning_records 
                SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Upstream planning record cancelled: ' + cancelReason}, updated_at = NOW()
                WHERE procurement_exec_id = ${procId} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')`
          );
          await db.execute(
            sql`UPDATE po_preparation_records 
                SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Upstream planning record cancelled: ' + cancelReason}, updated_at = NOW()
                WHERE execution_record_id = ${procId} AND status IN ('draft', 'under_review', 'ready_for_po_creation')`
          );
        }
        if (cascadedProcExecIds.length > 0) {
          console.log(`[PlanningLifecycle] Cascade-cancelled ${cascadedProcExecIds.length} procurement execution record(s) + quality plans + PO preps for planning record ${id}`);
        }
      }
      if (record.planning_type === 'production') {
        const cascadeResult = await db.execute(
          sql`UPDATE production_execution_records 
              SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Planning record cancelled: ' + cancelReason}, updated_at = NOW()
              WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_wo')
              RETURNING id`
        );
        cascadedProdExecIds = cascadeResult.rows.map((r: any) => r.id);
        for (const prodId of cascadedProdExecIds) {
          await db.execute(
            sql`UPDATE quality_planning_records 
                SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Upstream planning record cancelled: ' + cancelReason}, updated_at = NOW()
                WHERE production_exec_id = ${prodId} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')`
          );
        }
        if (cascadedProdExecIds.length > 0) {
          console.log(`[PlanningLifecycle] Cascade-cancelled ${cascadedProdExecIds.length} production execution record(s) + quality plans for planning record ${id}`);
        }
      }

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'planning_record.cancelled', ${JSON.stringify({
          planningRecordId: id, planningType: record.planning_type,
          projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
        })}::jsonb, NOW())`);

      console.log(`[PlanningLifecycle] Record ${id} cancelled by user ${userId}`);
      res.json({ success: true, message: 'Planning record cancelled', id, newStatus: 'cancelled', cascadedProcExecIds, cascadedProdExecIds });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/revert-to-draft', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot revert: only 'under_review' records can be reverted to draft. Current status: '${record.status}'.`);
      }

      await db.update(itemPlanningRecords)
        .set({
          status: 'draft', reviewedBy: null, reviewedAt: null, reviewNote: null, updatedAt: new Date(),
        })
        .where(eq(itemPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'planning_record.reverted_to_draft', ${JSON.stringify({
          planningRecordId: id, planningType: record.planning_type,
          projectItemId: record.project_item_id, revertedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[PlanningLifecycle] Record ${id} reverted to draft by user ${userId}`);
      res.json({ success: true, message: 'Planning record reverted to draft', id, newStatus: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/convert', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { targetType, note } = req.body || {};

      if (!targetType || !['procurement', 'production'].includes(targetType)) {
        return sendValidationError(res, 'targetType must be "procurement" or "production"');
      }

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.planning_type !== 'review') {
        return sendBusinessError(res, 'Only review-type planning records can be converted.');
      }
      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot convert: record is '${record.status}'.`);
      }

      const conflicting = await db.execute(
        sql`SELECT id FROM item_planning_records 
            WHERE project_id = ${record.project_id}
              AND project_item_id = ${record.project_item_id}
              AND planning_type = ${targetType}
              AND status IN ('draft', 'under_review', 'released')`
      );
      if (conflicting.rows.length > 0) {
        return sendBusinessError(res, `Cannot convert: an active ${targetType} planning record (ID ${(conflicting.rows[0] as any).id}) already exists for this item.`);
      }

      const newClassification = targetType === 'procurement' ? 'Buy' : 'Make';
      const [newRecord] = await db.insert(itemPlanningRecords).values({
        projectId: record.project_id,
        projectItemId: record.project_item_id,
        masterItemId: record.master_item_id,
        planningType: targetType,
        status: 'draft',
        classificationSnapshot: newClassification,
        linkedTaskId: record.linked_task_id,
        assignedTo: record.assigned_to,
        createdBy: userId,
        notes: note || `Converted from review record #${id}`,
      }).returning();

      await db.update(itemPlanningRecords)
        .set({
          status: 'superseded', supersededBy: newRecord.id, supersededAt: new Date(),
          supersessionReason: `Converted to ${targetType} planning record #${newRecord.id}`,
          updatedAt: new Date(),
        })
        .where(eq(itemPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'planning_record.converted', ${JSON.stringify({
          originalRecordId: id, newRecordId: newRecord.id,
          fromType: 'review', toType: targetType,
          projectItemId: record.project_item_id, convertedBy: userId, note,
        })}::jsonb, NOW())`);

      console.log(`[PlanningLifecycle] Review record ${id} converted to ${targetType} record ${newRecord.id} by user ${userId}`);
      res.json({
        success: true, message: `Review record converted to ${targetType}`,
        originalRecordId: id, newRecord,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── Procurement Execution Record Lifecycle Routes ─────────────────────────

  app.get('/api/projects/:projectId/procurement-executions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT per.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as prepared_by_name, v.name as vendor_display_name
                      FROM procurement_execution_records per
                      LEFT JOIN users u1 ON per.assigned_to = u1.id
                      LEFT JOIN users u2 ON per.created_by = u2.id
                      LEFT JOIN users u3 ON per.prepared_by = u3.id
                      LEFT JOIN vendors v ON per.preferred_vendor_id = v.id
                      WHERE per.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND per.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND per.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY per.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/procurement-executions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');

      const result = await db.execute(
        sql`SELECT per.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as prepared_by_name, v.name as vendor_display_name
            FROM procurement_execution_records per
            LEFT JOIN users u1 ON per.assigned_to = u1.id
            LEFT JOIN users u2 ON per.created_by = u2.id
            LEFT JOIN users u3 ON per.prepared_by = u3.id
            LEFT JOIN vendors v ON per.preferred_vendor_id = v.id
            WHERE per.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/procurement-executions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_po') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for PO. Revert to under_preparation first.');
      }

      const { quantity, estimatedUnitCost, preferredVendorId, preferredVendorName, procurementNotes } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (quantity !== undefined) updates.quantity = String(quantity);
      if (estimatedUnitCost !== undefined) {
        updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
        const qty = quantity !== undefined ? parseFloat(String(quantity)) : parseFloat(record.quantity || '0');
        const uc = parseFloat(String(estimatedUnitCost));
        updates.estimatedTotalCost = uc > 0 && qty > 0 ? String(uc * qty) : null;
      }
      if (preferredVendorId !== undefined) updates.preferredVendorId = preferredVendorId || null;
      if (preferredVendorName !== undefined) updates.preferredVendorName = preferredVendorName || null;
      if (procurementNotes !== undefined) updates.procurementNotes = procurementNotes || null;

      await db.update(procurementExecutionRecords).set(updates).where(eq(procurementExecutionRecords.id, id));
      res.json({ success: true, message: 'Procurement execution record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/start-preparation', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: record is in '${record.status}' status. Only 'draft' records can start preparation.`);
      }

      await db.update(procurementExecutionRecords)
        .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), updatedAt: new Date() })
        .where(eq(procurementExecutionRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'procurement_execution.preparation_started', ${JSON.stringify({
          procurementExecId: id, projectItemId: record.project_item_id,
          planningRecordId: record.planning_record_id, startedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[ProcurementExec] Record ${id} preparation started by user ${userId}`);
      res.json({ success: true, message: 'Procurement preparation started', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/mark-ready', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: record is in '${record.status}' status. Only 'under_preparation' records can be marked ready.`);
      }

      const qty = parseFloat(record.quantity || '0');
      if (qty <= 0) {
        return sendBusinessError(res, 'Cannot mark ready: quantity must be greater than zero.');
      }

      await db.update(procurementExecutionRecords)
        .set({
          status: 'ready_for_po', preparationNote: preparationNote || null, updatedAt: new Date(),
        })
        .where(eq(procurementExecutionRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'procurement_execution.ready_for_po', ${JSON.stringify({
          procurementExecId: id, projectItemId: record.project_item_id,
          planningRecordId: record.planning_record_id, markedBy: userId,
          quantity: record.quantity, estimatedTotalCost: record.estimated_total_cost,
          preferredVendorName: record.preferred_vendor_name, preparationNote,
        })}::jsonb, NOW())`);

      let qualityPlanId: number | null = null;
      const existingQP = await db.execute(
        sql`SELECT id FROM quality_planning_records 
            WHERE procurement_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')`
      );
      if (existingQP.rows.length === 0) {
        const [qpRec] = await db.insert(qualityPlanningRecords).values({
          projectId: record.project_id,
          projectItemId: record.project_item_id,
          masterItemId: record.master_item_id,
          sourceContext: 'procurement',
          procurementExecId: id,
          planningRecordId: record.planning_record_id,
          itemCode: record.item_code || null,
          itemDescription: record.item_description || null,
          itemSpecification: record.item_specification || null,
          uom: record.uom || null,
          drawingNo: record.drawing_no || null,
          quantity: record.quantity,
          qualityRequirementType: 'incoming_inspection',
          status: 'draft',
          assignedTo: record.assigned_to,
          createdBy: userId,
        }).returning();
        qualityPlanId = qpRec.id;
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
          VALUES (${record.project_id}, 'quality_planning.created_from_procurement', ${JSON.stringify({
            qualityPlanId: qpRec.id, procurementExecId: id,
            projectItemId: record.project_item_id, qualityType: 'incoming_inspection', createdBy: userId,
          })}::jsonb, NOW())`);
        console.log(`[ProcurementExec] Created quality planning record ${qpRec.id} (incoming_inspection) from procurement exec ${id}`);
      } else {
        qualityPlanId = (existingQP.rows[0] as any).id;
      }

      let poPrepId: number | null = null;
      const existingPOPrep = await db.execute(
        sql`SELECT id FROM po_preparation_records 
            WHERE execution_record_id = ${id} AND status IN ('draft', 'under_review', 'ready_for_po_creation')`
      );
      if (existingPOPrep.rows.length === 0) {
        const [poPrepRec] = await db.insert(poPreparationRecords).values({
          projectId: record.project_id,
          projectItemId: record.project_item_id,
          planningRecordId: record.planning_record_id,
          executionRecordId: id,
          qualityPlanId: qualityPlanId,
          masterItemId: record.master_item_id,
          itemCode: record.item_code || null,
          itemDescription: record.item_description || null,
          itemSpecification: record.item_specification || null,
          uom: record.uom || null,
          drawingNo: record.drawing_no || null,
          quantity: record.quantity,
          estimatedUnitCost: record.estimated_unit_cost || null,
          estimatedTotalCost: record.estimated_total_cost || null,
          preferredVendorId: record.preferred_vendor_id || null,
          preferredVendorName: record.preferred_vendor_name || null,
          procurementNotes: record.procurement_notes || null,
          status: 'draft',
          assignedTo: record.assigned_to,
          createdBy: userId,
        }).returning();
        poPrepId = poPrepRec.id;
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
          VALUES (${record.project_id}, 'po_preparation.created', ${JSON.stringify({
            poPrepId: poPrepRec.id, executionRecordId: id, qualityPlanId,
            projectItemId: record.project_item_id, createdBy: userId,
          })}::jsonb, NOW())`);
        console.log(`[ProcurementExec] Created PO preparation record ${poPrepRec.id} from execution ${id}`);
      } else {
        poPrepId = (existingPOPrep.rows[0] as any).id;
      }

      console.log(`[ProcurementExec] Record ${id} marked ready for PO by user ${userId}`);
      res.json({ success: true, message: 'Procurement execution record marked ready for PO', id, newStatus: 'ready_for_po', qualityPlanId, poPrepId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/revert-to-preparation', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'ready_for_po') {
        return sendBusinessError(res, `Cannot revert: only 'ready_for_po' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.update(procurementExecutionRecords)
        .set({ status: 'under_preparation', preparationNote: null, updatedAt: new Date() })
        .where(eq(procurementExecutionRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'procurement_execution.reverted_to_preparation', ${JSON.stringify({
          procurementExecId: id, projectItemId: record.project_item_id, revertedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[ProcurementExec] Record ${id} reverted to preparation by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_preparation', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/cancel', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      await db.update(procurementExecutionRecords)
        .set({
          status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(),
          cancelReason, updatedAt: new Date(),
        })
        .where(eq(procurementExecutionRecords.id, id));

      const qpCascade = await db.execute(
        sql`UPDATE quality_planning_records 
            SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                cancel_reason = ${'Upstream procurement execution cancelled: ' + cancelReason}, updated_at = NOW()
            WHERE procurement_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')
            RETURNING id`
      );

      const poPrepCascade = await db.execute(
        sql`UPDATE po_preparation_records 
            SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                cancel_reason = ${'Upstream procurement execution cancelled: ' + cancelReason}, updated_at = NOW()
            WHERE execution_record_id = ${id} AND status IN ('draft', 'under_review', 'ready_for_po_creation')
            RETURNING id`
      );

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'procurement_execution.cancelled', ${JSON.stringify({
          procurementExecId: id, projectItemId: record.project_item_id,
          planningRecordId: record.planning_record_id, cancelledBy: userId, cancelReason,
          cascadedQualityPlanIds: qpCascade.rows.map((r: any) => r.id),
          cascadedPoPrepIds: poPrepCascade.rows.map((r: any) => r.id),
        })}::jsonb, NOW())`);

      console.log(`[ProcurementExec] Record ${id} cancelled by user ${userId}`);
      res.json({ success: true, message: 'Procurement execution record cancelled', id, newStatus: 'cancelled',
        cascadedQualityPlanIds: qpCascade.rows.map((r: any) => r.id),
        cascadedPoPrepIds: poPrepCascade.rows.map((r: any) => r.id),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── Production Execution Record Lifecycle Routes ──────────────────────────

  app.get('/api/projects/:projectId/production-executions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT per.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as prepared_by_name
                      FROM production_execution_records per
                      LEFT JOIN users u1 ON per.assigned_to = u1.id
                      LEFT JOIN users u2 ON per.created_by = u2.id
                      LEFT JOIN users u3 ON per.prepared_by = u3.id
                      WHERE per.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND per.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND per.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY per.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/production-executions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');

      const result = await db.execute(
        sql`SELECT per.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as prepared_by_name
            FROM production_execution_records per
            LEFT JOIN users u1 ON per.assigned_to = u1.id
            LEFT JOIN users u2 ON per.created_by = u2.id
            LEFT JOIN users u3 ON per.prepared_by = u3.id
            WHERE per.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/production-executions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_wo') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for WO. Revert to under_preparation first.');
      }

      const { quantity, estimatedUnitCost, drawingNo, drawingRevision, manufacturingNotes } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (quantity !== undefined) updates.quantity = String(quantity);
      if (estimatedUnitCost !== undefined) {
        updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
        const qty = quantity !== undefined ? parseFloat(String(quantity)) : parseFloat(record.quantity || '0');
        const uc = parseFloat(String(estimatedUnitCost));
        updates.estimatedTotalCost = uc > 0 && qty > 0 ? String(uc * qty) : null;
      }
      if (drawingNo !== undefined) updates.drawingNo = drawingNo || null;
      if (drawingRevision !== undefined) updates.drawingRevision = drawingRevision || null;
      if (manufacturingNotes !== undefined) updates.manufacturingNotes = manufacturingNotes || null;

      await db.update(productionExecutionRecords).set(updates).where(eq(productionExecutionRecords.id, id));
      res.json({ success: true, message: 'Production execution record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/start-preparation', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: record is in '${record.status}' status. Only 'draft' records can start preparation.`);
      }

      await db.update(productionExecutionRecords)
        .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), updatedAt: new Date() })
        .where(eq(productionExecutionRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'production_execution.preparation_started', ${JSON.stringify({
          productionExecId: id, projectItemId: record.project_item_id,
          planningRecordId: record.planning_record_id, startedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[ProductionExec] Record ${id} preparation started by user ${userId}`);
      res.json({ success: true, message: 'Production preparation started', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/mark-ready', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: record is in '${record.status}' status. Only 'under_preparation' records can be marked ready.`);
      }

      const qty = parseFloat(record.quantity || '0');
      if (qty <= 0) {
        return sendBusinessError(res, 'Cannot mark ready: quantity must be greater than zero.');
      }

      await db.update(productionExecutionRecords)
        .set({ status: 'ready_for_wo', preparationNote: preparationNote || null, updatedAt: new Date() })
        .where(eq(productionExecutionRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'production_execution.ready_for_wo', ${JSON.stringify({
          productionExecId: id, projectItemId: record.project_item_id,
          planningRecordId: record.planning_record_id, markedBy: userId,
          quantity: record.quantity, drawingNo: record.drawing_no,
          estimatedTotalCost: record.estimated_total_cost, preparationNote,
        })}::jsonb, NOW())`);

      let qualityPlanId: number | null = null;
      const existingQP = await db.execute(
        sql`SELECT id FROM quality_planning_records 
            WHERE production_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')`
      );
      if (existingQP.rows.length === 0) {
        const [qpRec] = await db.insert(qualityPlanningRecords).values({
          projectId: record.project_id,
          projectItemId: record.project_item_id,
          masterItemId: record.master_item_id,
          sourceContext: 'production',
          productionExecId: id,
          planningRecordId: record.planning_record_id,
          itemCode: record.item_code || null,
          itemDescription: record.item_description || null,
          itemSpecification: record.item_specification || null,
          uom: record.uom || null,
          drawingNo: record.drawing_no || null,
          drawingRevision: record.drawing_revision || null,
          quantity: record.quantity,
          qualityRequirementType: 'in_process_final_inspection',
          status: 'draft',
          assignedTo: record.assigned_to,
          createdBy: userId,
        }).returning();
        qualityPlanId = qpRec.id;
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
          VALUES (${record.project_id}, 'quality_planning.created_from_production', ${JSON.stringify({
            qualityPlanId: qpRec.id, productionExecId: id,
            projectItemId: record.project_item_id, qualityType: 'in_process_final_inspection', createdBy: userId,
          })}::jsonb, NOW())`);
        console.log(`[ProductionExec] Created quality planning record ${qpRec.id} (in_process_final_inspection) from production exec ${id}`);
      } else {
        qualityPlanId = (existingQP.rows[0] as any).id;
      }

      console.log(`[ProductionExec] Record ${id} marked ready for WO by user ${userId}`);
      res.json({ success: true, message: 'Production execution record marked ready for WO', id, newStatus: 'ready_for_wo', qualityPlanId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/revert-to-preparation', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'ready_for_wo') {
        return sendBusinessError(res, `Cannot revert: only 'ready_for_wo' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.update(productionExecutionRecords)
        .set({ status: 'under_preparation', preparationNote: null, updatedAt: new Date() })
        .where(eq(productionExecutionRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'production_execution.reverted_to_preparation', ${JSON.stringify({
          productionExecId: id, projectItemId: record.project_item_id, revertedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[ProductionExec] Record ${id} reverted to preparation by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_preparation', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/cancel', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      await db.update(productionExecutionRecords)
        .set({
          status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(),
          cancelReason, updatedAt: new Date(),
        })
        .where(eq(productionExecutionRecords.id, id));

      const qpCascade = await db.execute(
        sql`UPDATE quality_planning_records 
            SET status = 'cancelled', cancelled_by = ${userId}, cancelled_at = NOW(),
                cancel_reason = ${'Upstream production execution cancelled: ' + cancelReason}, updated_at = NOW()
            WHERE production_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')
            RETURNING id`
      );

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'production_execution.cancelled', ${JSON.stringify({
          productionExecId: id, projectItemId: record.project_item_id,
          planningRecordId: record.planning_record_id, cancelledBy: userId, cancelReason,
          cascadedQualityPlanIds: qpCascade.rows.map((r: any) => r.id),
        })}::jsonb, NOW())`);

      console.log(`[ProductionExec] Record ${id} cancelled by user ${userId}`);
      res.json({ success: true, message: 'Production execution record cancelled', id, newStatus: 'cancelled', cascadedQualityPlanIds: qpCascade.rows.map((r: any) => r.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── Quality Planning Record Lifecycle Routes ──────────────────────────────

  app.get('/api/projects/:projectId/quality-plans', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const sourceFilter = req.query.sourceContext as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT qp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as prepared_by_name
                      FROM quality_planning_records qp
                      LEFT JOIN users u1 ON qp.assigned_to = u1.id
                      LEFT JOIN users u2 ON qp.created_by = u2.id
                      LEFT JOIN users u3 ON qp.prepared_by = u3.id
                      WHERE qp.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND qp.status = ${statusFilter}`;
      if (sourceFilter) query = sql`${query} AND qp.source_context = ${sourceFilter}`;
      if (itemFilter) query = sql`${query} AND qp.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY qp.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/quality-plans/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');

      const result = await db.execute(
        sql`SELECT qp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as prepared_by_name
            FROM quality_planning_records qp
            LEFT JOIN users u1 ON qp.assigned_to = u1.id
            LEFT JOIN users u2 ON qp.created_by = u2.id
            LEFT JOIN users u3 ON qp.prepared_by = u3.id
            WHERE qp.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/quality-plans/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_inspection_setup') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for inspection setup. Revert to under_preparation first.');
      }

      const { qualityRequirementType, qualityNotes, quantity } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (qualityRequirementType !== undefined) updates.qualityRequirementType = qualityRequirementType;
      if (qualityNotes !== undefined) updates.qualityNotes = qualityNotes || null;
      if (quantity !== undefined) updates.quantity = String(quantity);

      await db.update(qualityPlanningRecords).set(updates).where(eq(qualityPlanningRecords.id, id));
      res.json({ success: true, message: 'Quality planning record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/start-preparation', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: record is in '${record.status}' status. Only 'draft' records can start preparation.`);
      }

      await db.update(qualityPlanningRecords)
        .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), updatedAt: new Date() })
        .where(eq(qualityPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'quality_planning.preparation_started', ${JSON.stringify({
          qualityPlanId: id, sourceContext: record.source_context,
          qualityRequirementType: record.quality_requirement_type,
          projectItemId: record.project_item_id, startedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[QualityPlan] Record ${id} preparation started by user ${userId}`);
      res.json({ success: true, message: 'Quality preparation started', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/mark-ready', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: record is in '${record.status}' status. Only 'under_preparation' records can be marked ready.`);
      }

      await db.update(qualityPlanningRecords)
        .set({ status: 'ready_for_inspection_setup', preparationNote: preparationNote || null, updatedAt: new Date() })
        .where(eq(qualityPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'quality_planning.ready_for_inspection_setup', ${JSON.stringify({
          qualityPlanId: id, sourceContext: record.source_context,
          qualityRequirementType: record.quality_requirement_type,
          projectItemId: record.project_item_id, markedBy: userId, preparationNote,
        })}::jsonb, NOW())`);

      console.log(`[QualityPlan] Record ${id} marked ready for inspection setup by user ${userId}`);
      res.json({ success: true, message: 'Quality planning record marked ready for inspection setup', id, newStatus: 'ready_for_inspection_setup' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/revert-to-preparation', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'ready_for_inspection_setup') {
        return sendBusinessError(res, `Cannot revert: only 'ready_for_inspection_setup' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.update(qualityPlanningRecords)
        .set({ status: 'under_preparation', preparationNote: null, updatedAt: new Date() })
        .where(eq(qualityPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'quality_planning.reverted_to_preparation', ${JSON.stringify({
          qualityPlanId: id, projectItemId: record.project_item_id, revertedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[QualityPlan] Record ${id} reverted to preparation by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_preparation', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/cancel', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      await db.update(qualityPlanningRecords)
        .set({
          status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(),
          cancelReason, updatedAt: new Date(),
        })
        .where(eq(qualityPlanningRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'quality_planning.cancelled', ${JSON.stringify({
          qualityPlanId: id, sourceContext: record.source_context,
          projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
        })}::jsonb, NOW())`);

      console.log(`[QualityPlan] Record ${id} cancelled by user ${userId}`);
      res.json({ success: true, message: 'Quality planning record cancelled', id, newStatus: 'cancelled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── PO Preparation Record Lifecycle Routes ──────────────────────────────

  app.get('/api/projects/:projectId/po-preparations', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT pp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as reviewed_by_name, u4.username as ready_by_name
                      FROM po_preparation_records pp
                      LEFT JOIN users u1 ON pp.assigned_to = u1.id
                      LEFT JOIN users u2 ON pp.created_by = u2.id
                      LEFT JOIN users u3 ON pp.reviewed_by = u3.id
                      LEFT JOIN users u4 ON pp.ready_by = u4.id
                      WHERE pp.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND pp.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND pp.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY pp.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/po-preparations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');

      const result = await db.execute(
        sql`SELECT pp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as reviewed_by_name, u4.username as ready_by_name
            FROM po_preparation_records pp
            LEFT JOIN users u1 ON pp.assigned_to = u1.id
            LEFT JOIN users u2 ON pp.created_by = u2.id
            LEFT JOIN users u3 ON pp.reviewed_by = u3.id
            LEFT JOIN users u4 ON pp.ready_by = u4.id
            WHERE pp.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/po-preparations/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_po_creation') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for PO creation. Revert to under_review first.');
      }

      const { quantity, estimatedUnitCost, estimatedTotalCost, preferredVendorId,
              preferredVendorName, procurementNotes, reviewNotes } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (quantity !== undefined) updates.quantity = String(quantity);
      if (estimatedUnitCost !== undefined) updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
      if (estimatedTotalCost !== undefined) updates.estimatedTotalCost = estimatedTotalCost ? String(estimatedTotalCost) : null;
      if (preferredVendorId !== undefined) updates.preferredVendorId = preferredVendorId || null;
      if (preferredVendorName !== undefined) updates.preferredVendorName = preferredVendorName || null;
      if (procurementNotes !== undefined) updates.procurementNotes = procurementNotes || null;
      if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes || null;

      await db.update(poPreparationRecords).set(updates).where(eq(poPreparationRecords.id, id));
      res.json({ success: true, message: 'PO preparation record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/submit-for-review', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit for review: record is in '${record.status}' status. Only 'draft' records can be submitted.`);
      }

      await db.update(poPreparationRecords)
        .set({ status: 'under_review', updatedAt: new Date() })
        .where(eq(poPreparationRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'po_preparation.submitted_for_review', ${JSON.stringify({
          poPrepId: id, executionRecordId: record.execution_record_id,
          projectItemId: record.project_item_id, submittedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[POPrep] Record ${id} submitted for review by user ${userId}`);
      res.json({ success: true, message: 'PO preparation submitted for review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;
      const { reviewNotes } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot approve: record is in '${record.status}' status. Only 'under_review' records can be approved.`);
      }

      await db.update(poPreparationRecords)
        .set({
          status: 'ready_for_po_creation', reviewedBy: userId, reviewedAt: new Date(),
          readyBy: userId, readyAt: new Date(),
          reviewNotes: reviewNotes || null, updatedAt: new Date(),
        })
        .where(eq(poPreparationRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'po_preparation.ready_for_po_creation', ${JSON.stringify({
          poPrepId: id, executionRecordId: record.execution_record_id,
          projectItemId: record.project_item_id, approvedBy: userId, reviewNotes,
        })}::jsonb, NOW())`);

      console.log(`[POPrep] Record ${id} approved and ready for PO creation by user ${userId}`);
      res.json({ success: true, message: 'PO preparation approved — ready for PO creation', id, newStatus: 'ready_for_po_creation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/revert-to-draft', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot revert to draft: only 'under_review' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.update(poPreparationRecords)
        .set({ status: 'draft', reviewedBy: null, reviewedAt: null, reviewNotes: null, updatedAt: new Date() })
        .where(eq(poPreparationRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'po_preparation.reverted_to_draft', ${JSON.stringify({
          poPrepId: id, projectItemId: record.project_item_id, revertedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[POPrep] Record ${id} reverted to draft by user ${userId}`);
      res.json({ success: true, message: 'Reverted to draft', id, newStatus: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/revert-to-review', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'ready_for_po_creation') {
        return sendBusinessError(res, `Cannot revert to review: only 'ready_for_po_creation' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.update(poPreparationRecords)
        .set({ status: 'under_review', readyBy: null, readyAt: null, updatedAt: new Date() })
        .where(eq(poPreparationRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'po_preparation.reverted_to_review', ${JSON.stringify({
          poPrepId: id, projectItemId: record.project_item_id, revertedBy: userId,
        })}::jsonb, NOW())`);

      console.log(`[POPrep] Record ${id} reverted to under_review by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/cancel', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'cancelled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      await db.update(poPreparationRecords)
        .set({
          status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(),
          cancelReason, updatedAt: new Date(),
        })
        .where(eq(poPreparationRecords.id, id));

      await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, payload, created_at)
        VALUES (${record.project_id}, 'po_preparation.cancelled', ${JSON.stringify({
          poPrepId: id, executionRecordId: record.execution_record_id,
          projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
        })}::jsonb, NOW())`);

      console.log(`[POPrep] Record ${id} cancelled by user ${userId}`);
      res.json({ success: true, message: 'PO preparation record cancelled', id, newStatus: 'cancelled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Master Items routes moved to server/routes.ts to avoid conflicts
  // The main routes file has the complete implementation with project filtering support
}