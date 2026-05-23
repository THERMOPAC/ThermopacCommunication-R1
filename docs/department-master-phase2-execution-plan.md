# Department Master — Phase 2 Execution Plan
**Status:** PENDING APPROVAL  
**Version:** 1.0  
**Date:** 2026-05-23  
**Author:** System Architect  
**Prerequisite:** Phase 1 Audit (`docs/department-master-phase1-audit.md`) approved.

---

## 0. Scope & Boundaries

| In Scope | Out of Scope |
|---|---|
| `department_master` table creation + seed | Admin UI for managing departments |
| `GET /api/departments` public API | FK constraints on legacy/external tables |
| `GET /api/admin/departments` rerouted to master | Renaming existing department strings in live rows |
| `VALID_DEPARTMENTS` server lists replaced by DB query | Payroll, SAP sync, POSH — untouched |
| Frontend `useDepartments()` hook | Phase 3–6 frontend wiring (separate plan) |
| `shared/schema.ts` `departments` array kept as fallback | Deleting legacy constants (Phase 3) |

---

## 1. Exact Schema Design

### 1.1 Table Definition

```sql
CREATE TABLE department_master (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  code       VARCHAR(10),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dept_name   UNIQUE (name),
  CONSTRAINT uq_dept_code   UNIQUE (code),
  CONSTRAINT chk_dept_name  CHECK (TRIM(name) <> '')
);

CREATE INDEX idx_dept_master_active ON department_master (is_active, sort_order);
```

### 1.2 Drizzle ORM Schema (`shared/schema.ts`)

```typescript
export const departmentMaster = pgTable('department_master', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  code:      varchar('code', { length: 10 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uqName:       uniqueIndex('uq_dept_master_name').on(table.name),
  uqCode:       uniqueIndex('uq_dept_master_code').on(table.code),
  activeOrdIdx: index('idx_dept_master_active').on(table.isActive, table.sortOrder),
}));

export const insertDepartmentMasterSchema = createInsertSchema(departmentMaster)
  .omit({ id: true, createdAt: true });

export type DepartmentMaster       = typeof departmentMaster.$inferSelect;
export type InsertDepartmentMaster = z.infer<typeof insertDepartmentMasterSchema>;
```

### 1.3 Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| `name` uniqueness | Case-sensitive UNIQUE constraint | Prevents "quality control" vs "Quality Control" duplicates |
| No FK on existing tables (Phase 2) | Deliberate | Too many tables; historical data must not break |
| `is_active` instead of DELETE | Soft deactivation | Preserves historical row context in audit logs, appraisals, etc. |
| `code` optional | Nullable, unique | Allows short-form usage in reports without forcing immediate adoption |
| `sort_order` integer | Manual ordering | Alphabetical is not always business-preferred |
| `withTimezone: true` on `createdAt` | IST-safe | Consistent with project-wide timestamp standard |

---

## 2. Seed Strategy

### 2.1 Canonical 10 Departments (user-approved list)

| sort_order | name | code |
|---|---|---|
| 10 | Accounts | ACC |
| 20 | Administration | ADM |
| 30 | After Sales | AFS |
| 40 | Design | DES |
| 50 | Marketing | MKT |
| 60 | Production | PRD |
| 70 | Projects | PRJ |
| 80 | Purchase | PUR |
| 90 | Quality Control | QC |
| 100 | Stores | STR |

### 2.2 Legacy Value Rows (inactive — see Section 6)

| sort_order | name | code | is_active | Reason |
|---|---|---|---|---|
| 110 | Engineering | ENG | **false** | Legacy — 1 user still has this; preserve for historical reads, not shown in dropdowns |
| 120 | General Management | GM | **false** | Legacy — exists in `appraisal_kpi_templates`; preserve for historical reads |

**Total seed rows: 12** (10 active + 2 inactive)

### 2.3 Seed Implementation

Seed runs as an idempotent `INSERT ... ON CONFLICT DO NOTHING` so it is safe to re-run on every deploy.

