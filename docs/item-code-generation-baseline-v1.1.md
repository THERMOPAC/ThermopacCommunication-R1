# BUY Item Code Generation — Baseline v1.1

**Status: APPROVED BASELINE — SOURCE OF TRUTH**
**Date: 2026-05-11**
**Supersedes:** Baseline v1.0 (2026-05-11)

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
13. [Open Questions — Resolve Before Relevant Phase](#13-open-questions--resolve-before-relevant-phase)
14. [Document Control](#14-document-control)

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
| **No silent truncation — ever** | Neither `item_code` nor `short_item_name` is ever truncated. Any field exceeding its hard limit causes a backend error and halts the operation. |
| **Auto-generation at Phase 3** | Item codes are generated server-side at Phase 3 approval, not entered manually. |
| **Registry-driven** | All GROUP, SUBGROUP, TYPE, and UNIT codes live in `item_code_registry`. No hardcoded strings outside that table. |
| **Variants, not new codes** | MOC, pressure class, certifications, vendor, and model number differences → Variants. Only a genuinely different engineering family → new Master Item Code. |
| **SAP B1 is SQL Server** | SAP B1 is on SQL Server. Platform is confirmed. `CUFD` is not used for standard field lengths. |
| **Confirmed SAP limits** | `OITM.ItemCode` = **50 chars**. `OITM.ItemName` = **100 chars**. `OITM.UserText` = unlimited (NTEXT). These are the SAP B1 10 SQL Server standards and are the hardcoded design baseline. |
| **Direct field mapping** | `item_code` → `OITM.ItemCode` directly. `short_item_name` (VARCHAR(100)) → `OITM.ItemName` directly. Full description → `OITM.UserText` directly. No intermediate transformation columns. |
| **Two-level ItemName** | `short_item_name` ≤ 100 chars, SAP-safe → `OITM.ItemName`. Full generated description, unlimited → `OITM.UserText`. |

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
**SAP B1 `ItemCode` limit: 50 characters (confirmed).** Confirmed headroom: 25 characters minimum.

### Approved Suffix Rule

A suffix (`-01`, `-02`, …) may only be appended when two genuinely distinct engineering families cannot be differentiated by the five segments alone. Approval by Superuser is mandatory. Every approved suffix is recorded in `item_code_suffix_exceptions` with reason and approver. This is an exception path, not a routine workflow.

---

## 3. SAP B1 on SQL Server — Field Limits and Architecture

### 3.1 Platform Statement

SAP Business One is deployed on **SQL Server** (not HANA). `CUFD` is a SAP B1 application table that only stores User Defined Field definitions — it does not contain standard SAP-delivered field lengths and must not be used for this purpose. All field metadata is read from SQL Server system catalog tables when needed.

### 3.2 Confirmed Design Limits

The following are the SAP B1 10 SQL Server standard field limits. These are the **confirmed, hardcoded design baseline** — not variables pending confirmation. All backend validation, schema column sizing, and SAP sync logic are built against these values.

| SAP field | Data type | Confirmed limit | Design decision |
|-----------|-----------|----------------|----------------|
| `OITM.ItemCode` | NVARCHAR | **50 characters** | `master_items.item_code` maps directly. Our max is 25 chars — 25 chars confirmed headroom. |
| `OITM.ItemName` | NVARCHAR | **100 characters** | `master_items.short_item_name VARCHAR(100)` maps directly. Hard validated ≤ 100 at insert. |
| `OITM.UserText` | NTEXT | **Unlimited** | `master_items.description` (TEXT) maps directly. Full generated description stored here safely. |

### 3.3 Pre-Go-Live Verification Gate — Mandatory Before First SAP Sync

Before the first live SAP sync (Phase P5), the SAP admin must run the following query against the production SAP B1 SQL Server database and confirm the results match the design baseline above. This is a go-live gate, not an implementation blocker — all phases P0–P4 proceed on the confirmed limits in §3.2.

**Verification query — `INFORMATION_SCHEMA.COLUMNS`:**

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

**Alternative — `sys.columns` (max_length is in bytes for NVARCHAR; divide by 2 for chars):**

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

**Expected results — must match exactly:**

| Column | Expected DATA_TYPE | Expected CHARACTER_MAXIMUM_LENGTH | Action if different |
|--------|--------------------|----------------------------------|---------------------|
| `ItemCode` | NVARCHAR | **50** | Raise amendment before proceeding with P5 |
| `ItemName` | NVARCHAR | **100** | Raise amendment before proceeding with P5 |
| `UserText` | NTEXT | **-1 (unlimited)** | Raise amendment before proceeding with P5 |

If any value differs from the expected, halt P5, raise a baseline amendment with the actual values, and adjust validation constants before syncing.

### 3.4 SAP B1 Field Mapping

| THERMOPAC field | SAP B1 field | Confirmed limit | Notes |
|----------------|-------------|----------------|-------|
| `master_items.item_code` | `OITM.ItemCode` | 50 chars | Direct. No transformation. |
| `master_items.short_item_name` | `OITM.ItemName` | 100 chars | Direct. VARCHAR(100) in schema. Hard validated ≤ 100. |
| `master_items.description` | `OITM.UserText` | Unlimited (NTEXT) | Direct. Full auto-generated attrs description. |
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

Verify configured OITG codes match production B1 at go-live gate (P5):

```sql
SELECT ItmsGrpCod, ItmsGrpNam FROM OITB ORDER BY ItmsGrpNam;
```

---

## 4. ItemName Governance — Two-Level Strategy

### 4.1 Why Two Levels Are Required

The system auto-generates a full Generic Requirement string from each attrs form (e.g., `buildControlValveRequirement`, `buildJunctionBoxRequirement`). This string is procurement-rich but regularly reaches 162 characters — far exceeding the confirmed SAP B1 `OITM.ItemName` limit of **100 characters**.

**Silent truncation is prohibited.** A string truncated at 100 characters mid-word produces a corrupt, misleading SAP item name (e.g., `"Pneumatic Diaphragm Actu"` instead of `"Pneumatic Diaphragm Actuator"`).

### 4.2 The Two Fields

| Field | Schema type | Content | Hard limit | SAP destination |
|-------|------------|---------|-----------|----------------|
| `master_items.short_item_name` | `VARCHAR(100)` | Engineering family label — derived from item code segments expanded to readable English | **100 characters. Validated at insert and at SAP sync. Hard error if exceeded. Never truncated.** | `OITM.ItemName` |
| `master_items.description` | `TEXT` (unlimited) | Full auto-generated requirement string from attrs form | Unlimited | `OITM.UserText` (NTEXT, unlimited) |

### 4.3 Short ItemName — Generation Formula

`{GROUP label}, {SUBGROUP label}, {TYPE label}, {SIZE} {UNIT}`

Generated server-side from the same registry that generates the item code. Describes the engineering family, not a specific variant.

If the auto-generated value exceeds 100 characters: **hard backend error, insert rejected, Superuser manual override required. No automatic truncation.**

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

### 4.4 Backend Validation — Hard Rules, No Exceptions

```typescript
// Constants — derived from confirmed SAP B1 10 SQL Server standard limits.
// If the pre-go-live gate (§3.3) reveals different actual values, raise a
// baseline amendment before P5 and update these constants before syncing.
const SAP_ITEM_CODE_MAX = 50;
const SAP_ITEM_NAME_MAX = 100;

function validateItemCode(itemCode: string): void {
  if (itemCode.length > SAP_ITEM_CODE_MAX) {
    throw new Error(
      `ItemCode "${itemCode}" is ${itemCode.length} chars, ` +
      `exceeds SAP B1 limit of ${SAP_ITEM_CODE_MAX}. ` +
      `Sync aborted. Manual override required.`
    );
  }
}

function validateItemName(shortItemName: string): void {
  if (shortItemName.length > SAP_ITEM_NAME_MAX) {
    throw new Error(
      `ItemName "${shortItemName}" is ${shortItemName.length} chars, ` +
      `exceeds SAP B1 limit of ${SAP_ITEM_NAME_MAX}. ` +
      `Insert rejected. Manual override required.`
    );
  }
}
```

`validateItemCode` runs at every SAP sync preflight. `validateItemName` runs at insert time **and** at SAP sync preflight. Both halt the operation — partial sync is never permitted.

---

## 5. Worst-Case ItemName Analysis — All Form Builders

Read directly from production form builder code (`valve-attrs-forms.tsx`, `instrument-attrs-forms.tsx`, `motor-attrs-forms.tsx`, `electrical-attrs-forms.tsx`, `pump-attrs-forms.tsx`, `piping-attrs-forms.tsx`). Character counts verified.

| Form builder | Worst-case full description | Chars | Safe for `OITM.ItemName`? |
|-------------|----------------------------|-------|--------------------------|
| Control valve | `Globe Control Valve, DN 200 (8"), ANSI Class 900, Equal Percentage, SS316 Trim, Pneumatic Diaphragm Actuator, Fail Close (FC), Alloy 20 Body, Flanged RF ANSI B16.5` | **162** | ⚠ No — use `short_item_name` |
| Flameproof junction box | `Flameproof JB, IP66, Die-Cast Aluminium, Stand Mounted, 96 Terminals Screw, 8 Entries (M25), Zone 1 (Gas Group IIC), w/ Nameplate+Tag` | **131** | ⚠ No — use `short_item_name` |
| Pressure transmitter + zone | `Pressure Transmitter, 0–100 bar, 4–20mA + HART, 24V DC Loop Powered, 1/2" NPT Male, SS316L Wetted, IP67, Zone 1 IECEx/ATEX` | **122** | ⚠ No — use `short_item_name` |
| Level transmitter + zone | `Guided Wave Radar Level Transmitter, 0–4000 mm, 4–20mA + HART, 1-1/2" Flanged, SS316L Probe, IP67, Zone 1 IECEx/ATEX` | **117** | ⚠ No — use `short_item_name` |
| General bought-out package | `Nitrogen Generator Package, 50 Nm³/hr 99.5% Purity, Skid Mounted, SS316L, Includes Flow Control + Dryer + PLC Panel` | **113** | ⚠ No — use `short_item_name` |
| MCC panel + zone | `Motor Control Centre, 415V 3Ph 50Hz, 4000A Bus, 50kA SC Rating, IP54, GRP Enclosure, Zone 1 (Gas Group IIC)` | **106** | ⚠ No — use `short_item_name` |
| Temperature transmitter + zone | `Temperature Transmitter, -30–400°C, Type R Thermocouple, 4–20mA HART, Head Mounted, SS316L, Zone 1, Ex ia` | **104** | ⚠ No — use `short_item_name` |
| Motor (fully populated) | `Flameproof TEFC Motor, 110 kW, 415V/3Ph/50Hz, 1450 RPM, IE3, TEFC, Foot and Flange Mounting B3/B5, IP55` | **103** | ⚠ No — use `short_item_name` |
| Instrumentation cable, screened | `Instrumentation Cable, 27 Core x 1.5 mm², 600/1000V, XLPE, SWA, Individual + Overall Screened, IEC 60502` | **103** | ⚠ No — use `short_item_name` |
| Cooling tower | `Cooling Tower, 250 m³/hr, Range 10.0°C, Approach 5.0°C, FRP, Induced Draft, Axial Fan, 11 kW` | 93 | ✓ Yes — but `short_item_name` still used for consistency |
| Safety valve | `Safety Valve, 2" × 3", API 526, Spring Loaded, SS316 Trim, ASME IBR Certified, Flanged RF` | 91 | ✓ Yes |
| Pressure gauge | `Pressure Gauge, 0–16 bar, Glycerine Filled, 100mm Dial, 1/2" NPT Bottom, SS316L, IP65` | 88 | ✓ Yes |
| General purpose junction box | `General Purpose JB, IP65, GRP/FRP, Wall Mounted, 12 Terminals Screw, 4 Entries (M20)` | 87 | ✓ Yes |
| Pump (fully populated) | `Centrifugal Pump, Vertical Turbine, 8-Bowl, 6m Column, 500 m³/hr @ 80m TDH, CS Body` | 85 | ✓ Yes |
| Gate / ball valve (simple) | `Ball Valve, 50 NB, ANSI 150, Full Bore, SS316 Ball, PTFE Seat, Flanged RF` | 74 | ✓ Yes |
| Electrical component | `MCB, 63A, 415V 3Ph 50Hz, 4P, Breaking 36kA, C Curve, IP65, Zone 2` | 67 | ✓ Yes |
| Plate / pipe / flange | `Hastelloy C-276, Plate, 50 mm thk, 2500 × 12000 mm, ASME SA-516` | 65 | ✓ Yes |

**9 of 17 form types regularly exceed 100 characters when fully populated. `short_item_name` is used for `OITM.ItemName` for all item types without exception. The full description always goes to `OITM.UserText`.**

---

## 6. NA Convention — Permanent vs Temporary

### 6.1 TYPE = NA — Permanent

Applied when a subgroup has no meaningful engineering type subdivision. This is a deliberate permanent engineering decision, not a placeholder.

| Item Code | Subgroup | Reason |
|-----------|----------|--------|
| `PUMPS-GEA-NA-005-M3H` | Gear pump | No type distinction within gear pumps |
| `PUMPS-SCR-NA-010-M3H` | Screw pump | No type distinction within screw pumps |
| `PUMPS-HND-NA-010-LPM` | Hand pump | No type distinction within hand pumps |
| `VALVE-NDL-NA-006-NB` | Needle valve | No type distinction within needle valves |

**Permanent. TYPE = NA is the correct, final type for these subgroups.**

### 6.2 SIZE = NA and/or UNIT = NA — Permanent

Applied when the engineering family has no standard numeric size dimension at the family level.

| Item Code | Reason | Size/capacity storage |
|-----------|--------|-----------------------|
| `ELECT-CMP-PLC-NA-NA` | PLC modules: platform, rack, I/O count are Variant attributes — no single family-level size | `item_variants.additional_attributes` JSONB |
| `BOPKG-GEN-NA-NA-NA` | General bought-out packages: capacity and duty are Variant attributes — unique per project | `item_variants.additional_attributes` JSONB |

**Permanent. The NA-NA coding is the correct and intentional final identity for these categories.**

### 6.3 Temporary NA — Pending Form Implementation

| Item Code | Status | DB flag |
|-----------|--------|---------|
| `ELECT-FLD-NA-NA-NA` | Field items attrs form not yet implemented | `item_code_source = 'pending_form'` |

**Temporary placeholder only.** These items are blocked from SAP sync and appear in the SAP sync preflight report until the attrs form is built and records migrated.

---

## 7. Group, Subgroup, Type, Unit Registries

All registries are seeded into the `item_code_registry` table. Full detailed tables are in `docs/item-code-generation-plan-v4.0.md` §§5–9 (authoritative registry reference).

### 7.1 GROUP Codes — Exactly 5 Characters

| GROUP | Label | Category |
|-------|-------|----------|
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

### 7.2 SUBGROUP and TYPE

Full tables in `docs/item-code-generation-plan-v4.0.md` §§6–8. SUBGROUP max 3 characters; TYPE max 3 characters or `NA` when no type distinction applies.

### 7.3 SIZE — Extraction Rules

| Group | Primary SIZE source | Fallback |
|-------|---------------------|---------|
| `PUMPS` | Flow rate (e.g. 1000 LPH) | Motor power in kW (see Q6) |
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

### 7.4 UNIT Registry — Max 4 Characters

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
| **Variant** | Commercial/technical alternative within the same family (different MOC, pressure class, vendor, certifications, model number). No new item code. | `item_variants` |
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

Variants carry: `moc`, `pressure_class`, `flange_standard`, `voltage`, `phase`, `frequency`, `certifications`, `efficiency_class`, `insulation_class`, `ip_rating`, `spec_revision`, `datasheet_gcs_path`, `manufacturer`, `model_number`, `vendor_id`, `additional_attributes` (JSONB).

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
  ADD COLUMN short_item_name    VARCHAR(100),  -- SAP-safe OITM.ItemName. Hard limit = 100. Never truncated.
  ADD COLUMN ic_group           VARCHAR(5),    -- e.g. 'PUMPS'
  ADD COLUMN ic_subgroup        VARCHAR(3),    -- e.g. 'CEN'
  ADD COLUMN ic_type            VARCHAR(3),    -- e.g. 'HOR'
  ADD COLUMN ic_size            VARCHAR(5),    -- e.g. '1000'
  ADD COLUMN ic_unit            VARCHAR(4),    -- e.g. 'LPH'
  ADD COLUMN buy_group_id       INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id    INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source   TEXT;          -- 'auto' | 'manual' | 'migrated' | 'sap_sync' | 'pending_form'
```

**Notes:**
- `short_item_name` is `VARCHAR(100)` — matches the confirmed `OITM.ItemName` limit exactly. The database column itself enforces the ceiling; the application layer also validates before insert and throws, never truncates.
- `sap_item_code` column is **removed** — `master_items.item_code` maps directly to `OITM.ItemCode`. No intermediate column is needed.
- The existing `description` column (PostgreSQL `TEXT`, unlimited) stores the full auto-generated attrs description. No change required.

**`short_item_name` rules:**
- Hard limit: 100 characters — enforced at insert AND at SAP sync preflight.
- Must not be empty for any item synced to SAP.
- Auto-generated from registry at item code generation time.
- Superuser may manually override with audit trail.
- If generated value exceeds 100 chars: hard backend error, insert rejected, no truncation, Superuser manual override required.

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
  → throws Error if result.length > SAP_ITEM_NAME_MAX (100)
  → never truncates

generateAndReserveItemCode(db, groupCode, subgroupCode, technicalAttributes)
  → pg_advisory_xact_lock on (groupCode hash)
  → collision check against master_items
  → buildShortItemName → validateItemName (≤ 100) → throw if violated
  → INSERT master_items { item_code, short_item_name, description, ic_* columns, item_code_source='auto' }
  → release lock
  → return final item_code

validateItemCode(itemCode: string): void
  → if itemCode.length > SAP_ITEM_CODE_MAX (50) → throw; never truncates
  → called at every SAP sync preflight

validateItemName(shortItemName: string): void
  → if shortItemName.length > SAP_ITEM_NAME_MAX (100) → throw; never truncates
  → called at insert AND at every SAP sync preflight
```

**Constants (hardcoded to confirmed SAP B1 10 SQL Server standard limits):**

```typescript
const SAP_ITEM_CODE_MAX = 50;   // OITM.ItemCode NVARCHAR(50)
const SAP_ITEM_NAME_MAX = 100;  // OITM.ItemName NVARCHAR(100)
// OITM.UserText is NTEXT (unlimited) — no constant needed.
// If pre-go-live gate (§3.3) reveals different actual values,
// raise a baseline amendment and update these constants before P5.
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
| `GET` | `/api/admin/sap/preflight` | SAP sync preflight: validate all pending items against `SAP_ITEM_CODE_MAX` and `SAP_ITEM_NAME_MAX`. Returns structured report of all failures. No sync proceeds until report is empty. | Superuser |

---

## 11. Migration and Backfill Strategy

| Phase | Action | Risk | Notes |
|-------|--------|------|-------|
| P0 | Create `item_code_registry` table + seed all GROUP/SUBGROUP/TYPE/UNIT codes | Zero | |
| P0 | Apply all additive schema columns (§9) | Zero | |
| P1 | Implement `item-code-service.ts`: `buildItemCodeSegments`, `buildRawString`, `buildShortItemName`, `generateAndReserveItemCode`, `validateItemCode`, `validateItemName`, preview endpoint | Low | |
| P2 | Reserve endpoint with `pg_advisory_xact_lock` + collision check + hard validation | Medium | |
| P2 | Wire Phase 3 approval → auto-generate item code + short ItemName + store full description | Medium | |
| P3 | Variant CRUD API endpoints | Medium | |
| P3 | Phase 3 selection modal: Variant picker layer | Medium | |
| P3 | UI: item code preview chip, short ItemName display, full description in detail/tooltip | Low | |
| P4 | One-time backfill admin endpoint for existing `master_items` without item codes | Medium | |
| P5 | **Pre-go-live verification gate (§3.3): run SQL Server metadata queries, confirm `ItemCode`=50, `ItemName`=100, `UserText` unlimited.** If values differ, raise amendment before proceeding. | Zero | Gate only — not an implementation blocker |
| P5 | SAP B1 sync: preflight → `ItemCode` + `ItemName` + `UserText` + `OMRP` MPN rows | High | After gate sign-off |

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
| SAP sync preflight run | `sap_preflight_run` | Items checked, items failed, list of failing `item_code` values |
| Pre-go-live gate completed | `sap_golive_gate_passed` | Actual `ItemCode` limit, `ItemName` limit, `UserText` type recorded |

### 12.2 Format Validation Regexes

```
Item code (no suffix):      ^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}$
Item code (with suffix):    ^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}-\d{2}$
```

### 12.3 SAP Sync Preflight Report

`GET /api/admin/sap/preflight` returns all items that would block a sync:

- `item_code` length > 50 (`SAP_ITEM_CODE_MAX`)
- `short_item_name` length > 100 (`SAP_ITEM_NAME_MAX`)
- `short_item_name` is null or empty
- `item_code_source = 'pending_form'` (temporary NA — not ready for SAP)

**No SAP sync proceeds until the preflight report returns zero failures.**

---

## 13. Open Questions — Resolve Before Relevant Phase

SAP field limit confirmation (formerly Q1–Q3) is now the pre-go-live verification gate in §3.3. It does not block any implementation phase — it gates P5 go-live only.

| # | Question | How to resolve | Owner | Blocks |
|---|----------|---------------|-------|--------|
| 1 | **SAP UDF setup.** Configure `U_MOC`, `U_PressClass`, `U_Certs` on OITM, or rely on OMRP + PO line free text only? | Decision by THERMOPAC Finance + SAP admin | THERMOPAC Finance / SAP admin | P5 Variant sync |
| 2 | **Variant approval workflow.** Must Variants be approved (GM / Superuser) before use in Phase 3, or is creation sufficient? | Decision by PM / Process owner | PM / Process owner | P3 Variant CRUD |
| 3 | **`ELECT-CMP-PLC-NA-NA` and `BOPKG-GEN-NA-NA-NA` — confirmed permanent NA-NA (§6.2).** No action required unless disputed. | Ratify or raise objection | — | — |
| 4 | **`ELECT-FLD-NA-NA-NA` — timeline for field items attrs form.** All `pending_form` records are blocked from SAP sync until resolved. | PM / Engineering to set timeline | PM / Engineering | P4 backfill; P5 sync |
| 5 | **Pump SIZE field priority.** When flow rate is not specified: use motor power (kW)? | Engineering lead to confirm | Engineering lead | P1 size extraction |
| 6 | **SAP OITG group codes in production match §3.5.** | Run: `SELECT ItmsGrpCod, ItmsGrpNam FROM OITB ORDER BY ItmsGrpNam` on production SAP SQL Server DB. Confirm at pre-go-live gate. | THERMOPAC Finance / SAP | P5 |

---

## 14. Document Control

| Version | Date | Description |
|---------|------|-------------|
| v4.0 | 2026-05-11 | Initial approved plan. GROUP codes (5 chars), full registry, code matrix, Variant architecture. |
| v5.0 | 2026-05-11 | SAP ItemName length governance. Two-level description strategy. NA-NA clarification. Worst-case analysis (17 form builders). |
| v5.1 | 2026-05-11 | Platform correction: SQL Server (not HANA). CUFD removed. SQL Server metadata queries added. |
| Baseline v1.0 | 2026-05-11 | First consolidated approved baseline. All v4.0–v5.1 content unified. |
| **Baseline v1.1** | **2026-05-11** | **SAP limits confirmed as design baseline (`ItemCode`=50, `ItemName`=100, `UserText`=unlimited). `sap_item_code` column removed. `short_item_name` changed to `VARCHAR(100)`. Direct field mappings confirmed. Validation constants hardcoded. SQL Server verification moved to mandatory pre-go-live gate (§3.3), not an implementation blocker.** |

*This document is frozen at v1.1. Any deviation requires a versioned amendment approved by management before implementation.*
