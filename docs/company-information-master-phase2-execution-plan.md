# Company Information Master — Phase 2 Execution Plan

**Status**: EXECUTION PLANNING — DO NOT IMPLEMENT
**Created**: 2026-05-20
**Phase 2 Baseline Reference**: `docs/company-information-master-phase2-baseline.md`
**Phase 1 Closure Reference**: `docs/company-information-master-phase1-closure.md`

This document converts the approved Phase 2 baseline into a deployable, rollback-safe
production execution plan organised into 7 waves. No implementation may begin until
this plan is reviewed, approved, and each wave receives an explicit start authorisation.

---

## 1. Executive Summary

### 1.1 Phase 2 Objectives

Phase 2 promotes the Company Information Master from a passive data store (Phase 1) into
the live identity spine of the THERMOPAC ERP. At completion:

- All PDF generators, email templates, and SAP payloads read company identity from
  `company_master` — no hardcoded strings remain in production code
- A multi-company session architecture enables subsidiary/JV operations without a
  separate deployment
- Sensitive legal/tax/banking field changes are gated by a maker-checker approval
  workflow with an immutable audit trail
- Company data changes propagate to open browser sessions in real time via WebSocket
- A cache layer protects the database from company-record read stampedes
- Branding asset quality is enforced at upload time; orphaned GCS objects are
  automatically cleaned up
- SAP Service Layer calls are routed by company context, preserving existing
  credential governance

### 1.2 Production Impact Areas

| Area | Impact Level | Waves |
|---|---|---|
| Salary slip generation | CRITICAL | Wave 1 (E-block, feature-flagged) |
| Offer PDF generation | CRITICAL | Wave 1 (E-block, feature-flagged) |
| GCS path construction (document-path-resolver) | HIGH | Wave 1 (C-block) |
| SAP integration routing | HIGH | Wave 7 |
| Legal/tax DB writes | HIGH | Wave 3 |
| Branding asset uploads | MEDIUM | Wave 6 |
| EPC / procurement documents | MEDIUM | Wave 1 (B/C-blocks) |
| UI session management | MEDIUM | Wave 2 |
| GCS orphan cleanup | LOW | Wave 6 |
| Notifications | LOW | Wave 4 |

### 1.3 High-Risk Modules

1. **salary-slip-generator.ts** — legally binding payroll document; wrong identity = compliance failure
2. **offer-pdf-generator.ts** — customer-facing commercial document; wrong identity = contractual risk
3. **document-path-resolver.ts** — GCS paths are immutable once written; wrong company_code = data in wrong GCS subtree
4. **SAP Session Pool** — wrong company routing = data written to wrong SAP company database

### 1.4 Deployment Philosophy

- **Wave-first**: each wave is a self-contained, independently deployable unit
- **Backward-compatible**: every wave must be rollback-safe without data loss or migration reversal
- **Feature-flag gated**: all high-risk callsite migrations run behind `FF_COMPANY_LIVE_*` flags
- **Dark-launch first**: high-risk features are deployed disabled and tested in shadow mode before activation
- **No big-bang deployments**: no wave combines schema changes with high-risk callsite migrations

### 1.5 Rollback-First Governance

Before any wave is marked complete, a rollback dry-run is performed:
- Rollback sequence executed in a staging environment
- Rollback validation checklist signed off
- Only then does wave proceed to production acceptance

**No wave may begin without the previous wave's rollback checkpoint confirmed.**

---

## 2. Deployment Strategy

### 2.1 Wave-Based Deployment

```
Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave 6 → Wave 7
  ↑ each wave gated by: rollback checkpoint + UAT signoff + explicit start auth
```

Waves 5 and 6 are parallel-safe (no cross-dependency) and may be developed concurrently,
but each must be deployed sequentially after Wave 4 completes.

### 2.2 Backward Compatibility Requirements

| Requirement | Rule |
|---|---|
| Existing Phase 1 API contracts | All Phase 1 routes must return identical response shapes throughout Phase 2 |
| DB column additions | `ADD COLUMN` only — no column renames, type changes, or drops in Phase 2 |
| GCS path formats | Existing GCS paths must never be modified; new paths follow same format |
| Session schema | `req.session.activeCompanyId` addition is additive; existing session keys untouched |
| Role behaviour | Existing role guards remain active; Phase 2 adds additional guards, never removes |
| Seed data | Company seed rows (TPEL id=1) are never modified by migration scripts |

### 2.3 Freeze Rules

- **Code freeze per wave**: no new feature commits to affected files during wave rollout
- **DB freeze**: no manual DB alterations during active wave deployment
- **Feature flag freeze**: flag states locked 24 hours before production wave start
- **Hotfix exception**: critical security patches bypass wave freeze; all other changes wait

### 2.4 Feature Flag Strategy

All feature flags are environment variables (`process.env.*`), not DB-stored settings.
This ensures flags can be toggled without a DB migration or server restart in production
(environment variable hot-reload or pod restart only).

| Flag | Default | Scope |
|---|---|---|
| `FF_COMPANY_LIVE_PDF` | `false` | Controls CS-01 + CS-02 PDF callsite activation |
| `FF_COMPANY_CONTEXT_MIDDLEWARE` | `false` | Controls session-level active company middleware |
| `FF_COMPANY_SWITCHER` | `false` | Controls multi-company switcher UI visibility |
| `FF_COMPANY_APPROVAL_WORKFLOW` | `false` | Controls maker-checker routes and UI |
| `FF_COMPANY_EVENT_BUS` | `false` | Controls EventBus subscriber activation |
| `FF_COMPANY_CACHE` | `false` | Controls cache layer activation |
| `FF_COMPANY_BRANDING_VALIDATION` | `false` | Controls dimension/quality validation at upload |
| `FF_COMPANY_ORPHAN_CLEANUP` | `false` | Controls orphan cleanup scheduler |
| `FF_COMPANY_SAP_ROUTING` | `false` | Controls per-company SAP session routing |
| `FF_COMPANY_WEBSOCKET_REFRESH` | `false` | Controls WebSocket invalidation signals |

### 2.5 Dark-Launch Strategy

Dark-launch applies to Waves 1E (PDF callsites) and Wave 7 (SAP routing):

1. Deploy code with flag `false` — new code path exists but is unreachable
2. Enable flag in **staging** environment; run full validation suite
3. Enable flag for a **single test user** in production; monitor for 48 hours
4. If stable: enable for all users in production
5. Monitor for 30 days before removing fallback constants (Wave 7: no removal of SAP fallback)

---

## 3. Execution Waves

---

### Wave 1: Hardcoded Callsite Migration

**Objective**: Replace all 7 confirmed hardcoded company callsites with live DB reads.

**Dependencies**: Phase 1 complete (company_master data in DB) ✓

#### 3.1.1 DB Changes

