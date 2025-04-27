import { storage, bucketName } from './storage-config';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Uploads a WPS or PQR document to Google Cloud Storage
 * @param buffer - The file buffer to upload
 * @param originalFilename - The original filename
 * @param mimeType - The MIME type of the file
 * @param wpsId - The WPS ID for the document (e.g., WPS-001)
 * @returns Object containing upload result, file path, and download URL
 */
export async function uploadWpsPqrDocument(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  wpsId: string = ''
): Promise<{
  success: boolean;
  filePath?: string;
  url?: string;
  error?: any;
}> {
  try {
    // Use WPS ID for filename if provided, otherwise use a UUID
    const fileExtension = '.pdf'; // Always use .pdf extension as required
    const filename = wpsId ? 
      `${wpsId}.pdf` : 
      `${uuidv4()}${fileExtension}`;
    
    // Set the GCS path in the QMS/WPS_PQR directory
    const gcsPath = `QMS/WPS_PQR/${filename}`;
    
    console.log(`Uploading WPS/PQR document to: ${gcsPath}`);
    
    // Get a reference to the file in the bucket
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(gcsPath);
    
    // Upload the file to GCS
    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });
    
    // Generate a signed URL for immediate access
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });
    
    console.log('WPS/PQR document uploaded successfully to GCS');
    
    return {
      success: true,
      filePath: gcsPath,
      url: signedUrl
    };
  } catch (error) {
    console.error('Error uploading WPS/PQR document to GCS:', error);
    return {
      success: false,
      error: error
    };
  }
}

/**
 * Generates a publicly accessible URL for a WPS/PQR document
 * @param filePath - The GCS file path
 * @returns The signed URL for the file
 */
export async function getWpsPqrDocumentUrl(filePath: string): Promise<string | null> {
  try {
    if (!filePath) return null;
    
    // Check if it's already a GCS path starting with QMS/
    if (!filePath.startsWith('QMS/')) {
      // It might be a legacy path
      console.log('Document path does not start with QMS/, might be a legacy path');
      return null;
    }
    
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`WPS/PQR document ${filePath} does not exist in GCS`);
      return null;
    }
    
    // Generate a signed URL
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
    
    return signedUrl;
  } catch (error) {
    console.error('Error generating WPS/PQR document URL:', error);
    return null;
  }
}