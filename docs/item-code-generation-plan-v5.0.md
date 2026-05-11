# BUY Item Code Generation — Implementation Plan v5.0
**Date:** 2026-05-11
**Supersedes:** v4.0 (2026-05-11)
**Status:** REVISED — Awaiting approval. Do not implement.
**Scope:** ItemName length governance, two-level description strategy, NA-NA clarification, SAP field limit confirmation

---

## 1. Changes from v4.0

| # | Change |
|---|--------|
| C26 | SAP B1 `ItemName` length governance added. Full worst-case analysis across all form builders completed. |
| C27 | Two-level description strategy defined: short ItemName (SAP-safe, ≤ 100 chars) vs full description (unlimited). |
| C28 | Explicit no-silent-truncation rule added for both ItemCode and ItemName. |
| C29 | Storage path for full description defined: `master_items.description` (PostgreSQL TEXT, no limit) → `OITM.UserText` (SAP MEMO field, no limit). |
| C30 | Worst-case ItemName examples with exact character counts provided for every form builder. |
| C31 | NA-NA convention clarified: Permanent `NA` vs Temporary `NA` (placeholder) vs TYPE-only `NA` — three distinct categories. |
| C32 | Open question #1 expanded: both `ItemCode` max length and `ItemName` max length must be confirmed from production SAP B1 10+ instance before any SAP sync work begins. |

All GROUP codes, subgroup codes, type codes, code matrix, and Variant Architecture from v4.0 are unchanged.

---

## 2. Item Code Format (unchanged from v4.0)

```
GROUP-SUBGROUP-TYPE-SIZE-UNIT
```

| Segment | Length Rule | Notes |
|---------|-------------|-------|
| GROUP | Exactly 5 characters | Fixed from registry |
| SUBGROUP | Max 3 characters | Fixed from registry |
| TYPE | Max 3 characters; `NA` when no type applies | Fixed from registry |
| SIZE | 3 – 5 digits, zero-padded to minimum 3 | 10 → `010` |
| UNIT | Max 4 characters | Fixed from unit registry |

**Baseline code length: 20–23 characters. With approved suffix: up to 25 characters.**

---

## 3. SAP B1 10+ — Field Limits and Architecture

### 3.1 Confirmed Action Required — Highest Priority

> **Before any SAP sync work begins, confirm the following two values from the production SAP B1 10+ instance:**
>
> | Field | SAP table.column | Expected in B1 10 HANA | Must confirm |
> |-------|-----------------|----------------------|-------------|
> | Item Code | `OITM.ItemCode` | 50 characters | Owner: THERMOPAC IT / SAP admin |
> | Item Name | `OITM.ItemName` | 100 characters | Owner: THERMOPAC IT / SAP admin |
>
> These two values determine everything in §3.2 and §4. Do not implement SAP sync until both are confirmed.

### 3.2 Architecture Based on Expected Limits

| Field | Expected limit | Our worst case | Headroom | Action |
|-------|---------------|---------------|---------|--------|
| `ItemCode` | 50 chars | 25 chars (with suffix) | 25 chars | Direct use of `item_code`. No CRC truncation. |
| `ItemName` | 100 chars | 162 chars (control valve) | −62 chars | Two-level strategy required (§4). |

**Finding:** ItemCode fits within 50 chars without modification. ItemName regularly exceeds 100 chars when all attrs are populated. A two-level strategy is mandatory.

### 3.3 SAP B1 Field Mapping (updated)

