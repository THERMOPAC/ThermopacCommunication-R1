# HAZOP Module — UAT Master Test Plan
**Compiled:** 2026-05-25  
**Scope:** End-to-end integrated test sequence covering Phase 1 through Phase 5D  
**Target:** Product owner / QA team  
**Prerequisites:** Superuser account + one additional GM or SM account for countersign tests  

---

## Test Environment Setup

```
URL:            http://localhost:5000  (development)
Auth:           Login as Superuser for all tests unless stated otherwise
Second account: General Manager or Senior Manager role — required for ZTC-507, ZTC-508 tests
DB access:      psql $DATABASE_URL
```

---

## SECTION A — Phase 1: Study Management

### A-01 — Create a Concept Study
**Steps:**
1. Navigate to `/hazop/dashboard`
2. Click "Create Study"
3. Select mode: **Concept / Expected Project**
4. Fill `concept_title`, `fy_code`; leave `project_id` blank
5. Submit

**Expected:** Study created; appears in "Concept Studies" tab with status "draft"  
**DB evidence:** `SELECT * FROM hazop_studies WHERE study_mode='concept_expected_project' ORDER BY id DESC LIMIT 1;`  
**Screenshot required:** Dashboard showing new study card

### A-02 — Create a Project-Based Study
**Steps:**
1. Click "Create Study" → select mode: **Project Based**
2. Select a project from the dropdown
3. Fill `fy_code`; submit

**Expected:** Study created with `project_id` populated  
**DB evidence:** `SELECT id, study_number, project_id, study_mode, status FROM hazop_studies ORDER BY id DESC LIMIT 2;`

### A-03 — Reject Duplicate Study Number
**Steps:**
1. Attempt to create a second concept study with the same `concept_title` + `fy_code`

**Expected:** Error response — UNIQUE constraint violation surfaced to UI

### A-04 — Delete Draft Study Only
**Steps:**
1. Delete a draft study
2. Convert a study to draft status if available; attempt to delete a non-draft study

**Expected:** Draft delete succeeds; non-draft delete returns 403

---

## SECTION B — Phase 2: Loop / Node / Step Builder

### B-01 — Create Loop → Node → Step
**Steps:**
1. Navigate to `/hazop/studies/:id/worksheet`
2. Add a loop
3. Select the loop → Add a node
4. Select the node → Add at least 2 steps

**Expected:** Tri-panel shows Loops → Nodes (under loop) → Steps (under node)  
**Screenshot required:** Worksheet with loop, node, and steps visible

### B-02 — Enforce v2.0 Architecture
**Steps:**
1. Verify that nodes are children of loops (not steps)
2. Verify UNIQUE(loop_id, node_number) — try adding duplicate node number within same loop

**Expected:** Duplicate node number rejected  
**DB evidence:** `SELECT * FROM hazop_nodes WHERE loop_id = :loopId;`

---

## SECTION C — Phase 3: HAZOP Generation Engine

### C-01 — Generate Deviations for a Node
**Steps:**
1. Navigate to worksheet; select a node with steps
2. Click "Generate HAZOP" for the node
3. Review the deviations generated

**Expected:** Deviations appear, each linked to `hazop_deviation_library` entries  
**DB evidence:** `SELECT d.guideword, d.parameter FROM hazop_deviations d WHERE d.node_id = :nodeId;`  
**Screenshot required:** Deviation list for a node

### C-02 — No Duplicate Deviations
**Steps:**
1. Trigger generation twice for the same node

**Expected:** Second generation does not duplicate deviations (UNIQUE guard)

### C-03 — Add Cause / Consequence / Safeguard / Action
**Steps:**
1. Select a deviation
2. Add a cause, consequence, safeguard, and action item

**Expected:** Each sub-record saved and displayed correctly

---

## SECTION D — Phase 3A: Deviation Library Coverage

### D-01 — Verify Full Library Coverage
**Steps:**
1. Run SQL:
```sql
SELECT equipment_category, COUNT(*) as entries
FROM hazop_deviation_library
GROUP BY equipment_category
ORDER BY equipment_category;
```

