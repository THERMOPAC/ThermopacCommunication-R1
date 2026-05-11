# BUY Item Code Generation — Implementation Plan v4.0
**Date:** 2026-05-11
**Supersedes:** v3.0 (2026-05-11)
**Status:** REVISED — Awaiting approval. Do not implement.
**Scope:** Item Code format, 5-character GROUP standard, SAP B1 10+ analysis, Variant Architecture

---

## 1. Changes from v3.0

| # | Correction |
|---|------------|
| C19 | GROUP code standardised to **exactly 5 characters** for readability and long-term maintainability. |
| C20 | All GROUP codes re-evaluated and updated across every table and example. |
| C21 | Raw material subgroup-as-GROUP codes updated to exactly 5 characters (`PLATE`, `PIPES`, `FITNG`, `FLANG`, `FASTN`, `GASKT`, `STEEL`). |
| C22 | SAP B1 10+ analysis added. CRC truncation and dual-code complexity removed pending confirmation of actual configured ItemCode length. |
| C23 | Full Code Matrix regenerated with new 5-character GROUP codes. |
| C24 | Variant Architecture examples regenerated with new GROUP codes. |
| C25 | Priority restated: engineering readability, procurement readability, searchability, long-term maintainability — not minimum character count. |

---

## 2. Item Code Format

```
GROUP-SUBGROUP-TYPE-SIZE-UNIT
```

### 2.1 Segment Length Rules — Final Standard

| Segment | Length Rule | Notes |
|---------|-------------|-------|
| GROUP | **Exactly 5 characters** | Fixed from registry; no variation |
| SUBGROUP | Max 3 characters | Fixed from registry; no padding |
| TYPE | Max 3 characters; `NA` when no type applies | Fixed from registry; no padding |
| SIZE | 3 – 5 digits, zero-padded to minimum 3 | 10 → `010`, 1000 → `1000`, 10000 → `10000` |
| UNIT | Max 4 characters | Fixed from unit registry |

**Rationale for exactly 5 characters for GROUP:**
- All codes open with an immediately recognisable 5-character group token (`PUMPS`, `VALVE`, `MOTOR`, `INSTR`, `ELECT`).
- Consistent prefix length makes codes visually scannable in lists, reports, and SAP screens.
- Supports alphabetical and prefix-range queries without regex.
- Eliminates the ambiguity of 3–5 variable-length groups.

### 2.2 Item Code Length Profile

| Pattern | Example | Length |
|---------|---------|--------|
| GROUP(5)+SUB(2)+TYP(2)+SIZE(3)+UNIT(2) | `VALVE-ISO-BAL-050-NB` | 20 |
| GROUP(5)+SUB(3)+TYP(3)+SIZE(3)+UNIT(2) | `MOTOR-NFP-ACI-015-KW` | 21 |
| GROUP(5)+SUB(3)+TYP(3)+SIZE(4)+UNIT(3) | `PUMPS-CEN-HOR-1000-LPH` | 22 |
| GROUP(5)+SUB(3)+TYP(3)+SIZE(5)+UNIT(3) | `PUMPS-CEN-HOR-10000-M3H` | 23 |
| With approved suffix | `PUMPS-CEN-HOR-1000-LPH-02` | 25 |

**Baseline range: 20–23 characters. With approved suffix: up to 25 characters.**

### 2.3 Size Zero-Padding Rule — Confirmed

| Raw value | Padded SIZE |
|-----------|-------------|
| 10 | `010` |
| 50 | `050` |
| 100 | `100` |
| 1000 | `1000` |
| 10000 | `10000` |

The approved example `PLAT-CS-NA-10-MM` (v1.0 notation) is now rendered as **`PLATE-CS-NA-010-MM`** with the 5-character GROUP standard.

### 2.4 Suffix Exception (unchanged from v3.0)

Suffixes `-02` through `-99` are a **controlled last-resort exception only**, requiring Superuser approval and audit logging. They are never the default response to technical/commercial differences — those are handled by the Variant layer (§6).

---

## 3. SAP B1 10+ Analysis — Simplified Architecture

### 3.1 SAP B1 10 ItemCode Length Reality

SAP Business One 10 (current release series) supports `OITM.ItemCode` up to **50 characters** natively in the HANA-based platform without additional configuration. This is a fundamental change from the legacy 20-character limit that existed in earlier SAP B1 versions (pre-9.x).

**Our codes with the 5-character GROUP standard peak at 23 characters (25 with rare suffix exception).** All codes fit within 50 characters with significant headroom.

### 3.2 Action Required Before SAP Implementation

> **Verify the actual configured `ItemCode` field length in the production SAP B1 10+ instance before any SAP sync implementation.**
>
> Expected answer: 50 characters (B1 10 HANA default).
> If confirmed ≥ 25 characters → the internal `item_code` IS the SAP ItemCode. No separate `sap_item_code` column, no CRC truncation, no dual-code complexity.
> Owner: THERMOPAC IT / SAP B1 admin.

### 3.3 Recommended Simplified Architecture (pending SAP confirmation)

| Scenario | Approach |
|----------|----------|
| SAP ItemCode ≥ 25 chars (expected) | `master_items.item_code` is used directly as SAP ItemCode. No `sap_item_code` column needed. Single code everywhere. |
| SAP ItemCode = 20 chars (legacy) | Retain the `sap_item_code` VARCHAR(20) column with CRC-truncation for codes > 20 chars (as documented in v2.0/v3.0). |

**The plan proceeds on the assumption that SAP B1 10+ is configured at ≥ 25 chars, which eliminates the `sap_item_code` field entirely.** The schema includes it as an optional column that can be dropped once SAP length is confirmed.

### 3.4 SAP B1 Field Mapping

| THERMOPAC field | SAP B1 field | Notes |
|----------------|-------------|-------|
| `master_items.item_code` | `OITM.ItemCode` | Direct — no truncation needed at 50-char config |
| `master_items.description` | `OITM.ItemName` | Engineering family description |
| `item_variants.moc` | `OITM.U_MOC` (UDF) | Preferred variant MOC |
| `item_variants.pressure_class` | `OITM.U_PressClass` (UDF) | Preferred variant pressure class |
| `item_variants.certifications` | `OITM.U_Certs` (UDF) | Preferred variant certifications |
| `item_variants.vendor_id` + `model_number` | `OMRP` (Manufacturer Part Numbers) | One row per active Variant |
| Selected Variant full spec | `OPOR1.Dscription` / `FreeText` | Written at PO creation per project |

