import { db } from '../../db';
import { agentActions, agentRecommendations, tasks, internalMessages } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { auditLogger } from './audit-logger';
import { overrideChecker } from './override-checker';
import { createHash } from 'crypto';

const AGENT_USER_ID = 0;
const AGENT_USER_NAME = 'AI Agent System';

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

      let resultMessage = 'Action completed';
      let resultData: any = {};

      switch (rec.actionCategory) {
        case 'task_creation':
          const taskResult = await this.handleTaskCreation(payload);
          resultMessage = taskResult.message;
          resultData = taskResult.data;
          break;

        case 'notification':
          const notifResult = await this.handleNotification(payload);
          resultMessage = notifResult.message;
          resultData = notifResult.data;
          break;

        case 'escalation':
          const escResult = await this.handleEscalation(payload);
          resultMessage = escResult.message;
          resultData = escResult.data;
          break;

        case 'report_generation':
          resultMessage = 'Report generated as agent insight';
          resultData = { insightId: payload.insightId };
          break;

        default:
          resultMessage = `Action category '${rec.actionCategory}' executed (logged)`;
      }

      await db.update(agentActions).set({
        executionStatus: 'completed',
        resultMessage,
        resultData,
        executedAt: new Date(),
      }).where(eq(agentActions.id, action.id));

      await auditLogger.log({
        agentKey: rec.agentKey,
        eventType: 'action.completed',
        actorType: 'agent',
        actorId: rec.agentKey,
        entityType: 'action',
        entityId: String(action.id),
        details: { resultMessage, resultData },
      });

      return { success: true, message: resultMessage };
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

  private async handleTaskCreation(payload: any): Promise<{ message: string; data: any }> {
    const dupCheck = await db.execute(sql`
      SELECT id FROM tasks 
      WHERE source_type = ${payload.sourceType || 'llm_insight'}
        AND source_id = ${payload.sourceId || 0}
        AND status NOT IN ('completed','cancelled')
      LIMIT 1
    `);

    if ((dupCheck.rows || []).length > 0) {
      return { message: 'Task already exists for this entity (duplicate prevented)', data: { existingTaskId: (dupCheck.rows as any[])[0].id } };
    }

    const [newTask] = await db.insert(tasks).values({
      title: payload.title,
      description: payload.description || '',
      status: 'pending',
      priority: payload.priority || 'Medium',
      startDate: new Date().toISOString().split('T')[0],
      finishDate: payload.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dueDate: payload.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      assignedTo: payload.assignedTo || null,
      createdBy: AGENT_USER_ID,
      createdAt: new Date().toISOString(),
      category: payload.category || 'Agent Action',
      sourceType: payload.sourceType || 'llm_insight',
      sourceId: payload.sourceId || null,
    }).returning();

    return {
      message: `Task created: "${payload.title}" (ID: ${newTask.id})`,
      data: { taskId: newTask.id, title: payload.title },
    };
  }

  private async handleNotification(payload: any): Promise<{ message: string; data: any }> {
    const targets = payload.targets || [];
    let sent = 0;

    for (const target of targets) {
      await db.insert(internalMessages).values({
        senderId: AGENT_USER_ID,
        senderName: AGENT_USER_NAME,
        recipientId: target.userId,
        recipientName: target.userName || 'Unknown',
        subject: `[Agent Alert] ${payload.subject || 'Notification'}`,
        content: payload.content || payload.description || 'Agent notification',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      sent++;
    }

    return {
      message: `Notification sent to ${sent} recipient(s)`,
      data: { sentCount: sent },
    };
  }

  private async handleEscalation(payload: any): Promise<{ message: string; data: any }> {
    const targets = payload.escalationTargets || [];
    let sent = 0;

    for (const target of targets) {
      await db.insert(internalMessages).values({
        senderId: AGENT_USER_ID,
        senderName: AGENT_USER_NAME,
        recipientId: target.userId,
        recipientName: target.userName || 'Unknown',
        subject: `[ESCALATION] ${payload.subject || 'Escalation Alert'}`,
        content: payload.content || 'This issue has been escalated and requires your attention.',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      sent++;
    }

    return {
      message: `Escalation sent to ${sent} manager(s)`,
      data: { escalatedTo: sent },
    };
  }
}

export const actionExecutor = new ActionExecutor();
