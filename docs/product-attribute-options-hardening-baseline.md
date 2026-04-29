# Product Attribute Options — Hardening Baseline

**Status: APPROVED BASELINE**
**Date: 2026-04-28**
**Prepared by: Replit Agent**
**Approved by: User (Prasad)**

---

## 1. Current Design

### Table: `product_attribute_options`

All three attribute types (Item Family, Property 1, Property 2) are stored in a **single table** with a self-referencing `parent_id`.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | integer (serial) | NOT NULL | Primary Key |
| `attribute_type` | text | NOT NULL | `'item_family'` / `'property_1'` / `'property_2'` |
| `code` | text | NOT NULL | 3-character code |
| `label` | text | NOT NULL | Display name |
| `parent_id` | integer | YES | Self-reference → `id` in same table |
| `sort_order` | integer | YES | Default 0 |
| `is_active` | boolean | YES | Default true |
| `created_at` | timestamp | YES | Default now() |

### Current Data Counts (as at baseline)

| attribute_type | Rows | With parent_id | Without parent_id |
|---|---|---|---|
| item_family | 5 | 0 | 5 |
| property_1 | 31 | 31 | 0 |
| property_2 | 39 | 39 | 0 |

### Current Constraints

- **No FK** on `parent_id` — referential integrity not enforced at DB level
- **No UNIQUE** constraint on code — duplicate codes possible
- **No CHECK** on `attribute_type` — any string accepted
- **No audit trail** — label changes are unlogged

---

## 2. Impact Map

### Cascade Chain

```
product_attribute_options
  └─(application logic)─► products
      [item_family, item_family_label,
       item_property_1, item_property_1_label,
       item_property_2, item_property_2_label,
       item_property_3, product_code  ← all CODE/LABEL SNAPSHOTS]
      └─(text snapshot)─► 20 downstream tables
```

### Products Table — Snapshot Columns

When a product is created, attribute codes and labels are **denormalized into the product row** and frozen.

| Column | Stores |
|---|---|
| `item_family` | Item Family code snapshot |
| `item_family_label` | Item Family label snapshot |
| `item_property_1` | Property 1 code snapshot |
| `item_property_1_label` | Property 1 label snapshot |
| `item_property_2` | Property 2 code snapshot |
| `item_property_2_label` | Property 2 label snapshot |
| `item_property_3` | Property 3 code snapshot |
| `product_code` | Generated code built from attribute codes |
| `tag_no` | Equipment tag |

### Downstream Tables (All Text Snapshots — No FK to products_attribute_options)

| Table | Column | FK to products? |
|---|---|---|
| `offer_items` | `product_id` | YES → products.id |
| `offer_items` | `product_code` | NO — text snapshot |
| `epc_drawing_controls` | `item_code` | NO |
| `epc_drawing_orders` | `item_code` | NO |
| `epc_work_orders` | `item_code` | NO |
| `epc_work_order_items` | `item_code` | NO |
| `epc_bom_headers` | `item_code` | NO |
| `epc_bom_lines` | `component_item_code` | NO |
| `epc_purchase_order_items` | `item_code` | NO |
| `drawing_revisions` | `item_code` | NO |
| `design_data_sheets` | `tag_no` | NO |
| `master_items` | `item_code` | NO |
| `project_items` | `item_code`, `product_code` | NO |
| `purchase_order_items` | `item_code` | NO |
| `sap_purchase_order_items` | `item_code` | NO |
| `epc_invoices` | `item_code` | NO |
| `wo_preparation_records` | `item_code` | NO |
| `po_preparation_records` | `item_code` | NO |
| `inspection_orders` | `item_code` | NO |
| `production_execution_records` | `item_code` | NO |

**Total: 20 downstream tables using item_code / product_code as frozen text snapshots.**
**No table has any FK to `product_attribute_options`.**

---

## 3. Approved Rules

### R1 — Uniqueness Constraint

```sql
UNIQUE(attribute_type, parent_id, code)
```

Codes may repeat under different parents. Uniqueness is scoped to the full parent hierarchy:

| Type | Uniqueness Scope |
|---|---|
| item_family | `(attribute_type='item_family', parent_id=NULL, code)` |
| property_1 | `(attribute_type='property_1', parent_id=<family_id>, code)` |
| property_2 | `(attribute_type='property_2', parent_id=<prop1_id>, code)` |

### R2 — Code Field: Permanently Locked After Creation

- Code is set once at creation only.
- Code field is **read-only in the Edit form from the moment the option is saved**.
- This applies regardless of whether the option has been used downstream.
- If a code is wrong: create a new option, deactivate the old one.

### R3 — Label Edit: Allowed with Audit Trail

- Label can be edited for correction or display improvement.
- Every label change writes one row to `attribute_option_audit_log`.
- **No retroactive updates** to `products.item_family_label`, `item_property_1_label`, etc.
- **No retroactive updates** to `item_code` or `product_code` in any downstream table.
- If label meaning changes fundamentally: create a new option and deactivate the old one.

**Audit log table: `attribute_option_audit_log`**

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `option_id` | integer | FK → product_attribute_options.id |
| `old_label` | text | Previous value |
| `new_label` | text | New value |
| `changed_by` | integer | FK → users.id |
| `changed_at` | timestamp | Auto now() |