### 3.5 SAP Item Group Mapping

| THERMOPAC Group | SAP Item Group (OITG) |
|----------------|----------------------|
| `raw_materials` | Raw Materials |
| `pumps` | Rotating Equipment |
| `motors` | Rotating Equipment |
| `instruments` | Instrumentation |
| `valves` | Piping & Valves |
| `electrical_control` | Electrical & Control |
| `bought_out_packages` | Bought-out Packages |

---

## 4. Core Design Principle (unchanged from v3.0)

The Master Item Code identifies a **procurement engineering family** — the functional duty specification that is stable regardless of vendor, MOC, or certification.

```
Master Item Code:  PUMPS-CEN-HOR-1000-LPH
Meaning:           Centrifugal pump, horizontal, 1000 LPH
                   ↳ ONE master item, multiple variants
                      (KSB/CS/ANSI150, Grundfos/SS316/ANSI150, Flowserve/SS316/ATEX…)
```

Item Code = engineering identity, not purchase specification. Full purchase specification lives in the Variant record.

---

## 5. GROUP Code Registry — 5 Characters Fixed

### 5.1 Standard Group Codes

| Group (DB code) | Label | GROUP Code | Chars |
|-----------------|-------|-----------|-------|
| `pumps` | Pumps | `PUMPS` | 5 |
| `motors` | Motors | `MOTOR` | 5 |
| `instruments` | Instruments | `INSTR` | 5 |
| `valves` | Valves | `VALVE` | 5 |
| `electrical_control` | Electrical / Control | `ELECT` | 5 |
| `bought_out_packages` | Bought-out Packages | `BOPKG` | 5 |

### 5.2 Raw Materials — Subgroup-as-GROUP (5 Characters Fixed)

For raw materials, the subgroup name becomes the GROUP code (approved encoding, see v2.0 §4.2). All raw material GROUP codes are exactly 5 characters:

| Subgroup (DB code) | Label | GROUP Code | Chars |
|--------------------|-------|-----------|-------|
| `plates` | Plates | `PLATE` | 5 |
| `pipes` | Pipes | `PIPES` | 5 |
| `fittings` | Fittings | `FITNG` | 5 |
| `flanges` | Flanges | `FLANG` | 5 |
| `fasteners` | Fasteners | `FASTN` | 5 |
| `gaskets` | Gaskets | `GASKT` | 5 |
| `structural_steel` | Structural Steel | `STEEL` | 5 |

---

## 6. SUBGROUP Code Registry — Max 3 Characters (unchanged from v3.0)

### 6.1 Standard Subgroup Codes

| Group | Subgroup (DB code) | Label | SUBGROUP Code |
|-------|--------------------|-------|--------------|
| PUMPS | `centrifugal` | Centrifugal | `CEN` |
| PUMPS | `gear` | Gear | `GEA` |
| PUMPS | `screw` | Screw | `SCR` |
| PUMPS | `multistage` | Multistage | `MLT` |
| PUMPS | `dosing_metering` | Dosing / Metering | `DOS` |
| PUMPS | `vacuum_boosters` | Vacuum Boosters | `VCB` |
| PUMPS | `pump_skid` | Pump Skid Packages | `SKD` |
| PUMPS | `vacuum_pump` | Vacuum Pump | `VCP` |
| PUMPS | `hand_pump` | Hand Pump | `HND` |
| MOTOR | `non_flameproof` | Non-Flameproof Motor | `NFP` |
| MOTOR | `flameproof` | Flameproof Motor | `FLP` |
| INSTR | `pressure` | Pressure | `PRS` |
| INSTR | `temperature` | Temperature | `TMP` |
| INSTR | `flow` | Flow | `FLW` |
| INSTR | `level` | Level | `LVL` |
| VALVE | `isolation` | Isolation Valve | `ISO` |
| VALVE | `control` | Control Valve | `CTL` |
| VALVE | `safety` | Safety Valve | `SAF` |
| VALVE | `on_off` | ON/OFF Valve | `ONF` |
| VALVE | `nrv` | Non-Return Valve | `NRV` |
| VALVE | `needle` | Needle Valve | `NDL` |
| ELECT | `panels` | Panels | `PNL` |
| ELECT | `components` | Components | `CMP` |
| ELECT | `field_items` | Field Items | `FLD` |
| ELECT | `cabling` | Cabling | `CBL` |
| ELECT | `junction_box` | Junction Box | `JBX` |
| BOPKG | `general` | General Bought-out | `GEN` |
| BOPKG | `cooling_tower` | Cooling Tower | `CLT` |

### 6.2 Raw Material Material/Grade Codes (SUBGROUP segment, max 3 chars)

| Material / Grade | SUBGROUP Code |
|-----------------|--------------|
| Carbon Steel (CS / A516 / SA516 / IS 2062) | `CS` |
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

## 7. TYPE Code Registry — Max 3 Characters (unchanged from v3.0)

### 7.1 Pumps

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `CEN` | `HOR` | Horizontal |
| `CEN` | `VRT` | Vertical |
| `CEN` | `SUB` | Submersible |
| `CEN` | `SPR` | Self-Priming |
| `CEN` | `ENS` | End Suction |
| `CEN` | `SPC` | Split Case |
| `CEN` | `MNB` | Monoblock |
| `CEN` | `INL` | In-Line |
| `GEA` | `NA` | No type |
| `SCR` | `NA` | No type |
| `MLT` | `HOR` | Horizontal Multistage |
| `MLT` | `VRT` | Vertical Multistage |
| `DOS` | `DPH` | Diaphragm |
| `DOS` | `PER` | Peristaltic |
| `DOS` | `PLN` | Plunger |
| `DOS` | `NA` | Not specified |
| `VCB` | `NA` | No type |
| `SKD` | `NA` | No type |
| `VCP` | `DRY` | Dry Running |
| `VCP` | `OLS` | Oil Sealed |
| `VCP` | `WTR` | Water Ring |
| `HND` | `NA` | No type |

