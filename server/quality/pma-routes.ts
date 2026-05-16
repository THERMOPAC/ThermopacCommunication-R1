import express, { Request, Response } from 'express';
import { db } from '../db';
import { pmaDocuments, users, materialIdentification } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { pmaDocumentSchema, InsertPmaDocument } from '@shared/schema';
import { uploadFileWithDiagnostics } from '../utils/gcs-enhanced-upload';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import multer from 'multer';
import {
  createRevision, logDownload, logAuditEvent, softDeleteRevision,
  getLatestRevision, checkUploadPermission, checkDeletePermission,
  resolveQmsRuleId, type QmsModule,
} from '../utils/qms-file-governance';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get next available PMA number
router.get('/next-number', async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get the highest sequence number for current year
    const latestPma = await db
      .select({
        pmaNumber: pmaDocuments.pmaNumber
      })
      .from(pmaDocuments)
      .where(sql`${pmaDocuments.pmaNumber} LIKE ${'PMA-' + currentYear + '-%'}`)
      .orderBy(desc(pmaDocuments.pmaNumber))
      .limit(1);

    let nextSequence = 1;
    if (latestPma.length > 0) {
      // Extract sequence number from PMA-YYYY-XXX format
      const match = latestPma[0].pmaNumber.match(/PMA-\d{4}-(\d{3})/);
      if (match) {
        nextSequence = parseInt(match[1]) + 1;
      }
    }

    // Format as PMA-YYYY-XXX (3 digits with leading zeros)
    const nextPmaNumber = `PMA-${currentYear}-${nextSequence.toString().padStart(3, '0')}`;
    
    res.json({ pmaNumber: nextPmaNumber });
  } catch (error) {
    console.error('Error generating next PMA number:', error);
    res.status(500).json({ error: 'Failed to generate next PMA number' });
  }
});

// Get active PMA documents (non-expired) - MUST be before /:id route
router.get('/active', async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const activePMADocuments = await db
      .select({
        id: pmaDocuments.id,
        pmaNumber: pmaDocuments.pmaNumber,
        specification: pmaDocuments.specification,
        grade: pmaDocuments.grade,
        certifiedBy: pmaDocuments.certifiedBy,
        status: pmaDocuments.status,
        issueDate: pmaDocuments.issueDate,
        expiryDate: pmaDocuments.expiryDate,
      })
      .from(pmaDocuments)
      .where(
        sql`${pmaDocuments.status} = 'Active' AND ${pmaDocuments.expiryDate} >= ${today}`
      )
      .orderBy(pmaDocuments.pmaNumber);

    res.json(activePMADocuments);
  } catch (error) {
    console.error('Error fetching active PMA documents:', error);
    res.status(500).json({ error: 'Failed to fetch active PMA documents' });
  }
});

// Get all PMA documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const documents = await db
      .select({
        id: pmaDocuments.id,
        pmaNumber: pmaDocuments.pmaNumber,
        specification: pmaDocuments.specification,
        grade: pmaDocuments.grade,
        certifiedBy: pmaDocuments.certifiedBy,
        status: pmaDocuments.status,
        remarks: pmaDocuments.remarks,
        issueDate: pmaDocuments.issueDate,
        expiryDate: pmaDocuments.expiryDate,
        filePath: pmaDocuments.filePath,
        fileUrl: pmaDocuments.fileUrl,
        originalFileName: pmaDocuments.originalFileName,
        createdBy: pmaDocuments.createdBy,
        createdAt: pmaDocuments.createdAt,
        updatedAt: pmaDocuments.updatedAt,
        creatorName: users.username,
      })
      .from(pmaDocuments)
      .leftJoin(users, eq(pmaDocuments.createdBy, users.id))
      .orderBy(desc(pmaDocuments.createdAt));

    res.json(documents);
  } catch (error) {
    console.error('Error fetching PMA documents:', error);
    res.status(500).json({ error: 'Failed to fetch PMA documents' });
  }
});

// Get PMA document by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const document = await db
      .select({
        id: pmaDocuments.id,
        pmaNumber: pmaDocuments.pmaNumber,
        specification: pmaDocuments.specification,
        grade: pmaDocuments.grade,
        certifiedBy: pmaDocuments.certifiedBy,
        status: pmaDocuments.status,
        remarks: pmaDocuments.remarks,
        issueDate: pmaDocuments.issueDate,
        expiryDate: pmaDocuments.expiryDate,
        filePath: pmaDocuments.filePath,
        fileUrl: pmaDocuments.fileUrl,
        originalFileName: pmaDocuments.originalFileName,
        createdBy: pmaDocuments.createdBy,
        createdAt: pmaDocuments.createdAt,
        updatedAt: pmaDocuments.updatedAt,
        creatorName: users.username,
      })
      .from(pmaDocuments)
      .leftJoin(users, eq(pmaDocuments.createdBy, users.id))
      .where(eq(pmaDocuments.id, id))
      .limit(1);

    if (document.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    res.json(document[0]);
  } catch (error) {
    console.error('Error fetching PMA document:', error);
    res.status(500).json({ error: 'Failed to fetch PMA document' });
  }
});

