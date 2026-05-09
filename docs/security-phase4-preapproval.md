# Phase 4 — Trusted Device Management: Pre-Approval Document (Revision 3)
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Status: AWAITING APPROVAL — DO NOT IMPLEMENT UNTIL APPROVED

---

## Revision History

| Rev | Date | Change |
|---|---|---|
| Rev 1 | 09 May 2026 | Initial submission — REJECTED: no cookie, no enforcement |
| Rev 2 | 09 May 2026 | Full baseline compliance: cookie activation flow; login enforcement; pre-enable checklist |
| Rev 3 | 09 May 2026 | Added: emergency recovery procedure; lost-device flow; browser-reset/cookie-loss flow; temporary bypass governance; audit logging for all bypass actions; forced re-registration flow; break-glass script |

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

## Corrections from Rev 1 (Both Baseline Deviations Resolved in Rev 2)

### Correction 1 — Trust Token Cookie (Rev 2)

**Rev 1 problem:** Fingerprint-only matching proposed. Baseline requires trust token / cookie behavior.

**Rev 2 resolution:** Full two-step flow: admin grants → generates 64-char cryptographic `trust_token` → user visits `GET /api/security/activate-device?token=<trustToken>` on their own machine → server sets `thermopac.device` cookie directly on user's browser → login matches by `trust_token`.

### Correction 2 — Login Enforcement (Rev 2)

**Rev 1 problem:** Detection-only. Baseline `require_device_trust = true` requires enforcement.

**Rev 2 resolution:** When `SECURITY_DEVICE_TRUST_ENABLED = true` AND `policy.require_device_trust = true`, untrusted device login blocked with `401 DEVICE_NOT_TRUSTED`. Pre-enable checklist prevents lockout.

---

## Objective

Implement fully enforced trusted device governance for `high_security` roles (Superuser, General Manager, Senior Manager — 7 users currently). When `SECURITY_DEVICE_TRUST_ENABLED = true`:

1. Login from any `high_security` user without a valid `thermopac.device` cookie is blocked.
2. Admin can register, view, and revoke trusted devices (TOTP re-auth on all writes).
3. Admin can revoke all devices for a user (compromise response — TOTP re-auth, severity=critical).
4. Users can view and self-revoke their own devices (password re-auth).
5. All device events written to `trusted_device_audit_log` (append-only, immutable).
6. Full recovery and bypass governance defined and audited.

**Standard and elevated roles are not affected** — `require_device_trust = false`.

