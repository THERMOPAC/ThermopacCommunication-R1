---
name: Buy Catalog SAP Item Persistence — Phase 1
description: Architecture and implementation decisions for SAP Item Code persistence in the Buy Package Catalog.
---

## What was implemented

`getOrCreateCatalogMasterItem(pool, itemCode, description, uomCode, groupId, subgroupId, make, model)` is the single shared helper in `server/buy-catalog-sap-service.ts`. Every resolver calls it — no resolver contains its own duplicate handling.

## Concurrency pattern

`INSERT … ON CONFLICT (item_code) DO NOTHING RETURNING id, item_code, item_type`
- If RETURNING has a row → newly created, `reused: false`
- If RETURNING is empty → concurrent insert already committed; retry SELECT up to 2 times
- If SELECT returns a row with `item_type != 'catalog'` → throw collision error (`sapCodeCollision: true`)
- If SELECT still returns nothing after 2 retries → throw internal consistency error

No explicit BEGIN/COMMIT needed. Single atomic statement.

## Duplicate prevention

`master_items.item_code` UNIQUE constraint is the sole mechanism. No separate partial index on catalog identity. The same deterministic code always maps to exactly one master_items row.

## Database — two environments

The project has TWO separate databases:
- `DATABASE_URL` → dev/test (`helium` host) — used by vitest and the app
- `NEON_DATABASE_URL` → production Neon endpoint

The migration `20260728_add_buy_catalog_sap_columns.sql` was run against both. Always run schema changes against both.

## Column state after Phase 1

`master_items` new columns: `item_type TEXT NOT NULL DEFAULT 'project'`, `buy_group_id INT NULL`, `buy_subgroup_id INT NULL`, `catalog_make TEXT NULL`, `catalog_model TEXT NULL`

`buy_package_lines` new columns: `master_item_id INT NULL REFERENCES master_items(id) ON DELETE SET NULL`, `sap_item_code TEXT NULL`

## Resolver state after Phase 1

- 8 old `BEGIN/SELECT FOR UPDATE/INSERT/COMMIT` resolver bodies → all replaced with `return getOrCreateCatalogMasterItem(...)`
- 17 calls to undefined `resolveOrCreateSapMasterItem` → all renamed to `getOrCreateCatalogMasterItem`
- `resolveCatalogSapItemCode` → refactored to build code first, then call helper
- **Zero** TypeScript diagnostics in `buy-catalog-sap-service.ts`

## UOM code

The UOM code for "Numbers/Each" in `uom_master` is `NOS` (uppercase), not `Nos`.

## Deferred (Phase 2+)

- Raw Materials → Flanges builder
- Raw Materials → Profiles subgroup seed (pending confirmation: active or obsolete?)
- Instruments spec builders (×4: Pressure, Temperature, Flow, Level)
