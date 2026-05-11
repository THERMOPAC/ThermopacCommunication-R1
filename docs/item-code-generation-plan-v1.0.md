# BUY Item Code Generation — Implementation Plan v1.0
**Date:** 2026-05-11  
**Status:** PLAN ONLY — not yet implemented  
**Scope:** Automatic, server-controlled, unique Item Code generation for all BUY Package Catalog items

---

## 1. Executive Summary

Every item in the THERMOPAC BUY catalog (master items selected for `project_buy_list_lines`) must carry a structured, deterministic, unique Item Code generated exclusively by the server. The code encodes the item's procurement classification, type, and key size/rating so it is human-readable and machine-sortable. It integrates with SAP B1's Item Master (`OITM`) and prevents duplicates through a combination of structural uniqueness and a DB-enforced unique index.

---

## 2. Item Code Format

```
{SEG1}-{SEG2}-{TYP}-{SIZE}-{UNIT}
```

| Segment | Width | Description | Source |
|---------|-------|-------------|--------|
| SEG1 | 4 chars | Group abbreviation (most groups) OR Subgroup abbreviation (raw materials) | Group/Subgroup registry |
| SEG2 | 4 chars | Subgroup abbreviation (most groups) OR Material/grade code (raw materials) | Subgroup/Material registry |
| TYP | 2–4 chars | Type code from `technicalAttributes`; `NA` when no type field exists for the subgroup | Type code registry |
| SIZE | 1–12 chars | Normalized size or rating value (numeric or alphanumeric, no spaces) | Size normalization rules |
| UNIT | 2–6 chars | Unit of the size measurement (from UOM master or inline) | Unit normalization |

**Examples:**

| Item | Code |
|------|------|
| Centrifugal pump, horizontal, 1000 LPH | `PUMP-CENT-HOR-1000-LPH` |
| CS plate, 10 mm thick | `PLAT-CS-NA-10-MM` |
| SS seamless pipe, 50 NB | `PIPE-SS-SML-50-NB` |
| Non-flameproof motor, 15 kW, 4-pole | `MOTR-NFPM-ACI-15-KW` |
| Safety valve, spring-loaded, 1 inch | `VALV-SAFE-SPL-1-IN` |
| MCC panel, 415V | `ELEC-PANL-MCC-415-V` |
| VFD component, 11 kW | `ELEC-COMP-VFD-11-KW` |
| RTD temperature instrument | `INST-TEMP-RTD-100-MM` |

**Maximum item code length: 32 characters** (4+1+4+1+4+1+12+1+6 = 34 chars absolute worst case).  
SAP B1 compatibility: see Section 9.

---

## 3. Group & Subgroup Code Registry

### 3.1 Group Abbreviations (SEG1 for all non–raw-material groups)

| Group Code (DB) | Label | SEG1 Abbr |
|-----------------|-------|-----------|
| `raw_materials` | Raw Materials | *(SEG1 = Subgroup abbr — see §3.3)* |
| `pumps` | Pumps | `PUMP` |
| `motors` | Motors | `MOTR` |
| `instruments` | Instruments | `INST` |
| `valves` | Valves | `VALV` |
| `electrical_control` | Electrical / Control | `ELEC` |
| `bought_out_packages` | Bought-out Packages | `BOPK` |

### 3.2 Subgroup Abbreviations (SEG2 for all non–raw-material groups)

