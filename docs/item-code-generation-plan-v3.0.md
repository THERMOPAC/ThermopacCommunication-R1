# BUY Item Code Generation — Implementation Plan v3.0
**Date:** 2026-05-11
**Supersedes:** v2.0 (2026-05-11)
**Status:** REVISED — Awaiting approval. Do not implement.
**Scope:** Item Code format, Variant Architecture, SAP B1 mapping, controlled suffix exception

---

## 1. Changes from v2.0

| # | Correction |
|---|------------|
| C10 | Suffix `-02`, `-03` is no longer the default collision solution. Removed from normal design. |
| C11 | Item Variant layer introduced. Technical/commercial differences are captured as Variants under a single Master Item Code. |
| C12 | Decision tree defined: when to reuse a Master Item Code, when to create a new Variant, when to create a new Master Item Code. |
| C13 | Variant attribute definitions added for every major group/subgroup. |
| C14 | Group-by-group Variant Architecture examples added (§10). |
| C15 | SAP B1 mapping strategy expanded: three options evaluated; recommended approach selected (Master Item → SAP ItemCode; Variants stored in SAP UDFs + THERMOPAC Variant table). |
| C16 | Suffix exception policy defined: controlled, Superuser-approved, audit-logged, not a normal path. |
| C17 | New `item_variants` table added to schema changes. |
| C18 | Variant-aware API endpoints added. |

All segment codes, registries, and the full Code Matrix from v2.0 (§§4–8) are unchanged.

---

## 2. Item Code Format (unchanged from v2.0)

```
GROUP-SUBGROUP-TYPE-SIZE-UNIT
```

| Segment | Length Rule | Notes |
|---------|-------------|-------|
| GROUP | 3 – 5 characters | Fixed from registry |
| SUBGROUP | Max 3 characters | Fixed from registry |
| TYPE | Max 3 characters; `NA` when no type applies | Fixed from registry |
| SIZE | 3 – 5 digits, zero-padded to minimum 3 | Zero-pad: 10 → `010` |
| UNIT | Max 4 characters | Fixed from unit registry |

**Confirmed example:** `PUMP-CEN-HOR-1000-LPH`
**Raw materials example:** `PLAT-CS-NA-010-MM`

---

## 3. Core Design Principle: Master Item = Engineering Item Family

The Master Item Code identifies a **procurement engineering family** — the functional duty specification that remains stable regardless of who makes it, what material it uses commercially, or which certification it carries.

```
Master Item Code:  PUMP-CEN-HOR-1000-LPH
Meaning:           Centrifugal pump, horizontal, 1000 LPH
                   ↳ This is ONE master item with potentially multiple variants
                      (Grundfos in SS316, KSB in CS, Flowserve with ATEX cert, etc.)
```

The Item Code is **not a purchase specification**. It is an **engineering identity**. The full purchase specification lives in the Variant record attached to the Master Item.

---

## 4. Three-Level Decision: Same Master / New Variant / New Master

### 4.1 Decision Tree

```
Given a new BUY catalog item:
│
├─ Does it differ ONLY in vendor, MOC, pressure class, flange std,
│  voltage/phase/freq, certification, model number, or spec revision?
│
│   YES → It is a VARIANT of an existing Master Item.
│          → Reuse the same Master Item Code.
│          → Create or select a Variant record under it.
│
│   NO  → Does any CODE SEGMENT change?
│          (group / subgroup / type / size / unit)
│
│          YES → It is a NEW Master Item.
│                → Generate a new Item Code.
│
│          NO  → Are the items genuinely different engineering families
│                that cannot be distinguished by any code segment?
│
│               YES → SUFFIX EXCEPTION (§5).
│                     Requires Superuser approval + audit.
│
│               NO  → They are the same item. Reuse the Master Item.
```

### 4.2 Same Master Item Code — Reuse Rule

Reuse an existing Master Item Code (and create a new Variant, if the commercial/technical details differ) when the following ALL remain unchanged:

