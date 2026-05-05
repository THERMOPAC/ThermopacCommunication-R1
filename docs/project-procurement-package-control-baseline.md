# Project Procurement Package Control — Baseline Plan

**Document status:** BASELINE — Awaiting approval before implementation  
**Created:** 2026-05-05  
**Module code:** PPPC  
**Target page:** `/epc/buy-list-control` (new), `/products/buy-packages` (new)

---

## 1. Module Objective and Scope

### Objective

Define, manage, and track all BUY-category procurement requirements for EPC projects from offer stage through purchase order and quality control. The module provides a structured, lifecycle-controlled procurement list per project, seeded from reusable standard packages linked to catalog products, with per-line selection, datasheet, and approval workflows before triggering the existing PR/PO/QC chain.

### Scope — Included

- BUY items only (`make_or_buy = 'Buy'` in `master_items`)
- Raw Materials, Pumps, Motors, Instruments, Valves, Electrical/Control, Bought-out Packages
- Standard procurement packages at product level (catalog templates)
- Project-level procurement lists with full lifecycle control
- Per-line vendor selection and datasheet management
- Structured GCS storage for datasheets
- Feed into existing `item_planning_records → procurement_execution_records → po_preparation_records → epc_purchase_orders → quality_planning_records → inspection_execution_records` chain

### Scope — Excluded

- MAKE items (manufactured in-house)
- Manufacturing BOMs (`epc_bom_headers`, `epc_bom_lines`)
- Work Orders (`epc_work_orders`)
- SolidWorks BOM extraction
- Production execution records
- Any changes to existing procurement/QC chain tables (additive only)

---

## 2. Final Architecture Flow

```
Offer Parent Product (products table)
        │
        │  [linked by product_id]
        ▼
Standard Procurement Package
  buy_package_headers + buy_package_lines
  (catalog template; group/subgroup/UOM by FK;
   technical attributes by group-specific JSONB)
        │
        │  [auto-copy on offer → order conversion
        │   OR manual creation per project]
        ▼
Project Procurement List
  project_buy_list_headers + project_buy_list_lines
  (project-specific; fully editable while draft;
   mandatory: tag_no, equipment_reference, service_description;
   lifecycle: draft → under_review → released → locked → superseded | canceled)
        │
        │  [per-line, after list is released/locked]
        ▼
Selection & Datasheet Module
  buy_list_line_selections
  (master item selection; drawing number/revision;
   datasheet upload with server-generated GCS path;
   approval/rejection workflow per line)
        │
        │  [line status = 'approved']
        ▼
Approved Selected Items
  (buy_list_line.status = 'approved';
   selected_master_item_id resolved;
   raise-pr available)
        │
        │  [POST /raise-pr per line or bulk-raise-pr]
        ▼
PR / PO / QC  ← existing chain, unchanged
  item_planning_records (type='procurement', source='buy_list')
    → procurement_execution_records
      → po_preparation_records
        → epc_purchase_orders
          → quality_planning_records
            → inspection_execution_records
```

---

## 3. Phased Implementation Plan

---

### Phase 0 — Master Reference Tables

**Purpose:** System-wide lookup tables. Must be created and seeded before any package or list tables.

---

#### Table: `buy_groups`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `code` | varchar(40) | UNIQUE NOT NULL | `raw_materials`, `pumps`, `motors`, `instruments`, `valves`, `electrical_control`, `bought_out_packages` |
| `label` | varchar(100) | NOT NULL | Display name |
| `sort_order` | integer | NOT NULL DEFAULT 0 | |
| `is_active` | boolean | NOT NULL DEFAULT true | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL DEFAULT NOW() | |

**Seed data (7 rows):**

| code | label |
|---|---|
| `raw_materials` | Raw Materials |
| `pumps` | Pumps |
| `motors` | Motors |
| `instruments` | Instruments |
| `valves` | Valves |
| `electrical_control` | Electrical / Control |
| `bought_out_packages` | Bought-out Packages |

---

#### Table: `buy_subgroups`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `buy_group_id` | integer | NOT NULL FK → `buy_groups(id)` ON DELETE RESTRICT | |
| `code` | varchar(60) | NOT NULL | Scoped to group |
| `label` | varchar(120) | NOT NULL | Display name |
| `sort_order` | integer | NOT NULL DEFAULT 0 | |
| `is_active` | boolean | NOT NULL DEFAULT true | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL DEFAULT NOW() | |

**Index:** `UNIQUE (buy_group_id, code)`

**Seed data (subset):**

| Group | Subgroup code | Subgroup label |
|---|---|---|
| raw_materials | plates | Plates |
| raw_materials | pipes | Pipes |
| raw_materials | fittings | Fittings |
| raw_materials | flanges | Flanges |
| raw_materials | fasteners | Fasteners |
| raw_materials | gaskets | Gaskets |
| raw_materials | structural_steel | Structural Steel |
| pumps | centrifugal | Centrifugal Pumps |
| pumps | gear | Gear Pumps |
| pumps | screw | Screw Pumps |
| pumps | multistage | Multistage Pumps |
| pumps | dosing_metering | Dosing / Metering Pumps |
| pumps | pump_skid | Pump Skid Packages |
| motors | non_flameproof | Non-Flameproof Motors |
| motors | flameproof | Flameproof Motors |
| motors | vertical_horizontal | Vertical / Horizontal Motors |
| motors | high_efficiency | High Efficiency Motors (IE3/IE4) |
| motors | vfd_compatible | VFD Compatible Motors |
| instruments | pressure | Pressure Instruments |
| instruments | temperature | Temperature Instruments |
| instruments | flow | Flow Instruments |
| instruments | level | Level Instruments |
| valves | isolation | Isolation Valves |
| valves | control | Control Valves |
| valves | safety | Safety Valves |
| electrical_control | panels | Panels |
| electrical_control | components | Electrical Components |
| electrical_control | field_items | Field Items |
| electrical_control | cabling | Cabling |
| bought_out_packages | general | General Bought-out Package |

