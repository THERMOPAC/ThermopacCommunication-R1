# SAP Session Unification Migration Plan — v1.2 (Baseline)

**Status:** Approved for implementation  
**Date:** 2026-05-14  
**Applies to:** THERMOPAC QMS — SAP B1 Service Layer integration  

---

## 1. Objective & Governing Principle

**Single Law:** `SapCentralSession` (exported as `sapSession` from `server/sap-b1-integration/sap-central-session.ts`) is the **only** entity permitted to call `sapHttpsClient.login()` using system credentials. Every SAP B1 Service Layer operation — synchronous requests, background jobs, GRPO posting, JE posting, vendor scans, paginated syncs — must go through `sapSession.request()`. No exceptions except the narrowly defined diagnostic route policy in Section 3.

---

## 2. Session Ownership Model (Target State)

```
┌─────────────────────────────────────────────────────┐
│              SAP B1 Service Layer                   │
│         (59.152.52.58:50000/b1s/v1)                 │
│                                                     │
│   ONE active B1SESSION at any time (Integration    │
│   user — dedicated, never shared with desktop)     │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │    SapCentralSession    │  ← SOLE AUTHORITY
          │  sap-central-session.ts │
          │  • login / logout       │
          │  • cookie persistence   │
          │  • expiry tracking      │
          │  • -1102 retry          │
          │  • mutex (loginPromise) │
          │  • force-reset          │
          │  • pagination helpers   │
          └──────────┬──────────────┘
                     │ sapSession.request()
        ┌────────────┼────────────────────────────┐
        │            │                            │
   Project-     Admin-      PLC-      AI Agents
   Routes       Routes      Routes    (via helper)
   Vendors      JE Post     PO/GRPO   fetchOpenPOs
   Customers    Payroll     Scan      fetchGRPOs
   Procurement  Compliance  Items     (cron)
```

**Removed in target state:**
- `SapSessionManager` (per-user login store)
- `sap-auth-routes.ts` (manual `/api/sap/connect` endpoint)
- `sap-auth-middleware.ts` (injects per-user session into req)
- All per-user `B1SESSION` cookie construction outside `SapCentralSession`
- All independent login calls in `sap-live-queries.ts` (done — Phase 1.2) and `sap-routes.ts` scan paths

---

## 3. Diagnostic Route Governance Policy (Only Approved Exception)

Diagnostic routes in `sap-routes.ts` (`/connection/ssl-bypass-test`, `/connection/vpn-diagnostics`, `/connection/status`, `/connection/test`) are the **sole permitted exception** to the single-session law. Their use is governed by all of the following rules simultaneously. Violation of any one rule disqualifies the route from exception status.

### Rule D-1 — Must NEVER use system/Manager credentials
Diagnostic routes must exclusively use **user-supplied credentials** passed in the request body. They must never read from `SAP_B1_USERNAME`, `SAP_B1_PASSWORD`, or any environment variable holding the system integration account credentials. Hardcoded fallback to system credentials is prohibited.

```ts
// ALLOWED — user-supplied in request body
const { username, password, companyDb } = req.body;

// PROHIBITED — system credentials
const username = process.env.SAP_B1_USERNAME;
```

### Rule D-2 — Must NEVER persist cookies
No B1SESSION cookie created by a diagnostic route may be stored in memory, written to disk, placed in `req.sapSession`, or stored in `SapSessionManager`. The session is anonymous to the rest of the application.

### Rule D-3 — Must ALWAYS logout immediately after use
Every diagnostic route must call the SAP Logout endpoint before responding to the client — in a `finally` block to guarantee execution even on error.

```ts
try {
  const session = await sapHttpsClient.login(username, password, companyDb);
  // ... test call ...
  return res.json({ success: true });
} catch (err) {
  return res.json({ success: false, error: err.message });
} finally {
  if (sessionCookie) {
    try { await sapHttpsClient.logout(sessionCookie); } catch {}  // mandatory
  }
}
```

### Rule D-4 — Must be rate-limited
All diagnostic routes must be covered by the SAP login rate limiter (`sapLoginLimiter` in `sap-rate-limiter.ts`). Unauthenticated diagnostic endpoints are prohibited.

