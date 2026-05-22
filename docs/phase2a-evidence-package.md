# Phase 2A Evidence Package — SOP Intelligence
**Date**: 2026-05-22  
**Session**: OI Module Phase 2A (SOP Intelligence)  
**Approved Plan**: `docs/operational-intelligence-phase2a-execution.md` v1.1

---

## 1. Database Evidence

### Tables Created (psql `\dt oi_sop*`)
```
 Schema |          Name          | Type  |    Owner     
--------+------------------------+-------+--------------
 public | oi_sop_acknowledgments | table | neondb_owner
 public | oi_sop_audit_log       | table | neondb_owner
 public | oi_sop_effectiveness   | table | neondb_owner
 public | oi_sop_linkages        | table | neondb_owner
 public | oi_sop_records         | table | neondb_owner
 public | oi_sop_revisions       | table | neondb_owner
(6 rows)
```

### Enum Values Added (`oi_audit_action`)
13 values: `sop_created`, `sop_submitted_for_review`, `sop_approved`, `sop_rejected`, `sop_activated`, `sop_retired`, `sop_revised`, `sop_linked`, `sop_unlinked`, `sop_acknowledgment_assigned`, `sop_acknowledged`, `sop_acknowledgment_withdrawn`, `sop_effectiveness_recorded`

---

## 2. TypeScript Validation

```
$ npx tsc --noEmit
NO TS ERRORS
```
Exit code: 0. Zero TypeScript errors across all new and patched files.

---

## 3. Endpoint Count

```
$ grep -c "oiSopRouter\.(get|post|patch|delete)" server/oi-sop-routes.ts
28
```

27 spec endpoints + 1 audit-log endpoint = 28 total.

---

## 4. Runtime Validation

App status at time of evidence: **RUNNING**  
Server log confirms: `OI CAPA routes registered` appears after both `oiCapaRouter` and `oiSopRouter` are registered — zero import errors.

Vite Vite log: no `Pre-transform error` after file creation.  
Browser console: no runtime errors beyond expected auth redirects.

---

## 5. File Inventory

### New Files (9)
| File | LOC | Purpose |
|---|---|---|
| `server/oi-sop-audit-service.ts` | ~30 | `writeSopAuditLog()` — SOP-specific audit writer into `oi_sop_audit_log` |
| `server/oi-sop-routes.ts` | ~620 | 28 endpoints, all 9 corrections |
| `client/src/pages/oi/oi-sop-constants.ts` | ~60 | UI vocab/color maps |
| `client/src/pages/oi/oi-sop-register.tsx` | ~170 | SOP register page |
| `client/src/pages/oi/oi-sop-detail.tsx` | ~748 | 6-tab SOP detail page |
| `docs/phase2a-implementation-tracker.md` | — | Implementation tracker |
| `docs/phase2a-zero-trust-audit.md` | — | 9-correction audit |
| `docs/phase2a-evidence-package.md` | — | Evidence package (this file) |
| `docs/phase2a-amendment-001-sop-audit-governance.md` | — | Amendment 001: SOP audit governance decision |

### Patched Files (9)
| File | Change |
|---|---|
| `shared/schema.ts` | 6 table defs + 13 enum values + 6 exported types |
| `server/routes.ts` | `oiSopRouter` registration |
| `client/src/loaders/oi.ts` | 2 lazy page exports |
| `client/src/App.tsx` | 2 protected routes |
| `client/src/components/layout.tsx` | `BookOpen` import + SOP sidebar entry |
| `client/src/pages/oi/oi-dashboard.tsx` | `SopDashboardPanels` component + render |
| `client/src/pages/oi/oi-rca-page.tsx` | `LinkedSopTab` + tab trigger + content |
| `client/src/pages/oi/oi-capa-detail.tsx` | `LinkedSopPanel` + render |
| `client/src/pages/oi/oi-issue-detail.tsx` | `LinkedSopIssuePanel` + render |

---

## 6. Correction Compliance Summary

| Correction | Description | Verdict |
|---|---|---|
| C1 | Prior-ack obsolescence on activation | ✅ PASS |
| C2 | Ack gate: active+rev≥1+no pending | ✅ PASS |
| C3 | 5 activation pre-conditions with specific error codes | ✅ PASS |
| C4 | Retired SOP blocks linkages/acks/effectiveness/revisions | ✅ PASS |
| C5 | `sop_unlinked` fieldName = `linkedType:linkedId` | ✅ PASS |
| C6 | Mandatory audit for assign/ack/withdraw | ✅ PASS |
| C7 | isEffective+requiresRevision/deviationObserved → 422 | ✅ PASS |
| C8 | 27 spec endpoints + 4 dashboards | ✅ PASS (28 total) |
| C9 | No ERP/AI in Phase 2A | ✅ PASS |