### 7.2 Motors

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `NFP` | `ACI` | AC Induction / Squirrel Cage |
| `NFP` | `SLR` | Slip Ring |
| `NFP` | `SYN` | Synchronous |
| `NFP` | `PMG` | Permanent Magnet |
| `FLP` | `ACI` | AC Induction (flameproof) |
| `FLP` | `SLR` | Slip Ring (flameproof) |
| `FLP` | `SYN` | Synchronous (flameproof) |

### 7.3 Instruments — Pressure

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `PRS` | `GAU` | Bourdon Tube Gauge |
| `PRS` | `TXR` | Pressure Transmitter |
| `PRS` | `SWT` | Pressure Switch |
| `PRS` | `DPT` | Differential Pressure Transmitter |
| `PRS` | `IND` | Pressure Indicator |

### 7.4 Instruments — Temperature

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `TMP` | `TCC` | Thermocouple |
| `TMP` | `RTD` | RTD |
| `TMP` | `TXR` | Temperature Transmitter |
| `TMP` | `SWT` | Temperature Switch |
| `TMP` | `BIM` | Bimetallic / Dial Thermometer |
| `TMP` | `DID` | Digital Indicator |

### 7.5 Instruments — Flow

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `FLW` | `MAG` | Electromagnetic / Magnetic |
| `FLW` | `VTX` | Vortex |
| `FLW` | `ORP` | Orifice Plate |
| `FLW` | `ROT` | Rotameter / Variable Area |
| `FLW` | `TRB` | Turbine |
| `FLW` | `ULT` | Ultrasonic |
| `FLW` | `CRL` | Coriolis |
| `FLW` | `DPF` | Differential Pressure Flow |

### 7.6 Instruments — Level

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `LVL` | `LGG` | Level Gauge Glass |
| `LVL` | `MLI` | Magnetic Level Indicator |
| `LVL` | `FLT` | Float Type |
| `LVL` | `TXR` | Level Transmitter |
| `LVL` | `SWT` | Level Switch |
| `LVL` | `RDR` | Radar |
| `LVL` | `ULT` | Ultrasonic |
| `LVL` | `GWR` | Guided Wave Radar |

### 7.7 Valves

| Subgroup | TYPE | Meaning |
|----------|------|---------|
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
| `NDL` | `NA` | No type |

### 7.8 Electrical / Control — Panels

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `PNL` | `MCC` | Motor Control Centre |
| `PNL` | `PCC` | Power Control Centre |
| `PNL` | `MDB` | Main Distribution Board |
| `PNL` | `VFD` | VFD Panel |
| `PNL` | `CCN` | Control Console |
| `PNL` | `DBD` | Distribution Board |

### 7.9 Electrical / Control — Components

| Subgroup | TYPE | Meaning |
|----------|------|---------|
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

### 7.10 Electrical / Control — Cabling

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `CBL` | `PWR` | Power Cable |
| `CBL` | `CTL` | Control Cable |
| `CBL` | `INS` | Instrumentation Cable |
| `CBL` | `SIG` | Signal Cable |
| `CBL` | `ETH` | Earthing / Bare Conductor |

### 7.11 Electrical / Control — Junction Box

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `JBX` | `FPR` | Flameproof (Ex-d) |
| `JBX` | `EXE` | Increased Safety (Ex-e) |
| `JBX` | `GPP` | General Purpose |

### 7.12 Field Items and Bought-out Packages

| Subgroup | TYPE | Meaning |
|----------|------|---------|
| `FLD` | `NA` | No attrs form yet — placeholder |
| `GEN` | `NA` | No standard type |
| `CLT` | `NDT` | Natural Draft |
| `CLT` | `MDT` | Mechanical Draft |
| `CLT` | `IDT` | Induced Draft |
| `CLT` | `FDT` | Forced Draft |

---

## 8. UNIT Code Registry — Max 4 Characters

| Unit Code | Meaning | Used for |
|-----------|---------|---------|
| `MM` | Millimetres | Plate thickness, JB size, section size |
| `NB` | Nominal Bore | Pipes, fittings, flanges, valves, instruments |
| `IN` | Inch | Safety valve inlet, screen size |
| `M3H` | m³ per hour | Pump / compressor flow |
| `LPH` | Litres per hour | Dosing / smaller centrifugal pumps |
| `LPM` | Litres per minute | Hand pump |
| `KW` | Kilowatts | Motor / pump / drive power |
| `KVA` | Kilovolt-amperes | Transformer, UPS |
| `BAR` | Bar | Pressure range |
| `MBR` | Millibar | Low-range differential pressure |
| `KPA` | Kilopascals | Pressure (alternative) |
| `DGC` | Degrees Celsius | Temperature range |
| `AMP` | Amperes | Current rating |
| `V` | Volts | Voltage |
| `MM2` | mm² cross-section | Cable size |
| `TR` | Tons of Refrigeration | Cooling tower capacity |
| `NA` | Not applicable | No meaningful size |

---

## 9. Full Code Matrix — Validation Table (Updated with 5-Character GROUP Codes)

### 9.1 Raw Materials