| Subgroup Code (DB) | Label | SEG2 Abbr |
|-------------------|-------|-----------|
| `centrifugal` | Centrifugal | `CENT` |
| `gear` | Gear | `GEAR` |
| `screw` | Screw | `SCRW` |
| `multistage` | Multistage | `MULT` |
| `dosing_metering` | Dosing / Metering | `DOSM` |
| `vacuum_boosters` | Vacuum Boosters | `VACB` |
| `pump_skid` | Pump Skid Packages | `PSKD` |
| `vacuum_pump` | Vacuum Pump | `VACP` |
| `hand_pump` | Hand Pump | `HNDP` |
| `non_flameproof` | Non-Flameproof Motor | `NFPM` |
| `flameproof` | Flameproof Motor | `FLPM` |
| `pressure` | Pressure Instruments | `PRES` |
| `temperature` | Temperature Instruments | `TEMP` |
| `flow` | Flow Instruments | `FLOW` |
| `level` | Level Instruments | `LEVL` |
| `isolation` | Isolation Valve | `ISOL` |
| `control` | Control Valve | `CTRL` |
| `safety` | Safety Valve | `SAFE` |
| `on_off` | ON/OFF Valve | `ONOF` |
| `nrv` | Non-Return Valve | `NRVV` |
| `needle` | Needle Valve | `NEDL` |
| `panels` | Panels | `PANL` |
| `components` | Components | `COMP` |
| `field_items` | Field Items | `FDIT` |
| `cabling` | Cabling | `CABL` |
| `junction_box` | Junction Box | `JBOX` |
| `general` | General Bought-out | `GENL` |
| `cooling_tower` | Cooling Tower | `COLT` |

### 3.3 Raw Materials — Special Dual-Segment Encoding

For raw materials, SEG1 = the subgroup abbreviation and SEG2 = the material/grade code. This avoids a redundant `RAWM` prefix and matches engineering convention.

| Subgroup | SEG1 | SEG2 source (from `technicalAttributes.material_of_construction` or `grade`) |
|----------|------|---------------|
| `plates` | `PLAT` | `CS`, `SS304`, `SS316`, `DSS`, `HAS`, `TIT`, `NA` |
| `pipes` | `PIPE` | `CS`, `SS304`, `SS316`, `DSS`, `GI`, `NA` |
| `fittings` | `FITT` | `CS`, `SS304`, `SS316`, `DSS`, `NA` |
| `flanges` | `FLAN` | `CS`, `SS304`, `SS316`, `DSS`, `NA` |
| `fasteners` | `FAST` | `CS`, `SS304`, `SS316`, `HT`, `NA` |
| `gaskets` | `GASK` | `GRPH`, `PTFE`, `SPWD`, `RING`, `NA` |
| `structural_steel` | `STST` | `MS`, `GI`, `SS`, `NA` |

Material code normalization (from `technicalAttributes`):

| Input value (case-insensitive) | Normalized Material Code |
|-------------------------------|--------------------------|
| Carbon Steel / CS / A516 / SA516 | `CS` |
| SS 304 / 304 / 1.4301 | `SS304` |
| SS 316 / 316L / 1.4404 | `SS316` |
| Duplex / 2205 / UNS S32205 | `DSS` |
| Hastelloy / HAS / C276 | `HAS` |
| Titanium / TI | `TIT` |
| Galvanised Iron / GI | `GI` |
| Mild Steel / MS | `MS` |
| High Tensile / HT | `HT` |
| Graphite / spiral wound / GRPH | `GRPH` |
| PTFE / Teflon | `PTFE` |
| Spiral Wound | `SPWD` |
| Ring Joint | `RING` |
| *(unknown/other)* | `NA` |

---

## 4. Type Code Registry

When a subgroup has no meaningful type distinction, TYP = `NA`.  
Type codes are extracted from `technicalAttributes` at generation time.

### 4.1 Pumps

| Attribute field | Input value | TYP Code |
|-----------------|-------------|----------|
| `pump_type` | Horizontal | `HOR` |
| `pump_type` | Vertical | `VRT` |
| `pump_type` | Submersible | `SUB` |
| `pump_type` | Self-Priming | `SPR` |
| `pump_type` | End Suction | `ENS` |
| `pump_type` | Split Case | `SPC` |
| `pump_type` | Monoblock | `MNB` |
| `pump_type` | In-Line | `INL` |
| *(pump_skid, hand_pump, vacuum_pump — no type)* | — | `NA` |

### 4.2 Motors

