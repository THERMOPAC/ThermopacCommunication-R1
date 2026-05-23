# Department Master — Phase 3 Planning
**Version**: 1.0 DRAFT  
**Date**: 2026-05-23  
**Status**: PLANNING ONLY — No implementation in this document  
**Prerequisite**: Phase 2 complete and closed ✅

---

## 1. Objective

Replace all three hardcoded department arrays in the OI/SOP/Enforcement/Lesson/Issue UI with the
`useDepartments()` hook introduced in Phase 2 Step 6, so that the Department Master table
(`department_master`) becomes the single source of truth for department dropdown lists across the
entire OI module.

---

## 2. Mandatory Prerequisite Before Phase 3 Begins

### 2.1 Legacy "Engineering" User Department Mapping

A database scan performed at Phase 2 closure found the following active "Engineering" references:

| Table | Column | Engineering rows |
|---|---|---|
| `users` | `department` | **1 user** |
| `workweek_policies` | `department` | **1 row** |
| `oi_issues` | `department` | 0 |
| `oi_sop_records` | `department` | 0 |
| `oi_enforcement_controls` | `department` | 0 |
| `oi_issue_title_master` | `department` | 0 |
| `department_page_permissions` | `department` | 0 |
| `epc_assignment_rules` | `department` | 0 |

The `users.department` value is a free-text field; `department_page_permissions.department` is also
free-text and currently has no "Engineering" row. The `workweek_policies.department` Engineering
row must not be deleted — it governs leave/payroll computation for the user assigned to it.

**Resolution required before Phase 3:**

1. **Confirm with HR/Admin** whether the 1 Engineering-department user should be remapped to an
   active department (e.g. "Design" or "Projects") or left as-is.
2. If the user is remapped in `users.department`, the corresponding `workweek_policies` row must
   also be updated to match.
3. `oi-lesson-constants.ts` currently lists "Engineering" in `OI_DEPARTMENTS` — this is the only
   OI constant that includes Engineering (11 items vs 10 items in the other two). No OI records
   currently reference Engineering, but the constant must still be addressed.
4. **Decision gate**: If no Engineering remapping is feasible before Phase 3, `useDepartments()`
   must be extended to accept an `includeInactive` flag so that legacy "Engineering" records can
   be shown correctly without re-activating the department.

Until this decision is made and applied, **Phase 3 must not start**.

---

## 3. Exact Frontend Files Impacted

### 3.1 Constant Files — Constants to Remove

| File | Constant | Lines | Items | Notes |
|---|---|---|---|---|
| `client/src/pages/oi/oi-sop-constants.ts` | `SOP_DEPARTMENTS` | 69–80 | 10 (no Engineering) | `as const` tuple |
| `client/src/pages/oi/oi-enforcement-constants.ts` | `DEPARTMENTS` | 84–87 | 10 (no Engineering) | plain array |
| `client/src/pages/oi/oi-lesson-constants.ts` | `OI_DEPARTMENTS` | 141–145 | **11 (includes Engineering)** | plain array — requires prerequisite 2.1 before removal |

No other constants in these files are related to departments. All other exports (status labels,
color maps, type lists) are untouched.

### 3.2 Component Files — Call Sites to Migrate (6 total)

| File | Import | Usage | Call-site lines |
|---|---|---|---|
| `client/src/pages/oi/oi-sop-register.tsx` | `SOP_DEPARTMENTS` | Filter dropdown + create-form dropdown | 25 (import), 129 (filter), 186 (form) |
| `client/src/pages/oi/oi-sop-detail.tsx` | `SOP_DEPARTMENTS` | Import present at line 30; **zero active dropdown call-sites confirmed** (detail only displays stored value at line 145) | 30 (import only) |
| `client/src/pages/oi/oi-enforcement-register.tsx` | `DEPARTMENTS` | Create-form dropdown | 16 (import), 160 (form) |
| `client/src/pages/oi/oi-lesson-register.tsx` | `OI_DEPARTMENTS` | Create-form dropdown | 34 (import), 255 (form) |
| `client/src/pages/oi/oi-lesson-detail.tsx` | `OI_DEPARTMENTS` | Edit-form dropdown | 36 (import), 487 (form) |
| `client/src/pages/oi/oi-issue-capture.tsx` | `OI_DEPARTMENTS` (from lesson-constants) | Capture-form dropdown | 16 (import), 403 (form) |

**`oi-sop-detail.tsx`** requires only import removal — no dropdown migration. The stored
`sop.department` value is displayed as-is from the record; no list is rendered from the constant.

