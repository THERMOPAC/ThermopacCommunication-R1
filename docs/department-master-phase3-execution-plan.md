# Department Master — Phase 3 Execution Plan
**Version**: 1.1  
**Date**: 2026-05-23  
**Status**: APPROVED — Execution in progress  
**Prerequisite gate**: Engineering remapping complete ✅ (v1.1 planning doc)  
**Parent document**: `docs/department-master-phase3-planning.md`

---

## Amendment A — API Error Behaviour on Forms (Approved 2026-05-23)

Approved correction to the fallback behaviour specified in §Loading/Error UI Behaviour sections
of Wave 2 and Wave 3:

| Context | API error behaviour |
|---|---|
| **Filter dropdowns** | Show `DEPT_CLIENT_FALLBACK` (10 names) with a visible amber warning — filtering is read-only, no data loss risk |
| **Create / Edit form fields** | **Disabled** — department Select disabled, submit button disabled, blocking error message shown. No fallback names displayed. No submission permitted while `/api/departments` is in error state. |

This replaces the original plan's "fallback + amber warning badge" pattern for form fields.
The hook's `DEPT_CLIENT_FALLBACK` return on `isError` is still correct for filter consumers;
form consumers must also check `isError` and block submission independently.

---

## Overview

Phase 3 replaces all three hardcoded department arrays in the OI/SOP/Enforcement/Lesson/Issue
frontend with the `useDepartments()` hook, making `department_master` the single source of truth
for every client-side department dropdown.

**Total scope:**
- 1 hook file modified (Pre-Wave)
- 9 frontend files changed across 4 waves
- 0 server files changed
- 0 DB schema changes
- 0 new routes

---

## Execution Sequence

```
Pre-Wave  — useDepartments() hook upgrade + fallback constant
Wave 1    — oi-sop-detail.tsx import cleanup (zero-risk)
Wave 2    — oi-enforcement-register + oi-sop-register (2 files, 3 dropdowns)
Wave 3    — oi-lesson-register + oi-lesson-detail + oi-issue-capture (3 files, 3 dropdowns)
Wave 4    — constant deletion from all 3 constants files (TypeScript guard fires here)
```

Each wave is a discrete deploy. Wave N must pass its full validation checklist before Wave N+1
begins. No wave may be partially applied.

---

## Pre-Wave — Hook Upgrade

### Objective
Extend `useDepartments()` to expose `isLoading` and `isError` state, and co-locate the
client-side fallback constant. This is a prerequisite for all subsequent waves.

### File Changed

**`client/src/hooks/use-departments.ts`** — full rewrite

#### Current state (6 lines)
```typescript
export function useDepartments(): string[] {
  const { data } = useQuery<...>({ queryKey: ["/api/departments"], ... });
  return (data ?? []).map(d => d.name);
}
```

#### Target state
```typescript
import { useQuery } from "@tanstack/react-query";

const DEPT_CLIENT_FALLBACK: string[] = [
  "Accounts", "Administration", "After Sales", "Design", "Marketing",
  "Production", "Projects", "Purchase", "Quality Control", "Stores",
];

export interface UseDepartmentsResult {
  departments: string[];
  isLoading: boolean;
  isError: boolean;
}

export function useDepartments(): UseDepartmentsResult {
  const { data, isLoading, isError } = useQuery<
    { id: number; name: string; code: string | null; sortOrder: number }[]
  >({
    queryKey: ["/api/departments"],
    staleTime: 5 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
  });

  return {
    departments: isError ? DEPT_CLIENT_FALLBACK : (data ?? []).map(d => d.name),
    isLoading,
    isError,
  };
}
```

**Key behaviours:**
- `isLoading = true` → `departments = []`, consumers disable their dropdown
- `isError = true`   → `departments = DEPT_CLIENT_FALLBACK` (10 items), consumers show warning
- Success           → `departments = string[]` from API (10 active items, sorted)
- `DEPT_CLIENT_FALLBACK` exactly mirrors the 10 active `department_master` rows

### No consumers exist yet
The hook is not imported by any component (confirmed by Phase 2 Step 6 grep). The return-type
change from `string[]` to `UseDepartmentsResult` is therefore non-breaking at this stage.
TypeScript compile must be clean before Wave 1.