| Attribute field | Input value | TYP Code |
|-----------------|-------------|----------|
| `motor_type` | AC Induction / Squirrel Cage | `ACI` |
| `motor_type` | Slip Ring | `SLR` |
| `motor_type` | Synchronous | `SYN` |
| `motor_type` | Permanent Magnet | `PMG` |
| *(no type specified)* | — | `ACI` *(default for motors)* |

### 4.3 Instruments

**Pressure:**

| `instrument_type` | TYP |
|-------------------|-----|
| Bourdon Tube Gauge / Gauge | `BRD` |
| Pressure Transmitter | `PTX` |
| Pressure Switch | `PSW` |
| Differential Pressure Transmitter | `DPT` |
| Pressure Indicator | `PIT` |
| *(unknown)* | `NA` |

**Temperature:**

| `instrument_type` | TYP |
|-------------------|-----|
| Thermocouple | `TCC` |
| RTD | `RTD` |
| Temperature Transmitter | `TTX` |
| Temperature Switch | `TSW` |
| Temperature Indicator | `TID` |
| Bimetallic / Dial Thermometer | `BIM` |
| *(unknown)* | `NA` |

**Flow:**

| `instrument_type` | TYP |
|-------------------|-----|
| Magnetic / Electromagnetic | `MAG` |
| Vortex | `VTX` |
| Orifice Plate | `ORP` |
| Rotameter / Variable Area | `ROT` |
| Turbine | `TRB` |
| Ultrasonic | `ULT` |
| Coriolis | `CRL` |
| Differential Pressure (DP) | `DPF` |
| *(unknown)* | `NA` |

**Level:**

| `instrument_type` | TYP |
|-------------------|-----|
| Level Gauge Glass | `LGG` |
| Magnetic Level Indicator | `MLI` |
| Float | `FLT` |
| Level Transmitter | `LTX` |
| Level Switch | `LSW` |
| Radar | `RDR` |
| Ultrasonic | `ULT` |
| Guided Wave Radar | `GWR` |
| *(unknown)* | `NA` |

### 4.4 Valves

| `valve_type` / `instrument_type` | TYP |
|----------------------------------|-----|
| Gate | `GAT` |
| Globe | `GLB` |
| Ball | `BAL` |
| Butterfly | `BTF` |
| Plug | `PLG` |
| Diaphragm | `DPH` |
| Check / Swing Check | `CHK` |
| Lift Check | `LCK` |
| Dual Plate Check | `DPC` |
| Spring Loaded (safety) | `SPL` |
| Pilot Operated (safety) | `POL` |
| *(no type / needle)* | `NA` |

### 4.5 Electrical / Control

**Panels (`panels`):** TYP from `panel_type`

| `panel_type` | TYP |
|--------------|-----|
| MCC | `MCC` |
| PCC | `PCC` |
| MDB | `MDB` |
| VFD Panel | `VFD` |
| Control Console | `CCP` |
| DB / Distribution Board | `DBD` |
| JB (large) | `JBX` |
| *(unknown)* | `NA` |

**Components (`components`):** TYP from `component_type`

| `component_type` | TYP |
|-----------------|-----|
| MCB | `MCB` |
| MCCB | `MCB` → `MCB` |
| ACB | `ACB` |
| Contactor | `CTR` |
| Overload Relay | `OLR` |
| DOL Starter | `DOL` |
| Star-Delta Starter | `SDS` |
| VFD (Variable Frequency Drive) | `VFD` |
| Soft Starter | `SST` |
| Transformer | `TRF` |
| SMPS / Power Supply | `SMP` |
| UPS | `UPS` |
| Relay | `RLY` |
| Timer Relay | `TMR` |
| Selector Switch | `SWT` |
| Push Button | `PBT` |
| Limit Switch | `LSW` |
| Indicator / Pilot Light | `IND` |
| Energy Meter | `EMT` |
| Current Transformer (CT) | `CTT` |
| Potential Transformer (PT) | `PTT` |
| Fuse | `FUS` |
| Terminal Block | `TBL` |
| ELCB / RCCB / RCBO | `ELB` |
| PLC / DCS Module | `PLC` |
| HMI / Operator Panel | `HMI` |
| *(unknown)* | `NA` |

