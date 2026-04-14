-- =============================================================
-- Phase 2: Admin GCS Document Control — Schema Foundation
-- Plan reference: docs/admin-gcs-remediation-plan-v2.md (Rev 2)
-- Applied: 2026-04-14
-- Idempotent: all statements use IF NOT EXISTS — safe for re-run
-- =============================================================

-- ── trip_documents: new GCS control columns + unique index ──────────────
ALTER TABLE trip_documents
  ADD COLUMN IF NOT EXISTS seq         INTEGER,
  ADD COLUMN IF NOT EXISTS label       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gcs_path    TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS trip_documents_trip_id_seq_idx
  ON trip_documents (trip_id, seq);

-- ── compliance_register: gcs_path + file_locked ──────────────────────────
ALTER TABLE compliance_register
  ADD COLUMN IF NOT EXISTS gcs_path    TEXT,
  ADD COLUMN IF NOT EXISTS file_locked BOOLEAN NOT NULL DEFAULT false;

-- ── policy_templates: gcs doc version tracking ──────────────────────────
ALTER TABLE policy_templates
  ADD COLUMN IF NOT EXISTS gcs_path       TEXT,
  ADD COLUMN IF NOT EXISTS version_number INTEGER,
  ADD COLUMN IF NOT EXISTS doc_is_active  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activated_by   INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS activated_at   TIMESTAMP;

-- ── nda_agreements: gcs paths + file_locked ──────────────────────────────
ALTER TABLE nda_agreements
  ADD COLUMN IF NOT EXISTS draft_gcs_path    TEXT,
  ADD COLUMN IF NOT EXISTS executed_gcs_path TEXT,
  ADD COLUMN IF NOT EXISTS file_locked       BOOLEAN NOT NULL DEFAULT false;

-- ── exclusivity_agreements: gcs paths + file_locked ─────────────────────
ALTER TABLE exclusivity_agreements
  ADD COLUMN IF NOT EXISTS draft_gcs_path    TEXT,
  ADD COLUMN IF NOT EXISTS executed_gcs_path TEXT,
  ADD COLUMN IF NOT EXISTS file_locked       BOOLEAN NOT NULL DEFAULT false;

-- ── contract_documents ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_documents (
  id           SERIAL PRIMARY KEY,
  contract_id  INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  gcs_path     TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  label        VARCHAR(50) NOT NULL,
  uploaded_by  INTEGER REFERENCES users(id),
  uploaded_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS contract_documents_contract_id_seq_idx
  ON contract_documents (contract_id, seq);

-- ── posh_documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posh_documents (
  id          SERIAL PRIMARY KEY,
  case_id     INTEGER NOT NULL REFERENCES posh_cases(id) ON DELETE CASCADE,
  gcs_path    TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  label       VARCHAR(50) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS posh_documents_case_id_seq_idx
  ON posh_documents (case_id, seq);

-- ── notice_documents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notice_documents (
  id          SERIAL PRIMARY KEY,
  notice_id   INTEGER NOT NULL REFERENCES legal_notices(id) ON DELETE CASCADE,
  gcs_path    TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  label       VARCHAR(50) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS notice_documents_notice_id_seq_idx
  ON notice_documents (notice_id, seq);

-- ── visa_documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visa_documents (
  id              SERIAL PRIMARY KEY,
  visa_record_id  INTEGER NOT NULL REFERENCES visa_records(id) ON DELETE CASCADE,
  gcs_path        TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  label           VARCHAR(50),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  uploaded_by     INTEGER REFERENCES users(id),
  uploaded_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  superseded_at   TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS visa_documents_visa_record_id_seq_idx
  ON visa_documents (visa_record_id, seq);

-- ── loan_documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_documents (
  id          SERIAL PRIMARY KEY,
  loan_id     INTEGER NOT NULL REFERENCES employee_loans(id) ON DELETE CASCADE,
  gcs_path    TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  label       VARCHAR(50) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS loan_documents_loan_id_seq_idx
  ON loan_documents (loan_id, seq);

-- ── advance_documents ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advance_documents (
  id          SERIAL PRIMARY KEY,
  advance_id  INTEGER NOT NULL REFERENCES employee_advances(id) ON DELETE CASCADE,
  gcs_path    TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  label       VARCHAR(50) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS advance_documents_advance_id_seq_idx
  ON advance_documents (advance_id, seq);
