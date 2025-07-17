import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { AnyZodObject } from "zod";
import multer from "multer";
import { uploadMaterialIdentificationDocument, deleteMaterialIdentificationDocument, getGcsClient } from "../utils/material-identification-document-upload-fixed";
import { checkGcsPermissions } from '../utils/gcs-permissions-check';

// Configure multer for in-memory file storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  } 
});

// Inline middleware to validate request body against a Zod schema
const validateSchema = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Log the incoming data before validation
      console.log("==== VALIDATION MIDDLEWARE ====");
      console.log("Raw request body:", JSON.stringify(req.body, null, 2));
      
      // Use schema.safeParse instead of parse to get detailed error information
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        console.error("Validation errors:", result.error.format());
        console.error("Validation error issues:", result.error.issues);
        return res.status(400).json({
          error: "Validation failed",
          details: result.error.format(),
          issues: result.error.issues
        });
      }
      
      // Replace the request body with the validated data
      req.body = result.data;
      console.log("Validated data:", JSON.stringify(req.body, null, 2));
      
      next();
    } catch (err) {
      const error = err as Error;
      console.error("Unexpected validation error:", error);
      return res.status(400).json({
        error: "Validation failed",
        message: error.message || "Unknown validation error"
      });
    }
  };
};

const router = Router();

// Schema for material identification validation 
const materialIdentificationSchema = z.object({
  materialIdentificationId: z.string(),
  projectId: z.number().or(z.string().transform(id => parseInt(id))),
  projectNumber: z.string(),
  projectName: z.string(),
  inspectionOrderNumber: z.string().optional(), // Made optional
  materialDescription: z.string(),
  materialCode: z.string(),
  specification: z.string(),
  materialGrade: z.string(),
  heatNumber: z.string(),
  batchNumber: z.string().optional(),
  millName: z.string(),
  millTestCertificateNumber: z.string(),
  quantity: z.string(),
  dimensions: z.string(),
  materialStatus: z.string(),
  inspectorName: z.string(),
  inspectionDate: z.string().or(z.date().transform(date => date.toISOString().split('T')[0])),
  remarks: z.string().optional(),
  createdBy: z.number().optional(),
  updatedBy: z.number().optional()
});

