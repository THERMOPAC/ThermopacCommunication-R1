import path from 'path';
import storage, { bucketName } from './storage-config';
import { promises as fs } from 'fs';
import { GcsApiResponse } from './gcs-types';

/**
 * Google Cloud Storage interface for file operations
 * This module provides abstracted methods for common storage operations
 */
class GcsStorage {
  /**
   * Build the storage path for a file based on our folder structure
   * Format: financialYear/projectCode/department/[subDirectory]/fileName
   */
  buildStoragePath({
    financialYear,
    projectCode,
    department,
    subDirectory,
    fileName,
    contentType
  }: {
    financialYear: string;
    projectCode: string;
    department: string;
    subDirectory?: string;
    fileName: string;
    contentType: string;
  }): string {
    // Sanitize inputs to prevent path traversal attacks
    const sanitized = {
      financialYear: financialYear.replace(/[^\w-]/g, ''),
      projectCode: projectCode.replace(/[^\w-]/g, ''),
      department: department.replace(/[^\w-]/g, ''),
      subDirectory: subDirectory ? subDirectory.replace(/[^\w\s.-/]/g, '') : '', // Allow slashes in subdirectory
      fileName: fileName.replace(/[^\w\s.-]/g, '')
    };

    console.log(`Building storage path: FY: ${sanitized.financialYear}, Project: ${sanitized.projectCode}, Dept: ${sanitized.department}, SubDir: ${sanitized.subDirectory}, File: ${sanitized.fileName}`);

    // Use THERMOPAC_INVENTORY as root for inventory items, and THERMOPAC_PROJECTS for projects
    // We detect inventory items when financialYear is set to 'THERMOPAC_INVENTORY'
    const isInventoryItem = sanitized.financialYear === 'THERMOPAC_INVENTORY';
    const isDrawing = department === 'drawings' || fileName.match(/_R\d+\.\w+$/i); // Check for drawing revision pattern
    
    // For drawing files, we want a specific structure: THERMOPAC_INVENTORY/{drawingNo}/{drawingNo}_R{revisionNumber}.{fileExtension}
    if (isDrawing) {
      console.log(`Detected drawing file: ${fileName}`);
      // Extract drawing number from filename (e.g., 4823002002001000_R1.pdf -> 4823002002001000)
      const drawingMatch = fileName.match(/^(.+?)_R\d+\.\w+$/i);
      if (drawingMatch && drawingMatch[1]) {
        const drawingNo = drawingMatch[1];
        console.log(`Extracted drawing number from filename: ${drawingNo}`);
        
        // Always use THERMOPAC_INVENTORY for drawings
        return `THERMOPAC_INVENTORY/${drawingNo}/${fileName}`;
      }
      
      // If we can't extract from filename, use projectCode as drawing number
      console.log(`Using projectCode as drawing number: ${sanitized.projectCode}`);
      return `THERMOPAC_INVENTORY/${sanitized.projectCode}/${fileName}`;
    }
    
    // For non-drawing files, use the standard path structure
    // Build path components based on item type
    const pathComponents = [
      isInventoryItem ? 'THERMOPAC_INVENTORY' : 'THERMOPAC_PROJECTS',
      // For inventory items, we don't need to duplicate 'THERMOPAC_INVENTORY' in the path
      ...(isInventoryItem ? [] : [sanitized.financialYear]),
      sanitized.projectCode
    ].filter(Boolean); // Filter out any empty strings
    
    // Add department for non-drawing files
    if (sanitized.department) {
      pathComponents.push(sanitized.department);
    }

    // Add subdirectory if provided
    if (sanitized.subDirectory) {
      // Handle subdirectory paths - they might contain slashes
      if (sanitized.subDirectory.includes('/')) {
        // Split by slash and add each part to the path components
        sanitized.subDirectory.split('/').forEach(part => {
          if (part.trim()) {
            pathComponents.push(part.trim());
          }
        });
      } else {
        pathComponents.push(sanitized.subDirectory);
      }
    }

    // Add filename
    pathComponents.push(sanitized.fileName);

    // Join path components with forward slashes
    return pathComponents.join('/');
  }

