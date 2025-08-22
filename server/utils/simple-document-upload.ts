import { Request } from 'express';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

// Simple, reliable document upload function
export const simpleDocumentUpload = async (req: Request, materialIdentificationId: string): Promise<{
  success: boolean;
  document_file_path?: string;
  document_url?: string;
  error?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
}> => {
  console.log('=== SIMPLE UPLOAD START ===');
  
  if (!req.file) {
    console.error('No file in request');
    return { success: false, error: 'No file uploaded' };
  }

  try {
    // Use explicit GCS configuration with credentials from environment
    let storageOptions: any = {};
    
    // Check if we have explicit credentials in the environment
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      try {
        // Parse the credentials from the environment variable
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        
        storageOptions = {
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
          credentials
        };
        console.log('Using explicit GCS credentials from environment');
      } catch (parseError) {
        console.error('Failed to parse GOOGLE_CLOUD_CREDENTIALS:', parseError);
        console.log('Falling back to default GCS authentication');
      }
    } else {
      console.log('No explicit credentials found, using default GCS authentication');
    }
    
    const storage = new Storage(storageOptions);
    const bucketName = 'thermopac_storage';
    const bucket = storage.bucket(bucketName);
    
    console.log('GCS client created successfully with bucket:', bucketName);
    
    // Test bucket connectivity first
    try {
      const [bucketExists] = await bucket.exists();
      console.log('Bucket exists check:', bucketExists);
      
      if (!bucketExists) {
        throw new Error(`Bucket ${bucketName} does not exist or is not accessible`);
      }
    } catch (bucketError: any) {
      console.error('Bucket connectivity error:', bucketError);
      throw new Error(`Cannot access bucket ${bucketName}: ${bucketError.message}`);
    }
    
    // Get project details and material identification ID from database
    const { sql } = await import('drizzle-orm');
    const { db } = await import('../db');
    
    const queryResult = await db.execute(sql`
      SELECT material_identification_id, project_number 
      FROM material_identification 
      WHERE id = ${parseInt(materialIdentificationId)}
    `) as any;
    
    if (!queryResult.rows || queryResult.rows.length === 0) {
      throw new Error(`Material Identification record with ID ${materialIdentificationId} not found`);
    }
    
    const miId = queryResult.rows[0].material_identification_id;
    const projectNumber = queryResult.rows[0].project_number || 'UNKNOWN';
    
    // Get document type from request body
    const documentType = req.body.documentType || 'inspection_report';
    
    // Map document type codes to proper display names
    const documentTypeMap: {[key: string]: string} = {
      'general': 'General_Document',
      'mill_test_certificate': 'Mill_Test_Certificate',
      'inspection_report': 'Inspection_Report',
      'material_certificate': 'Material_Certificate',
      'test_report': 'Test_Report',
      'technical_datasheet': 'Technical_Datasheet',
      'other': 'Other_Document'
    };
    
    const documentTypeName = documentTypeMap[documentType] || 'Inspection_Report';
    const fileExtension = req.file.originalname.split('.').pop() || 'pdf';
    
    // Create hierarchical file path: QMS/Material_Identification/{project_number}/{MI_ID}/{Document_Type}.{extension}
    const filePath = `QMS/Material_Identification/${projectNumber}/${miId}/${documentTypeName}.${fileExtension}`;
    
    console.log('Uploading to path:', filePath);
    console.log('File size:', req.file.size, 'bytes');
    console.log('File type:', req.file.mimetype);
    
    // Upload file with timeout
    const file = bucket.file(filePath);
    
    try {
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
        resumable: false,
        timeout: 30000, // 30 second timeout
      });
      
      console.log('File uploaded successfully to:', filePath);
    } catch (uploadError: any) {
      console.error('File upload error:', uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    
    // Return success response with proper hierarchical path
    return {
      success: true,
      document_file_path: filePath,
      document_url: `https://storage.googleapis.com/${bucketName}/${filePath}`,
      file_name: `${documentTypeName}.${fileExtension}`,
      file_type: req.file.mimetype,
      file_size: req.file.size
    };
    
  } catch (error: any) {
    console.error('=== SIMPLE UPLOAD ERROR DEBUG ===');
    console.error('Error type:', typeof error);
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error stack:', error?.stack);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('=== END SIMPLE UPLOAD ERROR ===');
    
    let errorDetails = {
      message: error?.message || 'Unknown error',
      code: error?.code,
      name: error?.name,
      type: typeof error
    };
    
    return {
      success: false,
      error: `Upload failed: ${errorDetails.message}`,
      errorDetails
    };
  }
};