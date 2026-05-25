# HAZOP Phase 5D — Countersigned Baseline Approval
# Delivery Plan v1.1

**Document**: `docs/hazop-phase5d-delivery-plan-v1.1.md`  
**Date**: 2026-05-25  
**Supersedes**: `docs/hazop-phase5d-delivery-plan-v1.0.md`  
**Status**: DRAFT — awaiting product owner review and approval before implementation begins  
**Predecessor**: Phase 5C formally closed 2026-05-25  
**IEC 61511 reference**: §12 (Functional Safety Management) — independent verification of SIL determinations before SIS detailed design  

---

## Changes from v1.0 to v1.1

| # | Change |
|---|--------|
| 1 | `approval_discipline` column added to `hazop_baseline_approvals` — TEXT NOT NULL, CHECK IN ('process','instrumentation','safety') |
| 2 | Countersign routes now require `approval_discipline` in the request body (mandatory — missing or invalid value → 422 before any DB work) |
| 3 | `countersigner_role` and `approval_discipline` stored as separate columns (no merging, no derivation) |
| 4 | `approval_discipline` included in the HMAC canonical string (appended as 7th pipe-separated field) |
| 5 | LOPA/SRS detail pages must display: `baselined_by`, `countersigned_by`, `approval_discipline`, `countersigned_at`, token verification status — all as explicit UI fields, not just hover state |
| 6 | Countersign Dialog must include a required `approval_discipline` dropdown (process / instrumentation / safety) |
| 7 | Table column count updated from 12 to 13; ZTC-501 updated accordingly; ZTC-521–ZTC-523 added |

All other decisions from v1.0 are unchanged and remain in force.

---

## 1. Phase 5D Objective

Phase 5C established the MOC register and downstream `requires_review` propagation. A LOPA or SRS record can now be baselined (frozen) by its author. **Phase 5D adds a mandatory countersignature step**: a second authorised person — distinct from the person who set the baseline — must formally countersign each baselined LOPA and SRS record before that record is considered "formally approved for SIS design".

The countersignature captures the countersigner's identity, role, **discipline** (process / instrumentation / safety), and a tamper-evident **HMAC-SHA256 token** bound to the artefact's identity, revision, first-approver, countersigner, and discipline. Any post-signature database modification to those bound fields causes the token to fail verification, satisfying IEC 61511 §12 audit requirements.

**Output of Phase 5D:**
- Table 37: `hazop_baseline_approvals` (13 columns)
- 1 prerequisite bug fix (LOPA `set-baseline` must record `approved_by`)
- 4 new API routes
- 2 modified API routes (detail GETs augmented)
- 1 HMAC utility function (`server/utils/hazop-hmac.ts`)
- UI additions to LOPA detail page, SRS detail page, and LOPA/SRS list pages

---

## 2. Prerequisite Bug Fix — LOPA `set-baseline`

**Current behaviour (confirmed 2026-05-25):**
`POST /api/hazop/lopa/:id/set-baseline` sets `baseline_revision` and `lopa_status='approved'` but does **not** set `approved_by` or `approved_at`.

**Required behaviour:**
The UPDATE must also set `approved_by = $userId` and `approved_at = NOW()`.

**Columns already exist** in `hazop_lopa_records` (`approved_by INTEGER`, `approved_at TIMESTAMPTZ`) — no schema migration required. This is a server-route-only fix.

**Rule:** This fix is applied as part of T5D-002. No separate task. It is a prerequisite for the self-countersign gate (§5, Gate 3) to work correctly on LOPA records.

---

## 3. New Table: `hazop_baseline_approvals` (Table 37)

