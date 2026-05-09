# Phase 4 — Trusted Device Management: Pre-Approval Document
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Status: AWAITING APPROVAL — DO NOT IMPLEMENT UNTIL APPROVED

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

## Objective

Implement the trusted device registry for `high_security` roles (Superuser, General Manager, Senior Manager). When `SECURITY_DEVICE_TRUST_ENABLED = true`:

1. Every login by a `high_security` user checks whether the request comes from a device that appears in their `trusted_devices` record.
2. The check result is written to `trusted_device_audit_log` and stamped on the `login_audit_log.is_trusted_device` field.
3. Superusers can register, view, and revoke trusted devices via admin routes (all behind TOTP re-auth).
4. Users can view and self-revoke their own devices via self-service routes (behind password re-auth).

**Phase 4 does NOT block logins from untrusted devices.** It establishes the detection and management layer only. Enforcement (blocking untrusted logins for `high_security` roles) is deferred to Phase 5 or later, when explicitly approved. This follows the baseline's advisory-before-enforced philosophy.

**Zero new database tables required.** All required tables were provisioned in Phase 1: `trusted_devices`, `trusted_device_audit_log`. Schema already exported from `shared/schema.ts` (lines 13529–13560). Feature flag `SECURITY_DEVICE_TRUST_ENABLED` already seeded (`enabled = false`).

**`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

---

## Device Fingerprint Design

### Server-Side Only — No Client JS Required

The device fingerprint is computed server-side from HTTP headers at login time:

```typescript
// server/trusted-device-service.ts
import crypto from 'crypto';