```typescript
// server/department-seed.ts
const SEED_DEPARTMENTS = [
  { name: "Accounts",          code: "ACC", sortOrder: 10,  isActive: true  },
  { name: "Administration",    code: "ADM", sortOrder: 20,  isActive: true  },
  { name: "After Sales",       code: "AFS", sortOrder: 30,  isActive: true  },
  { name: "Design",            code: "DES", sortOrder: 40,  isActive: true  },
  { name: "Marketing",         code: "MKT", sortOrder: 50,  isActive: true  },
  { name: "Production",        code: "PRD", sortOrder: 60,  isActive: true  },
  { name: "Projects",          code: "PRJ", sortOrder: 70,  isActive: true  },
  { name: "Purchase",          code: "PUR", sortOrder: 80,  isActive: true  },
  { name: "Quality Control",   code: "QC",  sortOrder: 90,  isActive: true  },
  { name: "Stores",            code: "STR", sortOrder: 100, isActive: true  },
  // Legacy inactive — preserved for historical record integrity
  { name: "Engineering",       code: "ENG", sortOrder: 110, isActive: false },
  { name: "General Management",code: "GM",  sortOrder: 120, isActive: false },
];

export async function seedDepartmentMaster() {
  for (const dept of SEED_DEPARTMENTS) {
    await db.insert(departmentMaster)
      .values(dept)
      .onConflictDoNothing();   // idempotent — safe on re-deploy
  }
  console.log("[DeptSeed] department_master seeded — 10 active, 2 inactive preserved.");
}
```

Seed is called from `server/index.ts` startup sequence (after DB init, same pattern as existing seeds).

---

## 3. API Contract

### 3.1 `GET /api/departments`

Returns **active** departments only. Used by all dropdowns.

```
GET /api/departments
Auth: ensureAuthenticated (session cookie)
Cache-Control: max-age=300 (5 min — departments change rarely)

Response 200:
[
  { "id": 1, "name": "Accounts",       "code": "ACC", "sortOrder": 10  },
  { "id": 2, "name": "Administration", "code": "ADM", "sortOrder": 20  },
  ...
]

Response 401: { "error": "Unauthorized" }
Response 500: { "error": "Failed to fetch departments" }
```

**Sorting:** `ORDER BY sort_order ASC` — server-side, not client-side.  
**Filter:** `WHERE is_active = true`.

### 3.2 `GET /api/admin/departments`

Returns all departments including inactive. Used by admin views only.

```
GET /api/admin/departments
Auth: ensureAuthenticated + role in [Superuser]

Response 200:
[
  { "id": 1,  "name": "Accounts",          "code": "ACC", "sortOrder": 10,  "isActive": true  },
  ...
  { "id": 11, "name": "Engineering",       "code": "ENG", "sortOrder": 110, "isActive": false },
  { "id": 12, "name": "General Management","code": "GM",  "sortOrder": 120, "isActive": false },
]

Response 403: { "error": "Forbidden" }
```

**Note:** The existing `GET /api/admin/departments` route in `admin-routes.ts` (line 1999) derives from `users.department`. In Phase 2 this route is **replaced** to read from `department_master` instead. The response shape changes from `string[]` to `object[]`. Callers must be checked (audit showed only internal admin use — no known external consumers).

### 3.3 No Write Endpoints in Phase 2

`POST`, `PATCH`, `DELETE` on `/api/admin/departments` are deferred to Phase 6 (admin UI). All mutations in Phase 2 are direct DB seed only.

---

## 4. Migration Order

Steps must be executed in exact order. Each step is independently deployable and rollback-safe.

### Step 1 — Schema migration (no data change)
1. Add `departmentMaster` table definition to `shared/schema.ts`
2. Run `psql` migration:
   ```sql
   CREATE TABLE department_master ( ... );   -- as above
   CREATE UNIQUE INDEX uq_dept_master_name ON department_master (name);
   CREATE UNIQUE INDEX uq_dept_master_code ON department_master (code);
   CREATE INDEX idx_dept_master_active ON department_master (is_active, sort_order);
   ```
3. Verify table exists: `\d department_master`
4. **No application code change yet** — table is empty, nothing reads it.

