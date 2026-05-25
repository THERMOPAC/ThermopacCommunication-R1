# HAZOP Module — Pending Items Register
**Compiled:** 2026-05-25  
**Status:** Read-only audit — all items are open/deferred, none are resolved here  

---

## ITEM-001 — Phase 5D ZTC Formal Run (BLOCKING for Phase 5D closure)

| Attribute | Detail |
|-----------|--------|
| **ID** | ITEM-001 |
| **Priority** | HIGH — blocks Phase 5D formal closure |
| **Type** | UAT / Verification |
| **Phase** | 5D |
| **Status** | PENDING |
| **Owner** | Product Owner / QA |

### Description
Phase 5D implementation (Countersigned Baseline Approval) is code-complete as of 2026-05-25. The HMAC utility, 4 new routes, LOPA set-baseline fix, list/detail GET augmentations, and all UI changes are in place. However, the 23-item ZTC checklist (ZTC-501–ZTC-523) has not yet been formally executed and evidenced.

Per `docs/operating-protocol-v1.0.md`, a phase cannot be declared closed until all ZTC checks have been run, evidenced, and countersigned. Phase 5E cannot begin until Phase 5D is formally closed.

### Open ZTC Checks
| ID | Check | Evidence Required |
|----|-------|------------------|
| ZTC-501 | `hazop_baseline_approvals` — 13 columns verified | `\d hazop_baseline_approvals` psql output |
| ZTC-502 | UNIQUE constraint present | psql index listing |
| ZTC-503 | LOPA countersign → 401 unauthenticated | curl result |
| ZTC-504 | SRS countersign → 401 unauthenticated | curl result |
| ZTC-505 | Non-approved LOPA → 422 | functional test |
| ZTC-506 | Non-approved SRS → 422 | functional test |
| ZTC-507 | Self-countersign → 422 | functional test |
| ZTC-508 | Insufficient role → 403 | functional test |
| ZTC-509 | Duplicate countersign → 409 | functional test |
| ZTC-510 | HMAC canonical string: 7 fields, pipe separator, correct order | code inspection |
| ZTC-511 | `SESSION_SECRET` key + `timingSafeEqual` | code inspection |
| ZTC-512 | Verify route: valid token → `{valid: true}` | functional test |
| ZTC-513 | Verify route: tampered token → `{valid: false}` | SQL tamper + verify call |
| ZTC-514 | set-baseline writes `approved_by` + `approved_at` | row inspection |
| ZTC-515 | LOPA detail GET includes `baseline_approval` object | response inspection |
| ZTC-516 | SRS detail GET includes `baseline_approval` object | response inspection |
| ZTC-517 | No CHECK constraints modified on existing tables | `\d` inspection |
| ZTC-518 | No columns removed or renamed | schema diff |
| ZTC-519 | TypeScript zero errors (Vite HMR zero errors acceptable) | Vite console |
| ZTC-520 | HAZOP table count = 37 | SQL COUNT |
| ZTC-521 | `approval_discipline` with correct CHECK | `\d hazop_baseline_approvals` |
| ZTC-522 | Missing discipline → 422 (Gate 1 fires first) | functional test with empty body |
| ZTC-523 | `baseline_approval` response has all 5 display fields | response inspection |

### Resolution Path
1. Run `uat-master-test-plan.md` Section I (I-01 through I-19)
2. Capture all 12 required screenshots (S-06 through S-12)
3. Update `hazop-phase5d-delivery-plan-v1.1.md` status to CLOSED
4. Record closure date in `master-index.md`

---

## ITEM-002 — Phase 5E: AI Safeguard Ranking Engine (NOT STARTED)

| Attribute | Detail |
|-----------|--------|
| **ID** | ITEM-002 |
| **Priority** | MEDIUM — next phase after 5D closure |
| **Type** | New feature — not yet planned |
| **Phase** | 5E |
| **Status** | NOT STARTED — no delivery plan document exists |
| **Owner** | Product Owner (to approve scope) |
| **Blocked by** | ITEM-001 (Phase 5D must be formally closed first) |

### Description
Phase 5E (AI Safeguard Ranking Engine) is defined at a high level in `docs/hazop-phase5-execution-plan-v1.0.md` §8. No delivery plan document exists. No tasks have been created.

### Defined Scope (from Phase 5 parent plan §8 + §13)
| Sub-task | Description |
|----------|-------------|
| T5E-001 | AI ranking engine: prompt design, OpenAI API call, JSONB storage in `hazop_ai_rankings.ranked_items` |
| T5E-002 | Routes: POST `/api/hazop/studies/:studyId/ai-rank`, GET `/api/hazop/ai-rankings/:id`, POST `…/review` |
| T5E-003 | UI: AI Ranking page — ranked safeguard list, review outcome, apply suggestions button |

### Constraints (binding — from Phase 5 parent plan §12.7)
- OpenAI integration already installed (`javascript_openai==1.0.0`) — no new integration needed
- AI output stored in JSONB only — never raw text
- `reviewed_by` and `review_outcome` required before AI suggestions can be applied
- `prompt_version` field required for regression testing
- AI ranking routes require Superuser or HAZOP module permission

### Resolution Path
1. Formally close Phase 5D (ITEM-001)
2. Write `docs/hazop-phase5e-delivery-plan-v1.0.md`
3. Get product owner approval before implementation begins

---

## ITEM-003 — HAZOP-TD-001: Legacy CE Cell Normalization (DEFERRED TECH DEBT)

