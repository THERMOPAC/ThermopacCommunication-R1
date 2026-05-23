# SOP Access Control — Department + Role
## Execution Plan v1.0

**Status:** PENDING APPROVAL  
**Prepared:** 2026-05-23  
**Module:** OI / SOP  
**Baseline Doc (post-approval):** `docs/sop-access-control-baseline-v1.0.md`

---

## 0. Governing Rules

- No hard-delete of SOPs. Retired status is the terminal state. Revision history and audit logs are immutable.
- AI/system may suggest SOP revisions. AI must not directly modify any SOP record.
- All role checks are additive on top of existing `MANAGER_ROLES` / `SM_ROLES` gates.
- Department source: `GET /api/departments` (Department Master API). No hardcoded arrays.
- Applicable Role source: `VALID_SOP_ROLES` constant (system-defined, not DB-mastered).
- Non-Superuser actor creating an SOP is restricted to their own department only.

---

## 1. Schema Impact

### 1.1 `oi_sop_records` — One new column

```sql
ALTER TABLE oi_sop_records ADD COLUMN applicable_role text;
```

| Step | Action |
|------|--------|
| Step 1 | Add column as **nullable** |
| Step 2 | Backfill: `UPDATE oi_sop_records SET applicable_role = 'Employee' WHERE applicable_role IS NULL` |
| Step 3 | Set NOT NULL: `ALTER TABLE oi_sop_records ALTER COLUMN applicable_role SET NOT NULL` |

Drizzle schema addition:
```typescript
applicableRole: text("applicable_role").notNull(),
```

### 1.2 `oiSopAuditLog` — Two new columns

```sql
ALTER TABLE oi_sop_audit_log ADD COLUMN department text;
ALTER TABLE oi_sop_audit_log ADD COLUMN applicable_role text;
```

Both nullable. Pre-existing rows retain null — no backfill required.

Drizzle schema additions:
```typescript
department:     text("department"),
applicableRole: text("applicable_role"),
```

### 1.3 `oiAuditActionEnum` — No new values required

Existing `sop_created`, `sop_revised`, `sop_retired` cover all required audit events.  
`sop_deleted` is NOT added (hard-delete is prohibited).

### 1.4 No changes to

- `oiSopRevisions`
- `oiSopAcknowledgments`
- `oiSopLinkages`
- `oiSopEffectiveness`
- `department_master`
- `users`
- Any other table

---

## 2. API Changes

### 2.1 Shared constants (new, in `server/oi-sop-routes.ts`)

```typescript
const VALID_SOP_ROLES = [
  "Superuser",
  "General Manager",
  "Senior Manager",
  "Manager",
  "Senior Executive",
  "Employee",
] as const;

const ROLE_RANK: Record<string, number> = {
  "Superuser":        1,
  "General Manager":  2,
  "Senior Manager":   3,
  "Manager":          4,
  "Senior Executive": 5,
  "Employee":         6,
};

function canAccessSop(actor: { role: string; department?: string }, sop: { department: string; applicableRole: string }): boolean {
  if (actor.role === "Superuser") return true;
  if (actor.department !== sop.department) return false;
  return (ROLE_RANK[actor.role] ?? 99) <= (ROLE_RANK[sop.applicableRole] ?? 99);
}
```

`canAccessSop` is the **single source of truth** for access decisions. It is not duplicated.

### 2.2 `POST /api/oi/sop` — Create

**Schema change:**  
- Add `applicableRole: z.enum(VALID_SOP_ROLES)` — **required**
- Replace `z.enum([...hardcoded depts...])` with `z.string().min(1)` validated against live `_validDepts` Set (same pattern already used for Enforcement route guard)

**Access change:**  
- Non-Superuser: `data.department` must equal `actor.department` → 403 if mismatch
- Superuser: unrestricted

**Write:**  
- `applicable_role` written to DB on insert

### 2.3 `PATCH /api/oi/sop/:sopId` — Update

**Schema change:**  
- Add `applicableRole: z.enum(VALID_SOP_ROLES).optional()`
- Replace department `z.enum([...])` with `z.string().min(1)` validated against `_validDepts`

**Access change:**  
- After existing role gate passes: call `canAccessSop(actor, sop)` → 403 if false
- Non-Superuser cannot change `department` to a department other than their own → 403

**Track:**  
- `applicableRole` tracked via existing `track()` mechanism

### 2.4 `GET /api/oi/sop` — List Register