### Step 2 — Seed (data only, no routing change)
1. Create `server/department-seed.ts`
2. Call `seedDepartmentMaster()` from `server/index.ts` startup
3. Restart app; confirm log: `[DeptSeed] department_master seeded`
4. Verify: `SELECT * FROM department_master ORDER BY sort_order;` — expect 12 rows
5. **Still no API route change** — old hardcoded lists still serve all traffic.

### Step 3 — New API route (`GET /api/departments`)
1. Create `server/department-routes.ts` with the `GET /api/departments` handler
2. Mount router in `server/index.ts`: `app.use('/api', departmentRouter)`
3. Verify endpoint: `curl -b session /api/departments` → 10 active records
4. **Old routes still intact** — new route is additive, nothing migrates yet.

### Step 4 — Replace `GET /api/admin/departments`
1. In `server/admin-routes.ts` replace the `users.department` DISTINCT query with `department_master` read
2. Update response from `string[]` to `DepartmentMaster[]`
3. Verify no caller breaks (internal admin use only)

### Step 5 — Replace `VALID_DEPARTMENTS` in route files
1. `server/oi-sop-routes.ts` — replace hardcoded array with module-level cached DB load
2. `server/oi-enforcement-routes.ts` — same
3. Pattern:
   ```typescript
   // Loaded once at module init; refreshed on deploy
   let _validDepts: Set<string> = new Set();
   export async function loadValidDepartments() {
     const rows = await db.select({ name: departmentMaster.name })
       .from(departmentMaster).where(eq(departmentMaster.isActive, true));
     _validDepts = new Set(rows.map(r => r.name));
   }
   // In route handler:
   if (!_validDepts.has(department)) return res.status(422).json({ error: "invalid_department" });
   ```
4. `loadValidDepartments()` called from `server/index.ts` after seed.

### Step 6 — Frontend `useDepartments()` hook (no UI wiring yet)
1. Create `client/src/hooks/use-departments.ts`
2. Hook implementation:
   ```typescript
   export function useDepartments(): string[] {
     const { data } = useQuery<DepartmentMaster[]>({
       queryKey: ["/api/departments"],
       staleTime: 5 * 60 * 1000,  // 5 min
     });
     return (data ?? []).map(d => d.name);
   }
   ```
3. **Hook exists but is not yet wired to any component** — zero UI change in Phase 2.

---

## 5. Rollback Strategy

### Per-Step Rollback

| Step | Rollback Action | Risk if rolled back |
|---|---|---|
| Step 1 (table) | `DROP TABLE department_master;` | None — table was empty, nothing read it |
| Step 2 (seed) | `TRUNCATE department_master;` or drop table | None — no routes reading it yet |
| Step 3 (new route) | Remove route registration in `index.ts`; delete `department-routes.ts` | None — additive route, old routes intact |
| Step 4 (admin route) | Revert `admin-routes.ts` to `users.department` DISTINCT | Low — admin view shows old list again |
| Step 5 (VALID_DEPARTMENTS) | Revert `oi-sop-routes.ts` and `oi-enforcement-routes.ts` to hardcoded arrays | Low — hardcoded arrays are still correct for current 10 depts |
| Step 6 (hook) | Delete `use-departments.ts` | None — hook not wired to anything yet |

**Full rollback** (any point): revert to git checkpoint `dae68cef` — no data was mutated in live user-facing tables.

### Rollback Trigger Criteria

Automatic rollback if any of the following are observed within 30 minutes of deployment:
- `department_master` query errors in server logs
- Any `GET /api/departments` returning non-200
- `VALID_DEPARTMENTS` validation rejecting previously-valid form submissions (422 spike)
- `GET /api/admin/departments` returning wrong shape causing admin page error

---

## 6. Legacy Value Handling

### 6.1 "Engineering" — 1 User in `users.department`

**Current state:** 1 active user has `department = 'Engineering'`. This department was removed from the canonical list.

**Phase 2 handling:**
- Seed `Engineering` as `is_active = false` in `department_master`.
- The `GET /api/departments` endpoint returns only `is_active = true` rows — "Engineering" **does not appear** in any dropdown.
- The user's `department` column in `users` is **not touched** in Phase 2.
- The `GET /api/admin/departments` (all-depts route) returns it with `isActive: false` so admins can see it.

