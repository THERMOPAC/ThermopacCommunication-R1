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
      subDirectory: subDirectory ? subDirectory.replace(/[^\w-]/g, '') : '',
      fileName: fileName.replace(/[^\w\s.-]/g, '')
    };

    // Build path components
    const pathComponents = [
      sanitized.financialYear,
      sanitized.projectCode,
      sanitized.department
    ];

    // Add subdirectory if provided
    if (sanitized.subDirectory) {
      pathComponents.push(sanitized.subDirectory);
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
      const bucket = storage.bucket(bucketName);
      const keepFilePath = path.join(dirPath, '.keep');
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
      const bucket = storage.bucket(bucketName);
      const options = {
        prefix: directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`,
        delimiter: '/'
      };
      
      const [response] = await bucket.getFiles(options);
      
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