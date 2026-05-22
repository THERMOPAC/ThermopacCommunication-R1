# Phase 2A Amendment 001 — SOP Audit Governance
**Document ID**: phase2a-amendment-001  
**Date**: 2026-05-22  
**Status**: APPROVED  
**Authorized by**: Management (session 2026-05-22)  
**Supersedes**: Sections 2.7, 5.5, and Migration Checklist row for `oi_audit_log` in `docs/operational-intelligence-phase2a-execution.md` v1.1

---

## 1. Plan Error Being Corrected

The approved Phase 2A execution plan (`docs/operational-intelligence-phase2a-execution.md` v1.1) contained a factual error in **three locations** regarding the nullability of `oi_audit_log.issue_id`:

| Location | Erroneous Text |
|---|---|
| Section 2.7, line ~363 | "The audit log `issue_id` column must be confirmed as nullable before migration; **it is nullable in the existing schema**." |
| Section 5.5, line ~503 | "All SOP audit entries use `issueId = null` in `writeAuditLog` calls, since SOPs are not subordinate to a single issue." |
| Section 5.5, line ~505 | "The `oi_audit_log.issue_id` column is **confirmed nullable** in the existing schema." |
| Migration Checklist, line ~886 | "`oi_audit_log` — Additive only — `issue_id = null` for SOP entries; confirmed nullable" |

**Actual schema** (`shared/schema.ts` line 14864):
```typescript
issueId: integer("issue_id").notNull().references(() => oiIssues.id, { onDelete: "cascade" }),
```

`oi_audit_log.issue_id` is `NOT NULL` with a cascade-delete FK to `oi_issues.id`. It cannot accept NULL for SOP audit entries without a schema migration.

---

## 2. Authorized Decision

**`oi_sop_audit_log` is formally approved as the SOP-specific audit table for Phase 2A and all future SOP phases.**

This decision supersedes the plan's intent to route SOP audits through `oi_audit_log` with `issue_id = null`.

---

## 3. Rationale

| Factor | Analysis |
|---|---|
| **Entity classification** | SOP is a master governance entity. It is not subordinate to any single OI issue. An SOP governs processes across many issues over its lifetime. Forcing `issue_id = null` in an issue-centric audit table is a category error. |
| **Relational integrity** | `oi_sop_audit_log.sop_id` carries a proper FK to `oi_sop_records.id` with cascade-delete. This is stronger than a nullable `issue_id`. |
| **Query isolation** | SOP audit queries do not need to compete for index space with issue/RCA/CAPA audit rows. A dedicated table provides better query performance as SOP volume grows. |
| **No nullable FK smell** | Making `oi_audit_log.issue_id` nullable would introduce a nullable FK — a known schema smell. Avoiding this maintains `oi_audit_log` as a clean, issue-only audit table. |
| **Pattern consistency** | The `oi_sop_audit_log` pattern is consistent with future Phase 3 entities (e.g. supplier audits, calibration records) that will also be master-entity-subordinate, not issue-subordinate. |

---

## 4. What Changes vs. What Does Not Change

### Does NOT change
- `oi_audit_log` schema — no alteration to `issue_id` nullability
- `writeAuditLog()` in `server/oi-audit-service.ts` — no changes, no new overloads
- All existing Issue / RCA / CAPA audit writes — unchanged
- The 13 `oi_audit_action` enum values added in Phase 2A — retained as-is in the shared enum

### Changes (implementation already in place, now formally approved)
| Item | Status |
|---|---|
| `oi_sop_audit_log` table in DB | ✅ Exists — approved |
| `oi_sop_audit_log` Drizzle definition in `shared/schema.ts` | ✅ Exists — approved |
| `server/oi-sop-audit-service.ts` and `writeSopAuditLog()` | ✅ Exists — approved |
| All `writeSopAuditLog()` calls in `server/oi-sop-routes.ts` | ✅ Exists — approved |
| `GET /api/oi/sop/:sopId/audit-log` queries `oi_sop_audit_log` by `sop_id` | ✅ Exists — approved |

---

## 5. Impact on Unified OI Audit

The two audit stores serve different entity classes:

| Store | Entity Class | FK | Queried by |
|---|---|---|---|
| `oi_audit_log` | Issues, RCA, CAPA | `issue_id NOT NULL → oi_issues.id` | `issue_id` |
| `oi_sop_audit_log` | SOPs | `sop_id → oi_sop_records.id` | `sop_id` |

Any future unified audit view (Phase 3+) will UNION both tables. The `oi_audit_action` enum is already shared, so both tables use the same action vocabulary — union queries remain type-safe.

---

## 6. Execution Plan Corrections Required

The following four passages in `docs/operational-intelligence-phase2a-execution.md` must be corrected to remove the erroneous nullable claims and document the approved design:

1. **Section 2.7** (~line 363): Replace nullable claim with approved `oi_sop_audit_log` rationale
2. **Section 5.5** (~lines 503–505): Remove `issueId = null` pattern, replace with `writeSopAuditLog` reference  
3. **Migration Checklist** (~line 886): Remove `oi_audit_log` additive row, replace with `oi_sop_audit_log` row

These corrections are applied directly to the execution plan document in this session.

---

## 7. Evidence of Correct Implementation

| Check | Result |
|---|---|
| `oi_sop_audit_log` table exists in DB | ✅ Confirmed (`\dt oi_sop*`) |
| `writeSopAuditLog()` inserts with `sop_id` FK | ✅ 18 call sites in `oi-sop-routes.ts` |
| `GET /sop/:sopId/audit-log` retrieves by `sop_id` | ✅ No `issue_id` dependency |
| No `writeAuditLog` calls in `oi-sop-routes.ts` | ✅ Confirmed (zero matches) |
| TypeScript: `tsc --noEmit` | ✅ NO ERRORS |
| App status | ✅ RUNNING |