// Create new PMA document with file upload
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const validatedData = pmaDocumentSchema.parse(req.body);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'File upload is required' });
    }

    // Validate file type (PDF or DOCX only)
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Only PDF and DOCX files are allowed' });
    }

    const userRole = user?.role || '';
    const roleCheck = checkUploadPermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const newDocument = await db
      .insert(pmaDocuments)
      .values({
        pmaNumber: validatedData.pmaNumber,
        specification: validatedData.specification,
        grade: validatedData.grade,
        certifiedBy: validatedData.certifiedBy,
        status: validatedData.status || 'Draft',
        remarks: validatedData.remarks,
        issueDate: validatedData.issueDate,
        expiryDate: validatedData.expiryDate,
        filePath: null,
        fileUrl: null,
        originalFileName: file.originalname,
        createdBy: user.id,
      })
      .returning();

    const created = newDocument[0];

    const pmaRuleId = await resolveQmsRuleId('PMA');
    try {
      const govResult = await createRevision({
        module: 'PMA' as QmsModule,
        documentNumber: validatedData.pmaNumber,
        label: 'material-approval',
        fileBuffer: file.buffer,
        originalFileName: file.originalname,
        contentType: file.mimetype,
        parentEntityType: 'pma_document',
        parentEntityId: created.id,
        userId: user.id,
        userRole,
        ipAddress: req.ip,
        ruleId: pmaRuleId,
      });

      await db.update(pmaDocuments)
        .set({ filePath: govResult.gcsPath, fileUrl: govResult.gcsPath })
        .where(eq(pmaDocuments.id, created.id));
      created.filePath = govResult.gcsPath;
      created.fileUrl = govResult.gcsPath;
    } catch (govErr) {
      console.error('PMA governance upload failed:', govErr);
      return res.status(500).json({ error: 'Failed to upload file via governance' });
    }

    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating PMA document:', error);
    res.status(500).json({ error: 'Failed to create PMA document' });
  }
});



// Update PMA document
router.put('/:id', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const validatedData = pmaDocumentSchema.parse(req.body);
    const file = req.file;

    let updateData: any = {
      pmaNumber: validatedData.pmaNumber,
      specification: validatedData.specification,
      grade: validatedData.grade,
      certifiedBy: validatedData.certifiedBy,
      status: validatedData.status || 'Draft',
      remarks: validatedData.remarks,
      issueDate: validatedData.issueDate,
      expiryDate: validatedData.expiryDate,
      updatedAt: new Date(),
    };

    if (file) {
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: 'Only PDF and DOCX files are allowed' });
      }

      const userRole = user?.role || '';
      const roleCheck = checkUploadPermission(userRole);
      if (!roleCheck.allowed) {
        return res.status(403).json({ error: roleCheck.reason });
      }

      const pmaRuleId = await resolveQmsRuleId('PMA');
      try {
        const govResult = await createRevision({
          module: 'PMA' as QmsModule,
          documentNumber: validatedData.pmaNumber,
          label: 'material-approval',
          fileBuffer: file.buffer,
          originalFileName: file.originalname,
          contentType: file.mimetype,
          parentEntityType: 'pma_document',
          parentEntityId: id,
          userId: user.id,
          userRole,
          ipAddress: req.ip,
          ruleId: pmaRuleId,
        });

        updateData.filePath = govResult.gcsPath;
        updateData.fileUrl = govResult.gcsPath;
        updateData.originalFileName = file.originalname;
      } catch (govErr) {
        console.error('PMA governance revision failed:', govErr);
        return res.status(500).json({ error: 'Failed to create file revision' });
      }
    }

    // Update PMA document record
    const updatedDocument = await db
      .update(pmaDocuments)
      .set(updateData)
      .where(eq(pmaDocuments.id, id))
      .returning();

    if (updatedDocument.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    res.json(updatedDocument[0]);
  } catch (error) {
    console.error('Error updating PMA document:', error);
    res.status(500).json({ error: 'Failed to update PMA document' });
  }
});

