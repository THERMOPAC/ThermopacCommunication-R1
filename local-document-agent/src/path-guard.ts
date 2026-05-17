/**
 * path-guard.ts
 *
 * Security rules:
 * - Reject traversal sequences (../ ..\)
 * - Reject absolute paths (C:\ D:\ \\Server\ etc.)
 * - Reject unresolved tokens ({...})
 * - Reject dangerous file extensions
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
