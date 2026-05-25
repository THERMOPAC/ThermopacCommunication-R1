# HAZOP Module — Phase 3A Execution Plan v1.0
# Deviation Library Expansion

**Status:** PLAN — AWAITING APPROVAL
**Date:** 2026-05-25
**Precedes:** `docs/hazop-phase3b-generation-engine-plan-v1.0.md` (to be written after 3A approval)
**Supersedes:** §2 of `docs/hazop-phase3-execution-plan-v1.0.md` (library scope extracted here)
**Parent Plan:** `docs/hazop-module-execution-plan-v2.0.md`
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 0. Motivation

The existing `hazop_deviation_library` contains 16 rows across 4 equipment categories:
Pump (6), Vessel (4), Heat Exchanger (4), Control Valve (2).

The 18-category Phase 2 equipment vocabulary includes 14 categories with zero library coverage:
Tank, Filter, Isolation Valve, Check Valve, Instrument, Heater, Column, Separator,
Vent, Drain, Utility System, Product Outlet, Waste Outlet, Next Loop.

Any HAZOP node whose steps contain only these 14 uncovered categories will generate
**zero deviations** in Phase 3B — making the generation engine useless for the majority
of real process nodes.

Phase 3A fully resolves this before Phase 3B implementation begins.

---

## 1. Phase 3A Scope

Phase 3A is exclusively a **data expansion and governance definition** phase.

### 1.1 Deliverables

| # | Deliverable |
|---|---|
| 1 | 62+ new rows in `hazop_deviation_library` covering all 14 missing categories |
| 2 | Updated `server/scripts/seed-hazop-library.ts` with all new entries |
| 3 | Post-seed DB verification confirming row counts per category |
| 4 | Library governance rules (versioning, change control, parameter vocabulary) |
| 5 | Reviewed deviation topology-change behaviour defined (binding for Phase 3B) |
| 6 | 27 ZTA checks — all pass before Phase 3B begins |

### 1.2 Explicit Phase 3A Exclusions

- No generation engine routes
- No worksheet UI
- No new DB tables or schema changes
- No changes to any existing 16 library rows (they are preserved as-is)
- No changes to `server/hazop-routes.ts`
- No changes to any client-side files

---

## 2. Parameter Vocabulary Expansion

The existing library uses five IEC 61882 parameters: `Flow`, `Pressure`, `Temperature`,
`Level`, `Composition`.

Phase 3A adds two instrument-specific parameters for the `Instrument` equipment category:

| New Parameter | Applicable To | Meaning |
|---|---|---|
| `Signal` | Instrument only | Instrument output signal — loss, failure, bad quality |
| `Reading` | Instrument only | Measured value accuracy — high, low, or wrong reading |

These parameters are string values stored in the `parameter` column. The UNIQUE constraint
`(equipment_category, guideword, parameter)` scopes them. Using `Signal` and `Reading`
only for the `Instrument` category prevents vocabulary contamination.

**Phase 3A parameter vocabulary (complete):**

```
Flow | Pressure | Temperature | Level | Composition | Signal | Reading
```

---

## 3. Deviation Mapping Matrix

The matrix below defines which (guideword, parameter) combinations apply per equipment
category. This is the authoritative specification — it defines the exact set of library
rows to be seeded.

✓ = row exists or will be seeded  ✗ = not applicable  — = not relevant

| Category | No/Flow | More/Flow | Less/Flow | Reverse/Flow | More/Level | Less/Level | More/Pressure | Less/Pressure | More/Temp | Less/Temp | Other Than/Comp | No/Signal | More/Reading | Less/Reading | Other Than/Reading |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Pump** | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| **Heat Exchanger** | ✓ | — | — | — | — | — | — | — | ✓ | ✓ | ✓ | — | — | — | — |
| **Vessel** | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| **Control Valve** | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| **Tank** | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — |
| **Heater** | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| **Column** | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| **Separator** | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — |
| **Filter** | ✓ | — | ✓ | — | — | — | ✓ | — | — | — | ✓ | — | — | — | — |
| **Isolation Valve** | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| **Check Valve** | ✓ | — | — | ✓ | — | — | ✓ | — | — | — | — | — | — | — | — |
| **Instrument** | — | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ |
| **Utility System** | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — |
| **Drain** | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| **Vent** | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| **Product Outlet** | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | ✓ | — | — | — | — |
| **Waste Outlet** | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| **Next Loop** | ✓ | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — |

**Counts:**

| Category | Existing Rows | New Rows | Total |
|---|:---:|:---:|:---:|
| Pump | 6 | 0 | **6** |
| Heat Exchanger | 4 | 0 | **4** |
| Vessel | 4 | 0 | **4** |
| Control Valve | 2 | 0 | **2** |
| Tank | 0 | 6 | **6** |
| Heater | 0 | 4 | **4** |
| Column | 0 | 9 | **9** |
| Separator | 0 | 5 | **5** |
| Filter | 0 | 4 | **4** |
| Isolation Valve | 0 | 3 | **3** |
| Check Valve | 0 | 3 | **3** |
| Instrument | 0 | 4 | **4** |
| Utility System | 0 | 5 | **5** |
| Drain | 0 | 3 | **3** |
| Vent | 0 | 3 | **3** |
| Product Outlet | 0 | 4 | **4** |
| Waste Outlet | 0 | 3 | **3** |
| Next Loop | 0 | 3 | **3** |
| **TOTAL** | **16** | **62** | **78** |

---

## 4. Full Library Specification — New Entries

All 62 new entries are defined below. Format mirrors the existing seed file.

---

### 4.1 TANK (6 entries)

**Tank / No / Flow**
- Description: `No flow into tank — supply interrupted`
- Causes: `["Inlet valve closed or failed shut", "Feed pump failure", "Supply vessel empty", "Blockage in feed line"]`
- Consequences: `["Tank runs dry", "Outlet pump cavitation", "Downstream process starvation"]`
- Safeguards: `["Low level alarm on tank", "Low-low level pump trip", "Level indicator"]`
- Actions: `["Define minimum level setpoint for LAL", "Verify tank has sufficient working volume for process demand"]`

**Tank / More / Level**
- Description: `High level in tank — inlet exceeds outlet`
- Causes: `["Inlet flow greater than outlet withdrawal rate", "Outlet pump failure", "Outlet valve closed", "Level controller failure — inlet valve stuck open"]`
- Consequences: `["Tank overflow", "Loss of containment", "Environmental release", "Structural damage to roof on fixed-roof tank"]`
- Safeguards: `["High level alarm", "High-high level trip closing inlet valve", "Overflow nozzle directed to bund"]`
- Actions: `["Verify HH level trip is independent of HA alarm loop", "Confirm bund capacity ≥ tank working volume"]`

**Tank / Less / Level**
- Description: `Low level in tank — outlet exceeds inlet`
- Causes: `["Outlet withdrawal greater than inlet supply", "Tank leakage", "Drain valve inadvertently left open", "Metering error"]`
- Consequences: `["Outlet pump cavitation", "Loss of process inventory", "Air ingress to pump suction"]`
- Safeguards: `["Low level alarm", "Low-low level pump trip", "Level transmitter"]`
- Actions: `["Set LL trip above vortex-forming level for outlet pump NPSH", "Inspect drain valve for tight closure"]`

**Tank / More / Pressure**
- Description: `High pressure in tank — vent undersized or blocked`
- Causes: `["Blocked or undersized vent", "Loss of inert gas blanket control — N2 over-pressure", "Thermal expansion during filling", "Temperature rise from ambient heating"]`
- Consequences: `["Tank overpressure — roof lift on atmospheric tank", "Rupture", "Loss of containment"]`
- Safeguards: `["Pressure relief valve or conservation vent", "High pressure alarm", "Pressure indicator"]`
- Actions: `["Confirm vent sizing for maximum fill rate and thermal breathing case", "Verify PRV/conservation vent set pressure vs tank design pressure"]`