| Unchanged | Example |
|-----------|---------|
| Group | Pumps |
| Subgroup | Centrifugal |
| Type | Horizontal |
| Primary size | 1000 LPH |
| Unit | LPH |

And the ONLY differences are Variant attributes (vendor, MOC, certification, etc.).

### 4.3 New Variant Under Same Master — When Required

A new Variant record must be created (not a new Master Item) when any of the following differ from an existing Variant under the same Master:

| Variant Attribute | Example trigger |
|-------------------|----------------|
| Vendor / manufacturer | KSB → Grundfos |
| Material of construction (MOC) | CS → SS316 (for non-raw-material items) |
| Pressure class | ANSI 150 → ANSI 300 |
| Flange standard | ANSI/ASME B16.5 → DIN PN40 |
| Voltage / phase / frequency | 415V/3Ph/50Hz → 440V/3Ph/60Hz |
| Certification | Standard → ATEX Zone 1 / IECEx / IBR / CPCB |
| Model number | Different model from same or different vendor |
| Spec revision | Revised technical specification |

> **Note for raw materials:** MOC is encoded in the SUBGROUP segment (`CS`, `S31`, `DSS`, etc.). Therefore, a different MOC in raw materials always generates a different Master Item Code — not a Variant. This is the only exception.

### 4.4 New Master Item Code — When Required

A completely new Master Item Code is required when any CODE SEGMENT changes:

| Segment change | Example |
|----------------|---------|
| Different TYPE | Horizontal → Vertical (`HOR` → `VRT`) |
| Different SIZE | 1000 LPH → 2000 LPH |
| Different SUBGROUP | Centrifugal → Gear (`CEN` → `GEA`) |
| Different GROUP | Pump → Motor |
| Different raw material MOC | `PLAT-CS` → `PLAT-S31` (different material = different code) |

---

## 5. Suffix Exception Policy (Controlled, Not Default)

The suffix `-02`, `-03` etc. is a **last-resort controlled exception**, not a design pattern. It applies only when:

1. Two items are genuinely different engineering families.
2. All five code segments produce the same value for both items.
3. No additional segment (e.g., a new TYPE code) can disambiguate them without expanding the type registry.
4. A **Superuser** reviews and explicitly approves the suffix assignment.

**Approval gate:** `POST /api/item-code/approve-suffix` — requires Superuser role, mandatory `reason` field, logged to `audit_logs`.

**Suffix format:** `-02` through `-99` (2 digits). `-01` is never used (the base code without suffix is implicitly the first item).

**Expected frequency:** Extremely rare. Proper type code design in §6 should prevent the need for suffixes in almost all cases.

```
PUMP-CEN-HOR-1000-LPH      ← Master Item (first, no suffix)
PUMP-CEN-HOR-1000-LPH-02   ← Suffix exception (approved, audited)
                               Reason: "Second hydraulic family — split-volute design,
                                        cannot be distinguished by existing type codes"
```

---

## 6. Variant Architecture

### 6.1 Variant Identity

A Variant has no standalone Item Code. Its identity is:

```
{MasterItemCode} / V{nn}

Examples:
  PUMP-CEN-HOR-1000-LPH / V01    ← Variant 1 (e.g., KSB, CS, standard)
  PUMP-CEN-HOR-1000-LPH / V02    ← Variant 2 (e.g., Grundfos, SS316, ATEX)
```

The Variant Code `V01`, `V02` is an internal THERMOPAC QMS identifier. It does **not** appear in the SAP ItemCode.

### 6.2 Variant Attribute Definitions