```sql
-- Phase 2 contact fields added to company_master (required for CS-01, CS-02)
ALTER TABLE company_master
  ADD COLUMN IF NOT EXISTS phone       VARCHAR(60),
  ADD COLUMN IF NOT EXISTS fax         VARCHAR(60),
  ADD COLUMN IF NOT EXISTS email       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Seed TPEL contact data after column addition
UPDATE company_master SET
  phone = '+91 22 2617 8080 to 84',
  fax   = '+91 22 2617 8084',
  email = 'sales@thermopac.in',
  description = 'Thermopac is building the Re-refining plants and equipment since 1986...'
WHERE company_code = 'TPEL' AND phone IS NULL;
```

#### 3.1.2 API Changes

- No new routes — existing `GET /api/company/active` already returns the full payload
- Add `phone`, `fax`, `email`, `description` to `GET /api/company/active` response
- `getActiveCompany()` server helper function added to `server/utils/company-context.ts`

#### 3.1.3 Frontend Changes

- `useActiveCompany()` hook added to `client/src/hooks/use-active-company.ts`
- Wraps `GET /api/company/active`, `staleTime: 5 * 60 * 1000` (5 min)
- Used by `buy-datasheet-dialog.tsx` (CS-05)

#### 3.1.4 Callsite Migration Blocks

**Block B** (LOW risk — non-customer-facing, no flag required):
- CS-04: `server/advance-tax-routes.ts` line 91
- CS-06: `server/utils/pppc-services.ts` line 997
- CS-07: `server/utils/drawing-report-template.ts` lines 209, 331

**Block C** (MEDIUM risk — GCS path prefix, requires regression suite):
- CS-03: `server/services/document-path-resolver.ts` line 197
- Requires: GCS path regression test (assert paths begin with correct company_code)
- Requires: Server-startup guard (abort if company_master is empty)

**Block D** (LOW risk — internal document, hook-based):
- CS-05: `client/src/components/buy-datasheet-dialog.tsx` lines 69, 143

**Block E** (HIGH risk — feature-flagged, dark-launch):
- CS-01: `server/salary-slip-generator.ts` lines 159, 167, 519, 532, 536
- CS-02: `server/offer-pdf-generator.ts` lines 55, 62, 105, 143, 581, 629–637, 741, 742
- Flag: `FF_COMPANY_LIVE_PDF=false` (default)
- `COMPANY_FALLBACK` constant object defined alongside each generator as safety net

#### 3.1.5 Rollout Sequence

```
1. Deploy DB migration (ADD COLUMN + UPDATE seed contact data)
2. Deploy Block B (no flag)
3. Run Block B regression checklist — signoff required
4. Deploy Block C
5. Run GCS path regression suite — signoff required
6. Deploy Block D
7. Run Block D checklist — signoff required
8. Deploy Block E with FF_COMPANY_LIVE_PDF=false
9. Enable FF_COMPANY_LIVE_PDF=true in STAGING — run PDF regression suite
10. Enable FF_COMPANY_LIVE_PDF=true for single test user in PRODUCTION (dark-launch)
11. Monitor 48 hours — if stable, enable for all
```

#### 3.1.6 Rollback Sequence

```
1. Set FF_COMPANY_LIVE_PDF=false (immediate — no restart required on hot-reload env)
2. Revert Block C via git revert (document-path-resolver fallback to 'TPEL' constant)
3. Revert DB migration: ALTER TABLE company_master DROP COLUMN IF EXISTS phone, fax, email, description
   (safe — no data dependency from other modules yet)
```

#### 3.1.7 Validation Gates

- [ ] GCS path regression: 10 test paths generated with company_code from DB; all begin with `TPEL/`
- [ ] Server startup guard fires if company_master is empty
- [ ] Salary slip PDF: legal_name from DB matches `THERMOPAC PROCESS ENGINEERING LLP`
- [ ] Offer PDF: footer address composite matches registered_office DB row
- [ ] buy-datasheet header: legal_name from DB, not hardcoded
- [ ] `COMPANY_FALLBACK` fires correctly when DB is unavailable (staged DB offline test)
- [ ] TypeScript typecheck: zero errors after migration

#### 3.1.8 Production Risks

| Risk | Mitigation |
|---|---|
| DB read latency adds to PDF generation time | `getActiveCompany()` caches result per-request (Wave 5 adds persistent cache) |
| TPEL contact data null after column add | UPDATE seed runs in same migration transaction; validated before Block E enable |
| company_code mismatch corrupts GCS paths | Startup guard aborts server if empty; Block C deployed before Block E |

#### 3.1.9 Freeze Requirements

- Freeze `server/salary-slip-generator.ts` and `server/offer-pdf-generator.ts` during Block E rollout
- Freeze `server/services/document-path-resolver.ts` during Block C rollout
- No payroll runs during Block E production enablement window (coordinate with payroll cycle)

---

### Wave 2: Multi-Company Session Architecture

**Objective**: Introduce user-company assignments, session-level active company, and the
global company switcher UI.

**Dependencies**: Wave 1 complete and stable

#### 3.2.1 DB Changes

```sql
CREATE TABLE IF NOT EXISTS user_company_assignments (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES company_master(id) ON DELETE RESTRICT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  granted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_default_company
  ON user_company_assignments (user_id) WHERE is_default = true;

-- Seed: assign all existing users to TPEL as default (idempotent)
INSERT INTO user_company_assignments (user_id, company_id, is_default, granted_at)
SELECT u.id, 1, true, NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_company_assignments a WHERE a.user_id = u.id
);
```

#### 3.2.2 API Changes

```
POST   /api/company/session/switch                      — session switch
POST   /api/admin/user-company-assignments              — assign user (Superuser)
DELETE /api/admin/user-company-assignments/:id          — remove assignment (Superuser)
GET    /api/admin/user-company-assignments/:userId      — list user's assignments
```

New middleware `companyContextMiddleware` (disabled by `FF_COMPANY_CONTEXT_MIDDLEWARE`):
- Reads `req.session.activeCompanyId` → attaches `req.activeCompany`
- If flag is false: `req.activeCompany` defaults to globally active company (Phase 1 behaviour)

#### 3.2.3 Frontend Changes

- Global company switcher component in top navigation bar
- Visible only if `FF_COMPANY_SWITCHER=true` and user has >1 company assignment
- On switch: POST `/api/company/session/switch` → full React Query cache invalidation

#### 3.2.4 Rollout Sequence

```
1. Deploy DB migration (user_company_assignments + seed)
2. Deploy middleware with FF_COMPANY_CONTEXT_MIDDLEWARE=false
3. Deploy new admin assignment API routes
4. Run assignment API regression — signoff
5. Enable FF_COMPANY_CONTEXT_MIDDLEWARE=true in STAGING — validate all existing routes unaffected
6. Enable in PRODUCTION with FF_COMPANY_SWITCHER=false (middleware active, switcher hidden)
7. Monitor 48 hours
8. Enable FF_COMPANY_SWITCHER=true — switcher visible only for multi-assigned users
```

#### 3.2.5 Rollback Sequence

```
1. Set FF_COMPANY_SWITCHER=false (switcher disappears immediately)
2. Set FF_COMPANY_CONTEXT_MIDDLEWARE=false (middleware becomes no-op)
3. No DB rollback required — user_company_assignments table is additive; safe to leave
   (if removal needed: DROP TABLE user_company_assignments — no FK dependencies from other modules)
```

