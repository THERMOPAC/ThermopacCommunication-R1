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
  projectWorkflowEvents
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

  // Master Items routes moved to server/routes.ts to avoid conflicts
  // The main routes file has the complete implementation with project filtering support
}