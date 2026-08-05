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

engineRegistry.register(new LLXHydraulicsEngine());
engineRegistry.register(new LLXECPEngine());
engineRegistry.register(new LLXECREngine());

export { LLXHydraulicsEngine, LLXECPEngine, LLXECREngine };
