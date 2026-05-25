/**
 * seed-hazop-library.ts
 * ─────────────────────
 * Idempotent seed for hazop_deviation_library.
 * Uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * Phase 1  original:  16 rows (Pump×6, Vessel×4, Heat Exchanger×4, Control Valve×2)
 * Phase 3A standard:  62 rows (14 additional standard categories)
 * Phase 3B TWFE:      36 rows (6 TWFE categories + 2 virtual regime categories)
 * Total:             114 rows across 26 categories
 *
 * Governed by:
 *   docs/hazop-phase3a-deviation-library-plan-v1.0.md
 *   docs/hazop-phase3-execution-plan-v1.0.md §0.1
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

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 ORIGINAL — 16 rows (preserved exactly)
  // ══════════════════════════════════════════════════════════════════════════

  // ── PUMP ──────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Pump', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No flow through pump',
    typical_causes: ['Pump failure', 'Suction valve closed', 'Blocked suction line', 'Loss of power'],
    typical_consequences: ['Process interruption', 'Downstream equipment starvation', 'Overheating of pump'],
    typical_safeguards: ['Low flow alarm', 'Flow transmitter', 'Motor protection relay'],
    typical_actions: ['Verify pump seal suitability for dry running', 'Install low flow cutout'],
  },
  {
    equipment_category: 'Pump', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'High flow through pump',
    typical_causes: ['Downstream valve failed open', 'Bypass valve open', 'Pump speed too high (VFD)'],
    typical_consequences: ['Overloading downstream equipment', 'Cavitation', 'Seal damage'],
    typical_safeguards: ['High flow alarm', 'Pressure relief valve on discharge'],
    typical_actions: ['Review VFD upper limit', 'Install high flow interlock'],
  },
  {
    equipment_category: 'Pump', guideword: 'Less', parameter: 'Flow', applicable: true,
    deviation_description: 'Reduced flow through pump',
    typical_causes: ['Partial blockage in suction', 'Increased system resistance', 'Worn impeller'],
    typical_consequences: ['Reduced process throughput', 'Heating of fluid'],
    typical_safeguards: ['Low flow alarm', 'Differential pressure indicator'],
    typical_actions: ['Schedule impeller inspection interval', 'Monitor suction pressure trend'],
  },
  {
    equipment_category: 'Pump', guideword: 'Reverse', parameter: 'Flow', applicable: true,
    deviation_description: 'Reverse flow through pump',
    typical_causes: ['Check valve failure', 'Pump trip with discharge valve open', 'Pressure surge'],
    typical_consequences: ['Pump damage', 'Back-flow into supply tank', 'Equipment damage upstream'],
    typical_safeguards: ['Check valve', 'Non-return valve'],
    typical_actions: ['Verify check valve rated for reverse pressure', 'Install anti-reverse rotation device'],
  },
  {
    equipment_category: 'Pump', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High discharge pressure',
    typical_causes: ['Downstream valve closed', 'Blockage in discharge line', 'System resistance increase'],
    typical_consequences: ['Pipe/fitting failure', 'Seal failure', 'Pump damage'],
    typical_safeguards: ['Pressure relief valve', 'High pressure alarm/trip'],
    typical_actions: ['Confirm PRV set pressure and capacity', 'Review pipe design pressure'],
  },
  {
    equipment_category: 'Pump', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Low suction pressure',
    typical_causes: ['Supply tank low level', 'Suction valve partially closed', 'Vaporisation of fluid'],
    typical_consequences: ['Cavitation', 'Pump damage', 'No flow'],
    typical_safeguards: ['Low suction pressure alarm', 'Low level alarm on supply tank'],
    typical_actions: ['Define NPSH margin requirement', 'Install low pressure interlock'],
  },

  // ── HEAT EXCHANGER ────────────────────────────────────────────────────────
  {
    equipment_category: 'Heat Exchanger', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No flow through shell or tube side',
    typical_causes: ['Inlet valve closed', 'Pump failure', 'Tube blockage'],
    typical_consequences: ['Loss of heat transfer', 'Overheating of process fluid', 'Tube damage'],
    typical_safeguards: ['Flow indicator', 'Temperature alarm on outlet'],
    typical_actions: ['Define minimum flow requirement for both sides'],
  },
  {
    equipment_category: 'Heat Exchanger', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'High process temperature at outlet',
    typical_causes: ['Cooling medium flow failure', 'High inlet temperature', 'Fouling on cooling side'],
    typical_consequences: ['Fluid degradation', 'Downstream equipment damage', 'Safety relief actuation'],
    typical_safeguards: ['High temperature alarm', 'Safety relief valve'],
    typical_actions: ['Set high temperature alarm setpoint', 'Implement fouling monitoring programme'],
  },
  {
    equipment_category: 'Heat Exchanger', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Low outlet temperature',
    typical_causes: ['Excess cooling medium flow', 'Low inlet temperature', 'Process flow too low'],
    typical_consequences: ['Viscosity increase', 'Downstream process upset', 'Freezing risk'],
    typical_safeguards: ['Low temperature alarm', 'Temperature controller'],
    typical_actions: ['Confirm low temperature limit for process fluid'],
  },
  {
    equipment_category: 'Heat Exchanger', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Tube leak — cross contamination between shell and tube',
    typical_causes: ['Tube corrosion', 'Mechanical damage', 'Thermal fatigue'],
    typical_consequences: ['Product contamination', 'Utility fluid ingress into process', 'Environmental release'],
    typical_safeguards: ['Differential pressure monitoring', 'Regular tube inspection'],
    typical_actions: ['Define tube inspection interval', 'Review material selection for compatibility'],
  },

  // ── VESSEL ────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Vessel', guideword: 'More', parameter: 'Level', applicable: true,
    deviation_description: 'High level in vessel',
    typical_causes: ['Inlet flow greater than outlet', 'Outlet valve/pump failure', 'Level instrument failure'],
    typical_consequences: ['Overflow', 'Carry-over to downstream equipment', 'Structural overload'],
    typical_safeguards: ['High level alarm', 'High-high level trip', 'Overflow nozzle'],
    typical_actions: ['Verify HH level trip is independent of HA alarm', 'Confirm overflow drain size'],
  },
  {
    equipment_category: 'Vessel', guideword: 'Less', parameter: 'Level', applicable: true,
    deviation_description: 'Low level in vessel',
    typical_causes: ['Inlet flow less than outlet', 'Leakage from vessel', 'Drain valve open'],
    typical_consequences: ['Pump cavitation', 'Process interruption', 'Gas ingress to liquid system'],
    typical_safeguards: ['Low level alarm', 'Low-low level pump trip'],
    typical_actions: ['Set LL level trip above vortex-forming level'],
  },
  {
    equipment_category: 'Vessel', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High pressure in vessel',
    typical_causes: ['Blocked outlet', 'Uncontrolled reaction', 'External heat source', 'Relief valve stuck closed'],
    typical_consequences: ['Vessel overpressure', 'Rupture', 'Catastrophic release'],
    typical_safeguards: ['Pressure relief valve', 'High pressure alarm', 'Rupture disc'],
    typical_actions: ['Verify PRV sizing for maximum credible case', 'Confirm relief path is unobstructed'],
  },
  {
    equipment_category: 'Vessel', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Low pressure / vacuum in vessel',
    typical_causes: ['Rapid draining', 'Loss of inert blanket', 'Blocked vent'],
    typical_consequences: ['Vessel collapse', 'Air ingress', 'Implosion'],
    typical_safeguards: ['Vacuum breaker', 'Low pressure alarm', 'Pressure indicator'],
    typical_actions: ['Confirm vessel designed for full vacuum', 'Install vacuum breaker if not full vacuum rated'],
  },

  // ── CONTROL VALVE ─────────────────────────────────────────────────────────
  {
    equipment_category: 'Control Valve', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Valve fails open — more flow than intended',
    typical_causes: ['Actuator failure', 'Instrument air failure (fail-open valve)', 'Positioner failure'],
    typical_consequences: ['Downstream flooding', 'Overpressure downstream', 'Product loss'],
    typical_safeguards: ['Manual isolation valve', 'High flow alarm'],
    typical_actions: ['Confirm fail-safe position (FO/FC) is appropriate for process', 'Install manual bypass'],
  },
  {
    equipment_category: 'Control Valve', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Valve fails closed — no flow',
    typical_causes: ['Actuator failure', 'Instrument air failure (fail-closed valve)', 'Positioner failure'],
    typical_consequences: ['Process starvation', 'Pump deadhead', 'Process shutdown'],
    typical_safeguards: ['Low flow alarm', 'Bypass valve'],
    typical_actions: ['Confirm fail-safe position is appropriate for process', 'Define bypass operating procedure'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3A STANDARD EXPANSION — 62 rows
  // ══════════════════════════════════════════════════════════════════════════

  // ── TANK ──────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Tank', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No flow into tank — supply interrupted',
    typical_causes: ['Inlet valve closed or failed shut', 'Feed pump failure', 'Supply vessel empty', 'Blockage in feed line'],
    typical_consequences: ['Tank runs dry', 'Outlet pump cavitation', 'Downstream process starvation'],
    typical_safeguards: ['Low level alarm on tank', 'Low-low level pump trip', 'Level indicator'],
    typical_actions: ['Define minimum level setpoint for LAL', 'Verify tank has sufficient working volume for process demand'],
  },
  {
    equipment_category: 'Tank', guideword: 'More', parameter: 'Level', applicable: true,
    deviation_description: 'High level in tank — inlet exceeds outlet',
    typical_causes: ['Inlet flow greater than outlet withdrawal rate', 'Outlet pump failure', 'Outlet valve closed', 'Level controller failure'],
    typical_consequences: ['Tank overflow', 'Loss of containment', 'Environmental release', 'Structural damage to roof'],
    typical_safeguards: ['High level alarm', 'High-high level trip closing inlet valve', 'Overflow nozzle directed to bund'],
    typical_actions: ['Verify HH level trip is independent of HA alarm loop', 'Confirm bund capacity >= tank working volume'],
  },
  {
    equipment_category: 'Tank', guideword: 'Less', parameter: 'Level', applicable: true,
    deviation_description: 'Low level in tank — outlet exceeds inlet',
    typical_causes: ['Outlet withdrawal greater than inlet supply', 'Tank leakage', 'Drain valve inadvertently left open'],
    typical_consequences: ['Outlet pump cavitation', 'Loss of process inventory', 'Air ingress to pump suction'],
    typical_safeguards: ['Low level alarm', 'Low-low level pump trip', 'Level transmitter'],
    typical_actions: ['Set LL trip above vortex-forming level for outlet pump NPSH', 'Inspect drain valve for tight closure'],
  },
  {
    equipment_category: 'Tank', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High pressure in tank — vent undersized or blocked',
    typical_causes: ['Blocked or undersized vent', 'N2 blanket over-pressure', 'Thermal expansion during filling'],
    typical_consequences: ['Tank overpressure — roof lift on atmospheric tank', 'Rupture', 'Loss of containment'],
    typical_safeguards: ['Pressure relief valve or conservation vent', 'High pressure alarm', 'Pressure indicator'],
    typical_actions: ['Confirm vent sizing for maximum fill rate and thermal breathing case', 'Verify PRV set pressure vs tank design pressure'],
  },
  {
    equipment_category: 'Tank', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Vacuum in tank — vent blocked during rapid drawdown',
    typical_causes: ['Blocked vent during rapid pumpout', 'Cold weather vapour condensation creating vacuum', 'Failing to open vent before emptying'],
    typical_consequences: ['Tank collapse — implosion', 'Structural failure', 'Roof collapse on fixed-roof atmospheric tank'],
    typical_safeguards: ['Vacuum breaker', 'Conservation vent rated for both pressure and vacuum', 'Low pressure alarm'],
    typical_actions: ['Confirm tank design standard (atmospheric vs pressure)', 'Install vacuum breaker if not rated for full vacuum', 'Define emptying procedure including vent opening'],
  },
  {
    equipment_category: 'Tank', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Wrong material or contamination in tank',
    typical_causes: ['Wrong material charged to tank', 'Contamination from previous batch', 'Cross-connection to wrong supply line'],
    typical_consequences: ['Off-spec product', 'Uncontrolled reaction if incompatible materials', 'Product rejection'],
    typical_safeguards: ['Material specification check before filling', 'Sample analysis before use', 'Dedicated filling connection'],
    typical_actions: ['Implement material verification procedure', 'Consider colour-coding or interlocked connections'],
  },

  // ── HEATER ────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Heater', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Low or no heating — heater output insufficient or fails',
    typical_causes: ['Heating element failure', 'Steam supply failure', 'Temperature controller failure — shuts off heat', 'Insufficient heat input from fouling'],
    typical_consequences: ['Process fluid below required temperature', 'Viscosity increase', 'Freezing risk in cold climates', 'Process upset downstream'],
    typical_safeguards: ['Low temperature alarm on heater outlet', 'Temperature controller', 'Heater duty indicator'],
    typical_actions: ['Define minimum acceptable outlet temperature', 'Assess freeze protection requirement', 'Confirm startup sequence'],
  },
  {
    equipment_category: 'Heater', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'High temperature — heater overheats process fluid',
    typical_causes: ['Temperature controller failure — full heat input', 'Steam control valve stuck open', 'Loss of process flow through heater (dry firing)'],
    typical_consequences: ['Overheating of process fluid', 'Product degradation', 'Auto-ignition risk if flammable fluid'],
    typical_safeguards: ['High temperature alarm on outlet', 'High-high temperature trip (TSHH)', 'Temperature safety cutout (TSH)'],
    typical_actions: ['Define TSHH based on fluid auto-ignition or degradation temperature', 'Confirm heater design accounts for dry-out condition'],
  },
  {
    equipment_category: 'Heater', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'Overpressure in heater — blocked outlet with continuous heating',
    typical_causes: ['Blocked outlet line with continuous heat input', 'Steam trapped in shell side on shutdown', 'Flash steam on sudden pressure drop'],
    typical_consequences: ['Overpressure of heater shell or tubes', 'Pipe or joint failure', 'Loss of containment'],
    typical_safeguards: ['Pressure relief valve on heater', 'High pressure alarm', 'Thermal relief valve on blocked-in sections'],
    typical_actions: ['Confirm PRV sizing includes locked-in liquid expansion case', 'Verify heater design pressure'],
  },
  {
    equipment_category: 'Heater', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Vacuum in heater — condensation on shutdown without vacuum protection',
    typical_causes: ['Rapid draining of heater creating vacuum', 'Steam condensation on shell side without vacuum break', 'Cold steam supply on startup'],
    typical_consequences: ['Heater shell collapse if not vacuum-rated', 'Air ingress to steam side', 'Waterhammer on steam admission'],
    typical_safeguards: ['Vacuum breaker on steam side', 'Low pressure alarm on shell side', 'Steam trap with proper sizing'],
    typical_actions: ['Confirm heater shell design includes full vacuum on steam side', 'Define shutdown steam venting procedure'],
  },

  // ── COLUMN ────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Column', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No feed flow to column',
    typical_causes: ['Feed pump failure', 'Feed valve closed', 'Feed line blockage'],
    typical_consequences: ['Column runs dry', 'Loss of separation', 'Hot spots in reboiler — dry firing'],
    typical_safeguards: ['Low feed flow alarm', 'Feed flow transmitter', 'Column bottoms level indicator'],
    typical_actions: ['Define minimum feed rate below which column must be shut down', 'Interlock reboiler with feed flow'],
  },
  {
    equipment_category: 'Column', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Excess feed flow — column flooding',
    typical_causes: ['Feed rate exceeds design column capacity', 'Reflux ratio too high', 'Downcomer flooding'],
    typical_consequences: ['Column flooding', 'Loss of separation', 'Liquid carry-over to overhead system'],
    typical_safeguards: ['High differential pressure alarm across column trays', 'Feed flow controller with high limit'],
    typical_actions: ['Define flood point and set DP alarm at 80% of flood DP', 'Confirm column capacity margins'],
  },
  {
    equipment_category: 'Column', guideword: 'Less', parameter: 'Flow', applicable: true,
    deviation_description: 'Reduced feed flow — column weeping',
    typical_causes: ['Feed rate below minimum stable operation', 'Inadequate vapour velocity in trays', 'Upstream feed interruption'],
    typical_consequences: ['Tray weeping', 'Loss of separation efficiency', 'Off-spec products'],
    typical_safeguards: ['Feed flow controller with low alarm', 'Tray differential pressure indicator'],
    typical_actions: ['Define minimum stable flow rate', 'Consider column turndown capacity in design'],
  },
  {
    equipment_category: 'Column', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'High temperature — reboiler overheats bottoms',
    typical_causes: ['Reboiler duty controller failure — maximum heat input', 'Reboiler steam valve stuck open', 'Low feed rate with full reboiler duty'],
    typical_consequences: ['Product degradation in bottoms', 'Runaway reaction if reactive system', 'Pressure increase from over-vaporisation'],
    typical_safeguards: ['High temperature alarm on bottoms', 'Reboiler steam flow controller', 'High-high temperature trip on reboiler outlet'],
    typical_actions: ['Review reaction hazard for reactive components', 'Define TSHH for reboiler'],
  },
  {
    equipment_category: 'Column', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Low temperature — insufficient separation',
    typical_causes: ['Insufficient reboiler duty', 'Condenser overcooling', 'Feed temperature too low'],
    typical_consequences: ['Off-spec overhead product', 'Off-spec bottoms product', 'Insufficient separation'],
    typical_safeguards: ['Low temperature alarm on bottoms', 'Overhead temperature indicator'],
    typical_actions: ['Define minimum bottoms temperature for product specification', 'Confirm reboiler duty margins'],
  },
  {
    equipment_category: 'Column', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High pressure — condenser failure or blocked overhead',
    typical_causes: ['Blocked condenser or overhead line', 'Condenser cooling medium failure', 'Pressure control valve on overhead fails closed'],
    typical_consequences: ['Column overpressure', 'Pressure relief device activation', 'Loss of containment'],
    typical_safeguards: ['Pressure relief valve on column', 'High pressure alarm', 'Condenser cooling medium flow indicator'],
    typical_actions: ['Confirm PRV sizing for maximum credible case: total reflux with condenser failure', 'Verify column design pressure'],
  },
  {
    equipment_category: 'Column', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Sub-atmospheric pressure — condenser overcooling or control valve fails open',
    typical_causes: ['Pressure control valve on overhead fails open', 'Excess condenser duty', 'Loss of feed with reboiler still operating'],
    typical_consequences: ['Column sub-atmospheric if not vacuum-rated', 'Air ingress through seals', 'Vacuum collapse'],
    typical_safeguards: ['Low pressure alarm on overhead', 'Pressure controller low limit', 'Vacuum breaker on atmospheric columns'],
    typical_actions: ['Confirm column design pressure range includes minimum credible operating pressure', 'Install vacuum breaker if not vacuum-designed'],
  },
  {
    equipment_category: 'Column', guideword: 'Less', parameter: 'Level', applicable: true,
    deviation_description: 'Low bottoms level — liquid seal lost',
    typical_causes: ['Bottoms pump withdrawal exceeds reboiler feed', 'Level control valve fails open', 'Reboiler starvation'],
    typical_consequences: ['Gas blow-through to bottoms pump — cavitation', 'Loss of liquid seal', 'Two-phase flow to bottoms pump'],
    typical_safeguards: ['Low level alarm on bottoms', 'Low-low level bottoms pump trip', 'Level transmitter'],
    typical_actions: ['Define LL level above column bottoms outlet nozzle to prevent vapour breakthrough'],
  },
  {
    equipment_category: 'Column', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Off-spec feed or contamination in column',
    typical_causes: ['Feed contamination from upstream process', 'Wrong feed material charged', 'Flooding causing carry-over of non-target components'],
    typical_consequences: ['Off-spec overhead or bottoms product', 'Downstream processing upset', 'Product rejection'],
    typical_safeguards: ['Feed quality analyser or sample point upstream', 'Product quality analyser on outlets'],
    typical_actions: ['Implement product quality check before transfer', 'Define feed specification limits'],
  },

  // ── SEPARATOR ─────────────────────────────────────────────────────────────
  {
    equipment_category: 'Separator', guideword: 'More', parameter: 'Level', applicable: true,
    deviation_description: 'High liquid level — carry-over to gas outlet',
    typical_causes: ['Liquid inlet exceeds liquid outlet rate', 'Level control valve fails closed', 'Outlet pump failure', 'Emulsion formation'],
    typical_consequences: ['Liquid carry-over to gas outlet system', 'Downstream gas equipment damage', 'Loss of separation'],
    typical_safeguards: ['High level alarm', 'High-high level trip', 'Level indicator independent of control loop'],
    typical_actions: ['Confirm HH level trip is independent of HL alarm', 'Define maximum acceptable liquid carry-over'],
  },
  {
    equipment_category: 'Separator', guideword: 'Less', parameter: 'Level', applicable: true,
    deviation_description: 'Low liquid level — gas blow-through to liquid outlet',
    typical_causes: ['Liquid outlet withdrawal exceeds inlet rate', 'Level control valve fails open', 'Excessive liquid draw'],
    typical_consequences: ['Gas blow-through to liquid outlet pump — cavitation', 'Loss of liquid seal', 'Two-phase flow downstream'],
    typical_safeguards: ['Low level alarm', 'Low-low level trip closing liquid outlet valve', 'Level indicator'],
    typical_actions: ['Define LL level above liquid outlet nozzle to prevent gas blow-through'],
  },
  {
    equipment_category: 'Separator', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'Overpressure in separator — blocked outlet',
    typical_causes: ['Blocked gas outlet', 'Inlet surge', 'Pressure control valve fails closed'],
    typical_consequences: ['Vessel overpressure', 'Pressure relief device activation', 'Loss of containment'],
    typical_safeguards: ['Pressure relief valve', 'High pressure alarm and trip', 'Pressure controller on gas outlet'],
    typical_actions: ['Confirm PRV sizing for blocked gas outlet case', 'Verify separator design pressure'],
  },
  {
    equipment_category: 'Separator', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Sub-atmospheric pressure in separator',
    typical_causes: ['Pressure control valve on outlet fails open', 'Sudden loss of inlet flow', 'Excessive gas withdrawal'],
    typical_consequences: ['Sub-atmospheric operation if not vacuum-rated', 'Air ingress through seals', 'Potential collapse'],
    typical_safeguards: ['Low pressure alarm', 'Vacuum breaker on separator if applicable'],
    typical_actions: ['Confirm separator design pressure range for minimum credible operating pressure'],
  },
  {
    equipment_category: 'Separator', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Separation failure — off-spec separated streams',
    typical_causes: ['Demister pad failure', 'Emulsion carry-over', 'Contamination in inlet stream'],
    typical_consequences: ['Off-spec gas stream', 'Off-spec liquid stream', 'Downstream equipment damage'],
    typical_safeguards: ['Demister pad (mesh or vane type)', 'Inlet coalescer', 'Regular demister inspection'],
    typical_actions: ['Define maximum liquid carry-over specification', 'Include demister inspection in maintenance schedule'],
  },

  // ── FILTER ────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Filter', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No flow through filter — element fully blocked',
    typical_causes: ['Filter element choked with particulate', 'Element collapse', 'Inlet valve closed'],
    typical_consequences: ['Process flow stopped', 'Upstream pressure increase', 'Pump damage from deadhead'],
    typical_safeguards: ['Differential pressure indicator across filter', 'High DP alarm', 'Bypass line with isolation valve'],
    typical_actions: ['Define maximum DP for filter change-out', 'Establish filter cleaning and replacement interval'],
  },
  {
    equipment_category: 'Filter', guideword: 'Less', parameter: 'Flow', applicable: true,
    deviation_description: 'Reduced flow through filter — partial blockage',
    typical_causes: ['Filter element partially choked', 'Increasing particulate loading'],
    typical_consequences: ['Reduced process throughput', 'Elevated upstream pressure'],
    typical_safeguards: ['Differential pressure indicator', 'High DP alarm for early warning'],
    typical_actions: ['Set DP alarm at 50% of maximum allowable DP', 'Define element cleaning trigger criteria'],
  },
  {
    equipment_category: 'Filter', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High upstream pressure — sudden filter blockage',
    typical_causes: ['Sudden complete blockage', 'Bypass valve closed with filter blocked'],
    typical_consequences: ['Overpressure of upstream piping', 'Pipe or fitting failure', 'Seal damage on upstream pump'],
    typical_safeguards: ['Pressure relief on upstream side', 'High pressure alarm upstream'],
    typical_actions: ['Confirm upstream piping rated for pump shut-off pressure', 'Verify PRV set point'],
  },
  {
    equipment_category: 'Filter', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Filter media migration — contamination of downstream fluid',
    typical_causes: ['Filter element rupture', 'Incorrect element installed', 'Element bypass due to seal failure'],
    typical_consequences: ['Downstream equipment damage from particulate', 'Product contamination', 'Instrument fouling'],
    typical_safeguards: ['Downstream sampling point or analyser', 'Filter element pressure integrity test'],
    typical_actions: ['Include filter element pressure test in maintenance procedure', 'Verify element grade against particulate size specification'],
  },

  // ── ISOLATION VALVE ───────────────────────────────────────────────────────
  {
    equipment_category: 'Isolation Valve', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Isolation valve fails closed — process flow blocked',
    typical_causes: ['Valve actuator failure', 'Instrument air failure with fail-closed actuator', 'Manual valve inadvertently left closed after maintenance'],
    typical_consequences: ['Process flow stopped', 'Upstream pressure build-up', 'Downstream equipment starvation'],
    typical_safeguards: ['Valve position indicator — limit switches', 'Flow indicator downstream', 'DCS position monitoring'],
    typical_actions: ['Confirm fail-safe position (FO/FC) is appropriate', 'Include in valve position monitoring with alarm on unexpected closure'],
  },
  {
    equipment_category: 'Isolation Valve', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Isolation valve fails open — unintended flow path',
    typical_causes: ['Actuator failure on normally-closed valve', 'Control signal loss causing inadvertent opening', 'Manual valve left open after maintenance'],
    typical_consequences: ['Unintended flow path — cross-contamination or bypass of safeguards', 'Downstream overfill', 'Process upset'],
    typical_safeguards: ['Valve position feedback to DCS with alarm on unexpected open', 'Independent high flow alarm downstream'],
    typical_actions: ['Review fail-safe position', 'Add position confirmation interlock where safety-critical'],
  },
  {
    equipment_category: 'Isolation Valve', guideword: 'Reverse', parameter: 'Flow', applicable: true,
    deviation_description: 'Isolation valve fails to isolate — seat leakage in closed position',
    typical_causes: ['Valve fails to fully close — seat damage or debris', 'Excessive line pressure exceeding seat shut-off rating', 'Mechanical damage to valve internals'],
    typical_consequences: ['Process fluid bypasses isolation barrier', 'Cross-contamination between isolated sections', 'Loss of pressure containment during maintenance'],
    typical_safeguards: ['Double-block-and-bleed for safety-critical isolation', 'Seat leakage test during maintenance'],
    typical_actions: ['Define leakage class requirement (BS 6755 / API 598)', 'Include isolation valve in valve testing schedule'],
  },

  // ── CHECK VALVE ───────────────────────────────────────────────────────────
  {
    equipment_category: 'Check Valve', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Check valve stuck closed — intended forward flow blocked',
    typical_causes: ['Disc stuck closed by debris', 'Spring too strong for available pressure differential', 'Incorrect orientation'],
    typical_consequences: ['Forward flow stopped', 'Upstream pump deadhead', 'Process interruption'],
    typical_safeguards: ['Flow indicator upstream and downstream', 'Differential pressure indicator'],
    typical_actions: ['Confirm spring rating for minimum flow conditions', 'Include in maintenance inspection'],
  },
  {
    equipment_category: 'Check Valve', guideword: 'Reverse', parameter: 'Flow', applicable: true,
    deviation_description: 'Check valve fails to close — reverse flow not prevented',
    typical_causes: ['Disc fails to seat — worn or debris on seat', 'Slam-closure damage', 'Incorrect orientation'],
    typical_consequences: ['Back-flow to upstream equipment', 'Contamination of upstream system', 'Reverse rotation of upstream pump', 'Siphoning'],
    typical_safeguards: ['Flow indicator or position indicator', 'Dual check valves for safety-critical backflow prevention'],
    typical_actions: ['Define check valve type based on flow conditions', 'Verify rated for reverse pressure differential'],
  },
  {
    equipment_category: 'Check Valve', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High upstream pressure — check valve stuck closed causing pump deadhead',
    typical_causes: ['Check valve stuck closed while upstream pump continues to run', 'Deadhead condition — no outlet'],
    typical_consequences: ['Pump deadhead overpressure', 'Mechanical seal failure', 'Pipe overpressure between pump and check valve'],
    typical_safeguards: ['Pressure relief valve on pump discharge', 'Low flow alarm with pump cutout', 'Minimum flow recirculation bypass'],
    typical_actions: ['Confirm pump maximum pressure does not exceed system design pressure', 'Install minimum flow bypass if pump unsuitable for extended deadhead'],
  },

  // ── INSTRUMENT ────────────────────────────────────────────────────────────
  {
    equipment_category: 'Instrument', guideword: 'No', parameter: 'Signal', applicable: true,
    deviation_description: 'No instrument signal — total loss of measurement',
    typical_causes: ['Transmitter failure — power, electronics, or sensor', 'Cable break or loose connection', 'Impulse line blockage or freeze', 'Instrument air failure on pneumatic transmitter'],
    typical_consequences: ['Loss of process measurement — control loop goes to manual or fails safe', 'Process deviation undetected', 'Operator response required'],
    typical_safeguards: ['DCS signal failure alarm on loss of 4-20mA', 'Redundant instrument with independent measurement', 'Instrument health monitoring in DCS'],
    typical_actions: ['Define fail-safe output on signal loss', 'Implement 2oo3 voting for safety-critical measurements', 'Confirm impulse line heat tracing if freezing risk'],
  },
  {
    equipment_category: 'Instrument', guideword: 'More', parameter: 'Reading', applicable: true,
    deviation_description: 'Instrument reads high — incorrect high indication',
    typical_causes: ['Calibration drift — positive zero shift', 'Condensation in high-pressure impulse leg', 'Electrical interference on signal cable'],
    typical_consequences: ['Control system takes incorrect action based on false high reading', 'Overfeed, overpressure, or overfill', 'Spurious safeguard activation'],
    typical_safeguards: ['Independent high reading alarm from separate instrument', 'Cross-check with secondary instrument', 'Regular calibration schedule'],
    typical_actions: ['Set calibration interval based on service severity', 'Consider redundant measurement for critical loops'],
  },
  {
    equipment_category: 'Instrument', guideword: 'Less', parameter: 'Reading', applicable: true,
    deviation_description: 'Instrument reads low — incorrect low indication',
    typical_causes: ['Calibration drift — negative zero shift', 'Partial blockage of high-pressure impulse leg', 'Sensor fouling reducing response'],
    typical_consequences: ['Control system underestimates process variable', 'Process deviation undetected', 'Safety trips may not actuate when required'],
    typical_safeguards: ['Independent low reading alarm', 'Cross-check with secondary instrument', 'Calibration schedule'],
    typical_actions: ['Define minimum reading below which measurement is flagged suspect', 'Confirm impulse line configuration prevents air accumulation'],
  },
  {
    equipment_category: 'Instrument', guideword: 'Other Than', parameter: 'Reading', applicable: true,
    deviation_description: 'Instrument reads wrong parameter — incorrect measurement entirely',
    typical_causes: ['Transmitter connected to wrong process connection', 'Wrong calibration range or units applied', 'Instrument cross-wired in field junction box'],
    typical_consequences: ['Completely incorrect process indication', 'Control system applies wrong correction', 'Safety function operates at wrong condition'],
    typical_safeguards: ['Loop check procedure during commissioning', 'Tag verification in field vs P&ID'],
    typical_actions: ['Include instrument loop check in pre-commissioning procedure', 'Verify range sheet matches P&ID before installation'],
  },

  // ── UTILITY SYSTEM ────────────────────────────────────────────────────────
  {
    equipment_category: 'Utility System', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Utility supply completely interrupted',
    typical_causes: ['Utility supply header shutdown or failure', 'Utility control valve fails closed', 'Utility header maintenance isolation'],
    typical_consequences: ['Complete loss of cooling, heating, or motive fluid', 'Control loop failure', 'Process upset — potential safety-critical condition'],
    typical_safeguards: ['Utility supply pressure indicator', 'Low utility supply pressure alarm', 'Automatic process shutdown on critical utility failure'],
    typical_actions: ['Define safe process shutdown procedure on loss of utility', 'Identify safety-critical utilities requiring backup'],
  },
  {
    equipment_category: 'Utility System', guideword: 'Less', parameter: 'Flow', applicable: true,
    deviation_description: 'Reduced utility flow — partial supply failure',
    typical_causes: ['Partial supply failure — header pressure drop', 'Fouling of utility supply strainer', 'Increased demand from concurrent consumers'],
    typical_consequences: ['Reduced process heat duty or motive flow', 'Temperature or pressure excursion', 'Multiple process units affected simultaneously'],
    typical_safeguards: ['Utility flow indicator on branch to process', 'Low utility flow alarm'],
    typical_actions: ['Confirm utility system capacity for maximum simultaneous demand'],
  },
  {
    equipment_category: 'Utility System', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Excess utility flow — control valve fails open',
    typical_causes: ['Utility control valve fails fully open', 'Manual override left on maximum', 'Controller signal failure commanding maximum opening'],
    typical_consequences: ['Overcooling, overheating, or excess motive force', 'Overpressure from excess utility pressure', 'Product quality impact'],
    typical_safeguards: ['Utility flow controller with high limit alarm', 'Process-side temperature or pressure alarm'],
    typical_actions: ['Review impact of maximum possible utility flow on process design conditions', 'Confirm fail-safe position of utility control valve'],
  },
  {
    equipment_category: 'Utility System', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'Utility supply temperature too high',
    typical_causes: ['Utility temperature control failure', 'Wrong utility fluid connected', 'Heat recovery from adjacent system'],
    typical_consequences: ['Product degradation from excess heat', 'Thermal stress on equipment', 'Downstream process upset'],
    typical_safeguards: ['Utility supply temperature indicator', 'High utility temperature alarm on supply header'],
    typical_actions: ['Define maximum utility supply temperature in design basis', 'Confirm equipment rated for maximum credible utility temperature'],
  },
  {
    equipment_category: 'Utility System', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Utility supply temperature too low',
    typical_causes: ['Cooling medium too cold — seasonal cold snap', 'Steam quality poor — wet steam', 'Wrong utility source with different temperature'],
    typical_consequences: ['Insufficient heat transfer', 'Freezing risk on process side', 'Condensate hammer in steam systems'],
    typical_safeguards: ['Utility supply temperature indicator', 'Low utility temperature alarm', 'Steam trap for condensate removal'],
    typical_actions: ['Confirm utility minimum supply temperature in design basis', 'Assess freeze protection for local climate'],
  },

  // ── DRAIN ─────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Drain', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Drain cannot discharge — blocked or valve closed',
    typical_causes: ['Drain valve inadvertently closed', 'Drain line blocked by debris or solidified product', 'Drain header at capacity'],
    typical_consequences: ['Equipment cannot be drained for maintenance', 'Liquid accumulates', 'Maintenance delayed — safety hazard'],
    typical_safeguards: ['Manual isolation valve clearly labelled', 'Drain point inspection in maintenance procedure'],
    typical_actions: ['Ensure drain lines have adequate slope toward header', 'Include drain valve in pre-maintenance check'],
  },
  {
    equipment_category: 'Drain', guideword: 'Reverse', parameter: 'Flow', applicable: true,
    deviation_description: 'Reverse flow — drain header backflows into process equipment',
    typical_causes: ['Drain header at higher pressure than drain point', 'Drain header flooded', 'Common drain header — cross-contamination'],
    typical_consequences: ['Contamination of drained equipment', 'Liquid return to process', 'Operator exposure risk'],
    typical_safeguards: ['Check valve on drain line', 'Dedicated drain connections for incompatible fluids'],
    typical_actions: ['Review drain header pressure basis', 'Segregate drain headers for incompatible services'],
  },
  {
    equipment_category: 'Drain', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Uncontrolled drain — drain valve open or fails open',
    typical_causes: ['Drain valve left open after operation', 'Automatic drain valve actuator fails open', 'Drain valve handle removed or damaged'],
    typical_consequences: ['Loss of process inventory', 'Environmental release if not closed system', 'Flooding of drain sump'],
    typical_safeguards: ['Double-valve drain for high-hazard services', 'Drain sump with high level alarm', 'Closed drain system'],
    typical_actions: ['Define drain valve arrangement for service hazard level', 'Install drain to closed collection system for hazardous services'],
  },

  // ── VENT ──────────────────────────────────────────────────────────────────
  {
    equipment_category: 'Vent', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Vent blocked — connected equipment cannot relieve pressure or vacuum',
    typical_causes: ['Vent line blocked by ice, polymer, or debris', 'Vent valve fails closed', 'Liquid accumulation in vent line forming seal'],
    typical_consequences: ['Overpressure of connected equipment', 'Vacuum collapse if equipment drains without vent relief', 'Relief device may not activate'],
    typical_safeguards: ['Vent screen or guard', 'Regular vent line inspection', 'Independent pressure relief device as backup'],
    typical_actions: ['Install heat tracing on vent lines in cold climates', 'Include vent line in routine inspection', 'Confirm vent sizing independently'],
  },
  {
    equipment_category: 'Vent', guideword: 'Reverse', parameter: 'Flow', applicable: true,
    deviation_description: 'Air ingress through vent — vacuum draws air into vessel',
    typical_causes: ['Rapid drawdown creating sub-atmospheric conditions', 'Cold weather vapour condensation', 'Conservation vent vacuum setting lower than vessel rating'],
    typical_consequences: ['Air ingress — explosive atmosphere if flammable vapours present', 'Oxygen ingress into inerted system', 'Risk of ignition inside vessel'],
    typical_safeguards: ['Conservation vent combining pressure and vacuum relief', 'Nitrogen purge on vessel', 'Low pressure alarm on connected vessel'],
    typical_actions: ['Confirm conservation vent vacuum setting vs vessel design', 'Review inert gas blanket supply during drawdown'],
  },
  {
    equipment_category: 'Vent', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Excess vapour release through vent — uncontrolled atmospheric discharge',
    typical_causes: ['Uncontrolled vapour generation in connected vessel', 'Relief event venting through atmospheric vent', 'Vent valve stuck open'],
    typical_consequences: ['Atmospheric dispersion of process vapour', 'Potential toxic exposure', 'Potential flammable cloud if vapour is flammable'],
    typical_safeguards: ['Vent to safe elevated location or to scrubber/flare', 'High pressure alarm on connected vessel', 'Vapour detection near vent outlet'],
    typical_actions: ['Confirm vent discharge accounts for wind rose and personnel areas', 'Assess need for scrubber, flare, or treatment for toxic/flammable services'],
  },

  // ── PRODUCT OUTLET ────────────────────────────────────────────────────────
  {
    equipment_category: 'Product Outlet', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No product discharge — outlet blocked or pump failed',
    typical_causes: ['Outlet valve closed or failed shut', 'Delivery pump failure', 'Downstream receiver isolated or full'],
    typical_consequences: ['Product backup — upstream vessel level rises', 'Upstream vessel overfill if feed continues', 'Process shutdown'],
    typical_safeguards: ['Outlet flow indicator', 'High level alarm on upstream vessel', 'Flow transmitter with alarm'],
    typical_actions: ['Define interlock: alarm feed on loss of product outlet flow', 'Confirm downstream receiver has adequate capacity'],
  },
  {
    equipment_category: 'Product Outlet', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Excess product discharge — metering or valve failure',
    typical_causes: ['Outlet metering valve fails open', 'Flow metering failure', 'Product bypass valve inadvertently opened'],
    typical_consequences: ['Over-delivery to downstream receiver', 'Receiver overfill', 'Product loss'],
    typical_safeguards: ['Flow meter on product outlet', 'High flow alarm', 'High level alarm on downstream receiver'],
    typical_actions: ['Install flow totaliser with automatic cutoff on maximum batch volume', 'Verify meter calibration interval'],
  },
  {
    equipment_category: 'Product Outlet', guideword: 'Less', parameter: 'Flow', applicable: true,
    deviation_description: 'Reduced product discharge — partial obstruction',
    typical_causes: ['Partial valve closure', 'Downstream restriction or back-pressure increase', 'Partial pump degradation'],
    typical_consequences: ['Under-delivery — batch cycle extended', 'Upstream vessel level increases', 'Throughput reduction'],
    typical_safeguards: ['Outlet flow indicator', 'Low flow alarm'],
    typical_actions: ['Define minimum acceptable product delivery flow rate', 'Monitor pump performance for degradation'],
  },
  {
    equipment_category: 'Product Outlet', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Off-spec product at outlet — wrong quality discharged',
    typical_causes: ['Off-spec product from upstream process', 'Wrong product tank connected', 'Contamination in outlet piping'],
    typical_consequences: ['Off-spec product delivered', 'Product rejection', 'Reprocessing cost and safety risk downstream'],
    typical_safeguards: ['Product quality sample point or analyser before dispatch', 'Dedicated product outlet piping'],
    typical_actions: ['Implement quality sign-off procedure before dispatch', 'Define product specification and analyser alarm setpoints'],
  },

  // ── WASTE OUTLET ──────────────────────────────────────────────────────────
  {
    equipment_category: 'Waste Outlet', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Waste cannot discharge — outlet blocked or valve closed',
    typical_causes: ['Waste outlet valve closed or failed shut', 'Drain line blocked by debris', 'Waste treatment header at capacity'],
    typical_consequences: ['Waste accumulates in process equipment', 'Upstream vessel overfill', 'Process backup'],
    typical_safeguards: ['Waste vessel level indicator', 'High level alarm on upstream sump', 'Flow indicator on waste outlet'],
    typical_actions: ['Confirm waste collection capacity for maximum waste rate', 'Define waste line flushing procedure'],
  },
  {
    equipment_category: 'Waste Outlet', guideword: 'More', parameter: 'Flow', applicable: true,
    deviation_description: 'Excess waste discharge — valve open or process upset',
    typical_causes: ['Waste outlet valve fails fully open', 'Process upset generating excess waste', 'Wrong stream routed to waste outlet'],
    typical_consequences: ['Waste treatment system overloaded', 'Environmental non-compliance', 'Downstream handling system flooded'],
    typical_safeguards: ['Waste outlet flow indicator', 'Waste treatment capacity monitor', 'High flow alarm'],
    typical_actions: ['Define maximum permitted waste discharge rate', 'Size waste treatment with surge capacity margin'],
  },
  {
    equipment_category: 'Waste Outlet', guideword: 'Reverse', parameter: 'Flow', applicable: true,
    deviation_description: 'Reverse flow — waste header backflows into process',
    typical_causes: ['Waste collection header at higher pressure than process waste outlet', 'Waste header blocked downstream', 'Common header — cross-contamination'],
    typical_consequences: ['Waste from header enters process — contamination', 'Incompatible waste fluids mix — reaction risk'],
    typical_safeguards: ['Check valve on waste outlet close to process', 'Waste header pressure indicator'],
    typical_actions: ['Install check valve where backflow causes contamination', 'Segregate waste headers for incompatible streams'],
  },

  // ── NEXT LOOP ─────────────────────────────────────────────────────────────
  {
    equipment_category: 'Next Loop', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No flow to downstream loop — inter-loop connection blocked',
    typical_causes: ['Block valve between loops closed', 'Downstream loop isolated for maintenance', 'Downstream loop pump failure'],
    typical_consequences: ['Upstream loop pressure build-up', 'Upstream vessel overfill', 'Downstream loop starved'],
    typical_safeguards: ['Inter-loop flow indicator', 'High pressure alarm on upstream loop outlet', 'High level alarm on upstream vessel'],
    typical_actions: ['Define operational procedure for inter-loop startup/shutdown sequence', 'Consider interlock: alarm upstream if inter-loop flow drops to zero'],
  },
  {
    equipment_category: 'Next Loop', guideword: 'Less', parameter: 'Flow', applicable: true,
    deviation_description: 'Reduced flow to downstream loop — partial restriction',
    typical_causes: ['Partial blockage in inter-loop piping', 'Upstream loop throughput reduced', 'Inter-loop control valve partially closed'],
    typical_consequences: ['Downstream loop starvation', 'Downstream process upset', 'Upstream loop backup'],
    typical_safeguards: ['Inter-loop flow indicator', 'Low flow alarm on downstream loop inlet'],
    typical_actions: ['Define minimum inter-loop flow for stable downstream operation', 'Assess cascade effect from reduced flow'],
  },
  {
    equipment_category: 'Next Loop', guideword: 'Reverse', parameter: 'Flow', applicable: true,
    deviation_description: 'Reverse flow from downstream loop back to upstream loop',
    typical_causes: ['Downstream loop at higher pressure', 'Check valve on inter-loop connection fails', 'Parallel pump — one driving backflow through stopped pump'],
    typical_consequences: ['Back-flow contaminates upstream loop', 'Upstream equipment exposed to downstream conditions', 'Loss of upstream loop inventory'],
    typical_safeguards: ['Check valve on inter-loop connection', 'Flow indicator with reverse flow alarm'],
    typical_actions: ['Confirm inter-loop check valve rated for maximum reverse pressure differential', 'Review upstream equipment design against downstream loop maximum conditions'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3B TWFE EXPANSION — 36 rows
  // ══════════════════════════════════════════════════════════════════════════

  // ── TWFE EVAPORATOR ───────────────────────────────────────────────────────
  {
    equipment_category: 'TWFE Evaporator', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No feed flow to TWFE evaporator — rotor dry run risk',
    typical_causes: ['Feed pump failure', 'Feed valve closed or failed shut', 'Upstream vessel empty', 'Blockage in feed line'],
    typical_consequences: ['Dry running of wiped film rotor — bearing and rotor damage', 'Loss of evaporation duty', 'Overheating of evaporator surface without feed cooling effect'],
    typical_safeguards: ['Low feed flow alarm', 'Feed flow transmitter with interlock', 'Motor current monitoring on rotor drive'],
    typical_actions: ['Define minimum feed flow for safe rotor operation', 'Interlock rotor drive with feed flow — trip on low flow'],
  },
  {
    equipment_category: 'TWFE Evaporator', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'High evaporation temperature — product thermal degradation',
    typical_causes: ['Heating jacket temperature controller failure — full heat', 'Steam or hot oil control valve stuck open', 'Loss of feed flow with jacket heating continuing'],
    typical_consequences: ['Product thermal cracking or polymerisation on wiped film surface', 'Fouling and coking of rotor and internals', 'Fire risk if oil reaches auto-ignition temperature'],
    typical_safeguards: ['High jacket temperature alarm (TAHH)', 'High-high temperature trip on jacket outlet', 'Rotor speed indicator — reduced rpm indicates fouling buildup'],
    typical_actions: ['Define TSHH based on feed oil flash point and thermal degradation temperature', 'Interlock jacket heat cutoff with loss of feed flow'],
  },
  {
    equipment_category: 'TWFE Evaporator', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Low evaporation temperature — insufficient base oil separation',
    typical_causes: ['Insufficient jacket heating duty', 'Increased feed flow rate beyond evaporator thermal capacity', 'Fouling of jacket heat transfer surface reducing duty'],
    typical_consequences: ['Inadequate vaporisation of target fractions', 'Off-spec distillate — heavy components present', 'Reduced base oil fraction recovery'],
    typical_safeguards: ['Low evaporator body temperature alarm', 'Jacket supply temperature indicator', 'Distillate flow rate indicator'],
    typical_actions: ['Confirm evaporator thermal duty margin includes fouling factor', 'Define minimum operating temperature for product specification'],
  },
  {
    equipment_category: 'TWFE Evaporator', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'Vacuum loss in TWFE evaporator — pressure rises toward atmospheric',
    typical_causes: ['Vacuum system failure — ejector or vacuum pump trip', 'Air ingress through shaft seal or flange', 'Blocked downstream condenser causing pressure rise'],
    typical_consequences: ['Loss of vacuum distillation separation', 'Flash back of high-boiling fractions', 'Flooding of evaporator with un-evaporated feed'],
    typical_safeguards: ['Absolute pressure indicator on evaporator shell', 'High pressure (vacuum loss) alarm with auto-shutdown', 'Standby vacuum system'],
    typical_actions: ['Define minimum acceptable vacuum level for product specification', 'Interlock feed and heating on vacuum loss', 'Confirm all seals and connections are vacuum-rated'],
  },
  {
    equipment_category: 'TWFE Evaporator', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Excess vacuum — evaporator pressure below design minimum absolute pressure',
    typical_causes: ['Vacuum system over-performance', 'Product outlet blocked — evaporator drawing excess vacuum', 'Design vacuum exceeded during turndown operation'],
    typical_consequences: ['Excessive entrainment of heavy fractions into distillate', 'Product contamination from unintended fraction vaporisation', 'Potential structural damage at extreme vacuum'],
    typical_safeguards: ['Low pressure (deep vacuum) alarm', 'Vacuum bleed control valve to maintain design setpoint', 'Absolute pressure indicator with low limit alarm'],
    typical_actions: ['Define minimum absolute pressure operating limit', 'Install vacuum bleed control to maintain design vacuum setpoint'],
  },
  {
    equipment_category: 'TWFE Evaporator', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Feed oil contamination or off-spec feed quality',
    typical_causes: ['Feed oil contains excess water — steam flash in evaporator', 'Feed composition outside design range — heavier or lighter than specified', 'Contamination from previous batch or cleaning fluid'],
    typical_consequences: ['Steam flash causing pressure surge in vacuum evaporator', 'Off-spec distillate product', 'Fouling or damage to evaporator rotor and internals'],
    typical_safeguards: ['Feed water content analyser or indicator upstream', 'Feed quality sample point before evaporator', 'Upstream dehydration and degasoil pre-treatment steps'],
    typical_actions: ['Define feed oil specification for TWFE inlet including water content limit', 'Implement upstream dehydration interlock before starting TWFE'],
  },

  // ── VACUUM CONDENSER ──────────────────────────────────────────────────────
  {
    equipment_category: 'Vacuum Condenser', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No cooling medium to vacuum condenser — condensation failure',
    typical_causes: ['Cooling medium supply failure', 'Cooling medium pump failure', 'Cooling medium inlet valve closed'],
    typical_consequences: ['Loss of condensation — product vapour passes uncondensed to vacuum system', 'Vacuum system overload — loss of vacuum performance', 'Loss of distillate product recovery'],
    typical_safeguards: ['Cooling medium flow indicator on condenser inlet', 'Low cooling medium flow alarm', 'Vacuum system performance monitoring'],
    typical_actions: ['Define minimum cooling medium flow for design condensation duty', 'Interlock vacuum system alarm on condenser cooling failure'],
  },
  {
    equipment_category: 'Vacuum Condenser', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Overcooling — condensate temperature too low, solidification risk',
    typical_causes: ['Excess cooling medium flow beyond design', 'Very cold cooling medium supply below design minimum', 'Cooling medium temperature below minimum design inlet'],
    typical_consequences: ['Product solidification or wax crystallisation in condenser tubes', 'Blocked condenser — pressure build-up upstream', 'Loss of vacuum due to blocked condenser'],
    typical_safeguards: ['Condensate outlet temperature indicator', 'Low condensate temperature alarm', 'Cooling medium inlet temperature indicator'],
    typical_actions: ['Define minimum condensate temperature to prevent solidification', 'Install cooling medium bypass or temperature control to prevent overcooling'],
  },
  {
    equipment_category: 'Vacuum Condenser', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High pressure in vacuum condenser — loss of vacuum',
    typical_causes: ['Blocked condensate outlet — liquid floods condenser', 'Non-condensable gas accumulation exceeding condenser capacity', 'Cooling medium tube leak — water ingress into vacuum side'],
    typical_consequences: ['Loss of vacuum in connected TWFE evaporator', 'Vacuum system overload', 'Product quality failure'],
    typical_safeguards: ['Absolute pressure indicator on condenser shell', 'High pressure (vacuum loss) alarm', 'Condensate level indicator in condenser'],
    typical_actions: ['Confirm condenser sized for maximum non-condensable gas load', 'Define condensate drain system capacity', 'Inspect tubes for cooling medium leak'],
  },
  {
    equipment_category: 'Vacuum Condenser', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Excess vacuum in condenser — deeper than design absolute pressure',
    typical_causes: ['Vacuum system over-capacity', 'Blocked condensate outlet with vacuum system continuing to pull'],
    typical_consequences: ['Air ingress through seals or flanges on vacuum side', 'Oxygen ingress to hot oil system — oxidation and fire risk', 'Structural overload at extreme vacuum'],
    typical_safeguards: ['Low pressure (deep vacuum) alarm', 'Oxygen detector near vacuum system inlet', 'Inert gas purge on system shutdown'],
    typical_actions: ['Confirm all connections, seals and flanges rated for maximum system vacuum', 'Define nitrogen purge procedure on shutdown'],
  },
  {
    equipment_category: 'Vacuum Condenser', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Condensate contamination — wrong fraction or cooling medium leak',
    typical_causes: ['Incorrect vacuum level causing off-target fraction to condense', 'Entrainment from TWFE evaporator reaching condenser', 'Cooling medium tube leak — water contaminates oil condensate'],
    typical_consequences: ['Off-spec condensate product', 'Water contamination of oil product', 'Downstream processing upset'],
    typical_safeguards: ['Condensate quality sample point before product storage', 'Cooling medium pressure maintained below vacuum side pressure on tube failure', 'Regular tube inspection'],
    typical_actions: ['Verify vacuum level vs condensation temperature curve for target fraction', 'Maintain cooling medium pressure below process side pressure on tube failure'],
  },

  // ── DEGASOIL FLASH VESSEL ─────────────────────────────────────────────────
  {
    equipment_category: 'Degasoil Flash Vessel', guideword: 'More', parameter: 'Level', applicable: true,
    deviation_description: 'High liquid level — liquid carryover to gas outlet',
    typical_causes: ['Liquid inlet flow greater than outlet rate', 'Outlet pump failure', 'Level control valve fails closed on liquid outlet'],
    typical_consequences: ['Liquid carryover to gas (light ends) outlet system', 'Fouling of downstream gas handling equipment', 'Loss of separation duty'],
    typical_safeguards: ['High level alarm', 'High-high level trip on inlet or liquid outlet pump', 'Level indicator independent of control loop'],
    typical_actions: ['Confirm HH level trip is independent of HL alarm loop', 'Size liquid outlet for maximum inlet flow rate'],
  },
  {
    equipment_category: 'Degasoil Flash Vessel', guideword: 'Less', parameter: 'Level', applicable: true,
    deviation_description: 'Low liquid level — gas blow-through to liquid outlet',
    typical_causes: ['Liquid outlet withdrawal exceeds inlet rate', 'Level control valve fails open', 'Outlet pump over-speed (VFD)'],
    typical_consequences: ['Gas blow-through to oil outlet pump — cavitation', 'Two-phase flow downstream', 'Loss of liquid seal in vessel'],
    typical_safeguards: ['Low level alarm', 'Low-low level pump trip or level control interlock'],
    typical_actions: ['Set LL level trip above liquid outlet nozzle elevation', 'Define minimum liquid residence time in vessel design'],
  },
  {
    equipment_category: 'Degasoil Flash Vessel', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'Overpressure in flash vessel — gas cannot escape',
    typical_causes: ['Blocked gas outlet', 'Pressure control valve fails closed', 'Excessive light ends in feed — flash rate exceeds gas outlet capacity'],
    typical_consequences: ['Vessel overpressure', 'Pressure relief activation', 'Gas release to atmosphere'],
    typical_safeguards: ['Pressure relief valve on vessel', 'High pressure alarm and trip', 'Pressure controller on gas outlet'],
    typical_actions: ['Confirm PRV sizing for maximum credible flash case', 'Verify vessel design pressure'],
  },
  {
    equipment_category: 'Degasoil Flash Vessel', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Loss of flash vessel pressure — excess gas removal or vacuum formation',
    typical_causes: ['Pressure control valve fails open', 'Loss of inlet flow — vessel draws to vacuum', 'Temperature drop causing vapour condensation'],
    typical_consequences: ['Vacuum formation if not rated for vacuum', 'Wax formation from temperature drop', 'Air ingress on non-rated vessel'],
    typical_safeguards: ['Low pressure alarm', 'Vacuum breaker if vessel is not vacuum-rated', 'Pressure controller with low limit'],
    typical_actions: ['Confirm vessel design pressure range includes minimum credible operating pressure', 'Install vacuum breaker if atmospheric design'],
  },
  {
    equipment_category: 'Degasoil Flash Vessel', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'High water content in feed oil entering flash vessel',
    typical_causes: ['Incomplete upstream dehydration', 'Water ingress in upstream feed storage', 'Inadequate dehydration column performance'],
    typical_consequences: ['Steam flash — pressure surge from sudden water vaporisation', 'Overpressure event if steam flash rate exceeds gas outlet capacity', 'Emulsion downstream'],
    typical_safeguards: ['Water content indicator or Karl Fischer analyser on feed', 'High pressure alarm on vessel', 'Upstream dehydration step interlock'],
    typical_actions: ['Confirm upstream dehydration effectiveness before starting flash vessel', 'Define maximum water content in feed for safe operation'],
  },

  // ── VACUUM EJECTOR SYSTEM ─────────────────────────────────────────────────
  {
    equipment_category: 'Vacuum Ejector System', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Loss of vacuum motive supply — total vacuum system failure',
    typical_causes: ['Motive steam supply failure to ejector', 'Vacuum pump failure (mechanical)', 'Motive steam control valve fails closed', 'Power failure to vacuum pump motor'],
    typical_consequences: ['Complete loss of vacuum in connected TWFE evaporator and condenser', 'Process shutdown — TWFE cannot operate without vacuum', 'Product loss and batch interruption'],
    typical_safeguards: ['Vacuum level indicator on process side', 'Low vacuum (high pressure) alarm with auto-shutdown of process', 'Standby vacuum pump or ejector with auto-switchover'],
    typical_actions: ['Define standby vacuum system requirement and auto-switchover logic', 'Confirm vacuum system capacity for full process load'],
  },
  {
    equipment_category: 'Vacuum Ejector System', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Excess vacuum — system operating below design absolute pressure',
    typical_causes: ['Ejector over-capacity relative to actual non-condensable gas load', 'Operating at reduced process load with full ejector capacity'],
    typical_consequences: ['Process operating below design vacuum — unintended fractions vaporise', 'Product quality impact from off-design separation', 'Air ingress risk at extreme vacuum'],
    typical_safeguards: ['Low pressure (deep vacuum) alarm on process', 'Vacuum bleed control valve', 'Absolute pressure indicator'],
    typical_actions: ['Install vacuum bleed valve to maintain design vacuum setpoint', 'Define absolute minimum pressure operating limit'],
  },
  {
    equipment_category: 'Vacuum Ejector System', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'Inadequate vacuum — system pressure too high',
    typical_causes: ['Air ingress greater than ejector capacity', 'Ejector nozzle fouling or erosion', 'Interstage condenser blockage', 'Motive steam pressure below minimum design'],
    typical_consequences: ['Elevated system pressure — loss of vacuum performance', 'TWFE product specification failure', 'Increased evaporator temperature required to compensate'],
    typical_safeguards: ['Absolute pressure indicator on process', 'High pressure (vacuum loss) alarm', 'Interstage condenser differential pressure monitoring'],
    typical_actions: ['Define maximum air ingress allowance for ejector sizing', 'Include ejector nozzle in annual maintenance inspection', 'Monitor motive steam pressure for minimum setpoint'],
  },
  {
    equipment_category: 'Vacuum Ejector System', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Backflow or steam contamination through ejector',
    typical_causes: ['Process backflow into ejector on shutdown without check valve', 'Wet motive steam — condensate causing water hammer in nozzle', 'Motive steam pressure falls below process pressure'],
    typical_consequences: ['Process fluid contamination of steam condensate system', 'Water hammer damage to ejector nozzle', 'Loss of ejector performance from nozzle damage'],
    typical_safeguards: ['Check valve on ejector discharge', 'Steam trap on motive steam supply', 'Minimum motive steam pressure interlock'],
    typical_actions: ['Define ejector shutdown sequence to prevent backflow', 'Confirm motive steam quality and minimum pressure specification', 'Include ejector nozzle in maintenance inspection schedule'],
  },

  // ── RESIDUE PUMP ──────────────────────────────────────────────────────────
  {
    equipment_category: 'Residue Pump', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No residue discharge — pump fails or blockage in suction',
    typical_causes: ['Residue pump failure', 'Residue solidification or wax blockage in suction line', 'Suction valve closed', 'High viscosity below design temperature'],
    typical_consequences: ['Residue backup — TWFE evaporator floods with un-evaporated residue', 'Rotor immersion — rotor damage and motor overload', 'Process shutdown from evaporator flooding'],
    typical_safeguards: ['Low residue flow alarm', 'Motor current monitoring — high current indicates blockage', 'Residue level indicator in evaporator sump'],
    typical_actions: ['Define minimum residue temperature for pumpability', 'Insulate and heat-trace all residue discharge lines and pump body', 'Interlock residue pump with evaporator level alarm'],
  },
  {
    equipment_category: 'Residue Pump', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'High residue temperature — thermal degradation and pump seal failure',
    typical_causes: ['Excessive jacket heating with reduced residue flow', 'Pump seal rated below actual residue temperature', 'Pump installed too close to hot evaporator without insulation break'],
    typical_consequences: ['Residue thermal cracking — coke formation in pump and lines', 'Mechanical seal failure — hot oil release', 'Fire risk from hot oil at seal'],
    typical_safeguards: ['High temperature alarm on residue discharge line', 'Residue temperature indicator at pump suction', 'Pump seal designed for maximum credible residue temperature'],
    typical_actions: ['Define maximum residue pump inlet temperature', 'Specify pump and seal material for high-temperature hot oil service'],
  },
  {
    equipment_category: 'Residue Pump', guideword: 'Less', parameter: 'Flow', applicable: true,
    deviation_description: 'Reduced residue flow — partial blockage or pump degradation',
    typical_causes: ['Partial solidification in suction line', 'Increased residue viscosity from temperature drop', 'Pump wear — reduced head and capacity'],
    typical_consequences: ['Evaporator level rise — potential flooding and rotor immersion', 'Process throughput reduction', 'Product quality degradation from longer residence time'],
    typical_safeguards: ['Low residue flow alarm', 'Motor current monitoring — rising current indicates increased viscosity', 'Evaporator level monitoring'],
    typical_actions: ['Define minimum residue discharge flow for stable evaporator operation', 'Monitor pump performance against curve for degradation trend'],
  },
  {
    equipment_category: 'Residue Pump', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'High discharge pressure — blocked residue outlet or solidification',
    typical_causes: ['Solidification in residue discharge piping', 'Downstream destination valve closed', 'Residue line inadequately heat-traced causing cool-down and wax formation'],
    typical_consequences: ['Pump deadhead — seal failure and mechanical damage', 'Hot oil pipe failure from overpressure', 'Loss of containment — fire risk with hot residue'],
    typical_safeguards: ['High discharge pressure alarm on residue pump', 'Pressure relief valve on pump discharge', 'Residue line heat tracing coverage monitoring'],
    typical_actions: ['Confirm heat tracing covers entire residue discharge line', 'Define startup procedure to verify outlet is free before starting pump'],
  },

  // ── DEHYDRATION COLUMN ────────────────────────────────────────────────────
  {
    equipment_category: 'Dehydration Column', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'No feed flow to dehydration column',
    typical_causes: ['Feed pump failure', 'Feed valve closed', 'Upstream feed storage vessel empty'],
    typical_consequences: ['Column runs dry — hot surfaces exposed without feed cooling', 'Risk of fire if oil drains to exposed heated surfaces', 'Process interruption — no dehydrated oil for downstream TWFE'],
    typical_safeguards: ['Low feed flow alarm', 'Column bottoms level indicator', 'Low flow interlock to column heater'],
    typical_actions: ['Interlock column heater with feed flow — trip heater on low flow', 'Define safe shutdown procedure on feed loss'],
  },
  {
    equipment_category: 'Dehydration Column', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'High column temperature — oil overheating and fire risk',
    typical_causes: ['Heater control failure — maximum heat input', 'Reduced feed rate with full heater duty', 'Steam supply over-pressure to reboiler'],
    typical_consequences: ['Oil overheating above flash point — fire risk on atmospheric column', 'Product thermal degradation', 'Coking of column internals'],
    typical_safeguards: ['High temperature alarm on column bottoms', 'High-high temperature trip (TSHH)', 'Pressure relief on steam reboiler side'],
    typical_actions: ['Define TSHH based on feed oil flash point (minimum 15 deg C margin below flash point)', 'Confirm column heater fail-safe state on feed loss'],
  },
  {
    equipment_category: 'Dehydration Column', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Low column temperature — incomplete water removal',
    typical_causes: ['Insufficient heating duty', 'Increased throughput beyond design capacity', 'Fouling of reboiler heat transfer surfaces'],
    typical_consequences: ['Inadequate water removal — water content in oil exceeds specification', 'Emulsion issues in downstream TWFE evaporator', 'Steam flash hazard in vacuum section from residual water'],
    typical_safeguards: ['Low bottoms temperature alarm', 'Outlet water content sample point or Karl Fischer analyser'],
    typical_actions: ['Define minimum bottoms temperature for water specification (<500 ppm water)', 'Confirm reboiler duty margin includes fouling factor'],
  },
  {
    equipment_category: 'Dehydration Column', guideword: 'More', parameter: 'Level', applicable: true,
    deviation_description: 'High level in dehydration column — water accumulation',
    typical_causes: ['Inlet flow with high water content greater than reboiler evaporation rate', 'Outlet pump failure', 'Accumulated free water in column bottoms'],
    typical_consequences: ['Water and oil carryover to overhead vapour system', 'Downstream contamination', 'Column flooding — loss of separation'],
    typical_safeguards: ['High level alarm on column bottoms', 'High-high level trip', 'Free water draw-off nozzle with drain'],
    typical_actions: ['Confirm HH level trip is independent of HL alarm loop', 'Define water draw-off procedure for column bottoms'],
  },
  {
    equipment_category: 'Dehydration Column', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'Overpressure in dehydration column — vent blocked or steam surging',
    typical_causes: ['Blocked overhead vent — steam and water vapour cannot escape', 'Vent valve closed during operation', 'Condensate accumulation blocking overhead vent line'],
    typical_consequences: ['Column overpressure — atmospheric column roof or nozzle failure', 'Loss of containment of hot oily vapour', 'Fire risk from hot oil release'],
    typical_safeguards: ['Pressure relief device on column (PRV or conservation vent)', 'High pressure alarm', 'Overhead vent line in maintenance inspection plan'],
    typical_actions: ['Confirm column pressure rating for maximum credible steam generation case', 'Include vent line in routine maintenance inspection'],
  },
  {
    equipment_category: 'Dehydration Column', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Contaminated feed or off-spec dehydrated oil',
    typical_causes: ['Feed oil contains incompatible fluids (glycols, acids, solvents)', 'Wrong grade of used oil charged', 'Upstream collection system contamination'],
    typical_consequences: ['Off-specification dehydrated oil product', 'Corrosion of column internals from acid or reactive fluids', 'Unexpected reaction or foaming in column at temperature'],
    typical_safeguards: ['Feed oil quality sample analysis before processing batch', 'Feed specification document and receiving inspection'],
    typical_actions: ['Define feed oil specification for dehydration column', 'Implement incoming oil quality test (water, acid number, compatibility check)'],
  },

  // ── VACUUM SERVICE (virtual — applied when operating_regime = vacuum) ──────
  {
    equipment_category: 'Vacuum Service', guideword: 'No', parameter: 'Flow', applicable: true,
    deviation_description: 'Air ingress — vacuum system boundary breached',
    typical_causes: ['Shaft seal or mechanical seal failure under vacuum conditions', 'Flange joint failure — gasket inadequate for vacuum service', 'Valve stem packing leak', 'Inspection access cover inadequately sealed after maintenance'],
    typical_consequences: ['Oxygen ingress — risk of explosive atmosphere with hot oil vapours', 'Product oxidation and quality degradation from oxygen contact', 'Loss of vacuum performance from non-condensable air load'],
    typical_safeguards: ['Vacuum level monitoring — performance degradation indicates air ingress', 'Oxygen detector near vacuum system inlet or ejector discharge', 'Nitrogen purge on vacuum system shutdown'],
    typical_actions: ['Confirm all flanges sealed with vacuum-rated gaskets and correct bolt torque', 'Define pre-start pressure test procedure under vacuum for each campaign', 'Implement nitrogen purge on shutdown to prevent air entry'],
  },
  {
    equipment_category: 'Vacuum Service', guideword: 'Less', parameter: 'Pressure', applicable: true,
    deviation_description: 'Loss of vacuum — process pressure rises toward atmospheric',
    typical_causes: ['Vacuum system failure (ejector or pump)', 'Large air ingress event exceeding vacuum system capacity', 'Non-condensable gas accumulation beyond design load'],
    typical_consequences: ['Loss of vacuum distillation or evaporation duty', 'TWFE cannot achieve design separation without vacuum', 'Potential backpressure damage to atmospheric-rated downstream equipment'],
    typical_safeguards: ['Absolute pressure indicator on vacuum system process side', 'High pressure (vacuum loss) alarm with auto-shutdown of heating and feed', 'Automatic shutdown interlock on vacuum loss'],
    typical_actions: ['Define minimum acceptable vacuum level for process operation', 'Interlock heating and feed pump with vacuum level — shutdown on vacuum loss', 'Define restart procedure including vacuum establishment verification'],
  },
  {
    equipment_category: 'Vacuum Service', guideword: 'More', parameter: 'Pressure', applicable: true,
    deviation_description: 'Pressure surge into vacuum section — inadvertent pressurisation',
    typical_causes: ['Connection opened between atmospheric and vacuum section without establishing vacuum first', 'Condensate flooded line creates hydraulic backpressure into vacuum section', 'Check valve between vacuum and pressure sections fails'],
    typical_consequences: ['Sudden pressurisation of vacuum-designed equipment beyond design pressure', 'Flange or seal failure from pressure differential reversal', 'Risk of explosion if flammable vapours present when pressurised with air'],
    typical_safeguards: ['Check valve between atmospheric and vacuum sections', 'Pressure indicator on vacuum section with high alarm', 'Procedural interlock — vacuum established before opening connections'],
    typical_actions: ['Define startup sequence — vacuum must be verified before opening connection to process', 'Install check valve on all lines entering vacuum section from higher-pressure sections'],
  },

  // ── PHASE TRANSITION (virtual — applied when phase_state = two_phase/vapor) ─
  {
    equipment_category: 'Phase Transition', guideword: 'More', parameter: 'Temperature', applicable: true,
    deviation_description: 'Phase change failure — insufficient vaporisation of feed at operating vacuum',
    typical_causes: ['Insufficient heat input for target fraction vaporisation at design vacuum', 'Increased feed flow beyond evaporator thermal capacity', 'Feed composition heavier than design — requires higher temperature', 'Vacuum loss — boiling point rises, vaporisation insufficient'],
    typical_consequences: ['Liquid carry-over from evaporator to vapour outlet system', 'Flooding of downstream vapour-handling equipment', 'Reduced distillate recovery', 'Contamination of vapour stream with heavy non-target fraction'],
    typical_safeguards: ['Vapour outlet temperature indicator', 'Distillate flow rate indicator — low flow indicates insufficient vaporisation', 'Differential pressure across evaporation section'],
    typical_actions: ['Confirm evaporator duty margins include worst-case feed composition range', 'Define alarm on low distillate flow rate', 'Monitor feed composition for changes from design basis'],
  },
  {
    equipment_category: 'Phase Transition', guideword: 'Less', parameter: 'Temperature', applicable: true,
    deviation_description: 'Premature condensation — vapour condenses before reaching intended condenser',
    typical_causes: ['Insufficient insulation or heat tracing on vapour transfer lines', 'Ambient cooling of exposed vapour piping in cold weather', 'Operating at lower temperature than design with same vacuum level'],
    typical_consequences: ['Liquid holdup in vapour transfer lines — two-phase flow', 'Slug flow causing vibration, pipe stress and flange loading', 'Condensate backup to evaporator — potential flooding'],
    typical_safeguards: ['Temperature indicator on vapour transfer line between evaporator and condenser', 'Vapour line drain pots at low points', 'Heat tracing continuity monitoring on vapour lines'],
    typical_actions: ['Define minimum vapour line temperature to prevent condensation', 'Confirm heat tracing coverage on all vapour transfer lines', 'Size vapour line drain pots for maximum condensate rate'],
  },
  {
    equipment_category: 'Phase Transition', guideword: 'Other Than', parameter: 'Composition', applicable: true,
    deviation_description: 'Phase separation failure — wrong phase present in outlet stream',
    typical_causes: ['Phase interface control failure in two-phase separator', 'Vapour velocity above entrainment threshold — liquid mist in vapour outlet', 'Emulsion formation preventing clean phase separation', 'Feed composition outside design range altering phase boundary'],
    typical_consequences: ['Liquid in vapour outlet — flooding of downstream equipment', 'Vapour in liquid outlet — two-phase flow to pump', 'Product quality failure — both outlets off-specification'],
    typical_safeguards: ['Phase interface level indicator', 'Entrainment separator or demister on vapour outlet', 'Vapour outlet velocity limiter by design'],
    typical_actions: ['Confirm design vapour velocity is below entrainment threshold', 'Specify demister type and efficiency for vapour outlet', 'Define alarm on phase interface high/low level'],
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
