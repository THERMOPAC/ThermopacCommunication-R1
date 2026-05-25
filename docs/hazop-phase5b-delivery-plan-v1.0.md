# HAZOP Phase 5B — Safety Requirements Specification (SRS)
# Delivery Plan v1.0
**Date:** 2026-05-25  
**Status:** DRAFT — Awaiting product owner review  
**Predecessor:** Phase 5A formally closed and approved (ZTA-5A-v1.1-CLOSED — 2026-05-25)  
**Gate:** Phase 5C, 5D, 5E must NOT begin until this plan is reviewed and Phase 5B is approved.

---

## 1. Phase 5B Objective

A Safety Requirements Specification (SRS) is the formal engineering document that must exist before Safety Instrumented System (SIS) design can proceed. Each SRS covers one Safety Instrumented Function (SIF), specifies the SIL the SIF must achieve, defines the safe state, response time, proof test requirements, and architecture.

Phase 5B creates table 35 (`hazop_srs_records`) and its full CRUD + extract + PDF-export API, plus two UI pages.

---

## 2. Design Decisions Required Before Build

The following two decisions must be resolved before T5B-001 begins:

### Decision 1 — SIF → Scenario Linkage

**Background:** Study 1 has 4 SIFs (SIF-001 to SIF-004). Investigation shows:
- `hazop_safety_functions.source_deviation_id` is NULL for all 4 SIFs
- `hazop_safety_functions.ce_column_id` links to `hazop_ce_matrices` which stores matrix-level records (no per-scenario FK)
- `hazop_response_groups` has no `scenario_id` column
- No SIF-sourced items exist in the current IPL stack

**Impact:** The `extract` route cannot auto-determine which LOPA record to link to a given SIF.

**Two options:**

| Option | Approach | Tradeoff |
|--------|----------|----------|
| **A** | Extract creates one draft SRS per SIF, with `lopa_id = NULL`. Engineer manually links LOPA in the SRS editor. | Simpler extract; requires one manual action per SRS after extraction. |
| **B** | Extract presents a confirmation dialog per SIF letting the engineer select the linked LOPA before creating the SRS. | More upfront work in extract UI; SRS created fully linked. |

**Recommendation: Option A.** The extract populates all SIF fields automatically. The `lopa_id` linkage is set in the SRS editor via a dropdown of available LOPA records for the study. This avoids a complex multi-step extract dialog while keeping data entry minimal.

### Decision 2 — PDF Export Engine

**Background:** The app has no existing PDF generation library beyond `server/dds-pdf-service.ts` (which uses a custom HTML-to-PDF approach via Puppeteer or similar).

**Two options:**

| Option | Approach |
|--------|----------|
| **A** | Server-side HTML template rendered to PDF (same pattern as DDS PDF service) | 
| **B** | Client-side print-to-PDF (browser print dialog, `@media print` CSS) |

**Recommendation: Option A**, consistent with existing pattern. A server-rendered HTML → PDF export is auditable, reproducible, and consistent across users. The SRS PDF will be a two-page formal document matching IEC 61511 SRS template structure.

---

## 3. New Table: `hazop_srs_records` (Table 35)

### 3.1 DDL

```sql
CREATE TABLE hazop_srs_records (
  id                        SERIAL PRIMARY KEY,
  study_id                  INTEGER NOT NULL
                              REFERENCES hazop_studies(id) ON DELETE CASCADE,
  safety_function_id        INTEGER NOT NULL
                              REFERENCES hazop_safety_functions(id) ON DELETE CASCADE,
  lopa_id                   INTEGER
                              REFERENCES hazop_lopa_records(id) ON DELETE SET NULL,

  srs_number                TEXT NOT NULL,

  -- SIL determination (sourced from LOPA + SIF)
  sil_required              INTEGER NOT NULL CHECK (sil_required IN (1,2,3,4)),
  sil_proposed              INTEGER         CHECK (sil_proposed IN (1,2,3,4)),
  pfd_required              NUMERIC(10,6) NOT NULL,
  pfd_target                NUMERIC(10,6),

  -- Functional requirements (pre-populated from hazop_safety_functions)
  process_demand_description TEXT NOT NULL,
  safe_state_description     TEXT NOT NULL,
  process_input_tag          TEXT,
  final_element_tag          TEXT,
  final_element_action       TEXT,
  fail_state                 TEXT CHECK (fail_state IN (
                               'fail_open','fail_closed','fail_last',
                               'deenergize_to_trip','energize_to_trip')),

  -- Response time
  process_safety_time_sec    INTEGER,
  response_time_required_sec INTEGER,
  manual_reset_required      BOOLEAN DEFAULT true,

  -- Proof test
  proof_test_interval_days   INTEGER,
  proof_test_coverage        NUMERIC(5,2),
  proof_test_procedure_ref   TEXT,

  -- Architecture
  architecture_type          TEXT CHECK (architecture_type IN (
                               '1oo1','1oo2','2oo3','2oo2','1oo1D')),
  hardware_fault_tolerance   INTEGER DEFAULT 0,

  -- Status & approval
  srs_status                 TEXT NOT NULL DEFAULT 'draft'
                               CHECK (srs_status IN ('draft','in_review','approved','superseded')),
  baseline_revision          TEXT,
  approved_by                INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at                TIMESTAMPTZ,

  notes                      TEXT,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  created_by                 INTEGER REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE (study_id, srs_number),
  UNIQUE (safety_function_id)
);
```