### R4 — Delete: Blocked if Used Anywhere

Before delete, API checks:

| Check | Table | Column |
|---|---|---|
| Used in products | `products` | `item_family`, `item_property_1`, `item_property_2`, `item_property_3` |
| Has child options | `product_attribute_options` | `parent_id = this id` |

If any check hits → hard block. Error: *"Cannot delete — used in N products / has M child options"*

### R5 — Deactivate: Allowed with Conditions

Deactivation (`is_active = false`) allowed only if:
1. No active child options exist with `parent_id = this id AND is_active = true`.
2. Existing downstream records remain untouched and readable.
3. Inactive options are hidden from all new-product creation dropdowns.

### R6 — FK on `parent_id`

```sql
parent_id → product_attribute_options(id) ON DELETE RESTRICT
```

- RESTRICT prevents deletion of any option that still has children.
- This DB-level guard runs before the application-level delete check.

### R7 — Snapshot Freeze Rule

- `products.product_code` is frozen at creation — never regenerated.
- All label snapshot columns (`item_family_label`, `item_property_1_label`, etc.) are frozen at creation.
- All 20 downstream `item_code` / `product_code` text columns are frozen at write time.
- Label edits in `product_attribute_options` do **not** propagate anywhere.

---

## 4. Implementation Phases

### Phase 1 — Data Audit (no schema changes)

Run before any constraint is added to confirm data is clean:

| Check | Query | Pass Condition |
|---|---|---|
| 1. Duplicate codes | `GROUP BY attribute_type, parent_id, code HAVING COUNT(*) > 1` | Zero rows |
| 2. Orphaned parent_id | LEFT JOIN parent ON child.parent_id = parent.id WHERE parent.id IS NULL | Zero rows |
| 3. Invalid attribute_type | WHERE attribute_type NOT IN (...) | Zero rows |
| 4. property_1/2 with NULL parent_id | WHERE attribute_type IN ('property_1','property_2') AND parent_id IS NULL | Zero rows |
| 5. item_family with non-NULL parent_id | WHERE attribute_type = 'item_family' AND parent_id IS NOT NULL | Zero rows |

**Phase 1 must pass all 5 checks before Phase 2 begins.**

### Phase 2 — DB Schema Changes (requires Phase 1 approval)

Applied via `npm run db:push` after schema changes in `shared/schema.ts`:

| Change | Detail |
|---|---|
| Add `UNIQUE(attribute_type, parent_id, code)` | Scoped uniqueness |
| Add `CHECK(attribute_type IN ('item_family','property_1','property_2'))` | Prevents invalid types |
| Add FK `parent_id → id ON DELETE RESTRICT` | Prevents orphan children |
| Add `updated_at` to `product_attribute_options` | Tracks last edit time |
| Add new table `attribute_option_audit_log` | Label change history |

**Correction note:** `db:push` is acceptable only because Phase 1 audit confirmed the data is clean. If Phase 1 had found violations, they would have been resolved manually before `db:push`.

### Phase 3 — API Guards

| Guard | Endpoint | Logic |
|---|---|---|
| Block code edit | `PATCH /api/product-attributes/:id` | If `code` in body → 400 error |
| Block delete if used | `DELETE /api/product-attributes/:id` | Usage check → 400 if hit |
| Block deactivate if active children | `PATCH /api/product-attributes/:id` | Check active children → 400 if hit |
| Log label change | `PATCH /api/product-attributes/:id` | If label changed → insert to audit log |

### Phase 4 — UI Changes

| Change | Where |
|---|---|
| Code field → read-only in Edit form | Edit Attribute Option dialog |
| "Used In" count badge per row | Manage Attributes table |
| Delete button → disabled + tooltip if used | Manage Attributes table |
| Deactivate warning modal with child count | Before deactivating a parent option |
| Audit log viewer | Edit dialog → "View history" link |

---

## 5. What Does NOT Change

- No retroactive update to any `product_code`, `item_code`, or label snapshot anywhere.
- No change to the 20 downstream tables.
- No change to offer, order, PO, WO, DO, DDS, drawing, or inspection records.
- Existing products remain exactly as stored.
- No existing product codes will be regenerated.

---

## 6. Phase 1 Audit Checklist & Results

**Audit run date: 2026-04-28**

| # | Check | Result | Status |
|---|---|---|---|
| 1 | Duplicate `(attribute_type, parent_id, code)` | 0 rows | PASS |
| 2 | Orphaned `parent_id` values | 0 rows | PASS |
| 3 | Invalid `attribute_type` values | 0 rows | PASS |
| 4 | `property_1`/`property_2` with NULL `parent_id` | 0 rows | PASS |
| 5 | `item_family` with non-NULL `parent_id` | 0 rows | PASS |

**All 5 checks passed. Data is clean. Phase 2 may proceed upon approval.**

---

## 7. Approval Status

| Phase | Status |
|---|---|
| Plan v2 | APPROVED BASELINE — 2026-04-28 |
| Phase 1 — Data Audit | COMPLETE — All checks passed |
| Phase 2 — DB Schema | Awaiting approval to proceed |
| Phase 3 — API Guards | Awaiting Phase 2 completion |
| Phase 4 — UI Changes | Awaiting Phase 3 completion |
