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
    
    // Get the actual welder ID from the database - could be numeric or W-xxx format
    // For cloud storage, use either the format W-xxx if available, or construct it
    let welderCodeForPath: string;
    
    // Check if the provided welderId is numeric (database ID) or already in W-xxx format
    if (/^W-\d+$/.test(welderId)) {
      // Already in the correct format like W-001
      welderCodeForPath = welderId;
      console.log(`Using provided welder code format: ${welderCodeForPath}`);
    } else {
      // It's likely a numeric database ID, so convert to W-xxx format
      try {
        const numericId = parseInt(welderId);
        if (!isNaN(numericId)) {
          // Format as W-001, W-002, etc.
          welderCodeForPath = `W-${numericId.toString().padStart(3, '0')}`;
          console.log(`Converted numeric ID ${welderId} to welder code: ${welderCodeForPath}`);
        } else {
          // If conversion fails, use the provided ID as-is
          welderCodeForPath = welderId;
          console.warn(`Unable to parse welder ID as number: ${welderId}, using as-is`);
        }
      } catch (error) {
        welderCodeForPath = welderId;
        console.warn(`Error converting welder ID: ${welderId}, using as-is`, error);
      }
    }
    
    // Get file extension from the original filename or use jpg as default
    const originalExt = originalFilename.split('.').pop()?.toLowerCase() || 'jpg';
    
    // Determine content type based on the file extension
    let contentType = mimeType;
    if (!contentType || contentType === 'application/octet-stream') {
      // Default content types based on common extensions
      const contentTypeMap: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf'
      };
      contentType = contentTypeMap[originalExt] || 'image/jpeg';
    }
    
    // Set the GCS path in the QMS/WELDERS/{Welder ID} directory
    const gcsPath = `QMS/WELDERS/${welderCodeForPath}/${welderCodeForPath}.${originalExt}`;
    
    console.log(`Uploading welder photo to: ${gcsPath} with content type: ${contentType}`);
    
    // Get a reference to the file in the bucket
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(gcsPath);
    
    // Save with proper content type
    await file.save(buffer, {
      contentType: contentType,
      metadata: {
        contentType: contentType,
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
    
    console.log(`Attempting to retrieve welder photo from GCS path: ${filePath}`);
    
    const bucket = storage.bucket(bucketName);
    
    // First try using the exact path provided
    let file = bucket.file(filePath);
    
    // Check if file exists
    let [exists] = await file.exists();
    
    // If not found and it's in the expected directory format
    if (!exists && filePath.includes('/')) {
      console.log(`File not found at exact path: ${filePath}, trying to find in directory`);
      
      // Extract the welderId and try different extensions
      const pathParts = filePath.split('/');
      if (pathParts.length >= 3) {
        const welderId = pathParts[2]; // Assuming format QMS/WELDERS/{welderId}/...
        
        // Try common extensions: jpg, jpeg, png, pdf
        const extensions = ['jpg', 'jpeg', 'png', 'pdf'];
        for (const ext of extensions) {
          const alternatePath = `QMS/WELDERS/${welderId}/${welderId}.${ext}`;
          
          if (alternatePath !== filePath) { // Skip if it's the same path we already tried
            console.log(`Trying alternate path: ${alternatePath}`);
            
            file = bucket.file(alternatePath);
            [exists] = await file.exists();
            
            if (exists) {
              console.log(`Found file at alternate path: ${alternatePath}`);
              // Update the file path in the database?
              // This would require a DB call, possibly add this as a future enhancement
              break;
            }
          }
        }
      }
    }
    
    if (!exists) {
      console.error(`Welder photo file ${filePath} does not exist in GCS after trying alternatives`);
      return null;
    }
    
    // Generate a signed URL
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
    
    console.log(`Successfully generated signed URL for ${filePath}`);
    return signedUrl;
  } catch (error) {
    console.error('Error generating welder photo URL:', error);
    return null;
  }
}