| Item Code | Description |
|-----------|-------------|
| `PLATE-CS-NA-010-MM` | CS plate 10 mm |
| `PLATE-CS-NA-012-MM` | CS plate 12 mm |
| `PLATE-S30-NA-006-MM` | SS304 plate 6 mm |
| `PLATE-S31-NA-008-MM` | SS316L plate 8 mm |
| `PLATE-DSS-NA-010-MM` | Duplex plate 10 mm |
| `PLATE-HAS-NA-006-MM` | Hastelloy plate 6 mm |
| `PIPES-CS-NA-050-NB` | CS seamless pipe 50 NB |
| `PIPES-CS-NA-100-NB` | CS seamless pipe 100 NB |
| `PIPES-S30-NA-080-NB` | SS304 pipe 80 NB |
| `PIPES-S31-NA-050-NB` | SS316L pipe 50 NB |
| `PIPES-DSS-NA-080-NB` | Duplex pipe 80 NB |
| `PIPES-GI-NA-040-NB` | GI pipe 40 NB |
| `FITNG-CS-NA-050-NB` | CS fitting (elbow/tee) 50 NB |
| `FITNG-S31-NA-080-NB` | SS316L fitting 80 NB |
| `FITNG-DSS-NA-050-NB` | Duplex fitting 50 NB |
| `FLANG-CS-NA-100-NB` | CS flange 100 NB |
| `FLANG-CS-NA-050-NB` | CS flange 50 NB |
| `FLANG-S30-NA-050-NB` | SS304 flange 50 NB |
| `FLANG-S31-NA-080-NB` | SS316L flange 80 NB |
| `FLANG-DSS-NA-100-NB` | Duplex flange 100 NB |
| `FASTN-CS-NA-020-MM` | CS bolt/nut M20 |
| `FASTN-HT-NA-024-MM` | High-tensile bolt M24 |
| `FASTN-S30-NA-016-MM` | SS304 fastener M16 |
| `FASTN-S31-NA-020-MM` | SS316L fastener M20 |
| `GASKT-GRP-NA-050-NB` | Graphite gasket 50 NB |
| `GASKT-PTE-NA-080-NB` | PTFE gasket 80 NB |
| `GASKT-SPW-NA-100-NB` | Spiral wound gasket 100 NB |
| `GASKT-RJT-NA-040-NB` | Ring joint gasket 40 NB |
| `STEEL-MS-NA-100-MM` | MS angle/channel 100 mm |
| `STEEL-GI-NA-050-MM` | GI structural section 50 mm |
| `STEEL-MS-NA-075-MM` | MS channel 75 mm |

### 9.2 Pumps

| Item Code | Description |
|-----------|-------------|
| `PUMPS-CEN-HOR-1000-LPH` | **Approved example — centrifugal horizontal 1000 LPH** |
| `PUMPS-CEN-HOR-100-M3H` | Centrifugal horizontal 100 m³/h |
| `PUMPS-CEN-HOR-200-M3H` | Centrifugal horizontal 200 m³/h |
| `PUMPS-CEN-VRT-050-M3H` | Centrifugal vertical 50 m³/h |
| `PUMPS-CEN-SUB-020-M3H` | Centrifugal submersible 20 m³/h |
| `PUMPS-CEN-SPR-010-M3H` | Self-priming centrifugal 10 m³/h |
| `PUMPS-CEN-ENS-080-M3H` | End suction centrifugal 80 m³/h |
| `PUMPS-CEN-SPC-200-M3H` | Split case centrifugal 200 m³/h |
| `PUMPS-CEN-MNB-015-KW` | Monoblock centrifugal 15 kW |
| `PUMPS-CEN-INL-030-M3H` | In-line centrifugal 30 m³/h |
| `PUMPS-GEA-NA-005-M3H` | Gear pump 5 m³/h |
| `PUMPS-GEA-NA-020-M3H` | Gear pump 20 m³/h |
| `PUMPS-SCR-NA-010-M3H` | Screw pump 10 m³/h |
| `PUMPS-MLT-HOR-050-M3H` | Horizontal multistage 50 m³/h |
| `PUMPS-MLT-VRT-030-M3H` | Vertical multistage 30 m³/h |
| `PUMPS-DOS-DPH-100-LPH` | Diaphragm dosing pump 100 LPH |
| `PUMPS-DOS-DPH-500-LPH` | Diaphragm dosing pump 500 LPH |
| `PUMPS-DOS-PER-050-LPH` | Peristaltic dosing pump 50 LPH |
| `PUMPS-DOS-PLN-200-LPH` | Plunger dosing pump 200 LPH |
| `PUMPS-VCB-NA-100-M3H` | Vacuum booster 100 m³/h |
| `PUMPS-SKD-NA-030-KW` | Pump skid package 30 kW |
| `PUMPS-VCP-DRY-050-M3H` | Dry running vacuum pump 50 m³/h |
| `PUMPS-VCP-OLS-030-M3H` | Oil sealed vacuum pump 30 m³/h |
| `PUMPS-VCP-WTR-020-M3H` | Water ring vacuum pump 20 m³/h |
| `PUMPS-HND-NA-010-LPM` | Hand pump 10 LPM |

### 9.3 Motors

| Item Code | Description |
|-----------|-------------|
| `MOTOR-NFP-ACI-011-KW` | Non-FP AC induction 11 kW |
| `MOTOR-NFP-ACI-015-KW` | Non-FP AC induction 15 kW |
| `MOTOR-NFP-ACI-022-KW` | Non-FP AC induction 22 kW |
| `MOTOR-NFP-ACI-037-KW` | Non-FP AC induction 37 kW |
| `MOTOR-NFP-ACI-075-KW` | Non-FP AC induction 75 kW |
| `MOTOR-NFP-ACI-110-KW` | Non-FP AC induction 110 kW |
| `MOTOR-NFP-SLR-045-KW` | Non-FP slip ring 45 kW |
| `MOTOR-NFP-SYN-100-KW` | Non-FP synchronous 100 kW |
| `MOTOR-NFP-PMG-011-KW` | Non-FP permanent magnet 11 kW |
| `MOTOR-FLP-ACI-015-KW` | Flameproof AC induction 15 kW |
| `MOTOR-FLP-ACI-022-KW` | Flameproof AC induction 22 kW |
| `MOTOR-FLP-ACI-045-KW` | Flameproof AC induction 45 kW |
| `MOTOR-FLP-SLR-055-KW` | Flameproof slip ring 55 kW |
| `MOTOR-FLP-SYN-022-KW` | Flameproof synchronous 22 kW |

### 9.4 Instruments — Pressure

