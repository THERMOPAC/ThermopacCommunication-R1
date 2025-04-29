/**
 * GCS Helper utility for consistently handling file paths
 */

/**
 * Safely handles GCS file paths ensuring proper string conversion and removal of leading slashes
 * @param filePath The file path which might be a string or another type
 * @returns A cleaned file path string ready for GCS operations
 */
export function getGCSCleanPath(filePath: any): string {
  // First ensure filePath is a string
  const pathStr = typeof filePath === 'string' ? filePath : String(filePath || '');
  
  // Remove leading slash if present - GCS doesn't want leading slashes
  return pathStr.startsWith('/') ? pathStr.substring(1) : pathStr;
}