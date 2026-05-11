# BUY Item Code Generation — Implementation Plan v2.0
**Date:** 2026-05-11
**Supersedes:** v1.0 (2026-05-11)
**Status:** REVISED — Awaiting approval. Do not implement.
**Scope:** Automatic, server-controlled, unique Item Code generation for all BUY Package Catalog items

---

## 1. Changes from v1.0

| # | Correction |
|---|------------|
| C1 | All subgroup codes trimmed to max 3 chars. `CENT` corrected to `CEN` throughout. |
| C2 | All type codes trimmed to max 3 chars. `CONT` → `CON`, `LTXR` → `TXR`, etc. |
| C3 | Strict segment length rules defined and enforced in every table. |
| C4 | Format renamed to `GROUP-SUBGROUP-TYPE-SIZE-UNIT` (no generic SEG1/SEG2). |
| C5 | Item code is generated from BUY catalog master data (attrs form registry + `buy_groups` / `buy_subgroups` tables), not free-form `technicalAttributes` parsing only. |
| C6 | Complete example item codes for every group, every subgroup, every type, every size/rating pattern added. |
| C7 | Full Code Matrix table added (§7). |
| C8 | SAP B1 length analysis redone with corrected short codes. Separate `sap_item_code` recommendation confirmed with justification. |
| C9 | Size numeric part confirmed as **3 to 5 digits**, zero-padded to minimum 3. Zero-padding open question resolved. |

---

## 2. Item Code Format

```
GROUP-SUBGROUP-TYPE-SIZE-UNIT
```

### 2.1 Segment Length Rules

| Segment | Length Rule | Pad / Truncate |
|---------|-------------|----------------|
| GROUP | 3 – 5 characters | Fixed from registry; no padding |
| SUBGROUP | Max 3 characters | Fixed from registry; no padding |
| TYPE | Max 3 characters; `NA` when no type applies | Fixed from registry; no padding |
| SIZE | **3 – 5 digits** (numeric), zero-padded to minimum 3 digits | Zero-pad to 3 digits minimum; max 5 digits |
| UNIT | Short normalized text code, max 4 characters | Fixed from unit registry |

**Maximum item code length (baseline, no collision suffix):**
`PUMP-CEN-HOR-10000-LPH` = 4+1+3+1+3+1+5+1+3 = **22 characters** (5-digit size, worst case)

With 3-digit size: `PUMP-CEN-HOR-100-M3H` = **20 characters** (fits SAP 20-char standard).
With 4-digit size: `PUMP-CEN-HOR-1000-LPH` = **21 characters**.
With 5-digit size: `PUMP-CEN-HOR-10000-M3H` = **22 characters**.

### 2.2 Size Zero-Padding Rule — Confirmed

Size is always **zero-padded to a minimum of 3 digits**. Maximum is 5 digits.

| Raw value | Padded SIZE |
|-----------|-------------|
| 10 | `010` |
| 50 | `050` |
| 100 | `100` |
| 1000 | `1000` |
| 10000 | `10000` |

The approved example `PLAT-CS-NA-10-MM` renders as **`PLAT-CS-NA-010-MM`** in the final code.

### 2.3 Collision Suffix

When two distinct catalog items (different MOC, vendor, or spec detail not captured in the 5 segments) produce the same 5-segment code, a 2-digit collision suffix is appended:

```
PUMP-CEN-HOR-1000-LPH       ← first item registered
PUMP-CEN-HOR-1000-LPH-02    ← second distinct item, same 5 segments
PUMP-CEN-HOR-1000-LPH-03    ← third, etc.
```

---

## 3. Source of Item Codes — Catalog Master Data, Not Free-Form

Item codes are generated from **structured catalog master data only**. The sources are:

| Segment | Data Source |
|---------|-------------|
| GROUP | `buy_groups.code` (looked up via `buy_group_id` on the catalog line) |
| SUBGROUP | `buy_subgroups.code` (looked up via `buy_subgroup_id` on the catalog line) — or material code for raw materials |
| TYPE | `technicalAttributes` field whose key is registered in `item_code_registry` as the type-source field for that subgroup (e.g., `pump_type`, `valve_type`, `component_type`, `panel_type`). The value is mapped to a max-3-char type code in the registry. Not free-form. |
| SIZE | `technicalAttributes` field registered as the primary size field for that subgroup (e.g., `flow_rate_lph` for centrifugal pumps). The field is registered in `item_code_registry`. Not free-form. |
| UNIT | Unit string registered per-subgroup in `item_code_registry` (e.g., `LPH` for `centrifugal.flow_rate_lph`). Always comes from the registry, not the UOM master. |

The `item_code_registry` table is the single source of truth mapping (group, subgroup) → (type-source field, size-source field, unit code). Attrs form dropdown values (e.g., `pump_type = "Horizontal"`) are mapped to type codes (e.g., `HOR`) via the registry. No free-form string parsing of `genericRequirement` or `notes` fields is used.

---

## 4. Group Code Registry

### 4.1 Standard Groups

| Group (DB code) | Label | GROUP Code | Length |
|-----------------|-------|-----------|--------|
| `pumps` | Pumps | `PUMP` | 4 |
| `motors` | Motors | `MOTR` | 4 |
| `instruments` | Instruments | `INST` | 4 |
| `valves` | Valves | `VALV` | 4 |
| `electrical_control` | Electrical / Control | `ELEC` | 4 |
| `bought_out_packages` | Bought-out Packages | `BOPK` | 4 |

### 4.2 Raw Materials — Special Dual-Segment Encoding

The `raw_materials` group has 7 subgroups each representing a distinct material category. Prefixing all raw material codes with `RAWM` would waste 4 chars on a redundant segment. The approved example `PLAT-CS-NA-10-MM` confirms the intended encoding:

- **GROUP segment** = the raw-material **subgroup** abbreviation (e.g., `PLAT` for plates)
- **SUBGROUP segment** = the **material / grade** code (e.g., `CS` for Carbon Steel)
- TYPE = always `NA` (raw materials have no type distinction)

