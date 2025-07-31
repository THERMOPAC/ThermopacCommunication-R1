import express, { Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db';
import { testProcedures, users } from '@shared/schema';
import { eq, and, desc, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { uploadFileWithDiagnostics } from '../utils/gcs-enhanced-upload';
import { initializeGCS } from '../utils/gcs-operations';

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
  if (req.isAuthenticated && req.isAuthenticated()) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

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

    // Upload file to GCS with standards-based path structure
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${data.procedureNumber}.${fileExtension}`;
    
    // Determine standard type from applicableStandard field
    const getStandardType = (standard: string | undefined): string => {
      if (!standard) return 'Other';
      
      // ASME Standards
      if (standard.includes('ASME') || standard.includes('ASTM') || 
          standard.includes('API') || standard.includes('AWS')) {
        return 'ASME';
      }
      
      // EN Standards  
      if (standard.includes('EN')) {
        return 'EN';
      }
      
      return 'Other';
    };
    
    const standardType = getStandardType(data.applicableStandard);
    const gcsPath = `QMS/Test_Procedures/${data.ndtMethod}/${standardType}/${fileName}`;
    
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
    
    // Handle file upload if provided
    let attachmentData = null;
    if (req.file) {
      console.log('File provided for update:', req.file.originalname);
      
      // Get current procedure data for file path construction
      const currentProcedure = await db
        .select({
          procedureNumber: testProcedures.procedureNumber,
          ndtMethod: testProcedures.ndtMethod,
          applicableStandard: testProcedures.applicableStandard
        })
        .from(testProcedures)
        .where(eq(testProcedures.id, id))
        .limit(1);
      
      if (currentProcedure.length === 0) {
        return res.status(404).json({ error: 'Test procedure not found' });
      }
      
      // Use data from form or existing procedure for file path
      const procedureNumber = data.procedureNumber || currentProcedure[0].procedureNumber;
      const ndtMethod = data.ndtMethod || currentProcedure[0].ndtMethod;
      const applicableStandard = data.applicableStandard || currentProcedure[0].applicableStandard;
      
      // Determine standard type from applicableStandard field
      const getStandardType = (standard: string | undefined): string => {
        if (!standard) return 'Other';
        
        // ASME Standards
        if (standard.includes('ASME') || standard.includes('ASTM') || 
            standard.includes('API') || standard.includes('AWS')) {
          return 'ASME';
        }
        
        // EN Standards  
        if (standard.includes('EN')) {
          return 'EN';
        }
        
        return 'Other';
      };
      
      const fileExtension = req.file.originalname.split('.').pop();
      const fileName = `${procedureNumber}.${fileExtension}`;
      const standardType = getStandardType(applicableStandard);
      const gcsPath = `QMS/Test_Procedures/${ndtMethod}/${standardType}/${fileName}`;
      
      console.log('Uploading updated file to GCS path:', gcsPath);
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
      
      attachmentData = JSON.stringify([{
        fileName: req.file.originalname,
        fileUrl: uploadResult.fileUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userId
      }]);
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
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    // Check if test procedure exists
    const existingProcedure = await db
      .select({
        id: testProcedures.id,
        procedureNumber: testProcedures.procedureNumber,
        attachments: testProcedures.attachments
      })
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);
    
    if (existingProcedure.length === 0) {
      return res.status(404).json({ error: 'Test procedure not found' });
    }
    
    const procedure = existingProcedure[0];
    
    // Upload file to GCS
    const uploadResult = await uploadFileWithDiagnostics(
      req.file.buffer,
      `QMS/Test_Procedures/${procedure.procedureNumber}/${req.file.originalname}`,
      req.file.mimetype
    );
    
    if (!uploadResult.success) {
      console.error('File upload failed:', uploadResult.error);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
    
    // Parse existing attachments
    let attachments = [];
    if (procedure.attachments) {
      try {
        attachments = JSON.parse(procedure.attachments);
      } catch (error) {
        console.error('Error parsing existing attachments:', error);
        attachments = [];
      }
    }
    
    // Add new attachment
    const newAttachment = {
      fileName: req.file.originalname,
      fileUrl: uploadResult.fileUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId
    };
    
    attachments.push(newAttachment);
    
    // Update procedure with new attachment
    await db
      .update(testProcedures)
      .set({
        attachments: JSON.stringify(attachments),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(testProcedures.id, id));
    
    res.json({
      message: 'File uploaded successfully',
      fileUrl: uploadResult.fileUrl,
      fileName: req.file.originalname
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
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

// GET /api/quality/test-procedures/:id/download - Download test procedure file
router.get('/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
  console.log('='.repeat(80));
  console.log('🔥🔥🔥 TEST PROCEDURES DOWNLOAD ENDPOINT HIT!!! 🔥🔥🔥');
  console.log('Request ID:', req.params.id);
  console.log('Request URL:', req.url);
  console.log('Request Path:', req.path);
  console.log('='.repeat(80));
  
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      console.log('❌ Invalid ID provided:', req.params.id);
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    // Get procedure from database
    const [procedure] = await db
      .select()
      .from(testProcedures)
      .where(eq(testProcedures.id, id))
      .limit(1);

    if (!procedure) {
      console.log('❌ Procedure not found for ID:', id);
      return res.status(404).json({ error: 'Test procedure not found' });
    }

    console.log('✅ Found procedure:', {
      id: procedure.id,
      procedureNumber: procedure.procedureNumber,
      ndtMethod: procedure.ndtMethod,
      applicableStandard: procedure.applicableStandard,
      hasAttachments: !!procedure.attachments
    });

    // Helper function to determine standard type
    const getStandardType = (standard: string | undefined): string => {
      if (!standard) return 'ASME';
      if (standard.includes('EN')) return 'EN';
      if (standard.includes('ASTM')) return 'ASTM';
      return 'ASME';
    };

    const standardType = getStandardType(procedure.applicableStandard);
    console.log('🎯 Standard type determined:', standardType, 'from:', procedure.applicableStandard);

    // Build comprehensive path strategies based on your GCS structure documentation
    const pathStrategies = [];

    // Strategy 1: Official GCS path structure (most likely correct)
    const officialPath = `QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.pdf`;
    pathStrategies.push({
      name: 'Official GCS Structure',
      path: officialPath
    });

    // Strategy 2: Try with different extensions for official structure
    const extensions = ['PDF', 'doc', 'docx', 'DOC', 'DOCX'];
    extensions.forEach(ext => {
      pathStrategies.push({
        name: `Official Structure (${ext})`,
        path: `QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.${ext}`
      });
    });

    // Strategy 3: Try with uploaded filename from database if available
    if (procedure.attachments) {
      try {
        const attachments = JSON.parse(procedure.attachments);
        console.log('📎 Parsed attachments:', attachments);
        if (attachments.length > 0) {
          const attachment = attachments[0];
          const uploadedFileName = attachment.fileName || attachment.filename || attachment.originalName;
          if (uploadedFileName) {
            pathStrategies.push({
              name: 'Using Uploaded Filename',
              path: `QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${uploadedFileName}`
            });
          }
        }
      } catch (e) {
        console.log('⚠️ Could not parse attachments:', e);
      }
    }

    // Strategy 4: Alternative standard types (in case of misclassification)
    const alternativeStandards = ['ASME', 'EN', 'ASTM'].filter(s => s !== standardType);
    alternativeStandards.forEach(altStandard => {
      pathStrategies.push({
        name: `Alternative ${altStandard} Standard`,
        path: `QMS/Test_Procedures/${procedure.ndtMethod}/${altStandard}/${procedure.procedureNumber}.pdf`
      });
    });

    // Strategy 5: Legacy or alternative structures
    pathStrategies.push(
      {
        name: 'Flat Structure',
        path: `QMS/Test_Procedures/${procedure.procedureNumber}.pdf`
      },
      {
        name: 'Method Only Structure',
        path: `QMS/Test_Procedures/${procedure.ndtMethod}/${procedure.procedureNumber}.pdf`
      }
    );

    const { bucket } = await initializeGCS();
    let foundFile = null;
    let foundPath = '';

    // First, let's see what files actually exist in the Test_Procedures directory
    console.log('📁 Scanning GCS for Test Procedures files...');
    let allFiles = [];
    try {
      const [files] = await bucket.getFiles({
        prefix: 'QMS/Test_Procedures/'
      });
      allFiles = files.map(f => f.name);
      console.log('📋 Found files in Test_Procedures directory:');
      files.forEach((file, index) => {
        console.log(`${index + 1}. ${file.name}`);
      });
      
      // Also check if our specific procedure file exists in any form
      const relatedFiles = files.filter(f => 
        f.name.includes('TP-2025-001') || 
        f.name.includes('PT') || 
        f.name.includes('NDT PRO')
      );
      console.log('🔍 Files related to TP-2025-001 or PT or NDT PRO:');
      relatedFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name}`);
      });
    } catch (e) {
      console.log('⚠️ Could not scan GCS directory:', e.message);
    }

    // Try each path strategy
    for (const strategy of pathStrategies) {
      try {
        console.log(`🔍 Trying ${strategy.name}: ${strategy.path}`);
        const file = bucket.file(strategy.path);
        const [exists] = await file.exists();
        
        if (exists) {
          console.log(`✅ Found file using ${strategy.name}: ${strategy.path}`);
          foundFile = file;
          foundPath = strategy.path;
          break;
        }
      } catch (e) {
        console.log(`❌ Error checking ${strategy.name}:`, e.message);
      }
    }

    if (!foundFile) {
      console.log('❌ No file found with any strategy for procedure:', procedure.procedureNumber);
      
      // Additional debugging information
      let attachmentInfo = 'No attachments data';
      if (procedure.attachments) {
        try {
          const attachments = JSON.parse(procedure.attachments);
          attachmentInfo = `Found ${attachments.length} attachment(s): ${attachments.map(a => a.fileName || a.filename || 'unnamed').join(', ')}`;
        } catch (e) {
          attachmentInfo = 'Could not parse attachments';
        }
      }
      
      console.log('📎 Attachment status:', attachmentInfo);
      console.log('🎯 Expected primary path:', `QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.pdf`);
      
      return res.status(404).json({ 
        error: 'File not found in storage',
        procedureNumber: procedure.procedureNumber,
        expectedPath: `QMS/Test_Procedures/${procedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.pdf`,
        attachmentInfo: attachmentInfo,
        triedPaths: pathStrategies.map(s => s.path),
        suggestion: 'The file may need to be uploaded. Use the Upload button to add the document.'
      });
    }

    // Generate signed URL
    const [signedUrl] = await foundFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    console.log('✅ Generated signed URL for:', foundPath);

    res.json({
      downloadUrl: signedUrl,
      fileName: foundPath.split('/').pop() || `${procedure.procedureNumber}.pdf`,
      procedureNumber: procedure.procedureNumber,
      foundPath: foundPath
    });

  } catch (error) {
    console.error('❌ Error in test procedure download:', error);
    res.status(500).json({ error: 'Failed to download test procedure' });
  }
});

export default router;