| Attribute | Type | Applicable groups |
|-----------|------|------------------|
| `vendor_id` | FK → vendors | All |
| `manufacturer` | Text | All |
| `model_number` | Text | All |
| `moc` | Text | Pumps, Valves, Instruments, Electrical, BOPK |
| `pressure_class` | Text | Pumps, Valves, Instruments |
| `flange_standard` | Text | Pumps, Valves |
| `voltage` | Integer (V) | Motors, Electrical |
| `phase` | Integer | Motors, Electrical |
| `frequency` | Integer (Hz) | Motors, Electrical |
| `certifications` | Text array | All (ATEX, IECEx, IBR, CPCB, BIS, CE) |
| `efficiency_class` | Text | Motors (`IE2`, `IE3`, `IE4`) |
| `insulation_class` | Text | Motors, Transformers |
| `ip_rating` | Text | Motors, JBX, Instruments |
| `spec_revision` | Text | All |
| `datasheet_gcs_path` | Text | All (vendor datasheet reference) |
| `additional_attributes` | JSONB | Catch-all for group-specific extras |
| `is_preferred` | Boolean | Marks the default Variant for a Master Item |
| `approved_by` | FK → users | Variant approval tracking |
| `approved_at` | Timestamp | Variant approval tracking |

### 6.3 Variant Selection in PPPC Phase 3

In the current Phase 3 flow, the engineer selects a Master Item for a buy-list line. With the Variant layer:

1. Engineer selects a **Master Item** (by Item Code).
2. System shows all active Variants under that Master Item.
3. Engineer selects the specific Variant (or creates a new one if none match).
4. The selected **Variant ID** is stored on `buy_list_line_selections.item_variant_id`.
5. The Master Item Code is what appears in reports and the BOM.
6. The Variant detail (vendor, MOC, certification) appears in the datasheet and PO.

---

## 7. Variant Architecture Examples — By Group

### 7.1 Pumps

**Master Item:** `PUMP-CEN-HOR-1000-LPH`
*Centrifugal pump, horizontal, 1000 LPH*

| Variant | Vendor | MOC | Pressure Class | Certification | Suffix used? |
|---------|--------|-----|----------------|---------------|-------------|
| V01 | KSB | CS | ANSI 150 | — | No |
| V02 | Grundfos | SS316 | ANSI 150 | — | No |
| V03 | Flowserve | SS316 | ANSI 300 | ATEX Zone 1 | No |
| V04 | Kirloskar | CS | PN10 | CPCB | No |

All four are the same Master Item Code. SAP ItemCode = `PUMP-CEN-HOR-1000-LPH`. Variant details stored in QMS Variant table and SAP UDFs / PO line text.

**When would a new Master be created instead?**
- Flow rate changes to 2000 LPH → `PUMP-CEN-HOR-2000-LPH` (new Master)
- Type changes to Vertical → `PUMP-CEN-VRT-1000-LPH` (new Master)

---

### 7.2 Valves

**Master Item:** `VALV-ISO-BAL-050-NB`
*Isolation ball valve, 50 NB*

| Variant | Vendor | MOC (body/trim) | End connection | Pressure class | Certification | Suffix? |
|---------|--------|-----------------|----------------|----------------|---------------|---------|
| V01 | L&T | CS body / SS trim | Flanged RF | ANSI 150 | — | No |
| V02 | Audco | SS316 full bore | Flanged RF | ANSI 150 | — | No |
| V03 | Neway | CS | Socket weld | 800# | — | No |
| V04 | Crane | CS | BW | ANSI 300 | Fire safe API 607 | No |

All four variants → same Master Item Code `VALV-ISO-BAL-050-NB`.

**Safety valve example — same master, different variant:**

**Master Item:** `VALV-SAF-SPL-001-IN`
*Safety valve, spring-loaded, 1" inlet*

| Variant | Vendor | Set pressure | MOC | Standard | Suffix? |
|---------|--------|-------------|-----|---------|---------|
| V01 | Leser | 4 bar | CS | API 526 | No |
| V02 | Leser | 6 bar | CS | API 526 | No |
| V03 | Sempell | 4 bar | SS316 | API 526 + IBR | No |

Set pressure is a Variant attribute, not a segment. The 1" inlet SIZE defines the engineering family.

---

### 7.3 Raw Materials

For raw materials, MOC is encoded in the SUBGROUP segment. Each material grade is therefore a distinct Master Item Code. No Variant layer applies for the material itself. Variants are used for supplier/grade/standard differences.

**Master Item:** `PLAT-CS-NA-010-MM`
*Carbon steel plate, 10 mm*

