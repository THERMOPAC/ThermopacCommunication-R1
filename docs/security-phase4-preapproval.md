# Phase 4 — Trusted Device Management: Pre-Approval Document (Revision 2)
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Status: AWAITING APPROVAL — DO NOT IMPLEMENT UNTIL APPROVED

---

## Revision History

| Rev | Date | Change |
|---|---|---|
| Rev 1 | 09 May 2026 | Initial submission — rejected: two baseline deviations (no cookie, no enforcement) |
| Rev 2 | 09 May 2026 | Full baseline compliance: cookie activation flow added; login enforcement added; pre-enable safety checklist added |

---

## Approval Gate

| Field | Value |
|---|---|
| Phase | 4 — Trusted Device Management |
| Blocked by | Phase 3 COMPLETE ✅ (09 May 2026) |
| Prepared by | THERMOPAC ERP Architect |
| Approved by | — |
| Approval date | — |
| Implementation start | Pending approval |

---

## Corrections from Rev 1 (Both Baseline Deviations Resolved)

### Correction 1 — Trust Token Cookie

**Rev 1 problem:** Fingerprint-only matching was proposed. Baseline requires trust token / cookie behavior. Rev 1 noted that an admin cannot set a cookie on another user's browser, which is factually correct — but the solution is a device activation step, not elimination of the cookie.

**Rev 2 resolution:** Full two-step flow implemented:
1. Admin grants trust → `trust_token` (64-char cryptographically random hex) generated and stored in `trusted_devices`
2. Activation URL delivered to target user (`GET /api/security/activate-device?token=<trustToken>`) — the user visits this URL on their own machine, which sets the `thermopac.device` cookie directly on their browser
3. Login: server reads `thermopac.device` from Cookie header → matches by `trust_token` against `trusted_devices` for that user → trusted if found and active

### Correction 2 — Login Enforcement

**Rev 1 problem:** Detection-only proposed (login proceeds regardless of trust status). Baseline `login_security_policies.require_device_trust = true` for high_security roles requires enforcement.

**Rev 2 resolution:** When `SECURITY_DEVICE_TRUST_ENABLED = true` AND `policy.require_device_trust = true`, login is **blocked** for untrusted devices with `401 DEVICE_NOT_TRUSTED`. A mandatory pre-enable safety checklist (see below) ensures no high_security user is locked out before the flag is enabled.

---

## Objective

Implement fully enforced trusted device governance for `high_security` roles (Superuser, General Manager, Senior Manager — 7 users currently). When `SECURITY_DEVICE_TRUST_ENABLED = true`:

1. Login from any `high_security` user on a device without an active `thermopac.device` cookie matching a registered trust token is **blocked**.
2. Admin can register, view, and revoke trusted devices (TOTP re-auth on all writes).
3. Users can view and self-revoke their own devices (password re-auth).
4. All device events are written to `trusted_device_audit_log` (append-only, immutable).
5. Activation endpoint sets the `thermopac.device` persistent cookie on the user's machine.

**Standard, elevated, and non-enrolled roles are not affected** — `policy.require_device_trust = false` for those levels.

