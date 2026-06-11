/**
 * mirror-health-routes.ts
 *
 * Mirror Health Dashboard API — Document Control › Mirror Health
 * Policy: docs/dual-storage-policy-proposal-v1.0.md
 *
 * Routes:
 *   GET  /api/mirror-health/summary         — KPI counts by status + module
 *   GET  /api/mirror-health/jobs            — paginated job list (filters: status, module)
 *   POST /api/mirror-health/jobs/:id/retry  — re-enqueue a failed mirror job
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from './db';

const router = Router();

function requireSession(req: Request, res: Response, next: NextFunction) {
  if ((req as any).isAuthenticated?.()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ── GET /api/mirror-health/summary ────────────────────────────────────────────

router.get('/mirror-health/summary', requireSession, async (_req: Request, res: Response) => {
  try {
    const totalsResult = await pool.query(`
      SELECT status, COUNT(*)::int AS cnt
      FROM document_agent_jobs
      WHERE job_type = 'SAVE_FILE' AND status != 'dismissed'
      GROUP BY status
    `);

    const byModuleResult = await pool.query(`
      SELECT
        COALESCE(source_module, 'unknown') AS module,
        status,
        COUNT(*)::int AS cnt
      FROM document_agent_jobs
      WHERE job_type = 'SAVE_FILE' AND status != 'dismissed'
      GROUP BY source_module, status
      ORDER BY source_module, status
    `);

    const totals: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const row of totalsResult.rows) {
      totals[row.status as string] = row.cnt as number;
    }

    const moduleMap: Record<string, Record<string, number>> = {};
    for (const row of byModuleResult.rows) {
      const mod = row.module as string;
      if (!moduleMap[mod]) moduleMap[mod] = {};
      moduleMap[mod][row.status as string] = row.cnt as number;
    }
    const byModule = Object.entries(moduleMap).map(([module, counts]) => ({
      module,
      pending:    counts['pending']    ?? 0,
      processing: counts['processing'] ?? 0,
      completed:  counts['completed']  ?? 0,
      failed:     counts['failed']     ?? 0,
    }));

    res.json({ totals, byModule });
  } catch (err: any) {
    console.error('[mirror-health] summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ── GET /api/mirror-health/jobs ───────────────────────────────────────────────

router.get('/mirror-health/jobs', requireSession, async (req: Request, res: Response) => {
  try {
    const statusFilter = (req.query.status as string) || null;
    const moduleFilter = (req.query.module as string) || null;
    const page         = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit        = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset       = (page - 1) * limit;

    const conditions: string[] = ["j.job_type = 'SAVE_FILE'", "j.status != 'dismissed'"];
    const params: any[]        = [];

    if (statusFilter) { params.push(statusFilter); conditions.push(`j.status = $${params.length}`); }
    if (moduleFilter) { params.push(moduleFilter); conditions.push(`j.source_module = $${params.length}`); }

    const where = conditions.join(' AND ');

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM document_agent_jobs j WHERE ${where}`,
      params,
    );
    const total = countRes.rows[0].total as number;

    params.push(limit, offset);
    const jobsRes = await pool.query(
      `SELECT j.*, TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS created_by_name
       FROM document_agent_jobs j
       LEFT JOIN users u ON u.id = j.created_by
       WHERE ${where}
       ORDER BY j.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ jobs: jobsRes.rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    console.error('[mirror-health] jobs list error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// ── POST /api/mirror-health/jobs/clear-failed ─────────────────────────────────
// Superuser-only: mark all failed mirror jobs as 'dismissed' so they vanish
// from the default view. Records are never deleted (immutability policy).

router.post('/mirror-health/jobs/clear-failed', requireSession, async (req: Request, res: Response) => {
  const role = (req as any).user?.role ?? '';
  if (role !== 'Superuser') {
    return res.status(403).json({ error: 'Only Superuser can clear failed mirror jobs' });
  }
  try {
    const result = await pool.query(
      `UPDATE document_agent_jobs
       SET status = 'dismissed'
       WHERE job_type = 'SAVE_FILE' AND status = 'failed'
       RETURNING id`,
    );
    res.json({ ok: true, cleared: result.rowCount ?? 0 });
  } catch (err: any) {
    console.error('[mirror-health] clear-failed error:', err);
    res.status(500).json({ error: 'Failed to clear jobs' });
  }
});

// ── POST /api/mirror-health/jobs/:id/retry ────────────────────────────────────

router.post('/mirror-health/jobs/:id/retry', requireSession, async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params.id, 10);
  const userId = (req as any).user?.id   ?? null;
  const role   = (req as any).user?.role ?? '';

  try {
    const jobRes = await pool.query(`SELECT * FROM document_agent_jobs WHERE id = $1`, [jobId]);
    if (!jobRes.rows.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRes.rows[0];

    if (job.job_type !== 'SAVE_FILE') {
      return res.status(400).json({ error: 'Only SAVE_FILE (mirror) jobs can be retried here' });
    }
    if (job.status !== 'failed') {
      return res.status(409).json({ error: `Job status is '${job.status}' — only failed jobs can be retried` });
    }

    const isSuperuser = role === 'Superuser';
    const isOwner     = userId !== null && job.created_by === userId;
    if (!isSuperuser && !isOwner) {
      return res.status(403).json({ error: 'Only the original uploader or Superuser may retry a mirror job' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newJobRes = await client.query(
        `INSERT INTO document_agent_jobs
           (job_type, status, relative_path, file_url, file_name, expected_sha256,
            source_module, source_record_id, created_by)
         VALUES ('SAVE_FILE', 'pending', $1, NULL, $2, $3, $4, $5, $6)
         RETURNING *`,
        [job.relative_path, job.file_name, job.expected_sha256,
         job.source_module, job.source_record_id, userId],
      );
      const newJob = newJobRes.rows[0];

      if (job.source_module === 'company_documents' && job.source_record_id) {
        await client.query(
          `UPDATE company_documents
           SET mirror_status = 'pending', mirror_job_id = $1
           WHERE id = $2`,
          [newJob.id, job.source_record_id],
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true, newJob });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[mirror-health] retry error:', err);
    res.status(500).json({ error: 'Retry failed' });
  }
});

export default router;