#### 3.2.6 Validation Gates

- [ ] All existing routes return identical responses with middleware active (Phase 1 parity)
- [ ] Session switch correctly changes `req.activeCompany` on next request
- [ ] User with single assignment cannot see switcher
- [ ] Superuser can switch to any company regardless of assignment
- [ ] React Query cache is fully invalidated after switch
- [ ] Assignment seed: every existing user has exactly one default assignment (TPEL)

#### 3.2.7 Production Risks

| Risk | Mitigation |
|---|---|
| Middleware breaks existing routes | `FF_COMPANY_CONTEXT_MIDDLEWARE=false` kills middleware; Phase 1 behaviour restored |
| Session migration wipes existing sessions | Middleware is additive to session; existing keys untouched |

---

### Wave 3: Approval Workflow (Maker-Checker)

**Objective**: Gate sensitive legal/tax/banking field changes behind a maker-checker
approval process with an immutable audit trail.

**Dependencies**: Wave 2 complete (company session context available)

#### 3.3.1 DB Changes

```sql
CREATE TABLE IF NOT EXISTS company_change_approvals (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER      NOT NULL REFERENCES company_master(id) ON DELETE RESTRICT,
  change_type     VARCHAR(40)  NOT NULL,
  proposed_value  JSONB        NOT NULL,
  current_value   JSONB        NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
  submitted_by    INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_by     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  applied_at      TIMESTAMPTZ,
  cancelled_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at    TIMESTAMPTZ,
  version         INTEGER      NOT NULL DEFAULT 1,
  CONSTRAINT chk_self_approve CHECK (reviewed_by IS NULL OR reviewed_by != submitted_by)
);

CREATE INDEX IF NOT EXISTS idx_cca_company_id   ON company_change_approvals(company_id);
CREATE INDEX IF NOT EXISTS idx_cca_status        ON company_change_approvals(status);
CREATE INDEX IF NOT EXISTS idx_cca_submitted_at  ON company_change_approvals(submitted_at);
```

#### 3.3.2 API Changes

All routes gated by `FF_COMPANY_APPROVAL_WORKFLOW`. If flag is false, direct writes to
legal_tax and bank_accounts continue (Phase 1 behaviour preserved).

```
POST   /api/company/:id/approvals
GET    /api/company/:id/approvals
GET    /api/company/approvals/:approvalId
PATCH  /api/company/approvals/:approvalId/approve
PATCH  /api/company/approvals/:approvalId/reject
PATCH  /api/company/approvals/:approvalId/cancel
```

When `FF_COMPANY_APPROVAL_WORKFLOW=true`:
- `PATCH /api/company/:id/legal-tax` for GSTIN, PAN, IEC, LUT, AD Code fields
  returns `202 Accepted` with an approval record instead of writing directly
- `PATCH /api/company/:id/bank-accounts/:bankId` for account_number, IFSC, SWIFT
  returns `202 Accepted` with an approval record

#### 3.3.3 Frontend Changes

- Approval pending badge in Legal & Tax tab and Banking tab headers
- Approval queue view (Superuser only): lists pending approvals with approve/reject actions
- Submitter sees "Awaiting approval" state on pending fields (greyed out, read-only)

#### 3.3.4 Rollout Sequence

```
1. Deploy DB migration (company_change_approvals table)
2. Deploy approval API routes with FF_COMPANY_APPROVAL_WORKFLOW=false
3. Deploy frontend approval UI components (visible but inactive)
4. Enable FF_COMPANY_APPROVAL_WORKFLOW=true in STAGING — run approval lifecycle tests
5. Enable in PRODUCTION — validate with a test GSTIN change approval
6. Monitor first 5 real approvals manually before declaring stable
```

#### 3.3.5 Rollback Sequence

```
1. Set FF_COMPANY_APPROVAL_WORKFLOW=false
   — direct writes resume; approval routes become unreachable
   — pending approvals in DB remain (no data loss; no functional impact while flag is false)
2. No DB rollback required — company_change_approvals is additive
```

#### 3.3.6 Validation Gates

- [ ] Submit + approve lifecycle: GSTIN updated in live table after approval applied
- [ ] Self-approve blocked: `reviewed_by = submitted_by` rejected at DB constraint AND route
- [ ] Cancel by non-submitter blocked (403)
- [ ] Optimistic lock: concurrent approval of same record returns 409
- [ ] Audit log entry written at `applied_at` moment
- [ ] Direct-write still works when flag is false (Phase 1 parity)
- [ ] Approval queue visible to Superuser; not visible to Accounts Head

#### 3.3.7 Production Risks

| Risk | Mitigation |
|---|---|
| Approval deadlock (no available reviewer) | Admin bypass route `PATCH /api/admin/company-approvals/:id/force-apply` (Superuser, logged) |
| Submitter also the only Superuser | Flag off → direct write; Superuser is always their own emergency exit |

---

### Wave 4: Event Propagation, Notifications, Live Refresh

**Objective**: Wire up the EventBus so company changes propagate to subscribers; deliver
in-app and email notifications; push WebSocket invalidation signals to open browser sessions.

**Dependencies**: Wave 3 complete (approval events are a source); Wave 2 session architecture
(WebSocket sessions are company-scoped)

#### 3.4.1 DB Changes

None — all event data is transient. Notification dispatch attempts are logged to existing
`company_audit_log` (`action='notification_dispatched'` / `action='notification_failed'`).

#### 3.4.2 API Changes

None — EventBus is internal to the server process.
WebSocket uses the existing `ws` upgrade path; no new HTTP routes.

#### 3.4.3 Frontend Changes

- WebSocket listener added to React app root: subscribes to `COMPANY_INVALIDATED` messages
- On signal: `queryClient.invalidateQueries({ queryKey: ['/api/company/active'] })`
- Stale-data banner component for open PDF previews

#### 3.4.4 Rollout Sequence

```
1. Deploy EventBus module (no subscribers wired — zero runtime effect)
2. Deploy WebSocket invalidation signal (FF_COMPANY_WEBSOCKET_REFRESH=false)
3. Deploy notification dispatch module (SendGrid templates + retry logic)
4. Wire EventBus subscribers one event type at a time:
   a. company.activated → cache flush + WebSocket signal
   b. company.general.updated → cache flush + WebSocket signal
   c. company.branding.updated → signed URL cache flush
   d. company.document.expired → notification dispatch
   e. company.approval.pending → notification dispatch
   f. company.approval.resolved → notification dispatch
5. Enable FF_COMPANY_EVENT_BUS=true in STAGING — validate all subscriber chains
6. Enable FF_COMPANY_WEBSOCKET_REFRESH=true in STAGING — validate real-time UI update
7. Enable both in PRODUCTION
```

#### 3.4.5 Rollback Sequence

```
1. Set FF_COMPANY_EVENT_BUS=false — EventBus subscribers become no-ops
2. Set FF_COMPANY_WEBSOCKET_REFRESH=false — WebSocket signals suppressed
3. No DB rollback required
```

#### 3.4.6 Validation Gates

