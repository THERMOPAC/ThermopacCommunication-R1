import express, { Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db';
import { testProcedures, users } from '@shared/schema';
import { eq, and, desc, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { uploadFileWithDiagnostics } from '../utils/gcs-enhanced-upload';
import { initializeGCS, buildProcedureGcsPrefixes, listFilesFromGCS } from '../utils/gcs-operations';
import { ensureAuthenticated } from '../auth-middleware';
import {
  createRevision, logDownload, logAuditEvent, softDeleteRevision,
  getLatestRevision, checkUploadPermission, checkDeletePermission,
  resolveQmsRuleId, type QmsModule,
} from '../utils/qms-file-governance';

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


const router = express.Router();

// Test route to verify routing is working
router.get('/test', (req: Request, res: Response) => {
  console.log('🧪 Test route reached successfully');
  res.json({ message: 'Test procedures routing is working', timestamp: new Date() });
});

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

// Updated validation schema - all fields mandatory except remarks
const testProcedureSchema = z.object({
  procedureNumber: z.string().min(1, 'Procedure number is required'),
  procedureName: z.string().min(1, 'Procedure name is required'),
  ndtMethod: z.enum(['HT', 'PNT', 'RT', 'PT', 'UT', 'MT']),
  applicableStandard: z.string().min(1, 'Applicable standard is required'),
  procedureRevision: z.string().min(1, 'Procedure revision is required').default('R1'),
  scope: z.string().min(1, 'Scope is required'),
  technique: z.string().min(1, 'Technique is required'),
  sensitivity: z.string().min(1, 'Sensitivity is required'),
  preparation: z.string().min(1, 'Preparation is required'),
  procedureSteps: z.string().min(1, 'Procedure steps are required'),
  evaluation: z.string().min(1, 'Evaluation is required'),
  documentation: z.string().min(1, 'Documentation is required'),
  personnelQualification: z.string().min(1, 'Personnel qualification is required'),
  acceptanceCriteria: z.string().min(1, 'Acceptance criteria is required'),
  limitations: z.string().min(1, 'Limitations are required'),
  environmentalConditions: z.string().min(1, 'Environmental conditions are required'),
  status: z.enum(['Draft', 'Under Review', 'Approved', 'Superseded']).default('Draft'),
  approvalLevel: z.enum(['Level 1', 'Level 2', 'Level 3'], {
    errorMap: () => ({ message: 'Approval level is required' })
  }),
  remarks: z.string().optional(), // Only field that remains optional
  tags: z.string().min(1, 'Tags are required'),
}).transform((data) => ({
  ...data,
  approvalLevel: data.approvalLevel === '' ? undefined : data.approvalLevel
}));

// GET /api/quality/test-procedures - Get all test procedures
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('🔍 Test Procedures API called with query:', req.query);
    const { search, ndtMethod, status } = req.query;
    
    // Build query with optional filters
    let query = db.select().from(testProcedures);
    
    // Apply filters if provided
    if (status) {
      query = query.where(eq(testProcedures.status, status as string));
    }
    
    if (search) {
      query = query.where(
        or(
          ilike(testProcedures.procedureNumber, `%${search}%`),
          ilike(testProcedures.procedureName, `%${search}%`)
        )
      );
    }
    
    if (ndtMethod) {
      query = query.where(eq(testProcedures.ndtMethod, ndtMethod as string));
    }
    
    // Execute query with ordering
    const procedures = await query.orderBy(desc(testProcedures.createdAt));
    
    console.log('📋 Found procedures:', procedures.length);
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

    const user = (req as any).user;
    const userRole = user?.role || '';
    const roleCheck = checkUploadPermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const revLabel = data.procedureRevision || 'R1';

    const [newProcedure] = await db
      .insert(testProcedures)
      .values({
        ...data,
        attachments: null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    const testProcRuleId = await resolveQmsRuleId('TEST_PROCEDURE');

    try {
      const govResult = await createRevision({
        module: 'TestProcedures' as QmsModule,
        documentNumber: data.procedureNumber,
        label: `procedure-${revLabel}`,
        fileBuffer: req.file.buffer,
        originalFileName: req.file.originalname,
        contentType: req.file.mimetype,
        parentEntityType: 'test_procedure',
        parentEntityId: newProcedure.id,
        userId,
        userRole,
        ipAddress: req.ip,
        ruleId: testProcRuleId,
      });

      await db.update(testProcedures)
        .set({
          attachments: JSON.stringify([{
            fileName: req.file.originalname,
            fileUrl: govResult.gcsPath,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userId,
            revisionNumber: govResult.revisionNumber,
          }]),
        })
        .where(eq(testProcedures.id, newProcedure.id));

      console.log(`Test procedure uploaded via governance: ${govResult.gcsPath} (rev ${govResult.revisionNumber})`);
    } catch (govErr) {
      console.error('Governance upload failed:', govErr);
      return res.status(500).json({ error: 'Failed to upload procedure document via governance' });
    }

    console.log('Test procedure created successfully:', newProcedure.id);
    res.status(201).json(newProcedure);
  } catch (error) {
    console.error('Error creating test procedure:', error);
    res.status(500).json({ error: 'Failed to create test procedure' });
  }
});

// PUT /api/quality/test-procedures/:id - Update test procedure (with optional file upload)
router.put('/:id', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
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
      ndtMethod: z.enum(['HT', 'PNT', 'RT', 'PT', 'UT', 'MT']).optional(),
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
      approvalLevel: z.enum(['Level 1', 'Level 2', 'Level 3']).optional().or(z.literal('')),
      remarks: z.string().optional(),
      tags: z.string().optional()
    }).transform((data) => ({
      ...data,
      approvalLevel: data.approvalLevel === '' ? undefined : data.approvalLevel
    }));

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
    
    let attachmentData = null;
    if (req.file) {
      const user = (req as any).user;
      const userRole = user?.role || '';
      const roleCheck = checkUploadPermission(userRole);
      if (!roleCheck.allowed) {
        return res.status(403).json({ error: roleCheck.reason });
      }

      const currentProcedure = await db
        .select({
          procedureNumber: testProcedures.procedureNumber,
          procedureRevision: testProcedures.procedureRevision,
        })
        .from(testProcedures)
        .where(eq(testProcedures.id, id))
        .limit(1);

      if (currentProcedure.length === 0) {
        return res.status(404).json({ error: 'Test procedure not found' });
      }

      const procedureNumber = data.procedureNumber || currentProcedure[0].procedureNumber;
      const revLabel = data.procedureRevision || currentProcedure[0].procedureRevision || 'R1';

      const testProcRuleId = await resolveQmsRuleId('TEST_PROCEDURE');
      try {
        const govResult = await createRevision({
          module: 'TestProcedures' as QmsModule,
          documentNumber: procedureNumber,
          label: `procedure-${revLabel}`,
          fileBuffer: req.file.buffer,
          originalFileName: req.file.originalname,
          contentType: req.file.mimetype,
          parentEntityType: 'test_procedure',
          parentEntityId: id,
          userId,
          userRole,
          ipAddress: req.ip,
          ruleId: testProcRuleId,
        });

        attachmentData = JSON.stringify([{
          fileName: req.file.originalname,
          fileUrl: govResult.gcsPath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userId,
          revisionNumber: govResult.revisionNumber,
        }]);
        console.log(`Test procedure revised via governance: ${govResult.gcsPath} (rev ${govResult.revisionNumber})`);
      } catch (govErr) {
        console.error('Governance revision failed:', govErr);
        return res.status(500).json({ error: 'Failed to create file revision' });
      }
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
    
    const updatePayload: any = {
      ...data,
      updatedBy: userId,
      updatedAt: new Date(),
    };
    
    // Include attachment data if file was uploaded
    if (attachmentData) {
      updatePayload.attachments = attachmentData;
    }
    
    const [updatedProcedure] = await db
      .update(testProcedures)
      .set(updatePayload)
      .where(eq(testProcedures.id, id))
      .returning();
    
    res.json(updatedProcedure);
  } catch (error) {
    console.error('Error updating test procedure:', error);
    res.status(500).json({ error: 'Failed to update test procedure' });
  }
});