---

#### Table: `uom_master`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `code` | varchar(20) | UNIQUE NOT NULL | `NOS`, `KG`, `MTR`, `SET`, `LOT`, `LTR`, `M3`, `MTRX`, `PAIR`, `ROLL` |
| `label` | varchar(60) | NOT NULL | Display label |
| `category` | varchar(40) | | `Quantity`, `Weight`, `Length`, `Volume`, `Set` |
| `is_active` | boolean | NOT NULL DEFAULT true | |
| `sort_order` | integer | NOT NULL DEFAULT 0 | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |

**Seed data:** NOS, KG, MTR, SET, LOT, LTR, M3, MTRX, PAIR, ROLL (minimum; extendable by Admin).

> **Scope note:** `uom_master` is used only by new Phase 0–3 tables. All existing tables (`master_items.uom`, `epc_bom_lines.component_uom`, etc.) retain their free-text UOM fields and are not altered.

---

#### Phase 0 API Routes

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/buy-groups` | any | List active groups with nested subgroups |
| `GET` | `/api/buy-groups/:id/subgroups` | any | Subgroups for one group |
| `POST` | `/api/buy-groups` | Superuser | Create group |
| `PATCH` | `/api/buy-groups/:id` | Superuser | Edit label, sort_order, is_active |
| `POST` | `/api/buy-subgroups` | Admin | Body: `{ buyGroupId, code, label }` |
| `PATCH` | `/api/buy-subgroups/:id` | Admin | Edit label, sort_order, is_active |
| `GET` | `/api/uom-master` | any | List active UOMs; optional `?category=` |
| `POST` | `/api/uom-master` | Superuser | Create UOM entry |
| `PATCH` | `/api/uom-master/:id` | Superuser | Edit label, is_active, sort_order |

---

### Phase 1 — Standard BUY Package (Catalog)

**Purpose:** Reusable procurement templates linked to catalog products. Created and maintained by the engineering/procurement catalog team. Referenced by project buy lists but never modified once active.

---

#### Table: `buy_package_headers`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `product_id` | integer | NOT NULL FK → `products(id)` ON DELETE RESTRICT | The offer catalog product this package belongs to |
| `package_code` | varchar(30) | UNIQUE NOT NULL | System or manually assigned |
| `name` | varchar(255) | NOT NULL | |
| `description` | text | | |
| `version` | integer | NOT NULL DEFAULT 1 | Incremented on new version for same product |
| `status` | varchar(20) | NOT NULL DEFAULT `'draft'` | `draft` \| `active` \| `archived` |
| `is_active` | boolean | NOT NULL DEFAULT true | |
| `created_by` | integer | FK → `users(id)` | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL DEFAULT NOW() | |

**Index:** `UNIQUE (product_id, version)`  
**Business rule:** Only one `active` package per `product_id` at a time — enforced at application layer on activate (not via DB constraint, to allow clean supersession).

---

#### Table: `buy_package_lines`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `buy_package_header_id` | integer | NOT NULL FK → `buy_package_headers(id)` ON DELETE CASCADE | |
| `line_number` | integer | NOT NULL | Auto-incremented per package |
| `buy_group_id` | integer | NOT NULL FK → `buy_groups(id)` ON DELETE RESTRICT | |
| `buy_subgroup_id` | integer | NOT NULL FK → `buy_subgroups(id)` ON DELETE RESTRICT | |
| `uom_id` | integer | NOT NULL FK → `uom_master(id)` ON DELETE RESTRICT | |
| `generic_requirement` | text | NOT NULL | Descriptive placeholder, e.g. "Feed Pump", "Suction strainer" |
| `default_quantity` | decimal(10,2) | NOT NULL DEFAULT 1 | |
| `default_specification` | text | | |
| `technical_attributes` | jsonb | | Group-specific structured fields (see below) |
| `selection_required` | boolean | NOT NULL DEFAULT true | |
| `datasheet_required` | boolean | NOT NULL DEFAULT false | |
| `inspection_required` | boolean | NOT NULL DEFAULT false | |
| `certificate_required` | boolean | NOT NULL DEFAULT false | |
| `compliance_required` | boolean | NOT NULL DEFAULT false | |
| `notes` | text | | |
| `sort_order` | integer | NOT NULL DEFAULT 0 | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL DEFAULT NOW() | |

> **Correction applied:** No SQL CHECK constraint with subquery for subgroup-belongs-to-group. Enforced at API layer: on `POST /lines` and `PATCH /buy-package-lines/:id`, server queries `buy_subgroups WHERE id = :buySubgroupId AND buy_group_id = :buyGroupId`; returns 422 if mismatch.

**`technical_attributes` JSONB schema by group:**

| Group | Structured fields |
|---|---|
| `pumps` | `flow_m3hr`, `head_m`, `fluid`, `operating_temp_c`, `moc`, `seal_type`, `mounting`, `motor_coupling` (bool), `duty_class` |
| `motors` | `kw`, `hp`, `voltage_v`, `phase`, `frequency_hz`, `rpm`, `duty`, `mounting`, `ip_rating`, `area_classification`, `efficiency_class` |
| `instruments` | `measurement_type`, `range_min`, `range_max`, `range_unit`, `process_fluid`, `connection_size_mm` |
| `valves` | `valve_type`, `size_mm`, `rating_class`, `end_connection`, `moc_body`, `moc_trim` |
| `electrical_control` | `panel_type`, `voltage_v`, `phase`, `ip_rating`, `enclosure_material` |
| `raw_materials`, `bought_out_packages` | `{}` or free extension keys |

---

#### Phase 1 API Routes

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/buy-packages` | any | List; `?productId=`, `?status=` |
| `GET` | `/api/buy-packages/:id` | any | Single package with lines, group/subgroup/UOM labels |
| `POST` | `/api/buy-packages` | Manager | Body: `{ productId, packageCode, name, description }` |
| `PATCH` | `/api/buy-packages/:id` | Manager | Edit header (draft only) |
| `POST` | `/api/buy-packages/:id/activate` | Senior Manager | draft → active; requires ≥ 1 line |
| `POST` | `/api/buy-packages/:id/archive` | Senior Manager | active → archived |
| `GET` | `/api/buy-packages/:id/lines` | any | |
| `POST` | `/api/buy-packages/:id/lines` | Manager | draft only; subgroup-in-group validated at API |
| `PATCH` | `/api/buy-package-lines/:id` | Manager | draft only |
| `DELETE` | `/api/buy-package-lines/:id` | Manager | draft only |