- [ ] `company.activated` triggers full cache flush within 1s
- [ ] Open browser session receives `COMPANY_INVALIDATED` within 2s of activation
- [ ] React Query re-fetches `/api/company/active` after WebSocket signal
- [ ] Document expiry email dispatched by nightly cron for expiring docs (staged test)
- [ ] Approval pending email dispatched on approval submit
- [ ] Failed notification logged to `company_audit_log`
- [ ] Subscriber failure does not roll back the originating write

---

### Wave 5: Cache Layer

**Objective**: Introduce the in-process company cache with Redis-ready interface to protect
the DB from company-record read stampedes.

**Dependencies**: Wave 4 complete (EventBus is the cache invalidation mechanism)

#### 3.5.1 DB Changes

None.

#### 3.5.2 API Changes

- `GET /api/company/active` uses cache as first read; DB as miss fallback
- Cache is transparent to API callers — response shape unchanged
- New internal metric: `X-Cache-Hit: true/false` response header (dev/staging only)

#### 3.5.3 Frontend Changes

None — cache is entirely server-side.

#### 3.5.4 Rollout Sequence

```
1. Deploy InMemoryCompanyCache (interface + implementation)
2. Deploy cache integration with FF_COMPANY_CACHE=false (bypass — DB reads unchanged)
3. Enable FF_COMPANY_CACHE=true in STAGING
4. Run cache validation suite (TTL, invalidation, coalescing, stale protection)
5. Enable in PRODUCTION
6. Monitor cache hit rate metric for 48 hours (target: >80% hit rate at steady state)
```

#### 3.5.5 Rollback Sequence

```
1. Set FF_COMPANY_CACHE=false — all reads bypass cache, go directly to DB
   (no data risk — cache is read-through, never write-through to source data)
```

#### 3.5.6 Validation Gates

- [ ] Cache hit rate >80% under simulated concurrent load (10 parallel requests)
- [ ] Cache invalidated within 500ms of `company.activated` event
- [ ] Signed URL cache never serves a URL within 60s of GCS expiry
- [ ] Simultaneous cache misses collapse to one DB read (coalescing)
- [ ] `FF_COMPANY_CACHE=false` produces identical responses to cached path

#### 3.5.7 Production Risks

| Risk | Mitigation |
|---|---|
| Cache poisoning (stale data served after failed invalidation) | TTL hard cap at 5min; worst-case staleness bounded |
| Cache memory growth | Bounded key set (5 keys); no unbounded growth |

---

### Wave 6: Branding Validation & Orphan Cleanup

**Objective**: Enforce branding image quality at upload time; automate GCS orphan cleanup
for superseded branding assets.

**Dependencies**: Wave 4 complete (orphan deletion events logged to audit_log via EventBus)

Wave 5 and Wave 6 may be **developed in parallel** but must be **deployed sequentially**
(Wave 5 first, then Wave 6).

#### 3.6.1 DB Changes

```sql
ALTER TABLE company_master
  ADD COLUMN IF NOT EXISTS logo_thumb_gcs_path       TEXT,
  ADD COLUMN IF NOT EXISTS signature_thumb_gcs_path  TEXT,
  ADD COLUMN IF NOT EXISTS seal_thumb_gcs_path       TEXT;
```

#### 3.6.2 API Changes

- `POST /api/company/:id/branding/{logo|signature|seal}`: validation layer added before GCS upload
  (only when `FF_COMPANY_BRANDING_VALIDATION=true`)
- Returns `400 DIMENSION_REJECTED` with `{ errors: string[], warnings: string[] }`
- `GET /api/company/active`: response now includes `logo_thumb_gcs_path` etc.
- New admin route: `POST /api/admin/company-orphans/run?dryRun=true|false` (Superuser)
- New admin route: `GET /api/admin/company-orphans/report`

#### 3.6.3 Frontend Changes

- Branding upload dialog shows dimension warnings before final upload confirmation
- Thumbnail used in branding tab preview (reduces bandwidth vs full-res signed URL)

#### 3.6.4 Rollout Sequence

```
1. Install sharp (image processing library)
2. Deploy dimension validation with FF_COMPANY_BRANDING_VALIDATION=false
3. Deploy orphan cleanup scheduler with FF_COMPANY_ORPHAN_CLEANUP=false
4. Deploy thumbnail generation alongside branding upload (always-on — no flag, additive)
5. Enable FF_COMPANY_BRANDING_VALIDATION=true in STAGING — run dimension test suite
6. Enable in PRODUCTION — test with one logo upload of each dimension boundary condition
7. Enable FF_COMPANY_ORPHAN_CLEANUP=true with COMPANY_ORPHAN_CLEANUP_DRY_RUN=true
8. Run 3 consecutive nightly dry-run cycles; review reports
9. After admin approval: set COMPANY_ORPHAN_CLEANUP_DRY_RUN=false to enable live deletion
```

#### 3.6.5 Rollback Sequence

```
1. Set FF_COMPANY_BRANDING_VALIDATION=false — uploads bypass dimension check
2. Set FF_COMPANY_ORPHAN_CLEANUP=false — scheduler stops
3. DB rollback (if needed):
   ALTER TABLE company_master
     DROP COLUMN IF EXISTS logo_thumb_gcs_path,
     DROP COLUMN IF EXISTS signature_thumb_gcs_path,
     DROP COLUMN IF EXISTS seal_thumb_gcs_path;
   (safe — no other modules reference these columns yet)
```

#### 3.6.6 Validation Gates

- [ ] Logo < 200px width returns `DIMENSION_REJECTED`
- [ ] Logo > 2000px width returns `DIMENSION_REJECTED`
- [ ] Seal with non-square aspect ratio (e.g. 2:1) returns `DIMENSION_REJECTED`
- [ ] Logo 400×100px returns warning (< 600px) but upload proceeds
- [ ] Thumbnail generated at correct dimensions for each asset type
- [ ] Dry-run orphan report lists all unreferenced GCS objects under `TPEL/COMPANY/`
- [ ] Objects < 30 days old excluded from deletion candidates
- [ ] `company_audit_log` entry written before each orphan deletion

---

### Wave 7: SAP Company Routing

**Objective**: Route SAP Service Layer calls by company context (`sap_company_db` from
`company_erp_config`) using per-company session slots in `SapSessionPool`.

**Dependencies**: Wave 2 (session-level `req.activeCompany` provides `erpConfig.sapCompanyDb`)

#### 3.7.1 DB Changes

None — `company_erp_config.sap_company_db` was added in Phase 1. Only routing logic changes.

#### 3.7.2 API Changes

- SAP routes read `req.activeCompany.erpConfig.sapCompanyDb` for session keying (when `FF_COMPANY_SAP_ROUTING=true`)
- Session pool key changes from a singleton to `Map<string, SapSession>` keyed by `sap_company_db`
- `Test SAP` button explicitly passes `sapCompanyDb` to `invalidateSharedSapSession()`
- No new public API routes

#### 3.7.3 Frontend Changes

None — SAP routing is entirely server-side.

#### 3.7.4 Rollout Sequence

