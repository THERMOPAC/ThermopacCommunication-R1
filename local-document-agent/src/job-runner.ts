/**
 * job-runner.ts
 *
 * Orchestrates job execution:
 *   1. Validate relative path via path-guard
 *   2. Validate file extension (for file jobs)
 *   3. Resolve full local path
 *   4. Execute job type
 *   5. Return result to ERP
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { AgentConfig } from './config';
import { AgentJob, submitResult } from './api-client';
import { validateRelativePath, validateExtension } from './path-guard';
import { downloadAndSave, createFolder, fileExists, folderExists } from './file-service';
import { sha256OfFile, verifyHash } from './hash-service';
import { ServiceHealth } from './service-health';
import { info, warn, error } from './logger';

const AGENT_VERSION = '1.0.0';

function generateTestPdf(agentCode: string, nowIso: string): Buffer {
  const pad = (n: number, d = 2) => String(n).padStart(d, '0');
  const dt = nowIso.replace('T', ' ').substring(0, 19) + ' UTC';
  const lines = [
    'BT',
    '/F1 14 Tf',
    '50 780 Td',
    '(THERMOPAC Local Windows Document Agent - File Access Test) Tj',
    '/F1 11 Tf',
    '0 -35 Td',
    `(Agent: ${agentCode}) Tj`,
    '0 -22 Td',
    `(Date/Time: ${dt}) Tj`,
    '0 -22 Td',
    '(Result: PASS - Read/write access confirmed.) Tj',
    '0 -22 Td',
    '(This file was created by SAVE_TEST_FILE and may be deleted after verification.) Tj',
    'ET',
  ];
  const streamBody = lines.join('\n');
  const streamLen  = streamBody.length; // pure ASCII — byte length === char length

  const o1 = '1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n';
  const o2 = '2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n';
  const o3 = '3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n';
  const o4 = `4 0 obj\n<</Length ${streamLen}>>\nstream\n${streamBody}\nendstream\nendobj\n`;
  const o5 = '5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Courier>>\nendobj\n';

  const hdr = '%PDF-1.4\n';
  const objs = [o1, o2, o3, o4, o5];
  let off = hdr.length;
  const offs: number[] = [];
  for (const o of objs) { offs.push(off); off += o.length; }
  const xrefPos = off;

  const p10 = (n: number) => String(n).padStart(10, '0');
  const row  = (o: number, g: number, t: 'n' | 'f') =>
    `${p10(o)} ${String(g).padStart(5, '0')} ${t} \n`; // 20 bytes per row
  const xref    = `xref\n0 6\n${row(0, 65535, 'f')}${offs.map(o => row(o, 0, 'n')).join('')}`;
  const trailer = `trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(hdr + objs.join('') + xref + trailer, 'latin1');
}

export async function runJob(
  config:  AgentConfig,
  job:     AgentJob,
  health:  ServiceHealth,
): Promise<void> {
  info(`Running job #${job.id} type=${job.jobType} path="${job.relativePath}"`);

  const pathResult = validateRelativePath(job.relativePath, config.allowedRootPath);
  if (!pathResult.ok) {
    error(`Path guard rejected job #${job.id}: ${pathResult.error}`);
    health.recordFailure(pathResult.error!);
    await submitResult(config, {
      jobId:        job.id,
      success:      false,
      failedReason: `Path guard: ${pathResult.error}`,
    });
    return;
  }

  const fullPath = pathResult.fullPath;

  try {
    switch (job.jobType) {
      case 'CREATE_FOLDER': {
        const result = createFolder(fullPath);
        if (!result.ok) throw new Error(result.error);
        health.recordSuccess();
        await submitResult(config, {
          jobId:           job.id,
          success:         true,
          resultLocalPath: fullPath,
          resultPayload:   { folderCreated: fullPath },
        });
        break;
      }

      case 'SAVE_FILE':
      case 'SAVE_PDF': {
        if (!job.fileUrl)  throw new Error('fileUrl is required for SAVE_FILE/SAVE_PDF');
        if (!job.fileName) throw new Error('fileName is required for SAVE_FILE/SAVE_PDF');

        const extResult = validateExtension(job.fileName);
        if (!extResult.ok) {
          health.recordFailure(extResult.error!);
          await submitResult(config, { jobId: job.id, success: false, failedReason: extResult.error });
          return;
        }

        // relative_path always ends with the canonical destination filename (from GCS path).
        // job.fileName is the original upload name and may differ — never append it to fullPath.
        const destPath = fullPath;
        const saveResult = await downloadAndSave(job.fileUrl, destPath, config.tempDir);

        if (!saveResult.ok) throw new Error(saveResult.error);

        if (job.expectedSha256) {
          if (!verifyHash(saveResult.localPath, job.expectedSha256)) {
            throw new Error(`SHA256 mismatch. Expected: ${job.expectedSha256} Got: ${saveResult.sha256}`);
          }
          info(`SHA256 verified OK for job #${job.id}`);
        }

        health.recordSuccess();
        await submitResult(config, {
          jobId:           job.id,
          success:         true,
          actualSha256:    saveResult.sha256,
          resultLocalPath: saveResult.localPath,
          resultPayload:   { savedTo: saveResult.localPath, sha256: saveResult.sha256 },
        });
        break;
      }

      case 'VERIFY_FILE_EXISTS': {
        const exists = fileExists(fullPath);
        let sha256: string | undefined;
        if (exists && job.expectedSha256) {
          sha256 = sha256OfFile(fullPath);
          const hashOk = sha256.toLowerCase() === job.expectedSha256.toLowerCase();
          if (!hashOk) {
            await submitResult(config, {
              jobId:           job.id,
              success:         false,
              actualSha256:    sha256,
              resultLocalPath: fullPath,
              failedReason:    `File exists but SHA256 mismatch`,
            });
            return;
          }
        }
        await submitResult(config, {
          jobId:           job.id,
          success:         exists,
          actualSha256:    sha256,
          resultLocalPath: fullPath,
          resultPayload:   { exists },
          failedReason:    exists ? undefined : 'File does not exist',
        });
        if (exists) health.recordSuccess();
        break;
      }

      case 'VERIFY_FOLDER_EXISTS': {
        const exists = folderExists(fullPath);
        await submitResult(config, {
          jobId:         job.id,
          success:       exists,
          resultPayload: { exists, fullPath },
          failedReason:  exists ? undefined : 'Folder does not exist',
        });
        if (exists) health.recordSuccess();
        break;
      }

      case 'SAVE_TEST_FILE': {
        if (!folderExists(fullPath)) {
          await submitResult(config, {
            jobId:        job.id,
            success:      false,
            failedReason: `Target folder not found: ${fullPath}`,
          });
          return;
        }
        const now   = new Date();
        const pad2  = (n: number) => String(n).padStart(2, '0');
        const ts    = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}_${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
        const fileName = `THERMOPAC_AGENT_TEST_${ts}.pdf`;
        const destPath = path.join(fullPath, fileName);
        if (fs.existsSync(destPath)) {
          await submitResult(config, {
            jobId: job.id, success: false,
            failedReason: `File already exists: ${destPath}`,
          });
          return;
        }
        const pdfBuf = generateTestPdf(config.agentCode, now.toISOString());
        fs.writeFileSync(destPath, pdfBuf);
        const { size } = fs.statSync(destPath);
        health.recordSuccess();
        await submitResult(config, {
          jobId:           job.id,
          success:         true,
          resultLocalPath: destPath,
          resultPayload: {
            fileName,
            filePath:   destPath,
            fileSize:   size,
            createdAt:  now.toISOString(),
            pdfBase64:  pdfBuf.toString('base64'),
          },
        });
        break;
      }

      case 'LIST_DIRECTORY': {
        if (!folderExists(fullPath)) {
          await submitResult(config, {
            jobId:         job.id,
            success:       false,
            resultPayload: { entries: [], total: 0, path: fullPath },
            failedReason:  'Directory not found',
          });
          return;
        }
        const raw = fs.readdirSync(fullPath, { withFileTypes: true });
        const entries = raw.slice(0, 100).map(entry => {
          let size: number | null = null;
          let lastModified: string | null = null;
          try {
            const st = fs.statSync(path.join(fullPath, entry.name));
            size         = entry.isDirectory() ? null : st.size;
            lastModified = st.mtime.toISOString();
          } catch { /* ignore stat errors for individual entries */ }
          return { name: entry.name, isDirectory: entry.isDirectory(), size, lastModified };
        });
        health.recordSuccess();
        await submitResult(config, {
          jobId:         job.id,
          success:       true,
          resultPayload: { entries, total: raw.length, path: fullPath, truncated: raw.length > 100 },
        });
        break;
      }

      case 'HASH_VALIDATE': {
        if (!fileExists(fullPath)) throw new Error(`File not found: ${fullPath}`);
        if (!job.expectedSha256) throw new Error('expectedSha256 required for HASH_VALIDATE');

        const actual = sha256OfFile(fullPath);
        const match  = actual.toLowerCase() === job.expectedSha256.toLowerCase();
        await submitResult(config, {
          jobId:        job.id,
          success:      match,
          actualSha256: actual,
          failedReason: match ? undefined : `Hash mismatch: ${actual} vs ${job.expectedSha256}`,
        });
        if (match) health.recordSuccess();
        break;
      }

      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }
  } catch (err_) {
    const reason = err_ instanceof Error ? err_.message : String(err_);
    error(`Job #${job.id} failed: ${reason}`);
    health.recordFailure(reason);
    await submitResult(config, { jobId: job.id, success: false, failedReason: reason }).catch(() => {});
  }
}
