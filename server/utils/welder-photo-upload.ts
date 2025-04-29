import { Storage } from '@google-cloud/storage';
import storage, { bucketName } from './storage-config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Uploads a welder photo to Google Cloud Storage
 * @param buffer - The file buffer to upload
 * @param originalFilename - The original filename
 * @param mimeType - The MIME type of the file
 * @param welderId - The welder ID for the photo (e.g., W-001)
 * @returns Object containing upload result, file path, and download URL
 */
export async function uploadWelderPhoto(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  welderId: string = ''
): Promise<{
  success: boolean;
  filePath?: string;
  url?: string;
  error?: any;
}> {
  try {
    // Ensure we have a welder ID
    if (!welderId || welderId.trim() === '') {
      console.error('Welder ID is required for photo upload');
      return {
        success: false,
        error: 'Welder ID is required for photo upload'
      };
    }
    
    // Always use .pdf extension as requested in the new path format
    // Set the GCS path in the QMS/WELDERS/{Welder ID} directory
    const gcsPath = `QMS/WELDERS/${welderId}/${welderId}.pdf`;
    
    console.log(`Uploading welder photo to: ${gcsPath}`);
    
    // Get a reference to the file in the bucket
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(gcsPath);
    
    // Always set content type to PDF for the new path structure
    await file.save(buffer, {
      contentType: 'application/pdf',
      metadata: {
        contentType: 'application/pdf',
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });
    
    // Generate a signed URL for immediate access
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });
    
    console.log('Welder photo uploaded successfully to GCS');
    
    return {
      success: true,
      filePath: gcsPath,
      url: signedUrl
    };
  } catch (error) {
    console.error('Error uploading welder photo to GCS:', error);
    return {
      success: false,
      error: error
    };
  }
}

/**
 * Generates a publicly accessible URL for a welder photo
 * @param filePath - The GCS file path
 * @returns The signed URL for the file
 */
export async function getWelderPhotoUrl(filePath: string): Promise<string | null> {
  try {
    if (!filePath) return null;
    
    // Check if it's already a GCS path starting with QMS/
    if (!filePath.startsWith('QMS/')) {
      // It might be a legacy path
      console.log('Welder photo path does not start with QMS/, might be a legacy path');
      return null;
    }
    
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`Welder photo file ${filePath} does not exist in GCS`);
      return null;
    }
    
    // Generate a signed URL
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
    
    return signedUrl;
  } catch (error) {
    console.error('Error generating welder photo URL:', error);
    return null;
  }
}