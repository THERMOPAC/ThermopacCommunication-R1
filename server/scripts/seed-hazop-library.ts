/**
 * seed-hazop-library.ts
 * ─────────────────────
 * One-time idempotent seed for hazop_deviation_library.
 * Uses INSERT ... ON CONFLICT DO NOTHING (idempotent).
 * Governed by: docs/hazop-phase1-execution-plan-v1.0.md §9
 *
 * Run via: tsx server/scripts/seed-hazop-library.ts
 * Or called from setupHazopRoutes() startup seed.
 */

import { pool } from '../db';

interface LibraryEntry {
  equipment_category: string;
  guideword: string;
  parameter: string;
  applicable: boolean;
  deviation_description: string;
  typical_causes: string[];
  typical_consequences: string[];
  typical_safeguards: string[];
  typical_actions: string[];
}

const LIBRARY: LibraryEntry[] = [
  // ── PUMP ─────────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Pump',
    guideword: 'No',
    parameter: 'Flow',
    applicable: true,
    deviation_description: 'No flow through pump',
    typical_causes: ['Pump failure', 'Suction valve closed', 'Blocked suction line', 'Loss of power'],
    typical_consequences: ['Process interruption', 'Downstream equipment starvation', 'Overheating of pump'],
    typical_safeguards: ['Low flow alarm', 'Flow transmitter', 'Motor protection relay'],
    typical_actions: ['Verify pump seal suitability for dry running', 'Install low flow cutout'],
  },
  {
    equipment_category: 'Pump',
    guideword: 'More',
    parameter: 'Flow',
    applicable: true,
    deviation_description: 'High flow through pump',
    typical_causes: ['Downstream valve failed open', 'Bypass valve open', 'Pump speed too high (VFD)'],
    typical_consequences: ['Overloading downstream equipment', 'Cavitation', 'Seal damage'],
    typical_safeguards: ['High flow alarm', 'Pressure relief valve on discharge'],
    typical_actions: ['Review VFD upper limit', 'Install high flow interlock'],
  },
  {
    equipment_category: 'Pump',
    guideword: 'Less',
    parameter: 'Flow',
    applicable: true,
    deviation_description: 'Reduced flow through pump',
    typical_causes: ['Partial blockage in suction', 'Increased system resistance', 'Worn impeller'],
    typical_consequences: ['Reduced process throughput', 'Heating of fluid'],
    typical_safeguards: ['Low flow alarm', 'Differential pressure indicator'],
    typical_actions: ['Schedule impeller inspection interval', 'Monitor suction pressure trend'],
  },
  {
    equipment_category: 'Pump',
    guideword: 'Reverse',
    parameter: 'Flow',
    applicable: true,
    deviation_description: 'Reverse flow through pump',
    typical_causes: ['Check valve failure', 'Pump trip with discharge valve open', 'Pressure surge'],
    typical_consequences: ['Pump damage', 'Back-flow into supply tank', 'Equipment damage upstream'],
    typical_safeguards: ['Check valve', 'Non-return valve'],
    typical_actions: ['Verify check valve rated for reverse pressure', 'Install anti-reverse rotation device'],
  },
  {
    equipment_category: 'Pump',
    guideword: 'More',
    parameter: 'Pressure',
    applicable: true,
    deviation_description: 'High discharge pressure',
    typical_causes: ['Downstream valve closed', 'Blockage in discharge line', 'System resistance increase'],
    typical_consequences: ['Pipe/fitting failure', 'Seal failure', 'Pump damage'],
    typical_safeguards: ['Pressure relief valve', 'High pressure alarm/trip'],
    typical_actions: ['Confirm PRV set pressure and capacity', 'Review pipe design pressure'],
  },
  {
    equipment_category: 'Pump',
    guideword: 'Less',
    parameter: 'Pressure',
    applicable: true,
    deviation_description: 'Low suction pressure',
    typical_causes: ['Supply tank low level', 'Suction valve partially closed', 'Vaporisation of fluid'],
    typical_consequences: ['Cavitation', 'Pump damage', 'No flow'],
    typical_safeguards: ['Low suction pressure alarm', 'Low level alarm on supply tank'],
    typical_actions: ['Define NPSH margin requirement', 'Install low pressure interlock'],
  },

  // ── HEAT EXCHANGER ────────────────────────────────────────────────────────────
  {
    equipment_category: 'Heat Exchanger',
    guideword: 'No',
    parameter: 'Flow',
    applicable: true,
    deviation_description: 'No flow through shell or tube side',
    typical_causes: ['Inlet valve closed', 'Pump failure', 'Tube blockage'],
    typical_consequences: ['Loss of heat transfer', 'Overheating of process fluid', 'Tube damage'],
    typical_safeguards: ['Flow indicator', 'Temperature alarm on outlet'],
    typical_actions: ['Define minimum flow requirement for both sides'],
  },
  {
    equipment_category: 'Heat Exchanger',
    guideword: 'More',
    parameter: 'Temperature',
    applicable: true,
    deviation_description: 'High process temperature at outlet',
    typical_causes: ['Cooling medium flow failure', 'High inlet temperature', 'Fouling on cooling side'],
    typical_consequences: ['Fluid degradation', 'Downstream equipment damage', 'Safety relief actuation'],
    typical_safeguards: ['High temperature alarm', 'Safety relief valve'],
    typical_actions: ['Set high temperature alarm setpoint', 'Implement fouling monitoring programme'],
  },
  {
    equipment_category: 'Heat Exchanger',
    guideword: 'Less',
    parameter: 'Temperature',
    applicable: true,
    deviation_description: 'Low outlet temperature',
    typical_causes: ['Excess cooling medium flow', 'Low inlet temperature', 'Process flow too low'],
    typical_consequences: ['Viscosity increase', 'Downstream process upset', 'Freezing risk'],
    typical_safeguards: ['Low temperature alarm', 'Temperature controller'],
    typical_actions: ['Confirm low temperature limit for process fluid'],
  },
  {
    equipment_category: 'Heat Exchanger',
    guideword: 'Other Than',
    parameter: 'Composition',
    applicable: true,
    deviation_description: 'Tube leak — cross contamination between shell and tube',
    typical_causes: ['Tube corrosion', 'Mechanical damage', 'Thermal fatigue'],
    typical_consequences: ['Product contamination', 'Utility fluid ingress into process', 'Environmental release'],
    typical_safeguards: ['Differential pressure monitoring', 'Regular tube inspection'],
    typical_actions: ['Define tube inspection interval', 'Review material selection for compatibility'],
  },

  // ── VESSEL / TANK ─────────────────────────────────────────────────────────────
  {
    equipment_category: 'Vessel',
    guideword: 'More',
    parameter: 'Level',
    applicable: true,
    deviation_description: 'High level in vessel',
    typical_causes: ['Inlet flow greater than outlet', 'Outlet valve/pump failure', 'Level instrument failure'],
    typical_consequences: ['Overflow', 'Carry-over to downstream equipment', 'Structural overload'],
    typical_safeguards: ['High level alarm', 'High-high level trip', 'Overflow nozzle'],
    typical_actions: ['Verify HH level trip is independent of HA alarm', 'Confirm overflow drain size'],
  },
  {
    equipment_category: 'Vessel',
    guideword: 'Less',
    parameter: 'Level',
    applicable: true,
    deviation_description: 'Low level in vessel',
    typical_causes: ['Inlet flow less than outlet', 'Leakage from vessel', 'Drain valve open'],
    typical_consequences: ['Pump cavitation', 'Process interruption', 'Gas ingress to liquid system'],
    typical_safeguards: ['Low level alarm', 'Low-low level pump trip'],
    typical_actions: ['Set LL level trip above vortex-forming level'],
  },
  {
    equipment_category: 'Vessel',
    guideword: 'More',
    parameter: 'Pressure',
    applicable: true,
    deviation_description: 'High pressure in vessel',
    typical_causes: ['Blocked outlet', 'Uncontrolled reaction', 'External heat source', 'Relief valve stuck closed'],
    typical_consequences: ['Vessel overpressure', 'Rupture', 'Catastrophic release'],
    typical_safeguards: ['Pressure relief valve', 'High pressure alarm', 'Rupture disc'],
    typical_actions: ['Verify PRV sizing for maximum credible case', 'Confirm relief path is unobstructed'],
  },
  {
    equipment_category: 'Vessel',
    guideword: 'Less',
    parameter: 'Pressure',
    applicable: true,
    deviation_description: 'Low pressure / vacuum in vessel',
    typical_causes: ['Rapid draining', 'Loss of inert blanket', 'Blocked vent'],
    typical_consequences: ['Vessel collapse', 'Air ingress', 'Implosion'],
    typical_safeguards: ['Vacuum breaker', 'Low pressure alarm', 'Pressure indicator'],
    typical_actions: ['Confirm vessel designed for full vacuum', 'Install vacuum breaker if not full vacuum rated'],
  },

  // ── CONTROL VALVE ─────────────────────────────────────────────────────────────
  {
    equipment_category: 'Control Valve',
    guideword: 'More',
    parameter: 'Flow',
    applicable: true,
    deviation_description: 'Valve fails open — more flow than intended',
    typical_causes: ['Actuator failure', 'Instrument air failure (fail-open valve)', 'Positioner failure'],
    typical_consequences: ['Downstream flooding', 'Overpressure downstream', 'Product loss'],
    typical_safeguards: ['Manual isolation valve', 'High flow alarm'],
    typical_actions: ['Confirm fail-safe position (FO/FC) is appropriate for process', 'Install manual bypass'],
  },
  {
    equipment_category: 'Control Valve',
    guideword: 'No',
    parameter: 'Flow',
    applicable: true,
    deviation_description: 'Valve fails closed — no flow',
    typical_causes: ['Actuator failure', 'Instrument air failure (fail-closed valve)', 'Positioner failure'],
    typical_consequences: ['Process starvation', 'Pump deadhead', 'Process shutdown'],
    typical_safeguards: ['Low flow alarm', 'Bypass valve'],
    typical_actions: ['Confirm fail-safe position is appropriate for process', 'Define bypass operating procedure'],
  },
];

export async function seedHazopDeviationLibrary(): Promise<void> {
  const client = await pool.connect();
  try {
    let inserted = 0;
    let skipped = 0;

    for (const entry of LIBRARY) {
      const result = await client.query(`
        INSERT INTO hazop_deviation_library (
          equipment_category, guideword, parameter, applicable,
          deviation_description, typical_causes, typical_consequences,
          typical_safeguards, typical_actions, version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)
        ON CONFLICT (equipment_category, guideword, parameter) DO NOTHING
      `, [
        entry.equipment_category,
        entry.guideword,
        entry.parameter,
        entry.applicable,
        entry.deviation_description,
        JSON.stringify(entry.typical_causes),
        JSON.stringify(entry.typical_consequences),
        JSON.stringify(entry.typical_safeguards),
        JSON.stringify(entry.typical_actions),
      ]);
      if ((result.rowCount ?? 0) > 0) inserted++;
      else skipped++;
    }

    console.log(`[HAZOP Seed] Deviation library: ${inserted} inserted, ${skipped} already existed`);
  } finally {
    client.release();
  }
}

// Allow direct execution
if (process.argv[1]?.includes('seed-hazop-library')) {
  seedHazopDeviationLibrary()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