**Cabling (`cabling`):** TYP from `cable_type`

| `cable_type` | TYP |
|--------------|-----|
| Power Cable | `PWR` |
| Control Cable | `CTL` |
| Instrumentation Cable | `INS` |
| Signal Cable | `SIG` |
| Earthing / Bare Conductor | `ETH` |
| *(unknown)* | `NA` |

**Junction Box (`junction_box`):** TYP from `jb_type`

| `jb_type` / `area_classification` | TYP |
|-----------------------------------|-----|
| Flameproof / Ex-d | `FPR` |
| Increased Safety / Ex-e | `EXE` |
| Non-Flameproof / General Purpose | `NFP` |
| *(unknown)* | `NA` |

**Field Items (`field_items`):** TYP from `field_item_type` → `NA` (no type attrs form implemented yet)

**Bought-out Packages:**
- `general` → TYP = `NA`
- `cooling_tower` → TYP from `ct_type` (Natural Draft → `NDT`, Mechanical Draft → `MDT`, *(default)* `NA`)

---

## 5. Size / Rating Normalization Rules

Size is the single most critical segment — it must be deterministic given the same input.

### 5.1 General Normalization Rules

1. Strip all whitespace from the value.
2. Convert to uppercase.
3. Replace forward slashes, spaces, and `×` with `x` (dimension separator).
4. Remove units from the SIZE segment (units go in the UNIT segment).
5. Cap numeric values: round to 2 significant figures if > 4 digits (e.g. 10000 → 10K).
6. If no size is determinable → use `NA`.

### 5.2 Per-Subgroup Size/Rating Extraction

| Subgroup | Primary size field | UNIT field |
|----------|--------------------|------------|
| `plates` | `thickness_mm` | `MM` |
| `pipes` | `nominal_bore` (NB) | `NB` |
| `fittings` | `nominal_bore` (NB) | `NB` |
| `flanges` | `nominal_bore` (NB) | `NB` |
| `fasteners` | `diameter_mm` + `length_mm` → `{D}x{L}` | `MM` |
| `gaskets` | `nominal_bore` (NB) | `NB` |
| `structural_steel` | `section_size` | `MM` |
| `centrifugal` / `gear` / `screw` / `multistage` | `flow_rate_m3h` if available, else `power_kw` | `M3H` / `KW` |
| `dosing_metering` | `flow_rate_lph` | `LPH` |
| `vacuum_boosters` / `vacuum_pump` | `capacity_m3h` | `M3H` |
| `pump_skid` | `power_kw` | `KW` |
| `hand_pump` | `flow_rate_lpm` | `LPM` |
| `non_flameproof` / `flameproof` (motors) | `power_kw` | `KW` |
| `pressure` | `range_bar` or `range_kpa` | `BAR` / `KPA` |
| `temperature` | `range_max_c` (upper range limit) | `C` |
| `flow` | `line_size_nb` | `NB` |
| `level` | `range_mm` | `MM` |
| `isolation` / `on_off` / `nrv` / `needle` (valves) | `size` (NB / inch) | `NB` or `IN` |
| `control` | `size_nb` | `NB` |
| `safety` | `inlet_size` | `IN` |
| `panels` | `voltage` (main voltage) | `V` |
| `components` | Depends on TYP — see §5.3 | — |
| `cabling` | `cable_size` (mm²) | `SQ` (mm²) |
| `junction_box` | `jb_size` (WxHxD) | `MM` |
| `general` (BOPK) | `capacity` or primary size | `NA` if none |
| `cooling_tower` | `capacity_tr` (Tons of Refrigeration) | `TR` |

### 5.3 Components — Size by Type

