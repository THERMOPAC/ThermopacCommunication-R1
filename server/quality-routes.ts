import { Request, Response } from "express";
import { eq, asc, desc, and } from "drizzle-orm";
import { db } from "./db";
import { 
  qapTemplates, 
  generatedQaps, 
  qapVersions, 
  projects, 
  users,
  insertQapTemplateSchema,
  insertGeneratedQapSchema,
  insertQapVersionSchema,
  // ITP related imports
  itpTemplates,
  itps,
  itpVersions,
  itpActivities,
  insertItpTemplateSchema,
  insertItpSchema,
  insertItpVersionSchema,
  insertItpActivitySchema
} from "../shared/schema";
import { z } from "zod";
import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define missing update schemas
const updateItpTemplateSchema = insertItpTemplateSchema
  .partial()
  .required({ name: true });

const updateItpSchema = insertItpSchema
  .partial()
  .required({ title: true });

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'You must be logged in to access this resource' });
}

// Helper function to check if user has quality management permissions
const canManageQuality = (role: string) => {
  return ['Superuser', 'Admin', 'Manager', 'Senior Manager'].includes(role);
};

export const setupQualityRoutes = (app: any) => {
  // ==================== QAP TEMPLATES ====================

  // Get all QAP templates
  app.get('/api/quality/qap-templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templates = await db.query.qapTemplates.findMany({
        orderBy: [asc(qapTemplates.name)],
        with: {
          creator: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
      });

      res.status(200).json(templates);
    } catch (error) {
      console.error('Error fetching QAP templates:', error);
      res.status(500).json({ error: 'Failed to fetch QAP templates' });
    }
  });

  // Get a single QAP template by ID
  // ==================== ITP TEMPLATES ====================
  
  // Get all ITP templates
  app.get('/api/quality/itp-templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has permission to manage ITPs
      if (!canManageQuality(req.user!.role) && req.user!.role !== 'Employee') {
        return res.status(403).json({ error: 'You do not have permission to view ITP templates' });
      }
      
      const templates = await db.query.itpTemplates.findMany({
        with: {
          creator: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: [desc(itpTemplates.updatedAt)],
      });
      
      res.status(200).json(templates);
    } catch (error) {
      console.error('Error fetching ITP templates:', error);
      res.status(500).json({ error: 'Failed to fetch ITP templates' });
    }
  });
  
  // Create a new ITP template
  app.post('/api/quality/itp-templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has permission to create ITP templates
      if (!canManageQuality(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to create ITP templates' });
      }
      
      // Validate request body
      const validationResult = insertItpTemplateSchema.safeParse({
        ...req.body,
        createdBy: req.user!.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid template data', details: validationResult.error });
      }
      
      // Create template
      const [newTemplate] = await db.insert(itpTemplates).values({
        ...validationResult.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      res.status(201).json(newTemplate);
    } catch (error) {
      console.error('Error creating ITP template:', error);
      res.status(500).json({ error: 'Failed to create ITP template' });
    }
  });
  
  // Get a single ITP template by ID
  app.get('/api/quality/itp-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      
      // Check if user has permission to view ITP templates
      if (!canManageQuality(req.user!.role) && req.user!.role !== 'Employee') {
        return res.status(403).json({ error: 'You do not have permission to view ITP templates' });
      }
      
      const template = await db.query.itpTemplates.findFirst({
        where: eq(itpTemplates.id, templateId),
        with: {
          creator: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
      });
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.status(200).json(template);
    } catch (error) {
      console.error('Error fetching ITP template:', error);
      res.status(500).json({ error: 'Failed to fetch ITP template' });
    }
  });
  
  // Update an ITP template
  app.put('/api/quality/itp-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      
      // Check if template exists
      const existingTemplate = await db.query.itpTemplates.findFirst({
        where: eq(itpTemplates.id, templateId),
      });
      
      if (!existingTemplate) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Check if user has permission to update templates
      const isCreator = existingTemplate.createdBy === req.user!.id;
      if (!canManageQuality(req.user!.role) && !isCreator) {
        return res.status(403).json({ error: 'You do not have permission to update this template' });
      }
      
      // Validate request body
      const validationResult = updateItpTemplateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid template data', details: validationResult.error });
      }
      
      // Update template
      const [updatedTemplate] = await db.update(itpTemplates)
        .set({
          ...validationResult.data,
          updatedAt: new Date(),
        })
        .where(eq(itpTemplates.id, templateId))
        .returning();
      
      res.status(200).json(updatedTemplate);
    } catch (error) {
      console.error('Error updating ITP template:', error);
      res.status(500).json({ error: 'Failed to update ITP template' });
    }
  });
  
  // Delete an ITP template
  app.delete('/api/quality/itp-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      
      // Check if template exists
      const existingTemplate = await db.query.itpTemplates.findFirst({
        where: eq(itpTemplates.id, templateId),
      });
      
      if (!existingTemplate) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Check if user has permission to delete templates
      if (req.user!.role !== 'Superuser') {
        return res.status(403).json({ error: 'You do not have permission to delete templates' });
      }
      
      // Delete template
      await db.delete(itpTemplates).where(eq(itpTemplates.id, templateId));
      
      res.status(200).json({ message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Error deleting ITP template:', error);
      res.status(500).json({ error: 'Failed to delete ITP template' });
    }
  });
  
  // ==================== QAP TEMPLATES ====================
  
  app.get('/api/quality/qap-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);

      if (isNaN(templateId)) {
        return res.status(400).json({ error: 'Invalid template ID' });
      }

      const template = await db.query.qapTemplates.findFirst({
        where: eq(qapTemplates.id, templateId),
        with: {
          creator: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
      });

      if (!template) {
        return res.status(404).json({ error: 'QAP template not found' });
      }

      res.status(200).json(template);
    } catch (error) {
      console.error('Error fetching QAP template:', error);
      res.status(500).json({ error: 'Failed to fetch QAP template' });
    }
  });

  // Create a new QAP template
  app.post('/api/quality/qap-templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has permission to create templates
      if (!canManageQuality(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to create QAP templates' });
      }

      // Validate request body
      const validationResult = insertQapTemplateSchema.safeParse({
        ...req.body,
        createdBy: req.user!.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid template data', details: validationResult.error });
      }

      // Create template
      const [newTemplate] = await db.insert(qapTemplates).values({
        ...validationResult.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.status(201).json(newTemplate);
    } catch (error) {
      console.error('Error creating QAP template:', error);
      res.status(500).json({ error: 'Failed to create QAP template' });
    }
  });

  // Update a QAP template
  app.put('/api/quality/qap-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);

      // Check if user has permission to update templates
      if (!canManageQuality(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update QAP templates' });
      }

      // Check if template exists
      const existingTemplate = await db.query.qapTemplates.findFirst({
        where: eq(qapTemplates.id, templateId),
      });

      if (!existingTemplate) {
        return res.status(404).json({ error: 'QAP template not found' });
      }

      // Validate request body
      const validationResult = insertQapTemplateSchema.safeParse({
        ...req.body,
        createdBy: existingTemplate.createdBy, // Preserve original creator
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid template data', details: validationResult.error });
      }

      // Update template
      const [updatedTemplate] = await db.update(qapTemplates)
        .set({
          ...validationResult.data,
          updatedAt: new Date(),
        })
        .where(eq(qapTemplates.id, templateId))
        .returning();

      res.status(200).json(updatedTemplate);
    } catch (error) {
      console.error('Error updating QAP template:', error);
      res.status(500).json({ error: 'Failed to update QAP template' });
    }
  });

  // Delete a QAP template
  app.delete('/api/quality/qap-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);

      // Check if user has permission to delete templates
      if (req.user!.role !== 'Superuser') {
        return res.status(403).json({ error: 'You do not have permission to delete QAP templates' });
      }

      // Check if template exists
      const existingTemplate = await db.query.qapTemplates.findFirst({
        where: eq(qapTemplates.id, templateId),
      });

      if (!existingTemplate) {
        return res.status(404).json({ error: 'QAP template not found' });
      }

      // Check if template is used by any generated QAPs
      const usedQaps = await db.query.generatedQaps.findMany({
        where: eq(generatedQaps.templateId, templateId),
        limit: 1,
      });

      if (usedQaps.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete template that is in use', 
          message: 'This template is currently used by existing QAP documents. Please remove those documents first or update them to use a different template.' 
        });
      }

      // Delete template
      await db.delete(qapTemplates).where(eq(qapTemplates.id, templateId));

      res.status(200).json({ message: 'QAP template deleted successfully' });
    } catch (error) {
      console.error('Error deleting QAP template:', error);
      res.status(500).json({ error: 'Failed to delete QAP template' });
    }
  });

  // ==================== GENERATED QAPs ====================
  
  // Get all generated QAPs
  app.get('/api/quality/generated-qaps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Allow filtering by project
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      
      let whereClause;
      if (projectId && !isNaN(projectId)) {
        whereClause = eq(generatedQaps.projectId, projectId);
      }

      const qaps = await db.query.generatedQaps.findMany({
        where: whereClause,
        orderBy: [desc(generatedQaps.updatedAt)],
        with: {
          project: true,
          template: {
            columns: {
              id: true,
              name: true,
              version: true,
            },
          },
          preparedByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
          approvedByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
      });

      res.status(200).json(qaps);
    } catch (error) {
      console.error('Error fetching generated QAPs:', error);
      res.status(500).json({ error: 'Failed to fetch generated QAPs' });
    }
  });

  // Get a single generated QAP by ID
  app.get('/api/quality/generated-qaps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log(`Getting QAP with ID: ${req.params.id}`);
      const qapId = parseInt(req.params.id);

      if (isNaN(qapId)) {
        console.error(`Invalid QAP ID format: ${req.params.id}`);
        return res.status(400).json({ error: 'Invalid QAP ID' });
      }

      // Get QAP with all relations
      const qap = await db.query.generatedQaps.findFirst({
        where: eq(generatedQaps.id, qapId),
        with: {
          project: true,
          template: true,
          preparedByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
          approvedByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
          versions: {
            orderBy: [desc(qapVersions.version)],
          },
        },
      });

      if (!qap) {
        console.error(`QAP with ID ${qapId} not found`);
        return res.status(404).json({ error: 'QAP not found' });
      }

      // Validate that crucial relationships are present
      if (!qap.project) {
        console.error(`QAP with ID ${qapId} has missing project reference`);
        
        // Attempt to get the project separately
        const project = qap.projectId ? 
          await db.query.projects.findFirst({
            where: eq(projects.id, qap.projectId),
          }) : null;
          
        if (project) {
          // Manually attach the project
          console.log(`Retrieved project ${project.id} separately and attaching to QAP ${qapId}`);
          qap.project = project;
        } else {
          return res.status(500).json({ 
            error: 'QAP data is incomplete (missing project data)', 
            qapId: qap.id,
            projectId: qap.projectId 
          });
        }
      }

      // Log QAP basic info
      console.log(`Successfully retrieved QAP ${qapId}`, {
        id: qap.id,
        projectId: qap.projectId,
        title: qap.title,
        status: qap.status,
        hasProject: !!qap.project,
        projectInfo: qap.project ? `${qap.project.code} - ${qap.project.name}` : 'MISSING'
      });

      res.status(200).json(qap);
    } catch (error) {
      console.error('Error fetching QAP:', error);
      res.status(500).json({ error: 'Failed to fetch QAP' });
    }
  });

  // Create a new generated QAP
  app.post('/api/quality/generated-qaps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has permission to create QAPs
      if (!canManageQuality(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to create QAPs' });
      }

      // Validate request body
      const validationResult = insertGeneratedQapSchema.safeParse({
        ...req.body,
        preparedBy: req.user!.id,
        status: 'draft',
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid QAP data', details: validationResult.error });
      }

      // Create QAP
      const [newQap] = await db.insert(generatedQaps).values({
        ...validationResult.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Create initial version
      await db.insert(qapVersions).values({
        qapId: newQap.id,
        version: 1,
        content: newQap.content,
        revision: newQap.revision || "0", // Use the QAP revision or default to "0"
        createdBy: req.user!.id,
        createdAt: new Date(),
      });

      res.status(201).json(newQap);
    } catch (error) {
      console.error('Error creating QAP:', error);
      res.status(500).json({ error: 'Failed to create QAP' });
    }
  });

  // Update a generated QAP
  app.put('/api/quality/generated-qaps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const qapId = parseInt(req.params.id);

      // Check if QAP exists
      const existingQap = await db.query.generatedQaps.findFirst({
        where: eq(generatedQaps.id, qapId),
      });

      if (!existingQap) {
        return res.status(404).json({ error: 'QAP not found' });
      }

      // Check permissions
      if (!canManageQuality(req.user!.role) && existingQap.preparedBy !== req.user!.id) {
        return res.status(403).json({ error: 'You do not have permission to update this QAP' });
      }

      // Don't allow changes to approved QAPs but allow changes to 'in-review' QAPs
      if (existingQap.status === 'approved' && req.user!.role !== 'Superuser') {
        return res.status(400).json({ error: 'Cannot update an approved QAP. Please create a new revision.' });
      }
      
      // Log the status for debugging
      console.log(`Updating QAP ${qapId} with current status: ${existingQap.status}`);
      

      // Validate request body
      const validationResult = insertGeneratedQapSchema.partial().safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid QAP data', details: validationResult.error });
      }

      // Handle status changes
      if (req.body.status === 'approved' && existingQap.status !== 'approved') {
        // Only specific roles can approve
        if (!['Superuser', 'Senior Manager', 'Manager'].includes(req.user!.role)) {
          return res.status(403).json({ error: 'You do not have permission to approve QAPs' });
        }
        validationResult.data.approvedBy = req.user!.id;
        validationResult.data.approvedDate = new Date();
      }

      // Check for content changes to create a new version
      const contentChanged = req.body.content && req.body.content !== existingQap.content;
      
      // Only create a new version if content changed and not just status
      if (contentChanged) {
        // Get highest version number
        const latestVersion = await db.query.qapVersions.findFirst({
          where: eq(qapVersions.qapId, qapId),
          orderBy: [desc(qapVersions.version)],
        });

        const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1;

        // Create new version record
        await db.insert(qapVersions).values({
          qapId: qapId,
          version: newVersionNumber,
          content: req.body.content,
          revision: req.body.revision || existingQap.revision || "0", // Use provided revision, existing one, or default
          createdBy: req.user!.id,
          createdAt: new Date(),
        });
      }

      // Update QAP
      const [updatedQap] = await db.update(generatedQaps)
        .set({
          ...validationResult.data,
          updatedAt: new Date(),
        })
        .where(eq(generatedQaps.id, qapId))
        .returning();

      res.status(200).json(updatedQap);
    } catch (error) {
      console.error('Error updating QAP:', error);
      res.status(500).json({ error: 'Failed to update QAP' });
    }
  });

  // Update only the status of a QAP (PATCH endpoint)
  app.patch('/api/quality/generated-qaps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const qapId = parseInt(req.params.id);
      
      // Check if QAP exists
      const existingQap = await db.query.generatedQaps.findFirst({
        where: eq(generatedQaps.id, qapId),
      });

      if (!existingQap) {
        return res.status(404).json({ error: 'QAP not found' });
      }

      // Only allow status updates via PATCH
      if (!req.body.status) {
        return res.status(400).json({ error: 'Status field is required for PATCH updates' });
      }

      // Validate the status value
      if (!['draft', 'in-review', 'approved', 'rejected'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      // Check permissions for status updates
      if (req.body.status === 'approved') {
        // Only specific roles can approve
        if (!['Superuser', 'Senior Manager', 'Manager'].includes(req.user!.role)) {
          return res.status(403).json({ error: 'You do not have permission to approve QAPs' });
        }
      }

      // Don't allow changes to approved QAPs unless you're a Superuser
      if (existingQap.status === 'approved' && req.user!.role !== 'Superuser') {
        return res.status(400).json({ error: 'Cannot update an approved QAP unless you are a Superuser.' });
      }

      // Update fields when status changes to approved
      const updateData: any = {
        status: req.body.status,
        updatedAt: new Date(),
      };

      // Set approver data when approving
      if (req.body.status === 'approved' && existingQap.status !== 'approved') {
        updateData.approvedBy = req.user!.id;
        updateData.approvedDate = new Date();
      }

      // Update QAP with status change
      const [updatedQap] = await db.update(generatedQaps)
        .set(updateData)
        .where(eq(generatedQaps.id, qapId))
        .returning();

      console.log(`Updated QAP ${qapId} status to ${req.body.status}`);
      res.status(200).json(updatedQap);
    } catch (error) {
      console.error('Error updating QAP status:', error);
      res.status(500).json({ error: 'Failed to update QAP status' });
    }
  });

  // Delete a generated QAP
  app.delete('/api/quality/generated-qaps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const qapId = parseInt(req.params.id);

      // Check if QAP exists
      const existingQap = await db.query.generatedQaps.findFirst({
        where: eq(generatedQaps.id, qapId),
      });

      if (!existingQap) {
        return res.status(404).json({ error: 'QAP not found' });
      }

      // Check permissions - only Superuser can delete
      if (req.user!.role !== 'Superuser') {
        return res.status(403).json({ error: 'You do not have permission to delete QAPs' });
      }

      // Delete QAP and all versions (cascade delete should handle this)
      await db.delete(generatedQaps).where(eq(generatedQaps.id, qapId));

      res.status(200).json({ message: 'QAP deleted successfully' });
    } catch (error) {
      console.error('Error deleting QAP:', error);
      res.status(500).json({ error: 'Failed to delete QAP' });
    }
  });

  // Export QAP to HTML/PDF
  app.get('/api/quality/generated-qaps/:id/export', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const qapId = parseInt(req.params.id);

      if (isNaN(qapId)) {
        return res.status(400).json({ error: 'Invalid QAP ID' });
      }

      const qap = await db.query.generatedQaps.findFirst({
        where: eq(generatedQaps.id, qapId),
        with: {
          project: true,
          template: true,
          preparedByUser: {
            columns: {
              id: true,
              username: true,
              email: true,
            },
          },
          approvedByUser: {
            columns: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });

      if (!qap) {
        return res.status(404).json({ error: 'QAP not found' });
      }

      // Process the content
      let content = qap.content;

      // Add general metadata replacements
      const replacements: Record<string, string> = {
        '{{title}}': qap.title,
        '{{projectName}}': qap.project?.name || '',
        '{{projectNumber}}': qap.project?.projectCode || '',
        '{{client}}': qap.clientName || '',
        '{{preparedBy}}': qap.preparedByUser?.username || '',
        '{{preparedDate}}': format(qap.createdAt, 'yyyy-MM-dd'),
        '{{approvedBy}}': qap.approvedByUser?.username || '',
        '{{approvedDate}}': qap.approvedDate ? format(qap.approvedDate, 'yyyy-MM-dd') : '',
        '{{revisionDate}}': format(qap.updatedAt, 'yyyy-MM-dd'),
        '{{equipmentType}}': qap.equipmentType || '',
        '{{standardsApplicable}}': qap.standardsApplicable || '',
      };
      
      // Apply all replacements
      Object.entries(replacements).forEach(([placeholder, value]) => {
        content = content.replace(new RegExp(placeholder, 'g'), value || '');
      });

      // Set response headers for HTML content
      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(content);
    } catch (error) {
      console.error('Error exporting QAP:', error);
      res.status(500).json({ error: 'Failed to export QAP' });
    }
  });

  // ==================== ITPs ====================
  
  // Get all ITPs
  app.get('/api/quality/itps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Allow filtering by project
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const qapId = req.query.qapId ? parseInt(req.query.qapId as string) : null;
      
      let whereClause;
      if (projectId && !isNaN(projectId)) {
        whereClause = eq(itps.projectId, projectId);
      } else if (qapId && !isNaN(qapId)) {
        whereClause = eq(itps.qapId, qapId);
      }
      
      const allItps = await db.query.itps.findMany({
        where: whereClause,
        orderBy: [desc(itps.updatedAt)],
        with: {
          project: true,
          template: {
            columns: {
              id: true,
              name: true,
              version: true,
            },
          },
          qap: {
            columns: {
              id: true,
              title: true,
            },
          },
          preparedByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
      });
      
      res.status(200).json(allItps);
    } catch (error) {
      console.error('Error fetching ITPs:', error);
      res.status(500).json({ error: 'Failed to fetch ITPs' });
    }
  });
  
  // Get a single ITP
  app.get('/api/quality/itps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itpId = parseInt(req.params.id);
      
      if (isNaN(itpId)) {
        return res.status(400).json({ error: 'Invalid ITP ID' });
      }
      
      const itp = await db.query.itps.findFirst({
        where: eq(itps.id, itpId),
        with: {
          project: true,
          template: true,
          qap: true,
          preparedByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
          activities: {
            orderBy: asc(itpActivities.sequenceNumber),
          },
        },
      });
      
      if (!itp) {
        return res.status(404).json({ error: 'ITP not found' });
      }
      
      res.status(200).json(itp);
    } catch (error) {
      console.error('Error fetching ITP:', error);
      res.status(500).json({ error: 'Failed to fetch ITP' });
    }
  });
  
  // Create a new ITP
  app.post('/api/quality/itps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has permission to create ITPs
      if (!canManageQuality(req.user!.role) && req.user!.role !== 'Employee') {
        return res.status(403).json({ error: 'You do not have permission to create ITPs' });
      }
      
      // Validate request body
      const validationResult = insertItpSchema.safeParse({
        ...req.body,
        preparedBy: req.user!.id,
        status: 'draft',
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid ITP data', details: validationResult.error });
      }
      
      // Create ITP
      const [newItp] = await db.insert(itps).values({
        ...validationResult.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      // Create initial version
      await db.insert(itpVersions).values({
        itpId: newItp.id,
        version: 1,
        revision: newItp.revision,
        content: newItp.content,
        createdBy: req.user!.id,
        createdAt: new Date(),
      });
      
      // If activities were provided, create them
      if (req.body.activities && Array.isArray(req.body.activities)) {
        const activitiesToInsert = req.body.activities.map((activity: any, index: number) => ({
          itpId: newItp.id,
          sequenceNumber: index + 1,
          description: activity.description,
          characteristics: activity.characteristics || null,
          referenceDocuments: activity.referenceDocuments || null,
          acceptanceCriteria: activity.acceptanceCriteria || null,
          recordFormat: activity.recordFormat || null,
          inspectionBy: activity.inspectionBy || null,
          remarks: activity.remarks || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        
        if (activitiesToInsert.length > 0) {
          await db.insert(itpActivities).values(activitiesToInsert);
        }
      }
      
      res.status(201).json(newItp);
    } catch (error) {
      console.error('Error creating ITP:', error);
      res.status(500).json({ error: 'Failed to create ITP' });
    }
  });
  
  // Update an ITP
  app.put('/api/quality/itps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itpId = parseInt(req.params.id);
      
      // Check if ITP exists
      const existingItp = await db.query.itps.findFirst({
        where: eq(itps.id, itpId),
      });
      
      if (!existingItp) {
        return res.status(404).json({ error: 'ITP not found' });
      }
      
      // Check permissions
      if (!canManageQuality(req.user!.role) && existingItp.preparedBy !== req.user!.id) {
        return res.status(403).json({ error: 'You do not have permission to update this ITP' });
      }
      
      // Don't allow changes to approved ITPs
      if (existingItp.status === 'approved' && req.user!.role !== 'Superuser') {
        return res.status(400).json({ error: 'Cannot update an approved ITP. Please create a new revision.' });
      }
      
      // Validate request body
      const validationResult = updateItpSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid ITP data', details: validationResult.error });
      }
      
      // Handle status changes
      if (req.body.status === 'approved' && existingItp.status !== 'approved') {
        // Only specific roles can approve
        if (!['Superuser', 'Senior Manager', 'Manager'].includes(req.user!.role)) {
          return res.status(403).json({ error: 'You do not have permission to approve ITPs' });
        }
        validationResult.data.approvedBy = req.user!.id;
      }
      
      // Check for content changes to create a new version
      const contentChanged = req.body.content && req.body.content !== existingItp.content;
      const revisionChanged = req.body.revision && req.body.revision !== existingItp.revision;
      
      // Only create a new version if content or revision changed
      if (contentChanged || revisionChanged) {
        // Get highest version number
        const latestVersion = await db.query.itpVersions.findFirst({
          where: eq(itpVersions.itpId, itpId),
          orderBy: [desc(itpVersions.version)],
        });
        
        const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1;
        
        // Create new version record
        await db.insert(itpVersions).values({
          itpId: itpId,
          version: newVersionNumber,
          revision: req.body.revision || existingItp.revision,
          content: req.body.content || existingItp.content,
          createdBy: req.user!.id,
          createdAt: new Date(),
        });
      }
      
      // Update ITP
      const [updatedItp] = await db.update(itps)
        .set({
          ...validationResult.data,
          updatedAt: new Date(),
        })
        .where(eq(itps.id, itpId))
        .returning();
      
      // Handle activities update if provided
      if (req.body.activities && Array.isArray(req.body.activities)) {
        // Delete existing activities
        await db.delete(itpActivities).where(eq(itpActivities.itpId, itpId));
        
        // Create new activities
        const activitiesToInsert = req.body.activities.map((activity: any, index: number) => ({
          itpId: itpId,
          sequenceNumber: index + 1,
          description: activity.description,
          characteristics: activity.characteristics || null,
          referenceDocuments: activity.referenceDocuments || null,
          acceptanceCriteria: activity.acceptanceCriteria || null,
          recordFormat: activity.recordFormat || null,
          inspectionBy: activity.inspectionBy || null,
          remarks: activity.remarks || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        
        if (activitiesToInsert.length > 0) {
          await db.insert(itpActivities).values(activitiesToInsert);
        }
      }
      
      res.status(200).json(updatedItp);
    } catch (error) {
      console.error('Error updating ITP:', error);
      res.status(500).json({ error: 'Failed to update ITP' });
    }
  });
  
  // Delete an ITP
  app.delete('/api/quality/itps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itpId = parseInt(req.params.id);
      
      // Check if ITP exists
      const existingItp = await db.query.itps.findFirst({
        where: eq(itps.id, itpId),
      });
      
      if (!existingItp) {
        return res.status(404).json({ error: 'ITP not found' });
      }
      
      // Check if user has permission to delete ITPs
      if (req.user!.role !== 'Superuser') {
        return res.status(403).json({ error: 'You do not have permission to delete ITPs' });
      }
      
      // Delete ITP and related activities (cascade delete should handle this)
      await db.delete(itps).where(eq(itps.id, itpId));
      
      res.status(200).json({ message: 'ITP deleted successfully' });
    } catch (error) {
      console.error('Error deleting ITP:', error);
      res.status(500).json({ error: 'Failed to delete ITP' });
    }
  });

  // Export ITP to HTML
  app.get('/api/quality/itps/:id/export', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itpId = parseInt(req.params.id);

      if (isNaN(itpId)) {
        return res.status(400).json({ error: 'Invalid ITP ID' });
      }

      const itp = await db.query.itps.findFirst({
        where: eq(itps.id, itpId),
        with: {
          project: true,
          qap: true,
          template: true,
          preparedByUser: {
            columns: {
              id: true,
              username: true,
              email: true,
            },
          },
          approvedByUser: {
            columns: {
              id: true,
              username: true,
              email: true,
            },
          },
          activities: {
            orderBy: [asc(itpActivities.sequenceNumber)],
          },
        },
      });

      if (!itp) {
        return res.status(404).json({ error: 'ITP not found' });
      }

      // Process the content
      let content = itp.content;

      // Add general metadata replacements
      const replacements: Record<string, string> = {
        '{{title}}': itp.title,
        '{{projectName}}': itp.project?.name || '',
        '{{projectNumber}}': itp.project?.projectCode || '',
        '{{equipmentName}}': itp.equipmentName || '',
        '{{drawingNumber}}': itp.drawingNumber || '',
        '{{revision}}': itp.revision || 'A',
        '{{preparedBy}}': itp.preparedByUser?.username || '',
        '{{preparedDate}}': format(itp.createdAt, 'yyyy-MM-dd'),
        '{{approvedBy}}': itp.approvedByUser ? itp.approvedByUser.username : '',
        '{{approvedDate}}': itp.approvedByUser ? format(itp.updatedAt, 'yyyy-MM-dd') : '',
        '{{revisionDate}}': format(itp.updatedAt, 'yyyy-MM-dd'),
        '{{hazardLevel}}': itp.hazardLevel || 'Not Specified',
        '{{notifiedBody}}': itp.notifiedBody || 'Not Applicable',
        '{{templateName}}': itp.template?.name || 'Standard Template',
        '{{templateVersion}}': itp.template?.version || '1.0',
        '{{qapReference}}': itp.qap?.title || 'N/A',
      };
      
      // Apply all replacements
      Object.entries(replacements).forEach(([placeholder, value]) => {
        content = content.replace(new RegExp(placeholder, 'g'), value || '');
      });

      // Create a simplified HTML representation that could be used for export
      const htmlContent = `
        <html>
          <head>
            <title>ITP - ${itp.title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; }
              .header { text-align: center; margin-bottom: 30px; }
              .title { font-size: 22px; font-weight: bold; margin-bottom: 10px; }
              .subtitle { font-size: 18px; margin-bottom: 20px; }
              .info-section { display: flex; margin-bottom: 20px; }
              .info-column { flex: 1; }
              .label { font-weight: bold; }
              .section-header { font-size: 18px; font-weight: bold; margin: 30px 0 10px 0; }
              table { width: 100%; border-collapse: collapse; }
              th { background-color: #f2f2f2; text-align: left; padding: 8px; }
              td { border: 1px solid #ddd; padding: 8px; }
              .footer { text-align: center; font-style: italic; margin-top: 40px; font-size: 12px; }
              .approvals { display: flex; margin-top: 40px; }
              .approval-section { flex: 1; padding: 15px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">INSPECTION AND TEST PLAN</div>
              <div class="subtitle">${itp.title}</div>
              <div>Revision: ${itp.revision || 'R0'}</div>
            </div>
            
            <div class="info-section">
              <div class="info-column">
                <p><span class="label">Project: </span>${itp.project?.name || 'N/A'}</p>
                <p><span class="label">Project Code: </span>${itp.project?.projectCode || 'N/A'}</p>
                <p><span class="label">Equipment: </span>${itp.equipmentName || 'N/A'}</p>
                <p><span class="label">Drawing No.: </span>${itp.drawingNumber || 'N/A'}</p>
              </div>
              <div class="info-column">
                <p><span class="label">QAP Reference: </span>${itp.qap?.title || 'N/A'}</p>
                <p><span class="label">Hazard Level: </span>${itp.hazardLevel || 'Not Specified'}</p>
                <p><span class="label">Notified Body: </span>${itp.notifiedBody || 'Not Applicable'}</p>
                <p><span class="label">Template: </span>${itp.template?.name || 'Standard'}</p>
              </div>
            </div>
            
            <div class="section-header">Inspection Activities</div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Activity Description</th>
                  <th>Characteristics</th>
                  <th>Reference Document</th>
                  <th>Acceptance Criteria</th>
                  <th>Record Format</th>
                  <th>Inspection By</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${itp.activities?.map((activity: any) => `
                  <tr>
                    <td>${activity.sequenceNumber}</td>
                    <td>${activity.description}</td>
                    <td>${activity.characteristics || ''}</td>
                    <td>${activity.referenceDocuments || ''}</td>
                    <td>${activity.acceptanceCriteria || ''}</td>
                    <td>${activity.recordFormat || ''}</td>
                    <td>${
                      typeof activity.inspectionBy === 'object' 
                        ? Object.entries(activity.inspectionBy)
                            .filter(([_, value]) => value)
                            .map(([key]) => key)
                            .join(', ')
                        : activity.inspectionBy || ''
                    }</td>
                    <td>${activity.remarks || ''}</td>
                  </tr>
                `).join('') || '<tr><td colspan="8">No activities defined</td></tr>'}
              </tbody>
            </table>
            
            <div class="approvals">
              <div class="approval-section">
                <p><span class="label">Prepared By: </span>${itp.preparedByUser?.username || ''}</p>
                <p><span class="label">Date: </span>${format(itp.createdAt, 'yyyy-MM-dd')}</p>
                <p>Signature: _________________</p>
              </div>
              <div class="approval-section">
                <p><span class="label">Approved By: </span>${itp.approvedByUser?.username || ''}</p>
                <p><span class="label">Date: </span>${itp.approvedByUser ? format(itp.updatedAt, 'yyyy-MM-dd') : ''}</p>
                <p>Signature: _________________</p>
              </div>
            </div>
            
            <div class="footer">
              This document is system-generated from the Thermopac Communication System on ${format(new Date(), 'yyyy-MM-dd HH:mm')}
            </div>
          </body>
        </html>
      `;
      
      // Set response headers for HTML content
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="ITP-${itp.title.replace(/\s+/g, '_')}-${itp.revision || 'R0'}.html"`);
      
      // Send the HTML content as the response
      res.status(200).send(htmlContent);
    } catch (error) {
      console.error('Error exporting ITP:', error);
      res.status(500).json({ error: 'Failed to export ITP' });
    }
  });
};