**Expected:** All 18 equipment categories have at least 1 entry  
**DB evidence:** Query result screenshot

---

## SECTION E — Phase 4: Safety Logic, C&E, Interlocks, Alarms, SCE

### E-01 — Create Event Group and Add Members
**Steps:**
1. Navigate to `/hazop/studies/:id/event-groups`
2. Create an event group
3. Add deviations to the event group

**Expected:** Event group created; member deviations listed  
**DB evidence:** `SELECT * FROM hazop_event_groups WHERE study_id = :studyId;`

### E-02 — Create Response Group with Actions
**Steps:**
1. Navigate to `/hazop/studies/:id/response-groups`
2. Create response group with `protection_layer = 'SIS'` and `is_independent_protection_layer = true`
3. Add at least one action

**Expected:** Response group and action saved  
**DB evidence:** `SELECT * FROM hazop_response_groups WHERE study_id = :studyId;`

### E-03 — Extract and View C&E Matrix
**Steps:**
1. Navigate to `/hazop/studies/:id/ce-matrix`
2. Create a matrix; click "Extract from Phase 4A"
3. Mark at least one cell

**Expected:** Rows (event groups) and columns (response groups) auto-populated; cell mark saved  
**Screenshot required:** C&E matrix with at least one marked cell

### E-04 — Create Interlock and Set Baseline
**Steps:**
1. Navigate to `/hazop/studies/:id/interlocks`
2. Create an interlock; add at least one action
3. Click "Set Baseline"

**Expected:** `baseline_revision` populated on interlock record  
**DB evidence:** `SELECT id, interlock_number, baseline_revision FROM hazop_interlocks WHERE study_id = :studyId;`

### E-05 — Create Alarm Trip, SCE
**Steps:**
1. Create at least one alarm trip at `/hazop/studies/:id/alarm-trips`
2. Create at least one SCE at `/hazop/studies/:id/sce`

**Expected:** Both records created with correct auto-numbers

### E-06 — PATCH Baselined Interlock Blocked Without MOC
**Steps:**
1. PATCH a baselined interlock without supplying `?moc_id=`

**Expected:** 409 response with `{moc_required: true}`

---

## SECTION F — Phase 5A: LOPA Core

### F-01 — Create Scenario and LOPA Record
**Steps:**
1. Navigate to `/hazop/studies/:id/lopa`
2. Create a scenario; create a LOPA record linked to the scenario

**Expected:** LOPA card appears with `lopa_number` auto-assigned  
**DB evidence:** `SELECT id, lopa_number, scenario_id, lopa_status FROM hazop_lopa_records WHERE study_id = :studyId;`

### F-02 — Build IPL Stack and Recalculate
**Steps:**
1. Open LOPA detail at `/hazop/studies/:id/lopa/:lopaId`
2. Add at least 2 IPL stack items
3. Ensure at least one has `is_independent_protection_layer = true`
4. Click "Recalculate"

**Expected:** `pfd_product`, `achieved_mef_per_year`, `risk_gap_ratio`, `required_sil` all populated  
**DB evidence:** `SELECT pfd_product, achieved_mef_per_year, required_sil FROM hazop_lopa_records WHERE id = :lopaId;`  
**Screenshot required:** LOPA detail showing calculated fields

### F-03 — Verify CCF Derating
**Steps:**
1. Add two IPL stack items with the same `ccf_group`
2. Recalculate

**Expected:** Warning displayed; only one IPL credited per CCF group

### F-04 — Set LOPA Baseline
**Steps:**
1. Click "Set Baseline" on an approved LOPA

**Expected:**
- `baseline_revision` non-null
- `approved_by` = current user ID (Phase 5D fix)
- `approved_at` = timestamp
**DB evidence:** `SELECT baseline_revision, approved_by, approved_at FROM hazop_lopa_records WHERE id = :lopaId;`  
**Critical check:** `approved_by` must NOT be null — this was the Phase 5D prerequisite bug fix

### F-05 — PATCH Baselined LOPA Blocked Without MOC
**Steps:**
1. PATCH a baselined LOPA without `?moc_id=`

**Expected:** 409 with `{moc_required: true}`