### 3.2 Server-side validation rules (enforced on PATCH, 422 response if violated)

| Rule | Condition | Error |
|------|-----------|-------|
| PFD consistency | `pfd_target > pfd_required` | "pfd_target must be ≤ pfd_required" |
| Response time | `response_time_required_sec > process_safety_time_sec` (both non-null) | "response_time_required_sec must be ≤ process_safety_time_sec" |
| SIL mismatch | `sil_required ≠ lopa.required_sil` (linked LOPA) | Warning (not block) — returned in response as `warnings[]` |
| Self-approval | Baseline approver = record creator | 422 "Self-approval not permitted" |

### 3.3 Auto-population from SIF fields (extract route)

| `hazop_srs_records` field | Source |
|---|---|
| `process_demand_description` | `hazop_safety_functions.process_demand` |
| `safe_state_description` | `hazop_safety_functions.safety_action` |
| `process_input_tag` | `hazop_safety_functions.initiator_tag` |
| `final_element_tag` | `hazop_safety_functions.final_element_tag` |
| `final_element_action` | `hazop_safety_functions.final_element_action` |
| `sil_required` | `hazop_safety_functions.sil_target` (cast to integer) |
| `sil_proposed` | `hazop_safety_functions.sil_target` (same initial value) |
| `response_time_required_sec` | `hazop_safety_functions.response_time_sec` |
| `pfd_required` | Derived from `sil_required`: SIL 1 → 0.1, SIL 2 → 0.01, SIL 3 → 0.001, SIL 4 → 0.0001 |
| `pfd_target` | Same as `pfd_required` initially (conservative) |
| `lopa_id` | NULL — set manually by engineer in editor |

---

## 4. API Routes (7)

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| `GET` | `/api/hazop/studies/:studyId/srs` | List all SRS records with SIF details and LOPA linkage | Any |
| `POST` | `/api/hazop/studies/:studyId/srs/extract` | Auto-generate one SRS per SIF (skips SIFs already with an SRS) | Any |
| `GET` | `/api/hazop/srs/:id` | Get SRS detail (full form data) | Any |
| `PATCH` | `/api/hazop/srs/:id` | Update SRS — validates pfd_target, response_time; 409 if approved | Any |
| `DELETE` | `/api/hazop/srs/:id` | Delete — 409 if `srs_status = 'approved'` or `baseline_revision IS NOT NULL` | Any |
| `POST` | `/api/hazop/srs/:id/set-baseline` | Freeze SRS at `BL-{nnn}` — sets `srs_status = 'approved'` | Superuser/GM/SM |
| `GET` | `/api/hazop/srs/:id/export-pdf` | Generate and stream SRS PDF document | Any |

### Route details

**`POST /extract`:** Iterates all SIFs in study. For each SIF without an existing SRS: creates a draft SRS with auto-populated fields. Returns `{ created: N, skipped: N }`.

**`POST /set-baseline`:** Assigns next `BL-{nnn}` per study. Blocks if `srs_status = 'draft'` (must be `in_review` first — or Superuser override). Sets `baseline_revision`, `approved_by`, `approved_at`.

**`GET /export-pdf`:** Server-renders a structured SRS PDF. Required fields must all be non-null (returns 422 with field list if any are missing). PDF follows IEC 61511 SRS document structure (see §5.3).

---

## 5. UI Pages (2)

### 5.1 SRS Register — `/hazop/studies/:id/srs`

Card or table layout, one row/card per SRS, showing:
- SRS number, SIF number, SIF description
- SIL required badge (colour-coded: SIL 1 green, SIL 2 amber, SIL 3 red, SIL 4 dark red)
- `pfd_required` in scientific notation
- Status badge (draft / in_review / approved / superseded)
- LOPA linkage chip (LOPA-001, or "Unlinked" if `lopa_id = NULL`)
- SIL mismatch warning chip (if `sil_required ≠ lopa.required_sil`)
- PDF export button per row
- Open button → SRS Detail

Header bar:
- "Extract from SIFs" button (shows count of SIFs without SRS)
- Study-level summary: N SRS records, N approved, N with SIL mismatch

### 5.2 SRS Detail / Editor — `/hazop/studies/:id/srs/:srsId`

Full form with four sections:

