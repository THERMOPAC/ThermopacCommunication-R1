import { db } from '../../db';
import { sql } from 'drizzle-orm';

export type EscalationLevel = 'L1' | 'L2' | 'L3';

async function getReportingManager(userId: number): Promise<number | null> {
  if (!userId || isNaN(userId)) return null;
  const result = await db.execute(sql`
    SELECT reporting_manager_id FROM users WHERE id = ${userId} AND is_active = true LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  if (!row || !row.reporting_manager_id) return null;
  return Number(row.reporting_manager_id);
}

export async function resolveEscalation(
  level: EscalationLevel,
  entityOwnerId: number | null,
): Promise<number | null> {
  if (!entityOwnerId) return null;
  const ownerId = entityOwnerId;

  if (level === 'L1') {
    return ownerId;
  }

  if (level === 'L2') {
    const mgr = await getReportingManager(ownerId);
    return mgr ?? ownerId;
  }

  const mgr = await getReportingManager(ownerId);
  if (!mgr) return ownerId;
  const mgrMgr = await getReportingManager(mgr);
  return mgrMgr ?? mgr;
}

export function severityToLevel(severity: string): EscalationLevel {
  if (severity === 'critical') return 'L3';
  if (severity === 'high' || severity === 'risk') return 'L2';
  return 'L1';
}

export function levelToSeverity(level: EscalationLevel): string {
  if (level === 'L3') return 'critical';
  if (level === 'L2') return 'high';
  return 'medium';
}

export function levelToPriority(level: EscalationLevel): string {
  if (level === 'L3') return 'Critical';
  if (level === 'L2') return 'High';
  return 'Medium';
}

export function clearEscalationCache(): void {
  // no-op — kept for backward compatibility
}
