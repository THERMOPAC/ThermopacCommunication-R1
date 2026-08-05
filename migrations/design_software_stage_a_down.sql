-- ═══════════════════════════════════════════════════════════════════════════════
-- Design Software Module — Stage A Migration (DOWN / ROLLBACK)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Drops all Design Software Stage A tables in FK-safe order (children first).
-- CASCADE is included to handle any residual FK references from child tables.
--
-- WARNING: This permanently destroys all Design Software data.
-- Run only on a disposable or clean test database.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Child tables first (depend on revisions)
DROP TABLE IF EXISTS design_software_approvals          CASCADE;
DROP TABLE IF EXISTS design_software_assumptions         CASCADE;
DROP TABLE IF EXISTS design_software_calculation_runs    CASCADE;
DROP TABLE IF EXISTS design_software_results             CASCADE;
DROP TABLE IF EXISTS design_software_inputs              CASCADE;

-- Revisions depends on designs
DROP TABLE IF EXISTS design_software_revisions           CASCADE;

-- Master table (remove after revisions to avoid FK violation without CASCADE)
DROP TABLE IF EXISTS design_software_designs             CASCADE;

-- Independent sequence table
DROP TABLE IF EXISTS design_software_number_sequences    CASCADE;