```
1. Refactor SapSessionPool to Map-based with FF_COMPANY_SAP_ROUTING=false
   (Map has one entry keyed 'default'; behaviour identical to current singleton)
2. Enable FF_COMPANY_SAP_ROUTING=true in STAGING with sap_company_db='SBODemoIN' (test)
3. Run SAP routing validation suite
4. Validate Test SAP button forces fresh login per company slot
5. Enable in PRODUCTION with single company (TPEL) — no visible change, one slot in Map
6. Monitor for 30 days before expanding to multi-company SAP routing
```

#### 3.7.5 Rollback Sequence

```
1. Set FF_COMPANY_SAP_ROUTING=false — reverts to singleton session (current behaviour)
2. No DB changes to roll back
```

#### 3.7.6 Validation Gates

- [ ] SAP calls for company A use session slot A (not slot B)
- [ ] Session contamination test: Full Scan for company A does not affect company B's session
- [ ] Test SAP button invalidates correct slot (not all slots)
- [ ] `FF_COMPANY_SAP_ROUTING=false` produces identical behaviour to pre-Wave-7 (singleton)
- [ ] No SAP credentials appear in any company table (credential boundary audit)
- [ ] `sap_company_db=null` falls back gracefully (log warning, use default slot)

#### 3.7.7 Non-Negotiable Governance Rules (preserved from replit.md)

- No `$select` or `$orderby` on bulk vendor fetch — unchanged
- No credential storage in application tables — enforced
- `Test SAP` button forces fresh login — unchanged, extended to per-slot
- Full Scan paginates in memory — unchanged

---

## 4. Dependency Graph

```
Wave 1 (Callsite Migration)
  └─ Required by: Wave 2 (contact fields needed by company context)

Wave 2 (Session Architecture)
  └─ Required by: Wave 3 (approval routes need req.activeCompany)
  └─ Required by: Wave 7 (SAP routing needs req.activeCompany.erpConfig)

Wave 3 (Approval Workflow)
  └─ Required by: Wave 4 (approval events are a source for EventBus)

Wave 4 (Event Propagation + Notifications)
  └─ Required by: Wave 5 (EventBus drives cache invalidation)
  └─ Required by: Wave 6 (EventBus drives orphan audit log)

Wave 5 (Cache Layer)          ◄── parallel development with Wave 6
Wave 6 (Branding + Orphan)   ◄── parallel development with Wave 5
  Both must deploy sequentially: Wave 5 → Wave 6

Wave 7 (SAP Routing)
  └─ Requires: Wave 2 (session-level company context)
  └─ Independent of: Waves 3, 4, 5, 6 (may be developed in parallel with Wave 3+)
```

### 4.1 Blockers

| Wave | Blocked Until |
|---|---|
| Wave 2 | Wave 1 stable in production + rollback checkpoint confirmed |
| Wave 3 | Wave 2 stable + rollback checkpoint confirmed |
| Wave 4 | Wave 3 stable + rollback checkpoint confirmed |
| Wave 5 | Wave 4 stable + rollback checkpoint confirmed |
| Wave 6 | Wave 5 deployed (Wave 6 may be developed during Wave 5) |
| Wave 7 | Wave 2 stable (Wave 7 may be developed during Waves 3–6) |

### 4.2 Parallel-Safe Development

- **Wave 5 + Wave 6**: may be developed simultaneously after Wave 4 completes
- **Wave 7**: may be developed simultaneously with Waves 3–6 after Wave 2 completes
- Development parallelism does not bypass deployment ordering — each wave still deploys sequentially

### 4.3 Strict Ordering Requirements

```
Production deployment order (non-negotiable):
  Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave 6 → Wave 7
```

---

## 5. Migration Governance

### 5.1 Migration Freeze Windows

| Event | Freeze Duration | Scope |
|---|---|---|
| Wave production deploy | 4 hours | No commits to affected files |
| Payroll cycle | Wave 1E blocked | No FF_COMPANY_LIVE_PDF enable during payroll run |
| Month-end closing | Waves 3+ blocked | No approval workflow changes during accounting close |
| SAP Full Scan running | Wave 7 blocked | No SAP session pool changes during active scan |

### 5.2 Rollback Checkpoints

Each wave has a mandatory rollback checkpoint after production deployment:

```
Checkpoint T+2h:   Verify all validation gates pass in production
Checkpoint T+24h:  Review error logs — zero COMPANY_* errors
Checkpoint T+48h:  Final sign-off — wave declared stable
  → Only after T+48h checkpoint: next wave may begin
```

### 5.3 Data Backup Requirements

| Trigger | Backup Target | Method |
|---|---|---|
| Before any schema migration | Full DB snapshot | Replit DB snapshot before wave deploy |
| Before Wave 1E enable (PDF callsites) | company_master + company_addresses | `pg_dump -t company_*` |
| Before Wave 6 live orphan deletion | company_master branding paths | Export CSV of all *_gcs_path values |
| Before Wave 7 SAP routing enable | company_erp_config | Export CSV |

### 5.4 DB Snapshot Rules

- Snapshot taken immediately before each wave's first DB migration
- Snapshot retained for 30 days minimum
- Snapshot name format: `company-phase2-wave{N}-pre-{YYYY-MM-DD}`

### 5.5 Zero-Downtime Requirements

All waves are zero-downtime deployable:
- All DB changes are additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`)
- No column renames or type changes
- Feature flags allow server restart without user impact (flag=false = Phase 1 behaviour)
- No table locks beyond standard PostgreSQL DDL for `ADD COLUMN` on small tables

### 5.6 Backward Compatibility Requirements

- Phase 1 API response shapes must remain identical throughout all waves
- All new columns have `DEFAULT` or are nullable — no NOT NULL without default on existing tables
- All new tables have no mandatory FK to tables that could be empty

---

## 6. Feature Flag Governance

### 6.1 Flag Registry

| Flag | Wave | Default | Enable Condition |
|---|---|---|---|
| `FF_COMPANY_LIVE_PDF` | Wave 1E | `false` | After dark-launch validation in staging + 48h production pilot |
| `FF_COMPANY_CONTEXT_MIDDLEWARE` | Wave 2 | `false` | After middleware regression suite passes |
| `FF_COMPANY_SWITCHER` | Wave 2 | `false` | After `FF_COMPANY_CONTEXT_MIDDLEWARE` stable 48h |
| `FF_COMPANY_APPROVAL_WORKFLOW` | Wave 3 | `false` | After approval lifecycle tests pass in staging |
| `FF_COMPANY_EVENT_BUS` | Wave 4 | `false` | After all subscriber chains validated |
| `FF_COMPANY_WEBSOCKET_REFRESH` | Wave 4 | `false` | After `FF_COMPANY_EVENT_BUS` stable |
| `FF_COMPANY_CACHE` | Wave 5 | `false` | After cache validation suite passes |
| `FF_COMPANY_BRANDING_VALIDATION` | Wave 6 | `false` | After dimension test suite passes |
| `FF_COMPANY_ORPHAN_CLEANUP` | Wave 6 | `false` | After 3 dry-run cycles reviewed |
| `FF_COMPANY_SAP_ROUTING` | Wave 7 | `false` | After SAP routing validation suite passes |

Companion variable (not a feature flag):
`COMPANY_ORPHAN_CLEANUP_DRY_RUN=true` (default) — separate from the enable flag

### 6.2 Enable/Disable Conditions

- All flags default to `false` at deployment time
- Enabling a flag requires explicit user approval for that wave
- Flags must not be enabled in production without staging validation

### 6.3 Emergency Shutdown Procedure

```
Any wave emergency shutdown:
  1. Set relevant flag(s) to false (env var change + server restart)
  2. Verify Phase 1 behaviour restored within 2 minutes
  3. Log emergency shutdown to company_audit_log (manual entry or admin route)
  4. Notify user — do not proceed to next wave without post-mortem