### Rule D-5 — The documented exception list is exhaustive
The approved diagnostic routes are:
1. `GET /connection/ssl-bypass-test`
2. `GET /connection/vpn-diagnostics`
3. `GET /connection/status`
4. `GET /connection/test`

Adding any new route to the diagnostic exception list requires an explicit architecture decision entry in `replit.md` and review before implementation.

---

## 4. SAP Account Governance Policy

### Rule A-1 — Dedicated Integration User
The credentials in `SAP_B1_USERNAME` / `SAP_B1_PASSWORD` must belong to a dedicated integration service account created solely for this application — not a named employee account or the SAP `manager` superuser.

### Rule A-2 — Desktop Login Prohibition
The integration service account must **never** be used to log into the SAP desktop client, SAP Business One client, or any other SAP application simultaneously with the server integration. A simultaneous desktop login is the primary cause of -1102 conflicts. This prohibition must be communicated to all SAP administrators.

### Rule A-3 — Session Count Policy
SAP B1 must support at minimum **2 concurrent named user sessions**: one for the integration account, one for each SAP desktop user. Verify licensed concurrent session count with the SAP administrator before Phase 3 production deployment.

### Rule A-4 — Credential Rotation Procedure
1. Update `SAP_B1_PASSWORD` in Replit Secrets  
2. Immediately call `POST /api/sap/session/force-reset`  
3. Call `GET /api/sap/session/health` to confirm new login succeeds  
4. Never rotate credentials during an active sync operation

### Rule A-5 — Credential Ownership
Integration account credentials are owned by the application system. Access to `SAP_B1_USERNAME` / `SAP_B1_PASSWORD` in Replit Secrets is restricted to Superuser-role accounts only.

---

## 5. Migration Phases

### Phase 1 — Critical Hotfixes ✅ COMPLETE
**Deployed:** 2026-05-14

| # | File | Change | Status |
|---|---|---|---|
| 1.1 | `server/admin-routes.ts:5615` | Replaced undefined `getSapClient().login()` with `sapSession.request()` | ✅ Done |
| 1.2 | `server/agents/agents/sap-live-queries.ts` | Removed `SapHttpsClient` import, `sapLogin()`, `sapLogout()`, `makeHeaders()`; all four functions now use `sapSession.request()` | ✅ Done |
| 1.3 | `server/sap-b1-integration/sap-https-client.ts` | Added runtime governance guard to `login()` — logs `[SAP GOVERNANCE VIOLATION]`, throws in production | ✅ Done |

---

### Phase 2 — PLC Routes Migration
**Sequence: after Phase 1**

| # | File | Change |
|---|---|---|
| 2.1 | `server/plc-sap-routes.ts` | Remove `import { sapSessionManager }`. Replace `getSapSession(req)` guard with `sapSession.getHealth()` check. Replace `sapGet()` / `sapPost()` with `sapSession.request()`. Remove all `409 SAP_SESSION_REQUIRED` responses. |

**New availability gate:**
```ts
const health = sapSession.getHealth();
if (!health.alive) return res.status(503).json({ error: 'SAP B1 not reachable. Check VPN and session status.', code: 'SAP_UNAVAILABLE' });
```

---

### Phase 3 — SAP Purchase Routes Full Migration
**Sequence: after Phase 2**

| # | Sub-path | Current | Target |
|---|---|---|---|
| 3.1 | Dashboard / stats (line 186) | Already `sapSession.getSession()` | No change |
| 3.2 | Full sync (line 930) | Already `sapSession.getSession()` | No change |
| 3.3 | GRPO creation (lines 1526–1564) | Prefers `req.sapSession`, falls back | Remove per-user path entirely |
| 3.4 | Attachment upload (lines 2181–2183) | Prefers `req.sapSession` | Remove per-user path |
| 3.5 | Direct logout (line 1916) | `sapClient.request({POST, .../Logout...})` | Remove — central session owns logout |
| 3.6 | `requireSapAccess` middleware | `sapSessionManager.getSession()` | Remove middleware from all routes |

**Feature flag:** Keep old per-user path behind `SAP_LEGACY_PER_USER_SESSION=true` for two weeks post-deployment. Default off. Remove at Phase 5.