**UI page:** `/products/buy-packages`  
List of packages with product family filter. Expandable rows: group/subgroup/flag display, technical attribute dialog adapts to selected group (pump form ≠ motor form ≠ generic).

---

### Phase 2 — Project BUY Procurement List

**Purpose:** Project-specific procurement list derived from a standard package (or created manually). Fully editable while draft; immutable once released; changes require supersession.

---

#### Table: `project_buy_list_headers`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `project_id` | integer | NOT NULL FK → `projects(id)` ON DELETE CASCADE | |
| `project_item_id` | integer | NOT NULL FK → `project_items(id)` ON DELETE CASCADE | Parent assembly item |
| `source_package_id` | integer | FK → `buy_package_headers(id)` ON DELETE SET NULL | Null if created manually |
| `list_number` | varchar(35) | UNIQUE NOT NULL | EPC-coded: `{CC}-{FY}-{SEQ}-BPL-{NNN}` |
| `revision_code` | varchar(5) | NOT NULL DEFAULT `'A'` | Incremented on supersession |
| `is_current` | boolean | NOT NULL DEFAULT true | |
| `status` | varchar(30) | NOT NULL DEFAULT `'draft'` | See lifecycle below |
| `supersedes_id` | integer | FK → `project_buy_list_headers(id)` ON DELETE SET NULL | |
| `superseded_by` | integer | | FK to replacement header |
| `superseded_at` | timestamp | | |
| `supersession_reason` | text | | |
| `revision_notes` | text | | |
| `submitted_by` | integer | FK → `users(id)` | |
| `submitted_at` | timestamp | | |
| `submission_note` | text | | |
| `reviewed_by` | integer | FK → `users(id)` | |
| `reviewed_at` | timestamp | | |
| `review_note` | text | | |
| `review_recommendation` | varchar(30) | | `approve` \| `reject` \| `approve_with_comments` |
| `released_by` | integer | FK → `users(id)` | |
| `released_at` | timestamp | | |
| `release_note` | text | | |
| `cancelled_by` | integer | FK → `users(id)` | |
| `cancelled_at` | timestamp | | |
| `cancel_reason` | text | | |
| `created_by` | integer | FK → `users(id)` | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL DEFAULT NOW() | |

**Index:** `UNIQUE (list_number) WHERE is_current = true` (partial unique index)

---

#### List Lifecycle

```
draft ──[submit]──► under_review ──[review with recommendation]──► under_review
                         │                                              │
                  [revert-to-draft]                              [release] (Senior Manager)
                         │                                              │
                       draft                                       released ──[lock]──► locked
                                                                       │
                                                               [supersede] (Senior Manager)
                                                                       │
                                                               superseded + new draft spawned

draft | under_review ──[cancel]──► canceled
released BOMs cannot be cancelled — must supersede
```

**Transition guards (same pattern as BOM lifecycle):**

| Transition | From Status | Min Role | Extra Guard |
|---|---|---|---|
| submit | `draft` | Manager | ≥ 1 line; all lines have `tag_no`, `equipment_reference`, `service_description` populated |
| revert-to-draft | `under_review` | Manager | Clears all review fields |
| review | `under_review` | Manager | Submitter ≠ reviewer |
| release | `under_review` (post-review) | Senior Manager | Project not frozen |
| lock | `released` | Senior Manager | Project cost not locked |
| cancel | `draft`, `under_review` | Senior Manager | `released` → must supersede |
| supersede | `released`, `locked` | Senior Manager | `is_current = true`; not already superseded |

---