```

### 6.4 Fallback Behaviour

| Flag=false | Fallback |
|---|---|
| `FF_COMPANY_LIVE_PDF` | Hardcoded `COMPANY_FALLBACK` constants in generators |
| `FF_COMPANY_CONTEXT_MIDDLEWARE` | All routes use globally active company (Phase 1 behaviour) |
| `FF_COMPANY_APPROVAL_WORKFLOW` | Direct writes to legal_tax and bank_accounts (Phase 1 behaviour) |
| `FF_COMPANY_EVENT_BUS` | Subscribers not wired; no events dispatched |
| `FF_COMPANY_CACHE` | All reads bypass cache; direct DB reads |
| `FF_COMPANY_SAP_ROUTING` | Singleton SAP session (pre-Phase-2 behaviour) |

---

## 7. UAT Governance

### 7.1 UAT Stages

| Stage | When | Scope |
|---|---|---|
| UAT-A | After Wave 1 staging validation | PDF regression (salary slip + offer) |
| UAT-B | After Wave 2 staging validation | Session switch + permission isolation |
| UAT-C | After Wave 3 staging validation | Approval lifecycle + maker-checker |
| UAT-D | After Wave 4 staging validation | Event propagation + notifications |
| UAT-E | After Wave 5+6 staging validation | Cache correctness + branding + orphan |
| UAT-F | After Wave 7 staging validation | SAP routing + credential boundary |
| UAT-Final | After all waves stable 30 days | Full regression + signoff matrix |

### 7.2 UAT Owners

| Module | Owner Role |
|---|---|
| Payroll / salary slip | Superuser (HR owner) |
| Offer PDF | Superuser (commercial owner) |
| SAP integration | Superuser (SAP owner) |
| EPC reports | Superuser |
| Legal/tax approval | Accounts Head (submitter) + Superuser (reviewer) |
| Branding | Superuser |
| Notifications | Accounts Head (recipient) |

### 7.3 Acceptance Gates

Each UAT stage requires written sign-off (comment or document annotation) before the next wave begins:

- [ ] All validation gates for the wave: PASS
- [ ] Zero regressions vs Phase 1 behaviour
- [ ] Rollback dry-run executed and documented
- [ ] Error log review: zero unexplained `COMPANY_*` errors

### 7.4 Regression Validation Requirements

#### Payroll Validation (UAT-A)
- Generate salary slips for 3 test employees in staging
- Assert: legal_name = "THERMOPAC PROCESS ENGINEERING LLP" (from DB)
- Assert: address composite matches DB registered_office row
- Assert: logo renders in PDF (not placeholder)
- Assert: `COMPANY_FALLBACK` fires correctly when DB offline (staged test)

#### Offer PDF Validation (UAT-A)
- Generate test offer with all T&C sections
- Assert: footer address matches DB
- Assert: Author PDF metadata = `company_master.short_name`
- Assert: Description paragraph from `company_master.description` (not hardcoded)
- Assert: T&C text from `company_branding.terms_conditions` (or fallback constant)

#### SAP Validation (UAT-F)
- Trigger vendor Full Scan for company TPEL
- Assert: session slot key = `sap_company_db` value from `company_erp_config`
- Assert: no `$select` or `$orderby` in bulk fetch (existing governance)
- Assert: Test SAP button invalidates only the TPEL slot, not all slots

#### EPC Report Validation (UAT-A)
- Generate a drawing verification report
- Assert: company display name from DB, not hardcoded

#### Branding Validation (UAT-E)
- Upload logo at 150×50px — assert `DIMENSION_REJECTED`
- Upload logo at 800×200px — assert accepted + thumbnail generated
- Upload logo at 400×100px — assert accepted with warning

### 7.5 Signoff Matrix

| Wave | Signoff Required From |
|---|---|
| Wave 1 (Blocks B/C/D) | User (written) |
| Wave 1 (Block E — PDF) | User (written) after UAT-A |
| Wave 2 | User (written) after UAT-B |
| Wave 3 | User (written) after UAT-C |
| Wave 4 | User (written) after UAT-D |
| Wave 5 | User (written) after cache validation |
| Wave 6 | User (written) after UAT-E |
| Wave 7 | User (written) after UAT-F |
| Phase 2 Final | User (written) — UAT-Final complete |

---

## 8. Rollback Governance

### 8.1 Rollback Triggers

| Condition | Trigger |
|---|---|
| Any salary slip generated with blank/wrong company identity | Immediate — Wave 1E rollback |
| Any offer PDF generated with wrong legal name | Immediate — Wave 1E rollback |
| Wrong SAP company database targeted (data written to wrong SAP DB) | Immediate — Wave 7 rollback |
| Approval self-approve bypass confirmed | Immediate — Wave 3 rollback |
| Cache serving stale data beyond 10 minutes | Immediate — Wave 5 rollback |
| Orphan cleanup deletes a referenced file | Immediate — Wave 6 orphan disable |
| Any P0 error rate >1% over 5 minutes in company routes | Relevant wave rollback |

### 8.2 Rollback Authority

**Any rollback may be executed immediately by the Superuser** without waiting for further approvals.
Rollback is the default, safe action. A decision to NOT roll back requires explicit justification.

### 8.3 Rollback Execution Sequence (Universal)

```
1. Identify failing flag(s)
2. Set flag(s) to false (env var + server restart — target < 2 min)
3. Verify Phase 1 behaviour is restored:
   - GET /api/company/active returns correct TPEL data
   - PDF generation (if Wave 1E) uses hardcoded fallback
   - SAP calls (if Wave 7) use singleton session
4. Check error logs — confirm no new COMPANY_* errors after rollback
5. If DB rollback needed (rare): execute pre-wave DB snapshot restore
6. Log rollback event to company_audit_log (manual or admin route)
7. Notify user with: wave name, trigger, rollback time, current state
8. Post-mortem before re-attempting wave
```

### 8.4 Rollback Validation

After rollback, run the Phase 1 validation checklist (from phase1-closure.md):
- 25 lifecycle tests must all PASS
- Zero-trust audit: 16 controls must all PASS

### 8.5 Rollback Communication Protocol

```
Message format for user notification:
  Wave: {wave name}
  Trigger: {what went wrong}
  Action taken: {flags set to false / DB restored}
  Current state: {Phase 1 behaviour restored / partial}
  Time to restore: {minutes}
  Next step: {post-mortem required / re-schedule wave}
