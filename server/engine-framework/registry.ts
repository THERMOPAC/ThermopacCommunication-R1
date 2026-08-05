// ═══════════════════════════════════════════════════════════════════════════════
// Design Software — Engine Registry
//
// Central registry of all registered IDesignEngine implementations.
// Engines self-register at module load time. The service layer retrieves
// the correct engine by (moduleType, calculationType).
// ═══════════════════════════════════════════════════════════════════════════════

import { IDesignEngine } from './types';

class EngineRegistry {
  private readonly engines = new Map<string, IDesignEngine>();

  private key(moduleType: string, calculationType: string): string {
    return `${moduleType}:${calculationType}`;
  }

  /**
   * Register an engine. Called once at startup (typically from the engine's module).
   * Duplicate registration for the same (moduleType, calculationType) overwrites
   * the previous entry — useful for test overrides.
   */
  register(engine: IDesignEngine): void {
    const k = this.key(engine.getModuleType(), engine.getCalculationType());
    this.engines.set(k, engine);
    console.log(
      `[EngineRegistry] Registered ${engine.getEngineId()} v${engine.getEngineVersion()}`,
    );
  }

  /** Retrieve an engine. Returns undefined if not registered. */
  get(moduleType: string, calculationType: string): IDesignEngine | undefined {
    return this.engines.get(this.key(moduleType, calculationType));
  }

  /** Retrieve an engine or throw if not found. */
  getOrThrow(moduleType: string, calculationType: string): IDesignEngine {
    const engine = this.get(moduleType, calculationType);
    if (!engine) {
      throw new Error(
        `No engine registered for moduleType='${moduleType}' calculationType='${calculationType}'. ` +
          `Registered engines: ${this.listIds().join(', ') || '(none)'}`,
      );
    }
    return engine;
  }

  /** List all registered engine IDs. */
  listIds(): string[] {
    return [...this.engines.values()].map((e) => e.getEngineId());
  }

  /** Full inventory of registered engines. */
  listAll(): Array<{
    engineId: string;
    engineVersion: string;
    moduleType: string;
    calculationType: string;
  }> {
    return [...this.engines.values()].map((e) => ({
      engineId: e.getEngineId(),
      engineVersion: e.getEngineVersion(),
      moduleType: e.getModuleType(),
      calculationType: e.getCalculationType(),
    }));
  }
}

/** Singleton engine registry — import this wherever engines need to be looked up. */
export const engineRegistry = new EngineRegistry();
