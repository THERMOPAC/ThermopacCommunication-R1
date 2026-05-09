# Phase 6 — 2FA Administration UI: Pre-Approval Document
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Revision: Rev 2 — Rate limiting and audit severity added
## Status: AWAITING APPROVAL — DO NOT IMPLEMENT UNTIL APPROVED

---

## Revision History

| Rev | Date | Change |
|---|---|---|
| Rev 1 | 09 May 2026 | Initial pre-approval document |
| Rev 2 | 09 May 2026 | Added: rate limiting for reset/policy/remind endpoints; audit severity mapping; anti-spam confirmation for remind; escalating severity for repeated failed reset attempts; T-2F16–T-2F22; ZT-P6-13–ZT-P6-17 |

---

## Approval Gate

| Field | Value |
|---|---|
| Phase | 6 — 2FA Administration UI |
| Blocked by | Phase 5 COMPLETE ✅ (09 May 2026) |
| Prepared by | THERMOPAC ERP Architect |
| Approved by | — |
| Approval date | — |
| Implementation start | Pending approval |

---

## Objective

Provide the Superuser with a complete administration interface for the global 2FA policy and per-user 2FA management. Specifically:

1. **Global 2FA policy management** — read and update the `two_fa_global_policy` singleton; every update writes an immutable audit row to `two_fa_policy_audit_log` in the same transaction.
2. **Enrollment status report** — per-user view of 2FA enrolment state (enabled / not enrolled / locked) for Superuser and HR.
3. **Per-user 2FA audit log** — view `two_factor_audit_log` events for any user.
4. **Admin 2FA reset** — Superuser can force-clear another user's 2FA (TOTP re-auth required), writing an audit event.
5. **Reminder endpoint** — return count of users without 2FA; send reminder email to each via existing nodemailer infrastructure (`SENDGRID_API_KEY`).
6. **Session invalidation on self-disable** — when a user disables their own 2FA, all other active sessions for that account are immediately invalidated (single-line addition to existing route).

**Phase 6 is API-only. No frontend UI implementation in this phase.**