| Item Code | Description |
|-----------|-------------|
| `INSTR-PRS-GAU-006-BAR` | Pressure gauge 0–6 bar |
| `INSTR-PRS-GAU-016-BAR` | Pressure gauge 0–16 bar |
| `INSTR-PRS-GAU-100-BAR` | Pressure gauge 0–100 bar |
| `INSTR-PRS-TXR-010-BAR` | Pressure transmitter 0–10 bar |
| `INSTR-PRS-TXR-025-BAR` | Pressure transmitter 0–25 bar |
| `INSTR-PRS-TXR-060-BAR` | Pressure transmitter 0–60 bar |
| `INSTR-PRS-SWT-010-BAR` | Pressure switch 10 bar |
| `INSTR-PRS-DPT-100-MBR` | DP transmitter 0–100 mbar |
| `INSTR-PRS-IND-006-BAR` | Pressure indicator 0–6 bar |

### 9.5 Instruments — Temperature

| Item Code | Description |
|-----------|-------------|
| `INSTR-TMP-TCC-200-DGC` | Thermocouple 0–200°C |
| `INSTR-TMP-TCC-600-DGC` | Thermocouple 0–600°C |
| `INSTR-TMP-RTD-150-DGC` | RTD PT100 0–150°C |
| `INSTR-TMP-RTD-200-DGC` | RTD PT100 0–200°C |
| `INSTR-TMP-TXR-200-DGC` | Temp transmitter 0–200°C |
| `INSTR-TMP-SWT-100-DGC` | Temperature switch 100°C |
| `INSTR-TMP-BIM-100-DGC` | Bimetallic dial thermometer 100°C |
| `INSTR-TMP-DID-200-DGC` | Digital temperature indicator 200°C |

### 9.6 Instruments — Flow

| Item Code | Description |
|-----------|-------------|
| `INSTR-FLW-MAG-050-NB` | Magnetic flowmeter 50 NB |
| `INSTR-FLW-MAG-080-NB` | Magnetic flowmeter 80 NB |
| `INSTR-FLW-MAG-100-NB` | Magnetic flowmeter 100 NB |
| `INSTR-FLW-VTX-050-NB` | Vortex flowmeter 50 NB |
| `INSTR-FLW-ORP-100-NB` | Orifice plate 100 NB |
| `INSTR-FLW-ROT-025-NB` | Rotameter 25 NB |
| `INSTR-FLW-TRB-040-NB` | Turbine meter 40 NB |
| `INSTR-FLW-ULT-200-NB` | Ultrasonic flowmeter 200 NB |
| `INSTR-FLW-CRL-050-NB` | Coriolis meter 50 NB |
| `INSTR-FLW-DPF-100-NB` | DP-type flowmeter 100 NB |

### 9.7 Instruments — Level

| Item Code | Description |
|-----------|-------------|
| `INSTR-LVL-LGG-500-MM` | Level gauge glass 500 mm |
| `INSTR-LVL-MLI-1000-MM` | Magnetic level indicator 1000 mm |
| `INSTR-LVL-FLT-500-MM` | Float level 500 mm |
| `INSTR-LVL-TXR-2000-MM` | Level transmitter 0–2000 mm |
| `INSTR-LVL-TXR-3000-MM` | Level transmitter 0–3000 mm |
| `INSTR-LVL-SWT-500-MM` | Level switch 500 mm |
| `INSTR-LVL-RDR-3000-MM` | Radar level 0–3000 mm |
| `INSTR-LVL-ULT-2000-MM` | Ultrasonic level 0–2000 mm |
| `INSTR-LVL-GWR-4000-MM` | Guided wave radar 0–4000 mm |

### 9.8 Valves — Isolation

| Item Code | Description |
|-----------|-------------|
| `VALVE-ISO-GAT-025-NB` | Gate valve 25 NB |
| `VALVE-ISO-GAT-050-NB` | Gate valve 50 NB |
| `VALVE-ISO-GAT-100-NB` | Gate valve 100 NB |
| `VALVE-ISO-GLB-025-NB` | Globe valve 25 NB |
| `VALVE-ISO-BAL-040-NB` | Ball valve 40 NB |
| `VALVE-ISO-BAL-050-NB` | Ball valve 50 NB |
| `VALVE-ISO-BAL-080-NB` | Ball valve 80 NB |
| `VALVE-ISO-BTF-150-NB` | Butterfly valve 150 NB |
| `VALVE-ISO-BTF-200-NB` | Butterfly valve 200 NB |
| `VALVE-ISO-PLG-050-NB` | Plug valve 50 NB |
| `VALVE-ISO-DPH-040-NB` | Diaphragm valve 40 NB |

### 9.9 Valves — Control, Safety, ON/OFF, NRV, Needle

| Item Code | Description |
|-----------|-------------|
| `VALVE-CTL-GLB-050-NB` | Control globe valve 50 NB |
| `VALVE-CTL-BAL-040-NB` | Control ball valve 40 NB |
| `VALVE-CTL-BTF-150-NB` | Control butterfly valve 150 NB |
| `VALVE-SAF-SPL-001-IN` | Spring loaded safety valve 1 in |
| `VALVE-SAF-SPL-002-IN` | Spring loaded safety valve 2 in |
| `VALVE-SAF-POL-003-IN` | Pilot operated safety valve 3 in |
| `VALVE-ONF-BAL-050-NB` | ON/OFF ball valve 50 NB |
| `VALVE-ONF-BTF-200-NB` | ON/OFF butterfly valve 200 NB |
| `VALVE-ONF-GAT-100-NB` | ON/OFF gate valve 100 NB |
| `VALVE-NRV-SCK-050-NB` | Swing check valve 50 NB |
| `VALVE-NRV-LCK-025-NB` | Lift check valve 25 NB |
| `VALVE-NRV-DPC-150-NB` | Dual plate check valve 150 NB |
| `VALVE-NRV-TDC-100-NB` | Tilting disc check valve 100 NB |
| `VALVE-NDL-NA-006-NB` | Needle valve 6 NB |
| `VALVE-NDL-NA-012-NB` | Needle valve 12 NB |

### 9.10 Electrical / Control — Panels

| Item Code | Description |
|-----------|-------------|
| `ELECT-PNL-MCC-415-V` | MCC panel 415V |
| `ELECT-PNL-PCC-415-V` | PCC panel 415V |
| `ELECT-PNL-MDB-415-V` | Main distribution board 415V |
| `ELECT-PNL-VFD-415-V` | VFD panel 415V |
| `ELECT-PNL-CCN-230-V` | Control console 230V |
| `ELECT-PNL-DBD-230-V` | Distribution board 230V |