**Scope filter (new):**  
- Superuser: no additional filter
- Non-Superuser: append `WHERE department = actor.department AND role_rank(applicable_role) >= role_rank(actor.role)`
- Since `ROLE_RANK` is in server memory, the role-rank filter is applied **in application code** after DB query, not via SQL expression (avoids custom PG function)
- `limit` is applied before in-memory role filter → use an increased pre-fetch limit or apply role filter in SQL via `applicable_role IN (roles_with_rank >= actor_rank)`

**SQL role filter approach (preferred for correctness):**  
- Compute `accessibleRoles: string[]` = `VALID_SOP_ROLES.filter(r => ROLE_RANK[r] >= ROLE_RANK[actor.role])`
- Add SQL condition: `inArray(oiSopRecords.applicableRole, accessibleRoles)`
- Add SQL condition: `eq(oiSopRecords.department, actor.department)`
- Both conditions added only when actor is not Superuser

**New filter param:**  
- `applicableRole` query param — direct filter, Superuser only (non-Superuser cannot expand beyond their natural scope)

**Projection:**  
- Add `applicableRole: oiSopRecords.applicableRole` to SELECT

### 2.5 `GET /api/oi/sop/:sopId` — Detail

**Access change:**  
- After existing MANAGER_ROLES gate: call `canAccessSop(actor, sop)` → 403 `{ error: "sop_access_denied" }` if false

### 2.6 `POST /api/oi/sop/:sopId/transition` — State transitions

**Retire transition:**  
- Access change: non-Superuser must satisfy `canAccessSop` and be SM+ role (existing SM_ROLES gate unchanged)
- No other transition changes

**All other transitions:** no access change

### 2.7 Department validation in SOP routes (server-side guard)

Current state: `createSopSchema` and `updateSopSchema` use `z.enum([...10 hardcoded strings...])`.

Replacement pattern (same as Enforcement route guard):
- `_validDepts` Set is already loaded from DB at startup in `oi-sop-routes.ts`
- Replace `z.enum([...])` with `z.string().min(1)` in Zod schema
- Add explicit guard after parse: `if (!_validDepts.has(data.department)) return 422`

---

## 3. UI Changes

### 3.1 SOP Create Form (`oi-sop-register.tsx`)

| Change | Detail |
|--------|--------|
| `Department` field | Already present; sourced from `useDepartments()` (Phase 3) — no change |
| `Applicable Role` field | New Select field. Values: `VALID_SOP_ROLES` constant (static, no API call). Required. |
| Submit block | Block if `department` or `applicableRole` is empty string / undefined |
| Error display | Show red message under blocked field if submit attempted with missing value |

**Non-Superuser department restriction:**  
- For non-Superuser users: `Department` field is pre-filled with actor's own department and set to **read-only** (disabled Select, not editable)
- Superuser: full free Select

### 3.2 SOP Edit / Detail (`oi-sop-detail.tsx`)

| Change | Detail |
|--------|--------|
| `Applicable Role` field | Add to edit form. Select, values from `VALID_SOP_ROLES`. Optional on edit (field exists, can be changed). |
| `Department` field (edit) | Non-Superuser: read-only (cannot change). Superuser: editable. |
| Submit block | Block update if `applicableRole` is null/empty |

### 3.3 SOP Register Table (`oi-sop-register.tsx`)

| Change | Detail |
|--------|--------|
| `Department` column | Confirm present in table; add if missing |
| `Applicable Role` column | Add new column, display `applicableRole` from list response |

### 3.4 SOP Register Filter Bar (`oi-sop-register.tsx`)

| Change | Detail |
|--------|--------|
| `Department` filter | Already present (Phase 3) — no change |
| `Applicable Role` filter | Add new Select filter. Values: `VALID_SOP_ROLES` (static constant). Passed as `applicableRole` query param. |

**Filter visibility rule:**  
- Superuser: both filters fully functional  
- Non-Superuser: Department filter is fixed to own department (read-only or hidden); Applicable Role filter functional within own department

---

## 4. Role Hierarchy Logic