**Section 1 — Identification:** SRS number, linked SIF (read-only), linked LOPA (dropdown — selects from study's LOPA records), status, notes.

**Section 2 — SIL Determination:**
- `sil_required` (number input 1–4) — shown with LOPA comparison if linked
- `sil_proposed` (number input 1–4)
- `pfd_required` (scientific notation input)
- `pfd_target` (scientific notation input) — warns if > `pfd_required`
- SIL mismatch alert if `sil_required ≠ lopa.required_sil`

**Section 3 — Functional Requirements:**
- `process_demand_description` (textarea)
- `safe_state_description` (textarea)
- `process_input_tag`, `final_element_tag`, `final_element_action` (text inputs)
- `fail_state` (dropdown)
- `process_safety_time_sec`, `response_time_required_sec` (number inputs) — warns if response > process_safety_time
- `manual_reset_required` (toggle)

**Section 4 — Proof Test & Architecture:**
- `proof_test_interval_days` (number)
- `proof_test_coverage` (0–100%)
- `proof_test_procedure_ref` (text)
- `architecture_type` (dropdown: 1oo1, 1oo2, 2oo3, 2oo2, 1oo1D)
- `hardware_fault_tolerance` (number 0–2)

Action bar (top right):
- Save (PATCH)
- Set to In Review (status transition — draft → in_review)
- Set Baseline / Approve (only Superuser/GM/SM; blocked if draft; blocked if SIL mismatch unresolved)
- Export PDF button

### 5.3 SRS PDF Structure (export-pdf)

Two-page formal document:

```
Page 1 — Header & Identification
  - Document title: "Safety Requirements Specification"
  - Study name, SRS number, SIF number, status, baseline revision
  - Prepared by, approved by, date

  SIL Determination
  - SIL Required / Proposed / PFD Required / PFD Target
  - LOPA reference (number + outcome)

  Functional Requirements
  - Process demand, safe state, tags, fail state
  - Process safety time / response time

Page 2 — Proof Test & Architecture
  - Proof test interval, coverage, procedure reference
  - Architecture type, HFT
  - Notes

  Footer: "IEC 61511 SRS — THERMOPAC QMS — Confidential"
```

---

## 6. Sidebar & Routing

Phase 5B adds two new sidebar entries under HAZOP (study context):
- SRS Register (`/hazop/studies/:id/srs`)

The SRS Detail page is navigated to from the Register (no separate sidebar entry).

The study-level HAZOP sidebar already exists from Phase 4. Phase 5B adds one leaf entry.

---

## 7. ZTA Requirements (T5B-004)

All of the following must pass before Phase 5B can be approved:

| ID | Test |
|----|------|
| ZTB-101 | Schema: `hazop_srs_records` exists with all columns, constraints, and UNIQUE indexes |
| ZTB-102 | `pfd_target > pfd_required` → PATCH returns 422 |
| ZTB-103 | `response_time_required_sec > process_safety_time_sec` → PATCH returns 422 |
| ZTB-104 | `sil_required ≠ lopa.required_sil` → PATCH succeeds but response includes `warnings[]: ["SIL mismatch: SRS requires SIL N, LOPA requires SIL M"]` |
| ZTB-105 | Self-approval blocked: `set-baseline` where `created_by = req.user.id` → 422 |
| ZTB-106 | `extract` creates one SRS per SIF; second call skips existing SRS (idempotent); returns `{ created, skipped }` |
| ZTB-107 | `delete` on approved SRS → 409 |
| ZTB-108 | `export-pdf` with all required fields populated → 200 with `Content-Type: application/pdf` |
| ZTB-109 | `export-pdf` with missing required fields → 422 with list of missing fields |
| ZTB-110 | All 7 routes return 401 unauthenticated |
| ZTB-111 | `set-baseline` from non-Superuser/GM/SM role → 403 |

---

## 8. Schema Impact Summary

| Item | Change type | Table affected |
|------|-------------|---------------|
| Add `hazop_srs_records` | New table (additive) | — |
| Add SRS type to schema.ts | New Drizzle table def | `shared/schema.ts` |
| Add 7 routes | New routes (additive) | `server/hazop-routes.ts` |
| Add 2 pages | New UI pages | `client/src/pages/hazop/` |
| Add sidebar entry | Additive | `client/src/components/layout.tsx` or sidebar |

**No Phase 4 or Phase 5A tables are modified.** Fully additive.

---

## 9. Sub-task Execution Order

```
T5B-001 — Schema DDL (psql) + schema.ts addition         [S]
  └── T5B-002 — 7 API routes in hazop-routes.ts          [M]
        └── T5B-003 — SRS Register + SRS Detail UI       [M]
              └── T5B-004 — ZTA run (ZTB-101–111)        [S]
```

**Estimate:** 1.5–2 days total.

---

## 10. Open Items

| # | Item | Owner | Blocking? |
|---|------|-------|-----------|
| OI-1 | Decision 1: SIF→LOPA linkage strategy (Option A vs B) — see §2 | Product Owner | Yes — blocks T5B-002 |
| OI-2 | Decision 2: PDF engine (Option A: server-side vs Option B: browser print) — see §2 | Product Owner | Yes — blocks T5B-002 |
| OI-3 | `pfd_required` derivation from `sil_target` (string `"2"` in DB) — confirm cast is correct | Architecture | No — handled internally |
| OI-4 | SRS PDF page count / branding — any additional fields required beyond §5.3? | Product Owner | No — can be adjusted at any time |

---

*Phase 5B delivery plan prepared by QMS Architect — 2026-05-25*  
*Awaiting product owner review. Phase 5C/5D/5E held pending Phase 5B approval.*