#### Table: `project_buy_list_lines`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `buy_list_header_id` | integer | NOT NULL FK → `project_buy_list_headers(id)` ON DELETE CASCADE | |
| `line_number` | integer | NOT NULL | `MAX(line_number) + 1` per header |
| `buy_group_id` | integer | NOT NULL FK → `buy_groups(id)` ON DELETE RESTRICT | |
| `buy_subgroup_id` | integer | NOT NULL FK → `buy_subgroups(id)` ON DELETE RESTRICT | |
| `uom_id` | integer | NOT NULL FK → `uom_master(id)` ON DELETE RESTRICT | |
| `generic_requirement` | text | NOT NULL | |
| `quantity` | decimal(10,2) | NOT NULL DEFAULT 1 | |
| `required_date` | date | | |
| `specification` | text | | |
| `technical_attributes` | jsonb | | Group-specific; inherits from package, overridable per project |
| `tag_no` | varchar(80) | NOT NULL | Equipment tag: `P-101A`, `HE-201` |
| `equipment_reference` | varchar(120) | NOT NULL | Parent equipment or system reference |
| `service_description` | varchar(255) | NOT NULL | Process service description |
| `selection_required` | boolean | NOT NULL DEFAULT true | |
| `datasheet_required` | boolean | NOT NULL DEFAULT false | |
| `inspection_required` | boolean | NOT NULL DEFAULT false | |
| `certificate_required` | boolean | NOT NULL DEFAULT false | |
| `compliance_required` | boolean | NOT NULL DEFAULT false | |
| `status` | varchar(30) | NOT NULL DEFAULT `'open'` | `open` \| `selected` \| `datasheet_submitted` \| `approved` \| `canceled` |
| `selected_master_item_id` | integer | FK → `master_items(id)` ON DELETE SET NULL | Denormalized from selection; set on approve |
| `source_package_line_id` | integer | FK → `buy_package_lines(id)` ON DELETE SET NULL | Null if line added manually |
| `planning_record_id` | integer | FK → `item_planning_records(id)` ON DELETE SET NULL | Set after raise-pr |
| `notes` | text | | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL DEFAULT NOW() | |

> **Subgroup-in-group validation:** Enforced at API layer on `POST /lines` and `PATCH /buy-list-lines/:id`. No SQL CHECK constraint with subquery.

---

#### Package Copy on Offer → Order Conversion

Hook inside existing `POST /api/projects` route (where `source_offer_id` is set):

1. For each `offer_items` row seeded into `project_items`, resolve `offer_items.product_id`
2. Query `buy_package_headers WHERE product_id = :productId AND status = 'active' ORDER BY version DESC LIMIT 1`
3. If found:
   - Insert `project_buy_list_headers` (status = `draft`, `source_package_id` = package id)
   - Deep-copy all `buy_package_lines` → `project_buy_list_lines`:
     - `buy_group_id`, `buy_subgroup_id`, `uom_id`, `generic_requirement`, `quantity`, `specification`, `technical_attributes`, all flags copied directly
     - `tag_no`, `equipment_reference`, `service_description` set to `''` (user must fill before submit)
   - Log `project_workflow_events` event: `buy_list_auto_created`
4. If no active package found: no list created; user creates manually from page

**Pre-submit validation gate:** `SELECT COUNT(*) FROM project_buy_list_lines WHERE buy_list_header_id = :id AND (tag_no = '' OR equipment_reference = '' OR service_description = '') > 0` → reject submit with per-line error list.

---

#### Phase 2 API Routes

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/projects/:projectId/buy-lists` | any | `?status=`, `?allRevisions=` |
| `GET` | `/api/buy-lists/:id` | any | Header + lines with joined labels |
| `POST` | `/api/projects/:projectId/buy-lists` | Manager | Body: `{ projectItemId, sourcePackageId? }` |
| `PATCH` | `/api/buy-lists/:id` | Manager | Header fields; draft only |
| `POST` | `/api/buy-lists/:id/submit-for-review` | Manager | Validates all lines complete |
| `POST` | `/api/buy-lists/:id/revert-to-draft` | Manager | Clears review fields |
| `POST` | `/api/buy-lists/:id/review` | Manager | Body: `{ recommendation, reviewNote }` |
| `POST` | `/api/buy-lists/:id/release` | Senior Manager | |
| `POST` | `/api/buy-lists/:id/lock` | Senior Manager | |
| `POST` | `/api/buy-lists/:id/cancel` | Senior Manager | Body: `{ cancelReason }` |
| `POST` | `/api/buy-lists/:id/supersede` | Senior Manager | Body: `{ supersessionReason }` |
| `GET` | `/api/buy-lists/:id/lines` | any | |
| `POST` | `/api/buy-lists/:id/lines` | Manager | draft only; all mandatory fields required |
| `PATCH` | `/api/buy-list-lines/:id` | Manager | draft only; subgroup validated at API |
| `DELETE` | `/api/buy-list-lines/:id` | Manager | draft only |

**UI page:** `/epc/buy-list-control`  
Same layout pattern as `/epc/bom-controls`. Project selector, status filter, stats bar, expandable rows with line table, lifecycle action buttons, revision history card, document panel.

---

### Phase 3 — Selection & Datasheet Workflow

**Purpose:** For each released/locked buy list line where `selection_required = true`, capture the vendor item selection and (where `datasheet_required = true`) the datasheet upload and approval before the line may feed PR/PO.

---

#### Table: `buy_list_line_selections`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | serial | PK | |
| `buy_list_line_id` | integer | UNIQUE NOT NULL FK → `project_buy_list_lines(id)` ON DELETE CASCADE | One active selection per line |
| `master_item_id` | integer | NOT NULL FK → `master_items(id)` ON DELETE RESTRICT | |
| `item_code` | varchar(100) | | Snapshot at selection time |
| `item_description` | text | | Snapshot |
| `item_specification` | text | | Snapshot |
| `drawing_number` | varchar(100) | | Vendor GA drawing or vendor document number |
| `drawing_revision` | varchar(20) | | Revision of drawing at time of selection |
| `selected_by` | integer | NOT NULL FK → `users(id)` | |
| `selected_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `datasheet_required` | boolean | NOT NULL | Copied from line at selection time |
| `datasheet_uploaded` | boolean | NOT NULL DEFAULT false | |
| `datasheet_gcs_bucket` | varchar(100) | | Always `thermopac_storage`; server-set only |
| `datasheet_gcs_object_path` | varchar(500) | | Server-generated path; never accepted from client |
| `datasheet_original_filename` | varchar(255) | | |
| `datasheet_mime_type` | varchar(100) | | |
| `datasheet_file_size_bytes` | bigint | | |
| `datasheet_checksum_sha256` | varchar(64) | | |
| `datasheet_revision_seq` | integer | NOT NULL DEFAULT 1 | Increments on re-upload after rejection |
| `datasheet_uploaded_by` | integer | FK → `users(id)` | |
| `datasheet_uploaded_at` | timestamp | | |
| `approval_status` | varchar(20) | NOT NULL DEFAULT `'pending'` | `pending` \| `approved` \| `rejected` |
| `approved_by` | integer | FK → `users(id)` | |
| `approved_at` | timestamp | | |
| `rejection_reason` | text | | |
| `notes` | text | | |
| `created_at` | timestamp | NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL DEFAULT NOW() | |