**`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

**Zero new database tables.** All tables provisioned in Phase 1: `trusted_devices`, `trusted_device_audit_log`. Feature flag `SECURITY_DEVICE_TRUST_ENABLED` already seeded (`enabled = false`).

---

## Current Baseline State

| Entity | Value |
|---|---|
| High-security users | 7 (Superuser×2, General Manager×1, Senior Manager×4) |
| Active trusted devices | **0** (none registered) |
| `require_device_trust` for high_security | `true` (seeded in Phase 1) |
| `SECURITY_DEVICE_TRUST_ENABLED` | `false` (flag is OFF — safe) |
| `cookie-parser` npm package | **NOT installed** |

The flag is currently `false`, so no high_security user is blocked by this phase until the flag is explicitly enabled after verification.

---

## Cookie Design

### `thermopac.device` — Persistent Trust Cookie

| Attribute | Value |
|---|---|
| Name | `thermopac.device` |
| Value | `trust_token` — 64-char hex (`crypto.randomBytes(32).toString('hex')`) |
| HttpOnly | `true` |
| SameSite | `'strict'` |
| Secure | `true` when `NODE_ENV === 'production'`; `false` in development |
| MaxAge | `31_536_000` seconds (365 days) |
| Path | `/` |

### Cookie Parsing (no `cookie-parser` required)

`cookie-parser` is not installed and will not be added. The `thermopac.device` cookie is parsed directly from the `Cookie` header using a targeted regex in `trusted-device-service.ts`:

```typescript
export function parseDeviceCookie(req: Request): string | undefined {
  const header = req.headers.cookie ?? '';
  const match = /(?:^|;\s*)thermopac\.device=([A-Fa-f0-9]{64})(?:;|$)/.exec(header);
  return match?.[1];
}
```

This does not affect the session cookie (`thermopac.sid`) and adds no dependencies.

### Cookie Lifetime and Revocation

- Cookie persists 365 days. Server-side revocation (`is_active = false` in DB) invalidates the token even if the cookie is still present in the browser — the trust check queries the DB on every login.
- When a device is revoked, the cookie on the user's browser becomes a dead token. The user is blocked on next login from that device and must contact their Superuser.

---

## Device Fingerprint (Supplemental — Not Used for Auth Decision)

In Rev 2, the device fingerprint is computed and stored in `trusted_devices.device_fingerprint` **at activation time** (when the user hits the activation URL). It is updated on each successful trusted login. It is stored for forensic reference in the admin UI and audit log — it is **not** used as the authentication mechanism. The `trust_token` cookie is the sole auth signal.

```typescript
export function computeDeviceFingerprint(req: Request): string {
  const ua  = req.headers['user-agent']       ?? '';
  const ip  = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
              ?? req.socket?.remoteAddress     ?? '';
  const lang = req.headers['accept-language'] ?? '';
  return crypto.createHash('sha256').update(`${ip}:${ua}:${lang}`).digest('hex');
}
```

---

## Exact Files Changed

### New Files (3)

| File | Purpose |
|---|---|
| `server/trusted-device-service.ts` | `parseDeviceCookie()`, `computeDeviceFingerprint()`, `checkDeviceTrust()`, `registerDevice()`, `revokeDevice()`, `writeDeviceAudit()`, `activateDevice()` |
| `server/security-device-routes.ts` | Self-service: `GET /api/security/my-devices`, `DELETE /api/security/my-devices/:id`, `GET /api/security/activate-device` |
| `server/admin-device-routes.ts` | Admin: `GET /api/admin/users/:userId/devices`, `DELETE /api/admin/users/:userId/devices/:id`, `POST /api/admin/users/:userId/devices/grant`, `GET /api/admin/device-audit-log` |

### Modified Files (3)

| File | Lines Touched | Change |
|---|---|---|
| `server/auth.ts` | Login handler (≈ line 277 block, after credential + lockout checks) | Device trust enforcement: parse cookie, query DB, block or pass, write audit, stamp `login_audit_log.is_trusted_device` |
| `server/security-routes.ts` | Append registrations | Import and register `securityDeviceRoutes` |
| `server/routes.ts` | Near line 691 | Import and register `adminDeviceRoutes` |

**Total: 3 new files + 3 modified files. No schema changes. No new npm packages.**

---

## Full Flow Specifications

### A. Device Activation (Two-Step — User's Own Browser)

```
Step 1 — Admin grants trust:
  POST /api/admin/users/:userId/devices/grant
  Auth: ensureAuthenticated + Superuser + requireReauth('security.grant_device_trust') [TOTP, timeout=0]
  Body: { deviceName: string }
  ──────────────────────────────────────────
  1. Re-auth passes (TOTP, single-use)
  2. trust_token = crypto.randomBytes(32).toString('hex')           ← cryptographically random
  3. INSERT trusted_devices { userId, trustToken, deviceName,
       registeredByAdmin=true, registeredBy=adminId }
     (device_fingerprint set to '' at creation — filled at activation)
  4. INSERT trusted_device_audit_log { action='registered',
       performedBy=adminId, severity='info',
       notes='Pending activation by user' }
  5. Return { deviceId, trustToken, activationUrl:
       '/api/security/activate-device?token=<trustToken>' }
  ──────────────────────────────────────────
  Admin communicates the activationUrl to the target user via
  secure out-of-band channel (internal message, email, phone).
  The trust_token in the URL is single-purpose and single-use for activation.