```

---

## 9. Runtime Risk Matrix

### 9.1 High Risk

| Risk | Scenario | Likelihood | Mitigation |
|---|---|---|---|
| Wrong SAP routing — data in wrong SAP DB | `req.activeCompany` resolves to wrong company after session bug | Low | Wave 7 only after Wave 2 fully stable; single-company (TPEL) validation before multi-company |
| Salary slip wrong identity | `FF_COMPANY_LIVE_PDF=true` but DB read fails silently | Low | `COMPANY_FALLBACK` always throws named error; never silently blanks |
| Approval self-approve bypass | Route-level check missed; DB constraint not triggered | Very Low | Dual enforcement: DB `CONSTRAINT chk_self_approve` + route `reviewed_by != submitted_by` |
| GCS path corruption | `document-path-resolver` reads null `company_code` | Very Low | Server startup aborts if company_master empty; guard in getActiveCompany() |

### 9.2 Medium Risk

| Risk | Scenario | Likelihood | Mitigation |
|---|---|---|---|
| Stale company reads | Cache TTL expired, EventBus invalidation missed | Low | Hard 5-min TTL cap; stale-while-revalidate pattern |
| Cache poisoning | Corrupt DB row cached before correction | Very Low | Cache stores DB result verbatim; correction clears cache on next write event |
| Approval deadlock | Only one Superuser who is also the submitter | Low | Admin force-apply bypass route (logged, Superuser only) |
| WebSocket desync | Browser session loses WS connection; misses invalidation | Medium | Polling fallback at 30s; React Query `refetchOnWindowFocus` |
| Event replay duplication | Server restart replays in-memory EventBus events | N/A | In-process EventBus has no persistence; events are fire-and-forget per request |

### 9.3 Low Risk

| Risk | Scenario | Likelihood | Mitigation |
|---|---|---|---|
| Orphan deletion of valid file | Race between upload and orphan scan | Very Low | 30-day retention window; DB reference check before any deletion |
| Notification email flood | Many documents expire on same day | Low | Batch digest email (one email per recipient per day, not one per document) |
| SAP session contamination across companies | Shared session token used for wrong company DB | Very Low | Per-company Map slots; explicit slot invalidation on company switch |

---

## 10. Observability & Monitoring

### 10.1 Logging Requirements

All company-context operations must log to `company_audit_log` with:
- `action`: event type (see §4.1 of Phase 2 baseline)
- `company_id`: always present
- `changed_by`: user ID or null (for system events)
- `changed_at`: timestamp

Additional structured server logs (stdout/stderr):
- Cache hit/miss per request
- EventBus dispatch success/failure per event type
- Notification dispatch result (success/failed + reason)
- SAP session slot used per request

### 10.2 Audit Requirements

| Event | Audit Location | Retention |
|---|---|---|
| Any company field write | `company_audit_log` | Indefinite |
| Approval submitted/reviewed/applied | `company_audit_log` | Indefinite |
| Feature flag state change | `company_audit_log` (manual entry) | Indefinite |
| GCS orphan deletion | `company_audit_log` | Indefinite |
| Notification dispatch | `company_audit_log` | 90 days |
| Cache invalidation | Server log | 7 days |
| SAP session slot selection | Server log | 7 days |

### 10.3 Metrics to Track

| Metric | Target | Alert Threshold |
|---|---|---|
| Cache hit rate (`GET /api/company/active`) | >80% | <50% for 5 min |
| `company_audit_log` write latency | <100ms p95 | >500ms p95 |
| Notification dispatch success rate | >95% | <80% for 1 hour |
| Event subscriber execution time | <50ms p95 | >500ms p95 |
| Approval pending age | <48h | >72h unreviewed |
| SAP session pool size | ≤ company count | Unexpected growth |

### 10.4 Health Checks

- `GET /api/company/active` — 200 with valid company_code = healthy
- Cache layer: `cache.get('active_company_code')` !== null = healthy
- EventBus: subscriber count matches expected = healthy
- Orphan scheduler: last run timestamp < 26h = healthy

### 10.5 Alert Conditions

| Condition | Severity | Action |
|---|---|---|
| `GET /api/company/active` returns 500 | CRITICAL | Immediate investigation; cache bypass |
| PDF generator throws `COMPANY_DATA_UNAVAILABLE` | CRITICAL | Check DB connection; `FF_COMPANY_LIVE_PDF=false` |
| SAP request targets wrong `sap_company_db` | CRITICAL | Immediate Wave 7 rollback |
| Cache hit rate <50% for >5 min | HIGH | Check EventBus + DB connection |
| Approval pending >72h unreviewed | MEDIUM | Email alert to Superuser |
| Orphan cleanup fails 2 consecutive nights | MEDIUM | Admin investigation |

### 10.6 Cache Metrics

```
active_company_cache_hits_total (counter)
active_company_cache_misses_total (counter)
active_company_cache_invalidations_total (counter, labelled by event type)
active_company_signed_url_cache_hits_total (counter)
```

### 10.7 Event Retry Metrics

```
company_event_dispatched_total (counter, labelled by event type)
company_event_subscriber_failed_total (counter, labelled by subscriber name)
company_notification_dispatched_total (counter, labelled by channel)
company_notification_failed_total (counter, labelled by channel + reason)
company_notification_retries_total (counter)
```

### 10.8 SAP Routing Metrics

```
sap_session_slots_active (gauge — count of active slots in pool)
sap_session_slot_hits_total (counter, labelled by sap_company_db)
sap_session_slot_misses_total (counter — slot does not exist, must create)
sap_session_contamination_detected (counter — should always be 0; alert if >0)
```

---

## 11. Production Cutover Strategy

### 11.1 Deployment Sequence per Wave

```
For each wave:
  T-48h: Code review complete; staging validation passed; flag registry set
  T-24h: DB snapshot taken; freeze rules enforced; UAT signoff received
  T-0h:  DB migration deployed; server deployed with flag=false
  T+0h:  Smoke test (Phase 1 validation checklist)
  T+1h:  Enable feature flag(s) in production
  T+2h:  Run wave validation gates
  T+24h: Review logs
  T+48h: Rollback checkpoint — wave declared stable or rolled back