**`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

**Zero new database tables.** All tables provisioned in Phase 1. Feature flag seeded (`enabled = false`).

---

## Current Baseline State

| Entity | Value |
|---|---|
| High-security users | 7 (Superuser×2, General Manager×1, Senior Manager×4) |
| Active trusted devices | **0** (none registered) |
| `require_device_trust` for high_security | `true` |
| `SECURITY_DEVICE_TRUST_ENABLED` | `false` — safe |
| `cookie-parser` npm package | NOT installed — not required |

---

## Cookie Design

### `thermopac.device` — Persistent Trust Cookie

| Attribute | Value |
|---|---|
| Name | `thermopac.device` |
| Value | `trust_token` — `crypto.randomBytes(32).toString('hex')` (64-char hex) |
| HttpOnly | `true` |
| SameSite | `'strict'` |
| Secure | `true` when `NODE_ENV === 'production'` |
| MaxAge | `31_536_000` seconds (365 days) |
| Path | `/` |

### Cookie Parsing (no `cookie-parser`)

```typescript
export function parseDeviceCookie(req: Request): string | undefined {
  const header = req.headers.cookie ?? '';
  const match = /(?:^|;\s*)thermopac\.device=([A-Fa-f0-9]{64})(?:;|$)/.exec(header);
  return match?.[1];
}
```

### Device Fingerprint (supplemental — not used for auth)

```typescript
export function computeDeviceFingerprint(req: Request): string {
  const ua   = req.headers['user-agent']        ?? '';
  const ip   = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               ?? req.socket?.remoteAddress      ?? '';
  const lang = req.headers['accept-language']   ?? '';
  return crypto.createHash('sha256').update(`${ip}:${ua}:${lang}`).digest('hex');
}
```

Stored in `trusted_devices.device_fingerprint` at activation time and updated on each trusted login. Forensic reference only. The `trust_token` cookie is the sole auth signal at login.

---

## Exact Files Changed

### New Files (4)

| File | Purpose |
|---|---|
| `server/trusted-device-service.ts` | `parseDeviceCookie()`, `computeDeviceFingerprint()`, `checkDeviceTrust()`, `registerDevice()`, `revokeDevice()`, `revokeAllDevices()`, `activateDevice()`, `writeDeviceAudit()`, `writeBypassAudit()` |
| `server/security-device-routes.ts` | Self-service: `GET /api/security/my-devices`, `DELETE /api/security/my-devices/:id`, `GET /api/security/activate-device` |
| `server/admin-device-routes.ts` | Admin: `GET/DELETE /api/admin/users/:userId/devices/:id`, `POST /api/admin/users/:userId/devices/grant`, `POST /api/admin/users/:userId/devices/revoke-all`, `GET /api/admin/device-audit-log` |
| `scripts/emergency-recovery.ts` | Break-glass: disable/re-enable flag; write emergency audit rows; enforce 4-hour bypass window |

### Modified Files (3)

| File | Change |
|---|---|
| `server/auth.ts` | Login enforcement block: parse cookie, query DB, block or pass, write device audit, stamp `login_audit_log.is_trusted_device` |
| `server/security-routes.ts` | Register `securityDeviceRoutes` |
| `server/routes.ts` | Register `adminDeviceRoutes` |

---

## Audit Log Action Types

All actions write to `trusted_device_audit_log` (append-only, immutable). Complete action vocabulary for Phase 4:

| Action | Severity | Trigger |
|---|---|---|
| `registered` | info | Admin grants device trust for a user |
| `activated` | info | User activates device (cookie set) |
| `login_trusted` | info | Login from a trusted device |
| `login_blocked_untrusted` | warning | Login blocked — no cookie or dead token |
| `revoked` | warning | Single device revoked (admin or self) |
| `revoke_all` | critical | All devices revoked for a user (compromise response) |
| `reregistration_required` | warning | Re-registration forced after recovery |
| `bypass_temp_activated` | critical | Flag disabled via emergency recovery script |
| `bypass_temp_deactivated` | warning | Flag re-enabled after bypass |
| `break_glass_activated` | emergency | Break-glass invoked (both Superusers locked out) |
| `break_glass_deactivated` | warning | Break-glass resolved, flag re-enabled |

---

## Full Flow Specifications

### A. Device Activation (Two-Step)

```
Step 1 — Admin grants trust:
  POST /api/admin/users/:userId/devices/grant
  Auth: ensureAuthenticated + Superuser + requireReauth('security.grant_device_trust') [TOTP, timeout=0]
  Body: { deviceName: string }

  1. trust_token = crypto.randomBytes(32).toString('hex')
  2. INSERT trusted_devices { userId, trustToken, deviceName,
       device_fingerprint='', registeredByAdmin=true, registeredBy=adminId }
  3. INSERT trusted_device_audit_log { action='registered', severity='info',
       notes='Pending activation by user' }
  4. Return { deviceId, trustToken,
       activationUrl: '/api/security/activate-device?token=<trustToken>' }

  Admin communicates activationUrl to user via secure out-of-band channel.

Step 2 — User activates on their own machine:
  GET /api/security/activate-device?token=<trustToken>
  Auth: ensureAuthenticated (user must be logged in on that machine)

  1. Validate token format (64-char hex)
  2. SELECT trusted_devices WHERE trust_token = $1 AND is_active = true
  3. If not found → 404 (token invalid or revoked)
  4. If record.userId !== req.user.id → 403 (wrong user)
  5. If record.device_fingerprint !== '' → 409 (already activated)
  6. fingerprint = computeDeviceFingerprint(req)
  7. UPDATE trusted_devices SET device_fingerprint=fingerprint, last_used_at=NOW()
  8. INSERT trusted_device_audit_log { action='activated', severity='info',
       notes='Device cookie set on user machine' }
  9. res.cookie('thermopac.device', trustToken, {
       httpOnly: true, sameSite: 'strict',
       secure: NODE_ENV==='production', maxAge: 31_536_000_000 })
  10. Return { success: true }
```

### B. Login Enforcement

```
[After credential check + Phase 2 lockout + req.login()]

if SECURITY_DEVICE_TRUST_ENABLED === false → skip, proceed
if policy.require_device_trust === false → skip, proceed

cookieToken = parseDeviceCookie(req)

if !cookieToken:
  → INSERT trusted_device_audit_log { action='login_blocked_untrusted',
      severity='warning', notes='No device cookie present' }
  → stamp login_audit_log.is_trusted_device = false
  → req.logout()
  → return 401 { code: 'DEVICE_NOT_TRUSTED',
      message: 'Access from an unregistered device. Contact your Superuser.' }

trustRecord = SELECT FROM trusted_devices
  WHERE trust_token = cookieToken AND user_id = userId AND is_active = true

