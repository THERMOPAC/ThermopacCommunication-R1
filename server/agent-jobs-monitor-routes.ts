/**
 * agent-jobs-monitor-routes.ts
 *
 * Admin-only API for the Agent Jobs Monitor UI.
 *
 * GET    /api/admin/agent-jobs              — list pending/failed/stuck jobs across all 3 agents
 * POST   /api/admin/agent-jobs/:agent/:id/retry — reset failed/stuck job back to pending (Superuser only)
 * DELETE /api/admin/agent-jobs/:agent/:id   — purge a single job (Superuser only), audit-logged
 *
 * Agents:
 *   extraction  → epc_slddrw_extraction_jobs
 *   structuring → epc_structure_jobs
 *   document    → document_agent_jobs
 *
 * "Stuck" = status='claimed' AND claimed_at < NOW() - 30 min
 */

import { Router } from 'express';
import { db } from './db';
import { sql, inArray } from 'drizzle-orm';
import {
  epcSlddrwExtractionJobs,
  epcStructureJobs,
  documentAgentJobs,
  agentAuditLog,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

const STUCK_MINUTES = 30;

// ── helpers ───────────────────────────────────────────────────────────────────
function requireSuperuser(req: any, res: any): boolean {
  const user = req.user as any;
  if (!user) { res.status(401).json({ error: 'Unauthenticated' }); return false; }
  if (user.role !== 'Superuser') { res.status(403).json({ error: 'Superuser only' }); return false; }
  return true;
}

function requireAuth(req: any, res: any): boolean {
  if (!req.user) { res.status(401).json({ error: 'Unauthenticated' }); return false; }
  return true;
}

// ── GET /api/admin/agent-jobs ─────────────────────────────────────────────────
// Returns pending, failed, and stuck jobs from all 3 agent tables.
router.get('/', async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const rows = await db.execute(sql`
      SELECT
        'extraction'                              AS agent,
        'Thermopac Extraction Agent'              AS agent_name,
        j.id                                      AS id,
        j.slddrw_filename                         AS job_type,
        j.slddrw_filename                         AS reference,
        j.status                                  AS status,
        j.created_at                              AS created_at,
        j.claimed_at                              AS claimed_at,
        COALESCE(j.machine_name, j.node_id::text) AS claimed_by,
        j.retry_count                             AS retry_count,
        j.failed_reason                           AS error_message,
        (j.status = 'claimed' AND j.claimed_at < NOW() - INTERVAL '${sql.raw(STUCK_MINUTES.toString())} minutes') AS is_stuck
      FROM epc_slddrw_extraction_jobs j
      WHERE j.status IN ('pending', 'failed')
         OR (j.status = 'claimed' AND j.claimed_at < NOW() - INTERVAL '${sql.raw(STUCK_MINUTES.toString())} minutes')

      UNION ALL

      SELECT
        'structuring'                             AS agent,
        'Thermopac Drawing Structuring Agent'     AS agent_name,
        j.id                                      AS id,
        j.mode                                    AS job_type,
        j.drawing_number                          AS reference,
        j.status                                  AS status,
        j.created_at                              AS created_at,
        j.claimed_at                              AS claimed_at,
        COALESCE(j.machine_name, j.node_id::text) AS claimed_by,
        j.retry_count                             AS retry_count,
        j.failed_reason                           AS error_message,
        (j.status = 'claimed' AND j.claimed_at < NOW() - INTERVAL '${sql.raw(STUCK_MINUTES.toString())} minutes') AS is_stuck
      FROM epc_structure_jobs j
      WHERE j.status IN ('pending', 'failed')
         OR (j.status = 'claimed' AND j.claimed_at < NOW() - INTERVAL '${sql.raw(STUCK_MINUTES.toString())} minutes')

      UNION ALL

      SELECT
        'document'                                AS agent,
        'Thermopac Local Windows Document Agent'  AS agent_name,
        j.id                                      AS id,
        j.job_type                                AS job_type,
        COALESCE(j.file_name, j.relative_path)   AS reference,
        j.status                                  AS status,
        j.created_at                              AS created_at,
        j.claimed_at                              AS claimed_at,
        j.agent_code                              AS claimed_by,
        j.retry_count                             AS retry_count,
        j.failed_reason                           AS error_message,
        (j.status = 'claimed' AND j.claimed_at < NOW() - INTERVAL '${sql.raw(STUCK_MINUTES.toString())} minutes') AS is_stuck
      FROM document_agent_jobs j
      WHERE j.status IN ('pending', 'failed', 'permanently_failed')
         OR (j.status = 'claimed' AND j.claimed_at < NOW() - INTERVAL '${sql.raw(STUCK_MINUTES.toString())} minutes')

      ORDER BY created_at DESC
    `);

    res.json({ jobs: rows.rows });
  } catch (err: any) {
    console.error('[agent-jobs-monitor] GET error:', err);
    res.status(500).json({ error: 'Failed to load agent jobs' });
  }
});

