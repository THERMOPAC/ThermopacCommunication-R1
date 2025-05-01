import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { Storage } from '@google-cloud/storage';

// Helper function to get GCS client
const getGcsClient = () => {
  const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';
  let storageOptions: any = {};

  // Check if we have explicit credentials in the environment
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    // Parse the credentials from the environment variable
    const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
    
    storageOptions = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
      credentials
    };
  }
  
  const storage = new Storage(storageOptions);
  return { storage, bucketName };
};

/**
 * Upload a Material Identification document to Google Cloud Storage
 * @param req Express request object with file attached
 * @returns Object with upload result
 */
export const uploadMaterialIdentificationDocument = async (req: Request): Promise<{
  success: boolean;
  document_file_path?: string;
  document_url?: string;
  error?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
}> => {
  if (!req.file) {
    console.error('uploadMaterialIdentificationDocument: No file was uploaded');
    return {
      error: 'No file was uploaded',
      success: false
    };
  }
  
  try {
    console.log('uploadMaterialIdentificationDocument: Starting upload process');
    
    // Get GCS client
    const { storage, bucketName } = getGcsClient();
    const bucket = storage.bucket(bucketName);
    
    // Get Material Identification ID from request body
    const materialIdentificationId = req.body.materialIdentificationId;
    
    if (!materialIdentificationId) {
      return {
        error: 'Material Identification ID is required for document upload',
        success: false
      };
    }
    
    // Get document type from request body
    const documentType = req.body.documentType || 'general';
    
    // Get file details
    const originalFileName = req.file.originalname;
    const fileType = req.file.mimetype;
    const fileSize = req.file.size;
    
    // Get the file extension from the original filename
    const fileExtension = originalFileName.split('.').pop() || 'pdf';
    
    // Map document type codes to proper display names
    const documentTypeMap: {[key: string]: string} = {
      'general': 'General Document',
      'mill_test_certificate': 'Mill Test Certificate',
      'inspection_report': 'Inspection Report',
      'material_certificate': 'Material Certificate',
      'test_report': 'Test Report',
      'technical_datasheet': 'Technical Datasheet',
      'other': 'Other Document'
    };
    
    // Use the display name from the map, or use the documentType as-is if not found in the map
    const documentTypeName = documentTypeMap[documentType] || documentType;
    
    // Get the full material_identification_id from the database using a direct SQL query
    // since we're having issues with the Drizzle query builder
    const queryResult = await pool.query(
      'SELECT material_identification_id FROM material_identification WHERE id = $1',
      [parseInt(materialIdentificationId)]
    );
    
    if (!queryResult.rows || queryResult.rows.length === 0) {
      throw new Error(`Material Identification record with ID ${materialIdentificationId} not found`);
    }
    
    const miId = queryResult.rows[0].material_identification_id;
    console.log(`uploadMaterialIdentificationDocument: Using Material Identification ID: ${miId}`);
    
    // Format: QMS/Material_Identification/{MI ID}/{Document Type}.{extension}
    const filePath = `QMS/Material_Identification/${miId}/${documentTypeName}.${fileExtension}`;
    console.log(`uploadMaterialIdentificationDocument: File path: ${filePath}`);
    
    // Create a new blob in the bucket and upload the file data
    const blob = bucket.file(filePath);
    
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: fileType
    });
    
    // Return a promise that resolves when the file is uploaded
    return new Promise((resolve, reject) => {
      blobStream.on('error', (err: any) => {
        reject({
          error: `Failed to upload document: ${err.message || 'Unknown error'}`,
          success: false
        });
      });
      
      blobStream.on('finish', async () => {
        try {
          // Generate a signed URL for temporary access
          const [signedUrl] = await blob.getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days expiration
          });
          
          // Also store the permanent storage URL
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
          
          resolve({
            success: true,
            document_file_path: filePath,
            document_url: signedUrl,
            file_name: originalFileName,
            file_type: fileType,
            file_size: fileSize
          });
        } catch (err: any) {
          // Even if getting a signed URL fails, we'll still return success since the file was uploaded
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
          
          resolve({
            success: true,
            document_file_path: filePath,
            document_url: publicUrl,
            file_name: originalFileName,
            file_type: fileType,
            file_size: fileSize
          });
        }
      });
      
      if (!req.file?.buffer) {
        reject({
          error: 'File buffer is missing',
          success: false
        });
        return;
      }
      
      // Write the file data to the stream
      blobStream.end(req.file.buffer);
    });
  } catch (err: any) {
    console.error('Error in upload process:', err);
    return {
      error: `Failed to process document upload: ${err.message || 'Unknown error'}`,
      success: false
    };
  }
};

/**
 * Delete a Material Identification document from Google Cloud Storage
 * @param filePath File path in GCS to delete
 * @returns Object with deletion result
 */
export const deleteMaterialIdentificationDocument = async (filePath: string): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const { storage, bucketName } = getGcsClient();
    const bucket = storage.bucket(bucketName);
    
    // Get the file from GCS
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return {
        error: 'Document file does not exist',
        success: false
      };
    }
    
    // Delete the file
    await file.delete();
    
    return {
      success: true
    };
  } catch (err: any) {
    console.error('Error deleting document from GCS:', err);
    return {
      error: 'Failed to delete document from storage',
      success: false
    };
  }
};