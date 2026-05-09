# Phase 2 — Login Security: Pre-Approval Document
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Status: AWAITING APPROVAL — DO NOT IMPLEMENT UNTIL APPROVED

---

## Approval Gate

| Field | Value |
|---|---|
| Phase | 2 — Login Security (Lockout · Audit · Session) |
| Blocked by | Phase 1 COMPLETE ✅ (09 May 2026) |
| Prepared by | THERMOPAC ERP Architect |
| Approved by | — |
| Approval date | — |
| Implementation start | Pending approval |

---

## Objective

Gate all login attempts behind the policy engine seeded in Phase 1. Write an immutable audit row for every login attempt. Enforce per-role account lockout. Register active sessions. Invalidate all other sessions when a user changes or resets their password.

**Zero user-facing UI changes in this phase.**

---

## Files Changed — Exact List

| File | Change Type | Scope |
|---|---|---|
| `server/security-login-service.ts` | **NEW** | Thin service layer for Phase 2 login security logic |
| `server/auth.ts` | **MODIFY** | 3 routes: `POST /api/login`, `POST /api/change-password`, `POST /api/reset-password` |
| `server/types.ts` | **MODIFY** | Add `invalidateUserSessions(userId)` to `IStorage` interface |
| `server/storage.ts` | **MODIFY** | Implement `invalidateUserSessions(userId)` on `DatabaseStorage` |

**Total files touched: 4.  
`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

---

## File 1 — `server/security-login-service.ts` (NEW)

A new service file that keeps `auth.ts` thin. All login security logic lives here.

### Exports

```
getLoginPolicyForRole(role: string): Promise<LoginSecurityPolicy | null>
  - SELECT from login_security_policies WHERE apply_to_roles @> ARRAY[role]
  - Returns the matching policy row or null (treated as 'standard')

checkLockoutStatus(userId: number): Promise<{ isLocked: boolean; lockedUntil: Date | null }>
  - SELECT locked_until FROM users WHERE id = userId
  - Returns { isLocked: locked_until > now(), lockedUntil }

recordFailedAttempt(
  userId: number,
  policy: LoginSecurityPolicy,
  ip: string,
  device: string
): Promise<void>
  - In a single DB transaction:
    1. INCREMENT users.failed_login_attempts WHERE id = userId
    2. If failed_login_attempts >= policy.max_failed_attempts:
         SET locked_until = now() + policy.lockout_minutes * INTERVAL '1 minute'
    3. INSERT INTO login_audit_log (outcome='failure', severity=computed, ...)
  - severity logic: attempts < threshold-1 → 'info'; attempts = threshold-1 → 'warning';
    lockout triggered → 'critical'

recordSuccessfulLogin(
  userId: number,
  sessionId: string,
  ip: string,
  device: string
): Promise<void>
  - In a single DB transaction:
    1. UPDATE users SET failed_login_attempts=0, locked_until=NULL,
                        last_login_at=now(), last_login_ip=ip, last_login_device=device
    2. INSERT INTO login_audit_log (outcome='success', severity='info', ...)
    3. INSERT INTO user_session_registry (user_id, session_id, ip_address, user_agent, ...)
       — guarded by SECURITY_SESSION_REGISTRY_ENABLED flag

computeSeverity(attempts: number, maxAttempts: number): 'info' | 'warning' | 'critical'
  - info:     attempts < maxAttempts - 1
  - warning:  attempts === maxAttempts - 1
  - critical: attempts >= maxAttempts (lockout point)

isFeatureFlagEnabled re-exported from server/utils/epc-migration-helpers.ts (no new copy)
```

### Invariant (Governance Rule C-10)

`writeLoginAudit` is always called **inside** the same DB transaction as the parent action. If the audit insert fails, the transaction rolls back and the login/lockout action is also rolled back. No silent swallow.

---

## File 2 — `server/auth.ts` Modifications

### 2.1 — `POST /api/login` (lines 257–321)

**Current flow:**  
`passport.authenticate("local")` → if 2FA required, issue challenge → else `req.login()` → respond.

**Phase 2 additions — inserted AFTER `passport.authenticate` resolves `user`:**

```
Step A (BEFORE req.login, on authentication FAILURE — i.e. user === false):
  if (SECURITY_LOGIN_AUDIT_ENABLED):
    look up policy for the username that was attempted
    if user exists: recordFailedAttempt(userId, policy, ip, device)
    else: write a login_audit_log row with outcome='failure_unknown_user', user_id=NULL