**Tank / Less / Pressure**
- Description: `Vacuum in tank — vent blocked during rapid drawdown`
- Causes: `["Blocked vent during rapid pumpout", "Cold weather — vapour condensation creating vacuum", "Failing to open vent before emptying tank"]`
- Consequences: `["Tank collapse — implosion", "Structural failure", "Roof collapse on fixed-roof atmospheric tank"]`
- Safeguards: `["Vacuum breaker", "Conservation vent rated for both pressure and vacuum", "Low pressure alarm"]`
- Actions: `["Confirm tank design standard (atmospheric vs pressure)", "Install vacuum breaker if not rated for full vacuum", "Define emptying procedure including vent opening sequence"]`

**Tank / Other Than / Composition**
- Description: `Wrong material or contamination in tank`
- Causes: `["Wrong material charged to tank", "Contamination from previous batch — inadequate cleaning", "Cross-connection to wrong supply line"]`
- Consequences: `["Off-spec product", "Uncontrolled reaction if incompatible materials mixed", "Product rejection and loss"]`
- Safeguards: `["Material specification check procedure before filling", "Sample analysis before use", "Dedicated filling connection with physical or keyed interlock"]`
- Actions: `["Implement material verification procedure", "Consider colour-coding or interlocked connections for incompatible services"]`

---

### 4.2 HEATER (4 entries)

**Heater / No / Temperature**
- Description: `No heat output — heater fails`
- Causes: `["Heating element failure (electric heater)", "Steam supply failure", "Fuel supply failure (fired heater)", "Temperature controller failure — shuts off heat input entirely"]`
- Consequences: `["Process fluid below required temperature", "Viscosity increase affecting downstream equipment", "Freezing risk in cold climates", "Process upset downstream"]`
- Safeguards: `["Low temperature alarm on heater outlet", "Temperature controller", "Heater duty indicator"]`
- Actions: `["Define minimum acceptable outlet temperature", "Assess freeze protection requirement for design basis", "Confirm heater startup sequence"]`

**Heater / More / Temperature**
- Description: `High temperature — heater overheats process fluid`
- Causes: `["Temperature controller failure — full heat input", "Steam control valve stuck open", "Loss of process flow through heater (dry firing)", "Excess electrical supply on electric heater"]`
- Consequences: `["Overheating of process fluid", "Product degradation or polymerisation", "Vaporisation of liquid causing two-phase flow", "Auto-ignition risk if flammable fluid"]`
- Safeguards: `["High temperature alarm on outlet", "High-high temperature trip (TSHH)", "Temperature safety cutout (TSH)"]`
- Actions: `["Define TSHH setpoint based on fluid auto-ignition or degradation temperature", "Confirm heater design accounts for dry-out condition", "Review fail-safe state of heating control valve"]`

**Heater / More / Pressure**
- Description: `Overpressure in heater — blocked outlet with continuous heating`
- Causes: `["Blocked outlet line with continuous heat input — thermal expansion of trapped fluid", "Steam trapped in shell side on shutdown", "Flash steam on sudden pressure drop"]`
- Consequences: `["Overpressure of heater shell or tube side", "Pipe or joint failure", "Loss of containment"]`
- Safeguards: `["Pressure relief valve on heater", "High pressure alarm", "Thermal relief valve on blocked-in sections"]`
- Actions: `["Confirm PRV sizing includes locked-in liquid expansion case", "Verify heater design pressure for credible blocked-in scenario"]`

**Heater / Less / Pressure**
- Description: `Vacuum in heater — condensation on shutdown without vacuum protection`
- Causes: `["Rapid draining of heater creating vacuum", "Steam condensation on shell side during cooldown without vacuum break", "Cold steam supply on startup causing condensate buildup"]`
- Consequences: `["Heater shell collapse if not vacuum-rated", "Air ingress to steam side", "Waterhammer on steam admission"]`
- Safeguards: `["Vacuum breaker on steam side", "Low pressure alarm on shell side", "Steam trap with proper sizing"]`
- Actions: `["Confirm heater shell design pressure includes full vacuum on steam side", "Define shutdown steam venting procedure"]`

---

### 4.3 COLUMN (9 entries)

**Column / No / Flow**
- Description: `No feed flow to column`
- Causes: `["Feed pump failure", "Feed valve closed", "Feed line blockage"]`
- Consequences: `["Column runs dry", "Loss of separation", "Hot spots in reboiler — dry firing", "Reboiler tube damage"]`
- Safeguards: `["Low feed flow alarm", "Feed flow transmitter", "Column bottoms level indicator"]`
- Actions: `["Define minimum feed rate below which column must be safely shut down", "Interlock reboiler with feed flow"]`

**Column / More / Flow**
- Description: `Excess feed flow — column flooding`
- Causes: `["Feed rate exceeds design column capacity", "Reflux ratio too high", "Partial vapour path blockage — downcomer flooding"]`
- Consequences: `["Column flooding", "Loss of separation", "Liquid carry-over to overhead system", "Column differential pressure exceedance"]`
- Safeguards: `["High differential pressure alarm across column trays", "Feed flow controller with high limit"]`
- Actions: `["Define flood point and set DP alarm at 80% of flood DP", "Confirm column capacity margins in design basis"]`

**Column / Less / Flow**
- Description: `Reduced feed flow — column weeping`
- Causes: `["Feed rate below minimum stable operation", "Inadequate vapour velocity in trays", "Upstream feed interruption — partial"]`
- Consequences: `["Tray weeping", "Loss of separation efficiency", "Off-spec overhead and bottoms product"]`
- Safeguards: `["Feed flow controller with low alarm", "Tray differential pressure indicator"]`
- Actions: `["Define minimum stable flow rate", "Consider column turndown capacity in design"]`

**Column / More / Temperature**
- Description: `High temperature — reboiler overheats bottoms`
- Causes: `["Reboiler duty controller failure — maximum heat input", "Reboiler steam valve stuck open", "Exothermic reaction in column bottoms", "Low feed rate with full reboiler duty"]`
- Consequences: `["Product degradation in bottoms", "Runaway reaction if reactive system", "Pressure increase from over-vaporisation"]`
- Safeguards: `["High temperature alarm on bottoms", "Reboiler steam flow controller", "High-high temperature trip on reboiler outlet"]`
- Actions: `["Review reaction hazard for reactive components in bottoms", "Define TSHH for reboiler", "Confirm fail-safe position of reboiler steam valve"]`

**Column / Less / Temperature**
- Description: `Low temperature — insufficient separation`
- Causes: `["Insufficient reboiler duty", "Condenser overcooling", "Feed temperature too low", "Excessive reflux"]`
- Consequences: `["Insufficient separation", "Off-spec overhead product — heavy components present", "Off-spec bottoms product — light components remaining"]`
- Safeguards: `["Low temperature alarm on bottoms", "Overhead temperature indicator and alarm"]`
- Actions: `["Define minimum bottoms temperature for product specification", "Confirm reboiler duty margins including fouling factor"]`

**Column / More / Pressure**
- Description: `High pressure — condenser failure or blocked overhead`
- Causes: `["Blocked condenser or overhead vapour line", "Condenser cooling medium failure", "Pressure control valve on overhead fails closed", "Excess vapour generation from overheating"]`
- Consequences: `["Column overpressure", "Pressure relief device activation", "Loss of containment from flanges or relief"]`
- Safeguards: `["Pressure relief valve on column", "High pressure alarm", "Condenser cooling medium flow indicator"]`
- Actions: `["Confirm PRV sizing for maximum credible case: total reflux with condenser failure", "Verify column design pressure"]`