// Get all material identifications with optional filters
router.get("/", async (req, res) => {
  try {
    const {
      search,
      projectId,
      materialGrade,
      status,
      fromDate,
      toDate,
      page = "1", 
      limit = "20"
    } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;
    
    // Create base query and build conditions directly with SQL template literals
    let baseQuery = sql`SELECT * FROM material_identification`;
    
    // Build WHERE conditions
    const conditions = [];
    
    if (search) {
      const searchParam = `%${search}%`;
      conditions.push(sql`(
        material_identification_id ILIKE ${searchParam} OR
        material_description ILIKE ${searchParam} OR
        material_code ILIKE ${searchParam} OR
        heat_number ILIKE ${searchParam} OR
        mill_test_certificate_number ILIKE ${searchParam} OR
        inspector_name ILIKE ${searchParam}
      )`);
    }
    
    if (projectId) {
      // First, try to get the project code from the projects table
      const projectResult = await db.execute(sql`
        SELECT code FROM projects WHERE id = ${projectId}
      `) as any;
      
      if (projectResult && projectResult.rows && projectResult.rows.length > 0) {
        const projectCode = projectResult.rows[0].code;
        console.log("Filtering by project code:", projectCode);
        
        // Filter material identifications by project_number that matches exactly the project code
        conditions.push(sql`project_number = ${projectCode}`);
      } else {
        // Fallback to filtering by project_id if we couldn't find the project code
        conditions.push(sql`project_id = ${projectId}`);
      }
    }
    
    if (materialGrade) {
      conditions.push(sql`material_grade = ${materialGrade}`);
    }
    
    if (status) {
      conditions.push(sql`material_status = ${status}`);
    }
    
    if (fromDate) {
      conditions.push(sql`inspection_date >= ${fromDate}`);
    }
    
    if (toDate) {
      conditions.push(sql`inspection_date <= ${toDate}`);
    }
    
    // Add WHERE clause if there are conditions
    if (conditions.length > 0) {
      baseQuery = sql`${baseQuery} WHERE ${sql.join(conditions, sql` AND `)}`;
    }
    
    // Add order by and pagination
    baseQuery = sql`${baseQuery} ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;
    
    // Execute the query
    const materialIdentifications = await db.execute(baseQuery) as any;
    
    // Count query for pagination
    let countQuery = sql`SELECT COUNT(*) FROM material_identification`;
    
    // Add the same conditions to count query
    if (conditions.length > 0) {
      // Use the same SQL template conditions as the main query
      countQuery = sql`${countQuery} WHERE ${sql.join(conditions, sql` AND `)}`;
    }
    
    // Execute count query
    const countResult = await db.execute(countQuery) as any;
    
    const totalCount = parseInt(countResult.rows[0]?.count || '0', 10);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      data: materialIdentifications.rows || [],
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages
      }
    });
  } catch (error) {
    console.error("Error getting material identifications:", error);
    res.status(500).json({ error: "Failed to get material identifications" });
  }
});

// Define the type for the counter table rows
interface MaterialIdentificationCounter {
  id: number;
  year: number;
  sequence: number;
  updated_at: Date;
}

// Get next Material Identification ID (format: MI-YYYY-N)
router.get("/next-id", async (req, res) => {
  try {
    // Get current year
    const currentYear = new Date().getFullYear();
    
    // Check if counter exists for current year
    const counterResult = await db.execute(sql`
      SELECT * FROM material_identification_counter
      WHERE year = ${currentYear}
    `) as any;
    
    let sequence = 1;
    
    if (!counterResult || !counterResult.rows || counterResult.rows.length === 0) {
      // Insert new counter for current year
      await db.execute(sql`
        INSERT INTO material_identification_counter (year, sequence)
        VALUES (${currentYear}, ${sequence})
      `);
    } else {
      // Use existing counter
      sequence = counterResult.rows[0].sequence;
    }
    
    // Format next ID
    const nextId = `MI-${currentYear}-${sequence}`;
    
    res.json({ nextId });
  } catch (error) {
    console.error("Error getting next Material Identification ID:", error);
    res.status(500).json({ error: "Failed to generate next ID" });
  }
});

// Define the interface for Material Identification records
interface MaterialIdentification {
  id: number;
  material_identification_id: string;
  project_id: number;
  project_number: string;
  project_name: string;
  inspection_order_number: string;
  material_description: string;
  material_code: string;
  specification: string;
  material_grade: string;
  heat_number: string;
  batch_number: string | null;
  mill_name: string;
  mill_test_certificate_number: string;
  quantity: string;
  dimensions: string;
  material_status: string;
  inspector_name: string;
  inspection_date: string;
  remarks: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

// Create new material identification
router.post("/", validateSchema(materialIdentificationSchema), async (req, res) => {
  try {
    const data = req.body;
    
    // If user is authenticated, add user ID as creator
    if (req.user) {
      data.createdBy = req.user.id;
      data.updatedBy = req.user.id;
    }
    
    // Insert material identification record
    const result = await db.execute(sql`
      INSERT INTO material_identification (
        material_identification_id,
        project_id,
        project_number,
        project_name,
        inspection_order_number,
        material_description,
        material_code,
        specification,
        material_grade,
        heat_number,
        batch_number,
        mill_name,
        mill_test_certificate_number,
        quantity,
        dimensions,
        material_status,
        inspector_name,
        inspection_date,
        remarks,
        created_by,
        updated_by
      ) VALUES (
        ${data.materialIdentificationId},
        ${data.projectId},
        ${data.projectNumber},
        ${data.projectName},
        ${data.inspectionOrderNumber || ''},
        ${data.materialDescription},
        ${data.materialCode},
        ${data.specification},
        ${data.materialGrade},
        ${data.heatNumber},
        ${data.batchNumber || null},
        ${data.millName},
        ${data.millTestCertificateNumber},
        ${data.quantity},
        ${data.dimensions},
        ${data.materialStatus},
        ${data.inspectorName},
        ${data.inspectionDate},
        ${data.remarks || null},
        ${data.createdBy || null},
        ${data.updatedBy || null}
      ) RETURNING *
    `);
    
    // Increment the sequence for the next material identification
    const currentYear = new Date().getFullYear();
    await db.execute(sql`
      UPDATE material_identification_counter
      SET sequence = sequence + 1, updated_at = CURRENT_TIMESTAMP
      WHERE year = ${currentYear}
    `);
    
    if (result && result.rows && result.rows.length > 0) {
      res.status(201).json(result.rows[0]);
    } else {
      throw new Error("No data returned from insert operation");
    }
  } catch (error) {
    console.error("Error creating material identification:", error);
    res.status(500).json({ error: "Failed to create material identification" });
  }
});

// Get material identifications by project ID
router.get("/project/:projectId", async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    const materialIdentifications = await db.execute(sql`
      SELECT * FROM material_identification
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `) as any;
    
    res.json(materialIdentifications.rows || []);
  } catch (error) {
    console.error("Error getting material identifications for project:", error);
    res.status(500).json({ error: "Failed to get material identifications for project" });
  }
});

// Special case for "new" record creation
router.get("/new", async (req, res) => {
  try {
    // Return an empty template for a new record
    return res.json({
      material_identification_id: '',
      project_id: null,
      project_number: '',
      project_name: '',
      inspection_order_number: '',
      material_description: '',
      material_code: '',
      specification: '',
      material_grade: '',
      heat_number: '',
      batch_number: null,
      mill_name: '',
      mill_test_certificate_number: '',
      quantity: '',
      dimensions: '',
      material_status: '',
      inspector_name: '',
      inspection_date: new Date().toISOString().split('T')[0],
      remarks: null
    });
  } catch (error) {
    console.error("Error creating new material identification template:", error);
    res.status(500).json({ error: "Failed to create new material identification template" });
  }
});

// Test route to check GCS connectivity - MUST come before /:id routes
router.get("/test-gcs-connection", async (req, res) => {
  try {
    console.log("Testing GCS connection for Material Identification documents");
    
    // Run the permissions check using the imported function
    const result = await checkGcsPermissions();
    console.log("GCS Permissions Check Result:", result);
    
    res.json({
      success: result.success,
      message: "GCS connection test completed",
      result
    });
  } catch (error) {
    console.error("Error testing GCS connection:", error);
    res.status(500).json({
      success: false,
      message: "Error testing GCS connection",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Update (edit) material identification record
router.put("/:id", validateSchema(materialIdentificationSchema), async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    
    // Debug logging for troubleshooting
    console.log("==== UPDATE REQUEST DATA ====");
    console.log("Request params ID:", id);
    console.log("Request body fields:", Object.keys(data));
    console.log("Full request body:", JSON.stringify(data, null, 2));
    
    // If user is authenticated, add user ID as updater
    const updatedBy = req.user ? req.user.id : null;
    
    // Check if the record exists
    const checkRecord = await db.execute(sql`
      SELECT id FROM material_identification WHERE id = ${id}
    `) as any;
    
    if (!checkRecord || !checkRecord.rows || checkRecord.rows.length === 0) {
      return res.status(404).json({ error: "Material identification record not found" });
    }
    
    // Update the record using a direct SQL approach to bypass potential issues with ORM
    console.log("Preparing to execute UPDATE query for material identification ID:", id);
    
    // Create the SQL query with explicit field setting
    // IMPORTANT CHANGE: Use direct field setting to ensure each field gets updated properly
    const updateResult = await db.execute(sql`
      UPDATE material_identification 
      SET
        material_identification_id = ${data.materialIdentificationId},
        project_id = ${parseInt(data.projectId.toString())},
        project_number = ${data.projectNumber},
        project_name = ${data.projectName},
        inspection_order_number = ${data.inspectionOrderNumber || ''},
        material_description = ${data.materialDescription},
        material_code = ${data.materialCode},
        specification = ${data.specification},
        material_grade = ${data.materialGrade},
        heat_number = ${data.heatNumber},
        batch_number = ${data.batchNumber || null},
        mill_name = ${data.millName},
        mill_test_certificate_number = ${data.millTestCertificateNumber},
        quantity = ${data.quantity},
        dimensions = ${data.dimensions},
        material_status = ${data.materialStatus},
        inspector_name = ${data.inspectorName},
        inspection_date = ${data.inspectionDate},
        remarks = ${data.remarks || null},
        updated_by = ${updatedBy},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);
    
    // Log the query details and response
    console.log("UPDATE query complete for fields:", [
      'material_identification_id', 'project_id', 'project_number', 'project_name',
      'inspection_order_number', 'material_description', 'material_code', 'specification',
      'material_grade', 'heat_number', 'batch_number', 'mill_name', 'mill_test_certificate_number',
      'quantity', 'dimensions', 'material_status', 'inspector_name', 'inspection_date',
      'remarks', 'updated_by', 'updated_at'
    ]);
    
    console.log("UPDATE query result:", updateResult && updateResult.rows ? updateResult.rows[0] : "No result");
    
    // Assign the result for consistency with existing code
    const result = updateResult;
    
    if (result && result.rows && result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      throw new Error("No data returned from update operation");
    }
  } catch (err) {
    // Convert unknown type to a more useful error object
    const error = err as Error;
    
    // Detailed error logging
    console.error("Error updating material identification:", error);
    console.error("Error type:", typeof error);
    console.error("Error message:", error.message || 'Unknown error');
    
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.message,
        fields: (error as any).errors || []
      });
    }
    
    if (error.name === 'SyntaxError') {
      return res.status(400).json({ 
        error: "Syntax error in request", 
        details: error.message
      });
    }
    
    res.status(500).json({ 
      error: "Failed to update material identification", 
      message: error.message || 'Unknown server error'
    });
  }
});

