import { Storage } from '@google-cloud/storage';
import { format } from 'date-fns';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import storage, { bucketName } from './storage-config';

// Initialize Google Cloud Storage bucket
const bucket = storage.bucket(bucketName);

// Base path for WPS/PQR documents in GCS
const WPS_PQR_BASE_PATH = 'QMS/WPS_PQR';

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
  wpsId: string
): Promise<{ success: boolean; filePath?: string; url?: string; error?: string }> {
  try {
    // Create a standardized filename based on WPS ID
    const fileExtension = path.extname(originalFilename).toLowerCase();
    const targetExtension = fileExtension || '.pdf'; // Default to .pdf if no extension
    const sanitizedWpsId = wpsId.replace(/[^a-zA-Z0-9-]/g, '_');
    const fileName = `${sanitizedWpsId}${targetExtension}`;
    
    // Create the full path in GCS
    const filePath = `${WPS_PQR_BASE_PATH}/${fileName}`;
    
    // Create a file object in the bucket
    const file = bucket.file(filePath);
    
    // Upload the buffer to GCS
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          originalName: originalFilename,
          uploadDate: format(new Date(), 'yyyy-MM-dd'),
          wpsId: wpsId
        }
      }
    });
    
    console.log(`WPS document uploaded to GCS: ${filePath}`);
    
    // Generate a signed URL for immediate access
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // URL valid for 7 days
    });
    
    return {
      success: true,
      filePath,
      url
    };
  } catch (error) {
    console.error('Error uploading WPS/PQR document to GCS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred during upload'
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
    // Create a reference to the file
    const file = bucket.file(filePath);
    
    // Check if the file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`WPS/PQR document file not found in GCS: ${filePath}`);
      return null;
    }
    
    // Generate a signed URL valid for 7 days
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    
    return url;
  } catch (error) {
    console.error(`Error generating URL for WPS/PQR document: ${filePath}`, error);
    return null;
  }
}