---

### Phase 4 — Diagnostic Route Compliance Verification + Scan Route Migration
**Sequence: after Phase 3**

| Route / Location | Lines | Classification | Action |
|---|---|---|---|
| `/connection/ssl-bypass-test` | 62 | Diagnostic exception | Verify Rules D-1 through D-5; add governance comment header |
| `/connection/vpn-diagnostics` | 433, 503, 577 | Diagnostic exception | Same |
| `/connection/status` | 799, 818 | Diagnostic exception | Same |
| `/connection/test` | (same route) | Diagnostic exception | Same |
| Vendor full-scan | 1181, 1258 | **Production data fetch** | Migrate to `sapSession.request()` |
| Item full-scan | 1502, 1581 | **Production data fetch** | Migrate to `sapSession.request()` |

Each diagnostic route gets a governing comment block:
```ts
/**
 * DIAGNOSTIC ROUTE — SAP Session Governance Exception
 * Rules: user-supplied credentials only | no cookie persistence |
 *        logout in finally block | rate-limited | no system credentials.
 * Ref: SAP Session Unification Migration Plan v1.2, Section 3.
 */
```

---

### Phase 5 — Delete Legacy Infrastructure
**Sequence: only after Phases 1–4 validated in production for minimum 5 business days**

**Final deletion targets:**

| File | Action |
|---|---|
| `server/sap-session-manager.ts` | **DELETE** |
| `server/sap-b1-integration/sap-auth-routes.ts` | **DELETE** |
| `server/middleware/sap-auth-middleware.ts` | **DELETE** |
| `server/sap-b1-integration/credentials-routes.ts` lines 4, 99 | Remove `sapSessionManager` import + `getSessionsSummary()` call only |

**Pre-deletion zero-caller check:**
```bash
grep -rn "sapSessionManager\|sap-session-manager\|sap-auth-routes\|sap-auth-middleware\|requireSapAccess" server/
# Must return zero results outside the files being deleted
```

**Frontend cleanup:** Remove all "SAP Connect / Disconnect" per-user login widgets before Phase 5.

---

## 6. Long-Running Sync & Pagination Protection

### Rule P-1 — Use `sapSession.request()` for every page fetch
All pages in a paginated loop must call `sapSession.request()` per page — not a cookie captured at loop start. This ensures transparent session refresh on expiry between pages.

```ts
// PROHIBITED — stale cookie if session expires between pages
const cookie = await sapSession.getSession();
while (true) {
  const resp = await sapHttpsClient.authenticatedRequest(cookie, { ... });
}

// CORRECT — session resolved per-page, auto-refreshed if expired
while (true) {
  const resp = await sapSession.request({ method: 'GET', path: `...&$skip=${skip}` });
}
```

### Rule P-2 — Detect session expiry during pagination
`sapSession.request()` handles 401 and -1102 internally with retry. The loop continues from the same `$skip` position — data integrity preserved.

### Rule P-3 — Cap total pages to prevent runaway loops
```ts
const MAX_PAGES = 500;
let pageCount = 0;
while (true) {
  if (++pageCount > MAX_PAGES) { console.warn('[sync] capped at MAX_PAGES'); break; }
  ...
}
```

### Rule P-4 — Log pagination progress
```ts
if (skip % 100 === 0 && skip > 0) console.log(`[sync] processed ${skip} records so far`);
```

### Rule P-5 — Session expiry window awareness
When a sync runs longer than the SAP session TTL (typically 30 minutes), per-page `sapSession.request()` calls naturally trigger re-login via the internal mutex. No keep-alive pinging required.

### Rule P-6 — No `$select` / `$orderby` with UDF fields
Vendor scans must never add `$select` or `$orderby` to queries requiring `U_ERP_Group`. Session migration does not change query construction rules. (See `replit.md` SAP UDF governance.)

---

## 7. Startup / Restart Recovery

### Startup Flow
```
Server starts
     │
     ▼
initialize() called
     │
     ├─ DISK_PATH exists?
     │       │ YES → read cookie/pendingLogout
     │       │       → attempt SAP logout (fire-and-forget, non-fatal)
     │       │       → delete DISK_PATH
     │       │ NO  → clean start
     │
     ▼
this.cookie = null, this.expiresAt = null
(ready — no eager login; next request triggers login)
```

