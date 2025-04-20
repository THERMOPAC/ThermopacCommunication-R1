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
  insertQapVersionSchema
} from "../shared/schema";
import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";

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
          versions: {
            orderBy: [desc(qapVersions.version)],
            with: {
              createdByUser: {
                columns: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
      });

      if (!qap) {
        return res.status(404).json({ error: 'Generated QAP not found' });
      }

      res.status(200).json(qap);
    } catch (error) {
      console.error('Error fetching generated QAP:', error);
      res.status(500).json({ error: 'Failed to fetch generated QAP' });
    }
  });

  // Create a new generated QAP
  app.post('/api/quality/generated-qaps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has permission to create QAPs
      if (!canManageQuality(req.user!.role) && req.user!.role !== 'Employee') {
        return res.status(403).json({ error: 'You do not have permission to create QAPs' });
      }

      // Validate request body
      const validationResult = insertGeneratedQapSchema.safeParse({
        ...req.body,
        preparedBy: req.user!.id,
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid QAP data', details: validationResult.error });
      }

      // Check if project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, validationResult.data.projectId),
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Check if template exists
      const template = await db.query.qapTemplates.findFirst({
        where: eq(qapTemplates.id, validationResult.data.templateId),
      });

      if (!template) {
        return res.status(404).json({ error: 'QAP template not found' });
      }

      // Create QAP
      const [newQap] = await db.insert(generatedQaps).values({
        ...validationResult.data,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Create initial version record
      await db.insert(qapVersions).values({
        qapId: newQap.id,
        version: 1,
        content: newQap.content,
        revision: newQap.revision,
        createdBy: req.user!.id,
        createdAt: new Date(),
      });

      res.status(201).json(newQap);
    } catch (error) {
      console.error('Error creating generated QAP:', error);
      res.status(500).json({ error: 'Failed to create generated QAP' });
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
        return res.status(404).json({ error: 'Generated QAP not found' });
      }

      // Check if user has permission to update QAPs
      const isCreator = existingQap.preparedBy === req.user!.id;
      if (!canManageQuality(req.user!.role) && !isCreator) {
        return res.status(403).json({ error: 'You do not have permission to update this QAP' });
      }

      // Extract fields to update
      const {
        content,
        title,
        clientName,
        equipmentType,
        standards,
        revision,
        itpReferences,
        status,
        approvedBy,
        ...otherFields
      } = req.body;

      // Check if creating a new version
      const createNewVersion = content !== existingQap.content || revision !== existingQap.revision;
      const newVersion = createNewVersion ? existingQap.version + 1 : existingQap.version;

      // Update QAP
      const [updatedQap] = await db.update(generatedQaps)
        .set({
          content: content ?? existingQap.content,
          title: title ?? existingQap.title,
          clientName: clientName ?? existingQap.clientName,
          equipmentType: equipmentType ?? existingQap.equipmentType,
          standards: standards ?? existingQap.standards,
          revision: revision ?? existingQap.revision,
          itpReferences: itpReferences ?? existingQap.itpReferences,
          status: status ?? existingQap.status,
          approvedBy: approvedBy ?? existingQap.approvedBy,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(generatedQaps.id, qapId))
        .returning();

      // Create new version record if needed
      if (createNewVersion) {
        await db.insert(qapVersions).values({
          qapId: qapId,
          version: newVersion,
          content: content ?? existingQap.content,
          revision: revision ?? existingQap.revision,
          createdBy: req.user!.id,
          createdAt: new Date(),
        });
      }

      res.status(200).json(updatedQap);
    } catch (error) {
      console.error('Error updating generated QAP:', error);
      res.status(500).json({ error: 'Failed to update generated QAP' });
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
        return res.status(404).json({ error: 'Generated QAP not found' });
      }

      // Check if user has permission to delete QAPs
      const isCreator = existingQap.preparedBy === req.user!.id;
      if (req.user!.role !== 'Superuser' && !isCreator) {
        return res.status(403).json({ error: 'You do not have permission to delete this QAP' });
      }

      // Delete QAP (versions will be deleted by cascade)
      await db.delete(generatedQaps).where(eq(generatedQaps.id, qapId));

      res.status(200).json({ message: 'Generated QAP deleted successfully' });
    } catch (error) {
      console.error('Error deleting generated QAP:', error);
      res.status(500).json({ error: 'Failed to delete generated QAP' });
    }
  });

  // Get a specific version of a QAP
  app.get('/api/quality/generated-qaps/:id/versions/:versionId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const qapId = parseInt(req.params.id);
      const versionId = parseInt(req.params.versionId);

      if (isNaN(qapId) || isNaN(versionId)) {
        return res.status(400).json({ error: 'Invalid QAP ID or version ID' });
      }

      const version = await db.query.qapVersions.findFirst({
        where: and(
          eq(qapVersions.qapId, qapId),
          eq(qapVersions.id, versionId)
        ),
        with: {
          createdByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
      });

      if (!version) {
        return res.status(404).json({ error: 'QAP version not found' });
      }

      res.status(200).json(version);
    } catch (error) {
      console.error('Error fetching QAP version:', error);
      res.status(500).json({ error: 'Failed to fetch QAP version' });
    }
  });

  // Export QAP as PDF
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

      if (!qap) {
        return res.status(404).json({ error: 'Generated QAP not found' });
      }

      // For demonstration, we'll return HTML content that can be converted to PDF on the client side
      // In a production environment, you might use a library like puppeteer to generate a PDF server-side
      
      // Replace placeholders in content with actual values
      let content = qap.content;
      
      // Basic placeholder replacements
      const replacements = {
        '{{title}}': qap.title,
        '{{projectName}}': qap.project?.name || 'Unknown Project',
        '{{projectCode}}': qap.project?.code || '',
        '{{clientName}}': qap.clientName,
        '{{equipmentType}}': qap.equipmentType,
        '{{standards}}': qap.standards || '',
        '{{revision}}': qap.revision,
        '{{date}}': format(new Date(), 'yyyy-MM-dd'),
        '{{preparedByName}}': qap.preparedByUser?.username || 'Unknown',
        '{{approvedByName}}': qap.approvedByUser?.username || '',
        '{{qapNumber}}': qap.id.toString().padStart(3, '0'),
        '{{preparedDate}}': format(qap.createdAt, 'yyyy-MM-dd'),
        '{{approvedDate}}': qap.approvedByUser ? format(qap.updatedAt, 'yyyy-MM-dd') : '',
        '{{revisionDate}}': format(qap.updatedAt, 'yyyy-MM-dd'),
        '{{revisionDescription}}': 'Initial creation' // This could be stored in version records
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
};