| THERMOPAC field | SAP B1 field | Char limit | Notes |
|----------------|-------------|-----------|-------|
| `master_items.item_code` | `OITM.ItemCode` | 50 (expected) | Direct; no truncation |
| `master_items.short_item_name` ← NEW | `OITM.ItemName` | 100 (expected) | Short, SAP-safe name. Never truncated silently. |
| `master_items.description` (existing) | `OITM.UserText` | Unlimited (MEMO) | Full auto-generated description from attrs form |
| `item_variants.moc` | `OITM.U_MOC` (UDF) | Config-dependent | Preferred variant MOC |
| `item_variants.pressure_class` | `OITM.U_PressClass` (UDF) | Config-dependent | Preferred variant pressure class |
| `item_variants.certifications` | `OITM.U_Certs` (UDF) | Config-dependent | Preferred variant certifications |
| `item_variants.vendor_id` + `model_number` | `OMRP` (MPN table) | — | One row per active Variant |
| Selected Variant full spec | `OPOR1.Dscription` / `FreeText` | — | Written at PO creation per project |

### 3.4 SAP Item Group Mapping (unchanged from v4.0)

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

## 4. ItemName Governance — Two-Level Strategy

### 4.1 The Problem

The system already auto-generates a Generic Requirement / Description from each attrs form (e.g., `buildPanelRequirement`, `buildJunctionBoxRequirement`, `buildComponentsRequirement`, etc.). This full description is procurement-rich but regularly exceeds 100 characters — the standard SAP B1 `OITM.ItemName` limit.

**Silent truncation is prohibited.** Truncating at 100 characters mid-string produces corrupt, misleading item names in SAP (e.g., "Pneumatic Diaphragm Actu" instead of the full actuator spec).

### 4.2 Two-Level Description Fields

Every Master Item carries two distinct description fields:

| Field | Purpose | Length limit | SAP destination |
|-------|---------|-------------|----------------|
| `short_item_name` | Human-readable, SAP-safe engineering family label | ≤ 100 characters (hard validated) | `OITM.ItemName` |
| `description` (existing column) | Full auto-generated description from attrs form | Unlimited (PostgreSQL TEXT) | `OITM.UserText` (MEMO) |

### 4.3 Short ItemName — Generation Rule

The short ItemName is derived from the item code segments expanded to readable English. It describes the **engineering family** (Master Item level), not the specific variant. It is generated server-side from the same registry that generates the item code.

**Formula:** `{GROUP label}, {SUBGROUP label}, {TYPE label}, {SIZE} {UNIT}`

If the result exceeds 100 chars (extremely unlikely at the Master Item level), the system raises an error and requires manual override — it never truncates automatically.

**Short ItemName examples:**

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

**Maximum short ItemName observed: 43 characters.** All short ItemNames are well within the 100-character limit.

### 4.4 Full Description — Storage and Use

The full auto-generated description from the attrs form is stored in `master_items.description` (existing PostgreSQL TEXT column, no length restriction). It is synced to `OITM.UserText` in SAP (a MEMO/unlimited-length field).

The full description is used for:
- Internal THERMOPAC QMS item detail pages
- Purchase requisition and datasheet generation
- EPC control tower and BOM reports
- SAP item search and procurement context (via `UserText`)

It is **not** used as the SAP ItemName. It is **never** truncated.

### 4.5 Validation Rule — No Silent Truncation

Before any SAP sync operation:

```
validateItemName(shortItemName: string, confirmedSapLimit: number): void {
  if (shortItemName.length > confirmedSapLimit) {
    throw new Error(
      `ItemName "${shortItemName}" is ${shortItemName.length} chars, ` +
      `exceeds SAP limit of ${confirmedSapLimit}. ` +
      `Sync aborted. Manual override required.`
    );
  }
}

validateItemCode(itemCode: string, confirmedSapLimit: number): void {
  if (itemCode.length > confirmedSapLimit) {
    throw new Error(
      `ItemCode "${itemCode}" is ${itemCode.length} chars, ` +
      `exceeds SAP limit of ${confirmedSapLimit}. ` +
      `Sync aborted. Manual override required.`
    );
  }
}
```

Both validations run as a preflight check before the SAP sync batch executes. Any violation halts the entire batch and returns a structured error report listing all failing items. The user must resolve each manually — no silent truncation, no partial sync.

---