Step 2 — User activates on their machine:
  GET /api/security/activate-device?token=<trustToken>
  Auth: ensureAuthenticated (user must be logged in)
  ──────────────────────────────────────────
  1. Parse trustToken from query param (validate 64-char hex)
  2. SELECT from trusted_devices WHERE trust_token = $1 AND is_active = true
  3. If not found → 404 (token invalid or already revoked)
  4. If record.userId !== req.user.id → 403 (token belongs to a different user)
  5. If record.device_fingerprint is already set → 409 (device already activated)
  6. fingerprint = computeDeviceFingerprint(req)
  7. UPDATE trusted_devices SET device_fingerprint = fingerprint,
       last_used_at = NOW() WHERE id = record.id
  8. INSERT trusted_device_audit_log { action='activated', performedBy=userId,
       severity='info', notes='Device cookie set on user machine' }
  9. res.cookie('thermopac.device', trustToken, {
       httpOnly: true, sameSite: 'strict',
       secure: NODE_ENV === 'production',
       maxAge: 31_536_000_000  // ms
     })
  10. Return HTML page or JSON { success: true, message: 'Device trusted' }
  ──────────────────────────────────────────
  After this step: the user's browser carries thermopac.device cookie.
  On their next login from this machine, the cookie is present → trusted.
```

### B. Login Enforcement (modified `server/auth.ts`)

```
[Existing: credential check → Phase 2 lockout check → req.login()]
THEN, before returning 200 to client:

if SECURITY_DEVICE_TRUST_ENABLED === false:
  → skip all device logic → proceed

policy = login_security_policies for user.role
if policy.require_device_trust === false:
  → skip (standard/elevated roles) → proceed

cookieToken = parseDeviceCookie(req)          // parse Cookie header

if !cookieToken:
  → write trusted_device_audit_log { action='login_blocked_untrusted',
      severity='warning', notes='No device cookie present' }
  → update login_audit_log.is_trusted_device = false (if row exists)
  → req.logout()                              // undo passport login
  → return 401 { code: 'DEVICE_NOT_TRUSTED',
      message: 'Access from an unregistered device. Contact your Superuser.' }

trustRecord = SELECT FROM trusted_devices
  WHERE trust_token = cookieToken AND user_id = userId AND is_active = true

if !trustRecord:
  → write trusted_device_audit_log { action='login_blocked_untrusted',
      severity='warning', notes='Cookie token not in active device registry' }
  → update login_audit_log.is_trusted_device = false
  → req.logout()
  → return 401 { code: 'DEVICE_NOT_TRUSTED',
      message: 'Device trust token is invalid or has been revoked.' }

// Device is trusted
→ UPDATE trusted_devices SET last_used_at = NOW() WHERE id = trustRecord.id
→ write trusted_device_audit_log { action='login_trusted', severity='info' }
→ UPDATE login_audit_log SET is_trusted_device = true WHERE id = loginAuditRowId
→ session.deviceTrusted = true
→ session.deviceFingerprint = computeDeviceFingerprint(req)  // for UI display
→ proceed
```

### C. Admin Revoke Device

```
DELETE /api/admin/users/:userId/devices/:id
Auth: ensureAuthenticated + Superuser + requireReauth('security.grant_device_trust') [TOTP, timeout=0]
Body: { reason?: string }
──────────────────────────────────────────
1. Re-auth passes
2. Load trusted_devices WHERE id = :id AND user_id = :userId → else 404
3. UPDATE SET is_active=false, revoked_at=NOW(), revoked_by=adminId,
     revoked_reason=(body.reason ?? 'Admin revoked')