### Pre-Wave Validation Checklist
- [ ] **PW-1** — `npm run typecheck` exits 0 after hook rewrite
- [ ] **PW-2** — Hook file contains `DEPT_CLIENT_FALLBACK` with exactly 10 items matching
      active `department_master` rows in sort-order sequence
- [ ] **PW-3** — `isError` path returns `DEPT_CLIENT_FALLBACK`, not `[]`
- [ ] **PW-4** — `isLoading` path returns `departments: []` (empty — consumers must disable)
- [ ] **PW-5** — No existing component imports `use-departments` (grep confirms zero consumers)

### Pre-Wave Rollback
Restore the 13-line original file from the Phase 2 Step 6 state. No other files affected.

---

## Wave 1 — `oi-sop-detail.tsx` Import Cleanup

### Objective
Remove the unused `SOP_DEPARTMENTS` import. No dropdown logic changes.

### File Changed

**`client/src/pages/oi/oi-sop-detail.tsx`**

#### Change
Remove `SOP_DEPARTMENTS` from the import at line 30:

```typescript
// BEFORE (line 30):
import { LINKED_TYPE_LABELS, SOP_DEPARTMENTS, SOP_TRANSITION_LABELS } from "./oi-sop-constants";

// AFTER:
import { LINKED_TYPE_LABELS, SOP_TRANSITION_LABELS } from "./oi-sop-constants";
```

**Note:** `SOP_DEPARTMENTS` is imported but confirmed unused in this file — no dropdown,
no map call, no reference beyond the import line. The stored `sop.department` value at
line 145 is displayed directly from the record object and is not driven by the constant.

### Loading/Error UI Behaviour
Not applicable — Wave 1 introduces no hook call and no dynamic data.

### Wave 1 Validation Checklist
- [ ] **W1-1** — `npm run typecheck` exits 0
- [ ] **W1-2** — `grep "SOP_DEPARTMENTS" client/src/pages/oi/oi-sop-detail.tsx` returns zero matches
- [ ] **W1-3** — SOP detail page renders for any existing SOP record — `sop.department`
      field value displays correctly
- [ ] **W1-4** — Zero console errors on SOP detail page

### Wave 1 Rollback
Restore the single import line. No hook, no component logic, no other file affected.
Rollback is a one-line edit.

---

## Wave 2 — Enforcement Register + SOP Register

### Objective
Replace `DEPARTMENTS` in `oi-enforcement-register.tsx` and `SOP_DEPARTMENTS` in
`oi-sop-register.tsx` with `useDepartments()`. Three dropdown call-sites migrated.

### Files Changed

#### 2A — `client/src/pages/oi/oi-enforcement-register.tsx`

**Step 1: Replace import**
```typescript
// BEFORE (line 16):
import { ERP_ENTITY_TYPE_LABELS, DEPARTMENTS } from "./oi-enforcement-constants";

// AFTER:
import { ERP_ENTITY_TYPE_LABELS } from "./oi-enforcement-constants";
import { useDepartments } from "@/hooks/use-departments";
```

**Step 2: Call hook inside component**
```typescript
// ADD near top of component function body:
const { departments, isLoading: deptsLoading, isError: deptsError } = useDepartments();
```

**Step 3: Replace SelectContent at line 160**
```typescript
// BEFORE:
{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}

// AFTER:
{deptsLoading && (
  <SelectItem value="__loading__" disabled>Loading departments…</SelectItem>
)}
{!deptsLoading && departments.map(d => (
  <SelectItem key={d} value={d}>{d}</SelectItem>
))}
```

**Step 4: Disable the Select trigger while loading**
On the `<Select>` wrapping the department field, add:
```typescript
// ADD to the Select props:
disabled={deptsLoading}
```

#### 2B — `client/src/pages/oi/oi-sop-register.tsx`

**Step 1: Replace import**
```typescript
// BEFORE (line 25):
import { SOP_DEPARTMENTS, SOP_TYPES, SOP_STATUSES } from "./oi-sop-constants";

// AFTER:
import { SOP_TYPES, SOP_STATUSES } from "./oi-sop-constants";
import { useDepartments } from "@/hooks/use-departments";
```