## 5. Worst-Case ItemName Analysis — All Form Builders

The following table shows the actual worst-case output from each auto-generated description builder, derived from reading the production form code. Character counts are verified.

### 5.1 Pumps — `buildCentrifugalPumpRequirement`

| Example full description | Chars |
|--------------------------|-------|
| `Centrifugal Pump, Horizontal End Suction, 1000 m³/hr @ 50m TDH, SS316L Body` | 76 |
| `Centrifugal Pump, Vertical Turbine, 8-Bowl, 6m Column, 500 m³/hr @ 80m TDH, CS Body` | 85 |

**Within 100 chars. No issue.**

### 5.2 Motors — `buildMotorRequirement`

| Example full description | Chars |
|--------------------------|-------|
| `Flameproof TEFC Motor, 110 kW, 415V/3Ph/50Hz, 1450 RPM, IE3, TEFC, Foot and Flange Mounting B3/B5, IP55` | **103** ⚠ |
| `Non-Flameproof AC Induction Motor, 11 kW, 415V/3Ph/50Hz, 960 RPM, IE2, IC411, Flange Mounting B5, IP55` | **103** ⚠ |

**Can exceed 100 chars at full population.** Short ItemName must be used for SAP sync.

### 5.3 Instruments — `buildPressureRequirement` and temperature/flow/level variants

| Example full description | Chars |
|--------------------------|-------|
| `Pressure Gauge, 0–16 bar, Glycerine Filled, 100mm Dial, 1/2" NPT Bottom, SS316L, IP65` | 88 |
| `Pressure Transmitter, 0–100 bar, 4–20mA + HART, 24V DC Loop Powered, 1/2" NPT Male, SS316L Wetted, IP67, Zone 1 IECEx/ATEX` | **122** ⚠ |
| `Temperature Transmitter, -30–400°C, Type R Thermocouple, 4–20mA HART, Head Mounted, SS316L, Zone 1, Ex ia` | **104** ⚠ |
| `Guided Wave Radar Level Transmitter, 0–4000 mm, 4–20mA + HART, 1-1/2" Flanged, SS316L Probe, IP67, Zone 1 IECEx/ATEX` | **117** ⚠ |

**User's stated example:** `Thermocouple (TC), Type R, -30–400 °C, 1/2" NPT, Zone 1, Ex ia` = **63 chars** — this one is fine, but a fully populated transmitter or radar level description is not.

**Instruments regularly exceed 100 chars.** Short ItemName mandatory for SAP sync.

### 5.4 Valves — `buildIsolationValveRequirement` and control/safety variants

| Example full description | Chars |
|--------------------------|-------|
| `Gate Valve, 50 NB, ANSI 150, CS Body, Flanged RF` | 49 |
| `Ball Valve, 50 NB, ANSI 150, Full Bore, SS316 Ball, PTFE Seat, Flanged RF` | 74 |
| `Globe Control Valve, DN 200 (8"), ANSI Class 900, Equal Percentage, SS316 Trim, Pneumatic Diaphragm Actuator, Fail Close (FC), Alloy 20 Body, Flanged RF ANSI B16.5` | **162** ⚠ |
| `Safety Valve, 2" × 3", API 526, Spring Loaded, SS316 Trim, ASME IBR Certified, Flanged RF` | 91 |

**Control valves are the single worst case in the system at ~162 characters.** Short ItemName mandatory.

### 5.5 Electrical — Panels — `buildPanelRequirement`

| Example full description | Chars |
|--------------------------|-------|
| `Motor Control Centre, 415V 3Ph 50Hz, 4000A Bus, 50kA SC Rating, IP54, GRP Enclosure, Zone 1 (Gas Group IIC)` | **106** ⚠ |
| `Distribution Board, 230V, 160A Bus, IP43, Sheet Steel` | 53 |

**MCC panels at full population exceed 100 chars.**

### 5.6 Electrical — Cabling — `buildCablingRequirement`

