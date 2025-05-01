import { Request } from 'express';
import { getGcsClient } from '../gcs';
import { v4 as uuidv4 } from 'uuid';

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
    return {
      error: 'No file was uploaded',
      success: false
    };
  }
  
  try {
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
    
    // Generate a unique filename
    const fileExtension = originalFileName.split('.').pop() || 'pdf';
    const uniqueIdentifier = uuidv4().substring(0, 8);
    const fileName = `MI_${materialIdentificationId}_${documentType}_${uniqueIdentifier}.${fileExtension}`;
    
    // Format file path - store in QMS/Material_Identification directory
    const filePath = `QMS/Material_Identification/${fileName}`;
    
    // Create a new blob in the bucket and upload the file data
    const blob = bucket.file(filePath);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: fileType
    });
    
    // Return a promise that resolves when the file is uploaded
    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => {
        console.error('Error uploading Material Identification document:', err);
        reject({
          error: 'Failed to upload Material Identification document',
          success: false
        });
      });
      
      blobStream.on('finish', async () => {
        // Make the file public and get the URL
        try {
          await blob.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
          
          resolve({
            success: true,
            document_file_path: filePath,
            document_url: publicUrl,
            file_name: originalFileName,
            file_type: fileType,
            file_size: fileSize
          });
        } catch (err) {
          console.error('Error making blob public:', err);
          reject({
            error: 'Failed to make document public',
            success: false
          });
        }
      });
      
      // Write the file data to the stream
      blobStream.end(req.file.buffer);
    });
  } catch (err) {
    console.error('Error in upload process:', err);
    return {
      error: 'Failed to process document upload',
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
  } catch (err) {
    console.error('Error deleting document from GCS:', err);
    return {
      error: 'Failed to delete document from storage',
      success: false
    };
  }
};