```

### 11.2 Freeze Periods

| Wave | Production Freeze Window |
|---|---|
| Wave 1E (PDF) | Outside payroll cycle; business hours |
| Wave 2 | Off-peak hours (18:00–22:00 IST) |
| Wave 3 | Outside month-end close; off-peak |
| Wave 4 | Off-peak hours |
| Wave 5–6 | Any time (low risk; flag-gated) |
| Wave 7 | Outside SAP Full Scan windows; business hours |

### 11.3 User Communication

Before each wave:
- Notify user of: wave objective, expected downtime (none), feature flag state changes
- Specify: what will look different in the UI (if anything)
- Confirm: who to contact if an issue is observed

### 11.4 Production Smoke Tests (post-deploy, any wave)

```
1. GET /api/company/active → 200, company_code='TPEL'
2. Login → session has activeCompanyId (Wave 2+)
3. GET /api/company/1/documents → 200
4. Typecheck: npm run typecheck → 0 errors
5. No new errors in server log for 5 minutes
```

### 11.5 Post-Deployment Validation

Full Phase 1 validation checklist (25 lifecycle tests) re-run after each wave in production.

---

## 12. Lifecycle Validation Expansion

Phase 2 adds 73 new tests across 10 categories (defined in Phase 2 baseline §15).
Each wave has its own validation suite:

### 12.1 Per-Wave Validation Suites

| Wave | Test Suite | Count |
|---|---|---|
| Wave 1 | Callsite migration (before/after PDF assertion per callsite) | 14 |
| Wave 2 | Multi-company isolation (session switch, permission isolation, cache flush) | 6 |
| Wave 3 | Maker-checker lifecycle (submit, review, approve, reject, cancel, self-approve, version lock, audit trail) | 8 |
| Wave 4 | Event propagation (one per event type) + notification dispatch | 16 |
| Wave 5 | Cache correctness (TTL, invalidation, coalescing, stale protection) | 6 |
| Wave 6 | Branding validation (dimension rules) + orphan cleanup | 11 |
| Wave 7 | SAP routing (slot isolation, credential boundary, branch mapping, no contamination) | 4 |
| All | Concurrency validation | 4 |
| All | Rollback validation (per wave) | 4 |

**Total Phase 2 lifecycle tests: 73**

### 12.2 Concurrency Validation

1. Simultaneous cache misses (10 parallel requests to `/api/company/active`) → exactly 1 DB read
2. Concurrent approval of same record by two reviewers → second reviewer receives 409
3. Concurrent branding upload → only one thumbnail written (file lock or atomic GCS upload)
4. Simultaneous company switch (two sessions) → each session gets independent activeCompanyId

### 12.3 Cache Invalidation Validation

1. Activate a company → cache flushed within 500ms
2. Update legal_name → `active_company` cache deleted; next read fetches fresh DB row
3. Upload new logo → signed URL cache deleted for logo key only
4. Cache miss during invalidation storm (10 events in 100ms) → single refresh, no stampede

### 12.4 Event Replay Validation

Not applicable — in-process EventBus has no persistence. Server restart produces no replays.
Validated by: confirming audit_log has no duplicate entries after server restart.

### 12.5 Multi-Company Isolation Validation

1. User assigned only to company A cannot read company B data via API
2. Session switch to company A does not expose company B's documents
3. company_audit_log reads are scoped to `req.activeCompany.id`
4. Superuser can read any company without assignment

### 12.6 SAP Routing Validation

1. SAP call with `activeCompany.erpConfig.sapCompanyDb='SBODemoIN'` uses slot `SBODemoIN`
2. SAP call with `activeCompany.erpConfig.sapCompanyDb='TPEL_LIVE'` uses slot `TPEL_LIVE`
3. Slots do not share session tokens
4. `sap_company_db=null` → warning logged, default slot used, no crash

### 12.7 Rollback Validation (per wave)

After each rollback dry-run:
1. Phase 1 validation checklist: 25/25 PASS
2. Zero-trust audit: 16/16 PASS
3. `GET /api/company/active` returns correct TPEL data
4. No `COMPANY_*` errors in log for 5 minutes post-rollback

---

## 13. Zero-Trust Audit Expansion (Phase 2)

Phase 1 established 16 controls. Phase 2 adds 8 new controls:

| # | Control | Requirement | Enforcement |
|---|---|---|---|
| P2-ZT-01 | Session isolation | `req.activeCompany` sourced from server-side session only; no client-supplied company ID accepted for privilege decisions | Route middleware validates session, not request body |
| P2-ZT-02 | Company data isolation | User can only read/write data for companies in their `user_company_assignments` | Route-level assignment check; Superuser bypass logged |
| P2-ZT-03 | Approval integrity — self-approve | `reviewed_by != submitted_by` enforced at both DB constraint and route level | DB: `CONSTRAINT chk_self_approve`; Route: explicit check before status update |
| P2-ZT-04 | Cache integrity | Cache may not serve data from a different company_id than the session company | Cache key includes company_id; miss falls back to DB read |
| P2-ZT-05 | Event integrity | Event subscribers may not perform write operations that bypass audit log | All subscriber writes go through service layer, not raw SQL |
| P2-ZT-06 | Notification integrity | Recipient list sourced from DB role query only; no client-supplied recipient list accepted | Notification dispatch reads recipients from `users` table; no API parameter accepted |
| P2-ZT-07 | SAP routing integrity — credential boundary | No SAP username, password, token, or Service Layer URL stored in any company table | Enforced at code review; `company_erp_config` schema has no credential columns |
| P2-ZT-08 | Orphan deletion integrity | GCS deletion is logged to `company_audit_log` before deletion; verified after deletion; requires Superuser auth | Admin route only; dry-run default; audit entry written in transaction before GCS call |

**Total Phase 2 zero-trust controls: 16 (Phase 1) + 8 (Phase 2) = 24**

---

## 14. Final Governance Lock

### 14.1 Implementation Prohibition

Phase 2 implementation is **PROHIBITED** until:

1. This execution plan is reviewed and approved by the user (explicit written approval required)
2. A separate implementation session is opened for each wave
3. Each wave receives an explicit "start" authorisation before any code is written

### 14.2 Wave Closure Requirements

Each wave is closed only when all of the following are confirmed:

- [ ] All wave validation gates: PASS
- [ ] Rollback dry-run executed and documented
- [ ] Rollback checkpoint T+48h signed off
- [ ] Zero regressions vs Phase 1 Phase 1 validation checklist: 25/25 PASS
- [ ] User written sign-off received

### 14.3 Phase 2 Final Closure Requirements

Phase 2 is complete only when:

- [ ] All 7 waves closed with written sign-off
- [ ] UAT-Final complete: all 73 Phase 2 + 25 Phase 1 lifecycle tests pass (98 total)
- [ ] 24/24 zero-trust controls confirmed
- [ ] All feature flags removed from code (replaced with always-on behaviour)
- [ ] All `COMPANY_FALLBACK` constants removed (after 30-day stability window)
- [ ] `docs/company-information-master-phase2-closure.md` created

### 14.4 Rollback Evidence

Before closing any wave, the following rollback evidence must be on record:

- Rollback dry-run transcript (staging environment)
- Timestamp of rollback execution
- Duration from trigger to Phase 1 behaviour restored
- Confirmation that Phase 1 validation checklist passed post-rollback

---

## Operational Governance Summary

| Topic | Governance Rule |
|---|---|
| Wave start | Requires explicit user approval; previous wave rollback checkpoint confirmed |
| Feature flags | All default `false`; never enabled without staging validation |
| Emergency rollback | Any flag to `false` immediately; no approval required |
| DB changes | Additive only; snapshots before each wave |
| Audit trail | Every write, every approval, every orphan deletion logged permanently |
| SAP credentials | Never stored in DB; enforced at code review per wave |
| Phase 1 parity | 25/25 lifecycle tests re-run after every wave |
| Phase 2 completion | 98 total lifecycle tests + 24 zero-trust controls + written user sign-off |
