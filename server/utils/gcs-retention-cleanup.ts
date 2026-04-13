import { db } from '../db';
import { gcsObjectDeletions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import gcsClient, { bucketName } from './storage-config';

export interface RetentionCleanupResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: { id: number; path: string; error: string }[];
}

/**
 * Execute pending GCS object deletions.
 * Only processes records in 'pending' status that have passed their scheduledFor time
 * (or have no scheduledFor, meaning they are immediately eligible).
 * Must be triggered by admin action — no automatic scheduled runs.
 */
export async function executePendingDeletions(
  requestingUserId: number
): Promise<RetentionCleanupResult> {
  const now = new Date();

  const rows = (await db.select()
    .from(gcsObjectDeletions)
    .where(eq(gcsObjectDeletions.status, 'pending'))) as typeof gcsObjectDeletions.$inferSelect[];

  const eligible = rows.filter(r => !r.scheduledFor || r.scheduledFor <= now);

  const result: RetentionCleanupResult = {
    processed: eligible.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  const bucket = gcsClient.bucket(bucketName);

  for (const record of eligible) {
    try {
      const file = bucket.file(record.gcsObjectPath);
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      }
      await db.update(gcsObjectDeletions)
        .set({ status: 'completed', executedAt: new Date() })
        .where(eq(gcsObjectDeletions.id, record.id));
      result.succeeded++;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      await db.update(gcsObjectDeletions)
        .set({ status: 'failed', errorMessage: errorMsg })
        .where(eq(gcsObjectDeletions.id, record.id));
      result.failed++;
      result.errors.push({ id: record.id, path: record.gcsObjectPath, error: errorMsg });
    }
  }

  return result;
}

/**
 * Schedule a GCS object for deletion (creates a pending record).
 * Actual deletion only happens when executePendingDeletions() is called by admin.
 */
export async function scheduleGcsDeletion(opts: {
  gcsObjectPath: string;
  deletionReason: string;
  deletionPolicy: string;
  requestedBy?: number;
  scheduledFor?: Date;
  documentType?: string;
  documentNumber?: string;
  projectId?: number;
}): Promise<number> {
  const [record] = await db.insert(gcsObjectDeletions).values({
    gcsBucket: bucketName,
    gcsObjectPath: opts.gcsObjectPath,
    deletionReason: opts.deletionReason,
    deletionPolicy: opts.deletionPolicy,
    requestedBy: opts.requestedBy,
    status: 'pending',
    scheduledFor: opts.scheduledFor,
    documentType: opts.documentType,
    documentNumber: opts.documentNumber,
    projectId: opts.projectId,
  }).returning();
  return record.id;
}

/**
 * Register admin retention cleanup API endpoints.
 */
export function registerRetentionRoutes(app: any, ensureAuthenticated: any, requireRole: (maxRole: number) => any) {
  app.get('/api/admin/gcs-retention/pending', ensureAuthenticated, requireRole(2), async (req: any, res: any) => {
    try {
      const rows = await db.select().from(gcsObjectDeletions)
        .where(eq(gcsObjectDeletions.status, 'pending'));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/gcs-retention/execute', ensureAuthenticated, requireRole(1), async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const result = await executePendingDeletions(userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/gcs-retention/log', ensureAuthenticated, requireRole(2), async (req: any, res: any) => {
    try {
      const rows = await db.select().from(gcsObjectDeletions)
        .orderBy(gcsObjectDeletions.createdAt);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/gcs-retention/schedule', ensureAuthenticated, requireRole(1), async (req: any, res: any) => {
    try {
      const { gcsObjectPath, deletionReason, deletionPolicy, scheduledFor, documentType, documentNumber, projectId } = req.body;
      if (!gcsObjectPath || !deletionReason || !deletionPolicy) {
        return res.status(400).json({ error: 'gcsObjectPath, deletionReason, and deletionPolicy are required' });
      }
      const id = await scheduleGcsDeletion({
        gcsObjectPath,
        deletionReason,
        deletionPolicy,
        requestedBy: req.user?.id,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        documentType,
        documentNumber,
        projectId,
      });
      res.status(201).json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