Step B (BEFORE req.login, on authentication SUCCESS):
  if (SECURITY_LOCKOUT_ENABLED):
    const lockStatus = await checkLockoutStatus(user.id)
    if (lockStatus.isLocked):
      write login_audit_log row: outcome='blocked_lockout', severity='critical'
      return 423 { message: 'Account locked. Try again after <lockedUntil>.' }

Step C (AFTER req.login succeeds — session is now established):
  if (SECURITY_LOGIN_AUDIT_ENABLED):
    await recordSuccessfulLogin(user.id, req.sessionID, ip, device)
    // recordSuccessfulLogin internally guards session registry write behind
    // SECURITY_SESSION_REGISTRY_ENABLED flag
```

**IP / device extraction (same pattern already used at line 286):**
```typescript
const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
           || req.socket.remoteAddress || 'unknown';
const device = req.headers['user-agent'] || 'unknown';
```

**No change to the rate-limiter (`loginLimiter`) — it stays in place alongside the lockout.**  
The rate-limiter is IP-based; the lockout is user-based. Both operate independently.

**No change to the 2FA challenge flow** — `recordFailedAttempt` / `recordSuccessfulLogin` are called only after the credential check, not after the 2FA check. 2FA events continue to write to `two_factor_audit_log` as today.

---

### 2.2 — `POST /api/change-password` (lines 324–461)

**Current last step:** updates password in DB, responds 200.

**Phase 2 addition — after `storage.updateUserPassword()` succeeds:**

```
if (SECURITY_SESSION_INVALIDATION_ENABLED):
  await storage.invalidateUserSessions(user.id, exceptSessionId = req.sessionID)
  // Destroys all PostgreSQL sessions for this user EXCEPT the current session.
  // User stays logged in; all other devices/tabs are signed out.
```

No audit log write in this route in Phase 2. (Password-change audit logging is a Phase 6 item under the `reauth_audit_log` governance; not in Phase 2 scope.)

---

### 2.3 — `POST /api/reset-password` (lines 554–623)

**Current last step:** clears reset token, sends email, responds 200.

**Phase 2 addition — after `storage.clearUserResetToken()` succeeds:**

```
if (SECURITY_SESSION_INVALIDATION_ENABLED):
  await storage.invalidateUserSessions(user.id, exceptSessionId = null)
  // Destroys ALL PostgreSQL sessions for this user — no exceptions.
  // Password was reset externally; every active session must be invalidated.
