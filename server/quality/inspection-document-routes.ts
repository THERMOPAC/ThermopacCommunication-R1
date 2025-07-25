import express, { Request, Response } from 'express';
import multer from 'multer';
import { uploadInspectionDocument } from '../utils/inspection-document-upload';
import { db } from '../db';
import { inspectionDocuments, inspectionOrders } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm/sql';

const router = express.Router();

// Configure multer for memory storage (we're not saving files to disk)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB file size limit
  }
});

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Document upload for inspection records
router.post("/upload", ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    console.log('Inspection document upload request received');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? 'File present' : 'No file found');
    
    // Check if file exists in request
    if (!req.file) {
      console.error('No file uploaded in request');
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    console.log('File details:', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    
    const inspectionOrderNumber = req.body.inspectionOrderNumber;
    const tabName = req.body.tabName;
    const recordId = req.body.recordId;
    
    if (!inspectionOrderNumber || !tabName || !recordId) {
      console.error('Missing required parameters');
      return res.status(400).json({ 
        error: "Required parameters are missing",
        required: ["inspectionOrderNumber", "tabName", "recordId"]
      });
    }
    
    // Check if the inspection order exists
    const inspection = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber)
    });
    
    if (!inspection) {
      console.error(`Inspection order with number ${inspectionOrderNumber} not found`);
      return res.status(404).json({ error: "Inspection order not found" });
    }
    
    console.log(`Inspection order ${inspectionOrderNumber} found, proceeding with upload`);
    
    // Upload document
    console.log('Starting document upload to GCS...');
    const uploadResult = await uploadInspectionDocument(req);
    console.log('Upload result:', uploadResult);
    
    if (!uploadResult.success) {
      console.error('Upload failed:', uploadResult.error);
      return res.status(500).json({ error: uploadResult.error || "Document upload failed" });
    }
    
    // Get user ID if authenticated
    const userId = req.user ? req.user.id : null;
    console.log(`User ID for document upload: ${userId || 'Not authenticated'}`);
    
    // Map tab names to match consistent folder structure
    // Visual tab in frontend becomes Visual in database to match file path
    let formattedTabName = tabName;
    if (tabName === 'Visual') {
      formattedTabName = 'Visual'; // Update to match observed file path structure
    } else if (tabName === 'NonConformance') {
      formattedTabName = 'NCR';
    } else if (tabName === 'Shop Inspection') {
      formattedTabName = 'ShopInspection'; // Format for GCS path consistency
    } else if (tabName === 'Approved Drawing') {
      formattedTabName = 'ApprovedDrawing'; // Format for GCS path consistency
    }
    
    console.log(`Using formatted tab name "${formattedTabName}" (original: "${tabName}") for database record`);
    
    // Check if a document for this inspection order, record and tab already exists
    console.log('Checking for existing document records...');
    const existingDocument = await db.query.inspectionDocuments.findFirst({
      where: sql`${inspectionDocuments.inspectionOrderId} = ${inspection.id} AND 
                ${inspectionDocuments.recordId} = ${recordId} AND 
                ${inspectionDocuments.tabName} = ${formattedTabName}`
    });
    
    let documentRecord;
    
    if (existingDocument) {
      console.log(`Found existing document record with ID ${existingDocument.id}, updating instead of creating new record`);
      // Update existing record
      documentRecord = await db.update(inspectionDocuments)
        .set({
          fileName: uploadResult.file_name || 'unnamed',
          filePath: uploadResult.document_file_path || '',
          fileUrl: uploadResult.document_url || '',
          fileType: uploadResult.file_type || 'application/pdf',
          fileSize: uploadResult.file_size || 0,
          uploadedBy: userId || null,
          updatedAt: new Date()
        })
        .where(eq(inspectionDocuments.id, existingDocument.id))
        .returning();
    } else {
      // Insert new record
      console.log('No existing document found, creating new record');
      documentRecord = await db.insert(inspectionDocuments).values({
        inspectionOrderId: inspection.id,
        recordId: recordId,
        tabName: formattedTabName, // Use the formatted tab name
        fileName: uploadResult.file_name || 'unnamed',
        filePath: uploadResult.document_file_path || '',
        fileUrl: uploadResult.document_url || '',
        fileType: uploadResult.file_type || 'application/pdf',
        fileSize: uploadResult.file_size || 0,
        uploadedBy: userId || null,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
    }
    
    console.log('Document metadata stored successfully:', documentRecord);
    
    // Return success response with document details
    return res.status(200).json({
      success: true,
      message: "Document uploaded successfully",
      document: {
        id: documentRecord[0].id,
        inspectionOrderId: inspection.id,
        inspectionOrderNumber: inspectionOrderNumber,
        recordId: recordId,
        tabName: formattedTabName, // Use the formatted tab name in the response
        fileName: uploadResult.file_name,
        filePath: uploadResult.document_file_path,
        fileUrl: uploadResult.document_url,
        fileType: uploadResult.file_type,
        fileSize: uploadResult.file_size,
        uploadedBy: userId,
        createdAt: documentRecord[0].createdAt,
        updatedAt: documentRecord[0].updatedAt
      }
    });
    
  } catch (error) {
    console.error('Error uploading inspection document:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// GET documents for an inspection order record
router.get("/:inspectionOrderNumber/:tabName/:recordId/documents", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { inspectionOrderNumber, tabName, recordId } = req.params;
    
    if (!inspectionOrderNumber || !tabName || !recordId) {
      return res.status(400).json({ error: "Required parameters are missing" });
    }
    
    // Get the inspection order ID
    const inspection = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber)
    });
    
    if (!inspection) {
      return res.status(404).json({ error: "Inspection order not found" });
    }
    
    // Map tab names to match what's stored in the database
    // Visual tab in frontend stays as Visual in database to match file path
    let formattedTabName = tabName;
    if (tabName === 'Visual') {
      formattedTabName = 'Visual'; // Update to match observed file path structure
    } else if (tabName === 'Shop Inspection') {
      formattedTabName = 'ShopInspection'; // Format for GCS path consistency
    } else if (tabName === 'Approved Drawing') {
      formattedTabName = 'ApprovedDrawing'; // Format for GCS path consistency
    } else if (tabName === 'DVR') {
      formattedTabName = 'DVR'; // DVR tab maintains same name for GCS path consistency
    } else if (tabName === 'ITP') {
      formattedTabName = 'ITP'; // ITP tab maintains same name for GCS path consistency
    } else if (tabName === 'Hydrotest') {
      formattedTabName = 'Hydrotest'; // Hydrotest tab maintains same name for GCS path consistency
    }
    
    console.log(`Getting documents for inspection: ${inspectionOrderNumber}, tab: ${tabName} (formatted as: ${formattedTabName}), record: ${recordId}`);
    
    // Get documents for this inspection order record
    // Handle backward compatibility for tab names (both "Shop Inspection" and "ShopInspection")
    let documents;
    if (tabName === 'Shop Inspection') {
      // For Shop Inspection tab, search for both old format ("Shop Inspection") and new format ("ShopInspection")
      documents = await db.query.inspectionDocuments.findMany({
        where: sql`
          inspection_order_id = ${inspection.id} AND
          (tab_name = 'Shop Inspection' OR tab_name = 'ShopInspection') AND
          record_id = ${recordId}
        `,
        orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
      });
    } else {
      // For other tabs, use the formatted tab name
      documents = await db.query.inspectionDocuments.findMany({
        where: sql`
          inspection_order_id = ${inspection.id} AND
          tab_name = ${formattedTabName} AND
          record_id = ${recordId}
        `,
        orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
      });
    }
    
    return res.status(200).json(documents);
    
  } catch (error) {
    console.error('Error getting inspection documents:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// Download inspection document
router.get("/:inspectionOrderNumber/:tabName/:recordId/documents/:documentId/download", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { inspectionOrderNumber, tabName, recordId, documentId } = req.params;
    
    console.log(`Download request - Inspection: ${inspectionOrderNumber}, Tab: ${tabName}, Record: ${recordId}, Document: ${documentId}`);
    
    if (!inspectionOrderNumber || !tabName || !recordId || !documentId) {
      return res.status(400).json({ error: "Required parameters are missing" });
    }
    
    // Get the inspection order and project code
    const inspection = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber)
    });
    
    if (!inspection) {
      return res.status(404).json({ error: "Inspection order not found" });
    }
    
    // Get the document record
    const document = await db.query.inspectionDocuments.findFirst({
      where: eq(inspectionDocuments.id, parseInt(documentId))
    });
    
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    // Map tab names to folder names
    let formattedTabName = tabName;
    if (tabName === 'NonConformance') {
      formattedTabName = 'NCR';
    } else if (tabName === 'Visual') {
      formattedTabName = 'Visual';
    } else if (tabName === 'Shop Inspection') {
      formattedTabName = 'ShopInspection'; // Format for GCS path consistency
    } else if (tabName === 'Approved Drawing') {
      formattedTabName = 'ApprovedDrawing'; // Format for GCS path consistency
    } else if (tabName === 'DVR') {
      formattedTabName = 'DVR'; // DVR tab maintains same name for GCS path consistency
    } else if (tabName === 'ITP') {
      formattedTabName = 'ITP'; // ITP tab maintains same name for GCS path consistency
    } else if (tabName === 'Hydrotest') {
      formattedTabName = 'Hydrotest'; // Hydrotest tab maintains same name for GCS path consistency
    }
    
    // Try multiple path formats for file detection
    const projectCode = inspection.projectCode || 'UNKNOWN';
    const pathsToTry = [
      // New hierarchical format (preferred)
      `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/${formattedTabName}/${recordId}.${document.fileName?.split('.').pop() || 'pdf'}`,
      // Stored database path
      document.filePath,
      // Old format fallback
      `QMS/Inspections_Records/${inspectionOrderNumber}/${formattedTabName}/${recordId}.${document.fileName?.split('.').pop() || 'pdf'}`
    ].filter(Boolean);
    
    console.log(`Trying paths for download:`, pathsToTry);
    
    // Import GCS utilities
    const { Storage } = require('@google-cloud/storage');
    const { gcsCredentials, gcsBucketName } = require('../utils/gcs-config');
    
    const storage = new Storage({
      credentials: gcsCredentials,
      projectId: gcsCredentials.project_id
    });
    
    const bucket = storage.bucket(gcsBucketName);
    let fileFound = false;
    let finalPath = '';
    
    // Try each path to find the file
    for (const path of pathsToTry) {
      try {
        const file = bucket.file(path);
        const [exists] = await file.exists();
        
        if (exists) {
          fileFound = true;
          finalPath = path;
          console.log(`File found at path: ${finalPath}`);
          break;
        } else {
          console.log(`File not found at path: ${path}`);
        }
      } catch (error) {
        console.log(`Error checking path ${path}:`, error);
      }
    }
    
    if (!fileFound) {
      console.error(`File not found at any of the attempted paths for document ${documentId}`);
      return res.status(404).json({ error: "File not found in storage" });
    }
    
    // Stream the file
    const file = bucket.file(finalPath);
    const readStream = file.createReadStream();
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName || 'document.pdf'}"`);
    res.setHeader('Content-Type', document.fileType || 'application/pdf');
    
    // Handle stream errors
    readStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    });
    
    // Pipe the file to response
    readStream.pipe(res);
    
  } catch (error) {
    console.error('Error downloading inspection document:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// Delete inspection document
router.delete("/:inspectionOrderNumber/:tabName/:recordId/documents/:documentId", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { inspectionOrderNumber, tabName, recordId, documentId } = req.params;
    
    console.log(`Delete request - Inspection: ${inspectionOrderNumber}, Tab: ${tabName}, Record: ${recordId}, Document: ${documentId}`);
    
    if (!inspectionOrderNumber || !tabName || !recordId || !documentId) {
      return res.status(400).json({ error: "Required parameters are missing" });
    }
    
    // Get the inspection order and project code
    const inspection = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber)
    });
    
    if (!inspection) {
      return res.status(404).json({ error: "Inspection order not found" });
    }
    
    // Get the document record
    const document = await db.query.inspectionDocuments.findFirst({
      where: eq(inspectionDocuments.id, parseInt(documentId))
    });
    
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    // Map tab names to folder names
    let formattedTabName = tabName;
    if (tabName === 'NonConformance') {
      formattedTabName = 'NCR';
    } else if (tabName === 'Visual') {
      formattedTabName = 'Visual';
    } else if (tabName === 'Shop Inspection') {
      formattedTabName = 'ShopInspection'; // Format for GCS path consistency
    } else if (tabName === 'Approved Drawing') {
      formattedTabName = 'ApprovedDrawing'; // Format for GCS path consistency
    } else if (tabName === 'DVR') {
      formattedTabName = 'DVR'; // DVR tab maintains same name for GCS path consistency
    } else if (tabName === 'ITP') {
      formattedTabName = 'ITP'; // ITP tab maintains same name for GCS path consistency
    } else if (tabName === 'Hydrotest') {
      formattedTabName = 'Hydrotest'; // Hydrotest tab maintains same name for GCS path consistency
    }
    
    // Try multiple path formats for file detection
    const projectCode = inspection.projectCode || 'UNKNOWN';
    const pathsToTry = [
      // New hierarchical format (preferred)
      `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/${formattedTabName}/${recordId}.${document.fileName?.split('.').pop() || 'pdf'}`,
      // Stored database path
      document.filePath,
      // Old format fallback
      `QMS/Inspections_Records/${inspectionOrderNumber}/${formattedTabName}/${recordId}.${document.fileName?.split('.').pop() || 'pdf'}`
    ].filter(Boolean);
    
    console.log(`Trying paths for deletion:`, pathsToTry);
    
    // Import GCS utilities
    const { Storage } = require('@google-cloud/storage');
    const { gcsCredentials, gcsBucketName } = require('../utils/gcs-config');
    
    const storage = new Storage({
      credentials: gcsCredentials,
      projectId: gcsCredentials.project_id
    });
    
    const bucket = storage.bucket(gcsBucketName);
    let fileDeleted = false;
    let finalPath = '';
    
    // Try each path to find and delete the file
    for (const path of pathsToTry) {
      try {
        const file = bucket.file(path);
        const [exists] = await file.exists();
        
        if (exists) {
          await file.delete();
          fileDeleted = true;
          finalPath = path;
          console.log(`File deleted from path: ${finalPath}`);
          break;
        } else {
          console.log(`File not found at path: ${path}`);
        }
      } catch (error) {
        console.log(`Error deleting file at path ${path}:`, error);
      }
    }
    
    if (!fileDeleted) {
      console.warn(`File not found at any path for document ${documentId}, continuing with database deletion`);
    }
    
    // Delete the database record regardless of GCS deletion status
    await db.delete(inspectionDocuments)
      .where(eq(inspectionDocuments.id, parseInt(documentId)));
    
    console.log(`Database record deleted for document ${documentId}`);
    
    return res.status(200).json({ 
      message: "Document deleted successfully",
      fileDeleted: fileDeleted,
      pathUsed: finalPath || 'No file found in storage'
    });
    
  } catch (error) {
    console.error('Error deleting inspection document:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

export default router;