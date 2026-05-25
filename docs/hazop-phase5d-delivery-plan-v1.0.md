# HAZOP Phase 5D — Countersigned Baseline Approval
# Delivery Plan v1.0

**Document**: `docs/hazop-phase5d-delivery-plan-v1.0.md`  
**Date**: 2026-05-25  
**Status**: SUPERSEDED — replaced by `docs/hazop-phase5d-delivery-plan-v1.1.md` (2026-05-25)  
**Predecessor**: Phase 5C formally closed 2026-05-25  
**IEC 61511 reference**: §12 (Functional Safety Management) — independent verification of SIL determinations before SIS detailed design  

---

## 1. Phase 5D Objective

Phase 5C established the MOC register and downstream `requires_review` propagation. A LOPA or SRS record can now be baselined (frozen) by its author. **Phase 5D adds a mandatory countersignature step**: a second authorised person — distinct from the person who set the baseline — must formally countersign each baselined LOPA and SRS record before that record is considered "formally approved for SIS design".

The countersignature is recorded with a tamper-evident **HMAC-SHA256 token** bound to the artefact's identity, revision, first-approver, and countersigner. Any post-signature database modification to those fields causes the token to fail verification, satisfying IEC 61511 §12 audit requirements.

**Output of Phase 5D:**
- Table 37: `hazop_baseline_approvals`
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

