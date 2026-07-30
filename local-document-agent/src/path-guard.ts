/**
 * path-guard.ts
 *
 * Security rules:
 * - Reject traversal sequences (../ ..\)
 * - Reject absolute paths (C:\ D:\ \\Server\ etc.)
 * - Reject unresolved tokens ({...})
 * - Reject dangerous file extensions
 * - Reject Windows-invalid characters (: * ? " < > |)
 * - Resolve final path strictly under allowedRootPath
 * - Verify resolved path still starts with allowedRootPath
 */

import * as path from 'path';

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.msi', '.dll',
  '.com', '.scr', '.pif', '.reg', '.js', '.jar', '.sh',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx', '.csv', '.txt',
  '.png', '.jpg', '.jpeg', '.zip', '.dwg', '.dxf',
]);

export interface PathGuardResult {
  ok:        boolean;
  fullPath:  string;
  error?:    string;
}

export function validateRelativePath(relativePath: string, allowedRootPath: string): PathGuardResult {
  if (!relativePath || relativePath.trim().length === 0) {
    return { ok: false, fullPath: '', error: 'Relative path is empty' };
  }

  // Block traversal sequences
  if (/\.\.[\\/]/.test(relativePath) || /[\\/]\.\./.test(relativePath) || relativePath === '..') {
    return { ok: false, fullPath: '', error: 'Path traversal sequence detected' };
  }

  // Block absolute paths
  if (/^[a-zA-Z]:[\\/]/.test(relativePath)) {
    return { ok: false, fullPath: '', error: 'Absolute drive paths are not allowed' };
  }
  if (/^\\\\/.test(relativePath)) {
    return { ok: false, fullPath: '', error: 'UNC paths in relative position are not allowed' };
  }
  if (/^\//.test(relativePath)) {
    return { ok: false, fullPath: '', error: 'Unix absolute paths are not allowed' };
  }

  // Block unresolved tokens
  if (/\{[^}]+\}/.test(relativePath)) {
    return { ok: false, fullPath: '', error: 'Unresolved token(s) detected in path' };
  }

  // Resolve full path
  const normalized = relativePath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
  const fullPath    = path.resolve(allowedRootPath, normalized);
  const resolvedRoot = path.resolve(allowedRootPath);

  // Ensure path stays within allowed root
  if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
    return { ok: false, fullPath: '', error: `Resolved path escapes allowedRootPath. Got: ${fullPath}` };
  }

  return { ok: true, fullPath };
}

// Windows path characters that are never valid in file or folder names
const WINDOWS_INVALID_CHARS = /[:"*?<>|]/;

/**
 * Validates a folder sub-path supplied by the server in input_payload.folders.
 * These paths are relative to the already-validated project root — they are NOT
 * checked against allowedRootPath here. The caller must verify the fully-joined
 * path still sits within allowedRootPath before calling mkdirSync.
 *
 * Checks:
 *   - Not empty
 *   - No traversal (..)
 *   - No absolute path (drive letter, UNC, Unix /)
 *   - No unresolved tokens ({...})
 *   - No Windows-invalid characters
 *   - No empty segments (duplicate slashes)
 */
export function validateFolderSegment(folderPath: string): { ok: boolean; error?: string } {
  if (!folderPath || folderPath.trim().length === 0) {
    return { ok: false, error: 'Folder path is empty' };
  }
  if (/\.\./.test(folderPath)) {
    return { ok: false, error: 'Path traversal sequence (..) detected' };
  }
  if (/^[a-zA-Z]:/.test(folderPath)) {
    return { ok: false, error: 'Drive-letter absolute paths not allowed' };
  }
  if (/^\\\\/.test(folderPath)) {
    return { ok: false, error: 'UNC paths not allowed' };
  }
  if (/^[/\\]/.test(folderPath)) {
    return { ok: false, error: 'Unix/root absolute paths not allowed' };
  }
  if (/\{[^}]+\}/.test(folderPath)) {
    return { ok: false, error: 'Unresolved token(s) detected in folder path' };
  }
  if (WINDOWS_INVALID_CHARS.test(folderPath)) {
    return { ok: false, error: 'Invalid Windows path character detected (: * ? " < > |)' };
  }
  // Reject empty segments from duplicate slashes e.g. "a//b"
  const segments = folderPath.split(/[/\\]/);
  for (const seg of segments) {
    if (seg.length === 0) {
      return { ok: false, error: 'Empty path segment (duplicate slash) detected' };
    }
  }
  return { ok: true };
}

export function validateExtension(fileName: string): { ok: boolean; error?: string } {
  const ext = path.extname(fileName).toLowerCase();

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Dangerous file extension rejected: ${ext}` };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `File extension not in allowed list: ${ext}` };
  }

  return { ok: true };
}
