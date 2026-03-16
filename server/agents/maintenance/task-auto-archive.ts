import { db } from '../../db';
import { sql } from 'drizzle-orm';

export async function runTaskAutoArchive(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE tasks
    SET is_archived = true,
        archived_at = NOW()
    WHERE status = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at::timestamp < NOW() - INTERVAL '30 days'
      AND is_archived = false
  `);

  const archivedCount = result.rowCount ?? 0;
  console.log(`[TaskAutoArchive] ${new Date().toISOString()} — Archived ${archivedCount} completed tasks (older than 30 days).`);
  return archivedCount;
}

function cronToNextRunDelay(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function scheduleTaskAutoArchive(): void {
  const initialDelay = cronToNextRunDelay(3, 0);

  console.log(`[TaskAutoArchive] Scheduled to run daily at 03:00 AM. First run in ${Math.round(initialDelay / 60000)} minutes.`);

  setTimeout(() => {
    runTaskAutoArchive().catch(err =>
      console.error('[TaskAutoArchive] Error during scheduled run:', err.message)
    );

    setInterval(() => {
      runTaskAutoArchive().catch(err =>
        console.error('[TaskAutoArchive] Error during scheduled run:', err.message)
      );
    }, ONE_DAY_MS);
  }, initialDelay);
}
