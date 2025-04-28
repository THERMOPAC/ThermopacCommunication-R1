import express, { Request, Response } from 'express';
import { db } from '../db';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { eq, sql, and, or, desc } from 'drizzle-orm';
import { wpsDocuments, users } from '@shared/schema';
import { 
  uploadWpsPqrDocument, 
  uploadWpsDocument,
  uploadPqrDocument,
  uploadCombinedDocument 
} from '../utils/wps-pqr-document-upload';

const router = express.Router();

// Get all WPS documents
router.get('/wps', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Query wps_documents table with user information
    const wpsResults = await db.query.wpsDocuments.findMany({
      orderBy: [desc(wpsDocuments.createdAt)]
    });
    
    res.json(wpsResults);
  } catch (error) {
    console.error('Error fetching WPS documents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch WPS documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get WPS document by ID
router.get('/wps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const wpsId = parseInt(req.params.id);
    
    const [wpsDocument] = await db.query.wpsDocuments.findMany({
      where: eq(wpsDocuments.id, wpsId)
    });
    
    if (!wpsDocument) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    res.json(wpsDocument);
  } catch (error) {
    console.error(`Error fetching WPS document ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch WPS document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create new WPS document
router.post('/wps', ensureAuthenticated, uploadWpsPqrDocument.single('document'), async (req: Request, res: Response) => {
  try {
    // Generate WPS ID with format WPS-N (without year)
    // Query for the highest existing WPS sequence using properly aliased table
    const result = await db.execute(sql`
      SELECT MAX(CAST(SUBSTRING("wpsDocuments"."wps_id", POSITION('-' IN "wpsDocuments"."wps_id") + 1) AS INTEGER)) as max_seq
      FROM wps_documents "wpsDocuments"
      WHERE "wpsDocuments"."wps_id" LIKE 'WPS-%'
    `);
    
    const maxSeq = result[0]?.max_seq || 0;
    const nextSeq = maxSeq + 1;
    const wpsId = `WPS-${nextSeq}`;
    const pqrId = `PQR-${nextSeq}`;
    
    // If a document was uploaded, process it with Google Cloud Storage
    let documentUploadResult = { success: true };
    if (req.file) {
      req.body.wpsId = wpsId; // Set WPS ID for file naming
      documentUploadResult = await uploadWpsDocument(req);
      
      if ('error' in documentUploadResult) {
        return res.status(400).json({ error: documentUploadResult.error });
      }
    }
    
    // Insert new WPS document into database
    const [newWpsDocument] = await db.insert(sql`wps_documents`).values({
      wps_id: wpsId,
      pqr_id: pqrId,
      revision_no: '0',
      welder_process: req.body.welderProcess,
      base_metal_grade: req.body.baseMetalGrade,
      base_metal_thickness: req.body.baseMetalThickness,
      filler_material: req.body.fillerMaterial,
      joint_type: req.body.jointType,
      weld_position: req.body.weldPosition,
      preheating_temp: req.body.preheatingTemp || null,
      post_weld_heat_treatment: req.body.postWeldHeatTreatment || null,
      shielding_gas: req.body.shieldingGas || null,
      document_file_path: documentUploadResult.document_file_path || null,
      document_url: documentUploadResult.document_url || null,
      status: req.body.status || 'Draft',
      remarks: req.body.remarks || null,
      created_by: req.user!.id,
      created_at: new Date(),
      updated_at: new Date()
    }).returning();
    
    res.status(201).json(newWpsDocument);
  } catch (error) {
    console.error('Error creating WPS document:', error);
    res.status(500).json({ 
      error: 'Failed to create WPS document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update WPS document by ID
router.put('/wps/:id', ensureAuthenticated, uploadWpsPqrDocument.single('document'), async (req: Request, res: Response) => {
  try {
    const wpsId = parseInt(req.params.id);
    
    // Check if WPS document exists
    const [existingDocument] = await db.query.wpsDocuments.findMany({
      where: eq(wpsDocuments.id, wpsId)
    });
    
    if (!existingDocument) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    // If a document was uploaded, process it with Google Cloud Storage
    let documentUploadResult = { success: true };
    if (req.file) {
      req.body.wpsId = existingDocument.wps_id; // Set WPS ID for file naming
      documentUploadResult = await uploadWpsDocument(req);
      
      if ('error' in documentUploadResult) {
        return res.status(400).json({ error: documentUploadResult.error });
      }
    }
    
    // Update WPS document in database
    const [updatedWpsDocument] = await db.update(sql`wps_documents`)
      .set({
        welder_process: req.body.welderProcess || existingDocument.welder_process,
        base_metal_grade: req.body.baseMetalGrade || existingDocument.base_metal_grade,
        base_metal_thickness: req.body.baseMetalThickness || existingDocument.base_metal_thickness,
        filler_material: req.body.fillerMaterial || existingDocument.filler_material,
        joint_type: req.body.jointType || existingDocument.joint_type,
        weld_position: req.body.weldPosition || existingDocument.weld_position,
        preheating_temp: req.body.preheatingTemp || existingDocument.preheating_temp,
        post_weld_heat_treatment: req.body.postWeldHeatTreatment || existingDocument.post_weld_heat_treatment,
        shielding_gas: req.body.shieldingGas || existingDocument.shielding_gas,
        document_file_path: documentUploadResult.document_file_path || existingDocument.document_file_path,
        document_url: documentUploadResult.document_url || existingDocument.document_url,
        status: req.body.status || existingDocument.status,
        remarks: req.body.remarks || existingDocument.remarks,
        updated_at: new Date()
      })
      .where(eq(sql`id`, wpsId))
      .returning();
    
    res.json(updatedWpsDocument);
  } catch (error) {
    console.error(`Error updating WPS document ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to update WPS document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete WPS document by ID
router.delete('/wps/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const wpsId = parseInt(req.params.id);
    
    // Check if WPS document exists
    const [existingDocument] = await db.query.wpsDocuments.findMany({
      where: eq(wpsDocuments.id, wpsId)
    });
    
    if (!existingDocument) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    // Delete WPS document from database
    await db.delete(sql`wps_documents`).where(eq(sql`id`, wpsId));
    
    res.status(200).json({ message: 'WPS document deleted successfully' });
  } catch (error) {
    console.error(`Error deleting WPS document ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to delete WPS document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get WPS document file by ID
router.get('/wps/:id/document', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const wpsId = parseInt(req.params.id);
    
    // Check if WPS document exists
    const [existingDocument] = await db.query.wpsDocuments.findMany({
      where: eq(wpsDocuments.id, wpsId)
    });
    
    if (!existingDocument) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    if (!existingDocument.document_url) {
      return res.status(404).json({ error: 'Document not found for this WPS' });
    }
    
    // Redirect to the document URL
    res.redirect(existingDocument.document_url);
  } catch (error) {
    console.error(`Error retrieving WPS document file ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to retrieve WPS document file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload combined WPS/PQR document
router.post('/combined-document', ensureAuthenticated, uploadWpsPqrDocument.single('combinedDocument'), async (req: Request, res: Response) => {
  try {
    // Process the combined document upload with Google Cloud Storage
    const uploadResult = await uploadCombinedDocument(req);
    
    if ('error' in uploadResult) {
      return res.status(400).json({ error: uploadResult.error });
    }
    
    // Find the WPS document by WPS ID
    const [wpsDocument] = await db.query.wpsDocuments.findMany({
      where: eq(wpsDocuments.wpsId, uploadResult.wpsId)
    });
    
    if (!wpsDocument) {
      return res.status(404).json({ 
        error: 'WPS document not found',
        details: `No WPS document found with ID: ${uploadResult.wpsId}`
      });
    }
    
    // Update the WPS document with the combined document information
    const [updatedWpsDocument] = await db.update(sql`wps_documents`)
      .set({
        combined_document_file_path: uploadResult.combined_document_file_path,
        combined_document_url: uploadResult.combined_document_url,
        updated_at: new Date()
      })
      .where(eq(sql`id`, wpsDocument.id))
      .returning();
    
    res.status(200).json({
      message: 'Combined WPS/PQR document uploaded successfully',
      document: updatedWpsDocument
    });
  } catch (error) {
    console.error('Error uploading combined WPS/PQR document:', error);
    res.status(500).json({ 
      error: 'Failed to upload combined WPS/PQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create new PQR document
router.post('/wps/pqr', ensureAuthenticated, uploadWpsPqrDocument.single('document'), async (req: Request, res: Response) => {
  try {
    const wpsId = parseInt(req.body.wpsId);
    
    // Check if WPS document exists
    const [wpsDocument] = await db.query.wpsDocuments.findMany({
      where: eq(wpsDocuments.id, wpsId)
    });
    
    if (!wpsDocument) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    // Use the PQR ID that was already generated with the WPS
    const pqrId = wpsDocument.pqr_id;
    
    // If a document was uploaded, process it with Google Cloud Storage
    let documentUploadResult = { success: true };
    if (req.file) {
      req.body.pqrId = pqrId; // Set PQR ID for file naming
      documentUploadResult = await uploadPqrDocument(req);
      
      if ('error' in documentUploadResult) {
        return res.status(400).json({ error: documentUploadResult.error });
      }
    }
    
    // Update the WPS document with PQR information
    const [updatedWpsDocument] = await db.update(sql`wps_documents`)
      .set({
        has_pqr: true,
        pqr_test_date: req.body.testDate,
        pqr_test_laboratory: req.body.testLaboratory,
        pqr_test_type: req.body.testType,
        pqr_test_results: req.body.testResults,
        pqr_status: req.body.status,
        pqr_remarks: req.body.remarks,
        pqr_document_file_path: documentUploadResult.document_file_path || null,
        pqr_document_url: documentUploadResult.document_url || null,
        pqr_created_by: req.user!.id,
        pqr_created_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(sql`id`, wpsId))
      .returning();
    
    res.status(201).json(updatedWpsDocument);
  } catch (error) {
    console.error('Error creating PQR document:', error);
    res.status(500).json({ 
      error: 'Failed to create PQR document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get combined WPS/PQR document file by WPS ID
router.get('/wps/:id/combined-document', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const wpsId = parseInt(req.params.id);
    
    // Check if WPS document exists
    const [existingDocument] = await db.query.wpsDocuments.findMany({
      where: eq(wpsDocuments.id, wpsId)
    });
    
    if (!existingDocument) {
      return res.status(404).json({ error: 'WPS document not found' });
    }
    
    if (!existingDocument.combined_document_url) {
      return res.status(404).json({ error: 'Combined document not found for this WPS' });
    }
    
    // Redirect to the combined document URL
    res.redirect(existingDocument.combined_document_url);
  } catch (error) {
    console.error(`Error retrieving combined WPS/PQR document file ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to retrieve combined WPS/PQR document file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Endpoint to fetch WPS and linked PQR data for reporting
router.get('/report', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { wpsId, pqrId } = req.query;
    
    let query = db.select()
      .from(sql`wps_documents w`)
      .leftJoin(sql`users wu`, sql`w.created_by = wu.id`)
      .leftJoin(sql`users wau`, sql`w.approved_by = wau.id`);
    
    if (wpsId) {
      query = query.where(eq(sql`"w"."wps_id"`, wpsId as string));
    }
    
    if (pqrId) {
      query = query.where(eq(sql`"w"."pqr_id"`, pqrId as string));
    }
    
    const results = await query.orderBy(sql`"w"."wps_id"`);
    
    // Format the data for reporting
    const reportData = results.map(record => {
      const { w: wpsRecord, wu: createdByUser, wau: approvedByUser } = record;
      
      return {
        wps_id: wpsRecord.id,
        wps_number: wpsRecord.wps_id,
        pqr_number: wpsRecord.pqr_id,
        revision_no: wpsRecord.revision_no,
        welder_process: wpsRecord.welder_process,
        base_metal_grade: wpsRecord.base_metal_grade,
        base_metal_thickness: wpsRecord.base_metal_thickness,
        filler_material: wpsRecord.filler_material,
        joint_type: wpsRecord.joint_type,
        weld_position: wpsRecord.weld_position,
        preheating_temp: wpsRecord.preheating_temp,
        post_weld_heat_treatment: wpsRecord.post_weld_heat_treatment,
        shielding_gas: wpsRecord.shielding_gas,
        wps_status: wpsRecord.status,
        wps_remarks: wpsRecord.remarks,
        wps_created_at: wpsRecord.created_at,
        wps_updated_at: wpsRecord.updated_at,
        wps_approved_by: wpsRecord.approved_by,
        wps_approval_date: wpsRecord.approval_date,
        wps_created_by_user: createdByUser?.username,
        wps_approved_by_user: approvedByUser?.username,
        has_pqr: wpsRecord.has_pqr,
        // Include PQR data if available
        pqr_test_date: wpsRecord.pqr_test_date,
        pqr_test_laboratory: wpsRecord.pqr_test_laboratory,
        pqr_test_type: wpsRecord.pqr_test_type,
        pqr_test_results: wpsRecord.pqr_test_results,
        pqr_status: wpsRecord.pqr_status,
        pqr_remarks: wpsRecord.pqr_remarks
      };
    });
    
    res.status(200).json(reportData);
  } catch (error) {
    console.error('Error fetching report data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch report data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;