**`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

**Zero new database tables.** All required tables were provisioned in Phase 1:
- `two_fa_global_policy` — singleton seeded (id=1, enforcement_mode='optional')
- `two_fa_policy_audit_log` — immutable governance log (1 seed row, permanent)
- `two_factor_audit_log` — per-user 2FA event log (append-only)
- `users` — `twoFactorEnabled`, `twoFactorSecret`, `twoFactorBackupCodes`, `twoFactorFailedAttempts`, `twoFactorLockedUntil`, `twoFactorChallengeNonce` (all provisioned Phase 1)

**Zero new npm packages.** All logic uses existing libraries: `drizzle-orm`, `requireReauth` middleware, `storage.invalidateUserSessions()`, `nodemailer`.

**No new feature flags.** The admin routes are Superuser/HR-gated by role check. The global 2FA policy table itself (`enforcement_mode`) governs whether 2FA is required at login — that field already exists and is not touched by the enforcement logic in Phase 6 (Phase 6 only reads and writes the policy row; the login enforcement path in `server/auth.ts` is not changed in Phase 6).

**Plane isolation strictly maintained:** Phase 6 is entirely Plane A (Application Security). No GPS, no `attendance_location_audit_log`, no `attendance_security_policies`, no Plane B fields referenced anywhere.

---

## Current State

### two_fa_global_policy (Phase 1 seeded — confirmed live)

| id | enforcement_mode | apply_to_roles | enforcement_from_date | grace_period_enabled | grace_period_days | updated_at |
|---|---|---|---|---|---|---|
| 1 | `optional` | `{}` | null | true | 14 | 2026-05-09 02:38:31 UTC |

### two_fa_policy_audit_log (Phase 1 provisioned — confirmed live)

- Row count: 1 (Phase 1 seed row)
- Immutability trigger: to be verified (ZT-P6-01 / ZT-P6-02)

### two_factor_audit_log (existing — operational since Phase 2)

- Columns: `id`, `user_id`, `action`, `ip_address`, `user_agent`, `metadata`, `created_at`
- Actions already written by existing self-service routes: `setup_initiated`, `activated`, `disabled`, `disable_failed_wrong_password`, `backup_codes_regenerated`, `verify_success`, `verify_failed`, `lockout`, `backup_code_used`, `lockout_backup`
- Immutability trigger: provisioned Phase 1

### Existing self-service 2FA routes (in `server/two-factor-routes.ts` — registered at `/api/2fa`)

| Method | Path | Auth | Re-Auth | Status |
|---|---|---|---|---|
| `POST` | `/api/2fa/setup` | Session | — | Existing |
| `POST` | `/api/2fa/verify-setup` | Session | — | Existing |
| `POST` | `/api/2fa/disable` | Session | `requireReauth('user.disable_2fa')` | Existing — **missing session invalidation** |
| `POST` | `/api/2fa/verify` | — | — | Existing |
| `POST` | `/api/2fa/verify-backup` | — | — | Existing |
| `POST` | `/api/2fa/regenerate-backup` | Session | — | Existing |
| `GET` | `/api/2fa/status` | Session | — | Existing |

**Gap identified:** `POST /api/2fa/disable` has `requireReauth` but does NOT call `storage.invalidateUserSessions()`. The baseline requires session invalidation on 2FA disable (Section 2, Modified Routes, line: "Add: requireReauth, session invalidation"). Phase 6 corrects this.

### Missing admin routes (Phase 6 will add)

Baseline Section 2 routes not yet implemented:

| Method | Path | Auth | Re-Auth |
|---|---|---|---|
| `GET` | `/api/admin/2fa-policy` | Superuser | — |
| `PUT` | `/api/admin/2fa-policy` | Superuser | totp |
| `GET` | `/api/admin/2fa-policy/status` | Superuser / HR | — |
| `POST` | `/api/admin/2fa-policy/remind` | Superuser / HR | any |
| `GET` | `/api/admin/2fa-policy/audit` | Superuser | — |
| `GET` | `/api/admin/users/:userId/2fa-audit` | Superuser / HR | — |
| `POST` | `/api/admin/users/:userId/2fa/reset` | Superuser | totp |

---

## Phase 6 Implementation Scope

### Files created

#### `server/admin-2fa-routes.ts` (NEW)

All 7 admin routes. Exports `registerAdmin2faRoutes(app)`.

**Route specifications:**

---

**`GET /api/admin/2fa-policy`**
- Auth: Session — Superuser only
- Action: Read singleton row from `two_fa_global_policy` (id=1)
- Response: `{ id, enforcementMode, applyToRoles, enforcementFromDate, gracePeriodEnabled, gracePeriodDays, updatedAt }`
- Error: 404 if singleton row missing (should never occur post-Phase 1 seed)
- Audit: None (read-only)

---

**`PUT /api/admin/2fa-policy`**
- Auth: Session — Superuser only
- Re-Auth: `requireReauth('security.update_2fa_policy')` (TOTP, timeout=0)
- Body: `{ enforcementMode, applyToRoles, enforcementFromDate, gracePeriodEnabled, gracePeriodDays, notes? }`
- Validation: `enforcementMode` must be one of `'optional' | 'required_from_date' | 'enforced'`; if `'required_from_date'` then `enforcementFromDate` must be present and a valid future date
- Action: Single DB transaction:
  1. Read current singleton row (for `previousMode` / `previousRoles`)
  2. `UPDATE two_fa_global_policy SET ... WHERE id = 1`
  3. `INSERT INTO two_fa_policy_audit_log (changedBy, previousMode, newMode, previousRoles, newRoles, notes)`
  - Both or neither committed — C-07 compliance
- Response: `{ success: true, policy: <updated row>, auditId: <new log id> }`
- Audit: `two_fa_policy_audit_log` row written in same transaction

---

**`GET /api/admin/2fa-policy/status`**
- Auth: Session — Superuser or HR
- Action: Query `users` table for all active users; return per-user 2FA status
- Response: `{ users: [{ id, username, fullName, role, twoFactorEnabled, isLocked, remainingBackupCodes }], summary: { total, enrolled, notEnrolled, locked } }`
- Fields exposed: `id`, `username`, `fullName`, `role`, `twoFactorEnabled`, `twoFactorLockedUntil` (mapped to `isLocked` boolean), `twoFactorBackupCodes` (mapped to `remainingBackupCodes` count only — no hashes exposed)
- Fields never exposed: `twoFactorSecret`, `twoFactorChallengeNonce`, `password`, `twoFactorBackupCodes` (raw)
- Audit: None (read-only)

---

**`POST /api/admin/2fa-policy/remind`**
- Auth: Session — Superuser or HR
- Re-Auth: `requireReauth` (any, 30-minute window per baseline `security.update_2fa_policy` policy — uses existing `any` challenge)
- Action:
  1. Query all active users with `twoFactorEnabled = false`
  2. For each: send reminder email via existing nodemailer/SENDGRID_API_KEY infrastructure (same pattern as `server/utils/password-security.ts`)
  3. Insert one row per reminded user into `two_factor_audit_log` with `action='admin_reminder_sent'` and `metadata: { sentBy: adminUserId, targetUserId }`
- Response: `{ success: true, remindedCount: N, skippedCount: M }`
- Email delivery failures are logged but do not fail the request — partial success is reported
- Audit: `two_factor_audit_log` row per reminded user

---

**`GET /api/admin/2fa-policy/audit`**
- Auth: Session — Superuser only
- Query params: `page` (default 1), `limit` (default 50, max 200)
- Action: Paginated read of `two_fa_policy_audit_log` ordered by `created_at DESC`; joins `users` to resolve `changedBy` → username
- Response: `{ rows: [...], total, page, limit }`
- Audit: None (read-only)

---

**`GET /api/admin/users/:userId/2fa-audit`**
- Auth: Session — Superuser or HR
- Access control: Superuser sees all users; HR sees only users whose records HR is permitted to access (same HR ownership filter pattern used in `server/attendance-routes.ts` and `server/admin-routes.ts`)
- Query params: `page` (default 1), `limit` (default 50, max 200)
- Action: Paginated read of `two_factor_audit_log` for the specified `userId`, ordered by `created_at DESC`
- Response: `{ rows: [{ id, action, ipAddress, userAgent, metadata, createdAt }], total, page, limit }`
- Fields never exposed: no sensitive fields — all columns in `two_factor_audit_log` are metadata-safe
- Audit: None (read-only)

---

**`POST /api/admin/users/:userId/2fa/reset`**
- Auth: Session — Superuser only (never HR — this is a destructive admin action)
- Re-Auth: `requireReauth('user.disable_2fa')` (TOTP, timeout=0 per baseline sensitive action table)
- Body: `{ reason: string }` — required, minimum 10 characters
- Action:
  1. Fetch target user — 404 if not found; 400 if target is also Superuser and actor is not themselves (prevent cross-Superuser reset — dual control only via break-glass)
  2. `UPDATE users SET twoFactorEnabled=false, twoFactorSecret=null, twoFactorBackupCodes='[]', twoFactorFailedAttempts=0, twoFactorLockedUntil=null, twoFactorChallengeNonce=null WHERE id=:userId`
  3. `INSERT INTO two_factor_audit_log (userId, action, ipAddress, userAgent, metadata)` with `action='admin_reset'` and `metadata: { resetBy: adminUserId, reason }`
  4. `storage.invalidateUserSessions(userId, null)` — invalidate ALL sessions for the target user (no exception)
- Response: `{ success: true, auditId: <log id> }`
- Audit: `two_factor_audit_log` row written; target's sessions invalidated

---

### Files modified

#### `server/two-factor-routes.ts` (MODIFIED — 1 location)

**Change:** `POST /api/2fa/disable` — after the successful `db.update(users)` call and `logAuditEvent(user.id, 'disabled', req)`, add:

```
await storage.invalidateUserSessions(user.id, req.sessionID);
```

This invalidates all other active sessions for the user who disabled their own 2FA, preserving the current session (the user stays logged in on their current device). The `storage.invalidateUserSessions(userId, exceptSessionId)` signature already handles this correctly.

No other changes to `two-factor-routes.ts`.

---

#### `server/routes.ts` (MODIFIED — 2 lines)

Add import:
```
import { registerAdmin2faRoutes } from './admin-2fa-routes';
```

Add registration call alongside other security route registrations:
```
registerAdmin2faRoutes(app);
```

---

### Files NOT changed

| File | Reason |
|---|---|
| `server/payroll-salary-core.ts` | Zero changes — non-negotiable |
| `server/auth.ts` | Login enforcement logic unchanged — Phase 6 only manages the policy data |
| `server/attendance-routes.ts` | Plane B — not in scope |
| `server/attendance-security-service.ts` | Plane B — not in scope |
| `server/attendance-security-routes.ts` | Plane B — not in scope |
| `server/security-routes.ts` | No 2FA admin routes were in this file; admin routes go in new dedicated file |
| `shared/schema.ts` | All tables provisioned Phase 1 — no schema changes |
| `drizzle.config.ts` | Never modified |

---

## Data Flow Diagrams

### PUT /api/admin/2fa-policy (transaction boundary)

```
Request → requireSuperuser → requireReauth('security.update_2fa_policy') [TOTP]
  │
  └─ BEGIN TRANSACTION
       ├─ SELECT two_fa_global_policy WHERE id=1  (read previous)
       ├─ UPDATE two_fa_global_policy SET ...       (write new)
       └─ INSERT two_fa_policy_audit_log (...)      (write audit)
     COMMIT
  │
  └─ Response: { success, policy, auditId }