| Variant | Vendor / Mill | Standard | Heat no. scope | Suffix? |
|---------|--------------|---------|---------------|---------|
| V01 | SAIL | IS 2062 Gr E250 | Heat cert required | No |
| V02 | TATA | ASTM A516 Gr 70 | NACE cert required | No |
| V03 | POSCO | EN 10028-2 P265GH | PED 2014/68/EU | No |

**Master Item:** `PLAT-S31-NA-010-MM`
*SS316L plate, 10 mm — this is a DIFFERENT Master Item Code from CS plate*

| Variant | Vendor | Standard | MOC detail | Suffix? |
|---------|--------|---------|-----------|---------|
| V01 | Aperam | ASTM A240 Gr 316L | 2B finish | No |
| V02 | Outokumpu | EN 10088-2 1.4404 | 2B finish | No |

**Key rule for raw materials:** `PLAT-CS` ≠ `PLAT-S31`. Different MOC = different Master Item Code, not a Variant.

---

### 7.4 Instruments

**Master Item:** `INST-PRS-TXR-010-BAR`
*Pressure transmitter, 0–10 bar*

| Variant | Vendor | Output signal | Process connection | Certif. | Suffix? |
|---------|--------|--------------|-------------------|---------|---------|
| V01 | Endress+Hauser | 4–20 mA HART | 1/2" NPT | — | No |
| V02 | ABB | 4–20 mA HART | 1/2" NPT | ATEX Zone 1 | No |
| V03 | Yokogawa | 4–20 mA + FF | 1/2" BSP | SIL 2 | No |
| V04 | Wika | 4–20 mA | Flange DN25 | — | No |

**Master Item:** `INST-TMP-RTD-150-DGC`
*RTD temperature element, 0–150°C range*

| Variant | Vendor | Element type | Immersion length | Certification | Suffix? |
|---------|--------|-------------|-----------------|---------------|---------|
| V01 | Pyroelectric | PT100, 3-wire | 150 mm | — | No |
| V02 | ABB | PT100, 4-wire | 200 mm | ATEX | No |

---

### 7.5 Electrical Items

**Master Item:** `ELEC-CMP-VFD-011-KW`
*Variable Frequency Drive, 11 kW*

| Variant | Vendor | Input voltage | IP rating | Certification | Suffix? |
|---------|--------|--------------|-----------|---------------|---------|
| V01 | ABB ACS880 | 415V/3Ph/50Hz | IP21 | — | No |
| V02 | Siemens G120 | 415V/3Ph/50Hz | IP55 | — | No |
| V03 | Schneider ATV | 440V/3Ph/60Hz | IP21 | UL/cUL | No |
| V04 | ABB ACS880 | 415V/3Ph/50Hz | IP21 | ATEX Zone 2 | No |

**Master Item:** `ELEC-PNL-MCC-415-V`
*Motor Control Centre, 415V*

| Variant | Vendor / Manufacturer | Busbar rating | Enclosure | Standard | Suffix? |
|---------|----------------------|--------------|-----------|---------|---------|
| V01 | L&T | 1600A | IP52 | IEC 61439 | No |
| V02 | Siemens | 2500A | IP52 | IEC 61439 | No |
| V03 | ABB | 1600A | IP54, GRP | IEC 61439 | No |

**Master Item:** `ELEC-JBX-FPR-300-MM`
*Junction box, flameproof, 300 mm*

| Variant | Vendor | Gas group | IP rating | Certification | Suffix? |
|---------|--------|-----------|-----------|---------------|---------|
| V01 | Pepperl+Fuchs | IIC | IP66 | ATEX / IECEx | No |
| V02 | Crouse-Hinds | IIC | IP66 | ATEX / IECEx | No |
| V03 | MTL | IIB | IP65 | ATEX | No |

---

### 7.6 Bought-out Packages

**Master Item:** `BOPK-CLT-MDT-100-TR`
*Cooling tower, mechanical draft, 100 TR*

