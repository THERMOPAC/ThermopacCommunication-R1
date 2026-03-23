import { db } from '../../db';
import { agentRegistry, agentRuns } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { runManager } from './run-manager';
import { FindingManager } from './finding-manager';
import { InsightManager } from './insight-manager';
import { RecommendationManager } from './recommendation-manager';
import { auditLogger } from './audit-logger';
import { agentEventBus } from './event-bus';
import type { IAgent, AgentRunContext, TriggerType } from './types';

class Orchestrator {
  private agents: Map<string, IAgent> = new Map();
  private runningAgents: Set<string> = new Set();
  private triggerLocks: Set<string> = new Set();
  private schedulerIntervals: Map<string, NodeJS.Timeout> = new Map();

  registerAgent(agent: IAgent): void {
    this.agents.set(agent.key, agent);
    console.log(`[Orchestrator] Registered agent: ${agent.key} (${agent.displayName})`);

    const events = agent.getSubscribedEvents();
    for (const eventName of events) {
      agentEventBus.subscribe(eventName, async (event) => {
        if (agent.handleEvent) {
          await agent.handleEvent(event);
        }
      });
    }
  }

  async triggerAgent(
    agentKey: string,
    triggerType: TriggerType,
    triggerDetail: string,
    companyScope: string = 'ALL',
    locationScope: string = 'ALL'
  ): Promise<{ runId: number; result: any } | { error: string }> {
    if (this.triggerLocks.has(agentKey)) {
      console.log(`[Orchestrator] Skipping duplicate trigger for ${agentKey} — trigger already in progress.`);
      return { error: `Agent ${agentKey} trigger already in progress` };
    }
    this.triggerLocks.add(agentKey);

    try {
      return await this._executeTrigger(agentKey, triggerType, triggerDetail, companyScope, locationScope);
    } finally {
      this.triggerLocks.delete(agentKey);
    }
  }

  private async _executeTrigger(
    agentKey: string,
    triggerType: TriggerType,
    triggerDetail: string,
    companyScope: string,
    locationScope: string
  ): Promise<{ runId: number; result: any } | { error: string }> {
    const agent = this.agents.get(agentKey);
    if (!agent) {
      return { error: `Agent ${agentKey} not registered` };
    }

    const registryEntry = await db.select()
      .from(agentRegistry)
      .where(eq(agentRegistry.agentKey, agentKey))
      .limit(1);

    if (registryEntry.length > 0) {
      const entry = registryEntry[0];
      if (!entry.isEnabled) {
        return { error: `Agent ${agentKey} is disabled` };
      }
      if (entry.isSuspended) {
        return { error: `Agent ${agentKey} is suspended: ${entry.suspendedReason}` };
      }
    }

    if (this.runningAgents.has(agentKey)) {
      console.log(`[Orchestrator] Skipping ${agentKey} — already running.`);
      return { error: `Agent ${agentKey} is already running (conflict control)` };
    }

    this.runningAgents.add(agentKey);
    const startTime = Date.now();
    let runId: number | null = null;

    try {
      runId = await runManager.startRun({
        agentKey,
        triggerType,
        triggerDetail,
        companyScope,
        locationScope,
      });

      const config = registryEntry[0]?.config || {};

      const context: AgentRunContext = {
        runId,
        agentKey,
        triggerType,
        triggerDetail,
        companyScope,
        locationScope,
        config: config as Record<string, any>,
      };

      const result = await agent.execute(context);

      await runManager.completeRun(runId, {
        findingsCount: result.findingsCount,
        insightsCount: result.insightsCount,
        recommendationsCount: result.recommendationsCount,
        executionMetadata: result.executionMetadata,
      });

      agentEventBus.emit('agent.run.completed', {
        agentKey,
        runId,
        findingsCount: result.findingsCount,
        durationMs: Date.now() - startTime,
      }, 'orchestrator');

      return { runId, result };
    } catch (error: any) {
      console.error(`[Orchestrator] Agent ${agentKey} failed:`, error);

      if (runId) {
        try {
          await runManager.failRun(runId, error.message || 'Unknown error');
        } catch (failErr: any) {
          console.error(`[Orchestrator] Failed to mark run ${runId} as failed:`, failErr.message);
        }
      }

      await auditLogger.log({
        agentKey,
        eventType: 'run.failed',
        actorType: 'system',
        actorId: 'orchestrator',
        details: { error: error.message, runId },
      });

      return { error: error.message };
    } finally {
      this.runningAgents.delete(agentKey);
    }
  }

  async suspendAgent(agentKey: string, userId: number, reason: string): Promise<void> {
    await db.update(agentRegistry).set({
      isSuspended: true,
      suspendedBy: userId,
      suspendedReason: reason,
      suspendedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(agentRegistry.agentKey, agentKey));

    const interval = this.schedulerIntervals.get(agentKey);
    if (interval) {
      clearInterval(interval);
      this.schedulerIntervals.delete(agentKey);
    }

    await auditLogger.log({
      agentKey,
      eventType: 'agent.suspended',
      actorType: 'user',
      actorId: String(userId),
      details: { reason },
    });
  }

  async resumeAgent(agentKey: string, userId: number): Promise<void> {
    await db.update(agentRegistry).set({
      isSuspended: false,
      suspendedBy: null,
      suspendedReason: null,
      suspendedAt: null,
      updatedAt: new Date(),
    }).where(eq(agentRegistry.agentKey, agentKey));

    await auditLogger.log({
      agentKey,
      eventType: 'agent.resumed',
      actorType: 'user',
      actorId: String(userId),
    });
  }

  async enableAgent(agentKey: string, userId: number): Promise<void> {
    await db.update(agentRegistry).set({
      isEnabled: true,
      updatedAt: new Date(),
    }).where(eq(agentRegistry.agentKey, agentKey));

    await auditLogger.log({
      agentKey,
      eventType: 'agent.enabled',
      actorType: 'user',
      actorId: String(userId),
    });
  }

  async disableAgent(agentKey: string, userId: number): Promise<void> {
    await db.update(agentRegistry).set({
      isEnabled: false,
      updatedAt: new Date(),
    }).where(eq(agentRegistry.agentKey, agentKey));

    const interval = this.schedulerIntervals.get(agentKey);
    if (interval) {
      clearInterval(interval);
      this.schedulerIntervals.delete(agentKey);
    }

    await auditLogger.log({
      agentKey,
      eventType: 'agent.disabled',
      actorType: 'user',
      actorId: String(userId),
    });
  }

  getRegisteredAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  isAgentRunning(agentKey: string): boolean {
    return this.runningAgents.has(agentKey);
  }
}

export const orchestrator = new Orchestrator();
