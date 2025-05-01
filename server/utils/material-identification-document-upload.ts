import { Request } from 'express';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

// Get Google Cloud Storage instance
const getGcsClient = () => {
  try {
    // Use the same environment variables as the rest of the application
    const gcsCredentialsJson = process.env.GOOGLE_CLOUD_CREDENTIALS;
    const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';
    
    console.log(`Material ID doc upload - Using bucket: ${bucketName}`);
    
    // Check environment variables
    console.log(`Material ID doc upload - Environment variables check:`, {
      GOOGLE_CLOUD_CREDENTIALS: gcsCredentialsJson ? `Present (length: ${gcsCredentialsJson.length})` : 'Not found',
      GOOGLE_CLOUD_BUCKET: process.env.GOOGLE_CLOUD_BUCKET || 'Not found',
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID || 'Not found',
      NODE_ENV: process.env.NODE_ENV || 'Not set'
    });
    
    let storageOptions: any = {};
    
    if (gcsCredentialsJson) {
      try {
        // Parse the JSON credentials string
        console.log(`Material ID doc upload - Found GCS credentials, parsing...`);
        const credentials = JSON.parse(gcsCredentialsJson);
        
        // Validate credentials
        const validationResults = {
          hasType: Boolean(credentials.type),
          hasProjectId: Boolean(credentials.project_id),
          hasClientEmail: Boolean(credentials.client_email),
          hasPrivateKey: Boolean(credentials.private_key)
        };
        
        console.log(`Material ID doc upload - Credentials validation:`, validationResults);
        
        if (!validationResults.hasType || credentials.type !== 'service_account') {
          console.warn(`Material ID doc upload - Warning: Invalid credential type: ${credentials.type || 'missing'}`);
        }
        
        if (!validationResults.hasProjectId) {
          console.warn('Material ID doc upload - Warning: Credentials missing project_id');
        }
        
        if (!validationResults.hasClientEmail) {
          console.error('Material ID doc upload - Error: Credentials missing client_email');
        }
        
        if (!validationResults.hasPrivateKey) {
          console.error('Material ID doc upload - Error: Credentials missing private_key');
        }
        
        // Log the project ID for debugging
        console.log(`Material ID doc upload - Using project ID: ${credentials.project_id}`);
        console.log(`Material ID doc upload - Using service account: ${credentials.client_email}`);
        
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
    
    const storage = new Storage(storageOptions);
    console.log('Material ID doc upload - Successfully created Storage client');
    
    return {
      storage,
      bucketName
    };
  } catch (error: any) {
    console.error('Error creating GCS client:', error);
    throw new Error(`Failed to create GCS client: ${error?.message || 'Unknown error'}`);
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
    
    // Generate a filename based on document type
    const fileExtension = originalFileName.split('.').pop() || 'pdf';
    
    // Clean up document type for use in file name (remove spaces, special chars)
    const cleanDocumentType = documentType.replace(/[^a-zA-Z0-9]/g, '_');
    
    // If there are multiple files of the same type, add a unique identifier
    const uniqueIdentifier = uuidv4().substring(0, 8);
    const fileName = `${cleanDocumentType}_${uniqueIdentifier}.${fileExtension}`;
    console.log(`uploadMaterialIdentificationDocument: Generated filename: ${fileName}`);
    
    // Format file path according to required structure: QMS/Material_Identification/{MI ID}/{Document Type}.pdf
    const filePath = `QMS/Material_Identification/${materialIdentificationId}/${fileName}`;
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