This means raw material group codes (used as GROUP segment) are 4 characters and are derived from the subgroup name, not from the group name:

| Subgroup (DB code) | Label | GROUP Code | Length |
|--------------------|-------|-----------|--------|
| `plates` | Plates | `PLAT` | 4 |
| `pipes` | Pipes | `PIPE` | 4 |
| `fittings` | Fittings | `FITT` | 4 |
| `flanges` | Flanges | `FLAN` | 4 |
| `fasteners` | Fasteners | `FAST` | 4 |
| `gaskets` | Gaskets | `GASK` | 4 |
| `structural_steel` | Structural Steel | `STST` | 4 |

---

## 5. Subgroup Code Registry

### 5.1 Standard Subgroup Codes (max 3 characters)

| Group | Subgroup (DB code) | Label | SUBGROUP Code |
|-------|--------------------|-------|--------------|
| PUMP | `centrifugal` | Centrifugal | `CEN` |
| PUMP | `gear` | Gear | `GEA` |
| PUMP | `screw` | Screw | `SCR` |
| PUMP | `multistage` | Multistage | `MLT` |
| PUMP | `dosing_metering` | Dosing / Metering | `DOS` |
| PUMP | `vacuum_boosters` | Vacuum Boosters | `VCB` |
| PUMP | `pump_skid` | Pump Skid Packages | `SKD` |
| PUMP | `vacuum_pump` | Vacuum Pump | `VCP` |
| PUMP | `hand_pump` | Hand Pump | `HND` |
| MOTR | `non_flameproof` | Non-Flameproof Motor | `NFP` |
| MOTR | `flameproof` | Flameproof Motor | `FLP` |
| INST | `pressure` | Pressure | `PRS` |
| INST | `temperature` | Temperature | `TMP` |
| INST | `flow` | Flow | `FLW` |
| INST | `level` | Level | `LVL` |
| VALV | `isolation` | Isolation Valve | `ISO` |
| VALV | `control` | Control Valve | `CTL` |
| VALV | `safety` | Safety Valve | `SAF` |
| VALV | `on_off` | ON/OFF Valve | `ONF` |
| VALV | `nrv` | Non-Return Valve | `NRV` |
| VALV | `needle` | Needle Valve | `NDL` |
| ELEC | `panels` | Panels | `PNL` |
| ELEC | `components` | Components | `CMP` |
| ELEC | `field_items` | Field Items | `FLD` |
| ELEC | `cabling` | Cabling | `CBL` |
| ELEC | `junction_box` | Junction Box | `JBX` |
| BOPK | `general` | General Bought-out | `GEN` |
| BOPK | `cooling_tower` | Cooling Tower | `CLT` |

### 5.2 Raw Material Subgroup Codes (used in SUBGROUP segment = material/grade, max 3 chars)

| Material / Grade | SUBGROUP Code |
|-----------------|--------------|
| Carbon Steel (CS / A516 / SA516) | `CS` |
| Stainless Steel 304 / 1.4301 | `S30` |
| Stainless Steel 316 / 316L / 1.4404 | `S31` |
| Duplex SS 2205 / UNS S32205 | `DSS` |
| Hastelloy C276 / C22 | `HAS` |
| Titanium Gr 2 / Gr 5 | `TIT` |
| Galvanised Iron | `GI` |
| Mild Steel (MS) | `MS` |
| High Tensile | `HT` |
| PTFE / Teflon | `PTE` |
| Graphite | `GRP` |
| Spiral Wound | `SPW` |
| Ring Joint (RTJ) | `RJT` |
| Rubber / EPDM | `RBR` |
| Inconel | `INC` |
| Unknown / Not Applicable | `NA` |

---

## 6. Type Code Registry (max 3 characters)

Type codes are scoped per subgroup. `NA` is the reserved code for subgroups that have no type distinction.

### 6.1 Pumps

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `CEN` | `HOR` | Horizontal |
| `CEN` | `VRT` | Vertical |
| `CEN` | `SUB` | Submersible |
| `CEN` | `SPR` | Self-Priming |
| `CEN` | `ENS` | End Suction |
| `CEN` | `SPC` | Split Case |
| `CEN` | `MNB` | Monoblock |
| `CEN` | `INL` | In-Line |
| `GEA` | `NA` | No type distinction |
| `SCR` | `NA` | No type distinction |
| `MLT` | `HOR` | Horizontal Multistage |
| `MLT` | `VRT` | Vertical Multistage |
| `DOS` | `DPH` | Diaphragm |
| `DOS` | `PER` | Peristaltic |
| `DOS` | `PLN` | Plunger |
| `DOS` | `NA` | Not specified |
| `VCB` | `NA` | No type distinction |
| `SKD` | `NA` | No type distinction |
| `VCP` | `DRY` | Dry Running |
| `VCP` | `OLS` | Oil Sealed |
| `VCP` | `WTR` | Water Ring |
| `VCP` | `NA` | Not specified |
| `HND` | `NA` | No type distinction |

### 6.2 Motors

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `NFP` | `ACI` | AC Induction / Squirrel Cage |
| `NFP` | `SLR` | Slip Ring |
| `NFP` | `SYN` | Synchronous |
| `NFP` | `PMG` | Permanent Magnet |
| `FLP` | `ACI` | AC Induction (flameproof) |
| `FLP` | `SLR` | Slip Ring (flameproof) |
| `FLP` | `SYN` | Synchronous (flameproof) |

### 6.3 Instruments — Pressure

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `PRS` | `GAU` | Bourdon Tube Gauge |
| `PRS` | `TXR` | Pressure Transmitter |
| `PRS` | `SWT` | Pressure Switch |
| `PRS` | `DPT` | Differential Pressure Transmitter |
| `PRS` | `IND` | Pressure Indicator |

### 6.4 Instruments — Temperature

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `TMP` | `TCC` | Thermocouple |
| `TMP` | `RTD` | RTD |
| `TMP` | `TXR` | Temperature Transmitter |
| `TMP` | `SWT` | Temperature Switch |
| `TMP` | `BIM` | Bimetallic / Dial Thermometer |
| `TMP` | `DID` | Digital Indicator |

