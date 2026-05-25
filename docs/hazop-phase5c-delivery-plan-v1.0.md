# HAZOP Phase 5C — Management of Change (MOC) Register
# Delivery Plan v1.0

**Document**: `docs/hazop-phase5c-delivery-plan-v1.0.md`  
**Date**: 2026-05-25  
**Status**: DRAFT — Awaiting product owner review  
**Predecessor**: Phase 5B formally closed 2026-05-25  
**Gate**: Implementation must NOT begin until this plan is reviewed and all design decisions are resolved.

---

## 1. Phase 5C Objective

Every modification to a baselined safety artefact (scenario, SIF, interlock, alarm trip, SCE, LOPA record, SRS record) must be formally documented before it can proceed. Phase 5C delivers the **Management of Change (MOC) Register** — a structured log of what changed, why, who authorised it, and the before/after baseline revision.

The MOC register satisfies IEC 61511-1 §16.2 (management of functional safety) and provides the audit trail required if a baselined safety study is subsequently modified.

**Output of Phase 5C:** Table 36 (`hazop_moc_records`), 7 API routes, 2 UI pages.

---

## 2. Design Decisions Required Before Build

Three decisions must be resolved before T5C-001 begins.

---

### Decision 1 — MOC Trigger Policy

**Background:** A baselined artefact (any record with a non-null `baseline_revision`) is formally frozen. The MOC register must capture any change made after baselining. The question is how the system enforces this.

**Option A — Manual creation only**

The engineer opens the MOC Register page, raises an MOC record explicitly, fills in the change description and artefact reference, then proceeds to make the underlying edit. The system does not automatically block edits to baselined artefacts — the discipline is procedural, not enforced by the application.

| Pros | Cons |
|------|------|
| Simpler implementation | No technical gate — relies on engineer discipline |
| Consistent with how LOPA and SRS set-baseline works today | MOC and actual edit can become out of sync |
| Faster to build and test | Auditor cannot prove edit was pre-approved |

**Option B — Detect-and-gate**

When an engineer tries to PATCH a record whose `baseline_revision` is non-null, the API returns `409 Conflict` with a body of `{ "moc_required": true, "artefact": "..." }`. The frontend catches this and shows a modal prompting the engineer to either (a) raise an MOC first, or (b) link an existing open MOC. The underlying edit is only accepted once a valid `moc_id` is passed in the request.

| Pros | Cons |
|------|------|
| Technical enforcement — impossible to bypass | Higher implementation effort (client + server coordination) |
| Full audit integrity — edit cannot happen without approved MOC | MOC must be raised and approved before edit, which may be slow |
| Satisfies strict IEC 61511 audit requirements | Adds complexity to all PATCH routes in Phases 4 and 5 |

**Recommendation: Option B** — the MOC gate should be enforced at the API level. The pattern is straightforward: any PATCH to a baselined artefact requires a `moc_id` query parameter referencing an open MOC against that artefact. If absent, the server returns 409.

> **Scope note for Option B:** The gate would apply only to routes already delivered — `PATCH /api/hazop/srs/:id` and `PATCH /api/hazop/lopa/:id`. Phase 4 artefact PATCH routes (scenario, SIF, interlock, alarm trip, SCE) are guarded only if Decision 2 (below) includes them.

---

### Decision 2 — Artefact Scope

**Background:** The spec defines 7 artefact FK columns in `hazop_moc_records` (scenario, SIF, interlock, alarm_trip, SCE, LOPA, SRS). Exactly one must be non-null per MOC record.

**Option A — Full scope (all 7 artefact types)**

Phase 5C covers all artefact types from the start. MOC can be raised against any Phase 4 or Phase 5 artefact. If Decision 1 resolves to Option B, the gate is applied to all PATCH routes across Phases 4 and 5.

| Pros | Cons |
|------|------|
| Complete from day one | More routes to update; larger test surface |
| No follow-on work required | Phase 4 PATCH routes require modification |

**Option B — LOPA + SRS only (Phase 5A/5B artefacts)**

Phase 5C covers only `lopa_id` and `srs_id`. MOC records for Phase 4 artefacts (scenarios, SIFs, interlocks, alarm trips, SCEs) are deferred. The `hazop_moc_records` table is created with all 7 FK columns (schema-complete, additive-only), but the validation check and detect-and-gate (if chosen) only apply to LOPA and SRS PATCH routes.

