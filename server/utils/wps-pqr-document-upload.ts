import multer from 'multer';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { Request } from 'express';

// Configure multer for file uploads
const storage = multer.memoryStorage();

// Set up multer for WPS/PQR document uploads
export const uploadWpsPqrDocument = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    const allowedFileTypes = ['.pdf'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedFileTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Get Google Cloud Storage instance
const getGcsClient = () => {
  const gcsCredentialsJson = process.env.GCS_CREDENTIALS;
  const bucketName = process.env.GCS_BUCKET || 'thermopac_storage';
  
  let storageOptions = {};
  
  if (gcsCredentialsJson) {
    try {
      // Parse the JSON credentials string
      const credentials = JSON.parse(gcsCredentialsJson);
      storageOptions = { credentials };
    } catch (error) {
      console.error('Error parsing GCS credentials:', error);
      throw new Error('Invalid GCS credentials format');
    }
  }
  
  return {
    storage: new Storage(storageOptions),
    bucketName
  };
};

/**
 * Upload a WPS document to Google Cloud Storage
 * @param req Express request object with file attached
 * @returns Object with upload result
 */
export const uploadWpsDocument = async (req: Request): Promise<{
  success: boolean;
  document_file_path?: string;
  document_url?: string;
  error?: string;
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
    
    // Get WPS ID from request body
    const wpsId = req.body.wpsId;
    if (!wpsId) {
      return {
        error: 'WPS ID is required for document upload',
        success: false
      };
    }
    
    // Format file path - store in QMS/WPS_PQR directory
    const filePath = `QMS/WPS_PQR/${wpsId}.pdf`;
    
    // Create a new blob in the bucket and upload the file data
    const blob = bucket.file(filePath);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: 'application/pdf'
    });
    
    // Return a promise that resolves when the file is uploaded
    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => {
        console.error('Error uploading WPS document:', err);
        reject({
          error: 'Failed to upload WPS document',
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
            document_url: publicUrl
          });
        } catch (err) {
          console.error('Error making WPS document public:', err);
          reject({
            error: 'Failed to make WPS document public',
            success: false
          });
        }
      });
      
      // Send the file buffer to the blob stream
      blobStream.end(req.file.buffer);
    });
  } catch (error) {
    console.error('Error in WPS document upload process:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error during upload',
      success: false
    };
  }
};

/**
 * Upload a combined WPS/PQR document to Google Cloud Storage
 * @param req Express request object with file attached
 * @returns Object with upload result
 */
export const uploadCombinedDocument = async (req: Request): Promise<{
  success: boolean;
  wpsId?: string;
  pqrId?: string;
  combined_document_file_path?: string;
  combined_document_url?: string;
  error?: string;
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
    
    // Get WPS ID and PQR ID from request body
    const wpsId = req.body.wpsId;
    const pqrId = req.body.pqrId;
    
    if (!wpsId || !pqrId) {
      return {
        error: 'Both WPS ID and PQR ID are required for combined document upload',
        success: false
      };
    }
    
    // Format file path - store in QMS/WPS_PQR directory with combined filename
    const filePath = `QMS/WPS_PQR/${wpsId}_${pqrId}_combined.pdf`;
    
    // Create a new blob in the bucket and upload the file data
    const blob = bucket.file(filePath);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: 'application/pdf'
    });
    
    // Return a promise that resolves when the file is uploaded
    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => {
        console.error('Error uploading combined WPS/PQR document:', err);
        reject({
          error: 'Failed to upload combined WPS/PQR document',
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
            wpsId,
            pqrId,
            combined_document_file_path: filePath,
            combined_document_url: publicUrl
          });
        } catch (err) {
          console.error('Error making combined WPS/PQR document public:', err);
          reject({
            error: 'Failed to make combined WPS/PQR document public',
            success: false
          });
        }
      });
      
      // Send the file buffer to the blob stream
      blobStream.end(req.file.buffer);
    });
  } catch (error) {
    console.error('Error in combined WPS/PQR document upload process:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error during upload',
      success: false
    };
  }
};