```

If the INSERT fails, the UPDATE is rolled back. If the UPDATE fails, no audit row is written. Both or neither — C-07.

### POST /api/admin/users/:userId/2fa/reset (action sequence)

```
Request → requireSuperuser → requireReauth('user.disable_2fa') [TOTP]
  │
  ├─ Validate: userId exists, reason.length ≥ 10
  ├─ Guard: target is not cross-Superuser reset
  ├─ UPDATE users SET twoFactorEnabled=false, twoFactorSecret=null, ...
  ├─ INSERT two_factor_audit_log action='admin_reset'
  └─ storage.invalidateUserSessions(userId, null)   ← ALL sessions, no exception
  │
  └─ Response: { success, auditId }
```

### POST /api/2fa/disable — session invalidation addition

```
[Existing] requireReauth('user.disable_2fa') [TOTP]
[Existing] bcrypt.compare(password, userData.password)  ← secondary password check
[Existing] db.update(users).set({ twoFactorEnabled:false, secret:null, ... })
[Existing] logAuditEvent(user.id, 'disabled', req)
[NEW]      storage.invalidateUserSessions(user.id, req.sessionID)  ← preserve current session
[Existing] res.json({ success: true })
```

---

## Audit Governance Compliance

| Rule | Requirement | Phase 6 Implementation |
|---|---|---|
| C-07 | Policy changes logged in same transaction | `PUT /api/admin/2fa-policy` wraps UPDATE + INSERT in one transaction |
| C-02 | Superuser actions always logged in same transaction | `POST /api/admin/users/:userId/2fa/reset` inserts audit before returning |
| C-10 | Audit write failure causes parent action failure | Transaction pattern ensures this — if INSERT fails, UPDATE rolls back |
| C-01 | Append-only | No DELETE or UPDATE on any audit table in Phase 6 code |
| C-04 | `invalidateUserSessions` always logs before returning | Handled by existing `storage.invalidateUserSessions` implementation |

---

## Security Properties

### Re-Authentication Requirements

| Route | Action Key | Challenge | Timeout |
|---|---|---|---|
| `PUT /api/admin/2fa-policy` | `security.update_2fa_policy` | TOTP | 0 (always) |
| `POST /api/admin/users/:userId/2fa/reset` | `user.disable_2fa` | TOTP | 0 (always) |
| `POST /api/admin/2fa-policy/remind` | any | any | 30 min |
| `POST /api/2fa/disable` | `user.disable_2fa` | TOTP | 0 (already in existing code) |

### Access Control Matrix

| Route | Superuser | HR | Manager | Employee |
|---|---|---|---|---|
| `GET /api/admin/2fa-policy` | ✅ | ✗ | ✗ | ✗ |
| `PUT /api/admin/2fa-policy` | ✅ | ✗ | ✗ | ✗ |
| `GET /api/admin/2fa-policy/status` | ✅ | ✅ | ✗ | ✗ |
| `POST /api/admin/2fa-policy/remind` | ✅ | ✅ | ✗ | ✗ |
| `GET /api/admin/2fa-policy/audit` | ✅ | ✗ | ✗ | ✗ |
| `GET /api/admin/users/:userId/2fa-audit` | ✅ (all) | ✅ (own scope) | ✗ | ✗ |
| `POST /api/admin/users/:userId/2fa/reset` | ✅ | ✗ | ✗ | ✗ |

### Cross-Superuser Admin Reset Protection

A Superuser MAY NOT reset another Superuser's 2FA via `POST /api/admin/users/:userId/2fa/reset`. If the target user is a Superuser, the route returns 403. This prevents privilege escalation between Superuser accounts. Only the break-glass script handles Superuser 2FA recovery (Section 5 of baseline).

Exception: a Superuser may reset their own 2FA via this route (self-reset). However, the standard self-service flow (`POST /api/2fa/disable`) is preferred.

---

## Plane Isolation Confirmation

| Check | Status |
|---|---|
| No GPS fields (`latitude`, `longitude`, `gpsAccuracy`, `gpsStatus`) in `admin-2fa-routes.ts` | Will be confirmed ZT-P6-11 |
| No `attendance_location_audit_log` referenced in `admin-2fa-routes.ts` | Will be confirmed ZT-P6-11 |
| No `attendance_security_policies` referenced in `admin-2fa-routes.ts` | Will be confirmed ZT-P6-11 |
| No device trust tables referenced in `admin-2fa-routes.ts` | Will be confirmed ZT-P6-11 |
| No 2FA policy fields referenced in `attendance-security-service.ts` | Confirmed — Phase 5 code unchanged |
| `server/auth.ts` login flow unchanged | Confirmed — Phase 6 does not touch `auth.ts` |

---

## Rate Limiting

### Implementation Approach

All rate limits use an **in-memory sliding-window counter** — no new npm packages. A single module-level `Map` keyed by a scoped string stores an array of `Date.now()` timestamps. On each request, timestamps older than the window are pruned and the current timestamp is appended. If the resulting array length exceeds `maxAttempts`, the request is rejected with 429.

```typescript
// Pseudo-code — exact implementation defined at build time
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(
  key: string,
  windowMs: number,
  maxAttempts: number
): { allowed: boolean; attemptsInWindow: number } {
  const now = Date.now();
  const timestamps = (rateLimiter.get(key) || []).filter(t => now - t < windowMs);
  timestamps.push(now);
  rateLimiter.set(key, timestamps);
  return { allowed: timestamps.length <= maxAttempts, attemptsInWindow: timestamps.length };
}
```

**Durability:** The in-memory store resets on server restart. This is acceptable for admin routes with inherently low legitimate traffic. Per-user remind throttle (described below) is DB-backed and survives restarts.

---

### Rate Limit Specifications

#### `POST /api/admin/users/:userId/2fa/reset` — Admin 2FA Reset

| Parameter | Value |
|---|---|
| Key | `'reset:{adminUserId}:{targetUserId}'` |
| Window | 60 minutes (3,600,000 ms) |
| Max attempts | 3 per admin per target per window |
| On breach | 429 `{ error: 'Rate limit exceeded. Max 3 reset attempts per target per hour.' }` |
| Audit on breach | `two_factor_audit_log` row: `action='admin_reset_rate_limited'`, `severity='critical'`, `metadata: { adminUserId, targetUserId, attemptsInWindow }` |
| Escalation | If the same admin triggers 3 or more rate-limit breaches (across any target) within a 24-hour window, an additional `two_factor_audit_log` row is written: `action='admin_reset_suspicious'`, `severity='critical'`, `metadata: { adminUserId, breachCount, windowHours: 24 }` |

**Rationale:** Legitimate Superusers reset 2FA rarely and deliberately. Three breaches within an hour on the same target is anomalous and warrants a critical audit event regardless of whether the TOTP challenge was passed.

**Escalation counter key:** `'reset_breach:{adminUserId}'`, window = 24 hours, threshold = 3 breaches.

---

#### `PUT /api/admin/2fa-policy` — Global Policy Update

| Parameter | Value |
|---|---|
| Key | `'policy_update:{adminUserId}'` |
| Window | 60 minutes (3,600,000 ms) |
| Max attempts | 5 per Superuser per window |
| On breach | 429 `{ error: 'Rate limit exceeded. Max 5 policy updates per hour.' }` |
| Audit on breach | `two_fa_policy_audit_log` INSERT is NOT written (the update was not applied). A `two_factor_audit_log` row is written instead: `action='policy_update_rate_limited'`, `severity='warning'`, `metadata: { adminUserId, attemptsInWindow }` |

**Rationale:** Global 2FA policy changes are high-impact governance actions. Five changes per hour represents an absolute ceiling well above any legitimate operational need.

---

#### `POST /api/admin/2fa-policy/remind` — Reminder Broadcast

Two independent throttles apply. Both must pass for the request to proceed.

**Throttle 1 — Per-admin broadcast rate (in-memory):**

| Parameter | Value |
|---|---|
| Key | `'remind:{adminUserId}'` |
| Window | 24 hours (86,400,000 ms) |
| Max broadcasts | 3 per admin per 24-hour window |
| On breach | 429 `{ error: 'Rate limit exceeded. Max 3 reminder broadcasts per 24 hours.' }` |
| Audit on breach | `two_factor_audit_log` row: `action='admin_reminder_rate_limited'`, `severity='warning'`, `metadata: { adminUserId, attemptsInWindow }` — written for the admin user (userId = adminUserId) |

**Throttle 2 — Per-user recipient throttle (DB-backed, survives restarts):**

Before sending each individual reminder email, the route queries `two_factor_audit_log` for:
```sql
SELECT id FROM two_factor_audit_log
WHERE user_id = :targetUserId
  AND action = 'admin_reminder_sent'
  AND created_at > NOW() - INTERVAL '24 hours'
