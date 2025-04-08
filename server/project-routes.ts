import express, { Request, Response } from 'express';
import { storage } from './storage';
import { 
  insertProjectSchema, 
  insertProjectPhaseSchema,
  insertProjectMemberSchema,
  insertDeliverableSchema,
  insertProjectTaskSchema,
  insertPhaseApprovalSchema,
  insertProjectDocumentSchema 
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

  app.get('/api/projects/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(project);
    } catch (error) {
      console.error(`Error fetching project ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to fetch project details' });
    }
  });

  app.post('/api/projects', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const projectData = insertProjectSchema.parse({
        ...req.body,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Create the project
      const project = await storage.createProject(projectData);
      
      // Add creator as a project manager
      await storage.addProjectMember({
        projectId: project.id,
        userId,
        role: 'project_manager',
        assignedDate: new Date().toISOString(),
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
          phaseNumber: i + 1,
          startDate: phaseStartDate.toISOString().split('T')[0],
          targetEndDate: phaseEndDate.toISOString().split('T')[0],
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
      const updateData = {
        ...req.body,
        updatedAt: new Date().toISOString()
      };
      
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
      const projectId = parseInt(req.params.projectId);
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
        updatedAt: new Date().toISOString()
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
        assignedDate: new Date().toISOString()
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
        updatedAt: new Date().toISOString()
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
        requestedAt: new Date().toISOString()
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
        respondedAt: req.body.status !== 'pending' ? new Date().toISOString() : undefined
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
            actualEndDate: new Date().toISOString().split('T')[0]
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
        uploadedAt: new Date().toISOString()
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
}