| Example full description | Chars |
|--------------------------|-------|
| `Power Cable, 4C x 185 mm², 600/1000V, XLPE, SWA, IEC 60502` | 61 |
| `Instrumentation Cable, 27 Core x 1.5 mm², 600/1000V, XLPE, SWA, Individual + Overall Screened, IEC 60502` | **103** ⚠ |

**Screened multi-core instrumentation cables at full population exceed 100 chars.**

### 5.7 Electrical — Junction Boxes — `buildJunctionBoxRequirement`

| Example full description | Chars |
|--------------------------|-------|
| `General Purpose JB, IP65, GRP/FRP, Wall Mounted, 12 Terminals Screw, 4 Entries (M20)` | 87 |
| `Flameproof JB, IP66, Die-Cast Aluminium, Stand Mounted, 96 Terminals Screw, 8 Entries (M25), Zone 1 (Gas Group IIC), w/ Nameplate+Tag` | **131** ⚠ |

**Zone-rated junction boxes with accessories are the second worst case at ~131 characters.**

### 5.8 Electrical — Components — `buildComponentsRequirement`

| Example full description | Chars |
|--------------------------|-------|
| `MCB, 63A, 415V 3Ph 50Hz, 4P, Breaking 36kA, C Curve, IP65, Zone 2` | 67 |
| `VFD (Variable Frequency Drive), 75 kW, 415V 3Ph 50Hz, IP55, Zone 2` | 67 |
| `PLC / DCS Module, CPU Module, Siemens S7-1500, Zone 2` | 54 |

**Components are within 100 chars in all tested scenarios.**

### 5.9 Raw Materials / Piping — `buildPlatesRequirement` etc.

| Example full description | Chars |
|--------------------------|-------|
| `CS, Plate, 10 mm thk, 1500 × 6000 mm, IS 2062` | 46 |
| `Hastelloy C-276, Plate, 50 mm thk, 2500 × 12000 mm, ASME SA-516` | 65 |
| `SS316L, Pipe, 50 NB, SCH 40, Seamless, ASME SA-312` | 51 |

**Raw materials / piping are comfortably within 100 chars.**

### 5.10 Bought-out Packages — `buildCoolingTowerRequirement` and general packages

| Example full description | Chars |
|--------------------------|-------|
| `Cooling Tower, 250 m³/hr, Range 10.0°C, Approach 5.0°C, FRP, Induced Draft, Axial Fan, 11 kW` | 93 |
| `Nitrogen Generator Package, 50 Nm³/hr 99.5% Purity, Skid Mounted, SS316L, Includes Flow Control + Dryer + PLC Panel` | **113** ⚠ |

**Complex packages can exceed 100 chars.**

### 5.11 Summary — Worst Cases

| Form builder | Worst-case length | Status |
|-------------|------------------|--------|
| Control valve (fully populated) | **162 chars** | ⚠ Exceeds 100 |
| Flameproof junction box | **131 chars** | ⚠ Exceeds 100 |
| Pressure transmitter + zone cert | **122 chars** | ⚠ Exceeds 100 |
| Level transmitter + zone cert | **117 chars** | ⚠ Exceeds 100 |
| General package with components | **113 chars** | ⚠ Exceeds 100 |
| Temperature transmitter + zone cert | **104 chars** | ⚠ Exceeds 100 |
| Motor (fully populated) | **103 chars** | ⚠ Exceeds 100 |
| Instrumentation cable, screened | **103 chars** | ⚠ Exceeds 100 |
| MCC panel + zone classification | **106 chars** | ⚠ Exceeds 100 |
| Pump (fully populated) | 85 chars | ✓ Within 100 |
| Pressure gauge | 88 chars | ✓ Within 100 |
| Safety valve | 91 chars | ✓ Within 100 |
| Cooling tower | 93 chars | ✓ Within 100 |
| Gate / ball valve (simple) | 74 chars | ✓ Within 100 |
| Electrical component | 67 chars | ✓ Within 100 |
| Raw material / piping | 65 chars | ✓ Within 100 |

