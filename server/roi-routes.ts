import { Request, Response } from 'express';
import { db } from './db';
import { roiProjectSteps, insertRoiProjectStepSchema } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Save step data API
export const saveRoiStep = async (req: Request, res: Response) => {
  try {
    console.log('ROI Save Step API called with data:', req.body);
    
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate request body
    const validationResult = insertRoiProjectStepSchema.safeParse({
      ...req.body,
      updatedBy: req.user.id
    });

    if (!validationResult.success) {
      console.log('Validation errors:', validationResult.error.errors);
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.errors
      });
    }

    const { roiProjectId, stepNumber, stepData } = validationResult.data;

    console.log(`Saving step ${stepNumber} for project ${roiProjectId}`);

    // Check if step already exists
    const existingStep = await db
      .select()
      .from(roiProjectSteps)
      .where(
        and(
          eq(roiProjectSteps.roiProjectId, roiProjectId),
          eq(roiProjectSteps.stepNumber, stepNumber)
        )
      )
      .limit(1);

    let result;
    if (existingStep.length > 0) {
      // Update existing step
      console.log('Updating existing step');
      result = await db
        .update(roiProjectSteps)
        .set({
          stepData,
          updatedBy: req.user.id,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(roiProjectSteps.roiProjectId, roiProjectId),
            eq(roiProjectSteps.stepNumber, stepNumber)
          )
        )
        .returning();
    } else {
      // Insert new step
      console.log('Inserting new step');
      result = await db
        .insert(roiProjectSteps)
        .values({
          roiProjectId,
          stepNumber,
          stepData,
          updatedBy: req.user.id
        })
        .returning();
    }

    console.log('Step saved successfully:', result[0]);

    res.status(200).json({
      success: true,
      message: `Step ${stepNumber} saved successfully`,
      data: result[0]
    });

  } catch (error) {
    console.error('Error saving ROI step:', error);
    res.status(500).json({ 
      error: 'Failed to save step',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Load project data API
export const loadRoiProject = async (req: Request, res: Response) => {
  try {
    const { roiProjectId } = req.params;
    
    console.log('ROI Load Project API called for project:', roiProjectId);
    
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(roiProjectId)) {
      return res.status(400).json({ error: 'Invalid project ID format' });
    }

    // Fetch all steps for the project
    const steps = await db
      .select()
      .from(roiProjectSteps)
      .where(eq(roiProjectSteps.roiProjectId, roiProjectId))
      .orderBy(roiProjectSteps.stepNumber);

    console.log(`Found ${steps.length} steps for project ${roiProjectId}`);

    // Transform into the expected format
    const stepsData: Record<string, any> = {};
    steps.forEach(step => {
      stepsData[step.stepNumber.toString()] = step.stepData;
    });

    console.log('Returning steps data:', stepsData);

    res.status(200).json({
      success: true,
      projectId: roiProjectId,
      steps: stepsData,
      totalSteps: steps.length,
      lastUpdated: steps.length > 0 ? Math.max(...steps.map(s => new Date(s.updatedAt).getTime())) : null
    });

  } catch (error) {
    console.error('Error loading ROI project:', error);
    res.status(500).json({ 
      error: 'Failed to load project',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get project progress API
export const getRoiProjectProgress = async (req: Request, res: Response) => {
  try {
    const { roiProjectId } = req.params;
    
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(roiProjectId)) {
      return res.status(400).json({ error: 'Invalid project ID format' });
    }

    // Get distinct step numbers for the project
    const completedSteps = await db
      .select({ stepNumber: roiProjectSteps.stepNumber })
      .from(roiProjectSteps)
      .where(eq(roiProjectSteps.roiProjectId, roiProjectId))
      .orderBy(roiProjectSteps.stepNumber);

    const completedStepNumbers = completedSteps.map(step => step.stepNumber);
    const totalSteps = 7; // ROI Calculator has 7 steps
    const progressPercentage = Math.round((completedStepNumbers.length / totalSteps) * 100);

    res.status(200).json({
      success: true,
      projectId: roiProjectId,
      completedSteps: completedStepNumbers,
      totalSteps,
      progressPercentage,
      nextStep: completedStepNumbers.length < totalSteps ? completedStepNumbers.length + 1 : null
    });

  } catch (error) {
    console.error('Error getting ROI project progress:', error);
    res.status(500).json({ 
      error: 'Failed to get project progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};