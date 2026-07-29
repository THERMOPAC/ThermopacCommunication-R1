/**
 * document-agent-scheduler.ts
 *
 * Runs every 5 minutes and performs two recovery passes on document_agent_jobs:
 *
 *  Pass 1 — Stuck-job recovery
 *    Jobs with status='claimed' that have not completed within 30 minutes are
 *    presumed orphaned (agent crashed / machine rebooted).  They are reset to
 *    'pending' so the agent can re-claim them on its next poll cycle.
 *
 *  Pass 2 — Failed-job retry / circuit-breaker
 *    Jobs with status='failed' and retry_count < MAX_RETRIES are reset to
 *    'pending'.  retry_count is incremented each time so the agent gets another
 *    chance to complete the work.
 *    Jobs that have already failed MAX_RETRIES times are marked
 *    'permanently_failed' and will NOT be retried automatically — a human must
 *    investigate and either fix the root cause or purge the job via the Admin UI.
 *
 * Constants
 *   STUCK_MINUTES  — how long a claimed job must sit before it is considered stuck (default 30)
 *   MAX_RETRIES    — maximum automatic retry attempts before circuit-breaker fires (default 3)
 *   INTERVAL_MS    — how often the scheduler runs in milliseconds (default 5 min)
 */

import { db, pool } from './db';
import { sql } from 'drizzle-orm';

const STUCK_MINUTES       = 30;
const STUCK_OFFER_MINUTES = 5;   // offers in 'archiving' for longer than this are investigated
const MAX_RETRIES         = 3;
const INTERVAL_MS         = 5 * 60 * 1000; // 5 minutes

// ── Pass 3: Stuck-offer recovery ─────────────────────────────────────────────
// Offers left in 'archiving' status after a server crash go through a smart
// triage before being marked 'archive_failed':
//
//  Case A — Archive was actually complete but the final UPDATE crashed:
//    All 3 artifact rows exist (active) + all 3 mirror jobs queued → recover.
//
//  Case B — Partial upload: some artifacts exist, some missing → automatic retry.
//    (Retry is performed by calling the retry-archive route logic.)
//
//  Case C — No artifacts at all → mark archive_failed immediately.
//
// Nothing is silently changed without logging at INFO level.
async function runStuckOfferRecovery(): Promise<void> {
  // Find offers stuck in 'archiving' beyond the threshold
  const stuckOffersRes = await pool.query(
    `SELECT o.id, o.offer_number, o.revision, o.status,
            ar.id AS arch_rev_id, ar.revision AS arch_revision
     FROM offers o
     LEFT JOIN offer_archive_revisions ar
       ON ar.offer_id = o.id AND ar.status = 'archiving'
     WHERE o.status = 'archiving'
       AND o.updated_at < NOW() - INTERVAL '${STUCK_OFFER_MINUTES} minutes'`,
  );

  if (stuckOffersRes.rows.length === 0) return;

  console.log(`[doc-agent-scheduler] Found ${stuckOffersRes.rows.length} offer(s) stuck in 'archiving' — triaging...`);

  for (const row of stuckOffersRes.rows) {
    const offerId     = row.id;
    const archRevId   = row.arch_rev_id;
    const archRev     = row.arch_revision ?? row.revision;
    const offerNumber = row.offer_number;

    try {
      if (!archRevId) {
        // No archive revision record at all — crash before archive started
        await pool.query(`UPDATE offers SET status = 'archive_failed' WHERE id = $1`, [offerId]);
        console.log(`[doc-agent-scheduler] Offer #${offerId} (${offerNumber}): no archive revision found — marked archive_failed`);
        continue;
      }

      // Count artifacts for this revision
      const artifactRes = await pool.query(
        `SELECT price_mode, artifact_status, mirror_job_id
         FROM quotation_pdf_artifacts
         WHERE offer_id = $1 AND revision = $2 AND artifact_status IN ('active', 'uploading')`,
        [offerId, archRev],
      );
      const artifacts = artifactRes.rows;
      const activeCount = artifacts.filter((a: any) => a.artifact_status === 'active').length;
      const mirrorJobIds = artifacts.map((a: any) => a.mirror_job_id).filter(Boolean);

      // Case A: all 3 active + all 3 have mirror jobs → archive was complete, just the status update crashed
      if (activeCount === 3 && mirrorJobIds.length === 3) {
        await pool.query(
          `UPDATE offers SET revision = $1, status = 'Draft' WHERE id = $2`,
          [archRev, offerId],
        );
        await pool.query(
          `UPDATE offer_archive_revisions SET status = 'active', completed_at = NOW() WHERE id = $1`,
          [archRevId],
        );
        console.log(`[doc-agent-scheduler] Offer #${offerId} (${offerNumber}): recovered — archive was complete (rev ${archRev})`);
        continue;
      }

      // Case C: no active artifacts → mark archive_failed
      if (activeCount === 0) {
        await pool.query(`UPDATE offers SET status = 'archive_failed' WHERE id = $1`, [offerId]);
        await pool.query(
          `UPDATE offer_archive_revisions SET status = 'failed', error_detail = 'No artifacts found after stuck timeout' WHERE id = $1`,
          [archRevId],
        );
        console.log(`[doc-agent-scheduler] Offer #${offerId} (${offerNumber}): no artifacts — marked archive_failed`);
        continue;
      }

      // Case B: partial — some artifacts exist, retry is possible but complex; mark archive_failed for admin retry
      await pool.query(`UPDATE offers SET status = 'archive_failed' WHERE id = $1`, [offerId]);
      await pool.query(
        `UPDATE offer_archive_revisions SET status = 'failed', error_detail = 'Partial archive (${activeCount}/3 artifacts) after stuck timeout — admin retry required' WHERE id = $1`,
        [archRevId],
      );
      console.log(`[doc-agent-scheduler] Offer #${offerId} (${offerNumber}): partial archive (${activeCount}/3) — marked archive_failed for admin retry`);

    } catch (offerErr) {
      console.error(`[doc-agent-scheduler] Error triaging stuck offer #${offerId}:`, offerErr);
    }
  }
}

