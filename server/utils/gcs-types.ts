/**
 * Custom type definitions for Google Cloud Storage API
 * This file contains necessary types for better TypeScript integration
 */

export interface GcsApiResponse {
  prefixes?: string[];
  [key: string]: any;
}