| component_type | Size field | UNIT |
|---------------|-----------|------|
| MCB / MCCB / ACB | `current_rating` | `A` |
| Contactor | `current_rating` (if set) else `power_kw` | `A` / `KW` |
| Overload Relay | `current_range` upper bound | `A` |
| DOL / Star-Delta Starter | `power_kw` | `KW` |
| VFD / Soft Starter | `power_kw` | `KW` |
| Transformer | `kva_rating` | `KVA` |
| SMPS / Power Supply | `output_voltage` + `output_current` → `{V}V{A}A` | `DC` |
| UPS | `kva_rating` | `KVA` |
| Relay / Timer Relay | `coil_voltage` | `V` |
| Selector Switch / Push Button | `mounting_cutout` | `MM` |
| Indicator / Pilot Light | `indicator_voltage` | `V` |
| Energy Meter | `accuracy_class` | `CLS` |
| CT | `ct_ratio` (e.g. 200/5) → `200-5` | `A` |
| PT | `pt_ratio` (e.g. 415/110) → `415-110` | `V` |
| Fuse | `current_rating` | `A` |
| Terminal Block | `terminal_current` | `A` |
| ELCB / RCCB / RCBO | `current_rating` | `A` |
| PLC / DCS Module | `plc_module_type` abbreviation | `NA` |
| HMI / Operator Panel | `screen_size` (inches) | `IN` |

---

## 6. Uniqueness & Collision Handling

### 6.1 Structural Uniqueness
A well-specified item (unique combination of group + subgroup + type + size + material) will naturally produce a unique code. Two identical items should produce the same code — that IS the desired deduplication behaviour (they are the same master catalog item).

### 6.2 Collision Counter
When the same code is generated for a semantically different item (e.g., same pump type and size but different MOC, not captured in the 5 segments), a numeric suffix is appended:

```
PUMP-CENT-HOR-1000-LPH        ← first item
PUMP-CENT-HOR-1000-LPH-02     ← second distinct item (same 5-segment key)
PUMP-CENT-HOR-1000-LPH-03     ← third, etc.
```

The counter is assigned at generation time by querying the DB with a `LIKE 'PUMP-CENT-HOR-1000-LPH%'` and incrementing.

### 6.3 Unique Index
The existing `UNIQUE` constraint on `master_items.item_code` is retained and enforced. The generation service must handle the race condition (advisory lock or `INSERT … ON CONFLICT` retry loop).

### 6.4 Postgres Advisory Lock
```sql
SELECT pg_advisory_xact_lock(hashtext('item_code_gen'));
-- generate and insert inside the same transaction
```
Same pattern already used for `tag_no` generation in PPPC.

---

## 7. Master Item vs Project Item Rules

| Aspect | Master Item | Project Item |
|--------|-------------|--------------|
| Item Code | Permanent, catalog-level | Inherits master item code; project-specific overrides not allowed |
| Generation trigger | When a `buy_list_line_selection` is approved OR when a new master item is created manually | No generation — inherits from master |
| Mutability | Item code is immutable once generated | Not applicable |
| Reuse | Same master item code may appear in N projects | `project_buy_list_lines.selected_master_item_id` FK links them |
| SAP sync | `master_items.sap_synced` / `sap_item_code` | `project_items.sap_synced` / `sap_item_code` |
| Custom item | If a project requires a truly custom item not in catalog → it is first created as a master item, then linked | N/A |

---

## 8. Item Code Generation — Coding Architecture

### 8.1 New Module: `server/item-code-service.ts`

```typescript
// Pure, side-effect-free code builder
function buildItemCode(params: {
  groupCode: string;          // from buy_groups.code
  subgroupCode: string;       // from buy_subgroups.code
  technicalAttributes: Record<string, unknown>;
}): { seg1: string; seg2: string; typ: string; size: string; unit: string; raw: string }

// Collision-safe generator (runs inside a transaction with advisory lock)
async function generateAndReserveItemCode(
  db: DbClient,
  params: BuildParams,
): Promise<string>
```