// Special test endpoint for direct updates without validation middleware
router.put("/test-update/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    
    console.log("==== TEST UPDATE ENDPOINT ====");
    console.log("Request params ID:", id);
    console.log("Raw request body:", data);
    
    // Use drizzle's sql template for the update instead of raw SQL
    // This should automatically handle the query execution correctly
    const updateResult = await db.execute(sql`
      UPDATE material_identification
      SET
        material_description = ${data.materialDescription || sql`material_description`},
        material_code = ${data.materialCode || sql`material_code`},
        specification = ${data.specification || sql`specification`},
        material_grade = ${data.materialGrade || sql`material_grade`},
        mill_name = ${data.millName || sql`mill_name`},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${parseInt(id)}
      RETURNING *
    `);
    
    console.log("Update executed using drizzle SQL template");
    
    // Assign the result to match expected format
    const result = updateResult;
    
    if (result && result.rows && result.rows.length > 0) {
      console.log("Test update successful:", result.rows[0]);
      res.json({
        success: true,
        message: "Test update successful",
        data: result.rows[0]
      });
    } else {
      throw new Error("No data returned from test update operation");
    }
  } catch (err) {
    const error = err as Error;
    console.error("Error in test update:", error);
    res.status(500).json({
      success: false,
      message: "Test update failed",
      error: error.message
    });
  }
});

