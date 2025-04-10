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
  insertMasterItemSchema
} from '@shared/schema';
import { canManage } from '@shared/roles';

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
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });
  
  // Get next project number for a financial year
  app.get('/api/projects/next-code/:financialYear', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const financialYear = req.params.financialYear;
      
      // Format the financial year for the code: "2526" for FY 2025-2026
      let yearCode: string;
      
      if (financialYear.startsWith('FY')) {
        // Extract year digits from FY format: FY25-26 -> 2526
        const matches = financialYear.match(/FY(\d{2})-(\d{2})/);
        if (matches && matches.length === 3) {
          yearCode = matches[1] + matches[2];
        } else {
          return res.status(400).json({ error: 'Invalid financial year format' });
        }
      } else {
        // If direct format like 2025-2026, extract last two digits of each year
        const matches = financialYear.match(/(\d{4})-(\d{4})/);
        if (matches && matches.length === 3) {
          yearCode = matches[1].slice(-2) + matches[2].slice(-2);
        } else {
          return res.status(400).json({ error: 'Invalid financial year format' });
        }
      }
      
      // Get all projects and filter by those starting with the year code
      const userId = req.user!.id;
      const allProjects = await storage.getUserProjects(userId);
      
      // Find projects with codes that match our pattern (e.g., "2526-1", "2526-2", etc.)
      const regex = new RegExp(`^${yearCode}-(\\d+)$`);
      const matchingProjects = allProjects.filter(project => regex.test(project.code));
      
      // Find the highest number used so far
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
      
      // The next number is one more than the highest
      const nextNumber = highestNumber + 1;
      const nextCode = `${yearCode}-${nextNumber}`;
      
      res.json({ nextCode });
    } catch (error) {
      console.error('Error generating next project code:', error);
      res.status(500).json({ error: 'Failed to generate next project code' });
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
        // Otherwise it might be a project code (like "2526-1")
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

  app.post('/api/projects', ensureAuthenticated, async (req: Request, res: Response) => {
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
      
      // Create default phases
      const phaseNames = ['Design', 'Procurement', 'Manufacturing', 'Quality'];
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
      
      const updatedProject = await storage.updateProject(projectId, updateData);
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
      res.status(500).json({ error: 'Failed to fetch project phases' });
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
      res.status(500).json({ error: 'Failed to fetch phase details' });
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
      res.status(500).json({ error: 'Failed to fetch project members' });
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
      res.status(500).json({ error: 'Failed to remove project member' });
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
      res.status(500).json({ error: 'Failed to fetch phase deliverables' });
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
      res.status(500).json({ error: 'Failed to fetch deliverable details' });
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
      res.status(500).json({ error: 'Failed to fetch project tasks' });
    }
  });

  app.get('/api/phases/:phaseId/tasks', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const tasks = await storage.getPhaseProjectTasks(phaseId);
      res.json(tasks);
    } catch (error) {
      console.error(`Error fetching tasks for phase ${req.params.phaseId}:`, error);
      res.status(500).json({ error: 'Failed to fetch phase tasks' });
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
      res.status(500).json({ error: 'Failed to fetch phase approvals' });
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

  // Project Documents Routes
  app.get('/api/projects/:projectId/documents', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documents = await storage.getProjectDocuments(projectId);
      res.json(documents);
    } catch (error) {
      console.error(`Error fetching documents for project ${req.params.projectId}:`, error);
      res.status(500).json({ error: 'Failed to fetch project documents' });
    }
  });

  app.get('/api/phases/:phaseId/documents', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const documents = await storage.getPhaseDocuments(phaseId);
      res.json(documents);
    } catch (error) {
      console.error(`Error fetching documents for phase ${req.params.phaseId}:`, error);
      res.status(500).json({ error: 'Failed to fetch phase documents' });
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
      res.status(500).json({ error: 'Failed to fetch project items' });
    }
  });

  app.get('/api/projects/code/:projectCode/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectCode = req.params.projectCode;
      const items = await storage.getProjectItemsByCode(projectCode);
      res.json(items);
    } catch (error) {
      console.error(`Error fetching items for project code ${req.params.projectCode}:`, error);
      res.status(500).json({ error: 'Failed to fetch project items by code' });
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
      res.status(500).json({ error: 'Failed to fetch project item' });
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
      
      // If itemCode is provided, we need to update the master item
      if (itemCode) {
        try {
          // First, get the master item associated with this project item
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
      
      // Return the full updated item with master item data
      const fullUpdatedItem = await storage.getProjectItem(itemId);
      console.log(`Returning full updated item:`, fullUpdatedItem);
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
      
      // Check if item exists
      const item = await storage.getProjectItem(itemId);
      if (!item) {
        return res.status(404).json({ error: 'Project item not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(item.projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'project_manager' || canManage(req.user!.role, 'Manager'))
      );
      
      if (!userMember) {
        return res.status(403).json({ error: 'Not authorized to delete this project item' });
      }
      
      await storage.deleteProjectItem(itemId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting project item ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to delete project item' });
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
      res.status(500).json({ error: 'Failed to delete project items' });
    }
  });

  // Customer Management Routes
  app.get('/api/customers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
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
      res.status(500).json({ error: 'Failed to fetch customer details' });
    }
  });

  app.post('/api/customers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if the user has permission to create customers
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to create customers' });
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
      res.status(201).json(customer);
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(400).json({ error: 'Failed to create customer', details: error.message });
    }
  });

  app.put('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      
      // Check if the user has permission to update customers
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update customers' });
      }
      
      // Check if customer exists
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
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
      res.json(updatedCustomer);
    } catch (error) {
      console.error(`Error updating customer ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update customer', details: error.message });
    }
  });

  app.delete('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      
      // Check if the user has permission to delete customers
      if (!canManage(req.user!.role, 'Senior Manager')) {
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
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });

  // Master Items Routes
  app.get('/api/master-items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if the user has permission to view master items
      if (!canManage(req.user!.role, 'Employee')) {
        return res.status(403).json({ error: 'Not authorized to view master items' });
      }
      
      const items = await storage.getAllMasterItems();
      res.json(items);
    } catch (error) {
      console.error('Error fetching master items:', error);
      res.status(500).json({ error: 'Failed to fetch master items' });
    }
  });

  app.get('/api/master-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Check if the user has permission to view master items
      if (!canManage(req.user!.role, 'Employee')) {
        return res.status(403).json({ error: 'Not authorized to view master items' });
      }
      
      const item = await storage.getMasterItem(itemId);
      if (!item) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error(`Error fetching master item ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to fetch master item details' });
    }
  });

  app.post('/api/master-items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if the user has permission to create master items
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to create master items' });
      }
      
      const itemData = insertMasterItemSchema.parse({
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Check if item code already exists
      const existingItem = await storage.getMasterItemByCode(itemData.itemCode);
      if (existingItem) {
        return res.status(400).json({ error: 'Item code already exists' });
      }
      
      const item = await storage.createMasterItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error('Error creating master item:', error);
      res.status(400).json({ 
        error: 'Failed to create master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put('/api/master-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Check if the user has permission to update master items
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update master items' });
      }
      
      // Check if the item exists
      const existingItem = await storage.getMasterItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      // Check if item code is being changed and already exists
      if (req.body.itemCode && req.body.itemCode !== existingItem.itemCode) {
        const itemWithSameCode = await storage.getMasterItemByCode(req.body.itemCode);
        if (itemWithSameCode && itemWithSameCode.id !== itemId) {
          return res.status(400).json({ error: 'Item code already exists' });
        }
      }
      
      // Update the item
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };
      
      const updatedItem = await storage.updateMasterItem(itemId, updateData);
      res.json(updatedItem);
    } catch (error) {
      console.error(`Error updating master item ${req.params.id}:`, error);
      res.status(400).json({ 
        error: 'Failed to update master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/master-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Check if the user has permission to delete master items
      if (!canManage(req.user!.role, 'Senior Manager')) {
        return res.status(403).json({ error: 'Not authorized to delete master items' });
      }
      
      // Check if the item exists
      const existingItem = await storage.getMasterItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      // Check if the item is used in any project
      const projectItems = await storage.getProjectItemsByMasterId(itemId);
      if (projectItems && projectItems.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete master item with associated project items',
          details: `Item is used in ${projectItems.length} project(s)`
        });
      }
      
      await storage.deleteMasterItem(itemId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting master item ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to delete master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}