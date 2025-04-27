import { Storage } from '@google-cloud/storage';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import storage from './storage-config';
import { bucketName } from './storage-config';
import fs from 'fs';

// Initialize Google Cloud Storage client
const gcStorage = storage;
const bucket = gcStorage.bucket(bucketName);

/**
 * Uploads a WPS/PQR document to Google Cloud Storage
 * @param fileBuffer Buffer containing the file data
 * @param originalFilename Original filename from the client
 * @param mimeType MIME type of the uploaded file
 * @param wpsId The WPS ID to use for the filename
 * @returns Object with success status, file path, and URL
 */
export async function uploadWpsPqrDocument(
  fileBuffer: Buffer,
  originalFilename: string,
  mimeType: string,
  wpsId: string
) {
  try {
    // Determine file extension
    const fileExt = path.extname(originalFilename).toLowerCase();
    const validExt = ['.pdf', '.jpg', '.jpeg', '.png'];
    
    // Set a default extension if the original extension is not valid
    const extension = validExt.includes(fileExt) ? fileExt : '.pdf';
    
    // Create filename using the WPS ID (ensure consistency for updates)
    const filename = `${wpsId}${extension}`;
    
    // Define the target path in GCS - inside QMS folder and WPS_PQR subfolder
    const storagePath = `QMS/WPS_PQR/${filename}`;
    
    const file = bucket.file(storagePath);
    const fileStream = file.createWriteStream({
      metadata: {
        contentType: mimeType,
        metadata: {
          originalFilename,
          wpsId
        }
      }
    });
    
    const uploadPromise = new Promise<void>((resolve, reject) => {
      fileStream.on('error', (err: Error) => {
        console.error('Upload stream error:', err);
        reject(err);
      });
      
      fileStream.on('finish', () => {
        console.log(`File ${filename} uploaded to ${storagePath}`);
        resolve();
      });
      
      fileStream.end(fileBuffer);
    });
    
    await uploadPromise;
    
    // Generate signed URL for immediate access
    const signedUrlOptions = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes from now
    };
    
    const [url] = await file.getSignedUrl(signedUrlOptions);
    
    return {
      success: true,
      filePath: storagePath,
      url
    };
  } catch (error) {
    console.error('Error uploading WPS/PQR document:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during upload',
    };
  }
}

/**
 * Gets a signed URL for a WPS/PQR document stored in Google Cloud Storage
 * @param filePath Path to the file in GCS
 * @returns Signed URL string or null if there was an error
 */
export async function getWpsPqrDocumentUrl(filePath: string): Promise<string | null> {
  try {
    // Handle local vs. GCS files
    if (!filePath.startsWith('QMS/')) {
      // For local files, we'll return a URL to the API endpoint
      // The actual file serving will be handled by the endpoint
      if (fs.existsSync(filePath)) {
        return `/api/quality/wps-document/${path.basename(filePath)}`;
      }
      return null;
    }
    
    // For GCS files, generate a signed URL
    const file = bucket.file(filePath);
    
    // Check if the file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`File ${filePath} not found in GCS`);
      return null;
    }
    
    const signedUrlOptions = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes from now
    };
    
    const [url] = await file.getSignedUrl(signedUrlOptions);
    return url;
  } catch (error) {
    console.error('Error getting WPS/PQR document URL:', error);
    return null;
  }
}