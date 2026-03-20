import { db } from '../../db';
import { agentInsights } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import { createHash } from 'crypto';
import { auditLogger } from './audit-logger';
import type { CreateInsightParams } from './types';

export class InsightManager {
  private runId: number;
  private agentKey: string;

  constructor(runId: number, agentKey: string) {
    this.runId = runId;
    this.agentKey = agentKey;
  }

  private generateInsightFingerprint(params: CreateInsightParams): string {
    const raw = `${this.agentKey}:${params.insightType}:${params.title}:${params.scopePeriod || ''}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  async createInsight(params: CreateInsightParams): Promise<{ id: number; isDuplicate: boolean }> {
    const fingerprint = this.generateInsightFingerprint(params);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await db.select({ id: agentInsights.id })
      .from(agentInsights)
      .where(
        and(
          eq(agentInsights.agentKey, this.agentKey),
          eq(agentInsights.insightType, params.insightType),
          eq(agentInsights.title, params.title),
          gt(agentInsights.createdAt, today)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return { id: existing[0].id, isDuplicate: true };
    }

    const [insight] = await db.insert(agentInsights).values({
      runId: this.runId,
      agentKey: this.agentKey,
      findingIds: params.findingIds,
      insightType: params.insightType,
      title: params.title,
      content: params.content,
      logicType: params.logicType,
      dataSources: params.dataSources,
      companyName: params.companyName || null,
      scopePeriod: params.scopePeriod || null,
      metadata: params.metadata || {},
      status: 'active',
    }).returning();

    await auditLogger.log({
      agentKey: this.agentKey,
      eventType: 'insight.created',
      actorType: 'agent',
      actorId: this.agentKey,
      entityType: 'insight',
      entityId: String(insight.id),
      companyName: params.companyName,
      details: { insightType: params.insightType, title: params.title },
    });

    return { id: insight.id };
  }
}