LIMIT 1
```

If a row is found, that user is **skipped** — no email sent, no new audit row written for them.

**Anti-spam confirmation:**
- A user can receive at most **1 reminder email per 24 hours** regardless of how many admin broadcasts are triggered.
- The per-admin throttle caps broadcasts at **3 per 24 hours**.
- The combined effect: in the worst case (3 broadcasts, all targeting the full non-enrolled population), each individual user receives at most 1 email per 24-hour period.
- The response body always includes `{ remindedCount, skippedCount, skippedReason: 'per_user_24h_throttle' }` so the admin has full visibility into which users were throttled.

---

## Audit Severity Mapping

Severity is stored as a field within existing columns — **no schema changes required**:

- **`two_factor_audit_log`**: severity is written in `metadata.severity` (JSONB field, already exists)
- **`two_fa_policy_audit_log`**: severity is written as the first key in the `notes` field, stored as a JSON string: `{"severity":"warning","message":"...human description..."}`

### `two_factor_audit_log` — Action-to-Severity Map

All Phase 6 writes to `two_factor_audit_log` include `metadata.severity`. Existing pre-Phase-6 rows have no `severity` key in `metadata` and are unaffected.

| Action | Severity | Trigger Condition |
|---|---|---|
| `setup_initiated` | `info` | User started 2FA setup flow |
| `activated` | `info` | 2FA successfully enabled |
| `disabled` | `warning` | User successfully disabled own 2FA |
| `disable_failed_wrong_password` | `warning` | Incorrect password on self-disable attempt |
| `verify_success` | `info` | TOTP code accepted at login |
| `verify_failed` | `info` | TOTP code rejected at login (below lockout) |
| `lockout` | `warning` | TOTP lockout triggered (5 failed TOTP attempts) |
| `lockout_backup` | `warning` | Backup-code lockout triggered |
| `backup_code_used` | `info` | Backup code consumed during login |
| `backup_codes_regenerated` | `info` | Backup codes regenerated by user |
| `admin_reset` | `critical` | Superuser force-cleared another user's TOTP secret |
| `admin_reset_rate_limited` | `critical` | Admin exceeded reset rate limit for a specific target |
| `admin_reset_suspicious` | `critical` | Admin triggered 3+ rate-limit breaches in 24 hours (across any target) |
| `admin_reminder_sent` | `info` | Reminder email sent to a non-enrolled user |
| `admin_reminder_rate_limited` | `warning` | Admin exceeded remind broadcast rate limit |
| `policy_update_rate_limited` | `warning` | Admin exceeded policy-update rate limit |

**Important:** `admin_reset`, `admin_reset_rate_limited`, and `admin_reset_suspicious` are always `critical`. These three actions are the highest-risk events in Phase 6 and must surface immediately in any monitoring query filtered on `severity='critical'`.

---

### `two_fa_policy_audit_log` — Policy Change Severity

Every `PUT /api/admin/2fa-policy` call that succeeds writes one row to `two_fa_policy_audit_log`. The `notes` field is a JSON string with the structure:

```json
{ "severity": "info|warning|critical", "message": "...human-readable description..." }
```

Severity is determined at write time by the following rules, evaluated in order (first match wins):

| Condition | Severity | Example message |
|---|---|---|
| New mode is `enforced` | `critical` | `"enforcementMode changed: optional → enforced"` |
| Previous mode was `enforced` and new is not `enforced` | `critical` | `"enforcementMode downgraded: enforced → optional (enforcement disabled)"` |
| New mode is `required_from_date` | `warning` | `"enforcementMode changed: optional → required_from_date (effective: 2026-06-01)"` |
| `required_from_date` → `optional` | `warning` | `"enforcementMode downgraded: required_from_date → optional"` |
| `applyToRoles` changed — roles removed | `warning` | `"applyToRoles narrowed: removed [Employee, Senior Executive]"` |
| `applyToRoles` changed — roles added only | `info` | `"applyToRoles expanded: added [Manager]"` |
| No mode change, no role removal (e.g. grace period days only) | `info` | `"gracePeriodDays changed: 14 → 30"` |

**Enforcement downgrade is always `critical`** — reducing from `enforced` to any lower mode is equivalent in security impact to a full disable and must produce a critical audit event.

---

### Repeated Failed Reset Attempts — Escalation Path

The escalation path for the reset endpoint is:

```
Attempt 1–3 (within 60 min, same target)
  └─ requireReauth TOTP verified ✅
  └─ Route executes normally → action='admin_reset', severity='critical'

