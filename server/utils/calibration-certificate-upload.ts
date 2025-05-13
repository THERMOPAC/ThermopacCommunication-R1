import { Storage } from '@google-cloud/storage';
import storage, { bucketName } from './storage-config';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

/**
 * Uploads a calibration certificate to Google Cloud Storage with a specific focus on ensuring
 * the correct file naming convention is used.
 * 
 * @param buffer - The file buffer to upload
 * @param originalFilename - The original filename (ignored for naming, only used for extension)
 * @param mimeType - The MIME type of the file
 * @param instrumentId - The instrument ID for the certificate (e.g., INST-00001) - This is REQUIRED
 * @returns Object containing upload result, file path, and download URL
 */
export async function uploadCalibrationCertificate(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  instrumentId: string = ''
): Promise<{
  success: boolean;
  filePath?: string;
  url?: string;
  error?: any;
}> {
  try {
    console.log('=== CALIBRATION CERTIFICATE UPLOAD START ===');
    console.log(`Original filename: ${originalFilename}`);
    console.log(`MIME type: ${mimeType}`);
    console.log(`Instrument ID: ${instrumentId ? instrumentId : 'Not provided'}`);
    
    // Validate instrument ID
    if (!instrumentId || instrumentId.trim() === '') {
      console.error('ERROR: No instrument ID provided for calibration certificate filename');
      return {
        success: false,
        error: 'Missing instrument ID for filename'
      };
    }
    
    // Default to PDF extension for calibration certificates
    const fileExtension = '.pdf';
    
    // Generate filename using ONLY the instrument ID
    const filename = `${instrumentId}${fileExtension}`;
    console.log(`Generated filename: ${filename}`);
    
    // Set the GCS path - using QMS/Instrument/ to match existing database entries
    const gcsPath = `QMS/Instrument/${filename}`;
    
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
    let file = bucket.file(filePath);
    
    // Check if file exists
    let [exists] = await file.exists();
    
    // If the file doesn't exist, log detailed error for troubleshooting
    if (!exists) {
      console.log(`Certificate file ${filePath} not found in GCS`);
      // No need to check alternative paths anymore since we're using only QMS/Instrument/
    }
    
    // If doesn't exist, return null
    if (!exists) {
      console.error(`Certificate file not found in GCS at path: ${filePath}`);
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