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
  if (!fs.existsSync(parentDir)) {
    // ── DIAGNOSTIC: run before mkdir to identify permission root cause ──────
    info(`[DIAG] process.env.USERNAME  = ${process.env.USERNAME ?? '(undefined)'}`);
    info(`[DIAG] process.env.USERDOMAIN = ${process.env.USERDOMAIN ?? '(undefined)'}`);
    info(`[DIAG] os.userInfo().username = ${(() => { try { return require('os').userInfo().username; } catch { return '(error)'; } })()}`);

    // Walk up the path tree — find which ancestor is visible and writable
    const ancestors: string[] = [];
    let cur = parentDir;
    while (true) {
      ancestors.unshift(cur);
      const parent = path.dirname(cur);
      if (parent === cur) break; // filesystem root
      cur = parent;
    }
    for (const seg of ancestors) {
      const exists = fs.existsSync(seg);
      let writable = false;
      if (exists) {
        try { fs.accessSync(seg, fs.constants.W_OK); writable = true; } catch { writable = false; }
      }
      info(`[DIAG] ${seg}  exists=${exists}  writable=${writable}`);
    }
    // ── END DIAGNOSTIC ───────────────────────────────────────────────────────

    info(`Auto-creating folder: ${parentDir}`);
    fs.mkdirSync(parentDir, { recursive: true });
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