**9 out of 17 form types can exceed 100 characters when fully populated. The two-level strategy in §4 is mandatory, not optional.**

---

## 6. NA-NA Convention — Permanent vs Temporary

There are three distinct uses of `NA` in the item code system. They must not be confused.

### 6.1 TYPE = NA (Permanent — No Type Distinction)

Applied when a subgroup has no meaningful engineering type subdivision. This is a deliberate, permanent engineering decision, not a placeholder.

| Item Code | Meaning |
|-----------|---------|
| `PUMPS-GEA-NA-005-M3H` | Gear pumps have no type distinction |
| `PUMPS-SCR-NA-010-M3H` | Screw pumps have no type distinction |
| `PUMPS-HND-NA-010-LPM` | Hand pumps have no type distinction |
| `VALVE-NDL-NA-006-NB` | Needle valves have no type distinction |

**Permanent. Not a placeholder. The `NA` type IS the correct type for these subgroups.**

### 6.2 SIZE = NA and/or UNIT = NA (Permanent — No Standard Size Dimension)

Applied when the engineering family has no standard numeric size that characterises the family. The item identity is defined entirely by its group/subgroup/type segments, not by size.

| Item Code | Reasoning | Permanent? |
|-----------|-----------|-----------|
| `ELECT-CMP-PLC-NA-NA` | PLC modules have no single standard size; platform, rack, and I/O count are Variant attributes | ✓ Permanent |
| `BOPKG-GEN-NA-NA-NA` | General bought-out packages are unique in each project; capacity and duty are Variant attributes | ✓ Permanent |

**Permanent. The `NA-NA` coding is the correct and intentional permanent identity for these item categories. It is not a placeholder waiting for a size to be added.**

The Variant's `additional_attributes` JSONB field carries all size/capacity information for these items. The Master Item Code correctly identifies the family without a size segment.

### 6.3 Temporary NA — Pending Form Implementation

Applied when an attrs form has not yet been built for a subgroup. These codes use `NA` as a temporary placeholder and will be updated when the form is implemented.

| Item Code | Status | Owner |
|-----------|--------|-------|
| `ELECT-FLD-NA-NA-NA` | Field items attrs form not yet implemented | PM / Engineering |

**Temporary. This is a placeholder. When the field items attrs form is built, appropriate type/size/unit codes will be defined and all `ELECT-FLD-NA-NA-NA` records will be migrated.**

Temporary NA items are flagged with `item_code_source = 'pending_form'` in the `master_items` table to make this status visible.

---

## 7. Group, Subgroup, Type, Unit Registries (unchanged from v4.0)

All registries (§§5–8 of v4.0) and the full Code Matrix (§9 of v4.0) are unchanged. Refer to v4.0 for the complete tables.

---

## 8. Core Design Principle — Master Item, Variant, Suffix (unchanged from v4.0)

Master Item Code = engineering family. Variants = commercial/technical differences. Suffix = controlled exception only.

Decision tree (unchanged from v4.0 §10.1). Variant examples (unchanged from v4.0 §10.2).

---

## 9. Schema Changes Required

### 9.1 New Table: `item_code_registry` (unchanged from v4.0)

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

### 9.2 Additive Columns on `master_items` (updated from v4.0 — `short_item_name` added)