### 6.5 Instruments — Flow

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `FLW` | `MAG` | Electromagnetic / Magnetic |
| `FLW` | `VTX` | Vortex |
| `FLW` | `ORP` | Orifice Plate |
| `FLW` | `ROT` | Rotameter / Variable Area |
| `FLW` | `TRB` | Turbine |
| `FLW` | `ULT` | Ultrasonic |
| `FLW` | `CRL` | Coriolis |
| `FLW` | `DPF` | Differential Pressure (DP) Flow |

### 6.6 Instruments — Level

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `LVL` | `LGG` | Level Gauge Glass |
| `LVL` | `MLI` | Magnetic Level Indicator |
| `LVL` | `FLT` | Float Type |
| `LVL` | `TXR` | Level Transmitter |
| `LVL` | `SWT` | Level Switch |
| `LVL` | `RDR` | Radar |
| `LVL` | `ULT` | Ultrasonic |
| `LVL` | `GWR` | Guided Wave Radar |

### 6.7 Valves

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `ISO` | `GAT` | Gate |
| `ISO` | `GLB` | Globe |
| `ISO` | `BAL` | Ball |
| `ISO` | `BTF` | Butterfly |
| `ISO` | `PLG` | Plug |
| `ISO` | `DPH` | Diaphragm |
| `CTL` | `GLB` | Globe (control) |
| `CTL` | `BAL` | Ball (control) |
| `CTL` | `BTF` | Butterfly (control) |
| `SAF` | `SPL` | Spring Loaded |
| `SAF` | `POL` | Pilot Operated |
| `ONF` | `BAL` | Ball (on/off actuated) |
| `ONF` | `BTF` | Butterfly (on/off actuated) |
| `ONF` | `GAT` | Gate (on/off actuated) |
| `NRV` | `SCK` | Swing Check |
| `NRV` | `LCK` | Lift Check |
| `NRV` | `DPC` | Dual Plate Check |
| `NRV` | `TDC` | Tilting Disc Check |
| `NDL` | `NA` | No type distinction |

### 6.8 Electrical / Control — Panels

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `PNL` | `MCC` | Motor Control Centre |
| `PNL` | `PCC` | Power Control Centre |
| `PNL` | `MDB` | Main Distribution Board |
| `PNL` | `VFD` | VFD Panel |
| `PNL` | `CCN` | Control Console |
| `PNL` | `DBD` | Distribution Board |

### 6.9 Electrical / Control — Components

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `CMP` | `MCB` | Miniature Circuit Breaker |
| `CMP` | `CCB` | Moulded Case Circuit Breaker (MCCB) |
| `CMP` | `ACB` | Air Circuit Breaker |
| `CMP` | `CON` | Contactor |
| `CMP` | `OVL` | Overload Relay |
| `CMP` | `DOL` | DOL Starter |
| `CMP` | `SDS` | Star-Delta Starter |
| `CMP` | `VFD` | Variable Frequency Drive |
| `CMP` | `SST` | Soft Starter |
| `CMP` | `TRF` | Transformer |
| `CMP` | `SMP` | SMPS / Power Supply |
| `CMP` | `UPS` | UPS |
| `CMP` | `RLY` | Relay |
| `CMP` | `TMR` | Timer Relay |
| `CMP` | `SEL` | Selector Switch |
| `CMP` | `PBT` | Push Button |
| `CMP` | `LMT` | Limit Switch |
| `CMP` | `IND` | Indicator / Pilot Light |
| `CMP` | `EMT` | Energy Meter |
| `CMP` | `CTS` | Current Transformer (CT) |
| `CMP` | `PTS` | Potential Transformer (PT) |
| `CMP` | `FUS` | Fuse |
| `CMP` | `TBL` | Terminal Block |
| `CMP` | `ELB` | ELCB / RCCB / RCBO |
| `CMP` | `PLC` | PLC / DCS Module |
| `CMP` | `HMI` | HMI / Operator Panel |

### 6.10 Electrical / Control — Cabling

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `CBL` | `PWR` | Power Cable |
| `CBL` | `CTL` | Control Cable |
| `CBL` | `INS` | Instrumentation Cable |
| `CBL` | `SIG` | Signal Cable |
| `CBL` | `ETH` | Earthing / Bare Conductor |

### 6.11 Electrical / Control — Junction Box

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `JBX` | `FPR` | Flameproof (Ex-d) |
| `JBX` | `EXE` | Increased Safety (Ex-e) |
| `JBX` | `GPP` | General Purpose (Non-FP) |

### 6.12 Electrical / Control — Field Items

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `FLD` | `NA` | No attrs form defined yet — all field items use NA until attrs form is implemented |

### 6.13 Bought-out Packages

| Subgroup | TYPE Code | Meaning |
|----------|-----------|---------|
| `GEN` | `NA` | No type distinction |
| `CLT` | `NDT` | Natural Draft |
| `CLT` | `MDT` | Mechanical Draft |
| `CLT` | `IDT` | Induced Draft |
| `CLT` | `FDT` | Forced Draft |

---

## 7. Full Code Matrix — Validation Table

Every row below is one complete, valid item code. This table covers every group, every subgroup, every type code, and the main size/rating patterns. **This table is the primary validation deliverable.**

### 7.1 Raw Materials

