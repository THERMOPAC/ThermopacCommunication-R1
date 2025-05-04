import express, { Request, Response } from 'express';
import { db } from '../db';
import { reportTemplates, templateSectionTypes } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

const router = express.Router();

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// GET /templates - Get all templates
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const templates = await db.query.reportTemplates.findMany({
      orderBy: (reportTemplates, { desc }) => [desc(reportTemplates.updatedAt)]
    });
    
    return res.status(200).json(templates);
    
  } catch (error) {
    console.error('Error getting templates:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// GET /templates/:id - Get a specific template by ID
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }
    
    const template = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, templateId)
    });
    
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    return res.status(200).json(template);
    
  } catch (error) {
    console.error('Error getting template:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// POST /templates - Create a new template
router.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: "User ID not found" });
    }
    
    const {
      name,
      type = 'QMS Final Dossier',
      hasCoverPage = true,
      hasFooter = true,
      fontSize = 'Medium',
      headerText,
      footerText,
      sectionOrder,
      isDefault = false
    } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: "Template name is required" });
    }
    
    // Validate section order
    if (sectionOrder && Array.isArray(sectionOrder)) {
      const invalidSections = sectionOrder.filter(section => 
        !templateSectionTypes.includes(section)
      );
      
      if (invalidSections.length > 0) {
        return res.status(400).json({ 
          error: "Invalid section types in sectionOrder",
          invalidSections
        });
      }
    }
    
    // If this is set as default, update all other templates to not be default
    if (isDefault) {
      await db.update(reportTemplates)
        .set({ isDefault: false })
        .where(eq(reportTemplates.type, type));
    }
    
    // Create new template
    const [template] = await db.insert(reportTemplates)
      .values({
        name,
        type,
        hasCoverPage,
        hasFooter,
        fontSize,
        headerText,
        footerText,
        sectionOrder,
        isDefault,
        createdBy: userId
      })
      .returning();
    
    return res.status(201).json({
      message: "Template created successfully",
      template
    });
    
  } catch (error) {
    console.error('Error creating template:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// PUT /templates/:id - Update an existing template
router.put('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }
    
    // Check if template exists
    const existingTemplate = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, templateId)
    });
    
    if (!existingTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    const {
      name,
      type,
      hasCoverPage,
      hasFooter,
      fontSize,
      headerText,
      footerText,
      sectionOrder,
      isDefault
    } = req.body;
    
    // Validate required fields
    if (name === '') {
      return res.status(400).json({ error: "Template name cannot be empty" });
    }
    
    // Validate section order if provided
    if (sectionOrder && Array.isArray(sectionOrder)) {
      const invalidSections = sectionOrder.filter(section => 
        !templateSectionTypes.includes(section)
      );
      
      if (invalidSections.length > 0) {
        return res.status(400).json({ 
          error: "Invalid section types in sectionOrder",
          invalidSections
        });
      }
    }
    
    // Update values object
    const updateValues: any = {};
    
    if (name !== undefined) updateValues.name = name;
    if (type !== undefined) updateValues.type = type;
    if (hasCoverPage !== undefined) updateValues.hasCoverPage = hasCoverPage;
    if (hasFooter !== undefined) updateValues.hasFooter = hasFooter;
    if (fontSize !== undefined) updateValues.fontSize = fontSize;
    if (headerText !== undefined) updateValues.headerText = headerText;
    if (footerText !== undefined) updateValues.footerText = footerText;
    if (sectionOrder !== undefined) updateValues.sectionOrder = sectionOrder;
    if (isDefault !== undefined) updateValues.isDefault = isDefault;
    
    // Always update the updatedAt timestamp
    updateValues.updatedAt = new Date();
    
    // If this is set as default, update all other templates to not be default
    if (isDefault) {
      await db.update(reportTemplates)
        .set({ isDefault: false })
        .where(sql`${reportTemplates.type} = ${type || existingTemplate.type} AND ${reportTemplates.id} <> ${templateId}`);
    }
    
    // Update the template
    const [updatedTemplate] = await db.update(reportTemplates)
      .set(updateValues)
      .where(eq(reportTemplates.id, templateId))
      .returning();
    
    return res.status(200).json({
      message: "Template updated successfully",
      template: updatedTemplate
    });
    
  } catch (error) {
    console.error('Error updating template:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// POST /templates/:id/set-default - Set a template as default
router.post('/:id/set-default', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }
    
    // Check if template exists
    const template = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, templateId)
    });
    
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    // Update all templates of the same type to not be default
    await db.update(reportTemplates)
      .set({ isDefault: false })
      .where(eq(reportTemplates.type, template.type));
    
    // Set this template as default
    const [updatedTemplate] = await db.update(reportTemplates)
      .set({ 
        isDefault: true,
        updatedAt: new Date()
      })
      .where(eq(reportTemplates.id, templateId))
      .returning();
    
    return res.status(200).json({
      message: "Template set as default successfully",
      template: updatedTemplate
    });
    
  } catch (error) {
    console.error('Error setting template as default:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// DELETE /templates/:id - Delete a template
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }
    
    // Check if template exists
    const template = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, templateId)
    });
    
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    // Don't allow deletion if it's the default template
    if (template.isDefault) {
      return res.status(400).json({ 
        error: "Cannot delete the default template. Set another template as default first."
      });
    }
    
    // Delete the template
    await db.delete(reportTemplates)
      .where(eq(reportTemplates.id, templateId));
    
    return res.status(200).json({
      message: "Template deleted successfully"
    });
    
  } catch (error) {
    console.error('Error deleting template:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

export default router;