// Get material identification by ID - this must come after all other specific routes
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    
    // Regular case - get by ID
    const materialIdentification = await db.execute(sql`
      SELECT * FROM material_identification
      WHERE id = ${id}
    `) as any;
    
    if (!materialIdentification || !materialIdentification.rows || materialIdentification.rows.length === 0) {
      return res.status(404).json({ error: "Material identification not found" });
    }
    
    res.json(materialIdentification.rows[0]);
  } catch (error) {
    console.error("Error getting material identification:", error);
    res.status(500).json({ error: "Failed to get material identification" });
  }
});

// Document upload for material identification
router.post("/:id/documents", upload.single('file'), async (req: Request, res: Response) => {
  try {
    console.log('Material identification document upload request received');
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
    
    const materialIdentificationId = req.params.id;
    
    if (!materialIdentificationId) {
      console.error('Missing materialIdentificationId in request parameters');
      return res.status(400).json({ error: "Material identification ID is required" });
    }
    
    // Make sure the material identification exists
    const miRecord = await db.execute(sql`
      SELECT id FROM material_identification WHERE id = ${materialIdentificationId}
    `) as any;
    
    if (!miRecord || !miRecord.rows || miRecord.rows.length === 0) {
      console.error(`Material identification with ID ${materialIdentificationId} not found`);
      return res.status(404).json({ error: "Material identification not found" });
    }
    
    console.log(`Material identification ${materialIdentificationId} found, proceeding with upload`);
    
    // Set materialIdentificationId in request body for the upload util
    req.body.materialIdentificationId = materialIdentificationId;
    
    // Upload document
    console.log('Starting document upload to GCS...');
    const uploadResult = await uploadMaterialIdentificationDocument(req);
    console.log('Upload result:', uploadResult);
    
    if (!uploadResult.success) {
      console.error('Upload failed:', uploadResult.error);
      return res.status(500).json({ error: uploadResult.error || "Document upload failed" });
    }
    
    // Get user ID if authenticated
    const userId = req.user ? req.user.id : null;
    console.log(`User ID for document upload: ${userId || 'Not authenticated'}`);
    
    // Store document details in database
    console.log('Storing document metadata in database...');
    const documentRecord = await db.execute(sql`
      INSERT INTO material_identification_documents (
        material_identification_id,
        file_name,
        file_path,
        file_url,
        file_type,
        file_size,
        document_type,
        description,
        uploaded_by
      ) VALUES (
        ${parseInt(materialIdentificationId)},
        ${uploadResult.file_name || 'unnamed'},
        ${uploadResult.document_file_path || ''},
        ${uploadResult.document_url || ''},
        ${uploadResult.file_type || 'application/pdf'},
        ${uploadResult.file_size || 0},
        ${req.body.documentType || 'general'},
        ${req.body.description || ''},
        ${userId}
      ) RETURNING *
    `) as any;
    
    if (!documentRecord || !documentRecord.rows || documentRecord.rows.length === 0) {
      console.error('Failed to store document record in database');
      return res.status(500).json({ error: "Failed to store document record" });
    }
    
    console.log('Document successfully uploaded and recorded in database');
    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      document: documentRecord.rows[0]
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    res.status(500).json({ error: "Failed to upload document", details: error?.toString?.() });
  }
});