| Group | Subgroup | Material | Type | Size | Unit | Item Code | Notes |
|-------|----------|----------|------|------|------|-----------|-------|
| PLAT | CS | — | NA | 010 | MM | `PLAT-CS-NA-010-MM` | CS plate 10mm (zero-padded) |
| PLAT | S30 | — | NA | 006 | MM | `PLAT-S30-NA-006-MM` | SS304 plate 6mm |
| PLAT | S31 | — | NA | 012 | MM | `PLAT-S31-NA-012-MM` | SS316 plate 12mm |
| PLAT | DSS | — | NA | 008 | MM | `PLAT-DSS-NA-008-MM` | Duplex plate 8mm |
| PIPE | CS | — | NA | 050 | NB | `PIPE-CS-NA-050-NB` | CS seamless pipe 50NB |
| PIPE | S30 | — | NA | 080 | NB | `PIPE-S30-NA-080-NB` | SS304 pipe 80NB |
| PIPE | S31 | — | NA | 100 | NB | `PIPE-S31-NA-100-NB` | SS316 pipe 100NB |
| PIPE | GI | — | NA | 040 | NB | `PIPE-GI-NA-040-NB` | GI pipe 40NB |
| FITT | CS | — | NA | 050 | NB | `FITT-CS-NA-050-NB` | CS elbow/tee 50NB |
| FITT | S31 | — | NA | 080 | NB | `FITT-S31-NA-080-NB` | SS316 fitting 80NB |
| FLAN | CS | — | NA | 100 | NB | `FLAN-CS-NA-100-NB` | CS flange 100NB |
| FLAN | S30 | — | NA | 050 | NB | `FLAN-S30-NA-050-NB` | SS304 flange 50NB |
| FAST | CS | — | NA | 020 | MM | `FAST-CS-NA-020-MM` | CS bolt/nut M20 |
| FAST | HT | — | NA | 024 | MM | `FAST-HT-NA-024-MM` | High-tensile bolt M24 |
| FAST | S30 | — | NA | 016 | MM | `FAST-S30-NA-016-MM` | SS304 fastener M16 |
| GASK | GRP | — | NA | 050 | NB | `GASK-GRP-NA-050-NB` | Graphite gasket 50NB |
| GASK | PTE | — | NA | 080 | NB | `GASK-PTE-NA-080-NB` | PTFE gasket 80NB |
| GASK | SPW | — | NA | 100 | NB | `GASK-SPW-NA-100-NB` | Spiral wound gasket 100NB |
| GASK | RJT | — | NA | 040 | NB | `GASK-RJT-NA-040-NB` | Ring joint gasket 40NB |
| STST | MS | — | NA | 100 | MM | `STST-MS-NA-100-MM` | MS angle/channel 100mm |
| STST | GI | — | NA | 050 | MM | `STST-GI-NA-050-MM` | GI structural 50mm |

### 7.2 Pumps

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| PUMP | CEN | HOR | 1000 | LPH | `PUMP-CEN-HOR-1000-LPH` | **Approved example — exact** |
| PUMP | CEN | HOR | 100 | M3H | `PUMP-CEN-HOR-100-M3H` | Centrifugal horizontal, 100 m³/h |
| PUMP | CEN | VRT | 050 | M3H | `PUMP-CEN-VRT-050-M3H` | Centrifugal vertical, 50 m³/h |
| PUMP | CEN | SUB | 020 | M3H | `PUMP-CEN-SUB-020-M3H` | Centrifugal submersible |
| PUMP | CEN | SPR | 010 | M3H | `PUMP-CEN-SPR-010-M3H` | Self-priming centrifugal |
| PUMP | CEN | ENS | 080 | M3H | `PUMP-CEN-ENS-080-M3H` | End suction |
| PUMP | CEN | SPC | 200 | M3H | `PUMP-CEN-SPC-200-M3H` | Split case |
| PUMP | CEN | MNB | 015 | KW | `PUMP-CEN-MNB-015-KW` | Monoblock (rated by power) |
| PUMP | CEN | INL | 030 | M3H | `PUMP-CEN-INL-030-M3H` | In-line centrifugal |
| PUMP | GEA | NA | 005 | M3H | `PUMP-GEA-NA-005-M3H` | Gear pump (no type) |
| PUMP | SCR | NA | 010 | M3H | `PUMP-SCR-NA-010-M3H` | Screw pump (no type) |
| PUMP | MLT | HOR | 050 | M3H | `PUMP-MLT-HOR-050-M3H` | Horizontal multistage |
| PUMP | MLT | VRT | 030 | M3H | `PUMP-MLT-VRT-030-M3H` | Vertical multistage |
| PUMP | DOS | DPH | 100 | LPH | `PUMP-DOS-DPH-100-LPH` | Diaphragm dosing pump |
| PUMP | DOS | PER | 050 | LPH | `PUMP-DOS-PER-050-LPH` | Peristaltic dosing pump |
| PUMP | DOS | PLN | 200 | LPH | `PUMP-DOS-PLN-200-LPH` | Plunger dosing pump |
| PUMP | VCB | NA | 100 | M3H | `PUMP-VCB-NA-100-M3H` | Vacuum booster (no type) |
| PUMP | SKD | NA | 030 | KW | `PUMP-SKD-NA-030-KW` | Pump skid (rated by power) |
| PUMP | VCP | DRY | 050 | M3H | `PUMP-VCP-DRY-050-M3H` | Dry running vacuum pump |
| PUMP | VCP | OLS | 030 | M3H | `PUMP-VCP-OLS-030-M3H` | Oil sealed vacuum pump |
| PUMP | VCP | WTR | 020 | M3H | `PUMP-VCP-WTR-020-M3H` | Water ring vacuum pump |
| PUMP | HND | NA | 010 | LPM | `PUMP-HND-NA-010-LPM` | Hand pump (no type) |

### 7.3 Motors

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| MOTR | NFP | ACI | 015 | KW | `MOTR-NFP-ACI-015-KW` | Non-FP, AC induction, 15 kW |
| MOTR | NFP | ACI | 075 | KW | `MOTR-NFP-ACI-075-KW` | Non-FP, AC induction, 75 kW |
| MOTR | NFP | SLR | 045 | KW | `MOTR-NFP-SLR-045-KW` | Non-FP, slip ring |
| MOTR | NFP | SYN | 100 | KW | `MOTR-NFP-SYN-100-KW` | Non-FP, synchronous |
| MOTR | NFP | PMG | 011 | KW | `MOTR-NFP-PMG-011-KW` | Non-FP, permanent magnet |
| MOTR | FLP | ACI | 015 | KW | `MOTR-FLP-ACI-015-KW` | Flameproof, AC induction, 15 kW |
| MOTR | FLP | ACI | 045 | KW | `MOTR-FLP-ACI-045-KW` | Flameproof, AC induction, 45 kW |
| MOTR | FLP | SLR | 055 | KW | `MOTR-FLP-SLR-055-KW` | Flameproof, slip ring |
| MOTR | FLP | SYN | 022 | KW | `MOTR-FLP-SYN-022-KW` | Flameproof, synchronous |