---

## SECTION G — Phase 5B: SRS

### G-01 — Create SRS Record
**Steps:**
1. Navigate to `/hazop/studies/:id/srs`
2. Create an SRS linked to a SIF (safety function)
3. Fill required fields: `sil_required`, `pfd_target`, `pfd_required`

**Expected:** SRS record created; `srs_number` auto-assigned; `pfd_target ≤ pfd_required` validated  
**DB evidence:** `SELECT id, srs_number, safety_function_id, srs_status FROM hazop_srs_records WHERE study_id = :studyId;`

### G-02 — Extract SRS from SIF
**Steps:**
1. Click "Extract from SIF" on an SRS record with a linked SIF

**Expected:** Fields auto-populated from SIF data

### G-03 — Set SRS Baseline
**Steps:**
1. Click "Set Baseline" on an SRS record

**Expected:** `baseline_revision` non-null; record shows as "Approved"

---

## SECTION H — Phase 5C: MOC Register

### H-01 — Raise a MOC
**Steps:**
1. Navigate to `/hazop/studies/:id/moc`
2. Click "Raise MOC"
3. Select artefact type: LOPA; select a baselined LOPA
4. Fill change type, reason, description, safety impact assessment; submit

**Expected:** MOC created with status "open"; `moc_number` = `MOC-001` (or sequential)  
**DB evidence:** `SELECT id, moc_number, moc_status, baseline_before FROM hazop_moc_records WHERE study_id = :studyId;`

### H-02 — MOC Against Non-Baselined Artefact Blocked
**Steps:**
1. Attempt to raise a MOC linked to a non-baselined LOPA

**Expected:** 400 error

### H-03 — Approve MOC
**Steps:**
1. Navigate to MOC detail at `/hazop/studies/:id/moc/:mocId`
2. As Superuser/GM/SM, click "Approve"

**Expected:** MOC status → "approved"; `approved_by` + `approved_at` populated  
**Verify cascade:** `SELECT requires_review FROM hazop_lopa_records WHERE id = :linkedLopaId;` → must be `true`

### H-04 — Self-Approval Blocked
**Steps:**
1. Log in as the same user who raised the MOC; attempt to approve

**Expected:** 422 — self-approval blocked

### H-05 — Mark Reviewed After MOC Approval
**Steps:**
1. Open LOPA detail after MOC approval
2. Verify "⚠ Requires Review" badge visible
3. Click "Mark Reviewed"

**Expected:** Badge disappears; `requires_review` → false  
**DB evidence:** `SELECT requires_review, reviewed_by, reviewed_at FROM hazop_lopa_records WHERE id = :lopaId;`

### H-06 — Close MOC
**Steps:**
1. Re-baseline the LOPA (so `baseline_revision` changes)
2. Click "Close MOC" on the approved MOC

**Expected:** `baseline_after` populated from artefact's new `baseline_revision`; MOC status → "closed"

---

## SECTION I — Phase 5D: Countersigned Baseline Approval

### I-01 — ZTC-501: Table Structure Verification
**Steps:**
1. Run: `\d hazop_baseline_approvals`

**Expected output:** 13 columns including:
- `id SERIAL PRIMARY KEY`
- `artefact_type TEXT NOT NULL CHECK IN ('lopa','srs')`
- `artefact_id INTEGER NOT NULL`
- `baseline_revision TEXT NOT NULL`
- `baselined_by INTEGER NOT NULL` (FK → users)
- `baselined_at TIMESTAMPTZ NOT NULL`
- `countersigned_by INTEGER NOT NULL` (FK → users)
- `countersigned_at TIMESTAMPTZ NOT NULL`
- `countersigner_role TEXT NOT NULL`
- `approval_discipline TEXT NOT NULL CHECK IN ('process','instrumentation','safety')`
- `approval_token TEXT NOT NULL`
- `notes TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- UNIQUE(artefact_type, artefact_id, baseline_revision)

**Screenshot required:** `\d hazop_baseline_approvals` full output

### I-02 — ZTC-503/504: 401 on Unauthenticated Countersign
**Steps:**
1. `curl -X POST http://localhost:5000/api/hazop/lopa/1/countersign`
2. `curl -X POST http://localhost:5000/api/hazop/srs/1/countersign`