```

---

## File 3 — `server/types.ts` Modification

Add one method to the `IStorage` interface (line 41 onwards):

```typescript
invalidateUserSessions(userId: number, exceptSessionId?: string | null): Promise<number>;
// Returns: count of sessions destroyed
```

---

## File 4 — `server/storage.ts` Modification

Implement the new method on `DatabaseStorage`:

```typescript
async invalidateUserSessions(userId: number, exceptSessionId?: string | null): Promise<number> {
  // The connect-pg-simple session table stores passport user ID as:
  //   sess::jsonb -> 'passport' -> 'user'  (integer stored as JSON number)
  // Table name: 'session' (confirmed at storage.ts line 148)

  let query = `
    DELETE FROM session
    WHERE (sess::jsonb -> 'passport' ->> 'user')::integer = $1
  `;
  const params: (number | string)[] = [userId];

  if (exceptSessionId) {
    query += ` AND sid != $2`;
    params.push(exceptSessionId);
  }

  const result = await pool.query(query, params);
  return result.rowCount ?? 0;
}
```

**Note:** `pool` is the existing pg `Pool` instance already used in `storage.ts` for direct SQL. No new dependency.

---

## Feature Flags — Enablement Sequence

Phase 2 enables flags in **4 sequential steps**. Each step is a separate SQL command. Each step must be verified before the next is enabled.

### Step 1 — Audit only (no enforcement, no risk)
```sql
UPDATE epc_migration_feature_flags SET enabled = true WHERE flag_name = 'SECURITY_LOGIN_AUDIT_ENABLED';
```
Effect: Every login attempt writes to `login_audit_log`. Lockout NOT active. Zero impact on users.  
Verify: Insert rows appear in `login_audit_log` after test logins.

### Step 2 — Session registry
```sql
UPDATE epc_migration_feature_flags SET enabled = true WHERE flag_name = 'SECURITY_SESSION_REGISTRY_ENABLED';
```
Effect: Successful logins also write a row to `user_session_registry`. No enforcement.  
Verify: Rows appear in `user_session_registry` after next login.

### Step 3 — Lockout enforcement (enforcement begins here)
```sql
UPDATE epc_migration_feature_flags SET enabled = true WHERE flag_name = 'SECURITY_LOCKOUT_ENABLED';
```
Effect: Failed login attempts increment counter; threshold triggers lockout; locked accounts get 423.  
**This is the highest-risk flag.** Verify on Superuser account first before enabling broadly.  
Rollback: `UPDATE epc_migration_feature_flags SET enabled = false WHERE flag_name = 'SECURITY_LOCKOUT_ENABLED';`

### Step 4 — Session invalidation on password change/reset
```sql
UPDATE epc_migration_feature_flags SET enabled = true WHERE flag_name = 'SECURITY_SESSION_INVALIDATION_ENABLED';
```
Effect: Changing or resetting a password destroys all other active sessions for that user.  
Verify: After password change, second browser tab is signed out on next API call.

---

## Rollback Plan

### Immediate rollback (any flag):
```sql
-- Roll back lockout enforcement instantly:
UPDATE epc_migration_feature_flags SET enabled = false WHERE flag_name = 'SECURITY_LOCKOUT_ENABLED';

-- Roll back audit logging:
UPDATE epc_migration_feature_flags SET enabled = false WHERE flag_name = 'SECURITY_LOGIN_AUDIT_ENABLED';

-- Roll back session registry:
UPDATE epc_migration_feature_flags SET enabled = false WHERE flag_name = 'SECURITY_SESSION_REGISTRY_ENABLED';