if !trustRecord:
  → INSERT trusted_device_audit_log { action='login_blocked_untrusted',
      severity='warning', notes='Cookie token not in active device registry' }
  → stamp login_audit_log.is_trusted_device = false
  → req.logout()
  → return 401 { code: 'DEVICE_NOT_TRUSTED',
      message: 'Device trust token is invalid or has been revoked.' }

// Device trusted
→ UPDATE trusted_devices SET last_used_at=NOW() WHERE id=trustRecord.id
→ INSERT trusted_device_audit_log { action='login_trusted', severity='info' }
→ stamp login_audit_log.is_trusted_device = true
→ session.deviceTrusted = true
→ session.deviceFingerprint = computeDeviceFingerprint(req)
→ proceed
```

### C. Admin Revoke Single Device

```
DELETE /api/admin/users/:userId/devices/:id
Auth: Superuser + requireReauth('security.grant_device_trust') [TOTP, timeout=0]

1. Load record WHERE id=:id AND user_id=:userId → else 404
2. UPDATE: is_active=false, revoked_at=NOW(), revoked_by=adminId, revoked_reason=body.reason
3. INSERT trusted_device_audit_log { action='revoked', severity='warning', notes=reason }
4. Return { success: true }

Effect: cookie remains in user's browser but rejected at next login.
```

### D. Admin Revoke All Devices (Compromise Response)

```
POST /api/admin/users/:userId/devices/revoke-all
Auth: Superuser + requireReauth('security.grant_device_trust') [TOTP, timeout=0]
Body: { reason: string }  ← required (non-empty)

1. Re-auth passes (TOTP, single-use)
2. Validate reason is non-empty → else 400
3. BEGIN transaction
4. UPDATE trusted_devices SET is_active=false, revoked_at=NOW(),
     revoked_by=adminId, revoked_reason=reason
   WHERE user_id=:userId AND is_active=true
   RETURNING id, device_name
5. INSERT trusted_device_audit_log per revoked device { action='revoke_all',
     severity='critical', notes=reason }
6. INSERT trusted_device_audit_log { action='reregistration_required',
     severity='warning', notes='Forced re-registration after revoke-all' }
7. COMMIT
8. Return { revokedCount, message: 'All devices revoked. User must re-register.' }