**Column / Less / Pressure**
- Description: `Sub-atmospheric pressure — condenser overcooling or control valve fails open`
- Causes: `["Pressure control valve on overhead fails open", "Excess condenser duty — sub-cooling of vapour", "Loss of feed with reboiler still operating"]`
- Consequences: `["Column sub-atmospheric operation if not vacuum-rated", "Air ingress through shaft seals or flanges", "Vacuum collapse of non-vacuum-rated column"]`
- Safeguards: `["Low pressure alarm on overhead", "Pressure controller low set point limit", "Vacuum breaker on atmospheric-design columns"]`
- Actions: `["Confirm column design pressure range includes minimum credible operating pressure", "Install vacuum breaker if column is not vacuum-designed"]`

**Column / Less / Level**
- Description: `Low bottoms level — liquid seal lost`
- Causes: `["Bottoms pump withdrawal exceeds reboiler feed", "Level control valve fails open", "Reboiler starvation"]`
- Consequences: `["Gas blow-through to bottoms pump — cavitation and seal failure", "Loss of liquid seal in column bottoms sump", "Two-phase flow to bottoms pump"]`
- Safeguards: `["Low level alarm on bottoms", "Low-low level bottoms pump trip", "Level transmitter"]`
- Actions: `["Define LL level above column bottoms outlet nozzle to prevent vapour breakthrough"]`

**Column / Other Than / Composition**
- Description: `Off-spec feed or contamination in column`
- Causes: `["Feed contamination from upstream process upset", "Wrong feed material charged", "Flooding causing carry-over of non-target components", "Degradation products accumulating"]`
- Consequences: `["Off-spec overhead or bottoms product", "Downstream processing upset", "Product rejection and loss"]`
- Safeguards: `["Feed quality analyser or sample point upstream of column", "Product quality analyser or sample point on both outlets"]`
- Actions: `["Implement product quality check before transfer downstream", "Define feed specification limits for column operation"]`

---

### 4.4 SEPARATOR (5 entries)

**Separator / More / Level**
- Description: `High liquid level — carry-over to gas outlet`
- Causes: `["Liquid inlet exceeds liquid outlet rate", "Level control valve fails closed", "Outlet pump failure", "Emulsion formation reducing separation efficiency"]`
- Consequences: `["Liquid carry-over to gas outlet system", "Downstream gas equipment damage (compressor flooding)", "Loss of separation"]`
- Safeguards: `["High level alarm", "High-high level trip closing inlet or stopping feed pump", "Level indicator — independent of control loop"]`
- Actions: `["Confirm HH level trip is independent of HL alarm system", "Define maximum acceptable liquid carry-over to gas outlet"]`

**Separator / Less / Level**
- Description: `Low liquid level — gas blow-through to liquid outlet`
- Causes: `["Liquid outlet withdrawal exceeds inlet rate", "Level control valve fails open", "Excessive liquid draw rate"]`
- Consequences: `["Gas blow-through to liquid outlet pump — cavitation", "Loss of liquid seal in separator", "Two-phase flow downstream"]`
- Safeguards: `["Low level alarm", "Low-low level trip closing liquid outlet valve", "Level indicator"]`
- Actions: `["Define LL level above liquid outlet nozzle to prevent gas blow-through", "Set LL trip setpoint with adequate margin above outlet nozzle"]`

**Separator / More / Pressure**
- Description: `Overpressure in separator — blocked outlet`
- Causes: `["Blocked gas outlet", "Inlet surge — sudden high pressure pulse", "Pressure control valve fails closed", "Excess gas generation from inlet stream"]`
- Consequences: `["Vessel overpressure", "Pressure relief device activation", "Loss of containment"]`
- Safeguards: `["Pressure relief valve", "High pressure alarm and trip", "Pressure controller on gas outlet"]`
- Actions: `["Confirm PRV sizing for blocked gas outlet case", "Verify separator design pressure"]`

**Separator / Less / Pressure**
- Description: `Sub-atmospheric pressure in separator`
- Causes: `["Pressure control valve on outlet fails open", "Sudden loss of inlet flow with gas outlet still open", "Excessive gas withdrawal rate"]`
- Consequences: `["Sub-atmospheric operation if not vacuum-rated", "Air ingress through seals and flanges", "Potential collapse if atmospheric design"]`
- Safeguards: `["Low pressure alarm", "Vacuum breaker on separator (if applicable)"]`
- Actions: `["Confirm separator design pressure range for minimum credible operating pressure"]`

**Separator / Other Than / Composition**
- Description: `Separation failure — off-spec separated streams`
- Causes: `["Demister pad failure — excessive liquid in gas outlet", "Emulsion carry-over due to chemical or temperature conditions", "Contamination in inlet stream changing separation characteristics"]`
- Consequences: `["Off-spec gas stream", "Off-spec liquid stream", "Downstream equipment damage from contaminated streams"]`
- Safeguards: `["Demister pad (mesh or vane type)", "Inlet coalescer upstream of separator", "Regular inspection of demister pad"]`
- Actions: `["Define maximum liquid carry-over to gas outlet specification", "Include demister inspection in maintenance schedule"]`

---

### 4.5 FILTER (4 entries)

**Filter / No / Flow**
- Description: `No flow through filter — element fully blocked`
- Causes: `["Filter element choked with particulate — end of service life", "Element collapse causing reverse blockage", "Inlet valve inadvertently closed"]`
- Consequences: `["Process flow stopped", "Upstream pressure increase", "Pump damage from deadhead"]`
- Safeguards: `["Differential pressure indicator across filter", "High DP alarm", "Bypass line with isolation valve"]`
- Actions: `["Define maximum DP for filter change-out", "Establish filter cleaning and replacement interval based on expected particulate loading"]`

**Filter / Less / Flow**
- Description: `Reduced flow through filter — partial blockage`
- Causes: `["Filter element partially choked — increasing particulate loading", "Differential pressure rising across element"]`
- Consequences: `["Reduced process throughput", "Elevated upstream pressure", "Upstream equipment affected"]`
- Safeguards: `["Differential pressure indicator across filter", "High DP alarm (early warning before No Flow)"]`
- Actions: `["Set DP alarm at 50% of maximum allowable DP for early warning", "Define element cleaning trigger criteria"]`

**Filter / More / Pressure**
- Description: `High upstream pressure — sudden filter blockage`
- Causes: `["Sudden complete blockage of filter element", "Bypass valve closed with filter blocked — no alternative flow path"]`
- Consequences: `["Overpressure of upstream piping and equipment", "Pipe or fitting failure", "Seal damage on upstream pump"]`
- Safeguards: `["Pressure relief on upstream side of filter", "High pressure alarm upstream"]`
- Actions: `["Confirm upstream piping and equipment rated for pump shut-off pressure", "Verify PRV set point on upstream system"]`

**Filter / Other Than / Composition**
- Description: `Filter media migration — contamination of downstream fluid`
- Causes: `["Filter element rupture — pass-through of particulate", "Incorrect filter element installed — wrong grade or material", "Element bypass due to seal failure"]`
- Consequences: `["Downstream equipment damage from particulate", "Product contamination", "Instrument fouling downstream"]`
- Safeguards: `["Downstream sampling point or inline analyser", "Filter element pressure integrity test procedure"]`
- Actions: `["Include filter element pressure test in maintenance procedure", "Verify element grade selection against particulate size specification"]`

---

### 4.6 ISOLATION VALVE (3 entries)

**Isolation Valve / No / Flow**
- Description: `Isolation valve fails closed — process flow blocked`
- Causes: `["Valve actuator failure — pneumatic or electric", "Instrument air failure with fail-closed actuator", "Manual valve inadvertently left closed after maintenance"]`
- Consequences: `["Process flow stopped", "Upstream pressure build-up", "Downstream equipment starvation"]`
- Safeguards: `["Valve position indicator — limit switches", "Flow indicator downstream", "Interlock position monitoring in DCS"]`
- Actions: `["Confirm fail-safe position (FO/FC) is appropriate for the process safety case", "Include in valve position monitoring system — alarm on unexpected closure"]`

