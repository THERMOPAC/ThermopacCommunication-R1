// ═══════════════════════════════════════════════════════════════════════════════
// Common Engines — Registration
//
// Import this module once at startup to register the common downstream engines
// (shared across all Thermopac Design Software modules) with the global
// EngineRegistry.
// ═══════════════════════════════════════════════════════════════════════════════

import { engineRegistry } from '../../engine-framework/registry';
import { MechanicalVesselEngine } from './mechanical-vessel-engine';

engineRegistry.register(new MechanicalVesselEngine());

export { MechanicalVesselEngine };