```
VALID_SOP_ROLES (ordered highest to lowest authority):
  "Superuser"        rank 1
  "General Manager"  rank 2
  "Senior Manager"   rank 3
  "Manager"          rank 4
  "Senior Executive" rank 5
  "Employee"         rank 6

Access rule:
  actor.role = "Superuser"  → always pass
  actor.department ≠ sop.department  → deny
  ROLE_RANK[actor.role] > ROLE_RANK[sop.applicableRole]  → deny
  otherwise  → allow

Examples:
  Manager (rank 4) accessing SOP[applicableRole=Employee (rank 6)]: 4 ≤ 6 → ALLOW
  Manager (rank 4) accessing SOP[applicableRole=Manager (rank 4)]: 4 ≤ 4 → ALLOW
  Manager (rank 4) accessing SOP[applicableRole=Senior Manager (rank 3)]: 4 > 3 → DENY
  Senior Executive (rank 5) accessing SOP[applicableRole=Manager (rank 4)]: 5 > 4 → DENY
```

`ROLE_RANK` is defined in `server/oi-sop-routes.ts` as a const object.  
The same constant is exported from a shared location or duplicated in client for UI-side filtering display only.

---

## 5. Permission Validation Matrix

| Operation | Role Gate (existing) | Scope Gate (new) | Create dept restriction |
|-----------|---------------------|------------------|------------------------|
| Create SOP | MANAGER_ROLES | — | Non-SU: own dept only |
| List SOPs | Any authenticated | Non-SU: own dept + role ≤ SOP role | — |
| View Detail | MANAGER_ROLES | Non-SU: canAccessSop | — |
| Edit (PATCH) | MANAGER_ROLES | Non-SU: canAccessSop | Non-SU: cannot change dept |
| Submit/Approve/Reject | MANAGER_ROLES / SM_ROLES | Non-SU: canAccessSop | — |
| Activate | SM_ROLES | Non-SU: canAccessSop | — |
| Retire | SM_ROLES | Non-SU: canAccessSop | — |
| Assign Acknowledgment | MANAGER_ROLES | Non-SU: canAccessSop | — |
| Record Effectiveness | SM_ROLES | Non-SU: canAccessSop | — |

**Zero-trust note:** The scope gate is applied server-side on every individual route handler, not just on list. Bypass via direct URL with known SOP ID is blocked by the detail access check.

---

## 6. Audit Design

### 6.1 Audit log schema additions

`oiSopAuditLog` gains two nullable columns: `department`, `applicable_role`.

### 6.2 `writeSopAuditLog()` signature extension

```typescript
writeSopAuditLog({
  sopId,
  action,
  actorId, actorName, actorRole,
  fieldName?,
  oldValue?,
  newValue?,
  department?,      // NEW — the sop.department at time of action
  applicableRole?,  // NEW — the sop.applicableRole at time of action
  context?,
  ipAddress?,
})
```

### 6.3 Audit events and populated fields

| Trigger | `action` | `department` | `applicable_role` | `fieldName` | `old/newValue` |
|---------|----------|-------------|-------------------|-------------|----------------|
| SOP created | `sop_created` | sop.department | sop.applicableRole | — | — |
| `department` changed | `sop_revised` | new dept | sop.applicableRole | `"department"` | old → new |
| `applicable_role` changed | `sop_revised` | sop.department | new role | `"applicable_role"` | old → new |
| SOP retired | `sop_retired` | sop.department | sop.applicableRole | — | — |
| All other existing events | (unchanged action) | sop.department | sop.applicableRole | (unchanged) | (unchanged) |

Existing audit events will be enriched to also carry `department` and `applicableRole` from the SOP record at write time.

### 6.4 Audit log immutability rules (enforced, not new)

- No DELETE endpoint exists for `oi_sop_audit_log`
- No UPDATE is ever issued on audit rows
- These rules are pre-existing and remain unchanged

---

## 7. SOP Revision Suggestion Workflow (AI Learning Rule)

### 7.1 Rule

AI/system must NEVER directly write to `oi_sop_records`, `oi_sop_revisions`, or any SOP table.

### 7.2 Suggestion flow

```
Issue captured
  → RCA completed
    → CAPA corrective action defined
      → Lesson Learned created & approved
        → AI/system generates SOP Revision Suggestion
          → Suggestion stored in new table: oi_sop_revision_suggestions
            → Human reviewer notified
              → Reviewer approves or rejects suggestion
                → On approval: human creates SOP revision via existing revision workflow
                  → Revision goes through standard SOP review/approval cycle
                    → On release: re-acknowledgement assigned to applicable users
```

### 7.3 `oi_sop_revision_suggestions` — New table

