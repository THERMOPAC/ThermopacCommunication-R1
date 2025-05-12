import { Request } from 'express';
import { Storage } from '@google-cloud/storage';
import storage, { bucketName } from './storage-config';
import path from 'path';
import { Pool } from '@neondatabase/serverless';

// Export the pool instance to reuse between functions
// Using a separate connection just for the document upload logic to avoid 
// transaction conflicts with the main db connection
export const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });

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
  // Runtime check and type assertion - if this fails, we'll return early
  if (!req.file) {
    console.error('uploadInspectionDocument: No file was uploaded');
    return {
      error: 'No file was uploaded',
      success: false
    };
  }
  
  // We'll use this typed reference for the rest of the function
  const uploadedFile = req.file;
  
  try {
    console.log('uploadInspectionDocument: Starting upload process');
    console.log('File details:', {
      originalname: uploadedFile.originalname,
      mimetype: uploadedFile.mimetype,
      size: uploadedFile.size,
      encoding: uploadedFile.encoding,
      buffer: uploadedFile.buffer ? `${uploadedFile.buffer.length} bytes` : 'No buffer'
    });
    
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
    const fileExtension = path.extname(uploadedFile.originalname).substring(1) || 'pdf';
    
    // Format: QMS/Inspections_Records/{Inspection Order No}/{Tab Name}/{array id}-{timestamp}.{extension}
    // Fix tab name to match directory structure expected by Final Dossier
    let formattedTabName = tabName;
    
    // Map tab names to folder names
    if (tabName === 'NonConformance') {
      formattedTabName = 'NCR';
    } else if (tabName === 'Visual') {
      formattedTabName = 'Visual'; // Update to match observed file path structure
    }
    
    // Use consistent naming without timestamps to enable overwriting existing files
    // This allows updates to documents without creating multiple versions
    const filePath = `QMS/Inspections_Records/${inspectionOrderNumber}/${formattedTabName}/${recordId}.${fileExtension}`;
    
    console.log(`uploadInspectionDocument: File path: ${filePath} (original tab name: ${tabName})`);
    
    // Get the storage bucket
    const bucket = storage.bucket(bucketName);
    
    // Create a new blob in the bucket and upload the file data
    const file = bucket.file(filePath);
    
    // First check if file exists, and if so, get its generation
    let generationMatchValue = 0; // Default to 0 when file doesn't exist
    
    try {
      // Try to get file metadata to see if it exists
      const [metadata] = await file.getMetadata();
      if (metadata && metadata.generation) {
        console.log(`File already exists at ${filePath} with generation ${metadata.generation}`);
        // Use the current generation for precise overwrite
        generationMatchValue = Number(metadata.generation);
      }
    } catch (err) {
      // File doesn't exist, which is fine - we'll create it
      console.log(`File doesn't exist yet at ${filePath}, will create it`);
    }
    
    // Create a write stream to upload the file
    // No precondition for overwrite - we'll just upload directly
    const stream = file.createWriteStream({
      resumable: false,
      contentType: uploadedFile.mimetype,
      metadata: {
        contentType: uploadedFile.mimetype,
        contentDisposition: `inline; filename="${uploadedFile.originalname}"`,
      }
    });
    
    // Handle errors during upload
    stream.on('error', (err) => {
      console.error('Error uploading file to GCS:', err);
      // Don't throw error here as it will crash the server - we'll handle it through the promise
    });
    
    // Create a promise to handle the upload process
    return new Promise((resolve, reject) => {
      // When the upload is complete
      stream.on('finish', async () => {
        try {
          // Create a signed URL for the file with 7-day expiration
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          });
          
          console.log(`File uploaded successfully to GCS: ${filePath}`);
          console.log(`Signed URL: ${signedUrl}`);
          
          resolve({
            success: true,
            document_file_path: filePath,
            document_url: signedUrl,
            file_name: uploadedFile.originalname,
            file_type: uploadedFile.mimetype,
            file_size: uploadedFile.size
          });
        } catch (err) {
          console.error('Error generating signed URL:', err);
          reject({
            success: false,
            error: 'Failed to generate signed URL for uploaded file'
          });
        }
      });
      
      // Handle upload errors
      stream.on('error', (err) => {
        console.error('Error in upload stream:', err);
        reject({ 
          success: false, 
          error: `Upload stream error: ${err.message}` 
        });
      });
      
      // Write the file buffer to the stream and end it
      if (uploadedFile.buffer) {
        stream.end(uploadedFile.buffer);
      } else {
        stream.end();
        reject({
          success: false,
          error: 'No file buffer available for upload'
        });
      }
    });
  } catch (error) {
    console.error('Error in uploadInspectionDocument:', error);
    return {
      error: error instanceof Error ? error.message : 'An unknown error occurred during upload',
      success: false
    };
  }
};