// ── DELETE /api/admin/agent-jobs/:agent/:id — purge a job (Superuser only) ───
router.delete('/:agent/:id', async (req, res) => {
  if (!requireSuperuser(req, res)) return;

  const user = req.user as any;
  const agentKey = req.params.agent as 'extraction' | 'structuring' | 'document';
  const jobId = parseInt(req.params.id, 10);

  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });
  if (!['extraction', 'structuring', 'document'].includes(agentKey)) {
    return res.status(400).json({ error: 'Invalid agent key' });
  }

  try {
    let oldStatus: string | null = null;
    let reference: string | null = null;

    if (agentKey === 'extraction') {
      const [job] = await db
        .select({ status: epcSlddrwExtractionJobs.status, ref: epcSlddrwExtractionJobs.slddrwFilename })
        .from(epcSlddrwExtractionJobs)
        .where(eq(epcSlddrwExtractionJobs.id, jobId));
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status === 'completed') return res.status(400).json({ error: 'Cannot purge a completed job' });
      oldStatus = job.status;
      reference = job.ref;
      await db.delete(epcSlddrwExtractionJobs).where(eq(epcSlddrwExtractionJobs.id, jobId));

    } else if (agentKey === 'structuring') {
      const [job] = await db
        .select({ status: epcStructureJobs.status, ref: epcStructureJobs.drawingNumber })
        .from(epcStructureJobs)
        .where(eq(epcStructureJobs.id, jobId));
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status === 'completed') return res.status(400).json({ error: 'Cannot purge a completed job' });
      oldStatus = job.status;
      reference = job.ref;
      await db.delete(epcStructureJobs).where(eq(epcStructureJobs.id, jobId));

    } else {
      const [job] = await db
        .select({ status: documentAgentJobs.status, ref: documentAgentJobs.fileName })
        .from(documentAgentJobs)
        .where(eq(documentAgentJobs.id, jobId));
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status === 'completed') return res.status(400).json({ error: 'Cannot purge a completed job' });
      oldStatus = job.status;
      reference = job.ref;
      await db.delete(documentAgentJobs).where(eq(documentAgentJobs.id, jobId));
    }

    // Write audit log
    await db.insert(agentAuditLog).values({
      agentKey,
      eventType: 'job_purged',
      actorType: 'user',
      actorId: String(user.id ?? user.username ?? 'unknown'),
      entityType: 'agent_job',
      entityId: String(jobId),
      details: JSON.stringify({
        agent: agentKey,
        jobId,
        oldStatus,
        reference,
        purgedBy: user.username,
        purgedAt: new Date().toISOString(),
      }),
    });

    res.json({ ok: true, purged: { agent: agentKey, id: jobId, wasStatus: oldStatus } });
  } catch (err: any) {
    console.error('[agent-jobs-monitor] DELETE error:', err);
    res.status(500).json({ error: 'Failed to purge job' });
  }
});

// ── POST /api/admin/agent-jobs/:agent/:id/retry — reset to pending (Superuser) ─
router.post('/:agent/:id/retry', async (req, res) => {
  if (!requireSuperuser(req, res)) return;

  const user = req.user as any;
  const agentKey = req.params.agent as 'extraction' | 'structuring' | 'document';
  const jobId = parseInt(req.params.id, 10);

  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });
  if (!['extraction', 'structuring', 'document'].includes(agentKey)) {
    return res.status(400).json({ error: 'Invalid agent key' });
  }

  try {
    let oldStatus: string | null = null;
    let reference: string | null = null;

    if (agentKey === 'extraction') {
      const [job] = await db
        .select({ status: epcSlddrwExtractionJobs.status, ref: epcSlddrwExtractionJobs.slddrwFilename })
        .from(epcSlddrwExtractionJobs)
        .where(eq(epcSlddrwExtractionJobs.id, jobId));
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status === 'completed') return res.status(400).json({ error: 'Cannot retry a completed job' });
      oldStatus = job.status; reference = job.ref;
      await db.execute(sql`
        UPDATE epc_slddrw_extraction_jobs
        SET status = 'pending', claimed_at = NULL, failed_reason = NULL,
            retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = ${jobId}
      `);

    } else if (agentKey === 'structuring') {
      const [job] = await db
        .select({ status: epcStructureJobs.status, ref: epcStructureJobs.drawingNumber })
        .from(epcStructureJobs)
        .where(eq(epcStructureJobs.id, jobId));
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status === 'completed') return res.status(400).json({ error: 'Cannot retry a completed job' });
      oldStatus = job.status; reference = job.ref;
      await db.execute(sql`
        UPDATE epc_structure_jobs
        SET status = 'pending', claimed_at = NULL, failed_reason = NULL,
            retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = ${jobId}
      `);

    } else {
      const [job] = await db
        .select({ status: documentAgentJobs.status, ref: documentAgentJobs.fileName })
        .from(documentAgentJobs)
        .where(eq(documentAgentJobs.id, jobId));
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status === 'completed') return res.status(400).json({ error: 'Cannot retry a completed job' });
      oldStatus = job.status; reference = job.ref;
      await db.execute(sql`
        UPDATE document_agent_jobs
        SET status = 'pending', agent_code = NULL, claimed_at = NULL, failed_reason = NULL,
            retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = ${jobId}
      `);
    }

    await db.insert(agentAuditLog).values({
      agentKey,
      eventType: 'job_retried',
      actorType: 'user',
      actorId: String(user.id ?? user.username ?? 'unknown'),
      entityType: 'agent_job',
      entityId: String(jobId),
      details: JSON.stringify({
        agent: agentKey, jobId, oldStatus, reference,
        retriedBy: user.username, retriedAt: new Date().toISOString(),
      }),
    });

    res.json({ ok: true, retried: { agent: agentKey, id: jobId, wasStatus: oldStatus } });
  } catch (err: any) {
    console.error('[agent-jobs-monitor] retry error:', err);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

export default router;
