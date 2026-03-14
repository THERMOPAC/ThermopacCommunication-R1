import { db } from '../../db';
import { agentInsights } from '@shared/schema';
import { auditLogger } from './audit-logger';
import type { CreateInsightParams } from './types';

export class InsightManager {
  private runId: number;
  private agentKey: string;

  constructor(runId: number, agentKey: string) {
    this.runId = runId;
    this.agentKey = agentKey;
  }

  async createInsight(params: CreateInsightParams): Promise<{ id: number }> {
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
      metadata: {},
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
