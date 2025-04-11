/**
 * Custom type definitions for Google Cloud Storage API
 * This file contains necessary types for better TypeScript integration
 */

export interface GcsApiResponse {
  prefixes?: string[];
  [key: string]: any;
}

export interface GcsFile {
  name: string;
  path: string;
  size: number;
  contentType: string;
  updated: string;
  created: string;
}

export interface GcsUploadRequest {
  financialYear: string;
  projectCode: string;
  department: string;
  subDirectory?: string;
  fileName: string;
  contentType: string;
}

export interface GcsDownloadRequest {
  filePath: string;
  expirationMinutes?: number;
}