**Isolation Valve / More / Flow**
- Description: `Isolation valve fails open — unintended flow path created`
- Causes: `["Actuator failure on normally-closed valve", "Control signal loss causing inadvertent opening", "Manual valve inadvertently left open after maintenance"]`
- Consequences: `["Unintended flow path — cross-contamination or bypass of safeguards", "Downstream overfill", "Process upset"]`
- Safeguards: `["Valve position feedback to DCS with alarm on unexpected open", "Independent high flow alarm downstream of valve"]`
- Actions: `["Review fail-safe position", "Add position confirmation interlock where safety-critical"]`

**Isolation Valve / Reverse / Flow**
- Description: `Isolation valve fails to isolate — seat leakage in closed position`
- Causes: `["Valve fails to fully close — seat damage or debris on seat", "Excessive line pressure exceeding seat shut-off rating", "Mechanical damage to valve internals"]`
- Consequences: `["Process fluid bypasses intended isolation barrier", "Cross-contamination between isolated sections", "Loss of pressure containment during maintenance"]`
- Safeguards: `["Double-block-and-bleed arrangement where positive isolation is safety-critical", "Seat leakage test during maintenance shutdown"]`
- Actions: `["Define leakage class requirement (BS 6755 / API 598) for the service", "Include isolation valve in valve testing schedule"]`

---

### 4.7 CHECK VALVE (3 entries)

**Check Valve / No / Flow**
- Description: `Check valve stuck closed — intended forward flow blocked`
- Causes: `["Check valve disc stuck closed by debris lodged on seat", "Spring force too high relative to available forward pressure differential", "Incorrect check valve type or orientation for the application"]`
- Consequences: `["Forward flow stopped", "Upstream pump deadhead — seal and bearing damage", "Process interruption"]`
- Safeguards: `["Flow indicator upstream and downstream of check valve", "Differential pressure indicator across valve"]`
- Actions: `["Confirm check valve spring rating is appropriate for minimum flow pressure differential", "Include check valve in maintenance inspection scope"]`

**Check Valve / Reverse / Flow**
- Description: `Check valve fails to close — reverse flow not prevented`
- Causes: `["Disc fails to seat — worn seat, debris on seat, or disc break", "Slam-closure water hammer causing disc damage", "Incorrect orientation of check valve installed"]`
- Consequences: `["Back-flow of process fluid to upstream equipment", "Contamination of upstream vessel or system", "Reverse rotation of upstream pump — mechanical damage", "Siphoning and loss of inventory"]`
- Safeguards: `["Flow indicator or check valve position indicator", "Dual check valves in series for safety-critical backflow prevention"]`
- Actions: `["Define check valve type (swing, tilting disc, dual-plate) based on flow velocity and pulsation conditions", "Verify check valve is rated for the reverse pressure differential"]`

**Check Valve / More / Pressure**
- Description: `High upstream pressure — check valve stuck closed causing pump deadhead`
- Causes: `["Check valve stuck closed while upstream pump continues to run", "Deadhead condition — no outlet for pump discharge"]`
- Consequences: `["Pump deadhead overpressure on discharge side", "Mechanical seal failure", "Pipe overpressure between pump and check valve"]`
- Safeguards: `["Pressure relief valve on pump discharge upstream of check valve", "Low flow alarm with pump cutout", "Recirculation line with minimum flow bypass"]`
- Actions: `["Confirm pump curve maximum pressure does not exceed system design pressure", "Install minimum flow bypass if pump is unsuitable for extended deadhead operation"]`

---

### 4.8 INSTRUMENT (4 entries)

**Instrument / No / Signal**
- Description: `No instrument signal — total loss of measurement`
- Causes: `["Transmitter failure — power supply, electronics, or sensor", "Cable break or loose connection", "Impulse line blockage or freeze — DP transmitter", "Instrument air failure on pneumatic transmitter"]`
- Consequences: `["Loss of process measurement — control loop goes to manual or fails safe", "Process deviation undetected", "Operator response required immediately"]`
- Safeguards: `["DCS bad actor or signal failure alarm on loss of 4-20 mA", "Redundant instrument with independent measurement", "Instrument health monitoring and diagnostics in DCS"]`
- Actions: `["Define fail-safe output on signal loss (high/low/last good value)", "Implement 2oo3 voting logic for safety-critical measurements", "Confirm impulse line heat tracing if freezing risk"]`

**Instrument / More / Reading**
- Description: `Instrument reads high — incorrect high indication`
- Causes: `["Calibration drift — positive zero or span shift", "Condensation or liquid accumulation in high-pressure impulse leg (DP transmitter)", "Partial blockage of low-pressure reference leg causing apparent high reading", "Electrical interference on signal cable"]`
- Consequences: `["Control system takes incorrect action based on false high reading — overfeeds, overpressure, overfills", "Safeguards may take spurious action", "Operator may make incorrect manual intervention"]`
- Safeguards: `["Independent high reading alarm from separate instrument", "Cross-check with secondary or redundant instrument", "Regular calibration schedule with documented interval"]`
- Actions: `["Set calibration interval based on process fluid and service severity", "Consider redundant measurement and voting logic for critical control loops"]`

**Instrument / Less / Reading**
- Description: `Instrument reads low — incorrect low indication`
- Causes: `["Calibration drift — negative zero or span shift", "Partial blockage of high-pressure impulse leg (DP transmitter)", "Air entrainment in liquid-filled impulse lines", "Sensor fouling or coating reducing response"]`
- Consequences: `["Control system underestimates process variable — underfeeds, under-pressures", "Process deviation undetected until large enough to be obvious", "Safeguard trips may not actuate when they should"]`
- Safeguards: `["Independent low reading alarm from separate instrument", "Cross-check with secondary instrument", "Calibration schedule"]`
- Actions: `["Define minimum reading below which measurement is flagged as suspect", "Confirm impulse line configuration prevents air accumulation"]`

**Instrument / Other Than / Reading**
- Description: `Instrument reads wrong parameter — incorrect measurement entirely`
- Causes: `["Transmitter connected to wrong process connection at installation", "Wrong calibration range or units applied", "Instrument cross-wired in field junction box", "Wrong fluid fill in diaphragm seal system"]`
- Consequences: `["Completely incorrect process indication — operator and control system misled", "Control system applies wrong correction", "Safety function does not operate at the correct process condition"]`
- Safeguards: `["Loop check procedure during commissioning — verify reading against known process condition", "Tag verification: confirm instrument tag on P&ID matches physical tag in field"]`
- Actions: `["Include instrument loop check in pre-commissioning procedure", "Verify instrument range sheet matches P&ID design intent before installation"]`

---

### 4.9 UTILITY SYSTEM (5 entries)

**Utility System / No / Flow**
- Description: `Utility supply completely interrupted`
- Causes: `["Utility supply header shutdown or failure", "Utility control valve fails closed", "Utility header maintenance isolation — not coordinated with process", "Instrument air failure causing utility valve closure"]`
- Consequences: `["Complete loss of cooling, heating, or motive fluid as applicable", "Control loop failure — loop goes to manual or fails safe", "Process upset — potential safety-critical condition depending on utility"]`
- Safeguards: `["Utility supply pressure indicator", "Low utility supply pressure alarm", "Automatic process shutdown on critical utility failure"]`
- Actions: `["Define safe process shutdown procedure on loss of utility", "Identify safety-critical utilities requiring backup or UPS-protected control"]`

**Utility System / Less / Flow**
- Description: `Reduced utility flow — partial supply failure`
- Causes: `["Partial utility supply failure — header pressure drop", "Fouling of utility supply strainer or filter", "Increased demand from concurrent consumers on same header"]`
- Consequences: `["Reduced process heat duty or motive flow", "Temperature or pressure excursion on process side", "Multiple process units affected simultaneously"]`
- Safeguards: `["Utility flow indicator on branch to process", "Low utility flow alarm"]`
- Actions: `["Confirm utility system capacity is sized for maximum simultaneous demand across all consumers"]`