4. INSERT trusted_device_audit_log { action='revoked', performedBy=adminId,
     severity='warning', notes=reason }
5. Return { success: true }
──────────────────────────────────────────
Effect: cookie still exists in user's browser but will be rejected at next login.
```

### D. Admin View User Devices

```
GET /api/admin/users/:userId/devices
Auth: ensureAuthenticated + Superuser or HR
Returns: all trusted_devices rows for user (active + revoked), joined with:
  - registeredBy username
  - revokedBy username
  - activation status (device_fingerprint === '' → pending activation)
  - last_used_at for forensic reference
```

### E. Admin Device Audit Log

```
GET /api/admin/device-audit-log
Auth: ensureAuthenticated + Superuser
Query: ?userId=&action=&from=&to=&limit=&offset=
Returns: paginated trusted_device_audit_log joined with usernames
```

### F. Self-Service: View Own Devices

```
GET /api/security/my-devices
Auth: ensureAuthenticated
Returns: trusted_devices WHERE user_id = req.user.id
  Includes: is_active, device_name, last_used_at, revoked_at, activation status
```

### G. Self-Service: Revoke Own Device

```
DELETE /api/security/my-devices/:id
Auth: ensureAuthenticated + requireReauth('security.revoke_session') [any, 30 min]
──────────────────────────────────────────
1. Re-auth passes
2. Load record WHERE id = :id → verify record.user_id === req.user.id → else 403
3. UPDATE SET is_active=false, revoked_at=NOW(), revoked_by=userId,
     revoked_reason='self_revoked'
4. INSERT trusted_device_audit_log { action='revoked', performedBy=userId,
     severity='info', notes='self_revoked' }
5. Return { success: true }
```

---

## Session Additions

```typescript
// In server/trusted-device-service.ts (module augmentation)
declare module 'express-session' {
  interface SessionData {
    deviceTrusted?: boolean;       // true = passed device trust check at login
    deviceFingerprint?: string;    // current request fingerprint (for admin UI display)
  }
}
```

These are read-only after login. Not modified mid-session.

---

## Pre-Enable Safety Checklist (MANDATORY before setting flag to true)

All 7 high_security users currently have **0** active trusted devices. Enabling the flag before their devices are registered will lock all 7 users out of the system immediately.

**The following SQL must pass before enabling the flag:**

```sql
-- Must return 0 rows before enabling flag (all high_security users have ≥1 active device)
SELECT u.id, u.username, u.role
FROM users u
WHERE u.role IN ('Superuser', 'General Manager', 'Senior Manager')
  AND NOT EXISTS (
    SELECT 1 FROM trusted_devices td
    WHERE td.user_id = u.id AND td.is_active = true
      AND td.device_fingerprint != ''  -- must be activated, not just granted
  );