| Attribute | Detail |
|-----------|--------|
| **ID** | ITEM-003 / HAZOP-TD-001 |
| **Priority** | LOW — no runtime blocker |
| **Type** | Technical debt |
| **Phase** | Phase 4B (accepted at closure) |
| **Status** | DEFERRED — accepted, no timeline |
| **Owner** | Engineering / QMS Platform |

### Description
The `hazop_ce_cells` table carries legacy NOT NULL foreign key constraints to `hazop_ce_causes` and `hazop_ce_effects` (Phase 1 v1.0 C&E schema). Phase 4B redesigned the C&E matrix around new tables (`hazop_ce_matrices`, `hazop_ce_rows`, `hazop_ce_columns`) but could not drop the legacy constraints without a destructive migration (prohibited by additive-only policy).

### Risk
Any future attempt to drop the legacy tables `hazop_ce_causes` and `hazop_ce_effects` will fail due to the NOT NULL FK in `hazop_ce_cells`. This is a future migration risk, not a current runtime issue.

### Resolution Path (when ready)
```sql
ALTER TABLE hazop_ce_cells ALTER COLUMN cause_id DROP NOT NULL;
ALTER TABLE hazop_ce_cells ALTER COLUMN effect_id DROP NOT NULL;
-- Then: DROP TABLE hazop_ce_causes CASCADE;
--       DROP TABLE hazop_ce_effects CASCADE;
```
Must be preceded by verifying that no application code reads from `hazop_ce_causes` or `hazop_ce_effects`.

---

## ITEM-004 — Full Integrated UAT (Cross-Phase) Not Yet Run

| Attribute | Detail |
|-----------|--------|
| **ID** | ITEM-004 |
| **Priority** | HIGH — required before production deployment |
| **Type** | Integrated UAT |
| **Phase** | Phase 1–5D (full module) |
| **Status** | PENDING |
| **Owner** | Product Owner |

### Description
Individual phase ZTA/ZTC checks have been run per phase. However, a full integrated end-to-end UAT run — starting from study creation through to countersigned baseline approval — has not been formally evidenced in a single test session. This integrated run is required before the HAZOP module can be considered production-ready.

### Scope
The full test sequence is defined in `uat-master-test-plan.md` (Sections A through J).  
Estimated effort: 4–6 hours for a thorough run with screenshots.

### Prerequisites
- Phase 5D ZTC run complete (ITEM-001)
- A live study with data across all phases (study → loops → nodes → deviations → event groups → response groups → C&E → interlocks → alarm-trips → SCE → scenarios → LOPA → SRS → MOC → countersigned approval)
- Two user accounts: one Superuser (sets baselines), one GM or SM (countersigns)

### Resolution Path
1. Complete ITEM-001 (Phase 5D ZTC)
2. Schedule UAT session with product owner
3. Run `uat-master-test-plan.md` Sections A–J in sequence
4. Capture all 12 required screenshots (S-01 through S-12)
5. Record as "Integrated UAT — PASS" in `master-index.md`

---

## ITEM-005 — Stale Status Headers on 6 Active Documents

| Attribute | Detail |
|-----------|--------|
| **ID** | ITEM-005 |
| **Priority** | LOW — cosmetic only, no operational impact |
| **Type** | Documentation hygiene |
| **Phase** | Various |
| **Status** | OPEN |
| **Owner** | QMS Agent |

### Description
Six active plan documents have status header fields that were never updated after their phase closed. This creates confusion when reading the documents in isolation.

| Document | Current Status Field | Should Read |
|----------|---------------------|-------------|
| `hazop-phase1-execution-plan-v1.0.md` | AWAITING APPROVAL | CLOSED 2026-05-24 |
| `hazop-phase2-execution-plan-v2.0.md` | AWAITING APPROVAL | CLOSED 2026-05-25 |
| `hazop-phase3-execution-plan-v1.0.md` | AWAITING APPROVAL | CLOSED 2026-05-25 |
| `hazop-phase3a-deviation-library-plan-v1.0.md` | AWAITING APPROVAL | CLOSED 2026-05-25 |
| `hazop-phase4-execution-plan-v1.3.md` | SUBMITTED FOR FINAL APPROVAL | CLOSED 2026-05-25 (UAT-4B-ACCEPTED) |
| `hazop-phase5a-hardening-v1.1.md` | IN PROGRESS | CLOSED 2026-05-25 (ZTA-5A-v1.1-CLOSED) |
| `hazop-phase5b-delivery-plan-v1.0.md` | DRAFT — Awaiting review | CLOSED 2026-05-25 |

### Resolution Path
Update the **Status:** header line in each of the 7 documents above to reflect their actual closed state. This is a documentation-only change with zero application impact.

---

## Pending Items Summary

| ID | Item | Priority | Blocking | Resolution Owner |
|----|------|----------|----------|-----------------|
| ITEM-001 | Phase 5D ZTC-501–523 formal run | HIGH | Phase 5D closure; Phase 5E start | QA / Product Owner |
| ITEM-002 | Phase 5E delivery plan + implementation | MEDIUM | Blocked by ITEM-001 | Product Owner (approve) → QMS Agent (build) |
| ITEM-003 | HAZOP-TD-001 legacy CE cell tech debt | LOW | Nothing currently | Engineering (future phase) |
| ITEM-004 | Full integrated UAT (cross-phase) | HIGH | Production deployment | Product Owner |
| ITEM-005 | Stale status headers on 6 plan docs | LOW | Nothing | QMS Agent |