### 8.2 Code Registry Source of Truth

A new database table `item_code_registry` stores all segment codes, allowing runtime extension without code deploys:

```sql
CREATE TABLE item_code_registry (
  id            SERIAL PRIMARY KEY,
  registry_type TEXT NOT NULL,  -- 'group', 'subgroup', 'material', 'type'
  entity_code   TEXT NOT NULL,  -- e.g. 'pumps', 'centrifugal', 'HOR'
  abbr          TEXT NOT NULL,  -- e.g. 'PUMP', 'CENT', 'HOR'
  subgroup_code TEXT,           -- scope for type codes (which subgroup this TYP belongs to)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (registry_type, entity_code, subgroup_code)
);
```

This table is seeded from `ITEM_CODE_REGISTRY_SEED` in `server/utils/item-code-registry-seed.ts` (idempotent, runs at startup alongside PPPC seed).

### 8.3 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/item-code/generate` | Generate (but do not save) a preview item code from technicalAttributes. Body: `{ groupCode, subgroupCode, technicalAttributes }`. |
| `POST` | `/api/item-code/reserve` | Generate AND write to `master_items`. Requires at least `Superuser` or `GM` role. |
| `GET` | `/api/item-code/registry` | Return full registry for UI display. Superuser only. |
| `PUT` | `/api/item-code/registry/:id` | Update a registry entry. Superuser only. |
| `GET` | `/api/item-code/validate/:code` | Check whether a manually entered code is unique and format-compliant. |

### 8.4 Where Generation Is Triggered

| Trigger | Action |
|---------|--------|
| Phase 3 approval (`POST /api/pppc/lines/:id/approve`) | Server generates item code and upserts to `master_items` if not already present |
| Manual "Create Master Item" from admin panel | Server generates item code, user can preview before saving |
| Backfill script (migration) | Processes all existing `master_items` without a structured code |
| Phase 6 sync/generate (`pppc-phase6-*`) | Item code is inherited from the selection's master item |

The server **never** accepts an item code supplied by the client. The client may call `POST /api/item-code/generate` to preview the code in real-time as the user fills in attributes (read-only preview), but the actual DB write is always server-side.

---

## 9. SAP B1 Compatibility

### 9.1 Field Length Analysis

SAP B1 OITM.ItemCode: **VARCHAR(20)** in standard. Custom field length possible up to 50 chars in SAP B1 9.x+ via Administration → System Initialization → General Settings.

Our item code maximum: **34 chars** (worst case including suffix).

**Decision**: The current integration stores `sapItemCode` as a separate field. We add a `sap_item_code` column to `master_items` (VARCHAR(20)) that contains a truncated/mapped SAP-safe version, while the full internal `item_code` can be up to VARCHAR(50).

### 9.2 SAP Item Code Mapping Strategy

```
Internal:  PUMP-CENT-HOR-1000-LPH          (22 chars) ✓ fits SAP 20-char limit
Internal:  ELEC-COMP-VFD-250-KW             (18 chars) ✓ fits SAP 20-char limit
Internal:  PUMP-CENT-HOR-1000-LPH-02       (25 chars) ✗ does not fit → truncate + CRC
SAP:       PUMP-CENT-HOR-1000-X4F2          (20 chars using CRC4 suffix)
```

For codes > 20 chars: truncate to 16 chars + `-` + 3-char CRC of full internal code.  
Store both in `master_items`: `item_code` (full) and `sap_item_code` (SAP-compatible).

### 9.3 SAP Item Group Mapping

SAP B1 OITM.ItmsGrpCod must be mapped from our group:

| Our Group | SAP Item Group (configure in B1) |
|-----------|----------------------------------|
| `raw_materials` | Raw Materials |
| `pumps` | Rotating Equipment |
| `motors` | Rotating Equipment |
| `instruments` | Instrumentation |
| `valves` | Piping & Valves |
| `electrical_control` | Electrical & Control |
| `bought_out_packages` | Bought-out Packages |