**Step 2: Call hook inside component**
```typescript
const { departments, isLoading: deptsLoading, isError: deptsError } = useDepartments();
```

**Step 3: Replace filter dropdown (line 182)**

The filter dropdown has a static "All Departments" option followed by the department list:
```typescript
// BEFORE:
<Select value={filterDept} onValueChange={setFilterDept}>
  <SelectTrigger>…</SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Departments</SelectItem>
    {SOP_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
  </SelectContent>
</Select>

// AFTER:
<Select value={filterDept} onValueChange={setFilterDept}>
  <SelectTrigger>…</SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Departments</SelectItem>
    {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
  </SelectContent>
</Select>
```

**Note:** The filter dropdown is NOT disabled during loading — if departments haven't loaded
yet, showing only "All Departments" is acceptable and harmless (user can still view all SOPs).
The `deptsLoading` disable rule applies only to data-entry form fields.

**Step 4: Replace create-form dropdown (line 129)**
```typescript
// BEFORE:
<SelectContent>
  {SOP_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
</SelectContent>

// AFTER:
<SelectContent>
  {deptsLoading && (
    <SelectItem value="__loading__" disabled>Loading departments…</SelectItem>
  )}
  {!deptsLoading && departments.map(d => (
    <SelectItem key={d} value={d}>{d}</SelectItem>
  ))}
</SelectContent>
```

**Step 5: Disable the create-form department Select while loading**
```typescript
disabled={deptsLoading}
```

### Loading/Error UI Behaviour — Wave 2

| State | Filter dropdown (register) | Create-form department field |
|---|---|---|
| `isLoading` | Shows "All Departments" only (no disable) | Disabled, shows "Loading departments…" placeholder |
| `isError` | Shows 10 fallback names (from `DEPT_CLIENT_FALLBACK`) | Shows 10 fallback names; subtle warning: see below |
| Loaded | Shows 10 API names | Shows 10 API names |

**Error warning badge (create form only):**
When `deptsError = true`, render a small inline notice below the department Select:
```typescript
{deptsError && (
  <p className="text-xs text-amber-600 mt-1">
    Using cached department list — live data unavailable
  </p>
)}
```

This badge appears only on the create form, not on the filter dropdown.

### Wave 2 Validation Checklist
- [ ] **W2-1** — `npm run typecheck` exits 0
- [ ] **W2-2** — `oi-enforcement-register` department dropdown renders 10 items when loaded
- [ ] **W2-3** — `oi-enforcement-register` Select is disabled while `isLoading`
- [ ] **W2-4** — `oi-sop-register` filter dropdown renders "All Departments" + 10 department
      items when loaded; filter by each department returns correct record count
- [ ] **W2-5** — `oi-sop-register` create-form department Select is disabled while `isLoading`
- [ ] **W2-6** — Network tab confirms exactly ONE `GET /api/departments` request when both
      pages are open simultaneously (TanStack Query cache deduplication)
- [ ] **W2-7** — `DEPARTMENTS` and `SOP_DEPARTMENTS` constants remain in their files
      (not yet deleted — TypeScript guard still active for Wave 3 consumers)
- [ ] **W2-8** — Zero console errors on both register pages
- [ ] **W2-9** — `GET /api/my-page-permissions` response unchanged (permission regression check)

### Wave 2 Rollback
1. Restore import lines in both files (re-add `SOP_DEPARTMENTS` / `DEPARTMENTS`)
2. Remove `useDepartments` import from both files
3. Remove `useDepartments()` call from component function bodies
4. Restore original `{DEPARTMENTS.map(…)}` and `{SOP_DEPARTMENTS.map(…)}` SelectContent
5. Remove `disabled={deptsLoading}` props
6. Remove error warning badge
7. `npm run typecheck` → must exit 0

---

## Wave 3 — Lesson Register, Lesson Detail, Issue Capture

### Objective
Replace `OI_DEPARTMENTS` (11 items including the now-dead "Engineering" entry) with
`useDepartments()` (10 items) in the three remaining components. All three import from
`oi-lesson-constants.ts`.

### Files Changed

