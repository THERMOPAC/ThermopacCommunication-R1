/**
 * mirror-job-service.ts
 *
 * Utility functions for the Dual-Storage Policy mirror job lifecycle.
 * Policy: docs/dual-storage-policy-proposal-v1.0.md
 *
 * Rules:
 *  1. GCS is always written first — this service is called AFTER GCS succeeds.
 *  2. file_url is NEVER stored in DB — signed URLs are generated fresh at claim time.
 *  3. Every SAVE_FILE job carries source_module + source_record_id so the result
 *     handler can update mirror_status on the originating row.
 */

import { db } from '../db';
import { documentAgentJobs } from '@shared/schema';
import { initializeGCS } from './gcs-operations';

export interface EnqueueMirrorJobParams {
  gcsPath: string;
  sourceModule: string;
  sourceRecordId: number;
  sha256: string;
  fileName: string;
  createdBy: number | null;
}

/**
 * Enqueue a SAVE_FILE mirror job. Called after GCS upload + DB record insertion.
 * Returns the new job ID.
 */
export async function enqueueMirrorJob(params: EnqueueMirrorJobParams): Promise<number> {
  const { gcsPath, sourceModule, sourceRecordId, sha256, fileName, createdBy } = params;

  const [job] = await db.insert(documentAgentJobs).values({
    jobType:        'SAVE_FILE',
    status:         'pending',
    relativePath:   gcsPath,
    fileUrl:        null,   // Never stored — generated fresh at claim time
    fileName,
    expectedSha256: sha256,
    sourceModule,
    sourceRecordId,
    createdBy,
  }).returning();

  return job.id;
}

/**
 * Generate a fresh GCS signed URL for an agent to download a file.
 * URL is valid for 1 hour. Never stored in DB.
 */
export async function generateFreshSignedUrl(gcsPath: string): Promise<string | null> {
  try {
    const { bucket } = await initializeGCS();
    if (!bucket) {
      console.error('[mirror-job] GCS bucket not available for signed URL generation');
      return null;
    }
    const file = bucket.file(gcsPath);
    const [url] = await file.getSignedUrl({
      action:  'read',
      expires: Date.now() + 60 * 60 * 1000,  // 1 hour
    });
    return url;
  } catch (err) {
    console.error('[mirror-job] Failed to generate signed URL:', err);
    return null;
  }
}