### 7.4 Instruments — Pressure

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| INST | PRS | GAU | 016 | BAR | `INST-PRS-GAU-016-BAR` | Pressure gauge, 0–16 bar |
| INST | PRS | GAU | 100 | BAR | `INST-PRS-GAU-100-BAR` | Pressure gauge, 0–100 bar |
| INST | PRS | TXR | 010 | BAR | `INST-PRS-TXR-010-BAR` | Pressure transmitter, 0–10 bar |
| INST | PRS | TXR | 025 | BAR | `INST-PRS-TXR-025-BAR` | Pressure transmitter, 0–25 bar |
| INST | PRS | SWT | 010 | BAR | `INST-PRS-SWT-010-BAR` | Pressure switch, 10 bar set |
| INST | PRS | DPT | 100 | MBR | `INST-PRS-DPT-100-MBR` | DP transmitter, 100 mbar |
| INST | PRS | IND | 006 | BAR | `INST-PRS-IND-006-BAR` | Pressure indicator, 0–6 bar |

### 7.5 Instruments — Temperature

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| INST | TMP | TCC | 200 | DGC | `INST-TMP-TCC-200-DGC` | Thermocouple, 200°C range |
| INST | TMP | TCC | 600 | DGC | `INST-TMP-TCC-600-DGC` | Thermocouple, 600°C range |
| INST | TMP | RTD | 150 | DGC | `INST-TMP-RTD-150-DGC` | RTD PT100, 0–150°C |
| INST | TMP | TXR | 200 | DGC | `INST-TMP-TXR-200-DGC` | Temp transmitter, 0–200°C |
| INST | TMP | SWT | 100 | DGC | `INST-TMP-SWT-100-DGC` | Temperature switch, 100°C |
| INST | TMP | BIM | 100 | DGC | `INST-TMP-BIM-100-DGC` | Bimetallic dial thermometer |
| INST | TMP | DID | 200 | DGC | `INST-TMP-DID-200-DGC` | Digital temperature indicator |

### 7.6 Instruments — Flow

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| INST | FLW | MAG | 080 | NB | `INST-FLW-MAG-080-NB` | Magnetic flowmeter, 80NB |
| INST | FLW | MAG | 100 | NB | `INST-FLW-MAG-100-NB` | Magnetic flowmeter, 100NB |
| INST | FLW | VTX | 050 | NB | `INST-FLW-VTX-050-NB` | Vortex flowmeter, 50NB |
| INST | FLW | ORP | 100 | NB | `INST-FLW-ORP-100-NB` | Orifice plate, 100NB |
| INST | FLW | ROT | 025 | NB | `INST-FLW-ROT-025-NB` | Rotameter, 25NB |
| INST | FLW | TRB | 040 | NB | `INST-FLW-TRB-040-NB` | Turbine meter, 40NB |
| INST | FLW | ULT | 200 | NB | `INST-FLW-ULT-200-NB` | Ultrasonic meter, 200NB |
| INST | FLW | CRL | 050 | NB | `INST-FLW-CRL-050-NB` | Coriolis meter, 50NB |
| INST | FLW | DPF | 100 | NB | `INST-FLW-DPF-100-NB` | DP-type flowmeter, 100NB |

### 7.7 Instruments — Level

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| INST | LVL | LGG | 500 | MM | `INST-LVL-LGG-500-MM` | Level gauge glass, 500mm span |
| INST | LVL | MLI | 1000 | MM | `INST-LVL-MLI-1000-MM` | Magnetic level indicator, 1000mm |
| INST | LVL | FLT | 500 | MM | `INST-LVL-FLT-500-MM` | Float type, 500mm |
| INST | LVL | TXR | 2000 | MM | `INST-LVL-TXR-2000-MM` | Level transmitter, 0–2000mm |
| INST | LVL | SWT | 500 | MM | `INST-LVL-SWT-500-MM` | Level switch, 500mm setpoint |
| INST | LVL | RDR | 3000 | MM | `INST-LVL-RDR-3000-MM` | Radar level, 0–3000mm |
| INST | LVL | ULT | 2000 | MM | `INST-LVL-ULT-2000-MM` | Ultrasonic level, 0–2000mm |
| INST | LVL | GWR | 4000 | MM | `INST-LVL-GWR-4000-MM` | Guided wave radar, 0–4000mm |

### 7.8 Valves

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| VALV | ISO | GAT | 050 | NB | `VALV-ISO-GAT-050-NB` | Gate valve, 50NB |
| VALV | ISO | GLB | 025 | NB | `VALV-ISO-GLB-025-NB` | Globe valve, 25NB |
| VALV | ISO | BAL | 040 | NB | `VALV-ISO-BAL-040-NB` | Ball valve, 40NB |
| VALV | ISO | BTF | 200 | NB | `VALV-ISO-BTF-200-NB` | Butterfly valve, 200NB |
| VALV | ISO | PLG | 050 | NB | `VALV-ISO-PLG-050-NB` | Plug valve, 50NB |
| VALV | ISO | DPH | 040 | NB | `VALV-ISO-DPH-040-NB` | Diaphragm valve, 40NB |
| VALV | CTL | GLB | 050 | NB | `VALV-CTL-GLB-050-NB` | Control globe valve, 50NB |
| VALV | CTL | BAL | 040 | NB | `VALV-CTL-BAL-040-NB` | Control ball valve, 40NB |
| VALV | CTL | BTF | 150 | NB | `VALV-CTL-BTF-150-NB` | Control butterfly, 150NB |
| VALV | SAF | SPL | 001 | IN | `VALV-SAF-SPL-001-IN` | Spring loaded safety valve, 1" |
| VALV | SAF | SPL | 002 | IN | `VALV-SAF-SPL-002-IN` | Spring loaded safety valve, 2" |
| VALV | SAF | POL | 003 | IN | `VALV-SAF-POL-003-IN` | Pilot operated safety valve, 3" |
| VALV | ONF | BAL | 050 | NB | `VALV-ONF-BAL-050-NB` | ON/OFF ball valve, 50NB |
| VALV | ONF | BTF | 200 | NB | `VALV-ONF-BTF-200-NB` | ON/OFF butterfly, 200NB |
| VALV | ONF | GAT | 100 | NB | `VALV-ONF-GAT-100-NB` | ON/OFF gate valve, 100NB |
| VALV | NRV | SCK | 050 | NB | `VALV-NRV-SCK-050-NB` | Swing check valve, 50NB |
| VALV | NRV | LCK | 025 | NB | `VALV-NRV-LCK-025-NB` | Lift check valve, 25NB |
| VALV | NRV | DPC | 150 | NB | `VALV-NRV-DPC-150-NB` | Dual plate check, 150NB |
| VALV | NRV | TDC | 100 | NB | `VALV-NRV-TDC-100-NB` | Tilting disc check, 100NB |
| VALV | NDL | NA | 006 | NB | `VALV-NDL-NA-006-NB` | Needle valve (no type), 6NB |
| VALV | NDL | NA | 012 | NB | `VALV-NDL-NA-012-NB` | Needle valve (no type), 12NB |