// Get all documents for a material identification
router.get("/:id/documents", async (req: Request, res: Response) => {
  try {
    const materialIdentificationId = req.params.id;
    
    if (!materialIdentificationId) {
      return res.status(400).json({ error: "Material identification ID is required" });
    }
    
    // Get documents from database
    const documents = await db.execute(sql`
      SELECT * FROM material_identification_documents
      WHERE material_identification_id = ${materialIdentificationId}
      ORDER BY created_at DESC
    `) as any;
    
    if (!documents.rows || documents.rows.length === 0) {
      return res.json([]);
    }
    
    // Get GCS client to check file existence
    const { storage, bucketName } = getGcsClient();
    const bucket = storage.bucket(bucketName);
    
    // Filter documents that actually exist in GCS
    const validDocuments = [];
    const invalidDocumentIds = [];
    
    for (const doc of documents.rows) {
      try {
        // Check if file exists in GCS
        const file = bucket.file(doc.file_path);
        const [exists] = await file.exists();
        
        if (exists) {
          validDocuments.push(doc);
        } else {
          console.warn(`Document in database but not in GCS: ${doc.file_path}`);
          invalidDocumentIds.push(doc.id);
        }
      } catch (err) {
        console.error(`Error checking document existence: ${doc.file_path}`, err);
        // Include document in response even if check fails
        validDocuments.push(doc);
      }
    }
    
    // Clean up database by removing references to files that don't exist in GCS
    if (invalidDocumentIds.length > 0) {
      try {
        await db.execute(sql`
          DELETE FROM material_identification_documents
          WHERE id = ANY(${invalidDocumentIds})
        `);
        console.log(`Cleaned up ${invalidDocumentIds.length} invalid document references`);
      } catch (err) {
        console.error("Error cleaning up invalid document references:", err);
      }
    }
    
    res.json(validDocuments);
  } catch (error) {
    console.error("Error getting documents:", error);
    res.status(500).json({ error: "Failed to get documents" });
  }
});