### 3.3 Files NOT Impacted

| File | Reason |
|---|---|
| `client/src/pages/oi/oi-dashboard.tsx` | SOP-by-department chart calls `GET /api/oi/dashboard/sop-by-department` — server-aggregated, not driven by a client constant |
| `client/src/pages/oi/oi-capa-constants.ts` | No department constant |
| `client/src/pages/oi/oi-rca-constants.ts` | No department constant |
| `client/src/pages/oi/oi-issue-register.tsx` | No department dropdown (filter uses free-text or server-returned values) |
| `client/src/pages/oi/oi-issue-detail.tsx` | Displays stored value only |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | Displays stored `ctrl.department` (line 732) — no list rendered |
| `client/src/pages/admin/attendance-management-page.tsx` | Already migrated in Phase 2 Step 4 |
| All server files | `_validDepts` sets already read from DB since Phase 2 Step 5 |

---

## 4. Component Migration Order

Order is governed by blast radius (lowest risk first) and dependency (shared constants last).

```
Wave 1 — Zero-dropdown import cleanup (no behaviour change)
  1a. oi-sop-detail.tsx          — remove unused SOP_DEPARTMENTS import

Wave 2 — Single-constant, single-file components
  2a. oi-enforcement-register.tsx — replace DEPARTMENTS with useDepartments()
  2b. oi-sop-register.tsx         — replace SOP_DEPARTMENTS with useDepartments()
      (2 call-sites: filter dropdown + form dropdown)

Wave 3 — Shared OI_DEPARTMENTS constant (prerequisite 2.1 must be resolved first)
  3a. oi-lesson-register.tsx      — replace OI_DEPARTMENTS with useDepartments()
  3b. oi-lesson-detail.tsx        — replace OI_DEPARTMENTS with useDepartments()
  3c. oi-issue-capture.tsx        — replace OI_DEPARTMENTS with useDepartments()

Wave 4 — Constant file cleanup (after all consumers are migrated)
  4a. Remove SOP_DEPARTMENTS from oi-sop-constants.ts
  4b. Remove DEPARTMENTS from oi-enforcement-constants.ts
  4c. Remove OI_DEPARTMENTS from oi-lesson-constants.ts
```

Wave 4 must only run after Wave 1–3 are validated, because TypeScript will error at compile time
if any import still references the removed constants — this provides a built-in regression guard.

---

## 5. API Dependency Flow

```
department_master (PostgreSQL)
        │
        ▼
GET /api/departments          ← public, no auth, 10 active rows, sorted by sort_order
        │
        ▼
TanStack Query cache           staleTime: 5 min, gcTime: 30 min
queryKey: ["/api/departments"] ← single cache key shared across all hook consumers
        │
        ▼
useDepartments() → string[]    ← one hook call per component, all share same cache entry
        │
        ├── oi-sop-register.tsx       (filter + form)
        ├── oi-enforcement-register.tsx (form)
        ├── oi-lesson-register.tsx      (form)
        ├── oi-lesson-detail.tsx        (edit form)
        └── oi-issue-capture.tsx        (capture form)
```

**Key properties of this flow:**
- All 5 migrated components share a single HTTP request; TanStack Query deduplicates concurrent
  fetches automatically.
- The first component to mount triggers the fetch; subsequent mounts within the 5-minute window
  read from cache.
- The query key `["/api/departments"]` is already registered by the Phase 2 Step 6 hook; no
  further cache configuration is needed.

---

## 6. Loading and Error Handling Strategy

### 6.1 Current Hook Behaviour

```typescript
// use-departments.ts (Phase 2 Step 6 — current state)
export function useDepartments(): string[] {
  const { data } = useQuery<...>({ queryKey: ["/api/departments"], ... });
  return (data ?? []).map(d => d.name);
}
```

The current hook returns `[]` while loading and on error. This is the baseline fallback; no
loading or error signal is surfaced to consumers.

### 6.2 Required Hook Upgrade

Before Wave 2 begins, `useDepartments()` must be extended to expose loading and error state:

```typescript
// Proposed extended signature (planning only — not implemented here)
export function useDepartments(): {
  departments: string[];
  isLoading: boolean;
  isError: boolean;
}
```

This is a breaking change to the hook's return type. Because the hook is not yet wired to any
component (confirmed by Phase 2 grep), there are no existing consumers to break.

### 6.3 Per-Component Handling

| State | Dropdown behaviour |
|---|---|
| `isLoading = true` | Dropdown disabled, placeholder text: "Loading departments…" |
| `isError = true` | Dropdown disabled, placeholder text: "Unable to load departments" — fallback list applied (see §7) |
| `data` available | Normal render of `string[]` as `<SelectItem>` |