// POST /api/quality/test-procedures/:id/upload - Upload file for existing test procedure
router.post('/:id/upload', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.user as any)?.id;
    const user = (req as any).user;
    const userRole = user?.role || '';

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const roleCheck = checkUploadPermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const existingProcedure = await db
      .select({
        id: testProcedures.id,
        procedureNumber: testProcedures.procedureNumber,
        procedureRevision: testProcedures.procedureRevision,
      })
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);

    if (existingProcedure.length === 0) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }

    const procedure = existingProcedure[0];
    const revLabel = procedure.procedureRevision || 'R1';
    const label = req.body.label || `attachment-${revLabel}`;

    const testProcRuleId = await resolveQmsRuleId('TEST_PROCEDURE');
    const govResult = await createRevision({
      module: 'TestProcedures' as QmsModule,
      documentNumber: procedure.procedureNumber,
      label,
      fileBuffer: req.file.buffer,
      originalFileName: req.file.originalname,
      contentType: req.file.mimetype,
      parentEntityType: 'test_procedure',
      parentEntityId: id,
      userId,
      userRole,
      ipAddress: req.ip,
      ruleId: testProcRuleId,
    });

    await db
      .update(testProcedures)
      .set({
        attachments: JSON.stringify([{
          fileName: req.file.originalname,
          fileUrl: govResult.gcsPath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userId,
          revisionNumber: govResult.revisionNumber,
        }]),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(testProcedures.id, id));

    console.log(`Test procedure file uploaded via governance: ${govResult.gcsPath}`);
    res.json({
      message: 'File uploaded successfully',
      fileUrl: govResult.gcsPath,
      fileName: req.file.originalname,
      revisionNumber: govResult.revisionNumber,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// DELETE /api/quality/test-procedures/:id - Soft-delete test procedure (Superuser only)
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.user as any)?.id;
    const user = (req as any).user;
    const userRole = user?.role || '';

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    const roleCheck = checkDeletePermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const [procedure] = await db
      .select({ id: testProcedures.id, procedureNumber: testProcedures.procedureNumber })
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);

    if (!procedure) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }

    const latestRev = await getLatestRevision('TestProcedures', procedure.procedureNumber);
    if (latestRev) {
      await softDeleteRevision({
        revisionId: latestRev.id,
        userId: userId || 0,
        userRole,
        ipAddress: req.ip,
        reason: req.body?.reason || 'Test procedure deleted',
      });
    }

    await logAuditEvent({
      action: 'soft_delete',
      module: 'TestProcedures',
      documentNumber: procedure.procedureNumber,
      userId: userId || 0,
      userRole,
      ipAddress: req.ip,
      details: { procedureId: id, reason: req.body?.reason },
    });

    const [deletedProcedure] = await db
      .delete(testProcedures)
      .where(eq(testProcedures.id, id))
      .returning();

    if (!deletedProcedure) {
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

// GET /api/quality/test-procedures/:id/download - Download test procedure file
router.get('/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.user as any)?.id || 0;
    const userRole = ((req as any).user)?.role || '';

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    const [procedure] = await db
      .select()
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);

    if (!procedure) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }

    const latestRev = await getLatestRevision('TestProcedures', procedure.procedureNumber);

    if (latestRev) {
      const { bucket } = await initializeGCS();
      const file = bucket.file(latestRev.gcsPath);
      const [exists] = await file.exists();

      if (exists) {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000,
        });

        await logDownload({
          module: 'TestProcedures',
          documentNumber: procedure.procedureNumber,
          gcsPath: latestRev.gcsPath,
          userId,
          userRole,
          ipAddress: req.ip,
        });

        return res.json({
          downloadUrl: signedUrl,
          fileName: latestRev.originalFileName,
          procedureNumber: procedure.procedureNumber,
          revisionNumber: latestRev.revisionNumber,
          foundPath: latestRev.gcsPath,
        });
      }
    }

    const getStandardType = (standard: string | undefined): string => {
      if (!standard) return 'Others';
      const su = standard.toUpperCase();
      if (su.includes('ASME')) return 'ASME';
      if (su.includes('EN') || su.includes('ISO')) return 'EN';
      return 'Others';
    };

    const standardType = getStandardType(procedure.applicableStandard);
    const pathStrategies: string[] = [
      `QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.pdf`,
    ];
    const exts = ['PDF', 'doc', 'docx', 'DOC', 'DOCX'];
    exts.forEach(ext => {
      pathStrategies.push(`QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.${ext}`);
    });

    if (procedure.attachments) {
      try {
        const atts = JSON.parse(procedure.attachments);
        if (atts.length > 0) {
          const fn = atts[0].fileName || atts[0].filename;
          if (fn) pathStrategies.push(`QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${fn}`);
        }
      } catch (_e) {}
    }

    ['ASME', 'EN', 'Others'].filter(s => s !== standardType).forEach(alt => {
      pathStrategies.push(`QMS/Test_Procedures/${procedure.ndtMethod}/${alt}/${procedure.procedureNumber}.pdf`);
    });
    pathStrategies.push(`QMS/Test_Procedures/${procedure.procedureNumber}.pdf`);
    pathStrategies.push(`QMS/Test_Procedures/${procedure.ndtMethod}/${procedure.procedureNumber}.pdf`);

    // Governance root (QMS/TestProcedures/ — camelCase, no underscore).
    // getLatestRevision above is the primary mechanism for governed revisions in the DB.
    // These entries cover belt-and-suspenders cases where a file exists at the governance
    // GCS prefix but has not yet been indexed into qms_document_revisions.
    if (procedure.ndtMethod) {
      pathStrategies.push(`QMS/TestProcedures/${procedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.pdf`);
      ['ASME', 'EN', 'Others'].filter(s => s !== standardType).forEach(alt => {
        pathStrategies.push(`QMS/TestProcedures/${procedure.ndtMethod}/${alt}/${procedure.procedureNumber}.pdf`);
      });
      pathStrategies.push(`QMS/TestProcedures/${procedure.ndtMethod}/${procedure.procedureNumber}.pdf`);
    }
    pathStrategies.push(`QMS/TestProcedures/${procedure.procedureNumber}.pdf`);

    const { bucket } = await initializeGCS();
    let foundPath = '';
    let foundFile: any = null;

    for (const p of pathStrategies) {
      try {
        const f = bucket.file(p);
        const [ex] = await f.exists();
        if (ex) { foundFile = f; foundPath = p; break; }
      } catch (_e) {}
    }

    if (!foundFile) {
      return res.status(404).json({
        error: 'File not found in storage',
        procedureNumber: procedure.procedureNumber,
        suggestion: 'The file may need to be uploaded. Use the Upload button to add the document.',
      });
    }

    const [signedUrl] = await foundFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });

    await logDownload({
      module: 'TestProcedures',
      documentNumber: procedure.procedureNumber,
      gcsPath: foundPath,
      userId,
      userRole,
      ipAddress: req.ip,
      details: { source: 'legacy_fallback' },
    });

    res.json({
      downloadUrl: signedUrl,
      fileName: foundPath.split('/').pop() || `${procedure.procedureNumber}.pdf`,
      procedureNumber: procedure.procedureNumber,
      foundPath,
    });
  } catch (error) {
    console.error('Error in test procedure download:', error);
    res.status(500).json({ error: 'Failed to download test procedure' });
  }
});