// Delete a document
router.delete("/documents/:documentId", async (req: Request, res: Response) => {
  try {
    console.log('🗑️ Delete document request received');
    console.log('Request params:', req.params);
    console.log('Document ID:', req.params.documentId);
    
    const documentId = req.params.documentId;
    
    if (!documentId) {
      console.error('❌ Document ID is missing');
      return res.status(400).json({ error: "Document ID is required" });
    }
    
    // Get document details first
    const document = await db.execute(sql`
      SELECT mid.*, mi.material_identification_id, mi.project_number
      FROM material_identification_documents mid
      JOIN material_identification mi ON mid.material_identification_id = mi.id
      WHERE mid.id = ${documentId}
    `) as any;
    
    if (!document || !document.rows || document.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    const documentDetails = document.rows[0];
    const miId = documentDetails.material_identification_id;
    const projectNumber = documentDetails.project_number || 'UNKNOWN';
    
    console.log('📄 Document details:', {
      id: documentDetails.id,
      miId,
      projectNumber,
      storedPath: documentDetails.file_path,
      documentType: documentDetails.document_type
    });
    
    // Get GCS client
    const { storage, bucketName } = getGcsClient();
    const bucket = storage.bucket(bucketName);
    
    // Try multiple paths to find the file (similar to download function)
    let fileFound = false;
    let actualFilePath = '';
    
    // Path 1: Try new hierarchical format
    const newPath = `QMS/Material_Identification/${projectNumber}/${miId}/${documentDetails.document_type === 'material_certificate' ? 'Material Certificate' : 
      documentDetails.document_type === 'technical_datasheet' ? 'Technical Datasheet' : 
      documentDetails.document_type === 'inspection_report' ? 'Inspection Report' : 
      documentDetails.document_type === 'calibration_certificate' ? 'Calibration Certificate' : 
      'Other Document'}.${documentDetails.file_name.split('.').pop()}`;
    
    console.log('🔍 Trying new path format:', newPath);
    let file = bucket.file(newPath);
    let [exists] = await file.exists();
    
    if (exists) {
      console.log('✅ File found in new path format');
      fileFound = true;
      actualFilePath = newPath;
    } else {
      // Path 2: Try stored database path
      console.log('🔍 Trying stored database path:', documentDetails.file_path);
      file = bucket.file(documentDetails.file_path);
      [exists] = await file.exists();
      
      if (exists) {
        console.log('✅ File found in stored database path');
        fileFound = true;
        actualFilePath = documentDetails.file_path;
      } else {
        // Path 3: Try old format without project number
        const oldPath = `QMS/Material_Identification/${miId}/${documentDetails.document_type === 'material_certificate' ? 'Material Certificate' : 
          documentDetails.document_type === 'technical_datasheet' ? 'Technical Datasheet' : 
          documentDetails.document_type === 'inspection_report' ? 'Inspection Report' : 
          documentDetails.document_type === 'calibration_certificate' ? 'Calibration Certificate' : 
          'Other Document'}.${documentDetails.file_name.split('.').pop()}`;
        
        console.log('🔍 Trying old path format:', oldPath);
        file = bucket.file(oldPath);
        [exists] = await file.exists();
        
        if (exists) {
          console.log('✅ File found in old path format');
          fileFound = true;
          actualFilePath = oldPath;
        }
      }
    }
    
    if (!fileFound) {
      console.warn('⚠️ File not found in any path format, but continuing with database deletion');
    } else {
      // Delete the file from GCS
      try {
        await file.delete();
        console.log('✅ File deleted from GCS:', actualFilePath);
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete file from GCS:', deleteError);
      }
    }
    
    // Delete from database
    await db.execute(sql`
      DELETE FROM material_identification_documents
      WHERE id = ${documentId}
    `);
    
    console.log('✅ Document deleted from database');
    
    res.json({
      success: true,
      message: "Document deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Download a document
router.get("/:id/documents/:documentId/download", async (req: Request, res: Response) => {
  try {
    const materialIdentificationId = req.params.id;
    const documentId = req.params.documentId;
    
    if (!materialIdentificationId || !documentId) {
      return res.status(400).json({ error: "Material identification ID and document ID are required" });
    }
    
    // Get document details from database
    const document = await db.execute(sql`
      SELECT * FROM material_identification_documents
      WHERE id = ${documentId} AND material_identification_id = ${materialIdentificationId}
    `) as any;
    
    if (!document || !document.rows || document.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    const documentDetails = document.rows[0];
    
    // Get material identification details to get project number
    const miRecord = await db.execute(sql`
      SELECT material_identification_id, project_number FROM material_identification 
      WHERE id = ${materialIdentificationId}
    `) as any;
    
    if (!miRecord || !miRecord.rows || miRecord.rows.length === 0) {
      return res.status(404).json({ error: "Material identification not found" });
    }
    
    const miId = miRecord.rows[0].material_identification_id;
    const projectNumber = miRecord.rows[0].project_number || 'UNKNOWN';
    
    // Get GCS client
    const { storage, bucketName } = getGcsClient();
    const bucket = storage.bucket(bucketName);
    
    // Try to find the file with different path structures
    const possiblePaths = [
      // New hierarchical path structure
      `QMS/Material_Identification/${projectNumber}/${miId}/${documentDetails.file_name}`,
      // Old path structure (stored in database)
      documentDetails.file_path,
      // Alternative old path structure
      `QMS/Material_Identification/${miId}/${documentDetails.file_name}`
    ];
    
    let file = null;
    let foundPath = null;
    
    // Try each path until we find the file
    for (const path of possiblePaths) {
      try {
        const testFile = bucket.file(path);
        const [exists] = await testFile.exists();
        if (exists) {
          file = testFile;
          foundPath = path;
          console.log(`Found file at path: ${path}`);
          break;
        }
      } catch (err) {
        console.log(`Path ${path} not found, trying next...`);
      }
    }
    
    if (!file) {
      console.error(`File not found at any of the attempted paths:`, possiblePaths);
      return res.status(404).json({ error: "File not found in storage" });
    }
    
    // Get file metadata
    const [metadata] = await file.getMetadata();
    const fileSize = metadata.size;
    const mimeType = metadata.contentType || 'application/octet-stream';
    
    // Set response headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="${documentDetails.file_name}"`);
    
    // Stream the file to the response
    const stream = file.createReadStream();
    
    stream.on('error', (err) => {
      console.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error downloading file' });
      }
    });
    
    stream.on('end', () => {
      console.log(`Successfully downloaded file: ${documentDetails.file_name} (${fileSize} bytes) from path: ${foundPath}`);
    });
    
    stream.pipe(res);
    
  } catch (error) {
    console.error("Error downloading document:", error);
    res.status(500).json({ error: "Failed to download document" });
  }
});

export default router;