Attempt 4 (within 60 min, same target)
  └─ Rate limit exceeded → 429
  └─ Audit: action='admin_reset_rate_limited', severity='critical'

3rd rate-limit breach by same admin (within 24 hours, any target)
  └─ Escalation audit: action='admin_reset_suspicious', severity='critical'
  └─ This fires IN ADDITION TO the regular rate-limit event
```

**Note on TOTP failures:** TOTP failures on the reset endpoint are handled by the `requireReauth` middleware, which writes to `reauth_audit_log` (existing Phase 3 behaviour). Phase 6 does not intercept pre-route TOTP failures. The rate limiter above operates at the route level — it tracks request attempts that reach the route handler body (i.e., after TOTP verification passed). This is the correct level: rate-limiting legitimate reset executions is the primary goal. TOTP failures are already captured by the re-auth audit.

---

## Verification Tests (T-2F01 through T-2F22)

All tests run manually against the live development server after implementation. Each test records: input, expected outcome, actual outcome, PASS/FAIL.

| ID | Test Name | Method | Input | Expected Outcome |
|---|---|---|---|---|
| T-2F01 | Policy read — Superuser | `GET /api/admin/2fa-policy` as Superuser | — | 200; `{ id:1, enforcementMode:'optional', applyToRoles:[], gracePeriodDays:14 }` |
| T-2F02 | Policy read — HR blocked | `GET /api/admin/2fa-policy` as HR | — | 403 |
| T-2F03 | Policy update — no reauth | `PUT /api/admin/2fa-policy` as Superuser, no TOTP token | `{ enforcementMode:'optional' }` | 403 re-auth required |
| T-2F04 | Policy update — with TOTP | `PUT /api/admin/2fa-policy` as Superuser, valid TOTP | `{ enforcementMode:'optional', notes:'test' }` | 200; `two_fa_policy_audit_log` row count +1 |
| T-2F05 | Policy update — audit transaction | Same as T-2F04 | Simulate INSERT failure (mock) | UPDATE rolled back; row count unchanged |
| T-2F06 | Enrollment status — Superuser | `GET /api/admin/2fa-policy/status` as Superuser | — | 200; array with `twoFactorEnabled`, `isLocked`, `remainingBackupCodes`; no secrets |
| T-2F07 | Enrollment status — HR | `GET /api/admin/2fa-policy/status` as HR | — | 200; same list (HR sees all active users) |
| T-2F08 | Policy audit log | `GET /api/admin/2fa-policy/audit` as Superuser | — | 200; rows from `two_fa_policy_audit_log`; changedBy resolved to username |
| T-2F09 | User 2FA audit — Superuser | `GET /api/admin/users/:userId/2fa-audit` as Superuser | valid userId | 200; paginated audit rows for that user |
| T-2F10 | User 2FA audit — HR scope | `GET /api/admin/users/:userId/2fa-audit` as HR | userId outside HR scope | 403 |
| T-2F11 | Admin 2FA reset — TOTP required | `POST /api/admin/users/:userId/2fa/reset` as Superuser, no TOTP | `{ reason: 'test reset reason' }` | 403 |
| T-2F12 | Admin 2FA reset — success | `POST /api/admin/users/:userId/2fa/reset` as Superuser, valid TOTP | `{ reason: 'test admin reset for audit' }` | 200; target user `twoFactorEnabled=false`; audit row written; sessions invalidated |
| T-2F13 | Self-disable — session invalidation | `POST /api/2fa/disable` as enrolled user, valid TOTP + password | `{ password: '...' }` | 200; other sessions for that user destroyed; current session preserved |
| T-2F14 | `two_fa_policy_audit_log` UPDATE blocked | Direct SQL: `UPDATE two_fa_policy_audit_log SET notes='x' WHERE id=1` | — | `ERROR: permission denied` or trigger rejection |
| T-2F15 | `two_fa_policy_audit_log` DELETE blocked | Direct SQL: `DELETE FROM two_fa_policy_audit_log WHERE id=1` | — | `ERROR: permission denied` or trigger rejection |
| T-2F16 | Reset rate limit — 4th attempt, same target, within 60 min | `POST /api/admin/users/:userId/2fa/reset` as Superuser (valid TOTP) × 4 on same target within 1 hour | `{ reason: '...' }` × 4 | First 3: 200; 4th: 429; `two_factor_audit_log` row with `action='admin_reset_rate_limited'`, `metadata.severity='critical'` |
| T-2F17 | Reset rate limit escalation — 3 breaches within 24h | Trigger T-2F16 three times within 24h (different targets to accumulate 3 breaches) | — | After 3rd breach: `two_factor_audit_log` row with `action='admin_reset_suspicious'`, `metadata.severity='critical'`; both regular breach row and escalation row present |
| T-2F18 | Policy update rate limit — 6th attempt within 60 min | `PUT /api/admin/2fa-policy` as Superuser × 6 within 1 hour | `{ enforcementMode:'optional' }` × 6 | First 5: 200 (with audit rows); 6th: 429; `two_factor_audit_log` row with `action='policy_update_rate_limited'`, `metadata.severity='warning'`; `two_fa_policy_audit_log` count does NOT increase on 6th attempt |
| T-2F19 | Remind broadcast rate limit — 4th attempt within 24h | `POST /api/admin/2fa-policy/remind` × 4 within 24h | — | First 3: 200; 4th: 429; `two_factor_audit_log` row with `action='admin_reminder_rate_limited'`, `metadata.severity='warning'` |
| T-2F20 | Per-user remind throttle — DB-backed | User A has `admin_reminder_sent` in `two_factor_audit_log` within last 24h; trigger remind broadcast | — | Response `skippedCount ≥ 1`; User A does NOT receive a second email; no new `admin_reminder_sent` row for User A |
| T-2F21 | Remind response shape | Successful remind broadcast | — | Response body includes `{ success:true, remindedCount: N, skippedCount: M, skippedReason:'per_user_24h_throttle' }` |
| T-2F22 | Severity in policy audit notes | `PUT /api/admin/2fa-policy` changing `enforcementMode` to `enforced` | Valid TOTP | `two_fa_policy_audit_log.notes` is valid JSON; `notes.severity='critical'`; `notes.message` contains `'enforced'` |

---

## Zero-Trust Audit Plan (ZT-P6-01 through ZT-P6-17)

Executed after implementation is complete. All results recorded in `docs/security-phase6-audit-evidence.md`.

| ID | Check | Method | Pass Condition |
|---|---|---|---|
| ZT-P6-01 | `two_fa_policy_audit_log` UPDATE blocked | Direct SQL attempt | Error returned; row unchanged |
| ZT-P6-02 | `two_fa_policy_audit_log` DELETE blocked | Direct SQL attempt | Error returned; row count unchanged |
| ZT-P6-03 | No application code writes UPDATE/DELETE to policy audit log | `grep -rn "UPDATE.*two_fa_policy_audit\|DELETE.*two_fa_policy_audit" server/` | Zero results |
| ZT-P6-04 | Policy update is atomic | Inspect `admin-2fa-routes.ts` for transaction wrapper around UPDATE + INSERT | Single `db.transaction()` block confirmed |
| ZT-P6-05 | Non-Superuser cannot call `PUT /api/admin/2fa-policy` | Call as HR (authenticated) | 403 |
| ZT-P6-06 | Policy update without TOTP → rejected | Call without re-auth token | 403 |
| ZT-P6-07 | Admin reset without TOTP → rejected | `POST /api/admin/users/:userId/2fa/reset` without TOTP | 403 |
| ZT-P6-08 | Admin reset writes audit row | Execute successful admin reset; query `two_factor_audit_log` | Row with `action='admin_reset'` and `metadata.severity='critical'` present |
| ZT-P6-09 | Self-disable invalidates other sessions | Login from two browsers; disable 2FA from browser A; attempt request from browser B | Browser B session rejected (401) |
| ZT-P6-10 | `payroll-salary-core.ts` unchanged | `git diff d0a7748444016698c04208e8ba3a1620ae993575 -- server/payroll-salary-core.ts` | 0 diff lines |
| ZT-P6-11 | Plane isolation — no Plane B fields in `admin-2fa-routes.ts` | `grep -n "gps\|latitude\|longitude\|attendance_location\|attendance_security_policies" server/admin-2fa-routes.ts` | Zero results |
| ZT-P6-12 | `auth.ts` login flow unchanged from Phase 5 checkpoint | `git diff d0a7748444016698c04208e8ba3a1620ae993575 -- server/auth.ts` | Zero diff lines |
| ZT-P6-13 | Rate limiter keys are correctly scoped | Inspect `admin-2fa-routes.ts` for `'reset:{adminUserId}:{targetUserId}'`, `'policy_update:{adminUserId}'`, `'remind:{adminUserId}'`, `'reset_breach:{adminUserId}'` key patterns | All four key patterns confirmed; no global or role-level key |
| ZT-P6-14 | All Phase 6 audit writes include `metadata.severity` | `grep -n "action='admin_reset'\|action='admin_reset_rate_limited'\|action='admin_reset_suspicious'\|action='admin_reminder_sent'\|action='admin_reminder_rate_limited'\|action='policy_update_rate_limited'" server/admin-2fa-routes.ts` | Every match has `severity` in the surrounding `metadata` object |
| ZT-P6-15 | Policy audit `notes` field is valid JSON with `severity` key | Execute `PUT /api/admin/2fa-policy`; query `two_fa_policy_audit_log`; parse `notes` | `JSON.parse(notes).severity` is one of `'info'`, `'warning'`, `'critical'`; no parse error |
| ZT-P6-16 | Enforcement downgrade produces `severity='critical'` | Set `enforcementMode='enforced'`; then set back to `'optional'` (two PUT calls, both with TOTP) | Second `two_fa_policy_audit_log` row has `notes.severity='critical'` and message contains `'downgraded'` |
| ZT-P6-17 | Per-user remind throttle is DB-backed | Trigger remind broadcast; confirm `admin_reminder_sent` row in `two_factor_audit_log`; restart server; trigger second broadcast | Target user still skipped (DB row persists across restart); `skippedCount ≥ 1` |

---

## payroll-salary-core.ts Non-Negotiable Constraint

- Phase 5 checkpoint commit: `d0a7748444016698c04208e8ba3a1620ae993575`
- Phase 6 implementation must produce: `git diff d0a7748444016698c04208e8ba3a1620ae993575 -- server/payroll-salary-core.ts` → **0 lines**
- This is verified as ZT-P6-10 and confirmed before Phase 6 audit evidence is submitted

---

## Sensitive Data Handling

The following fields are **never exposed** in any Phase 6 response:

| Field | Table | Reason |
|---|---|---|
| `twoFactorSecret` | `users` | Encrypted TOTP seed — never in HTTP response |
| `twoFactorChallengeNonce` | `users` | Internal nonce — never in HTTP response |
| `twoFactorBackupCodes` (raw) | `users` | Hashed codes — only `remainingBackupCodes` count returned |
| `password` | `users` | Always excluded |

---

## Feature Flags After Phase 6

No feature flag changes in Phase 6. State after Phase 6:

| Flag | Value | Notes |
|---|---|---|
| `SECURITY_ATTENDANCE_AUDIT_ENABLED` | `true` | Enabled Phase 5 — unchanged |
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` | `false` | Phase 7 — unchanged |
| `SECURITY_DEVICE_TRUST_ENABLED` | `false` | Phase 4 enforcement — unchanged |
| (no 2FA admin flag) | — | Admin routes are role-gated; no feature flag required |