### 7.9 Electrical / Control — Panels

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| ELEC | PNL | MCC | 415 | V | `ELEC-PNL-MCC-415-V` | MCC panel, 415V |
| ELEC | PNL | PCC | 415 | V | `ELEC-PNL-PCC-415-V` | PCC panel, 415V |
| ELEC | PNL | MDB | 415 | V | `ELEC-PNL-MDB-415-V` | Main distribution board, 415V |
| ELEC | PNL | VFD | 415 | V | `ELEC-PNL-VFD-415-V` | VFD panel, 415V |
| ELEC | PNL | CCN | 230 | V | `ELEC-PNL-CCN-230-V` | Control console, 230V |
| ELEC | PNL | DBD | 230 | V | `ELEC-PNL-DBD-230-V` | Distribution board, 230V |

### 7.10 Electrical / Control — Components

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| ELEC | CMP | MCB | 016 | AMP | `ELEC-CMP-MCB-016-AMP` | MCB, 16A |
| ELEC | CMP | MCB | 032 | AMP | `ELEC-CMP-MCB-032-AMP` | MCB, 32A |
| ELEC | CMP | CCB | 100 | AMP | `ELEC-CMP-CCB-100-AMP` | MCCB, 100A |
| ELEC | CMP | CCB | 400 | AMP | `ELEC-CMP-CCB-400-AMP` | MCCB, 400A |
| ELEC | CMP | ACB | 1600 | AMP | `ELEC-CMP-ACB-1600-AMP` | ACB, 1600A |
| ELEC | CMP | CON | 032 | AMP | `ELEC-CMP-CON-032-AMP` | Contactor, 32A |
| ELEC | CMP | OVL | 025 | AMP | `ELEC-CMP-OVL-025-AMP` | Overload relay, up to 25A |
| ELEC | CMP | DOL | 011 | KW | `ELEC-CMP-DOL-011-KW` | DOL starter, 11 kW |
| ELEC | CMP | SDS | 022 | KW | `ELEC-CMP-SDS-022-KW` | Star-delta starter, 22 kW |
| ELEC | CMP | VFD | 011 | KW | `ELEC-CMP-VFD-011-KW` | VFD, 11 kW |
| ELEC | CMP | VFD | 075 | KW | `ELEC-CMP-VFD-075-KW` | VFD, 75 kW |
| ELEC | CMP | SST | 045 | KW | `ELEC-CMP-SST-045-KW` | Soft starter, 45 kW |
| ELEC | CMP | TRF | 100 | KVA | `ELEC-CMP-TRF-100-KVA` | Transformer, 100 kVA |
| ELEC | CMP | SMP | 024 | V | `ELEC-CMP-SMP-024-V` | SMPS 24V DC output |
| ELEC | CMP | UPS | 010 | KVA | `ELEC-CMP-UPS-010-KVA` | UPS, 10 kVA |
| ELEC | CMP | RLY | 024 | V | `ELEC-CMP-RLY-024-V` | Relay, 24V coil |
| ELEC | CMP | TMR | 230 | V | `ELEC-CMP-TMR-230-V` | Timer relay, 230V coil |
| ELEC | CMP | SEL | 022 | MM | `ELEC-CMP-SEL-022-MM` | Selector switch, 22mm cutout |
| ELEC | CMP | PBT | 022 | MM | `ELEC-CMP-PBT-022-MM` | Push button, 22mm cutout |
| ELEC | CMP | LMT | 022 | MM | `ELEC-CMP-LMT-022-MM` | Limit switch, 22mm |
| ELEC | CMP | IND | 022 | MM | `ELEC-CMP-IND-022-MM` | Pilot light, 22mm |
| ELEC | CMP | EMT | 415 | V | `ELEC-CMP-EMT-415-V` | Energy meter, 415V |
| ELEC | CMP | CTS | 200 | AMP | `ELEC-CMP-CTS-200-AMP` | Current transformer, 200A primary |
| ELEC | CMP | PTS | 415 | V | `ELEC-CMP-PTS-415-V` | Potential transformer, 415V primary |
| ELEC | CMP | FUS | 063 | AMP | `ELEC-CMP-FUS-063-AMP` | Fuse, 63A |
| ELEC | CMP | TBL | 010 | AMP | `ELEC-CMP-TBL-010-AMP` | Terminal block, 10A |
| ELEC | CMP | ELB | 040 | AMP | `ELEC-CMP-ELB-040-AMP` | ELCB/RCCB, 40A |
| ELEC | CMP | PLC | NA | NA | `ELEC-CMP-PLC-NA-NA` | PLC module (no standard size) |
| ELEC | CMP | HMI | 010 | IN | `ELEC-CMP-HMI-010-IN` | HMI, 10" screen |

