import type { AgentEvent } from './types';

type EventHandler = (event: AgentEvent) => Promise<void>;

class AgentEventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private eventLog: AgentEvent[] = [];
  private maxLogSize = 1000;

  emit(eventName: string, payload: Record<string, any>, source: string = 'system'): void {
    const event: AgentEvent = {
      name: eventName,
      payload,
      timestamp: new Date(),
      source,
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-500);
    }

    const handlers = this.handlers.get(eventName) || [];
    const wildcardHandlers = this.getWildcardHandlers(eventName);
    const allHandlers = [...handlers, ...wildcardHandlers];

    for (const handler of allHandlers) {
      handler(event).catch(err => {
        console.error(`[EventBus] Handler error for event ${eventName}:`, err);
      });
    }
  }

  subscribe(eventPattern: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventPattern) || [];
    existing.push(handler);
    this.handlers.set(eventPattern, existing);
  }

  unsubscribe(eventPattern: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventPattern) || [];
    this.handlers.set(eventPattern, existing.filter(h => h !== handler));
  }

  getRecentEvents(limit: number = 50): AgentEvent[] {
    return this.eventLog.slice(-limit);
  }

  private getWildcardHandlers(eventName: string): EventHandler[] {
    const result: EventHandler[] = [];
    for (const [pattern, handlers] of this.handlers.entries()) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (eventName.startsWith(prefix + '.')) {
          result.push(...handlers);
        }
      }
    }
    return result;
  }
}

export const agentEventBus = new AgentEventBus();
