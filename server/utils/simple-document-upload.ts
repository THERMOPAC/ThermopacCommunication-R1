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
    
    // Simple file path structure
    const fileExtension = req.file.originalname.split('.').pop() || 'pdf';
    const fileName = `MI-${materialIdentificationId}-${uuidv4()}.${fileExtension}`;
    const filePath = `QMS/Material_Identification/${fileName}`;
    
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
    
    // Return basic success response
    return {
      success: true,
      document_file_path: filePath,
      document_url: `https://storage.googleapis.com/${bucketName}/${filePath}`,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
      file_size: req.file.size
    };
    
  } catch (error: any) {
    console.error('=== SIMPLE UPLOAD ERROR ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('=== END SIMPLE UPLOAD ERROR ===');
    
    return {
      success: false,
      error: `Upload failed: ${error.message || 'Unknown error'}`
    };
  }
};