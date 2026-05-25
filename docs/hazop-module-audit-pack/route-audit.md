# HAZOP Module — Route Audit
**Compiled:** 2026-05-25  
**File:** `server/hazop-routes.ts`  
**Auth:** All routes require `ensureAuthenticated` (401 if unauthenticated)  
**Role gates:** Noted per route  

---

## Phase 1 Routes — Study CRUD (6 routes)

| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 1 | GET | `/api/hazop/studies/project/:projectId` | ✅ | None | List studies for a project |
| 2 | GET | `/api/hazop/studies/concept` | ✅ | None | List all concept studies |
| 3 | GET | `/api/hazop/studies/:studyId` | ✅ | None | Get single study with related counts |
| 4 | POST | `/api/hazop/studies` | ✅ | None | Create study (project_based or concept_expected_project) |
| 5 | PATCH | `/api/hazop/studies/:studyId` | ✅ | None | Update study metadata; converted status blocked |
| 6 | DELETE | `/api/hazop/studies/:studyId` | ✅ | None | Delete draft study only (403 otherwise) |

---

## Phase 2 Routes — Loop / Node / Step Builder (~12 routes)

| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 7 | GET | `/api/hazop/studies/:studyId/loops` | ✅ | None | List loops for study |
| 8 | POST | `/api/hazop/studies/:studyId/loops` | ✅ | None | Create loop |
| 9 | PATCH | `/api/hazop/loops/:id` | ✅ | None | Update loop |
| 10 | DELETE | `/api/hazop/loops/:id` | ✅ | None | Delete loop |
| 11 | GET | `/api/hazop/loops/:loopId/nodes` | ✅ | None | List nodes for loop |
| 12 | POST | `/api/hazop/loops/:loopId/nodes` | ✅ | None | Create node |
| 13 | PATCH | `/api/hazop/nodes/:id` | ✅ | None | Update node |
| 14 | DELETE | `/api/hazop/nodes/:id` | ✅ | None | Delete node |
| 15 | GET | `/api/hazop/nodes/:nodeId/steps` | ✅ | None | List steps for node |
| 16 | POST | `/api/hazop/nodes/:nodeId/steps` | ✅ | None | Create step |
| 17 | PATCH | `/api/hazop/steps/:id` | ✅ | None | Update step |
| 18 | DELETE | `/api/hazop/steps/:id` | ✅ | None | Delete step |

---

## Phase 3 Routes — Generation Engine & Worksheet (~15 routes)

| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 19 | POST | `/api/hazop/nodes/:nodeId/generate` | ✅ | None | Run HAZOP generation engine for node |
| 20 | GET | `/api/hazop/nodes/:nodeId/deviations` | ✅ | None | List deviations |
| 21 | POST | `/api/hazop/nodes/:nodeId/deviations` | ✅ | None | Add deviation |
| 22 | PATCH | `/api/hazop/deviations/:id` | ✅ | None | Update deviation |
| 23 | DELETE | `/api/hazop/deviations/:id` | ✅ | None | Delete deviation |
| 24 | GET | `/api/hazop/deviations/:devId/causes` | ✅ | None | List causes |
| 25 | POST | `/api/hazop/deviations/:devId/causes` | ✅ | None | Add cause |
| 26 | PATCH | `/api/hazop/causes/:id` | ✅ | None | Update cause |
| 27 | DELETE | `/api/hazop/causes/:id` | ✅ | None | Delete cause |
| 28 | POST | `/api/hazop/deviations/:devId/consequences` | ✅ | None | Add consequence |
| 29 | PATCH | `/api/hazop/consequences/:id` | ✅ | None | Update consequence |
| 30 | DELETE | `/api/hazop/consequences/:id` | ✅ | None | Delete consequence |
| 31 | POST | `/api/hazop/deviations/:devId/safeguards` | ✅ | None | Add safeguard |
| 32 | PATCH | `/api/hazop/safeguards/:id` | ✅ | None | Update safeguard |
| 33 | DELETE | `/api/hazop/safeguards/:id` | ✅ | None | Delete safeguard |
| 34 | POST | `/api/hazop/deviations/:devId/actions` | ✅ | None | Add action |
| 35 | PATCH | `/api/hazop/actions/:id` | ✅ | None | Update action |
| 36 | DELETE | `/api/hazop/actions/:id` | ✅ | None | Delete action |

---

## Phase 4 Routes — Safety Logic, C&E, Interlocks, Alarms, SCE (~35 routes)

