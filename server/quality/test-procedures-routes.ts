import express, { Request, Response } from 'express';
import { db } from '../db';
import { testProcedures, users } from '@shared/schema';
import { eq, and, desc, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router();

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Form validation schema
const testProcedureSchema = z.object({
  procedureNumber: z.string().min(1, 'Procedure number is required'),
  procedureName: z.string().min(1, 'Procedure name is required'),
  ndtMethod: z.enum(['LPT', 'MPT', 'RT', 'PT', 'UT', 'MT']),
  applicableStandard: z.string().optional(),
  procedureRevision: z.string().default('R1'),
  scope: z.string().optional(),
  technique: z.string().optional(),
  equipment: z.string().optional(),
  materials: z.string().optional(),
  sensitivity: z.string().optional(),
  preparation: z.string().optional(),
  procedureSteps: z.string().optional(),
  evaluation: z.string().optional(),
  documentation: z.string().optional(),
  personnelQualification: z.string().optional(),
  calibrationRequirements: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  limitations: z.string().optional(),
  safetyPrecautions: z.string().optional(),
  environmentalConditions: z.string().optional(),
  status: z.enum(['Draft', 'Under Review', 'Approved', 'Superseded']).default('Draft'),
  approvalLevel: z.enum(['Level 1', 'Level 2', 'Level 3']).optional(),
  remarks: z.string().optional(),
  tags: z.string().optional(),
});

// GET /api/quality/test-procedures - Get all test procedures
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { search, ndtMethod, status } = req.query;
    
    let query = db
      .select({
        id: testProcedures.id,
        procedureNumber: testProcedures.procedureNumber,
        procedureName: testProcedures.procedureName,
        ndtMethod: testProcedures.ndtMethod,
        applicableStandard: testProcedures.applicableStandard,
        procedureRevision: testProcedures.procedureRevision,
        scope: testProcedures.scope,
        technique: testProcedures.technique,
        equipment: testProcedures.equipment,
        materials: testProcedures.materials,
        sensitivity: testProcedures.sensitivity,
        preparation: testProcedures.preparation,
        procedureSteps: testProcedures.procedureSteps,
        evaluation: testProcedures.evaluation,
        documentation: testProcedures.documentation,
        personnelQualification: testProcedures.personnelQualification,
        calibrationRequirements: testProcedures.calibrationRequirements,
        acceptanceCriteria: testProcedures.acceptanceCriteria,
        limitations: testProcedures.limitations,
        safetyPrecautions: testProcedures.safetyPrecautions,
        environmentalConditions: testProcedures.environmentalConditions,
        status: testProcedures.status,
        approvalLevel: testProcedures.approvalLevel,
        approvedBy: testProcedures.approvedBy,
        approvedAt: testProcedures.approvedAt,
        isRevision: testProcedures.isRevision,
        revisionOf: testProcedures.revisionOf,
        revisionReason: testProcedures.revisionReason,
        supersededAt: testProcedures.supersededAt,
        supersededBy: testProcedures.supersededBy,
        remarks: testProcedures.remarks,
        tags: testProcedures.tags,
        attachments: testProcedures.attachments,
        createdBy: testProcedures.createdBy,
        createdAt: testProcedures.createdAt,
        updatedBy: testProcedures.updatedBy,
        updatedAt: testProcedures.updatedAt,
        createdByUser: users.username,
        updatedByUser: sql`updated_user.username`,
        approvedByUser: sql`approved_user.username`,
      })
      .from(testProcedures)
      .leftJoin(users, eq(testProcedures.createdBy, users.id))
      .leftJoin(sql`users as updated_user`, sql`test_procedures.updated_by = updated_user.id`)
      .leftJoin(sql`users as approved_user`, sql`test_procedures.approved_by = approved_user.id`);

    // Apply filters
    const filters = [];
    
    if (search) {
      filters.push(
        or(
          like(testProcedures.procedureNumber, `%${search}%`),
          like(testProcedures.procedureName, `%${search}%`),
          like(testProcedures.applicableStandard, `%${search}%`),
          like(testProcedures.tags, `%${search}%`)
        )
      );
    }
    
    if (ndtMethod) {
      filters.push(eq(testProcedures.ndtMethod, ndtMethod as string));
    }
    
    if (status) {
      filters.push(eq(testProcedures.status, status as string));
    }
    
    if (filters.length > 0) {
      query = query.where(and(...filters));
    }
    
    const procedures = await query.orderBy(desc(testProcedures.createdAt));
    
    res.json(procedures);
  } catch (error) {
    console.error('Error fetching test procedures:', error);
    res.status(500).json({ error: 'Failed to fetch test procedures' });
  }
});

