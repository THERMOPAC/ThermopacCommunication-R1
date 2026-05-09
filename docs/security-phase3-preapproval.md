# Phase 3 — Re-Authentication Middleware: Pre-Approval Document
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Status: AWAITING APPROVAL — DO NOT IMPLEMENT UNTIL APPROVED

---

## Approval Gate

| Field | Value |
|---|---|
| Phase | 3 — Re-Authentication Middleware |
| Blocked by | Phase 2 COMPLETE ✅ (09 May 2026) |
| Prepared by | THERMOPAC ERP Architect |
| Approved by | — |
| Approval date | — |
| Implementation start | Pending approval |

---

## Objective

Protect sensitive server-side actions with a re-authentication challenge even for already-authenticated users. When a user attempts a sensitive action (e.g. run payroll, approve a salary increment, change a user's role), they must re-verify their identity with their password or TOTP code before the action proceeds.

This phase adds zero new database tables (all required tables were provisioned in Phase 1: `sensitive_action_policies`, `reauth_audit_log`). It only adds server middleware, one new API route, and two small frontend files.

**One new UI element in this phase:** the re-auth dialog shown to the user when a sensitive action is attempted without a valid re-auth token.

---

## Files Changed — Exact List

| File | Change Type | Scope |
|---|---|---|
| `server/middleware/require-reauth.ts` | **NEW** | `requireReauth(actionKey)` Express middleware factory |
| `server/security-routes.ts` | **NEW** | `POST /api/security/reauth` — credential verification + token storage |
| `client/src/components/reauth-dialog.tsx` | **NEW** | Modal dialog prompting for password or TOTP; retries original action on success |
| `client/src/hooks/use-reauth.ts` | **NEW** | Intercepts 403 `REAUTH_REQUIRED` responses; orchestrates dialog + retry |
| `server/routes.ts` | **MODIFY** | Register `security-routes.ts` under `/api/security` |
| `server/admin-routes.ts` | **MODIFY** | 2 routes: `POST /payroll/increment-proposals/:id/approve`, `PUT /users/:id` |
| `server/payroll-routes.ts` | **MODIFY** | 1 route: `POST /run/start` (the official payroll pipeline entry point) |
| `server/module-permission-routes.ts` | **MODIFY** | 2 routes: `POST /api/users/:userId/module-permissions/:moduleName`, `DELETE /api/users/:userId/module-permissions/:moduleName` |
| `server/epc-permission-routes.ts` | **MODIFY** | 1 route: `POST /api/epc-permissions/change-requests/:id/apply` |
| `server/two-factor-routes.ts` | **MODIFY** | 1 route: `POST /api/2fa/disable` |

**Total new files: 4. Total modified files: 6.**  
**`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

---

## Route Name Clarification

The baseline (`docs/security-baseline-v1.0.md`) refers to `POST /api/payroll/run/official` as the route for `payroll.run_official`.  
The actual current route in `server/payroll-routes.ts` is `POST /api/payroll/run/start` — this is the official payroll pipeline entry point (the `/run/official` endpoint was deprecated 2026-03-17 and replaced by the `/run/start` + `/run/step` pipeline).  
**Phase 3 will apply `requireReauth('payroll.run_official')` to `POST /api/payroll/run/start`.** No deviation from the intent of the baseline.

---

## File 1 — `server/middleware/require-reauth.ts` (NEW)

### Purpose

An Express middleware factory. Applied to sensitive routes. Returns HTTP 403 `REAUTH_REQUIRED` if the user does not have a valid re-auth token in their session for the requested action. Passes through (calls `next()`) if the token is valid or if the feature flag is off.

### Exports

```typescript
requireReauth(actionKey: string): RequestHandler
// Usage: router.post('/path', ensureAuthenticated, requireReauth('payroll.run_official'), handler)

getSensitiveActionPolicy(actionKey: string): Promise<SensitiveActionPolicy | null>
// SELECT from sensitive_action_policies WHERE action_key = $1 AND is_active = true

writeReauthAudit(
  userId: number,
  actionKey: string,
  challengeType: string | null,
  outcome: ReauthOutcome,
  req: Request
): Promise<void>
// INSERT INTO reauth_audit_log — always in same transaction as parent action (C-10)
// outcome values: 'required' | 'passed' | 'failed' | 'reused' | 'cancelled'
// severity: 'info' for required/reused/passed/cancelled; 'warning' for failed; 'critical' for repeated failures
```

### Middleware Logic

```
requireReauth(actionKey) returns:
  async (req, res, next) => {
    1. If flag SECURITY_REAUTH_ENABLED = false → call next() (bypass entire check)
    
    2. Load policy = getSensitiveActionPolicy(actionKey)
       If no policy found → call next() (unknown action = fail open)
    
    3. Check req.session.reauthTokens?.[actionKey]:
         token = { at: timestamp, challengeType: string }
    
    4. Compute isValid:
         - If timeout_minutes = 0: token valid only if (Date.now() - token.at) < SINGLE_USE_GRACE_MS (60,000)
           AND token has not been consumed (token.consumed !== true)
         - If timeout_minutes > 0: token valid if (Date.now() - token.at) < timeout_minutes * 60,000
         - No token → isValid = false
    
    5. If isValid:
         If timeout_minutes = 0: mark token consumed (req.session.reauthTokens[actionKey].consumed = true)
         await writeReauthAudit(userId, actionKey, ..., 'reused', req)
         call next()
         return
    
    6. If not valid:
         await writeReauthAudit(userId, actionKey, policy.challengeType, 'required', req)
         return res.status(403).json({
           code: 'REAUTH_REQUIRED',
           actionKey,
           challengeType: policy.challenge_type,  // 'password' | 'totp' | 'any'
           timeoutMinutes: policy.timeout_minutes,
         })
  }
```

### Governance Rule C-10 Compliance

`writeReauthAudit` is always called inside a try/catch. If the audit write fails:
- `outcome='required'` path: audit failure → return 500 (parent request blocked)
- `outcome='reused'` path: audit failure → return 500 (action blocked)
This is C-10: audit write failure blocks the parent action. No silent swallow.

### SINGLE_USE_GRACE_MS

60,000 ms (60 seconds). Used only for `timeout_minutes = 0` actions. Covers the time between the user completing re-auth and the frontend retrying the original request. After the grace window or after first consumption (whichever comes first), the token is invalid and re-auth is required again.

---

## File 2 — `server/security-routes.ts` (NEW)

### New Routes

```
POST /api/security/reauth
  Auth: ensureAuthenticated (must be logged in)
  Re-auth: none (this IS the re-auth endpoint)
  Body: {
    actionKey: string,              — which sensitive action to clear
    credential?: string,            — password or TOTP code
    credentialType?: 'password' | 'totp',
    cancelled?: boolean             — true if user cancelled the dialog
  }
  Returns:
    200 { success: true }           — credential verified or cancelled recorded
    400 { message: ... }            — missing required fields
    401 { message: ... }            — wrong credential
    500                             — audit write failure (C-10)
```

### Endpoint Logic

```
POST /api/security/reauth:

  1. Load policy = getSensitiveActionPolicy(actionKey)
     If not found → 400 'Unknown action'

  2. If cancelled === true:
     - await writeReauthAudit(user.id, actionKey, null, 'cancelled', req)
     - return 200 { success: true }
  
  3. Verify credential based on policy.challenge_type:
     - 'password': bcrypt.compare(credential, user.password) — reuse bcrypt from auth.ts
     - 'totp':     verify TOTP code via existing speakeasy utility in two-factor-routes.ts
     - 'any':      try password first; if fails, try TOTP
  
  4. If credential wrong:
     - await writeReauthAudit(user.id, actionKey, credentialType, 'failed', req)
     - return 401 { message: 'Invalid credential. Please try again.' }
  
  5. If credential correct:
     - Store token: req.session.reauthTokens ??= {}
                   req.session.reauthTokens[actionKey] = { at: Date.now(), challengeType: credentialType }
     - await writeReauthAudit(user.id, actionKey, credentialType, 'passed', req)
     - return 200 { success: true }
```

### TOTP Utility Reuse

Phase 3 extracts the TOTP verification logic from `server/two-factor-routes.ts` into a shared utility. This is an internal refactor — no route signatures change. The shared utility is imported by both the existing TOTP verification flow and `POST /api/security/reauth`.

If TOTP is not enabled for the user and `challenge_type = 'totp'`, the endpoint returns 400 `'TOTP not enrolled'` — the user must contact a Superuser for admin re-auth (out of scope for Phase 3).

---

## File 3 — `client/src/components/reauth-dialog.tsx` (NEW)

### Behaviour

A Radix UI `<Dialog>` modal. Rendered at the top of `client/src/App.tsx` so it is available globally without prop drilling.

**Trigger:** The `use-reauth` hook shows this dialog when it intercepts a `403 REAUTH_REQUIRED` response.

**Dialog content based on `challengeType`:**

| challengeType | Field shown |
|---|---|
| `password` | Password input (type="password") |
| `totp` | 6-digit code input (type="text", maxLength=6) |
| `any` | Both — tab switcher between "Password" and "Authenticator Code" |

**User actions:**

| Action | Behaviour |
|---|---|
| Submit correct credential | Calls `POST /api/security/reauth` → on success, dialog closes, original action retried automatically |
| Submit wrong credential | Shows inline error message ("Invalid credential. Try again."); dialog stays open |
| Cancel / press Escape | Calls `POST /api/security/reauth { cancelled: true }` (for audit log C-06); dialog closes; shows toast: "Action cancelled — re-authentication is required to proceed." |
| Dialog stays open | While verifying, shows loading spinner on the Submit button |

**Dialog does not loop:** If the retry of the original action fails for a non-REAUTH reason (e.g. validation error), it surfaces that error normally. It does not show the re-auth dialog again.

---

## File 4 — `client/src/hooks/use-reauth.ts` (NEW)

### Purpose

A wrapper hook for `useMutation` (TanStack Query). Intercepts 403 `REAUTH_REQUIRED` responses. Shows the dialog and retries the original mutation after successful re-auth.

### API

```typescript
// Usage pattern — replaces standard useMutation:
const { mutate, isPending } = useReauthMutation({
  mutationFn: async (data) => apiRequest('POST', '/api/payroll/run/start', data),
  onSuccess: (data) => { /* ... */ },
  onError: (error) => { /* non-reauth errors surface here */ },
})

// Internally:
// 1. Wraps mutationFn
// 2. On 403 with code='REAUTH_REQUIRED': stores the pending call, opens the dialog
// 3. On dialog success: replays the original mutationFn call
// 4. On dialog cancel: calls onError with a user-cancelled error
```

### Scope

Only mutation calls (POST/PUT/DELETE) need this hook. Read-only queries (GET) are not protected by re-auth in Phase 3. The hook is a thin wrapper — it does not change query invalidation, optimistic updates, or any other TanStack Query behaviour.

### Global dialog state

Dialog visibility is managed via a lightweight React context (`ReauthContext`) mounted in `App.tsx`. `use-reauth.ts` reads from this context. This avoids duplication of dialog state across all protected mutations.

---

## Files 5–10 — Modified Routes

### 5 — `server/routes.ts`

Register the new security routes:
```typescript
import { registerSecurityRoutes } from './security-routes';
// Inside setupRoutes():
registerSecurityRoutes(app);
// Mounts: POST /api/security/reauth
```

### 6 — `server/admin-routes.ts` — Two routes

#### 6a — `POST /api/admin/payroll/increment-proposals/:id/approve`

Current signature:
```typescript
router.post('/payroll/increment-proposals/:id/approve', ensureAuthenticated, handler)
```

Phase 3 change — insert `requireReauth('payroll.approve_increment')` after `ensureAuthenticated`:
```typescript
router.post('/payroll/increment-proposals/:id/approve',
  ensureAuthenticated,
  requireReauth('payroll.approve_increment'),   // ← ADDED
  handler)
```

Action policy (from seeded `sensitive_action_policies`):
- `challenge_type`: `any` (password or TOTP)
- `timeout_minutes`: 15 (token valid for 15 minutes once issued)
- `apply_to_roles`: all roles

#### 6b — `PUT /api/admin/users/:id`

This is the user-edit route used for multiple purposes: name, email, role, salary, bank details.  
Phase 3 applies **conditional** re-auth based on what fields are being changed. The check happens inside the route handler, not as middleware, because different fields have different action keys.

Change description:
```
Inside PUT /api/admin/users/:id handler, after extracting req.body:

  if (body contains 'role' change) {
    → enforce requireReauth logic inline for action 'user.change_role'
      (Superuser only, totp, timeout=0)
  }

  if (body contains 'base_salary', 'monthly_salary', or 'salary_type' change) {
    → enforce requireReauth logic inline for action 'salary.update_base'
      (any, timeout=15)
  }

  if (body contains bank_account_number, ifsc_code, bank_name change) {
    → enforce requireReauth logic inline for action 'salary.update_bank_details'
      (password, timeout=0)
  }
```

**Implementation:** The inline check calls `checkReauthToken(req, actionKey, policy)` — a helper extracted from the middleware that returns `{ allowed: boolean, reason?: string }`. If not allowed, the route returns 403 REAUTH_REQUIRED and writes the audit row. This is identical logic to the middleware, just called manually inside the handler so that the action key is determined by the payload contents.

### 7 — `server/payroll-routes.ts` — `POST /run/start`

Current signature (the official payroll pipeline start):
```typescript
router.post('/run/start', async (req, res) => { ... })
```

Phase 3 change:
```typescript
router.post('/run/start',
  ensureAuthenticated,                          // ← already enforced in route registration
  requireReauth('payroll.run_official'),        // ← ADDED
  async (req, res) => { ... })
```

Action policy: `challenge_type=totp`, `timeout_minutes=0` (single-use grace window). Every run of the official payroll requires a fresh TOTP code. No caching.

### 8 — `server/module-permission-routes.ts` — Two routes

```typescript
router.post('/api/users/:userId/module-permissions/:moduleName',
  authenticateUser, isAdmin,
  requireReauth('user.change_permissions'),   // ← ADDED
  handler)

router.delete('/api/users/:userId/module-permissions/:moduleName',
  authenticateUser, isAdmin,
  requireReauth('user.change_permissions'),   // ← ADDED
  handler)
```

Action policy: `challenge_type=any`, `timeout_minutes=15`. One re-auth covers multiple permission changes within 15 minutes.

### 9 — `server/epc-permission-routes.ts` — One route

```typescript
app.post('/api/epc-permissions/change-requests/:id/apply',
  ensureAuthenticated,
  requireReauth('user.change_permissions'),   // ← ADDED
  handler)
```

Same action key as module permissions (`user.change_permissions`). The 15-minute token is shared across both permission change surfaces — one re-auth covers both.

### 10 — `server/two-factor-routes.ts` — One route

```typescript
// POST /api/2fa/disable (disabling 2FA for a user — Superuser admin action)
router.post('/disable',
  ensureAuthenticated,
  requireReauth('user.disable_2fa'),          // ← ADDED
  handler)
```

Action policy: `challenge_type=totp`, `timeout_minutes=0`. Every 2FA disable requires fresh TOTP. After the action, the re-auth token is consumed and cannot be reused.

---

## Feature Flag — Enablement

Phase 3 uses a single flag. Unlike Phase 2 (4 sequential steps), Phase 3 is a single enable:

```sql
UPDATE epc_migration_feature_flags SET enabled = true WHERE flag_name = 'SECURITY_REAUTH_ENABLED';
```

**Effect:** All 7 protected routes enforce re-auth on every request. Frontend dialog appears automatically via `use-reauth` hook. All re-auth events are written to `reauth_audit_log`.

**Flag OFF behaviour:** `requireReauth()` calls `next()` immediately. No audit row is written. Routes behave exactly as before Phase 3. Zero user impact.

**Flag state after Phase 3:**

| Flag | State |
|---|---|
| `SECURITY_LOGIN_AUDIT_ENABLED` | true (Phase 2) |
| `SECURITY_SESSION_REGISTRY_ENABLED` | true (Phase 2) |
| `SECURITY_LOCKOUT_ENABLED` | true (Phase 2) |
| `SECURITY_SESSION_INVALIDATION_ENABLED` | true (Phase 2) |
| `SECURITY_REAUTH_ENABLED` | ✅ true (Phase 3) |
| All Phase 4–8 flags | false |

---

## Rollback Plan

### Immediate rollback (single SQL, instant effect):

```sql
-- Disable re-auth enforcement globally (all 7 routes bypass immediately):
UPDATE epc_migration_feature_flags SET enabled = false WHERE flag_name = 'SECURITY_REAUTH_ENABLED';
```

Effect: takes effect on the **next request** with no server restart. All 7 protected routes pass without re-auth. The `reauth_audit_log` table retains all rows written before rollback.

### Code rollback:

All 4 new files can be deleted and all 6 modified files can be reverted via git to their Phase 2 state. Schema rollback is not required — `sensitive_action_policies` and `reauth_audit_log` simply remain unused (provisioned in Phase 1).

### User-impact rollback scenario:

If any user is blocked from a sensitive action after Phase 3 goes live (e.g. no TOTP enrolled but route requires TOTP):
1. Immediate: set flag false (takes effect instantly)
2. Investigate: check `reauth_audit_log` for `outcome='failed'` on that user
3. Resolution: either enrol TOTP for the user (existing 2FA flow), or update the `challenge_type` in `sensitive_action_policies` from `totp` to `any` via direct SQL, then re-enable flag

### Superuser-specific rollback:

If the Superuser (Prasad, userId=3) is unable to complete a TOTP re-auth challenge:
```sql
-- Temporarily change payroll.run_official to password challenge:
UPDATE sensitive_action_policies SET challenge_type = 'any' WHERE action_key = 'payroll.run_official';
-- After resolution, restore:
UPDATE sensitive_action_policies SET challenge_type = 'totp' WHERE action_key = 'payroll.run_official';
```
This is safe at any time and takes effect on the next request.

---

## Verification Tests — T-P3-01 through T-P3-21

All tests run via `executeSql` in the code_execution sandbox + live HTTP requests against the running server. A temporary test user (Employee role) and a Superuser test session are used. Test user cleaned up after all tests complete.

### Group A — Core Middleware Behaviour (requires `SECURITY_REAUTH_ENABLED = true`)

| ID | Test | Expected |
|---|---|---|
| T-P3-01 | POST to `requireReauth`-protected route without prior re-auth | HTTP 403 `{ code:'REAUTH_REQUIRED', actionKey, challengeType, timeoutMinutes }` |
| T-P3-02 | Same route with `SECURITY_REAUTH_ENABLED = false` | HTTP 200 (or normal route response) — flag bypass works |
| T-P3-03 | `POST /api/security/reauth` with wrong password → check reauth_audit_log | HTTP 401; `outcome='failed'`, `severity='warning'` in log |
| T-P3-04 | `POST /api/security/reauth` with correct password → check session + log | HTTP 200; `outcome='passed'` in log; `req.session.reauthTokens[actionKey]` set |
| T-P3-05 | After T-P3-04 (timeout_minutes=15 action), retry protected route within window | HTTP 200 (or normal response); `outcome='reused'` in reauth_audit_log |
| T-P3-06 | After T-P3-04, manually expire token (set `at = Date.now() - 16*60*1000`), retry route | HTTP 403 `REAUTH_REQUIRED` — expired token not accepted |
| T-P3-07 | For `timeout_minutes=0` action: POST reauth → POST protected route → POST protected route again | First: passes; second: HTTP 403 (single-use — token consumed after first use) |
| T-P3-08 | Cancel re-auth: `POST /api/security/reauth { cancelled: true }` → check log | HTTP 200; `outcome='cancelled'` in reauth_audit_log |

### Group B — TOTP Challenge (requires user with 2FA enrolled)

| ID | Test | Expected |
|---|---|---|
| T-P3-09 | `POST /api/security/reauth { credentialType:'totp', credential:'<valid_code>' }` for Superuser | HTTP 200; `outcome='passed'` |
| T-P3-10 | Same with wrong TOTP code | HTTP 401; `outcome='failed'` |
| T-P3-11 | `POST /api/security/reauth { credentialType:'totp' }` for user with no TOTP enrolled | HTTP 400 `'TOTP not enrolled'` |

### Group C — Route-Level Enforcement

| ID | Test | Expected |
|---|---|---|
| T-P3-12 | `POST /api/admin/payroll/increment-proposals/:id/approve` without re-auth token | HTTP 403 `REAUTH_REQUIRED` with `actionKey='payroll.approve_increment'` |
| T-P3-13 | `POST /api/payroll/run/start` without re-auth token | HTTP 403 `REAUTH_REQUIRED` with `actionKey='payroll.run_official'` |
| T-P3-14 | `PUT /api/admin/users/:id` with role change field in body, without re-auth token | HTTP 403 `REAUTH_REQUIRED` with `actionKey='user.change_role'` |
| T-P3-15 | `PUT /api/admin/users/:id` with name-only change (no sensitive field) | HTTP 200 — no re-auth required for non-sensitive fields |
| T-P3-16 | `POST /api/users/:userId/module-permissions/:moduleName` without re-auth token | HTTP 403 `REAUTH_REQUIRED` with `actionKey='user.change_permissions'` |
| T-P3-17 | `DELETE /api/users/:userId/module-permissions/:moduleName` without re-auth token | HTTP 403 `REAUTH_REQUIRED` with `actionKey='user.change_permissions'` |
| T-P3-18 | `POST /api/epc-permissions/change-requests/:id/apply` without re-auth token | HTTP 403 `REAUTH_REQUIRED` with `actionKey='user.change_permissions'` |
| T-P3-19 | `POST /api/2fa/disable` without re-auth token | HTTP 403 `REAUTH_REQUIRED` with `actionKey='user.disable_2fa'` |

### Group D — Governance & Safety

| ID | Test | Expected |
|---|---|---|
| T-P3-20 | `grep -rn "DELETE FROM.*reauth\|UPDATE.*reauth" server/` | 0 results |
| T-P3-21 | `diff payroll-salary-core.ts` vs Phase 2 checkpoint | 0 lines changed |

---

## Zero-Trust Audit Plan — ZT3-01 through ZT3-11

Performed after the flag is enabled and T-P3-01 through T-P3-21 have passed.

| Check | Method | Pass Condition |
|---|---|---|
| ZT3-01 | `grep -rn "DELETE FROM.*reauth\|UPDATE.*reauth" server/` | 0 matches on `reauth_audit_log` |
| ZT3-02 | `diff <(git show HEAD:server/payroll-salary-core.ts) server/payroll-salary-core.ts` | 0 lines changed |
| ZT3-03 | Direct SQL: `DELETE FROM reauth_audit_log WHERE id = <any>` | Trigger raises `append-only` error |
| ZT3-04 | Direct SQL: `UPDATE reauth_audit_log SET outcome='x' WHERE id = <any>` | Trigger raises `append-only` error |
| ZT3-05 | Archival transition on unarchived `reauth_audit_log` row (`archived_at` + `archive_path`) | Permitted (`UPDATE 1`) |
| ZT3-06 | Second archival stamp on same row | Trigger blocks |
| ZT3-07 | Confirm all 5 outcome types exist in `reauth_audit_log`: `required`, `failed`, `passed`, `cancelled`, `reused` | SELECT DISTINCT outcome returns all 5 |
| ZT3-08 | `SECURITY_REAUTH_ENABLED = false` → all 7 protected routes return 200/normal response | Confirmed per T-P3-02 pattern for all 7 routes |
| ZT3-09 | `grep -n "password\|secret\|totp_key\|authSecret" client/src/components/reauth-dialog.tsx` | 0 hardcoded credential literals |
| ZT3-10 | `grep -n "DELETE FROM\|UPDATE.*SET" server/security-routes.ts` | 0 matches (no audit table mutations in route file) |
| ZT3-11 | Confirm `req.session.reauthTokens` is server-side only: check that no Set-Cookie or response body exposes token contents | Token object never appears in HTTP response body or headers |

---

## What Does NOT Change in Phase 3

| Item | Status |
|---|---|
| Database schema (all tables, columns, triggers) | **No change** — all provisioned in Phase 1 |
| `POST /api/login` flow | **No change** — Phase 2 unchanged |
| 2FA challenge at login (`twoFactorEnabled` path) | **No change** — re-auth is a separate concept from login 2FA |
| `POST /api/change-password` and `POST /api/reset-password` | **No change** — Phase 2 session invalidation unchanged |
| All attendance routes | **No change** (Phase 5) |
| `server/payroll-salary-core.ts` | **ZERO changes — guaranteed** |
| `shared/schema.ts` | **No change** |
| Phase 2 feature flags (`LOGIN_AUDIT`, `SESSION_REGISTRY`, `LOCKOUT`, `SESSION_INVALIDATION`) | **No change** — all remain `true` |
| All Phase 4–8 feature flags | **No change** — remain `false` |
| Rate limiter (`loginLimiter`) | **No change** |
| GET endpoints for admin dashboards | **No change** — read-only routes are not re-auth-protected in Phase 3 |

---

## Deviation Triggers

The following require a new baseline version before proceeding:

- Adding re-auth to any route not listed in the exact file list above
- Adding a `GET` re-auth status endpoint (e.g. "is re-auth valid for this action?") — not in baseline
- Sending re-auth events by email or notification (Phase 8 monitoring item)
- Enforcing re-auth on attendance routes (Phase 7 item)
- Persisting re-auth tokens to the database instead of session (architectural change — requires new baseline)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| User with no TOTP enrolled blocked on `totp` action | Medium for current production (2FA rollout not complete) | `sensitive_action_policies.challenge_type` can be changed to `any` via SQL before enabling flag; no server restart needed |
| Flag blocks Superuser from running payroll | Low (Superuser has TOTP enrolled) | Direct SQL: `UPDATE sensitive_action_policies SET challenge_type='any' WHERE action_key='payroll.run_official'` |
| Re-auth dialog appears unexpectedly for non-sensitive PUT /admin/users/:id | Zero | Conditional check inspects request body for sensitive fields only; name/email changes pass through |
| Audit write failure (C-10) blocks a sensitive action | Low (DB healthy) | Correct behaviour per C-10 — action returns 500, not silent bypass |
| TOTP single-use grace window (60 s) abused for replay | Near-zero | Token is marked `consumed=true` after first use; second attempt with same token → 403 even within grace window |
| `payroll-salary-core.ts` touched | Zero | Not in file list; diff verified post-implementation |
| Session store grows with `reauthTokens` keys | Negligible | Keys are short strings; tokens are small objects; session payload stays well under PG jsonb limits |

---

## Implementation Order (for when approved)

1. Create `server/middleware/require-reauth.ts` (pure middleware, no side effects on existing routes)
2. Create `server/security-routes.ts` (new `POST /api/security/reauth` endpoint)
3. Register security routes in `server/routes.ts`
4. Modify 5 route files: `admin-routes.ts`, `payroll-routes.ts`, `module-permission-routes.ts`, `epc-permission-routes.ts`, `two-factor-routes.ts`
5. Create `client/src/components/reauth-dialog.tsx`
6. Create `client/src/hooks/use-reauth.ts`
7. Mount `ReauthContext` + `ReauthDialog` in `client/src/App.tsx`
8. Verify server starts without errors; verify flag is still `false`
9. Enable flag: `UPDATE epc_migration_feature_flags SET enabled = true WHERE flag_name = 'SECURITY_REAUTH_ENABLED'`
10. Run T-P3-01 through T-P3-21
11. Run zero-trust audit ZT3-01 through ZT3-11
12. Submit `docs/security-phase3-audit-evidence.md`
13. Request Phase 4 approval

---

*Document prepared by: THERMOPAC ERP Architect*  
*Date: 09 May 2026*  
*Awaiting approval from THERMOPAC authorised personnel before any implementation begins.*