```typescript
export const oiSopRevisionSuggestions = pgTable("oi_sop_revision_suggestions", {
  id:              serial("id").primaryKey(),
  sopId:           integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "cascade" }),
  sourceType:      text("source_type").notNull(),   // "lesson_learned" | "capa" | "ai_agent"
  sourceId:        integer("source_id"),            // FK to lesson / capa / null for AI
  suggestedChange: text("suggested_change").notNull(), // Human-readable description of proposed change
  rationale:       text("rationale").notNull(),
  status:          text("status").notNull().default("pending"), // pending | reviewed | approved | rejected
  suggestedBy:     integer("suggested_by").references(() => users.id, { onDelete: "set null" }), // null for AI-sourced
  suggestedAt:     timestamp("suggested_at").notNull().defaultNow(),
  reviewedBy:      integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt:      timestamp("reviewed_at"),
  reviewNotes:     text("review_notes"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});
```

### 7.4 Suggestion API endpoints

| Endpoint | Method | Who | Purpose |
|----------|--------|-----|---------|
| `/api/oi/sop/:sopId/suggestions` | GET | SM+ | List suggestions for a SOP |
| `/api/oi/sop/:sopId/suggestions` | POST | System/AI agent token | Create a suggestion (never modifies SOP) |
| `/api/oi/sop/:sopId/suggestions/:id/review` | PATCH | SM+ | Approve or reject suggestion |

**POST (create suggestion) does NOT modify any SOP field.** It only inserts a row into `oi_sop_revision_suggestions`.

**PATCH (review) does NOT modify any SOP field.** It only updates `status`, `reviewedBy`, `reviewedAt`, `reviewNotes`.

**No suggestion, approved or rejected, directly triggers a SOP write.** The human must separately initiate the revision via the existing `POST /api/oi/sop/:sopId/revisions` workflow.

### 7.5 Suggestion access control

- Read: SM+ within the SOP's department (Superuser unrestricted)
- Create: any authenticated system actor or SM+ (source type recorded)
- Review (approve/reject): SM+ within the SOP's department, or Superuser

---

## 8. Rollback Plan

All schema changes are additive. No existing columns altered. No rows deleted.

| Change | Rollback SQL |
|--------|-------------|
| `applicable_role` on `oi_sop_records` | `ALTER TABLE oi_sop_records DROP COLUMN applicable_role;` |
| `department` + `applicable_role` on `oi_sop_audit_log` | `ALTER TABLE oi_sop_audit_log DROP COLUMN department, DROP COLUMN applicable_role;` |
| `oi_sop_revision_suggestions` table | `DROP TABLE oi_sop_revision_suggestions;` |
| Server: `canAccessSop`, `VALID_SOP_ROLES`, `ROLE_RANK` | Remove from `oi-sop-routes.ts` |
| Server: scope filter on GET list/detail | Remove the `canAccessSop` calls and `accessibleRoles` filter |
| UI: `Applicable Role` field and column | Remove from form and table |
| UI: Role filter in register | Remove filter control |

Rollback restores the pre-Phase-3-SOP-Access state. No data loss on rollback (backfilled `applicable_role` values are dropped with the column).

---

## 9. Zero-Trust Validation Checklist

These checks must all pass before implementation is declared complete.

### Schema
- [ ] `oi_sop_records.applicable_role` is `NOT NULL` after migration
- [ ] All existing rows have `applicable_role = 'Employee'` after backfill
- [ ] `oi_sop_audit_log.department` and `.applicable_role` columns exist (nullable)
- [ ] `oi_sop_revision_suggestions` table created with all columns
- [ ] `npm run check` exits 0 after schema change

### API — Access Control
- [ ] `GET /api/oi/sop` as Employee (dept=Production): returns only Production SOPs where `applicable_role` IN ('Senior Executive', 'Employee')
- [ ] `GET /api/oi/sop` as Manager (dept=Design): returns only Design SOPs where `applicable_role` IN ('Manager', 'Senior Executive', 'Employee')
- [ ] `GET /api/oi/sop` as Superuser: returns all SOPs across all departments
- [ ] `GET /api/oi/sop/:id` as Employee accessing a Manager-role SOP in same department: 403
- [ ] `GET /api/oi/sop/:id` as Manager accessing a Senior Manager-role SOP in same department: 403
- [ ] `GET /api/oi/sop/:id` as Manager accessing any SOP in a different department: 403
- [ ] `GET /api/oi/sop/:id` as Superuser: 200 for any SOP regardless of department or role

### API — Create
- [ ] `POST /api/oi/sop` without `applicableRole`: 400 validation_failed
- [ ] `POST /api/oi/sop` with invalid `applicableRole` value: 400 validation_failed
- [ ] `POST /api/oi/sop` by non-Superuser with `department` ≠ actor's department: 403
- [ ] `POST /api/oi/sop` by Superuser with any valid `department`: 201
- [ ] `POST /api/oi/sop` with invalid department (not in `_validDepts`): 422

