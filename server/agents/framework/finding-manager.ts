import { db } from '../../db';
import { agentFindings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createHash } from 'crypto';
import { auditLogger } from './audit-logger';
import { overrideChecker } from './override-checker';
import type { CreateFindingParams } from './types';

export class FindingManager {
  private runId: number;
  private agentKey: string;

  constructor(runId: number, agentKey: string) {
    this.runId = runId;
    this.agentKey = agentKey;
  }

  async createFinding(params: CreateFindingParams): Promise<{ id: number; isDuplicate: boolean }> {
    if (params.relatedEntityType && params.relatedEntityId) {
      const blocked = await overrideChecker.isEntityBlocked(
        params.relatedEntityType,
        params.relatedEntityId,
        'mute_findings'
      );
      if (blocked) {
        return { id: 0, isDuplicate: false };
      }
    }

    const fingerprint = this.generateFingerprint(params);

    const existing = await db.select({ id: agentFindings.id, status: agentFindings.status })
      .from(agentFindings)
      .where(eq(agentFindings.fingerprint, fingerprint))
      .limit(1);

    if (existing.length > 0) {
      const existingFinding = existing[0];
      if (existingFinding.status === 'snoozed') {
        const full = await db.select({ snoozedUntil: agentFindings.snoozedUntil })
          .from(agentFindings)
          .where(eq(agentFindings.id, existingFinding.id))
          .limit(1);
        if (full[0]?.snoozedUntil && new Date(full[0].snoozedUntil) > new Date()) {
          return { id: existingFinding.id, isDuplicate: true };
        }
      }
      if (['open', 'acknowledged', 'in_progress', 'snoozed'].includes(existingFinding.status!)) {
        return { id: existingFinding.id, isDuplicate: true };
      }
    }

    const [finding] = await db.insert(agentFindings).values({
      runId: this.runId,
      agentKey: this.agentKey,
      fingerprint,
      findingType: params.findingType,
      severity: params.severity,
      title: params.title,
      description: params.description,
      logicType: params.logicType,
      dataSnapshot: params.dataSnapshot || null,
      relatedEntityType: params.relatedEntityType || null,
      relatedEntityId: params.relatedEntityId || null,
      companyName: params.companyName || null,
      location: params.location || null,
      status: 'open',
    }).returning();

    await auditLogger.log({
      agentKey: this.agentKey,
      eventType: 'finding.created',
      actorType: 'agent',
      actorId: this.agentKey,
      entityType: 'finding',
      entityId: String(finding.id),
      companyName: params.companyName,
      details: { findingType: params.findingType, severity: params.severity, title: params.title },
    });

    return { id: finding.id, isDuplicate: false };
  }

  private generateFingerprint(params: CreateFindingParams): string {
    const dateBucket = new Date().toISOString().split('T')[0];
    const raw = `${this.agentKey}|${params.findingType}|${params.relatedEntityType || ''}|${params.relatedEntityId || ''}|${dateBucket}|${params.title}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 40);
  }

  static async updateStatus(findingId: number, status: string, userId?: number, reason?: string): Promise<void> {
    const updates: any = { status, updatedAt: new Date() };
    if (status === 'dismissed') {
      updates.dismissedBy = userId;
      updates.dismissedReason = reason;
      updates.dismissedAt = new Date();
    }
    if (status === 'snoozed') {
      updates.snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    await db.update(agentFindings).set(updates).where(eq(agentFindings.id, findingId));

    const [finding] = await db.select({ agentKey: agentFindings.agentKey })
      .from(agentFindings)
      .where(eq(agentFindings.id, findingId));

    await auditLogger.log({
      agentKey: finding?.agentKey,
      eventType: `finding.${status === 'dismissed' ? 'dismissed' : status === 'snoozed' ? 'snoozed' : 'acknowledged'}`,
      actorType: 'user',
      actorId: String(userId || 'system'),
      entityType: 'finding',
      entityId: String(findingId),
      details: { newStatus: status, reason },
    });
  }

  static async assignFinding(findingId: number, assignedTo: number, assignedBy: number): Promise<void> {
    await db.update(agentFindings).set({
      assignedTo,
      assignedBy,
      assignedAt: new Date(),
      status: 'acknowledged',
      updatedAt: new Date(),
    }).where(eq(agentFindings.id, findingId));

    await auditLogger.log({
      eventType: 'finding.assigned',
      actorType: 'user',
      actorId: String(assignedBy),
      entityType: 'finding',
      entityId: String(findingId),
      details: { assignedTo },
    });
  }
}