| Variant | Vendor | Fill type | Basin MOC | Fan type | Certification | Suffix? |
|---------|--------|-----------|-----------|---------|---------------|---------|
| V01 | Paharpur | Film fill | FRP | Axial, TEFC motor | CPCB | No |
| V02 | SPX Cooling | Splash fill | RCC | Centrifugal | — | No |
| V03 | Marley | Film fill | SS304 | Axial | CPCB + Energy Star | No |

**Master Item:** `BOPK-GEN-NA-NA-NA`
*General bought-out package (no standard size)*

| Variant | Description | Vendor | Key spec | Suffix? |
|---------|-------------|--------|---------|---------|
| V01 | N₂ generator skid | Parker | 99.5% purity, 50 Nm³/h | No |
| V02 | Compressed air dryer | Atlas Copco | -40°C dew point | No |

For general packages, the Variant `additional_attributes` JSONB field carries all package-specific details.

---

### 7.7 Suffix Exception — Example of When It IS Used

**Scenario:** Two centrifugal horizontal pumps, both rated at 1000 LPH, are fundamentally different hydraulic designs — a standard end-suction and a special high-shear design — but the current type code registry has no code to distinguish "high-shear" from standard horizontal.

**Resolution options (in order of preference):**
1. Add a new type code `HSR` (High-Shear) to the type registry → new Master `PUMP-CEN-HSR-1000-LPH`. **Preferred.**
2. If the type code expansion is not approved → suffix exception.

**Suffix exception (only if option 1 rejected):**
```
PUMP-CEN-HOR-1000-LPH      ← Standard end-suction, first registered
PUMP-CEN-HOR-1000-LPH-02   ← High-shear design, suffix exception
                               Approved by: [Superuser]
                               Reason: "Hydraulically distinct design; type code HSR
                                        not yet ratified in registry"
```

---

## 8. SAP B1 Mapping Strategy

### 8.1 Three Options Evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Master Item → SAP ItemCode. Variants stored in SAP UDFs + THERMOPAC Variant table. | Clean ItemCode space; no proliferation; SAP reports by engineering family | Variant detail not natively queryable in SAP without UDF setup |
| **B** | Each Variant → separate SAP ItemCode (e.g., `PUMP-CEN-HOR-1000-LPH-V01`) | Each vendor/MOC is a distinct SAP item; full SAP traceability | ItemCode proliferation; SAP OITM bloat; breaks the family concept |
| **C** | Master Item → SAP ItemCode. Variants tracked only in THERMOPAC QMS. SAP gets no variant data. | Simplest SAP integration | Loss of vendor/MOC traceability in SAP financial reports |

### 8.2 Recommended Approach: Option A

**Master Item maps 1:1 to SAP ItemCode. Variant details flow to SAP via two channels:**

1. **SAP UDFs on OITM (Item Master):** Store the preferred Variant's MOC, pressure class, and flange standard as UDFs on the SAP item master record. These are static reference fields.

2. **SAP Purchase Order line text / remarks (OPOR1):** When a PO is raised for a specific project, the selected Variant's full spec (vendor, model, certification, MOC, pressure class) is written to the PO line's `Dscription` or `FreeText` field. This gives procurement full visibility per order.

3. **SAP Manufacturer Part Number (OMRP):** SAP B1's built-in MPN table can store multiple vendor part numbers under one SAP ItemCode. Each Variant's `model_number` and `vendor_id` can be synced to OMRP. This is the most structured SAP-native approach for multi-vendor items.

### 8.3 SAP Field Mapping

| THERMOPAC field | SAP B1 field | Notes |
|----------------|-------------|-------|
| `master_items.item_code` | `OITM.ItemCode` | Max 20 chars (or 50 if instance configured). Uses `sap_item_code` when internal code > 20 chars. |
| `master_items.item_code` (full) | `OITM.FrgnName` | Always stores the full internal code (up to 100 chars in SAP). |
| `master_items.description` | `OITM.ItemName` | Engineering description of the family. |
| `item_variants.moc` | `OITM.U_MOC` (UDF) | Preferred variant's MOC |
| `item_variants.pressure_class` | `OITM.U_PressClass` (UDF) | Preferred variant's pressure class |
| `item_variants.certifications` | `OITM.U_Certs` (UDF) | Preferred variant's certifications (comma-separated) |
| `item_variants.vendor_id` + `model_number` | `OMRP` (Manufacturer Part Numbers) | One row per active Variant |
| Selected Variant full spec | `OPOR1.Dscription` + `OPOR1.FreeText` | Written at PO creation time per project |

