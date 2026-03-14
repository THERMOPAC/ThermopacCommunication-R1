import { db } from '../../db';
import { agentActions, agentRecommendations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { auditLogger } from './audit-logger';
import { overrideChecker } from './override-checker';
import { createHash } from 'crypto';

export class ActionExecutor {
  async execute(recommendationId: number): Promise<{ success: boolean; message: string }> {
    const [rec] = await db.select()
      .from(agentRecommendations)
      .where(eq(agentRecommendations.id, recommendationId));

    if (!rec) {
      return { success: false, message: 'Recommendation not found' };
    }

    if (rec.status !== 'approved' && rec.status !== 'auto_approved') {
      return { success: false, message: `Recommendation status is ${rec.status}, not approved` };
    }

    const payload = rec.actionPayload as any;
    if (payload?.relatedEntityType && payload?.relatedEntityId) {
      const blocked = await overrideChecker.isEntityBlocked(
        payload.relatedEntityType,
        payload.relatedEntityId,
        'block_actions'
      );
      if (blocked) {
        return { success: false, message: 'Entity has an active override blocking actions' };
      }
    }

    const idempotencyKey = createHash('sha256')
      .update(`${recommendationId}|${rec.actionType}|${rec.agentKey}`)
      .digest('hex')
      .substring(0, 40);

    const existing = await db.select()
      .from(agentActions)
      .where(eq(agentActions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return { success: true, message: 'Action already executed (idempotent)' };
    }

    const [action] = await db.insert(agentActions).values({
      recommendationId,
      agentKey: rec.agentKey,
      actionCategory: rec.actionCategory,
      actionType: rec.actionType,
      actionPayload: rec.actionPayload,
      idempotencyKey,
      executionStatus: 'executing',
    }).returning();

    try {
      await auditLogger.log({
        agentKey: rec.agentKey,
        eventType: 'action.executing',
        actorType: 'agent',
        actorId: rec.agentKey,
        entityType: 'action',
        entityId: String(action.id),
        details: { actionType: rec.actionType, actionCategory: rec.actionCategory },
      });

      await db.update(agentActions).set({
        executionStatus: 'completed',
        resultMessage: 'Action logged successfully (observe-only mode)',
        executedAt: new Date(),
      }).where(eq(agentActions.id, action.id));

      await auditLogger.log({
        agentKey: rec.agentKey,
        eventType: 'action.completed',
        actorType: 'agent',
        actorId: rec.agentKey,
        entityType: 'action',
        entityId: String(action.id),
      });

      return { success: true, message: 'Action completed' };
    } catch (error: any) {
      await db.update(agentActions).set({
        executionStatus: 'failed',
        resultMessage: error.message,
        retryCount: (action.retryCount || 0) + 1,
      }).where(eq(agentActions.id, action.id));

      await auditLogger.log({
        agentKey: rec.agentKey,
        eventType: 'action.failed',
        actorType: 'agent',
        actorId: rec.agentKey,
        entityType: 'action',
        entityId: String(action.id),
        details: { error: error.message },
      });

      return { success: false, message: error.message };
    }
  }
}

export const actionExecutor = new ActionExecutor();