### Scenario S-1 — Clean startup
No disk file. `initialize()` completes immediately. First SAP request triggers `_doLogin()`.

### Scenario S-2 — Stale cookie on disk
Disk file present. `initialize()` attempts `sapHttpsClient.logout(staleCookie)` (non-fatal if rejected). Disk file deleted. App proceeds. Stale session expires within SAP's own TTL.

### Scenario S-3 — Corrupted disk state
Disk file present but malformed JSON. `initialize()` catches parse error, logs `[SapCentralSession] initialize() — disk scan error (non-fatal)`, deletes corrupt file, proceeds as clean start.

### Scenario S-4 — VPN unavailable at startup
`initialize()` does not attempt login. First `sapSession.request()` triggers `_doLogin()` which fails with timeout. Error propagates to caller (503 / `available: false`). Session remains in clean `cookie = null` state. VPN restoration triggers auto-login on next request.

### Scenario S-5 — VPN restored mid-operation
Next `sapSession.request()` call triggers `_doLogin()` normally. Mutex ensures single login attempt even under concurrent traffic.

### Startup Health Validation (added Phase 1)
Deferred non-blocking health ping 10 seconds after startup:
```ts
setTimeout(async () => {
  try {
    await sapSession.getSession();
    console.log('[SapStartup] SAP session pre-warm OK');
  } catch (err: any) {
    console.warn('[SapStartup] SAP session pre-warm failed (VPN may be down):', err.message);
  }
}, 10_000);
```

---

## 8. Race-Condition Prevention Strategy

`SapCentralSession` contains a `loginPromise` mutex:
```ts
if (this.loginPromise) {
  return this.loginPromise;  // all concurrent callers share one login
}
this.loginPromise = this._doLogin().finally(() => { this.loginPromise = null; });
return this.loginPromise;
```

After migration this mutex covers all paths. No additional coordination needed.

**AI agent cron race:** After Phase 1, agents share `sapSession.request()`. If session just expired when two agents fire simultaneously, mutex ensures one shared login attempt. Zero competing sessions.

**Force Reset during active sync:** `forceReset()` invalidates session. In-flight requests receive rejection, then retry via a new `_doLogin()`. Paginated sync retries the same `$skip` position (Rule P-2).

---

## 9. Cron / Background Job Strategy

| Agent | Schedule | Status |
|---|---|---|
| `project-control.ts` | 3:30 AM daily | Phase 1.2 complete — now uses `sapSession.request()` |
| `predictive-project-control.ts` | 4:00 AM daily | Phase 1.2 complete — now uses `sapSession.request()` |

Agents fire 30 minutes apart. Both reuse the central session — no competing logins. No scheduling changes needed.

**Graceful degradation:** All four exported functions return `SapLiveResult<T>` with `{ available: false, data: [], error: '...' }` on failure. Agents log unavailability and continue — identical behaviour to v1.0.

---

## 10. Failure Recovery Behaviour (Post-Migration)

| Scenario | Behaviour |
|---|---|
| Session expired mid-request | `sapSession.request()` auto-retries once (401 path) |
| -1102 during request body | Invalidates → waits 5s → retries once |
| -1102 during login `_doLogin()` | Retries once; attempts stale disk cookie logout first |
| VPN down | All calls fail with timeout; callers return 503 / `available: false` |
| Force Reset called | Session cleared; 5s wait; next request triggers fresh login |
| Crash mid-logout | Disk persistence ensures stale cookie re-tried on next startup (Scenario S-2) |
| Two admins click Force Reset simultaneously | `loginPromise` mutex ensures single login attempt |
| Session expiry during paginated sync | Per-page `sapSession.request()` auto-refreshes; loop continues from same `$skip` |
| Corrupted disk state | Parse error caught; disk file deleted; clean start proceeds |
| Password changed without Force Reset | `_doLogin()` fails with 401; admin must update secret and force-reset |

---

## 11. Audit Logging Strategy

