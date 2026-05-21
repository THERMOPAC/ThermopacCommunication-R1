# OI Phase 1B — Zero-Trust Audit

**Status:** IN PROGRESS — Pre-Implementation
**Date:** 21-May-2026
**Auditor:** Implementation Agent
**Reference:** `docs/operational-intelligence-phase1b-execution.md` §13
**Phase 1A ZT Audit:** `docs/operational-intelligence-phase1a-zero-trust-audit.md` (COMPLETE)

---

## Summary

Phase 1A established 13 zero-trust rules — all remain active and unchanged in Phase 1B.
Phase 1B adds 10 new zero-trust rules covering computed fields, role enforcement, and FK integrity.

| Phase 1A rules | Status |
|---|---|
| 13 / 13 | Inherited — not relaxed, not removed |

| Phase 1B new rules | Implemented | Test-Verified |
|---|---|---|
| 10 | PENDING | PENDING |

---

## Phase 1A Rules — Inheritance Confirmation

All 13 Phase 1A zero-trust rules remain enforced without modification.
See `docs/operational-intelligence-phase1a-zero-trust-audit.md` for detail.

Specific confirmation that Phase 1B does NOT relax:
- ZT-01: `issue_number` still server-generated — Phase 1B adds no client path to override it
- ZT-02: `status` still defaults to `captured` on create — no change
- ZT-03: `reported_by` still from `req.user.id` — no change
- ZT-08: `oi_risk_score` still excluded from client PATCH schema — Phase 1B only changes _source_ of computation (stored dimension scores instead of transient body values); client cannot set it directly

---

## Phase 1B Zero-Trust Rules

### PB-ZT-01 — `net_financial_exposure` Cannot Be Set by Client

**Rule:** `net_financial_exposure` is a derived field. Client cannot set it directly, even with a valid SM+ session.

**Required Implementation:**
- `net_financial_exposure` absent from all Zod PATCH schemas
- Computed in handler: `actualLossAmount − COALESCE(recoveryAmount, 0)`, floor 0.00
- Recomputed whenever `actual_loss_amount` or `recovery_amount` changes
- `insertOiIssueSchema.omit({ netFinancialExposure: true })`

**Verification:** PATCH with `{"netFinancialExposure":"999999"}` → value in DB must be server-computed, not 999999.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-02 — Time Intelligence Fields Cannot Be Set by Client

**Rule:** `capture_delay_hours`, `response_time_actual_hours`, `investigation_duration_hours`, `total_resolution_hours` are all computed at specific lifecycle events. Client cannot set any of them.

**Required Implementation:**
- All 4 fields absent from all Zod PATCH schemas
- `captureDelayHours` computed in `POST /api/oi/issues` handler from `createdAt − detectedAt`
- `responseTimeActualHours` computed in transition handler at `classified → investigating`
- `investigationDurationHours` computed in transition handler at `investigating → verified`
- `totalResolutionHours` computed in transition handler at `verified → closed`
- All 4 fields in `insertOiIssueSchema.omit()`

**Verification:** PATCH with `{"captureDelayHours":"0.01"}` → DB value unchanged. Create issue with `detectedAt` set 2 hours ago → `captureDelayHours ≈ 2.00`.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-03 — `oi_risk_score` Computed from Stored Dimension Scores (Enhanced)

**Rule:** Phase 1B changes `oi_risk_score` computation source from transient PATCH body values to stored dimension score columns. Client still cannot set `oi_risk_score` directly.

**Required Implementation:**
- `oi_risk_score` remains absent from all Zod schemas (inherited from Phase 1A)
- `computeOiRiskScore()` updated to read stored dimension columns from the current issue + updates dict
- Returns NULL if all 9 dimension score columns are NULL
- Triggered whenever any of the 9 dimension score columns changes in PATCH

**Verification:** PATCH `safetyScore=8` → `oi_risk_score` recomputed and stored. PATCH `oi_risk_score=999` → ignored.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-04 — FK Existence Validated Server-Side Before Storing