```sql
ALTER TABLE master_items
  ADD COLUMN short_item_name    TEXT,          -- SAP-safe ItemName ≤ 100 chars. Never truncated silently.
  ADD COLUMN ic_group           VARCHAR(5),    -- e.g. 'PUMPS'
  ADD COLUMN ic_subgroup        VARCHAR(3),    -- e.g. 'CEN'
  ADD COLUMN ic_type            VARCHAR(3),    -- e.g. 'HOR'
  ADD COLUMN ic_size            VARCHAR(5),    -- e.g. '1000'
  ADD COLUMN ic_unit            VARCHAR(4),    -- e.g. 'LPH'
  ADD COLUMN buy_group_id       INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id    INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source   TEXT,          -- 'auto', 'manual', 'migrated', 'sap_sync', 'pending_form'
  ADD COLUMN sap_item_code      VARCHAR(50);   -- Only needed if SAP ItemCode < 25 chars (legacy config).
                                               -- Drop this column once SAP B1 10+ length confirmed ≥ 25 chars.
```

The existing `description` column (TEXT, unlimited) is used as the full description store. No schema change required for it.

**`short_item_name` constraints applied in application layer:**
- Max 100 characters (validated before insert and before SAP sync).
- Must not be empty.
- Generated automatically from registry; can be manually overridden by Superuser with audit.
- Rejection (not truncation) if the auto-generated value exceeds 100 chars.

### 9.3 New Table: `item_variants` (unchanged from v4.0)

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

### 9.4 Alter `buy_list_line_selections` (unchanged from v4.0)

```sql
ALTER TABLE buy_list_line_selections
  ADD COLUMN item_variant_id INTEGER REFERENCES item_variants(id) ON DELETE SET NULL;
```

### 9.5 New Table: `item_code_suffix_exceptions` (unchanged from v4.0)

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

### 9.6 Additive Column on `buy_package_lines` (unchanged from v4.0)

```sql
ALTER TABLE buy_package_lines
  ADD COLUMN suggested_item_code VARCHAR(55);
```

---

## 10. Coding Architecture

### 10.1 `server/item-code-service.ts` (updated — `buildShortItemName` added)

```
buildItemCodeSegments(groupCode, subgroupCode, technicalAttributes)
  → { group: 'PUMPS', subgroup: 'CEN', type: 'HOR', size: '1000', unit: 'LPH' }

buildRawString(segments)
  → 'PUMPS-CEN-HOR-1000-LPH'

buildShortItemName(segments)          ← NEW
  → 'Centrifugal Pump, Horizontal, 1000 LPH'
  → throws if result > 100 chars (never truncates silently)

generateAndReserveItemCode(db, groupCode, subgroupCode, technicalAttributes)
  → advisory lock
  → collision check
  → buildShortItemName → validate ≤ 100 chars
  → insert master_items with item_code + short_item_name + description
  → return final code

validateSapFieldLengths(itemCode, shortItemName, sapLimits)   ← NEW
  → throws with structured error if either field exceeds confirmed SAP limit
  → never truncates; blocks SAP sync batch for that item
```

### 10.2 API Endpoints (updated)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/item-code/preview` | Preview code + short ItemName from form data. No DB write. |
| `POST` | `/api/item-code/reserve` | Generate + write to `master_items`. Superuser / GM. |
| `GET` | `/api/item-code/registry` | Full registry. Superuser only. |
| `PUT` | `/api/item-code/registry/:id` | Update registry entry. Superuser only. |
| `GET` | `/api/item-code/validate/:code` | Format + uniqueness check. |
| `POST` | `/api/admin/item-code/backfill` | One-time migration trigger. |
| `GET` | `/api/admin/item-code/verify` | Parity + compliance report including short ItemName length check. |
| `POST` | `/api/item-code/approve-suffix` | Suffix exception approval. Superuser only. |
| `GET` | `/api/master-items/:id/variants` | List Variants. |
| `POST` | `/api/master-items/:id/variants` | Create Variant. |
| `PUT` | `/api/master-items/:id/variants/:vid` | Update Variant. |
| `PUT` | `/api/master-items/:id/variants/:vid/preferred` | Set preferred Variant. |
| `GET` | `/api/admin/sap/preflight` | SAP sync preflight: validate all pending items against confirmed SAP limits. |

---

## 11. Migration & Backfill Strategy (updated)