**Existing:** `[SapCentralSession]` prefix logs every login, logout, session reuse, invalidation, -1102 retry, and force-reset.

**Additions per phase:**

| Phase | Event | Log |
|---|---|---|
| 1.1 | JE posting | `sap_session_source=central` in console log |
| 1.2 | AI agent calls | `[SapLiveQueries] <function> — start / done (N records) / unavailable` |
| 1.3 | Governance violation | `[SAP GOVERNANCE VIOLATION] unauthorized sapHttpsClient.login() caller...` |
| 2 | PLC SAP health gate | `[PlcSapRoutes] session alive=true/false` |
| 3 | GRPO creation | `[SapPurchaseRoutes] GRPO using central session` |
| 4 | Diagnostic route logout | `[DiagnosticRoute] logout confirmed` in finally block |
| 5 | Legacy deleted | Git commit message serves as audit trail |

---

## 12. Governance Protections — Preventing Future Violations

### Control A — Guard comment in `sap-https-client.ts`
```ts
/**
 * SAP Session Governance — RESTRICTED METHOD
 * sapHttpsClient.login() is restricted. ONLY permitted callers:
 *   1. SapCentralSession._doLogin()        — system session singleton
 *   2. SapCentralSession.testCredentials() — ephemeral, user-supplied creds only
 *   3. Approved diagnostic routes in sap-routes.ts (Rules D-1 through D-5 must be met)
 * All other callers WILL cause -1102 conflicts.
 * Ref: SAP Session Unification Migration Plan v1.2
 */
```

### Control B — `replit.md` architecture rule
> *SAP Session Governance v1.2: `sapSession.request()` from `sap-central-session.ts` is the only permitted SAP call path for all production/background operations. `sapHttpsClient.login()` must never be called outside `SapCentralSession` or approved diagnostic routes (Rules D-1 through D-5). `sap-session-manager.ts`, `sap-auth-routes.ts`, and `sap-auth-middleware.ts` will be deleted in Phase 5 — do not recreate them. The integration SAP account must never be used for simultaneous desktop login.*

### Control C — Grep validation check
```bash
# Run before any PR touching SAP code. Must return zero violations.
grep -rn "sapHttpsClient\.login\|new SapHttpsClient\|sapSessionManager\|sap-session-manager\|sap-auth-routes\|sap-auth-middleware" server/ \
  --include="*.ts" \
  --exclude="sap-central-session.ts" \
  --exclude="sap-https-client.ts" \
  --exclude="sap-routes.ts"
# Any output = violation.
```

### Control D — TypeScript visibility guard (Phase 5)
After all callers are removed, rename `sapHttpsClient.login()` to `sapHttpsClient._login()` and add `@internal` JSDoc tag to make accidental external calls visible in IDE tooling.

### Control E — Runtime caller-guard in `sapHttpsClient.login()` ✅ IMPLEMENTED
`sap-https-client.ts` `login()` method now inspects the call stack at runtime on every invocation:

```ts
const stack = new Error().stack || '';
const isAuthorized =
  stack.includes('sap-central-session') ||
  stack.includes('sap-routes');
if (!isAuthorized) {
  const callerLine = (stack.split('\n')[2] || stack.split('\n')[1] || '').trim();
  const msg = `[SAP GOVERNANCE VIOLATION] unauthorized sapHttpsClient.login() caller detected. ` +
    `This call creates a competing B1SESSION and will cause -1102 conflicts. Caller: ${callerLine}`;
  console.error(msg);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);   // BLOCKS the login in production
  }
}
```

**Behaviour by environment:**

| Environment | Unauthorized caller detected | Result |
|---|---|---|
| Development | Any unauthorized stack frame | Logs `[SAP GOVERNANCE VIOLATION]` to console; login proceeds |
| Production | Any unauthorized stack frame | Logs `[SAP GOVERNANCE VIOLATION]`; **throws — login is blocked** |

**Authorized stack frames:**
1. `sap-central-session` — covers `_doLogin()` and `testCredentials()`
2. `sap-routes` — covers approved diagnostic routes (Rules D-1 through D-5 still apply)