### 3.1 Column Specification

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PRIMARY KEY | |
| `study_id` | INTEGER | NOT NULL, FK → `hazop_studies(id)` ON DELETE CASCADE | Denormalised for fast study-level listing |
| `artefact_type` | TEXT | NOT NULL, CHECK (`artefact_type IN ('lopa','srs')`) | Phase 5D scope only |
| `artefact_id` | INTEGER | NOT NULL | FK not enforced by DB (polymorphic); application enforces artefact existence before insert |
| `baseline_revision` | TEXT | NOT NULL | The specific revision being countersigned (e.g. `L-001`, `S-002`) |
| `baselined_by` | INTEGER | NOT NULL, FK → `users(id)` ON DELETE RESTRICT | Copied from `approved_by` of the LOPA/SRS record at countersign time |
| `countersigned_by` | INTEGER | NOT NULL, FK → `users(id)` ON DELETE RESTRICT | The user calling the countersign route |
| `countersigned_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Server-set timestamp |
| `countersigner_role` | TEXT | NOT NULL | Snapshot of `req.user.role` at countersign time — stored separately from `approval_discipline` |
| `approval_discipline` | TEXT | NOT NULL, CHECK (`approval_discipline IN ('process','instrumentation','safety')`) | Supplied by countersigner in request body — stored separately from `countersigner_role` |
| `approval_token` | TEXT | NOT NULL, UNIQUE | HMAC-SHA256 hex string (§4) |
| `notes` | TEXT | nullable | Optional countersigner notes from request body |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Total columns: 13**

### 3.2 Indexes and Constraints

```sql
-- Ensures one countersignature per artefact+revision combination
UNIQUE (artefact_type, artefact_id, baseline_revision)
```

No other indexes required for Phase 5D.

### 3.3 Additive-Only Confirmation

No columns are added to or removed from any existing table. The `hazop_lopa_records.approved_by` and `hazop_srs_records.approved_by` columns already exist; the LOPA `set-baseline` fix writes to an already-present column. The `lopa_status` and `srs_status` CHECK constraints are **not modified** — countersigned state is derived from the presence of a row in `hazop_baseline_approvals`.

### 3.4 Drizzle Schema Addition

Three additions to `shared/schema.ts` (additive only):
1. `hazopBaselineApprovals` table declaration (13 columns per §3.1)
2. `insertHazopBaselineApprovalSchema` (insert schema via `createInsertSchema`)
3. `HazopBaselineApproval` type alias (`typeof hazopBaselineApprovals.$inferSelect`)

---

## 4. HMAC Token Specification

### 4.1 Algorithm
`HMAC-SHA256` using Node.js built-in `crypto.createHmac`.

### 4.2 Key
`process.env.SESSION_SECRET` — the same secret already required by the application (confirmed in `replit.md`).

### 4.3 Canonical Message String
```
"{artefact_type}|{artefact_id}|{baseline_revision}|{baselined_by}|{baselined_at_iso}|{countersigned_by}|{approval_discipline}"
```

Where:
- `artefact_type` = `'lopa'` or `'srs'` (string literal)
- `artefact_id` = integer converted to string (e.g. `"42"`)
- `baseline_revision` = exact value from `hazop_lopa_records.baseline_revision` or `hazop_srs_records.baseline_revision`
- `baselined_by` = integer ID of the user who ran `set-baseline` (copied from `approved_by` on the LOPA/SRS record)
- `baselined_at_iso` = `approved_at` from the LOPA/SRS record, formatted as `toISOString()` — must be the value already stored in the DB row (read back from DB, not from `req`)
- `countersigned_by` = integer ID of the countersigning user
- `approval_discipline` = one of `'process'`, `'instrumentation'`, `'safety'` (the validated value from `req.body`)

**Rule:** The canonical string must be computed from DB-read values for all artefact fields (`artefact_id`, `baseline_revision`, `baselined_by`, `baselined_at_iso`) and from validated `req.body` values for countersigner fields (`countersigned_by`, `approval_discipline`). No field may be omitted from the string.

### 4.4 Token Storage
`approval_token` stores the lowercase hex digest string (64 characters). No encoding wrapper.

### 4.5 Utility Module
`server/utils/hazop-hmac.ts` exports two functions:
- `generateApprovalToken(params: { artefact_type, artefact_id, baseline_revision, baselined_by, baselined_at_iso, countersigned_by, approval_discipline }): string` — builds the canonical string and returns the HMAC hex digest
- `verifyApprovalToken(params, storedToken: string): boolean` — recomputes and compares using `timingSafeEqual`

Both functions take the same params object. Field order in the canonical string is fixed per §4.3 regardless of object key order.

---

## 5. API Route Specification

All routes use `ensureAuthenticated`. All routes return JSON.

### 5.1 `POST /api/hazop/lopa/:id/countersign`

**Purpose:** Countersign a baselined LOPA record.

**Request body:** `{ approval_discipline: 'process'|'instrumentation'|'safety', notes?: string }`
- `approval_discipline` is **required**
- `notes` is optional

**Gates (in order — first failing gate returns immediately):**

| # | Condition | HTTP | Body |
|---|-----------|------|------|
| 1 | `approval_discipline` missing from body OR not in `('process','instrumentation','safety')` | 422 | `{error: 'approval_discipline must be one of: process, instrumentation, safety'}` |
| 2 | `hazop_lopa_records` row with `id` does not exist | 404 | `{error: 'LOPA record not found'}` |
| 3 | `lopa.lopa_status !== 'approved'` OR `lopa.baseline_revision IS NULL` | 422 | `{error: 'LOPA must be baselined before countersigning'}` |
| 4 | `lopa.approved_by IS NULL` | 422 | `{error: 'LOPA baseline approver not recorded — re-run set-baseline'}` |
| 5 | `userId === lopa.approved_by` (self-countersign) | 422 | `{error: 'Countersigner must be different from the person who set the baseline'}` |
| 6 | `req.user.role NOT IN ('Superuser','General Manager','Senior Manager')` | 403 | `{error: 'Insufficient role for countersignature'}` |
| 7 | Row already exists in `hazop_baseline_approvals` for `(artefact_type='lopa', artefact_id=id, baseline_revision=lopa.baseline_revision)` | 409 | `{error: 'Baseline revision already countersigned'}` |

**On success:**
1. Read `lopa.approved_by`, `lopa.approved_at`, `lopa.baseline_revision`, `lopa.study_id` from DB
2. Compute `approval_token` via `generateApprovalToken` (including `approval_discipline`)
3. INSERT into `hazop_baseline_approvals` with all 13 fields
4. Return the inserted row (200)

---

### 5.2 `POST /api/hazop/srs/:id/countersign`

Identical gate logic to §5.1 substituting SRS fields:
- Gate 1: identical (request body validation, same vocabulary)
- Gate 2: `hazop_srs_records` row
- Gate 3: `srs.srs_status !== 'approved'` OR `srs.baseline_revision IS NULL`
- Gate 4: `srs.approved_by IS NULL`
- Gates 5–7: identical

**On success:** same pattern as §5.1.

---

### 5.3 `GET /api/hazop/studies/:studyId/baseline-approvals`

**Purpose:** List all countersigned baseline approval records for a study.

**Response:** Array of `hazop_baseline_approvals` rows JOINed with `users` for `countersigned_by_name` and `baselined_by_name`. All 13 columns included. Ordered by `countersigned_at DESC`.

No gate beyond `ensureAuthenticated` (read-only).

---

### 5.4 `POST /api/hazop/baseline-approvals/:approvalId/verify`

**Purpose:** Recompute the expected HMAC from current DB state and confirm it matches the stored `approval_token`.

**Process:**
1. Fetch row from `hazop_baseline_approvals` by `approvalId`
2. Fetch the referenced artefact (`lopa` or `srs` based on `artefact_type`) to get current `approved_by`, `approved_at`
3. Recompute token via `generateApprovalToken` using all 7 canonical fields (including `approval_discipline` from the stored row)
4. Return `{ valid: true, approval_id: id }` or `{ valid: false, approval_id: id, reason: 'token_mismatch' }`

Returns 404 if `approvalId` not found. Never returns a non-2xx for a mismatched token — the mismatch result is communicated via the `valid` field.

---

### 5.5 Modified: `GET /api/hazop/lopa/:id`

**Augmentation:** LEFT JOIN `hazop_baseline_approvals hba ON hba.artefact_type='lopa' AND hba.artefact_id=lr.id AND hba.baseline_revision=lr.baseline_revision`, also LEFT JOIN `users u_bl ON u_bl.id = hba.baselined_by` and `users u_cs ON u_cs.id = hba.countersigned_by`.

Include a `baseline_approval` object in the response:

```json
"baseline_approval": {
  "id": 1,
  "baselined_by": 5,
  "baselined_by_name": "John Doe",
  "countersigned_by": 3,
  "countersigned_by_name": "Jane Smith",
  "countersigned_at": "2026-05-25T10:30:00.000Z",
  "countersigner_role": "General Manager",
  "approval_discipline": "safety",
  "approval_token": "a3f...",
  "notes": "Verified independently"
} | null
```

When `lopa.baseline_revision IS NULL` or no matching row in `hazop_baseline_approvals`, `baseline_approval` is `null`.

---

### 5.6 Modified: `GET /api/hazop/srs/:id`

Identical augmentation to §5.5 substituting `artefact_type='srs'`. Same `baseline_approval` object shape including `approval_discipline`.

---

## 6. Tasks

### T5D-001 — Table 37 + Drizzle Schema

**Deliverables:**
- DB migration: `CREATE TABLE hazop_baseline_approvals (...)` with all 13 columns, CHECK constraints, and UNIQUE constraint from §3.2
- `shared/schema.ts`: additive-only — append `hazopBaselineApprovals` table declaration (including `approval_discipline` with enum-style check), insert schema, and type alias

**Acceptance:** `\d hazop_baseline_approvals` shows all 13 columns with correct types and constraints. `shared/schema.ts` compiles without errors.

---

### T5D-002 — HMAC Utility + Server Routes

**Deliverables:**
1. `server/utils/hazop-hmac.ts` — `generateApprovalToken` and `verifyApprovalToken` per §4.5 (7-field canonical string including `approval_discipline`)
2. LOPA `set-baseline` fix — add `approved_by=$userId, approved_at=NOW()` to the existing UPDATE
3. `POST /api/hazop/lopa/:id/countersign` (§5.1) — 7 gates, `approval_discipline` required in body
4. `POST /api/hazop/srs/:id/countersign` (§5.2) — 7 gates
5. `GET /api/hazop/studies/:studyId/baseline-approvals` (§5.3)
6. `POST /api/hazop/baseline-approvals/:approvalId/verify` (§5.4)
7. Augment `GET /api/hazop/lopa/:id` (§5.5) — JOIN includes `baselined_by_name`, `countersigned_by_name`, `approval_discipline`
8. Augment `GET /api/hazop/srs/:id` (§5.6) — same

**Acceptance:**
- LOPA `set-baseline` SQL includes `approved_by` and `approved_at`
- All 4 new routes registered and reachable
- Unauthenticated calls return 401
- Missing or invalid `approval_discipline` in body → 422 before any DB query
- HMAC utility exports both functions; canonical string includes all 7 fields in declared order

---

### T5D-003 — UI

**Deliverables:**

**LOPA detail page (`hazop-lopa-detail.tsx`)**:

When `lopa.baseline_approval` is non-null (already countersigned), display a **Countersignature Detail block** beneath the existing baseline notice. The block is always visible (not hover-only) and contains the following explicit labelled fields:

| Field label | Source field |
|-------------|-------------|
| Baselined By | `baseline_approval.baselined_by_name` |
| Countersigned By | `baseline_approval.countersigned_by_name` |
| Discipline | `baseline_approval.approval_discipline` (capitalised: Process / Instrumentation / Safety) |
| Countersigned At | `baseline_approval.countersigned_at` formatted via `fmtDateTime` |
| Token Status | Inline verify button (§ below) |

- Additionally show a green `✓ Countersigned` badge in the header
- Token status: a small `Verify Token` ghost button with `ShieldCheck` icon; on click calls `POST /api/hazop/baseline-approvals/:approvalId/verify` and shows toast: "Token valid ✓" (green) or "Token INVALID — record may have been tampered" (destructive)
- `verifyMut` mutation: invalidates nothing (read-only verify); result displayed via toast only

When `lopa.lopa_status === 'approved'` AND `lopa.baseline_approval` is null AND current user role is Superuser/GM/SM AND current user is NOT `lopa.approved_by`:
- Show a `Countersign` button (amber-outlined, `ShieldCheck` icon)
- Clicking opens a Dialog with:
  - Required `Select` dropdown for `approval_discipline` (options: process / instrumentation / safety; no default selection — user must choose)
  - Optional `Textarea` for `notes`
  - `Confirm Countersignature` button (disabled until `approval_discipline` is selected)
- `countersignMut` mutation: `POST /api/hazop/lopa/${lopaId}/countersign`, body `{ approval_discipline, notes }`, invalidates `['/api/hazop/lopa', lopaId]`

When `lopa.lopa_status === 'approved'` AND `lopa.baseline_approval` is null AND (current user is `lopa.approved_by` OR insufficient role):
- Show `⏳ Awaiting Countersignature` read-only indicator (no button)

**SRS detail page (`hazop-srs-detail.tsx`)**:
- Identical Countersignature Detail block with the same five labelled fields
- Identical Countersign button / Awaiting indicator logic
- SRS-specific query key: `['/api/hazop/srs', srsId]`
- Countersign route: `POST /api/hazop/srs/${srsId}/countersign`

**LOPA list page (`hazop-lopa.tsx`)**:
- Add a `Countersigned` column (after the existing `Baseline` column)
- Green badge when `lopa.is_countersigned === true`; empty otherwise
- Server-side: the LOPA list query (`GET /api/hazop/studies/:studyId/lopa`) must be augmented to include a boolean `is_countersigned` field (derived from existence of a row in `hazop_baseline_approvals` matching the current `baseline_revision` — LEFT JOIN, coalesced to `false`)

**SRS list page (`hazop-srs.tsx`)**:
- Identical `Countersigned` column and `is_countersigned` augmentation

**Acceptance:**
- Countersign button renders for eligible users; disabled until `approval_discipline` selected in dialog
- Awaiting indicator renders for ineligible users
- Countersignature Detail block shows all five fields explicitly after countersigning
- Token verify toast shows correct result
- List pages show green badge for countersigned records

---

## 7. Explicit Out of Scope (Phase 5D)

| Item | Disposition |
|------|-------------|
| Countersignature for interlocks, alarm-trips, SCEs | Phase 5E or later |
| Email notification to countersigner | Phase 6+ |
| PDF export of approval certificate | Phase 6+ |
| AI-powered impact assessment suggestion | Phase 5E |
| HMAC key rotation / re-signing | Out of scope indefinitely — SESSION_SECRET change invalidates all tokens; this is the intended behavior |
| Adding `'countersigned'` to `lopa_status` or `srs_status` CHECK constraints | Explicitly out of scope — countersigned state is derived from `hazop_baseline_approvals` presence only |
| Enforcing countersignature before Phase 4 artefact use in SIS design | Out of scope — informational only in Phase 5D |
| Multiple disciplines per countersignature (one per record) | Out of scope — one `approval_discipline` per countersignature row |

---

## 8. Zero-Trust Audit Checklist (ZTC-501 – ZTC-523)

| ID | Check | Verified by |
|----|-------|-------------|
| ZTC-501 | `hazop_baseline_approvals` table exists with all **13** columns per §3.1 | `\d hazop_baseline_approvals` |
| ZTC-502 | UNIQUE constraint `(artefact_type, artefact_id, baseline_revision)` present | `\d hazop_baseline_approvals` index listing |
| ZTC-503 | `POST /api/hazop/lopa/:id/countersign` → 401 unauthenticated | Source inspection + auth-middleware |
| ZTC-504 | `POST /api/hazop/srs/:id/countersign` → 401 unauthenticated | Source inspection |
| ZTC-505 | Countersign LOPA with `lopa_status ≠ 'approved'` → 422 | Functional test |
| ZTC-506 | Countersign SRS with `srs_status ≠ 'approved'` → 422 | Functional test |
| ZTC-507 | Countersign by same user who set baseline → 422 (self-countersign blocked) | Functional test |
| ZTC-508 | Countersign by user with insufficient role → 403 | Functional test |
| ZTC-509 | Second countersign on same `(artefact_type, artefact_id, baseline_revision)` → 409 | Functional test |
| ZTC-510 | HMAC canonical string uses pipe `\|` separator, 7 fields, exact order from §4.3 | Code inspection of `generateApprovalToken` |
| ZTC-511 | HMAC key is `SESSION_SECRET`; `timingSafeEqual` used in `verifyApprovalToken` | Code inspection |
| ZTC-512 | Verify route returns `{valid: true}` for un-tampered record | Functional test |
| ZTC-513 | Verify route returns `{valid: false}` for manually tampered `approval_token` in DB | SQL tamper + verify call |
| ZTC-514 | LOPA `set-baseline` now writes `approved_by` and `approved_at` | Row inspection after `set-baseline` |
| ZTC-515 | `GET /api/hazop/lopa/:id` includes `baseline_approval` object when countersigned | Response inspection |
| ZTC-516 | `GET /api/hazop/srs/:id` includes `baseline_approval` object when countersigned | Response inspection |
| ZTC-517 | No existing CHECK constraints modified on any table | `\d hazop_lopa_records`, `\d hazop_srs_records` |
| ZTC-518 | No columns removed or renamed from any existing table | Schema diff |
| ZTC-519 | TypeScript compile — zero errors after all changes | `npx tsc --noEmit` |
| ZTC-520 | HAZOP table count = 37 | `SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'hazop%'` |
| ZTC-521 | `approval_discipline` column present with CHECK IN ('process','instrumentation','safety') | `\d hazop_baseline_approvals` |
| ZTC-522 | Missing `approval_discipline` in body → 422 before any DB query (Gate 1 fires first) | Functional test with empty body |
| ZTC-523 | `baseline_approval` response object contains all five display fields: `baselined_by_name`, `countersigned_by_name`, `approval_discipline`, `countersigned_at`, `approval_token` | Response inspection |

---

## 9. Additive-Only Confirmation

| Action | Confirmation |
|--------|-------------|
| New table | `hazop_baseline_approvals` (table 37, 13 columns) |
| New utility file | `server/utils/hazop-hmac.ts` (new file, no existing file modified) |
| Existing columns added to existing tables | None |
| Existing columns removed from any table | None |
| CHECK constraints modified on any existing table | None |
| Server routes modified (behavior) | LOPA `set-baseline` — adds `approved_by`/`approved_at` writes to already-existing nullable columns |
| Server routes modified (response shape) | `GET /api/hazop/lopa/:id`, `GET /api/hazop/srs/:id` — `baseline_approval` field added (additive, non-breaking); `GET /api/hazop/studies/:studyId/lopa`, `GET /api/hazop/studies/:studyId/srs` — `is_countersigned` boolean added (additive, non-breaking) |
| Phase 4 schema touched | No |
| Phase 5A/5B/5C schema touched | No |
| Total HAZOP tables after Phase 5D | **37** |

---

*Document status: DRAFT — awaiting product owner review and approval. No implementation may begin until explicit approval is given per operating-protocol-v1.0.md §2.*
