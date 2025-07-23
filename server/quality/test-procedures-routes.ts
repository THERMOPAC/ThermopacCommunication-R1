import express, { Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db';
import { testProcedures, users } from '@shared/schema';
import { eq, and, desc, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { uploadFileWithDiagnostics } from '../utils/gcs-enhanced-upload';

// Setup multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF, DOC, DOCX files
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
    }
  },
});

// Define ensureAuthenticated middleware
const ensureAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

const router = express.Router();

// GET /api/quality/test-procedures/next-number - Get next procedure ID
router.get('/next-number', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get the highest procedure number for current year
    const lastProcedure = await db
      .select({ procedureNumber: testProcedures.procedureNumber })
      .from(testProcedures)
      .where(like(testProcedures.procedureNumber, `TP-${currentYear}-%`))
      .orderBy(desc(testProcedures.procedureNumber))
      .limit(1);

    let nextNumber = 1;
    if (lastProcedure.length > 0) {
      const lastNumber = lastProcedure[0].procedureNumber;
      const match = lastNumber.match(/TP-\d{4}-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const procedureNumber = `TP-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;

    res.json({ procedureNumber });
  } catch (error) {
    console.error('Error generating next procedure number:', error);
    res.status(500).json({ error: 'Failed to generate next procedure number' });
  }
});

// Updated validation schema without removed fields
const testProcedureSchema = z.object({
  procedureNumber: z.string().min(1, 'Procedure number is required'),
  procedureName: z.string().min(1, 'Procedure name is required'),
  ndtMethod: z.enum(['LPT', 'MPT', 'RT', 'PT', 'UT', 'MT']),
  applicableStandard: z.string().optional(),
  procedureRevision: z.string().default('R1'),
  scope: z.string().optional(),
  technique: z.string().optional(),
  sensitivity: z.string().optional(),
  preparation: z.string().optional(),
  procedureSteps: z.string().optional(),
  evaluation: z.string().optional(),
  documentation: z.string().optional(),
  personnelQualification: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  limitations: z.string().optional(),
  environmentalConditions: z.string().optional(),
  status: z.enum(['Draft', 'Under Review', 'Approved', 'Superseded']).default('Draft'),
  approvalLevel: z.enum(['Level 1', 'Level 2', 'Level 3']).optional().or(z.literal('')),
  remarks: z.string().optional(),
  tags: z.string().optional(),
}).transform((data) => ({
  ...data,
  approvalLevel: data.approvalLevel === '' ? undefined : data.approvalLevel
}));

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
        sensitivity: testProcedures.sensitivity,
        preparation: testProcedures.preparation,
        procedureSteps: testProcedures.procedureSteps,
        evaluation: testProcedures.evaluation,
        documentation: testProcedures.documentation,
        personnelQualification: testProcedures.personnelQualification,
        acceptanceCriteria: testProcedures.acceptanceCriteria,
        limitations: testProcedures.limitations,
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
        sensitivity: testProcedures.sensitivity,
        preparation: testProcedures.preparation,
        procedureSteps: testProcedures.procedureSteps,
        evaluation: testProcedures.evaluation,
        documentation: testProcedures.documentation,
        personnelQualification: testProcedures.personnelQualification,
        acceptanceCriteria: testProcedures.acceptanceCriteria,
        limitations: testProcedures.limitations,
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

// POST /api/quality/test-procedures - Create new test procedure with file upload
router.post('/', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    console.log('Creating test procedure with file upload');
    console.log('Request body:', req.body);
    console.log('File info:', req.file ? { name: req.file.originalname, size: req.file.size, type: req.file.mimetype } : 'No file');

    // Validate that file is provided
    if (!req.file) {
      return res.status(400).json({ error: 'Procedure document file is required' });
    }

    const validation = testProcedureSchema.safeParse(req.body);
    
    if (!validation.success) {
      console.log('Validation errors:', validation.error.issues);
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

    // Upload file to GCS
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${data.procedureNumber}.${fileExtension}`;
    const gcsPath = `QMS/Test_Procedures/${data.ndtMethod}/${fileName}`;
    
    console.log('Uploading file to GCS path:', gcsPath);
    const uploadResult = await uploadFileWithDiagnostics(
      gcsPath,
      req.file.buffer,
      req.file.mimetype
    );

    if (!uploadResult.successful) {
      console.error('File upload failed:', uploadResult.error);
      return res.status(500).json({ error: 'Failed to upload procedure document' });
    }

    console.log('File uploaded successfully:', uploadResult.fileUrl);
    
    // Create procedure record with file information
    const [newProcedure] = await db
      .insert(testProcedures)
      .values({
        ...data,
        attachments: JSON.stringify([{
          fileName: req.file.originalname,
          fileUrl: uploadResult.fileUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userId
        }]),
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    console.log('Test procedure created successfully:', newProcedure.id);
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
    
    // Create a partial schema for updates (all fields optional)
    const partialSchema = z.object({
      procedureNumber: z.string().min(1, 'Procedure number is required').optional(),
      procedureName: z.string().min(1, 'Procedure name is required').optional(),
      ndtMethod: z.enum(['LPT', 'MPT', 'RT', 'PT', 'UT', 'MT']).optional(),
      applicableStandard: z.string().optional(),
      procedureRevision: z.string().optional(),
      scope: z.string().optional(),
      technique: z.string().optional(),
      sensitivity: z.string().optional(),
      preparation: z.string().optional(),
      procedureSteps: z.string().optional(),
      evaluation: z.string().optional(),
      documentation: z.string().optional(),
      personnelQualification: z.string().optional(),
      acceptanceCriteria: z.string().optional(),
      limitations: z.string().optional(),
      environmentalConditions: z.string().optional(),
      status: z.enum(['Draft', 'Under Review', 'Approved', 'Superseded']).optional(),
      approvalLevel: z.string().optional(),
      remarks: z.string().optional(),
      tags: z.string().optional()
    });

    console.log('PUT request body:', JSON.stringify(req.body, null, 2));
    const validation = partialSchema.safeParse(req.body);
    
    if (!validation.success) {
      console.log('Validation failed:', validation.error.issues);
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues
      });
    }
    
    console.log('Validation successful, proceeding with update');
    
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
    
    const deletedProcedure = await db
      .delete(testProcedures)
      .where(eq(testProcedures.id, id))
      .returning();
    
    if (deletedProcedure.length === 0) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }
    
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