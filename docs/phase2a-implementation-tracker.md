# Phase 2A Implementation Tracker — SOP Intelligence
**Date**: 2026-05-22  
**Status**: COMPLETE  
**Baseline**: `docs/operational-intelligence-phase2a-execution.md` v1.1

---

## DB Migration

| Table | Columns | Indexes | Status |
|---|---|---|---|
| `oi_sop_records` | 22 | 5 | ✅ |
| `oi_sop_revisions` | 14 | 3 | ✅ |
| `oi_sop_linkages` | 9 | 3 | ✅ |
| `oi_sop_acknowledgments` | 11 | 3 | ✅ |
| `oi_sop_effectiveness` | 13 | 2 | ✅ |
| `oi_sop_audit_log` | 12 | 1 | ✅ |

**Enum additions** (`oi_audit_action`): 13 new values added  
`sop_created`, `sop_submitted_for_review`, `sop_approved`, `sop_rejected`, `sop_activated`, `sop_retired`, `sop_revised`, `sop_linked`, `sop_unlinked`, `sop_acknowledgment_assigned`, `sop_acknowledged`, `sop_acknowledgment_withdrawn`, `sop_effectiveness_recorded`

---

## Server Files

| File | Description | Status |
|---|---|---|
| `server/oi-sop-audit-service.ts` | `writeSopAuditLog()` — dedicated SOP audit (not `writeAuditLog` — avoids `oi_audit_log.issue_id NOT NULL` constraint) | ✅ |
| `server/oi-sop-routes.ts` | 28 endpoints with all 9 corrections | ✅ |
| `server/routes.ts` | `oiSopRouter` registered after `oiCapaRouter` | ✅ |

---

## Endpoint Inventory (28 total)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 1 | POST | `/api/oi/sop` | Manager+ | Create SOP |
| 2 | GET | `/api/oi/sop` | Any | List/filter register |
| 3 | GET | `/api/oi/sop/:sopId` | Any | SOP detail |
| 4 | PATCH | `/api/oi/sop/:sopId` | Manager+ | Update fields |
| 5 | POST | `/api/oi/sop/:sopId/transition` | Role-gated | Status transition |
| 6 | POST | `/api/oi/sop/:sopId/revisions` | Manager+ | Create revision |
| 7 | GET | `/api/oi/sop/:sopId/revisions` | Any | List revisions |
| 8 | PATCH | `/api/oi/sop/:sopId/revisions/:revId` | Manager+ | Update draft revision |
| 9 | POST | `/api/oi/sop/:sopId/revisions/:revId/submit` | Manager+ | Submit revision |
| 10 | POST | `/api/oi/sop/:sopId/revisions/:revId/approve` | SM+ | Approve revision |
| 11 | POST | `/api/oi/sop/:sopId/revisions/:revId/reject` | SM+ | Reject revision |
| 12 | POST | `/api/oi/sop/:sopId/linkages` | Manager+ | Add linkage |
| 13 | GET | `/api/oi/sop/:sopId/linkages` | Any | List linkages |
| 14 | DELETE | `/api/oi/sop/:sopId/linkages/:linkageId` | Manager+ | Remove linkage (C5 audit) |
| 15 | GET | `/api/oi/issues/:id/sop` | Any | SOPs linked to issue |
| 16 | GET | `/api/oi/capa/:capaId/sop` | Any | SOPs linked to CAPA |
| 17 | GET | `/api/oi/rca/:rcaId/sop` | Any | SOPs linked to RCA |
| 18 | POST | `/api/oi/sop/:sopId/acknowledgments` | Manager+ | Assign acks (C2 gate) |
| 19 | GET | `/api/oi/sop/:sopId/acknowledgments` | Any | List acks |
| 20 | POST | `/api/oi/sop/:sopId/acknowledgments/:ackId/acknowledge` | Assignee/Superuser | Acknowledge (C6 audit) |
| 21 | DELETE | `/api/oi/sop/:sopId/acknowledgments/:ackId` | Manager+ | Withdraw ack (C6 audit) |
| 22 | POST | `/api/oi/sop/:sopId/effectiveness` | SM+ | Record review (C7 gate) |
| 23 | GET | `/api/oi/sop/:sopId/effectiveness` | Any | List reviews |
| 24 | GET | `/api/oi/dashboard/sop-summary` | Any | Summary dashboard |
| 25 | GET | `/api/oi/dashboard/sop-acknowledgment` | Any | Ack compliance by dept |
| 26 | GET | `/api/oi/dashboard/sop-effectiveness` | Any | Effectiveness metrics |
| 27 | GET | `/api/oi/dashboard/sop-by-department` | Any | Active SOPs by dept |
| 28 | GET | `/api/oi/sop/:sopId/audit-log` | Any | SOP audit log |

---

## Client Files

| File | Description | Status |
|---|---|---|
| `client/src/pages/oi/oi-sop-constants.ts` | Status/type labels, color maps, vocab arrays | ✅ |
| `client/src/pages/oi/oi-sop-register.tsx` | Register page (table + create dialog + filters) | ✅ |
| `client/src/pages/oi/oi-sop-detail.tsx` | 6-tab detail page (Overview/Revisions/Linkages/Acks/Effectiveness/Audit) | ✅ |
| `client/src/loaders/oi.ts` | `OiSopRegisterPage` + `OiSopDetailPage` lazy exports | ✅ |
| `client/src/App.tsx` | `/oi/sop` and `/oi/sop/:sopId` routes | ✅ |
| `client/src/components/layout.tsx` | `BookOpen` import + SOP Register sidebar entry | ✅ |

---

## Integration Patches

| File | Patch | Status |
|---|---|---|
| `client/src/pages/oi/oi-dashboard.tsx` | `SopDashboardPanels` component + render after CAPA panels | ✅ |
| `client/src/pages/oi/oi-rca-page.tsx` | `LinkedSopTab` component + `Linked SOPs` tab trigger + content | ✅ |
| `client/src/pages/oi/oi-capa-detail.tsx` | `LinkedSopPanel` component + render before Timeline | ✅ |
| `client/src/pages/oi/oi-issue-detail.tsx` | `LinkedSopIssuePanel` component + render before transition dialog | ✅ |

---

## Validation Gates

| Gate | Result |
|---|---|
| App status | ✅ RUNNING |
| DB tables (`\dt oi_sop*`) | ✅ 6 tables |
| Endpoint count | ✅ 28 (27 spec + audit-log) |
| TypeScript (`tsc --noEmit`) | ✅ NO ERRORS |
| No Vite pre-transform errors | ✅ Confirmed |
| No server runtime errors | ✅ Confirmed |
