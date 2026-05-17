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
import { AgentConfig } from './config';
import { AgentJob, submitResult } from './api-client';
import { validateRelativePath, validateExtension } from './path-guard';
import { downloadAndSave, createFolder, fileExists, folderExists } from './file-service';
import { sha256OfFile, verifyHash } from './hash-service';
import { ServiceHealth } from './service-health';
import { info, warn, error } from './logger';

const AGENT_VERSION = '1.0.0';

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

        const destPath = fullPath.endsWith(job.fileName) ? fullPath : `${fullPath}\\${job.fileName}`;
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