**Rule:** Linkage FK fields (`customer_id`, `vendor_id`, `epc_drawing_control_id`, `epc_po_id`, `epc_wo_id`, `inspection_order_id`, `fat_inspection_order_id`, `sat_inspection_order_id`, `contract_id`) must reference records that exist in their respective tables. PostgreSQL FK constraints enforce this at the DB level as the primary defence. Application layer validates and returns a descriptive 400/422 rather than relying on raw Postgres FK violation errors.

**Required Implementation:**
- FK constraints defined on all 9 columns (enforced by `ALTER TABLE … REFERENCES`)
- Application layer: for each linkage field in PATCH body, `SELECT id FROM <target_table> WHERE id = $1` before insert; return 422 `linked_record_not_found` if absent
- `ON DELETE SET NULL` on all FK columns ensures referential integrity on parent deletion

**Verification:** PATCH `epcPoId` with an ID that does not exist in `epc_purchase_orders` → expect 422 `linked_record_not_found`. DB FK constraint provides backup enforcement.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-05 — Financial/Liability Fields Restricted to SM+ Server-Side

**Rule:** `actual_loss_amount`, `insurance_claim_flag`, `claim_reference`, `recovery_amount`, `liability_type`, `indemnity_required`, `warranty_claim_flag`, `warranty_claim_reference` can only be patched by Senior Manager, General Manager, or Superuser. Manager and below receive 403.

**Required Implementation:**
- Financial/liability fields in a separate `ALLOWED_SM_FIELDS` set in PATCH handler
- Check: `if (financialFieldsPresent && !hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" })`
- Role check at handler level, not frontend guard

**Verification:** Manager session → PATCH `actualLossAmount="1000"` → must return 403.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-06 — Linkage Fields Restricted to Manager+ Server-Side

**Rule:** All 9 linkage FK fields and all 9 dimension score fields can only be patched by Manager, Senior Manager, General Manager, or Superuser. Employee and Senior Executive receive 403.

**Required Implementation:**
- Linkage and dimension score fields in `ALLOWED_MANAGER_FIELDS` set
- Check: `if (managerFieldsPresent && !hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" })`

**Verification:** Employee session → PATCH `customerId=1` → must return 403.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-07 — `customer_id` Auto-Population Cannot Override Explicit Client Value

**Rule:** When `project_id` is supplied at issue creation and `customer_id` is not, the server auto-populates `customer_id` from `projects.customer_id`. However, if the client explicitly supplies `customer_id`, that value takes precedence and auto-population does not run.

**Required Implementation:**
```typescript
if (body.projectId && body.customerId == null) {
  // auto-populate from project
} else {
  // use client value (including explicit null to clear)
}
```
Auto-population cannot be exploited to bypass a client-supplied null (explicit null is treated as "intentionally unlinked").

**Verification:** POST with `projectId=X, customerId=null` (explicit null) → `customer_id` in DB must be null, not auto-populated from project.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-08 — `liability_type` Validated Against Allowed Enum Server-Side

**Rule:** `liability_type` is stored as TEXT (not a DB enum) but must be validated against an explicit allowlist server-side. No arbitrary string accepted.

**Required Implementation:**
```typescript
liabilityType: z.enum(['warranty','indemnity','third_party','regulatory','internal','none']).nullable().optional()
```
Invalid values return 400 with Zod validation error.

**Verification:** PATCH `liabilityType="hack_attempt"` → must return 400.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-09 — All New Field Changes Write Audit Log Before Response

**Rule:** Every new Phase 1B field that can be patched must produce a `field_updated` audit log entry. Computed fields must also produce audit entries when their value changes (written by the handler that computed them).

**Required Implementation:**
- PATCH handler: for each changed field, call `writeAuditLog({ action: 'field_updated', fieldName, oldValue, newValue })` before `res.json()`
- Computed field changes (`net_financial_exposure`, `oi_risk_score`, time intelligence) also write audit entries
- Transition handler: time intelligence fields write audit entries when computed