Mapping stored in `item_code_registry` (registry_type = `'sap_group_map'`).

### 9.4 Data Mapping Update

`server/sap-b1-integration/data-mapping.ts` must be updated to:
- Map `master_items.sap_item_code` → `SAPItem.ItemCode`
- Map `master_items.itemCode` → `SAPItem.FrgnName` (Foreign Item Code, 100-char field in SAP)
- Map group abbreviation → `SAPItem.ItmsGrpCod`

---

## 10. Schema Changes Required

### 10.1 New Table: `item_code_registry`

```sql
CREATE TABLE item_code_registry (
  id            SERIAL PRIMARY KEY,
  registry_type TEXT    NOT NULL,
  entity_code   TEXT    NOT NULL,
  abbr          TEXT    NOT NULL,
  subgroup_code TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (registry_type, entity_code, COALESCE(subgroup_code, ''))
);
```

Add to `shared/schema.ts` as `itemCodeRegistry` table.

### 10.2 Alter `master_items`

```sql
ALTER TABLE master_items
  ADD COLUMN sap_item_code    VARCHAR(20),
  ADD COLUMN item_code_seg1   VARCHAR(10),
  ADD COLUMN item_code_seg2   VARCHAR(10),
  ADD COLUMN item_code_typ    VARCHAR(10),
  ADD COLUMN item_code_size   VARCHAR(20),
  ADD COLUMN item_code_unit   VARCHAR(10),
  ADD COLUMN buy_group_id     INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id  INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source TEXT;     -- 'auto', 'manual', 'migrated', 'sap_sync'
```

- `item_code_locked`: once set, item_code cannot be regenerated (immutable after first SAP sync)
- Segment columns allow querying and analytics by segment without string parsing

### 10.3 Alter `buy_package_lines`

```sql
ALTER TABLE buy_package_lines
  ADD COLUMN suggested_item_code VARCHAR(50);   -- generated on catalog save, informational only
```

### 10.4 Alter `project_buy_list_lines`

No structural changes needed. The item code flows through `selected_master_item_id` → `master_items.item_code`.

### 10.5 Alter `buy_list_line_selections`

```sql
-- Already has item_code VARCHAR(100) — extend to VARCHAR(50) and populate from master_items
ALTER TABLE buy_list_line_selections
  ALTER COLUMN item_code TYPE VARCHAR(50);
```

---

## 11. UI Impact

| Location | Change |
|----------|--------|
| `buy-packages-page.tsx` | After attrs form save: show generated item code preview (read-only chip). |
| `epc-buy-list-control-page.tsx` | Phase 3 selection modal: show master item code alongside item name. |
| New Admin page: Item Code Registry | CRUD for `item_code_registry` table. Route: `/admin/item-code-registry`. Superuser only. |
| Master Items page | Show `sap_item_code` alongside `item_code`. Show segment breakdown. |

No form inputs should accept a user-typed item code during normal workflow. The only manual entry path is through the Item Code Registry admin page (to add new type codes or material codes).

---

## 12. Migration & Backfill Strategy

### 12.1 Phase 1 — Registry Seed (zero risk)
1. Create `item_code_registry` table.
2. Seed with all codes from §3 and §4.
3. Run at startup (idempotent). No data modified.

### 12.2 Phase 2 — Schema Columns (zero risk)
1. Apply DDL changes from §10 (add nullable columns).
2. Existing records unaffected (all new columns are nullable or have defaults).

### 12.3 Phase 3 — Backfill Existing `master_items`
1. A one-time admin-triggered endpoint `POST /api/admin/item-code/backfill` processes all `master_items` without structured segment columns.
2. For each record:
   - Attempt to derive group/subgroup from existing `description` / `specification` text (keyword matching).
   - Generate segments from available data.
   - Set `item_code_source = 'migrated'`.
   - Where derivation is ambiguous → set `item_code_source = 'needs_review'` and skip setting the structured code.