**Important:** This is a defence-in-depth control. It does not replace the static grep check (Control C) or the architectural rules (Controls A, B, D). It catches violations that slip past code review at runtime, with clear actionable log messages.

---

## 13. Production Freeze During Migration

The following restrictions are in force from Phase 1 start until Phase 5 confirmation:

| Rule | Restriction |
|---|---|
| F-1 | No new Express route handlers that make SAP Service Layer calls |
| F-2 | No new files importing `sapHttpsClient` or `sap-https-client.ts` |
| F-3 | No parallel refactors of SAP-adjacent code (auth, middleware, purchase routes) |
| F-4 | Exception: business-critical features must use `sapSession.request()` only and be reviewed against this plan |
| F-5 | Freeze lifted only when Zero-Trust Validation Checklist (Section 17) is fully signed off |

---

## 14. Risk Analysis

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| GRPO creation fails after Phase 3 | Medium | High | Feature flag; test on trial PO first; rollback via env var |
| AI agent returns `available: false` after Phase 1 | Low | Low | Existing fallback handles; agents already tolerate unavailability |
| PLC routes break on missing SAP gate (Phase 2) | Medium | Medium | Replace with `getHealth().alive`; test all PLC flows |
| Central session expires mid-paginated sync | Low | Low | Per-page `sapSession.request()` auto-refreshes (Rule P-1) |
| Integration account used on desktop during migration | Medium | High | Issue SAP account governance notice before Phase 1 |
| Force Reset during active GRPO post | Low | Medium | `loginPromise` mutex serialises; GRPO route receives one failed attempt, retries |
| VPN down during startup | High (occasional) | Low | Startup pre-warm fails silently; first request after VPN restore auto-logins |
| Corrupted disk session file after crash | Low | Low | Handled by try/catch in `initialize()` |
| `getSapClient` runtime crash before Phase 1.1 fix | Was High | Was High | Fixed — Phase 1.1 complete |
| Frontend "Connect to SAP" button broken after Phase 5 | Certain | Low | Remove button from UI as part of Phase 5 |
| Governance guard false-positive blocking legitimate caller | Low | High | Stack includes() check is filename-based; authorized file names are stable |

---

## 15. Rollback Strategy

| Phase | Rollback Method |
|---|---|
| 1.1 (JE posting) | Route was already broken (ReferenceError). Fix-forward only — no viable rollback to prior state. |
| 1.2 (agents) | Revert `sap-live-queries.ts` from git. Agent cron resumes own-login behaviour (no worse than pre-migration). |
| 1.3 (governance guard) | Revert `sap-https-client.ts`. Guard removed; violations no longer detected at runtime. |
| 2 (PLC) | Revert `plc-sap-routes.ts`. Per-user session still alive until Phase 5. Full function restored. |
| 3 (GRPO) | Set `SAP_LEGACY_PER_USER_SESSION=true` — re-enables per-user path without code change. |
| 4 (scan routes) | Revert `sap-routes.ts`. Scans resume using own sessions (pre-migration status quo). |
| 5 (deletion) | Cannot undelete; restore from git. **Phase 5 must not proceed until all prior phases validated in production for minimum 5 business days.** |

---

## 16. File-by-File Migration Summary

| File | Phase | Action | Status |
|---|---|---|---|
| `server/admin-routes.ts` | 1.1 | Replaced `getSapClient().login()` with `sapSession.request()` | ✅ Complete |
| `server/agents/agents/sap-live-queries.ts` | 1.2 | Removed own login; rewrote all four functions with `sapSession.request()` | ✅ Complete |
| `server/sap-b1-integration/sap-https-client.ts` | 1.3 | Runtime governance guard added to `login()` | ✅ Complete |
| `server/plc-sap-routes.ts` | 2 | Remove `sapSessionManager`; gate on `sapSession.getHealth()` | Pending |
| `server/sap-b1-integration/sap-purchase-routes.ts` | 3 | Remove per-user fallback; remove direct logout | Pending |
| `server/sap-b1-integration/sap-routes.ts` (scan paths) | 4 | Migrate vendor/item full-scan to `sapSession.request()` | Pending |
| `server/sap-b1-integration/sap-routes.ts` (diagnostic routes) | 4 | Verify D-1 through D-5 compliance; add governance headers | Pending |
| `server/sap-session-manager.ts` | 5 | **DELETE** | Pending |
| `server/sap-b1-integration/sap-auth-routes.ts` | 5 | **DELETE** | Pending |
| `server/middleware/sap-auth-middleware.ts` | 5 | **DELETE** | Pending |
| `server/sap-b1-integration/credentials-routes.ts` | 5 | Remove `sapSessionManager` import + `getSessionsSummary()` only | Pending |
| `replit.md` | 5 | Add SAP governance rule | Pending |
| `server/sap-b1-integration/sap-https-client.ts` | 5 | Rename `login()` → `_login()` + `@internal` tag | Pending |

