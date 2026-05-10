# PPPC Phase 6 — Generate / Sync PPPC Baseline v1.0

**Status:** APPROVED — Final closure confirmed 2026-05-10  
**Scope:** `epc-buy-list-control` page — single smart action button "Generate / Sync PPPC"  
**Implementation commits:** `8cab06de` (Phase 6 routes + frontend), `302c7b03` (lineHasActivity governance fix)

---

## 1. Overview

Phase 6 adds a single **"Generate / Sync PPPC"** smart action to the Buy List Control page. On click, it auto-detects one of three scenarios and routes to the appropriate workflow with zero manual decision-making required from the user.

| Scenario | Condition | Action |
|---|---|---|
| **1 — Backfill** | Project items with `bp_code` + matched active package + no current buy list | Opens Backfill Dialog → one-click generation |
| **2 — Sync** | Existing lists where `source_package_id` points to an older version than the latest active package | Opens Diff Sheet → per-action granular sync |
| **3 — Current** | All items covered and lists aligned with latest active package | Shows green "PPPC Current" banner (auto-fades 4 s) |

---

## 2. Database Schema Additions

Three columns added via migration:

| Table | Column | Type | Purpose |
|---|---|---|---|
| `buy_package_lines` | `line_uid` | `UUID DEFAULT gen_random_uuid() NOT NULL` | Stable identity for a catalog line across package revisions — used for diff matching |
| `project_buy_list_lines` | `is_user_modified` | `BOOLEAN DEFAULT false NOT NULL` | Set to `true` when user edits catalog-sensitive fields on a catalog-seeded line; prevents catalog sync from overwriting deliberate changes |
| `project_buy_list_headers` | `latest_synced_package_id` | `INTEGER FK → buy_package_headers (SET NULL)` | Tracks the most recent package version used in a sync. `source_package_id` remains IMMUTABLE after seeding |

---

## 3. API Endpoints (Phase 6)

All endpoints require authentication + Manager-or-above role (except replace-from-package which requires Superuser).  
All mutating endpoints acquire `pg_advisory_xact_lock(projectId)` inside a transaction.

### 3.1 `GET /api/projects/:projectId/pppc-status`
Detects the scenario for the selected project.

**Response:**
```json
{
  "scenario": "backfill" | "sync" | "current",
  "totalProjectItems": N,
  "missingLists": N,
  "alreadyHasLists": N,
  "noPackageMatch": N,
  "preview": [{ "projectItemId", "projectItemCode", "matchedPackageCode", "lineCount" }],
  "driftedLists": [{ "listId", "currentPackageVersion", "latestPackageVersion", ... }]
}
```

### 3.2 `POST /api/projects/:projectId/buy-lists/backfill`
Generates missing buy lists for all Scenario 1 eligible items.

**Safety:**
- Per-item transaction with advisory lock
- Inside tx: re-validates package still `status='active'` (revalidation)
- Inside tx: re-checks no list was created since status query (race guard → 409 with `errors[]`)
- Tags auto-generated via `getNextTagNoInTx()` with advisory lock
- Audit event `buy_list_backfill` written to `project_workflow_events`
- Generated lists start in `draft` status

**Response:** `{ created: N, errors: M, details: [...], errorDetails: [...] }`

### 3.3 `GET /api/buy-lists/:id/package-diff`
Computes the diff between project list lines and the latest active package for that product.

**Diff algorithm:**
- Loads project lines with their `source_line_uid` (via `buy_package_lines.line_uid`)
- Loads latest package lines by `line_uid`
- Classifies each project line:
  - `removed` — project line's `source_line_uid` not present in new package
  - `changed` — uid matched but `default_quantity` or `default_specification` differs
  - `unchanged` — uid matched, values identical
- `newLines` — in new package but not in project list (by uid set)
- Each `removed` and `changed` line has `activityBlocked` + `activityReason` from `lineHasActivity()`

### 3.4 `POST /api/buy-lists/:id/sync-additions`
Adds only the new lines (not removes, not changes) from the latest package to the project list.

**Safety:**
- Advisory lock + transaction
- Revalidates latest active package inside tx
- Short-circuits if already up-to-date
- Uses `existingUids` set to prevent duplicate lines
- Updates `latest_synced_package_id` (`source_package_id` not touched)
- Audit event `buy_list_sync_additions`

### 3.5 `POST /api/buy-list-lines/:id/mark-obsolete`
Sets a removed line's `status = 'obsolete'`.