Effect: user blocked from login on ALL machines until a Superuser issues a new
device grant and the user activates it. Existing sessions expire normally (not
force-invalidated here — use POST /api/admin/users/:id/force-logout for that).
```

### E–H. (Admin view, audit log, self-service view/revoke — unchanged from Rev 2)

---

## Section 5 — Recovery and Bypass Governance

### 5.1 Recovery Scenario Taxonomy

Five distinct recovery scenarios, each with different auth requirements and device impact:

| Scenario | Description | Auth Required | Invalidates ALL devices? | Route Used |
|---|---|---|---|---|
| S1 | Cookie loss (browser cleared, OS reinstall) | TOTP (admin grant) | NO — only old orphaned record optionally revoked | Admin grant + activation |
| S2 | Single device lost/stolen | TOTP (admin revoke + new grant) | NO — only the compromised device revoked | Admin revoke + grant |
| S3 | Single Superuser locked out, other available | TOTP (available Superuser grants) | NO | Admin grant + activation |
| S4 | All Superusers locked out | BREAK-GLASS (server script) | NO (flag paused; records intact) | `scripts/emergency-recovery.ts` |
| S5 | Suspected active compromise | TOTP + revoke-all | YES — for that user only | POST revoke-all + admin grant |

---

### 5.2 Browser-Reset / Cookie-Loss Recovery Flow (Scenario S1)

**Trigger:** User clears browser data, reinstalls OS, or switches browser profile. Cookie is gone. DB record is still active (orphaned). User gets `401 DEVICE_NOT_TRUSTED`.

**Who can act:** Any active Superuser.

**Recovery steps:**

```
1. Superuser logs into admin panel (from their own trusted machine).
2. Superuser navigates to User Devices page for the affected user.
3. [Optional] Superuser revokes the old orphaned device record (hygiene — no security risk
   since the cookie is already gone from the user's browser).
4. Superuser: POST /api/admin/users/:userId/devices/grant { deviceName } (TOTP re-auth)
   → receives { trustToken, activationUrl }
5. Superuser communicates activationUrl to the affected user via secure channel
   (internal message, phone call, email).
6. User logs into the application from their machine (login works IF flag is temporarily
   OFF, OR if they have another machine with a valid cookie).
   If user has NO other trusted machine and flag is ON:
     → User cannot log in to visit the activation URL.
     → See S1 Special Case below.
7. User visits activationUrl on their machine while authenticated.
8. Cookie set. User can now log in normally.

S1 Special Case — User has no other trusted machine (flag ON, login blocked):
  Option A: Admin temporarily adds user's activation URL to a page the user can
    access without login (not implemented in Phase 4 — Phase 5 enhancement).
  Option B: Admin disables the flag temporarily (bypass — see Section 5.5),
    user logs in, visits activation URL, admin re-enables flag.
  Option B is the Phase 4 fallback. Bypass must follow Section 5.5 governance.
```

**Does recovery invalidate other existing trusted devices?** NO.

**Requires TOTP?** YES — admin grant always requires TOTP re-auth (single-use).

---

### 5.3 Lost or Stolen Device Recovery Flow (Scenario S2)

**Trigger:** User's physical machine is lost or stolen. The `thermopac.device` cookie is on a device no longer under the user's control. This is a security risk — the cookie can be used to gain access if login credentials are also compromised.

**Who can act:** Any active Superuser.

**Recovery steps:**

```
1. Affected user or manager reports the incident to a Superuser.
2. Superuser immediately revokes the compromised device:
   DELETE /api/admin/users/:userId/devices/:id (TOTP re-auth)
   reason: 'Device lost/stolen — YYYY-MM-DD'
   → trusted_device_audit_log: action='revoked', severity='warning'
3. Cookie on the stolen device is now a dead token — blocked at next login attempt.
4. If attacker already has an active session (they logged in before revocation):
   → Proceed to force-logout: POST /api/admin/users/:id/force-logout (TOTP re-auth)
     This invalidates all sessions (existing Phase 2 functionality).
5. Superuser issues new device for the user's replacement machine:
   POST /api/admin/users/:userId/devices/grant { deviceName: 'Replacement - <date>' }
   (TOTP re-auth)
6. User activates on new machine: GET /api/security/activate-device?token=<trustToken>
7. User logs in normally.
```

**Does recovery invalidate other existing trusted devices?** NO — only the specific compromised device is revoked. Other registered machines (e.g., backup machines) remain valid.

**Requires TOTP?** YES — revoke and grant both require TOTP re-auth.

---

### 5.4 Superuser Break-Glass Recovery (Scenario S4 — Both Superusers Locked Out)

**Trigger:** Both Superusers (Prasad userId=3, Manager userId=1) have lost their device cookies and have no other registered trusted machines. Neither can log in. No admin can issue a device grant.

**This is a rare but possible scenario if the pre-enable checklist's ≥2 devices per Superuser requirement was not maintained.**

**Who can act:** Anyone with Replit console access (server-level access only — not application access).

**Break-glass script:** `scripts/emergency-recovery.ts`

```
Runtime: Node.js — runs directly from Replit console (not via HTTP API)
Secret:  BREAK_GLASS_PASSPHRASE — set in Replit Secrets; never hardcoded
Command: npx ts-node scripts/emergency-recovery.ts <command> <passphrase>
```

#### Break-glass: disable enforcement (open the window)

```
npx ts-node scripts/emergency-recovery.ts disable-trust <BREAK_GLASS_PASSPHRASE>

Script actions:
1. Verify passphrase matches BREAK_GLASS_PASSPHRASE env var → else abort
2. Check if SECURITY_DEVICE_TRUST_ENABLED is already false → if so, abort (already off)
3. SELECT from trusted_device_audit_log WHERE action='break_glass_activated'
   AND created_at > NOW() - INTERVAL '4 hours'
   → if found → abort (break-glass already active; do not double-log)
4. UPDATE epc_migration_feature_flags SET enabled=false
   WHERE flag_name='SECURITY_DEVICE_TRUST_ENABLED'
5. INSERT trusted_device_audit_log {
     userId=NULL, deviceId=NULL,
     action='break_glass_activated', severity='emergency',
     notes='Emergency recovery — initiated from server console at <ISO timestamp>',
     ipAddress='server-console'
   }
6. Print to stdout:
   "⚠️  BREAK-GLASS ACTIVATED. Device trust enforcement is now OFF.
    Window: 4 hours. Re-enable with: disable-trust re-enable command.
    Action logged to trusted_device_audit_log."
```

#### Recovery steps after break-glass activation

```
1. Both Superusers log in normally (flag is OFF — no device check).
2. Superuser A: POST /api/admin/users/3/devices/grant { deviceName: 'Primary - Post-Recovery' }
   (TOTP re-auth) → activationUrl for Prasad
3. Superuser A: POST /api/admin/users/1/devices/grant { deviceName: 'Primary - Post-Recovery' }
   (TOTP re-auth) → activationUrl for Manager
4. Each Superuser visits their activationUrl on their own machine → cookie set.
5. [Optional but recommended] Each Superuser registers a backup machine as well.
6. Run pre-enable SQL check — must return 0 rows.
7. Re-enable enforcement (see below).
```

#### Break-glass: re-enable enforcement (close the window)

```
npx ts-node scripts/emergency-recovery.ts enable-trust <BREAK_GLASS_PASSPHRASE>

Script actions:
1. Verify passphrase
2. Run pre-enable SQL check — if any high_security user has 0 activated devices → abort
   with message: "Cannot re-enable: <username> has no active devices."
3. UPDATE epc_migration_feature_flags SET enabled=true
   WHERE flag_name='SECURITY_DEVICE_TRUST_ENABLED'
4. INSERT trusted_device_audit_log {
     action='break_glass_deactivated', severity='warning',
     notes='Break-glass resolved. Device trust enforcement re-enabled. Pre-enable check passed.'
   }
5. Print: "✅ BREAK-GLASS CLOSED. Device trust enforcement is ON."
```

**Does break-glass invalidate existing trusted devices?** NO. The flag going OFF does not delete, modify, or invalidate any `trusted_devices` records. All other users' (GM, SM) device records remain intact and will be enforced again when the flag is re-enabled.

**Requires TOTP?** NO — break-glass requires server console access (Replit), not TOTP. This is intentional: TOTP is an application-layer control that cannot be used when the application itself is the blocker. Server console access is the compensating physical-layer control.

**Maximum bypass window:** 4 hours. The script enforces this by aborting `disable-trust` if a `break_glass_activated` row already exists within the last 4 hours. If recovery is not completed within 4 hours, the break-glass must be re-invoked (with a new passphrase confirmation) and the extension is logged.

**Compensating controls for break-glass use:**
- All break-glass actions are logged at `severity='emergency'` in `trusted_device_audit_log`
- The `SECURITY_MONITORING_ENABLED` flag (when enabled in a later phase) will alert on `severity='emergency'` events
- Break-glass event is visible in `GET /api/admin/device-audit-log` immediately after the script runs
- Superusers must review the break-glass log entry and sign off within 24 hours of recovery

---

### 5.5 Temporary Bypass Governance

A temporary bypass is defined as any deliberate disabling of `SECURITY_DEVICE_TRUST_ENABLED` outside of a permanent rollback. This section governs all bypass scenarios.

#### When bypass is permitted

| Scenario | Permitted? | Auth | Max Duration |
|---|---|---|---|
| S1 Special Case (cookie loss, no other machine) | Yes | TOTP (admin grant) + bypass for activation window | 30 minutes |
| S4 Break-glass (both Superusers locked out) | Yes | Server console + passphrase | 4 hours |
| Routine maintenance / testing | No | — | — |
| Convenience (user forgot to activate) | No | — | — |
| Pre-enable rollback (first 48 hours) | Yes — treated as rollback, not bypass | — | Indefinite |

#### Bypass audit requirement (non-negotiable)

Every bypass event — regardless of method — must be accompanied by an audit log entry in `trusted_device_audit_log`. The emergency recovery script handles this automatically. For the S1 Special Case (manual SQL bypass), the operator must insert the audit row manually:

```sql
INSERT INTO trusted_device_audit_log
  (user_id, action, severity, notes, ip_address, created_at)
VALUES
  (NULL, 'bypass_temp_activated', 'critical',
   'S1 recovery bypass — <reason> — initiated by <adminName> at <timestamp>',
   'manual', NOW());
```

And when re-enabling:

```sql
-- Re-enable flag
UPDATE epc_migration_feature_flags SET enabled=true
WHERE flag_name='SECURITY_DEVICE_TRUST_ENABLED';

-- Log the closure
INSERT INTO trusted_device_audit_log
  (user_id, action, severity, notes, ip_address, created_at)
VALUES
  (NULL, 'bypass_temp_deactivated', 'warning',
   'S1 recovery bypass closed — user <username> activated device',
   'manual', NOW());
```

**Failure to log a bypass is a governance violation.** The break-glass script enforces logging automatically. Manual SQL bypasses require manual log entry as described above.

#### Bypass does NOT invalidate existing trusted devices

Disabling `SECURITY_DEVICE_TRUST_ENABLED` (by any method) does not delete, modify, or invalidate any `trusted_devices` records. Re-enabling the flag immediately restores enforcement using all existing records.

---

### 5.6 Active Compromise Recovery Flow (Scenario S5)

**Trigger:** A device is suspected to be under attacker control (device stolen with unlocked session, credentials phished with device cookie captured, etc.). The attacker may have — or have had — an active session.

**Who can act:** Any active Superuser.

**Recovery steps:**

```
1. Superuser: POST /api/admin/users/:userId/devices/revoke-all (TOTP re-auth)
   Body: { reason: 'Suspected device compromise — <date> — <incident description>' }
   → ALL active trusted_devices for user revoked
   → audit: action='revoke_all', severity='critical' (per device)
   → audit: action='reregistration_required', severity='warning'

2. Superuser: POST /api/admin/users/:userId/force-logout (TOTP re-auth) [existing Phase 2]
   → Invalidates all active sessions for the user

3. [If credentials also suspected compromised] Admin initiates password reset for the user.

4. Superuser: POST /api/admin/users/:userId/devices/grant { deviceName: 'Replacement - <date>' }
   (TOTP re-auth) — only after user is on a verified clean machine
   → User activates on clean machine

5. User logs in normally from clean machine.
```

**Does recovery invalidate all existing trusted devices?** YES — for that user only. Other users' devices are not affected. The `revoke-all` is scoped to a single `userId`.

**Requires TOTP?** YES — both `revoke-all` and `force-logout` require TOTP re-auth.

---

### 5.7 Forced Re-Registration Flow After Recovery

Re-registration is not automatic — it requires the admin grant + user activation sequence for every scenario. There is no self-service re-registration because a user with a lost cookie cannot authenticate to the application when `require_device_trust = true`.

**Re-registration sequence (universal across all scenarios):**

```
1. Admin: POST /api/admin/users/:userId/devices/grant (TOTP) → { activationUrl }
2. Admin communicates activationUrl to user (secure out-of-band channel)
3. User: if unable to log in (flag ON) → one of:
   a. Admin: temporary bypass (Section 5.5) → user logs in → visits activationUrl → bypass closed
   b. User has another trusted machine: log in there, then visit activationUrl from blocked machine
      (Note: activationUrl requires login — user must be authenticated as themselves)
4. User: GET /api/security/activate-device?token=<trustToken> → cookie set
5. User logs in from that machine normally.
```

**Forced re-registration is implicit** — there is no separate API endpoint for it. The combination of `revoke-all` (or single revoke) + new `grant` + activation constitutes forced re-registration.

After `revoke-all`, the `reregistration_required` audit event serves as the paper trail confirming that re-registration is pending. The admin device view shows any user with `reregistration_required` as their most recent audit event, flagged in the UI.

---

## Session Additions

```typescript
declare module 'express-session' {
  interface SessionData {
    deviceTrusted?: boolean;       // true = passed device trust check at login
    deviceFingerprint?: string;    // request fingerprint for admin UI display
  }
}
```

---

## Pre-Enable Safety Checklist (MANDATORY before setting flag to true)

All 7 high_security users currently have **0** active trusted devices. Enabling the flag before all devices are registered locks all 7 users out immediately.

**Pre-enable SQL — must return 0 rows:**

```sql
SELECT u.id, u.username, u.role
FROM users u
WHERE u.role IN ('Superuser', 'General Manager', 'Senior Manager')
  AND NOT EXISTS (
    SELECT 1 FROM trusted_devices td
    WHERE td.user_id = u.id
      AND td.is_active = true
      AND td.device_fingerprint != ''   -- must be activated, not just granted
  );
```

**Additional requirements before enabling:**
- [ ] Both Superusers (Prasad userId=3, Manager userId=1) have ≥ 2 active trusted devices each (primary + backup machine)
- [ ] `BREAK_GLASS_PASSPHRASE` set in Replit Secrets
- [ ] `scripts/emergency-recovery.ts` verified functional (dry run in dev environment)
- [ ] `GET /api/security/activate-device?token=<valid>` confirmed to set cookie in browser
- [ ] Login from high_security user without cookie confirmed to return 401 DEVICE_NOT_TRUSTED
- [ ] Login from high_security user with valid cookie confirmed to succeed
- [ ] `GET /api/admin/device-audit-log` shows expected audit rows for all of the above tests

---

## Feature Flag Behaviour

| Flag | Dev Default | Production Value After Verification |
|---|---|---|
| `SECURITY_DEVICE_TRUST_ENABLED` | `false` | `true` only after pre-enable checklist passes |

**Flag OFF** — complete bypass: no cookie parsed, no DB query, no audit write, no login blocking. Zero performance impact on any user.

**Flag ON + `require_device_trust = false`** — bypass (standard/elevated roles). Zero impact.

**Flag ON + `require_device_trust = true` + no valid cookie** — login blocked: 401 `DEVICE_NOT_TRUSTED`.

---

## Rollback Plan

### Immediate (< 1 minute, zero code change)

```sql
UPDATE epc_migration_feature_flags
SET enabled = false, updated_at = NOW()
WHERE flag_name = 'SECURITY_DEVICE_TRUST_ENABLED';
```

This is a permanent rollback (not a bypass) — no audit log entry required in the rollback plan window (first 48 hours after go-live). If disabled after the 48-hour window, it must follow bypass governance (Section 5.5).

### Rollback Decision Criteria

Rollback if within 48 hours of enabling:
- Any high_security user reports unexpected login block
- `trusted_device_audit_log` write failure causes login error
- Login latency for high_security users increases > 200 ms
- Any `DEVICE_NOT_TRUSTED` for a user with a confirmed activated device

### Code Rollback (if needed)

Git checkpoint: `e734a53991bb68c89d3bcca75dc21bf69b376389` (Phase 3 complete).

---

## Verification Tests (T-D01 – T-D18)

| ID | Test | Setup | Action | Expected |
|---|---|---|---|---|
| T-D01 | Flag OFF bypass | `SECURITY_DEVICE_TRUST_ENABLED = false` | Superuser logs in, no cookie | Login succeeds; zero audit rows written |
| T-D02 | Login blocked — no cookie | Flag ON; Superuser has active device | Login without cookie | 401 DEVICE_NOT_TRUSTED; audit `login_blocked_untrusted` |
| T-D03 | Login blocked — dead token | Flag ON; device revoked; user has revoked cookie | Login with revoked cookie | 401 DEVICE_NOT_TRUSTED; audit row |
| T-D04 | Login succeeds — valid cookie | Flag ON; device active; cookie matches | Login from registered machine | 200; `session.deviceTrusted=true`; `is_trusted_device=true`; `last_used_at` updated |
| T-D05 | Admin grant requires TOTP | No re-auth | POST grant | 403 REAUTH_REQUIRED |
| T-D06 | Admin grant creates pending record | TOTP passed | POST grant `{ deviceName }` | Row in `trusted_devices` with `device_fingerprint=''`; audit `registered` |
| T-D07 | Activation sets cookie | User authenticated; valid token for their userId | GET activate-device | `Set-Cookie: thermopac.device=<token>; HttpOnly; SameSite=Strict`; fingerprint populated; audit `activated` |
| T-D08 | Activation cross-user blocked | Token belongs to userId=3 | userId=1 visits URL | 403 |
| T-D09 | Activation double-use blocked | Already activated | Visit again | 409 |
| T-D10 | Admin revoke single device | TOTP passed | DELETE device | `is_active=false`; audit `revoked`; subsequent login → 401 |
| T-D11 | Self-revoke: own device only | User A device 10; User B device 20 | User A DELETE device 20 | 403 |
| T-D12 | Standard role: no check | Employee; flag ON | Login without cookie | Login succeeds |
| T-D13 | Revoke-all: all devices deactivated | User has 3 active devices; TOTP passed | POST revoke-all `{ reason }` | All 3 records `is_active=false`; 3 audit `revoke_all` rows (critical); 1 `reregistration_required` row |
| T-D14 | Revoke-all: empty reason rejected | TOTP passed | POST revoke-all `{ reason: '' }` | 400 Bad Request |
| T-D15 | Break-glass disables flag | `BREAK_GLASS_PASSPHRASE` set; flag ON | Run `disable-trust <passphrase>` | Flag = false; audit `break_glass_activated`, severity=emergency; login works for Superuser without cookie |
| T-D16 | Break-glass re-enable blocked if users unready | After T-D15; no devices registered | Run `enable-trust <passphrase>` | Script aborts: "Cannot re-enable: <username> has no active devices" |
| T-D17 | Break-glass re-enable after devices registered | After T-D15; all devices registered | Run `enable-trust <passphrase>` | Flag = true; audit `break_glass_deactivated`; Superuser login enforced again |
| T-D18 | Wrong break-glass passphrase rejected | Incorrect passphrase | Run `disable-trust wrong-pass` | Script aborts: "Invalid passphrase"; no DB changes; no audit rows |

---

## Zero-Trust Audit Plan (ZT-P4-01 – ZT-P4-18)

Performed after enabling `SECURITY_DEVICE_TRUST_ENABLED = true` and all T-D tests pass:

| ID | Check | Method | Pass Condition |
|---|---|---|---|
| ZT-P4-01 | Audit log: UPDATE blocked | `UPDATE trusted_device_audit_log SET notes='x'` | SQL error |
| ZT-P4-02 | Audit log: DELETE blocked | `DELETE FROM trusted_device_audit_log WHERE id=<any>` | SQL error |
| ZT-P4-03 | No code-level audit tampering | `grep -rn "UPDATE trusted_device_audit_log\|DELETE FROM trusted_device_audit_log" server/` | Zero results |
| ZT-P4-04 | Admin grant blocked without re-auth | POST grant without session token | 403 REAUTH_REQUIRED |
| ZT-P4-05 | Admin revoke blocked without re-auth | DELETE device without session token | 403 REAUTH_REQUIRED |
| ZT-P4-06 | Revoke-all blocked without re-auth | POST revoke-all without session token | 403 REAUTH_REQUIRED |
| ZT-P4-07 | Cross-user activation blocked | Token for user A; authenticated as user B | 403 |
| ZT-P4-08 | Dead cookie rejected at login | Revoke device; login with old cookie | 401 DEVICE_NOT_TRUSTED |
| ZT-P4-09 | Flag OFF disables all device logic | Set flag false; login as Superuser without cookie | Login succeeds; zero device audit rows for that login |
| ZT-P4-10 | `payroll-salary-core.ts` unchanged | `git diff HEAD~2 server/payroll-salary-core.ts` | Empty diff |
| ZT-P4-11 | Cookie attributes correct | curl response headers | `HttpOnly`, `SameSite=Strict`, `Max-Age=31536000` |
| ZT-P4-12 | `is_trusted_device` stamped in login_audit_log | Trusted login → SELECT login_audit_log | `is_trusted_device = true` for that row |
| ZT-P4-13 | Break-glass passphrase required | Run `disable-trust wrong-pass` | Script aborts; no DB changes |
| ZT-P4-14 | Break-glass audit row written (emergency severity) | After `disable-trust` | `trusted_device_audit_log` row: `action='break_glass_activated'`, `severity='emergency'` |
| ZT-P4-15 | Break-glass re-enable blocked if users unregistered | Immediately after break-glass disable | `enable-trust` aborts with user list |
| ZT-P4-16 | Break-glass re-enable audit row written | After successful `enable-trust` | Audit row: `action='break_glass_deactivated'`, `severity='warning'` |
| ZT-P4-17 | Revoke-all audit rows: correct severity | After POST revoke-all | Each revoked device has `severity='critical'`; `reregistration_required` row present |
| ZT-P4-18 | Pre-enable SQL returns 0 before go-live | Before enabling flag | Zero rows — all 7 high_security users have ≥1 activated device |

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
| `POST` | `/api/admin/users/:userId/devices/revoke-all` | `admin-device-routes.ts` | Superuser | TOTP/0 | NEW |
| `GET` | `/api/admin/device-audit-log` | `admin-device-routes.ts` | Superuser | — | NEW |
| `POST` | `/api/login` | `auth.ts` | — | — | MODIFIED |
| `scripts/emergency-recovery.ts` | CLI — not an HTTP route | console | passphrase | — | NEW |

---

## Deviations from Baseline

**None.** All baseline requirements fully implemented in Rev 2 and maintained in Rev 3.

---

## Pre-Approval Checklist

**Rev 2 items:**
- [ ] Trust-token cookie flow (`thermopac.device`) approved
- [ ] Activation endpoint (`GET /api/security/activate-device`) approved
- [ ] Cookie parsing via regex (no `cookie-parser`) approved
- [ ] Login enforcement (block on untrusted device) approved
- [ ] Pre-enable safety checklist (all 7 high_security users must have activated devices) approved
- [ ] 4 new files + 3 modified files scope approved
- [ ] No new npm packages approved
- [ ] Rollback plan (SQL flag toggle) approved
- [ ] T-D01 – T-D12 verification tests approved
- [ ] ZT-P4-01 – ZT-P4-12 zero-trust audit approved

**Rev 3 additions:**
- [ ] Scenario taxonomy (S1–S5) approved
- [ ] Cookie-loss recovery flow (S1) approved — including S1 Special Case temporary bypass
- [ ] Lost/stolen device recovery flow (S2) approved
- [ ] Single Superuser lockout recovery (S3) approved (uses standard admin grant — no new items)
- [ ] Break-glass recovery (`scripts/emergency-recovery.ts`) approved
- [ ] Break-glass: server console + passphrase auth (no TOTP) approved
- [ ] Break-glass: 4-hour maximum bypass window approved
- [ ] Bypass governance (Section 5.5) approved — permitted scenarios, audit requirement, bypass does not invalidate devices
- [ ] Active compromise revoke-all flow (S5) and `POST /api/admin/users/:userId/devices/revoke-all` route approved
- [ ] Forced re-registration implicit flow approved
- [ ] `BREAK_GLASS_PASSPHRASE` secret required (Replit Secrets) approved
- [ ] Audit log action vocabulary (11 action types) approved
- [ ] T-D13 – T-D18 verification tests approved
- [ ] ZT-P4-13 – ZT-P4-18 zero-trust audit approved

---

*Rev 3 — Full baseline compliance. No deviations. All recovery and bypass governance defined. Submit for approval.*