**Utility System / More / Flow**
- Description: `Excess utility flow — control valve fails open`
- Causes: `["Utility control valve fails fully open", "Manual override left on maximum during operation", "Controller signal failure commanding maximum opening"]`
- Consequences: `["Overcooling, overheating, or excess motive force as applicable", "Overpressure on process side from excess utility pressure", "Product quality impact from temperature excursion"]`
- Safeguards: `["Utility flow controller with high limit alarm", "Process-side temperature or pressure alarm"]`
- Actions: `["Review impact of maximum possible utility flow on process design conditions", "Confirm fail-safe position of utility control valve"]`

**Utility System / More / Temperature**
- Description: `Utility supply temperature too high`
- Causes: `["Utility temperature control failure — steam superheated, cooling water hot", "Wrong utility fluid connected to supply", "Heat recovery from adjacent system increasing utility temperature"]`
- Consequences: `["Product degradation from excess heat input", "Thermal stress on process equipment", "Downstream process upset"]`
- Safeguards: `["Utility supply temperature indicator", "High utility temperature alarm on supply header"]`
- Actions: `["Define maximum utility supply temperature in design basis", "Confirm process equipment is rated for maximum credible utility temperature"]`

**Utility System / Less / Temperature**
- Description: `Utility supply temperature too low`
- Causes: `["Cooling medium too cold — seasonal cold snap below design minimum", "Steam quality poor — wet steam with excessive condensate", "Utility supply from wrong source with different temperature"]`
- Consequences: `["Insufficient heat transfer — product below specification", "Freezing risk on process side of heat exchange equipment", "Condensate hammer in steam systems"]`
- Safeguards: `["Utility supply temperature indicator", "Low utility temperature alarm", "Steam trap installation for condensate removal"]`
- Actions: `["Confirm utility minimum supply temperature in design basis", "Assess freeze protection requirement for local climate"]`

---

### 4.10 DRAIN (3 entries)

**Drain / No / Flow**
- Description: `Drain cannot discharge — drain blocked or valve closed`
- Causes: `["Drain valve inadvertently closed or fails shut", "Drain line blocked by debris, scale, or solidified product", "Drain header at capacity — back-pressure preventing drain"]`
- Consequences: `["Equipment cannot be drained for maintenance", "Liquid accumulates in equipment intended to be drained", "Maintenance delayed — safety hazard during work"]`
- Safeguards: `["Manual isolation valve clearly labelled and position-checked", "Drain point inspection in maintenance procedure"]`
- Actions: `["Ensure drain lines have adequate slope toward drain header — no horizontal pockets", "Include drain valve in pre-maintenance check sequence"]`

**Drain / Reverse / Flow**
- Description: `Reverse flow — drain header backflows into process equipment`
- Causes: `["Drain header at higher pressure than drain point — pressurised drain system", "Drain header flooded — excessive liquid from concurrent draining operations", "Common drain header — cross-contamination from another process stream"]`
- Consequences: `["Contamination of drained equipment with drain header contents", "Liquid return to process — incorrect fluid re-introduced", "Operator exposure risk if drain contains hazardous fluid"]`
- Safeguards: `["Check valve on drain line close to process connection", "Dedicated drain connections for incompatible fluids — no common header"]`
- Actions: `["Review drain header pressure basis — confirm atmospheric separation or install check valve", "Segregate drain headers for incompatible services"]`

**Drain / More / Flow**
- Description: `Uncontrolled drain — drain valve open or fails open`
- Causes: `["Drain valve left open after previous operation", "Automatic drain valve actuator fails open", "Drain valve handle removed, damaged, or operated in error"]`
- Consequences: `["Loss of process inventory — unplanned", "Environmental release if drain not connected to closed collection system", "Flooding of drain sump — sump overflow"]`
- Safeguards: `["Double-valve drain arrangement (double block) for high-hazard services", "Drain sump with high level alarm", "Closed drain system with collection vessel"]`
- Actions: `["Define drain valve arrangement requirements for service hazard level (single vs double valve)", "Install drain to closed collection system for hazardous services"]`

---

### 4.11 VENT (3 entries)

**Vent / No / Flow**
- Description: `Vent blocked — connected equipment cannot relieve pressure or vacuum`
- Causes: `["Vent line blocked by ice, polymer deposit, or windblown debris", "Vent valve fails closed — actuated or manual", "Liquid accumulation in vent line forming seal — siphon lock"]`
- Consequences: `["Overpressure of connected equipment if inlet continues", "Vacuum collapse if connected equipment drains without vent relief", "Relief device may not activate if vent path is primary relief"]`
- Safeguards: `["Vent screen or guard against debris ingress", "Regular vent line inspection in maintenance plan", "Independent pressure relief device as backup to vent"]`
- Actions: `["Install heat tracing on vent lines in climates with freeze risk", "Include vent line in routine inspection scope — confirm free discharge", "Confirm vent sizing independently from PRV sizing"]`

**Vent / Reverse / Flow**
- Description: `Air ingress through vent — vacuum draws air into vessel`
- Causes: `["Rapid drawdown of connected vessel creating sub-atmospheric conditions", "Cold weather — vapour condensation in vessel creates vacuum", "Conservation vent vacuum setting lower than vessel vacuum rating"]`
- Consequences: `["Air ingress — potential explosive atmosphere if flammable vapours present inside vessel", "Oxygen ingress into inerted system — loss of inert blanket", "Risk of ignition inside vessel if flammable vapour present"]`
- Safeguards: `["Conservation vent combining pressure and vacuum relief functions", "Nitrogen purge or blanket on vessel", "Low pressure alarm on connected vessel"]`
- Actions: `["Confirm conservation vent vacuum setting is appropriate for vessel design basis", "Review inert gas blanket supply for adequacy during drawdown rates"]`

**Vent / More / Flow**
- Description: `Excess vapour release through vent — uncontrolled atmospheric discharge`
- Causes: `["Uncontrolled vapour generation in connected vessel — thermal runaway or vaporisation", "Relief event venting through atmospheric vent", "Vent valve stuck open with continuous flow"]`
- Consequences: `["Atmospheric dispersion of process vapour", "Potential toxic exposure to personnel near vent outlet", "Potential flammable cloud if vapour is flammable"]`
- Safeguards: `["Vent routed to safe elevated location or to scrubber/flare", "High pressure alarm on connected vessel before vent opens", "Vapour detection system near vent outlet if hazardous service"]`
- Actions: `["Confirm vent discharge location accounts for wind rose and personnel access areas", "Assess need for scrubber, flare, or vent treatment for toxic or flammable services"]`

---

### 4.12 PRODUCT OUTLET (4 entries)

**Product Outlet / No / Flow**
- Description: `No product discharge — outlet blocked or pump failed`
- Causes: `["Outlet valve closed or failed shut", "Delivery or transfer pump failure", "Downstream receiver isolated or full"]`
- Consequences: `["Product backup — upstream vessel level rises", "Upstream vessel overfill if feed continues", "Process shutdown"]`
- Safeguards: `["Outlet flow indicator", "High level alarm on upstream vessel", "Flow transmitter with alarm"]`
- Actions: `["Define interlock logic: close or alarm feed on loss of product outlet flow", "Confirm downstream receiver has adequate capacity"]`

**Product Outlet / More / Flow**
- Description: `Excess product discharge — metering or valve failure`
- Causes: `["Outlet metering valve fails open beyond setpoint", "Flow metering system failure — over-reading", "Product bypass valve inadvertently opened"]`
- Consequences: `["Over-delivery to downstream receiver", "Receiver overfill", "Product loss or incorrect batch volume"]`
- Safeguards: `["Flow meter on product outlet", "High flow alarm", "High level alarm on downstream receiver"]`
- Actions: `["Install flow totaliser with automatic cutoff on maximum batch volume", "Verify meter calibration interval"]`

