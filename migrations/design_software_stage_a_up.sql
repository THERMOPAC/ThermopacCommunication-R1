-- ═══════════════════════════════════════════════════════════════════════════════
-- Design Software Module — Stage A Migration (UP)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Migration identifier : design_software_stage_a
-- Author               : Replit Agent
-- Date applied (dev)   : 2026-08-05 (approx 06:10 UTC)
-- Environment applied  : development (Neon PostgreSQL 16)
-- Applied via          : Direct node-pg pool.query() — drizzle-kit push was
--                        bypassed due to a pre-existing validation bug in the
--                        drizzle-kit introspection of an unrelated table
--                        (statutory_filing_status partial index).  That bug
--                        does not affect this migration or any Design Software
--                        table.
-- Tracking table       : No drizzle migration tracking table is in use for this
--                        project (drizzle-kit push mode only).  Idempotency is
--                        guaranteed by IF NOT EXISTS guards and DO $$ … EXCEPTION
--                        WHEN duplicate_object THEN NULL; END $$ blocks.
-- Schema file          : shared/schema.ts (Design Software section, end of file)
-- Rollback script      : migrations/design_software_stage_a_down.sql
--
-- SAFE TO RUN:
--   • Clean (empty) database — creates everything from scratch.
--   • Already-modified development database — all statements are idempotent.
--   • Production/test environments — no existing tables are altered or dropped.
--
-- CIRCULAR FK NOTE:
--   design_software_designs.current_revision_id → design_software_revisions.id
--   cannot be declared in Drizzle schema because of the circular table reference.
--   The FK (ds_designs_current_revision_fk, DEFERRABLE INITIALLY DEFERRED,
--   ON DELETE SET NULL) is applied in Step 9 via ALTER TABLE, after both
--   dependent tables exist.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Step 1: design_software_number_sequences ──────────────────────────────────
-- Atomic sequence allocation via INSERT … ON CONFLICT … DO UPDATE RETURNING.
-- No pre-seeded rows required; first allocation creates the row automatically.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_number_sequences (
  id          serial       PRIMARY KEY,
  module_type varchar(20)  NOT NULL,
  scope_key   varchar(100) NOT NULL,
  last_seq    integer      NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS dsn_seq_module_scope_uniq
  ON design_software_number_sequences (module_type, scope_key);


-- ── Step 2: design_software_designs ──────────────────────────────────────────
-- Master design record. current_revision_id is a plain integer here;
-- the DB-level FK is added in Step 9 after design_software_revisions exists.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_designs (
  id                  serial       PRIMARY KEY,
  design_number       varchar(60)  NOT NULL,
  design_sequence     integer      NOT NULL,
  module_type         varchar(20)  NOT NULL,
  design_type         varchar(20)  NOT NULL,
  title               text         NOT NULL,
  project_id          integer      REFERENCES projects(id),          -- no cascade; RESTRICT
  linked_project_id   integer      REFERENCES projects(id),          -- no cascade; RESTRICT
  capacity            varchar(100),
  rnd_reference       varchar(100),
  rnd_customer_name   varchar(200),
  rnd_capacity        varchar(100),
  rnd_location        varchar(200),
  rnd_notes           text,
  current_revision_id integer,                                       -- FK added in Step 9
  current_status      varchar(30)  NOT NULL DEFAULT 'draft',
  archived_at         timestamp,
  created_by          integer      NOT NULL REFERENCES users(id),    -- no cascade; RESTRICT
  created_at          timestamp    NOT NULL DEFAULT NOW(),
  updated_at          timestamp    NOT NULL DEFAULT NOW(),

  CONSTRAINT ds_designs_module_type_chk
    CHECK (module_type IN ('llx')),
  CONSTRAINT ds_designs_design_type_chk
    CHECK (design_type IN ('project', 'rnd')),
  CONSTRAINT ds_designs_current_status_chk
    CHECK (current_status IN ('draft','under_review','checked','approved',
                              'issued_for_enquiry','superseded','archived')),
  CONSTRAINT ds_designs_project_type_project_id_chk
    CHECK (design_type != 'project' OR project_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ds_designs_module_number_uniq
  ON design_software_designs (module_type, design_number);
CREATE INDEX IF NOT EXISTS ds_designs_project_id_idx
  ON design_software_designs (project_id);
CREATE INDEX IF NOT EXISTS ds_designs_linked_project_id_idx
  ON design_software_designs (linked_project_id);
CREATE INDEX IF NOT EXISTS ds_designs_module_status_idx
  ON design_software_designs (module_type, current_status);
CREATE INDEX IF NOT EXISTS ds_designs_created_by_idx
  ON design_software_designs (created_by);


-- ── Step 3: design_software_revisions ────────────────────────────────────────
-- One row per revision. Partial unique index enforces single current revision.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_revisions (
  id                 serial      PRIMARY KEY,
  design_id          integer     NOT NULL
                                 REFERENCES design_software_designs(id)
                                 ON DELETE CASCADE,                  -- cascade within module only
  revision_number    integer     NOT NULL DEFAULT 0,
  status             varchar(30) NOT NULL DEFAULT 'draft',
  is_current         boolean     NOT NULL DEFAULT true,
  is_frozen          boolean     NOT NULL DEFAULT false,
  lock_version       integer     NOT NULL DEFAULT 0,
  prepared_by_id     integer     REFERENCES users(id),               -- no cascade; RESTRICT
  checked_by_id      integer     REFERENCES users(id),               -- no cascade; RESTRICT
  approved_by_id     integer     REFERENCES users(id),               -- no cascade; RESTRICT
  design_date        date,
  change_description text,
  frozen_at          timestamp,
  frozen_by_id       integer     REFERENCES users(id),               -- no cascade; RESTRICT
  created_at         timestamp   NOT NULL DEFAULT NOW(),
  updated_at         timestamp   NOT NULL DEFAULT NOW(),

  CONSTRAINT ds_revisions_status_chk
    CHECK (status IN ('draft','under_review','checked','approved',
                      'issued_for_enquiry','superseded','archived'))
);

-- (design_id, revision_number) must be unique
CREATE UNIQUE INDEX IF NOT EXISTS ds_revisions_design_rev_uniq
  ON design_software_revisions (design_id, revision_number);

-- Only one revision may be current per design at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS ds_revisions_one_current_uniq
  ON design_software_revisions (design_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS ds_revisions_design_rev_idx
  ON design_software_revisions (design_id, revision_number);


-- ── Step 4: design_software_inputs ───────────────────────────────────────────
-- One row per section per revision. Frozen guard enforced at service layer.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_inputs (
  id             serial      PRIMARY KEY,
  revision_id    integer     NOT NULL
                             REFERENCES design_software_revisions(id)
                             ON DELETE CASCADE,
  section        varchar(50) NOT NULL,
  data           jsonb       NOT NULL DEFAULT '{}',
  engine_version varchar(20) NOT NULL DEFAULT '1.0.0',
  updated_at     timestamp   NOT NULL DEFAULT NOW(),
  updated_by     integer     NOT NULL REFERENCES users(id),          -- no cascade; RESTRICT

  CONSTRAINT ds_inputs_section_chk
    CHECK (section IN ('design_basis','fluid_properties','technology_selection',
                       'ecp','ecr','comparison'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ds_inputs_revision_section_uniq
  ON design_software_inputs (revision_id, section);
CREATE INDEX IF NOT EXISTS ds_inputs_revision_id_idx
  ON design_software_inputs (revision_id);


-- ── Step 5: design_software_results ──────────────────────────────────────────
-- Accepted result snapshot per section. Frozen guard enforced at service layer.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_results (
  id                serial      PRIMARY KEY,
  revision_id       integer     NOT NULL
                                REFERENCES design_software_revisions(id)
                                ON DELETE CASCADE,
  section           varchar(50) NOT NULL,
  data              jsonb       NOT NULL DEFAULT '{}',
  engine_version    varchar(20) NOT NULL DEFAULT '1.0.0',
  calculation_class varchar(50) NOT NULL DEFAULT 'Preliminary Screening',
  computed_at       timestamp   NOT NULL DEFAULT NOW(),
  computed_by       integer     NOT NULL REFERENCES users(id),       -- no cascade; RESTRICT

  CONSTRAINT ds_results_section_chk
    CHECK (section IN ('hydraulics_common','ecp','ecr','comparison','summary'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ds_results_revision_section_uniq
  ON design_software_results (revision_id, section);
CREATE INDEX IF NOT EXISTS ds_results_revision_id_idx
  ON design_software_results (revision_id);


-- ── Step 6: design_software_calculation_runs ─────────────────────────────────
-- Immutable execution log. Rows are appended only — never updated or deleted.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_calculation_runs (
  id                 serial      PRIMARY KEY,
  revision_id        integer     NOT NULL
                                 REFERENCES design_software_revisions(id)
                                 ON DELETE CASCADE,
  calculation_type   varchar(50) NOT NULL,
  engine_name        varchar(100) NOT NULL,
  engine_version     varchar(20) NOT NULL,
  calculation_class  varchar(50) NOT NULL DEFAULT 'Preliminary Screening',
  input_snapshot     jsonb       NOT NULL,
  result_snapshot    jsonb       NOT NULL,
  warnings           jsonb       NOT NULL DEFAULT '[]',
  validation_issues  jsonb       NOT NULL DEFAULT '[]',
  calculation_status varchar(20) NOT NULL DEFAULT 'success',
  calculated_by      integer     NOT NULL REFERENCES users(id),      -- no cascade; RESTRICT
  calculated_at      timestamp   NOT NULL DEFAULT NOW(),

  CONSTRAINT ds_calc_runs_type_chk
    CHECK (calculation_type IN ('hydraulics_common','ecp','ecr')),
  CONSTRAINT ds_calc_runs_status_chk
    CHECK (calculation_status IN ('success','warning','error'))
);

CREATE INDEX IF NOT EXISTS ds_calc_runs_revision_at_idx
  ON design_software_calculation_runs (revision_id, calculated_at);


-- ── Step 7: design_software_assumptions ──────────────────────────────────────
-- Structured source-tagged assumption tracking.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_assumptions (
  id                serial       PRIMARY KEY,
  revision_id       integer      NOT NULL
                                 REFERENCES design_software_revisions(id)
                                 ON DELETE CASCADE,
  section           varchar(50)  NOT NULL,
  parameter_key     varchar(100) NOT NULL,
  parameter_label   varchar(200) NOT NULL,
  assumed_value     jsonb        NOT NULL,
  unit              varchar(30),
  source_type       varchar(30)  NOT NULL,
  source_reference  text,
  engineering_basis text,
  created_by        integer      NOT NULL REFERENCES users(id),      -- no cascade; RESTRICT
  created_at        timestamp    NOT NULL DEFAULT NOW(),

  CONSTRAINT ds_assumptions_source_type_chk
    CHECK (source_type IN ('Measured','Vendor','Literature','Assumed'))
);

CREATE INDEX IF NOT EXISTS ds_assumptions_revision_id_idx
  ON design_software_assumptions (revision_id);


-- ── Step 8: design_software_approvals ────────────────────────────────────────
-- Workflow audit trail. Rows are appended only — never updated or deleted.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_software_approvals (
  id           serial      PRIMARY KEY,
  revision_id  integer     NOT NULL
                           REFERENCES design_software_revisions(id)
                           ON DELETE CASCADE,
  action       varchar(30) NOT NULL,
  performed_by integer     NOT NULL REFERENCES users(id),            -- no cascade; RESTRICT
  performed_at timestamp   NOT NULL DEFAULT NOW(),
  comments     text,

  CONSTRAINT ds_approvals_action_chk
    CHECK (action IN ('submit_for_review','return_to_draft','check','approve',
                      'issue','supersede','archive'))
);

CREATE INDEX IF NOT EXISTS ds_approvals_revision_at_idx
  ON design_software_approvals (revision_id, performed_at);


-- ── Step 9: Circular FK — current_revision_id ────────────────────────────────
-- Applied after both tables exist. DEFERRABLE INITIALLY DEFERRED so that a
-- single transaction can (a) INSERT the design with current_revision_id = NULL,
-- (b) INSERT the first revision, (c) UPDATE current_revision_id — without the
-- FK being checked at intermediate steps.
-- ON DELETE SET NULL: deleting a revision clears the pointer; it does not delete
-- the design (which may have other revisions or be in an archived state).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE design_software_designs
    ADD CONSTRAINT ds_designs_current_revision_fk
      FOREIGN KEY (current_revision_id)
      REFERENCES design_software_revisions(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already exists (idempotent)
END $$;


-- ── Step 10: project_type/project_id CHECK (if not already added inline) ─────
-- Ensures project-type designs always carry a project_id.
-- R&D designs may leave project_id NULL; linked_project_id is always optional.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE design_software_designs
    ADD CONSTRAINT ds_designs_project_type_project_id_chk
      CHECK (design_type != 'project' OR project_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already exists (idempotent, also declared inline in CREATE TABLE above)
END $$;
