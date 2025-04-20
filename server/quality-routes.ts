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

  // ==================== ITP TEMPLATES ====================

  // Get all ITP templates
  app.get('/api/quality/itp-templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templates = await db.query.itpTemplates.findMany({
        orderBy: [asc(itpTemplates.name)],
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
      console.error('Error fetching ITP templates:', error);
      res.status(500).json({ error: 'Failed to fetch ITP templates' });
    }
  });

  // Get a single ITP template by ID
  app.get('/api/quality/itp-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);

      if (isNaN(templateId)) {
        return res.status(400).json({ error: 'Invalid template ID' });
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
        return res.status(404).json({ error: 'ITP template not found' });
      }

      res.status(200).json(template);
    } catch (error) {
      console.error('Error fetching ITP template:', error);
      res.status(500).json({ error: 'Failed to fetch ITP template' });
    }
  });

  // Create a new ITP template
  app.post('/api/quality/itp-templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has permission to create templates
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

  // Update an ITP template
  app.put('/api/quality/itp-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);

      // Check if user has permission to update templates
      if (!canManageQuality(req.user!.role)) {
        return res.status(403).json({ error: 'You do not have permission to update ITP templates' });
      }

      // Check if template exists
      const existingTemplate = await db.query.itpTemplates.findFirst({
        where: eq(itpTemplates.id, templateId),
      });

      if (!existingTemplate) {
        return res.status(404).json({ error: 'ITP template not found' });
      }

      // Validate request body
      const validationResult = insertItpTemplateSchema.safeParse({
        ...req.body,
        createdBy: existingTemplate.createdBy, // Preserve original creator
      });

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

      // Check if user has permission to delete templates
      if (req.user!.role !== 'Superuser') {
        return res.status(403).json({ error: 'You do not have permission to delete ITP templates' });
      }

      // Check if template exists
      const existingTemplate = await db.query.itpTemplates.findFirst({
        where: eq(itpTemplates.id, templateId),
      });

      if (!existingTemplate) {
        return res.status(404).json({ error: 'ITP template not found' });
      }

      // Check if template is used by any ITPs
      const usedItps = await db.query.itps.findMany({
        where: eq(itps.id, templateId),
        limit: 1,
      });

      if (usedItps.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete template that is in use', 
          message: 'This template is currently used by existing ITP documents. Please remove those documents first or update them to use a different template.' 
        });
      }

      // Delete template
      await db.delete(itpTemplates).where(eq(itpTemplates.id, templateId));

      res.status(200).json({ message: 'ITP template deleted successfully' });
    } catch (error) {
      console.error('Error deleting ITP template:', error);
      res.status(500).json({ error: 'Failed to delete ITP template' });
    }
  });

  // ==================== ITPs (INSPECTION TEST PLANS) ====================

  // Get all ITPs
  app.get('/api/quality/itps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Allow filtering by project or QAP
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const qapId = req.query.qapId ? parseInt(req.query.qapId as string) : null;
      
      let whereClause;
      if (projectId && !isNaN(projectId)) {
        whereClause = eq(itps.projectId, projectId);
      } else if (qapId && !isNaN(qapId)) {
        whereClause = eq(itps.qapId, qapId);
      }

      const itpList = await db.query.itps.findMany({
        where: whereClause,
        orderBy: [desc(itps.updatedAt)],
        with: {
          project: true,
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
          approvedByUser: {
            columns: {
              id: true,
              username: true,
            },
          },
        },
      });

      res.status(200).json(itpList);
    } catch (error) {
      console.error('Error fetching ITPs:', error);
      res.status(500).json({ error: 'Failed to fetch ITPs' });
    }
  });

  // Get a single ITP by ID
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
          versions: {
            orderBy: [desc(itpVersions.version)],
            with: {
              createdByUser: {
                columns: {
                  id: true,
                  username: true,
                },
              },
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
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: 'Invalid ITP data', details: validationResult.error });
      }

      // Check if project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, validationResult.data.projectId),
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // If QAP ID is provided, check if it exists
      if (validationResult.data.qapId) {
        const qap = await db.query.generatedQaps.findFirst({
          where: eq(generatedQaps.id, validationResult.data.qapId),
        });

        if (!qap) {
          return res.status(404).json({ error: 'Referenced QAP not found' });
        }
      }
      
      // If template ID is provided, check if it exists
      if (validationResult.data.templateId) {
        const template = await db.query.itpTemplates.findFirst({
          where: eq(itpTemplates.id, validationResult.data.templateId),
        });

        if (!template) {
          return res.status(404).json({ error: 'Referenced ITP template not found' });
        }
      }

      // Create ITP
      const [newItp] = await db.insert(itps).values({
        ...validationResult.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Create initial version record
      await db.insert(itpVersions).values({
        itpId: newItp.id,
        version: 1,
        content: newItp.content,
        revision: newItp.revision,
        createdBy: req.user!.id,
        createdAt: new Date(),
      });

      // If there are activities, create them
      if (req.body.activities && Array.isArray(req.body.activities)) {
        for (const activity of req.body.activities) {
          const activityValidation = insertItpActivitySchema.safeParse({
            ...activity,
            itpId: newItp.id,
          });

          if (activityValidation.success) {
            await db.insert(itpActivities).values({
              ...activityValidation.data,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
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

      // Check if user has permission to update ITPs
      const isCreator = existingItp.preparedBy === req.user!.id;
      if (!canManageQuality(req.user!.role) && !isCreator) {
        return res.status(403).json({ error: 'You do not have permission to update this ITP' });
      }

      // Extract fields to update
      const {
        content,
        title,
        equipmentName,
        drawingNumber,
        revision,
        hazardLevel,
        notifiedBody,
        status,
        approvedBy,
        templateId,
        activities,
        ...otherFields
      } = req.body;

      // If template ID is provided, check if it exists
      if (templateId && templateId !== existingItp.templateId) {
        const template = await db.query.itpTemplates.findFirst({
          where: eq(itpTemplates.id, templateId),
        });

        if (!template) {
          return res.status(404).json({ error: 'Referenced ITP template not found' });
        }
      }
      
      // Check if creating a new version
      const createNewVersion = content !== existingItp.content || revision !== existingItp.revision;
      const newVersion = createNewVersion ? existingItp.version + 1 : existingItp.version;

      // Update ITP
      const [updatedItp] = await db.update(itps)
        .set({
          content: content ?? existingItp.content,
          title: title ?? existingItp.title,
          equipmentName: equipmentName ?? existingItp.equipmentName,
          drawingNumber: drawingNumber ?? existingItp.drawingNumber,
          revision: revision ?? existingItp.revision,
          hazardLevel: hazardLevel ?? existingItp.hazardLevel,
          notifiedBody: notifiedBody ?? existingItp.notifiedBody,
          status: status ?? existingItp.status,
          approvedBy: approvedBy ?? existingItp.approvedBy,
          templateId: templateId ?? existingItp.templateId,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(itps.id, itpId))
        .returning();

      // Create new version record if needed
      if (createNewVersion) {
        await db.insert(itpVersions).values({
          itpId: itpId,
          version: newVersion,
          content: content ?? existingItp.content,
          revision: revision ?? existingItp.revision,
          createdBy: req.user!.id,
          createdAt: new Date(),
        });
      }

      // Update activities if provided
      if (activities && Array.isArray(activities)) {
        // First, delete existing activities
        await db.delete(itpActivities).where(eq(itpActivities.itpId, itpId));
        
        // Then insert new ones
        for (const activity of activities) {
          const activityValidation = insertItpActivitySchema.safeParse({
            ...activity,
            itpId: itpId,
          });

          if (activityValidation.success) {
            await db.insert(itpActivities).values({
              ...activityValidation.data,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
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
      const isCreator = existingItp.preparedBy === req.user!.id;
      if (req.user!.role !== 'Superuser' && !isCreator) {
        return res.status(403).json({ error: 'You do not have permission to delete this ITP' });
      }

      // Delete ITP (versions and activities will be deleted by cascade)
      await db.delete(itps).where(eq(itps.id, itpId));

      res.status(200).json({ message: 'ITP deleted successfully' });
    } catch (error) {
      console.error('Error deleting ITP:', error);
      res.status(500).json({ error: 'Failed to delete ITP' });
    }
  });

  // ==================== ITP ACTIVITIES ====================

  // Get activities for an ITP
  app.get('/api/quality/itps/:id/activities', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itpId = parseInt(req.params.id);

      if (isNaN(itpId)) {
        return res.status(400).json({ error: 'Invalid ITP ID' });
      }

      const activities = await db.query.itpActivities.findMany({
        where: eq(itpActivities.itpId, itpId),
        orderBy: [asc(itpActivities.sequenceNumber)],
      });

      res.status(200).json(activities);
    } catch (error) {
      console.error('Error fetching ITP activities:', error);
      res.status(500).json({ error: 'Failed to fetch ITP activities' });
    }
  });

  // Export ITP as HTML (for PDF conversion)
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

      // For demonstration, we'll return HTML content that can be converted to PDF on the client side
      
      // Replace placeholders in content with actual values
      let content = JSON.stringify(itp.content);
      
      // Basic placeholder replacements
      const replacements = {
        '{{title}}': itp.title,
        '{{projectName}}': itp.project?.name || 'Unknown Project',
        '{{projectCode}}': itp.project?.code || '',
        '{{equipmentName}}': itp.equipmentName,
        '{{drawingNumber}}': itp.drawingNumber || '',
        '{{revision}}': itp.revision,
        '{{date}}': format(new Date(), 'yyyy-MM-dd'),
        '{{preparedByName}}': itp.preparedByUser?.username || 'Unknown',
        '{{approvedByName}}': itp.approvedByUser?.username || '',
        '{{itpNumber}}': itp.id.toString().padStart(3, '0'),
        '{{preparedDate}}': format(itp.createdAt, 'yyyy-MM-dd'),
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

      // Set response headers for HTML content
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(content);
    } catch (error) {
      console.error('Error exporting ITP:', error);
      res.status(500).json({ error: 'Failed to export ITP' });
    }
  });
};