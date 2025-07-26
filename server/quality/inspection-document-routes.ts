import express, { Request, Response } from 'express';
import multer from 'multer';
import { uploadInspectionDocument } from '../utils/inspection-document-upload';
import { db } from '../db';
import { inspectionDocuments, inspectionOrders } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm/sql';
import { cleanupShopInspectionOrphanedFile } from '../utils/cleanup-orphaned-files';

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

// Count material identification records for an inspection order (Material Traceability tab)
// This needs to be BEFORE the generic /:inspectionOrderNumber/:tabName/:recordId/documents route
router.get("/:inspectionOrderNumber/material-traceability/count", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { inspectionOrderNumber } = req.params;
    
    console.log(`📦 Material Traceability count request for inspection: ${inspectionOrderNumber}`);
    
    // Get the inspection order and project ID
    const inspection = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber)
    });
    
    if (!inspection) {
      console.log(`📦 Inspection order ${inspectionOrderNumber} not found`);
      return res.status(404).json({ error: "Inspection order not found" });
    }
    
    console.log(`📦 Found inspection order with project ID: ${inspection.projectId}`);
    
    // Count material identification records for this project
    const materialCount = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM material_identification 
      WHERE project_id = ${inspection.projectId}
    `);
    
    const count = materialCount[0]?.count || 0;
    console.log(`📦 Material Traceability count for inspection ${inspectionOrderNumber}: ${count}`);
    
    return res.json({ count: parseInt(count as string) });
    
  } catch (error) {
    console.error('📦 Error counting material identification records:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

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
    } else if (tabName === 'Final Dossier') {
      formattedTabName = 'FinalDossier'; // Format for GCS path consistency
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

// Special endpoint specifically for Final Dossier documents
router.get("/:inspectionOrderNumber/Final%20Dossier/dossier", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { inspectionOrderNumber } = req.params;
    
    console.log(`🔍 Final Dossier endpoint called for: ${inspectionOrderNumber}`);
    
    if (!inspectionOrderNumber) {
      return res.status(400).json({ error: "Inspection order number is required" });
    }
    
    // Get the inspection order ID
    const inspection = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber as string)
    });
    
    if (!inspection) {
      return res.status(404).json({ error: "Inspection order not found" });
    }
    
    try {
      const { initializeGCS } = await import('../utils/gcs-operations');
      const { storage, bucket } = await initializeGCS();
      
      if (storage && bucket) {
        const projectCode = inspection.projectCode || 'UNKNOWN';
        const dossierPaths = [
          `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Final_Dossier/`,
          `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/FinalDossier/`,
          `QMS/Inspections_Records/${inspectionOrderNumber}/Final_Dossier/`,
          `QMS/Inspections_Records/${inspectionOrderNumber}/FinalDossier/`
        ];
        
        console.log(`🔍 Final Dossier paths for inspection ${inspectionOrderNumber} with project ${projectCode}:`, dossierPaths);
        
        const gcsDocuments = [];
        
        for (const pathPrefix of dossierPaths) {
          try {
            const [files] = await bucket.getFiles({ prefix: pathPrefix });
            console.log(`Found ${files.length} files in path: ${pathPrefix}`);
            
            for (const file of files) {
              if (file.name.endsWith('.pdf') && !file.name.endsWith('/.keep')) {
                const [metadata] = await file.getMetadata();
                gcsDocuments.push({
                  id: `gcs-${Date.now()}-${Math.random()}`,
                  inspectionOrderId: inspection.id,
                  tabName: 'Final Dossier',
                  recordId: 'dossier',
                  fileName: file.name.split('/').pop(),
                  filePath: file.name,
                  fileUrl: null,
                  fileType: 'application/pdf',
                  fileSize: parseInt(metadata.size || '0'),
                  uploadedBy: null,
                  createdAt: metadata.timeCreated || new Date().toISOString(),
                  updatedAt: metadata.updated || new Date().toISOString()
                });
              }
            }
          } catch (pathError) {
            console.log(`Error checking path ${pathPrefix}:`, pathError);
          }
        }
        
        console.log(`Found ${gcsDocuments.length} Final Dossier documents in GCS`);
        return res.status(200).json(gcsDocuments);
      } else {
        console.log(`GCS not available, returning empty array for Final Dossier`);
        return res.status(200).json([]);
      }
    } catch (error) {
      console.error('Error checking GCS for Final Dossier documents:', error);
      return res.status(200).json([]);
    }
    
  } catch (error) {
    console.error('Error in Final Dossier endpoint:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// GET documents for an inspection order record (query parameter version)
router.get("/", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { inspectionOrderNumber, tabName, recordId } = req.query;
    console.log(`🚀 Query parameter endpoint called with: ${inspectionOrderNumber}, tab: "${tabName}", record: "${recordId}"`);
    
    if (!inspectionOrderNumber || !tabName || !recordId) {
      return res.status(400).json({ 
        error: "Required query parameters are missing",
        required: ["inspectionOrderNumber", "tabName", "recordId"]
      });
    }
    
    // Get the inspection order ID
    const inspection = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber as string)
    });
    
    if (!inspection) {
      return res.status(404).json({ error: "Inspection order not found" });
    }
    
    // Map tab names to match what's stored in the database
    let formattedTabName = tabName;
    if (tabName === 'Visual') {
      formattedTabName = 'Visual';
    } else if (tabName === 'ShopInspection') {
      formattedTabName = 'ShopInspection'; // Already formatted
    } else if (tabName === 'Shop Inspection') {
      formattedTabName = 'ShopInspection'; // Format for GCS path consistency
    } else if (tabName === 'Approved Drawing') {
      formattedTabName = 'ApprovedDrawing';
    } else if (tabName === 'DVR') {
      formattedTabName = 'DVR';
    } else if (tabName === 'ITP') {
      formattedTabName = 'ITP';
    } else if (tabName === 'Hydrotest') {
      formattedTabName = 'Hydrotest';
    } else if (tabName === 'Final Dossier') {
      formattedTabName = 'FinalDossier'; // Format for GCS path consistency
    }
    
    console.log(`Getting documents for inspection: ${inspectionOrderNumber}, tab: ${tabName} (formatted as: ${formattedTabName}), record: ${recordId}`);
    console.log(`Inspection order found with ID: ${inspection.id}`);
    
    // Get documents for this inspection order record
    // Handle backward compatibility for tab names (both "Shop Inspection" and "ShopInspection")
    let documents;
    
    if (recordId === 'ALL') {
      console.log(`ALL recordId detected - fetching all documents for tab ${tabName} (${formattedTabName})`);
      if (tabName === 'Shop Inspection' || tabName === 'ShopInspection') {
        // For Shop Inspection tab, search for both old format ("Shop Inspection") and new format ("ShopInspection")
        documents = await db.query.inspectionDocuments.findMany({
          where: sql`
            inspection_order_id = ${inspection.id} AND
            (tab_name = 'Shop Inspection' OR tab_name = 'ShopInspection')
          `,
          orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
        });
      } else {
        // For other tabs, use the formatted tab name
        documents = await db.query.inspectionDocuments.findMany({
          where: sql`
            inspection_order_id = ${inspection.id} AND
            tab_name = ${formattedTabName}
          `,
          orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
        });
      }
      console.log(`Found ${documents.length} total documents for tab ${tabName} (${formattedTabName}):`, documents.map(d => ({ id: d.id, tabName: d.tabName, fileName: d.fileName, recordId: d.recordId })));
    } else if (tabName === 'Shop Inspection' || tabName === 'ShopInspection') {
      console.log(`Shop Inspection tab detected - searching for both "Shop Inspection" and "ShopInspection" formats`);
      documents = await db.query.inspectionDocuments.findMany({
        where: sql`
          inspection_order_id = ${inspection.id} AND
          (tab_name = 'Shop Inspection' OR tab_name = 'ShopInspection') AND
          record_id = ${recordId as string}
        `,
        orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
      });
      console.log(`Found ${documents.length} Shop Inspection documents for record ${recordId}:`, documents.map(d => ({ id: d.id, tabName: d.tabName, fileName: d.fileName })));
    } else {
      // For other tabs, use the formatted tab name
      documents = await db.query.inspectionDocuments.findMany({
        where: sql`
          inspection_order_id = ${inspection.id} AND
          tab_name = ${formattedTabName} AND
          record_id = ${recordId as string}
        `,
        orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
      });
      console.log(`Found ${documents.length} documents for tab ${tabName} (${formattedTabName}), record ${recordId}`);
    }
    
    console.log(`Returning ${documents.length} documents to frontend`);
    return res.status(200).json(documents);
    
  } catch (error) {
    console.error('Error getting inspection documents:', error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// GET documents for an inspection order record (path parameter version)
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
    } else if (tabName === 'Final Dossier') {
      formattedTabName = 'FinalDossier'; // Format for GCS path consistency
    }
    
    console.log(`Getting documents for inspection: ${inspectionOrderNumber}, tab: ${tabName} (formatted as: ${formattedTabName}), record: ${recordId}`);
    console.log(`Inspection order found with ID: ${inspection.id}`);
    
    // Get documents for this inspection order record
    // Handle backward compatibility for tab names (both "Shop Inspection" and "ShopInspection")
    let documents;
    
    if (recordId === 'ALL') {
      console.log(`ALL recordId detected - fetching all documents for tab ${tabName} (${formattedTabName})`);
      if (tabName === 'Shop Inspection' || formattedTabName === 'ShopInspection') {
        // For Shop Inspection tab, search for both old format ("Shop Inspection") and new format ("ShopInspection")
        documents = await db.query.inspectionDocuments.findMany({
          where: sql`
            inspection_order_id = ${inspection.id} AND
            (tab_name = 'Shop Inspection' OR tab_name = 'ShopInspection')
          `,
          orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
        });
      } else {
        // For other tabs, use the formatted tab name
        documents = await db.query.inspectionDocuments.findMany({
          where: sql`
            inspection_order_id = ${inspection.id} AND
            tab_name = ${formattedTabName}
          `,
          orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
        });
      }
      console.log(`Found ${documents.length} total documents for tab ${tabName} (${formattedTabName}):`, documents.map(d => ({ id: d.id, tabName: d.tabName, fileName: d.fileName, recordId: d.recordId })));
    } else if (tabName === 'Shop Inspection') {
      console.log(`Shop Inspection tab detected - searching for both "Shop Inspection" and "ShopInspection" formats`);
      // For Shop Inspection tab, search for both old format ("Shop Inspection") and new format ("ShopInspection")
      documents = await db.query.inspectionDocuments.findMany({
        where: sql`
          inspection_order_id = ${inspection.id} AND
          (tab_name = 'Shop Inspection' OR tab_name = 'ShopInspection') AND
          record_id = ${recordId}
        `,
        orderBy: (inspectionDocuments, { desc }) => [desc(inspectionDocuments.createdAt)]
      });
      console.log(`Found ${documents.length} Shop Inspection documents for record ${recordId}:`, documents.map(d => ({ id: d.id, tabName: d.tabName, fileName: d.fileName })));
    } else if (tabName === 'Final Dossier' && recordId === 'dossier') {
      console.log(`🔍 Final Dossier tab detected - checking GCS storage directly for ${inspectionOrderNumber}`);
      
      // For Final Dossier, check GCS storage directly since PDFs are generated programmatically
      try {
        const { initializeGCS } = await import('../utils/gcs-operations');
        const { storage, bucket } = await initializeGCS();
        
        if (storage && bucket) {
          const projectCode = inspection.projectCode || 'UNKNOWN';
          const dossierPaths = [
            `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Final_Dossier/`,
            `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/FinalDossier/`,
            `QMS/Inspections_Records/${inspectionOrderNumber}/Final_Dossier/`,
            `QMS/Inspections_Records/${inspectionOrderNumber}/Final Dossier/`,
            `QMS/Inspections_Records/${inspectionOrderNumber}/FinalDossier/`
          ];
          
          console.log(`🔍 Final Dossier paths for inspection ${inspectionOrderNumber} with project ${projectCode}:`, dossierPaths);
          
          const gcsDocuments = [];
          
          for (const pathPrefix of dossierPaths) {
            try {
              const [files] = await bucket.getFiles({ prefix: pathPrefix });
              console.log(`Found ${files.length} files in path: ${pathPrefix}`);
              
              for (const file of files) {
                if (file.name.endsWith('.pdf') && !file.name.endsWith('/.keep')) {
                  const [metadata] = await file.getMetadata();
                  gcsDocuments.push({
                    id: `gcs-${Date.now()}-${Math.random()}`,
                    inspectionOrderId: inspection.id,
                    tabName: 'Final Dossier',
                    recordId: 'dossier',
                    fileName: file.name.split('/').pop(),
                    filePath: file.name,
                    fileUrl: null,
                    fileType: 'application/pdf',
                    fileSize: parseInt(metadata.size || '0'),
                    uploadedBy: null,
                    createdAt: metadata.timeCreated || new Date().toISOString(),
                    updatedAt: metadata.updated || new Date().toISOString()
                  });
                }
              }
            } catch (pathError) {
              console.log(`Error checking path ${pathPrefix}:`, pathError);
            }
          }
          
          console.log(`Found ${gcsDocuments.length} Final Dossier documents in GCS`);
          documents = gcsDocuments;
        } else {
          console.log(`GCS not available, returning empty array for Final Dossier`);
          documents = [];
        }
      } catch (gcsError) {
        console.error('Error checking GCS for Final Dossier documents:', gcsError);
        documents = [];
      }
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
      console.log(`Found ${documents.length} documents for tab ${tabName} (${formattedTabName}), record ${recordId}`);
    }
    
    console.log(`Returning ${documents.length} documents to frontend`);
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
    } else if (tabName === 'Final Dossier') {
      formattedTabName = 'FinalDossier'; // Format for GCS path consistency
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
    const { initializeGCS } = await import('../utils/gcs-operations');
    
    const { storage, bucket } = await initializeGCS();
    
    if (!storage || !bucket) {
      console.error('GCS not properly initialized for download');
      return res.status(500).json({ error: "File storage unavailable" });
    }
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
    
    console.log(`🗑️ DELETE REQUEST RECEIVED - Inspection: ${inspectionOrderNumber}, Tab: ${tabName}, Record: ${recordId}, Document: ${documentId}`);
    console.log(`🗑️ Full URL path: ${req.path}`);
    console.log(`🗑️ User: ${(req.user as any)?.username || 'Unknown'}`);
    
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
    } else if (tabName === 'Final Dossier') {
      formattedTabName = 'FinalDossier'; // Format for GCS path consistency
    }
    
    // Try multiple path formats for file detection
    const projectCode = inspection.projectCode || 'UNKNOWN';
    const fileExtension = document.fileName?.split('.').pop() || 'pdf';
    const pathsToTry = [
      // Stored database path (most reliable)
      document.filePath,
      // Current hierarchical format - using recordId.extension (what GCS shows)
      `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/${formattedTabName}/${recordId}.${fileExtension}`,
      // Alternative format - using original filename
      `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/${formattedTabName}/${document.fileName}`,
      // Old format fallback
      `QMS/Inspections_Records/${inspectionOrderNumber}/${formattedTabName}/${recordId}.${fileExtension}`
    ].filter(Boolean);
    
    console.log(`🗑️ PATHS TO TRY FOR DELETION:`, pathsToTry);
    console.log(`🗑️ PROJECT CODE: ${projectCode}`);
    console.log(`🗑️ FORMATTED TAB NAME: ${formattedTabName}`);
    console.log(`🗑️ DOCUMENT FILE NAME: ${document.fileName}`);
    console.log(`🗑️ DOCUMENT FILE PATH (stored): ${document.filePath}`);
    
    // Import GCS utilities
    const { initializeGCS } = require('../utils/gcs-operations');
    
    const { storage, bucket } = await initializeGCS();
    
    if (!storage || !bucket) {
      console.error('GCS not properly initialized');
      // Continue with database deletion even if GCS fails
      await db.delete(inspectionDocuments)
        .where(eq(inspectionDocuments.id, parseInt(documentId)));
      
      console.log(`Database record deleted for document ${documentId} (GCS unavailable)`);
      
      return res.status(200).json({ 
        message: "Document deleted from database (file storage unavailable)",
        fileDeleted: false,
        pathUsed: 'GCS unavailable'
      });
    }
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

// SHOP INSPECTION DEDICATED DELETE ENDPOINT - WITH PROPER AUTHENTICATION
router.delete('/shop-inspection-delete/:inspectionOrderNumber/:recordId/:documentId', ensureAuthenticated, async (req: Request, res: Response) => {
  console.log(`🏪🗑️ SHOP INSPECTION DELETE ENDPOINT CALLED! (With Authentication)`);
  console.log(`🏪 Params:`, req.params);
  console.log(`🏪 Method: ${req.method}, URL: ${req.url}`);
  console.log(`🏪 User:`, req.user);
  
  try {
    const { inspectionOrderNumber, recordId, documentId } = req.params;
    console.log(`🏪 Deleting Shop Inspection - Order: ${inspectionOrderNumber}, Record: ${recordId}, Document: ${documentId}`);

    // Get the document record first
    console.log(`🏪 Fetching document with ID: ${documentId}`);
    const document = await db.query.inspectionDocuments.findFirst({
      where: eq(inspectionDocuments.id, parseInt(documentId))
    });
    
    if (!document) {
      console.log(`🏪 Document ${documentId} not found in database`);
      return res.status(404).json({ 
        success: false,
        error: "Document not found",
        message: `Document with ID ${documentId} does not exist` 
      });
    }
    
    console.log(`🏪 Found document: ${document.fileName}`);
    console.log(`🏪 GCS path: ${document.filePath}`);
    
    let gcsDeleted = false;
    let gcsError = null;
    
    // Try to delete from GCS
    try {
      console.log(`🏪 Initializing GCS for file deletion...`);
      const { initializeGCS } = await import('../utils/gcs-operations');
      const { bucket } = await initializeGCS();
      
      if (!bucket) {
        throw new Error('GCS bucket not available - initialization failed');
      }
      
      console.log(`🏪 GCS bucket initialized successfully`);
      const file = bucket.file(document.filePath);
      
      console.log(`🏪 Checking if file exists in GCS: ${document.filePath}`);
      const [exists] = await file.exists();
      
      if (exists) {
        console.log(`🏪 File exists in GCS, attempting deletion...`);
        await file.delete();
        console.log(`🏪 ✅ Successfully deleted GCS file: ${document.filePath}`);
        gcsDeleted = true;
      } else {
        console.log(`🏪 ⚠️ File not found in GCS (may have been deleted already): ${document.filePath}`);
        gcsDeleted = true; // Consider it "deleted" if it doesn't exist
      }
    } catch (error: any) {
      console.error(`🏪 ❌ GCS deletion failed for ${document.fileName}:`, error);
      gcsError = error.message || 'Unknown GCS error';
      console.log(`🏪 Continuing with database deletion despite GCS failure...`);
    }
    
    // Always delete from database regardless of GCS success
    try {
      console.log(`🏪 Deleting document ${documentId} from database...`);
      await db.delete(inspectionDocuments).where(eq(inspectionDocuments.id, parseInt(documentId)));
      console.log(`🏪 ✅ Successfully deleted database record for document ${documentId}`);
      
      // Provide detailed response based on what succeeded
      if (gcsDeleted) {
        console.log(`🏪 🎉 COMPLETE SUCCESS - Both database and GCS deletion successful`);
        res.json({ 
          success: true, 
          message: 'Shop Inspection document deleted successfully',
          details: 'Both database record and GCS file removed',
          gcsStatus: 'success',
          databaseStatus: 'success'
        });
      } else {
        console.log(`🏪 ⚠️ PARTIAL SUCCESS - Database deleted, GCS failed`);
        res.json({ 
          success: true, 
          message: 'Partial Success: Database record deleted, but GCS file removal failed',
          warning: `GCS deletion failed: ${gcsError}`,
          details: 'Database record removed successfully. File may remain in storage.',
          gcsStatus: 'failed',
          gcsError: gcsError,
          databaseStatus: 'success'
        });
      }
      
    } catch (dbError: any) {
      console.error(`🏪 ❌ Database deletion failed for document ${documentId}:`, dbError);
      res.status(500).json({ 
        success: false,
        error: 'Failed to delete database record',
        message: dbError.message || 'Unknown database error',
        gcsStatus: gcsDeleted ? 'success' : 'failed',
        gcsError: gcsError,
        databaseStatus: 'failed'
      });
    }
    
  } catch (error: any) {
    console.error('🏪 💥 Shop Inspection deletion error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete Shop Inspection document',
      message: error.message || 'Unknown server error'
    });
  }
});

// CLEANUP ORPHANED FILES ENDPOINT
router.delete('/cleanup-orphaned-shop-inspection', ensureAuthenticated, async (req: Request, res: Response) => {
  console.log(`🧹 CLEANUP ORPHANED SHOP INSPECTION FILE ENDPOINT CALLED`);
  console.log(`🧹 User:`, req.user);
  
  try {
    console.log(`🧹 Attempting to clean up orphaned Shop Inspection file...`);
    
    const success = await cleanupShopInspectionOrphanedFile();
    
    if (success) {
      console.log(`🧹 ✅ Successfully cleaned up orphaned Shop Inspection file`);
      res.json({
        success: true,
        message: 'Orphaned Shop Inspection file cleaned up successfully',
        details: 'File removed from Google Cloud Storage'
      });
    } else {
      console.log(`🧹 ⚠️ Cleanup completed but file may not have existed`);
      res.json({
        success: true,
        message: 'Cleanup completed - file may not have existed',
        details: 'No file found to clean up'
      });
    }
  } catch (error: any) {
    console.error(`🧹 ❌ Failed to clean up orphaned file:`, error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message || 'Unknown error occurred during cleanup'
    });
  }
});

// WELDING DELETE ENDPOINT - Properly authenticated endpoint for Welding file deletion with GCS cleanup
router.delete('/welding-delete/:inspectionOrderNumber/:recordId/:documentId', ensureAuthenticated, async (req: Request, res: Response) => {
  console.log(`🔥🔥🔥 AUTHENTICATED WELDING DELETE ENDPOINT HIT! 🔥🔥🔥`);
  console.log(`🔥 Method: ${req.method}, Path: ${req.path}`);
  console.log(`🔥 User authenticated:`, req.user);
  
  try {
    const { inspectionOrderNumber, recordId, documentId } = req.params;
    console.log(`🔥 WELDING DELETE - Inspection: ${inspectionOrderNumber}, Record: ${recordId}, Document: ${documentId}`);

    // Import GCS operations
    const { initializeGCS } = await import('../utils/gcs-operations');
    
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
    
    console.log(`🔥 Found document: ${document.fileName} at path: ${document.filePath}`);
    
    let gcsStatus = 'failed';
    let databaseStatus = 'failed';
    let details = '';
    
    // Try to delete from GCS
    try {
      const { bucket } = await initializeGCS();
      if (!bucket) {
        throw new Error('GCS bucket not available');
      }
      
      // Reconstruct GCS path for Welding tab
      const gcsPath = `QMS/Inspections_Records/${inspection.projectCode}/${inspectionOrderNumber}/Welding/${recordId}.pdf`;
      console.log(`🔥 Attempting GCS deletion at path: ${gcsPath}`);
      
      const file = bucket.file(gcsPath);
      const [exists] = await file.exists();
      
      if (exists) {
        await file.delete();
        console.log(`🔥 ✅ GCS file deleted successfully: ${gcsPath}`);
        gcsStatus = 'success';
        details += 'GCS file removed successfully. ';
      } else {
        console.log(`🔥 ⚠️ GCS file not found at path: ${gcsPath}`);
        gcsStatus = 'not_found';
        details += 'GCS file not found (may have been already deleted). ';
      }
    } catch (error: any) {
      console.error(`🔥 ❌ GCS deletion failed for ${document.fileName}:`, error.message);
      gcsStatus = 'failed';
      details += `GCS deletion failed: ${error.message}. `;
    }
    
    // Always delete from database regardless of GCS success
    try {
      await db.delete(inspectionDocuments).where(eq(inspectionDocuments.id, parseInt(documentId)));
      console.log(`🔥 ✅ Successfully deleted database record for document ${documentId}`);
      databaseStatus = 'success';
      details += 'Database record removed successfully.';
      
      // Provide detailed feedback about what succeeded and what failed
      res.json({ 
        success: true, 
        message: gcsStatus === 'success' ? 'Welding document deleted completely' : 'Welding document partially deleted',
        gcsStatus,
        databaseStatus,
        details: details.trim()
      });
      
    } catch (dbError: any) {
      console.error(`🔥 ❌ Database deletion failed for document ${documentId}:`, dbError.message);
      res.status(500).json({ 
        success: false,
        error: 'Failed to delete database record',
        message: dbError.message,
        gcsStatus,
        databaseStatus,
        details: details + ` Database deletion failed: ${dbError.message}`
      });
    }
    
  } catch (error: any) {
    console.error('🔥 Authenticated Welding deletion error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete Welding document',
      message: error.message 
    });
  }
});

export default router;