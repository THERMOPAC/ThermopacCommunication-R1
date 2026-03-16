import { db } from '../../db';
import { sql } from 'drizzle-orm';

export type EscalationLevel = 'L1' | 'L2' | 'L3';

let cachedGmId: number | null = null;
let cachedSuperuserId: number | null = null;

async function getGmId(): Promise<number> {
  if (cachedGmId) return cachedGmId;
  const result = await db.execute(sql`
    SELECT id FROM users WHERE role = 'General Manager' AND is_active = true LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  cachedGmId = row ? Number(row.id) : 2;
  return cachedGmId;
}

async function getSuperuserId(): Promise<number> {
  if (cachedSuperuserId) return cachedSuperuserId;
  const result = await db.execute(sql`
    SELECT id FROM users WHERE role = 'Superuser' AND is_active = true ORDER BY id LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  cachedSuperuserId = row ? Number(row.id) : 1;
  return cachedSuperuserId;
}

async function getReportingManager(userId: number): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT reporting_manager_id FROM users WHERE id = ${userId} AND is_active = true LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row?.reporting_manager_id ? Number(row.reporting_manager_id) : null;
}

export async function resolveEscalation(
  level: EscalationLevel,
  entityOwnerId: number | null,
): Promise<number> {
  const gmId = await getGmId();
  const superuserId = await getSuperuserId();

  if (level === 'L1') {
    if (entityOwnerId) return entityOwnerId;
    return gmId;
  }

  if (level === 'L2') {
    if (entityOwnerId) {
      const mgr = await getReportingManager(entityOwnerId);
      if (mgr) return mgr;
    }
    return gmId;
  }

  if (level === 'L3') {
    if (entityOwnerId) {
      const mgr = await getReportingManager(entityOwnerId);
      if (mgr) {
        const mgrOfMgr = await getReportingManager(mgr);
        if (mgrOfMgr) return mgrOfMgr;
        return mgr;
      }
    }
    return gmId;
  }

  return superuserId;
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
  cachedGmId = null;
  cachedSuperuserId = null;
}
