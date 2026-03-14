import { db } from '../../db';
import { agentRegistry } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { orchestrator } from './orchestrator';
import { auditLogger } from './audit-logger';

interface ScheduleEntry {
  agentKey: string;
  cronExpression: string;
  lastRunAt?: Date;
  interval?: NodeJS.Timeout;
}

class AgentScheduler {
  private schedules: Map<string, ScheduleEntry> = new Map();
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const agents = await db.select({
      agentKey: agentRegistry.agentKey,
      defaultSchedule: agentRegistry.defaultSchedule,
      isEnabled: agentRegistry.isEnabled,
      isSuspended: agentRegistry.isSuspended,
      config: agentRegistry.config,
    }).from(agentRegistry);

    for (const agent of agents) {
      if (!agent.isEnabled || agent.isSuspended) continue;
      const config = (agent.config as any) || {};
      const schedule = config.schedule || agent.defaultSchedule || '0 8 * * *';
      this.registerSchedule(agent.agentKey, schedule);
    }

    console.log(`[Scheduler] Started with ${this.schedules.size} scheduled agents.`);
  }

  private registerSchedule(agentKey: string, cronExpression: string): void {
    const intervalMs = this.cronToIntervalMs(cronExpression);
    const nextRunDelay = this.calculateNextRunDelay(cronExpression);

    const entry: ScheduleEntry = {
      agentKey,
      cronExpression,
    };

    const startSchedule = () => {
      entry.interval = setInterval(async () => {
        await this.executeScheduledRun(agentKey);
      }, intervalMs);
    };

    setTimeout(() => {
      this.executeScheduledRun(agentKey);
      startSchedule();
    }, nextRunDelay);

    this.schedules.set(agentKey, entry);
    console.log(`[Scheduler] Registered ${agentKey} with cron '${cronExpression}' (next in ${Math.round(nextRunDelay / 60000)}min, then every ${Math.round(intervalMs / 3600000)}h)`);
  }

  private async executeScheduledRun(agentKey: string): Promise<void> {
    try {
      const [agent] = await db.select({
        isEnabled: agentRegistry.isEnabled,
        isSuspended: agentRegistry.isSuspended,
      }).from(agentRegistry).where(eq(agentRegistry.agentKey, agentKey)).limit(1);

      if (!agent?.isEnabled || agent?.isSuspended) {
        console.log(`[Scheduler] Skipping ${agentKey} — disabled or suspended.`);
        return;
      }

      console.log(`[Scheduler] Triggering scheduled run for ${agentKey}...`);
      const result = await orchestrator.triggerAgent(
        agentKey,
        'scheduler',
        `Scheduled run at ${new Date().toISOString()}`
      );

      await auditLogger.log({
        agentKey,
        eventType: 'scheduler.triggered',
        actorType: 'scheduler',
        actorId: 'agent-scheduler',
        details: { result: 'error' in result ? result.error : `Run ${(result as any).runId} completed` },
      });
    } catch (error: any) {
      console.error(`[Scheduler] Failed to run ${agentKey}:`, error.message);
    }
  }

  private cronToIntervalMs(cron: string): number {
    const parts = cron.split(' ');
    if (parts.length < 5) return 24 * 60 * 60 * 1000;

    const dayOfWeek = parts[4];
    if (dayOfWeek === '1') return 7 * 24 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
  }

  private calculateNextRunDelay(cron: string): number {
    const parts = cron.split(' ');
    const minute = parseInt(parts[0]) || 0;
    const hour = parseInt(parts[1]) || 8;
    const dayOfWeek = parts.length >= 5 ? parts[4] : '*';

    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);

    if (dayOfWeek !== '*') {
      const targetDay = parseInt(dayOfWeek);
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (daysUntil === 0 && now >= target) daysUntil = 7;
      target.setDate(target.getDate() + daysUntil);
    } else if (now >= target) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  stop(): void {
    for (const [key, entry] of this.schedules.entries()) {
      if (entry.interval) clearInterval(entry.interval);
    }
    this.schedules.clear();
    this.started = false;
    console.log('[Scheduler] All schedules stopped.');
  }

  getSchedules(): Array<{ agentKey: string; cronExpression: string }> {
    return Array.from(this.schedules.values()).map(s => ({
      agentKey: s.agentKey,
      cronExpression: s.cronExpression,
    }));
  }

  async updateSchedule(agentKey: string, newCron: string): Promise<void> {
    const existing = this.schedules.get(agentKey);
    if (existing?.interval) {
      clearInterval(existing.interval);
    }
    this.registerSchedule(agentKey, newCron);

    const rows = await db.select({ config: agentRegistry.config })
      .from(agentRegistry)
      .where(eq(agentRegistry.agentKey, agentKey))
      .limit(1);
    const current = (rows[0]?.config as any) || {};
    await db.update(agentRegistry).set({
      config: { ...current, schedule: newCron },
    }).where(eq(agentRegistry.agentKey, agentKey));
  }
}

export const agentScheduler = new AgentScheduler();