**Required action before Phase 3 (frontend wiring):**
- HR/Admin must reassign this user's department to a valid active department via the user management screen.
- Until reassignment, the user's profile will show "Engineering" but no dropdown will offer it for new records — acceptable.
- Owner: Superuser/HR. Deadline: before Phase 3 go-live.

### 6.2 "General Management" — `appraisal_kpi_templates`

**Current state:** `appraisal_kpi_templates` contains at least 1 row with `department = 'General Management'`. This is outside the canonical 10.

**Phase 2 handling:**
- Seed `General Management` as `is_active = false` in `department_master`.
- Does not appear in dropdowns.
- Existing template row continues to function for reads (no FK constraint added).

**Required action before Phase 4 (appraisals wiring):**
Option A (preferred): Rename the KPI template row's department to the correct active department  
Option B: Activate `General Management` in `department_master` if the business wishes to retain it  
- Owner: HR Manager. Deadline: before Phase 4 go-live.  
- Phase 4 is blocked until this is resolved.

### 6.3 `users.department` as Department Source for Admin API

**Current state:** `GET /api/admin/departments` derives from `users.department` DISTINCT.

**Phase 2 change:** Route is re-pointed to `department_master` (all rows, including inactive).

**Impact:** Admin department filter dropdown will change from user-derived list to master list. Users with `department = 'Engineering'` will still exist but the filter value "Engineering" comes from the master (inactive) row, not from the users table. This is correct — it allows filtering historical records even after the dept is retired.

---

## 7. Frontend Migration Sequence

Phase 2 only creates the hook. No component changes. The full sequence across phases:

| Phase | Files Changed | Constant Removed | Risk |
|---|---|---|---|
| **2 (now)** | `use-departments.ts` created | None | Zero |
| 3 | `oi-issue-capture.tsx`, `oi-lesson-register.tsx`, `oi-lesson-detail.tsx` | `OI_DEPARTMENTS` from `oi-lesson-constants.ts` | Low — OI tables empty |
| 3 | `oi-sop-register.tsx` | `SOP_DEPARTMENTS` from `oi-sop-constants.ts` | Low — SOP tables empty |
| 3 | `oi-enforcement-register.tsx` | `DEPARTMENTS` from `oi-enforcement-constants.ts` | Low — enforcement tables empty |
| 4 | `employee-appraisals-page.tsx` | `departments` from `shared/schema.ts` | Medium — live KPI data, General Management must be resolved first |
| 4 | `shared/schema.ts` — remove `departments[]` const | `departments` type | Medium — TypeScript type used widely |
| 6 | Admin UI (new page) | — | Low |

**Phase 3 prerequisite:** "Engineering" user reassigned.  
**Phase 4 prerequisite:** "General Management" KPI template resolved.

---

## 8. Validation Checklist

### After Step 1 (Schema)
- [ ] `\d department_master` returns correct column types
- [ ] Unique indexes on `name` and `code` confirmed
- [ ] Application starts without error (table exists, no migrations pending)

### After Step 2 (Seed)
- [ ] `SELECT COUNT(*) FROM department_master;` → 12
- [ ] `SELECT * FROM department_master WHERE is_active = true ORDER BY sort_order;` → exactly 10 rows
- [ ] `SELECT name FROM department_master WHERE is_active = false;` → Engineering, General Management
- [ ] Startup log contains `[DeptSeed] department_master seeded`
- [ ] Seed is idempotent: restart app twice, count remains 12

### After Step 3 (New API route)
- [ ] `GET /api/departments` (authenticated) → 200 with 10 objects, sorted by `sortOrder`
- [ ] Response contains `id`, `name`, `code`, `sortOrder` fields
- [ ] "Engineering" and "General Management" NOT in response
- [ ] `GET /api/departments` (unauthenticated) → 401
- [ ] Existing OI/SOP dropdowns still work (still using hardcoded lists)

### After Step 4 (Admin route)
- [ ] `GET /api/admin/departments` (Superuser) → 12 rows including inactive
- [ ] `GET /api/admin/departments` (Employee role) → 403
- [ ] Admin user management page department filter still loads

