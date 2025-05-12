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
    // Visual tab in frontend becomes Visual Inspection in database
    let formattedTabName = tabName;
    if (tabName === 'Visual') {
      formattedTabName = 'Visual Inspection';
    } else if (tabName === 'NonConformance') {
      formattedTabName = 'NCR';
    }
    
    console.log(`Using formatted tab name "${formattedTabName}" (original: "${tabName}") for database record`);
    
    // Store document details in database
    console.log('Storing document metadata in database...');
    const documentRecord = await db.insert(inspectionDocuments).values({
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
router.get("/:inspectionOrderNumber/:tabName/:recordId", ensureAuthenticated, async (req: Request, res: Response) => {
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
    // Visual tab in frontend becomes Visual Inspection in database
    let formattedTabName = tabName;
    if (tabName === 'Visual') {
      formattedTabName = 'Visual Inspection';
    }
    
    console.log(`Getting documents for inspection: ${inspectionOrderNumber}, tab: ${tabName} (formatted as: ${formattedTabName}), record: ${recordId}`);
    
    // Get documents for this inspection order record
    const documents = await db.query.inspectionDocuments.findMany({
      where: sql`
        inspection_order_id = ${inspection.id} AND
        tab_name = ${formattedTabName} AND
        record_id = ${recordId}
      `,
      orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
    });
    
    return res.status(200).json(documents);
    
  } catch (error) {
    console.error('Error getting inspection documents:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

export default router;