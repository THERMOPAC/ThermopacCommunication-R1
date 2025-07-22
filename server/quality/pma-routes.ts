import express, { Request, Response } from 'express';
import { db } from '../db';
import { pmaDocuments, users } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { pmaDocumentSchema, InsertPmaDocument } from '@shared/schema';
import { uploadFileWithDiagnostics } from '../utils/gcs-enhanced-upload';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all PMA documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const documents = await db
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

    // Create GCS path: QMS/PMA_Records/{pma_number}.{extension}
    const fileExtension = file.originalname.split('.').pop();
    const gcsPath = `QMS/PMA_Records/${validatedData.pmaNumber}.${fileExtension}`;

    // Upload file to GCS
    const uploadResult = await uploadFileWithDiagnostics(
      gcsPath,
      file.buffer,
      file.mimetype
    );

    if (!uploadResult.successful) {
      return res.status(500).json({ error: 'Failed to upload file to cloud storage' });
    }

    // Create PMA document record
    const newDocument = await db
      .insert(pmaDocuments)
      .values({
        pmaNumber: validatedData.pmaNumber,
        specification: validatedData.specification,
        grade: validatedData.grade,
        status: validatedData.status || 'Draft',
        remarks: validatedData.remarks,
        expiryDate: validatedData.expiryDate,
        filePath: gcsPath,
        fileUrl: uploadResult.url,
        originalFileName: file.originalname,
        createdBy: user.id,
      })
      .returning();

    res.status(201).json(newDocument[0]);
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
      status: validatedData.status || 'Draft',
      remarks: validatedData.remarks,
      expiryDate: validatedData.expiryDate,
      updatedAt: new Date(),
    };

    // If new file is uploaded, handle file replacement
    if (file) {
      // Validate file type (PDF or DOCX only)
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: 'Only PDF and DOCX files are allowed' });
      }

      // Create new GCS path
      const fileExtension = file.originalname.split('.').pop();
      const gcsPath = `QMS/PMA_Records/${validatedData.pmaNumber}.${fileExtension}`;

      // Upload new file to GCS
      const uploadResult = await uploadFileWithDiagnostics(
        gcsPath,
        file.buffer,
        file.mimetype
      );

      if (!uploadResult.successful) {
        return res.status(500).json({ error: 'Failed to upload file to cloud storage' });
      }

      updateData.filePath = gcsPath;
      updateData.fileUrl = uploadResult.url;
      updateData.originalFileName = file.originalname;
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

// Delete PMA document
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    // Delete the PMA document
    const deletedDocument = await db
      .delete(pmaDocuments)
      .where(eq(pmaDocuments.id, id))
      .returning();

    if (deletedDocument.length === 0) {
      return res.status(404).json({ error: 'PMA document not found' });
    }

    res.json({ message: 'PMA document deleted successfully' });
  } catch (error) {
    console.error('Error deleting PMA document:', error);
    res.status(500).json({ error: 'Failed to delete PMA document' });
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