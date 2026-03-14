import { db } from '../../db';
import { agentAuditLog } from '@shared/schema';
import type { ActorType } from './types';

export class AuditLogger {
  async log(params: {
    agentKey?: string;
    eventType: string;
    actorType: ActorType;
    actorId: string;
    entityType?: string;
    entityId?: string;
    companyName?: string;
    details?: any;
  }): Promise<void> {
    try {
      await db.insert(agentAuditLog).values({
        agentKey: params.agentKey || null,
        eventType: params.eventType,
        actorType: params.actorType,
        actorId: params.actorId,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        companyName: params.companyName || null,
        details: params.details || {},
      });
    } catch (error) {
      console.error('[AuditLogger] Failed to write audit log:', error);
    }
  }
}

export const auditLogger = new AuditLogger();