**Rule:** This fix is applied as part of T5D-002. No separate task. It is a prerequisite for the self-countersign gate (§5, Gate 2) to work correctly on LOPA records.

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
| `countersigner_role` | TEXT | NOT NULL | Snapshot of `req.user.role` at countersign time |
| `approval_token` | TEXT | NOT NULL, UNIQUE | HMAC-SHA256 hex string (§4) |
| `notes` | TEXT | nullable | Optional countersigner notes from request body |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

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
1. `hazopBaselineApprovals` table declaration  
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
"{artefact_type}|{artefact_id}|{baseline_revision}|{baselined_by}|{baselined_at_iso}|{countersigned_by}"
```

Where:
- `artefact_type` = `'lopa'` or `'srs'` (string literal)
- `artefact_id` = integer converted to string (e.g. `"42"`)
- `baseline_revision` = exact value from `hazop_lopa_records.baseline_revision` or `hazop_srs_records.baseline_revision`
- `baselined_by` = integer ID of the user who ran `set-baseline` (copied from `approved_by` on the LOPA/SRS record)
- `baselined_at_iso` = `approved_at` from the LOPA/SRS record, formatted as `toISOString()` — must be the value already stored in the DB row (read back from DB, not from `req`)
- `countersigned_by` = integer ID of the countersigning user

**Rule:** The canonical string must be computed from DB-read values (not from `req.body`), to ensure the token reflects persisted state.

### 4.4 Token Storage
`approval_token` stores the lowercase hex digest string (64 characters). No encoding wrapper.

### 4.5 Utility Module
`server/utils/hazop-hmac.ts` exports two functions:
- `generateApprovalToken(params): string` — builds the canonical string and returns the HMAC hex digest
- `verifyApprovalToken(params, storedToken): boolean` — recomputes and compares using `timingSafeEqual`

---

## 5. API Route Specification

All routes use `ensureAuthenticated`. All routes return JSON.

### 5.1 `POST /api/hazop/lopa/:id/countersign`

**Purpose:** Countersign a baselined LOPA record.

**Gates (in order — first failing gate returns immediately):**

| # | Condition | HTTP | Body |
|---|-----------|------|------|
| 1 | `hazop_lopa_records` row with `id` does not exist | 404 | `{error: 'LOPA record not found'}` |
| 2 | `lopa.lopa_status !== 'approved'` OR `lopa.baseline_revision IS NULL` | 422 | `{error: 'LOPA must be baselined before countersigning'}` |
| 3 | `lopa.approved_by IS NULL` | 422 | `{error: 'LOPA baseline_approver not recorded — re-run set-baseline'}` |
| 4 | `userId === lopa.approved_by` (self-countersign) | 422 | `{error: 'Countersigner must be different from the person who set the baseline'}` |
| 5 | `req.user.role NOT IN ('Superuser','General Manager','Senior Manager')` | 403 | `{error: 'Insufficient role for countersignature'}` |
| 6 | Row already exists in `hazop_baseline_approvals` for `(artefact_type='lopa', artefact_id=id, baseline_revision=lopa.baseline_revision)` | 409 | `{error: 'Baseline revision already countersigned'}` |

**On success:**
1. Read `lopa.approved_by`, `lopa.approved_at`, `lopa.baseline_revision`, `lopa.study_id` from DB
2. Compute `approval_token` via `generateApprovalToken`
3. INSERT into `hazop_baseline_approvals`
4. Return the inserted row (200)

**Request body:** `{ notes?: string }` — optional countersigner notes.

---

### 5.2 `POST /api/hazop/srs/:id/countersign`

Identical gate logic to §5.1 substituting SRS fields:
- Gate 1: `hazop_srs_records` row
- Gate 2: `srs.srs_status !== 'approved'` OR `srs.baseline_revision IS NULL`
- Gate 3: `srs.approved_by IS NULL`
- Gate 4–6: identical

**On success:** same pattern as §5.1.

---

### 5.3 `GET /api/hazop/studies/:studyId/baseline-approvals`

**Purpose:** List all countersigned baseline approval records for a study.

**Response:** Array of `hazop_baseline_approvals` rows JOINed with `users` for `countersigned_by_name` and `baselined_by_name`. Ordered by `countersigned_at DESC`.

No gate beyond `ensureAuthenticated` (read-only).

---

### 5.4 `POST /api/hazop/baseline-approvals/:approvalId/verify`

**Purpose:** Recompute the expected HMAC from current DB state and confirm it matches the stored `approval_token`.

**Process:**
1. Fetch row from `hazop_baseline_approvals` by `approvalId`
2. Fetch the referenced artefact (`lopa` or `srs` based on `artefact_type`) to get `approved_by`, `approved_at`
3. Recompute token via `generateApprovalToken`
4. Return `{ valid: true, approval_id: id }` or `{ valid: false, approval_id: id, reason: 'token_mismatch' }`

Returns 404 if `approvalId` not found. Never returns a non-2xx for a mismatched token — the mismatch result is communicated via the `valid` field.

---

### 5.5 Modified: `GET /api/hazop/lopa/:id`

**Augmentation:** LEFT JOIN `hazop_baseline_approvals hba ON hba.artefact_type='lopa' AND hba.artefact_id=lr.id AND hba.baseline_revision=lr.baseline_revision` and include a `baseline_approval` object in the response:

```json
"baseline_approval": {
  "id": 1,
  "countersigned_by": 3,
  "countersigned_by_name": "Jane Smith",
  "countersigned_at": "2026-05-25T...",
  "countersigner_role": "General Manager",
  "approval_token": "a3f...",
  "notes": "Verified independently"
} | null
```

When `lopa.baseline_revision IS NULL` or no matching row in `hazop_baseline_approvals`, `baseline_approval` is `null`.

---

### 5.6 Modified: `GET /api/hazop/srs/:id`

Identical augmentation to §5.5 substituting `artefact_type='srs'` and `srs_status`.

---

## 6. Tasks

### T5D-001 — Table 37 + Drizzle Schema

**Deliverables:**
- DB migration: `CREATE TABLE hazop_baseline_approvals (...)` with the UNIQUE constraint from §3.2
- `shared/schema.ts`: additive-only — append `hazopBaselineApprovals` table declaration, insert schema, and type alias

**Acceptance:** `\d hazop_baseline_approvals` shows all columns with correct types, constraints, and the UNIQUE index. `shared/schema.ts` compiles without errors.

---

### T5D-002 — HMAC Utility + Server Routes

**Deliverables:**
1. `server/utils/hazop-hmac.ts` — `generateApprovalToken` and `verifyApprovalToken` (§4)
2. LOPA `set-baseline` fix — add `approved_by=$userId, approved_at=NOW()` to the existing UPDATE (prerequisite for Gate 3)
3. `POST /api/hazop/lopa/:id/countersign` (§5.1)
4. `POST /api/hazop/srs/:id/countersign` (§5.2)
5. `GET /api/hazop/studies/:studyId/baseline-approvals` (§5.3)
6. `POST /api/hazop/baseline-approvals/:approvalId/verify` (§5.4)
7. Augment `GET /api/hazop/lopa/:id` (§5.5)
8. Augment `GET /api/hazop/srs/:id` (§5.6)

**Acceptance:**
- LOPA `set-baseline` SQL includes `approved_by` and `approved_at` fields
- All 4 new routes registered and reachable
- Unauthenticated calls return 401
- HMAC utility exports both functions with correct Node.js `crypto` usage

---

### T5D-003 — UI

**Deliverables:**

**LOPA detail page (`hazop-lopa-detail.tsx`)**:
- When `lopa.baseline_approval` is non-null (already countersigned): show a green `✓ Countersigned` badge in the header, with countersigner name, role, and date on hover / in a detail row beneath the existing baseline notice
- When `lopa.lopa_status === 'approved'` AND `lopa.baseline_approval` is null AND the current user's role is Superuser/GM/SM AND the current user is NOT `lopa.approved_by`: show a `Countersign` button (amber-outlined, `ShieldCheck` icon)
- When `lopa.lopa_status === 'approved'` AND `lopa.baseline_approval` is null AND the current user is the `lopa.approved_by` or insufficient role: show a `⏳ Awaiting Countersignature` read-only indicator instead of the button
- Clicking `Countersign` opens a small Dialog with an optional `notes` textarea and a confirm button
- `countersignMut` mutation: `POST /api/hazop/lopa/${lopaId}/countersign`, invalidates `['/api/hazop/lopa', lopaId]`
- Verify token button (small, ghost): calls `POST /api/hazop/baseline-approvals/:approvalId/verify` and shows a toast: "Token valid ✓" or "Token INVALID — record may have been tampered"

**SRS detail page (`hazop-srs-detail.tsx`)**:
- Identical set of additions with SRS-specific query keys and route paths

**LOPA list page (`hazop-lopa.tsx`)**:
- In the table row, add a `Countersigned` badge column (after the existing `Baseline` column) using the same green style
- Badge is shown only if `lopa.baseline_approval` is non-null
- The LOPA list query must be augmented to include `baseline_approval` data (or a boolean `is_countersigned` field from the server)

**SRS list page (`hazop-srs.tsx`)**:
- Identical `Countersigned` column addition

**Acceptance:** Countersign button renders for eligible users; Awaiting indicator renders for ineligible; badge appears after countersigning; token verify toast works.

---

## 7. Explicit Out of Scope (Phase 5D)

| Item | Disposition |
|------|-------------|
| Countersignature for interlocks, alarm-trips, SCEs | Phase 5E or later |
| Email notification to countersigner | Phase 6+ |
| PDF export of approval certificate | Phase 6+ |
| AI-powered impact assessment suggestion | Phase 5E |
| HMAC key rotation / re-signing | Out of scope indefinitely — SESSION_SECRET change invalidates all tokens; this is the intended behavior |
| Adding `'countersigned'` to `lopa_status` or `srs_status` CHECK constraints | Explicitly out of scope — status is derived from `hazop_baseline_approvals` presence only |
| Enforcing countersignature before Phase 4 artefact use in SIS design | Out of scope — informational only in Phase 5D |

---

## 8. Zero-Trust Audit Checklist (ZTC-501 – ZTC-520)

| ID | Check | Verified by |
|----|-------|-------------|
| ZTC-501 | `hazop_baseline_approvals` table exists with all 12 columns per §3.1 | `\d hazop_baseline_approvals` |
| ZTC-502 | UNIQUE constraint `(artefact_type, artefact_id, baseline_revision)` present | `\d hazop_baseline_approvals` index listing |
| ZTC-503 | `POST /api/hazop/lopa/:id/countersign` → 401 unauthenticated | Source inspection + auth-middleware |
| ZTC-504 | `POST /api/hazop/srs/:id/countersign` → 401 unauthenticated | Source inspection |
| ZTC-505 | Countersign LOPA with `lopa_status ≠ 'approved'` → 422 | Functional test |
| ZTC-506 | Countersign SRS with `srs_status ≠ 'approved'` → 422 | Functional test |
| ZTC-507 | Countersign by same user who set baseline → 422 (self-countersign blocked) | Functional test |
| ZTC-508 | Countersign by user with insufficient role → 403 | Functional test |
| ZTC-509 | Second countersign on same `(artefact_type, artefact_id, baseline_revision)` → 409 | Functional test |
| ZTC-510 | HMAC canonical string uses pipe `\|` separator in exact field order from §4.3 | Code inspection of `generateApprovalToken` |
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

---

## 9. Additive-Only Confirmation

| Action | Confirmation |
|--------|-------------|
| New table | `hazop_baseline_approvals` (table 37) |
| New utility file | `server/utils/hazop-hmac.ts` (new file, no existing file modified) |
| Existing columns added | None |
| Existing columns removed | None |
| CHECK constraints modified | None |
| Server routes modified (behavior) | LOPA `set-baseline` — adds `approved_by`/`approved_at` writes to already-existing nullable columns |
| Server routes modified (response shape) | `GET /api/hazop/lopa/:id`, `GET /api/hazop/srs/:id` — `baseline_approval` field added to response (additive, non-breaking) |
| Phase 4 schema touched | No |
| Phase 5A/5B/5C schema touched | No |
| Total HAZOP tables after Phase 5D | **37** |

---

*Document status: DRAFT — awaiting product owner review and approval. No implementation may begin until explicit approval is given per operating-protocol-v1.0.md §2.*
