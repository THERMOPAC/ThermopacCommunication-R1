import { Request } from 'express';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

// Get Google Cloud Storage instance
const getGcsClient = () => {
  // Use the same environment variables as the rest of the application
  const gcsCredentialsJson = process.env.GOOGLE_CLOUD_CREDENTIALS;
  const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';
  
  console.log(`Material ID doc upload - Using bucket: ${bucketName}`);
  
  let storageOptions: any = {};
  
  if (gcsCredentialsJson) {
    try {
      // Parse the JSON credentials string
      console.log(`Material ID doc upload - Found GCS credentials, length: ${gcsCredentialsJson.length}`);
      const credentials = JSON.parse(gcsCredentialsJson);
      
      // Log the project ID for debugging
      console.log(`Material ID doc upload - Using project ID: ${credentials.project_id}`);
      
      storageOptions = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id,
        credentials
      };
    } catch (error) {
      console.error('Error parsing GCS credentials:', error);
      throw new Error('Invalid GCS credentials format');
    }
  } else {
    console.warn('Material ID doc upload - No GCS credentials found in environment variables');
    // Use project ID if available
    if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
      storageOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    }
  }
  
  return {
    storage: new Storage(storageOptions),
    bucketName
  };
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
    
    // Generate a filename based on document type
    const fileExtension = originalFileName.split('.').pop() || 'pdf';
    
    // Clean up document type for use in file name (remove spaces, special chars)
    const cleanDocumentType = documentType.replace(/[^a-zA-Z0-9]/g, '_');
    
    // If there are multiple files of the same type, add a unique identifier
    const uniqueIdentifier = uuidv4().substring(0, 8);
    const fileName = `${cleanDocumentType}_${uniqueIdentifier}.${fileExtension}`;
    
    // Format file path according to required structure: QMS/Material_Identification/{MI ID}/{Document Type}.pdf
    const filePath = `QMS/Material_Identification/${materialIdentificationId}/${fileName}`;
    
    // Create a new blob in the bucket and upload the file data
    const blob = bucket.file(filePath);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: fileType
    });
    
    // Return a promise that resolves when the file is uploaded
    return new Promise((resolve, reject) => {
      blobStream.on('error', (err: any) => {
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
        } catch (err: any) {
          console.error('Error making blob public:', err);
          reject({
            error: 'Failed to make document public',
            success: false
          });
        }
      });
      
      // Write the file data to the stream
      blobStream.end(req.file?.buffer);
    });
  } catch (err: any) {
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
  } catch (err: any) {
    console.error('Error deleting document from GCS:', err);
    return {
      error: 'Failed to delete document from storage',
      success: false
    };
  }
};