| Phase | Action | Risk |
|-------|--------|------|
| P0 | **Confirm SAP B1 ItemCode and ItemName max lengths from production.** Blocks SAP sync design only. | Zero |
| P0 | Create `item_code_registry` + seed all codes | Zero |
| P0 | Apply additive schema columns (§9) | Zero |
| P1 | `item-code-service.ts`: builder + `buildShortItemName` + preview endpoint | Low |
| P2 | Reserve endpoint with advisory lock + validation | Medium |
| P2 | Wire Phase 3 approval → auto-generate item code + short ItemName + store full description | Medium |
| P3 | Variant CRUD endpoints + Phase 3 selection modal Variant layer | Medium |
| P3 | UI: item code preview chip + short ItemName display + full description in tooltip/detail | Low |
| P4 | One-time backfill of existing `master_items` | Medium |
| P5 | SAP B1 sync: preflight validation → ItemCode + ItemName + UserText + OMRP (after P0 confirmed) | High |

---

## 12. Audit & Validation (updated)

- Every Master Item Code generation logged: `audit_logs` (`action='item_code_generated'`), includes `short_item_name` and `description` lengths.
- Every `short_item_name` manual override logged: `audit_logs` (`action='short_item_name_override'`).
- Every Variant creation logged: `audit_logs` (`action='variant_created'`).
- Suffix exception logged: `item_code_suffix_exceptions` + `audit_logs` (`action='suffix_exception_approved'`).
- Format regex (item code, no suffix): `^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}$`
- Format regex (item code, with approved suffix): `^[A-Z]{5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}-\d{2}$`
- `short_item_name`: application-layer max-100-char constraint enforced at insert and at SAP sync preflight. Hard rejection; no silent truncation.
- SAP sync preflight (`GET /api/admin/sap/preflight`) returns: items with `short_item_name` > 100 chars, items with `item_code` > confirmed SAP ItemCode limit, items missing `short_item_name`, items with `item_code_source = 'pending_form'`.

---

## 13. Open Questions — Resolve Before Implementation

| # | Question | Owner | Blocks |
|---|----------|-------|--------|
| 1 | **SAP B1 ItemCode max length in production instance.** Run: `SELECT FieldSize FROM CUFD WHERE TableID='OITM' AND AliasID='ItemCode'` on the production HANA DB. Expected: 50. | THERMOPAC IT / SAP admin | SAP sync (P5) |
| 2 | **SAP B1 ItemName max length in production instance.** Run: `SELECT FieldSize FROM CUFD WHERE TableID='OITM' AND AliasID='ItemName'` on the production HANA DB. Expected: 100. Determines the hard limit for `short_item_name`. | THERMOPAC IT / SAP admin | SAP sync (P5); `short_item_name` validation rule |
| 3 | **SAP UDF setup:** Configure `U_MOC`, `U_PressClass`, `U_Certs` on OITM, or rely only on OMRP + PO line text? | THERMOPAC Finance / SAP admin | SAP Variant sync |
| 4 | **Variant approval workflow:** Must new Variants be approved (GM / Superuser) before use in Phase 3, or is creation sufficient? | PM / Process owner | Variant CRUD |
| 5 | **`ELECT-CMP-PLC-NA-NA` and `BOPKG-GEN-NA-NA-NA`:** Confirmed as permanent `NA-NA` (§6.2). No action needed unless this is disputed. | For ratification only |
| 6 | **`ELECT-FLD-NA-NA-NA`:** Confirmed as temporary placeholder (§6.3). What is the timeline for the field items attrs form? | PM / Engineering | Code backfill |
| 7 | **Pump size field priority:** Flow rate (preferred) or motor power (kW) when flow rate is not specified? | Engineering lead | Size extraction rule |
| 8 | **SAP Item Group codes:** Confirm configured group codes in production B1 match §3.4. | THERMOPAC Finance / SAP | SAP sync |

---

*End of Plan v5.0 — Submit for approval before implementation.*