#### 3A — `client/src/pages/oi/oi-lesson-register.tsx`

**Step 1: Replace import (line 34)**
```typescript
// BEFORE:
import { OI_DEPARTMENTS } from "./oi-lesson-constants";

// AFTER — OI_DEPARTMENTS removed from import; hook added:
import { useDepartments } from "@/hooks/use-departments";
```

**Step 2: Call hook**
```typescript
const { departments, isLoading: deptsLoading, isError: deptsError } = useDepartments();
```

**Step 3: Replace dropdown (line 255)**
```typescript
// BEFORE:
{OI_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}

// AFTER:
{deptsLoading && (
  <SelectItem value="__loading__" disabled>Loading departments…</SelectItem>
)}
{!deptsLoading && departments.map(d => (
  <SelectItem key={d} value={d}>{d}</SelectItem>
))}
```

**Step 4: Disable Select + error badge** (same pattern as Wave 2 form fields)

#### 3B — `client/src/pages/oi/oi-lesson-detail.tsx`

**Step 1: Replace import (line 36)**
```typescript
// BEFORE:
import { OI_DEPARTMENTS } from "./oi-lesson-constants";

// AFTER:
import { useDepartments } from "@/hooks/use-departments";
```

**Step 2: Call hook**
```typescript
const { departments, isLoading: deptsLoading, isError: deptsError } = useDepartments();
```

**Step 3: Replace dropdown (line 487)**
```typescript
// BEFORE:
{OI_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}

// AFTER:
{deptsLoading && (
  <SelectItem value="__loading__" disabled>Loading departments…</SelectItem>
)}
{!deptsLoading && departments.map(d => (
  <SelectItem key={d} value={d}>{d}</SelectItem>
))}
```

**Step 4: Disable Select + error badge** (same pattern)

**Additional note — existing records with stored `scope_department`:**
Lesson detail pages display the stored `lesson.scopeDepartment` value from the DB as plain
text alongside the edit dropdown. This display is not driven by the hook or the constant —
it reads from the API record object directly. No change to display logic is needed or permitted.

#### 3C — `client/src/pages/oi/oi-issue-capture.tsx`

**Step 1: Replace import (line 16)**
```typescript
// BEFORE:
import { OI_DEPARTMENTS } from "./oi-lesson-constants";

// AFTER:
import { useDepartments } from "@/hooks/use-departments";
```

**Step 2: Call hook**
```typescript
const { departments, isLoading: deptsLoading, isError: deptsError } = useDepartments();
```

**Step 3: Replace dropdown (lines 403–406)**
```typescript
// BEFORE:
{OI_DEPARTMENTS.map(d => (
  <SelectItem key={d} value={d}>{d}</SelectItem>
))}

// AFTER:
{deptsLoading && (
  <SelectItem value="__loading__" disabled>Loading departments…</SelectItem>
)}
{!deptsLoading && departments.map(d => (
  <SelectItem key={d} value={d}>{d}</SelectItem>
))}
```

**Step 4: Disable Select + error badge** (same pattern)

### Loading/Error UI Behaviour — Wave 3

Same rules as Wave 2 form fields for all three components (all are data-entry forms):

| State | Dropdown |
|---|---|
| `isLoading` | Disabled; single item: "Loading departments…" (disabled, non-selectable) |
| `isError` | Enabled; 10 fallback names; amber warning badge below Select |
| Loaded | Enabled; 10 API names |

### "Engineering" in Wave 3
`OI_DEPARTMENTS` previously listed "Engineering" as item 5 (11 total). With `useDepartments()`
returning only the 10 active DB rows, "Engineering" disappears naturally from all three
dropdowns. Because no existing lesson, issue, or capture record has `department = 'Engineering'`
(confirmed by Phase 3 planning DB scan), no stored record is orphaned or un-displayable.
Any detail view that renders a stored department value reads from the record object directly,
not from the hook.

### Wave 3 Validation Checklist
- [ ] **W3-1** — `npm run typecheck` exits 0
- [ ] **W3-2** — `oi-lesson-register` dropdown shows exactly 10 items; "Engineering" absent
- [ ] **W3-3** — `oi-lesson-detail` edit-form dropdown shows exactly 10 items; "Engineering" absent
- [ ] **W3-4** — `oi-issue-capture` dropdown shows exactly 10 items; "Engineering" absent
- [ ] **W3-5** — Open an existing lesson detail record; `scope_department` display field renders
      stored value correctly (not affected by hook)
