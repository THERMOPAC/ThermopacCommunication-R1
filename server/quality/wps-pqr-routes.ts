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
    // Use raw SQL query to avoid property/column name mismatches
    const result = await db.execute(sql`
      SELECT 
        w.id,
        w.wps_id as "wpsId",
        w.pqr_id as "pqrId",
        w.revision_no as "revisionNo",
        w.welder_process as "welderProcess",
        w.base_metal_grade as "baseMetalGrade",
        w.base_metal_thickness as "baseMetalThickness",
        w.filler_material as "fillerMaterial",
        w.joint_type as "jointType",
        w.weld_position as "weldPosition",
        w.preheating_temp as "preheatingTemp",
        w.post_weld_heat_treatment as "postWeldHeatTreatment",
        w.electrical_parameters as "electricalParameters",
        w.shielding_gas as "shieldingGas",
        w.document_file_path as "documentFilePath",
        w.document_url as "documentUrl",
        w.combined_document_file_path as "combinedDocumentFilePath",
        w.combined_document_url as "combinedDocumentUrl",
        w.status,
        w.remarks,
        w.approved_by as "approvedBy",
        w.approval_date as "approvalDate",
        w.created_by as "createdBy",
        w.created_at as "createdAt",
        w.updated_at as "updatedAt",
        w.has_pqr as "hasPqr",
        w.pqr_test_date as "pqrTestDate",
        w.pqr_test_laboratory as "pqrTestLaboratory",
        w.pqr_test_type as "pqrTestType",
        w.pqr_test_results as "pqrTestResults",
        w.pqr_status as "pqrStatus",
        w.pqr_remarks as "pqrRemarks",
        w.pqr_document_file_path as "pqrDocumentFilePath",
        w.pqr_document_url as "pqrDocumentUrl",
        creator.username as "createdByUser",
        approver.username as "approvedByUser"
      FROM wps_documents w
      LEFT JOIN users creator ON w.created_by = creator.id
      LEFT JOIN users approver ON w.approved_by = approver.id
      ORDER BY w.created_at DESC
    `);
    
    res.json(result.rows || []);
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
    
    const result = await db.execute(sql`
      SELECT 
        w.id,
        w.wps_id as "wpsId",
        w.pqr_id as "pqrId",
        w.revision_no as "revisionNo",
        w.welder_process as "welderProcess",
        w.base_metal_grade as "baseMetalGrade",
        w.base_metal_thickness as "baseMetalThickness",
        w.filler_material as "fillerMaterial",
        w.joint_type as "jointType",
        w.weld_position as "weldPosition",
        w.preheating_temp as "preheatingTemp",
        w.post_weld_heat_treatment as "postWeldHeatTreatment",
        w.electrical_parameters as "electricalParameters",
        w.shielding_gas as "shieldingGas",
        w.document_file_path as "documentFilePath",
        w.document_url as "documentUrl",
        w.combined_document_file_path as "combinedDocumentFilePath",
        w.combined_document_url as "combinedDocumentUrl",
        w.status,
        w.remarks,
        w.approved_by as "approvedBy",
        w.approval_date as "approvalDate",
        w.created_by as "createdBy",
        w.created_at as "createdAt",
        w.updated_at as "updatedAt",
        w.has_pqr as "hasPqr",
        w.pqr_test_date as "pqrTestDate",
        w.pqr_test_laboratory as "pqrTestLaboratory",
        w.pqr_test_type as "pqrTestType",
        w.pqr_test_results as "pqrTestResults",
        w.pqr_status as "pqrStatus",
        w.pqr_remarks as "pqrRemarks",
        w.pqr_document_file_path as "pqrDocumentFilePath",
        w.pqr_document_url as "pqrDocumentUrl",
        creator.username as "createdByUser",
        approver.username as "approvedByUser"
      FROM wps_documents w
      LEFT JOIN users creator ON w.created_by = creator.id
      LEFT JOIN users approver ON w.approved_by = approver.id
      WHERE w.id = ${wpsId}
      LIMIT 1
    `);
    
    const wpsDocument = result.rows && result.rows.length > 0 ? result.rows[0] : null;
    
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
    const seqResult = await db.execute(sql`
      SELECT MAX(CAST(SUBSTRING(wps_id, POSITION('-' IN wps_id) + 1) AS INTEGER)) as max_seq
      FROM wps_documents
      WHERE wps_id LIKE 'WPS-%'
    `);
    
    const maxSeq = seqResult.rows && seqResult.rows.length > 0 ? seqResult.rows[0].max_seq || 0 : 0;
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
    
    // Insert new WPS document into database using raw SQL
    const result = await db.execute(sql`
      INSERT INTO wps_documents (
        wps_id, 
        pqr_id, 
        revision_no, 
        welder_process, 
        base_metal_grade, 
        base_metal_thickness, 
        filler_material, 
        joint_type, 
        weld_position, 
        preheating_temp, 
        post_weld_heat_treatment, 
        shielding_gas, 
        document_file_path, 
        document_url, 
        status, 
        remarks, 
        created_by, 
        created_at, 
        updated_at
      ) 
      VALUES (
        ${wpsId},
        ${pqrId},
        '0',
        ${req.body.welderProcess},
        ${req.body.baseMetalGrade},
        ${req.body.baseMetalThickness},
        ${req.body.fillerMaterial},
        ${req.body.jointType},
        ${req.body.weldPosition},
        ${req.body.preheatingTemp || null},
        ${req.body.postWeldHeatTreatment || null},
        ${req.body.shieldingGas || null},
        ${documentUploadResult.document_file_path || null},
        ${documentUploadResult.document_url || null},
        ${req.body.status || 'Draft'},
        ${req.body.remarks || null},
        ${req.user!.id},
        NOW(),
        NOW()
      )
      RETURNING *
    `);
    
    const newWpsDocument = result.length > 0 ? result[0] : null;
    
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
      req.body.wpsId = existingDocument.wpsId; // Set WPS ID for file naming
      documentUploadResult = await uploadWpsDocument(req);
      
      if ('error' in documentUploadResult) {
        return res.status(400).json({ error: documentUploadResult.error });
      }
    }
    
    // Update WPS document in database
    const [updatedWpsDocument] = await db.update(wpsDocuments)
      .set({
        welderProcess: req.body.welderProcess || existingDocument.welderProcess,
        baseMetalGrade: req.body.baseMetalGrade || existingDocument.baseMetalGrade,
        baseMetalThickness: req.body.baseMetalThickness || existingDocument.baseMetalThickness,
        fillerMaterial: req.body.fillerMaterial || existingDocument.fillerMaterial,
        jointType: req.body.jointType || existingDocument.jointType,
        weldPosition: req.body.weldPosition || existingDocument.weldPosition,
        preheatingTemp: req.body.preheatingTemp || existingDocument.preheatingTemp,
        postWeldHeatTreatment: req.body.postWeldHeatTreatment || existingDocument.postWeldHeatTreatment,
        shieldingGas: req.body.shieldingGas || existingDocument.shieldingGas,
        documentFilePath: documentUploadResult.document_file_path || existingDocument.documentFilePath,
        documentUrl: documentUploadResult.document_url || existingDocument.documentUrl,
        status: req.body.status || existingDocument.status,
        remarks: req.body.remarks || existingDocument.remarks,
        updatedAt: new Date()
      })
      .where(eq(wpsDocuments.id, wpsId))
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
    await db.delete(wpsDocuments).where(eq(wpsDocuments.id, wpsId));
    
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
    
    if (!existingDocument.documentUrl) {
      return res.status(404).json({ error: 'Document not found for this WPS' });
    }
    
    // Redirect to the document URL
    res.redirect(existingDocument.documentUrl);
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
    
    // Find the WPS document by WPS ID using raw SQL
    const wpsResult = await db.execute(sql`
      SELECT * FROM wps_documents
      WHERE wps_id = ${uploadResult.wpsId}
      LIMIT 1
    `);
    
    const wpsDocument = wpsResult.length > 0 ? wpsResult[0] : null;
    
    if (!wpsDocument) {
      return res.status(404).json({ 
        error: 'WPS document not found',
        details: `No WPS document found with ID: ${uploadResult.wpsId}`
      });
    }
    
    // Update the WPS document with the combined document information
    const [updatedWpsDocument] = await db.update(wpsDocuments)
      .set({
        combinedDocumentFilePath: uploadResult.combined_document_file_path,
        combinedDocumentUrl: uploadResult.combined_document_url,
        updatedAt: new Date()
      })
      .where(eq(wpsDocuments.id, wpsDocument.id))
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
    const pqrId = wpsDocument.pqrId;
    
    // If a document was uploaded, process it with Google Cloud Storage
    let documentUploadResult = { success: true };
    if (req.file) {
      req.body.pqrId = pqrId; // Set PQR ID for file naming
      documentUploadResult = await uploadPqrDocument(req);
      
      if ('error' in documentUploadResult) {
        return res.status(400).json({ error: documentUploadResult.error });
      }
    }
    
    // Update the WPS document with PQR information using raw SQL
    const pqrResult = await db.execute(sql`
      UPDATE wps_documents
      SET 
        has_pqr = true,
        pqr_test_date = ${req.body.testDate},
        pqr_test_laboratory = ${req.body.testLaboratory},
        pqr_test_type = ${req.body.testType},
        pqr_test_results = ${req.body.testResults},
        pqr_status = ${req.body.status},
        pqr_remarks = ${req.body.remarks},
        pqr_document_file_path = ${documentUploadResult.document_file_path || null},
        pqr_document_url = ${documentUploadResult.document_url || null},
        pqr_created_by = ${req.user!.id},
        pqr_created_at = NOW(),
        updated_at = NOW()
      WHERE id = ${wpsId}
      RETURNING *
    `);
    
    const updatedWpsDocument = pqrResult.length > 0 ? pqrResult[0] : null;
    
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
    
    if (!existingDocument.combinedDocumentUrl) {
      return res.status(404).json({ error: 'Combined document not found for this WPS' });
    }
    
    // Redirect to the combined document URL
    res.redirect(existingDocument.combinedDocumentUrl);
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
    
    // Use raw SQL for the report query to avoid column naming issues
    let sqlQuery = `
      SELECT w.*, 
        creator.username as created_by_user, 
        approver.username as approved_by_user
      FROM wps_documents w
      LEFT JOIN users creator ON w.created_by = creator.id
      LEFT JOIN users approver ON w.approved_by = approver.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (wpsId) {
      sqlQuery += ` AND w.wps_id = $${params.length + 1}`;
      params.push(wpsId);
    }
    
    if (pqrId) {
      sqlQuery += ` AND w.pqr_id = $${params.length + 1}`;
      params.push(pqrId);
    }
    
    sqlQuery += ` ORDER BY w.wps_id`;
    
    const results = await db.execute(sql.raw(sqlQuery, ...params));
    
    // Format the data for reporting
    const reportData = results.map(record => {
      return {
        wps_id: record.id,
        wps_number: record.wps_id,
        pqr_number: record.pqr_id,
        revision_no: record.revision_no,
        welder_process: record.welder_process,
        base_metal_grade: record.base_metal_grade,
        base_metal_thickness: record.base_metal_thickness,
        filler_material: record.filler_material,
        joint_type: record.joint_type,
        weld_position: record.weld_position,
        preheating_temp: record.preheating_temp,
        post_weld_heat_treatment: record.post_weld_heat_treatment,
        shielding_gas: record.shielding_gas,
        wps_status: record.status,
        wps_remarks: record.remarks,
        wps_created_at: record.created_at,
        wps_updated_at: record.updated_at,
        wps_approved_by: record.approved_by,
        wps_approval_date: record.approval_date,
        wps_created_by_user: record.created_by_user,
        wps_approved_by_user: record.approved_by_user,
        has_pqr: record.has_pqr,
        // Include PQR data if available
        pqr_test_date: record.pqr_test_date,
        pqr_test_laboratory: record.pqr_test_laboratory,
        pqr_test_type: record.pqr_test_type,
        pqr_test_results: record.pqr_test_results,
        pqr_status: record.pqr_status,
        pqr_remarks: record.pqr_remarks
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