**Expected:** Both return `401 Unauthorized`

### I-03 — ZTC-522: Gate 1 — Missing discipline → 422
**Steps:**
1. As authenticated user, POST to `/api/hazop/lopa/:id/countersign` with body `{}`

**Expected:** `422` with error mentioning `approval_discipline` — Gate 1 fires before any DB query

### I-04 — ZTC-505/506: Gate 3 — Non-approved artefact → 422
**Steps:**
1. POST countersign to a LOPA with `lopa_status = 'draft'` or not yet approved

**Expected:** 422

### I-05 — ZTC-514: approved_by Written by set-baseline
**Steps:**
1. Call `POST /api/hazop/lopa/:id/set-baseline` on a LOPA
2. Inspect the row

**Expected:**
```sql
SELECT approved_by, approved_at FROM hazop_lopa_records WHERE id = :lopaId;
-- approved_by = <user_id>, approved_at = <timestamp> (NOT NULL)
```

### I-06 — ZTC-507: Gate 5 — Self-Countersign Blocked → 422
**Steps:**
1. Set baseline as User A
2. Attempt countersign as User A

**Expected:** 422 — same user who set baseline cannot countersign

### I-07 — ZTC-508: Gate 6 — Insufficient Role → 403
**Steps:**
1. Log in as a user without Superuser/GM/SM role
2. Attempt to countersign a baselined LOPA

**Expected:** 403

### I-08 — Successful Countersign (LOPA)
**Steps:**
1. Set baseline as User A (Superuser)
2. Log in as User B (GM or SM)
3. POST to `/api/hazop/lopa/:id/countersign` with body:
   ```json
   { "approval_discipline": "safety", "notes": "Independently verified" }
   ```

**Expected:**
- Response 200 with `{ approval: { id, artefact_type, approval_token, ... } }`
- `approval_token` starts with `sha256=`
**DB evidence:**
```sql
SELECT * FROM hazop_baseline_approvals WHERE artefact_type='lopa' AND artefact_id = :lopaId;
```
**Screenshot required:** Successful countersign response body

### I-09 — ZTC-509: Gate 7 — Duplicate Countersign → 409
**Steps:**
1. Attempt countersign a second time on the same (artefact_type, artefact_id, baseline_revision)

**Expected:** 409

### I-10 — ZTC-515/523: LOPA Detail Includes baseline_approval Object
**Steps:**
1. `GET /api/hazop/lopa/:id` after successful countersign

**Expected response fragment:**
```json
"baseline_approval": {
  "id": 1,
  "baselined_by_name": "User A Name",
  "countersigned_by_name": "User B Name",
  "approval_discipline": "safety",
  "countersigned_at": "2026-...",
  "approval_token": "sha256=..."
}
```
**Screenshot required:** Raw API response or UI approval block

### I-11 — ZTC-512/513: HMAC Token Verification
**Steps (ZTC-512 — valid):**
1. POST to `/api/hazop/baseline-approvals/:approvalId/verify`
2. Expect: `{ valid: true, approval_id: :id }`

**Steps (ZTC-513 — tampered):**
1. SQL: `UPDATE hazop_baseline_approvals SET approval_token = 'sha256=tampered' WHERE id = :approvalId;`
2. POST to verify endpoint
3. Expect: `{ valid: false, approval_id: :id, reason: 'token_mismatch' }`

**DB evidence:** Token value before and after tamper

### I-12 — ZTC-510/511: HMAC Code Inspection
**Steps:**
1. Open `server/utils/hazop-hmac.ts`
2. Verify canonical string uses `|` separator with exactly 7 fields in order:
   `{artefact_type}|{artefact_id}|{baseline_revision}|{baselined_by}|{baselined_at_iso}|{countersigned_by}|{approval_discipline}`
3. Verify key is `process.env.SESSION_SECRET`
4. Verify `timingSafeEqual` used in `verifyApprovalToken`

**Evidence:** Code screenshot / inspection notes