export function computeDeviceFingerprint(req: Request): string {
  const ua = req.headers['user-agent'] ?? '';
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
             ?? req.socket?.remoteAddress ?? '';
  const lang = req.headers['accept-language'] ?? '';
  return crypto
    .createHash('sha256')
    .update(`${ip}:${ua}:${lang}`)
    .digest('hex');
}
```

`IP + User-Agent + Accept-Language` gives sufficient discrimination for a controlled ERP environment where users work from assigned machines. This is deterministic: the same machine on the same network always produces the same fingerprint.

### Trust Token (stored; cookie deferred to Phase 5)

`trusted_devices.trust_token` is populated with a deterministic value:

```typescript
export function computeTrustToken(userId: number, deviceFingerprint: string): string {
  return crypto
    .createHash('sha256')
    .update(`${userId}:${deviceFingerprint}:THERMOPAC_TRUST`)
    .digest('hex');
}
```

This value is stored in the DB for record-keeping and future Phase 5 cookie matching. **No cookie is set in Phase 4.** The `thermopac.device` persistent cookie (long-lived, `sameSite: strict`) is a Phase 5 enhancement and requires a separate approval. Phase 4 matches purely by fingerprint.

### Fingerprint Stability Note

If the user's IP changes (VPN, network switch), the fingerprint changes. In Phase 4, this results in a `login_new_device` audit event but no login block. The admin can always register the new fingerprint.

---

## Session / Cookie Behavior

### Session Extensions (added via `declare module 'express-session'` in the middleware file)

```typescript
declare module 'express-session' {
  interface SessionData {
    deviceTrusted?: boolean;           // true = device matched a trusted_devices record at login
    deviceFingerprint?: string;        // fingerprint computed at login; used for context in admin UIs
  }
}
```

These two fields are set at login time and do not change mid-session.

### Cookie Changes in Phase 4

**None.** The existing `thermopac.sid` session cookie is unchanged (httpOnly, sameSite=lax, 30-day maxAge). No new cookie is introduced in Phase 4.

The `thermopac.device` persistent trust cookie is Phase 5 scope and not in this document.

---

## Exact Files Changed

### New Files (3)

| File | Purpose |
|---|---|
| `server/trusted-device-service.ts` | `computeDeviceFingerprint()`, `computeTrustToken()`, `checkDeviceTrust()`, `registerDevice()`, `revokeDevice()`, `writeDeviceAudit()` |
| `server/security-device-routes.ts` | Self-service: `GET /api/security/my-devices`, `DELETE /api/security/my-devices/:id` |
| `server/admin-device-routes.ts` | Admin: `GET/DELETE /api/admin/users/:userId/devices/:id`, `POST /api/admin/users/:userId/devices/grant`, `GET /api/admin/device-audit-log` |

### Modified Files (3)

| File | Lines Touched | Change |
|---|---|---|
| `server/auth.ts` | Login handler (≈ line 277 block) | Add device trust check after successful credential verification; populate `session.deviceTrusted`, `session.deviceFingerprint`; update `login_audit_log.is_trusted_device`; write `trusted_device_audit_log` |
| `server/security-routes.ts` | Append after existing route | Register `securityDeviceRoutes` |
| `server/routes.ts` | Near line 691 (after existing security registration) | Import and register `adminDeviceRoutes` |

**Total new files: 3. Total modified files: 3.**

---

## Trusted Device Flow — Step by Step

### A. Login Flow (modified `server/auth.ts`)

```
1. User submits credentials → passport.authenticate() succeeds (Phase 2 lockout still runs first)
2. if SECURITY_DEVICE_TRUST_ENABLED === false → skip all device logic → next()
3. Look up user's policy level from login_security_policies
4. if policy.require_device_trust === false → skip (only high_security users checked) → next()
5. compute fingerprint = computeDeviceFingerprint(req)
6. look up trusted_devices WHERE user_id = userId AND is_active = true
7. trustMatch = records.find(r => r.device_fingerprint === fingerprint)
8. req.session.deviceTrusted = !!trustMatch
9. req.session.deviceFingerprint = fingerprint
10. if trustMatch: update trusted_devices.last_used_at = NOW()
11. write trusted_device_audit_log (action = 'login_trusted' | 'login_new_device')
12. update login_audit_log row (is_trusted_device = !!trustMatch) — same DB transaction as audit write
13. continue login (no block in Phase 4)
```

### B. Admin: Grant Device Trust

`POST /api/admin/users/:userId/devices/grant`  
**Auth:** `ensureAuthenticated` + Superuser role check + `requireReauth('security.grant_device_trust')` (TOTP, timeout=0)  
**Body:** `{ deviceFingerprint?: string, deviceName: string }`

```
1. Re-auth passes (TOTP, single-use)
2. If deviceFingerprint not provided in body: compute from current request (admin registering own device)
   If provided: use the submitted fingerprint (admin registering another user's device from audit log)
3. Check for duplicate: if active record with same fingerprint exists for userId → 409 Conflict
4. trustToken = computeTrustToken(userId, deviceFingerprint)
5. INSERT into trusted_devices { userId, deviceFingerprint, deviceName, trustToken, registeredByAdmin=true, registeredBy=adminId }
6. INSERT into trusted_device_audit_log { userId, deviceId, action='registered', performedBy=adminId, severity='info' }
7. Return { deviceId, deviceName, deviceFingerprint, trustToken }  ← trust_token in response body for reference
```

### C. Admin: Revoke Device

`DELETE /api/admin/users/:userId/devices/:id`  
**Auth:** `ensureAuthenticated` + Superuser role check + `requireReauth('security.grant_device_trust')` (TOTP, timeout=0)

```
1. Re-auth passes
2. Load trusted_devices record; if not found or wrong userId → 404
3. UPDATE trusted_devices SET is_active=false, revoked_at=NOW(), revoked_by=adminId, revoked_reason=body.reason
4. INSERT into trusted_device_audit_log { action='revoked', performedBy=adminId, severity='warning' }
5. Return { success: true }
```

### D. Admin: View User Devices

`GET /api/admin/users/:userId/devices`  
**Auth:** `ensureAuthenticated` + Superuser or HR role  
**Returns:** All `trusted_devices` records for the user (active and revoked), with audit log summary.

### E. Admin: View Device Audit Log

`GET /api/admin/device-audit-log`  
**Auth:** `ensureAuthenticated` + Superuser role  
**Query params:** `userId`, `action`, `from`, `to`, `limit`, `offset`  
**Returns:** Paginated `trusted_device_audit_log` rows joined with user names.

### F. Self-Service: View Own Devices

`GET /api/security/my-devices`  
**Auth:** `ensureAuthenticated`  
**Returns:** All `trusted_devices` records where `user_id = req.user.id`.

### G. Self-Service: Revoke Own Device

`DELETE /api/security/my-devices/:id`  
**Auth:** `ensureAuthenticated` + `requireReauth('security.revoke_session')` (any, 30 min)  
**Constraint:** Record must belong to `req.user.id` — users cannot revoke other users' devices.

```
1. Re-auth passes
2. Verify trusted_devices.user_id === req.user.id → else 403
3. UPDATE: is_active=false, revoked_at=NOW(), revoked_by=req.user.id, revoked_reason='self_revoked'
4. INSERT into trusted_device_audit_log { action='revoked', performedBy=req.user.id, severity='info', notes='self_revoked' }
5. Return { success: true }
```

---

## Re-Auth Actions Used in Phase 4

| Action Key | Routes | Challenge | Timeout | Already Seeded? |
|---|---|---|---|---|
| `security.grant_device_trust` | Admin grant + admin revoke | TOTP | 0 (single-use) | ✅ Yes (Phase 3 seed) |
| `security.revoke_session` | Self-revoke | any | 30 min | ✅ Yes (Phase 3 seed) |

No new sensitive action policies need to be seeded. Both are already in `sensitive_action_policies`.

---

## Feature Flag Behaviour

| Flag | Value Before Phase 4 | Value After Phase 4 Verified |
|---|---|---|
| `SECURITY_DEVICE_TRUST_ENABLED` | `false` | `true` (enabled after verification) |

When `SECURITY_DEVICE_TRUST_ENABLED = false`:
- Login flow: device check block is skipped entirely — no fingerprint computed, no DB queries, no audit write
- Admin/self-service device routes: still functional (CRUD works) but device trust is not enforced at login
- Existing sessions are unaffected

---

## Rollback Plan

### Immediate (< 1 minute)

```sql
UPDATE epc_migration_feature_flags
SET enabled = false, updated_at = NOW()
WHERE flag_name = 'SECURITY_DEVICE_TRUST_ENABLED';
```

**Effect:** Instantly disables all device trust checks at login. No route changes, no session invalidation, no data loss. All existing `trusted_devices` records remain intact. Re-enabling is the same UPDATE with `enabled = true`.

### Full Rollback (revert to pre-Phase-4 code state)

If a code-level rollback is needed (not expected):
1. Revert `server/auth.ts` to Phase 3 state (git checkpoint `0b16b8dcdb8ee0b782452cd60725e901447b8566`)
2. Remove `server/trusted-device-service.ts`, `server/security-device-routes.ts`, `server/admin-device-routes.ts`
3. Remove registrations from `server/routes.ts`
4. `SECURITY_DEVICE_TRUST_ENABLED` remains `false` in DB — no DB rollback needed
5. `trusted_devices` and `trusted_device_audit_log` tables remain in schema — zero data harm

### Rollback Decision Criteria

Rollback is triggered if within 24 hours of enabling the flag:
- Login for any `high_security` user fails unexpectedly
- `trusted_device_audit_log` write failures cause login errors (C-10)
- DB connection timeout in device trust query adds > 200ms to login latency

---

## Verification Tests (T-D01 – T-D09)

| ID | Name | Method | Precondition | Steps | Expected |
|---|---|---|---|---|---|
| T-D01 | Flag-off bypass | API | `SECURITY_DEVICE_TRUST_ENABLED = false` | Superuser logs in from unknown IP/UA | No audit row written; `session.deviceTrusted` not set |
| T-D02 | New device detected | API | Flag on; Superuser has 0 trusted devices | Superuser logs in | `trusted_device_audit_log` row with `action='login_new_device'`; `login_audit_log.is_trusted_device = false`; `session.deviceTrusted = false` |
| T-D03 | Trusted device matched | API | Flag on; Superuser has 1 active trusted device matching fingerprint | Superuser logs in from same IP/UA | `action='login_trusted'`; `is_trusted_device = true`; `session.deviceTrusted = true`; `last_used_at` updated |
| T-D04 | Admin grant requires TOTP | API | Superuser A tries to grant device trust for user | `POST /api/admin/users/:id/devices/grant` without re-auth | 403 `REAUTH_REQUIRED` with `challengeType='any'` |
| T-D05 | Admin grant creates record | API | Re-auth passed | `POST /api/admin/users/:id/devices/grant` with `deviceName`, `deviceFingerprint` | Row in `trusted_devices`; row in `trusted_device_audit_log` with `action='registered'` |
| T-D06 | Admin grant duplicate rejected | API | Active trusted_devices record exists for fingerprint | Grant same fingerprint again | 409 Conflict |
| T-D07 | Admin revoke deactivates record | API | Active device exists; re-auth passed | `DELETE /api/admin/users/:id/devices/:deviceId` | `is_active = false`, `revoked_at` set, audit row with `action='revoked'`, `severity='warning'` |
| T-D08 | Self-revoke: own device only | API | User A has device ID 10; User B has device ID 20 | User A: `DELETE /api/security/my-devices/20` | 403 — cannot revoke another user's device |
| T-D09 | Audit log immutable | SQL | Direct DB access | `UPDATE trusted_device_audit_log SET notes='tampered'` | Rejected by immutability trigger |

**Additional checks:**
- T-D10: Standard role user (`policy.require_device_trust = false`) — no device audit row written at login
- T-D11: HR role can `GET /api/admin/users/:userId/devices` — cannot `DELETE` or `POST /grant`
- T-D12: `GET /api/admin/device-audit-log` — Superuser only; HR gets 403

---

## Zero-Trust Audit Plan (Phase 4 specific)

Performed immediately after enabling `SECURITY_DEVICE_TRUST_ENABLED = true`:

### ZT-P4 Checks

| ID | Check | Command / SQL | Pass Condition |
|---|---|---|---|
| ZT-P4-01 | Immutability trigger on `trusted_device_audit_log` | `UPDATE trusted_device_audit_log SET notes='x' WHERE id=<any>` | SQL error: trigger fires |
| ZT-P4-02 | No DELETE in device service | `grep -n "DELETE FROM trusted_device_audit_log" server/` | Zero results |
| ZT-P4-03 | No UPDATE in device service (except revocation fields on `trusted_devices`, not audit log) | `grep -n "UPDATE.*trusted_device_audit_log" server/` | Zero results |
| ZT-P4-04 | Admin grant blocked without re-auth | POST grant without session re-auth token | 403 REAUTH_REQUIRED |
| ZT-P4-05 | Admin revoke blocked without re-auth | DELETE without re-auth token | 403 REAUTH_REQUIRED |
| ZT-P4-06 | Flag-off disables all device logic | Set flag false, login as Superuser | Zero rows in `trusted_device_audit_log` for that login |
| ZT-P4-07 | `payroll-salary-core.ts` unchanged | `git diff HEAD~1 server/payroll-salary-core.ts` | Empty diff |
| ZT-P4-08 | Cross-user self-revoke blocked | User A → DELETE on User B's device ID | 403 |
| ZT-P4-09 | `trusted_devices` duplicate fingerprint blocked | POST grant with existing fingerprint | 409 Conflict |
| ZT-P4-10 | `login_audit_log.is_trusted_device` stamped correctly | Login as Superuser with known device; SELECT from login_audit_log | `is_trusted_device = true` for that row |

---

## Impact Summary

| Area | Impact |
|---|---|
| Login latency | +1 DB query per `high_security` login (≈ 5 ms) when flag is on |
| Standard / elevated roles | Zero impact — device check skipped |
| Payroll | Zero impact — not in scope |
| Existing sessions | Unaffected — `deviceTrusted` not set for sessions started before Phase 4 enable |
| Schema | Zero changes — all tables already exist |
| Feature flags | `SECURITY_DEVICE_TRUST_ENABLED`: `false` → `true` after verification |
| Re-auth policies | No new policies needed — `security.grant_device_trust` and `security.revoke_session` already seeded |

---

## Deviations from Baseline

| Item | Baseline Spec | Phase 4 Approach | Reason |
|---|---|---|---|
| `trust_token` cookie (`thermopac.device`) | Implied by `trust_token` field | Not set in Phase 4 — deferred to Phase 5 | Admin cannot set a cookie on another user's browser via API; fingerprint matching is sufficient for Phase 4 detection layer |
| Login blocking for untrusted devices | `require_device_trust = true` in policy | Not enforced in Phase 4 | Phase 4 is detection-only; advisory-before-enforced principle; blocking requires Phase 5 approval |

Both deviations make Phase 4 **less restrictive** than the baseline — no deviation from intent. Phase 5 will address the persistent cookie and enforcement gate.

---

## Pre-Approval Checklist

The following must be confirmed before implementation begins:

- [ ] Device fingerprint design (IP + UA + Accept-Language SHA-256) approved
- [ ] No cookie in Phase 4 (fingerprint-only matching) approved
- [ ] Detection-only in Phase 4 (no login blocking) approved
- [ ] 3 new files + 3 modified files scope approved
- [ ] Rollback plan approved
- [ ] T-D01 – T-D12 verification tests approved
- [ ] ZT-P4-01 – ZT-P4-10 zero-trust audit approved

---

*Submit approval to proceed with implementation.*