3. A review UI lists all `needs_review` items for a Superuser to manually classify.
4. Original `item_code` values are preserved in a `item_code_legacy` column (VARCHAR(100), NOT migrated away — just added as reference).

### 12.4 Phase 4 — Forward Lock
After backfill review sign-off:
1. Set `item_code_locked = true` for all records with `sap_synced = true`.
2. Enable SAP sync for newly generated codes.

### 12.5 Rollback Plan
All schema changes are additive (new columns, new table). No existing columns are modified or dropped. The legacy `itemCode` column remains. If the feature is rolled back, new columns are simply ignored.

---

## 13. Audit & Validation Plan

### 13.1 Audit Logging
Every item code generation event is logged to the existing `audit_logs` table with:
- `entity_type = 'master_item'`
- `entity_id = masterItems.id`
- `action = 'item_code_generated'`
- `metadata`: `{ oldCode, newCode, source, segments, triggeredBy }`

### 13.2 Validation Checks (pre-generation assertions)

| Check | Rule |
|-------|-------|
| Format compliance | Matches regex `^[A-Z0-9]{2,6}-[A-Z0-9]{2,6}-[A-Z]{2,4}-[A-Z0-9x\-]{1,12}-[A-Z]{1,6}(-\d{2})?$` |
| Length | Internal ≤ 50 chars, SAP version ≤ 20 chars |
| Segment not empty | No segment may be blank (use `NA` if unknown) |
| Uniqueness | No existing `master_items.item_code` matches (enforced by DB unique index + pre-check) |
| Locked record | `item_code_locked = true` → reject regeneration |
| SAP code uniqueness | `sap_item_code` must also be unique (separate unique index) |

### 13.3 Parity Verification Endpoint

```
GET /api/admin/item-code/verify
```

Returns:
- Count of `master_items` with no structured segments (`needs_review` count)
- Count of items with `sap_synced = true` but mismatched `sap_item_code`
- Duplicate item code report (should always return empty)
- Format non-compliant codes

---

## 14. Implementation Order (Phased Rollout)

| Phase | Deliverable | Risk |
|-------|-------------|------|
| P0 | `item_code_registry` table + seed | Zero |
| P0 | Schema additive changes (§10) | Zero |
| P1 | `server/item-code-service.ts` — pure builder + unit tests | Low |
| P1 | `POST /api/item-code/generate` — preview endpoint | Low |
| P2 | `POST /api/item-code/reserve` — write endpoint with advisory lock | Medium |
| P2 | Phase 3 approval hook wired to item code generation | Medium |
| P3 | UI: item code preview chip in buy-packages-page | Low |
| P3 | UI: item code display in EPC buy list selection modal | Low |
| P3 | Admin: Item Code Registry CRUD page | Low |
| P4 | Backfill script + review UI | Medium |
| P5 | SAP B1 data-mapping update + sap_item_code sync | High (SAP-dependent) |
| P5 | Parity verification endpoint | Low |

---

## 15. Open Questions (to resolve before implementation)

| # | Question | Owner |
|---|----------|-------|
| 1 | What is the configured max length for ItemCode in the current SAP B1 instance? (default 20 vs extended 50?) | THERMOPAC IT / SAP admin |
| 2 | Should the same physical item used across multiple projects always share one `master_items` record, or can project-specific variants exist (different MOC, same size)? | Procurement lead |
| 3 | For pumps: is the primary size the flow rate (m³/h or LPH) or the power (kW)? Both are relevant — which goes in the item code? | Engineering lead |
| 4 | For `bought_out_packages → general`: no attrs form exists yet. How should size/rating be specified for general packages? | PM / Engineering |
| 5 | Should the `field_items` subgroup get its own attrs form before item code generation is enabled for it? | PM |
| 6 | Is there an existing SAP Item Group Code mapping that should be used? | THERMOPAC Finance / SAP |

---

*End of Plan v1.0*