Loading state must never produce an empty enabled dropdown — users must not be able to submit a
form with a blank department caused by a transient API delay.

---

## 7. Fallback Behaviour if API Unavailable

The Phase 2 `useDepartments()` hook returns `[]` silently on API failure. This is acceptable
server-side (Amendment B three-layer guard), but not for UI: an empty dropdown is a data-entry
blocker.

### 7.1 Client-Side Fallback Constant

A `DEPT_CLIENT_FALLBACK` constant must be defined in `client/src/hooks/use-departments.ts`
(co-located with the hook) to be used when `isError = true`:

```typescript
// planning only — exact list matches the 10 active department_master rows
const DEPT_CLIENT_FALLBACK = [
  "Accounts","Administration","After Sales","Design","Marketing",
  "Production","Projects","Purchase","Quality Control","Stores",
];
```

**Fallback activation logic:**
- API returns error → hook returns `{ departments: DEPT_CLIENT_FALLBACK, isLoading: false, isError: true }`
- UI disables dropdown + shows a subtle warning badge: "Using cached department list"
- Fallback is never shown as normal data — the error state must be visible to the user

### 7.2 Fallback Does NOT Apply To

- SOP filter dropdown in `oi-sop-register.tsx` — this is a filter-only control; on API failure
  it is acceptable to show all records (remove the filter) rather than showing a stale list.
- Dashboard chart — server-aggregated, not affected by client hook at all.

---

## 8. UI Regression Risks

| Risk | Affected Component | Severity | Mitigation |
|---|---|---|---|
| Flash of empty dropdown during load | All 5 migrated components | Medium | Disabled state + "Loading…" placeholder during `isLoading` |
| `[object Object]` rendering if hook type changes | — | Low | Hook returns `string[]`; SelectItem receives string; no object leakage |
| Missing "Engineering" in Lesson/Issue forms | `oi-lesson-register`, `oi-lesson-detail`, `oi-issue-capture` | **High** | Must resolve prerequisite 2.1 before Wave 3; see §2 |
| OI_DEPARTMENTS 11-item → 10-item delta breaks existing record display | Lesson/Issue detail views that display stored `scope_department` | Low | Detail views display stored DB value, not the hook list — not affected |
| Filter dropdown shows wrong set on `oi-sop-register` | `oi-sop-register` filter | Low | API returns same 10 names as `SOP_DEPARTMENTS` — functionally identical |
| Race condition: form submitted before departments loaded | All form components | Medium | Disable submit button while `isLoading = true` (standard pattern) |
| Cache stale after admin adds/removes a department | All hook consumers | Low | `staleTime: 5 min` is appropriate for stable reference data; admin UI (Phase 4+) will invalidate queryKey on mutation |

---

## 9. Permission and Visibility Validation Plan

The following systems use `department` as a string column but are **not fed from the client-side
hook**. Each must be explicitly verified after Phase 3 to confirm no regression:

### 9.1 `department_page_permissions` Table

- **How it works**: `getAllPagePermissionsForUser()` reads `users.department` and matches against
  `department_page_permissions.department` (free-text join).
- **Phase 3 risk**: Zero. Phase 3 only changes which string values appear in OI form dropdowns.
  It does not change `users.department` values or `department_page_permissions` rows.
- **Validation**: After Phase 3, confirm `GET /api/my-page-permissions` returns identical
  permission sets for the Prasad (Superuser) session before and after.

### 9.2 Page Visibility Middleware (`requirePageAccess`)

- **How it works**: Middleware reads `req.user.department` against `department_page_permissions`
  on every protected route.
- **Phase 3 risk**: Zero. Middleware is server-only; Phase 3 touches only frontend hooks/constants.
- **Validation**: Confirm `GET /api/my-page-permissions → 401` (unauthenticated) still fires; no
  500 errors in logs.

### 9.3 Routing Permissions

- **How it works**: `client/src/App.tsx` uses `useLocation` + `useUser`; routing is not
  department-gated at the client level.
- **Phase 3 risk**: Zero.
- **Validation**: Navigate to `/oi/sop`, `/oi/enforcement`, `/oi/lesson` as Superuser + as a
  non-Superuser with restricted permissions. Confirm all routes render or gate correctly.

### 9.4 EPC Assignment Engine

- **How it works**: `epc_assignment_rules.department` is free-text, populated by admin,
  matched server-side.