---

#### GCS Path Structure for Datasheets

> **Rule:** Server constructs path. Client sends file bytes only. No client-provided path accepted.

**GCS storage — two fields, always stored separately:**

| DB column | Value |
|---|---|
| `datasheet_gcs_bucket` | `thermopac_storage` (fixed; server-set only) |
| `datasheet_gcs_object_path` | structured object path below; server-generated only; never accepted from client |

**Object path pattern:**
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{listNumber}/{tagNo}/{lineId}_ds-rev-{seq}.{ext}
```

**Segment definitions:**

| Position | Segment | Meaning | Source |
|---|---|---|---|
| 1 | `TPEL` | Fixed root prefix (Thermopac Equipments Pvt Ltd) | Hardcoded |
| 2 | `{CC}` | Continent Code | `projects.continentCode` (e.g., `EU`) |
| 3 | `{CO}` | Country Code | `projects.countryCode` (e.g., `TR`) |
| 4 | `{Cust}` | Customer BP code | `customers.bpCode` joined via `projects.customerId` (e.g., `ACI`) |
| 5 | `{FY}` | Financial year (numeric, 4-digit) | `projects.fyCode` (e.g., `2627`) |
| 6 | `{NNN}` | Project sequence number (zero-padded) | `projects.projectSeq` (e.g., `013`) |
| 7–8 | `PROCUREMENT/DATASHEETS` | Fixed module segment | Hardcoded |
| 9 | `{listNumber}` | Buy list document number | `project_buy_list_headers.list_number` |
| 10 | `{tagNo}` | Equipment tag (sanitized) | `project_buy_list_lines.tag_no` (spaces → underscores; chars outside `[A-Za-z0-9_\-]` stripped) |
| 11 | `{lineId}_ds-rev-{seq}.{ext}` | Line PK + revision counter + extension | `project_buy_list_lines.id`, `buy_list_line_selections.datasheet_revision_seq`, MIME-derived ext |

**Example:**
```
Bucket:      thermopac_storage
Object path: TPEL/EU/TR/ACI/2627/013/PROCUREMENT/DATASHEETS/2627-013-BPL-001/P-101A/42_ds-rev-1.pdf
```

**Path construction rules:**
- Segment order is fixed: `CC` (continent) before `CO` (country) — matching EPC project root structure
- All segments resolved server-side at upload time; no segment may be supplied or influenced by the client
- `{Cust}` falls back to the leading numeric portion of `projects.code` if `customers.bpCode` is null
- `{tagNo}` is sanitized but case-preserved; sanitization applied before path construction
- Bucket and object path stored in separate columns (`datasheet_gcs_bucket`, `datasheet_gcs_object_path`) — never concatenated into a single column
- On re-upload after rejection: `datasheet_revision_seq` increments; the superseded `datasheet_gcs_object_path` is queued in `gcs_object_deletions` (existing mechanism) before the new path is written

---

#### Selection State Machine per Line

```
open
 └──[POST /select (masterItemId)]──► selected
       ├── (datasheet_required = false)
       │     └──[POST /approve]──► approved  ✓ eligible for raise-pr
       └── (datasheet_required = true)
             └──[POST /upload-datasheet]──► datasheet_submitted
                   ├──[POST /approve]──► approved  ✓
                   └──[POST /reject (rejectionReason)]──► selected
                         └──[POST /upload-datasheet]──► datasheet_submitted (revision_seq++)