| Pros | Cons |
|------|------|
| Smaller blast radius; Phase 4 routes untouched | Phase 4 artefact changes are uncontrolled |
| Faster to deliver and test | Requires a follow-on task to complete |
| Lower regression risk | |

**Recommendation: Option B** — the table is created schema-complete (all 7 FKs), but the gate and validation enforce only LOPA + SRS in Phase 5C. Phase 4 artefact gating is deferred to a discrete follow-on.

---

### Decision 3 — Approval Role Gate

**Background:** MOC approval requires a countersignature from a second person. The question is which roles may approve an MOC.

**Option A — Same gate as set-baseline (Superuser / GM / SM)**

Consistent with Phase 5A and 5B: only users with role `superuser`, `gm`, or `sm` can approve an MOC.

**Option B — Any user except the requestor**

Any authenticated user can approve an MOC, provided they are not the user who raised it.

**Recommendation: Option A** — approval role gate mirrors the set-baseline gate (`superuser`, `gm`, `sm`). Self-approval is always blocked regardless of role (same as prior phases).

---

## 3. New Table: `hazop_moc_records` (Table 36)

### 3.1 DDL

```sql
CREATE TABLE hazop_moc_records (
  id                       SERIAL PRIMARY KEY,
  study_id                 INTEGER NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  moc_number               TEXT NOT NULL,           -- MOC-{nnn}; unique per study

  -- Linked artefact (exactly one non-null enforced by CHECK)
  scenario_id              INTEGER REFERENCES hazop_scenarios(id) ON DELETE SET NULL,
  safety_function_id       INTEGER REFERENCES hazop_safety_functions(id) ON DELETE SET NULL,
  interlock_id             INTEGER REFERENCES hazop_interlocks(id) ON DELETE SET NULL,
  alarm_trip_id            INTEGER REFERENCES hazop_alarm_trips(id) ON DELETE SET NULL,
  sce_id                   INTEGER REFERENCES hazop_safety_critical_elements(id) ON DELETE SET NULL,
  lopa_id                  INTEGER REFERENCES hazop_lopa_records(id) ON DELETE SET NULL,
  srs_id                   INTEGER REFERENCES hazop_srs_records(id) ON DELETE SET NULL,

  -- Change description
  change_type              TEXT NOT NULL
                           CHECK (change_type IN ('add','modify','delete','supersede','rebaseline')),
  change_reason            TEXT NOT NULL,
  change_description       TEXT NOT NULL,
  safety_impact_assessment TEXT,

  -- Before/after baseline
  baseline_before          TEXT,                    -- baseline_revision before change
  baseline_after           TEXT,                    -- baseline_revision after change (filled on close)

  -- Approval
  requested_by             INTEGER REFERENCES users(id),
  requested_at             TIMESTAMPTZ DEFAULT NOW(),
  approved_by              INTEGER REFERENCES users(id),
  approved_at              TIMESTAMPTZ,
  rejected_by              INTEGER REFERENCES users(id),
  rejected_at              TIMESTAMPTZ,
  rejection_reason         TEXT,
  moc_status               TEXT NOT NULL DEFAULT 'open'
                           CHECK (moc_status IN ('open','approved','rejected','closed')),

  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (study_id, moc_number),

  -- Exactly one artefact FK must be non-null
  CHECK (
    (CASE WHEN scenario_id        IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN safety_function_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN interlock_id       IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN alarm_trip_id      IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN sce_id             IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN lopa_id            IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN srs_id             IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
```

### 3.2 Column notes

| Column | Notes |
|--------|-------|
| `moc_number` | Auto-generated server-side as `MOC-{NNN}` (zero-padded to 3 digits, unique per `study_id`) using `pg_advisory_xact_lock(study_id)` |
| `baseline_before` | Captured at MOC creation from the artefact's current `baseline_revision`. If artefact is not yet baselined, 400 error (MOC only applies to baselined artefacts). |
| `baseline_after` | Populated server-side when the MOC is closed — copied from the artefact's `baseline_revision` after the change is applied and re-baselined. |
| `safety_impact_assessment` | Free-text field; required before MOC can be approved (422 if blank at approval time). |
| Exactly-one-artefact CHECK | Enforced both at DB level (CHECK constraint) and server-side (422 if zero or multiple FKs provided). |

---

## 4. API Routes (7 routes)

All routes require `ensureAuthenticated`. Role gate on approve/reject: `superuser`, `gm`, `sm`.