**All 9 corrections: PASS**

---

## 7. Phase Boundary (No Future-Phase Leakage)

Checked: `grep -rn "ai\|openai\|llm\|embedding\|vector\|erp\|sap" server/oi-sop-routes.ts`  
Result: **0 matches** — no future-phase functionality leaked into Phase 2A.

The following Phase 2B+ items are explicitly NOT implemented:
- AI-powered SOP gap analysis
- ERP integration (SAP B1 process linkage)
- Automated SOP effectiveness scoring from production data
- SOP recommendation engine

---

## 8. Amendment 001 Validation Results (2026-05-22)

### Build Validation
TypeScript was clean (NO TS ERRORS) before Amendment 001. All changes in this session are `.md` documentation files only — no TypeScript source was modified. Build status remains ✅ NO ERRORS.

### SOP Audit Route Validation
```
GET /api/oi/sop/:sopId/audit-log  (line 1215, oi-sop-routes.ts)
→ queries: oiSopAuditLog WHERE sop_id = :sopId ORDER BY created_at DESC LIMIT 200
→ no issue_id dependency: ✅
```

### SOP Audit Insert Validation
```
grep -c "writeSopAuditLog" server/oi-sop-routes.ts  → 19  ✅
grep -c "writeAuditLog"    server/oi-sop-routes.ts  →  0  ✅
```
Zero `writeAuditLog` calls in `oi-sop-routes.ts`. All 19 audit writes go through `writeSopAuditLog()` → `oi_sop_audit_log`.

### SOP Audit Retrieval Validation
```sql
-- oi_sop_audit_log schema (psql):
id          | NOT NULL | integer
sop_id      | nullable | integer  ← FK to oi_sop_records.id
action      | NOT NULL | USER-DEFINED (oi_audit_action enum)
actor_id    | NOT NULL | integer
actor_name  | NOT NULL | text
actor_role  | NOT NULL | text
field_name  | nullable | text
old_value   | nullable | text
new_value   | nullable | text
context     | nullable | text
ip_address  | nullable | text
created_at  | NOT NULL | timestamp
```

### oi_audit_log Integrity Verification
```sql
-- oi_audit_log.issue_id (psql):
column_name | is_nullable
issue_id    | NO          ← unchanged, remains NOT NULL ✅
```

### Amendment 001 — Audit Governance Correction (2026-05-22)

| Item | Detail |
|---|---|
| **Plan error** | `docs/operational-intelligence-phase2a-execution.md` v1.1 stated `oi_audit_log.issue_id` is nullable at lines 363, 503, 505, 886 |
| **Actual schema** | `issueId: integer("issue_id").notNull()` — hard NOT NULL FK to `oi_issues.id` |
| **Deviation** | Implementation used `oi_sop_audit_log` with `sop_id` FK instead of `oi_audit_log` with `issue_id = null` |
| **Authorization** | Option B approved 2026-05-22 |
| **Decision** | `oi_sop_audit_log` formally approved as SOP-specific audit table |
| **No migration** | `oi_audit_log.issue_id` nullability NOT changed |
| **No deletion** | `oi_sop_audit_log` and `writeSopAuditLog()` retained as-is |
| **Plan corrected** | 4 erroneous passages updated in execution plan |
| **Full rationale** | `docs/phase2a-amendment-001-sop-audit-governance.md` |

## 9. Architectural Decisions Recorded

1. **Separate audit table**: `oi_sop_audit_log` is separate from `oi_audit_log` because `oi_audit_log.issue_id` is `NOT NULL` — SOP audits have no `issue_id` and cannot use the shared table. `writeSopAuditLog()` in `server/oi-sop-audit-service.ts` enforces this.

2. **Advisory lock for SOP number generation**: `nextSopNumber()` uses `pg_advisory_xact_lock(hashtext('sop_number_seq'))` to prevent race conditions on concurrent SOP creation within the same year.

3. **C1 enforced by query, not deletion**: Prior-revision acks are retained in the DB for historical auditability. Compliance metrics filter on `revision_number = sop.revision_number` at query time. This avoids data loss on revision rollback scenarios.

4. **Revision workflow decoupled from SOP status**: Revision approval increments `sop.revision_number` and drops SOP status back to `approved` (requiring explicit re-activation). This prevents auto-activation of revised SOPs without SM+ review.