Any non-approved state ──[DELETE /selection]──► open (GCS object queued for deletion)
```

When `approved`:
- `buy_list_line_selections.approval_status = 'approved'`
- `project_buy_list_lines.status = 'approved'`
- `project_buy_list_lines.selected_master_item_id = master_item_id`

---

#### Phase 3 API Routes

| Method | Path | Min Role | Description |
|---|---|---|---|
| `POST` | `/api/buy-list-lines/:id/select` | any (project member) | Body: `{ masterItemId, drawingNumber?, drawingRevision?, notes? }`. List must be `released`/`locked`. Upsert: if existing selection with `approval_status != 'approved'` → delete and re-create |
| `PATCH` | `/api/buy-list-lines/:id/selection` | any (project member) | Update `drawingNumber`, `drawingRevision`, `notes` only. `master_item_id` change requires full re-select |
| `POST` | `/api/buy-list-lines/:id/selection/upload-datasheet` | any (project member) | `multipart/form-data`; field: `datasheet`. Server constructs GCS path; uploads; sets all `datasheet_*` fields |
| `POST` | `/api/buy-list-lines/:id/selection/approve` | Manager | Guard: `datasheet_required → datasheet_uploaded = true` |
| `POST` | `/api/buy-list-lines/:id/selection/reject` | Manager | Body: `{ rejectionReason }` |
| `DELETE` | `/api/buy-list-lines/:id/selection` | Manager | Guard: `approval_status != 'approved'`. Queues GCS deletion |

---

### Phase 4 — Approved BUY Items to PR / PO / QC

**Purpose:** Feed approved buy list lines into the existing procurement chain. No structural changes to existing tables except two additive FK columns on `item_planning_records`.

---

#### Schema additions (additive only)

**`item_planning_records`** — two new nullable columns:

| Column | Type | Notes |
|---|---|---|
| `source_buy_list_header_id` | integer | FK → `project_buy_list_headers(id)` ON DELETE SET NULL |
| `source_buy_list_line_id` | integer | FK → `project_buy_list_lines(id)` ON DELETE SET NULL |

**`project_items`** — one new nullable column:

| Column | Type | Notes |
|---|---|---|
| `tag_no` | varchar(80) | Equipment tag for items sourced from buy list; nullable for backward compatibility |

> **Correction applied:** `tag_no` added directly to `project_items` rather than encoding in `notes`. Used as the dedup key for raise-pr.

**`VALID_PROJECT_ITEM_SOURCES`** constant (in `shared/schema.ts`):  
Extended from `['sales_offer', 'manual', 'bom_explosion']` to `['sales_offer', 'manual', 'bom_explosion', 'buy_list']`.

---

#### `POST /api/buy-list-lines/:id/raise-pr` — Logic

```
Pre-guards:
  1. line.status = 'approved'
  2. buy_list_headers.status IN ('released', 'locked')
  3. line.selected_master_item_id IS NOT NULL
  4. Project not frozen (guardProjectNotFrozen)
  5. Project cost not locked (guardCostNotLocked)

Duplicate prevention:
  IF line.planning_record_id IS NOT NULL:
    → Query item_planning_records by id
    → IF status NOT IN ('canceled', 'superseded') → return 409 "Planning record already active"
    → IF canceled/superseded → allow re-raise (proceed)

project_items dedup (by master_item_id + tag_no + source):
  SELECT id FROM project_items
  WHERE project_id   = :projectId
    AND item_id      = :selectedMasterItemId
    AND tag_no       = :tagNo
    AND source       = 'buy_list'
    AND status      != 'Cancelled'
  → Found: reuse; UPDATE required_quantity = line.quantity
  → Not found: INSERT new project_items row with source='buy_list', tag_no=line.tag_no

item_planning_records INSERT:
  planning_type               = 'procurement'
  source                      = 'buy_list'
  source_buy_list_header_id   = header.id
  source_buy_list_line_id     = line.id
  quantity                    = line.quantity
  master_item_id              = line.selected_master_item_id
  project_item_id             = (reused or new project_items.id)
  notes                       = 'Tag: {tagNo} | {serviceDescription} | {equipmentReference}'
  planning_number             = epcCoding.generateDocumentNumber(projectId, 'PLN')

Post-insert:
  UPDATE project_buy_list_lines SET planning_record_id = :newPlanningRecordId

Response:
  { success: true, planningRecordId, projectItemId, isReused: bool }
```

The planning record then follows the existing lifecycle:  
`draft → under_review → released` → auto-creates `procurement_execution_records` → `po_preparation_records` → `epc_purchase_orders` → `quality_planning_records` → `inspection_execution_records`

---

#### Phase 4 API Routes

| Method | Path | Min Role | Description |
|---|---|---|---|
| `POST` | `/api/buy-list-lines/:id/raise-pr` | any (project member) | Creates planning record; returns `{ planningRecordId, projectItemId, isReused }` |
| `GET` | `/api/buy-lists/:id/procurement-status` | any | Per-line downstream chain summary: planning → exec → PO prep → PO → QC status |

---

### Phase 5 — Bulk Operations and UI Polish

**Purpose:** Batch operations for Selection, Approval, and Raise-PR across multiple lines. Plus UI completion for procurement status display.

All three bulk endpoints:
- Accept an array of line IDs belonging to the same buy list
- Process each line independently inside a database transaction using savepoints
- Per-line error does not abort the batch — collected and returned
- Return `{ processed, succeeded, skipped, errors[], results[] }`

---

#### `POST /api/buy-lists/:id/bulk-select`

```
Body:
{
  "lines": [
    { "lineId": 42, "masterItemId": 301, "drawingNumber": "VDR-001", "drawingRevision": "B" },
    { "lineId": 43, "masterItemId": 305 }
  ]
}