### 7.11 Electrical / Control — Cabling

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| ELEC | CBL | PWR | 016 | MM2 | `ELEC-CBL-PWR-016-MM2` | Power cable, 16 mm² |
| ELEC | CBL | PWR | 150 | MM2 | `ELEC-CBL-PWR-150-MM2` | Power cable, 150 mm² |
| ELEC | CBL | CTL | 004 | MM2 | `ELEC-CBL-CTL-004-MM2` | Control cable, 4 mm² |
| ELEC | CBL | INS | 002 | MM2 | `ELEC-CBL-INS-002-MM2` | Instrumentation cable, 2 mm² (2-core) |
| ELEC | CBL | SIG | 001 | MM2 | `ELEC-CBL-SIG-001-MM2` | Signal cable, 1 mm² |
| ELEC | CBL | ETH | 050 | MM2 | `ELEC-CBL-ETH-050-MM2` | Earthing conductor, 50 mm² |

### 7.12 Electrical / Control — Junction Box

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| ELEC | JBX | FPR | 300 | MM | `ELEC-JBX-FPR-300-MM` | Flameproof JB, 300mm |
| ELEC | JBX | EXE | 400 | MM | `ELEC-JBX-EXE-400-MM` | Increased safety JB, 400mm |
| ELEC | JBX | GPP | 200 | MM | `ELEC-JBX-GPP-200-MM` | General purpose JB, 200mm |

### 7.13 Electrical / Control — Field Items

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| ELEC | FLD | NA | NA | NA | `ELEC-FLD-NA-NA-NA` | Field item — attrs form pending |

### 7.14 Bought-out Packages

| Group | Sub | Type | Size | Unit | Item Code | Notes |
|-------|-----|------|------|------|-----------|-------|
| BOPK | GEN | NA | NA | NA | `BOPK-GEN-NA-NA-NA` | General package — no standard size |
| BOPK | CLT | NDT | 100 | TR | `BOPK-CLT-NDT-100-TR` | Natural draft cooling tower, 100 TR |
| BOPK | CLT | MDT | 050 | TR | `BOPK-CLT-MDT-050-TR` | Mechanical draft, 50 TR |
| BOPK | CLT | IDT | 200 | TR | `BOPK-CLT-IDT-200-TR` | Induced draft, 200 TR |
| BOPK | CLT | FDT | 075 | TR | `BOPK-CLT-FDT-075-TR` | Forced draft, 75 TR |

---

## 8. Unit Code Registry

| Unit Code | Meaning | Example use |
|-----------|---------|-------------|
| `MM` | Millimetres | Plate thickness, section size, JB size |
| `NB` | Nominal Bore (mm) | Pipes, fittings, flanges, valves |
| `IN` | Inch | Safety valve inlet, screen size |
| `M3H` | Cubic metres per hour | Pump flow rate |
| `LPH` | Litres per hour | Pump flow rate (smaller) |
| `LPM` | Litres per minute | Hand pump |
| `KW` | Kilowatts | Motor/pump power |
| `KVA` | Kilovolt-amperes | Transformer / UPS rating |
| `BAR` | Bar | Pressure range |
| `MBR` | Millibar | Low-range DP |
| `KPA` | Kilopascals | Pressure (alternative) |
| `DGC` | Degrees Celsius | Temperature range |
| `AMP` | Amperes | Electrical current rating |
| `V` | Volts | Voltage |
| `MM2` | mm² (cross-section) | Cable size |
| `TR` | Tons of Refrigeration | Cooling tower capacity |
| `NA` | Not applicable | No meaningful size |

---

## 9. SAP B1 Compatibility Analysis

### 9.1 Character Count with Corrected Short Codes

| Item Code Example | Length | Fits SAP 20? |
|-------------------|--------|-------------|
| `VALV-ISO-GAT-050-NB` | 20 | ✓ Yes |
| `MOTR-NFP-ACI-015-KW` | 20 | ✓ Yes |
| `PUMP-CEN-HOR-100-M3H` | 20 | ✓ Yes |
| `PUMP-CEN-HOR-1000-LPH` | 21 | ✗ No (1 over) |
| `ELEC-CMP-MCB-016-AMP` | 21 | ✗ No (1 over) |
| `ELEC-CMP-ACB-1600-AMP` | 22 | ✗ No (2 over) |
| `INST-LVL-GWR-4000-MM` | 21 | ✗ No (1 over) |
| `PUMP-CEN-HOR-10000-M3H` | 22 | ✗ No (2 over) |
| `PUMP-CEN-HOR-1000-LPH-02` | 24 | ✗ No (collision suffix) |

**Finding:** With 3-char subgroup and type codes, 3-digit sizes fit exactly within 20 chars. 4-digit sizes push to 21 chars; 5-digit sizes push to 22 chars. The collision suffix adds a further 3 chars. The separate `sap_item_code` field is required for any code exceeding 20 chars.

### 9.2 Recommendation: Retain Separate `sap_item_code` Field

The separate `sap_item_code` column on `master_items` is **still required** for the following reasons:

1. Codes with 4-digit size (e.g., `1000-LPH`) exceed 20 chars by 1 character.
2. Codes with 5-digit size (e.g., `10000-M3H`) exceed 20 chars by 2 characters.
3. Codes with collision suffix always exceed 20 chars.
4. The actual ItemCode max length in the current SAP B1 instance has not been confirmed. If configured to 50 chars (SAP B1 9.x+), the full internal code can be used directly — but this must be verified before implementation.

### 9.3 SAP Item Code Mapping Strategy

- If internal `item_code` ≤ 20 chars → `sap_item_code` = same value.
- If internal `item_code` > 20 chars → truncate to 16 chars + `-` + 3-char CRC hex of full code: e.g., `PUMP-CEN-HOR-1000-A3F` (20 chars exactly).
- `master_items.item_code` (full internal, up to 50 chars) → SAP `FrgnName` field (100 chars, no constraint).
- `master_items.sap_item_code` (max 20 chars) → SAP `OITM.ItemCode`.

### 9.4 Open Question — Confirm Before SAP Sync Implementation

