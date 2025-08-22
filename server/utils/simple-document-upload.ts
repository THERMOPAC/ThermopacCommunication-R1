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
    // Use default GCS configuration (service account from environment)
    const storage = new Storage();
    const bucketName = 'thermopac_storage';
    const bucket = storage.bucket(bucketName);
    
    console.log('GCS client created successfully');
    
    // Simple file path structure
    const fileExtension = req.file.originalname.split('.').pop() || 'pdf';
    const fileName = `MI-${materialIdentificationId}-${uuidv4()}.${fileExtension}`;
    const filePath = `QMS/Material_Identification/${fileName}`;
    
    console.log('Uploading to path:', filePath);
    
    // Upload file
    const file = bucket.file(filePath);
    
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      },
      resumable: false,
    });
    
    console.log('File uploaded successfully');
    
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