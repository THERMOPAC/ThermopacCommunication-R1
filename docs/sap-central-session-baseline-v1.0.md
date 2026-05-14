# SAP Central Session Manager — Baseline v1.0

**Date**: 2026-05-14  
**Status**: Approved for implementation (Phase 0 + Phase 1)  
**Author**: THERMOPAC QMS Engineering

---

## Problem Statement

The THERMOPAC QMS had **3 independent SAP session managers** and **27 scattered `sapHttpsClient.login()` call sites** across 9 files — all sharing the same SAP user account. SAP B1 Service Layer allows only **one active session per user**. Any concurrent login attempt returned `-1102 Switch company error`, blocking all SAP operations.

### Root Cause
| Manager | Location | Scope |
|---------|----------|-------|
| `SapSessionManager` (per-user map) | `server/sap-session-manager.ts` | Interactive GRPO sessions |
| `_sapSession` singleton | `server/procurement-routes.ts` | Vendor/customer sync |
| `SapBpSync.sessionId` | `server/sap-b1-integration/sap-bp-sync.ts` | BP sync only |

Plus **27 direct `sapHttpsClient.login()` calls** in:
`admin-routes.ts` (7), `purchase-routes.ts` (7), `statutory-compliance-routes.ts` (4), `loan-advance-routes.ts` (2), `credentials-routes.ts` (2), `sap-auth-routes.ts` (1), `sap-routes.ts` (1), `sap-purchase-routes.ts` (1), `sap-bp-sync.ts` (1)

---

## Solution: One Centralized SAP Session Manager

**Single source file**: `server/sap-b1-integration/sap-central-session.ts`  
**Exported singleton**: `sapSession` (imported directly by all callers)

### Architecture

