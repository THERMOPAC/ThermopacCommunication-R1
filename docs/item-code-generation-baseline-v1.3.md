# BUY Item Code Generation — Baseline v1.3

**Status: SUBMITTED FOR MANAGEMENT APPROVAL — FROZEN PENDING SIGN-OFF**
**Date: 2026-05-12**
**Supersedes:** Baseline v1.2 (2026-05-11)

No implementation may begin without written management approval of this document.
No deviation from this baseline is permitted without a versioned amendment.

---

## Table of Contents

1. [Executive Summary and Governing Principle](#1-executive-summary-and-governing-principle)
2. [Item Code Format — 7-Segment Architecture](#2-item-code-format--7-segment-architecture)
3. [SAP B1 on SQL Server — Field Limits](#3-sap-b1-on-sql-server--field-limits)
4. [ItemName Governance — 1:1 Alignment with ItemCode Identity](#4-itemname-governance--11-alignment-with-itemcode-identity)
5. [SEG4 / SEG5 Complete Registry — All Groups and Subgroups](#5-seg4--seg5-complete-registry--all-groups-and-subgroups)
6. [NA Convention](#6-na-convention)
7. [Group, Subgroup, Type, Unit Registries](#7-group-subgroup-type-unit-registries)
8. [Master Item, Variant, Suffix](#8-master-item-variant-suffix)
9. [Schema Changes Required](#9-schema-changes-required)
10. [Coding Architecture](#10-coding-architecture)
11. [Governance Rules](#11-governance-rules)
12. [Migration and Backfill Strategy](#12-migration-and-backfill-strategy)
13. [Audit and Validation](#13-audit-and-validation)
14. [Open Questions](#14-open-questions)
15. [Document Control](#15-document-control)

---

## 1. Executive Summary and Governing Principle

### 1.1 Business Problem

THERMOPAC BUY package items (pumps, valves, instruments, motors, electrical equipment, raw materials, bought-out packages) currently have no systematic item code. Each purchase request describes the item in free text, making it impossible to:

- Identify duplicate items across projects
- Track vendor history and pricing by engineering family
- Sync items to SAP B1 as reusable master data
- Compare costs across similar items or across projects

### 1.2 Approved Solution

A structured, human-readable 7-segment item code is generated automatically at Phase 3 approval of each BUY package line. The code encodes the engineering identity (group, subgroup, type, two engineering identity attributes, size, unit). Commercial and project-specific differences are captured as Variants under the same Master Item Code.

### 1.3 Governing Principle — Non-Negotiable

> **If two items require different SAP ItemNames or separate SAP inventory identities, they must have different SAP ItemCodes.**

This principle governs every decision about what belongs in the ItemCode versus what belongs in a Variant. It is the single test for all ItemCode identity boundary disputes.

Corollary: **The SAP ItemName must be derived 1:1 from the ItemCode identity attributes and nothing else.** If an attribute is not in the ItemCode, it must not be in the ItemName. If an attribute is in the ItemCode, it must appear in the ItemName.

### 1.4 Key Design Rules — Non-Negotiable

| Rule | Statement |
|------|-----------|
| **Governing Principle** | If two items require different SAP ItemNames or separate inventory identities → different SAP ItemCodes. |
| **1:1 ItemName alignment** | SAP `OITM.ItemName` (`short_item_name`) is auto-generated from the 7 ItemCode segments only. It reflects all and only the identity attributes encoded in the ItemCode. |
| **No silent truncation — ever** | Neither `item_code` nor `short_item_name` is ever truncated automatically. Any field exceeding its hard limit causes a backend error and halts the operation. |
| **7-segment maximum** | The item code has exactly 7 segments. No additional segments may be added without a versioned baseline amendment. SEG4 and SEG5 = `NA` when not applicable. |
| **Auto-generation at Phase 3** | Item codes are generated server-side at Phase 3 approval, not entered manually. |
| **Registry-driven** | All GROUP, SUBGROUP, TYPE, UNIT, SEG4, and SEG5 codes live in `item_code_registry`. No hardcoded strings outside that table. |
| **Variants, not new codes** | Project-specific specs (vendor, model, certification, bus rating, etc.) → Variants. Only a genuinely different engineering identity → new Master Item Code. |
| **SAP B1 is SQL Server** | SAP B1 is on SQL Server. `CUFD` is not used for standard field lengths. |
| **Confirmed SAP limits** | `OITM.ItemCode` = **50 chars**. `OITM.ItemName` = **100 chars**. `OITM.UserText` = unlimited (NTEXT). Hardcoded design baseline. |
| **Full description preserved** | The full auto-generated attrs form description (unlimited) is always stored in `master_items.description` and synced to `OITM.UserText`. It is never altered by the ItemName workflow. |

---

## 2. Item Code Format — 7-Segment Architecture

### 2.1 Segment Structure

```
GROUP(5) – SUBGROUP(≤3) – TYPE(≤3) – SEG4(≤4) – SEG5(≤4) – SIZE(3–5) – UNIT(≤4)
```

| # | Segment | Role | Length | `NA` allowed? |
|---|---------|------|--------|--------------|
| 1 | GROUP | Engineering category | Exactly 5 chars | No |
| 2 | SUBGROUP | Engineering function within GROUP | ≤ 3 chars | No |
| 3 | TYPE | Equipment type within SUBGROUP | ≤ 3 chars | Yes — when no type distinction applies |
| 4 | SEG4 | Engineering Identity Attribute 1 | ≤ 4 chars | Yes — defined per SUBGROUP |
| 5 | SEG5 | Engineering Identity Attribute 2 | ≤ 4 chars | Yes — defined per SUBGROUP |
| 6 | SIZE | Numeric size/capacity | 3–5 digits, zero-padded min 3 | Yes — when no standard size applies |
| 7 | UNIT | Unit of measurement | ≤ 4 chars | Yes — when SIZE = NA |

### 2.2 Code Length Profile

| Pattern | Example | Chars |
|---------|---------|-------|
| Minimum (short codes) | `VALVE-ISO-BAL-CS-C150-050-NB` | 28 |
| Typical | `PUMPS-CEN-HOR-SS3-MS-1000-LPH` | 30 |
| SEG4 and SEG5 at max (4 chars each) | `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH` | 32 |
| With approved `-01` suffix | `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH-01` | 35 |

**Maximum code length: 35 characters (with suffix). SAP B1 `ItemCode` limit: 50 characters. Confirmed minimum headroom: 15 characters.**

### 2.3 SIZE Zero-Padding Rule

| Raw value | Padded SIZE |
|-----------|------------|
| 10 | `010` |
| 50 | `050` |
| 100 | `100` |
| 1000 | `1000` |
| 10000 | `10000` |

### 2.4 SIZE Convention — Cable Conductors

Cable conductor cross-section values include decimals (1.5 mm², 2.5 mm²). Convention: SIZE = cross-section × 10 as an integer, zero-padded to minimum 3 digits.

| Conductor | SIZE | UNIT |
|-----------|------|------|
| 1.5 mm² | `015` | `MM2` |
| 2.5 mm² | `025` | `MM2` |
| 16 mm² | `160` | `MM2` |
| 50 mm² | `500` | `MM2` |

### 2.5 Approved Suffix Rule

A suffix (`-01`, `-02`, …) may only be appended when two genuinely distinct engineering families cannot be differentiated by the seven segments alone. Superuser approval is mandatory. Every approved suffix is recorded in `item_code_suffix_exceptions` with reason and approver. This is an exception path, not a routine workflow. Full governance in §11.

---

## 3. SAP B1 on SQL Server — Field Limits

### 3.1 Platform Statement

SAP Business One is deployed on **SQL Server** (not HANA). `CUFD` is a SAP B1 application table that stores only User Defined Field definitions — it must not be used for standard SAP field lengths.

### 3.2 Confirmed Design Limits — Hardcoded Baseline

| SAP field | Data type | Confirmed limit | Design mapping |
|-----------|-----------|----------------|---------------|
| `OITM.ItemCode` | NVARCHAR | **50 characters** | `master_items.item_code` — direct, no transformation. Our max: 35 chars. |
| `OITM.ItemName` | NVARCHAR | **100 characters** | `master_items.short_item_name VARCHAR(100)` — auto-generated from 7 segments. Always within 100 chars. |
| `OITM.UserText` | NTEXT | **Unlimited** | `master_items.description TEXT` — full attrs form description, always intact. |

Constants hardcoded in `server/item-code-service.ts`:

```typescript
const SAP_ITEM_CODE_MAX = 50;   // OITM.ItemCode NVARCHAR(50)
const SAP_ITEM_NAME_MAX = 100;  // OITM.ItemName NVARCHAR(100)
// OITM.UserText = NTEXT (unlimited) — no constant needed.
```

### 3.3 Pre-Go-Live Verification Gate — Mandatory Before First SAP Sync

Before Phase P5, the SAP admin must run the following against the production SAP B1 SQL Server database and confirm the results match §3.2.

```sql
SELECT
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH   -- -1 = NTEXT or NVARCHAR(MAX) (unlimited)
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME  = 'OITM'
  AND COLUMN_NAME IN ('ItemCode', 'ItemName', 'UserText')
ORDER BY COLUMN_NAME;
```

| Column | Expected DATA_TYPE | Expected CHARACTER_MAXIMUM_LENGTH | Action if different |
|--------|--------------------|----------------------------------|-------------------|
| `ItemCode` | NVARCHAR | **50** | Raise amendment before P5 |
| `ItemName` | NVARCHAR | **100** | Raise amendment before P5 |
| `UserText` | NTEXT | **-1 (unlimited)** | Raise amendment before P5 |

### 3.4 SAP B1 Field Mapping

| THERMOPAC field | SAP B1 field | Confirmed limit | Notes |
|----------------|-------------|----------------|-------|
| `master_items.item_code` | `OITM.ItemCode` | 50 chars | Direct. No transformation. |
| `master_items.short_item_name` | `OITM.ItemName` | 100 chars | Auto-generated from 7 segments. Never exceeds 100 chars. |
| `master_items.description` | `OITM.UserText` | Unlimited | Full attrs form description. Always intact. |
| `item_variants.moc` etc. | `OITM.U_*` (UDF) | Config-dependent | Variant attributes via SAP UDFs |
| Preferred Variant | `OMRP` (MPN table) | — | One row per active Variant |

### 3.5 SAP Item Group Mapping

| THERMOPAC GROUP | SAP Item Group (OITG) |
|----------------|----------------------|
| `PUMPS`, `MOTOR` | Rotating Equipment |
| `INSTR` | Instrumentation |
| `VALVE` | Piping & Valves |
| `ELECT` | Electrical & Control |
| `BOPKG` | Bought-out Packages |
| `PLATE`, `PIPES`, `FITNG`, `FLANG`, `FASTN`, `GASKT`, `STEEL` | Raw Materials |

---

## 4. ItemName Governance — 1:1 Alignment with ItemCode Identity

### 4.1 Strategy

`OITM.ItemName` (`short_item_name`) is **auto-generated from the 7 ItemCode segments**, expanded to engineering-readable English using the label registry. It reflects all and only the identity attributes encoded in the ItemCode — nothing more, nothing less.

The full engineering description from the attrs form goes to `OITM.UserText` intact and is always available. It is not used as the basis for `short_item_name`.

This design directly implements the governing principle: two items with the same ItemCode will always have the same ItemName, and two items with different ItemNames will always have different ItemCodes.

### 4.2 Auto-Generation — `buildShortItemName(segments)`

```
buildShortItemName(segments) → string
  Inputs: { group, subgroup, type, seg4, seg5, size, unit }
  Each code → expanded label from item_code_registry
  Result: "{TYPE label}, {SIZE} {UNIT}, {SEG4 label}, {SEG5 label}"
         with NA segments omitted from the output string
  Always ≤ 100 chars (by design — verified for all Group/Subgroup combinations)
  Hard error if result > SAP_ITEM_NAME_MAX — indicates registry label data error
```

### 4.3 Generated ItemName Examples

| Item Code | Auto-generated short_item_name | Chars |
|-----------|-------------------------------|-------|
| `VALVE-ISO-BAL-CS-C150-050-NB` | Ball Valve, 50 NB, CS Body, ANSI 150 | 37 |
| `VALVE-ISO-BAL-SS3-C300-050-NB` | Ball Valve, 50 NB, SS316 Body, ANSI 300 | 40 |
| `VALVE-CTL-GLB-CS-SS3-100-NB` | Globe Control Valve, 100 NB, CS Body, SS316 Trim | 49 |
| `VALVE-CTL-GLB-CS-ALS-100-NB` | Globe Control Valve, 100 NB, CS Body, Alloy Steel Trim | 55 |
| `VALVE-CTL-GLB-A20-A20-100-NB` | Globe Control Valve, 100 NB, Alloy 20 Body, Alloy 20 Trim | 58 |
| `PUMPS-CEN-HOR-SS3-MS-1000-LPH` | Centrifugal Pump, Horizontal, 1000 LPH, SS316 Wetted, Mech Seal | 64 |
| `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH` | Dosing Pump, Diaphragm, 50 LPH, PVDF Head, PTFE Diaphragm | 59 |
| `MOTOR-FLP-ACI-LV-4P-110-KW` | Flameproof Motor, AC Induction, 110 kW, 415V, 4-Pole | 53 |
| `MOTOR-FLP-ACI-MV6-6P-250-KW` | Flameproof Motor, AC Induction, 250 kW, 6.6 kV, 6-Pole | 56 |
| `INSTR-PRS-TXR-SS3-NPT-010-BAR` | Pressure Transmitter, 0–10 Bar, SS316L Wetted, 1/2" NPT | 57 |
| `INSTR-FLW-MAG-PTFE-FLG-100-NB` | Magnetic Flowmeter, 100 NB, PTFE Lined, Flanged | 48 |
| `INSTR-LVL-GWR-SS3-FLG-4000-MM` | Guided Wave Radar Level, 4000 mm, SS316L Probe, Flanged | 56 |
| `ELECT-PNL-MCC-LV-MS-415-V` | MCC Panel, LV 415V, Mild Steel Enclosure | 41 |
| `ELECT-PNL-MCC-LV-GRP-415-V` | MCC Panel, LV 415V, GRP Enclosure | 34 |
| `ELECT-JBX-FPR-ALC-SM-300-MM` | Flameproof JB, 300mm, Die-cast Aluminium, Stand Mounted | 56 |
| `ELECT-CBL-PWR-XLPE-SWA-160-MM2` | Power Cable, 16 mm², XLPE Insulated, SWA Armoured | 51 |
| `FLANG-CS-NA-C150-WN-100-NB` | CS Flange, 100 NB, ANSI 150, Weld Neck | 39 |
| `PIPES-CS-NA-S40-NA-050-NB` | CS Pipe, 50 NB, Schedule 40 | 28 |
| `FLANG-DSS-NA-C300-BLN-100-NB` | Duplex SS Flange, 100 NB, ANSI 300, Blind | 43 |

**Maximum observed across all Group/Subgroup combinations: 64 characters. Confirmed within the 100-character SAP limit.**

### 4.4 User Override

A Superuser may override `short_item_name` after generation if the auto-generated label is not clear enough for a specific case. Override is:
- Subject to a 100-character hard limit (backend-enforced)
- Audit-logged with before/after values and approver
- Still required to reflect only ItemCode identity attributes

### 4.5 Full Description — Separate and Intact

The full attrs form description (e.g., `Globe Control Valve, DN 200 (8"), ANSI Class 900, Equal Percentage, SS316 Trim, Pneumatic Diaphragm Actuator, Fail Close (FC), Alloy 20 Body, Flanged RF ANSI B16.5` — 162 chars) is stored in:
- `master_items.description` (TEXT, unlimited)
- `OITM.UserText` (NTEXT, unlimited)
- Variant attributes
- PO line details

It is never modified by the ItemName generation workflow.

### 4.6 Backend Validation

```typescript
function validateItemCode(itemCode: string): void {
  if (itemCode.length > SAP_ITEM_CODE_MAX)
    throw new Error(`ItemCode "${itemCode}" is ${itemCode.length} chars — exceeds ${SAP_ITEM_CODE_MAX}. Sync aborted.`);
}

function validateItemName(shortItemName: string): void {
  if (shortItemName.length > SAP_ITEM_NAME_MAX)
    throw new Error(`ItemName "${shortItemName}" is ${shortItemName.length} chars — exceeds ${SAP_ITEM_NAME_MAX}. Save rejected.`);
}
```

`validateItemCode` — every SAP sync preflight.
`validateItemName` — every save (insert and update) AND every SAP sync preflight.
Both halt the operation. Partial sync is never permitted.

---

## 5. SEG4 / SEG5 Complete Registry — All Groups and Subgroups

Each section below defines:
- SEG4 and SEG5 attributes and their approved codes
- **ItemCode identity attributes** — what is in the code
- **Variant-only attributes** — what is never in the code
- Complete ItemCode examples with auto-generated ItemNames

---

### 5.1 GROUP: VALVE

---

#### VALVE-ISO — Isolation Valves (Ball, Gate, Globe ISO, Butterfly, Plug)

**Governing principle applied:** A CS 100 NB ANSI 150 ball valve and a CS 100 NB ANSI 300 ball valve have different face-to-face dimensions, different wall thickness, different bolting — they cannot substitute for each other. Pressure class is ItemCode identity. End connection (almost always flanged in process plants; threaded for small bore) is project-specified at PO level → Variant.

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Body Material (MOC) | `CS` | Carbon Steel |
| | | `SS3` | SS316 / SS316L |
| | | `SS4` | SS304 / SS304L |
| | | `DSS` | Duplex SS 2205 |
| | | `A20` | Alloy 20 |
| | | `GCI` | Grey Cast Iron |
| | | `DCI` | Ductile Cast Iron |
| | | `HAC` | Hastelloy C-276 |
| **SEG5** | Pressure Class | `C150` | ANSI Class 150 |
| | | `C300` | ANSI Class 300 |
| | | `C600` | ANSI Class 600 |
| | | `C900` | ANSI Class 900 |
| | | `PN16` | PN 16 (DIN) |
| | | `PN40` | PN 40 (DIN) |

**ItemCode identity attributes:** Body material, pressure class, nominal bore, valve type (ball/gate/globe/butterfly).

**Variant-only attributes:** End connection (FLG/THD/SW/BW/WAF), trim material, seat material, disc material, bore type (full/reduced), ANSI face type (RF/FF), specific standard (API 6D / BS 5351), vendor, model number, datasheet.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `VALVE-ISO-BAL-CS-C150-050-NB` | Ball Valve, 50 NB, CS Body, ANSI 150 | 37 |
| `VALVE-ISO-BAL-SS3-C150-050-NB` | Ball Valve, 50 NB, SS316 Body, ANSI 150 | 40 |
| `VALVE-ISO-BAL-CS-C300-050-NB` | Ball Valve, 50 NB, CS Body, ANSI 300 | 37 |
| `VALVE-ISO-BAL-CS-C600-050-NB` | Ball Valve, 50 NB, CS Body, ANSI 600 | 37 |
| `VALVE-ISO-GTD-CS-C150-100-NB` | Gate Valve, 100 NB, CS Body, ANSI 150 | 38 |
| `VALVE-ISO-GLB-SS3-C150-050-NB` | Globe Valve, 50 NB, SS316 Body, ANSI 150 | 41 |
| `VALVE-ISO-BTF-CS-C150-200-NB` | Butterfly Valve, 200 NB, CS Body, ANSI 150 | 43 |
| `VALVE-ISO-PLG-CS-C150-080-NB` | Plug Valve, 80 NB, CS Body, ANSI 150 | 37 |

---

#### VALVE-CTL — Control Valves (Globe, Rotary, Butterfly CTL, Ball CTL)

**Governing principle applied:** User confirmed — trim material differences create different SAP inventory items with different ItemNames. Pressure class for control valves is project-specified (engineered-to-order) → Variant. End connection is almost always flanged RF in process plants → Variant.

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Body Material | `CS` | CS Body |
| | | `SS3` | SS316 Body |
| | | `SS4` | SS304 Body |
| | | `DSS` | Duplex SS Body |
| | | `A20` | Alloy 20 Body |
| | | `GCI` | Grey Cast Iron Body |
| | | `HAC` | Hastelloy C-276 Body |
| **SEG5** | Trim Material | `SS3` | SS316 Trim |
| | | `A20` | Alloy 20 Trim |
| | | `ALS` | Alloy Steel Trim |
| | | `STL` | Stellite Trim |
| | | `HAC` | Hastelloy C-276 Trim |
| | | `NA` | Trim not separately specified |

**ItemCode identity attributes:** Body material, trim material, nominal bore, valve type.

**Variant-only attributes:** Pressure class, end connection (flanged RF assumed — exceptions noted at PO level), actuator type (pneumatic diaphragm/piston/electric), fail action (FC/FO/FL), flow characteristic (equal%/linear), Cv, positioner type, zone/approval, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `VALVE-CTL-GLB-CS-SS3-050-NB` | Globe Control Valve, 50 NB, CS Body, SS316 Trim | 48 |
| `VALVE-CTL-GLB-CS-ALS-050-NB` | Globe Control Valve, 50 NB, CS Body, Alloy Steel Trim | 54 |
| `VALVE-CTL-GLB-CS-STL-100-NB` | Globe Control Valve, 100 NB, CS Body, Stellite Trim | 52 |
| `VALVE-CTL-GLB-A20-A20-100-NB` | Globe Control Valve, 100 NB, Alloy 20 Body, Alloy 20 Trim | 58 |
| `VALVE-CTL-ROT-CS-SS3-150-NB` | Rotary Control Valve, 150 NB, CS Body, SS316 Trim | 50 |
| `VALVE-CTL-BTF-CS-SS3-200-NB` | Butterfly Control Valve, 200 NB, CS Body, SS316 Trim | 53 |

---

#### VALVE-SAF — Safety / Pressure Relief Valves

**Governing principle applied:** Inlet connection (flanged vs screwed) genuinely distinguishes the item at procurement level — different installation, different piping class. Set pressure, orifice designation, and certification are project-specific → Variant.

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Body Material | `CS`, `SS3`, `SS4`, `DSS`, `A20` | Same MOC registry |
| **SEG5** | Inlet Connection | `FLG` | Flanged Inlet |
| | | `THD` | Threaded / Screwed Inlet |

SIZE = inlet bore (inches, per API 526 convention). UNIT = `IN`.

**ItemCode identity attributes:** Body material, inlet connection, inlet bore.

**Variant-only attributes:** Set pressure, orifice designation (API D/E/F/G/H/J/K/L/M), outlet size, lift type, trim material, certification (IBR/ASME/CE/PED), vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `VALVE-SAF-SPL-CS-FLG-002-IN` | Safety Valve, 2 in Inlet, CS Body, Flanged | 43 |
| `VALVE-SAF-SPL-SS3-FLG-001-IN` | Safety Valve, 1 in Inlet, SS316 Body, Flanged | 46 |
| `VALVE-SAF-SPL-CS-THD-001-IN` | Safety Valve, 1 in Inlet, CS Body, Threaded | 44 |

---

#### VALVE-CHK — Check / Non-Return Valves

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Body Material | `CS`, `SS3`, `SS4`, `DSS`, `A20`, `GCI` | Same MOC registry |
| **SEG5** | Pressure Class | `C150`, `C300`, `C600`, `C900` | Same pressure class registry |

**Variant-only attributes:** End connection (FLG/WAF determined by TYPE: SWG=flanged, DUL=wafer, etc.), seat material, disc material, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `VALVE-CHK-SWG-CS-C150-100-NB` | Swing Check Valve, 100 NB, CS Body, ANSI 150 | 45 |
| `VALVE-CHK-DUL-CS-C150-150-NB` | Dual Plate Check Valve, 150 NB, CS Body, ANSI 150 | 50 |
| `VALVE-CHK-SWG-SS3-C150-080-NB` | Swing Check Valve, 80 NB, SS316 Body, ANSI 150 | 47 |

---

#### VALVE-NDL — Needle Valves

Needle valves are small bore instrument valves. End connection type is the key engineering identity after material — not pressure class (needle valves have their own body pressure ratings independent of ANSI classes).

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Body Material | `SS3`, `CS`, `HAC` | Same MOC registry |
| **SEG5** | End Connection | `NPT` | NPT Threaded |
| | | `SW` | Socket Weld |
| | | `FLG` | Flanged |

**Variant-only attributes:** Body pressure rating, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `VALVE-NDL-NA-SS3-NPT-006-NB` | Needle Valve, 6 NB, SS316 Body, NPT | 36 |
| `VALVE-NDL-NA-CS-SW-006-NB` | Needle Valve, 6 NB, CS Body, Socket Weld | 41 |

---

### 5.2 GROUP: PUMPS

---

#### PUMPS-CEN — Centrifugal Pumps (Horizontal, Vertical, Multistage, Submersible)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Wetted Parts MOC | `CS` | CS Wetted |
| | | `SS3` | SS316 Wetted |
| | | `SS4` | SS304 Wetted |
| | | `DSS` | Duplex SS Wetted |
| | | `A20` | Alloy 20 Wetted |
| | | `CI` | Cast Iron Wetted |
| | | `HAC` | Hastelloy C-276 Wetted |
| **SEG5** | Seal Type | `MS` | Mechanical Seal |
| | | `GP` | Gland Packing |
| | | `MAG` | Magnetic Drive |

**ItemCode identity attributes:** Wetted material, seal type, flow rate, pump type (horizontal/vertical/multistage).

**Variant-only attributes:** TDH (total dynamic head), motor kW, impeller diameter, NPSH, efficiency, impeller design (open/semi-open/closed), coupling type, bearing arrangement, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `PUMPS-CEN-HOR-SS3-MS-1000-LPH` | Centrifugal Pump, Horizontal, 1000 LPH, SS316 Wetted, Mech Seal | 64 |
| `PUMPS-CEN-HOR-CS-MS-5000-LPH` | Centrifugal Pump, Horizontal, 5000 LPH, CS Wetted, Mech Seal | 61 |
| `PUMPS-CEN-HOR-SS3-GP-1000-LPH` | Centrifugal Pump, Horizontal, 1000 LPH, SS316 Wetted, Gland Packing | 68 |
| `PUMPS-CEN-VTL-SS3-MS-0500-M3H` | Centrifugal Pump, Vertical, 500 m³/hr, SS316 Wetted, Mech Seal | 63 |
| `PUMPS-CEN-MST-SS3-MS-0100-M3H` | Centrifugal Pump, Multistage, 100 m³/hr, SS316 Wetted, Mech Seal | 65 |

---

#### PUMPS-DOS — Dosing / Metering Pumps

Both head material and diaphragm material determine chemical compatibility — they are both engineering identity attributes.

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Head / Wetted MOC | `SS3` | SS316 Head |
| | | `PVDF` | PVDF Head |
| | | `PP` | Polypropylene Head |
| | | `HAC` | Hastelloy C-276 Head |
| **SEG5** | Diaphragm MOC | `PTFE` | PTFE Diaphragm |
| | | `PVDF` | PVDF Diaphragm |
| | | `EPD` | EPDM Diaphragm |
| | | `HYP` | Hypalon Diaphragm |
| | | `NA` | Not applicable (plunger/peristaltic types) |

**Variant-only attributes:** Stroke length, stroke rate, max pressure, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `PUMPS-DOS-DPH-SS3-PTFE-100-LPH` | Dosing Pump, Diaphragm, 100 LPH, SS316 Head, PTFE Diaphragm | 60 |
| `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH` | Dosing Pump, Diaphragm, 50 LPH, PVDF Head, PTFE Diaphragm | 59 |
| `PUMPS-DOS-PLN-SS3-NA-050-LPH` | Dosing Pump, Plunger, 50 LPH, SS316 Head | 41 |

---

#### PUMPS-GEA / PUMPS-SCR / PUMPS-HND — Gear, Screw, Hand Pumps

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Wetted MOC | `CS`, `SS3`, `CI`, `A20` | Same MOC registry |
| **SEG5** | — | `NA` | Not applicable |

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `PUMPS-GEA-NA-CS-NA-005-M3H` | Gear Pump, 5 m³/hr, CS Wetted | 30 |
| `PUMPS-SCR-NA-SS3-NA-010-M3H` | Screw Pump, 10 m³/hr, SS316 Wetted | 35 |
| `PUMPS-HND-NA-CS-NA-010-LPM` | Hand Pump, 10 LPM, CS Wetted | 29 |

---

### 5.3 GROUP: MOTOR

---

#### MOTOR-FLP / MOTOR-NFP — Flameproof / Non-Flameproof Motors

A 415V motor and a 6.6 kV motor at the same kW are completely different equipment (different insulation, different cable, different starter). A 4-pole and a 6-pole motor at the same kW run at different base speeds (~1450 vs ~960 RPM) — different shaft speed, different coupling, different driven equipment requirement.

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Voltage Class | `LV` | 415V (Low Voltage) |
| | | `MV6` | 6.6 kV |
| | | `MV11` | 11 kV |
| **SEG5** | Pole Count | `2P` | 2-Pole (~2900 RPM) |
| | | `4P` | 4-Pole (~1450 RPM) |
| | | `6P` | 6-Pole (~960 RPM) |
| | | `8P` | 8-Pole (~720 RPM) |

**ItemCode identity attributes:** Voltage class, pole count, rated power, motor type.

**Variant-only attributes:** Frame size (IEC/NEMA), enclosure type (TEFC/TEAAC/CACA), efficiency class (IE2/IE3/IE4), insulation class (F/H), IP rating, mounting (B3/B5/B3B5), ambient temperature, zone/approval (ATEX/IECEx), vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `MOTOR-FLP-ACI-LV-4P-110-KW` | Flameproof Motor, AC Induction, 110 kW, 415V, 4-Pole | 53 |
| `MOTOR-FLP-ACI-LV-6P-110-KW` | Flameproof Motor, AC Induction, 110 kW, 415V, 6-Pole | 53 |
| `MOTOR-FLP-ACI-MV6-6P-250-KW` | Flameproof Motor, AC Induction, 250 kW, 6.6 kV, 6-Pole | 56 |
| `MOTOR-NFP-ACI-LV-4P-015-KW` | Non-Flameproof Motor, AC Induction, 15 kW, 415V, 4-Pole | 57 |
| `MOTOR-NFP-ACI-LV-2P-007-KW` | Non-Flameproof Motor, AC Induction, 7.5 kW, 415V, 2-Pole | 58 |

---

### 5.4 GROUP: INSTR

---

#### INSTR-PRS — Pressure Instruments (Transmitter, Gauge, Switch)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Wetted MOC | `SS3` | SS316L Wetted |
| | | `HAC` | Hastelloy C-276 Wetted |
| | | `TIT` | Titanium Wetted |
| | | `DSS` | Duplex SS Wetted |
| | | `NA` | Non-wetted |
| **SEG5** | Process Connection | `NPT` | 1/2" NPT |
| | | `FLG` | Flanged |
| | | `SW` | Socket Weld |
| | | `NA` | Not applicable |

**Variant-only attributes:** Output signal (4–20mA / HART / Profibus / FF), power supply, zone/approval (Zone 1/2/Safe Area), IP rating, display type, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `INSTR-PRS-TXR-SS3-NPT-010-BAR` | Pressure Transmitter, 0–10 Bar, SS316L Wetted, 1/2" NPT | 57 |
| `INSTR-PRS-TXR-HAC-FLG-010-BAR` | Pressure Transmitter, 0–10 Bar, Hastelloy C-276 Wetted, Flanged | 65 |
| `INSTR-PRS-GAU-SS3-NPT-016-BAR` | Pressure Gauge, 0–16 Bar, SS316L Wetted, 1/2" NPT | 51 |
| `INSTR-PRS-SWT-SS3-NPT-016-BAR` | Pressure Switch, 0–16 Bar, SS316L Wetted, 1/2" NPT | 52 |

---

#### INSTR-TMP — Temperature Instruments (Thermocouple, RTD, Transmitter)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Thermowell / Wetted MOC | `SS3` | SS316 Thermowell |
| | | `DSS` | Duplex SS Thermowell |
| | | `HAC` | Hastelloy C-276 Thermowell |
| | | `NA` | No thermowell |
| **SEG5** | Process Connection | `NPT` | NPT Threaded |
| | | `FLG` | Flanged |
| | | `NA` | Not applicable |

**Variant-only attributes:** Element type (TC: J/K/R/S, RTD: Pt100/Pt1000), output signal, head type, insertion length, zone/approval, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `INSTR-TMP-TCC-SS3-NPT-400-DGC` | Thermocouple, 0–400°C, SS316 Thermowell, NPT | 45 |
| `INSTR-TMP-RTD-SS3-FLG-200-DGC` | RTD, 0–200°C, SS316 Thermowell, Flanged | 40 |
| `INSTR-TMP-TCC-HAC-FLG-400-DGC` | Thermocouple, 0–400°C, Hastelloy C-276 Thermowell, Flanged | 59 |

---

#### INSTR-FLW — Flow Instruments (Magnetic, Vortex, Coriolis, Orifice, Ultrasonic)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Wetted / Liner MOC | `SS3` | SS316L Wetted |
| | | `PTFE` | PTFE Lined |
| | | `HAC` | Hastelloy C-276 Wetted |
| | | `TIT` | Titanium Wetted |
| | | `NA` | Non-wetted (clamp-on) |
| **SEG5** | Process Connection | `FLG` | Flanged |
| | | `WAF` | Wafer |
| | | `NA` | Clamp-on / not applicable |

**Variant-only attributes:** Electrode material (mag meters), output signal, zone/approval, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `INSTR-FLW-MAG-PTFE-FLG-100-NB` | Magnetic Flowmeter, 100 NB, PTFE Lined, Flanged | 48 |
| `INSTR-FLW-MAG-SS3-FLG-100-NB` | Magnetic Flowmeter, 100 NB, SS316L Wetted, Flanged | 51 |
| `INSTR-FLW-COR-SS3-FLG-050-NB` | Coriolis Flowmeter, 50 NB, SS316L Wetted, Flanged | 50 |
| `INSTR-FLW-VTX-SS3-WAF-080-NB` | Vortex Flowmeter, 80 NB, SS316L Wetted, Wafer | 47 |
| `INSTR-FLW-USC-NA-NA-100-NB` | Ultrasonic Flowmeter, 100 NB, Clamp-on | 39 |

---

#### INSTR-LVL — Level Instruments (GWR, Radar, DP, Float)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Probe / Wetted MOC | `SS3` | SS316L Probe |
| | | `HAC` | Hastelloy C-276 Probe |
| | | `DSS` | Duplex SS Probe |
| | | `NA` | Non-contact |
| **SEG5** | Process Connection | `FLG` | Flanged |
| | | `NPT` | NPT Threaded |
| | | `NA` | Not applicable |

**Variant-only attributes:** Output signal, antenna type, zone/approval, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `INSTR-LVL-GWR-SS3-FLG-4000-MM` | Guided Wave Radar Level, 4000 mm, SS316L Probe, Flanged | 56 |
| `INSTR-LVL-RDR-NA-FLG-4000-MM` | Non-contact Radar Level, 4000 mm, Flanged | 42 |
| `INSTR-LVL-GWR-HAC-FLG-3000-MM` | Guided Wave Radar Level, 3000 mm, Hastelloy C-276 Probe, Flanged | 65 |

---

### 5.5 GROUP: ELECT

---

#### ELECT-PNL — Panels (MCC, PCC, LCS, DCS Cabinet, Distribution Board)

**Governing principle applied — bus rating, Isc, IP rating assessment:**

- **Bus rating** — engineering design output that varies per project even for the same panel type. Two projects can both procure the same `ELECT-PNL-MCC-LV-MS-415-V` with different bus ratings. Bus rating is a specification written on the PO → **Variant-only**.
- **Short circuit rating (Isc)** — same logic as bus rating. Engineered-to-project → **Variant-only**.
- **IP rating** — in practice, IP rating is strongly determined by enclosure material (MS panels can be IP54 or IP65; GRP panels are always IP65+; SS316 panels are always IP65+). The enclosure material (SEG5) is therefore the primary identity attribute. IP rating is project-specified on PO → **Variant-only**.

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Voltage Class | `LV` | LV 415V |
| | | `MV6` | MV 6.6 kV |
| | | `MV11` | MV 11 kV |
| | | `24V` | 24 VDC |
| **SEG5** | Enclosure MOC | `MS` | Mild Steel Enclosure |
| | | `SS3` | SS316 Enclosure |
| | | `GRP` | GRP / FRP Enclosure |
| | | `NA` | Not applicable |

SIZE = supply voltage (numeric). UNIT = `V`.

**ItemCode identity attributes:** Voltage class, enclosure material, supply voltage, panel type (MCC/PCC/LCS/DBD).

**Variant-only attributes:** Bus rating (A), short circuit rating (kA), IP rating, number of feeders, control voltage, zone/approval (Zone 2 acceptable for most panels; Zone 1 drives custom design), vendor, system integrator.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `ELECT-PNL-MCC-LV-MS-415-V` | MCC Panel, LV 415V, Mild Steel Enclosure | 41 |
| `ELECT-PNL-MCC-LV-GRP-415-V` | MCC Panel, LV 415V, GRP Enclosure | 34 |
| `ELECT-PNL-LCS-LV-MS-415-V` | Local Control Station, LV 415V, Mild Steel Enclosure | 53 |
| `ELECT-PNL-SWB-MV6-MS-6600-V` | MV Switchboard, 6.6 kV, Mild Steel Enclosure | 46 |
| `ELECT-PNL-DBD-24V-MS-024-V` | Distribution Board, 24VDC, Mild Steel Enclosure | 49 |

---

#### ELECT-JBX — Junction Boxes (Flameproof, Weatherproof, General Purpose)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Enclosure MOC | `ALC` | Die-cast Aluminium |
| | | `GRP` | GRP / FRP |
| | | `SS3` | SS316 |
| | | `MS` | Mild Steel |
| **SEG5** | Mounting | `WM` | Wall Mounted |
| | | `SM` | Stand Mounted |
| | | `NA` | Not specified |

SIZE = largest enclosure dimension (mm). UNIT = `MM`.

**Variant-only attributes:** Terminal count, entry count and size, IP rating, zone/approval (Zone 1/Zone 2/GP), vendor.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `ELECT-JBX-FPR-ALC-SM-300-MM` | Flameproof JB, 300mm, Die-cast Aluminium, Stand Mounted | 56 |
| `ELECT-JBX-FPR-ALC-WM-300-MM` | Flameproof JB, 300mm, Die-cast Aluminium, Wall Mounted | 55 |
| `ELECT-JBX-FPR-GRP-WM-400-MM` | Flameproof JB, 400mm, GRP Enclosure, Wall Mounted | 50 |
| `ELECT-JBX-GPR-GRP-WM-400-MM` | General Purpose JB, 400mm, GRP Enclosure, Wall Mounted | 55 |

---

#### ELECT-CBL — Cables (Power, Control, Instrumentation, Tracing)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Insulation | `XLPE` | XLPE Insulated |
| | | `PVC` | PVC Insulated |
| | | `EPR` | EPR Insulated |
| | | `MICC` | Mineral Insulated |
| **SEG5** | Armour | `SWA` | SWA Armoured |
| | | `UNA` | Unarmoured |
| | | `NA` | Not applicable |

SIZE = conductor cross-section × 10, zero-padded to 3 digits. UNIT = `MM2`.

**Variant-only attributes:** Number of cores, voltage rating (450/750V vs 600/1000V), conductor material (copper assumed), screening configuration (individual/overall/both), specific standard (IEC 60502/BS 5467), vendor.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `ELECT-CBL-PWR-XLPE-SWA-160-MM2` | Power Cable, 16 mm², XLPE Insulated, SWA Armoured | 51 |
| `ELECT-CBL-CTL-XLPE-SWA-015-MM2` | Control Cable, 1.5 mm², XLPE Insulated, SWA Armoured | 54 |
| `ELECT-CBL-INS-XLPE-SWA-015-MM2` | Instrumentation Cable, 1.5 mm², XLPE Insulated, SWA Armoured | 62 |
| `ELECT-CBL-PWR-PVC-UNA-025-MM2` | Power Cable, 2.5 mm², PVC Insulated, Unarmoured | 49 |

---

#### ELECT-CMP — Electrical Components (VFD, MCB, MCCB, Contactor, PLC, Transformer)

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Voltage Class | `LV` | LV 415V |
| | | `MV6` | MV 6.6 kV |
| | | `24V` | 24 VDC |
| | | `NA` | Not applicable (PLC, relay, etc.) |
| **SEG5** | — | `NA` | Not applicable |

**Variant-only attributes:** Poles, breaking capacity, curve type (MCB), output type/control mode (VFD), efficiency/topology (transformer), specific standard, vendor, model.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `ELECT-CMP-VFD-LV-NA-011-KW` | VFD Drive, 11 kW, LV 415V | 26 |
| `ELECT-CMP-MCB-LV-NA-016-AMP` | MCB, 16A, LV 415V | 18 |
| `ELECT-CMP-MBK-LV-NA-100-AMP` | MCCB, 100A, LV 415V | 21 |
| `ELECT-CMP-PLC-NA-NA-NA-NA` | PLC / DCS Module | 17 |

---

### 5.6 GROUP: BOPKG

---

#### BOPKG-CLT — Cooling Towers

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Shell MOC | `FRP` | FRP Shell |
| | | `RCC` | Concrete Shell |
| | | `NA` | Not specified |
| **SEG5** | — | `NA` | Not applicable |

**Variant-only attributes:** Approach temperature, range temperature, fan motor kW, fan type, fill type, basin material, certification, vendor.

| Item Code | Auto-generated ItemName |
|-----------|------------------------|
| `BOPKG-CLT-MDT-FRP-NA-100-TR` | Cooling Tower, Mechanical Draft, 100 TR, FRP Shell |

---

#### BOPKG-GEN — General Bought-out Packages

Too diverse for SEG4/SEG5 at item code level. All technical details in description, Variant attributes, and PO line.

| | Code |
|-|------|
| **SEG4** | `NA` |
| **SEG5** | `NA` |
| **SIZE** | `NA` |
| **UNIT** | `NA` |

| Item Code | Auto-generated ItemName |
|-----------|------------------------|
| `BOPKG-GEN-NA-NA-NA-NA-NA` | General Bought-out Package |

---

### 5.7 GROUP: Raw Materials — PLATE, PIPES, FLANG, FITNG, FASTN, GASKT, STEEL

For raw materials, the material is already encoded in SUBGROUP (e.g., `CS`, `S31`, `DSS`). SEG4 and SEG5 capture the remaining engineering identity attributes.

---

#### PLATE

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Production Condition | `HR` | Hot Rolled |
| | | `CR` | Cold Rolled |
| | | `NA` | Not specified |
| **SEG5** | — | `NA` | Not applicable |

SIZE = thickness (mm). UNIT = `MM`.

**Variant-only attributes:** Plate dimensions (L × W), heat number, mill certificate standard (ASTM/IS), specific grade designation.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `PLATE-CS-NA-HR-NA-010-MM` | CS Plate, 10 mm, Hot Rolled | 28 |
| `PLATE-SS3-NA-HR-NA-006-MM` | SS316 Plate, 6 mm, Hot Rolled | 30 |
| `PLATE-HAC-NA-HR-NA-012-MM` | Hastelloy C-276 Plate, 12 mm, Hot Rolled | 41 |

---

#### PIPES

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Schedule / Wall | `STD` | Standard Weight |
| | | `S40` | Schedule 40 |
| | | `S80` | Schedule 80 |
| | | `S160` | Schedule 160 |
| | | `XH` | Extra Heavy |
| | | `NA` | Not applicable |
| **SEG5** | — | `NA` | Not applicable |

SIZE = nominal bore. UNIT = `NB`.

**Variant-only attributes:** Pipe length, end preparation (plain/bevel/threaded), specific standard (ASTM A106/A312/A790), heat/lot number.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `PIPES-CS-NA-S40-NA-050-NB` | CS Pipe, 50 NB, Schedule 40 | 28 |
| `PIPES-CS-NA-STD-NA-100-NB` | CS Pipe, 100 NB, Standard Weight | 33 |
| `PIPES-S31-NA-S40-NA-050-NB` | SS316L Pipe, 50 NB, Schedule 40 | 32 |
| `PIPES-DSS-NA-S40-NA-080-NB` | Duplex SS Pipe, 80 NB, Schedule 40 | 35 |

---

#### FLANG

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Pressure Class | `C150` | ANSI Class 150 |
| | | `C300` | ANSI Class 300 |
| | | `C600` | ANSI Class 600 |
| | | `C900` | ANSI Class 900 |
| | | `PN16` | PN 16 |
| | | `PN40` | PN 40 |
| **SEG5** | Flange Type | `WN` | Weld Neck |
| | | `SOP` | Slip-on |
| | | `BLN` | Blind |
| | | `SKT` | Socket Weld |
| | | `THD` | Threaded |
| | | `LJ` | Lap Joint |

SIZE = nominal bore. UNIT = `NB`.

**Variant-only attributes:** Facing type (RF/FF/RTJ), specific standard (ASME B16.5 / ASME B16.47), heat number, mill certificate.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `FLANG-CS-NA-C150-WN-100-NB` | CS Flange, 100 NB, ANSI 150, Weld Neck | 39 |
| `FLANG-CS-NA-C300-WN-100-NB` | CS Flange, 100 NB, ANSI 300, Weld Neck | 39 |
| `FLANG-SS3-NA-C150-SOP-050-NB` | SS316 Flange, 50 NB, ANSI 150, Slip-on | 39 |
| `FLANG-CS-NA-C150-BLN-100-NB` | CS Flange, 100 NB, ANSI 150, Blind | 35 |
| `FLANG-DSS-NA-C300-WN-100-NB` | Duplex SS Flange, 100 NB, ANSI 300, Weld Neck | 47 |

---

#### FITNG — Pipe Fittings

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Schedule / Class | `S40`, `S80`, `S160`, `STD`, `C150`, `C300` | Same schedule/pressure class registries |
| **SEG5** | — | `NA` | Not applicable |

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `FITNG-CS-ELB-S40-NA-050-NB` | CS Elbow, 50 NB, Schedule 40 | 29 |
| `FITNG-SS3-TEE-S40-NA-100-NB` | SS316 Equal Tee, 100 NB, Schedule 40 | 37 |
| `FITNG-CS-RED-STD-NA-100-NB` | CS Reducer, 100 NB, Standard Weight | 36 |

---

#### FASTN — Fasteners

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Thread Standard | `UNC` | UNC (Imperial) |
| | | `MET` | Metric |
| | | `NA` | Not applicable |
| **SEG5** | — | `NA` | Not applicable |

SIZE = bolt diameter (mm). UNIT = `MM`.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `FASTN-B7-STD-UNC-NA-016-MM` | B7 Stud Bolt, 16mm, UNC Thread | 31 |
| `FASTN-A2-HXB-MET-NA-012-MM` | A2-70 SS Hex Bolt, 12mm, Metric | 32 |

---

#### GASKT — Gaskets

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Pressure Class | `C150`, `C300`, `C600`, `C900`, `PN16`, `PN40`, `NA` | Same pressure class registry |
| **SEG5** | — | `NA` | Not applicable |

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `GASKT-SPWG-NA-C150-NA-100-NB` | Spiral Wound Graphite Gasket, 100 NB, ANSI 150 | 47 |
| `GASKT-PTFE-NA-C150-NA-050-NB` | PTFE Sheet Gasket, 50 NB, ANSI 150 | 35 |
| `GASKT-RJNT-NA-C600-NA-050-NB` | RTJ Ring Joint Gasket, 50 NB, ANSI 600 | 39 |

---

#### STEEL — Structural Steel

| | Attribute | Code | Label |
|-|-----------|------|-------|
| **SEG4** | Material Grade | `S275` | IS 2062 E250 (≈ S275) |
| | | `S350` | IS 2062 E350 (≈ S355) |
| | | `NA` | Not specified |
| **SEG5** | — | `NA` | Not applicable |

SIZE = primary cross-sectional dimension (mm). UNIT = `MM`.

| Item Code | Auto-generated ItemName | Chars |
|-----------|------------------------|-------|
| `STEEL-ANG-NA-S275-NA-100-MM` | Angle Section, 100mm, IS 2062 E250 | 35 |
| `STEEL-IPE-NA-S350-NA-200-MM` | I-beam, 200mm, IS 2062 E350 | 28 |

---

## 6. NA Convention

### 6.1 TYPE = NA — Permanent

| Item Code | Subgroup | Reason |
|-----------|----------|--------|
| `PUMPS-GEA-NA-CS-NA-005-M3H` | Gear pump | No type distinction within gear pumps |
| `PUMPS-SCR-NA-SS3-NA-010-M3H` | Screw pump | No type distinction |
| `PUMPS-HND-NA-CS-NA-010-LPM` | Hand pump | No type distinction |
| `VALVE-NDL-NA-SS3-NPT-006-NB` | Needle valve | No type distinction |
| `PLATE-CS-NA-HR-NA-010-MM` | Plate | No type distinction |
| `PIPES-CS-NA-S40-NA-050-NB` | Pipe | No type distinction |
| `FLANG-CS-NA-C150-WN-100-NB` | Flange | No type distinction |

**Permanent. TYPE = NA is the correct and final coding for these subgroups.**

### 6.2 SEG5 = NA — Permanent

| Item Code | Reason |
|-----------|--------|
| `PUMPS-GEA-NA-CS-NA-005-M3H` | No second engineering identity attribute for gear pumps |
| `ELECT-CMP-VFD-LV-NA-011-KW` | No second attribute for VFD/MCB components |
| `PLATE-CS-NA-HR-NA-010-MM` | No second attribute for plates |
| `PIPES-CS-NA-S40-NA-050-NB` | No second attribute for pipes |
| `FASTN-B7-STD-UNC-NA-016-MM` | No second attribute for fasteners |
| `GASKT-SPWG-NA-C150-NA-100-NB` | No second attribute for gaskets |
| `STEEL-ANG-NA-S275-NA-100-MM` | No second attribute for structural steel |

**Permanent. SEG5 = NA is the correct and final coding for these subgroups.**

### 6.3 SIZE = NA and/or UNIT = NA — Permanent

| Item Code | Reason |
|-----------|--------|
| `ELECT-CMP-PLC-NA-NA-NA-NA` | PLC/DCS modules: I/O count and rack configuration are Variant attributes — no single family-level size |
| `BOPKG-GEN-NA-NA-NA-NA-NA` | General bought-out packages: capacity and duty are Variant attributes — unique per project |

**Permanent. NA-NA coding is the correct and intentional final identity for these categories.**

### 6.4 Temporary NA — Pending Form Implementation

| Item Code | Status | DB flag |
|-----------|--------|---------|
| `ELECT-FLD-NA-NA-NA-NA-NA` | Field instruments attrs form not yet implemented | `item_code_source = 'pending_form'` |

**Temporary placeholder only.** Blocked from SAP sync. Appears in SAP sync preflight report until resolved.

---

## 7. Group, Subgroup, Type, Unit Registries

Full registry tables are in `docs/item-code-generation-plan-v4.0.md` §§5–9 (authoritative registry reference). All codes are seeded into `item_code_registry` at P0.

### 7.1 GROUP Codes — Exactly 5 Characters

| GROUP | Label |
|-------|-------|
| `PUMPS` | Pumps |
| `VALVE` | Valves |
| `MOTOR` | Motors |
| `INSTR` | Instruments |
| `ELECT` | Electrical & Control |
| `BOPKG` | Bought-out Packages |
| `PLATE` | Plates |
| `PIPES` | Pipes |
| `FITNG` | Fittings |
| `FLANG` | Flanges |
| `FASTN` | Fasteners |
| `GASKT` | Gaskets |
| `STEEL` | Structural Steel |

### 7.2 UNIT Registry — Max 4 Characters

| UNIT | Meaning |
|------|---------|
| `LPH` | Litres per hour |
| `M3H` | m³/hr |
| `LPM` | Litres per minute |
| `KW` | Kilowatts |
| `NB` | Nominal bore |
| `BAR` | Bar (pressure) |
| `DGC` | Degrees Celsius |
| `MM` | Millimetres |
| `MM2` | mm² (conductor cross-section) |
| `AMP` | Amperes |
| `V` | Volts |
| `TR` | Tonnes of refrigeration |
| `IN` | Inches |
| `NA` | Not applicable |

---

## 8. Master Item, Variant, Suffix

### 8.1 Three Levels

| Level | What it is | Stored in |
|-------|-----------|-----------|
| **Master Item** | Engineering family, fully defined by the 7-segment code. | `master_items` |
| **Variant** | Commercial or project-specific alternative within the same family. No new ItemCode. | `item_variants` |
| **Suffix exception** | Genuinely distinct families that cannot be separated by the seven segments. Superuser approval mandatory. | `item_code_suffix_exceptions` |

### 8.2 Decision Tree — New Code vs Variant

```
Does the item have a different engineering function, type, or duty
from any existing Master Item (different GROUP/SUBGROUP/TYPE)?
  YES → New Master Item Code
  NO  ↓

Does it have a different SEG4 or SEG5 attribute
(different body MOC, trim, pressure class, voltage, pole count,
  wetted material, schedule, flange type, etc.)?
  YES → New Master Item Code
  NO  ↓

Does it have a different SIZE or UNIT?
  YES → New Master Item Code
  NO  ↓

Is the difference vendor / model / bus rating / Isc / IP rating /
  certification / efficiency class / approval zone only?
  YES → New Variant under the same Master Item Code
  NO  ↓

Can the seven segments distinguish it despite identical
engineering identity?
  NO  → Suffix exception (Superuser approval required; §11)
```

---

## 9. Schema Changes Required

### 9.1 New Table: `item_code_registry`

```sql
CREATE TABLE item_code_registry (
  id              SERIAL PRIMARY KEY,
  registry_type   TEXT NOT NULL,      -- 'group' | 'subgroup' | 'type' | 'seg4' | 'seg5' | 'unit'
  scope_group     TEXT,               -- NULL for group; GROUP code for subgroup/seg
  scope_subgroup  TEXT,               -- NULL unless seg4/seg5 level
  entity_key      TEXT NOT NULL,      -- human key, e.g. 'carbon_steel'
  abbr            TEXT NOT NULL,      -- code used in item_code, e.g. 'CS'
  label           TEXT NOT NULL,      -- English label for short_item_name, e.g. 'CS Body'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (registry_type, COALESCE(scope_group,''), COALESCE(scope_subgroup,''), entity_key)
);
```

Note: `label` column is new vs discussion document — it drives `buildShortItemName()`.

### 9.2 Additive Columns on `master_items`

```sql
ALTER TABLE master_items
  ADD COLUMN short_item_name    VARCHAR(100),  -- SAP OITM.ItemName. Auto-generated from 7 segments.
  ADD COLUMN ic_group           VARCHAR(5),
  ADD COLUMN ic_subgroup        VARCHAR(3),
  ADD COLUMN ic_type            VARCHAR(3),
  ADD COLUMN ic_seg4            VARCHAR(4),
  ADD COLUMN ic_seg5            VARCHAR(4),
  ADD COLUMN ic_size            VARCHAR(5),
  ADD COLUMN ic_unit            VARCHAR(4),
  ADD COLUMN buy_group_id       INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id    INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source   TEXT;
  -- item_code_source: 'auto' | 'manual' | 'migrated' | 'sap_sync' | 'pending_form'
```

**`short_item_name` rules:**
- Auto-generated by `buildShortItemName(segments)` from all 7 code segments expanded via the label registry.
- Always ≤ 100 characters by design (registry labels are sized to guarantee this).
- Hard rejected at backend if > 100 characters (indicates a registry label data error — correct the registry, not the code).
- Superuser override permitted with audit log.
- Never truncated silently.

### 9.3 New Table: `item_variants`

```sql
CREATE TABLE item_variants (
  id                    SERIAL PRIMARY KEY,
  master_item_id        INTEGER NOT NULL REFERENCES master_items(id) ON DELETE RESTRICT,
  variant_seq           INTEGER NOT NULL,
  vendor_id             INTEGER REFERENCES vendors(id),
  manufacturer          TEXT,
  model_number          TEXT,
  moc                   TEXT,
  pressure_class        TEXT,       -- project-specific pressure class (Variant-level)
  end_connection        TEXT,       -- project-specific end connection (Variant-level for ISO valves)
  flange_standard       TEXT,
  voltage               INTEGER,
  phase                 INTEGER,
  frequency             INTEGER,
  bus_rating_amps       INTEGER,    -- panel bus rating (Variant-level)
  sc_rating_ka          INTEGER,    -- panel Isc (Variant-level)
  ip_rating             TEXT,       -- IP rating (Variant-level)
  certifications        TEXT[],
  efficiency_class      TEXT,
  insulation_class      TEXT,
  pole_count            INTEGER,
  zone_approval         TEXT,
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

### 9.4 Other Schema Changes

```sql
-- Link buy list selections to a specific Variant
ALTER TABLE buy_list_line_selections
  ADD COLUMN item_variant_id INTEGER REFERENCES item_variants(id) ON DELETE SET NULL;

-- Suffix exception audit table
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

-- Staging column on BUY package lines
ALTER TABLE buy_package_lines
  ADD COLUMN suggested_item_code VARCHAR(55);
```

---

## 10. Coding Architecture

### 10.1 `server/item-code-service.ts` — Functions

```
buildItemCodeSegments(groupCode, subgroupCode, technicalAttributes)
  → { group, subgroup, type, seg4, seg5, size, unit }

buildRawString(segments)
  → 'PUMPS-CEN-HOR-SS3-MS-1000-LPH'

buildShortItemName(segments, registry)
  → Each code resolved to its label from item_code_registry
  → NA segments omitted from the label string
  → Result: 'Centrifugal Pump, Horizontal, 1000 LPH, SS316 Wetted, Mech Seal'
  → throws Error if result.length > SAP_ITEM_NAME_MAX (100)
    (indicates registry label data error — correct registry, not code)
  → never truncates

generateAndReserveItemCode(db, groupCode, subgroupCode, technicalAttributes)
  → buildItemCodeSegments(...)
  → buildRawString(segments) → validateItemCode (≤ 50 chars)
  → buildShortItemName(segments, registry) → validateItemName (≤ 100 chars)
  → pg_advisory_xact_lock on (groupCode hash)
  → collision check against master_items
  → INSERT master_items {
       item_code        = rawString,
       short_item_name  = shortItemName,   ← auto-generated from 7 segments
       description      = fullAttrsOutput, ← full generated description, always intact
       ic_group, ic_subgroup, ic_type, ic_seg4, ic_seg5, ic_size, ic_unit,
       item_code_source = 'auto'
     }
  → release lock
  → return { item_code, short_item_name }

validateItemCode(itemCode: string): void
  → if itemCode.length > SAP_ITEM_CODE_MAX (50) → throw; never truncates

validateItemName(shortItemName: string): void
  → if shortItemName.length > SAP_ITEM_NAME_MAX (100) → throw; never truncates
  → called at insert, update, AND SAP sync preflight
```

### 10.2 API Endpoints

| Method | Route | Description | Access |
|--------|-------|-------------|--------|
| `POST` | `/api/item-code/preview` | Preview item code + short ItemName from form data. Returns `itemCode`, `shortItemName`, `charCount`. No DB write. | GM / Superuser |
| `POST` | `/api/item-code/reserve` | Generate + write to `master_items`. | GM / Superuser |
| `GET` | `/api/item-code/registry` | Full registry listing (all segment types). | Superuser |
| `PUT` | `/api/item-code/registry/:id` | Update registry entry (label, active status). | Superuser |
| `GET` | `/api/item-code/validate/:code` | Format + uniqueness check. | Authenticated |
| `POST` | `/api/admin/item-code/backfill` | One-time migration trigger. | Superuser |
| `GET` | `/api/admin/item-code/verify` | Parity + compliance report. | Superuser |
| `POST` | `/api/item-code/approve-suffix` | Suffix exception approval. | Superuser |
| `GET` | `/api/master-items/:id/variants` | List all Variants. | Authenticated |
| `POST` | `/api/master-items/:id/variants` | Create a new Variant. | GM / Superuser |
| `PUT` | `/api/master-items/:id/variants/:vid` | Update a Variant. | GM / Superuser |
| `PUT` | `/api/master-items/:id/variants/:vid/preferred` | Set Variant as preferred. | GM / Superuser |
| `GET` | `/api/admin/sap/preflight` | SAP sync preflight — full compliance report. No sync proceeds until empty. | Superuser |

---

## 11. Governance Rules

### 11.1 Suffix Usage

| Rule | Statement |
|------|-----------|
| **Suffix is last resort** | A suffix (`-01`, `-02`, …) may only be appended when two genuinely distinct engineering families cannot be differentiated by the seven segments alone. |
| **Superuser approval mandatory** | No suffix may be assigned without explicit Superuser sign-off. |
| **Audit required** | Every suffix is recorded in `item_code_suffix_exceptions` with: base code, suffix code, reason, approver, timestamp. |
| **Sequential only** | Suffixes must be assigned sequentially: `-01` before `-02`. No gaps. |
| **Maximum length** | Base code (max 32 chars) + `-01` = max 35 chars. Well within 50-char SAP limit. |
| **Not for commercial differences** | MOC differences, vendor differences, certification differences, and pressure class differences are never a reason for a suffix — they require proper SEG4/SEG5 or Variant treatment. |

### 11.2 NA Usage

| Rule | Statement |
|------|-----------|
| **NA is a valid code, not a gap-filler** | `NA` in TYPE, SEG4, SEG5, SIZE, or UNIT means "not applicable for this engineering family." It is the correct, final code for the defined cases in §6. |
| **NA must be defined in registry** | Every segment position that uses `NA` must have `NA` as a valid entry in `item_code_registry` for the relevant scope. |
| **Temporary NA is a blocking flag** | Items with `item_code_source = 'pending_form'` are blocked from SAP sync and flagged in the preflight report. They must be resolved before go-live. |
| **NA cannot mask ambiguity** | If two genuinely different items both code to the same `...-NA-...` pattern, the segment definition must be revisited. Raise a baseline amendment. |

### 11.3 Registry Management

| Rule | Statement |
|------|-----------|
| **Registry is the single source of truth** | All GROUP, SUBGROUP, TYPE, SEG4, SEG5, and UNIT codes and their English labels live exclusively in `item_code_registry`. No hardcoded strings in application code. |
| **New codes require Superuser approval** | Adding a new SUBGROUP, TYPE, SEG4 code, or SEG5 code requires Superuser approval and is logged in `audit_logs`. |
| **Labels must be concise** | Registry `label` values (used to build `short_item_name`) must be sized so that the longest possible combination of labels across all seven segments produces a string ≤ 100 characters. The `GET /api/admin/item-code/verify` endpoint verifies this on demand. |
| **Deactivation, not deletion** | Obsolete codes are marked `is_active = false`. They are never deleted. Existing item codes referencing an inactive code remain valid. |
| **No retroactive code changes** | An item code, once issued and locked (`item_code_locked = true`), is never changed. If the engineering family has genuinely changed, a new item code is issued. |

### 11.4 Future Segment Extension Control

| Rule | Statement |
|------|-----------|
| **7-segment maximum is frozen** | The format `GROUP-SUBGROUP-TYPE-SEG4-SEG5-SIZE-UNIT` is the frozen maximum structure. No eighth segment may be added without a versioned baseline amendment approved by management. |
| **SEG4 and SEG5 semantics are fixed per SUBGROUP** | The meaning of SEG4 and SEG5 for each Group/Subgroup is defined in §5 of this baseline and may not be changed without a versioned amendment. |
| **New SUBGROUP extension** | If a new SUBGROUP requires different SEG4/SEG5 semantics, it must be defined in a baseline amendment before any items are coded. |
| **Code format is immutable** | Once an item code is issued (`item_code_locked = true`), its segment structure cannot be reinterpreted. If the segment semantics change under a baseline amendment, existing codes are grandfathered; only new codes follow the new semantics. |

---

## 12. Migration and Backfill Strategy

| Phase | Action | Risk | Notes |
|-------|--------|------|-------|
| P0 | Create `item_code_registry` — seed all GROUP, SUBGROUP, TYPE, SEG4, SEG5, UNIT codes and labels | Zero | `label` column critical for `buildShortItemName` |
| P0 | Apply all additive schema columns (§9) | Zero | |
| P1 | Implement `item-code-service.ts`: `buildItemCodeSegments`, `buildRawString`, `buildShortItemName`, `generateAndReserveItemCode`, `validateItemCode`, `validateItemName`, preview endpoint | Low | |
| P2 | Reserve endpoint: `pg_advisory_xact_lock` + collision check + full 7-segment generation | Medium | |
| P2 | Wire Phase 3 approval → auto-generate 7-segment item code + `short_item_name` from segments | Medium | |
| P3 | Variant CRUD API endpoints | Medium | |
| P3 | Phase 3 selection modal: Variant picker layer | Medium | |
| P3 | Preview endpoint live: show item code + ItemName before Phase 3 save | Low | |
| P4 | One-time backfill: existing `master_items` without item codes | Medium | Items with full description ≤ 100 chars: backfill `short_item_name` from segments if segment data available; else flag `pending_form` |
| P5 | Pre-go-live gate (§3.3): verify SAP SQL Server field limits | Zero | Gate only — does not block P0–P4 |
| P5 | SAP B1 sync: preflight → `ItemCode` + `ItemName` + `UserText` + `OMRP` MPN rows | High | After gate sign-off only |

---

## 13. Audit and Validation

### 13.1 Event Logging

| Event | `audit_logs.action` | Key payload |
|-------|--------------------|-----------  |
| Item code generated | `item_code_generated` | `item_code`, `short_item_name`, char count, source |
| Short ItemName Superuser override | `short_item_name_override` | Before / after values, `approved_by` |
| Variant created | `variant_created` | `master_item_id`, `variant_seq` |
| Variant set as preferred | `variant_preferred_set` | `master_item_id`, `variant_id` |
| Registry code added | `registry_code_added` | `registry_type`, `abbr`, `label`, `approved_by` |
| Suffix exception approved | `suffix_exception_approved` | `base_code`, `suffix_code`, reason, `approved_by` |
| SAP sync preflight run | `sap_preflight_run` | Items checked, items failed, failing `item_code` list |
| Pre-go-live gate signed off | `sap_golive_gate_passed` | Actual limits recorded from SQL Server metadata |

### 13.2 Format Validation Regexes

```
Item code (no suffix):    ^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-[A-Z0-9]{2,5}-[A-Z0-9]{1,4}$
Item code (with suffix):  ^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-[A-Z0-9]{2,5}-[A-Z0-9]{1,4}-\d{2}$
```

### 13.3 SAP Sync Preflight Report

`GET /api/admin/sap/preflight` blocks sync until all of the following return zero items:

- `item_code` length > 50 (`SAP_ITEM_CODE_MAX`)
- `short_item_name` length > 100 (`SAP_ITEM_NAME_MAX`)
- `short_item_name` is null or empty
- `item_code_source = 'pending_form'` (temporary NA — not ready for SAP)
- `item_code_locked = false` (item code not yet confirmed)

**No SAP sync proceeds until the preflight report is empty.**

---

## 14. Open Questions — Resolve Before Relevant Phase

| # | Question | Owner | Blocks |
|---|----------|-------|--------|
| 1 | **SAP UDF setup.** Configure `U_MOC`, `U_PressClass`, `U_Certs` on OITM, or rely on OMRP + PO line free text only? | THERMOPAC Finance / SAP admin | P5 Variant sync |
| 2 | **Variant approval workflow.** Must Variants require GM/Superuser approval before use in Phase 3, or is creation sufficient? | PM / Process owner | P3 Variant CRUD |
| 3 | **`ELECT-CMP-PLC-NA-NA-NA-NA` and `BOPKG-GEN-NA-NA-NA-NA-NA` — permanent NA confirmed.** For ratification only. | — | — |
| 4 | **`ELECT-FLD-NA-NA-NA-NA-NA` — timeline for field instruments attrs form.** All `pending_form` items blocked from SAP sync until resolved. | PM / Engineering | P4 backfill; P5 sync |
| 5 | **Pump SIZE field when flow rate not specified.** Use motor power (kW)? | Engineering lead | P1 size extraction |
| 6 | **SAP OITG group codes in production.** Confirm `SELECT ItmsGrpCod, ItmsGrpNam FROM OITB` at pre-go-live gate matches §3.5. | THERMOPAC Finance / SAP | P5 |
| 7 | **VALVE-CTL end connection exception.** If a threaded control valve is ever specified, end connection is captured in Variant `additional_attributes`. Confirm this is acceptable. | Engineering lead | P3 |

---

## 15. Document Control

| Version | Date | Description |
|---------|------|-------------|
| v4.0 | 2026-05-11 | Initial approved plan. 5-segment format. GROUP codes (5 chars). Full registry. Variant architecture. |
| v5.0–v5.1 | 2026-05-11 | SAP ItemName governance. Two-level description strategy. NA clarification. SQL Server platform confirmation. |
| Baseline v1.0 | 2026-05-11 | First consolidated approved baseline. |
| Baseline v1.1 | 2026-05-11 | SAP limits confirmed. `sap_item_code` column removed. `short_item_name` VARCHAR(100). Validation constants hardcoded. |
| Baseline v1.2 | 2026-05-11 | ItemName workflow: full description pre-fills `short_item_name`; user edits if > 100 chars. No auto-abbreviation. |
| **Baseline v1.3** | **2026-05-12** | **7-segment architecture (GROUP-SUBGROUP-TYPE-SEG4-SEG5-SIZE-UNIT). Governing principle formally stated. SEG4/SEG5 defined for all Group/Subgroup combinations. Pressure class promoted to ItemCode identity for VALVE-ISO and VALVE-CHK. ELECT-PNL bus rating, Isc, IP confirmed Variant-only. ItemName reverted to 1:1 auto-generation from 7 code segments (buildShortItemName reinstated with 7-segment labels). Governance rules formally stated (suffix, NA, registry, extension control). Schema updated with `ic_seg4`, `ic_seg5` columns and `label` column in registry. All ItemCode examples and ItemName examples regenerated. Max code length 35 chars (with suffix). Max ItemName observed 68 chars.** |

*This document is submitted for management approval. It is frozen pending sign-off. Any deviation requires a versioned amendment approved by management before implementation.*
