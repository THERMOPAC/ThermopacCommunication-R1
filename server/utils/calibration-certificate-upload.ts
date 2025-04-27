import { Storage } from '@google-cloud/storage';
import storage, { bucketName } from './storage-config';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

/**
 * Uploads a calibration certificate to Google Cloud Storage
 * @param buffer - The file buffer to upload
 * @param originalFilename - The original filename
 * @param mimeType - The MIME type of the file
 * @returns Object containing upload result, file path, and download URL
 */
export async function uploadCalibrationCertificate(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<{
  success: boolean;
  filePath?: string;
  url?: string;
  error?: any;
}> {
  try {
    // Generate a unique filename
    const fileExtension = path.extname(originalFilename);
    const uniqueFilename = `${uuidv4()}${fileExtension}`;
    
    // Set the GCS path in the QMS/Instrument directory
    const gcsPath = `QMS/Instrument/${uniqueFilename}`;
    
    console.log(`Uploading calibration certificate to: ${gcsPath}`);
    
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
    
    console.log('Calibration certificate uploaded successfully to GCS');
    
    return {
      success: true,
      filePath: gcsPath,
      url: signedUrl
    };
  } catch (error) {
    console.error('Error uploading calibration certificate to GCS:', error);
    return {
      success: false,
      error: error
    };
  }
}

/**
 * Generates a publicly accessible URL for a calibration certificate
 * @param filePath - The GCS file path
 * @returns The signed URL for the file
 */
export async function getCertificateUrl(filePath: string): Promise<string | null> {
  try {
    if (!filePath) return null;
    
    // Check if it's already a GCS path starting with QMS/
    if (!filePath.startsWith('QMS/')) {
      // It might be a legacy path
      console.log('Certificate path does not start with QMS/, might be a legacy path');
      return null;
    }
    
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`Certificate file ${filePath} does not exist in GCS`);
      return null;
    }
    
    // Generate a signed URL
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
    
    return signedUrl;
  } catch (error) {
    console.error('Error generating certificate URL:', error);
    return null;
  }
}