**Not changing:** `sap-central-session.ts`, core `sap-https-client.ts` logic — these are the approved foundation.

---

## 17. Zero-Trust Validation Checklist

Before Phase 5 deletion is approved, **every item** must pass:

```
CODE VERIFICATION
[ ] grep -rn "sapSessionManager" server/        → zero results
[ ] grep -rn "sapHttpsClient\.login" server/    → only sap-central-session.ts + sap-routes.ts diagnostics
[ ] grep -rn "new SapHttpsClient" server/       → zero results outside sap-central-session.ts
[ ] grep -rn "sap-session-manager\|sap-auth-routes\|sap-auth-middleware" server/ → zero results
[ ] SAP_LEGACY_PER_USER_SESSION env var removed from all code

ENDPOINT VERIFICATION
[ ] POST /api/sap/connect returns 404
[ ] GET /api/sap/session/health returns 200 with correct data
[ ] POST /api/sap/session/force-reset returns success
[ ] GET /api/sap/connection/test (diagnostic) operates with user-supplied creds only

FUNCTIONAL VERIFICATION
[ ] Customer Sync completes without -1102
[ ] Vendor Full Scan completes without -1102
[ ] Item Full Scan completes without -1102
[ ] GRPO creation succeeds end-to-end
[ ] PLC PO posting succeeds end-to-end
[ ] Payroll trial JE posting succeeds end-to-end (Phase 1.1 fix verified)
[ ] Both AI agent cron runs complete with available: true SAP data

CONCURRENCY VERIFICATION
[ ] Two simultaneous sync operations complete without -1102
[ ] Force Reset immediately followed by Sync succeeds
[ ] Cron agent fires during active customer sync — no -1102
[ ] Server restart during sync — next sync after startup succeeds

SAP ACCOUNT GOVERNANCE
[ ] SAP administrator has confirmed integration account is dedicated
[ ] Desktop login prohibition notice issued for integration account
[ ] Concurrent session license count confirmed sufficient

UI VERIFICATION
[ ] No "Connect to SAP" / "Disconnect SAP" buttons visible on any page
[ ] SAP Integration page session status chip still operational
[ ] No browser console errors related to SAP session
[ ] Customer page Force Reset button operational

GOVERNANCE GUARD VERIFICATION
[ ] Test: call sapHttpsClient.login() from an unauthorized file in development → confirms [SAP GOVERNANCE VIOLATION] appears in console
[ ] Confirm: no GOVERNANCE VIOLATION logs appear in normal production operation

DOCUMENTATION
[ ] replit.md updated with SAP governance rule v1.2
[ ] sap-https-client.ts governance comment added
[ ] All diagnostic routes have D-1 through D-5 compliance headers
```

---

## 18. Production Verification Steps (Per Phase)

After each phase deploy:

1. Open `/sap-integration` → Connection tab → observe Session Health chip; confirm `alive: true`
2. Click **Test SAP B1 Connection** — expect success (uses user-supplied test credentials, not system account)
3. Trigger the specific feature migrated in that phase
4. Check server logs: confirm `[SapCentralSession] session_reuse` (not a new `login_attempt`) if session was already alive; confirm no duplicate login events
5. If possible: verify in SAP B1 administration that `Active Sessions = 1` (only one concurrent B1SESSION)
6. After Phase 5: confirm `POST /api/sap/connect` returns 404

---

*Document version: 1.2 | Last updated: 2026-05-14 | Author: THERMOPAC QMS engineering*