### 8.4 SAP Item Group Mapping

| THERMOPAC Group | SAP Item Group (OITG) |
|----------------|----------------------|
| `raw_materials` | Raw Materials |
| `pumps` | Rotating Equipment |
| `motors` | Rotating Equipment |
| `instruments` | Instrumentation |
| `valves` | Piping & Valves |
| `electrical_control` | Electrical & Control |
| `bought_out_packages` | Bought-out Packages |

### 8.5 SAP B1 Item Code Length

With the Variant Architecture, suffixes are no longer a normal path. Nearly all item codes are base 5-segment codes:

| Item Code | Length | Fits SAP 20? |
|-----------|--------|-------------|
| `VALV-ISO-GAT-050-NB` | 20 | ✓ Yes |
| `MOTR-NFP-ACI-015-KW` | 20 | ✓ Yes |
| `PUMP-CEN-HOR-100-M3H` | 20 | ✓ Yes |
| `PUMP-CEN-HOR-1000-LPH` | 21 | ✗ → use `sap_item_code` |
| `ELEC-CMP-ACB-1600-AMP` | 22 | ✗ → use `sap_item_code` |
| `PUMP-CEN-HOR-1000-LPH-02` | 24 | ✗ → use `sap_item_code` (suffix exception only) |

**Separate `sap_item_code` (VARCHAR 20) column on `master_items` is still required.** When the internal code ≤ 20 chars, `sap_item_code` = same value. When > 20 chars, truncate to 16 + `-` + 3-char CRC hex of the full code.

> **Open question (unchanged):** What is the actual configured max for `ItemCode` in the current SAP B1 instance? If 50 chars, `sap_item_code` can equal the full internal code for all non-suffix cases.

---

## 9. Group, Subgroup, Type Registries and Code Matrix

All registries (§§4–6 of v2.0) and the full Code Matrix (§7 of v2.0) are **unchanged** and remain valid. Refer to v2.0 for the complete tables.

The only change is that codes in the matrix now represent **Master Item Codes** (engineering families). The Variant layer sits below them transparently.

---

## 10. Source of Item Codes (unchanged from v2.0)

Item codes are generated from structured catalog master data only:

| Segment | Source |
|---------|--------|
| GROUP | `buy_groups.code` |
| SUBGROUP | `buy_subgroups.code` (or material code for raw materials) |
| TYPE | Registered `technicalAttributes` field mapped via `item_code_registry` |
| SIZE | Registered primary size field per subgroup |
| UNIT | Registered unit per subgroup |

No free-form parsing. No client-supplied codes. All generation is server-side only.

---

## 11. Schema Changes Required

### 11.1 New Table: `item_code_registry` (unchanged from v2.0)

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

### 11.2 Additive Columns on `master_items` (unchanged from v2.0)

```sql
ALTER TABLE master_items
  ADD COLUMN sap_item_code      VARCHAR(20),
  ADD COLUMN ic_group           VARCHAR(5),
  ADD COLUMN ic_subgroup        VARCHAR(3),
  ADD COLUMN ic_type            VARCHAR(3),
  ADD COLUMN ic_size            VARCHAR(5),
  ADD COLUMN ic_unit            VARCHAR(4),
  ADD COLUMN buy_group_id       INTEGER REFERENCES buy_groups(id),
  ADD COLUMN buy_subgroup_id    INTEGER REFERENCES buy_subgroups(id),
  ADD COLUMN item_code_locked   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN item_code_source   TEXT;    -- 'auto', 'manual', 'migrated', 'sap_sync'
```

### 11.3 New Table: `item_variants` ← NEW in v3.0

