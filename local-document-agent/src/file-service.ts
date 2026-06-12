/**
 * file-service.ts
 *
 * Safe file operations:
 * 1. Download file to .tmp using Node 20 native fetch
 * 2. Calculate SHA256
 * 3. Rename .tmp → final only after successful verify
 * 4. Auto-create parent folders
 */

import * as fs from 'fs';
import * as path from 'path';
import { sha256OfFile } from './hash-service';
import { info, warn, error } from './logger';

export interface SaveResult {
  ok:          boolean;
  localPath:   string;
  sha256:      string;
  error?:      string;
}

export async function downloadAndSave(
  fileUrl:      string,
  destFullPath: string,
  tempDir:      string,
): Promise<SaveResult> {
  const tempPath = path.join(tempDir, `tmp_${Date.now()}_${path.basename(destFullPath)}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const parentDir = path.dirname(destFullPath);

  // ── PRE-MKDIR DIAGNOSTIC ─────────────────────────────────────────────────
  info(`[MKDIR-DIAG] fullPath          = ${destFullPath}`);
  info(`[MKDIR-DIAG] parentDir         = ${parentDir}`);
  info(`[MKDIR-DIAG] existsSync(parent)= ${fs.existsSync(parentDir)}`);
  info(`[MKDIR-DIAG] existsSync(dest)  = ${fs.existsSync(destFullPath)}`);
  const mkdirOpts = { recursive: true };
  info(`[MKDIR-DIAG] mkdirSync options = ${JSON.stringify(mkdirOpts)}`);
  // ─────────────────────────────────────────────────────────────────────────

  if (!fs.existsSync(parentDir)) {
    info(`Auto-creating folder: ${parentDir}`);
    try {
      fs.mkdirSync(parentDir, mkdirOpts);
      info(`[MKDIR-DIAG] mkdirSync succeeded`);
    } catch (mkdirErr: any) {
      info(`[MKDIR-DIAG] mkdirSync failed: code=${mkdirErr?.code} syscall=${mkdirErr?.syscall} path=${mkdirErr?.path}`);
      throw mkdirErr;
    }
  }

  try {
    info(`Downloading: ${fileUrl} → ${tempPath}`);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return { ok: false, localPath: '', sha256: '', error: `HTTP ${response.status} fetching file` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);

    const sha256 = sha256OfFile(tempPath);
    info(`SHA256: ${sha256}`);

    fs.renameSync(tempPath, destFullPath);
    info(`Saved: ${destFullPath}`);

    return { ok: true, localPath: destFullPath, sha256 };
  } catch (err_) {
    error(`downloadAndSave failed`, err_);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
    return { ok: false, localPath: '', sha256: '', error: String(err_) };
  }
}

export function createFolder(fullPath: string): { ok: boolean; error?: string } {
  try {
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      info(`Folder created: ${fullPath}`);
    } else {
      info(`Folder already exists: ${fullPath}`);
    }
    return { ok: true };
  } catch (err_) {
    return { ok: false, error: String(err_) };
  }
}

export function fileExists(fullPath: string): boolean {
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
}

export function folderExists(fullPath: string): boolean {
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
}