> **Q: What is the configured maximum length for `ItemCode` in the current SAP B1 instance?**
> Standard SAP B1 default = 20 chars. Extended configuration possible to 50 chars.
> **Owner: THERMOPAC IT / SAP B1 admin.**

---

## 10. Coding Architecture

### 10.1 New Module: `server/item-code-service.ts`

```
buildItemCodeSegments(groupCode, subgroupCode, technicalAttributes)
  → { group, subgroup, type, size, unit }

buildRawString({ group, subgroup, type, size, unit })
  → 'PUMP-CEN-HOR-1000-LPH'

generateAndReserveItemCode(db, groupCode, subgroupCode, technicalAttributes)
  → advisory lock → collision check → insert → return final code
```

### 10.2 Registry Table: `item_code_registry`

```sql
CREATE TABLE item_code_registry (
  id              SERIAL PRIMARY KEY,
  registry_type   TEXT NOT NULL,     -- 'group', 'subgroup', 'material', 'type',
                                     --   'size_field', 'unit', 'sap_group_map'
  scope_group     TEXT,              -- group code scope (e.g., 'pumps')
  scope_subgroup  TEXT,              -- subgroup code scope (e.g., 'centrifugal')
  entity_key      TEXT NOT NULL,     -- DB code or attr value (e.g., 'Horizontal')
  abbr            TEXT NOT NULL,     -- the short code (e.g., 'HOR')
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (registry_type, COALESCE(scope_group,''), COALESCE(scope_subgroup,''), entity_key)
);
```

Seeded at startup from `server/utils/item-code-registry-seed.ts` (idempotent).

### 10.3 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/item-code/preview` | Generate a read-only preview code from form data. No DB write. |
| `POST` | `/api/item-code/reserve` | Generate + write to `master_items`. Superuser / GM only. |
| `GET` | `/api/item-code/registry` | Return full registry. Superuser only. |
| `PUT` | `/api/item-code/registry/:id` | Update a registry entry. Superuser only. |
| `GET` | `/api/item-code/validate/:code` | Check format compliance and uniqueness. |
| `POST` | `/api/admin/item-code/backfill` | One-time migration trigger. Superuser only. |
| `GET` | `/api/admin/item-code/verify` | Parity and compliance report. |

---

## 11. Schema Changes Required

### 11.1 New Table: `item_code_registry`
Defined above in §10.2. Seeded at startup.

### 11.2 Additive Columns on `master_items`

```sql
ALTER TABLE master_items
  ADD COLUMN sap_item_code      VARCHAR(20),
  ADD COLUMN ic_group           VARCHAR(5),   -- e.g. 'PUMP'
  ADD COLUMN ic_subgroup        VARCHAR(3),   -- e.g. 'CEN'
  ADD COLUMN ic_type            VARCHAR(3),   -- e.g. 'HOR'
  ADD COLUMN ic_size            VARCHAR(5),   -- e.g. '1000'
  ADD COLUMN ic_unit            VARCHAR(4),   -- e.g. 'LPH'
  ADD COLUMN buy_group_id       INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id    INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source   TEXT;         -- 'auto', 'manual', 'migrated', 'sap_sync'
```

All new columns are nullable or have defaults. Existing records and the existing `item_code` column are unchanged.

### 11.3 Additive Column on `buy_package_lines`

```sql
ALTER TABLE buy_package_lines
  ADD COLUMN suggested_item_code VARCHAR(50);  -- informational preview only
```

---

## 12. Migration & Backfill Strategy

| Phase | Action | Risk |
|-------|--------|------|
| P0 | Create `item_code_registry` table + seed all codes from §4–§8 | Zero |
| P0 | Apply additive schema columns (§11) | Zero |
| P1 | Build `item-code-service.ts` pure builder, preview endpoint | Low |
| P2 | Reserve endpoint with advisory lock | Medium |
| P2 | Wire Phase 3 approval → auto-generate item code | Medium |
| P3 | UI: item code preview chip in buy-packages-page (read-only) | Low |
| P3 | UI: show item code in EPC buy list selection modal | Low |
| P3 | Admin: Item Code Registry CRUD page | Low |
| P4 | One-time backfill of existing `master_items` | Medium |
| P5 | SAP B1 data-mapping update + `sap_item_code` sync | High |

**Backfill rule:** existing `master_items` without structured segment columns get processed by the admin-triggered backfill endpoint. Where group/subgroup cannot be reliably determined from description text, the record is flagged `item_code_source = 'needs_review'`. Original `item_code` value is preserved in all cases.

---

## 13. Audit & Validation

- Every generation logged to `audit_logs` (`entity_type = 'master_item'`, `action = 'item_code_generated'`).
- Format compliance regex: `^[A-Z]{3,5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}(-\d{2})?$`
- Uniqueness enforced by existing DB unique index on `master_items.item_code`.
- Locked records (`item_code_locked = true`) reject any regeneration attempt.
- Parity verification endpoint returns: duplicate codes, non-compliant codes, SAP mismatches, `needs_review` count.

---

## 14. Open Questions — Resolve Before Implementation

| # | Question | Owner |
|---|----------|-------|
| 1 | **SAP B1 ItemCode max length:** What is the configured max length in the current production instance? Standard = 20 chars; extended config up to 50 chars possible. | THERMOPAC IT / SAP admin |
| 2 | **`ELEC-CMP-PLC-NA-NA` and `BOPK-GEN-NA-NA-NA`:** Is `NA-NA` for both size and unit acceptable for types with no standard size, or should a different convention be used? | Approval required |
| 3 | **Field Items (FLD):** Should `ELEC-FLD-NA-NA-NA` be used as a placeholder until the attrs form is defined, or should field items be excluded from item code generation entirely until the form is ready? | PM / Engineering |
| 4 | **Pump size field priority:** Is the primary size the flow rate (preferred) or the power (kW) for cases where flow rate is not specified? | Engineering lead |
| 5 | **SAP Item Group mapping:** Confirm the SAP Item Group codes configured in the production B1 instance match the labels in §9.3. | THERMOPAC Finance / SAP |

---

*End of Plan v2.0 — Submit for approval before implementation.*
