import { db } from '../../db';
import { sql } from 'drizzle-orm';

export async function resolveProjectManager(projectId: number): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT pm.user_id FROM project_members pm
    WHERE pm.project_id = ${projectId} AND pm.role = 'project_manager'
    LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.user_id) : null;
}

export async function resolveReportingManager(userId: number): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT reporting_manager_id FROM users WHERE id = ${userId} AND is_active = true LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row?.reporting_manager_id ? Number(row.reporting_manager_id) : null;
}

export async function resolveDepartmentHead(department: string): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT id FROM users
    WHERE department = ${department} AND is_active = true
      AND role IN ('Senior Manager', 'Manager')
    ORDER BY CASE role WHEN 'Senior Manager' THEN 1 WHEN 'Manager' THEN 2 ELSE 3 END
    LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.id) : null;
}

export async function resolveGM(): Promise<number> {
  const result = await db.execute(sql`
    SELECT id FROM users WHERE role = 'General Manager' AND is_active = true LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.id) : 2;
}

export async function resolveAssignment(
  entityOwnerId: number | null,
  projectId: number | null,
  department: string
): Promise<number> {
  if (entityOwnerId) return entityOwnerId;
  if (projectId) {
    const pm = await resolveProjectManager(projectId);
    if (pm) return pm;
  }
  const deptHead = await resolveDepartmentHead(department);
  if (deptHead) return deptHead;
  return await resolveGM();
}

export async function resolveProductionManager(): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT id FROM users
    WHERE department = 'Production' AND is_active = true
      AND role IN ('Manager', 'Senior Manager', 'Head')
    ORDER BY CASE role WHEN 'Manager' THEN 1 WHEN 'Senior Manager' THEN 2 WHEN 'Head' THEN 3 ELSE 4 END
    LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row ? Number(row.id) : null;
}

export async function resolveQCTeamLead(): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT DISTINCT reporting_manager_id FROM users
    WHERE department = 'Quality Control' AND is_active = true AND reporting_manager_id IS NOT NULL
    LIMIT 1
  `);
  const row = (result.rows as any[])[0];
  return row?.reporting_manager_id ? Number(row.reporting_manager_id) : null;
}

export function severityFromLevel(level: 'L1' | 'L2' | 'L3'): string {
  if (level === 'L3') return 'critical';
  if (level === 'L2') return 'high';
  return 'medium';
}

export function priorityFromLevel(level: 'L1' | 'L2' | 'L3'): string {
  if (level === 'L3') return 'Critical';
  if (level === 'L2') return 'High';
  return 'Medium';
}

export function fpWithProject(type: string, projectId: number | string | null, entity: string, id: string | number): string {
  const pid = projectId || 'global';
  return `[fp:pc_${type}:p${pid}:${entity}:${id}]`;
}

export function fpGlobal(type: string, entity: string, id: string | number): string {
  return `[fp:pc_${type}:${entity}:${id}]`;
}

export async function hasOpenTask(fingerprint: string, sourceAgent: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task' AND source_agent = ${sourceAgent}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status NOT IN ('completed', 'canceled')
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

export async function hasCompletedTask(fingerprint: string, sourceAgent: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task' AND source_agent = ${sourceAgent}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status = 'completed'
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

export function trendDirection(current: number, previous: number): 'improving' | 'stable' | 'declining' {
  if (previous === 0 && current === 0) return 'stable';
  if (previous === 0) return current > 0 ? 'declining' : 'improving';
  const pctChange = ((current - previous) / previous) * 100;
  if (pctChange > 15) return 'declining';
  if (pctChange < -15) return 'improving';
  return 'stable';
}

export function velocityScore(current: number, previous: number, maxScore: number = 100): number {
  if (previous === 0 && current === 0) return maxScore;
  if (previous === 0) return current > 0 ? 0 : maxScore;
  const ratio = current / previous;
  return Math.max(0, Math.min(maxScore, Math.round(maxScore * (2 - ratio))));
}