- **Phase 3 risk**: Zero. No Phase 3 file touches assignment rules.
- **Validation**: Confirm `GET /api/epc-assignment-rules` returns unchanged rows post-Phase 3.

### 9.5 OI Filters (Register Pages)

- **How it works**: `filterDept` state in `oi-sop-register.tsx` (line 47) is passed as a URL
  query param (`department`) to `GET /api/oi/sop`. The server matches it against stored
  `oi_sop_records.department` (free-text equality).
- **Phase 3 risk**: Low. The hook returns the same 10 department names as the current constant.
  The filter value sent to the API is identical — stored records will still match.
- **Validation**: Apply each department filter in `oi-sop-register` after migration. Confirm
  the returned record count matches the pre-migration count for each department.

### 9.6 OI Dashboard — SOP-by-Department Chart

- **How it works**: `GET /api/oi/dashboard/sop-by-department` queries `oi_sop_records.department`
  directly, returning a server-aggregated list. Not driven by any client constant.
- **Phase 3 risk**: Zero.
- **Validation**: Confirm the dashboard chart renders with the same department rows before
  and after Phase 3.

### 9.7 Analytics

- All OI analytics queries are server-side aggregations over stored `department` values.
- Phase 3 does not change any stored `department` value in any OI record.
- **Validation**: Spot-check 2–3 analytics widgets before and after Phase 3. Confirm row counts
  and department labels are unchanged.

---

## 10. Rollback Plan

### 10.1 Rollback Trigger Conditions

Phase 3 must be rolled back if any of the following occur during or after deployment:

1. `useDepartments()` returns an empty list in production for > 30 seconds after load.
2. Any OI form's department dropdown is non-interactive (empty + not disabled with a
   loading placeholder) when a user attempts to submit.
3. Any post-migration TypeScript compile error (`npm run typecheck` exits non-zero).
4. Any regression in `department_page_permissions` — a user gains or loses page access.
5. Console error count increases by > 0 errors related to `department`, `SelectItem`, or
   `[object Object]` in browser logs.

### 10.2 Rollback Procedure

Because Phase 3 touches only frontend files (no DB schema changes, no API changes, no
server-side route changes), rollback is a pure frontend code revert:

```
Step R1. Restore the three constant arrays (SOP_DEPARTMENTS, DEPARTMENTS, OI_DEPARTMENTS)
         in their respective constants files — exact text from Phase 2 closure state.

Step R2. Restore the 6 component import statements and SelectItem .map() calls to use
         the static constant instead of useDepartments().

Step R3. Run: npm run typecheck  → must exit 0 before deployment.

Step R4. Restart the application and verify all three register pages load with correct
         department dropdowns.

Step R5. Verify useDepartments() hook remains in place (do not delete it — it is used
         by the Admin attendance page and will be needed again for Phase 3 retry).
```

Rollback does NOT require any database changes, migration, or server restart beyond the
normal application restart.

### 10.3 Rollback Checkpoint

A Git checkpoint must be created immediately before Phase 3 implementation begins so that
`git revert` is available as an alternative to manual code restoration.

---

## 11. Zero-Trust Validation Checklist

This checklist must be completed in full before Phase 3 is declared closed. Each item must
produce a concrete pass/fail result, not an assumption.

### 11.1 Pre-Implementation (Before any Wave 1 change)

- [ ] **P1** — `npm run typecheck` exits 0 on current codebase (baseline)
- [ ] **P2** — `GET /api/departments` returns exactly 10 active rows in correct sort order
- [ ] **P3** — `users` Engineering-department count confirmed and prerequisite 2.1 decision
      documented and applied (or explicitly deferred with Engineering added to fallback list)
- [ ] **P4** — Git checkpoint created (commit hash recorded)
- [ ] **P5** — Browser console shows zero department-related errors on `/oi/sop` and
      `/oi/enforcement` register pages (baseline)
- [ ] **P6** — Record counts per department on SOP register captured as baseline
      (for post-migration comparison)

### 11.2 Post-Wave 1 (oi-sop-detail.tsx import removal)

- [ ] **W1-1** — `npm run typecheck` exits 0
- [ ] **W1-2** — SOP detail page renders correctly for any existing SOP record
- [ ] **W1-3** — Zero console errors on SOP detail page

### 11.3 Post-Wave 2 (enforcement + SOP registers)