```

Additionally:
- [ ] Both Superusers (Prasad userId=3, Manager userId=1) must have ≥ 2 active trusted devices each (machine + backup)
- [ ] Emergency recovery script (`scripts/emergency-recovery.ts`) verified functional and passphrase set in Replit Secrets
- [ ] Verified: `GET /api/security/activate-device?token=<valid>` sets cookie correctly in browser
- [ ] Verified: login from high_security user without cookie returns 401 DEVICE_NOT_TRUSTED
- [ ] Verified: login from high_security user with valid cookie succeeds

---

## Feature Flag Behaviour

| Flag | Dev Default | Production Value After Verification |
|---|---|---|
| `SECURITY_DEVICE_TRUST_ENABLED` | `false` | `true` only after pre-enable checklist passes |

**Flag OFF** — complete bypass: no cookie parsed, no DB query, no audit write, no login blocking. Zero performance impact.

**Flag ON with `require_device_trust = false` for a user's policy level** — bypass (standard/elevated roles). Zero impact on those users.

**Flag ON with `require_device_trust = true` and untrusted device** — login blocked: 401 `DEVICE_NOT_TRUSTED`.

---

## Rollback Plan

### Immediate (< 1 minute, zero code change)

```sql
UPDATE epc_migration_feature_flags
SET enabled = false, updated_at = NOW()
WHERE flag_name = 'SECURITY_DEVICE_TRUST_ENABLED';
```

Effect: all login enforcement disabled instantly. All existing sessions remain valid. No data loss. Trusted device records preserved. Re-enable is the same UPDATE.

### Rollback Decision Criteria

Rollback if within 48 hours of enabling:
- Any high_security user reports unexpected login block
- `trusted_device_audit_log` write failure (C-10) causes login error
- Login latency for high_security users increases > 200 ms (device DB query performance issue)
- Any unexpected `DEVICE_NOT_TRUSTED` response in production logs for a user with a registered device

### Code Rollback (if needed)

Git checkpoint: `e734a53991bb68c89d3bcca75dc21bf69b376389` (Phase 3 complete).

---

## Verification Tests (T-D01 – T-D12)

| ID | Test | Setup | Action | Expected Result |
|---|---|---|---|---|
| T-D01 | Flag OFF bypass | `SECURITY_DEVICE_TRUST_ENABLED = false` | Superuser logs in, no cookie | Login succeeds; zero audit rows written |
| T-D02 | Login blocked — no cookie | Flag ON; Superuser has 1 active trusted device | Login without `thermopac.device` cookie | 401 `DEVICE_NOT_TRUSTED`; audit `action='login_blocked_untrusted'`, `severity='warning'`; `is_trusted_device=false` in login_audit_log |
| T-D03 | Login blocked — dead token | Flag ON; device revoked | Login with revoked cookie value | 401 `DEVICE_NOT_TRUSTED`; audit row written |
| T-D04 | Login succeeds — valid cookie | Flag ON; device active, cookie matches trust_token | Login from registered device | 200; `session.deviceTrusted=true`; `is_trusted_device=true` in login_audit_log; `last_used_at` updated; audit `action='login_trusted'` |
| T-D05 | Admin grant requires TOTP | No re-auth token | `POST /api/admin/users/:id/devices/grant` | 403 `REAUTH_REQUIRED`, `challengeType='any'` |
| T-D06 | Admin grant creates record | TOTP re-auth passed | `POST /api/admin/users/:id/devices/grant { deviceName }` | Row in `trusted_devices` with `device_fingerprint=''` (pending); audit `action='registered'`, `notes='Pending activation by user'` |
| T-D07 | Activation sets cookie | User authenticated; valid `trustToken` for their userId | `GET /api/security/activate-device?token=<valid>` | `Set-Cookie: thermopac.device=<token>; HttpOnly; SameSite=Strict`; `device_fingerprint` populated; audit `action='activated'` |
| T-D08 | Activation cross-user blocked | Token belongs to userId=3 | User userId=1 visits activation URL | 403 — token belongs to different user |
| T-D09 | Activation double-use blocked | Device already activated | Visit activation URL again | 409 — device already activated |
| T-D10 | Admin revoke deactivates | Active device exists; TOTP re-auth passed | `DELETE /api/admin/users/:id/devices/:deviceId` | `is_active=false`, `revoked_at` set; audit `action='revoked'`, `severity='warning'`; subsequent login → 401 |
| T-D11 | Self-revoke: own device only | User A device ID 10; User B device ID 20 | User A: `DELETE /api/security/my-devices/20` | 403 — ownership check fails |
| T-D12 | Standard role: no device check | Employee user; flag ON | Login without cookie | Login succeeds — `require_device_trust=false` for standard policy |

---

## Zero-Trust Audit Plan (ZT-P4-01 – ZT-P4-12)

Performed immediately after enabling `SECURITY_DEVICE_TRUST_ENABLED = true` and after all T-D tests pass:

| ID | Check | Method | Pass Condition |
|---|---|---|---|
| ZT-P4-01 | `trusted_device_audit_log` immutable (UPDATE blocked) | `UPDATE trusted_device_audit_log SET notes='x' WHERE id=<any>` | SQL error from immutability trigger |
| ZT-P4-02 | `trusted_device_audit_log` immutable (DELETE blocked) | `DELETE FROM trusted_device_audit_log WHERE id=<any>` | SQL error from immutability trigger |
| ZT-P4-03 | No code-level DELETE/UPDATE on audit log | `grep -n "DELETE FROM trusted_device_audit_log\|UPDATE trusted_device_audit_log" server/` | Zero results |
| ZT-P4-04 | Admin grant blocked without re-auth | `POST /api/admin/users/:id/devices/grant` — no session token | 403 REAUTH_REQUIRED |
| ZT-P4-05 | Admin revoke blocked without re-auth | `DELETE /api/admin/users/:id/devices/:id` — no session token | 403 REAUTH_REQUIRED |
| ZT-P4-06 | Cross-user activation blocked | Token for user A; authenticated as user B → activation URL | 403 |
| ZT-P4-07 | Dead cookie blocked at login | Revoke device → attempt login with old cookie | 401 DEVICE_NOT_TRUSTED |
| ZT-P4-08 | Flag OFF disables all device logic | Set flag false; login as Superuser without cookie | Login succeeds; zero audit rows for this login |
| ZT-P4-09 | `payroll-salary-core.ts` unchanged | `git diff HEAD~2 server/payroll-salary-core.ts` | Empty diff |
| ZT-P4-10 | Cookie attributes correct | Browser DevTools or curl response headers | `HttpOnly`, `SameSite=Strict`, `Max-Age=31536000` |
| ZT-P4-11 | `is_trusted_device` stamped in login_audit_log | Trusted login → SELECT login_audit_log | `is_trusted_device = true` for that row |
| ZT-P4-12 | Pre-enable SQL check passes | Run pre-enable SQL | Zero rows returned (all high_security users have ≥1 activated device) |

---

## Routes Summary

| Method | Route | File | Auth | Re-Auth | New/Modified |
|---|---|---|---|---|---|
| `GET` | `/api/security/my-devices` | `security-device-routes.ts` | Session | — | NEW |
| `DELETE` | `/api/security/my-devices/:id` | `security-device-routes.ts` | Session | any/30 min | NEW |
| `GET` | `/api/security/activate-device` | `security-device-routes.ts` | Session | — | NEW |
| `GET` | `/api/admin/users/:userId/devices` | `admin-device-routes.ts` | Superuser/HR | — | NEW |
| `DELETE` | `/api/admin/users/:userId/devices/:id` | `admin-device-routes.ts` | Superuser | TOTP/0 | NEW |
| `POST` | `/api/admin/users/:userId/devices/grant` | `admin-device-routes.ts` | Superuser | TOTP/0 | NEW |
| `GET` | `/api/admin/device-audit-log` | `admin-device-routes.ts` | Superuser | — | NEW |
| `POST` | `/api/login` | `auth.ts` | — | — | MODIFIED (device enforcement block) |

---

## Deviations from Baseline

**None.** All baseline requirements are fully implemented in Rev 2.

---

## Pre-Approval Checklist

- [ ] Trust-token cookie flow (`thermopac.device`) approved
- [ ] Activation endpoint flow (`GET /api/security/activate-device`) approved
- [ ] Cookie parsing via regex (no cookie-parser) approved
- [ ] Login enforcement (block on untrusted device) approved
- [ ] Pre-enable safety checklist (all 7 high_security users must have activated devices) approved
- [ ] 3 new files + 3 modified files scope approved
- [ ] No new npm packages approved
- [ ] Rollback plan (SQL flag toggle) approved
- [ ] T-D01 – T-D12 verification tests approved
- [ ] ZT-P4-01 – ZT-P4-12 zero-trust audit approved

---

*Rev 2 — Full baseline compliance. No deviations. Submit for approval.*