// GET /api/quality/test-procedures/:id/files - List files from GCS for a test procedure
router.get('/:id/files', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }
    
    // Get procedure details needed for path construction
    const procedure = await db
      .select({
        id: testProcedures.id,
        procedureNumber: testProcedures.procedureNumber,
        ndtMethod: testProcedures.ndtMethod,
        applicableStandard: testProcedures.applicableStandard
      })
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);
    
    if (procedure.length === 0) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }
    
    const proc = procedure[0];
    console.log(`📁 Listing files for procedure: ${proc.procedureNumber}`);
    
    // Build GCS path prefixes (current and legacy)
    const prefixes = buildProcedureGcsPrefixes({
      procedureNumber: proc.procedureNumber,
      ndtMethod: proc.ndtMethod || undefined,
      applicableStandard: proc.applicableStandard || undefined,
    });
    
    console.log(`🔍 Searching GCS prefixes:`, prefixes);
    
    // List files from GCS
    const result = await listFilesFromGCS(prefixes);
    
    if (!result.success) {
      console.error('Failed to list files from GCS:', result.error);
      return res.status(503).json({ 
        files: [], 
        error: result.error || 'Failed to access Google Cloud Storage'
      });
    }
    
    console.log(`📋 Found ${result.files.length} files for procedure ${proc.procedureNumber}`);
    
    res.json({
      files: result.files,
      procedureNumber: proc.procedureNumber,
      searchedPrefixes: prefixes
    });
    
  } catch (error) {
    console.error('Error listing procedure files:', error);
    res.status(500).json({ 
      files: [], 
      error: 'Failed to list procedure files' 
    });
  }
});

export default router;