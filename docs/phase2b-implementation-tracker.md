# Phase 2B Implementation Tracker
**ERP Enforcement Framework — Revision 3 Execution Plan**
**Date:** 2026-05-22  
**Status:** IMPLEMENTATION COMPLETE — Pending Closure Approval

---

## Task Completion Matrix

| Task | Description | Status | Files |
|------|-------------|--------|-------|
| T001 | Codebase exploration — schema, routes, client surfaces | ✅ DONE | Read-only |
| T002 | DB Schema — 12 enum values + 5 tables + insert schemas + types | ✅ DONE | `shared/schema.ts` |
| T003 | DB Migration — ALTER TYPE × 12, CREATE TABLE × 5, INDEX × 16 | ✅ DONE | psql direct |
| T004 | Server audit service — `writeEnforcementAuditLog()` | ✅ DONE | `server/oi-enforcement-audit-service.ts` |
| T005 | Server routes — 30 endpoint handlers, full governance | ✅ DONE | `server/oi-enforcement-routes.ts` |
| T006 | Route registration in `server/routes.ts` | ✅ DONE | `server/routes.ts` |
| T007 | Client — constants, register page, detail page (5 tabs) | ✅ DONE | `client/src/pages/oi/oi-enforcement-*.{ts,tsx}` |
| T008 | Client integration — loaders, App.tsx, layout, dashboard, SOP detail | ✅ DONE | Multiple client files |
| T009 | Build validation + evidence | ✅ DONE | TypeScript: 0 errors |

---

## Schema Deliverables (T002)

### Enum Additions — `oiAuditActionEnum` (+12 values)
| Value | Purpose |
|-------|---------|
| `enforcement_control_created` | New control registered |
| `enforcement_control_activated` | Control moved to active |
| `enforcement_control_suspended` | Control suspended |
| `enforcement_control_retired` | Control retired (terminal) |
| `enforcement_hold_raised` | Hold raised against ERP entity |
| `enforcement_hold_approved_to_proceed` | ATP granted (advisory proceed) |
| `enforcement_hold_released` | Hold formally released |
| `enforcement_hold_overridden` | Hold overridden (Manager+, reason ≥20 chars) |
| `enforcement_hold_emergency_bypassed` | Emergency bypass (Superuser only) |
| `enforcement_checklist_item_checked` | Checklist item submitted with evidence |
| `enforcement_checklist_item_rejected` | Checklist item rejected by approver |
| `enforcement_checklist_item_resubmitted` | Checklist item resubmitted after rejection |

### New Tables (5)

| Table | Columns | Indexes | Purpose |
|-------|---------|---------|---------|
| `oi_enforcement_controls` | 30 | 6 | Master control registry |
| `oi_enforcement_checklists` | 10 | 1 | Checklist items per control |
| `oi_enforcement_holds` | 32 | 8 | Per-entity-instance holds |
| `oi_enforcement_checklist_responses` | 15 | 3 | Per-hold checklist evidence |
| `oi_enforcement_audit_log` | 14 | 3 | Immutable event log |

---

## Server Deliverables (T004–T006)

### Audit Service — `server/oi-enforcement-audit-service.ts`
- `writeEnforcementAuditLog()` — INSERT-only, no UPDATE/DELETE
- Requires `controlId` OR `holdId` (null guard enforced)
- `is_override_event` auto-set to `true` for override and emergency bypass actions
- Captures: actorId, actorName, actorRole, fieldName, oldValue, newValue, context, ipAddress

### Routes — `server/oi-enforcement-routes.ts` (30 handlers)

