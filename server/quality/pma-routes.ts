import express, { Request, Response } from 'express';
import { db } from '../db';
import { pmaDocuments, pmaMaterials, materialIdentification, users } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { pmaDocumentSchema, InsertPmaDocument } from '@shared/schema';

const router = express.Router();

// Get all PMA documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const documents = await db
      .select({
        id: pmaDocuments.id,
        documentId: pmaDocuments.documentId,
        title: pmaDocuments.title,
        description: pmaDocuments.description,
        materialType: pmaDocuments.materialType,
        materialGrade: pmaDocuments.materialGrade,
        specification: pmaDocuments.specification,
        testMethods: pmaDocuments.testMethods,
        acceptanceCriteria: pmaDocuments.acceptanceCriteria,
        certificateNo: pmaDocuments.certificateNo,
        inspectionAuthority: pmaDocuments.inspectionAuthority,
        filePath: pmaDocuments.filePath,
        fileUrl: pmaDocuments.fileUrl,
        status: pmaDocuments.status,
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
        documentId: pmaDocuments.documentId,
        title: pmaDocuments.title,
        description: pmaDocuments.description,
        materialType: pmaDocuments.materialType,
        materialGrade: pmaDocuments.materialGrade,
        specification: pmaDocuments.specification,
        testMethods: pmaDocuments.testMethods,
        acceptanceCriteria: pmaDocuments.acceptanceCriteria,
        certificateNo: pmaDocuments.certificateNo,
        inspectionAuthority: pmaDocuments.inspectionAuthority,
        filePath: pmaDocuments.filePath,
        fileUrl: pmaDocuments.fileUrl,
        status: pmaDocuments.status,
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

// Create new PMA document
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate input data
    const validationResult = pmaDocumentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const data = validationResult.data;

    // Generate PMA document ID (format: PMA-YYYY-NNN)
    const year = new Date().getFullYear();
    const countResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM pma_documents WHERE document_id LIKE ${`PMA-${year}-%`}`
    );
    const count = parseInt((countResult as any)[0]?.count || '0');
    const sequence = (count + 1).toString().padStart(3, '0');
    const documentId = `PMA-${year}-${sequence}`;

    // Insert the new PMA document
    const newDocument = await db
      .insert(pmaDocuments)
      .values({
        ...data,
        documentId,
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
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate input data
    const validationResult = pmaDocumentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const data = validationResult.data;

    // Update the PMA document
    const updatedDocument = await db
      .update(pmaDocuments)
      .set({
        ...data,
        updatedAt: new Date(),
      })
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

    // Delete associated material links first
    await db.delete(pmaMaterials).where(eq(pmaMaterials.pmaDocumentId, id));

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

// Get materials linked to a PMA document
router.get('/:id/materials', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const linkedMaterials = await db
      .select({
        id: pmaMaterials.id,
        materialId: pmaMaterials.materialId,
        linkedAt: pmaMaterials.linkedAt,
        linkedBy: pmaMaterials.linkedBy,
        linkedByName: users.username,
        materialIdentificationId: materialIdentification.materialIdentificationId,
        materialDescription: materialIdentification.materialDescription,
        materialCode: materialIdentification.materialCode,
        specification: materialIdentification.specification,
        materialGrade: materialIdentification.materialGrade,
        heatNumber: materialIdentification.heatNumber,
      })
      .from(pmaMaterials)
      .leftJoin(materialIdentification, eq(pmaMaterials.materialId, materialIdentification.id))
      .leftJoin(users, eq(pmaMaterials.linkedBy, users.id))
      .where(eq(pmaMaterials.pmaDocumentId, id))
      .orderBy(desc(pmaMaterials.linkedAt));

    res.json(linkedMaterials);
  } catch (error) {
    console.error('Error fetching PMA materials:', error);
    res.status(500).json({ error: 'Failed to fetch PMA materials' });
  }
});

// Link materials to PMA document
router.post('/:id/materials', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid PMA document ID' });
    }

    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { materialIds } = req.body;
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return res.status(400).json({ error: 'Material IDs array is required' });
    }

    // Remove existing links for this PMA document
    await db.delete(pmaMaterials).where(eq(pmaMaterials.pmaDocumentId, id));

    // Create new links
    const newLinks = materialIds.map(materialId => ({
      pmaDocumentId: id,
      materialId: parseInt(materialId),
      linkedBy: user.id,
    }));

    const createdLinks = await db
      .insert(pmaMaterials)
      .values(newLinks)
      .returning();

    res.status(201).json(createdLinks);
  } catch (error) {
    console.error('Error linking materials to PMA:', error);
    res.status(500).json({ error: 'Failed to link materials to PMA' });
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