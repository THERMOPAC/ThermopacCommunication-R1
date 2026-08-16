// ═══════════════════════════════════════════════════════════════════════════════
// LLX — Engine Registration
//
// Import this module once at startup (from design-software-routes.ts) to
// register all three LLX engines with the global EngineRegistry.
// ═══════════════════════════════════════════════════════════════════════════════

import { engineRegistry } from '../../engine-framework/registry';
import { LLXHydraulicsEngine } from './llx-hydraulics-engine';
import { LLXECPEngine } from './llx-ecp-engine';
import { LLXECREngine } from './llx-ecr-engine';
import { LLXProcessDesignEngine } from './llx-process-design-engine';
import { LLXECRSimulatorEngine } from './llx-ecr-simulator-engine';

engineRegistry.register(new LLXHydraulicsEngine());
engineRegistry.register(new LLXECPEngine());
engineRegistry.register(new LLXECREngine());
engineRegistry.register(new LLXProcessDesignEngine());
// ECR-2 Simulator — Stage C5-S (alongside C5 ECR-1 preliminary screening)
// ECR-1 (llx-ecr-engine) is NOT modified. These are fully isolated engines.
engineRegistry.register(new LLXECRSimulatorEngine());

export { LLXHydraulicsEngine, LLXECPEngine, LLXECREngine, LLXProcessDesignEngine, LLXECRSimulatorEngine };
