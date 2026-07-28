-- ============================================================================
-- Migration: add SAP Item Code persistence columns for Buy Package Catalog
-- Date:      2026-07-28
-- Rollback:  see rollback section at bottom of this file
-- ============================================================================

BEGIN;

-- ── 1. master_items: catalog identity columns ────────────────────────────────

ALTER TABLE master_items
  ADD COLUMN IF NOT EXISTS item_type       TEXT     NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS buy_group_id    INTEGER  NULL
      REFERENCES buy_groups(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buy_subgroup_id INTEGER  NULL
      REFERENCES buy_subgroups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_make    TEXT     NULL,
  ADD COLUMN IF NOT EXISTS catalog_model   TEXT     NULL;

-- Back-fill: belt-and-braces for any row that may have received NULL
UPDATE master_items SET item_type = 'project' WHERE item_type IS NULL;

-- ── 2. master_items: performance indexes ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_master_items_item_type
  ON master_items (item_type);

CREATE INDEX IF NOT EXISTS idx_master_items_buy_group_id
  ON master_items (buy_group_id);

CREATE INDEX IF NOT EXISTS idx_master_items_buy_subgroup_id
  ON master_items (buy_subgroup_id);

CREATE INDEX IF NOT EXISTS idx_master_items_catalog_make
  ON master_items (catalog_make);

CREATE INDEX IF NOT EXISTS idx_master_items_catalog_model
  ON master_items (catalog_model);

-- ── 3. buy_package_lines: SAP linkage columns ────────────────────────────────

ALTER TABLE buy_package_lines
  ADD COLUMN IF NOT EXISTS master_item_id INTEGER NULL
      REFERENCES master_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sap_item_code  TEXT    NULL;

-- ── 4. buy_package_lines: performance indexes ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_buy_package_lines_master_item_id
  ON buy_package_lines (master_item_id);

CREATE INDEX IF NOT EXISTS idx_buy_package_lines_sap_item_code
  ON buy_package_lines (sap_item_code);

COMMIT;

-- ============================================================================
-- ROLLBACK (run manually if needed):
-- ============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS idx_buy_package_lines_sap_item_code;
-- DROP INDEX IF EXISTS idx_buy_package_lines_master_item_id;
-- ALTER TABLE buy_package_lines
--   DROP COLUMN IF EXISTS sap_item_code,
--   DROP COLUMN IF EXISTS master_item_id;
-- DROP INDEX IF EXISTS idx_master_items_catalog_model;
-- DROP INDEX IF EXISTS idx_master_items_catalog_make;
-- DROP INDEX IF EXISTS idx_master_items_buy_subgroup_id;
-- DROP INDEX IF EXISTS idx_master_items_buy_group_id;
-- DROP INDEX IF EXISTS idx_master_items_item_type;
-- ALTER TABLE master_items
--   DROP COLUMN IF EXISTS catalog_model,
--   DROP COLUMN IF EXISTS catalog_make,
--   DROP COLUMN IF EXISTS buy_subgroup_id,
--   DROP COLUMN IF EXISTS buy_group_id,
--   DROP COLUMN IF EXISTS item_type;
-- COMMIT;