```sql
CREATE TABLE item_variants (
  id                    SERIAL PRIMARY KEY,
  master_item_id        INTEGER NOT NULL REFERENCES master_items(id) ON DELETE RESTRICT,
  variant_seq           INTEGER NOT NULL,           -- 1, 2, 3 … per master item
  variant_display_code  VARCHAR(30),                -- e.g. 'PUMP-CEN-HOR-1000-LPH / V01'
  vendor_id             INTEGER REFERENCES vendors(id),
  manufacturer          TEXT,
  model_number          TEXT,
  moc                   TEXT,
  pressure_class        TEXT,                       -- e.g. 'ANSI 150', 'ANSI 300', 'PN40'
  flange_standard       TEXT,                       -- e.g. 'ANSI/ASME B16.5', 'BS 4504', 'DIN 2501'
  voltage               INTEGER,                    -- V
  phase                 INTEGER,                    -- 1 or 3
  frequency             INTEGER,                    -- Hz
  certifications        TEXT[],                     -- ['ATEX', 'IECEx', 'IBR', 'CPCB']
  efficiency_class      TEXT,                       -- motors: 'IE2', 'IE3', 'IE4'
  insulation_class      TEXT,                       -- motors: 'F', 'H'
  ip_rating             TEXT,                       -- 'IP55', 'IP66', 'IP65'
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

### 11.4 Alter `buy_list_line_selections` ← NEW in v3.0

```sql
ALTER TABLE buy_list_line_selections
  ADD COLUMN item_variant_id INTEGER REFERENCES item_variants(id) ON DELETE SET NULL;