### API — Update
- [ ] `PATCH /api/oi/sop/:id` by non-Superuser on SOP outside own department: 403
- [ ] `PATCH /api/oi/sop/:id` by Manager on a Senior Manager-role SOP in own dept: 403
- [ ] `PATCH /api/oi/sop/:id` to change department to non-own-dept by non-Superuser: 403
- [ ] `PATCH /api/oi/sop/:id` with `applicableRole` change: audit row written with `fieldName='applicable_role'`, `oldValue`, `newValue`, `department`, `applicable_role` populated

### Audit
- [ ] `sop_created` audit row has non-null `department` and `applicable_role`
- [ ] `sop_retired` audit row has non-null `department` and `applicable_role`
- [ ] `sop_revised` audit row for department change has `fieldName='department'`, `oldValue`, `newValue`
- [ ] `sop_revised` audit row for applicableRole change has `fieldName='applicable_role'`, `oldValue`, `newValue`
- [ ] No DELETE endpoint exists for `oi_sop_audit_log`

### Suggestions
- [ ] `POST /api/oi/sop/:id/suggestions` does not modify any field on `oi_sop_records`
- [ ] `PATCH .../suggestions/:id/review` with `status=approved` does not modify any field on `oi_sop_records`
- [ ] Suggestion with `status=rejected` leaves SOP record untouched
- [ ] AI-sourced suggestion has `suggestedBy = null`, `sourceType = 'ai_agent'`

### UI
- [ ] `Applicable Role` Select visible on SOP Create form with 6 options matching `VALID_SOP_ROLES`
- [ ] Submit blocked if `applicableRole` is empty on create
- [ ] Non-Superuser user: `Department` field pre-filled with own department and disabled on create
- [ ] `Applicable Role` column visible in SOP Register table
- [ ] `Applicable Role` filter functional in SOP Register
- [ ] No hardcoded department arrays remain anywhere in SOP UI components

### No regressions
- [ ] Existing SOP list for Superuser is unchanged (all SOPs visible)
- [ ] SOP revision workflow unchanged
- [ ] SOP acknowledgment workflow unchanged
- [ ] SOP effectiveness workflow unchanged
- [ ] Department Master Phase 3 hook (`useDepartments()`) continues to work in SOP Register

---

## 10. Execution Waves

| Wave | Scope | Files |
|------|-------|-------|
| W1 | Schema: `applicable_role` on `oi_sop_records` + audit log columns + `oi_sop_revision_suggestions` | `shared/schema.ts` |
| W2 | Server: `VALID_SOP_ROLES`, `ROLE_RANK`, `canAccessSop`; replace hardcoded dept enum in Zod; add `applicable_role` to create/update; scope filter on GET list/detail | `server/oi-sop-routes.ts` |
| W3 | Server: `writeSopAuditLog` extended; all call sites enriched with `department` + `applicableRole` | `server/oi-sop-audit-service.ts`, `server/oi-sop-routes.ts` |
| W4 | Server: Suggestion endpoints (`GET`, `POST`, `PATCH review`) | `server/oi-sop-routes.ts` or new `server/oi-sop-suggestion-routes.ts` |
| W5 | UI: `Applicable Role` field in create/edit; Department lock for non-Superuser; Register table columns + filter | `client/src/pages/oi/oi-sop-register.tsx`, `client/src/pages/oi/oi-sop-detail.tsx` |
| W6 | DB push + backfill (`applicable_role = 'Employee'`) | `drizzle-kit push:pg` + manual SQL or seed |
| W7 | Zero-trust validation checklist — all items verified | — |

---

## Explicit Exclusions

- No hard-delete of any SOP record, revision, acknowledgment, or audit row
- AI must not write to `oi_sop_records`, `oi_sop_revisions`, or any SOP table
- No changes to SOP state machine (draft → under_review → approved → active → retired)
- No changes to `oiSopRevisions`, `oiSopAcknowledgments`, `oiSopLinkages`, `oiSopEffectiveness` (structure)
- No changes to other OI modules (Issues, Enforcement, Lessons, CAPA, RCA)
- No new top-level pages — all UI within existing SOP Register and SOP Detail
- `Consultant` role is excluded from `VALID_SOP_ROLES`
- Department Master table and API are not modified