// Upload file to existing PMA document
router.post('/:id/upload', upload.single('document'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate file type (PDF, DOC, DOCX only)
    const allowedTypes = [
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Only PDF, DOC, and DOCX files are allowed' });
    }

    // Get existing PMA document
    const existingDoc = await db
      .select()
      .from(pmaDocuments)
      .where(eq(pmaDocuments.id, id))
      .limit(1);

    if (existingDoc.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    const userRole = user?.role || '';
    const roleCheck = checkUploadPermission(userRole);
    if (!roleCheck.allowed) {
      return res.status(403).json({ error: roleCheck.reason });
    }

    const pmaRuleId = await resolveQmsRuleId('PMA');
    try {
      const govResult = await createRevision({
        module: 'PMA' as QmsModule,
        documentNumber: existingDoc[0].pmaNumber,
        label: 'material-approval',
        fileBuffer: file.buffer,
        originalFileName: file.originalname,
        contentType: file.mimetype,
        parentEntityType: 'pma_document',
        parentEntityId: id,
        userId: user.id,
        userRole,
        ipAddress: req.ip,
        ruleId: pmaRuleId,
      });

      const updatedDocument = await db
        .update(pmaDocuments)
        .set({
          filePath: govResult.gcsPath,
          fileUrl: govResult.gcsPath,
          originalFileName: file.originalname,
          updatedAt: new Date(),
        })
        .where(eq(pmaDocuments.id, id))
        .returning();

      res.json({
        message: 'File uploaded successfully',
        document: updatedDocument[0],
      });
    } catch (govErr) {
      console.error('PMA governance upload failed:', govErr);
      return res.status(500).json({ error: 'Failed to upload file via governance' });
    }
  } catch (error) {
    console.error('Error uploading file to PMA document:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const user = req.user as any;
    const userRole = user?.role || '';
    const deleteCheck = checkDeletePermission(userRole);
    if (!deleteCheck.allowed) {
      return res.status(403).json({ error: deleteCheck.reason });
    }

    const existing = await db.select().from(pmaDocuments).where(eq(pmaDocuments.id, id)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    const reason = req.body?.reason || 'No reason provided';
    const governed = await getLatestRevision('PMA', existing[0].pmaNumber);
    if (governed) {
      await softDeleteRevision({
        module: 'PMA',
        documentNumber: existing[0].pmaNumber,
        revisionId: governed.revisionId,
        userId: user?.id || 0,
        userRole,
        reason,
        ipAddress: req.ip,
      });
    }

    const deletedDocument = await db.delete(pmaDocuments).where(eq(pmaDocuments.id, id)).returning();

    await logAuditEvent({
      module: 'PMA',
      documentNumber: existing[0].pmaNumber,
      action: 'soft_delete',
      userId: user?.id || 0,
      userRole,
      ipAddress: req.ip,
      details: { reason, entityDeleted: true },
    });

    res.json({ message: 'PMA document deleted successfully (files preserved)' });
  } catch (error) {
    console.error('Error deleting PMA document:', error);
    res.status(500).json({ error: 'Failed to delete PMA document' });
  }
});



// Get PMA documents/files by PMA ID - for file info component
router.get('/:id/documents', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const document = await db
      .select({
        id: pmaDocuments.id,
        pmaNumber: pmaDocuments.pmaNumber,
        filePath: pmaDocuments.filePath,
        fileUrl: pmaDocuments.fileUrl,
        originalFileName: pmaDocuments.originalFileName,
        createdBy: pmaDocuments.createdBy,
        createdAt: pmaDocuments.createdAt,
        updatedAt: pmaDocuments.updatedAt,
        creatorName: users.username,
      })
      .from(pmaDocuments)
      .leftJoin(users, eq(pmaDocuments.createdBy, users.id))
      .where(eq(pmaDocuments.id, id))
      .limit(1);

    if (document.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    // Return as array to match expected format for file info components
    const documentInfo = document[0];
    if (documentInfo.filePath && documentInfo.originalFileName) {
      res.json([{
        id: documentInfo.id,
        fileName: documentInfo.originalFileName,
        filePath: documentInfo.filePath,
        fileUrl: documentInfo.fileUrl,
        uploadDate: documentInfo.createdAt,
        uploadedBy: documentInfo.creatorName,
        lastModified: documentInfo.updatedAt,
        documentType: 'PMA Document',
        description: `PMA Document: ${documentInfo.pmaNumber}`,
        fileSize: null // Not stored in database
      }]);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching PMA documents:', error);
    res.status(500).json({ error: 'Failed to fetch PMA documents' });
  }
});

// Get PMA document by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const document = await db
      .select({
        id: pmaDocuments.id,
        pmaNumber: pmaDocuments.pmaNumber,
        specification: pmaDocuments.specification,
        grade: pmaDocuments.grade,
        status: pmaDocuments.status,
        remarks: pmaDocuments.remarks,
        expiryDate: pmaDocuments.expiryDate,
        filePath: pmaDocuments.filePath,
        fileUrl: pmaDocuments.fileUrl,
        originalFileName: pmaDocuments.originalFileName,
        createdBy: pmaDocuments.createdBy,
        createdAt: pmaDocuments.createdAt,
        updatedAt: pmaDocuments.updatedAt,
        creatorName: users.username,
      })
      .from(pmaDocuments)
      .leftJoin(users, eq(pmaDocuments.createdBy, users.id))
      .where(eq(pmaDocuments.id, id))
      .limit(1);

    if (document.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    res.json(document[0]);
  } catch (error) {
    console.error('Error fetching PMA document:', error);
    res.status(500).json({ error: 'Failed to fetch PMA document' });
  }
});

