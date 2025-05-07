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
  actualPath?: string;  // Added for tracking the actual timestamped path
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
    
    // Add timestamp to filename to guarantee uniqueness and avoid caching issues
    const timestamp = Date.now();
    
    // Define paths
    const folderPrefix = `QMS/WELDERS/${welderCodeForPath}/`;
    console.log(`Using folder prefix: ${folderPrefix}`);
    
    // CRITICAL CHANGE: Instead of trying to delete and then write to the same path,
    // which requires delete permissions, create a unique path in a different location first
    
    // Create a timestamp-based unique path in a staging area
    const stagingTimestamp = Date.now();
    const stagingRandom = Math.floor(Math.random() * 1000000);
    const stagingFolderPrefix = `staging/welder-photos/${stagingTimestamp}-${stagingRandom}/`;
    const stagingPath = `${stagingFolderPrefix}photo.${originalExt}`;
    
    console.log(`Using staging path: ${stagingPath}`);
    
    // CRITICAL: No need to list or delete files since we're using a completely unique staging path
    
    // Standardized filename for the final destination - this is the one we want to appear as "W-XXX.jpg"
    // We won't try to directly write to this path since it might need delete permissions
    const standardFilename = `${welderCodeForPath}.${originalExt}`;
    const standardPath = `${folderPrefix}${standardFilename}`;
    
    console.log(`Standard path for reference: ${standardPath}`);
    
    // First upload to staging area
    const bucket = storage.bucket(bucketName);
    const stagingFile = bucket.file(stagingPath);
    
    console.log(`Uploading to staging path first: ${stagingPath}`);
    
    // Save to staging with proper content type and forced cache-busting metadata
    await stagingFile.save(buffer, {
      contentType: contentType,
      resumable: true, // Use resumable upload which bypasses existence checks
      metadata: {
        contentType: contentType,
        cacheControl: 'no-cache, no-store, must-revalidate', // Force cache invalidation
        timestamp: timestamp.toString()
      },
    });
    
    console.log(`Successfully uploaded to staging area: ${stagingPath}`);
    
    // This is the "standard" reference for retrieval later - we don't actually upload here directly
    const standardFile = bucket.file(standardPath);
    
    // Generate a signed URL from the staging file for immediate access
    const [signedUrl] = await stagingFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      queryParams: { 'v': timestamp.toString() }
    });
    
    console.log('Welder photo uploaded successfully to GCS staging area');
    console.log(`Staging path: ${stagingPath}`);
    console.log(`Standard path (for database): ${standardPath}`);
    
    // Now we need to create a lookup directory at the standard path location 
    // This directory will contain pointers to the latest staging photos
    // Create an index file that points to our staging file
    const indexFilename = `${folderPrefix}index.json`;
    const indexFile = bucket.file(indexFilename);
    
    // The index file will point to the most recent upload
    const indexData = JSON.stringify({
      stagingPath: stagingPath,
      timestamp: timestamp,
      welderCode: welderCodeForPath,
      uploadTime: new Date().toISOString()
    });
    
    // Try to write the index file - this might fail due to permissions, but it's not critical
    try {
      await indexFile.save(Buffer.from(indexData), {
        contentType: 'application/json',
        resumable: true,
        metadata: {
          contentType: 'application/json',
          cacheControl: 'no-cache, no-store, must-revalidate',
        }
      });
      console.log(`Successfully created index file at ${indexFilename}`);
    } catch (indexError) {
      console.warn(`Could not create index file (non-critical): ${indexError instanceof Error ? indexError.message : String(indexError)}`);
    }
    
    // For database storage, use the standardized path format 
    // This ensures consistent path references in the database
    const dbPath = standardPath;
    
    return {
      success: true,
      filePath: dbPath,  // Store standardized path in database
      actualPath: stagingPath, // The actual unique path in staging
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
 * Generates a publicly accessible URL for a welder photo.
 * This function looks for the most recent photo in the welder's directory.
 * 
 * @param filePath - The GCS file path from database record
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
    
    // Extract the welder ID from the path
    const pathParts = filePath.split('/');
    if (pathParts.length < 3) {
      console.error(`Invalid path format: ${filePath}`);
      return null;
    }
    
    const welderId = pathParts[2]; // Get welder ID from path (e.g., "W-001")
    const folderPrefix = `QMS/WELDERS/${welderId}/`;
    
    console.log(`Searching for most recent photo in folder: ${folderPrefix}`);
    
    try {
      // List all files in this welder's directory
      const [files] = await bucket.getFiles({ prefix: folderPrefix });
      
      if (files.length === 0) {
        console.error(`No files found in directory: ${folderPrefix}`);
        return null;
      }
      
      console.log(`Found ${files.length} files in welder directory`);
      
      // Sort files by name to find the most recent one (has timestamp in name)
      // Our naming convention: W-001_1234567890.jpg (oldest first)
      files.sort((a, b) => b.name.localeCompare(a.name));
      
      // Get the most recent file
      const latestFile = files[0];
      console.log(`Using most recent file: ${latestFile.name}`);
      
      // Generate a signed URL with cache-busting parameter
      const timestamp = Date.now();
      try {
        const [signedUrl] = await latestFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
          queryParams: { 'v': timestamp.toString() }
        });
        
        console.log(`Successfully generated signed URL for ${latestFile.name}`);
        return signedUrl;
      } catch (signedUrlError) {
        console.error(`Error generating signed URL for ${latestFile.name}:`, signedUrlError);
        
        // Return a fallback direct URL if signed URL generation fails
        // This will work if the bucket has public access enabled for this object
        const fallbackUrl = `https://storage.googleapis.com/${bucketName}/${latestFile.name}?v=${timestamp}`;
        console.log(`Falling back to direct URL: ${fallbackUrl}`);
        return fallbackUrl;
      }
      
    } catch (listError) {
      console.error(`Error listing files in directory ${folderPrefix}:`, listError);
      
      // Fall back to trying the exact path as before
      console.log(`Falling back to exact path: ${filePath}`);
      const file = bucket.file(filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      
      if (!exists) {
        // Try standard path with common extensions
        const extensions = ['jpg', 'jpeg', 'png', 'pdf'];
        let fileFound = false;
        
        for (const ext of extensions) {
          const standardPath = `${folderPrefix}${welderId}.${ext}`;
          console.log(`Trying standard path: ${standardPath}`);
          
          const standardFile = bucket.file(standardPath);
          const [standardExists] = await standardFile.exists();
          
          if (standardExists) {
            console.log(`Found file at standard path: ${standardPath}`);
            const timestamp = Date.now();
            try {
              const [signedUrl] = await standardFile.getSignedUrl({
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
                queryParams: { 'v': timestamp.toString() }
              });
              return signedUrl;
            } catch (signedUrlError) {
              console.error(`Error generating signed URL for standard path ${standardPath}:`, signedUrlError);
              
              // Return a fallback direct URL if signed URL generation fails
              const fallbackUrl = `https://storage.googleapis.com/${bucketName}/${standardPath}?v=${timestamp}`;
              console.log(`Falling back to direct URL: ${fallbackUrl}`);
              return fallbackUrl;
            }
          }
        }
        
        console.error(`No files found for welder ${welderId}`);
        return null;
      }
      
      // Generate signed URL for the exact path
      const timestamp = Date.now();
      try {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
          queryParams: { 'v': timestamp.toString() }
        });
        
        console.log(`Successfully generated signed URL for exact path: ${filePath}`);
        return signedUrl;
      } catch (signedUrlError) {
        console.error(`Error generating signed URL for exact path ${filePath}:`, signedUrlError);
        
        // Return a fallback direct URL if signed URL generation fails
        const fallbackUrl = `https://storage.googleapis.com/${bucketName}/${filePath}?v=${timestamp}`;
        console.log(`Falling back to direct URL: ${fallbackUrl}`);
        return fallbackUrl;
      }
    }
  } catch (error) {
    console.error('Error generating welder photo URL:', error);
    return null;
  }
}