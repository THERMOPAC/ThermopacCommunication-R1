import { Storage, GetSignedUrlConfig, Bucket } from '@google-cloud/storage';
import storage, { bucketName } from './storage-config';
import path from 'path';
import { GcsApiResponse } from './gcs-types';

/**
 * Google Cloud Storage utility for project files management
 * This module handles file operations with the GCS API
 */

interface FileUploadOptions {
  financialYear: string;       // e.g., "2526"
  projectCode: string;         // e.g., "2526-1"
  department: string;          // e.g., "Sales", "Design", "Purchase", etc.
  subDirectory?: string;       // e.g., "1_Pre_Order_Communication", "2_Final_Offer", etc.
  fileName: string;            // Original file name
  contentType: string;         // MIME type of the file
  public?: boolean;            // Whether the file should be publicly accessible
}

interface FileDownloadOptions {
  filePath: string;            // Full path to the file in GCS
  expirationMinutes?: number;  // How long the signed URL should be valid (default: 15 minutes)
}

const DEFAULT_EXPIRATION_MINUTES = 15;

export class GCSStorage {
  private bucket: Bucket | null = null;
  private initialized: boolean = false;

  constructor() {
    this.initializeStorage();
  }

  /**
   * Initialize the GCS storage bucket
   */
  private initializeStorage(): void {
    if (!storage || !bucketName) {
      console.error('Google Cloud Storage is not properly configured');
      return;
    }

    try {
      this.bucket = storage.bucket(bucketName);
      this.initialized = true;
      console.log('GCS Storage initialized successfully with bucket:', bucketName);
    } catch (error) {
      console.error('Failed to initialize GCS storage bucket:', error);
    }
  }

  /**
   * Validate if storage is properly initialized
   */
  private validateInitialization(): boolean {
    if (!this.initialized || !this.bucket) {
      console.error('GCS Storage is not initialized');
      return false;
    }
    return true;
  }

  /**
   * Builds a storage path based on project structure
   */
  buildStoragePath(options: FileUploadOptions): string {
    const { financialYear, projectCode, department, subDirectory, fileName } = options;
    
    let filePath = path.join(financialYear, projectCode, department);
    
    if (subDirectory) {
      filePath = path.join(filePath, subDirectory);
    }
    
    // Clean the file name to ensure it doesn't contain problematic characters
    const sanitizedFileName = fileName.replace(/[^\w\s.-]/g, '_');
    
    return path.join(filePath, sanitizedFileName).replace(/\\/g, '/');
  }

  /**
   * Ensures that a directory structure exists in GCS by creating empty placeholders if needed
   */
  async ensureDirectoryStructure(dirPath: string): Promise<boolean> {
    if (!this.validateInitialization()) return false;

    try {
      // GCS doesn't have directories, but we can create an empty placeholder object
      const placeholderPath = path.join(dirPath, '.placeholder').replace(/\\/g, '/');
      const file = this.bucket!.file(placeholderPath);
      
      // Check if placeholder already exists
      const [exists] = await file.exists();
      if (!exists) {
        await file.save('', { contentType: 'text/plain' });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to ensure directory structure:', error);
      return false;
    }
  }

  /**
   * Generate a signed URL for uploading a file directly to GCS
   */
  async generateUploadSignedUrl(options: FileUploadOptions): Promise<string | null> {
    if (!this.validateInitialization()) return null;

    try {
      const filePath = this.buildStoragePath(options);
      
      // Ensure the directory structure exists
      const dirPath = path.dirname(filePath);
      await this.ensureDirectoryStructure(dirPath);
      
      // Create the file reference
      const file = this.bucket!.file(filePath);
      
      // Set up the signed URL configuration
      const signedUrlConfig: GetSignedUrlConfig = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: options.contentType,
      };
      
      // Generate the signed URL
      const [signedUrl] = await file.getSignedUrl(signedUrlConfig);
      
      return signedUrl;
    } catch (error) {
      console.error('Failed to generate upload signed URL:', error);
      return null;
    }
  }

  /**
   * Generate a signed URL for downloading a file from GCS
   */
  async generateDownloadSignedUrl(options: FileDownloadOptions): Promise<string | null> {
    if (!this.validateInitialization()) return null;

    try {
      const file = this.bucket!.file(options.filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`File not found: ${options.filePath}`);
        return null;
      }
      
      // Set up the signed URL configuration
      const expirationMinutes = options.expirationMinutes || DEFAULT_EXPIRATION_MINUTES;
      const signedUrlConfig: GetSignedUrlConfig = {
        version: 'v4',
        action: 'read',
        expires: Date.now() + expirationMinutes * 60 * 1000,
      };
      
      // Generate the signed URL
      const [signedUrl] = await file.getSignedUrl(signedUrlConfig);
      
      return signedUrl;
    } catch (error) {
      console.error('Failed to generate download signed URL:', error);
      return null;
    }
  }

  /**
   * List files in a specific directory
   */
  async listFiles(dirPath: string): Promise<string[]> {
    if (!this.validateInitialization()) return [];

    try {
      // Ensure the path ends with a slash for directory listing
      const normPath = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
      
      // List files in the directory
      const [files] = await this.bucket!.getFiles({ prefix: normPath });
      
      // Return just the file names (without the full path)
      return files
        .map(file => file.name)
        .filter(name => !name.endsWith('.placeholder')) // Filter out placeholders
        .map(name => {
          // Return just the filename, not the full path
          const parts = name.split('/');
          return parts[parts.length - 1];
        });
    } catch (error) {
      console.error('Failed to list files:', error);
      return [];
    }
  }

  /**
   * List directories/subdirectories at a specific path
   */
  async listDirectories(parentPath: string): Promise<string[]> {
    if (!this.validateInitialization()) return [];

    try {
      // Ensure the path ends with a slash for directory listing
      const normPath = parentPath.endsWith('/') ? parentPath : `${parentPath}/`;
      
      // For the GCS API, we need to use a simpler implementation that works with the typings
      // We'll manually check the response and extract directories
      
      // First, get all the files at this prefix but with a delimiter to identify "directories"
      const options = {
        prefix: normPath,
        delimiter: '/'
      };
      
      // We need to use 'any' here because the GCS typings for this response are not accurate
      // This is a workaround for TypeScript but works with the actual GCS API
      const response: any = await this.bucket!.getFiles(options);

      // The API response contains the directories in the prefixes field
      let directories: string[] = [];
      
      // Check if the response includes prefixes (this is implementation specific to GCS)
      if (response && response.length > 2 && response[2] && Array.isArray(response[2].prefixes)) {
        directories = response[2].prefixes.map((prefix: string) => {
          // Remove the parent path and trailing slash to get just the directory name
          const dirName = prefix.replace(normPath, '');
          return dirName.replace(/\/$/, ''); 
        });
      }
      
      return directories;
    } catch (error) {
      console.error('Failed to list directories:', error);
      return [];
    }
  }

  /**
   * Delete a file from GCS
   */
  async deleteFile(filePath: string): Promise<boolean> {
    if (!this.validateInitialization()) return false;

    try {
      const file = this.bucket!.file(filePath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`File not found: ${filePath}`);
        return false;
      }
      
      // Delete the file
      await file.delete();
      return true;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }
}

// Export a singleton instance
export const gcsStorage = new GCSStorage();

export default gcsStorage;