// GET /api/quality/pma/:id/download - Download PMA document file
router.get('/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    console.log('🔍 PMA Download request for ID:', id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('👤 User authenticated:', user.username);

    // Get PMA document
    const document = await db
      .select({
        id: pmaDocuments.id,
        pmaNumber: pmaDocuments.pmaNumber,
        filePath: pmaDocuments.filePath,
        fileUrl: pmaDocuments.fileUrl,
        originalFileName: pmaDocuments.originalFileName,
      })
      .from(pmaDocuments)
      .where(eq(pmaDocuments.id, id))
      .limit(1);

    console.log('📄 Found document:', document.length > 0 ? document[0] : 'None');

    if (document.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    const pmaDoc = document[0];

    if (!pmaDoc.filePath || !pmaDoc.originalFileName) {
      console.log('❌ Missing file info:', { filePath: pmaDoc.filePath, originalFileName: pmaDoc.originalFileName });
      return res.status(404).json({ error: 'No file associated with this PMA document' });
    }

    try {
      // Import Google Cloud Storage dynamically
      const { Storage } = await import('@google-cloud/storage');
      
      // Initialize storage with service account credentials
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}');
      const storage = new Storage({
        projectId: credentials.project_id || 'thermopac-communication-system',
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key
        }
      });

      const bucket = storage.bucket('thermopac_storage');
      const file = bucket.file(pmaDoc.filePath);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: 'File not found in storage' });
      }

      let effectivePath = pmaDoc.filePath!;
      let revisionId: number | undefined;
      const governed = await getLatestRevision('PMA', pmaDoc.pmaNumber);
      if (governed) {
        effectivePath = governed.gcsPath;
        revisionId = governed.revisionId;
        const govFile = bucket.file(effectivePath);
        const [govExists] = await govFile.exists();
        if (govExists) {
          const [govSignedUrl] = await govFile.getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000,
          });

          await logDownload({
            module: 'PMA',
            documentNumber: pmaDoc.pmaNumber,
            revisionId,
            gcsPath: effectivePath,
            userId: user.id,
            userRole: user.role,
            ipAddress: req.ip,
          });

          return res.json({
            downloadUrl: govSignedUrl,
            fileName: pmaDoc.originalFileName,
            pmaNumber: pmaDoc.pmaNumber,
          });
        }
      }

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
      });

      await logDownload({
        module: 'PMA',
        documentNumber: pmaDoc.pmaNumber,
        revisionId,
        gcsPath: pmaDoc.filePath!,
        userId: user.id,
        userRole: user.role,
        ipAddress: req.ip,
      });

      res.json({ 
        downloadUrl: signedUrl,
        fileName: pmaDoc.originalFileName,
        pmaNumber: pmaDoc.pmaNumber
      });
    } catch (error) {
      console.error('Error generating download link:', error);
      res.status(500).json({ error: 'Failed to generate download link' });
    }
  } catch (error) {
    console.error('Error downloading PMA document:', error);
    res.status(500).json({ error: 'Failed to download PMA document' });
  }
});

// Get all available materials for linking
router.get('/materials/available', async (req: Request, res: Response) => {
  try {
    const materials = await db
      .select({
        id: materialIdentification.id,
        materialIdentificationId: materialIdentification.materialIdentificationId,
        materialDescription: materialIdentification.materialDescription,
        materialCode: materialIdentification.materialCode,
        specification: materialIdentification.specification,
        materialGrade: materialIdentification.materialGrade,
        heatNumber: materialIdentification.heatNumber,
        millTestCertificateNumber: materialIdentification.millTestCertificateNumber,
        unit: materialIdentification.unit, // Added missing unit field
        materialStatus: materialIdentification.materialStatus,
      })
      .from(materialIdentification)
      .orderBy(materialIdentification.materialIdentificationId);

    res.json(materials);
  } catch (error) {
    console.error('Error fetching available materials:', error);
    res.status(500).json({ error: 'Failed to fetch available materials' });
  }
});

export default router;