**Product Outlet / Less / Flow**
- Description: `Reduced product discharge — partial obstruction`
- Causes: `["Partial valve closure — stem partially stroked", "Downstream restriction or back-pressure increase", "Partial pump degradation — reduced head"]`
- Consequences: `["Under-delivery — batch cycle extended", "Upstream vessel level increases", "Process throughput reduction"]`
- Safeguards: `["Outlet flow indicator", "Low flow alarm"]`
- Actions: `["Define minimum acceptable product delivery flow rate", "Monitor pump performance curve for degradation trend"]`

**Product Outlet / Other Than / Composition**
- Description: `Off-spec product at outlet — wrong quality discharged`
- Causes: `["Off-spec product from upstream process", "Wrong product tank connected to outlet header", "Contamination in outlet piping from previous product or cleaning"]`
- Consequences: `["Off-spec product delivered to customer or storage", "Product rejection", "Reprocessing cost and potential safety issue downstream"]`
- Safeguards: `["Product quality sample point or inline analyser before dispatch", "Dedicated product outlet piping — no shared headers with incompatible products"]`
- Actions: `["Implement quality sign-off procedure before product dispatch", "Define product specification and analyser alarm setpoints"]`

---

### 4.13 WASTE OUTLET (3 entries)

**Waste Outlet / No / Flow**
- Description: `Waste cannot discharge — outlet blocked or valve closed`
- Causes: `["Waste outlet valve closed or failed shut", "Drain or waste line blocked by debris or solidified waste", "Waste treatment header at capacity — backpressure"]`
- Consequences: `["Waste accumulates in process equipment", "Upstream vessel overfill", "Process backup — production stoppage"]`
- Safeguards: `["Waste vessel or sump level indicator", "High level alarm on upstream waste sump", "Flow indicator on waste outlet"]`
- Actions: `["Confirm waste collection and treatment capacity for maximum waste generation rate", "Define waste line flushing procedure to prevent blockage"]`

**Waste Outlet / More / Flow**
- Description: `Excess waste discharge — valve open or process upset`
- Causes: `["Waste outlet valve fails fully open", "Process upset generating excess waste beyond design rate", "Wrong stream routed to waste outlet"]`
- Consequences: `["Waste treatment system overloaded", "Environmental non-compliance if discharge exceeds permitted limits", "Downstream waste handling system flooded"]`
- Safeguards: `["Waste outlet flow indicator", "Waste treatment system capacity monitor or level indicator", "High flow alarm on waste outlet"]`
- Actions: `["Define maximum permitted waste discharge rate to waste treatment", "Size waste treatment system with surge capacity margin"]`

**Waste Outlet / Reverse / Flow**
- Description: `Reverse flow — waste header backflows into process`
- Causes: `["Waste collection header at higher pressure than process waste outlet", "Waste header blocked downstream — header floods back", "Common waste header — cross-contamination from adjacent process"]`
- Consequences: `["Waste from header enters process equipment — contamination", "Incompatible waste fluids mix in header — reaction risk"]`
- Safeguards: `["Check valve on waste outlet close to process connection", "Waste header pressure indicator — high pressure alarm"]`
- Actions: `["Install check valve on waste outlet where backflow would cause contamination or safety hazard", "Segregate waste headers for incompatible waste streams"]`

---

### 4.14 NEXT LOOP (3 entries)

**Next Loop / No / Flow**
- Description: `No flow to downstream loop — inter-loop connection blocked`
- Causes: `["Block valve between loops closed — maintenance or operational error", "Downstream loop isolated or shut down for maintenance", "Downstream loop pump or transfer equipment failure"]`
- Consequences: `["Upstream loop pressure build-up", "Upstream vessel overfill if feed continues", "Downstream loop starved — process interruption"]`
- Safeguards: `["Inter-loop flow indicator", "High pressure alarm on upstream loop outlet", "High level alarm on upstream loop vessel"]`
- Actions: `["Define operational procedure for inter-loop startup and shutdown sequence", "Consider interlock: alarm upstream if inter-loop flow drops to zero while feed continues"]`

**Next Loop / Reverse / Flow**
- Description: `Reverse flow from downstream loop back to upstream loop`
- Causes: `["Downstream loop pressure higher than upstream loop due to process upset", "Check valve on inter-loop connection fails to close", "Parallel pump configuration — one pump driving backflow through stopped pump"]`
- Consequences: `["Back-flow from downstream loop contaminates upstream loop", "Upstream loop equipment exposed to downstream process conditions — temperature, pressure, composition", "Loss of upstream loop inventory"]`
- Safeguards: `["Check valve on inter-loop connection", "Flow indicator with reverse flow alarm on inter-loop line"]`
- Actions: `["Confirm inter-loop check valve is rated for maximum reverse pressure differential", "Review design basis for upstream equipment against downstream loop maximum conditions"]`

**Next Loop / Less / Flow**
- Description: `Reduced flow to downstream loop — partial restriction`
- Causes: `["Partial blockage in inter-loop piping", "Upstream loop throughput reduced — less available for downstream", "Inter-loop control valve partially closed or degraded"]`
- Consequences: `["Downstream loop starvation — reduced throughput", "Downstream loop process upset from reduced feed", "Upstream loop backup if feed continues at normal rate"]`
- Safeguards: `["Inter-loop flow indicator", "Low flow alarm on downstream loop inlet"]`
- Actions: `["Define minimum inter-loop flow rate for stable downstream loop operation", "Assess cascade effect on downstream process from reduced flow"]`

---

## 5. Category-Specific Safeguard Rules

These rules govern what safeguard types should be present for each category.
They are applied as advisory checks in the library review process — not enforced by code
in Phase 3A.

| Category | Required Safeguard Types | Notes |
|---|---|---|
| Tank | Level alarm (high + low), PRV or conservation vent | Atmospheric tanks: conservation vent mandatory |
| Pump | Flow alarm (low), pressure relief on discharge | Low-flow cutout for dry-running protection |
| Heat Exchanger | Temperature alarm on outlet, differential pressure monitoring | Tube leak detection for hazardous services |
| Heater | Temperature alarm + TSHH trip, PRV | TSHH must be independent of control loop |
| Vessel | Level alarm (high + low), PRV | PRV mandatory for pressure vessels |
| Column | Pressure alarm (high + low), temperature alarm, level on bottoms | PRV sized for blocked condenser case |
| Separator | Level alarm (high + low), pressure alarm, PRV | HH level trip must be independent of control |
| Filter | Differential pressure indicator + high DP alarm | Bypass line recommended |
| Control Valve | Fail-safe position documentation, manual isolation | Manual bypass for continuous service |
| Isolation Valve | Position indicator | Double-block for safety-critical isolation |
| Check Valve | Downstream flow indicator | Dual check for safety-critical backflow prevention |
| Instrument | Signal failure alarm in DCS | Redundancy (2oo3) for safety-critical measurements |
| Utility System | Supply pressure/flow indicator, low pressure alarm | Critical utilities: backup or UPS-protected |
| Drain | Double-valve for hazardous service | Closed system for hazardous services |
| Vent | Independent PRV as backup | Heat tracing in cold climates |
| Product Outlet | Flow meter + totaliser | Quality check before dispatch |
| Waste Outlet | Sump level indicator, check valve | Waste treatment capacity sizing |
| Next Loop | Inter-loop flow indicator | Check valve for reverse flow prevention |

---

## 6. Minimum Required Deviation Coverage Per Category

This defines the minimum number of library entries that must exist for each category
before Phase 3B implementation can begin. These are the ZTA-2 through ZTA-19 thresholds.