### Phase 4A — Event Groups & Response Groups
| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 37 | GET | `/api/hazop/studies/:studyId/event-groups` | ✅ | None | List event groups |
| 38 | POST | `/api/hazop/studies/:studyId/event-groups` | ✅ | None | Create event group |
| 39 | PATCH | `/api/hazop/event-groups/:id` | ✅ | None | Update event group |
| 40 | DELETE | `/api/hazop/event-groups/:id` | ✅ | None | Delete event group |
| 41 | POST | `/api/hazop/event-groups/:id/members` | ✅ | None | Add deviation to event group |
| 42 | DELETE | `/api/hazop/event-groups/:id/members/:deviationId` | ✅ | None | Remove deviation from event group |
| 43 | GET | `/api/hazop/studies/:studyId/response-groups` | ✅ | None | List response groups |
| 44 | POST | `/api/hazop/studies/:studyId/response-groups` | ✅ | None | Create response group |
| 45 | PATCH | `/api/hazop/response-groups/:id` | ✅ | None | Update response group |
| 46 | DELETE | `/api/hazop/response-groups/:id` | ✅ | None | Delete response group |
| 47 | POST | `/api/hazop/response-groups/:id/actions` | ✅ | None | Add action to response group |
| 48 | PATCH | `/api/hazop/response-group-actions/:id` | ✅ | None | Update response group action |
| 49 | DELETE | `/api/hazop/response-group-actions/:id` | ✅ | None | Delete response group action |

### Phase 4B — C&E Matrix v2
| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 50 | GET | `/api/hazop/studies/:studyId/ce-matrices` | ✅ | None | List C&E matrices |
| 51 | POST | `/api/hazop/studies/:studyId/ce-matrices` | ✅ | None | Create C&E matrix |
| 52 | GET | `/api/hazop/ce-matrices/:id` | ✅ | None | Get C&E matrix with rows/columns/cells |
| 53 | POST | `/api/hazop/ce-matrices/:id/extract` | ✅ | None | Auto-extract rows and columns from Phase 4A data |
| 54 | PATCH | `/api/hazop/ce-cells/:rowId/:colId` | ✅ | None | Set/update cell mark |

### Phase 4B — Interlocks
| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 55 | GET | `/api/hazop/studies/:studyId/interlocks` | ✅ | None | List interlocks |
| 56 | POST | `/api/hazop/studies/:studyId/interlocks` | ✅ | None | Create interlock |
| 57 | GET | `/api/hazop/interlocks/:id` | ✅ | None | Get interlock detail |
| 58 | PATCH | `/api/hazop/interlocks/:id` | ✅ | None | Update interlock (detect-and-gate if baselined) |
| 59 | DELETE | `/api/hazop/interlocks/:id` | ✅ | None | Delete interlock |
| 60 | POST | `/api/hazop/interlocks/:id/actions` | ✅ | None | Add interlock action |
| 61 | PATCH | `/api/hazop/interlock-actions/:id` | ✅ | None | Update interlock action |
| 62 | POST | `/api/hazop/interlocks/:id/set-baseline` | ✅ | None | Freeze interlock baseline |

### Phase 4B — Alarm Trips
| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 63 | GET | `/api/hazop/studies/:studyId/alarm-trips` | ✅ | None | List alarm trips |
| 64 | POST | `/api/hazop/studies/:studyId/alarm-trips` | ✅ | None | Create alarm trip |
| 65 | GET | `/api/hazop/alarm-trips/:id` | ✅ | None | Get alarm trip detail |
| 66 | PATCH | `/api/hazop/alarm-trips/:id` | ✅ | None | Update alarm trip |
| 67 | DELETE | `/api/hazop/alarm-trips/:id` | ✅ | None | Delete alarm trip |
| 68 | POST | `/api/hazop/alarm-trips/:id/set-baseline` | ✅ | None | Freeze alarm trip baseline |

### Phase 4B — SCE & Safety Functions
| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 69 | GET | `/api/hazop/studies/:studyId/sce` | ✅ | None | List SCEs |
| 70 | POST | `/api/hazop/studies/:studyId/sce` | ✅ | None | Create SCE |
| 71 | PATCH | `/api/hazop/sce/:id` | ✅ | None | Update SCE |
| 72 | DELETE | `/api/hazop/sce/:id` | ✅ | None | Delete SCE |
| 73 | GET | `/api/hazop/studies/:studyId/safety-functions` | ✅ | None | List SIFs |
| 74 | POST | `/api/hazop/studies/:studyId/safety-functions` | ✅ | None | Create SIF |
| 75 | PATCH | `/api/hazop/safety-functions/:id` | ✅ | None | Update SIF |

---

## Phase 5A Routes — LOPA & IPL Stack (~10 routes)

| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 76 | GET | `/api/hazop/studies/:studyId/lopa` | ✅ | None | List LOPA records (+ is_countersigned — augmented 5D) |
| 77 | POST | `/api/hazop/studies/:studyId/lopa` | ✅ | None | Create LOPA record |
| 78 | GET | `/api/hazop/lopa/:id` | ✅ | None | Get LOPA detail (+ baseline_approval — augmented 5D) |
| 79 | PATCH | `/api/hazop/lopa/:id` | ✅ | None | Update LOPA (detect-and-gate if baselined) |
| 80 | DELETE | `/api/hazop/lopa/:id` | ✅ | None | Delete LOPA |
| 81 | POST | `/api/hazop/lopa/:id/recalculate` | ✅ | None | Rerun LOPA arithmetic engine |
| 82 | POST | `/api/hazop/lopa/:id/set-baseline` | ✅ | None | Freeze LOPA (fixed in 5D: now writes approved_by + approved_at) |
| 83 | GET | `/api/hazop/lopa/:id/ipl-stack` | ✅ | None | Get IPL stack items |
| 84 | POST | `/api/hazop/lopa/:id/ipl-stack` | ✅ | None | Add IPL stack item |
| 85 | DELETE | `/api/hazop/lopa/:lopaId/ipl-stack/:itemId` | ✅ | None | Remove IPL stack item |