### 9.11 Electrical / Control — Components

| Item Code | Description |
|-----------|-------------|
| `ELECT-CMP-MCB-016-AMP` | MCB 16A |
| `ELECT-CMP-MCB-032-AMP` | MCB 32A |
| `ELECT-CMP-MCB-063-AMP` | MCB 63A |
| `ELECT-CMP-CCB-100-AMP` | MCCB 100A |
| `ELECT-CMP-CCB-250-AMP` | MCCB 250A |
| `ELECT-CMP-CCB-400-AMP` | MCCB 400A |
| `ELECT-CMP-ACB-1600-AMP` | ACB 1600A |
| `ELECT-CMP-ACB-2500-AMP` | ACB 2500A |
| `ELECT-CMP-CON-032-AMP` | Contactor 32A |
| `ELECT-CMP-CON-063-AMP` | Contactor 63A |
| `ELECT-CMP-OVL-025-AMP` | Overload relay up to 25A |
| `ELECT-CMP-DOL-011-KW` | DOL starter 11 kW |
| `ELECT-CMP-DOL-022-KW` | DOL starter 22 kW |
| `ELECT-CMP-SDS-022-KW` | Star-delta starter 22 kW |
| `ELECT-CMP-SDS-045-KW` | Star-delta starter 45 kW |
| `ELECT-CMP-VFD-011-KW` | VFD 11 kW |
| `ELECT-CMP-VFD-037-KW` | VFD 37 kW |
| `ELECT-CMP-VFD-075-KW` | VFD 75 kW |
| `ELECT-CMP-SST-045-KW` | Soft starter 45 kW |
| `ELECT-CMP-TRF-100-KVA` | Transformer 100 kVA |
| `ELECT-CMP-TRF-250-KVA` | Transformer 250 kVA |
| `ELECT-CMP-SMP-024-V` | SMPS 24V DC |
| `ELECT-CMP-UPS-010-KVA` | UPS 10 kVA |
| `ELECT-CMP-RLY-024-V` | Relay 24V coil |
| `ELECT-CMP-TMR-230-V` | Timer relay 230V coil |
| `ELECT-CMP-SEL-022-MM` | Selector switch 22 mm |
| `ELECT-CMP-PBT-022-MM` | Push button 22 mm |
| `ELECT-CMP-LMT-022-MM` | Limit switch 22 mm |
| `ELECT-CMP-IND-022-MM` | Pilot light 22 mm |
| `ELECT-CMP-EMT-415-V` | Energy meter 415V |
| `ELECT-CMP-CTS-200-AMP` | CT 200A primary |
| `ELECT-CMP-CTS-400-AMP` | CT 400A primary |
| `ELECT-CMP-PTS-415-V` | PT 415V primary |
| `ELECT-CMP-FUS-063-AMP` | Fuse 63A |
| `ELECT-CMP-TBL-010-AMP` | Terminal block 10A |
| `ELECT-CMP-ELB-040-AMP` | ELCB/RCCB 40A |
| `ELECT-CMP-PLC-NA-NA` | PLC / DCS module (no std size) |
| `ELECT-CMP-HMI-010-IN` | HMI 10 inch |

### 9.12 Electrical / Control — Cabling, Junction Box, Field Items

| Item Code | Description |
|-----------|-------------|
| `ELECT-CBL-PWR-016-MM2` | Power cable 16 mm² |
| `ELECT-CBL-PWR-070-MM2` | Power cable 70 mm² |
| `ELECT-CBL-PWR-150-MM2` | Power cable 150 mm² |
| `ELECT-CBL-CTL-004-MM2` | Control cable 4 mm² |
| `ELECT-CBL-INS-002-MM2` | Instrumentation cable 2 mm² |
| `ELECT-CBL-SIG-001-MM2` | Signal cable 1 mm² |
| `ELECT-CBL-ETH-050-MM2` | Earthing conductor 50 mm² |
| `ELECT-JBX-FPR-300-MM` | Flameproof JB 300 mm |
| `ELECT-JBX-EXE-400-MM` | Increased safety JB 400 mm |
| `ELECT-JBX-GPP-200-MM` | General purpose JB 200 mm |
| `ELECT-FLD-NA-NA-NA` | Field item (type TBD) |

### 9.13 Bought-out Packages

| Item Code | Description |
|-----------|-------------|
| `BOPKG-GEN-NA-NA-NA` | General bought-out package |
| `BOPKG-CLT-NDT-100-TR` | Natural draft cooling tower 100 TR |
| `BOPKG-CLT-MDT-050-TR` | Mechanical draft cooling tower 50 TR |
| `BOPKG-CLT-IDT-200-TR` | Induced draft cooling tower 200 TR |
| `BOPKG-CLT-FDT-075-TR` | Forced draft cooling tower 75 TR |

---

## 10. Variant Architecture (unchanged from v3.0, updated with new GROUP codes)

### 10.1 Decision Tree

```
Given a new BUY catalog item:
│
├─ Differs ONLY in vendor, MOC, pressure class, flange standard,
│  voltage/phase/freq, certification, model number, spec revision?
│
│   YES → VARIANT of existing Master Item. Reuse the same Item Code.
│          Create or select a Variant record under it.
│
│   NO  → Does any CODE SEGMENT change?
│
│          YES → NEW Master Item Code required.
│
│          NO  → SUFFIX EXCEPTION (§2.4). Requires Superuser approval + audit.
```

### 10.2 Variant Architecture Examples (5-Character GROUP Codes)

#### Pumps

**Master Item:** `PUMPS-CEN-HOR-1000-LPH` — Centrifugal, horizontal, 1000 LPH

| Variant | Vendor | MOC | Pressure Class | Certification | New Master? | Suffix? |
|---------|--------|-----|----------------|---------------|-------------|---------|
| V01 | KSB | CS | ANSI 150 | — | No | No |
| V02 | Grundfos | SS316L | ANSI 150 | — | No | No |
| V03 | Flowserve | SS316L | ANSI 300 | ATEX Zone 1 | No | No |
| V04 | Kirloskar | CS | PN10 | CPCB | No | No |