**Blocked if:** `lineHasActivity()` returns blocked, OR list is locked.  
**Idempotent:** returns `{ message: 'Already obsolete' }` if already done.  
**Audit event:** `buy_list_line_mark_obsolete`

### 3.6 `POST /api/buy-list-lines/:id/sync-catalog-change`
Applies updated `quantity` / `specification` from the new catalog line to the project line.

**Blocked if:**
- `line.is_user_modified = true` → **hard reject** — user deliberate change is protected
- `lineHasActivity()` returns blocked
- List is locked

**Audit event:** `buy_list_line_sync_catalog_change`

### 3.7 `POST /api/buy-lists/:id/replace-from-package` _(Superuser only)_
Full destructive replacement: deletes all current lines and re-seeds from latest active package.

**Gates (all must pass):**
1. `role = 'Superuser'` — any other role gets 403
2. `confirmationText === 'REPLACE'` — typed confirmation required
3. `note` field non-empty — required for audit
4. `lineHasActivity()` checked on every non-cancelled line — if any blocked → 409 with full `blockedLines[]`
5. List must not be `locked`
6. Revalidation inside tx: package still `status='active'`

**Snapshot before destruction:** Full header + lines + selections written to `project_workflow_events` as `buy_list_full_replacement_snapshot` before any DELETE.  
**After replacement:** `latest_synced_package_id` updated; `source_package_id` remains immutable; list status reset to `draft`.  
**Audit event:** `buy_list_full_replacement`

---

## 4. `lineHasActivity()` — Full Procurement Lifecycle Coverage

The function checks 6 independent conditions, all joined via `item_planning_records.source_buy_list_line_id`. Results are returned in severity order (most irreversible first).

```sql
-- Check 1: Selection approved or datasheet uploaded
EXISTS(
  SELECT 1 FROM buy_list_line_selections s
  WHERE s.buy_list_line_id = $lineId
    AND (s.approval_status = 'approved' OR s.datasheet_uploaded = true)
) AS has_selection_activity

-- Check 2: Active procurement execution record (RFQ / vendor selection)
EXISTS(
  SELECT 1 FROM item_planning_records ipr
  JOIN procurement_execution_records per ON per.planning_record_id = ipr.id
  WHERE ipr.source_buy_list_line_id = $lineId
    AND per.status NOT IN ('cancelled','superseded')
) AS has_per_activity

-- Check 3: PO preparation record active (vendor finalized / technical review)
EXISTS(
  SELECT 1 FROM item_planning_records ipr
  JOIN po_preparation_records ppr ON ppr.planning_record_id = ipr.id
  WHERE ipr.source_buy_list_line_id = $lineId
    AND ppr.status NOT IN ('cancelled','superseded')
) AS has_po_prep_activity

-- Check 4: EPC Purchase Order created / issued / approved / on-hold  [CRITICAL — added in governance fix]
EXISTS(
  SELECT 1 FROM item_planning_records ipr
  JOIN epc_purchase_orders epo ON epo.planning_record_id = ipr.id
  WHERE ipr.source_buy_list_line_id = $lineId
    AND epo.status NOT IN ('cancelled','superseded')
) AS has_epc_po_activity

-- Check 5: Quality planning record active (technical quality approval)
EXISTS(
  SELECT 1 FROM item_planning_records ipr
  JOIN quality_planning_records qpr ON qpr.planning_record_id = ipr.id
  WHERE ipr.source_buy_list_line_id = $lineId
    AND qpr.status NOT IN ('cancelled','superseded')
) AS has_quality_plan_activity

-- Check 6: Inspection execution record active (scheduled / in-progress / completed)
EXISTS(
  SELECT 1 FROM item_planning_records ipr
  JOIN inspection_execution_records ier ON ier.planning_record_id = ipr.id
  WHERE ipr.source_buy_list_line_id = $lineId
    AND ier.status NOT IN ('cancelled','superseded')
) AS has_inspection_activity
```

**Return priority (most severe first):**

| Priority | Flag | Reason string |
|---|---|---|
| 1 (highest) | `has_epc_po_activity` | `EPC Purchase Order created / issued / approved` |
| 2 | `has_inspection_activity` | `Inspection record active (scheduled / in-progress / completed)` |
| 3 | `has_po_prep_activity` | `PO preparation active — vendor finalized / technical review in progress` |
| 4 | `has_per_activity` | `Procurement execution record active (RFQ / vendor selection)` |
| 5 | `has_quality_plan_activity` | `Quality plan active` |
| 6 | `has_selection_activity` | `Selection approved / datasheet uploaded` |

### Governance Gap Fixed — Audit Evidence