```

This records which specific Variant was chosen when the engineer made a selection in Phase 3.

### 11.5 New Table: `item_code_suffix_exceptions` ← NEW in v3.0

```sql
CREATE TABLE item_code_suffix_exceptions (
  id                SERIAL PRIMARY KEY,
  master_item_id    INTEGER NOT NULL REFERENCES master_items(id),
  base_code         VARCHAR(50) NOT NULL,   -- e.g. 'PUMP-CEN-HOR-1000-LPH'
  suffix_code       VARCHAR(55) NOT NULL,   -- e.g. 'PUMP-CEN-HOR-1000-LPH-02'
  suffix_number     SMALLINT NOT NULL,      -- 2, 3, ...
  reason            TEXT NOT NULL,
  approved_by       INTEGER NOT NULL REFERENCES users(id),
  approved_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 11.6 Additive Column on `buy_package_lines` (unchanged from v2.0)

```sql
ALTER TABLE buy_package_lines
  ADD COLUMN suggested_item_code VARCHAR(50);
```

---

## 12. API Changes

### 12.1 Item Code Endpoints (unchanged from v2.0)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/item-code/preview` | Preview code from form data. No DB write. |
| `POST` | `/api/item-code/reserve` | Generate + write to `master_items`. Superuser / GM. |
| `GET` | `/api/item-code/registry` | Full registry. Superuser only. |
| `PUT` | `/api/item-code/registry/:id` | Update registry entry. Superuser only. |
| `GET` | `/api/item-code/validate/:code` | Format + uniqueness check. |
| `POST` | `/api/admin/item-code/backfill` | One-time migration trigger. Superuser only. |
| `GET` | `/api/admin/item-code/verify` | Parity + compliance report. |

### 12.2 Variant Endpoints ← NEW in v3.0

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/master-items/:id/variants` | List all Variants for a Master Item. |
| `POST` | `/api/master-items/:id/variants` | Create a new Variant. Superuser / GM. |
| `PUT` | `/api/master-items/:id/variants/:variantId` | Update a Variant. |
| `PUT` | `/api/master-items/:id/variants/:variantId/preferred` | Set as preferred Variant. |
| `DELETE` | `/api/master-items/:id/variants/:variantId` | Soft-delete (set `is_active = false`). |

### 12.3 Suffix Exception Endpoint ← NEW in v3.0

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/item-code/approve-suffix` | Approve a suffix exception. Superuser only. Body: `{ baseCode, reason }`. |
| `GET` | `/api/admin/item-code/suffix-exceptions` | List all suffix exceptions. Superuser only. |

---

## 13. UI Changes

| Location | Change |
|----------|--------|
| `buy-packages-page.tsx` | After attrs form save: show generated Master Item Code preview (read-only chip). Show existing Variants if Master already exists. |
| `epc-buy-list-control-page.tsx` | Phase 3 selection modal: show Master Item Code + Variant selector. Allow creating a new Variant inline. |
| Master Items admin page | New "Variants" tab per Master Item showing all Variants with attributes. |
| New: Item Code Registry admin page | CRUD for `item_code_registry`. Superuser only. |
| New: Suffix Exceptions page | List of all approved suffix exceptions with audit trail. Superuser only. |

---

## 14. Migration & Backfill Strategy (updated from v2.0)

| Phase | Action | Risk |
|-------|--------|------|
| P0 | Create `item_code_registry` + seed | Zero |
| P0 | Apply additive schema columns (§11.1–11.6) | Zero |
| P1 | Build `item-code-service.ts` pure builder + preview endpoint | Low |
| P2 | Reserve endpoint with advisory lock | Medium |
| P2 | Wire Phase 3 approval → auto-generate item code | Medium |
| P3 | Variant CRUD endpoints + UI (selection modal Variant layer) | Medium |
| P3 | UI: item code preview chip + Variant selector in buy-packages-page | Low |
| P4 | One-time backfill of existing `master_items` | Medium |
| P4 | Backfill preferred Variant per existing master item where vendor data available | Low |
| P5 | SAP B1: sap_item_code sync + OMRP Manufacturer Part Number sync per Variant | High |
| P5 | SAP UDF setup for MOC, pressure class, certifications on OITM | High |

---

## 15. Audit & Validation

- Every Master Item Code generation logged: `audit_logs` (`entity_type='master_item'`, `action='item_code_generated'`).
- Every Variant creation logged: `audit_logs` (`entity_type='item_variant'`, `action='variant_created'`).
- Every suffix exception logged: `item_code_suffix_exceptions` table + `audit_logs` (`action='suffix_exception_approved'`).
- Format compliance regex (Master Item, no suffix): `^[A-Z]{3,5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}$`
- Format compliance regex (with approved suffix): `^[A-Z]{3,5}-[A-Z0-9]{2,3}-[A-Z]{2,3}-[A-Z0-9]{3,5}-[A-Z0-9]{1,4}-\d{2}$`
- Uniqueness enforced by DB unique index on `master_items.item_code`.
- Locked records (`item_code_locked = true`) reject any regeneration.

---

## 16. Open Questions — Resolve Before Implementation

| # | Question | Owner |
|---|----------|-------|
| 1 | **SAP B1 ItemCode max length:** What is the configured max in the current production instance? (Standard 20 chars vs extended 50 chars). Determines whether `sap_item_code` CRC truncation is needed for all 21+ char codes. | THERMOPAC IT / SAP admin |
| 2 | **SAP UDF setup:** Are UDFs (`U_MOC`, `U_PressClass`, `U_Certs`) to be configured in OITM for the preferred Variant attributes? Or rely solely on OMRP + PO line text? | THERMOPAC Finance / SAP admin |
| 3 | **Variant approval workflow:** Should new Variants require approval (by GM or Superuser) before they can be selected in Phase 3? Or is creation sufficient? | PM / Process owner |
| 4 | **`ELEC-CMP-PLC-NA-NA` and `BOPK-GEN-NA-NA-NA`:** Is `NA-NA` for size and unit acceptable for types with no standard size? | Approval required |
| 5 | **Field Items (FLD):** Placeholder `ELEC-FLD-NA-NA-NA` until attrs form is ready, or exclude from item code generation entirely? | PM / Engineering |
| 6 | **Pump size field priority:** Flow rate (preferred) or power (kW) when flow rate is not specified? | Engineering lead |
| 7 | **SAP Item Group codes:** Confirm configured group codes in production B1 match the labels in §8.4. | THERMOPAC Finance / SAP |

---

*End of Plan v3.0 — Submit for approval before implementation.*