- [ ] **W3-6** — `OI_DEPARTMENTS` constant remains in `oi-lesson-constants.ts`
      (not yet deleted — TypeScript guard still active)
- [ ] **W3-7** — Zero console errors on all three pages
- [ ] **W3-8** — `GET /api/my-page-permissions` response unchanged

### Wave 3 Rollback
1. Restore `OI_DEPARTMENTS` import in all three files (from `./oi-lesson-constants`)
2. Remove `useDepartments` import from all three files
3. Remove `useDepartments()` call from each component body
4. Restore `{OI_DEPARTMENTS.map(…)}` at each call-site
5. Remove `disabled={deptsLoading}` props
6. Remove error warning badges
7. `npm run typecheck` → must exit 0

---

## Wave 4 — Constant Deletion

### Objective
Delete the three now-unused constant arrays from their respective files. TypeScript will error
at compile time on any missed consumer, making this wave the primary regression guard.

### Files Changed

#### 4A — `client/src/pages/oi/oi-sop-constants.ts`

Remove lines 69–80 entirely:
```typescript
// DELETE these lines:
export const SOP_DEPARTMENTS = [
  "Accounts",
  "Administration",
  "After Sales",
  "Design",
  "Marketing",
  "Production",
  "Projects",
  "Purchase",
  "Quality Control",
  "Stores",
] as const;
```

All other exports in this file (`SOP_STATUS_LABELS`, `SOP_TYPE_LABELS`, `SOP_STATUSES`,
`SOP_TYPES`, `SOP_STATUS_PIPELINE`, `SOP_TRANSITION_LABELS`, color maps, etc.) are untouched.

#### 4B — `client/src/pages/oi/oi-enforcement-constants.ts`

Remove lines 84–87:
```typescript
// DELETE these lines:
export const DEPARTMENTS = [
  "Accounts","Administration","After Sales","Design","Marketing",
  "Production","Projects","Purchase","Quality Control","Stores",
];
```

All other exports in this file are untouched.

#### 4C — `client/src/pages/oi/oi-lesson-constants.ts`

Remove lines 141–145:
```typescript
// DELETE these lines:
export const OI_DEPARTMENTS = [
  "Accounts","Administration","After Sales","Design",
  "Engineering","Marketing","Production","Projects",
  "Purchase","Quality Control","Stores",
];
```

All other exports in this file are untouched.

### TypeScript Guard Behaviour
`npm run typecheck` after Wave 4 will fail with `Module '"./oi-sop-constants"' has no exported
member 'SOP_DEPARTMENTS'` (and equivalent errors) if any consumer was missed. This is intentional
and non-negotiable. Wave 4 must not be declared complete until `typecheck` exits 0 cleanly.

### Wave 4 Validation Checklist
- [ ] **W4-1** — **`npm run typecheck` exits 0** — primary regression guard
- [ ] **W4-2** — `grep -r "SOP_DEPARTMENTS" client/src/` → zero matches
- [ ] **W4-3** — `grep -rn "export const DEPARTMENTS" client/src/pages/oi/` → zero matches
- [ ] **W4-4** — `grep -r "OI_DEPARTMENTS" client/src/` → zero matches
- [ ] **W4-5** — All five migrated dropdowns still functional after constant removal:
      enforcement-register, sop-register (×2), lesson-register, lesson-detail, issue-capture
- [ ] **W4-6** — Zero console errors on all five pages
- [ ] **W4-7** — `GET /api/departments` still returns 10 rows (server unaffected)

### Wave 4 Rollback
Restore the three deleted constant blocks verbatim:
- `SOP_DEPARTMENTS` → lines 69–80 of `oi-sop-constants.ts`
- `DEPARTMENTS`     → lines 84–87 of `oi-enforcement-constants.ts`
- `OI_DEPARTMENTS`  → lines 141–145 of `oi-lesson-constants.ts`