**Gap identified (2026-05-10):** The original `lineHasActivity()` only checked `procurement_execution_records` via the `ipr → per` join. Live DB query found **13 EPC Purchase Orders** (`status = issued` or `on_hold_pending_cancellation_review`) with `planning_record_id` set but **zero corresponding PER records** — meaning the old function returned `blocked: false` for all 13, allowing destructive replacement on lines with active issued POs.

**Proof query result (live data, 2026-05-10):**

| PO Number | EPC PO Status | Old function | New function |
|---|---|---|---|
| 2627-007-PO-0001 | `on_hold_pending_cancellation_review` | ❌ NOT BLOCKED | ✅ BLOCKED |
| 2627-009-PO-0001 | `issued` | ❌ NOT BLOCKED | ✅ BLOCKED |
| 2627-014-PO-0001 | `issued` | ❌ NOT BLOCKED | ✅ BLOCKED |
| 2627-015-PO-0001 | `issued` | ❌ NOT BLOCKED | ✅ BLOCKED |
| … 9 more | `issued` / `on_hold` | ❌ All missed | ✅ All caught |

**Fix:** Added Check 4 (`epc_purchase_orders`), Check 3 (`po_preparation_records`), Check 5 (`quality_planning_records`), Check 6 (`inspection_execution_records`). Also tightened Check 2 from `status != 'cancelled'` to `status NOT IN ('cancelled','superseded')` for consistency.

---

## 5. User-Modified Line Protection

When a user edits any of the following fields on a catalog-seeded line (one where `source_package_line_id IS NOT NULL`), the PATCH handler automatically sets `is_user_modified = true`:

- `genericRequirement`
- `quantity`
- `specification`
- `technicalAttributes`

This flag permanently protects the line from `sync-catalog-change`. The diff sheet shows user-modified changed lines as **"Protected (user-modified)"** and the action button is disabled. Only full replacement (Superuser, typed REPLACE) can override it — and even then, only if no execution activity exists.

---

## 6. Frontend UI

**Button location:** Page header, next to "New Buy List" — visible to Manager+ when a project is selected.

**Scenario 1 — Backfill Dialog:**
- Summary badges: eligible / already-have-list / no-package-match counts
- Preview table: project item code, description, matched package code, line count
- Single "Generate N Buy List(s)" confirm button
- Calls `POST /backfill` with `dryRun: false`

**Scenario 2 — Diff Sheet Dialog:**
- Package version header: `vX → vY`
- Multi-list navigation if multiple drifted lists
- Activity warning banner if any lines are blocked
- Three sections: New Lines (green), Removed Lines (red), Changed Lines (amber)
- Per-section action buttons: "Add N New Line(s) Only", "Mark Obsolete", "Apply Catalog Value"
- Superuser-only full replacement section at bottom (requires non-empty note + typed "REPLACE")
- `obsolete` line status rendered with strikethrough styling

**Scenario 3 — PPPC Current:**
- No dialog
- Green inline banner: "PPPC Current — all buy lists match latest active package"
- Auto-fades after 4 seconds

---

## 7. Invariants

| Rule | Enforced where |
|---|---|
| `source_package_id` immutable after seeding | replace endpoint only writes `latest_synced_package_id` |
| No duplicate buy list per project item | Race guard re-check inside advisory-locked tx in backfill |
| Package must still be active before mutation | Revalidation `WHERE status='active'` inside every mutating tx |
| `is_user_modified` lines protected from catalog sync | Hard reject in `sync-catalog-change` endpoint |
| Full replacement blocked if any line has execution activity | All lines scanned via `lineHasActivity()` before delete; 409 if any blocked |
| Full replacement requires snapshot | `buy_list_full_replacement_snapshot` event written before any DELETE |
| Full replacement requires Superuser + typed REPLACE + note | Three independent gates in endpoint |
| Advisory lock on all mutating ops | `pg_advisory_xact_lock(projectId)` inside every mutating transaction |
| All mutations audit-logged | `project_workflow_events` rows for every state change |

---

## 8. File Index

| File | Role |
|---|---|
| `server/pppc-routes.ts` | All 7 Phase 6 endpoints + `lineHasActivity()` + `latestActivePackageForProduct()` |
| `client/src/pages/epc-buy-list-control-page.tsx` | Frontend — button, state, mutations, Backfill Dialog, Diff Sheet, PPPC Current banner |
| `shared/schema.ts` | Schema additions: `lineUid`, `isUserModified`, `latestSyncedPackageId` |
| `docs/pppc-phase6-generate-sync-baseline-v1.0.md` | This document |
