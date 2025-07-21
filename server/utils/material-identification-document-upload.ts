import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { materialIdentification } from '../../shared/schema';
import { pool } from '../db';
import storage from './storage-config';

// Helper function to get GCS client
const getGcsClient = () => {
  try {
    const bucket = storage.bucket();
    const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';
    return { storage, bucketName };
  } catch (error) {
    console.error('Error getting GCS client:', error);
    throw new Error('Failed to get GCS client');
  }
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
    console.log('File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      encoding: req.file.encoding,
      buffer: req.file.buffer ? `${req.file.buffer.length} bytes` : 'No buffer'
    });
    
    // Get GCS client
    console.log('uploadMaterialIdentificationDocument: Getting GCS client');
    const { storage, bucketName } = getGcsClient();
    console.log(`uploadMaterialIdentificationDocument: Using bucket: ${bucketName}`);
    const bucket = storage.bucket(bucketName);
    
    // Get Material Identification ID from request body
    const materialIdentificationId = req.body.materialIdentificationId;
    console.log(`uploadMaterialIdentificationDocument: Material ID: ${materialIdentificationId}`);
    
    if (!materialIdentificationId) {
      console.error('uploadMaterialIdentificationDocument: Missing Material ID');
      return {
        error: 'Material Identification ID is required for document upload',
        success: false
      };
    }
    
    // Get document type from request body
    const documentType = req.body.documentType || 'general';
    console.log(`uploadMaterialIdentificationDocument: Document Type: ${documentType}`);
    
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
    
    // Format file path according to required structure: QMS/Material_Identification/{MI ID}/{Document Type}.pdf
    // Where {MI ID} is the full material_identification_id (e.g., MI-2025-3) and {Document Type} is the display name
    
    // First, we need to get the full material_identification_id from the database
    const db = drizzle(pool);
    
    // Get the full material_identification_id and project_number from the database
    const result = await db.query.materialIdentification.findFirst({
      where: eq(materialIdentification.id, parseInt(materialIdentificationId))
    });
    
    if (!result) {
      throw new Error(`Material Identification record with ID ${materialIdentificationId} not found`);
    }
    
    const miId = result.material_identification_id;
    const projectNumber = result.project_number || 'UNKNOWN';
    console.log(`uploadMaterialIdentificationDocument: Using Material Identification ID: ${miId}`);
    console.log(`uploadMaterialIdentificationDocument: Using Project Number: ${projectNumber}`);

    // Prevent upload if project code is UNKNOWN
    if (projectNumber === 'UNKNOWN') {
      console.error('uploadMaterialIdentificationDocument: Project number is UNKNOWN, cannot upload document');
      return {
        error: 'Cannot upload document: Project number is not available. Please ensure the material identification record has a valid project number assigned.',
        success: false
      };
    }
    
    // Format: QMS/Material_Identification/{projectNumber}/{MI ID}/{Document Type}.{extension}
    const filePath = `QMS/Material_Identification/${projectNumber}/${miId}/${documentTypeName}.${fileExtension}`;
    console.log(`uploadMaterialIdentificationDocument: File path: ${filePath}`);
    
    // Create a new blob in the bucket and upload the file data
    console.log('uploadMaterialIdentificationDocument: Creating file in bucket');
    const blob = bucket.file(filePath);
    
    console.log('uploadMaterialIdentificationDocument: Creating write stream');
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: fileType
    });
    
    // Return a promise that resolves when the file is uploaded
    console.log('uploadMaterialIdentificationDocument: Setting up upload promise');
    return new Promise((resolve, reject) => {
      blobStream.on('error', (err: any) => {
        console.error('Error uploading Material Identification document:', err);
        console.error('Error details:', {
          code: err.code,
          message: err.message,
          stack: err.stack,
        });
        reject({
          error: `Failed to upload document: ${err.message || 'Unknown error'}`,
          success: false
        });
      });
      
      blobStream.on('finish', async () => {
        console.log('uploadMaterialIdentificationDocument: Upload stream finished');
        try {
          // For uniform bucket-level access, we don't need to make individual files public
          // Instead we'll generate a public URL based on the bucket's configurations
          
          // Generate a signed URL for temporary access if bucket is not public
          const [signedUrl] = await blob.getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days expiration
          });
          
          // Also store the permanent storage URL (this will work if bucket has public access)
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
          
          console.log(`uploadMaterialIdentificationDocument: Signed URL created with 7-day expiration`);
          console.log(`uploadMaterialIdentificationDocument: Storage URL: ${publicUrl}`);
          
          resolve({
            success: true,
            document_file_path: filePath,
            document_url: signedUrl, // Use signed URL which will work regardless of bucket permissions
            file_name: originalFileName,
            file_type: fileType,
            file_size: fileSize
          });
        } catch (err: any) {
          console.error('Error creating file access URL:', err);
          console.error('Error details:', {
            code: err.code,
            message: err.message,
            stack: err.stack,
          });
          
          // Even if getting a signed URL fails, we'll still return success since the file was uploaded
          // Just use the standard storage URL instead
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
          console.log(`uploadMaterialIdentificationDocument: Fallback to storage URL: ${publicUrl}`);
          
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
      
      console.log('uploadMaterialIdentificationDocument: Writing buffer to stream');
      if (!req.file?.buffer) {
        console.error('uploadMaterialIdentificationDocument: No buffer in file object');
        reject({
          error: 'File buffer is missing',
          success: false
        });
        return;
      }
      
      // Write the file data to the stream
      blobStream.end(req.file.buffer);
      console.log('uploadMaterialIdentificationDocument: Buffer written to stream');
    });
  } catch (err: any) {
    console.error('Error in upload process:', err);
    console.error('Error details:', {
      code: err.code,
      message: err.message,
      stack: err.stack,
    });
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