| Category | Minimum Entries | Current | After Phase 3A |
|---|:---:|:---:|:---:|
| Pump | 6 | 6 | 6 |
| Heat Exchanger | 4 | 4 | 4 |
| Vessel | 4 | 4 | 4 |
| Control Valve | 2 | 2 | 2 |
| Tank | 6 | 0 | 6 |
| Heater | 4 | 0 | 4 |
| Column | 8 | 0 | 9 |
| Separator | 5 | 0 | 5 |
| Filter | 4 | 0 | 4 |
| Isolation Valve | 3 | 0 | 3 |
| Check Valve | 3 | 0 | 3 |
| Instrument | 4 | 0 | 4 |
| Utility System | 5 | 0 | 5 |
| Drain | 3 | 0 | 3 |
| Vent | 3 | 0 | 3 |
| Product Outlet | 4 | 0 | 4 |
| Waste Outlet | 3 | 0 | 3 |
| Next Loop | 3 | 0 | 3 |
| **TOTAL** | **78** | **16** | **78** |

---

## 7. Seed Strategy

### 7.1 Mechanism

Delivery is via addition to the existing `server/scripts/seed-hazop-library.ts` file.
All 62 new entries are appended to the `LIBRARY` array before the `export async function`
declaration, following the existing structure exactly.

The seed function already uses:
```sql
INSERT INTO hazop_deviation_library (...) VALUES (...)
ON CONFLICT (equipment_category, guideword, parameter) DO NOTHING
```

This is idempotent. Running the seed twice produces no duplicates and no errors.
Existing 16 rows are unaffected.

### 7.2 Invocation

The seed function `seedHazopDeviationLibrary()` is called from `server/routes.ts` on startup
(line 3999). After the Phase 3A file change, restarting the application will automatically
run the seed and insert the 62 new rows.

There is no manual `psql` step required.

### 7.3 Post-Seed Verification

After application restart, verify with:
```sql
SELECT equipment_category, COUNT(*) AS rows
FROM hazop_deviation_library
GROUP BY equipment_category
ORDER BY equipment_category;
```

Expected result: 18 rows (one per category), with counts matching §6 above.
Total row count: 78.

### 7.4 Version Column

All new entries are seeded with `version = 1`.
The existing 16 rows are already at `version = 1`.
Version increments when a row is intentionally revised (see §8).

---

## 8. Library Governance — Versioning and Change Control

### 8.1 Versioning Strategy

Each `hazop_deviation_library` row has a `version` integer column (default 1).
Version increments are the only mechanism for tracking library changes.

**Rules:**
- `version` is incremented when the `deviation_description`, `typical_causes`,
  `typical_consequences`, `typical_safeguards`, or `typical_actions` of an existing entry
  are changed.
- New entries start at `version = 1`.
- A version bump requires a corresponding update to the seed file entry.
- Version history is tracked only in git commit history — no audit table in Phase 3A.

### 8.2 Update Mechanism

Library row updates are made by modifying the seed file and applying the change via SQL:

```sql
UPDATE hazop_deviation_library
SET typical_causes     = $1,
    typical_safeguards = $2,
    version            = version + 1
WHERE equipment_category = $3
  AND guideword          = $4
  AND parameter          = $5;
```

Direct SQL only — no admin UI for library editing in Phase 3A or 3B.
The startup seed does NOT overwrite existing rows (DO NOTHING on conflict).
Updates require explicit SQL execution.

### 8.3 Additive vs Breaking Changes

| Change Type | Definition | Impact |
|---|---|---|
| **Additive** | New row (new equipment_category, guideword, or parameter combination) | Safe — no existing deviations affected |
| **Non-breaking update** | Wording improvement to existing row, same meaning | Safe — existing generated deviations retain their stored description (not regenerated) |
| **Breaking update** | Category removed (`applicable = false`), or major cause/safeguard change | Review required — may make existing generated deviations incomplete |

For breaking updates: `applicable` is set to `false` rather than deleting the row.
This preserves referential integrity — generated deviation rows that referenced this library
entry are not orphaned.

### 8.4 applicable = false Behaviour

In Phase 3B, the generation engine queries only `WHERE applicable = true`.
Setting `applicable = false` on a library entry removes it from future generation
without affecting existing generated deviations.

---

## 9. Reviewed Deviation Behaviour on Topology Change

This section defines binding rules for Phase 3B implementation.

### 9.1 The Four Topology Change Scenarios

#### 9.1.1 Steps Added to a Node

When a new step is added to a node that already has generated deviations:

- Existing reviewed deviations are **not affected**. They remain valid, reviewed, and are not flagged as stale.
- If the new step introduces a new `equipment_category` not previously in the node, new (guideword, parameter) pairs become eligible for generation from that category.
- These new deviations are **not generated automatically**. They require an explicit [Generate Node] trigger.
- The node-level flag `topology_changed_after_review` is set to `true` on `hazop_nodes` (see §9.4) to indicate the reviewer should consider re-running generation.

#### 9.1.2 Steps Deleted from a Node

When a step is deleted from a node that already has generated deviations:

- **Case A — other steps of same category remain:** No deviations are affected. The category is still represented in the node.
- **Case B — deleted step was the only step of that equipment_category:** Deviations sourced from that category may no longer be applicable to the node. However:
  - Those deviations are **not auto-deleted**.
  - Those deviations are **not auto-flagged as stale** or non-credible.
  - The reviewer must manually assess each deviation and either retain it (it may still be applicable by judgement) or delete it via the worksheet interface.
  - Rationale: automatic deletion of reviewed deviations would destroy the documented review audit trail. The reviewer's sign-off is a deliberate decision that must not be undone automatically.
- `topology_changed_after_review = true` is set on `hazop_nodes` in both cases.

#### 9.1.3 Routing Changes (outlet_destination or outlet_destination_ref Changed)

When a step's `outlet_destination` or `outlet_destination_ref` is changed:

- Deviations are generated at node level, not routing level.
- Routing changes do **not** affect which (guideword, parameter) pairs are applicable.
- Existing deviations are **not affected**.
- `topology_changed_after_review = true` is set on `hazop_nodes` only if the node has reviewed deviations.
- Exception: if the routing change affects the exit topology context (e.g. from `next_node` to `product_outlet`), deviation descriptions for "No Flow" entries will become contextually outdated. The reviewer must manually update `deviation_description` if required.

#### 9.1.4 Equipment Tag Changed on a Step

When a step's `equipment_tag` changes:

- Deviations are not regenerated.
- Existing cause and safeguard descriptions that contain the old tag are not auto-updated.
- `topology_changed_after_review` is **not** set for a tag-only change.
- The reviewer may manually update affected causes/safeguards via the worksheet interface.

### 9.2 Are Reviewed Deviations Stale?

**No.** There is no automatic staleness status on individual deviations.

`reviewed = true` is never automatically reversed by any topology change.
Staleness (in the sense of "this deviation may no longer apply") is communicated via
the node-level `topology_changed_after_review` flag — not on individual deviation rows.

### 9.3 Are Reviewed Deviations Warning-Flagged?

**No — at deviation row level.**

A **node-level** visual indicator (`topology_changed_after_review`) is shown in the
worksheet sidebar when steps have changed after generation. This is a prompt to the
reviewer, not a per-deviation flag.

### 9.4 topology_changed_after_review Column on hazop_nodes

Phase 3B requires the following DB column addition to `hazop_nodes`:

```sql
ALTER TABLE hazop_nodes
  ADD COLUMN topology_changed_after_review boolean NOT NULL DEFAULT false;
```

This is a **Phase 3B schema change** (not Phase 3A — Phase 3A has no schema changes).

**Set to `true` when:** any step within the node is added, deleted, or updated
(for step edits that change equipment_category, outlet_destination, or connection_type),
AND the node has `generated_at IS NOT NULL`.

**Reset to `false` when:** a new generation run completes for the node
(`POST /api/hazop/nodes/:nodeId/generate` completes successfully).

**Visual rendering:** node sidebar item in the worksheet shows an amber
"topology changed — consider re-generating" banner when `topology_changed_after_review = true`.