### After Step 5 (VALID_DEPARTMENTS replaced)
- [ ] `POST /api/oi/sop` with valid dept (e.g. "Accounts") → 201 OK
- [ ] `POST /api/oi/sop` with invalid dept (e.g. "Finance") → 422 `invalid_department`
- [ ] `POST /api/oi/enforcement/controls` with valid dept → 201 OK
- [ ] `POST /api/oi/enforcement/controls` with "Engineering" → 422 (inactive dept rejected)
- [ ] Server log on startup shows departments loaded into `_validDepts`

### After Step 6 (Hook)
- [ ] `use-departments.ts` compiles without TypeScript errors
- [ ] `useQuery` keyKey is `["/api/departments"]` (matches default fetcher pattern)
- [ ] No component is importing the hook yet (no UI regression possible)

---

## 9. Zero-Trust Rollout Plan

### Principle
Every step is independently verifiable and independently reversible. No step is deployed to production without passing all its validation checkboxes in development first.

### Environment Gates

```
Dev (Replit) ──► Validate checklist ──► Staging (if available) ──► Production
                      ↑                                               ↑
               Fail = revert step                              Fail = rollback
```

### Deployment Window
- Steps 1–3: Any time (additive, read-only impact)
- Steps 4–5: Low-traffic window (affects write validation)
- Step 6: Any time (additive hook only)

### Monitoring During Rollout
- Watch server logs for `[DeptSeed]` confirmation on each restart
- Monitor `/api/departments` response time (expected < 20ms with index)
- Monitor for 422 spike on OI/SOP routes after Step 5
- Monitor `GET /api/admin/departments` callers for shape change errors

### Feature Flag (optional, recommended for Step 5)
If zero-trust enforcement is required, wrap Step 5 in an env flag:
```typescript
const USE_DB_VALID_DEPTS = process.env.USE_DB_VALID_DEPTS === "true";
if (!_validDepts.has(department) && USE_DB_VALID_DEPTS) {
  return res.status(422).json({ error: "invalid_department" });
}
```
Set `USE_DB_VALID_DEPTS=false` during initial deploy; flip to `true` after validating DB load is working.

---

## 10. Production Risk Controls

| Control | Detail |
|---|---|
| **Idempotent seed** | `ON CONFLICT DO NOTHING` — safe to run on every restart, no duplicates |
| **No FK constraints (Phase 2)** | No existing table rows can be invalidated by this migration |
| **No `users.department` mutation** | User records are read-only in this phase |
| **No UI wiring in Phase 2** | All frontend dropdowns continue using hardcoded lists during Phase 2 |
| **Additive API** | `GET /api/departments` is a new route — no existing route removed or changed until Step 4 |
| **Backward-compatible admin route** | Step 4 changes shape of admin response — low blast radius (internal admin only) |
| **Legacy rows as inactive** | "Engineering" and "General Management" stored but hidden from dropdowns — no data loss |
| **Git checkpoint** | Checkpoint `dae68cef` is the rollback baseline for full revert |
| **5-min cache on frontend** | `staleTime: 5 * 60 * 1000` on the hook prevents thundering herd after deploy |
| **No production data mutated** | All Phase 2 changes are additive (new table, new rows, new routes) |

---

## 11. Open Items — Requires Decision Before Phase 3

| # | Item | Owner | Decision Needed |
|---|---|---|---|
| OI-1 | Reassign "Engineering" user to active department | HR/Admin | Which department? |
| OI-2 | Resolve "General Management" KPI templates | HR Manager | Keep (activate) or reassign to another dept? |
| OI-3 | Confirm `code` abbreviations approved | Business | Codes listed in Section 2.1 — confirm or revise |
| OI-4 | Confirm `sort_order` sequence | Business | Alphabetical (as listed) or business-preferred order? |

---

## 12. Approvals Required

| Role | Approval Needed For |
|---|---|
| Superuser / CTO | Phase 2 execution start |
| HR Manager | Legacy value resolution (OI-1, OI-2) before Phase 3/4 |
| Superuser | Phase 3 go-live (after Engineering user reassigned) |
| HR Manager | Phase 4 go-live (after General Management resolved) |

---

*End of Phase 2 Execution Plan — Status: PENDING APPROVAL*