**Verification:** PATCH `customerId=5` → `GET /api/oi/issues/:id/audit` must show `field_updated` entry for `customer_id`.

**Status:** PENDING IMPLEMENTATION

---

### PB-ZT-10 — Lookup Endpoints Are Read-Only and Auth-Gated

**Rule:** The 4 new lookup endpoints (`/api/oi/lookup/drawings`, `/api/oi/lookup/epc-pos`, `/api/oi/lookup/epc-wos`, `/api/oi/lookup/inspection-orders`) are SELECT-only. No mutation. All gated by `ensureAuthenticated` (inherited from `app.use('/api/oi', ensureAuthenticated, oiRouter)`).

**Required Implementation:**
- All 4 endpoints are GET-only with no body parsing
- No INSERT, UPDATE, or DELETE in any lookup handler
- Role gate: Manager+ (Employee cannot use these to discover sensitive data)

**Verification:** Unauthenticated GET `/api/oi/lookup/drawings` → 401. Employee GET → 403.

**Status:** PENDING IMPLEMENTATION

---

## Test Evidence Matrix

| ZT ID | Rule | Phase | Code Status | Test Status |
|---|---|---|---|---|
| ZT-01 | `issue_number` server-generated | 1A | Verified | Complete |
| ZT-02 | `status` defaults to `captured` | 1A | Verified | Complete |
| ZT-03 | `reported_by` from session | 1A | Verified | Complete |
| ZT-04 | Role check in handler | 1A | Verified | Complete |
| ZT-05 | Transition map enforced | 1A | Verified | Complete |
| ZT-06 | Audit log before response | 1A | Verified | Complete |
| ZT-07 | SLA dates immutable | 1A | Verified | Complete |
| ZT-08 | Risk score server-side | 1A | Verified | Complete |
| ZT-09 | Withdraw: Superuser + reason | 1A | Verified | Complete |
| ZT-10 | Audit log append-only | 1A | Verified | Complete |
| ZT-11 | S1/S2 blocked past investigating | 1A | Verified | Complete |
| ZT-12 | Config: Superuser only | 1A | Verified | Complete |
| ZT-13 | UTC storage, IST display | 1A | Verified | Complete |
| PB-ZT-01 | `net_financial_exposure` server-computed | 1B | PENDING | PENDING |
| PB-ZT-02 | Time intelligence server-computed | 1B | PENDING | PENDING |
| PB-ZT-03 | `oi_risk_score` from stored dimensions | 1B | PENDING | PENDING |
| PB-ZT-04 | FK existence validated server-side | 1B | PENDING | PENDING |
| PB-ZT-05 | Financial/liability: SM+ only | 1B | PENDING | PENDING |
| PB-ZT-06 | Linkage/scores: Manager+ only | 1B | PENDING | PENDING |
| PB-ZT-07 | `customer_id` auto-pop not overridable | 1B | PENDING | PENDING |
| PB-ZT-08 | `liability_type` enum validation | 1B | PENDING | PENDING |
| PB-ZT-09 | All new field changes audited | 1B | PENDING | PENDING |
| PB-ZT-10 | Lookup endpoints: read-only + auth-gated | 1B | PENDING | PENDING |

---

## Sign-Off

| Role | Name | Date | Decision |
|---|---|---|---|
| Implementer | Agent | 21-May-2026 | Submitted for review |
| Technical Reviewer | — | — | PENDING |
| GM / Superuser | — | — | PENDING |

---

## Conditions for Phase 1C Go-Ahead

1. All 10 Phase 1B ZT rules verified by code inspection and automated/manual test.
2. Build validation: `npm run build` exits 0.
3. Auth gate: all new endpoints return 401 unauthenticated.
4. No future-phase logic (RCA, CAPA, SOP, ERP enforcement, AI) present in Phase 1B code.
5. GM/Superuser sign-off on this document.
