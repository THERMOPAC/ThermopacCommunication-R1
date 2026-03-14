import { db } from '../../db';
import { agentRecommendations } from '@shared/schema';
import { auditLogger } from './audit-logger';
import { policyEngine } from './policy-engine';
import type { CreateRecommendationParams } from './types';
import { eq } from 'drizzle-orm';

export class RecommendationManager {
  private runId: number;
  private agentKey: string;

  constructor(runId: number, agentKey: string) {
    this.runId = runId;
    this.agentKey = agentKey;
  }

  async createRecommendation(params: CreateRecommendationParams): Promise<{ id: number; autoApproved: boolean }> {
    const policyResult = await policyEngine.checkPolicy(
      this.agentKey,
      params.actionCategory,
      params.actionType
    );

    if (!policyResult.allowed) {
      return { id: 0, autoApproved: false };
    }

    const requiresApproval = policyResult.approvalMode === 'require_approval';
    const status = policyResult.approvalMode === 'auto' ? 'auto_approved' : 'pending_review';

    const [rec] = await db.insert(agentRecommendations).values({
      findingId: params.findingId || null,
      insightId: params.insightId || null,
      agentKey: this.agentKey,
      actionCategory: params.actionCategory,
      actionType: params.actionType,
      title: params.title,
      description: params.description,
      actionPayload: params.actionPayload,
      logicType: params.logicType,
      confidence: String(params.confidence),
      priority: params.priority || 'normal',
      companyName: params.companyName || null,
      status,
      requiresApproval,
      assignedTo: params.assignTo || null,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    }).returning();

    await auditLogger.log({
      agentKey: this.agentKey,
      eventType: 'recommendation.created',
      actorType: 'agent',
      actorId: this.agentKey,
      entityType: 'recommendation',
      entityId: String(rec.id),
      companyName: params.companyName,
      details: {
        actionCategory: params.actionCategory,
        actionType: params.actionType,
        title: params.title,
        status,
        requiresApproval,
      },
    });

    return { id: rec.id, autoApproved: status === 'auto_approved' };
  }

  static async approveRecommendation(recommendationId: number, userId: number): Promise<void> {
    await db.update(agentRecommendations).set({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(agentRecommendations.id, recommendationId));

    await auditLogger.log({
      eventType: 'recommendation.approved',
      actorType: 'user',
      actorId: String(userId),
      entityType: 'recommendation',
      entityId: String(recommendationId),
    });
  }

  static async rejectRecommendation(recommendationId: number, userId: number, reason: string): Promise<void> {
    await db.update(agentRecommendations).set({
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: new Date(),
    }).where(eq(agentRecommendations.id, recommendationId));

    await auditLogger.log({
      eventType: 'recommendation.rejected',
      actorType: 'user',
      actorId: String(userId),
      entityType: 'recommendation',
      entityId: String(recommendationId),
      details: { reason },
    });
  }
}