- [ ] **W2-1** — `npm run typecheck` exits 0
- [ ] **W2-2** — `oi-enforcement-register.tsx` department dropdown shows exactly 10 items
- [ ] **W2-3** — `oi-sop-register.tsx` filter dropdown shows exactly 10 items
- [ ] **W2-4** — `oi-sop-register.tsx` create-form dropdown shows exactly 10 items
- [ ] **W2-5** — SOP filter by each department returns same record count as P6 baseline
- [ ] **W2-6** — Zero console errors on both pages
- [ ] **W2-7** — `useDepartments()` hook fires exactly ONE `GET /api/departments` HTTP request
      when both register pages are mounted (cache deduplication confirmed in Network tab)
- [ ] **W2-8** — `DEPARTMENTS` and `SOP_DEPARTMENTS` constants remain in their files until
      Wave 4 (TypeScript guard intact)

### 11.4 Post-Wave 3 (lesson + issue components — OI_DEPARTMENTS)

- [ ] **W3-1** — `npm run typecheck` exits 0
- [ ] **W3-2** — `oi-lesson-register.tsx` dropdown shows correct items (10 or 11 per §2.1 decision)
- [ ] **W3-3** — `oi-lesson-detail.tsx` edit-form dropdown shows correct items
- [ ] **W3-4** — `oi-issue-capture.tsx` department dropdown shows correct items
- [ ] **W3-5** — Zero console errors on all three pages
- [ ] **W3-6** — Existing lesson/issue records with stored `scope_department` values still
      display correctly in their detail views (stored values rendered as-is, not from hook)

### 11.5 Post-Wave 4 (constant removal)

- [ ] **W4-1** — `npm run typecheck` exits 0 — **this is the key regression guard**: any missed
      consumer will fail here
- [ ] **W4-2** — `grep -r "SOP_DEPARTMENTS\|OI_DEPARTMENTS" client/src/` returns zero matches
- [ ] **W4-3** — `grep -rn "DEPARTMENTS" client/src/pages/oi/` returns zero matches pointing
      to the old constant (confirm only legitimate references, e.g., `ENFORCEMENT_DEPARTMENTS`
      if any)
- [ ] **W4-4** — All five migrated dropdowns still functional after constant removal

### 11.6 Final Regression Validation (Full Suite)

- [ ] **F1** — `GET /api/my-page-permissions` response identical to pre-Phase-3 baseline
      (diff of JSON output — zero changes)
- [ ] **F2** — Page visibility: navigate to `/oi/sop`, `/oi/enforcement`, `/oi/lesson` as
      Superuser — all render correctly
- [ ] **F3** — Page visibility: navigate as a non-Superuser restricted from OI — confirm
      correct gating (same as pre-Phase-3)
- [ ] **F4** — EPC assignment rules: `GET /api/epc-assignment-rules` row count unchanged
- [ ] **F5** — OI dashboard SOP-by-department chart renders with same department rows
- [ ] **F6** — `GET /api/admin/departments` (Superuser) returns 12 rows unchanged
- [ ] **F7** — `GET /api/departments` (public) returns 10 rows unchanged
- [ ] **F8** — Server startup log shows all three DeptSeed lines on next restart
- [ ] **F9** — Zero new errors in browser console log vs pre-Phase-3 baseline
- [ ] **F10** — `npm run typecheck` exits 0 (final)

---

## 12. Out of Scope for Phase 3

The following are explicitly deferred to a later phase and must not be implemented during Phase 3:

- **Admin Department CRUD UI** — creating, editing, or deactivating departments via a UI page
- **`department_page_permissions` rewiring** — permissions remain on free-text `department`
  string; no FK to `department_master` is added
- **FK constraint on `oi_sop_records.department`** — stored department values remain free-text;
  no referential integrity constraint is added
- **User department reassignment UI** — migrating existing users from free-text department to a
  `department_master` FK
- **`useDepartments()` cache invalidation on admin mutation** — no admin mutation route exists
  in Phase 3
- **`includeInactive` flag on `useDepartments()`** — only needed if prerequisite 2.1 cannot be
  resolved; evaluate at Phase 3 kickoff
- **Any changes to `server/` files** — Phase 3 is frontend-only

---

## 13. Summary Table

| Item | Detail |
|---|---|
| Total frontend files modified | 9 (3 constant files + 6 component files) |
| Total call-sites migrated | 6 (5 dropdowns + 1 import-only cleanup) |
| DB changes | None |
| Server changes | None |
| New files created | None (hook already exists from Phase 2 Step 6) |
| Hook upgrade required | Yes — expose `isLoading` / `isError` before Wave 2 |
| Prerequisite blocker | Engineering user remapping decision (§2.1) |
| Rollback complexity | Low — frontend revert only, no DB or server rollback needed |
| Zero-trust checklist items | 30 (6 pre-implementation, 24 post-wave/final) |