// GET /api/quality/test-procedures/:id - Get specific test procedure
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }
    
    const procedure = await db
      .select({
        id: testProcedures.id,
        procedureNumber: testProcedures.procedureNumber,
        procedureName: testProcedures.procedureName,
        ndtMethod: testProcedures.ndtMethod,
        applicableStandard: testProcedures.applicableStandard,
        procedureRevision: testProcedures.procedureRevision,
        scope: testProcedures.scope,
        technique: testProcedures.technique,
        equipment: testProcedures.equipment,
        materials: testProcedures.materials,
        sensitivity: testProcedures.sensitivity,
        preparation: testProcedures.preparation,
        procedureSteps: testProcedures.procedureSteps,
        evaluation: testProcedures.evaluation,
        documentation: testProcedures.documentation,
        personnelQualification: testProcedures.personnelQualification,
        calibrationRequirements: testProcedures.calibrationRequirements,
        acceptanceCriteria: testProcedures.acceptanceCriteria,
        limitations: testProcedures.limitations,
        safetyPrecautions: testProcedures.safetyPrecautions,
        environmentalConditions: testProcedures.environmentalConditions,
        status: testProcedures.status,
        approvalLevel: testProcedures.approvalLevel,
        approvedBy: testProcedures.approvedBy,
        approvedAt: testProcedures.approvedAt,
        isRevision: testProcedures.isRevision,
        revisionOf: testProcedures.revisionOf,
        revisionReason: testProcedures.revisionReason,
        supersededAt: testProcedures.supersededAt,
        supersededBy: testProcedures.supersededBy,
        remarks: testProcedures.remarks,
        tags: testProcedures.tags,
        attachments: testProcedures.attachments,
        createdBy: testProcedures.createdBy,
        createdAt: testProcedures.createdAt,
        updatedBy: testProcedures.updatedBy,
        updatedAt: testProcedures.updatedAt,
        createdByUser: users.username,
      })
      .from(testProcedures)
      .leftJoin(users, eq(testProcedures.createdBy, users.id))
      .where(eq(testProcedures.id, id))
      .limit(1);
    
    if (procedure.length === 0) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }
    
    res.json(procedure[0]);
  } catch (error) {
    console.error('Error fetching test procedure:', error);
    res.status(500).json({ error: 'Failed to fetch test procedure' });
  }
});

// POST /api/quality/test-procedures - Create new test procedure
router.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const validation = testProcedureSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues
      });
    }
    
    const data = validation.data;
    const userId = (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Check if procedure number already exists
    const existingProcedure = await db
      .select({ id: testProcedures.id })
      .from(testProcedures)
      .where(eq(testProcedures.procedureNumber, data.procedureNumber))
      .limit(1);
    
    if (existingProcedure.length > 0) {
      return res.status(409).json({ error: 'Procedure number already exists' });
    }
    
    const [newProcedure] = await db
      .insert(testProcedures)
      .values({
        ...data,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    
    res.status(201).json(newProcedure);
  } catch (error) {
    console.error('Error creating test procedure:', error);
    res.status(500).json({ error: 'Failed to create test procedure' });
  }
});

// PUT /api/quality/test-procedures/:id - Update test procedure
router.put('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.user as any)?.id;
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const validation = testProcedureSchema.partial().safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues
      });
    }
    
    const data = validation.data;
    
    // Check if procedure exists
    const existingProcedure = await db
      .select({ id: testProcedures.id })
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);
    
    if (existingProcedure.length === 0) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }
    
    // Check if procedure number already exists (if being updated)
    if (data.procedureNumber) {
      const conflictingProcedure = await db
        .select({ id: testProcedures.id })
        .from(testProcedures)
        .where(
          and(
            eq(testProcedures.procedureNumber, data.procedureNumber),
            sql`id != ${id}`
          )
        )
        .limit(1);
      
      if (conflictingProcedure.length > 0) {
        return res.status(409).json({ error: 'Procedure number already exists' });
      }
    }
    
    const [updatedProcedure] = await db
      .update(testProcedures)
      .set({
        ...data,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(testProcedures.id, id))
      .returning();
    
    res.json(updatedProcedure);
  } catch (error) {
    console.error('Error updating test procedure:', error);
    res.status(500).json({ error: 'Failed to update test procedure' });
  }
});

// DELETE /api/quality/test-procedures/:id - Delete test procedure
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }
    
    // Check if procedure exists
    const existingProcedure = await db
      .select({ id: testProcedures.id })
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);
    
    if (existingProcedure.length === 0) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }
    
    await db
      .delete(testProcedures)
      .where(eq(testProcedures.id, id));
    
    res.json({ message: 'Test procedure deleted successfully' });
  } catch (error) {
    console.error('Error deleting test procedure:', error);
    res.status(500).json({ error: 'Failed to delete test procedure' });
  }
});

// POST /api/quality/test-procedures/:id/approve - Approve test procedure
router.post('/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.user as any)?.id;
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { approvalLevel } = req.body;
    
    if (!approvalLevel || !['Level 1', 'Level 2', 'Level 3'].includes(approvalLevel)) {
      return res.status(400).json({ error: 'Valid approval level is required' });
    }
    
    const [updatedProcedure] = await db
      .update(testProcedures)
      .set({
        status: 'Approved',
        approvalLevel,
        approvedBy: userId,
        approvedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(testProcedures.id, id))
      .returning();
    
    if (!updatedProcedure) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }
    
    res.json(updatedProcedure);
  } catch (error) {
    console.error('Error approving test procedure:', error);
    res.status(500).json({ error: 'Failed to approve test procedure' });
  }
});

export default router;