| # | Method | Route | Description |
|---|--------|-------|-------------|
| 1 | `GET` | `/api/hazop/studies/:studyId/moc` | List all MOC records for a study; supports `?status=open\|approved\|rejected\|closed` filter |
| 2 | `POST` | `/api/hazop/studies/:studyId/moc` | Raise a new MOC record; validates exactly-one-artefact, captures `baseline_before` from artefact |
| 3 | `GET` | `/api/hazop/moc/:id` | Get MOC detail (includes resolved artefact snapshot: artefact type, number, current status) |
| 4 | `PATCH` | `/api/hazop/moc/:id` | Update MOC (only if `moc_status = 'open'`; 409 if approved/rejected/closed) |
| 5 | `DELETE` | `/api/hazop/moc/:id` | Delete MOC (only if `moc_status = 'open'`; 409 otherwise) |
| 6 | `POST` | `/api/hazop/moc/:id/approve` | Approve MOC; role gate (superuser/gm/sm); self-approval blocked (422); requires `safety_impact_assessment` non-null (422); sets `approved_by`, `approved_at`, `moc_status = 'approved'` |
| 7 | `POST` | `/api/hazop/moc/:id/reject` | Reject MOC; same role gate; requires `rejection_reason` in body (422 if missing); sets `rejected_by`, `rejected_at`, `rejection_reason`, `moc_status = 'rejected'` |
| 8 | `POST` | `/api/hazop/moc/:id/close` | Close an approved MOC; captures `baseline_after` from artefact's current `baseline_revision`; sets `moc_status = 'closed'`; returns 409 if not in `approved` status |

> **Note on detect-and-gate (if Decision 1 = Option B):** The PATCH gate is implemented as middleware injected into the existing `PATCH /api/hazop/lopa/:id` and `PATCH /api/hazop/srs/:id` route handlers — not as a new route. If the record's `baseline_revision` is non-null and no `?moc_id=` query parameter is supplied, the handler returns `409 { moc_required: true, artefact_type: "...", artefact_id: N }`.

Total new routes: **8** (7 MOC lifecycle + 1 gate middleware injected into 2 existing PATCH routes if Decision 1 = B).

---

## 5. UI Pages (2 pages)

### 5.1 MOC Register — `/hazop/studies/:id/moc`

**Purpose:** Shows all MOC records for a study with status badges, artefact links, and a "Raise MOC" action.

**Layout:**

- Page header: "Management of Change Register" with study name and `[Raise MOC]` button (opens inline drawer)
- Filter bar: Status tabs (All / Open / Approved / Rejected / Closed) + artefact-type dropdown
- Table columns: MOC No. · Artefact · Change Type · Change Reason · Status badge · Requested By · Requested At · Approved By · Actions
- Status badges: `open` = amber, `approved` = blue, `rejected` = red, `closed` = green
- "Raise MOC" drawer: artefact type selector (LOPA / SRS per Decision 2), artefact number picker (filtered by study), change type, reason, description, safety impact assessment
- Empty state: "No MOC records for this study."

### 5.2 MOC Detail — `/hazop/studies/:id/moc/:mocId`

**Purpose:** Full MOC record view and action panel for approval/rejection/closure.

**Layout:**

- **Header strip:** MOC number, status badge, artefact link (clickable → opens SRS/LOPA detail in new tab)
- **Section 1 — Change Details:** Read-only when approved/closed. Editable when open. Fields: change type, reason, description, safety impact assessment, notes, baseline_before.
- **Section 2 — Artefact Snapshot:** Server-provided snapshot of the linked artefact at time of MOC creation — artefact number, current status, current baseline revision. Visual indicator if artefact has been re-baselined since MOC was raised.
- **Section 3 — Approval Panel (role-gated):** Visible to superuser/gm/sm only.
  - If `moc_status = 'open'`: `[Approve]` and `[Reject]` buttons. Reject requires rejection reason input.
  - If `moc_status = 'approved'`: `[Close MOC]` button with `baseline_after` preview field.
  - If `moc_status = 'rejected'` or `'closed'`: read-only display with rejection reason or closure summary.
- **Section 4 — Audit Trail:** Raised by / at → Approved/Rejected by / at → Closed at. Timeline layout.

---

## 6. Sub-Task Breakdown