Guards: buy list status IN ('released', 'locked'); all lineIds ∈ this list
Per-line skip condition: line already approved (skipped, not error)
Per-line error: masterItemId not found; line belongs to different list
Per-line behavior: same upsert as single /select
```

---

#### `POST /api/buy-lists/:id/bulk-approve`

```
Body:
{
  "lineIds": [42, 43, 44],
  "approvalNote": "Approved after vendor review — 2026-05-05"
}

Guards: Manager+; buy list status IN ('released', 'locked')
Per-line skip: already approved
Per-line error: no selection exists; datasheet_required=true AND datasheet_uploaded=false
Per-line behavior: identical to single /approve
```

---

#### `POST /api/buy-lists/:id/bulk-raise-pr`

```
Body: { "lineIds": [42, 43, 44] }

Guards: buy list status IN ('released', 'locked'); project not frozen; cost not locked
Per-line error: line.status != 'approved'; selected_master_item_id IS NULL
Per-line behavior: identical duplicate-safe logic as single /raise-pr
Each line processed with per-line savepoint; others continue on error
```

---

#### `GET /api/buy-lists/:id/procurement-status`

Single LEFT JOIN query returning per-line downstream state:

```json
{
  "lines": [
    {
      "lineId": 42,
      "tagNo": "P-101A",
      "lineStatus": "approved",
      "planningRecordId": 901,
      "planningStatus": "released",
      "procurementExecutionId": 203,
      "procurementStatus": "ready",
      "poPrepId": 91,
      "poPrepStatus": "approved",
      "epcPoId": 44,
      "epcPoStatus": "issued",
      "qualityPlanId": 55,
      "qualityStatus": "pending_inspection"
    }
  ]
}
```

---

#### UI Completions in Phase 5

- **`/epc/buy-list-control`** expanded row:
  - Selection card: master item picker (filtered `make_or_buy = 'Buy'`), drawing number/revision fields, datasheet upload zone (shown only if `datasheet_required = true`), approve/reject controls (Manager+), "Raise PR" button, link to planning record when set
  - Procurement Status card: per-line chain status pulled from `/procurement-status` endpoint with stage badges
  - Bulk action toolbar (shown when lines are selected via checkbox): Bulk Select, Bulk Approve, Bulk Raise PR
  - Technical attributes form adapts to `buy_group_id`: pump form / motor form / generic form
- **`/products/buy-packages`**:
  - Package list with product family filter
  - Line table with group/subgroup/flag badges
  - Group-adaptive technical attribute dialog

---

## 4. Final Approved Corrections

The following corrections from the review session are confirmed and applied in this baseline:

| # | Correction | Applied Where |
|---|---|---|
| 1 | **Remove SQL CHECK constraint with subquery** for subgroup-belongs-to-group | Phase 1 & 2: enforced at API layer only; DB constraint removed from plan |
| 2 | **Add `project_items.tag_no varchar(80)`** | Phase 4 schema additions; used as dedup key in raise-pr |
| 3 | **Enforce subgroup belongs to group at API layer** | Phase 1 `POST /lines`, `PATCH /buy-package-lines/:id`; Phase 2 `POST /lines`, `PATCH /buy-list-lines/:id` |
| 4 | **Do not accept client-provided GCS paths** | Phase 3: only file bytes accepted from client; all GCS fields server-set |
| 5 | **Datasheet GCS path must be server-generated** | Phase 3: bucket `thermopac_storage` (fixed); object path `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{listNumber}/{tagNo}/{lineId}_ds-rev-{seq}.{ext}` — CC = Continent Code, CO = Country Code; bucket and object path stored in separate columns; all segments resolved server-side; no client input accepted |
| 6 | **Keep existing procurement chain unchanged** | Phase 4: only two additive columns on `item_planning_records`; no other existing tables modified |

---

## 5. Audit Checklist

To be completed during and after implementation. Each item requires evidence before the module is considered production-ready.

### Schema Migration Evidence

- [ ] Migration file exists and runs cleanly: `buy_groups` created and seeded (7 rows)
- [ ] Migration file exists and runs cleanly: `buy_subgroups` created and seeded (all subgroups)
- [ ] Migration file exists and runs cleanly: `uom_master` created and seeded
- [ ] Migration file exists: `buy_package_headers`, `buy_package_lines` created
- [ ] Migration file exists: `project_buy_list_headers`, `project_buy_list_lines` created
- [ ] Migration file exists: `buy_list_line_selections` created
- [ ] Migration file exists: `project_items.tag_no varchar(80)` column added
- [ ] Migration file exists: `item_planning_records.source_buy_list_header_id`, `source_buy_list_line_id` columns added
- [ ] Partial unique index `UNIQUE (list_number) WHERE is_current = true` on `project_buy_list_headers` confirmed
- [ ] No SQL CHECK constraints with subqueries in any new table

### Route Implementation Evidence

- [ ] All Phase 0 routes respond correctly (group/subgroup/UOM CRUD)
- [ ] All Phase 1 routes respond correctly (package header + lines lifecycle)
- [ ] Subgroup-in-group validation returns 422 on mismatch (API layer only)
- [ ] All Phase 2 lifecycle routes enforce correct status transitions
- [ ] Submit guard rejects when any line has blank `tag_no` / `equipment_reference` / `service_description`
- [ ] All Phase 3 selection routes enforce correct state machine
- [ ] `/raise-pr` returns 409 when active planning record already exists for line
- [ ] `/raise-pr` reuses existing `project_items` row when `master_item_id + tag_no + source='buy_list'` match found
- [ ] All Phase 5 bulk routes return correct `{ processed, succeeded, skipped, errors }` structure

### UI Page Evidence

- [ ] `/products/buy-packages` renders package list with product family filter
- [ ] Group-adaptive technical attribute form renders correct fields per group (pump ≠ motor ≠ generic)
- [ ] `/epc/buy-list-control` renders list with project selector, status filter, stats bar
- [ ] Line table shows group/subgroup labels (not raw codes), flag badges, status badge
- [ ] Lifecycle action buttons render correctly per status and user role
- [ ] Selection card visible only for released/locked lists with `selection_required = true` lines
- [ ] Datasheet upload zone visible only when `datasheet_required = true`
- [ ] Bulk action toolbar appears on multi-line checkbox selection
- [ ] Procurement Status card shows per-line downstream chain badges

### Offer-to-Project Copy Test

- [ ] Create a product with an active buy package (3+ lines)
- [ ] Create an offer with that product as an offer item
- [ ] Convert offer to project (POST /api/projects with sourceOfferId)
- [ ] Confirm `project_buy_list_headers` row created automatically
- [ ] Confirm all package lines deep-copied to `project_buy_list_lines`
- [ ] Confirm `tag_no`, `equipment_reference`, `service_description` are empty strings on copied lines
- [ ] Confirm submit rejected with per-line error list when EPC fields are blank
- [ ] Confirm `project_workflow_events` row of type `buy_list_auto_created` created

### Datasheet Upload Path Test

- [ ] Upload datasheet for a released buy list line
- [ ] Confirm server constructs path matching pattern: bucket = `thermopac_storage`; object path = `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{listNumber}/{tagNo}/{lineId}_ds-rev-{revisionSeq}.{ext}` (CC = Continent Code, CO = Country Code); example: `TPEL/EU/TR/ACI/2627/013/PROCUREMENT/DATASHEETS/2627-013-BPL-001/P-101A/42_ds-rev-1.pdf`
- [ ] Confirm bucket and object path stored in separate DB columns (`datasheet_gcs_bucket`, `datasheet_gcs_object_path`); never concatenated
- [ ] Confirm client cannot inject GCS path (any `gcsObjectPath` in body is ignored)
- [ ] Reject line; re-upload; confirm `datasheet_revision_seq` incremented to 2 in DB
- [ ] Confirm old GCS object path queued in `gcs_object_deletions` table after rejection re-upload

### Raise-PR Duplicate Prevention Test

- [ ] Raise PR on approved line → confirm `item_planning_records` created with correct `source='buy_list'`
- [ ] Raise PR again on same line → confirm 409 returned (active planning record exists)
- [ ] Cancel planning record; raise PR again → confirm new planning record created (re-raise allowed)
- [ ] Two different buy list lines with same `master_item_id` and same `tag_no` → confirm second raise-pr reuses the `project_items` row (`isReused: true`)
- [ ] Two different buy list lines with same `master_item_id` but different `tag_no` → confirm two separate `project_items` rows created

### Bulk Operation Test

- [ ] `bulk-select` with 5 lines: 3 valid, 1 already approved (skipped), 1 invalid masterItemId (error) → returns `processed:5, succeeded:3, skipped:1, errors:[{lineId:..., reason:...}]`
- [ ] `bulk-approve` with datasheet_required line where datasheet not uploaded → returns error for that line; others proceed
- [ ] `bulk-raise-pr` with 4 lines: 3 approved, 1 not approved → returns error for not-approved line; 3 planning records created
- [ ] Confirm transaction isolation: error on one bulk-raise-pr line does not roll back others

### Permission / Role Guard Test

- [ ] Package activate/archive — confirm requires Senior Manager; Manager gets 403
- [ ] Buy list release/lock/supersede/cancel — confirm requires Senior Manager
- [ ] Buy list submit/review/revert-to-draft — confirm requires Manager
- [ ] Selection approve/reject — confirm requires Manager
- [ ] Unauthenticated requests to any new route → 401
- [ ] Authenticated non-member accessing another project's buy list → 403 (requireProjectMembership)

---

## 6. Dependency Map

```
Phase 0 (buy_groups, buy_subgroups, uom_master)
    └── Phase 1 (buy_package_headers, buy_package_lines)
          └── Phase 2 (project_buy_list_headers, project_buy_list_lines)
                │           + offer-to-project copy hook
                └── Phase 3 (buy_list_line_selections, GCS datasheet upload)
                      └── Phase 4 (raise-pr, project_items.tag_no,
                      │            item_planning_records additive columns)
                      └── Phase 5 (bulk ops, procurement-status, UI polish)
```

No phase may begin implementation until its predecessor phase is schema-complete and routes are tested.

---

*End of baseline document. Status: AWAITING APPROVAL. Do not begin implementation until this document is approved.*