### 9.5 Are Reviewed Deviations Regeneration-Locked?

**No.** The [Generate Node] button is always available for draft-status studies.
Generation is never blocked by the presence of reviewed deviations.

Reviewed deviations are **protected from content overwrite** (not regeneration-locked):
- `reviewed = true` deviations are skipped during generation (their content is preserved).
- The user can un-review a deviation (`PATCH: { reviewed: false }`) if they want to
  allow the generation engine to update its description on the next run with `forceRegen = true`.

### 9.6 Summary Table

| Event | Existing Reviewed Deviations | Auto-Stale? | Auto-Flag? | Auto-Delete? |
|---|---|:---:|:---:|:---:|
| Step added (new category) | Unchanged | No | No | No |
| Step added (same category) | Unchanged | No | No | No |
| Step deleted (other steps same category remain) | Unchanged | No | No | No |
| Step deleted (last step of category) | Unchanged — reviewer must assess | No | No | No |
| outlet_destination changed | Unchanged — description may be contextually stale | No | No | No |
| equipment_tag changed | Unchanged | No | No | No |
| Re-generation triggered | Reviewed deviations skipped — not overwritten | No | No | No |
| Re-generation with forceRegen=true | Reviewed deviations still skipped | No | No | No |

**One-line summary:** Reviewed deviations are never automatically staled, flagged, or deleted.
The node-level `topology_changed_after_review` indicator is the only automated signal.

---

## 10. Deviation Numbering Governance (Binding for Phase 3B)

These rules are confirmed and binding. They answer OQ-3 from the original Phase 3 plan.

### 10.1 Format

```
{node_reference}-D{nn:02d}
```

Examples:
- Node `1.1`, first deviation: `1.1-D01`
- Node `2.3`, seventh deviation: `2.3-D07`
- Node `1.1`, tenth deviation: `1.1-D10`

### 10.2 Assignment Rule

`nn` is assigned sequentially at the moment of insertion into `hazop_deviations`.
It is computed as: `(count of existing deviations for this node_id) + 1` at insert time,
within the advisory lock scope.

### 10.3 Immutability After Assignment

**Deviation numbers are immutable after assignment.**

Once `deviation_number = '1.1-D03'` is written, it never changes — regardless of:
- Deletion of deviations with lower numbers (gaps are acceptable).
- Re-generation of the same node.
- Addition of more deviations by re-generation.

### 10.4 No Renumbering After Deletion

**There is no renumbering.**

If deviation `1.1-D02` is deleted, `1.1-D01` remains `1.1-D01` and `1.1-D03` remains
`1.1-D03`. The gap `1.1-D02` is permanent.

Rationale: deviation numbers appear in meeting minutes, action items, and correspondence.
Renumbering after deletion would break references in external documents. Gaps are
preferable to breaking reference integrity.

---

## 11. Open Questions Resolved

These answer the four OQs from `docs/hazop-phase3-execution-plan-v1.0.md §20`.

| OQ | Question | Resolution |
|---|---|---|
| OQ-1 | Lock node to step edits after generation? | **No lock.** `topology_changed_after_review` flag set as advisory indicator only. Step edits always permitted on draft studies. |
| OQ-2 | Auto re-generation on step changes, or always manual? | **Always manual.** [Generate Node] button is the only trigger. Automatic re-generation would risk destroying reviewed deviations on an accidental step edit. |
| OQ-3 | Renumber after deviation deletion? | **No renumbering.** Gaps are permanent and acceptable (§10.4). |
| OQ-4 | Study-level Generate All — skip fully reviewed nodes? | **Yes, skip by default.** A node is "fully reviewed" when all its deviations have `reviewed = true`. Skip unless `forceRegen = true` is explicitly passed. |

---

## 12. Files Modified in Phase 3A

Only one file is modified:

| File | Change |
|---|---|
| `server/scripts/seed-hazop-library.ts` | Append 62 new `LibraryEntry` objects to the `LIBRARY` array |

No schema changes. No route changes. No client changes.

---

## 13. Zero-Trust Audit Checklist — Phase 3A

All 27 checks must pass before Phase 3B implementation begins.

| # | Check |
|---|---|
| ZTA-1 | `SELECT COUNT(*) FROM hazop_deviation_library` = 78 after seed re-run |
| ZTA-2 | Tank category: `COUNT(*) WHERE equipment_category = 'Tank'` ≥ 6 |
| ZTA-3 | Heater category: `COUNT(*) WHERE equipment_category = 'Heater'` ≥ 4 |
| ZTA-4 | Column category: `COUNT(*) WHERE equipment_category = 'Column'` ≥ 8 |
| ZTA-5 | Separator category: `COUNT(*) WHERE equipment_category = 'Separator'` ≥ 5 |
| ZTA-6 | Filter category: `COUNT(*) WHERE equipment_category = 'Filter'` ≥ 4 |
| ZTA-7 | Isolation Valve category: `COUNT(*) WHERE equipment_category = 'Isolation Valve'` ≥ 3 |
| ZTA-8 | Check Valve category: `COUNT(*) WHERE equipment_category = 'Check Valve'` ≥ 3 |
| ZTA-9 | Instrument category: `COUNT(*) WHERE equipment_category = 'Instrument'` ≥ 4 |
| ZTA-10 | Utility System category: `COUNT(*) WHERE equipment_category = 'Utility System'` ≥ 5 |
| ZTA-11 | Drain category: `COUNT(*) WHERE equipment_category = 'Drain'` ≥ 3 |
| ZTA-12 | Vent category: `COUNT(*) WHERE equipment_category = 'Vent'` ≥ 3 |
| ZTA-13 | Product Outlet category: `COUNT(*) WHERE equipment_category = 'Product Outlet'` ≥ 4 |
| ZTA-14 | Waste Outlet category: `COUNT(*) WHERE equipment_category = 'Waste Outlet'` ≥ 3 |
| ZTA-15 | Next Loop category: `COUNT(*) WHERE equipment_category = 'Next Loop'` ≥ 3 |
| ZTA-16 | Existing 4 categories unchanged: Pump=6, Heat Exchanger=4, Vessel=4, Control Valve=2 |
| ZTA-17 | No `typical_causes` array is empty: `COUNT(*) WHERE jsonb_array_length(typical_causes) = 0` = 0 |
| ZTA-18 | No `typical_consequences` array is empty: same check = 0 |
| ZTA-19 | No `typical_safeguards` array is empty: same check = 0 |
| ZTA-20 | No `typical_actions` array is empty: same check = 0 |
| ZTA-21 | Seed is idempotent: running `seedHazopDeviationLibrary()` twice produces `inserted: 0, skipped: 78` on second run |
| ZTA-22 | No UNIQUE constraint violation exists: `SELECT COUNT(*) FROM hazop_deviation_library` consistent with distinct (category, guideword, parameter) count |
| ZTA-23 | All new entries have `applicable = true`: `COUNT(*) WHERE applicable = false` = 0 |
| ZTA-24 | All new entries have `version = 1`: `COUNT(*) WHERE version != 1` = 0 |
| ZTA-25 | Instrument-specific parameters 'Signal' and 'Reading' appear only for Instrument category: no other category has these parameters |
| ZTA-26 | `deviation_description` is not null and not empty for all 78 rows |
| ZTA-27 | `SELECT COUNT(DISTINCT equipment_category) FROM hazop_deviation_library` = 18 |

---

## 14. Phase 3B Entry Gate

Phase 3B (`docs/hazop-phase3b-generation-engine-plan-v1.0.md`) may not be drafted or
implemented until:

1. This Phase 3A plan is approved.
2. All 27 Phase 3A ZTA checks pass.
3. `topology_changed_after_review` schema change confirmed and accepted for Phase 3B.
4. OQ-1 through OQ-4 resolutions in §11 are accepted.