---

## Phase 5B Routes — SRS (~6 routes)

| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 86 | GET | `/api/hazop/studies/:studyId/srs` | ✅ | None | List SRS records (+ is_countersigned — augmented 5D) |
| 87 | POST | `/api/hazop/studies/:studyId/srs` | ✅ | None | Create SRS record |
| 88 | GET | `/api/hazop/srs/:id` | ✅ | None | Get SRS detail (+ baseline_approval — augmented 5D) |
| 89 | PATCH | `/api/hazop/srs/:id` | ✅ | None | Update SRS (detect-and-gate if baselined) |
| 90 | POST | `/api/hazop/srs/:id/set-baseline` | ✅ | None | Freeze SRS baseline |
| 91 | POST | `/api/hazop/srs/:id/extract` | ✅ | None | Auto-extract SRS fields from linked SIF |

---

## Phase 5C Routes — MOC & Mark-Reviewed (12 routes)

| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 92 | GET | `/api/hazop/studies/:studyId/moc` | ✅ | None | List MOC records |
| 93 | POST | `/api/hazop/studies/:studyId/moc` | ✅ | None | Raise new MOC |
| 94 | GET | `/api/hazop/moc/:id` | ✅ | None | Get MOC detail |
| 95 | PATCH | `/api/hazop/moc/:id` | ✅ | None | Update open MOC (409 if approved/closed) |
| 96 | DELETE | `/api/hazop/moc/:id` | ✅ | None | Delete open MOC (409 otherwise) |
| 97 | POST | `/api/hazop/moc/:id/approve` | ✅ | Superuser / GM / SM | Approve MOC; self-approval blocked (422); safety_impact_assessment required |
| 98 | POST | `/api/hazop/moc/:id/reject` | ✅ | Superuser / GM / SM | Reject MOC; rejection_reason required (422 if missing) |
| 99 | POST | `/api/hazop/moc/:id/close` | ✅ | None | Close approved MOC; captures baseline_after |
| 100 | POST | `/api/hazop/lopa/:id/mark-reviewed` | ✅ | None | Clear requires_review on LOPA |
| 101 | POST | `/api/hazop/srs/:id/mark-reviewed` | ✅ | None | Clear requires_review on SRS |
| 102 | POST | `/api/hazop/interlocks/:id/mark-reviewed` | ✅ | None | Clear requires_review on interlock |
| 103 | POST | `/api/hazop/alarm-trips/:id/mark-reviewed` | ✅ | None | Clear requires_review on alarm-trip |

---

## Phase 5D Routes — Countersigned Baseline Approval (4 new routes)

| # | Method | Path | Auth | Role Gate | Purpose |
|---|--------|------|------|-----------|---------|
| 104 | POST | `/api/hazop/lopa/:id/countersign` | ✅ | Superuser / GM / SM | Countersign LOPA baseline; 7-gate validation; writes HMAC token |
| 105 | POST | `/api/hazop/srs/:id/countersign` | ✅ | Superuser / GM / SM | Countersign SRS baseline; same 7-gate logic |
| 106 | GET | `/api/hazop/studies/:studyId/baseline-approvals` | ✅ | None | Study-level approval register |
| 107 | POST | `/api/hazop/baseline-approvals/:approvalId/verify` | ✅ | None | HMAC token integrity check; returns {valid: true/false} |

### Phase 5D Gate Logic (Routes 104 & 105)
| Gate | Condition | Response |
|------|-----------|----------|
| 1 | `approval_discipline` missing or invalid | 422 |
| 2 | Artefact not found | 404 |
| 3 | Artefact not in approved/baselined state | 422 |
| 4 | `approved_by` is null (legacy record, re-baseline required) | 422 |
| 5 | Countersigner is same user as `approved_by` | 422 (self-countersign blocked) |
| 6 | Countersigner role not in Superuser/GM/SM | 403 |
| 7 | Row already exists in `hazop_baseline_approvals` for this (artefact_type, artefact_id, baseline_revision) | 409 |

---

## Route Count Summary

| Phase | Routes Added | Cumulative |
|-------|-------------|------------|
| Phase 1 | 6 | 6 |
| Phase 2 | ~12 | ~18 |
| Phase 3 | ~18 | ~36 |
| Phase 4 | ~35 | ~71 |
| Phase 5A | ~10 | ~81 |
| Phase 5B | ~6 | ~87 |
| Phase 5C | 12 | ~99 |
| Phase 5D | 4 new + 2 augmented | ~103 |