-- Roll back session invalidation:
UPDATE epc_migration_feature_flags SET enabled = false WHERE flag_name = 'SECURITY_SESSION_INVALIDATION_ENABLED';
```

Setting a flag to `false` takes effect on the **next request** — no server restart required.

### If a user is incorrectly locked out:
```sql
-- Unlock a specific user immediately (safe at any time):
UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = <userId>;
```

### Code rollback:
- `auth.ts`, `storage.ts`, `types.ts`, and `security-login-service.ts` can be reverted to their Phase 1 state via git.
- Schema rollback is **not required** — the columns added in Phase 1 simply remain unused.

### Lockout recovery edge case — Superuser locked out:
If the Superuser account itself is locked (possible only after Step 3 is enabled):
```sql
-- Run directly from DB — no login required:
UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE role = 'Superuser';
```
This SQL is safe to run at any time and is idempotent.

---

## Verification Tests — T-P2-01 through T-P2-22

All tests run via `executeSql` in the code_execution sandbox + live HTTP requests against the running server.

### Group A — Login Audit (requires `SECURITY_LOGIN_AUDIT_ENABLED = true`)

| ID | Test | Expected |
|---|---|---|
| T-P2-01 | POST /api/login with correct credentials → check login_audit_log | Row with `outcome='success'`, `user_id=<id>`, `ip_address` populated |
| T-P2-02 | POST /api/login with wrong password → check login_audit_log | Row with `outcome='failure'`, `severity='info'` (first attempt) |
| T-P2-03 | POST /api/login with wrong password × (maxAttempts-1) → check severity | Last row has `severity='warning'` |
| T-P2-04 | Attempt DELETE on login_audit_log test row | Trigger blocks — `append-only` error |
| T-P2-05 | `SECURITY_LOGIN_AUDIT_ENABLED = false` → successful login | No new row in login_audit_log |

### Group B — Lockout (requires `SECURITY_LOCKOUT_ENABLED = true`)

| ID | Test | Expected |
|---|---|---|
| T-P2-06 | POST /api/login with wrong password × max_failed_attempts times | HTTP 401 on each failure; on final failure `locked_until` set |
| T-P2-07 | POST /api/login with CORRECT password while locked | HTTP 423 `Account locked` |
| T-P2-08 | `locked_until` passes (set to `now() - 1 second` via SQL) → login with correct password | HTTP 200; `failed_login_attempts` reset to 0 |
| T-P2-09 | Lockout row in login_audit_log has `outcome='blocked_lockout'`, `severity='critical'` | Confirmed |
| T-P2-10 | `SECURITY_LOCKOUT_ENABLED = false` → correct login while `locked_until` is set in DB | HTTP 200 — flag off means no lockout check |
| T-P2-11 | After lockout resolved: `failed_login_attempts = 0`, `locked_until = NULL` in DB | Confirmed via SELECT |

### Group C — Session Registry (requires `SECURITY_SESSION_REGISTRY_ENABLED = true`)

| ID | Test | Expected |
|---|---|---|
| T-P2-12 | Successful login → SELECT from user_session_registry | Row with matching `user_id`, `session_id = req.sessionID`, `ip_address` |
| T-P2-13 | `SECURITY_SESSION_REGISTRY_ENABLED = false` → successful login | No new row in user_session_registry |

### Group D — Session Invalidation (requires `SECURITY_SESSION_INVALIDATION_ENABLED = true`)

| ID | Test | Expected |
|---|---|---|
| T-P2-14 | Login from two browsers (A and B) for same user. Change password in browser A. Call GET /api/user in browser B. | Browser B gets 401 (session destroyed) |
| T-P2-15 | After password change: browser A (session that performed the change) still authenticated | Browser A still gets 200 on GET /api/user |
| T-P2-16 | POST /api/reset-password (token-based): both browsers A and B lose sessions | GET /api/user on both → 401 |
| T-P2-17 | `SECURITY_SESSION_INVALIDATION_ENABLED = false` → password change → other sessions persist | Browser B still gets 200 on GET /api/user |

### Group E — Governance & Safety Checks

| ID | Test | Expected |
|---|---|---|
| T-P2-18 | `grep -rn "DELETE FROM.*login_audit\|UPDATE.*login_audit" server/` | 0 results |
| T-P2-19 | `diff <(git show HEAD~1:server/payroll-salary-core.ts) server/payroll-salary-core.ts` | 0 diff lines |
| T-P2-20 | All 4 SECURITY_ flags from Phase 2 active: attempt login with bad password on a locked account | Exactly 1 row in login_audit_log per attempt — no duplicates |
| T-P2-21 | Simulate audit write failure (break login_audit_log temporarily) — attempt login | Login returns 500 — parent action rolls back (C-10 verified) |
| T-P2-22 | `failed_login_attempts` counter in `users` table: high_security role threshold = 3; standard = 5 | After 3 failures for SM/GM/Superuser → locked; after 5 failures for Employee → locked |

---

## Zero-Trust Audit Plan

Performed after all 4 flags are enabled and T-P2-01 through T-P2-22 have passed.

| Check | Method | Pass Condition |
|---|---|---|
| ZT2-01 | `grep -rn "DELETE FROM.*audit\|UPDATE.*audit" server/` | 0 matches on any security audit table |
| ZT2-02 | `diff payroll-salary-core.ts` vs Phase 1 checkpoint | 0 lines changed |
| ZT2-03 | Direct SQL: `DELETE FROM login_audit_log WHERE id = <any>` | Trigger raises `append-only` error |
| ZT2-04 | Direct SQL: `UPDATE login_audit_log SET outcome='x' WHERE id = <any>` | Trigger raises `append-only` error |
| ZT2-05 | Archival transition test: set `archived_at` + `archive_path` on login_audit_log row | Permitted (one-way only) |
| ZT2-06 | Second archival stamp on same row | Trigger blocks |
| ZT2-07 | Locked user cannot login even with correct password (LOCKOUT_ENABLED = true) | 423 returned |
| ZT2-08 | login_audit_log rows exist for: success, failure, warning, critical, blocked_lockout | All 5 outcome types confirmed present |
| ZT2-09 | Session invalidation: after `invalidateUserSessions()`, DB `SELECT COUNT(*) FROM session WHERE ...` for that userId | Returns 0 (or 1 if exceptSessionId was provided) |
| ZT2-10 | Flag rollback: set `SECURITY_LOCKOUT_ENABLED = false`, attempt login with locked account | 200 returned — flag off works instantly |
| ZT2-11 | Confirm `server/security-login-service.ts` does not contain any raw UPDATE/DELETE on audit tables | grep: 0 matches |

---

## What Does NOT Change in Phase 2

| Item | Status |
|---|---|
| Frontend / UI | **No change** |
| 2FA challenge flow (`twoFactorAuditLog` writes) | **No change** — remains as-is |
| `POST /api/forgot-password` | **No change** |
| `GET /api/validate-reset-token` | **No change** |
| `POST /api/register` | **No change** |
| `POST /api/logout` | **No change** |
| Rate-limiter (`loginLimiter`, IP-based) | **No change** — remains in parallel with lockout |
| All attendance routes | **No change** (Phase 5) |
| All payroll routes | **No change** |
| `server/payroll-salary-core.ts` | **ZERO changes — guaranteed** |
| `shared/schema.ts` | **No change** |
| Drizzle ORM schema | **No change** |
| Feature flags not listed above | **No change** — all remain false |

---

## Deviation Triggers

The following require a new baseline version before proceeding:

- Adding UI to display login_audit_log to admin (Phase 6 item — not Phase 2)
- Adding a `POST /api/admin/users/:id/unlock` route (Phase 6 item)
- Enforcing 2FA at login (Phase 6 item — `SECURITY_2FA_POLICY_ENABLED` flag)
- Enforcing device trust at login (Phase 4 item)
- Any change not in the exact file list above

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Superuser locked out after flag Step 3 | Low (3 attempts needed) | Direct SQL unlock; Superuser tests first before enabling for all |
| Audit write failure blocks login | Low (DB healthy) | C-10 is correct behaviour — login returns 500, not silent bypass |
| `invalidateUserSessions` destroys all sessions including current | Zero — `exceptSessionId` parameter prevents it for change-password | Test T-P2-15 verifies |
| `invalidateUserSessions` fails on MemoryStore fallback | Low | MemoryStore used only in dev when PG unavailable; method degrades gracefully |
| `payroll-salary-core.ts` touched | Zero | Not in file list; verified via diff post-implementation |

---

## Implementation Order (for when approved)

1. Create `server/security-login-service.ts` (pure functions, no side effects on existing routes)
2. Add `invalidateUserSessions` to `server/types.ts` + `server/storage.ts`
3. Modify `server/auth.ts` — all 3 route changes, all behind feature flag guards
4. Verify server starts without errors
5. Enable flags in order: Step 1 → verify → Step 2 → verify → Step 3 → verify → Step 4 → verify
6. Run T-P2-01 through T-P2-22
7. Run zero-trust audit ZT2-01 through ZT2-11
8. Submit `docs/security-phase2-audit-evidence.md`
9. Request Phase 3 approval

---

*Document prepared by: THERMOPAC ERP Architect*  
*Date: 09 May 2026*  
*Awaiting approval from THERMOPAC authorised personnel before any implementation begins.*
