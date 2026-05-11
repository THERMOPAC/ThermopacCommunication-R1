# BUY Item Code Generation — Baseline v1.0

**Status: APPROVED BASELINE — SOURCE OF TRUTH**
**Date: 2026-05-11**
**Supersedes:** All prior drafts — v4.0, v5.0, v5.1

No implementation may begin without reference to this document.
No deviation from this baseline is permitted without a versioned amendment.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Item Code Format](#2-item-code-format)
3. [SAP B1 on SQL Server — Field Limits and Architecture](#3-sap-b1-on-sql-server--field-limits-and-architecture)
4. [ItemName Governance — Two-Level Strategy](#4-itemname-governance--two-level-strategy)
5. [Worst-Case ItemName Analysis — All Form Builders](#5-worst-case-itemname-analysis--all-form-builders)
6. [NA Convention — Permanent vs Temporary](#6-na-convention--permanent-vs-temporary)
7. [Group, Subgroup, Type, Unit Registries](#7-group-subgroup-type-unit-registries)
8. [Core Design Principle — Master Item, Variant, Suffix](#8-core-design-principle--master-item-variant-suffix)
9. [Schema Changes Required](#9-schema-changes-required)
10. [Coding Architecture](#10-coding-architecture)
11. [Migration and Backfill Strategy](#11-migration-and-backfill-strategy)
12. [Audit and Validation](#12-audit-and-validation)
13. [Open Questions — Resolve Before SAP Sync Implementation](#13-open-questions--resolve-before-sap-sync-implementation)

---

## 1. Executive Summary

### Business Problem

THERMOPAC BUY package items (pumps, valves, instruments, motors, electrical equipment, raw materials, bought-out packages) currently have no systematic item code. Each purchase request describes the item in free text, making it impossible to:

- Identify duplicate items across projects
- Track vendor history and pricing by engineering family
- Sync items to SAP B1 as reusable master data
- Compare costs across similar items or across projects

### Approved Solution

A structured, human-readable item code is generated automatically at Phase 3 approval of each BUY package line. The code encodes the engineering family (group, subgroup, type, size, unit) in a fixed format. Vendor/MOC/certification differences are captured as Variants under the same Master Item Code, not as separate codes.

### Key Design Rules — Non-Negotiable

| Rule | Statement |
|------|-----------|
| **One code per engineering family** | Group + Subgroup + Type + Size + Unit uniquely identify the Master Item. |
| **No silent truncation — ever** | Neither `item_code` nor `short_item_name` is ever truncated. Any field exceeding its limit causes a hard error and halts the operation. |
| **Auto-generation at Phase 3** | Item codes are generated server-side at Phase 3 approval, not entered manually. |
| **Registry-driven** | All GROUP, SUBGROUP, TYPE, and UNIT codes live in `item_code_registry`. No hardcoded strings outside that table. |
| **Variants, not new codes** | MOC, pressure class, certifications, vendor, and model number differences → Variants. Only a genuinely different engineering family → new Master Item Code. |
| **SAP B1 is SQL Server** | All SAP field length verification uses SQL Server system metadata (`INFORMATION_SCHEMA.COLUMNS` / `sys.columns`). `CUFD` is not applicable for standard field lengths. |
| **Two-level ItemName** | `short_item_name` (≤ 100 chars, SAP-safe) → `OITM.ItemName`. Full generated description (unlimited) → `OITM.UserText`. |

---

## 2. Item Code Format

```
GROUP(5) - SUBGROUP(≤3) - TYPE(≤3) - SIZE(3–5 digits) - UNIT(≤4)
```

**Example:** `PUMPS-CEN-HOR-1000-LPH`

| Segment | Length Rule | Padding | Example |
|---------|-------------|---------|---------|
| GROUP | Exactly 5 characters | Fixed — never padded | `PUMPS` |
| SUBGROUP | Max 3 characters | None | `CEN` |
| TYPE | Max 3 characters | None | `HOR` |
| SIZE | 3–5 digits, zero-padded to minimum 3 | `10` → `010` | `1000` |
| UNIT | Max 4 characters | None | `LPH` |

**Baseline code length:** 20–23 characters.
**With approved suffix:** up to 25 characters (`PUMPS-CEN-HOR-1000-LPH-01`).
**SAP B1 ItemCode limit (expected):** 50 characters — confirmed headroom of 25 characters minimum.

### Approved suffix rule

A suffix (`-01`, `-02`, …) may only be appended when two genuinely distinct engineering families cannot be differentiated by the five segments alone. Approval by Superuser is mandatory. Every approved suffix is recorded in `item_code_suffix_exceptions` with reason and approver. This is an exception path, not a routine workflow.

---

## 3. SAP B1 on SQL Server — Field Limits and Architecture

### 3.1 Platform Statement

SAP Business One is deployed on **SQL Server** (not HANA). All database metadata queries must use SQL Server system catalog tables. `CUFD` is a SAP B1 application table that only stores User Defined Field definitions — it does not contain standard SAP-delivered field lengths and must not be used for this purpose.

### 3.2 Required Verification — Run Before SAP Sync Implementation Begins

Run the following query against the production SAP B1 SQL Server database and record all three results:

```sql
-- INFORMATION_SCHEMA: CHARACTER_MAXIMUM_LENGTH is in characters; -1 = unlimited
SELECT
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME  = 'OITM'
  AND COLUMN_NAME IN ('ItemCode', 'ItemName', 'UserText')
ORDER BY COLUMN_NAME;
```

If `sys.columns` detail is needed (max_length is in **bytes** for NVARCHAR — divide by 2 for character count):

```sql
SELECT
  c.name                    AS column_name,
  t.name                    AS data_type,
  c.max_length              AS max_length_bytes,
  CASE
    WHEN c.max_length = -1 THEN 'Unlimited'
    ELSE CAST(c.max_length / 2 AS VARCHAR(10))
  END                       AS max_chars
FROM sys.columns c
JOIN sys.types   t  ON c.user_type_id = t.user_type_id
JOIN sys.tables  tb ON c.object_id    = tb.object_id
WHERE tb.name  = 'OITM'
  AND c.name  IN ('ItemCode', 'ItemName', 'UserText')
ORDER BY c.name;
```

**Expected results (standard SAP B1 10 on SQL Server):**

| Column | Data type | Expected CHARACTER_MAXIMUM_LENGTH | Notes |
|--------|-----------|----------------------------------|-------|
| `ItemCode` | NVARCHAR | **50** (B1 10) or 20 (older B1) | Determines hard limit for `item_code` at SAP sync |
| `ItemName` | NVARCHAR | **100** | Determines hard limit for `short_item_name` |
| `UserText` | NTEXT | **-1 (unlimited)** | Full generated description fits with no constraint |

Record and sign off the actual values before beginning SAP sync implementation (Phase P5).

### 3.3 Expected Architecture Based on Confirmed Limits

| Field | Expected limit | Our worst case | Action |
|-------|---------------|---------------|--------|
| `OITM.ItemCode` | 50 chars | 25 chars (with suffix) | Direct use of `item_code`. No transformation. |
| `OITM.ItemName` | 100 chars | 162 chars (control valve) | Two-level strategy (§4) mandatory. |
| `OITM.UserText` | Unlimited (NTEXT) | 162 chars | Full description synced here safely. |

### 3.4 SAP B1 Field Mapping

| THERMOPAC field | SAP B1 field | Limit | Notes |
|----------------|-------------|-------|-------|
| `master_items.item_code` | `OITM.ItemCode` | 50 (expected) | Direct; no truncation |
| `master_items.short_item_name` | `OITM.ItemName` | 100 (expected) | SAP-safe label. Never truncated. |
| `master_items.description` | `OITM.UserText` | Unlimited (NTEXT) | Full auto-generated attrs description |
| `item_variants.moc` | `OITM.U_MOC` (UDF) | Config-dependent | Preferred variant MOC |
| `item_variants.pressure_class` | `OITM.U_PressClass` (UDF) | Config-dependent | Preferred variant pressure class |
| `item_variants.certifications` | `OITM.U_Certs` (UDF) | Config-dependent | Preferred variant certifications |
| `item_variants.vendor_id` + `model_number` | `OMRP` (MPN table) | — | One row per active Variant |
| Selected Variant full spec | `OPOR1.Dscription` / `FreeText` | — | Written at PO creation per project |

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

Confirm configured OITG codes against production B1:

```sql
SELECT ItmsGrpCod, ItmsGrpNam FROM OITB ORDER BY ItmsGrpNam;
```

---

## 4. ItemName Governance — Two-Level Strategy

### 4.1 Why Two Levels Are Required

The system auto-generates a full Generic Requirement string from each attrs form (e.g., `buildControlValveRequirement`, `buildJunctionBoxRequirement`). This string is procurement-rich but regularly reaches 162 characters — far exceeding the standard SAP B1 `OITM.ItemName` limit of 100 characters.

**Silent truncation is prohibited.** A string truncated at 100 characters mid-word produces a corrupt, misleading SAP item name (e.g., `"Pneumatic Diaphragm Actu"` instead of `"Pneumatic Diaphragm Actuator"`).

### 4.2 The Two Fields

| Field | Content | Length constraint | SAP destination |
|-------|---------|-----------------|----------------|
| `master_items.short_item_name` | Engineering family label — derived from item code segments, expanded to readable English | ≤ 100 characters. Hard validated at insert and at sync. Hard error if exceeded; never truncated. | `OITM.ItemName` |
| `master_items.description` | Full auto-generated requirement string from attrs form | Unlimited (PostgreSQL TEXT) | `OITM.UserText` (NTEXT, unlimited) |

### 4.3 Short ItemName — Generation Formula

`{GROUP label}, {SUBGROUP label}, {TYPE label}, {SIZE} {UNIT}`

Generated server-side from the same registry that generates the item code. Describes the engineering family, not a specific variant.

If the auto-generated value exceeds 100 characters: hard error, sync halted, Superuser manual override required. No automatic truncation.

**Verified examples — all well within 100 characters:**

| Item Code | Short ItemName | Chars |
|-----------|---------------|-------|
| `PUMPS-CEN-HOR-1000-LPH` | Centrifugal Pump, Horizontal, 1000 LPH | 38 |
| `PUMPS-DOS-DPH-100-LPH` | Dosing Pump, Diaphragm, 100 LPH | 31 |
| `MOTOR-NFP-ACI-110-KW` | Non-Flameproof Motor, AC Induction, 110 kW | 43 |
| `MOTOR-FLP-ACI-015-KW` | Flameproof Motor, AC Induction, 15 kW | 38 |
| `VALVE-ISO-BAL-050-NB` | Isolation Valve, Ball, 50 NB | 28 |
| `VALVE-CTL-GLB-100-NB` | Control Valve, Globe, 100 NB | 28 |
| `VALVE-SAF-SPL-001-IN` | Safety Valve, Spring Loaded, 1 in | 34 |
| `INSTR-PRS-TXR-010-BAR` | Pressure Transmitter, 0–10 Bar | 31 |
| `INSTR-TMP-TCC-200-DGC` | Thermocouple, 0–200°C | 21 |
| `INSTR-FLW-MAG-100-NB` | Magnetic Flowmeter, 100 NB | 26 |
| `INSTR-LVL-GWR-4000-MM` | Guided Wave Radar Level, 0–4000 mm | 35 |
| `ELECT-PNL-MCC-415-V` | MCC Panel, 415 V | 17 |
| `ELECT-CMP-VFD-011-KW` | VFD Drive, 11 kW | 17 |
| `ELECT-CMP-MCB-016-AMP` | MCB, 16 A | 9 |
| `ELECT-CBL-PWR-016-MM2` | Power Cable, 16 mm² | 20 |
| `ELECT-JBX-FPR-300-MM` | Flameproof Junction Box, 300 mm | 31 |
| `ELECT-CMP-PLC-NA-NA` | PLC / DCS Module | 17 |
| `BOPKG-CLT-MDT-100-TR` | Cooling Tower, Mechanical Draft, 100 TR | 39 |
| `BOPKG-GEN-NA-NA-NA` | General Bought-out Package | 26 |
| `PLATE-CS-NA-010-MM` | Carbon Steel Plate, 10 mm | 25 |
| `PIPES-S31-NA-050-NB` | SS316L Pipe, 50 NB | 18 |
| `FLANG-DSS-NA-100-NB` | Duplex SS Flange, 100 NB | 24 |

**Maximum short ItemName observed across all groups: 43 characters.**

### 4.4 Validation — No Silent Truncation

```typescript
function validateItemCode(itemCode: string, sapLimit: number): void {
  if (itemCode.length > sapLimit) {
    throw new Error(
      `ItemCode "${itemCode}" is ${itemCode.length} chars, ` +
      `exceeds confirmed SAP limit of ${sapLimit}. ` +
      `Sync aborted. Manual override required.`
    );
  }
}

function validateItemName(shortItemName: string, sapLimit: number): void {
  if (shortItemName.length > sapLimit) {
    throw new Error(
      `ItemName "${shortItemName}" is ${shortItemName.length} chars, ` +
      `exceeds confirmed SAP limit of ${sapLimit}. ` +
      `Sync aborted. Manual override required.`
    );
  }
}
```

Both run as a preflight check before any SAP sync batch. Any violation halts the entire batch and returns a structured report of all failing items. Partial sync is not permitted.

---

## 5. Worst-Case ItemName Analysis — All Form Builders

Read directly from production form builder code. Character counts are verified.

### 5.1 Summary Table

| Form builder | Source file | Worst-case full description | Chars | SAP ItemName safe? |
|-------------|-------------|----------------------------|-------|--------------------|
| Control valve | `valve-attrs-forms.tsx` | `Globe Control Valve, DN 200 (8"), ANSI Class 900, Equal Percentage, SS316 Trim, Pneumatic Diaphragm Actuator, Fail Close (FC), Alloy 20 Body, Flanged RF ANSI B16.5` | **162** | ⚠ No |
| Flameproof junction box | `electrical-attrs-forms.tsx` | `Flameproof JB, IP66, Die-Cast Aluminium, Stand Mounted, 96 Terminals Screw, 8 Entries (M25), Zone 1 (Gas Group IIC), w/ Nameplate+Tag` | **131** | ⚠ No |
| Pressure transmitter + zone | `instrument-attrs-forms.tsx` | `Pressure Transmitter, 0–100 bar, 4–20mA + HART, 24V DC Loop Powered, 1/2" NPT Male, SS316L Wetted, IP67, Zone 1 IECEx/ATEX` | **122** | ⚠ No |
| Level transmitter + zone | `instrument-attrs-forms.tsx` | `Guided Wave Radar Level Transmitter, 0–4000 mm, 4–20mA + HART, 1-1/2" Flanged, SS316L Probe, IP67, Zone 1 IECEx/ATEX` | **117** | ⚠ No |
| General bought-out package | `electrical-attrs-forms.tsx` | `Nitrogen Generator Package, 50 Nm³/hr 99.5% Purity, Skid Mounted, SS316L, Includes Flow Control + Dryer + PLC Panel` | **113** | ⚠ No |
| MCC panel + zone | `electrical-attrs-forms.tsx` | `Motor Control Centre, 415V 3Ph 50Hz, 4000A Bus, 50kA SC Rating, IP54, GRP Enclosure, Zone 1 (Gas Group IIC)` | **106** | ⚠ No |
| Temperature transmitter + zone | `instrument-attrs-forms.tsx` | `Temperature Transmitter, -30–400°C, Type R Thermocouple, 4–20mA HART, Head Mounted, SS316L, Zone 1, Ex ia` | **104** | ⚠ No |
| Motor (fully populated) | `motor-attrs-forms.tsx` | `Flameproof TEFC Motor, 110 kW, 415V/3Ph/50Hz, 1450 RPM, IE3, TEFC, Foot and Flange Mounting B3/B5, IP55` | **103** | ⚠ No |
| Instrumentation cable, screened | `electrical-attrs-forms.tsx` | `Instrumentation Cable, 27 Core x 1.5 mm², 600/1000V, XLPE, SWA, Individual + Overall Screened, IEC 60502` | **103** | ⚠ No |
| Cooling tower | `electrical-attrs-forms.tsx` | `Cooling Tower, 250 m³/hr, Range 10.0°C, Approach 5.0°C, FRP, Induced Draft, Axial Fan, 11 kW` | 93 | ✓ Yes |
| Safety valve | `valve-attrs-forms.tsx` | `Safety Valve, 2" × 3", API 526, Spring Loaded, SS316 Trim, ASME IBR Certified, Flanged RF` | 91 | ✓ Yes |
| Pressure gauge | `instrument-attrs-forms.tsx` | `Pressure Gauge, 0–16 bar, Glycerine Filled, 100mm Dial, 1/2" NPT Bottom, SS316L, IP65` | 88 | ✓ Yes |
| Pump (fully populated) | `pump-attrs-forms.tsx` | `Centrifugal Pump, Vertical Turbine, 8-Bowl, 6m Column, 500 m³/hr @ 80m TDH, CS Body` | 85 | ✓ Yes |
| General purpose junction box | `electrical-attrs-forms.tsx` | `General Purpose JB, IP65, GRP/FRP, Wall Mounted, 12 Terminals Screw, 4 Entries (M20)` | 87 | ✓ Yes |
| Gate / ball valve (simple) | `valve-attrs-forms.tsx` | `Ball Valve, 50 NB, ANSI 150, Full Bore, SS316 Ball, PTFE Seat, Flanged RF` | 74 | ✓ Yes |
| Electrical component | `electrical-attrs-forms.tsx` | `MCB, 63A, 415V 3Ph 50Hz, 4P, Breaking 36kA, C Curve, IP65, Zone 2` | 67 | ✓ Yes |
| Plate / pipe / flange | `piping-attrs-forms.tsx` | `Hastelloy C-276, Plate, 50 mm thk, 2500 × 12000 mm, ASME SA-516` | 65 | ✓ Yes |

**9 of 17 form types regularly exceed 100 characters when fully populated. The two-level strategy in §4 is mandatory — not optional.**

---

## 6. NA Convention — Permanent vs Temporary

There are three distinct uses of `NA` in the item code system. They must not be confused with each other.

### 6.1 TYPE = NA — Permanent

Applied when a subgroup has no meaningful engineering type subdivision. This is a deliberate permanent engineering decision, not a placeholder.

| Item Code | Subgroup | Reason |
|-----------|----------|--------|
| `PUMPS-GEA-NA-005-M3H` | Gear pump | No type distinction within gear pumps |
| `PUMPS-SCR-NA-010-M3H` | Screw pump | No type distinction within screw pumps |
| `PUMPS-HND-NA-010-LPM` | Hand pump | No type distinction within hand pumps |
| `VALVE-NDL-NA-006-NB` | Needle valve | No type distinction within needle valves |

**Permanent. TYPE = NA is the correct, final type for these subgroups. It is not a placeholder.**

### 6.2 SIZE = NA and/or UNIT = NA — Permanent

Applied when the engineering family has no standard numeric size dimension at the family level. Identity is defined entirely by GROUP + SUBGROUP + TYPE.

| Item Code | Reason | Size/capacity storage |
|-----------|--------|-----------------------|
| `ELECT-CMP-PLC-NA-NA` | PLC modules: platform, rack count, I/O count are Variant attributes — no single family-level size | `item_variants.additional_attributes` JSONB |
| `BOPKG-GEN-NA-NA-NA` | General bought-out packages: unique in each project; duty and capacity are Variant attributes | `item_variants.additional_attributes` JSONB |

**Permanent. The NA-NA coding is the correct and intentional final identity for these categories. It is not a placeholder waiting for a size to be added.**

### 6.3 Temporary NA — Pending Form Implementation

Applied only where an attrs form for a subgroup has not yet been built.

| Item Code | Status | Flag |
|-----------|--------|------|
| `ELECT-FLD-NA-NA-NA` | Field items attrs form not yet implemented | `item_code_source = 'pending_form'` |

**Temporary placeholder only.** When the attrs form is built, TYPE/SIZE/UNIT codes will be defined and all `ELECT-FLD-NA-NA-NA` records migrated. These items appear in the SAP sync preflight report and are blocked from sync until resolved.

---

## 7. Group, Subgroup, Type, Unit Registries

All registries are seeded into the `item_code_registry` table. The full detailed tables are maintained in `docs/item-code-generation-plan-v4.0.md` §§5–9, which is the authoritative registry reference. Key group codes are summarised here.

### 7.1 GROUP Codes (Exactly 5 Characters — Fixed)

| GROUP code | Label | Category |
|-----------|-------|----------|
| `PUMPS` | Pumps | Equipment |
| `VALVE` | Valves | Equipment |
| `MOTOR` | Motors | Equipment |
| `INSTR` | Instruments | Equipment |
| `ELECT` | Electrical & Control | Equipment |
| `BOPKG` | Bought-out Packages | Equipment |
| `PLATE` | Plates | Raw Material |
| `PIPES` | Pipes | Raw Material |
| `FITNG` | Fittings | Raw Material |
| `FLANG` | Flanges | Raw Material |
| `FASTN` | Fasteners | Raw Material |
| `GASKT` | Gaskets | Raw Material |
| `STEEL` | Structural Steel | Raw Material |

### 7.2 SUBGROUP and TYPE — Overview

Full tables in `docs/item-code-generation-plan-v4.0.md` §§6–8. SUBGROUP max 3 characters; TYPE max 3 characters or `NA` when no type distinction applies.

### 7.3 SIZE — Extraction Rules

| Group | Primary SIZE source | Fallback |
|-------|---------------------|---------|
| `PUMPS` | Flow rate (e.g. 1000 LPH) | Motor power in kW (Q7 — pending confirmation) |
| `MOTOR` | Rated power in kW | — |
| `VALVE` | Nominal bore in NB | — |
| `INSTR` | Range span (upper value) | Nominal bore for flowmeters |
| `ELECT-PNL` | Supply voltage (V) | — |
| `ELECT-CMP` | Rating (kW, A, mm²) | `NA` if no standard size |
| `ELECT-JBX` | Enclosure longest dimension (mm) | — |
| `ELECT-CBL` | Conductor cross-section (mm²) | — |
| `BOPKG` | Capacity (TR, kW, Nm³/hr) | `NA` if no standard size |
| `PLATE` | Thickness (mm) | — |
| `PIPES` | Nominal bore (NB) | — |
| `FLANG` | Nominal bore (NB) | — |

### 7.4 UNIT Registry (Max 4 Characters)

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
| `MM2` | mm² (cross-section) |
| `AMP` | Amperes |
| `V` | Volts |
| `TR` | Tonnes of refrigeration |
| `IN` | Inches |
| `NA` | Not applicable (permanent) |

---

## 8. Core Design Principle — Master Item, Variant, Suffix

### 8.1 Three Levels

| Level | What it is | Stored in |
|-------|-----------|-----------|
| **Master Item** | Engineering family. One item code per family. | `master_items` |
| **Variant** | Commercial/technical alternative within the same family (different MOC, pressure class, vendor, certifications, model number). No new item code — same master code. | `item_variants` |
| **Suffix exception** | Genuinely distinct families that cannot be separated by the five segments alone. Requires Superuser approval and audit. | `item_code_suffix_exceptions` |

### 8.2 Decision Tree — New Code vs Variant

```
Does the item have a different engineering function or duty from any existing Master Item?
  YES → New Master Item Code
  NO  ↓

Does it have a different flow rate / power / bore / size?
  YES → New Master Item Code
  NO  ↓

Is the difference MOC / pressure class / vendor / model / certification only?
  YES → New Variant under the same Master Item Code
  NO  ↓

Can the five segments distinguish it despite identical function and size?
  NO  → Suffix exception (Superuser approval required)
```

### 8.3 Variant Attributes

Variants carry: `moc`, `pressure_class`, `flange_standard`, `voltage`, `phase`, `frequency`, `certifications`, `efficiency_class`, `insulation_class`, `ip_rating`, `spec_revision`, `datasheet_gcs_path`, `manufacturer`, `model_number`, `vendor_id`, `additional_attributes` (JSONB for anything not covered by standard columns).

At Phase 3 selection, the user picks a specific Variant for the BUY line. The Master Item Code identifies the family; the Variant captures the procurement-ready specifics.

---

## 9. Schema Changes Required

### 9.1 New Table: `item_code_registry`

```sql
CREATE TABLE item_code_registry (
  id              SERIAL PRIMARY KEY,
  registry_type   TEXT NOT NULL,         -- 'group', 'subgroup', 'type', 'unit'
  scope_group     TEXT,                  -- NULL for group-level; GROUP code for subgroup/type
  scope_subgroup  TEXT,                  -- NULL unless type-level
  entity_key      TEXT NOT NULL,         -- human key, e.g. 'centrifugal'
  abbr            TEXT NOT NULL,         -- code used in item_code, e.g. 'CEN'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (registry_type, COALESCE(scope_group,''), COALESCE(scope_subgroup,''), entity_key)
);
```

### 9.2 Additive Columns on `master_items`

```sql
ALTER TABLE master_items
  ADD COLUMN short_item_name    TEXT,          -- SAP-safe ItemName ≤ 100 chars. Hard validated. Never truncated.
  ADD COLUMN ic_group           VARCHAR(5),    -- e.g. 'PUMPS'
  ADD COLUMN ic_subgroup        VARCHAR(3),    -- e.g. 'CEN'
  ADD COLUMN ic_type            VARCHAR(3),    -- e.g. 'HOR'
  ADD COLUMN ic_size            VARCHAR(5),    -- e.g. '1000'
  ADD COLUMN ic_unit            VARCHAR(4),    -- e.g. 'LPH'
  ADD COLUMN buy_group_id       INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id    INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source   TEXT,          -- 'auto' | 'manual' | 'migrated' | 'sap_sync' | 'pending_form'
  ADD COLUMN sap_item_code      VARCHAR(50);   -- Retain if SAP ItemCode confirmed < 25 chars. Drop otherwise.
```

The existing `description` column (PostgreSQL TEXT, unlimited) stores the full auto-generated attrs description. No change required.

**`short_item_name` rules:**
- Max 100 characters — enforced at insert AND at SAP sync preflight.
- Must not be empty for any item that will be synced to SAP.
- Auto-generated from registry at item code generation time.
- Superuser may override with audit trail.
- If auto-generated value exceeds 100 chars: hard error, no truncation, Superuser manual override required.

### 9.3 New Table: `item_variants`

```sql
CREATE TABLE item_variants (
  id                    SERIAL PRIMARY KEY,
  master_item_id        INTEGER NOT NULL REFERENCES master_items(id) ON DELETE RESTRICT,
  variant_seq           INTEGER NOT NULL,
  variant_display_code  VARCHAR(35),
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

### 9.4 Alter `buy_list_line_selections`

```sql
ALTER TABLE buy_list_line_selections
  ADD COLUMN item_variant_id INTEGER REFERENCES item_variants(id) ON DELETE SET NULL;
```

### 9.5 New Table: `item_code_suffix_exceptions`

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

### 9.6 Additive Column on `buy_package_lines`

```sql
ALTER TABLE buy_package_lines
  ADD COLUMN suggested_item_code VARCHAR(55);
```

---

## 10. Coding Architecture

### 10.1 `server/item-code-service.ts` — Functions

```
buildItemCodeSegments(groupCode, subgroupCode, technicalAttributes)
  → { group, subgroup, type, size, unit }

buildRawString(segments)
  → 'PUMPS-CEN-HOR-1000-LPH'

buildShortItemName(segments)
  → 'Centrifugal Pump, Horizontal, 1000 LPH'
  → throws Error if result > 100 chars (never truncates)

generateAndReserveItemCode(db, groupCode, subgroupCode, technicalAttributes)
  → pg_advisory_lock on (groupCode hash)
  → collision check against master_items
  → buildShortItemName → validate ≤ 100 chars
  → INSERT master_items { item_code, short_item_name, description, ic_* columns, item_code_source='auto' }
  → release lock
  → return final item_code

validateSapFieldLengths(itemCode, shortItemName, confirmedSapLimits)
  → validateItemCode(itemCode, confirmedSapLimits.itemCode)
  → validateItemName(shortItemName, confirmedSapLimits.itemName)
  → throws structured error; never truncates; blocks SAP sync batch for this item
```

### 10.2 API Endpoints

| Method | Route | Description | Access |
|--------|-------|-------------|--------|
| `POST` | `/api/item-code/preview` | Preview item code + short ItemName from form data. No DB write. | GM / Superuser |
| `POST` | `/api/item-code/reserve` | Generate + write to `master_items`. | GM / Superuser |
| `GET` | `/api/item-code/registry` | Full registry listing. | Superuser |
| `PUT` | `/api/item-code/registry/:id` | Update registry entry. | Superuser |
| `GET` | `/api/item-code/validate/:code` | Format + uniqueness check. | Authenticated |
| `POST` | `/api/admin/item-code/backfill` | One-time migration trigger for existing items. | Superuser |
| `GET` | `/api/admin/item-code/verify` | Parity + compliance report: short ItemName lengths, `pending_form` flags. | Superuser |
| `POST` | `/api/item-code/approve-suffix` | Suffix exception approval with reason. | Superuser |
| `GET` | `/api/master-items/:id/variants` | List all Variants for a Master Item. | Authenticated |
| `POST` | `/api/master-items/:id/variants` | Create a new Variant. | GM / Superuser |
| `PUT` | `/api/master-items/:id/variants/:vid` | Update a Variant. | GM / Superuser |
| `PUT` | `/api/master-items/:id/variants/:vid/preferred` | Set a Variant as preferred. | GM / Superuser |
| `GET` | `/api/admin/sap/preflight` | SAP sync preflight: validate all pending items against confirmed SAP field limits. Returns structured report of all failures. | Superuser |

---

## 11. Migration and Backfill Strategy

| Phase | Action | Risk | Blocks |
|-------|--------|------|--------|
| P0 | **Run SQL Server verification queries (§3.2). Record and sign off ItemCode limit, ItemName limit, UserText type.** | Zero | P5 |
| P0 | Create `item_code_registry` table + seed all GROUP/SUBGROUP/TYPE/UNIT codes | Zero | P1 |
| P0 | Apply all additive schema columns (§9) | Zero | P1 |
| P1 | Implement `item-code-service.ts`: `buildItemCodeSegments`, `buildRawString`, `buildShortItemName`, `generateAndReserveItemCode`, preview API endpoint | Low | P2 |
| P2 | Reserve endpoint with `pg_advisory_xact_lock` + collision check + full validation | Medium | P2 workflows |
| P2 | Wire Phase 3 approval → auto-generate item code + short ItemName + store full description in `master_items` | Medium | Live usage |
| P3 | Variant CRUD API endpoints | Medium | Phase 3 UI |
| P3 | Phase 3 selection modal: Variant picker layer | Medium | Live usage |
| P3 | UI: item code preview chip, short ItemName display, full description in detail/tooltip | Low | Live usage |
| P4 | One-time backfill admin endpoint for existing `master_items` without item codes | Medium | Audit compliance |
| P5 | SAP B1 sync: preflight validation → `ItemCode` + `ItemName` + `UserText` + `OMRP` MPN rows (after P0 sign-off only) | High | P0 sign-off |

---

## 12. Audit and Validation

### 12.1 Event Logging

| Event | `audit_logs.action` | Key payload fields |
|-------|--------------------|--------------------|
| Item code generated | `item_code_generated` | `item_code`, `short_item_name` length, `description` length, `item_code_source` |
| Short ItemName manually overridden | `short_item_name_override` | Before / after values, `approved_by` |
| Variant created | `variant_created` | `master_item_id`, `variant_seq`, `moc`, `vendor_id` |
| Variant set as preferred | `variant_preferred_set` | `master_item_id`, `variant_id` |
| Suffix exception approved | `suffix_exception_approved` | `base_code`, `suffix_code`, `reason`, `approved_by` |
| SAP sync preflight run | `sap_preflight_run` | Count of items checked, count failed, list of failing `item_code` values |

### 12.2 Format Validation Regexes

```
Item code (no suffix):      ^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}$
Item code (with suffix):    ^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}-\d{2}$
```

### 12.3 SAP Sync Preflight Report

`GET /api/admin/sap/preflight` returns all items that would block a sync:

- `short_item_name` exceeds confirmed SAP `ItemName` limit
- `item_code` exceeds confirmed SAP `ItemCode` limit
- `short_item_name` is null or empty
- `item_code_source = 'pending_form'` (temporary NA — not ready for SAP)

No SAP sync proceeds until the preflight report returns zero failures.

---

## 13. Open Questions — Resolve Before SAP Sync Implementation

All questions in rows 1–3 must be resolved before Phase P5 begins. Rows 4–9 must be resolved before the relevant implementation phase.

| # | Question | How to resolve | Owner | Blocks |
|---|----------|---------------|-------|--------|
| 1 | **`OITM.ItemCode` confirmed max length.** Expected: 50 chars (B1 10). | Run §3.2 query against production SAP SQL Server DB. Record actual `CHARACTER_MAXIMUM_LENGTH`. | THERMOPAC IT / SAP admin | P5 |
| 2 | **`OITM.ItemName` confirmed max length.** Expected: 100 chars. Sets the hard cap for `short_item_name` enforcement. | Run §3.2 query against production SAP SQL Server DB. Record actual `CHARACTER_MAXIMUM_LENGTH`. | THERMOPAC IT / SAP admin | P5; `short_item_name` validation rule |
| 3 | **`OITM.UserText` data type confirmation.** Expected: NTEXT (unlimited). Confirms full description has no length constraint in SAP. | Run §3.2 query. Confirm `CHARACTER_MAXIMUM_LENGTH = -1`. | THERMOPAC IT / SAP admin | P5 |
| 4 | **SAP UDF setup.** Configure `U_MOC`, `U_PressClass`, `U_Certs` on OITM, or rely on OMRP + PO line free text only? | Decision by THERMOPAC Finance + SAP admin | THERMOPAC Finance / SAP admin | P5 Variant sync |
| 5 | **Variant approval workflow.** Must Variants be approved (GM / Superuser) before use in Phase 3, or is creation sufficient? | Decision by PM / Process owner | PM / Process owner | P3 Variant CRUD |
| 6 | **`ELECT-CMP-PLC-NA-NA` and `BOPKG-GEN-NA-NA-NA` confirmed as permanent NA-NA (§6.2).** No action required unless disputed. | Ratify or raise objection | — | — |
| 7 | **`ELECT-FLD-NA-NA-NA` — timeline for field items attrs form.** All `pending_form` records are blocked from SAP sync until this form is built and records migrated. | PM / Engineering to set timeline | PM / Engineering | P4 backfill; P5 sync |
| 8 | **Pump SIZE field priority.** When flow rate is not specified: use motor power (kW) as SIZE source? | Engineering lead to confirm | Engineering lead | P1 size extraction |
| 9 | **SAP OITG group codes in production match §3.5.** | Run: `SELECT ItmsGrpCod, ItmsGrpNam FROM OITB ORDER BY ItmsGrpNam` on production SAP SQL Server DB | THERMOPAC Finance / SAP | P5 |

---

## Document Control

| Version | Date | Description |
|---------|------|-------------|
| v4.0 | 2026-05-11 | Initial approved plan. GROUP codes (5 chars), full registry, code matrix, Variant architecture. |
| v5.0 | 2026-05-11 | Added SAP ItemName length governance. Two-level description strategy. NA-NA clarification. Worst-case analysis (17 form builders). |
| v5.1 | 2026-05-11 | Correction: SAP B1 platform is SQL Server (not HANA). CUFD removed. SQL Server metadata queries added. `UserText` confirmed as NTEXT. |
| **Baseline v1.0** | **2026-05-11** | **Final approved baseline. All v4.0 through v5.1 content consolidated. Source of truth for implementation.** |

*This document is frozen. Any deviation requires a versioned amendment approved by management before implementation.*