  /**
   * Ensure directory structure exists in GCS
   * Creates a ".keep" file to represent the directory
   */
  async ensureDirectoryStructure(dirPath: string): Promise<boolean> {
    try {
      console.log(`Ensuring directory structure for path: ${dirPath}`);
      console.log(`Using bucket name: ${bucketName}`);
      const bucket = storage.bucket(bucketName);
      const keepFilePath = path.join(dirPath, '.keep');
      console.log(`Creating .keep file at: ${keepFilePath}`);
      const file = bucket.file(keepFilePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        await file.save('', {
          contentType: 'application/x-empty',
          metadata: {
            'x-goog-meta-directory': 'true'
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error ensuring directory structure:', error);
      return false;
    }
  }

  /**
   * List files in a directory
   * Returns all files in the specified path, including files in subdirectories if recursive is true
   */
  async listFiles(directoryPath: string, recursive: boolean = false): Promise<any[]> {
    try {
      console.log(`GCS: Listing files in directory: ${directoryPath} (recursive: ${recursive})`);
      
      // Determine if this is a drawing-related path - drawings have specific structures
      const isDrawingPath = 
        directoryPath.includes('drawings/') || 
        directoryPath.includes('/drawings') ||
        (directoryPath.includes('THERMOPAC_INVENTORY') && /\d{10,}/.test(directoryPath)) ||
        /4\d{3}/.test(directoryPath) || // Starts with 4 followed by digits (drawing numbers pattern)
        /\d{10,}/.test(directoryPath);  // Drawing number pattern (10+ digits)
        
      // Extract drawing number if this is a drawing path
      let drawingNumber = null;
      if (isDrawingPath) {
        console.log(`GCS: Detected drawing path, will use enhanced search logic: ${directoryPath}`);
        
        // Extract drawing number using multiple patterns
        // First try to find long drawing numbers (10+ digits)
        const longDrawingMatch = directoryPath.match(/(\d{10,})/);
        if (longDrawingMatch && longDrawingMatch[1]) {
          drawingNumber = longDrawingMatch[1];
          console.log(`GCS: Extracted long drawing number: ${drawingNumber} from path: ${directoryPath}`);
        } else {
          // Then try to find shorter drawing numbers (4-9 digits)
          const shortDrawingMatch = directoryPath.match(/(\d{4,9})/);
          if (shortDrawingMatch && shortDrawingMatch[1]) {
            drawingNumber = shortDrawingMatch[1];
            console.log(`GCS: Extracted short drawing number: ${drawingNumber} from path: ${directoryPath}`);
          }
        }
      }
      
      // First check if this is a THERMOPAC_INVENTORY path
      // THERMOPAC_INVENTORY should be at the ROOT, not inside THERMOPAC_PROJECTS
      if (directoryPath.includes('THERMOPAC_PROJECTS/THERMOPAC_INVENTORY')) {
        // Remove the THERMOPAC_PROJECTS/ prefix from the path
        directoryPath = directoryPath.replace('THERMOPAC_PROJECTS/', '');
        console.log(`GCS: Corrected inventory path to: ${directoryPath}`);
      }
      
      // Make sure directory path always ends with a slash
      const normalizedPath = directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`;
      console.log(`GCS: Normalized path: ${normalizedPath}`);
      
      // Remove any double slashes
      const cleanPath = normalizedPath.replace(/\/+/g, '/');
      console.log(`GCS: Cleaned path to remove double slashes: ${cleanPath}`);
      
      const bucket = storage.bucket(bucketName);
      const options: any = {
        prefix: cleanPath
      };
      
      // Only use delimiter for non-recursive listing (to get "directories")
      if (!recursive) {
        options.delimiter = '/';
      }
      
      let allFiles: any[] = [];
      
      // For drawing paths, prepare backup search paths
      const searchPaths = [cleanPath]; // Start with the original path
      
      if (isDrawingPath && drawingNumber) {
        // Add alternative paths to search for drawings with this number
        searchPaths.push(
          `THERMOPAC_INVENTORY/${drawingNumber}/`,
          `THERMOPAC_INVENTORY/drawings/${drawingNumber}/`,
          `THERMOPAC_PROJECTS/drawings/${drawingNumber}/`
        );
        
        // Check if the cleanPath already has a structure like THERMOPAC_INVENTORY/{drawingNo}/
        // If not, also look in a direct folder for the drawing number
        if (!cleanPath.match(/THERMOPAC_INVENTORY\/\d{4,}\/$/)) {
          searchPaths.push(`${drawingNumber}/`);
        }
        
        console.log(`GCS: Will search multiple paths for drawing ${drawingNumber}: ${searchPaths.join(', ')}`);
      }
      
      // Get files in all applicable paths (for drawings, we'll search multiple locations)
      let files: any[] = [];
      let hasFoundDrawings = false;
      
      // Process each search path
      for (const searchPath of searchPaths) {
        // Skip paths we've already searched
        if (searchPath === cleanPath && files.length > 0) continue;
        
        // For drawing paths, always search recursively
        const pathOptions = { ...options, prefix: searchPath };
        
        try {
          console.log(`GCS: Getting files with prefix: ${pathOptions.prefix}`);
          const [pathFiles] = await bucket.getFiles(pathOptions);
          console.log(`GCS: Found ${pathFiles.length} files in bucket with prefix ${searchPath}`);
          
          // Filter the files to only include drawing-related files if this is an alternative path
          if (searchPath !== cleanPath && isDrawingPath && drawingNumber) {
            // For alternative paths, only include files that match the drawing number
            const relevantFiles = pathFiles.filter(file => {
              const fileName = file.name;
              return fileName.includes(drawingNumber) &&
                     !fileName.endsWith('/.keep') &&
                     !fileName.endsWith('/');
            });
            
            if (relevantFiles.length > 0) {
              console.log(`GCS: Found ${relevantFiles.length} relevant drawing files in alternative path: ${searchPath}`);
              files.push(...relevantFiles);
              hasFoundDrawings = true;
            }
          } else {
            // For the primary path, include all files
            files.push(...pathFiles);
            
            // If this is the main path and we found drawing files, mark success
            if (searchPath === cleanPath && pathFiles.length > 0 && isDrawingPath) {
              hasFoundDrawings = true;
            }
          }
        } catch (err) {
          console.warn(`GCS: Error searching path ${searchPath}:`, err);
        }
      }
      
      console.log(`GCS: Found ${files.length} total files across all search paths`);
      
      // If this is a drawing path and we haven't found any drawings yet, try a broader search
      if (isDrawingPath && drawingNumber && !hasFoundDrawings && files.length === 0) {
        console.log(`GCS: No drawings found in specific paths. Trying bucket-wide search for ${drawingNumber}`);
        
        try {
          // Search the entire bucket for files containing the drawing number
          const [allFiles] = await bucket.getFiles({
            prefix: '' // Empty prefix to search entire bucket
          });
          
          // Filter to only include files related to this drawing number
          const relevantFiles = allFiles.filter(file => {
            const fileName = file.name;
            return fileName.includes(drawingNumber) &&
                   !fileName.endsWith('/.keep') &&
                   !fileName.endsWith('/');
          });
          
          if (relevantFiles.length > 0) {
            console.log(`GCS: Found ${relevantFiles.length} drawing files in bucket-wide search`);
            files.push(...relevantFiles);
          }
        } catch (err) {
          console.warn('GCS: Error during bucket-wide search:', err);
        }
      }
      
      // Check for prefixes/directories if non-recursive mode
      let directories: string[] = [];
      if (!recursive) {
        try {
          // The apiResponse type doesn't include prefixes in the TypeScript definitions
          // but the Google Cloud Storage API does return prefixes when using delimiter
          const [, apiResponse] = await bucket.getFiles(options);
          // We need to cast apiResponse to any to access the prefixes property
          const anyResponse = apiResponse as any;
          if (anyResponse && anyResponse.prefixes) {
            directories = anyResponse.prefixes as string[];
            console.log(`GCS: Found directories: ${JSON.stringify(directories)}`);
          }
        } catch (err) {
          console.warn('Error getting prefixes (subdirectories):', err);
        }
      }
      
      // Process files
      const processedFiles = files
        .filter(file => 
          // Exclude .keep files
          !file.name.endsWith('/.keep') && 
          // Exclude directories (files that end with /)
          !file.name.endsWith('/') &&
          // Exclude the directory itself 
          file.name !== cleanPath
        )
        .map(file => ({
          name: path.basename(file.name),
          path: file.name,
          size: file.metadata.size,
          contentType: file.metadata.contentType,
          updated: file.metadata.updated,
          created: file.metadata.timeCreated,
          isDirectory: false
        }));
      
      allFiles.push(...processedFiles);
      
      // Add directory entries (for non-recursive mode)
      const directoryEntries = directories.map(dir => {
        const dirName = dir.replace(cleanPath, '').replace(/\/$/, '');
        return {
          name: dirName,
          path: dir,
          isDirectory: true,
          contentType: null
        };
      });
      
      allFiles.push(...directoryEntries);
      
      // If recursive and we found directories, recursively list their contents
      if (recursive && directories.length > 0) {
        const subDirPromises = directories.map(dir => this.listFiles(dir, true));
        const subDirResults = await Promise.all(subDirPromises);
        
        for (const subDirFiles of subDirResults) {
          allFiles.push(...subDirFiles);
        }
      }
      
      console.log(`GCS: Returning ${allFiles.length} total items`);
      
      return allFiles;
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  }

  /**
   * Generate a signed URL for uploading a file
   * Creates a temporary URL that allows direct browser-to-GCS upload
   */
  async generateUploadSignedUrl({
    financialYear,
    projectCode,
    department,
    subDirectory,
    fileName,
    contentType
  }: {
    financialYear: string;
    projectCode: string;
    department: string;
    subDirectory?: string;
    fileName: string;
    contentType: string;
  }): Promise<string | null> {
    try {
      const bucket = storage.bucket(bucketName);
      const filePath = this.buildStoragePath({
        financialYear,
        projectCode,
        department,
        subDirectory,
        fileName,
        contentType
      });
      
      const file = bucket.file(filePath);
      
      // Create signed URL with 15-minute expiration
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType
      });
      
      return url;
    } catch (error) {
      console.error('Error generating upload URL:', error);
      return null;
    }
  }

  /**
   * Generate a signed URL for downloading a file
   * Creates a temporary URL that allows secure file download
   */
  async generateDownloadSignedUrl({
    filePath,
    expirationMinutes = 15
  }: {
    filePath: string;
    expirationMinutes?: number;
  }): Promise<string | null> {
    try {
      console.log(`GCS: Generating download URL for file: ${filePath}`);
      const bucket = storage.bucket(bucketName);
      
      // Check if this is a drawing path
      const isDrawingPath = 
        filePath.includes('drawings/') || 
        filePath.match(/_R\d+\.\w+$/i) || // Check for revision pattern
        (filePath.includes('THERMOPAC_INVENTORY') && /\d{10,}/.test(filePath)) ||
        /4\d{3}/.test(filePath); // Drawing numbers often start with 4 followed by digits
        
      // For drawing paths, we might need to try multiple locations
      if (isDrawingPath) {
        console.log(`GCS: Detected drawing path, will try multiple locations: ${filePath}`);
        
        // First check if the file exists at the exact path
        const file = bucket.file(filePath);
        const [exists] = await file.exists();
        
        if (exists) {
          console.log(`GCS: Drawing file exists at exact path: ${filePath}`);
          // Create signed URL with specified expiration
          const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + expirationMinutes * 60 * 1000
          });
          return url;
        }
        
        // If file doesn't exist, try to extract drawing number and revision
        console.log(`GCS: Drawing file not found at exact path, trying alternative paths`);
        let drawingNumber = null;
        let revision = null;
        
        // Try to extract drawing number and revision from filename
        // Pattern: {drawingNo}_R{revision}.{extension}
        const drawingRevMatch = path.basename(filePath).match(/^(.+?)_R(\d+)\.\w+$/i);
        if (drawingRevMatch && drawingRevMatch[1] && drawingRevMatch[2]) {
          drawingNumber = drawingRevMatch[1];
          revision = drawingRevMatch[2];
          console.log(`GCS: Extracted drawing number ${drawingNumber} and revision ${revision} from filename`);
        } else {
          // Try to extract just the drawing number from the path
          const numMatch = filePath.match(/(\d{4,})/);
          if (numMatch && numMatch[1]) {
            drawingNumber = numMatch[1];
            console.log(`GCS: Extracted drawing number ${drawingNumber} from path`);
            
            // Try to extract revision from filename if not already found
            const revMatch = path.basename(filePath).match(/_R(\d+)/i);
            if (revMatch && revMatch[1]) {
              revision = revMatch[1];
              console.log(`GCS: Extracted revision ${revision} from filename`);
            }
          }
        }
        
        // If we found both drawing number and revision, try alternative paths
        if (drawingNumber) {
          // List of paths to try in order of most likely to least likely
          const pathsToTry = [
            // Main path format: THERMOPAC_INVENTORY/{drawingNo}/{drawingNo}_R{revision}.{extension}
            `THERMOPAC_INVENTORY/${drawingNumber}/${path.basename(filePath)}`,
            // Legacy/alternative formats
            `THERMOPAC_INVENTORY/drawings/${drawingNumber}/${path.basename(filePath)}`,
            `THERMOPAC_PROJECTS/drawings/${drawingNumber}/${path.basename(filePath)}`,
            // If there is a mismatch between drawing number in path vs filename
            `THERMOPAC_INVENTORY/${drawingNumber}/${drawingNumber}_R${revision || '1'}.pdf`
          ];
          
          console.log(`GCS: Trying alternative drawing paths: ${pathsToTry.join(', ')}`);
          
          // Try each path
          for (const pathToTry of pathsToTry) {
            if (pathToTry !== filePath) { // Skip the original path we already checked
              const alternativeFile = bucket.file(pathToTry);
              const [alternativeExists] = await alternativeFile.exists();
              
              if (alternativeExists) {
                console.log(`GCS: Found drawing at alternative path: ${pathToTry}`);
                // Generate signed URL for the alternative file
                const [url] = await alternativeFile.getSignedUrl({
                  version: 'v4',
                  action: 'read',
                  expires: Date.now() + expirationMinutes * 60 * 1000
                });
                return url;
              }
            }
          }
          
          // If all specific paths failed, try a broader search if we have a drawing number
          console.log(`GCS: Specific paths failed, trying broader search for drawing ${drawingNumber}`);
          // Use listFiles to find relevant drawing files
          const [allFiles] = await bucket.getFiles({
            prefix: '' // Empty prefix to search entire bucket
          });
          
          // Filter to only include files related to this drawing number
          const relevantFiles = allFiles.filter(file => {
            const fileName = file.name;
            // Check for drawing number in the path or filename
            const hasDrawingNumber = fileName.includes(drawingNumber);
            // Check for revision number in the filename if specified
            const hasRevision = !revision || fileName.includes(`_R${revision}`);
            return hasDrawingNumber && hasRevision &&
                   !fileName.endsWith('/.keep') &&
                   !fileName.endsWith('/');
          });
          
          if (relevantFiles.length > 0) {
            console.log(`GCS: Found ${relevantFiles.length} relevant drawing files in bucket-wide search`);
            // Get URL for the first matching file
            const firstMatch = relevantFiles[0];
            const [url] = await firstMatch.getSignedUrl({
              version: 'v4',
              action: 'read',
              expires: Date.now() + expirationMinutes * 60 * 1000
            });
            return url;
          }
        }
        
        console.log(`GCS: Could not find drawing file in any location for ${filePath}`);
        return null;
      }
      
      // For non-drawing files, use the standard path
      const file = bucket.file(filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        console.log(`GCS: File does not exist at path: ${filePath}`);
        return null;
      }
      
      // Create signed URL with specified expiration
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expirationMinutes * 60 * 1000
      });
      
      console.log(`GCS: Successfully generated download URL for file: ${filePath}`);
      return url;
    } catch (error) {
      console.error('Error generating download URL:', error);
      return null;
    }
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      console.log(`GCS: Attempting to delete file: ${filePath}`);
      const bucket = storage.bucket(bucketName);
      
      // Check if this is a drawing path - similar logic to download URL generation
      const isDrawingPath = 
        filePath.includes('drawings/') || 
        filePath.match(/_R\d+\.\w+$/i) || // Check for revision pattern
        (filePath.includes('THERMOPAC_INVENTORY') && /\d{10,}/.test(filePath)) ||
        /4\d{3}/.test(filePath);
      
      // For standard files, use direct deletion
      if (!isDrawingPath) {
        const file = bucket.file(filePath);
        
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
          console.log(`GCS: File does not exist at path: ${filePath}`);
          return false;
        }
        
        // Delete the file
        await file.delete();
        console.log(`GCS: Successfully deleted file: ${filePath}`);
        return true;
      }
      
      // For drawing files, follow similar logic to our download URL method
      console.log(`GCS: Detected drawing path, will try multiple locations: ${filePath}`);
      
      // First try the exact path
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        console.log(`GCS: Successfully deleted drawing at exact path: ${filePath}`);
        return true;
      }
      
      // Try to extract drawing number and revision
      let drawingNumber = null;
      let revision = null;
      
      // Try to extract drawing number and revision from filename
      const drawingRevMatch = path.basename(filePath).match(/^(.+?)_R(\d+)\.\w+$/i);
      if (drawingRevMatch && drawingRevMatch[1] && drawingRevMatch[2]) {
        drawingNumber = drawingRevMatch[1];
        revision = drawingRevMatch[2];
      } else {
        // Try to extract just the drawing number from the path
        const numMatch = filePath.match(/(\d{4,})/);
        if (numMatch && numMatch[1]) {
          drawingNumber = numMatch[1];
          
          // Try to extract revision from filename if not already found
          const revMatch = path.basename(filePath).match(/_R(\d+)/i);
          if (revMatch && revMatch[1]) {
            revision = revMatch[1];
          }
        }
      }
      
      // If we extracted a drawing number, try alternative paths
      if (drawingNumber) {
        // List of paths to try in order of most likely to least likely
        const pathsToTry = [
          `THERMOPAC_INVENTORY/${drawingNumber}/${path.basename(filePath)}`,
          `THERMOPAC_INVENTORY/drawings/${drawingNumber}/${path.basename(filePath)}`,
          `THERMOPAC_PROJECTS/drawings/${drawingNumber}/${path.basename(filePath)}`
        ];
        
        // Try each path
        for (const pathToTry of pathsToTry) {
          if (pathToTry !== filePath) { // Skip the original path we already checked
            const alternativeFile = bucket.file(pathToTry);
            const [alternativeExists] = await alternativeFile.exists();
            
            if (alternativeExists) {
              await alternativeFile.delete();
              console.log(`GCS: Successfully deleted drawing at alternative path: ${pathToTry}`);
              return true;
            }
          }
        }
      }
      
      console.log(`GCS: Could not find drawing file to delete in any location for ${filePath}`);
      return false;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }
  
  /**
   * Direct upload function for better error handling and debugging
   * This is an alternative to using the signed URL approach and
   * has improved error details for troubleshooting
   */
  async uploadFileDirectly({
    filePath, 
    buffer, 
    contentType
  }: {
    filePath: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<{ success: boolean; error?: any; url?: string }> {
    console.log(`Direct upload: Starting upload to path ${filePath}`);
    
    try {
      // Get bucket and file references
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);
      
      // Create directory if needed
      const dirPath = path.dirname(filePath);
      await this.ensureDirectoryStructure(dirPath);
      
      // Upload with promise-based approach instead of streams
      console.log(`Direct upload: Uploading ${buffer.length} bytes with content type ${contentType}`);
      
      // Use the Storage API's upload method with proper error handling
      await file.save(buffer, {
        contentType,
        metadata: {
          contentType,
          cacheControl: 'private, max-age=0'
        }
      });
      
      console.log(`Direct upload: Upload complete, generating download URL`);
      
      // Generate a temporary download URL
      const downloadUrl = await this.generateDownloadSignedUrl({
        filePath,
        expirationMinutes: 60 // 1 hour
      });
      
      return { 
        success: true, 
        url: downloadUrl || undefined 
      };
    } catch (error: any) {
      console.error('Direct upload error:', error);
      return { 
        success: false, 
        error: {
          message: error.message,
          code: error.code,
          details: JSON.stringify(error, null, 2)
        }
      };
    }
  }
}

export const gcsStorage = new GcsStorage();