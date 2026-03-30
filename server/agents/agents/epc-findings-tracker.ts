import { db } from '../../db';
import { sql } from 'drizzle-orm';

export interface EpcFindingDef {
  findingCode: string;
  agentKey: string;
  severity: 'warning' | 'risk' | 'critical';
  cooldownHours: number;
  actionMode: 'alert_only' | 'task_only' | 'task_and_alert';
  graceDays: number;
  graceType: 'calendar' | 'business';
}

export const EPC_FINDING_DEFS: Record<string, EpcFindingDef> = {
  'EPC-DC3': { findingCode: 'EPC-DC3', agentKey: 'project_control', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 7, graceType: 'calendar' },
  'EPC-DC4': { findingCode: 'EPC-DC4', agentKey: 'project_control', severity: 'warning', cooldownHours: 72, actionMode: 'task_and_alert', graceDays: 3, graceType: 'business' },
  'EPC-BC4': { findingCode: 'EPC-BC4', agentKey: 'project_control', severity: 'critical', cooldownHours: 24, actionMode: 'alert_only', graceDays: 0, graceType: 'calendar' },
  'EPC-PR2': { findingCode: 'EPC-PR2', agentKey: 'project_control', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 2, graceType: 'calendar' },
  'EPC-PR3': { findingCode: 'EPC-PR3', agentKey: 'project_control', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 2, graceType: 'calendar' },
  'EPC-PE2': { findingCode: 'EPC-PE2', agentKey: 'project_control', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 7, graceType: 'calendar' },
  'EPC-PX2': { findingCode: 'EPC-PX2', agentKey: 'production_management', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 7, graceType: 'calendar' },
  'EPC-PX3': { findingCode: 'EPC-PX3', agentKey: 'production_management', severity: 'warning', cooldownHours: 72, actionMode: 'task_and_alert', graceDays: 3, graceType: 'calendar' },
  'EPC-PX4': { findingCode: 'EPC-PX4', agentKey: 'production_management', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 7, graceType: 'calendar' },
  'EPC-WP2': { findingCode: 'EPC-WP2', agentKey: 'production_management', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 3, graceType: 'calendar' },
  'EPC-QP2': { findingCode: 'EPC-QP2', agentKey: 'quality_management', severity: 'risk', cooldownHours: 48, actionMode: 'task_and_alert', graceDays: 5, graceType: 'calendar' },
  'EPC-QP4': { findingCode: 'EPC-QP4', agentKey: 'quality_management', severity: 'critical', cooldownHours: 24, actionMode: 'task_and_alert', graceDays: 2, graceType: 'calendar' },
  'EPC-BR1': { findingCode: 'EPC-BR1', agentKey: 'finance', severity: 'warning', cooldownHours: 72, actionMode: 'task_and_alert', graceDays: 7, graceType: 'calendar' },
};

export function computeBusinessDays(fromDate: Date, toDate: Date): number {
  let count = 0;
  const d = new Date(fromDate);
  while (d < toDate) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export function hasGracePassed(refDate: Date | string, def: EpcFindingDef): boolean {
  const ref = new Date(refDate);
  const now = new Date();
  if (def.graceDays === 0) return true;
  if (def.graceType === 'business') {
    return computeBusinessDays(ref, now) >= def.graceDays;
  }
  const diffMs = now.getTime() - ref.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= def.graceDays;
}

interface TrackResult {
  id: number;
  isNew: boolean;
  withinCooldown: boolean;
  status: string;
}

export async function trackFinding(opts: {
  fingerprint: string;
  findingCode: string;
  agentKey: string;
  severity: string;
  projectId?: number | null;
  projectItemId?: number | null;
  entityType?: string;
  entityId?: number;
  cooldownHours: number;
  metadata?: any;
}): Promise<TrackResult> {
  const existing = await db.execute(sql`
    SELECT id, status, last_alerted_at, last_task_created_at
    FROM epc_agent_findings
    WHERE fingerprint = ${opts.fingerprint}
    LIMIT 1
  `);
  const row = (existing.rows as any[])[0];

  if (row) {
    await db.execute(sql`
      UPDATE epc_agent_findings
      SET last_detected_at = NOW(),
          status = 'active',
          resolved_at = NULL,
          severity = ${opts.severity},
          metadata = ${JSON.stringify(opts.metadata || {})}::jsonb
      WHERE id = ${row.id}
    `);

    const lastAlert = row.last_alerted_at ? new Date(row.last_alerted_at) : null;
    const lastTask = row.last_task_created_at ? new Date(row.last_task_created_at) : null;
    const lastAction = lastAlert && lastTask
      ? (lastAlert > lastTask ? lastAlert : lastTask)
      : (lastAlert || lastTask);
    const cooldownMs = opts.cooldownHours * 60 * 60 * 1000;
    const withinCooldown = lastAction ? (Date.now() - lastAction.getTime()) < cooldownMs : false;

    return { id: Number(row.id), isNew: false, withinCooldown, status: 'active' };
  }

  const inserted = await db.execute(sql`
    INSERT INTO epc_agent_findings (fingerprint, project_id, project_item_id, finding_code, agent_key, status, severity, entity_type, entity_id, cooldown_hours, metadata)
    VALUES (${opts.fingerprint}, ${opts.projectId || null}, ${opts.projectItemId || null}, ${opts.findingCode}, ${opts.agentKey}, 'active', ${opts.severity}, ${opts.entityType || null}, ${opts.entityId || null}, ${opts.cooldownHours}, ${JSON.stringify(opts.metadata || {})}::jsonb)
    RETURNING id
  `);
  const newId = Number((inserted.rows as any[])[0]?.id || 0);
  return { id: newId, isNew: true, withinCooldown: false, status: 'active' };
}

export async function markAlerted(findingTrackId: number): Promise<void> {
  await db.execute(sql`
    UPDATE epc_agent_findings SET last_alerted_at = NOW() WHERE id = ${findingTrackId}
  `);
}

export async function markTaskCreated(findingTrackId: number): Promise<void> {
  await db.execute(sql`
    UPDATE epc_agent_findings SET last_task_created_at = NOW() WHERE id = ${findingTrackId}
  `);
}

export async function resolveFindings(opts: {
  findingCode: string;
  agentKey: string;
  sourceAgent: string;
  stillActiveFingerprints: Set<string>;
}): Promise<number> {
  let resolvedCount = 0;
  const activeRows = await db.execute(sql`
    SELECT id, fingerprint FROM epc_agent_findings
    WHERE finding_code = ${opts.findingCode}
      AND agent_key = ${opts.agentKey}
      AND status = 'active'
  `);

  for (const row of (activeRows.rows as any[])) {
    if (opts.stillActiveFingerprints.has(row.fingerprint)) continue;

    await db.execute(sql`
      UPDATE epc_agent_findings
      SET status = 'resolved', resolved_at = NOW()
      WHERE id = ${row.id}
    `);

    await db.execute(sql`
      UPDATE tasks
      SET status = 'completed', updated_at = NOW()::text
      WHERE source_type = 'agent_task'
        AND source_agent = ${opts.sourceAgent}
        AND category LIKE ${'%' + row.fingerprint + '%'}
        AND status NOT IN ('completed', 'cancelled')
    `);

    resolvedCount++;
  }
  return resolvedCount;
}