| Group | Endpoint | Auth | Description |
|-------|----------|------|-------------|
| Controls | `GET /enforcement/controls` | Manager+ | List with filters |
| Controls | `POST /enforcement/controls` | Manager+ | Create (scope validation, owner≠approver) |
| Controls | `GET /enforcement/controls/:id` | Manager+ | Detail with checklist |
| Controls | `PATCH /enforcement/controls/:id` | Manager+ | Update (draft only) |
| Controls | `POST /enforcement/controls/:id/transition` | SM+ (activate requires approver consent) | State transition |
| Controls | `GET /enforcement/controls/:id/audit-log` | Manager+ | Audit history |
| Controls | `GET /enforcement/sop/:sopId/enforcement-controls` | Manager+ | By SOP |
| Controls | `GET /enforcement/erp/:erpEntityType/:erpEntityId/controls` | Manager+ | By ERP entity |
| Checklists | `POST /enforcement/controls/:id/checklist` | Manager+ | Add item |
| Checklists | `GET /enforcement/controls/:id/checklist` | Manager+ | List items |
| Checklists | `PATCH /enforcement/controls/:id/checklist/:itemId` | Manager+ | Update item |
| Checklists | `DELETE /enforcement/controls/:id/checklist/:itemId` | Manager+ | Delete item |
| Holds | `POST /enforcement/holds` | Manager+ | Raise hold (escOwner must be SM+) |
| Holds | `GET /enforcement/holds` | Manager+ | List with filters |
| Holds | `GET /enforcement/holds/:id` | Manager+ | Detail with bypass info |
| Holds | `PATCH /enforcement/holds/:id` | Manager+ | Update open hold |
| Holds | `POST /enforcement/holds/:id/approve` | Manager+ | Approve to proceed |
| Holds | `POST /enforcement/holds/:id/release` | Manager+ | Release (note ≥10 chars) |
| Holds | `POST /enforcement/holds/:id/override` | Manager+ | Override (reason ≥20 chars) |
| Holds | `POST /enforcement/holds/:id/emergency-bypass` | **Superuser only** | Emergency bypass (reason ≥20 chars) |
| Holds | `GET /enforcement/holds/:id/audit-log` | Manager+ | Hold audit history |
| Holds | `GET /enforcement/erp/:erpEntityType/:erpEntityId/holds` | Manager+ | By ERP entity |
| Checklist Resp. | `GET /enforcement/holds/:id/checklist-responses` | Manager+ | List responses |
| Checklist Resp. | `POST /enforcement/holds/:id/checklist-responses` | Manager+ | Submit evidence |
| Checklist Resp. | `POST /enforcement/holds/:id/checklist-responses/:rid/reject` | Manager+ | Reject |
| Checklist Resp. | `POST /enforcement/holds/:id/checklist-responses/:rid/resubmit` | Manager+ | Resubmit |
| Dashboard | `GET /dashboard/enforcement-summary` | Manager+ | KPIs (holds+controls counts) |
| Dashboard | `GET /dashboard/enforcement-by-type` | Manager+ | Breakdown by ERP type |
| Dashboard | `GET /dashboard/enforcement-overrides` | Manager+ | Override/bypass log |
| Dashboard | `GET /dashboard/enforcement-kpi` | **SM+ only** | Full KPI with benchmark |

---

## Client Deliverables (T007–T008)

| File | Lines | Purpose |
|------|-------|---------|
| `client/src/pages/oi/oi-enforcement-constants.ts` | ~100 | All labels, colors, vocabulary maps |
| `client/src/pages/oi/oi-enforcement-register.tsx` | ~470 | Tabbed Controls/Holds register |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | ~1050 | 5-tab detail page |
| `client/src/loaders/oi.ts` | patched | 2 lazy exports added |
| `client/src/App.tsx` | patched | 2 routes: `/oi/enforcement`, `/oi/enforcement/:controlId` |
| `client/src/components/layout.tsx` | patched | Sidebar: "Enforcement Controls" |
| `client/src/pages/oi/oi-dashboard.tsx` | patched | `EnforcementDashboardPanels` added |
| `client/src/pages/oi/oi-sop-detail.tsx` | patched | 7th "Enforcement" tab + `SopEnforcementTab` |

---

## Governance Rules Implemented

| Rule | Implementation Point |
|------|---------------------|
| Owner ≠ Approver | `POST /controls` + `POST /holds` validation |
| Activation requires approver consent | `transition → active`: approver OR Superuser |
| Escalation owner must be SM+ | Hold raise + hold update validation |
| Duplicate active hold prevention | Partial unique index `WHERE status = 'open'` |
| Override requires ≥20 char reason | `POST /holds/:id/override` |
| Emergency bypass: Superuser only | `hasRole(a.role, SUPERUSER_ROLES)` gate |
| Emergency bypass requires ≥20 char reason | `POST /holds/:id/emergency-bypass` |
| Release requires ≥10 char note | `POST /holds/:id/release` |
| Suspension requires ≥10 char reason | `transition → suspended` |
| Retirement requires ≥10 char reason | `transition → retired` |
| Audit on every state transition | `writeEnforcementAuditLog()` called in all mutating paths |
| Audit log is INSERT-only | No UPDATE/DELETE in `oi-enforcement-audit-service.ts` |
| Applicability scope precedence | `project=4, dept=3, equip_type=2, global=1` computed in `computeApplicabilityPrecedence()` |
| SM+ KPI dashboard gate | `GET /dashboard/enforcement-kpi` requires SM+ role |