### I-13 — ZTC-516: SRS Detail Includes baseline_approval
**Steps:**
1. Countersign a baselined SRS record as eligible user
2. `GET /api/hazop/srs/:id`

**Expected:** Same `baseline_approval` object shape as LOPA

### I-14 — UI: Countersign Button Visibility
**Steps:**
1. Open LOPA detail for a baselined, not-yet-countersigned record as an eligible user (GM/SM/Superuser who is NOT the baselined_by user)
2. Verify "Countersign" button is visible (amber-outlined, ShieldCheck icon)
3. Click button → dialog opens with discipline dropdown and notes textarea
4. Verify "Confirm Countersignature" button is disabled until discipline selected
5. Select discipline; verify button enables; submit

**Screenshot required:** Countersign dialog with discipline selected before submit

### I-15 — UI: Approval Block Display After Countersign
**Steps:**
1. After successful countersign, reload LOPA detail
2. Verify the Countersignature Detail block shows all 5 labelled fields:
   - Baselined By: user name
   - Countersigned By: user name
   - Discipline: Process / Instrumentation / Safety (capitalised)
   - Countersigned At: formatted timestamp (DD/MM/YYYY HH:MM)
   - Token Status: "Verify Token" button
3. Click "Verify Token" → toast: "Token valid ✓" (green)

**Screenshot required:** Approval block with all 5 fields + green toast

### I-16 — UI: is_countersigned Badge on LOPA List
**Steps:**
1. Navigate to LOPA register for the study
2. Find the countersigned LOPA

**Expected:** Green "Signed" badge visible in the countersigned column

### I-17 — UI: is_countersigned Badge on SRS List
**Steps:**
1. Navigate to SRS register after countersigning an SRS

**Expected:** Green "Countersigned" badge visible in the table column

### I-18 — ZTC-520: Table Count Verification
**Steps:**
1. Run:
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'hazop%';
```

**Expected:** `37`

### I-19 — ZTC-517/518: Additive-Only Confirmation
**Steps:**
1. `\d hazop_lopa_records` — verify no columns removed; `approved_by` and `approved_at` present
2. `\d hazop_srs_records` — verify no columns removed
3. Confirm no CHECK constraints modified on either table

**Evidence:** `\d` output screenshots

---

## SECTION J — Integrated Regression Smoke Test

After all Phase 5D checks are complete, run the following rapid regression:

| # | Test | Expected |
|---|------|----------|
| J-01 | Login page loads | 200 OK |
| J-02 | HAZOP dashboard loads | Study list visible |
| J-03 | Worksheet page loads | Loops panel visible |
| J-04 | LOPA list for study loads | Cards visible, is_countersigned column present |
| J-05 | SRS list for study loads | Table visible, Countersigned column present |
| J-06 | MOC list for study loads | MOC register visible |
| J-07 | LOPA detail loads | Baseline / countersign block visible |
| J-08 | SRS detail loads | Same |
| J-09 | Browser console errors | Zero HAZOP-related errors |

---

## Screenshot Log (Required Artefacts for Closure)

| # | Screenshot | Test Step | Status |
|---|-----------|-----------|--------|
| S-01 | HAZOP dashboard with study cards | A-01 | ⏳ |
| S-02 | Worksheet — loop/node/step tri-panel | B-01 | ⏳ |
| S-03 | Deviation list for a node after generation | C-01 | ⏳ |
| S-04 | C&E matrix with marked cells | E-03 | ⏳ |
| S-05 | LOPA detail with calculated fields | F-02 | ⏳ |
| S-06 | `\d hazop_baseline_approvals` psql output | I-01 | ⏳ |
| S-07 | Countersign dialog (discipline selected) | I-14 | ⏳ |
| S-08 | Approval detail block + green toast | I-15 | ⏳ |
| S-09 | LOPA list — "Signed" badge visible | I-16 | ⏳ |
| S-10 | SRS list — "Countersigned" badge visible | I-17 | ⏳ |
| S-11 | SQL: table count = 37 | I-18 | ⏳ |
| S-12 | SQL: tampered token → `valid: false` response | I-11 | ⏳ |