```
All server-initiated SAP calls:

  import { sapSession } from '../sap-b1-integration/sap-central-session';
  const resp = await sapSession.request({ method: 'GET', path: '/b1s/v1/...' });

                    ┌──────────────────────────────────────┐
                    │          SapCentralSession           │
                    │                                      │
                    │  State (module-level singleton)      │
                    │  • cookie: string | null             │
                    │  • expiresAt: Date | null            │
                    │  • loginPromise: Promise | null      │
                    │    (mutex — only 1 login at a time)  │
                    │                                      │
                    │  Public API                          │
                    │  • initialize()   startup cleanup    │
                    │  • getSession()   → cookie string    │
                    │  • request(opts)  → SapResponse      │
                    │  • invalidate()   logout + clear     │
                    │  • shutdown()     SIGTERM cleanup    │
                    │  • getHealth()    monitoring info    │
                    │  • testCredentials(u,p,db)           │
                    │    ephemeral test — own login/logout  │
                    └──────────────────────────────────────┘

Per-user sessions (GRPO / user-attributed SAP postings):
  • Kept in sap-session-manager.ts
  • Used ONLY by sap-auth-routes.ts (POST /api/sap/connect)
  • NOT used for any system/server-initiated SAP calls
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Mutex via `loginPromise` | If 2 routes call `getSession()` simultaneously, only ONE login fires; the second awaits the first |
| TTL: 25 min (SAP default 30 min idle) | Proactive refresh before SAP expires the session |
| Startup invalidation | On server start, always invalidate any persisted session — prevents stale cookie conflicts |
| Disk persistence | Sessions NOT restored on restart (cleared at startup); disk file used only for graceful shutdown logout |
| `-1102` recovery | Force-logout with constructed cookie → 1.5s wait → retry once |
| `testCredentials()` | Ephemeral login/logout with user-provided creds; never touches system session |

---

## Mandatory Conditions

1. **Only ONE centralized system SAP session manager** — `sapSession` from `sap-central-session.ts`
2. **All system SAP calls must use `sapSession.request()`** — no direct `sapHttpsClient.authenticatedRequest()` with system creds after migration
3. **SAP login must happen only inside `SapCentralSession._doLogin()`** — no direct `sapHttpsClient.login()` outside this file for system operations
4. **Per-user SAP sessions** kept only for GRPO / user-attributed SAP postings via `sap-session-manager.ts`
5. **New routes**: `GET /api/sap/session/health` and `POST /api/sap/session/clear`
6. **Server startup**: `sapSession.initialize()` called before routes are served — invalidates any old persisted session
7. **SIGTERM/SIGINT**: `sapSession.shutdown()` replaces old `invalidateSharedSapSession()` call

---

## Migration Phases

### Phase 0 — New Central Module ✅ (this baseline)
- Create `server/sap-b1-integration/sap-central-session.ts`
- Add `GET /api/sap/session/health` and `POST /api/sap/session/clear` to `credentials-routes.ts`

### Phase 1 — Migrate Procurement + Project + Credentials ✅ (this baseline)
- `server/procurement-routes.ts`: Remove `_sapSession`, `getSharedSapSession`, `invalidateSharedSapSession`; use `sapSession`
- `server/project-routes.ts`: Remove dynamic import; use `sapSession` directly
- `server/sap-b1-integration/credentials-routes.ts`: Full rewrite to use `sapSession`
- `server/index.ts`: Startup init + shutdown

### Phase 2 — Migrate High-Impact Fresh-Login Routes (FUTURE)
Files: `server/admin-routes.ts` (7 logins), `server/sap-b1-integration/purchase-routes.ts` (7 logins),
`server/statutory-compliance-routes.ts` (4 logins), `server/loan-advance-routes.ts` (2 logins),
`server/sap-b1-integration/sap-routes.ts` (1 login)

### Phase 3 — Migrate Self-Contained Session Classes (FUTURE)
Files: `server/sap-b1-integration/sap-bp-sync.ts`, `server/sap-b1-integration/sap-purchase-routes.ts`

### Phase 4 — Retire Old Managers (FUTURE)
- Retire `_sapSession` from `procurement-routes.ts` (done in Phase 1)
- Slim down `sap-session-manager.ts` to user-interactive only
- Remove duplicate VPN routes from `sap-routes.ts` (6 duplicate declarations)
- Remove duplicate `/connection/status` from `sap-routes.ts`

---

## Evidence Criteria (Phase 0 + 1)

After Phase 0+1 implementation, the following must hold:

| Check | Verification Command |
|-------|---------------------|
| No `getSharedSapSession` references | `grep -rn "getSharedSapSession" server/` → 0 results |
| No `invalidateSharedSapSession` references | `grep -rn "invalidateSharedSapSession" server/` → 0 results |
| No `_sapSession` references | `grep -rn "_sapSession" server/` → 0 results |
| procurement-routes uses sapSession | `grep -n "sapSession" server/procurement-routes.ts` → present |
| project-routes uses sapSession | `grep -n "sapSession" server/project-routes.ts` → present |
| credentials-routes uses sapSession | `grep -n "sapSession" server/sap-b1-integration/credentials-routes.ts` → present |
| Session health route exists | `grep -n "session/health" server/sap-b1-integration/credentials-routes.ts` → present |
| Session clear route exists | `grep -n "session/clear" server/sap-b1-integration/credentials-routes.ts` → present |

Note: Phase 2+ files (`admin-routes.ts`, `purchase-routes.ts`, etc.) still have direct logins — these are tracked for Phase 2 migration.

---

## File Inventory

### New Files
- `server/sap-b1-integration/sap-central-session.ts` — central session manager

### Modified Files (Phase 0+1)
- `server/procurement-routes.ts` — remove old session management
- `server/project-routes.ts` — remove dynamic import, use sapSession
- `server/sap-b1-integration/credentials-routes.ts` — use sapSession, add health/clear
- `server/index.ts` — startup init + shutdown

### Unchanged (Phase 2+)
- `server/admin-routes.ts`
- `server/sap-b1-integration/purchase-routes.ts`
- `server/statutory-compliance-routes.ts`
- `server/loan-advance-routes.ts`
- `server/sap-b1-integration/sap-routes.ts`
- `server/sap-b1-integration/sap-bp-sync.ts`
- `server/sap-b1-integration/sap-purchase-routes.ts`
- `server/sap-session-manager.ts` (user-interactive sessions — kept as-is)
