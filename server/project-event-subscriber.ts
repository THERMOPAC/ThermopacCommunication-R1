import { agentEventBus } from './agents/framework/event-bus';
import { db } from './db';
import { projectWorkflowEvents } from '@shared/schema';
import type { AgentEvent } from './agents/framework/types';

async function logProjectEvent(event: AgentEvent): Promise<void> {
  try {
    const projectId = event.payload?.projectId;
    if (!projectId) {
      console.error('[ProjectEventSubscriber] Missing projectId in event payload:', event.name);
      return;
    }

    await db.insert(projectWorkflowEvents).values({
      projectId,
      eventName: event.name,
      eventPayload: event.payload,
      emittedBy: event.source,
      emittedAt: event.timestamp,
      processed: false,
    });

    console.log(`[ProjectEventSubscriber] Logged event: ${event.name} for projectId=${projectId}`);
  } catch (err) {
    console.error(`[ProjectEventSubscriber] Failed to log event ${event.name}:`, err);
  }
}

export function registerProjectEventSubscribers(): void {
  agentEventBus.subscribe('project.created', logProjectEvent);
  agentEventBus.subscribe('project.status_changed', logProjectEvent);
  console.log('[ProjectEventSubscriber] Registered subscribers for project.created, project.status_changed');
}