New Master required when: Flow changes to 2000 LPH → `PUMPS-CEN-HOR-2000-LPH`.

#### Valves

**Master Item:** `VALVE-ISO-BAL-050-NB` — Isolation ball valve, 50 NB

| Variant | Vendor | MOC (body/trim) | End connection | Std | New Master? | Suffix? |
|---------|--------|-----------------|----------------|-----|-------------|---------|
| V01 | L&T | CS / SS trim | Flanged RF | ANSI 150 | No | No |
| V02 | Audco | SS316 full bore | Flanged RF | ANSI 150 | No | No |
| V03 | Crane | CS | BW ends | ANSI 300 | No | No |
| V04 | Neway | CS | SW ends | 800# | No | No |

New Master required when: Size changes to 80 NB → `VALVE-ISO-BAL-080-NB`.

#### Raw Materials

**Master Item:** `PLATE-CS-NA-010-MM` — CS plate 10 mm

| Variant | Mill / Supplier | Standard | Cert | New Master? | Suffix? |
|---------|----------------|---------|------|-------------|---------|
| V01 | SAIL | IS 2062 Gr E250 | MTC | No | No |
| V02 | TATA | ASTM A516 Gr 70 | NACE + MTC | No | No |
| V03 | POSCO | EN 10028-2 P265GH | PED 2014/68/EU | No | No |

**`PLATE-S31-NA-010-MM`** is a **different Master Item** (different material = different code).

#### Instruments

**Master Item:** `INSTR-PRS-TXR-010-BAR` — Pressure transmitter, 0–10 bar

| Variant | Vendor | Output | Process conn | Certification | New Master? | Suffix? |
|---------|--------|--------|--------------|---------------|-------------|---------|
| V01 | Endress+Hauser | 4–20 mA HART | ½" NPT | — | No | No |
| V02 | ABB | 4–20 mA HART | ½" NPT | ATEX Zone 1 | No | No |
| V03 | Yokogawa | 4–20 mA + FF | ½" BSP | SIL 2 | No | No |

New Master required when: Range changes to 0–25 bar → `INSTR-PRS-TXR-025-BAR`.

#### Electrical

**Master Item:** `ELECT-CMP-VFD-011-KW` — VFD, 11 kW

| Variant | Vendor / Model | Input voltage | IP | Certification | New Master? | Suffix? |
|---------|---------------|--------------|-----|---------------|-------------|---------|
| V01 | ABB ACS880 | 415V/3Ph/50Hz | IP21 | — | No | No |
| V02 | Siemens G120 | 415V/3Ph/50Hz | IP55 | — | No | No |
| V03 | Schneider ATV | 440V/3Ph/60Hz | IP21 | UL/cUL | No | No |
| V04 | ABB ACS880 | 415V/3Ph/50Hz | IP21 | ATEX Zone 2 | No | No |

New Master required when: Power changes to 15 kW → `ELECT-CMP-VFD-015-KW`.

#### Bought-out Packages

**Master Item:** `BOPKG-CLT-MDT-100-TR` — Mechanical draft cooling tower, 100 TR

| Variant | Vendor | Fill type | Basin MOC | Certification | New Master? | Suffix? |
|---------|--------|-----------|-----------|---------------|-------------|---------|
| V01 | Paharpur | Film fill | FRP | CPCB | No | No |
| V02 | SPX Cooling | Splash fill | RCC | — | No | No |
| V03 | Marley | Film fill | SS304 | CPCB + Energy Star | No | No |

---

## 11. Schema Changes Required

### 11.1 New Table: `item_code_registry`

```sql
CREATE TABLE item_code_registry (
  id              SERIAL PRIMARY KEY,
  registry_type   TEXT NOT NULL,
  scope_group     TEXT,
  scope_subgroup  TEXT,
  entity_key      TEXT NOT NULL,
  abbr            TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (registry_type, COALESCE(scope_group,''), COALESCE(scope_subgroup,''), entity_key)
);
```

### 11.2 Additive Columns on `master_items`

```sql
ALTER TABLE master_items
  ADD COLUMN ic_group           VARCHAR(5),    -- e.g. 'PUMPS'
  ADD COLUMN ic_subgroup        VARCHAR(3),    -- e.g. 'CEN'
  ADD COLUMN ic_type            VARCHAR(3),    -- e.g. 'HOR'
  ADD COLUMN ic_size            VARCHAR(5),    -- e.g. '1000'
  ADD COLUMN ic_unit            VARCHAR(4),    -- e.g. 'LPH'
  ADD COLUMN buy_group_id       INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id    INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source   TEXT,          -- 'auto', 'manual', 'migrated', 'sap_sync'
  ADD COLUMN sap_item_code      VARCHAR(50);   -- populated only if SAP requires a different code
                                               -- DROP this column once SAP B1 10+ length confirmed ≥ 25 chars
```

> **Note:** `sap_item_code` is provisionally included. Once the SAP B1 10+ instance confirms ItemCode ≥ 25 chars, this column is unnecessary and will not be seeded. It can be removed from the schema before P0 implementation if SAP confirmation is obtained first.

### 11.3 New Table: `item_variants`

```sql
CREATE TABLE item_variants (
  id                    SERIAL PRIMARY KEY,
  master_item_id        INTEGER NOT NULL REFERENCES master_items(id) ON DELETE RESTRICT,
  variant_seq           INTEGER NOT NULL,
  variant_display_code  VARCHAR(35),           -- e.g. 'PUMPS-CEN-HOR-1000-LPH / V01'
  vendor_id             INTEGER REFERENCES vendors(id),
  manufacturer          TEXT,
  model_number          TEXT,
  moc                   TEXT,
  pressure_class        TEXT,
  flange_standard       TEXT,
  voltage               INTEGER,
  phase                 INTEGER,
  frequency             INTEGER,
  certifications        TEXT[],
  efficiency_class      TEXT,
  insulation_class      TEXT,
  ip_rating             TEXT,
  spec_revision         TEXT,
  datasheet_gcs_path    TEXT,
  additional_attributes JSONB,
  is_preferred          BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  notes                 TEXT,
  created_by            INTEGER REFERENCES users(id),
  approved_by           INTEGER REFERENCES users(id),
  approved_at           TIMESTAMP,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (master_item_id, variant_seq)
);
```

