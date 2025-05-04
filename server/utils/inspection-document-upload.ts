import { Request } from 'express';
import { Storage } from '@google-cloud/storage';
import { gcsStorage } from './gcs-storage';
import { bucketName } from './storage-config';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Upload an Inspection Record document to Google Cloud Storage
 * @param req Express request object with file attached
 * @returns Object with upload result
 */
export const uploadInspectionDocument = async (req: Request): Promise<{
  success: boolean;
  document_file_path?: string;
  document_url?: string;
  error?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
}> => {
  if (!req.file) {
    console.error('uploadInspectionDocument: No file was uploaded');
    return {
      error: 'No file was uploaded',
      success: false
    };
  }
  
  try {
    console.log('uploadInspectionDocument: Starting upload process');
    console.log('File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      encoding: req.file.encoding,
      buffer: req.file.buffer ? `${req.file.buffer.length} bytes` : 'No buffer'
    });
    
    // Get GCS client
    console.log('uploadInspectionDocument: Getting GCS client');
    const storage = gcsStorage;
    console.log(`uploadInspectionDocument: Using bucket: ${bucketName}`);
    const bucket = storage.bucket(bucketName);
    
    // Get required parameters from request body
    const inspectionOrderNumber = req.body.inspectionOrderNumber;
    const tabName = req.body.tabName;
    const recordId = req.body.recordId;
    
    console.log(`uploadInspectionDocument: Inspection Order Number: ${inspectionOrderNumber}`);
    console.log(`uploadInspectionDocument: Tab Name: ${tabName}`);
    console.log(`uploadInspectionDocument: Record ID: ${recordId}`);
    
    if (!inspectionOrderNumber || !tabName || !recordId) {
      return {
        error: 'Missing required parameters: inspectionOrderNumber, tabName, and recordId are required',
        success: false
      };
    }
    
    // Extract file extension from the original file name
    const fileExtension = path.extname(req.file.originalname).substring(1) || 'pdf';
    
    // Format: QMS/Inspections_Records/{Inspection Order No}/{Tab Name}/{array id}.{extension}
    const filePath = `QMS/Inspections_Records/${inspectionOrderNumber}/${tabName}/${recordId}.${fileExtension}`;
    
    console.log(`uploadInspectionDocument: File path: ${filePath}`);
    
    // Create a new blob in the bucket and upload the file data
    const blob = bucket.file(filePath);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype
    });
    
    // Return a promise that resolves when the file is uploaded
    return new Promise((resolve, reject) => {
      blobStream.on('error', (err: any) => {
        console.error('Error uploading inspection document:', err);
        reject({
          error: 'Failed to upload inspection document',
          success: false
        });
      });
      
      blobStream.on('finish', async () => {
        // Create a signed URL for accessing the file
        try {
          const signedUrlConfig = {
            action: 'read' as const,
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          };
          
          const [url] = await blob.getSignedUrl(signedUrlConfig);
          
          console.log(`uploadInspectionDocument: File uploaded successfully to ${filePath}`);
          console.log(`uploadInspectionDocument: Signed URL: ${url}`);
          
          resolve({
            success: true,
            document_file_path: filePath,
            document_url: url,
            file_name: req.file.originalname,
            file_type: req.file.mimetype,
            file_size: req.file.size
          });
        } catch (error) {
          console.error('Error getting signed URL:', error);
          reject({
            error: 'Failed to generate signed URL for uploaded document',
            success: false
          });
        }
      });
      
      // End the stream with the file buffer
      blobStream.end(req.file.buffer);
    });
  } catch (error) {
    console.error('Error in uploadInspectionDocument:', error);
    return {
      error: error instanceof Error ? error.message : 'An unknown error occurred during upload',
      success: false
    };
  }
};