---

## Pre-Approval Checklist

| Item | Status |
|---|---|
| Phase 5 complete and approved | ✅ 09 May 2026 |
| Zero new npm packages | ✅ Confirmed |
| Zero schema changes | ✅ All tables from Phase 1 |
| Zero changes to `payroll-salary-core.ts` | ✅ Confirmed — not in scope |
| `server/auth.ts` login flow unchanged | ✅ Confirmed — Phase 6 does not touch auth.ts |
| Plane isolation maintained | ✅ Confirmed — no Plane B references in admin-2fa-routes.ts |
| C-07: policy audit in same transaction | ✅ Designed as single db.transaction() block |
| C-01: no DELETE/UPDATE on audit tables | ✅ No such statements in Phase 6 scope |
| C-10: audit failure causes action failure | ✅ Transaction rollback ensures this |
| Cross-Superuser reset protection | ✅ Designed: 403 if target is Superuser |
| Sensitive fields excluded from all responses | ✅ twoFactorSecret, backupCodes hash, nonce never exposed |
| Session invalidation on 2FA disable | ✅ One-line addition to existing route |
| Session invalidation on admin reset | ✅ `storage.invalidateUserSessions(userId, null)` — all sessions |
| T-2F01 through T-2F22 test plan defined | ✅ 22 tests (Rev 2: +7 rate limiting and severity tests) |
| ZT-P6-01 through ZT-P6-17 audit plan defined | ✅ 17 checks (Rev 2: +5 rate limiting and severity checks) |
| Rate limiting defined for all 3 mutation endpoints | ✅ Reset (3/hr/target), policy update (5/hr), remind (3/24h + per-user DB throttle) |
| Anti-spam confirmed for remind endpoint | ✅ Per-admin + per-user (DB-backed) dual throttle; skippedCount in response |
| Audit severity mapping defined | ✅ 15-row action map for two_factor_audit_log; 7-rule table for two_fa_policy_audit_log |
| Repeated failed reset attempts → critical audit events | ✅ admin_reset_rate_limited (critical) + admin_reset_suspicious (critical) escalation defined |
| Enforcement downgrade → critical audit event | ✅ enforced → any lower mode always writes severity='critical' |
| Rate limit audit events are append-only | ✅ Rate limit breaches write to two_factor_audit_log (append); no modify/delete |
| No new npm packages (Rev 2 additions) | ✅ In-memory Map; DB-backed per-user throttle uses existing db client |
| Approved by THERMOPAC Management | ⬜ Pending |

---

*End of Phase 6 Pre-Approval Document Rev 2*