### 11.4 Alter `buy_list_line_selections`

```sql
ALTER TABLE buy_list_line_selections
  ADD COLUMN item_variant_id INTEGER REFERENCES item_variants(id) ON DELETE SET NULL;
```

### 11.5 New Table: `item_code_suffix_exceptions`

```sql
CREATE TABLE item_code_suffix_exceptions (
  id             SERIAL PRIMARY KEY,
  master_item_id INTEGER NOT NULL REFERENCES master_items(id),
  base_code      VARCHAR(50) NOT NULL,
  suffix_code    VARCHAR(55) NOT NULL,
  suffix_number  SMALLINT NOT NULL,
  reason         TEXT NOT NULL,
  approved_by    INTEGER NOT NULL REFERENCES users(id),
  approved_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 11.6 Additive Column on `buy_package_lines`

```sql
ALTER TABLE buy_package_lines
  ADD COLUMN suggested_item_code VARCHAR(55);
```

---

## 12. Coding Architecture

### 12.1 `server/item-code-service.ts`

```
buildItemCodeSegments(groupCode, subgroupCode, technicalAttributes)
  → { group: 'PUMPS', subgroup: 'CEN', type: 'HOR', size: '1000', unit: 'LPH' }

buildRawString(segments)
  → 'PUMPS-CEN-HOR-1000-LPH'

generateAndReserveItemCode(db, groupCode, subgroupCode, technicalAttributes)
  → advisory lock (pg_advisory_xact_lock)
  → check existing master_items for same code
  → if exists: return existing code (same engineering family)
  → if not exists: insert and return new code
  → suffix exception: only via separate approved endpoint
```

### 12.2 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/item-code/preview` | Preview code from form data. No DB write. |
| `POST` | `/api/item-code/reserve` | Generate + write to `master_items`. Superuser / GM. |
| `GET` | `/api/item-code/registry` | Full registry. Superuser only. |
| `PUT` | `/api/item-code/registry/:id` | Update registry entry. Superuser only. |
| `GET` | `/api/item-code/validate/:code` | Format + uniqueness check. |
| `POST` | `/api/admin/item-code/backfill` | One-time migration trigger. |
| `GET` | `/api/admin/item-code/verify` | Parity + compliance report. |
| `POST` | `/api/item-code/approve-suffix` | Suffix exception. Superuser only. |
| `GET` | `/api/master-items/:id/variants` | List Variants. |
| `POST` | `/api/master-items/:id/variants` | Create Variant. Superuser / GM. |
| `PUT` | `/api/master-items/:id/variants/:vid` | Update Variant. |
| `PUT` | `/api/master-items/:id/variants/:vid/preferred` | Set preferred Variant. |

---

## 13. Migration & Backfill Strategy

| Phase | Action | Risk |
|-------|--------|------|
| P0 | Confirm SAP B1 ItemCode field length (blocks SAP sync design only) | Zero |
| P0 | Create `item_code_registry` + seed all codes from §§5–8 | Zero |
| P0 | Apply additive schema columns (§11) | Zero |
| P1 | Build `item-code-service.ts` pure builder + preview endpoint | Low |
| P2 | Reserve endpoint with advisory lock | Medium |
| P2 | Wire Phase 3 approval → auto-generate item code | Medium |
| P3 | Variant CRUD endpoints + Phase 3 selection modal Variant layer | Medium |
| P3 | UI: item code preview chip + Variant selector in buy-packages-page | Low |
| P4 | One-time backfill of existing `master_items` | Medium |
| P5 | SAP B1 sync (unblocked after P0 SAP length confirmation) | High |

---

## 14. Audit & Validation

- Every Master Item Code generation logged: `audit_logs` (`action='item_code_generated'`).
- Every Variant creation logged: `audit_logs` (`action='variant_created'`).
- Suffix exception logged: `item_code_suffix_exceptions` + `audit_logs` (`action='suffix_exception_approved'`).
- Format regex (no suffix): `^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}$`
- Format regex (with suffix): `^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}-\d{2}$`
- DB unique index on `master_items.item_code` (existing, retained).
- Locked records reject regeneration.

---

## 15. Open Questions — Resolve Before Implementation

| # | Question | Owner | Blocks |
|---|----------|-------|--------|
| 1 | **SAP B1 ItemCode max length in production instance.** Expected: 50 chars. If confirmed ≥ 25, `sap_item_code` column and CRC logic are eliminated entirely. | THERMOPAC IT / SAP admin | SAP sync (P5); `sap_item_code` column decision |
| 2 | **SAP UDF setup:** Configure `U_MOC`, `U_PressClass`, `U_Certs` on OITM, or rely only on OMRP + PO line text? | THERMOPAC Finance / SAP admin | SAP Variant sync |
| 3 | **Variant approval workflow:** Must new Variants be approved (GM/Superuser) before use in Phase 3, or is creation sufficient? | PM / Process owner | Variant CRUD |
| 4 | **`ELECT-CMP-PLC-NA-NA` and `BOPKG-GEN-NA-NA-NA`:** Is `NA-NA` acceptable for size+unit where no standard sizing exists? | Approval required | Code matrix |
| 5 | **Field Items (`ELECT-FLD-NA-NA-NA`):** Use as placeholder until attrs form is implemented, or exclude from code generation until the form is ready? | PM / Engineering | Phase 2 wiring |
| 6 | **Pump size field priority:** Flow rate (preferred) or motor power (kW) when flow rate is not specified in attrs? | Engineering lead | Size extraction rule |
| 7 | **SAP Item Group codes:** Confirm group codes configured in the production B1 instance match the labels in §3.5. | THERMOPAC Finance / SAP | SAP sync |

---

*End of Plan v4.0 — Submit for approval before implementation.*