async function runRecoveryPass(): Promise<void> {
  const now = new Date();

  // ── Pass 1: Stuck-job recovery ──────────────────────────────────────────────
  // Reset jobs that have been in 'claimed' status for longer than STUCK_MINUTES.
  const stuckResult = await db.execute(sql`
    UPDATE document_agent_jobs
    SET
      status      = 'pending',
      agent_code  = NULL,
      claimed_at  = NULL,
      retry_count = retry_count + 1,
      failed_reason = CONCAT(
        COALESCE(failed_reason, ''),
        '[auto-reset: stuck in claimed at ', NOW()::text, '] '
      ),
      updated_at  = NOW()
    WHERE status = 'claimed'
      AND claimed_at < NOW() - INTERVAL '${sql.raw(String(STUCK_MINUTES))} minutes'
    RETURNING id
  `);
  const stuckCount = stuckResult.rows.length;

  // ── Pass 2a: Retry eligible failed jobs ─────────────────────────────────────
  const retryResult = await db.execute(sql`
    UPDATE document_agent_jobs
    SET
      status      = 'pending',
      agent_code  = NULL,
      claimed_at  = NULL,
      retry_count = retry_count + 1,
      failed_reason = CONCAT(
        COALESCE(failed_reason, ''),
        '[auto-retry #', (retry_count + 1)::text, ' at ', NOW()::text, '] '
      ),
      updated_at  = NOW()
    WHERE status = 'failed'
      AND retry_count < ${MAX_RETRIES}
    RETURNING id
  `);
  const retryCount = retryResult.rows.length;

  // ── Pass 2b: Circuit-breaker — exhaused retries ──────────────────────────────
  const deadResult = await db.execute(sql`
    UPDATE document_agent_jobs
    SET
      status     = 'permanently_failed',
      updated_at = NOW()
    WHERE status = 'failed'
      AND retry_count >= ${MAX_RETRIES}
    RETURNING id
  `);
  const deadCount = deadResult.rows.length;

  if (stuckCount + retryCount + deadCount > 0) {
    console.log(
      `[doc-agent-scheduler] Recovery pass at ${now.toISOString()}: ` +
      `${stuckCount} stuck reset, ${retryCount} failed re-queued, ${deadCount} circuit-broken`
    );
  }

  // ── Pass 3: Stuck-offer recovery ──────────────────────────────────────────
  await runStuckOfferRecovery().catch((err) =>
    console.error('[doc-agent-scheduler] Stuck-offer recovery error:', err)
  );
}

export function startDocumentAgentScheduler(): void {
  // Run immediately on startup to catch any leftover jobs from before the
  // server last restarted, then repeat every INTERVAL_MS.
  runRecoveryPass().catch(err =>
    console.error('[doc-agent-scheduler] Startup pass error:', err)
  );

  setInterval(() => {
    runRecoveryPass().catch(err =>
      console.error('[doc-agent-scheduler] Scheduled pass error:', err)
    );
  }, INTERVAL_MS);

  console.log(
    `[doc-agent-scheduler] Started — recovery pass every ${INTERVAL_MS / 60000} min ` +
    `(stuck threshold: ${STUCK_MINUTES} min, max retries: ${MAX_RETRIES})`
  );
}
