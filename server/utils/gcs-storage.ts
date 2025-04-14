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
      sanitized.projectCode,
      sanitized.department
    ].filter(Boolean); // Filter out any empty strings

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
   * Returns all files in the specified path, excluding ".keep" files
   */
  async listFiles(directoryPath: string): Promise<any[]> {
    try {
      console.log(`GCS: Listing files in directory: ${directoryPath}`);
      
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
      const options = {
        prefix: cleanPath,
        delimiter: '/'
      };
      
      console.log(`GCS: Getting files with prefix: ${options.prefix}`);
      const [response] = await bucket.getFiles(options);
      console.log(`GCS: Found ${response.length} files in bucket`);
      
      // Log each file for debugging
      response.forEach(file => {
        console.log(`GCS: Found file: ${file.name}`);
      });
      
      // Filter out ".keep" files and parse metadata
      const files = response
        .filter(file => !file.name.endsWith('/.keep'))
        .map(file => ({
          name: path.basename(file.name),
          path: file.name,
          size: file.metadata.size,
          contentType: file.metadata.contentType,
          updated: file.metadata.updated,
          created: file.metadata.timeCreated
        }));
      
      console.log(`GCS: Returning ${files.length} files (excluding .keep files)`);
      return files;
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
}

export const gcsStorage = new GcsStorage();