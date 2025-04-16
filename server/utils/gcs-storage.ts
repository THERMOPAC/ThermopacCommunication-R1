import path from 'path';
import storage, { bucketName } from './storage-config';
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
    
    // Build path components based on item type
    const pathComponents = [
      isInventoryItem ? 'THERMOPAC_INVENTORY' : 'THERMOPAC_PROJECTS',
      // For inventory items, we don't need to duplicate 'THERMOPAC_INVENTORY' in the path
      ...(isInventoryItem ? [] : [sanitized.financialYear]),
      sanitized.projectCode
    ].filter(Boolean); // Filter out any empty strings
    
    // Add department to the path (including 'drawings')
    // We previously skipped 'drawings' folder but this was causing search issues
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
      
      // IMPORTANT DEBUG LOG: Check environment
      console.log(`GCS: Running in environment: ${process.env.NODE_ENV}`);
      
      // PRODUCTION ENVIRONMENT SPECIAL HANDLING
      // This is to fix the problem where drawings don't show up in production
      const isProduction = process.env.NODE_ENV === 'production';
      const isDrawingInventory = directoryPath.includes('THERMOPAC_INVENTORY/') && 
                                 /\d+$/.test(directoryPath.split('/').pop() || '');
      
      if (isProduction && isDrawingInventory) {
        console.log(`GCS: PRODUCTION MODE SPECIAL HANDLING for drawing path: ${directoryPath}`);
        const drawingNo = directoryPath.split('/').pop();
        
        if (drawingNo) {
          console.log(`GCS: PRODUCTION - Looking for drawings with number: ${drawingNo}`);
          return await this.findDrawingsInProduction(drawingNo);
        }
      }
      
      // First check if this is a THERMOPAC_INVENTORY path
      // THERMOPAC_INVENTORY should be at the ROOT, not inside THERMOPAC_PROJECTS
      if (directoryPath.includes('THERMOPAC_PROJECTS/THERMOPAC_INVENTORY')) {
        // Remove the THERMOPAC_PROJECTS/ prefix from the path
        directoryPath = directoryPath.replace('THERMOPAC_PROJECTS/', '');
        console.log(`GCS: Corrected inventory path to: ${directoryPath}`);
      }
      
      // CRITICAL FIX: If inventory path but missing drawings subfolder,
      // check additional paths for compatibility with both old and new formats
      if (directoryPath === 'THERMOPAC_INVENTORY' && recursive) {
        console.log('GCS: CRITICAL - Using inventory path with additional compatibility checks');
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
      
      // Get files in the current directory
      console.log(`GCS: Getting files with prefix: ${options.prefix}`);
      const [files] = await bucket.getFiles(options);
      console.log(`GCS: Found ${files.length} files in bucket with prefix ${cleanPath}`);
      
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
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }
      
      // Create signed URL with specified expiration
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expirationMinutes * 60 * 1000
      });
      
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
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        return false;
      }
      
      // Delete the file
      await file.delete();
      
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }
  
  /**
   * Special method for production environment to find drawings by drawing number
   * This uses a brute force approach to find drawing files in the bucket
   */
  async findDrawingsInProduction(drawingNo: string): Promise<any[]> {
    try {
      console.log(`GCS-PROD: Starting production drawing search for: ${drawingNo}`);
      
      const bucket = storage.bucket(bucketName);
      
      // In production, we need to get ALL files and filter client-side
      console.log(`GCS-PROD: Getting ALL files from bucket: ${bucketName}`);
      
      // Get every single file in the bucket (no prefix)
      const [allFiles] = await bucket.getFiles({
        autoPaginate: false
      });
      
      console.log(`GCS-PROD: Found ${allFiles.length} total files in bucket`);
      
      // For debugging, print out some sample files
      const sampleFiles = allFiles.slice(0, Math.min(10, allFiles.length));
      console.log(`GCS-PROD: Sample file paths:`, sampleFiles.map(f => f.name));
      
      // Filter to just the drawing files that match our drawing number
      const matchingFiles = allFiles.filter(file => {
        // Get the filename and check for drawing file extension
        const fileName = path.basename(file.name);
        const filePath = file.name;
        
        // Skip directories, empty files, and hidden files
        if (fileName === '.keep' || fileName.startsWith('.') || !fileName.includes('.')) {
          return false;
        }
        
        // Check for drawing file extensions
        const isDrawingFile = 
          fileName.toLowerCase().endsWith('.pdf') || 
          fileName.toLowerCase().endsWith('.dwg') || 
          fileName.toLowerCase().endsWith('.dxf');
          
        if (!isDrawingFile) {
          return false;
        }
        
        // Various matching patterns
        const exactMatch = 
          fileName === `${drawingNo}.pdf` || 
          fileName === `${drawingNo}.dwg` || 
          fileName === `${drawingNo}.dxf`;
          
        const revisionMatch = fileName.startsWith(`${drawingNo}_R`);
        
        const pathMatch = filePath.includes(`/${drawingNo}/`);
        
        // Super aggressive matching - if the drawing number is anywhere in the path
        const looseMatch = filePath.includes(drawingNo);
        
        const isMatch = exactMatch || revisionMatch || pathMatch || looseMatch;
        
        if (isMatch) {
          console.log(`GCS-PROD: Found matching file: ${filePath}`);
        }
        
        return isMatch;
      });
      
      console.log(`GCS-PROD: Found ${matchingFiles.length} matching drawing files`);
      
      // Map to our standard file format
      const processedFiles = matchingFiles.map(file => ({
        name: path.basename(file.name),
        path: file.name,
        contentType: file.metadata.contentType,
        size: file.metadata.size,
        updated: file.metadata.updated,
        created: file.metadata.timeCreated,
        isDirectory: false
      }));
      
      return processedFiles;
    } catch (error) {
      console.error(`GCS-PROD: Error in production drawing search:`, error);
      return [];
    }
  }
}

export const gcsStorage = new GcsStorage();