| Task | What | Dependency |
|------|------|------------|
| **T5C-001** | Create `hazop_moc_records` table in DB and add Drizzle schema entry in `shared/schema.ts` | Decisions 1, 2, 3 resolved |
| **T5C-002** | Implement 7 MOC API routes in `server/hazop-routes.ts` (after PHASE 5B END marker); add detect-and-gate middleware to LOPA/SRS PATCH handlers if Decision 1 = B | T5C-001 |
| **T5C-003** | Build MOC Register page (`client/src/pages/hazop/hazop-moc.tsx`) and MOC Detail page (`client/src/pages/hazop/hazop-moc-detail.tsx`); add routes to `App.tsx`; add sidebar entry | T5C-002 |

---

## 7. Zero-Trust Audit Checklist (ZTC-101 – ZTC-113)

| ID | Check | Verified by |
|----|-------|-------------|
| ZTC-101 | `hazop_moc_records` table exists with all columns and correct CHECK constraints | `\d hazop_moc_records` |
| ZTC-102 | Exactly-one-artefact DB CHECK prevents zero or multiple FK values | INSERT with 0 FKs → error; INSERT with 2 FKs → error |
| ZTC-103 | `moc_number` auto-generated as `MOC-{NNN}` unique per study | POST two MOCs to same study → distinct numbers |
| ZTC-104 | `GET /api/hazop/studies/:studyId/moc` → 401 unauthenticated | `curl` no-auth |
| ZTC-105 | `POST /api/hazop/studies/:studyId/moc` → 401 unauthenticated | `curl` no-auth |
| ZTC-106 | `GET /api/hazop/moc/:id` → 401 unauthenticated | `curl` no-auth |
| ZTC-107 | `PATCH /api/hazop/moc/:id` → 401 unauthenticated | `curl` no-auth |
| ZTC-108 | `DELETE /api/hazop/moc/:id` → 401 unauthenticated | `curl` no-auth |
| ZTC-109 | `POST /api/hazop/moc/:id/approve` → 401 unauthenticated | `curl` no-auth |
| ZTC-110 | `POST /api/hazop/moc/:id/reject` → 401 unauthenticated | `curl` no-auth |
| ZTC-111 | `POST /api/hazop/moc/:id/close` → 401 unauthenticated | `curl` no-auth |
| ZTC-112 | Self-approval blocked — `approved_by = requested_by` → 422 | Functional test |
| ZTC-113 | Approve/reject role gate — non-superuser/gm/sm → 403 | Functional test |
| ZTC-114 | PATCH on approved/rejected/closed MOC → 409 | Functional test |
| ZTC-115 | DELETE on approved/rejected/closed MOC → 409 | Functional test |
| ZTC-116 | Approve without `safety_impact_assessment` → 422 | Functional test |
| ZTC-117 | Reject without `rejection_reason` body field → 422 | Functional test |
| ZTC-118 | Close on non-approved MOC → 409 | Functional test |
| ZTC-119 | `baseline_before` captured from artefact at MOC creation time | Row inspection |
| ZTC-120 | `baseline_after` populated on close from artefact's current `baseline_revision` | Row inspection after close |
| ZTC-121 | MOC against non-baselined artefact → 400 | Functional test |
| ZTC-122 | Detect-and-gate: PATCH `/api/hazop/lopa/:id` on baselined LOPA without `moc_id` → 409 (if Decision 1 = B) | Functional test |
| ZTC-123 | Detect-and-gate: PATCH `/api/hazop/srs/:id` on baselined SRS without `moc_id` → 409 (if Decision 1 = B) | Functional test |
| ZTC-124 | Table count = 36 (`hazop_moc_records` is the only new table) | `SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'hazop%'` |
| ZTC-125 | No Phase 4 or Phase 5A/5B table structure modified | `\d` each affected table |

---

## 8. Additive-Only Confirmation

| Action | Confirmation |
|--------|-------------|
| New table | `hazop_moc_records` (table 36) |
| Existing tables modified | None — if Decision 1 = Option B, the detect-and-gate is server-side middleware only; no column is added to existing tables |
| Phase 4 schema touched | No |
| Phase 5A/5B schema touched | No |
| Total HAZOP tables after Phase 5C | **36** |

---

## 9. Out of Scope for Phase 5C

| Item | Disposition |
|------|-------------|
| Countersigned baseline approval (HMAC token) | Phase 5D |
| MOC integration with Phase 4 artefacts (scenario, SIF, interlock, alarm trip, SCE) | Deferred (see Decision 2) |
| Email notification on MOC approval | Phase 6+ |
| MOC export / PDF | Phase 6+ |
| AI-powered impact assessment suggestion | Phase 5E |

---

*Document status: DRAFT — awaiting product owner decisions on §2 (Decisions 1, 2, 3) before build authorisation.*
