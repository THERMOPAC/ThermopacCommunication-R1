import { db } from '../../db';
import { agentRuns } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { auditLogger } from './audit-logger';
import type { TriggerType } from './types';

export class RunManager {
  async startRun(params: {
    agentKey: string;
    triggerType: TriggerType;
    triggerDetail: string;
    companyScope?: string;
    locationScope?: string;
  }): Promise<number> {
    const [run] = await db.insert(agentRuns).values({
      agentKey: params.agentKey,
      triggerType: params.triggerType,
      triggerDetail: params.triggerDetail,
      companyScope: params.companyScope || 'ALL',
      locationScope: params.locationScope || 'ALL',
      status: 'running',
    }).returning();

    await auditLogger.log({
      agentKey: params.agentKey,
      eventType: 'run.started',
      actorType: params.triggerType === 'manual' ? 'user' : 'scheduler',
      actorId: params.agentKey,
      entityType: 'run',
      entityId: String(run.id),
      details: { triggerType: params.triggerType, triggerDetail: params.triggerDetail },
    });

    return run.id;
  }

  async completeRun(runId: number, result: {
    findingsCount: number;
    insightsCount: number;
    recommendationsCount: number;
    executionMetadata: any;
  }): Promise<void> {
    const [run] = await db.update(agentRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        findingsCount: result.findingsCount,
        insightsCount: result.insightsCount,
        recommendationsCount: result.recommendationsCount,
        executionMetadata: result.executionMetadata,
      })
      .where(eq(agentRuns.id, runId))
      .returning();

    if (run) {
      await auditLogger.log({
        agentKey: run.agentKey,
        eventType: 'run.completed',
        actorType: 'agent',
        actorId: run.agentKey,
        entityType: 'run',
        entityId: String(runId),
        details: result,
      });
    }
  }

  async failRun(runId: number, errorMessage: string): Promise<void> {
    const [run] = await db.update(agentRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(agentRuns.id, runId))
      .returning();

    if (run) {
      await auditLogger.log({
        agentKey: run.agentKey,
        eventType: 'run.failed',
        actorType: 'agent',
        actorId: run.agentKey,
        entityType: 'run',
        entityId: String(runId),
        details: { errorMessage },
      });
    }
  }
}

export const runManager = new RunManager();