`npm run typecheck` must exit 0 after restoration. No component file rollback is needed
(consumers were already reverted in Wave 2/3 rollback if a combined rollback is triggered).

---

## Permission Regression Checks

These checks run once — after Wave 4 passes — as the final regression suite. They are
independent of wave-level validation and must all pass before Phase 3 is declared closed.

| Check | Method | Expected result |
|---|---|---|
| **PR-1** `department_page_permissions` | `GET /api/my-page-permissions` (Superuser session) | Response JSON identical to pre-Phase-3 baseline captured at W2-9 |
| **PR-2** Page visibility — OI pages | Navigate to `/oi/sop`, `/oi/enforcement`, `/oi/lesson` as Superuser | All three render without error |
| **PR-3** Page visibility — restricted user | Navigate to OI pages as a non-Superuser with restricted OI permissions | Correct gating, same as pre-Phase-3 |
| **PR-4** EPC assignment rules | `GET /api/epc-assignment-rules` (Superuser) | Row count and department values unchanged |
| **PR-5** OI dashboard | Load `/oi` dashboard — SOP-by-department chart | Chart renders; department row labels unchanged |
| **PR-6** Admin departments route | `GET /api/admin/departments` (Superuser) | Still returns 12 rows (`department_master`) |
| **PR-7** Public departments route | `GET /api/departments` (unauthenticated) | Still returns exactly 10 active rows |
| **PR-8** Server startup DeptSeed | Restart application; check startup log | Three DeptSeed lines present; no errors |

---

## Final Closure Criteria

Phase 3 is closed when ALL of the following are satisfied:

1. **Pre-Wave PW-1 through PW-5**: Hook upgrade validated ✅
2. **Wave 1 W1-1 through W1-4**: SOP detail import cleanup validated ✅
3. **Wave 2 W2-1 through W2-9**: Enforcement + SOP registers migrated and validated ✅
4. **Wave 3 W3-1 through W3-8**: Lesson + Issue components migrated and validated ✅
5. **Wave 4 W4-1 through W4-7**: All constants deleted; TypeScript exits 0 ✅
6. **Permission regression PR-1 through PR-8**: All eight checks passed ✅
7. **Zero browser console errors** related to `department`, `[object Object]`, or hook failures ✅
8. **`npm run typecheck` exits 0** on final codebase state ✅
9. **`OI_DEPARTMENTS` contains "Engineering" in zero frontend files** (grep clean) ✅
10. **`GET /api/departments` 200** in final startup log after Phase 3 restart ✅

---

## Summary of All Changes

| Wave | File | Change type |
|---|---|---|
| Pre-Wave | `client/src/hooks/use-departments.ts` | Rewrite — add `DEPT_CLIENT_FALLBACK`, `UseDepartmentsResult`, expose `isLoading`/`isError` |
| Wave 1 | `client/src/pages/oi/oi-sop-detail.tsx` | Remove unused `SOP_DEPARTMENTS` import |
| Wave 2 | `client/src/pages/oi/oi-enforcement-register.tsx` | Replace `DEPARTMENTS` with `useDepartments()` |
| Wave 2 | `client/src/pages/oi/oi-sop-register.tsx` | Replace `SOP_DEPARTMENTS` with `useDepartments()` (filter + form) |
| Wave 3 | `client/src/pages/oi/oi-lesson-register.tsx` | Replace `OI_DEPARTMENTS` with `useDepartments()` |
| Wave 3 | `client/src/pages/oi/oi-lesson-detail.tsx` | Replace `OI_DEPARTMENTS` with `useDepartments()` |
| Wave 3 | `client/src/pages/oi/oi-issue-capture.tsx` | Replace `OI_DEPARTMENTS` with `useDepartments()` |
| Wave 4 | `client/src/pages/oi/oi-sop-constants.ts` | Delete `SOP_DEPARTMENTS` constant |
| Wave 4 | `client/src/pages/oi/oi-enforcement-constants.ts` | Delete `DEPARTMENTS` constant |
| Wave 4 | `client/src/pages/oi/oi-lesson-constants.ts` | Delete `OI_DEPARTMENTS` constant |

**Total files: 10** | **Server files: 0** | **DB changes: 0** | **New files: 0**
